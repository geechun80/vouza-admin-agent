// =============================================================================
// Unattended / external tool profiles + deny-by-default senders
//   src/agent/toolProfiles.ts, src/agent/senderPolicy.ts
//
// Contract: runs with no person watching (scheduled briefings/skills) and
// messages from other people (AgentMail, WAHA) must never reach tools that
// send, delete, write, browse or run commands; unknown senders are refused.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolRegistry, buildTool } from "../src/tools/registry.js";
import {
  buildScheduledRegistry,
  buildExternalRegistry,
  SCHEDULED_TOOL_NAMES,
  EXTERNAL_TOOL_NAMES,
} from "../src/agent/toolProfiles.js";
import {
  isWahaSenderAllowed,
  isAgentMailSenderAllowed,
  phoneDigitsFromJid,
  allowlistDigits,
} from "../src/agent/senderPolicy.js";

/** Everything the desktop registry can hold that must never run unattended. */
const DANGEROUS = [
  "send_email", "reply_email", "delete_email", "delete_file", "write_file", "organize_files",
  "copy_file", "rename_file", "run_shell_command", "browser_navigate", "browser_fill", "browser_click",
  "save_memory", "update_memory", "forget_memory", "write_spreadsheet", "create_calendar_event",
  "update_calendar_event", "delete_calendar_event", "send_whatsapp_message", "send_telegram_message",
  "save_integration_credentials", "agentmail_send_email", "send_file_to_me",
  // Going online with nobody there to ask — search words could carry injected private text
  "web_search",
];

function fullRegistry() {
  const calls: Array<{ name: string; input: any }> = [];
  const reg = new ToolRegistry();
  for (const name of new Set([...SCHEDULED_TOOL_NAMES, ...DANGEROUS])) {
    reg.register(buildTool({
      name, description: name, category: "email", inputSchema: z.any(),
      call: async (input: any) => { calls.push({ name, input }); return { success: true, data: name }; },
    }) as any);
  }
  return { reg, calls };
}

const ctx: any = { config: { tools: {} }, messages: [] };

