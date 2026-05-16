// =============================================================================
// Telegram Listener — Official Bot API, two modes:
//
//   Long-polling  (default, local installs)
//     The agent calls getUpdates every 30s. No public URL needed.
//
//   Webhook mode  (cloud deploys — Fly.io, Railway, etc.)
//     Telegram pushes updates to POST /api/telegram/webhook.
//     Requires a public HTTPS URL set as tools.telegram.webhookUrl in config.
//     Saves server resources — no idle HTTP connections kept open.
//
// Features:
//   - Per-chat isolated AgentContext (history doesn't bleed between users)
//   - Live streaming: edits the placeholder message as tokens arrive
//   - Voice transcription via Whisper
//   - /start onboarding, /reset history clear, /help command
//   - Bot command menu registered via setMyCommands on startup
// =============================================================================

import { randomUUID, createHash } from "crypto";
import chalk from "chalk";
import type { AgentContext } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { agentLoop } from "../agent/loop.js";
import {
  transcribeAudioBuffer,
  mimeFromFilename,
  resolveWhisperConfig,
  WHISPER_NO_KEY_MSG,
} from "../voice/transcriber.js";

const TELEGRAM_API      = "https://api.telegram.org/bot";
const LONG_POLL_TIMEOUT = 30;     // seconds — Telegram's recommended value
const RETRY_DELAY_MS    = 5_000;  // wait 5s on network errors before re-polling
const MAX_MSG_LEN       = 4_000;  // Telegram hard limit is 4096; stay under it
const LIVE_EDIT_INTERVAL = 1_500; // ms between live edits (stay under rate limit)

// ---------------------------------------------------------------------------
// Per-chat session state
// ---------------------------------------------------------------------------

interface ChatSession {
  context:    AgentContext;
  lastActive: number;
}
const chatContexts:    Map<number, ChatSession> = new Map();
const processingChats: Set<number>              = new Set();

// Prune sessions idle > 2h every 30 min
const pruneInterval = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of chatContexts) {
    if (session.lastActive < cutoff) chatContexts.delete(id);
  }
}, 30 * 60 * 1000);
if (pruneInterval.unref) pruneInterval.unref();

// ---------------------------------------------------------------------------
// Webhook-mode stored references (set by startTelegramListener)
// ---------------------------------------------------------------------------

let _webhookToken:    string         | null = null;
let _webhookCtx:      AgentContext   | null = null;
let _webhookRegistry: ToolRegistry   | null = null;
let _webhookSecret:   string               = "";

/** Return the webhook secret so server.ts can verify incoming Telegram updates. */
export function getWebhookSecret(): string { return _webhookSecret; }

// Polling-mode running flag + offset
let _polling      = false;
let updateOffset  = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the Telegram listener.
 * Automatically picks webhook vs long-polling based on config.
 */
