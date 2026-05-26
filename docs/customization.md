# Customization Guide

How to make the agent yours. Every section here is feature-complete on
`master` — nothing aspirational.

---

## 1. Changing the AI model

### Via the wizard

Settings → Step 2 → AI Provider card. Pick a provider, paste the key, hit
Test. The dropdown shows every model in `src/config/models.ts`.

### Supported models per provider

| Provider     | Examples                                                                     |
|--------------|------------------------------------------------------------------------------|
| `anthropic`  | `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` |
| `openai`     | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o4-mini`, `o3`, `o3-mini`, `o1`, `o1-mini` |
| `google`     | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-2.0-flash-lite` |
| `xai`        | `grok-3`, `grok-3-mini`, `grok-2`                                            |
| `deepseek`   | `deepseek-chat`, `deepseek-reasoner`                                         |
| `alibaba`    | `qwen-max`, `qwen-plus`, `qwen-turbo`, `qwen3-235b-a22b`, `qwen3-30b-a3b`     |
| `moonshot`   | `kimi-k2`, `moonshot-v1-128k`, `moonshot-v1-32k`, `moonshot-v1-8k`            |
| `openrouter` | 200+ via single key — see the wizard's full list                             |

The single source of truth is [`src/config/models.ts`](../src/config/models.ts).
Adding a new model only requires appending an entry to `AI_MODELS`; the
wizard, the failover defaults, and the model picker all read from there.

### OpenRouter tier routing

When `provider === "openrouter"`, every turn classifies the task and picks
one of three tier models:

```jsonc
// data/config.json
"agent": {
  "openrouterTiers": {
    "fast":     "meta-llama/llama-3.1-8b-instruct:free",
    "balanced": "google/gemini-2.5-flash-lite",
    "flagship": "google/gemini-2.5-flash"
  }
}
```

The classifier lives in [`src/agent/router.ts`](../src/agent/router.ts).
Defaults are exported as `DEFAULT_OPENROUTER_TIERS`.

You can also override via env vars at process start:

```
OPENROUTER_MODEL_FAST=…
OPENROUTER_MODEL_BALANCED=…
OPENROUTER_MODEL_FLAGSHIP=…
```

### Operator-supplied default key

Set `VOUZA_API_KEY` (and optionally `VOUZA_API_PROVIDER`, `VOUZA_API_MODEL`,
`VOUZA_BRAND_NAME`) in `ecosystem.config.cjs` or `start.bat`. When set, the
agent works out-of-the-box for new users with no key entered. The user's
own key (when pasted) always takes priority.

---

## 2. Adding custom tools

Tools live in [`src/tools/`](../src/tools/). One file per logical group.

### The Tool interface

Use `buildTool()` from `src/tools/registry.ts`:

```ts
// src/tools/weather.ts
import { z } from "zod";
import { buildTool } from "./registry.js";

export const getWeatherTool = buildTool({
  name: "get_weather",
  description: "Look up the current temperature for a city.",
  category: "search",                      // see ToolCategory in src/types/index.ts
  isReadOnly: true,                        // no side effects → safe to run in parallel
  isConcurrencySafe: true,                 // safe alongside other read-only tools
  inputSchema: z.object({
    city: z.string().describe("City name, e.g. 'Singapore' or 'New York'."),
  }),
  async call(input, context) {
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(input.city)}?format=j1`);
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      const c = data.current_condition?.[0];
      return {
        success: true,
        data: {
          city:        input.city,
          tempC:       c?.temp_C,
          description: c?.weatherDesc?.[0]?.value,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});
