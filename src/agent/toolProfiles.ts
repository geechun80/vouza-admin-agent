// =============================================================================
// Tool profiles for runs where no person is watching
//
// The desktop dashboard has the full toolset because the owner is right there
// reading every step. Two other entry points are different:
//
//   SCHEDULED — the morning briefing, weekly report and scheduled skills run
//   unattended and read untrusted text (incoming email, documents, web
//   pages). A prompt-injected email must not be able to make an unattended
//   run send mail, trash or archive messages, write files, browse, run
//   commands, or plant instructions in long-term memory. So scheduled runs
//   get read-only tools plus two changes that stay private and reversible:
//   drafting an email (nothing is sent) and labelling/starring/marking read.
//
//   EXTERNAL — someone other than the owner talking to the agent over email
//   (AgentMail). Read-only tools only; replies are sent by the listener code,
//   never by a tool the sender can steer.
//
// Phone chats with the owner use phoneMode.ts instead (sends allowed, but
// only after the owner's YES).
// =============================================================================

import { ToolRegistry } from "../tools/registry.js";
import type { AgentContext, ToolDefinition, ToolResult } from "../types/index.js";

/** Looking things up — no tool here changes anything anywhere. */
export const READ_ONLY_TOOL_NAMES: readonly string[] = [
  "read_emails",
  "get_email_thread",
  "search_local_files",
  "list_files",
  "read_file",
  "read_pdf",
  "read_excel_file",
  "list_calendar_events",
  "find_free_slots",
  "read_spreadsheet",
  "search_spreadsheet",
  "search_memory",
  "web_search",
];

/** Scheduled runs: read-only + private, reversible inbox housekeeping. */
export const SCHEDULED_TOOL_NAMES: readonly string[] = [
  ...READ_ONLY_TOOL_NAMES,
  "get_setup_status",
  "draft_email",   // creates a draft for the owner to review — never sends
  "triage_emails", // limited below to label / star / mark read / mark unread
];

/** External senders (AgentMail): read-only, and no peek at setup/config. */
export const EXTERNAL_TOOL_NAMES: readonly string[] = READ_ONLY_TOOL_NAMES;

/** triage_emails actions an unattended run may take — nothing that hides or removes mail. */
export const SAFE_TRIAGE_ACTIONS: ReadonlySet<string> = new Set(["label", "star", "mark_read", "mark_unread"]);

const PROFILE_MARK = Symbol.for("vouza.toolProfile");

/** Copy of triage_emails that refuses archive/trash in unattended runs. */
export function limitTriage(tool: ToolDefinition): ToolDefinition {
  return {
    ...tool,
    async call(input: any, ctx: AgentContext): Promise<ToolResult> {
      const action = String(input?.action ?? "");
      if (!SAFE_TRIAGE_ACTIONS.has(action)) {
        return {
          success: false,
          error:
            `"${action}" isn't allowed in automatic runs (only label, star, mark_read, mark_unread). ` +
            "List these emails for the owner and suggest the action instead.",
        };
      }
      return tool.call(input, ctx);
    },
  };
}

function buildProfile(full: ToolRegistry, profile: "scheduled" | "external", names: readonly string[]): ToolRegistry {
  if ((full as any)[PROFILE_MARK] === profile) return full;
  const reg = new ToolRegistry();
  for (const name of names) {
    const tool = full.get(name);
    if (!tool) continue;
    reg.register(name === "triage_emails" ? limitTriage(tool) : tool);
  }
  (reg as any)[PROFILE_MARK] = profile;
  return reg;
}

/** Registry for the task scheduler (briefings, reports, scheduled skills). */
export function buildScheduledRegistry(full: ToolRegistry): ToolRegistry {
  return buildProfile(full, "scheduled", SCHEDULED_TOOL_NAMES);
}

/** Registry for messages from people other than the owner (AgentMail). */
export function buildExternalRegistry(full: ToolRegistry): ToolRegistry {
  return buildProfile(full, "external", EXTERNAL_TOOL_NAMES);
}
