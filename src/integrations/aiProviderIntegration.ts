// =============================================================================
// AI Provider Integration Adapter
//
// Third adapter in the Tier 1 migration. Critical because EVERY user
// message goes through the AI provider — a single misconfigured key
// silently breaks every channel at once (which is exactly what hit
// Beta tester: ✓ Telegram + ✓ AI Model badges but 401 on every reply).
//
// Probes the resolved provider+key (uses same resolution logic as
// loader.ts) by hitting /models. Mirrors what the connection-test
// endpoint does but lives in the unified registry so the HealthMonitor
// catches AI auth failures on its regular sweep instead of only on demand.
// =============================================================================

import type { Integration, IntegrationProbe, IntegrationStatusReport } from "./types.js";
import type { AgentContext } from "../types/index.js";
import type { AIProvider } from "../config/models.js";
import { keyCheckRequest } from "../config/providerEndpoints.js";

const PROBE_TIMEOUT_MS = 8_000;

/** Mask a key for logs / UI — first 8 + last 4 chars. */
function maskKey(k: string | undefined): string | undefined {
  if (!k) return undefined;
  return k.length < 14 ? "***" : `${k.slice(0, 8)}…${k.slice(-4)}`;
}

/** Build the canonical /models URL + auth headers for a given provider. */
/** Free, auth-gated key check from the shared endpoint table (Rule 66). */
function buildProviderRequest(provider: string, apiKey: string, ollamaUrl?: string): { url: string; headers: Record<string, string> } {
  return keyCheckRequest(provider as AIProvider, apiKey, { ollamaBaseUrl: ollamaUrl });
}

export class AIProviderIntegration implements Integration {
  readonly id = "ai-provider";
  readonly displayName = "AI Provider";
  readonly category = "ai" as const;

  private _lastSuccessAt: string | null = null;
  private _lastFailureAt: string | null = null;
  private _consecutiveFailures = 0;
  private _activeProvider: string | null = null;
  private _activeKeySource: "user" | "operator" | "missing" = "missing";

  constructor(private context: () => AgentContext | null) {}

  // ── isEnabled ─────────────────────────────────────────────────────────────
  // AI provider is ALWAYS enabled — without one, the agent can't function.
  // This integration is mandatory.
  isEnabled(): boolean {
    return true;
  }

  // ── probe ─────────────────────────────────────────────────────────────────
  async probe(): Promise<IntegrationProbe> {
    const t0 = Date.now();
    const now = new Date().toISOString();
    const ctx = this.context();
    if (!ctx) {
      return {
        ok: false, latencyMs: 0,
        errorCategory: "config",
        detail: "Agent context not yet available",
        ts: now,
      };
    }

    // Resolve the active provider+key (matches loader.ts resolution)
    const userProvider = ctx.config.provider;
    const userKey = ctx.config.apiKeys?.[userProvider];

    let activeProvider = userProvider;
    let activeKey = userKey;
    this._activeKeySource = "user";

    if (userProvider === "ollama") {
      // Local AI: no key, and never probe a cloud provider on its behalf —
      // just check that the local AI on this computer is running.
      this._activeKeySource = "user";
    } else if (!activeKey || !activeKey.trim()) {
      // Try operator fallback (loader.ts also does this)
      const operatorKey = (process.env.VOUZA_API_KEY || "").trim();
      const operatorProvider = (process.env.VOUZA_API_PROVIDER || "openrouter");
      if (operatorKey) {
        activeProvider = operatorProvider as any;
        activeKey = operatorKey;
        this._activeKeySource = "operator";
      } else {
        this._activeKeySource = "missing";
        this._lastFailureAt = now;
        this._consecutiveFailures++;
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          errorCategory: "config",
          detail: "No API key configured — neither user nor operator (VOUZA_API_KEY env) key is set",
          ts: now,
        };
      }
    }

    this._activeProvider = activeProvider;
    const { url, headers } = buildProviderRequest(activeProvider, activeKey, ctx.config.ollamaBaseUrl);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

