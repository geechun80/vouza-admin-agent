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
//   { type: "start";         config: WorkerConfig }
//   { type: "send_reply";    chatId: string; text: string; keepTyping?: boolean }
//   { type: "configure";     settings: Partial<WorkerConfig> }   // mode / owner / start word / allowlist
//   { type: "send_document"; reqId: string; chatId: string; filePath: string;
//                            fileName: string; mimeType: string; caption?: string }
//   { type: "stop" }
//
// Worker → Parent:
//   { type: "qr";            data: string }
//   { type: "status";        status: BaileysStatus; ownerJid?: string; ownerName?: string }
//   { type: "incoming_text"; chatId: string; fromName: string; text: string; isVoice: boolean; isOwner: boolean }
//   { type: "send_result";   reqId: string; ok: boolean; error?: string }
//   { type: "reset_command"; chatId: string }
//   { type: "log";           level: "info"|"warn"|"error"; message: string }
// =============================================================================

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  generateMessageIDV2,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom }     from "@hapi/boom";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { transcribeAudioBuffer } from "../voice/transcriber.js";
import type { WhisperConfig } from "../voice/transcriber.js";
import {
  classifyIncoming,
  ownerIdsFromUser,
  phoneToJid,
  isLidJid,
  isPhoneJid,
  stripDevice,
  SentIdSet,
  type OwnerTarget,
  type WhatsAppMode,
} from "./selfChat.js";
import { matchWakeWord } from "./wakeWord.js";
import { useEncryptedFileAuthState } from "./encryptedAuthState.js";

// ---------------------------------------------------------------------------
// Worker config (received from parent via IPC)
// ---------------------------------------------------------------------------

