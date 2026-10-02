# =============================================================================
# Vouza Admin Agent - uninstaller (Windows). Started by uninstall.bat.
#
# Removes this copy of the Admin Agent completely:
#   1. optional: copies your settings (the data folder, .env) to the Desktop
#   2. asks you to type YES - nothing is changed before that
#   3. stops the agent if it is running (only processes from THIS folder)
#   4. removes auto-start (Task Scheduler, Startup shortcut), the Desktop
#      shortcut and the PM2 entry - only the ones that point at THIS folder
#   5. deletes this folder, including this script, from a temporary helper
#
# Never touches Node.js, Ollama, or another copy of the agent elsewhere.
# Exit codes: 0 cancelled / nothing to do, 1 refused, 10 deletion scheduled.
# Plain ASCII on purpose: Windows consoles garble UTF-8 symbols.
# =============================================================================

# 'Continue': in Windows PowerShell 5.1 a native tool writing to stderr (e.g.
# schtasks: "task not found") would otherwise abort the script. Steps that
# must not fail silently use -ErrorAction Stop inside try/catch.
$ErrorActionPreference = 'Continue'
$AppDir   = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$AppLower = $AppDir.ToLowerInvariant()
$Name     = 'Vouza Admin Agent'

function Say([string]$Text, [string]$Color = 'Gray') { Write-Host "  $Text" -ForegroundColor $Color }
function Refuse([string]$Why) { Write-Host ''; Say $Why 'Red'; Say 'Nothing was changed.' 'Red'; exit 1 }
function PointsHere([string]$Text) { return ($Text -and $Text.ToLowerInvariant().Contains($AppLower)) }

# ---------------------------------------------------------------------------
# Safety: only ever delete a real Admin Agent folder
# ---------------------------------------------------------------------------
$pkgFile = Join-Path $AppDir 'package.json'
if (-not (Test-Path $pkgFile) -or -not (Test-Path (Join-Path $AppDir 'start.bat'))) {
  Refuse "This doesn't look like an Admin Agent folder: $AppDir"
}
try { $pkg = Get-Content $pkgFile -Raw | ConvertFrom-Json } catch { Refuse "Couldn't read $pkgFile" }
if ($pkg.name -ne 'admin-agent') { Refuse "This doesn't look like an Admin Agent folder: $AppDir" }

$forbidden = @(
  [IO.Path]::GetPathRoot($AppDir).TrimEnd('\'),
  $env:USERPROFILE,
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('MyDocuments'),
  $env:WINDIR,
  $env:ProgramFiles
) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\').ToLowerInvariant() }
if ($forbidden -contains $AppLower) { Refuse "Refusing to delete $AppDir - it is a system or personal folder." }

Write-Host ''
Write-Host '  ============================================' -ForegroundColor Cyan
Write-Host '   Uninstall Vouza Admin Agent'                 -ForegroundColor Cyan
Write-Host '  ============================================' -ForegroundColor Cyan
Write-Host ''
Say "This removes the Admin Agent in: $AppDir"
Say '- stops it if it is running'
Say '- removes auto-start, the Desktop shortcut and the PM2 entry (for this copy)'
Say '- deletes the folder, including your settings, chats, memories and WhatsApp login'
Say 'Node.js and Ollama are NOT removed.'
Write-Host ''

# ---------------------------------------------------------------------------
# 1. Optional copy of the settings
# ---------------------------------------------------------------------------
$dataDir = Join-Path $AppDir 'data'
if (Test-Path $dataDir) {
  $keep = Read-Host '  Keep a copy of your settings on your Desktop first? (Y/N)'
  if ($keep -match '^\s*[Yy]') {
    $stamp = Get-Date -Format 'yyyy-MM-dd HHmm'
    $dest  = Join-Path ([Environment]::GetFolderPath('Desktop')) "$Name backup $stamp"
    try {
      New-Item -ItemType Directory -Path $dest -Force -ErrorAction Stop | Out-Null
      Copy-Item -Path $dataDir -Destination (Join-Path $dest 'data') -Recurse -Force -ErrorAction Stop
      $envFile = Join-Path $AppDir '.env'
      if (Test-Path $envFile) { Copy-Item $envFile (Join-Path $dest '.env') -Force -ErrorAction Stop }
    } catch {
      Refuse "Couldn't save the copy of your settings ($($_.Exception.Message))."
    }
    @(
      'Vouza Admin Agent - settings backup',
      '',
      'To restore: install the Admin Agent again, then copy this "data" folder',
      '(and .env, if present) into the new folder BEFORE starting it.',
      '',
      'Works only on this computer, for this Windows user: saved keys and',
      'passwords are encrypted for it. For another computer, use',
      'System Health -> Download backup in the dashboard instead.'
    ) | Set-Content -Path (Join-Path $dest 'HOW TO RESTORE.txt') -Encoding ASCII
    Say "Saved a copy to: $dest" 'Green'
    Write-Host ''
  }
}

# ---------------------------------------------------------------------------
# 2. Confirm
# ---------------------------------------------------------------------------
$answer = Read-Host '  Type YES (capital letters) to delete the Admin Agent completely'
if ($answer -cne 'YES') {
  Write-Host ''
  Say 'Cancelled. Nothing was deleted.' 'Yellow'
  exit 0
}
Write-Host ''

# ---------------------------------------------------------------------------
# 3. Stop the agent (only processes started from this folder)
# ---------------------------------------------------------------------------
$self = $PID
$procs = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $self -and
  @('node.exe', 'cmd.exe', 'wscript.exe', 'cscript.exe') -contains $_.Name.ToLowerInvariant() -and
  (PointsHere $_.CommandLine) -and
  -not $_.CommandLine.ToLowerInvariant().Contains('uninstall.bat') -and
  -not $_.CommandLine.ToLowerInvariant().Contains('uninstall.ps1')
}
foreach ($p in $procs) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Say "Stopped $($p.Name) (PID $($p.ProcessId))" } catch { }
}
if (-not $procs) { Say 'The agent was not running.' }

