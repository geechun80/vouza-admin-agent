// =============================================================================
// Quick Setup HTTP routes — the "paste, click Next" onboarding
//
// Every step verifies for real before saving, and the client only ever gets
// plain-language results. GET /state lets the page resume at the first step
// that isn't done, so a refresh or a crash never strands the user.
//
// All routes sit behind requireLocalOrigin (CSRF guard); server.ts passes in
// the config + agent-lifecycle functions it owns.
// =============================================================================

import type { Express, RequestHandler } from "express";
import { existsSync } from "fs";
import { join } from "path";
import os from "os";
import { execFile, spawn } from "child_process";
import { toDataURL as qrToDataURL } from "qrcode";
import {
  detectAndVerifyAiKey,
  aiConfigPatch,
  detectLocalAi,
  localAiConfigPatch,
  localAiProblem,
  matchLocalModel,
  normalizeOllamaAddress,
  normalizeOwnerNumber,
  samePhoneNumber,
  whatsappHello,
  withoutConnection,
  isConnectionId,
  type ConnectionId,
  onlineAiConfigPatch,
  SUGGESTED_LOCAL_MODEL,
  detectEmailPreset,
  verifyEmailLogin,
  emailConfigPatch,
  isValidEmail,
  autostartCommand,
  type EmailLogin,
} from "../../setup/quickSetup.js";
import { loadGrants, addGrant, removeGrant } from "../../files/folderGrants.js";
import { getPowerAdvice } from "../../util/keepAwake.js";
import {
  isBaileysConnected,
  getBaileysOwnerInfo,
  getBaileysOwnerJid,
  sendBaileysMessage,
  baileysSettingsFrom,
  configureBaileys,
  resetBaileysAuth,
} from "../../whatsapp/baileysManager.js";
import { cleanWakeWord, defaultWakeWord } from "../../whatsapp/wakeWord.js";
import { createTelegramClaim, getTelegramOwnerStatus, stopTelegramListener, forgetTelegramOwner } from "../../telegram/listener.js";
import type { AgentInstance } from "../../bridge/launcher.js";
import { isValidModelId } from "../../config/liveModels.js";

export interface QuickSetupDeps {
  requireLocalOrigin: RequestHandler;
  loadConfig:   () => Promise<any>;
  saveConfig:   (cfg: any) => Promise<void>;
  mergeConfig:  (target: any, source: any) => any;
  getAgent:     () => AgentInstance | null;
  /** Launch if not running. Never throws. */
  launchAgent:  () => Promise<{ ok: boolean; error?: string }>;
  /** Stop + launch so new integrations register. Launches if not running. Never throws. */
  restartAgent: () => Promise<{ ok: boolean; error?: string }>;
  /** true when the operator's built-in key exists and wasn't rejected */
  operatorKeyUsable: () => Promise<boolean>;
}

/** Folder suggestions shown in the Documents step. */
function folderSuggestions() {
  const home = os.homedir();
  return [
    { label: "Documents", path: join(home, "Documents") },
    { label: "Desktop",   path: join(home, "Desktop") },
    { label: "Downloads", path: join(home, "Downloads") },
  ];
}

const sameFolder = (a: string, b: string) =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

