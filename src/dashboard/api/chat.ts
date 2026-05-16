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
import { getSetupStatusTool, saveIntegrationCredentialsTool } from "../../tools/setup.js";
import { webSearchTool } from "../../tools/webSearch.js";

// ─────────────────────────────────────────────────────────────────────────────
// Chat system prompt — full office agent capabilities
// ─────────────────────────────────────────────────────────────────────────────

export const CHAT_SYSTEM_PROMPT = `You are an intelligent AI office assistant built on the Vouza AI platform.
You help with email, calendar, messaging, files, voice, and reporting tasks.

## ── CAPABILITIES ───────────────────────────────────────────────────────────

### Email (Gmail · Outlook/Microsoft 365 · Custom SMTP)
- Read inbox, search emails, mark as read/unread
- Draft and send emails
- Triage inbox: flag urgent, label, summarise
- Reply to threads

### Calendar (Google Calendar · Microsoft Outlook Calendar)
- List upcoming events (today, this week, any range)
- Find free time slots across participants
- Book meetings, create invites
- Update or cancel events

### Messaging (Telegram · Slack · WhatsApp)
- Send and read Telegram messages
- Send Slack notifications to channels or DMs
- Read Slack channel history
- Send WhatsApp messages (via WAHA or Twilio)

### Files & Spreadsheets (Google Drive · Local files · Google Sheets)
- Read, write, and search files
- Read spreadsheet data, write values, summarise sheets
- Organise folders

### Voice Transcription (Groq Whisper — free · OpenAI Whisper)
- Transcribe voice notes from Telegram, WhatsApp, or uploaded audio
- Summarise transcribed meetings
- Convert audio attachments to readable text

### Web Search (Tavily · Serper · Brave)
- Search the internet for current news, prices, company info, research
- Use when the user asks about anything recent or real-time
- Call web_search with a specific query — show titles, URLs, and key snippets

### Reports & Analysis
- Summarise email threads or data sets
- Generate structured reports from spreadsheet data
- Spot trends and create daily/weekly digests

## ── GUIDED SETUP ────────────────────────────────────────────────────────────

When the user first opens the chat OR asks about setup, connecting an integration, or "how does this work":

### ALWAYS follow this flow:
1. **Call get_setup_status first** — see exactly what is and isn't connected.
2. **Read the ai_provider status carefully:**
   - If details starts with "⚡ AI is running on Vouza's built-in key" → the USER has NOT registered yet. Greet them warmly: "Welcome! 👋 Your AI is powered by Vouza — no API key needed to get started. Let's connect your apps so your assistant can actually work for you."
   - If details starts with "✅ AI connected — using your own" → user has their own key set up. Acknowledge it: "Great — your AI key is connected. Here's what's still left to set up:"
   - If details starts with "❌ No AI API key" → direct them to Step 2 first.
3. **For new users (Vouza key only):** Skip mentioning "AI Provider" entirely in your summary — they don't need to do anything about it. Jump straight to the apps they need to connect (email, Telegram, calendar).
4. **Announce what still needs connecting** — only list items the user actually needs to act on. Do NOT list "AI Provider" as a ✅ win if it's only Vouza's key.
5. **Ask which they want to set up next** (or use the recommended priority order from the tool).
6. **Walk through ONE integration at a time** — never dump all instructions at once.
7. **Give the exact step-by-step** from the setupGuides in the tool result.
8. **After they give you credentials**, call save_integration_credentials immediately.
9. **Test live right away** — run the actual tool, show real data, confirm it works.
10. **Say the magic words**: "✅ [Integration] is now live! Here's what I found: [actual data]"
11. **Move to the next** unconfigured integration automatically.

### Email setup paths:
- **Gmail**: need Gmail address + 16-character App Password (not their regular Gmail password)
  - App passwords: myaccount.google.com → Security → 2-Step Verification → App passwords
  - After saving: call read_emails(count=5) and show actual subject lines
- **Microsoft Outlook / 365**: need Azure App Client ID + Client Secret + Tenant ID + email address
  - Create Azure app at portal.azure.com → App registrations
  - Permissions needed: Mail.Read, Mail.Send, Calendars.ReadWrite, Files.ReadWrite
  - After saving: call read_emails(count=5)
- **Custom SMTP**: need server host, port (usually 587), username, password
  - After saving: send a test email to confirm SMTP is working

### Calendar setup paths:
- **Google Calendar**: same Google Service Account JSON as Google Drive/Sheets — one key covers all
  - console.cloud.google.com → IAM → Service Accounts → Create → Download JSON key
  - Must share calendar with the service_account email inside the JSON
  - After saving: call list_events(days=1) and show today's events
- **Outlook Calendar**: same Azure credentials as Outlook email — no extra setup needed
  - After saving: call list_events(days=1)

### Messaging setup paths:
- **Telegram** (recommended — free, instant mobile access):
  - @BotFather on Telegram → /newbot → copy token
  - After saving: verify bot is online, tell user to open the bot and send /start from their phone
  - This enables full mobile control of the AI
- **Slack**: api.slack.com/apps → create app → OAuth scopes: channels:read, chat:write, channels:history
  - After saving: call read_slack_messages and list channels
- **WhatsApp WAHA** (self-hosted, free): docker run ghcr.io/devlikeapro/waha → scan QR
  - After saving: check server is reachable
- **WhatsApp Twilio** (cloud, paid): Twilio Console → Account SID + Auth Token + phone number

### Voice setup (Groq — free and recommended):
- console.groq.com → sign up free → API Keys → copy key (starts with gsk_)
- After saving: tell user to send a voice note in Telegram or upload an audio file

### Skills activation (explain what each one does and what's needed):
- **Email Triage**: "I'll scan your inbox every hour, flag urgent emails, and give you a morning digest." Requires: Gmail or Outlook
- **Meeting Scheduling**: "Tell me 'book a 1-hour meeting with John next Tuesday' and I'll handle it." Requires: Google or Outlook Calendar
- **Daily Briefing**: "Each morning I'll message you: today's meetings, urgent emails, pending tasks." Requires: email + calendar + Telegram or Slack
- **Voice Notes**: "Send me a voice message and I'll transcribe it and act on it." Requires: Groq or OpenAI voice key
- **Report Generation**: "Share a spreadsheet and I'll write a structured summary report." Requires: Google Drive or local files
- **Mobile Access**: "Message me anything from your phone." Requires: Telegram bot

## ── HOW YOU WORK (NORMAL TASKS) ─────────────────────────────────────────────
1. Understand what the user needs
2. Pick the right tools — chain multiple if the task requires it
3. Always show ACTUAL results: "Here are your 3 emails:" not "I can read your emails"
4. Confirm before SENDING messages or creating calendar events (reading is always fine)
5. If a tool fails due to missing credentials, explain exactly which integration is needed and how to set it up

## ── PERSONALITY ─────────────────────────────────────────────────────────────
- Professional and efficient, but warm and conversational
- Proactive: suggest the next useful action after completing a task
- Concrete: show real data, real results — never vague promises
- Patient with setup: credentials are confusing, walk slowly and confirm each step

## ── RULES ───────────────────────────────────────────────────────────────────
- ALWAYS call get_setup_status before claiming something "isn't configured" — verify first
- After saving credentials with save_integration_credentials, ALWAYS run a live test immediately
- NEVER repeat back or display passwords, API keys, or tokens
- Walk through integrations one at a time — never dump all instructions in one message
- If you are unsure which email platform the user has, ask: "Do you use Gmail, Microsoft Outlook, or another email provider?"
- Prefer accuracy over speed

## ── THINK BEFORE ACTING (Scratch Pad) ──────────────────────────────────────
For any non-trivial request (multi-step setup, ambiguous task, or anything
requiring more than one tool call), write a brief think block FIRST:

<think>
Goal: [what the user actually wants]
Plan: [ordered steps / tool calls]
Risk: [what could go wrong or needs confirmation]
</think>

Skip <think> for simple single-step tasks ("what can you do", "show my status").
Use the think block honestly — it's your scratchpad, not for the user.

## ── RUNNING SUMMARY (Stay on Track Across Tool Calls) ───────────────────────
After every tool result, before deciding your next action, integrate:
- What did this result tell me?
- Does this change my plan?
- What is the single best next step?

Never react only to the most recent result in isolation — hold the full context
of what you've done and learned. If a tool fails, analyze the error and adjust;
do NOT give up or tell the user it's impossible without trying an alternative.`;


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

