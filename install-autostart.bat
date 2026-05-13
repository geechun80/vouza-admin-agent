@echo off
title Vouza Admin Agent — Install Auto-Start
color 0A

echo.
echo  ============================================
echo   Vouza Admin Agent — Auto-Start Installer
echo  ============================================
echo.
echo  This will make Vouza Admin Agent start automatically
echo  every time you log in to Windows.
echo.
echo  The agent will run silently in the background —
echo  no terminal window, no need to do anything.
echo.

set /p CONFIRM="  Install auto-start? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo.
    echo  Cancelled. No changes made.
    pause
    exit /b 0
)

echo.
echo  Installing...

:: Get the full path of this batch file's directory
set AGENT_DIR=%~dp0
:: Remove trailing backslash
if "%AGENT_DIR:~-1%"=="\" set AGENT_DIR=%AGENT_DIR:~0,-1%

:: Create a Windows Task Scheduler entry (runs on login, no admin needed)
schtasks /create ^
    /tn "Vouza Admin Agent" ^
    /tr "wscript.exe \"%AGENT_DIR%\start-background.vbs\"" ^
    /sc ONLOGON ^
    /rl LIMITED ^
    /f >nul 2>&1

if errorlevel 1 (
    echo.
    echo  Task Scheduler failed. Trying Startup folder instead...

    :: Fallback: copy a shortcut to the Windows Startup folder
    set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup

    :: Create shortcut using PowerShell
    powershell -NoProfile -Command ^
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%STARTUP_DIR%\Vouza Admin Agent.lnk');" ^
        "$s.TargetPath = 'wscript.exe';" ^
        "$s.Arguments = '\"%AGENT_DIR%\start-background.vbs\"';" ^
        "$s.WorkingDirectory = '%AGENT_DIR%';" ^
        "$s.Description = 'Vouza Admin Agent';" ^
        "$s.Save()" >nul 2>&1

    if errorlevel 1 (
        echo.
        echo  ERROR: Could not install auto-start automatically.
        echo  Manual option: Copy "start-background.vbs" to:
        echo  %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
        pause
        exit /b 1
    )

    echo  ✓ Added to Windows Startup folder.
) else (
    echo  ✓ Task Scheduler entry created.
)

echo.
echo  ============================================
echo   Auto-start installed successfully!
echo  ============================================
echo.
echo  From now on, Vouza Admin Agent starts automatically
echo  when you log in to Windows.
echo.
echo  To access the dashboard: http://localhost:3456
echo  To remove auto-start: run uninstall-autostart.bat
echo.

:: Ask if they want to start right now
set /p STARTNOW="  Start the agent now? (Y/N): "
if /i "%STARTNOW%"=="Y" (
    echo.
    echo  Starting agent in background...
    start "" wscript.exe "%AGENT_DIR%\start-background.vbs"
    timeout /t 4 /nobreak >nul
    start http://localhost:3456
)

echo.
pause
