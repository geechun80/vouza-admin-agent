// =============================================================================
// Conversation Store — Append-only audit log of every agent turn
//
// PURPOSE:
//   - PDPA / GDPR compliance: customers in SG/MY/EU need a complete record
//     of what their AI assistant processed about them, and a way to export
//     or delete it on request.
//   - Crash forensics: when the agent dies mid-conversation, we can see
//     exactly which turn triggered it.
//   - Debugging customer issues: "the bot said X yesterday" — we have it.
//
// DESIGN:
//   - Append-only JSONL at data/chat-history/<sessionId>.jsonl
//   - No native dependencies (no sqlite, no orm) — just fs append
//   - Fire-and-forget writes: appendTurn() returns void; if disk is full
//     or locked the agent is NEVER blocked
//   - Redaction applied BEFORE writing so secrets don't land on disk
//   - Crash-safe by design: append-only with line-delimited records — a
//     partial write only loses the last incomplete line, never corrupts
//     prior history
//
// NOT in scope (separate decisions, separate commits):
//   - Auto-restoring server-side context on reconnect (UX decision)
//   - Encryption at rest (filesystem-level encryption is the right layer)
//   - Cross-process locking (single-process append is fine; SQLite later if needed)
// =============================================================================

import { promises as fs } from "fs";
import { join, dirname, resolve, sep } from "path";
import { redact } from "./redactor.js";

// ── Configuration ────────────────────────────────────────────────────────────

const HISTORY_DIR = join(process.cwd(), "data", "chat-history");

/** Max bytes we'll return on a single transcript read (safety bound). */
const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;   // 10 MB

// ── Types ────────────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant" | "tool";

export interface ChatTurn {
  ts:         string;                          // ISO timestamp
  sessionId:  string;
  channel:    string;                          // "dashboard" | "telegram" | "whatsapp" | "email" | "cli"
  role:       ChatRole;
  content:    string;
  model?:     string;                          // populated for assistant turns
  provider?:  string;
  tools?:     string[];                        // tool names invoked during this turn
  meta?:      Record<string, unknown>;         // free-form extras (token counts, errors, …)
}

export interface SessionSummary {
  sessionId:    string;
  turnCount:    number;
  firstSeen:    string;
  lastSeen:     string;
  channel:      string;
  preview:      string;                        // first user message (redacted, truncated)
}

// ── Validation: session IDs must be safe filename fragments ──────────────────

function safeSessionId(sessionId: string): string | null {
  // Allowlist: alphanumerics, dashes, underscores; max 96 chars.
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(sessionId)) return null;
  return sessionId;
}

function pathFor(sessionId: string): string | null {
  const safe = safeSessionId(sessionId);
  if (!safe) return null;
  const filePath = resolve(HISTORY_DIR, `${safe}.jsonl`);
  // Defense in depth: confirm the resolved path stays inside HISTORY_DIR
  const base = resolve(HISTORY_DIR) + sep;
  if (!filePath.startsWith(base)) return null;
  return filePath;
}

// ── Public API ───────────────────────────────────────────────────────────────

// Serialized write queue per session — prevents interleaved appends from
// corrupting line order under concurrent calls. Each session has its own
// chain; appends to different sessions still run in parallel.
const writeQueues: Map<string, Promise<void>> = new Map();

/**
 * Append a turn to the session's audit log.
 *
 * Returns a Promise that resolves once the line has been written. Production
 * callers don't need to await — disk errors are silently swallowed so the
 * agent path is NEVER blocked. Tests CAN await to ensure deterministic state.
 *
 * Content is redacted BEFORE writing so secrets never hit disk.
 */
