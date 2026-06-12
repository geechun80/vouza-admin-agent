// =============================================================================
// Credential Validator — Phase 1 of the Setup Execution Agent roadmap
//
// Validates credentials LIVE against the real API before saving anything.
// The guide bot calls this first; only on pass does it call
// save_integration_credentials.
//
// Why this matters:
//   • Catches typos/wrong-token immediately with a specific error message
//   • Shows the user proof (bot username, mailbox count, model list) before
//     anything is written to disk
//   • Means save_integration_credentials is only ever called with known-good keys
//
// Integrations supported:
//   telegram      — DELEGATED to the M2 telegram pipeline (detect→validate→test)
//   gmail_smtp    — DELEGATED to the M2 google pipeline, gmail variant
//   google_sa     — DELEGATED to the M2 google pipeline, google_calendar variant
//                   (now does a LIVE JWT token exchange, not just a field check)
//   slack         — auth.test API call, returns workspace + bot name
//   ai_provider   — /models or equivalent for every supported AI provider
//   waha          — GET /api/sessions reachability check
//   groq_voice    — list Groq models (same key as AI provider)
//   openai_voice  — list OpenAI models (same key as AI provider)
//   agentmail     — GET /inboxes
//
// Phase 3 (simplification): the telegram / gmail / google-SA validators were
// duplicated, weaker copies of the orchestrator pipelines (no per-step
// timeouts, no transport close, generic errors). They now delegate to
// executePipeline(..., { testOnly: true }) — which runs detect → validate →
// test and STOPS before save/confirm/live-test, preserving this tool's
// "never writes anything" contract. The return shape is unchanged.
// =============================================================================

import { z }         from "zod";
import { buildTool } from "./registry.js";
import { executePipeline } from "./setup.js";

// ── Pipeline executor seam ────────────────────────────────────────────────────
// Tests inject a fake executor to assert delegation without hitting the
// network. Production always uses the real executePipeline from setup.ts.

type PipelineExecutor = typeof executePipeline;
let _pipelineExecutor: PipelineExecutor = executePipeline;

/** Test seam — pass null to restore the real executor. */
export function _setPipelineExecutorForTests(fn: PipelineExecutor | null): void {
  _pipelineExecutor = fn ?? executePipeline;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal fetch with timeout (default 10 s). */
async function safeFetch(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 10_000,
): Promise<{ ok: boolean; status: number; body: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    let body: any;
    try { body = await res.json(); } catch { body = await res.text().catch(() => "(no body)"); }
    return { ok: res.ok, status: res.status, body };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Request timed out after 10 s" : String(e);
    return { ok: false, status: 0, body: msg };
  } finally {
    clearTimeout(timer);
  }
}

// ── Per-integration validators ────────────────────────────────────────────────

type ValidationResult = { valid: boolean; detail: string; meta?: Record<string, string | number> };

// ── Pipeline-delegated validators (telegram / gmail / google SA) ─────────────
// Each runs the orchestrator pipeline in testOnly mode (detect → validate →
// test, then STOP — no save, no confirm, no live-test) and maps the
// PipelineResult onto the legacy ValidationResult shape so the tool's
// contract with the system prompt / UI is unchanged.

function pipelineFailureDetail(r: { error?: string; suggestedFix?: string }): string {
  const parts = [r.error ?? "Validation failed."];
  if (r.suggestedFix) parts.push(r.suggestedFix);
  return parts.join(" — ");
}

async function validateTelegram(token: string, ctx: unknown): Promise<ValidationResult> {
  const r = await _pipelineExecutor(
    "telegram",
    { telegramToken: token.trim() },
    ctx,
    { testOnly: true },
  );
  if (!r.success) return { valid: false, detail: pipelineFailureDetail(r) };
  const username = String(r.data?.botUsername ?? "");
  return {
    valid: true,
    detail: `✅ Token valid — bot is @${username || "(unknown)"}`,
    meta:   username ? { username } : {},
  };
}

async function validateGmailSmtp(user: string, pass: string, ctx: unknown): Promise<ValidationResult> {
  const r = await _pipelineExecutor(
    "gmail",
    { gmailUser: user.trim(), gmailPass: pass },
    ctx,
    { testOnly: true },
  );
  if (!r.success) return { valid: false, detail: pipelineFailureDetail(r) };
  return { valid: true, detail: `✅ Gmail SMTP verified for ${user.trim()}` };
}

