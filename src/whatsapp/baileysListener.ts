// =============================================================================
// WhatsApp Baileys Listener — Native WhatsApp Web protocol (no Docker/WAHA)
//
// Uses @whiskeysockets/baileys (reverse-engineers the WhatsApp Web WS protocol)
// so the agent acts as a "Linked Device". Users scan a QR code once and the
// connection persists across restarts via saved auth credentials.
//
// Features:
//   - QR code generation streamed to the dashboard via SSE
//   - Per-chat isolated AgentContext (same pattern as Telegram/WAHA)
//   - Voice message transcription via Whisper
//   - Automatic reconnect on connection drop (except manual logout)
//   - /reset and /start commands
// =============================================================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  downloadMediaMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import chalk from "chalk";
import type { AgentContext } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { agentLoop } from "../agent/loop.js";
import { ChannelQueues } from "../agent/queue.js";
import {
  transcribeAudioBuffer,
  resolveWhisperConfig,
  WHISPER_NO_KEY_MSG,
} from "../voice/transcriber.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_DIR  = join(process.cwd(), "data", "whatsapp-auth");
const MAX_CHUNK = 3800; // WhatsApp practical message limit

// ---------------------------------------------------------------------------
// Module-level state (singleton — only one WA session at a time)
// ---------------------------------------------------------------------------

let activeSock: WASocket | null = null;
let _connected = false;
let _reconnecting = false;
let _baseCtx: AgentContext | null = null;
let _registry: ToolRegistry | null = null;

/** Listeners registered by the SSE endpoint */
type QRListener     = (qr: string)    => void;
type StatusListener = (s: BaileysStatus) => void;
export type BaileysStatus = "connecting" | "qr_ready" | "connected" | "disconnected" | "logged_out";

const qrListeners:     Set<QRListener>     = new Set();
const statusListeners: Set<StatusListener> = new Set();

// ---------------------------------------------------------------------------
// Per-chat session state (same isolation pattern as Telegram / WAHA)
// ---------------------------------------------------------------------------

interface ChatSession {
  context:    AgentContext;
  lastActive: number;
}
const chatSessions: Map<string, ChatSession> = new Map();
const chatQueues    = new ChannelQueues();   // Phase 1: queue instead of drop

// Prune idle sessions every 30 min
const pruneTimer = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of chatSessions) {
    if (s.lastActive < cutoff) chatSessions.delete(id);
  }
}, 30 * 60 * 1000);
if (pruneTimer.unref) pruneTimer.unref();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Register a listener for QR code strings (raw Baileys QR data). */
export function onBaileysQR(fn: QRListener): () => void {
  qrListeners.add(fn);
  return () => qrListeners.delete(fn);
}

/** Register a listener for connection status changes. */
export function onBaileysStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/** True once the WhatsApp session is authenticated and online. */
export function isBaileysConnected(): boolean {
  return _connected;
}

/** Send a text message from the agent to a WhatsApp chat. */
export async function sendBaileysMessage(chatId: string, text: string): Promise<void> {
  if (!activeSock || !_connected) {
    throw new Error("WhatsApp (Baileys) is not connected. Scan QR first.");
  }
  // Chunk long replies
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    await activeSock.sendMessage(chatId, { text: text.slice(i, i + MAX_CHUNK) });
  }
}

/** Disconnect and clear session (forces new QR on next start). */
export async function logoutBaileys(): Promise<void> {
  _reconnecting = false;
  activeSock?.logout().catch(() => {});
  activeSock?.end(undefined);
  activeSock = null;
  _connected = false;
}

// ---------------------------------------------------------------------------
// Main listener
// ---------------------------------------------------------------------------

/**
 * Start the Baileys WhatsApp listener. Connects using saved credentials if
 * available, or generates a QR code for first-time pairing.
 *
 * Safe to call multiple times — subsequent calls are no-ops if already running.
 */
