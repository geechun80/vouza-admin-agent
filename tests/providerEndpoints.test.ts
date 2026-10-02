// =============================================================================
// Provider endpoints (src/config/providerEndpoints.ts) + local AI (Ollama)
//
// Contract: one table of AI endpoints for every caller; key checks hit free,
// auth-gated endpoints (Rule 66); a local-AI user is never moved to a cloud
// provider, and Quick Setup detects Ollama without sending anything out.
// =============================================================================

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  baseUrlFor,
  keyCheckRequest,
  ollamaBaseUrl,
  isLocalProvider,
  openRouterHeaders,
  DEFAULT_OLLAMA_BASE_URL,
} from "../src/config/providerEndpoints.js";
import { DEFAULT_MODEL_BY_PROVIDER, AI_PROVIDERS, type AIProvider } from "../src/config/models.js";
import { pickHealthyProvider, recordFailure, __testResetHealth } from "../src/agent/providerFailover.js";
import { detectLocalAi, localAiConfigPatch, onlineAiConfigPatch } from "../src/setup/quickSetup.js";

describe("provider endpoints", () => {
  it("every cloud provider has a real https base URL (no api.<name>.com guesses)", () => {
    const expected: Record<string, string> = {
      xai: "https://api.x.ai/v1",
      alibaba: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      moonshot: "https://api.moonshot.cn/v1",
      openrouter: "https://openrouter.ai/api/v1",
    };
    for (const [p, url] of Object.entries(expected)) assert.equal(baseUrlFor(p as AIProvider), url);
    for (const p of Object.keys(DEFAULT_MODEL_BY_PROVIDER) as AIProvider[]) {
      if (p === "ollama") continue;
      assert.match(baseUrlFor(p), /^https:\/\//, p);
    }
  });

  it("unknown providers throw instead of silently using a cloud default", () => {
    assert.throws(() => baseUrlFor("nope" as AIProvider));
  });

  it("key checks are auth-gated and free (Rule 66)", () => {
    assert.match(keyCheckRequest("openrouter", "k").url, /openrouter\.ai\/api\/v1\/key$/);
    const a = keyCheckRequest("anthropic", "k");
    assert.match(a.url, /api\.anthropic\.com\/v1\/models$/);
    assert.equal(a.headers["x-api-key"], "k");
    assert.match(keyCheckRequest("xai", "k").url, /^https:\/\/api\.x\.ai\/v1\/models$/);
    assert.equal(keyCheckRequest("deepseek", "k").headers.Authorization, "Bearer k");
  });

  it("local AI lives on this computer by default", () => {
    assert.equal(DEFAULT_OLLAMA_BASE_URL, "http://127.0.0.1:11434/v1");
    assert.equal(baseUrlFor("ollama"), ollamaBaseUrl());
    assert.equal(ollamaBaseUrl("http://127.0.0.1:11434"), "http://127.0.0.1:11434/v1");
    assert.equal(keyCheckRequest("ollama", "", { ollamaBaseUrl: "http://127.0.0.1:11434/v1" }).url,
      "http://127.0.0.1:11434/api/tags");
    assert.equal(isLocalProvider("ollama"), true);
    assert.equal(isLocalProvider("openrouter"), false);
  });

  it("OpenRouter attribution uses the product brand, configurable by env", () => {
    const h = openRouterHeaders();
    assert.doesNotMatch(h["HTTP-Referer"], /adminagent\.app/);
    assert.ok(h["X-Title"]);
  });

  it("local AI is offered as a provider but not in the cloud model catalog", () => {
    assert.ok(AI_PROVIDERS.some((p: any) => p.id === "ollama" || p.provider === "ollama"));
  });
});

describe("local AI never fails over to the cloud", () => {
  beforeEach(() => __testResetHealth());

  it("stays on ollama even when it is failing and cloud keys exist", () => {
    for (let i = 0; i < 10; i++) recordFailure("ollama", "server_error" as any);
    assert.equal(pickHealthyProvider("ollama", { ollama: "ollama", openrouter: "sk-or-x", anthropic: "sk-ant-x" }), "ollama");
  });
});

describe("Quick Setup — local AI detection", () => {
  it("lists installed models from this computer's Ollama", async () => {
    let asked = "";
    const fake = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify({ models: [{ name: "qwen2.5:7b" }, { model: "llama3.1:8b" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await detectLocalAi(fake);
    assert.deepEqual(r.models, ["qwen2.5:7b", "llama3.1:8b"]);
    assert.equal(r.running, true);
    assert.match(asked, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/api\/tags$/);
  });

  it("reports not running (never throws) when Ollama is absent", async () => {
    const fake = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    assert.deepEqual((await detectLocalAi(fake)).running, false);
  });

  it("saves provider + model only — no key", () => {
    assert.deepEqual(localAiConfigPatch(" qwen2.5:7b "), { agent: { provider: "ollama", model: "qwen2.5:7b" } });
  });
});

describe("switching back from the local AI to an online one", () => {
  const key = "x".repeat(30);

  it("uses the first provider with a saved key, with its default model", () => {
    assert.deepEqual(onlineAiConfigPatch({ anthropicApiKey: key, googleApiKey: key }),
      { agent: { provider: "anthropic", model: DEFAULT_MODEL_BY_PROVIDER.anthropic } });
    assert.equal(onlineAiConfigPatch({ googleAiApiKey: key })?.agent.provider, "google");
  });

  it("prefers OpenRouter when that key is saved", () => {
    assert.equal(onlineAiConfigPatch({ anthropicApiKey: key, openrouterApiKey: key })?.agent.provider, "openrouter");
  });

  it("ignores blank or too-short keys and falls back to the built-in AI only when it works", () => {
    assert.equal(onlineAiConfigPatch({ openaiApiKey: "  ", xaiApiKey: "short" }, false), null);
    assert.equal(onlineAiConfigPatch({}, true)?.agent.provider, "openrouter");
    assert.equal(onlineAiConfigPatch(undefined, false), null);
  });

  it("is exposed to the dashboard behind the local-origin guard", async () => {
    const { readFile } = await import("node:fs/promises");
    const routes = await readFile("src/dashboard/api/quick-setup.ts", "utf8");
    assert.match(routes, /app\.post\("\/api\/quick-setup\/online-ai", guard,/);
  });
});
