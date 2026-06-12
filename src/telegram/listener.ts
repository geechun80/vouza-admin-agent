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
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import chalk from "chalk";
import type { AgentContext } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { agentLoop } from "../agent/loop.js";
import { ChannelQueues } from "../agent/queue.js";
import {
  transcribeAudioBuffer,
  mimeFromFilename,
  resolveWhisperConfig,
  WHISPER_NO_KEY_MSG,
} from "../voice/transcriber.js";

const TELEGRAM_API       = "https://api.telegram.org/bot";
const LONG_POLL_TIMEOUT  = 30;     // seconds — Telegram's recommended value
const RETRY_DELAY_MS     = 5_000;  // wait 5s on network errors before re-polling
const MAX_MSG_LEN        = 4_000;  // Telegram hard limit is 4096; stay under it
const LIVE_EDIT_INTERVAL = 1_500;  // ms between live edits (stay under rate limit)
// Hermes-inspired adaptive fast-path: short replies with no tool use skip the
// streaming placeholder entirely — one sendMessage instead of send+edit+edit.
const FAST_PATH_MAX_CHARS = 200;

// ---------------------------------------------------------------------------
// Per-chat session state
// ---------------------------------------------------------------------------

interface ChatSession {
  context:    AgentContext;
  lastActive: number;
}
const chatContexts: Map<number, ChatSession> = new Map();
const chatQueues    = new ChannelQueues();    // Phase 1: queue instead of drop

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

/**
 * Snapshot of the listener's current runtime state. Used by the Integration
 * adapter to report status to the unified registry / dashboard without
 * needing to make any network calls.
 */
export function getTelegramListenerState(): {
  hasToken:    boolean;
  webhookActive: boolean;
  pollingActive: boolean;
  botToken?:    string;
} {
  return {
    hasToken:      !!_webhookToken || !!_webhookCtx || _polling,
    webhookActive: !!_webhookToken,
    pollingActive: _polling,
    botToken:      _webhookToken || undefined,
  };
}

// Polling-mode running flag + offset
let _polling      = false;
let updateOffset  = 0;

// ---------------------------------------------------------------------------
// Owner chat persistence — needed for PROACTIVE sends (briefings/reports).
// A bot cannot initiate a conversation: we can only message a chat that has
// messaged us before. The FIRST chat that ever talks to the bot is recorded
// as the owner (the user who set the bot up) and persisted across restarts.
// First-seen wins — a stranger messaging the bot later never becomes "owner".
// ---------------------------------------------------------------------------

const TELEGRAM_STATE_PATH = join(process.cwd(), "data", "telegram-state.json");
let _ownerChatId: number | null = null;
let _ownerLoaded = false;

async function loadOwnerChatId(): Promise<void> {
  if (_ownerLoaded) return;
  _ownerLoaded = true;
  try {
    const raw = JSON.parse(await readFile(TELEGRAM_STATE_PATH, "utf-8"));
    if (typeof raw?.ownerChatId === "number") _ownerChatId = raw.ownerChatId;
  } catch { /* no state yet */ }
}

async function recordOwnerChat(chatId: number): Promise<void> {
  await loadOwnerChatId();
  if (_ownerChatId !== null) return; // first-seen wins
  _ownerChatId = chatId;
  try {
    await mkdir(join(process.cwd(), "data"), { recursive: true });
    await writeFile(TELEGRAM_STATE_PATH, JSON.stringify({ ownerChatId: chatId }, null, 2), "utf-8");
  } catch { /* persistence is best-effort */ }
}

/** The owner's chat id (first chat that ever messaged the bot), or null. */
export async function getTelegramOwnerChatId(): Promise<number | null> {
  await loadOwnerChatId();
  return _ownerChatId;
}

/**
 * Proactive outbound send (scheduled briefings/reports).
 * Reuses the direct-reply path: Markdown first, plain-text fallback.
 */
