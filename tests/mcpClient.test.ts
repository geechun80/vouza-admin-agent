// =============================================================================
// Tests for McpClientManager — config storage, CRUD, fail-safe behavior
//
// We don't spawn a real MCP server in tests (would require external
// dependencies). Instead we exercise the CRUD + persistence + status
// surface, which is what most regression risk lives in.
// =============================================================================

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { promises as fs } from "fs";
import { join } from "path";
import { mcpClientManager } from "../src/mcp/client.js";
import { MCP_SUGGESTIONS } from "../src/mcp/suggestions.js";

const CONFIG_PATH = join(process.cwd(), "data", "mcp-servers.json");

async function cleanConfig() {
  try { await fs.unlink(CONFIG_PATH); } catch { /* not present is fine */ }
}

describe("McpClientManager — CRUD", () => {
  beforeEach(async () => {
    mcpClientManager.__clearForTests();
    await cleanConfig();
  });
  afterEach(async () => {
    mcpClientManager.__clearForTests();
    await cleanConfig();
  });

  it("starts with no servers configured", () => {
    assert.equal(mcpClientManager.list().length, 0);
  });

  it("upsertServer adds a new server", async () => {
    await mcpClientManager.upsertServer({
      id:          "fs",
      displayName: "Filesystem",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      enabled:     false,  // keep false so it doesn't actually try to connect
    });
    assert.equal(mcpClientManager.list().length, 1);
    assert.equal(mcpClientManager.get("fs")?.displayName, "Filesystem");
  });

  it("upsertServer is idempotent — same ID replaces config", async () => {
    await mcpClientManager.upsertServer({
      id: "fs", displayName: "Old", transport: "stdio",
      command: "npx", args: [], enabled: false,
    });
    await mcpClientManager.upsertServer({
      id: "fs", displayName: "New", transport: "stdio",
      command: "npx", args: [], enabled: false,
    });
    assert.equal(mcpClientManager.list().length, 1);
    assert.equal(mcpClientManager.get("fs")?.displayName, "New");
  });

  it("upsertServer rejects missing id", async () => {
    await assert.rejects(
      () => mcpClientManager.upsertServer({ id: "", displayName: "x", transport: "stdio", command: "npx", args: [], enabled: false }),
      /requires id and command/
    );
  });

  it("upsertServer rejects missing command", async () => {
    await assert.rejects(
      () => mcpClientManager.upsertServer({ id: "x", displayName: "x", transport: "stdio", command: "", args: [], enabled: false }),
      /requires id and command/
    );
  });

  it("removeServer wipes the entry", async () => {
    await mcpClientManager.upsertServer({
      id: "fs", displayName: "Filesystem", transport: "stdio",
      command: "npx", args: [], enabled: false,
    });
    await mcpClientManager.removeServer("fs");
    assert.equal(mcpClientManager.list().length, 0);
  });

  it("removeServer is idempotent (no error on unknown id)", async () => {
    await mcpClientManager.removeServer("does-not-exist");
    // No throw == pass
  });
});

describe("McpClientManager — persistence", () => {
  beforeEach(async () => {
    mcpClientManager.__clearForTests();
    await cleanConfig();
  });
  afterEach(async () => {
    mcpClientManager.__clearForTests();
    await cleanConfig();
  });

  it("upsertServer writes config to disk", async () => {
    await mcpClientManager.upsertServer({
      id: "github", displayName: "GitHub", transport: "stdio",
      command: "npx", args: ["-y", "x"], enabled: false,
    });
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.servers.length, 1);
    assert.equal(parsed.servers[0].id, "github");
  });

  it("loadFromDisk restores previously-saved servers", async () => {
    await fs.mkdir(join(process.cwd(), "data"), { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify({
      version: 1,
      servers: [{
        id: "fs", displayName: "Filesystem", transport: "stdio",
        command: "npx", args: [], enabled: true,
      }],
    }), "utf-8");
    await mcpClientManager.loadFromDisk();
    assert.equal(mcpClientManager.list().length, 1);
    assert.equal(mcpClientManager.get("fs")?.enabled, true);
  });

  it("loadFromDisk silently handles missing file (first run)", async () => {
    await mcpClientManager.loadFromDisk();
    assert.equal(mcpClientManager.list().length, 0);
  });

  it("loadFromDisk silently handles corrupt JSON", async () => {
    await fs.mkdir(join(process.cwd(), "data"), { recursive: true });
    await fs.writeFile(CONFIG_PATH, "{ not valid json", "utf-8");
    await mcpClientManager.loadFromDisk();
    assert.equal(mcpClientManager.list().length, 0);
  });
});

describe("McpClientManager — status reporting", () => {
  beforeEach(async () => {
    mcpClientManager.__clearForTests();
    await cleanConfig();
  });
  afterEach(async () => {
    mcpClientManager.__clearForTests();
    await cleanConfig();
  });

  it("getAllStatus includes configured-but-disconnected servers", async () => {
    await mcpClientManager.upsertServer({
      id: "fs", displayName: "Filesystem", transport: "stdio",
      command: "npx", args: [], enabled: false,
    });
    const statuses = mcpClientManager.getAllStatus();
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0].serverId, "fs");
    assert.equal(statuses[0].connected, false);
    assert.equal(statuses[0].toolCount, 0);
  });

  it("getAllTools returns empty when nothing connected", () => {
    assert.deepEqual(mcpClientManager.getAllTools(), []);
  });
});

describe("MCP suggestions", () => {
  it("ships a non-empty curated list", () => {
    assert.ok(MCP_SUGGESTIONS.length > 0);
  });

  it("every suggestion has the required fields", () => {
    for (const s of MCP_SUGGESTIONS) {
      assert.ok(s.id, "missing id");
      assert.ok(s.displayName, "missing displayName");
      assert.ok(s.description, "missing description");
      assert.ok(s.category, "missing category");
      assert.ok(s.config?.command, `${s.id}: missing config.command`);
      assert.equal(s.config.transport, "stdio", `${s.id}: only stdio supported for now`);
    }
  });

  it("includes the common-popular servers (sanity check)", () => {
    const ids = MCP_SUGGESTIONS.map((s) => s.id);
    assert.ok(ids.includes("filesystem"), "missing filesystem suggestion");
    assert.ok(ids.includes("github"), "missing github suggestion");
    assert.ok(ids.includes("fetch"), "missing fetch suggestion");
  });
});
