// =============================================================================
// Dashboard Launcher — Quick start for the setup wizard
// Run with: npm run setup
// =============================================================================

// Load .env first — makes VOUZA_API_KEY and other operator secrets available.
// .env is gitignored so keys never get committed to version control.
import { config as loadEnv } from "dotenv";
loadEnv();

import { startDashboard } from "./api/server.js";

const port = parseInt(process.env.DASHBOARD_PORT || "3456", 10);

console.log("\n  🤖 Admin Agent — Setup Wizard\n");
console.log("  Starting setup dashboard...\n");

startDashboard(port);
