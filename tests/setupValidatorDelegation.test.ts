// =============================================================================
// Tests — test_credential delegates to M2 orchestrator pipelines (Phase 3)
//
// telegram / gmail_smtp / google_sa no longer have their own inline
// validators — they run the orchestrator pipeline in testOnly mode
// (detect → validate → test, STOP before save/confirm/live-test).
//
// Strategy: inject a fake pipeline executor via the test seam and assert
//   1. delegation happens with the right integration + mapped credential keys
//      + testOnly:true,
//   2. the tool's legacy return shape ({success, data:{valid, detail, meta,
//      nextStep}}) is preserved for both pass and fail,
//   3. non-pipeline types (ai_provider, waha, agentmail...) do NOT hit the
//      executor,
//   4. testOnlySlice() stops a pipeline at the "test" step (nothing mutating
//      ever runs).
// =============================================================================

import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  testCredentialTool,
  _setPipelineExecutorForTests,
} from "../src/tools/setupValidator.js";
import { testOnlySlice } from "../src/tools/setup.js";
import { telegramPipeline, googlePipeline } from "../src/orchestrator/index.js";

type ExecCall = {
  integration: string;
  credentials: Record<string, unknown> | undefined;
  opts: any;
};

function installFakeExecutor(result: any): ExecCall[] {
  const calls: ExecCall[] = [];
  _setPipelineExecutorForTests(async (integration, credentials, _ctx, opts = {}) => {
    calls.push({ integration, credentials, opts });
    return result;
  });
  return calls;
}

const VALID_TG_TOKEN = "123456789:" + "A".repeat(35);

describe("test_credential — pipeline delegation (Phase 3)", () => {
  afterEach(() => {
    _setPipelineExecutorForTests(null); // restore real executor
  });

  it("telegram → delegates to telegram pipeline with testOnly:true and mapped key", async () => {
    const calls = installFakeExecutor({
      success: true,
      stepReached: "test",
      data: { botUsername: "my_admin_bot" },
    });

    const result: any = await testCredentialTool.call(
      { type: "telegram", credentials: { token: ` ${VALID_TG_TOKEN} ` } } as any,
      {} as any,
    );

    assert.equal(calls.length, 1, "pipeline executor must be invoked exactly once");
    assert.equal(calls[0]!.integration, "telegram");
    assert.equal(calls[0]!.credentials?.telegramToken, VALID_TG_TOKEN, "token mapped + trimmed");
    assert.equal(calls[0]!.opts?.testOnly, true, "must run in testOnly mode (no save)");

    // Legacy return shape preserved
    assert.equal(result.success, true);
    assert.equal(result.data.valid, true);
    assert.match(result.data.detail, /@my_admin_bot/);
    assert.equal(result.data.meta.username, "my_admin_bot");
    assert.match(result.data.nextStep, /save_integration_credentials/);
  });

  it("telegram failure → valid:false with pipeline error + suggestedFix in detail", async () => {
    installFakeExecutor({
      success: false,
      stepReached: "test",
      error: "Telegram rejected the token (401 Unauthorized).",
      suggestedFix: "Generate a new one with @BotFather → /token.",
      doNotRetry: true,
    });

    const result: any = await testCredentialTool.call(
      { type: "telegram", credentials: { token: VALID_TG_TOKEN } } as any,
      {} as any,
    );

    assert.equal(result.success, true); // tool-level contract: success wraps valid flag
    assert.equal(result.data.valid, false);
    assert.match(result.data.detail, /401 Unauthorized/);
    assert.match(result.data.detail, /BotFather/);
    assert.match(result.data.nextStep, /Fix the issue/);
  });

  it("gmail_smtp → delegates to gmail pipeline with gmailUser/gmailPass", async () => {
    const calls = installFakeExecutor({
      success: true,
      stepReached: "test",
      data: { testMode: "smtp" },
    });

    const result: any = await testCredentialTool.call(
      { type: "gmail_smtp", credentials: { user: "a@gmail.com", pass: "abcd efgh ijkl mnop" } } as any,
      {} as any,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.integration, "gmail");
    assert.equal(calls[0]!.credentials?.gmailUser, "a@gmail.com");
    assert.equal(calls[0]!.credentials?.gmailPass, "abcd efgh ijkl mnop");
    assert.equal(calls[0]!.opts?.testOnly, true);
    assert.equal(result.data.valid, true);
    assert.match(result.data.detail, /Gmail SMTP verified for a@gmail\.com/);
  });

  it("gmail_smtp missing pass → input error BEFORE the executor is reached", async () => {
    const calls = installFakeExecutor({ success: true, data: {} });

    const result: any = await testCredentialTool.call(
      { type: "gmail_smtp", credentials: { user: "a@gmail.com" } } as any,
      {} as any,
    );

    assert.equal(result.success, false);
    assert.match(String(result.error), /gmail_smtp requires/);
    assert.equal(calls.length, 0, "executor must not run on missing input");
  });

  it("google_sa → delegates to google_calendar pipeline and surfaces project/account", async () => {
    const sa = {
      type: "service_account",
      project_id: "proj-42",
      client_email: "agent@proj-42.iam.gserviceaccount.com",
      private_key: "---",
      token_uri: "https://oauth2.googleapis.com/token",
    };
    const calls = installFakeExecutor({
      success: true,
      stepReached: "test",
      data: { kind: "service_account", saJson: sa, accessToken: "ya29.fake" },
    });

    const result: any = await testCredentialTool.call(
      { type: "google_sa", credentials: { saKeyJson: JSON.stringify(sa) } } as any,
      {} as any,
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.integration, "google_calendar");
    assert.equal(calls[0]!.credentials?.googleSaKey, JSON.stringify(sa));
    assert.equal(calls[0]!.opts?.testOnly, true);
    assert.equal(result.data.valid, true);
    assert.match(result.data.detail, /proj-42/);
    assert.equal(result.data.meta.projectId, "proj-42");
    assert.equal(result.data.meta.clientEmail, sa.client_email);
    // Never leak the access token into the user-facing meta
    assert.equal(JSON.stringify(result.data.meta).includes("ya29"), false);
  });

  it("non-pipeline type (waha) does NOT call the pipeline executor", async () => {
    const calls = installFakeExecutor({ success: true, data: {} });

    // No url → fails fast on input check, never reaches network or executor.
    const result: any = await testCredentialTool.call(
      { type: "waha", credentials: {} } as any,
      {} as any,
    );

    assert.equal(result.success, false);
    assert.match(String(result.error), /waha requires/);
    assert.equal(calls.length, 0);
  });
});

describe("testOnlySlice — pipelines stop after the test step", () => {
  it("telegram pipeline slice = detect, validate, test (no save/confirm/live-test)", () => {
    const sliced = testOnlySlice(telegramPipeline);
    assert.deepEqual(sliced.steps.map((s: any) => s.name), ["detect", "validate", "test"]);
    // Original pipeline untouched
    assert.equal(telegramPipeline.steps.length, 6);
  });

  it("google pipeline slice = detect, validate, test", () => {
    const sliced = testOnlySlice(googlePipeline);
    assert.deepEqual(sliced.steps.map((s: any) => s.name), ["detect", "validate", "test"]);
    assert.equal(googlePipeline.steps.length, 6);
  });

  it("pipeline without a 'test' step is returned unchanged", () => {
    const p: any = { id: "x", steps: [{ name: "detect" }, { name: "save" }] };
    assert.equal(testOnlySlice(p), p);
  });
});
