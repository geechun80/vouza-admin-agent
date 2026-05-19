// =============================================================================
// ServiceManager — Phase 3 modular service lifecycle manager
//
// Replaces the ad-hoc startXListener / stopXListener calls in launcher.ts
// with a structured registry that tracks per-service health, supports
// individual restarts, and exposes a single health snapshot for the dashboard.
//
// Status transitions
// ──────────────────
//   disabled   — no credentials, never started
//   starting   — start() called, not yet resolved
//   running    — start() resolved without error
//   connecting — service up but awaiting external confirmation (e.g. WA QR)
//   stopped    — stop() resolved (intentional shutdown)
//   error      — start() threw, or liveness probe reported "error"
//
// Liveness probes
// ───────────────
// If a ServiceDef provides a liveness() callback, health() calls it for any
// service in the "running" state to get a finer-grained status.  This lets
// Baileys report "connecting" (worker up, waiting for QR) vs "running"
// (fully authenticated).
// =============================================================================

import chalk from "chalk";
import type { AgentContext } from "../types/index.js";
import type { ToolRegistry } from "../tools/registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceStatus =
  | "running"      // fully operational
  | "connecting"   // started but awaiting external confirmation (e.g. QR scan)
  | "stopped"      // deliberately stopped
  | "error"        // start() threw, or liveness returned "error"
  | "disabled"     // no credentials — not applicable
  | "starting";    // start() called but not yet resolved

export interface ServiceHealth {
  name:        string;
  displayName: string;
  status:      ServiceStatus;
  /** Human-readable error message, set when status === "error". */
  error?:      string;
  /** Unix timestamp (ms) when start() last resolved successfully. */
  startedAt?:  number;
  /** Arbitrary key-value metadata for dashboard extras (e.g. queue depth). */
  meta?:       Record<string, string | number | boolean>;
}

export interface ServiceDef {
  name:        string;
  displayName: string;
  /** When false, service is "disabled" — start() is never called. */
  enabled:     boolean;
  start(ctx: AgentContext, registry: ToolRegistry): Promise<void>;
  stop(): void | Promise<void>;
  /**
   * Optional real-time liveness probe, called by health() for services
   * currently marked "running".  Use to surface finer-grained states
   * (e.g. WhatsApp: waiting for QR vs fully connected).
   */
  liveness?(): "running" | "connecting" | "error";
  /**
   * Optional metadata callback, called by health() to add extra info
   * to the ServiceHealth.meta field (e.g. queue depth, message count).
   */
  getMeta?(): Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// ServiceManager
// ---------------------------------------------------------------------------

export class ServiceManager {
  private _defs   = new Map<string, ServiceDef>();
  private _health = new Map<string, ServiceHealth>();
  private _ctx:   AgentContext | null = null;
  private _reg:   ToolRegistry | null = null;

  /**
   * Register a service.  Must be called before startAll().
   * Returns `this` for chaining.
   */
  register(def: ServiceDef): this {
    this._defs.set(def.name, def);
    this._health.set(def.name, {
      name:        def.name,
      displayName: def.displayName,
      status:      def.enabled ? "stopped" : "disabled",
    });
    return this;
  }

  /**
   * Start all enabled services sequentially.
   * Services that throw are marked "error" — others continue unaffected.
   */
  async startAll(ctx: AgentContext, registry: ToolRegistry): Promise<void> {
    this._ctx = ctx;
    this._reg = registry;

    for (const [name, def] of this._defs) {
      if (!def.enabled) continue; // disabled — skip

      const h = this._health.get(name)!;
      h.status = "starting";
      h.error  = undefined;

      try {
        await def.start(ctx, registry);
        h.status    = "running";
        h.startedAt = Date.now();
        console.log(chalk.green(`  [ServiceManager] ${def.displayName} started`));
      } catch (err: any) {
        h.status = "error";
        h.error  = String(err).slice(0, 300);
        console.error(chalk.red(`  [ServiceManager] ${def.displayName} failed to start: ${err}`));
      }
    }
  }

  /**
   * Stop all running/connecting/starting services.
   * Called on agent shutdown.
   */
  async stopAll(): Promise<void> {
    for (const [name, def] of this._defs) {
      const h = this._health.get(name)!;
      if (h.status === "disabled" || h.status === "stopped") continue;

      try {
        await def.stop();
        h.status = "stopped";
      } catch (err) {
        console.error(chalk.red(`  [ServiceManager] ${name} failed to stop: ${err}`));
        // Mark as stopped anyway so the agent can shut down cleanly
        h.status = "stopped";
      }
    }
  }

  /**
   * Restart a single named service.
   * Useful for the dashboard "restart" button or after credential updates.
   * Throws if the service name is unknown.
   */
  async restart(name: string): Promise<void> {
    const def = this._defs.get(name);
    if (!def) throw new Error(`Unknown service: "${name}"`);
    if (!def.enabled) throw new Error(`Service "${name}" is disabled (no credentials)`);
    if (!this._ctx || !this._reg) throw new Error("startAll() must be called before restart()");

    const h = this._health.get(name)!;

    // Stop first if running
    if (h.status !== "stopped" && h.status !== "error") {
      try {
        await def.stop();
      } catch {
        // best-effort stop
      }
    }

    h.status = "starting";
    h.error  = undefined;

    try {
      await def.start(this._ctx, this._reg);
      h.status    = "running";
      h.startedAt = Date.now();
      console.log(chalk.green(`  [ServiceManager] ${def.displayName} restarted`));
    } catch (err: any) {
      h.status = "error";
      h.error  = String(err).slice(0, 300);
      throw err; // re-throw so callers (e.g. API endpoint) can report failure
    }
  }

  /**
   * Return a snapshot of all registered services with real-time status.
   * Calls liveness() + getMeta() for each running service.
   */
  health(): ServiceHealth[] {
    return Array.from(this._health.values()).map((h) => {
      const def = this._defs.get(h.name);
      if (!def) return h;

      let status: ServiceStatus = h.status;

      // Refine status with liveness probe (only when we think it's running)
      if (
        (h.status === "running" || h.status === "starting") &&
        def.liveness
      ) {
        const live = def.liveness();
        if (live === "running")    status = "running";
        else if (live === "connecting") status = "connecting";
        else if (live === "error") status = "error";
      }

      const meta = def.getMeta?.();
      return { ...h, status, ...(meta ? { meta } : {}) };
    });
  }

  /**
   * Return health for a single service by name.
   */
  getHealth(name: string): ServiceHealth | undefined {
    const h = this._health.get(name);
    if (!h) return undefined;

    const all = this.health();
    return all.find((s) => s.name === name);
  }

  /** Names of all registered services. */
  list(): string[] {
    return Array.from(this._defs.keys());
  }

  /** True if all enabled services are in "running" status. */
  allHealthy(): boolean {
    for (const h of this._health.values()) {
      if (h.status === "disabled" || h.status === "stopped") continue;
      if (h.status !== "running") return false;
    }
    return true;
  }
}
