// =============================================================================
// Setup & Onboarding Tools
//
// get_setup_status         — check what's configured vs. missing, with full
//                            step-by-step guides for every supported integration
// save_integration_credentials — persist credentials to config.json + live ctx.
//                            gmail / google_calendar / telegram / whatsapp (and
//                            anything canonicalizing to them) are routed to the
//                            M2 pipeline BEFORE the legacy switch; everything
//                            else (incl. custom "smtp") uses the direct save.
// run_integration_pipeline — preferred entry point for the 4 pipeline-backed
//                            integrations (detect → validate → test → save →
//                            confirm → live-test in one call)
//
// Supported integrations:
//   Email     : Gmail, Microsoft Outlook/365, custom SMTP
//   Calendar  : Google Calendar, Microsoft Outlook Calendar
//   Messaging : Telegram, Slack, WhatsApp (WAHA / Twilio / Meta)
//   Storage   : Google Drive, OneDrive, Local files
//   Voice     : Groq Whisper (free), OpenAI Whisper
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  getPipeline,
  googleVariantFor,
  runPipeline,
  canonicalizeIntegrationName,
} from "../orchestrator/index.js";
import { childLogger } from "../util/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared pipeline executor — used by both run_integration_pipeline (the
// preferred new tool) and save_integration_credentials (legacy fallback that
// internally routes here for the 4 supported integrations).
//
// Returns the same shape both call sites surface to the LLM, so the legacy
// tool's failure-mode UX (suggestedFix + doNotRetry) matches the new tool.
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_SUPPORTED = new Set(["gmail", "google_calendar", "telegram", "whatsapp"]);

/**
 * Slice a pipeline down to its non-mutating prefix: detect → validate → test.
 * Used by test_credential (Phase 3) — it must PROVE a credential works without
 * saving anything or firing live-test side effects. If the pipeline has no
 * "test" step, the full pipeline is returned unchanged (defensive — every
 * current pipeline has one).
 */
export function testOnlySlice<T extends { steps: { name: string }[] }>(pipeline: T): T {
  const testIdx = pipeline.steps.findIndex((s) => s.name === "test");
  if (testIdx < 0) return pipeline;
  return { ...pipeline, steps: pipeline.steps.slice(0, testIdx + 1) };
}

export async function executePipeline(
  integration: string,
  credentials: Record<string, unknown> | undefined,
  ctx: any,
  opts: { chatId?: string | number; testOnly?: boolean } = {},
): Promise<{
  success: boolean;
  data?: any;
  stepReached?: string;
  error?: string;
  suggestedFix?: string;
  doNotRetry?: boolean;
}> {
  let pipeline = getPipeline(integration);
  if (!pipeline) {
    return {
      success: false,
      error: `No pipeline registered for integration "${integration}".`,
      doNotRetry: true,
    };
  }

  // testOnly: run only detect → validate → test. Nothing is persisted and no
  // live-test side effects fire — used by test_credential which must keep its
  // "never writes anything" contract.
  if (opts.testOnly) pipeline = testOnlySlice(pipeline);

  const variant = googleVariantFor(integration);
  const pipelineInput: any = {
    credentials: credentials ?? {},
    ...(variant ? { variant } : {}),
    ...(opts.chatId !== undefined ? { chatId: opts.chatId } : {}),
  };

  const log = childLogger({ component: "orchestrator", integration });
  const result = await runPipeline(pipeline, pipelineInput, {
    integration,
    logger: log,
    config: ctx?.config,
  });

  return {
    success: result.success,
    data: result.data,
    stepReached: result.stepReached,
    error: result.error,
    suggestedFix: result.suggestedFix,
    doNotRetry: result.doNotRetry,
  };
}

const CONFIG_PATH = path.resolve(process.cwd(), "data", "config.json");

async function readConfig(): Promise<any> {
  if (!existsSync(CONFIG_PATH)) return {};
  try { return JSON.parse(await readFile(CONFIG_PATH, "utf-8")); }
  catch { return {}; }
}

