# Codebase Intelligence — Understand-Anything Agent

The admin-agent ships with a Claude Code subagent at `.claude/agents/engineering-understand-anything.md` that wraps the [Understand-Anything](https://github.com/Lum1104/Understand-Anything) tool (MIT, 35k stars). It turns any project into an interactive knowledge graph with dependency maps, guided tours, impact analysis, and natural-language Q&A.

This doc explains **how we use it** across three contexts.

---

## Context 1 — Vouza Team (developing the admin-agent itself)

The subagent is invokable from any Claude Code session running inside this repo. Triggers:

- **Before a refactor** that touches shared modules (orchestrator/, integrations/, dashboard/api/)
  > "Use the Understand-Anything agent to map impact of changing src/orchestrator/runner.ts"
- **During PR review** when a diff touches > 5 files
  > "Run impact analysis on the files changed in this PR"
- **When onboarding a new contributor**
  > "Generate a guided tour of the admin-agent codebase"
- **When debugging a regression** caused by a config change
  > "Which files depend on src/config/loader.ts?"

### One-time setup per dev machine

```bash
# Windows (PowerShell)
irm https://raw.githubusercontent.com/Lum1104/Understand-Anything/main/install.ps1 | iex

# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/Lum1104/Understand-Anything/main/install.sh | bash -s claude-code
```

After install, just invoke the agent in Claude Code — it handles the rest.

### First analysis of admin-agent

```bash
# From admin-agent project root
npx understand-anything analyze .
npx understand-anything dashboard
# Opens http://localhost:3847 with interactive graph
```

The `.understand-anything/` cache directory is gitignored — each dev re-generates locally. The exception is the team-shared snapshot (see Context 2 below).

---

## Context 2 — Team-shared graph snapshot (committed)

To give new contributors an instant overview without waiting for analysis:

```bash
npx understand-anything export --format json > docs/codebase-graph.json
git add docs/codebase-graph.json
```

The committed snapshot loads in the dashboard via "Load from file" — new devs can browse without ever running the analyzer themselves.

**Update cadence:** regenerate the snapshot after every major structural change (new module, new integration, large refactor). Add a check in PR review: if `src/orchestrator/`, `src/integrations/`, or `src/dashboard/api/` changed and the snapshot wasn't updated, the reviewer asks for it.

---

## Context 3 — Future customer feature (deferred)

For the segment of admin-agent customers who are themselves developers (freelancers managing many client projects, internal teams maintaining legacy code), exposing this as a chat capability would be high-value.

**Proposed integration path** (not yet built):

1. Wrap Understand-Anything as an MCP server (per Rule 51)
2. Add to the curated MCP suggestions in `data/mcp-servers.json`
3. Customer adds the MCP server with one click in Setup → MCP
4. Customer says in chat: *"Map my project at C:/code/my-app and tell me where payment processing happens"* — the admin-agent shells out via MCP, generates the graph, queries it, replies with the answer.

**Why deferred:**
- Most current customers (Aerick = ops, Bruce = church admin) are non-developers — wouldn't use this feature
- Needs UI affordance: file picker for project root, dashboard embed, etc.
- MCP wrapper is ~1 day of work — wait for first paying dev-segment customer to justify the cost

When a dev-segment customer signs, this becomes a 1-day ship.

---

## Hand-off boundaries

The Understand-Anything agent is **read-only**:

- ✅ Map dependencies, surface impact, generate tours, answer Q&A
- ❌ Refactor code, modify files, suggest restructuring

For refactor recommendations based on graph findings, hand off to the **Software Architect** or **Minimal Change Engineer** agents (also in `.claude/agents/`).

---

## Quick reference

| Task | Command |
|---|---|
| First-time analysis | `npx understand-anything analyze .` |
| Incremental re-analysis | `npx understand-anything analyze . --incremental` |
| Open interactive dashboard | `npx understand-anything dashboard` |
| Impact of a file change | `npx understand-anything impact src/path/file.ts` |
| Impact of last commit | `npx understand-anything impact --git-diff HEAD~1` |
| Natural-language Q&A | `npx understand-anything ask "what happens when…"` |
| Generate guided tour | `npx understand-anything tour --output CODEBASE_TOUR.md` |
| Export for team | `npx understand-anything export --format json > docs/codebase-graph.json` |
