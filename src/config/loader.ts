// =============================================================================
// Config Loader — Multi-provider config from environment OR saved config.json
// Supports: Anthropic, OpenAI, Google, xAI, DeepSeek, Qwen, Kimi
// Unified Google credentials for Calendar, Gmail, Sheets, Docs, Drive
// =============================================================================

import { config as loadEnv } from "dotenv";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import type { AgentConfig } from "../types/index.js";
import type { AIProvider } from "./models.js";
import { findModel, getProviderForModel } from "./models.js";
import { DEFAULT_OPENROUTER_TIERS } from "../agent/router.js";

const CONFIG_JSON_PATH = join(__dirname, "..", "..", "data", "config.json");

const DEFAULT_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
];

/**
 * Load config from environment variables (.env).
 * Falls back to sensible defaults.
 */
export function loadConfig(): AgentConfig {
  loadEnv();

  const model = process.env.AGENT_MODEL || "claude-sonnet-4-6";
  const modelInfo = findModel(model);
  const provider = (modelInfo?.provider || process.env.AI_PROVIDER || "anthropic") as AIProvider;

  // Collect all API keys from env
  const apiKeys: Record<string, string> = {
    anthropic:   process.env.ANTHROPIC_API_KEY   || "",
    openai:      process.env.OPENAI_API_KEY       || "",
    google:      process.env.GOOGLE_AI_API_KEY    || "",
    xai:         process.env.XAI_API_KEY          || "",
    deepseek:    process.env.DEEPSEEK_API_KEY     || "",
    alibaba:     process.env.DASHSCOPE_API_KEY    || "",
    moonshot:    process.env.MOONSHOT_API_KEY     || "",
    openrouter:  process.env.OPENROUTER_API_KEY   || "",
  };

  // Ensure at least the selected provider has a key
  const providerConfig = getProviderForModel(model);
  const activeKey = apiKeys[provider];
  if (!activeKey) {
    throw new Error(
      `No API key found for provider "${provider}" (model: ${model}). ` +
      `Set ${providerConfig?.apiKeyEnvVar || provider.toUpperCase() + "_API_KEY"} in .env or environment.`
    );
  }

  // OpenRouter tiered model config — read from env or fall back to defaults
  const openrouterTiers = provider === "openrouter" ? {
    fast:     process.env.OPENROUTER_MODEL_FAST     || DEFAULT_OPENROUTER_TIERS.fast,
    balanced: process.env.OPENROUTER_MODEL_BALANCED  || DEFAULT_OPENROUTER_TIERS.balanced,
    flagship: process.env.OPENROUTER_MODEL_FLAGSHIP  || DEFAULT_OPENROUTER_TIERS.flagship,
  } : undefined;

  return {
    name: process.env.AGENT_NAME || "AdminAgent",
    model: provider === "openrouter" ? (DEFAULT_OPENROUTER_TIERS.balanced) : model,
    provider,
    apiKeys: apiKeys as Record<AIProvider, string>,
    memoryDir: process.env.MEMORY_DIR || "./data/memory",
    skillsDir: process.env.SKILLS_DIR || "./src/skills/bundled",
    logDir: process.env.LOG_DIR || "./data/logs",
    selfImproveIntervalHours: parseInt(process.env.SELF_IMPROVE_INTERVAL_HOURS || "24", 10),
    maxTurnsPerSession: parseInt(process.env.MAX_TURNS_PER_SESSION || "20", 10),
    openrouterTiers,
    tools: {
      // Gmail
      gmail: process.env.GMAIL_USER
        ? {
            user: process.env.GMAIL_USER,
            appPassword: process.env.GMAIL_APP_PASSWORD || "",
            emailAddress: process.env.GMAIL_EMAIL_ADDRESS || process.env.GMAIL_USER,
          }
        : undefined,

      // Unified Google credentials
      google: process.env.GOOGLE_SERVICE_ACCOUNT_KEY
        ? {
            credentialsJson: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
            scopes: DEFAULT_GOOGLE_SCOPES,
          }
        : undefined,

      // Slack
      slack: process.env.SLACK_BOT_TOKEN
        ? { botToken: process.env.SLACK_BOT_TOKEN }
        : undefined,

      // Telegram
      telegram: process.env.TELEGRAM_BOT_TOKEN
        ? {
            botToken: process.env.TELEGRAM_BOT_TOKEN,
            webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
          }
        : undefined,

      // WhatsApp (auto-detect provider)
      whatsapp: buildWhatsAppConfig(),
    },
  };
}

