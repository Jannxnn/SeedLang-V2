/**
 * CLC CI gate: strict compile-to-C for bench_clc.seed, native build, run, correctness + optional timing vs baseline.
 *
 * Env:
 *   SEED_CLC_STRICT=1          (set by this script) — no unsupported CLC fallbacks in generated C
 *   SEED_CLC_GATE_TIMING=1    — enforce bench/seedlang/clc-ci-baseline.json median ceilings (slack mult)
 *   SEED_CLC_GATE_SLACK=2.5    — allowed ratio vs baseline median (default 2.5)
 *   SEED_GCC / CC              — see tools/resolve-gcc.js
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { resolveGcc } = require(path.join(__dirname, '..', 'tools', 'resolve-gcc.js'));

const root = path.resolve(__dirname, '..');
const compileBenchJs = path.join(root, 'bench', 'compile_clc_bench.js');
const cFile = path.join(root, 'bench', 'seedlang', 'bench_clc.c');
const exeFile =
  process.platform === 'win32'
    ? path.join(root, 'bench', 'seedlang', 'bench_clc.exe')
    : path.join(root, 'bench', 'seedlang', 'bench_clc');
const baselinePath = path.join(root, 'bench', 'seedlang', 'clc-ci-baseline.json');

function sumSq0ToNMinus1(n) {
  const b = BigInt(n);
  if (b <= 0n) return 0n;
  return ((b - 1n) * b * (2n * b - 1n)) / 6n;
}

function fibBig(n) {
  const N = BigInt(n);
  if (N <= 1n) return N;
  let a = 0n;
  let b = 1n;
  for (let i = 2n; i <= N; i++) {
    const t = a + b;
    a = b;
    b = t;
  }
  return b;
}

/** Sum_{i=0}^{m} floor(i/2) in closed form. */
function sumFloorHalf0ToM(m) {
  const M = BigInt(m);
  if (M < 0n) return 0n;
  if (M % 2n === 0n) {
    const k = M / 2n;
    return k * k;
  }
  const k = (M - 1n) / 2n;
  return k * (k + 1n);
}

function expectedValue(name, arg) {
  const a = BigInt(arg);
  switch (name) {
    case 'fib':
      return fibBig(Number(arg));
    case 'loop':
    case 'pure_loop':
    case 'while_loop':
    case 'func_loop':
      return sumSq0ToNMinus1(Number(arg));
    case 'nested_loop': {
      const s = (a * (a - 1n)) / 2n;
      return s * s;
    }
    case 'array_sum':
    case 'push_index':
      return (a * (a - 1n)) / 2n;
    case 'math':
    case 'func_math':
      return sumSq0ToNMinus1(Number(arg)) - (a * (a - 1n)) / 2n;
    case 'push':
    case 'func_push':
      return a;
    case 'conditional':
      return (a + 1n) / 2n;
    case 'math_op': {
      const m = a - 1n;
      return a * (a - 1n) - sumFloorHalf0ToM(m);
    }
    case 'func_call':
      return (a * (a - 1n)) / 2n;
    case 'recursive_fib_30':
      return fibBig(30);
    case 'array_literal':
      return 10n;
    case 'ternary':
      return a % 2n === 0n ? 0n : 1n;
    case 'multi_assign':
      return a >= 1n ? 3n * a : 0n;
    default:
      return null;
  }
}

const INT64_MAX = 9223372036854775807n;
const INT64_MIN = -9223372036854775808n;

function parseBenchLine(line) {
  const m = String(line).trim().match(/^(\w+)\((-?\d+)\)=(-?\d+)\s+([\d.]+)ms$/);
  if (!m) return null;
  return { name: m[1], arg: m[2], value: m[3], medianMs: parseFloat(m[4]) };
}

