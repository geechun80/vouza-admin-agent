// =============================================================================
// PM2 Ecosystem Config — Vouza Admin Agent
//
// Usage:
//   pm2 start ecosystem.config.cjs          # start / restart
//   pm2 reload ecosystem.config.cjs         # zero-downtime reload
//   pm2 stop ecosystem.config.cjs           # graceful stop
//   pm2 delete ecosystem.config.cjs         # remove from PM2 list
//   pm2 logs admin-agent                    # tail logs
//   pm2 monit                               # live CPU / memory dashboard
//
// Log rotation (install once per machine):
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 20M
//   pm2 set pm2-logrotate:retain 7
// =============================================================================

// Load the operator key from .env (gitignored). NEVER hard-code keys here —
// this file is committed, and a published repo gets the key revoked by
// secret scanning within minutes (happened 2026-05-28).
require("dotenv").config();

module.exports = {
  apps: [
    {
      name:   "admin-agent",
      script: "npm",
      args:   "start",

      // ── Process behaviour ────────────────────────────────────────────────
      autorestart:  true,       // restart on crash (default true — explicit for clarity)
      watch:        false,      // don't file-watch in production; restarts are manual
      kill_timeout: 8000,       // ms to wait for graceful shutdown before SIGKILL
      listen_timeout: 15000,    // ms to wait for "online" signal after spawn

      // ── Restart policy — prevent infinite crash loops ─────────────────────
      // exp_backoff_restart_delay: exponential backoff between restarts (100ms base)
      // max_restarts:              give up after N restarts within min_uptime window
      // min_uptime:                process must stay alive this long to reset counter
      exp_backoff_restart_delay: 100,
      max_restarts:   10,
      min_uptime:     "30s",

      // ── Memory guard ─────────────────────────────────────────────────────
      // Restart if RSS exceeds this limit (catches slow memory leaks in
      // long-running agentic sessions).
      max_memory_restart: "512M",

      // ── Logs ─────────────────────────────────────────────────────────────
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file:      "./data/logs/pm2-error.log",
      out_file:        "./data/logs/pm2-out.log",
      merge_logs:      false,   // keep stdout and stderr in separate files

      // ── Environment ──────────────────────────────────────────────────────
      // Operator API key comes from .env (loaded by dotenv above). The key is
      // never exposed to end-users; only hasDefaultKey:true is sent to the UI.
      env: {
        NODE_ENV: "production",
        VOUZA_API_KEY:      process.env.VOUZA_API_KEY      || "",
        VOUZA_API_PROVIDER: process.env.VOUZA_API_PROVIDER || "openrouter",
        VOUZA_API_MODEL:    process.env.VOUZA_API_MODEL    || "google/gemini-2.5-flash-lite",
        VOUZA_BRAND_NAME:   process.env.VOUZA_BRAND_NAME   || "Vouza",
      },
    },
  ],
};
