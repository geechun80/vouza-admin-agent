// =============================================================================
// Budget Tracker — Daily spend cap for the Vouza Guide Bot
//
// SCOPE & SAFETY:
// This guard ONLY engages when the active API key is Vouza's fallback key
// (process.env.VOUZA_API_KEY). When the user has supplied their own AI key
// in the wizard, the cap is disabled — they manage their own limits at
// their LLM platform (Anthropic console, OpenAI dashboard, etc.).
//
// Default cap: $10/day. Configurable via env: VOUZA_DAILY_BUDGET_USD=10
//
// Fail-open policy:
// If the budget file is corrupt, missing, or locked, checkBudget() returns
// { blocked: false } and recordSpend() silently skips. Cost tracking is a
// safety net — it must NEVER prevent legitimate work due to its own bugs.
//
// Persistence:
// One JSON file at data/budget.json with shape:
//   {
//     "date": "2026-05-19",                    // ISO local date
//     "totalUsd": 3.42,
//     "byProvider": { "openrouter": 3.42 },
//     "lastResetAt": "2026-05-19T00:00:00.000Z"
//   }
// When the local date changes, totals reset to 0 on the next read.
// =============================================================================

import { promises as fs } from "fs";
import { dirname } from "path";
import { findModel } from "../config/models.js";

// ── Configuration ────────────────────────────────────────────────────────────

const BUDGET_FILE_PATH    = "./data/budget.json";
const DEFAULT_CAP_USD     = 10;          // $10/day default for Vouza Guide Bot
const WARN_THRESHOLD_PCT  = 0.8;         // warn at 80% of cap

/** Default per-1M-token pricing used if a model isn't in the catalog. */
const FALLBACK_PRICING_PER_M = { input: 1.0, output: 4.0 };

// ── Types ────────────────────────────────────────────────────────────────────

export interface BudgetState {
  date:        string;                          // "YYYY-MM-DD" local
  totalUsd:    number;
  byProvider:  Record<string, number>;
  lastResetAt: string;                          // ISO timestamp
}

export interface BudgetCheckResult {
  blocked:   boolean;
  spent:     number;
  cap:       number;
  remaining: number;
  warn:      boolean;
  message?:  string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true iff this API key is Vouza's fallback key. Only when this
 * returns true should the budget cap be enforced.
 */
export function isVouzaFallbackKey(apiKey: string | undefined | null): boolean {
  if (!apiKey) return false;
  const vouzaKey = (process.env.VOUZA_API_KEY || "").trim();
  if (!vouzaKey) return false;
  return apiKey.trim() === vouzaKey;
}

/** Returns the configured daily cap in USD (default $10). */
export function getDailyCapUsd(): number {
  const raw = process.env.VOUZA_DAILY_BUDGET_USD;
  if (!raw) return DEFAULT_CAP_USD;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP_USD;
}

/**
 * Estimate the USD cost of a single API call.
 * Pulls pricing from the model catalog; falls back to a moderate default
 * if the model isn't recognized (so we never under-cap a new model).
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const info = findModel(modelId);
  const pricing = info?.pricing ?? FALLBACK_PRICING_PER_M;
  // pricing is per 1M tokens
  const inputUsd  = (inputTokens  / 1_000_000) * pricing.input;
  const outputUsd = (outputTokens / 1_000_000) * pricing.output;
  return inputUsd + outputUsd;
}

/**
 * Check whether the daily budget allows another call.
 * Returns blocked: true only if we're CERTAIN we've exceeded the cap.
 * On any error reading state, fails open (blocked: false).
 */
export async function checkBudget(): Promise<BudgetCheckResult> {
  const cap = getDailyCapUsd();
  try {
    const state = await readBudgetState();
    const spent = state.totalUsd;
    const remaining = Math.max(0, cap - spent);
    const blocked = spent >= cap;
    const warn = !blocked && spent >= cap * WARN_THRESHOLD_PCT;
    return {
      blocked,
      spent,
      cap,
      remaining,
      warn,
      message: blocked
        ? `Daily spend cap of $${cap.toFixed(2)} reached ($${spent.toFixed(2)} used today). Resets at local midnight.`
        : warn
          ? `⚠️ ${Math.round((spent / cap) * 100)}% of daily $${cap.toFixed(2)} cap used.`
          : undefined,
    };
  } catch {
    // Fail open — never block work due to budget-tracker bugs.
    return { blocked: false, spent: 0, cap, remaining: cap, warn: false };
  }
}

/**
 * Record a completed API call's spend against today's bucket.
 * Silently no-ops on any error (fail-open).
 */
export async function recordSpend(
  provider: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  try {
    const cost = estimateCost(modelId, inputTokens, outputTokens);
    if (cost <= 0) return; // free-tier model — nothing to track
    const state = await readBudgetState();
    state.totalUsd += cost;
    state.byProvider[provider] = (state.byProvider[provider] || 0) + cost;
    await writeBudgetState(state);
  } catch {
    // Fail-open — no throw.
  }
}

/** Returns a snapshot of today's budget state (for dashboards / /budget command). */
export async function getBudgetSnapshot(): Promise<BudgetState & { cap: number }> {
  try {
    const state = await readBudgetState();
    return { ...state, cap: getDailyCapUsd() };
  } catch {
    return {
      date:        todayLocalISO(),
      totalUsd:    0,
      byProvider:  {},
      lastResetAt: new Date().toISOString(),
      cap:         getDailyCapUsd(),
    };
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Returns today's date in local time as "YYYY-MM-DD". */
function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function readBudgetState(): Promise<BudgetState> {
  let state: BudgetState;
  try {
    const raw = await fs.readFile(BUDGET_FILE_PATH, "utf-8");
    state = JSON.parse(raw) as BudgetState;
    if (!state || typeof state !== "object") throw new Error("invalid");
  } catch {
    // No file yet — start fresh.
    state = {
      date:        todayLocalISO(),
      totalUsd:    0,
      byProvider:  {},
      lastResetAt: new Date().toISOString(),
    };
    return state;
  }

  // Daily reset: if stored date is not today, zero out totals.
  const today = todayLocalISO();
  if (state.date !== today) {
    state = {
      date:        today,
      totalUsd:    0,
      byProvider:  {},
      lastResetAt: new Date().toISOString(),
    };
  }

  // Defensive defaults — never trust file contents.
  state.totalUsd   = Number.isFinite(state.totalUsd) ? Math.max(0, state.totalUsd) : 0;
  state.byProvider = state.byProvider && typeof state.byProvider === "object" ? state.byProvider : {};

  return state;
}

async function writeBudgetState(state: BudgetState): Promise<void> {
  await fs.mkdir(dirname(BUDGET_FILE_PATH), { recursive: true });
  // Write-then-rename for atomic update — no half-written files.
  const tmp = BUDGET_FILE_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
  await fs.rename(tmp, BUDGET_FILE_PATH);
}

// ── Test hook ────────────────────────────────────────────────────────────────

/**
 * Internal test utility — resets today's spend to a known value.
 * Not exported for runtime callers; used only by tests/budget.test.ts via
 * dynamic import to set deterministic state.
 */
export async function __testResetBudget(spent: number = 0): Promise<void> {
  await writeBudgetState({
    date:        todayLocalISO(),
    totalUsd:    spent,
    byProvider:  spent > 0 ? { test: spent } : {},
    lastResetAt: new Date().toISOString(),
  });
}
