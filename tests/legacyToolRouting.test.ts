// =============================================================================
// Tests — save_integration_credentials backward-compat routing
//
// Goal: prove that when the LLM picks the legacy tool for a pipeline-supported
// integration, the call is silently routed through the same self-healing
// pipeline as run_integration_pipeline. For non-pipeline integrations, the
// legacy direct-save path is preserved.
//
// Strategy: call the tool's .call() directly with credentials guaranteed to
// fail deterministically at a known pipeline step. If the response has a
// `stepReached` field, we know it went through the pipeline runner; if not,
// it took the legacy direct-save path.
// =============================================================================

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import path from "path";
import { mkdir, writeFile, rm, readFile } from "fs/promises";
import { existsSync } from "fs";
import { saveIntegrationCredentialsTool } from "../src/tools/setup.js";

// Pipeline routing returns this shape (success/error/stepReached/doNotRetry).
// Legacy direct-save returns { success, data?, error? } with NO stepReached.
function wentThroughPipeline(result: any): boolean {
  return Object.prototype.hasOwnProperty.call(result, "stepReached")
      || Object.prototype.hasOwnProperty.call(result, "suggestedFix")
      || Object.prototype.hasOwnProperty.call(result, "doNotRetry");
}

const DATA_DIR    = path.resolve(process.cwd(), "data");
const CONFIG_PATH = path.resolve(DATA_DIR, "config.json");
let configBackup: string | null = null;

describe("save_integration_credentials — legacy tool routing", () => {
  before(async () => {
    // Snapshot any existing config so the test doesn't trample real data.
    if (existsSync(CONFIG_PATH)) {
      configBackup = await readFile(CONFIG_PATH, "utf-8");
    } else {
      await mkdir(DATA_DIR, { recursive: true });
    }
    // Start from a clean slate so legacy direct-save paths can write freely.
    await writeFile(CONFIG_PATH, JSON.stringify({}), "utf-8");
  });

  after(async () => {
    if (configBackup !== null) {
      await writeFile(CONFIG_PATH, configBackup, "utf-8");
    } else if (existsSync(CONFIG_PATH)) {
      await rm(CONFIG_PATH);
    }
  });

  it("integration 'gmail' with empty creds → routed to pipeline (detect fails)", async () => {
    const result: any = await saveIntegrationCredentialsTool.call(
      { integration: "gmail" as any, credentials: {} },
      {} as any,
    );
    assert.equal(wentThroughPipeline(result), true,
      "expected pipeline shape (stepReached/suggestedFix/doNotRetry)");
    assert.equal(result.success, false);
    assert.equal(result.stepReached, "detect");
    assert.equal(result.doNotRetry, true);
  });

  it("integration 'Gmail' (different case) → canonicalizes, routes to pipeline", async () => {
    const result: any = await saveIntegrationCredentialsTool.call(
      { integration: "Gmail" as any, credentials: {} },
      {} as any,
    );
    assert.equal(wentThroughPipeline(result), true);
    assert.equal(result.success, false);
    assert.equal(result.stepReached, "detect");
  });

  it("integration 'google cal' (alias) → routes to google_calendar pipeline", async () => {
    const result: any = await saveIntegrationCredentialsTool.call(
      { integration: "google cal" as any, credentials: {} },
      {} as any,
    );
    assert.equal(wentThroughPipeline(result), true);
    assert.equal(result.success, false);
    // Google pipeline's detect step is what runs for both gmail & calendar.
    assert.equal(result.stepReached, "detect");
  });

  it("integration 'telegram' with malformed token → routes to telegram pipeline", async () => {
    const result: any = await saveIntegrationCredentialsTool.call(
      { integration: "telegram" as any, credentials: { telegramToken: "not-a-token" } },
      {} as any,
    );
    assert.equal(wentThroughPipeline(result), true);
    assert.equal(result.success, false);
    // Telegram pipeline fails at validate for malformed tokens.
    assert.equal(result.stepReached, "validate");
    assert.equal(result.doNotRetry, true);
  });

  it("integration 'slack' (no pipeline) → falls through to legacy direct-save", async () => {
    // slack is in the enum but has no pipeline → original switch case runs.
    // Without slackToken it returns the legacy { success: false, error } shape
    // with NO stepReached/suggestedFix — proving the pipeline was bypassed.
    const result: any = await saveIntegrationCredentialsTool.call(
      { integration: "slack" as any, credentials: {} },
      {} as any,
    );
    assert.equal(result.success, false);
    assert.equal(wentThroughPipeline(result), false,
      "slack should take the legacy direct-save path, not the pipeline");
    assert.match(result.error, /slackToken/);
  });

  it("integration 'agentmail' (unknown, no canonical mapping) → falls through to legacy", async () => {
    // canonicalizeIntegrationName('agentmail') → null, so routing is skipped
    // and the legacy switch handles it (hits the default branch).
    const result: any = await saveIntegrationCredentialsTool.call(
      { integration: "agentmail" as any, credentials: {} },
      {} as any,
    );
    assert.equal(result.success, false);
    assert.equal(wentThroughPipeline(result), false);
    assert.match(result.error, /Unknown integration/i);
  });

  it("integration 'ai_provider' (no pipeline) → legacy direct-save preserved", async () => {
    const result: any = await saveIntegrationCredentialsTool.call(
      { integration: "ai_provider" as any, credentials: {} },
      {} as any,
    );
    assert.equal(result.success, false);
    assert.equal(wentThroughPipeline(result), false);
    assert.match(result.error, /provider.+apiKey/);
  });
});
