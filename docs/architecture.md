# Architecture Deep-Dive

A tour of the agent's runtime architecture. Pairs with the
[API Reference](api-reference.md) for the wire-level view.

> Source files are linked throughout — when in doubt, the code is the
> authoritative spec. Code excerpts here are 5-15 lines max; open the
> linked file for full context.

---

## 1. System overview

```
                                  ┌────────────────────────────────────┐
                                  │   src/dashboard/api/server.ts      │
                                  │   Express on 127.0.0.1:3456        │
                                  │   ─ requireLocalOrigin (CSRF)      │
                                  │   ─ requireDashboardAuth (bearer)  │
                                  └─────────────┬──────────────────────┘
                                                │
            ┌───────────────────────────────────┼────────────────────────────────────┐
            │                                   │                                    │
            ▼                                   ▼                                    ▼
  ┌──────────────────┐              ┌────────────────────┐                ┌───────────────────┐
  │ src/dashboard/   │              │ src/bridge/        │                │ Listeners (per    │
  │   api/chat.ts    │              │   launcher.ts      │                │  channel)         │
  │ (Guide Bot SSE)  │              │ + serviceManager   │                │                   │
  └────────┬─────────┘              └────────┬───────────┘                │ telegram/         │
           │                                 │                            │   listener.ts     │
           │      ┌──────────────────────────┼──────────────────┐         │ whatsapp/         │
           │      │                          │                  │         │   baileysManager  │
           ▼      ▼                          ▼                  ▼         │   wahaListener    │
       ┌──────────────────┐         ┌──────────────────────────────┐      │ email/            │
       │  src/agent/      │◄────────┤  src/tools/registry.ts       │      │   agentMailListener│
       │   loop.ts        │         │  (parallel/serial dispatch)  │      └─────────┬─────────┘
       │  agentLoop()     │         └──────────────┬───────────────┘                │
       └────────┬─────────┘                        │                                │
                │                                  │                                │
                │  ── failover, redactor, ──       │                                │
                │     thinkScrubber, errorClass    │                                │
                │                                  │                                │
                ▼                                  ▼                                ▼
       ┌──────────────────┐           ┌──────────────────────┐         ┌──────────────────────┐
       │ LLM provider     │           │ Tool implementations │         │ src/orchestrator/    │
       │ Anthropic SDK    │           │  email · calendar    │         │   detect → validate  │
       │ /  OpenAI-compat │           │  whatsapp · telegram │         │   → test → save →    │
       │   (fetch)        │           │  sheets · files · …  │         │   confirm → live-test│
       └──────────────────┘           └──────────────────────┘         └──────────────────────┘
                                                                                    │
                                                                                    ▼
                                                                       ┌──────────────────────┐
                                                                       │ Integration adapters │
                                                                       │  + HealthMonitor     │
                                                                       │  (1000-event window) │
                                                                       └──────────────────────┘
```

Every external surface — Telegram message, dashboard SSE, AgentMail poll, WAHA
webhook, REPL command — eventually funnels into `agentLoop()` with its own
isolated `AgentContext`.

---

## 2. The agent loop

Source: [`src/agent/loop.ts`](../src/agent/loop.ts). An async generator that
yields `StreamEvent`s; callers consume with `for await`.

```ts
export async function* agentLoop(
  userMessage: string | any[],
  context:  AgentContext,
  registry: ToolRegistry,
  systemPromptOverride?: string
): AsyncGenerator<StreamEvent> { … }
```

### Event vocabulary

Defined in [`src/types/index.ts`](../src/types/index.ts):

```ts
type StreamEvent =
  | { type: "text_delta";     text: string }
  | { type: "tool_start";     toolName: string; input: unknown }
  | { type: "tool_result";    toolName: string; result: ToolResult }
  | { type: "turn_complete";  turnCount: number }
  | { type: "error";          error: string }
  | { type: "usage";          model: string; inputTokens: number; outputTokens: number };
```

### Per-turn flow

1. **Pick provider** via `pickHealthyProvider()` — skips any provider whose
   circuit breaker is open. If the user's primary is in cooldown, the loop
   transparently starts on a fallback and overrides the model with
   `getDefaultModelFor(fallback)`.
