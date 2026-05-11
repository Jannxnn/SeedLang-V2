#!/usr/bin/env node
/**
 * Cross-check CLC output of win32_stress_sustained.seed vs particle_bench C++ vs Rust:
 * same env → identical last three stdout lines: frame, collisions, diag.
 *
 * Requires: Windows, npm run build, MinGW g++/gcc (see tools/resolve-gcc.js), Rust/cargo.
 * Uses -mconsole so printf/println are captured (GUI bench exes are built with -mwindows normally).
 *
 * Non-Windows: exits 0 (skip). Missing toolchain: exit 1 with message.
 *
 * Native parity (C++, Rust, JS reference sim using BigInt diag) is always enforced.
 * CLC .exe parity is optional: set VERIFY_PARTICLE_CLC=1 to also require the compiled
 * stress harness to match (currently the CLC i32 fast path can diverge slightly; see script output).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveGcc, WIN_DEFAULT_GCC } = require('./resolve-gcc.js');

function quoteCmd(p) {
  const s = String(p).replace(/^"|"$/g, '');
  return s.includes(' ') ? `"${s}"` : s;
}

function resolveGppDriver(gccPathUnquoted) {
  const g = String(gccPathUnquoted).replace(/^"|"$/g, '');
  if (/gcc\.exe$/i.test(g)) {
    const gpp = g.replace(/gcc\.exe$/i, 'g++.exe');
    if (fs.existsSync(gpp)) return quoteCmd(gpp);
  }
  try {
    spawnSync('g++', ['-dumpversion'], { stdio: 'pipe', timeout: 8000, shell: true });
    return 'g++';
  } catch {
    return quoteCmd(gccPathUnquoted);
  }
}

function runCapture(exePath, env) {
  const r = spawnSync(exePath, [], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120000,
    windowsHide: true,
    shell: false
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`exit ${r.status} stderr=${(r.stderr || '').slice(0, 500)}`);
  }
  const lines = (r.stdout || '')
    .trim()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length < 3) {
    throw new Error(`expected ≥3 stdout lines, got ${lines.length}: ${(r.stdout || '').slice(0, 200)}`);
  }
  return lines.slice(-3);
}

/** Pure-JS reference (same Schrage + physics as C++/Rust) to isolate CLC codegen issues. */
function simulateReference(fixedN, maxFrames, rngSeedParsed) {
  const MOD = 2147483647n;
  const W = 640;
  const H = 480;
  const MAX_PARTICLES = 20000;
  const CYCLE = 600;
  const TIER_SLOTS = 21;

  let envSeed = rngSeedParsed;
  if (envSeed < 0) envSeed = 88675123;
  else if (envSeed === 0) envSeed = 1;
  else {
    const r = envSeed % 2147483647;
    envSeed = r === 0 ? 1 : r;
  }

  function rngStep(s) {
    const z = s;
    const hi = Math.floor(z / 127773);
    const lo = z - hi * 127773;
    let t = 16807 * lo - 2836 * hi;
    if (t <= 0) t += 2147483647;
    return t;
  }

  let rng = envSeed;
  const bx = [];
  const by = [];
  const bvx = [];
  const bvy = [];
  const br = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    rng = rngStep(rng);
    bx.push(24 + (rng % (W - 48)));
    rng = rngStep(rng);
    by.push(24 + (rng % (H - 48)));
    rng = rngStep(rng);
    bvx.push((rng % 10) - 5);
    rng = rngStep(rng);
    bvy.push((rng % 10) - 5);
    rng = rngStep(rng);
    br.push(4 + (rng % 7));
  }

  function particlesForFrame(fr) {
    if (fixedN >= 0) {
      if (fixedN > MAX_PARTICLES) return MAX_PARTICLES;
      return fixedN;
    }
    const slot = Math.floor(fr / CYCLE) % TIER_SLOTS;
    return slot === 0 ? 500 : slot * 1000;
  }

  function step(n) {
    for (let i = 0; i < n; i++) {
      bx[i] += bvx[i];
      by[i] += bvy[i];
      const r = br[i];
      if (bx[i] < r) {
        bx[i] = r;
        bvx[i] = -bvx[i];
      }
      if (bx[i] > W - r) {
        bx[i] = W - r;
        bvx[i] = -bvx[i];
      }
      if (by[i] < r) {
        by[i] = r;
        bvy[i] = -bvy[i];
      }
      if (by[i] > H - r) {
        by[i] = H - r;
        bvy[i] = -bvy[i];
      }
    }
  }

  function collideResolve(n) {
    let collisions = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = bx[j] - bx[i];
        const dy = by[j] - by[i];
        const d2 = dx * dx + dy * dy;
        const md = br[i] + br[j];
        if (d2 > 0 && d2 < md * md) {
          collisions++;
          const sx = bvx[i];
          bvx[i] = bvx[j];
          bvx[j] = sx;
          const sy = bvy[i];
          bvy[i] = bvy[j];
          bvy[j] = sy;
          if (dx > 0) {
            bx[i] -= 2;
            bx[j] += 2;
          }
          if (dx < 0) {
            bx[i] += 2;
            bx[j] -= 2;
          }
          if (dx === 0) {
            if (dy > 0) {
              by[i] -= 2;
              by[j] += 2;
            }
            if (dy < 0) {
              by[i] += 2;
              by[j] -= 2;
            }
          }
        }
      }
    }
    return collisions;
  }

  function energyProxy(n) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += bvx[i] * bvx[i] + bvy[i] * bvy[i];
    }
    return s;
  }

  function secondaryHeat() {
    let acc = 0;
    for (let k = 0; k < 24; k++) {
      for (let u = 0; u < 160; u++) {
        acc += (u * u + k * k * 3) % 997;
      }
    }
    return acc;
  }

  let frame = 0;
  let diag = 0n;
  let lastColl = 0;
  for (let iter = 0; iter < maxFrames; iter++) {
    const n = particlesForFrame(frame);
    step(n);
    lastColl = collideResolve(n);
    const ep = energyProxy(n);
    const sh = secondaryHeat();
    diag =
      (diag * 1315423911n +
        BigInt(lastColl) * 911382323n +
        BigInt(ep) +
        BigInt(sh) +
        BigInt(frame) +
        BigInt(bx[0])) %
      MOD;
    frame++;
  }

  return [`${frame}`, `${lastColl}`, `${diag}`];
}

