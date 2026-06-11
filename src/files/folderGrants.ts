// =============================================================================
// Folder Access Grants — opt-in access to folders outside the workspace
//
// SECURITY MODEL (Phase 1 — deny-by-default, user-granted exceptions):
//   • ALL file tools remain sandboxed to process.cwd()/workspace by default.
//   • The USER (and only the user) can grant access to specific folders via
//     the dashboard (Settings → Folder Access). Grant/revoke happens ONLY
//     through HTTP endpoints protected by requireLocalOrigin — there is
//     deliberately NO agent-callable tool that adds grants, so the agent can
//     never grant itself access.
//   • Two permission levels per grant:
//       "read"      → list / read / search
//       "readwrite" → adds write / create / rename
//     DELETION is workspace-only EVERYWHERE — never allowed in granted
//     folders regardless of permission level.
//   • Blocked roots (can never be granted): drive roots, C:\Windows,
//     Program Files, AppData, the agent's own project directory (and any
//     parent of it, and anything inside it), and the user profile root.
//     Subfolders like Downloads / Desktop / Documents are fine.
//   • Path checks are separator-safe prefix checks on resolved + realpath'd
//     paths, so "C:\Users\X\Downloads-evil" never matches a grant for
//     "C:\Users\X\Downloads" and junctions inside a granted folder cannot
//     escape it.
//   • Grants persist in data/folder-grants.json (gitignored) with an
//     atomic write-then-rename, same pattern as data/mcp-servers.json.
// =============================================================================

import { resolve, sep, dirname, parse as parsePath, join } from "path";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  realpathSync,
  existsSync,
  statSync,
} from "fs";
import { homedir } from "os";

export interface FolderGrant {
  path: string;             // resolved absolute folder path
  mode: "read" | "readwrite";
  addedAt: string;          // ISO timestamp
}

export interface AccessResult {
  allowed: boolean;
  /** "workspace" = full access; "read"/"readwrite" = granted-folder access; "none" = denied */
  mode: "workspace" | "read" | "readwrite" | "none";
  /** The grant root that matched (granted-folder access only) */
  grantRoot?: string;
  /** Fully resolved absolute path of the candidate */
  resolvedPath: string;
}

// ── Storage location ─────────────────────────────────────────────────────────
// Overridable via env so tests can point at a temp file without touching the
// real data/ directory.

function grantsFilePath(): string {
  return process.env.FOLDER_GRANTS_FILE || join(process.cwd(), "data", "folder-grants.json");
}

export function workspaceDir(): string {
  return resolve(process.cwd(), "workspace");
}

// ── Case handling ─────────────────────────────────────────────────────────────
// Windows paths are case-insensitive; compare lower-cased on win32.

const CASE_INSENSITIVE = process.platform === "win32";

function norm(p: string): string {
  return CASE_INSENSITIVE ? p.toLowerCase() : p;
}

/** Separator-safe containment: is `candidate` equal to or inside `root`? */
function isWithin(candidate: string, root: string): boolean {
  const c = norm(candidate);
  const r = norm(root);
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}

// ── Symlink / junction escape guard ──────────────────────────────────────────
// Realpath the deepest EXISTING ancestor of the path, then re-append the
// non-existing tail. This means a junction placed inside a granted folder
// that points outside it resolves to its TRUE location before the prefix
// check, and a write to a not-yet-existing file still resolves via its
// parent directory.

export function realResolve(inputAbs: string): string {
  let existing = inputAbs;
  const tail: string[] = [];
  // Walk up until we find an existing ancestor (or hit the root)
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break; // reached filesystem root
    tail.unshift(existing.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
    existing = parent;
  }
  let real = existing;
  try {
    real = realpathSync(existing);
  } catch {
    // realpath failed (permissions, race) — fall back to the resolved path
    real = existing;
  }
  return tail.length ? join(real, ...tail) : real;
}

// ── Blocked roots ─────────────────────────────────────────────────────────────

interface BlockedCheck {
  blocked: boolean;
  reason?: string;
}