export async function startBaileysListener(
  baseCtx:  AgentContext,
  registry: ToolRegistry
): Promise<void> {
  if (activeSock && _connected) return; // already live

  _baseCtx  = baseCtx;
  _registry = registry;

  // Ensure auth directory exists
  await mkdir(AUTH_DIR, { recursive: true });

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  emit("status", "connecting");
  console.log(chalk.cyan("  [WhatsApp] Starting Baileys connection..."));

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,        // also log QR to terminal for manual fallback
    generateHighQualityLinkPreview: false,
    // Suppress verbose pino logging
    logger: {
      level: "silent",
      trace: () => {}, debug: () => {}, info: () => {},
      warn:  () => {}, error: () => {}, fatal: () => {},
      child: () => ({ level:"silent", trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child:()=>({} as any) }),
    } as any,
  });

  activeSock = sock;

  // Persist credentials whenever they change
  sock.ev.on("creds.update", saveCreds);

  // ── Connection state ────────────────────────────────────────────────────
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log(chalk.yellow("  [WhatsApp] QR ready — scan with your phone"));
      emit("status", "qr_ready");
      emit("qr", qr);
    }

    if (connection === "open") {
      _connected = true;
      _reconnecting = false;
      console.log(chalk.green("  [WhatsApp] Connected! Listening for messages..."));
      emit("status", "connected");
    }

    if (connection === "close") {
      _connected = false;
      activeSock = null;

      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      if (loggedOut) {
        console.log(chalk.red("  [WhatsApp] Logged out — delete data/whatsapp-auth and rescan QR."));
        emit("status", "logged_out");
        _reconnecting = false;
      } else if (_reconnecting) {
        // Back-off reconnect
        console.log(chalk.yellow(`  [WhatsApp] Disconnected (code ${code}) — reconnecting in 5s...`));
        emit("status", "disconnected");
        setTimeout(() => {
          if (_baseCtx && _registry) {
            startBaileysListener(_baseCtx, _registry).catch(console.error);
          }
        }, 5_000);
      } else {
        emit("status", "disconnected");
      }
    }
  });

  _reconnecting = true; // enable auto-reconnect

  // ── Incoming messages ───────────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe)                              continue; // ignore outgoing
      if (!msg.key.remoteJid)                          continue;
      if (isJidBroadcast(msg.key.remoteJid))           continue; // ignore broadcasts
      if (msg.key.remoteJid.endsWith("@g.us"))         continue; // ignore group chats

      const chatId   = msg.key.remoteJid;
      const fromName = msg.pushName || chatId.split("@")[0] || "User";

      // Determine message type
      const textBody = msg.message?.conversation ??
                       msg.message?.extendedTextMessage?.text ?? "";
      const isVoice  = !!(msg.message?.audioMessage);
      const isPTT    = !!(msg.message?.senderKeyDistributionMessage) ||
                       (msg.message?.audioMessage?.ptt ?? false);

      if (!textBody && !isVoice) continue; // ignore stickers, images, etc.

      // /reset / /start commands
      if (textBody === "/reset" || textBody === "/start") {
        chatSessions.delete(chatId);
        await sock.sendMessage(chatId, {
          text: "✅ Conversation reset! Starting fresh — how can I help you?",
        });
        continue;
      }

      // Fire-and-forget
      handleMessage({ chatId, fromName, textBody, isVoice, msg, sock }).catch((err) => {
        console.error(chalk.red(`  [WhatsApp] Unhandled error for ${chatId}:`, err));
      });
    }
  });
}

