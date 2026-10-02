// =============================================================================
// AI Model Registry — Comprehensive catalog of all supported AI providers
// and their model versions with recommendations for agent workloads
// =============================================================================

export interface AIModelInfo {
  id: string;
  displayName: string;
  provider: AIProvider;
  description: string;
  contextWindow: number;
  maxOutput: number;
  recommended?: boolean;
  recommendedReason?: string;
  tier: "flagship" | "balanced" | "fast" | "reasoning";
  /** Wizard shortlist: recommended / budget / most capable (/ premium). Unset → "More models" only. */
  pick?: "recommended" | "budget" | "capable" | "premium";
  pricing: { input: number; output: number }; // per 1M tokens (USD)
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  releaseDate?: string;
}

export type AIProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "deepseek"
  | "alibaba"
  | "moonshot"
  | "openrouter"
  | "ollama";       // local AI on this computer — nothing leaves the machine

// =============================================================================
// Defaults — the ONE place default model choices live. Every other file reads
// from here, so retiring a model is a one-line change.
// =============================================================================

/** Model used when a provider is chosen without a specific model. Ollama: the user picks an installed model. */
export const DEFAULT_MODEL_BY_PROVIDER: Record<AIProvider, string> = {
  anthropic:  "claude-sonnet-5-5",
  openai:     "gpt-5.4-mini",
  google:     "gemini-2.5-flash",
  xai:        "grok-4.3",
  deepseek:   "deepseek-chat",
  alibaba:    "qwen-plus",
  moonshot:   "kimi-k2.6",
  openrouter: "google/gemini-2.5-flash",
  ollama:     "",
};

/** OpenRouter smart routing: cheap model for simple asks, stronger ones as tasks get harder. */
export const DEFAULT_OPENROUTER_TIERS = {
  fast:     "google/gemini-2.5-flash-lite",  // very cheap — simple queries
  balanced: "google/gemini-2.5-flash",       // standard office tasks
  flagship: "anthropic/claude-sonnet-5.5",   // complex / multi-step / vision
} as const;

/** Provider + model for a brand-new install with no key and no operator key. */
export const DEFAULT_PROVIDER: AIProvider = "anthropic";
export const DEFAULT_MODEL = DEFAULT_MODEL_BY_PROVIDER.anthropic;

/** Operator (Vouza built-in key) defaults, overridable with VOUZA_API_PROVIDER / VOUZA_API_MODEL. */
export const DEFAULT_OPERATOR_PROVIDER: AIProvider = "openrouter";
// Kept on the cheapest tier: the built-in key is shared and has a daily cap.
export const DEFAULT_OPERATOR_MODEL = "google/gemini-2.5-flash-lite";

/** Strongest Claude model, for templates that need deep reasoning (Research Agent). */
export const FLAGSHIP_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Free model the setup Guide Bot uses on the operator key (dashboard chat only). */
export const DEFAULT_GUIDE_BOT_MODEL = "google/gemma-4-31b-it:free";

export interface AIProviderConfig {
  id: AIProvider;
  name: string;
  description: string;
  apiKeyEnvVar: string;
  apiKeyPrefix: string;
  apiKeyPlaceholder: string;
  apiKeyHint: string;
  baseUrl?: string;
  docsUrl: string;
}

// =============================================================================
// Provider Definitions
// =============================================================================