async function validateGoogleSA(saKeyJson: string, ctx: unknown): Promise<ValidationResult> {
  const r = await _pipelineExecutor(
    "google_calendar",
    { googleSaKey: saKeyJson },
    ctx,
    { testOnly: true },
  );
  if (!r.success) return { valid: false, detail: pipelineFailureDetail(r) };
  // The pipeline's detect step carries the parsed SA JSON forward.
  const sa: any = r.data?.saJson ?? {};
  return {
    valid: true,
    detail: `✅ Service account key verified live — project: ${sa.project_id ?? "(unknown)"}, account: ${sa.client_email ?? "(unknown)"}`,
    meta:   { projectId: String(sa.project_id ?? ""), clientEmail: String(sa.client_email ?? "") },
  };
}

async function validateSlack(token: string): Promise<ValidationResult> {
  token = token.trim();
  if (!token.startsWith("xoxb-")) {
    return { valid: false, detail: "Slack Bot Token must start with xoxb-" };
  }
  const r = await safeFetch("https://slack.com/api/auth.test", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!r.ok || !r.body?.ok) {
    return { valid: false, detail: `Slack rejected the token: ${r.body?.error ?? r.status}` };
  }
  return {
    valid: true,
    detail: `✅ Slack connected — workspace: ${r.body.team}, bot: ${r.body.bot_id}`,
    meta:   { team: r.body.team, userId: r.body.user_id },
  };
}

