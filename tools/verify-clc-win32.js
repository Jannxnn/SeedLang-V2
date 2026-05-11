#!/usr/bin/env node
/**
 * One-shot CLC Win32 smoke: compile examples/clc/win32_smoke.seed → .exe → run with SEED_WIN32_AUTOCLOSE.
 * Requires: npm run build, Windows + MinGW/gcc (see tools/resolve-gcc.js).
 * Non-Windows: exits 0 (skipped). No compiler: exits 0 with message (optional CI).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { resolveGcc, WIN_DEFAULT_GCC } = require('./resolve-gcc.js');

function main() {
  if (process.platform !== 'win32') {
    console.log('verify:clc-win32: skip (not Windows)');
    process.exit(0);
  }

  const repoRoot = path.join(__dirname, '..');
  const distCli = path.join(repoRoot, 'dist', 'cli.js');
  if (!fs.existsSync(distCli)) {
    console.error('verify:clc-win32: run `npm run build` first (missing dist/cli.js)');
    process.exit(1);
  }

  let gcc = resolveGcc();
  if (gcc) gcc = gcc.replace(/^"|"$/g, '');
  if (!gcc) gcc = WIN_DEFAULT_GCC;
  if (!fs.existsSync(gcc) && !/^gcc|clang$/i.test(path.basename(gcc))) {
    console.log('verify:clc-win32: skip (no C compiler; set SEED_GCC or install MinGW)');
    process.exit(0);
  }

  const seedPath = path.join(repoRoot, 'examples', 'clc', 'win32_smoke.seed');
  const rtPath = path.join(repoRoot, 'tools', 'clc', 'sl_win32_rt.c');
  const incPath = path.join(repoRoot, 'tools', 'clc');
  const tmp = path.join(os.tmpdir(), 'seed-clc-win32-verify');
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
  const base = path.join(tmp, `w${Date.now()}`);
  const cFile = `${base}.c`;
  const exeFile = `${base}.exe`;

  const cli = require(distCli);
  const source = fs.readFileSync(seedPath, 'utf8');
  const cCode = cli.compileToC(source, { clcSubsystem: 'windows' });
  fs.writeFileSync(cFile, cCode, 'utf8');

  const sfx = '-mwindows -municode -luser32 -lgdi32 -lcomdlg32 -lwinmm';
  const qgcc = `"${String(gcc).replace(/"/g, '')}"`;
  execSync(`${qgcc} -O0 -I"${incPath}" -o "${exeFile}" "${cFile}" "${rtPath}" ${sfx}`, {
    stdio: 'inherit',
    timeout: 120000
  });
  execSync(`"${exeFile}"`, {
    stdio: 'inherit',
    timeout: 30000,
    env: { ...process.env, SEED_WIN32_AUTOCLOSE: '1' }
  });

  try {
    fs.unlinkSync(cFile);
  } catch (e) {}
  try {
    fs.unlinkSync(exeFile);
  } catch (e) {}

  console.log('verify:clc-win32: OK');
  process.exit(0);
}

main();
