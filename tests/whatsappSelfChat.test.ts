// =============================================================================
// WhatsApp self-chat + LID classification (src/whatsapp/selfChat.ts)
//
// Contract (verified against Baileys 7.0.0-rc13 source): a message the owner
// types into "Message yourself" arrives with fromMe=true and must reach the
// agent; the agent's own replies must not; the owner's messages to friends
// must not; strangers are dropped; a LID is never treated as a phone number.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  classifyIncoming,
  resolvePhoneJid,
  ownerIdsFromUser,
  stripDevice,
  isLidJid,
  SentIdSet,
  type OwnerIds,
} from "../src/whatsapp/selfChat.js";

const OWNER_PN  = "6591234567@s.whatsapp.net";
const OWNER_LID = "123456789012345@lid";
const OWNER: OwnerIds = { pn: OWNER_PN, lid: OWNER_LID };
const FRIEND_PN = "6598765432@s.whatsapp.net";
const KID_PN    = "6587654321@s.whatsapp.net";
const ALLOWED   = new Set([KID_PN]);
const NONE      = new SentIdSet();

describe("self-chat — the owner talking to their agent", () => {
  it("phone-typed message in 'Message yourself' (fromMe, PN addressing) is accepted", () => {
    const d = classifyIncoming({ remoteJid: OWNER_PN, fromMe: true, id: "A1" }, OWNER, ALLOWED, NONE);
    assert.deepEqual(d, { accept: true, chatId: OWNER_PN, senderPn: OWNER_PN, isSelfChat: true, isOwner: true });
  });

  it("same message under LID addressing is accepted and replied to on the LID chat", () => {
    const d = classifyIncoming({ remoteJid: OWNER_LID, fromMe: true, id: "A2" }, OWNER, ALLOWED, NONE);
    assert.equal(d.accept, true);
    if (d.accept) {
      assert.equal(d.chatId, OWNER_LID, "reply into the chat as WhatsApp addressed it");
      assert.equal(d.isSelfChat, true);
    }
  });

  it("device-suffixed owner JIDs still count as the self-chat", () => {
    const d = classifyIncoming({ remoteJid: "6591234567:12@s.whatsapp.net", fromMe: true, id: "A3" }, OWNER, ALLOWED, NONE);
    assert.equal(d.accept, true);
  });

  it("the agent's own replies (echo) are ignored — no reply loop", () => {
    const sent = new SentIdSet();
    sent.add("BOT-1");
    const d = classifyIncoming({ remoteJid: OWNER_PN, fromMe: true, id: "BOT-1" }, OWNER, ALLOWED, sent);
    assert.deepEqual(d, { accept: false, reason: "bot_echo" });
  });
});

describe("the owner's other chats are never acted on", () => {
  it("owner messaging a friend from their phone (fromMe, other chat) is dropped", () => {
    const d = classifyIncoming({ remoteJid: FRIEND_PN, fromMe: true, id: "B1" }, OWNER, ALLOWED, NONE);
    assert.deepEqual(d, { accept: false, reason: "own_outgoing" });
  });

  it("…even when that friend is on the allowlist", () => {
    const d = classifyIncoming({ remoteJid: KID_PN, fromMe: true, id: "B2" }, OWNER, ALLOWED, NONE);
    assert.deepEqual(d, { accept: false, reason: "own_outgoing" });
  });
});

describe("other people — deny by default", () => {
  it("allowlisted family member (PN) is accepted", () => {
    const d = classifyIncoming({ remoteJid: KID_PN, fromMe: false, id: "C1" }, OWNER, ALLOWED, NONE);
    assert.deepEqual(d, { accept: true, chatId: KID_PN, senderPn: KID_PN, isSelfChat: false, isOwner: false });
  });

  it("allowlisted family member addressed by LID is matched via remoteJidAlt", () => {
    const d = classifyIncoming(
      { remoteJid: "999000111222333@lid", remoteJidAlt: KID_PN, fromMe: false, id: "C2" }, OWNER, ALLOWED, NONE);
    assert.equal(d.accept, true);
    if (d.accept) {
      assert.equal(d.senderPn, KID_PN, "identity is the real phone number");
      assert.equal(d.chatId, "999000111222333@lid", "reply target stays the chat as addressed");
    }
  });

  it("a stranger is dropped", () => {
    const d = classifyIncoming({ remoteJid: FRIEND_PN, fromMe: false }, OWNER, ALLOWED, NONE);
    assert.deepEqual(d, { accept: false, reason: "not_allowed" });
  });

  it("an unresolved LID is never matched against the phone allowlist", () => {
    // 15-digit LID whose digits could look like a phone number — must still be refused.
    const d = classifyIncoming({ remoteJid: "6587654321000@lid", fromMe: false }, OWNER, new Set(["6587654321000@s.whatsapp.net"]), NONE);
    assert.deepEqual(d, { accept: false, reason: "lid_unresolved" });
  });
});

describe("chats the agent never acts on", () => {
  it("groups, status/broadcast, and missing jids are dropped", () => {
    assert.deepEqual(classifyIncoming({ remoteJid: "12345-678@g.us", fromMe: false }, OWNER, ALLOWED, NONE), { accept: false, reason: "group" });
    assert.deepEqual(classifyIncoming({ remoteJid: "status@broadcast", fromMe: false }, OWNER, ALLOWED, NONE), { accept: false, reason: "broadcast" });
    assert.deepEqual(classifyIncoming({ remoteJid: null, fromMe: true }, OWNER, ALLOWED, NONE), { accept: false, reason: "no_jid" });
  });

  it("an owner group message (fromMe) is still dropped as a group", () => {
    assert.deepEqual(classifyIncoming({ remoteJid: "12345-678@g.us", fromMe: true }, OWNER, ALLOWED, NONE), { accept: false, reason: "group" });
  });
});

describe("identity helpers", () => {
  it("resolvePhoneJid prefers the real number and never derives one from a LID", () => {
    assert.equal(resolvePhoneJid({ remoteJid: FRIEND_PN }), FRIEND_PN);
    assert.equal(resolvePhoneJid({ remoteJid: "1@lid", remoteJidAlt: FRIEND_PN }), FRIEND_PN);
    assert.equal(resolvePhoneJid({ remoteJid: "6598765432@lid" }), null);
    assert.equal(resolvePhoneJid({ remoteJid: "1@lid", remoteJidAlt: "2@lid" }), null);
  });

  it("ownerIdsFromUser strips device suffixes and validates suffix types", () => {
    assert.deepEqual(ownerIdsFromUser({ id: "6591234567:43@s.whatsapp.net", lid: "123456789012345:43@lid" }), OWNER);
    assert.deepEqual(ownerIdsFromUser({ id: "6591234567:43@s.whatsapp.net" }), { pn: OWNER_PN, lid: null });
    assert.deepEqual(ownerIdsFromUser(null), { pn: null, lid: null });
  });

  it("LIDs are detected by suffix, not by digit length", () => {
    assert.equal(isLidJid("12@lid"), true);
    assert.equal(isLidJid("123456789012345678@s.whatsapp.net"), false);
    assert.equal(stripDevice("1:2@lid"), "1@lid");
  });

  it("SentIdSet stays bounded", () => {
    const s = new SentIdSet(3);
    for (const id of ["a", "b", "c", "d"]) s.add(id);
    assert.equal(s.size, 3);
    assert.equal(s.has("a"), false, "oldest evicted");
    assert.equal(s.has("d"), true);
  });
});
