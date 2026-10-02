// =============================================================================
// Password-locked backups
//
// A backup carries every key and password in readable form (it has to — it is
// how settings move to a new computer, where this computer's DPAPI/Keychain
// master key doesn't exist). So the downloaded file is locked with a password
// the person chooses: scrypt turns the password into a key, AES-256-GCM seals
// the backup, and the GCM tag makes any change or wrong password detectable.
//
// Old unlocked backups (format "vouza-admin-agent-backup") can still be
// restored; new ones are always locked.
// =============================================================================

import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from "crypto";

export const LOCKED_BACKUP_FORMAT = "vouza-admin-agent-backup-locked";
export const PLAIN_BACKUP_FORMAT  = "vouza-admin-agent-backup";
export const MIN_BACKUP_PASSWORD  = 8;

/** scrypt cost: N=2^15, r=8 → 32 MiB and ~0.1 s per guess on a laptop. */
const KDF = { N: 2 ** 15, r: 8, p: 1 } as const;
const MAXMEM = 64 * 1024 * 1024;

export interface LockedBackup {
  format:     typeof LOCKED_BACKUP_FORMAT;
  version:    1;
  exportedAt: string;
  kdf:        { name: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher:     "aes-256-gcm";
  iv:         string;
  tag:        string;
  data:       string;
}

export class BackupPasswordError extends Error {}

function deriveKey(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, 32, { N, r, p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key)));
}

/** Plain-words problem with a chosen password, or null when it's fine. */
export function backupPasswordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_BACKUP_PASSWORD) {
    return `Choose a backup password of at least ${MIN_BACKUP_PASSWORD} characters.`;
  }
  if (password.length > 256) return "That password is too long (256 characters at most).";
  return null;
}

export async function lockBackup(bundle: unknown, password: string): Promise<LockedBackup> {
  const problem = backupPasswordProblem(password);
  if (problem) throw new BackupPasswordError(problem);
  const salt = randomBytes(16);
  const iv   = randomBytes(12);
  const key  = await deriveKey(password, salt, KDF.N, KDF.r, KDF.p);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(LOCKED_BACKUP_FORMAT));
  const data = Buffer.concat([cipher.update(JSON.stringify(bundle), "utf8"), cipher.final()]);
  return {
    format:     LOCKED_BACKUP_FORMAT,
    version:    1,
    exportedAt: new Date().toISOString(),
    kdf:        { name: "scrypt", ...KDF, salt: salt.toString("base64") },
    cipher:     "aes-256-gcm",
    iv:         iv.toString("base64"),
    tag:        cipher.getAuthTag().toString("base64"),
    data:       data.toString("base64"),
  };
}

export function isLockedBackup(v: any): v is LockedBackup {
  return !!v && v.format === LOCKED_BACKUP_FORMAT;
}

/** Opens a locked backup. Throws BackupPasswordError for a wrong password or a damaged file. */
export async function unlockBackup(envelope: LockedBackup, password: string): Promise<any> {
  const k = envelope?.kdf;
  if (envelope?.version !== 1 || envelope.cipher !== "aes-256-gcm" || k?.name !== "scrypt") {
    throw new BackupPasswordError("This backup was made by a newer version of the Admin Agent — update first, then restore.");
  }
  // Refuse cost settings a crafted file could use to freeze the computer.
  if (!(Number.isInteger(k.N) && k.N >= 2 ** 14 && k.N <= 2 ** 17 && k.r >= 1 && k.r <= 16 && k.p >= 1 && k.p <= 4)) {
    throw new BackupPasswordError("This backup file is damaged.");
  }
  if (typeof password !== "string" || !password) throw new BackupPasswordError("Type the backup password.");
  try {
    const key = await deriveKey(password, Buffer.from(k.salt, "base64"), k.N, k.r, k.p);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAAD(Buffer.from(LOCKED_BACKUP_FORMAT));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  } catch {
    throw new BackupPasswordError("Wrong password, or the backup file is damaged.");
  }
}
