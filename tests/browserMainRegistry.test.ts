// =============================================================================
// Tests — Phase 4: main agent browser tools + SSRF allowlist extension
//
// Covers:
//   • All 6 browser_* tools registered in the MAIN dashboard chat registry
//   • Launcher (channel-listener) registry assembly registers the same tools
//   • Allowlist merge logic: defaults + BROWSER_ALLOWED_DOMAINS env +
//     config.tools.browser.allowedDomains
//   • Blocked-domain error tells the user HOW to allow the domain
//   • localhost / private IPs remain hard-blocked even when a user adds them
//     to the config allowlist (hard block wins)
//   • CHAT_SYSTEM_PROMPT carries web-browsing guidance with no-retry rule
// =============================================================================

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "fs/promises";
import path from "path";
import {
  checkDomainAllowed,
  buildAllowlist,
  configuredBrowserDomains,
} from "../src/tools/browser/manager.js";
import { buildRegistry, CHAT_SYSTEM_PROMPT } from "../src/dashboard/api/chat.js";

const BROWSER_TOOL_NAMES = [
  "browser_navigate",
  "browser_click",
  "browser_fill",
  "browser_extract_text",
  "browser_screenshot",
  "browser_wait_for",
];

// Snapshot + restore the env var so tests don't leak into each other
let envBackup: string | undefined;
before(() => { envBackup = process.env.BROWSER_ALLOWED_DOMAINS; });
after(() => {
  if (envBackup === undefined) delete process.env.BROWSER_ALLOWED_DOMAINS;
  else process.env.BROWSER_ALLOWED_DOMAINS = envBackup;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Registry assembly — main agent gets the browser tools
// ─────────────────────────────────────────────────────────────────────────────

describe("main registry assembly — browser tools", () => {
  it("dashboard chat registry contains all 6 browser tools", () => {
    const registry = buildRegistry();
    const names = new Set(registry.getAll().map((t: any) => t.name));
    for (const toolName of BROWSER_TOOL_NAMES) {
      assert.ok(names.has(toolName), `expected ${toolName} in dashboard chat registry`);
    }
  });

  it("launcher registry (channel listeners) registers all 6 browser tools", async () => {
    // launchAgent() boots listeners + health monitors — too heavy for a unit
    // test, so assert on the registry-assembly source instead.
    const src = await readFile(
      path.resolve(process.cwd(), "src/bridge/launcher.ts"), "utf-8",
    );
    for (const ident of [
      "browserNavigateTool", "browserClickTool", "browserFillTool",
      "browserExtractTextTool", "browserScreenshotTool", "browserWaitForTool",
    ]) {
      assert.ok(
        new RegExp(`registry\\.register\\(${ident}`).test(src),
        `expected launcher.ts to register ${ident}`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Allowlist merge logic — config + env + defaults
// ─────────────────────────────────────────────────────────────────────────────

describe("allowlist merge — config + env + defaults", () => {
  it("merges defaults, env var, and config domains (deduped, lowercased)", () => {
    process.env.BROWSER_ALLOWED_DOMAINS = "from-env.com, Other-Env.io";
    const list = buildAllowlist(["From-Config.sg", "github.com", "  "]);
    assert.ok(list.includes("github.com"),    "default domain present");
    assert.ok(list.includes("from-env.com"),  "env domain present");
    assert.ok(list.includes("other-env.io"),  "env domain lowercased");
    assert.ok(list.includes("from-config.sg"), "config domain lowercased");
    assert.equal(list.filter(d => d === "github.com").length, 1, "deduped");
  });

  it("checkDomainAllowed honours config-extended domains and their subdomains", () => {
    delete process.env.BROWSER_ALLOWED_DOMAINS;
    assert.equal(checkDomainAllowed("https://example.org/page", ["example.org"]).allowed, true);
    assert.equal(checkDomainAllowed("https://docs.example.org/", ["example.org"]).allowed, true);
    // Same domain without the config extension stays denied (deny-by-default)
    assert.equal(checkDomainAllowed("https://example.org/").allowed, false);
  });

  it("default allowlist still works with no env and no config", () => {
    delete process.env.BROWSER_ALLOWED_DOMAINS;
    assert.equal(checkDomainAllowed("https://github.com/vouza").allowed, true);
    assert.equal(checkDomainAllowed("https://api.github.com/repos").allowed, true);
    assert.equal(checkDomainAllowed("https://totally-random-site.xyz/").allowed, false);
  });

  it("configuredBrowserDomains reads context safely (missing/malformed → [])", () => {
    assert.deepEqual(configuredBrowserDomains(undefined), []);
    assert.deepEqual(configuredBrowserDomains({}), []);
    assert.deepEqual(configuredBrowserDomains({ config: { tools: {} } }), []);
    assert.deepEqual(
      configuredBrowserDomains({ config: { tools: { browser: { allowedDomains: "nope" } } } }),
      [],
    );
    assert.deepEqual(
      configuredBrowserDomains({ config: { tools: { browser: { allowedDomains: ["a.com", 42, "b.com"] } } } }),
      ["a.com", "b.com"],
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Blocked-domain error message — actionable, no-retry
// ─────────────────────────────────────────────────────────────────────────────

describe("blocked-domain error message", () => {
  it("mentions how to allow the domain (config + env) and says not to retry", () => {
    delete process.env.BROWSER_ALLOWED_DOMAINS;
    const result = checkDomainAllowed("https://my-shop.example.net/");
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("allowedDomains"),
      "error should point at tools.browser.allowedDomains");
    assert.ok(result.reason!.includes("BROWSER_ALLOWED_DOMAINS"),
      "error should mention the env var alternative");
    assert.ok(/do not retry/i.test(result.reason!),
      "error should instruct the agent not to retry");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Hard block wins — localhost / private IPs blocked even when allowlisted
// ─────────────────────────────────────────────────────────────────────────────

describe("SSRF hard block beats any allowlist entry", () => {
  const sneakyConfig = [
    "localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1",
    "172.20.0.1", "169.254.10.10", "0.0.0.0", "::1", "internal.local",
  ];

  it("localhost stays blocked even if user adds it to config", () => {
    const r = checkDomainAllowed("http://localhost:3456/admin", sneakyConfig);
    assert.equal(r.allowed, false);
    assert.ok(/SSRF/i.test(r.reason!), "reason mentions SSRF prevention");
  });

  it("loopback and private IPv4 ranges stay blocked even if in config", () => {
    for (const url of [
      "http://127.0.0.1/", "http://127.0.0.2/", "http://10.0.0.5/",
      "http://192.168.1.1/", "http://172.20.0.1/", "http://169.254.10.10/",
      "http://0.0.0.0/",
    ]) {
      assert.equal(checkDomainAllowed(url, sneakyConfig).allowed, false, `${url} must be blocked`);
    }
  });

  it("IPv6 loopback and .local hosts stay blocked even if in config", () => {
    assert.equal(checkDomainAllowed("http://[::1]:8080/", sneakyConfig).allowed, false);
    assert.equal(checkDomainAllowed("http://internal.local/", sneakyConfig).allowed, false);
  });

  it("env var cannot unlock localhost either", () => {
    process.env.BROWSER_ALLOWED_DOMAINS = "localhost,127.0.0.1";
    assert.equal(checkDomainAllowed("http://localhost/").allowed, false);
    assert.equal(checkDomainAllowed("http://127.0.0.1/").allowed, false);
    delete process.env.BROWSER_ALLOWED_DOMAINS;
  });

  it("invalid URLs are rejected", () => {
    assert.equal(checkDomainAllowed("not a url at all").allowed, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. System prompt — web browsing guidance
// ─────────────────────────────────────────────────────────────────────────────

describe("CHAT_SYSTEM_PROMPT — web browsing section", () => {
  it("documents the browser tools, the allowlist, and the no-retry rule", () => {
    assert.ok(CHAT_SYSTEM_PROMPT.includes("Web Browsing"));
    assert.ok(CHAT_SYSTEM_PROMPT.includes("browser_navigate"));
    assert.ok(CHAT_SYSTEM_PROMPT.includes("tools.browser.allowedDomains"));
    assert.ok(/do NOT\s+retry/i.test(CHAT_SYSTEM_PROMPT));
  });

  it("contains no backticks (Rules 55-56 — template-literal safety)", () => {
    assert.equal(CHAT_SYSTEM_PROMPT.includes("`"), false);
  });
});
