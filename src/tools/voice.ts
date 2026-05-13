// =============================================================================
// Voice Transcription Tools — OpenAI Whisper integration
//
// transcribe_audio       — transcribes an audio file to text
// transcribe_and_summarize — transcribes + structures as a typed report
//
// Supported audio formats: .mp3 .mp4 .m4a .wav .webm .ogg .flac
// Requires an OpenAI API key (Whisper only runs on OpenAI infrastructure).
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import { readFile } from "fs/promises";
import { extname, basename } from "path";
import { resolveWhisperConfig, mimeFromFilename, WHISPER_NO_KEY_MSG } from "../voice/transcriber.js";

const AUDIO_EXTS = new Set([".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm", ".ogg", ".flac"]);

const MIME_TYPES: Record<string, string> = {
  ".mp3":  "audio/mpeg",
  ".mp4":  "audio/mp4",
  ".mpeg": "audio/mpeg",
  ".mpga": "audio/mpeg",
  ".m4a":  "audio/mp4",
  ".wav":  "audio/wav",
  ".webm": "audio/webm",
  ".ogg":  "audio/ogg",
  ".flac": "audio/flac",
};

// ─── Whisper API call ─────────────────────────────────────────────────────────

async function callWhisper(
  context: any,
  audioBuffer: Buffer,
  filename: string,
  language?: string,
  prompt?: string
): Promise<{ text: string; language: string; duration?: number }> {
  const cfg = resolveWhisperConfig(context?.config ?? {});
  if (!cfg) throw new Error(WHISPER_NO_KEY_MSG);

  const ext      = extname(filename).toLowerCase();
  const mimeType = MIME_TYPES[ext] ?? mimeFromFilename(filename);

  const formData = new FormData();
  const blob     = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append("file",            blob, filename);
  formData.append("model",           cfg.model);
  formData.append("response_format", "verbose_json");
  if (language) formData.append("language", language);
  if (prompt)   formData.append("prompt",   prompt);

  const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body:    formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error (${res.status}): ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  return {
    text:     (data.text ?? "").trim(),
    language: data.language ?? language ?? "unknown",
    duration: data.duration,
  };
}

// ─── transcribe_audio ─────────────────────────────────────────────────────────

export const transcribeAudioTool = buildTool({
  name: "transcribe_audio",
  description:
    "Transcribe a local audio file to text using OpenAI Whisper. " +
    "Supports: .mp3 .mp4 .m4a .wav .webm .ogg .flac. " +
    "Language is auto-detected unless you specify it. " +
    "Requires an OpenAI API key — if none is configured, the tool will say so.",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    filePath: z.string().describe("Absolute path to the audio file"),
    language: z.string().optional().describe(
      "ISO-639-1 language code (e.g. 'en', 'zh', 'ms', 'ja'). " +
      "Omit to auto-detect."
    ),
    context: z.string().optional().describe(
      "Optional hint to improve accuracy (e.g. 'Sales meeting', 'Medical consultation')"
    ),
  }),
  async call(input, ctx): Promise<any> {
    try {
      const cfg = resolveWhisperConfig(ctx?.config ?? {});
      if (!cfg) return { success: false, error: WHISPER_NO_KEY_MSG };

      const ext = extname(input.filePath).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) {
        return {
          success: false,
          error: `Unsupported audio format: "${ext}". Supported formats: ${[...AUDIO_EXTS].join(", ")}`,
        };
      }

      const buffer   = await readFile(input.filePath);
      const filename = basename(input.filePath);
      const result   = await callWhisper(ctx, buffer, filename, input.language, input.context);

      return {
        success: true,
        data: {
          transcript:    result.text,
          language:      result.language,
          duration:      result.duration != null ? `${Math.round(result.duration)}s` : undefined,
          wordCount:     result.text.split(/\s+/).filter(Boolean).length,
          filePath:      input.filePath,
          whisperEngine: cfg.provider,
        },
      };
    } catch (err) {
      return { success: false, error: `Transcription failed: ${err}` };
    }
  },
});

// ─── transcribe_and_summarize ─────────────────────────────────────────────────

