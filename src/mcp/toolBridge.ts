// =============================================================================
// MCP Tool Bridge
//
// Takes the tools discovered from connected MCP servers and registers them
// as first-class tools in our existing ToolRegistry. After this, the agent
// loop calls them through the same path as native tools — no special-case
// handling in the loop or system prompt needed.
//
// Naming convention: "<serverId>__<toolName>"  (double underscore separator)
// e.g. "github__create_issue", "filesystem__read_file"
// =============================================================================

import { z } from "zod";
import { mcpClientManager } from "./client.js";
import type { ToolRegistry } from "../tools/registry.js";
import { buildTool } from "../tools/registry.js";
import { logger } from "../util/logger.js";

/**
 * Register every connected MCP server's tools into the agent's tool registry.
 * Called once after the launcher boots and the MCP client has discovered
 * tools. Safe to call again later (will re-register, which the registry
 * handles by replacing entries).
 */
export function bridgeMcpToolsIntoRegistry(registry: ToolRegistry): number {
  const mcpTools = mcpClientManager.getAllTools();

  for (const tool of mcpTools) {
    // Convert MCP's JSON Schema into a zod schema. We use z.any() at the
    // top level because MCP servers can have arbitrary input shapes —
    // the actual validation happens server-side at the MCP server.
    // Trade-off: less compile-time safety, but matches MCP's design.
    const inputSchema: z.ZodTypeAny = z.any();

    const bridged = buildTool({
      name:        tool.registryName,
      description: tool.description ?? `${tool.name} (via ${tool.serverId})`,
      category:    "system",   // MCP tools span every category; "system" is safe default
      isReadOnly:  false,       // unknown — be conservative
      isConcurrencySafe: false, // unknown — serialize for safety
      inputSchema,
      async call(input: any, _context) {
        try {
          const result = await mcpClientManager.callTool(tool.serverId, tool.name, input || {});
          // MCP results are typically { content: [{ type: "text", text: "..." }] }
          // Normalize to a string so the agent loop can include it in the message
          let textOut = "";
          if (result && typeof result === "object" && "content" in result) {
            const content = (result as any).content;
            if (Array.isArray(content)) {
              textOut = content.map((c: any) => c?.text || JSON.stringify(c)).join("\n");
            } else {
              textOut = JSON.stringify(content);
            }
          } else {
            textOut = JSON.stringify(result);
          }
          return { success: true, data: textOut };
        } catch (err) {
          return { success: false, error: `MCP tool call failed: ${String(err).slice(0, 300)}` };
        }
      },
    });

    registry.register(bridged as any);
  }

  logger.info(
    { event: "mcp_tools_bridged", count: mcpTools.length },
    `Bridged ${mcpTools.length} MCP tools into the agent's tool registry`
  );
  return mcpTools.length;
}
