// =============================================================================
// Keep-awake — stop the OS idle-sleeping while the agent runs
//
// The agent lives on the user's laptop, but people message it from their
// phone while they are away. A laptop on default power settings idle-sleeps
// after a few minutes, and then nothing answers. This module asks the OS to
// stay awake for as long as the agent process is alive:
//
//   win32  — a hidden PowerShell child calls SetThreadExecutionState(
//            ES_CONTINUOUS | ES_SYSTEM_REQUIRED) and holds the request while
//            it lives. It polls the parent PID and exits on its own if the
//            agent crashes, so the request can never outlive the agent.
//   darwin — `caffeinate -i -w <pid>` (same parent-bound semantics, built in)
//   linux  — `systemd-inhibit --what=idle:sleep … sleep infinity` when present
//
// What this deliberately does NOT do: it never changes power settings. Idle
// sleep is prevented, but closing the lid still follows the user's lid-close
// setting — no program can override that. getPowerAdvice() reads the lid
// setting (read-only) so the dashboard can tell the user when closing the lid
// will put the agent to sleep, and point them at the setting to change.
// The display is still allowed to turn off (no ES_DISPLAY_REQUIRED).
// =============================================================================

import { spawn, execFile, type ChildProcess } from "child_process";

export type KeepAwakeState = "off" | "starting" | "active" | "unsupported" | "failed";

export interface KeepAwakeStatus {
  state:    KeepAwakeState;
  platform: NodeJS.Platform;
  /** Human-readable reason for unsupported / failed */
  detail?:  string;
  since?:   number;
}

/** Windows lid-close actions, as stored in the power scheme. */
export type LidAction = 0 | 1 | 2 | 3;
export const LID_ACTION_LABELS: Record<LidAction, string> = {
  0: "Do nothing",
  1: "Sleep",
  2: "Hibernate",
  3: "Shut down",
};

export interface PowerAdvice {
  platform:  NodeJS.Platform;
  keepAwake: KeepAwakeStatus;
  /** Lid-close action while plugged in (ac) and on battery (dc); null when unknown */
  lid:       { ac: LidAction; dc: LidAction } | null;
  /** true = this machine has a battery (laptop); null = unknown */
  hasBattery: boolean | null;
  /** true when closing the lid on mains power would stop the agent answering */
  lidWillSleep: boolean;
}

// ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x00000001)
const ES_FLAGS = 2147483649;
const READY_MARKER  = "KEEPAWAKE_OK";
const FAILED_MARKER = "KEEPAWAKE_FAILED";

// Power-scheme GUIDs are locale-independent (the friendly names are not).
const SUB_BUTTONS = "4f971e89-eebd-4455-a8de-9e59040e7347";
const LIDACTION   = "5ca83367-6e45-459f-a27b-476b1d01c936";

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * PowerShell that holds an awake request until the parent process dies.
 * SetThreadExecutionState returns the previous state on success and 0 on
 * failure; a fresh thread reports ES_CONTINUOUS (0x80000000), never 0.
 */
export function buildWindowsKeepAwakeScript(parentPid: number): string {
  return [
    `$sig = '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'`,
    `$k = Add-Type -MemberDefinition $sig -Name KeepAwake -Namespace VouzaAgent -PassThru`,
    `$prev = $k::SetThreadExecutionState([uint32]${ES_FLAGS})`,
    `if ($prev -eq 0) { Write-Output '${FAILED_MARKER}'; exit 2 }`,
    `Write-Output '${READY_MARKER}'`,
    `while ($true) {`,
    `  Start-Sleep -Seconds 30`,
    `  if (-not (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue)) { exit 0 }`,
    `}`,
  ].join("\n");
}

