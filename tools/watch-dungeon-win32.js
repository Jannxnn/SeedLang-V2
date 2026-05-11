#!/usr/bin/env node
/**
 * Dev loop: watch Win32 dungeon .seed (and Win32 RT), debounce, recompile, restart exe.
 * True in-process hot reload is not available for CLC→native; this is "save → rebuild → relaunch".
 *
 * Usage (repo root): npm run dev:game:dungeon-win32
 * Requires: npm run build, Windows, gcc (see tools/resolve-gcc.js). Clears SEED_WIN32_AUTOCLOSE for child.
 */
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const seedPath = path.join(repoRoot, 'examples', 'games', 'clc_reliability_dungeon_win32.seed');
const rtPath = path.join(repoRoot, 'tools', 'clc', 'sl_win32_rt.c');
const distCli = path.join(repoRoot, 'dist', 'cli.js');
const outC = path.join(repoRoot, 'dist', 'dungeon_win32.c');
const outExe = path.join(repoRoot, 'dist', 'dungeon_win32.exe');
const distDir = path.join(repoRoot, 'dist');

const DEBOUNCE_MS = 500;
const childEnv = { ...process.env, SEED_WIN32_AUTOCLOSE: '' };

let gameProc = null;
let debounceTimer = null;
let compiling = false;

function killGame() {
  if (!gameProc) return;
  try {
    gameProc.kill();
  } catch (_) {
    /* ignore */
  }
  gameProc = null;
}

function compileOnce() {
  if (!fs.existsSync(distCli)) {
    console.error('Missing dist/cli.js — run: npm run build');
    process.exit(1);
  }
  execFileSync(
    process.execPath,
    [
      distCli,
      seedPath,
      '--compile-c',
      '--subsystem',
      'windows',
      '-o',
      outC
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: childEnv
    }
  );
}

function launchGame() {
  killGame();
  if (!fs.existsSync(outExe)) {
    console.warn('No exe yet (compiler missing or compile failed). Watch continues.');
    return;
  }
  gameProc = spawn(outExe, [], {
    cwd: distDir,
    stdio: 'ignore',
    windowsHide: false,
    env: childEnv
  });
  gameProc.on('exit', (code, sig) => {
    if (gameProc && !sig) {
      /* normal exit */
    }
    gameProc = null;
  });
  gameProc.on('error', (e) => {
    console.error('spawn exe:', e.message);
    gameProc = null;
  });
  console.log('→ running', outExe, '(pid', gameProc.pid + ')');
}

function rebuildAndRelaunch() {
  if (compiling) return;
  compiling = true;
  console.log('\n[watch] recompiling…', new Date().toISOString());
  try {
    compileOnce();
    console.log('[watch] compile ok');
    launchGame();
  } catch (e) {
    console.error('[watch] compile failed — keeping previous exe if any. ', e.message || e);
  }
  compiling = false;
}

function schedule() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(rebuildAndRelaunch, DEBOUNCE_MS);
}

function watchFile(p, label) {
  if (!fs.existsSync(p)) {
    console.warn('watch: skip missing', label, p);
    return;
  }
  fs.watch(p, { persistent: true }, (ev) => {
    if (ev !== 'change' && ev !== 'rename') return;
    schedule();
  });
  console.log('watch:', label, p);
}

console.log('Seed CLC Win32 dev watch — save files to recompile and restart the game window.');
console.log('Ctrl+C to stop (stops the game process started by this script).\n');

try {
  compileOnce();
  launchGame();
} catch (e) {
  console.error('Initial compile failed:', e.message || e);
  console.log('Fix errors, save the .seed file again, or Ctrl+C.\n');
}

watchFile(seedPath, 'seed');
watchFile(rtPath, 'runtime');

process.on('SIGINT', () => {
  clearTimeout(debounceTimer);
  killGame();
  process.exit(0);
});
