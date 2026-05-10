// =============================================================================
// Performance Evaluator — Analyzes task execution logs to find improvement areas
// Inspired by Claude Code's autoDream.ts pattern: background forked agent
// that consolidates learnings across sessions
// =============================================================================

import type {
  MemoryStore,
  PerformanceLog,
  ImprovementAction,
  AgentConfig,
} from "../types/index.js";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Evaluate recent performance logs and generate improvement actions.
 *
 * Pattern from Claude Code's autoDream:
 * - Multi-gate throttling (time/sessions/lock)
 * - Forked agent execution
 * - Progress streaming to task UI
 */
export async function evaluatePerformance(
  memory: MemoryStore,
  config: AgentConfig
): Promise<ImprovementAction[]> {
  // Collect performance logs from memory
  const perfEntries = Array.from(memory.entries.values())
    .filter((e) => e.title.startsWith("perf_log:"))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50); // Last 50 logs

  if (perfEntries.length < 3) {
    return []; // Not enough data to evaluate
  }

  const logs: PerformanceLog[] = perfEntries.map((e) => JSON.parse(e.content));

  // --- Statistical Analysis ---

  const stats = analyzeStats(logs);

  // --- AI-Powered Analysis ---

  const client = new Anthropic({ apiKey: config.apiKeys.anthropic });

  const analysisPrompt = `You are a performance analyst for an AI admin assistant agent.
Analyze these execution logs and suggest concrete improvements.

## Performance Statistics
${JSON.stringify(stats, null, 2)}

## Recent Logs (last ${logs.length} tasks)
${logs.map((l) => `- Task: "${l.taskName}" | Tools: [${l.toolsUsed.join(", ")}] | Success: ${l.success} | Duration: ${l.duration}ms | Feedback: ${l.userFeedback || "none"}`).join("\n")}

## Current Memories
${Array.from(memory.entries.values())
  .filter((e) => e.type !== "pattern")
  .slice(0, 20)
  .map((e) => `- [${e.type}] ${e.title}`)
  .join("\n")}

## Your Analysis Should Include:
1. **Failure Patterns**: Tasks that frequently fail — why and how to fix
2. **Slow Operations**: Tasks taking too long — optimization opportunities
3. **Missing Skills**: Recurring task types that don't have dedicated skills
4. **Workflow Inefficiencies**: Steps that could be combined or eliminated
5. **Memory Gaps**: Information the agent keeps needing but doesn't remember

Return a JSON array of improvement actions:
[
  {
    "type": "create_skill" | "update_skill" | "update_memory" | "optimize_workflow" | "flag_for_review",
    "description": "What to do",
    "priority": "low" | "medium" | "high",
    "data": { ... relevant details ... }
  }
]

Return ONLY the JSON array, no other text.`;

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const actions: ImprovementAction[] = JSON.parse(jsonMatch[0]);
      return actions;
    }
  } catch (err) {
    console.error("Performance evaluation failed:", err);
  }

  return [];
}

// --- Statistical Analysis ---

interface PerformanceStats {
  totalTasks: number;
  successRate: number;
  avgDuration: number;
  failuresByTool: Record<string, number>;
  mostUsedTools: Array<{ tool: string; count: number }>;
  negativeFeedbackTasks: string[];
  slowestTasks: Array<{ task: string; duration: number }>;
  taskFrequency: Record<string, number>;
}

function analyzeStats(logs: PerformanceLog[]): PerformanceStats {
  const totalTasks = logs.length;
  const successes = logs.filter((l) => l.success).length;

  // Tool usage frequency
  const toolCounts = new Map<string, number>();
  const toolFailures = new Map<string, number>();

  for (const log of logs) {
    for (const tool of log.toolsUsed) {
      toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      if (!log.success) {
        toolFailures.set(tool, (toolFailures.get(tool) || 0) + 1);
      }
    }
  }

  // Task type frequency (rough categorization by first 3 words)
  const taskFreq: Record<string, number> = {};
  for (const log of logs) {
    const key = log.taskName.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
    taskFreq[key] = (taskFreq[key] || 0) + 1;
  }

  return {
    totalTasks,
    successRate: totalTasks > 0 ? successes / totalTasks : 0,
    avgDuration: logs.reduce((s, l) => s + l.duration, 0) / (totalTasks || 1),
    failuresByTool: Object.fromEntries(toolFailures),
    mostUsedTools: Array.from(toolCounts.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    negativeFeedbackTasks: logs
      .filter((l) => l.userFeedback === "negative")
      .map((l) => l.taskName),
    slowestTasks: logs
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5)
      .map((l) => ({ task: l.taskName, duration: l.duration })),
    taskFrequency: taskFreq,
  };
}
