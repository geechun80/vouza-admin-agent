// =============================================================================
// Secret store — API keys, passwords and tokens are encrypted on disk
//
// Before: data/config.json held every key and password in plain text, and
// data/whatsapp-auth/ held the WhatsApp login. Anyone who could read the
// folder — another account on the PC, a cloud-synced Desktop, a copied
// backup of the disk — could use them.
//
// Now every secret field is stored as "enc:v1:…" (AES-256-GCM). The 32-byte
// master key never sits in the clear next to the data:
//
//   Windows  — protected with DPAPI for the current Windows user (only this
//              user account on this PC can unlock it); saved as data/.secret-key
//   macOS    — kept in the login Keychain
//   other    — data/.secret-key with owner-only permissions (0600), plus a
//              warning; set VOUZA_SECRET_KEY to supply the key yourself
//   any OS   — VOUZA_SECRET_KEY (64 hex chars) overrides everything
//              (Docker / headless servers)
//
// What this protects against: the files being read or copied somewhere else.
// What it does not: malware already running as the same user (it could ask
// the OS to unlock the key just as the agent does).
//
// Moving to another computer: use Health → Download backup (it contains the
// readable keys) and restore it there; copied encrypted files can't be opened.
// =============================================================================

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { spawn } from "child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { logger } from "../util/logger.js";

export const ENC_PREFIX      = "enc:v1:";   // encrypted string
export const ENC_JSON_PREFIX = "enc:v1j:";  // encrypted JSON value (object/array)

const KEYCHAIN_SERVICE = "vouza-admin-agent";

/** Field names that hold secrets. Matching errs on the side of encrypting. */
export function isSensitiveField(key: string): boolean {
  const k = key.toLowerCase();
  return ["key", "token", "secret", "pass", "password", "credential", "private", "cookie"].some((w) => k.includes(w));
}

// ---------------------------------------------------------------------------
// Master key
// ---------------------------------------------------------------------------

type KeyFile =
  | { v: 1; source: "dpapi"; blob: string }
  | { v: 1; source: "keychain"; account: string }
  | { v: 1; source: "file"; key: string };

export function keyFilePath(dataDir = join(process.cwd(), "data")): string {
  return join(dataDir, ".secret-key");
}

let _keyPromise: Promise<Buffer> | null = null;

/** The 32-byte master key (cached for the life of the process). */
export function getMasterKey(): Promise<Buffer> {
  if (!_keyPromise) {
    _keyPromise = loadOrCreateKey().catch((err) => {
      _keyPromise = null; // let a later call retry
      throw err;
    });
  }
  return _keyPromise;
}

/** Test hook. */
export function __resetMasterKeyForTests(): void {
  _keyPromise = null;
}

async function loadOrCreateKey(path = keyFilePath()): Promise<Buffer> {
  const fromEnv = (process.env.VOUZA_SECRET_KEY || "").trim();
  if (fromEnv) {
    if (!/^[0-9a-fA-F]{64}$/.test(fromEnv)) throw new Error("VOUZA_SECRET_KEY must be 64 hex characters (32 bytes).");
    return Buffer.from(fromEnv, "hex");
  }

  if (existsSync(path)) {
    const kf = JSON.parse(await readFile(path, "utf-8")) as KeyFile;
    // A recorded source that fails is an error — never silently make a new
    // key, or everything already encrypted would become unreadable.
    if (kf.source === "dpapi")    return Buffer.from(await dpapi("Unprotect", kf.blob), "base64");
    if (kf.source === "keychain") return Buffer.from(await keychainRead(kf.account), "hex");
    if (kf.source === "file")     return Buffer.from(kf.key, "hex");
    throw new Error(`Unknown key source in ${path}`);
  }

  const key = randomBytes(32);
  let kf: KeyFile;
  try {
    if (process.platform === "win32") {
      kf = { v: 1, source: "dpapi", blob: await dpapi("Protect", key.toString("base64")) };
    } else if (process.platform === "darwin") {
      const account = `master-${randomBytes(6).toString("hex")}`;
      await keychainWrite(account, key.toString("hex"));
      kf = { v: 1, source: "keychain", account };
    } else {
      throw new Error("no OS key store");
    }
  } catch (err) {
    logger.warn({ event: "secret_key_os_store_unavailable", err: String(err) },
      "OS key store unavailable — master key kept in data/.secret-key (owner-only). Set VOUZA_SECRET_KEY for stronger protection.");
    kf = { v: 1, source: "file", key: key.toString("hex") };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(kf), { encoding: "utf-8", mode: 0o600 });
  await chmod(path, 0o600).catch(() => {});
  logger.info({ event: "secret_key_created", source: kf.source }, `Created master key (${kf.source})`);
  return key;
}

