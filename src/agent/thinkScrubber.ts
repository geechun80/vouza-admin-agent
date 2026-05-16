// =============================================================================
// Think Scrubber — strips <think>…</think> blocks from agent output
//
// Models like DeepSeek-R1, QwQ, and extended-thinking Claude emit internal
// chain-of-thought inside <think> tags. Those blocks are valuable for the
// model's own reasoning but should never be shown to end-users verbatim —
// they contain raw scratchpad text, uncertainty, and dead-ends.
//
// Usage:
//   import { scrubThinkBlocks, hasThinkBlock } from "./thinkScrubber.js";
//
//   const visible = scrubThinkBlocks(rawText);   // strips all <think>…</think>
//   const hadThought = hasThinkBlock(rawText);   // true if any think block present
// =============================================================================

/**
 * Remove all <think>…</think> blocks from a text string.
 * Handles multi-line content and multiple blocks in one response.
 * The original text is preserved untouched in conversation history;
 * this is applied only to user-visible stream output and memory saves.
 */
export function scrubThinkBlocks(text: string): string {
  if (!text.includes("<think>")) return text; // fast path — most responses have none
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "") // remove all think blocks
    .replace(/\n{3,}/g, "\n\n")               // collapse excess blank lines left behind
    .trimStart();                               // strip any leading whitespace after removal
}

/**
 * Returns true if the text contains at least one <think> block.
 * Used to decide whether to show a "💭 Reasoning…" indicator.
 */
export function hasThinkBlock(text: string): boolean {
  return /<think>/i.test(text);
}

/**
 * Extract raw thought content (without tags) for debugging or logging.
 * Returns an array of all think block contents in order.
 */
export function extractThoughts(text: string): string[] {
  const results: string[] = [];
  const regex = /<think>([\s\S]*?)<\/think>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}
