/**
 * Resolve a C compiler executable for scripts and CI.
 * Order: SEED_GCC → CC → GCC (must exist if path-like) → Windows repo default → gcc → clang on PATH.
 */
const fs = require('fs');
const { execSync } = require('child_process');

/** Search common MinGW-w64 install locations on Windows. */
function findDefaultMingwGcc() {
  if (process.platform !== 'win32') return null;
  const candidates = [
    process.env.SEED_MINGW_ROOT && `${process.env.SEED_MINGW_ROOT}\\bin\\x86_64-w64-mingw32-gcc.exe`,
    'C:\\msys64\\mingw64\\bin\\x86_64-w64-mingw32-gcc.exe',
    'C:\\msys64\\ucrt64\\bin\\gcc.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function stripQuotes(s) {
  const t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function dumpVersionOk(cmd, shell) {
  try {
    execSync(`${cmd} -dumpversion`, { stdio: 'pipe', timeout: 8000, shell: shell === true });
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {string|null} Compiler command (quoted path or bare name for PATH)
 */
function resolveGcc() {
  const shell = process.platform === 'win32';
  for (const envKey of ['SEED_GCC', 'CC', 'GCC']) {
    const raw = process.env[envKey];
    if (!raw) continue;
    const v = stripQuotes(raw);
    if (fs.existsSync(v)) return v.includes(' ') ? `"${v}"` : v;
    if (dumpVersionOk(v, shell)) return v;
  }
  if (process.platform === 'win32') {
    const found = findDefaultMingwGcc();
    if (found) return found.includes(' ') ? `"${found}"` : found;
  }
  for (const name of ['gcc', 'clang']) {
    if (dumpVersionOk(name, shell)) return name;
  }
  return null;
}

module.exports = { resolveGcc, findDefaultMingwGcc };
