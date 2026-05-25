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
import { startBaileysListener, stopBaileysListener, isBaileysConnected, isBaileysWorkerRunning } from "../whatsapp/baileysManager.js";
import { startAgentMailListener, stopAgentMailListener } from "../email/agentMailListener.js";
import { ServiceManager } from "./serviceManager.js";
import { readEmailsTool, sendEmailTool, draftEmailTool, triageEmailsTool, getEmailThreadTool, replyEmailTool, deleteEmailTool } from "../tools/email.js";
import { listEventsTool, createEventTool, updateEventTool, findFreeSlotsTool, deleteEventTool } from "../tools/calendar.js";
import { readSpreadsheetTool, writeSpreadsheetTool, searchSpreadsheetTool } from "../tools/spreadsheet.js";
// Slack listener deferred — Bolt SDK + Socket Mode not yet implemented
// import { sendSlackMessageTool, readSlackMessagesTool, listSlackChannelsTool } from "../tools/messenger.js";
import { listFilesTool, readFileTool, readExcelFileTool, writeFileTool, organizeFilesTool, deleteFileTool, copyFileTool, renameFileTool } from "../tools/fileManager.js";
import { sendTelegramMessageTool, readTelegramUpdatesTool, getTelegramBotInfoTool, forwardTelegramMessageTool } from "../tools/telegram.js";
import { sendWhatsAppMessageTool, readWhatsAppMessagesTool } from "../tools/whatsapp.js";
import {
  agentMailListThreadsTool,
  agentMailGetThreadTool,
  agentMailSendEmailTool,
  agentMailCreateInboxTool,
} from "../tools/agentMail.js";
import { saveMemoryTool, searchMemoryTool, forgetMemoryTool, updateMemoryTool, listAllMemoriesTool } from "../tools/memory.js";
import { transcribeAudioTool, transcribeAndSummarizeTool } from "../tools/voice.js";
import { getSetupStatusTool, saveIntegrationCredentialsTool } from "../tools/setup.js";
import { webSearchTool } from "../tools/webSearch.js";
import { runShellCommandTool } from "../tools/shell.js";

export interface AgentInstance {
  context:        AgentContext;
  registry:       ToolRegistry;
  scheduler:      TaskScheduler;
  skills:         Map<string, SkillDefinition>;
  selfImprove:    ReturnType<typeof initSelfImproveLoop>;
  serviceManager: ServiceManager;
  runTask:        (message: string) => AsyncGenerator<any>;
  stop:           () => Promise<void>;
}

/**
 * Launch an agent from the saved config.json.
 * Called by the dashboard "Launch Agent" button or by the CLI.
 */
