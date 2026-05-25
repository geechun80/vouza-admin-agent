// =============================================================================
// MCP Integration Adapter
//
// Single Integration entry that represents ALL connected MCP servers as a
// group. Surfaces aggregate status (X of Y connected, T tools available)
// to the dashboard's Setup Status panel and HealthMonitor.
//
// Probe behavior: lists configured servers and checks each connection
// state. If any disabled-but-enabled server has been disconnected for
// too long → degraded. If all enabled servers are connected → connected.
// =============================================================================

import type { Integration, IntegrationProbe, IntegrationStatusReport } from "./types.js";
import { mcpClientManager } from "../mcp/client.js";

export class McpIntegration implements Integration {
  readonly id = "mcp";
  readonly displayName = "MCP Servers";
  readonly category = "other" as const;

  private _lastSuccessAt: string | null = null;
  private _lastFailureAt: string | null = null;
  private _consecutiveFailures = 0;

  isEnabled(): boolean {
    return mcpClientManager.list().some((s) => s.enabled);
  }

  async probe(): Promise<IntegrationProbe> {
    const t0 = Date.now();
    const now = new Date().toISOString();
    const all = mcpClientManager.list();
    const enabled = all.filter((s) => s.enabled);

    if (enabled.length === 0) {
      return { ok: true, latencyMs: 0, detail: "No MCP servers configured", ts: now };
    }

    const statuses = mcpClientManager.getAllStatus();
    const enabledStatuses = statuses.filter((s) => enabled.find((e) => e.id === s.serverId));
    const connected = enabledStatuses.filter((s) => s.connected);
    const totalTools = connected.reduce((sum, s) => sum + s.toolCount, 0);

    // Try to reconnect any that have dropped (lightweight — connect() is a
    // no-op if already connected). This implements "probe drives recovery"
    // without needing the HealthMonitor's reset path.
    const disconnected = enabledStatuses.filter((s) => !s.connected);
    for (const dc of disconnected) {
      mcpClientManager.connect(dc.serverId).catch(() => { /* recorded internally */ });
    }

    const allConnected = connected.length === enabled.length;
    if (allConnected) {
      this._lastSuccessAt = now;
      this._consecutiveFailures = 0;
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        detail: `${connected.length} server${connected.length === 1 ? "" : "s"} connected · ${totalTools} tool${totalTools === 1 ? "" : "s"} available`,
        ts: now,
      };
    }

    this._lastFailureAt = now;
    this._consecutiveFailures++;
    const lastErrors = disconnected
      .filter((s) => s.lastError)
      .map((s) => `${s.serverId}: ${s.lastError?.slice(0, 80)}`)
      .slice(0, 3)
      .join(" | ");

    return {
      ok: false,
      latencyMs: Date.now() - t0,
      errorCategory: "network",  // dropped connection — typically recoverable
      detail: `${connected.length}/${enabled.length} servers connected${lastErrors ? ` — ${lastErrors}` : ""}`,
      ts: now,
    };
  }

  getStatus(): IntegrationStatusReport {
    const all = mcpClientManager.list();
    const enabled = all.filter((s) => s.enabled);

    if (enabled.length === 0) {
      return { status: "disabled", message: "No MCP servers configured" };
    }

    const statuses = mcpClientManager.getAllStatus();
    const connected = statuses.filter((s) => enabled.find((e) => e.id === s.serverId) && s.connected);

    if (connected.length === enabled.length) {
      const totalTools = connected.reduce((sum, s) => sum + s.toolCount, 0);
      return {
        status: "connected",
        message: `${connected.length} server${connected.length === 1 ? "" : "s"} · ${totalTools} tools`,
        lastSuccess: this._lastSuccessAt,
        consecutiveFailures: 0,
      };
    }

    return {
      status: this._consecutiveFailures >= 3 ? "failed" : "degraded",
      message: `${connected.length}/${enabled.length} MCP servers connected`,
      lastFailure: this._lastFailureAt,
      lastSuccess: this._lastSuccessAt,
      consecutiveFailures: this._consecutiveFailures,
    };
  }

  async reset(): Promise<{ ok: boolean; message: string }> {
    try {
      await mcpClientManager.disconnectAll();
      await mcpClientManager.connectAll();
      this._consecutiveFailures = 0;
      return { ok: true, message: "All MCP servers reconnected." };
    } catch (err) {
      return { ok: false, message: `Reset failed: ${String(err).slice(0, 200)}` };
    }
  }
}
