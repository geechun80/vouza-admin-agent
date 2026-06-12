// =============================================================================
// Tests — send_whatsapp_message routes through baileysManager (Phase 3)
//
// The legacy in-process baileysListener.ts was deleted; the agent's send tool
// must use the SAME manager/worker socket that receives incoming messages.
// These tests verify:
//   1. The default bridge IS the manager's exports (no second implementation).
//   2. provider="web" sends go through the bridge with a normalized chatId.
//   3. Not-connected state returns the scan-QR error without attempting send.
// =============================================================================

import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  sendWhatsAppMessageTool,
  _setBaileysBridgeForTests,
  _getBaileysBridgeForTests,
} from "../src/tools/whatsapp.js";
import {
  sendBaileysMessage,
  isBaileysConnected,
} from "../src/whatsapp/baileysManager.js";

function ctxWithWebProvider(): any {
  return {
    config: {
      tools: {
        whatsapp: { provider: "web", config: {} },
      },
    },
  };
}

describe("send_whatsapp_message — manager routing", () => {
  afterEach(() => {
    _setBaileysBridgeForTests(null); // restore real bridge
  });

  it("default bridge is wired to baileysManager exports", () => {
    const bridge = _getBaileysBridgeForTests();
    assert.equal(bridge.send, sendBaileysMessage,
      "send must be baileysManager.sendBaileysMessage (the worker IPC path)");
    assert.equal(bridge.isConnected, isBaileysConnected,
      "isConnected must be baileysManager.isBaileysConnected");
  });

  it("provider 'web' + connected → sends via the bridge with @c.us chatId", async () => {
    const sent: { chatId: string; text: string }[] = [];
    _setBaileysBridgeForTests({
      isConnected: () => true,
      send: async (chatId, text) => { sent.push({ chatId, text }); },
    });

    const result: any = await sendWhatsAppMessageTool.call(
      { to: "+65 1234 5678", message: "hello from the agent" } as any,
      ctxWithWebProvider(),
    );

    assert.equal(result.success, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.chatId, "6512345678@c.us");
    assert.equal(sent[0]!.text, "hello from the agent");
    assert.equal(result.data.chatId, "6512345678@c.us");
  });

  it("provider 'web' + NOT connected → scan-QR error, no send attempted", async () => {
    let sendCalls = 0;
    _setBaileysBridgeForTests({
      isConnected: () => false,
      send: async () => { sendCalls++; },
    });

    const result: any = await sendWhatsAppMessageTool.call(
      { to: "+6512345678", message: "hi" } as any,
      ctxWithWebProvider(),
    );

    assert.equal(result.success, false);
    assert.match(String(result.error), /not connected/i);
    assert.match(String(result.error), /QR/i);
    assert.equal(sendCalls, 0);
  });

  it("bridge send failure surfaces as a tool error (contract: {success:false, error})", async () => {
    _setBaileysBridgeForTests({
      isConnected: () => true,
      send: async () => { throw new Error("worker IPC channel closed"); },
    });

    const result: any = await sendWhatsAppMessageTool.call(
      { to: "+6512345678", message: "hi" } as any,
      ctxWithWebProvider(),
    );

    assert.equal(result.success, false);
    assert.match(String(result.error), /worker IPC channel closed/);
  });
});
