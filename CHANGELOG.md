# Changelog

All notable user-facing changes to the Vouza Admin Agent.

Format: each entry has a `version`, `date`, and a short list of bullets that
matter to end-users. Internal refactors don't appear here — see `git log` for
the full history.

---

## 2.3.0 — 2026-10-02

**A simpler dashboard, Local AI from the menu, and a security pass**

- 🧭 **New left menu**: Chat, Connections, AI model, Memory, Privacy & health, Settings — each opens as a page; Chat is one click away
- 💬 **Chat start screen**: "How can I help you today?" with one-tap suggestions, and a line under the message box showing which AI is answering
- 💻 **Local AI is easy to find**: the new **AI model** page finds Ollama on this computer, lets you pick the model, and switches back to the online AI with one click. Full setup also offers "Local AI (this computer, no key)"
- 🔒 **Safer chat**: text from an email or web page can no longer slip hidden code into the dashboard through a link in a reply, and the dashboard page can only talk to your own computer
- 🔐 **Backups are locked with a password** you choose — your keys inside can't be read without it (older backups still restore)
- 🔄 **Updates install finished releases only**, never work in progress; published releases can't be changed afterwards
- 🧹 The dashboard no longer shows setup-wizard messages or quietly contacts the AI when it opens
- 📱 Phones and narrow windows: the chat no longer disappears — the menu moves to the top
- ⚠️ **Using WhatsApp through WAHA?** It now needs an API key: start WAHA with `WAHA_API_KEY=<a long random password>` and save the same key under WhatsApp → WAHA API Key. Until then, WhatsApp messages through WAHA are refused. (The built-in WhatsApp QR connection is not affected.)

---

## 2.2.2 — 2026-10-02

**One-click uninstall**

- 🗑️ New **`uninstall.bat`** (Windows) and **`uninstall.sh`** (Mac / Linux): offers to save your settings to the Desktop, asks you to type YES, stops the agent, removes auto-start, shortcuts and PM2, then deletes the folder — Node.js and Ollama are left alone
- 🔤 `uninstall-autostart.bat` no longer shows garbled symbols

---

## 2.2.1 — 2026-10-02

**You'll know when to update**

- 🆕 The dashboard now tells you when a new version is out — a banner with a **How to update** button (checked once a day; switch off under **System Health → Privacy & network**)
- 🔄 **Check for updates** and the version number are now also in the sidebar of the main dashboard

---

## 2.2.0 — 2026-10-02

**Simpler setup, safer by default, and today's AI models**

- 🚀 **Quick Setup**: five plain screens — your name, one AI key, your email, which folders to share, then scan a QR with your phone
- 📱 **Use it from your phone** (WhatsApp "Message yourself" or Telegram): it finds a document and sends you the file, and always asks **YES** before sending any email
- 🔒 **Your keys and passwords are now encrypted** on your computer — older setups are upgraded automatically the first time you start
- 🌐 **Goes online only when you ask**: searching the web or opening a website waits for your YES; every outside connection is listed under **System Health → Privacy & network**
- 👥 **People you allow-list are guests**: they can chat, but can't read your email or files, send anything, or see your memories
- 🧠 **Today's AI models**: Claude Sonnet 5.5 / Opus 5.5 / Fable 5.1, GPT-5.5, plus a "Load all OpenRouter models" search (400+) and a box to type any model ID — shown as simple "Best for most people / Cheapest / Most capable" picks
- 💻 **Local AI option**: run the AI on your own computer with Ollama — no key, nothing sent to an AI company
- 🛠️ **Fixed**: the default OpenRouter "fast" model no longer existed upstream; the Docker build failed; light-mode lists and titles were hard to read; the Windows start window showed garbled symbols
- 🔄 **Updating is easier**: `start.bat` installs what's needed by itself, `update.bat` also repairs copies made before 1 Oct 2026, and **Check for updates** shows which version you're on
- ⚠️ **Installed before 2 Oct 2026?** Run `update.bat` — it offers to replace the old code and keeps your settings — or follow "Updating" in the README

---

## 2.1.0 — 2026-05-20

**Operator dashboard + power-user features**

- 📊 New **System Health panel** shows live agent uptime, today's spend, and per-provider failover status — open it from the new "📊 Health" button in the sidebar
- 🟢 New **live status dot** next to the agent name in the sidebar — green when healthy, amber if a provider is in cooldown, red if the agent stopped
- 💾 New **config backup**: download your full setup (config + memories) as a JSON file from the Health panel
- ♻️ New **config restore**: drag your backup back in to migrate to a new machine
- ⌨️ New **command palette** (Cmd+K / Ctrl+K) — keyboard-first jump to any action
- 🔍 **Conversation search** now highlights the matched text in yellow
- ♿ Accessibility: skip-to-content link, focus-visible outlines, ARIA labels on icon buttons
- 🔧 **Friendly error messages** when something fails (no more raw HTTP 500s)
- 🎯 **First-launch tour** walks brand-new users through the live dashboard once

---

## 2.0.5 — 2026-05-19

**UX polish for non-technical users**

- 🎓 **Setup profiles**: Step 3 now has Beginner / Intermediate / Advanced presets — one click sets everything sensibly
- 📋 Skills now show prerequisite badges (✓ Ready / ⚠️ Needs setup) based on which integrations are connected
- 🚥 Step 2 priority hierarchy: Required (red) / Recommended (green) / Optional (gray) badges per section
- 📱 **Setup Status panel** in live mode shows what's not yet connected with one-click "+ Add" buttons that route to the Guide Bot
- 🔄 **WhatsApp "Invalid QR code" fix**: new "Reset and start fresh" button auto-appears after 2 failed QR cycles
- 💾 **Wizard auto-save**: closing the tab mid-setup no longer loses your progress (saved to your browser, restored on next visit)
- 📜 **Chat scroll fix**: messages now reliably appear at the bottom on mobile browsers

---

## 2.0.4 — 2026-05-19

**Reliability + observability**

- 🔁 **Provider failover**: if Anthropic / OpenAI / Gemini has an outage, the agent transparently swaps to your next configured provider
- 💰 **Cost guard** (Vouza shared key only): $10/day cap with daily reset, blocks abuse without affecting customers using their own key
- 🛡️ **Shell tool hardening**: blocks `npm install <package>`, restricts `pm2 start/stop` to allowlisted services, logs every call
- 🔐 **Dashboard auth**: binds to loopback by default (no LAN exposure); opt-in remote with password
- 📚 **Structured logs** at `data/logs/admin-agent.log` (JSONL — grep-friendly)
- 📖 **PDPA audit log** of every chat turn at `data/chat-history/<sessionId>.jsonl`
- ✅ **173 smoke tests** lock in security + correctness contracts

---

## 2.0.3 — 2026-05-19

**Hermes v0.14.0 integration**

- Tool error sanitization (strips prompt-injection from tool outputs)
- Anthropic prompt caching (5-minute prefix cache → ~90% cost reduction)
- DuckDuckGo free search fallback (web search works on every install)
- Telegram inline button keyboards (auto-detect numbered list responses)
- Adaptive fast-path for short replies (1 API call instead of 2)
- Service manager circuit breaker

---

## 2.0.0 — 2026-05-16

Initial multi-provider release.