```

### Lifecycle (`executeSingle`)

What the registry does on every tool call (see
[`src/tools/registry.ts`](../src/tools/registry.ts)):

1. Look up the tool by name. Unknown name → returns
   `{ is_error: true, content: "Unknown tool: …" }`.
2. `tool.inputSchema.parse(call.input)` — Zod validates the LLM's args.
   Throws on bad shape; the registry catches and returns a sanitized error.
3. `tool.call(parsed, context)` — your code runs.
4. If `result.success && result._visionBlock`, the tool result is sent back
   to the model as a content array `[text, image]` so vision models can see
   the image.
5. Otherwise, `JSON.stringify(result.data ?? result.error ?? "OK")` is sent.
6. Any thrown error is sanitised by `sanitizeToolError()` (strips role
   mimicry / jailbreak patterns) before re-injection — see
   [Architecture §3](architecture.md#3-tool-registry).

### Naming conventions

- Snake_case for `name` (matches what the LLM API expects).
- Verb-first, action-shaped: `read_emails`, `create_calendar_event`,
  `search_memory`.
- One Zod schema per tool — never share schemas across tools.

### Registering with the dashboard chat

Add your tool to the `allTools` array in
[`src/dashboard/api/chat.ts`](../src/dashboard/api/chat.ts) (`buildRegistry()`):

```ts
import { getWeatherTool } from "../../tools/weather.js";
// …
const allTools = [
  // … existing ones …
  getWeatherTool,
];
```

For the main agent (Telegram / WhatsApp / AgentMail), the registry is
built in `src/bridge/launcher.ts`. Add your tool there too if you want
external channels to use it.

---

## 3. Custom skills

Skills are markdown SOPs the agent loads at startup. Different from tools:

| Skills (markdown)                  | Tools (TypeScript)                  |
|------------------------------------|-------------------------------------|
| Describe **how** to do something    | Provide **what** the agent can call |
| Loaded as injectable system-prompt  | Listed in the API tool catalog       |
| Edit a `.md` file, restart agent    | Edit a `.ts` file, rebuild + restart |
| Good for workflows like "morning brief" | Good for atomic capabilities       |

### Directory layout

Bundled skills live in [`src/skills/bundled/`](../src/skills/bundled/) (e.g.
`triage-email.md`, `daily-briefing.md`, `process-invoice.md`). User skills
go in `data/skills/`. Both directories use the same format.

### SKILL.md format

```markdown
---
name: morning-briefing
displayName: Morning Briefing
description: Generate a one-screen morning report
whenToUse: When the user asks for "morning briefing", "today's overview", or it's 8 AM.
category: reporting
allowedTools:
  - list_calendar_events
  - read_emails
  - search_memory
selfImproveHooks:
  learnFrom: true
---

# Morning Briefing

Run these in parallel:
1. `list_calendar_events` for today (`startDate` = today 00:00, `endDate` = today 23:59).
2. `read_emails` with `count: 10`, `unreadOnly: true`.
3. `search_memory` for "today" or related tasks.

Compose a single message:
- ☀️ Date + greeting
- 📅 Today's meetings (bullet list)
- 📬 Unread email count + 3 most-important subjects
- ✅ Outstanding tasks from memory

Keep under 200 words.
```

The loader is [`src/skills/loader.ts`](../src/skills/loader.ts). Frontmatter
is parsed by `gray-matter`. Skills auto-load on agent startup; restart the
agent to pick up new ones.

### Auto-generated skills

After 3+ successful tool calls in a row, `autoWriteSkill()`
(in [`src/agent/skillWriter.ts`](../src/agent/skillWriter.ts)) extracts the
pattern into a new `.md` file under `data/skills/`. These are recall hints
for next time, not authoritative SOPs — review them before promoting to
`src/skills/bundled/`.

---

## 4. Custom MCP servers

The agent ships with a Model Context Protocol client
([`src/mcp/client.ts`](../src/mcp/client.ts)). Any MCP server becomes a
set of tools the agent can call.

### Adding a server

Edit `data/mcp-servers.json` (or use the dashboard's MCP panel):

```json
{
  "version": 1,
  "servers": [
    {
      "id":          "filesystem",
      "displayName": "Filesystem MCP",
      "command":     "npx",
      "args":        ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Documents"],
      "transport":   "stdio",
      "enabled":     true,
      "env":         {}
    }
  ]
}
```

### Tool naming

Tools from MCP servers are exposed as `<serverId>__<toolName>` in the
registry — e.g. `filesystem__read_file`. The `__` separator prevents
collisions with built-in tools.

### Curated suggestions

[`src/mcp/suggestions.ts`](../src/mcp/suggestions.ts) lists `MCP_SUGGESTIONS`
that the dashboard renders as one-click installs. Add yours there if you
want it in the UI's "Suggested servers" carousel.

### Security caveats

> **MCP servers can do anything the agent can.** An MCP server is just a
> child process the agent forks with full inherited env. Treat installing
> one like running an arbitrary shell command — never install from an
> untrusted source.

The transport is currently `stdio` only (HTTP support is stubbed but not
wired in `client.ts:114`). Each server's stdout/stderr is forwarded to the
agent's log; the connection is auto-retried on drop.

---

## 5. Customising the Guide Bot system prompt

Located in [`src/dashboard/api/chat.ts`](../src/dashboard/api/chat.ts) as
the exported `CHAT_SYSTEM_PROMPT` constant (~380 lines).

### Safe to edit

- The personality / tone section.
- The integration-specific walkthroughs (e.g. Gmail / Telegram / WhatsApp
  setup paths).
- The example phrasings and link copy.
- The "common skipped integrations to offer pro-actively" list.

### Do NOT remove

- The "TOOL-ERROR LOOP PREVENTION" section — without it the bot regresses
  to the 2026-05-27 retry-loop incident (calling
  `save_integration_credentials` 5× with reformatted JSON until exhausting
  turns).
- The "INTEGRATION PIPELINE" section — describes when to call
  `run_integration_pipeline` vs `save_integration_credentials`. Removing it
  causes the bot to skip the structured pipeline.
- The Markdown link rule — bare URLs break in WhatsApp / Telegram clients.
- Tool error handling instructions ("RELAY THE ERROR to the user", "Do NOT
  retry the same tool").

### Main agent prompt

The Telegram / WhatsApp / AgentMail agent uses a separate prompt
(`DEFAULT_SYSTEM_PROMPT` in [`src/agent/loop.ts`](../src/agent/loop.ts)).
Edit it for changes that should propagate to *every* channel rather than
just the dashboard Guide Bot.

---

## 6. Branding / white-label

### Logo & icons

- Replace `src/dashboard/public/images/vee-bot.png` with your own bot
  avatar (used in the chat UI).
- Replace `assets/icon.ico` for the Windows desktop shortcut icon.

### Theme

Theme variables and colours live near the top of
`src/dashboard/public/index.html`. Edit the `:root` CSS custom properties
(`--accent`, `--bg`, `--card`, etc.) to rebrand without touching layout.

### Agent name

Wizard step 1 sets `agent.name` in `data/config.json`. The default is
`AdminAgent`. For installer-level branding (e.g. distributing as
"AcmeBot"):

```
VOUZA_BRAND_NAME=AcmeBot
```

This populates the `/api/operator-defaults` `brandName` field that the
wizard reads.

### Default model + key for OEM distribution

```
VOUZA_API_KEY=sk-or-v1-…
VOUZA_API_PROVIDER=openrouter
VOUZA_API_MODEL=google/gemini-2.5-flash-lite
VOUZA_BRAND_NAME=AcmeBot
```

New users see the dashboard already configured; they only need to add
their own channels.

---

## 7. Webhook integrations

The simplest way to wire n8n / Zapier / Make / a cron job into the agent:

### `POST /api/agent/task`

Send a free-form instruction; get the assistant's reply back as plain JSON.

```bash
curl -X POST http://localhost:3456/api/agent/task \
  -H 'Content-Type: application/json' \
  -d '{"message":"Summarise today calendar and email it to me"}'
