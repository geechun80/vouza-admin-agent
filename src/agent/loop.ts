// =============================================================================
// Agent Loop — Multi-provider streaming generator pattern
// Supports: Anthropic, OpenAI, Google Gemini, xAI, DeepSeek, Qwen, Kimi,
//           OpenRouter (with tiered smart routing)
// Inspired by Claude Code's query.ts
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentContext,
  AgentState,
  StreamEvent,
  ConversationMessage,
  ToolCall,
  PerformanceLog,
} from "../types/index.js";
import { ToolRegistry } from "../tools/registry.js";
import { randomUUID } from "crypto";
import type { AIProvider } from "../config/models.js";
import { classifyTask, selectModelForComplexity, TIER_LABELS, DEFAULT_OPENROUTER_TIERS } from "./router.js";
import { autoReflect }                from "./reflect.js";
import { findRelevantSkills, autoWriteSkill } from "./skillWriter.js";
import { compressContext, estimateConversationTokens } from "./contextCompressor.js";
import { scrubThinkBlocks, hasThinkBlock } from "./thinkScrubber.js";
import { redact } from "./redactor.js";
import { classifyError } from "./errorClassifier.js";
import { buildProfileContext } from "./userProfile.js";

const DEFAULT_SYSTEM_PROMPT = `You are an AI-powered office administrator and executive assistant named Vouza.

## Your Capabilities
You manage emails, calendars, spreadsheets, files, and team messaging. You handle:
- Email triage, drafting, and sending
- Meeting scheduling and calendar management
- Data entry and spreadsheet operations
- Document filing and organization
- Team communication via Slack/Telegram/WhatsApp
- Invoice processing and tracking
- Voice message transcription and summarisation

## Onboarding — Guide Users Through Setup
When a user first messages you, OR says "setup", "configure", "help me start", or "/start":

1. **Always call get_setup_status first** to see what's already configured.
2. **Celebrate what's working** — e.g. "✅ Your AI model is connected!"
3. **Guide through missing integrations one at a time** — do NOT dump a long list. Pick the most useful next one:
   - Most users: start with **Gmail** (most impactful)
   - Then: **Google Calendar** (meeting scheduling)
   - Then: **Telegram** if they want mobile access
4. **Show exact steps** for getting credentials — copy the instructions from get_setup_status.
5. **After the user pastes credentials**, immediately call save_integration_credentials to save them.
6. **Test immediately** after saving — use the real tool:
   - Gmail saved? → call read_emails (count=3) and show the actual subject lines
   - Calendar saved? → call list_events (days=1) and show today's meetings
   - Telegram saved? → confirm the bot is ready
7. **Confirm with real data** — say "✅ Gmail is live! You have 5 unread emails. Latest: [actual subject]"
8. Ask "Ready to set up [next integration]?" before moving on.

## How You Work (Normal Tasks)
1. Analyze the task and break it into steps
2. Use the right tools for each step
3. Report results clearly with actual data (not "I will do this" — actually do it and show results)
4. Learn from feedback to improve over time

## Rules
- ALWAYS call get_setup_status before telling a user an integration "isn't set up" — check first
- After saving credentials with save_integration_credentials, ALWAYS test immediately with a real tool call
- Always confirm before SENDING external emails or messages (reading is fine without confirmation)
- Never log or repeat back passwords, API keys, or tokens to the user
- Ask for clarification when tasks are ambiguous
- Be concise — one step at a time, not walls of text

## ── THINK BEFORE ACTING (Scratch Pad) ──────────────────────────────────────
For any non-trivial task (more than one tool call, or any ambiguous request),
write a brief think block BEFORE calling the first tool:

<think>
Goal: [restate what the user actually wants]
Plan: [ordered list of tool calls you'll make]
Risk: [anything that could go wrong or needs confirmation]
</think>

Skip <think> for simple single-step tasks ("read my emails", "what time is it").
The <think> block is your scratchpad — be honest about uncertainty here.

## ── RUNNING SUMMARY (Stay on Track Across Tool Calls) ───────────────────────
After EVERY tool result, before deciding your next action, briefly integrate:
- What did this result tell me?
- Does this change my plan?
- What is the single best next step?

Never react only to the most recent tool result in isolation.
Always consider the full picture of what you've done and learned so far.
If a tool fails, do NOT give up — analyze the error, adjust, and try a different approach.`;


