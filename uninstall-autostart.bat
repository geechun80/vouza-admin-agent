@echo off
title Vouza Admin Agent — Remove Auto-Start
color 0E

echo.
echo  Removing Vouza Admin Agent from Windows auto-start...
echo.

:: Remove Task Scheduler entry
schtasks /delete /tn "Vouza Admin Agent" /f >nul 2>&1

:: Remove Startup folder shortcut
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
if exist "%STARTUP_DIR%\Vouza Admin Agent.lnk" (
    del "%STARTUP_DIR%\Vouza Admin Agent.lnk" >nul 2>&1
)

echo  ✓ Auto-start removed. The agent will no longer start automatically.
echo.
pause
