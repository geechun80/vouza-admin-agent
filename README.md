<div align="center">

# Vouza Admin Agent

**Your AI office assistant — runs on your PC, controlled from your phone.**

Email · Calendar · WhatsApp · Telegram · Files · Voice · Web search — all in one agent.

[![Tests](https://img.shields.io/badge/tests-402%2F402-brightgreen)](#)
[![Node](https://img.shields.io/badge/node-20.19%2B-blue)](https://nodejs.org)
[![Audit](https://img.shields.io/badge/npm%20audit-0%20vulnerabilities-brightgreen)](#)
[![License](https://img.shields.io/badge/license-private-lightgrey)](#)

[Quickstart](#-quickstart) · [Features](#-features) · [Connect Channels](#-connect-channels) · [Run 24/7](#%EF%B8%8F-running-247) · [Updating](#-updating) · [Troubleshooting](#-troubleshooting)

</div>

<p align="center">
  <img src="docs/assets/hero-setup.png" alt="Vouza Admin Agent — Setup Panel with per-integration cards" width="900">
</p>

> *Per-integration cards with self-healing `detect → validate → test → save → confirm → live-test` pipeline. Click Test, watch each step succeed live.*

---

## ✨ Features

- 🚀 **Quick Setup** — five plain screens: paste a key, press Next. The agent detects the provider, verifies for real, saves, and links your phone.
- 📱 **Works from your phone** — WhatsApp ("Message yourself") or Telegram. Finds documents and *sends you the file*; asks for **YES** before sending any email.
- 🧠 **Multi-provider AI** — Anthropic, OpenAI, Gemini, DeepSeek, xAI, OpenRouter (100+ models). One key, automatic failover.
- 📬 **Email + Calendar** — Gmail, Yahoo, iCloud, Zoho or any IMAP/SMTP mailbox (App Password), Google Calendar, dedicated AgentMail inbox.
- 💬 **Two-way messaging** — Telegram bot, WhatsApp (native QR via Baileys, no Docker required), Slack (Bolt SDK — coming).
- 🔧 **Self-healing setup** — structured `detect → validate → test → save → confirm → live-test` pipeline replaces ad-hoc retries.
- 📊 **Observability built-in** — per-integration p50/p95 latency, retry counts, webhook log, failed-action retry, API spend tracking.
- 🔌 **Visual setup wizard** — per-integration cards with Configure / Test / Reconnect buttons + step-by-step progress UI.
- 🎙️ **Voice notes** — drop a `.mp3`/`.ogg` into chat, Whisper transcribes via Groq or OpenAI.
- 🛡️ **Secure by default** — loopback-only dashboard, PDPA-compliant audit log, secret redaction, sandboxed file ops.

---

## ⚡ Quickstart

> **Pick ONE** install method. They're equivalent — just different convenience layers.

<table>
<tr>
<td width="33%" valign="top">

### 🐳 Docker
**Best for: servers, VPS, "set & forget"**

```bash
git clone https://github.com/geechun80/vouza-admin-agent.git
cd vouza-admin-agent
cp .env.example .env
# Edit .env: set VOUZA_API_KEY
docker compose up -d
```

Open **http://localhost:3456**

No Node, no PM2, auto-restart, survives reboots.

</td>
<td width="33%" valign="top">

### 💻 Native Node
**Best for: development, customization**

```bash
git clone https://github.com/geechun80/vouza-admin-agent.git
cd vouza-admin-agent
npm install
npm run build
node dist/dashboard/launch.js
```

Open **http://localhost:3456**

Requires [Node.js 20.19+](https://nodejs.org).

</td>
<td width="33%" valign="top">

### 🪟 Windows one-click
**Best for: non-technical users**

After cloning + `npm install` + `npm run build`:

1. Double-click **`start.bat`**
2. Browser opens to wizard
3. Done

For 24/7 background: double-click **`install-autostart.bat`** (uses Task Scheduler).

</td>
</tr>
</table>

### 🚀 Quick Setup — the default

Open the dashboard and press **Get Started**. Five screens, one question each:

| Screen | You do | The agent does |
|---|---|---|
| **You** | Type your name; paste an AI key (skipped if a built-in key works) | Works out which AI the key belongs to and checks it live |
| **Email** | Type your address + App Password | Finds the mail servers (including Google Workspace / Microsoft 365 on your own domain), signs in to read **and** send, shows your unread count |
| **Documents** | Tick Documents / Desktop / Downloads | Grants **read-only** access — it can never delete or change files |
| **Phone** | Scan a QR with WhatsApp (or tap a Telegram link) | Starts itself, links your phone, says hello in "Message yourself" |
| **All set** | Untick anything you don't want | Keeps the computer awake, checks the lid setting, optionally starts at login |

Refreshing or closing the page mid-way is fine — it resumes at the first unfinished screen. Need every option? Use **Advanced setup (all options)** under the Get Started button.

> **Why an App Password instead of "Sign in with Google"?** Gmail's read/send permissions are restricted: a public app must pass Google verification plus an annual third-party security assessment, and until then users see an "unverified app" warning, there's a 100-user cap, and sign-ins expire every 7 days. App Passwords work today with no approval process.

### 🔑 Get your AI key

You only need **one**. Paste it into Quick Setup (or the Advanced wizard) — no file editing.

| Provider | Get a key | Format |
|---|---|---|
| **Anthropic** Claude | [console.anthropic.com/keys](https://console.anthropic.com/keys) | `sk-ant-…` |
| **OpenAI** GPT-4o | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `sk-proj-…` |
| **Google** Gemini | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | `AIza…` |
| **OpenRouter** *100+ models, one key* | [openrouter.ai/keys](https://openrouter.ai/keys) | `sk-or-…` |
| DeepSeek / xAI / Groq | See respective console | — |

> 💡 **OpenRouter recommended** if you want to try different models without managing multiple keys.

---

## 🔌 Connect Channels

After the wizard, use the **🔌 Setup** panel in the dashboard to connect channels. Each integration goes through a guided pipeline that tests credentials live before saving — no more "saved but doesn't work."

<p align="center">
  <img src="docs/assets/hero-configure-modal.png" alt="Configure modal: paste credentials JSON or drag-drop the .json file" width="900">
</p>

<p align="center">
  <img src="docs/assets/hero-pipeline-progress.png" alt="Pipeline progress: detect ✓ → validate ✓ → test ⟳ → save → confirm → live-test" width="900">
</p>

> *Paste the credential JSON or drag the `.json` file in — the pipeline runs each step live so you see exactly where any failure happens, with a specific suggested fix.*

<details>
<summary><b>📱 Telegram</b> (recommended — control your agent from your phone)</summary>

1. On Telegram, message **[@BotFather](https://t.me/BotFather)** → send `/newbot`
2. Choose a name + username → copy the **bot token**
3. Dashboard → **🔌 Setup** → Telegram → Configure → paste token → **Test**
4. Message your bot — it replies via the agent

</details>

<details>
<summary><b>💚 WhatsApp</b> (free, no Docker, no Twilio)</summary>

1. Dashboard → **🔌 Setup** → WhatsApp → **Connect** — QR code appears
2. On your phone: WhatsApp → ⋮ Menu → **Linked Devices → Link a Device**
3. Scan the QR
4. Done — messages from your allowlist route through the agent

> By default, only YOUR number can interact with the agent (deny-by-default allowlist). Add others in Settings → WhatsApp.

</details>

<details>
<summary><b>📧 Gmail</b> (send & receive email)</summary>

**Option A — App Password (simplest):**
1. Enable [2-Step Verification](https://myaccount.google.com/signinoptions/twosvauth)
2. Go to [App Passwords](https://myaccount.google.com/apppasswords) → create one for "Mail"
3. Dashboard → **🔌 Setup** → Gmail → paste 16-char password

**Option B — Service Account (recommended for teams):**
1. [GCP Console → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) → create one
2. Generate a JSON key → download
3. [Enable Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
4. Dashboard → **🔌 Setup** → Gmail → drag the `.json` file into the modal

</details>

<details>
<summary><b>📅 Google Calendar</b></summary>

1. [GCP Console → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) → create one + JSON key
2. [Enable Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)
3. Share your calendar with the service account's email (the `client_email` field)
4. Dashboard → **🔌 Setup** → Google Calendar → drop the `.json` file

</details>

<details>
<summary><b>📨 AgentMail</b> (dedicated AI inbox)</summary>

1. Sign up at [agentmail.to](https://agentmail.to) → get an API key
2. Dashboard → **🔌 Setup** → AgentMail → paste key
3. The agent creates an inbox like `your-agent@agentmail.to` and polls it every 60s

</details>

---

## 📱 Using it from your phone

Message it in WhatsApp's **"Message yourself"** chat (or your Telegram bot). Phone chats get a deliberately small toolset: read and send email, search the folders you shared, **send you the actual file**, read your calendar, search the web, remember things. Deleting, running commands, browsing, changing settings — desktop only.

- **Nothing is sent without your YES.** When the agent wants to send or reply to an email, it shows who, the subject and any attachments, then waits. Reply `yes` (or tap ✅ on Telegram) to send, `no` to cancel; anything else cancels. This is enforced in code — text inside an email or document can't trigger a send — and a voice note never counts as YES.
- **Files come to you.** "Find my insurance policy and send it to me" delivers the PDF in the chat (up to 45 MB, shared folders only).
- **Only you.** WhatsApp answers your own number plus anyone you allow-list. A Telegram bot answers only the person who linked it with the one-time link from setup; strangers get "This is a private assistant".

**Keeping it reachable while you're away.** While the agent runs, it asks the computer not to idle-sleep (Windows, macOS, Linux with systemd) and lets go when it stops — even after a crash. It can't override the lid: if closing the lid puts your laptop to sleep, the agent stops answering until you open it. Quick Setup checks this setting and offers a **Change lid setting** button (Windows: *When I close the lid → Do nothing* for *Plugged in*). Keep the laptop plugged in. If the computer does sleep: Telegram messages are answered when it wakes (Telegram holds them for 24 hours); WhatsApp messages sent during the sleep are not answered — send them again.

### 🛡️ Safety defaults

The agent reads untrusted text all day — incoming emails, documents, web pages — so what it can *do* depends on who is talking to it:

| Who / when | What it can do |
|---|---|
| **You, on the laptop dashboard** | Everything you've connected (you see every step) |
| **You, from your phone** | Read and search; send email only after your **YES**; send files to you |
| **Scheduled runs** (morning briefing, weekly report, scheduled skills) | Read and search, draft emails, label/star/mark read — **never** send, archive, trash, write files, browse or change memory |
| **Other people** (AgentMail, WAHA) | Only senders you allow-listed. AgentMail: read-only. WAHA: same as your phone |

- **Maintenance commands are off.** The setup assistant tells you which command to type instead. Admins can enable a locked-down version with `SHELL_TOOL_ENABLED=true` (one plain `npm`/`pm2`/`git` command at a time — no chaining, scripts or URLs).
- **Upgrading with WAHA or AgentMail?** Both now ignore everyone who isn't allow-listed. Add the numbers/addresses that should reach the agent (WhatsApp card → allowed senders; `agentmail.allowedSenders`). AgentMail always accepts your own email address.

---

## 🛠️ Running 24/7

For "always running" deployments — survives reboots, restarts on crash. (Quick Setup's last screen can set up the Windows login task for you.)

<table>
<tr>
<td width="50%" valign="top">

### 🪟 Windows — Task Scheduler
**No extra tools needed.**

```cmd
install-autostart.bat
```

Answer **Y** twice. Agent starts now and on every login.

**To remove:** `uninstall-autostart.bat`

</td>
<td width="50%" valign="top">

### 🐧 Mac / Linux / Cross-platform — PM2
**Live logs + CPU/memory monitoring.**

```bash
# Windows
install-pm2.bat

# Mac / Linux
chmod +x install-pm2.sh
./install-pm2.sh
```

Script installs PM2, builds, starts, persists.

</td>
</tr>
</table>

<details>
<summary><b>Daily PM2 commands</b></summary>

| Command | Purpose |
|---|---|
| `pm2 list` | Show agent status / CPU / memory |
| `pm2 logs admin-agent` | Tail live logs |
| `pm2 monit` | Real-time dashboard |
| `pm2 restart admin-agent` | Restart after update |
| `pm2 stop admin-agent` | Stop |
| `pm2 flush admin-agent` | Clear log files |

</details>

<details>
<summary><b>Daily Docker commands</b></summary>

| Command | Purpose |
|---|---|
| `docker compose up -d` | Start in background |
| `docker compose logs -f` | Tail logs |
| `docker compose restart admin-agent` | Restart |
| `docker compose down` | Stop |
| `docker compose ps` | Show containers |

</details>

---

## 🔄 Updating

> Your `data/` directory (config, credentials, chat history, WhatsApp auth) is **never touched** by an update.

### Easiest

| OS | Action |
|---|---|
| **Windows** | Double-click `update.bat` |
| **Mac / Linux** | `./update.sh` |
| **Docker** | `git pull && docker compose up -d --build` |

### Manual

```bash
cd vouza-admin-agent
git pull
npm ci            # ← exact pinned versions (NOT npm install)
npm run build
pm2 restart admin-agent
```

> ⚠️ **Always use `npm ci`, not `npm install`.** `npm ci` reads `package-lock.json` exactly. `npm install` can silently upgrade pinned deps (Baileys, Playwright) and break things.

### Verify the update worked

1. Open **http://localhost:3456** — "What's new" modal appears once
2. Send a test message to the Guide Bot — replies appear at the **bottom** of chat
3. Check `data/logs/admin-agent.log` — fresh JSON entries from the current minute

---

## 🧪 Troubleshooting

| Symptom | Fix |
|---|---|
| `Port 3456 already in use` | `npx kill-port 3456` or close the other instance |
| `Cannot find module` | `npm run build` again |
| Telegram bot silent | Verify the bot token via **@BotFather** → `/mybots` |
| WhatsApp "Invalid QR code" | Dashboard → Setup → WhatsApp → **Reset & start fresh** button |
| WhatsApp disconnects often | Phone needs internet; check the same phone isn't linked elsewhere |
| `pm2: command not found` | Reopen terminal, or `npm config get prefix` and add to PATH |
| PM2 won't auto-start on Windows | `pm2 startup` doesn't work on Windows — use `install-autostart.bat` |
| Agent crash-loops | `pm2 logs admin-agent --lines 50` — usually missing `data/config.json` (finish the wizard) |
| Bot replies above user message | You're on an old build — `git pull && npm ci && npm run build` |

<details>
<summary><b>More PM2 troubleshooting</b></summary>

| Symptom | Cause | Fix |
|---|---|---|
| `EACCES: permission denied` during install | Need elevation | **Win**: run as Admin · **Mac/Linux**: prefix `sudo` |
| Memory grows past 500 MB | Normal up to ~500 MB | PM2 auto-restarts past 500 MB (configured in `ecosystem.config.cjs`) |
| `npm install -g pm2` blocked by proxy | Corporate network | `npm config set proxy http://your.proxy:8080` |
| `npm install -g pm2` blocked by antivirus | Windows Defender flagging | Temp-disable real-time protection, install, re-enable |

</details>

---

## 🏗️ Architecture

```
src/
  agent/          → loop, redactor, error classifier, budget, failover
  orchestrator/   → self-healing pipeline (detect → validate → test → save → confirm → live-test)
  integrations/   → unified Integration interface + HealthMonitor (rolling 1000-event window)
  bridge/         → service manager + circuit breakers
  config/         → wizard config → runtime AgentContext
  dashboard/      → Express API + single-page UI (Setup panel, Health dashboard)
  email/          → AgentMail listener
  telegram/       → polling + webhook, live streaming, inline keyboards
  whatsapp/       → Baileys (native QR) + WAHA (webhook)
  tools/          → 27+ tools: email, calendar, sheets, files, voice, web search, …
  voice/          → Whisper via Groq / OpenAI
```

Key patterns documented in `memory/build_rules_agents.md` — 63 rules covering everything from listener structure to credential validation pipelines.

---

## 📚 Documentation

- **[API Reference](docs/api-reference.md)** — HTTP endpoints, SSE events, auth
- **[Architecture Deep-Dive](docs/architecture.md)** — Agent loop, orchestrator, integrations, security model
- **[Customization Guide](docs/customization.md)** — Add tools, MCP servers, custom skills, branding

---

## 📜 License & Support

Private repo — contact the Vouza team for access or to report issues.

Built with ❤️ by [Vouza.ai](https://vouza.ai) — Singapore.
