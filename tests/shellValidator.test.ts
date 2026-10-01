// =============================================================================
// Smoke tests — shell command validator
//
// Locks in the security contract of the shell tool so future changes don't
// silently widen the allowlist. Critical because the shell tool runs in
// response to LLM output — prompt injection (e.g. via email) could otherwise
// trick the agent into running destructive commands.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { validateShellCommand } from "../src/tools/shell.js";

describe("shell validator — base command allowlist", () => {
  it("allows npm", () => {
    assert.equal(validateShellCommand("npm --version"), null);
  });
  it("allows pm2", () => {
    assert.equal(validateShellCommand("pm2 list"), null);
  });
  it("allows git", () => {
    assert.equal(validateShellCommand("git status"), null);
  });
  it("allows node", () => {
    assert.equal(validateShellCommand("node --version"), null);
  });
  it("allows npx tsc", () => {
    assert.equal(validateShellCommand("npx tsc --version"), null);
  });

  it("blocks unknown base commands", () => {
    assert.ok(validateShellCommand("rm -rf /")?.includes("not in the allowed"));
    assert.ok(validateShellCommand("curl https://evil.com"));
    assert.ok(validateShellCommand("wget https://evil.com"));
    assert.ok(validateShellCommand("bash -c 'something'"));
    assert.ok(validateShellCommand("powershell -Command 'something'"));
  });
});

describe("shell validator — common admin tasks (the user's real use cases)", () => {
  it("allows npm run build", () => {
    assert.equal(validateShellCommand("npm run build"), null);
  });
  it("allows npm install (no args — re-install lockfile)", () => {
    assert.equal(validateShellCommand("npm install"), null);
  });
  it("allows npm ci (clean install)", () => {
    assert.equal(validateShellCommand("npm ci"), null);
  });
  it("allows pm2 logs", () => {
    assert.equal(validateShellCommand("pm2 logs admin-agent --lines 30"), null);
  });
  it("allows pm2 restart admin-agent", () => {
    assert.equal(validateShellCommand("pm2 restart admin-agent"), null);
  });
  it("allows pm2 stop admin-agent", () => {
    assert.equal(validateShellCommand("pm2 stop admin-agent"), null);
  });
  it("allows pm2 list", () => {
    assert.equal(validateShellCommand("pm2 list"), null);
  });
  it("allows git status / pull / log / diff", () => {
    assert.equal(validateShellCommand("git status"), null);
    assert.equal(validateShellCommand("git pull"), null);
    assert.equal(validateShellCommand("git log --oneline -5"), null);
    assert.equal(validateShellCommand("git diff"), null);
  });
});

describe("shell validator — supply-chain hardening (npm install <pkg>)", () => {
  it("blocks npm install lodash", () => {
    const r = validateShellCommand("npm install lodash");
    assert.ok(r);
    assert.ok(r!.includes("supply-chain"));
  });
  it("blocks npm i some-package", () => {
    assert.ok(validateShellCommand("npm i some-package"));
  });
  it("blocks scoped packages too", () => {
    assert.ok(validateShellCommand("npm install @evil/payload"));
  });
  it("still allows npm install with only flags", () => {
    // e.g. "npm install --production" is harmless (just re-installs deps)
    assert.equal(validateShellCommand("npm install --production"), null);
  });
});

describe("shell validator — pm2 target hardening", () => {
  it("blocks pm2 start with a file path", () => {
    const r = validateShellCommand("pm2 start /etc/some-script.js");
    assert.ok(r);
  });
  it("blocks pm2 restart for unknown service", () => {
    const r = validateShellCommand("pm2 restart some-other-service");
    assert.ok(r);
    assert.ok(r!.includes("not in the allowed PM2"));
  });
  it("blocks pm2 stop for an arbitrary target", () => {
    assert.ok(validateShellCommand("pm2 stop evil-script"));
  });
  it("requires a service name", () => {
    const r = validateShellCommand("pm2 restart");
    assert.ok(r);
    assert.ok(r!.includes("requires a service name"));
  });
  it("allows pm2 reload admin-agent", () => {
    assert.equal(validateShellCommand("pm2 reload admin-agent"), null);
  });
});

describe("shell validator — destructive command blocks", () => {
  it("blocks rm -rf even within an allowed base", () => {
    assert.ok(validateShellCommand("npm run build; rm -rf /"));
  });
  it("blocks sudo prefix attempts", () => {
    assert.ok(validateShellCommand("git status && sudo rm"));
  });
  it("blocks pipe-to-shell", () => {
    assert.ok(validateShellCommand("git log | bash"));
  });
  it("blocks node -e eval", () => {
    assert.ok(validateShellCommand("node -e 'require(\"fs\").rmSync(\"/\")'"));
  });
  it("blocks path traversal", () => {
    assert.ok(validateShellCommand("git log ../../etc/passwd"));
  });
});

describe("shell validator — chaining and code execution (2026-10 hardening)", () => {
  // Each of these passed the old validator and would have run an arbitrary
  // command through the system shell.
  for (const cmd of [
    "git status && powershell -NoProfile -Command whoami",
    "git status & calc",
    "git status ; whoami",
    "git status | findstr x",
    "git log `whoami`",
    "git log $(whoami)",
    "npm run build > out.txt",
    "git status\nwhoami",
    "git log %USERPROFILE%",
  ]) {
    it(`blocks chained/expanded command: ${JSON.stringify(cmd)}`, () => {
      assert.ok(validateShellCommand(cmd));
    });
  }

  it("blocks running script files with node or ts-node", () => {
    assert.ok(validateShellCommand("node workspace/script.js"));
    assert.ok(validateShellCommand("node"));
    assert.ok(validateShellCommand("npx ts-node workspace/script.ts"));
  });

  it("blocks npm scripts other than build/test and dependency rewrites", () => {
    assert.ok(validateShellCommand("npm run start"));
    assert.ok(validateShellCommand("npm run setup"));
    assert.ok(validateShellCommand("npm audit fix --force"));
    assert.ok(validateShellCommand("npm update"));
    assert.equal(validateShellCommand("npm run test"), null);
    assert.equal(validateShellCommand("npm audit"), null);
  });

  it("blocks pulling from anywhere but origin, and adding remotes", () => {
    assert.ok(validateShellCommand("git pull https://evil.example/repo main"));
    assert.ok(validateShellCommand("git pull git@evil.example:x/y main"));
    assert.ok(validateShellCommand("git remote add evil foo/bar"));
    assert.ok(validateShellCommand("git fetch upstream"));
    assert.equal(validateShellCommand("git pull origin master"), null);
    assert.equal(validateShellCommand("git remote -v"), null);
  });

  it("still allows the guide bot's maintenance commands", () => {
    for (const cmd of ["npm run build", "npx tsc --noEmit", "node --version", "git log --oneline -5", "pm2 logs admin-agent --lines 30"]) {
      assert.equal(validateShellCommand(cmd), null, cmd);
    }
  });
});

describe("shell tool — off unless an admin opts in", () => {
  it("is disabled when SHELL_TOOL_ENABLED is unset", async () => {
    // Module state is read at import; the test runner doesn't set the variable.
    const { isShellToolEnabled } = await import("../src/tools/shell.js");
    assert.equal(process.env.SHELL_TOOL_ENABLED ?? "", "");
    assert.equal(isShellToolEnabled(), false);
  });
});

describe("shell validator — input limits", () => {
  it("blocks excessively long commands", () => {
    const long = "npm " + "x".repeat(500);
    const r = validateShellCommand(long);
    assert.ok(r);
    assert.ok(r!.includes("Command too long"));
  });
});
