// =============================================================================
// Tests — orchestrator/runner.ts
//
// Note on filename: the spec called for tests/orchestrator/runner.test.ts but
// package.json's "test" script globs tests/*.test.ts (flat, no recursion).
// Flattened the names rather than expand the glob to avoid touching the test
// runner config.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { runPipeline } from "../src/orchestrator/runner.js";
import type { Pipeline, Step, OrchestratorContext } from "../src/orchestrator/types.js";
import pino from "pino";

// Silent logger so test output stays clean.
const silentLogger = pino({ level: "silent" });

function ctx(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return {
    integration: "test",
    logger: silentLogger,
    ...overrides,
  };
}

function okStep(name: string, value: any = {}): Step {
  return { name, async run() { return { ok: true, value }; } };
}
function failStep(name: string, error: string, opts: { doNotRetry?: boolean } = {}): Step {
  return {
    name,
    async run() {
      return { ok: false, error, doNotRetry: opts.doNotRetry };
    },
  };
}

describe("orchestrator runner — happy path", () => {
  it("runs all steps and returns success", async () => {
    const pipeline: Pipeline = {
      id: "test",
      steps: [
        okStep("detect", { detected: true }),
        okStep("validate"),
        okStep("test"),
        okStep("save"),
        okStep("confirm"),
        okStep("live-test", { liveTested: true }),
      ],
    };
    const r = await runPipeline(pipeline, {}, ctx());
    assert.equal(r.success, true);
    assert.equal(r.stepReached, "live-test");
    assert.equal((r.data as any).detected, true);
    assert.equal((r.data as any).liveTested, true);
    assert.equal(r.attempts.length, 6);
  });
});

describe("orchestrator runner — failure modes", () => {
  it("halts at validate with no save side effect", async () => {
    let saveCalled = false;
    const pipeline: Pipeline = {
      id: "test",
      steps: [
        okStep("detect"),
        failStep("validate", "bad cred", { doNotRetry: true }),
        {
          name: "save",
          async run() { saveCalled = true; return { ok: true, value: {} }; },
        },
      ],
    };
    const r = await runPipeline(pipeline, {}, ctx());
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "validate");
    assert.equal(saveCalled, false);
    assert.equal(r.doNotRetry, true);
  });

  it("test fails, first fallback succeeds → success with single save", async () => {
    let saveCalls = 0;
    const test: Step = {
      name: "test",
      async run() { return { ok: false, error: "transient" }; },
      fallbacks: [okStep("test (retry)", { recovered: true })],
    };
    const pipeline: Pipeline = {
      id: "test",
      steps: [
        okStep("detect"),
        okStep("validate"),
        test,
        { name: "save", async run() { saveCalls++; return { ok: true, value: {} }; } },
        okStep("confirm"),
        okStep("live-test"),
      ],
    };
    const r = await runPipeline(pipeline, {}, ctx());
    assert.equal(r.success, true);
    assert.equal(saveCalls, 1);
    // Two attempts logged for the test step (primary + fallback)
    const testAttempts = r.attempts.filter((a) => a.step.startsWith("test"));
    assert.equal(testAttempts.length, 2);
  });

  it("test fails after all fallbacks → clean error at test", async () => {
    const test: Step = {
      name: "test",
      async run() { return { ok: false, error: "primary failed" }; },
      fallbacks: [
        { name: "test (fb)", async run() { return { ok: false, error: "fb failed" }; } },
      ],
    };
    const pipeline: Pipeline = {
      id: "test",
      steps: [okStep("detect"), okStep("validate"), test, okStep("save")],
    };
    const r = await runPipeline(pipeline, {}, ctx());
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "test");
    assert.match(r.error!, /fb failed/);
  });

  it("save fails → live-test never runs", async () => {
    let liveTestCalled = false;
    const pipeline: Pipeline = {
      id: "test",
      steps: [
        okStep("detect"),
        okStep("validate"),
        okStep("test"),
        failStep("save", "disk full"),
        { name: "live-test", async run() { liveTestCalled = true; return { ok: true, value: {} }; } },
      ],
    };
    const r = await runPipeline(pipeline, {}, ctx());
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "save");
    assert.equal(liveTestCalled, false);
  });
});

describe("orchestrator runner — idempotency", () => {
  it("same input run twice → both succeed, save runs once per invocation", async () => {
    let saveCalls = 0;
    let liveTestCalls = 0;
    const pipeline: Pipeline = {
      id: "idem",
      steps: [
        okStep("detect"),
        okStep("validate"),
        okStep("test"),
        { name: "save", async run() { saveCalls++; return { ok: true, value: {} }; } },
        okStep("confirm"),
        { name: "live-test", async run() { liveTestCalls++; return { ok: true, value: {} }; } },
      ],
    };
    const r1 = await runPipeline(pipeline, { x: 1 }, ctx());
    const r2 = await runPipeline(pipeline, { x: 1 }, ctx());
    assert.equal(r1.success, true);
    assert.equal(r2.success, true);
    // Each invocation triggers exactly one save + one live-test — runner does
    // not double-fire within a single invocation.
    assert.equal(saveCalls, 2);
    assert.equal(liveTestCalls, 2);
  });
});

