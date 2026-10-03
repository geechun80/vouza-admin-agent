// =============================================================================
// WhatsApp modes (2.3.2) — "works like Telegram", never takes over the
// owner's WhatsApp unless they opt in.
//
//   assistant: linked to the assistant's own number; the owner messages it
//              from their personal WhatsApp (matched on the real phone
//              number; LID only as a fallback from WhatsApp's own mapping).
//   personal:  linked to the owner's own WhatsApp; only "Message yourself"
//              messages that start with the start word are instructions.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { classifyIncoming, phoneToJid, SentIdSet, type OwnerIds, type OwnerTarget } from "../src/whatsapp/selfChat.js";
import { matchWakeWord, defaultWakeWord, cleanWakeWord } from "../src/whatsapp/wakeWord.js";
import { baileysSettingsFrom } from "../src/whatsapp/baileysManager.js";
import { normalizeOwnerNumber, samePhoneNumber, whatsappHello } from "../src/setup/quickSetup.js";

// Example numbers only (not real people).
const ASSISTANT: OwnerIds = { pn: "6580000001@s.whatsapp.net", lid: "111111111111111@lid" };
const ME_PN     = "6580000002@s.whatsapp.net";
const ME_LID    = "222222222222222@lid";
const FRIEND_PN = "6580000003@s.whatsapp.net";
const NONE      = new SentIdSet();
const AS: OwnerTarget = { mode: "assistant", ownerPn: ME_PN, ownerLid: ME_LID };

describe("assistant mode — like a Telegram bot", () => {
  it("my message from my own WhatsApp is an instruction from the owner", () => {
    const d = classifyIncoming({ remoteJid: ME_PN, fromMe: false, id: "1" }, ASSISTANT, new Set(), NONE, AS);
    assert.deepEqual(d, { accept: true, chatId: ME_PN, senderPn: ME_PN, isSelfChat: false, isOwner: true });
  });

  it("addressed by LID with my phone number attached → still me", () => {
    const d = classifyIncoming({ remoteJid: "333@lid", remoteJidAlt: ME_PN, fromMe: false }, ASSISTANT, new Set(), NONE, AS);
    assert.equal(d.accept && d.isOwner, true);
  });

  it("LID only: matched on my LID from WhatsApp's mapping — never on digits", () => {
    const viaLid = classifyIncoming({ remoteJid: ME_LID, fromMe: false }, ASSISTANT, new Set(), NONE, AS);
    assert.equal(viaLid.accept && viaLid.isOwner, true);
    // a LID whose digits look like my number is NOT me
    const lookalike = classifyIncoming({ remoteJid: "6580000002@lid", fromMe: false }, ASSISTANT, new Set(), NONE, AS);
    assert.deepEqual(lookalike, { accept: false, reason: "lid_unresolved" });
    // and no LID fallback when the message carries a different phone number
    const other = classifyIncoming({ remoteJid: ME_LID, remoteJidAlt: FRIEND_PN, fromMe: false }, ASSISTANT, new Set(), NONE, AS);
    assert.deepEqual(other, { accept: false, reason: "not_allowed" });
  });

  it("strangers are still ignored; allow-listed people are guests, not owners", () => {
    assert.deepEqual(classifyIncoming({ remoteJid: FRIEND_PN, fromMe: false }, ASSISTANT, new Set(), NONE, AS),
      { accept: false, reason: "not_allowed" });
    const g = classifyIncoming({ remoteJid: FRIEND_PN, fromMe: false }, ASSISTANT, new Set([FRIEND_PN]), NONE, AS);
    assert.equal(g.accept && g.isOwner, false);
  });

  it("without a saved owner number nobody is the owner by message (only the assistant phone's own chat)", () => {
    const t: OwnerTarget = { mode: "assistant", ownerPn: null };
    assert.deepEqual(classifyIncoming({ remoteJid: ME_PN, fromMe: false }, ASSISTANT, new Set(), NONE, t),
      { accept: false, reason: "not_allowed" });
  });

  it("personal mode never treats a message from my number as the owner (only my own self-chat)", () => {
    const d = classifyIncoming({ remoteJid: ME_PN, fromMe: false }, ASSISTANT, new Set(), NONE, { mode: "personal", ownerPn: ME_PN });
    assert.deepEqual(d, { accept: false, reason: "not_allowed" });
  });
});

