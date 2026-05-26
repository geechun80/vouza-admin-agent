// =============================================================================
// Tests — Integration name canonicalization
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  canonicalizeIntegrationName,
  knownCanonicalNames,
} from "../src/orchestrator/canonicalize.js";
import { getPipeline } from "../src/orchestrator/index.js";

describe("canonicalizeIntegrationName — exact canonical keys pass through", () => {
  it("'gmail' → 'gmail'", () => {
    assert.equal(canonicalizeIntegrationName("gmail"), "gmail");
  });
  it("'google_calendar' (underscore) → 'google_calendar'", () => {
    assert.equal(canonicalizeIntegrationName("google_calendar"), "google_calendar");
  });
  it("'telegram' → 'telegram'", () => {
    assert.equal(canonicalizeIntegrationName("telegram"), "telegram");
  });
  it("'whatsapp' → 'whatsapp'", () => {
    assert.equal(canonicalizeIntegrationName("whatsapp"), "whatsapp");
  });
});

describe("canonicalizeIntegrationName — separator variants", () => {
  it("space variant 'google calendar' → 'google_calendar'", () => {
    assert.equal(canonicalizeIntegrationName("google calendar"), "google_calendar");
  });
  it("hyphen variant 'google-calendar' → 'google_calendar'", () => {
    assert.equal(canonicalizeIntegrationName("google-calendar"), "google_calendar");
  });
  it("camel-case-ish 'GoogleCalendar' → 'google_calendar'", () => {
    // No internal separator — must be matched as the joined alias.
    assert.equal(canonicalizeIntegrationName("GoogleCalendar"), "google_calendar");
  });
  it("collapses repeated separators 'google___calendar' → 'google_calendar'", () => {
    assert.equal(canonicalizeIntegrationName("google___calendar"), "google_calendar");
  });
});

describe("canonicalizeIntegrationName — casual aliases", () => {
  it("'gcal' → 'google_calendar'", () => {
    assert.equal(canonicalizeIntegrationName("gcal"), "google_calendar");
  });
  it("'google cal' → 'google_calendar'", () => {
    assert.equal(canonicalizeIntegrationName("google cal"), "google_calendar");
  });
  it("'tg' → 'telegram'", () => {
    assert.equal(canonicalizeIntegrationName("tg"), "telegram");
  });
  it("'wa' → 'whatsapp'", () => {
    assert.equal(canonicalizeIntegrationName("wa"), "whatsapp");
  });
  it("'whatsapp web' → 'whatsapp'", () => {
    assert.equal(canonicalizeIntegrationName("whatsapp web"), "whatsapp");
  });
});

describe("canonicalizeIntegrationName — case insensitivity and whitespace", () => {
  it("'WhatsApp' (mixed case) → 'whatsapp'", () => {
    assert.equal(canonicalizeIntegrationName("WhatsApp"), "whatsapp");
  });
  it("'  Gmail  ' (surrounding whitespace) → 'gmail'", () => {
    assert.equal(canonicalizeIntegrationName("  Gmail  "), "gmail");
  });
  it("'GMAIL' all-caps → 'gmail'", () => {
    assert.equal(canonicalizeIntegrationName("GMAIL"), "gmail");
  });
});

describe("canonicalizeIntegrationName — rejects garbage", () => {
  it("empty string → null", () => {
    assert.equal(canonicalizeIntegrationName(""), null);
  });
  it("whitespace-only → null", () => {
    assert.equal(canonicalizeIntegrationName("   "), null);
  });
  it("unknown name → null", () => {
    assert.equal(canonicalizeIntegrationName("definitely-not-an-integration"), null);
  });
  it("non-string input → null", () => {
    assert.equal(canonicalizeIntegrationName(null as any), null);
    assert.equal(canonicalizeIntegrationName(undefined as any), null);
    assert.equal(canonicalizeIntegrationName(123 as any), null);
    assert.equal(canonicalizeIntegrationName({} as any), null);
  });
  it("plausible-but-unmapped typo → null (we do not pretend to accept everything)", () => {
    assert.equal(canonicalizeIntegrationName("gmial"), null);
    assert.equal(canonicalizeIntegrationName("telegrm"), null);
  });
});

describe("knownCanonicalNames — exposes the dedup'd target set", () => {
  it("includes all 4 pipeline targets", () => {
    const names = knownCanonicalNames();
    assert.ok(names.includes("gmail"));
    assert.ok(names.includes("google_calendar"));
    assert.ok(names.includes("telegram"));
    assert.ok(names.includes("whatsapp"));
  });
  it("returns unique values", () => {
    const names = knownCanonicalNames();
    assert.equal(names.length, new Set(names).size);
  });
});

describe("getPipeline — aliases resolve to the same pipeline as canonical", () => {
  it("'gcal' returns the same pipeline as 'google_calendar'", () => {
    const a = getPipeline("gcal");
    const b = getPipeline("google_calendar");
    assert.ok(a, "gcal should resolve to a pipeline");
    assert.equal(a, b);
  });
  it("'Gmail' returns the same pipeline as 'gmail'", () => {
    assert.equal(getPipeline("Gmail"), getPipeline("gmail"));
  });
  it("'whatsapp web' returns the same pipeline as 'whatsapp'", () => {
    assert.equal(getPipeline("whatsapp web"), getPipeline("whatsapp"));
  });
  it("'tg' returns the same pipeline as 'telegram'", () => {
    assert.equal(getPipeline("tg"), getPipeline("telegram"));
  });
  it("unknown name still returns null", () => {
    assert.equal(getPipeline("frobnicator"), null);
  });
});
