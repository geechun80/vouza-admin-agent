// =============================================================================
// Tests — Google pipeline (SA + Gmail App Password paths)
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import pino from "pino";
import { makeGooglePipeline } from "../src/orchestrator/pipelines/google.js";
import { runPipeline } from "../src/orchestrator/runner.js";

const silent = pino({ level: "silent" });

const VALID_SA = {
  type: "service_account",
  project_id: "p",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  client_email: "x@p.iam.gserviceaccount.com",
};

function makeCtx() {
  return { integration: "google_calendar", logger: silent, config: {} as any };
}

describe("google pipeline — service account happy path", () => {
  it("succeeds end-to-end with mocked token exchange", async () => {
    let savedCalled = 0;
    let listed = 0;
    const p = makeGooglePipeline({
      exchangeServiceAccount: async () => ({ access_token: "tok" }),
      saveCredentials: async () => { savedCalled++; },
      listOneEvent: async () => { listed++; return { summary: "Standup" }; },
    });
    const r = await runPipeline(
      p,
      { credentials: { googleSaKey: JSON.stringify(VALID_SA) }, variant: "google_calendar" },
      makeCtx(),
    );
    assert.equal(r.success, true, r.error ?? "");
    assert.equal(savedCalled, 1);
    assert.equal(listed, 1);
    assert.match((r.data as any).note ?? "", /Standup/);
  });
});

describe("google pipeline — wrong file (OAuth client)", () => {
  it("fails at detect with doNotRetry", async () => {
    const p = makeGooglePipeline({});
    const r = await runPipeline(
      p,
      {
        credentials: { googleSaKey: JSON.stringify({ installed: { client_id: "x" } }) },
        variant: "google_calendar",
      },
      makeCtx(),
    );
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "detect");
    assert.equal(r.doNotRetry, true);
    assert.match(r.error!, /OAuth Client ID/);
  });
});

describe("google pipeline — custom SMTP creds rejected at detect", () => {
  it("smtpHost-shaped credentials fail fast with a redirect to integration=smtp", async () => {
    const p = makeGooglePipeline({});
    const r = await runPipeline(
      p,
      {
        credentials: { smtpHost: "smtp.mail.yahoo.com", smtpUser: "me@yahoo.com", smtpPass: "x" },
        variant: "gmail",
      },
      { integration: "gmail", logger: silent, config: {} as any },
    );
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "detect");
    assert.equal(r.doNotRetry, true);
    assert.match(r.error!, /custom SMTP credentials/);
    assert.match(r.suggestedFix!, /integration="smtp"/);
  });
});

describe("google pipeline — missing private_key", () => {
  it("fails at validate listing the missing field", async () => {
    const broken = { ...VALID_SA } as any;
    delete broken.private_key;
    const p = makeGooglePipeline({});
    const r = await runPipeline(
      p,
      { credentials: { googleSaKey: JSON.stringify(broken) }, variant: "google_calendar" },
      makeCtx(),
    );
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "validate");
    assert.match(r.error!, /private_key/);
  });
});

describe("google pipeline — malformed JSON", () => {
  it("fails at detect", async () => {
    const p = makeGooglePipeline({});
    const r = await runPipeline(
      p,
      { credentials: { googleSaKey: "{not valid json" }, variant: "google_calendar" },
      makeCtx(),
    );
    assert.equal(r.success, false);
    assert.equal(r.stepReached, "detect");
    assert.match(r.error!, /not valid JSON/);
  });
});

describe("google pipeline — clock-skew retry", () => {
  it("invalid_grant on first try then success on fallback", async () => {
    let calls = 0;
    const p = makeGooglePipeline({
      exchangeServiceAccount: async () => {
        calls++;
        if (calls === 1) throw new Error("invalid_grant: jwt expired");
        return { access_token: "ok" };
      },
      listOneEvent: async () => null,
      sleep: async () => {}, // skip 2s wait in tests
    });
    const r = await runPipeline(
      p,
      { credentials: { googleSaKey: JSON.stringify(VALID_SA) }, variant: "google_calendar" },
      makeCtx(),
    );
    assert.equal(r.success, true, r.error ?? "");
    assert.equal(calls, 2);
  });
});

describe("google pipeline — Gmail App Password happy path", () => {
  it("16-char password + valid email passes SMTP probe", async () => {
    let probed = 0;
    let sent = 0;
    const p = makeGooglePipeline({
      smtpProbe: async (host, port, _user, _pass) => {
        probed++;
        assert.equal(host, "smtp.gmail.com");
        assert.equal(port, 587);
      },
      sendSelfEmail: async () => { sent++; },
    });
    const r = await runPipeline(
      p,
      {
        credentials: { gmailUser: "me@gmail.com", gmailPass: "abcd efgh ijkl mnop" },
        variant: "gmail",
      },
      makeCtx(),
    );
    assert.equal(r.success, true, r.error ?? "");
    assert.equal(probed, 1);
    assert.equal(sent, 1);
  });
});
