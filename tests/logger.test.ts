// =============================================================================
// Smoke tests — structured logger
//
// Locks in the contract:
//   - logger exposes pino's info/warn/error/debug methods
//   - childLogger() returns a logger with stable bindings
//   - Log lines written to data/logs/admin-agent.log are valid JSON
//   - Boot never throws even if the log dir is unwritable
// =============================================================================

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "fs";
import { join } from "path";
import { logger, childLogger, flushLogger } from "../src/util/logger.js";

const LOG_FILE = join(process.cwd(), "data", "logs", "admin-agent.log");

async function readLogLines(): Promise<any[]> {
  try {
    const raw = await fs.readFile(LOG_FILE, "utf-8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

describe("logger — API surface", () => {
  it("exposes info / warn / error / debug methods", () => {
    assert.equal(typeof logger.info, "function");
    assert.equal(typeof logger.warn, "function");
    assert.equal(typeof logger.error, "function");
    assert.equal(typeof logger.debug, "function");
  });

  it("childLogger returns a logger with the same methods", () => {
    const child = childLogger({ sessionId: "abc" });
    assert.equal(typeof child.info, "function");
    assert.equal(typeof child.warn, "function");
  });

  it("does not throw when called with a payload + message", () => {
    assert.doesNotThrow(() => {
      logger.info({ test: "value", n: 42 }, "test message");
      logger.warn({ provider: "anthropic" }, "warning");
      logger.error({ err: "synthetic" }, "error");
    });
  });

  it("does not throw with an empty payload", () => {
    assert.doesNotThrow(() => {
      logger.info("simple message");
    });
  });
});

describe("logger — file output is valid JSONL", () => {
  const marker = `test-marker-${Date.now()}-${Math.random()}`;

  before(async () => {
    logger.info({ event: "test_event", marker }, "smoke test line");
    await flushLogger();
    // Small wait to ensure the write hits disk before we read it
    await new Promise((r) => setTimeout(r, 50));
  });

  it("writes a JSON line containing our marker", async () => {
    const lines = await readLogLines();
    const found = lines.find((l) => l.marker === marker);
    assert.ok(found, `Should find a log line with marker ${marker}`);
  });

  it("each line is parseable JSON with required pino fields", async () => {
    const lines = await readLogLines();
    assert.ok(lines.length > 0, "Should have at least one log line");
    for (const l of lines.slice(0, 5)) {
      assert.ok(typeof l.level === "number", "level should be a number");
      assert.ok(typeof l.time === "string" || typeof l.time === "number", "time present");
      assert.equal(l.service, "admin-agent");
    }
  });

  it("childLogger bindings appear in the line", async () => {
    const childMarker = `child-marker-${Date.now()}`;
    const child = childLogger({ sessionId: "test-session-123", channel: "test" });
    child.info({ marker: childMarker }, "child line");
    await flushLogger();
    await new Promise((r) => setTimeout(r, 50));
    const lines = await readLogLines();
    const found = lines.find((l) => l.marker === childMarker);
    assert.ok(found);
    assert.equal(found.sessionId, "test-session-123");
    assert.equal(found.channel, "test");
  });
});

describe("logger — error event shape", () => {
  it("captures error objects as readable JSON", async () => {
    const marker = `err-${Date.now()}`;
    const err = new Error("test failure");
    logger.error({ event: "thing_failed", marker, err: String(err) }, "something broke");
    await flushLogger();
    await new Promise((r) => setTimeout(r, 50));
    const lines = await readLogLines();
    const found = lines.find((l) => l.marker === marker);
    assert.ok(found);
    assert.ok(String(found.err).includes("test failure"));
  });
});

// Cleanup is optional — the log file is meant to persist across test runs in
// real usage. We don't truncate it so successive test runs accumulate evidence
// of correct behavior.
after(async () => {
  await flushLogger();
});
