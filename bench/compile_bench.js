#!/usr/bin/env node
/**
 * CLC Compiler Speed Benchmark
 *
 * Benchmarks:
 *   A) TS CLI compilation speed (Seed → C)
 *   B) TS CLI compilation speed (Seed → JS)
 *   C) Selfhost CLI compilation speed (Seed → C) — if available
 *
 * Output format matches bench/run.js parseResults for integration.
 *
 * Usage:
 *   node bench/compile_bench.js                  # all benchmarks
 *   node bench/compile_bench.js --reps 5         # more iterations
 *   node bench/compile_bench.js --quiet          # only the standard output lines
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'dist', 'cli.js');
const SELFHOST_SRC = 'selfhost/clc/clc_cli_full.seed';
const SELFHOST_JS = path.join(ROOT, 'build', 'selfhost_cli_bench.js');

const BENCH_FILES = [
  { name: 'bench_clc', path: 'bench/seedlang/bench_clc.seed', label: '118 lines (bench_clc)' },
  { name: 'win32_stress', path: 'examples/clc/win32_stress_sustained.seed', label: '664 lines (stress)' },
  { name: 'selfhost_full', path: 'selfhost/clc/clc_cli_full.seed', label: '1422 lines (clc_full)' },
];

function parseArgs() {
  const repsIdx = process.argv.indexOf('--reps');
  const reps = repsIdx >= 0 ? Math.max(1, parseInt(process.argv[repsIdx + 1], 10) || 5) : 5;
  const quiet = process.argv.includes('--quiet');
  return { reps, quiet };
}

function median(nums) {
  if (nums.length === 0) return 0;
  const a = nums.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function timeRun(cmd, cwd) {
  const t0 = performance.now();
  try {
    execSync(cmd, { cwd, timeout: 300000, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, ms: performance.now() - t0, err: String(e.stderr || e.message || '').split('\n')[0] };
  }
}

/**
 * Compile Seed → C using TS CLI, return median wall-time ms.
 */
