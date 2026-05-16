// =============================================================================
// Context Compressor — Hermes-inspired conversation compression
//
// When a conversation's estimated token count exceeds the threshold (default
// 50% of the model's context window), this module compresses the middle
// section into a structured summary so the agent never loses context even
// in very long sessions.
//
// Two-phase approach (mirrors Hermes context_compressor.py):
//   Phase 1 — Free:  prune large tool-result blocks to inline summaries
//   Phase 2 — LLM:   summarize the middle into Active Task / Completed /
//                     Key Findings / Remaining Work / Context
//
// Anti-thrash guard: if two consecutive compressions each save < 10%,
// the next check is skipped (prevents pointless LLM calls on already-
// compact conversations).
// =============================================================================

import type { ConversationMessage } from "../types/index.js";

// ─── Token estimation ─────────────────────────────────────────────────────────

/** Rough estimate: 1 token ≈ 4 characters (good enough for threshold checks) */
export function estimateConversationTokens(messages: ConversationMessage[]): number {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      total += Math.ceil(m.content.length / 4);
    } else if (Array.isArray(m.content)) {
      total += Math.ceil(JSON.stringify(m.content).length / 4);
    }
  }
  return total;
}

// ─── Phase 1: free pruning ────────────────────────────────────────────────────

const TOOL_RESULT_KEEP = 300; // chars to keep from each tool result

function pruneToolResults(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.map((m) => {
    if (m.role !== "user" || !Array.isArray(m.content)) return m;

    const pruned = (m.content as any[]).map((b: any) => {
      if (b.type !== "tool_result") return b;

      const raw =
        typeof b.content === "string" ? b.content : JSON.stringify(b.content);
      if (raw.length <= TOOL_RESULT_KEEP) return b; // already compact

      const tokenCount = Math.ceil(raw.length / 4);
      const summary    = raw.slice(0, TOOL_RESULT_KEEP) + `… [${tokenCount}t truncated]`;
      return { ...b, content: summary };
    });

    return { ...m, content: pruned };
  });
}

// ─── Phase 2: LLM summarization ──────────────────────────────────────────────

const COMPRESS_SYSTEM_PROMPT = `You are a conversation summarizer for an AI office assistant.
Summarize the MIDDLE section of a task conversation into a compact structured format.

Output EXACTLY this — no preamble, no explanation:
---COMPRESSED---
**Active Task:** [what the agent is working on right now]
**Completed Actions:**
- [action 1 + outcome]
- [action 2 + outcome]
**Key Findings:** [important data or results discovered so far]
**Remaining Work:** [what still needs to happen to finish the task]
**Must Remember:** [credentials used, names, IDs, or decisions that must not be forgotten]
---END---`;

