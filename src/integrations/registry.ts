// =============================================================================
// IntegrationRegistry — single source of truth for every integration
//
// All channels/tools register themselves here on agent startup. The dashboard
// (and any other consumer) gets a unified view: list, probe-on-demand, get
// status, reset. No more "Telegram has its own status check, WhatsApp has
// another, AI provider has a third" — everything goes through this.
// =============================================================================

import type { Integration, IntegrationProbe, IntegrationStatusReport, IntegrationMeta } from "./types.js";
import { logger } from "../util/logger.js";

class IntegrationRegistryImpl {
  private items: Map<string, Integration> = new Map();

  /**
   * Register an integration. Replaces any previous registration with the
   * same ID — idempotent so safe to call from listener startup which may
   * fire multiple times across hot reloads or restarts.
   */
  register(integration: Integration): void {
    const prev = this.items.get(integration.id);
    this.items.set(integration.id, integration);
    if (!prev) {
      logger.info(
        { event: "integration_registered", id: integration.id, category: integration.category },
        `Integration registered: ${integration.displayName}`
      );
    }
  }

  /** Remove an integration (e.g. on shutdown). */
  unregister(id: string): void {
    if (this.items.delete(id)) {
      logger.info({ event: "integration_unregistered", id }, `Integration unregistered: ${id}`);
    }
  }

  /** Look up by stable ID. Returns undefined if not registered. */
  get(id: string): Integration | undefined {
    return this.items.get(id);
  }

  /** All currently-registered integrations. */
  list(): Integration[] {
    return Array.from(this.items.values());
  }

  /** Metadata snapshot for the dashboard's "Manage all integrations" UI. */
  meta(): IntegrationMeta[] {
    return this.list().map((i) => ({
      id:          i.id,
      displayName: i.displayName,
      category:    i.category,
    }));
  }

  /**
   * Run probe() on every registered integration in parallel.
   * Failures from one don't block others. Each probe is bounded by
   * Integration's internal timeout (typically 5s).
   */
  async probeAll(): Promise<Map<string, IntegrationProbe>> {
    const results = new Map<string, IntegrationProbe>();
    await Promise.all(
      this.list().map(async (i) => {
        try {
          const probe = await i.probe();
          results.set(i.id, probe);
        } catch (err) {
          // probe() should never throw, but defensive — never crash the loop
          results.set(i.id, {
            ok: false,
            latencyMs: 0,
            errorCategory: "unknown",
            detail: `probe threw: ${String(err).slice(0, 200)}`,
            ts: new Date().toISOString(),
          });
        }
      })
    );
    return results;
  }

  /** Get the current cached status for every integration (no network calls). */
  statusAll(): Record<string, IntegrationStatusReport> {
    const out: Record<string, IntegrationStatusReport> = {};
    for (const i of this.list()) {
      out[i.id] = i.getStatus();
    }
    return out;
  }

  /** Reset a single integration by ID. */
  async reset(id: string): Promise<{ ok: boolean; message: string }> {
    const integration = this.items.get(id);
    if (!integration) return { ok: false, message: `Unknown integration: ${id}` };
    try {
      return await integration.reset();
    } catch (err) {
      return { ok: false, message: `Reset failed: ${String(err)}` };
    }
  }

  /** Used by tests to start fresh. */
  __clearForTests(): void {
    this.items.clear();
  }
}

/** Singleton — every consumer in the codebase uses the same registry. */
export const integrationRegistry = new IntegrationRegistryImpl();