/** Run a command with data on stdin (never on the command line). */
function runWithInput(cmd: string, args: string[], input: string, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${cmd} exited ${code}: ${err.trim().slice(0, 200)}`));
    });
    child.stdin.end(input);
  });
}

/** Windows DPAPI (current user) via PowerShell; base64 in, base64 out. */
export function dpapi(op: "Protect" | "Unprotect", base64: string): Promise<string> {
  const script =
    "Add-Type -AssemblyName System.Security;" +
    "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());" +
    `[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${op}($b,$null,'CurrentUser'))`;
  return runWithInput("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], base64);
}

async function keychainWrite(account: string, hex: string): Promise<void> {
  // Documented form: the value is on the command line for the instant the
  // command runs (visible only to this user/admins via the process list),
  // once, when the key is first created. Reads go through stdout.
  await runWithInput("security", ["add-generic-password", "-U", "-a", account, "-s", KEYCHAIN_SERVICE, "-w", hex], "");
}

async function keychainRead(account: string): Promise<string> {
  return runWithInput("security", ["find-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE, "-w"], "");
}

// ---------------------------------------------------------------------------
// Encrypting values
// ---------------------------------------------------------------------------

export function encryptString(plain: string, key: Buffer, prefix = ENC_PREFIX): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  return prefix + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptString(sealed: string, key: Buffer): string {
  const prefix = sealed.startsWith(ENC_JSON_PREFIX) ? ENC_JSON_PREFIX : ENC_PREFIX;
  const raw = Buffer.from(sealed.slice(prefix.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf-8");
}

export function isSealed(v: unknown): v is string {
  return typeof v === "string" && (v.startsWith(ENC_PREFIX) || v.startsWith(ENC_JSON_PREFIX));
}

/**
 * Copy of `obj` with every secret encrypted (already-sealed values kept).
 * Everything inside a secret-named field is secret too: a service-account
 * object under googleSaKey, or the whole "credentials" map, is encrypted
 * value by value, leaving the structure readable.
 */
export function sealSecrets<T>(obj: T, key: Buffer): T {
  const walk = (v: any, secret: boolean): any => {
    if (secret && typeof v === "string") return v === "" || isSealed(v) ? v : encryptString(v, key);
    if (Array.isArray(v)) return v.map((x) => walk(x, secret));
    if (v && typeof v === "object") {
      const out: any = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x, secret || isSensitiveField(k));
      return out;
    }
    return v; // numbers / booleans / null aren't secrets
  };
  return walk(obj, false);
}

export interface OpenResult<T> { value: T; failed: number }

/**
 * Copy of `obj` with every sealed value decrypted. A value that can't be
 * opened (different computer / user, damaged file) becomes "" and is counted,
 * so the UI asks for it again instead of the app crashing.
 */
export function openSecrets<T>(obj: T, key: Buffer): OpenResult<T> {
  let failed = 0;
  const walk = (v: any): any => {
    if (isSealed(v)) {
      try {
        const plain = decryptString(v, key);
        return v.startsWith(ENC_JSON_PREFIX) ? JSON.parse(plain) : plain;
      } catch {
        failed++;
        return "";
      }
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: any = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return { value: walk(obj), failed };
}

/** True when `obj` still has a secret stored in plain text. */
export function hasPlaintextSecrets(obj: unknown): boolean {
  const walk = (v: any, secret: boolean): boolean => {
    if (secret && typeof v === "string") return v !== "" && !isSealed(v);
    if (Array.isArray(v)) return v.some((x) => walk(x, secret));
    if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => walk(x, secret || isSensitiveField(k)));
    return false;
  };
  return walk(obj, false);
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** Read a JSON file and decrypt its secrets. Missing file → `fallback`. */
export async function readSealedJson<T = any>(path: string, fallback: T): Promise<T> {
  let raw: string;
  try { raw = await readFile(path, "utf-8"); } catch { return fallback; }
  const parsed = JSON.parse(raw);
  const { value, failed } = openSecrets(parsed, await getMasterKey());
  if (failed > 0) {
    logger.warn({ event: "secret_decrypt_failed", file: path, count: failed },
      `${failed} saved secret(s) in ${path} could not be unlocked on this computer/user — they need to be entered again.`);
  }
  return value;
}

/** Encrypt secrets and write the JSON file atomically, owner-only. */
export async function writeSealedJson(path: string, data: unknown): Promise<void> {
  const sealed = sealSecrets(data, await getMasterKey());
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(sealed, null, 2), { encoding: "utf-8", mode: 0o600 });
  await rename(tmp, path);
  await chmod(path, 0o600).catch(() => {});
}

/**
 * One-time upgrade: re-save a JSON file whose secrets are still in plain
 * text. Returns true when the file was rewritten.
 */
export async function migrateJsonFile(path: string): Promise<boolean> {
  let raw: string;
  try { raw = await readFile(path, "utf-8"); } catch { return false; }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return false; }
  if (!hasPlaintextSecrets(parsed)) return false;
  await writeSealedJson(path, parsed);
  return true;
}