interface WorkerConfig {
  authDir:         string;
  /** Master key (hex) — the login files are stored encrypted. Absent → legacy plain files. */
  authKey?:        string;
  maxChunk:        number;
  whisperKey?:     string;
  whisperBaseUrl?: string;
  whisperModel?:   string;
  whisperProvider?: "openai" | "groq";
  /**
   * Allowlist of WhatsApp JIDs (or phone numbers) that are permitted to
   * trigger the agent. If empty, the agent responds to NO ONE except the
   * owner (identified by sock.user?.id).
   *
   * Accepted formats:
   *   - Full JID: "6591234567@s.whatsapp.net"
   *   - Phone number: "6591234567" or "+6591234567" (auto-normalized)
   *
   * SECURITY: Baileys links to the user's PERSONAL WhatsApp account, so
   * every inbound message flows through our agent. Without an allowlist
   * the agent would auto-reply to every friend who texts the user — a
   * massive privacy + reputation disaster.
   */
  allowedSenders?: string[];
  /**
   * "assistant": linked to the assistant's own number; the owner messages it
   * from ownerNumber, like a Telegram bot. "personal": linked to the owner's
   * own WhatsApp; only "Message yourself" messages starting with wakeWord.
   */
  mode?:        WhatsAppMode;
  ownerNumber?: string;
  wakeWord?:    string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let activeSock:    WASocket | null = null;
let _connected     = false;
let _reconnecting  = false;
let _config:       WorkerConfig | null = null;

// Ids of messages this worker sent. In the owner's self-chat our own replies
// would otherwise look exactly like the owner typing (both are fromMe).
const sentIds = new SentIdSet();

// Who may talk to the agent — rebuilt by applySettings() at start and
// whenever the dashboard changes the WhatsApp settings ("configure").
let allowedJids = new Set<string>();
let target: OwnerTarget = { mode: "personal" };

function applySettings(cfg: WorkerConfig): void {
  allowedJids = new Set(
    (cfg.allowedSenders ?? []).map((s) => phoneToJid(s)).filter((j): j is string => !!j),
  );
  const mode: WhatsAppMode = cfg.mode === "assistant" ? "assistant" : "personal";
  const ownerPn = mode === "assistant" ? phoneToJid(cfg.ownerNumber) : null;
  target = { mode, ownerPn, ownerLid: null };
  if (activeSock && _connected) void resolveOwnerLid(activeSock);
}

/**
 * Assistant mode: ask WhatsApp's own mapping for the owner's LID, so a
 * message that arrives addressed only by LID can still be recognised. Never
 * derived from digits — no mapping means LID-only messages aren't matched.
 */
async function resolveOwnerLid(sock: WASocket): Promise<void> {
  if (target.mode !== "assistant" || !target.ownerPn) return;
  try {
    const lid = await (sock as any).signalRepository?.lidMapping?.getLIDForPN?.(target.ownerPn);
    if (typeof lid === "string" && isLidJid(lid)) target = { ...target, ownerLid: stripDevice(lid) };
  } catch (err) {
    log("info", `Owner LID lookup skipped: ${err}`);
  }
}

/** A message addressed only by LID: fill in its real phone number from WhatsApp's mapping when known. */
async function withPhoneNumber(sock: WASocket, key: any): Promise<any> {
  const jid = key?.remoteJid;
  if (!isLidJid(jid) || isPhoneJid(key?.remoteJidAlt)) return key;
  try {
    const pn = await (sock as any).signalRepository?.lidMapping?.getPNForLID?.(stripDevice(jid));
    if (typeof pn === "string" && isPhoneJid(stripDevice(pn))) return { ...key, remoteJidAlt: stripDevice(pn) };
  } catch { /* unresolved stays unresolved */ }
  return key;
}

// ── "typing…" while the assistant works (Telegram shows the same) ──────────
const typingTimers = new Map<string, { every: ReturnType<typeof setInterval>; stop: ReturnType<typeof setTimeout> }>();

function startTyping(chatId: string): void {
  stopTyping(chatId, false);
  const ping = () => activeSock?.sendPresenceUpdate("composing", chatId).catch(() => {});
  ping();
  // WhatsApp clears "typing…" after ~25 s, so repeat; give up after 5 minutes.
  const every = setInterval(ping, 10_000);
  const stop = setTimeout(() => stopTyping(chatId), 5 * 60_000);
  typingTimers.set(chatId, { every, stop });
}

function stopTyping(chatId: string, sendPaused = true): void {
  const t = typingTimers.get(chatId);
  if (t) { clearInterval(t.every); clearTimeout(t.stop); typingTimers.delete(chatId); }
  if (sendPaused && t) activeSock?.sendPresenceUpdate("paused", chatId).catch(() => {});
}

// ── One-time tip about the start word (personal mode) ──────────────────────
// Persisted next to the login folder so it is said once, not after every restart.
function wakeTipFile(): string | null {
  return _config?.authDir ? join(dirname(_config.authDir), "whatsapp-start-word-tip.json") : null;
}

async function maybeSendWakeTip(sock: WASocket, chatId: string, word: string): Promise<void> {
  const file = wakeTipFile();
  if (!file || existsSync(file)) return;
  try {
    await writeFile(file, JSON.stringify({ sentAt: new Date().toISOString() }), "utf-8");
    await sendTracked(sock, chatId, {
      text:
        `💡 Your notes in this chat stay private: I only react to messages that start with “${word}”.\n` +
        `For example: “${word}, find my insurance policy”.\n\n` +
        "(I'll only say this once.)",
    });
  } catch (err) {
    log("warn", `Start-word tip not sent: ${err}`);
  }
}

/**
 * Every outgoing message goes through here. The id is generated and recorded
 * BEFORE sending, so the echo guard cannot lose a race with the network.
 */
async function sendTracked(sock: WASocket, chatId: string, content: any): Promise<void> {
  const messageId = generateMessageIDV2(sock.user?.id);
  sentIds.add(messageId);
  await sock.sendMessage(chatId, content, { messageId });
}

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
      applySettings(_config);
      connect().catch((err) => {
        log("error", `connect() failed: ${err}`);
        process.exit(1);
      });
      break;

