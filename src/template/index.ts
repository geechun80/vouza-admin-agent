// =============================================================================
// Agent Template System — Build new agents from reusable templates
//
// Usage:
//   import { createAgentFromTemplate, ADMIN_TEMPLATE } from "./template/index.js";
//   const agent = await createAgentFromTemplate(ADMIN_TEMPLATE, { name: "MyBot" });
//
// To create a new agent type:
//   1. Define an AgentTemplate with system prompt, tools, skills
//   2. Call createAgentFromTemplate() with your template
//   3. The framework handles: tool registry, memory, skills, scheduler, self-improve
// =============================================================================

import { randomUUID } from "crypto";
import type { AgentContext, AgentTemplate, SkillDefinition } from "../types/index.js";
import type { AIProvider } from "../config/models.js";
import { ToolRegistry } from "../tools/registry.js";
import { createMemoryStore } from "../memory/store.js";
import { loadSkills } from "../skills/loader.js";
import { agentLoop } from "../agent/loop.js";
import { initSelfImproveLoop } from "../self-improve/optimizer.js";
import { TaskScheduler } from "../tasks/scheduler.js";

// Import all tools for registration
import { readEmailsTool, sendEmailTool, draftEmailTool, triageEmailsTool } from "../tools/email.js";
import { listEventsTool, createEventTool, updateEventTool, findFreeSlotsTool } from "../tools/calendar.js";
import { readSpreadsheetTool, writeSpreadsheetTool, searchSpreadsheetTool } from "../tools/spreadsheet.js";
import { sendSlackMessageTool, readSlackMessagesTool, listSlackChannelsTool } from "../tools/messenger.js";
import { listFilesTool, readFileTool, readExcelFileTool, writeFileTool, organizeFilesTool } from "../tools/fileManager.js";
import { sendTelegramMessageTool, readTelegramUpdatesTool, getTelegramBotInfoTool, forwardTelegramMessageTool } from "../tools/telegram.js";
import { sendWhatsAppMessageTool, readWhatsAppMessagesTool } from "../tools/whatsapp.js";

// ─── Tool Catalog ──────────────────────────────────────────────────────────
// Maps ToolCategory to available tool instances for auto-registration

const TOOL_CATALOG: Record<string, any[]> = {
  email: [readEmailsTool, sendEmailTool, draftEmailTool, triageEmailsTool],
  calendar: [listEventsTool, createEventTool, updateEventTool, findFreeSlotsTool],
  spreadsheet: [readSpreadsheetTool, writeSpreadsheetTool, searchSpreadsheetTool],
  messaging: [
    sendSlackMessageTool, readSlackMessagesTool, listSlackChannelsTool,
    sendTelegramMessageTool, readTelegramUpdatesTool, getTelegramBotInfoTool, forwardTelegramMessageTool,
    sendWhatsAppMessageTool, readWhatsAppMessagesTool,
  ],
  file: [listFilesTool, readFileTool, readExcelFileTool, writeFileTool, organizeFilesTool],
};

// ─── Template Instance ─────────────────────────────────────────────────────

export interface TemplateInstance {
  template: AgentTemplate;
  context: AgentContext;
  registry: ToolRegistry;
  scheduler: TaskScheduler;
  skills: Map<string, SkillDefinition>;
  selfImprove: ReturnType<typeof initSelfImproveLoop>;
  chat: (message: string) => AsyncGenerator<any>;
  stop: () => Promise<void>;
}

// ─── Create Agent From Template ────────────────────────────────────────────

export interface TemplateOverrides {
  name?: string;
  model?: string;
  provider?: AIProvider;
  apiKeys?: Record<string, string>;
  memoryDir?: string;
  skillsDir?: string;
  extraTools?: any[];
  systemPromptAppend?: string;
}

/**
 * Create a fully configured agent from a template definition.
 * This is the main entry point for building new agent types.
 */
export async function createAgentFromTemplate(
  template: AgentTemplate,
  overrides: TemplateOverrides = {}
): Promise<TemplateInstance> {
  const name = overrides.name || template.name;
  const model = overrides.model || template.defaultModel;
  const provider = overrides.provider || template.defaultProvider;
  const memoryDir = overrides.memoryDir || `./data/${template.id}/memory`;
  const skillsDir = overrides.skillsDir || "./src/skills/bundled";

  // Build config
  const config = {
    name,
    model,
    provider,
    apiKeys: (overrides.apiKeys || {}) as Record<AIProvider, string>,
    memoryDir,
    skillsDir,
    logDir: `./data/${template.id}/logs`,
    selfImproveIntervalHours: 24,
    maxTurnsPerSession: 20,
    tools: {} as any,
  };

  // Register tools from template categories
  const registry = new ToolRegistry();
  const allCategories = [...template.requiredTools, ...template.optionalTools];

  for (const category of allCategories) {
    const tools = TOOL_CATALOG[category];
    if (tools) {
      for (const tool of tools) {
        registry.register(tool as any);
      }
    }
  }

  // Register any extra tools
  if (overrides.extraTools) {
    for (const tool of overrides.extraTools) {
      registry.register(tool as any);
    }
  }

  // Load memory
  const memory = createMemoryStore(memoryDir);
  await memory.load();

  // Load skills
  const skills = await loadSkills(skillsDir);

  // Build context
  const context: AgentContext = {
    sessionId: randomUUID().slice(0, 12),
    turnCount: 0,
    messages: [],
    memory,
    config,
    tools: registry.getAll().reduce((m, t) => m.set(t.name, t), new Map()),
    taskQueue: [],
  };

  // Init self-improvement
  const selfImprove = initSelfImproveLoop(config, memory);

  // Init scheduler
  const scheduler = new TaskScheduler(context, registry, skills);

  // Set up default schedules from template
  for (const sched of template.defaultSchedules) {
    try {
      scheduler.schedule({
        name: sched.description,
        description: sched.description,
        skillName: sched.skillName,
        schedule: sched.schedule,
        maxRetries: 3,
      });
    } catch {
      // Skip invalid schedules
    }
  }

  // Build system prompt
  const systemPrompt = template.systemPrompt + (overrides.systemPromptAppend || "");

  return {
    template,
    context,
    registry,
    scheduler,
    skills,
    selfImprove,
    chat: (message: string) => agentLoop(message, context, registry, systemPrompt),
    stop: async () => {
      scheduler.stopAll();
      await memory.save();
    },
  };
}

