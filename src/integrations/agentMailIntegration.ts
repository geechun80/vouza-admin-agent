// =============================================================================
// AgentMail Integration Adapter
//
// AgentMail provides each agent with a dedicated inbox (e.g.
// `my-agent@agentmail.to`). The listener polls AgentMail's API for new
// messages periodically. This adapter probes the API liveness + checks
// that the polling loop is actually running.
// =============================================================================

import type { Integration, IntegrationProbe, IntegrationStatusReport } from "./types.js";
import type { AgentContext } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import {
  startAgentMailListener,
  stopAgentMailListener,
  isAgentMailPolling,
  getAgentMailInbox,
} from "../email/agentMailListener.js";

const PROBE_TIMEOUT_MS = 7_000;

function maskKey(k: string | undefined): string | undefined {
  if (!k) return undefined;
  return k.length < 12 ? "***" : `${k.slice(0, 6)}…${k.slice(-4)}`;
}

export class AgentMailIntegration implements Integration {
  readonly id = "agentmail";
  readonly displayName = "AgentMail (dedicated inbox)";
  readonly category = "email" as const;

  private _lastSuccessAt: string | null = null;
  private _lastFailureAt: string | null = null;
  private _consecutiveFailures = 0;

  constructor(
    private context: () => AgentContext | null,
    private registry: () => ToolRegistry | null,
  ) {}

  isEnabled(): boolean {
    const ctx = this.context();
    return !!(ctx?.config?.tools?.agentmail?.apiKey);
  }

  async probe(): Promise<IntegrationProbe> {
    const t0 = Date.now();
    const now = new Date().toISOString();
    const ctx = this.context();
    const apiKey = ctx?.config?.tools?.agentmail?.apiKey;

    if (!apiKey) {
      return { ok: true, latencyMs: 0, detail: "Disabled (no AgentMail key)", ts: now };
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

    try {
      // /v0/inboxes is the canonical liveness endpoint — returns 200 with the
      // user's inboxes list when the key is valid
      const r = await fetch("https://api.agentmail.to/v0/inboxes", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (!r.ok) {
        const body = await r.text().catch(() => "");
        let errorCategory: IntegrationProbe["errorCategory"] = "unknown";
        if (r.status === 401 || r.status === 403) errorCategory = "auth";
        else if (r.status === 429)                 errorCategory = "rate_limit";
        else if (r.status >= 500)                  errorCategory = "network";
        this._lastFailureAt = now;
        this._consecutiveFailures++;
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          errorCategory,
          detail: `HTTP ${r.status}: ${body.slice(0, 150) || r.statusText}`,
          credentialPreview: maskKey(apiKey),
          ts: now,
        };
      }

      // Verify the polling loop is actually running — without it, new mail
      // never reaches the agent even though the API key is valid
      if (!isAgentMailPolling()) {
        this._lastFailureAt = now;
        this._consecutiveFailures++;
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          errorCategory: "config",
          detail: "API key valid but listener NOT polling — incoming mail won't reach the agent",
          credentialPreview: maskKey(apiKey),
          ts: now,
        };
      }

      const inbox = getAgentMailInbox();
      this._lastSuccessAt = now;
      this._consecutiveFailures = 0;
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        detail: inbox ? `Polling ${inbox.email}` : "AgentMail API reachable",
        credentialPreview: maskKey(apiKey),
        ts: now,
      };
    } catch (err: any) {
      clearTimeout(t);
      this._lastFailureAt = now;
      this._consecutiveFailures++;
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        errorCategory: "network",
        detail: `Network error: ${String(err?.message || err).slice(0, 150)}`,
        credentialPreview: maskKey(apiKey),
        ts: now,
      };
    }
  }

  getStatus(): IntegrationStatusReport {
    const ctx = this.context();
    const apiKey = ctx?.config?.tools?.agentmail?.apiKey;
    if (!apiKey) return { status: "disabled", message: "No AgentMail key configured" };

    if (!isAgentMailPolling() && !this._lastSuccessAt && !this._lastFailureAt) {
      return { status: "connecting", message: "Starting AgentMail listener…" };
    }

    if (this._consecutiveFailures === 0 && this._lastSuccessAt) {
      const inbox = getAgentMailInbox();
      return {
        status: "connected",
        message: inbox ? `Polling ${inbox.email}` : "AgentMail reachable",
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: 0,
      };
    }

    return {
      status: this._consecutiveFailures >= 3 ? "failed" : "degraded",
      message: this._consecutiveFailures >= 3
        ? `${this._consecutiveFailures} consecutive failures — check API key`
        : "Recent probe failed",
      lastFailure: this._lastFailureAt,
      lastSuccess: this._lastSuccessAt,
      consecutiveFailures: this._consecutiveFailures,
    };
  }

  async reset(): Promise<{ ok: boolean; message: string }> {
    try {
      stopAgentMailListener();
      await new Promise((r) => setTimeout(r, 500));
      const ctx = this.context();
      const reg = this.registry();
      if (!ctx || !reg) return { ok: false, message: "Cannot restart: agent context not available" };
      await startAgentMailListener(ctx, reg);
      this._consecutiveFailures = 0;
      return { ok: true, message: "AgentMail listener restarted." };
    } catch (err) {
      return { ok: false, message: `Reset failed: ${String(err).slice(0, 200)}` };
    }
  }
}
