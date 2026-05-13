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
import { autoReflect } from "./reflect.js";

const DEFAULT_SYSTEM_PROMPT = `You are an AI-powered office administrator and executive assistant.

## Your Capabilities
You manage emails, calendars, spreadsheets, files, and team messaging. You handle:
- Email triage, drafting, and sending
- Meeting scheduling and calendar management
- Data entry and spreadsheet operations
- Document filing and organization
- Team communication via Slack/Telegram/WhatsApp
- Invoice processing and tracking

## How You Work
1. Analyze the task and break it into steps
2. Use the right tools for each step
3. Report results clearly
4. Learn from feedback to improve over time

## Self-Improvement
After completing tasks, reflect on:
- What went well and what could be better
- Patterns you notice in the work
- Shortcuts or automations that could help next time
Log insights using the memory and self-improvement tools.

## Rules
- Always confirm before sending external emails or messages
- Never share sensitive data (passwords, financial details)
- Ask for clarification when tasks are ambiguous
- Prioritize accuracy over speed`;

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

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
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
    yield { type: "text_delta", text: `_${TIER_LABELS[complexity]}_ — routing to \`${activeModel}\`\n\n` };
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

  const fullSystemPrompt = systemPrompt + memoryContext + skillsSummary;
  const toolsUsed: string[] = [];

  while (state.shouldContinue && state.turnCount < state.maxTurns) {
    state.turnCount++;

    const apiMessages = state.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    try {
      let responseContent: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
      let stopReason: string;

      if (isAnthropic && client) {
        // Native Anthropic SDK
        const response = await client.messages.create({
          model: activeModel,
          max_tokens: 4096,
          system: fullSystemPrompt,
          messages: apiMessages as Anthropic.MessageParam[],
          tools: registry.toAPISchemas() as Anthropic.Tool[],
        });
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
          assistantText += block.text;
          yield { type: "text_delta", text: block.text };
        } else if (block.type === "tool_use" && block.id && block.name) {
          toolCalls.push({ id: block.id, name: block.name, input: block.input });
          yield { type: "tool_start", toolName: block.name, input: block.input };
        }
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

      // Yield tool results and track usage
      for (const result of toolResults) {
        const call = toolCalls.find((c) => c.id === result.tool_use_id);
        if (call) {
          toolsUsed.push(call.name);
          yield {
            type: "tool_result",
            toolName: call.name,
            result: { success: !result.is_error, data: result.content },
          };
        }
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
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "error", error: message };
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

  // Log performance for self-improvement
  const perfLog: PerformanceLog = {
    sessionId: context.sessionId,
    taskName: (typeof userMessage === "string" ? userMessage : searchQuery).slice(0, 100),
    toolsUsed: [...new Set(toolsUsed)],
    success: true,
    duration: Date.now() - startTime,
    timestamp: Date.now(),
  };

  await context.memory.add({
    type: "pattern",
    title: `perf_log:${context.sessionId}:${state.turnCount}`,
    content: JSON.stringify(perfLog),
    tags: ["performance", ...toolsUsed],
  });

  // Auto-reflect on the conversation to extract user facts worth remembering
  if (state.turnCount >= 2) {
    autoReflect(state.messages, context).catch(() => {});
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
