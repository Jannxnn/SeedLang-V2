#!/usr/bin/env node
/**
 * Build native particle benchmarks to build/*.exe (same MinGW link flags as CLC Win32).
 *
 *   npm run compile:particle-bench-win32
 *
 * Outputs:
 *   build/particle_bench_cpp.exe   — C++ + tools/clc/sl_win32_rt.c
 *   build/particle_bench_rust.exe  — cargo --release, copied from target/release/
 *
 * Requires: Windows, MinGW gcc (SEED_GCC / CC / PATH / WIN_DEFAULT_GCC), Rust toolchain (cargo).
 *
 * 粒子数（可选）：PARTICLE_BENCH_FIXED_N 全程固定；不设则默认「0→8000 爬坡再驻留」（与 stress）；PARTICLE_BENCH_TIER_MODE=1 为档位轮换。
 * 确定性/CI：`PARTICLE_BENCH_RNG_SEED`、`PARTICLE_BENCH_MAX_FRAMES` 与 `examples/clc/win32_stress_sustained.seed` 同语义。自测三者 stdout：`npm run verify:particle-bench-consistency`（Rust 用 `cargo build --release --features console` 子集）。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { resolveGcc, WIN_DEFAULT_GCC } = require('./resolve-gcc.js');

function quoteCmd(p) {
  const s = String(p).replace(/^"|"$/g, '');
  return s.includes(' ') ? `"${s}"` : s;
}

/** Prefer g++.exe beside gcc.exe so libstdc++ links like Seed’s CLI path. */
function resolveGppDriver(gccPathUnquoted) {
  const g = String(gccPathUnquoted).replace(/^"|"$/g, '');
  if (/gcc\.exe$/i.test(g)) {
    const gpp = g.replace(/gcc\.exe$/i, 'g++.exe');
    if (fs.existsSync(gpp)) return quoteCmd(gpp);
  }
  if (
    g === 'gcc' ||
    path.basename(g).toLowerCase() === 'gcc.exe' ||
    path.basename(g).toLowerCase() === 'gcc'
  ) {
    try {
      execSync('g++ -dumpversion', { stdio: 'pipe', timeout: 8000, shell: true });
      return 'g++';
    } catch {
      /* fall through */
    }
  }
  return quoteCmd(gccPathUnquoted);
}

function main() {
  if (process.platform !== 'win32') {
    console.error('compile:particle-bench-win32: Windows only (Win32 + MinGW).');
    process.exit(1);
  }

  const repoRoot = path.join(__dirname, '..');
  const buildDir = path.join(repoRoot, 'build');
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  let gcc = resolveGcc();
  if (gcc) gcc = gcc.replace(/^"|"$/g, '');
  if (!gcc) gcc = WIN_DEFAULT_GCC;
  const gccOk = fs.existsSync(gcc) || /^gcc|clang$/i.test(path.basename(gcc));

  const cppSrc = path.join(repoRoot, 'examples', 'particle_bench_win32', 'particle_bench.cpp');
  const rtPath = path.join(repoRoot, 'tools', 'clc', 'sl_win32_rt.c');
  const incPath = path.join(repoRoot, 'tools', 'clc');
  const cppExe = path.join(buildDir, 'particle_bench_cpp.exe');
  const cppObj = path.join(buildDir, '_particle_bench_cpp.obj');
  const rtObj = path.join(buildDir, '_particle_bench_rt.obj');
  /** Static GCC/C++ runtime so the exe runs without MinGW bin on PATH (libgcc_s_seh-1.dll, etc.). */
  const sfx = '-static-libgcc -static-libstdc++ -mwindows -municode -luser32 -lgdi32 -lcomdlg32 -lwinmm';

  if (!gccOk) {
    console.warn(
      'compile:particle-bench-win32: skip C++ (no gcc; set SEED_GCC or install MinGW).'
    );
  } else {
    const cxx = resolveGppDriver(gcc);
    const cc = quoteCmd(gcc);
    try {
      execSync(`${cxx} -O3 -std=c++17 -I"${incPath}" -c "${cppSrc}" -o "${cppObj}"`, {
        stdio: 'inherit',
        cwd: repoRoot,
        timeout: 120000
      });
      execSync(`${cc} -O3 -I"${incPath}" -c "${rtPath}" -o "${rtObj}"`, {
        stdio: 'inherit',
        cwd: repoRoot,
        timeout: 120000
      });
      execSync(`${cxx} -o "${cppExe}" "${cppObj}" "${rtObj}" ${sfx}`, {
        stdio: 'inherit',
        cwd: repoRoot,
        timeout: 300000
      });
      try {
        fs.unlinkSync(cppObj);
      } catch (e) {}
      try {
        fs.unlinkSync(rtObj);
      } catch (e) {}
      console.log(`compile:particle-bench-win32: ${path.relative(repoRoot, cppExe)}`);
    } catch (e) {
      console.error('compile:particle-bench-win32: C++ link failed.');
      process.exit(1);
    }
  }

  const rustDir = path.join(repoRoot, 'examples', 'particle_bench_win32', 'rust');
  const rustRelease = path.join(rustDir, 'target', 'release', 'particle_bench_rust.exe');
  const rustOut = path.join(buildDir, 'particle_bench_rust.exe');

  try {
    execSync('cargo build --release', { stdio: 'inherit', cwd: rustDir, timeout: 600000 });
  } catch (e) {
    console.error('compile:particle-bench-win32: cargo build failed (install Rust).');
    process.exit(1);
  }
  if (!fs.existsSync(rustRelease)) {
    console.error('compile:particle-bench-win32: missing cargo output:', rustRelease);
    process.exit(1);
  }
  fs.copyFileSync(rustRelease, rustOut);
  console.log(`compile:particle-bench-win32: ${path.relative(repoRoot, rustOut)}`);
}

main();
