// =============================================================================
// WhatsApp login, encrypted on disk
//
// Same layout and behaviour as Baileys' useMultiFileAuthState (one file per
// key in data/whatsapp-auth/), but every file's contents are AES-256-GCM
// encrypted with the agent's master key (security/secretStore.ts). Whoever
// holds these files can act as the linked WhatsApp account, so they must
// not sit in plain text.
//
// Upgrade path: a file still in plain JSON (from before encryption) is read
// as-is and rewritten encrypted on the spot, so existing pairings survive.
// =============================================================================

import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { decryptString, encryptString, ENC_PREFIX } from "../security/secretStore.js";

/** Serialise reads/writes per file (Baileys reads and writes concurrently). */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(file, next.catch(() => {}));
  return next;
}

const fixFileName = (file: string) => file.replace(/\//g, "__").replace(/:/g, "-");

export async function useEncryptedFileAuthState(
  folder: string,
  key: Buffer,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const info = await stat(folder).catch(() => null);
  if (info && !info.isDirectory()) {
    throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`);
  }
  if (!info) await mkdir(folder, { recursive: true });

  const writeData = (data: unknown, file: string) => {
    const path = join(folder, fixFileName(file));
    return withLock(path, () =>
      writeFile(path, encryptString(JSON.stringify(data, BufferJSON.replacer), key), { encoding: "utf-8", mode: 0o600 }),
    );
  };

  const readData = async (file: string): Promise<any> => {
    const path = join(folder, fixFileName(file));
    let raw: string;
    try {
      raw = await withLock(path, () => readFile(path, "utf-8"));
    } catch {
      return null;
    }
    try {
      if (raw.startsWith(ENC_PREFIX)) return JSON.parse(decryptString(raw, key), BufferJSON.reviver);
      // Plain JSON from before encryption — use it and encrypt it now.
      const value = JSON.parse(raw, BufferJSON.reviver);
      await writeData(value, file);
      return value;
    } catch {
      return null; // damaged, or locked to another computer/user → re-pair
    }
  };

  const removeData = (file: string) => {
    const path = join(folder, fixFileName(file));
    return withLock(path, () => unlink(path).catch(() => {}));
  };

  const creds: AuthenticationCreds = (await readData("creds.json")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(ids.map(async (id) => {
            let value = await readData(`${type}-${id}.json`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }));
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => { await writeData(creds, "creds.json"); },
  };
}
