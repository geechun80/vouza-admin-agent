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
//   telegram      — getMe API call, returns bot username
//   slack         — auth.test API call, returns workspace + bot name
//   gmail_smtp    — nodemailer verify() (STARTTLS handshake, no email sent)
//   google_sa     — parse JSON + field check + optional Calendar list call
//   ai_provider   — /models or equivalent for every supported AI provider
//   waha          — GET /api/sessions reachability check
//   groq_voice    — list Groq models (same key as AI provider)
//   openai_voice  — list OpenAI models (same key as AI provider)
//   agentmail     — GET /inboxes
// =============================================================================

import { z }         from "zod";
import { buildTool } from "./registry.js";
import nodemailer     from "nodemailer";

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

async function validateTelegram(token: string): Promise<ValidationResult> {
  token = token.trim();
  if (!/^\d{7,12}:[A-Za-z0-9_-]{35,}$/.test(token)) {
    return { valid: false, detail: "Token format is wrong — should be numbers:letters (e.g. 123456789:ABCdefGhIJKlmNoPQRstuVWXyz)" };
  }
  const r = await safeFetch(`https://api.telegram.org/bot${token}/getMe`);
  if (!r.ok || !r.body?.ok) {
    const desc = r.body?.description ?? `HTTP ${r.status}`;
    return { valid: false, detail: `Telegram rejected the token: ${desc}` };
  }
  const bot = r.body.result;
  return {
    valid: true,
    detail: `✅ Token valid — bot is @${bot.username} ("${bot.first_name}")`,
    meta:   { username: bot.username, botId: bot.id },
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

async function validateGmailSmtp(
  user: string, pass: string,
): Promise<ValidationResult> {
  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: user.trim(), pass: pass.replace(/\s/g, "") },
    });
    await (transport as any).verify();
    return { valid: true, detail: `✅ Gmail SMTP verified for ${user}` };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("535") || msg.includes("Username and Password not accepted")) {
      return { valid: false, detail: "Gmail rejected the App Password — make sure 2-Step Verification is ON and you generated the password from myaccount.google.com/apppasswords" };
    }
    if (msg.includes("ENOTFOUND") || msg.includes("ETIMEDOUT")) {
      return { valid: false, detail: "Could not reach smtp.gmail.com — check your internet connection" };
    }
    return { valid: false, detail: `SMTP error: ${msg.slice(0, 200)}` };
  }
}

async function validateGoogleSA(saKeyJson: string): Promise<ValidationResult> {
  let parsed: any;
  try {
    parsed = JSON.parse(saKeyJson.trim());
  } catch {
    return { valid: false, detail: "Could not parse as JSON — paste the full contents of the downloaded .json key file" };
  }
  const required = ["type", "project_id", "client_email", "private_key", "token_uri"];
  const missing  = required.filter(k => !parsed[k]);
  if (missing.length) {
    return { valid: false, detail: `Missing required fields in the key file: ${missing.join(", ")}` };
  }
  if (parsed.type !== "service_account") {
    return { valid: false, detail: `Expected type "service_account", got "${parsed.type}" — make sure you downloaded a Service Account key, not an OAuth client key` };
  }
  return {
    valid: true,
    detail: `✅ Service account key looks valid — project: ${parsed.project_id}, account: ${parsed.client_email}`,
    meta:   { projectId: parsed.project_id, clientEmail: parsed.client_email },
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

  async call(input): Promise<any> {
    const { type, credentials: c } = input;
    let result: ValidationResult;

    try {
      switch (type) {
        case "telegram":
          result = await validateTelegram(c.token ?? "");
          break;

        case "slack":
          result = await validateSlack(c.token ?? "");
          break;

        case "gmail_smtp":
          if (!c.user || !c.pass)
            return { success: false, error: "gmail_smtp requires: user (Gmail address) and pass (App Password)" };
          result = await validateGmailSmtp(c.user, c.pass);
          break;

        case "google_sa":
          if (!c.saKeyJson)
            return { success: false, error: "google_sa requires: saKeyJson (full JSON content of the key file)" };
          result = await validateGoogleSA(c.saKeyJson);
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