```

Response:

```json
{ "success": true, "output": "Today you have 3 meetings ..." }
```

Constraints:

- Agent must be running (`/api/agent/launch` first if not).
- `message` max 10,000 chars.
- CSRF-guarded — your webhook must originate from `localhost` OR send a
  `DASHBOARD_PASSWORD` bearer when in remote mode.

### `POST /api/chat` — streaming

Use when you want the live token stream (e.g. a chatbot frontend). See
[API Reference](api-reference.md#post-apichat--sse).

### `POST /api/setup/pipeline/test` — programmatic setup

If you're automating onboarding (e.g. an installer that pre-configures
Telegram for a customer), POST credentials here and consume the SSE stream
to know when each step completed.

---

## 8. Environment variables reference

> All variables are optional. Defaults are baked into the code. The agent
> reads env vars only at startup — restart after changing.

### Dashboard

| Variable               | Default       | Effect                                                                     |
|------------------------|---------------|----------------------------------------------------------------------------|
| `DASHBOARD_PORT`       | `3456`        | Port the dashboard listens on                                              |
| `DASHBOARD_BIND`       | `127.0.0.1`   | Interface to bind. Anything other than loopback REQUIRES `DASHBOARD_PASSWORD` |
| `DASHBOARD_PASSWORD`   | (empty)       | Bearer token for `Authorization: Bearer …` and `?token=…`. Mandatory in remote mode |

### Operator defaults (OEM / Vouza branding)

| Variable               | Default                                | Effect                                                              |
|------------------------|----------------------------------------|---------------------------------------------------------------------|
| `VOUZA_API_KEY`        | (empty)                                | Fallback LLM key used when the user hasn't set their own            |
| `VOUZA_API_PROVIDER`   | `openrouter`                           | Provider for the fallback key                                       |
| `VOUZA_API_MODEL`      | `google/gemini-2.5-flash-lite`         | Model for the fallback key                                          |
| `VOUZA_BRAND_NAME`     | `Vouza`                                | Brand name shown to new users in the wizard                         |
| `VOUZA_DAILY_BUDGET_USD` | `1.0`                                | Daily spend cap on the fallback key (per agent process)             |
| `VOUZA_LICENSE_SERVER` | (none)                                 | License-check endpoint (optional)                                   |

### LLM providers (alternative to wizard input)

| Variable                  | Effect                                |
|---------------------------|---------------------------------------|
| `ANTHROPIC_API_KEY`       | `apiKeys.anthropic`                   |
| `OPENAI_API_KEY`          | `apiKeys.openai`                      |
| `GOOGLE_AI_API_KEY`       | `apiKeys.google`                      |
| `XAI_API_KEY`             | `apiKeys.xai`                         |
| `DEEPSEEK_API_KEY`        | `apiKeys.deepseek`                    |
| `DASHSCOPE_API_KEY`       | `apiKeys.alibaba`                     |
| `MOONSHOT_API_KEY`        | `apiKeys.moonshot`                    |
| `OPENROUTER_API_KEY`      | `apiKeys.openrouter`                  |
| `AGENT_MODEL`             | Default model id                      |
| `AI_PROVIDER`             | Default provider                      |
| `OPENROUTER_MODEL_FAST`     | OpenRouter fast-tier model          |
| `OPENROUTER_MODEL_BALANCED` | OpenRouter balanced-tier model      |
| `OPENROUTER_MODEL_FLAGSHIP` | OpenRouter flagship-tier model      |

### Agent runtime

| Variable                       | Default                  | Effect                          |
|--------------------------------|--------------------------|---------------------------------|
| `AGENT_NAME`                   | `AdminAgent`             | Display name                    |
| `MEMORY_DIR`                   | `./data/memory`          | Memory store location           |
| `SKILLS_DIR`                   | `./src/skills/bundled`   | Where to load skills from       |
| `LOG_DIR`                      | `./data/logs`            | Log file location               |
| `LOG_LEVEL`                    | `info`                   | Pino log level                  |
| `LOG_FILE_DISABLED`            | (unset)                  | If set, logs only go to stdout  |
| `SELF_IMPROVE_INTERVAL_HOURS`  | `24`                     | How often `autoReflect` runs    |
| `MAX_TURNS_PER_SESSION`        | `20`                     | Agent loop turn budget          |

### Channels (alternative to wizard)

| Variable                       | Effect                                                  |
|--------------------------------|---------------------------------------------------------|
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `GMAIL_EMAIL_ADDRESS` | Gmail App Password setup       |
| `GOOGLE_SERVICE_ACCOUNT_KEY`   | Path/JSON for the unified Google service account        |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_URL` | Telegram bot                            |
| `AGENTMAIL_API_KEY` / `AGENTMAIL_USERNAME` | AgentMail inbox                            |
| `WHATSAPP_WEB_ENABLED` / `WHATSAPP_WEB_SERVER` | Legacy whatsapp-web-server provider |
| `WAHA_SERVER_URL` / `WAHA_API_KEY` / `WAHA_SESSION` | WAHA Docker integration        |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_NUMBER` | Twilio WA  |
| `META_WHATSAPP_ACCESS_TOKEN` / `META_WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API   |

