// =============================================================================
// Network activity log (src/util/netActivity.ts)
//
// Contract: every outgoing connection is listed with its host, a category,
// and why it happened — never the URL path/query (which can carry keys).
// =============================================================================

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  recordNet,
  getNetActivity,
  withTrigger,
  withTriggerGen,
  categorizeHost,
  hostOf,
  installFetchLogger,
  TRIGGER_BACKGROUND,
  __resetNetActivityForTests,
} from "../src/util/netActivity.js";

beforeEach(() => __resetNetActivityForTests());

describe("netActivity", () => {
  it("categorizes the services the agent talks to", () => {
    assert.equal(categorizeHost("openrouter.ai"), "AI model");
    assert.equal(categorizeHost("api.anthropic.com"), "AI model");
    assert.equal(categorizeHost("generativelanguage.googleapis.com"), "AI model");
    assert.equal(categorizeHost("gmail.googleapis.com"), "Google account");
    assert.equal(categorizeHost("imap.gmail.com"), "Email");
    assert.equal(categorizeHost("api.telegram.org"), "Messaging");
    assert.equal(categorizeHost("127.0.0.1"), "This computer");
    assert.equal(categorizeHost("example.org"), "Other");
  });

  it("keeps only the host — never paths or query strings", () => {
    assert.equal(hostOf("https://www.googleapis.com/x?key=SECRET"), "www.googleapis.com");
    assert.equal(hostOf("https://api.telegram.org/bot123:ABC/getMe"), "api.telegram.org");
    assert.equal(hostOf("not a url"), "unknown");
  });

  it("records the reason from the surrounding entry point", async () => {
    recordNet("a.example", "GET");
    await withTrigger("your message (WhatsApp)", async () => {
      await Promise.resolve();
      recordNet("openrouter.ai", "POST");
    });
    const snap = getNetActivity();
    assert.equal(snap.recent[0].trigger, "your message (WhatsApp)");
    assert.equal(snap.recent[1].trigger, TRIGGER_BACKGROUND);
    assert.equal(snap.total, 2);
  });

  it("labels every step of an async generator", async () => {
    async function* gen() {
      await Promise.resolve();
      recordNet("one.example", "GET");
      yield 1;
      recordNet("two.example", "GET");
      yield 2;
    }
    for await (const _ of withTriggerGen("scheduled task", gen())) { /* drain */ }
    assert.deepEqual(getNetActivity().recent.map((e) => e.trigger), ["scheduled task", "scheduled task"]);
  });

  it("totals per host", () => {
    recordNet("api.telegram.org", "POST");
    recordNet("api.telegram.org", "POST");
    const h = getNetActivity().hosts.find((x) => x.host === "api.telegram.org")!;
    assert.equal(h.count, 2);
    assert.equal(h.category, "Messaging");
  });

  it("the fetch wrapper records host + outcome without changing the response", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
    try {
      installFetchLogger();
      const res = await withTrigger("health check", () => fetch("https://openrouter.ai/api/v1/key?x=1"));
      assert.equal(await res.text(), "ok");
      const ev = getNetActivity().recent[0];
      assert.deepEqual([ev.host, ev.trigger, ev.ok, ev.category], ["openrouter.ai", "health check", true, "AI model"]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
