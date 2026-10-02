// =============================================================================
// Setup Wizard & Dashboard API Server
// Express backend — config persistence, model catalog, agent launcher, tests
// =============================================================================

import express from "express";
import { readFile, writeFile, mkdir, readdir, unlink, access } from "fs/promises";
import { join, dirname, resolve, sep, basename } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);
import {
  getModelCatalogForUI,
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER,
  DEFAULT_OPERATOR_PROVIDER,
  DEFAULT_OPERATOR_MODEL,
  DEFAULT_OPENROUTER_TIERS,
  type AIProvider,
} from "../../config/models.js";
import { keyCheckRequest } from "../../config/providerEndpoints.js";
import { getBudgetSnapshot } from "../../agent/budget.js";
import { getHealthSnapshot as getProviderHealth } from "../../agent/providerFailover.js";
import {
  loadTranscript    as loadChatHistory,
  listSessions      as listChatSessions,
  deleteSession     as deleteChatSession,
} from "../../agent/conversationStore.js";
import { launchAgent, getAgentStatus, type AgentInstance } from "../../bridge/launcher.js";
import { setAgentInstance } from "../../bridge/agentBridge.js";
import { streamChat, clearSession, forEachChatContext } from "./chat.js";
import { installFetchLogger, withTrigger, getNetActivity } from "../../util/netActivity.js";
import { PROBE_INTERVAL_MS as HEALTH_PROBE_INTERVAL_MS } from "../../integrations/healthMonitor.js";
import { handleHealthDetailed } from "./health-detailed.js";
import { handleSetupPipelineTest } from "./setup-pipeline.js";
import { registerQuickSetupRoutes } from "./quick-setup.js";
import { realSmtpProbe } from "../../orchestrator/probes/smtpProbe.js";
import { createMemoryStore } from "../../memory/store.js";
import { handleWAHAEvent } from "../../whatsapp/wahaListener.js";
import {
  startBaileysListener,
  stopBaileysListener,
  isBaileysConnected,
  onBaileysQR,
  onBaileysStatus,
  sendBaileysMessage,
  resetBaileysAuth,
  type BaileysStatus,
} from "../../whatsapp/baileysManager.js";
import { toDataURL as qrToDataURL } from "qrcode";
import { handleTelegramWebhookUpdate, getWebhookSecret } from "../../telegram/listener.js";
import {
  startAgentMailListener,
  stopAgentMailListener,
  getAgentMailInbox,
} from "../../email/agentMailListener.js";
import { isLocalHostHeader, isNewerVersion } from "../../util/localHost.js";
import { readSealedJson, writeSealedJson, migrateJsonFile, getMasterKey } from "../../security/secretStore.js";
import {
  lockBackup,
  unlockBackup,
  isLockedBackup,
  backupPasswordProblem,
  BackupPasswordError,
  PLAIN_BACKUP_FORMAT,
} from "../../security/backupCrypto.js";
import { listOpenRouterModels, listProviderModels, isValidModelId } from "../../config/liveModels.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(process.cwd(), "data", "config.json");
const PUBLIC_DIR = join(__dirname, "..", "public");

// Running agent instance (if launched from dashboard)
let agentInstance: AgentInstance | null = null;

/** Why a request's outgoing connections happened — shown in the Network view. */
function requestTrigger(path: string): string {
  if (path === "/api/chat") return "your message (dashboard)";
  if (path === "/api/agent/task") return "your request (dashboard)";
  if (path === "/api/transcribe") return "your voice note (dashboard)";
  if (path.startsWith("/api/integrations/") && path.endsWith("/probe")) return "health check (you clicked)";
  if (path === "/api/update-check") return "update check";
  return "setup / dashboard";
}
// Last answer from GitHub's "latest release" (the automatic check reuses it for a day).
const UPDATE_CHECK_TTL_MS = 24 * 60 * 60_000;
let _updateCache: { at: number; current: string; result: Record<string, unknown> } | null = null;
// Prevents double-launch race condition between auto-launch retry and manual /api/agent/launch
let launching = false;

interface SetupConfig {
  agent: {
    name: string;
    userName?: string;
    email?: string;
    phone?: string;
    model: string;
    provider?: string;
    language: string;
    timezone: string;
    /** OpenRouter smart routing — model IDs for each complexity tier */
    openrouterTiers?: { fast: string; balanced: string; flagship: string };
    /** Local AI (provider "ollama") — where Ollama listens; default http://127.0.0.1:11434/v1 */
    ollamaBaseUrl?: string;
  };
  channels: Record<string, { enabled: boolean; provider: string; config: Record<string, string> }>;
  tools: Record<string, { enabled: boolean; provider: string; config: Record<string, string> }>;
  credentials: Record<string, string>;
  skills: {
    enabled: string[];
    schedules: Record<string, string>;
  };
  selfImproveIntervalHours?: number;
  /** false → no reflection / skill writing / optimizer passes (each re-sends conversations to the AI) */
  learnFromConversations?: boolean;
  /** false -> the dashboard never asks GitHub for a newer version on its own */
  autoUpdateCheck?: boolean;
  setupCompleted: boolean;
  setupCompletedAt?: string;
}

const DEFAULT_CONFIG: SetupConfig = {
  agent: { name: "AdminAgent", model: DEFAULT_MODEL, provider: DEFAULT_PROVIDER, language: "en", timezone: "Asia/Singapore" },
  channels: {
    email: { enabled: false, provider: "gmail", config: {} },
    whatsapp: { enabled: false, provider: "web", config: {} },
    telegram: { enabled: false, provider: "default", config: {} },
  },
  tools: {
    calendar: { enabled: false, provider: "google", config: {} },
    spreadsheet: { enabled: false, provider: "google", config: {} },
    fileStorage: { enabled: false, provider: "local", config: {} },
  },
  credentials: {},
  skills: { enabled: [], schedules: {} },
  setupCompleted: false,
};

/** Returns true when a field name looks like it holds a sensitive credential */
function isSensitiveField(key: string): boolean {
  const k = key.toLowerCase();
  return ["key", "token", "secret", "pass", "password"].some(w => k.includes(w));
}

/**
 * CSRF guard for all mutating endpoints.
 * Allows requests that originate from the dashboard itself (localhost) and blocks
 * cross-origin requests from other browser pages.
 *
 * Security notes:
 *   • Distinguishes `origin === undefined` (header absent — safe) from
 *     `origin === ""` (empty-string header, sent by data: URIs / sandboxed iframes
 *     — treated as cross-origin and blocked).  The old `origin ?? referer ?? ""`
 *     pattern collapsed both into "" and incorrectly passed the empty-string case.
 *   • When Origin is absent, the Host header is checked as a secondary layer so
 *     that a reverse proxy stripping Origin from an external caller can't sneak
 *     through (non-localhost Host → 403).
 *   • Referer is NOT used as a standalone trust signal — it can be stripped by
 *     Referrer-Policy and is weaker than Origin.
 */
function requireLocalOrigin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const origin = req.headers["origin"] as string | undefined;
  const host   = (req.headers["host"]  as string | undefined) ?? "";

  // ① No Origin header → direct / curl / same-origin programmatic request.
  //   Validate Host as a second layer to block reverse-proxy stripping of Origin.
  if (origin === undefined) {
    if (
      host === ""                    ||   // non-HTTP/1.1, no Host (safe)
      host.startsWith("localhost:")  ||
      host.startsWith("127.0.0.1:")
    ) {
      return next();
    }
    // Non-localhost Host with no Origin — likely a proxied external request. Block.
    res.status(403).json({ error: "Forbidden: cross-origin request rejected" });
    return;
  }

  // ② Explicit localhost Origin → allow.
  if (
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:")
  ) {
    return next();
  }

  // ③ Empty-string Origin ("Origin: "), "null" origin (sandboxed iframe), or any
  //   non-localhost origin → block.
  res.status(403).json({ error: "Forbidden: cross-origin request rejected" });
}

// ── Bearer-token auth (LAN/remote-access mode only) ──────────────────────────
//
// When the dashboard binds to anything other than 127.0.0.1 (e.g. 0.0.0.0 for
// Docker or Tailscale exposure), we REQUIRE a password set via env:
//   DASHBOARD_PASSWORD=somesecret
// Clients send it as:  Authorization: Bearer <password>
//                  or  ?token=<password>  (for SSE/EventSource which can't set headers)
//
// In localhost-only mode this middleware is a no-op — the OS firewall already
// blocks remote access, so the password requirement is pure friction.
const DASHBOARD_PASSWORD = (process.env.DASHBOARD_PASSWORD || "").trim();
const DASHBOARD_BIND     = (process.env.DASHBOARD_BIND     || "127.0.0.1").trim();
/**
 * Docker: the server must listen on 0.0.0.0 inside the container for port
 * publishing to work, but docker-compose publishes it on the HOST's loopback
 * only (127.0.0.1:3456). In this mode every request must name localhost as
 * its host, so the dashboard still answers only on this computer — no
 * password needed (the browser UI can't send one) and DNS rebinding fails.
 */
const DOCKER_LOCAL_ONLY  = (process.env.DASHBOARD_DOCKER_LOCAL_ONLY || "").trim().toLowerCase() === "true";
const REQUIRE_AUTH       = !DOCKER_LOCAL_ONLY && DASHBOARD_BIND !== "127.0.0.1" && DASHBOARD_BIND !== "localhost";


// Constant-time string compare to avoid timing oracles on the password.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Content-Security-Policy for every dashboard response. */
export const DASHBOARD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function requireDashboardAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  // Localhost-only mode → no auth required (loopback can't be reached remotely)
  if (!REQUIRE_AUTH) return next();

  // Otherwise require either Authorization: Bearer <pw> or ?token=<pw>
  const header = req.headers["authorization"] as string | undefined;
  const tokenFromHeader = header?.startsWith("Bearer ")
    ? header.slice(7).trim()
    : undefined;
  const tokenFromQuery = typeof req.query.token === "string" ? req.query.token : undefined;
  const provided = tokenFromHeader || tokenFromQuery || "";

  if (!provided || !timingSafeEqual(provided, DASHBOARD_PASSWORD)) {
    res.status(401).json({ error: "Unauthorized: dashboard password required" });
    return;
  }
  next();
}

/**
 * Safely resolve a conversation ID to an absolute file path.
 *
 * Prevents path-traversal attacks (e.g. id = "../../config") by:
 *   1. Allowlisting the ID to alphanumerics, dashes, and underscores only.
 *   2. Verifying the resolved path is strictly inside convDir.
 *
 * Returns the safe path, or null if the ID is invalid.
 * Callers must return 400 when null is returned.
 */
