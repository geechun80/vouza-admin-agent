@echo off
title Vouza Admin Agent
color 0B

echo.
echo  ============================================
echo   Vouza Admin Agent — Starting...
echo  ============================================
echo.

:: Check Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed.
    echo  Please download it from https://nodejs.org  (version 18 or higher^)
    echo.
    pause
    exit /b 1
)

:: Auto-install dependencies if missing
if not exist node_modules\ (
    echo  First run detected — installing dependencies...
    echo  This takes 1-2 minutes, only happens once.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  ERROR: npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo.
    echo  Running security audit...
    npm audit --audit-level=high 2>&1
    if errorlevel 1 (
        echo.
        echo  WARNING: Security vulnerabilities found in dependencies.
        echo  Run "npm audit fix" to attempt automatic fixes.
        echo  Press any key to continue anyway, or close this window to cancel.
        pause
    ) else (
        echo  ✓ No high-severity vulnerabilities found.
    )
    echo.
)

:: Build if dist/ is missing or outdated
if not exist dist\ (
    echo  Building agent...
    call npm run build
    if errorlevel 1 (
        echo.
        echo  ERROR: Build failed. Please contact support.
        pause
        exit /b 1
    )
)

echo.
echo  Starting Vouza Admin Agent dashboard...
echo.
echo  ► The dashboard will open in your browser automatically.
echo  ► Keep this window MINIMIZED — do NOT close it.
echo  ► Your AI runs as long as this window is open.
echo.
echo  To stop the agent: close this window.
echo  To auto-start on Windows boot: run install-autostart.bat
echo.
echo  ============================================
echo.

:: ── Operator API Key (optional) ──────────────────────────────────────────────
:: Set VOUZA_API_KEY to power the bot immediately for customers who haven't
:: configured their own key yet. The key is never exposed to end-users.
:: Remove the REM below and fill in your key to enable this feature.
::
:: REM set VOUZA_API_KEY=sk-or-v1-yourKeyHere
:: REM set VOUZA_API_PROVIDER=openrouter
:: REM set VOUZA_API_MODEL=meta-llama/llama-3.1-8b-instruct:free
:: REM set VOUZA_BRAND_NAME=Vouza
:: ─────────────────────────────────────────────────────────────────────────────

:: Open browser after 3 seconds (gives server time to start)
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3456"

:: Start the dashboard server (this keeps the agent alive)
call npm run setup