    case "configure":
      // Dashboard changed the WhatsApp settings — apply without reconnecting.
      if (_config && msg.settings && typeof msg.settings === "object") {
        _config = { ..._config, ...(msg.settings as Partial<WorkerConfig>) };
        applySettings(_config);
        log("info", `Settings updated (mode: ${target.mode})`);
      }
      break;

    case "send_reply":
      // keepTyping: a "still working" note — the real answer is still coming.
      if (!msg.keepTyping) stopTyping(msg.chatId as string);
      sendToChat(msg.chatId as string, msg.text as string).catch((err) => {
        log("warn", `send_reply failed for ${msg.chatId}: ${err}`);
      });
      break;

    case "send_document":
      // The parent already checked the path against the workspace + folder
      // grants. The parent waits on send_result, so always answer.
      stopTyping(msg.chatId as string);
      sendDocument(msg).then(
        () => ipc({ type: "send_result", reqId: msg.reqId, ok: true }),
        (err) => ipc({ type: "send_result", reqId: msg.reqId, ok: false, error: String(err?.message ?? err) }),
      );
      break;

    case "stop":
      _reconnecting = false;
      activeSock?.end(undefined);
      activeSock = null;
      _connected = false;
      process.exit(0);
      break;

    case "logout": {
      // Unlink this device from the WhatsApp account, so it disappears from
      // the phone's "Linked devices" — not just forget the login here.
      _reconnecting = false;
      const sock = activeSock;
      const done = () => { activeSock = null; _connected = false; process.exit(0); };
      if (!sock || !_connected) { sock?.end(undefined); done(); break; }
      Promise.race([sock.logout(), new Promise((r) => setTimeout(r, 5_000))])
        .catch((err) => log("warn", `logout failed: ${err}`))
        .finally(done);
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Connect to WhatsApp
// ---------------------------------------------------------------------------

async function connect(): Promise<void> {
  if (!_config) return;

  await mkdir(_config.authDir, { recursive: true });

  const { version }         = await fetchLatestBaileysVersion();
  // The login files can impersonate the linked account — keep them encrypted.
  const { state, saveCreds } = _config.authKey
    ? await useEncryptedFileAuthState(_config.authDir, Buffer.from(_config.authKey, "hex"))
    : await useMultiFileAuthState(_config.authDir);

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
      // scheduled messages at the owner ("message yourself" thread), and the
      // profile name so setup can greet the user without asking for it.
      ipc({ type: "status", status: "connected", ownerJid: getOwnerJid(), ownerName: sock.user?.name || undefined });
      void resolveOwnerLid(sock);
    }

    if (connection === "close") {
      _connected = false;
      activeSock = null;

      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;

      // Categorize the disconnect — different reasons require different
      // recovery strategies. Without this, "connectionReplaced" (same phone
      // re-scans) caused an infinite restart loop that effectively crashed
      // the worker. Reported by a beta tester (2026-05-26).
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
  // i.e., the owner. We use this to (1) auto-permit the owner's own
  // messages-to-self and (2) prevent the agent from auto-replying to his
  // friends. sock.user is populated once the connection establishes.
  const getOwnerJid = (): string | null => {
    const raw = sock.user?.id;
    if (!raw) return null;
    // sock.user.id often comes back as "6591234567:43@s.whatsapp.net" —
    // strip the ":43" device suffix so it matches msg.key.remoteJid format
    return raw.replace(/:\d+@/, "@");
  };

  // ── Who may talk to the agent ────────────────────────────────────────────
  // SAFETY-CRITICAL: the allowlist + owner target live in applySettings().
  // By default nobody but the owner is served (see selfChat.ts).

  // ── Incoming messages ──────────────────────────────────────────────────────
  // 'notify' = delivered live. 'append' covers history sync and our own
  // sends, neither of which is an instruction.
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const owner = ownerIdsFromUser(sock.user);

    for (const msg of messages) {
      // ── SAFETY GATE (see selfChat.ts) ───────────────────────────────────
      // Linked account's self-chat → owner. Its chats with friends → never.
      // Assistant mode: the owner's own number → owner. Others → only when
      // their RESOLVED phone number is allowlisted (guests); a raw LID is
      // never matched as if it were a phone number. Dropped silently: a
      // "permission denied" reply would confirm to spammers the number is
      // live and confuse friends who don't know an agent is running.
      const key = await withPhoneNumber(sock, msg.key);
      const decision = classifyIncoming(key, owner, allowedJids, sentIds, target);
      if (!decision.accept) {
        if (decision.reason === "not_allowed" || decision.reason === "lid_unresolved") {
          // No names or numbers of the owner's contacts in the log.
          log("info", `[allowlist] ignored a message from someone not on the allowed list (${decision.reason})`);
        }
        continue;
      }

      const chatId   = decision.chatId;
      const fromName = decision.isOwner
        ? (decision.isSelfChat ? (sock.user?.name || msg.pushName || "Owner") : (msg.pushName || "Owner"))
        : (msg.pushName || (decision.senderPn ?? chatId).split("@")[0] || "User");

      let textBody = msg.message?.conversation ??
                     msg.message?.extendedTextMessage?.text ?? "";
      const isVoice  = !!(msg.message?.audioMessage);

      if (!textBody && !isVoice) continue;

      // Personal mode: "Message yourself" is also the owner's notes chat —
      // only messages that start with the start word are instructions.
      // Voice notes there are never sent for transcription.
      if (target.mode === "personal" && decision.isSelfChat) {
        const word = _config?.wakeWord ?? "";
        if (isVoice) continue;
        const m = matchWakeWord(textBody, word);
        if (!m.matched) {
          if (word) void maybeSendWakeTip(sock, chatId, word);
          continue;
        }
        textBody = m.rest || "Hi";
      }

      // /reset and /start — handled locally; tell parent to clear session state
      if (textBody === "/reset" || textBody === "/start") {
        ipc({ type: "reset_command", chatId });
        await sendTracked(sock, chatId, {
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

      // isOwner: the linked account's self-chat, or (assistant mode) the
      // owner's own number; allow-listed people are guests (guestMode.ts).
      startTyping(chatId);
      ipc({ type: "incoming_text", chatId, fromName, text: userText, isVoice, isOwner: decision.isOwner === true });
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
    await sendTracked(sock, chatId, {
      text: "🎙️ Voice transcription requires a Whisper API key.\nConfigure it in the setup wizard → Voice Transcription card.",
    }).catch(() => {});
    return "";
  }

  await sendTracked(sock, chatId, { text: "🎙️ Transcribing your voice message…" }).catch(() => {});

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
      await sendTracked(sock, chatId, { text: "⚠️ Could not download voice message. Please try again." }).catch(() => {});
      return "";
    }

    const transcript = await transcribeAudioBuffer(buffer, "audio/ogg", "voice.ogg", whisperCfg);

    if (!transcript) {
      await sendTracked(sock, chatId, { text: "⚠️ No speech detected. Please try again." }).catch(() => {});
      return "";
    }

    log("info", `${fromName} (${chatId.split("@")[0]}) transcript: ${transcript.slice(0, 80)}`);
    return `🎙️ [Voice message from ${fromName}]: "${transcript}"`;

  } catch (err) {
    log("error", `Voice transcription failed for ${chatId}: ${err}`);
    await sendTracked(sock, chatId, {
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
    await sendTracked(activeSock, chatId, { text: text.slice(i, i + MAX_CHUNK) });
  }
}

/**
 * Send a file as a WhatsApp document. Always a document (never a compressed
 * photo), so the person gets the original file with its real name.
 */
async function sendDocument(msg: {
  chatId: string; filePath: string; fileName: string; mimeType: string; caption?: string;
}): Promise<void> {
  const sock = activeSock;
  if (!sock || !_connected) throw new Error("WhatsApp is not connected right now.");
  const buffer = await readFile(msg.filePath);
  await sendTracked(sock, msg.chatId, {
    document: buffer,
    mimetype: msg.mimeType,
    fileName: msg.fileName,
    ...(msg.caption ? { caption: msg.caption } : {}),
  });
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
