# API Reference

All HTTP endpoints exposed by the dashboard backend (`src/dashboard/api/server.ts`).
Default base URL: `http://localhost:3456`.

> Everything is JSON unless noted. SSE endpoints stream `text/event-stream`.
> Source of truth: `src/dashboard/api/server.ts` (the values, errors, and
> auth predicates documented here are taken verbatim from that file).

---

## Authentication

The dashboard has **two layers** of protection:

### 1. Loopback-only by default

The server binds to `127.0.0.1` (controlled by `DASHBOARD_BIND`). On a default
install nothing outside the host can reach it — the OS already blocks remote
access to loopback. No auth required.

### 2. Bearer token (remote-access mode)

When `DASHBOARD_BIND` is anything other than `127.0.0.1` / `localhost` (e.g.
`0.0.0.0` for Docker / Tailscale), `DASHBOARD_PASSWORD` becomes **mandatory**.
The server **refuses to start** without it. Every `/api/*` request must then
include:

```
Authorization: Bearer <DASHBOARD_PASSWORD>
```

…or, for SSE / EventSource which cannot set headers:

```
GET /api/chat?token=<DASHBOARD_PASSWORD>
```

The compare is constant-time. Webhook paths (`/api/whatsapp/webhook`,
`/api/telegram/webhook`), `/api/operator-defaults`, and `/api/models` are
exempt — they have their own signed payloads or expose no secrets.

### 3. CSRF guard (`requireLocalOrigin`)

All mutating endpoints additionally require the request's `Origin` header to
be `http://localhost:*` / `http://127.0.0.1:*`, OR for the `Origin` header to
be absent **and** the `Host` header to be loopback. Empty-string Origin and
`null` Origin (sandboxed iframes) are rejected with HTTP 403.

---

## Setup & Wizard

### `GET /api/config`

Returns the current saved config with **all credentials masked**
(`abcd****wxyz`). Mask covers any field containing `key`, `token`, `secret`,
`pass`, or `password`. No auth required beyond the dashboard layer.

```bash
curl http://localhost:3456/api/config
```

Response shape:

```json
{
  "agent":    { "name": "AdminAgent", "model": "claude-sonnet-4-6", "provider": "anthropic", "language": "en", "timezone": "Asia/Singapore" },
  "channels": { "email": { "enabled": false, "provider": "gmail", "config": {} }, ... },
  "tools":    { "calendar": { "enabled": false, "provider": "google", "config": {} }, ... },
  "credentials": { "anthropicApiKey": "sk-a****abcd", ... },
  "skills":   { "enabled": [], "schedules": {} },
  "setupCompleted": false
}
```

### `POST /api/config`

CSRF-guarded. Deep-merges the JSON body into `data/config.json`. Empty-string
credentials are silently ignored so the wizard's "✓ Already saved" placeholders
never wipe real secrets on disk.

```bash
curl -X POST http://localhost:3456/api/config \
  -H 'Content-Type: application/json' \
  -d '{"agent":{"name":"Sales Bot"}}'
```

### `POST /api/config/step/:step`

Wizard-step writer. `:step` is one of `agent`, `channels`, `tools`,
`credentials`, `skills`, or `complete`. The last one flips `setupCompleted=true`
and stamps `setupCompletedAt`.

### `POST /api/reset-config`

Stops the running agent (if any) and deletes `data/config.json` so the next
page load starts a fresh wizard. CSRF-guarded.

### `GET /api/operator-defaults`

Whether a Vouza-supplied default key is configured via `VOUZA_API_KEY` env.
**Never exposes the key itself** — only a boolean. Public (used to decide
whether to show the "use Vouza key" CTA before the user has logged in).

```json
{
  "hasDefaultKey": true,
  "defaultProvider": "openrouter",
  "defaultModel": "google/gemini-2.5-flash-lite",
  "brandName": "Vouza"
}
```

### `GET /api/models`

Full model catalog (provider list + per-provider model list). Public — contains
no secrets, used by the wizard's model picker.

### `POST /api/test-connection`

CSRF-guarded. Tests a single integration's credentials live.

```bash
curl -X POST http://localhost:3456/api/test-connection \
  -H 'Content-Type: application/json' \
  -d '{"type":"telegram","config":{"telegramBotToken":"123:abc..."}}'
```

`type` is one of: `anthropic`, `openrouter`, `ai-provider`, `telegram`,
`whatsapp` (Twilio), `whatsapp-web`, `waha`, `groq-whisper`, `openai-whisper`,
`agentmail`, `gmail`, `google-unified`, `google-calendar`, `google-sheets`.

Response: `{ success: boolean, message: string }`.