function safeConvPath(id: string, convDir: string): string | null {
  // Step 1 — allowlist: only safe filename characters, max 64 chars
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return null;
  // Step 2 — confirm resolved path stays inside convDir
  const resolved = resolve(convDir, `${id}.json`);
  const base     = resolve(convDir) + sep;
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

// ── Operator key live-verification (cached) ─────────────────────────────────
// Verifies VOUZA_API_KEY against the provider's /models endpoint so the
// dashboard reports honest status. Cached to avoid hammering the provider on
// every poll. A 401/403 means the key is genuinely bad (revoked/expired); a
// network error means we simply couldn't check (don't punish the operator for
// being briefly offline — report "unchecked", not "invalid").
type OperatorKeyStatus = "valid" | "invalid" | "unchecked";
let _opKeyCache: { status: OperatorKeyStatus; detail?: string; checkedAt: number } | null = null;
const OP_KEY_TTL_MS = 5 * 60 * 1000; // re-verify at most once every 5 minutes

async function verifyOperatorKey(): Promise<{ status: OperatorKeyStatus; detail?: string }> {
  const key = (process.env.VOUZA_API_KEY || "").trim();
  if (!key) return { status: "unchecked", detail: "No operator key set" };

  if (_opKeyCache && Date.now() - _opKeyCache.checkedAt < OP_KEY_TTL_MS) {
    return { status: _opKeyCache.status, detail: _opKeyCache.detail };
  }

  const provider = (process.env.VOUZA_API_PROVIDER || DEFAULT_OPERATOR_PROVIDER) as AIProvider;
  // AUTH-GATED check from the shared endpoint table (Rule 66 — OpenRouter's
  // /models is PUBLIC and returns 200 even for a revoked key).
  const { url: baseUrl, headers } = keyCheckRequest(provider, key);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let result: { status: OperatorKeyStatus; detail?: string };
  try {
    const r = await fetch(baseUrl, { headers, signal: ctrl.signal });
    if (r.ok) {
      result = { status: "valid" };
    } else if (r.status === 401 || r.status === 403) {
      result = { status: "invalid", detail: `Provider rejected the operator key (HTTP ${r.status})` };
    } else {
      result = { status: "unchecked", detail: `Provider returned HTTP ${r.status} — could not verify` };
    }
  } catch {
    result = { status: "unchecked", detail: "Could not reach provider to verify the key" };
  } finally {
    clearTimeout(t);
  }

  _opKeyCache = { ...result, checkedAt: Date.now() };
  return result;
}

export async function startDashboard(port = 3456): Promise<void> {
  // ── Ensure data/ directory and a baseline config always exist ─────────────
  // Prevents "No API key found" errors on fresh installs or after accidental
  // deletion. If config.json is missing, we write DEFAULT_CONFIG immediately
  // so the file is always present and the operator key is never lost.
  try {
    await mkdir(dirname(CONFIG_PATH), { recursive: true });
    try {
      await readFile(CONFIG_PATH, "utf-8"); // check if it already exists
    } catch {
      // File is missing — write baseline so data/ dir + file both exist
      await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
      console.log("  ✓ Initialized fresh data/config.json");
    }
  } catch (e) {
    console.warn("  ⚠ Could not initialize data/config.json:", e);
  }

  // Unlock the master key now (Windows DPAPI goes through PowerShell, which
  // can take seconds) and upgrade any file still holding plain-text secrets.
  getMasterKey()
    .then(() => encryptSecretsAtRest())
    .catch((err) => console.warn(`  ⚠ Could not unlock the secret key: ${err}`));

  // Every outgoing connection is recorded for the Network view (Health panel).
  installFetchLogger();

  const app = express();
  // Browser hardening. The dashboard loads nothing from other sites, so the
  // page may only talk to this server: even if some text slipped past the
  // escaping, it couldn't send data elsewhere with fetch/images/forms, and no
  // other site can frame the dashboard to trick clicks. (Inline onclick
  // handlers are used throughout, hence 'unsafe-inline' for scripts.)
  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", DASHBOARD_CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
    next();
  });
  app.use(express.json({ limit: "30mb" })); // 30 MB to accommodate base64 audio uploads
  // Label why any connection made while handling a request happened.
  app.use((req, _res, next) => withTrigger(requestTrigger(req.path), next));
  // Static files — force HTML to revalidate on every load so dashboard updates
  // are picked up immediately after `git pull && npm run build`. Without this,
  // browsers cache index.html indefinitely and users see stale UI (beta-tester bug,
  // 2026-05-28: M1 chat-ordering fix wasn't visible because the browser kept
  // serving cached HTML). Other static assets (images, fonts) keep default caching.
  //
  // Rule 64 extension (Phase 5): the SPA was split into index.html + app.css +
  // app.js. The split assets MUST also revalidate — otherwise users get fresh
  // HTML referencing stale cached JS/CSS (the same stale-UI bug class, one
  // layer down). They're tiny files served from localhost, so no-cache costs
  // nothing; staleness costs hours of support. (The ?v=2 query param in
  // index.html is the belt; these headers are the suspenders.)
  // NOTE: endsWith(sep + "app.js") — a bare endsWith("app.js") would also
  // match e.g. "whatsapp.js".
  const isSpaAsset = (p: string) =>
    p.endsWith(`${sep}app.js`) || p.endsWith(`${sep}app.css`);
  app.use(express.static(PUBLIC_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html") || isSpaAsset(filePath)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  }));

  // ── Dashboard auth (active only in remote-access mode) ─────────────────────
  // Localhost-only mode (default): middleware is a no-op — OS already isolates loopback.
  // Remote mode (DASHBOARD_BIND=0.0.0.0 etc.): every /api/* route except the
  // public webhooks below requires Authorization: Bearer <DASHBOARD_PASSWORD>.
  // Webhooks (/api/whatsapp/webhook, /api/telegram/webhook) are exempt because
  // they're called by external services with their own signed payloads.
  // Docker local-only mode: refuse anything not addressed to localhost
  // (other devices on the network, DNS rebinding). Webhooks keep their own
  // auth (WAHA API key, Telegram secret) and may come from the WAHA container.
  if (DOCKER_LOCAL_ONLY) {
    app.use((req, res, next) => {
      if (req.path === "/api/whatsapp/webhook" || req.path === "/api/telegram/webhook") return next();
      if (isLocalHostHeader(req.headers.host)) return next();
      res.status(403).type("text/plain").send("This dashboard only answers on this computer: open http://localhost:3456");
    });
  }

  app.use("/api", (req, res, next) => {
    // Public webhook paths — Telegram/WAHA need to reach these without our password.
    if (
      req.path === "/whatsapp/webhook" ||
      req.path === "/telegram/webhook" ||
      req.path === "/operator-defaults" || // tells the UI whether to show "use Vouza key" CTA
      req.path === "/models"               // public model catalog (no secrets)
    ) {
      return next();
    }
    return requireDashboardAuth(req, res, next);
  });

  // ── Startup-time safety: refuse to bind to a non-loopback interface
  //    without a password set. Prevents an accidental "DASHBOARD_BIND=0.0.0.0"
  //    deploy that exposes the agent to the whole LAN/internet with no auth.
  if (REQUIRE_AUTH && !DASHBOARD_PASSWORD) {
    console.error(
      "\n❌ DASHBOARD_BIND is set to a non-localhost address but DASHBOARD_PASSWORD is empty.\n" +
      "   Refusing to start — this would expose the dashboard to your network with no auth.\n" +
      "   Fix: set DASHBOARD_PASSWORD=<a-long-random-string> in your env, OR remove DASHBOARD_BIND.\n"
    );
    process.exit(1);
  }

  // --- Model Catalog API ---
  app.get("/api/models", (_req, res) => {
    res.json(getModelCatalogForUI());
  });

  // --- Every model a provider offers (fetched only when asked) ---
  // OpenRouter's catalog is public; other providers are listed with the
  // SAVED key (it never comes from the browser). Cached 6 h.
  app.get("/api/models/live", requireLocalOrigin, async (req, res) => {
    const provider = String(req.query.provider || "") as AIProvider;
    if (!(provider in DEFAULT_MODEL_BY_PROVIDER) || provider === "ollama") {
      return res.status(400).json({ ok: false, error: "Unknown provider" });
    }
    try {
      if (provider === "openrouter") {
        return res.json({ ok: true, provider, models: await listOpenRouterModels() });
      }
      const cfg   = await loadSetupConfig();
      const creds: Record<string, string> = (cfg.credentials || {}) as any;
      const key = creds[`${provider}ApiKey`]
        || (provider === "google"  ? creds.googleAiApiKey   : "")
        || (provider === "alibaba" ? creds.dashscopeApiKey  : "")
        || "";
      if (!key || key.length < 8) {
        return res.json({ ok: false, needsKey: true, error: "Save your key for this provider first, then the full list appears here." });
      }
      res.json({ ok: true, provider, models: await listProviderModels(provider, key) });
    } catch (err: any) {
      res.json({ ok: false, error: String(err?.message || err) });
    }
  });

  // --- Operator Defaults API ---
  // Tells the wizard whether a default (Vouza-supplied) API key is configured
  // AND whether that key actually works. The actual key is NEVER exposed.
  // Set VOUZA_API_KEY (and optionally VOUZA_API_PROVIDER, VOUZA_API_MODEL, VOUZA_BRAND_NAME)
  // as environment variables in start.bat or ecosystem.config.cjs.
  //
  // defaultKeyStatus: "valid" | "invalid" | "unchecked"
  //   The mere presence of VOUZA_API_KEY does NOT mean it works — a revoked or
  //   expired key is still a non-empty string. Reporting "ready" off presence
  //   alone produced a confusing UX where the banner said Ready but every chat
  //   failed with "Invalid API key" (the shared key was revoked when the repo
  //   went public). We now verify the key against the provider (cached) so the
  //   dashboard can tell the truth.
  app.get("/api/operator-defaults", async (_req, res) => {
    const hasDefaultKey = !!(process.env.VOUZA_API_KEY || "").trim();
    const { status, detail } = hasDefaultKey
      ? await verifyOperatorKey()
      : { status: "unchecked" as const, detail: undefined as string | undefined };
    res.json({
      hasDefaultKey,
      defaultKeyStatus: status,
      defaultKeyDetail: detail,
      defaultProvider: process.env.VOUZA_API_PROVIDER || DEFAULT_OPERATOR_PROVIDER,
      defaultModel:    process.env.VOUZA_API_MODEL    || DEFAULT_OPERATOR_MODEL,
      // The browser reads these instead of keeping its own copy of model IDs.
      openrouterTiers: DEFAULT_OPENROUTER_TIERS,
      defaultModelForNewSetup: DEFAULT_MODEL,
      defaultProviderForNewSetup: DEFAULT_PROVIDER,
      brandName:       process.env.VOUZA_BRAND_NAME   || "Vouza",
    });
  });

  // --- Provider Health API ---
  // Returns per-provider circuit-breaker state so the dashboard can show
  // "Anthropic temporarily failed over to OpenAI" if applicable. Empty
  // object means everything is healthy (no failures recorded).
  app.get("/api/provider-health", (_req, res) => {
    res.json(getProviderHealth());
  });

  // --- Chat History (PDPA compliance: access + erasure) ─────────────────────
  // Server-side append-only audit log of every turn that flowed through the
  // agent. Distinct from /api/conversations which is client-driven.
  //
  // GET    /api/chat-history             — list session summaries (newest first)
  // GET    /api/chat-history/:sessionId  — full transcript (PDPA right of access)
  // DELETE /api/chat-history/:sessionId  — wipe transcript (PDPA right to erasure)
  app.get("/api/chat-history", requireLocalOrigin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 500);
      const sessions = await listChatSessions(limit);
      res.json(sessions);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/api/chat-history/:sessionId", requireLocalOrigin, async (req, res) => {
    try {
      const turns = await loadChatHistory(String(req.params.sessionId));
      res.json({ sessionId: req.params.sessionId, turnCount: turns.length, turns });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete("/api/chat-history/:sessionId", requireLocalOrigin, async (req, res) => {
    try {
      const result = await deleteChatSession(String(req.params.sessionId));
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Budget Status API ---
  // Returns today's spend against the Vouza fallback-key daily cap. Only
  // meaningful when the Guide Bot is running on Vouza's shared key — when
  // the user has their own key, spend is always reported as $0 because
  // we don't track it (user controls their own platform limits).
  app.get("/api/budget-status", async (_req, res) => {
    try {
      const snapshot = await getBudgetSnapshot();
      res.json({
        date:      snapshot.date,
        spentUsd:  Number(snapshot.totalUsd.toFixed(4)),
        capUsd:    snapshot.cap,
        remaining: Math.max(0, Number((snapshot.cap - snapshot.totalUsd).toFixed(4))),
        pctUsed:   Math.min(100, Math.round((snapshot.totalUsd / snapshot.cap) * 100)),
        byProvider: snapshot.byProvider,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- MCP (Model Context Protocol) ---
  // List configured servers + curated suggestions for the dashboard.
  // Power-user feature — non-tech users don't see this in the wizard.
  app.get("/api/mcp/servers", requireLocalOrigin, async (_req, res) => {
    try {
      const { mcpClientManager } = await import("../../mcp/client.js");
      const { MCP_SUGGESTIONS } = await import("../../mcp/suggestions.js");
      res.json({
        servers:     mcpClientManager.list(),
        status:      mcpClientManager.getAllStatus(),
        suggestions: MCP_SUGGESTIONS,
        toolCount:   mcpClientManager.getAllTools().length,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Add or update a server config (re-applies + reconnects)
  app.post("/api/mcp/servers", requireLocalOrigin, async (req, res) => {
    try {
      const { mcpClientManager } = await import("../../mcp/client.js");
      const config = req.body;
      if (!config?.id || !config?.command) {
        return res.status(400).json({ error: "MCP server config requires id and command" });
      }
      await mcpClientManager.upsertServer(config);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Remove a server entirely
  app.delete("/api/mcp/servers/:id", requireLocalOrigin, async (req, res) => {
    try {
      const { mcpClientManager } = await import("../../mcp/client.js");
      await mcpClientManager.removeServer(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Manually reconnect a server (e.g. after fixing its env vars)
  app.post("/api/mcp/servers/:id/connect", requireLocalOrigin, async (req, res) => {
    try {
      const { mcpClientManager } = await import("../../mcp/client.js");
      await mcpClientManager.disconnect(String(req.params.id));
      await mcpClientManager.connect(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // --- Folder Access Grants (Phase 1 — opt-in folders outside the workspace) ---
  // SECURITY: grant/revoke happens ONLY here, behind requireLocalOrigin.
  // There is deliberately NO agent-callable tool that adds grants — the agent
  // can never grant itself folder access.
  app.get("/api/folder-grants", requireLocalOrigin, async (_req, res) => {
    try {
      const { loadGrants } = await import("../../files/folderGrants.js");
      res.json({ grants: loadGrants() });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Resolved quick-add suggestions — the server resolves %USERPROFILE% so the
  // client never has to guess Windows paths.
  app.get("/api/folder-grants/suggestions", requireLocalOrigin, async (_req, res) => {
    try {
      const home = os.homedir();
      res.json({
        suggestions: [
          { label: "Downloads", path: join(home, "Downloads") },
          { label: "Desktop",   path: join(home, "Desktop") },
          { label: "Documents", path: join(home, "Documents") },
        ],
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/folder-grants", requireLocalOrigin, async (req, res) => {
    try {
      const { addGrant } = await import("../../files/folderGrants.js");
      const { path, mode } = req.body || {};
      if (!path || typeof path !== "string") {
        return res.status(400).json({ error: "Folder path is required." });
      }
      const grant = addGrant(path, mode === "readwrite" ? "readwrite" : "read");
      res.json({ ok: true, grant });
    } catch (err) {
      // Validation errors carry specific, user-facing messages → 400
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/folder-grants", requireLocalOrigin, async (req, res) => {
    try {
      const { removeGrant } = await import("../../files/folderGrants.js");
      const { path } = req.body || {};
      if (!path || typeof path !== "string") {
        return res.status(400).json({ error: "Folder path is required." });
      }
      const removed = removeGrant(path);
      res.json({ ok: true, removed });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Unified Integration Snapshot (Tier 1 Connection Foundation) ---
  // Returns a single snapshot of every registered integration's status +
  // recent probe history + auto-recovery state. The dashboard reads this
  // for live status badges so they reflect REAL liveness (background
  // probes run every 60s) instead of one-shot field-presence checks.
  app.get("/api/integrations/snapshot", requireLocalOrigin, async (_req, res) => {
    try {
      const { healthMonitor } = await import("../../integrations/healthMonitor.js");
      const { integrationRegistry } = await import("../../integrations/registry.js");
      res.json({
        generatedAt: new Date().toISOString(),
        meta:        integrationRegistry.meta(),
        snapshot:    healthMonitor.snapshot(),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- M3 Observability: detailed health (rolling-window rollups) ---
  // Reads HealthMonitor's 1000-event-per-integration FIFO window and returns:
  //   - per-integration p50/p95 latency (last 1h)
  //   - last success / last error timestamps + message
  //   - retry count (last 24h)
  //   - webhook log (last 50 across integrations)
  //   - failed actions (last 20 across integrations)
  app.get("/api/health/detailed", requireLocalOrigin, handleHealthDetailed);

  // --- Network activity: every outside service contacted, and why ---
  app.get("/api/network-activity", requireLocalOrigin, (_req, res) => {
    res.json(getNetActivity(150));
  });

  // --- Privacy settings: learning steps on/off, where the AI runs ---
  app.get("/api/privacy-settings", requireLocalOrigin, async (_req, res) => {
    const cfg = await loadSetupConfig();
    res.json({
      learnFromConversations: cfg.learnFromConversations !== false,
      aiRunsLocally:          cfg.agent?.provider === "ollama",
      healthCheckMinutes:     Math.round(HEALTH_PROBE_INTERVAL_MS / 60_000),
      autoUpdateCheck:        cfg.autoUpdateCheck !== false,
    });
  });

  app.post("/api/privacy-settings", requireLocalOrigin, async (req, res) => {
    const { learnFromConversations, autoUpdateCheck } = (req.body ?? {}) as { learnFromConversations?: unknown; autoUpdateCheck?: unknown };
    if (autoUpdateCheck !== undefined) {
      if (typeof autoUpdateCheck !== "boolean") {
        return res.status(400).json({ success: false, error: "autoUpdateCheck must be true or false" });
      }
      const cfg = await loadSetupConfig();
      cfg.autoUpdateCheck = autoUpdateCheck;
      await saveSetupConfig(cfg);
      if (learnFromConversations === undefined) return res.json({ success: true, autoUpdateCheck });
    }
    if (typeof learnFromConversations !== "boolean") {
      return res.status(400).json({ success: false, error: "learnFromConversations must be true or false" });
    }
    const cfg = await loadSetupConfig();
    cfg.learnFromConversations = learnFromConversations;
    await saveSetupConfig(cfg);
    // Takes effect immediately — the running agent and open chats included.
    const apply = (ctx: { config: { learnFromConversations?: boolean } }) => { ctx.config.learnFromConversations = learnFromConversations; };
    if (agentInstance) apply(agentInstance.context);
    forEachChatContext(apply);
    res.json({ success: true, learnFromConversations });
  });

  // --- M3 Setup Wizard: SSE-streaming pipeline test ---
  // POST { integration, input } → SSE stream of step-by-step progress
  // (detect → validate → test → save → confirm → live-test). Wraps the M2
  // orchestrator runner and cleans up listeners on client disconnect.
  app.post("/api/setup/pipeline/test", requireLocalOrigin, handleSetupPipelineTest);

  // --- Quick Setup: "paste it, click Next, the agent does the rest" ---
  // Shares the launch path (and the `launching` race guard) with /api/agent/launch.
  const ensureAgentRunning = async (): Promise<{ ok: boolean; error?: string }> => {
    if (agentInstance) return { ok: true };
    if (launching) return { ok: false, error: "The assistant is already starting — give it a few seconds." };
    launching = true;
    try {
      agentInstance = await launchAgent();
      setAgentInstance(agentInstance);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    } finally {
      launching = false;
    }
  };
  registerQuickSetupRoutes(app, {
    requireLocalOrigin,
    loadConfig:   loadSetupConfig,
    saveConfig:   saveSetupConfig,
    mergeConfig:  deepMerge,
    getAgent:     () => agentInstance,
    launchAgent:  ensureAgentRunning,
    restartAgent: async () => {
      if (agentInstance) {
        try { await agentInstance.stop(); } catch { /* relaunch anyway */ }
        agentInstance = null;
        setAgentInstance(null);
      }
      return ensureAgentRunning();
    },
    operatorKeyUsable: async () =>
      !!(process.env.VOUZA_API_KEY || "").trim() && (await verifyOperatorKey()).status !== "invalid",
  });

  // --- Manually probe a single integration (live API call right now) ---
  app.post("/api/integrations/:id/probe", requireLocalOrigin, async (req, res) => {
    try {
      const { integrationRegistry } = await import("../../integrations/registry.js");
      const integration = integrationRegistry.get(String(req.params.id));
      if (!integration) return res.status(404).json({ error: `Unknown integration: ${req.params.id}` });
      const probe = await integration.probe();
      res.json({ id: integration.id, displayName: integration.displayName, probe });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Reset a single integration (wipes session state + reconnects) ---
  app.post("/api/integrations/:id/reset", requireLocalOrigin, async (req, res) => {
    try {
      const { integrationRegistry } = await import("../../integrations/registry.js");
      const result = await integrationRegistry.reset(String(req.params.id));
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, message: String(err) });
    }
  });

  // --- Live Connection Diagnostics ---
  // Runs an actual API call against each configured integration's endpoint
  // and reports per-integration pass/fail with the specific error. This is
  // the "tell me exactly what's wrong" page a beta tester asked for after seeing
  // ✓ checkmarks but 401 errors on the bot.
  //
  // For each check, we report:
  //   { name, ok, latencyMs, keySource (user/operator/env), keyPreview, error? }
  app.get("/api/connection-test", requireLocalOrigin, async (_req, res) => {
    const config = await loadSetupConfig();
    const creds  = config.credentials || {};
    const results: any[] = [];

    const mask = (k: string | undefined) =>
      !k ? "(empty)" : k.length < 10 ? "***" : `${k.slice(0, 8)}…${k.slice(-4)}`;

    const time = async (label: string, fn: () => Promise<any>) => {
      const t0 = Date.now();
      try {
        const r = await fn();
        return { name: label, ok: true, latencyMs: Date.now() - t0, ...r };
      } catch (err: any) {
        return { name: label, ok: false, latencyMs: Date.now() - t0, error: String(err?.message || err) };
      }
    };

    // ── AI provider — which key is actually being used? ──────────────────
    // Mirror the resolution logic in loader.ts exactly so what we report
    // here matches what the agent will actually use at runtime.
    const operatorKey      = (process.env.VOUZA_API_KEY      || "").trim();
    const operatorProvider = (process.env.VOUZA_API_PROVIDER || "openrouter");
    let activeProvider = config.agent?.provider || "anthropic";
    let activeKey: string | undefined = "";
    let keySource = "missing";
    const userKeyField = `${activeProvider}ApiKey`;
    if (creds[userKeyField] && String(creds[userKeyField]).trim()) {
      activeKey = String(creds[userKeyField]).trim();
      keySource = "user (config.json)";
    } else if (operatorKey) {
      activeProvider = operatorProvider;
      activeKey = operatorKey;
      keySource = "operator (VOUZA_API_KEY env)";
    }

    // Local AI needs no key; the check is just "is it running on this computer?"
    if (activeProvider === "ollama" && config.agent?.model) {
      activeKey = "ollama";
      keySource = "local AI (no key)";
    }

    results.push(await time(`AI Provider (${activeProvider})`, async () => {
      if (!activeKey) throw new Error("No API key found — neither user nor operator key is set");
      // Free, AUTH-GATED key check from the shared endpoint table (Rule 66).
      const { url: baseUrl, headers } = keyCheckRequest(activeProvider as AIProvider, activeKey, {
        ollamaBaseUrl: config.agent?.ollamaBaseUrl,
      });
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(baseUrl, { headers, signal: ctrl.signal });
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}: ${body.slice(0, 200) || r.statusText}`);
        }
        return { keySource, keyPreview: mask(activeKey), detail: `Reached ${baseUrl.split("/")[2]} successfully` };
      } finally { clearTimeout(t); }
    }));

    // ── Telegram ─────────────────────────────────────────────────────────
    const tgToken = config.channels?.telegram?.config?.telegramToken
                 || config.channels?.telegram?.config?.telegramBotToken
                 || config.channels?.telegram?.config?.botToken;
    if (tgToken) {
      results.push(await time("Telegram (getMe)", async () => {
        const r = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.ok) throw new Error(`HTTP ${r.status}: ${data.description || r.statusText}`);
        return { detail: `@${data.result?.username || "bot"} (${data.result?.first_name || ""})`, keyPreview: mask(String(tgToken)) };
      }));
    } else {
      results.push({ name: "Telegram", ok: false, skipped: true, error: "Not configured" });
    }

    // ── WhatsApp (Baileys) — check listener state ────────────────────────
    if (config.channels?.whatsapp?.enabled && config.channels.whatsapp.provider === "web") {
      const baileysState = isBaileysConnected() ? "connected" : "not-connected";
      const status = baileysState === "connected" ? "✓ Linked to WhatsApp" : "⚠ Not linked — click Connect WhatsApp to scan a fresh QR";
      results.push({
        name: "WhatsApp (Baileys)",
        ok: baileysState === "connected",
        latencyMs: 0,
        skipped: false,
        detail: status,
        keyPreview: "(no key — QR scan)",
        error: baileysState === "connected" ? undefined : "Not connected. Common causes: 4-linked-device limit reached, antivirus blocking WebSocket, or stale auth in data/whatsapp-auth/.",
      });
    }

    // ── Voice (Groq Whisper) ─────────────────────────────────────────────
    if (creds.groqApiKey) {
      results.push(await time("Voice (Groq Whisper)", async () => {
        const r = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${creds.groqApiKey}` },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        return { detail: "Groq API key valid", keyPreview: mask(creds.groqApiKey) };
      }));
    }

    // ── Gmail SMTP ───────────────────────────────────────────────────────
    const gmailUser = config.channels?.email?.config?.gmailUser;
    const gmailPass = config.channels?.email?.config?.gmailPass || config.channels?.email?.config?.gmailAppPassword;
    if (gmailUser && gmailPass) {
      results.push({
        name: "Gmail SMTP", ok: true, latencyMs: 0, skipped: true,
        detail: "Credentials present — live SMTP test runs on actual send",
        keyPreview: mask(String(gmailPass)),
      });
    }

    // ── Summary ──────────────────────────────────────────────────────────
    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        total:   results.length,
        passed:  results.filter((r) => r.ok && !r.skipped).length,
        failed:  results.filter((r) => !r.ok && !r.skipped).length,
        skipped: results.filter((r) => r.skipped).length,
      },
      activeProvider,
      activeKeySource: keySource,
      results,
    });
  });

  // --- Recent Logs (tail) ---
  // Returns the last N entries from data/logs/admin-agent.log as parsed JSON.
  // Used by the live log viewer in the Health panel so the operator can see
  // exactly what the agent is doing without SSHing in.
  app.get("/api/recent-logs", requireLocalOrigin, async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? "50"), 10) || 50));
      const logPath = join(process.cwd(), "data", "logs", "admin-agent.log");
      const raw = await readFile(logPath, "utf8").catch((err: any) => {
        if (err?.code === "ENOENT") return "";
        throw err;
      });
      const lines = raw.split("\n").filter((l: string) => l.trim().length > 0).slice(-limit);
      const entries = lines.map((l: string) => {
        try { return JSON.parse(l); } catch { return { raw: l.slice(0, 500) }; }
      });
      res.json({ entries, count: entries.length });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Diagnostic Bundle ---
  // One-click "report an issue" support. Bundles:
  //   - Agent version + Node version + platform
  //   - Current agent status snapshot
  //   - Provider health + budget snapshot
  //   - Last 100 lines of structured log
  //   - REDACTED config (all secrets masked) — never include unmasked
  //   - Last 5 shell audit entries
  //
  // The user downloads this as a single JSON file they can attach to a
  // support email or paste into a GitHub issue. Far better than asking
  // a non-technical user to "send me the logs".
  app.get("/api/diagnostic-bundle", requireLocalOrigin, async (_req, res) => {
    const bundle: any = {
      format:    "vouza-admin-agent-diagnostic",
      version:   1,
      generated: new Date().toISOString(),
      runtime:   {
        nodeVersion: process.version,
        platform:    process.platform,
        arch:        process.arch,
        uptimeSec:   Math.round(process.uptime()),
        pid:         process.pid,
      },
    };

    // 1. Package version
    try {
      const pkgRaw = await readFile(join(process.cwd(), "package.json"), "utf8");
      const pkg = JSON.parse(pkgRaw);
      bundle.agentVersion = pkg.version;
    } catch { /* non-fatal */ }

    // 2. REDACTED config — copy the masking logic from GET /api/config
    try {
      const config = await loadSetupConfig();
      const masked: any = { ...config, credentials: { ...config.credentials } };
      for (const [k, v] of Object.entries(masked.credentials)) {
        if (isSensitiveField(k)) masked.credentials[k] = maskKey(v as string);
      }
      for (const ch of Object.values(masked.channels) as any[]) {
        ch.config = { ...ch.config };
        for (const [k, v] of Object.entries(ch.config)) {
          if (isSensitiveField(k)) ch.config[k] = maskKey(v as string);
        }
      }
      for (const t of Object.values(masked.tools) as any[]) {
        t.config = { ...t.config };
        for (const [k, v] of Object.entries(t.config)) {
          if (isSensitiveField(k)) t.config[k] = maskKey(v as string);
        }
      }
      bundle.config = masked;
    } catch (err) { bundle.configError = String(err); }

    // 3. Agent status snapshot
    try {
      bundle.agentStatus = agentInstance ? await getAgentStatus(agentInstance) : { running: false };
    } catch (err) { bundle.agentStatusError = String(err); }

    // 4. Provider failover + budget
    try { bundle.providerHealth = getProviderHealth(); } catch (err) { bundle.providerHealthError = String(err); }
    try {
      const snap = await getBudgetSnapshot();
      bundle.budget = {
        date:        snap.date,
        spentUsd:    Number(snap.totalUsd.toFixed(4)),
        capUsd:      snap.cap,
        byProvider:  snap.byProvider,
      };
    } catch (err) { bundle.budgetError = String(err); }

    // 5. Last 100 lines of the structured log (most recent first)
    try {
      const logPath = join(process.cwd(), "data", "logs", "admin-agent.log");
      const raw = await readFile(logPath, "utf8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0).slice(-100);
      bundle.recentLogs = lines.map((l) => {
        try { return JSON.parse(l); } catch { return { raw: l.slice(0, 500) }; }
      });
    } catch (err: any) {
      // Log file missing is normal for very-recent installs; surface but don't fail
      bundle.recentLogsError = err?.code === "ENOENT" ? "no log file yet" : String(err);
    }

    // 6. Last 5 shell audit entries
    try {
      const auditPath = join(process.cwd(), "data", "shell-audit.log");
      const raw = await readFile(auditPath, "utf8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0).slice(-5);
      bundle.recentShellAudit = lines.map((l) => {
        try { return JSON.parse(l); } catch { return { raw: l.slice(0, 300) }; }
      });
    } catch { /* non-fatal */ }

    const filename = `vouza-diagnostic-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(JSON.stringify(bundle, null, 2));
  });

  // --- Version + Changelog ---
  // Used by the frontend's "What's new" notifier — surfaces unread changes
  // since the user last dismissed the changelog modal.
  app.get("/api/version", async (_req, res) => {
    try {
      // Read version from package.json (single source of truth, no hardcoded
      // strings to forget to update on release)
      const pkgRaw = await readFile(join(process.cwd(), "package.json"), "utf8");
      const pkg = JSON.parse(pkgRaw);
      let changelog = "";
      try {
        changelog = await readFile(join(process.cwd(), "CHANGELOG.md"), "utf8");
      } catch { /* CHANGELOG.md may not exist on older installs */ }
      res.json({ version: pkg.version || "0.0.0", changelog });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Is a newer version on GitHub? (only when the person presses the button) ---
  // Compares this install's package.json version with the latest GitHub
  // Release, so people on an old copy find out instead of assuming they're
  // current. VOUZA_UPDATE_REPO overrides the repository ("owner/name").
  //
  // ?auto=1 is the dashboard's own once-a-day check, so people on an old
  // version are told without having to think of pressing a button. It only
  // asks GitHub for the latest version number (nothing about the user is
  // sent), is cached for a day, shows in the Network list as "update check",
  // and is skipped when switched off in System Health -> Privacy & network.
  app.get("/api/update-check", requireLocalOrigin, async (req, res) => {
    try {
      const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
      const current = String(pkg.version || "0.0.0");
      const auto = req.query.auto === "1";
      if (auto) {
        const cfg = await loadSetupConfig();
        if (cfg.autoUpdateCheck === false) return res.json({ ok: true, skipped: true, current });
        if (_updateCache && Date.now() - _updateCache.at < UPDATE_CHECK_TTL_MS && _updateCache.current === current) {
          return res.json(_updateCache.result);
        }
      }
      const repo = (process.env.VOUZA_UPDATE_REPO || "geechun80/vouza-admin-agent").trim();
      const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "vouza-admin-agent" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return res.json({ ok: false, current, error: `GitHub answered HTTP ${r.status}` });
      const rel = await r.json() as { tag_name?: string; html_url?: string; name?: string };
      const latest = String(rel.tag_name || "").replace(/^v/i, "");
      const result = { ok: true, current, latest, updateAvailable: isNewerVersion(latest, current), url: rel.html_url };
      _updateCache = { at: Date.now(), current, result };
      res.json(result);
    } catch (err: any) {
      res.json({ ok: false, error: `Couldn't reach GitHub: ${String(err?.message || err)}` });
    }
  });

  // --- Restore / Import ---
  // Replaces the user's full configuration with a previously-exported backup.
  // Destructive operation — must auto-backup current state first so a bad
  // import can always be rolled back. Validates format envelope to reject
  // arbitrary uploads (someone pasting their grocery list as JSON).
  app.post("/api/import-config", requireLocalOrigin, async (req, res) => {
    try {
      let bundle = req.body;

      // 0. A locked backup (2.3.0+) is opened with the password typed in the
      //    dashboard; older unlocked backups restore as before.
      if (isLockedBackup(bundle)) {
        try {
          bundle = await unlockBackup(bundle, String(req.body?.password ?? ""));
        } catch (err) {
          if (err instanceof BackupPasswordError) return res.status(400).json({ ok: false, wrongPassword: true, error: err.message });
          throw err;
        }
      }

      // 1. Validate envelope — must look like one of our backups
      if (!bundle || bundle.format !== PLAIN_BACKUP_FORMAT) {
        return res.status(400).json({
          ok: false,
          error: "This doesn't look like a Vouza backup file. Expected format: vouza-admin-agent-backup."
        });
      }
      if (!bundle.config || typeof bundle.config !== "object") {
        return res.status(400).json({ ok: false, error: "Backup is missing config — cannot restore." });
      }
      if (bundle.version !== 1) {
        return res.status(400).json({
          ok: false,
          error: `Backup format version ${bundle.version} is not supported by this agent version.`,
        });
      }

      // 2. Auto-backup current state BEFORE writing — gives us a rollback point
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rollbackPath = join(process.cwd(), "data", `config.json.before-restore-${stamp}.bak`);
      try {
        const currentRaw = await readFile(CONFIG_PATH, "utf8");
        await writeFile(rollbackPath, currentRaw, "utf8");
      } catch {
        // If there's no current config, nothing to back up — that's fine.
      }

      // 3. Write the restored config atomically, secrets encrypted for THIS
      //    computer (a backup carries them readable so it can move machines).
      await writeSealedJson(CONFIG_PATH, bundle.config);

      // 4. Best-effort memory restore — failures don't fail the whole import
      let memoriesRestored = 0;
      if (Array.isArray(bundle.memories) && bundle.memories.length > 0) {
        try {
          const memDir = join(process.cwd(), "data", "memory");
          const store = createMemoryStore(memDir);
          await store.load();
          for (const m of bundle.memories) {
            if (m && m.type && m.title && m.content) {
              await store.add({ type: m.type, title: m.title, content: m.content, tags: m.tags || [] }).catch(() => {});
              memoriesRestored++;
            }
          }
        } catch { /* keep going */ }
      }

      res.json({
        ok: true,
        restored: {
          config:        true,
          memories:      memoriesRestored,
          conversations: 0, // intentionally NOT restored — would clobber active threads
        },
        rollbackPath: rollbackPath.split(/[\\/]/).pop(),  // basename only — don't leak full path
        message: `✅ Restored! ${memoriesRestored} memor${memoriesRestored === 1 ? 'y' : 'ies'} re-added. Previous config saved as ${rollbackPath.split(/[\\/]/).pop()} in case you need to roll back. Restart the agent for changes to take effect.`,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // --- Backup / Export ---
  // Returns the user's complete configuration + memories + recent chat
  // history as a single downloadable JSON file. Useful for:
  //   - Migrating to a new machine
  //   - Insurance against hard drive failure
  //   - Sharing a fully-configured agent with a colleague
  //
  // Credentials are inside (they must move to the new machine), so the file is
  // always locked with a password the person chooses (security/backupCrypto).
  app.get("/api/export-config", requireLocalOrigin, (_req, res) => {
    // Pre-2.3.0 dashboards downloaded an unlocked file from here.
    res.status(410).json({ error: "Backups now need a password. Reload the dashboard (Shift+F5) and try again." });
  });

  app.post("/api/export-config", requireLocalOrigin, async (req, res) => {
    const password = req.body?.password;
    const problem = backupPasswordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    try {
      const config = await loadSetupConfig();

      // Best-effort: load memories. Fails open if memory store has issues.
      let memories: any[] = [];
      try {
        const memDir = join(process.cwd(), "data", "memory");
        const store = createMemoryStore(memDir);
        await store.load();
        memories = Array.from(store.entries.values());
      } catch { /* keep memories: [] */ }

      // Best-effort: include last 50 conversation summaries (titles only, not full
      // chat content — keeps backup small + privacy-friendlier). User can grab
      // full transcripts separately via the chat-history endpoints if needed.
      let conversations: any[] = [];
      try {
        const files = (await readdir(join(process.cwd(), "data", "conversations")))
          .filter((f) => f.endsWith(".json"))
          .slice(0, 50);
        for (const f of files) {
          try {
            const raw = await readFile(join(process.cwd(), "data", "conversations", f), "utf8");
            const c = JSON.parse(raw);
            conversations.push({ id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messageCount });
          } catch { /* skip corrupt files */ }
        }
      } catch { /* dir missing — skip */ }

      const bundle = {
        format:        PLAIN_BACKUP_FORMAT,
        version:       1,
        exportedAt:    new Date().toISOString(),
        agentName:     config.agent?.name || "Admin Agent",
        config,                  // includes credentials — hence the lock below
        memories,
        conversations,
      };

      const filename = `vouza-backup-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(await lockBackup(bundle, password), null, 2));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // --- Config API ---
  // Same "this computer only" check as every other config route — blocks a
  // malicious site using DNS rebinding from reading email/phone/allow-list.
  app.get("/api/config", requireLocalOrigin, async (_req, res) => {
    const config = await loadSetupConfig();
    const masked = { ...config, credentials: { ...config.credentials } };
    // Mask all sensitive credential fields (key/token/secret/pass/password)
    for (const [k, v] of Object.entries(masked.credentials)) {
      if (isSensitiveField(k)) masked.credentials[k] = maskKey(v);
    }
    for (const ch of Object.values(masked.channels)) {
      ch.config = { ...ch.config };
      for (const [k, v] of Object.entries(ch.config)) {
        if (isSensitiveField(k)) ch.config[k] = maskKey(v);
      }
    }
    masked.tools = { ...masked.tools };
    for (const [name, tool] of Object.entries(masked.tools)) {
      const t: any = { ...(tool as any) };
      t.config = { ...t.config };
      for (const [k, v] of Object.entries(t.config)) {
        if (isSensitiveField(k)) t.config[k] = maskKey(v as string);
      }
      // Some tools (e.g. smtp) keep credentials at the top level, not in config.
      for (const [k, v] of Object.entries(t)) {
        if (k !== "config" && typeof v === "string" && isSensitiveField(k)) t[k] = maskKey(v);
      }
      (masked.tools as any)[name] = t;
    }
    res.json(masked);
  });

  app.post("/api/config", requireLocalOrigin, async (req, res) => {
    try {
      const updates: Partial<SetupConfig> = req.body;
      // Model ids come from a free-text box now — keep them to id characters.
      const ids = [updates?.agent?.model, ...Object.values(updates?.agent?.openrouterTiers ?? {})].filter((v) => v !== undefined && v !== "");
      if (ids.some((v) => !isValidModelId(v))) {
        return res.status(400).json({ success: false, error: "That doesn't look like a model ID (letters, numbers and . _ : / @ + - only)." });
      }
      const current = await loadSetupConfig();
      const merged = deepMerge(current, updates);
      await saveSetupConfig(merged);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  app.post("/api/config/step/:step", requireLocalOrigin, async (req, res) => {
    try {
      const current = await loadSetupConfig();
      const step = req.params.step;
      const data = req.body;

      switch (step) {
        case "agent":
          current.agent = { ...current.agent, ...data };
          break;
        case "channels":
          current.channels = deepMerge(current.channels, data);
          break;
        case "tools":
          current.tools = deepMerge(current.tools, data);
          break;
        case "credentials":
          current.credentials = { ...current.credentials, ...data };
          break;
        case "skills":
          current.skills = { ...current.skills, ...data };
          break;
        case "complete":
          current.setupCompleted = true;
          current.setupCompletedAt = new Date().toISOString();
          break;
      }

      await saveSetupConfig(current);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // --- Agent Launcher API ---
  app.post("/api/agent/launch", requireLocalOrigin, async (_req, res) => {
    try {
      if (agentInstance) {
        const status = await getAgentStatus(agentInstance);
        return res.json({ success: true, alreadyRunning: true, ...status });
      }
      // Prevent race: if auto-launch retry is in flight, report it as launching
      if (launching) {
        return res.json({ success: false, error: "Agent is already starting — please wait a moment." });
      }
      // Pre-flight: ensure a valid AI provider key is available before launching.
      // Priority: user's saved key → operator default key (VOUZA_API_KEY env var).
      // If neither exists, block launch with a clear error.
      const preFlight  = await loadSetupConfig();
      const savedCreds = preFlight.credentials || {};
      const provider   = preFlight.agent?.provider || "anthropic";
      const savedKey   =
        savedCreds[`${provider}ApiKey`] ||
        (provider === "openrouter" ? savedCreds["openrouterApiKey"] : undefined) ||
        (provider === "anthropic"  ? savedCreds["anthropicApiKey"]  : undefined);
      const operatorKey = (process.env.VOUZA_API_KEY || "").trim();
      const localAi     = provider === "ollama" && !!preFlight.agent?.model; // needs no key
      if (!localAi && (!savedKey || savedKey.trim().length < 8) && !operatorKey) {
        return res.json({
          success: false,
          error:
            `No AI API key found. ` +
            "Enter your key in Step 2, click 🔌 Test, then return to Go Live.",
        });
      }

      launching = true;
      try {
        agentInstance = await launchAgent();
        setAgentInstance(agentInstance);
      } finally {
        launching = false;
      }
      const status = await getAgentStatus(agentInstance);
      res.json({ success: true, ...status });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  app.post("/api/agent/stop", requireLocalOrigin, async (_req, res) => {
    try {
      if (agentInstance) {
        await agentInstance.stop();
        agentInstance = null;
        setAgentInstance(null);
      }
      res.json({ success: true });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  app.get("/api/agent/status", async (_req, res) => {
    if (agentInstance) {
      const status = await getAgentStatus(agentInstance);
      res.json(status);
    } else {
      res.json({ running: false });
    }
  });

  // ── Proactive schedules (Phase 2) ──────────────────────────────────────────
  // Backed by data/scheduled-tasks.json — works whether or not the agent is
  // running. When the agent IS running, updates re-register live cron jobs.

  app.get("/api/schedules", requireLocalOrigin, async (_req, res) => {
    try {
      const { listSchedules } = await import("../../tasks/proactive.js");
      res.json({ success: true, schedules: await listSchedules() });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  app.post("/api/schedules/:id", requireLocalOrigin, async (req, res) => {
    try {
      const id = req.params.id as string;
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
        return res.status(400).json({ success: false, error: "Invalid schedule id" });
      }
      const { enabled, time } = (req.body ?? {}) as { enabled?: unknown; time?: unknown };
      const { updateSchedule } = await import("../../tasks/proactive.js");
      const result = await updateSchedule(id, { enabled, time });
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      res.json({ success: true, record: result.record });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  app.post("/api/agent/task", requireLocalOrigin, async (req, res) => {
    if (!agentInstance) {
      return res.json({ success: false, error: "Agent not running. Launch it first." });
    }
    try {
      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ success: false, error: "message is required" });
      }
      if (message.length > 10_000) {
        return res.status(400).json({ success: false, error: "Message exceeds 10,000 character limit" });
      }
      let output = "";
      for await (const event of agentInstance.runTask(message)) {
        if (event.type === "text_delta") output += event.text;
      }
      res.json({ success: true, output });
    } catch (err) {
      res.json({ success: false, error: "Task failed — check server logs for details" });
    }
  });

  // --- Test Connection API ---
  // requireLocalOrigin prevents any cross-origin page from using this endpoint
  // as an outbound relay to probe third-party credentials.
  app.post("/api/test-connection", requireLocalOrigin, async (req, res) => {
    const { type, config: connConfig } = req.body;
    try {
      const result = await testConnection(type, connConfig);
      res.json(result);
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  // --- Agent Status API ---
  app.get("/api/status", async (_req, res) => {
    if (agentInstance) {
      const status = await getAgentStatus(agentInstance);
      res.json(status);
    } else {
      res.json({
        running: false,
        uptime: 0,
        tasksCompleted: 0,
        memoryEntries: 0,
        skillsLoaded: 0,
        lastActivity: null,
      });
    }
  });

  // --- Live Agent Chat (SSE streaming) ---
  app.post("/api/chat", requireLocalOrigin, async (req, res) => {
    const { message, sessionId, apiKey, imageBase64, imageMimeType, wizardStep, userName, attachedFileContent, attachedFileName } = req.body as {
      message: string;
      sessionId: string;
      apiKey?: string;
      imageBase64?: string;
      imageMimeType?: string;
      wizardStep?: number;
      userName?: string;
      attachedFileContent?: string;
      attachedFileName?: string;
    };

    if (!message || !sessionId) {
      return res.status(400).json({ error: "message and sessionId are required" });
    }

    // ── Attached text/JSON file: prepend a preamble so the agent reads it as text
    // (built with plain string concatenation — Rule 56: never nested backticks inside template literals)
    let effectiveMessage = message;
    if (attachedFileContent && typeof attachedFileContent === "string") {
      const safeName = (attachedFileName && typeof attachedFileName === "string")
        ? attachedFileName.replace(/[\r\n]+/g, " ").slice(0, 120)
        : "attached.txt";
      // Cap raw file content at 200 KB to avoid context blowups
      const capped = attachedFileContent.length > 200_000
        ? attachedFileContent.slice(0, 200_000) + "\n\n[... truncated, file was larger than 200 KB ...]"
        : attachedFileContent;
      effectiveMessage =
        'User attached file "' + safeName + '":\n\n' +
        capped +
        "\n\n--- end of file ---\n\n" +
        message;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", `http://localhost:${port}`);
    res.flushHeaders();

    const send = (data: object) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const config = await loadSetupConfig();

      // Build message payload — include image block if provided
      let messagePayload: string | any[];
      if (imageBase64 && imageMimeType) {
        messagePayload = [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageMimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageBase64.replace(/^data:[^;]+;base64,/, ""), // strip data-URI prefix
            },
          },
          { type: "text", text: effectiveMessage },
        ];
      } else {
        messagePayload = effectiveMessage;
      }

      // `message` (not effectiveMessage) — an attached file's text must never
      // count as the person asking to go online.
      for await (const event of streamChat(sessionId, messagePayload, config, apiKey, wizardStep, userName, message)) {
        send(event);
      }
    } catch (err) {
      send({ type: "error", error: String(err) });
    } finally {
      send({ type: "done" });
      if (!res.writableEnded) res.end();
    }
  });

  // Clear a chat session (resets conversation history)
  app.delete("/api/chat/session/:sessionId", requireLocalOrigin, (req, res) => {
    clearSession(req.params.sessionId as string);
    res.json({ success: true });
  });

  // --- Voice Transcription (OpenAI Whisper) ---
  // Accepts base64-encoded audio from the browser microphone or uploaded audio file.
  app.post("/api/transcribe", requireLocalOrigin, async (req, res) => {
    const { audioBase64, mimeType, filename, language } = req.body as {
      audioBase64: string;
      mimeType:    string;
      filename?:   string;
      language?:   string;
    };

    if (!audioBase64 || !mimeType) {
      return res.status(400).json({ success: false, error: "audioBase64 and mimeType are required" });
    }

    try {
      // Resolve Whisper provider from saved config
      // Priority: explicit voice tool card > Groq key > OpenAI key
      const config  = await loadSetupConfig();
      const creds   = config.credentials || {};
      const voiceCfg = config.tools?.voice;

      let whisperKey     = "";
      let whisperBaseUrl = "https://api.openai.com/v1";
      let whisperModel   = "whisper-1";

      if (voiceCfg?.enabled) {
        const prov = voiceCfg.provider || "groq";
        const vKey = prov === "groq"
          ? (voiceCfg.config?.groqApiKey   || creds.groqApiKey   || "")
          : (voiceCfg.config?.openaiApiKey || creds.openaiApiKey || "");
        if (vKey) {
          whisperKey = vKey;
          if (prov === "groq") { whisperBaseUrl = "https://api.groq.com/openai/v1"; whisperModel = "whisper-large-v3-turbo"; }
        }
      }
      if (!whisperKey) {
        if (creds.groqApiKey)   { whisperKey = creds.groqApiKey;   whisperBaseUrl = "https://api.groq.com/openai/v1"; whisperModel = "whisper-large-v3-turbo"; }
        else if (creds.openaiApiKey) { whisperKey = creds.openaiApiKey; }
      }

      if (!whisperKey) {
        return res.json({
          success: false,
          error:
            "Voice transcription needs a free Groq key or an OpenAI key.\n" +
            "• Groq (free & fast): console.groq.com/keys\n" +
            "• OpenAI: platform.openai.com/api-keys\n" +
            "Add it in the setup wizard → Step 2 → Voice Transcription card.",
        });
      }

      // Decode base64 → Buffer (strip data-URI prefix if present)
      const rawBase64   = audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(rawBase64, "base64");
      const fname       = filename || `recording.${mimeType.split("/")[1]?.split(";")[0] || "webm"}`;

      // Build FormData and call Whisper
      const formData = new FormData();
      const blob     = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      formData.append("file",            blob, fname);
      formData.append("model",           whisperModel);
      formData.append("response_format", "json");
      if (language) formData.append("language", language);

      const whisperRes = await fetch(`${whisperBaseUrl}/audio/transcriptions`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${whisperKey}` },
        body:    formData,
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.text();
        return res.json({ success: false, error: `Whisper API error: ${err.slice(0, 300)}` });
      }

      const data = await whisperRes.json();
      res.json({ success: true, transcript: (data.text ?? "").trim() });
    } catch (err) {
      res.json({ success: false, error: `Transcription failed: ${err}` });
    }
  });

  // --- WhatsApp WAHA Webhook ---
  // WAHA POSTs events here when messages arrive.
  // Setup: in the WAHA dashboard (http://localhost:3000) → Webhooks → add:
  //   URL: http://localhost:3456/api/whatsapp/webhook   (or your server's URL)
  //   Events: message  (or "message.any" to also catch group messages)
  app.post("/api/whatsapp/webhook", (req, res) => {
    // Schema validation — reject payloads that don't match the WAHA event structure.
    // This limits prompt-injection attempts via crafted POST requests.
    // A valid WAHA event always has: { event: string, payload: object, session: string }
    const body = req.body;
    if (
      !body ||
      typeof body.event    !== "string" ||
      typeof body.payload  !== "object" || body.payload === null ||
      typeof body.session  !== "string"
    ) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    // Only a running WAHA setup receives webhooks, and only with its API key
    // (WAHA sends it as X-Api-Key). Without a key any program on this
    // computer — or the network, in remote mode — could post fake customer
    // messages for the agent to act on, so a missing key is refused too.
    const wa = agentInstance?.context.config.tools?.whatsapp;
    if (!agentInstance || wa?.provider !== "waha") {
      return res.status(404).json({ error: "WhatsApp webhooks are not in use" });
    }
    const expectedKey = String((wa.config as any)?.apiKey ?? "").trim();
    if (!expectedKey) {
      console.warn("[WAHA] Webhook refused: set an API key in WAHA and in the Admin Agent (WhatsApp → WAHA API Key).");
      return res.status(403).json({ error: "WAHA API key required — set the same key in WAHA and in the Admin Agent" });
    }
    const providedKey = String(req.headers["x-api-key"] ?? "");
    if (!timingSafeEqual(providedKey, expectedKey)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // ACK immediately — WAHA expects a fast response, then process
    res.json({ success: true });
    handleWAHAEvent(req.body, agentInstance.context, agentInstance.registry);
  });

  // --- WhatsApp Baileys — QR code SSE stream ---
  // The dashboard subscribes to this endpoint to get real-time QR code updates.
  // When the user's phone scans, the stream sends a "connected" event and closes.
  app.get("/api/whatsapp/qr-stream", requireLocalOrigin, async (req, res) => {
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.flushHeaders();

    const sendEvent = (name: string, data: Record<string, unknown>) => {
      res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Already connected — tell the client immediately
    if (isBaileysConnected()) {
      sendEvent("connected", { message: "WhatsApp already connected!" });
      return res.end();
    }

    // Subscribe to QR and status events
    const offQR = onBaileysQR(async (qr) => {
      try {
        const dataUrl = await qrToDataURL(qr, { width: 300, margin: 2 });
        sendEvent("qr", { dataUrl });
      } catch {
        sendEvent("qr", { dataUrl: "" });
      }
    });

    const offStatus = onBaileysStatus((status: BaileysStatus) => {
      sendEvent("status", { status });
      if (status === "connected" || status === "logged_out") {
        cleanup();
      }
    });

    const cleanup = () => {
      offQR();
      offStatus();
      res.end();
    };

    req.on("close", cleanup);

    // Start Baileys if the agent is running and provider is "web"
    if (agentInstance) {
      const wa = agentInstance.context.config.tools?.whatsapp;
      if (!wa || wa.provider === "web" || !wa.provider) {
        startBaileysListener(agentInstance.context, agentInstance.registry).catch((err) => {
          sendEvent("error", { message: String(err) });
          cleanup();
        });
      } else {
        sendEvent("error", { message: "WhatsApp provider is not set to 'web'. Switch provider in the wizard." });
        cleanup();
      }
    } else {
      sendEvent("error", { message: "Agent not running — launch it first, then connect WhatsApp." });
      cleanup();
    }
  });

  // --- WhatsApp Baileys — logout (force new QR) ---
  app.post("/api/whatsapp/logout", requireLocalOrigin, async (_req, res) => {
    try {
      await stopBaileysListener();
      res.json({ success: true });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  // --- WhatsApp Baileys — RESET auth (fixes "Invalid QR code" errors) ---
  // Stops the worker, deregisters with WhatsApp, and DELETES the cached
  // auth files in data/whatsapp-auth/. Next /api/whatsapp/qr-stream call
  // will start a fresh pairing with a clean QR.
  app.post("/api/whatsapp/reset", requireLocalOrigin, async (_req, res) => {
    try {
      await resetBaileysAuth();
      res.json({ success: true, message: "WhatsApp auth reset — open the connect flow again for a fresh QR." });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // --- WhatsApp Baileys — connection status ---
  app.get("/api/whatsapp/status", (_req, res) => {
    res.json({ connected: isBaileysConnected() });
  });

  // --- AgentMail status ---
  app.get("/api/agentmail/status", (_req, res) => {
    const inbox = getAgentMailInbox();
    res.json({ configured: !!inbox, inbox });
  });

  // --- Service Health (Phase 3) ---
  // Returns per-service status for all channel listeners registered with
  // the ServiceManager.  Useful for a dashboard health panel.
  app.get("/api/services/health", (_req, res) => {
    if (!agentInstance) {
      return res.json({ running: false, services: [] });
    }
    res.json({
      running:  true,
      services: agentInstance.serviceManager.health(),
      healthy:  agentInstance.serviceManager.allHealthy(),
    });
  });

  // --- Service Restart (Phase 3) ---
  // Restart a single named service without restarting the whole agent.
  // Useful after credential updates or after a recoverable failure.
  app.post("/api/services/:name/restart", requireLocalOrigin, async (req, res) => {
    if (!agentInstance) {
      return res.json({ success: false, error: "Agent not running — launch it first." });
    }
    const name = String(req.params.name);
    // Allowlist service names to prevent any injection via URL
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) {
      return res.status(400).json({ success: false, error: "Invalid service name." });
    }
    try {
      await agentInstance.serviceManager.restart(name);
      const health = agentInstance.serviceManager.getHealth(name);
      res.json({ success: true, health });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  // --- Telegram Webhook ---
  // When webhookUrl is configured in the wizard, Telegram POSTs updates here
  // instead of the agent polling. Requires a public HTTPS URL.
  // Telegram sends the X-Telegram-Bot-Api-Secret-Token header (set during setWebhook).
  app.post("/api/telegram/webhook", (req, res) => {
    // Verify the secret token Telegram sends on every webhook delivery
    const secret = getWebhookSecret();
    if (secret) {
      const provided = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
      if (provided !== secret) {
        return res.status(403).json({ ok: false });
      }
    }
    // ACK immediately — Telegram expects 200 OK within a few seconds
    res.json({ ok: true });
    // Dispatch to the listener (no-op if webhook mode isn't active)
    handleTelegramWebhookUpdate(req.body).catch((err) => {
      console.error("[Telegram Webhook] Error:", err);
    });
  });

  // --- Memory API ---
  const MEMORY_DIR = join(process.cwd(), "data", "memory");

  app.get("/api/memories", requireLocalOrigin, async (_req, res) => {
    try {
      const store = createMemoryStore(MEMORY_DIR);
      await store.load();
      const entries = Array.from(store.entries.values())
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((e) => ({ ...e }));
      res.json({ success: true, entries, total: entries.length });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  app.delete("/api/memories/:id", requireLocalOrigin, async (req, res) => {
    try {
      const store = createMemoryStore(MEMORY_DIR);
      await store.load();
      await store.remove(String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  app.post("/api/memories", requireLocalOrigin, async (req, res) => {
    try {
      const { type, title, content, tags } = req.body;
      if (!type || !title || !content) {
        return res.status(400).json({ success: false, error: "type, title, content required" });
      }
      const store = createMemoryStore(MEMORY_DIR);
      await store.load();
      const id = await store.add({ type, title, content, tags: tags || [] });
      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // --- Conversation History API ---
  const CONV_DIR = join(process.cwd(), "data", "conversations");

  interface ConvMessage { role: "user" | "assistant"; content: string; timestamp: string; }
  interface Conversation {
    id: string; title: string; preview: string;
    createdAt: string; updatedAt: string;
    messageCount: number; messages: ConvMessage[];
  }

  async function ensureConvDir() {
    try { await access(CONV_DIR); } catch { await mkdir(CONV_DIR, { recursive: true }); }
  }

  // List all conversations (metadata only, sorted newest first)
  app.get("/api/conversations", requireLocalOrigin, async (_req, res) => {
    try {
      await ensureConvDir();
      const files = (await readdir(CONV_DIR)).filter(f => f.endsWith(".json"));
      const convs = await Promise.all(files.map(async f => {
        try {
          const raw = await readFile(join(CONV_DIR, f), "utf8");
          const c: Conversation = JSON.parse(raw);
          return { id: c.id, title: c.title, preview: c.preview || "", updatedAt: c.updatedAt, messageCount: c.messageCount || 0 };
        } catch { return null; }
      }));
      const sorted = (convs.filter(Boolean) as Conversation[])
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      res.json(sorted);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // Get full conversation (with messages)
  app.get("/api/conversations/:id", requireLocalOrigin, async (req, res) => {
    const file = safeConvPath(String(req.params.id), CONV_DIR);
    if (!file) return res.status(400).json({ error: "Invalid conversation ID" });
    try {
      const raw = await readFile(file, "utf8");
      res.json(JSON.parse(raw));
    } catch { res.status(404).json({ error: "Not found" }); }
  });

  // Create or update conversation
  app.post("/api/conversations/:id", requireLocalOrigin, async (req, res) => {
    const file = safeConvPath(String(req.params.id), CONV_DIR);
    if (!file) return res.status(400).json({ error: "Invalid conversation ID" });
    try {
      await ensureConvDir();
      await writeFile(file, JSON.stringify(req.body, null, 2), "utf8");
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", requireLocalOrigin, async (req, res) => {
    const file = safeConvPath(String(req.params.id), CONV_DIR);
    if (!file) return res.status(400).json({ error: "Invalid conversation ID" });
    try {
      await unlink(file);
      res.json({ success: true });
    } catch { res.json({ success: true }); } // already gone is fine
  });

  // --- Create Desktop Shortcut ---
  // Creates a .lnk on the user's Desktop pointing to start-background.vbs
  // with the Vee bot ICO as the icon — Windows only, silently skips on other OS.
  app.post("/api/create-shortcut", requireLocalOrigin, async (_req, res) => {
    if (os.platform() !== "win32") {
      return res.json({ success: false, error: "Desktop shortcuts are only supported on Windows." });
    }
    try {
      const agentDir = process.cwd().replace(/\\/g, "\\\\");
      const desktopDir = join(os.homedir(), "Desktop").replace(/\\/g, "\\\\");
      const shortcutPath = join(os.homedir(), "Desktop", "Vouza Admin Agent.lnk").replace(/\\/g, "\\\\");
      const targetVbs = join(process.cwd(), "start-background.vbs").replace(/\\/g, "\\\\");
      const iconPath = join(process.cwd(), "assets", "icon.ico").replace(/\\/g, "\\\\");

      const psScript = [
        `$sh = New-Object -ComObject WScript.Shell`,
        `$sc = $sh.CreateShortcut('${shortcutPath}')`,
        `$sc.TargetPath = 'wscript.exe'`,
        `$sc.Arguments = '"${targetVbs}"'`,
        `$sc.WorkingDirectory = '${agentDir}'`,
        `$sc.IconLocation = '${iconPath},0'`,
        `$sc.Description = 'Vouza Admin Agent — click to launch in background'`,
        `$sc.Save()`,
        `Write-Output 'ok'`,
      ].join("; ");

      const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, { timeout: 10000 });

      if (stdout.trim() === "ok") {
        res.json({ success: true, path: join(os.homedir(), "Desktop", "Vouza Admin Agent.lnk") });
      } else {
        res.json({ success: false, error: "Shortcut script produced no output." });
      }
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  // --- Reset Config API ---
  // Wipes data/config.json so the next page load starts a fresh wizard.
  // Useful for team distribution and testing the new-user experience.
  app.post("/api/reset-config", requireLocalOrigin, async (_req, res) => {
    try {
      // Stop the running agent first (if any)
      if (agentInstance) {
        await agentInstance.stop().catch(() => {});
        agentInstance = null;
        setAgentInstance(null);
      }
      // Delete config file — catch ENOENT (already gone is fine)
      const { unlink: removeFile } = await import("fs/promises");
      await removeFile(CONFIG_PATH).catch(() => {});
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // --- Serve SPA ---
  // Always send fresh HTML — see static-files block above for the beta-tester bug context.
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(join(PUBLIC_DIR, "index.html"));
  });

  // Bind to localhost by default — eliminates LAN exposure entirely.
  // Operators wanting remote access set DASHBOARD_BIND=0.0.0.0 + DASHBOARD_PASSWORD.
  app.listen(port, DASHBOARD_BIND, async () => {
    const displayHost = DOCKER_LOCAL_ONLY ? "localhost" : DASHBOARD_BIND === "0.0.0.0" ? "<your-ip>" : DASHBOARD_BIND;
    console.log(`\n  Setup Dashboard: http://${displayHost}:${port}`);
    if (DOCKER_LOCAL_ONLY) {
      console.log(`  🛡  Docker: open http://localhost:${port} on this computer (not reachable from your network).`);
    } else if (REQUIRE_AUTH) {
      console.log(`  🔒 Authentication required — clients must send DASHBOARD_PASSWORD as Bearer token.`);
    } else {
      console.log(`  🛡  Bound to loopback only — not reachable from your network.`);
    }
    console.log("");
    const operatorKey = (process.env.VOUZA_API_KEY || "").trim();
    try {
      const config = await loadSetupConfig();
      // Auto-launch conditions:
      //  1. Setup fully completed, OR
      //  2. Operator key is set AND at least one channel token is saved
      //     (bot should be live as soon as Telegram is configured, no need to finish wizard)
      const hasChannelToken = !!(
        config.credentials?.telegramToken || config.credentials?.telegramBotToken
      );
      const shouldAutoLaunch = config.setupCompleted || (!!operatorKey && hasChannelToken);
      if (shouldAutoLaunch && !agentInstance && !launching) {
        console.log(`  Auto-launching agent from saved configuration...`);
        launching = true;
        try {
          agentInstance = await launchAgent();
          setAgentInstance(agentInstance);
          console.log(`  ✓ Agent is live — ready to handle tasks.\n`);
        } catch (launchErr) {
          // One automatic retry after 3 seconds (covers race conditions on slow machines)
          console.log(`  Auto-launch failed (${launchErr}), retrying in 3s...`);
          setTimeout(async () => {
            try {
              agentInstance = await launchAgent();
              setAgentInstance(agentInstance);
              console.log(`  ✓ Agent launched on retry — ready.\n`);
            } catch (retryErr) {
              console.error(`  ✗ Agent failed to launch after retry: ${retryErr}`);
              console.error(`    Open http://localhost:${port} → click "Launch Now" to retry manually.\n`);
            } finally {
              launching = false;
            }
          }, 3000);
          return; // launching stays true until retry settles
        }
        launching = false;
      }
    } catch (e) {
      console.log(`  Could not read config for auto-launch: ${e}`);
    }
  });
}

// --- Helpers ---

// Keys, passwords and tokens are encrypted on disk (security/secretStore.ts).
async function loadSetupConfig(): Promise<SetupConfig> {
  try {
    return await readSealedJson<SetupConfig>(CONFIG_PATH, { ...DEFAULT_CONFIG });
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveSetupConfig(config: SetupConfig): Promise<void> {
  await writeSealedJson(CONFIG_PATH, config);
}

/**
 * One-time upgrade for installs from before encryption: re-save every file
 * that still holds a key or password in plain text.
 */
async function encryptSecretsAtRest(): Promise<void> {
  const dataDir = dirname(CONFIG_PATH);
  const files = [CONFIG_PATH, join(dataDir, "mcp-servers.json")];
  try {
    const { readdir } = await import("fs/promises");
    for (const f of await readdir(dataDir)) {
      if (f.startsWith("config.json.before-restore-") && f.endsWith(".bak")) files.push(join(dataDir, f));
    }
  } catch { /* no data dir yet */ }
  for (const f of files) {
    try {
      if (await migrateJsonFile(f)) console.log(`  🔒 Encrypted saved keys and passwords in ${basename(f)}`);
    } catch (err) {
      console.warn(`  ⚠ Could not encrypt secrets in ${f}: ${err}`);
    }
  }
}

function maskKey(key: string): string {
  if (!key || key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] === "" && typeof target[key] === "string" && target[key] !== "") {
      // NEVER overwrite an existing non-empty credential with a blank string.
      // This happens when the wizard re-saves with placeholder-only fields
      // (e.g. "✓ Already saved") — the DOM value is empty but the real key is on disk.
      // Silently preserve the existing value.
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

async function testConnection(type: string, config: Record<string, string>): Promise<{ success: boolean; message: string }> {
  switch (type) {
    // AI keys: one free, auth-gated check per provider (shared table — Rule 66).
    // Never a paid completion: the old Anthropic test sent a real message.
    case "anthropic":
    case "openrouter":
    case "ai-provider": {
      const provider = (type === "ai-provider" ? config.provider : type) as AIProvider;
      let req: { url: string; headers: Record<string, string> };
      try {
        req = keyCheckRequest(provider, config.apiKey || "");
      } catch {
        return { success: false, message: `Unknown provider: ${provider}` };
      }
      try {
        const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(12_000) });
        if (res.ok) return { success: true, message: "Connected — your key works!" };
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          return { success: false, message: "That key was rejected. It may be mistyped, deleted, or out of credit." };
        }
        const err = await res.text();
        return { success: false, message: `API error (HTTP ${res.status}): ${err.slice(0, 200)}` };
      } catch (e) {
        return { success: false, message: `Connection failed: ${e}` };
      }
    }

    case "telegram":
      try {
        const token = config.telegramBotToken || config.botToken || config.telegramToken;
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (data.ok) return { success: true, message: `Connected as @${data.result.username}` };
        return { success: false, message: `Telegram error: ${data.description}` };
      } catch (e) {
        return { success: false, message: `Connection failed: ${e}` };
      }

    case "whatsapp":
      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}.json`,
          { headers: { Authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64")}` } }
        );
        if (res.ok) return { success: true, message: "Twilio/WhatsApp connected!" };
        return { success: false, message: `Twilio error: ${res.statusText}` };
      } catch (e) {
        return { success: false, message: `Connection failed: ${e}` };
      }

    case "whatsapp-web":
      try {
        const serverUrl = config.waWebServer || "http://localhost:3001";
        const res = await fetch(`${serverUrl}/api/status`);
        if (res.ok) return { success: true, message: "WhatsApp Web server connected! Scan QR code to link." };
        return { success: false, message: "WhatsApp Web server not reachable. Start it first." };
      } catch {
        return { success: false, message: "WhatsApp Web server not running. Start with: npx whatsapp-web-server" };
      }

    case "waha":
      try {
        const headers: Record<string, string> = {};
        // Wizard saves the key as "wahaKey" (the DOM field ID); support both names
        const wahaKey = config.wahaKey || config.wahaApiKey;
        if (wahaKey) headers["X-Api-Key"] = wahaKey;
        const wahaBase = (config.wahaUrl || "http://localhost:3000").replace(/\/$/, "");
        const res = await fetch(`${wahaBase}/api/sessions`, { headers });
        if (res.ok) return { success: true, message: "WAHA server connected!" };
        return { success: false, message: `WAHA server returned HTTP ${res.status}` };
      } catch (e) {
        return { success: false, message: `WAHA not reachable: ${e}` };
      }

    case "groq-whisper":
      try {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${config.groqApiKey}` },
        });
        if (res.ok) return { success: true, message: "Groq API connected — voice transcription ready (free)!" };
        const err = await res.text();
        return { success: false, message: `Groq error: ${err.slice(0, 200)}` };
      } catch (e) {
        return { success: false, message: `Connection failed: ${e}` };
      }

    case "openai-whisper":
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${config.openaiVoiceKey || config.openaiApiKey}` },
        });
        if (res.ok) return { success: true, message: "OpenAI Whisper API connected — voice transcription ready!" };
        const err = await res.text();
        return { success: false, message: `OpenAI error: ${err.slice(0, 200)}` };
      } catch (e) {
        return { success: false, message: `Connection failed: ${e}` };
      }

    case "agentmail":
      try {
        const res = await fetch("https://api.agentmail.to/v0/inboxes", {
          headers: { Authorization: `Bearer ${config.agentmailKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          const count = data.inboxes?.length ?? 0;
          return { success: true, message: `AgentMail connected — ${count} inbox${count !== 1 ? "es" : ""} found` };
        }
        const err = await res.text();
        return { success: false, message: `AgentMail error: ${err.slice(0, 200)}` };
      } catch (e) {
        return { success: false, message: `Connection failed: ${e}` };
      }

    case "gmail": {
      // Real SMTP handshake (no email sent) — never report "connected" untested.
      const r = await realSmtpProbe(config.gmailUser || "", config.gmailPass || config.gmailAppPassword || "");
      return r.ok
        ? { success: true, message: "Gmail connected — sign-in verified." }
        : { success: false, message: [r.error, r.suggestedFix].filter(Boolean).join(" ") };
    }

    case "google-unified":
      try {
        const keyStr = config.key;
        if (!keyStr) return { success: false, message: "No service account key provided" };
        JSON.parse(keyStr); // Validate JSON
        return { success: true, message: "Google service account key is valid JSON. Will verify scopes on first use." };
      } catch {
        return { success: false, message: "Invalid JSON. Please paste the full service account key." };
      }

    case "google-calendar":
    case "google-sheets":
      return { success: true, message: "Google credentials saved. Will verify on first use." };

    default:
      return { success: false, message: `Unknown connection type: ${type}` };
  }
}
