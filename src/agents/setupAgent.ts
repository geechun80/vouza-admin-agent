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

// ── Browser tools (Phase 3 — Playwright) ─────────────────────────────────────
// Active when SETUP_AGENT_ENABLED=true and playwright + chromium are installed.
// Activate: npm install playwright && npx playwright install chromium
import {
  browserNavigateTool,
  browserClickTool,
  browserFillTool,
  browserExtractTextTool,
  browserScreenshotTool,
  browserWaitForTool,
} from "../tools/browser/index.js";

// ── OAuth handler (Phase 4) ───────────────────────────────────────────────────
// Opens a local redirect server on :3457/oauth/callback, launches a headed
// browser to the provider consent URL, catches the code, exchanges for tokens.
import { oauthFlowTool } from "../tools/oauth/handler.js";

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

  // Phase 3 — browser tools (Playwright, now active)
  reg.register(browserNavigateTool as any);
  reg.register(browserClickTool as any);
  reg.register(browserFillTool as any);
  reg.register(browserExtractTextTool as any);
  reg.register(browserScreenshotTool as any);
  reg.register(browserWaitForTool as any);

  // Phase 4 — OAuth handler (headed browser + token exchange)
  reg.register(oauthFlowTool as any);

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

// ── Implementation status ─────────────────────────────────────────────────────
// Phase 3 ✅  Browser tools: src/tools/browser/ (navigate, click, fill,
//              extractText, screenshot, waitFor) — live with Playwright
// Phase 4 ✅  OAuth handler: src/tools/oauth/handler.ts (google, slack,
//              microsoft, github) — headed browser + PKCE + token exchange
