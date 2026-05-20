#!/usr/bin/env bash
# =============================================================================
# Vouza Admin Agent — PM2 Process Manager Installer (Mac / Linux)
#
# Installs PM2 globally, starts the agent, and configures auto-start on boot.
#
# Usage:  ./install-pm2.sh
# =============================================================================

set -euo pipefail

# --- ANSI colors ------------------------------------------------------------
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
NC=$'\033[0m'   # No Color

print_header() {
    echo
    echo "${CYAN}==================================================${NC}"
    echo "${CYAN} Vouza Admin Agent — PM2 Installer${NC}"
    echo "${CYAN}==================================================${NC}"
    echo
}

abort() {
    echo
    echo "${RED}✗ $1${NC}"
    echo
    exit 1
}

print_header

# --- Step 1: Check Node.js --------------------------------------------------
echo "${CYAN}Step 1/5 — Checking Node.js installation...${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo
    echo "${RED}✗ Node.js is not installed.${NC}"
    echo
    echo "Install Node.js 18 or newer:"
    echo "  macOS:   brew install node"
    echo "  Linux:   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "           sudo apt-get install -y nodejs"
    echo "  Or download from: https://nodejs.org/en/download"
    echo
    exit 1
fi
NODE_VER="$(node --version)"
echo "  ${GREEN}✓${NC} Node ${NODE_VER} detected"

# --- Step 2: Check npm ------------------------------------------------------
echo
echo "${CYAN}Step 2/5 — Checking npm...${NC}"
if ! command -v npm >/dev/null 2>&1; then
    abort "npm is missing — your Node.js install is broken. Re-install Node."
fi
echo "  ${GREEN}✓${NC} npm available"

# --- Step 3: Check if PM2 already installed --------------------------------
echo
echo "${CYAN}Step 3/5 — Checking for existing PM2 install...${NC}"
if command -v pm2 >/dev/null 2>&1; then
    PM2_VER="$(pm2 --version 2>/dev/null || echo unknown)"
    echo "  ${GREEN}✓${NC} PM2 ${PM2_VER} already installed — skipping install step"
else
    echo "  Not installed — installing now..."
    echo
    echo "${CYAN}Step 4/5 — Installing PM2 globally...${NC}"

    # On macOS/Linux without sudo for global npm install, this often fails with
    # EACCES. Detect and offer the right path.
    if npm install -g pm2 2>/tmp/pm2-install.log; then
        echo "  ${GREEN}✓${NC} PM2 installed"
    else
        # Common case: needs sudo
        if grep -q "EACCES" /tmp/pm2-install.log 2>/dev/null; then
            echo
            echo "${YELLOW}⚠ Permission denied — retrying with sudo...${NC}"
            if sudo npm install -g pm2; then
                echo "  ${GREEN}✓${NC} PM2 installed (via sudo)"
            else
                echo
                echo "${RED}✗ PM2 install failed even with sudo.${NC}"
                echo "  See /tmp/pm2-install.log for the npm output."
                exit 1
            fi
        else
            echo
            echo "${RED}✗ PM2 install failed:${NC}"
            cat /tmp/pm2-install.log
            exit 1
        fi
    fi
fi

# --- Step 5: Start agent under PM2 ------------------------------------------
echo
echo "${CYAN}Step 5/5 — Starting Vouza Admin Agent under PM2...${NC}"

# Make sure the project is built
if [ ! -f "dist/index.js" ]; then
    echo "  ${YELLOW}!${NC} dist/index.js not found — building project first..."
    npm run build
fi

# Stop any previous instance to avoid double-launch
pm2 stop admin-agent >/dev/null 2>&1 || true
pm2 delete admin-agent >/dev/null 2>&1 || true

# Start the agent
pm2 start ecosystem.config.cjs

# Persist the running process list so it survives reboot
pm2 save

# --- Auto-start on boot (Mac/Linux) -----------------------------------------
echo
echo "${CYAN}Configuring auto-start on boot...${NC}"
echo "  Running 'pm2 startup' — you'll see a command to copy-paste with sudo."
echo

# pm2 startup prints a sudo command the user must run themselves.
# Capture and offer to run it for them.
STARTUP_OUTPUT="$(pm2 startup 2>&1 || true)"
echo "$STARTUP_OUTPUT"

# Try to extract the suggested sudo line
SUGGESTED_CMD="$(echo "$STARTUP_OUTPUT" | grep -E '^sudo ' | head -1 || true)"
if [ -n "$SUGGESTED_CMD" ]; then
    echo
    echo "${YELLOW}To enable auto-start on boot, run:${NC}"
    echo "  $SUGGESTED_CMD"
    echo
    read -p "Run this now? (y/N): " RUN_STARTUP
    if [[ "$RUN_STARTUP" =~ ^[Yy]$ ]]; then
        eval "$SUGGESTED_CMD"
        echo "  ${GREEN}✓${NC} Auto-start configured"
    fi
fi

# --- Done -------------------------------------------------------------------
echo
echo "${CYAN}==================================================${NC}"
echo "${GREEN} PM2 installed and Vouza Admin Agent is running!${NC}"
echo "${CYAN}==================================================${NC}"
echo
echo "Useful commands:"
echo "  pm2 list                       Show running agents"
echo "  pm2 logs admin-agent           Tail live logs"
echo "  pm2 logs admin-agent --lines 50    Last 50 log lines"
echo "  pm2 monit                      Live CPU + memory monitor"
echo "  pm2 restart admin-agent        Restart after code changes"
echo "  pm2 stop admin-agent           Stop the agent"
echo
echo "Open the dashboard at: ${CYAN}http://localhost:3456${NC}"
echo
