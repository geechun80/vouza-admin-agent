// =============================================================================
// AI provider endpoints — the ONE place they live
//
// Before this, seven files each kept their own copy of the provider URLs (and
// they disagreed: one used China-region Alibaba, another a guessed
// "api.<provider>.com" that is wrong for xAI, Alibaba and Moonshot). Unknown
// providers silently fell back to OpenRouter, so a local-AI user's
// conversation could have been sent to the cloud. Everything now resolves
// here, and an unknown provider is an error, never a cloud fallback.
//
//   baseUrlFor()       — OpenAI-compatible base URL (chat/completions)
//   keyCheckRequest()  — an AUTH-GATED request that 401s for a bad key and
//                        costs nothing (Rule 66). Never a paid completion.
//   openRouterHeaders()— app attribution sent to OpenRouter, configurable
// =============================================================================

import type { AIProvider } from "./models.js";

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";

const CLOUD_BASE_URLS: Record<Exclude<AIProvider, "ollama">, string> = {
  anthropic:  "https://api.anthropic.com/v1",
  openai:     "https://api.openai.com/v1",
  google:     "https://generativelanguage.googleapis.com/v1beta/openai",
  xai:        "https://api.x.ai/v1",
  deepseek:   "https://api.deepseek.com",
  alibaba:    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  moonshot:   "https://api.moonshot.cn/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

/** Local AI address: config, then OLLAMA_BASE_URL, then the default. Always ends in /v1. */
export function ollamaBaseUrl(configured?: string | null): string {
  const raw = (configured || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).trim().replace(/\/+$/, "");
  return raw.endsWith("/v1") ? raw : `${raw}/v1`;
}

/** OpenAI-compatible base URL for a provider. Throws for unknown providers (no silent cloud fallback). */
export function baseUrlFor(provider: AIProvider, opts: { ollamaBaseUrl?: string | null } = {}): string {
  if (provider === "ollama") return ollamaBaseUrl(opts.ollamaBaseUrl);
  const url = CLOUD_BASE_URLS[provider];
  if (!url) throw new Error(`Unknown AI provider "${provider}"`);
  return url;
}

/** true when the provider runs on this computer — nothing is sent to the internet. */
export function isLocalProvider(provider: AIProvider): boolean {
  return provider === "ollama";
}

/** Who we tell OpenRouter we are. Override with VOUZA_APP_URL / VOUZA_APP_NAME. */
export function openRouterHeaders(): Record<string, string> {
  return {
    "HTTP-Referer": (process.env.VOUZA_APP_URL || "https://vouza.ai").trim(),
    "X-Title":      (process.env.VOUZA_APP_NAME || "Vouza Admin Agent").trim(),
  };
}

/**
 * A free, auth-gated request that proves a key works: 200 = good key,
 * 400/401/403 = bad key. Never a paid completion.
 */
export function keyCheckRequest(
  provider: AIProvider,
  key: string,
  opts: { ollamaBaseUrl?: string | null } = {},
): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case "anthropic":
      return { url: "https://api.anthropic.com/v1/models", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    case "openrouter":
      // /api/v1/models is PUBLIC (200 for any key) — /api/v1/key is not.
      return { url: "https://openrouter.ai/api/v1/key", headers: { Authorization: `Bearer ${key}` } };
    case "google":
      return { url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, headers: {} };
    case "ollama":
      // No key — just "is the local AI running?" (/api/tags lives at the root, not under /v1).
      return { url: `${ollamaBaseUrl(opts.ollamaBaseUrl).replace(/\/v1$/, "")}/api/tags`, headers: {} };
    default:
      return { url: `${baseUrlFor(provider)}/models`, headers: { Authorization: `Bearer ${key}` } };
  }
}
