@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
rem Bee Invaders (Galaga-style) CLC Win32: Seed -> C -> EXE, then launch.

set "ROOT=%~dp0..\.."
set "SEED_FILE=%ROOT%\examples\clc\bee_invaders_win32.seed"
set "C_FILE=%ROOT%\build\bee_invaders_win32.c"
set "EXE_FILE=%ROOT%\build\bee_invaders_win32.exe"
set "RT_C=%ROOT%\tools\clc\sl_win32_rt.c"
set "TOOLS_CLC=%ROOT%\tools\clc"
set "CLI=%ROOT%\dist\cli.js"
set "TCC=%ROOT%\tools\tcc\tcc\tcc.exe"

echo === Bee Invaders (CLC Win32) ===
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo Error: node.exe not found in PATH.
    pause
    exit /b 1
)

if not exist "%ROOT%\build" mkdir "%ROOT%\build"

echo [1/3] Seed -^> C ...
if not exist "%CLI%" (
    echo Error: run "npm run build" in repo root first.
    pause
    exit /b 1
)
node "%CLI%" "%SEED_FILE%" --compile-c --subsystem windows -o "%C_FILE%"
if errorlevel 1 (
    echo Seed compile failed.
    pause
    exit /b 1
)
echo [1/3] OK: %C_FILE%
echo.

echo [2/3] C -^> EXE ...
where gcc >nul 2>&1
if not errorlevel 1 (
    gcc -O2 -I"%TOOLS_CLC%" -o "%EXE_FILE%" "%C_FILE%" "%RT_C%" -luser32 -lgdi32 -lwinmm -mwindows -municode -lm
) else if exist "%TCC%" (
    "%TCC%" -I"%TOOLS_CLC%" -o "%EXE_FILE%" "%C_FILE%" "%RT_C%" -luser32 -lgdi32 -lwinmm
) else (
    echo Error: need MinGW gcc on PATH, or bundled tools\tcc\tcc\tcc.exe
    pause
    exit /b 1
)
if errorlevel 1 (
    echo C link failed.
    pause
    exit /b 1
)
echo [2/3] OK: %EXE_FILE%
echo.

echo [3/3] Launch ...
echo   Left/Right: move   Space: fire   ESC: quit   Enter: restart when dead
echo.
start "Bee Invaders" /D "%ROOT%\build" "%EXE_FILE%"
