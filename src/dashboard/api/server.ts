// =============================================================================
// Setup Wizard & Dashboard API Server
// Express backend — config persistence, model catalog, agent launcher, tests
// =============================================================================

import express from "express";
import { readFile, writeFile, mkdir, readdir, unlink, access } from "fs/promises";
import { join, dirname, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);
import { getModelCatalogForUI } from "../../config/models.js";
import { getBudgetSnapshot } from "../../agent/budget.js";
import { getHealthSnapshot as getProviderHealth } from "../../agent/providerFailover.js";
import {
  loadTranscript    as loadChatHistory,
  listSessions      as listChatSessions,
  deleteSession     as deleteChatSession,
} from "../../agent/conversationStore.js";
import { launchAgent, getAgentStatus, type AgentInstance } from "../../bridge/launcher.js";
import { setAgentInstance } from "../../bridge/agentBridge.js";
import { streamChat, clearSession } from "./chat.js";
import { createMemoryStore } from "../../memory/store.js";
import { handleWAHAEvent } from "../../whatsapp/wahaListener.js";
import {
  startBaileysListener,
  stopBaileysListener,
  isBaileysConnected,
  onBaileysQR,
  onBaileysStatus,
  sendBaileysMessage,
  type BaileysStatus,
} from "../../whatsapp/baileysManager.js";
import { toDataURL as qrToDataURL } from "qrcode";
import { handleTelegramWebhookUpdate, getWebhookSecret } from "../../telegram/listener.js";
import {
  startAgentMailListener,
  stopAgentMailListener,
  getAgentMailInbox,
} from "../../email/agentMailListener.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(process.cwd(), "data", "config.json");
const PUBLIC_DIR = join(__dirname, "..", "public");

// Running agent instance (if launched from dashboard)
let agentInstance: AgentInstance | null = null;
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
  };
  channels: Record<string, { enabled: boolean; provider: string; config: Record<string, string> }>;
  tools: Record<string, { enabled: boolean; provider: string; config: Record<string, string> }>;
  credentials: Record<string, string>;
  skills: {
    enabled: string[];
    schedules: Record<string, string>;
  };
  selfImproveIntervalHours?: number;
  setupCompleted: boolean;
  setupCompletedAt?: string;
}

