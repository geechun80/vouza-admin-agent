module.exports = {
  apps: [
    {
      name: "admin-agent",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: "./data/logs/pm2-error.log",
      out_file: "./data/logs/pm2-out.log"
    }
  ]
};
