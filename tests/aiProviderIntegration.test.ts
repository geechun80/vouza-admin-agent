// =============================================================================
// Tests for the AI Provider Integration adapter
//
// This is the MOST important integration — every user message goes through
// the AI provider. Tests must lock in:
//   - Correct provider→URL+headers mapping for each provider
//   - Operator-key fallback (loader.ts mirror)
//   - HTTP status → errorCategory mapping
//   - Key masking
// =============================================================================

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { AIProviderIntegration } from "../src/integrations/aiProviderIntegration.js";

const originalFetch = globalThis.fetch;

function makeCtx(provider: string, apiKey: string | undefined) {
  return {
    config: {
      provider,
      apiKeys: { [provider]: apiKey || "" },
    },
  } as any;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.VOUZA_API_KEY;
  delete process.env.VOUZA_API_PROVIDER;
});

describe("AIProviderIntegration — basic contract", () => {
  it("is always enabled (AI is mandatory)", () => {
    const ai = new AIProviderIntegration(() => makeCtx("anthropic", ""));
    assert.equal(ai.isEnabled(), true);
  });

  it("id + displayName + category", () => {
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", "sk-or"));
    assert.equal(ai.id, "ai-provider");
    assert.equal(ai.category, "ai");
  });
});

describe("AIProviderIntegration — key resolution + fallback", () => {
  it("uses user's key when present", async () => {
    let capturedHeaders: any = {};
    globalThis.fetch = (async (_url: any, opts: any) => {
      capturedHeaders = opts.headers;
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as any;
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", "sk-or-USER-KEY-12345"));
    const probe = await ai.probe();
    assert.equal(probe.ok, true);
    assert.equal(capturedHeaders["Authorization"], "Bearer sk-or-USER-KEY-12345");
    assert.equal(ai.getActiveKeySource(), "user");
  });

  it("falls back to VOUZA_API_KEY when no user key is set", async () => {
    process.env.VOUZA_API_KEY = "sk-or-OPERATOR-KEY-12345";
    process.env.VOUZA_API_PROVIDER = "openrouter";
    let capturedHeaders: any = {};
    globalThis.fetch = (async (_url: any, opts: any) => {
      capturedHeaders = opts.headers;
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as any;
    const ai = new AIProviderIntegration(() => makeCtx("anthropic", undefined));
    const probe = await ai.probe();
    assert.equal(probe.ok, true);
    assert.equal(capturedHeaders["Authorization"], "Bearer sk-or-OPERATOR-KEY-12345");
    assert.equal(ai.getActiveKeySource(), "operator");
    assert.equal(ai.getActiveProvider(), "openrouter");
  });

  it("no user key and no operator key → fails with config error", async () => {
    const ai = new AIProviderIntegration(() => makeCtx("anthropic", undefined));
    const probe = await ai.probe();
    assert.equal(probe.ok, false);
    assert.equal(probe.errorCategory, "config");
    assert.match(probe.detail || "", /No API key/);
    assert.equal(ai.getActiveKeySource(), "missing");
  });
});

describe("AIProviderIntegration — provider-specific URL + headers", () => {
  it("anthropic uses x-api-key header", async () => {
    let capturedUrl = "";
    let capturedHeaders: any = {};
    globalThis.fetch = (async (url: any, opts: any) => {
      capturedUrl = String(url);
      capturedHeaders = opts.headers;
      return new Response("[]", { status: 200 });
    }) as any;
    const ai = new AIProviderIntegration(() => makeCtx("anthropic", "sk-ant-test"));
    await ai.probe();
    assert.match(capturedUrl, /api\.anthropic\.com/);
    assert.equal(capturedHeaders["x-api-key"], "sk-ant-test");
    assert.equal(capturedHeaders["anthropic-version"], "2023-06-01");
  });

  it("google uses key in query string, no auth header", async () => {
    let capturedUrl = "";
    let capturedHeaders: any = {};
    globalThis.fetch = (async (url: any, opts: any) => {
      capturedUrl = String(url);
      capturedHeaders = opts.headers;
      return new Response("[]", { status: 200 });
    }) as any;
    const ai = new AIProviderIntegration(() => makeCtx("google", "AIza-test"));
    await ai.probe();
    assert.match(capturedUrl, /generativelanguage\.googleapis\.com.*key=AIza-test/);
    assert.ok(!capturedHeaders["Authorization"], "Google must NOT use Authorization header");
  });

  it("openai uses Bearer header", async () => {
    let capturedHeaders: any = {};
    globalThis.fetch = (async (_url: any, opts: any) => {
      capturedHeaders = opts.headers;
      return new Response("[]", { status: 200 });
    }) as any;
    const ai = new AIProviderIntegration(() => makeCtx("openai", "sk-test"));
    await ai.probe();
    assert.equal(capturedHeaders["Authorization"], "Bearer sk-test");
  });

  it("openrouter uses Bearer header against openrouter.ai", async () => {
    let capturedUrl = "";
    let capturedHeaders: any = {};
    globalThis.fetch = (async (url: any, opts: any) => {
      capturedUrl = String(url);
      capturedHeaders = opts.headers;
      return new Response("[]", { status: 200 });
    }) as any;
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", "sk-or-test"));
    await ai.probe();
    assert.match(capturedUrl, /openrouter\.ai\/api\/v1\/models/);
    assert.equal(capturedHeaders["Authorization"], "Bearer sk-or-test");
  });
});

describe("AIProviderIntegration — error category mapping", () => {
  it("401 → auth", async () => {
    globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as any;
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", "bad-key"));
    const probe = await ai.probe();
    assert.equal(probe.errorCategory, "auth");
  });

  it("402 → quota", async () => {
    globalThis.fetch = (async () => new Response("Payment Required", { status: 402 })) as any;
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", "any-key"));
    const probe = await ai.probe();
    assert.equal(probe.errorCategory, "quota");
  });

  it("429 → rate_limit", async () => {
    globalThis.fetch = (async () => new Response("Rate Limited", { status: 429 })) as any;
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", "any-key"));
    const probe = await ai.probe();
    assert.equal(probe.errorCategory, "rate_limit");
  });

  it("500 → network", async () => {
    globalThis.fetch = (async () => new Response("Server Error", { status: 500 })) as any;
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", "any-key"));
    const probe = await ai.probe();
    assert.equal(probe.errorCategory, "network");
  });

  it("fetch throws → network", async () => {
    globalThis.fetch = (async () => { throw new Error("ENETUNREACH"); }) as any;
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", "any-key"));
    const probe = await ai.probe();
    assert.equal(probe.errorCategory, "network");
    assert.match(probe.detail || "", /ENETUNREACH/);
  });

  it("success includes model count when response is JSON with data array", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      data: [{ id: "m1" }, { id: "m2" }, { id: "m3" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as any;
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", "good"));
    const probe = await ai.probe();
    assert.equal(probe.ok, true);
    assert.match(probe.detail || "", /3 models/);
  });
});

describe("AIProviderIntegration — credential preview masking", () => {
  it("masks the key in probe.credentialPreview", async () => {
    globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as any;
    const key = "sk-or-v1-1234567890abcdefghijklmnop";
    const ai = new AIProviderIntegration(() => makeCtx("openrouter", key));
    const probe = await ai.probe();
    assert.ok(probe.credentialPreview);
    assert.ok(!probe.credentialPreview!.includes(key), "raw key must not leak");
    // First 8 + last 4 chars retained
    assert.match(probe.credentialPreview!, /^.{8}….{4}$/);
  });
});
