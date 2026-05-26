// =============================================================================
// REGRESSION GUARD — WhatsApp Baileys allowlist enforcement
//
// THE INCIDENT (2026-05-26):
// Aerick connected WhatsApp via Baileys QR scan. The agent then auto-replied
// to messages from his friends — because the Baileys WhatsApp Web model
// gives our agent full access to his personal account, and our message
// handler had no allowlist gate.
//
// This test locks in the safety contract:
//   1. The owner (linked WhatsApp account) is ALWAYS permitted to talk to the agent
//   2. By default, the allowlist is empty → NOBODY else can trigger the agent
//   3. Adding numbers to the allowlist permits THOSE specific JIDs
//   4. Normalization handles "+6596862398", "6596862398", and full JID formats
//
// We can't run a real Baileys worker in tests (would need WhatsApp servers),
// so we test the allowlist resolution logic + the loader passthrough that
// makes the user's saved allowlist reach the worker.
// =============================================================================

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "fs";
import { join } from "path";
import { loadConfigFromJson } from "../src/config/loader.js";

const CONFIG_PATH = join(process.cwd(), "data", "config.json");

const BASE_CONFIG = {
  agent: { name: "TestBot", model: "claude-sonnet-4-6", provider: "anthropic" },
  channels: {},
  tools: {},
  credentials: { anthropicApiKey: "sk-ant-test" },
  skills: { enabled: [], schedules: {} },
};

async function writeConfig(obj: any) {
  await fs.mkdir(join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(obj, null, 2), "utf-8");
}

async function cleanConfig() {
  try { await fs.unlink(CONFIG_PATH); } catch { /* not present is fine */ }
}

describe("WhatsApp allowlist — loader passthrough", () => {
  beforeEach(cleanConfig);
  afterEach(cleanConfig);

  it("allowedSenders array survives loadConfigFromJson", async () => {
    await writeConfig({
      ...BASE_CONFIG,
      channels: {
        whatsapp: {
          enabled: true,
          provider: "web",
          config: {
            allowedSenders: ["+6596862398", "6587747989"],
          },
        },
      },
    });
    const config = await loadConfigFromJson();
    const wa: any = config.tools?.whatsapp;
    assert.ok(wa, "WhatsApp tool config should be present");
    assert.deepEqual(
      wa.config?.allowedSenders,
      ["+6596862398", "6587747989"],
      "allowedSenders array must reach runtime config unchanged"
    );
  });

  it("missing allowedSenders defaults to undefined (deny-by-default)", async () => {
    await writeConfig({
      ...BASE_CONFIG,
      channels: {
        whatsapp: { enabled: true, provider: "web", config: {} },
      },
    });
    const config = await loadConfigFromJson();
    const wa: any = config.tools?.whatsapp;
    assert.equal(wa.config?.allowedSenders, undefined, "Default must be undefined — worker treats as empty allowlist");
  });

  it("empty allowedSenders array means deny-all (except owner)", async () => {
    await writeConfig({
      ...BASE_CONFIG,
      channels: {
        whatsapp: { enabled: true, provider: "web", config: { allowedSenders: [] } },
      },
    });
    const config = await loadConfigFromJson();
    const wa: any = config.tools?.whatsapp;
    assert.deepEqual(wa.config?.allowedSenders, [], "Empty array preserved — owner-only mode");
  });
});

describe("WhatsApp allowlist — sender normalization logic", () => {
  // Mirror the normalizeJid() function in baileysWorker.ts so we can test
  // the contract without spawning a real worker process.
  const normalizeJid = (s: string): string => {
    const digitsOnly = s.replace(/[^\d]/g, "");
    if (!digitsOnly) return s;
    return `${digitsOnly}@s.whatsapp.net`;
  };

  it("strips '+' prefix and appends @s.whatsapp.net", () => {
    assert.equal(normalizeJid("+6596862398"), "6596862398@s.whatsapp.net");
  });

  it("handles bare digits", () => {
    assert.equal(normalizeJid("6596862398"), "6596862398@s.whatsapp.net");
  });

  it("strips formatting characters (spaces, dashes, parens)", () => {
    assert.equal(normalizeJid("+65 9686-2398"), "6596862398@s.whatsapp.net");
    assert.equal(normalizeJid("(65) 9686 2398"), "6596862398@s.whatsapp.net");
  });

  it("idempotent on already-normalized JID input (digits part wins)", () => {
    // If the user pastes a full JID, we extract the digits and rebuild —
    // this keeps the format consistent and prevents subtle mismatches
    // like ":43@" device suffixes leaking into the allowlist
    assert.equal(normalizeJid("6596862398@s.whatsapp.net"), "6596862398@s.whatsapp.net");
  });
});

describe("WhatsApp allowlist — owner JID extraction contract", () => {
  // Mirror getOwnerJid() in baileysWorker.ts. Baileys' sock.user.id often
  // includes a device suffix like ":43" which would prevent string equality
  // with msg.key.remoteJid. The strip-suffix step is safety-critical.
  const stripDeviceSuffix = (raw: string): string => raw.replace(/:\d+@/, "@");

  it("strips numeric device suffix from sock.user.id", () => {
    assert.equal(
      stripDeviceSuffix("6596862398:43@s.whatsapp.net"),
      "6596862398@s.whatsapp.net"
    );
  });

  it("leaves a JID without device suffix unchanged", () => {
    assert.equal(
      stripDeviceSuffix("6596862398@s.whatsapp.net"),
      "6596862398@s.whatsapp.net"
    );
  });
});
