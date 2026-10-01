// =============================================================================
// Quick Setup — "paste it, click Next, the agent does the rest"
//
// The full wizard asks users to choose among 8 AI providers, 4 email backends,
// 4 WhatsApp backends and a Google Cloud OAuth JSON. Quick Setup asks for the
// minimum and works the rest out:
//
//   AI key   → provider detected from the key's shape; ambiguous "sk-" keys are
//              tried against each candidate. Verified against AUTH-GATED
//              endpoints only (Rule 66 — a public endpoint like OpenRouter's
//              /models returns 200 for dead keys).
//   Email    → provider detected from the address, falling back to the
//              domain's MX records (catches Google Workspace / Microsoft 365
//              on custom domains). Verified with a real IMAP login AND a real
//              SMTP handshake — never "will verify on first use". The unread
//              count comes back so setup can show the connection really works.
//
// Why not "Sign in with Google": Gmail read/send scopes are restricted; a
// public app needs Google verification plus an annual third-party security
// assessment, and unverified apps cap at 100 users with 7-day tokens. App
// Passwords work today with no vendor approval.
//
// Pure logic + injectable network probes; HTTP routes live in
// dashboard/api/quick-setup.ts.
// =============================================================================

import { resolveMx as dnsResolveMx } from "dns/promises";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import type { AIProvider } from "../config/models.js";

// ---------------------------------------------------------------------------
// AI key
// ---------------------------------------------------------------------------

export interface AiCandidate {
  provider: AIProvider;
  model:    string;
  label:    string;
}

const AI: Record<string, AiCandidate> = {
  anthropic:  { provider: "anthropic",  model: "claude-sonnet-4-6",            label: "Claude (Anthropic)" },
  openrouter: { provider: "openrouter", model: "google/gemini-2.5-flash-lite", label: "OpenRouter" },
  google:     { provider: "google",     model: "gemini-2.5-flash",             label: "Gemini (Google)" },
  xai:        { provider: "xai",        model: "grok-3",                       label: "Grok (xAI)" },
  openai:     { provider: "openai",     model: "gpt-4o",                       label: "ChatGPT (OpenAI)" },
  deepseek:   { provider: "deepseek",   model: "deepseek-chat",                label: "DeepSeek" },
};

/** Providers this key could belong to, most likely first. Empty = unknown shape. */
export function aiCandidatesForKey(rawKey: string): AiCandidate[] {
  const k = rawKey.trim();
  if (k.startsWith("sk-ant-")) return [AI.anthropic];
  if (k.startsWith("sk-or-"))  return [AI.openrouter];
  if (k.startsWith("AIza"))    return [AI.google];
  if (k.startsWith("xai-"))    return [AI.xai];
  if (/^sk-(proj|svcacct|admin)-/.test(k)) return [AI.openai];
  // Legacy OpenAI keys and DeepSeek keys are both "sk-…"; let the servers decide.
  if (k.startsWith("sk-"))     return [AI.openai, AI.deepseek];
  return [];
}

/** Credential slot the loader reads for each provider. */
export function credentialKeyFor(provider: AIProvider): string {
  return `${provider}ApiKey`; // anthropicApiKey, openaiApiKey, googleApiKey, xaiApiKey, deepseekApiKey, openrouterApiKey
}

type FetchFn = typeof fetch;

/**
 * true = key accepted, false = key rejected, Error = couldn't tell (network).
 * Only auth-gated endpoints — they 401/403 for a bad key.
 */
