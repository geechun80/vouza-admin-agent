// =============================================================================
// Guest mode — people the owner allow-listed, who are not the owner
//
// The owner can let a family member or colleague message the assistant on
// WhatsApp or Telegram. Before this module they got the owner's own phone
// toolset: they could read the owner's email, search the owner's documents,
// have files sent to them, and send email from the owner's account by
// answering YES themselves.
//
// A guest now gets:
//   • no tools at all — nothing that reads, sends, searches or goes online;
//   • none of the owner's memory, profile or learned skills in the prompt;
//   • no learning from their conversation (it would land in the owner's memory).
// They can still chat: questions, drafting text, explanations.
//
// Who is the owner (decided by the listener, never by the model):
//   WhatsApp (Baileys) — the "Message yourself" chat of the linked account
//   WhatsApp (WAHA)    — the owner number in settings (see isWahaOwner)
//   Telegram           — the chat that linked the bot with the setup link
// =============================================================================

import { ToolRegistry } from "../tools/registry.js";
import type { AgentContext, MemoryEntry, MemoryStore } from "../types/index.js";

const GUEST_REGISTRY = new ToolRegistry();

/** The guest toolset: empty. */
export function buildGuestRegistry(): ToolRegistry {
  return GUEST_REGISTRY;
}

/** A memory store that holds nothing and saves nothing. */
export const NO_MEMORY: MemoryStore = {
  entries: new Map<string, MemoryEntry>(),
  async load() {},
  async save() {},
  async add() { return "guest-noop"; },
  async search() { return []; },
  async update() {},
  async remove() {},
};

/** Turn a freshly created chat session into a guest session (in place). */
export function makeGuest(ctx: AgentContext, name: string): AgentContext {
  ctx.guest  = { name: (name || "Guest").slice(0, 60) };
  ctx.memory = NO_MEMORY;
  return ctx;
}

export function guestSystemPrompt(name: string): string {
  return [
    `You are a friendly assistant. You are chatting with ${name}, a guest the owner of this assistant allowed to message you.`,
    "",
    "Rules:",
    "- This person is NOT the owner. You have no access to the owner's email, files, calendar, contacts, memory or accounts, and you cannot send messages or go online.",
    "- Never share or guess personal information about the owner, and never claim to have done something you cannot do.",
    "- If they ask for something that needs the owner's accounts, say kindly that only the owner can ask for that.",
    "- Otherwise help normally: answer questions, explain things, draft or rewrite text for them to send themselves.",
    "- Keep replies short and clear — this is a phone chat.",
  ].join("\n");
}
