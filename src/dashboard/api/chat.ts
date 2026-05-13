// =============================================================================
// Chat Session Manager — Powers the live AI guide panel in the setup wizard.
//
// Design:
//  • Each browser session gets its own AgentContext so conversation history
//    persists within that tab (multi-turn).
//  • Sessions are cleared from memory after 2 hours of inactivity.
//  • Credentials are injected from saved config.json at session creation;
//    callers may also pass an apiKey override at request time.
//  • All 24 tools are registered; tools that lack credentials will
//    gracefully return an error which the agent surfaces to the user.
// =============================================================================

import { randomUUID } from "crypto";
import { ToolRegistry } from "../../tools/registry.js";
import { createMemoryStore } from "../../memory/store.js";
import { agentLoop } from "../../agent/loop.js";
import type { AgentContext, AgentConfig } from "../../types/index.js";
import type { AIProvider } from "../../config/models.js";
import { DEFAULT_OPENROUTER_TIERS } from "../../agent/router.js";

// Tools
import { readEmailsTool, sendEmailTool, draftEmailTool, triageEmailsTool } from "../../tools/email.js";
import { listEventsTool, createEventTool, updateEventTool, findFreeSlotsTool } from "../../tools/calendar.js";
import { readSpreadsheetTool, writeSpreadsheetTool, searchSpreadsheetTool } from "../../tools/spreadsheet.js";
import { sendSlackMessageTool, readSlackMessagesTool, listSlackChannelsTool } from "../../tools/messenger.js";
import { listFilesTool, readFileTool, readExcelFileTool, writeFileTool, organizeFilesTool } from "../../tools/fileManager.js";
import {
  sendTelegramMessageTool,
  readTelegramUpdatesTool,
  getTelegramBotInfoTool,
  forwardTelegramMessageTool,
} from "../../tools/telegram.js";
import { sendWhatsAppMessageTool, readWhatsAppMessagesTool } from "../../tools/whatsapp.js";
import { saveMemoryTool, searchMemoryTool, forgetMemoryTool } from "../../tools/memory.js";
import { transcribeAudioTool, transcribeAndSummarizeTool } from "../../tools/voice.js";

// ─────────────────────────────────────────────────────────────────────────────
// Chat system prompt — full office agent capabilities
// ─────────────────────────────────────────────────────────────────────────────

export const CHAT_SYSTEM_PROMPT = `You are an intelligent AI office assistant built on the Vouza AI platform.
You help with a wide range of office and productivity tasks.

## Your Capabilities
- **Email**: Read inbox, draft replies, send emails, triage and categorise messages
- **Calendar**: List upcoming events, book meetings, find free time slots
- **Documents & Files**: Read, write, organise, and manage local files and folders
- **Spreadsheets**: Read data, write values, search records, generate summaries
- **Messaging**: Send and read messages via Telegram, Slack, and WhatsApp
- **Image & Document Analysis**: Analyse images, extract data from documents
- **Reports**: Summarise data, spot trends, create structured reports

## How You Work
1. Understand what the user needs
2. Use the right tools to accomplish the task — you can chain multiple tools
3. Show your work clearly: say what you're doing before you do it
4. Confirm before sending external messages (email / WhatsApp / Slack / Telegram)
5. If a tool fails because credentials aren't configured yet, explain what the user needs to set up

## Personality
- Professional and efficient, but friendly and conversational
- Proactive — if you notice a better approach, suggest it
- Clear — always summarise what you did and what the result was
- Honest — if you can't do something, say so and explain why

## Rules
- ALWAYS ask for confirmation before sending emails or messages
- NEVER share or expose API keys, passwords, or other credentials
- Ask for clarification if the request is ambiguous
- Prefer accuracy over speed — verify before acting`;

// ─────────────────────────────────────────────────────────────────────────────
// Session store
// ─────────────────────────────────────────────────────────────────────────────

interface ChatSession {
  context: AgentContext;
  registry: ToolRegistry;
  createdAt: number;
  lastActive: number;
}

const sessions = new Map<string, ChatSession>();

// Prune sessions older than 2 hours every 30 minutes
const sessionPruneInterval = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (s.lastActive < cutoff) sessions.delete(id);
  }
}, 30 * 60 * 1000);
if (sessionPruneInterval.unref) sessionPruneInterval.unref();

