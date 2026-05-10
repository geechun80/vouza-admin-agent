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
  | "openrouter";

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
];

// =============================================================================
// Model Catalog
// =============================================================================

export const AI_MODELS: AIModelInfo[] = [
  // ─── Anthropic ───────────────────────────────────────────────────────────
  {
    id: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    provider: "anthropic",
    description: "Most powerful Claude — deepest reasoning, hardest multi-step agentic tasks",
    contextWindow: 200000,
    maxOutput: 32000,
    tier: "flagship",
    pricing: { input: 15, output: 75 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-07",
  },
  {
    id: "claude-opus-4-6",
    displayName: "Claude Opus 4.6 (Legacy)",
    provider: "anthropic",
    description: "Previous flagship — still powerful, now superseded by Opus 4.7",
    contextWindow: 200000,
    maxOutput: 32000,
    tier: "flagship",
    pricing: { input: 15, output: 75 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-05",
  },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "Best balance of speed, intelligence, and cost for admin tasks",
    contextWindow: 200000,
    maxOutput: 16000,
    recommended: true,
    recommendedReason: "Best overall for admin agents — fast, accurate tool use, great at structured tasks like email triage and scheduling",
    tier: "balanced",
    pricing: { input: 3, output: 15 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-05",
  },
  {
    id: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Fastest Claude — instant responses for simple tasks",
    contextWindow: 200000,
    maxOutput: 8192,
    tier: "fast",
    pricing: { input: 0.8, output: 4 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-10",
  },

  // ─── OpenAI ──────────────────────────────────────────────────────────────
  {
    id: "gpt-4o",
    displayName: "GPT-4o",
    provider: "openai",
    description: "Flagship multimodal model — strong tool use and reasoning",
    contextWindow: 128000,
    maxOutput: 16384,
    recommended: true,
    recommendedReason: "Strong alternative for admin agents — reliable function calling, wide tool ecosystem, good at multi-step workflows",
    tier: "flagship",
    pricing: { input: 2.5, output: 10 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2024-05",
  },
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    provider: "openai",
    description: "Small, fast, affordable — good for simple admin tasks",
    contextWindow: 128000,
    maxOutput: 16384,
    tier: "fast",
    pricing: { input: 0.15, output: 0.6 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2024-07",
  },
  {
    id: "gpt-4-turbo",
    displayName: "GPT-4 Turbo",
    provider: "openai",
    description: "Previous flagship — still strong for complex tool orchestration",
    contextWindow: 128000,
    maxOutput: 4096,
    tier: "flagship",
    pricing: { input: 10, output: 30 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2024-04",
  },
  {
    id: "o4-mini",
    displayName: "o4-mini",
    provider: "openai",
    description: "Latest reasoning model — efficient chain-of-thought for complex tasks",
    contextWindow: 200000,
    maxOutput: 100000,
    tier: "reasoning",
    pricing: { input: 1.1, output: 4.4 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-04",
  },
  {
    id: "o3",
    displayName: "o3",
    provider: "openai",
    description: "Advanced reasoning — excels at multi-step analysis and planning",
    contextWindow: 200000,
    maxOutput: 100000,
    tier: "reasoning",
    pricing: { input: 2, output: 8 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-04",
  },
  {
    id: "o3-mini",
    displayName: "o3-mini",
    provider: "openai",
    description: "Fast reasoning model — good for analytical admin tasks",
    contextWindow: 200000,
    maxOutput: 100000,
    tier: "reasoning",
    pricing: { input: 1.1, output: 4.4 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-01",
  },
  {
    id: "o1",
    displayName: "o1",
    provider: "openai",
    description: "First-gen reasoning — strong at complex problem solving",
    contextWindow: 200000,
    maxOutput: 100000,
    tier: "reasoning",
    pricing: { input: 15, output: 60 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2024-12",
  },
  {
    id: "o1-mini",
    displayName: "o1-mini",
    provider: "openai",
    description: "Lightweight reasoning — good balance of speed and analysis",
    contextWindow: 128000,
    maxOutput: 65536,
    tier: "reasoning",
    pricing: { input: 1.1, output: 4.4 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2024-09",
  },

  // ─── Google Gemini ───────────────────────────────────────────────────────
  {
    id: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    provider: "google",
    description: "Most capable Gemini — advanced reasoning with thinking",
    contextWindow: 1048576,
    maxOutput: 65536,
    tier: "flagship",
    pricing: { input: 1.25, output: 10 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-03",
  },
  {
    id: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    provider: "google",
    description: "Fast and cost-effective — great for high-volume admin tasks",
    contextWindow: 1048576,
    maxOutput: 65536,
    recommended: true,
    recommendedReason: "Best budget option for admin agents — extremely fast, low cost, handles email triage and data entry at scale",
    tier: "fast",
    pricing: { input: 0.15, output: 0.6 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-04",
  },
  {
    id: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    provider: "google",
    description: "Previous gen fast model — reliable for routine tasks",
    contextWindow: 1048576,
    maxOutput: 8192,
    tier: "fast",
    pricing: { input: 0.1, output: 0.4 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-02",
  },
  {
    id: "gemini-2.0-flash-lite",
    displayName: "Gemini 2.0 Flash Lite",
    provider: "google",
    description: "Ultra-lightweight — lowest cost for simple queries",
    contextWindow: 1048576,
    maxOutput: 8192,
    tier: "fast",
    pricing: { input: 0.075, output: 0.3 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-02",
  },

  // ─── xAI Grok ───────────────────────────────────────────────────────────
  {
    id: "grok-3",
    displayName: "Grok 3",
    provider: "xai",
    description: "Flagship Grok — excellent reasoning with real-time knowledge",
    contextWindow: 131072,
    maxOutput: 16384,
    tier: "flagship",
    pricing: { input: 3, output: 15 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-02",
  },
  {
    id: "grok-3-mini",
    displayName: "Grok 3 Mini",
    provider: "xai",
    description: "Fast reasoning — quick chain-of-thought for analytical tasks",
    contextWindow: 131072,
    maxOutput: 16384,
    tier: "reasoning",
    pricing: { input: 0.3, output: 0.5 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-02",
  },
  {
    id: "grok-2",
    displayName: "Grok 2",
    provider: "xai",
    description: "Previous gen flagship — solid general-purpose model",
    contextWindow: 131072,
    maxOutput: 8192,
    tier: "balanced",
    pricing: { input: 2, output: 10 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2024-08",
  },

  // ─── DeepSeek ────────────────────────────────────────────────────────────
  {
    id: "deepseek-chat",
    displayName: "DeepSeek V3",
    provider: "deepseek",
    description: "Flagship open model — excellent reasoning at very low cost",
    contextWindow: 65536,
    maxOutput: 8192,
    tier: "flagship",
    pricing: { input: 0.27, output: 1.1 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-03",
  },
  {
    id: "deepseek-reasoner",
    displayName: "DeepSeek R1",
    provider: "deepseek",
    description: "Reasoning specialist — chain-of-thought for complex analysis",
    contextWindow: 65536,
    maxOutput: 8192,
    tier: "reasoning",
    pricing: { input: 0.55, output: 2.19 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-01",
  },

  // ─── Alibaba Qwen ───────────────────────────────────────────────────────
  {
    id: "qwen-max",
    displayName: "Qwen Max",
    provider: "alibaba",
    description: "Flagship Qwen — top-tier reasoning and multilingual ability",
    contextWindow: 32768,
    maxOutput: 8192,
    tier: "flagship",
    pricing: { input: 1.6, output: 6.4 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-01",
  },
  {
    id: "qwen-plus",
    displayName: "Qwen Plus",
    provider: "alibaba",
    description: "Balanced Qwen — good performance at moderate cost",
    contextWindow: 131072,
    maxOutput: 8192,
    tier: "balanced",
    pricing: { input: 0.8, output: 2 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-01",
  },
  {
    id: "qwen-turbo",
    displayName: "Qwen Turbo",
    provider: "alibaba",
    description: "Fast Qwen — ultra-low-cost for high-volume tasks",
    contextWindow: 1000000,
    maxOutput: 8192,
    tier: "fast",
    pricing: { input: 0.3, output: 0.6 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-01",
  },
  {
    id: "qwen3-235b-a22b",
    displayName: "Qwen3 235B (MoE)",
    provider: "alibaba",
    description: "Largest Qwen3 — mixture-of-experts for maximum capability",
    contextWindow: 131072,
    maxOutput: 8192,
    tier: "flagship",
    pricing: { input: 1.6, output: 6.4 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-04",
  },
  {
    id: "qwen3-30b-a3b",
    displayName: "Qwen3 30B (MoE)",
    provider: "alibaba",
    description: "Efficient Qwen3 MoE — strong capability at low active parameters",
    contextWindow: 131072,
    maxOutput: 8192,
    tier: "balanced",
    pricing: { input: 0.56, output: 2.24 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-04",
  },

  // ─── Moonshot Kimi ───────────────────────────────────────────────────────
  {
    id: "kimi-k2",
    displayName: "Kimi K2",
    provider: "moonshot",
    description: "Latest Kimi — strong agentic capabilities with MoE architecture",
    contextWindow: 131072,
    maxOutput: 8192,
    tier: "flagship",
    pricing: { input: 1, output: 4 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-03",
  },
  {
    id: "moonshot-v1-128k",
    displayName: "Moonshot v1 128K",
    provider: "moonshot",
    description: "Long-context model — ideal for processing large documents",
    contextWindow: 128000,
    maxOutput: 8192,
    tier: "flagship",
    pricing: { input: 0.84, output: 0.84 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2024-03",
  },
  {
    id: "moonshot-v1-32k",
    displayName: "Moonshot v1 32K",
    provider: "moonshot",
    description: "Standard context — balanced speed and capability",
    contextWindow: 32000,
    maxOutput: 8192,
    tier: "balanced",
    pricing: { input: 0.336, output: 0.336 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2024-03",
  },
  {
    id: "moonshot-v1-8k",
    displayName: "Moonshot v1 8K",
    provider: "moonshot",
    description: "Fast short-context — lowest cost for simple queries",
    contextWindow: 8000,
    maxOutput: 4096,
    tier: "fast",
    pricing: { input: 0.168, output: 0.168 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2024-03",
  },

  // ─── OpenRouter ── Fast Tier (cheap, simple tasks) ──────────────────────
  {
    id: "meta-llama/llama-3.1-8b-instruct",
    displayName: "Llama 3.1 8B",
    provider: "openrouter",
    description: "Ultra-cheap fast tier — simple queries, yes/no, status checks",
    contextWindow: 128000,
    maxOutput: 4096,
    recommended: false,
    tier: "fast",
    pricing: { input: 0.02, output: 0.05 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2024-07",
  },
  {
    id: "mistralai/mistral-nemo",
    displayName: "Mistral NeMo",
    provider: "openrouter",
    description: "Tiny, fast, cheap — good for simple reformatting and short answers",
    contextWindow: 128000,
    maxOutput: 4096,
    tier: "fast",
    pricing: { input: 0.02, output: 0.03 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2024-07",
  },
  {
    id: "qwen/qwen3-8b",
    displayName: "Qwen3 8B",
    provider: "openrouter",
    description: "Compact multilingual model — fast and cheap for routine tasks",
    contextWindow: 128000,
    maxOutput: 4096,
    tier: "fast",
    pricing: { input: 0.05, output: 0.4 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-04",
  },

  // ─── OpenRouter — Balanced Tier (standard office tasks) ──────────────────
  {
    id: "google/gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    provider: "openrouter",
    description: "Default balanced tier — fast, multimodal, optional reasoning, ideal for email/calendar/files",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommended: true,
    recommendedReason: "Best default for OpenRouter balanced tier — 1M context, multimodal, extremely low cost",
    tier: "balanced",
    pricing: { input: 0.07, output: 0.3 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-04",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    displayName: "Llama 3.3 70B",
    provider: "openrouter",
    description: "Capable open model — strong instruction following for standard tasks",
    contextWindow: 128000,
    maxOutput: 4096,
    tier: "balanced",
    pricing: { input: 0.07, output: 0.2 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2024-12",
  },
  {
    id: "mistralai/mistral-small-3.2",
    displayName: "Mistral Small 3.2",
    provider: "openrouter",
    description: "Latest Mistral small — efficient tool use for routine office automation",
    contextWindow: 128000,
    maxOutput: 4096,
    tier: "balanced",
    pricing: { input: 0.05, output: 0.15 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-03",
  },

  // ─── OpenRouter — Flagship Tier (complex tasks, analysis, vision) ─────────
  {
    id: "google/gemini-3-flash-preview",
    displayName: "Gemini 3 Flash Preview",
    provider: "openrouter",
    description: "Default flagship tier — multimodal (text/image/audio/video/PDF), reasoning levels, low-cost agentic",
    contextWindow: 1000000,
    maxOutput: 16384,
    recommended: true,
    recommendedReason: "Best flagship for OpenRouter — 1M context, full multimodal, reasoning control, ideal for complex agentic workflows",
    tier: "flagship",
    pricing: { input: 0.15, output: 0.6 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-05",
  },
  {
    id: "google/gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    provider: "openrouter",
    description: "Premium Gemini — state-of-the-art reasoning with 1M context and full multimodal",
    contextWindow: 1000000,
    maxOutput: 32768,
    tier: "flagship",
    pricing: { input: 1.25, output: 10 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-03",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    provider: "openrouter",
    description: "1.6T param MoE — excellent coding, math, and complex reasoning at low cost",
    contextWindow: 1000000,
    maxOutput: 16384,
    tier: "flagship",
    pricing: { input: 0.14, output: 0.28 },
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    releaseDate: "2025-05",
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5 (via OpenRouter)",
    provider: "openrouter",
    description: "Anthropic flagship via OpenRouter — excellent tool use, analysis, and structured output",
    contextWindow: 200000,
    maxOutput: 16000,
    tier: "flagship",
    pricing: { input: 3, output: 15 },
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    releaseDate: "2025-05",
  },
];

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
  return AI_PROVIDERS.map((provider) => ({
    provider,
    models: AI_MODELS.filter((m) => m.provider === provider.id),
  }));
}
