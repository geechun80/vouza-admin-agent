# Changelog

All notable user-facing changes to the Vouza Admin Agent.

Format: each entry has a `version`, `date`, and a short list of bullets that
matter to end-users. Internal refactors don't appear here — see `git log` for
the full history.

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
