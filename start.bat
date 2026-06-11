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

:: ── Operator API Key — loaded from .env (gitignored) ─────────────────────────
:: NEVER hard-code a key in this file. start.bat is committed to git; a
:: published repo gets the key revoked by secret scanning within minutes
:: (this happened on 2026-05-28 and broke every install using the shared key).
:: The app loads .env itself via dotenv. If .env is missing we create a
:: template and continue — users can still enter their own key in the wizard.
:: ─────────────────────────────────────────────────────────────────────────────
if not exist .env (
    echo  No .env found — creating a template...
    (
        echo # Vouza Admin Agent environment — do NOT commit this file
        echo # Operator key ^(optional^): powers the Guide Bot before users add their own key.
        echo # Get one at https://openrouter.ai/keys then fill in below.
        echo VOUZA_API_KEY=
        echo VOUZA_API_PROVIDER=openrouter
        echo VOUZA_API_MODEL=google/gemini-2.5-flash-lite
        echo VOUZA_BRAND_NAME=Vouza
    ) > .env
    echo  .env template created. Add your operator key to it if you have one.
    echo  Users can always paste their own AI key in the setup wizard instead.
    echo.
)
:: ─────────────────────────────────────────────────────────────────────────────

:: Open browser after 3 seconds (gives server time to start)
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3456"

:: Start the dashboard server (this keeps the agent alive)
call npm run setup