export const AI_PROVIDERS: AIProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models — leading in reasoning, safety, and tool use",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    apiKeyPrefix: "sk-ant-",
    apiKeyPlaceholder: "sk-ant-api03-xxxxx",
    apiKeyHint: "https://console.anthropic.com/keys",
    docsUrl: "https://docs.anthropic.com",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT and o-series models — versatile, wide ecosystem",
    apiKeyEnvVar: "OPENAI_API_KEY",
    apiKeyPrefix: "sk-",
    apiKeyPlaceholder: "sk-proj-xxxxx",
    apiKeyHint: "https://platform.openai.com/api-keys",
    docsUrl: "https://platform.openai.com/docs",
  },
  {
    id: "google",
    name: "Google AI",
    description: "Gemini models — strong multimodal and long context",
    apiKeyEnvVar: "GOOGLE_AI_API_KEY",
    apiKeyPrefix: "AI",
    apiKeyPlaceholder: "AIzaSyxxxxx",
    apiKeyHint: "https://aistudio.google.com/apikey",
    docsUrl: "https://ai.google.dev/docs",
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok models — real-time knowledge, fast inference",
    apiKeyEnvVar: "XAI_API_KEY",
    apiKeyPrefix: "xai-",
    apiKeyPlaceholder: "xai-xxxxx",
    apiKeyHint: "https://console.x.ai",
    docsUrl: "https://docs.x.ai",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "Open-weight models — excellent reasoning at low cost",
    apiKeyEnvVar: "DEEPSEEK_API_KEY",
    apiKeyPrefix: "sk-",
    apiKeyPlaceholder: "sk-xxxxx",
    apiKeyHint: "https://platform.deepseek.com/api_keys",
    baseUrl: "https://api.deepseek.com",
    docsUrl: "https://platform.deepseek.com/docs",
  },
  {
    id: "alibaba",
    name: "Alibaba Cloud (Qwen)",
    description: "Qwen models — multilingual, strong in Chinese + English",
    apiKeyEnvVar: "DASHSCOPE_API_KEY",
    apiKeyPrefix: "sk-",
    apiKeyPlaceholder: "sk-xxxxx",
    apiKeyHint: "https://dashscope.console.aliyun.com/apiKey",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    docsUrl: "https://help.aliyun.com/zh/model-studio/",
  },
  {
    id: "moonshot",
    name: "Moonshot AI (Kimi)",
    description: "Kimi models — strong long-context and agentic capabilities",
    apiKeyEnvVar: "MOONSHOT_API_KEY",
    apiKeyPrefix: "sk-",
    apiKeyPlaceholder: "sk-xxxxx",
    apiKeyHint: "https://platform.moonshot.cn/console/api-keys",
    baseUrl: "https://api.moonshot.cn/v1",
    docsUrl: "https://platform.moonshot.cn/docs",
  },
  {
    id: "openrouter",
    name: "OpenRouter (Smart Routing)",
    description: "200+ models via one API — auto-routes tasks to the right model tier for cost efficiency",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    apiKeyPrefix: "sk-or-",
    apiKeyPlaceholder: "sk-or-v1-xxxxx",
    apiKeyHint: "https://openrouter.ai/keys",
    baseUrl: "https://openrouter.ai/api/v1",
    docsUrl: "https://openrouter.ai/docs",
  },
  {
    id: "ollama",
    name: "Local AI (Ollama)",
    description: "Runs on this computer — your conversations never leave it. Needs Ollama installed and a model that supports tools.",
    apiKeyEnvVar: "",
    apiKeyPrefix: "",
    apiKeyPlaceholder: "",
    apiKeyHint: "https://ollama.com/download",
    docsUrl: "https://ollama.com",
  },
];

// =============================================================================
// Model Catalog
// =============================================================================

