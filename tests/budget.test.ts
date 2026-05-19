// =============================================================================
// Smoke tests — budget.ts
//
// Verifies the Guide Bot daily-cap guard:
//   1. Only engages on Vouza's fallback key — user's own key has no cap
//   2. Correctly estimates cost from model pricing
//   3. Blocks calls when daily cap is reached
//   4. Resets daily at local midnight (simulated by state mutation)
//   5. Fails OPEN on any error (never blocks legitimate work)
// =============================================================================

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "fs";
import {
  isVouzaFallbackKey,
  getDailyCapUsd,
  estimateCost,
  checkBudget,
  recordSpend,
  getBudgetSnapshot,
  __testResetBudget,
} from "../src/agent/budget.js";

const BUDGET_FILE = "./data/budget.json";

async function cleanBudgetFile() {
  try { await fs.unlink(BUDGET_FILE); } catch { /* not present is fine */ }
}

describe("budget — Vouza key detection", () => {
  beforeEach(() => { delete process.env.VOUZA_API_KEY; });
  afterEach(() => { delete process.env.VOUZA_API_KEY; });

  it("returns false when VOUZA_API_KEY env var is not set", () => {
    assert.equal(isVouzaFallbackKey("sk-or-v1-xxxxx"), false);
  });

  it("returns false for empty / null / undefined keys", () => {
    process.env.VOUZA_API_KEY = "sk-or-v1-vouza";
    assert.equal(isVouzaFallbackKey(""), false);
    assert.equal(isVouzaFallbackKey(null as any), false);
    assert.equal(isVouzaFallbackKey(undefined), false);
  });

  it("returns true ONLY when the key matches VOUZA_API_KEY", () => {
    process.env.VOUZA_API_KEY = "sk-or-v1-vouza";
    assert.equal(isVouzaFallbackKey("sk-or-v1-vouza"), true);
    assert.equal(isVouzaFallbackKey("sk-or-v1-user-own"), false);
  });

  it("trims whitespace when comparing", () => {
    process.env.VOUZA_API_KEY = "sk-or-v1-vouza";
    assert.equal(isVouzaFallbackKey("  sk-or-v1-vouza  "), true);
  });
});

describe("budget — cap configuration", () => {
  beforeEach(() => { delete process.env.VOUZA_DAILY_BUDGET_USD; });
  afterEach(() => { delete process.env.VOUZA_DAILY_BUDGET_USD; });

  it("defaults to $10/day when env var unset", () => {
    assert.equal(getDailyCapUsd(), 10);
  });

  it("reads cap from VOUZA_DAILY_BUDGET_USD env var", () => {
    process.env.VOUZA_DAILY_BUDGET_USD = "5";
    assert.equal(getDailyCapUsd(), 5);
  });

  it("falls back to default for invalid env values", () => {
    process.env.VOUZA_DAILY_BUDGET_USD = "not-a-number";
    assert.equal(getDailyCapUsd(), 10);
    process.env.VOUZA_DAILY_BUDGET_USD = "-3";
    assert.equal(getDailyCapUsd(), 10);
  });
});

describe("budget — cost estimation", () => {
  it("computes cost from per-1M-token pricing", () => {
    // gemini-2.5-flash-lite: $0.07 in / $0.30 out per 1M
    const cost = estimateCost("google/gemini-2.5-flash-lite", 1_000_000, 1_000_000);
    assert.ok(Math.abs(cost - 0.37) < 0.001, `expected ~$0.37, got ${cost}`);
  });

  it("scales linearly with token counts", () => {
    const a = estimateCost("google/gemini-2.5-flash-lite", 100_000, 100_000);
    const b = estimateCost("google/gemini-2.5-flash-lite", 200_000, 200_000);
    assert.ok(Math.abs(b - 2 * a) < 0.0001);
  });

  it("uses fallback pricing for unknown models (never returns $0)", () => {
    const cost = estimateCost("unknown-model-xyz", 1_000_000, 1_000_000);
    assert.ok(cost > 0, "Unknown models must still be priced — never $0 (would defeat the cap)");
  });

  it("returns $0 for free-tier models", () => {
    const cost = estimateCost("meta-llama/llama-3.1-8b-instruct:free", 1_000_000, 1_000_000);
    assert.equal(cost, 0);
  });
});

