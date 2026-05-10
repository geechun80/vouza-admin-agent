# Admin Agent v2.0

A powerful, self-improving AI office assistant designed to automate your digital life. Admin Agent supports multiple AI providers and seamlessly integrates with a massive list of communication and productivity tools. 

## 🌟 Key Features

### 🧠 Self-Improving & Scheduled Skills
- **Auto-Learning**: The agent analyzes its own execution history to generate new skills and optimize existing ones based on past successes and failures.
- **Persistent Memory**: Retains contextual memory via local storage.
- **Cron Scheduling**: Execute recurring background tasks and reports on predefined schedules.

### 🔌 Multi-Provider AI Support
Mix and match the best AI providers through the dashboard setup.
- Anthropic (Claude)
- OpenAI (ChatGPT)
- Google AI (Gemini)
- xAI (Grok)
- DeepSeek
- Alibaba (Qwen)
- Moonshot (Kimi)

### 🛠️ Extensive Integrations
- **Google Workspace Ecosystem**: Read/Write to Google Calendar, Google Sheets, Google Drive, and Google Docs using unified service account credentials.
- **Communication Channels**:
  - Email (via Gmail integration)
  - Slack
  - Telegram (Bot API)
  - WhatsApp (supports Twilio, Meta Cloud API, WAHA Self-Hosted, and Whatsapp Web via QR code)

---

## 🚀 Getting Started

The agent is designed for easy deployment on Windows machines.

1. **Setup Wizard**: 
   Double click the `setup.bat` file to open the dashboard on your browser. 
   Here you can configure all your API keys and authentication credentials visually without editing code.
2. **Start the Agent**: 
   Once configured, double click the `start.bat` file. 
   This will automatically build the project and bootstrap the AI agent on your terminal.

*(For advanced users, an `ecosystem.config.cjs` file is also included so the project can be run invisibly as a background service using PM2).*

---

## 🤖 Basic Usage Examples

Through the interactive REPL in the terminal, you can interact with the agent using natural language:

- *"Read my unread emails and draft responses for any important ones."*
- *"Find a free 30-minute slot on my Calendar tomorrow and send a summary to my Telegram."*
- *"Append this week's key metrics into the Google Sheet."*

You also have access to slash commands in the REPL:
- `/schedule` - Set up default task schedules.
- `/tasks` - List all scheduled tasks.
- `/skills` - View the automatically learned and bundled skills of the agent.
- `/improve` - Manually trigger the self-improvement and skill-learning cycle.
- `/stats` - View self-improvement analytics.

---

### Prerequisites
- Node.js 18 or above
