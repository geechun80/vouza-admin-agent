@echo off
 TITLE Admin Agent

 echo Starting Admin Agent...
 echo Ensure you have Node.js 18+ installed.

 if not exist node_modules\ (
     echo Installing dependencies...
     call npm install
 )

 echo Building latest version just in case...
 call npm run build
 
 echo Starting application...
 call npm start
 
 pause
