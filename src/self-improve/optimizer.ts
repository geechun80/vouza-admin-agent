// =============================================================================
// Self-Improvement Optimizer — The "autoDream" loop that runs periodically
// to consolidate learnings, generate skills, and optimize workflows
//
// Inspired by Claude Code's autoDream.ts:
// - Multi-gate throttling (time/sessions/lock)
// - Forked agent execution
// - Mutex-locked consolidation
// =============================================================================

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { AgentConfig, MemoryStore, ImprovementAction } from "../types/index.js";
import { evaluatePerformance } from "./evaluator.js";
import { generateSkill, improveSkill, saveGeneratedSkill } from "./skillGenerator.js";

const LOCK_FILE = ".self-improve.lock";
const STATE_FILE = ".self-improve.state.json";

interface OptimizerState {
  lastRunAt: number;
  lastSessionCount: number;
  totalImprovements: number;
  skillsCreated: string[];
  skillsImproved: string[];
  actionsApplied: number;
}

/**
 * Initialize the self-improvement loop.
 *
 * Architecture (from Claude Code's autoDream):
 * - Closure-scoped mutable state
 * - Multi-gate checks before expensive operations
 * - Mutex lock prevents concurrent consolidations
 */
export function initSelfImproveLoop(config: AgentConfig, memory: MemoryStore) {
  let state: OptimizerState = {
    lastRunAt: 0,
    lastSessionCount: 0,
    totalImprovements: 0,
    skillsCreated: [],
    skillsImproved: [],
    actionsApplied: 0,
  };

  const stateDir = join(config.memoryDir, ".optimizer");

  /**
   * Main optimization cycle — called after task completion or on schedule.
   * Returns improvement actions taken.
   */
  async function runOptimizationCycle(): Promise<ImprovementAction[]> {
    // --- Gate 1: Time throttle ---
    const hoursSinceLastRun = (Date.now() - state.lastRunAt) / 3_600_000;
    if (hoursSinceLastRun < config.selfImproveIntervalHours) {
      return [];
    }

    // --- Gate 2: Minimum activity ---
    const perfLogCount = Array.from(memory.entries.values()).filter((e) =>
      e.title.startsWith("perf_log:")
    ).length;
    if (perfLogCount - state.lastSessionCount < 3) {
      return []; // Need at least 3 new tasks since last run
    }

    // --- Gate 3: Mutex lock ---
    const lockAcquired = await tryAcquireLock(stateDir);
    if (!lockAcquired) {
      return [];
    }

    console.log("\n🧠 Self-improvement cycle starting...\n");

    try {
      // Step 1: Evaluate performance
      console.log("  📊 Analyzing performance logs...");
      const actions = await evaluatePerformance(memory, config);
      console.log(`  Found ${actions.length} improvement actions`);

      const applied: ImprovementAction[] = [];

      // Step 2: Apply improvements
      for (const action of actions) {
        try {
          switch (action.type) {
            case "create_skill": {
              console.log(`  🔨 Generating skill: ${action.description}`);
              const skill = await generateSkill(action, memory, config);
              if (skill) {
                await saveGeneratedSkill(skill, config, memory);
                state.skillsCreated.push(skill.name);
                applied.push(action);
                console.log(`  ✅ Created skill: ${skill.displayName}`);
              }
              break;
            }

            case "update_skill": {
              const skillName = (action.data as any).skillName;
              if (skillName) {
                console.log(`  🔧 Improving skill: ${skillName}`);
                const improved = await improveSkill(
                  skillName,
                  action.description,
                  memory,
                  config
                );
                if (improved) {
                  state.skillsImproved.push(skillName);
                  applied.push(action);
                  console.log(`  ✅ Improved skill: ${skillName}`);
                }
              }
              break;
            }

            case "update_memory": {
              console.log(`  💾 Updating memory: ${action.description}`);
              await memory.add({
                type: "process",
                title: `learned:${Date.now()}`,
                content: action.description,
                tags: ["self-improve", "auto-learned"],
              });
              applied.push(action);
              break;
            }

            case "optimize_workflow": {
              console.log(`  ⚡ Workflow optimization: ${action.description}`);
              await memory.add({
                type: "process",
                title: `workflow_optimization:${Date.now()}`,
                content: JSON.stringify({
                  description: action.description,
                  data: action.data,
                  appliedAt: Date.now(),
                }),
                tags: ["self-improve", "workflow", "optimization"],
              });
              applied.push(action);
              break;
            }

            case "flag_for_review": {
              console.log(`  ⚠️  Flagged for review: ${action.description}`);
              await memory.add({
                type: "feedback",
                title: `needs_review:${Date.now()}`,
                content: action.description,
                tags: ["self-improve", "needs-review", action.priority],
              });
              applied.push(action);
              break;
            }
          }
        } catch (err) {
          console.error(`  ❌ Failed to apply action: ${action.description}`, err);
        }
      }

      // Step 3: Update state
      state.lastRunAt = Date.now();
      state.lastSessionCount = perfLogCount;
      state.totalImprovements += applied.length;
      state.actionsApplied += applied.length;

      await saveState(stateDir, state);
      await memory.save();

      console.log(`\n🧠 Self-improvement complete: ${applied.length} improvements applied\n`);
      return applied;
    } finally {
      await releaseLock(stateDir);
    }
  }

  /**
   * Quick learning — extract immediate lessons from a single task.
   * Runs after every task (lightweight, no throttle).
   */
  async function learnFromTask(
    taskDescription: string,
    toolsUsed: string[],
    success: boolean,
    userFeedback?: string
  ): Promise<void> {
    // Only learn from notable events
    if (success && !userFeedback) return;

    if (!success) {
      await memory.add({
        type: "feedback",
        title: `task_failure:${Date.now()}`,
        content: `Task "${taskDescription.slice(0, 100)}" failed using tools [${toolsUsed.join(", ")}]. Should investigate and improve approach.`,
        tags: ["failure", ...toolsUsed],
      });
    }

    if (userFeedback === "negative") {
      await memory.add({
        type: "feedback",
        title: `negative_feedback:${Date.now()}`,
        content: `User gave negative feedback on "${taskDescription.slice(0, 100)}". Tools used: [${toolsUsed.join(", ")}]. Need to adjust approach.`,
        tags: ["feedback", "negative", ...toolsUsed],
      });
    }

    if (userFeedback === "positive") {
      await memory.add({
        type: "preference",
        title: `positive_feedback:${Date.now()}`,
        content: `User approved approach for "${taskDescription.slice(0, 100)}". Tools: [${toolsUsed.join(", ")}]. Keep doing this.`,
        tags: ["feedback", "positive", ...toolsUsed],
      });
    }
  }

  /**
   * Get self-improvement stats for reporting.
   */
  function getStats(): OptimizerState {
    return { ...state };
  }

  // Load initial state
  loadState(stateDir).then((s) => {
    if (s) state = s;
  });

  return {
    runOptimizationCycle,
    learnFromTask,
    getStats,
  };
}

// --- Lock & State Persistence ---

async function tryAcquireLock(dir: string): Promise<boolean> {
  const lockPath = join(dir, LOCK_FILE);
  try {
    await mkdir(dir, { recursive: true });
    const content = await readFile(lockPath, "utf-8").catch(() => null);
    if (content) {
      const lockTime = parseInt(content, 10);
      // Stale lock (older than 1 hour)
      if (Date.now() - lockTime > 3_600_000) {
        await writeFile(lockPath, String(Date.now()), "utf-8");
        return true;
      }
      return false;
    }
    await writeFile(lockPath, String(Date.now()), "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function releaseLock(dir: string): Promise<void> {
  try {
    const { unlink } = await import("fs/promises");
    await unlink(join(dir, LOCK_FILE));
  } catch {
    // OK
  }
}

async function loadState(dir: string): Promise<OptimizerState | null> {
  try {
    const raw = await readFile(join(dir, STATE_FILE), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveState(dir: string, state: OptimizerState): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, STATE_FILE), JSON.stringify(state, null, 2), "utf-8");
}
