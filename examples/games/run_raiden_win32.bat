@echo off
setlocal EnableExtensions
rem Raiden CLC Win32: one-click Seed to C to EXE, then launch.
rem Double-click to compile and launch (requires Node.js on PATH).

set "ROOT=%~dp0..\.."
set "SEED_FILE=%ROOT%\examples\games\raiden_win32.seed"
set "C_FILE=%ROOT%\build\raiden_win32.c"
set "EXE_FILE=%ROOT%\build\raiden_win32.exe"
set "RT_C=%ROOT%\tools\clc\sl_win32_rt.c"
set "TOOLS_CLC=%ROOT%\tools\clc"
set "CLI=%ROOT%\dist\cli.js"
set "TCC=%ROOT%\tools\tcc\tcc\tcc.exe"

set "SEED_WIN32_AUTOCLOSE="

echo === Raiden CLC Win32 ===
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo Error: node.exe not found in PATH.
    echo Install Node.js or open "Developer PowerShell" / "x64 Native Tools" and run this script from there.
    pause
    exit /b 1
)

rem Step 1: Ensure build directory exists
if not exist "%ROOT%\build" mkdir "%ROOT%\build"

rem Step 2: Compile Seed to C
echo [1/3] Compiling Seed -^> C ...
if not exist "%CLI%" (
    echo Error: cli.js not found. Run "npm run build" first.
    pause
    exit /b 1
)
node "%CLI%" "%SEED_FILE%" --compile-c --subsystem windows -o "%C_FILE%"
if errorlevel 1 (
    echo ERROR: Seed compilation failed!
    pause
    exit /b 1
)
echo [1/3] Done: %C_FILE%
echo.

rem Step 3: Compile C to EXE (prefer MinGW gcc: full Win32 headers e.g. mmsystem.h)
echo [2/3] Compiling C -^> EXE ...
where gcc >nul 2>&1
if not errorlevel 1 (
    echo Using gcc from PATH ^(MinGW^).
    gcc -O2 -I"%TOOLS_CLC%" -o "%EXE_FILE%" "%C_FILE%" "%RT_C%" -luser32 -lgdi32 -lwinmm -mwindows -municode -lm
) else if exist "%TCC%" (
    echo Using bundled TinyCC ^(no gcc on PATH^).
    "%TCC%" -I"%TOOLS_CLC%" -o "%EXE_FILE%" "%C_FILE%" "%RT_C%" -luser32 -lgdi32 -lwinmm
) else (
    echo Error: neither gcc nor bundled tcc found. Install MinGW-w64 and add gcc to PATH, or restore tools\tcc.
    pause
    exit /b 1
)
if errorlevel 1 (
    echo ERROR: C compilation failed!
    pause
    exit /b 1
)
echo [2/3] Done: %EXE_FILE%
echo.

rem Step 4: Launch
echo [3/3] Launching raiden_win32.exe ...
echo.
echo ========================================
echo   Controls:
echo   Arrow keys - Move
echo   Space      - Fire
echo   1/2/3      - Switch ammo type
echo   ESC        - Quit
echo   Enter      - Restart (after death)
echo ========================================
echo.

start "Raiden CLC" /D "%ROOT%\build" "%EXE_FILE%"