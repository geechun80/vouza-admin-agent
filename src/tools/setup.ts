// =============================================================================
// Setup & Onboarding Tools
//
// get_setup_status         — check what's configured vs. missing, with full
//                            step-by-step guides for every supported integration
// save_integration_credentials — persist credentials to config.json + live ctx
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
    name:     "Custom SMTP (any email provider)",
    emoji:    "✉️",
    category: "Email",
    link:     "https://support.google.com/mail/answer/7126229",
    requiredFields: [
      {
        key:   "smtpHost",
        label: "SMTP Server Host",
        example: "smtp.yourprovider.com",
        howTo:
          "The SMTP server address from your email provider.\n" +
          "  Common examples:\n" +
          "  • Gmail:          smtp.gmail.com (use the Gmail setup instead)\n" +
          "  • Yahoo Mail:     smtp.mail.yahoo.com\n" +
          "  • Zoho Mail:      smtp.zoho.com\n" +
          "  • Custom domain:  mail.yourdomain.com\n" +
          "  Check your provider's help docs for 'SMTP settings'.",
      },
      {
        key:   "smtpPort",
        label: "SMTP Port",
        example: "587",
        howTo: "Usually 587 (STARTTLS) or 465 (SSL). Use 587 if unsure.",
      },
      {
        key:   "smtpUser",
        label: "SMTP Username / Email",
        example: "yourname@yourdomain.com",
        howTo: "Your full email address or the SMTP login username.",
      },
      {
        key:   "smtpPass",
        label: "SMTP Password or App Password",
        example: "your-password",
        howTo:
          "Your email password, or a special app password if your provider requires it.\n" +
          "  For Yahoo: generate an app password at security.yahoo.com\n" +
          "  For Zoho:  generate at accounts.zoho.com → Security → App Passwords",
      },
    ],
    testTip: "After saving, I'll send a test email to confirm the SMTP connection works.",
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
    const aiKey   = ctx?.config?.apiKeys?.[ctx?.config?.provider || "anthropic"] || "";

    // ── Integration status checks ──────────────────────────────────────────
    const status: Record<string, { configured: boolean; details: string }> = {};

    // AI Provider (always first)
    status.ai_provider = {
      configured: !!aiKey,
      details: aiKey
        ? `✅ AI connected — provider: ${ctx?.config?.provider ?? "anthropic"}, model: ${ctx?.config?.model ?? "unknown"}`
        : "❌ No AI API key configured — this must be entered in Step 1 of the setup wizard",
    };

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

