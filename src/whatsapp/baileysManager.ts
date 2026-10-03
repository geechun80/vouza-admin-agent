// =============================================================================
// Baileys Manager — child-process supervisor (Phase 2)
//
// Forks baileysWorker.js into a separate Node.js process so that a Baileys
// crash or WS storm cannot take down the main agent.
//
// Responsibilities
// ────────────────
//   • Spawn the worker and pass serialisable config via IPC
//   • Auto-restart on unexpected exit with exponential backoff (cap 30 s)
//   • Relay QR / status events to registered listeners (same API as before)
//   • Run agentLoop in the main process when the worker sends "incoming_text"
//   • Send text replies back to the worker via IPC
//   • Maintain per-chat isolated AgentContext (same isolation as before)
//   • FIFO per-chat queue from Phase 1 (ChannelQueues)
//
// Public API  (same surface as the deleted in-process baileysListener.ts —
// this manager is now the ONLY WhatsApp implementation)
// ────────────────────────────────────────────────────────────────────────
//   startBaileysListener(ctx, registry)
//   stopBaileysListener()
//   isBaileysConnected()
//   onBaileysQR(fn) → unsubscribe fn
//   onBaileysStatus(fn) → unsubscribe fn
//   sendBaileysMessage(chatId, text)
//   logoutBaileys()
//   getBaileysQueueSnapshot()
//   activeBaileysSessionCount()
//   type BaileysStatus
// =============================================================================

import { fork, type ChildProcess } from "child_process";
import { fileURLToPath }           from "url";
import { dirname, join }           from "path";
import { randomUUID }              from "crypto";
import { rm }                       from "fs/promises";
import chalk                       from "chalk";
import type { AgentContext }       from "../types/index.js";
import type { ToolRegistry }       from "../tools/registry.js";
import { agentLoop }               from "../agent/loop.js";
import { ChannelQueues }           from "../agent/queue.js";
import { resolveWhisperConfig }    from "../voice/transcriber.js";
import {
  buildPhoneRegistry,
  resolvePendingReply,
  pendingCreatedSince,
  recordExchange,
  confirmPromptFor,
} from "../agent/phoneMode.js";
import { startTurn } from "../agent/webGate.js";
import { buildGuestRegistry, makeGuest } from "../agent/guestMode.js";
import { getMasterKey } from "../security/secretStore.js";
import { withTrigger, recordNet, hostOf } from "../util/netActivity.js";
import type { FileToSend }         from "../tools/sendFile.js";
import { phoneToJid, type WhatsAppMode } from "./selfChat.js";
import { defaultWakeWord, cleanWakeWord } from "./wakeWord.js";

/** How the assistant is on WhatsApp — see selfChat.ts for the two modes. */
export interface BaileysSettings {
  mode:           WhatsAppMode;
  /** Assistant mode: the owner's personal number ("+6591234567") */
  ownerNumber:    string;
  /** Personal mode: messages in "Message yourself" must start with this */
  wakeWord:       string;
  allowedSenders: string[];
}

/**
 * Settings from the saved WhatsApp config. A setup saved before 2.3.2 has no
 * mode — it was linked to the owner's own WhatsApp, so it is "personal", now
 * with a start word (the assistant's name, or "Vee").
 */
export function baileysSettingsFrom(waCfg: any, agentName?: string | null): BaileysSettings {
  const rawAllowed = waCfg?.allowedSenders ?? waCfg?.allowlist ?? [];
  const allowedSenders: string[] = Array.isArray(rawAllowed)
    ? rawAllowed.filter((s: unknown) => typeof s === "string" && s.trim().length > 0)
    : typeof rawAllowed === "string"
      ? rawAllowed.split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean)
      : [];
  const mode: WhatsAppMode = waCfg?.mode === "assistant" ? "assistant" : "personal";
  const saved = cleanWakeWord(waCfg?.wakeWord);
  return {
    mode,
    ownerNumber: String(waCfg?.ownerNumber ?? "").trim(),
    wakeWord:    saved || defaultWakeWord(agentName),
    allowedSenders,
  };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname  = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "baileysWorker.js"); // compiled output path
const AUTH_DIR    = join(process.cwd(), "data", "whatsapp-auth");
const MAX_CHUNK   = 3800;

// ---------------------------------------------------------------------------
// Public types (re-exported for server.ts)
// ---------------------------------------------------------------------------

