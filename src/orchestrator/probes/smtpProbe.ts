// =============================================================================
// Real SMTP Probe — Gmail App Password validation via nodemailer.verify()
//
// Performs a STARTTLS + AUTH PLAIN handshake against smtp.gmail.com:587.
// NO email is ever sent. Used by the M2 Google pipeline's `test` step for the
// Gmail App Password path, so we catch invalid credentials BEFORE a save.
//
// Contract:
//   - Returns a StepResult<void> — never throws.
//   - Always closes the transport (in a finally block) — even when verify()
//     throws or the timeout fires.
//   - Fail-fast on empty user/pass BEFORE creating a transport, so we never
//     consume the timeout budget on a clearly-broken input.
//   - Maps nodemailer error codes (EAUTH / ECONNECTION / ETIMEDOUT / EDNS /
//     ESOCKET) to specific user-actionable suggestedFix strings with the
//     exact Google URLs (App Passwords + 2-Step Verification setup).
//   - 10-second default timeout (overridable via opts.timeoutMs for tests).
//
// The default transporterFactory builds a real nodemailer transport — tests
// inject a stub factory so they run offline with deterministic timing.
// =============================================================================

import nodemailer from "nodemailer";
import type { StepResult } from "../types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface SmtpProbeOpts {
  /** Build the SMTP transport. Override in tests to inject a stub. */
  transporterFactory?: (cfg: any) => {
    verify: () => Promise<unknown>;
    close: () => void;
  };
  /** Override the 10s default timeout (tests use small values). */
  timeoutMs?: number;
}

function defaultTransporterFactory(cfg: any) {
  return nodemailer.createTransport(cfg) as unknown as {
    verify: () => Promise<unknown>;
    close: () => void;
  };
}

/**
 * Verify a Gmail App Password by performing a real SMTP handshake against
 * smtp.gmail.com:587. Never throws, never sends an email.
 */
export async function realSmtpProbe(
  user: string,
  pass: string,
  opts: SmtpProbeOpts = {},
): Promise<StepResult<void>> {
  // Fail-fast: short-circuit empty inputs BEFORE creating a transport so we
  // don't consume the timeout budget on obviously broken input.
  if (!user || !user.trim()) {
    return {
      ok: false,
      error: "Gmail user (email address) is empty.",
      suggestedFix: "Provide the full Gmail address (e.g. me@gmail.com).",
      doNotRetry: true,
    };
  }
  if (!pass || !pass.trim()) {
    return {
      ok: false,
      error: "Gmail App Password is empty.",
      suggestedFix:
        "Generate a 16-character App Password at https://myaccount.google.com/apppasswords " +
        "(requires 2-Step Verification — enable at https://myaccount.google.com/signinoptions/twosvauth).",
      doNotRetry: true,
    };
  }

  const factory = opts.transporterFactory ?? defaultTransporterFactory;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let transporter: { verify: () => Promise<unknown>; close: () => void } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    transporter = factory({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: user.trim(), pass: pass.replace(/\s/g, "") },
    });

    // Race verify() against a manual timeout — nodemailer's own socket
    // timeouts can be unreliable on some networks, so we hard-cap here.
    const timeoutPromise = new Promise<"__timeout__">((resolve) => {
      timer = setTimeout(() => resolve("__timeout__"), timeoutMs);
    });

    const result = await Promise.race([
      transporter.verify().then(() => "__ok__" as const).catch((e) => ({ __err: e })),
      timeoutPromise,
    ]);

    if (result === "__timeout__") {
      return {
        ok: false,
        error: `SMTP handshake timed out after ${Math.round(timeoutMs / 1000)}s`,
        suggestedFix:
          "Check internet connection or firewall blocking port 587 (outbound TCP to smtp.gmail.com).",
        doNotRetry: false,
      };
    }

    if (result === "__ok__") {
      return { ok: true, value: undefined };
    }

    // verify() rejected — map nodemailer error code to a user-actionable message.
    return mapNodemailerError((result as { __err: any }).__err);
  } catch (e) {
    // Defensive — should not be reached because verify() errors are caught
    // above, but transporterFactory itself could throw.
    return mapNodemailerError(e);
  } finally {
    if (timer) clearTimeout(timer);
    if (transporter) {
      try {
        transporter.close();
      } catch {
        // Swallow close errors — we already have a primary result.
      }
    }
  }
}

function mapNodemailerError(err: any): StepResult<void> {
  const code: string = String(err?.code ?? "").toUpperCase();
  const message: string = String(err?.message ?? err ?? "");

  if (code === "EAUTH") {
    return {
      ok: false,
      error:
        "Gmail rejected the App Password. The 16-char password is wrong, expired, " +
        "or 2-Step Verification is not enabled on this account.",
      suggestedFix:
        "Generate a new App Password at https://myaccount.google.com/apppasswords " +
        "(requires 2-Step Verification first at https://myaccount.google.com/signinoptions/twosvauth).",
      doNotRetry: true,
    };
  }

  if (
    code === "ECONNECTION" ||
    code === "ETIMEDOUT" ||
    code === "EDNS" ||
    code === "ESOCKET"
  ) {
    return {
      ok: false,
      error: `Could not connect to Gmail SMTP server (${code}).`,
      suggestedFix:
        "Check internet connection or firewall blocking outbound port 587.",
      doNotRetry: false,
    };
  }

  // Unmapped — surface code + message so the user sees something useful.
  const codePart = code ? `${code} ` : "";
  return {
    ok: false,
    error: `SMTP verify failed: ${codePart}${message}`.trim(),
    doNotRetry: true,
  };
}
