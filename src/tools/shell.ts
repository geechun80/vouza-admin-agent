// =============================================================================
// Sandboxed Shell Tool — lets the guide bot run whitelisted commands
//
// Security model (defence-in-depth):
//   1. Base-command whitelist  — only npm, pm2, git, node, npx allowed
//   2. Sub-command allowlist   — per-command regex, e.g. git only allows
//                                status/pull/log/diff/branch/fetch
//   3. Blocked-pattern scan    — rejects rm -rf, sudo, pipe-to-shell, path
//                                traversal, etc. even inside allowed commands
//   4. Forced cwd              — always runs from process.cwd() (project root)
//   5. 30 s hard timeout       — no command can block forever
//   6. Output cap              — stdout/stderr truncated to 4 000 chars
//   7. Max command length      — 250 chars; rejects suspiciously long strings
//
// Intended use-cases:
//   - Guide bot checks build status:  npm run build
//   - Guide bot restarts service:     pm2 restart admin-agent
//   - Guide bot tails logs:           pm2 logs admin-agent --lines 20
//   - Guide bot checks git state:     git status | git pull
//   - Guide bot confirms node/pm2 v:  node --version | pm2 --version
// =============================================================================

import { exec }        from "child_process";
import { promisify }   from "util";
import { appendFile, mkdir }  from "fs/promises";
import { dirname }            from "path";
import { z }           from "zod";
import { buildTool }   from "./registry.js";
import { logger }      from "../util/logger.js";

const execAsync = promisify(exec);

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMEOUT_MS      = 30_000;   // hard abort after 30 s
const MAX_OUTPUT      = 4_000;    // chars kept from stdout / stderr
const MAX_CMD_LEN     = 250;      // reject suspiciously long commands
const PROJECT_DIR     = process.cwd();
const AUDIT_LOG_PATH  = "./data/shell-audit.log";