export type BaileysStatus = "connecting" | "qr_ready" | "connected" | "disconnected" | "logged_out";

type QRListener     = (qr: string)        => void;
type StatusListener = (s: BaileysStatus)  => void;

// ---------------------------------------------------------------------------
// Listener sets (EventEmitter-lite pattern)
// ---------------------------------------------------------------------------

const qrListeners:     Set<QRListener>     = new Set();
const statusListeners: Set<StatusListener> = new Set();

// ---------------------------------------------------------------------------
// Manager state
// ---------------------------------------------------------------------------

let _worker:       ChildProcess | null = null;
let _connected     = false;
let _authKeyHex:   string | null = null;  // master key for the encrypted login files
let _ownerJid:     string | null = null;  // linked account JID, set on "connected" status
let _ownerName:    string | null = null;  // WhatsApp profile name, set on "connected" status
let _settings:     BaileysSettings = { mode: "personal", ownerNumber: "", wakeWord: "", allowedSenders: [] };

// Document sends wait for the worker's send_result so the tool can report
// real delivery instead of "queued".
const SEND_DOC_TIMEOUT_MS = 90_000;
const pendingDocSends = new Map<string, {
  resolve: () => void;
  reject:  (err: Error) => void;
  timer:   ReturnType<typeof setTimeout>;
}>();

function _failPendingDocSends(reason: string): void {
  for (const [id, p] of pendingDocSends) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
    pendingDocSends.delete(id);
  }
}
let _baseCtx:      AgentContext | null = null;
let _registry:     ToolRegistry | null = null;
let _stopped       = false;   // true after an intentional stopBaileysListener() call
let _restartCount  = 0;

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS  = 30_000;

// Per-chat FIFO queue (Phase 1 logic)
const chatQueues = new ChannelQueues();

// Per-chat isolated agent contexts — keyed by WhatsApp chatId
interface ChatSession { context: AgentContext; lastActive: number; }
const chatSessions = new Map<string, ChatSession>();

// Prune sessions idle > 2 hours every 30 min
const _pruneTimer = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of chatSessions) {
    if (s.lastActive < cutoff) chatSessions.delete(id);
  }
}, 30 * 60 * 1000);
if (_pruneTimer.unref) _pruneTimer.unref();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Register a listener for raw QR code strings. */
export function onBaileysQR(fn: QRListener): () => void {
  qrListeners.add(fn);
  return () => qrListeners.delete(fn);
}

/** Register a listener for connection status changes. */
export function onBaileysStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/** True while the WhatsApp session is authenticated and online. */
export function isBaileysConnected(): boolean {
  return _connected;
}

/**
 * Where messages for the owner go (greetings, scheduled briefings), or null
 * until connected. Assistant mode: the owner's own number. Personal mode:
 * the linked account's "Message yourself" chat.
 */
export function getBaileysOwnerJid(): string | null {
  if (!_connected) return null;
  if (_settings.mode === "assistant") return phoneToJid(_settings.ownerNumber);
  return _ownerJid;
}

/** Current WhatsApp settings (mode, owner number, start word, allowlist). */
export function getBaileysSettings(): BaileysSettings {
  return { ..._settings, allowedSenders: [..._settings.allowedSenders] };
}

/** Apply new WhatsApp settings to the running connection — no relink needed. */
export function configureBaileys(next: Partial<BaileysSettings>): BaileysSettings {
  _settings = { ..._settings, ...next };
  // A respawned worker reads the running config — keep it in step.
  const tw = (_baseCtx?.config as any)?.tools?.whatsapp;
  if (tw) tw.config = { ...(tw.config ?? {}), ..._settings };
  _worker?.send({ type: "configure", settings: { ..._settings } });
  return getBaileysSettings();
}

/**
 * Which WhatsApp account this is linked to, for setup to show and check:
 * phone number (digits of the linked phone JID — never a LID) and profile
 * name. In assistant mode this is the assistant's number, not the owner's.
 */
export function getBaileysOwnerInfo(): { jid: string; phone: string; name: string | null } | null {
  if (!_connected || !_ownerJid || !_ownerJid.endsWith("@s.whatsapp.net")) return null;
  return { jid: _ownerJid, phone: `+${_ownerJid.split("@")[0]}`, name: _ownerName };
}

