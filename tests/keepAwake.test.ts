// =============================================================================
// Keep-awake (src/util/keepAwake.ts)
//
// Contract: while the agent runs, the OS must not idle-sleep — otherwise phone
// messages go unanswered when nobody is at the laptop. The helper must be
// bound to the agent's lifetime, report its state honestly (never "active"
// unless the OS confirmed), and read the lid-close setting without changing it.
// =============================================================================

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import {
  buildWindowsKeepAwakeScript,
  keepAwakeCommand,
  parseLidActions,
  startKeepAwake,
  stopKeepAwake,
  getKeepAwakeStatus,
  getPowerAdvice,
  __resetKeepAwakeForTests,
} from "../src/util/keepAwake.js";

/** Minimal ChildProcess stand-in: emits stdout data / exit / error on demand. */
function fakeChild() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; child.emit("exit", null); return true; };
  return child;
}

// Real output captured from `powercfg /qh SCHEME_CURRENT <SUB_BUTTONS> <LIDACTION>`
// on an Acer laptop (lid → Sleep on both AC and battery).
const REAL_POWERCFG = `Power Scheme GUID: ae0929d8-0c25-4d05-bbe8-2d3785472ab9  (Acer)
  Subgroup GUID: 4f971e89-eebd-4455-a8de-9e59040e7347  (Power buttons and lid)
    Power Setting GUID: 5ca83367-6e45-459f-a27b-476b1d01c936  (Lid close action)
      Possible Setting Index: 000
      Possible Setting Friendly Name: Do nothing
      Possible Setting Index: 001
      Possible Setting Friendly Name: Sleep
      Possible Setting Index: 002
      Possible Setting Friendly Name: Hibernate
      Possible Setting Index: 003
      Possible Setting Friendly Name: Shut down
    Current AC Power Setting Index: 0x00000001
    Current DC Power Setting Index: 0x00000001
`;

beforeEach(() => __resetKeepAwakeForTests());

describe("keepAwake — command construction", () => {
  it("Windows script requests ES_CONTINUOUS|ES_SYSTEM_REQUIRED and watches the parent pid", () => {
    const s = buildWindowsKeepAwakeScript(4242);
    assert.ok(s.includes("SetThreadExecutionState([uint32]2147483649)"), "flags must be 0x80000001");
    assert.ok(s.includes("Get-Process -Id 4242"), "must exit when the agent process is gone");
    assert.ok(!s.includes("2147483651"), "must NOT force the display on (ES_DISPLAY_REQUIRED)");
  });

  it("Windows uses -EncodedCommand so embedded quotes survive", () => {
    const c = keepAwakeCommand("win32", 1)!;
    assert.equal(c.cmd, "powershell.exe");
    const enc = c.args[c.args.indexOf("-EncodedCommand") + 1];
    assert.equal(Buffer.from(enc, "base64").toString("utf16le"), buildWindowsKeepAwakeScript(1));
    assert.equal(c.readyMarker, "KEEPAWAKE_OK");
  });

  it("macOS binds caffeinate to the agent pid", () => {
    assert.deepEqual(keepAwakeCommand("darwin", 77)!.args, ["-i", "-w", "77"]);
  });

  it("unsupported platforms return null", () => {
    assert.equal(keepAwakeCommand("aix", 1), null);
  });
});

