// =============================================================================
// Dashboard Launcher — Quick start for the setup wizard
// Run with: npm run setup
// =============================================================================

import { startDashboard } from "./api/server.js";

const port = parseInt(process.env.DASHBOARD_PORT || "3456", 10);

console.log("\n  🤖 Admin Agent — Setup Wizard\n");
console.log("  Starting setup dashboard...\n");

startDashboard(port);
