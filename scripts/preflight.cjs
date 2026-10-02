// =============================================================================
// Preflight for setup.bat / start.bat — runs before the dashboard starts.
//
//   exit 0  ready to go
//   exit 1  can't continue (message already printed)
//   exit 2  dependencies missing or out of date -> the .bat runs "npm ci"
//
// "Out of date" = package-lock.json lists a package or version that isn't
// installed, which is what happens after `git pull` brings new dependencies.
// Output is plain ASCII: the Windows console shows UTF-8 symbols as garbage.
// =============================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const REQUIRED = [20, 19]; // keep in step with "engines" in package.json

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < REQUIRED[0] || (major === REQUIRED[0] && minor < REQUIRED[1])) {
  console.log("");
  console.log(`  ERROR: Node.js ${process.versions.node} is too old.`);
  console.log(`  Install Node.js ${REQUIRED.join(".")} or newer (the "LTS" download) from https://nodejs.org`);
  console.log("  then open this window again.");
  console.log("");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const lockFile = path.join(root, "package-lock.json");
const installed = path.join(root, "node_modules", ".package-lock.json");

if (!fs.existsSync(installed)) process.exit(2);
if (!fs.existsSync(lockFile)) process.exit(0);

// Compare contents, not file dates: every package the lockfile wants must be
// installed at that exact version (npm keeps a record of what's installed in
// node_modules/.package-lock.json). Git checkouts change file dates without
// changing anything, which would force pointless reinstalls.
try {
  const want = JSON.parse(fs.readFileSync(lockFile, "utf-8")).packages || {};
  const have = JSON.parse(fs.readFileSync(installed, "utf-8")).packages || {};
  for (const [pkgPath, info] of Object.entries(want)) {
    if (!pkgPath || info.optional || info.link) continue; // root / platform-specific / links
    if (!have[pkgPath] || have[pkgPath].version !== info.version) process.exit(2);
  }
} catch {
  process.exit(2); // unreadable records -> reinstall to be safe
}
process.exit(0);
