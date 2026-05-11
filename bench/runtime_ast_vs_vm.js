#!/usr/bin/env node
/**
 * AST interpreter (dist/cli.js general) vs SeedLangVM (--vm) wall-clock comparison.
 *
 * Usage (from repo root, after npm run build):
 *   node bench/runtime_ast_vs_vm.js
 *   node bench/runtime_ast_vs_vm.js --reps 8 --warm 1
 *
 * Rows:
 *   - AST + SEED_INTERP_JIT=0 / 1  → TS Interpreter + interpreter_jit tier
 *   - VM + --vm                   → SeedLangVM + src/jit/* path (target runtime for de-shelling)
 *
 * Note: Absolute ms varies by machine; compare ratios within one table.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'dist', 'cli.js');

function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function parseArgs() {
  const repsIdx = process.argv.indexOf('--reps');
  const warmIdx = process.argv.indexOf('--warm');
  return {
    reps: repsIdx >= 0 ? Math.max(1, parseInt(process.argv[repsIdx + 1], 10) || 5) : 5,
    warm: warmIdx >= 0 ? Math.max(0, parseInt(process.argv[warmIdx + 1], 10) || 1) : 1
  };
}

const WORKLOADS = [
  { name: 'bench_loop', rel: 'tests/interp_jit/cases/bench_loop.seed' },
  { name: 'clc_selfhost', rel: 'selfhost/clc/clc.seed' }
];

/** @typedef {{ label: string; argv: string[]; env: Record<string, string|undefined> }} BenchCfg */

/** @type {BenchCfg[]} */
const CONFIGS = [
  {
    label: 'AST SEED_INTERP_JIT=0',
    argv: [cli],
    env: { SEED_INTERP_JIT: '0', SEED_INTERP_JIT_PROBE: undefined, SEED_INTERP_JIT_PROBE_ASSIGN: undefined }
  },
  {
    label: 'AST SEED_INTERP_JIT=1',
    argv: [cli],
    env: { SEED_INTERP_JIT: '1', SEED_INTERP_JIT_PROBE: undefined, SEED_INTERP_JIT_PROBE_ASSIGN: undefined }
  },
  {
    label: 'VM --vm',
    argv: [cli, '--vm'],
    env: { SEED_INTERP_JIT: undefined, SEED_INTERP_JIT_PROBE: undefined, SEED_INTERP_JIT_PROBE_ASSIGN: undefined }
  }
];

function mergeEnv(extra) {
  const env = { ...process.env };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

function runOnce(argv, envExtra, cwd) {
  const env = mergeEnv(envExtra);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, argv, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const ms = Date.now() - t0;
  return { ms, status: r.status ?? 1, stderr: r.stderr || '' };
}

function benchWorkload(workload, reps, warm) {
  const fileRel = workload.rel;
  /** @type {Record<string, { median: number; samples: number[]; ok: boolean }>} */
  const out = {};

  for (const cfg of CONFIGS) {
    const argv = [...cfg.argv, fileRel];
    const samples = [];
    let ok = true;

    for (let w = 0; w < warm; w++) {
      const x = runOnce(argv, cfg.env, root);
      if (x.status !== 0) ok = false;
    }
    for (let i = 0; i < reps; i++) {
      const x = runOnce(argv, cfg.env, root);
      if (x.status !== 0) ok = false;
      samples.push(x.ms);
    }

    out[cfg.label] = {
      median: median(samples),
      samples,
      ok
    };
  }

  return { workload: workload.name, results: out };
}

function main() {
  const fs = require('fs');
  if (!fs.existsSync(cli)) {
    console.error('[FAIL] Missing dist/cli.js — run npm run build');
    process.exit(1);
  }

  const { reps, warm } = parseArgs();

  /** @type {any[]} */
  const workloadsOut = [];
  let anyFail = false;

  for (const w of WORKLOADS) {
    const row = benchWorkload(w, reps, warm);
    const astOff = row.results['AST SEED_INTERP_JIT=0'].median;
    const enriched = {};
    for (const [label, v] of Object.entries(row.results)) {
      if (!v.ok) anyFail = true;
      enriched[label] = {
        median_ms: Math.round(v.median * 10) / 10,
        ok: v.ok,
        ratio_vs_ast_jit_off: astOff > 0 ? Math.round((v.median / astOff) * 1000) / 1000 : null
      };
    }
    workloadsOut.push({ name: row.workload, file: w.rel, by_mode: enriched });
  }

  console.log(
    JSON.stringify(
      {
        note: 'AST uses TS Interpreter (+ interpreter_jit when JIT=1). VM uses SeedLangVM (--vm).',
        cwd: root,
        reps,
        warm,
        workloads: workloadsOut
      },
      null,
      2
    )
  );

  if (anyFail) {
    console.error('[WARN] One or more runs returned non-zero exit; check workload compatibility with VM vs AST.');
    process.exit(1);
  }
}

main();
