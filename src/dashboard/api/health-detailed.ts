// =============================================================================
// GET /api/health/detailed — M3 observability endpoint
//
// Returns an aggregated view of every integration with rolled-up metrics
// over the last 1h (latency p50/p95, call/failure counts) AND the last 24h
// (retry count), plus the recent webhook log and recent failure list used
// by the "Failed actions" table in the Health tab.
//
// The data source is HealthMonitor's rolling 1000-event-per-integration
// FIFO window. No network calls happen inside this handler — it's pure
// in-memory aggregation, safe to call frequently from the UI's auto-refresh.
// =============================================================================

import type { Request, Response } from "express";
import { healthMonitor } from "../../integrations/healthMonitor.js";
import { integrationRegistry } from "../../integrations/registry.js";

const HOUR_MS = 60 * 60_000;
const DAY_MS  = 24 * HOUR_MS;

export async function handleHealthDetailed(_req: Request, res: Response): Promise<void> {
  try {
    // Union of "integrations we know about" (registry) and "integrations we've
    // recorded events for" (health monitor) — the latter catches edge cases
    // where an event was recorded before registration completed.
    const ids = new Set<string>([
      ...integrationRegistry.list().map((i) => i.id),
      ...healthMonitor.knownIntegrationIds(),
    ]);

    const meta = new Map(integrationRegistry.meta().map((m) => [m.id, m]));
    const statuses = integrationRegistry.statusAll();

    const integrations = Array.from(ids).map((id) => {
      const rollup1h  = healthMonitor.rollupMetrics(id, HOUR_MS);
      const rollup24h = healthMonitor.rollupMetrics(id, DAY_MS);
      return {
        id,
        displayName: meta.get(id)?.displayName ?? id,
        category:    meta.get(id)?.category    ?? "other",
        status:      statuses[id] ?? { status: "disabled" },
        lastSuccessTs:    rollup1h.lastSuccessTs,
        lastErrorTs:      rollup1h.lastErrorTs,
        lastErrorMessage: rollup1h.lastErrorMessage,
        // 1h window for latency — short enough to surface regressions
        p50LatencyMs:     Math.round(rollup1h.p50LatencyMs),
        p95LatencyMs:     Math.round(rollup1h.p95LatencyMs),
        callCount1h:      rollup1h.callCount,
        failureCount1h:   rollup1h.failureCount,
        // 24h window for retry count — what "Failed actions" panel needs
        retryCount24h:    rollup24h.retryCount,
        webhookCount24h:  rollup24h.webhookCount,
      };
    });

    // Recent webhook log (newest first, capped at 50 across all integrations).
    const webhookLog: Array<{
      ts: number; integration: string; verified: boolean; source: string; ok: boolean;
    }> = [];
    for (const id of ids) {
      for (const ev of healthMonitor.getEvents(id, { kind: "webhook", windowMs: DAY_MS })) {
        webhookLog.push({
          ts:          ev.ts,
          integration: id,
          verified:    ev.verified !== false,  // default to true when unset
          source:      ev.source ?? "unknown",
          ok:          ev.ok,
        });
      }
    }
    webhookLog.sort((a, b) => b.ts - a.ts);
    const webhookLogTrimmed = webhookLog.slice(0, 50);

    // Recent failed actions (newest first, capped at 20 across all integrations).
    const failures: Array<{
      ts: number; integration: string; error: string; source: string;
    }> = [];
    for (const id of ids) {
      for (const ev of healthMonitor.getEvents(id, { windowMs: DAY_MS })) {
        if (!ev.ok) {
          failures.push({
            ts:          ev.ts,
            integration: id,
            error:       ev.error ?? "(no error message)",
            source:      ev.source ?? ev.kind,
          });
        }
      }
    }
    failures.sort((a, b) => b.ts - a.ts);
    const failuresTrimmed = failures.slice(0, 20);

    res.json({
      generatedAt: new Date().toISOString(),
      integrations,
      webhookLog: webhookLogTrimmed,
      failures:   failuresTrimmed,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
