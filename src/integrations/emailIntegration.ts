// =============================================================================
// Email (Gmail SMTP) Integration Adapter
//
// Validates Gmail credentials via nodemailer's `transporter.verify()` —
// the same SMTP handshake that send_email uses, so a passing probe
// guarantees the next send will work.
//
// No persistent connection (SMTP is per-call). Reset clears the
// failure counter so the next probe is treated fresh.
// =============================================================================

import type { Integration, IntegrationProbe, IntegrationStatusReport } from "./types.js";
import type { AgentContext } from "../types/index.js";
import nodemailer from "nodemailer";

const PROBE_TIMEOUT_MS = 10_000;  // SMTP handshake can be slower than HTTP

function maskPassword(p: string | undefined): string | undefined {
  if (!p) return undefined;
  return "****";  // app passwords are sensitive — never show any chars
}

export class EmailIntegration implements Integration {
  readonly id = "email";
  readonly displayName = "Email (Gmail SMTP)";
  readonly category = "email" as const;

  private _lastSuccessAt: string | null = null;
  private _lastFailureAt: string | null = null;
  private _consecutiveFailures = 0;

  constructor(private context: () => AgentContext | null) {}

  private resolveCredentials(): { user: string; pass: string } | null {
    const ctx = this.context();
    if (!ctx) return null;
    const gmail = ctx.config?.tools?.gmail;
    if (!gmail?.user || !gmail?.appPassword) return null;
    return { user: gmail.user, pass: gmail.appPassword };
  }

  isEnabled(): boolean {
    return this.resolveCredentials() !== null;
  }

  async probe(): Promise<IntegrationProbe> {
    const t0 = Date.now();
    const now = new Date().toISOString();
    const creds = this.resolveCredentials();

    if (!creds) {
      return { ok: true, latencyMs: 0, detail: "Disabled (no Gmail credentials)", ts: now };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: creds.user, pass: creds.pass },
      });

      // Bound the SMTP handshake — Gmail occasionally hangs at the auth step
      const verifyPromise = transporter.verify();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SMTP handshake timeout")), PROBE_TIMEOUT_MS)
      );

      await Promise.race([verifyPromise, timeoutPromise]);
      transporter.close();

      this._lastSuccessAt = now;
      this._consecutiveFailures = 0;
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        detail: `Gmail SMTP verified for ${creds.user}`,
        credentialPreview: maskPassword(creds.pass),
        ts: now,
      };
    } catch (err: any) {
      this._lastFailureAt = now;
      this._consecutiveFailures++;
      const msg = String(err?.message || err);
      // Classify common Gmail SMTP errors
      let errorCategory: IntegrationProbe["errorCategory"] = "unknown";
      if (msg.includes("EAUTH") || msg.includes("535") || msg.includes("Username and Password not accepted")) {
        errorCategory = "auth";
      } else if (msg.includes("timeout") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT")) {
        errorCategory = "network";
      }
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        errorCategory,
        detail: `SMTP error: ${msg.slice(0, 200)}`,
        credentialPreview: maskPassword(creds.pass),
        ts: now,
      };
    }
  }

  getStatus(): IntegrationStatusReport {
    const creds = this.resolveCredentials();
    if (!creds) return { status: "disabled", message: "No Gmail credentials configured" };

    if (this._consecutiveFailures === 0 && this._lastSuccessAt) {
      return {
        status: "connected",
        message: `Gmail SMTP verified for ${creds.user}`,
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: 0,
      };
    }

    if (this._consecutiveFailures > 0) {
      return {
        status: this._consecutiveFailures >= 3 ? "failed" : "degraded",
        message: this._consecutiveFailures >= 3
          ? `${this._consecutiveFailures} consecutive SMTP failures — check App Password`
          : "Recent SMTP probe failed",
        lastFailure: this._lastFailureAt,
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: this._consecutiveFailures,
      };
    }

    return { status: "connecting", message: "Verifying Gmail SMTP…" };
  }

  async reset(): Promise<{ ok: boolean; message: string }> {
    this._consecutiveFailures = 0;
    this._lastFailureAt = null;
    return { ok: true, message: "Email integration reset — next probe will re-verify SMTP." };
  }
}
