// =============================================================================
// Smoke tests — conversationStore.ts (PDPA-compliant chat audit log)
//
// Locks in the audit-trail contract:
//   - Turns are written as JSONL with proper redaction
//   - Corrupt or partial lines are gracefully skipped
//   - Session ID validation prevents path traversal
//   - Delete is idempotent (right to erasure)
//   - Append never throws (fire-and-forget contract)
// =============================================================================

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "fs";
import { join } from "path";
import {
  appendTurn,
  loadTranscript,
  deleteSession,
  listSessions,
  __testFlush,
} from "../src/agent/conversationStore.js";

const HIST_DIR = join(process.cwd(), "data", "chat-history");

async function cleanHistoryDir() {
  try {
    const files = await fs.readdir(HIST_DIR);
    for (const f of files) {
      if (f.endsWith(".jsonl")) {
        await fs.unlink(join(HIST_DIR, f)).catch(() => {});
      }
    }
  } catch { /* dir may not exist yet */ }
}

describe("conversationStore — append + load roundtrip", () => {
  beforeEach(cleanHistoryDir);
  afterEach(cleanHistoryDir);

  it("persists a single user turn", async () => {
    appendTurn({
      sessionId: "test-roundtrip-1",
      channel:   "dashboard",
      role:      "user",
      content:   "Hello, please read my email",
    });
    await __testFlush();
    const turns = await loadTranscript("test-roundtrip-1");
    assert.equal(turns.length, 1);
    assert.equal(turns[0].role, "user");
    assert.equal(turns[0].content, "Hello, please read my email");
  });

  it("preserves order of multiple turns", async () => {
    appendTurn({ sessionId: "test-order", channel: "dashboard", role: "user", content: "first" });
    appendTurn({ sessionId: "test-order", channel: "dashboard", role: "assistant", content: "second" });
    appendTurn({ sessionId: "test-order", channel: "dashboard", role: "user", content: "third" });
    await __testFlush();
    const turns = await loadTranscript("test-order");
    assert.equal(turns.length, 3);
    assert.equal(turns[0].content, "first");
    assert.equal(turns[1].content, "second");
    assert.equal(turns[2].content, "third");
  });

  it("captures assistant metadata (model, provider, tools)", async () => {
    appendTurn({
      sessionId: "test-meta",
      channel:   "dashboard",
      role:      "assistant",
      content:   "I've read your inbox",
      model:     "claude-sonnet-4-6",
      provider:  "anthropic",
      tools:     ["read_emails", "save_memory"],
    });
    await __testFlush();
    const turns = await loadTranscript("test-meta");
    assert.equal(turns.length, 1);
    assert.equal(turns[0].model, "claude-sonnet-4-6");
    assert.equal(turns[0].provider, "anthropic");
    assert.deepEqual(turns[0].tools, ["read_emails", "save_memory"]);
  });
});

describe("conversationStore — redaction before persist", () => {
  beforeEach(cleanHistoryDir);
  afterEach(cleanHistoryDir);

  it("redacts API keys from user messages before writing", async () => {
    const key = "sk-ant-" + "a".repeat(95);
    appendTurn({
      sessionId: "test-redact",
      channel:   "dashboard",
      role:      "user",
      content:   `My key is ${key}, please save it`,
    });
    await __testFlush();
    const turns = await loadTranscript("test-redact");
    assert.equal(turns.length, 1);
    assert.ok(!turns[0].content.includes(key), "Raw key should not be persisted");
    assert.ok(turns[0].content.includes("[REDACTED]"), "Should contain redaction marker");
  });

  it("redacts labeled credentials", async () => {
    appendTurn({
      sessionId: "test-redact-label",
      channel:   "dashboard",
      role:      "assistant",
      content:   'I set api_key="abc123def456ghi789jkl012mno345" for you',
    });
    await __testFlush();
    const turns = await loadTranscript("test-redact-label");
    assert.ok(!turns[0].content.includes("abc123def456ghi789jkl012mno345"));
  });
});