### `POST /api/setup/pipeline/test` — SSE

The M3 orchestrator pipeline test. Streams step-by-step progress as
Server-Sent Events. CSRF-guarded.

Request body:
```json
{ "integration": "gmail", "input": { "credentials": { "gmailUser": "...", "gmailPass": "abcd efgh ijkl mnop" } } }
```

Valid integrations: `gmail`, `google_calendar`, `telegram`, `whatsapp`.

Event stream:

| Event   | `data` payload                                                                                  |
|---------|-------------------------------------------------------------------------------------------------|
| `start` | `{ integration, pipeline, steps: ["detect","validate","test","save","confirm","live-test"] }`    |
| `step`  | `{ step: "<name>", status: "running" }` then `{ step, status: "ok"\|"failed", ms }`              |
| `done`  | `{ success, stepReached, totalMs, error?, suggestedFix?, doNotRetry?, attempts }`                |
| `error` | `{ error }`                                                                                      |

`doNotRetry: true` means the user MUST change something — the LLM should not
loop on the same input.

```bash
curl -N -X POST http://localhost:3456/api/setup/pipeline/test \
  -H 'Content-Type: application/json' \
  -d '{"integration":"telegram","input":{"credentials":{"telegramToken":"123:abc..."}}}'
```

---

## Integration Status & Health

### `GET /api/integrations/snapshot`

Single snapshot of every registered integration's status + last probe +
auto-recovery state. CSRF-guarded.

```json
{
  "generatedAt": "2026-05-27T10:30:00.000Z",
  "meta":     [{ "id": "telegram", "displayName": "Telegram", "category": "messaging" }, ...],
  "snapshot": {
    "telegram": { "status": { "status": "connected" }, "lastProbe": {...}, "consecutiveFailures": 0, "recentProbeCount": 60, "recentFailureCount": 0 }
  }
}
```

### `POST /api/integrations/:id/probe`

Run a one-shot live probe right now. Returns `{ id, displayName, probe }`
where `probe` is `{ ok, latencyMs, detail?, errorCategory?, ts, credentialPreview? }`.
CSRF-guarded.

### `POST /api/integrations/:id/reset`

Wipes the integration's session state (e.g. `data/whatsapp-auth/` for
Baileys) and reconnects. Returns `{ ok, message }`. CSRF-guarded.

### `GET /api/health/detailed`

M3 observability rollup. No network calls — pure in-memory aggregation from
the HealthMonitor's rolling 1000-event-per-integration window. CSRF-guarded.

```json
{
  "generatedAt": "...",
  "integrations": [
    {
      "id": "telegram", "displayName": "Telegram", "category": "messaging",
      "status": { "status": "connected" },
      "lastSuccessTs": 1735, "lastErrorTs": null, "lastErrorMessage": null,
      "p50LatencyMs": 142, "p95LatencyMs": 380,
      "callCount1h": 27, "failureCount1h": 0,
      "retryCount24h": 0, "webhookCount24h": 14
    }
  ],
  "webhookLog": [{ "ts", "integration", "verified", "source", "ok" }],
  "failures":   [{ "ts", "integration", "error", "source" }]
}
```

`webhookLog` is capped at 50 entries across all integrations (newest first).
`failures` is capped at 20.

### `GET /api/provider-health`

Per-LLM-provider circuit breaker state. Empty `{}` means every provider is
healthy.

```json
{
  "anthropic":  { "failuresInWindow": 0, "circuitOpen": false, "cooldownRemaining": 0 },
  "openrouter": { "failuresInWindow": 3, "circuitOpen": true,  "cooldownRemaining": 180000 }
}
```

### `GET /api/budget-status`

Today's spend against the Vouza fallback-key daily cap. Only meaningful when
the agent is running on `VOUZA_API_KEY` — for user-owned keys, spend is
reported as `$0` (you control your own platform limits).

```json
{ "date": "2026-05-27", "spentUsd": 0.0143, "capUsd": 1.0, "remaining": 0.9857, "pctUsed": 1, "byProvider": { ... } }
```

### `GET /api/connection-test`

Live diagnostic that hits every configured integration's real endpoint and
reports per-integration pass/fail with the specific error. The page Aerick
asked for after seeing ✓ checkmarks alongside actual 401s. CSRF-guarded.

### `GET /api/recent-logs?limit=N`

Last N (1-500, default 50) parsed JSON lines from
`data/logs/admin-agent.log`. CSRF-guarded.

### `GET /api/diagnostic-bundle`

One-click "report an issue" download. Returns a single JSON file containing
runtime info, REDACTED config, agent status, provider health, budget
snapshot, last 100 log lines, last 5 shell-audit entries. CSRF-guarded.

