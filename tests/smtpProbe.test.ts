// =============================================================================
// Tests — realSmtpProbe (Gmail App Password live verifier)
//
// All cases inject a stub transporterFactory so tests run offline with
// deterministic timing. No real network calls.
//
// Flat path (tests/smtpProbe.test.ts, not tests/probes/...) per the test
// script glob: `node --import tsx --test tests/*.test.ts`.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { realSmtpProbe } from "../src/orchestrator/probes/smtpProbe.js";

/** Build a fake transporter whose verify() resolves. */
function okTransporter(spy: { closed: number }) {
  return {
    verify: async () => true,
    close: () => { spy.closed++; },
  };
}

/** Build a fake transporter whose verify() rejects with a given error. */
function failingTransporter(err: any, spy: { closed: number }) {
  return {
    verify: async () => { throw err; },
    close: () => { spy.closed++; },
  };
}

/** Build a fake transporter whose verify() never resolves (for timeout tests). */
function hangingTransporter(spy: { closed: number }) {
  return {
    verify: () => new Promise<unknown>(() => {/* never resolves */}),
    close: () => { spy.closed++; },
  };
}

describe("realSmtpProbe — happy path", () => {
  it("returns ok:true when verify() resolves", async () => {
    const spy = { closed: 0 };
    const r = await realSmtpProbe("me@gmail.com", "abcdefghijklmnop", {
      transporterFactory: () => okTransporter(spy),
    });
    assert.equal(r.ok, true);
    assert.equal(spy.closed, 1, "transport must be closed exactly once");
  });
});

describe("realSmtpProbe — EAUTH (535 auth failed)", () => {
  it("returns doNotRetry:true with App Password rejection message + apppasswords URL", async () => {
    const spy = { closed: 0 };
    const err: any = new Error("Invalid login: 535-5.7.8 Username and Password not accepted");
    err.code = "EAUTH";
    const r = await realSmtpProbe("me@gmail.com", "abcdefghijklmnop", {
      transporterFactory: () => failingTransporter(err, spy),
    });
    assert.equal(r.ok, false);
    if (r.ok) return; // type guard
    assert.equal(r.doNotRetry, true);
    assert.match(r.error, /App Password/);
    assert.ok(r.suggestedFix, "suggestedFix must be present");
    assert.match(r.suggestedFix!, /myaccount\.google\.com\/apppasswords/);
    assert.equal(spy.closed, 1);
  });
});

describe("realSmtpProbe — connection timeout (ETIMEDOUT)", () => {
  it("returns doNotRetry:false with port-587 hint", async () => {
    const spy = { closed: 0 };
    const err: any = new Error("connect ETIMEDOUT");
    err.code = "ETIMEDOUT";
    const r = await realSmtpProbe("me@gmail.com", "abcdefghijklmnop", {
      transporterFactory: () => failingTransporter(err, spy),
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.doNotRetry, false);
    assert.match(r.suggestedFix ?? "", /587/);
    assert.equal(spy.closed, 1);
  });
});

describe("realSmtpProbe — generic unmapped error", () => {
  it("surfaces the code and message with doNotRetry:true", async () => {
    const spy = { closed: 0 };
    const err: any = new Error("Something weird happened");
    err.code = "EWHATEVER";
    const r = await realSmtpProbe("me@gmail.com", "abcdefghijklmnop", {
      transporterFactory: () => failingTransporter(err, spy),
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.doNotRetry, true);
    assert.match(r.error, /EWHATEVER/);
    assert.match(r.error, /Something weird happened/);
    assert.equal(spy.closed, 1);
  });
});

describe("realSmtpProbe — transport always closed", () => {
  it("calls close() even when verify() throws", async () => {
    const spy = { closed: 0 };
    const err: any = new Error("boom");
    err.code = "EAUTH";
    await realSmtpProbe("me@gmail.com", "abcdefghijklmnop", {
      transporterFactory: () => failingTransporter(err, spy),
    });
    assert.equal(spy.closed, 1);
  });

  it("calls close() even on timeout", async () => {
    const spy = { closed: 0 };
    await realSmtpProbe("me@gmail.com", "abcdefghijklmnop", {
      transporterFactory: () => hangingTransporter(spy),
      timeoutMs: 50,
    });
    assert.equal(spy.closed, 1);
  });
});

describe("realSmtpProbe — empty user short-circuits", () => {
  it("rejects before creating transport (no factory call)", async () => {
    let factoryCalls = 0;
    const r = await realSmtpProbe("", "abcdefghijklmnop", {
      transporterFactory: () => {
        factoryCalls++;
        return okTransporter({ closed: 0 });
      },
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.doNotRetry, true);
    assert.equal(factoryCalls, 0, "transporterFactory must not be invoked for empty user");
  });
});

describe("realSmtpProbe — empty pass short-circuits", () => {
  it("rejects before creating transport (no factory call)", async () => {
    let factoryCalls = 0;
    const r = await realSmtpProbe("me@gmail.com", "   ", {
      transporterFactory: () => {
        factoryCalls++;
        return okTransporter({ closed: 0 });
      },
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.doNotRetry, true);
    assert.match(r.suggestedFix ?? "", /apppasswords/);
    assert.equal(factoryCalls, 0, "transporterFactory must not be invoked for empty pass");
  });
});

describe("realSmtpProbe — timeout fires when verify() never resolves", () => {
  it("returns timeout error after the configured timeoutMs", async () => {
    const spy = { closed: 0 };
    const start = Date.now();
    const r = await realSmtpProbe("me@gmail.com", "abcdefghijklmnop", {
      transporterFactory: () => hangingTransporter(spy),
      timeoutMs: 50,
    });
    const elapsed = Date.now() - start;
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /timed out/i);
    assert.equal(r.doNotRetry, false);
    assert.ok(elapsed >= 40, `elapsed should be ~timeoutMs, got ${elapsed}ms`);
    assert.ok(elapsed < 2000, `elapsed should be well under default 10s, got ${elapsed}ms`);
    assert.equal(spy.closed, 1);
  });
});
