// =============================================================================
// AgentMail Listener — Dedicated agent inbox polling loop
//
// AgentMail gives the agent its own @agentmail.to address so any external
// sender can email the agent directly. This module polls every 60 seconds,
// finds new messages across all threads, and runs the agentLoop to generate
// a reply that is sent back into the same thread.
//
// Real API schema (confirmed via live call):
//   inbox_id  — full email address, e.g. "admin-agent@agentmail.to"
//               URL-encoded when used in path segments
//   email     — same as inbox_id
//
// Pattern mirrors baileysManager.ts: idempotent start/stop, per-thread
// isolated AgentContext, session map with 2-hour prune, state persisted to
// data/agentmail-state.json so seen message IDs survive restarts.
// =============================================================================

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import chalk from "chalk";
import type { AgentContext } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { agentLoop } from "../agent/loop.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL         = "https://api.agentmail.to";
const POLL_INTERVAL_MS = 60_000;
const MAX_REPLY_CHARS  = 10_000;
const STATE_PATH       = join(process.cwd(), "data", "agentmail-state.json");

// ---------------------------------------------------------------------------
// Types  (matched to the live API response)
// ---------------------------------------------------------------------------

interface AgentMailInboxInfo {
  inbox_id:        string;  // full email — "admin-agent@agentmail.to"
  email:           string;  // same as inbox_id
  display_name:    string;
  organization_id: string;
  pod_id:          string;
  created_at:      string;
  updated_at:      string;
}

interface AgentMailThread {
  id:              string;
  subject:         string;
  participants:    { email: string; name?: string }[];
  last_message_at: string;
  message_count:   number;
}

interface AgentMailMessage {
  id:          string;
  from:        { email: string; name?: string };
  to:          { email: string; name?: string }[];
  subject:     string;
  text?:       string;
  html?:       string;
  received_at: string;
}

interface AgentMailState {
  inbox:          AgentMailInboxInfo | null;
  seenMessageIds: string[];
}

interface ThreadSession {
  context:    AgentContext;
  lastActive: number;
}

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------

let _pollTimer:       ReturnType<typeof setInterval> | null = null;
let _pollInProgress:  boolean = false;   // Phase 1: guard against overlapping polls
let _inbox:           AgentMailInboxInfo | null = null;
let _baseCtx:         AgentContext | null = null;
let _registry:        ToolRegistry | null = null;
let _apiKey:          string = "";
let _seenIds:         Set<string> = new Set();
let _starting:        boolean = false;

const threadSessions: Map<string, ThreadSession> = new Map();

// Reply depth cap — prevents infinite agent→mail→agent loops
const MAX_AUTO_REPLIES = 5;
const replyDepths: Map<string, number> = new Map();

// Reset depth counters every 24h so threads can reopen the next day
const _depthResetTimer = setInterval(() => replyDepths.clear(), 24 * 60 * 60 * 1000);
if (_depthResetTimer.unref) _depthResetTimer.unref();

// Prune sessions idle > 2 hours every 30 minutes
const _pruneTimer = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of threadSessions) {
    if (s.lastActive < cutoff) threadSessions.delete(id);
  }
}, 30 * 60 * 1000);
if (_pruneTimer.unref) _pruneTimer.unref();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return current inbox info for the status endpoint.
 * Returns null if not yet configured or connected.
 */
export function getAgentMailInbox(): { inboxId: string; email: string } | null {
  if (!_inbox) return null;
  return { inboxId: _inbox.inbox_id, email: _inbox.email };
}

/**
 * Start the AgentMail polling listener.
 * Idempotent — safe to call multiple times; subsequent calls are no-ops.
 */
export async function startAgentMailListener(
  baseCtx:  AgentContext,
  registry: ToolRegistry
): Promise<void> {
  if (_pollTimer || _starting) return; // already running or starting

  const apiKey = baseCtx.config.tools?.agentmail?.apiKey as string | undefined;
  if (!apiKey) {
    console.log(chalk.gray("  [AgentMail] No API key configured — skipping"));
    return;
  }

  _starting  = true;
  _baseCtx   = baseCtx;
  _registry  = registry;
  _apiKey    = apiKey;

  console.log(chalk.cyan("  [AgentMail] Initialising inbox..."));

  try {
    await loadState();
    await ensureInbox(baseCtx.config);

    // Expose the inbox_id to tools via runtime config so they can build paths
    if (_inbox && _baseCtx.config.tools?.agentmail) {
      (_baseCtx.config.tools.agentmail as any).inboxId = _inbox.inbox_id;
    }

    startPollLoop();
    console.log(chalk.green(`  [AgentMail] Connected — inbox: ${_inbox?.email}`));
  } catch (err) {
    console.error(chalk.red("  [AgentMail] Failed to initialise:", err));
  } finally {
    _starting = false;
  }
}

