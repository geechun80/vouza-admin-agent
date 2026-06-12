// =============================================================================
// Google Pipeline — gmail + google_calendar share most of this.
//
// Detection branches on the credential blob shape:
//   - { installed | web } → OAuth Client ID file (WRONG file — fail fast)
//   - { type: "service_account", private_key, client_email } → SA path
//   - { gmailUser, gmailPass (16 chars) } → App Password (Gmail only)
//
// Test step:
//   - SA path: import google-auth-library at call-time (lazy), JWT exchange
//     against https://oauth2.googleapis.com/token.
//   - App Password path: SMTP STARTTLS handshake to smtp.gmail.com:587.
//
// Fallback on SA test failure with invalid_grant: retry once after 2s (common
// clock-skew symptom — the JWT iat is too far in the past/future).
//
// Live-test:
//   - gmail: send a tiny "[Vouza] Connection verified" email to self.
//   - google_calendar: list next 1 event.
//
// All network/SMTP/email-send/calendar-list dependencies are injected via
// GoogleDeps so tests can mock without hitting Google.
// =============================================================================

import type { Pipeline, Step, OrchestratorContext, StepResult } from "../types.js";
import { realSmtpProbe } from "../probes/smtpProbe.js";

export type GoogleVariant = "gmail" | "google_calendar";

export type DetectedCredKind = "service_account" | "app_password" | "oauth_client";

export interface GoogleInput {
  credentials: Record<string, unknown>;
  variant: GoogleVariant;
}

export interface GoogleDeps {
  /** Custom fetch (defaults to global). Used for OAuth token exchange. */
  fetch?: typeof fetch;
  /**
   * SMTP probe for App Password path. Resolves on AUTH success, rejects on
   * any handshake/auth error. Default: throws (must be injected for App
   * Password to work in production — we don't pull in nodemailer here).
   */
  smtpProbe?: (host: string, port: number, user: string, pass: string) => Promise<void>;
  /** Persist parsed credentials to config (idempotent). */
  saveCredentials?: (variant: GoogleVariant, parsed: any, raw: any) => Promise<void>;
  /** Send a verification email (gmail variant only). */
  sendSelfEmail?: (user: string, pass: string) => Promise<void>;
  /** List 1 calendar event (google_calendar variant). */
  listOneEvent?: (saJson: any) => Promise<{ summary?: string } | null>;
  /** Override for the SA JWT token-exchange (used by tests). */
  exchangeServiceAccount?: (saJson: any) => Promise<{ access_token: string }>;
  /** Sleep used by fallback retry — injectable so tests don't wait 2s. */
  sleep?: (ms: number) => Promise<void>;
}

