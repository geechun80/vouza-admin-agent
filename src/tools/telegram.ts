// =============================================================================
// Telegram Bot Tool — Send/receive messages via Telegram Bot API
// Uses native fetch (no external dependency needed for basic bot ops)
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";

const TELEGRAM_API = "https://api.telegram.org/bot";

// --- Send Telegram Message ---

export const sendTelegramMessageTool = buildTool({
  name: "send_telegram_message",
  description: "Send a message to a Telegram chat via Bot API. Supports text, Markdown, and HTML formatting.",
  category: "messaging",
  isReadOnly: false,
  isConcurrencySafe: true,
  inputSchema: z.object({
    chatId: z.string().describe("Telegram chat ID (user or group, e.g., '123456789' or '@channelname')"),
    text: z.string().describe("Message text (supports Markdown or HTML)"),
    parseMode: z.enum(["Markdown", "HTML", "MarkdownV2"]).optional().default("Markdown"),
    replyToMessageId: z.number().optional().describe("Message ID to reply to"),
    disableNotification: z.boolean().optional().default(false),
  }),
  async call(input, context) {
    try {
      const token = context.config.tools.telegram?.botToken;
      if (!token) return { success: false, error: "Telegram bot not configured. Add bot token in setup." };

      const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          parse_mode: input.parseMode,
          reply_to_message_id: input.replyToMessageId,
          disable_notification: input.disableNotification,
        }),
      });

      const data = await res.json();
      if (!data.ok) return { success: false, error: `Telegram error: ${data.description}` };

      return {
        success: true,
        data: {
          messageId: data.result.message_id,
          chatId: data.result.chat.id,
          date: data.result.date,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to send Telegram message: ${err}` };
    }
  },
});

// --- Read Telegram Updates ---

export const readTelegramUpdatesTool = buildTool({
  name: "read_telegram_updates",
  description: "Fetch recent messages/updates from the Telegram bot. Returns latest messages from all chats.",
  category: "messaging",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    limit: z.number().optional().default(20).describe("Max number of updates to fetch (1-100)"),
    offset: z.number().optional().describe("Offset for pagination (update_id to start from)"),
  }),
  async call(input, context) {
    try {
      const token = context.config.tools.telegram?.botToken;
      if (!token) return { success: false, error: "Telegram bot not configured" };

      const params = new URLSearchParams({
        limit: String(Math.min(input.limit ?? 20, 100)),
        allowed_updates: JSON.stringify(["message", "edited_message", "channel_post"]),
      });
      if (input.offset) params.set("offset", String(input.offset));

      const res = await fetch(`${TELEGRAM_API}${token}/getUpdates?${params}`);
      const data = await res.json();

      if (!data.ok) return { success: false, error: `Telegram error: ${data.description}` };

      const messages = (data.result || []).map((update: any) => {
        const msg = update.message || update.edited_message || update.channel_post;
        if (!msg) return null;
        return {
          updateId: update.update_id,
          messageId: msg.message_id,
          chatId: msg.chat.id,
          chatType: msg.chat.type,
          chatTitle: msg.chat.title || msg.chat.first_name,
          from: msg.from ? `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim() : "Unknown",
          fromUsername: msg.from?.username,
          text: msg.text || msg.caption || "[non-text message]",
          date: msg.date,
          replyTo: msg.reply_to_message?.message_id,
        };
      }).filter(Boolean);

      return { success: true, data: { count: messages.length, messages } };
    } catch (err) {
      return { success: false, error: `Failed to read Telegram updates: ${err}` };
    }
  },
});

// --- Get Telegram Bot Info ---

export const getTelegramBotInfoTool = buildTool({
  name: "get_telegram_bot_info",
  description: "Get information about the connected Telegram bot (name, username, etc.)",
  category: "messaging",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({}),
  async call(_input, context) {
    try {
      const token = context.config.tools.telegram?.botToken;
      if (!token) return { success: false, error: "Telegram bot not configured" };

      const res = await fetch(`${TELEGRAM_API}${token}/getMe`);
      const data = await res.json();

      if (!data.ok) return { success: false, error: `Telegram error: ${data.description}` };

      return {
        success: true,
        data: {
          id: data.result.id,
          name: data.result.first_name,
          username: data.result.username,
          canJoinGroups: data.result.can_join_groups,
          canReadGroupMessages: data.result.can_read_all_group_messages,
          supportsInlineQueries: data.result.supports_inline_queries,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to get bot info: ${err}` };
    }
  },
});

// --- Forward Telegram Message ---

export const forwardTelegramMessageTool = buildTool({
  name: "forward_telegram_message",
  description: "Forward a message from one Telegram chat to another.",
  category: "messaging",
  isReadOnly: false,
  isConcurrencySafe: true,
  inputSchema: z.object({
    chatId: z.string().describe("Destination chat ID"),
    fromChatId: z.string().describe("Source chat ID"),
    messageId: z.number().describe("Message ID to forward"),
  }),
  async call(input, context) {
    try {
      const token = context.config.tools.telegram?.botToken;
      if (!token) return { success: false, error: "Telegram bot not configured" };

      const res = await fetch(`${TELEGRAM_API}${token}/forwardMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          from_chat_id: input.fromChatId,
          message_id: input.messageId,
        }),
      });

      const data = await res.json();
      if (!data.ok) return { success: false, error: `Telegram error: ${data.description}` };

      return {
        success: true,
        data: { messageId: data.result.message_id, chatId: data.result.chat.id },
      };
    } catch (err) {
      return { success: false, error: `Failed to forward message: ${err}` };
    }
  },
});