    try {
      const r = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(t);

      if (!r.ok) {
        const body = await r.text().catch(() => "");
        let errorCategory: IntegrationProbe["errorCategory"] = "unknown";
        if (r.status === 401 || r.status === 403) errorCategory = "auth";
        else if (r.status === 402)                 errorCategory = "quota";
        else if (r.status === 429)                 errorCategory = "rate_limit";
        else if (r.status >= 500)                  errorCategory = "network";
        this._lastFailureAt = now;
        this._consecutiveFailures++;
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          errorCategory,
          detail: `HTTP ${r.status}: ${body.slice(0, 200) || r.statusText}`,
          credentialPreview: maskKey(activeKey),
          ts: now,
        };
      }

      // Optionally parse the response for richer detail (count models available)
      let modelCount: number | undefined;
      try {
        const data = await r.json() as any;
        if (Array.isArray(data?.data)) modelCount = data.data.length;
        else if (Array.isArray(data?.models)) modelCount = data.models.length;
      } catch { /* non-JSON response — that's fine, just no model count */ }

      this._lastSuccessAt = now;
      this._consecutiveFailures = 0;
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        detail: modelCount !== undefined
          ? `${activeProvider} reachable — ${modelCount} models available (${this._activeKeySource} key)`
          : `${activeProvider} reachable (${this._activeKeySource} key)`,
        credentialPreview: maskKey(activeKey),
        ts: now,
      };
    } catch (err: any) {
      clearTimeout(t);
      this._lastFailureAt = now;
      this._consecutiveFailures++;
      const msg = String(err?.message || err);
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        errorCategory: "network",
        detail: `Network error reaching ${activeProvider}: ${msg.slice(0, 150)}`,
        credentialPreview: maskKey(activeKey),
        ts: now,
      };
    }
  }

  // ── getStatus ─────────────────────────────────────────────────────────────
  getStatus(): IntegrationStatusReport {
    const ctx = this.context();
    if (!ctx) return { status: "unconfigured", message: "Agent not yet booted" };

    // Determine which key source is in play right now (without making a request)
    const userProvider = ctx.config.provider;
    const userKey = ctx.config.apiKeys?.[userProvider];
    const hasOperator = !!(process.env.VOUZA_API_KEY || "").trim();

    if ((!userKey || !userKey.trim()) && !hasOperator) {
      return {
        status: "unconfigured",
        message: "No API key — neither user nor operator key set",
      };
    }

    if (this._lastSuccessAt && this._consecutiveFailures === 0) {
      const provider = this._activeProvider || userProvider;
      return {
        status: "connected",
        message: `${provider} verified (${this._activeKeySource} key)`,
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: 0,
      };
    }

    if (this._consecutiveFailures > 0) {
      return {
        status: this._consecutiveFailures >= 3 ? "failed" : "degraded",
        message: this._consecutiveFailures >= 3
          ? `${this._consecutiveFailures} consecutive probe failures — check API key`
          : "Recent probe failed",
        lastFailure: this._lastFailureAt,
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: this._consecutiveFailures,
      };
    }

    // Has a key but never probed yet (just booted)
    return { status: "connecting", message: "Verifying API key…" };
  }

  // ── reset ─────────────────────────────────────────────────────────────────
  // AI provider has no "session state" to wipe — just clear our internal
  // counters so the next probe is treated as fresh. The agent will pick
  // up any config changes on the next message loop iteration anyway.
  async reset(): Promise<{ ok: boolean; message: string }> {
    this._consecutiveFailures = 0;
    this._lastFailureAt = null;
    return {
      ok: true,
      message: "AI provider state cleared. The next probe will re-verify against the resolved key.",
    };
  }

  // ── Useful introspection for the dashboard ────────────────────────────────
  getActiveKeySource(): "user" | "operator" | "missing" {
    return this._activeKeySource;
  }

  getActiveProvider(): string | null {
    return this._activeProvider;
  }
}