### Tools

| Variable                       | Default     | Effect                                                  |
|--------------------------------|-------------|---------------------------------------------------------|
| `TAVILY_API_KEY`               | (none)      | Web search via Tavily (preferred)                       |
| `SERPER_API_KEY`               | (none)      | Web search via Serper (second preference)               |
| `BRAVE_SEARCH_KEY`             | (none)      | Web search via Brave (third). Without any, falls back to DuckDuckGo (no key needed) |
| `BROWSER_ALLOWED_DOMAINS`      | (none)      | Comma-separated extra domains the Playwright browser tools may visit |
| `SETUP_BROWSER_TTL_MS`         | `600000`    | Inactivity timeout for browser sessions (default 10 min) |
| `PLAYWRIGHT_HEADED`            | `false`     | `true` to show the browser window (useful for OAuth consent) |
| `SETUP_AGENT_ENABLED`          | `false`     | Master switch for the Playwright-based setup agent      |
| `SHELL_TOOL_ENABLED`           | `true`      | Set to `false` to disable the sandboxed shell tool entirely |
| `PM2_ALLOWED_SERVICES`         | `admin-agent` | Comma-separated services the shell tool may `pm2 start/stop` |
| `OAUTH_CALLBACK_PORT`          | (default)   | Local port for the OAuth helper                         |

### Where to set them

- **Docker:** `.env` next to `docker-compose.yml`.
- **PM2:** `ecosystem.config.cjs` → `env: { … }` block.
- **Windows one-click:** `start.bat` `set VAR=…` lines.
- **Native Node dev:** `.env` in project root (auto-loaded by `dotenv`).
