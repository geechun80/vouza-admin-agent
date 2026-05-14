// =============================================================================
// Email Tool — Gmail integration for triage, read, draft, send
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import nodemailer from "nodemailer";
import { google } from "googleapis";

// --- Read Emails ---

export const readEmailsTool = buildTool({
  name: "read_emails",
  description:
    "Read emails from Gmail inbox. Can filter by label, sender, subject, or date range. Returns email summaries.",
  category: "email",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    query: z.string().describe("Gmail search query (e.g., 'from:boss@company.com is:unread')"),
    maxResults: z.number().optional().default(10),
    includeBody: z.boolean().optional().default(false),
  }),
  async call(input, context) {
    try {
      const auth = await getGmailAuth(context);
      const gmail = google.gmail({ version: "v1", auth });

      const res = await gmail.users.messages.list({
        userId: "me",
        q: input.query,
        maxResults: input.maxResults,
      });

      const messages = res.data.messages || [];
      const emails = await Promise.all(
        messages.map(async (msg) => {
          const detail = await gmail.users.messages.get({
            userId: "me",
            id: msg.id!,
            format: input.includeBody ? "full" : "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          });

          const headers = detail.data.payload?.headers || [];
          const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || "";

          return {
            id: msg.id,
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            snippet: detail.data.snippet,
            labels: detail.data.labelIds,
            body: input.includeBody ? extractBody(detail.data.payload) : undefined,
          };
        })
      );

      return { success: true, data: { count: emails.length, emails } };
    } catch (err) {
      return { success: false, error: `Failed to read emails: ${err}` };
    }
  },
});

// --- Send Email ---

export const sendEmailTool = buildTool({
  name: "send_email",
  description:
    "Send an email via Gmail. Supports to, cc, bcc, subject, body (plain text or HTML), and attachments.",
  category: "email",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    to: z.string().describe("Recipient email address(es), comma-separated"),
    subject: z.string(),
    body: z.string().describe("Email body in plain text or HTML"),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    isHtml: z.boolean().optional().default(false),
    replyToMessageId: z.string().optional().describe("Gmail message ID to reply to"),
  }),
  async call(input, context) {
    try {
      const cfg = context.config.tools.gmail;
      if (!cfg) return { success: false, error: "Gmail not configured" };

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: cfg.user, pass: cfg.appPassword },
      });

      const mailOptions: nodemailer.SendMailOptions = {
        from: cfg.user,
        to: input.to,
        subject: input.subject,
        cc: input.cc,
        bcc: input.bcc,
      };

      if (input.isHtml) {
        mailOptions.html = input.body;
      } else {
        mailOptions.text = input.body;
      }

      const result = await transporter.sendMail(mailOptions);
      return {
        success: true,
        data: { messageId: result.messageId, accepted: result.accepted },
      };
    } catch (err) {
      return { success: false, error: `Failed to send email: ${err}` };
    }
  },
});

// --- Draft Email ---

export const draftEmailTool = buildTool({
  name: "draft_email",
  description: "Create a draft email in Gmail without sending it. For review before sending.",
  category: "email",
  isReadOnly: false,
  isConcurrencySafe: true,
  inputSchema: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
    cc: z.string().optional(),
  }),
  async call(input, context) {
    try {
      const auth = await getGmailAuth(context);
      const gmail = google.gmail({ version: "v1", auth });

      const raw = Buffer.from(
        `To: ${input.to}\n` +
        (input.cc ? `Cc: ${input.cc}\n` : "") +
        `Subject: ${input.subject}\n` +
        `Content-Type: text/plain; charset=utf-8\n\n` +
        input.body
      ).toString("base64url");

      const draft = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw } },
      });

      return { success: true, data: { draftId: draft.data.id } };
    } catch (err) {
      return { success: false, error: `Failed to create draft: ${err}` };
    }
  },
});

// --- Triage Emails ---

export const triageEmailsTool = buildTool({
  name: "triage_emails",
  description:
    "Apply labels, archive, or star emails based on rules. Bulk operations for inbox management.",
  category: "email",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    messageIds: z.array(z.string()),
    action: z.enum(["archive", "star", "label", "mark_read", "mark_unread", "trash"]),
    label: z.string().optional().describe("Label name (required for 'label' action)"),
  }),
  async call(input, context) {
    try {
      const auth = await getGmailAuth(context);
      const gmail = google.gmail({ version: "v1", auth });

      const results = await Promise.all(
        input.messageIds.map(async (id) => {
          const modify: { addLabelIds?: string[]; removeLabelIds?: string[] } = {};

          switch (input.action) {
            case "archive":
              modify.removeLabelIds = ["INBOX"];
              break;
            case "star":
              modify.addLabelIds = ["STARRED"];
              break;
            case "mark_read":
              modify.removeLabelIds = ["UNREAD"];
              break;
            case "mark_unread":
              modify.addLabelIds = ["UNREAD"];
              break;
            case "label":
              if (input.label) modify.addLabelIds = [input.label];
              break;
            case "trash":
              await gmail.users.messages.trash({ userId: "me", id });
              return { id, action: "trashed" };
          }

          if (modify.addLabelIds || modify.removeLabelIds) {
            await gmail.users.messages.modify({ userId: "me", id, requestBody: modify });
          }
          return { id, action: input.action };
        })
      );

      return { success: true, data: { processed: results.length, results } };
    } catch (err) {
      return { success: false, error: `Failed to triage: ${err}` };
    }
  },
});

// --- Get Email Thread ---

