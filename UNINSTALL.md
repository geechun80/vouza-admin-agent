# Uninstall — Vouza Admin Agent

Complete removal using **PowerShell** (do NOT use CMD).

---

## Step 1 — Open PowerShell

Press `Win + X` → click **Windows PowerShell** or **Terminal**.

---

## Step 2 — Set your folder path

Run this first. Change the path if your folder is in a different location.

```powershell
$agentPath = "C:\Users\User\vouza-admin-agent"
```

Common locations:
- `C:\Users\User\vouza-admin-agent`
- `C:\Users\YourName\Desktop\vouza-admin-agent`
- `C:\Users\YourName\Desktop\Claude Code Videos\admin-agent`

Not sure? Run `dir "$env:USERPROFILE"` or `dir "$env:USERPROFILE\Desktop"` to find it.

---

## Step 3 — Run these commands one by one

**Kill the running server (port 3456):**
```powershell
$conn = Get-NetTCPConnection -LocalPort 3456 -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }
```

**Remove Task Scheduler entry:**
```powershell
schtasks /delete /tn "Vouza Admin Agent" /f
```
> If you see `ERROR: The system cannot find the file specified` — that's fine, it just means no scheduled task was registered.

**Remove Windows Startup shortcut:**
```powershell
Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Vouza Admin Agent.lnk" -ErrorAction SilentlyContinue
```

**Remove Desktop shortcut:**
```powershell
Remove-Item "$env:USERPROFILE\Desktop\Vouza Admin Agent.lnk" -ErrorAction SilentlyContinue
```

**Delete the project folder:**
```powershell
cd .. ; Remove-Item $agentPath -Recurse -Force
```

---

## Step 4 — Confirm it's gone

```powershell
if (Test-Path $agentPath) { Write-Host "Still there — check the path" -ForegroundColor Red } else { Write-Host "Fully removed." -ForegroundColor Green }
```

You should see **Fully removed.** in green.

---

## What gets removed

| Item | Location |
|---|---|
| Project files, code, node_modules | `$agentPath` folder |
| Agent config, credentials, memories | `$agentPath\data\` (inside project) |
| Task Scheduler auto-start entry | Windows Task Scheduler |
| Windows Startup shortcut | AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup |
| Desktop shortcut | Desktop |

> **Note:** Your `.env` file (operator API key) is inside the project folder and is deleted with it. Keep a copy of your API key somewhere safe before uninstalling if you plan to reinstall later.

---

## Reinstall

```
git clone https://github.com/geechun80/vouza-admin-agent.git
cd vouza-admin-agent
```

Then drop your `.env` file back in and run `start.bat`.
