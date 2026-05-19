// =============================================================================
// Smoke tests — errorClassifier.ts
//
// Verifies that API error messages route to the correct recovery strategy.
// A regression here means rate-limits become permanent failures, quota errors
// trigger infinite retries (= $$$ bill), or auth errors silently loop forever.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { classifyError } from "../src/agent/errorClassifier.js";

describe("errorClassifier — context length", () => {
  it("detects context_length_exceeded", () => {
    const r = classifyError("Error: context_length_exceeded — too many tokens");
    assert.equal(r.type, "context_len");
    assert.equal(r.shouldRetry, false);
  });

  it("detects 'prompt is too long'", () => {
    const r = classifyError("400 Bad Request: prompt is too long");
    assert.equal(r.type, "context_len");
  });
});

describe("errorClassifier — quota / billing", () => {
  it("detects insufficient_quota", () => {
    const r = classifyError("insufficient_quota: You exceeded your current quota");
    assert.equal(r.type, "quota");
    assert.equal(r.shouldRetry, false);
  });

  it("detects 402 payment required", () => {
    const r = classifyError("HTTP 402 payment required");
    assert.equal(r.type, "quota");
  });

  it("uses OpenRouter-specific quota message when isOpenRouter=true", () => {
    const r = classifyError("no credits available", true);
    assert.equal(r.type, "quota");
    assert.ok(r.userMessage.toLowerCase().includes("openrouter"));
  });
});

describe("errorClassifier — auth", () => {
  it("detects 401 unauthorized", () => {
    const r = classifyError("401 unauthorized");
    assert.equal(r.type, "auth");
    assert.equal(r.shouldRetry, false);
    assert.ok(r.userMessage.toLowerCase().includes("api key"));
  });

  it("detects invalid_api_key", () => {
    const r = classifyError("Error: invalid_api_key — please check");
    assert.equal(r.type, "auth");
  });
});

describe("errorClassifier — rate limit (429)", () => {
  it("classifies 429 as rate_limit with retry", () => {
    const r = classifyError("429 Too Many Requests");
    assert.equal(r.type, "rate_limit");
    assert.equal(r.shouldRetry, true);
    assert.equal(r.maxRetries, 3);
  });

  it("uses exponential backoff 5s/15s/30s", () => {
    const r = classifyError("rate limit exceeded");
    assert.equal(r.waitMs(1), 5_000);
    assert.equal(r.waitMs(2), 15_000);
    assert.equal(r.waitMs(3), 30_000);
    assert.equal(r.waitMs(4), 30_000); // clamps at last value
  });
});

describe("errorClassifier — transient", () => {
  it("classifies 503 as transient with retry", () => {
    const r = classifyError("503 Service Unavailable");
    assert.equal(r.type, "transient");
    assert.equal(r.shouldRetry, true);
    assert.equal(r.maxRetries, 2);
  });

  it("classifies network errors as transient", () => {
    const r = classifyError("ECONNRESET socket hang up");
    assert.equal(r.type, "transient");
  });

  it("classifies model overloaded as transient", () => {
    const r = classifyError("Model is overloaded, please try again");
    assert.equal(r.type, "transient");
  });
});

describe("errorClassifier — model not found", () => {
  it("classifies 404 as not_found", () => {
    const r = classifyError("404 model not found");
    assert.equal(r.type, "not_found");
    assert.equal(r.shouldRetry, false);
  });
});

describe("errorClassifier — fallback", () => {
  it("classifies unknown errors as permanent", () => {
    const r = classifyError("Something weird happened that we've never seen");
    assert.equal(r.type, "permanent");
    assert.equal(r.shouldRetry, false);
  });

  it("truncates extremely long permanent error messages", () => {
    const big = "x".repeat(500);
    const r = classifyError(big);
    assert.ok(r.userMessage.length <= 301 + 1); // 300 + ellipsis
  });
});

describe("errorClassifier — ordering safety", () => {
  it("context_len wins over rate_limit even if both keywords appear", () => {
    // Critical: some APIs return 429 for context-too-long, must classify as context_len
    const r = classifyError("429 prompt is too long");
    assert.equal(r.type, "context_len");
  });

  it("ai_queue_timeout never retries", () => {
    const r = classifyError("ai_queue_timeout after 60s");
    assert.equal(r.type, "permanent");
    assert.equal(r.shouldRetry, false);
  });
});
