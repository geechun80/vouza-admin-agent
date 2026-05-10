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

### Step 4 — Configure your environment

Copy the example config file and fill in your details:

```bash
copy .env.example .env
```

Open `.env` in Notepad and set at minimum:

```env
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

Get your Anthropic API key at: https://console.anthropic.com/keys

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
git pull
npm install
npm run build
```

Then restart the agent (or PM2 will auto-restart it).

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
