// =============================================================================
// Secrets at rest (src/security/secretStore.ts + whatsapp/encryptedAuthState.ts)
//
// Contract: keys, passwords and tokens never reach disk in plain text; old
// plain files are upgraded in place; a value that can't be unlocked becomes
// "" (asked for again) instead of crashing; the WhatsApp login files are
// encrypted and old plain ones keep working.
// =============================================================================

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { BufferJSON, initAuthCreds } from "@whiskeysockets/baileys";
import {
  sealSecrets,
  openSecrets,
  hasPlaintextSecrets,
  isSensitiveField,
  readSealedJson,
  writeSealedJson,
  migrateJsonFile,
  encryptString,
  getMasterKey,
  ENC_PREFIX,
} from "../src/security/secretStore.js";
import { useEncryptedFileAuthState } from "../src/whatsapp/encryptedAuthState.js";

const KEY = randomBytes(32);
let dir: string;
before(() => { dir = mkdtempSync(join(tmpdir(), "secret-store-")); });
after(() => rmSync(dir, { recursive: true, force: true }));

const SAMPLE = {
  agent: { name: "Vee", model: "gpt-4o", phone: "+6591234567" },
  credentials: { openrouterApiKey: "sk-or-v1-not-a-real-key-000", gmailPass: "fake fake fake fake" },
  channels: { telegram: { enabled: true, config: { telegramToken: "123456:ABCDEF" } } },
  tools: { calendar: { config: { googleSaKey: { type: "service_account", private_key: "-----BEGIN…" } } } },
};

describe("which fields are secrets", () => {
  it("keys, tokens, passwords, credentials", () => {
    for (const k of ["apiKey", "openrouterApiKey", "telegramToken", "gmailPass", "appPassword", "refreshToken",
                     "googleSaKey", "googleCredentialsJson", "clientSecret", "private_key"]) {
      assert.equal(isSensitiveField(k), true, k);
    }
    for (const k of ["model", "provider", "phone", "email", "enabled", "allowedSenders", "openrouterTiers"]) {
      assert.equal(isSensitiveField(k), false, k);
    }
  });
});

describe("sealing and opening", () => {
  it("encrypts every secret, leaves everything else readable", () => {
    const sealed: any = sealSecrets(SAMPLE, KEY);
    assert.ok(sealed.credentials.openrouterApiKey.startsWith(ENC_PREFIX));
    assert.ok(sealed.credentials.gmailPass.startsWith(ENC_PREFIX));
    assert.ok(sealed.channels.telegram.config.telegramToken.startsWith(ENC_PREFIX));
    assert.ok(sealed.tools.calendar.config.googleSaKey.private_key.startsWith(ENC_PREFIX), "inside a secret object");
    assert.ok(sealed.tools.calendar.config.googleSaKey.type.startsWith(ENC_PREFIX), "everything under a secret field");
    assert.equal(sealed.agent.model, "gpt-4o");
    assert.equal(sealed.agent.phone, "+6591234567");
    assert.doesNotMatch(JSON.stringify(sealed), /sk-or-v1|fake fake|123456:ABCDEF|BEGIN/);
    assert.equal(hasPlaintextSecrets(sealed), false);
    assert.equal(hasPlaintextSecrets(SAMPLE), true);
  });

  it("round-trips exactly, and sealing twice doesn't double-encrypt", () => {
    const twice = sealSecrets(sealSecrets(SAMPLE, KEY), KEY);
    const { value, failed } = openSecrets(twice, KEY);
    assert.deepEqual(value, SAMPLE);
    assert.equal(failed, 0);
  });

  it("each encryption is different (random IV)", () => {
    assert.notEqual(encryptString("same", KEY), encryptString("same", KEY));
  });

  it("a value from another computer/user becomes empty instead of crashing", () => {
    const other = sealSecrets(SAMPLE, randomBytes(32));
    const { value, failed } = openSecrets(other, KEY) as any;
    assert.equal(value.credentials.openrouterApiKey, "");
    assert.equal(value.agent.model, "gpt-4o");
    assert.equal(failed, 5);
  });

  it("tampering is detected (authenticated encryption)", () => {
    const s = encryptString("secret", KEY);
    const raw = Buffer.from(s.slice(ENC_PREFIX.length), "base64");
    raw[raw.length - 1] ^= 0xff; // flip a ciphertext byte
    const bad = ENC_PREFIX + raw.toString("base64");
    assert.equal((openSecrets({ apiKey: bad }, KEY).value as any).apiKey, "");
  });
});