// =============================================================================
// Built-in Templates
// =============================================================================

/** Admin Agent — the default template for office administration */
export const ADMIN_TEMPLATE: AgentTemplate = {
  id: "admin-agent",
  name: "Admin Agent",
  description: "AI-powered office administrator and executive assistant",
  version: "2.0.0",
  defaultModel: "claude-sonnet-4-6",
  defaultProvider: "anthropic",
  requiredTools: ["email", "calendar", "messaging"],
  optionalTools: ["spreadsheet", "file"],
  bundledSkills: ["triage-email", "daily-briefing", "schedule-meeting", "draft-reply", "process-invoice", "data-entry"],
  defaultSchedules: [
    { skillName: "daily-briefing", schedule: "30 8 * * 1-5", description: "Morning briefing" },
    { skillName: "triage-email", schedule: "0 9-17/2 * * 1-5", description: "Email triage every 2h" },
  ],
  systemPrompt: `You are an AI-powered office administrator and executive assistant.

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

## Rules
- Always confirm before sending external emails or messages
- Never share sensitive data
- Ask for clarification when tasks are ambiguous
- Prioritize accuracy over speed`,
};

/** Sales Agent — template for sales and CRM automation */
export const SALES_TEMPLATE: AgentTemplate = {
  id: "sales-agent",
  name: "Sales Agent",
  description: "AI sales assistant for lead management, follow-ups, and pipeline tracking",
  version: "1.0.0",
  defaultModel: "claude-sonnet-4-6",
  defaultProvider: "anthropic",
  requiredTools: ["email", "messaging", "spreadsheet"],
  optionalTools: ["calendar", "file"],
  bundledSkills: ["draft-reply", "daily-briefing"],
  defaultSchedules: [
    { skillName: "daily-briefing", schedule: "0 8 * * 1-5", description: "Pipeline summary" },
  ],
  systemPrompt: `You are an AI sales assistant focused on lead management and pipeline tracking.

## Your Capabilities
- Track and manage sales leads in spreadsheets
- Draft personalized follow-up emails
- Schedule sales calls and demos
- Generate pipeline reports and forecasts
- Monitor team communication for deal updates

## Rules
- Be professional and personable in all communications
- Track every interaction for CRM records
- Prioritize high-value leads
- Never send emails without confirmation`,
};

/** Support Agent — template for customer support automation */
export const SUPPORT_TEMPLATE: AgentTemplate = {
  id: "support-agent",
  name: "Support Agent",
  description: "AI customer support agent for ticket triage, response drafting, and escalation",
  version: "1.0.0",
  defaultModel: "gemini-2.5-flash",
  defaultProvider: "google",
  requiredTools: ["email", "messaging"],
  optionalTools: ["spreadsheet", "file"],
  bundledSkills: ["triage-email", "draft-reply"],
  defaultSchedules: [
    { skillName: "triage-email", schedule: "*/30 9-18 * * 1-5", description: "Triage every 30 min" },
  ],
  systemPrompt: `You are an AI customer support agent focused on fast, helpful responses.

## Your Capabilities
- Triage and categorize support tickets
- Draft helpful responses to common questions
- Escalate complex issues to human agents
- Track support metrics and SLAs
- Manage knowledge base references

## Rules
- Be empathetic and professional
- Resolve simple issues immediately
- Escalate when unsure — never guess
- Always reference ticket/case numbers`,
};

/** Research Agent — template for information gathering and analysis */
export const RESEARCH_TEMPLATE: AgentTemplate = {
  id: "research-agent",
  name: "Research Agent",
  description: "AI research assistant for data collection, analysis, and report generation",
  version: "1.0.0",
  defaultModel: "claude-opus-4-6",
  defaultProvider: "anthropic",
  requiredTools: ["file", "spreadsheet"],
  optionalTools: ["email", "messaging"],
  bundledSkills: ["data-entry"],
  defaultSchedules: [],
  systemPrompt: `You are an AI research assistant focused on information gathering and analysis.

## Your Capabilities
- Collect and organize data from various sources
- Analyze data and identify patterns
- Generate comprehensive research reports
- Maintain organized file systems for research
- Create and update tracking spreadsheets

## Rules
- Always cite sources and provide evidence
- Flag uncertain or conflicting information
- Organize findings in a structured format
- Prioritize accuracy and completeness`,
};

// ─── Template Registry ─────────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: AgentTemplate[] = [
  ADMIN_TEMPLATE,
  SALES_TEMPLATE,
  SUPPORT_TEMPLATE,
  RESEARCH_TEMPLATE,
];

export function findTemplate(id: string): AgentTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id);
}

// Re-export scaffold for convenience
export { scaffoldAgent, type ScaffoldOptions } from "./scaffold.js";
