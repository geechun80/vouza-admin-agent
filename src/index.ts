// =============================================================================
// Admin Agent — Main Entry Point (Template-Ready Architecture)
//
// A self-improving AI admin assistant built on reusable template patterns:
// - Multi-provider AI support (Anthropic, OpenAI, Gemini, Grok, DeepSeek, Qwen, Kimi)
// - Streaming agent loop with tool orchestration
// - Markdown-based skills system
// - Persistent file-based memory
// - Auto-dream self-improvement engine
// - Cron-scheduled recurring tasks
// - Template system for building new agent types
// =============================================================================

import { createInterface } from "readline";
import chalk from "chalk";

import { loadConfig, loadConfigFromJson } from "./config/loader.js";
import { createAgentFromTemplate, ADMIN_TEMPLATE, BUILT_IN_TEMPLATES, scaffoldAgent, findTemplate } from "./template/index.js";
import { setupDefaultSchedules } from "./tasks/scheduler.js";
import { join } from "path";

async function main() {
  console.log(chalk.bold.cyan("\n+==========================================+"));
  console.log(chalk.bold.cyan("|         Admin Agent v2.0.0               |"));
  console.log(chalk.bold.cyan("|   Self-Improving AI Office Assistant     |"));
  console.log(chalk.bold.cyan("|   Multi-Provider | Template-Ready        |"));
  console.log(chalk.bold.cyan("+==========================================+\n"));

  // --- Load Config (try JSON first, fallback to env) ---
  let config;
  try {
    config = await loadConfigFromJson();
  } catch {
    config = loadConfig();
  }

  console.log(chalk.gray(`Model: ${config.model} (${config.provider})`));
  console.log(chalk.gray(`Memory: ${config.memoryDir}`));
  console.log(chalk.gray(`Skills: ${config.skillsDir}`));

  // --- Create Agent from Template ---
  const agent = await createAgentFromTemplate(ADMIN_TEMPLATE, {
    name: config.name,
    model: config.model,
    provider: config.provider,
    apiKeys: config.apiKeys,
    memoryDir: config.memoryDir,
    skillsDir: config.skillsDir,
  });

  console.log(chalk.green(`\n  ${agent.registry.getAll().length} tools registered`));
  console.log(chalk.green(`  ${agent.context.memory.entries.size} memories loaded`));
  console.log(chalk.green(`  ${agent.skills.size} skills loaded: ${Array.from(agent.skills.keys()).join(", ")}`));
  console.log(chalk.green(`  Self-improvement engine initialized (interval: ${config.selfImproveIntervalHours}h)`));

  // --- Interactive REPL ---
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.yellow("\nCommands:"));
  console.log(chalk.gray("  /schedule          - Set up default task schedules"));
  console.log(chalk.gray("  /tasks             - List scheduled tasks"));
  console.log(chalk.gray("  /run <skill>       - Run a skill immediately"));
  console.log(chalk.gray("  /improve           - Trigger self-improvement cycle"));
  console.log(chalk.gray("  /stats             - Show self-improvement stats"));
  console.log(chalk.gray("  /memory            - Show memory summary"));
  console.log(chalk.gray("  /skills            - List available skills"));
  console.log(chalk.gray("  /templates         - List available agent templates"));
  console.log(chalk.gray("  /scaffold <id> <dir> - Create new agent project from template"));
  console.log(chalk.gray("  /quit              - Exit"));
  console.log(chalk.yellow("\nOr type any task in natural language.\n"));

  const prompt = () => {
    rl.question(chalk.bold.blue("You > "), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return prompt();

      // --- Handle Commands ---
      if (trimmed === "/quit" || trimmed === "/exit") {
        console.log(chalk.cyan("\n  Goodbye! Saving memory...\n"));
        await agent.stop();
        rl.close();
        process.exit(0);
      }

      if (trimmed === "/schedule") {
        setupDefaultSchedules(agent.scheduler);
        return prompt();
      }

      if (trimmed === "/tasks") {
        const tasks = agent.scheduler.list();
        if (tasks.length === 0) {
          console.log(chalk.gray("  No scheduled tasks. Use /schedule to set up defaults."));
        } else {
          for (const t of tasks) {
            console.log(chalk.gray(`  ${t.name} [${t.schedule}] - ${t.status}`));
          }
        }
        return prompt();
      }

      if (trimmed.startsWith("/run ")) {
        const skillName = trimmed.slice(5).trim();
        try {
          await agent.scheduler.runNow(skillName);
        } catch (err) {
          console.log(chalk.red(`  Error: ${err}`));
        }
        return prompt();
      }

      if (trimmed === "/improve") {
        console.log(chalk.cyan("  Triggering self-improvement cycle..."));
        const actions = await agent.selfImprove.runOptimizationCycle();
        if (actions.length === 0) {
          console.log(chalk.gray("  No improvements needed at this time."));
        }
        return prompt();
      }

      if (trimmed === "/stats") {
        const stats = agent.selfImprove.getStats();
        console.log(chalk.cyan("  Self-Improvement Stats:"));
        console.log(chalk.gray(`    Total improvements: ${stats.totalImprovements}`));
        console.log(chalk.gray(`    Skills created: ${stats.skillsCreated.length}`));
        console.log(chalk.gray(`    Skills improved: ${stats.skillsImproved.length}`));
        console.log(chalk.gray(`    Last run: ${stats.lastRunAt ? new Date(stats.lastRunAt).toLocaleString() : "Never"}`));
        return prompt();
      }

      if (trimmed === "/memory") {
        const entries = Array.from(agent.context.memory.entries.values());
        const byType = new Map<string, number>();
        for (const e of entries) {
          byType.set(e.type, (byType.get(e.type) || 0) + 1);
        }
        console.log(chalk.cyan(`  Memory: ${entries.length} entries`));
        for (const [type, count] of byType) {
          console.log(chalk.gray(`    ${type}: ${count}`));
        }
        return prompt();
      }

      if (trimmed === "/skills") {
        for (const [name, skill] of agent.skills) {
          console.log(chalk.cyan(`  ${skill.displayName}`));
          console.log(chalk.gray(`     ${skill.description}`));
        }
        return prompt();
      }

      if (trimmed === "/templates") {
        console.log(chalk.cyan("\n  Available Agent Templates:\n"));
        for (const t of BUILT_IN_TEMPLATES) {
          console.log(chalk.bold(`  ${t.name} (${t.id})`));
          console.log(chalk.gray(`    ${t.description}`));
          console.log(chalk.gray(`    Default model: ${t.defaultModel} (${t.defaultProvider})`));
          console.log(chalk.gray(`    Required tools: ${t.requiredTools.join(", ")}`));
          console.log(chalk.gray(`    Skills: ${t.bundledSkills.join(", ")}\n`));
        }
        console.log(chalk.yellow(`  Use /scaffold <template-id> <output-dir> to create a new project\n`));
        return prompt();
      }

      if (trimmed.startsWith("/scaffold ")) {
        const parts = trimmed.slice(10).trim().split(/\s+/);
        const templateId = parts[0];
        const outputDir = parts[1] || `./${templateId}`;
        const tmpl = findTemplate(templateId);
        if (!tmpl) {
          console.log(chalk.red(`  Unknown template: ${templateId}`));
          console.log(chalk.gray(`  Available: ${BUILT_IN_TEMPLATES.map(t => t.id).join(", ")}`));
          return prompt();
        }
        try {
          console.log(chalk.cyan(`  Scaffolding "${tmpl.name}" into ${outputDir}...`));
          const result = await scaffoldAgent(tmpl, outputDir);
          console.log(chalk.green(`  Created ${result.createdFiles.length} files:`));
          for (const f of result.createdFiles) {
            console.log(chalk.gray(`    ${f}`));
          }
          console.log(chalk.yellow(`\n  Next: cd ${outputDir} && npm install && npm run setup\n`));
        } catch (err) {
          console.log(chalk.red(`  Scaffold error: ${err}`));
        }
        return prompt();
      }

      // --- Natural Language Task ---
      console.log(chalk.gray("\n  Processing...\n"));

      try {
        for await (const event of agent.chat(trimmed)) {
          switch (event.type) {
            case "text_delta":
              process.stdout.write(chalk.white(event.text));
              break;
            case "tool_start":
              console.log(chalk.yellow(`\n  Using tool: ${event.toolName}`));
              break;
            case "tool_result":
              const icon = event.result.success ? "+" : "x";
              console.log(chalk.gray(`  ${icon} ${event.toolName} complete`));
              break;
            case "turn_complete":
              console.log(chalk.gray(`\n  [${event.turnCount} turns]`));
              break;
            case "error":
              console.log(chalk.red(`\n  Error: ${event.error}`));
              break;
          }
        }

        await agent.selfImprove.learnFromTask(trimmed, [], true);
      } catch (err) {
        console.log(chalk.red(`\n  Error: ${err}`));
        await agent.selfImprove.learnFromTask(trimmed, [], false);
      }

      console.log("");
      prompt();
    });
  };

  prompt();
}

// --- Run ---
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