// Catalog refreshed 2026-10-02. Claude IDs/prices: Anthropic's current model
// table. OpenRouter IDs/prices: checked against openrouter.ai/api/v1/models.
// Other providers: their OpenRouter entries with the vendor prefix removed —
// "Show every … model" in the wizard lists the exact IDs a key can use.
//
// `pick` drives the wizard: each provider shows its recommended / budget /
// most-capable picks first; everything else lives under "More models".
export const AI_MODELS: AIModelInfo[] = [
  // ─── Anthropic ───────────────────────────────────────────────────────────
  m("anthropic", "claude-sonnet-5-5", "Claude Sonnet 5.5", "recommended", "balanced",
    "Fast, accurate and great with tools — the best fit for email, documents and scheduling",
    1_000_000, 128_000, 2, 10, true),
  m("anthropic", "claude-haiku-4-5", "Claude Haiku 4.5", "budget", "fast",
    "Quickest and cheapest Claude — fine for simple questions and short replies",
    200_000, 64_000, 1, 5, true),
  m("anthropic", "claude-opus-5-5", "Claude Opus 5.5", "capable", "flagship",
    "Deepest reasoning for long, multi-step work — reports, analysis, tricky inboxes",
    1_000_000, 128_000, 4, 20, true),
  m("anthropic", "claude-fable-5-1", "Claude Fable 5.1", "premium", "flagship",
    "Anthropic's most capable model for the hardest problems — costs the most and can take longer",
    1_000_000, 128_000, 10, 50, true),

  // ─── OpenAI ──────────────────────────────────────────────────────────────
  m("openai", "gpt-5.4-mini", "GPT-5.4 mini", "recommended", "balanced",
    "Good all-rounder at a sensible price",
    400_000, 128_000, 0.75, 4.5, true),
  m("openai", "gpt-5.4-nano", "GPT-5.4 nano", "budget", "fast",
    "Cheapest GPT — quick answers and simple tasks",
    400_000, 128_000, 0.2, 1.25, false),
  m("openai", "gpt-5.5", "GPT-5.5", "capable", "flagship",
    "OpenAI's most capable model for complex, multi-step work",
    1_050_000, 128_000, 5, 30, true),

  // ─── Google Gemini ───────────────────────────────────────────────────────
  m("google", "gemini-2.5-flash", "Gemini 2.5 Flash", "recommended", "balanced",
    "Fast, low-cost and reliable with tools; huge 1M context",
    1_048_576, 65_536, 0.3, 2.5, true),
  m("google", "gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite", "budget", "fast",
    "Very cheap — good for quick questions and light tasks",
    1_048_576, 65_536, 0.1, 0.4, true),
  m("google", "gemini-2.5-pro", "Gemini 2.5 Pro", "capable", "flagship",
    "Google's strongest stable model for reasoning-heavy work",
    1_048_576, 65_536, 1.25, 10, true),

  // ─── xAI Grok ────────────────────────────────────────────────────────────
  m("xai", "grok-4.3", "Grok 4.3", "recommended", "balanced",
    "Low-cost Grok with a 1M context",
    1_000_000, 64_000, 1.25, 2.5, true),
  m("xai", "grok-4.7", "Grok 4.7", "capable", "flagship",
    "xAI's latest and most capable model",
    500_000, 64_000, 2, 6, true),

  // ─── DeepSeek ────────────────────────────────────────────────────────────
  m("deepseek", "deepseek-chat", "DeepSeek Chat", "recommended", "balanced",
    "Very low cost with solid tool use — DeepSeek keeps it on their latest chat model",
    128_000, 8_192, 0.26, 1.03, false),
  m("deepseek", "deepseek-reasoner", "DeepSeek Reasoner", "capable", "reasoning",
    "Thinks step by step before answering — slower, better for tricky problems",
    128_000, 32_768, 0.5, 2.15, false),

  // ─── Alibaba Qwen ────────────────────────────────────────────────────────
  m("alibaba", "qwen-plus", "Qwen Plus", "recommended", "balanced",
    "Balanced Qwen with a 1M context at a low price",
    1_000_000, 32_768, 0.26, 0.78, false),
  m("alibaba", "qwen-flash", "Qwen Flash", "budget", "fast",
    "Cheapest Qwen — quick and simple tasks",
    1_000_000, 32_768, 0.07, 0.26, false),
  m("alibaba", "qwen3-max", "Qwen3 Max", "capable", "flagship",
    "Alibaba's most capable Qwen",
    262_144, 32_768, 0.78, 3.9, false),

  // ─── Moonshot Kimi ───────────────────────────────────────────────────────
  m("moonshot", "kimi-k2.6", "Kimi K2.6", "recommended", "balanced",
    "Strong at tools and long documents for its price",
    262_144, 32_768, 0.43, 1.83, false),
  m("moonshot", "kimi-k3", "Kimi K3", "capable", "flagship",
    "Moonshot's most capable model, 1M context",
    1_048_576, 32_768, 2.7, 13.5, false),

  // ─── OpenRouter — one key, every lab. Tiers feed Smart Routing. ──────────
  m("openrouter", "google/gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite", "budget", "fast",
    "Very cheap and quick — the default for simple questions",
    1_048_576, 65_536, 0.1, 0.4, true),
  m("openrouter", "deepseek/deepseek-v4-flash", "DeepSeek V4 Flash", undefined, "fast",
    "Ultra-low cost with a 1M context",
    1_048_576, 32_768, 0.042, 0.084, false),
  m("openrouter", "google/gemma-4-31b-it:free", "Gemma 4 31B (free)", undefined, "fast",
    "Free — rate-limited, fine for trying things out",
    262_144, 32_768, 0, 0, false),
  m("openrouter", "google/gemini-2.5-flash", "Gemini 2.5 Flash", "recommended", "balanced",
    "Reliable with tools at a low price — the default for everyday office work",
    1_048_576, 65_536, 0.3, 2.5, true),
  m("openrouter", "openai/gpt-5.4-mini", "GPT-5.4 mini", undefined, "balanced",
    "OpenAI's good all-rounder",
    400_000, 128_000, 0.75, 4.5, true),
  m("openrouter", "qwen/qwen-plus", "Qwen Plus", undefined, "balanced",
    "Low-cost Qwen with a 1M context",
    1_000_000, 32_768, 0.26, 0.78, false),
  m("openrouter", "anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5", "capable", "flagship",
    "Excellent tool use and writing — the default for complex work",
    1_000_000, 128_000, 2, 10, true),
  m("openrouter", "anthropic/claude-opus-5.5", "Claude Opus 5.5", undefined, "flagship",
    "Deepest Claude reasoning for long, multi-step work",
    1_000_000, 128_000, 4, 20, true),
  m("openrouter", "openai/gpt-5.5", "GPT-5.5", undefined, "flagship",
    "OpenAI's most capable model",
    1_050_000, 128_000, 5, 30, true),
  m("openrouter", "google/gemini-2.5-pro", "Gemini 2.5 Pro", undefined, "flagship",
    "Google's strongest stable model",
    1_048_576, 65_536, 1.25, 10, true),
];

