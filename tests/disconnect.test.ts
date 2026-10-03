// =============================================================================
// Disconnect — every connection can be removed from 🔌 Connections, and
// removing it deletes its stored password / token / key (not just "off").
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { withoutConnection, isConnectionId, DISCONNECTABLE } from "../src/setup/quickSetup.js";

// Example values only — not real secrets.
const cfg = {
  agent: { email: "sam@example.com", provider: "ollama", model: "qwen2.5:3b" },
  channels: {
    email:    { enabled: true, provider: "gmail", config: { gmailUser: "sam@example.com", gmailPass: "EXAMPLE-NOT-A-PASSWORD" } },
    telegram: { enabled: true, provider: "default", config: { telegramToken: "EXAMPLE-NOT-A-TOKEN" } },
    whatsapp: { enabled: true, provider: "web", config: { mode: "assistant", ownerNumber: "+6580000002", allowedSenders: ["+6580000003"] } },
  },
  tools: {
    smtp:        { host: "smtp.example.com", user: "sam@example.com", pass: "EXAMPLE-NOT-A-PASSWORD" },
    calendar:    { enabled: true, config: { googleSaKey: "EXAMPLE-KEY-JSON" } },
    spreadsheet: { enabled: true, config: { googleSaKey: "EXAMPLE-KEY-JSON" } },
    voice:       { enabled: true, provider: "groq", config: {} },
  },
  credentials: { groqApiKey: "EXAMPLE-NOT-A-KEY", openrouterApiKey: "EXAMPLE-NOT-A-KEY-2", gmailPass: "EXAMPLE" },
};

describe("disconnect removes the connection and its secret", () => {
  it("email: off, password gone everywhere, the AI key untouched", () => {
    const c = withoutConnection(cfg, "email");
    assert.equal(c.channels.email.enabled, false);
    assert.deepEqual(c.channels.email.config, {});
    assert.equal(c.tools.smtp, undefined);
    assert.equal(c.credentials.gmailPass, undefined);
    assert.equal(c.credentials.openrouterApiKey, "EXAMPLE-NOT-A-KEY-2");
    assert.doesNotMatch(JSON.stringify(c), /EXAMPLE-NOT-A-PASSWORD/);
  });

  it("telegram: off and token gone", () => {
    const c = withoutConnection(cfg, "telegram");
    assert.equal(c.channels.telegram.enabled, false);
    assert.doesNotMatch(JSON.stringify(c), /EXAMPLE-NOT-A-TOKEN/);
  });

  it("whatsapp: off, keeps mode / owner / allow-list for a quick reconnect", () => {
    const c = withoutConnection(cfg, "whatsapp");
    assert.equal(c.channels.whatsapp.enabled, false);
    assert.equal(c.channels.whatsapp.config.mode, "assistant");
    assert.deepEqual(c.channels.whatsapp.config.allowedSenders, ["+6580000003"]);
  });

  it("calendar and spreadsheets are separate — disconnecting one keeps the other's key", () => {
    const c = withoutConnection(cfg, "calendar");
    assert.deepEqual(c.tools.calendar, { enabled: false });
    assert.equal(c.tools.spreadsheet.config.googleSaKey, "EXAMPLE-KEY-JSON");
  });

  it("voice: off, its key gone, and the 'use the AI key for voice' fallback stops", () => {
    const c = withoutConnection(cfg, "voice");
    assert.deepEqual(c.tools.voice, { enabled: false });
    assert.equal(c.credentials.groqApiKey, undefined);
    const loader = readFileSync("src/config/loader.ts", "utf8");
    assert.match(loader, /if \(!baseConfig\.whisperApiKey && saved\.tools\?\.voice\?\.enabled !== false\)/);
  });

  it("never changes the original config object, and accepts only known connections", () => {
    withoutConnection(cfg, "email");
    assert.equal(cfg.channels.email.enabled, true);
    assert.equal(isConnectionId("email"), true);
    assert.equal(isConnectionId("ai"), false, "the AI can be changed, not disconnected");
    assert.equal(isConnectionId("../config"), false);
    assert.deepEqual([...DISCONNECTABLE].sort(), ["calendar", "email", "folders", "spreadsheet", "telegram", "voice", "whatsapp"]);
  });
});

describe("the dashboard offers Disconnect for everything connected", () => {
  const app    = readFileSync("src/dashboard/public/app.js", "utf8");
  const routes = readFileSync("src/dashboard/api/quick-setup.ts", "utf8");

  it("each connected row has Change + Disconnect (the AI: Change only), after a plain-words confirm", () => {
    assert.match(app, /onclick="disconnectConnection\(this\.dataset\.id, this\.dataset\.name\)">Disconnect<\/button>/);
    assert.match(app, /r\.id === 'ai' \? ''/);
    assert.match(app, /if \(!window\.confirm\(`Disconnect \$\{name \|\| id\}\?/);
    for (const id of ["email", "whatsapp", "telegram", "folders", "calendar", "spreadsheet", "voice"]) {
      assert.match(app, new RegExp(`\\b${id}:\\s+'`), `no confirmation text for ${id}`);
    }
  });

  it("the server unlinks WhatsApp from the phone, forgets the Telegram owner, removes folder grants, and restarts the agent", () => {
    assert.match(routes, /app\.post\("\/api\/quick-setup\/disconnect", guard,/);
    assert.match(routes, /if \(id === "whatsapp"\) await resetBaileysAuth\(\)/);
    assert.match(routes, /if \(id === "telegram"\) \{ stopTelegramListener\(\); await forgetTelegramOwner\(\); \}/);
    assert.match(routes, /if \(id === "folders"\)\s+\{ for \(const g of loadGrants\(\)\) removeGrant\(g\.path\); return; \}/);
    assert.match(routes, /deps\.restartAgent\(\)/);
  });
});
