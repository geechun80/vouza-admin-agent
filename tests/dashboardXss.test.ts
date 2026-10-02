// =============================================================================
// Dashboard XSS hardening.
//
// The chat shows the AI's replies as Markdown, and a reply can be steered by
// text the agent read (an email, a web page, a document). That text must never
// be able to add HTML attributes or tags to the dashboard page, which can call
// every local API (keys, backup, settings).
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

function loadRenderMd(): (t: string) => string {
  const src = readFileSync("src/dashboard/public/app.js", "utf8");
  const start = src.indexOf("function renderMd(t) {");
  let depth = 0;
  let i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return new Function(`${src.slice(start, i + 1)}; return renderMd;`)() as (t: string) => string;
}

const renderMd = loadRenderMd();

/** Every tag the renderer may emit, with only the attributes it sets itself. */
const ALLOWED_TAG = /^<(\/?(strong|em|br|ul|ol|li|div|span|code|a)\b[^>]*)>$/;
const ALLOWED_A = /^<a href="https?:\/\/[^"<>\s]*" target="_blank" rel="noopener noreferrer" class="md-link">$/;

function assertSafe(input: string): void {
  const html = renderMd(input);
  for (const tag of html.match(/<[^>]*>/g) ?? []) {
    assert.match(tag, ALLOWED_TAG, `unexpected tag ${tag} for ${JSON.stringify(input)}`);
    if (tag.startsWith("<a ")) assert.match(tag, ALLOWED_A, `unsafe link ${tag}`);
    assert.doesNotMatch(tag, /\son\w+=/i, `event handler in ${tag}`);
  }
  // (the words "javascript:" may appear as plain text — links are https-only, checked above)
  assert.doesNotMatch(html, /<script/i);
}

describe("chat Markdown can't inject HTML", () => {
  const attacks = [
    '[x](https://a.com/"onmouseover="alert(1))',
    'https://a.com/"autofocus=""tabindex="0"onfocus="location=1',
    "[a](https://a.com/'onfocus='x')",
    'https://a.com/`x`"onfocus=`y`',
    "see `https://a.com/x\"onfocus=1` now",
    "**https://a.com/\"onfocus=1**",
    '"https://quoted.com" <script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    "[click](javascript:alert(1))",
    "- [x](https://a.com/\"onclick=\"1)\n1. https://b.com/'x",
    "\u00000\u0000 placeholder look-alike https://a.com/\u0000",
  ];
  for (const a of attacks) it(`neutralises ${JSON.stringify(a).slice(0, 50)}`, () => assertSafe(a));

  it("still renders normal formatting and links", () => {
    const html = renderMd("**Bold** and `code` and [Docs](https://example.com/a?b=1&c=2). Go to https://myaccount.google.com/.");
    assert.match(html, /<strong>Bold<\/strong>/);
    assert.match(html, /<code class="md-code">code<\/code>/);
    assert.match(html, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2"[^>]*>Docs ↗<\/a>/);
    assert.match(html, /<a href="https:\/\/myaccount\.google\.com\/"[^>]*>https:\/\/myaccount\.google\.com\/ ↗<\/a>\./);
  });
});

describe("dashboard security headers", () => {
  it("only lets the page talk to this server and forbids framing", () => {
    const server = readFileSync("src/dashboard/api/server.ts", "utf8");
    assert.match(server, /"connect-src 'self'"/);
    assert.match(server, /"frame-ancestors 'none'"/);
    assert.match(server, /"object-src 'none'"/);
    assert.match(server, /res\.setHeader\("Content-Security-Policy", DASHBOARD_CSP\)/);
    assert.match(server, /res\.setHeader\("X-Frame-Options", "DENY"\)/);
  });

  it("the dashboard loads nothing from other sites (so the policy can stay strict)", () => {
    for (const f of ["index.html", "app.js", "app.css"]) {
      const text = readFileSync(`src/dashboard/public/${f}`, "utf8");
      assert.doesNotMatch(text, /<script[^>]+src="https?:|<link[^>]+href="https?:[^"]+\.css|fetch\(['"`]https?:|url\(['"]?https?:/);
    }
  });
});