function main() {
  const gateTiming = process.env.SEED_CLC_GATE_TIMING === '1';
  const slack = Math.max(1, parseFloat(process.env.SEED_CLC_GATE_SLACK || '2.5') || 2.5);

  console.log('[clc-ci] codegen (strict) + native build + run');

  const gen = spawnSync(process.execPath, [compileBenchJs], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SEED_CLC_STRICT: '1' },
  });
  if (gen.status !== 0) {
    console.error('[clc-ci] compile_clc_bench failed');
    if (gen.stderr) console.error(gen.stderr);
    process.exit(1);
  }
  if (!fs.existsSync(cFile)) {
    console.error('[clc-ci] missing', cFile);
    process.exit(1);
  }

  const cc = resolveGcc();
  if (!cc) {
    console.error('[clc-ci] no C compiler (SEED_GCC / CC / gcc on PATH)');
    process.exit(1);
  }

  const omp = process.env.SEED_OPENMP === '0' ? '' : ' -fopenmp';
  const opt = process.env.SEED_CLC_OPT || '-O2';
  const cText = fs.readFileSync(cFile, 'utf8');
  const needOmp = cText.includes('#pragma omp');
  const ompFlag = needOmp && process.env.SEED_OPENMP !== '0' ? omp : '';
  const cmd = `${cc} ${opt}${ompFlag} -o "${exeFile}" "${cFile}" -lm`;
  console.log('[clc-ci]', cmd);
  try {
    const { execSync } = require('child_process');
    execSync(cmd, { stdio: 'inherit', cwd: root, shell: true });
  } catch {
    process.exit(1);
  }

  let stdout;
  try {
    stdout = execFileSync(exeFile, { encoding: 'utf8', cwd: path.dirname(exeFile), maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    console.error('[clc-ci] bench exe failed', e.message || e);
    process.exit(1);
  }

  const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
  let timingBaseline = null;
  if (gateTiming && fs.existsSync(baselinePath)) {
    try {
      timingBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch (e) {
      console.error('[clc-ci] bad baseline JSON', e.message || e);
      process.exit(1);
    }
  } else if (gateTiming) {
    console.error('[clc-ci] SEED_CLC_GATE_TIMING=1 but missing', baselinePath);
    process.exit(1);
  }

  let fail = false;
  for (const line of lines) {
    const p = parseBenchLine(line);
    if (!p) {
      console.error('[clc-ci] unparsable line:', line);
      fail = true;
      continue;
    }
    const exp = expectedValue(p.name, p.arg);
    if (exp === null) {
      console.error('[clc-ci] no expected value for', p.name);
      fail = true;
      continue;
    }
    if (exp > INT64_MAX || exp < INT64_MIN) {
      console.log(`[clc-ci] skip int64 range check ${p.name}(${p.arg}) (mathematical result exceeds long long)`);
    } else if (BigInt(p.value) !== exp) {
      console.error(`[clc-ci] wrong result ${p.name}(${p.arg}): got ${p.value} expected ${exp}`);
      fail = true;
    }
    if (timingBaseline && timingBaseline.medians) {
      const key = `${p.name}:${p.arg}`;
      const base = timingBaseline.medians[key];
      if (typeof base === 'number' && Number.isFinite(base) && base > 0) {
        const limit = base * slack;
        if (p.medianMs > limit) {
          console.error(
            `[clc-ci] timing regression ${key}: median ${p.medianMs}ms > ${limit.toFixed(4)}ms (baseline ${base} * slack ${slack})`,
          );
          fail = true;
        }
      }
    }
  }

  const expectedLineCount = 30;
  if (lines.length !== expectedLineCount) {
    console.error(`[clc-ci] expected ${expectedLineCount} benchmark lines, got ${lines.length}`);
    fail = true;
  }

  if (fail) {
    console.error('[clc-ci] FAILED');
    process.exit(1);
  }
  console.log('[clc-ci] PASS', gateTiming ? '(with timing gate)' : '(correctness only; set SEED_CLC_GATE_TIMING=1 + baseline for perf)');
}

main();