const REPORT_PROMPTS: Record<string, { label: string; instructions: string }> = {
  meeting: {
    label: "Meeting Notes",
    instructions:
      "From this transcript, extract and structure:\n" +
      "1. **Attendees** — names/roles mentioned\n" +
      "2. **Topics Discussed** — main agenda items with brief descriptions\n" +
      "3. **Key Decisions** — decisions made during the meeting\n" +
      "4. **Action Items** — tasks with owner and deadline (if mentioned)\n" +
      "5. **Next Steps / Follow-ups** — what happens next",
  },
  interview: {
    label: "Interview Summary",
    instructions:
      "From this transcript, extract and structure:\n" +
      "1. **Participants** — interviewer and interviewee names/roles\n" +
      "2. **Questions Asked** — key questions with the corresponding answers\n" +
      "3. **Notable Insights** — important quotes or observations\n" +
      "4. **Assessment Themes** — patterns or themes in the responses\n" +
      "5. **Recommendation** — overall assessment or next steps",
  },
  voice_memo: {
    label: "Voice Memo Summary",
    instructions:
      "From this transcript, produce:\n" +
      "1. **Summary** — 2-3 sentence overview\n" +
      "2. **Key Points** — bullet list of main ideas\n" +
      "3. **Tasks Mentioned** — any to-dos or commitments\n" +
      "4. **Deadlines** — any dates or timeframes mentioned\n" +
      "5. **Follow-up Needed** — who needs to do what",
  },
  lecture: {
    label: "Lecture Notes",
    instructions:
      "From this transcript, extract and structure:\n" +
      "1. **Topic Overview** — what was covered\n" +
      "2. **Main Concepts** — subtopics with brief explanations\n" +
      "3. **Key Takeaways** — most important points to remember\n" +
      "4. **Examples / Case Studies** — concrete examples mentioned\n" +
      "5. **Resources** — any books, papers, or links referenced",
  },
  call: {
    label: "Call Summary",
    instructions:
      "From this transcript, extract and structure:\n" +
      "1. **Participants** — who was on the call\n" +
      "2. **Purpose** — why the call was held\n" +
      "3. **Topics Covered** — what was discussed\n" +
      "4. **Agreements** — what was agreed upon\n" +
      "5. **Action Items** — what each party committed to do next",
  },
};

export const transcribeAndSummarizeTool = buildTool({
  name: "transcribe_and_summarize",
  description:
    "Transcribe an audio file and produce a structured report. " +
    "Report types: 'meeting' (agenda, decisions, action items), " +
    "'interview' (Q&A, insights), 'voice_memo' (bullet summary), " +
    "'lecture' (topics, takeaways), 'call' (participants, agreements). " +
    "Returns the full transcript plus a structured report ready for review.",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    filePath: z.string().describe("Absolute path to the audio file"),
    reportType: z
      .enum(["meeting", "interview", "voice_memo", "lecture", "call"])
      .optional()
      .default("meeting")
      .describe("Type of report to generate"),
    language: z.string().optional().describe("Language code (auto-detected if omitted)"),
    title: z.string().optional().describe("Optional title for the report"),
  }),
  async call(input, ctx): Promise<any> {
    try {
      const cfg = resolveWhisperConfig(ctx?.config ?? {});
      if (!cfg) return { success: false, error: WHISPER_NO_KEY_MSG };

      const ext = extname(input.filePath).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) {
        return {
          success: false,
          error: `Unsupported audio format: "${ext}". Supported: ${[...AUDIO_EXTS].join(", ")}`,
        };
      }

      const buffer   = await readFile(input.filePath);
      const filename = basename(input.filePath);
      const result   = await callWhisper(ctx, buffer, filename, input.language);

      const reportType = input.reportType || "meeting";
      const rp         = REPORT_PROMPTS[reportType];
      const title      = input.title || `${rp.label} — ${new Date().toLocaleDateString("en-SG", { dateStyle: "long" })}`;

      return {
        success: true,
        data: {
          title,
          reportType,
          transcript:    result.text,
          wordCount:     result.text.split(/\s+/).filter(Boolean).length,
          language:      result.language,
          duration:      result.duration != null ? `${Math.round(result.duration)}s` : undefined,
          whisperEngine: cfg.provider,
          reportInstructions: rp.instructions,
          note:
            "The transcript above has been returned along with report instructions. " +
            "Please now produce the structured " + rp.label + " by following the instructions " +
            "and extracting the relevant information from the transcript.",
        },
      };
    } catch (err) {
      return { success: false, error: `Transcription failed: ${err}` };
    }
  },
});
