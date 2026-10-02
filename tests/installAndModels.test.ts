// =============================================================================
// Fixes from the second-laptop test (2026-10-02)
//
//   • Model catalog: current models, a plain-language shortlist per provider,
//     no IDs that no longer exist, saved retired IDs mapped to working ones.
//   • Requests work with current models: thinking blocks are never replayed,
//     OpenAI gets max_completion_tokens.
//   • Docker builds (data dir created before USER node) and answers on this
//     computer only.
//   • Windows launchers: Node 20.19+ check, dependencies refreshed when the
//     lockfile changes, ASCII-only console text.
// =============================================================================

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AI_MODELS,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_OPENROUTER_TIERS,
  DEFAULT_OPERATOR_MODEL,
  RETIRED_MODEL_IDS,
  normalizeModelId,
  type AIProvider,
} from "../src/config/models.js";
import { outputLimit } from "../src/config/providerEndpoints.js";
import { withoutThinking } from "../src/agent/loop.js";
import { isLocalHostHeader, isNewerVersion } from "../src/util/localHost.js";

const read = (p: string) => readFile(path.resolve(process.cwd(), p), "utf-8");
const CLOUD: AIProvider[] = ["anthropic", "openai", "google", "xai", "deepseek", "alibaba", "moonshot", "openrouter"];

describe("model catalog", () => {
  it("every provider has exactly one 'best for most people' pick", () => {
    for (const p of CLOUD) {
      const recs = AI_MODELS.filter((m) => m.provider === p && m.pick === "recommended");
      assert.equal(recs.length, 1, p);
    }
  });

  it("shortlists stay short (≤ 4) so the wizard isn't overwhelming", () => {
    for (const p of CLOUD) {
      assert.ok(AI_MODELS.filter((m) => m.provider === p && m.pick).length <= 4, p);
    }
  });

  it("each provider's default model is in its catalog", () => {
    for (const p of CLOUD) {
      const id = DEFAULT_MODEL_BY_PROVIDER[p];
      assert.ok(AI_MODELS.some((m) => m.provider === p && m.id === id), `${p}: ${id}`);
    }
  });

  it("smart-routing defaults exist in the OpenRouter catalog under the right tier", () => {
    for (const [tier, id] of Object.entries(DEFAULT_OPENROUTER_TIERS)) {
      const m = AI_MODELS.find((x) => x.provider === "openrouter" && x.id === id);
      assert.ok(m, `${tier}: ${id}`);
      assert.equal(m!.tier, tier, id);
    }
    assert.ok(AI_MODELS.some((m) => m.id === DEFAULT_OPERATOR_MODEL), "operator model is catalogued");
  });

  it("current Claude models, exact IDs (no date suffixes, no 4.x Sonnet/Opus)", () => {
    const claude = AI_MODELS.filter((m) => m.provider === "anthropic").map((m) => m.id).sort();
    assert.deepEqual(claude, ["claude-fable-5-1", "claude-haiku-4-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
    assert.equal(DEFAULT_MODEL_BY_PROVIDER.anthropic, "claude-sonnet-5-5");
  });

  it("nothing in the catalog is a retired ID; retired IDs map to catalogued models", () => {
    for (const [old, now] of Object.entries(RETIRED_MODEL_IDS)) {
      assert.ok(!AI_MODELS.some((m) => m.id === old), `${old} still offered`);
      assert.equal(normalizeModelId(old), now);
    }
    assert.equal(normalizeModelId("meta-llama/llama-3.1-8b-instruct:free"), DEFAULT_OPENROUTER_TIERS.fast);
    assert.equal(normalizeModelId("gpt-5.5"), "gpt-5.5");
    assert.equal(normalizeModelId(undefined), undefined);
  });

  it("OpenRouter IDs use OpenRouter's spelling (vendor/name, dots in versions)", () => {
    for (const m of AI_MODELS.filter((x) => x.provider === "openrouter")) {
      assert.match(m.id, /^[a-z0-9-]+\/[a-z0-9.:-]+$/, m.id);
      assert.doesNotMatch(m.id, /claude-[a-z]+-\d+-\d/, `${m.id}: OpenRouter writes Claude versions with a dot`);
    }
  });

  it("saved settings are passed through the retired-ID map", async () => {
    assert.match(await read("src/config/loader.ts"), /normalizeModelId\(saved\.agent\.openrouterTiers\?\.fast\)/);
    assert.match(await read("src/dashboard/api/chat.ts"), /normalizeModelId\(saved\?\.agent\?\.model\)/);
  });
});

describe("requests work with current models", () => {
  it("thinking blocks are never sent back (they'd be rejected after any history change)", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Here you go" },
      { type: "redacted_thinking", data: "x" },
      { type: "tool_use", id: "t1", name: "read_emails", input: {} },
    ];
    assert.deepEqual(withoutThinking(content).map((b: any) => b.type), ["text", "tool_use"]);
    assert.deepEqual(withoutThinking([{ type: "thinking", thinking: "", signature: "s" }]), [{ type: "text", text: "…" }]);
    assert.equal(withoutThinking("plain string"), "plain string");
    const untouched = [{ type: "text", text: "hi" }];
    assert.equal(withoutThinking(untouched), untouched);
  });

  it("OpenAI gets max_completion_tokens; everyone else max_tokens", () => {
    assert.deepEqual(outputLimit("openai", 4096), { max_completion_tokens: 4096 });
    for (const p of ["openrouter", "google", "xai", "deepseek", "alibaba", "moonshot", "ollama"]) {
      assert.deepEqual(outputLimit(p, 600), { max_tokens: 600 }, p);
    }
  });

  it("Claude calls leave room to think before answering", async () => {
    assert.match(await read("src/agent/loop.ts"), /max_tokens: 16000/);
    assert.match(await read("src/agent/reflect.ts"), /max_tokens: ANTHROPIC_MIN_OUTPUT_TOKENS/);
  });
});

