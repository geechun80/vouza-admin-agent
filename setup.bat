@echo off
 TITLE Admin Agent Setup Dashboard

 echo Starting Admin Agent Setup Wizard...
 echo Ensure you have Node.js 18+ installed.
 
 if not exist node_modules\ (
     echo Installing dependencies...
     call npm install
 )

 call npm run setup
 
 pause
