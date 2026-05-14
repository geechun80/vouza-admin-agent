module.exports = {
  apps: [
    {
      name: "admin-agent",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        // ── Operator API Key ────────────────────────────────────────────────
        // Powers the bot for customers who haven't added their own key yet.
        // Fill in your Vouza/OpenRouter key to enable. Never exposed to users.
        // Uncomment and fill the lines below to activate:
        // VOUZA_API_KEY:      "sk-or-v1-yourKeyHere",
        // VOUZA_API_PROVIDER: "openrouter",
        // VOUZA_API_MODEL:    "meta-llama/llama-3.1-8b-instruct:free",
        // VOUZA_BRAND_NAME:   "Vouza",
        // ───────────────────────────────────────────────────────────────────
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "./data/logs/pm2-error.log",
      out_file: "./data/logs/pm2-out.log"
    }
  ]
};
