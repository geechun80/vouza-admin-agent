// =============================================================================
// Agent Launcher Bridge — Starts the agent from saved config.json
// Bridges the setup wizard UI to the running agent process
// =============================================================================

import { randomUUID } from "crypto";
import chalk from "chalk";
import type { AgentContext, SkillDefinition } from "../types/index.js";
import { loadConfigFromJson } from "../config/loader.js";
import { ToolRegistry } from "../tools/registry.js";
import { createMemoryStore } from "../memory/store.js";
import { loadSkills } from "../skills/loader.js";
import { agentLoop } from "../agent/loop.js";
import { initSelfImproveLoop } from "../self-improve/optimizer.js";
import { TaskScheduler } from "../tasks/scheduler.js";

// Import all tools
import { startTelegramListener, stopTelegramListener } from "../telegram/listener.js";
import { readEmailsTool, sendEmailTool, draftEmailTool, triageEmailsTool } from "../tools/email.js";
import { listEventsTool, createEventTool, updateEventTool, findFreeSlotsTool } from "../tools/calendar.js";
import { readSpreadsheetTool, writeSpreadsheetTool, searchSpreadsheetTool } from "../tools/spreadsheet.js";
import { sendSlackMessageTool, readSlackMessagesTool, listSlackChannelsTool } from "../tools/messenger.js";
import { listFilesTool, readFileTool, readExcelFileTool, writeFileTool, organizeFilesTool } from "../tools/fileManager.js";
import { sendTelegramMessageTool, readTelegramUpdatesTool, getTelegramBotInfoTool, forwardTelegramMessageTool } from "../tools/telegram.js";
import { sendWhatsAppMessageTool, readWhatsAppMessagesTool } from "../tools/whatsapp.js";
import { saveMemoryTool, searchMemoryTool, forgetMemoryTool } from "../tools/memory.js";
import { transcribeAudioTool, transcribeAndSummarizeTool } from "../tools/voice.js";
import { getSetupStatusTool, saveIntegrationCredentialsTool } from "../tools/setup.js";

export interface AgentInstance {
  context: AgentContext;
  registry: ToolRegistry;
  scheduler: TaskScheduler;
  skills: Map<string, SkillDefinition>;
  selfImprove: ReturnType<typeof initSelfImproveLoop>;
  runTask: (message: string) => AsyncGenerator<any>;
  stop: () => Promise<void>;
}

/**
 * Launch an agent from the saved config.json.
 * Called by the dashboard "Launch Agent" button or by the CLI.
 */
export async function launchAgent(): Promise<AgentInstance> {
  const config = await loadConfigFromJson();

  console.log(chalk.bold.cyan(`\n  Starting ${config.name}...`));
  console.log(chalk.gray(`  Model: ${config.model} (${config.provider})`));

  // --- Register Tools ---
  const registry = new ToolRegistry();

  // Email tools
  registry.register(readEmailsTool as any);
  registry.register(sendEmailTool as any);
  registry.register(draftEmailTool as any);
  registry.register(triageEmailsTool as any);

  // Calendar tools
  registry.register(listEventsTool as any);
  registry.register(createEventTool as any);
  registry.register(updateEventTool as any);
  registry.register(findFreeSlotsTool as any);

  // Spreadsheet tools
  registry.register(readSpreadsheetTool as any);
  registry.register(writeSpreadsheetTool as any);
  registry.register(searchSpreadsheetTool as any);

  // Messaging tools — Slack
  registry.register(sendSlackMessageTool as any);
  registry.register(readSlackMessagesTool as any);
  registry.register(listSlackChannelsTool as any);

  // Messaging tools — Telegram
  registry.register(sendTelegramMessageTool as any);
  registry.register(readTelegramUpdatesTool as any);
  registry.register(getTelegramBotInfoTool as any);
  registry.register(forwardTelegramMessageTool as any);

  // Messaging tools — WhatsApp
  registry.register(sendWhatsAppMessageTool as any);
  registry.register(readWhatsAppMessagesTool as any);

  // File tools
  registry.register(listFilesTool as any);
  registry.register(readFileTool as any);
  registry.register(readExcelFileTool as any);
  registry.register(writeFileTool as any);
  registry.register(organizeFilesTool as any);

  // Memory tools
  registry.register(saveMemoryTool as any);
  registry.register(searchMemoryTool as any);
  registry.register(forgetMemoryTool as any);

  // Voice tools
  registry.register(transcribeAudioTool as any);
  registry.register(transcribeAndSummarizeTool as any);

  // Setup & onboarding tools
  registry.register(getSetupStatusTool as any);
  registry.register(saveIntegrationCredentialsTool as any);

  console.log(chalk.green(`  ${registry.getAll().length} tools registered`));

  // --- Load Memory ---
  const memory = createMemoryStore(config.memoryDir);
  await memory.load();
  console.log(chalk.green(`  ${memory.entries.size} memories loaded`));

  // --- Load Skills ---
  const skills = await loadSkills(config.skillsDir);
  console.log(chalk.green(`  ${skills.size} skills loaded`));

  // --- Init Context ---
  const context: AgentContext = {
    sessionId: randomUUID().slice(0, 12),
    turnCount: 0,
    messages: [],
    memory,
    config,
    tools: registry.getAll().reduce((m, t) => m.set(t.name, t), new Map()),
    taskQueue: [],
  };

  // --- Init Self-Improvement ---
  const selfImprove = initSelfImproveLoop(config, memory);
  console.log(chalk.green(`  Self-improvement engine initialized`));

  // --- Init Task Scheduler ---
  const scheduler = new TaskScheduler(context, registry, skills);

  console.log(chalk.bold.green(`\n  ${config.name} is running!\n`));

  // --- Start Telegram Listener (if configured) ---
  // Runs in background — starts a long-polling loop so users can message the
  // bot and receive real AI responses back. Silently skips if not configured.
  await startTelegramListener(context, registry);

  // --- Send launch notification to Telegram (if configured) ---
  // Lets the user know the agent is live and kicks off guided onboarding.
  const tgToken = config.tools?.telegram?.botToken;
  if (tgToken) {
    // We don't have a chat_id yet (user hasn't messaged), so just log guidance
    console.log(chalk.cyan(`  [Telegram] Bot is live — message it to start guided setup`));
  }

  return {
    context,
    registry,
    scheduler,
    skills,
    selfImprove,
    runTask: (message: string) => agentLoop(message, context, registry),
    stop: async () => {
      stopTelegramListener();
      scheduler.stopAll();
      await memory.save();
      console.log(chalk.cyan(`\n  ${config.name} stopped. Memory saved.\n`));
    },
  };
}

/**
 * Quick status check — returns agent health info.
 */
export async function getAgentStatus(instance: AgentInstance) {
  return {
    running: true,
    name: instance.context.config.name,
    model: instance.context.config.model,
    provider: instance.context.config.provider,
    toolCount: instance.registry.getAll().length,
    memoryCount: instance.context.memory.entries.size,
    skillCount: instance.skills.size,
    scheduledTasks: instance.scheduler.list().length,
    sessionId: instance.context.sessionId,
    turnCount: instance.context.turnCount,
  };
}
