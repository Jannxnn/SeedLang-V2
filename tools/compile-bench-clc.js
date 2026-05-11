/**
 * Regenerate bench/seedlang/bench_clc.c via bench/compile_clc_bench.js, then compile with OpenMP.
 * Uses tools/resolve-gcc.js so Cursor/CI shells without MinGW on PATH still find GCC when installed.
 */
const path = require('path');
const { execSync } = require('child_process');
const { resolveGcc } = require('./resolve-gcc');

const root = path.join(__dirname, '..');
const compileBench = path.join(root, 'bench', 'compile_clc_bench.js');
const cFile = path.join(root, 'bench', 'seedlang', 'bench_clc.c');
const exeFile = path.join(
  root,
  'bench',
  'seedlang',
  process.platform === 'win32' ? 'bench_clc.exe' : 'bench_clc',
);

const cc = resolveGcc();
if (!cc) {
  console.error(
    'No C compiler found. Set SEED_GCC to the full path of gcc (e.g. MinGW x86_64-w64-mingw32-gcc.exe), or put gcc on PATH.',
  );
  process.exit(1);
}

console.log('Using compiler:', cc.replace(/"/g, ''));
execSync(`node "${compileBench}"`, { stdio: 'inherit', cwd: root });

const omp = process.env.SEED_OPENMP === '0' ? '' : ' -fopenmp';
const opt = process.env.SEED_CLC_OPT || '-O2';
const cmd = `${cc} ${opt}${omp} -o "${exeFile}" "${cFile}" -lm`;
console.log('Compile:', cmd);
execSync(cmd, { stdio: 'inherit', cwd: root, shell: true });
console.log('OK:', exeFile);
