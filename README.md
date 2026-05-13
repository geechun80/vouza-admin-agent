# Vouza Admin Agent

AI-powered office automation — email, calendar, Telegram, WhatsApp, and more. Control your AI from your phone while your PC runs it in the background.

---

## Team Installation Guide

### Prerequisites

Make sure these are installed on the laptop before starting:

| Tool | Download | Check if installed |
|------|----------|--------------------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) | `node --version` |
| **Git** | [git-scm.com](https://git-scm.com) | `git --version` |

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

## Running in the background (recommended)

Install PM2 to keep the agent running 24/7:

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

The agent will now auto-start on boot and stay running in the background.

---

## Updating to the latest version

```bash
cd vouza-admin-agent
git pull
npm install
npm run build
```

Then restart the agent (or PM2 will auto-restart it).

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