/** Stop the listener (called on agent shutdown). */
export function stopBaileysListener(): void {
  _reconnecting = false;
  activeSock?.end(undefined);
  activeSock = null;
  _connected = false;
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

interface MsgJob {
  chatId:   string;
  fromName: string;
  textBody: string;
  isVoice:  boolean;
  msg:      any;
  sock:     WASocket;
}

// ---------------------------------------------------------------------------
// handleMessage — queue gate (Phase 1)
// Enqueues the actual work; returns immediately.
// ---------------------------------------------------------------------------

async function handleMessage(job: MsgJob): Promise<void> {
  const { chatId, sock } = job;

  if (!_baseCtx || !_registry) return;

  const q      = chatQueues.getOrCreate(chatId);
  const result = q.enqueue(
    () => processMessage(job),
    `wa:${chatId.split("@")[0]}:${(job.isVoice ? "[voice]" : job.textBody).slice(0, 30)}`
  );

  if (result === "full") {
    await sock.sendMessage(chatId, {
      text: "⏳ You have too many messages queued — please wait for the current ones to finish.",
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// processMessage — actual AI work (serialised by the queue)
// ---------------------------------------------------------------------------

async function processMessage(job: MsgJob): Promise<void> {
  const { chatId, fromName, textBody, isVoice, msg, sock } = job;

  if (!_baseCtx || !_registry) return;

  try {
    // Show typing indicator
    await sock.sendPresenceUpdate("composing", chatId);

    let userText = textBody;

    // Handle voice → transcription
    if (isVoice) {
      userText = await handleVoiceMessage(chatId, fromName, msg, sock);
      if (!userText) return;
    }

    console.log(chalk.gray(
      `  [WhatsApp] ${fromName} (${chatId.split("@")[0]}): ${userText.slice(0, 100)}${userText.length > 100 ? "…" : ""}`
    ));

    // Run agent
    const session  = getOrCreateSession(chatId);
    let   response = "";

    // Frame as external input to reduce prompt injection risk
    const framedInput = isVoice
      ? userText  // voice already framed by handleVoiceMessage
      : `[Message from ${fromName} via WhatsApp]: ${userText}`;

    for await (const ev of agentLoop(framedInput, session.context, _registry)) {
      if (ev.type === "text_delta") response += ev.text;
      if (ev.type === "tool_start") {
        // Refresh typing indicator during long tool use
        await sock.sendPresenceUpdate("composing", chatId).catch(() => {});
      }
      if (ev.type === "error" && !response.includes("⚠️")) {
        response += `\n\n⚠️ ${ev.error}`;
      }
    }

    const reply = response.trim();
    if (reply) {
      for (let i = 0; i < reply.length; i += MAX_CHUNK) {
        await sock.sendMessage(chatId, { text: reply.slice(i, i + MAX_CHUNK) });
      }
    }

  } catch (err) {
    console.error(chalk.red(`  [WhatsApp] Processing error for ${chatId}:`, err));
    await sock.sendMessage(chatId, {
      text: "⚠️ Sorry, I ran into an error. Please try again in a moment.",
    }).catch(() => {});
  } finally {
    await sock.sendPresenceUpdate("paused", chatId).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Voice transcription
// ---------------------------------------------------------------------------

async function handleVoiceMessage(
  chatId:   string,
  fromName: string,
  msg:      any,
  sock:     WASocket
): Promise<string> {
  if (!_baseCtx) return "";

  const whisperCfg = resolveWhisperConfig(_baseCtx.config);
  if (!whisperCfg) {
    await sock.sendMessage(chatId, { text: WHISPER_NO_KEY_MSG });
    return "";
  }

  await sock.sendMessage(chatId, { text: "🎙️ Transcribing your voice message…" });

  try {
    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      {
        reuploadRequest: sock.updateMediaMessage,
        logger: { level:"silent", trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child:()=>({} as any) } as any,
      }
    ) as Buffer;

    if (!buffer || buffer.length === 0) {
      await sock.sendMessage(chatId, { text: "⚠️ Could not download voice message. Please try again." });
      return "";
    }

    const audioMsg  = msg.message?.audioMessage;
    const mimeType  = audioMsg?.mimetype || "audio/ogg; codecs=opus";
    const filename  = "voice.ogg";

    const transcript = await transcribeAudioBuffer(buffer, mimeType, filename, whisperCfg);

    if (!transcript) {
      await sock.sendMessage(chatId, { text: "⚠️ No speech detected in the recording. Please try again." });
      return "";
    }

    console.log(chalk.gray(
      `  [WhatsApp] ${fromName} transcript: ${transcript.slice(0, 100)}${transcript.length > 100 ? "…" : ""}`
    ));

    return `🎙️ [Voice message from ${fromName}]: "${transcript}"`;

  } catch (err) {
    console.error(chalk.red(`  [WhatsApp] Voice transcription failed:`, err));
    await sock.sendMessage(chatId, {
      text: "⚠️ Sorry, I couldn't transcribe that voice message. Please send a text message instead.",
    });
    return "";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrCreateSession(chatId: string): ChatSession {
  if (!chatSessions.has(chatId)) {
    chatSessions.set(chatId, {
      context: {
        ..._baseCtx!,
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

function emit(type: "qr", data: string): void;
function emit(type: "status", data: BaileysStatus): void;
function emit(type: string, data: any): void {
  if (type === "qr") {
    for (const fn of qrListeners) fn(data as string);
  } else {
    for (const fn of statusListeners) fn(data as BaileysStatus);
  }
}

/** How many active Baileys chat sessions are open. */
export function activeBaileysSessionCount(): number {
  return chatSessions.size;
}

/** Queue depth snapshot for the dashboard status endpoint. */
export function getBaileysQueueSnapshot(): Record<string, { depth: number; processing: boolean }> {
  return chatQueues.snapshot();
}
