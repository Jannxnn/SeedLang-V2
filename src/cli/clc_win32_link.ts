/**
 * Win32 link contract for CLC → native (no JS host). See docs/CLC_WIN32_PLAN.txt.
 * Safe to import from the public package API without loading the full CLI.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Search common MinGW-w64 install locations on Windows. */
function findDefaultMingwGcc(): string | null {
  if (process.platform !== 'win32') return null;
  const candidates = [
    process.env.SEED_MINGW_ROOT && `${process.env.SEED_MINGW_ROOT}\\bin\\x86_64-w64-mingw32-gcc.exe`,
    'C:\\msys64\\mingw64\\bin\\x86_64-w64-mingw32-gcc.exe',
    'C:\\msys64\\ucrt64\\bin\\gcc.exe',
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Prefer SEED_GCC / CC / GCC, then Windows default path, else `gcc` on PATH. */
export function resolvePreferredMingwGcc(): string {
  const strip = (s: string | undefined) => (s ? String(s).trim().replace(/^["']|["']$/g, '') : '');
  for (const k of ['SEED_GCC', 'CC', 'GCC'] as const) {
    const p = strip(process.env[k]);
    if (!p) continue;
    if (fs.existsSync(p)) return p;
    if (/^(gcc|clang)(\.exe)?$/i.test(p)) return p;
    if (p.endsWith('gcc.exe') || p.endsWith('clang.exe')) return p;
  }
  const found = findDefaultMingwGcc();
  if (found) return found;
  return 'gcc';
}

/** Fixed runtime source merged with CLC output when targeting Win32 GUI. */
export const CLC_WIN32_RT_FILENAME = 'sl_win32_rt.c';

/** Suggested GUI entry for subsystem windows builds. */
export const CLC_WIN32_ENTRY_W_WINMAIN = 'wWinMain';

const GCC_WIN32_GUI_FLAGS = ['-mwindows', '-municode'] as const;
const GCC_WIN32_CONSOLE_FLAGS = ['-mconsole', '-municode'] as const;

/** Typical Win32 libs for a minimal window + GDI path (winmm: timeBeginPeriod/timeEndPeriod in sl_win32_rt.c). */
export const CLC_WIN32_LIBS_MINGW = ['user32', 'gdi32', 'comdlg32', 'winmm'] as const;

/** MinGW-style -l flags (order may matter for some toolchains). */
export function getClcWin32MingwLibFlags(): string[] {
  return CLC_WIN32_LIBS_MINGW.map((lib) => `-l${lib}`);
}

/**
 * Extra gcc/clang arguments after object files, for a Win32 GUI or console exe.
 * Caller still supplies -o, sources, and optimization flags.
 */
export function getClcWin32GccLinkSuffix(subsystem: 'windows' | 'console' = 'windows'): string[] {
  const sub = subsystem === 'windows' ? [...GCC_WIN32_GUI_FLAGS] : [...GCC_WIN32_CONSOLE_FLAGS];
  return [...sub, ...getClcWin32MingwLibFlags()];
}

/** One-line MSVC pragma helper for README / generated C headers. */
export function getClcWin32MsvcPragmaLibs(): string {
  return CLC_WIN32_LIBS_MINGW.map((lib) => `#pragma comment(lib, "${lib}.lib")`).join('\n');
}

/** Space-separated `user32.lib` … for MSVC `/link` (same set as {@link CLC_WIN32_LIBS_MINGW}). */
export function getClcWin32MsvcLinkLibs(): string {
  return CLC_WIN32_LIBS_MINGW.map((lib) => `${lib}.lib`).join(' ');
}

/**
 * Absolute path to `sl_win32_rt.c` in the repo.
 * @param resolverDir `__dirname` of the compiled caller (e.g. `dist/cli`).
 */
export function resolveClcWin32RtSourcePath(resolverDir: string = __dirname): string {
  return path.resolve(resolverDir, '..', '..', 'tools', 'clc', CLC_WIN32_RT_FILENAME);
}

/** Directory containing `sl_win32_rt.c` and `sl_win32_public.h` (for `-I` / `/I`). */
export function resolveClcWin32ToolsClcDir(resolverDir: string = __dirname): string {
  return path.dirname(resolveClcWin32RtSourcePath(resolverDir));
}