export async function startTelegramListener(
  baseContext: AgentContext,
  registry:    ToolRegistry
): Promise<void> {
  const token = baseContext.config.tools?.telegram?.botToken;
  if (!token) return; // not configured — silently skip

  // Verify the token
  let botUsername = "";
  try {
    const check = await fetch(`${TELEGRAM_API}${token}/getMe`);
    const info   = await check.json() as any;
    if (!info.ok) {
      console.error(chalk.red(`  [Telegram] Invalid bot token — NOT started (${info.description})`));
      return;
    }
    botUsername = info.result.username;
  } catch (err) {
    console.error(chalk.red("  [Telegram] Could not verify bot token — NOT started:", err));
    return;
  }

  // Register bot command menu (/start, /reset, /help)
  await setMyCommands(token).catch(() => {}); // non-fatal

  const webhookUrl = baseContext.config.tools?.telegram?.webhookUrl?.trim();

  if (webhookUrl) {
    // ── Webhook mode ───────────────────────────────────────────────────────
    const hookEndpoint = `${webhookUrl.replace(/\/$/, "")}/api/telegram/webhook`;
    // Derive a stable secret from the bot token so restarts keep the same value
    _webhookSecret = createHash("sha256").update(token).digest("hex").slice(0, 32);
    const reg = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: hookEndpoint,
        allowed_updates: ["message"],
        drop_pending_updates: true,
        secret_token: _webhookSecret,
      }),
    });
    const regData = await reg.json() as any;
    if (regData.ok) {
      console.log(chalk.cyan(`  [Telegram] Webhook mode → @${botUsername}`));
      console.log(chalk.gray(`             Endpoint: ${hookEndpoint}`));
    } else {
      console.error(chalk.red(`  [Telegram] setWebhook failed: ${regData.description}`));
      console.log(chalk.yellow("  [Telegram] Falling back to long-polling…"));
      // Fall through to polling
    }
    // Store refs for the Express webhook endpoint
    _webhookToken    = token;
    _webhookCtx      = baseContext;
    _webhookRegistry = registry;

    if (regData.ok) return; // webhook registered — no polling needed
  }

  // ── Long-polling mode ────────────────────────────────────────────────────
  // Delete any existing webhook so polling works cleanly
  await fetch(`${TELEGRAM_API}${token}/deleteWebhook`).catch(() => {});

  console.log(chalk.cyan(`  [Telegram] Long-polling → @${botUsername} is live`));
  _polling = true;

  // Run poll loop in background without blocking the caller
  (async () => {
    while (_polling) {
      try {
        const params = new URLSearchParams({
          timeout:         String(LONG_POLL_TIMEOUT),
          offset:          String(updateOffset),
          allowed_updates: JSON.stringify(["message"]),
        });

        const res = await fetch(`${TELEGRAM_API}${token}/getUpdates?${params}`, {
          signal: AbortSignal.timeout((LONG_POLL_TIMEOUT + 5) * 1_000),
        });

        if (!res.ok) {
          console.warn(chalk.yellow(`  [Telegram] Poll HTTP ${res.status} — retrying in 5s`));
          await delay(RETRY_DELAY_MS);
          continue;
        }

        const data = await res.json() as any;
        if (!data.ok || !Array.isArray(data.result) || data.result.length === 0) continue;

        for (const update of data.result) {
          updateOffset = update.update_id + 1; // ACK immediately
          dispatchUpdate(update, token, baseContext, registry).catch((err) => {
            console.error(chalk.red("  [Telegram] Dispatch error:", err));
          });
        }
      } catch (err: any) {
        if (!_polling) break;
        if (err?.name !== "AbortError" && err?.name !== "TimeoutError") {
          console.error(chalk.red("  [Telegram] Poll error:", err));
          await delay(RETRY_DELAY_MS);
        }
      }
    }
    console.log(chalk.gray("  [Telegram] Listener stopped."));
  })();
}

/**
 * Handle a single Telegram update delivered via webhook.
 * Called from POST /api/telegram/webhook in server.ts.
 */
export async function handleTelegramWebhookUpdate(update: any): Promise<void> {
  if (!_webhookToken || !_webhookCtx || !_webhookRegistry) return;
  await dispatchUpdate(update, _webhookToken, _webhookCtx, _webhookRegistry);
}

/** Stop the polling loop on agent shutdown. */
export function stopTelegramListener(): void {
  _polling = false;
}

/** Clear conversation history for a specific chat. */
export function clearChatContext(chatId: number): void {
  chatContexts.delete(chatId);
}

/** How many active chat sessions exist. */
export function activeChatCount(): number {
  return chatContexts.size;
}

// ---------------------------------------------------------------------------
// Update dispatcher (shared by polling + webhook)
// ---------------------------------------------------------------------------

