// =============================================================================
// Smoke tests — proactive schedules (src/tasks/proactive.ts)
//
// Phase 2 contract: the agent seeds two opt-out default scheduled tasks
// (morning briefing 08:00 daily, weekly report Fri 17:00) when an outbound
// channel is connected. User edits/disables must be respected forever.
// Delivery resolves telegram > whatsapp > none and falls back gracefully.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  seedDefaultRecords,
  resolveChannel,
  parseTime,
  applyTimeToCron,
  cronToTime,
  applyScheduleUpdate,
  shouldNag,
  deliver,
  buildProactivePrompt,
  DEFAULT_SCHEDULE_TEMPLATES,
  type ProactiveScheduleRecord,
} from "../src/tasks/proactive.js";
import { notifyDesktop } from "../src/util/notify.js";

const NOW = 1_750_000_000_000;

function mkRecord(over: Partial<ProactiveScheduleRecord> = {}): ProactiveScheduleRecord {
  return {
    id: "morning-briefing",
    label: "Morning briefing",
    skillName: "daily-briefing",
    cron: "0 8 * * *",
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Default seeding
// ---------------------------------------------------------------------------

describe("seedDefaultRecords — default task creation", () => {
  it("creates both default tasks when a channel is connected", () => {
    const { records, added } = seedDefaultRecords([], true, NOW);
    assert.equal(added, 2);
    const ids = records.map((r) => r.id).sort();
    assert.deepEqual(ids, ["morning-briefing", "weekly-report"]);
    const morning = records.find((r) => r.id === "morning-briefing")!;
    const weekly  = records.find((r) => r.id === "weekly-report")!;
    assert.equal(morning.cron, "0 8 * * *");   // daily 08:00
    assert.equal(weekly.cron,  "0 17 * * 5");  // Friday 17:00
    assert.equal(morning.enabled, true);
    assert.equal(weekly.enabled, true);
  });

  it("creates nothing when no channel is connected", () => {
    const { records, added } = seedDefaultRecords([], false, NOW);
    assert.equal(added, 0);
    assert.equal(records.length, 0);
  });

  it("does not duplicate tasks on a second launch", () => {
    const first  = seedDefaultRecords([], true, NOW);
    const second = seedDefaultRecords(first.records, true, NOW + 1000);
    assert.equal(second.added, 0);
    assert.equal(second.records.length, 2);
  });

  it("respects a disabled:false flag — user's OFF stays OFF", () => {
    const disabled = mkRecord({ enabled: false, customized: true });
    const { records, added } = seedDefaultRecords([disabled], true, NOW);
    assert.equal(added, 1); // only weekly-report gets added
    const morning = records.find((r) => r.id === "morning-briefing")!;
    assert.equal(morning.enabled, false); // NOT reset to true
  });

  it("preserves a user-customized cron (never overwritten by reseeding)", () => {
    const custom = mkRecord({ cron: "30 6 * * *", customized: true });
    const { records } = seedDefaultRecords([custom], true, NOW);
    const morning = records.find((r) => r.id === "morning-briefing")!;
    assert.equal(morning.cron, "30 6 * * *");
  });
});

// ---------------------------------------------------------------------------
// Channel resolution
// ---------------------------------------------------------------------------

describe("resolveChannel — telegram > whatsapp > none", () => {
  it("prefers telegram when both channels are usable", () => {
    const ch = resolveChannel({
      telegramConfigured: true,  telegramChatId: 12345,
      whatsappConfigured: true,  whatsappOwnerJid: "6591234567@s.whatsapp.net",
    });
    assert.equal(ch, "telegram");
  });

  it("falls back to whatsapp when telegram has no known owner chat", () => {
    const ch = resolveChannel({
      telegramConfigured: true,  telegramChatId: null,
      whatsappConfigured: true,  whatsappOwnerJid: "6591234567@s.whatsapp.net",
    });
    assert.equal(ch, "whatsapp");
  });

  it("returns null when no channel is usable (skip silently)", () => {
    const ch = resolveChannel({
      telegramConfigured: false, telegramChatId: null,
      whatsappConfigured: true,  whatsappOwnerJid: null, // configured but not connected
    });
    assert.equal(ch, null);
  });
});

// ---------------------------------------------------------------------------
// Time validation + cron handling (POST /api/schedules body)
// ---------------------------------------------------------------------------

describe("time parsing and cron rewriting", () => {
  it("accepts valid 24h times", () => {
    assert.deepEqual(parseTime("08:00"), { hour: 8,  minute: 0 });
    assert.deepEqual(parseTime("23:59"), { hour: 23, minute: 59 });
    assert.deepEqual(parseTime("0:05"),  { hour: 0,  minute: 5 });
  });

  it("rejects bad times", () => {
    assert.equal(parseTime("25:00"), null);
    assert.equal(parseTime("8am"),   null);
    assert.equal(parseTime("12:60"), null);
    assert.equal(parseTime(""),      null);
    assert.equal(parseTime(800 as unknown as string), null);
  });

  it("applyTimeToCron preserves the day-of-week field", () => {
    assert.equal(applyTimeToCron("0 17 * * 5", "09:30"), "30 9 * * 5");
    assert.equal(applyTimeToCron("0 8 * * *",  "07:15"), "15 7 * * *");
    assert.equal(applyTimeToCron("0 8 * * *",  "nope"),  null);
  });

  it("cronToTime renders HH:MM for the UI", () => {
    assert.equal(cronToTime("0 8 * * *"),   "08:00");
    assert.equal(cronToTime("30 17 * * 5"), "17:30");
  });
});

describe("applyScheduleUpdate — POST /api/schedules validation", () => {
  it("rejects a bad time and leaves the record untouched", () => {
    const rec = mkRecord();
    const { record, error } = applyScheduleUpdate(rec, { time: "99:99" }, NOW);
    assert.ok(error);
    assert.equal(record.cron, "0 8 * * *");
    assert.equal(record.customized, undefined);
  });

  it("rejects a non-boolean enabled", () => {
    const { error } = applyScheduleUpdate(mkRecord(), { enabled: "yes" }, NOW);
    assert.ok(error);
  });

  it("applies a valid time and marks the record customized", () => {
    const { record, error } = applyScheduleUpdate(mkRecord(), { time: "06:45" }, NOW + 5);
    assert.equal(error, undefined);
    assert.equal(record.cron, "45 6 * * *");
    assert.equal(record.customized, true);
    assert.equal(record.updatedAt, NOW + 5);
  });

  it("applies enabled=false (user opt-out)", () => {
    const { record } = applyScheduleUpdate(mkRecord(), { enabled: false }, NOW);
    assert.equal(record.enabled, false);
    assert.equal(record.customized, true);
  });
});

// ---------------------------------------------------------------------------
// Nag throttle
// ---------------------------------------------------------------------------

describe("shouldNag — weekly connect-more-sources throttle", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("nags when never nagged before", () => {
    assert.equal(shouldNag(undefined, NOW), true);
  });

  it("does NOT nag when last nag was under 7 days ago", () => {
    assert.equal(shouldNag(NOW - 3 * DAY, NOW), false);
    assert.equal(shouldNag(NOW - 6 * DAY - 23 * 60 * 60 * 1000, NOW), false);
  });

  it("nags again once 7 days have passed", () => {
    assert.equal(shouldNag(NOW - 7 * DAY, NOW), true);
    assert.equal(shouldNag(NOW - 30 * DAY, NOW), true);
  });
});

// ---------------------------------------------------------------------------
// Delivery with fallback
// ---------------------------------------------------------------------------

describe("deliver — graceful channel fallback", () => {
  it("delivers via the preferred channel when it works", async () => {
    const calls: string[] = [];
    const result = await deliver("hello", "telegram", {
      telegram: async () => { calls.push("tg"); },
      whatsapp: async () => { calls.push("wa"); },
    });
    assert.deepEqual(calls, ["tg"]);
    assert.equal(result.delivered, true);
    assert.equal(result.via, "telegram");
  });

  it("falls back to the other channel when the preferred send throws", async () => {
    const calls: string[] = [];
    const result = await deliver("hello", "telegram", {
      telegram: async () => { calls.push("tg"); throw new Error("network down"); },
      whatsapp: async () => { calls.push("wa"); },
    });
    assert.deepEqual(calls, ["tg", "wa"]);
    assert.equal(result.delivered, true);
    assert.equal(result.via, "whatsapp");
  });

  it("never throws even when every channel fails", async () => {
    const result = await deliver("hello", "whatsapp", {
      telegram: async () => { throw new Error("boom"); },
      whatsapp: async () => { throw new Error("boom"); },
    });
    assert.equal(result.delivered, false);
    assert.equal(result.via, undefined);
  });
});

// ---------------------------------------------------------------------------
// Prompt constraints (Rule 52 + zero-data-source usefulness + nag wiring)
// ---------------------------------------------------------------------------

describe("buildProactivePrompt — delivery constraints", () => {
  const tpl = DEFAULT_SCHEDULE_TEMPLATES[0];
  const skill = {
    name: "daily-briefing", displayName: "Daily Briefing",
    description: "d", whenToUse: "w", category: "general",
    prompt: "DO THE BRIEFING", allowedTools: [],
  } as any;

  it("always forbids mentioning models/providers (Rule 52)", () => {
    const p = buildProactivePrompt(tpl, skill, { hasEmail: true, hasCalendar: true, includeNag: false });
    assert.match(p, /NEVER mention AI model names, providers/);
    assert.match(p, /DO THE BRIEFING/);
  });

  it("guides a useful briefing when no data sources are connected", () => {
    const p = buildProactivePrompt(tpl, skill, { hasEmail: false, hasCalendar: false, includeNag: false });
    assert.match(p, /email and calendar are not connected/);
    assert.match(p, /what IS available/);
    assert.match(p, /Do NOT suggest connecting more integrations/);
  });

  it("includes the connect-more-sources line only when the nag is allowed", () => {
    const withNag = buildProactivePrompt(tpl, skill, { hasEmail: false, hasCalendar: true, includeNag: true });
    assert.match(withNag, /suggesting they connect email\/calendar/);
    const without = buildProactivePrompt(tpl, skill, { hasEmail: false, hasCalendar: true, includeNag: false });
    assert.doesNotMatch(without, /suggesting they connect/);
  });
});

// ---------------------------------------------------------------------------
// Desktop notifications — must never throw
// ---------------------------------------------------------------------------

describe("notifyDesktop — fire-and-forget", () => {
  it("never throws, even with odd inputs", () => {
    assert.doesNotThrow(() => notifyDesktop("Admin Agent", "Briefing delivered"));
    assert.doesNotThrow(() => notifyDesktop("", ""));
    assert.doesNotThrow(() =>
      notifyDesktop("x".repeat(5000), "y".repeat(5000))
    );
  });
});
