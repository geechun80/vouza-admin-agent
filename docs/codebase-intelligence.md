# Codebase Intelligence — Understand-Anything

The admin-agent ships with a Claude Code subagent at `.claude/agents/engineering-understand-anything.md` that describes the [Understand-Anything](https://github.com/Lum1104/Understand-Anything) plugin (MIT, 35k stars).

**Important:** Understand-Anything is a **Claude Code Plugin**, not a standalone CLI. Install it via the plugin marketplace, not via npm.

This doc explains **how we use it** across three contexts.

---

## Install (one-time, per dev)

### Already pre-installed on geechun80's machine (2026-05-28)

The marketplace is **already registered globally** at `~/.claude/plugins/known_marketplaces.json` and cloned to `~/.claude/plugins/marketplaces/understand-anything/` with the core package pre-built. Skip to "Activate" below.

### Fresh machine

Inside any Claude Code session:

```
/plugin marketplace add Lum1104/Understand-Anything
/plugin install understand-anything@understand-anything
```

Restart Claude Code after install. The plugin then exposes its slash commands and the analysis pipeline.

### Activate (if marketplace is already registered)

```
/plugin install understand-anything@understand-anything
```

Restart Claude Code. The slash commands (`/understand`, `/understand-chat`, `/understand-dashboard`, `/understand-diff`, `/understand-explain`, `/understand-onboard`, `/understand-domain`, `/understand-knowledge`) become available.

**Other CLIs / IDEs:**
- Cursor / VS Code + Copilot — auto-discovers when this repo's tree is open
- Codex / OpenCode / Gemini CLI / others — use the shell installer at `~/.claude/plugins/marketplaces/understand-anything/install.sh <platform>`
- Full table: see [Platform Compatibility](https://github.com/Lum1104/Understand-Anything#platform-compatibility)

### Why no project-level `.claude/skills/` mirror

The plugin's skill scripts import from `packages/core/dist/` via relative paths — they only resolve correctly inside the plugin's workspace at `~/.claude/plugins/marketplaces/understand-anything/`. Mirroring the skills into the project's `.claude/skills/` would let Claude Code discover them but execution would fail. Better to let the plugin runtime serve them.

The 10 plugin agents (`.claude/agents/architecture-analyzer.md`, `tour-builder.md`, etc.) ARE mirrored locally — those are pure markdown personality definitions with no script dependencies, useful as per-project context.

---

## Context 1 — Vouza Team (developing the admin-agent itself)

The plugin's commands and the bundled subagent at `.claude/agents/engineering-understand-anything.md` work together. Once the plugin is installed, use these triggers in Claude Code:

- **Before a refactor** that touches shared modules (orchestrator/, integrations/, dashboard/api/)
  > *"Analyze admin-agent with Understand-Anything and show impact of changing src/orchestrator/runner.ts"*
- **During PR review** when a diff touches > 5 files
  > *"Run Understand-Anything impact analysis on the files changed in this PR"*
- **When onboarding a new contributor**
  > *"Generate an Understand-Anything guided tour of the admin-agent codebase"*
- **When debugging a regression** caused by a config change
  > *"Which files depend on src/config/loader.ts?"*

The plugin handles all the heavy lifting — multi-agent analysis pipeline, knowledge graph build, interactive dashboard.

---

## Context 2 — Team-shared graph snapshot (when supported)

Once the plugin generates a graph for the project, export and commit a snapshot so new contributors get instant overview without re-running analysis:

```bash
# Inside Claude Code, after running an analysis:
# Use the plugin's export command (slash command — exact syntax depends on plugin version)
# Then:
git add docs/codebase-graph.json
git commit -m "docs: refresh codebase graph snapshot"
```

**Update cadence:** regenerate after every major structural change (new module, new integration, large refactor). PR-review checklist: if `src/orchestrator/`, `src/integrations/`, or `src/dashboard/api/` changed, ask whether the snapshot needs refresh.

---

## Context 3 — Future customer feature (deferred)

For the segment of admin-agent customers who are themselves developers (freelancers managing many client projects, internal teams maintaining legacy code), exposing codebase intelligence as a chat capability would be high-value.

**Proposed integration path** (not yet built):

1. Wrap the Understand-Anything analyzer as an MCP server (per Rule 51)
2. Add to the curated MCP suggestions in `data/mcp-servers.json`
3. Customer adds the MCP server with one click in Setup → MCP
4. Customer says in chat: *"Map my project at C:/code/my-app and tell me where payment processing happens"* — the admin-agent shells out via MCP, generates the graph, queries it, replies with the answer.

**Why deferred:**
- Most current customers (Aerick = ops, Bruce = church admin) are non-developers — wouldn't use this feature
- Needs UI affordance: file picker for project root, dashboard embed, etc.
- The tool itself isn't published as an npm CLI — wrapping it as an MCP server requires either (a) using the plugin runtime, or (b) cloning the repo + invoking the workspace scripts directly. Either path is ~1 day.
- Wait for first paying dev-segment customer to justify the cost

When a dev-segment customer signs, this becomes a 1-day ship.

---

## Hand-off boundaries

Understand-Anything is **read-only**:

- ✅ Map dependencies, surface impact, generate tours, answer Q&A
- ❌ Refactor code, modify files, suggest restructuring

For refactor recommendations based on graph findings, hand off to the **Software Architect** or **Minimal Change Engineer** agents (also in `.claude/agents/`).

---

## Heads-up: the bundled subagent file

The agent definition at `.claude/agents/engineering-understand-anything.md` (from the 144-ai-employees library) describes the tool's capabilities and intended workflows, but its example commands like `npx understand-anything analyze .` are **aspirational** — the actual tool is a Claude Code plugin invoked via slash commands and chat, not via shell. Treat the agent file as a **capabilities-and-personality definition** that pairs with the real plugin once installed.
