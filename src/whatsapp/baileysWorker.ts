// =============================================================================
// Baileys WhatsApp Worker — runs as a child_process (Phase 2)
//
// This script owns the WhatsApp Web WS protocol.  All AI work is delegated
// back to the parent process (baileysManager.ts) via IPC so that a Baileys
// crash never takes down the main agent.
//
// IPC Message Protocol
// ────────────────────
// Parent → Worker:
//   { type: "start";       config: WorkerConfig }
//   { type: "send_reply";  chatId: string; text: string }
//   { type: "stop" }
//
// Worker → Parent:
//   { type: "qr";            data: string }
//   { type: "status";        status: BaileysStatus }
//   { type: "incoming_text"; chatId: string; fromName: string; text: string; isVoice: boolean }
//   { type: "reset_command"; chatId: string }
//   { type: "log";           level: "info"|"warn"|"error"; message: string }
// =============================================================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  downloadMediaMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom }     from "@hapi/boom";
import { mkdir }    from "fs/promises";
import { transcribeAudioBuffer } from "../voice/transcriber.js";
import type { WhisperConfig } from "../voice/transcriber.js";

// ---------------------------------------------------------------------------
// Worker config (received from parent via IPC)
// ---------------------------------------------------------------------------

interface WorkerConfig {
  authDir:         string;
  maxChunk:        number;
  whisperKey?:     string;
  whisperBaseUrl?: string;
  whisperModel?:   string;
  whisperProvider?: "openai" | "groq";
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let activeSock:    WASocket | null = null;
let _connected     = false;
let _reconnecting  = false;
let _config:       WorkerConfig | null = null;

// ---------------------------------------------------------------------------
// IPC helpers
// ---------------------------------------------------------------------------

function ipc(msg: object): void {
  if (process.send) process.send(msg);
}

function log(level: "info" | "warn" | "error", message: string): void {
  ipc({ type: "log", level, message });
}

// ---------------------------------------------------------------------------
// Listen for messages from parent
// ---------------------------------------------------------------------------

process.on("message", (msg: any) => {
  if (!msg || typeof msg !== "object") return;

  switch (msg.type) {
    case "start":
      _config = msg.config as WorkerConfig;
      connect().catch((err) => {
        log("error", `connect() failed: ${err}`);
        process.exit(1);
      });
      break;

    case "send_reply":
      sendToChat(msg.chatId as string, msg.text as string).catch((err) => {
        log("warn", `send_reply failed for ${msg.chatId}: ${err}`);
      });
      break;

    case "stop":
      _reconnecting = false;
      activeSock?.end(undefined);
      activeSock = null;
      _connected = false;
      process.exit(0);
      break;
  }
});

// ---------------------------------------------------------------------------
// Connect to WhatsApp
// ---------------------------------------------------------------------------

async function connect(): Promise<void> {
  if (!_config) return;

  await mkdir(_config.authDir, { recursive: true });

  const { version }         = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(_config.authDir);

  ipc({ type: "status", status: "connecting" });

  const silentLogger = {
    level: "silent",
    trace: () => {}, debug: () => {}, info: () => {},
    warn:  () => {}, error: () => {}, fatal: () => {},
    child: () => silentLogger,
  } as any;

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,  // QR goes via IPC instead
    generateHighQualityLinkPreview: false,
    logger: silentLogger,
  });

  activeSock = sock;

  sock.ev.on("creds.update", saveCreds);

  // ── Connection events ──────────────────────────────────────────────────────
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      ipc({ type: "status", status: "qr_ready" });
      ipc({ type: "qr", data: qr });
    }

    if (connection === "open") {
      _connected    = true;
      _reconnecting = false;
      ipc({ type: "status", status: "connected" });
    }

    if (connection === "close") {
      _connected = false;
      activeSock = null;

      const code      = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;

      if (loggedOut) {
        _reconnecting = false;
        ipc({ type: "status", status: "logged_out" });
        process.exit(0); // parent will NOT restart on clean exit
      } else if (_reconnecting) {
        ipc({ type: "status", status: "disconnected" });
        setTimeout(() => connect(), 5_000);
      } else {
        ipc({ type: "status", status: "disconnected" });
      }
    }
  });

  _reconnecting = true;

  // ── Incoming messages ──────────────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe)                              continue;
      if (!msg.key.remoteJid)                          continue;
      if (isJidBroadcast(msg.key.remoteJid))           continue;
      if (msg.key.remoteJid.endsWith("@g.us"))         continue; // no group chats

      const chatId   = msg.key.remoteJid;
      const fromName = msg.pushName || chatId.split("@")[0] || "User";

      const textBody = msg.message?.conversation ??
                       msg.message?.extendedTextMessage?.text ?? "";
      const isVoice  = !!(msg.message?.audioMessage);

      if (!textBody && !isVoice) continue;

      // /reset and /start — handled locally; tell parent to clear session state
      if (textBody === "/reset" || textBody === "/start") {
        ipc({ type: "reset_command", chatId });
        await sock.sendMessage(chatId, {
          text: "✅ Conversation reset! Starting fresh — how can I help you?",
        }).catch(() => {});
        continue;
      }

      // Voice transcription happens here so we don't ship raw audio buffers over IPC
      let userText = textBody;
      if (isVoice) {
        userText = await handleVoiceMessage(chatId, fromName, msg, sock);
        if (!userText) continue;
      }

      ipc({ type: "incoming_text", chatId, fromName, text: userText, isVoice });
    }
  });
}

