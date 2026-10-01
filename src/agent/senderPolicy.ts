// =============================================================================
// Who may message the agent — deny by default
//
// Pure functions shared by channel listeners that previously served anyone:
//
//   WAHA (self-hosted WhatsApp) — had no sender check at all.
//   AgentMail (the agent's own inbox) — only checked when an allowlist was
//   configured; an empty list meant "anyone on the internet".
//
// Both now serve only explicitly allowed senders (AgentMail also its owner).
// Kept separate from the listeners so tests don't load their timers/IO.
// =============================================================================

/** Digits of a phone-number JID ("6591234567@c.us" / "…@s.whatsapp.net"); null for LIDs, groups, junk. */
export function phoneDigitsFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const m = jid.match(/^(\d{6,16})(?::\d+)?@(c\.us|s\.whatsapp\.net)$/);
  return m ? m[1] : null; // "@lid" is an internal id, never a phone number (workspace rule)
}

/** Normalise an allowlist entry ("+65 9123-4567", "6591234567@c.us") to digits. */
export function allowlistDigits(entry: string): string | null {
  const s = entry.trim();
  if (!s) return null;
  if (s.includes("@")) return phoneDigitsFromJid(s);
  const digits = s.replace(/[^\d]/g, "");
  return digits.length >= 6 ? digits : null;
}

/** Parse an allowlist given as an array or as comma/newline-separated text. */
export function parseAllowlist(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  if (typeof raw === "string") return raw.split(/[,\n]/);
  return [];
}

/**
 * WAHA: only allow-listed phone numbers. Groups, LIDs and anything else are
 * refused, and an empty allowlist refuses everyone.
 */
export function isWahaSenderAllowed(chatId: string, allowlist: unknown): boolean {
  const sender = phoneDigitsFromJid(chatId);
  if (!sender) return false;
  return parseAllowlist(allowlist).some((e) => allowlistDigits(e) === sender);
}

/**
 * WAHA: is this allowed sender the OWNER (full phone toolset) or a guest?
 * The owner is the number saved as the owner's phone (WhatsApp card or
 * Step 1 "Your Phone Number"). With no owner number saved, a single-entry
 * allowlist is taken to be the owner's own phone — the usual WAHA setup.
 * Anything else is a guest (guestMode.ts). Never a LID.
 */
export function isWahaOwner(chatId: string, ownerNumber: unknown, allowlist: unknown): boolean {
  const sender = phoneDigitsFromJid(chatId);
  if (!sender) return false;
  const owner = typeof ownerNumber === "string" ? allowlistDigits(ownerNumber) : null;
  if (owner) return owner === sender;
  const list = parseAllowlist(allowlist).map(allowlistDigits).filter(Boolean);
  return list.length === 1 && list[0] === sender;
}

/**
 * AgentMail: the owner's own addresses plus explicitly allowed senders.
 * Exact address match, case-insensitive. Everyone else is refused.
 */
export function isAgentMailSenderAllowed(
  senderEmail: string,
  allowlist: unknown,
  ownerAddresses: ReadonlyArray<string | null | undefined>,
): boolean {
  const sender = senderEmail.trim().toLowerCase();
  if (!sender || !sender.includes("@")) return false;
  const allowed = new Set(
    [...parseAllowlist(allowlist), ...ownerAddresses]
      .filter((a): a is string => typeof a === "string")
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.includes("@")),
  );
  return allowed.has(sender);
}
