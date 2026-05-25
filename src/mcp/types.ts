// =============================================================================
// MCP (Model Context Protocol) — local type definitions
//
// Model Context Protocol is Anthropic's open standard for connecting LLMs
// to external tools and data sources. By supporting it, Vouza Admin Agent
// can tap into the existing ecosystem of MCP servers (filesystem, GitHub,
// Postgres, Slack, Notion, Stripe, AWS, etc.) instead of writing custom
// integrations one by one.
//
// Reference: https://modelcontextprotocol.io
// =============================================================================

/**
 * How the agent connects to an MCP server.
 *
 * - "stdio":  Spawn a local process and talk over stdin/stdout.
 *             Most common — works for any MCP server distributed via npm/pip.
 *             Example: `npx @modelcontextprotocol/server-filesystem /tmp`
 *
 * - "http":   Connect to an HTTP-based MCP server (SSE transport).
 *             Used for remote/hosted MCP servers.
 */
export type McpTransport = "stdio" | "http";

/**
 * One configured MCP server connection. Stored in data/mcp-servers.json
 * and re-applied on agent boot.
 */
export interface McpServerConfig {
  /** Stable user-defined id; used in URLs + tool namespacing. */
  id: string;
  /** Friendly name shown in the dashboard. */
  displayName: string;
  /** Connection type. */
  transport: McpTransport;
  /**
   * For stdio: shell command to spawn, e.g. "npx".
   * For http:  the base URL.
   */
  command: string;
  /** For stdio: arguments to pass to the command. */
  args?: string[];
  /** For stdio: extra env vars (e.g. API tokens for the MCP server itself). */
  env?: Record<string, string>;
  /** Enabled in the registry — disabled servers are kept but not connected. */
  enabled: boolean;
  /** Optional short description for the dashboard. */
  description?: string;
}

/**
 * Status of a single MCP server connection at a moment in time.
 * Aggregated into the Integration adapter for unified health.
 */
export interface McpConnectionStatus {
  serverId:       string;
  connected:      boolean;
  toolCount:      number;
  resourceCount:  number;
  promptCount:    number;
  lastConnectedAt?: string;
  lastErrorAt?:   string;
  lastError?:     string;
}

/**
 * One tool exposed by a connected MCP server. Normalized to look like
 * our native ToolDefinition so the agent loop can call it through the
 * existing ToolRegistry.
 */
export interface McpToolDescriptor {
  serverId:    string;
  /** MCP-native tool name. */
  name:        string;
  /** Tool name as registered in our agent's registry (namespaced: "<serverId>__<name>"). */
  registryName: string;
  description: string | undefined;
  /** JSON Schema describing the tool's input. */
  inputSchema: Record<string, unknown>;
}

/**
 * Pre-curated MCP servers we suggest in the dashboard. Users can install
 * any custom server too — this list is just a quality-of-life shortcut.
 */
export interface McpServerSuggestion {
  id:           string;
  displayName:  string;
  description:  string;
  category:     "files" | "dev" | "data" | "messaging" | "search" | "other";
  installHint:  string;
  config:       Omit<McpServerConfig, "id" | "enabled">;
}
