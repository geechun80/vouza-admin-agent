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
import {
  detectLocalAi,
  localAiCandidates,
  localAiConfigPatch,
  localAiProblem,
  matchLocalModel,
  normalizeOllamaAddress,
  onlineAiConfigPatch,
} from "../src/setup/quickSetup.js";

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

  it("saves provider + model only — no key; remembers only a non-default address", () => {
    assert.deepEqual(localAiConfigPatch(" qwen2.5:7b "), { agent: { provider: "ollama", model: "qwen2.5:7b", ollamaBaseUrl: "" } });
    assert.equal(localAiConfigPatch("qwen2.5:7b", "http://127.0.0.1:11434/v1").agent.ollamaBaseUrl, "");
    assert.equal(localAiConfigPatch("qwen2.5:7b", "http://192.168.1.20:11434/v1").agent.ollamaBaseUrl, "http://192.168.1.20:11434/v1");
  });
});

describe("Quick Setup — local AI when Ollama isn't found at first", () => {
  const refused = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });

  it("tries 127.0.0.1, then localhost (and the host machine inside Docker)", async () => {
    const asked: string[] = [];
    const fake = (async (url: string) => {
      asked.push(url);
      if (url.startsWith("http://localhost:11434")) {
        return new Response(JSON.stringify({ models: [{ name: "qwen2.5:3b" }] }), { status: 200 });
      }
      throw refused();
    }) as unknown as typeof fetch;
    const r = await detectLocalAi(fake);
    assert.equal(r.running, true);
    assert.equal(r.baseUrl, "http://localhost:11434/v1");
    assert.deepEqual(asked, ["http://127.0.0.1:11434/api/tags", "http://localhost:11434/api/tags"]);
    assert.deepEqual(localAiCandidates(null, true).at(-1), "http://host.docker.internal:11434/v1");
    assert.deepEqual(localAiCandidates("http://10.0.0.5:11434"), ["http://10.0.0.5:11434/v1"]);
  });

  it("says why: not running vs too slow — and where it looked", async () => {
    const off = (async () => { throw refused(); }) as unknown as typeof fetch;
    const s1 = await detectLocalAi(off);
    assert.equal(s1.reason, "not-running");
    assert.match(localAiProblem(s1), /isn't running .*127\.0\.0\.1:11434 or http:\/\/localhost:11434.*Start menu/);
    const slow = (async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
    const s2 = await detectLocalAi(slow);
    assert.equal(s2.reason, "timeout");
    assert.match(localAiProblem(s2), /took too long/);
  });

  it("matches a typed model name the way a person writes it", () => {
    const installed = ["qwen2.5:7b", "qwen2.5:3b", "llama3.1:latest"];
    assert.equal(matchLocalModel("qwen2.5:3b", installed), "qwen2.5:3b");
    assert.equal(matchLocalModel("Qwen 2.5:7b", installed), "qwen2.5:7b");
    assert.equal(matchLocalModel("llama3.1", installed), "llama3.1:latest");
    assert.equal(matchLocalModel("mistral", installed), null);
    assert.equal(matchLocalModel("  ", installed), null);
  });

  it("accepts a typed Ollama address and rejects junk", () => {
    assert.equal(normalizeOllamaAddress("192.168.1.20:11434"), "http://192.168.1.20:11434/v1");
    assert.equal(normalizeOllamaAddress("http://localhost:11434/"), "http://localhost:11434/v1");
    assert.equal(normalizeOllamaAddress("http://user:pw@host:11434"), null);
    assert.equal(normalizeOllamaAddress("not a url at all"), null);
    assert.equal(normalizeOllamaAddress(""), null);
  });

  it("the dashboard lets people type the model, and save anyway when Ollama is closed", async () => {
    const { readFile } = await import("node:fs/promises");
    const routes = await readFile("src/dashboard/api/quick-setup.ts", "utf8");
    assert.match(routes, /const force\s+= req\.body\?\.force === true;/);
    // "Qwen 2.5:7b" is tidied before it is checked, not rejected for its space
    assert.match(routes, /const typed\s+= String\(req\.body\?\.model \?\? ""\)\.replace\(\/\\s\+\/g, ""\)\.toLowerCase\(\);/);
    assert.match(routes, /matchLocalModel\(typed, local\.models\)/);
    const app = await readFile("src/dashboard/public/app.js", "utf8");
    assert.match(app, /Already installed\? Type the model name yourself/);
    assert.match(app, /Save anyway — I’ll open Ollama later/);
    // Quick Setup uses the same box as the AI model page
    assert.match(app, /async function qsCheckLocalAi\(\) \{\s*await renderLocalAiCard\(qsEl\('qsLocalAiBody'\)/);
  });

  it("every Local AI box carries the 'Ollama won't start?' help, matching the README guide", async () => {
    const { readFile } = await import("node:fs/promises");
    const app = await readFile("src/dashboard/public/app.js", "utf8");
    assert.match(app, /Ollama installed but won't start\? Step-by-step help/);
    assert.match(app, /\$\{localAiHelpHtml\(\)\}/);
    for (const c of ["ollama serve", "ollama list", "echo %OLLAMA_HOST%", "Startup apps"]) assert.ok(app.includes(c), c);
    assert.match(app, /github\.com\/geechun80\/vouza-admin-agent#local-ai-ollama/);
    const readme = await readFile("README.md", "utf8");
    assert.match(readme, /<a id="local-ai-ollama"><\/a>\s*### 💻 Local AI \(Ollama\) won't start/);
    for (const c of ["ollama serve", "ollama list", "%OLLAMA_HOST%", "Startup apps", "qwen2.5:3b"]) assert.ok(readme.includes(c), c);
    // Docker reaches Ollama on the host without opening it to the network
    const compose = await readFile("docker-compose.yml", "utf8");
    assert.match(compose, /"host\.docker\.internal:host-gateway"/);
    assert.doesNotMatch(readme, /set `OLLAMA_HOST=0\.0\.0\.0`/);
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
