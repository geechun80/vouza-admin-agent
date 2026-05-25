// =============================================================================
// Telegram Integration Adapter
//
// Second adapter in the Tier 1 migration. Validates the Integration contract
// works for HTTP-polling-based integrations (different from Baileys' WebSocket).
//
// Telegram has two modes:
//   - Long-polling (default for local installs): GET getUpdates every ~30s
//   - Webhook (cloud deploys): Telegram POSTs to our public URL
//
// The adapter probes by calling getMe — same endpoint setupValidator uses.
// This catches revoked / changed / wrong-format bot tokens at probe time,
// not 30 seconds later when the user sends a message and gets no reply.
// =============================================================================

import type { Integration, IntegrationProbe, IntegrationStatusReport } from "./types.js";
import {
  startTelegramListener,
  stopTelegramListener,
  getTelegramListenerState,
} from "../telegram/listener.js";
import type { AgentContext } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";

const TELEGRAM_API = "https://api.telegram.org/bot";
const PROBE_TIMEOUT_MS = 6_000;

/** Mask a long secret for logs / UI — first 6 + last 4 chars. */
function maskToken(t: string | undefined): string | undefined {
  if (!t) return undefined;
  return t.length < 12 ? "***" : `${t.slice(0, 6)}…${t.slice(-4)}`;
}

export class TelegramIntegration implements Integration {
  readonly id = "telegram";
  readonly displayName = "Telegram Bot";
  readonly category = "messaging" as const;

  private _lastSuccessAt: string | null = null;
  private _lastFailureAt: string | null = null;
  private _consecutiveFailures = 0;
  private _botUsername: string | null = null;

  constructor(
    private context: () => AgentContext | null,
    private registry: () => ToolRegistry | null,
  ) {}

  // ── isEnabled ─────────────────────────────────────────────────────────────
  isEnabled(): boolean {
    const ctx = this.context();
    return !!(ctx?.config?.tools?.telegram?.botToken);
  }

  // ── probe ─────────────────────────────────────────────────────────────────
  // Live HTTP call to Telegram getMe. Classifies failures:
  //   - 401  → auth (bad token, user must fix)
  //   - 404  → auth (bot deleted)
  //   - network/timeout → network (auto-recover)
  //   - everything else → unknown
  async probe(): Promise<IntegrationProbe> {
    const t0 = Date.now();
    const now = new Date().toISOString();
    const ctx = this.context();
    const token = ctx?.config?.tools?.telegram?.botToken;

    if (!token) {
      return {
        ok: true, latencyMs: 0,
        detail: "Disabled (no bot token configured)",
        ts: now,
      };
    }

    // AbortController-based timeout — Telegram getMe usually responds in
    // <500ms; >6s means something is wrong with our network or theirs.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const r = await fetch(`${TELEGRAM_API}${token}/getMe`, { signal: ctrl.signal });
      clearTimeout(t);

      if (!r.ok) {
        const body = await r.text().catch(() => "");
        let errorCategory: IntegrationProbe["errorCategory"] = "unknown";
        if (r.status === 401 || r.status === 404) errorCategory = "auth";
        else if (r.status === 429)                errorCategory = "rate_limit";
        else if (r.status >= 500)                 errorCategory = "network";
        this._lastFailureAt = now;
        this._consecutiveFailures++;
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          errorCategory,
          detail: `HTTP ${r.status}: ${body.slice(0, 150) || r.statusText}`,
          credentialPreview: maskToken(token),
          ts: now,
        };
      }