const DEFAULT_CONFIG: SetupConfig = {
  agent: { name: "AdminAgent", model: "claude-sonnet-4-6", provider: "anthropic", language: "en", timezone: "Asia/Singapore" },
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
const REQUIRE_AUTH       = DASHBOARD_BIND !== "127.0.0.1" && DASHBOARD_BIND !== "localhost";

// Constant-time string compare to avoid timing oracles on the password.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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

  const app = express();
  app.use(express.json({ limit: "30mb" })); // 30 MB to accommodate base64 audio uploads
  app.use(express.static(PUBLIC_DIR));

  // ── Dashboard auth (active only in remote-access mode) ─────────────────────
  // Localhost-only mode (default): middleware is a no-op — OS already isolates loopback.
  // Remote mode (DASHBOARD_BIND=0.0.0.0 etc.): every /api/* route except the
  // public webhooks below requires Authorization: Bearer <DASHBOARD_PASSWORD>.
  // Webhooks (/api/whatsapp/webhook, /api/telegram/webhook) are exempt because
  // they're called by external services with their own signed payloads.
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

  // --- Operator Defaults API ---
  // Tells the wizard whether a default (Vouza-supplied) API key is configured.
  // The actual key is NEVER exposed — only hasDefaultKey: true/false.
  // Set VOUZA_API_KEY (and optionally VOUZA_API_PROVIDER, VOUZA_API_MODEL, VOUZA_BRAND_NAME)
  // as environment variables in start.bat or ecosystem.config.cjs.
  app.get("/api/operator-defaults", (_req, res) => {
    const hasDefaultKey = !!(process.env.VOUZA_API_KEY || "").trim();
    res.json({
      hasDefaultKey,
      defaultProvider: process.env.VOUZA_API_PROVIDER || "openrouter",
      defaultModel:    process.env.VOUZA_API_MODEL    || "google/gemini-2.5-flash-lite",
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

  // --- Config API ---
  app.get("/api/config", async (_req, res) => {
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
    for (const t of Object.values(masked.tools)) {
      t.config = { ...t.config };
      for (const [k, v] of Object.entries(t.config)) {
        if (isSensitiveField(k)) t.config[k] = maskKey(v);
      }
    }
    res.json(masked);
  });

  app.post("/api/config", requireLocalOrigin, async (req, res) => {
    try {
      const updates: Partial<SetupConfig> = req.body;
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
      if ((!savedKey || savedKey.trim().length < 8) && !operatorKey) {
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
    const { message, sessionId, apiKey, imageBase64, imageMimeType, wizardStep, userName } = req.body as {
      message: string;
      sessionId: string;
      apiKey?: string;
      imageBase64?: string;
      imageMimeType?: string;
      wizardStep?: number;
      userName?: string;
    };

    if (!message || !sessionId) {
      return res.status(400).json({ error: "message and sessionId are required" });
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
          { type: "text", text: message },
        ];
      } else {
        messagePayload = message;
      }

      for await (const event of streamChat(sessionId, messagePayload, config, apiKey, wizardStep, userName)) {
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

    // WAHA auth: validate the X-Api-Key header against the configured WAHA API key.
    // WAHA sends this header on all outbound webhook POSTs when an apiKey is configured.
    const wa = agentInstance?.context.config.tools?.whatsapp;
    if (wa?.provider === "waha") {
      const expectedKey = (wa.config as any)?.apiKey as string | undefined;
      if (expectedKey) {
        const providedKey = req.headers["x-api-key"] as string | undefined;
        if (providedKey !== expectedKey) {
          return res.status(403).json({ error: "Unauthorized" });
        }
      }
    }

    // ACK immediately — WAHA expects a fast response
    res.json({ success: true });

    // Process asynchronously after the ACK
    if (!agentInstance) return; // agent must be running to handle messages
    if (!wa || wa.provider !== "waha") return; // only WAHA supports webhooks

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
  app.get("*", (_req, res) => {
    res.sendFile(join(PUBLIC_DIR, "index.html"));
  });

  // Bind to localhost by default — eliminates LAN exposure entirely.
  // Operators wanting remote access set DASHBOARD_BIND=0.0.0.0 + DASHBOARD_PASSWORD.
  app.listen(port, DASHBOARD_BIND, async () => {
    const displayHost = DASHBOARD_BIND === "0.0.0.0" ? "<your-ip>" : DASHBOARD_BIND;
    console.log(`\n  Setup Dashboard: http://${displayHost}:${port}`);
    if (REQUIRE_AUTH) {
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

async function loadSetupConfig(): Promise<SetupConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveSetupConfig(config: SetupConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
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
    case "anthropic":
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 10,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        if (res.ok) return { success: true, message: "Anthropic API connected successfully!" };
        const err = await res.json();
        return { success: false, message: `API error: ${err.error?.message || res.statusText}` };
      } catch (e) {
        return { success: false, message: `Connection failed: ${e}` };
      }

    case "openrouter": {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "HTTP-Referer": "https://adminagent.app",
            "X-Title": "Admin Agent",
          },
        });
        if (res.ok) {
          const data = await res.json();
          const count = data?.data?.length ?? "200+";
          return { success: true, message: `OpenRouter connected — ${count} models available!` };
        }
        const err = await res.text();
        return { success: false, message: `OpenRouter error: ${err.slice(0, 200)}` };
      } catch (e) {
        return { success: false, message: `Connection failed: ${e}` };
      }
    }

    case "ai-provider": {
      // Generic test for any OpenAI-compatible provider
      const provider = config.provider;
      const apiKey = config.apiKey;

      if (provider === "anthropic") {
        return testConnection("anthropic", { apiKey });
      }
      if (provider === "openrouter") {
        return testConnection("openrouter", { apiKey });
      }

      const baseUrls: Record<string, string> = {
        openai: "https://api.openai.com/v1",
        google: "https://generativelanguage.googleapis.com/v1beta/openai",
        xai: "https://api.x.ai/v1",
        deepseek: "https://api.deepseek.com",
        alibaba: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        moonshot: "https://api.moonshot.cn/v1",
      };

      const baseUrl = baseUrls[provider];
      if (!baseUrl) return { success: false, message: `Unknown provider: ${provider}` };

      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) return { success: true, message: `${provider} API connected successfully!` };
        const err = await res.text();
        return { success: false, message: `API error: ${err.slice(0, 200)}` };
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

    case "gmail":
      return { success: true, message: "Gmail credentials saved. Will verify on first use." };

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
