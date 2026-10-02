// =============================================================================
// Dashboard Launcher — Quick start for the setup wizard
// Run with: npm run setup
// =============================================================================

// Load .env first — makes VOUZA_API_KEY and other operator secrets available.
// .env is gitignored so keys never get committed to version control.
import { config as loadEnv } from "dotenv";
loadEnv();

import { startDashboard } from "./api/server.js";

// Keep the agent running through a stray error (a network blip in a
// background task, a library bug) instead of the whole window closing — the
// person would have to notice and restart it. The error is logged.
process.on("uncaughtException", (err) => {
  console.error("\n  [Unexpected error — the agent keeps running]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("\n  [Unhandled promise rejection — the agent keeps running]", reason);
});

const port = parseInt(process.env.DASHBOARD_PORT || "3456", 10);

console.log("\n  🤖 Admin Agent — Setup Wizard\n");
console.log("  Starting setup dashboard...\n");

startDashboard(port);