// ─────────────────────────────────────────────────────────────────────────────
// Step-aware system prompt builder
// ─────────────────────────────────────────────────────────────────────────────

const STEP_CONTEXT: Record<number, string> = {
  1: "The user is on **Step 1 — Your Profile**. They are filling in their name, email address, and choosing an AI model. Help them understand what each field does. The most important action here is completing the profile form and choosing a model.",
  2: "The user is on **Step 2 — Connect Apps**. They are entering their AI API key and setting up integrations (Gmail, Telegram, Calendar, Slack, etc.). Focus on whichever integration they are working on. If they have not entered an AI key yet, encourage them to do that first — it unlocks the live assistant.",
  3: "The user is on **Step 3 — Choose Skills**. They are selecting which automated tasks to enable (Email Triage, Daily Briefing, Meeting Scheduling, Voice Notes, etc.). Explain what each skill does and what prerequisites (integrations) it needs. Help them pick skills that match their actual connected apps.",
  4: "The user is on **Step 4 — Review & Go Live**. They are reviewing their full configuration before clicking 'Go Live'. Help them spot any missing connections and confirm they are ready to launch.",
};

function buildSystemPrompt(wizardStep?: number, userName?: string): string {
  let suffix = "";

  if (userName) {
    suffix +=
      "\n\n## ── CURRENT USER ─────────────────────────────────────────────────────────\n" +
      `The user's name is **${userName}**. Address them by name occasionally — on greeting, on key milestones, and when giving direct advice. Don't overdo it; once every few turns is natural.\n`;
  }

  const stepGuide = wizardStep ? STEP_CONTEXT[wizardStep] : undefined;
  if (stepGuide) {
    suffix +=
      "\n\n## ── WIZARD CONTEXT ──────────────────────────────────────────────────────────\n" +
      stepGuide + "\n";
  }

  return suffix ? CHAT_SYSTEM_PROMPT + suffix : CHAT_SYSTEM_PROMPT;
}

