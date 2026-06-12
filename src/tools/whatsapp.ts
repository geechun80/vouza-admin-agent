// =============================================================================
// WhatsApp Tool — Multi-provider: Twilio, Meta Cloud API, WAHA, WhatsApp Web
// WhatsApp Web uses Baileys (native WS protocol — no Docker/WAHA needed)
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import { sendBaileysMessage, isBaileysConnected } from "../whatsapp/baileysManager.js";

// ---------------------------------------------------------------------------
// Baileys bridge — single WhatsApp path (Phase 3)
//
// Sends route through baileysManager (the child-process worker supervisor),
// which owns the SAME socket that receives incoming messages. The legacy
// in-process baileysListener.ts was deleted — it held a separate (usually
// dead) socket, so agent sends could silently go nowhere.
//
// The bridge is injectable so tests can verify routing without forking a
// real worker process.
// ---------------------------------------------------------------------------

interface BaileysBridge {
  send: (chatId: string, text: string) => Promise<void>;
  isConnected: () => boolean;
}

const DEFAULT_BAILEYS_BRIDGE: BaileysBridge = {
  send: sendBaileysMessage,
  isConnected: isBaileysConnected,
};

let _baileys: BaileysBridge = DEFAULT_BAILEYS_BRIDGE;

/** Test seam — pass null to restore the real manager-backed bridge. */
export function _setBaileysBridgeForTests(bridge: BaileysBridge | null): void {
  _baileys = bridge ?? DEFAULT_BAILEYS_BRIDGE;
}

/** Test seam — inspect the active bridge (verifies default = manager exports). */
export function _getBaileysBridgeForTests(): BaileysBridge {
  return _baileys;
}

// --- Send WhatsApp Message ---

export const sendWhatsAppMessageTool = buildTool({
  name: "send_whatsapp_message",
  description: "Send a WhatsApp message via the configured provider (Twilio, Meta, WAHA, or WhatsApp Web).",
  category: "messaging",
  isReadOnly: false,
  isConcurrencySafe: true,
  inputSchema: z.object({
    to: z.string().describe("Recipient phone number in E.164 format (e.g., +6512345678)"),
    message: z.string().describe("Message text to send"),
  }),
  async call(input, context) {
    const wa = context.config.tools.whatsapp;
    if (!wa) return { success: false, error: "WhatsApp not configured. Set up in the dashboard." };

    try {
      switch (wa.provider) {
        case "twilio":
          return (await sendViaTwilio(input.to, input.message, wa.config)) as any;
        case "meta":
          return (await sendViaMeta(input.to, input.message, wa.config)) as any;
        case "waha":
          return (await sendViaWaha(input.to, input.message, wa.config)) as any;
        case "web":
          return (await sendViaWhatsAppWeb(input.to, input.message, wa.config)) as any;
        default:
          return { success: false, error: `Unknown WhatsApp provider: ${wa.provider}` } as any;
      }
    } catch (err) {
      return { success: false, error: `Failed to send WhatsApp message: ${err}` };
    }
  },
});

// --- Read WhatsApp Messages ---

export const readWhatsAppMessagesTool = buildTool({
  name: "read_whatsapp_messages",
  description: "Read recent WhatsApp messages (available with WAHA and WhatsApp Web providers).",
  category: "messaging",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    chatId: z.string().optional().describe("Chat ID to read from (phone@c.us format for WhatsApp Web)"),
    limit: z.number().optional().default(20),
  }),
  async call(input, context) {
    const wa = context.config.tools.whatsapp;
    if (!wa) return { success: false, error: "WhatsApp not configured" };

    try {
      switch (wa.provider) {
        case "waha":
          return await readViaWaha(input.chatId, input.limit ?? 20, wa.config);
        case "web":
          return await readViaWhatsAppWeb(input.chatId, input.limit ?? 20, wa.config);
        default:
          return { success: false, error: `Reading messages not supported with ${wa.provider} provider. Use WAHA or WhatsApp Web.` };
      }
    } catch (err) {
      return { success: false, error: `Failed to read WhatsApp messages: ${err}` };
    }
  },
});

// =============================================================================
// Provider Implementations
// =============================================================================

// --- Twilio ---
async function sendViaTwilio(to: string, message: string, config: Record<string, string>) {
  const { accountSid, authToken, fromNumber } = config;
  if (!accountSid || !authToken) return { success: false, error: "Twilio credentials missing" };

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: `whatsapp:${to}`,
        From: `whatsapp:${fromNumber || "+14155238886"}`,
        Body: message,
      }),
    }
  );

  const data = await res.json();
  if (data.sid) return { success: true, data: { messageId: data.sid, status: data.status } };
  return { success: false, error: data.message || "Twilio send failed" };
}

// --- Meta Cloud API ---
async function sendViaMeta(to: string, message: string, config: Record<string, string>) {
  const { accessToken, phoneNumberId } = config;
  if (!accessToken || !phoneNumberId) return { success: false, error: "Meta API credentials missing" };

  const phone = to.replace(/[^0-9]/g, "");
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message },
      }),
    }
  );

  const data = await res.json();
  if (data.messages?.[0]?.id) {
    return { success: true, data: { messageId: data.messages[0].id, status: "sent" } };
  }
  return { success: false, error: data.error?.message || "Meta API send failed" };
}

// --- WAHA (Self-hosted) ---
async function sendViaWaha(to: string, message: string, config: Record<string, string>) {
  const { serverUrl, apiKey, sessionName } = config;
  if (!serverUrl) return { success: false, error: "WAHA server URL missing" };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;

  const chatId = to.replace(/[^0-9]/g, "") + "@c.us";
  const res = await fetch(`${serverUrl}/api/sendText`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session: sessionName || "default",
      chatId,
      text: message,
    }),
  });

  const data = await res.json();
  if (data.id) return { success: true, data: { messageId: data.id } };
  return { success: false, error: data.message || "WAHA send failed" };
}

// --- WhatsApp Web (Baileys — native WS protocol, via baileysManager) ---
async function sendViaWhatsAppWeb(to: string, message: string, _config: Record<string, string>) {
  if (!_baileys.isConnected()) {
    return { success: false, error: "WhatsApp not connected. Open the dashboard and scan the QR code first." };
  }
  const chatId = to.replace(/[^0-9]/g, "") + "@c.us";
  await _baileys.send(chatId, message);
  return { success: true, data: { chatId } };
}

async function readViaWaha(chatId: string | undefined, limit: number, config: Record<string, string>) {
  const { serverUrl, apiKey, sessionName } = config;
  if (!serverUrl) return { success: false, error: "WAHA server URL missing" };

  const headers: Record<string, string> = {};
  if (apiKey) headers["X-Api-Key"] = apiKey;

  const params = new URLSearchParams({ session: sessionName || "default", limit: String(limit) });
  if (chatId) params.set("chatId", chatId);

  const res = await fetch(`${serverUrl}/api/messages?${params}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { success: false, error: `WAHA HTTP ${res.status}: ${text}` };
  }
  const data = await res.json();

  return { success: true, data: { messages: data } };
}

async function readViaWhatsAppWeb(_chatId: string | undefined, _limit: number, _config: Record<string, string>) {
  // Baileys doesn't maintain an offline message store — messages are processed
  // in real-time as they arrive and forwarded to the agent loop.
  return {
    success: false,
    error: "Message history reading is not supported with WhatsApp Web (Baileys). Messages are delivered in real-time as you send them.",
  };
}
