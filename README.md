# Vouza Admin Agent

AI-powered office automation — email, calendar, Telegram, WhatsApp, and more. Control your AI from your phone while your PC runs it in the background.

---

## Team Installation Guide

### Prerequisites

Make sure these are installed on the laptop before starting:

| Tool | Required? | Download | Check if installed |
|------|-----------|----------|--------------------|
| **Node.js 18+** | ✅ Required | [nodejs.org](https://nodejs.org) | `node --version` |
| **Git** | ✅ Required | [git-scm.com](https://git-scm.com) | `git --version` |
| **PM2** | ⚙️ Optional (for 24/7 background running) | Installed automatically by `install-pm2.bat` / `install-pm2.sh` — see "Running in the background" below | `pm2 --version` |

> **About PM2:** You do NOT need to install PM2 manually. After completing the setup wizard, just run `install-pm2.bat` (Windows) or `./install-pm2.sh` (Mac/Linux) — the script installs PM2 for you, builds the agent, and starts it in the background.
>
> Windows users have an even simpler alternative: `install-autostart.bat` uses Windows Task Scheduler instead, so no PM2 needed at all. See the "Running in the background" section below for the decision matrix.

---

### Step 1 — Clone the repo

Open **PowerShell** or **Terminal** and run:

```bash
git clone https://github.com/geechun80/vouza-admin-agent.git
cd vouza-admin-agent
```

> **Note:** The repo is private. You must be invited as a collaborator by @geechun80 before cloning.

---

### Step 2 — Install dependencies

```bash
npm install
```

---

### Step 3 — Build the project

```bash
npm run build
```

---

### Step 4 — Get your AI API key (just one)

You need **one** API key for whichever AI provider you want to use. Get it now so it's ready for the Setup Wizard in Step 5:

| Provider | Where to get your key | Key looks like |
|----------|-----------------------|----------------|
| **Anthropic** (Claude) | https://console.anthropic.com/keys | `sk-ant-...` |
| **OpenAI** (GPT-4o) | https://platform.openai.com/api-keys | `sk-proj-...` |
| **Google** (Gemini) | https://aistudio.google.com/app/apikey | `AIza...` |
| **DeepSeek** | https://platform.deepseek.com | `sk-...` |
| **xAI** (Grok) | https://console.x.ai | `xai-...` |
| **OpenRouter** (100+ models) | https://openrouter.ai/keys | `sk-or-...` |

> **You only need one key.** You will paste it directly into the Setup Wizard — **no need to edit any files manually.**
> OpenRouter is a great choice if you want access to many different AI models under a single key.

> ⚠️ **Do NOT edit `.env` manually** — the Setup Wizard handles everything for you. The `.env` file is only needed for advanced server deployments.

---

### Step 5 — Launch the Setup Wizard

Double-click **`start.bat`** — or run in terminal:

```bash
node dist/dashboard/launch.js
```

Then open your browser at: **http://localhost:3456**

The setup wizard will guide you through:
1. Naming your AI and choosing your AI model
2. Connecting apps (Email, WhatsApp, Telegram, Slack, Calendar, etc.)
3. Enabling skills (email triage, daily briefing, invoice processing)
4. Going live

---

### Step 6 — Connect Telegram (recommended for mobile access)

1. Open Telegram on your phone → search **@BotFather**
2. Send `/newbot` → choose a name and username
3. Copy the **Bot Token**
4. In the setup wizard → Connect Apps → select **Telegram** → paste the token
5. Message your bot from anywhere to control your AI

---

### Step 7 — Connect WhatsApp (optional)

1. In the setup wizard → Connect Apps → select **WhatsApp** → choose **WhatsApp Web (Free)**
2. Click **Connect** — a QR code appears on screen
3. Open WhatsApp on your phone → tap **⋮ Menu → Linked Devices → Link a Device**
4. Scan the QR code
5. Done — message that number to give tasks to your AI

---

## Running in the background (production setup)

To keep the agent running 24/7 — even after reboot, crashes, or you closing the terminal — you have **two options**. Pick the one that fits your OS and comfort level.

### Option A — Windows users: Task Scheduler (simplest, no extra tools)

Best for: Windows users who just want it to "always be running" without installing anything extra.

1. Double-click **`install-autostart.bat`** in this folder
2. When asked, answer **Y** to confirm install
3. When asked, answer **Y** to start the agent now
4. Done — the agent now starts automatically every time you log in to Windows

To remove: double-click **`uninstall-autostart.bat`**

> ℹ️ This uses Windows Task Scheduler under the hood. The agent runs silently with no terminal window. Logs go to `data/logs/admin-agent.log`.

---

### Option B — Any OS: PM2 (best logs, monitoring, cross-platform)

Best for: Power users, Mac/Linux users, anyone who wants live log streaming + CPU/memory monitoring.

PM2 is a process manager that keeps Node apps running with these benefits over Task Scheduler:

- ✅ **Auto-restart on crash** with exponential backoff
- ✅ **Live log streaming**: `pm2 logs admin-agent`
- ✅ **Live monitoring**: `pm2 monit` (CPU + memory in real time)
- ✅ **Memory cap**: auto-restarts if RAM exceeds 500 MB
- ✅ **Cross-platform**: works the same on Windows, Mac, Linux

#### Quick install (one command per OS)

**Windows** (PowerShell or Command Prompt):
```bat
install-pm2.bat
```

**Mac / Linux** (Terminal):
```bash
chmod +x install-pm2.sh
./install-pm2.sh
```

The installer script will:
1. Check that Node.js 18+ is installed
2. Check if PM2 is already installed (skip if so)
3. Install PM2 globally via `npm install -g pm2`
4. Build the project if `dist/` is missing
5. Start the agent with `pm2 start ecosystem.config.cjs`
6. Persist the process list so it survives reboot
7. Optionally configure boot-time auto-start

#### Manual install (if the script doesn't work for you)

```bash
# 1. Confirm Node is installed (need v18 or newer)
node --version

# 2. Install PM2 globally
npm install -g pm2
#   ↑ on Mac/Linux you may need:  sudo npm install -g pm2

# 3. Verify install
pm2 --version

# 4. Build the project (only if not already built)
npm run build

# 5. Start the agent under PM2
pm2 start ecosystem.config.cjs

# 6. Save the process list (so PM2 remembers it across reboots)
pm2 save

# 7. Set up auto-start on boot
pm2 startup
#   ↑ this prints a `sudo` command on Mac/Linux — copy and run it
#   ↑ on Windows, `pm2 startup` does NOT work — use install-autostart.bat instead
```

#### Daily PM2 commands you'll actually use

| Command | What it does |
|---|---|
| `pm2 list` | Show all running agents + their status / CPU / memory |
| `pm2 logs admin-agent` | Tail live logs (Ctrl+C to exit) |
| `pm2 logs admin-agent --lines 100` | Last 100 log lines |
| `pm2 monit` | Real-time CPU + memory dashboard |
| `pm2 restart admin-agent` | Restart (e.g. after `git pull`) |
| `pm2 stop admin-agent` | Stop the agent |
| `pm2 delete admin-agent` | Remove from PM2 (use before reinstalling) |
| `pm2 flush admin-agent` | Clear log files |

---

### Which option should you pick?

| Scenario | Pick |
|---|---|
| First-time user on Windows, just want it running | **Option A** (`install-autostart.bat`) |
| Mac or Linux user | **Option B** (PM2 — Task Scheduler doesn't exist) |
| Need live log streaming for debugging | **Option B** (PM2) |
| Want to monitor CPU/memory usage | **Option B** (PM2) |
| Running on a VPS / server | **Option B** (PM2) — industry standard |
| Don't want any extra tools | **Option A** (Task Scheduler) |

> 💡 You can switch later — both methods are reversible. Just run the uninstall script for the one you started with, then install the other.

---

### PM2 troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `pm2: command not found` after install | PATH not updated | Close and reopen terminal; or run `npm config get prefix` to find PM2's location and add to PATH |
| `EACCES: permission denied` during install | Need elevated permissions | **Windows**: run terminal as Administrator. **Mac/Linux**: prefix with `sudo` |
| `pm2 startup` on Windows says "not supported" | Correct — Windows uses a different mechanism | Use `install-autostart.bat` instead (Task Scheduler) |
| Agent shows status `errored` in `pm2 list` | Crashed on boot | Run `pm2 logs admin-agent --lines 50` to see why |
| Agent restarting in a loop | Crash → restart → crash | Run `pm2 logs admin-agent` to see the crash reason. Common: missing `data/config.json` — finish the setup wizard first |
| Memory grows over time | Normal up to ~500MB | PM2 auto-restarts past 500MB (configured in `ecosystem.config.cjs`). If it happens often, see `data/logs/admin-agent.log` for leak source |
| `npm install -g pm2` blocked by corporate proxy | Network policy | Configure npm proxy: `npm config set proxy http://your.proxy:8080` |
| `npm install -g pm2` blocked by antivirus | Common with Windows Defender | Temporarily disable real-time protection, install, then re-enable |
| Forgot if PM2 is installed | Check the binary | `pm2 --version` — prints version or "command not found" |

---

## Updating to the latest version

Follow these steps **in order**. Your saved config, chat history, and credentials are stored in `data/` and are **not touched** by the update — only the code changes.

### Step 1 — Pull the latest code

```bash
cd vouza-admin-agent
git pull
```

### Step 2 — Update dependencies

```bash
npm ci
```

> ⚠️ **Use `npm ci`, not `npm install`.** `npm ci` reads `package-lock.json` and installs the EXACT versions we tested. `npm install` could silently upgrade pinned-but-risky deps (Baileys, Playwright) and break WhatsApp or the browser tools.

### Step 3 — Rebuild

```bash
npm run build
```

You should see `✓ public/ copied to dist/` at the end.

### Step 4 — Restart the agent

Pick the one that matches how you installed it:

**If you used PM2** (ran `install-pm2.bat` / `install-pm2.sh`):
```bash
pm2 restart admin-agent
pm2 logs admin-agent --lines 20   # confirm it started cleanly
```

**If you used Windows Task Scheduler** (ran `install-autostart.bat`):
- Open Task Manager → find `wscript.exe` running → end task
- Re-run by double-clicking **`start-background.vbs`** (or wait until next login)

**If you just run `npm run setup` manually**:
- Close the existing terminal window
- Run `npm run setup` again

### Step 5 — Verify the update worked

1. Open the dashboard at **http://localhost:3456**
2. The dashboard should load and show "🛡 Bound to loopback only" (or your configured bind) in the terminal output
3. Check `data/logs/admin-agent.log` — fresh JSON log entries from the current minute confirm structured logging is running
4. Test the Guide Bot by sending a message — it should reply at the bottom of the chat (not the top)

> 💡 **Common gotcha:** if you ran `npm install` instead of `npm ci`, run `npm ci` once to restore exact pinned versions. Then `npm run build` again.

---

## Already installed? Apply security updates

If you installed the agent **before 12 May 2026**, run these 3 commands to patch a high-severity vulnerability in the email library (nodemailer):

```bash
cd vouza-admin-agent
git pull
npm install
npm audit
```

You should see **found 0 vulnerabilities** after `npm install`. If you see any remaining issues, run:

```bash
npm audit fix
```

> **What was fixed:** nodemailer was upgraded from v6.9 → v8.0.7, patching 4 security issues including SMTP command injection. Your `.env` keys and saved config are not affected — no need to reconfigure anything.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Port 3456 already in use` | Another agent instance is running — close it first or run `npx kill-port 3456` |
| `Cannot find module` | Run `npm run build` again |
| Telegram bot not responding | Check the Bot Token is correct — message @BotFather to verify |
| WhatsApp disconnects | Re-scan the QR code in the setup wizard |

---

## Support

Contact the Vouza team or raise an issue in this repo.
