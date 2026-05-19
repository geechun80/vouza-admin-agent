// =============================================================================
// Error Classifier — categorises API errors for intelligent recovery
//
// Replaces the simple isTransient boolean with a typed error class that
// drives different recovery strategies:
//
//   transient     → retry 2×, short wait (model overloaded, network blip)
//   rate_limit    → retry 3×, longer exponential wait (429 / too many reqs)
//   quota         → no retry, tell user to top up credits
//   auth          → no retry, redirect user to re-enter key in wizard
//   context_len   → no retry, trigger context compression and re-run
//   not_found     → no retry, suggest different model
//   permanent     → no retry, show raw error (unknown issue)
//
// This mirrors Hermes agent/error_classifier.py — classify first, act second.
// =============================================================================

export type ErrorType =
  | "transient"
  | "rate_limit"
  | "quota"
  | "auth"
  | "context_len"
  | "not_found"
  | "permanent";

export interface ErrorInfo {
  type:        ErrorType;
  shouldRetry: boolean;
  maxRetries:  number;
  /** Returns wait time in ms for a given retry attempt (1-based) */
  waitMs:      (attempt: number) => number;
  /** User-facing message — clear, actionable, no jargon */
  userMessage: string;
}

/** Classify a raw API error string into a typed ErrorInfo */
export function classifyError(raw: string, isOpenRouter = false): ErrorInfo {
  const msg = raw.toLowerCase();

  // ── Context length exceeded ────────────────────────────────────────────────
  // Must check BEFORE rate_limit since some APIs return 400 for this
  if (
    msg.includes("context_length_exceeded") ||
    msg.includes("context length") ||
    msg.includes("too many tokens") ||
    msg.includes("maximum context") ||
    msg.includes("prompt is too long") ||
    msg.includes("reduce the length")
  ) {
    return {
      type:        "context_len",
      shouldRetry: false, // caller should compress then re-run
      maxRetries:  0,
      waitMs:      () => 0,
      userMessage: "The conversation is too long for this model's context window. Compressing history and retrying…",
    };
  }

  // ── Quota / credits exhausted ──────────────────────────────────────────────
  if (
    msg.includes("402") ||
    msg.includes("insufficient_quota") ||
    msg.includes("insufficient credits") ||
    msg.includes("no credits") ||
    msg.includes("out of credits") ||
    msg.includes("billing") ||
    msg.includes("payment required")
  ) {
    return {
      type:        "quota",
      shouldRetry: false,
      maxRetries:  0,
      waitMs:      () => 0,
      userMessage: isOpenRouter
        ? "Your OpenRouter account has no credits. Add even $5 at **openrouter.ai/credits** — it lasts months at typical usage."
        : "Your API account is out of credits or requires payment. Please top up and try again.",
    };
  }

  // ── Authentication / invalid key ───────────────────────────────────────────
  if (
    msg.includes("401") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid api key") ||
    msg.includes("invalid_api_key") ||
    msg.includes("authentication") ||
    msg.includes("incorrect api key") ||
    msg.includes("api key not found")
  ) {
    return {
      type:        "auth",
      shouldRetry: false,
      maxRetries:  0,
      waitMs:      () => 0,
      userMessage:
        "Invalid API key — please re-enter it in the setup wizard (Step 2 → AI Account Access). " +
        "Make sure there are no extra spaces and the key is complete.",
    };
  }

  // ── Rate limit (429) ───────────────────────────────────────────────────────
  // Retry with exponential back-off: 5s → 15s → 30s
  if (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("too many requests") ||
    msg.includes("ratelimit") ||
    msg.includes("requests per minute") ||
    msg.includes("tokens per minute")
  ) {
    return {
      type:        "rate_limit",
      shouldRetry: true,
      maxRetries:  3,
      waitMs:      (attempt) => [5_000, 15_000, 30_000][attempt - 1] ?? 30_000,
      userMessage: "Rate limit reached. Retrying with a longer wait…",
    };
  }

  // ── Request queue timeout (our own 60s AbortController sentinel) ─────────
  // Do NOT retry — we already waited 60s. Tell the user and let them decide.
  if (msg.includes("ai_queue_timeout")) {
    return {
      type:        "permanent",
      shouldRetry: false,
      maxRetries:  0,
      waitMs:      () => 0,
      userMessage: isOpenRouter
        ? "⏱️ The model took over 60 seconds — the free tier queue is backed up.\n\n**Fastest fix:** open the setup wizard and switch to Anthropic or Google AI for instant responses. Or top up at openrouter.ai/credits to skip the free queue."
        : "⏱️ The AI model took too long to respond (60 s timeout). Please try again in a moment.",
    };
  }

  // ── Transient / server overload ────────────────────────────────────────────
  // Retry up to 2×: 3s → 6s
  if (
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("overload") ||
    msg.includes("overloaded") ||
    msg.includes("service unavailable") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("server error") ||
    msg.includes("internal server error") ||
    msg.includes("500") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("timeout") ||
    msg.includes("etimedout")
  ) {
    return {
      type:        "transient",
      shouldRetry: true,
      maxRetries:  2,
      waitMs:      (attempt) => attempt * 3_000, // 3s, 6s
      userMessage: "The AI model is temporarily overloaded. Retrying in a moment…",
    };
  }

  // ── Model not found ───────────────────────────────────────────────────────
  if (
    msg.includes("404") ||
    msg.includes("model not found") ||
    msg.includes("no such model") ||
    msg.includes("does not exist") ||
    msg.includes("model_not_found") ||
    msg.includes("unknown model")
  ) {
    return {
      type:        "not_found",
      shouldRetry: false,
      maxRetries:  0,
      waitMs:      () => 0,
      userMessage: isOpenRouter
        ? "Model not found on OpenRouter. Open the setup wizard and choose a different AI model."
        : "The selected model doesn't exist. Please check your model selection in settings.",
    };
  }

  // ── Permanent / unknown ────────────────────────────────────────────────────
  const truncated = raw.length > 300 ? raw.slice(0, 300) + "…" : raw;
  return {
    type:        "permanent",
    shouldRetry: false,
    maxRetries:  0,
    waitMs:      () => 0,
    userMessage: truncated,
  };
}