/** The command that keeps this platform awake, or null when unsupported. */
export function keepAwakeCommand(
  platform:  NodeJS.Platform,
  parentPid: number,
): { cmd: string; args: string[]; readyMarker: string | null } | null {
  switch (platform) {
    case "win32": {
      // -EncodedCommand (UTF-16LE base64) sidesteps every quoting pitfall of
      // passing a multi-line script with embedded quotes through cmd parsing.
      const encoded = Buffer.from(buildWindowsKeepAwakeScript(parentPid), "utf16le").toString("base64");
      return {
        cmd:  "powershell.exe",
        args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", encoded],
        readyMarker: READY_MARKER,
      };
    }
    case "darwin":
      return { cmd: "caffeinate", args: ["-i", "-w", String(parentPid)], readyMarker: null };
    case "linux":
      return {
        cmd:  "systemd-inhibit",
        args: ["--what=idle:sleep", "--who=Admin Agent", "--why=Answering phone messages", "--mode=block", "sleep", "infinity"],
        readyMarker: null,
      };
    default:
      return null;
  }
}

/**
 * Parse `powercfg /qh SCHEME_CURRENT <SUB_BUTTONS> <LIDACTION>` output.
 * The labels are localized, so rely only on the two trailing hex values:
 * "Current AC Power Setting Index: 0x…" then "Current DC …: 0x…".
 */
export function parseLidActions(output: string): { ac: LidAction; dc: LidAction } | null {
  const hex = output.match(/0x[0-9a-fA-F]{8}/g);
  if (!hex || hex.length < 2) return null;
  const ac = parseInt(hex[hex.length - 2], 16);
  const dc = parseInt(hex[hex.length - 1], 16);
  const valid = (n: number): n is LidAction => n === 0 || n === 1 || n === 2 || n === 3;
  return valid(ac) && valid(dc) ? { ac, dc } : null;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

type SpawnFn = (cmd: string, args: string[]) => ChildProcess;
const defaultSpawn: SpawnFn = (cmd, args) =>
  spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

let _child:  ChildProcess | null = null;
let _status: KeepAwakeStatus = { state: "off", platform: process.platform };
let _exitHookInstalled = false;

export function getKeepAwakeStatus(): KeepAwakeStatus {
  return { ..._status };
}

/**
 * Start holding an awake request. Idempotent: a second call while running
 * returns the current status. Resolves once the OS confirms (or refuses).
 * On Windows, PowerShell + Add-Type compiles a C# shim on first run, and
 * antivirus scanning of that compile was measured at 10–28s on a real
 * laptop — hence the generous budget. Callers must not await this on a hot
 * path. Never throws.
 */
export function startKeepAwake(opts: {
  platform?:       NodeJS.Platform;
  parentPid?:      number;
  spawnFn?:        SpawnFn;
  readyTimeoutMs?: number;
} = {}): Promise<KeepAwakeStatus> {
  const platform  = opts.platform  ?? process.platform;
  const parentPid = opts.parentPid ?? process.pid;
  const spawnFn   = opts.spawnFn   ?? defaultSpawn;
  const readyTimeoutMs = opts.readyTimeoutMs ?? 90_000;

  if (_child && (_status.state === "active" || _status.state === "starting")) {
    return Promise.resolve(getKeepAwakeStatus());
  }

  const command = keepAwakeCommand(platform, parentPid);
  if (!command) {
    _status = { state: "unsupported", platform, detail: `Keep-awake is not available on ${platform}.` };
    return Promise.resolve(getKeepAwakeStatus());
  }

  _status = { state: "starting", platform };

  return new Promise((resolve) => {
    let settled = false;
    const settle = (s: KeepAwakeStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      _status = s;
      resolve(getKeepAwakeStatus());
    };

    let child: ChildProcess;
    try {
      child = spawnFn(command.cmd, command.args);
    } catch (err) {
      settle({ state: "unsupported", platform, detail: `Could not start ${command.cmd}: ${String(err)}` });
      return;
    }
    _child = child;

    child.on("error", (err: NodeJS.ErrnoException) => {
      _child = null;
      settle(err.code === "ENOENT"
        ? { state: "unsupported", platform, detail: `${command.cmd} is not installed on this system.` }
        : { state: "failed", platform, detail: String(err.message || err) });
    });

    child.on("exit", (code) => {
      if (_child === child) _child = null;
      if (!settled) {
        settle({ state: "failed", platform, detail: `${command.cmd} exited early (code ${code}).` });
      } else if (_status.state === "active") {
        // Was holding the request and died — report honestly, don't pretend.
        _status = { state: "failed", platform, detail: `Keep-awake helper stopped (code ${code}).` };
      }
    });

    let buf = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      if (command.readyMarker && buf.includes(command.readyMarker)) {
        settle({ state: "active", platform, since: Date.now() });
      } else if (buf.includes(FAILED_MARKER)) {
        settle({ state: "failed", platform, detail: "Windows refused the keep-awake request." });
      }
    });

    // Helpers without a ready marker (caffeinate, systemd-inhibit) are
    // "active" once they have survived a short grace period.
    const timer = setTimeout(() => {
      if (!command.readyMarker && _child === child) {
        settle({ state: "active", platform, since: Date.now() });
      } else {
        settle({ state: "failed", platform, detail: "Timed out waiting for the keep-awake helper." });
      }
    }, command.readyMarker ? readyTimeoutMs : 1_500);

    if (!_exitHookInstalled) {
      _exitHookInstalled = true;
      process.once("exit", () => { try { _child?.kill(); } catch { /* exiting */ } });
    }
  });
}