2. **OpenRouter task routing** — `classifyTask()` returns `fast` / `balanced` /
   `flagship` and `selectModelForComplexity()` picks the matching tier model
   from `context.config.openrouterTiers`. Logged structurally; **never** shown
   in chat (cluttered the conversation flow per Aerick's 2026-05-26 feedback).
3. **Audit log** — `appendTurn()` writes the user turn to
   `data/chat-history/<sessionId>.jsonl`, redacted, fire-and-forget.
4. **Context compression** — if the conversation is over 10,000 estimated
   tokens, `compressContext()` summarises the middle so long sessions don't
   blow the context window.
5. **Prompt cache** — the Anthropic native call sets
   `cache_control: { type: "ephemeral" }` on the system prompt. Inspired by
   Hermes v0.14.0's cross-session prefix cache; on a hit, input tokens for
   the system block drop ~90%. Pass-through works on OpenRouter too.
6. **Call the model** — either `client.messages.create()` (Anthropic native)
   or `callOpenAICompatible()` (everyone else, normalising to Anthropic-
   shaped content blocks).
7. **Stream content** —
   - `text` blocks: pass through `scrubThinkBlocks()` to strip
     `<think>…</think>` (DeepSeek-R1 / extended-thinking Claude), then yield
     `text_delta`.
   - `tool_use` blocks: queue for execution, yield `tool_start`.
8. **Execute tools** — `registry.executeTools(calls, context)` runs read-only
   + concurrency-safe tools in parallel; everything else serial. See §3.
9. **Process tool results** — on error, append the
   `[CORRECTION REQUIRED: …]` directive (Hermes-style recovery hint) so the
   model knows to analyse the failure and retry rather than give up.
10. **Safety valves** — 3 consecutive tool errors halts the turn with a
    user-visible message. 60-second `AI_TIMEOUT_MS` hard abort on the LLM
    call. Empty model response (no text, no tool calls) raises the
    "no credits / bad key" hint.

### Error recovery ladder

When the API throws, the [errorClassifier](../src/agent/errorClassifier.ts)
categorises the failure and the loop picks one of:

| Type         | Action                                                                       |
|--------------|------------------------------------------------------------------------------|
| `transient`  | Exponential retry up to `errInfo.maxRetries` (network blip, model overloaded) |
| `rate_limit` | Longer exponential retry                                                     |
| `context_len`| Force-compress messages with `compressContext(..., 128_000, 0.99)`, retry once |
| `auth` / `quota` / `permanent` | Record provider failure, try fallback provider if available |
| `not_found`  | Surface "try a different model" hint                                         |

All retries / fallovers are logged with structured `{ event, from, to,
errorType }` entries but **never** yielded as chat text — the user sees only
a slightly delayed reply.

### Sliding window

After every turn the loop trims `context.messages` to the last 40 entries,
but never cuts so that a `tool_result` ends up first (which would orphan
its matching `tool_use`).

### Background hooks

Throttled / guarded so they never run concurrently:

- `autoReflect()` after every turn — extracts learnings.
- `autoWriteSkill()` when 3+ tools were used — generates a new markdown
  skill from the successful sequence.
- A perf log entry is written to memory every `PERF_LOG_FREQUENCY = 5`
  turns (disk-write throttle).

---

## 3. Tool registry

Source: [`src/tools/registry.ts`](../src/tools/registry.ts).

```ts
buildTool({
  name: "list_calendar_events",
  category: "calendar",
  isReadOnly: true,
  isConcurrencySafe: true,
  inputSchema: z.object({ … }),
  async call(input, context) { return { success: true, data: … }; },
});
```

The registry stores tools by name and exposes:

- `toAPISchemas()` — converts every tool's Zod schema to JSON Schema for the
  LLM tool list (minimal Zod-to-JSON converter inline, no third-party dep).
- `executeTools(calls, context)` — partitions the calls into a
  **parallel** batch (read-only + concurrency-safe) and a **serial** list.
  Parallel batch runs via `Promise.all`; serial runs sequentially with
  `await` between each. Mirrors Claude Code's `toolOrchestration.ts` pattern.
- `executeSingle()` — parses input through the Zod schema, runs the tool,
  wraps the result. If the tool returns a `_visionBlock`, the result is sent
  back as a content array `[text, image]` so vision-capable models can see
  attachments inline.

### Tool error sanitisation

Tool failures get passed back to the model. A malicious file, API response,
or remote service could inject instructions into an error message. Before
re-injection, `sanitizeToolError()` strips known patterns:

```ts
const INJECTION_PATTERNS: RegExp[] = [
  /\b(system|assistant|user)\s*:\s*/gi,                 // role mimicry
  /\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>/gi,             // Llama / Mistral tokens
  /<\|system\|>|<\|user\|>|<\|assistant\|>|<\|im_start\|>|<\|im_end\|>/gi,
  /^#{1,3}\s*(system|instruction|human|assistant)\b/gim,
  /\b(ignore|forget|disregard|override)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|constraints?|guidelines?)\b/gi,
  /\b(you are|you're)\s+(now\s+)?(in\s+)?(developer|admin|unrestricted|jailbreak|debug|god)\s+mode\b/gi,
  /\bnew\s+instructions?\s*:\s*/gi,
];
```

If any pattern matched, ` [Note: parts of this error were sanitized to
prevent injection]` is appended so the model knows the redaction happened.

---

## 4. Orchestrator (M2)

Source: [`src/orchestrator/`](../src/orchestrator/).

Replaces ad-hoc LLM tool retries (the "Aerick incident" of 2026-05-27 — the
bot kept calling `save_integration_credentials` with reformatted JSON until
exhausting its turn budget) with a fixed declarative pipeline:

```
detect → validate → test → save → confirm → live-test
```

### Step interface

```ts
interface Step<TIn = any, TOut = any> {
  readonly name: string;
  run(input: TIn, ctx: OrchestratorContext): Promise<StepResult<TOut>>;
  readonly fallbacks?: Step<TIn, TOut>[];
}

type StepResult<T> =
  | { ok: true;  value: T; note?: string }
  | { ok: false; error: string; suggestedFix?: string; doNotRetry?: boolean };
```

Key invariants enforced by [`runner.ts`](../src/orchestrator/runner.ts):

- A step that returns `ok: true` short-circuits its fallback chain.
- A step with `ok: false, doNotRetry: true` **also** short-circuits the
  fallback chain — the user must change something; further attempts are
  noise.
- Every step runs with a 15-second default timeout
  (`DEFAULT_STEP_TIMEOUT_MS`). The timer is always cleared, even when the
  step wins.
- Fallbacks are silent — they only appear in `attempts[]`, never in the
  surfaced error.

### `doNotRetry` and Rule 56

When `doNotRetry: true` reaches the LLM (via `runIntegrationPipelineTool`),
the system prompt tells the model to **stop calling the tool** and relay the
error + `suggestedFix` to the user verbatim. This kills the retry-loop
behaviour that previously chewed through turns.

### Worked example — Google Calendar

Source: [`src/orchestrator/pipelines/google.ts`](../src/orchestrator/pipelines/google.ts).

1. **`detect`** — branches on credential shape:
   - `{ installed | web }` → it's an OAuth Client ID file by mistake →
     return `doNotRetry` with the exact fix ("paste a Service Account key
     instead, see https://console.cloud.google.com/iam-admin/serviceaccounts").
   - `{ type: "service_account", private_key, client_email, … }` →
     `kind: "service_account"`.
   - `{ gmailUser, gmailPass: <16-char> }` → `kind: "app_password"` (Gmail
     variant only).
2. **`validate`** — schema check (required fields present, `type ===
   "service_account"`, email valid).
3. **`test`** — JWT exchange against
   `https://oauth2.googleapis.com/token` via `google-auth-library` (lazily
   imported so tests skip the dep). Fallback: retry once after a 2-second
   sleep, since `invalid_grant` is usually clock-skew.
4. **`save`** — writes to `ctx.config.credentials.googleSaKey` plus
   `ctx.config.tools.google` with the default scope set. Idempotent.
5. **`confirm`** — no-op success step (placeholder for future post-save
   verification).
6. **`live-test`** — for the calendar variant: `listOneEvent()` against the
   real Calendar API. For Gmail App Password: SMTP STARTTLS handshake +
   send-self verification email.

Every external dependency (fetch, SMTP probe, save fn, send fn, list fn,
token exchange) is injected via `GoogleDeps`, so unit tests don't need to
hit Google.

### Pipeline runner output

```ts
interface PipelineResult {
  success: boolean;
  stepReached: string;                     // last step run (failure = the failing one)
  data?: Record<string, unknown>;          // merged across successful steps
  error?: string;
  suggestedFix?: string;
  doNotRetry?: boolean;
  attempts: AttemptLog[];                  // { step, variant, ok, ms, error? }
}
```

`/api/setup/pipeline/test` (SSE) wraps this runner and streams each
`"step start"` / `"step complete"` log line as an SSE event — see the
[API Reference](api-reference.md#post-apisetuppipelinetest--sse).

---

## 5. Integration interface (Tier 1)

Source: [`src/integrations/`](../src/integrations/).

Before this layer, each channel (Telegram, WhatsApp, AgentMail) and each
tool (AI provider, MCP) had bespoke status checks. Aerick reported seeing
✓ checkmarks alongside live 401 errors — the badges were lying because they
checked field presence, not real liveness.

### Unified contract

```ts
interface Integration {
  readonly id: string;
  readonly displayName: string;
  readonly category: "messaging" | "email" | "calendar" | "files" | "voice" | "ai" | ...;

  isEnabled(): boolean;
  probe(): Promise<IntegrationProbe>;          // MUST NOT throw — wrap errors
  getStatus(): IntegrationStatusReport;        // synchronous, cached
  reset(): Promise<{ ok: boolean; message: string }>;
}
```

All concrete adapters live next to the integration code:
`whatsappIntegration.ts`, `telegramIntegration.ts`, `aiProviderIntegration.ts`,
`agentMailIntegration.ts`, `voiceIntegration.ts`, `emailIntegration.ts`,
`mcpIntegration.ts`. Each registers itself with the singleton
[`integrationRegistry`](../src/integrations/registry.ts) on listener startup.

### HealthMonitor

Source: [`src/integrations/healthMonitor.ts`](../src/integrations/healthMonitor.ts).

Two parallel data structures:

- **Probe history** — capped at 50 entries per integration, populated by
  the background `probeAll()` loop every 60 seconds. Drives the
  `/api/integrations/snapshot` badges.
- **Rolling event window** — capped at `EVENT_WINDOW_SIZE = 1000` events
  per integration via FIFO eviction. Insertion order preserved (oldest
  index 0). Populated by `recordEvent()` calls from anywhere in the agent —
  webhook handlers, tool calls, pipeline test results. Drives the M3
  observability dashboard.

### Percentiles and rollups

`percentile(values, p)` uses linear interpolation between closest ranks
(zero for empty input). `rollupMetrics(id, windowMs)` returns:

```ts
{
  callCount, failureCount, webhookCount, retryCount,
  p50LatencyMs, p95LatencyMs,
  lastSuccessTs, lastErrorTs, lastErrorMessage,    // walks the FULL buffer
}                                                  // so timestamps survive outside the window
```

### Auto-recovery

After `AUTO_RESET_AFTER = 3` consecutive failed probes, HealthMonitor calls
`integration.reset()` automatically — but **only** for known-recoverable
error categories (`stale_session`, `network`, `rate_limit`). Auth/config
failures are never auto-reset (the user must fix them). Rate-limited to one
auto-reset per integration per 5 minutes.

### Circuit-breaker integration

`/api/provider-health` reads the LLM-provider circuit-breaker state from
[`src/agent/providerFailover.ts`](../src/agent/providerFailover.ts):

```
recordFailure → after FAILURE_THRESHOLD=3 within FAILURE_WINDOW_MS=60s
              → circuit opens for COOLDOWN_MS=5min
              → pickHealthyProvider skips it
recordSuccess → clears window + closes circuit
```

Only "provider health" error types (`transient`, `auth`, `quota`,
`rate_limit`, `permanent`) trip the breaker. `context_len` and `not_found`
are user errors and don't count.

---

## 6. Listener pattern

Every channel listener follows the same shape:

```
startXListener(baseCtx, registry)            // idempotent — safe to re-call
stopXListener() / logoutX()
sendXMessage(chatId, text)
on incoming → ChannelQueues.enqueue (per-chat FIFO with depth cap)
            → _getOrCreateSession(chatId)    // per-chat AgentContext
            → agentLoop(framed, session, registry)
            → collect text_deltas, error events
            → send reply
```

Files:
- `src/telegram/listener.ts` — long-poll + webhook (`/api/telegram/webhook`),
  live-streaming with inline keyboards.
- `src/whatsapp/baileysManager.ts` — child-process supervisor (see §7).
- `src/whatsapp/wahaListener.ts` — webhook handler (`/api/whatsapp/webhook`),
  validates `X-Api-Key`.
- `src/email/agentMailListener.ts` — 60-second poll loop against
  `https://api.agentmail.to`, dedup via `data/agentmail-state.json`.

Per-chat sessions are pruned after 2 hours of inactivity. The framed input
includes the sender's name (e.g. `[Message from Alice via WhatsApp]: …`) so
the model always knows who it's talking to.

---

## 7. Baileys worker isolation

Source: [`src/whatsapp/baileysManager.ts`](../src/whatsapp/baileysManager.ts).

Baileys (the unofficial WhatsApp Web library) crashes regularly — bad
session, WS storms, ban events. Running it in-process would take down the
main agent. We fork it to a child:

```ts
const child = fork(WORKER_PATH, [], { stdio: ["pipe","pipe","pipe","ipc"] });
child.send({ type: "start", config: { authDir, allowedSenders, whisperKey, ... } });
```

### IPC contract

Worker → main:

- `qr` `{ data }` — raw QR string
- `status` `{ status }` — `connecting | qr_ready | connected | disconnected | logged_out`
- `incoming_text` `{ chatId, fromName, text, isVoice }`
- `reset_command` `{ chatId }` — user typed `/reset`
- `log` `{ level, message }`

Main → worker:

- `start` `{ config }`
- `send_reply` `{ chatId, text }`
- `stop`

### Allowlist gate (SAFETY-CRITICAL)

Baileys links to the user's personal WhatsApp number. Without a gate, every
friend who texts the user would get an agent reply. The allowlist is
resolved from `config.tools.whatsapp.config.allowedSenders` /
`.allowlist`, normalised to a `string[]`, and passed to the worker on
spawn. Empty list = only the owner's own number can talk to the agent.

### Restart logic

- Clean exit (code 0, intentional stop, or `SIGTERM`) → don't restart.
- Bad session (exit 1) → wipe `data/whatsapp-auth/` before respawn — without
  this the new worker would hit the same auth rejection and crash again.
- Other crashes → exponential backoff `BASE_DELAY_MS = 2_000` doubling up to
  `MAX_DELAY_MS = 30_000`.
- Hard cap `MAX_RESTART_ATTEMPTS = 5` — after this we emit `logged_out` and
  require a manual "Reset connection" from the user. Without this cap,
  re-scanning a banned number caused an infinite restart loop (Aerick
  2026-05-26).

### Disconnect-reason handling

The worker's `connection.update` handler branches on every Baileys
`DisconnectReason` (`connectionReplaced`, `loggedOut`, `restartRequired`,
`timedOut`, etc.) and chooses between graceful exit, bad-session exit, or
silent reconnect — see [Rule 54 in `memory/build_rules_agents.md`].

---

## 8. Security model

### Loopback by default

`DASHBOARD_BIND = "127.0.0.1"` (default) means the OS will not route TCP
to the agent from any other host. No firewall config needed. The
startup-time guard refuses to bind to anything else without
`DASHBOARD_PASSWORD` set — preventing the worst footgun (an accidental
`DASHBOARD_BIND=0.0.0.0` exposing an unauthenticated dashboard to a LAN).

### requireLocalOrigin

CSRF protection for every mutating endpoint. Distinguishes `origin ===
undefined` (no header — safe, validates `Host` header as second layer) from
`origin === ""` (empty string — sandboxed iframe, blocked). Detailed
rationale in the comment on `server.ts` line 121.

### Redactor

Source: [`src/agent/redactor.ts`](../src/agent/redactor.ts). Applied
before every persistent write (skills, memory, perf logs, audit log) and
strips:

- `sk-ant-*`, `sk-*`, `sk-or-v1-*`, `gsk_*`, `AIza*`, `xai-*`
- `gh[pousr]_*` GitHub PAT
- `\d{8,12}:[A-Za-z0-9_-]{35}` Telegram bot tokens
- `Bearer …` headers
- `AC[hex]{32}` / `SK[hex]{32}` Twilio creds
- Generic `api_key/secret/password = "…20+ chars…"` catch-all

Over-redaction (a 40-char random string getting masked) is preferred over
leaks.

### Secret rotation

Backups (`/api/export-config`) include credentials **unmasked** — intended
for the user's own offline storage. The diagnostic bundle
(`/api/diagnostic-bundle`) and `GET /api/config` both run the same
masking pass that the wizard uses (`****` for short, `abcd****wxyz`
otherwise).

### Sandboxed shell tool

Source: [`src/tools/shell.ts`](../src/tools/shell.ts). Defence-in-depth:

1. Base-command allowlist: `npm`, `pm2`, `git`, `node`, `npx`.
2. Per-command sub-command regex (e.g. `git` is restricted to
   `status|pull|log|diff|branch|fetch|remote|describe|shortlog|show|tag|stash list`).
3. Blocked-pattern scan: `rm -rf`, `sudo`, pipe-to-shell, path traversal,
   `dd if=`, `mkfs`, `format C:`, etc.
4. Forced `cwd = process.cwd()`.
5. 30-second hard timeout.
6. 4 000-char stdout/stderr cap.
7. `PM2_ALLOWED_SERVICES` allowlist restricts which services `pm2 start/stop`
   can target.
8. Global kill switch via `SHELL_TOOL_ENABLED=false`.

Every invocation is appended to `data/shell-audit.log`.

### SSRF allowlist for browser tools

Source: [`src/tools/browser/manager.ts`](../src/tools/browser/manager.ts).
The Playwright-based browser tools (`navigate`, `click`, `fill`,
`extractText`, `screenshot`, `waitFor`) block:

- Bare `localhost`, `127.0.0.1`, `::1`, `*.local` (SSRF prevention).
- Anything not in `CORE_ALLOWED` plus the operator's
  `BROWSER_ALLOWED_DOMAINS` extension list.

`CORE_ALLOWED` covers Google, Slack, Telegram, Groq, OpenAI, Anthropic,
AgentMail, GitHub, Microsoft, OpenRouter — the surfaces the agent needs to
visit during real setup flows.

---

## 9. Config flow

```
┌──────────────┐                                                                ┌──────────────┐
│ wizard DOM   │ ── POST /api/config / step/:s ──▶ src/dashboard/api/server.ts │ data/config  │
│ (index.html) │                                   │  saveSetupConfig          │  .json       │
└──────────────┘                                   └─────────────┬─────────────┘──────────────┘
                                                                 │
                                                                 ▼
                                                  src/config/loader.ts
                                                  loadConfigFromJson()
                                                   ─ merges env vars
                                                   ─ applies VOUZA_API_KEY operator fallback
                                                   ─ resolves whisper provider
                                                                 │
                                                                 ▼
                                                  src/bridge/launcher.ts
                                                   launchAgent() → builds AgentContext
                                                                 │
                                                                 ▼
                                                  agent loop + tools + listeners
                                                  (every tool reads from context.config,
                                                   never from process.env at runtime)
```

Key design choice: **once the wizard runs, no tool reads from
`process.env`** — credentials live in `context.config.tools.<name>` and
`context.config.apiKeys.<provider>`. The only env reads are at config-load
time (`loader.ts`) and for operator-defaults (`VOUZA_API_KEY` family).

Empty-string credentials submitted by the wizard are **silently dropped**
on save (see `deepMerge` in `server.ts`) so the "✓ Already saved"
placeholder UI never clobbers a real key with `""`.
