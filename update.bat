@echo off
title Vouza Admin Agent - Update
color 0A
setlocal

echo.
echo  ==================================================
echo   Vouza Admin Agent - Update to Latest Version
echo  ==================================================
echo.
echo  This will:
echo    1. Pull the latest code from GitHub
echo    2. Update dependencies (npm ci - exact versions)
echo    3. Rebuild the project
echo    4. Restart the agent under PM2 (if installed)
echo.
echo  Your data/ folder (config, conversations, memories,
echo  WhatsApp auth) is NEVER touched by this update.
echo.

set /p CONFIRM="  Update now? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo  Cancelled. Nothing changed.
    pause
    exit /b 0
)

:: Use the directory this batch file lives in — works no matter where the
:: user double-clicks from. Strip trailing backslash for cleaner paths.
set AGENT_DIR=%~dp0
if "%AGENT_DIR:~-1%"=="\" set AGENT_DIR=%AGENT_DIR:~0,-1%

cd /d "%AGENT_DIR%"
echo.
echo  [1/4] Pulling latest from GitHub...
git pull
if errorlevel 1 (
    echo.
    echo  X git pull failed. If you have local changes, commit or stash them first:
    echo      git status
    echo      git stash
    pause
    exit /b 1
)

echo.
echo  [2/4] Updating dependencies (npm ci)...
call npm ci
if errorlevel 1 (
    echo.
    echo  X npm ci failed. Common causes:
    echo    - No internet connection
    echo    - Corporate proxy not configured (npm config set proxy ...)
    echo    - Antivirus blocking npm (temporarily disable Windows Defender)
    pause
    exit /b 1
)

echo.
echo  [3/4] Building...
call npm run build
if errorlevel 1 (
    echo.
    echo  X Build failed. See the TypeScript errors above.
    pause
    exit /b 1
)

echo.
echo  [4/4] Restarting the agent...
where pm2 >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ! PM2 is not installed — skipping auto-restart.
    echo    If you're running the agent manually, close it and re-run start.bat
    echo    To install PM2: run install-pm2.bat
) else (
    call pm2 restart admin-agent
    if errorlevel 1 (
        echo.
        echo  ! PM2 restart failed — the agent may not have been running.
        echo    To start fresh: pm2 start ecosystem.config.cjs
    ) else (
        echo    OK - agent restarted
    )
)

echo.
echo  ==================================================
echo   Update complete!
echo  ==================================================
echo.
echo  Open the dashboard at: http://localhost:3456
echo  Tail the logs:         pm2 logs admin-agent
echo  Check what's new:      the dashboard will pop up
echo                         a "What's new" modal automatically.
echo.

set /p OPEN_DASH="  Open dashboard now? (Y/N): "
if /i "%OPEN_DASH%"=="Y" start "" http://localhost:3456

echo.
pause
exit /b 0
