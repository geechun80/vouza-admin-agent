// =============================================================================
// POST /api/setup/pipeline/test — M3 SSE-streaming pipeline runner
//
// Wraps the M2 self-healing orchestrator pipeline and surfaces each step's
// outcome as a Server-Sent Event so the Setup wizard UI can render
// step-by-step progress:
//
//   event: step  data: { step: "detect",     status: "ok",     ms: 12 }
//   event: step  data: { step: "validate",   status: "ok",     ms:  4 }
//   event: step  data: { step: "test",       status: "running" }
//   event: step  data: { step: "test",       status: "ok",     ms: 230 }
//   event: done  data: { success: true,  attempts: [...] }
//
// Cleanup contract:
//   - When the client disconnects (req "close"), we mark cancelled and stop
//     emitting events. We can't cancel the in-flight pipeline mid-step
//     because the orchestrator runner doesn't accept an AbortSignal yet,
//     but we DO unregister our listeners so no events leak to a dead socket.
//   - On normal completion we close the response stream cleanly.
// =============================================================================

import type { Request, Response } from "express";
import pino from "pino";
import { getPipeline, googleVariantFor, runPipeline } from "../../orchestrator/index.js";
import type { OrchestratorContext, AttemptLog } from "../../orchestrator/types.js";
import { healthMonitor } from "../../integrations/healthMonitor.js";

const VALID_INTEGRATIONS = new Set([
  "gmail", "google_calendar", "telegram", "whatsapp",
]);

export async function handleSetupPipelineTest(req: Request, res: Response): Promise<void> {
  const { integration, input } = (req.body ?? {}) as {
    integration?: string;
    input?: Record<string, unknown>;
  };

  if (!integration || !VALID_INTEGRATIONS.has(integration)) {
    res.status(400).json({
      error: "integration is required — one of: " + Array.from(VALID_INTEGRATIONS).join(", "),
    });
    return;
  }

  const pipeline = getPipeline(integration);
  if (!pipeline) {
    res.status(404).json({ error: `No pipeline registered for integration: ${integration}` });
    return;
  }

  // ── SSE headers ──────────────────────────────────────────────────────────
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");  // disable nginx buffering if proxied
  res.flushHeaders();

  // Client-disconnect tracking — once true, we stop emitting events.
  let cancelled = false;
  const cleanup = () => {
    cancelled = true;
    req.removeListener("close", cleanup);
    req.removeListener("aborted", cleanup);
  };
  req.once("close", cleanup);
  req.once("aborted", cleanup);

  const send = (event: string, data: Record<string, unknown>) => {
    if (cancelled || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Build the input payload — for Google pipelines we need the variant flag.
  const variant = googleVariantFor(integration);
  const effectiveInput = variant
    ? { ...(input ?? {}), variant }
    : (input ?? {});

  // Wire a logger that fans out each "step start" / "step complete" log line
  // as an SSE event. Steps already emit structured logs via ctx.logger — we
  // tap that stream instead of duplicating the orchestrator's bookkeeping.
  const sentStarts = new Set<string>();
  const baseLogger = pino({ level: "silent" });
  const wrapped: any = Object.create(baseLogger);
  wrapped.info = (obj: any, msg?: string) => {
    if (cancelled) return;
    if (typeof obj === "object" && obj && obj.step && obj.variant === "primary") {
      if (msg === "step start" && !sentStarts.has(obj.step)) {
        sentStarts.add(obj.step);
        send("step", { step: obj.step, status: "running" });
      } else if (msg === "step complete") {
        send("step", {
          step:   obj.step,
          status: obj.ok ? "ok" : "failed",
          ms:     obj.ms,
        });
      }
    }
  };
  wrapped.warn = wrapped.info;
  wrapped.error = wrapped.info;
  wrapped.debug = () => {};
  wrapped.trace = () => {};

  const ctx: OrchestratorContext = {
    integration,
    logger: wrapped,
    previousAttempts: [],
  };

  send("start", { integration, pipeline: pipeline.id, steps: pipeline.steps.map((s) => s.name) });

  const t0 = Date.now();
  try {
    const result = await runPipeline(pipeline, effectiveInput, ctx);
    const totalMs = Date.now() - t0;

    // Record one health event per attempt so the Health tab reflects this run
    for (const attempt of (result.attempts as AttemptLog[]) ?? []) {
      healthMonitor.recordEvent(integration, {
        kind:       "call",
        ok:         attempt.ok,
        latencyMs:  attempt.ms,
        error:      attempt.error,
        source:     `pipeline-test:${attempt.step}`,
      });
    }

    send("done", {
      success:      result.success,
      stepReached:  result.stepReached,
      totalMs,
      error:        result.error,
      suggestedFix: result.suggestedFix,
      doNotRetry:   result.doNotRetry,
      attempts:     result.attempts,
    });
  } catch (err) {
    send("error", { error: String((err as Error)?.message ?? err) });
  } finally {
    cleanup();
    if (!res.writableEnded) res.end();
  }
}
