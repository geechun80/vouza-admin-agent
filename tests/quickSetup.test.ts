// =============================================================================
// Quick Setup logic (src/setup/quickSetup.ts)
//
// Contract: the user pastes an AI key and an email + app password; setup works
// out the provider/servers itself, verifies for real (auth-gated endpoints,
// real IMAP + SMTP logins — never "will verify on first use"), and explains
// every failure in one actionable sentence.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  aiCandidatesForKey,
  verifyAiKey,
  detectAndVerifyAiKey,
  aiConfigPatch,
  emailPresetFor,
  detectEmailPreset,
  verifyEmailLogin,
  explainEmailError,
  emailConfigPatch,
  autostartCommand,
  type EmailLogin,
} from "../src/setup/quickSetup.js";

/** fetch stub: maps URL substrings → status codes; records calls. */
function fakeFetch(routes: Record<string, number | Error>) {
  const calls: Array<{ url: string; init?: any }> = [];
  const fn = (async (url: any, init?: any) => {
    calls.push({ url: String(url), init });
    const hit = Object.entries(routes).find(([k]) => String(url).includes(k));
    if (!hit) throw new Error(`unexpected fetch ${url}`);
    if (hit[1] instanceof Error) throw hit[1];
    return new Response("{}", { status: hit[1] });
  }) as typeof fetch;
  return { fn, calls };
}

const KEY_OR  = "sk-or-v1-" + "a".repeat(40);
const KEY_ANT = "sk-ant-api03-" + "b".repeat(40);
const KEY_SK  = "sk-" + "c".repeat(48);

describe("Quick Setup — AI key detection", () => {
  it("recognises each provider by key shape", () => {
    assert.equal(aiCandidatesForKey(KEY_OR)[0].provider, "openrouter");
    assert.equal(aiCandidatesForKey(KEY_ANT)[0].provider, "anthropic");
    assert.equal(aiCandidatesForKey("AIza" + "d".repeat(35))[0].provider, "google");
    assert.equal(aiCandidatesForKey("xai-" + "e".repeat(40))[0].provider, "xai");
    assert.deepEqual(aiCandidatesForKey("sk-proj-" + "f".repeat(40)).map((c) => c.provider), ["openai"]);
  });

  it("ambiguous sk- keys try OpenAI then DeepSeek", () => {
    assert.deepEqual(aiCandidatesForKey(KEY_SK).map((c) => c.provider), ["openai", "deepseek"]);
  });

  it("unknown shapes return no candidates", () => {
    assert.deepEqual(aiCandidatesForKey("hello-world-1234567890"), []);
  });
});

describe("Quick Setup — AI key verification is auth-gated (Rule 66)", () => {
  it("OpenRouter is checked on /api/v1/key, never the public /models list", async () => {
    const f = fakeFetch({ "openrouter.ai/api/v1/key": 200 });
    assert.equal(await verifyAiKey(aiCandidatesForKey(KEY_OR)[0], KEY_OR, f.fn), true);
    assert.ok(f.calls.every((c) => !c.url.includes("/models")), "public endpoint must not be used");
  });

  it("401/403/400 mean rejected; 5xx and network errors mean 'couldn't tell'", async () => {
    const c = aiCandidatesForKey(KEY_ANT)[0];
    assert.equal(await verifyAiKey(c, KEY_ANT, fakeFetch({ anthropic: 401 }).fn), false);
    assert.equal(await verifyAiKey(c, KEY_ANT, fakeFetch({ anthropic: 403 }).fn), false);
    assert.ok(await verifyAiKey(c, KEY_ANT, fakeFetch({ anthropic: 503 }).fn) instanceof Error);
    assert.ok(await verifyAiKey(c, KEY_ANT, fakeFetch({ anthropic: new Error("ECONNRESET") }).fn) instanceof Error);
  });

  it("detect: an sk- key OpenAI rejects but DeepSeek accepts is DeepSeek", async () => {
    const r = await detectAndVerifyAiKey(KEY_SK, fakeFetch({ "api.openai.com": 401, "api.deepseek.com": 200 }).fn);
    assert.equal(r.ok && r.candidate.provider, "deepseek");
  });

  it("detect: rejected everywhere → plain-language error naming the providers tried", async () => {
    const r = await detectAndVerifyAiKey(KEY_SK, fakeFetch({ "api.openai.com": 401, "api.deepseek.com": 401 }).fn);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /ChatGPT \(OpenAI\) \/ DeepSeek rejected this key/);
  });

  it("detect: network trouble is reported as network, not as a bad key", async () => {
    const r = await detectAndVerifyAiKey(KEY_OR, fakeFetch({ openrouter: new Error("getaddrinfo ENOTFOUND") }).fn);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /Couldn't reach/);
  });

  it("detect: short or unrecognised input fails fast without any network call", async () => {
    const f = fakeFetch({});
    assert.equal((await detectAndVerifyAiKey("sk-or-short", f.fn)).ok, false);
    assert.equal((await detectAndVerifyAiKey("totally-not-a-key-1234567890", f.fn)).ok, false);
    assert.equal(f.calls.length, 0);
  });

  it("config patch writes the slot the loader reads, and OpenRouter tiers", () => {
    const p = aiConfigPatch(aiCandidatesForKey(KEY_OR)[0], `  ${KEY_OR}  `);
    assert.equal(p.credentials.openrouterApiKey, KEY_OR, "trimmed");
    assert.equal(p.agent.provider, "openrouter");
    assert.ok(p.agent.openrouterTiers.balanced);
    const g = aiConfigPatch(aiCandidatesForKey("AIza" + "d".repeat(35))[0], "AIza" + "d".repeat(35));
    assert.ok(g.credentials.googleApiKey, "loader reads credentials.googleApiKey for Gemini");
  });
});