// Shared memory store for all dashboard sessions
const globalMemory = createMemoryStore("./data/memory");
let globalMemoryLoaded = false;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create a chat session. The session holds a full AgentContext with
 * all tools registered and memory loaded.
 *
 * @param sessionId  Browser-generated UUID, stable for the tab's lifetime
 * @param savedConfig  The raw config.json object (from loadSetupConfig())
 * @param apiKeyOverride  Optional API key passed directly in the request
 */
export function getOrCreateSession(
  sessionId: string,
  savedConfig: any,
  apiKeyOverride?: string
): ChatSession {
  if (sessions.has(sessionId)) {
    const s = sessions.get(sessionId)!;
    s.lastActive = Date.now();

    // If the user just pasted a new API key, update it
    if (apiKeyOverride) {
      const provider = s.context.config.provider;
      s.context.config.apiKeys[provider] = apiKeyOverride;
    }

    return s;
  }

  // Build AgentConfig from saved config + optional override
  const agentConfig = buildAgentConfig(savedConfig, apiKeyOverride);

  // Apply credentials to process.env so existing tools can read them
  applyCredentialsToEnv(savedConfig);

  // Build tool registry (all 24 tools — they fail gracefully if unconfigured)
  const registry = buildRegistry();

  // Memory store (shared with main agent if it exists)
  if (!globalMemoryLoaded) {
    globalMemory.load().catch(() => { /* silent — no memory yet is fine */ });
    globalMemoryLoaded = true;
  }

  const context: AgentContext = {
    sessionId,
    turnCount: 0,
    messages: [],
    memory: globalMemory,
    config: agentConfig,
    tools: registry.getAll().reduce((m, t) => m.set(t.name, t), new Map()),
    taskQueue: [],
  };

  const session: ChatSession = { context, registry, createdAt: Date.now(), lastActive: Date.now() };
  sessions.set(sessionId, session);
  return session;
}

/** Remove a session (called from the "Clear conversation" button). */
export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Stream a chat message through the agent loop.
 * Yields the same StreamEvent objects as agentLoop.
 */