async function dispatchUpdate(
  update:   any,
  token:    string,
  baseCtx:  AgentContext,
  registry: ToolRegistry
): Promise<void> {
  const msg = update.message;
  if (!msg) return;

  const chatId:   number = msg.chat.id;
  const fromName: string = [msg.from?.first_name, msg.from?.last_name]
    .filter(Boolean).join(" ") || "User";

  // ── /reset ────────────────────────────────────────────────────────────────
  if (msg.text === "/reset") {
    clearChatContext(chatId);
    await sendReply(token, chatId,
      "✅ Conversation cleared! Send me a task or type /help to see what I can do.");
    return;
  }

  // ── /start ────────────────────────────────────────────────────────────────
  if (msg.text === "/start") {
    clearChatContext(chatId);
    handleMessage(
      token, chatId, fromName,
      "Hello! I just started. Please check my setup status and guide me through connecting any integrations that aren't configured yet. Start with the most important one.",
      baseCtx, registry
    ).catch((err) => console.error(chalk.red(`  [Telegram] /start error for ${chatId}:`, err)));
    return;
  }

  // ── /help ─────────────────────────────────────────────────────────────────
  if (msg.text === "/help") {
    await sendReply(token, chatId,
      "🤖 *Your AI Admin Agent*\n\n" +
      "Send me any task in plain language — I'll handle emails, calendar, files, and more.\n\n" +
      "Commands:\n" +
      "/start — check setup & run onboarding\n" +
      "/reset — clear conversation history\n" +
      "/help  — show this message\n\n" +
      "You can also send voice messages 🎙️ — I'll transcribe and respond."
    );
    return;
  }

  // ── Text message ──────────────────────────────────────────────────────────
  if (msg.text) {
    console.log(chalk.gray(
      `  [Telegram] ${fromName} (${chatId}): ${(msg.text as string).slice(0, 100)}`
    ));
    handleMessage(token, chatId, fromName, msg.text, baseCtx, registry).catch((err) => {
      console.error(chalk.red(`  [Telegram] Error for chat ${chatId}:`, err));
    });
    return;
  }

  // ── Voice / audio ─────────────────────────────────────────────────────────
  const audioObj = msg.voice ?? msg.audio;
  if (audioObj?.file_id) {
    console.log(chalk.gray(`  [Telegram] ${fromName} (${chatId}): [voice message]`));
    (async () => {
      await sendTyping(token, chatId);
      const whisperCfg = resolveWhisperConfig(baseCtx.config);
      if (!whisperCfg) {
        await sendReply(token, chatId, WHISPER_NO_KEY_MSG);
        return;
      }
      try {
        await sendReply(token, chatId, "🎙️ Transcribing your voice message…");
        const { buffer, filename } = await downloadTelegramFile(token, audioObj.file_id);
        const mimeType  = mimeFromFilename(filename);
        const transcript = await transcribeAudioBuffer(buffer, mimeType, filename, whisperCfg);
        if (!transcript) {
          await sendReply(token, chatId, "⚠️ No speech detected. Please try again.");
          return;
        }
        console.log(chalk.gray(`  [Telegram] ${fromName} transcript: ${transcript.slice(0, 80)}`));
        await handleMessage(token, chatId, fromName, transcript, baseCtx, registry, true);
      } catch (err) {
        console.error(chalk.red(`  [Telegram] Voice failed for ${chatId}:`, err));
        await sendReply(token, chatId, "⚠️ Couldn't transcribe that. Please send a text message.");
      }
    })();
    return;
  }

  // Silently ignore stickers, photos, etc.
}

// ---------------------------------------------------------------------------
// Message handler — with live streaming (editMessageText)
// ---------------------------------------------------------------------------

