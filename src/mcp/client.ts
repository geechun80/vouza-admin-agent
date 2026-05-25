// =============================================================================
// MCP Client Manager — owns connections to all configured MCP servers
//
// Responsibilities:
//   1. Spawn (stdio) or connect (http) to each enabled MCP server
//   2. Discover the tools each server exposes
//   3. Bridge those tools into our existing ToolRegistry so the agent loop
//      can call them transparently (no special-case code in the loop)
//   4. Surface per-server status to the Integration adapter for monitoring
//   5. Auto-reconnect on dropped connections
//
// Persistence: data/mcp-servers.json — survives restarts.
// =============================================================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { promises as fs } from "fs";
import { join } from "path";
import { logger } from "../util/logger.js";
import type { McpServerConfig, McpConnectionStatus, McpToolDescriptor } from "./types.js";

const CONFIG_PATH = join(process.cwd(), "data", "mcp-servers.json");

// One live client per connected server, keyed by server id
interface LiveConnection {
  config:      McpServerConfig;
  client:      Client;
  transport:   StdioClientTransport;
  tools:       McpToolDescriptor[];
  connectedAt: string;
}

class McpClientManagerImpl {
  private connections: Map<string, LiveConnection> = new Map();
  private servers:     Map<string, McpServerConfig> = new Map();
  private status:      Map<string, McpConnectionStatus> = new Map();

  // ── Persistence ──────────────────────────────────────────────────────────

