@echo off
 TITLE Admin Agent

 echo Starting Admin Agent...
 echo Building latest version just in case...
 call npm run build
 
 echo Starting application...
 call npm start
 
 pause
