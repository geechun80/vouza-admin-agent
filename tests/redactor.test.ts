// =============================================================================
// Smoke tests — redactor.ts
//
// These tests guarantee that the secret-redaction patterns continue to catch
// API keys before they hit disk. If a pattern regresses, customers' keys could
// leak into ./data/memory or ./data/skills — a critical privacy issue.
//
// Run with:  npm test
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { redact, redactObject, containsSecret } from "../src/agent/redactor.js";

describe("redactor — API key patterns", () => {
  it("redacts Anthropic keys (sk-ant-...)", () => {
    const key = "sk-ant-" + "a".repeat(95);
    const text = `My key is ${key} please don't leak it`;
    const out = redact(text);
    assert.ok(!out.includes(key), "Anthropic key should be redacted");
    assert.ok(out.includes("[REDACTED]"), "Should contain redaction label");
  });

  it("redacts OpenAI keys (sk-...)", () => {
    const key = "sk-" + "B".repeat(50);
    const out = redact(`use ${key} today`);
    assert.ok(!out.includes(key));
  });

  it("redacts Google AI keys (AIza...)", () => {
    const key = "AIza" + "1".repeat(35);
    const out = redact(`google: ${key}`);
    assert.ok(!out.includes(key));
  });

  it("redacts Groq keys (gsk_...)", () => {
    const key = "gsk_" + "x".repeat(52);
    const out = redact(`token=${key}`);
    assert.ok(!out.includes(key));
  });

  it("redacts Telegram bot tokens", () => {
    const token = "1234567890:" + "A".repeat(35);
    const out = redact(`bot ${token} active`);
    assert.ok(!out.includes(token));
  });

  it("redacts GitHub PATs", () => {
    const key = "ghp_" + "x".repeat(36);
    const out = redact(`git push with ${key}`);
    assert.ok(!out.includes(key));
  });

  it("redacts Bearer tokens", () => {
    const out = redact("Authorization: Bearer abc123def456ghi789jkl012");
    assert.ok(!out.includes("abc123def456ghi789jkl012"));
  });
});

describe("redactor — label-proximity patterns", () => {
  it("redacts api_key=... assignments", () => {
    const out = redact('api_key="abc123def456ghi789jkl012mno345"');
    assert.ok(out.includes("[REDACTED]"));
    assert.ok(!out.includes("abc123def456ghi789jkl012mno345"));
  });

  it("redacts password: ... assignments", () => {
    const out = redact("password: hunter2hunter2hunter2hunter2");
    assert.ok(out.includes("[REDACTED]"));
  });
});

describe("redactor — safety guarantees", () => {
  it("leaves non-secret text untouched", () => {
    const text = "Hello world, this is a normal message about cats.";
    assert.equal(redact(text), text);
  });

  it("handles empty input", () => {
    assert.equal(redact(""), "");
  });

  it("handles undefined gracefully (returns falsy)", () => {
    // @ts-expect-error — testing defensive behavior
    assert.equal(redact(undefined), undefined);
  });

  it("redacts inside nested objects", () => {
    const obj = {
      name: "test",
      config: { apiKey: "sk-ant-" + "a".repeat(95) },
      list: ["safe", "Bearer " + "x".repeat(30)],
    };
    const out = redactObject(obj) as any;
    assert.equal(out.name, "test");
    assert.ok(!JSON.stringify(out).includes("sk-ant-a"));
    assert.ok(!out.list[1].includes("x".repeat(30)));
  });

  it("containsSecret returns true for keys, false for safe text", () => {
    assert.equal(containsSecret("sk-ant-" + "a".repeat(95)), true);
    assert.equal(containsSecret("Hello, world"), false);
  });
});
