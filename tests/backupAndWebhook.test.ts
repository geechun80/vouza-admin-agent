// =============================================================================
// Locked backups + WAHA webhook key (2.3.0 security pass)
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  lockBackup,
  unlockBackup,
  isLockedBackup,
  backupPasswordProblem,
  BackupPasswordError,
  LOCKED_BACKUP_FORMAT,
} from "../src/security/backupCrypto.js";

const bundle = {
  format: "vouza-admin-agent-backup",
  version: 1,
  config: { credentials: { openrouterApiKey: "EXAMPLE-NOT-A-KEY-backup-test" } },
  memories: [{ type: "preference", title: "t", content: "c" }],
};

describe("locked backups", () => {
  it("round-trips with the right password and hides the keys in the file", async () => {
    const locked = await lockBackup(bundle, "correct horse battery");
    assert.equal(locked.format, LOCKED_BACKUP_FORMAT);
    assert.ok(isLockedBackup(locked));
    const text = JSON.stringify(locked);
    assert.doesNotMatch(text, /EXAMPLE-NOT-A-KEY|preference|openrouterApiKey/);
    assert.deepEqual(await unlockBackup(locked, "correct horse battery"), bundle);
  });

  it("a wrong password or a changed byte is refused", async () => {
    const locked = await lockBackup(bundle, "correct horse battery");
    await assert.rejects(unlockBackup(locked, "wrong password!"), BackupPasswordError);
    const data = Buffer.from(locked.data, "base64");
    data[0] ^= 1;
    await assert.rejects(unlockBackup({ ...locked, data: data.toString("base64") }, "correct horse battery"), BackupPasswordError);
  });

  it("every backup gets its own salt and nonce", async () => {
    const a = await lockBackup(bundle, "same password 123");
    const b = await lockBackup(bundle, "same password 123");
    assert.notEqual(a.kdf.salt, b.kdf.salt);
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.data, b.data);
  });

  it("refuses short passwords and crafted cost settings", async () => {
    assert.match(backupPasswordProblem("short") ?? "", /at least 8/);
    assert.equal(backupPasswordProblem("long enough"), null);
    await assert.rejects(lockBackup(bundle, "short"), BackupPasswordError);
    const locked = await lockBackup(bundle, "correct horse battery");
    await assert.rejects(
      unlockBackup({ ...locked, kdf: { ...locked.kdf, N: 2 ** 24 } }, "correct horse battery"),
      /damaged/,
    );
  });

  it("the dashboard only hands out locked backups", () => {
    const server = readFileSync("src/dashboard/api/server.ts", "utf8");
    assert.match(server, /app\.post\("\/api\/export-config", requireLocalOrigin,/);
    assert.match(server, /res\.send\(JSON\.stringify\(await lockBackup\(bundle, password\)/);
    assert.match(server, /app\.get\("\/api\/export-config"[\s\S]{0,200}res\.status\(410\)/);
    const app = readFileSync("src/dashboard/public/app.js", "utf8");
    assert.match(app, /fetch\('\/api\/export-config', \{\s*method:\s*'POST'/);
  });
});

describe("WAHA webhook", () => {
  const server = readFileSync("src/dashboard/api/server.ts", "utf8");
  const handler = server.slice(server.indexOf('app.post("/api/whatsapp/webhook"'), server.indexOf("// --- WhatsApp Baileys"));

  it("is refused unless WAHA is the running WhatsApp provider", () => {
    assert.match(handler, /if \(!agentInstance \|\| wa\?\.provider !== "waha"\)[\s\S]{0,80}status\(404\)/);
  });

  it("requires an API key — a missing key is refused, not skipped", () => {
    assert.match(handler, /if \(!expectedKey\) \{[\s\S]{0,300}status\(403\)/);
    assert.match(handler, /timingSafeEqual\(providedKey, expectedKey\)/);
    // the check happens before the event is handed to the agent
    assert.ok(handler.indexOf("timingSafeEqual") < handler.indexOf("handleWAHAEvent("));
  });

  it("setup asks for the key and Docker keeps WAHA on this computer", () => {
    const setup = readFileSync("src/tools/setup.ts", "utf8");
    assert.match(setup, /label: "WAHA API Key \(required\)"/);
    assert.match(setup, /wahaKey is required/);
    const compose = readFileSync("docker-compose.yml", "utf8");
    assert.match(compose, /"127\.0\.0\.1:3000:3000"/);
    assert.match(compose, /WAHA_API_KEY: "\$\{WAHA_API_KEY:-\}"/);
  });
});
