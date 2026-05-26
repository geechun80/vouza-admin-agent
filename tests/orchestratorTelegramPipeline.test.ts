// =============================================================================
// Tests — Telegram pipeline (mocked fetch)
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import pino from "pino";
import { makeTelegramPipeline } from "../src/orchestrator/pipelines/telegram.js";
import { runPipeline } from "../src/orchestrator/runner.js";

const silent = pino({ level: "silent" });
const VALID_TOKEN = "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi";

function fakeFetch(response: { status: number; body: any }): typeof fetch {
  return (async () => ({
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    json: async () => response.body,
  })) as any;
}

function ctx() {
  return { integration: "telegram", logger: silent, config: {} as any };
}

describe("telegram pipeline — happy path", () => {
  it("getMe returns ok=true → pipeline succeeds", async () => {
    let saved = 0;
    let sent = 0;
    const p = makeTelegramPipeline({
      fetch: fakeFetch({
        status: 200,
        body: { ok: true, result: { is_bot: true, username: "VouzaBot" } },
      }),
      saveToken: async () => { saved++; },
      sendMessage: async () => { sent++; },
    });
    const r = await runPipeline(
      p,
      { credentials: { telegramToken: VALID_TOKEN }, chatId: "12345" },
      ctx(),
    );
    assert.equal(r.success, true, r.error ?? "");
    assert.equal(saved, 1);
    assert.equal(sent, 1);
  });
});

describe("telegram pipeline — malformed token", () => {
  it("fails at validate without hitting fetch", async () => {
    let fetched = 0;
    const p = makeTelegramPipeline({
      fetch: (async () => { fetched++; return { status: 200, json: async () => ({}) }; }) as any,
    });
    const r = await runPipeline(
      p,
      { credentials: { telegramToken: "not-a-token" } },
      ctx(),
    );
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "validate");
    assert.equal(r.doNotRetry, true);
    assert.equal(fetched, 0);
  });
});

describe("telegram pipeline — 401 from getMe", () => {
  it("fails at test with auth error and doNotRetry", async () => {
    const p = makeTelegramPipeline({
      fetch: fakeFetch({ status: 401, body: { ok: false, error_code: 401, description: "Unauthorized" } }),
    });
    const r = await runPipeline(
      p,
      { credentials: { telegramToken: VALID_TOKEN } },
      ctx(),
    );
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "test");
    assert.equal(r.doNotRetry, true);
    assert.match(r.error!, /401/);
  });
});

describe("telegram pipeline — 404 (typo in token)", () => {
  it("fails at test with not-found error", async () => {
    const p = makeTelegramPipeline({
      fetch: fakeFetch({ status: 404, body: { ok: false, error_code: 404 } }),
    });
    const r = await runPipeline(
      p,
      { credentials: { telegramToken: VALID_TOKEN } },
      ctx(),
    );
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "test");
    assert.match(r.error!, /404/);
  });
});

describe("telegram pipeline — live-test no-op when chat_id missing", () => {
  it("succeeds without sending a message", async () => {
    let sent = 0;
    const p = makeTelegramPipeline({
      fetch: fakeFetch({
        status: 200,
        body: { ok: true, result: { is_bot: true, username: "B" } },
      }),
      sendMessage: async () => { sent++; },
    });
    const r = await runPipeline(
      p,
      { credentials: { telegramToken: VALID_TOKEN } },
      ctx(),
    );
    assert.equal(r.success, true, r.error ?? "");
    assert.equal(sent, 0);
    assert.match((r.data as any).note ?? "", /chat_id/);
  });
});