// ── Phase 0: performance guards ───────────────────────────────────────────────
const AI_TIMEOUT_MS = 60_000;          // abort any AI call that takes > 60 s
const PERF_LOG_FREQUENCY = 5;          // write perf log every N sessions (not every one)
let _perfLogCounter  = 0;              // session counter (module-level, shared across calls)
let _activeReflect   = false;          // prevents overlapping autoReflect calls
let _activeSkillWrite = false;         // prevents overlapping autoWriteSkill calls

/**
 * Build an OpenAI-compatible client for non-Anthropic providers.
 * Most providers (OpenAI, Gemini, xAI, DeepSeek, Qwen, Kimi) use the OpenAI API format.
 */
function getOpenAICompatibleConfig(
  provider: AIProvider,
  apiKey: string
): { baseURL: string; apiKey: string; extraHeaders: Record<string, string> } {
  const configs: Partial<Record<AIProvider, { baseURL: string; extraHeaders?: Record<string, string> }>> = {
    openai:      { baseURL: "https://api.openai.com/v1" },
    google:      { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai" },
    xai:         { baseURL: "https://api.x.ai/v1" },
    deepseek:    { baseURL: "https://api.deepseek.com" },
    alibaba:     { baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
    moonshot:    { baseURL: "https://api.moonshot.cn/v1" },
    openrouter:  {
      baseURL: "https://openrouter.ai/api/v1",
      extraHeaders: {
        "HTTP-Referer": "https://adminagent.app",
        "X-Title":      "Admin Agent",
      },
    },
  };

  const config = configs[provider];
  if (!config) throw new Error(`Unsupported provider for OpenAI-compatible API: ${provider}`);

  return { baseURL: config.baseURL, apiKey, extraHeaders: config.extraHeaders ?? {} };
}

/**
 * Call an OpenAI-compatible API (covers OpenAI, Gemini, xAI, DeepSeek, Qwen, Kimi).
 * Returns in a normalized format matching our agent loop expectations.
 */
async function callOpenAICompatible(
  provider: AIProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: any }>,
  tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
): Promise<{ content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>; stop_reason: string }> {
  const { baseURL, apiKey: key, extraHeaders } = getOpenAICompatibleConfig(provider, apiKey);

  // Convert tools to OpenAI function format
  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  // Convert messages to OpenAI format
  const openaiMessages: any[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      openaiMessages.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      // Handle tool results
      const toolResults = msg.content.filter((b: any) => b.type === "tool_result");
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          // OpenAI-compatible providers only accept string content in tool results.
          // Flatten content arrays (e.g. [text, imageBlock]) to text-only string.
          const content = Array.isArray(tr.content)
            ? tr.content
                .filter((b: any) => b.type === "text")
                .map((b: any) => b.text)
                .join("\n") || "(binary result)"
            : tr.content;
          openaiMessages.push({
            role: "tool",
            tool_call_id: tr.tool_use_id,
            content,
          });
        }
      } else {
        // Handle mixed content (text + tool_use from assistant)
        const textParts = msg.content.filter((b: any) => b.type === "text");
        const toolUseParts = msg.content.filter((b: any) => b.type === "tool_use");

        if (msg.role === "assistant" && toolUseParts.length > 0) {
          openaiMessages.push({
            role: "assistant",
            content: textParts.map((t: any) => t.text).join("") || null,
            tool_calls: toolUseParts.map((t: any) => ({
              id: t.id,
              type: "function",
              function: { name: t.name, arguments: JSON.stringify(t.input) },
            })),
          });
        } else {
          openaiMessages.push({
            role: msg.role,
            content: textParts.map((t: any) => t.text).join(""),
          });
        }
      }
    }
  }

  // 60-second hard timeout — prevents hanging forever on free-tier queues
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        max_tokens: 4096,
      }),
    });
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.code === "ABORT_ERR") {
      throw new Error(
        `AI_QUEUE_TIMEOUT: ${provider} model did not respond within ${AI_TIMEOUT_MS / 1000}s. ` +
        `The free-tier queue is backed up. Try again or switch AI provider.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${provider} API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error(`${provider} returned no choices`);

  // Normalize to Anthropic-like content blocks
  const content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> = [];

  if (choice.message.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}"),
      });
    }
  }

  const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";

  return { content, stop_reason: stopReason };
}

/**
 * Main agent loop — async generator yielding stream events.
 * Supports both Anthropic native SDK and OpenAI-compatible providers.
 */
export async function* agentLoop(
  userMessage: string | any[],   // string OR Anthropic content blocks (image, text, …)
  context: AgentContext,
  registry: ToolRegistry,
  systemPromptOverride?: string
): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();
  const isAnthropic = context.config.provider === "anthropic";
  const isOpenRouter = context.config.provider === "openrouter";
  const apiKey = context.config.apiKeys[context.config.provider];
  const systemPrompt = systemPromptOverride || DEFAULT_SYSTEM_PROMPT;

  // ── OpenRouter: classify task complexity and pick the right model tier ──
  let activeModel = context.config.model;
  if (isOpenRouter) {
    const hasImage = Array.isArray(userMessage) && (userMessage as any[]).some((b: any) => b?.type === "image");
    const tiers = context.config.openrouterTiers ?? DEFAULT_OPENROUTER_TIERS;
    const complexity = classifyTask(userMessage, hasImage);
    activeModel = selectModelForComplexity(complexity, tiers);
    // Emit routing decision so the UI can show which tier was selected
    yield { type: "text_delta", text: `${TIER_LABELS[complexity]} — routing to ${activeModel}\n\n` };
  }

  let client: Anthropic | null = null;
  if (isAnthropic) {
    client = new Anthropic({ apiKey });
  }

  // Initialize state
  const state: AgentState = {
    messages: [
      ...context.messages,
      {
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
        uuid: randomUUID(),
      },
    ],
    turnCount: 0,
    maxTurns: context.config.maxTurnsPerSession,
    shouldContinue: true,
    pendingToolCalls: [],
  };

  // Load relevant memories for context
  const searchQuery = typeof userMessage === "string" ? userMessage : (userMessage.find((b: any) => b.type === "text")?.text ?? "");
  const memories = await context.memory.search(searchQuery, 10);
  const memoryContext = memories.length > 0
    ? `\n\n## Relevant Memory\n${memories.map((m) => `- [${m.type}] ${m.title}: ${m.content}`).join("\n")}`
    : "";

  const skillsSummary = context.taskQueue.length > 0
    ? `\n\n## Active Tasks\n${context.taskQueue.map((t) => `- ${t.name}: ${t.status}`).join("\n")}`
    : "";

  // ── Phase 2: inject learned skills for this task ──────────────────────────
  // Searches data/skills/*.md for procedures matching the current task.
  // If found, the agent follows the proven steps instead of re-figuring them.
  const learnedSkills = await findRelevantSkills(searchQuery).catch(() => "");

  // ── Phase 4: inject user profile ──────────────────────────────────────────
  // Reads accumulated memory facts from past sessions and builds a compact
  // profile block so the agent knows the user's name, role, and preferences
  // without needing to re-ask every session.
  const userProfile = await buildProfileContext(context.memory).catch(() => "");

  const fullSystemPrompt = systemPrompt + userProfile + memoryContext + skillsSummary + learnedSkills;
  const toolsUsed: string[] = [];
  let errorStreak = 0;   // consecutive tool-level errors (resets on any success)
  let retryCount  = 0;   // transient API-level retries (503 / 429)

  while (state.shouldContinue && state.turnCount < state.maxTurns) {
    state.turnCount++;

    // ── Phase 2: context compression ─────────────────────────────────────────
    // Check token usage before every API call. If > 50% of the context window
    // is consumed, compress the middle of the conversation to a structured
    // summary so long sessions never hit context limits.
    if (estimateConversationTokens(state.messages) > 10_000) { // skip on short convos
      const { messages: compressed } = await compressContext(
        state.messages,
        apiKey,
        context.config.provider,
        activeModel
      ).catch(() => ({ messages: state.messages, savedTokens: 0, compressed: false }));
      state.messages = compressed;
    }

    const apiMessages = state.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      let responseContent: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
      let stopReason: string;

      if (isAnthropic && client) {
        // Native Anthropic SDK — 60 s timeout matches our AbortController budget
        const response = await client.messages.create(
          {
            model: activeModel,
            max_tokens: 4096,
            system: fullSystemPrompt,
            messages: apiMessages as Anthropic.MessageParam[],
            tools: registry.toAPISchemas() as Anthropic.Tool[],
          },
          { timeout: AI_TIMEOUT_MS }
        );
        responseContent = response.content as any;
        stopReason = response.stop_reason || "end_turn";
      } else {
        // OpenAI-compatible providers (includes OpenRouter)
        const result = await callOpenAICompatible(
          context.config.provider,
          apiKey,
          activeModel,
          fullSystemPrompt,
          apiMessages,
          registry.toAPISchemas()
        );
        responseContent = result.content;
        stopReason = result.stop_reason;
      }

      // Process response content blocks
      const toolCalls: ToolCall[] = [];
      let assistantText = "";

      for (const block of responseContent) {
        if (block.type === "text" && block.text) {
          assistantText += block.text; // keep full text (incl. think blocks) in history

          // ── Think Scrubber: strip <think>…</think> before showing user ───
          // Models like DeepSeek-R1 and extended-thinking Claude emit raw chain-
          // of-thought inside <think> tags. We show a subtle indicator if present,
          // then yield only the clean visible portion.
          if (hasThinkBlock(block.text)) {
            yield { type: "text_delta", text: "💭 _reasoning…_\n\n" };
          }
          const visible = scrubThinkBlocks(block.text);
          if (visible) {
            yield { type: "text_delta", text: visible };
          }
        } else if (block.type === "tool_use" && block.id && block.name) {
          toolCalls.push({ id: block.id, name: block.name, input: block.input });
          yield { type: "tool_start", toolName: block.name, input: block.input };
        }
      }

      // ── Empty response guard ───────────────────────────────────────────────
      // If the model returned no text AND no tool calls, something went wrong
      // (e.g. no OpenRouter credits, model returned null content). Surface it.
      if (assistantText === "" && toolCalls.length === 0) {
        const hint = isOpenRouter
          ? "\n\n⚠️ The AI model returned an empty response.\n\nMost likely cause: **no OpenRouter credits**. Top up at openrouter.ai/credits — even $5 lasts months.\n\nOr open the setup wizard and switch to a different AI provider (Anthropic, Google, etc.)."
          : "\n\n⚠️ The AI model returned an empty response. Please check your API key and try again.";
        yield { type: "text_delta", text: hint };
        yield { type: "error", error: "Empty model response" };
        state.shouldContinue = false;
        break;
      }

      // Record assistant message
      state.messages.push({
        role: "assistant",
        content: responseContent as any,
        timestamp: Date.now(),
        uuid: randomUUID(),
      });

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        state.shouldContinue = false;
        break;
      }

      // Execute tools with orchestration (parallel read / serial write)
      const toolResults = await registry.executeTools(toolCalls, context);

      // Yield tool results, track usage, and inject correction hints on errors
      for (const result of toolResults) {
        const call = toolCalls.find((c) => c.id === result.tool_use_id);
        if (call) {
          if (result.is_error) {
            errorStreak++;
            // Hermes-style error recovery: append a correction directive so the
            // model knows to analyze and retry rather than give up.
            const originalContent =
              typeof result.content === "string"
                ? result.content
                : JSON.stringify(result.content);
            result.content =
              originalContent +
              "\n\n[CORRECTION REQUIRED: The tool call above failed. " +
              "Re-read the error, identify the root cause, adjust your approach " +
              "(fix parameters, try an alternative tool, or ask the user for " +
              "missing info), and try again. Do NOT tell the user it's impossible " +
              "without attempting at least one alternative.]";
          } else {
            errorStreak = 0; // successful tool call resets the streak
            toolsUsed.push(call.name);
          }
          yield {
            type: "tool_result",
            toolName: call.name,
            result: { success: !result.is_error, data: result.content },
          };
        }
      }

      // Safety valve: 3 consecutive tool errors → stop and surface to user
      if (errorStreak >= 3) {
        yield {
          type: "text_delta",
          text:
            "\n\n⚠️ I've hit several errors in a row and can't proceed automatically. " +
            "Let me know if you'd like me to try a different approach, or if you can " +
            "check that the relevant credentials and settings are correct.",
        };
        state.shouldContinue = false;
        break;
      }

      // Add tool results to conversation
      state.messages.push({
        role: "user",
        content: toolResults.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.is_error,
        })),
        timestamp: Date.now(),
        uuid: randomUUID(),
      });

      // Check stop reason
      if (stopReason === "end_turn") {
        state.shouldContinue = false;
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);

      // ── Smart Error Classifier ────────────────────────────────────────────
      // Categorise the error so we can apply the right recovery strategy:
      //   transient  → short retry (model overloaded, network blip)
      //   rate_limit → longer exponential retry (429)
      //   quota      → no retry, tell user to top up
      //   auth       → no retry, redirect to wizard
      //   context_len→ no retry, trigger compression and re-run
      //   not_found  → no retry, suggest different model
      //   permanent  → no retry, show error
      const errInfo = classifyError(raw, isOpenRouter);

      if (errInfo.shouldRetry && retryCount < errInfo.maxRetries) {
        retryCount++;
        const waitMs = errInfo.waitMs(retryCount);
        const waitSec = Math.round(waitMs / 1000);
        yield {
          type: "text_delta",
          text: `\n_${errInfo.userMessage} (attempt ${retryCount}/${errInfo.maxRetries}, waiting ${waitSec}s…)_\n`,
        };
        await new Promise((r) => setTimeout(r, waitMs));
        state.turnCount--; // don't charge this attempt against the turn budget
        continue;
      }

      // ── Context length: trigger compression and retry once ────────────────
      if (errInfo.type === "context_len" && retryCount < 1) {
        retryCount++;
        yield { type: "text_delta", text: `\n_${errInfo.userMessage}_\n` };
        // Force compress regardless of token threshold
        const { messages: compressed } = await compressContext(
          state.messages, apiKey, context.config.provider, activeModel, 128_000, 0.99
        ).catch(() => ({ messages: state.messages }));
        state.messages = compressed;
        state.turnCount--;
        continue;
      }

      // ── No retry — surface a clear, actionable message ────────────────────
      yield { type: "error", error: raw };
      yield { type: "text_delta", text: `\n\n⚠️ ${errInfo.userMessage}` };
      state.shouldContinue = false;
    }
  }

  yield { type: "turn_complete", turnCount: state.turnCount };

  // Update context with sliding window to prevent unbounded growth
  let newMessages = state.messages;
  if (newMessages.length > 40) {
    let sliceIdx = newMessages.length - 40;
    // Ensure we don't start with a tool_result (which requires the preceding tool_use)
    while (sliceIdx < newMessages.length) {
      const msg = newMessages[sliceIdx];
      const isToolResult = msg.role === "user" && Array.isArray(msg.content) && msg.content.some((b: any) => b.type === "tool_result");
      if (!isToolResult) break;
      sliceIdx++;
    }
    newMessages = newMessages.slice(sliceIdx);
  }
  context.messages = newMessages;
  context.turnCount = state.turnCount;

  // ── Phase 0: throttled perf log ───────────────────────────────────────────
  // Only write every PERF_LOG_FREQUENCY sessions — each write + index rebuild
  // is a disk hit; accumulating logs every single turn bloats memory quickly.
  _perfLogCounter++;
  if (_perfLogCounter % PERF_LOG_FREQUENCY === 0) {
    const rawTaskName = (typeof userMessage === "string" ? userMessage : searchQuery).slice(0, 100);
    const perfLog: PerformanceLog = {
      sessionId: context.sessionId,
      taskName:  redact(rawTaskName),
      toolsUsed: [...new Set(toolsUsed)],
      success:   true,
      duration:  Date.now() - startTime,
      timestamp: Date.now(),
    };
    context.memory.add({
      type:    "pattern",
      title:   `perf_log:${context.sessionId}:${state.turnCount}`,
      content: JSON.stringify(perfLog),
      tags:    ["performance", ...toolsUsed],
    }).catch(() => {});
  }

  // ── Phase 0: guarded autoReflect — never run two at once ──────────────────
  if (state.turnCount >= 2 && !_activeReflect) {
    _activeReflect = true;
    autoReflect(state.messages, context)
      .catch(() => {})
      .finally(() => { _activeReflect = false; });
  }

  // ── Phase 0: guarded autoWriteSkill — never run two at once ───────────────
  if (toolsUsed.length >= 3 && !_activeSkillWrite) {
    _activeSkillWrite = true;
    autoWriteSkill(state.messages, toolsUsed, context)
      .catch(() => {})
      .finally(() => { _activeSkillWrite = false; });
  }
}

/**
 * Run a forked agent — isolated sub-agent for background tasks.
 */
export async function runForkedAgent(
  prompt: string,
  context: AgentContext,
  registry: ToolRegistry,
  maxTurns: number = 5
): Promise<string> {
  const forkedContext: AgentContext = {
    ...context,
    sessionId: `fork-${randomUUID().slice(0, 8)}`,
    turnCount: 0,
    messages: [],
    taskQueue: [],
  };

  let output = "";
  for await (const event of agentLoop(prompt, forkedContext, registry)) {
    if (event.type === "text_delta") {
      output += event.text;
    }
    if (event.type === "turn_complete" && event.turnCount >= maxTurns) {
      break;
    }
  }
  return output;
}

/** Export the default system prompt for template overrides */
export { DEFAULT_SYSTEM_PROMPT };