export async function sendTelegramProactive(
  token:  string,
  chatId: number,
  text:   string
): Promise<void> {
  await sendDirectReply(token, chatId, text);
}

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
        allowed_updates: ["message", "callback_query"],
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
          allowed_updates: JSON.stringify(["message", "callback_query"]),
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
  // ── callback_query — inline keyboard button tap ───────────────────────────
  // Hermes-inspired: when the agent presents numbered options as inline buttons
  // and the user taps one, route the button label as a regular text message.
  const cbq = update.callback_query;
  if (cbq) {
    const chatId   = cbq.message?.chat?.id as number | undefined;
    const fromName = [cbq.from?.first_name, cbq.from?.last_name]
      .filter(Boolean).join(" ") || "User";
    const data = cbq.data as string | undefined;

    // Acknowledge immediately — dismisses Telegram's button loading spinner
    await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cbq.id }),
    }).catch(() => {});

    if (chatId && data) {
      console.log(chalk.gray(
        `  [Telegram] ${fromName} (${chatId}): [button] ${data.slice(0, 80)}`
      ));
      handleMessage(token, chatId, fromName, data, baseCtx, registry).catch((err) => {
        console.error(chalk.red(`  [Telegram] callback_query error for ${chatId}:`, err));
      });
    }
    return;
  }

  const msg = update.message;
  if (!msg) return;

  const chatId:   number = msg.chat.id;
  // Record the first chat as the owner for proactive scheduled delivery
  recordOwnerChat(chatId).catch(() => {});
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

// ---------------------------------------------------------------------------
// handleMessage — queue gate (Phase 1)
// Enqueues the actual work; returns immediately.
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
  const q      = chatQueues.getOrCreate(String(chatId));
  const result = q.enqueue(
    () => processMessage(token, chatId, fromName, text, baseCtx, registry, isVoice),
    `tg:${chatId}:${text.slice(0, 30)}`
  );

  if (result === "full") {
    await sendReply(token, chatId,
      "⏳ You have too many messages queued — please wait for the current ones to finish.");
  }
}

// ---------------------------------------------------------------------------
// processMessage — actual AI work (serialised by the queue)
// ---------------------------------------------------------------------------