describe("scheduled runs — no sends, deletes, writes, browsing or commands", () => {
  it("contains only the scheduled profile", () => {
    const names = buildScheduledRegistry(fullRegistry().reg).getAll().map((t) => t.name).sort();
    assert.deepEqual(names, [...SCHEDULED_TOOL_NAMES].sort());
    for (const bad of DANGEROUS) assert.ok(!names.includes(bad), `${bad} must not run unattended`);
  });

  it("triage may label/star/mark read but never archive or trash", async () => {
    const { reg, calls } = fullRegistry();
    const triage = buildScheduledRegistry(reg).get("triage_emails")!;
    for (const action of ["label", "star", "mark_read", "mark_unread"]) {
      assert.equal((await triage.call({ messageIds: ["1"], action }, ctx)).success, true, action);
    }
    for (const action of ["trash", "archive", ""]) {
      const r = await triage.call({ messageIds: ["1"], action }, ctx);
      assert.equal(r.success, false, action);
      assert.match(r.error!, /isn't allowed in automatic runs/);
    }
    assert.equal(calls.filter((c) => c.name === "triage_emails").length, 4, "refused actions never reach Gmail");
  });

  it("the launcher really hands the scheduler the restricted registry", async () => {
    const src = await readFile(path.resolve(process.cwd(), "src/bridge/launcher.ts"), "utf-8");
    assert.match(src, /new TaskScheduler\(context, buildScheduledRegistry\(registry\), skills\)/);
  });
});

describe("external senders (AgentMail) — read-only", () => {
  it("contains only read-only tools, not even setup status", () => {
    const names = buildExternalRegistry(fullRegistry().reg).getAll().map((t) => t.name).sort();
    assert.deepEqual(names, [...EXTERNAL_TOOL_NAMES].sort());
    for (const bad of [...DANGEROUS, "draft_email", "triage_emails", "get_setup_status"]) {
      assert.ok(!names.includes(bad), `${bad} must not be reachable by outside senders`);
    }
  });

  it("profiles are idempotent", () => {
    const s = buildScheduledRegistry(fullRegistry().reg);
    assert.equal(buildScheduledRegistry(s), s);
    const e = buildExternalRegistry(fullRegistry().reg);
    assert.equal(buildExternalRegistry(e), e);
  });

  it("the AgentMail listener uses the external profile", async () => {
    const src = await readFile(path.resolve(process.cwd(), "src/email/agentMailListener.ts"), "utf-8");
    assert.match(src, /_registry\s+=\s+buildExternalRegistry\(registry\)/);
  });
});

describe("WAHA senders — deny by default", () => {
  const allow = ["+65 9123 4567", "6598765432@c.us"];

  it("serves only allow-listed numbers, in any written form", () => {
    assert.equal(isWahaSenderAllowed("6591234567@c.us", allow), true);
    assert.equal(isWahaSenderAllowed("6598765432@c.us", allow), true);
    assert.equal(isWahaSenderAllowed("6591234567@s.whatsapp.net", allow), true);
    assert.equal(isWahaSenderAllowed("6511112222@c.us", allow), false);
  });

  it("an empty or missing allowlist refuses everyone (this used to serve anyone)", () => {
    assert.equal(isWahaSenderAllowed("6591234567@c.us", []), false);
    assert.equal(isWahaSenderAllowed("6591234567@c.us", undefined), false);
    assert.equal(isWahaSenderAllowed("6591234567@c.us", ""), false);
  });

  it("refuses groups and LIDs — a LID is never treated as a phone number", () => {
    assert.equal(isWahaSenderAllowed("1203630000000000@g.us", ["1203630000000000"]), false);
    assert.equal(isWahaSenderAllowed("6591234567@lid", ["6591234567"]), false);
    assert.equal(phoneDigitsFromJid("6591234567@lid"), null);
  });

  it("accepts comma/newline text allowlists and ignores junk entries", () => {
    assert.equal(isWahaSenderAllowed("6591234567@c.us", "6511112222,\n+65 9123-4567"), true);
    assert.equal(allowlistDigits("abc"), null);
    assert.equal(allowlistDigits("123"), null, "too short to be a phone number");
  });

  it("phone mode can leave out file delivery (WAHA can't send files yet)", async () => {
    const { buildPhoneRegistry } = await import("../src/agent/phoneMode.js");
    const names = buildPhoneRegistry(fullRegistry().reg, { exclude: ["send_file_to_me"] }).getAll().map((t) => t.name);
    assert.ok(!names.includes("send_file_to_me"));
    assert.ok(!names.includes("run_shell_command"));
    assert.ok(names.includes("send_email"), "sends stay available — gated by YES");
  });

  it("the WAHA listener applies the gate and phone mode", async () => {
    const src = await readFile(path.resolve(process.cwd(), "src/whatsapp/wahaListener.ts"), "utf-8");
    assert.match(src, /isWahaSenderAllowed\(payload\.from/);
    assert.match(src, /buildPhoneRegistry\(registry, \{ exclude: \["send_file_to_me"\] \}\)/);
  });
});

describe("AgentMail senders — owner + allowlist only", () => {
  const owner = ["me@gmail.com", undefined, null];

  it("serves the owner and allow-listed addresses, case-insensitively", () => {
    assert.equal(isAgentMailSenderAllowed("Me@Gmail.com", [], owner), true);
    assert.equal(isAgentMailSenderAllowed("boss@acme.com", ["BOSS@acme.com"], owner), true);
  });

  it("an empty allowlist no longer means 'anyone on the internet'", () => {
    assert.equal(isAgentMailSenderAllowed("stranger@evil.com", [], owner), false);
    assert.equal(isAgentMailSenderAllowed("stranger@evil.com", undefined, []), false);
  });

  it("exact address match only — no domain or substring tricks", () => {
    assert.equal(isAgentMailSenderAllowed("boss@acme.com.evil.com", ["boss@acme.com"], []), false);
    assert.equal(isAgentMailSenderAllowed("xboss@acme.com", ["boss@acme.com"], []), false);
    assert.equal(isAgentMailSenderAllowed("not-an-email", ["not-an-email"], []), false);
  });
});
