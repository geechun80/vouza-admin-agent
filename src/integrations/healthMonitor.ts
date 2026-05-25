// =============================================================================
// HealthMonitor — periodic background probes for every integration
//
// PROBLEM this solves:
//   The UI currently shows "✓ Connected" based on field presence, not
//   actual liveness. Aerick saw ✓ AI Model and ✓ Telegram but the bot
//   still returned 401 because nobody had ACTUALLY verified the key worked.
//
// SOLUTION:
//   Background loop runs every PROBE_INTERVAL_MS, calls probe() on every
//   registered integration in parallel. Updates a shared probe history.
//   The dashboard reads the history (instead of running its own one-shot
//   tests) so badges reflect real liveness.
//
//   Also: auto-recovery for known patterns. If WhatsApp Baileys fails N
//   consecutive probes, auto-call its reset() to wipe stale auth + retry.
//   No user intervention needed for the most common failure mode.
// =============================================================================

import { integrationRegistry } from "./registry.js";
import type { IntegrationProbe } from "./types.js";
import { logger } from "../util/logger.js";

const PROBE_INTERVAL_MS    = 60_000;  // 60s between full sweeps
const AUTO_RESET_AFTER     = 3;       // consecutive failures before auto-reset
const RECENT_WINDOW_MS     = 60 * 60_000; // 1 hour rolling window

interface ProbeHistoryEntry {
  probe:  IntegrationProbe;
  ts:     number;
}

class HealthMonitor {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  // Per-integration probe history (most recent first, capped at 50 entries).
  private history: Map<string, ProbeHistoryEntry[]> = new Map();
  // Per-integration consecutive failure count (resets on first success).
  private consecutiveFailures: Map<string, number> = new Map();
  // Per-integration last reset attempt time (rate-limit auto-recovery to once per 5 min).
  private lastAutoReset: Map<string, number> = new Map();

  /** Start the background probe loop. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info({ event: "health_monitor_start", intervalMs: PROBE_INTERVAL_MS }, "Background health monitor started");
    // Probe once immediately so the dashboard has fresh data on first load
    this.probeAll().catch(() => {});
    this.timer = setInterval(() => {
      this.probeAll().catch((err) => {
        logger.warn({ event: "health_monitor_loop_error", err: String(err) }, "Health monitor loop error (continuing)");
      });
    }, PROBE_INTERVAL_MS);
    // Don't keep the process alive purely for probes
    if (this.timer.unref) this.timer.unref();
  }

  /** Stop the background loop (e.g. on agent shutdown). */
  stop(): void {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    logger.info({ event: "health_monitor_stop" }, "Background health monitor stopped");
  }

  /**
   * Probe every registered integration once. Records results to history.
   * Triggers auto-recovery for repeatedly-failing integrations.
   */
  async probeAll(): Promise<void> {
    const probes = await integrationRegistry.probeAll();
    const now = Date.now();

    for (const [id, probe] of probes.entries()) {
      // Append to per-integration history (cap at 50 entries — sliding window)
      const hist = this.history.get(id) ?? [];
      hist.unshift({ probe, ts: now });
      if (hist.length > 50) hist.length = 50;
      this.history.set(id, hist);

      // Track consecutive failures for auto-reset trigger
      if (probe.ok) {
        const prevFailures = this.consecutiveFailures.get(id) ?? 0;
        if (prevFailures > 0) {
          logger.info(
            { event: "integration_recovered", id, prevFailures, latencyMs: probe.latencyMs },
            `Integration recovered: ${id}`
          );
        }
        this.consecutiveFailures.set(id, 0);
      } else {
        const failures = (this.consecutiveFailures.get(id) ?? 0) + 1;
        this.consecutiveFailures.set(id, failures);
        logger.warn(
          { event: "integration_probe_failed", id, failures, errorCategory: probe.errorCategory, detail: probe.detail },
          `Integration probe failed: ${id} (${failures} consecutive)`
        );

        // Auto-recovery trigger — only attempt once per 5 minutes per integration
        if (failures >= AUTO_RESET_AFTER) {
          const lastReset = this.lastAutoReset.get(id) ?? 0;
          if (now - lastReset > 5 * 60_000) {
            this.lastAutoReset.set(id, now);
            await this.attemptAutoReset(id);
          }
        }
      }
    }
  }

  /**
   * Auto-reset an integration after repeated failures. Only triggered for
   * error categories where reset is known to help (stale_session, network).
   * Auth/config failures are NOT auto-reset — the user must fix them.
   */
  private async attemptAutoReset(id: string): Promise<void> {
    const latest = this.history.get(id)?.[0]?.probe;
    if (!latest) return;
    // Only auto-reset for known-recoverable failure modes
    const recoverable = ["stale_session", "network", "rate_limit"];
    if (!latest.errorCategory || !recoverable.includes(latest.errorCategory)) {
      logger.info(
        { event: "integration_auto_reset_skipped", id, errorCategory: latest.errorCategory },
        `Auto-reset skipped for ${id} — error category not auto-recoverable`
      );
      return;
    }
    logger.warn({ event: "integration_auto_reset_attempt", id }, `Attempting auto-reset of ${id}`);
    const result = await integrationRegistry.reset(id);
    logger.warn(
      { event: "integration_auto_reset_result", id, ok: result.ok, message: result.message },
      result.ok ? `Auto-reset succeeded: ${id}` : `Auto-reset failed: ${id}`
    );
    // Reset failure counter so we don't loop forever — the next probe will tell us
    // whether the reset actually fixed things
    this.consecutiveFailures.set(id, 0);
  }

  /** Get the most recent probe for a single integration. */
  getLastProbe(id: string): IntegrationProbe | undefined {
    return this.history.get(id)?.[0]?.probe;
  }

  /**
   * Aggregated snapshot for the dashboard — combines history + current status
   * from each integration. Read-only; no network calls.
   */
  snapshot(): Record<string, {
    status:              ReturnType<typeof integrationRegistry.statusAll>[string];
    lastProbe?:          IntegrationProbe;
    consecutiveFailures: number;
    recentProbeCount:    number;
    recentFailureCount:  number;
  }> {
    const statuses = integrationRegistry.statusAll();
    const now = Date.now();
    const out: ReturnType<typeof this.snapshot> = {};
    for (const [id, status] of Object.entries(statuses)) {
      const hist = this.history.get(id) ?? [];
      const recentWindow = hist.filter((h) => now - h.ts < RECENT_WINDOW_MS);
      out[id] = {
        status,
        lastProbe: hist[0]?.probe,
        consecutiveFailures: this.consecutiveFailures.get(id) ?? 0,
        recentProbeCount:    recentWindow.length,
        recentFailureCount:  recentWindow.filter((h) => !h.probe.ok).length,
      };
    }
    return out;
  }

  /** Used by tests. */
  __clearForTests(): void {
    this.history.clear();
    this.consecutiveFailures.clear();
    this.lastAutoReset.clear();
  }
}

/** Singleton — one health monitor per agent process. */
export const healthMonitor = new HealthMonitor();
