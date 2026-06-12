// =============================================================================
// Desktop Notifications — fire-and-forget toasts via node-notifier
//
// Used when a scheduled briefing/report is delivered. Must NEVER throw and
// must NEVER block: any failure (missing binary, headless server, WSL,
// permission denial) is silently swallowed after a debug log.
// =============================================================================

import { logger } from "./logger.js";

/**
 * Show a desktop notification. Fire-and-forget: returns immediately,
 * never throws, no-op on any failure.
 */
export function notifyDesktop(title: string, message: string): void {
  void (async () => {
    try {
      // Lazy import so a broken/missing node-notifier can never crash startup
      const mod: any = await import("node-notifier");
      const notifier = mod.default ?? mod;
      notifier.notify(
        {
          title:   String(title).slice(0, 100),
          message: String(message).slice(0, 256),
          wait:    false,
        },
        (err: unknown) => {
          if (err) {
            logger.debug?.({ event: "notify_failed", err: String(err) }, "Desktop notification failed");
          }
        }
      );
    } catch (err) {
      try {
        logger.debug?.({ event: "notify_failed", err: String(err) }, "Desktop notification unavailable");
      } catch { /* even logging must not throw */ }
    }
  })();
}
