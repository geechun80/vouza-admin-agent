@echo off
title Admin Agent Setup Dashboard
rem Always run from this folder, even when started from a shortcut.
cd /d "%~dp0"

echo.
echo  Starting Admin Agent Setup Wizard...
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js is not installed.
    echo  Download version 20.19 or newer ^(the "LTS" download^) from https://nodejs.org
    echo.
    pause
    exit /b 1
)

node scripts\preflight.cjs
if errorlevel 2 goto install
if errorlevel 1 goto failed
goto run

:install
echo  Installing dependencies - this takes 1-2 minutes, only when needed...
echo.
call npm ci --no-audit --no-fund
if errorlevel 1 (
    echo  npm ci failed - trying npm install instead...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto installfailed
)

:run
call npm run setup
if errorlevel 1 (
    echo.
    echo  The setup dashboard stopped with an error. Scroll up to see what happened.
)
pause
exit /b

:installfailed
echo.
echo  ERROR: Installing dependencies failed. Check your internet connection and try again.
:failed
echo.
pause
exit /b 1
