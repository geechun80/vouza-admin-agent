// =============================================================================
// Pipeline Runner — executes steps in order, runs fallbacks on failure,
// records every attempt, enforces per-step timeouts.
//
// Key invariants:
//   - A step that returns ok:true short-circuits its fallback chain.
//   - A step that returns ok:false with doNotRetry=true ALSO short-circuits
//     its fallback chain (the user must change something — retrying is
//     pointless and wastes turns).
//   - Pipeline halts at the first step whose primary + all fallbacks failed.
//   - No leaked setTimeout handles: every timer is cleared on early resolve.
//   - Logger calls are structured ({ step, integration, ms }) — never
//     interpolated strings (Rule from build_rules_agents).
// =============================================================================

import type {
  Pipeline,
  OrchestratorContext,
  PipelineResult,
  Step,
  StepResult,
  AttemptLog,
} from "./types.js";

const DEFAULT_STEP_TIMEOUT_MS = 15_000;

/**
 * Race a step against a timeout. Ensures the setTimeout handle is cleared
 * whether the step wins or the timer wins — no leaked timers.
 */
async function runWithTimeout<T>(
  step: Step,
  input: any,
  ctx: OrchestratorContext,
  timeoutMs: number,
): Promise<StepResult<T>> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<StepResult<T>>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        ok: false,
        error: `Step "${step.name}" timed out after ${timeoutMs}ms`,
        suggestedFix:
          "The remote service did not respond in time. Check your network connection and try again.",
      });
    }, timeoutMs);
    // Don't keep the event loop alive just for this timer.
    if (typeof timer.unref === "function") timer.unref();
  });

  try {
    const result = await Promise.race([
      Promise.resolve()
        .then(() => step.run(input, ctx))
        .catch((e): StepResult<T> => ({
          ok: false,
          error: `Step "${step.name}" threw: ${String(e?.message ?? e)}`,
        })),
      timeoutPromise,
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Execute one step + its fallback chain. Returns the first successful result
 * or the LAST failure (the one from the final fallback).
 *
 * Fallbacks are silent — they only show up in the attempts log, never in the
 * surfaced error message (Aerick feedback: stop showing the LLM internal retry
 * noise).
 */
async function runStepWithFallbacks(
  step: Step,
  input: any,
  ctx: OrchestratorContext,
  timeoutMs: number,
): Promise<StepResult<any>> {
  const attempts = ctx.previousAttempts!;

  const variants: { variant: string; step: Step }[] = [
    { variant: "primary", step },
    ...(step.fallbacks ?? []).map((s, i) => ({ variant: `fallback#${i + 1}`, step: s })),
  ];

  let lastResult: StepResult<any> = {
    ok: false,
    error: `Step "${step.name}" had no variants to run`,
  };

  for (const { variant, step: s } of variants) {
    const started = Date.now();
    ctx.logger.info(
      { step: s.name, variant, integration: ctx.integration },
      "step start",
    );

    const result = await runWithTimeout(s, input, ctx, timeoutMs);
    const ms = Date.now() - started;

    attempts.push({
      step: s.name,
      variant,
      ok: result.ok,
      ms,
      error: result.ok ? undefined : result.error,
    });

    ctx.logger.info(
      {
        step: s.name,
        variant,
        integration: ctx.integration,
        ms,
        ok: result.ok,
      },
      "step complete",
    );

    if (result.ok) return result;
    lastResult = result;

    // Honor doNotRetry — don't even try the fallbacks if the user must fix it.
    if (!result.ok && result.doNotRetry) {
      ctx.logger.info(
        { step: s.name, integration: ctx.integration },
        "step doNotRetry — skipping fallbacks",
      );
      return result;
    }
  }

  return lastResult;
}

/**
 * Run a full pipeline. Returns a flat PipelineResult — never throws.
 *
 * Idempotency note: it's the responsibility of the individual `save` and
 * `live-test` steps to be idempotent (e.g. check config before writing,
 * dedupe via a per-integration nonce). The runner doesn't enforce this —
 * it just ensures a single pipeline invocation runs each step at most once.
 */
export async function runPipeline(
  pipeline: Pipeline,
  input: any,
  ctx: OrchestratorContext,
): Promise<PipelineResult> {
  const timeoutMs =
    ctx.stepTimeoutMs ?? pipeline.defaultStepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  if (!ctx.previousAttempts) ctx.previousAttempts = [];

  ctx.logger.info(
    {
      pipeline: pipeline.id,
      integration: ctx.integration,
      stepCount: pipeline.steps.length,
    },
    "pipeline start",
  );

  // Accumulated data across steps — pipeline.data flows forward.
  const carriedData: Record<string, unknown> = {};
  let currentInput = input;

  for (const step of pipeline.steps) {
    const result = await runStepWithFallbacks(step, currentInput, ctx, timeoutMs);

    if (!result.ok) {
      ctx.logger.warn(
        {
          step: step.name,
          integration: ctx.integration,
          error: result.error,
        },
        "pipeline halted",
      );
      return {
        success: false,
        stepReached: step.name,
        error: result.error,
        suggestedFix: result.suggestedFix,
        doNotRetry: result.doNotRetry,
        data: carriedData,
        attempts: ctx.previousAttempts,
      };
    }

    // Merge step output into carried data (if it's a plain object).
    if (
      result.value &&
      typeof result.value === "object" &&
      !Array.isArray(result.value)
    ) {
      Object.assign(carriedData, result.value as Record<string, unknown>);
    }
    // The next step receives the merged scratch buffer as its input.
    currentInput = { ...currentInput, ...carriedData };
  }

  ctx.logger.info(
    { pipeline: pipeline.id, integration: ctx.integration },
    "pipeline success",
  );

  return {
    success: true,
    stepReached: pipeline.steps[pipeline.steps.length - 1]?.name ?? "(none)",
    data: carriedData,
    attempts: ctx.previousAttempts,
  };
}
