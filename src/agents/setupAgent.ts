// =============================================================================
// Setup Execution Agent — Phase 3
//
// A dedicated background agent that handles the heavy lifting of credential
// acquisition and environment configuration, freeing the guide bot to stay
// lightweight and conversational.
//
// Architecture
// ────────────
//
//   User ──chat──► Guide Bot (conversational, fast)
//                      │
//                      │  spawn / delegate via spawnSetupAgent()
//                      ▼
//              Setup Execution Agent  (background, browser-capable)
//                      │
//          ┌───────────┼─────────────────┐
//          ▼           ▼                 ▼
//     Browser Tools  API Validators  OAuth Handler
//     (Playwright)   (live tests)    (token exchange)
//                      │
//                      ▼
//              save_integration_credentials (on success)
//
// Current status
// ──────────────
//   Phase 1  ✅  API Validator (src/tools/setupValidator.ts) — live now
//   Phase 2  ✅  Hot-reload (agentBridge + serviceManager.restart) — live now
//   Phase 3  🔧  This file — browser tools are stubs, agent loop wired up
//
// To activate Phase 3:
//   npm install playwright
//   npx playwright install chromium
//   Set SETUP_AGENT_ENABLED=true in .env
// =============================================================================

import { randomUUID }    from "crypto";
import chalk             from "chalk";
import type { AgentContext, ToolDefinition } from "../types/index.js";
import { ToolRegistry }  from "../tools/registry.js";
import { agentLoop }     from "../agent/loop.js";
import { loadConfigFromJson } from "../config/loader.js";
import { testCredentialTool } from "../tools/setupValidator.js";
import { saveIntegrationCredentialsTool, getSetupStatusTool } from "../tools/setup.js";
import { webSearchTool }  from "../tools/webSearch.js";
import { saveMemoryTool, searchMemoryTool } from "../tools/memory.js";

// ── Browser tool stubs ────────────────────────────────────────────────────────
// These become real Playwright implementations in Phase 3.
// Importing them here wires them into the agent registry automatically.
//
// import {
//   browserNavigateTool,
//   browserClickTool,
//   browserFillTool,
//   browserExtractTextTool,
//   browserScreenshotTool,
//   browserWaitForTool,
//   oauthFlowTool,
// } from "../tools/browser/index.js";

// ── OAuth handler stub ────────────────────────────────────────────────────────
// Opens a local redirect server on :3457/oauth/callback, launches the browser
// to the provider consent URL, catches the code, exchanges for tokens.
//
// import { oauthHandlerTool } from "../tools/oauth/handler.js";

// ── Setup Agent system prompt ─────────────────────────────────────────────────

const SETUP_AGENT_PROMPT = `You are a Setup Execution Agent — a specialist AI that configures integrations
programmatically on behalf of the user, delegated by the Guide Bot.

## YOUR ONLY JOB
Complete the specific setup task you were given. Do not chat. Do not ask for clarification.
Execute. If you cannot complete the task, return a structured failure report with the exact
blocker so the Guide Bot can inform the user.

## EXECUTION FLOW
1. Call get_setup_status to understand current state
2. For each credential you need:
   a. Use browser tools to navigate to the credential source (if available)
   b. Extract the credential value
   c. Call test_credential to validate it live
   d. Call save_integration_credentials only after validation passes
3. Return a structured completion report

## TOOL PRIORITY
- test_credential BEFORE save_integration_credentials — always
- Browser tools for navigation (when Playwright is enabled)
- web_search for finding the correct console URL if unsure
- save_memory to record any setup notes that will help the user later

## WHAT YOU CAN DO AUTOMATICALLY
- Navigate to provider consoles (Google Cloud, Slack, Groq, etc.)
- Create API keys and extract their values from the page
- Parse downloaded JSON files (Google Service Account keys)
- Test every credential live before saving
- Register webhooks (Telegram setWebhook, WAHA webhook config)
- Start listener services after credentials are saved

## WHAT REQUIRES HUMAN ACTION — STOP AND REPORT
- Google OAuth consent screen ("Allow" button must be clicked by the user)
- WhatsApp QR scan (requires user's physical phone)
- SMS / 2FA verification codes
- CAPTCHA on account creation
- Telegram BotFather (requires typing in the Telegram app, unless browser automation is used)

## REPORTING
Always end with a JSON block:
\`\`\`json
{
  "status": "completed" | "partial" | "blocked",
  "completed": ["list of integrations successfully set up"],
  "blocked": [{"integration": "name", "reason": "human action required: ..."}],
  "errors": [{"integration": "name", "error": "specific error message"}]
}
\`\`\`
`;

// ── Agent context builder ─────────────────────────────────────────────────────

export interface SetupTask {
  /** Which integrations to configure (e.g. ["telegram", "gmail"]) */
  integrations: string[];
  /** Optional: pre-supplied partial credentials to skip navigation */
  hints?: Record<string, Record<string, string>>;
}

export interface SetupResult {
  status:    "completed" | "partial" | "blocked";
  completed: string[];
  blocked:   Array<{ integration: string; reason: string }>;
  errors:    Array<{ integration: string; error: string }>;
  rawOutput: string;
}

// ── Tool registry for the Setup Agent ─────────────────────────────────────────