async function llmSummarize(
  middleText: string,
  apiKey:     string,
  provider:   string,
  model:      string
): Promise<string> {
  const prompt = `Summarize this conversation section:\n\n${middleText}`;

  if (provider === "anthropic") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client    = new Anthropic({ apiKey });
    const resp      = await client.messages.create({
      model,
      max_tokens: 600,
      system:     COMPRESS_SYSTEM_PROMPT,
      messages:   [{ role: "user", content: prompt }],
    });
    return (resp.content.find((b: any) => b.type === "text") as any)?.text ?? "";
  }

  // OpenAI-compatible
  const BASE_URLS: Record<string, string> = {
    openrouter: "https://openrouter.ai/api/v1",
    openai:     "https://api.openai.com/v1",
    deepseek:   "https://api.deepseek.com",
    google:     "https://generativelanguage.googleapis.com/v1beta/openai",
    xai:        "https://api.x.ai/v1",
    alibaba:    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    moonshot:   "https://api.moonshot.cn/v1",
  };
  const baseURL  = BASE_URLS[provider] ?? "https://openrouter.ai/api/v1";
  const headers: Record<string, string> = {
    Authorization:  `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://adminagent.app";
    headers["X-Title"]      = "Admin Agent";
  }

  const res = await fetch(`${baseURL}/chat/completions`, {
    method:  "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [
        { role: "system", content: COMPRESS_SYSTEM_PROMPT },
        { role: "user",   content: prompt },
      ],
    }),
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Anti-thrash state ────────────────────────────────────────────────────────

/** Track the last two compression ratios to detect diminishing returns */
let lastSavedRatios: number[] = [];

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CompressResult {
  messages:    ConversationMessage[];
  savedTokens: number;
  compressed:  boolean;
}

/**
 * Compress a conversation if it exceeds the token threshold.
 *
 * @param messages          Current conversation history
 * @param contextWindowSize Model context window in tokens (default 128k)
 * @param apiKey            Active provider API key
 * @param provider          AI provider name
 * @param model             Model ID to use for the summary call
 * @param threshold         Fraction of context window before compressing (default 0.50)
 */
export async function compressContext(
  messages:          ConversationMessage[],
  apiKey:            string,
  provider:          string,
  model:             string,
  contextWindowSize: number = 128_000,
  threshold:         number = 0.50
): Promise<CompressResult> {
  const tokenLimit   = contextWindowSize * threshold;
  const currentTokens = estimateConversationTokens(messages);

  // Under threshold — nothing to do
  if (currentTokens < tokenLimit) {
    return { messages, savedTokens: 0, compressed: false };
  }

  // Anti-thrash: if the last two compressions each saved < 10%, skip
  if (
    lastSavedRatios.length >= 2 &&
    lastSavedRatios.every((r) => r < 0.10)
  ) {
    lastSavedRatios = []; // reset so the next cycle checks fresh
    return { messages, savedTokens: 0, compressed: false };
  }

  // ── Phase 1: prune large tool results (free) ─────────────────────────────
  const pruned       = pruneToolResults(messages);
  const prunedTokens = estimateConversationTokens(pruned);

  if (prunedTokens < tokenLimit) {
    const saved = currentTokens - prunedTokens;
    lastSavedRatios = [...lastSavedRatios.slice(-1), saved / currentTokens];
    console.log(`  ✓ Context pruned: ${currentTokens}t → ${prunedTokens}t (saved ${Math.round((saved / currentTokens) * 100)}%)`);
    return { messages: pruned, savedTokens: saved, compressed: true };
  }

  // ── Phase 2: LLM summarization of the middle section ─────────────────────
  const HEAD_KEEP = 2;  // always keep: original user request + first assistant reply
  const TAIL_KEEP = 8;  // always keep: last 8 messages (most recent context)

  if (pruned.length <= HEAD_KEEP + TAIL_KEEP) {
    // Too short to split — just return pruned
    return { messages: pruned, savedTokens: currentTokens - prunedTokens, compressed: true };
  }

  const head   = pruned.slice(0, HEAD_KEEP);
  const middle = pruned.slice(HEAD_KEEP, pruned.length - TAIL_KEEP);
  const tail   = pruned.slice(pruned.length - TAIL_KEEP);

  // Build text representation of the middle for the LLM
  const middleText = middle
    .map((m) => {
      if (typeof m.content === "string")
        return `${m.role}: ${m.content.slice(0, 300)}`;

      const parts = (m.content as any[])
        .map((b: any) => {
          if (b.type === "text")        return b.text?.slice(0, 250);
          if (b.type === "tool_use")    return `[TOOL: ${b.name}]`;
          if (b.type === "tool_result")
            return `[RESULT: ${typeof b.content === "string" ? b.content.slice(0, 120) : "..."}]`;
          return null;
        })
        .filter(Boolean);
      return `${m.role}: ${parts.join(" ")}`;
    })
    .join("\n");

  try {
    const summary = await llmSummarize(middleText, apiKey, provider, model);

    if (!summary || !summary.includes("---COMPRESSED---")) {
      // LLM failed — fall back to just the pruned version
      return { messages: pruned, savedTokens: currentTokens - prunedTokens, compressed: true };
    }

    // Inject the summary as a single "user" message replacing the middle
    const compressionMsg: ConversationMessage = {
      role:      "user",
      content:   `[CONTEXT SUMMARY — ${middle.length} messages compressed to save tokens]\n\n${summary}\n\n[Live conversation continues below ↓]`,
      timestamp: Date.now(),
      uuid:      `compress-${Date.now()}`,
    };

    const compressed      = [...head, compressionMsg, ...tail];
    const compressedTokens = estimateConversationTokens(compressed);
    const saved            = currentTokens - compressedTokens;
    const ratio            = saved / currentTokens;

    lastSavedRatios = [...lastSavedRatios.slice(-1), ratio];
    console.log(
      `  ✓ Context compressed: ${currentTokens}t → ${compressedTokens}t ` +
      `(saved ${Math.round(ratio * 100)}%, ${middle.length} msgs → 1 summary)`
    );
    return { messages: compressed, savedTokens: saved, compressed: true };
  } catch {
    // Compression failed — fall back to pruned
    return { messages: pruned, savedTokens: currentTokens - prunedTokens, compressed: true };
  }
}
