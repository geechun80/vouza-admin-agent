// =============================================================================
// Redactor — strips secrets from text before writing to disk
//
// Applied before any persistent write: skill files (data/skills/), memory
// entries (data/memory/), and performance logs. This prevents API keys,
// tokens, and passwords from leaking into local storage even if the user
// accidentally typed them into the chat or a tool result included them.
//
// Approach: pattern-match known secret formats + generic keyword-proximity
// heuristics. We err on the side of over-redacting — false positives (a
// 40-char random string being redacted) are less harmful than leaked keys.
// =============================================================================

const REDACT_LABEL = "[REDACTED]";

/** Compiled patterns — each matches a known secret format */
const SECRET_PATTERNS: RegExp[] = [
  // Anthropic API key (sk-ant-...)
  /sk-ant-[a-zA-Z0-9\-_]{90,}/g,
  // OpenAI API key (sk-...)
  /sk-[a-zA-Z0-9]{48,}/g,
  // OpenRouter key (sk-or-v1-...)
  /sk-or-v1-[a-f0-9A-F]{60,}/g,
  // Groq key (gsk_...)
  /gsk_[a-zA-Z0-9]{50,}/g,
  // Google AI / GCP API key (AIza...)
  /AIza[0-9A-Za-z\-_]{35}/g,
  // xAI key (xai-...)
  /xai-[a-zA-Z0-9]{60,}/g,
  // DeepSeek / Moonshot / generic (starts with "sk-" or similar + long)
  /(?:sk|rk|ak|pk)-[a-zA-Z0-9]{40,}/g,
  // GitHub Personal Access Token
  /gh[pousr]_[a-zA-Z0-9]{36}/g,
  // Telegram bot token (digits:base64-ish)
  /\b\d{8,12}:[A-Za-z0-9_\-]{35}\b/g,
  // Bearer tokens in Authorization headers
  /Bearer\s+[a-zA-Z0-9\-_.~+/]{20,}/gi,
  // Twilio credentials (ACxxxxxxxx / SKxxxxxxxx)
  /\b(AC|SK)[a-f0-9]{32}\b/g,
  // Generic: any 40+ char hex or base64 string after a credential label
  /(?:api[_\-]?key|access[_\-]?token|auth[_\-]?token|bot[_\-]?token|secret|password|passwd|credential)["']?\s*[:=]\s*["']?([a-zA-Z0-9\-_.~+/=]{20,})["']?/gi,
];

/**
 * Redact all detectable secrets from a string.
 *
 * Safe to call on any text — returns the original string unchanged if no
 * patterns match (fast path). Non-secret content is never modified.
 */
export function redact(text: string): string {
  if (!text) return text;
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global patterns between calls
    pattern.lastIndex = 0;
    result = result.replace(pattern, (match, group1) => {
      // String.replace callback signature differs by capture-group count:
      //   no capture groups:    (match, offset, string)        → group1 is a NUMBER (offset)
      //   with capture groups:  (match, p1, …, offset, string) → group1 is a STRING (captured value)
      // Type-check ensures we only do partial replacement when there's a real capture.
      if (typeof group1 === "string") {
        return match.replace(group1, REDACT_LABEL);
      }
      return REDACT_LABEL;
    });
  }
  return result;
}

/**
 * Redact an object's string values recursively.
 * Useful for redacting JSON config snippets or tool results.
 */
export function redactObject(obj: unknown): unknown {
  if (typeof obj === "string") return redact(obj);
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactObject(value);
    }
    return result;
  }
  return obj;
}

/**
 * Returns true if the text appears to contain a secret.
 * Used for pre-save warnings in dev/debug mode.
 */
export function containsSecret(text: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}
