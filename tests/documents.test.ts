// =============================================================================
// Document Intelligence Tools — read_pdf + search_local_files (Phase 1)
//
// Covers: search caps (files scanned / results / partial-result note),
// node_modules + .git skipping, content matching for small text files,
// read_pdf 50k-char truncation marker (injected parser — no giant fixture),
// and access denial outside workspace + grants.
// =============================================================================

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Isolated grants store so this test file never sees real grants
const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), "fg-docs-store-"));
process.env.FOLDER_GRANTS_FILE = join(TEST_DATA_DIR, "folder-grants.json");

import {
  searchFiles,
  searchLocalFilesTool,
  readPdfTool,
  capPdfText,
  PDF_CHAR_CAP,
  PDF_TRUNCATION_MARKER,
  _setPdfParserForTests,
} from "../src/tools/documents.js";
import { workspaceDir } from "../src/files/folderGrants.js";

const ctx = {} as any;

// Search fixtures can live anywhere — searchFiles() is the raw engine and is
// fed explicit roots; access control is enforced at the tool layer (tested
// separately below via workspace paths).
let tree = "";

before(() => {
  mkdirSync(workspaceDir(), { recursive: true });
  tree = mkdtempSync(join(tmpdir(), "fg-docs-tree-"));
  // 8 files matching by NAME
  for (let i = 0; i < 8; i++) {
    writeFileSync(join(tree, `invoice-${i}.txt`), `plain body ${i}`, "utf-8");
  }
  // 1 file matching by CONTENT only
  writeFileSync(join(tree, "notes.md"), "the secret invoice number is 42", "utf-8");
  // decoys inside skipped dirs
  mkdirSync(join(tree, "node_modules", "evil-pkg"), { recursive: true });
  writeFileSync(join(tree, "node_modules", "evil-pkg", "invoice-nm.txt"), "x", "utf-8");
  mkdirSync(join(tree, ".git"), { recursive: true });
  writeFileSync(join(tree, ".git", "invoice-git.txt"), "x", "utf-8");
  // nested folder that SHOULD be searched
  mkdirSync(join(tree, "2026"), { recursive: true });
  writeFileSync(join(tree, "2026", "invoice-deep.txt"), "deep", "utf-8");
});

after(() => {
  _setPdfParserForTests(null);
  try { rmSync(tree, { recursive: true, force: true }); } catch { /* best-effort */ }
  try { rmSync(TEST_DATA_DIR, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ── search engine: caps + skips ───────────────────────────────────────────────

test("search skips node_modules and .git but recurses into normal folders", async () => {
  const out = await searchFiles("invoice", [tree], false);
  const paths = out.results.map((r) => r.path.toLowerCase());
  assert.ok(paths.every((p) => !p.includes("node_modules")), "node_modules must be skipped");
  assert.ok(paths.every((p) => !p.includes(".git")), ".git must be skipped");
  assert.ok(paths.some((p) => p.includes("invoice-deep")), "nested folders must be searched");
  assert.equal(out.results.length, 9); // 8 flat + 1 deep, no decoys, no content match
});

test("search respects the max-files-scanned cap and returns a partial-results note", async () => {
  const out = await searchFiles("invoice", [tree], false, {
    maxFilesScanned: 3,
    maxResults: 50,
    timeBudgetMs: 10_000,
  });
  assert.ok(out.filesScanned <= 3, `scanned ${out.filesScanned}, cap was 3`);
  assert.ok(out.note, "a note must flag partial results when the cap is hit");
  assert.match(out.note!, /partial/i);
});

test("search respects the max-results cap", async () => {
  const out = await searchFiles("invoice", [tree], false, {
    maxFilesScanned: 5_000,
    maxResults: 2,
    timeBudgetMs: 10_000,
  });
  assert.equal(out.results.length, 2);
  assert.ok(out.note, "result cap must be flagged as partial");
});

test("content matching finds text inside small text files only when searchContent=true", async () => {
  const off = await searchFiles("secret invoice number", [tree], false);
  assert.equal(off.results.length, 0);

  const on = await searchFiles("secret invoice number", [tree], true);
  assert.equal(on.results.length, 1);
  assert.equal(on.results[0].matchType, "content");
  assert.ok(on.results[0].name === "notes.md");
});

// ── tool layer: access control ────────────────────────────────────────────────

test("search_local_files rejects roots outside workspace + grants", async () => {
  const result: any = await searchLocalFilesTool.call(
    { query: "invoice", searchContent: false, roots: [tree] } as any, // tree is NOT granted
    ctx
  );
  assert.equal(result.success, false);
  assert.match(result.error, /grant/i);
});

test("search_local_files searches the workspace by default", async () => {
  const marker = join(workspaceDir(), "fg-docs-needle-xyzzy.txt");
  writeFileSync(marker, "needle", "utf-8");
  try {
    const result: any = await searchLocalFilesTool.call(
      { query: "fg-docs-needle-xyzzy", searchContent: false } as any,
      ctx
    );
    assert.equal(result.success, true);
    assert.ok(result.data.resultCount >= 1);
    assert.ok(result.data.results.some((r: any) => r.name === "fg-docs-needle-xyzzy.txt"));
  } finally {
    try { unlinkSync(marker); } catch { /* best-effort */ }
  }
});

// ── read_pdf ──────────────────────────────────────────────────────────────────

test("capPdfText leaves short text untouched", () => {
  const { content, truncated } = capPdfText("short pdf text");
  assert.equal(content, "short pdf text");
  assert.equal(truncated, false);
});

test("read_pdf truncates at the 50k char cap with a (truncated) marker", async () => {
  // Inject a parser so we don't need a 50k-character PDF fixture
  _setPdfParserForTests(async () => ({ text: "A".repeat(PDF_CHAR_CAP + 10_000) }));
  const fixture = join(workspaceDir(), "fg-docs-big.pdf");
  writeFileSync(fixture, "%PDF-1.4 fake body", "utf-8"); // content irrelevant — parser is injected
  try {
    const result: any = await readPdfTool.call({ path: "fg-docs-big.pdf" } as any, ctx);
    assert.equal(result.success, true);
    assert.equal(result.data.truncated, true);
    assert.ok(result.data.content.includes(PDF_TRUNCATION_MARKER));
    assert.ok(result.data.content.length < PDF_CHAR_CAP + 500, "output must be capped near 50k chars");
  } finally {
    _setPdfParserForTests(null);
    try { unlinkSync(fixture); } catch { /* best-effort */ }
  }
});

test("read_pdf refuses paths outside workspace + grants and points to Folder Access", async () => {
  const outside = join(tree, "not-granted.pdf");
  writeFileSync(outside, "%PDF-1.4", "utf-8");
  const result: any = await readPdfTool.call({ path: outside } as any, ctx);
  assert.equal(result.success, false);
  assert.match(result.error, /Folder Access/i);
  assert.ok(existsSync(outside)); // untouched
});

test("read_pdf rejects non-PDF extensions", async () => {
  const txt = join(workspaceDir(), "fg-docs-not-a-pdf.txt");
  writeFileSync(txt, "hello", "utf-8");
  try {
    const result: any = await readPdfTool.call({ path: "fg-docs-not-a-pdf.txt" } as any, ctx);
    assert.equal(result.success, false);
    assert.match(result.error, /Not a PDF/i);
  } finally {
    try { unlinkSync(txt); } catch { /* best-effort */ }
  }
});
