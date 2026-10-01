// =============================================================================
// send_file_to_me — deliver a file from the laptop into the phone chat
//
// The whole point of reaching the agent from a phone is "find my insurance
// policy and send it to me". Before this tool the agent could find the file
// but only reply with its path, which is useless on a phone.
//
// Safety:
//   - Only callable from a phone chat (context.channel) — the file goes back
//     to the person who asked, in the chat they asked from. It cannot be
//     pointed at a third party, so a prompt-injected document can't exfiltrate.
//   - Same read boundary as every file tool: the agent workspace plus folders
//     the owner explicitly granted in the dashboard (resolveAccess).
//   - Size cap below Telegram's 50 MB bot limit (WhatsApp allows more).
// =============================================================================

import { z } from "zod";
import { stat } from "fs/promises";
import { basename, extname } from "path";
import { buildTool } from "./registry.js";
import { resolveAccess } from "../files/folderGrants.js";
import { logger } from "../util/logger.js";
import type { AgentContext } from "../types/index.js";

export const MAX_PHONE_FILE_BYTES = 45 * 1024 * 1024;

export interface FileToSend {
  absPath:  string;
  fileName: string;
  mimeType: string;
  bytes:    number;
  caption?: string;
}

export interface FileSenders {
  whatsapp: (chatId: string, file: FileToSend, ctx: AgentContext) => Promise<void>;
  telegram: (chatId: string, file: FileToSend, ctx: AgentContext) => Promise<void>;
}

// Lazy imports: the listeners import phone mode, which imports this tool —
// static imports here would make a cycle.
const defaultSenders: FileSenders = {
  whatsapp: async (chatId, file) => {
    const { sendBaileysDocument } = await import("../whatsapp/baileysManager.js");
    await sendBaileysDocument(chatId, file);
  },
  telegram: async (chatId, file, ctx) => {
    const token = ctx.config.tools.telegram?.botToken;
    if (!token) throw new Error("Telegram is not configured.");
    const { sendTelegramDocument } = await import("../telegram/listener.js");
    await sendTelegramDocument(token, chatId, file);
  },
};

let _senders: FileSenders = defaultSenders;

/** Test hook — swap the channel senders; pass null to restore the real ones. */
export function __setFileSendersForTests(s: Partial<FileSenders> | null): void {
  _senders = s ? { ...defaultSenders, ...s } : defaultSenders;
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".doc":  "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls":  "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt":  "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv":  "text/csv",
  ".txt":  "text/plain",
  ".md":   "text/markdown",
  ".json": "application/json",
  ".zip":  "application/zip",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".mp3":  "audio/mpeg",
  ".m4a":  "audio/mp4",
  ".mp4":  "video/mp4",
};

export function mimeTypeFor(fileName: string): string {
  return MIME_BY_EXT[extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const sendFileToMeTool = buildTool({
  name: "send_file_to_me",
  description:
    "Send a file from this computer to the person you are chatting with on WhatsApp or Telegram, as an " +
    "attachment they can open on their phone. Use it whenever they ask you to send, share, forward or give " +
    "them a document or photo — find the exact path first with search_local_files. Only files inside the " +
    "agent workspace or folders the owner granted access to can be sent. Maximum 45 MB.",
  category: "file",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    filePath: z.string().describe("Full path of the file to send (as returned by search_local_files)"),
    caption:  z.string().optional().describe("Short message shown with the file"),
  }),
  async call(input, context) {
    const ch = context.channel;
    if (!ch || ch.kind === "dashboard") {
      return {
        success: false,
        error: "send_file_to_me only works inside a WhatsApp or Telegram chat. On the desktop, tell the user where the file is instead.",
      };
    }

    const access = resolveAccess(input.filePath);
    if (!access.allowed) {
      return {
        success: false,
        error:
          "That file is outside the folders I'm allowed to read, so I can't send it. " +
          "The owner can allow its folder in the dashboard under Setup → Folder Access.",
      };
    }

    let size: number;
    try {
      const st = await stat(access.resolvedPath);
      if (!st.isFile()) return { success: false, error: "That path is a folder, not a file." };
      size = st.size;
    } catch {
      return { success: false, error: `File not found: ${input.filePath}` };
    }
    if (size === 0) return { success: false, error: "That file is empty, so there's nothing to send." };
    if (size > MAX_PHONE_FILE_BYTES) {
      return {
        success: false,
        error: `That file is ${formatMB(size)} — too big to send to a phone (the limit is ${formatMB(MAX_PHONE_FILE_BYTES)}).`,
      };
    }

    const fileName = basename(access.resolvedPath);
    const file: FileToSend = {
      absPath:  access.resolvedPath,
      fileName,
      mimeType: mimeTypeFor(fileName),
      bytes:    size,
      caption:  input.caption?.slice(0, 900),
    };

    try {
      await _senders[ch.kind](ch.chatId, file, context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Couldn't send the file: ${msg}` };
    }

    // Audit trail: a file left the machine. Granted-folder reads are already
    // audited by the file tools; deliveries get their own event.
    logger.info(
      { event: "file_sent_to_phone", channel: ch.kind, file: fileName, bytes: size, access: access.mode },
      `Sent ${fileName} to ${ch.kind}`,
    );

    return {
      success: true,
      data: {
        sent:  fileName,
        size:  formatMB(size),
        note:  "The file is already delivered in this chat. Confirm in one short sentence — do not paste its contents.",
      },
    };
  },
});