describe("conversationStore — session ID validation (path traversal defense)", () => {
  beforeEach(cleanHistoryDir);
  afterEach(cleanHistoryDir);

  it("rejects session IDs with slashes", async () => {
    appendTurn({ sessionId: "../etc/passwd", channel: "x", role: "user", content: "evil" });
    await __testFlush();
    // No file should have been written
    const turns = await loadTranscript("../etc/passwd");
    assert.equal(turns.length, 0);
  });

  it("rejects session IDs with special characters", async () => {
    appendTurn({ sessionId: "a;b", channel: "x", role: "user", content: "x" });
    await __testFlush();
    const turns = await loadTranscript("a;b");
    assert.equal(turns.length, 0);
  });

  it("accepts alphanumeric + dash + underscore IDs", async () => {
    appendTurn({ sessionId: "abc_123-XYZ", channel: "x", role: "user", content: "good" });
    await __testFlush();
    const turns = await loadTranscript("abc_123-XYZ");
    assert.equal(turns.length, 1);
  });

  it("rejects extremely long session IDs", async () => {
    const longId = "x".repeat(200);
    appendTurn({ sessionId: longId, channel: "x", role: "user", content: "x" });
    await __testFlush();
    const turns = await loadTranscript(longId);
    assert.equal(turns.length, 0);
  });
});

describe("conversationStore — delete (PDPA right to erasure)", () => {
  beforeEach(cleanHistoryDir);
  afterEach(cleanHistoryDir);

  it("removes the session file", async () => {
    appendTurn({ sessionId: "test-del", channel: "x", role: "user", content: "test" });
    await __testFlush();
    assert.equal((await loadTranscript("test-del")).length, 1);

    const result = await deleteSession("test-del");
    assert.equal(result.deleted, true);
    assert.equal((await loadTranscript("test-del")).length, 0);
  });

  it("is idempotent — returns deleted:true even if already gone", async () => {
    const r1 = await deleteSession("never-existed");
    assert.equal(r1.deleted, true);
    const r2 = await deleteSession("never-existed");
    assert.equal(r2.deleted, true);
  });

  it("refuses to delete via malformed session ID (path traversal defense)", async () => {
    const r = await deleteSession("../etc/passwd");
    assert.equal(r.deleted, false);
  });
});

describe("conversationStore — listSessions", () => {
  beforeEach(cleanHistoryDir);
  afterEach(cleanHistoryDir);

  it("returns empty array when no sessions exist", async () => {
    const sessions = await listSessions();
    assert.equal(sessions.length, 0);
  });

  it("includes session metadata and first-user-message preview", async () => {
    appendTurn({ sessionId: "list-test-1", channel: "telegram", role: "user", content: "hello world" });
    appendTurn({ sessionId: "list-test-1", channel: "telegram", role: "assistant", content: "hi" });
    await __testFlush();
    const sessions = await listSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionId, "list-test-1");
    assert.equal(sessions[0].turnCount, 2);
    assert.equal(sessions[0].channel, "telegram");
    assert.ok(sessions[0].preview.includes("hello"));
  });

  it("sorts newest-first by lastSeen", async () => {
    appendTurn({ sessionId: "list-old", channel: "x", role: "user", content: "older" });
    await __testFlush();
    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 10));
    appendTurn({ sessionId: "list-new", channel: "x", role: "user", content: "newer" });
    await __testFlush();
    const sessions = await listSessions();
    assert.equal(sessions[0].sessionId, "list-new");
    assert.equal(sessions[1].sessionId, "list-old");
  });

  it("honors limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      appendTurn({ sessionId: `lim-${i}`, channel: "x", role: "user", content: "x" });
    }
    await __testFlush();
    const sessions = await listSessions(3);
    assert.equal(sessions.length, 3);
  });
});

describe("conversationStore — crash safety", () => {
  beforeEach(cleanHistoryDir);
  afterEach(cleanHistoryDir);

  it("survives a corrupt trailing line (partial write after crash)", async () => {
    await fs.mkdir(HIST_DIR, { recursive: true });
    const file = join(HIST_DIR, "test-corrupt.jsonl");
    // Write 2 valid lines + 1 corrupt partial line
    const validLine1 = JSON.stringify({ ts: "2026-05-19T00:00:00Z", sessionId: "test-corrupt", channel: "x", role: "user", content: "first" });
    const validLine2 = JSON.stringify({ ts: "2026-05-19T00:00:01Z", sessionId: "test-corrupt", channel: "x", role: "assistant", content: "second" });
    await fs.writeFile(file, `${validLine1}\n${validLine2}\n{partial json no closing`, "utf-8");

    const turns = await loadTranscript("test-corrupt");
    assert.equal(turns.length, 2, "Should recover 2 valid lines, skip the partial");
    assert.equal(turns[0].content, "first");
    assert.equal(turns[1].content, "second");
  });

  it("appendTurn never throws on bad inputs", async () => {
    // Invalid session ID, missing fields — none of these should throw
    appendTurn({ sessionId: "", channel: "", role: "user", content: "" });
    appendTurn({ sessionId: "valid", channel: "x", role: "user", content: undefined as any });
    await __testFlush();
    // No assertion — just confirming no exception was raised
  });
});
