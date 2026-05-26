// =============================================================================
// Tests for the HealthMonitor M3 rolling-event window.
//
// Covers:
//   1. FIFO eviction at the 1000-event cap (no unbounded growth)
//   2. p50/p95 latency computation against skewed inputs
//   3. Per-integration isolation (no cross-leak)
//   4. Time-window filtering (windowMs)
//   5. Empty integration → zeroed metrics, no crash
//   6. Concurrent writes preserve ordering (no lost events)
// =============================================================================

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  healthMonitor,
  percentile,
  HEALTH_EVENT_WINDOW_SIZE,
} from "../src/integrations/healthMonitor.js";

beforeEach(() => {
  healthMonitor.__clearForTests();
});

describe("HealthMonitor rolling event window", () => {
  it("evicts oldest events FIFO once the cap is reached", () => {
    // Insert cap + 50 events, each tagged with its serial number in `source`
    const overflow = 50;
    for (let i = 0; i < HEALTH_EVENT_WINDOW_SIZE + overflow; i++) {
      healthMonitor.recordEvent("gmail", {
        kind: "call",
        ok: true,
        latencyMs: i,
        source: String(i),
      });
    }
    const events = healthMonitor.getEvents("gmail");
    // Must be capped at exactly EVENT_WINDOW_SIZE
    assert.equal(events.length, HEALTH_EVENT_WINDOW_SIZE);
    // The first 50 should have been dropped — first surviving = #50, last = cap+overflow-1
    assert.equal(events[0].source, String(overflow));
    assert.equal(events[events.length - 1].source, String(HEALTH_EVENT_WINDOW_SIZE + overflow - 1));
  });

  it("computes p50 and p95 over skewed latencies correctly", () => {
    // Insert 100 latency samples: 1..100ms
    for (let i = 1; i <= 100; i++) {
      healthMonitor.recordEvent("telegram", {
        kind: "call",
        ok: true,
        latencyMs: i,
      });
    }
    const m = healthMonitor.rollupMetrics("telegram");
    // p50 of 1..100 should land at ~50; p95 at ~95. Allow ±2 tolerance for
    // linear-interpolation choice between adjacent ranks.
    assert.ok(m.p50LatencyMs >= 49 && m.p50LatencyMs <= 51, `p50=${m.p50LatencyMs}`);
    assert.ok(m.p95LatencyMs >= 94 && m.p95LatencyMs <= 96, `p95=${m.p95LatencyMs}`);
    // Standalone percentile() sanity
    assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
    assert.equal(percentile([], 50), 0);
  });

  it("isolates events per integration — no cross-leak", () => {
    healthMonitor.recordEvent("gmail", { kind: "call", ok: true, latencyMs: 10 });
    healthMonitor.recordEvent("gmail", { kind: "call", ok: false, latencyMs: 20, error: "boom" });
    healthMonitor.recordEvent("telegram", { kind: "call", ok: true, latencyMs: 999 });

    const gmail = healthMonitor.getEvents("gmail");
    const telegram = healthMonitor.getEvents("telegram");
    assert.equal(gmail.length, 2);
    assert.equal(telegram.length, 1);
    assert.equal(telegram[0].latencyMs, 999);
    // Failure on gmail must not leak into telegram's rollup
    const tgMetrics = healthMonitor.rollupMetrics("telegram");
    assert.equal(tgMetrics.failureCount, 0);
  });

  it("filters by time window (windowMs)", () => {
    const now = Date.now();
    // Inject one old event (2 hours ago) and one recent (5 sec ago)
    healthMonitor.recordEvent("whatsapp", {
      kind: "call", ok: true, latencyMs: 10, ts: now - 2 * 60 * 60_000,
    });
    healthMonitor.recordEvent("whatsapp", {
      kind: "call", ok: true, latencyMs: 30, ts: now - 5_000,
    });

    const lastHour = healthMonitor.getEvents("whatsapp", { windowMs: 60 * 60_000 });
    assert.equal(lastHour.length, 1, "only the recent event falls inside 1h");
    assert.equal(lastHour[0].latencyMs, 30);

    const lastDay = healthMonitor.getEvents("whatsapp", { windowMs: 24 * 60 * 60_000 });
    assert.equal(lastDay.length, 2, "both events fall inside 24h");

    // Rollup honors window too
    const rollup1h = healthMonitor.rollupMetrics("whatsapp", 60 * 60_000);
    assert.equal(rollup1h.callCount, 1);
  });

  it("returns zeroed metrics for an unknown integration — no crash", () => {
    const m = healthMonitor.rollupMetrics("never-seen-this-id");
    assert.equal(m.callCount, 0);
    assert.equal(m.failureCount, 0);
    assert.equal(m.webhookCount, 0);
    assert.equal(m.retryCount, 0);
    assert.equal(m.p50LatencyMs, 0);
    assert.equal(m.p95LatencyMs, 0);
    assert.equal(m.lastSuccessTs, null);
    assert.equal(m.lastErrorTs, null);
    assert.equal(m.lastErrorMessage, null);
    // And getEvents returns an empty array, not undefined
    const events = healthMonitor.getEvents("never-seen-this-id");
    assert.deepEqual(events, []);
  });

  it("preserves event ordering under rapid concurrent recording", async () => {
    // Fire 500 record calls "concurrently" via Promise.all. Even though
    // JS is single-threaded, the await boundary inside Promise.all is enough
    // to surface any ordering bug (e.g. if recordEvent used setTimeout or
    // a stale local reference to the array).
    const N = 500;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        Promise.resolve().then(() =>
          healthMonitor.recordEvent("gmail", {
            kind: "call",
            ok: true,
            latencyMs: i,
            source: String(i),
          }),
        ),
      ),
    );
    const events = healthMonitor.getEvents("gmail");
    assert.equal(events.length, N, "all events recorded — none lost");
    // Each event's source should be its index (Promise.resolve() preserves microtask order)
    for (let i = 0; i < N; i++) {
      assert.equal(events[i].source, String(i), `position ${i} should be the ${i}-th call`);
    }
  });

  it("tracks lastSuccess/lastError independently and surfaces error message", () => {
    healthMonitor.recordEvent("telegram", {
      kind: "call", ok: true, latencyMs: 50, ts: 1000,
    });
    healthMonitor.recordEvent("telegram", {
      kind: "call", ok: false, latencyMs: 200, ts: 2000, error: "HTTP 401 Unauthorized",
    });
    const m = healthMonitor.rollupMetrics("telegram", 10 * 60_000_000);
    assert.equal(m.lastSuccessTs, 1000);
    assert.equal(m.lastErrorTs, 2000);
    assert.equal(m.lastErrorMessage, "HTTP 401 Unauthorized");
  });
});