### `GET /api/version`

`{ version, changelog }` — version comes from `package.json`, changelog
from `CHANGELOG.md` if present.

### `GET /api/export-config` · `POST /api/import-config`

Full backup / restore. **Export includes credentials unmasked** — intended
for the user's own personal backup, never shared publicly. Import does an
auto-backup of the current config to `data/config.json.before-restore-*.bak`
before overwriting. Import validates envelope (`format: "vouza-admin-agent-backup"`,
`version: 1`). CSRF-guarded.

### `POST /api/create-shortcut`

Windows-only. Creates `~/Desktop/Vouza Admin Agent.lnk` pointing at
`start-background.vbs` with the Vee icon. CSRF-guarded.

---

## Chat / Agent

### `POST /api/chat` — SSE

The live Guide Bot streaming endpoint. CSRF-guarded.

Request body:

```json
{
  "message":      "Help me set up Telegram",
  "sessionId":    "<browser-uuid>",
  "apiKey":       "(optional override)",
  "imageBase64":  "(optional)",
  "imageMimeType":"(optional, when imageBase64 present)",
  "wizardStep":   2,
  "userName":     "Aerick",
  "attachedFileContent": "(optional .json/.txt body, capped at 200 KB)",
  "attachedFileName":    "(optional)"
}
```

Response is a stream of `data: <json>\n\n` chunks. Event types:

| `type`              | Fields                                                    |
|---------------------|-----------------------------------------------------------|
| `text_delta`        | `{ text }` — assistant token-stream output                |
| `tool_start`        | `{ toolName, input }`                                     |
| `tool_result`       | `{ toolName, result: { success, data } }`                 |
| `credential_saved`  | `{ slug, integration }` — synthetic, fires when `save_integration_credentials` succeeds so the wizard can update card badges without polling |
| `turn_complete`     | `{ turnCount }`                                           |
| `error`             | `{ error }`                                               |
| `done`              | (no payload) — sent at end of every response              |

Note: `usage` events from the agent loop are consumed internally by the
budget tracker and never reach the browser.

```bash
curl -N -X POST http://localhost:3456/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"What can you do?","sessionId":"demo-1"}'
```

### `DELETE /api/chat/session/:sessionId`

Resets a chat session's conversation history. CSRF-guarded.

### `POST /api/transcribe`

Voice transcription via Whisper (Groq or OpenAI). Body: `{ audioBase64,
mimeType, filename?, language? }`. Returns `{ success, transcript }` or
`{ success: false, error }`. CSRF-guarded. Max body 30 MB.

### `POST /api/agent/launch`

Launches the agent process (or returns `{ alreadyRunning: true }`).
Pre-flights for an available AI key (user key or `VOUZA_API_KEY`).
CSRF-guarded.

### `POST /api/agent/stop`

Stops the running agent. CSRF-guarded.

### `GET /api/agent/status` · `GET /api/status`

Agent runtime status snapshot:

```json
{ "running": true, "uptime": 1234, "tasksCompleted": 5, "memoryEntries": 12, "skillsLoaded": 6, "lastActivity": 1735... }
```

### `POST /api/agent/task`

One-shot task — accumulates `text_delta` events from a single agentLoop run
and returns the concatenated output as plain JSON. CSRF-guarded.

Body: `{ "message": "..." }` (max 10,000 chars). Response: `{ success, output }`.
Convenient for n8n / Zapier webhooks that just want a string.

### Conversation history (`/api/conversations`)

Client-managed conversation store. Files in `data/conversations/`.

| Method | Path                          | Purpose                                                         |
|--------|-------------------------------|-----------------------------------------------------------------|
| GET    | `/api/conversations`          | List metadata (newest first). CSRF-guarded.                     |
| GET    | `/api/conversations/:id`      | Get full conversation. ID restricted to `[a-zA-Z0-9_-]{1,64}`.  |
| POST   | `/api/conversations/:id`      | Create / update.                                                |
| DELETE | `/api/conversations/:id`      | Delete (idempotent — already-gone returns 200).                 |

### Memory (`/api/memories`)

Agent memory store (`data/memory/`).

| Method | Path                       | Purpose                                            |
|--------|----------------------------|----------------------------------------------------|
| GET    | `/api/memories`            | List all entries, newest first.                    |
| POST   | `/api/memories`            | Create. Body: `{ type, title, content, tags }`.    |
| DELETE | `/api/memories/:id`        | Remove.                                            |

All CSRF-guarded.

---

## WhatsApp

### `GET /api/whatsapp/qr-stream` — SSE