/**
 * Send a file into a WhatsApp chat. Resolves only after the worker confirms
 * delivery to WhatsApp; rejects with a user-readable reason otherwise.
 */
export function sendBaileysDocument(chatId: string, file: FileToSend): Promise<void> {
  const worker = _worker;
  if (!worker || !_connected) {
    return Promise.reject(new Error("WhatsApp is not connected right now."));
  }
  const reqId = randomUUID();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingDocSends.delete(reqId);
      reject(new Error("WhatsApp took too long to accept the file."));
    }, SEND_DOC_TIMEOUT_MS);
    pendingDocSends.set(reqId, { resolve, reject, timer });
    worker.send({
      type:     "send_document",
      reqId,
      chatId,
      filePath: file.absPath,
      fileName: file.fileName,
      mimeType: file.mimeType,
      caption:  file.caption,
    });
  });
}

/**
 * Send a text message from the agent to a WhatsApp chat.
 * Routes via IPC to the worker.
 */
export async function sendBaileysMessage(chatId: string, text: string): Promise<void> {
  if (!_worker || !_connected) {
    throw new Error("WhatsApp (Baileys) is not connected. Scan QR first.");
  }
  _worker.send({ type: "send_reply", chatId, text });
}

/**
 * Disconnect the session and force the worker to exit (no auth cleanup).
 * The next startBaileysListener() call will reconnect with saved credentials.
 */
export function stopBaileysListener(): void {
  _stopped = true;
  _killWorker();
  _connected = false;
}

/**
 * Call WhatsApp logout (deregisters linked device) then stop.
 * Deleting data/whatsapp-auth/ after this gives a clean QR on next connect.
 */
export async function logoutBaileys(): Promise<void> {
  await _unlinkFromPhone();
  stopBaileysListener();
}

/** Ask the worker to unlink this device from the WhatsApp account; waits up to ~6 s. */
async function _unlinkFromPhone(): Promise<void> {
  const worker = _worker;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 6_000);
    worker.once("exit", () => { clearTimeout(timer); resolve(); });
    try { worker.send({ type: "logout" }); } catch { clearTimeout(timer); resolve(); }
  });
}

/**
 * Full reset: stop the worker, deregister with WhatsApp, then delete the
 * cached multi-file auth state. The next connect generates a clean QR
 * with no stale credentials — this fixes the common "Invalid QR code"
 * error customers hit when pairing was interrupted previously.
 *
 * Safe to call even if not currently connected.
 */
export async function resetBaileysAuth(): Promise<void> {
  // Unlink from the phone first (best effort — doesn't matter if worker is dead),
  // so the old link doesn't linger in the phone's "Linked devices".
  try {
    _stopped = true; // the worker's clean exit must not trigger an auto-restart
    await _unlinkFromPhone();
  } catch { /* ignore */ }

  // Forcibly stop the worker.
  stopBaileysListener();

  // Wipe the auth directory so the next start regenerates from scratch.
  try {
    await rm(AUTH_DIR, { recursive: true, force: true });
    console.log(chalk.yellow(`  [WhatsApp] Cleared ${AUTH_DIR} — next connect will generate a fresh QR`));
  } catch (err) {
    // Non-fatal: if the dir didn't exist or was locked, the next start will
    // simply create a new one and Baileys will request a fresh QR anyway.
    console.log(chalk.gray(`  [WhatsApp] Auth dir cleanup skipped: ${err}`));
  }
}

/**
 * Start the Baileys listener (spawns the worker if not already running).
 * Idempotent — subsequent calls are no-ops if already connected.
 */
export async function startBaileysListener(
  baseCtx:  AgentContext,
  registry: ToolRegistry
): Promise<void> {
  if (_worker && _connected) return;

  _baseCtx  = baseCtx;
  // Phone chats get the small, confirmation-gated toolset — enforced here so
  // every caller (launcher, dashboard QR flow, auto-recovery) gets it.
  _registry = buildPhoneRegistry(registry);
  _stopped  = false;

  // The worker stores the WhatsApp login encrypted with the master key.
  if (!_authKeyHex) {
    _authKeyHex = await getMasterKey().then((k) => k.toString("hex")).catch((err) => {
      console.warn(chalk.yellow(`  [WhatsApp] Secret key unavailable — login files stay unencrypted: ${err}`));
      return null;
    });
  }

  _spawnWorker();
}

