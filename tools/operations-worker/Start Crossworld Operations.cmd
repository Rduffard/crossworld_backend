@echo off
setlocal
title Crossworld Operations Worker
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or later must be installed and on PATH.
  pause
  exit /b 1
)
pushd "%~dp0..\..\.."
if errorlevel 1 (
  echo Could not open the Crossworld Creative workspace.
  pause
  exit /b 1
)
set "OPERATIONS_BACKEND_URL=https://api.crossworldcreative.com"
set "OPERATIONS_LOOPBACK_TEST="
if /I "%~1"=="--register" (
  node.exe "%~dp0worker.mjs" --register
) else if /I "%~1"=="--check" (
  node.exe "%~dp0worker.mjs" --check
) else if /I "%~1"=="--check-device" (
  node.exe "%~dp0worker.mjs" --check-device
) else (
  node.exe "%~dp0worker.mjs" --onboard
)
set "workerExit=%errorlevel%"
popd
if not "%workerExit%"=="0" pause
exit /b %workerExit%
