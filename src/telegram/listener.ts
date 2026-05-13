// =============================================================================
// Telegram Listener — Two-way communication via long-polling
//
// Runs a background getUpdates loop so users can message the bot and get
// real AI responses back, just like chatting with Claude in the terminal.
//
// Each chat_id gets its own isolated AgentContext so conversation history
// is preserved per-user and chats don't bleed into each other.
// =============================================================================

import { randomUUID } from "crypto";
import chalk from "chalk";
import type { AgentContext } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { agentLoop } from "../agent/loop.js";
import { transcribeAudioBuffer, mimeFromFilename, resolveWhisperConfig, WHISPER_NO_KEY_MSG } from "../voice/transcriber.js";

const TELEGRAM_API = "https://api.telegram.org/bot";
const LONG_POLL_TIMEOUT = 30;   // seconds — Telegram's recommended value
const RETRY_DELAY_MS = 5_000;   // wait 5s on network errors before re-polling
const MAX_MSG_LEN = 4000;       // Telegram hard limit is 4096; stay under it

// Per-chat conversation contexts (keyed by chat_id)
interface ChatSession {
  context: AgentContext;
  lastActive: number;
}
const chatContexts = new Map<number, ChatSession>();

// Prune inactive sessions (older than 2 hours) every 30 minutes
const pruneInterval = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of chatContexts) {
    if (session.lastActive < cutoff) {
      chatContexts.delete(id);
    }
  }
}, 30 * 60 * 1000);
if (pruneInterval.unref) pruneInterval.unref();

// Per-chat lock — prevents overlapping responses if messages arrive fast
const processingChats = new Set<number>();

let running = false;
let updateOffset = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get (or lazily create) an isolated context for a specific Telegram chat. */
function getOrCreateChatContext(chatId: number, baseCtx: AgentContext): AgentContext {
  if (!chatContexts.has(chatId)) {
    chatContexts.set(chatId, {
      context: {
        ...baseCtx,
        sessionId: `tg-${chatId}-${randomUUID().slice(0, 6)}`,
        turnCount: 0,
        messages: [],    // fresh conversation history per chat
        taskQueue: [],
      },
      lastActive: Date.now()
    });
  }
  const session = chatContexts.get(chatId)!;
  session.lastActive = Date.now();
  return session.context;
}

/** Send "typing…" indicator so users know the agent is working. */
async function sendTyping(token: string, chatId: number): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });
  } catch {
    // Non-critical — ignore errors
  }
}

/**
 * Send a reply, splitting into chunks if the response exceeds 4000 chars.
 * Tries Markdown first; falls back to plain text if Telegram rejects the parse.
 */
async function sendReply(token: string, chatId: number, text: string): Promise<void> {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_MSG_LEN) {
    chunks.push(text.slice(i, i + MAX_MSG_LEN));
  }

  for (const chunk of chunks) {
    // Try Markdown first
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      }),
    });

    const data = await res.json() as any;

    // If Markdown parsing fails, retry without parse_mode
    if (!data.ok && data.error_code === 400) {
      await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      });
    }
  }
}

/**
 * Download a voice/audio file from Telegram's file servers.
 * Returns the raw buffer and the filename (with extension).
 */
async function downloadTelegramFile(
  token: string,
  fileId: string
): Promise<{ buffer: Buffer; filename: string }> {
  // Step 1: resolve file_id → file_path
  const meta = await fetch(`${TELEGRAM_API}${token}/getFile?file_id=${fileId}`);
  const metaData = await meta.json() as any;
  if (!metaData.ok) throw new Error(`getFile failed: ${metaData.description}`);

  const filePath: string = metaData.result.file_path; // e.g. "voice/file_xxx.oga"

  // Step 2: download raw bytes
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileRes.ok) throw new Error(`File download failed (HTTP ${fileRes.status})`);

  const arrayBuf = await fileRes.arrayBuffer();
  const filename  = filePath.split("/").pop() ?? "voice.oga";
  return { buffer: Buffer.from(arrayBuf), filename };
}