Streams Baileys QR codes and connection status for the dashboard's "Connect
WhatsApp" flow. CSRF-guarded.

Event types:

| Event       | Payload                                       |
|-------------|-----------------------------------------------|
| `connected` | `{ message }` — already connected, stream ends |
| `qr`        | `{ dataUrl }` — base64 data-URL of the QR PNG  |
| `status`    | `{ status }` — one of `connecting`, `qr_ready`, `connected`, `disconnected`, `logged_out` |
| `error`     | `{ message }`                                 |

The stream closes once `status === "connected"` or `"logged_out"`.

### `GET /api/whatsapp/status`

`{ "connected": true|false }` — quick liveness check.

### `POST /api/whatsapp/reset`

Stops the worker, deregisters with WhatsApp, and DELETES the cached auth
files in `data/whatsapp-auth/`. The next `qr-stream` call will start a fresh
pairing. Fixes the common "Invalid QR code" loop. CSRF-guarded.

### `POST /api/whatsapp/logout`

Stops the Baileys listener (without wiping auth). Next start will reconnect
with saved credentials. CSRF-guarded.

### `POST /api/whatsapp/webhook`

Inbound WAHA event webhook. Public — not CSRF-guarded (WAHA is an external
service). Schema-validated: must have `event: string`, `payload: object`,
`session: string`. Authenticated via the `X-Api-Key` header (matched against
the WAHA api key configured in the wizard) when the user has WAHA configured.
ACKs immediately with `{ success: true }`, then dispatches to the agent.

### MCP — `/api/mcp/servers`

Model Context Protocol server management.

| Method | Path                              | Purpose                                                            |
|--------|-----------------------------------|--------------------------------------------------------------------|
| GET    | `/api/mcp/servers`                | List configured servers, statuses, curated suggestions, tool count |
| POST   | `/api/mcp/servers`                | Upsert config `{ id, command, args?, env?, transport?, enabled }`  |
| DELETE | `/api/mcp/servers/:id`            | Remove server                                                      |
| POST   | `/api/mcp/servers/:id/connect`    | Disconnect + reconnect (useful after env var fix)                  |

All CSRF-guarded. Persists to `data/mcp-servers.json`.

---

## Telegram

### `POST /api/telegram/webhook`

Public webhook called by Telegram itself. Verifies the
`X-Telegram-Bot-Api-Secret-Token` header against the secret set during
`setWebhook` (rejects with 403 on mismatch). ACKs with `{ ok: true }`
immediately, then dispatches to `handleTelegramWebhookUpdate`. Body is the
raw Telegram update object.

---

## Email / AgentMail

### `GET /api/agentmail/status`

```json
{ "configured": true, "inbox": "admin-agent@agentmail.to" }
```

Returns `{ configured: false, inbox: null }` when AgentMail hasn't been set up.

---

## PDPA / Audit

Server-side append-only audit log of every turn that flowed through the
agent. Distinct from `/api/conversations` (which is client-managed).
Persisted to `data/chat-history/<sessionId>.jsonl` with secrets redacted.

| Method | Path                              | Purpose                                              |
|--------|-----------------------------------|------------------------------------------------------|
| GET    | `/api/chat-history?limit=N`       | List session summaries, newest first (max 500)       |
| GET    | `/api/chat-history/:sessionId`    | Full transcript — PDPA right of access               |
| DELETE | `/api/chat-history/:sessionId`    | Wipe transcript — PDPA right to erasure              |

All CSRF-guarded.

```bash
curl http://localhost:3456/api/chat-history?limit=10
```

---

## Services

The agent's listener processes (Telegram, WhatsApp, AgentMail) are managed
by a ServiceManager that exposes per-service health.

### `GET /api/services/health`

```json
{
  "running": true,
  "healthy": true,
  "services": [
    { "name": "telegram", "status": "running", "lastError": null, ... }
  ]
}
```

Returns `{ running: false, services: [] }` when the agent isn't launched.

### `POST /api/services/:name/restart`

Restarts a single named listener. `name` is allowlisted to
`[a-zA-Z0-9_-]{1,40}`. CSRF-guarded. Returns
`{ success: true, health }` on success.

---

## Static / SPA

| Path     | Behavior                                                |
|----------|---------------------------------------------------------|
| `/*`     | Falls through to `src/dashboard/public/index.html`      |
| `/static/*` | Served from `src/dashboard/public/` by `express.static` |

---

## Error format

Standard error response:

```json
{ "success": false, "error": "<message>" }
```

For pure reads, errors may return `{ "error": "<message>" }` with a 4xx/5xx
status. SSE endpoints emit an `error` event then close the stream.
