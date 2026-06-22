// =============================================================================
// Template Scaffolding — Generate deployment-ready files for new agent types
//
// Creates: start.bat, setup.bat, ecosystem.config.cjs, .env.example,
//          package.json, tsconfig.json, and basic directory structure
//
// Usage:
//   import { scaffoldAgent } from "./template/scaffold.js";
//   await scaffoldAgent(SALES_TEMPLATE, "./my-sales-agent", { name: "SalesBot" });
// =============================================================================

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { AgentTemplate } from "../types/index.js";
import { AI_PROVIDERS } from "../config/models.js";

export interface ScaffoldOptions {
  name?: string;
  port?: number;
  timezone?: string;
}

/**
 * Scaffold a new agent project from a template.
 * Creates a complete, deployable project directory.
 */
export async function scaffoldAgent(
  template: AgentTemplate,
  outputDir: string,
  options: ScaffoldOptions = {}
): Promise<{ createdFiles: string[] }> {
  const name = options.name || template.name;
  const port = options.port || 3456;
  const timezone = options.timezone || "Asia/Singapore";
  const createdFiles: string[] = [];

  // Create directory structure
  const dirs = [
    outputDir,
    join(outputDir, "src"),
    join(outputDir, "src", "skills", "bundled"),
    join(outputDir, "data", "memory"),
    join(outputDir, "data", "logs"),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  // --- start.bat ---
  const startBat = `@echo off
TITLE ${name}

echo Starting ${name}...
echo Building latest version...
call npm run build

echo Starting application...
call npm start

pause
`;
  await writeFile(join(outputDir, "start.bat"), startBat, "utf-8");
  createdFiles.push("start.bat");

  // --- setup.bat ---
  const setupBat = `@echo off
TITLE ${name} Setup Dashboard

echo Starting ${name} Setup Wizard...
echo Ensure you have Node.js 18+ installed.

call npm run setup

pause
`;
  await writeFile(join(outputDir, "setup.bat"), setupBat, "utf-8");
  createdFiles.push("setup.bat");

  // --- ecosystem.config.cjs (PM2) ---
  const pm2Config = `module.exports = {
  apps: [
    {
      name: "${template.id}",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "./data/logs/pm2-error.log",
      out_file: "./data/logs/pm2-out.log"
    }
  ]
};
`;
  await writeFile(join(outputDir, "ecosystem.config.cjs"), pm2Config, "utf-8");
  createdFiles.push("ecosystem.config.cjs");

  // --- .env.example ---
  const envLines = [
    `# =============================================================================`,
    `# ${name} — Environment Configuration`,
    `# Generated from template: ${template.id} v${template.version}`,
    `# =============================================================================`,
    ``,
    `# AI Provider API Keys (set the one for your selected model)`,
  ];

  for (const provider of AI_PROVIDERS) {
    envLines.push(`${provider.apiKeyEnvVar}=`);
  }

  envLines.push(
    ``,
    `# Agent Config`,
    `AGENT_NAME=${name}`,
    `AGENT_MODEL=${template.defaultModel}`,
    `AI_PROVIDER=${template.defaultProvider}`,
    `MEMORY_DIR=./data/memory`,
    `SKILLS_DIR=./src/skills/bundled`,
    `LOG_DIR=./data/logs`,
    `SELF_IMPROVE_INTERVAL_HOURS=24`,
    `MAX_TURNS_PER_SESSION=20`,
    `DASHBOARD_PORT=${port}`,
    ``,
  );

  // Add tool-specific env vars based on template requirements
  if (template.requiredTools.includes("email") || template.optionalTools.includes("email")) {
    envLines.push(
      `# Gmail`,
      `GMAIL_USER=`,
      `GMAIL_APP_PASSWORD=`,
      `GMAIL_EMAIL_ADDRESS=`,
      ``,
    );
  }

  if (template.requiredTools.includes("calendar") || template.requiredTools.includes("spreadsheet")) {
    envLines.push(
      `# Google (Calendar, Sheets, Drive, Docs)`,
      `GOOGLE_SERVICE_ACCOUNT_KEY=`,
      ``,
    );
  }

  if (template.requiredTools.includes("messaging") || template.optionalTools.includes("messaging")) {
    envLines.push(
      `# Slack`,
      `SLACK_BOT_TOKEN=`,
      ``,
      `# Telegram`,
      `TELEGRAM_BOT_TOKEN=`,
      ``,
      `# WhatsApp Web (QR code, free)`,
      `WHATSAPP_WEB_ENABLED=false`,
      `WHATSAPP_WEB_SERVER=http://localhost:3001`,
      ``,
    );
  }

  await writeFile(join(outputDir, ".env.example"), envLines.join("\n"), "utf-8");
  createdFiles.push(".env.example");

  // --- package.json ---
  const packageJson = {
    name: template.id,
    version: template.version,
    description: template.description,
    type: "module",
    engines: { node: ">=18.0.0" },
    scripts: {
      build: "tsc",
      start: "node dist/index.js",
      dev: "tsx src/index.ts",
      setup: "tsx src/dashboard/launch.ts",
    },
    dependencies: {
      "@anthropic-ai/sdk": "^0.74.0",
      express: "^4.21.0",
      googleapis: "^144.0.0",
      nodemailer: "^9.0.1",
      "node-cron": "^3.0.3",
      "gray-matter": "^4.0.3",
      zod: "^3.23.0",
      chalk: "^5.3.0",
      dotenv: "^16.4.0",
    },
    devDependencies: {
      typescript: "^5.5.0",
      tsx: "^4.19.0",
      "@types/node": "^22.0.0",
      "@types/express": "^5.0.0",
      "@types/nodemailer": "^6.4.17",
      "@types/node-cron": "^3.0.0",
    },
  };

  await writeFile(join(outputDir, "package.json"), JSON.stringify(packageJson, null, 2), "utf-8");
  createdFiles.push("package.json");

  // --- tsconfig.json ---
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      outDir: "dist",
      rootDir: "src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      declaration: true,
    },
    include: ["src/**/*"],
  };

  await writeFile(join(outputDir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2), "utf-8");
  createdFiles.push("tsconfig.json");

  // --- src/index.ts (entry point) ---
  const entryPoint = `// =============================================================================
// ${name} — Generated from template: ${template.id}
// =============================================================================

import { createInterface } from "readline";
import chalk from "chalk";
import { loadConfig, loadConfigFromJson } from "./config/loader.js";
import { createAgentFromTemplate } from "./template/index.js";
import { setupDefaultSchedules } from "./tasks/scheduler.js";

// Import the template definition
const TEMPLATE = ${JSON.stringify(template, null, 2)};

async function main() {
  console.log(chalk.bold.cyan("\\n  Starting ${name}...\\n"));

  let config;
  try {
    config = await loadConfigFromJson();
  } catch {
    config = loadConfig();
  }

  const agent = await createAgentFromTemplate(TEMPLATE, {
    name: config.name || "${name}",
    model: config.model,
    provider: config.provider,
    apiKeys: config.apiKeys,
    memoryDir: config.memoryDir,
    skillsDir: config.skillsDir,
  });

  console.log(chalk.green("  " + agent.registry.getAll().length + " tools registered"));
  console.log(chalk.green("  " + agent.context.memory.entries.size + " memories loaded"));
  console.log(chalk.green("  " + agent.skills.size + " skills loaded\\n"));

  // Interactive REPL
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(chalk.yellow("Commands: /schedule /tasks /run <skill> /improve /stats /memory /skills /quit"));
  console.log(chalk.yellow("Or type any task in natural language.\\n"));

  const prompt = () => {
    rl.question(chalk.bold.blue("You > "), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return prompt();

      if (trimmed === "/quit") {
        await agent.stop();
        rl.close();
        process.exit(0);
      }

      if (trimmed === "/schedule") {
        setupDefaultSchedules(agent.scheduler);
        return prompt();
      }

      if (trimmed === "/skills") {
        for (const [, skill] of agent.skills) {
          console.log(chalk.cyan("  " + skill.displayName) + chalk.gray(" — " + skill.description));
        }
        return prompt();
      }

      // Natural language task
      try {
        for await (const event of agent.chat(trimmed)) {
          if (event.type === "text_delta") process.stdout.write(event.text);
          if (event.type === "tool_start") console.log(chalk.yellow("\\n  Using: " + event.toolName));
          if (event.type === "error") console.log(chalk.red("\\n  Error: " + event.error));
        }
        await agent.selfImprove.learnFromTask(trimmed, [], true);
      } catch (err) {
        console.log(chalk.red("\\n  Error: " + err));
      }

      console.log("");
      prompt();
    });
  };

  prompt();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
`;

  await writeFile(join(outputDir, "src", "index.ts"), entryPoint, "utf-8");
  createdFiles.push("src/index.ts");

  // --- walkthrough.md ---
  const walkthrough = `# ${name} — Setup & Deployment

Generated from template: **${template.id}** v${template.version}

## Quick Start

1. **Install dependencies**: \`npm install\`
2. **Configure**: Run \`setup.bat\` (Windows) or \`npm run setup\` to open the visual dashboard
3. **Start**: Run \`start.bat\` (Windows) or \`npm run dev\`

## Production Deployment

### Windows
- Double-click \`start.bat\` to build and run
- Or use PM2: \`pm2 start ecosystem.config.cjs\`

### Configuration
- Visual setup: \`npm run setup\` (opens dashboard at http://localhost:${port})
- Manual: Copy \`.env.example\` to \`.env\` and fill in your API keys

## Architecture
- **Model**: ${template.defaultModel} (${template.defaultProvider}) — can be changed in setup
- **Required tools**: ${template.requiredTools.join(", ")}
- **Optional tools**: ${template.optionalTools.join(", ")}
- **Skills**: ${template.bundledSkills.join(", ")}
- **Self-improvement**: Runs every 24h, learns from task performance

## Files
| File | Purpose |
|------|---------|
| start.bat | One-click Windows launcher |
| setup.bat | Setup wizard launcher |
| ecosystem.config.cjs | PM2 background process config |
| .env.example | Environment variable template |
| src/index.ts | Main entry point |
| data/config.json | Saved config from dashboard |
| data/memory/ | Agent memory storage |
| data/logs/ | Execution logs |
`;

  await writeFile(join(outputDir, "walkthrough.md"), walkthrough, "utf-8");
  createdFiles.push("walkthrough.md");

  return { createdFiles };
}
