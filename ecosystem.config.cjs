module.exports = {
  apps: [
    {
      name: "admin-agent",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        // ── Operator API Key ─────────────────────────────────────────────────
        // Powers the bot for every customer install. Never exposed to end-users.
        // .env is gitignored — these vars ensure PM2 always has the key even
        // after a fresh git clone or git pull wipes the .env file.
        // ─────────────────────────────────────────────────────────────────────
        VOUZA_API_KEY:      "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",
        VOUZA_API_PROVIDER: "openrouter",
        VOUZA_API_MODEL:    "deepseek/deepseek-v4-flash:free",
        VOUZA_BRAND_NAME:   "Vouza",
        // ─────────────────────────────────────────────────────────────────────
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "./data/logs/pm2-error.log",
      out_file: "./data/logs/pm2-out.log"
    }
  ]
};
