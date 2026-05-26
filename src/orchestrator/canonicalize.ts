// =============================================================================
// Integration Name Canonicalizer
//
// Maps user/LLM-provided integration names to canonical pipeline keys.
// Defensive: handles spaces, hyphens, underscores, case, and common aliases
// (product names, abbreviations, common typos that are close enough).
//
// Why: LLMs hand us "google cal" / "Gmail" / "WhatsApp Web" with no warning.
// Rather than fail strict-match validation and confuse the user, normalize
// here so the downstream pipeline registry always sees a canonical key.
//
// Returning null is intentional — we do NOT pretend to accept every string.
// Unknown names should fall through so the caller can take its own path
// (e.g. legacy direct-save in save_integration_credentials).
// =============================================================================

const ALIAS_MAP: Record<string, string> = {
  // gmail family
  "gmail":        "gmail",
  "google mail":  "gmail",
  "googlemail":   "gmail",
  "email":        "gmail",   // ambiguous, but Gmail is the most common intent
  "smtp":         "gmail",   // App Password path is SMTP under the hood

  // calendar family
  "google calendar": "google_calendar",
  "googlecalendar":  "google_calendar",
  "gcal":            "google_calendar",
  "google cal":      "google_calendar",
  "calendar":        "google_calendar",

  // telegram
  "telegram":     "telegram",
  "tg":           "telegram",
  "telegram bot": "telegram",

  // whatsapp
  "whatsapp":     "whatsapp",
  "whats app":    "whatsapp",
  "whatsapp web": "whatsapp",
  "wa":           "whatsapp",
  "wapp":         "whatsapp",
};

/**
 * Resolve a free-form integration name to its canonical pipeline key.
 * Returns null for unknown / empty / non-string input.
 */
export function canonicalizeIntegrationName(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const normalized = raw
    .toLowerCase()
    .trim()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return null;
  return ALIAS_MAP[normalized] ?? null;
}

/** Unique canonical keys this module is willing to resolve to. */
export function knownCanonicalNames(): string[] {
  return Array.from(new Set(Object.values(ALIAS_MAP)));
}
