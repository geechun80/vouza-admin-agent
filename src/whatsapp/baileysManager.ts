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
// Public API  (identical to baileysListener.ts — callers need no changes)
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
import chalk                       from "chalk";
import type { AgentContext }       from "../types/index.js";
import type { ToolRegistry }       from "../tools/registry.js";
import { agentLoop }               from "../agent/loop.js";
import { ChannelQueues }           from "../agent/queue.js";
import { resolveWhisperConfig }    from "../voice/transcriber.js";

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
// Listener sets (same EventEmitter-lite pattern as baileysListener.ts)
// ---------------------------------------------------------------------------

const qrListeners:     Set<QRListener>     = new Set();
const statusListeners: Set<StatusListener> = new Set();

// ---------------------------------------------------------------------------
// Manager state
// ---------------------------------------------------------------------------

let _worker:       ChildProcess | null = null;
let _connected     = false;
let _baseCtx:      AgentContext | null = null;
let _registry:     ToolRegistry | null = null;
let _stopped       = false;   // true after an intentional stopBaileysListener() call
let _restartCount  = 0;

const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS  = 30_000;

// Per-chat FIFO queue (Phase 1 logic, moved here from baileysListener.ts)
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
  if (_worker) _worker.send({ type: "stop" }); // worker calls sock.logout() then exits 0
  await new Promise<void>((r) => setTimeout(r, 1000)); // let it flush
  stopBaileysListener();
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
  _registry = registry;
  _stopped  = false;

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
  child.send({
    type:   "start",
    config: {
      authDir:         AUTH_DIR,
      maxChunk:        MAX_CHUNK,
      whisperKey:      whisperCfg?.apiKey,
      whisperBaseUrl:  whisperCfg?.baseUrl,
      whisperModel:    whisperCfg?.model,
      whisperProvider: whisperCfg?.provider,
    },
  });

  child.on("message", (msg: any) => _handleWorkerMessage(msg));

  child.on("exit", (code, signal) => {
    _connected = false;
    _worker    = null;
    _emitStatus("disconnected");

    // Intentional stop or clean WhatsApp logout (exit 0) — do not restart
    if (_stopped || code === 0 || signal === "SIGTERM") {
      console.log(chalk.gray("  [WhatsApp] Baileys worker stopped."));
      return;
    }

    // Unexpected crash — restart with exponential backoff
    const delay = Math.min(BASE_DELAY_MS * 2 ** _restartCount, MAX_DELAY_MS);
    _restartCount++;
    console.log(chalk.yellow(
      `  [WhatsApp] Worker crashed (code ${code}) — restarting in ${delay / 1000}s…`
    ));

    setTimeout(() => {
      if (!_stopped && _baseCtx && _registry) _spawnWorker();
    }, delay);
  });
}

function _killWorker(): void {
  if (!_worker) return;
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

      // Phase 1 queue gate
      const q      = chatQueues.getOrCreate(chatId);
      const result = q.enqueue(
        () => _processIncoming(chatId, fromName, text, isVoice),
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
  isVoice:  boolean
): Promise<void> {
  if (!_baseCtx || !_registry || !_worker) return;

  console.log(chalk.gray(
    `  [WhatsApp] ${fromName} (${chatId.split("@")[0]}): ${text.slice(0, 100)}${text.length > 100 ? "…" : ""}`
  ));

  // Per-chat isolated session
  const session = _getOrCreateSession(chatId);

  const framedInput = isVoice
    ? text  // voice already framed by worker ("🎙️ [Voice message from …]: …")
    : `[Message from ${fromName} via WhatsApp]: ${text}`;

  let response = "";
  try {
    for await (const ev of agentLoop(framedInput, session, _registry)) {
      if (ev.type === "text_delta") response += ev.text;
      if (ev.type === "error" && !response.includes("⚠️")) {
        response += `\n\n⚠️ ${ev.error}`;
      }
    }
  } catch (err) {
    console.error(chalk.red(`  [WhatsApp] agentLoop error for ${chatId}:`, err));
    response = "⚠️ Sorry, I ran into an error. Please try again in a moment.";
  }

  const reply = response.trim();
  if (reply && _worker) {
    _worker.send({ type: "send_reply", chatId, text: reply });
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

function _getOrCreateSession(chatId: string): AgentContext {
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
  const s = chatSessions.get(chatId)!;
  s.lastActive = Date.now();
  return s.context;
}

// ---------------------------------------------------------------------------
// Emitter helpers
// ---------------------------------------------------------------------------

function _emitStatus(status: BaileysStatus): void {
  for (const fn of statusListeners) fn(status);
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