describe("files", () => {
  it("writeSealedJson never puts a secret on disk; readSealedJson gives it back", async () => {
    const f = join(dir, "config.json");
    await writeSealedJson(f, SAMPLE);
    const onDisk = readFileSync(f, "utf-8");
    assert.doesNotMatch(onDisk, /sk-or-v1|fake fake|123456:ABCDEF|BEGIN/);
    assert.match(onDisk, /"model": "gpt-4o"/);
    assert.deepEqual(await readSealedJson(f, null), SAMPLE);
    assert.equal(readdirSync(dir).filter((n) => n.endsWith(".tmp")).length, 0, "atomic write leaves no temp file");
  });

  it("upgrades an old plain-text config in place, once", async () => {
    const f = join(dir, "old-config.json");
    writeFileSync(f, JSON.stringify(SAMPLE, null, 2));
    assert.equal(await migrateJsonFile(f), true);
    assert.doesNotMatch(readFileSync(f, "utf-8"), /sk-or-v1/);
    assert.equal(await migrateJsonFile(f), false, "already encrypted");
    assert.deepEqual(await readSealedJson(f, null), SAMPLE);
  });

  it("missing file → fallback", async () => {
    assert.deepEqual(await readSealedJson(join(dir, "nope.json"), { a: 1 }), { a: 1 });
  });

  it("tests use the throwaway key from tests/setup-env.mjs (never the OS key store)", async () => {
    assert.equal((await getMasterKey()).toString("hex"), process.env.VOUZA_SECRET_KEY);
  });
});

describe("WhatsApp login files", () => {
  it("are written encrypted and read back", async () => {
    const folder = join(dir, "wa-auth");
    const a = await useEncryptedFileAuthState(folder, KEY);
    await a.saveCreds();
    await a.state.keys.set({ "pre-key": { "1": { public: Buffer.from([1, 2, 3]), private: Buffer.from([4, 5, 6]) } } } as any);
    for (const name of readdirSync(folder)) {
      assert.ok(readFileSync(join(folder, name), "utf-8").startsWith(ENC_PREFIX), `${name} is encrypted`);
    }
    const b = await useEncryptedFileAuthState(folder, KEY);
    assert.deepEqual(JSON.stringify(b.state.creds, BufferJSON.replacer), JSON.stringify(a.state.creds, BufferJSON.replacer));
    const keys = await b.state.keys.get("pre-key", ["1"]);
    assert.deepEqual([...(keys["1"] as any).private], [4, 5, 6]);
  });

  it("an existing plain-text pairing keeps working and gets encrypted", async () => {
    const folder = join(dir, "wa-legacy");
    const creds = initAuthCreds();
    const { mkdirSync } = await import("node:fs");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "creds.json"), JSON.stringify(creds, BufferJSON.replacer));
    const s = await useEncryptedFileAuthState(folder, KEY);
    assert.equal(s.state.creds.registrationId, creds.registrationId);
    assert.ok(readFileSync(join(folder, "creds.json"), "utf-8").startsWith(ENC_PREFIX));
  });

  it("deleting a key removes its file", async () => {
    const folder = join(dir, "wa-del");
    const s = await useEncryptedFileAuthState(folder, KEY);
    await s.state.keys.set({ session: { "x:1": { a: 1 } } } as any);
    assert.equal(readdirSync(folder).some((n) => n.startsWith("session-x-1")), true);
    await s.state.keys.set({ session: { "x:1": null } } as any);
    assert.equal(readdirSync(folder).some((n) => n.startsWith("session-x-1")), false);
  });
});
