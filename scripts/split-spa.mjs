// =============================================================================
// Phase 5 (A5) — one-shot SPA split: index.html → index.html + app.css + app.js
//
// Why a script: the extraction must be byte-for-byte (7.4k lines of CSS/JS
// with template literals, emoji, and regex strings — any manual retype risks
// silent corruption). This script slices the exact bytes and replaces the
// blocks with versioned references.
//
// Run once from the repo root:   node scripts/split-spa.mjs
// Idempotent: re-running after the split is a no-op (exit 0).
//
// Safety checks before writing anything:
//   • exactly ONE <style>…</style> block and ONE bare <script>…</script> block
//   • no nested "</script>" inside the extracted JS
//   • the JS contains no server-side injection markers (server.ts only ever
//     sendFile()s index.html — verified, no templating — but we re-check)
//
// The replacement <script> tag deliberately has NO defer and sits at the exact
// position of the old inline block (end of <body>): an external script there
// executes at the same point in document parsing as the inline script did, so
// ordering semantics are preserved exactly. ?v=2 is the cache-busting belt;
// the no-cache headers for /app.js + /app.css in server.ts are the suspenders
// (Rule 64 extension).
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const PUB   = resolve(process.cwd(), "src", "dashboard", "public");
const HTML  = resolve(PUB, "index.html");
const CSS   = resolve(PUB, "app.css");
const JS    = resolve(PUB, "app.js");

const lineCount = (s) => s.split("\n").length;
const countOccurrences = (haystack, needle) => {
  let n = 0, i = -1;
  while ((i = haystack.indexOf(needle, i + 1)) !== -1) n++;
  return n;
};

const html = readFileSync(HTML, "utf8");

// ── Idempotency: already split? ──────────────────────────────────────────────
if (!html.includes("<style>") && html.includes('href="/app.css')) {
  console.log("✓ Already split — index.html has no <style> block and references app.css. Nothing to do.");
  process.exit(0);
}

// ── Sanity checks ────────────────────────────────────────────────────────────
const fail = (msg) => { console.error(`✗ ABORT (nothing written): ${msg}`); process.exit(1); };

if (countOccurrences(html, "<style>")   !== 1) fail("expected exactly one <style> tag");
if (countOccurrences(html, "</style>")  !== 1) fail("expected exactly one </style> tag");
if (countOccurrences(html, "<script>")  !== 1) fail("expected exactly one bare <script> tag");
if (countOccurrences(html, "</script>") !== 1) fail("expected exactly one </script> tag (nested </script> inside a template literal would break this split)");
if (countOccurrences(html, "<script ")  !== 0) fail("found an attributed <script ...> tag — script extraction logic assumes a single bare <script>");
if (existsSync(CSS) || existsSync(JS))         fail("app.css or app.js already exists but index.html still has inline blocks — resolve manually");

const beforeLines = lineCount(html);

// ── Extract CSS (byte-for-byte slice between the tags) ───────────────────────
const sOpen  = html.indexOf("<style>");
const sClose = html.indexOf("</style>");
if (sClose < sOpen) fail("</style> appears before <style>");
const css = html.slice(sOpen + "<style>".length, sClose);

let out = html.slice(0, sOpen)
        + '<link rel="stylesheet" href="/app.css?v=2">'
        + html.slice(sClose + "</style>".length);

// ── Extract JS (byte-for-byte slice between the tags) ────────────────────────
const jOpen  = out.indexOf("<script>");
const jClose = out.indexOf("</script>");
if (jClose < jOpen) fail("</script> appears before <script>");
const js = out.slice(jOpen + "<script>".length, jClose);

// Server-side injection marker check (server.ts uses sendFile — no templating —
// but guard against future regressions before externalizing the JS).
for (const marker of ["{{", "<%", "__INJECT"]) {
  if (js.includes(marker)) fail(`extracted JS contains possible server-injection marker "${marker}" — review before splitting`);
}

out = out.slice(0, jOpen)
    + '<script src="/app.js?v=2"></script>'
    + out.slice(jClose + "</script>".length);

// ── Write all three files ────────────────────────────────────────────────────
writeFileSync(CSS, css, "utf8");
writeFileSync(JS, js, "utf8");
writeFileSync(HTML, out, "utf8");

// ── Report ───────────────────────────────────────────────────────────────────
console.log("✓ Split complete (byte-for-byte slices, no reformatting):");
console.log(`    index.html : ${beforeLines} → ${lineCount(out)} lines`);
console.log(`    app.css    : ${lineCount(css)} lines`);
console.log(`    app.js     : ${lineCount(js)} lines`);
console.log(`    sum check  : ${lineCount(out) + lineCount(css) + lineCount(js)} ≈ ${beforeLines} + 4 tag/blank-line deltas`);
console.log("  Next: npm run build (copies public/ → dist/), then hard-reload the dashboard.");
