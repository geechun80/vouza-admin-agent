// =============================================================================
// Orchestrator barrel + registry.
//
// getPipeline(integration) returns the canonical pipeline for an integration
// name, or null if unknown. The tool layer uses this to look up a pipeline by
// the LLM-provided integration string.
// =============================================================================

export * from "./types.js";
export { runPipeline } from "./runner.js";
export { canonicalizeIntegrationName, knownCanonicalNames } from "./canonicalize.js";

import type { Pipeline } from "./types.js";
import { canonicalizeIntegrationName } from "./canonicalize.js";
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
  // Try canonicalization first so casual aliases ("gcal", "Gmail",
  // "whatsapp web") resolve to the same pipeline as the canonical key.
  const canonical = canonicalizeIntegrationName(integration) ?? integration;
  switch (canonical) {
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

/** Map an integration id (or alias) to the Google pipeline variant flag. */
export function googleVariantFor(integration: string): GoogleVariant | null {
  const canonical = canonicalizeIntegrationName(integration) ?? integration;
  if (canonical === "gmail") return "gmail";
  if (canonical === "google_calendar") return "google_calendar";
  return null;
}