function benchTsCliToC(seedRel, reps, notes) {
  const cwd = ROOT;
  const seedPath = seedRel.replace(/\//g, path.sep);
  const baseName = path.basename(seedPath, '.seed');
  const cPath = path.join(ROOT, 'build', `bench_${baseName}.c`);

  const samples = [];
  for (let i = 0; i < reps; i++) {
    const cmd = `node "${CLI}" "${seedPath}" --compile-c --subsystem console -o "${cPath}"`;
    const r = timeRun(cmd, cwd);
    if (!r.ok && notes) notes.push(`${seedRel}: run#${i + 1} FAIL: ${r.err}`);
    samples.push(r.ms);
  }
  // Clean up generated file
  try { fs.unlinkSync(cPath); } catch (_) { /* ok */ }
  return median(samples);
}

/**
 * Compile Seed → JS using TS CLI, return median wall-time ms.
 */
function benchTsCliToJs(seedRel, reps, notes) {
  const cwd = ROOT;
  const seedPath = seedRel.replace(/\//g, path.sep);
  const baseName = path.basename(seedPath, '.seed');
  const jsPath = path.join(ROOT, 'build', `bench_${baseName}_compiled.js`);

  const samples = [];
  for (let i = 0; i < reps; i++) {
    const cmd = `node "${CLI}" --compile "${seedPath}" -o "${jsPath}"`;
    const r = timeRun(cmd, cwd);
    if (!r.ok && notes) notes.push(`${seedRel}(JS): run#${i + 1} FAIL: ${r.err}`);
    samples.push(r.ms);
  }
  try { fs.unlinkSync(jsPath); } catch (_) { /* ok */ }
  return median(samples);
}

/**
 * Compile Seed → C using selfhost CLI (compiled to JS), return median wall-time ms.
 */
function benchSelfhostCliToC(seedRel, reps, notes) {
  const cwd = ROOT;
  const seedPath = seedRel.replace(/\//g, path.sep);
  const baseName = path.basename(seedPath, '.seed');
  const cPath = path.join(ROOT, 'build', `bench_self_${baseName}.c`);

  if (!fs.existsSync(SELFHOST_JS)) {
    const buildCmd = `node "${CLI}" --compile "${SELFHOST_SRC}" -o "${SELFHOST_JS}"`;
    try {
      execSync(buildCmd, { cwd, timeout: 60000, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      if (notes) notes.push(`selfhost: build failed: ${String(e.stderr || e.message || '').split('\n')[0]}`);
      return -1;
    }
  }

  let failCount = 0;
  const samples = [];
  for (let i = 0; i < reps; i++) {
    const cmd = `node "${SELFHOST_JS}" "${seedPath}" "${cPath}"`;
    const r = timeRun(cmd, cwd);
    if (!r.ok) {
      failCount++;
      if (failCount === 1 && notes) notes.push(`selfhost: ${r.err.substring(0, 120)}`);
    }
    samples.push(r.ms);
  }
  try { fs.unlinkSync(cPath); } catch (_) { /* ok */ }
  if (failCount >= reps) return -1;
  return median(samples);
}

function main() {
  const { reps, quiet } = parseArgs();
  const notes = [];

  if (!quiet) {
    console.error('=== CLC Compiler Speed Benchmark ===');
    console.error(`Iterations: ${reps} per benchmark`);
    console.error('');
    console.error('Legend:');
    console.error('  cli_c_*  = TS CLI (node dist/cli.js) compile Seed → C');
    console.error('  cli_js_* = TS CLI compile Seed → JS');
    console.error('  self_c_* = Selfhost CLI compile Seed → C (if available)');
    console.error('');
  }

  // ============================================================
  // A) TS CLI → C compilation speed
  // ============================================================
  if (!quiet) console.error('--- TS CLI: Seed → C ---');
  for (const f of BENCH_FILES) {
    const ms = benchTsCliToC(f.path, reps, notes);
    const lineCount = fs.readFileSync(path.join(ROOT, f.path.replace(/\//g, path.sep)), 'utf8').split('\n').length;
    console.log(`cli_c_${f.name}(${lineCount})=0 ${ms.toFixed(3)}ms`);
    if (!quiet) console.error(`  cli_c_${f.name}  median: ${ms.toFixed(1)}ms  (${f.label})`);
  }

  // ============================================================
  // B) TS CLI → JS compilation speed
  // ============================================================
  if (!quiet) console.error('--- TS CLI: Seed → JS ---');
  for (const f of BENCH_FILES) {
    const ms = benchTsCliToJs(f.path, reps, notes);
    const lineCount = fs.readFileSync(path.join(ROOT, f.path.replace(/\//g, path.sep)), 'utf8').split('\n').length;
    console.log(`cli_js_${f.name}(${lineCount})=0 ${ms.toFixed(3)}ms`);
    if (!quiet) console.error(`  cli_js_${f.name} median: ${ms.toFixed(1)}ms  (${f.label})`);
  }

  // ============================================================
  // C) Selfhost CLI → C compilation speed
  // ============================================================
  const selfSrc = path.join(ROOT, SELFHOST_SRC);
  if (fs.existsSync(selfSrc)) {
    let anySelfOk = false;
    for (const f of BENCH_FILES) {
      const ms = benchSelfhostCliToC(f.path, reps, notes);
      if (ms < 0) continue;
      anySelfOk = true;
      const lineCount = fs.readFileSync(path.join(ROOT, f.path.replace(/\//g, path.sep)), 'utf8').split('\n').length;
      console.log(`self_c_${f.name}(${lineCount})=0 ${ms.toFixed(3)}ms`);
      if (!quiet) console.error(`  self_c_${f.name}  median: ${ms.toFixed(1)}ms  (${f.label})`);
    }
    if (!anySelfOk && !quiet) {
      console.error('  (all selfhost runs failed — see Notes below)');
    }
  } else {
    if (!quiet) console.error('--- Selfhost CLI: NOT AVAILABLE (source not found) ---');
  }

  // Print notes to stderr
  if (notes.length > 0 && !quiet) {
    console.error('');
    console.error('Notes:');
    for (const n of notes) console.error(`  - ${n}`);
  }
}

main();