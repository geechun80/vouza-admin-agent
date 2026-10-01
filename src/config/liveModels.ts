// =============================================================================
// Live model lists — every model a provider offers, not just our short list
//
// models.ts keeps a short, hand-picked catalog (tested defaults with notes).
// New models ship every week, so the dashboard can also ask the provider:
//
//   OpenRouter — its catalog is public (300+ models from every lab), with
//                price, context size and whether the model can use tools.
//   Others     — the same free, key-checked /models endpoint the key test
//                uses (keyCheckRequest), listing what YOUR key can access.
//   Any        — the person can also type a model ID by hand (dashboard).
//
// Only fetched when the person presses "Show all models" (labelled "setup"
// in the network log), cached for 6 hours. Nothing is sent but the key.
// =============================================================================

import type { AIProvider } from "./models.js";
import { keyCheckRequest } from "./providerEndpoints.js";

export interface LiveModel {
  id:             string;
  name:           string;
  provider:       AIProvider;
  contextWindow?: number;
  /** USD per 1M tokens */
  pricing?:       { input: number; output: number };
  /** true / false when the provider says; undefined when it doesn't */
  tools?:         boolean;
  vision?:        boolean;
  free?:          boolean;
}

const OPENROUTER_CATALOG = "https://openrouter.ai/api/v1/models";
const TTL_MS = 6 * 60 * 60_000;
const cache = new Map<string, { at: number; models: LiveModel[] }>();

type FetchFn = typeof fetch;

/** Not chat models — embeddings, speech, images, moderation… */
const NOT_CHAT = /(embed|whisper|tts|dall-e|moderation|transcribe|realtime|rerank|audio|imagen|-image|image-|veo|aqa|babbage|davinci|computer-use|search-preview|guard)/i;

const perMillion = (perToken: unknown): number | undefined => {
  const n = Number(perToken);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000 * 1000) / 1000 : undefined;
};

export function parseOpenRouterCatalog(json: any): LiveModel[] {
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  return rows
    .filter((m) => typeof m?.id === "string" && m.id)
    .map((m) => {
      const input  = perMillion(m.pricing?.prompt);
      const output = perMillion(m.pricing?.completion);
      const params: string[] = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
      const modalities: string[] = Array.isArray(m.architecture?.input_modalities) ? m.architecture.input_modalities : [];
      return {
        id:            m.id,
        name:          String(m.name || m.id),
        provider:      "openrouter" as AIProvider,
        contextWindow: Number(m.context_length) || undefined,
        pricing:       input !== undefined && output !== undefined ? { input, output } : undefined,
        tools:         params.length ? params.includes("tools") : undefined,
        vision:        modalities.includes("image"),
        free:          input === 0 && output === 0,
      };
    })
    .filter((m) => !NOT_CHAT.test(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseProviderModels(provider: AIProvider, json: any): LiveModel[] {
  let rows: Array<{ id: string; name?: string; context?: number }> = [];
  if (provider === "google") {
    rows = (Array.isArray(json?.models) ? json.models : [])
      .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m: any) => ({
        id:      String(m.name || "").replace(/^models\//, ""),
        name:    m.displayName,
        context: Number(m.inputTokenLimit) || undefined,
      }));
  } else {
    rows = (Array.isArray(json?.data) ? json.data : []).map((m: any) => ({
      id:      String(m?.id || ""),
      name:    m?.display_name || m?.name,
      context: Number(m?.context_window || m?.context_length) || undefined,
    }));
  }
  return rows
    .filter((m) => m.id && !NOT_CHAT.test(m.id))
    .map((m) => ({ id: m.id, name: String(m.name || m.id), provider, contextWindow: m.context }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** OpenRouter's whole public catalog (no key needed). */
export async function listOpenRouterModels(fetchFn: FetchFn = fetch): Promise<LiveModel[]> {
  const hit = cache.get("openrouter");
  if (hit && Date.now() - hit.at < TTL_MS) return hit.models;
  const res = await fetchFn(OPENROUTER_CATALOG, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenRouter answered HTTP ${res.status}`);
  const models = parseOpenRouterCatalog(await res.json());
  cache.set("openrouter", { at: Date.now(), models });
  return models;
}

/** Models the given key can use at a provider. */
export async function listProviderModels(
  provider: AIProvider,
  apiKey: string,
  fetchFn: FetchFn = fetch,
): Promise<LiveModel[]> {
  if (provider === "openrouter") return listOpenRouterModels(fetchFn);
  if (provider === "ollama") throw new Error("Local AI models are listed by Quick Setup.");
  const cacheKey = `${provider}:${apiKey.slice(-6)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.models;
  const { url, headers } = keyCheckRequest(provider, apiKey);
  const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) throw new Error("The saved key was refused — check it in Connect Apps.");
  if (!res.ok) throw new Error(`The provider answered HTTP ${res.status}`);
  const models = parseProviderModels(provider, await res.json());
  cache.set(cacheKey, { at: Date.now(), models });
  return models;
}

/** Already-fetched info for a model id, if any list has it (no network). */
export function cachedModelInfo(id: string): LiveModel | undefined {
  for (const { models } of cache.values()) {
    const m = models.find((x) => x.id === id);
    if (m) return m;
  }
  return undefined;
}

/** A model id a person may save: provider ids, slashes, colons, dots, @ (OpenRouter aliases start with ~). */
export function isValidModelId(id: unknown): id is string {
  return typeof id === "string" && /^~?[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/.test(id);
}

/** Test hook. */
export function __clearModelCacheForTests(): void {
  cache.clear();
}
