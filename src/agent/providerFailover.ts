// =============================================================================
// Provider Failover — Keeps the agent live when one LLM provider is down
//
// PROBLEM:
//   When Anthropic, OpenAI, or whichever provider the user configured has an
//   outage, the agent currently dies on every call until that provider
//   recovers. Anthropic, for example, had multi-hour outages in 2024-2025.
//
// SOLUTION:
//   Per-provider circuit breaker with auto-recovery:
//     1. recordFailure(provider) — bumps that provider's failure counter
//     2. After FAILURE_THRESHOLD failures within FAILURE_WINDOW_MS,
//        the circuit opens for COOLDOWN_MS — that provider is skipped
//     3. On every API call, pickHealthyProvider() returns:
//          - the user's preferred provider IF its circuit is closed
//          - otherwise the next available provider that has an API key
//            configured AND a closed circuit
//          - if everyone is down, falls back to the user's preferred provider
//            anyway (better to fail loudly than not try at all)
//     4. After a successful call, recordSuccess() clears the failure window
//     5. Auto-recovery: after COOLDOWN_MS the circuit closes itself
//
// SAFETY:
//   - Only kicks in when a fallback key is actually configured. Users with
//     ONE provider configured see no behavior change — the picker always
//     returns their primary.
//   - Counts only "transport" failures (auth, quota, permanent, exhausted-
//     transient). User-facing errors (context_len, not_found) don't trip
//     the circuit because they're not provider-health issues.
// =============================================================================

import type { AIProvider } from "../config/models.js";
import type { ErrorType } from "./errorClassifier.js";

// ── Configuration ────────────────────────────────────────────────────────────

const FAILURE_THRESHOLD = 3;            // failures to open circuit
const FAILURE_WINDOW_MS = 60_000;       // 1 min sliding window
const COOLDOWN_MS       = 5 * 60_000;   // 5 min before retry

/**
 * Preferred fallback order when the primary is down. Picker walks this list
 * looking for a provider that (a) has an API key and (b) has a closed circuit.
 *
 * Order rationale: Anthropic + OpenAI are the most reliable, Google is fast
 * and rarely down, OpenRouter is a meta-router so it goes last (one of its
 * upstream providers may be the very thing that's down).
 */
const FALLBACK_PREFERENCE: AIProvider[] = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "alibaba",
  "moonshot",
  "xai",
  "openrouter",
];

/** Sensible default model per provider, used when failover swaps providers. */
const DEFAULT_MODEL_PER_PROVIDER: Record<AIProvider, string> = {
  anthropic:  "claude-sonnet-4-6",
  openai:     "gpt-4o",
  google:     "gemini-2.5-flash",
  xai:        "grok-3-mini",
  deepseek:   "deepseek-chat",
  alibaba:    "qwen-plus",
  moonshot:   "kimi-k2",
  openrouter: "google/gemini-2.5-flash",
};

// ── State (process-local in-memory) ──────────────────────────────────────────

interface ProviderHealth {
  failures:   number[];           // timestamps of recent failures
  openedAt:   number | null;      // null = circuit closed; ms timestamp = open since
}

const HEALTH: Map<AIProvider, ProviderHealth> = new Map();

function getHealth(provider: AIProvider): ProviderHealth {
  let h = HEALTH.get(provider);
  if (!h) {
    h = { failures: [], openedAt: null };
    HEALTH.set(provider, h);
  }
  return h;
}

