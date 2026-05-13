// =============================================================================
// Shared Whisper transcription utility
//
// Used by the Telegram listener and WhatsApp WAHA listener to transcribe
// incoming voice messages in-process, without going through the tool layer.
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

/**
 * Transcribe a raw audio buffer via OpenAI Whisper.
 *
 * @param buffer      Raw audio bytes
 * @param mimeType    MIME type (e.g. "audio/ogg") — inferred from filename if omitted
 * @param filename    Filename with extension — used by Whisper to detect codec
 * @param openaiKey   OpenAI API key
 * @returns           Trimmed transcript string, or null if nothing was detected
 */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  openaiKey: string
): Promise<string | null> {
  if (!openaiKey) throw new Error("OpenAI API key required for Whisper transcription");
  if (!buffer.length) return null;

  const formData = new FormData();
  const blob     = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append("file",            blob, filename);
  formData.append("model",           "whisper-1");
  formData.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method:  "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
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