/** Send a user-visible error message back to the chat. */
async function sendError(token: string, chatId: number): Promise<void> {
  await sendReply(
    token,
    chatId,
    "⚠️ Sorry, I ran into an error processing your request. Please try again in a moment."
  );
}

// ---------------------------------------------------------------------------
// Message handler — runs in background per incoming message
// ---------------------------------------------------------------------------

async function handleMessage(
  token: string,
  chatId: number,
  fromName: string,
  text: string,
  baseCtx: AgentContext,
  registry: ToolRegistry,
  isVoice = false
): Promise<void> {
  // Skip if this chat is already mid-response (avoids racing context writes)
  if (processingChats.has(chatId)) {
    await sendReply(token, chatId, "⏳ Still working on your previous message — hold on!");
    return;
  }

  processingChats.add(chatId);

  try {
    // Let the user know we're thinking
    await sendTyping(token, chatId);

    const chatCtx = getOrCreateChatContext(chatId, baseCtx);

    // For voice messages, prefix the transcript so the agent knows the source
    const agentInput = isVoice ? `🎙️ [Voice message from ${fromName}]: "${text}"` : text;

    // Collect the full streamed response
    let response = "";
    for await (const ev of agentLoop(agentInput, chatCtx, registry)) {
      if (ev.type === "text_delta") {
        response += ev.text;
      }
      // Re-send typing action every ~4s so indicator stays visible on long tasks
      if (ev.type === "tool_start") {
        await sendTyping(token, chatId);
      }
      // Surface API / model errors directly in the chat so users know what happened
      if (ev.type === "error" && !response.includes("⚠️")) {
        response += `\n\n⚠️ ${ev.error}`;
      }
    }

    const reply = response.trim();
    if (reply) {
      await sendReply(token, chatId, reply);
    }
  } catch (err) {
    console.error(chalk.red(`  [Telegram] Error handling message from chat ${chatId}:`), err);
    await sendError(token, chatId);
  } finally {
    processingChats.delete(chatId);
  }
}

// ---------------------------------------------------------------------------
// Main listener loop
// ---------------------------------------------------------------------------

/**
 * Start the Telegram long-polling listener.
 *
 * Call this once after the agent is initialized. It runs indefinitely in the
 * background — control returns to the caller immediately because each poll
 * cycle is awaited inside an async loop that doesn't block the event loop
 * between polls.
 *
 * Each incoming message is dispatched to handleMessage() in a non-blocking
 * IIFE so the poll loop stays responsive even during slow AI responses.
 */
