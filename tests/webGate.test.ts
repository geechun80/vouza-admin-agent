// =============================================================================
// Web gate (src/agent/webGate.ts) — the agent goes online only when asked
//
// Contract: web_search / browser_navigate run only when the person's own
// words this turn asked to go online. Otherwise nothing is searched or
// opened: the exact query/URL is parked and the person is asked YES/NO —
// enforced in code by the listener, never by the model.
// =============================================================================

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolRegistry, buildTool } from "../src/tools/registry.js";
import {
  userAskedToGoOnline,
  gateWebTools,
  describeWebAction,
  startTurn,
  WEB_TOOL_NAMES,
} from "../src/agent/webGate.js";
import {
  resolvePendingReply,
  pendingCreatedSince,
  confirmPromptFor,
  ONLINE_CONFIRM_PROMPT,
  __clearPendingForTests,
} from "../src/agent/phoneMode.js";
import type { AgentContext, PhoneChannel } from "../src/types/index.js";

const WA: PhoneChannel = { kind: "whatsapp", chatId: "6591234567@s.whatsapp.net" };

function ctx(channel?: PhoneChannel): AgentContext {
  return {
    sessionId: "t", turnCount: 0, messages: [], memory: {} as any,
    config: { tools: {} } as any, tools: new Map(), taskQueue: [], channel,
  };
}

function registry() {
  const calls: Array<{ name: string; input: any }> = [];
  const reg = new ToolRegistry();
  for (const name of ["web_search", "browser_navigate", "read_emails"]) {
    reg.register(buildTool({
      name, description: name, category: "web", inputSchema: z.any(),
      call: async (input: any) => { calls.push({ name, input }); return { success: true, data: "ran" }; },
    }) as any);
  }
  gateWebTools(reg);
  return { reg, calls };
}

beforeEach(() => __clearPendingForTests());

describe("userAskedToGoOnline — only the person's explicit words count", () => {
  for (const yes of [
    "search online for SG public holidays 2027",
    "can you google the opening hours",
    "what's the weather tomorrow",
    "latest news about CPF",
    "look it up on the internet",
    "open https://www.gov.sg",
    "check www.ica.gov.sg for me",
    "帮我上网查一下",
    "今天的新闻",
    "cari di internet harga emas",
  ]) it(`yes: ${yes}`, () => assert.equal(userAskedToGoOnline(yes), true));

  for (const no of [
    "search my email for the invoice from Acme",
    "find the contract PDF in my documents",
    "what's on my Google Calendar tomorrow",
    "share the file from Google Drive",
    "reply to Sarah",
    "",
  ]) it(`no: ${no || "(empty)"}`, () => assert.equal(userAskedToGoOnline(no), false));
});

describe("web tools — gated", () => {
  it("covers searching, opening, clicking and submitting forms", () => {
    assert.deepEqual([...WEB_TOOL_NAMES].sort(), ["browser_click", "browser_fill", "browser_navigate", "web_search"]);
  });

  it("runs directly when the person asked to go online this turn", async () => {
    const { reg, calls } = registry();
    const c = ctx(WA);
    startTurn(c, "search online for the MOM foreign worker levy");
    const r = await reg.get("web_search")!.call({ query: "MOM levy" }, c);
    assert.equal(r.data, "ran");
    assert.equal(calls.length, 1);
  });

  it("does NOT go online otherwise — parks the exact query and asks", async () => {
    const { reg, calls } = registry();
    const c = ctx(WA);
    const t0 = Date.now();
    startTurn(c, "summarise my unread email");
    const r = await reg.get("web_search")!.call({ query: "Jane Tan 91234567 salary" }, c);
    assert.equal(calls.length, 0, "nothing may be searched");
    assert.equal((r.data as any).status, "AWAITING_USER_PERMISSION");
    const parked = pendingCreatedSince(WA, t0)!;
    assert.equal(parked.kind, "online");
    assert.match(parked.summary, /Search the web for: "Jane Tan 91234567 salary"/);
    assert.equal(confirmPromptFor(parked), ONLINE_CONFIRM_PROMPT);
  });

  it("YES grants web access for the next turn only; nothing runs on its own", async () => {
    const { reg, calls } = registry();
    const c = ctx(WA);
    startTurn(c, "summarise my unread email");
    await reg.get("browser_navigate")!.call({ url: "https://example.com/x?y=1" }, c);
    const res = await resolvePendingReply(WA, "yes");
    assert.deepEqual(res, { handled: false, grantOnline: true });
    assert.equal(calls.length, 0, "YES itself does not run anything");

    startTurn(c, "yes", res.grantOnline);
    await reg.get("browser_navigate")!.call({ url: "https://example.com" }, c);
    assert.equal(calls.length, 1);

    startTurn(c, "thanks, now read my email"); // the grant does not carry over
    await reg.get("web_search")!.call({ query: "x" }, c);
    assert.equal(calls.length, 1);
  });

  it("NO stays offline", async () => {
    const { reg } = registry();
    const c = ctx(WA);
    startTurn(c, "hi");
    await reg.get("web_search")!.call({ query: "x" }, c);
    const res = await resolvePendingReply(WA, "no");
    assert.equal(res.handled, true);
    assert.match(res.reply!, /stay offline/);
  });

  it("with no one to ask (API task / CLI) it refuses instead of going online", async () => {
    const { reg, calls } = registry();
    const c = ctx();
    startTurn(c, "summarise my inbox");
    const r = await reg.get("web_search")!.call({ query: "x" }, c);
    assert.equal(r.success, false);
    assert.equal(calls.length, 0);
  });

  it("other tools are untouched and gating is idempotent", async () => {
    const { reg, calls } = registry();
    const gated = reg.get("web_search");
    gateWebTools(reg);
    assert.equal(reg.get("web_search"), gated);
    const c = ctx(WA);
    startTurn(c, "hi");
    await reg.get("read_emails")!.call({}, c);
    assert.equal(calls.length, 1);
  });

  it("describes what would go online", () => {
    assert.equal(describeWebAction("browser_navigate", { url: "https://a.b/c" }), "Open the website: https://a.b/c");
  });
});

describe("web gate — wired at every entry point", () => {
  const read = (p: string) => readFile(path.resolve(process.cwd(), p), "utf-8");

  it("the main and dashboard registries are gated", async () => {
    assert.match(await read("src/bridge/launcher.ts"), /gateWebTools\(registry\)/);
    assert.match(await read("src/dashboard/api/chat.ts"), /gateWebTools\(registry\)/);
    assert.match(await read("src/template/index.ts"), /gateWebTools\(registry\)/);
  });

  it("every listener decides from the person's own words", async () => {
    for (const f of ["src/whatsapp/baileysManager.ts", "src/whatsapp/wahaListener.ts",
                     "src/telegram/listener.ts", "src/dashboard/api/chat.ts", "src/bridge/launcher.ts"]) {
      assert.match(await read(f), /startTurn\(/, f);
    }
  });

  it("the dashboard passes the typed message, not attached-file text", async () => {
    assert.match(await read("src/dashboard/api/server.ts"),
      /streamChat\(sessionId, messagePayload, config, apiKey, wizardStep, userName, message\)/);
  });
});