/** Release the awake request (agent stopped). Safe to call when not running. */
export function stopKeepAwake(): void {
  const child = _child;
  _child = null;
  try { child?.kill(); } catch { /* already gone */ }
  _status = { state: "off", platform: process.platform };
}

// ---------------------------------------------------------------------------
// Power advice — read-only, cached
// ---------------------------------------------------------------------------

type ExecFn = (cmd: string, args: string[]) => Promise<string>;
const defaultExec: ExecFn = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 15_000 }, (err, stdout) => {
      if (err) reject(err); else resolve(String(stdout));
    });
  });

let _adviceCache: { at: number; value: Omit<PowerAdvice, "keepAwake"> } | null = null;
const ADVICE_TTL_MS = 60_000;

export async function getPowerAdvice(opts: {
  platform?: NodeJS.Platform;
  execFn?:   ExecFn;
  noCache?:  boolean;
} = {}): Promise<PowerAdvice> {
  const platform = opts.platform ?? process.platform;
  const execFn   = opts.execFn   ?? defaultExec;

  if (!opts.noCache && _adviceCache && Date.now() - _adviceCache.at < ADVICE_TTL_MS) {
    return { ..._adviceCache.value, keepAwake: getKeepAwakeStatus() };
  }

  let lid: PowerAdvice["lid"] = null;
  let hasBattery: boolean | null = null;

  if (platform === "win32") {
    const [lidOut, battOut] = await Promise.allSettled([
      execFn("powercfg.exe", ["/qh", "SCHEME_CURRENT", SUB_BUTTONS, LIDACTION]),
      execFn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_Battery | Measure-Object).Count"]),
    ]);
    if (lidOut.status === "fulfilled") lid = parseLidActions(lidOut.value);
    if (battOut.status === "fulfilled") {
      const n = parseInt(battOut.value.trim(), 10);
      if (!Number.isNaN(n)) hasBattery = n > 0;
    }
  }

  const value = {
    platform,
    lid,
    hasBattery,
    // Desktops (no battery) have no lid to close; unknown battery → warn if the setting says sleep.
    lidWillSleep: hasBattery !== false && lid !== null && lid.ac !== 0,
  };
  _adviceCache = { at: Date.now(), value };
  return { ...value, keepAwake: getKeepAwakeStatus() };
}

/** Test hook — reset module state between tests. */
export function __resetKeepAwakeForTests(): void {
  stopKeepAwake();
  _adviceCache = null;
}