describe("keepAwake — lifecycle reports state honestly", () => {
  it("becomes active only after the OS confirms", async () => {
    const child = fakeChild();
    const p = startKeepAwake({ platform: "win32", spawnFn: () => child, readyTimeoutMs: 1000 });
    assert.equal(getKeepAwakeStatus().state, "starting");
    child.stdout.emit("data", Buffer.from("KEEPAWAKE_OK\r\n"));
    const s = await p;
    assert.equal(s.state, "active");
    assert.ok(s.since);
  });

  it("reports failed when Windows refuses the request", async () => {
    const child = fakeChild();
    const p = startKeepAwake({ platform: "win32", spawnFn: () => child, readyTimeoutMs: 1000 });
    child.stdout.emit("data", Buffer.from("KEEPAWAKE_FAILED\r\n"));
    assert.equal((await p).state, "failed");
  });

  it("reports failed when the helper exits before confirming", async () => {
    const child = fakeChild();
    const p = startKeepAwake({ platform: "win32", spawnFn: () => child, readyTimeoutMs: 1000 });
    child.emit("exit", 1);
    const s = await p;
    assert.equal(s.state, "failed");
    assert.match(s.detail!, /exited early/);
  });

  it("reports unsupported when the helper binary is missing (ENOENT)", async () => {
    const child = fakeChild();
    const p = startKeepAwake({ platform: "linux", spawnFn: () => child });
    child.emit("error", Object.assign(new Error("spawn systemd-inhibit ENOENT"), { code: "ENOENT" }));
    assert.equal((await p).state, "unsupported");
  });

  it("times out to failed rather than hanging", async () => {
    const child = fakeChild();
    const s = await startKeepAwake({ platform: "win32", spawnFn: () => child, readyTimeoutMs: 20 });
    assert.equal(s.state, "failed");
    assert.match(s.detail!, /Timed out/);
  });

  it("a later crash flips active → failed (no stale 'active')", async () => {
    const child = fakeChild();
    const p = startKeepAwake({ platform: "win32", spawnFn: () => child, readyTimeoutMs: 1000 });
    child.stdout.emit("data", Buffer.from("KEEPAWAKE_OK"));
    await p;
    child.emit("exit", 1);
    assert.equal(getKeepAwakeStatus().state, "failed");
  });

  it("is idempotent while running and stop() kills the helper", async () => {
    let spawns = 0;
    const child = fakeChild();
    const spawnFn = () => { spawns++; return child; };
    const p = startKeepAwake({ platform: "win32", spawnFn, readyTimeoutMs: 1000 });
    child.stdout.emit("data", Buffer.from("KEEPAWAKE_OK"));
    await p;
    await startKeepAwake({ platform: "win32", spawnFn });
    assert.equal(spawns, 1, "second start must not spawn a second helper");
    stopKeepAwake();
    assert.equal(child.killed, true);
    assert.equal(getKeepAwakeStatus().state, "off");
  });

  it("unsupported platform resolves immediately without spawning", async () => {
    let spawned = false;
    const s = await startKeepAwake({ platform: "aix", spawnFn: () => { spawned = true; return fakeChild(); } });
    assert.equal(s.state, "unsupported");
    assert.equal(spawned, false);
  });
});

describe("keepAwake — lid-close advice (read-only)", () => {
  it("parses real powercfg output (AC=Sleep, DC=Sleep)", () => {
    assert.deepEqual(parseLidActions(REAL_POWERCFG), { ac: 1, dc: 1 });
  });

  it("relies only on trailing hex values, so localized labels don't matter", () => {
    const localized = "电源方案 GUID: x\n 当前交流电源设置索引: 0x00000000\n 当前直流电源设置索引: 0x00000001\n";
    assert.deepEqual(parseLidActions(localized), { ac: 0, dc: 1 });
  });

  it("returns null for unparseable or out-of-range output", () => {
    assert.equal(parseLidActions("Invalid Parameters -- try \"/?\" for help"), null);
    assert.equal(parseLidActions("0x00000009\n0x00000001"), null);
  });

  it("warns on a laptop whose lid sleeps on mains power", async () => {
    const execFn = async (cmd: string) => cmd === "powercfg.exe" ? REAL_POWERCFG : "1\r\n";
    const a = await getPowerAdvice({ platform: "win32", execFn, noCache: true });
    assert.equal(a.hasBattery, true);
    assert.equal(a.lidWillSleep, true);
  });

  it("does not warn when the lid is set to Do nothing on mains power", async () => {
    const out = REAL_POWERCFG.replace("Current AC Power Setting Index: 0x00000001", "Current AC Power Setting Index: 0x00000000");
    const execFn = async (cmd: string) => cmd === "powercfg.exe" ? out : "1";
    assert.equal((await getPowerAdvice({ platform: "win32", execFn, noCache: true })).lidWillSleep, false);
  });

  it("does not warn on a desktop (no battery)", async () => {
    const execFn = async (cmd: string) => cmd === "powercfg.exe" ? REAL_POWERCFG : "0";
    assert.equal((await getPowerAdvice({ platform: "win32", execFn, noCache: true })).lidWillSleep, false);
  });

  it("degrades to unknown (no warning) when powercfg fails", async () => {
    const execFn = async () => { throw new Error("denied"); };
    const a = await getPowerAdvice({ platform: "win32", execFn, noCache: true });
    assert.equal(a.lid, null);
    assert.equal(a.lidWillSleep, false);
  });
});
