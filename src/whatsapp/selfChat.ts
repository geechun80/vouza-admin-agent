// =============================================================================
// WhatsApp incoming-message classification — self-chat + LID aware
//
// Why this exists (verified against Baileys 7.0.0-rc13 source):
//   • A message the owner types on their phone into "Message yourself" reaches
//     this linked device with key.fromMe === true (decode-wa-message.js marks
//     anything from our own JID/LID as fromMe) and upsert type 'notify'
//     (messages-recv.js). The worker used to drop every fromMe message, so the
//     self-chat flow the setup screen recommends never reached the agent.
//   • Baileys v7 addresses many chats by LID ("…@lid"). A LID is an internal
//     WhatsApp id, NOT a phone number. The real number, when known, is in
//     key.remoteJidAlt. Matching the allowlist (phone numbers) against a raw
//     LID silently fails — and must never be "fixed" by treating the LID's
//     digits as a phone number (workspace rule: phone first, LID only as a
//     fallback identifier, detect LIDs by the "@lid" suffix, never by length).
//
// Two ways the assistant can be on WhatsApp (2.3.2):
//   • "assistant" (default for new setups) — it is linked to ITS OWN number.
//     The owner messages it from their personal WhatsApp, like a Telegram
//     bot; the owner's account is never linked. The owner is the configured
//     ownerNumber (a real phone number), matched on the resolved phone JID —
//     or, only when no phone is known for the message, on the owner's LID
//     that WhatsApp's own mapping returned for that number.
//   • "personal" (opt-in) — linked to the owner's own WhatsApp. It only acts
//     in "Message yourself", and (worker) only on messages that start with
//     its start word, so the owner's notes there stay private.
//
// Rules implemented here:
//   1. Never act on groups, broadcasts/status, or messages with no chat.
//   2. fromMe in a chat with someone else = the account holder talking to a
//      friend → never act on it.
//   3. fromMe in the linked account's own chat → act as the owner, unless it
//      is one of the agent's own replies (echo guard by message id).
//   4. Assistant mode: messages from the owner's number → act as the owner.
//   5. Messages from other people: allowed only when their RESOLVED phone
//      JID is on the allowlist (as guests). An unresolved LID is never matched.
// =============================================================================

export type WhatsAppMode = "assistant" | "personal";

export interface OwnerTarget {
  mode:     WhatsAppMode;
  /** Assistant mode: the owner's own phone JID, e.g. "6591234567@s.whatsapp.net" */
  ownerPn?:  string | null;
  /** Assistant mode: the owner's LID from WhatsApp's mapping — fallback only */
  ownerLid?: string | null;
}

/** "+65 9123 4567" / "6591234567" → "6591234567@s.whatsapp.net" (null when no digits). */
export function phoneToJid(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  return digits.length >= 6 ? `${digits}@s.whatsapp.net` : null;
}

export interface IncomingKey {
  remoteJid?:    string | null;
  remoteJidAlt?: string | null;
  fromMe?:       boolean | null;
  id?:           string | null;
}

export interface OwnerIds {
  /** Owner phone JID without device suffix, e.g. "6591234567@s.whatsapp.net" */
  pn:  string | null;
  /** Owner LID without device suffix, e.g. "123456789012345@lid" */
  lid: string | null;
}

export type DropReason =
  | "no_jid"
  | "broadcast"
  | "group"
  | "own_outgoing"   // owner messaging someone else from their phone
  | "bot_echo"       // one of the agent's own replies
  | "lid_unresolved" // someone else, addressed by LID with no phone number
  | "not_allowed";   // someone else, not on the allowlist

export type IncomingDecision =
  | { accept: true;  chatId: string; senderPn: string | null; isSelfChat: boolean; isOwner: boolean }
  | { accept: false; reason: DropReason };

const PN_SUFFIX  = "@s.whatsapp.net";
const LID_SUFFIX = "@lid";