/**
 * Load config from saved config.json (written by the setup wizard).
 * Merges with env vars as fallback.
 */
export async function loadConfigFromJson(): Promise<AgentConfig> {
  try {
    const raw = await readFile(CONFIG_JSON_PATH, "utf-8");
    const saved = JSON.parse(raw);

    // Start with env-based config as base
    let baseConfig: AgentConfig;
    try {
      baseConfig = loadConfig();
    } catch {
      // If env config fails, build minimal config from JSON
      const model = saved.agent?.model || "claude-sonnet-4-6";
      const modelInfo = findModel(model);
      const provider = (modelInfo?.provider || "anthropic") as AIProvider;

      baseConfig = {
        name: saved.agent?.name || "AdminAgent",
        model,
        provider,
        apiKeys: { anthropic: "", openai: "", google: "", xai: "", deepseek: "", alibaba: "", moonshot: "", openrouter: "" } as Record<AIProvider, string>,
        memoryDir: "./data/memory",
        skillsDir: "./src/skills/bundled",
        logDir: "./data/logs",
        selfImproveIntervalHours: 24,
        maxTurnsPerSession: 20,
        tools: {},
      };
    }

    // Merge saved config on top
    if (saved.agent) {
      baseConfig.name = saved.agent.name || baseConfig.name;
      if (saved.agent.model) {
        baseConfig.model = saved.agent.model;
        const modelInfo = findModel(saved.agent.model);
        if (modelInfo) baseConfig.provider = modelInfo.provider;
      }
    }

    // Merge API keys from saved credentials
    if (saved.credentials) {
      if (saved.credentials.anthropicApiKey) baseConfig.apiKeys.anthropic = saved.credentials.anthropicApiKey;
      if (saved.credentials.openaiApiKey) baseConfig.apiKeys.openai = saved.credentials.openaiApiKey;
      if (saved.credentials.googleAiApiKey) baseConfig.apiKeys.google = saved.credentials.googleAiApiKey;
      if (saved.credentials.googleApiKey) baseConfig.apiKeys.google = saved.credentials.googleApiKey;        // wizard key
      if (saved.credentials.xaiApiKey) baseConfig.apiKeys.xai = saved.credentials.xaiApiKey;
      if (saved.credentials.deepseekApiKey) baseConfig.apiKeys.deepseek = saved.credentials.deepseekApiKey;
      if (saved.credentials.dashscopeApiKey) baseConfig.apiKeys.alibaba = saved.credentials.dashscopeApiKey;
      if (saved.credentials.alibabaApiKey) baseConfig.apiKeys.alibaba = saved.credentials.alibabaApiKey;    // wizard key
      if (saved.credentials.moonshotApiKey)    baseConfig.apiKeys.moonshot    = saved.credentials.moonshotApiKey;
      if (saved.credentials.openrouterApiKey)  baseConfig.apiKeys.openrouter  = saved.credentials.openrouterApiKey;
    }

    // OpenRouter: apply provider + tiers from saved agent config
    if (saved.agent?.provider === "openrouter") {
      baseConfig.provider = "openrouter";
      baseConfig.openrouterTiers = {
        fast:     saved.agent.openrouterTiers?.fast     || DEFAULT_OPENROUTER_TIERS.fast,
        balanced: saved.agent.openrouterTiers?.balanced  || DEFAULT_OPENROUTER_TIERS.balanced,
        flagship: saved.agent.openrouterTiers?.flagship  || DEFAULT_OPENROUTER_TIERS.flagship,
      };
      // model field set to balanced tier for display purposes
      baseConfig.model = baseConfig.openrouterTiers.balanced;
    }

    // Merge tool configs from channels
    // Note: wizard saves fields using their DOM id as the key (telegramToken, slackToken, gmailPass etc.)
    if (saved.channels?.telegram?.enabled) {
      const cfg = saved.channels.telegram.config || {};
      const botToken    = cfg.botToken    || cfg.telegramToken    || cfg.telegramBotToken;
      const webhookUrl  = cfg.webhookUrl  || cfg.telegramWebhookUrl || "";
      if (botToken) baseConfig.tools.telegram = { botToken, webhookUrl: webhookUrl || undefined };
    }
    if (saved.channels?.slack?.enabled) {
      const cfg = saved.channels.slack.config || {};
      const botToken = cfg.botToken || cfg.slackToken || cfg.slackBotToken;
      if (botToken) baseConfig.tools.slack = { botToken };
    }
    if (saved.channels?.email?.enabled && saved.channels.email.config) {
      const ec = saved.channels.email.config;
      baseConfig.tools.gmail = {
        user: ec.gmailUser || ec.user || "",
        appPassword: ec.gmailAppPassword || ec.gmailPass || ec.appPassword || "",
        emailAddress: ec.emailAddress || ec.gmailUser || "",
      };
    }
    if (saved.channels?.whatsapp?.enabled) {
      const waProvider = saved.channels.whatsapp.provider || "web";
      const rawCfg = saved.channels.whatsapp.config || {};

      // Normalize WAHA wizard field IDs (wahaUrl / wahaKey / wahaSession) to
      // the canonical runtime names (serverUrl / apiKey / sessionName) that
      // wahaListener.ts and the send helpers expect.
      let normalizedCfg: Record<string, string> = { ...rawCfg };
      if (waProvider === "waha") {
        normalizedCfg.serverUrl  = rawCfg.serverUrl  || rawCfg.wahaUrl     || "http://localhost:3000";
        normalizedCfg.apiKey     = rawCfg.apiKey     || rawCfg.wahaKey     || "";
        normalizedCfg.sessionName = rawCfg.sessionName || rawCfg.wahaSession || "default";
      }

      baseConfig.tools.whatsapp = {
        provider: waProvider,
        config: normalizedCfg,
      };
    }

    // Unified Google credentials
    if (saved.tools?.calendar?.config?.googleSaKey || saved.tools?.spreadsheet?.config?.googleSaKey) {
      const creds = saved.tools.calendar?.config?.googleSaKey || saved.tools.spreadsheet?.config?.googleSaKey;
      baseConfig.tools.google = {
        credentialsJson: creds,
        scopes: DEFAULT_GOOGLE_SCOPES,
      };
    }

    if (saved.selfImproveIntervalHours) {
      baseConfig.selfImproveIntervalHours = saved.selfImproveIntervalHours;
    }

    // ── Whisper voice transcription config ─────────────────────────────────
    // Priority: explicit voice tool card > Groq key in credentials > OpenAI key
    if (saved.tools?.voice?.enabled) {
      const vProv = (saved.tools.voice.provider || "groq") as "openai" | "groq";
      const vCfg  = saved.tools.voice.config || {};
      const vKey  = vProv === "groq"
        ? (vCfg.groqApiKey    || saved.credentials?.groqApiKey   || "")
        : (vCfg.openaiVoiceKey || vCfg.openaiApiKey || saved.credentials?.openaiApiKey || "");
      if (vKey) {
        baseConfig.whisperApiKey   = vKey;
        baseConfig.whisperProvider = vProv;
      }
    }
    // Auto-detect from flat credentials if no explicit voice tool card
    if (!baseConfig.whisperApiKey) {
      const groqKey   = saved.credentials?.groqApiKey   || "";
      const openaiKey = saved.credentials?.openaiApiKey || "";
      if (groqKey) {
        baseConfig.whisperApiKey   = groqKey;
        baseConfig.whisperProvider = "groq";
      } else if (openaiKey) {
        baseConfig.whisperApiKey   = openaiKey;
        baseConfig.whisperProvider = "openai";
      }
    }

    return baseConfig;
  } catch {
    // No saved config, fall back to env
    return loadConfig();
  }
}

// --- Helpers ---

function buildWhatsAppConfig(): AgentConfig["tools"]["whatsapp"] {
  if (process.env.WHATSAPP_WEB_ENABLED === "true") {
    return {
      provider: "web",
      config: { serverUrl: process.env.WHATSAPP_WEB_SERVER || "http://localhost:3001" },
    };
  }
  if (process.env.WAHA_SERVER_URL) {
    return {
      provider: "waha",
      config: {
        serverUrl: process.env.WAHA_SERVER_URL,
        apiKey: process.env.WAHA_API_KEY || "",
        sessionName: process.env.WAHA_SESSION || "default",
      },
    };
  }
  if (process.env.TWILIO_ACCOUNT_SID) {
    return {
      provider: "twilio",
      config: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN || "",
        fromNumber: process.env.TWILIO_WHATSAPP_NUMBER || "+14155238886",
      },
    };
  }
  if (process.env.META_WHATSAPP_ACCESS_TOKEN) {
    return {
      provider: "meta",
      config: {
        accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || "",
      },
    };
  }
  return undefined;
}