/** Compact constructor so each catalog row reads on one screen. */
function m(
  provider: AIProvider,
  id: string,
  displayName: string,
  pick: AIModelInfo["pick"],
  tier: AIModelInfo["tier"],
  description: string,
  contextWindow: number,
  maxOutput: number,
  inputPrice: number,
  outputPrice: number,
  supportsVision: boolean,
): AIModelInfo {
  return {
    id, displayName, provider, description, contextWindow, maxOutput, tier,
    pricing: { input: inputPrice, output: outputPrice },
    supportsTools: true, supportsVision, supportsStreaming: true,
    ...(pick ? { pick } : {}),
    ...(pick === "recommended" ? { recommended: true } : {}),
  };
}

/**
 * Model IDs that used to ship here and no longer work (removed upstream or
 * misspelled). Saved settings are mapped to a working model at load time.
 */
export const RETIRED_MODEL_IDS: Readonly<Record<string, string>> = {
  "meta-llama/llama-3.1-8b-instruct:free": "google/gemini-2.5-flash-lite", // removed from OpenRouter
  "anthropic/claude-sonnet-4-5":           "anthropic/claude-sonnet-4.5",  // OpenRouter spells it with a dot
  "mistralai/mistral-small-3.2":           "mistralai/mistral-small-3.2-24b-instruct",
};

/** A saved model ID, mapped to its working replacement when it was retired. */
export function normalizeModelId(id: string): string;
export function normalizeModelId(id: string | undefined): string | undefined;
export function normalizeModelId(id: string | undefined): string | undefined {
  return id && RETIRED_MODEL_IDS[id] ? RETIRED_MODEL_IDS[id] : id;
}


// =============================================================================
// Helpers
// =============================================================================

/** Get models grouped by provider */
export function getModelsByProvider(): Map<AIProvider, AIModelInfo[]> {
  const map = new Map<AIProvider, AIModelInfo[]>();
  for (const model of AI_MODELS) {
    const list = map.get(model.provider) || [];
    list.push(model);
    map.set(model.provider, list);
  }
  return map;
}

/** Get the 3 recommended models */
export function getRecommendedModels(): AIModelInfo[] {
  return AI_MODELS.filter((m) => m.recommended);
}

/** Find a model by its ID */
export function findModel(modelId: string): AIModelInfo | undefined {
  return AI_MODELS.find((m) => m.id === modelId);
}

/** Find a provider by its ID */
export function findProvider(providerId: AIProvider): AIProviderConfig | undefined {
  return AI_PROVIDERS.find((p) => p.id === providerId);
}

/** Get the provider for a given model ID */
export function getProviderForModel(modelId: string): AIProviderConfig | undefined {
  const model = findModel(modelId);
  if (!model) return undefined;
  return findProvider(model.provider);
}

/** Serialize model catalog for frontend use */
export function getModelCatalogForUI(): Array<{
  provider: AIProviderConfig;
  models: AIModelInfo[];
}> {
  // Local AI is offered through Quick Setup (it lists the models installed on
  // this computer); the Advanced wizard's key-based picker doesn't apply.
  return AI_PROVIDERS.filter((p) => p.id !== "ollama").map((provider) => ({
    provider,
    models: AI_MODELS.filter((m) => m.provider === provider.id),
  }));
}
