// =============================================================================
// Setup Wizard & Dashboard API Server
// Express backend — config persistence, model catalog, agent launcher, tests
// =============================================================================

import express from "express";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getModelCatalogForUI } from "../../config/models.js";
import { launchAgent, getAgentStatus, type AgentInstance } from "../../bridge/launcher.js";
import { streamChat, clearSession } from "./chat.js";
import { createMemoryStore } from "../../memory/store.js";
import { handleWAHAEvent } from "../../whatsapp/wahaListener.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(process.cwd(), "data", "config.json");
const PUBLIC_DIR = join(__dirname, "..", "public");

// Running agent instance (if launched from dashboard)
let agentInstance: AgentInstance | null = null;

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
    slack: { enabled: false, provider: "default", config: {} },
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

export async function startDashboard(port = 3456): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "30mb" })); // 30 MB to accommodate base64 audio uploads
  app.use(express.static(PUBLIC_DIR));

  // --- Model Catalog API ---
  app.get("/api/models", (_req, res) => {
    res.json(getModelCatalogForUI());
  });

  // --- Config API ---
  app.get("/api/config", async (_req, res) => {
    const config = await loadSetupConfig();
    const masked = { ...config };
    // Mask sensitive keys
    for (const [k, v] of Object.entries(masked.credentials)) {
      if (k.toLowerCase().includes("key") || k.toLowerCase().includes("token") || k.toLowerCase().includes("secret")) {
        masked.credentials[k] = maskKey(v);
      }
    }
    for (const ch of Object.values(masked.channels)) {
      for (const [k, v] of Object.entries(ch.config)) {
        if (k.toLowerCase().includes("key") || k.toLowerCase().includes("token") || k.toLowerCase().includes("secret")) {
          ch.config[k] = maskKey(v);
        }
      }
    }
    res.json(masked);
  });

  app.post("/api/config", async (req, res) => {
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

  app.post("/api/config/step/:step", async (req, res) => {
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

  // --- Agent Launcher API (Improvement #5 & #7) ---
  app.post("/api/agent/launch", async (_req, res) => {
    try {
      if (agentInstance) {
        const status = await getAgentStatus(agentInstance);
        return res.json({ success: true, alreadyRunning: true, ...status });
      }

      agentInstance = await launchAgent();
      const status = await getAgentStatus(agentInstance);
      res.json({ success: true, ...status });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  app.post("/api/agent/stop", async (_req, res) => {
    try {
      if (agentInstance) {
        await agentInstance.stop();
        agentInstance = null;
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

  app.post("/api/agent/task", async (req, res) => {
    if (!agentInstance) {
      return res.json({ success: false, error: "Agent not running. Launch it first." });
    }
    try {
      const { message } = req.body;
      let output = "";
      for await (const event of agentInstance.runTask(message)) {
        if (event.type === "text_delta") output += event.text;
      }
      res.json({ success: true, output });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  // --- Test Connection API ---
  app.post("/api/test-connection", async (req, res) => {
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
  app.post("/api/chat", async (req, res) => {
    const { message, sessionId, apiKey, imageBase64, imageMimeType } = req.body as {
      message: string;
      sessionId: string;
      apiKey?: string;
      imageBase64?: string;
      imageMimeType?: string;
    };

    if (!message || !sessionId) {
      return res.status(400).json({ error: "message and sessionId are required" });
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
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

      for await (const event of streamChat(sessionId, messagePayload, config, apiKey)) {
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
  app.delete("/api/chat/session/:sessionId", (req, res) => {
    clearSession(req.params.sessionId);
    res.json({ success: true });
  });

  // --- Voice Transcription (OpenAI Whisper) ---
  // Accepts base64-encoded audio from the browser microphone or uploaded audio file.
  app.post("/api/transcribe", async (req, res) => {
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
      // Find the OpenAI API key from saved config
      const config = await loadSetupConfig();
      const openaiKey =
        config.credentials?.openaiApiKey ||
        (config.agent?.provider === "openai"
          ? Object.values(config.credentials || {}).find((v) => String(v).startsWith("sk-"))
          : "") ||
        "";

      if (!openaiKey) {
        return res.json({
          success: false,
          error:
            "Voice transcription requires an OpenAI API key. " +
            'Please add it in the setup wizard: AI Provider → select OpenAI → enter your key.',
        });
      }

      // Decode base64 → Buffer (strip data-URI prefix if present)
      const rawBase64  = audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(rawBase64, "base64");
      const fname       = filename || `recording.${mimeType.split("/")[1]?.split(";")[0] || "webm"}`;

      // Build FormData and call Whisper
      const formData = new FormData();
      const blob     = new Blob([audioBuffer], { type: mimeType });
      formData.append("file",            blob, fname);
      formData.append("model",           "whisper-1");
      formData.append("response_format", "json");
      if (language) formData.append("language", language);

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method:  "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
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
    // ACK immediately — WAHA expects a fast response
    res.json({ success: true });

    // Process asynchronously after the ACK
    if (!agentInstance) return; // agent must be running to handle messages

    const wa = agentInstance.context.config.tools?.whatsapp;
    if (!wa || wa.provider !== "waha") return; // only WAHA supports webhooks

    handleWAHAEvent(req.body, agentInstance.context, agentInstance.registry);
  });

  // --- Memory API ---
  const MEMORY_DIR = join(process.cwd(), "data", "memory");

  app.get("/api/memories", async (_req, res) => {
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

  app.delete("/api/memories/:id", async (req, res) => {
    try {
      const store = createMemoryStore(MEMORY_DIR);
      await store.load();
      await store.remove(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  app.post("/api/memories", async (req, res) => {
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

  // --- Serve SPA ---
  app.get("*", (_req, res) => {
    res.sendFile(join(PUBLIC_DIR, "index.html"));
  });

  app.listen(port, () => {
    console.log(`\n  Setup Dashboard: http://localhost:${port}\n`);
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

    case "slack":
      try {
        const token = config.slackBotToken || config.botToken || config.slackToken;
        const res = await fetch("https://slack.com/api/auth.test", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok) return { success: true, message: `Connected to workspace: ${data.team}` };
        return { success: false, message: `Slack error: ${data.error}` };
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
        if (config.wahaApiKey) headers["X-Api-Key"] = config.wahaApiKey;
        const res = await fetch(`${config.wahaUrl}/api/sessions`, { headers });
        if (res.ok) return { success: true, message: "WAHA server connected!" };
        return { success: false, message: "WAHA server not reachable" };
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
