// =============================================================================
// Telegram owner gate (src/telegram/ownerGate.ts)
//
// Contract: bots are public, so once linked only the owner (and chats the
// owner allow-listed) may use the agent. While a claim is open, only the
// exact one-time code links — a stranger cannot race the owner.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  decideTelegramAccess,
  parseStartPayload,
  generateClaimCode,
  claimDeepLink,
  parseAllowedChatIds,
  CLAIM_TTL_MS,
} from "../src/telegram/ownerGate.js";

const NOW = 1_750_000_000_000;
const OWNER = 111;
const KID = 222;
const STRANGER = 999;

describe("Telegram gate — owner linked", () => {
  it("serves the owner", () => {
    assert.deepEqual(
      decideTelegramAccess({ chatId: OWNER, ownerChatId: OWNER, allowedChatIds: [], claim: null, now: NOW }),
      { allow: true, claimOwner: false });
  });

  it("serves an allow-listed family member", () => {
    assert.equal(
      decideTelegramAccess({ chatId: KID, ownerChatId: OWNER, allowedChatIds: [KID], claim: null, now: NOW }).allow, true);
  });

  it("refuses a stranger — this is the hole that used to exist", () => {
    assert.deepEqual(
      decideTelegramAccess({ chatId: STRANGER, text: "read my emails", ownerChatId: OWNER, allowedChatIds: [KID], claim: null, now: NOW }),
      { allow: false, reason: "not_owner" });
  });

  it("a stranger can't take over by sending a claim-looking /start", () => {
    const claim = { code: "abc123", expiresAt: NOW + CLAIM_TTL_MS };
    assert.equal(
      decideTelegramAccess({ chatId: STRANGER, text: "/start abc123", ownerChatId: OWNER, allowedChatIds: [], claim, now: NOW }).allow,
      false);
  });
});

describe("Telegram gate — claiming", () => {
  const claim = { code: "Zx9_k-QWERTY", expiresAt: NOW + CLAIM_TTL_MS };

  it("the exact code links the owner", () => {
    assert.deepEqual(
      decideTelegramAccess({ chatId: OWNER, text: "/start Zx9_k-QWERTY", ownerChatId: null, allowedChatIds: [], claim, now: NOW }),
      { allow: true, claimOwner: true });
  });

  it("while a claim is open, anyone without the code is refused", () => {
    for (const text of ["/start", "hi", "/start wrong", "Zx9_k-QWERTY", undefined]) {
      assert.deepEqual(
        decideTelegramAccess({ chatId: STRANGER, text, ownerChatId: null, allowedChatIds: [], claim, now: NOW }),
        { allow: false, reason: "claim_required" }, `text=${text}`);
    }
  });

  it("an expired claim falls back to legacy first-chat linking", () => {
    const expired = { code: "old", expiresAt: NOW - 1 };
    assert.deepEqual(
      decideTelegramAccess({ chatId: OWNER, text: "hello", ownerChatId: null, allowedChatIds: [], claim: expired, now: NOW }),
      { allow: true, claimOwner: true });
  });

  it("legacy installs (no owner, no claim) keep first-chat linking", () => {
    assert.deepEqual(
      decideTelegramAccess({ chatId: OWNER, text: "hello", ownerChatId: null, allowedChatIds: [], claim: null, now: NOW }),
      { allow: true, claimOwner: true });
  });
});

describe("Telegram gate — helpers", () => {
  it("parses /start payloads, including the @BotName form", () => {
    assert.equal(parseStartPayload("/start abc_123"), "abc_123");
    assert.equal(parseStartPayload("  /start@MyAdminBot  abc  "), "abc");
    assert.equal(parseStartPayload("/start"), null);
    assert.equal(parseStartPayload("/start a b"), null);
    assert.equal(parseStartPayload("start abc"), null);
    assert.equal(parseStartPayload(undefined), null);
  });

  it("claim codes are deep-link-safe and not repeated", () => {
    const codes = new Set(Array.from({ length: 200 }, generateClaimCode));
    assert.equal(codes.size, 200);
    for (const c of codes) assert.match(c, /^[A-Za-z0-9_-]{12}$/);
  });

  it("deep link points at the bot with the start payload", () => {
    assert.equal(claimDeepLink("MyAdminBot", "abc"), "https://t.me/MyAdminBot?start=abc");
  });

  it("allow-list accepts numbers, numeric strings and comma text; drops junk", () => {
    assert.deepEqual(parseAllowedChatIds([222, "333", " 444 ", "abc", 0]), [222, 333, 444]);
    assert.deepEqual(parseAllowedChatIds("222, 333\n-1001"), [222, 333, -1001]);
    assert.deepEqual(parseAllowedChatIds(undefined), []);
  });
});