  async loadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.servers)) return;
      for (const s of parsed.servers as McpServerConfig[]) {
        if (s?.id && s?.command) {
          this.servers.set(s.id, s);
        }
      }
      logger.info(
        { event: "mcp_servers_loaded", count: this.servers.size },
        `Loaded ${this.servers.size} MCP server configs from disk`
      );
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        logger.warn({ event: "mcp_servers_load_failed", err: String(err) }, "Could not load mcp-servers.json");
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      await fs.mkdir(join(process.cwd(), "data"), { recursive: true });
      const payload = { version: 1, servers: Array.from(this.servers.values()) };
      // Write-then-rename for atomicity
      const tmp = CONFIG_PATH + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf-8");
      await fs.rename(tmp, CONFIG_PATH);
    } catch (err) {
      logger.error({ event: "mcp_servers_save_failed", err: String(err) }, "Could not save mcp-servers.json");
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  list(): McpServerConfig[] { return Array.from(this.servers.values()); }

  get(id: string): McpServerConfig | undefined { return this.servers.get(id); }

  async upsertServer(config: McpServerConfig): Promise<void> {
    if (!config.id || !config.command) {
      throw new Error("MCP server config requires id and command");
    }
    this.servers.set(config.id, config);
    await this.saveToDisk();
    // If newly enabled, kick off a connect
    if (config.enabled && !this.connections.has(config.id)) {
      this.connect(config.id).catch(() => {});
    }
  }

  async removeServer(id: string): Promise<void> {
    await this.disconnect(id);
    this.servers.delete(id);
    this.status.delete(id);
    await this.saveToDisk();
  }

  // ── Connection lifecycle ─────────────────────────────────────────────────

  async connect(serverId: string): Promise<void> {
    const config = this.servers.get(serverId);
    if (!config) throw new Error(`Unknown MCP server: ${serverId}`);
    if (!config.enabled) {
      logger.info({ event: "mcp_connect_skipped_disabled", serverId }, `Skipping disabled MCP server ${serverId}`);
      return;
    }
    // Already connected?
    if (this.connections.has(serverId)) {
      logger.info({ event: "mcp_already_connected", serverId }, `MCP server ${serverId} already connected`);
      return;
    }

    if (config.transport !== "stdio") {
      logger.warn(
        { event: "mcp_transport_unsupported", transport: config.transport, serverId },
        `MCP transport "${config.transport}" not yet supported — only stdio for now`
      );
      this.recordError(serverId, `Transport "${config.transport}" not supported yet`);
      return;
    }

    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args:    config.args ?? [],
        env:     { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
      });

      const client = new Client(
        { name: "vouza-admin-agent", version: "2.1.0" },
        { capabilities: {} }
      );

      await client.connect(transport);

      // Discover tools
      const toolList = await client.listTools().catch(() => ({ tools: [] }));
      const tools: McpToolDescriptor[] = (toolList.tools || []).map((t: any) => ({
        serverId,
        name:         t.name,
        registryName: `${serverId}__${t.name}`,
        description:  t.description,
        inputSchema:  (t.inputSchema || {}) as Record<string, unknown>,
      }));

      // Discover counts of other capabilities (best-effort)
      const [resources, prompts] = await Promise.all([
        client.listResources().catch(() => ({ resources: [] })),
        client.listPrompts().catch(() => ({ prompts: [] })),
      ]);

      this.connections.set(serverId, {
        config,
        client,
        transport,
        tools,
        connectedAt: new Date().toISOString(),
      });

      this.status.set(serverId, {
        serverId,
        connected:        true,
        toolCount:        tools.length,
        resourceCount:    (resources.resources || []).length,
        promptCount:      (prompts.prompts || []).length,
        lastConnectedAt:  new Date().toISOString(),
      });

      logger.info(
        { event: "mcp_connected", serverId, toolCount: tools.length, resources: (resources.resources || []).length, prompts: (prompts.prompts || []).length },
        `MCP server connected: ${config.displayName} (${tools.length} tools)`
      );
    } catch (err) {
      this.recordError(serverId, String(err));
      throw err;
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const live = this.connections.get(serverId);
    if (!live) return;
    try { await live.client.close(); } catch { /* best effort */ }
    this.connections.delete(serverId);
    const status = this.status.get(serverId);
    if (status) status.connected = false;
    logger.info({ event: "mcp_disconnected", serverId }, `MCP server disconnected: ${serverId}`);
  }

  async connectAll(): Promise<void> {
    const ids = Array.from(this.servers.values()).filter((s) => s.enabled).map((s) => s.id);
    await Promise.all(ids.map((id) => this.connect(id).catch((err) => {
      logger.warn({ event: "mcp_connect_failed", serverId: id, err: String(err) }, `MCP connect failed: ${id}`);
    })));
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.connections.keys());
    await Promise.all(ids.map((id) => this.disconnect(id)));
  }

  // ── Tool invocation ──────────────────────────────────────────────────────

  /** Call a tool on a connected MCP server. Throws if server not connected. */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const live = this.connections.get(serverId);
    if (!live) throw new Error(`MCP server "${serverId}" not connected`);
    return await live.client.callTool({ name: toolName, arguments: args });
  }

  // ── Status + introspection ───────────────────────────────────────────────

  getStatus(serverId: string): McpConnectionStatus | undefined {
    return this.status.get(serverId);
  }

  getAllStatus(): McpConnectionStatus[] {
    // Include configured-but-disconnected servers too
    const result: McpConnectionStatus[] = [];
    for (const config of this.servers.values()) {
      const existing = this.status.get(config.id);
      result.push(existing ?? {
        serverId:      config.id,
        connected:     false,
        toolCount:     0,
        resourceCount: 0,
        promptCount:   0,
      });
    }
    return result;
  }

  /** All tools across all connected servers. */
  getAllTools(): McpToolDescriptor[] {
    const all: McpToolDescriptor[] = [];
    for (const live of this.connections.values()) {
      all.push(...live.tools);
    }
    return all;
  }

  private recordError(serverId: string, error: string): void {
    const existing = this.status.get(serverId);
    this.status.set(serverId, {
      ...(existing ?? { serverId, connected: false, toolCount: 0, resourceCount: 0, promptCount: 0 }),
      connected:    false,
      lastErrorAt:  new Date().toISOString(),
      lastError:    error.slice(0, 500),
    });
  }

  /** Test helper. */
  __clearForTests(): void {
    this.servers.clear();
    this.connections.clear();
    this.status.clear();
  }
}

export const mcpClientManager = new McpClientManagerImpl();