export async function verifyAiKey(c: AiCandidate, key: string, fetchFn: FetchFn = fetch): Promise<boolean | Error> {
  const signal = AbortSignal.timeout(12_000);
  let res: Response;
  try {
    switch (c.provider) {
      case "anthropic":
        res = await fetchFn("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal });
        break;
      case "openrouter":
        res = await fetchFn("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` }, signal });
        break;
      case "google":
        res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal });
        break;
      case "openai":
        res = await fetchFn("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal });
        break;
      case "deepseek":
        res = await fetchFn("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${key}` }, signal });
        break;
      case "xai":
        res = await fetchFn("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal });
        break;
      default:
        return new Error(`Unsupported provider ${c.provider}`);
    }
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
  if (res.ok) return true;
  if (res.status === 400 || res.status === 401 || res.status === 403) return false;
  return new Error(`${c.label} answered HTTP ${res.status}`);
}

export type AiDetectResult =
  | { ok: true;  candidate: AiCandidate }
  | { ok: false; error: string };

export async function detectAndVerifyAiKey(rawKey: string, fetchFn: FetchFn = fetch): Promise<AiDetectResult> {
  const key = rawKey.trim();
  if (key.length < 20) return { ok: false, error: "That looks too short to be an AI key — copy the whole key and paste it again." };
  const candidates = aiCandidatesForKey(key);
  if (candidates.length === 0) {
    return {
      ok: false,
      error: "I don't recognise that key. Keys start with sk-or- (OpenRouter), sk-ant- (Claude), sk- (ChatGPT/DeepSeek), AIza (Gemini) or xai- (Grok).",
    };
  }
  let networkError: Error | null = null;
  for (const c of candidates) {
    const r = await verifyAiKey(c, key, fetchFn);
    if (r === true) return { ok: true, candidate: c };
    if (r instanceof Error) networkError = r;
  }
  if (networkError) {
    return { ok: false, error: `Couldn't reach the AI service to check your key (${networkError.message}). Check the internet connection and try again.` };
  }
  const who = candidates.map((c) => c.label).join(" / ");
  return { ok: false, error: `${who} rejected this key. It may be mistyped, deleted, or out of credit — create a new one and paste it here.` };
}

/** setup-config patch for a verified AI key. */
export function aiConfigPatch(c: AiCandidate, key: string): Record<string, any> {
  return {
    agent: {
      provider: c.provider,
      model:    c.model,
      ...(c.provider === "openrouter"
        ? { openrouterTiers: { fast: "meta-llama/llama-3.1-8b-instruct:free", balanced: "google/gemini-2.5-flash-lite", flagship: "google/gemini-2.5-flash" } }
        : {}),
    },
    credentials: { [credentialKeyFor(c.provider)]: key.trim() },
  };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export interface EmailPreset {
  id:        "gmail" | "outlook" | "yahoo" | "icloud" | "zoho" | "other";
  label:     string;
  imapHost:  string;
  imapPort:  number;
  smtpHost:  string;
  smtpPort:  number;
  /** Where the user creates the app password (null = use their normal password) */
  appPasswordUrl: string | null;
  /** true = servers were guessed from the domain; show the server fields */
  guessed:   boolean;
}

const PRESETS: Record<Exclude<EmailPreset["id"], "other">, Omit<EmailPreset, "guessed">> = {
  gmail:   { id: "gmail",   label: "Gmail",   imapHost: "imap.gmail.com",         imapPort: 993, smtpHost: "smtp.gmail.com",        smtpPort: 587,
             appPasswordUrl: "https://myaccount.google.com/apppasswords" },
  outlook: { id: "outlook", label: "Outlook", imapHost: "outlook.office365.com",  imapPort: 993, smtpHost: "smtp-mail.outlook.com", smtpPort: 587,
             appPasswordUrl: "https://account.live.com/proofs/AppPassword" },
  yahoo:   { id: "yahoo",   label: "Yahoo",   imapHost: "imap.mail.yahoo.com",    imapPort: 993, smtpHost: "smtp.mail.yahoo.com",   smtpPort: 465,
             appPasswordUrl: "https://login.yahoo.com/myaccount/security/app-password" },
  icloud:  { id: "icloud",  label: "iCloud",  imapHost: "imap.mail.me.com",       imapPort: 993, smtpHost: "smtp.mail.me.com",      smtpPort: 587,
             appPasswordUrl: "https://account.apple.com/account/manage" },
  zoho:    { id: "zoho",    label: "Zoho",    imapHost: "imap.zoho.com",          imapPort: 993, smtpHost: "smtp.zoho.com",         smtpPort: 465,
             appPasswordUrl: "https://accounts.zoho.com/home#security/app_password" },
};

const DOMAIN_PRESET: Record<string, keyof typeof PRESETS> = {
  "gmail.com": "gmail", "googlemail.com": "gmail",
  "outlook.com": "outlook", "hotmail.com": "outlook", "live.com": "outlook", "msn.com": "outlook",
  "outlook.sg": "outlook", "hotmail.sg": "outlook",
  "yahoo.com": "yahoo", "yahoo.com.sg": "yahoo", "ymail.com": "yahoo", "rocketmail.com": "yahoo",
  "icloud.com": "icloud", "me.com": "icloud", "mac.com": "icloud",
  "zoho.com": "zoho", "zohomail.com": "zoho",
};

const MX_PRESET: Array<[RegExp, keyof typeof PRESETS]> = [
  [/(^|\.)google(mail)?\.com\.?$/i,           "gmail"],   // Google Workspace
  [/(^|\.)(outlook|office365)\.com\.?$/i,     "outlook"], // Microsoft 365
  [/(^|\.)yahoodns\.net\.?$/i,                "yahoo"],
  [/(^|\.)icloud\.com\.?$/i,                  "icloud"],
  [/(^|\.)zoho\.(com|eu|in)\.?$/i,            "zoho"],
];

export function isValidEmail(address: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim());
}

/** Preset from the address alone (no network). */
export function emailPresetFor(address: string): EmailPreset {
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  const known = DOMAIN_PRESET[domain];
  if (known) return { ...PRESETS[known], guessed: false };
  return {
    id: "other", label: domain || "Email",
    imapHost: `imap.${domain}`, imapPort: 993, smtpHost: `smtp.${domain}`, smtpPort: 587,
    appPasswordUrl: null, guessed: true,
  };
}

type ResolveMxFn = (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;

/** Address first, then MX records — finds Google Workspace / Microsoft 365 on custom domains. */
export async function detectEmailPreset(address: string, resolveMx: ResolveMxFn = dnsResolveMx): Promise<EmailPreset> {
  const fromAddress = emailPresetFor(address);
  if (!fromAddress.guessed) return fromAddress;
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  try {
    const mx = await resolveMx(domain);
    for (const rec of [...mx].sort((a, b) => a.priority - b.priority)) {
      const hit = MX_PRESET.find(([re]) => re.test(rec.exchange));
      if (hit) {
        const p = PRESETS[hit[1]];
        // A company mailbox hosted by Google/Microsoft: their servers, the
        // company's domain as the label.
        return { ...p, label: `${domain} (${p.label})`, guessed: false };
      }
    }
  } catch { /* no MX / offline → keep the guess */ }
  return fromAddress;
}

export interface EmailLogin {
  address:  string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export type EmailVerifyResult =
  | { ok: true;  unread: number | null }
  | { ok: false; error: string; field: "password" | "server" | "network" };

export interface EmailProbes {
  imap: (l: EmailLogin) => Promise<{ unread: number | null }>;
  smtp: (l: EmailLogin) => Promise<void>;
}

const PROBE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error(`${label} timed out`), { code: "ETIMEDOUT" })), PROBE_TIMEOUT_MS)),
  ]);
}

