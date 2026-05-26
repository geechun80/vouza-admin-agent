// =============================================================================
// Telegram Pipeline — detect → validate → test → save → confirm → live-test
//
// Save step is idempotent: writing the same token to config.json twice
// produces the same file content. live-test is a no-op (returns ok with note)
// when no chat_id is configured yet — common at first-time setup.
//
// HTTP is injected via TelegramDeps so tests can mock without touching network.
// =============================================================================

import type { Pipeline, Step, OrchestratorContext, StepResult } from "../types.js";

const TELEGRAM_TOKEN_RE = /^\d{7,12}:[A-Za-z0-9_-]{35,}$/;

export interface TelegramInput {
  /** Raw credentials blob from the LLM. */
  credentials: Record<string, unknown>;
  /** Optional chat id for live-test. If absent, live-test no-ops. */
  chatId?: string | number;
}

export interface TelegramDeps {
  /** HTTP fetcher — defaults to global fetch. Tests inject a mock. */
  fetch?: typeof fetch;
  /** Persist token to durable config. Defaults to a no-op (tests inject). */
  saveToken?: (token: string) => Promise<void>;
  /** Send a real message during live-test. Default no-op. */
  sendMessage?: (token: string, chatId: string | number, text: string) => Promise<void>;
}

export function makeTelegramPipeline(deps: TelegramDeps = {}): Pipeline {
  const httpFetch = deps.fetch ?? globalThis.fetch;

  const detect: Step = {
    name: "detect",
    async run(input: TelegramInput): Promise<StepResult<{ token: string }>> {
      const creds = input?.credentials ?? {};
      if (!creds || Object.keys(creds).length === 0) {
        return {
          ok: false,
          error: "No credentials provided.",
          suggestedFix: "Send the bot token from @BotFather.",
          doNotRetry: true,
        };
      }
      const raw = creds.telegramToken ?? creds.token ?? creds.botToken;
      if (typeof raw !== "string" || !raw.trim()) {
        return {
          ok: false,
          error: "Telegram token missing from credentials.",
          suggestedFix:
            "Pass credentials.telegramToken as a string (the token from @BotFather).",
          doNotRetry: true,
        };
      }
      return { ok: true, value: { token: raw.trim() } };
    },
  };

  const validate: Step = {
    name: "validate",
    async run(input: any): Promise<StepResult<{ token: string }>> {
      const token = input?.token as string;
      if (!TELEGRAM_TOKEN_RE.test(token)) {
        return {
          ok: false,
          error:
            "Telegram bot token format is invalid (expected something like 123456789:ABCdefGhIJKlmNoPQRstuVWXyz).",
          suggestedFix:
            "Open @BotFather → /mybots → pick your bot → API Token → copy and paste the full token.",
          doNotRetry: true,
        };
      }
      return { ok: true, value: { token } };
    },
  };

  const test: Step = {
    name: "test",
    async run(input: any): Promise<StepResult<{ botUsername: string }>> {
      const token = input?.token as string;
      try {
        const res = await httpFetch(`https://api.telegram.org/bot${token}/getMe`);
        const status = res.status;
        const body: any = await res.json().catch(() => ({}));

        if (status === 401 || body?.error_code === 401) {
          return {
            ok: false,
            error: "Telegram rejected the token (401 Unauthorized).",
            suggestedFix:
              "The bot token is wrong or revoked. Generate a new one with @BotFather → /token.",
            doNotRetry: true,
          };
        }
        if (status === 404 || body?.error_code === 404) {
          return {
            ok: false,
            error: "Telegram returned 404 — the bot doesn't exist.",
            suggestedFix:
              "There's likely a typo in the token. Copy it again from @BotFather.",
            doNotRetry: true,
          };
        }
        if (!body?.ok || !body?.result?.is_bot) {
          return {
            ok: false,
            error: `Telegram getMe returned an unexpected response: ${JSON.stringify(body).slice(0, 200)}`,
            suggestedFix: "Verify the token is for a bot (not a user account).",
            doNotRetry: true,
          };
        }
        return {
          ok: true,
          value: { botUsername: String(body.result.username ?? "") },
        };
      } catch (e) {
        return {
          ok: false,
          error: `Network error calling Telegram getMe: ${String((e as any)?.message ?? e)}`,
          suggestedFix: "Check your internet connection and try again.",
        };
      }
    },
  };

  const save: Step = {
    name: "save",
    async run(input: any, ctx: OrchestratorContext): Promise<StepResult<{ saved: true }>> {
      const token = input?.token as string;
      try {
        if (deps.saveToken) await deps.saveToken(token);
        if (ctx.config) {
          ctx.config.tools = ctx.config.tools ?? {};
          ctx.config.tools.telegram = { botToken: token };
        }
        return { ok: true, value: { saved: true } };
      } catch (e) {
        return {
          ok: false,
          error: `Failed to save Telegram token: ${String((e as any)?.message ?? e)}`,
          suggestedFix:
            "The config file could not be written. Check disk permissions on data/config.json.",
        };
      }
    },
  };

  const confirm: Step = {
    name: "confirm",
    async run(input: any): Promise<StepResult<{ confirmed: true }>> {
      // Marks the integration as connected. Side effects (UI badge updates)
      // are emitted by the chat layer when it sees this PipelineResult.
      return {
        ok: true,
        value: { confirmed: true },
        note: `Telegram bot @${input?.botUsername ?? "(unknown)"} is connected.`,
      };
    },
  };

  const liveTest: Step = {
    name: "live-test",
    async run(input: any): Promise<StepResult<{ liveTested: boolean; note?: string }>> {
      const token = input?.token as string;
      const chatId = input?.chatId;
      if (!chatId) {
        // No chat_id yet — first-time setup. Not an error.
        return {
          ok: true,
          value: {
            liveTested: false,
            note:
              "No chat_id configured yet — open the bot in Telegram and send /start to activate live messaging.",
          },
        };
      }
      try {
        if (deps.sendMessage) {
          await deps.sendMessage(token, chatId, "[Vouza] Connection verified");
        }
        return { ok: true, value: { liveTested: true } };
      } catch (e) {
        return {
          ok: false,
          error: `Live-test message failed: ${String((e as any)?.message ?? e)}`,
          suggestedFix:
            "The bot is connected but couldn't send a test message — make sure you've sent /start to the bot first.",
        };
      }
    },
  };

  return {
    id: "telegram",
    inputShape: "{ credentials: { telegramToken: string }, chatId?: string|number }",
    steps: [detect, validate, test, save, confirm, liveTest],
  };
}

/** Default pipeline using global fetch. */
export const telegramPipeline = makeTelegramPipeline();
