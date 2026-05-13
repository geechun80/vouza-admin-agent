// =============================================================================
// Setup & Onboarding Tools
//
// These tools let the agent guide users through connecting integrations
// conversationally — ask for credentials, save them, and run a live test.
//
// get_setup_status         — check what's configured vs. missing
// save_integration_credentials — persist credentials to config.json + live context
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), "data", "config.json");

async function readConfig(): Promise<any> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function writeConfig(cfg: any): Promise<void> {
  const dir = path.dirname(CONFIG_PATH);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Step-by-step guides for each integration
// ---------------------------------------------------------------------------

const INTEGRATION_GUIDES: Record<string, {
  name: string;
  emoji: string;
  requiredFields: { key: string; label: string; example: string; howTo: string }[];
  testTip: string;
}> = {
  gmail: {
    name: "Gmail (Email)",
    emoji: "📧",
    requiredFields: [
      {
        key: "gmailUser",
        label: "Gmail Address",
        example: "yourname@gmail.com",
        howTo: "Your full Gmail address.",
      },
      {
        key: "gmailPass",
        label: "Gmail App Password",
        example: "xxxx xxxx xxxx xxxx",
        howTo:
          "NOT your normal password — a special 16-char app password:\n" +
          "  1. Go to myaccount.google.com → Security\n" +
          "  2. Enable 2-Step Verification if not already on\n" +
          "  3. Search 'App Passwords' → Select app: Mail → Generate\n" +
          "  4. Copy the 16-character code shown",
      },
    ],
    testTip: "After saving, I'll read your 3 most recent emails to confirm it's working.",
  },
  google: {
    name: "Google Workspace (Calendar, Sheets, Drive)",
    emoji: "📅",
    requiredFields: [
      {
        key: "googleSaKey",
        label: "Google Service Account Key (JSON)",
        example: '{"type":"service_account","project_id":"..."}',
        howTo:
          "One key unlocks Calendar, Sheets, and Drive:\n" +
          "  1. Go to console.cloud.google.com\n" +
          "  2. Create a project → Enable APIs: Calendar API, Sheets API, Drive API\n" +
          "  3. IAM & Admin → Service Accounts → Create → Download JSON key\n" +
          "  4. Share your Google Calendar with the service account email (found inside the JSON)\n" +
          "  5. Paste the entire JSON content here",
      },
    ],
    testTip: "After saving, I'll list today's calendar events to confirm.",
  },
  telegram: {
    name: "Telegram Bot",
    emoji: "💬",
    requiredFields: [
      {
        key: "telegramToken",
        label: "Telegram Bot Token",
        example: "123456789:ABCdefGhIJKlmNoPQRstuVWXyz",
        howTo:
          "  1. Open Telegram → search @BotFather\n" +
          "  2. Send /newbot → choose a name and a username\n" +
          "  3. Copy the bot token BotFather gives you",
      },
    ],
    testTip: "After saving, I'll verify the bot is online.",
  },
  slack: {
    name: "Slack",
    emoji: "🔔",
    requiredFields: [
      {
        key: "slackToken",
        label: "Slack Bot Token",
        example: "xoxb-...",
        howTo:
          "  1. Go to api.slack.com/apps → Create New App\n" +
          "  2. OAuth & Permissions → Add Scopes: channels:read, chat:write, users:read\n" +
          "  3. Install to Workspace → Copy Bot User OAuth Token (starts with xoxb-)",
      },
    ],
    testTip: "After saving, I'll list your Slack channels to confirm.",
  },
  whatsapp_waha: {
    name: "WhatsApp (WAHA Self-hosted)",
    emoji: "📱",
    requiredFields: [
      {
        key: "wahaUrl",
        label: "WAHA Server URL",
        example: "http://localhost:3000",
        howTo:
          "  1. Run WAHA: docker run -p 3000:3000 ghcr.io/devlikeapro/waha\n" +
          "  2. Open http://localhost:3000 → scan QR with your WhatsApp\n" +
          "  3. In WAHA → Webhooks → add URL: http://localhost:3456/api/whatsapp/webhook",
      },
      {
        key: "wahaKey",
        label: "WAHA API Key (optional)",
        example: "my-secret-key",
        howTo: "Leave empty if you haven't set an API key in WAHA.",
      },
    ],
    testTip: "After saving, I'll check if the WAHA server is reachable.",
  },
};

// ---------------------------------------------------------------------------
// get_setup_status
// ---------------------------------------------------------------------------

export const getSetupStatusTool = buildTool({
  name: "get_setup_status",
  description:
    "Check which integrations are currently configured and which are missing. " +
    "Returns a clear status for each integration (email, calendar, Telegram, Slack, WhatsApp) " +
    "along with step-by-step instructions for setting up any that are missing. " +
    "Call this at the start of an onboarding conversation to know what to guide the user through.",
  category: "system",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({}),
  async call(_input, ctx): Promise<any> {
    const tools = ctx?.config?.tools || {};
    const aiKey = ctx?.config?.apiKeys?.[ctx?.config?.provider || "anthropic"] || "";

    const status: Record<string, { configured: boolean; details: string }> = {};

    // AI Provider
    status.ai_provider = {
      configured: !!aiKey,
      details: aiKey
        ? `✅ AI connected (${ctx?.config?.provider}, model: ${ctx?.config?.model})`
        : "❌ No AI API key — enter it in the setup wizard Step 2",
    };

    // Gmail
    const hasGmail = !!(tools.gmail?.user && tools.gmail?.appPassword);
    status.gmail = {
      configured: hasGmail,
      details: hasGmail
        ? `✅ Gmail connected (${tools.gmail?.user ?? ""})`
        : "❌ Gmail not connected — needed for reading/sending email",
    };

    // Google (Calendar + Sheets)
    const hasGoogle = !!(tools.google?.credentialsJson);
    status.google_workspace = {
      configured: hasGoogle,
      details: hasGoogle
        ? "✅ Google Workspace connected (Calendar, Sheets, Drive)"
        : "❌ Google not connected — needed for Calendar and Sheets",
    };

    // Telegram
    const hasTelegram = !!(tools.telegram?.botToken);
    status.telegram = {
      configured: hasTelegram,
      details: hasTelegram
        ? "✅ Telegram bot connected"
        : "❌ Telegram not connected — needed for mobile access",
    };

    // Slack
    const hasSlack = !!(tools.slack?.botToken);
    status.slack = {
      configured: hasSlack,
      details: hasSlack
        ? "✅ Slack connected"
        : "❌ Slack not connected",
    };

    // WhatsApp
    const hasWA = !!(tools.whatsapp?.config?.serverUrl || tools.whatsapp?.config?.accountSid);
    status.whatsapp = {
      configured: hasWA,
      details: hasWA
        ? "✅ WhatsApp connected"
        : "❌ WhatsApp not connected",
    };

    // Voice
    const hasVoice = !!(ctx?.config?.whisperApiKey);
    status.voice_transcription = {
      configured: hasVoice,
      details: hasVoice
        ? `✅ Voice transcription ready (${ctx?.config?.whisperProvider || "openai"})`
        : "❌ Voice transcription not configured — get a free Groq key at console.groq.com/keys",
    };

    const configured   = Object.values(status).filter((s) => s.configured).length;
    const total        = Object.keys(status).length;
    const missingNames = Object.entries(status)
      .filter(([, s]) => !s.configured)
      .map(([k]) => k.replace(/_/g, " "));

    // Build setup guides for missing integrations
    const guides: Record<string, any> = {};
    for (const [key, guide] of Object.entries(INTEGRATION_GUIDES)) {
      const isConfigured = status[key]?.configured ?? status[`${key}_workspace`]?.configured ?? false;
      if (!isConfigured) {
        guides[key] = {
          name:   guide.name,
          emoji:  guide.emoji,
          fields: guide.requiredFields.map((f) => ({
            key:    f.key,
            label:  f.label,
            example: f.example,
            howTo:  f.howTo,
          })),
          testTip: guide.testTip,
        };
      }
    }

    return {
      success: true,
      data: {
        summary: `${configured}/${total} integrations configured`,
        missing: missingNames,
        status,
        setupGuides: guides,
        nextStep:
          missingNames.length === 0
            ? "All integrations are connected! Ask me to read emails, check your calendar, or handle any task."
            : `Start with the most useful for you. Recommended order: Gmail → Google Calendar → Telegram (mobile access).`,
      },
    };
  },
});

// ---------------------------------------------------------------------------
// save_integration_credentials
// ---------------------------------------------------------------------------

export const saveIntegrationCredentialsTool = buildTool({
  name: "save_integration_credentials",
  description:
    "Save credentials for an integration to the agent's configuration file. " +
    "Use this AFTER the user provides their credentials during onboarding. " +
    "Supported integrations: gmail, google, telegram, slack, whatsapp_waha. " +
    "After saving, immediately test the connection using the relevant read tool (read_emails, list_events, etc.).",
  category: "system",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    integration: z
      .enum(["gmail", "google", "telegram", "slack", "whatsapp_waha"])
      .describe("Which integration to configure"),
    credentials: z
      .record(z.string())
      .describe(
        "Key-value pairs of credentials. " +
        "gmail: {gmailUser, gmailPass} | " +
        "google: {googleSaKey} | " +
        "telegram: {telegramToken} | " +
        "slack: {slackToken} | " +
        "whatsapp_waha: {wahaUrl, wahaKey?}"
      ),
  }),
  async call(input, ctx): Promise<any> {
    try {
      const cfg = await readConfig();

      // Ensure top-level sections exist
      if (!cfg.credentials) cfg.credentials = {};
      if (!cfg.tools)       cfg.tools = {};

      switch (input.integration) {
        case "gmail": {
          const { gmailUser, gmailPass } = input.credentials;
          if (!gmailUser || !gmailPass) {
            return { success: false, error: "Both gmailUser and gmailPass are required." };
          }
          cfg.credentials.gmailUser = gmailUser;
          cfg.credentials.gmailPass = gmailPass;
          cfg.tools.gmail = { user: gmailUser, appPassword: gmailPass, emailAddress: gmailUser };
          // Also update running context
          if (ctx?.config?.tools) {
            ctx.config.tools.gmail = { user: gmailUser, appPassword: gmailPass, emailAddress: gmailUser };
          }
          // Set env vars so email tools pick them up immediately
          process.env.GMAIL_USER         = gmailUser;
          process.env.GMAIL_APP_PASSWORD = gmailPass;
          break;
        }

        case "google": {
          const { googleSaKey } = input.credentials;
          if (!googleSaKey) return { success: false, error: "googleSaKey (JSON string) is required." };
          // Validate it's valid JSON
          try { JSON.parse(googleSaKey); } catch {
            return { success: false, error: "That doesn't look like valid JSON. Please paste the full service account key JSON." };
          }
          cfg.credentials.googleSaKey = googleSaKey;
          cfg.tools.google = {
            credentialsJson: googleSaKey,
            scopes: [
              "https://www.googleapis.com/auth/calendar",
              "https://www.googleapis.com/auth/gmail.modify",
              "https://www.googleapis.com/auth/spreadsheets",
              "https://www.googleapis.com/auth/drive",
            ],
          };
          if (ctx?.config?.tools) {
            ctx.config.tools.google = cfg.tools.google;
          }
          process.env.GOOGLE_SERVICE_ACCOUNT_KEY = googleSaKey;
          break;
        }

        case "telegram": {
          const { telegramToken } = input.credentials;
          if (!telegramToken) return { success: false, error: "telegramToken is required." };
          cfg.credentials.telegramToken = telegramToken;
          cfg.tools.telegram = { botToken: telegramToken };
          if (ctx?.config?.tools) {
            ctx.config.tools.telegram = { botToken: telegramToken };
          }
          // Also update the top-level token in context config
          if (ctx?.config) {
            (ctx.config as any).telegramToken = telegramToken;
          }
          process.env.TELEGRAM_BOT_TOKEN = telegramToken;
          break;
        }

        case "slack": {
          const { slackToken } = input.credentials;
          if (!slackToken) return { success: false, error: "slackToken is required." };
          cfg.credentials.slackToken = slackToken;
          cfg.tools.slack = { botToken: slackToken };
          if (ctx?.config?.tools) {
            ctx.config.tools.slack = { botToken: slackToken };
          }
          process.env.SLACK_BOT_TOKEN = slackToken;
          break;
        }

        case "whatsapp_waha": {
          const { wahaUrl, wahaKey } = input.credentials;
          if (!wahaUrl) return { success: false, error: "wahaUrl is required." };
          cfg.credentials.wahaUrl = wahaUrl;
          if (wahaKey) cfg.credentials.wahaKey = wahaKey;
          cfg.tools.whatsapp = {
            provider: "waha",
            config: { serverUrl: wahaUrl, apiKey: wahaKey || "" },
          };
          if (ctx?.config?.tools) {
            ctx.config.tools.whatsapp = cfg.tools.whatsapp;
          }
          process.env.WAHA_SERVER_URL = wahaUrl;
          if (wahaKey) process.env.WAHA_API_KEY = wahaKey;
          break;
        }
      }

      await writeConfig(cfg);

      const guide = INTEGRATION_GUIDES[input.integration];
      return {
        success: true,
        data: {
          integration: guide?.name ?? input.integration,
          message:     `✅ Credentials saved for ${guide?.name ?? input.integration}.`,
          nextStep:    guide?.testTip ?? "Now test the connection using the relevant tool.",
          savedFields: Object.keys(input.credentials),
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to save credentials: ${err}` };
    }
  },
});