const realProbes: EmailProbes = {
  async imap(l) {
    const client = new ImapFlow({
      host: l.imapHost, port: l.imapPort, secure: l.imapPort === 993,
      auth: { user: l.address, pass: l.password }, logger: false,
    });
    try {
      await withTimeout(client.connect(), "IMAP login");
      const st = await withTimeout(client.status("INBOX", { unseen: true }), "IMAP status");
      return { unread: typeof st.unseen === "number" ? st.unseen : null };
    } finally {
      await client.logout().catch(() => {});
    }
  },
  async smtp(l) {
    const t = nodemailer.createTransport({
      host: l.smtpHost, port: l.smtpPort, secure: l.smtpPort === 465, requireTLS: l.smtpPort !== 465,
      auth: { user: l.address, pass: l.password },
    });
    try {
      await withTimeout(t.verify(), "SMTP login");
    } finally {
      t.close();
    }
  },
};

/**
 * Turn an IMAP/SMTP failure into one plain sentence a non-technical user can
 * act on (Rule 56: per-failure-mode messages).
 */
export function explainEmailError(err: any, presetId: EmailPreset["id"]): { error: string; field: "password" | "server" | "network" } {
  const text = `${err?.code ?? ""} ${err?.responseText ?? ""} ${err?.response ?? ""} ${err?.message ?? ""}`;
  const authFail = err?.authenticationFailed || /EAUTH|AUTHENTICATIONFAILED|Invalid credentials|authentication failed|Username and Password not accepted|535|LOGIN failed|AUTHENTICATE failed/i.test(text);

  if (authFail) {
    if (presetId === "gmail") {
      return { field: "password", error:
        "Google didn't accept that password. Gmail needs an App Password (16 letters), not your normal password — " +
        "tap “Create App Password”, copy the 16 letters, and paste them here. (It needs 2-Step Verification turned on.)" };
    }
    if (presetId === "outlook") {
      return { field: "password", error:
        "Microsoft didn't accept that password. Outlook.com and many Microsoft 365 accounts only allow Microsoft's own sign-in for other apps, " +
        "which Quick Setup can't do yet. Try an App Password; if that fails, use a Gmail address for now." };
    }
    return { field: "password", error: "Your email provider didn't accept that password. Many providers need an “app password” for other apps — check your account's security settings." };
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) {
    return { field: "server", error: "I couldn't find that mail server. Check the server names below (your provider's help page lists them)." };
  }
  if (/ETIMEDOUT|ECONNREFUSED|ECONNRESET|ESOCKET|timed out/i.test(text)) {
    return { field: "network", error: "I couldn't reach the mail server. Check the internet connection, then try again." };
  }
  return { field: "server", error: `The mail server said: ${String(err?.message ?? err).slice(0, 160)}` };
}