function buildSetupRegistry(): ToolRegistry {
  const reg = new ToolRegistry();

  // Always-available: validation, saving, status, web search, memory
  reg.register(testCredentialTool as any);
  reg.register(saveIntegrationCredentialsTool as any);
  reg.register(getSetupStatusTool as any);
  reg.register(webSearchTool as any);
  reg.register(saveMemoryTool as any);
  reg.register(searchMemoryTool as any);

  // Phase 3 browser tools — uncomment when Playwright is installed
  // reg.register(browserNavigateTool as any);
  // reg.register(browserClickTool as any);
  // reg.register(browserFillTool as any);
  // reg.register(browserExtractTextTool as any);
  // reg.register(browserScreenshotTool as any);
  // reg.register(browserWaitForTool as any);
  // reg.register(oauthFlowTool as any);

  return reg;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Spawn a Setup Execution Agent for a given task.
 *
 * Called by the guide bot (or directly from an API endpoint) when a user
 * wants to set up one or more integrations automatically.
 *
 * @example
 * const result = await spawnSetupAgent({ integrations: ["telegram", "gmail"] });
 */
export async function spawnSetupAgent(task: SetupTask): Promise<SetupResult> {
  const config   = await loadConfigFromJson();
  const registry = buildSetupRegistry();

  const sessionId = randomUUID().slice(0, 12);

  // Build a minimal AgentContext — no memory (setup is stateless per run)
  const context: AgentContext = {
    sessionId,
    turnCount: 0,
    messages:  [],
    memory:    { entries: new Map(), load: async () => {}, save: async () => {} } as any,
    config,
    tools:     registry.getAll().reduce((m, t) => m.set(t.name, t), new Map()),
    taskQueue: [],
  };

  // Compose the task message
  const taskMessage = [
    `Set up the following integrations: ${task.integrations.join(", ")}.`,
    task.hints
      ? `Pre-supplied hints:\n${JSON.stringify(task.hints, null, 2)}`
      : "No credentials have been pre-supplied — navigate to get them.",
    "After completing each integration, test it live, then move to the next.",
    "End your response with the JSON status report block.",
  ].join("\n\n");

  console.log(chalk.cyan(`\n  [SetupAgent] Spawned — task: ${task.integrations.join(", ")}`));

  let rawOutput = "";
  try {
    for await (const event of agentLoop(taskMessage, context, registry, SETUP_AGENT_PROMPT)) {
      if (event.type === "text_delta") {
        rawOutput += (event as any).text ?? "";
      }
    }
  } catch (e) {
    console.error(chalk.red(`  [SetupAgent] Loop error: ${e}`));
    return {
      status: "blocked",
      completed: [],
      blocked: [{ integration: "all", reason: `Agent error: ${e}` }],
      errors: [],
      rawOutput,
    };
  }

  // Parse the JSON report block from the agent's output
  const match = rawOutput.match(/```json\s*([\s\S]*?)```/);
  if (match) {
    try {
      const report = JSON.parse(match[1].trim());
      return { ...report, rawOutput };
    } catch {
      // fall through to fallback
    }
  }

  // Fallback: assume completed if no explicit failure
  return {
    status: "completed",
    completed: task.integrations,
    blocked: [],
    errors: [],
    rawOutput,
  };
}

// ── Future: Browser tool stubs (Phase 3) ─────────────────────────────────────
//
// These will live in src/tools/browser/ once Playwright is added.
//
// src/tools/browser/
//   ├── index.ts           — re-exports all browser tools
//   ├── navigate.ts        — browser_navigate: go to a URL, return page title + URL
//   ├── click.ts           — browser_click: click element by CSS selector or text
//   ├── fill.ts            — browser_fill: type text into a form field
//   ├── extractText.ts     — browser_extract_text: get text from an element
//   ├── screenshot.ts      — browser_screenshot: capture PNG, return base64
//   ├── waitFor.ts         — browser_wait_for: wait for selector or network idle
//   └── oauthFlow.ts       — oauth_flow: open consent URL, start redirect server,
//                            catch code, exchange for tokens, return credentials
//
// Each tool follows the same interface:
//   buildTool({ name, description, category: "browser", inputSchema, call })
//
// Playwright setup (run once):
//   npm install playwright
//   npx playwright install chromium
//   Set PLAYWRIGHT_BROWSER=chromium in .env
//
// Security model:
//   • Browser runs headless by default; headed mode for OAuth consent flows
//   • Never stores cookies across sessions (fresh context per task)
//   • Never captures screenshots outside of explicitly requested flows
//   • All navigation blocked to localhost/127.0.0.1 (SSRF prevention)
//   • Allowlisted domains only: google.com, slack.com, telegram.org, t.me,
//     groq.com, openai.com, anthropic.com, api.slack.com, console.cloud.google.com
//
// ── Future: OAuth Handler (Phase 4) ──────────────────────────────────────────
//
// src/tools/oauth/handler.ts
//
//   oauth_flow tool:
//   1. Start local Express server on :3457/oauth/callback
//   2. Build consent URL for the provider (Google, Slack, GitHub, etc.)
//   3. Open browser (headed) to consent URL via Playwright
//   4. User sees the normal consent screen and clicks Allow
//   5. Provider redirects to localhost:3457/oauth/callback?code=...
//   6. Handler exchanges code for access_token + refresh_token
//   7. Returns { accessToken, refreshToken, expiresIn, scope }
//   8. Guide bot saves tokens via save_integration_credentials
//
//   Providers to support:
//   • Google (Calendar, Gmail, Drive, Sheets) — OAuth 2.0 PKCE
//   • Slack — OAuth 2.0 with bot scope
//   • Microsoft 365 — Azure AD OAuth 2.0
//   • GitHub — OAuth app flow (for future GitHub integration)