export function registerQuickSetupRoutes(app: Express, deps: QuickSetupDeps): void {
  const guard = deps.requireLocalOrigin;

  async function patchConfig(patch: Record<string, any>): Promise<void> {
    const cfg = await deps.loadConfig();
    await deps.saveConfig(deps.mergeConfig(cfg, patch));
  }

  // ── Where is the user? ─────────────────────────────────────────────────
  app.get("/api/quick-setup/state", guard, async (_req, res) => {
    try {
      const cfg   = await deps.loadConfig();
      const creds = cfg.credentials || {};
      const provider: string = cfg.agent?.provider || "";
      const userKey = provider ? creds[`${provider}ApiKey`] : "";
      const localAi = provider === "ollama" && !!cfg.agent?.model;
      const operatorUsable = await deps.operatorKeyUsable();

      const grants = loadGrants();
      const email = cfg.channels?.email;
      const emailAddress =
        email?.config?.gmailUser || cfg.tools?.smtp?.user || cfg.agent?.email || null;
      const emailConfigured = !!email?.enabled && (
        !!(email.config?.gmailUser && email.config?.gmailPass) ||
        !!(cfg.tools?.smtp?.host && cfg.tools?.smtp?.user && cfg.tools?.smtp?.pass)
      );

      const tg = await getTelegramOwnerStatus();

      res.json({
        setupCompleted: !!cfg.setupCompleted,
        agentRunning:   !!deps.getAgent(),
        profile: { userName: cfg.agent?.userName || "" },
        ai: {
          configured:  localAi || !!(userKey && String(userKey).length >= 20) || operatorUsable,
          local:       localAi,
          model:       localAi ? cfg.agent?.model : undefined,
          ownKey:      !!(userKey && String(userKey).length >= 20),
          viaBuiltIn:  !localAi && !(userKey && String(userKey).length >= 20) && operatorUsable,
          provider:    provider || null,
          activeModel: cfg.agent?.model || null,
        },
        email: { configured: emailConfigured, address: emailAddress, provider: email?.provider || null },
        folders: {
          granted: grants.map((g) => g.path),
          suggestions: folderSuggestions().map((s) => ({
            ...s,
            exists:  existsSync(s.path),
            granted: grants.some((g) => sameFolder(g.path, s.path)),
          })),
        },
        phone: {
          whatsapp: {
            connected: isBaileysConnected(),
            // The linked account: the assistant's number in assistant mode.
            owner:     getBaileysOwnerInfo(),
            enabled:   !!cfg.channels?.whatsapp?.enabled,
            ...(() => {
              const s = baileysSettingsFrom(cfg.channels?.whatsapp?.config ?? {}, cfg.agent?.name);
              return { mode: s.mode, ownerNumber: s.ownerNumber, wakeWord: s.wakeWord, allowed: s.allowedSenders.length };
            })(),
          },
          telegram: {
            configured: !!cfg.channels?.telegram?.enabled,
            linked:     tg.linked,
            botUsername: tg.botUsername,
          },
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Step 1a: name ──────────────────────────────────────────────────────
  app.post("/api/quick-setup/profile", guard, async (req, res) => {
    const userName = String(req.body?.userName ?? "").trim().slice(0, 60);
    const timezone = String(req.body?.timezone ?? "").trim().slice(0, 60);
    try {
      await patchConfig({ agent: { ...(userName ? { userName } : {}), ...(timezone ? { timezone } : {}) } });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // ── Step 1b: AI key — detect provider, verify, save ────────────────────
  app.post("/api/quick-setup/ai", guard, async (req, res) => {
    const key = String(req.body?.key ?? "");
    const r = await detectAndVerifyAiKey(key);
    if (!r.ok) return res.json({ ok: false, error: r.error });
    try {
      await patchConfig(aiConfigPatch(r.candidate, key));
      // A running agent keeps its old provider until restarted.
      if (deps.getAgent()) await deps.restartAgent();
      res.json({ ok: true, provider: r.candidate.provider, label: r.candidate.label });
    } catch (err) {
      res.json({ ok: false, error: `Your key works, but saving failed: ${String(err)}` });
    }
  });

  // ── Step 1b (alternative): a local AI on this computer, no key ─────────
  const inDocker = existsSync("/.dockerenv");
  const savedOllamaAddress = async (): Promise<string | null> => {
    try { return (await deps.loadConfig()).agent?.ollamaBaseUrl || null; } catch { return null; }
  };

  app.get("/api/quick-setup/local-ai", guard, async (_req, res) => {
    const local = await detectLocalAi(fetch, { baseUrl: await savedOllamaAddress(), inDocker });
    res.json({
      ...local,
      problem: local.running ? undefined : localAiProblem(local),
      suggested: SUGGESTED_LOCAL_MODEL,
    });
  });

  // Save the local AI. The model can be picked from the list or typed in
  // ("Qwen 2.5:7b" finds "qwen2.5:7b"); an address can be typed when Ollama
  // runs elsewhere. force = "save anyway, I'll start Ollama later".
  app.post("/api/quick-setup/local-ai", guard, async (req, res) => {
    // "Qwen 2.5:7b" → "qwen2.5:7b" (Ollama names have no spaces and are lowercase)
    const typed   = String(req.body?.model ?? "").replace(/\s+/g, "").toLowerCase();
    const address = String(req.body?.address ?? "").trim();
    const force   = req.body?.force === true;
    if (!isValidModelId(typed)) {
      return res.json({ ok: false, field: "model", error: "Type the model name the way Ollama shows it, for example qwen2.5:7b." });
    }
    let baseUrl: string | null = null;
    if (address) {
      baseUrl = normalizeOllamaAddress(address);
      if (!baseUrl) return res.json({ ok: false, field: "address", error: "That address doesn't look right — for example http://127.0.0.1:11434" });
    }
    const local = await detectLocalAi(fetch, { baseUrl: baseUrl ?? await savedOllamaAddress(), inDocker });
    let model = typed;
    if (local.running) {
      const found = matchLocalModel(typed, local.models);
      if (!found) {
        return res.json({
          ok: false, field: "model",
          error: local.models.length
            ? `Ollama doesn't have “${typed}”. Installed: ${local.models.join(", ")}.`
            : `Ollama has no models yet — run “ollama pull ${typed}” in a terminal first.`,
          models: local.models,
        });
      }
      model = found;
    } else if (!force) {
      return res.json({ ok: false, notRunning: true, error: localAiProblem(local) });
    }
    try {
      await patchConfig(localAiConfigPatch(model, local.running ? local.baseUrl : (baseUrl ?? local.baseUrl)));
      if (deps.getAgent()) await deps.restartAgent();
      res.json({ ok: true, model, running: local.running });
    } catch (err) {
      res.json({ ok: false, error: `Saving failed: ${String(err)}` });
    }
  });

  // Back from the local AI to an online one (a saved key, or the built-in AI)
  app.post("/api/quick-setup/online-ai", guard, async (_req, res) => {
    try {
      const cfg = await deps.loadConfig();
      const patch = onlineAiConfigPatch(cfg.credentials || {}, await deps.operatorKeyUsable());
      if (!patch) {
        return res.json({ ok: false, needKey: true, error: "There's no online AI key saved yet — paste one below first." });
      }
      await patchConfig(patch);
      if (deps.getAgent()) await deps.restartAgent();
      res.json({ ok: true, provider: patch.agent.provider, model: patch.agent.model });
    } catch (err) {
      res.json({ ok: false, error: `Saving failed: ${String(err)}` });
    }
  });

  // ── Step 2a: which servers does this address use? ─────────────────────
  app.post("/api/quick-setup/email/detect", guard, async (req, res) => {
    const address = String(req.body?.address ?? "").trim();
    if (!isValidEmail(address)) return res.json({ ok: false, error: "That doesn't look like an email address." });
    res.json({ ok: true, preset: await detectEmailPreset(address) });
  });

  // ── Step 2b: real login (IMAP + SMTP), then save ───────────────────────
  app.post("/api/quick-setup/email", guard, async (req, res) => {
    const b = req.body ?? {};
    const address = String(b.address ?? "").trim();
    if (!isValidEmail(address)) return res.json({ ok: false, field: "server", error: "That doesn't look like an email address." });

    const preset = await detectEmailPreset(address);
    const num = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
    };
    const login: EmailLogin = {
      address,
      password: String(b.password ?? ""),
      imapHost: String(b.imapHost || preset.imapHost).trim(),
      imapPort: num(b.imapPort, preset.imapPort),
      smtpHost: String(b.smtpHost || preset.smtpHost).trim(),
      smtpPort: num(b.smtpPort, preset.smtpPort),
    };

    const v = await verifyEmailLogin(login, preset.id);
    if (!v.ok) return res.json({ ok: false, field: v.field, error: v.error });

    try {
      await patchConfig(emailConfigPatch(preset, login));
      // Email tools are registered at launch — a running agent needs a restart.
      if (deps.getAgent()) await deps.restartAgent();
      res.json({ ok: true, unread: v.unread, provider: preset.label });
    } catch (err) {
      res.json({ ok: false, field: "server", error: `Signed in fine, but saving failed: ${String(err)}` });
    }
  });

  // ── Step 3: documents — read-only folder grants ────────────────────────
  app.post("/api/quick-setup/folders", guard, async (req, res) => {
    const paths: unknown = req.body?.paths;
    if (!Array.isArray(paths)) return res.status(400).json({ ok: false, error: "paths must be a list" });
    const allowed = new Set(folderSuggestions().map((s) => s.path.toLowerCase()));
    const results = paths.slice(0, 10).map((p) => {
      const path = String(p);
      // Quick Setup only offers the standard folders; anything else goes
      // through the full Folder Access card where the user picks it deliberately.
      if (!allowed.has(path.toLowerCase())) return { path, ok: false, error: "Not one of the offered folders." };
      try {
        addGrant(path, "read");
        return { path, ok: true };
      } catch (err) {
        return { path, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });
    res.json({ ok: results.every((r) => r.ok), results });
  });

  // ── Step 4: start the agent so the phone can link ──────────────────────
  app.post("/api/quick-setup/launch", guard, async (_req, res) => {
    const r = await deps.launchAgent();
    if (!r.ok && /No API key/i.test(r.error ?? "")) {
      return res.json({ ok: false, error: "Your AI key is missing. Tap “← Back” to the first step and paste it, then come back here." });
    }
    res.json(r);
  });

  // WhatsApp QR scanned → remember how it's used, then say hello.
  //   mode "assistant": the code was scanned with the ASSISTANT's own number;
  //     ownerNumber is the person's own WhatsApp, which they message it from.
  //   mode "personal": the person's own WhatsApp; only "Message yourself"
  //     messages that start with wakeWord are instructions.
  app.post("/api/quick-setup/whatsapp/linked", guard, async (req, res) => {
    if (!isBaileysConnected()) return res.json({ ok: false, error: "WhatsApp isn't connected yet — scan the QR code first." });
    const linked = getBaileysOwnerInfo();
    const mode   = req.body?.mode === "personal" ? "personal" : "assistant";
    try {
      const cfg = await deps.loadConfig();
      const prev = baileysSettingsFrom(cfg.channels?.whatsapp?.config ?? {}, cfg.agent?.name);
      let ownerNumber = prev.ownerNumber;
      if (mode === "assistant") {
        const n = normalizeOwnerNumber(req.body?.ownerNumber ?? prev.ownerNumber);
        if (!n.ok) return res.json({ ok: false, field: "ownerNumber", error: n.error });
        ownerNumber = n.number;
        if (linked && samePhoneNumber(linked.phone, ownerNumber)) {
          return res.json({
            ok: false, sameNumber: true, owner: linked,
            error: "That code was scanned with your own WhatsApp — so the assistant would be linked to your personal account. " +
                   "Scan it with the assistant's own number instead, or choose “Use my own WhatsApp”.",
          });
        }
      }
      const wakeWord = cleanWakeWord(req.body?.wakeWord) || prev.wakeWord || defaultWakeWord(cfg.agent?.name);
      // First link, or the way it's used changed (setups before 2.3.2 have no
      // saved mode — they get one hello explaining the start word).
      const modeChanged = !cfg.channels?.whatsapp?.enabled || cfg.channels?.whatsapp?.config?.mode !== mode;

      await deps.saveConfig(deps.mergeConfig(cfg, {
        channels: {
          whatsapp: {
            enabled: true, provider: "web",
            config: { ...(cfg.channels?.whatsapp?.config ?? {}), mode, ownerNumber, wakeWord },
          },
        },
        agent: {
          // The person's own number — never the assistant's.
          ...(mode === "assistant" ? { phone: ownerNumber } : (linked?.phone && !cfg.agent?.phone ? { phone: linked.phone } : {})),
          ...(mode === "personal" && linked?.name && !cfg.agent?.userName ? { userName: linked.name } : {}),
        },
      }));
      configureBaileys({ mode, ownerNumber, wakeWord });

      // Say hello where the person will talk to it — proves the loop works.
      const to = getBaileysOwnerJid();
      if (modeChanged && to) {
        const name = cfg.agent?.userName || (mode === "personal" ? linked?.name : "") || "";
        await sendBaileysMessage(to, whatsappHello(mode, name, wakeWord)).catch(() => {});
      }
      res.json({ ok: true, owner: linked, mode, ownerNumber, wakeWord });
    } catch (err) {
      res.json({ ok: false, error: String(err) });
    }
  });

  // Disconnect one connection: switch it off, delete its stored password /
  // token / key, stop it running. Reconnecting = the normal "+ Add" screen.
  async function disconnect(id: ConnectionId): Promise<void> {
    if (id === "whatsapp") await resetBaileysAuth();   // also removes it from the phone's "Linked devices"
    if (id === "telegram") { stopTelegramListener(); await forgetTelegramOwner(); }
    if (id === "folders")  { for (const g of loadGrants()) removeGrant(g.path); return; }
    const cfg = await deps.loadConfig();
    await deps.saveConfig(withoutConnection(cfg, id));
    // A running agent still holds the old login — restart it without this one.
    if (id !== "whatsapp" && deps.getAgent()) await deps.restartAgent();
  }

  app.post("/api/quick-setup/disconnect", guard, async (req, res) => {
    const id = req.body?.id;
    if (!isConnectionId(id)) return res.status(400).json({ ok: false, error: "Unknown connection." });
    try {
      await disconnect(id);
      res.json({ ok: true, id });
    } catch (err) {
      res.json({ ok: false, error: `Couldn't disconnect: ${String(err)}` });
    }
  });

  // Older name used by the WhatsApp card.
  app.post("/api/quick-setup/whatsapp/unlink", guard, async (_req, res) => {
    try {
      await disconnect("whatsapp");
      res.json({ ok: true });
    } catch (err) {
      res.json({ ok: false, error: String(err) });
    }
  });

  // Change the start word (personal) or the owner's number (assistant)
  // without scanning again.
  app.post("/api/quick-setup/whatsapp/settings", guard, async (req, res) => {
    try {
      const cfg  = await deps.loadConfig();
      if (!cfg.channels?.whatsapp?.enabled) return res.json({ ok: false, error: "WhatsApp isn't set up yet." });
      const prev = baileysSettingsFrom(cfg.channels.whatsapp.config ?? {}, cfg.agent?.name);
      const patch: Record<string, string> = {};
      if (req.body?.wakeWord !== undefined) {
        const w = cleanWakeWord(req.body.wakeWord);
        if (!w) return res.json({ ok: false, field: "wakeWord", error: "Type a start word, for example your assistant's name." });
        patch.wakeWord = w;
      }
      if (req.body?.ownerNumber !== undefined) {
        const n = normalizeOwnerNumber(req.body.ownerNumber);
        if (!n.ok) return res.json({ ok: false, field: "ownerNumber", error: n.error });
        const linked = getBaileysOwnerInfo();
        if (prev.mode === "assistant" && linked && samePhoneNumber(linked.phone, n.number)) {
          return res.json({ ok: false, field: "ownerNumber", error: "That's the assistant's own number — type the number you message it from." });
        }
        patch.ownerNumber = n.number;
      }
      await deps.saveConfig(deps.mergeConfig(cfg, {
        channels: { whatsapp: { config: { ...(cfg.channels.whatsapp.config ?? {}), ...patch } } },
        ...(patch.ownerNumber && prev.mode === "assistant" ? { agent: { phone: patch.ownerNumber } } : {}),
      }));
      const s = configureBaileys(patch);
      res.json({ ok: true, mode: s.mode, ownerNumber: s.ownerNumber, wakeWord: s.wakeWord });
    } catch (err) {
      res.json({ ok: false, error: String(err) });
    }
  });

  // Telegram (alternative to WhatsApp): verify token, save, open a claim
  // BEFORE the bot goes live so nobody else can link it.
  app.post("/api/quick-setup/telegram", guard, async (req, res) => {
    const token = String(req.body?.token ?? "").trim();
    if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
      return res.json({ ok: false, error: "That doesn't look like a bot token. It looks like 123456789:ABC-def… — copy it from @BotFather." });
    }
    let username = "";
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10_000) });
      const d = await r.json() as any;
      if (!d?.ok) return res.json({ ok: false, error: "Telegram didn't accept that token. Copy it again from @BotFather (send /mybots → your bot → API Token)." });
      username = d.result.username;
    } catch {
      return res.json({ ok: false, error: "Couldn't reach Telegram. Check the internet connection and try again." });
    }

    try {
      await patchConfig({ channels: { telegram: { enabled: true, provider: "default", config: { telegramToken: token } } } });
      const claim = createTelegramClaim(username);
      const r = await deps.restartAgent();
      if (!r.ok) return res.json({ ok: false, error: r.error || "Couldn't start the assistant." });
      // A QR of the claim link: point the phone camera at it, tap START. Done.
      const qrDataUrl = claim.link ? await qrToDataURL(claim.link, { width: 280, margin: 1 }).catch(() => null) : null;
      res.json({ ok: true, botUsername: username, link: claim.link, qrDataUrl, expiresAt: claim.expiresAt });
    } catch (err) {
      res.json({ ok: false, error: String(err) });
    }
  });

  app.get("/api/quick-setup/telegram/status", guard, async (_req, res) => {
    res.json(await getTelegramOwnerStatus());
  });

  // ── Step 5: done ───────────────────────────────────────────────────────
  app.post("/api/quick-setup/finish", guard, async (req, res) => {
    try {
      await patchConfig({ setupCompleted: true, setupCompletedAt: new Date().toISOString(), setupMode: "quick" });
      let autostart: { ok: boolean; error?: string } | null = null;
      if (req.body?.autostart === true) autostart = await installAutostart();
      res.json({ ok: true, autostart });
    } catch (err) {
      res.json({ ok: false, error: String(err) });
    }
  });

  // ── Power: keep-awake + lid-close advice ───────────────────────────────
  app.get("/api/power", guard, async (_req, res) => {
    res.json(await getPowerAdvice());
  });

  // Opens Windows' "Choose what closing the lid does" page — the user
  // changes the setting themselves; we never change power settings.
  app.post("/api/power/open-lid-settings", guard, (_req, res) => {
    if (process.platform !== "win32") return res.json({ ok: false, error: "Only available on Windows." });
    try {
      const child = spawn("control.exe", ["/name", "Microsoft.PowerOptions", "/page", "pageGlobalSettings"], {
        detached: true, stdio: "ignore", windowsHide: false,
      });
      child.unref();
      res.json({ ok: true });
    } catch (err) {
      res.json({ ok: false, error: String(err) });
    }
  });
}

/** Same Task Scheduler entry as install-autostart.bat (logon, no admin). */
function installAutostart(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, error: "Automatic start is set up with PM2 on Mac/Linux — see the README." });
  }
  const agentDir = process.cwd();
  if (!existsSync(join(agentDir, "start-background.vbs"))) {
    return Promise.resolve({ ok: false, error: "start-background.vbs is missing from the agent folder." });
  }
  const { cmd, args } = autostartCommand(agentDir);
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 20_000 }, (err, _stdout, stderr) => {
      if (err) resolve({ ok: false, error: (String(stderr).trim() || err.message).slice(0, 200) });
      else resolve({ ok: true });
    });
  });
}
