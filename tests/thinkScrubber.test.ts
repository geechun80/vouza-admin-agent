// =============================================================================
// Smoke tests — thinkScrubber.ts
//
// Ensures <think>…</think> blocks from reasoning models (DeepSeek-R1, QwQ,
// extended-thinking Claude) never leak into user-visible output.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  scrubThinkBlocks,
  hasThinkBlock,
  extractThoughts,
} from "../src/agent/thinkScrubber.js";

describe("thinkScrubber — scrubThinkBlocks", () => {
  it("removes a single think block", () => {
    const input = "<think>internal reasoning here</think>Hello user!";
    assert.equal(scrubThinkBlocks(input), "Hello user!");
  });

  it("removes multi-line think blocks", () => {
    const input = "<think>\nstep 1\nstep 2\n</think>\nFinal answer";
    const out = scrubThinkBlocks(input);
    assert.ok(!out.includes("step 1"));
    assert.ok(out.includes("Final answer"));
  });

  it("removes multiple think blocks", () => {
    const input = "<think>a</think>Part 1.<think>b</think> Part 2.";
    const out = scrubThinkBlocks(input);
    assert.ok(!out.includes("<think>"));
    assert.ok(out.includes("Part 1"));
    assert.ok(out.includes("Part 2"));
  });

  it("is a no-op when no think tags present (fast path)", () => {
    const input = "Just a normal response.";
    assert.equal(scrubThinkBlocks(input), input);
  });

  it("handles case-insensitive tags", () => {
    const input = "<THINK>hidden</THINK>visible";
    const out = scrubThinkBlocks(input);
    assert.equal(out, "visible");
  });

  it("collapses excess blank lines after stripping", () => {
    const input = "<think>x</think>\n\n\n\nAnswer";
    const out = scrubThinkBlocks(input);
    assert.ok(!out.includes("\n\n\n"));
  });

  it("returns empty string when entire content is a think block", () => {
    const input = "<think>only thinking</think>";
    assert.equal(scrubThinkBlocks(input).trim(), "");
  });
});

describe("thinkScrubber — hasThinkBlock", () => {
  it("detects presence of think tag", () => {
    assert.equal(hasThinkBlock("hi <think>x</think> bye"), true);
  });

  it("returns false for plain text", () => {
    assert.equal(hasThinkBlock("hello world"), false);
  });
});

describe("thinkScrubber — extractThoughts", () => {
  it("extracts all think block contents in order", () => {
    const input = "<think>first</think>then<think>second</think>";
    assert.deepEqual(extractThoughts(input), ["first", "second"]);
  });

  it("returns empty array when no thoughts present", () => {
    assert.deepEqual(extractThoughts("just text"), []);
  });
});
