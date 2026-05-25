// =============================================================================
// Curated MCP Server Suggestions
//
// Quality-of-life shortcut for the dashboard. These are popular, well-tested
// MCP servers that users can install with one click. Users can still add
// custom servers (any executable that speaks MCP over stdio works).
//
// Note: most servers require `npx` to be available on the host. For Docker
// deployments, `npx` is included in the node:alpine base image.
// =============================================================================

import type { McpServerSuggestion } from "./types.js";

export const MCP_SUGGESTIONS: McpServerSuggestion[] = [
  // ── Files ────────────────────────────────────────────────────────────────
  {
    id:          "filesystem",
    displayName: "Filesystem",
    description: "Read, search, and write files in a specific directory.",
    category:    "files",
    installHint: "Default path: ~/agent-files. Change to whichever directory your agent should access.",
    config: {
      displayName: "Filesystem",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-filesystem", "~/agent-files"],
    },
  },

  // ── Dev / Code ───────────────────────────────────────────────────────────
  {
    id:          "github",
    displayName: "GitHub",
    description: "Browse repos, read code, manage issues + PRs. Needs a personal access token.",
    category:    "dev",
    installHint: "Generate a PAT at github.com/settings/tokens (recommended scopes: repo, read:user).",
    config: {
      displayName: "GitHub",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: "<paste-your-token-here>",
      },
    },
  },
  {
    id:          "git",
    displayName: "Git (local)",
    description: "Inspect and manipulate a local git repository.",
    category:    "dev",
    installHint: "Set the working directory in args to the repo path.",
    config: {
      displayName: "Git",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-git", "--repository", "."],
    },
  },

  // ── Data ─────────────────────────────────────────────────────────────────
  {
    id:          "postgres",
    displayName: "Postgres",
    description: "Run read-only SQL queries against a Postgres database.",
    category:    "data",
    installHint: "Use a READ-ONLY user. Connection string format: postgres://user:pass@host:5432/dbname",
    config: {
      displayName: "Postgres",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/db"],
    },
  },
  {
    id:          "sqlite",
    displayName: "SQLite",
    description: "Read and query a local SQLite database file.",
    category:    "data",
    installHint: "Point at any .sqlite or .db file.",
    config: {
      displayName: "SQLite",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./data/example.db"],
    },
  },

  // ── Messaging / Productivity ────────────────────────────────────────────
  {
    id:          "slack",
    displayName: "Slack",
    description: "Send messages, read channels, search messages. Needs a Slack bot token.",
    category:    "messaging",
    installHint: "Create a Slack app at api.slack.com/apps, install to workspace, copy the Bot OAuth token.",
    config: {
      displayName: "Slack",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-slack"],
      env: {
        SLACK_BOT_TOKEN:    "xoxb-your-token-here",
        SLACK_TEAM_ID:      "your-team-id",
      },
    },
  },

  // ── Search ───────────────────────────────────────────────────────────────
  {
    id:          "brave-search",
    displayName: "Brave Search",
    description: "Web search via Brave's API. Needs a Brave Search API key (free tier available).",
    category:    "search",
    installHint: "Get your free API key at brave.com/search/api.",
    config: {
      displayName: "Brave Search",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-brave-search"],
      env: {
        BRAVE_API_KEY: "<paste-your-key-here>",
      },
    },
  },
  {
    id:          "fetch",
    displayName: "Fetch (HTTP)",
    description: "Fetch and read content from any URL. Useful for letting the agent browse the web.",
    category:    "search",
    installHint: "No credentials needed — works out of the box.",
    config: {
      displayName: "Fetch",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-fetch"],
    },
  },

  // ── Other ────────────────────────────────────────────────────────────────
  {
    id:          "memory",
    displayName: "Memory",
    description: "Persistent knowledge graph the agent can read from and write to across sessions.",
    category:    "other",
    installHint: "Stores data in a JSON file by default — no extra setup.",
    config: {
      displayName: "Memory",
      transport:   "stdio",
      command:     "npx",
      args:        ["-y", "@modelcontextprotocol/server-memory"],
    },
  },
];