async function validateAIProvider(provider: string, apiKey: string): Promise<ValidationResult> {
  provider = provider.toLowerCase().trim();
  apiKey   = apiKey.trim();

  const ENDPOINTS: Record<string, { url: string; headers: (k: string) => Record<string, string>; parseResult: (b: any) => string }> = {
    openrouter: {
      url: "https://openrouter.ai/api/v1/models",
      headers: k => ({ Authorization: `Bearer ${k}`, "HTTP-Referer": "https://adminagent.app" }),
      parseResult: b => `${b?.data?.length ?? "many"} models available`,
    },
    anthropic: {
      url: "https://api.anthropic.com/v1/models",
      headers: k => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }),
      parseResult: b => `${b?.data?.length ?? "several"} Claude models available`,
    },
    openai: {
      url: "https://api.openai.com/v1/models",
      headers: k => ({ Authorization: `Bearer ${k}` }),
      parseResult: b => `${b?.data?.length ?? "many"} models available`,
    },
    google: {
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=__KEY__`,
      headers: _k => ({}),
      parseResult: b => `${b?.models?.length ?? "several"} Gemini models available`,
    },
    groq: {
      url: "https://api.groq.com/openai/v1/models",
      headers: k => ({ Authorization: `Bearer ${k}` }),
      parseResult: b => `${b?.data?.length ?? "several"} models available (including Whisper)`,
    },
    xai: {
      url: "https://api.x.ai/v1/models",
      headers: k => ({ Authorization: `Bearer ${k}` }),
      parseResult: b => `${b?.data?.length ?? "several"} Grok models available`,
    },
    deepseek: {
      url: "https://api.deepseek.com/v1/models",
      headers: k => ({ Authorization: `Bearer ${k}` }),
      parseResult: b => `${b?.data?.length ?? "several"} DeepSeek models available`,
    },
    moonshot: {
      url: "https://api.moonshot.cn/v1/models",
      headers: k => ({ Authorization: `Bearer ${k}` }),
      parseResult: b => `${b?.data?.length ?? "several"} Kimi models available`,
    },
    alibaba: {
      url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
      headers: k => ({ Authorization: `Bearer ${k}` }),
      parseResult: b => `${b?.data?.length ?? "several"} Qwen models available`,
    },
  };

  const ep = ENDPOINTS[provider];
  if (!ep) return { valid: false, detail: `Unknown provider "${provider}". Supported: ${Object.keys(ENDPOINTS).join(", ")}` };

  const url = ep.url.replace("__KEY__", encodeURIComponent(apiKey));
  const r   = await safeFetch(url, { headers: ep.headers(apiKey) });

  if (r.ok) {
    const info = ep.parseResult(r.body);
    return { valid: true, detail: `✅ ${provider} API key valid — ${info}` };
  }

  // Friendly errors for common failure codes
  if (r.status === 401 || r.status === 403) {
    return { valid: false, detail: `${provider} rejected the key (${r.status} Unauthorized) — double-check you copied the full key` };
  }
  if (r.status === 429) {
    return { valid: false, detail: `${provider} rate-limited the test request — key is likely valid (try saving it)` };
  }
  return { valid: false, detail: `${provider} returned HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}` };
}

async function validateWAHA(wahaUrl: string, wahaKey?: string): Promise<ValidationResult> {
  const base    = (wahaUrl || "").replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (wahaKey) headers["X-Api-Key"] = wahaKey;

  const r = await safeFetch(`${base}/api/sessions`, { headers });
  if (r.ok) {
    const sessions = Array.isArray(r.body) ? r.body : (r.body?.data ?? []);
    const active   = sessions.filter((s: any) => s.status === "WORKING").length;
    return {
      valid: true,
      detail: `✅ WAHA server reachable at ${base} — ${sessions.length} session(s), ${active} active`,
      meta:   { sessions: sessions.length, active },
    };
  }
  if (r.status === 401 || r.status === 403) {
    return { valid: false, detail: "WAHA requires an API key — add it to WAHA settings or paste it here" };
  }
  if (r.status === 0) {
    return { valid: false, detail: `Cannot reach ${base} — is the WAHA Docker container running? Try: docker ps` };
  }
  return { valid: false, detail: `WAHA server returned HTTP ${r.status}` };
}

async function validateAgentMail(apiKey: string): Promise<ValidationResult> {
  const r = await safeFetch("https://api.agentmail.to/v0/inboxes", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (r.ok) {
    const count = r.body?.inboxes?.length ?? r.body?.count ?? 0;
    return { valid: true, detail: `✅ AgentMail key valid — ${count} inbox(es) found`, meta: { inboxCount: count } };
  }
  if (r.status === 401 || r.status === 403) {
    return { valid: false, detail: "AgentMail rejected the key — get a fresh one at agentmail.to" };
  }
  return { valid: false, detail: `AgentMail returned HTTP ${r.status}` };
}

// ── Tool definition ───────────────────────────────────────────────────────────

export const testCredentialTool = buildTool({
  name: "test_credential",
  description:
    "Test a credential LIVE against the real API before saving it. " +
    "Always call this before save_integration_credentials. " +
    "On success, show the user the proof (bot username, model count, mailbox name) then save. " +
    "On failure, give the exact error so the user can fix it without a round-trip. " +
    "\n\nSupported types: telegram | slack | gmail_smtp | google_sa | ai_provider | waha | groq_voice | openai_voice | agentmail",
  category: "system",
  isReadOnly: true,   // never writes anything
  isConcurrencySafe: true,
  inputSchema: z.object({
    type: z.enum([
      "telegram",
      "slack",
      "gmail_smtp",
      "google_sa",
      "ai_provider",
      "waha",
      "groq_voice",
      "openai_voice",
      "agentmail",
    ]).describe("Which credential type to validate"),
    credentials: z.record(z.string()).describe(
      "Credential fields to test. " +
      "telegram: {token} | " +
      "slack: {token} | " +
      "gmail_smtp: {user, pass} | " +
      "google_sa: {saKeyJson} | " +
      "ai_provider: {provider, apiKey} | " +
      "waha: {url, apiKey?} | " +
      "groq_voice: {apiKey} | " +
      "openai_voice: {apiKey} | " +
      "agentmail: {apiKey}"
    ),
  }),

  async call(input, ctx): Promise<any> {
    const { type, credentials: c } = input;
    let result: ValidationResult;

    try {
      switch (type) {
        case "telegram":
          result = await validateTelegram(c.token ?? "", ctx);
          break;

        case "slack":
          result = await validateSlack(c.token ?? "");
          break;

        case "gmail_smtp":
          if (!c.user || !c.pass)
            return { success: false, error: "gmail_smtp requires: user (Gmail address) and pass (App Password)" };
          result = await validateGmailSmtp(c.user, c.pass, ctx);
          break;

        case "google_sa":
          if (!c.saKeyJson)
            return { success: false, error: "google_sa requires: saKeyJson (full JSON content of the key file)" };
          result = await validateGoogleSA(c.saKeyJson, ctx);
          break;

        case "ai_provider":
          if (!c.provider || !c.apiKey)
            return { success: false, error: "ai_provider requires: provider and apiKey" };
          result = await validateAIProvider(c.provider, c.apiKey);
          break;

        case "waha":
          if (!c.url)
            return { success: false, error: "waha requires: url (e.g. http://localhost:3000)" };
          result = await validateWAHA(c.url, c.apiKey);
          break;

        case "groq_voice":
          if (!c.apiKey) return { success: false, error: "groq_voice requires: apiKey" };
          result = await validateAIProvider("groq", c.apiKey);
          break;

        case "openai_voice":
          if (!c.apiKey) return { success: false, error: "openai_voice requires: apiKey" };
          result = await validateAIProvider("openai", c.apiKey);
          break;

        case "agentmail":
          if (!c.apiKey) return { success: false, error: "agentmail requires: apiKey" };
          result = await validateAgentMail(c.apiKey);
          break;

        default:
          return { success: false, error: `Unknown credential type: ${type}` };
      }
    } catch (e) {
      return { success: false, error: `Validation threw unexpectedly: ${e}` };
    }

    return {
      success: true,
      data: {
        valid:  result.valid,
        detail: result.detail,
        meta:   result.meta ?? {},
        nextStep: result.valid
          ? "Credential verified — call save_integration_credentials to persist it."
          : "Fix the issue above and try again.",
      },
    };
  },
});