export const getEmailThreadTool = buildTool({
  name: "get_email_thread",
  description: "Fetch all messages in a Gmail conversation thread by thread ID or message ID.",
  category: "email",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    threadId: z.string().describe("Gmail thread ID (from read_emails result)"),
  }),
  async call(input, context) {
    try {
      const auth = await getGmailAuth(context);
      const gmail = google.gmail({ version: "v1", auth });

      const thread = await gmail.users.threads.get({
        userId: "me",
        id: input.threadId,
        format: "full",
      });

      const messages = (thread.data.messages || []).map((msg) => {
        const headers = msg.payload?.headers || [];
        const getHeader = (n: string) => headers.find((h) => h.name === n)?.value || "";
        return {
          id: msg.id,
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: msg.snippet,
          body: extractBody(msg.payload),
        };
      });

      return { success: true, data: { threadId: input.threadId, messageCount: messages.length, messages } };
    } catch (err) {
      return { success: false, error: `Failed to get thread: ${err}` };
    }
  },
});

// --- Reply to Email ---

export const replyEmailTool = buildTool({
  name: "reply_email",
  description: "Reply to an existing Gmail email, keeping the conversation thread intact.",
  category: "email",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    messageId: z.string().describe("Gmail message ID to reply to"),
    threadId: z.string().describe("Gmail thread ID of the original message"),
    to: z.string().describe("Recipient email address"),
    body: z.string().describe("Reply body text"),
    subject: z.string().optional().describe("Subject (auto-prefixed with Re: if omitted)"),
  }),
  async call(input, context) {
    try {
      const cfg = context.config.tools.gmail;
      if (!cfg) return { success: false, error: "Gmail not configured" };

      const subject = input.subject || "Re: (your message)";
      const raw = Buffer.from(
        `To: ${input.to}\n` +
        `Subject: ${subject}\n` +
        `In-Reply-To: ${input.messageId}\n` +
        `References: ${input.messageId}\n` +
        `Content-Type: text/plain; charset=utf-8\n\n` +
        input.body
      ).toString("base64url");

      // Try OAuth first, fall back to nodemailer app-password
      try {
        const auth = await getGmailAuth(context);
        const gmail = google.gmail({ version: "v1", auth });
        const res = await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw, threadId: input.threadId },
        });
        return { success: true, data: { messageId: res.data.id, threadId: input.threadId } };
      } catch {
        // Fallback: nodemailer + app password
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: cfg.user, pass: cfg.appPassword },
        });
        const result = await transporter.sendMail({
          from: cfg.user,
          to: input.to,
          subject,
          text: input.body,
          inReplyTo: input.messageId,
          references: input.messageId,
        });
        return { success: true, data: { messageId: result.messageId, threadId: input.threadId } };
      }
    } catch (err) {
      return { success: false, error: `Failed to reply: ${err}` };
    }
  },
});

// --- Delete Email ---

export const deleteEmailTool = buildTool({
  name: "delete_email",
  description: "Permanently delete a Gmail message by ID. Use trash action in triage_emails to move to trash first.",
  category: "email",
  isReadOnly: false,
  isConcurrencySafe: false,
  inputSchema: z.object({
    messageId: z.string().describe("Gmail message ID to permanently delete"),
  }),
  async call(input, context) {
    try {
      const auth = await getGmailAuth(context);
      const gmail = google.gmail({ version: "v1", auth });
      await gmail.users.messages.delete({ userId: "me", id: input.messageId });
      return { success: true, data: { deleted: input.messageId } };
    } catch (err) {
      return { success: false, error: `Failed to delete email: ${err}` };
    }
  },
});

// --- Helpers ---

/**
 * Resolve Gmail authentication.
 *
 * Priority order:
 *  1. Service account key file  (googleServiceAccount path in config)
 *  2. OAuth2 client credentials JSON (stored inline from wizard as googleCredentialsJson)
 *     — requires a stored refresh token in config.tools.google.refreshToken
 *
 * If neither is available, throws a clear message guiding the user to
 * connect Google credentials in the setup wizard.
 */
async function getGmailAuth(context: any) {
  const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

  // Option 1: Service account key file (Google Workspace / admin setups)
  const keyPath = context.config.tools.googleServiceAccount;
  if (keyPath) {
    return new google.auth.GoogleAuth({ keyFile: keyPath, scopes: SCOPES });
  }

  // Option 2: OAuth2 client credentials JSON + stored refresh token (personal Gmail / wizard flow)
  const googleCfg = context.config.tools.google;
  const credsJson = googleCfg?.credentialsJson;
  const refreshToken = googleCfg?.refreshToken || context.config.credentials?.googleRefreshToken;
  if (credsJson && refreshToken) {
    let parsed: any;
    try { parsed = JSON.parse(credsJson); } catch { /* fall through */ }
    const clientData = parsed?.installed || parsed?.web;
    if (clientData?.client_id && clientData?.client_secret) {
      const oauth2 = new google.auth.OAuth2(
        clientData.client_id,
        clientData.client_secret,
        clientData.redirect_uris?.[0] || "urn:ietf:wg:oauth:2.0:oob"
      );
      oauth2.setCredentials({ refresh_token: refreshToken });
      return oauth2;
    }
  }

  throw new Error(
    "Gmail reading requires Google credentials. " +
    "In the setup wizard → Connect Apps → enable Calendar or Sheets to see the Google credentials section, " +
    "download your OAuth2 Client credentials JSON from Google Cloud Console, and paste it there."
  );
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return "";
}