/**
 * Stop the polling loop (called on agent shutdown).
 */
export function stopAgentMailListener(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Inbox provisioning
// ---------------------------------------------------------------------------

async function ensureInbox(config: AgentContext["config"]): Promise<void> {
  const desiredSlug = slugify(
    (config.tools?.agentmail as any)?.username || config.name || "admin-agent"
  );

  // Reuse state if already found
  if (_inbox) return;

  // Fetch existing inboxes
  const listRes = await amFetch("GET", "/inboxes");
  const inboxes: AgentMailInboxInfo[] = listRes.inboxes ?? [];

  // Match on the username part before @
  const existing = inboxes.find((i) => {
    const slug = i.inbox_id.split("@")[0];
    return slug === desiredSlug;
  });

  if (existing) {
    _inbox = existing;
    await saveState();
    return;
  }

  // Create a new inbox
  const created = await amFetch("POST", "/inboxes", {
    username:     desiredSlug,
    display_name: config.name || "Admin Agent",
  });

  _inbox = created as AgentMailInboxInfo;
  await saveState();
  console.log(chalk.green(`  [AgentMail] Created inbox: ${_inbox.email}`));
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

function startPollLoop(): void {
  if (_pollTimer) return;

  // Run once immediately, then on interval
  pollOnce().catch((err) => console.error(chalk.red("  [AgentMail] Poll error:", err)));

  _pollTimer = setInterval(() => {
    pollOnce().catch((err) => console.error(chalk.red("  [AgentMail] Poll error:", err)));
  }, POLL_INTERVAL_MS);

  if (_pollTimer.unref) _pollTimer.unref();
}

async function pollOnce(): Promise<void> {
  // Guard: skip if the previous poll hasn't finished yet (slow mailbox / many threads)
  if (_pollInProgress) {
    console.log(chalk.gray("  [AgentMail] Poll skipped — previous poll still running"));
    return;
  }
  if (!_inbox || !_baseCtx || !_registry) return;

  _pollInProgress = true;
  const inboxPath = encodeURIComponent(_inbox.inbox_id);

  try {
    let threads: AgentMailThread[];
    try {
      const res = await amFetch("GET", `/inboxes/${inboxPath}/threads?limit=50`);
      threads = res.threads ?? [];
    } catch (err) {
      console.error(chalk.red("  [AgentMail] Failed to fetch threads:", err));
      return;
    }

    for (const thread of threads) {
      await processThread(thread, inboxPath).catch((err) => {
        console.error(chalk.red(`  [AgentMail] Error processing thread ${thread.id}:`, err));
      });
    }
  } finally {
    _pollInProgress = false;
  }
}

async function processThread(
  thread:    AgentMailThread,
  inboxPath: string
): Promise<void> {
  if (!_inbox || !_baseCtx || !_registry) return;

  let fullThread: { id: string; subject: string; messages: AgentMailMessage[] };
  try {
    fullThread = await amFetch("GET", `/inboxes/${inboxPath}/threads/${thread.id}`);
  } catch {
    return;
  }

  const messages = fullThread.messages ?? [];

  // Find messages we haven't seen yet
  const unseen = messages.filter((m) => !_seenIds.has(m.id));
  if (unseen.length === 0) return;

  // Mark all unseen immediately to avoid double-processing on next poll
  for (const m of unseen) _seenIds.add(m.id);
  await saveState();

  // Filter out outbound messages the agent already sent
  const agentAddress = _inbox.email.toLowerCase();
  const inbound = unseen.filter((m) => m.from.email.toLowerCase() !== agentAddress);
  if (inbound.length === 0) return;

  const newest   = inbound[inbound.length - 1];
  const fromName = newest.from.name || newest.from.email;
  const userText = newest.text || stripHtml(newest.html || "");

  if (!userText.trim()) return;

  // Sender allowlist — if configured, only whitelisted addresses can trigger the agent
  const allowedSenders = (_baseCtx!.config.tools?.agentmail as any)?.allowedSenders as string[] | undefined;
  if (allowedSenders && allowedSenders.length > 0) {
    const senderEmail = newest.from.email.toLowerCase();
    const allowed = allowedSenders.some((s) => s.toLowerCase() === senderEmail);
    if (!allowed) {
      console.warn(chalk.yellow(
        `  [AgentMail] Rejected message from unlisted sender: ${newest.from.email}`
      ));
      return;
    }
  }

  // Reply depth cap — prevents infinite reply loops
  const depth = replyDepths.get(thread.id) ?? 0;
  if (depth >= MAX_AUTO_REPLIES) {
    console.warn(chalk.yellow(
      `  [AgentMail] Max auto-replies (${MAX_AUTO_REPLIES}) reached for thread ${thread.id} — skipping`
    ));
    return;
  }
  replyDepths.set(thread.id, depth + 1);

  console.log(chalk.gray(
    `  [AgentMail] ${fromName} <${newest.from.email}>: ${userText.slice(0, 100)}${userText.length > 100 ? "…" : ""}`
  ));

  // Frame as external input to reduce prompt injection risk
  const framedInput = `[Email from ${fromName} <${newest.from.email}>]:\n${userText}`;

  // Get or create per-thread session
  const session = getOrCreateSession(thread.id);

  // Run agent loop
  let response = "";
  try {
    for await (const ev of agentLoop(framedInput, session.context, _registry)) {
      if (ev.type === "text_delta") response += ev.text;
      if (ev.type === "error" && !response.includes("⚠️")) {
        response += `\n\n⚠️ ${ev.error}`;
      }
    }
  } catch (err) {
    response = `I encountered an error processing your message. Please try again.\n\n${err}`;
  }

  const reply = response.trim();
  if (!reply) return;

  // Send reply — chunked if over limit
  const chunks: string[] = [];
  for (let i = 0; i < reply.length; i += MAX_REPLY_CHARS) {
    chunks.push(reply.slice(i, i + MAX_REPLY_CHARS));
  }

  for (const chunk of chunks) {
    try {
      const sentMsg = await amFetch("POST", `/inboxes/${inboxPath}/messages/send`, {
        to:        [{ email: newest.from.email, name: newest.from.name }],
        text:      chunk,
        thread_id: thread.id,
      });
      // Mark outbound reply as seen so it doesn't trigger a loop
      if (sentMsg?.message_id) _seenIds.add(sentMsg.message_id);
    } catch (err) {
      console.error(chalk.red("  [AgentMail] Failed to send reply:", err));
    }
  }

  await saveState();
  console.log(chalk.gray(`  [AgentMail] Replied to ${fromName} in thread ${thread.id.slice(0, 8)}`));
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

function getOrCreateSession(threadId: string): ThreadSession {
  if (!threadSessions.has(threadId)) {
    threadSessions.set(threadId, {
      context: {
        ..._baseCtx!,
        sessionId: `am-${threadId.slice(0, 8)}`,
        turnCount: 0,
        messages:  [],
        taskQueue: [],
      },
      lastActive: Date.now(),
    });
  }
  const session = threadSessions.get(threadId)!;
  session.lastActive = Date.now();
  return session;
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

async function loadState(): Promise<void> {
  try {
    const raw    = await readFile(STATE_PATH, "utf-8");
    const state: AgentMailState = JSON.parse(raw);
    _inbox   = state.inbox;
    _seenIds = new Set(state.seenMessageIds || []);
  } catch {
    // No saved state — start fresh
    _inbox   = null;
    _seenIds = new Set();
  }
}

async function saveState(): Promise<void> {
  try {
    await mkdir(join(process.cwd(), "data"), { recursive: true });
    const state: AgentMailState = {
      inbox:          _inbox,
      seenMessageIds: Array.from(_seenIds),
    };
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error(chalk.red("  [AgentMail] Failed to save state:", err));
  }
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function amFetch(method: string, path: string, body?: unknown): Promise<any> {
  const options: RequestInit = {
    method,
    headers: {
      Authorization:  `Bearer ${_apiKey}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AgentMail API ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Active thread session count (for status/metrics). */
export function activeAgentMailSessionCount(): number {
  return threadSessions.size;
}

/** True if a poll is currently in progress (Phase 1 guard). */
export function isAgentMailPolling(): boolean {
  return _pollInProgress;
}