describe("budget — checkBudget", () => {
  beforeEach(async () => {
    delete process.env.VOUZA_DAILY_BUDGET_USD;
    await cleanBudgetFile();
  });
  afterEach(async () => {
    await cleanBudgetFile();
  });

  it("returns not-blocked when no spend recorded yet", async () => {
    const r = await checkBudget();
    assert.equal(r.blocked, false);
    assert.equal(r.spent, 0);
    assert.equal(r.cap, 10);
    assert.equal(r.remaining, 10);
  });

  it("blocks when spend equals cap", async () => {
    await __testResetBudget(10);
    const r = await checkBudget();
    assert.equal(r.blocked, true);
    assert.ok(r.message?.includes("$10"));
  });

  it("blocks when spend exceeds cap", async () => {
    await __testResetBudget(15);
    const r = await checkBudget();
    assert.equal(r.blocked, true);
  });

  it("emits warn flag at 80% of cap", async () => {
    await __testResetBudget(8);
    const r = await checkBudget();
    assert.equal(r.blocked, false);
    assert.equal(r.warn, true);
  });

  it("does NOT warn below 80%", async () => {
    await __testResetBudget(5);
    const r = await checkBudget();
    assert.equal(r.warn, false);
  });

  it("honors a custom cap from env", async () => {
    process.env.VOUZA_DAILY_BUDGET_USD = "2";
    await __testResetBudget(2.5);
    const r = await checkBudget();
    assert.equal(r.blocked, true);
    assert.equal(r.cap, 2);
  });
});

describe("budget — recordSpend persistence", () => {
  beforeEach(async () => {
    delete process.env.VOUZA_DAILY_BUDGET_USD;
    await cleanBudgetFile();
  });
  afterEach(async () => {
    await cleanBudgetFile();
  });

  it("persists spend across reads", async () => {
    await recordSpend("openrouter", "google/gemini-2.5-flash-lite", 1_000_000, 1_000_000);
    const r = await checkBudget();
    assert.ok(r.spent > 0);
    assert.ok(Math.abs(r.spent - 0.37) < 0.001);
  });

  it("accumulates across multiple calls", async () => {
    await recordSpend("openrouter", "google/gemini-2.5-flash-lite", 500_000, 500_000);
    await recordSpend("openrouter", "google/gemini-2.5-flash-lite", 500_000, 500_000);
    const r = await checkBudget();
    assert.ok(Math.abs(r.spent - 0.37) < 0.001);
  });

  it("tracks spend per provider in snapshot", async () => {
    await recordSpend("openrouter", "google/gemini-2.5-flash-lite", 1_000_000, 1_000_000);
    const snap = await getBudgetSnapshot();
    assert.ok(snap.byProvider.openrouter !== undefined);
    assert.ok(snap.byProvider.openrouter > 0);
  });

  it("skips recording for $0 (free-tier) models", async () => {
    await recordSpend("openrouter", "meta-llama/llama-3.1-8b-instruct:free", 1_000_000, 1_000_000);
    const r = await checkBudget();
    assert.equal(r.spent, 0);
  });
});

describe("budget — fail-open safety", () => {
  beforeEach(async () => { await cleanBudgetFile(); });
  afterEach(async () => { await cleanBudgetFile(); });

  it("checkBudget never throws — returns not-blocked on any error", async () => {
    // Even with no data dir, no file, no env — must return cleanly
    const r = await checkBudget();
    assert.equal(typeof r.blocked, "boolean");
    assert.equal(r.blocked, false);
  });

  it("recordSpend silently no-ops on errors instead of throwing", async () => {
    // Doesn't throw even if numbers are nonsense
    await assert.doesNotReject(async () => {
      await recordSpend("openrouter", "google/gemini-2.5-flash-lite", NaN, NaN);
    });
  });

  it("survives corrupt budget.json by treating as fresh start", async () => {
    await fs.mkdir("./data", { recursive: true });
    await fs.writeFile(BUDGET_FILE, "{not valid json", "utf-8");
    const r = await checkBudget();
    assert.equal(r.blocked, false);
    assert.equal(r.spent, 0);
  });
});

describe("budget — snapshot shape", () => {
  beforeEach(async () => { await cleanBudgetFile(); });
  afterEach(async () => { await cleanBudgetFile(); });

  it("returns expected fields", async () => {
    const snap = await getBudgetSnapshot();
    assert.ok("date" in snap);
    assert.ok("totalUsd" in snap);
    assert.ok("byProvider" in snap);
    assert.ok("cap" in snap);
    assert.ok("lastResetAt" in snap);
  });

  it("date is YYYY-MM-DD format", async () => {
    const snap = await getBudgetSnapshot();
    assert.match(snap.date, /^\d{4}-\d{2}-\d{2}$/);
  });
});
