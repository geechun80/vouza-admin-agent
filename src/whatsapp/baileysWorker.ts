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
  /**
   * Allowlist of WhatsApp JIDs (or phone numbers) that are permitted to
   * trigger the agent. If empty, the agent responds to NO ONE except the
   * owner (Aerick himself, identified by sock.user?.id).
   *
   * Accepted formats:
   *   - Full JID: "6596862398@s.whatsapp.net"
   *   - Phone number: "6596862398" or "+6596862398" (auto-normalized)
   *
   * SECURITY: Baileys links to the user's PERSONAL WhatsApp account, so
   * every inbound message flows through our agent. Without an allowlist
   * the agent would auto-reply to every friend who texts the user — a
   * massive privacy + reputation disaster.
   */
  allowedSenders?: string[];
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
      // Include the linked account's JID so the manager can target proactive
      // scheduled messages at the owner ("message yourself" thread).
      ipc({ type: "status", status: "connected", ownerJid: getOwnerJid() });
    }

    if (connection === "close") {
      _connected = false;
      activeSock = null;

      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;

      // Categorize the disconnect — different reasons require different
      // recovery strategies. Without this, "connectionReplaced" (same phone
      // re-scans) caused an infinite restart loop that effectively crashed
      // the worker. Reported by Aerick (2026-05-26).
      switch (code) {

        case DisconnectReason.loggedOut: {
          // User explicitly unlinked from their phone, OR WhatsApp invalidated
          // the device (e.g. 4-device limit, suspicious activity). Cannot
          // recover by reconnecting — user must scan a fresh QR. Exit 0 so
          // the parent manager does NOT auto-restart.
          _reconnecting = false;
          log("info", "Logged out by user / WhatsApp — clean exit (no auto-restart)");
          ipc({ type: "status", status: "logged_out" });
          process.exit(0);
          return;
        }

        case DisconnectReason.connectionReplaced: {
          // The SAME phone scanned a new QR somewhere else (another Baileys
          // session, WhatsApp Web in a browser, another agent instance).
          // WhatsApp invalidated this connection in favor of the new one.
          // Reconnecting would loop forever with the same "replaced" error.
          // Clean exit — user must explicitly re-link via the dashboard if
          // they want this instance to take over again.
          _reconnecting = false;
          log("warn", "Connection replaced — another session linked the same number. Clean exit.");
          ipc({ type: "status", status: "logged_out" });
          process.exit(0);
          return;
        }

        case DisconnectReason.badSession: {
          // Auth files corrupted or out of sync with WhatsApp servers.
          // Reconnecting with the same auth would fail the same way every
          // time. Exit non-zero so the parent manager wipes the auth dir
          // (via its existing crash-recovery path) before respawning.
          _reconnecting = false;
          log("error", "Bad session — auth files appear corrupt. Exit 1 to trigger parent recovery.");
          ipc({ type: "status", status: "logged_out" });  // requires fresh QR
          process.exit(1);
          return;
        }

        case DisconnectReason.restartRequired: {
          // Baileys requires a fresh connection (typically right after the
          // first QR scan completes). Brief delay then reconnect — auth
          // files are valid and reconnection should succeed quickly.
          log("info", "WhatsApp requested a restart (normal after first QR) — reconnecting in 2s");
          ipc({ type: "status", status: "connecting" });
          setTimeout(() => connect().catch((err) => log("error", `restart-reconnect failed: ${err}`)), 2_000);
          return;
        }

        case DisconnectReason.timedOut:
        case DisconnectReason.connectionLost:
        case DisconnectReason.connectionClosed: {
          // Transient network failures — reconnect with backoff. Don't
          // re-init auth, just re-establish the WebSocket.
          if (_reconnecting) {
            log("info", `Transient close (code ${code}) — reconnecting in 5s`);
            ipc({ type: "status", status: "disconnected" });
            setTimeout(() => connect().catch((err) => log("error", `transient-reconnect failed: ${err}`)), 5_000);
          } else {
            ipc({ type: "status", status: "disconnected" });
          }
          return;
        }

        default: {
          // Unknown disconnect code — treat conservatively. If we were
          // already trying to reconnect, attempt once more; otherwise just
          // report disconnected and let the parent decide.
          log("warn", `Unrecognized disconnect code ${code} — defaulting to single reconnect attempt`);
          if (_reconnecting) {
            ipc({ type: "status", status: "disconnected" });
            setTimeout(() => connect().catch((err) => log("error", `unknown-code-reconnect failed: ${err}`)), 5_000);
          } else {
            ipc({ type: "status", status: "disconnected" });
          }
          return;
        }
      }
    }
  });

  _reconnecting = true;

  // ── Owner JID detection ──────────────────────────────────────────────────
  // The "owner" is the WhatsApp account this Baileys client is linked to —
  // i.e., Aerick himself. We use this to (1) auto-permit Aerick's own
  // messages-to-self and (2) prevent the agent from auto-replying to his
  // friends. sock.user is populated once the connection establishes.
  const getOwnerJid = (): string | null => {
    const raw = sock.user?.id;
    if (!raw) return null;
    // sock.user.id often comes back as "6596862398:43@s.whatsapp.net" —
    // strip the ":43" device suffix so it matches msg.key.remoteJid format
    return raw.replace(/:\d+@/, "@");
  };

  // ── Allowlist enforcement ────────────────────────────────────────────────
  // SAFETY-CRITICAL: this is what stops the agent from auto-replying to
  // every friend who texts the user. By default the allowlist is empty,
  // and the ONLY sender automatically permitted is the owner themselves
  // (Aerick texting his own number, e.g. via "Message yourself" in WhatsApp).
  //
  // Normalize JIDs: accept "6596862398", "+6596862398", or full JIDs.
  const normalizeJid = (s: string): string => {
    const digitsOnly = s.replace(/[^\d]/g, "");
    if (!digitsOnly) return s;
    return `${digitsOnly}@s.whatsapp.net`;
  };
  const allowedJids = new Set<string>(
    (_config?.allowedSenders ?? []).map(normalizeJid)
  );

  const isAllowed = (jid: string): boolean => {
    const owner = getOwnerJid();
    // Owner is always allowed — Aerick must always be able to talk to his own agent
    if (owner && jid === owner) return true;
    return allowedJids.has(jid);
  };

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

      // ── SAFETY GATE: allowlist enforcement ──────────────────────────────
      // If the sender isn't on the allowlist (and isn't the owner), DROP
      // the message silently. We don't even send a "permission denied"
      // reply because that would (a) confirm to spammers that the number
      // is active and (b) confuse innocent friends who don't know an agent
      // is running.
      if (!isAllowed(chatId)) {
        log("info", `[allowlist] dropped message from ${fromName} (${chatId}) — not on allowlist`);
        continue;
      }

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
