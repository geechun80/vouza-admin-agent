// =============================================================================
// WhatsApp WAHA Webhook Listener
//
// WAHA (WhatsApp HTTP API) is a self-hosted server that bridges WhatsApp to
// REST/webhook. When configured to POST events to our server, this module
// handles incoming messages (text and voice) and replies through the AI agent.
//
// Setup for users:
//   1. Run WAHA locally (Docker: ghcr.io/devlikeapro/waha)
//   2. In WAHA dashboard → Webhooks → add URL: http://localhost:3456/api/whatsapp/webhook
//   3. Start the admin agent — it will now respond to WhatsApp messages
//
// Supported message types:
//   chat  — plain text
//   ptt   — push-to-talk voice note (OGG/Opus)
//   audio — audio file attachment
// =============================================================================

import { randomUUID } from "crypto";
import chalk from "chalk";
import type { AgentContext } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { agentLoop } from "../agent/loop.js";
import { transcribeAudioBuffer, mimeFromFilename, resolveWhisperConfig, WHISPER_NO_KEY_MSG } from "../voice/transcriber.js";

const MAX_MSG_LEN = 3800; // WhatsApp practical limit

// Per-chat isolated contexts (keyed by WhatsApp chatId, e.g. "6512345678@c.us")
interface WASession {
  context: AgentContext;
  lastActive: number;
}
const chatSessions = new Map<string, WASession>();

// Per-chat processing lock — prevents overlapping agent calls
const processingChats = new Set<string>();

// Prune sessions idle for > 2 hours, checked every 30 min
const pruneInterval = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of chatSessions) {
    if (s.lastActive < cutoff) chatSessions.delete(id);
  }
}, 30 * 60 * 1000);
if (pruneInterval.unref) pruneInterval.unref();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Handle a single WAHA webhook event.
 * Called from POST /api/whatsapp/webhook in server.ts.
 * Returns immediately — processing happens asynchronously.
 */
