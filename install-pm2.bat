@echo off
title Vouza Admin Agent — PM2 Installer (Windows)
color 0A
setlocal enabledelayedexpansion

echo.
echo  ==================================================
echo   Vouza Admin Agent — PM2 Process Manager Installer
echo  ==================================================
echo.
echo  This installs PM2, a tool that keeps Vouza running
echo  24/7 in the background with:
echo.
echo    - Automatic restart if the agent crashes
echo    - Live log streaming you can grep / search
echo    - Memory + CPU monitoring (pm2 monit)
echo    - Auto-start on reboot
echo.

:: --- Step 1: Check Node.js ----------------------------------------------
echo  Step 1/5 — Checking Node.js installation...
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  X Node.js is not installed.
    echo.
    echo  Please install Node.js 18 or newer from:
    echo    https://nodejs.org/en/download
    echo.
    echo  Then re-run this installer.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo    OK — Node !NODE_VER! detected

:: --- Step 2: Check npm --------------------------------------------------
echo.
echo  Step 2/5 — Checking npm...
where npm >nul 2>&1
if errorlevel 1 (
    echo.
    echo  X npm is missing — your Node.js install is broken.
    echo  Re-install Node.js from https://nodejs.org
    pause
    exit /b 1
)
echo    OK — npm available

:: --- Step 3: Check if PM2 already installed -----------------------------
echo.
echo  Step 3/5 — Checking for existing PM2 install...
where pm2 >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('pm2 --version 2^>nul') do set PM2_VER=%%v
    echo    OK — PM2 !PM2_VER! already installed
    goto :start_agent
)

:: --- Step 4: Install PM2 ------------------------------------------------
echo    Not installed — installing now...
echo.
echo  Step 4/5 — Installing PM2 globally (this may take 30-60 seconds)...
call npm install -g pm2
if errorlevel 1 (
    echo.
    echo  X PM2 install failed.
    echo.
    echo  Common causes:
    echo    - npm permission issue: try running this script "As Administrator"
    echo      (Right-click install-pm2.bat then "Run as administrator")
    echo    - Antivirus blocking npm: temporarily disable and retry
    echo    - Corporate proxy: configure npm proxy first
    echo      ^( npm config set proxy http://your.proxy:8080 ^)
    echo.
    pause
    exit /b 1
)
echo    OK — PM2 installed

:start_agent
:: --- Step 5: Start the agent under PM2 ----------------------------------
echo.
echo  Step 5/5 — Starting Vouza Admin Agent under PM2...

:: Make sure dist/ exists (the agent must be built first)
if not exist dist\index.js (
    echo.
    echo  ! dist/index.js not found — building project first...
    call npm run build
    if errorlevel 1 (
        echo.
        echo  X Build failed. Check the error above and re-run.
        pause
        exit /b 1
    )
)

:: Stop any previous instance to avoid double-launch
pm2 stop admin-agent >nul 2>&1
pm2 delete admin-agent >nul 2>&1

:: Start the agent
call pm2 start ecosystem.config.cjs
if errorlevel 1 (
    echo.
    echo  X PM2 failed to start the agent.
    echo  Check the logs above for the actual error.
    pause
    exit /b 1
)

:: Save the running process list so it survives reboot
call pm2 save >nul 2>&1

echo.
echo  ==================================================
echo   PM2 installed and Vouza Admin Agent is running!
echo  ==================================================
echo.
echo  Useful commands:
echo.
echo    pm2 list                  Show running agents
echo    pm2 logs admin-agent      Tail live logs
echo    pm2 logs admin-agent --lines 50    Last 50 log lines
echo    pm2 monit                 Live CPU + memory monitor
echo    pm2 restart admin-agent   Restart after code changes
echo    pm2 stop admin-agent      Stop the agent
echo.
echo  Open the dashboard at: http://localhost:3456
echo.

:: --- Auto-start on Windows boot (optional) ------------------------------
echo  Windows note: PM2's built-in "pm2 startup" does NOT work on Windows.
echo  To keep the agent running across reboots, use one of these:
echo.
echo    Option A ^(recommended^): run install-autostart.bat — uses Windows
echo               Task Scheduler ^(no PM2 needed at boot time^)
echo.
echo    Option B: install pm2-windows-startup package:
echo               npm install -g pm2-windows-startup
echo               pm2-startup install
echo.
echo  See README.md "Running in the background" for full details.
echo.

:: Offer to open dashboard
set /p OPEN_DASH="  Open dashboard now? (Y/N): "
if /i "!OPEN_DASH!"=="Y" (
    start "" http://localhost:3456
)

echo.
pause
exit /b 0