describe("Docker", () => {
  it("creates /app/data while still root, then switches to the node user", async () => {
    const df = await read("Dockerfile");
    const mkdir = df.search(/^RUN mkdir -p \/app\/data/m);
    const user = df.search(/^USER node\s*$/m);
    assert.ok(mkdir > 0 && user > 0 && mkdir < user, "mkdir must come before USER node");
    assert.equal(df.split("RUN mkdir -p /app/data").length, 2, "only one mkdir");
  });

  it("publishes on this computer only, never pulls the local image, answers only localhost", async () => {
    const dc = await read("docker-compose.yml");
    assert.match(dc, /- "127\.0\.0\.1:3456:3456"/);
    assert.match(dc, /pull_policy: build/);
    assert.match(dc, /DASHBOARD_DOCKER_LOCAL_ONLY: "true"/);
    assert.match(await read("Dockerfile"), /DASHBOARD_DOCKER_LOCAL_ONLY=true/);
  });

  it("local-only mode accepts only localhost Host headers", () => {
    for (const h of ["localhost:3456", "127.0.0.1:3456", "[::1]:3456", "LOCALHOST", "localhost"]) {
      assert.equal(isLocalHostHeader(h), true, h);
    }
    for (const h of ["192.168.1.20:3456", "evil.example:3456", "localhost.evil.example", "", undefined]) {
      assert.equal(isLocalHostHeader(h as any), false, String(h));
    }
  });
});

