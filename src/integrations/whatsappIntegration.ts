// =============================================================================
// WhatsApp (Baileys) Integration Adapter
//
// First adapter implementing the unified Integration contract. Proves the
// pattern works for the hardest case: a long-lived WebSocket connection
// with multiple stuck-states ("connecting" forever, stale auth, 4-device
// limit reached). Once this works cleanly under the HealthMonitor + auto-
// recovery, the rest of the integrations are straightforward to migrate.
// =============================================================================

import type { Integration, IntegrationProbe, IntegrationStatusReport } from "./types.js";
import {
  isBaileysConnected,
  getLastBaileysStatus,
  resetBaileysAuth,
} from "../whatsapp/baileysManager.js";
import type { AgentContext } from "../types/index.js";

export class WhatsAppIntegration implements Integration {
  readonly id = "whatsapp";
  readonly displayName = "WhatsApp (Baileys)";
  readonly category = "messaging" as const;

  private _lastSuccessAt: string | null = null;
  private _lastFailureAt: string | null = null;
  private _consecutiveFailures = 0;
  // First time we observed the integration as "connecting" — used to detect
  // a stuck-in-connecting state (the exact failure mode Aerick hit).
  private _connectingSince: number | null = null;

  constructor(private context: () => AgentContext | null) {}

  // ── isEnabled ─────────────────────────────────────────────────────────────
  isEnabled(): boolean {
    const ctx = this.context();
    if (!ctx) return false;
    const wa = (ctx.config as any).tools?.whatsapp;
    // Enabled when the user picked "web" (Baileys) — other providers
    // (WAHA / Twilio / Meta Cloud) get their own adapters later
    return !!wa && (wa.provider === "web" || !wa.provider);
  }

  // ── probe ─────────────────────────────────────────────────────────────────
  //
  // For Baileys we don't make an external HTTP request — the integration IS
  // the WebSocket connection. We treat the cached `isBaileysConnected()`
  // boolean PLUS the worker's last reported status as the probe signal.
  //
  // Special handling: if we've been "connecting" for >2 minutes, treat as
  // stale_session (Baileys' websocket handshake never completed → known
  // pattern that the auto-recovery resolves by resetting auth).
  async probe(): Promise<IntegrationProbe> {
    const t0 = Date.now();
    const now = new Date().toISOString();

    if (!this.isEnabled()) {
      return {
        ok: true, latencyMs: Date.now() - t0,
        detail: "Disabled (not in user config)",
        ts: now,
      };
    }

    const last = getLastBaileysStatus();
    const connected = isBaileysConnected();

    // Reset the connecting-since timer when we transition out of "connecting"
    if (last !== "connecting") {
      this._connectingSince = null;
    } else if (this._connectingSince === null) {
      this._connectingSince = Date.now();
    }

    if (connected) {
      this._lastSuccessAt = now;
      this._consecutiveFailures = 0;
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        detail: "Linked to WhatsApp — messages will be handled by the AI",
        ts: now,
      };
    }

    // Not connected — categorize WHY for the health monitor's auto-recovery
    let errorCategory: IntegrationProbe["errorCategory"] = "unknown";
    let detail = "Not linked";

    switch (last) {
      case null:
        // Listener never started — probably first launch before the user
        // clicked Connect. Don't flag this as a failure.
        return {
          ok: true,
          latencyMs: Date.now() - t0,
          detail: "Ready to connect — click Connect WhatsApp to generate a QR code",
          ts: now,
        };
      case "connecting": {
        const dur = this._connectingSince ? Date.now() - this._connectingSince : 0;
        // Stuck in connecting state for > 2 minutes = stale_session pattern.
        // Auto-recovery wipes auth + restarts → almost always resolves it.
        if (dur > 2 * 60_000) {
          errorCategory = "stale_session";
          detail = `Stuck in "connecting" state for ${Math.round(dur / 1000)}s — likely stale auth`;
        } else {
          // Recently started connecting — give it more time, don't count as failure
          return {
            ok: true, latencyMs: Date.now() - t0,
            detail: `Connecting (${Math.round(dur / 1000)}s elapsed)`,
            ts: now,
          };
        }
        break;
      }
      case "qr_ready":
        // QR is displayed and waiting for user scan. Not a failure — user
        // action required.
        return {
          ok: true, latencyMs: Date.now() - t0,
          detail: "QR code ready — waiting for user to scan",
          ts: now,
        };
      case "disconnected":
        errorCategory = "network";
        detail = "Disconnected — auto-reconnect should engage";
        break;
      case "logged_out":
        // User unlinked from their phone OR WhatsApp invalidated the device
        // (e.g. 4-device limit, suspicious activity). Auto-reset won't fix
        // this — user must re-scan QR.
        errorCategory = "config";
        detail = "Logged out — user must re-scan QR (or check WhatsApp linked devices)";
        break;
    }

    this._lastFailureAt = now;
    this._consecutiveFailures++;
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      errorCategory,
      detail,
      ts: now,
    };
  }

  // ── getStatus ─────────────────────────────────────────────────────────────
  getStatus(): IntegrationStatusReport {
    if (!this.isEnabled()) {
      return { status: "disabled", message: "WhatsApp not enabled in config" };
    }
    const last = getLastBaileysStatus();
    const connected = isBaileysConnected();

    if (connected) {
      return {
        status: "connected",
        message: "Linked and handling messages",
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: 0,
      };
    }
    if (last === "qr_ready") {
      return {
        status: "connecting",
        message: "QR code ready — waiting for scan",
      };
    }
    if (last === "connecting") {
      const dur = this._connectingSince ? Date.now() - this._connectingSince : 0;
      return {
        status: dur > 2 * 60_000 ? "failed" : "connecting",
        message: dur > 2 * 60_000
          ? `Stuck in "connecting" state for ${Math.round(dur / 1000)}s`
          : `Connecting (${Math.round(dur / 1000)}s)`,
        consecutiveFailures: this._consecutiveFailures,
      };
    }
    if (last === "logged_out") {
      return {
        status: "failed",
        message: "Logged out — re-scan QR to reconnect",
        lastFailure: this._lastFailureAt,
        consecutiveFailures: this._consecutiveFailures,
      };
    }
    if (last === "disconnected") {
      return {
        status: "degraded",
        message: "Disconnected — auto-reconnect in progress",
        lastFailure: this._lastFailureAt,
        consecutiveFailures: this._consecutiveFailures,
      };
    }
    return {
      status: "unconfigured",
      message: "Not yet started — click Connect WhatsApp to begin",
    };
  }

  // ── reset ─────────────────────────────────────────────────────────────────
  // Wipes the cached Baileys auth dir + restarts the worker. This is the
  // exact pattern that fixes Aerick-style "stuck in connecting" + stale
  // QR issues. Safe to call when not currently connected.
  async reset(): Promise<{ ok: boolean; message: string }> {
    try {
      await resetBaileysAuth();
      // Clear our internal counters so the next probe starts fresh
      this._connectingSince = null;
      this._consecutiveFailures = 0;
      return {
        ok: true,
        message: "WhatsApp auth reset — open the WhatsApp card and click Connect to scan a fresh QR",
      };
    } catch (err) {
      return { ok: false, message: `Reset failed: ${String(err).slice(0, 200)}` };
    }
  }
}
