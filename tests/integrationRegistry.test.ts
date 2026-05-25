// =============================================================================
// Tests for the IntegrationRegistry + HealthMonitor foundation
//
// Validates the contract that every integration will eventually implement.
// Uses a fake integration so we test the framework behavior without depending
// on a real channel/tool being configured.
// =============================================================================

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import type { Integration, IntegrationProbe, IntegrationStatusReport } from "../src/integrations/types.js";
import { integrationRegistry } from "../src/integrations/registry.js";
import { healthMonitor } from "../src/integrations/healthMonitor.js";

// ── Test fixture: controllable fake integration ──────────────────────────
class FakeIntegration implements Integration {
  readonly category = "messaging" as const;
  resetCalls = 0;
  probeCalls = 0;
  nextProbeResult: IntegrationProbe = {
    ok: true, latencyMs: 10, detail: "ok", ts: new Date().toISOString(),
  };
  currentStatus: IntegrationStatusReport = { status: "connected" };

  constructor(public readonly id: string, public readonly displayName: string) {}

  isEnabled() { return true; }

  async probe(): Promise<IntegrationProbe> {
    this.probeCalls++;
    return { ...this.nextProbeResult, ts: new Date().toISOString() };
  }

  getStatus(): IntegrationStatusReport {
    return this.currentStatus;
  }

  async reset() {
    this.resetCalls++;
    return { ok: true, message: `Reset ${this.id}` };
  }
}

describe("IntegrationRegistry", () => {
  beforeEach(() => {
    integrationRegistry.__clearForTests();
    healthMonitor.__clearForTests();
  });

  it("register + get + list works", () => {
    const a = new FakeIntegration("a", "Alpha");
    const b = new FakeIntegration("b", "Beta");
    integrationRegistry.register(a);
    integrationRegistry.register(b);
    assert.equal(integrationRegistry.get("a"), a);
    assert.equal(integrationRegistry.get("b"), b);
    assert.equal(integrationRegistry.list().length, 2);
  });

  it("re-registering same ID replaces the previous entry (idempotent)", () => {
    const a1 = new FakeIntegration("a", "Alpha v1");
    const a2 = new FakeIntegration("a", "Alpha v2");
    integrationRegistry.register(a1);
    integrationRegistry.register(a2);
    assert.equal(integrationRegistry.list().length, 1);
    assert.equal(integrationRegistry.get("a")?.displayName, "Alpha v2");
  });

  it("probeAll calls probe on every registered integration in parallel", async () => {
    const a = new FakeIntegration("a", "Alpha");
    const b = new FakeIntegration("b", "Beta");
    integrationRegistry.register(a);
    integrationRegistry.register(b);
    const results = await integrationRegistry.probeAll();
    assert.equal(a.probeCalls, 1);
    assert.equal(b.probeCalls, 1);
    assert.ok(results.has("a"));
    assert.ok(results.has("b"));
  });

  it("probeAll catches thrown errors from probe() — never propagates", async () => {
    const a = new FakeIntegration("a", "Alpha");
    a.probe = () => { throw new Error("boom"); };
    integrationRegistry.register(a);
    const results = await integrationRegistry.probeAll();
    assert.equal(results.get("a")?.ok, false);
    assert.match(results.get("a")?.detail || "", /probe threw/);
  });

  it("statusAll returns a snapshot of every integration's current status", () => {
    const a = new FakeIntegration("a", "Alpha");
    a.currentStatus = { status: "degraded", message: "rate limited" };
    integrationRegistry.register(a);
    const all = integrationRegistry.statusAll();
    assert.equal(all.a.status, "degraded");
    assert.equal(all.a.message, "rate limited");
  });

  it("reset routes through the integration's own reset method", async () => {
    const a = new FakeIntegration("a", "Alpha");
    integrationRegistry.register(a);
    const r = await integrationRegistry.reset("a");
    assert.equal(r.ok, true);
    assert.equal(a.resetCalls, 1);
  });

  it("reset returns ok:false for unknown ID", async () => {
    const r = await integrationRegistry.reset("doesnt-exist");
    assert.equal(r.ok, false);
    assert.match(r.message, /Unknown integration/);
  });
});

describe("HealthMonitor", () => {
  beforeEach(() => {
    integrationRegistry.__clearForTests();
    healthMonitor.__clearForTests();
  });

  it("probeAll populates the history for each integration", async () => {
    const a = new FakeIntegration("a", "Alpha");
    integrationRegistry.register(a);
    await healthMonitor.probeAll();
    const last = healthMonitor.getLastProbe("a");
    assert.ok(last);
    assert.equal(last?.ok, true);
  });

  it("consecutive failures are tracked", async () => {
    const a = new FakeIntegration("a", "Alpha");
    a.nextProbeResult = { ok: false, latencyMs: 10, errorCategory: "auth", ts: "" };
    integrationRegistry.register(a);
    await healthMonitor.probeAll();
    await healthMonitor.probeAll();
    const snap = healthMonitor.snapshot();
    assert.equal(snap.a.consecutiveFailures, 2);
  });

  it("a successful probe resets the consecutive failure counter", async () => {
    const a = new FakeIntegration("a", "Alpha");
    a.nextProbeResult = { ok: false, latencyMs: 10, errorCategory: "network", ts: "" };
    integrationRegistry.register(a);
    await healthMonitor.probeAll();
    await healthMonitor.probeAll();
    a.nextProbeResult = { ok: true, latencyMs: 5, ts: "" };
    await healthMonitor.probeAll();
    const snap = healthMonitor.snapshot();
    assert.equal(snap.a.consecutiveFailures, 0);
  });

  it("auto-reset fires after threshold for recoverable error categories", async () => {
    const a = new FakeIntegration("a", "Alpha");
    a.nextProbeResult = { ok: false, latencyMs: 10, errorCategory: "stale_session", ts: "" };
    integrationRegistry.register(a);
    // Hit the auto-reset threshold (3 failures)
    await healthMonitor.probeAll();
    await healthMonitor.probeAll();
    await healthMonitor.probeAll();
    assert.equal(a.resetCalls, 1, "Auto-reset should fire after 3 consecutive failures");
  });

  it("auto-reset is NOT triggered for non-recoverable errors (auth/config)", async () => {
    const a = new FakeIntegration("a", "Alpha");
    a.nextProbeResult = { ok: false, latencyMs: 10, errorCategory: "auth", ts: "" };
    integrationRegistry.register(a);
    await healthMonitor.probeAll();
    await healthMonitor.probeAll();
    await healthMonitor.probeAll();
    assert.equal(a.resetCalls, 0, "Auth failures must NOT auto-reset — user has to fix the key");
  });

  it("snapshot includes recent probe + failure counts", async () => {
    const a = new FakeIntegration("a", "Alpha");
    integrationRegistry.register(a);
    await healthMonitor.probeAll();
    await healthMonitor.probeAll();
    const snap = healthMonitor.snapshot();
    assert.equal(snap.a.recentProbeCount, 2);
    assert.equal(snap.a.recentFailureCount, 0);
  });
});
