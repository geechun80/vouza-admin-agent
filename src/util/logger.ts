// =============================================================================
// Structured Logger — single pino instance shared across the project
//
// PURPOSE:
//   Replace scattered console.log() calls with one logger that produces
//   structured JSON. Lets you grep logs, ship to Datadog/Loki, attach
//   correlation IDs per session, and filter by level.
//
// DESIGN (zero-risk approach):
//   - Writes structured JSON to data/logs/admin-agent.log (one line per event)
//   - Does NOT replace existing console.log/chalk output — those keep working
//     unchanged for human readers, so the visible UX is preserved
//   - No transport plugins (avoids pino-pretty/pino-transport runtime load)
//   - Fail-safe: any logger init error falls back to a no-op so boot succeeds
//
// USAGE:
//   import { logger } from "./util/logger.js";
//   logger.info({ provider: "anthropic" }, "API call succeeded");
//   logger.warn({ sessionId: "abc" }, "Budget at 80%");
//   logger.error({ err: String(e) }, "Failed to write audit log");
//
//   // Child logger with stable bindings:
//   const log = childLogger({ sessionId: ctx.sessionId, channel: "telegram" });
//   log.info("user message received");
//
// MIGRATION POLICY:
//   - NEW code: use logger.*
//   - EXISTING console.log calls: leave them be — they still work
//   - Migrate opportunistically when already editing a file
//
// CONFIG (via env):
//   LOG_LEVEL=trace|debug|info|warn|error|fatal   (default: info)
//   LOG_FILE_DISABLED=true                        (no file output)
//   LOG_DIR=./data/logs                           (override location)
// =============================================================================

import pino from "pino";
import { join } from "path";
import { mkdirSync, createWriteStream } from "fs";

const LOG_DIR       = process.env.LOG_DIR       || "./data/logs";
const LOG_FILE      = join(LOG_DIR, "admin-agent.log");
const FILE_DISABLED = process.env.LOG_FILE_DISABLED === "true";
const LEVEL         = process.env.LOG_LEVEL     || "info";

// ── Build a pino instance that writes JSON to a file ────────────────────────
// We deliberately do NOT pipe to stdout — the existing chalk console output
// stays as-is for humans. The file is for grep/log-aggregator consumption.

let baseLogger: pino.Logger;

try {
  if (FILE_DISABLED) {
    // No file requested — silent logger (info-level no-op, basically)
    baseLogger = pino({ level: LEVEL, base: { service: "admin-agent", pid: process.pid } });
  } else {
    // Ensure log dir exists (sync — logger is loaded at module init)
    try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* dir issues are non-fatal */ }
    const fileStream = createWriteStream(LOG_FILE, { flags: "a" });
    baseLogger = pino(
      {
        level: LEVEL,
        base:  { service: "admin-agent", pid: process.pid },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      fileStream
    );
  }
} catch (err) {
  // If pino itself fails to boot, fall back to a no-op logger so the
  // application doesn't crash at startup. Logging is best-effort.
  // eslint-disable-next-line no-console
  console.warn("[logger] init failed — using no-op fallback:", err);
  baseLogger = pino({ level: "silent" });
}

export const logger = baseLogger;

/**
 * Create a child logger pre-bound with stable correlation fields.
 * Used by per-session code so every log line carries sessionId/channel.
 */
export function childLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}

/**
 * Flush pending log writes — useful at process shutdown.
 */
export async function flushLogger(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof (logger as any).flush === "function") {
      (logger as any).flush(() => resolve());
    } else {
      resolve();
    }
  });
}
