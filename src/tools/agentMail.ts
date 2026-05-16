// =============================================================================
// AgentMail Tools — Four agent tools for email via AgentMail dedicated inbox
//
// Allows the agent to:
//   1. List threads in its own inbox
//   2. Read all messages in a thread
//   3. Send a new email or reply in an existing thread
//   4. Create additional dedicated inboxes (for sub-agents)
//
// All tools read context.config.tools.agentmail.apiKey.
// Pattern mirrors messenger.ts (buildTool, category, isReadOnly, inputSchema).
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";

const BASE_URL = "https://api.agentmail.to/v0";

// ---------------------------------------------------------------------------
// Helper — make an authenticated AgentMail API call
// ---------------------------------------------------------------------------

async function amFetch(
  apiKey:  string,
  method:  string,
  path:    string,
  body?:   unknown
): Promise<any> {
  const options: RequestInit = {
    method,
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AgentMail ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// 1. List threads
// ---------------------------------------------------------------------------

export const agentMailListThreadsTool = buildTool({
  name: "agentmail_list_threads",
  description:
    "List email threads in the agent's own AgentMail inbox. Returns thread IDs, subjects, participants, and message counts.",
  category: "email",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    limit: z.number().optional().default(20).describe("Maximum number of threads to return (default 20)"),
  }),
  async call(input, context) {
    try {
      const apiKey  = context.config.tools?.agentmail?.apiKey;
      const inboxId = (context.config.tools?.agentmail as any)?.inboxId as string | undefined;
      if (!apiKey)  return { success: false, error: "AgentMail not configured" };
      if (!inboxId) return { success: false, error: "AgentMail inbox not yet initialised — start the agent first" };

      const inboxPath = encodeURIComponent(inboxId);
      const data = await amFetch(apiKey, "GET", `/inboxes/${inboxPath}/threads?limit=${input.limit ?? 20}`);
      const threads = (data.threads ?? []).map((t: any) => ({
        id:             t.id,
        subject:        t.subject,
        last_message_at: t.last_message_at,
        message_count:  t.message_count,
        participants:   t.participants,
      }));

      return { success: true, data: { count: threads.length, threads } };
    } catch (err) {
      return { success: false, error: `Failed to list threads: ${err}` };
    }
  },
});

// ---------------------------------------------------------------------------
// 2. Get thread messages
// ---------------------------------------------------------------------------

export const agentMailGetThreadTool = buildTool({
  name: "agentmail_get_thread",
  description:
    "Retrieve all messages in a specific AgentMail thread. Returns sender, recipients, subject, and body text for each message.",
  category: "email",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    threadId: z.string().describe("Thread ID from agentmail_list_threads"),
  }),
  async call(input, context) {
    try {
      const apiKey  = context.config.tools?.agentmail?.apiKey;
      const inboxId = (context.config.tools?.agentmail as any)?.inboxId as string | undefined;
      if (!apiKey)  return { success: false, error: "AgentMail not configured" };
      if (!inboxId) return { success: false, error: "AgentMail inbox not yet initialised" };

      const inboxPath = encodeURIComponent(inboxId);
      const data = await amFetch(
        apiKey, "GET", `/inboxes/${inboxPath}/threads/${input.threadId}`
      );

      const messages = (data.messages ?? []).map((m: any) => ({
        id:          m.id,
        from:        m.from,
        to:          m.to,
        subject:     m.subject,
        text:        m.text || "",
        received_at: m.received_at,
      }));

      return {
        success: true,
        data: {
          id:       data.id,
          subject:  data.subject,
          messages,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to get thread: ${err}` };
    }
  },
});

// ---------------------------------------------------------------------------
// 3. Send email / reply in thread
// ---------------------------------------------------------------------------

export const agentMailSendEmailTool = buildTool({
  name: "agentmail_send_email",
  description:
    "Send an email or reply to an existing thread via AgentMail. " +
    "Provide threadId to reply within an existing thread. " +
    "Omit threadId to start a new email conversation (subject required).",
  category: "email",
  isReadOnly: false,
  isConcurrencySafe: true,
  inputSchema: z.object({
    to:       z.string().describe("Recipient email address"),
    subject:  z.string().optional().describe("Email subject — required for new emails, optional when replying in a thread"),
    message:  z.string().describe("Email body text"),
    threadId: z.string().optional().describe("Existing thread ID to reply in — omit to send a new email"),
  }),
  async call(input, context) {
    try {
      const apiKey  = context.config.tools?.agentmail?.apiKey;
      const inboxId = (context.config.tools?.agentmail as any)?.inboxId as string | undefined;
      if (!apiKey)  return { success: false, error: "AgentMail not configured" };
      if (!inboxId) return { success: false, error: "AgentMail inbox not yet initialised" };

      const inboxPath = encodeURIComponent(inboxId);
      const body: Record<string, unknown> = {
        to:   [{ email: input.to }],
        text: input.message,
      };
      if (input.subject)  body.subject   = input.subject;
      if (input.threadId) body.thread_id = input.threadId;

      const result = await amFetch(apiKey, "POST", `/inboxes/${inboxPath}/messages/send`, body);

      return {
        success: true,
        data: {
          messageId: result.message_id,
          threadId:  result.thread_id,
          to:        input.to,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to send email: ${err}` };
    }
  },
});

// ---------------------------------------------------------------------------
// 4. Create additional inbox (for sub-agents)
// ---------------------------------------------------------------------------

export const agentMailCreateInboxTool = buildTool({
  name: "agentmail_create_inbox",
  description:
    "Create an additional dedicated AgentMail inbox — useful for spinning up sub-agents with their own email address. " +
    "Returns the new inbox address (e.g. sales-agent@agentmail.to).",
  category: "email",
  isReadOnly: false,
  isConcurrencySafe: true,
  inputSchema: z.object({
    username:    z.string().optional().describe("Inbox username (lowercase letters, numbers, hyphens only). Auto-generated if omitted."),
    displayName: z.string().optional().describe("Human-readable display name shown in the From field"),
  }),
  async call(input, context) {
    try {
      const apiKey = context.config.tools?.agentmail?.apiKey;
      if (!apiKey) return { success: false, error: "AgentMail not configured" };

      const body: Record<string, string> = {};
      if (input.username)    body.username     = input.username;
      if (input.displayName) body.display_name = input.displayName;

      const inbox = await amFetch(apiKey, "POST", "/inboxes", body);

      return {
        success: true,
        data: {
          id:          inbox.id,
          username:    inbox.username,
          address:     inbox.address,
          displayName: inbox.display_name,
          createdAt:   inbox.created_at,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to create inbox: ${err}` };
    }
  },
});