export async function launchAgent(): Promise<AgentInstance> {
  const config = await loadConfigFromJson();

  console.log(chalk.bold.cyan(`\n  Starting ${config.name}...`));
  console.log(chalk.gray(`  Model: ${config.model} (${config.provider})`));

  // --- Register Tools (lazy — only tools with valid credentials) ---
  // Phase 0 fix: injecting 27 tool schemas into every AI call when most are
  // unconfigured bloats the system prompt and slows inference. Only load what
  // the user actually has set up.
  const registry = new ToolRegistry();
  const tools   = config.tools ?? {};

  const hasEmail      = !!(tools.gmail?.user || tools.gmail?.appPassword);
  const hasGoogle     = !!(tools.google?.credentialsJson);
  const hasTelegram   = !!(tools.telegram?.botToken);
  const hasWhatsApp   = !!(tools.whatsapp?.provider);
  const hasAgentMail  = !!(tools.agentmail?.apiKey);
  const hasVoice      = !!(config.whisperApiKey);

  // Email tools — only when Gmail is configured
  if (hasEmail) {
    registry.register(readEmailsTool as any);
    registry.register(sendEmailTool as any);
    registry.register(draftEmailTool as any);
    registry.register(triageEmailsTool as any);
    registry.register(getEmailThreadTool as any);
    registry.register(replyEmailTool as any);
    registry.register(deleteEmailTool as any);
  }

  // Calendar tools — only when Google service account is present
  if (hasGoogle) {
    registry.register(listEventsTool as any);
    registry.register(createEventTool as any);
    registry.register(updateEventTool as any);
    registry.register(findFreeSlotsTool as any);
    registry.register(deleteEventTool as any);
  }

  // Spreadsheet tools — shares the same Google service account
  if (hasGoogle) {
    registry.register(readSpreadsheetTool as any);
    registry.register(writeSpreadsheetTool as any);
    registry.register(searchSpreadsheetTool as any);
  }

  // Telegram tools — only when a bot token is saved
  if (hasTelegram) {
    registry.register(sendTelegramMessageTool as any);
    registry.register(readTelegramUpdatesTool as any);
    registry.register(getTelegramBotInfoTool as any);
    registry.register(forwardTelegramMessageTool as any);
  }

  // WhatsApp tools — only when a provider is configured
  if (hasWhatsApp) {
    registry.register(sendWhatsAppMessageTool as any);
    registry.register(readWhatsAppMessagesTool as any);
  }

  // AgentMail tools — only when an API key is saved
  if (hasAgentMail) {
    registry.register(agentMailListThreadsTool as any);
    registry.register(agentMailGetThreadTool as any);
    registry.register(agentMailSendEmailTool as any);
    registry.register(agentMailCreateInboxTool as any);
  }

  // Voice / Whisper tools — only when a Groq or OpenAI key is available
  if (hasVoice) {
    registry.register(transcribeAudioTool as any);
    registry.register(transcribeAndSummarizeTool as any);
  }

  // ── Always-on tools (no credentials needed) ───────────────────────────────
  // File tools — sandboxed to workspace/
  registry.register(listFilesTool as any);
  registry.register(readFileTool as any);
  registry.register(readExcelFileTool as any);
  registry.register(writeFileTool as any);
  registry.register(organizeFilesTool as any);
  registry.register(deleteFileTool as any);
  registry.register(copyFileTool as any);
  registry.register(renameFileTool as any);

  // Memory tools — local file store
  registry.register(saveMemoryTool as any);
  registry.register(searchMemoryTool as any);
  registry.register(forgetMemoryTool as any);
  registry.register(updateMemoryTool as any);
  registry.register(listAllMemoriesTool as any);

  // Web search — falls back to free providers if no API key
  registry.register(webSearchTool as any);

  // Setup & onboarding — always needed for wizard flow
  registry.register(getSetupStatusTool as any);
  registry.register(saveIntegrationCredentialsTool as any);

  // Shell — sandboxed whitelisted commands (npm, pm2, git, node)
  registry.register(runShellCommandTool as any);

  const activeModules = [
    hasEmail     && "email",
    hasGoogle    && "calendar+sheets",
    hasTelegram  && "telegram",
    hasWhatsApp  && "whatsapp",
    hasAgentMail && "agentmail",
    hasVoice     && "voice",
  ].filter(Boolean).join(", ") || "none yet";

  console.log(chalk.green(`  ${registry.getAll().length} tools registered`));
  console.log(chalk.gray(`  Active integrations: ${activeModules}`));

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

  // --- Service Manager — registers and starts all channel listeners ---
  // Phase 3: replaces ad-hoc startXListener / stopXListener calls with a
  // structured registry that tracks health and supports per-service restart.
  const waProvider = config.tools?.whatsapp?.provider;

  const svcMgr = new ServiceManager();

  svcMgr.register({
    name:        "telegram",
    displayName: "Telegram Bot",
    enabled:     hasTelegram,
    start:       (ctx, reg) => startTelegramListener(ctx, reg),
    stop:        () => stopTelegramListener(),
  });

  svcMgr.register({
    name:        "whatsapp",
    displayName: "WhatsApp (Baileys)",
    enabled:     hasWhatsApp && waProvider === "web",
    start:       (ctx, reg) => startBaileysListener(ctx, reg),
    stop:        () => stopBaileysListener(),
    // Liveness probe: distinguish "worker up, waiting for QR" from "connected"
    liveness:    () => {
      if (isBaileysConnected())      return "running";
      if (isBaileysWorkerRunning())  return "connecting";
      return "error";
    },
  });

  svcMgr.register({
    name:        "agentmail",
    displayName: "AgentMail",
    enabled:     hasAgentMail,
    start:       (ctx, reg) => startAgentMailListener(ctx, reg),
    stop:        () => stopAgentMailListener(),
  });

  await svcMgr.startAll(context, registry);

  // ── Register integrations with the unified registry ──────────────────────
  // Each adapter implements the Integration interface so the HealthMonitor
  // can probe + auto-recover them uniformly. This is the new pattern
  // replacing per-service ad-hoc status checks.
  const { integrationRegistry } = await import("../integrations/registry.js");
  const { healthMonitor } = await import("../integrations/healthMonitor.js");

  // AI provider is ALWAYS registered — without it, the agent can't think.
  // The adapter probes the resolved key (user OR operator fallback) every
  // 60s, catching revoked / expired / wrong-format keys in the dashboard
  // long before a user-triggered message returns 401.
  const { AIProviderIntegration } = await import("../integrations/aiProviderIntegration.js");
  integrationRegistry.register(new AIProviderIntegration(() => context));

  if (hasWhatsApp) {
    const { WhatsAppIntegration } = await import("../integrations/whatsappIntegration.js");
    integrationRegistry.register(new WhatsAppIntegration(() => context));
  }

  if (hasTelegram) {
    const { TelegramIntegration } = await import("../integrations/telegramIntegration.js");
    integrationRegistry.register(new TelegramIntegration(() => context, () => registry));
  }

  // Start the background health monitor (probes every 60s, auto-recovers
  // known-recoverable failures). Idempotent — safe to call even if already running.
  healthMonitor.start();

  return {
    context,
    registry,
    scheduler,
    skills,
    selfImprove,
    serviceManager: svcMgr,
    runTask: (message: string) => agentLoop(message, context, registry),
    stop: async () => {
      const { healthMonitor: hm } = await import("../integrations/healthMonitor.js");
      hm.stop();
      await svcMgr.stopAll();
      scheduler.stopAll();
      await memory.save();
      console.log(chalk.cyan(`\n  ${config.name} stopped. Memory saved.\n`));
    },
  };
}

/**
 * Quick status check — returns agent health info including per-service status.
 */
export async function getAgentStatus(instance: AgentInstance) {
  return {
    running:        true,
    name:           instance.context.config.name,
    model:          instance.context.config.model,
    provider:       instance.context.config.provider,
    toolCount:      instance.registry.getAll().length,
    memoryCount:    instance.context.memory.entries.size,
    skillCount:     instance.skills.size,
    scheduledTasks: instance.scheduler.list().length,
    sessionId:      instance.context.sessionId,
    turnCount:      instance.context.turnCount,
    // Phase 3 — service health per channel listener
    services:       instance.serviceManager.health(),
    allServicesHealthy: instance.serviceManager.allHealthy(),
  };
}
