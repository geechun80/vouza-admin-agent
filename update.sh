#!/usr/bin/env bash
# =============================================================================
# Vouza Admin Agent — Update to Latest Version (Mac / Linux)
#
# Pulls latest code, runs npm ci, rebuilds, and restarts the agent under PM2.
# Idempotent and safe to re-run. Does NOT touch the data/ folder.
#
# Usage:  ./update.sh
# =============================================================================

set -euo pipefail

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'

echo
echo "${CYAN}==================================================${NC}"
echo "${CYAN} Vouza Admin Agent — Update to Latest Version${NC}"
echo "${CYAN}==================================================${NC}"
echo
echo "This will:"
echo "  1. Pull the latest code from GitHub"
echo "  2. Update dependencies (npm ci - exact versions)"
echo "  3. Rebuild the project"
echo "  4. Restart the agent under PM2 (if installed)"
echo
echo "Your data/ folder is NEVER touched."
echo

read -p "Update now? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

# Change to the script's own directory so `./update.sh` works from anywhere
cd "$(dirname "$0")"

echo
echo "${CYAN}[1/4] Pulling latest from GitHub...${NC}"
if ! git pull; then
  echo "${RED}✗ git pull failed.${NC} If you have local changes, run:"
  echo "  git status"
  echo "  git stash"
  exit 1
fi

echo
echo "${CYAN}[2/4] Updating dependencies (npm ci)...${NC}"
if ! npm ci; then
  echo "${RED}✗ npm ci failed.${NC} Check your internet connection or npm proxy settings."
  exit 1
fi

echo
echo "${CYAN}[3/4] Building...${NC}"
if ! npm run build; then
  echo "${RED}✗ Build failed.${NC} See the TypeScript errors above."
  exit 1
fi

echo
echo "${CYAN}[4/4] Restarting the agent...${NC}"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 restart admin-agent; then
    echo "  ${GREEN}✓${NC} Agent restarted via PM2"
  else
    echo "  ${YELLOW}!${NC} PM2 restart failed — the agent may not have been running."
    echo "    To start fresh: pm2 start ecosystem.config.cjs"
  fi
else
  echo "  ${YELLOW}!${NC} PM2 is not installed — skipping auto-restart."
  echo "    If running manually, close the agent and re-run: npm run setup"
  echo "    To install PM2: ./install-pm2.sh"
fi

echo
echo "${CYAN}==================================================${NC}"
echo "${GREEN} Update complete!${NC}"
echo "${CYAN}==================================================${NC}"
echo
echo "Dashboard:  ${CYAN}http://localhost:3456${NC}"
echo "Tail logs:  ${CYAN}pm2 logs admin-agent${NC}"
echo "What's new: dashboard pops up a 'What's new' modal automatically"
echo