export async function startTelegramListener(
  baseContext: AgentContext,
  registry: ToolRegistry
): Promise<void> {
  const token = baseContext.config.tools?.telegram?.botToken;
  if (!token) return;  // Telegram not configured — silently skip

  // Verify the token works before entering the loop
  try {
    const check = await fetch(`${TELEGRAM_API}${token}/getMe`);
    const info = await check.json() as any;
    if (!info.ok) {
      console.error(chalk.red(`  [Telegram] Invalid bot token — listener NOT started (${info.description})`));
      return;
    }
    console.log(chalk.cyan(`  [Telegram] Listener started → @${info.result.username} is online and waiting for messages`));
  } catch (err) {
    console.error(chalk.red("  [Telegram] Could not verify bot token — listener NOT started:", err));
    return;
  }

  running = true;

  // Run the loop without awaiting it — caller continues while we poll in bg
  (async () => {
    while (running) {
      try {
        const params = new URLSearchParams({
          timeout: String(LONG_POLL_TIMEOUT),
          offset:  String(updateOffset),
          allowed_updates: JSON.stringify(["message"]),
        });

        const res = await fetch(`${TELEGRAM_API}${token}/getUpdates?${params}`, {
          signal: AbortSignal.timeout((LONG_POLL_TIMEOUT + 5) * 1_000),
        });

        if (!res.ok) {
          console.warn(chalk.yellow(`  [Telegram] Poll returned HTTP ${res.status} — retrying in ${RETRY_DELAY_MS / 1000}s`));
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }

        const data = await res.json() as any;
        if (!data.ok || !Array.isArray(data.result) || data.result.length === 0) continue;

        for (const update of data.result) {
          // ACK this update immediately so we never re-process it
          updateOffset = update.update_id + 1;

          const msg = update.message;
          if (!msg) continue;

          const chatId: number   = msg.chat.id;
          const fromName: string = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "User";

          // ── /reset — clear history only ──────────────────────────────────
          if (msg.text === "/reset") {
            clearChatContext(chatId);
            await sendReply(token, chatId, "✅ Conversation cleared! Send me any task or ask me to /start setup again.");
            continue;
          }

          // ── /start — clear history AND trigger guided onboarding ─────────
          if (msg.text === "/start") {
            clearChatContext(chatId);
            handleMessage(
              token, chatId, fromName,
              "Hello! I just started. Please check my setup status and guide me through connecting any integrations that aren't configured yet. Start with the most important one.",
              baseContext, registry
            ).catch((err) => {
              console.error(chalk.red(`  [Telegram] Onboarding error for chat ${chatId}:`, err));
            });
            continue;
          }

          // ── Text message ────────────────────────────────────────────────
          if (msg.text) {
            const text = msg.text as string;
            console.log(chalk.gray(`  [Telegram] ${fromName} (${chatId}): ${text.slice(0, 100)}${text.length > 100 ? "…" : ""}`));
            handleMessage(token, chatId, fromName, text, baseContext, registry).catch((err) => {
              console.error(chalk.red(`  [Telegram] Unhandled error for chat ${chatId}:`, err));
            });
            continue;
          }

          // ── Voice note or audio file ─────────────────────────────────────
          const audioObj = msg.voice ?? msg.audio;
          if (audioObj?.file_id) {
            const whisperCfg = resolveWhisperConfig(baseContext.config);
            console.log(chalk.gray(`  [Telegram] ${fromName} (${chatId}): [voice/audio message]`));

            // Transcribe asynchronously — show typing, do download+transcribe, then reply
            (async () => {
              await sendTyping(token, chatId);
              try {
                if (!whisperCfg) {
                  await sendReply(token, chatId, WHISPER_NO_KEY_MSG);
                  return;
                }

                // Let user know transcription is in progress
                await sendReply(token, chatId, "🎙️ Transcribing your voice message…");

                const { buffer, filename } = await downloadTelegramFile(token, audioObj.file_id);
                const mimeType = mimeFromFilename(filename);
                const transcript = await transcribeAudioBuffer(buffer, mimeType, filename, whisperCfg);

                if (!transcript) {
                  await sendReply(token, chatId, "⚠️ No speech detected in the recording. Please try again.");
                  return;
                }

                console.log(chalk.gray(`  [Telegram] ${fromName} (${chatId}) transcript: ${transcript.slice(0, 100)}${transcript.length > 100 ? "…" : ""}`));

                // Run agent with the transcript (isVoice = true adds the prefix)
                await handleMessage(token, chatId, fromName, transcript, baseContext, registry, true);

              } catch (err) {
                console.error(chalk.red(`  [Telegram] Voice transcription failed for chat ${chatId}:`, err));
                await sendReply(token, chatId, "⚠️ Sorry, I couldn't transcribe that voice message. Please try again or send a text message.");
              }
            })();
            continue;
          }

          // ── Unsupported message type (photo, sticker, etc.) ─────────────
          // Silently ignore — don't confuse users with "I don't support this" on every sticker
        }
      } catch (err: any) {
        if (!running) break;  // normal shutdown
        // AbortError = poll timeout expired naturally, just re-poll
        if (err?.name !== "AbortError" && err?.name !== "TimeoutError") {
          console.error(chalk.red("  [Telegram] Poll error:", err));
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }

    console.log(chalk.gray("  [Telegram] Listener stopped."));
  })();
}

/** Stop the polling loop (called on agent shutdown). */
export function stopTelegramListener(): void {
  running = false;
}

/** Clear conversation history for a specific chat (useful for /reset commands). */
export function clearChatContext(chatId: number): void {
  chatContexts.delete(chatId);
}

/** Return how many active chat sessions exist. */
export function activeChatCount(): number {
  return chatContexts.size;
}
