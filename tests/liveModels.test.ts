// =============================================================================
// Live model lists (src/config/liveModels.ts)
//
// Contract: any model a provider offers can be chosen — OpenRouter's public
// catalog with price / context / tool support, other providers' lists via
// the saved key — without non-chat models, with ids validated, and with a
// model outside our short catalog still routed to the right provider.
// =============================================================================

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseOpenRouterCatalog,
  parseProviderModels,
  listOpenRouterModels,
  listProviderModels,
  cachedModelInfo,
  isValidModelId,
  __clearModelCacheForTests,
} from "../src/config/liveModels.js";
import { estimateCost } from "../src/agent/budget.js";

const read = (p: string) => readFile(path.resolve(process.cwd(), p), "utf-8");

const OR_SAMPLE = {
  data: [
    { id: "anthropic/claude-sonnet-4.5", name: "Anthropic: Claude Sonnet 4.5", context_length: 1000000,
      pricing: { prompt: "0.000003", completion: "0.000015" },
      architecture: { input_modalities: ["text", "image"] }, supported_parameters: ["tools", "temperature"] },
    { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Meta: Llama 3.3 70B (free)", context_length: 131072,
      pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "some/creative-writer", name: "Creative Writer", context_length: 32768,
      pricing: { prompt: "0.0000005", completion: "0.0000005" }, architecture: { input_modalities: ["text"] }, supported_parameters: ["temperature"] },
    { id: "openai/text-embedding-3-large", name: "Embeddings", pricing: { prompt: "0", completion: "0" } },
  ],
};

beforeEach(() => __clearModelCacheForTests());

describe("OpenRouter catalog", () => {
  it("maps price per 1M tokens, context, vision, tools and free", () => {
    const models = parseOpenRouterCatalog(OR_SAMPLE);
    const sonnet = models.find((m) => m.id === "anthropic/claude-sonnet-4.5")!;
    assert.deepEqual(sonnet.pricing, { input: 3, output: 15 });
    assert.equal(sonnet.contextWindow, 1000000);
    assert.equal(sonnet.vision, true);
    assert.equal(sonnet.tools, true);
    assert.equal(models.find((m) => m.id.endsWith(":free"))!.free, true);
    assert.equal(models.find((m) => m.id === "some/creative-writer")!.tools, false, "flags models that can't use tools");
  });

  it("leaves out non-chat models", () => {
    assert.equal(parseOpenRouterCatalog(OR_SAMPLE).some((m) => m.id.includes("embedding")), false);
  });

  it("fetches the public list once, then serves the cache", async () => {
    let calls = 0;
    const fake = (async (url: string) => {
      calls++;
      assert.equal(url, "https://openrouter.ai/api/v1/models");
      return new Response(JSON.stringify(OR_SAMPLE), { status: 200 });
    }) as unknown as typeof fetch;
    assert.equal((await listOpenRouterModels(fake)).length, 3);
    await listOpenRouterModels(fake);
    assert.equal(calls, 1);
    assert.deepEqual(cachedModelInfo("anthropic/claude-sonnet-4.5")?.pricing, { input: 3, output: 15 });
  });

  it("cost estimates use live prices for models outside the short catalog", async () => {
    const fake = (async () => new Response(JSON.stringify(OR_SAMPLE), { status: 200 })) as unknown as typeof fetch;
    await listOpenRouterModels(fake);
    assert.equal(estimateCost("anthropic/claude-sonnet-4.5", 1_000_000, 1_000_000), 18);
  });
});

describe("other providers", () => {
  it("OpenAI: keeps chat models, drops speech/image/embedding/realtime", () => {
    const models = parseProviderModels("openai", { data: [
      { id: "gpt-5" }, { id: "gpt-4o-mini" }, { id: "o4-mini" },
      { id: "whisper-1" }, { id: "tts-1" }, { id: "dall-e-3" }, { id: "text-embedding-3-small" },
      { id: "gpt-4o-realtime-preview" }, { id: "gpt-4o-transcribe" }, { id: "omni-moderation-latest" },
    ] });
    assert.deepEqual(models.map((m) => m.id), ["gpt-4o-mini", "gpt-5", "o4-mini"]);
  });

  it("Google: only models that generate content, ids without the models/ prefix", () => {
    const models = parseProviderModels("google", { models: [
      { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", inputTokenLimit: 1048576, supportedGenerationMethods: ["generateContent"] },
      { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
    ] });
    assert.deepEqual(models.map((m) => [m.id, m.name, m.contextWindow]), [["gemini-2.5-pro", "Gemini 2.5 Pro", 1048576]]);
  });

  it("uses the free key-check endpoint and reports a refused key plainly", async () => {
    const seen: string[] = [];
    const ok = (async (url: string) => { seen.push(url); return new Response(JSON.stringify({ data: [{ id: "grok-4" }] })); }) as unknown as typeof fetch;
    assert.deepEqual((await listProviderModels("xai", "xai-key-123456", ok)).map((m) => m.id), ["grok-4"]);
    assert.equal(seen[0], "https://api.x.ai/v1/models");
    const refused = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    __clearModelCacheForTests();
    await assert.rejects(listProviderModels("xai", "bad-key-123456", refused), /refused/);
  });
});

describe("model ids", () => {
  it("accepts real ids", () => {
    for (const id of ["gpt-5", "anthropic/claude-sonnet-4.5", "meta-llama/llama-3.3-70b-instruct:free",
                      "qwen2.5:7b", "models/gemini-2.5-pro", "deepseek-chat", "x-ai/grok-4@latest", "~anthropic/claude-fable-latest"]) {
      assert.equal(isValidModelId(id), true, id);
    }
  });

  it("rejects anything that isn't an id", () => {
    for (const id of ["", " gpt-5", "gpt 5", "<script>", "a\"b", "../../etc", "x".repeat(201), 42 as any]) {
      assert.equal(isValidModelId(id), false, String(id));
    }
  });
});

describe("wiring", () => {
  it("endpoint lists with the SAVED key, never one from the browser", async () => {
    const server = await read("src/dashboard/api/server.ts");
    assert.match(server, /app\.get\("\/api\/models\/live", requireLocalOrigin/);
    assert.match(server, /creds\[`\$\{provider\}ApiKey`\]/);
    assert.match(server, /ids\.some\(\(v\) => !isValidModelId\(v\)\)/);
  });

  it("a model outside the catalog keeps its saved provider", async () => {
    assert.match(await read("src/config/loader.ts"),
      /else if \(saved\.agent\.provider && saved\.agent\.provider in DEFAULT_MODEL_BY_PROVIDER\)/);
  });

  it("the dashboard loads lists only on request and escapes provider text", async () => {
    const app = await read("src/dashboard/public/app.js");
    assert.match(app, /onclick="loadLiveModels\('openrouter'\)"/);
    assert.match(app, /\$\{escHtml\(m\.name\)\}/);
    assert.match(app, /<input class="or-tier-input" list="orModelList"/);
  });
});
