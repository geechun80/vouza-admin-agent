// =============================================================================
// Start word — "is this note in 'Message yourself' meant for the assistant?"
//
// When the assistant is linked to the owner's own WhatsApp ("personal" mode),
// "Message yourself" is also the owner's notes chat. Only messages that start
// with the assistant's name ("Vee, find my insurance policy") are instructions;
// everything else there stays private and is ignored.
// =============================================================================

export const DEFAULT_WAKE_WORD = "Vee";

/** Built-in names that make a clumsy start word ("AdminAgent, …"). */
const GENERIC_NAMES = new Set(["", "admin agent", "adminagent", "admin-agent", "assistant", "agent", "my assistant"]);

/** The start word to use when none is saved: the assistant's name, unless it's a generic default. */
export function defaultWakeWord(agentName?: string | null): string {
  const name = String(agentName ?? "").trim();
  return GENERIC_NAMES.has(name.toLowerCase()) ? DEFAULT_WAKE_WORD : name;
}

/** A start word as saved from the dashboard: trimmed, at most 30 characters, no line breaks. */
export function cleanWakeWord(raw: unknown): string {
  return String(raw ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 30);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does `text` start with the start word? Accepts "Vee, …", "vee: …", "@Vee …",
 * "Hi Vee …" / "Hey Vee …" / "OK Vee …". Returns the instruction without it.
 * An empty start word means every message counts.
 */
export function matchWakeWord(text: string, word: string): { matched: boolean; rest: string } {
  const body = String(text ?? "");
  const w = cleanWakeWord(word);
  if (!w) return { matched: true, rest: body.trim() };
  const re = new RegExp(
    `^\\s*(?:(?:hi|hey|hello|ok|okay)[\\s,]+)?@?${escapeRe(w)}(?![\\p{L}\\p{N}])[\\s,:;.!?\\-\\u2013\\u2014]*`,
    "iu",
  );
  const m = body.match(re);
  if (!m) return { matched: false, rest: body.trim() };
  return { matched: true, rest: body.slice(m[0].length).trim() };
}