describe("Quick Setup — email provider detection", () => {
  it("knows the big providers from the address", () => {
    assert.equal(emailPresetFor("me@gmail.com").id, "gmail");
    assert.equal(emailPresetFor("Me@Hotmail.com").id, "outlook");
    assert.equal(emailPresetFor("me@yahoo.com.sg").id, "yahoo");
    assert.equal(emailPresetFor("me@icloud.com").smtpHost, "smtp.mail.me.com");
  });

  it("custom domains are guessed (and flagged so the UI shows server fields)", () => {
    const p = emailPresetFor("anna@smallbiz.sg");
    assert.equal(p.guessed, true);
    assert.equal(p.imapHost, "imap.smallbiz.sg");
  });

  it("MX records reveal Google Workspace on a custom domain", async () => {
    const p = await detectEmailPreset("anna@acme.sg", async () => [
      { exchange: "alt1.aspmx.l.google.com", priority: 5 },
      { exchange: "aspmx.l.google.com", priority: 1 },
    ]);
    assert.equal(p.id, "gmail");
    assert.equal(p.guessed, false);
    assert.match(p.label, /acme\.sg/);
  });

  it("MX records reveal Microsoft 365", async () => {
    const p = await detectEmailPreset("bo@corp.com", async () => [{ exchange: "corp-com.mail.protection.outlook.com", priority: 0 }]);
    assert.equal(p.id, "outlook");
  });

  it("unknown MX or DNS failure keeps the guess", async () => {
    assert.equal((await detectEmailPreset("x@odd.net", async () => [{ exchange: "mx.odd.net", priority: 1 }])).guessed, true);
    assert.equal((await detectEmailPreset("x@odd.net", async () => { throw new Error("ENODATA"); })).guessed, true);
  });

  it("known providers never hit DNS", async () => {
    let called = false;
    await detectEmailPreset("me@gmail.com", async () => { called = true; return []; });
    assert.equal(called, false);
  });
});

describe("Quick Setup — email verification is real and explains failures", () => {
  const login: EmailLogin = {
    address: "user@example.com", password: "fake fake fake fake",
    imapHost: "imap.example.com", imapPort: 993, smtpHost: "smtp.example.com", smtpPort: 587,
  };

  it("success returns the unread count, and Gmail app-password spaces are stripped", async () => {
    let seenPass = "";
    const r = await verifyEmailLogin(login, "gmail", {
      imap: async (l) => { seenPass = l.password; return { unread: 12 }; },
      smtp: async () => {},
    });
    assert.deepEqual(r, { ok: true, unread: 12 });
    assert.equal(seenPass, "fakefakefakefake");
  });

  it("checks BOTH reading (IMAP) and sending (SMTP)", async () => {
    const r = await verifyEmailLogin(login, "gmail", {
      imap: async () => ({ unread: 0 }),
      smtp: async () => { throw Object.assign(new Error("Invalid login"), { code: "EAUTH" }); },
    });
    assert.equal(r.ok, false);
  });

  it("Gmail wrong password → explains App Passwords", () => {
    const e = explainEmailError({ authenticationFailed: true, responseText: "Invalid credentials (Failure)" }, "gmail");
    assert.equal(e.field, "password");
    assert.match(e.error, /App Password/);
  });

  it("Outlook auth failure → honest about Microsoft sign-in", () => {
    assert.match(explainEmailError({ message: "AUTHENTICATE failed." }, "outlook").error, /Microsoft's own sign-in/);
  });

  it("DNS failure → server field; timeouts → network", () => {
    assert.equal(explainEmailError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND imap.smallbiz.sg" }, "other").field, "server");
    assert.equal(explainEmailError({ code: "ETIMEDOUT", message: "IMAP login timed out" }, "other").field, "network");
  });

  it("empty password or bad address fails before any network call", async () => {
    let called = false;
    const probes = { imap: async () => { called = true; return { unread: 0 }; }, smtp: async () => { called = true; } };
    assert.equal((await verifyEmailLogin({ ...login, password: "  " }, "gmail", probes)).ok, false);
    assert.equal((await verifyEmailLogin({ ...login, address: "not-an-email" }, "gmail", probes)).ok, false);
    assert.equal(called, false);
  });
});

describe("Quick Setup — saved config shape", () => {
  const base = { password: "not-a-real-password", imapHost: "imap.example.com", imapPort: 993, smtpHost: "smtp.example.com", smtpPort: 465 };

  it("Gmail keeps the existing Gmail path the loader already maps", () => {
    const p = emailConfigPatch(emailPresetFor("me@gmail.com"), { address: "me@gmail.com", ...base, password: "fake fake" });
    assert.deepEqual(p.channels.email.config, { gmailUser: "me@gmail.com", gmailPass: "fakefake" });
    assert.equal(p.tools, undefined);
  });

  it("other providers use tools.smtp with both servers", () => {
    const p = emailConfigPatch(emailPresetFor("me@yahoo.com"), { address: "me@yahoo.com", ...base });
    assert.equal(p.channels.email.provider, "smtp");
    assert.deepEqual(p.tools.smtp, { host: "smtp.example.com", port: "465", user: "me@yahoo.com", pass: "not-a-real-password", imapHost: "imap.example.com", imapPort: "993" });
  });

  it("autostart uses the same no-admin logon task as install-autostart.bat", () => {
    const c = autostartCommand("C:\\Agent");
    assert.equal(c.cmd, "schtasks.exe");
    assert.deepEqual(c.args.slice(c.args.indexOf("/sc"), c.args.indexOf("/sc") + 4), ["/sc", "ONLOGON", "/rl", "LIMITED"]);
    assert.ok(c.args.includes('wscript.exe "C:\\Agent\\start-background.vbs"'));
  });
});