/** "6591234567:43@s.whatsapp.net" → "6591234567@s.whatsapp.net" (same for @lid). */
export function stripDevice(jid: string): string {
  return jid.replace(/:\d+@/, "@");
}

export function isLidJid(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith(LID_SUFFIX);
}

export function isPhoneJid(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith(PN_SUFFIX);
}

/**
 * The sender's real phone JID, or null when only a LID is known.
 * Never derives a phone number from a LID.
 */
export function resolvePhoneJid(key: IncomingKey): string | null {
  const jid = key.remoteJid;
  if (!jid) return null;
  if (isPhoneJid(jid)) return stripDevice(jid);
  if (isLidJid(jid) && isPhoneJid(key.remoteJidAlt)) return stripDevice(key.remoteJidAlt!);
  return null;
}

/** Owner identifiers from Baileys' sock.user ({ id, lid }), device suffix stripped. */
export function ownerIdsFromUser(user: { id?: string | null; lid?: string | null } | null | undefined): OwnerIds {
  const id  = user?.id  ? stripDevice(user.id)  : null;
  const lid = user?.lid ? stripDevice(user.lid) : null;
  return {
    pn:  isPhoneJid(id) ? id : null,
    lid: isLidJid(lid) ? lid : null,
  };
}

export function classifyIncoming(
  key:        IncomingKey,
  owner:      OwnerIds,
  allowedPns: ReadonlySet<string>,
  sentIds:    { has(id: string): boolean },
  target:     OwnerTarget = { mode: "personal" },
): IncomingDecision {
  const jid = key.remoteJid;
  if (!jid) return { accept: false, reason: "no_jid" };
  if (jid.endsWith("@broadcast")) return { accept: false, reason: "broadcast" };
  if (jid.endsWith("@g.us"))      return { accept: false, reason: "group" };

  const pn = resolvePhoneJid(key);
  // The linked account's own chat ("Message yourself").
  const isSelfChat =
    (!!owner.pn && pn === owner.pn) ||
    (!!owner.lid && isLidJid(jid) && stripDevice(jid) === owner.lid);

  if (key.fromMe) {
    if (!isSelfChat) return { accept: false, reason: "own_outgoing" };
    if (key.id && sentIds.has(key.id)) return { accept: false, reason: "bot_echo" };
    return { accept: true, chatId: jid, senderPn: owner.pn, isSelfChat: true, isOwner: true };
  }

  if (isSelfChat) return { accept: true, chatId: jid, senderPn: owner.pn, isSelfChat: true, isOwner: true };

  // Assistant mode: the owner writing from their personal WhatsApp. Phone
  // number first; the LID only when this message carries no phone number.
  if (target.mode === "assistant") {
    const ownerPn  = target.ownerPn  ? stripDevice(target.ownerPn)  : null;
    const ownerLid = target.ownerLid ? stripDevice(target.ownerLid) : null;
    const fromOwner =
      (!!ownerPn && pn === ownerPn) ||
      (!pn && !!ownerLid && isLidJid(jid) && stripDevice(jid) === ownerLid);
    if (fromOwner) return { accept: true, chatId: jid, senderPn: pn ?? ownerPn, isSelfChat: false, isOwner: true };
  }

  if (!pn)        return { accept: false, reason: "lid_unresolved" };
  if (allowedPns.has(pn)) return { accept: true, chatId: jid, senderPn: pn, isSelfChat: false, isOwner: false };
  return { accept: false, reason: "not_allowed" };
}

/**
 * Bounded memory of message ids the agent itself sent, so its replies in the
 * self-chat are never mistaken for new instructions from the owner.
 */
export class SentIdSet {
  private ids = new Set<string>();
  constructor(private readonly max = 500) {}
  add(id: string): void {
    this.ids.add(id);
    if (this.ids.size > this.max) {
      const oldest = this.ids.values().next().value;
      if (oldest !== undefined) this.ids.delete(oldest);
    }
  }
  has(id: string): boolean {
    return this.ids.has(id);
  }
  get size(): number {
    return this.ids.size;
  }
}