export async function* streamChat(
  sessionId: string,
  message: string | any[],
  savedConfig: any,
  apiKeyOverride?: string
): AsyncGenerator<Record<string, unknown>> {
  const session = getOrCreateSession(sessionId, savedConfig, apiKeyOverride);
  session.lastActive = Date.now();

  yield* agentLoop(message, session.context, session.registry, CHAT_SYSTEM_PROMPT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildAgentConfig(saved: any, apiKeyOverride?: string): AgentConfig {
  const provider = (saved?.agent?.provider || "anthropic") as AIProvider;
  const creds    = saved?.credentials    || {};

  // Build the full apiKeys record
  const apiKeys: Record<string, string> = {
    anthropic:  creds.anthropicApiKey  || process.env.ANTHROPIC_API_KEY   || "",
    openai:     creds.openaiApiKey     || process.env.OPENAI_API_KEY       || "",
    google:     creds.googleApiKey     || creds.googleAiApiKey             || process.env.GOOGLE_AI_API_KEY || "",
    xai:        creds.xaiApiKey        || process.env.XAI_API_KEY          || "",
    deepseek:   creds.deepseekApiKey   || process.env.DEEPSEEK_API_KEY     || "",
    alibaba:    creds.alibabaApiKey    || creds.dashscopeApiKey            || process.env.DASHSCOPE_API_KEY || "",
    moonshot:   creds.moonshotApiKey   || process.env.MOONSHOT_API_KEY     || "",
    openrouter: creds.openrouterApiKey || process.env.OPENROUTER_API_KEY   || "",
  };

  // The wizard stores the active key as `${provider}ApiKey`; pull it out
  const wizardKey = creds[`${provider}ApiKey`];
  if (wizardKey) apiKeys[provider] = wizardKey;

  // Request-level override wins
  if (apiKeyOverride) apiKeys[provider] = apiKeyOverride;

  // OpenRouter: build tiered model config
  const openrouterTiers = provider === "openrouter" ? {
    fast:     saved?.agent?.openrouterTiers?.fast     || DEFAULT_OPENROUTER_TIERS.fast,
    balanced: saved?.agent?.openrouterTiers?.balanced  || DEFAULT_OPENROUTER_TIERS.balanced,
    flagship: saved?.agent?.openrouterTiers?.flagship  || DEFAULT_OPENROUTER_TIERS.flagship,
  } : undefined;

  // Display model: balanced tier for openrouter, otherwise the configured model
  const model = provider === "openrouter"
    ? (openrouterTiers?.balanced ?? DEFAULT_OPENROUTER_TIERS.balanced)
    : (saved?.agent?.model || "claude-sonnet-4-6");

  return {
    name:     saved?.agent?.name || "AI Assistant",
    model,
    provider,
    apiKeys:  apiKeys as Record<AIProvider, string>,
    memoryDir:    "./data/memory",
    skillsDir:    "./src/skills/bundled",
    logDir:       "./data/logs",
    selfImproveIntervalHours: 24,
    maxTurnsPerSession: 20,
    openrouterTiers,
    tools: buildToolsConfig(saved),
  };
}

function buildToolsConfig(saved: any): AgentConfig["tools"] {
  const creds    = saved?.credentials || {};
  const channels = saved?.channels    || {};

  const tools: AgentConfig["tools"] = {};

  // Gmail
  if (creds.gmailUser || channels.email?.config?.gmailUser) {
    tools.gmail = {
      user:         creds.gmailUser || channels.email?.config?.gmailUser || "",
      appPassword:  creds.gmailPass || creds.gmailAppPassword || channels.email?.config?.gmailPass || "",
      emailAddress: creds.gmailUser || "",
    };
  }

  // Unified Google (Calendar, Sheets, Drive)
  if (creds.googleSaKey) {
    tools.google = {
      credentialsJson: creds.googleSaKey,
      scopes: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/documents",
      ],
    };
  }

  // Slack
  if (creds.slackToken || creds.slackBotToken) {
    tools.slack = { botToken: creds.slackToken || creds.slackBotToken };
  }

  // Telegram
  if (creds.telegramToken || creds.telegramBotToken) {
    tools.telegram = { botToken: creds.telegramToken || creds.telegramBotToken };
  }

  // WhatsApp
  const waProvider = channels.whatsapp?.provider;
  if (waProvider) {
    const waCreds = creds;
    tools.whatsapp = {
      provider: waProvider,
      config: {
        accountSid:  waCreds.twilioSid    || "",
        authToken:   waCreds.twilioToken  || "",
        fromNumber:  waCreds.twilioNum    || "",
        accessToken: waCreds.metaToken    || "",
        phoneNumberId: waCreds.metaPhoneId || "",
        serverUrl:   waCreds.waWebServer  || waCreds.wahaUrl || "",
        apiKey:      waCreds.wahaKey      || "",
      },
    };
  }

  return tools;
}

function applyCredentialsToEnv(saved: any): void {
  const creds    = saved?.credentials || {};
  const channels = saved?.channels    || {};

  const mapping: Record<string, string | undefined> = {
    GMAIL_USER:              creds.gmailUser || channels.email?.config?.gmailUser,
    GMAIL_APP_PASSWORD:      creds.gmailPass || creds.gmailAppPassword,
    TELEGRAM_BOT_TOKEN:      creds.telegramToken || creds.telegramBotToken,
    SLACK_BOT_TOKEN:         creds.slackToken || creds.slackBotToken,
    GOOGLE_SERVICE_ACCOUNT_KEY: creds.googleSaKey,
    TWILIO_ACCOUNT_SID:      creds.twilioSid,
    TWILIO_AUTH_TOKEN:       creds.twilioToken,
    TWILIO_WHATSAPP_NUMBER:  creds.twilioNum,
    META_WHATSAPP_ACCESS_TOKEN:    creds.metaToken,
    META_WHATSAPP_PHONE_NUMBER_ID: creds.metaPhoneId,
    WAHA_SERVER_URL:         creds.wahaUrl,
    WAHA_API_KEY:            creds.wahaKey,
    WHATSAPP_WEB_SERVER:     creds.waWebServer,
  };

  for (const [envVar, value] of Object.entries(mapping)) {
    if (value) process.env[envVar] = value;
  }
}

function buildRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  const allTools = [
    readEmailsTool, sendEmailTool, draftEmailTool, triageEmailsTool,
    listEventsTool, createEventTool, updateEventTool, findFreeSlotsTool,
    readSpreadsheetTool, writeSpreadsheetTool, searchSpreadsheetTool,
    sendSlackMessageTool, readSlackMessagesTool, listSlackChannelsTool,
    listFilesTool, readFileTool, readExcelFileTool, writeFileTool, organizeFilesTool,
    sendTelegramMessageTool, readTelegramUpdatesTool, getTelegramBotInfoTool, forwardTelegramMessageTool,
    sendWhatsAppMessageTool, readWhatsAppMessagesTool,
    saveMemoryTool, searchMemoryTool, forgetMemoryTool,
    transcribeAudioTool, transcribeAndSummarizeTool,
  ];
  for (const tool of allTools) registry.register(tool as any);
  return registry;
}
