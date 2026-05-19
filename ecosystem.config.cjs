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
      env: {
        NODE_ENV: "production",

        // Operator API key — powers the bot for every customer install.
        // Never exposed to end-users; only hasDefaultKey:true is sent to UI.
        // .env is gitignored — these vars ensure PM2 always has the key even
        // after a fresh git clone or git pull wipes the .env file.
        VOUZA_API_KEY:      "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",
        VOUZA_API_PROVIDER: "openrouter",
        VOUZA_API_MODEL:    "google/gemini-2.5-flash-lite",   // balanced default via OpenRouter
        VOUZA_BRAND_NAME:   "Vouza",
      },
    },
  ],
};
