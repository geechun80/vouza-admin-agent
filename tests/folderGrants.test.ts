// =============================================================================
// Folder Access Grants — security contract tests (Phase 1)
//
// Covers: separator-safe prefix checks, blocked roots, per-mode enforcement
// through the fileManager tools, workspace full access, persistence
// roundtrip (atomic write), and realpath resolution for not-yet-existing
// paths under a granted root.
// =============================================================================

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join, dirname, parse as parsePath, resolve } from "path";
import { homedir, tmpdir } from "os";

// Point the grants store at a throwaway file BEFORE importing the module
// under test (the path is read lazily on every call, but belt-and-suspenders).
const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), "fg-grants-store-"));
process.env.FOLDER_GRANTS_FILE = join(TEST_DATA_DIR, "folder-grants.json");

import {
  loadGrants,
  addGrant,
  removeGrant,
  resolveAccess,
  checkBlockedRoot,
  workspaceDir,
} from "../src/files/folderGrants.js";
import { writeFileTool, deleteFileTool, readFileTool } from "../src/tools/fileManager.js";

// Grantable test folders must live OUTSIDE blocked roots. os.tmpdir() sits
// under AppData on Windows (blocked), and anything inside the project dir is
// blocked too — so use a sibling of the project directory.
const SANDBOX_PARENT = dirname(process.cwd());
let sandbox = "";
let downloads = "";       // granted root
let downloadsEvil = "";   // sibling that must NOT match the grant

const ctx = {} as any; // tools under test ignore the AgentContext

before(() => {
  sandbox = mkdtempSync(join(SANDBOX_PARENT, "fg-test-"));
  downloads = join(sandbox, "Downloads");
  downloadsEvil = join(sandbox, "Downloads-evil");
  mkdirSync(downloads, { recursive: true });
  mkdirSync(downloadsEvil, { recursive: true });
  writeFileSync(join(downloads, "inside.txt"), "inside the grant", "utf-8");
  writeFileSync(join(downloadsEvil, "evil.txt"), "outside the grant", "utf-8");
});

after(() => {
  try { rmSync(sandbox, { recursive: true, force: true }); } catch { /* best-effort */ }
  try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch { /* best-effort */ }
});

function clearGrants(): void {
  for (const g of loadGrants()) removeGrant(g.path);
}

// ── Prefix check ──────────────────────────────────────────────────────────────

test("prefix check is separator-safe: Downloads-evil does NOT match a Downloads grant", () => {
  clearGrants();
  addGrant(downloads, "read");

  const inside = resolveAccess(join(downloads, "inside.txt"));
  assert.equal(inside.allowed, true);
  assert.equal(inside.mode, "read");

  const evil = resolveAccess(join(downloadsEvil, "evil.txt"));
  assert.equal(evil.allowed, false);
  assert.equal(evil.mode, "none");
});

test("granted root itself resolves as allowed (exact-equality branch)", () => {
  clearGrants();
  addGrant(downloads, "read");
  const root = resolveAccess(downloads);
  assert.equal(root.allowed, true);
  assert.equal(root.mode, "read");
  assert.ok(root.grantRoot, "matched grant root must be reported");
});

// ── Blocked roots ─────────────────────────────────────────────────────────────

test("blocked: drive root cannot be granted", () => {
  const driveRoot = parsePath(resolve(process.cwd())).root; // e.g. C:\
  assert.throws(() => addGrant(driveRoot, "read"), /drive/i);
});

test("blocked: Windows system folder cannot be granted", () => {
  const winDir = process.env.SystemRoot || join(parsePath(resolve(process.cwd())).root, "Windows");
  const check = checkBlockedRoot(winDir);
  assert.equal(check.blocked, true);
  assert.throws(() => addGrant(winDir, "read"));
});

test("blocked: AppData cannot be granted (including subfolders)", () => {
  const appData = join(homedir(), "AppData");
  assert.equal(checkBlockedRoot(appData).blocked, true);
  assert.equal(checkBlockedRoot(join(appData, "Local", "Temp")).blocked, true);
  assert.throws(() => addGrant(join(appData, "Local"), "read"));
});

test("blocked: the agent's own project directory cannot be granted", () => {
  assert.throws(() => addGrant(process.cwd(), "read"), /agent/i);
  // ...nor anything inside it (would allow rewriting config/grants = self-escalation)
  assert.equal(checkBlockedRoot(join(process.cwd(), "data")).blocked, true);
});

test("blocked: any parent of the project directory cannot be granted", () => {
  assert.throws(() => addGrant(dirname(process.cwd()), "read"), /agent/i);
});

