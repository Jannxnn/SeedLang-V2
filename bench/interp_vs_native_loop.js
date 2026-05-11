'use strict';
/**
 * Compare bench_loop-equivalent work: native JS loop vs Seed interpret (parse+interpret per lap).
 * Run: node bench/interp_vs_native_loop.js
 */
const fs = require('fs');
const path = require('path');
const { Lexer } = require('../dist/core/lexer');
const { Parser } = require('../dist/core/parser');
const { Interpreter } = require('../dist/core/interpreter');

const seedPath = path.join(__dirname, '../tests/interp_jit/cases/bench_loop.seed');
const src = fs.readFileSync(seedPath, 'utf8');

function benchSeed(jitOn, reps) {
  process.env.SEED_INTERP_JIT = jitOn ? '1' : '0';
  delete process.env.SEED_INTERP_JIT_PROBE;
  delete process.env.SEED_INTERP_JIT_PROBE_ASSIGN;
  const t0 = performance.now();
  for (let k = 0; k < reps; k++) {
    const lexer = new Lexer(src);
    const parser = new Parser(lexer.tokenize());
    const program = parser.parse();
    const interp = new Interpreter();
    interp.interpret(program);
  }
  return (performance.now() - t0) / reps;
}

/** Same numeric work as bench_loop body only (V8 runs this directly). */
function benchNative(reps) {
  const t0 = performance.now();
  for (let k = 0; k < reps; k++) {
    let sum = 0;
    let i = 0;
    while (i < 2000) {
      sum = sum + i;
      i = i + 1;
    }
    if (sum !== 1999000) throw new Error('bad sum');
  }
  return (performance.now() - t0) / reps;
}

const reps = Math.max(10, parseInt(process.env.BENCH_REPS || '40', 10) || 40);

const nativeAvg = benchNative(reps);
const seedOff = benchSeed(false, reps);
const seedOn = benchSeed(true, reps);

/** Parse once; clone AST each lap so interpret sees fresh ProgramNode (isolates interpret vs lexer/parser). */
function benchSeedInterpretOnly(jitOn, repsI) {
  process.env.SEED_INTERP_JIT = jitOn ? '1' : '0';
  delete process.env.SEED_INTERP_JIT_PROBE;
  delete process.env.SEED_INTERP_JIT_PROBE_ASSIGN;
  const lexer = new Lexer(src);
  const parser = new Parser(lexer.tokenize());
  const template = parser.parse();
  const t0 = performance.now();
  for (let k = 0; k < repsI; k++) {
    const program = JSON.parse(JSON.stringify(template));
    const interp = new Interpreter();
    interp.interpret(program);
  }
  return (performance.now() - t0) / repsI;
}

const seedInterpOnlyOff = benchSeedInterpretOnly(false, reps);
const seedInterpOnlyOn = benchSeedInterpretOnly(true, reps);

console.log(
  JSON.stringify(
    {
      workload:
        'bench_loop.seed: native = JS while-loop only; seed_full = lex+parse+interpret per lap; seed_interp = interpret per lap (JSON clone AST, no re-lex)',
      reps,
      native_js_loop_only_avg_ms: nativeAvg,
      seed_parse_interp_avg_ms_jit_off: seedOff,
      seed_parse_interp_avg_ms_jit_on: seedOn,
      ratio_seed_off_vs_native_loop: seedOff / nativeAvg,
      ratio_seed_on_vs_native_loop: seedOn / nativeAvg,
      seed_interpret_only_avg_ms_jit_off: seedInterpOnlyOff,
      seed_interpret_only_avg_ms_jit_on: seedInterpOnlyOn,
      ratio_interp_only_off_vs_native_loop: seedInterpOnlyOff / nativeAvg,
      ratio_interp_only_on_vs_native_loop: seedInterpOnlyOn / nativeAvg
    },
    null,
    2
  )
);
