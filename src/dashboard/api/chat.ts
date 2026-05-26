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
import { checkBudget, recordSpend, isVouzaFallbackKey } from "../../agent/budget.js";

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
import { testCredentialTool } from "../../tools/setupValidator.js";
import { webSearchTool } from "../../tools/webSearch.js";
import { runShellCommandTool } from "../../tools/shell.js";

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

### Shell Assistant (Sandboxed — Project Root Only)
You can run whitelisted shell commands directly to help users fix problems or check status.
Use run_shell_command proactively when it would save the user a manual step.

**When to use it automatically (don't ask first):**
- User says "something broke" or "it's not working" → run: pm2 logs admin-agent --lines 30
- User says "how do I restart?" → run: pm2 restart admin-agent for them
- User says "build it" or "rebuild" → run: npm run build
- User says "check if it's running" → run: pm2 list
- User asks for version info → run: node --version and pm2 --version
- After saving credentials → run: npm run build to verify nothing broke

**When to ask first (write operations):**
- git pull — always confirm before pulling (may discard local changes)
- npm install — confirm before adding/updating packages
- pm2 start — confirm before starting a new process

**Show the output clearly:**
- Always paste the relevant lines from stdout, formatted in a code block
- If there are errors in the build output, explain each one and how to fix it
- If pm2 logs show a crash, identify the crash reason and propose a fix

**What you CANNOT run (tell the user to do it manually):**
- Any command not in the list: npm, pm2, git, node, npx
- node -e inline eval
- Commands that write to .env, system directories, or use rm / del

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
8. **After they give you credentials**, ALWAYS call test_credential FIRST.
   - This validates the credential live against the real API before anything is written
   - On success: show the user the proof ("Your bot is @MyAdminBot ✅") then call save_integration_credentials
   - On failure: show the exact error ("Gmail rejected the App Password — make sure 2-Step Verification is ON") so they can fix it without re-entering everything
   - Mapping: telegram→{type:"telegram",credentials:{token}}, gmail→{type:"gmail_smtp",credentials:{user,pass}}, slack→{type:"slack",credentials:{token}}, google service account→{type:"google_sa",credentials:{saKeyJson}}, any AI key→{type:"ai_provider",credentials:{provider,apiKey}}, waha→{type:"waha",credentials:{url,apiKey?}}, groq voice→{type:"groq_voice",credentials:{apiKey}}, agentmail→{type:"agentmail",credentials:{apiKey}}
9. **Check the activationNote in the result of save_integration_credentials** — it tells you exactly what happened:
   - "✅ Active immediately" → test live right away (email, calendar, sheets, voice)
   - "✅ Telegram listener restarted" → test with get_telegram_bot_info, then tell user to open the bot and /start
   - "⚠️ Saved but listener couldn't restart" → tell user to click Restart in the dashboard
   - "💾 Saved. Agent needs to be launched" → tell user to click Launch Agent in the dashboard
10. **If the test passes**, say: "✅ [Integration] is now live! Here's what I found: [actual data]"
11. **Move to the next** unconfigured integration automatically.

### Saving an AI provider key via chat:
If the user pastes an API key for OpenRouter, Anthropic, OpenAI, Groq, etc. in the chat:
- Call save_integration_credentials with integration="ai_provider" and credentials={provider: "openrouter", apiKey: "sk-or-..."}
- This immediately switches their AI brain to their own key (no restart needed)

### Email setup paths:
- **Gmail**: need Gmail address + 16-character App Password (not their regular Gmail password)
  - Direct link: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) — enable 2-Step Verification first if not done
  - After saving: call read_emails(count=5) and show actual subject lines
