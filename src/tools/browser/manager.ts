// =============================================================================
// Browser Session Manager
//
// Manages a single Playwright browser process and per-session pages.
// Designed for the Setup Execution Agent — one browser, one session per task.
//
// Security model:
//   • SSRF prevention — only allowlisted domains may be navigated to
//   • Headless by default; set PLAYWRIGHT_HEADED=true for OAuth consent flows
//   • No persistent cookies — fresh BrowserContext per session
//   • Sessions are closed after SETUP_BROWSER_TTL_MS of inactivity (default 10 min)
//
// Activation:
//   Set SETUP_AGENT_ENABLED=true in .env
//   npm install playwright && npx playwright install chromium
// =============================================================================

import { EventEmitter } from "events";

// ── Domain allowlist ─────────────────────────────────────────────────────────
// Only these domains are reachable via browser tools. The list can be extended
// two ways (merged with the defaults, deny-by-default otherwise):
//   • BROWSER_ALLOWED_DOMAINS env var (comma-separated extra domains)
//   • config.tools.browser.allowedDomains (array in data/config.json) — Phase 4
// localhost / private-IP targets are HARD-blocked regardless of any allowlist
// entry: the hard block runs before the allowlist is even consulted.

const CORE_ALLOWED: readonly string[] = [
  "google.com", "accounts.google.com", "console.cloud.google.com",
  "myaccount.google.com", "cloud.google.com",
  "slack.com", "api.slack.com",
  "telegram.org", "t.me", "web.telegram.org",
  "groq.com", "console.groq.com",
  "openai.com", "platform.openai.com",
  "anthropic.com", "console.anthropic.com",
  "agentmail.to", "api.agentmail.to",
  "github.com", "api.github.com",
  "microsoft.com", "portal.azure.com", "login.microsoftonline.com",
  "openrouter.ai",
];

/**
 * Merge the default allowlist with the BROWSER_ALLOWED_DOMAINS env var and any
 * config-provided extra domains. Exported for tests.
 */
export function buildAllowlist(configDomains?: string[]): string[] {
  const fromEnv = (process.env.BROWSER_ALLOWED_DOMAINS || "")
    .split(",")
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
  const fromConfig = (configDomains ?? [])
    .filter((d): d is string => typeof d === "string")
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...CORE_ALLOWED, ...fromEnv, ...fromConfig])];
}

/**
 * Read the user-configured extra browser domains off an AgentContext.
 * Returns [] for missing/malformed values — never throws.
 */
export function configuredBrowserDomains(context: any): string[] {
  const arr = context?.config?.tools?.browser?.allowedDomains;
  return Array.isArray(arr) ? arr.filter((d: any) => typeof d === "string") : [];
}

/**
 * SSRF hard block — these hosts can NEVER be navigated to, even if a user adds
 * them to config.tools.browser.allowedDomains or BROWSER_ALLOWED_DOMAINS.
 */
function isHardBlockedHost(host: string): boolean {
  if (host === "localhost" || host === "::1" || host === "[::1]" || host.endsWith(".local")) {
    return true;
  }
  // IPv4 loopback / private / link-local / unspecified ranges
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0) return true;            // loopback, 10/8, 0.0.0.0
    if (a === 172 && b >= 16 && b <= 31) return true;             // 172.16/12
    if (a === 192 && b === 168) return true;                      // 192.168/16
    if (a === 169 && b === 254) return true;                      // link-local
  }
  // IPv6 loopback / unique-local / link-local
  const h6 = host.replace(/^\[|\]$/g, "");
  if (h6 === "::" || h6 === "::1") return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(h6) && h6.includes(":")) return true;
  return false;
}

export function checkDomainAllowed(url: string, configDomains?: string[]): { allowed: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    const host   = parsed.hostname.toLowerCase();
    // Hard block FIRST — wins over every allowlist source (SSRF prevention)
    if (isHardBlockedHost(host)) {
      return {
        allowed: false,
        reason:
          `Navigation to ${host} is blocked (SSRF prevention). ` +
          "localhost and private network addresses can never be allowlisted.",
      };
    }
    const allowlist = buildAllowlist(configDomains);
    const permitted = allowlist.some(d => host === d || host.endsWith(`.${d}`));
    if (!permitted) {
      return {
        allowed: false,
        reason:
          `Domain "${host}" is not in the browser allowlist. ` +
          "The user can allow it by adding the domain to tools.browser.allowedDomains " +
          "in data/config.json (or to the BROWSER_ALLOWED_DOMAINS line in .env) and " +
          "restarting the agent. Do not retry until the user confirms they added it.",
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: `Invalid URL: ${url}` };
  }
}

// ── Browser singleton ────────────────────────────────────────────────────────

let _playwright: any = null;
let _browser: any    = null;
const _sessions      = new Map<string, { page: any; context: any; lastActive: number }>();
const TTL_MS         = parseInt(process.env.SETUP_BROWSER_TTL_MS || "600000", 10); // 10 min default

const emitter = new EventEmitter();

/** Lazily import and launch Playwright chromium. */
async function ensureBrowser(): Promise<any> {
  if (_browser) return _browser;

  if (!_playwright) {
    try {
      _playwright = await import("playwright");
    } catch {
      throw new Error(
        "Playwright is not installed.\n" +
        "Run: npm install playwright && npx playwright install chromium\n" +
        "Then set SETUP_AGENT_ENABLED=true in .env"
      );
    }
  }

  const headed = process.env.PLAYWRIGHT_HEADED === "true";
  _browser = await _playwright.chromium.launch({
    headless: !headed,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  // Auto-close stale sessions every 60 s
  setInterval(async () => {
    const cutoff = Date.now() - TTL_MS;
    for (const [id, s] of _sessions) {
      if (s.lastActive < cutoff) {
        await closeBrowserSession(id).catch(() => {});
      }
    }
  }, 60_000).unref();

  return _browser;
}

/** Get or create a Page for the given sessionId. */
export async function getBrowserPage(sessionId: string): Promise<any> {
  const existing = _sessions.get(sessionId);
  if (existing) {
    existing.lastActive = Date.now();
    return existing.page;
  }

  const browser  = await ensureBrowser();
  const context  = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    // No persistent storage — fresh context per session
    storageState: undefined,
  });

  const page = await context.newPage();
  _sessions.set(sessionId, { page, context, lastActive: Date.now() });
  return page;
}

/** Close a session's browser context and remove it from the pool. */
export async function closeBrowserSession(sessionId: string): Promise<void> {
  const session = _sessions.get(sessionId);
  if (!session) return;
  _sessions.delete(sessionId);
  try { await session.context.close(); } catch { /* ignore */ }
  emitter.emit("session_closed", sessionId);
}

/** Close all sessions and the browser process. */
export async function shutdownBrowser(): Promise<void> {
  for (const id of [..._sessions.keys()]) {
    await closeBrowserSession(id).catch(() => {});
  }
  if (_browser) {
    try { await _browser.close(); } catch { /* ignore */ }
    _browser = null;
    _playwright = null;
  }
}
