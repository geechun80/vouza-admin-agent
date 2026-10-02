@echo off
title Uninstall Vouza Admin Agent
rem Removes this copy of the Admin Agent completely (asks first).
rem The work is done by scripts\uninstall.ps1.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall.ps1"
set RESULT=%errorlevel%
rem Leave the folder so it can be deleted.
cd /d "%TEMP%"
if "%RESULT%"=="10" exit
echo.
pause
