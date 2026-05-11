#!/usr/bin/env node
/**
 * Interpreter own-JIT correctness + optional CLI wall-clock sweep (interp × host JIT).
 *
 * Correctness (default): Same result with SEED_INTERP_JIT=1 vs SEED_HOST_JIT ignored.
 * Bench: npm run test:interp-jit -- --bench
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isDeepStrictEqual } = require('util');

const root = path.resolve(__dirname, '..', '..');
const casePath = path.join(__dirname, 'cases', 'jit_combo.seed');

function parseExpected(content) {
  const match = content.match(/^\s*\/\/\s*EXPECT:\s*(.+)\s*$/m);
  if (!match) throw new Error('Missing EXPECT');

  const raw = match[1].trim();
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

  try {
    return JSON.parse(raw);
  } catch (_) {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (raw === 'undefined') return undefined;
    if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
    return raw;
  }
}

function interpretWithInterpJitFlag(seedSrc, interpOn) {
  process.env.SEED_INTERP_JIT = interpOn ? '1' : '0';
  // Eager tier so a single interpret() pass exercises compiled fast paths (production default probe is 128).
  process.env.SEED_INTERP_JIT_PROBE = '1';
  process.env.SEED_INTERP_JIT_PROBE_ASSIGN = '1';

  const interpPath = path.join(root, 'dist', 'core', 'interpreter.js');
  const interpJitPath = path.join(root, 'dist', 'core', 'interpreter_jit.js');
  delete require.cache[interpJitPath];
  delete require.cache[interpPath];

  const { Lexer } = require(path.join(root, 'dist', 'core', 'lexer'));
  const { Parser } = require(path.join(root, 'dist', 'core', 'parser'));
  const { Interpreter } = require(interpPath);

  const lexer = new Lexer(seedSrc);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const program = parser.parse();
  const interpreter = new Interpreter();
  interpreter.interpret(program);

  const result = interpreter.environment.get('result');
  return typeof result?.value !== 'undefined' ? result.value : result;
}

function runCorrectnessGate() {
  const src = fs.readFileSync(casePath, 'utf8');
  const expected = parseExpected(src);
  const a = interpretWithInterpJitFlag(src, true);
  const b = interpretWithInterpJitFlag(src, false);
  if (!isDeepStrictEqual(a, expected)) {
    console.error('[FAIL] SEED_INTERP_JIT=1 result mismatch:', a, expected);
    process.exit(1);
  }
  if (!isDeepStrictEqual(b, expected)) {
    console.error('[FAIL] SEED_INTERP_JIT=0 result mismatch:', b, expected);
    process.exit(1);
  }
  if (!isDeepStrictEqual(a, b)) {
    console.error('[FAIL] JIT on/off divergence:', { a, b });
    process.exit(1);
  }
  console.log('[OK] interp JIT on/off parity, result =', JSON.stringify(expected));
}

function runBenchSweep() {
  const benchFile = path.join(__dirname, 'cases', 'bench_loop.seed');
  const cliJs = path.join(root, 'dist', 'cli.js');
  if (!fs.existsSync(cliJs)) {
    console.error('[FAIL] Missing dist/cli.js — run npm run build');
    process.exit(1);
  }

  const combos = [
    { label: 'ownJIT+hostV8JIT', interp: '1', host: '1' },
    { label: 'ownJIT+V8jitless', interp: '1', host: '0' },
    { label: 'noOwnJIT+hostV8JIT', interp: '0', host: '1' },
    { label: 'noOwnJIT+V8jitless', interp: '0', host: '0' },
  ];

  console.log('\nBench (wall-clock CLI, 3× warm start; jitless combo may re-exec Node):\n');

  for (const c of combos) {
    const env = { ...process.env, SEED_INTERP_JIT: c.interp, SEED_HOST_JIT: c.host };
    const t0 = Date.now();
    let last;
    for (let w = 0; w < 3; w++) {
      last = spawnSync(process.execPath, [cliJs, benchFile], { cwd: root, env, encoding: 'utf8' });
    }
    const ms = Date.now() - t0;

    if (last.status !== 0) {
      console.error(`[FAIL] ${c.label}`, last.stderr?.slice(0, 500));
      process.exit(1);
    }

    console.log(`  ${c.label.padEnd(26)} 3 runs ~${ms}ms total`);
  }
}

function main() {
  if (!fs.existsSync(path.join(root, 'dist', 'core', 'interpreter.js'))) {
    console.error('[FAIL] Run npm run build first');
    process.exit(1);
  }

  runCorrectnessGate();

  if (process.argv.includes('--bench')) {
    runBenchSweep();
  }
}

main();
