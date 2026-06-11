// =============================================================================
// Document Intelligence Tools — PDF text extraction + local file search
//
// Phase 1 (Feature B): lets the agent answer "find that invoice PDF" and
// "what does this contract say" across the workspace AND any folders the
// user has explicitly granted (Settings → Folder Access).
//
// Security: every path goes through resolveAccess() from folderGrants —
// workspace is always allowed, granted roots are mode-checked (read is
// enough for both tools), everything else is rejected. Accesses outside the
// workspace are audit-logged.
//
// Hard caps (search): max 5,000 files scanned, max 50 results, 10s time
// budget — partial results are returned with a note when a cap is hit.
// Hard cap (read_pdf): 50,000 characters with a "(truncated)" marker.
// =============================================================================

import { z } from "zod";
import { buildTool } from "./registry.js";
import { readFile, readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { createRequire } from "module";
import { resolveAccess, loadGrants, workspaceDir } from "../files/folderGrants.js";
import { logger } from "../util/logger.js";

const require = createRequire(import.meta.url);

// ── read_pdf ──────────────────────────────────────────────────────────────────

export const PDF_CHAR_CAP = 50_000;
export const PDF_TRUNCATION_MARKER = "(truncated)";

type PdfParser = (buffer: Buffer) => Promise<{ text?: string }>;

// Injectable parser so tests can exercise the cap without a 50k-char PDF
let _pdfParserOverride: PdfParser | null = null;
export function _setPdfParserForTests(fn: PdfParser | null): void {
  _pdfParserOverride = fn;
}

function getPdfParser(): PdfParser {
  return _pdfParserOverride ?? (require("pdf-parse") as PdfParser);
}

/** Cap extracted PDF text at PDF_CHAR_CAP chars, appending a truncation marker. */
export function capPdfText(text: string): { content: string; truncated: boolean } {
  if (text.length <= PDF_CHAR_CAP) return { content: text, truncated: false };
  return {
    content:
      text.slice(0, PDF_CHAR_CAP) +
      "\n\n" + PDF_TRUNCATION_MARKER + " — PDF text exceeds the 50,000 character cap. " +
      "Ask for a specific section if you need more.",
    truncated: true,
  };
}

export const readPdfTool = buildTool({
  name: "read_pdf",
  description:
    "Extract the text content of a PDF file. Works on files in the agent workspace " +
    "and in any folder the user has granted access to (Settings → Folder Access). " +
    "Output is capped at 50,000 characters.",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    path: z.string().describe("Path to the .pdf file (workspace-relative or absolute inside a granted folder)"),
  }),
  async call(input): Promise<any> {
    try {
      const access = resolveAccess(input.path);
      if (!access.allowed) {
        return {
          success: false,
          error:
            `Path "${input.path}" is outside the agent workspace and not inside any granted folder. ` +
            `Ask the user to grant access in the dashboard (Settings → Folder Access) — do not retry.`,
        };
      }
      if (extname(access.resolvedPath).toLowerCase() !== ".pdf") {
        return { success: false, error: `Not a PDF file: ${access.resolvedPath}. Use read_file for other formats.` };
      }

      if (access.mode !== "workspace") {
        logger.info(
          { event: "granted_folder_access", tool: "read_pdf", path: access.resolvedPath, grantRoot: access.grantRoot, mode: "read" },
          "read_pdf accessed a user-granted folder"
        );
      }

      const stats = await stat(access.resolvedPath);
      const buffer = await readFile(access.resolvedPath);
      const parsed = await getPdfParser()(buffer);
      const raw = parsed.text?.trim() || "(no text content extracted)";
      const { content, truncated } = capPdfText(raw);

      return {
        success: true,
        data: {
          format: "pdf",
          filePath: access.resolvedPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          charCount: content.length,
          truncated,
          content,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to read PDF: ${err}` };
    }
  },
});

// ── search_local_files ────────────────────────────────────────────────────────

export interface SearchCaps {
  maxFilesScanned: number;
  maxResults: number;
  timeBudgetMs: number;
}

export const DEFAULT_SEARCH_CAPS: SearchCaps = {
  maxFilesScanned: 5_000,
  maxResults: 50,
  timeBudgetMs: 10_000,
};

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const CONTENT_SEARCH_EXTS = new Set([".txt", ".md", ".csv", ".json", ".log"]);
const MAX_CONTENT_BYTES = 2 * 1024 * 1024; // 2 MB

export interface SearchHit {
  path: string;
  name: string;
  matchType: "filename" | "content";
  sizeBytes: number;
  modified: string;
}

export interface SearchOutcome {
  results: SearchHit[];
  filesScanned: number;
  rootsSearched: string[];
  note: string | null; // set when a cap was hit (partial results)
}

/**
 * Recursive capped search across the given roots. Exported separately so the
 * caps are unit-testable without the 5,000-file default.
 */
export async function searchFiles(
  query: string,
  roots: string[],
  searchContent: boolean,
  caps: SearchCaps = DEFAULT_SEARCH_CAPS
): Promise<SearchOutcome> {
  const q = query.toLowerCase();
  const started = Date.now();
  const results: SearchHit[] = [];
  let filesScanned = 0;
  let note: string | null = null;

  const capHit = (reason: string): void => {
    if (!note) note = `Search stopped early (${reason}) — results are partial. Narrow the query or pick a specific folder.`;
  };

  outer:
  for (const root of roots) {
    const stack: string[] = [root];
    while (stack.length > 0) {
      if (Date.now() - started > caps.timeBudgetMs) { capHit("10 second time budget reached"); break outer; }
      const dir = stack.pop()!;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue; // unreadable dir — skip silently
      }
      for (const entry of entries) {
        if (Date.now() - started > caps.timeBudgetMs) { capHit("10 second time budget reached"); break outer; }
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
          stack.push(full);
          continue;
        }
        if (!entry.isFile()) continue;

        if (filesScanned >= caps.maxFilesScanned) { capHit(`${caps.maxFilesScanned} file scan cap reached`); break outer; }
        filesScanned++;

        let matchType: "filename" | "content" | null = null;
        if (entry.name.toLowerCase().includes(q)) {
          matchType = "filename";
        } else if (searchContent && CONTENT_SEARCH_EXTS.has(extname(entry.name).toLowerCase())) {
          try {
            const s = await stat(full);
            if (s.size <= MAX_CONTENT_BYTES) {
              const text = await readFile(full, "utf-8");
              if (text.toLowerCase().includes(q)) matchType = "content";
            }
          } catch {
            // unreadable file — skip
          }
        }

        if (matchType) {
          try {
            const s = await stat(full);
            results.push({
              path: full,
              name: entry.name,
              matchType,
              sizeBytes: s.size,
              modified: s.mtime.toISOString(),
            });
          } catch {
            results.push({ path: full, name: entry.name, matchType, sizeBytes: 0, modified: "" });
          }
          if (results.length >= caps.maxResults) { capHit(`${caps.maxResults} result cap reached`); break outer; }
        }
      }
    }
  }

  return { results, filesScanned, rootsSearched: roots, note };
}

export const searchLocalFilesTool = buildTool({
  name: "search_local_files",
  description:
    "Search for files by name (always) and optionally by content across the agent workspace " +
    "and all folders the user has granted access to. Content matching covers text files under 2 MB " +
    "(.txt .md .csv .json .log). Capped at 5,000 files scanned / 50 results / 10 seconds — " +
    "partial results include a note when a cap is hit. " +
    "Optionally pass roots to limit the search to specific granted folders.",
  category: "file",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({
    query: z.string().describe("Substring to match in file names (and contents when searchContent=true)"),
    searchContent: z.boolean().optional().default(false).describe("Also match inside text files (.txt .md .csv .json .log under 2 MB)"),
    roots: z.array(z.string()).optional().describe("Optional subset of folders to search (must be the workspace or granted folders)"),
  }),
  async call(input): Promise<any> {
    try {
      const query = (input.query || "").trim();
      if (!query) return { success: false, error: "Query must not be empty." };

      const grants = loadGrants();
      let roots: string[];
      const skipped: string[] = [];

      if (input.roots && input.roots.length > 0) {
        roots = [];
        for (const r of input.roots) {
          const access = resolveAccess(r);
          if (access.allowed) roots.push(access.resolvedPath);
          else skipped.push(r);
        }
        if (roots.length === 0) {
          return {
            success: false,
            error:
              "None of the requested folders are accessible. Only the workspace and user-granted folders can be searched. " +
              "Ask the user to grant access in the dashboard (Settings → Folder Access) — do not retry.",
          };
        }
      } else {
        roots = [workspaceDir(), ...grants.map((g) => g.path)];
      }

      // Audit: searching outside the workspace
      for (const root of roots) {
        const access = resolveAccess(root);
        if (access.allowed && access.mode !== "workspace") {
          logger.info(
            { event: "granted_folder_access", tool: "search_local_files", path: root, grantRoot: access.grantRoot, mode: "read" },
            "search_local_files searched a user-granted folder"
          );
        }
      }

      const outcome = await searchFiles(query, roots, input.searchContent ?? false, DEFAULT_SEARCH_CAPS);

      const notes: string[] = [];
      if (outcome.note) notes.push(outcome.note);
      if (skipped.length > 0) notes.push(`Skipped folders without access: ${skipped.join(", ")}`);

      return {
        success: true,
        data: {
          query,
          rootsSearched: outcome.rootsSearched,
          filesScanned: outcome.filesScanned,
          resultCount: outcome.results.length,
          results: outcome.results,
          note: notes.length > 0 ? notes.join(" | ") : undefined,
        },
      };
    } catch (err) {
      return { success: false, error: `Search failed: ${err}` };
    }
  },
});
