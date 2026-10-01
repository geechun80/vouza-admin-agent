// =============================================================================
// Phone mode — the small, safe toolset that WhatsApp / Telegram chats get
//
// The desktop dashboard can use every tool. A phone chat is different: the
// person typing may be a family member, the message may be a voice note that
// was mis-transcribed, and a prompt-injected email could try to steer the
// agent. So phone chats get only what "handle my email and find my documents
// while I'm away" needs, and anything that sends on the user's behalf waits
// for an explicit YES.
//
// The YES is enforced in code, not by the model:
//   1. A wrapped send tool does NOT send. It stores a pending action for this
//      chat and tells the model to ask the user.
//   2. The listener checks the user's NEXT message before the model sees it.
//      "yes" → the stored action runs. "no" → dropped. Anything else → the
//      pending action is discarded and the message goes to the model normally.
// The model can never execute a pending action itself, so injected text in an
// email or document cannot complete a send.
//
// Enforced at the listener boundary: startTelegramListener / startBaileysListener
// wrap whatever registry they are given, so every caller gets phone mode.
// =============================================================================

import { randomUUID } from "crypto";
import { ToolRegistry } from "../tools/registry.js";
import { sendFileToMeTool } from "../tools/sendFile.js";
import type { AgentContext, PhoneChannel, ToolDefinition, ToolResult } from "../types/index.js";

/** Everything a phone chat may use. Order is irrelevant; absent tools are skipped. */
export const PHONE_TOOL_NAMES: readonly string[] = [
  // Email — App-Password users have read (IMAP) + send/reply (SMTP)
  "read_emails",
  "send_email",
  "reply_email",
  // Documents — read-only, plus delivering a file back into this chat
  "search_local_files",
  "list_files",
  "read_file",
  "read_pdf",
  "read_excel_file",
  "send_file_to_me",
  // Calendar — read-only
  "list_calendar_events",
  "find_free_slots",
  // Memory — remember preferences, never delete from a phone
  "save_memory",
  "search_memory",
  // Web
  "web_search",
  // "Is my email connected?"
  "get_setup_status",
];

/** Tools that act on the user's behalf toward other people → need a YES. */
export const CONFIRM_TOOL_NAMES: ReadonlySet<string> = new Set(["send_email", "reply_email"]);

/**
 * The desktop dashboard asks too: an email or file the agent reads there can
 * carry instructions, and every send is a way to carry data out.
 */
export const DASHBOARD_CONFIRM_TOOL_NAMES: ReadonlySet<string> = new Set([
  "send_email",
  "reply_email",
  "send_telegram_message",
  "forward_telegram_message",
  "send_whatsapp_message",
  "agentmail_send_email",
]);

/**
 * Tools that change a saved connection (AI key, email login, WhatsApp/WAHA
 * address…). A booby-trapped email read in the dashboard must not be able to
 * re-point an integration, so these wait for YES too.
 */
export const SETTINGS_CONFIRM_TOOL_NAMES: ReadonlySet<string> = new Set([
  "save_integration_credentials",
  "run_integration_pipeline",
]);

export const PENDING_TTL_MS = 10 * 60_000;

/** Appended by the listener (not left to the model) whenever a send is waiting. */
export const CONFIRM_PROMPT = "👉 Reply *YES* to send it, or *NO* to cancel.";

const PHONE_REGISTRY_MARK = Symbol.for("vouza.phoneRegistry");

export interface PendingAction {
  /**
   * "send"   — acting toward other people; YES runs the stored action.
   * "online" — going online (web search / opening a site); YES lets the
   *            model do it on the next turn so it can read the results.
   * "memory" — saving to long-term memory right after reading someone
   *            else's text (agent/memoryGuard.ts); YES saves it.
   */
  kind:      "send" | "online" | "memory";
  toolName:  string;
  summary:   string;
  createdAt: number;
  execute?:  () => Promise<ToolResult>;
}

export const ONLINE_CONFIRM_PROMPT = "👉 Reply *YES* to let me go online for this, or *NO* to stay offline.";
export const MEMORY_CONFIRM_PROMPT = "👉 Reply *YES* to save this to memory, or *NO* to skip it.";

/** The question appended under the reply — chosen by code, never by the model. */
export function confirmPromptFor(p: PendingAction): string {
  if (p.kind === "online") return ONLINE_CONFIRM_PROMPT;
  if (p.kind === "memory") return MEMORY_CONFIRM_PROMPT;
  return CONFIRM_PROMPT;
}

/** Park any action until the person answers YES/NO. Used by memoryGuard.ts. */
export function parkAction(ch: PhoneChannel, action: Omit<PendingAction, "createdAt">): void {
  pending.set(channelKey(ch), { ...action, createdAt: Date.now() });
}

/** Park a request to go online until the person answers YES/NO (see webGate.ts). */
export function parkOnlineRequest(ch: PhoneChannel, toolName: string, summary: string): void {
  pending.set(channelKey(ch), { kind: "online", toolName, summary, createdAt: Date.now() });
}

const pending = new Map<string, PendingAction>();

