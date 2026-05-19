// =============================================================================
// Smoke tests — providerFailover.ts
//
// Locks in the circuit-breaker / failover contract:
//   - Single configured key → no failover, primary always picked
//   - Multiple keys + primary failing → fallback engaged
//   - Circuit auto-recovers after cooldown
//   - Picker excludes already-tried providers
//   - Non-health errors (context_len, not_found) don't trip the breaker
// =============================================================================

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  recordFailure,
  recordSuccess,
  pickHealthyProvider,
  isCircuitOpen,
  getDefaultModelFor,
  getHealthSnapshot,
  __testResetHealth,
  __testConstants,
} from "../src/agent/providerFailover.js";

const { FAILURE_THRESHOLD } = __testConstants;

describe("providerFailover — picker: single key", () => {
  beforeEach(() => __testResetHealth());

  it("returns the primary when only the primary has a key", () => {
    const pick = pickHealthyProvider("anthropic", { anthropic: "sk-ant-xxx" });
    assert.equal(pick, "anthropic");
  });

  it("returns the primary even after circuit opens (nothing else available)", () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure("anthropic", "transient");
    assert.equal(isCircuitOpen("anthropic"), true);
    // No other keys → must still return preferred
    const pick = pickHealthyProvider("anthropic", { anthropic: "sk-ant-xxx" });
    assert.equal(pick, "anthropic");
  });
});

describe("providerFailover — picker: multiple keys", () => {
  beforeEach(() => __testResetHealth());

  const keys = {
    anthropic: "sk-ant-xxx",
    openai:    "sk-xxx",
    google:    "AIza-xxx",
  };

  it("prefers user's primary when healthy", () => {
    const pick = pickHealthyProvider("openai", keys);
    assert.equal(pick, "openai");
  });

  it("switches to another healthy provider when primary's circuit is open", () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure("anthropic", "transient");
    const pick = pickHealthyProvider("anthropic", keys);
    assert.notEqual(pick, "anthropic");
    // Must be a provider with a key
    assert.ok(keys[pick as keyof typeof keys] !== undefined);
  });

  it("respects exclude list — won't return already-tried providers", () => {
    const pick = pickHealthyProvider("anthropic", keys, ["anthropic", "openai"]);
    assert.equal(pick, "google");
  });

  it("returns preferred even if excluded when nothing else is available", () => {
    const pick = pickHealthyProvider("anthropic", { anthropic: "sk-ant-xxx" }, ["anthropic"]);
    assert.equal(pick, "anthropic");
  });

  it("skips providers without an API key configured", () => {
    const pick = pickHealthyProvider("anthropic", { anthropic: "sk-ant-xxx", openai: "" });
    assert.equal(pick, "anthropic");
  });
});

describe("providerFailover — circuit breaker", () => {
  beforeEach(() => __testResetHealth());

  it("opens after FAILURE_THRESHOLD failures within the window", () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      recordFailure("anthropic", "transient");
      assert.equal(isCircuitOpen("anthropic"), false);
    }
    recordFailure("anthropic", "transient");
    assert.equal(isCircuitOpen("anthropic"), true);
  });

  it("closes after a single success", () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure("anthropic", "transient");
    assert.equal(isCircuitOpen("anthropic"), true);
    recordSuccess("anthropic");
    assert.equal(isCircuitOpen("anthropic"), false);
  });

  it("does NOT trip on context_len errors (user's fault, not provider health)", () => {
    for (let i = 0; i < FAILURE_THRESHOLD * 2; i++) {
      recordFailure("anthropic", "context_len");
    }
    assert.equal(isCircuitOpen("anthropic"), false);
  });

  it("does NOT trip on not_found errors (wrong model selection)", () => {
    for (let i = 0; i < FAILURE_THRESHOLD * 2; i++) {
      recordFailure("anthropic", "not_found");
    }
    assert.equal(isCircuitOpen("anthropic"), false);
  });

  it("trips on auth errors (treat as provider unavailable for this user)", () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure("anthropic", "auth");
    assert.equal(isCircuitOpen("anthropic"), true);
  });

  it("trips on quota errors", () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure("anthropic", "quota");
    assert.equal(isCircuitOpen("anthropic"), true);
  });

  it("trips on rate_limit errors", () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure("anthropic", "rate_limit");
    assert.equal(isCircuitOpen("anthropic"), true);
  });
});

describe("providerFailover — defaults", () => {
  it("returns a non-empty default model for every supported provider", () => {
    const providers = ["anthropic", "openai", "google", "xai", "deepseek", "alibaba", "moonshot", "openrouter"] as const;
    for (const p of providers) {
      const model = getDefaultModelFor(p as any);
      assert.ok(model.length > 0, `${p} should have a default model`);
    }
  });

  it("anthropic default model is a Claude model", () => {
    assert.ok(getDefaultModelFor("anthropic").startsWith("claude"));
  });

  it("openai default model is a GPT model", () => {
    assert.ok(getDefaultModelFor("openai").startsWith("gpt"));
  });
});

describe("providerFailover — health snapshot", () => {
  beforeEach(() => __testResetHealth());

  it("returns empty for providers that haven't been touched", () => {
    const snap = getHealthSnapshot();
    assert.equal(Object.keys(snap).length, 0);
  });

  it("reflects recorded failures", () => {
    recordFailure("anthropic", "transient");
    const snap = getHealthSnapshot();
    assert.equal(snap.anthropic.failuresInWindow, 1);
    assert.equal(snap.anthropic.circuitOpen, false);
  });

  it("reports circuit open after threshold reached", () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure("anthropic", "transient");
    const snap = getHealthSnapshot();
    assert.equal(snap.anthropic.circuitOpen, true);
    assert.ok(snap.anthropic.cooldownRemaining > 0);
  });
});

describe("providerFailover — safety: degenerate inputs", () => {
  beforeEach(() => __testResetHealth());

  it("empty availableKeys returns preferred", () => {
    const pick = pickHealthyProvider("anthropic", {});
    assert.equal(pick, "anthropic");
  });

  it("missing key for preferred falls through to a provider with a key", () => {
    const pick = pickHealthyProvider("anthropic", { openai: "sk-xxx" });
    assert.equal(pick, "openai");
  });

  it("whitespace-only key is treated as missing", () => {
    const pick = pickHealthyProvider("anthropic", { anthropic: "   ", openai: "sk-xxx" });
    assert.equal(pick, "openai");
  });
});