// Restrict pm2 start/stop/restart targets. Prompt-injected text could otherwise
// ask the agent to "pm2 start /path/to/anything.js" which PM2 will happily run.
// Set PM2_ALLOWED_SERVICES=admin-agent,foo,bar to broaden if needed.
const PM2_ALLOWED_SERVICES = new Set(
  (process.env.PM2_ALLOWED_SERVICES || "admin-agent")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

// Global kill switch for the shell tool. Set SHELL_TOOL_ENABLED=false to
// completely disable shell access (e.g. for high-security customer deployments).
const SHELL_ENABLED = (process.env.SHELL_TOOL_ENABLED || "true").toLowerCase() !== "false";

// ── 1. Base-command whitelist ──────────────────────────────────────────────────
const ALLOWED_CMDS = new Set([
  "npm", "pm2", "git", "node", "npx",
]);

// ── 2. Per-command sub-command allowlists ──────────────────────────────────────
// Only the listed sub-commands (first word after the base) are permitted.
// Commands NOT in this map are unrestricted (e.g. "node --version" — base only).
const SUBCOMMAND_ALLOW: Record<string, RegExp> = {
  npm: /^(run|install|ci|audit|list|ls|update|test|--version|-v)\b/i,
  git: /^(status|pull|log|diff|branch|fetch|remote|describe|shortlog|show|tag|stash\s+list)\b/i,
  pm2: /^(list|ls|status|restart|reload|logs?|start|stop|show|describe|info|flush|save|ping|jlist|prettylist|monit|--version|-v)\b/i,
  npx: /^(tsc|ts-node)\b/i,
  // node: no sub-command restriction — handled by blocked patterns below
};

// ── 3. Blocked patterns (scanned against the FULL raw command string) ──────────
// Any match → rejected, even if the base command is whitelisted.
const BLOCKED: RegExp[] = [
  // Destructive file ops
  /rm\s+(-[^a-z]*r|-[^a-z]*f|-rf|-fr)/i,
  /del\s+\/[sqf]/i,
  /rmdir\s+\/[sq]/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,

  // Privilege escalation
  /\bsudo\s/i,
  /\bsu\s+-/i,
  /\brunas\b/i,

  // Pipe-to-shell (code injection via download)
  /\|\s*(sh|bash|zsh|fish|cmd|powershell|pwsh)\b/i,
  /curl[^|#\n]{0,200}\|/i,
  /wget[^|#\n]{0,200}\|/i,

  // Arbitrary code evaluation
  /\beval\b/i,
  /node\s+(-e|--eval)\b/i,                         // node -e "..." inline eval
  /node\s+-[a-df-z]*e[a-z]*/i,                     // node -pe, node -re, etc.

  // Path traversal
  /\.\.[/\\]/,

  // System directory writes
  />+\s*(\/etc|\/bin|\/usr|\/sys|\/proc|\/dev)/i,
  />+\s*[a-zA-Z]:\\(Windows|System32|Program)/i,
  />+\s*~\//i,                                      // redirect into home dir

  // Sensitive file writes
  />+\s*\.env\b/i,
  />+\s*data\/config\.json/i,

  // System control
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\btaskkill\b.*\/f/i,
  /\bkill\s+-9\b/i,
  /\bpkill\s+-9\b/i,

  // Credential exfiltration patterns
  /\bcurl\b.*-d.*password/i,
  /\bwget\b.*--post-data.*key/i,

  // Chained commands that could abuse context
  /;\s*(rm|del|format|mkfs|dd|curl|wget|sudo|eval)/i,
  /&&\s*(rm|del|format|mkfs|dd|curl|wget|sudo|eval)/i,
];

// ── Validation helper ──────────────────────────────────────────────────────────
/**
 * Validate a shell command against all defense layers.
 * Exported for unit tests; runtime always reaches it through the tool's call().
 * Returns null when the command is allowed, or a user-facing error string.
 */
export function validateShellCommand(cmd: string): string | null {
  if (cmd.length > MAX_CMD_LEN) {
    return `Command too long (${cmd.length} chars, max ${MAX_CMD_LEN}).`;
  }

  const parts = cmd.trim().split(/\s+/);
  const base  = parts[0].toLowerCase();

  if (!ALLOWED_CMDS.has(base)) {
    return (
      `"${base}" is not in the allowed command list. ` +
      `Allowed: ${Array.from(ALLOWED_CMDS).join(", ")}. ` +
      `For other operations, ask the user to run the command themselves.`
    );
  }

  const args = parts.slice(1).join(" ").trim();
  const subAllow = SUBCOMMAND_ALLOW[base];
  if (subAllow && args && !subAllow.test(args)) {
    return (
      `Sub-command "${args.split(" ")[0]}" is not allowed for "${base}". ` +
      `Allowed sub-commands match: ${subAllow.source}. ` +
      `For anything else, ask the user to run it manually.`
    );
  }

  // ── Hardening 1: block npm install <package> (supply-chain risk) ──────────
  // Allow:  "npm install"           (re-install all deps from package.json)
  //         "npm ci"                (clean install — preferred for production)
  //         "npm run build" / "npm run test" / etc.
  // Block:  "npm install lodash"    (could install arbitrary attacker-published pkg)
  if (base === "npm") {
    const npmFirstArg = parts[1]?.toLowerCase();
    if ((npmFirstArg === "install" || npmFirstArg === "i") && parts.length > 2) {
      // Permit known-safe flags only (no package names)
      const rest = parts.slice(2);
      const allFlags = rest.every((p) => p.startsWith("-"));
      if (!allFlags) {
        return (
          `"npm install <package>" is blocked to prevent supply-chain attacks. ` +
          `"npm install" (no args) and "npm ci" are still allowed. ` +
          `If you genuinely need a new package, the user should add it manually.`
        );
      }
    }
  }

  // ── Hardening 2: restrict pm2 start/stop/restart targets ──────────────────
  // Allow:  "pm2 start admin-agent" / "pm2 restart admin-agent"
  //         "pm2 list" / "pm2 logs admin-agent" (read-only)
  // Block:  "pm2 start /some/other/script.js"
  if (base === "pm2") {
    const sub = parts[1]?.toLowerCase();
    if (sub === "start" || sub === "stop" || sub === "restart" || sub === "reload") {
      const target = parts[2]?.toLowerCase();
      if (!target) {
        return `"pm2 ${sub}" requires a service name. Try "pm2 ${sub} admin-agent".`;
      }
      // Strip any path separator — only bare service names allowed
      if (target.includes("/") || target.includes("\\")) {
        return (
          `"pm2 ${sub}" only accepts a service name, not a file path. ` +
          `Allowed services: ${Array.from(PM2_ALLOWED_SERVICES).join(", ")}.`
        );
      }
      if (!PM2_ALLOWED_SERVICES.has(target)) {
        return (
          `"pm2 ${sub} ${target}" — "${target}" is not in the allowed PM2 service list. ` +
          `Allowed: ${Array.from(PM2_ALLOWED_SERVICES).join(", ")}. ` +
          `(Configurable via PM2_ALLOWED_SERVICES env var.)`
        );
      }
    }
  }

  for (const pattern of BLOCKED) {
    if (pattern.test(cmd)) {
      return (
        `Command blocked by security policy — this matches a restricted pattern. ` +
        `Ask the user to run "${cmd}" in their terminal directly.`
      );
    }
  }

  return null; // all clear
}

// ── Audit logging ──────────────────────────────────────────────────────────────
/**
 * Append an entry to data/shell-audit.log. Best-effort — failure to write
 * audit log does NOT block the command. Designed for compliance/forensics
 * and to make abuse detectable after the fact.
 */
async function auditLog(entry: {
  cmd:      string;
  outcome:  "allowed" | "blocked" | "error" | "disabled";
  reason?:  string;
  exitCode?: number | null;
}): Promise<void> {
  // Mirror to the structured logger so ops can grep across all events from
  // one place. Blocked/disabled events are warnings; errors are errors;
  // allowed-and-completed is info.
  const logFn =
    entry.outcome === "blocked" || entry.outcome === "disabled" ? logger.warn :
    entry.outcome === "error"                                    ? logger.error :
    logger.info;
  logFn.call(
    logger,
    {
      event: "shell_command",
      cmd:    entry.cmd.slice(0, MAX_CMD_LEN),
      outcome: entry.outcome,
      reason:  entry.reason?.slice(0, 200),
      exitCode: entry.exitCode,
    },
    `shell:${entry.outcome}`
  );

  try {
    await mkdir(dirname(AUDIT_LOG_PATH), { recursive: true });
    const line = JSON.stringify({
      ts:      new Date().toISOString(),
      cmd:     entry.cmd.slice(0, MAX_CMD_LEN),
      outcome: entry.outcome,
      reason:  entry.reason?.slice(0, 200),
      exitCode: entry.exitCode,
      pid:     process.pid,
    }) + "\n";
    await appendFile(AUDIT_LOG_PATH, line, "utf-8");
  } catch {
    // Audit failure must never break the command path.
  }
}

// ── Tool definition ────────────────────────────────────────────────────────────
export const runShellCommandTool = buildTool({
  name:        "run_shell_command",
  description: `Run a whitelisted shell command in the project root directory.

Use this to help users with setup tasks: checking build output, restarting the agent,
tailing logs, verifying installs, pulling latest code, or confirming version numbers.

ALLOWED commands and examples:
  npm     → npm run build | npm install | npm audit | npm --version
  pm2     → pm2 list | pm2 restart admin-agent | pm2 logs admin-agent --lines 30
            pm2 stop admin-agent | pm2 start ecosystem.config.js | pm2 flush
  git     → git status | git pull | git log --oneline -5 | git branch | git diff
  node    → node --version
  npx     → npx tsc --version

BLOCKED (ask the user to run manually):
  rm / del / rmdir  •  sudo / runas  •  curl|sh / wget|sh
  node -e (eval)    •  path traversal (../)  •  writing to .env or system dirs

The command always runs from the project root: ${PROJECT_DIR}
Output is capped at ${MAX_OUTPUT} characters. Timeout: ${TIMEOUT_MS / 1000}s.`,

  category:         "system",
  isReadOnly:       false,    // pm2 restart, git pull, npm install mutate state
  isConcurrencySafe: false,   // never run two shell commands in parallel

  inputSchema: z.object({
    command: z.string().describe(
      "The shell command to run. Must start with an allowed base command " +
      "(npm, pm2, git, node, npx). Single command only — no pipes to shell."
    ),
  }),

  async call(input, _context) {
    const cmd = (input.command || "").trim();

    // ── Global kill switch ───────────────────────────────────────────────────
    if (!SHELL_ENABLED) {
      const reason = "Shell tool is disabled (SHELL_TOOL_ENABLED=false).";
      auditLog({ cmd, outcome: "disabled", reason }).catch(() => {});
      return {
        success: false,
        error: reason + " The user has disabled shell access for security. " +
               "Suggest running the command manually instead.",
      };
    }

    // Validate before touching the shell
    const err = validateShellCommand(cmd);
    if (err) {
      auditLog({ cmd, outcome: "blocked", reason: err }).catch(() => {});
      return { success: false, error: err };
    }

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd:       PROJECT_DIR,
        timeout:   TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,     // 2 MB internal buffer (we truncate before returning)
        windowsHide: true,               // suppress console window flash on Windows
      });

      const out = (stdout || "").trim().slice(0, MAX_OUTPUT);
      const err2 = (stderr || "").trim().slice(0, 1_000);

      auditLog({ cmd, outcome: "allowed", exitCode: 0 }).catch(() => {});

      return {
        success: true,
        data: {
          stdout:  out  || "(no output)",
          stderr:  err2 || undefined,
          command: cmd,
          cwd:     PROJECT_DIR,
          truncated: stdout.length > MAX_OUTPUT,
        },
      };
    } catch (e: any) {
      const msg = e?.message || String(e);

      // Timeout
      if (msg.includes("ETIMEDOUT") || msg.includes("timed out") || e?.killed) {
        auditLog({ cmd, outcome: "error", reason: "timeout", exitCode: null }).catch(() => {});
        return {
          success: false,
          error: `Command timed out after ${TIMEOUT_MS / 1000}s. ` +
                 `It may still be running in the background. ` +
                 `Ask the user to check their terminal.`,
        };
      }

      // Command returned non-zero exit code — include output in error string
      const out  = (e?.stdout || "").trim().slice(0, MAX_OUTPUT);
      const serr = (e?.stderr || "").trim().slice(0, 1_000);
      const detail = [msg.slice(0, 400), out, serr].filter(Boolean).join("\n");
      auditLog({ cmd, outcome: "error", reason: msg.slice(0, 200), exitCode: e?.code ?? null }).catch(() => {});
      return {
        success: false,
        error: `Exit code ${e?.code ?? "?"}: ${detail}`,
      };
    }
  },
});