describe("orchestrator runner — timeouts", () => {
  it("step that hangs past timeout fails with timeout error", async () => {
    const pipeline: Pipeline = {
      id: "test",
      steps: [
        {
          name: "slow",
          async run() {
            await new Promise((r) => {
              const t = setTimeout(r, 200);
              if (typeof t.unref === "function") t.unref();
            });
            return { ok: true, value: {} };
          },
        },
      ],
    };
    const r = await runPipeline(pipeline, {}, ctx({ stepTimeoutMs: 50 }));
    assert.equal(r.success, false);
    assert.match(r.error!, /timed out/);
  });

  it("hanging fallback does not block the next fallback", async () => {
    const step: Step = {
      name: "main",
      async run() { return { ok: false, error: "primary" }; },
      fallbacks: [
        {
          name: "main (hanging fb)",
          async run() {
            await new Promise((r) => {
              const t = setTimeout(r, 500);
              if (typeof t.unref === "function") t.unref();
            });
            return { ok: true, value: { fromFb1: true } };
          },
        },
        { name: "main (quick fb)", async run() { return { ok: true, value: { fromFb2: true } }; } },
      ],
    };
    const pipeline: Pipeline = { id: "fb-timeout", steps: [step] };
    const r = await runPipeline(pipeline, {}, ctx({ stepTimeoutMs: 60 }));
    assert.equal(r.success, true);
    assert.equal((r.data as any).fromFb2, true);
  });
});

describe("orchestrator runner — flags & logging", () => {
  it("doNotRetry skips fallbacks", async () => {
    let fbRan = false;
    const step: Step = {
      name: "x",
      async run() { return { ok: false, error: "user error", doNotRetry: true }; },
      fallbacks: [
        { name: "x (fb)", async run() { fbRan = true; return { ok: true, value: {} }; } },
      ],
    };
    const r = await runPipeline({ id: "p", steps: [step] }, {}, ctx());
    assert.equal(r.success, false);
    assert.equal(r.doNotRetry, true);
    assert.equal(fbRan, false);
  });

  it("attempts log spans all steps and fallbacks", async () => {
    const pipeline: Pipeline = {
      id: "log",
      steps: [
        okStep("a"),
        {
          name: "b",
          async run() { return { ok: false, error: "first" }; },
          fallbacks: [okStep("b (fb)")],
        },
        okStep("c"),
      ],
    };
    const r = await runPipeline(pipeline, {}, ctx());
    assert.equal(r.success, true);
    const stepNames = r.attempts.map((a) => a.step);
    assert.deepEqual(stepNames, ["a", "b", "b (fb)", "c"]);
    assert.equal(r.attempts[1]?.ok, false);
    assert.equal(r.attempts[2]?.ok, true);
  });
});

describe("orchestrator runner — credential edge cases (real pipeline shape)", () => {
  it("detect mismatch — OAuth client when SA expected → fail fast", async () => {
    // Mimic the real Google pipeline detect step behavior on an OAuth file.
    const detect: Step = {
      name: "detect",
      async run(input: any) {
        const c = input?.credentials ?? {};
        if (c.googleSaKey && typeof c.googleSaKey === "object" && (c.googleSaKey.installed || c.googleSaKey.web)) {
          return {
            ok: false,
            error: "This is an OAuth Client ID file, not a Service Account key.",
            suggestedFix: "Use a Service Account JSON.",
            doNotRetry: true,
          };
        }
        return { ok: true, value: {} };
      },
    };
    const r = await runPipeline(
      { id: "g", steps: [detect, okStep("validate")] },
      { credentials: { googleSaKey: { installed: { client_id: "x" } } } },
      ctx(),
    );
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "detect");
    assert.equal(r.doNotRetry, true);
  });

  it("empty credentials → fail at detect", async () => {
    const detect: Step = {
      name: "detect",
      async run(input: any) {
        const c = input?.credentials ?? {};
        if (Object.keys(c).length === 0) {
          return { ok: false, error: "no credentials provided", doNotRetry: true };
        }
        return { ok: true, value: {} };
      },
    };
    const r = await runPipeline(
      { id: "g", steps: [detect, okStep("validate")] },
      { credentials: {} },
      ctx(),
    );
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "detect");
    assert.match(r.error!, /no credentials/);
  });
});
