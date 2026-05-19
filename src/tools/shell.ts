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
import { z }           from "zod";
import { buildTool }   from "./registry.js";

const execAsync = promisify(exec);

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMEOUT_MS      = 30_000;   // hard abort after 30 s
const MAX_OUTPUT      = 4_000;    // chars kept from stdout / stderr
const MAX_CMD_LEN     = 250;      // reject suspiciously long commands
const PROJECT_DIR     = process.cwd();

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
function validate(cmd: string): string | null {
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

    // Validate before touching the shell
    const err = validate(cmd);
    if (err) {
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
      return {
        success: false,
        error: `Exit code ${e?.code ?? "?"}: ${detail}`,
      };
    }
  },
});