describe("start word — 'Message yourself' stays my notes chat", () => {
  it("only messages that start with the assistant's name are instructions", () => {
    assert.deepEqual(matchWakeWord("Vee, find my insurance policy", "Vee"), { matched: true, rest: "find my insurance policy" });
    assert.deepEqual(matchWakeWord("vee: any emails?", "Vee"), { matched: true, rest: "any emails?" });
    assert.deepEqual(matchWakeWord("@Vee hi", "Vee"), { matched: true, rest: "hi" });
    assert.deepEqual(matchWakeWord("Hey Vee — what's on today", "Vee"), { matched: true, rest: "what's on today" });
    assert.equal(matchWakeWord("Vee", "Vee").matched, true);
  });

  it("notes, and words that merely start with the name, are ignored", () => {
    assert.equal(matchWakeWord("Yes, I will send you", "Vee").matched, false);
    assert.equal(matchWakeWord("Veerappan's number 9123", "Vee").matched, false);
    assert.equal(matchWakeWord("remind me: call Vee", "Vee").matched, false);
  });

  it("multi-word names and special characters work", () => {
    assert.equal(matchWakeWord("Office Bot, check mail", "Office Bot").rest, "check mail");
    assert.equal(matchWakeWord("A.I. please", "A.I.").matched, true);
    assert.equal(matchWakeWord("AxIx please", "A.I.").matched, false);
  });

  it("default start word: the assistant's name, or 'Vee' for the built-in default names", () => {
    assert.equal(defaultWakeWord("AdminAgent"), "Vee");
    assert.equal(defaultWakeWord("Admin Agent"), "Vee");
    assert.equal(defaultWakeWord(""), "Vee");
    assert.equal(defaultWakeWord("Max"), "Max");
    assert.equal(cleanWakeWord("  Max\n "), "Max");
  });
});

describe("settings, numbers and messages", () => {
  it("a setup saved before 2.3.2 (no mode) is personal, with a start word", () => {
    const s = baileysSettingsFrom({ allowedSenders: ["+65 8000 0003"] }, "AdminAgent");
    assert.equal(s.mode, "personal");
    assert.equal(s.wakeWord, "Vee");
    assert.deepEqual(s.allowedSenders, ["+65 8000 0003"]);
    assert.equal(baileysSettingsFrom({ mode: "assistant", ownerNumber: "+6580000002" }, "Max").mode, "assistant");
  });

  it("the owner's number needs a country code", () => {
    assert.deepEqual(normalizeOwnerNumber("+65 8000 0002"), { ok: true, number: "+6580000002" });
    assert.deepEqual(normalizeOwnerNumber("0065 8000 0002"), { ok: true, number: "+6580000002" });
    assert.equal(normalizeOwnerNumber("8000 0002").ok, false);
    assert.equal(normalizeOwnerNumber("").ok, false);
    assert.equal(samePhoneNumber("+65 8000 0002", "6580000002"), true);
    assert.equal(phoneToJid("+65 8000 0002"), "6580000002@s.whatsapp.net");
  });

  it("the hello explains how each mode works", () => {
    assert.match(whatsappHello("assistant", "GC", "Vee"), /my own WhatsApp number[\s\S]*like a Telegram bot[\s\S]*YES/);
    const p = whatsappHello("personal", "GC", "Vee");
    assert.match(p, /only messages that start with “Vee”/);
    assert.match(p, /other chats and your own notes here stay private/);
  });
});

describe("the WhatsApp worker and manager", () => {
  const worker  = readFileSync("src/whatsapp/baileysWorker.ts", "utf8");
  const manager = readFileSync("src/whatsapp/baileysManager.ts", "utf8");

  it("personal mode: only start-word messages in 'Message yourself'; voice notes there are never transcribed", () => {
    assert.match(worker, /if \(target\.mode === "personal" && decision\.isSelfChat\) \{[\s\S]*?if \(isVoice\) continue;[\s\S]*?matchWakeWord\(textBody, word\)/);
  });

  it("shows typing… while working, and the owner flag comes from the decision", () => {
    assert.match(worker, /startTyping\(chatId\);\s*ipc\(\{ type: "incoming_text"[^\n]*isOwner: decision\.isOwner === true/);
    assert.match(worker, /sendPresenceUpdate\("composing", chatId\)/);
  });

  it("logs never name the owner's contacts", () => {
    assert.doesNotMatch(worker, /dropped message from \$\{msg\.pushName/);
  });

  it("never leaves a message unanswered, and says 'working on it' when slow", () => {
    assert.match(manager, /if \(!reply\) \{/);
    assert.match(manager, /keepTyping: true/);
  });
});