async function writeConfig(cfg: any): Promise<void> {
  const dir = path.dirname(CONFIG_PATH);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Step-by-step guides for every supported integration
// ─────────────────────────────────────────────────────────────────────────────

const INTEGRATION_GUIDES: Record<string, {
  name: string;
  emoji: string;
  category: string;
  requiredFields: { key: string; label: string; example: string; howTo: string }[];
  testTip: string;
  link?: string;
}> = {

  // ── EMAIL ──────────────────────────────────────────────────────────────────
  gmail: {
    name:     "Gmail",
    emoji:    "📧",
    category: "Email",
    link:     "https://myaccount.google.com/apppasswords",
    requiredFields: [
      {
        key:   "gmailUser",
        label: "Gmail Address",
        example: "yourname@gmail.com",
        howTo: "Your full Gmail address (e.g. yourname@gmail.com).",
      },
      {
        key:   "gmailPass",
        label: "Gmail App Password (16 characters)",
        example: "abcd efgh ijkl mnop",
        howTo:
          "This is NOT your normal Gmail password — it is a special 16-character app password:\n" +
          "  1. Go to myaccount.google.com → Security\n" +
          "  2. Make sure 2-Step Verification is turned ON (required)\n" +
          "  3. In the search box type 'App passwords'\n" +
          "  4. Under 'Select app' choose 'Mail' → under 'Select device' choose 'Windows Computer'\n" +
          "  5. Click Generate → copy the 16-character code\n" +
          "  6. Paste it here (spaces are OK, they are ignored)\n" +
          "  ⚠️ If you use a Google Workspace account, an admin must allow App Passwords first.",
      },
    ],
    testTip: "After saving, I'll read your 5 most recent emails to confirm the connection is working.",
  },

  outlook: {
    name:     "Microsoft Outlook / Microsoft 365",
    emoji:    "📨",
    category: "Email",
    link:     "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    requiredFields: [
      {
        key:   "outlookClientId",
        label: "Azure App Client ID",
        example: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        howTo:
          "  1. Go to portal.azure.com → Azure Active Directory → App registrations\n" +
          "  2. Click 'New registration' → name it 'Vouza Agent' → Register\n" +
          "  3. Copy the 'Application (client) ID' — that is your Client ID",
      },
      {
        key:   "outlookSecret",
        label: "Azure App Client Secret",
        example: "xxxxxxxx~xxxx-xxxx",
        howTo:
          "  Still in your Azure App registration:\n" +
          "  1. Click 'Certificates & secrets' → 'New client secret'\n" +
          "  2. Set expiry to 24 months → Add\n" +
          "  3. Copy the VALUE (not the ID) immediately — it only shows once",
      },
      {
        key:   "outlookTenant",
        label: "Azure Tenant ID",
        example: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        howTo:
          "  In Azure Active Directory → Overview, copy your 'Tenant ID'\n" +
          "  Also in your App registration → Overview → 'Directory (tenant) ID'",
      },
      {
        key:   "outlookEmail",
        label: "Your Outlook Email Address",
        example: "yourname@company.com",
        howTo:
          "  Your full Outlook/Microsoft 365 email address.\n" +
          "  ⚠️ Also in Azure Portal → API permissions, grant:\n" +
          "     Mail.Read, Mail.Send, Calendars.ReadWrite, Files.ReadWrite",
      },
    ],
    testTip: "After saving, I'll read your most recent Outlook emails to confirm.",
  },

  smtp: {
    name:     "Custom Email (IMAP + SMTP)",
    emoji:    "✉️",
    category: "Email",
    link:     "https://support.google.com/mail/answer/7126229",
    requiredFields: [
      {
        key:   "imapHost",
        label: "IMAP Server Host (for reading emails)",
        example: "imap.yourprovider.com",
        howTo:
          "The IMAP server address from your email provider.\n" +
          "  Common examples:\n" +
          "  • Yahoo Mail:     imap.mail.yahoo.com\n" +
          "  • Zoho Mail:      imap.zoho.com\n" +
          "  • Custom domain:  imap.yourdomain.com",
      },
      {
        key:   "imapPort",
        label: "IMAP Port",
        example: "993",
        howTo: "Usually 993 (SSL). Use 993 if unsure.",
      },
      {
        key:   "smtpHost",
        label: "SMTP Server Host (for sending emails)",
        example: "smtp.yourprovider.com",
        howTo:
          "The SMTP server address from your email provider.\n" +
          "  Common examples:\n" +
          "  • Yahoo Mail:     smtp.mail.yahoo.com\n" +
          "  • Zoho Mail:      smtp.zoho.com\n" +
          "  • Custom domain:  mail.yourdomain.com",
      },
      {
        key:   "smtpPort",
        label: "SMTP Port",
        example: "587",
        howTo: "Usually 587 (STARTTLS) or 465 (SSL). Use 587 if unsure.",
      },
      {
        key:   "smtpUser",
        label: "Username / Email",
        example: "yourname@yourdomain.com",
        howTo: "Your full email address or login username.",
      },
      {
        key:   "smtpPass",
        label: "Password or App Password",
        example: "your-password",
        howTo:
          "Your email password, or a special app password if your provider requires it.\n" +
          "  For Yahoo: generate an app password at security.yahoo.com\n" +
          "  For Zoho:  generate at accounts.zoho.com → Security → App Passwords",
      },
    ],
    testTip: "After saving, I'll test the connection to ensure I can read and send emails.",
  },

  // ── CALENDAR ───────────────────────────────────────────────────────────────
  google_calendar: {
    name:     "Google Calendar",
    emoji:    "📅",
    category: "Calendar",
    link:     "https://console.cloud.google.com",
    requiredFields: [
      {
        key:   "googleSaKey",
        label: "Google Service Account Key (JSON)",
        example: '{"type":"service_account","project_id":"my-project",...}',
        howTo:
          "One service account key unlocks Calendar, Sheets, AND Drive:\n" +
          "  1. Go to console.cloud.google.com\n" +
          "  2. Create a new project (or select existing)\n" +
          "  3. Enable APIs: search for and enable each of:\n" +
          "     → Google Calendar API\n" +
          "     → Google Sheets API\n" +
          "     → Google Drive API\n" +
          "  4. Go to IAM & Admin → Service Accounts → Create Service Account\n" +
          "  5. Name it (e.g. 'vouza-agent'), click Create\n" +
          "  6. Click the service account → Keys tab → Add Key → JSON → download\n" +
          "  7. Open the downloaded JSON file, copy ALL its contents and paste here\n" +
          "  8. IMPORTANT: share your Google Calendar with the service account email\n" +
          "     (found inside the JSON as 'client_email') — give it 'Make changes' permission",
      },
    ],
    testTip: "After saving, I'll list today's calendar events to confirm.",
  },

  outlook_calendar: {
    name:     "Microsoft Outlook Calendar",
    emoji:    "🗓️",
    category: "Calendar",
    link:     "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    requiredFields: [
      {
        key:   "outlookClientId",
        label: "Azure App Client ID (same as Outlook email setup)",
        example: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        howTo:
          "Same Azure app registration used for Outlook email.\n" +
          "  If you already set up Outlook email, the same credentials work.\n" +
          "  Make sure the app has Calendars.ReadWrite permission in Azure Portal.",
      },
      {
        key:   "outlookSecret",
        label: "Azure App Client Secret",
        example: "xxxxxxxx~xxxx",
        howTo: "Same client secret from your Azure app registration.",
      },
      {
        key:   "outlookTenant",
        label: "Azure Tenant ID",
        example: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        howTo: "Same Tenant ID from Azure Active Directory.",
      },
    ],
    testTip: "After saving, I'll list your upcoming Outlook calendar events to confirm.",
  },

  // ── MESSAGING ──────────────────────────────────────────────────────────────
  telegram: {
    name:     "Telegram Bot",
    emoji:    "✈️",
    category: "Messaging",
    link:     "https://t.me/BotFather",
    requiredFields: [
      {
        key:   "telegramToken",
        label: "Telegram Bot Token",
        example: "123456789:ABCdefGhIJKlmNoPQRstuVWXyz",
        howTo:
          "  1. Open Telegram → search for @BotFather → click Start\n" +
          "  2. Send the command: /newbot\n" +
          "  3. Choose a display name for your bot (e.g. 'My Admin Agent')\n" +
          "  4. Choose a username ending in 'bot' (e.g. 'myadminagent_bot')\n" +
          "  5. BotFather will reply with your bot token — copy it here\n" +
          "  6. After setup: open your bot in Telegram and send /start\n" +
          "     Then you can send messages to your AI directly from Telegram",
      },
    ],
    testTip: "After saving, I'll verify the Telegram bot is online and ready.",
  },

  slack: {
    name:     "Slack",
    emoji:    "🔔",
    category: "Messaging",
    link:     "https://api.slack.com/apps",
    requiredFields: [
      {
        key:   "slackToken",
        label: "Slack Bot Token",
        example: "xoxb-123456789012-1234567890123-abcdefghijklmnopqrstuvwx",
        howTo:
          "  1. Go to api.slack.com/apps → click 'Create New App'\n" +
          "  2. Choose 'From scratch' → name it (e.g. 'Admin Agent') → pick your workspace\n" +
          "  3. Click 'OAuth & Permissions' on the left sidebar\n" +
          "  4. Scroll to 'Bot Token Scopes' → Add these scopes:\n" +
          "     → channels:history  (read messages)\n" +
          "     → channels:read     (list channels)\n" +
          "     → chat:write        (send messages)\n" +
          "     → users:read        (resolve user names)\n" +
          "  5. Click 'Install to Workspace' → Allow\n" +
          "  6. Copy the 'Bot User OAuth Token' (starts with xoxb-)",
      },
    ],
    testTip: "After saving, I'll list your Slack channels to confirm the connection.",
  },

  whatsapp_waha: {
    name:     "WhatsApp (WAHA — self-hosted, free)",
    emoji:    "📱",
    category: "Messaging",
    link:     "https://waha.devlike.pro",
    requiredFields: [
      {
        key:   "wahaUrl",
        label: "WAHA Server URL",
        example: "http://localhost:3000",
        howTo:
          "WAHA is a free open-source WhatsApp bridge you run on your PC:\n" +
          "  1. Install Docker Desktop from docker.com (free, 5-min install)\n" +
          "  2. Open a terminal and run:\n" +
          "     docker run -d -p 3000:3000 ghcr.io/devlikeapro/waha\n" +
          "  3. Open http://localhost:3000 in your browser\n" +
          "  4. Click 'Start Session' → scan the QR code with your WhatsApp\n" +
          "  5. Once connected, go to Webhooks → add: http://localhost:3456/api/whatsapp/webhook\n" +
          "  Your WAHA URL is: http://localhost:3000",
      },
      {
        key:   "wahaKey",
        label: "WAHA API Key (optional)",
        example: "my-secret-key",
        howTo:
          "Leave this blank unless you configured an API key in WAHA's settings.\n" +
          "Most users can leave this empty.",
      },
    ],
    testTip: "After saving, I'll check if the WAHA server is reachable and your WhatsApp session is active.",
  },

  whatsapp_twilio: {
    name:     "WhatsApp via Twilio (cloud, paid)",
    emoji:    "📱",
    category: "Messaging",
    link:     "https://console.twilio.com",
    requiredFields: [
      {
        key:   "twilioSid",
        label: "Twilio Account SID",
        example: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        howTo:
          "  1. Sign up at twilio.com → go to Console Dashboard\n" +
          "  2. Copy 'Account SID' (starts with AC)",
      },
      {
        key:   "twilioToken",
        label: "Twilio Auth Token",
        example: "your_auth_token_here",
        howTo: "In Twilio Console Dashboard → copy 'Auth Token' (click the eye icon to reveal).",
      },
      {
        key:   "twilioNum",
        label: "Twilio WhatsApp Number",
        example: "+14155238886",
        howTo:
          "  1. In Twilio Console → Messaging → Senders → WhatsApp Senders\n" +
          "  2. Copy the phone number (including country code, e.g. +1415...)",
      },
    ],
    testTip: "After saving, I'll verify the Twilio credentials are valid.",
  },

  // ── STORAGE ────────────────────────────────────────────────────────────────
  google_drive: {
    name:     "Google Drive",
    emoji:    "📁",
    category: "Storage",
    link:     "https://console.cloud.google.com",
    requiredFields: [
      {
        key:   "googleSaKey",
        label: "Google Service Account Key (JSON)",
        example: '{"type":"service_account","project_id":"..."}',
        howTo:
          "Same service account key as Google Calendar — one key covers Calendar, Sheets, AND Drive.\n" +
          "  If you already set up Google Calendar, the same key works here automatically.\n" +
          "  Make sure Drive API is enabled in your Google Cloud project.",
      },
    ],
    testTip: "After saving, I'll list files in your Drive to confirm.",
  },

  // ── VOICE ──────────────────────────────────────────────────────────────────
  voice_groq: {
    name:     "Voice Transcription — Groq Whisper (Free)",
    emoji:    "🎤",
    category: "Voice",
    link:     "https://console.groq.com/keys",
    requiredFields: [
      {
        key:   "groqApiKey",
        label: "Groq API Key",
        example: "gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        howTo:
          "Groq offers free, ultra-fast Whisper transcription:\n" +
          "  1. Go to console.groq.com → sign up (free)\n" +
          "  2. Click 'API Keys' in the left menu → 'Create API Key'\n" +
          "  3. Copy the key (starts with gsk_)\n" +
          "  This also works as your AI provider key if you use Groq for the AI brain.\n" +
          "  With this you can transcribe voice messages from Telegram, WhatsApp, and email attachments.",
      },
    ],
    testTip: "After saving, voice transcription will be active. Send me a voice note to test!",
  },

  voice_openai: {
    name:     "Voice Transcription — OpenAI Whisper",
    emoji:    "🎤",
    category: "Voice",
    link:     "https://platform.openai.com/api-keys",
    requiredFields: [
      {
        key:   "openaiVoiceKey",
        label: "OpenAI API Key (for Whisper)",
        example: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxx",
        howTo:
          "  1. Go to platform.openai.com → API Keys\n" +
          "  2. Create a new key → copy it\n" +
          "  Note: If you already use OpenAI as your AI brain, the same key works here.",
      },
    ],
    testTip: "After saving, voice transcription will be active.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Skills guide — what each skill does and how to activate it
// ─────────────────────────────────────────────────────────────────────────────

const SKILLS_GUIDE: Record<string, { name: string; emoji: string; requires: string[]; description: string }> = {
  email_triage: {
    name:     "Email Triage",
    emoji:    "📥",
    requires: ["Gmail or Outlook"],
    description:
      "Automatically reads your inbox, labels important emails, flags urgent ones, and gives you a daily digest. " +
      "Activate: connect Gmail or Outlook, then say 'triage my inbox'.",
  },
  meeting_scheduling: {
    name:     "Meeting Scheduling",
    emoji:    "📅",
    requires: ["Google Calendar or Outlook Calendar"],
    description:
      "Finds free time slots, books meetings, sends invites, and manages your schedule. " +
      "Activate: connect Google Calendar or Outlook Calendar, then say 'schedule a meeting with...'.",
  },
  daily_briefing: {
    name:     "Daily Briefing",
    emoji:    "📋",
    requires: ["Gmail or Outlook", "Google Calendar"],
    description:
      "Every morning gives you a summary of today's emails, meetings, and tasks. " +
      "Activate: connect email + calendar, then say 'give me my daily briefing'.",
  },
  report_generation: {
    name:     "Report Generation",
    emoji:    "📊",
    requires: ["Google Sheets or Excel files"],
    description:
      "Reads spreadsheet data and generates structured reports, summaries, and trend analysis. " +
      "Activate: connect Google Drive or share a file, then say 'generate a report from...'.",
  },
  voice_notes: {
    name:     "Voice Note Transcription",
    emoji:    "🎙️",
    requires: ["Groq Whisper (free) or OpenAI Whisper"],
    description:
      "Transcribes voice messages from Telegram, WhatsApp, or uploaded audio files. " +
      "Activate: connect Groq or OpenAI for voice, then send a voice note.",
  },
  telegram_access: {
    name:     "Mobile Access via Telegram",
    emoji:    "📲",
    requires: ["Telegram Bot"],
    description:
      "Control your AI from your phone — send tasks, get reports, ask questions, all via Telegram. " +
      "Activate: connect Telegram bot, then open the bot on your phone and send /start.",
  },
  slack_notifications: {
    name:     "Slack Notifications & Monitoring",
    emoji:    "🔔",
    requires: ["Slack"],
    description:
      "Get proactive alerts and notifications in your Slack channels — urgent emails, meeting reminders, task completions. " +
      "Activate: connect Slack, then say 'notify me in Slack when...'.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// get_setup_status
// ─────────────────────────────────────────────────────────────────────────────

export const getSetupStatusTool = buildTool({
  name: "get_setup_status",
  description:
    "Check which integrations are currently configured and which are missing. " +
    "Returns a clear status for every supported integration (all email platforms, calendar systems, " +
    "messaging channels, storage, and voice) along with step-by-step setup instructions. " +
    "Call this at the start of any onboarding or setup conversation.",
  category: "system",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({}),
  async call(_input, ctx): Promise<any> {
    const tools   = ctx?.config?.tools     || {};
    const creds   = ctx?.config?.credentials || {} as any;

    // ── AI Provider — distinguish user's own key vs Vouza operator key ────────
    // Read raw saved config to check if the USER has actually entered their own key.
    // ctx.config.apiKeys already has the operator key merged in, so we can't use
    // it to tell whether it's the user's key or Vouza's built-in key.
    const rawCfg    = await readConfig();
    const userCreds = rawCfg?.credentials || {};
    const userProvider = rawCfg?.agent?.provider || "openrouter";

    // Check every possible slot where a user-saved key could live
    const userOwnKey =
      userCreds.openrouterApiKey ||
      userCreds.anthropicApiKey  ||
      userCreds.openaiApiKey     ||
      userCreds.googleApiKey     ||
      userCreds.deepseekApiKey   ||
      userCreds.groqApiKey       ||
      (userProvider ? userCreds[`${userProvider}ApiKey`] : "");
    const hasUserOwnKey  = !!(userOwnKey && String(userOwnKey).length >= 8);
    const hasOperatorKey = !!(process.env.VOUZA_API_KEY || "").trim();

    // ── Integration status checks ──────────────────────────────────────────
    const status: Record<string, { configured: boolean; details: string }> = {};

    // AI Provider — three possible states
    if (hasUserOwnKey) {
      status.ai_provider = {
        configured: true,
        details: `✅ AI connected — using your own API key (${userProvider}, ${ctx?.config?.model ?? "unknown"})`,
      };
    } else if (hasOperatorKey) {
      // Bot is running on Vouza's built-in key — user has NOT registered their own
      status.ai_provider = {
        configured: false,   // false = user hasn't set this up themselves yet
        details:
          "⚡ AI is running on Vouza's built-in key — no action needed to chat here. " +
          "You can optionally add your own API key in Step 2 for higher usage limits.",
      };
    } else {
      status.ai_provider = {
        configured: false,
        details: "❌ No AI API key found — enter your key in Step 2 of the setup wizard",
      };
    }

    // Email — Gmail
    const hasGmail = !!(tools.gmail?.user && tools.gmail?.appPassword)
      || !!(creds.gmailUser && creds.gmailPass);
    status.email_gmail = {
      configured: hasGmail,
      details: hasGmail
        ? `✅ Gmail connected (${tools.gmail?.user ?? creds.gmailUser ?? ""})`
        : "❌ Gmail not connected",
    };

    // Email — Outlook
    const hasOutlook = !!(creds.outlookClientId && creds.outlookSecret && creds.outlookTenant);
    status.email_outlook = {
      configured: hasOutlook,
      details: hasOutlook
        ? `✅ Microsoft Outlook connected (${creds.outlookEmail ?? ""})`
        : "❌ Microsoft Outlook not connected",
    };

    // Email — custom SMTP
    const hasSmtp = !!(creds.smtpHost && creds.smtpUser && creds.smtpPass);
    status.email_smtp = {
      configured: hasSmtp,
      details: hasSmtp
        ? `✅ SMTP email connected (${creds.smtpUser ?? ""} @ ${creds.smtpHost ?? ""})`
        : "❌ Custom SMTP not connected",
    };

    // Calendar — Google
    const hasGCal = !!(tools.google?.credentialsJson) || !!(creds.googleSaKey);
    status.calendar_google = {
      configured: hasGCal,
      details: hasGCal
        ? "✅ Google Calendar connected (also covers Sheets + Drive)"
        : "❌ Google Calendar not connected",
    };

    // Calendar — Outlook
    status.calendar_outlook = {
      configured: hasOutlook, // shared credentials with email
      details: hasOutlook
        ? "✅ Outlook Calendar accessible (uses same Azure credentials as Outlook email)"
        : "❌ Outlook Calendar not connected (same setup as Outlook email)",
    };

    // Messaging — Telegram
    const hasTelegram = !!(tools.telegram?.botToken) || !!(creds.telegramToken);
    status.messaging_telegram = {
      configured: hasTelegram,
      details: hasTelegram
        ? "✅ Telegram bot connected — you can message your AI from your phone"
        : "❌ Telegram not connected",
    };

    // Messaging — Slack
    const hasSlack = !!(tools.slack?.botToken) || !!(creds.slackToken);
    status.messaging_slack = {
      configured: hasSlack,
      details: hasSlack ? "✅ Slack connected" : "❌ Slack not connected",
    };

    // Messaging — WhatsApp
    const hasWaha   = !!(tools.whatsapp?.config?.serverUrl) || !!(creds.wahaUrl);
    const hasTwilio = !!(creds.twilioSid && creds.twilioToken);
    status.messaging_whatsapp = {
      configured: hasWaha || hasTwilio,
      details: (hasWaha || hasTwilio)
        ? `✅ WhatsApp connected (${hasWaha ? "WAHA" : "Twilio"})`
        : "❌ WhatsApp not connected",
    };

    // Storage — Google Drive
    status.storage_google_drive = {
      configured: hasGCal, // same service account
      details: hasGCal
        ? "✅ Google Drive accessible (same service account as Calendar)"
        : "❌ Google Drive not connected (connect Google Calendar — same key unlocks Drive too)",
    };

    // Voice
    const hasGroqVoice  = !!(ctx?.config?.whisperApiKey) || !!(creds.groqApiKey);
    const hasOpenAIVoice = !!(creds.openaiVoiceKey) || !!(creds.openaiApiKey);
    status.voice_transcription = {
      configured: hasGroqVoice || hasOpenAIVoice,
      details: hasGroqVoice
        ? `✅ Voice transcription ready — Groq Whisper (free tier)`
        : hasOpenAIVoice
        ? "✅ Voice transcription ready — OpenAI Whisper"
        : "❌ Voice transcription not configured — Groq is free at console.groq.com",
    };

    // ── Summary ──────────────────────────────────────────────────────────────
    const all          = Object.values(status);
    const configuredN  = all.filter(s => s.configured).length;
    const totalN       = all.length;
    const hasEmail     = hasGmail || hasOutlook || hasSmtp;
    const hasCal       = hasGCal || hasOutlook;
    const hasMsg       = hasTelegram || hasSlack || hasWaha || hasTwilio;

    // Recommended priority order for unconfigured integrations
    const priority: { key: string; reason: string }[] = [];
    if (!hasEmail)        priority.push({ key: "gmail",            reason: "Email is the most common task — start here" });
    if (!hasCal)          priority.push({ key: "google_calendar",  reason: "Calendar enables scheduling and daily briefings" });
    if (!hasTelegram)     priority.push({ key: "telegram",         reason: "Access your AI from your phone instantly (free)" });
    if (!hasGroqVoice && !hasOpenAIVoice)
                          priority.push({ key: "voice_groq",       reason: "Free voice transcription for Telegram/WhatsApp voice notes" });
    if (!hasSlack)        priority.push({ key: "slack",            reason: "Team notifications and monitoring" });
    if (!hasWaha && !hasTwilio)
                          priority.push({ key: "whatsapp_waha",    reason: "WhatsApp access via self-hosted WAHA (free)" });

    // Build setup guides for every integration
    const allGuides: Record<string, any> = {};
    for (const [key, guide] of Object.entries(INTEGRATION_GUIDES)) {
      const statusKey = Object.keys(status).find(k => k.includes(key.split("_")[0]));
      const configured = status[statusKey ?? key]?.configured ?? false;
      allGuides[key] = {
        name:        guide.name,
        emoji:       guide.emoji,
        category:    guide.category,
        link:        guide.link ?? "",
        configured,
        fields:      guide.requiredFields.map(f => ({ key: f.key, label: f.label, example: f.example, howTo: f.howTo })),
        testTip:     guide.testTip,
      };
    }

    return {
      success: true,
      data: {
        summary:          `${configuredN}/${totalN} integrations configured`,
        hasEmail,
        hasCalendar:      hasCal,
        hasMessaging:     hasMsg,
        hasVoice:         hasGroqVoice || hasOpenAIVoice,
        status,
        priorityOrder:    priority,
        setupGuides:      allGuides,
        skillsGuide:      SKILLS_GUIDE,
        nextStep: priority.length === 0
          ? "🎉 All core integrations are connected! Ask me to read emails, check your calendar, or handle any task."
          : `Recommended next: ${priority[0]?.key} — ${priority[0]?.reason}`,
      },
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// save_integration_credentials
// ─────────────────────────────────────────────────────────────────────────────

// ── Credential format validators ──────────────────────────────────────────────
// Return an error string on bad format, null on pass.
// Checked before any write so users get immediate feedback rather than a
// silent save that fails on first use.
const VALIDATORS: Partial<Record<string, (v: string) => string | null>> = {
  telegramToken: v =>
    /^\d{7,12}:[A-Za-z0-9_-]{35,}$/.test(v.trim()) ? null
    : `Token format looks wrong — expected something like 123456789:ABCdefGhIJKlmNoPQRstuVWXyz (digits, colon, 35+ chars). Got "${v.slice(0, 40)}"`,
  slackToken:    v =>
    v.trim().startsWith("xoxb-") ? null
    : "Slack Bot Token must start with xoxb-",
  groqApiKey:    v =>
    v.trim().startsWith("gsk_") ? null
    : "Groq API key must start with gsk_",
  gmailUser:     v =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null
    : "Please enter a valid Gmail address (e.g. yourname@gmail.com)",
  gmailPass:     v =>
    v.replace(/\s/g, "").length === 16 ? null
    : `Gmail App Password must be exactly 16 characters — got ${v.replace(/\s/g, "").length}. ` +
      "Copy it from Google Account → Security → App passwords (spaces are OK).",
};

function validateCredentials(c: Record<string, string>): string | null {
  for (const [key, value] of Object.entries(c)) {
    const check = VALIDATORS[key as keyof typeof VALIDATORS];
    if (check) {
      const err = check(String(value));
      if (err) return `${key}: ${err}`;
    }
  }
  return null;
}

// ── Service-to-listener mapping — which ServiceManager service to restart ─────
// Only listener-based services need a restart; tool-only integrations (email,
// calendar, sheets) are immediately usable via context.config patching.
// (telegram was removed in Phase 5: it routes to the pipeline before the
// legacy switch, so hotPatchAgent never sees integration === "telegram".)
const SERVICE_RESTART_MAP: Partial<Record<string, string>> = {
  whatsapp_waha:   "whatsapp",    // Baileys listener (waha uses webhooks — no restart needed)
};

// ── Live agent patcher — applies credential changes to the running agent ──────
async function hotPatchAgent(
  integration: string,
  tools: Record<string, any>,
  credentials: Record<string, any>,
): Promise<{ restarted: boolean; restartError?: string }> {
  const { getAgentInstance } = await import("../bridge/agentBridge.js");
  const ai = getAgentInstance();
  if (!ai) return { restarted: false };

  // Patch context.config.tools in-memory so the running agent picks up the
  // new credentials without needing a full restart (email / calendar / sheets).
  if (tools.gmail)    ai.context.config.tools.gmail    = tools.gmail;
  if (tools.google)   ai.context.config.tools.google   = tools.google;
  if (tools.telegram) ai.context.config.tools.telegram = tools.telegram;
  if (tools.slack)    ai.context.config.tools.slack     = tools.slack;
  if (tools.whatsapp) ai.context.config.tools.whatsapp = tools.whatsapp;
  if (tools.smtp)     ai.context.config.tools.smtp      = tools.smtp;
  if (tools.outlook)  ai.context.config.tools.outlook   = tools.outlook;

  // Patch AI provider keys
  if (credentials.aiProvider && credentials.aiApiKey) {
    ai.context.config.apiKeys[credentials.aiProvider] = credentials.aiApiKey;
    ai.context.config.provider = credentials.aiProvider;
  }

  // For listener-based services, try a hot-restart of the service.
  const svcName = SERVICE_RESTART_MAP[integration];
  if (svcName && ai.serviceManager.list().includes(svcName)) {
    try {
      await ai.serviceManager.restart(svcName);
      return { restarted: true };
    } catch (e) {
      return { restarted: false, restartError: String(e) };
    }
  }

  return { restarted: false };
}

export const saveIntegrationCredentialsTool = buildTool({
  name: "save_integration_credentials",
  description:
    "Save credentials for an integration to config.json and hot-patch the running agent immediately. " +
    "Call this AFTER the user provides their credentials during onboarding. " +
    "Supported integrations: gmail, outlook, smtp, google_calendar, telegram, slack, " +
    "whatsapp_waha, whatsapp_twilio, voice_groq, voice_openai, ai_provider. " +
    "After saving, IMMEDIATELY test with the relevant read/info tool to confirm it works.",
  category: "system",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    integration: z
      .enum([
        "gmail", "outlook", "smtp",
        "google_calendar",
        "telegram", "slack",
        "whatsapp_waha", "whatsapp_twilio",
        "voice_groq", "voice_openai",
        "ai_provider",
      ])
      .describe("Which integration to configure"),
    credentials: z
      // Accept ANY value per key. Some integrations want strings (api keys,
      // tokens). Google Calendar wants a JSON object OR a stringified JSON.
      // Previously this was z.record(z.string()), which made the LLM loop —
      // it tried the JSON as an object first (schema rejected), then as a
      // string (schema accepted but the bot wasn't sure which was right).
      // Now we accept both and normalize internally. Aerick incident
      // (2026-05-27): bot got stuck calling save_integration_credentials
      // 3+ times because of this exact schema mismatch.
      .record(z.unknown())
      .describe(
        "Key-value credential pairs. Most values are strings (API keys, tokens). " +
        "EXCEPTION: googleSaKey may be passed as either (a) the JSON file contents " +
        "as a single string, OR (b) a parsed object. The tool normalizes both. " +
        "gmail: {gmailUser, gmailPass} | " +
        "outlook: {outlookClientId, outlookSecret, outlookTenant, outlookEmail?} | " +
        "smtp: {smtpHost, smtpPort?, imapHost?, imapPort?, smtpUser, smtpPass} | " +
        "google_calendar: {googleSaKey} — paste the WHOLE .json file content here | " +
        "telegram: {telegramToken} | " +
        "slack: {slackToken} | " +
        "whatsapp_waha: {wahaUrl, wahaKey?} | " +
        "whatsapp_twilio: {twilioSid, twilioToken, twilioNum} | " +
        "voice_groq: {groqApiKey} | " +
        "voice_openai: {openaiVoiceKey} | " +
        "ai_provider: {provider, apiKey}  — provider = openrouter|anthropic|openai|google|xai|deepseek|groq"
      ),
  }),
  async call(input, ctx): Promise<any> {
    try {
      const cfg = await readConfig();
      if (!cfg.credentials) cfg.credentials = {};
      if (!cfg.tools)       cfg.tools = {};

      // ── Normalize credentials to strings ────────────────────────────────
      // The LLM may pass nested objects (e.g. parsed Google SA JSON) instead
      // of strings. Stringify them so the downstream switch case (which
      // assumes string values for JSON.parse) works without mode-switching.
      const rawCreds = (input.credentials || {}) as Record<string, unknown>;
      const c: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawCreds)) {
        if (v === null || v === undefined) continue;
        c[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
      const integration = input.integration;

      // ── Backward-compat routing ──────────────────────────────────────────
      // If the LLM picked this older tool but the integration has a real
      // pipeline (gmail / google_calendar / telegram / whatsapp), delegate
      // there. Same code path, same StepResult, same suggestedFix UX — so
      // the user gets the proper self-healing flow even when the model
      // chose the wrong tool name. Because this routing runs BEFORE the
      // switch below, the legacy gmail / google_calendar / telegram cases
      // were unreachable since 79bd7ee and were deleted (Phase 5).
      // Everything else (outlook, smtp, slack, voice_*, ai_provider,
      // whatsapp_waha, whatsapp_twilio) falls through to the legacy
      // direct-save switch — pipelines don't cover those yet. ("smtp"
      // used to alias to gmail and skip its own case; the alias was
      // removed because arbitrary-host SMTP credentials don't belong in
      // the Gmail pipeline — see canonicalize.ts.)
      const canonical = canonicalizeIntegrationName(integration);
      if (canonical && PIPELINE_SUPPORTED.has(canonical)) {
        const log = childLogger({ component: "tools.setup" });
        log.info(
          {
            from:        "save_integration_credentials",
            routed_to:   "run_integration_pipeline",
            integration: canonical,
            requested:   integration,
          },
          "legacy tool routed to pipeline",
        );
        return executePipeline(canonical, rawCreds, ctx);
      }

      // ── Format validation (before any write) ────────────────────────────────
      const validationError = validateCredentials(c);
      if (validationError) return { success: false, error: validationError };

      // ── Per-integration save logic ───────────────────────────────────────────
      const hotTools: Record<string, any>  = {};
      const hotCreds: Record<string, any>  = {};

      switch (integration) {

        // gmail / google_calendar / telegram cases removed (Phase 5) — they
        // canonicalize into PIPELINE_SUPPORTED and are routed to
        // executePipeline() above before this switch is ever reached.

        case "outlook": {
          if (!c.outlookClientId || !c.outlookSecret || !c.outlookTenant)
            return { success: false, error: "outlookClientId, outlookSecret, and outlookTenant are all required." };
          cfg.credentials.outlookClientId = c.outlookClientId;
          cfg.credentials.outlookSecret   = c.outlookSecret;
          cfg.credentials.outlookTenant   = c.outlookTenant;
          if (c.outlookEmail) cfg.credentials.outlookEmail = c.outlookEmail;
          cfg.tools.outlook = {
            clientId: c.outlookClientId, clientSecret: c.outlookSecret,
            tenantId: c.outlookTenant,  email: c.outlookEmail || "",
          };
          hotTools.outlook = cfg.tools.outlook;
          if (ctx?.config?.tools) ctx.config.tools.outlook = cfg.tools.outlook;
          break;
        }

        case "smtp": {
          if (!c.smtpHost || !c.smtpUser || !c.smtpPass)
            return { success: false, error: "smtpHost, smtpUser, and smtpPass are all required." };
          cfg.credentials.smtpHost = c.smtpHost;
          cfg.credentials.smtpPort = c.smtpPort || "587";
          cfg.credentials.smtpUser = c.smtpUser;
          cfg.credentials.smtpPass = c.smtpPass;
          if (c.imapHost) cfg.credentials.imapHost = c.imapHost;
          if (c.imapPort) cfg.credentials.imapPort = c.imapPort;
          cfg.tools.smtp = { 
            host: c.smtpHost, 
            port: c.smtpPort || "587", 
            user: c.smtpUser, 
            pass: c.smtpPass,
            imapHost: c.imapHost,
            imapPort: c.imapPort || "993"
          };
          hotTools.smtp = cfg.tools.smtp;
          break;
        }

        case "slack": {
          if (!c.slackToken)
            return { success: false, error: "slackToken is required." };
          cfg.credentials.slackToken = c.slackToken;
          cfg.tools.slack = { botToken: c.slackToken };
          hotTools.slack = cfg.tools.slack;
          if (ctx?.config?.tools) ctx.config.tools.slack = cfg.tools.slack;
          break;
        }

        case "whatsapp_waha": {
          if (!c.wahaUrl)
            return { success: false, error: "wahaUrl is required." };
          cfg.credentials.wahaUrl = c.wahaUrl;
          if (c.wahaKey) cfg.credentials.wahaKey = c.wahaKey;
          // WAHA uses webhooks — no listener restart needed; just save the URL.
          cfg.tools.whatsapp = { provider: "waha", config: { serverUrl: c.wahaUrl, apiKey: c.wahaKey || "" } };
          hotTools.whatsapp = cfg.tools.whatsapp;
          if (ctx?.config?.tools) ctx.config.tools.whatsapp = cfg.tools.whatsapp;
          break;
        }

        case "whatsapp_twilio": {
          if (!c.twilioSid || !c.twilioToken || !c.twilioNum)
            return { success: false, error: "twilioSid, twilioToken, and twilioNum are all required." };
          cfg.credentials.twilioSid   = c.twilioSid;
          cfg.credentials.twilioToken = c.twilioToken;
          cfg.credentials.twilioNum   = c.twilioNum;
          cfg.tools.whatsapp = { provider: "twilio", config: { accountSid: c.twilioSid, authToken: c.twilioToken, fromNumber: c.twilioNum } };
          hotTools.whatsapp = cfg.tools.whatsapp;
          if (ctx?.config?.tools) ctx.config.tools.whatsapp = cfg.tools.whatsapp;
          break;
        }

        case "voice_groq": {
          if (!c.groqApiKey)
            return { success: false, error: "groqApiKey is required." };
          cfg.credentials.groqApiKey = c.groqApiKey;
          if (ctx?.config) { (ctx.config as any).whisperApiKey = c.groqApiKey; (ctx.config as any).whisperProvider = "groq"; }
          hotCreds.whisperApiKey    = c.groqApiKey;
          hotCreds.whisperProvider  = "groq";
          break;
        }

        case "voice_openai": {
          if (!c.openaiVoiceKey)
            return { success: false, error: "openaiVoiceKey is required." };
          cfg.credentials.openaiVoiceKey = c.openaiVoiceKey;
          if (ctx?.config) { (ctx.config as any).whisperApiKey = c.openaiVoiceKey; (ctx.config as any).whisperProvider = "openai"; }
          hotCreds.whisperApiKey    = c.openaiVoiceKey;
          hotCreds.whisperProvider  = "openai";
          break;
        }

        case "ai_provider": {
          // Saves the user's own AI API key — replaces the Vouza operator key for this user.
          const provider = (c.provider || "").toLowerCase().trim();
          const apiKey   = (c.apiKey   || "").trim();
          if (!provider || !apiKey)
            return { success: false, error: "provider and apiKey are both required. provider = openrouter | anthropic | openai | google | xai | deepseek | groq" };
          const KNOWN = ["openrouter","anthropic","openai","google","xai","deepseek","alibaba","moonshot","groq"];
          if (!KNOWN.includes(provider))
            return { success: false, error: `Unknown provider "${provider}". Choose one of: ${KNOWN.join(", ")}` };

          const keyField = `${provider}ApiKey`;
          cfg.credentials[keyField] = apiKey;
          if (!cfg.agent) cfg.agent = {};
          cfg.agent.provider = provider;
          // Patch chat session immediately
          if (ctx?.config?.apiKeys) (ctx.config.apiKeys as Record<string, string>)[provider] = apiKey;
          if (ctx?.config) ctx.config.provider = provider as any;
          // Patch live agent
          hotCreds.aiProvider = provider;
          hotCreds.aiApiKey   = apiKey;
          break;
        }

        default:
          return { success: false, error: `Unknown integration: ${integration}` };
      }

      // ── Write to disk ─────────────────────────────────────────────────────────
      await writeConfig(cfg);

      // ── Hot-patch the running main agent ──────────────────────────────────────
      // This propagates the new credentials into the live agent's in-memory context
      // AND restarts listener-based services so messages start flowing immediately
      // without a full agent restart. (Result no longer inspected — the only
      // consumer was the telegram activationNote branch, removed in Phase 5.)
      await hotPatchAgent(integration, hotTools, hotCreds);

      // ── Build response ────────────────────────────────────────────────────────
      const guide = INTEGRATION_GUIDES[integration];
      const name  = guide?.name ?? integration;

      // Honest messaging: distinguish "works now" from "needs agent restart"
      // (telegram branch removed in Phase 5 — pipeline-routed, never reaches here)
      let activationNote = "";
      if (integration === "whatsapp_waha") {
        activationNote = "💾 Saved. WAHA uses webhooks — make sure the webhook URL (http://localhost:3456/api/whatsapp/webhook) is set in WAHA's dashboard.";
      } else if (integration === "ai_provider") {
        activationNote = "✅ AI provider updated — your key is now active for this chat session and saved for future sessions.";
      } else {
        activationNote = "✅ Active immediately — credentials are live in the current session.";
      }

      return {
        success: true,
        data: {
          integration:    name,
          slug:           integration,   // ← raw enum value — used by the wizard UI to update badges
          message:        `✅ ${name} credentials saved successfully.`,
          activationNote,
          nextStep:       guide?.testTip ?? "Test the connection using the relevant read tool.",
          savedFields:    Object.keys(c),
          agentPatched:   !!Object.keys(hotTools).length || !!Object.keys(hotCreds).length,
        },
      };

    } catch (err) {
      return { success: false, error: `Failed to save credentials: ${err}` };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// run_integration_pipeline — M2 self-healing orchestrator entry point
//
// Replaces ad-hoc detect → save dance for supported integrations. ONE call,
// structured result. The LLM should NOT retry — the result's suggestedFix +
// doNotRetry flag tell the user exactly what to change (Rule 56).
// ─────────────────────────────────────────────────────────────────────────────

export const runIntegrationPipelineTool = buildTool({
  name: "run_integration_pipeline",
  description:
    "Run the self-healing setup pipeline for an integration (detect, validate, test, save, confirm, live-test). " +
    "Use this for gmail, google_calendar, telegram, whatsapp instead of save_integration_credentials — " +
    "it auto-detects the credential type, runs real probes, and persists in one call. " +
    "Call ONCE per attempt. If the result has success=false, RELAY the error and suggestedFix " +
    "verbatim to the user and STOP — do not retry. doNotRetry=true means the user must change " +
    "something before another call will succeed.",
  category: "system",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    integration: z
      .enum(["gmail", "google_calendar", "telegram", "whatsapp", "whatsapp_baileys"])
      .describe("Which integration to set up"),
    credentials: z
      .record(z.unknown())
      .optional()
      .describe(
        "Credential blob — keys depend on integration. " +
        "telegram: { telegramToken }. " +
        "gmail: { gmailUser, gmailPass } OR { googleSaKey }. " +
        "google_calendar: { googleSaKey } (JSON string or object). " +
        "whatsapp: optional — Baileys uses QR pairing, no credentials needed here.",
      ),
    chatId: z
      .union([z.string(), z.number()])
      .optional()
      .describe("Telegram only — chat_id for the live-test message. Omit for first-time setup."),
  }),
  async call(input, ctx): Promise<any> {
    return executePipeline(input.integration, input.credentials, ctx, {
      chatId: input.chatId,
    });
    // Attempts log intentionally NOT surfaced — internal fallbacks stay
    // silent (Aerick feedback: don't show retry noise in chat).
  },
});
