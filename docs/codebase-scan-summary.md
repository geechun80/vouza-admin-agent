# Admin Agent — Codebase Scan Summary

Generated 2026-05-28 from a first-pass `scan-project.mjs` run of the [Understand-Anything](https://github.com/Lum1104/Understand-Anything) plugin. Full file list: [`codebase-scan.json`](codebase-scan.json) (37 KB).

> **Note:** This is the *structural scan* (file inventory + per-file metadata), not the full LLM-driven knowledge graph. The full graph (with summaries, relationships, guided tour) requires running the plugin from inside Claude Code via `/plugin install understand-anything`. See [codebase-intelligence.md](codebase-intelligence.md).

---

## Headline numbers

| Metric | Count |
|---|---|
| Total files scanned | **250** |
| Source files (`src/`) | **106** |
| TypeScript | 89 |
| HTML | 1 (the dashboard SPA) |
| Markdown in src/ | 16 (system prompts + agent persona files) |
| Test files (`tests/`) | **23** |
| Doc files | 24 |
| Complexity classification | **large** |

---

## Source code by module

| Module | Files | What's in it |
|---|---|---|
| `src/tools/` | **25** | All agent tools — email, calendar, sheets, files, voice, webSearch, setup, etc. |
| `src/skills/` | 17 | Auto-loaded skill markdown files |
| `src/agent/` | 13 | Core loop, redactor, classifier, budget, failover, user profile |
| `src/integrations/` | 10 | Tier 1 Integration interface + 7 adapters + HealthMonitor |
| **`src/orchestrator/`** | **8** | M2 self-healing pipeline (types, runner, 3 pipelines, canonicalize, probes) |
| `src/dashboard/` | 6 | Express API + SPA + M3 wizard/health endpoints |
| `src/mcp/` | 4 | Model Context Protocol client + tool bridge |
| `src/whatsapp/` | 4 | Baileys worker + manager + listener + WAHA |
| `src/bridge/` | 3 | Service manager + launcher |
| `src/self-improve/` | 3 | Optimizer (auto-skill writer) |
| `src/config/` | 2 | Loader + models |
| `src/template/` | 2 | Wizard template strings |
| `src/agents/` | 1 | Setup agent scaffold |
| `src/email/` | 1 | AgentMail listener |
| `src/memory/` | 1 | Persistent store |
| `src/tasks/` | 1 | Cron scheduler |
| `src/telegram/` | 1 | Listener (polling + webhook) |
| `src/types/` | 1 | Public types barrel |
| `src/util/` | 1 | Pino logger |
| `src/voice/` | 1 | Whisper transcriber |

---

## Top 15 largest source files

| Lines | File | Notes |
|---:|---|---|
| 7,436 | `src/dashboard/public/index.html` | Single-page dashboard — wizard + chat + Setup panel (M3) + Health panel. Expected size for a self-contained SPA. |
| 1,883 | `src/dashboard/api/server.ts` | Express API surface (20+ endpoints) |
| 1,210 | `src/tools/setup.ts` | Setup tools including `run_integration_pipeline` + canonicalize routing |
| 837 | `src/agent/loop.ts` | Streaming agent loop with provider failover + cache |
| 809 | `src/config/models.ts` | Multi-provider model registry |
| 790 | `src/dashboard/api/chat.ts` | Chat SSE handler + CHAT_SYSTEM_PROMPT |
| 697 | `src/telegram/listener.ts` | Polling + webhook + live streaming + inline keyboards |
| 610 | `src/tools/fileManager.ts` | Workspace-sandboxed file ops (Rule 16) |
| 480 | `src/whatsapp/baileysManager.ts` | Worker manager + allowlist + restart caps |
| 474 | `src/email/agentMailListener.ts` | AgentMail polling + per-thread context |
| 462 | `src/whatsapp/baileysListener.ts` | Legacy in-process listener |
| 439 | `src/whatsapp/baileysWorker.ts` | Child process for Baileys + disconnect handling |
| 410 | `src/tools/email.ts` | SMTP send + IMAP fetch |
| 377 | `src/orchestrator/pipelines/google.ts` | M2 Google pipeline (SA, App Password, OAuth detect) |
| 375 | `src/tools/oauth/handler.ts` | PKCE OAuth callback handler |

---

## Quick takeaways

- **Tools are the biggest module** (25 files) — expected for an agent product
- **Orchestrator is now 8 files** — solid foundation from the M2 push
- **Integrations layer is 10 files** — Tier 1 Connection Foundation paid off in modularity
- **index.html is 7.4K lines** — candidate for code-splitting if it grows much further. Manageable for now because it's a single-page UX.
- **No file > 2,000 lines** in TypeScript — clean separation. The dashboard SPA is the only outlier.

---

## How to refresh this scan

```bash
node .claude/skills/understand/scan-project.mjs . .understand-anything/scan-output.json
cp .understand-anything/scan-output.json docs/codebase-scan.json
# Then re-run the node summary script (see git log of this file for the inline command)
```

For the **full knowledge graph** (with LLM-generated summaries, relationships, guided tours, dashboard visualization), install the plugin from inside Claude Code:

```
/plugin marketplace add Lum1104/Understand-Anything
/plugin install understand-anything
```

Then in chat: *"Use the understand skill to analyze admin-agent"* — the plugin's multi-agent pipeline does the rest.