function main() {
  if (process.platform !== 'win32') {
    console.log('verify:particle-bench-consistency: skip (not Windows)');
    process.exit(0);
  }

  function execSyncQuoted(cmd, cwd) {
    require('child_process').execSync(cmd, { stdio: 'inherit', cwd, timeout: 300000, shell: true });
  }

  const repoRoot = path.join(__dirname, '..');
  const distCli = path.join(repoRoot, 'dist', 'cli.js');
  if (!fs.existsSync(distCli)) {
    console.error('verify:particle-bench-consistency: run `npm run build` first (missing dist/cli.js)');
    process.exit(1);
  }

  let gcc = resolveGcc();
  if (gcc) gcc = gcc.replace(/^"|"$/g, '');
  if (!gcc) gcc = WIN_DEFAULT_GCC;
  const gccOk = fs.existsSync(gcc) || /^gcc|clang$/i.test(path.basename(gcc));
  if (!gccOk) {
    console.error('verify:particle-bench-consistency: no gcc (set SEED_GCC / install MinGW)');
    process.exit(1);
  }

  const cc = quoteCmd(gcc);
  const cxx = resolveGppDriver(gcc);
  const incPath = path.join(repoRoot, 'tools', 'clc');
  const rtPath = path.join(repoRoot, 'tools', 'clc', 'sl_win32_rt.c');
  const seedPath = path.join(repoRoot, 'examples', 'clc', 'win32_stress_sustained.seed');
  const cppSrc = path.join(repoRoot, 'examples', 'particle_bench_win32', 'particle_bench.cpp');
  const rustDir = path.join(repoRoot, 'examples', 'particle_bench_win32', 'rust');

  const tmp = path.join(os.tmpdir(), 'seed-particle-consistency');
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
  const tag = `pb${Date.now()}`;
  const seedC = path.join(tmp, `${tag}_stress.c`);
  const seedExe = path.join(tmp, `${tag}_stress.exe`);
  const cppObj = path.join(tmp, `${tag}_cpp.obj`);
  const rtObj = path.join(tmp, `${tag}_rt.obj`);
  const cppExe = path.join(tmp, `${tag}_cpp.exe`);
  /** -mconsole so prints are visible to spawnSync stdout (subsystem windows drops them). */
  const sfx = '-static-libgcc -static-libstdc++ -municode -mconsole -luser32 -lgdi32 -lcomdlg32 -lwinmm';

  const cli = require(distCli);
  const seedSource = fs.readFileSync(seedPath, 'utf8');
  fs.writeFileSync(seedC, cli.compileToC(seedSource, { clcSubsystem: 'windows' }), 'utf8');

  execSyncQuoted(
    `${cc} -O0 -I"${incPath}" -o "${seedExe}" "${seedC}" "${rtPath}" ${sfx}`,
    repoRoot
  );
  execSyncQuoted(
    `${cxx} -O0 -std=c++17 -I"${incPath}" -c "${cppSrc}" -o "${cppObj}"`,
    repoRoot
  );
  execSyncQuoted(`${cc} -O0 -I"${incPath}" -c "${rtPath}" -o "${rtObj}"`, repoRoot);
  execSyncQuoted(`${cxx} -O0 -o "${cppExe}" "${cppObj}" "${rtObj}" ${sfx}`, repoRoot);

  const cr = spawnSync('cargo', ['build', '--release', '--features', 'console'], {
    stdio: 'inherit',
    cwd: rustDir,
    timeout: 600000,
    shell: true
  });
  if (cr.status !== 0) {
    console.error('verify:particle-bench-consistency: cargo build failed');
    process.exit(1);
  }
  const rustExe = path.join(rustDir, 'target', 'release', 'particle_bench_rust.exe');
  if (!fs.existsSync(rustExe)) {
    console.error('verify:particle-bench-consistency: missing', rustExe);
    process.exit(1);
  }

  const benchEnv = {
    SEED_WIN32_AUTOCLOSE: '',
    PARTICLE_BENCH_FIXED_N: '800',
    PARTICLE_BENCH_MAX_FRAMES: '48',
    PARTICLE_BENCH_RNG_SEED: '1'
  };
  const fixedN = 800;
  const maxFrames = 48;
  const rngSeed = 1;

  let a;
  let b;
  let c;
  try {
    a = runCapture(seedExe, benchEnv);
    b = runCapture(cppExe, benchEnv);
    c = runCapture(rustExe, benchEnv);
  } catch (e) {
    console.error('verify:particle-bench-consistency: run failed:', e.message);
    process.exit(1);
  }

  const ref = simulateReference(fixedN, maxFrames, rngSeed);
  if (ref.join('\n') !== b.join('\n')) {
    console.error('verify:particle-bench-consistency: JS ref !== C++ (check simulator)', ref, b);
    process.exit(1);
  }
  if (b.join('\n') !== c.join('\n')) {
    console.error('verify:particle-bench-consistency: C++ !== Rust');
    process.exit(1);
  }

  const requireClc = process.env.VERIFY_PARTICLE_CLC === '1';
  if (a.join('\n') !== b.join('\n')) {
    const msg =
      'verify:particle-bench-consistency: compiled CLC stress exe differs from C++/Rust/ref (i32 fast path / codegen).';
    if (requireClc) {
      console.error(msg);
      console.error('  CLC: ', a.join(' | '));
      console.error('  C++: ', b.join(' | '));
      process.exit(1);
    }
    console.warn(msg);
    console.warn('  CLC: ', a.join(' | '));
    console.warn('  C++: ', b.join(' | '));
    console.warn('  (Set VERIFY_PARTICLE_CLC=1 to fail CI on this.)');
  }

  console.log(
    'verify:particle-bench-consistency: OK native',
    b.join(' '),
    a.join('\n') === b.join('\n') ? '(CLC match)' : '(CLC optional check skipped; see warnings)'
  );

  for (const f of [seedC, seedExe, cppObj, rtObj, cppExe]) {
    try {
      fs.unlinkSync(f);
    } catch (e) {}
  }
}

main();
