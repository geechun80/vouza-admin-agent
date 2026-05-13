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
  registry: ToolRegistry
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

    // Collect the full streamed response
    let response = "";
    for await (const event of agentLoop(text, chatCtx, registry)) {
      if (event.type === "text_delta") {
        response += event.text;
      }
      // Re-send typing action every ~4s so indicator stays visible on long tasks
      if (event.type === "tool_start") {
        await sendTyping(token, chatId);
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
          offset: String(updateOffset),
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
          if (!msg?.text) continue;  // ignore photos, stickers, etc.

          const chatId: number = msg.chat.id;
          const fromName: string = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "User";
          const text: string = msg.text;

          console.log(chalk.gray(`  [Telegram] ${fromName} (${chatId}): ${text.slice(0, 100)}${text.length > 100 ? "…" : ""}`));

          // Fire-and-forget — don't await so the poll loop stays fast
          handleMessage(token, chatId, fromName, text, baseContext, registry).catch((err) => {
            console.error(chalk.red(`  [Telegram] Unhandled error for chat ${chatId}:`, err));
          });
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