// ---------------------------------------------------------------------------
// Worker lifecycle
// ---------------------------------------------------------------------------

function _spawnWorker(): void {
  _killWorker(); // make sure old instance is gone

  console.log(chalk.cyan(
    `  [WhatsApp] Spawning Baileys worker (attempt ${_restartCount + 1})…`
  ));

  // The worker runs in its own process, so its connection is recorded here.
  recordNet("web.whatsapp.com", "WhatsApp connection", { category: "Messaging" });
  const child = fork(WORKER_PATH, [], {
    // stdio[0..2] piped so we can forward logs; ipc channel [3] added by fork
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  _worker = child;

  // Forward worker stdout / stderr to main console
  child.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
  child.stderr?.on("data", (d: Buffer) => process.stderr.write(d));

  // Send config to worker immediately (it will start connecting on receipt)
  const whisperCfg = _baseCtx ? resolveWhisperConfig(_baseCtx.config) : null;

  // ── Who may talk to the agent (SAFETY-CRITICAL) ──────────────────────────
  // Allowlist defaults to empty → only the owner is served. Mode, owner
  // number and start word decide who the owner is (see selfChat.ts).
  const waCfg = (_baseCtx?.config as any)?.tools?.whatsapp?.config ?? {};
  _settings = baileysSettingsFrom(waCfg, (_baseCtx?.config as any)?.name);

  child.send({
    type:   "start",
    config: {
      authDir:         AUTH_DIR,
      authKey:         _authKeyHex ?? undefined,
      maxChunk:        MAX_CHUNK,
      whisperKey:      whisperCfg?.apiKey,
      whisperBaseUrl:  whisperCfg?.baseUrl,
      whisperModel:    whisperCfg?.model,
      whisperProvider: whisperCfg?.provider,
      ..._settings,
    },
  });

  child.on("message", (msg: any) => _handleWorkerMessage(msg));

  child.on("exit", (code, signal) => {
    _connected = false;
    _worker    = null;
    _failPendingDocSends("WhatsApp disconnected before the file was sent.");
    _emitStatus("disconnected");

    // Intentional stop or clean WhatsApp logout (exit 0) — do not restart
    if (_stopped || code === 0 || signal === "SIGTERM") {
      console.log(chalk.gray("  [WhatsApp] Baileys worker stopped."));
      return;
    }

    // Cap the restart count to prevent infinite loops when auth is
    // unrecoverably broken (e.g. WhatsApp banned the device). Reported by
    // Beta-tester report (2026-05-26): re-scanning the same number caused an infinite
    // restart loop that effectively hung the agent.
    const MAX_RESTART_ATTEMPTS = 5;
    if (_restartCount >= MAX_RESTART_ATTEMPTS) {
      console.error(chalk.red(
        `  [WhatsApp] Worker has crashed ${_restartCount} times — giving up. ` +
        `Use "Reset connection" in the dashboard to wipe auth and try again.`
      ));
      _emitStatus("logged_out"); // requires user action
      return;
    }

    // Exit code 1 from the worker signals "bad session — wipe auth before
    // retrying" (set by the connectionReplaced/badSession branches in the
    // worker's connection.update handler). Without this auth wipe, the new
    // worker would hit the same auth-rejection and crash again immediately.
    const isBadSession = code === 1;
    if (isBadSession) {
      console.warn(chalk.yellow(
        "  [WhatsApp] Worker reported bad session — wiping auth dir before respawn"
      ));
      rm(AUTH_DIR, { recursive: true, force: true })
        .then(() => console.log(chalk.gray(`  [WhatsApp] Cleared ${AUTH_DIR}`)))
        .catch((err) => console.warn(chalk.gray(`  [WhatsApp] Could not wipe auth: ${err}`)));
    }

    // Unexpected crash — restart with exponential backoff
    const delay = Math.min(BASE_DELAY_MS * 2 ** _restartCount, MAX_DELAY_MS);
    _restartCount++;
    console.log(chalk.yellow(
      `  [WhatsApp] Worker crashed (code ${code}) — restarting in ${delay / 1000}s (attempt ${_restartCount}/${MAX_RESTART_ATTEMPTS})…`
    ));

    setTimeout(() => {
      if (!_stopped && _baseCtx && _registry) _spawnWorker();
    }, delay);
  });
}

function _killWorker(): void {
  if (!_worker) return;
  _failPendingDocSends("WhatsApp was restarted before the file was sent.");
  _worker.removeAllListeners();
  try { _worker.kill("SIGTERM"); } catch { /* already dead */ }
  _worker = null;
}

// ---------------------------------------------------------------------------
// Handle messages from worker
// ---------------------------------------------------------------------------

function _handleWorkerMessage(msg: any): void {
  if (!msg || typeof msg !== "object") return;

  switch (msg.type as string) {

    case "qr":
      // Pass raw QR data to listeners; server.ts SSE handler converts to data-URL
      for (const fn of qrListeners) fn(msg.data as string);
      break;

    case "status": {
      const status = msg.status as BaileysStatus;
      _connected = status === "connected";

      if (status === "connected") {
        _restartCount = 0; // reset backoff on success
        // Worker includes the linked account's JID (device suffix stripped) —
        // used as the proactive-delivery target ("message yourself").
        if (typeof msg.ownerJid === "string" && msg.ownerJid) {
          _ownerJid = msg.ownerJid;
        }
        if (typeof msg.ownerName === "string" && msg.ownerName) {
          _ownerName = msg.ownerName;
        }
        console.log(chalk.green("  [WhatsApp] Connected via Baileys worker!"));
      } else {
        console.log(chalk.yellow(`  [WhatsApp] Status: ${status}`));
      }

      _emitStatus(status);
      break;
    }

    case "incoming_text": {
      const { chatId, fromName, text, isVoice } = msg as {
        chatId: string; fromName: string; text: string; isVoice: boolean;
      };
      // Anything but an explicit owner flag is treated as a guest.
      const isOwner = (msg as { isOwner?: unknown }).isOwner === true;

      // Phase 1 queue gate
      const q      = chatQueues.getOrCreate(chatId);
      const result = q.enqueue(
        () => withTrigger("your message (WhatsApp)", () => _processIncoming(chatId, fromName, text, isVoice, isOwner)),
        `wa:${chatId.split("@")[0]}:${text.slice(0, 30)}`
      );

      if (result === "full" && _worker) {
        _worker.send({
          type:   "send_reply",
          chatId,
          text:   "⏳ You have too many messages queued — please wait for the current ones to finish.",
        });
      }
      break;
    }

    case "send_result": {
      const p = pendingDocSends.get(msg.reqId as string);
      if (!p) break; // timed out already
      clearTimeout(p.timer);
      pendingDocSends.delete(msg.reqId as string);
      if (msg.ok) p.resolve();
      else p.reject(new Error(String(msg.error || "WhatsApp refused the file.")));
      break;
    }

    case "reset_command":
      // Worker already replied to user; clear our local session + queue state
      chatSessions.delete(msg.chatId as string);
      chatQueues.clear(msg.chatId as string);
      break;

    case "log":
      if (msg.level === "error") {
        console.error(chalk.red(`  [WhatsApp/worker] ${msg.message}`));
      } else if (msg.level === "warn") {
        console.warn(chalk.yellow(`  [WhatsApp/worker] ${msg.message}`));
      } else {
        console.log(chalk.gray(`  [WhatsApp/worker] ${msg.message}`));
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Process incoming text — agentLoop lives in the main process
// ---------------------------------------------------------------------------

async function _processIncoming(
  chatId:   string,
  fromName: string,
  text:     string,
  isVoice:  boolean,
  isOwner = false,
): Promise<void> {
  if (!_baseCtx || !_registry || !_worker) return;

  console.log(chalk.gray(
    `  [WhatsApp] ${fromName} (${chatId.split("@")[0]}): ${text.slice(0, 100)}${text.length > 100 ? "…" : ""}`
  ));

  // Per-chat isolated session
  const session = _getOrCreateSession(chatId, isOwner ? null : fromName);
  // Allow-listed people who aren't the owner get no tools (guestMode.ts).
  const registry = isOwner ? _registry : buildGuestRegistry();
  if (isVoice && _baseCtx) {
    // The worker sent the voice note for transcription before handing us the text.
    const w = resolveWhisperConfig(_baseCtx.config);
    if (w) recordNet(hostOf(w.baseUrl), "voice note transcription", { category: "AI model" });
  }

  // A send waiting for YES/NO is answered here, before the model runs — the
  // model can never complete a send by itself. Voice transcripts arrive
  // framed, so a mis-heard voice note can never count as YES.
  const pendingReply = await resolvePendingReply(session.channel!, text);
  if (pendingReply.handled) {
    recordExchange(session, text, pendingReply.reply!);
    _worker?.send({ type: "send_reply", chatId, text: pendingReply.reply });
    return;
  }
  // Web tools work this turn only if the owner's own words asked to go online.
  startTurn(session, text, pendingReply.grantOnline);

  const framedInput = isVoice
    ? text  // voice already framed by worker ("🎙️ [Voice message from …]: …")
    : `[Message from ${fromName} via WhatsApp]: ${text}`;

  const turnStartedAt = Date.now();
  const localAi = (_baseCtx.config as any)?.provider === "ollama";
  // Like Telegram's "⏳ Thinking…": if the answer takes a while, say so —
  // "typing…" keeps showing until the real answer is sent.
  const stillWorking = setTimeout(() => {
    _worker?.send({
      type: "send_reply",
      chatId,
      keepTyping: true,
      text: localAi
        ? "⏳ Working on it — the AI on your computer can take a minute or two."
        : "⏳ Working on it…",
    });
  }, 20_000);
  let response = "";
  try {
    for await (const ev of agentLoop(framedInput, session, registry)) {
      if (ev.type === "text_delta") response += ev.text;
      if (ev.type === "error" && !response.includes("⚠️")) {
        response += `\n\n⚠️ ${ev.error}`;
      }
    }
  } catch (err) {
    console.error(chalk.red(`  [WhatsApp] agentLoop error for ${chatId}:`, err));
    response = "⚠️ Sorry, I ran into an error. Please try again in a moment.";
  } finally {
    clearTimeout(stillWorking);
  }

  let reply = response.trim();
  // Never rely on the model to phrase the confirmation ask.
  const parked = pendingCreatedSince(session.channel!, turnStartedAt);
  if (parked) {
    const ask = confirmPromptFor(parked);
    reply = reply ? `${reply}\n\n${ask}` : ask;
  }
  // Never leave a message unanswered — an empty answer looked like the
  // assistant was dead (small local models sometimes return nothing).
  if (!reply) {
    reply = localAi
      ? "🤔 I couldn't come up with an answer to that. Try asking in other words — or switch to a bigger AI model in the dashboard (🤖 AI model)."
      : "🤔 I couldn't come up with an answer to that. Try asking in other words.";
  }
  if (_worker) {
    _worker.send({ type: "send_reply", chatId, text: reply });
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

function _getOrCreateSession(chatId: string, guestName: string | null = null): AgentContext {
  if (!chatSessions.has(chatId)) {
    chatSessions.set(chatId, {
      context: {
        ..._baseCtx!,
        sessionId: `wa-${randomUUID().slice(0, 8)}`,
        turnCount: 0,
        messages:  [],
        taskQueue: [],
        channel:   { kind: "whatsapp", chatId },
      },
      lastActive: Date.now(),
    });
    if (guestName !== null) makeGuest(chatSessions.get(chatId)!.context, guestName);
  }
  const s = chatSessions.get(chatId)!;
  s.lastActive = Date.now();
  return s.context;
}

// ---------------------------------------------------------------------------
// Emitter helpers
// ---------------------------------------------------------------------------

// Cache the last status so consumers can read it synchronously without
// subscribing. The Integration adapter uses this for getStatus() — calling
// the worker over IPC for every status check would be wasteful.
let _lastStatus: BaileysStatus | null = null;

function _emitStatus(status: BaileysStatus): void {
  _lastStatus = status;
  for (const fn of statusListeners) fn(status);
}

/** Last status reported by the Baileys worker. null if never started. */
export function getLastBaileysStatus(): BaileysStatus | null {
  return _lastStatus;
}

// ---------------------------------------------------------------------------
// Dashboard / metrics
// ---------------------------------------------------------------------------

/** Queue depth snapshot for the status endpoint. */
export function getBaileysQueueSnapshot(): Record<string, { depth: number; processing: boolean }> {
  return chatQueues.snapshot();
}

/** How many active chat sessions are open. */
export function activeBaileysSessionCount(): number {
  return chatSessions.size;
}

/** Is the worker process currently alive? */
export function isBaileysWorkerRunning(): boolean {
  return _worker !== null && !_worker.killed;
}
