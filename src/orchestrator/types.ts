// =============================================================================
// Orchestrator Types — stateful self-healing integration setup
//
// The orchestrator replaces ad-hoc tool calls (which led to LLM retry loops —
// Aerick 2026-05-27 incident) with a fixed pipeline per integration:
//
//   detect → validate → test → save → confirm → live-test
//
// Each step declares optional fallbacks. Fallbacks run silently — the user
// never sees them. Only when ALL fallbacks for a step exhaust do we surface
// a single, specific, human-readable error with a `doNotRetry` flag so the
// LLM stops looping (Rule 56).
// =============================================================================

import type { Logger } from "pino";

/** Result of a single step. Discriminated union — never both. */
export type StepResult<T> =
  | { ok: true; value: T; note?: string }
  | {
      ok: false;
      error: string;
      /** A specific actionable fix the user can perform — relayed verbatim. */
      suggestedFix?: string;
      /** Rule 56: tells the LLM not to retry — the user must change something. */
      doNotRetry?: boolean;
    };

/** Context that flows through every step of every pipeline. */
export interface OrchestratorContext {
  /** Integration id (e.g. "gmail", "telegram"). */
  integration: string;
  /** Structured logger — never a console.log inside steps. */
  logger: Logger;
  /** Live agent config (mutated by save step). Optional for tests. */
  config?: any;
  /** Audit trail of every attempt — populated by runner across step boundaries. */
  previousAttempts?: AttemptLog[];
  /** Optional per-step timeout override (ms). Default 15000. */
  stepTimeoutMs?: number;
}

/** Single attempt entry — written by the runner, NOT by steps themselves. */
export interface AttemptLog {
  step: string;
  /** "primary" | "fallback#1" | "fallback#2" ... */
  variant: string;
  ok: boolean;
  ms: number;
  error?: string;
}

/**
 * A single pipeline step. Generic in input and output so steps can be
 * type-chained — but in practice most pipelines pass the same context object
 * through and mutate a shared scratch buffer.
 */
export interface Step<TIn = any, TOut = any> {
  /** Stable step name — used in logs and PipelineResult.stepReached. */
  readonly name: string;
  /** Execute the step. MUST NOT throw — wrap errors as StepResult.ok=false. */
  run(input: TIn, ctx: OrchestratorContext): Promise<StepResult<TOut>>;
  /** Optional alternative implementations tried silently in order on failure. */
  readonly fallbacks?: Step<TIn, TOut>[];
}

/** An ordered list of steps that share an input shape. */
export interface Pipeline<TInput = any> {
  readonly id: string;
  readonly steps: Step[];
  /** What raw input shape this pipeline expects (declarative only). */
  readonly inputShape?: string;
  /** Optional per-pipeline timeout default in ms. */
  readonly defaultStepTimeoutMs?: number;
}

/** Final outcome of running a full pipeline. */
export interface PipelineResult {
  success: boolean;
  /** Name of the step that ran last (success = the final step; failure = the failing step). */
  stepReached: string;
  /** Aggregated data returned by successful steps. */
  data?: Record<string, unknown>;
  /** Error message (only when success=false). */
  error?: string;
  /** Suggested fix (only when success=false). */
  suggestedFix?: string;
  /** Rule 56 — tells the LLM not to retry this call. */
  doNotRetry?: boolean;
  /** Full attempt log — useful for debugging and tests. */
  attempts: AttemptLog[];
}