async function processMessage(
  token:    string,
  chatId:   number,
  fromName: string,
  text:     string,
  baseCtx:  AgentContext,
  registry: ToolRegistry,
  isVoice   = false
): Promise<void> {
  try {
    const chatCtx    = getOrCreateChatContext(chatId, baseCtx);
    const agentInput = isVoice
      ? `🎙️ [Voice message from ${fromName}]: "${text}"`
      : `[Message from ${fromName} via Telegram]: ${text}`;

    // ── Hermes-inspired adaptive fast-path ────────────────────────────────
    // We lazily commit to the streaming (placeholder → edit) approach.
    // If the agent responds quickly with a short reply and no tool calls,
    // we skip the placeholder entirely and send one direct message — snappier
    // on mobile, one fewer API round-trip.

    let fullText        = "";
    let lastEditMs      = 0;
    let lastTool        = "";
    let usedTools       = false;      // set true on first tool_start
    let placeholderSent = false;      // true once "⏳ Thinking…" is live
    let liveId: number | null = null;

    // Commit to the streaming path: send the "⏳ Thinking…" placeholder
    // if we haven't already (idempotent).
    const ensurePlaceholder = async () => {
      if (placeholderSent) return;
      placeholderSent = true;
      await sendTyping(token, chatId);
      const initRes  = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "⏳ Thinking…" }),
      });
      const initData = await initRes.json() as any;
      liveId = initData.ok ? initData.result.message_id : null;
    };

    // Edit the live placeholder — rate-limited to LIVE_EDIT_INTERVAL ms.
    // On the final call, also attaches an inline keyboard when the response
    // contains a numbered choice list (Hermes-inspired inline buttons).
    const editNow = async (final = false) => {
      if (!liveId) return;
      const now = Date.now();
      if (!final && now - lastEditMs < LIVE_EDIT_INTERVAL) return;
      lastEditMs = now;

      const body    = fullText.trim() || (lastTool ? `🔧 Using ${lastTool}…` : "⏳ Thinking…");
      const display = (body + (final ? "" : " ⏳")).slice(0, 4096);
      const keyboard = final ? buildInlineKeyboard(fullText) : undefined;

      // Try Markdown, fall back to plain text on parse error
      const mdRes = await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id:      chatId,
          message_id:   liveId,
          text:         display,
          parse_mode:   "Markdown",
          ...(keyboard ? { reply_markup: keyboard } : {}),
        }),
      }).catch(() => null);

      const mdData = await mdRes?.json().catch(() => null) as any;
      if (mdData && !mdData.ok && mdData.error_code === 400) {
        await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id:    chatId,
            message_id: liveId,
            text:       display,
            ...(keyboard ? { reply_markup: keyboard } : {}),
          }),
        }).catch(() => {});
      }
    };

    // ── Agent loop ─────────────────────────────────────────────────────────
    for await (const ev of agentLoop(agentInput, chatCtx, registry)) {
      if (ev.type === "text_delta") {
        fullText += ev.text;
        lastTool  = "";
        // Only stream intermediate edits if we're already in streaming mode
        if (placeholderSent) await editNow();
      }
      if (ev.type === "tool_start") {
        lastTool  = ev.toolName;
        usedTools = true;
        // Commit to streaming — we have tool work to show
        await ensurePlaceholder();
        await sendTyping(token, chatId);
        await editNow();
      }
      if (ev.type === "tool_result") {
        lastTool = "";
      }
      if (ev.type === "error" && !fullText.includes("⚠️")) {
        fullText += `\n\n⚠️ ${ev.error}`;
      }
    }

    const finalText = fullText.trim();

    // ── Fast-path: short reply, no tool use ───────────────────────────────
    // Never sent a placeholder → one direct sendMessage call, done.
    if (!placeholderSent) {
      if (finalText) {
        const keyboard = buildInlineKeyboard(finalText);
        await sendDirectReply(token, chatId, finalText, keyboard);
      }
      return;
    }

    // ── Streaming path: final edit, no spinner ────────────────────────────
    await editNow(true);

    // Fallback: couldn't obtain a message_id earlier
    if (!liveId && finalText) {
      await sendReply(token, chatId, finalText);
    }

  } catch (err) {
    console.error(chalk.red(`  [Telegram] Error for chat ${chatId}:`, err));
    await sendError(token, chatId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect a numbered choice list in the agent's response and build a Telegram
 * inline keyboard so users can tap instead of type "1", "2", etc.
 *
 * Matches lines like:
 *   "1. Yes"  "1) Yes"  "2. No"  "3. Maybe later"
 *
 * Only activates when 2–5 numbered options are found (avoids false positives
 * on numbered lists that aren't actually choices).
 *
 * Hermes-inspired: "show real Telegram buttons instead of asking users to type
 * a number — huge UX win on mobile."
 */
export function buildInlineKeyboard(
  text: string
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } | undefined {
  const lines = text.split("\n");
  const buttons: Array<{ text: string; callback_data: string }> = [];

  for (const line of lines) {
    const m = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (!m) continue;
    const label = m[2].replace(/[*_`[\]]/g, "").trim(); // strip Markdown
    if (!label) continue;
    buttons.push({
      text:          label.slice(0, 64),
      callback_data: label.slice(0, 64),
    });
  }

  // 2–5 sequential options starting from 1 — strong signal it's a choice list
  if (buttons.length < 2 || buttons.length > 5) return undefined;

  // One button per row for readability
  return { inline_keyboard: buttons.map((b) => [b]) };
}

/**
 * Send a single message with optional inline keyboard.
 * Used by the adaptive fast-path for short, tool-free replies.
 */
async function sendDirectReply(
  token:    string,
  chatId:   number,
  text:     string,
  keyboard?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id:    chatId,
    text:       text.slice(0, 4096),
    parse_mode: "Markdown",
    ...(keyboard ? { reply_markup: keyboard } : {}),
  };

  const res  = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;

  // Markdown parse error — retry plain text
  if (!data.ok && data.error_code === 400) {
    const plainBody: Record<string, unknown> = {
      chat_id: chatId,
      text:    text.slice(0, 4096),
      ...(keyboard ? { reply_markup: keyboard } : {}),
    };
    await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plainBody),
    }).catch(() => {});
  }
}

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

/** Queue depth snapshot for the dashboard status endpoint. */
export function getTelegramQueueSnapshot(): Record<string, { depth: number; processing: boolean }> {
  return chatQueues.snapshot();
}