export function channelKey(ch: PhoneChannel): string {
  return `${ch.kind}:${ch.chatId}`;
}

// ---------------------------------------------------------------------------
// Human-readable summaries — what the user is saying YES to
// ---------------------------------------------------------------------------

function clip(s: unknown, n: number): string {
  const str = String(s ?? "").replace(/\s+/g, " ").trim();
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

export function describeAction(toolName: string, input: any): string {
  switch (toolName) {
    case "send_email": {
      const cc = input?.cc ? ` (cc ${clip(input.cc, 60)})` : "";
      const files: string[] = Array.isArray(input?.attachments) ? input.attachments : [];
      const att = files.length
        ? ` with ${files.length} attachment${files.length > 1 ? "s" : ""}: ${files.map((f) => clip(String(f).split(/[\\/]/).pop(), 40)).join(", ")}`
        : "";
      return `Send an email to ${clip(input?.to, 80)}${cc} — subject "${clip(input?.subject, 80)}"${att}.\n"${clip(input?.body, 160)}"`;
    }
    case "reply_email":
      return `Reply to ${clip(input?.to, 80)}:\n"${clip(input?.body, 160)}"`;
    case "send_telegram_message":
      return `Send a Telegram message to ${clip(input?.chatId, 60)}:\n"${clip(input?.text, 160)}"`;
    case "forward_telegram_message":
      return `Forward Telegram message ${clip(input?.messageId, 20)} from ${clip(input?.fromChatId, 40)} to ${clip(input?.chatId, 40)}.`;
    case "send_whatsapp_message":
      return `Send a WhatsApp message to ${clip(input?.to, 40)}:\n"${clip(input?.message, 160)}"`;
    case "agentmail_send_email": {
      const subj = input?.subject ? ` — subject "${clip(input.subject, 80)}"` : "";
      return `Send an email from the agent's inbox to ${clip(input?.to, 80)}${subj}:\n"${clip(input?.message, 160)}"`;
    }
    case "save_integration_credentials":
    case "run_integration_pipeline": {
      // Field names only — never the values (keys, passwords, tokens).
      const creds = input?.credentials && typeof input.credentials === "object" ? Object.keys(input.credentials) : [];
      const fields = creds.length ? ` (${clip(creds.join(", "), 120)})` : "";
      const verb = toolName === "run_integration_pipeline" ? "Set up and save" : "Save new settings for";
      return `${verb} ${clip(input?.integration, 40)}${fields}.`;
    }
    case "save_memory":
      return `Remember "${clip(input?.title, 80)}": "${clip(input?.content, 200)}"`;
    case "update_memory": {
      const title = input?.title ? ` to "${clip(input.title, 80)}"` : "";
      const body  = input?.content ? `: "${clip(input.content, 200)}"` : "";
      return `Change memory ${clip(input?.id, 40)}${title}${body}`;
    }
    default:
      return `Run ${toolName}.`;
  }
}

function doneMessage(toolName: string): string {
  switch (toolName) {
    case "send_email":  return "✅ Sent.";
    case "reply_email": return "✅ Reply sent.";
    case "send_telegram_message":
    case "forward_telegram_message":
    case "send_whatsapp_message":
    case "agentmail_send_email": return "✅ Sent.";
    case "save_memory":
    case "update_memory": return "✅ Saved to memory.";
    case "save_integration_credentials":
    case "run_integration_pipeline": return "✅ Settings saved.";
    default:            return "✅ Done.";
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Copy of `tool` whose call parks the action until the user says YES. */
export function wrapWithConfirmation(tool: ToolDefinition): ToolDefinition {
  return {
    ...tool,
    async call(input: any, ctx: AgentContext): Promise<ToolResult> {
      // Not a phone chat (shouldn't happen inside the phone registry) → no gate.
      if (!ctx.channel) return tool.call(input, ctx);
      const summary = describeAction(tool.name, input);
      pending.set(channelKey(ctx.channel), {
        kind:      "send",
        toolName:  tool.name,
        summary,
        createdAt: Date.now(),
        execute:   () => tool.call(input, ctx),
      });
      return {
        success: true,
        data: {
          status:  "AWAITING_USER_CONFIRMATION",
          summary,
          instruction:
            "Nothing has been sent yet. Show the user this summary in plain words and ask them to reply YES to " +
            "send or NO to cancel. Do not call this tool again for the same message — their reply completes it.",
        },
      };
    },
  };
}

/**
 * Wrap the named tools in `registry` so they wait for a YES (dashboard).
 * Idempotent per tool object.
 */
export function requireConfirmation(registry: ToolRegistry, names: ReadonlySet<string>): void {
  for (const name of names) {
    const tool = registry.get(name);
    if (tool && !(tool as any).__needsYes) {
      const wrapped = wrapWithConfirmation(tool);
      (wrapped as any).__needsYes = true;
      registry.register(wrapped);
    }
  }
}

/**
 * Build the phone registry from the full one. Idempotent — passing a phone
 * registry back in returns it unchanged, so nested callers can't double-wrap.
 */
export function buildPhoneRegistry(full: ToolRegistry, opts: { exclude?: readonly string[] } = {}): ToolRegistry {
  if ((full as any)[PHONE_REGISTRY_MARK]) return full;
  const phone = new ToolRegistry();
  for (const name of PHONE_TOOL_NAMES) {
    if (opts.exclude?.includes(name)) continue;
    const tool = name === sendFileToMeTool.name ? (full.get(name) ?? sendFileToMeTool) : full.get(name);
    if (!tool) continue;
    phone.register(CONFIRM_TOOL_NAMES.has(name) ? wrapWithConfirmation(tool) : tool);
  }
  (phone as any)[PHONE_REGISTRY_MARK] = true;
  return phone;
}

export function isPhoneRegistry(reg: ToolRegistry): boolean {
  return !!(reg as any)[PHONE_REGISTRY_MARK];
}

// ---------------------------------------------------------------------------
// Reading the user's YES / NO
// ---------------------------------------------------------------------------

export type ReplyIntent = "confirm" | "cancel" | "other";

// Exact short replies only: "yes but change the subject" must NOT send.
const CONFIRM_WORDS = new Set([
  "yes", "y", "yep", "yeah", "ya", "yah", "ok", "okay", "k", "sure", "confirm", "confirmed",
  "send", "send it", "go", "go ahead", "do it", "yes please", "yes send", "yes send it", "👍",
  "是", "是的", "好", "好的", "确认", "发送", "可以",
  "boleh", "ya boleh",
]);
const CANCEL_WORDS = new Set([
  "no", "n", "nope", "nah", "cancel", "stop", "dont", "don't", "do not", "no thanks", "dont send", "don't send", "👎",
  "不", "不要", "取消", "别发",
  "tak", "tidak", "jangan", "batal",
]);

export function normalizeReply(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.!?,;:~'"`*_()\[\]]+/g, (m) => (m === "'" ? "'" : " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyReply(text: string): ReplyIntent {
  const t = normalizeReply(text);
  if (CONFIRM_WORDS.has(t)) return "confirm";
  if (CANCEL_WORDS.has(t))  return "cancel";
  return "other";
}

// ---------------------------------------------------------------------------
// Listener API
// ---------------------------------------------------------------------------

export interface PendingResolution {
  /** true → the listener must reply with `reply` and NOT run the model */
  handled: boolean;
  reply?:  string;
  /** true → the person said YES to going online: allow web tools this turn */
  grantOnline?: boolean;
  /** Set when a YES ran a stored action — which tool, and what it returned. */
  ran?: { toolName: string; result: ToolResult };
}

/**
 * Called by a listener with the user's raw message BEFORE the model runs.
 * Expired or superseded pending actions are discarded silently.
 */
export async function resolvePendingReply(
  ch:   PhoneChannel,
  text: string,
  now = Date.now(),
): Promise<PendingResolution> {
  const key = channelKey(ch);
  const p = pending.get(key);
  if (!p) return { handled: false };
  pending.delete(key); // single use, whatever happens next

  if (now - p.createdAt > PENDING_TTL_MS) return { handled: false };

  const intent = classifyReply(text);
  if (p.kind === "online") {
    if (intent === "cancel") return { handled: true, reply: "👍 OK — I'll stay offline." };
    // YES → the model runs now with web access for this one turn, so it can
    // read the results and answer. Anything else → stays offline, normal turn.
    return intent === "confirm" ? { handled: false, grantOnline: true } : { handled: false };
  }

  if (intent === "cancel") {
    return { handled: true, reply: p.kind === "memory" ? "👍 OK — not saved." : "👍 Cancelled — nothing was sent." };
  }
  if (intent !== "confirm") return { handled: false };

  let result: ToolResult;
  try {
    result = await p.execute!();
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err) };
  }
  return {
    handled: true,
    ran: { toolName: p.toolName, result },
    reply: result.success
      ? doneMessage(p.toolName)
      : `⚠️ That didn't go through: ${clip(result.error ?? "unknown error", 300)}`,
  };
}

/**
 * Drop any pending send for this chat without executing it. Used for voice
 * notes: a transcript must never count as YES, but it does supersede.
 */
export function discardPending(ch: PhoneChannel): void {
  pending.delete(channelKey(ch));
}

/** Pending action created at or after `since` — used to append CONFIRM_PROMPT. */
export function pendingCreatedSince(ch: PhoneChannel, since: number): PendingAction | null {
  const p = pending.get(channelKey(ch));
  return p && p.createdAt >= since ? p : null;
}

/**
 * Keep the session transcript coherent when the listener answered without
 * the model (a YES/NO to a pending send), so the next turn knows what happened.
 */
export function recordExchange(ctx: AgentContext, userText: string, replyText: string): void {
  const now = Date.now();
  ctx.messages.push(
    { role: "user",      content: userText,  timestamp: now, uuid: randomUUID() },
    { role: "assistant", content: replyText, timestamp: now, uuid: randomUUID() },
  );
}

/** Test hook. */
export function __clearPendingForTests(): void {
  pending.clear();
}
