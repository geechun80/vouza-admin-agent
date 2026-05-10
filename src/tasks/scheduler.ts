// =============================================================================
// Task Scheduler — Cron-based recurring task execution
// Runs skills on schedule (e.g., daily briefing, hourly email triage)
// =============================================================================

import cron from "node-cron";
import { randomUUID } from "crypto";
import type { TaskEntry, AgentContext, SkillDefinition } from "../types/index.js";
import { ToolRegistry } from "../tools/registry.js";
import { agentLoop } from "../agent/loop.js";

interface ScheduledJob {
  task: TaskEntry;
  cronJob: cron.ScheduledTask;
}

export class TaskScheduler {
  private jobs = new Map<string, ScheduledJob>();
  private context: AgentContext;
  private registry: ToolRegistry;
  private skills: Map<string, SkillDefinition>;

  constructor(
    context: AgentContext,
    registry: ToolRegistry,
    skills: Map<string, SkillDefinition>
  ) {
    this.context = context;
    this.registry = registry;
    this.skills = skills;
  }

  /**
   * Schedule a recurring task based on a cron expression.
   */
  schedule(task: Omit<TaskEntry, "id" | "status" | "retryCount">): string {
    const id = randomUUID().slice(0, 12);
    const entry: TaskEntry = {
      ...task,
      id,
      status: "pending",
      retryCount: 0,
      maxRetries: task.maxRetries ?? 3,
    };

    if (!task.schedule || !cron.validate(task.schedule)) {
      throw new Error(`Invalid cron expression: ${task.schedule}`);
    }

    const cronJob = cron.schedule(task.schedule, async () => {
      await this.executeTask(entry);
    });

    this.jobs.set(id, { task: entry, cronJob });
    this.context.taskQueue.push(entry);

    console.log(`📋 Scheduled "${entry.name}" with cron: ${entry.schedule}`);
    return id;
  }

  /**
   * Run a task immediately (one-shot).
   */
  async runNow(taskOrSkillName: string): Promise<TaskEntry> {
    // Check if it's a scheduled task
    const job = this.jobs.get(taskOrSkillName);
    if (job) {
      await this.executeTask(job.task);
      return job.task;
    }

    // Check if it's a skill name
    const skill = this.skills.get(taskOrSkillName);
    if (skill) {
      const entry: TaskEntry = {
        id: randomUUID().slice(0, 12),
        name: skill.displayName,
        description: skill.description,
        skillName: skill.name,
        status: "pending",
        retryCount: 0,
        maxRetries: 3,
      };
      await this.executeTask(entry);
      return entry;
    }

    throw new Error(`Unknown task or skill: ${taskOrSkillName}`);
  }

  /**
   * Cancel a scheduled task.
   */
  cancel(taskId: string): boolean {
    const job = this.jobs.get(taskId);
    if (!job) return false;

    job.cronJob.stop();
    this.jobs.delete(taskId);
    this.context.taskQueue = this.context.taskQueue.filter((t) => t.id !== taskId);
    console.log(`❌ Cancelled task: ${job.task.name}`);
    return true;
  }

  /**
   * List all scheduled tasks.
   */
  list(): TaskEntry[] {
    return Array.from(this.jobs.values()).map((j) => j.task);
  }

  /**
   * Stop all scheduled tasks.
   */
  stopAll(): void {
    for (const [id, job] of this.jobs) {
      job.cronJob.stop();
    }
    this.jobs.clear();
    console.log("⏹️  All scheduled tasks stopped");
  }

  // --- Private ---

  private async executeTask(task: TaskEntry): Promise<void> {
    task.status = "running";
    task.lastRun = Date.now();
    console.log(`\n▶️  Running task: ${task.name}`);

    try {
      // Build the prompt from the skill or description
      let prompt: string;
      if (task.skillName) {
        const skill = this.skills.get(task.skillName);
        if (skill) {
          prompt = `Execute the "${skill.displayName}" skill.\n\n${skill.prompt}`;
        } else {
          prompt = task.description;
        }
      } else {
        prompt = task.description;
      }

      // Run through agent loop
      let output = "";
      for await (const event of agentLoop(prompt, this.context, this.registry)) {
        if (event.type === "text_delta") {
          output += event.text;
        }
        if (event.type === "error") {
          throw new Error(event.error);
        }
      }

      task.status = "completed";
      task.result = { success: true, data: output.slice(0, 500) };
      task.retryCount = 0;
      console.log(`✅ Task completed: ${task.name}`);
    } catch (err) {
      task.retryCount++;
      const message = err instanceof Error ? err.message : String(err);

      if (task.retryCount < task.maxRetries) {
        task.status = "pending"; // Will retry on next cron tick
        console.log(`⚠️  Task failed (retry ${task.retryCount}/${task.maxRetries}): ${task.name}`);
      } else {
        task.status = "failed";
        task.result = { success: false, error: message };
        console.log(`❌ Task failed permanently: ${task.name} — ${message}`);
      }
    }
  }
}

// --- Default schedules for common admin tasks ---

export function setupDefaultSchedules(scheduler: TaskScheduler): void {
  // Daily morning briefing at 8:30 AM
  scheduler.schedule({
    name: "Morning Briefing",
    description: "Generate daily briefing with calendar, emails, and tasks",
    skillName: "daily-briefing",
    schedule: "30 8 * * 1-5", // Mon-Fri at 8:30 AM
    maxRetries: 2,
  });

  // Email triage every 2 hours during work hours
  scheduler.schedule({
    name: "Email Triage",
    description: "Check and categorize new emails",
    skillName: "triage-email",
    schedule: "0 9-17/2 * * 1-5", // Every 2 hours, 9-5, Mon-Fri
    maxRetries: 3,
  });

  // End-of-day summary at 5:30 PM
  scheduler.schedule({
    name: "End of Day Summary",
    description: "Summarize what was accomplished today and what's pending for tomorrow",
    skillName: "daily-briefing",
    schedule: "30 17 * * 1-5", // Mon-Fri at 5:30 PM
    maxRetries: 1,
  });

  console.log("\n📋 Default schedules configured (Mon-Fri work hours)\n");
}