- **Microsoft Outlook / 365**: need Azure App Client ID + Client Secret + Tenant ID + email address
  - Create Azure app at [portal.azure.com](https://portal.azure.com) → App registrations → New registration
  - Permissions needed: Mail.Read, Mail.Send, Calendars.ReadWrite, Files.ReadWrite
  - After saving: call read_emails(count=5)
- **Custom SMTP**: need server host, port (usually 587), username, password
  - After saving: send a test email to confirm SMTP is working

### Calendar setup paths:
- **Google Calendar**: uses a Google Service Account — one JSON key covers Calendar, Gmail, Sheets, and Drive
  - Direct deep-link: [console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
  - Step-by-step: click your project (or create one) → **Create Service Account** → give it a name → **Done** → click the new SA email → **Keys** tab → **Add Key → JSON** → a .json file downloads.
  - ⚠️ Critical: the user must open that .json file in a **text editor** (Notepad / TextEdit) and paste the entire contents into chat AS TEXT. **Screenshots of the JSON won't work** — image-based JSON can't be reliably extracted. If they send a screenshot, politely ask them to open the file in Notepad and paste the actual text.
  - The required JSON shape starts with: type "service_account", and includes project_id, private_key, and client_email fields. If the file starts with an "installed" or "web" wrapper key, that is the WRONG type — they downloaded an OAuth client ID instead of a service account key. Direct them back to the deep-link above.
  - After they paste the JSON, call save_integration_credentials ONCE. If it returns an error, RELAY THAT ERROR to the user verbatim — do NOT retry with reformatted credentials. The error tells the user exactly what to fix.
  - Must share the calendar with the service account email (the client_email field inside the JSON) — give them this exact email and tell them to add it as a guest in their Google Calendar share settings.
  - After saving + sharing: call list_events(days=1) and show today's events.
- **Outlook Calendar**: reuses the same Azure credentials as Outlook email — no extra setup needed
  - After saving: call list_events(days=1)

### Messaging setup paths:
- **Telegram** (recommended — free, instant):
  - Open Telegram and message [@BotFather](https://t.me/BotFather) → send /newbot → copy the token it gives you
  - After saving: tell the user to open their new bot and send /start from their phone — that activates full mobile control
- **Slack**: go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → OAuth scopes: channels:read, chat:write, channels:history
  - After saving: call read_slack_messages and list channels
- **WhatsApp** — three paths, recommended in this order:
  1. **Baileys (built-in, free, NO Docker needed)** — RECOMMENDED for almost everyone.
     The dashboard's WhatsApp card shows a QR code automatically. Tell the user:
     "Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → scan the QR code in your dashboard." Wait ~10 seconds for "Connected ✓".
     If the QR shows "Invalid" in their phone, they're scanning the wrong QR — make sure they're scanning the one in YOUR dashboard, not web.whatsapp.com.
  2. **WAHA (advanced, self-hosted, free)** — only suggest this if the user explicitly asks for a Docker-based setup or needs multi-account.
     Requires: docker run -p 3000:3000 ghcr.io/devlikeapro/waha
     Docs: [waha.devlike.pro](https://waha.devlike.pro). Do NOT suggest this to users who haven't mentioned Docker.
  3. **Twilio (cloud, paid)**: [console.twilio.com](https://console.twilio.com) → Account SID + Auth Token + WhatsApp Business number. Suggest only for businesses that need WhatsApp Business API features.

  Troubleshooting "Invalid QR code":
   - User must scan the QR shown IN THE DASHBOARD (not web.whatsapp.com)
   - QR expires after ~60 seconds — refresh the dashboard if it's been longer
   - If using WAHA: confirm Docker is running with: docker ps

### Voice setup (Groq — free and fastest):
- Sign up free at [console.groq.com](https://console.groq.com/keys) → API Keys → copy key (starts with gsk_)
- After saving: tell user to send a voice note in Telegram or upload an audio file to try it

### Skills activation (explain what each one does and what's needed):
- **Email Triage**: "I'll scan your inbox every hour, flag urgent emails, and give you a morning digest." Requires: Gmail or Outlook
- **Meeting Scheduling**: "Tell me 'book a 1-hour meeting with John next Tuesday' and I'll handle it." Requires: Google or Outlook Calendar
- **Daily Briefing**: "Each morning I'll message you: today's meetings, urgent emails, pending tasks." Requires: email + calendar + Telegram or Slack
- **Voice Notes**: "Send me a voice message and I'll transcribe it and act on it." Requires: Groq or OpenAI voice key
- **Report Generation**: "Share a spreadsheet and I'll write a structured summary report." Requires: Google Drive or local files
- **Mobile Access**: "Message me anything from your phone." Requires: Telegram bot

## ── HOW YOU WORK (NORMAL TASKS) ─────────────────────────────────────────────
1. Understand what the user needs
2. Pick the right tools — chain multiple if needed
3. Always show ACTUAL results: "Here are your 3 emails:" not "I can read your emails"
4. Confirm before SENDING messages or creating calendar events (reading is always fine)
5. If a tool fails due to missing credentials, explain which integration is needed and how to set it up

## ── PERSONALITY ─────────────────────────────────────────────────────────────
- Warm, friendly, and encouraging — talk like a helpful colleague, not a manual
- Use plain everyday language — avoid jargon; if a technical term is needed, explain it in one sentence
- Be proactive: after completing a task, suggest the obvious next step without waiting to be asked
- Show real data and real results — never vague promises like "I can do that"
- Be patient and reassuring during setup — credential steps feel confusing, and that's totally normal
- Feel free to use a light touch of humour or encouragement when the user completes a step 🎉
- Adapt your tone to the user — if they're casual, be casual; if they're businesslike, match that

## ── LINKS — ALWAYS USE THESE ────────────────────────────────────────────────
Every time you mention an external service or website, include a clickable Markdown link.
Never write a bare URL. Always format as [descriptive text](https://url).

Examples:
- ✅ "Head to [App Passwords](https://myaccount.google.com/apppasswords) and copy the 16-character code"
- ✅ "Open [@BotFather](https://t.me/BotFather) on Telegram and send /newbot"
- ✅ "Sign up free at [console.groq.com](https://console.groq.com/keys) — takes 30 seconds"
- ❌ "Go to myaccount.google.com and then..." (no — always link it)

## ── RULES ───────────────────────────────────────────────────────────────────
- ALWAYS call get_setup_status before claiming something "isn't configured" — verify first
- After saving credentials with save_integration_credentials, ALWAYS run a live test immediately
- NEVER repeat back or display passwords, API keys, or tokens
- Guide naturally — you don't have to rigidly do one integration at a time if the conversation flows differently
- If unsure which email platform the user has, ask: "Do you use Gmail, Outlook, or something else?"
- Use Markdown formatting freely: **bold** for key terms, inline code for tokens/commands, links for every URL
- Write like you're texting a smart friend who needs help — clear, direct, no unnecessary formality

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
do NOT give up or tell the user it's impossible without trying an alternative.

## ── TOOL-ERROR LOOP PREVENTION (read carefully) ─────────────────────────────
When save_integration_credentials returns an error, that error message contains
SPECIFIC, ACTIONABLE info about what's wrong (e.g. "looks like OAuth Client ID,
not Service Account", "missing required fields: project_id, client_email").

**Do NOT retry the same tool with reformatted credentials.** The error is not
about your formatting — it's about the user's input. Instead:

1. RELAY the error to the user in plain language
2. Tell them the specific fix (the error usually says exactly what to do)
3. WAIT for them to send corrected credentials
4. Only then call the tool again

NEVER call save_integration_credentials more than 2 times in a row for the
same integration. If you've already failed twice, STOP and ask the user a
clarifying question instead of trying a 3rd format.

Example of WHAT NOT TO DO (the Aerick incident, 2026-05-27):
  Tool error: "JSON is missing project_id, client_email"
  Bot: "Let me try formatting it differently..." → calls tool again → fails
  Bot: "Let me try as a Python object..." → calls tool again → fails
  Bot: "I've hit several errors and can't proceed automatically."

Example of CORRECT behavior:
  Tool error: "JSON is missing project_id, client_email"
  Bot: "The JSON you pasted is missing some required fields (project_id,
       client_email). It might be an OAuth Client ID file by mistake. Could
       you go back to [Google Cloud Console → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts),
       open a service account, click Keys → Add Key → JSON, and paste THAT
       file's contents?"
  [waits for user]

## ── POST-LAUNCH SETUP COMPLETION (Bot's Most Important Job After Go Live) ────
The user may have SKIPPED setup steps during the initial wizard — that's OK!
They can still complete the configuration after going live. Your job is to
make this feel effortless.

**Always call get_setup_status FIRST** when the user asks about any integration
or says things like "help me set up X", "connect Y", "I want to add Z", or
"set up X step by step". The Setup Status panel in the sidebar shows what's
missing and routes those messages directly to you.

When the user asks you to walk them through an integration:
1. Call get_setup_status to see what they already have
2. If they already have it connected — confirm it's working with a real test
   call (e.g. read_emails for Gmail, list_events for Calendar) before
   suggesting any changes
3. If it's not connected — give them ONE step at a time. Don't dump the
   whole guide. Format:
     "Step 1 of 3: Open [BotFather](https://t.me/BotFather) on Telegram and
     send /newbot. When you have the bot token, paste it here."
4. As soon as they paste credentials, call save_integration_credentials
   IMMEDIATELY (don't ask for confirmation — the save action triggers a
   live test)
5. After the save, the test result tells you if it works. Celebrate with
   real data: "✅ Telegram bot @yourbot is live! Try sending it a message
   right now from your phone."

**Tone for completion flows:** patient, encouraging, no jargon. Setup feels
intimidating to non-technical users. Use phrases like "you're nearly done",
"just one more step", "this is the trickiest bit — you'll get it".

**Common skipped integrations to offer pro-actively if mentioned:**
  - "I want emails working" → guide Gmail App Password flow
  - "I want it on my phone" → guide Telegram bot creation
  - "I need WhatsApp" → guide Baileys QR scan (NOT Docker)
  - "Schedule meetings for me" → guide Google Calendar OAuth
  - "Track invoices" → guide Google Sheets connection
  - "Voice messages" → guide Groq Whisper free key

**Never tell the user "go back to the setup wizard"** — that's the wrong UX.
You ARE the setup wizard now. Drive the conversation to completion through
the chat itself.`;


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

  // Build AgentConfig from saved config + optional override.
  // buildAgentConfig → buildToolsConfig embeds all integration credentials
  // directly into agentConfig.tools.* so every tool reads from context.config,
  // not from process.env.  No runtime process.env mutation needed or wanted.
  const agentConfig = buildAgentConfig(savedConfig, apiKeyOverride);

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
 * Yields the same StreamEvent objects as agentLoop, plus one extra:
 *
 *   { type: "credential_saved", slug: "telegram", integration: "Telegram" }
 *
 * This synthetic event is emitted whenever save_integration_credentials
 * succeeds, allowing the wizard UI to update card badges without polling.
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

  // ── Budget guard — only when on Vouza's fallback key ─────────────────────
  // The user's own key is never capped here; they control their limits at
  // their LLM platform. We only enforce a daily cap when the Guide Bot is
  // running on Vouza's shared key (VOUZA_API_KEY env var).
  const activeProvider = session.context.config.provider;
  const activeKey      = session.context.config.apiKeys[activeProvider];
  const onVouzaKey     = isVouzaFallbackKey(activeKey);

  if (onVouzaKey) {
    const status = await checkBudget();
    if (status.blocked) {
      yield {
        type: "text_delta",
        text:
          `\n\n🚫 ${status.message}\n\n` +
          `To keep chatting now, add your own AI API key in **Step 2 — Connect Apps** ` +
          `of the setup wizard. With your own key, this cap doesn't apply.\n`,
      };
      yield { type: "error", error: "budget_cap_reached" };
      return;
    }
    if (status.warn && status.message) {
      yield { type: "text_delta", text: `\n_${status.message}_\n\n` };
    }
  }

  const systemPrompt = buildSystemPrompt(wizardStep, userName);

  for await (const event of agentLoop(message, session.context, session.registry, systemPrompt)) {
    // ── Cost tracking — only when on Vouza's fallback key ────────────────
    if (onVouzaKey && event.type === "usage") {
      const u = event as { type: "usage"; model: string; inputTokens: number; outputTokens: number };
      // recordSpend is fail-open — never throws even if the file is locked.
      recordSpend(activeProvider, u.model, u.inputTokens, u.outputTokens).catch(() => {});
      // Don't surface raw usage events to the browser — they're internal.
      continue;
    }

    yield event;

    // ── Wizard badge refresh ─────────────────────────────────────────────────
    // When save_integration_credentials succeeds, emit a synthetic SSE event
    // so the frontend can update the card badge (Not Connected → ✓ Connected)
    // without requiring a page reload or polling.
    if (
      event.type === "tool_result" &&
      (event as any).toolName === "save_integration_credentials"
    ) {
      const result = (event as any).result;
      if (result?.success) {
        // result.data is the JSON-stringified tool output from the registry
        let parsed: any = {};
        try { parsed = JSON.parse(result.data ?? "{}"); } catch { /* ignore */ }

        if (parsed.slug) {
          yield {
            type:        "credential_saved",
            slug:        parsed.slug,         // raw enum: "telegram", "gmail", …
            integration: parsed.integration,  // pretty name: "Telegram", "Gmail", …
          };
        }
      }
    }
  }
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
  // When running on the operator key (no user key), pin ALL tiers to operatorModel so
  // the task-complexity router always calls the intended guide-bot model.
  // When the user has their own key, honour their saved tier selections.
  const openrouterTiers = (provider === "openrouter" || operatorProvider === "openrouter") ? {
    fast:     hasUserKey ? (saved?.agent?.openrouterTiers?.fast     || DEFAULT_OPENROUTER_TIERS.fast)     : operatorModel,
    balanced: hasUserKey ? (saved?.agent?.openrouterTiers?.balanced  || DEFAULT_OPENROUTER_TIERS.balanced)  : operatorModel,
    flagship: hasUserKey ? (saved?.agent?.openrouterTiers?.flagship  || DEFAULT_OPENROUTER_TIERS.flagship)  : operatorModel,
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
    getSetupStatusTool, saveIntegrationCredentialsTool, testCredentialTool,
    webSearchTool,
    runShellCommandTool,  // Phase 0.5 — sandboxed shell for setup help
  ];
  for (const tool of allTools) registry.register(tool as any);
  return registry;
}