/** Returns true if `errType` indicates a provider-health issue worth circuit-tripping. */
function shouldTripCircuit(errType: ErrorType): boolean {
  // - "transient" exhausted retries → real outage
  // - "auth" → user's key invalid (won't recover but still a fail-through reason)
  // - "quota" → user's account empty (same — try another provider)
  // - "permanent" → unknown error, probably worth trying another provider
  // - "rate_limit" → DOES count; persistent rate limits = effectively down
  // - "context_len" → user's fault, doesn't reflect provider health
  // - "not_found" → user picked wrong model, doesn't reflect provider health
  return (
    errType === "transient" ||
    errType === "auth"      ||
    errType === "quota"     ||
    errType === "rate_limit"||
    errType === "permanent"
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Mark a provider as having failed. After enough failures within the window,
 * the circuit opens and the provider is excluded from picker results until
 * the cooldown elapses.
 */
export function recordFailure(provider: AIProvider, errType: ErrorType): void {
  if (!shouldTripCircuit(errType)) return;
  const h = getHealth(provider);
  const now = Date.now();
  // Drop failures outside the sliding window
  h.failures = h.failures.filter((t) => now - t < FAILURE_WINDOW_MS);
  h.failures.push(now);
  if (h.failures.length >= FAILURE_THRESHOLD && h.openedAt === null) {
    h.openedAt = now;
  }
}

/** Clear failure history after a successful call. */
export function recordSuccess(provider: AIProvider): void {
  const h = getHealth(provider);
  h.failures = [];
  h.openedAt = null;
}

/**
 * Returns true iff this provider's circuit is currently open (skip it).
 * Automatically closes the circuit if cooldown has elapsed.
 */
export function isCircuitOpen(provider: AIProvider): boolean {
  const h = getHealth(provider);
  if (h.openedAt === null) return false;
  if (Date.now() - h.openedAt >= COOLDOWN_MS) {
    // Cooldown elapsed — give the provider another shot.
    h.openedAt = null;
    h.failures = [];
    return false;
  }
  return true;
}

/**
 * Pick the healthiest available provider, preferring the user's primary.
 *
 * @param preferred       User's configured provider — always tried first
 * @param availableKeys   Map of provider → API key (only providers with non-empty keys are candidates)
 * @param exclude         Providers already tried this turn (avoid bouncing back)
 * @returns the chosen provider; falls back to `preferred` if EVERYTHING is down
 */
export function pickHealthyProvider(
  preferred:     AIProvider,
  availableKeys: Partial<Record<AIProvider, string>>,
  exclude:       AIProvider[] = []
): AIProvider {
  const hasKey = (p: AIProvider) =>
    !!(availableKeys[p] && String(availableKeys[p]).trim().length > 0);

  // 1. Preferred first, if it has a key, is not excluded, and its circuit is closed.
  if (hasKey(preferred) && !exclude.includes(preferred) && !isCircuitOpen(preferred)) {
    return preferred;
  }

  // 2. Walk the preference list for a healthy alternative.
  for (const candidate of FALLBACK_PREFERENCE) {
    if (candidate === preferred) continue;                        // already tried above
    if (exclude.includes(candidate)) continue;
    if (!hasKey(candidate)) continue;
    if (isCircuitOpen(candidate)) continue;
    return candidate;
  }

  // 3. Everyone is either excluded, keyless, or in cooldown. Try the preferred
  //    one even if its circuit is open — better to attempt than abandon.
  return preferred;
}

/** Returns a sensible default model for a provider. Used when failover swaps providers. */
export function getDefaultModelFor(provider: AIProvider): string {
  return DEFAULT_MODEL_PER_PROVIDER[provider] ?? "claude-sonnet-4-6";
}

/** Snapshot of all provider health states — for /api/services/health endpoint. */
export function getHealthSnapshot(): Record<string, {
  failuresInWindow: number;
  circuitOpen:      boolean;
  cooldownRemaining: number;
}> {
  const out: Record<string, { failuresInWindow: number; circuitOpen: boolean; cooldownRemaining: number }> = {};
  const now = Date.now();
  for (const [provider, h] of HEALTH.entries()) {
    const recentFailures = h.failures.filter((t) => now - t < FAILURE_WINDOW_MS).length;
    const cooldownRemaining =
      h.openedAt === null
        ? 0
        : Math.max(0, COOLDOWN_MS - (now - h.openedAt));
    out[provider] = {
      failuresInWindow:  recentFailures,
      circuitOpen:       h.openedAt !== null && cooldownRemaining > 0,
      cooldownRemaining,
    };
  }
  return out;
}

// ── Test hook ────────────────────────────────────────────────────────────────

/** Reset all provider health state — for deterministic tests only. */
export function __testResetHealth(): void {
  HEALTH.clear();
}

/** Internal — exposed for tests that need to inspect thresholds. */
export const __testConstants = {
  FAILURE_THRESHOLD,
  FAILURE_WINDOW_MS,
  COOLDOWN_MS,
};