/**
 * Stream a chat message through the agent loop.
 * Yields the same StreamEvent objects as agentLoop.
 *
 * @param wizardStep  Current wizard step (1-4) passed from the browser
 * @param userName    User's name from the Step 1 form (for personalisation)
 */
export async function* streamChat(
  sessionId: string,
  message: string | any[],
  savedConfig: any,
  apiKeyOverride?: string,
  wizardStep?: number,
  userName?: string,
): AsyncGenerator<Record<string, unknown>> {
  const session = getOrCreateSession(sessionId, savedConfig, apiKeyOverride);
  session.lastActive = Date.now();

  const systemPrompt = buildSystemPrompt(wizardStep, userName);
  yield* agentLoop(message, session.context, session.registry, systemPrompt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildAgentConfig(saved: any, apiKeyOverride?: string): AgentConfig {
  // ── Operator defaults — set via VOUZA_API_KEY env var ─────────────────────
  // Vouza ships the agent with a default key so customers can use it immediately.
  // The user's own key always takes priority when configured.
  const operatorKey      = (process.env.VOUZA_API_KEY      || "").trim();
  const operatorProvider = (process.env.VOUZA_API_PROVIDER || "openrouter") as AIProvider;
  const operatorModel    = (process.env.VOUZA_API_MODEL    || "google/gemma-4-31b-it:free");

  const creds = saved?.credentials || {};

  // ── Determine effective provider ──────────────────────────────────────────
  // A user's provider choice only takes effect if they've actually saved a key
  // for that provider. DEFAULT_CONFIG ships with provider="anthropic" but no key,
  // so we must not let that block the operator key's provider.
  const userProvider = saved?.agent?.provider as AIProvider | undefined;
  const userProviderKey =
    (userProvider ? creds[`${userProvider}ApiKey`] : "") ||
    (userProvider === "openrouter" ? creds["openrouterApiKey"] : "");
  const hasUserKey = userProviderKey.length >= 8;

  // Priority: user's provider (if they have a matching key) → operator provider → anthropic
  const provider: AIProvider = hasUserKey
    ? (userProvider as AIProvider)
    : (operatorKey ? operatorProvider : userProvider || "anthropic");

  // Build the full apiKeys record (user keys take priority over env vars)
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

  // Pull user's wizard-saved key into the active provider slot
  if (userProviderKey) apiKeys[provider] = userProviderKey;

  // Operator key: fills the gap when no user key is configured for this provider
  if (!apiKeys[provider] || apiKeys[provider].length < 8) {
    apiKeys[provider]          = operatorKey;  // inject for active provider slot
    apiKeys[operatorProvider]  = operatorKey;  // also keep on its native provider slot
  }

  // Request-level override wins everything
  if (apiKeyOverride) apiKeys[provider] = apiKeyOverride;

  // ── Effective model ───────────────────────────────────────────────────────
  // hasUserKey already computed above — true when user has their own saved key.
  // User key → their chosen model. Operator key → free operator model.

  // OpenRouter: build tiered model config
  const openrouterTiers = (provider === "openrouter" || operatorProvider === "openrouter") ? {
    fast:     (hasUserKey ? saved?.agent?.openrouterTiers?.fast    : undefined) || DEFAULT_OPENROUTER_TIERS.fast,
    balanced: (hasUserKey ? saved?.agent?.openrouterTiers?.balanced : undefined) || DEFAULT_OPENROUTER_TIERS.balanced,
    flagship: (hasUserKey ? saved?.agent?.openrouterTiers?.flagship : undefined) || DEFAULT_OPENROUTER_TIERS.flagship,
  } : undefined;

  // Display model: operator model when no user key, otherwise user selection
  const model = hasUserKey
    ? (provider === "openrouter"
        ? (openrouterTiers?.balanced ?? DEFAULT_OPENROUTER_TIERS.balanced)
        : (saved?.agent?.model || "claude-sonnet-4-6"))
    : operatorModel;

  // ── Whisper voice transcription (separate from main AI provider) ───────────
  // Priority: explicit voice tool card > Groq key > OpenAI key in apiKeys
  let whisperApiKey:   string | undefined;
  let whisperProvider: "openai" | "groq" | undefined;

  const voiceTool = saved?.tools?.voice;
  if (voiceTool?.enabled) {
    const vProv = (voiceTool.provider || "groq") as "openai" | "groq";
    const vCfg  = voiceTool.config || {};
    const vKey  = vProv === "groq"
      ? (vCfg.groqApiKey    || creds.groqApiKey   || "")
      : (vCfg.openaiVoiceKey || vCfg.openaiApiKey || creds.openaiApiKey || "");
    if (vKey) { whisperApiKey = vKey; whisperProvider = vProv; }
  }
  if (!whisperApiKey) {
    if (creds.groqApiKey)   { whisperApiKey = creds.groqApiKey;   whisperProvider = "groq";   }
    else if (apiKeys.openai) { whisperApiKey = apiKeys.openai;    whisperProvider = "openai"; }
  }

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
    whisperApiKey,
    whisperProvider,
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
    getSetupStatusTool, saveIntegrationCredentialsTool,
    webSearchTool,
  ];
  for (const tool of allTools) registry.register(tool as any);
  return registry;
}
