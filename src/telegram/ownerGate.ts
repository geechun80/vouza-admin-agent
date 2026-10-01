// =============================================================================
// Telegram owner gate — who may talk to the bot
//
// Telegram bots are public: anyone who finds the username can message one.
// Before this gate every chat got the full agent (email, files, shell). Now:
//
//   • Once an owner is linked, only the owner (plus any chat ids the owner
//     explicitly allow-listed) is served. Everyone else gets a short notice.
//   • Linking uses a one-time claim code delivered as a deep link the owner
//     taps on their phone (t.me/<bot>?start=<code>). While a claim is open,
//     only "/start <code>" can link — a stranger can't race the owner.
//   • Installs with no owner and no open claim keep the old behaviour (first
//     chat links) so existing setups don't break; Quick Setup always opens a
//     claim before the bot goes live, so new installs never rely on it.
//
// Pure functions only — the listener owns persistence and replies.
// =============================================================================

import { randomBytes } from "crypto";

export const CLAIM_TTL_MS = 30 * 60_000;

export interface TelegramClaim {
  code:      string;
  expiresAt: number;
}

export type TelegramAccess =
  | { allow: true;  claimOwner: boolean }
  | { allow: false; reason: "not_owner" | "claim_required" };

/** "/start abc" or "/start@MyBot abc" → "abc"; anything else → null. */
export function parseStartPayload(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = text.trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})$/);
  return m ? m[1] : null;
}

/** Unguessable, deep-link-safe code (Telegram allows [A-Za-z0-9_-], ≤ 64). */
export function generateClaimCode(): string {
  return randomBytes(9).toString("base64url"); // 12 chars, 72 bits
}

export function claimDeepLink(botUsername: string, code: string): string {
  return `https://t.me/${botUsername}?start=${code}`;
}

export function decideTelegramAccess(opts: {
  chatId:         number;
  text?:          string | null;
  ownerChatId:    number | null;
  allowedChatIds: readonly number[];
  claim:          TelegramClaim | null;
  now:            number;
}): TelegramAccess {
  const { chatId, text, ownerChatId, allowedChatIds, claim, now } = opts;

  if (ownerChatId !== null) {
    return chatId === ownerChatId || allowedChatIds.includes(chatId)
      ? { allow: true, claimOwner: false }
      : { allow: false, reason: "not_owner" };
  }

  const claimOpen = !!claim && claim.expiresAt > now;
  if (claimOpen) {
    return parseStartPayload(text) === claim!.code
      ? { allow: true, claimOwner: true }
      : { allow: false, reason: "claim_required" };
  }

  // Legacy installs: no owner and no claim → first chat links.
  return { allow: true, claimOwner: true };
}

/** Normalize a config allowlist of chat ids (numbers or numeric strings). */
export function parseAllowedChatIds(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s]+/) : [];
  return list
    .map((v) => (typeof v === "number" ? v : Number(String(v).trim())))
    .filter((n) => Number.isSafeInteger(n) && n !== 0);
}