/** Real IMAP login + real SMTP handshake, in parallel. Never sends an email. */
export async function verifyEmailLogin(
  login: EmailLogin,
  presetId: EmailPreset["id"],
  probes: EmailProbes = realProbes,
): Promise<EmailVerifyResult> {
  if (!isValidEmail(login.address)) return { ok: false, field: "server", error: "That doesn't look like an email address." };
  if (!login.password.trim())       return { ok: false, field: "password", error: "Paste the password first." };
  const l = { ...login, password: presetId === "gmail" ? login.password.replace(/\s+/g, "") : login.password };

  const [imap, smtp] = await Promise.allSettled([probes.imap(l), probes.smtp(l)]);
  if (imap.status === "rejected") return { ok: false, ...explainEmailError(imap.reason, presetId) };
  if (smtp.status === "rejected") return { ok: false, ...explainEmailError(smtp.reason, presetId) };
  return { ok: true, unread: imap.value.unread };
}

/**
 * setup-config patch for a verified mailbox. Gmail keeps the existing Gmail
 * path (loader → tools.gmail); every other provider uses tools.smtp.
 */
export function emailConfigPatch(preset: EmailPreset, login: EmailLogin): Record<string, any> {
  const password = preset.id === "gmail" ? login.password.replace(/\s+/g, "") : login.password;
  if (preset.id === "gmail") {
    return {
      agent:    { email: login.address },
      channels: { email: { enabled: true, provider: "gmail", config: { gmailUser: login.address, gmailPass: password } } },
    };
  }
  return {
    agent:    { email: login.address },
    channels: { email: { enabled: true, provider: "smtp", config: {} } },
    tools: {
      smtp: {
        host: login.smtpHost, port: String(login.smtpPort),
        user: login.address,  pass: password,
        imapHost: login.imapHost, imapPort: String(login.imapPort),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Autostart (Windows) — same task install-autostart.bat creates
// ---------------------------------------------------------------------------

export const AUTOSTART_TASK_NAME = "Vouza Admin Agent";

/** schtasks command that starts the agent silently at login. No admin rights needed. */
export function autostartCommand(agentDir: string): { cmd: string; args: string[] } {
  return {
    cmd: "schtasks.exe",
    args: [
      "/create", "/tn", AUTOSTART_TASK_NAME,
      "/tr", `wscript.exe "${agentDir}\\start-background.vbs"`,
      "/sc", "ONLOGON", "/rl", "LIMITED", "/f",
    ],
  };
}