async function handleMessage(
  token:    string,
  chatId:   number,
  fromName: string,
  text:     string,
  baseCtx:  AgentContext,
  registry: ToolRegistry,
  isVoice   = false
): Promise<void> {
  if (processingChats.has(chatId)) {
    await sendReply(token, chatId, "⏳ Still working on your previous message — hold on!");
    return;
  }
  processingChats.add(chatId);

  try {
    await sendTyping(token, chatId);

    const chatCtx   = getOrCreateChatContext(chatId, baseCtx);
    const agentInput = isVoice
      ? `🎙️ [Voice message from ${fromName}]: "${text}"`
      : `[Message from ${fromName} via Telegram]: ${text}`;

    // Send a placeholder message and grab its message_id for live edits
    const initRes  = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "⏳ Thinking…" }),
    });
    const initData = await initRes.json() as any;
    const liveId: number | null = initData.ok ? initData.result.message_id : null;

    let   fullText   = "";
    let   lastEditMs = 0;
    let   lastTool   = "";

    // Edit the live message — rate-limited to LIVE_EDIT_INTERVAL ms
    const editNow = async (final = false) => {
      if (!liveId) return;
      const now = Date.now();
      if (!final && now - lastEditMs < LIVE_EDIT_INTERVAL) return;
      lastEditMs = now;

      // What to show: response text > active tool > thinking spinner
      const body = fullText.trim()
        || (lastTool ? `🔧 Using ${lastTool}…` : "⏳ Thinking…");
      const display = (body + (final ? "" : " ⏳")).slice(0, 4096);

      // Try Markdown, fall back to plain text
      const mdRes = await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId, message_id: liveId,
          text: display, parse_mode: "Markdown",
        }),
      }).catch(() => null);

      const mdData = await mdRes?.json().catch(() => null) as any;
      if (mdData && !mdData.ok && mdData.error_code === 400) {
        // Markdown parse error — retry plain
        await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, message_id: liveId, text: display }),
        }).catch(() => {});
      }
    };

    // Run the agent loop
    for await (const ev of agentLoop(agentInput, chatCtx, registry)) {
      if (ev.type === "text_delta") {
        fullText += ev.text;
        lastTool  = "";
        await editNow();
      }
      if (ev.type === "tool_start") {
        lastTool = ev.toolName;
        await sendTyping(token, chatId); // keep typing indicator alive during tools
        await editNow();
      }
      if (ev.type === "tool_result") {
        lastTool = "";
      }
      if (ev.type === "error" && !fullText.includes("⚠️")) {
        fullText += `\n\n⚠️ ${ev.error}`;
      }
    }

    // Final edit — complete answer, no spinner
    await editNow(true);

    // Fallback: if we couldn't get a liveId, send a fresh reply
    if (!liveId && fullText.trim()) {
      await sendReply(token, chatId, fullText.trim());
    }

  } catch (err) {
    console.error(chalk.red(`  [Telegram] Error for chat ${chatId}:`, err));
    await sendError(token, chatId);
  } finally {
    processingChats.delete(chatId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrCreateChatContext(chatId: number, baseCtx: AgentContext): AgentContext {
  if (!chatContexts.has(chatId)) {
    chatContexts.set(chatId, {
      context: {
        ...baseCtx,
        sessionId: `tg-${chatId}-${randomUUID().slice(0, 6)}`,
        turnCount: 0,
        messages:  [],
        taskQueue: [],
      },
      lastActive: Date.now(),
    });
  }
  const session = chatContexts.get(chatId)!;
  session.lastActive = Date.now();
  return session.context;
}

async function sendTyping(token: string, chatId: number): Promise<void> {
  await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}

async function sendReply(token: string, chatId: number, text: string): Promise<void> {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_MSG_LEN) chunks.push(text.slice(i, i + MAX_MSG_LEN));

  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: "Markdown" }),
    });
    const data = await res.json() as any;
    // Markdown parse error — retry plain
    if (!data.ok && data.error_code === 400) {
      await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      }).catch(() => {});
    }
  }
}

async function sendError(token: string, chatId: number): Promise<void> {
  await sendReply(token, chatId,
    "⚠️ Sorry, I ran into an error. Please try again in a moment.");
}

async function downloadTelegramFile(
  token:  string,
  fileId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const meta     = await fetch(`${TELEGRAM_API}${token}/getFile?file_id=${fileId}`);
  const metaData = await meta.json() as any;
  if (!metaData.ok) throw new Error(`getFile failed: ${metaData.description}`);

  const filePath: string = metaData.result.file_path;
  const fileRes  = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileRes.ok) throw new Error(`File download failed (HTTP ${fileRes.status})`);

  const filename = filePath.split("/").pop() ?? "voice.oga";
  return { buffer: Buffer.from(await fileRes.arrayBuffer()), filename };
}

/** Register /start /reset /help in the Telegram bot menu. */
async function setMyCommands(token: string): Promise<void> {
  await fetch(`${TELEGRAM_API}${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "Check setup & run guided onboarding" },
        { command: "reset", description: "Clear conversation history" },
        { command: "help",  description: "Show available commands" },
      ],
    }),
  });
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
