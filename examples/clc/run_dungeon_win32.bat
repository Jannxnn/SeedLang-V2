@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
rem Double-click this to run the Win32 pixel dungeon (clears SEED_WIN32_AUTOCLOSE for this process).
set "ROOT=%~dp0..\.."
set "DIST=%ROOT%\dist"
set "EXE=%DIST%\dungeon_win32.exe"
set "SEED_WIN32_AUTOCLOSE="
if not exist "%EXE%" (
  echo Missing: %EXE%
  echo From repo root run: npm run build ^&^& npm run compile:game:dungeon-win32
  pause
  exit /b 1
)
start "Seed CLC Dungeon" /D "%DIST%" "%EXE%"
