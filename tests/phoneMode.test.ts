// =============================================================================
// Phone mode (src/agent/phoneMode.ts) + send_file_to_me (src/tools/sendFile.ts)
//
// Contract: WhatsApp/Telegram chats get a small allow-listed toolset. Sending
// email on the user's behalf requires an explicit YES that is enforced in code
// — the wrapped tool never sends by itself, and only the listener can execute
// the parked action after a confirming reply.
// =============================================================================

import { describe, it, beforeEach, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { ToolRegistry, buildTool } from "../src/tools/registry.js";
import {
  buildPhoneRegistry,
  isPhoneRegistry,
  classifyReply,
  describeAction,
  resolvePendingReply,
  pendingCreatedSince,
  recordExchange,
  PHONE_TOOL_NAMES,
  PENDING_TTL_MS,
  __clearPendingForTests,
} from "../src/agent/phoneMode.js";
import { sendFileToMeTool, __setFileSendersForTests, mimeTypeFor, MAX_PHONE_FILE_BYTES } from "../src/tools/sendFile.js";
import type { AgentContext, PhoneChannel } from "../src/types/index.js";

const WA: PhoneChannel = { kind: "whatsapp", chatId: "6591234567@s.whatsapp.net" };

function ctx(channel?: PhoneChannel): AgentContext {
  return {
    sessionId: "t", turnCount: 0, messages: [], memory: {} as any,
    config: { tools: {} } as any, tools: new Map(), taskQueue: [], channel,
  };
}

/** Registry with a spy send_email plus every phone tool name and some forbidden ones. */
function fullRegistry() {
  const sent: any[] = [];
  const reg = new ToolRegistry();
  const mk = (name: string, call?: (i: any) => any) =>
    reg.register(buildTool({
      name, description: name, category: "email", inputSchema: z.any(),
      call: async (i: any) => ({ success: true, data: call ? call(i) : name }),
    }) as any);
  mk("send_email", (i) => { sent.push(i); return { messageId: "m1" }; });
  for (const n of PHONE_TOOL_NAMES) if (n !== "send_email" && n !== "send_file_to_me") mk(n);
  for (const n of ["delete_email", "delete_file", "run_shell_command", "write_file", "browser_navigate",
                   "save_integration_credentials", "send_whatsapp_message", "create_calendar_event"]) mk(n);
  return { reg, sent };
}

beforeEach(() => __clearPendingForTests());

describe("phone mode — toolset", () => {
  it("exposes only allow-listed tools and drops destructive/admin ones", () => {
    const phone = buildPhoneRegistry(fullRegistry().reg);
    const names = phone.getAll().map((t) => t.name).sort();
    assert.deepEqual(names, [...PHONE_TOOL_NAMES].sort());
    for (const banned of ["delete_email", "delete_file", "run_shell_command", "write_file",
                          "browser_navigate", "save_integration_credentials", "send_whatsapp_message",
                          "create_calendar_event"]) {
      assert.equal(phone.get(banned), undefined, `${banned} must not reach a phone chat`);
    }
  });

  it("adds send_file_to_me even though the main registry doesn't carry it", () => {
    assert.ok(buildPhoneRegistry(new ToolRegistry()).get("send_file_to_me"));
  });

  it("is idempotent — wrapping a phone registry returns it unchanged", () => {
    const phone = buildPhoneRegistry(fullRegistry().reg);
    assert.equal(buildPhoneRegistry(phone), phone);
    assert.equal(isPhoneRegistry(phone), true);
  });
});

describe("phone mode — sends wait for YES", () => {
  const email = { to: "boss@acme.com", subject: "Report", body: "Attached." };

  it("the wrapped tool parks the send instead of sending", async () => {
    const { reg, sent } = fullRegistry();
    const r = await buildPhoneRegistry(reg).get("send_email")!.call(email, ctx(WA));
    assert.equal(sent.length, 0, "nothing may be sent before YES");
    assert.equal((r.data as any).status, "AWAITING_USER_CONFIRMATION");
    assert.match((r.data as any).summary, /boss@acme\.com/);
    assert.ok(pendingCreatedSince(WA, 0));
  });

  it("YES executes exactly once", async () => {
    const { reg, sent } = fullRegistry();
    await buildPhoneRegistry(reg).get("send_email")!.call(email, ctx(WA));
    const r = await resolvePendingReply(WA, "Yes!");
    assert.equal(r.handled, true);
    assert.match(r.reply!, /Sent/);
    assert.equal(sent.length, 1);
    assert.equal((await resolvePendingReply(WA, "yes")).handled, false, "a second YES must not resend");
    assert.equal(sent.length, 1);
  });

  it("NO cancels without sending", async () => {
    const { reg, sent } = fullRegistry();
    await buildPhoneRegistry(reg).get("send_email")!.call(email, ctx(WA));
    const r = await resolvePendingReply(WA, "cancel");
    assert.equal(r.handled, true);
    assert.match(r.reply!, /Cancelled/);
    assert.equal(sent.length, 0);
  });

  it("anything else discards the pending send and goes to the model", async () => {
    const { reg, sent } = fullRegistry();
    await buildPhoneRegistry(reg).get("send_email")!.call(email, ctx(WA));
    assert.equal((await resolvePendingReply(WA, "yes but change the subject")).handled, false);
    assert.equal((await resolvePendingReply(WA, "yes")).handled, false, "superseded action is gone");
    assert.equal(sent.length, 0);
  });

  it("an expired pending send cannot be confirmed", async () => {
    const { reg, sent } = fullRegistry();
    await buildPhoneRegistry(reg).get("send_email")!.call(email, ctx(WA));
    const r = await resolvePendingReply(WA, "yes", Date.now() + PENDING_TTL_MS + 1);
    assert.equal(r.handled, false);
    assert.equal(sent.length, 0);
  });

  it("pending sends are per chat — one chat's YES can't confirm another's", async () => {
    const { reg, sent } = fullRegistry();
    await buildPhoneRegistry(reg).get("send_email")!.call(email, ctx(WA));
    const other: PhoneChannel = { kind: "telegram", chatId: "999" };
    assert.equal((await resolvePendingReply(other, "yes")).handled, false);
    assert.equal(sent.length, 0);
  });

  it("a failed send reports the error instead of claiming success", async () => {
    const reg = new ToolRegistry();
    reg.register(buildTool({
      name: "send_email", description: "", category: "email", inputSchema: z.any(),
      call: async () => ({ success: false, error: "Invalid login: 535 bad credentials" }),
    }) as any);
    await buildPhoneRegistry(reg).get("send_email")!.call(email, ctx(WA));
    const r = await resolvePendingReply(WA, "yes");
    assert.match(r.reply!, /didn't go through: Invalid login/);
  });

  it("without a phone channel the wrapper passes straight through", async () => {
    const { reg, sent } = fullRegistry();
    await buildPhoneRegistry(reg).get("send_email")!.call(email, ctx(undefined));
    assert.equal(sent.length, 1);
  });

  it("recordExchange keeps user/assistant alternation for the next turn", () => {
    const c = ctx(WA);
    recordExchange(c, "yes", "✅ Sent.");
    assert.deepEqual(c.messages.map((m) => m.role), ["user", "assistant"]);
  });
});

describe("phone mode — reading replies", () => {
  for (const t of ["yes", "YES", "Yes.", "ok", "okay!", "send it", "go ahead", "👍", "好的", "确认", "boleh"]) {
    it(`"${t}" confirms`, () => assert.equal(classifyReply(t), "confirm"));
  }
  for (const t of ["no", "No!", "cancel", "don't", "dont send", "取消", "jangan"]) {
    it(`"${t}" cancels`, () => assert.equal(classifyReply(t), "cancel"));
  }
  for (const t of ["yes but change the subject", "maybe", "what's in it?", "yesterday", "nothing", ""]) {
    it(`"${t}" is neither`, () => assert.equal(classifyReply(t), "other"));
  }

  it("summaries name recipient, subject and attachments", () => {
    const s = describeAction("send_email", {
      to: "a@b.com", subject: "Policy", body: "here", attachments: ["C:\\Docs\\insurance.pdf"],
    });
    assert.match(s, /a@b\.com/);
    assert.match(s, /"Policy"/);
    assert.match(s, /1 attachment: insurance\.pdf/);
  });
});

describe("send_file_to_me", () => {
  // `ws` plays a folder the owner granted read access to; `outside` is not granted.
  // The grants file is written directly (loadGrants only checks its shape) so
  // the test never touches the real workspace/ or data/ folders.
  const ws = mkdtempSync(join(tmpdir(), "sendfile-ws-"));
  const outside = mkdtempSync(join(tmpdir(), "sendfile-out-"));
  const prevGrants = process.env.FOLDER_GRANTS_FILE;
  process.env.FOLDER_GRANTS_FILE = join(outside, "..", `sendfile-grants-${process.pid}.json`);
  writeFileSync(process.env.FOLDER_GRANTS_FILE,
    JSON.stringify({ version: 1, grants: [{ path: ws, mode: "read", addedAt: new Date().toISOString() }] }));
  writeFileSync(join(ws, "policy.pdf"), "%PDF-1.4 test");
  writeFileSync(join(ws, "empty.txt"), "");
  mkdirSync(join(ws, "sub"));
  writeFileSync(join(outside, "secret.txt"), "nope");

  after(() => {
    __setFileSendersForTests(null);
    rmSync(process.env.FOLDER_GRANTS_FILE!, { force: true });
    if (prevGrants === undefined) delete process.env.FOLDER_GRANTS_FILE; else process.env.FOLDER_GRANTS_FILE = prevGrants;
    rmSync(ws, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("delivers an allowed file into the chat it was asked from", async () => {
    const calls: any[] = [];
    __setFileSendersForTests({ whatsapp: async (chatId, f) => { calls.push({ chatId, f }); } });
    const r = await sendFileToMeTool.call({ filePath: join(ws, "policy.pdf") }, ctx(WA));
    assert.equal(r.success, true, r.error);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].chatId, WA.chatId);
    assert.equal(calls[0].f.fileName, "policy.pdf");
    assert.equal(calls[0].f.mimeType, "application/pdf");
  });

  it("refuses files outside the workspace and granted folders", async () => {
    let called = false;
    __setFileSendersForTests({ whatsapp: async () => { called = true; } });
    const r = await sendFileToMeTool.call({ filePath: join(outside, "secret.txt") }, ctx(WA));
    assert.equal(r.success, false);
    assert.match(r.error!, /outside the folders/);
    assert.equal(called, false);
  });

  it("refuses outside a phone chat (dashboard)", async () => {
    const r = await sendFileToMeTool.call({ filePath: join(ws, "policy.pdf") }, ctx(undefined));
    assert.equal(r.success, false);
    assert.match(r.error!, /only works inside a WhatsApp or Telegram chat/);
  });

  it("reports missing, empty and folder paths clearly", async () => {
    __setFileSendersForTests({ whatsapp: async () => {} });
    assert.match((await sendFileToMeTool.call({ filePath: join(ws, "nope.pdf") }, ctx(WA))).error!, /not found/);
    assert.match((await sendFileToMeTool.call({ filePath: join(ws, "empty.txt") }, ctx(WA))).error!, /empty/);
    assert.match((await sendFileToMeTool.call({ filePath: join(ws, "sub") }, ctx(WA))).error!, /folder/);
  });

  it("surfaces a channel failure instead of claiming success", async () => {
    __setFileSendersForTests({ whatsapp: async () => { throw new Error("WhatsApp is not connected"); } });
    const r = await sendFileToMeTool.call({ filePath: join(ws, "policy.pdf") }, ctx(WA));
    assert.equal(r.success, false);
    assert.match(r.error!, /WhatsApp is not connected/);
  });

  it("routes Telegram chats to the Telegram sender", async () => {
    const tg: string[] = [];
    __setFileSendersForTests({ telegram: async (chatId) => { tg.push(chatId); } });
    const r = await sendFileToMeTool.call({ filePath: join(ws, "policy.pdf") }, ctx({ kind: "telegram", chatId: "42" }));
    assert.equal(r.success, true, r.error);
    assert.deepEqual(tg, ["42"]);
  });

  it("mime types and size cap", () => {
    assert.equal(mimeTypeFor("A.DOCX"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(mimeTypeFor("weird.xyz"), "application/octet-stream");
    assert.ok(MAX_PHONE_FILE_BYTES < 50 * 1024 * 1024, "must stay under Telegram's 50 MB bot limit");
  });
});