export function handleWAHAEvent(
  event: any,
  baseCtx: AgentContext,
  registry: ToolRegistry
): void {
  // WAHA sends many event types; we only care about incoming messages.
  // Event name varies by WAHA version:
  //   older WAHA:  "message"
  //   WAHA v2+:    "message.received"
  //   group msgs:  "message.any"
  const evName = (event.event as string) || "";
  const isMsgEvent =
    evName === "message" ||
    evName === "message.received" ||
    evName === "message.any";
  if (!isMsgEvent) return;

  const payload = event.payload;
  if (!payload || !payload.from) return;
  if (payload.fromMe)           return; // never reply to our own messages

  const chatId:   string = payload.from;      // "6512345678@c.us"
  const fromName: string = payload.notifyName || payload.from.split("@")[0] || "User";
  const msgType:  string = payload.type || "chat";
  const isVoice: boolean = msgType === "ptt" || msgType === "audio";
  const isText:  boolean = msgType === "chat" || msgType === "text";

  // Fire-and-forget — webhook handler returns immediately (WAHA doesn't wait)
  processWAMessage({ chatId, fromName, isVoice, isText, payload, baseCtx, registry }).catch((err) => {
    console.error(chalk.red(`  [WhatsApp] Unhandled error for chat ${chatId}:`, err));
  });
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

interface WAMessageJob {
  chatId:   string;
  fromName: string;
  isVoice:  boolean;
  isText:   boolean;
  payload:  any;
  baseCtx:  AgentContext;
  registry: ToolRegistry;
}

async function processWAMessage(job: WAMessageJob): Promise<void> {
  const { chatId, fromName, isVoice, isText, payload, baseCtx, registry } = job;

  if (processingChats.has(chatId)) {
    // Already processing a message for this chat — send a polite notice
    await sendWAHAText(chatId, "⏳ Still working on your previous message — hang on!", baseCtx);
    return;
  }

  processingChats.add(chatId);

  try {
    // ── Resolve the text to send to the agent ──────────────────────────────

    let userText = "";

    if (isVoice) {
      userText = await handleVoiceMessage(chatId, fromName, payload, baseCtx);
    } else if (isText) {
      userText = (payload.body as string | undefined)?.trim() || "";
    }

    if (!userText) return;

    // ── /reset command ─────────────────────────────────────────────────────
    if (userText === "/reset" || userText === "/start") {
      chatSessions.delete(chatId);
      await sendWAHAText(chatId, "✅ Conversation reset! Starting fresh — how can I help you?", baseCtx);
      return;
    }

    console.log(chalk.gray(`  [WhatsApp] ${fromName} (${chatId}): ${userText.slice(0, 100)}${userText.length > 100 ? "…" : ""}`));

    // ── Run agent ──────────────────────────────────────────────────────────
    const session = getOrCreateSession(chatId, baseCtx);
    let response  = "";

    // Frame as external input to reduce prompt injection risk
    const framedInput = isVoice
      ? userText  // voice already framed by handleVoiceMessage
      : `[Message from ${fromName} via WhatsApp]: ${userText}`;

    for await (const ev of agentLoop(framedInput, session.context, registry)) {
      if (ev.type === "text_delta") response += ev.text;
      // Surface API / model errors so WhatsApp users know what happened
      if (ev.type === "error" && !response.includes("⚠️")) {
        response += `\n\n⚠️ ${ev.error}`;
      }
    }

    const reply = response.trim();
    if (reply) await sendWAHAText(chatId, reply, baseCtx);

  } catch (err) {
    console.error(chalk.red(`  [WhatsApp] Processing error for chat ${chatId}:`, err));
    await sendWAHAText(chatId, "⚠️ Sorry, I ran into an error. Please try again in a moment.", baseCtx);
  } finally {
    processingChats.delete(chatId);
  }
}

// ---------------------------------------------------------------------------
// Voice message handling
// ---------------------------------------------------------------------------

async function handleVoiceMessage(
  chatId: string,
  fromName: string,
  payload: any,
  baseCtx: AgentContext
): Promise<string> {
  const whisperCfg = resolveWhisperConfig(baseCtx.config);

  if (!whisperCfg) {
    await sendWAHAText(chatId, WHISPER_NO_KEY_MSG, baseCtx);
    return "";
  }

  // Notify user that we're transcribing
  await sendWAHAText(chatId, "🎙️ Transcribing your voice message…", baseCtx);

  try {
    const audioBuffer = await downloadWAHAAudio(payload, baseCtx);
    if (!audioBuffer) {
      await sendWAHAText(chatId, "⚠️ Could not download the voice message. Please try again.", baseCtx);
      return "";
    }

    // Determine filename from URL or fallback to .oga (WhatsApp's default format)
    const url = (payload.mediaUrl as string | undefined) ?? "";
    const filename = url.split("/").pop()?.split("?")[0] || "voice.oga";
    const mimeType = mimeFromFilename(filename);

    const transcript = await transcribeAudioBuffer(audioBuffer, mimeType, filename, whisperCfg!);

    if (!transcript) {
      await sendWAHAText(chatId, "⚠️ No speech detected in the recording. Please try again.", baseCtx);
      return "";
    }

    console.log(chalk.gray(`  [WhatsApp] ${fromName} (${chatId}) transcript: ${transcript.slice(0, 100)}${transcript.length > 100 ? "…" : ""}`));

    // Return transcript prefixed so agent knows it was spoken
    return `🎙️ [Voice message from ${fromName}]: "${transcript}"`;

  } catch (err) {
    console.error(chalk.red(`  [WhatsApp] Voice transcription failed for ${chatId}:`, err));
    await sendWAHAText(chatId, "⚠️ Sorry, I couldn't transcribe that voice message. Please try sending a text instead.", baseCtx);
    return "";
  }
}

/** Download the audio buffer from a WAHA media URL. */
async function downloadWAHAAudio(
  payload: any,
  baseCtx: AgentContext
): Promise<Buffer | null> {
  const waConfig = baseCtx.config.tools?.whatsapp?.config ?? {};
  // Support both wizard DOM IDs (wahaKey) and canonical names (apiKey)
  const apiKey = (
    (waConfig.wahaKey as string | undefined) ||
    (waConfig.apiKey  as string | undefined)
  );

  // WAHA puts the absolute download URL directly in the payload
  const mediaUrl = payload.mediaUrl as string | undefined;
  if (!mediaUrl) return null;

  const headers: Record<string, string> = {};
  if (apiKey) headers["X-Api-Key"] = apiKey;

  const res = await fetch(mediaUrl, { headers });
  if (!res.ok) throw new Error(`WAHA media download failed (HTTP ${res.status})`);

  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// WAHA send helper
// ---------------------------------------------------------------------------

async function sendWAHAText(
  chatId:  string,
  text:    string,
  baseCtx: AgentContext
): Promise<void> {
  const waConfig = baseCtx.config.tools?.whatsapp?.config ?? {};

  // Support both wizard DOM field IDs (wahaUrl / wahaKey / wahaSession)
  // and the canonical runtime names (serverUrl / apiKey / sessionName).
  const serverUrl = (
    (waConfig.wahaUrl      as string | undefined) ||
    (waConfig.serverUrl    as string | undefined) ||
    "http://localhost:3000"
  ).replace(/\/$/, ""); // strip trailing slash
  const apiKey = (
    (waConfig.wahaKey  as string | undefined) ||
    (waConfig.apiKey   as string | undefined)
  );
  const session = (
    (waConfig.wahaSession  as string | undefined) ||
    (waConfig.sessionName  as string | undefined) ||
    "default"
  );

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;

  // Split long responses into chunks
  for (let i = 0; i < text.length; i += MAX_MSG_LEN) {
    const chunk = text.slice(i, i + MAX_MSG_LEN);
    try {
      // WAHA v2+ format: POST /api/{session}/sendText  (preferred)
      let res = await fetch(`${serverUrl}/api/${session}/sendText`, {
        method: "POST",
        headers,
        body: JSON.stringify({ chatId, text: chunk }),
      });

      // Fallback to old WAHA format: POST /api/sendText with session in body
      if (!res.ok) {
        res = await fetch(`${serverUrl}/api/sendText`, {
          method: "POST",
          headers,
          body: JSON.stringify({ session, chatId, text: chunk }),
        });
      }

      if (!res.ok) {
        console.error(chalk.red(`  [WhatsApp] WAHA send returned HTTP ${res.status} for ${chatId}`));
      }
    } catch (err) {
      console.error(chalk.red(`  [WhatsApp] Failed to send message to ${chatId}:`, err));
    }
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

function getOrCreateSession(chatId: string, baseCtx: AgentContext): WASession {
  if (!chatSessions.has(chatId)) {
    chatSessions.set(chatId, {
      context: {
        ...baseCtx,
        sessionId: `wa-${randomUUID().slice(0, 8)}`,
        turnCount: 0,
        messages:  [],
        taskQueue: [],
      },
      lastActive: Date.now(),
    });
  }
  const session = chatSessions.get(chatId)!;
  session.lastActive = Date.now();
  return session;
}

/** How many active WhatsApp chat sessions are open. */
export function activeWASessionCount(): number {
  return chatSessions.size;
}
