// =============================================================================
// Tool Registry — inspired by Claude Code's buildTool pattern
// =============================================================================

import { z } from "zod";
import type { ToolDefinition, ToolCategory, ToolResult, AgentContext, APIToolSchema } from "../types/index.js";

/**
 * Build a tool definition with defaults filled in.
 * Mirrors Claude Code's buildTool() pattern from Tool.ts
 */
export function buildTool<TInput, TOutput>(def: {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodType<TInput>;
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  call: (input: TInput, context: AgentContext) => Promise<ToolResult<TOutput>>;
}): ToolDefinition<TInput, TOutput> {
  return {
    name: def.name,
    description: def.description,
    category: def.category,
    inputSchema: def.inputSchema,
    isReadOnly: def.isReadOnly ?? false,
    isConcurrencySafe: def.isConcurrencySafe ?? true,
    call: def.call,
    toAPISchema(): APIToolSchema {
      return {
        name: def.name,
        description: def.description,
        input_schema: zodToJsonSchema(def.inputSchema),
      };
    },
  };
}

/**
 * Tool registry — central store for all available tools.
 * Mirrors Claude Code's tool orchestration pattern.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  toAPISchemas(): APIToolSchema[] {
    return this.getAll().map((t) => t.toAPISchema());
  }

  /**
   * Execute tools with concurrency control.
   * Read-only + concurrency-safe tools run in parallel; others run serially.
   * Mirrors Claude Code's toolOrchestration.ts pattern.
   */
  async executeTools(
    toolCalls: Array<{ id: string; name: string; input: unknown }>,
    context: AgentContext
  ): Promise<Array<{ tool_use_id: string; content: string | any[]; is_error: boolean }>> {
    // Partition into parallel-safe and serial
    const parallel: typeof toolCalls = [];
    const serial: typeof toolCalls = [];

    for (const call of toolCalls) {
      const tool = this.tools.get(call.name);
      if (!tool) {
        serial.push(call); // unknown tools go serial for safety
        continue;
      }
      if (tool.isReadOnly && tool.isConcurrencySafe) {
        parallel.push(call);
      } else {
        serial.push(call);
      }
    }

    const results: Array<{ tool_use_id: string; content: string | any[]; is_error: boolean }> = [];

    // Run parallel batch
    if (parallel.length > 0) {
      const parallelResults = await Promise.all(
        parallel.map((call) => this.executeSingle(call, context))
      );
      results.push(...parallelResults);
    }

    // Run serial sequentially
    for (const call of serial) {
      const result = await this.executeSingle(call, context);
      results.push(result);
    }

    return results;
  }

  private async executeSingle(
    call: { id: string; name: string; input: unknown },
    context: AgentContext
  ): Promise<{ tool_use_id: string; content: string | any[]; is_error: boolean }> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return { tool_use_id: call.id, content: `Unknown tool: ${call.name}`, is_error: true };
    }

    try {
      const parsed = tool.inputSchema.parse(call.input);
      const result = await tool.call(parsed, context);

      // If the tool returned a vision block (image file), send it as a content
      // array so vision-capable models (Claude, GPT-4V) can actually see it.
      if (result.success && result._visionBlock) {
        return {
          tool_use_id: call.id,
          content: [
            { type: "text", text: JSON.stringify(result.data ?? {}) },
            result._visionBlock,
          ],
          is_error: false,
        };
      }

      return {
        tool_use_id: call.id,
        content: JSON.stringify(result.data ?? result.error ?? "OK"),
        is_error: !result.success,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { tool_use_id: call.id, content: `Tool error: ${sanitizeToolError(message)}`, is_error: true };
    }
  }
}

// ── Tool error sanitization ────────────────────────────────────────────────────
// Strips prompt-injection patterns from tool error strings before they are
// re-injected into the model context. A malicious file, API response, or remote
// service could craft an error message that contains instruction text.
//
// Inspiration: Hermes v0.14.0 — "Sanitize env and redact output in quick
// commands" + "tool error strings are now sanitized before re-injection."
//
// Patterns targeted:
//   • Role header mimicry  ("System:", "User:", "Assistant:")
//   • Model template tokens ("[INST]", "<|system|>", "###System")
//   • Jailbreak imperatives ("ignore all previous instructions")
//   • Authority claims      ("you are now in developer mode")

const INJECTION_PATTERNS: RegExp[] = [
  // Role mimicry
  /\b(system|assistant|user)\s*:\s*/gi,
  // OpenAI / Llama template tokens
  /\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>/gi,
  // Mistral / Gemma / Qwen control tokens
  /<\|system\|>|<\|user\|>|<\|assistant\|>|<\|im_start\|>|<\|im_end\|>/gi,
  // Markdown section headers that look like role headings
  /^#{1,3}\s*(system|instruction|human|assistant)\b/gim,
  // Classic jailbreak imperatives
  /\b(ignore|forget|disregard|override)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|constraints?|guidelines?)\b/gi,
  // Authority claims
  /\b(you are|you're)\s+(now\s+)?(in\s+)?(developer|admin|unrestricted|jailbreak|debug|god)\s+mode\b/gi,
  // "New instructions" framing
  /\bnew\s+instructions?\s*:\s*/gi,
];

function sanitizeToolError(raw: string): string {
  // Truncate first — don't process enormous strings
  let s = raw.slice(0, 600);
  let sanitized = false;

  for (const pattern of INJECTION_PATTERNS) {
    const replaced = s.replace(pattern, "[redacted]");
    if (replaced !== s) {
      s = replaced;
      sanitized = true;
    }
  }

  // If we redacted anything, append a note so the model knows why
  if (sanitized) {
    s += " [Note: parts of this error were sanitized to prevent injection]";
  }

  return s;
}

// --- Zod to JSON Schema (minimal conversion) ---

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodField = value as z.ZodType;
      properties[key] = zodToJsonSchema(zodField);
      if (!(zodField instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return { type: "object", properties, required };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema((schema as z.ZodArray<z.ZodType>)._def.type) };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as z.ZodOptional<z.ZodType>)._def.innerType);
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: (schema as z.ZodEnum<[string, ...string[]]>)._def.values };
  }
  return { type: "string" };
}
