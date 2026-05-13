// =============================================================================
// Shared Whisper transcription utility
//
// Supports two providers — both are API-compatible (same request format):
//   OpenAI Whisper  — https://api.openai.com/v1/audio/transcriptions
//                     model: whisper-1   ($0.006/min)
//   Groq Whisper    — https://api.groq.com/openai/v1/audio/transcriptions
//                     model: whisper-large-v3-turbo   (Free tier available, ~10× faster)
//
// Priority order when resolving which key to use:
//   1. Explicit whisperApiKey on AgentConfig (set from the Voice Transcription
//      tool card in the setup wizard — provider is whisperProvider)
//   2. openai key from apiKeys (user has OpenAI as their main AI provider)
//   3. No key → returns null, callers show a helpful error
// =============================================================================

const MIME_TYPES: Record<string, string> = {
  ".ogg":  "audio/ogg",
  ".oga":  "audio/ogg",
  ".mp3":  "audio/mpeg",
  ".mp4":  "audio/mp4",
  ".m4a":  "audio/mp4",
  ".wav":  "audio/wav",
  ".webm": "audio/webm",
  ".flac": "audio/flac",
  ".opus": "audio/ogg",
};

export interface WhisperConfig {
  apiKey:  string;
  baseUrl: string;
  model:   string;
  provider: "openai" | "groq";
}

/**
 * Resolve which Whisper endpoint and key to use from an agent config.
 * Returns null if no suitable key is configured.
 */
export function resolveWhisperConfig(config: {
  whisperApiKey?:   string;
  whisperProvider?: string;
  apiKeys?:         Record<string, string>;
}): WhisperConfig | null {
  // 1. Explicit voice tool card config (wizard step 2 → Voice Transcription card)
  if (config.whisperApiKey) {
    const provider = config.whisperProvider === "groq" ? "groq" : "openai";
    return provider === "groq"
      ? { apiKey: config.whisperApiKey, baseUrl: "https://api.groq.com/openai/v1",  model: "whisper-large-v3-turbo", provider: "groq"  }
      : { apiKey: config.whisperApiKey, baseUrl: "https://api.openai.com/v1",       model: "whisper-1",              provider: "openai" };
  }

  // 2. Fall back to OpenAI key in apiKeys (user has OpenAI as their main AI provider)
  const openaiKey = config.apiKeys?.openai;
  if (openaiKey) {
    return { apiKey: openaiKey, baseUrl: "https://api.openai.com/v1", model: "whisper-1", provider: "openai" };
  }

  return null; // no Whisper-capable key found
}

/**
 * Transcribe a raw audio buffer via Whisper (OpenAI or Groq).
 *
 * @param buffer      Raw audio bytes
 * @param mimeType    MIME type string (e.g. "audio/ogg")
 * @param filename    Filename with extension — used by Whisper to detect codec
 * @param whisperCfg  Resolved config from resolveWhisperConfig()
 * @returns           Trimmed transcript string, or null if nothing was detected
 */
export async function transcribeAudioBuffer(
  buffer:     Buffer,
  mimeType:   string,
  filename:   string,
  whisperCfg: WhisperConfig
): Promise<string | null>;

/**
 * Legacy overload — accepts a plain OpenAI key string for backward compatibility.
 * Uses OpenAI Whisper endpoint.
 */
export async function transcribeAudioBuffer(
  buffer:    Buffer,
  mimeType:  string,
  filename:  string,
  openaiKey: string
): Promise<string | null>;

export async function transcribeAudioBuffer(
  buffer:          Buffer,
  mimeType:        string,
  filename:        string,
  keyOrCfg:        WhisperConfig | string
): Promise<string | null> {
  if (!buffer.length) return null;

  const cfg: WhisperConfig = typeof keyOrCfg === "string"
    ? { apiKey: keyOrCfg, baseUrl: "https://api.openai.com/v1", model: "whisper-1", provider: "openai" }
    : keyOrCfg;

  if (!cfg.apiKey) throw new Error("Whisper API key is required");

  const formData = new FormData();
  const blob     = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append("file",            blob, filename);
  formData.append("model",           cfg.model);
  formData.append("response_format", "json");

  const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body:    formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.text ?? "").trim();
  return text || null;
}

/** Resolve MIME type from a filename extension. */
export function mimeFromFilename(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] ?? "audio/ogg";
}

/** Human-readable label for a whisper provider. */
export function whisperProviderLabel(provider: "openai" | "groq"): string {
  return provider === "groq" ? "Groq Whisper (Free)" : "OpenAI Whisper";
}

/** No-config error message shown to users when no Whisper key is set. */
export const WHISPER_NO_KEY_MSG =
  "🎙️ Voice transcription requires a free Groq API key or an OpenAI API key.\n" +
  "• Groq (free & fast): console.groq.com/keys\n" +
  "• OpenAI: platform.openai.com/api-keys\n" +
  "Add it in the setup wizard → Step 2 → Voice Transcription card.";