      const data = await r.json().catch(() => ({ ok: false, description: "non-JSON response" })) as any;
      if (!data.ok) {
        this._lastFailureAt = now;
        this._consecutiveFailures++;
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          errorCategory: "auth",
          detail: `Telegram rejected: ${data.description}`,
          credentialPreview: maskToken(token),
          ts: now,
        };
      }

      // Cache the username for getStatus()
      this._botUsername = data.result?.username || null;
      this._lastSuccessAt = now;
      this._consecutiveFailures = 0;

      // Also verify the LISTENER is actually running — bot token works but
      // if neither polling nor webhook is active, messages won't be delivered
      const state = getTelegramListenerState();
      if (!state.pollingActive && !state.webhookActive) {
        return {
          ok: false,
          latencyMs: Date.now() - t0,
          errorCategory: "config",
          detail: `Token valid (@${this._botUsername}) but listener NOT running — messages won't be delivered`,
          credentialPreview: maskToken(token),
          ts: now,
        };
      }

      const mode = state.webhookActive ? "webhook" : "polling";
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        detail: `@${this._botUsername} live (${mode} mode)`,
        credentialPreview: maskToken(token),
        ts: now,
      };
    } catch (err: any) {
      clearTimeout(t);
      this._lastFailureAt = now;
      this._consecutiveFailures++;
      const msg = String(err?.message || err);
      let errorCategory: IntegrationProbe["errorCategory"] = "network";
      if (msg.includes("aborted") || msg.includes("timeout")) errorCategory = "network";
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        errorCategory,
        detail: `Network error reaching Telegram: ${msg.slice(0, 150)}`,
        credentialPreview: maskToken(token),
        ts: now,
      };
    }
  }

  // ── getStatus ─────────────────────────────────────────────────────────────
  getStatus(): IntegrationStatusReport {
    const ctx = this.context();
    const token = ctx?.config?.tools?.telegram?.botToken;
    if (!token) return { status: "disabled", message: "No Telegram bot configured" };

    const state = getTelegramListenerState();

    // Listener not running yet (startup race, or it failed to start)
    if (!state.pollingActive && !state.webhookActive) {
      // If we've never probed successfully, we're either still booting or
      // the token is rejected. Treat as "connecting" until first probe.
      if (this._lastSuccessAt === null && this._lastFailureAt === null) {
        return { status: "connecting", message: "Starting Telegram listener…" };
      }
      return {
        status: "failed",
        message: "Listener not running — check logs for startup errors",
        lastFailure: this._lastFailureAt,
        consecutiveFailures: this._consecutiveFailures,
      };
    }

    // Listener is running. Has the last probe succeeded?
    if (this._consecutiveFailures === 0 && this._lastSuccessAt) {
      const mode = state.webhookActive ? "webhook" : "long-polling";
      return {
        status: "connected",
        message: this._botUsername
          ? `@${this._botUsername} live (${mode} mode)`
          : `Listener running (${mode} mode)`,
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: 0,
      };
    }

    return {
      status: "degraded",
      message: this._consecutiveFailures >= 3
        ? `${this._consecutiveFailures} consecutive probe failures — token may be invalid`
        : `Recent probe failed — investigating`,
      lastFailure: this._lastFailureAt,
      lastSuccess: this._lastSuccessAt,
      consecutiveFailures: this._consecutiveFailures,
    };
  }

  // ── reset ─────────────────────────────────────────────────────────────────
  // Stops and restarts the listener. Useful when:
  //   - Webhook URL changed but Telegram still has the old one cached
  //   - Polling got stuck (rare but happens with long-lived processes)
  //   - User changed the bot token
  async reset(): Promise<{ ok: boolean; message: string }> {
    try {
      stopTelegramListener();
      // Brief pause for the polling loop to actually exit
      await new Promise((r) => setTimeout(r, 500));

      const ctx = this.context();
      const reg = this.registry();
      if (!ctx || !reg) {
        return { ok: false, message: "Cannot restart: agent context not available" };
      }

      await startTelegramListener(ctx, reg);
      // Clear our internal failure counter so the next probe starts fresh
      this._consecutiveFailures = 0;
      return {
        ok: true,
        message: "Telegram listener restarted. Send a message to your bot to verify.",
      };
    } catch (err) {
      return { ok: false, message: `Reset failed: ${String(err).slice(0, 200)}` };
    }
  }
}