describe("Windows launchers", () => {
  function preflight(lock: object | null, installed: object | null) {
    const dir = mkdtempSync(path.join(tmpdir(), "preflight-"));
    try {
      mkdirSync(path.join(dir, "scripts"));
      copyFileSync(path.resolve("scripts/preflight.cjs"), path.join(dir, "scripts", "preflight.cjs"));
      if (lock) writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(lock));
      if (installed) {
        mkdirSync(path.join(dir, "node_modules"));
        writeFileSync(path.join(dir, "node_modules", ".package-lock.json"), JSON.stringify(installed));
      }
      return spawnSync(process.execPath, [path.join(dir, "scripts", "preflight.cjs")]).status;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const lock = { packages: { "": {}, "node_modules/a": { version: "1.0.0" }, "node_modules/fsevents": { version: "2.0.0", optional: true } } };

  it("installs when nothing is installed", () => {
    assert.equal(preflight(lock, null), 2);
  });

  it("is happy when installed versions match (file dates don't matter)", () => {
    assert.equal(preflight(lock, { packages: { "node_modules/a": { version: "1.0.0" } } }), 0);
  });

  it("reinstalls after an update changes a version or adds a package", () => {
    assert.equal(preflight(lock, { packages: { "node_modules/a": { version: "0.9.0" } } }), 2);
    assert.equal(preflight({ packages: { ...lock.packages, "node_modules/b": { version: "1.0.0" } } },
      { packages: { "node_modules/a": { version: "1.0.0" } } }), 2);
  });

  it("the .bat files are plain ASCII with CRLF line endings (no garbled symbols)", async () => {
    for (const f of ["start.bat", "setup.bat", "update.bat"]) {
      const buf = await readFile(path.resolve(f));
      if (f !== "update.bat") assert.ok(buf.every((c) => c < 128), `${f} has non-ASCII bytes`);
      assert.ok(buf.includes(Buffer.from("\r\n")), `${f} uses CRLF`);
    }
  });

  it("launchers run from their own folder and use the preflight", async () => {
    for (const f of ["start.bat", "setup.bat"]) {
      const src = await read(f);
      assert.match(src, /cd \/d "%~dp0"/, f);
      assert.match(src, /node scripts\\preflight\.cjs/, f);
    }
  });

  it("update scripts recover from the 1 Oct 2026 history clean-up", async () => {
    assert.match(await read("update.bat"), /git merge --ff-only origin\/!BRANCH!/);
    assert.match(await read("update.bat"), /git reset --hard origin\/!BRANCH!/);
    assert.match(await read("update.sh"), /git merge --ff-only "origin\/\$BRANCH"/);
  });

  it("the dashboard keeps running through a stray error", async () => {
    const launch = await read("src/dashboard/launch.ts");
    assert.match(launch, /process\.on\("uncaughtException"/);
    assert.match(launch, /process\.on\("unhandledRejection"/);
  });
});

describe("versions and updates", () => {
  it("compares versions numerically", () => {
    assert.equal(isNewerVersion("2.2.0", "2.1.0"), true);
    assert.equal(isNewerVersion("2.10.0", "2.9.3"), true);
    assert.equal(isNewerVersion("v2.2.1", "2.2.0"), true);
    assert.equal(isNewerVersion("2.2.0", "2.2.0"), false);
    assert.equal(isNewerVersion("2.1.9", "2.2.0"), false);
    assert.equal(isNewerVersion("latest", "2.2.0"), false);
    assert.equal(isNewerVersion("", "2.2.0"), false);
  });

  it("package.json, the newest CHANGELOG entry and the README agree on the version", async () => {
    const pkg = JSON.parse(await read("package.json")).version;
    const changelog = (await read("CHANGELOG.md")).match(/^## (\d+\.\d+\.\d+)/m)?.[1];
    const readme = (await read("README.md")).match(/Latest version: (\d+\.\d+\.\d+)/)?.[1];
    assert.equal(changelog, pkg, "add a CHANGELOG entry for the new version");
    assert.equal(readme, pkg, "update 'Latest version' at the top of README.md");
  });

  it("update check runs only when asked and never follows a non-GitHub link", async () => {
    assert.match(await read("src/dashboard/api/server.ts"), /app\.get\("\/api\/update-check", requireLocalOrigin/);
    const app = await read("src/dashboard/public/app.js");
    assert.match(app, /onclick="checkForUpdates\(this\)"|function checkForUpdates/);
    assert.ok(app.includes("github\\.com") && app.includes(".test(r.url || '')"), "release link is checked before use");
  });
});

describe("the dashboard tells people to update", () => {
  it("checks automatically at most once a day, and can be switched off", async () => {
    const server = await read("src/dashboard/api/server.ts");
    assert.match(server, /const auto = req\.query\.auto === "1"/);
    assert.match(server, /cfg\.autoUpdateCheck === false\) return res\.json\(\{ ok: true, skipped: true/);
    assert.match(server, /UPDATE_CHECK_TTL_MS = 24 \* 60 \* 60_000/);
    assert.match(server, /if \(path === "\/api\/update-check"\) return "update check"/);
  });

  it("shows a banner with How to update / Later, and a button in the main sidebar", async () => {
    const app = await read("src/dashboard/public/app.js");
    assert.match(app, /fetch\('\/api\/update-check\?auto=1'\)/);
    assert.match(app, /How to update<\/a>/);
    assert.match(app, /data-act="later"/);
    assert.match(app, /setAutoUpdateCheck\(this\.checked\)/);
    const html = await read("src/dashboard/public/index.html");
    assert.match(html, /sidebar-version[\s\S]*checkForUpdates\(this\)/);
  });
});

describe("uninstaller", () => {
  it("uninstall.bat and the PowerShell script are plain ASCII (no garbled console text)", async () => {
    for (const f of ["uninstall.bat", "uninstall-autostart.bat", "scripts/uninstall.ps1"]) {
      const buf = await readFile(path.resolve(f));
      assert.ok(buf.every((c) => c < 128), `${f} has non-ASCII bytes`);
    }
    assert.ok((await readFile(path.resolve("uninstall.bat"))).includes(Buffer.from("\r\n")), "uninstall.bat uses CRLF");
  });

  it("only deletes a real Admin Agent folder, never a system or personal folder", async () => {
    const ps = await read("scripts/uninstall.ps1");
    assert.match(ps, /\$pkg\.name -ne 'admin-agent'/);
    assert.match(ps, /Test-Path \(Join-Path \$AppDir 'start\.bat'\)/);
    for (const f of ["USERPROFILE", "'Desktop'", "'MyDocuments'", "WINDIR", "ProgramFiles", "GetPathRoot"]) {
      assert.ok(ps.includes(f), `forbidden-folder list includes ${f}`);
    }
    const sh = await read("uninstall.sh");
    assert.match(sh, /grep -q '"name": "admin-agent"'/);
    assert.match(sh, /"\/"\|"\$HOME"/);
  });

  it("changes nothing until YES is typed (exactly, capital letters)", async () => {
    const ps = await read("scripts/uninstall.ps1");
    const confirm = ps.indexOf("$answer -cne 'YES'");
    assert.ok(confirm > 0);
    for (const step of ["Stop-Process", "schtasks.exe /delete", "Remove-Item $lnk", "Start-Process -FilePath 'cmd.exe'"]) {
      assert.ok(ps.indexOf(step) > confirm, `${step} happens only after the YES`);
    }
    assert.match(await read("uninstall.sh"), /if \[ "\$OK" != "YES" \]/);
  });

  it("removes auto-start and shortcuts only when they point at this copy; never Node.js or Ollama", async () => {
    const ps = await read("scripts/uninstall.ps1");
    assert.match(ps, /if \(PointsHere \$taskXml\)/);
    assert.match(ps, /PointsHere \$sc\.TargetPath/);
    // No command that removes or stops anything mentions Ollama or Node.js.
    const actions = ps.split("\n").filter((l) => /Remove-Item|rd \/s|Stop-Process|schtasks\.exe \/delete|pm2 delete/.test(l));
    assert.ok(actions.length >= 4);
    for (const line of actions) assert.doesNotMatch(line, /ollama|nodejs/i, line);
    assert.match(ps, /'node\.exe', 'cmd\.exe', 'wscript\.exe', 'cscript\.exe'/);
    assert.match(ps, /\(PointsHere \$_\.CommandLine\)/, "only processes started from this folder are stopped");
  });

  it("the delete helper is built from one template and waits with ping (timeout.exe needs a console)", async () => {
    const ps = await read("scripts/uninstall.ps1");
    assert.match(ps, /\$helperText = @"/);
    assert.doesNotMatch(ps, /^\s*'(timeout|for \/l)[^\n]*' \+ \$AppDir/m, "no comma-list string concatenation");
    assert.doesNotMatch(ps.slice(ps.indexOf("$helperText")), /timeout \/t/);
  });
});

