// =============================================================================
// Task Complexity Router — Smart model selection for OpenRouter
//
// Classifies every user message into one of three tiers and picks the
// matching model, keeping costs low without sacrificing quality.
//
// Tier | Best for                                    | Default model
// ─────┼─────────────────────────────────────────────┼──────────────────────────────────────
// fast │ Short queries, status checks, yes/no        │ meta-llama/llama-3.1-8b-instruct:free
// balanced │ Email drafting, scheduling, file ops     │ google/gemini-2.5-flash-lite
// flagship │ Analysis, reports, image processing,    │ google/gemini-2.5-flash
//          │ multi-step agentic workflows             │
// =============================================================================

export type TaskComplexity = "fast" | "balanced" | "flagship";

export interface OpenRouterTiers {
  fast:     string;   // cheap model — simple tasks
  balanced: string;   // mid-tier — standard office tasks
  flagship: string;   // premium — complex/multi-step/vision tasks
}

export const DEFAULT_OPENROUTER_TIERS: OpenRouterTiers = {
  fast:     "meta-llama/llama-3.1-8b-instruct:free",  // Free tier on OpenRouter — no credits needed
  balanced: "google/gemini-2.5-flash-lite",            // Ultra-low cost (~$0.10/1M tokens)
  flagship: "google/gemini-2.5-flash",                  // Capable multimodal model
};

export const TIER_LABELS: Record<TaskComplexity, string> = {
  fast:     "⚡ Fast model (simple task)",
  balanced: "⚖️ Balanced model (standard task)",
  flagship: "🚀 Flagship model (complex task)",
};

// ─── Classification signals ──────────────────────────────────────────────────

/** Words/phrases that indicate a complex task needing the flagship model */
const FLAGSHIP_SIGNALS: string[] = [
  // Analysis
  "analyze", "analysis", "deep dive", "examine", "evaluate", "assess",
  // Reporting / generation
  "generate report", "create report", "write report", "build report",
  "generate a", "create a document", "draft a report", "prepare a",
  // Research
  "research", "find out about", "investigate", "look into",
  // Comparison
  "compare", "contrast", "versus", "vs ", "differences between",
  // Strategy / planning
  "strategy", "strategic", "plan of action", "roadmap", "recommend",
  "advise", "suggest the best", "what should i", "how should i",
  // Vision / files
  "image", "photo", "screenshot", "picture", "diagram",
  "pdf", "invoice", "receipt", "document", "scan",
  // Data
  "insights", "trends", "patterns", "statistics", "figures", "numbers from",
  "data from", "summarize the data", "pivot",
  // Long output
  "comprehensive", "detailed", "thorough", "complete", "full breakdown",
  "step by step", "in depth", "exhaustive",
  // Multi-step
  "then", "after that", "followed by", "and also", "and then", "next",
  "first", "second", "third", "finally",                          // ordinals imply multi-step
  "multiple", "several", "all of", "batch", "bulk", "every",
  // Automation
  "automate", "workflow", "pipeline", "process all",
  // Heavy tasks
  "organize all", "go through all", "review all", "triage all",
  "extract all", "convert",
];

/** Words/phrases that indicate a simple task suited to the fast model */
const FAST_SIGNALS: string[] = [
  // Status / info lookups
  "what time", "what date", "what day", "what's the",
  "who is", "when is", "where is", "how many", "how much", "how long",
  // Listing (short)
  "list my", "list the", "show me", "show my",
  "check my", "check the", "what are my",
  // Conversational filler
  "yes", "no", "ok", "okay", "sure", "thanks", "thank you",
  "hello", "hi ", "hey ", "good morning", "good afternoon", "good evening",
  "help", "what can you do", "can you help",
  // Quick actions
  "remind me", "set a reminder", "ping me",
  "quick question", "simple question", "quick check",
  // Follow-ups
  "got it", "understood", "makes sense", "sounds good", "perfect",
  "continue", "go ahead", "proceed",
];

// ─── Classifier ──────────────────────────────────────────────────────────────

/**
 * Classify the complexity of a user message to select the right model tier.
 *
 * Priority order:
 *   1. Image present → flagship (vision required)
 *   2. Very short message (≤ 4 words) → fast
 *   3. ≥ 2 flagship signals → flagship
 *   4. 1 flagship signal + long message (> 20 words) → flagship
 *   5. Very long or multi-sentence → flagship
 *   6. ≥ 2 fast signals, no flagship signals → fast
 *   7. 1 fast signal + short message → fast
 *   8. Default → balanced
 */
export function classifyTask(
  message: string | unknown[],
  hasImage = false
): TaskComplexity {
  // Vision tasks always need the flagship model
  if (hasImage) return "flagship";

  // Extract text content
  const rawText =
    typeof message === "string"
      ? message
      : ((message as any[]).find((b: any) => b?.type === "text")?.text ?? "");

  const text = rawText.toLowerCase().trim();
  if (!text) return "balanced";

  const wordCount = text.split(/\s+/).length;

  // ① Very short → fast
  if (wordCount <= 4) return "fast";

  // ② Count signal hits
  const flagshipHits = FLAGSHIP_SIGNALS.filter((s) => text.includes(s)).length;
  const fastHits     = FAST_SIGNALS.filter((s) => text.includes(s)).length;

  // ③ Multiple flagship signals → definitely complex
  if (flagshipHits >= 2) return "flagship";

  // ④ One flagship signal in a long message
  if (flagshipHits >= 1 && wordCount > 20) return "flagship";

  // ⑤ Sentence/word-count heuristics
  const sentenceCount = (text.match(/[.!?]+\s/g) || []).length + 1;
  if (sentenceCount >= 3 || wordCount > 45) return "flagship";
  if (sentenceCount >= 2 || wordCount > 22) return "balanced";

  // ⑥ Multiple fast signals, no flagship
  if (fastHits >= 2 && flagshipHits === 0) return "fast";

  // ⑦ One fast signal in a short message
  if (fastHits >= 1 && wordCount <= 14 && flagshipHits === 0) return "fast";

  return "balanced";
}

/**
 * Pick the model ID for a given complexity and tier configuration.
 */
export function selectModelForComplexity(
  complexity: TaskComplexity,
  tiers: OpenRouterTiers
): string {
  return tiers[complexity];
}