export const saveIntegrationCredentialsTool = buildTool({
  name: "save_integration_credentials",
  description:
    "Save credentials for an integration to config.json and activate it immediately — no restart needed. " +
    "Call this AFTER the user provides their credentials during onboarding. " +
    "Supported: gmail, outlook, smtp, google_calendar, telegram, slack, whatsapp_waha, whatsapp_twilio, voice_groq, voice_openai. " +
    "After saving, IMMEDIATELY test with the relevant read tool to confirm it works.",
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
      ])
      .describe("Which integration to configure"),
    credentials: z
      .record(z.string())
      .describe(
        "Key-value credential pairs for the chosen integration. " +
        "gmail: {gmailUser, gmailPass} | " +
        "outlook: {outlookClientId, outlookSecret, outlookTenant, outlookEmail?} | " +
        "smtp: {smtpHost, smtpPort, smtpUser, smtpPass} | " +
        "google_calendar: {googleSaKey} | " +
        "telegram: {telegramToken} | " +
        "slack: {slackToken} | " +
        "whatsapp_waha: {wahaUrl, wahaKey?} | " +
        "whatsapp_twilio: {twilioSid, twilioToken, twilioNum} | " +
        "voice_groq: {groqApiKey} | " +
        "voice_openai: {openaiVoiceKey}"
      ),
  }),
  async call(input, ctx): Promise<any> {
    try {
      const cfg = await readConfig();
      if (!cfg.credentials) cfg.credentials = {};
      if (!cfg.tools)       cfg.tools = {};

      const { credentials: c, integration } = input;

      switch (integration) {

        case "gmail": {
          if (!c.gmailUser || !c.gmailPass)
            return { success: false, error: "gmailUser and gmailPass are both required." };
          cfg.credentials.gmailUser     = c.gmailUser;
          cfg.credentials.gmailPass     = c.gmailPass;
          cfg.tools.gmail = { user: c.gmailUser, appPassword: c.gmailPass, emailAddress: c.gmailUser };
          if (ctx?.config?.tools) ctx.config.tools.gmail = cfg.tools.gmail;
          process.env.GMAIL_USER         = c.gmailUser;
          process.env.GMAIL_APP_PASSWORD = c.gmailPass;
          break;
        }

        case "outlook": {
          if (!c.outlookClientId || !c.outlookSecret || !c.outlookTenant)
            return { success: false, error: "outlookClientId, outlookSecret, and outlookTenant are all required." };
          cfg.credentials.outlookClientId = c.outlookClientId;
          cfg.credentials.outlookSecret   = c.outlookSecret;
          cfg.credentials.outlookTenant   = c.outlookTenant;
          if (c.outlookEmail) cfg.credentials.outlookEmail = c.outlookEmail;
          cfg.tools.outlook = {
            clientId: c.outlookClientId,
            clientSecret: c.outlookSecret,
            tenantId: c.outlookTenant,
            email: c.outlookEmail || "",
          };
          if (ctx?.config?.tools) ctx.config.tools.outlook = cfg.tools.outlook;
          process.env.OUTLOOK_CLIENT_ID     = c.outlookClientId;
          process.env.OUTLOOK_CLIENT_SECRET = c.outlookSecret;
          process.env.OUTLOOK_TENANT_ID     = c.outlookTenant;
          if (c.outlookEmail) process.env.OUTLOOK_EMAIL = c.outlookEmail;
          break;
        }

        case "smtp": {
          if (!c.smtpHost || !c.smtpUser || !c.smtpPass)
            return { success: false, error: "smtpHost, smtpUser, and smtpPass are all required." };
          cfg.credentials.smtpHost = c.smtpHost;
          cfg.credentials.smtpPort = c.smtpPort || "587";
          cfg.credentials.smtpUser = c.smtpUser;
          cfg.credentials.smtpPass = c.smtpPass;
          cfg.tools.smtp = { host: c.smtpHost, port: c.smtpPort || "587", user: c.smtpUser, pass: c.smtpPass };
          process.env.SMTP_HOST = c.smtpHost;
          process.env.SMTP_PORT = c.smtpPort || "587";
          process.env.SMTP_USER = c.smtpUser;
          process.env.SMTP_PASS = c.smtpPass;
          break;
        }

        case "google_calendar": {
          if (!c.googleSaKey) return { success: false, error: "googleSaKey (full JSON string) is required." };
          try { JSON.parse(c.googleSaKey); } catch {
            return { success: false, error: "That does not look like valid JSON. Please paste the full service account key file contents." };
          }
          cfg.credentials.googleSaKey = c.googleSaKey;
          cfg.tools.google = {
            credentialsJson: c.googleSaKey,
            scopes: [
              "https://www.googleapis.com/auth/calendar",
              "https://www.googleapis.com/auth/gmail.modify",
              "https://www.googleapis.com/auth/spreadsheets",
              "https://www.googleapis.com/auth/drive",
            ],
          };
          if (ctx?.config?.tools) ctx.config.tools.google = cfg.tools.google;
          process.env.GOOGLE_SERVICE_ACCOUNT_KEY = c.googleSaKey;
          break;
        }

        case "telegram": {
          if (!c.telegramToken) return { success: false, error: "telegramToken is required." };
          cfg.credentials.telegramToken = c.telegramToken;
          cfg.tools.telegram = { botToken: c.telegramToken };
          if (ctx?.config?.tools)  ctx.config.tools.telegram = cfg.tools.telegram;
          if (ctx?.config)        (ctx.config as any).telegramToken = c.telegramToken;
          process.env.TELEGRAM_BOT_TOKEN = c.telegramToken;
          break;
        }

        case "slack": {
          if (!c.slackToken) return { success: false, error: "slackToken is required." };
          cfg.credentials.slackToken = c.slackToken;
          cfg.tools.slack = { botToken: c.slackToken };
          if (ctx?.config?.tools) ctx.config.tools.slack = cfg.tools.slack;
          process.env.SLACK_BOT_TOKEN = c.slackToken;
          break;
        }

        case "whatsapp_waha": {
          if (!c.wahaUrl) return { success: false, error: "wahaUrl is required." };
          cfg.credentials.wahaUrl = c.wahaUrl;
          if (c.wahaKey) cfg.credentials.wahaKey = c.wahaKey;
          cfg.tools.whatsapp = { provider: "waha", config: { serverUrl: c.wahaUrl, apiKey: c.wahaKey || "" } };
          if (ctx?.config?.tools) ctx.config.tools.whatsapp = cfg.tools.whatsapp;
          process.env.WAHA_SERVER_URL = c.wahaUrl;
          if (c.wahaKey) process.env.WAHA_API_KEY = c.wahaKey;
          break;
        }

        case "whatsapp_twilio": {
          if (!c.twilioSid || !c.twilioToken || !c.twilioNum)
            return { success: false, error: "twilioSid, twilioToken, and twilioNum are all required." };
          cfg.credentials.twilioSid   = c.twilioSid;
          cfg.credentials.twilioToken = c.twilioToken;
          cfg.credentials.twilioNum   = c.twilioNum;
          cfg.tools.whatsapp = { provider: "twilio", config: { accountSid: c.twilioSid, authToken: c.twilioToken, fromNumber: c.twilioNum } };
          if (ctx?.config?.tools) ctx.config.tools.whatsapp = cfg.tools.whatsapp;
          process.env.TWILIO_ACCOUNT_SID  = c.twilioSid;
          process.env.TWILIO_AUTH_TOKEN   = c.twilioToken;
          process.env.TWILIO_PHONE_NUMBER = c.twilioNum;
          break;
        }

        case "voice_groq": {
          if (!c.groqApiKey) return { success: false, error: "groqApiKey is required." };
          cfg.credentials.groqApiKey = c.groqApiKey;
          if (ctx?.config) (ctx.config as any).whisperApiKey = c.groqApiKey;
          if (ctx?.config) (ctx.config as any).whisperProvider = "groq";
          process.env.GROQ_API_KEY    = c.groqApiKey;
          process.env.WHISPER_PROVIDER = "groq";
          break;
        }

        case "voice_openai": {
          if (!c.openaiVoiceKey) return { success: false, error: "openaiVoiceKey is required." };
          cfg.credentials.openaiVoiceKey = c.openaiVoiceKey;
          if (ctx?.config) (ctx.config as any).whisperApiKey = c.openaiVoiceKey;
          if (ctx?.config) (ctx.config as any).whisperProvider = "openai";
          process.env.OPENAI_API_KEY  = c.openaiVoiceKey;
          process.env.WHISPER_PROVIDER = "openai";
          break;
        }

        default:
          return { success: false, error: `Unknown integration: ${integration}` };
      }

      await writeConfig(cfg);

      const guide = INTEGRATION_GUIDES[integration];
      return {
        success: true,
        data: {
          integration: guide?.name ?? integration,
          message:     `✅ ${guide?.name ?? integration} credentials saved and activated (no restart needed).`,
          nextStep:    guide?.testTip ?? "Test the connection using the relevant read tool.",
          savedFields: Object.keys(c),
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to save credentials: ${err}` };
    }
  },
});
