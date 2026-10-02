@echo off
title Vouza Admin Agent
color 0B
rem Always run from this folder, even when started from a shortcut or at login.
cd /d "%~dp0"

echo.
echo  ============================================
echo   Vouza Admin Agent - Starting...
echo  ============================================
echo.

:: Check Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed.
    echo  Download version 20.19 or newer ^(the "LTS" download^) from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Node version + are dependencies installed and up to date (e.g. after git pull)?
node scripts\preflight.cjs
if errorlevel 2 goto install
if errorlevel 1 goto failed
goto ready

:install
echo  Installing dependencies - this takes 1-2 minutes, only when needed...
echo.
call npm ci --no-audit --no-fund
if errorlevel 1 (
    echo  npm ci failed - trying npm install instead...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo  ERROR: Installing dependencies failed. Check your internet connection.
        goto failed
    )
)
echo.
echo  Running security audit...
call npm audit --audit-level=high
if errorlevel 1 (
    echo.
    echo  WARNING: Security vulnerabilities found in dependencies.
    echo  Press any key to continue anyway, or close this window to cancel.
    pause
) else (
    echo  OK - no high-severity vulnerabilities found.
)
echo.

:ready
echo.
echo  Starting Vouza Admin Agent dashboard...
echo.
echo  - The dashboard will open in your browser automatically.
echo  - Keep this window MINIMIZED - do NOT close it.
echo  - Your AI runs as long as this window is open.
echo.
echo  To stop the agent: close this window.
echo  To auto-start on Windows boot: run install-autostart.bat
echo.
echo  ============================================
echo.

:: -- Operator API Key - loaded from .env (gitignored) ------------------------
:: NEVER hard-code a key in this file. start.bat is committed to git; a
:: published repo gets the key revoked by secret scanning within minutes
:: (this happened on 2026-05-28 and broke every install using the shared key).
:: The app loads .env itself via dotenv. If .env is missing we create a
:: template and continue - users can still enter their own key in the wizard.
:: ---------------------------------------------------------------------------
if not exist .env (
    echo  No .env found - creating a template...
    (
        echo # Vouza Admin Agent environment - do NOT commit this file
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

:: Open browser after 3 seconds (gives server time to start)
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3456"

:: Start the dashboard server (this keeps the agent alive)
call npm run setup
echo.
echo  The agent stopped. Scroll up to see why, then run start.bat again.
pause
exit /b

:failed
echo.
pause
exit /b 1