/** Returns a specific human-readable reason when `candidate` may not be granted. */
export function checkBlockedRoot(candidate: string): BlockedCheck {
  const abs = realResolve(resolve(candidate));
  const root = parsePath(abs).root;

  // 1. Drive root (C:\, D:\, / on unix)
  if (norm(abs) === norm(root)) {
    return { blocked: true, reason: "Cannot grant access to an entire drive. Pick a specific folder like Downloads or Documents instead." };
  }

  // 2. Windows system folders
  const systemRoots: Array<{ path: string | undefined; label: string }> = [
    { path: process.env.SystemRoot || (root ? join(root, "Windows") : undefined), label: "the Windows system folder" },
    { path: root ? join(root, "Windows") : undefined,                             label: "the Windows system folder" },
    { path: process.env.ProgramFiles || (root ? join(root, "Program Files") : undefined), label: "Program Files" },
    { path: root ? join(root, "Program Files") : undefined,                       label: "Program Files" },
    { path: process.env["ProgramFiles(x86)"] || (root ? join(root, "Program Files (x86)") : undefined), label: "Program Files" },
    { path: root ? join(root, "Program Files (x86)") : undefined,                 label: "Program Files" },
  ];
  for (const sys of systemRoots) {
    if (sys.path && isWithin(abs, resolve(sys.path))) {
      return { blocked: true, reason: `Cannot grant access to ${sys.label} — system folders are off-limits for safety.` };
    }
  }

  // 3. AppData (roaming + local live under %USERPROFILE%\AppData)
  const appData = join(homedir(), "AppData");
  if (isWithin(abs, resolve(appData))) {
    return { blocked: true, reason: "Cannot grant access to AppData — application data folders are off-limits for safety." };
  }

  // 4. The agent's own project directory, anything inside it, and any parent of it.
  //    (Inside is blocked too — a grant on the agent's data/ folder would let the
  //    agent rewrite its own config and grants, which is self-escalation.)
  const projectDir = realResolve(resolve(process.cwd()));
  if (isWithin(abs, projectDir) || isWithin(projectDir, abs)) {
    return { blocked: true, reason: "Cannot grant access to the agent's own program folder (or a parent of it). The agent already has its workspace folder for file tasks." };
  }

  // 5. The user profile root itself (subfolders like Downloads/Desktop are fine)
  const profile = realResolve(resolve(homedir()));
  if (norm(abs) === norm(profile)) {
    return { blocked: true, reason: "Cannot grant access to your entire user profile. Pick a specific folder like Downloads, Desktop, or Documents." };
  }

  return { blocked: false };
}

// ── Persistence (atomic write-then-rename) ────────────────────────────────────

export function loadGrants(): FolderGrant[] {
  try {
    const raw = readFileSync(grantsFilePath(), "utf-8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.grants) ? parsed.grants : [];
    return list.filter(
      (g: any): g is FolderGrant =>
        g && typeof g.path === "string" && (g.mode === "read" || g.mode === "readwrite")
    );
  } catch {
    return []; // missing or corrupt file → no grants (deny-by-default)
  }
}

function saveGrants(grants: FolderGrant[]): void {
  const file = grantsFilePath();
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify({ version: 1, grants }, null, 2), "utf-8");
  renameSync(tmp, file);
}

/**
 * Add (or update) a folder grant. Throws Error with a specific message when
 * the folder is a blocked root, does not exist, or is not a directory.
 *
 * NOTE: only ever called from dashboard HTTP endpoints behind
 * requireLocalOrigin. Never expose this as an agent tool.
 */
export function addGrant(path: string, mode: "read" | "readwrite"): FolderGrant {
  if (!path || typeof path !== "string" || !path.trim()) {
    throw new Error("Folder path is required.");
  }
  if (mode !== "read" && mode !== "readwrite") {
    throw new Error('Mode must be "read" or "readwrite".');
  }

  const abs = resolve(path.trim());

  const blocked = checkBlockedRoot(abs);
  if (blocked.blocked) throw new Error(blocked.reason);

  if (!existsSync(abs)) {
    throw new Error(`Folder does not exist: ${abs}`);
  }
  if (!statSync(abs).isDirectory()) {
    throw new Error(`Not a folder: ${abs}. Grant the folder that contains the file instead.`);
  }

  // Store the REAL path so junction-based grant targets can't be ambiguous
  const real = realResolve(abs);
  const grant: FolderGrant = { path: real, mode, addedAt: new Date().toISOString() };

  const grants = loadGrants().filter((g) => norm(g.path) !== norm(real));
  grants.push(grant);
  saveGrants(grants);
  return grant;
}

/** Remove a grant by path. Returns true if something was removed. */
export function removeGrant(path: string): boolean {
  const abs = resolve(String(path || "").trim());
  const before = loadGrants();
  const after = before.filter(
    (g) => norm(g.path) !== norm(abs) && norm(g.path) !== norm(realResolve(abs))
  );
  if (after.length === before.length) return false;
  saveGrants(after);
  return true;
}

// ── Access resolution ─────────────────────────────────────────────────────────

/**
 * Resolve what access (if any) the agent has to `candidatePath`.
 *
 * Relative paths resolve against the workspace dir (backwards compatible with
 * the original safePath behavior). Absolute paths are checked against the
 * workspace first, then against user grants with a realpath'd,
 * separator-safe prefix check.
 */
export function resolveAccess(candidatePath: string): AccessResult {
  const ws = workspaceDir();

  // Resolve relative paths against the workspace (legacy behavior)
  const resolved = resolve(ws, candidatePath);
  const real = realResolve(resolved);

  // Workspace: full access (realpath'd to block junction escapes from inside)
  let wsReal = ws;
  try { wsReal = realResolve(ws); } catch { /* keep ws */ }
  if (isWithin(real, wsReal) || isWithin(real, ws)) {
    return { allowed: true, mode: "workspace", resolvedPath: real };
  }

  // Granted folders
  for (const grant of loadGrants()) {
    let grantReal = grant.path;
    try { grantReal = realResolve(resolve(grant.path)); } catch { /* keep stored */ }
    if (isWithin(real, grantReal) || isWithin(real, resolve(grant.path))) {
      return { allowed: true, mode: grant.mode, grantRoot: grant.path, resolvedPath: real };
    }
  }

  return { allowed: false, mode: "none", resolvedPath: real };
}
