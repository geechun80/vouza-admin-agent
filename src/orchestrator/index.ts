// =============================================================================
// Orchestrator barrel + registry.
//
// getPipeline(integration) returns the canonical pipeline for an integration
// name, or null if unknown. The tool layer uses this to look up a pipeline by
// the LLM-provided integration string.
// =============================================================================

export * from "./types.js";
export { runPipeline } from "./runner.js";

import type { Pipeline } from "./types.js";
import { googlePipeline, makeGooglePipeline, type GoogleVariant } from "./pipelines/google.js";
import { telegramPipeline, makeTelegramPipeline } from "./pipelines/telegram.js";
import { whatsappPipeline, makeWhatsAppPipeline } from "./pipelines/whatsapp.js";

export {
  googlePipeline,
  makeGooglePipeline,
  telegramPipeline,
  makeTelegramPipeline,
  whatsappPipeline,
  makeWhatsAppPipeline,
};

/**
 * Resolve a pipeline by integration name. Both "gmail" and "google_calendar"
 * share the Google pipeline — the caller must pass `variant` in the input.
 */
export function getPipeline(integration: string): Pipeline | null {
  switch (integration) {
    case "gmail":
    case "google_calendar":
      return googlePipeline;
    case "telegram":
      return telegramPipeline;
    case "whatsapp":
    case "whatsapp_waha":
    case "whatsapp_baileys":
      return whatsappPipeline;
    default:
      return null;
  }
}

/** Map an integration id to the variant flag expected by the Google pipeline. */
export function googleVariantFor(integration: string): GoogleVariant | null {
  if (integration === "gmail") return "gmail";
  if (integration === "google_calendar") return "google_calendar";
  return null;
}