export function appendTurn(
  turn: Omit<ChatTurn, "ts"> & { ts?: string }
): Promise<void> {
  // Validate session ID first — bad IDs are silently dropped.
  const filePath = pathFor(turn.sessionId);
  if (!filePath) return Promise.resolve();

  const record: ChatTurn = {
    ts:        turn.ts || new Date().toISOString(),
    sessionId: turn.sessionId,
    channel:   turn.channel,
    role:      turn.role,
    content:   redact(turn.content || ""),  // redact BEFORE persisting
    model:     turn.model,
    provider:  turn.provider,
    tools:     turn.tools,
    meta:      turn.meta,
  };

  // Chain this append after any in-flight write for the same session, so the
  // file's line order matches call order even under concurrent invocations.
  const prev = writeQueues.get(turn.sessionId) ?? Promise.resolve();
  const next = prev.then(async () => {
    try {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, JSON.stringify(record) + "\n", "utf-8");
    } catch {
      // Swallow — never block the agent path.
    }
  });
  writeQueues.set(turn.sessionId, next);
  // Clean up completed chains so the map doesn't grow forever.
  next.finally(() => {
    if (writeQueues.get(turn.sessionId) === next) {
      writeQueues.delete(turn.sessionId);
    }
  });
  return next;
}

/**
 * Load a session's full transcript from disk.
 * Returns an empty array if the file doesn't exist OR is malformed.
 * Corrupt lines are skipped, not fatal.
 */
export async function loadTranscript(sessionId: string): Promise<ChatTurn[]> {
  const filePath = pathFor(sessionId);
  if (!filePath) return [];

  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_TRANSCRIPT_BYTES) {
      // Safety: read only the tail so we don't OOM on a huge log
      const fh = await fs.open(filePath, "r");
      try {
        const start = stat.size - MAX_TRANSCRIPT_BYTES;
        const buf = Buffer.alloc(MAX_TRANSCRIPT_BYTES);
        await fh.read(buf, 0, MAX_TRANSCRIPT_BYTES, start);
        return parseJsonl(buf.toString("utf-8"), /* skipFirstPartial */ true);
      } finally {
        await fh.close();
      }
    }
    const raw = await fs.readFile(filePath, "utf-8");
    return parseJsonl(raw, /* skipFirstPartial */ false);
  } catch {
    return [];
  }
}

/**
 * Delete a session's transcript entirely.
 * Idempotent — succeeds even if the file is already gone.
 * Use this for PDPA "right to erasure" requests.
 */
export async function deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
  const filePath = pathFor(sessionId);
  if (!filePath) return { deleted: false };
  try {
    await fs.unlink(filePath);
    return { deleted: true };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { deleted: true };   // already gone
    return { deleted: false };
  }
}

/**
 * List session summaries — metadata only, newest first.
 * Used by the dashboard's audit-trail UI and for compliance reports.
 */
export async function listSessions(limit = 50): Promise<SessionSummary[]> {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    const files = (await fs.readdir(HISTORY_DIR)).filter((f) => f.endsWith(".jsonl"));
    const summaries = await Promise.all(
      files.map(async (file) => {
        const sessionId = file.replace(/\.jsonl$/, "");
        const turns = await loadTranscript(sessionId);
        if (turns.length === 0) return null;
        const firstUserTurn = turns.find((t) => t.role === "user");
        return {
          sessionId,
          turnCount:  turns.length,
          firstSeen:  turns[0].ts,
          lastSeen:   turns[turns.length - 1].ts,
          channel:    turns[0].channel || "unknown",
          preview:    (firstUserTurn?.content || turns[0].content || "").slice(0, 80),
        } as SessionSummary;
      })
    );
    return (summaries.filter(Boolean) as SessionSummary[])
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function parseJsonl(raw: string, skipFirstPartial: boolean): ChatTurn[] {
  const lines = raw.split("\n");
  const start = skipFirstPartial ? 1 : 0;     // first line may be mid-record after tail-read
  const turns: ChatTurn[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as ChatTurn;
      if (obj && typeof obj.ts === "string" && typeof obj.role === "string") {
        turns.push(obj);
      }
    } catch {
      // Corrupt line — skip silently. Append-only design means this can only
      // happen for the most recent partial write after a crash.
    }
  }
  return turns;
}

// ── Test hook ────────────────────────────────────────────────────────────────

/** Internal — exposed for tests to wait until all queued writes are flushed. */
export async function __testFlush(): Promise<void> {
  // Await every per-session chain currently in flight.
  const inFlight = Array.from(writeQueues.values());
  await Promise.allSettled(inFlight);
  // Yield once more in case a finally() callback re-registered a chain.
  await new Promise((r) => setImmediate(r));
}