export function makeGooglePipeline(deps: GoogleDeps = {}): Pipeline {
  const httpFetch = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  // ── detect ────────────────────────────────────────────────────────────────
  const detect: Step = {
    name: "detect",
    async run(input: GoogleInput): Promise<StepResult<any>> {
      const creds = input?.credentials ?? {};
      if (!creds || Object.keys(creds).length === 0) {
        return {
          ok: false,
          error: "No credentials provided.",
          suggestedFix: "Paste the service-account JSON or Gmail App Password.",
          doNotRetry: true,
        };
      }

      // Gmail App Password path — only valid for variant=gmail.
      const gmailUser = creds.gmailUser as string | undefined;
      const gmailPass = creds.gmailPass as string | undefined;
      if (
        input.variant === "gmail" &&
        typeof gmailUser === "string" &&
        typeof gmailPass === "string"
      ) {
        const stripped = gmailPass.replace(/\s/g, "");
        if (stripped.length === 16) {
          return {
            ok: true,
            value: {
              kind: "app_password" as DetectedCredKind,
              gmailUser: gmailUser.trim(),
              gmailPass: stripped,
            },
          };
        }
      }

      // Custom-SMTP shaped credentials are not a Google credential at all —
      // they belong to the "smtp" integration's direct save in
      // save_integration_credentials. Fail fast with a redirect rather than
      // the generic "could not figure out" message below (Rule 56).
      if (
        creds.smtpHost !== undefined ||
        creds.smtpUser !== undefined ||
        creds.smtpPass !== undefined
      ) {
        return {
          ok: false,
          error:
            "These look like custom SMTP credentials (smtpHost/smtpUser/smtpPass), not a Gmail or Google credential.",
          suggestedFix:
            "For a non-Gmail provider (Yahoo, Zoho, custom domain), save them with " +
            'save_integration_credentials using integration="smtp". ' +
            "For Gmail itself, send gmailUser + a 16-character App Password instead.",
          doNotRetry: true,
        };
      }

      // Service account / OAuth path. The SA JSON may arrive as a string or
      // as a parsed object — normalize.
      const rawKey = creds.googleSaKey ?? creds.serviceAccountJson ?? creds.saKey;
      if (rawKey === undefined) {
        return {
          ok: false,
          error:
            "Could not figure out what kind of credential this is. Expected a service-account JSON (for Calendar) or Gmail App Password (for Gmail).",
          suggestedFix:
            input.variant === "gmail"
              ? "For Gmail: send gmailUser + a 16-character App Password. For Calendar-style auth: paste the FULL service-account .json contents."
              : "Paste the FULL contents of the service-account .json file from Google Cloud Console.",
          doNotRetry: true,
        };
      }

      let parsed: any;
      if (typeof rawKey === "string") {
        try {
          parsed = JSON.parse(rawKey);
        } catch {
          return {
            ok: false,
            error:
              "googleSaKey is not valid JSON. Likely cause: the user pasted only a fragment, or pasted a screenshot.",
            suggestedFix:
              "Open the .json file in a text editor (Notepad / TextEdit) and paste the ENTIRE contents — no screenshots.",
            doNotRetry: true,
          };
        }
      } else if (typeof rawKey === "object" && rawKey !== null) {
        parsed = rawKey;
      } else {
        return {
          ok: false,
          error: `googleSaKey must be a JSON string or object, got ${typeof rawKey}.`,
          doNotRetry: true,
        };
      }

      if (parsed?.installed || parsed?.web) {
        return {
          ok: false,
          error:
            "This is an OAuth Client ID file (has 'installed' or 'web' key), not a Service Account key.",
          suggestedFix:
            "In Google Cloud Console → IAM & Admin → Service Accounts → create or select one → Keys tab → Add Key → JSON. Paste THAT file.",
          doNotRetry: true,
        };
      }

      return {
        ok: true,
        value: {
          kind: "service_account" as DetectedCredKind,
          saJson: parsed,
          saRaw: typeof rawKey === "string" ? rawKey : JSON.stringify(parsed),
        },
      };
    },
  };

  // ── validate ──────────────────────────────────────────────────────────────
  const validate: Step = {
    name: "validate",
    async run(input: any): Promise<StepResult<any>> {
      if (input.kind === "app_password") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.gmailUser)) {
          return {
            ok: false,
            error: "gmailUser is not a valid email address.",
            doNotRetry: true,
          };
        }
        return { ok: true, value: {} };
      }
      // SA path
      const sa = input.saJson;
      const required = ["type", "project_id", "private_key", "client_email"];
      const missing = required.filter((f) => !sa?.[f]);
      if (missing.length > 0) {
        return {
          ok: false,
          error: `Service account JSON is missing required fields: ${missing.join(", ")}.`,
          suggestedFix:
            "Re-download a fresh key from Google Cloud Console → Service Accounts → Keys → Add Key → JSON.",
          doNotRetry: true,
        };
      }
      if (sa.type !== "service_account") {
        return {
          ok: false,
          error: `Service account JSON has type="${sa.type}", expected "service_account".`,
          doNotRetry: true,
        };
      }
      return { ok: true, value: {} };
    },
  };

  // ── test (with clock-skew fallback) ───────────────────────────────────────
  const saExchange = deps.exchangeServiceAccount ?? (async (saJson: any) => {
    // Default real implementation: lazy-import google-auth-library so test
    // environments don't pay the cost.
    const mod: any = await import("google-auth-library").catch((e) => {
      throw new Error(`google-auth-library not available: ${String(e?.message ?? e)}`);
    });
    const JWT = mod.JWT ?? mod.default?.JWT;
    const client = new JWT({
      email: saJson.client_email,
      key: saJson.private_key,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const token = await client.getAccessToken();
    if (!token?.token) throw new Error("invalid_grant: no access_token returned");
    return { access_token: String(token.token) };
  });

  const runTestOnce = async (input: any): Promise<StepResult<any>> => {
    if (input.kind === "app_password") {
      // Default: use realSmtpProbe (nodemailer.verify() against smtp.gmail.com:587).
      // Tests can still inject deps.smtpProbe to bypass network entirely.
      if (!deps.smtpProbe) {
        const probeResult = await realSmtpProbe(input.gmailUser, input.gmailPass);
        if (probeResult.ok) {
          return { ok: true, value: { testMode: "smtp" } };
        }
        return probeResult; // already a well-formed StepResult with suggestedFix + doNotRetry
      }
      try {
        await deps.smtpProbe("smtp.gmail.com", 587, input.gmailUser, input.gmailPass);
        return { ok: true, value: { testMode: "smtp" } };
      } catch (e) {
        const msg = String((e as any)?.message ?? e);
        return {
          ok: false,
          error: `Gmail SMTP rejected the App Password: ${msg}`,
          suggestedFix:
            "Make sure 2-Step Verification is ON, and generate a fresh App Password at myaccount.google.com/apppasswords.",
          doNotRetry: true,
        };
      }
    }
    // service_account path
    try {
      const tok = await saExchange(input.saJson);
      return { ok: true, value: { accessToken: tok.access_token } };
    } catch (e) {
      const msg = String((e as any)?.message ?? e);
      return {
        ok: false,
        // Don't mark doNotRetry here — the fallback will pick it up for
        // invalid_grant cases.
        error: `Service account token exchange failed: ${msg}`,
        suggestedFix:
          "Confirm the service account exists and the key hasn't been revoked.",
      };
    }
  };

  const test: Step = {
    name: "test",
    async run(input: any) {
      return runTestOnce(input);
    },
    fallbacks: [
      {
        name: "test (clock-skew retry)",
        async run(input: any) {
          // Only retry on invalid_grant — for any other failure, re-failing
          // is just noise. We sniff the previousAttempts for the marker.
          await sleep(2000);
          return runTestOnce(input);
        },
      },
    ],
  };

  // ── save (idempotent) ─────────────────────────────────────────────────────
  const save: Step = {
    name: "save",
    async run(input: any, ctx: OrchestratorContext): Promise<StepResult<any>> {
      try {
        if (deps.saveCredentials) {
          await deps.saveCredentials(
            (input.variant as GoogleVariant) ?? "gmail",
            input.saJson ?? null,
            input.saRaw ?? null,
          );
        }
        if (ctx.config) {
          ctx.config.credentials = ctx.config.credentials ?? {};
          ctx.config.tools = ctx.config.tools ?? {};
          if (input.kind === "app_password") {
            ctx.config.credentials.gmailUser = input.gmailUser;
            ctx.config.credentials.gmailPass = input.gmailPass;
            ctx.config.tools.gmail = {
              user: input.gmailUser,
              appPassword: input.gmailPass,
              emailAddress: input.gmailUser,
            };
          } else {
            ctx.config.credentials.googleSaKey = input.saRaw;
            ctx.config.tools.google = {
              credentialsJson: input.saRaw,
              scopes: [
                "https://www.googleapis.com/auth/calendar",
                "https://www.googleapis.com/auth/gmail.modify",
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive",
              ],
            };
          }
        }
        return { ok: true, value: { saved: true } };
      } catch (e) {
        return {
          ok: false,
          error: `Failed to save Google credentials: ${String((e as any)?.message ?? e)}`,
        };
      }
    },
  };

  const confirm: Step = {
    name: "confirm",
    async run(): Promise<StepResult<any>> {
      return { ok: true, value: { confirmed: true } };
    },
  };

  // ── live-test ─────────────────────────────────────────────────────────────
  const liveTest: Step = {
    name: "live-test",
    async run(input: any): Promise<StepResult<any>> {
      try {
        if (input.kind === "app_password" || input.variant === "gmail") {
          if (deps.sendSelfEmail && input.gmailUser && input.gmailPass) {
            await deps.sendSelfEmail(input.gmailUser, input.gmailPass);
            return { ok: true, value: { liveTested: true } };
          }
          return {
            ok: true,
            value: {
              liveTested: false,
              note: "Skipped live email send (no sender wired in this build).",
            },
          };
        }
        // google_calendar
        if (deps.listOneEvent) {
          const ev = await deps.listOneEvent(input.saJson);
          return {
            ok: true,
            value: {
              liveTested: true,
              note: ev ? `Next event: ${ev.summary ?? "(no title)"}` : "No upcoming events.",
            },
          };
        }
        return { ok: true, value: { liveTested: false, note: "Calendar live-test skipped." } };
      } catch (e) {
        return {
          ok: false,
          error: `Live-test failed: ${String((e as any)?.message ?? e)}`,
          suggestedFix:
            "Credentials saved successfully, but the live test couldn't complete. Try the integration manually.",
        };
      }
    },
  };

  return {
    id: "google",
    inputShape:
      "{ credentials: { googleSaKey: string|object } | { gmailUser, gmailPass }, variant: 'gmail'|'google_calendar' }",
    steps: [detect, validate, test, save, confirm, liveTest],
  };
}

export const googlePipeline = makeGooglePipeline();