// ---------------------------------------------------------------------------
// Voice transcription — runs in the worker to avoid IPC binary transfer
// ---------------------------------------------------------------------------

async function handleVoiceMessage(
  chatId:   string,
  fromName: string,
  msg:      any,
  sock:     WASocket
): Promise<string> {
  const whisperCfg = buildWhisperConfig();

  if (!whisperCfg) {
    await sock.sendMessage(chatId, {
      text: "🎙️ Voice transcription requires a Whisper API key.\nConfigure it in the setup wizard → Voice Transcription card.",
    }).catch(() => {});
    return "";
  }

  await sock.sendMessage(chatId, { text: "🎙️ Transcribing your voice message…" }).catch(() => {});

  try {
    const silentLogger = {
      level: "silent",
      trace: () => {}, debug: () => {}, info: () => {},
      warn:  () => {}, error: () => {}, fatal: () => {},
      child: () => silentLogger,
    } as any;

    const buffer = await downloadMediaMessage(
      msg, "buffer", {},
      { reuploadRequest: sock.updateMediaMessage, logger: silentLogger }
    ) as Buffer;

    if (!buffer || buffer.length === 0) {
      await sock.sendMessage(chatId, { text: "⚠️ Could not download voice message. Please try again." }).catch(() => {});
      return "";
    }

    const transcript = await transcribeAudioBuffer(buffer, "audio/ogg", "voice.ogg", whisperCfg);

    if (!transcript) {
      await sock.sendMessage(chatId, { text: "⚠️ No speech detected. Please try again." }).catch(() => {});
      return "";
    }

    log("info", `${fromName} (${chatId.split("@")[0]}) transcript: ${transcript.slice(0, 80)}`);
    return `🎙️ [Voice message from ${fromName}]: "${transcript}"`;

  } catch (err) {
    log("error", `Voice transcription failed for ${chatId}: ${err}`);
    await sock.sendMessage(chatId, {
      text: "⚠️ Sorry, couldn't transcribe that. Please send a text message instead.",
    }).catch(() => {});
    return "";
  }
}

function buildWhisperConfig(): WhisperConfig | null {
  if (!_config?.whisperKey) return null;
  return {
    apiKey:   _config.whisperKey,
    baseUrl:  _config.whisperBaseUrl  ?? "https://api.openai.com/v1",
    model:    _config.whisperModel    ?? "whisper-1",
    provider: _config.whisperProvider ?? "openai",
  };
}

// ---------------------------------------------------------------------------
// Send reply to WhatsApp
// ---------------------------------------------------------------------------

async function sendToChat(chatId: string, text: string): Promise<void> {
  if (!activeSock || !_connected) {
    log("warn", `Cannot send to ${chatId} — not connected`);
    return;
  }
  const MAX_CHUNK = _config?.maxChunk ?? 3800;
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    await activeSock.sendMessage(chatId, { text: text.slice(i, i + MAX_CHUNK) });
  }
}

// ---------------------------------------------------------------------------
// Global error handlers — tell parent before dying so it can restart us
// ---------------------------------------------------------------------------

process.on("uncaughtException", (err) => {
  log("error", `Uncaught exception: ${err}`);
  process.exit(1); // non-zero → parent supervisor will restart
});

process.on("unhandledRejection", (reason) => {
  log("error", `Unhandled rejection: ${reason}`);
  // don't exit — Baileys has minor unhandled rejections on disconnect events
});
