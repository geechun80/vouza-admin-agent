' Vouza Admin Agent — Silent Background Launcher
' Double-click this to start the agent with NO terminal window visible.
' The agent runs silently in the background.
' To stop it: open Task Manager → find "node.exe" → End Task

Option Explicit

Dim WshShell, fso, agentDir, logFile

Set WshShell = CreateObject("WScript.Shell")
Set fso      = CreateObject("Scripting.FileSystemObject")

' Get the folder this VBS file lives in
agentDir = fso.GetParentFolderName(WScript.ScriptFullName)
logFile  = agentDir & "\data\agent.log"

' Make sure data/ folder exists for the log
If Not fso.FolderExists(agentDir & "\data") Then
    fso.CreateFolder(agentDir & "\data")
End If

' Run the agent dashboard silently (WindowStyle 0 = hidden)
WshShell.Run "cmd /c cd /d """ & agentDir & """ && npm run setup >> """ & logFile & """ 2>&1", 0, False

' Wait 4 seconds then open the browser
WScript.Sleep 4000
WshShell.Run "http://localhost:3456", 1, False

WScript.Quit