# PM2 (only if installed and it knows this app)
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
  try {
    $list = (& pm2 jlist 2>$null) | Out-String
    if (PointsHere $list) {
      & pm2 delete admin-agent 2>$null | Out-Null
      & pm2 save 2>$null | Out-Null
      Say 'Removed it from PM2.'
    }
  } catch { }
}

# ---------------------------------------------------------------------------
# 4. Auto-start and shortcuts that point at this folder
# ---------------------------------------------------------------------------
$taskXml = (& schtasks.exe /query /tn $Name /xml 2>$null) | Out-String
if ($LASTEXITCODE -eq 0 -and $taskXml) {
  if (PointsHere $taskXml) {
    & schtasks.exe /delete /tn $Name /f 2>$null | Out-Null
    Say 'Removed auto-start (Task Scheduler).'
  } else {
    Say 'Kept the auto-start task: it belongs to another copy of the agent.' 'Yellow'
  }
}

$shell = New-Object -ComObject WScript.Shell
$links = @(
  (Join-Path ([Environment]::GetFolderPath('Startup')) "$Name.lnk"),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) "$Name.lnk")
)
foreach ($lnk in $links) {
  if (Test-Path $lnk) {
    $sc = $shell.CreateShortcut($lnk)
    if ((PointsHere $sc.TargetPath) -or (PointsHere $sc.Arguments) -or (PointsHere $sc.WorkingDirectory)) {
      Remove-Item $lnk -Force -ErrorAction SilentlyContinue
      Say "Removed shortcut: $lnk"
    }
  }
}

# ---------------------------------------------------------------------------
# 5. Delete the folder from a temporary helper (a running script can't
#    delete its own folder). The helper retries while Windows releases files.
# ---------------------------------------------------------------------------
$helper = Join-Path $env:TEMP ("vouza-uninstall-" + [guid]::NewGuid().ToString('N') + '.cmd')
# One template with the folder filled in (in PowerShell a comma list binds
# before "+", so building lines by concatenation inside @() splits them).
# Waits use ping: timeout.exe fails without an interactive console.
$helperText = @"
@echo off
title Removing Vouza Admin Agent
ping -n 4 127.0.0.1 >nul
for /l %%i in (1,1,10) do if exist "$AppDir" (rd /s /q "$AppDir" >nul 2>&1 & if exist "$AppDir" ping -n 3 127.0.0.1 >nul)
if exist "$AppDir" (
  echo.
  echo  Some files could not be deleted - another program may be using them.
  echo  Close it, or restart Windows, then delete this folder by hand:
  echo  $AppDir
  echo.
  pause
) else (
  echo.
  echo  Vouza Admin Agent has been removed.
  ping -n 6 127.0.0.1 >nul
)
(goto) 2>nul & del "%~f0"
"@
Set-Content -Path $helper -Value $helperText -Encoding ASCII

Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$helper`"" -WorkingDirectory $env:TEMP
Write-Host ''
Say 'Deleting the folder now - this window will close.' 'Green'
exit 10
