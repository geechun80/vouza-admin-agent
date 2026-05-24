// =============================================================================
// Smoke tests — operator-key fallback in loadConfigFromJson
//
// REGRESSION GUARD for the Aerick bug (2026-05-20):
// The Telegram bot was hitting 401 "Missing Authentication header" because
// the user hadn't entered their own AI key, and the operator's VOUZA_API_KEY
// env var was ONLY applied in src/dashboard/api/chat.ts (Guide Bot path) —
// never in the main agent that powers Telegram/WhatsApp/Email listeners.
//
// These tests lock in the contract: if the operator key is set and the user
// has no own key, the main agent picks up the operator key. If the user has
// pasted their own key, that always takes priority.
// =============================================================================

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "fs";
import { join } from "path";
import { loadConfigFromJson } from "../src/config/loader.js";

const CONFIG_PATH = join(process.cwd(), "data", "config.json");

async function writeConfig(obj: any) {
  await fs.mkdir(join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(obj, null, 2), "utf-8");
}

async function cleanConfig() {
  try { await fs.unlink(CONFIG_PATH); } catch { /* not present is fine */ }
}

// Bare-minimum saved config that the loader will accept
const MINIMAL_SAVED = {
  agent: { name: "TestBot", model: "google/gemini-2.5-flash-lite", provider: "openrouter" },
  channels: {},
  tools: {},
  credentials: {},
  skills: { enabled: [], schedules: {} },
};

describe("loader — operator key fallback (Aerick regression)", () => {
  beforeEach(async () => {
    delete process.env.VOUZA_API_KEY;
    delete process.env.VOUZA_API_PROVIDER;
    delete process.env.VOUZA_API_MODEL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(async () => {
    await cleanConfig();
    delete process.env.VOUZA_API_KEY;
    delete process.env.VOUZA_API_PROVIDER;
    delete process.env.VOUZA_API_MODEL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("applies VOUZA_API_KEY when user has no own AI key", async () => {
    process.env.VOUZA_API_KEY      = "sk-or-v1-test-operator-key";
    process.env.VOUZA_API_PROVIDER = "openrouter";
    process.env.VOUZA_API_MODEL    = "google/gemini-2.5-flash-lite";
    await writeConfig({
      ...MINIMAL_SAVED,
      credentials: {}, // no user key
    });

    const config = await loadConfigFromJson();
    assert.equal(config.provider, "openrouter");
    assert.equal(config.apiKeys.openrouter, "sk-or-v1-test-operator-key");
  });

  it("user's own openrouter key takes priority over operator key", async () => {
    process.env.VOUZA_API_KEY      = "sk-or-v1-OPERATOR-key";
    process.env.VOUZA_API_PROVIDER = "openrouter";
    await writeConfig({
      ...MINIMAL_SAVED,
      credentials: { openrouterApiKey: "sk-or-v1-USER-key" },
    });

    const config = await loadConfigFromJson();
    assert.equal(config.apiKeys.openrouter, "sk-or-v1-USER-key", "User's key must win over operator key");
  });

  it("user's anthropic key wins even when operator is openrouter", async () => {
    process.env.VOUZA_API_KEY      = "sk-or-v1-OPERATOR-key";
    process.env.VOUZA_API_PROVIDER = "openrouter";
    await writeConfig({
      ...MINIMAL_SAVED,
      agent: { name: "TestBot", model: "claude-sonnet-4-6", provider: "anthropic" },
      credentials: { anthropicApiKey: "sk-ant-USER-key" },
    });

    const config = await loadConfigFromJson();
    assert.equal(config.provider, "anthropic", "Provider must remain user's choice when user has a key");
    assert.equal(config.apiKeys.anthropic, "sk-ant-USER-key");
  });

  it("no operator key set → operator fallback is NOT activated (provider not forcibly switched)", async () => {
    // VOUZA_API_KEY explicitly NOT set. Use a saved provider that explicitly
    // differs from the operator default so we can verify the fallback didn't
    // forcibly switch us. Use anthropic with a real-looking user key so the
    // env-based loader doesn't error.
    await writeConfig({
      ...MINIMAL_SAVED,
      agent: { name: "TestBot", model: "claude-sonnet-4-6", provider: "anthropic" },
      credentials: { anthropicApiKey: "sk-ant-USER-anthropic-key" },
    });

    const config = await loadConfigFromJson();
    // Provider must remain user's chosen one (anthropic), NOT forcibly
    // switched to openrouter by an inactive operator fallback path.
    assert.equal(config.provider, "anthropic");
    assert.equal(config.apiKeys.anthropic, "sk-ant-USER-anthropic-key");
  });

  it("operator default model is applied when switching to operator provider", async () => {
    process.env.VOUZA_API_KEY      = "sk-or-v1-OPERATOR-key";
    process.env.VOUZA_API_PROVIDER = "openrouter";
    process.env.VOUZA_API_MODEL    = "google/gemini-2.5-flash-lite";
    await writeConfig({
      ...MINIMAL_SAVED,
      agent: { name: "TestBot", model: "some-stale-model-that-doesnt-exist", provider: "anthropic" },
      credentials: {}, // user has no key for ANY provider
    });

    const config = await loadConfigFromJson();
    assert.equal(config.provider, "openrouter");
    assert.equal(config.model, "google/gemini-2.5-flash-lite",
      "Should use VOUZA_API_MODEL when falling back to operator's openrouter");
  });

  it("operator key with whitespace is trimmed", async () => {
    process.env.VOUZA_API_KEY      = "  sk-or-v1-padded-key  ";
    process.env.VOUZA_API_PROVIDER = "openrouter";
    await writeConfig({
      ...MINIMAL_SAVED,
      credentials: {},
    });

    const config = await loadConfigFromJson();
    assert.equal(config.apiKeys.openrouter, "sk-or-v1-padded-key");
  });
});