test("blocked: the user profile root itself cannot be granted (subfolders are fine)", () => {
  assert.equal(checkBlockedRoot(homedir()).blocked, true);
  // A typical subfolder (our sandbox) is NOT blocked
  assert.equal(checkBlockedRoot(downloads).blocked, false);
});

// ── Mode enforcement through the file tools ───────────────────────────────────

test("read grant refuses writes", async () => {
  clearGrants();
  addGrant(downloads, "read");
  const result: any = await writeFileTool.call(
    { filePath: join(downloads, "should-not-exist.txt"), content: "nope", encoding: "utf-8" } as any,
    ctx
  );
  assert.equal(result.success, false);
  assert.match(result.error, /read-only/i);
  assert.equal(existsSync(join(downloads, "should-not-exist.txt")), false);
});

test("readwrite grant allows writes (and reads)", async () => {
  clearGrants();
  addGrant(downloads, "readwrite");
  const target = join(downloads, "written-by-agent.txt");
  const write: any = await writeFileTool.call(
    { filePath: target, content: "hello from the agent", encoding: "utf-8" } as any,
    ctx
  );
  assert.equal(write.success, true);
  assert.equal(readFileSync(target, "utf-8"), "hello from the agent");

  const read: any = await readFileTool.call({ filePath: target, encoding: "utf-8" } as any, ctx);
  assert.equal(read.success, true);
  assert.equal(read.data.content, "hello from the agent");
});

test("delete is refused in a granted folder even at readwrite", async () => {
  clearGrants();
  addGrant(downloads, "readwrite");
  const target = join(downloads, "inside.txt");
  const result: any = await deleteFileTool.call({ filePath: target } as any, ctx);
  assert.equal(result.success, false);
  assert.match(result.error, /workspace/i);
  assert.equal(existsSync(target), true, "file must still exist after refused delete");
});

test("workspace keeps full access (write + delete) regardless of grants", async () => {
  clearGrants(); // no grants at all
  const rel = "fg-test-workspace-file.txt";
  const write: any = await writeFileTool.call({ filePath: rel, content: "ws", encoding: "utf-8" } as any, ctx);
  assert.equal(write.success, true);
  assert.equal(resolveAccess(rel).mode, "workspace");

  const del: any = await deleteFileTool.call({ filePath: rel } as any, ctx);
  assert.equal(del.success, true);
  assert.equal(existsSync(join(workspaceDir(), rel)), false);
});

// ── Persistence ───────────────────────────────────────────────────────────────

test("grants persist roundtrip via atomic write", () => {
  clearGrants();
  addGrant(downloads, "readwrite");

  // The on-disk file is valid JSON written via tmp+rename
  const raw = JSON.parse(readFileSync(process.env.FOLDER_GRANTS_FILE!, "utf-8"));
  assert.equal(raw.version, 1);
  assert.equal(raw.grants.length, 1);
  assert.equal(raw.grants[0].mode, "readwrite");
  assert.ok(raw.grants[0].addedAt);

  const loaded = loadGrants();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].mode, "readwrite");

  // Re-granting the same folder replaces (no duplicates)
  addGrant(downloads, "read");
  assert.equal(loadGrants().length, 1);
  assert.equal(loadGrants()[0].mode, "read");

  assert.equal(removeGrant(downloads), true);
  assert.equal(loadGrants().length, 0);
});

test("corrupt grants file fails closed (no grants)", () => {
  writeFileSync(process.env.FOLDER_GRANTS_FILE!, "{not json!!", "utf-8");
  assert.deepEqual(loadGrants(), []);
  const denied = resolveAccess(join(downloads, "inside.txt"));
  assert.equal(denied.allowed, false);
  // restore a clean store for the remaining tests
  writeFileSync(process.env.FOLDER_GRANTS_FILE!, JSON.stringify({ version: 1, grants: [] }), "utf-8");
});

// ── Realpath handling for not-yet-existing paths ──────────────────────────────

test("resolveAccess works for a nonexistent path under a granted root (write intent)", () => {
  clearGrants();
  addGrant(downloads, "readwrite");
  const future = join(downloads, "new-subfolder", "report.txt"); // none of this exists yet
  const access = resolveAccess(future);
  assert.equal(access.allowed, true);
  assert.equal(access.mode, "readwrite");
});

test("case-insensitive matching on Windows paths", (t) => {
  if (process.platform !== "win32") return t.skip("Windows-only contract");
  clearGrants();
  addGrant(downloads, "read");
  const upper = join(downloads.toUpperCase(), "INSIDE.TXT");
  assert.equal(resolveAccess(upper).allowed, true);
});
