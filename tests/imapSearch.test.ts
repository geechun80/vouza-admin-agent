// =============================================================================
// IMAP search translation (src/tools/imapSearch.ts)
//
// Contract: App-Password users read mail over IMAP, so the agent's Gmail-style
// queries must actually filter. Gmail servers get the query verbatim
// (X-GM-RAW); other servers get faithful IMAP criteria, and operators with no
// faithful equivalent are ignored rather than mistranslated.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { buildImapSearch } from "../src/tools/imapSearch.js";

const NOW = new Date(2026, 9, 1, 12, 0, 0).getTime(); // 2026-10-01 12:00 local
const DAY = 86_400_000;

describe("IMAP search — Gmail servers", () => {
  it("passes the whole query through as X-GM-RAW", () => {
    assert.deepEqual(buildImapSearch("from:dbs has:attachment newer_than:7d", true), {
      gmraw: "from:dbs has:attachment newer_than:7d",
    });
  });
  it("empty query lists everything", () => {
    assert.deepEqual(buildImapSearch("  ", true), { all: true });
  });
});

describe("IMAP search — other servers", () => {
  it("translates the common operators", () => {
    assert.deepEqual(buildImapSearch('from:bank@dbs.com subject:"credit card" is:unread', false, NOW), {
      from: "bank@dbs.com", subject: "credit card", seen: false,
    });
  });

  it("free words become a TEXT match — the 'find the email about X' case", () => {
    assert.deepEqual(buildImapSearch("insurance renewal", false, NOW), { text: "insurance renewal" });
  });

  it("relative and absolute dates", () => {
    const c = buildImapSearch("newer_than:7d", false, NOW);
    assert.equal(c.since!.getTime(), NOW - 7 * DAY);
    const d = buildImapSearch("after:2026/09/01 before:2026-09-30", false, NOW);
    assert.equal(d.since!.getFullYear(), 2026);
    assert.equal(d.since!.getMonth(), 8);
    assert.equal(d.before!.getDate(), 30);
  });

  it("is:read and is:starred", () => {
    assert.deepEqual(buildImapSearch("is:read", false), { seen: true });
    assert.deepEqual(buildImapSearch("is:starred", false), { flagged: true });
  });

  it("ignores operators with no faithful IMAP equivalent instead of mistranslating", () => {
    assert.deepEqual(buildImapSearch("has:attachment in:inbox label:work", false), { all: true });
    assert.deepEqual(buildImapSearch("-from:spam@x.com invoice", false), { text: "invoice" },
      "a negation must never turn into a positive match");
  });

  it("invalid dates are dropped, not guessed", () => {
    assert.deepEqual(buildImapSearch("after:yesterday newer_than:soon", false, NOW), { all: true });
  });
});
