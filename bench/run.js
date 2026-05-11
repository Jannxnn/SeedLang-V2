'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BENCH_DIR = __dirname;
const ROOT_DIR = path.join(BENCH_DIR, '..');
const SOURCES_DIR = path.join(BENCH_DIR, 'sources');
const SEED_DIR = path.join(BENCH_DIR, 'seedlang');
const BIN_DIR = path.join(BENCH_DIR, 'bin');
const SELFHOST_DIR = path.join(ROOT_DIR, 'selfhost', 'clc');

const TESTS = ['fib', 'loop', 'array', 'nested', 'string', 'math'];
const RUNS = 3;

function ms(sec) { return (sec * 1000).toFixed(0); }

let _gccPath = null;
function findGcc() {
    if (_gccPath !== null) return _gccPath;
    const candidates = [];
    if (process.env.SEED_GCC) candidates.push(process.env.SEED_GCC);
    candidates.push('gcc', 'cc', 'C:\\msys64\\ucrt64\\bin\\gcc.exe', 'C:\\msys64\\mingw64\\bin\\gcc.exe');
    for (const c of candidates) {
        try { execSync(`"${c}" --version`, { timeout: 5000, stdio: 'pipe' }); _gccPath = c; return c; } catch {}
    }
    _gccPath = '';
    return null;
}

function findGpp() {
    const candidates = [];
    if (process.env.SEED_GPP) candidates.push(process.env.SEED_GPP);
    candidates.push('g++', 'c++', 'C:\\msys64\\ucrt64\\bin\\g++.exe', 'C:\\msys64\\mingw64\\bin\\g++.exe');
    for (const c of candidates) {
        try { execSync(`"${c}" --version`, { timeout: 5000, stdio: 'pipe' }); return c; } catch {}
    }
    return null;
}

function findRustc() {
    try { execSync('rustc --version', { timeout: 5000, stdio: 'pipe' }); return 'rustc'; } catch { return null; }
}

function findPython() {
    for (const c of ['python3', 'python', 'py']) {
        try { execSync(`"${c}" --version`, { timeout: 5000, stdio: 'pipe' }); return c; } catch {}
    }
    return null;
}

function getMsysEnv() {
    const gcc = findGcc();
    if (!gcc) return process.env;
    const msysBin = path.dirname(gcc);
    const envPath = `${msysBin};${process.env.Path || process.env.PATH || ''}`;
    return { ...process.env, Path: envPath, PATH: envPath };
}

function run(cmd, cwd) {
    try {
        const start = process.hrtime.bigint();
        const out = execSync(cmd, { cwd: cwd || BENCH_DIR, timeout: 120000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: getMsysEnv() });
        const end = process.hrtime.bigint();
        const cleaned = out.replace(/^\[VM Mode\] Running:.*\n*/m, '').trim();
        return { ok: true, time: Number(end - start) / 1e9, output: cleaned };
    } catch (e) {
        return { ok: false, time: -1, output: (e.stderr || e.stdout || e.message || '').slice(0, 300) };
    }
}

function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function bench(cmd, cwd) {
    const times = [];
    let output = '';
    for (let i = 0; i < RUNS; i++) {
        const r = run(cmd, cwd);
        if (!r.ok) return { ok: false, time: -1, output: r.output };
        times.push(r.time);
        output = r.output;
    }
    return { ok: true, time: median(times), output };
}

function fmt(ratio) {
    if (ratio < 0.01) return '<0.01x';
    if (ratio < 1) return ratio.toFixed(2) + 'x';
    if (ratio < 10) return ratio.toFixed(1) + 'x';
    return Math.round(ratio) + 'x';
}

function main() {
    const gcc = findGcc();
    const gpp = findGpp();
    const rustc = findRustc();
    const python = findPython();
    const cli = `node "${path.join(ROOT_DIR, 'dist', 'cli.js')}"`;
    const selfhostSeed = path.join(SELFHOST_DIR, 'clc_cli_full.seed');
    const hasSelfhost = fs.existsSync(selfhostSeed);

    if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

    console.log('================================================================');
    console.log('  SeedLang Performance Benchmark');
    console.log('================================================================');
    console.log();
    console.log(`  GCC:          ${gcc || '(not found)'}`);
    console.log(`  G++:          ${gpp || '(not found)'}`);
    console.log(`  Rust:         ${rustc || '(not found)'}`);
    console.log(`  Python:       ${python || '(not found)'}`);
    console.log(`  Selfhost CLC: ${hasSelfhost ? selfhostSeed : '(not found)'}`);
    console.log(`  Runs:         ${RUNS} (median)`);
    console.log();

    const results = {};

    // --- Compile native binaries ---
    console.log('-- Compiling native binaries --');

    if (gcc) {
        console.log('  Compiling C...');
        const r = run(`"${gcc}" -O2 -o "${path.join(BIN_DIR, 'bench_c.exe')}" "${path.join(SOURCES_DIR, 'bench_c.c')}" -lm`);
        if (!r.ok) console.log('    FAILED: ' + r.output.split('\n')[0]);
    }
    if (gpp) {
        console.log('  Compiling C++...');
        const r = run(`"${gpp}" -O2 -o "${path.join(BIN_DIR, 'bench_cpp.exe')}" "${path.join(SOURCES_DIR, 'bench.cpp')}" -lm`);
        if (!r.ok) console.log('    FAILED: ' + r.output.split('\n')[0]);
    }
    if (rustc) {
        console.log('  Compiling Rust...');
        const r = run(`"${rustc}" -C opt-level=2 -o "${path.join(BIN_DIR, 'bench_rust.exe')}" "${path.join(SOURCES_DIR, 'bench.rs')}"`);
        if (!r.ok) console.log('    FAILED: ' + r.output.split('\n')[0]);
    }

    // --- Compile Seed CLC (TS CLI -> C) ---
    console.log('  Compiling Seed CLC (TS CLI -> C -> GCC -O2)...');
    console.log('  Note: bench uses --no-memo on --compile-c so fib stays naive recursion (no CLC auto memo wrap).');
    let clcAvailable = false;
    for (const t of TESTS) {
        const seedFile = path.join(SEED_DIR, `bench_${t}.seed`);
        const cFile = path.join(BIN_DIR, `bench_${t}.c`);
        if (!fs.existsSync(seedFile)) continue;
        run(`${cli} --compile-c --no-memo "${seedFile}" -o "${cFile}"`);
        if (!fs.existsSync(cFile)) continue;
        if (gcc) {
            run(`"${gcc}" -O2 -o "${path.join(BIN_DIR, `bench_clc_${t}.exe`)}" "${cFile}" -lm`);
            if (fs.existsSync(path.join(BIN_DIR, `bench_clc_${t}.exe`))) clcAvailable = true;
        }
    }

    // --- Compile Seed Selfhost CLC (Selfhost -> C) ---
    console.log('  Compiling Seed Selfhost CLC (Selfhost compiler -> C -> GCC -O2)...');
    let selfhostAvailable = false;
    if (hasSelfhost && gcc) {
        for (const t of TESTS) {
            const seedFile = path.join(SEED_DIR, `bench_${t}.seed`);
            const cFile = path.join(BIN_DIR, `bench_selfhost_${t}.c`);
            if (!fs.existsSync(seedFile)) continue;
            run(`${cli} "${selfhostSeed}" --compile-c --no-memo "${seedFile}" -o "${cFile}"`);
            if (!fs.existsSync(cFile)) continue;
            run(`"${gcc}" -O2 -o "${path.join(BIN_DIR, `bench_selfhost_${t}.exe`)}" "${cFile}" -lm`);
            if (fs.existsSync(path.join(BIN_DIR, `bench_selfhost_${t}.exe`))) selfhostAvailable = true;
        }
    }
    console.log();

    // --- Run benchmarks ---
    console.log('-- Running benchmarks --');
    console.log();

    const langConfigs = [
        { name: 'C', cmd: (t) => `"${path.join(BIN_DIR, 'bench_c.exe')}" ${t}`, available: !!gcc && fs.existsSync(path.join(BIN_DIR, 'bench_c.exe')) },
        { name: 'C++', cmd: (t) => `"${path.join(BIN_DIR, 'bench_cpp.exe')}" ${t}`, available: !!gpp && fs.existsSync(path.join(BIN_DIR, 'bench_cpp.exe')) },
        { name: 'Rust', cmd: (t) => `"${path.join(BIN_DIR, 'bench_rust.exe')}" ${t}`, available: !!rustc && fs.existsSync(path.join(BIN_DIR, 'bench_rust.exe')) },
        { name: 'Seed-CLC', cmd: (t) => `"${path.join(BIN_DIR, `bench_clc_${t}.exe`)}"`, available: clcAvailable },
        { name: 'Seed-Self', cmd: (t) => `"${path.join(BIN_DIR, `bench_selfhost_${t}.exe`)}"`, available: selfhostAvailable },
        { name: 'JS-V8', cmd: (t) => `node "${path.join(SOURCES_DIR, 'bench.js')}" ${t}`, available: true },
        { name: 'Seed-VM', cmd: (t) => `${cli} --vm "${path.join(SEED_DIR, t === 'loop' ? 'bench_loop_vm.seed' : `bench_${t}.seed`)}"`, available: true, vmLoop: true },
        { name: 'Python', cmd: (t) => `"${python}" "${path.join(SOURCES_DIR, 'bench.py')}" ${t}`, available: !!python },
    ];

    const activeLangs = langConfigs.filter(l => l.available);

    for (const test of TESTS) {
        console.log(`  [${test}]`);
        for (const lang of activeLangs) {
            const r = bench(lang.cmd(test));
            if (r.ok) {
                const key = `${lang.name}:${test}`;
                results[key] = { time: r.time, output: r.output };
                const outLine = r.output.split('\n').pop() || '';
                const suffix = (lang.vmLoop && test === 'loop') ? ' (10M)' : '';
                console.log(`    ${(lang.name + suffix).padEnd(12)} ${ms(r.time).padStart(8)}ms  =>  ${outLine}`);
            } else {
                console.log(`    ${lang.name.padEnd(12)}   FAILED`);
            }
        }
        console.log();
    }

    // --- Summary table ---
    console.log('================================================================');
    console.log('  Summary (time in ms, lower is better)');
    console.log('================================================================');
    console.log();

    const COL = 14;
    const header = 'Benchmark'.padEnd(14) + activeLangs.map(l => (l.vmLoop ? l.name + '*' : l.name).padStart(COL)).join('');
    console.log(header);
    console.log('-'.repeat(header.length));

    const seedClcName = clcAvailable ? 'Seed-CLC' : (selfhostAvailable ? 'Seed-Self' : null);

    for (const test of TESTS) {
        const row = [test.padEnd(14)];
        const seedClcTime = seedClcName ? results[`${seedClcName}:${test}`]?.time : null;

        for (const lang of activeLangs) {
            const key = `${lang.name}:${test}`;
            const r = results[key];
            if (!r) { row.push('  ---'.padStart(COL)); continue; }

            let cell = ms(r.time);
            if (lang.vmLoop && test === 'loop') {
                cell += ' 10M';
            } else if (seedClcTime && lang.name !== seedClcName && !lang.name.startsWith('Seed') && r.time > 0) {
                const ratio = seedClcTime / r.time;
                cell += ` ${fmt(ratio)}`;
            }
            row.push(cell.padStart(COL));
        }
        console.log(row.join(''));
    }

    console.log();
    if (seedClcName) console.log(`  Ratio: ${seedClcName}/Target (<1.0 = Seed faster, >1.0 = Seed slower)`);
    console.log('  * Seed-VM loop uses 10M iterations (others use 100M)');

    // --- Category summary ---
    console.log();
    console.log('-- Category Summary --');
    console.log();

    const compiledLangs = activeLangs.filter(l => ['C', 'C++', 'Rust', 'Seed-CLC', 'Seed-Self'].includes(l.name));
    const scriptLangs = activeLangs.filter(l => ['JS-V8', 'Seed-VM', 'Python'].includes(l.name));

    if (compiledLangs.length > 1) {
        const seedNames = compiledLangs.filter(l => l.name.startsWith('Seed'));
        for (const sn of seedNames) {
            console.log(`  ${sn.name} vs native (C/C++/Rust):`);
            let totalRatio = 0, count = 0;
            for (const test of TESTS) {
                const seedTime = results[`${sn.name}:${test}`]?.time;
                if (!seedTime) continue;
                for (const lang of compiledLangs) {
                    if (lang.name === sn.name) continue;
                    const t = results[`${lang.name}:${test}`]?.time;
                    if (t && t > 0) { totalRatio += seedTime / t; count++; }
                }
            }
            if (count > 0) console.log(`    Average ratio: ${fmt(totalRatio / count)} (1.0x = parity)`);
            console.log();
        }
    }

    if (scriptLangs.length > 1) {
        console.log('  Scripting/VM comparison (excl. loop for Seed-VM*):');
        let seedVmJs = 0, seedVmPy = 0, count = 0;
        for (const test of TESTS) {
            if (test === 'loop') continue;
            const sv = results['Seed-VM:' + test]?.time;
            const js = results['JS-V8:' + test]?.time;
            const py = results['Python:' + test]?.time;
            if (sv && js) { seedVmJs += sv / js; count++; }
            if (sv && py) seedVmPy += sv / py;
        }
        if (count > 0) {
            console.log(`    Seed-VM / JS-V8:   ${fmt(seedVmJs / count)}`);
            if (seedVmPy > 0) console.log(`    Seed-VM / Python:  ${fmt(seedVmPy / count)}`);
        }
        console.log();
    }

    // --- Compiler speed ---
    console.log('-- Compiler Speed --');
    console.log();

    const compilerTests = [
        { name: 'fib (6 lines)', file: path.join(SEED_DIR, 'bench_fib.seed') },
        { name: 'loop (6 lines)', file: path.join(SEED_DIR, 'bench_loop.seed') },
        { name: 'nested (9 lines)', file: path.join(SEED_DIR, 'bench_nested.seed') },
    ];

    for (const ct of compilerTests) {
        if (!fs.existsSync(ct.file)) continue;
        const r = bench(`${cli} --compile-c --no-memo "${ct.file}" -o nul`);
        if (r.ok) console.log(`  ${ct.name.padEnd(20)} ${ms(r.time).padStart(8)}ms`);
    }
    console.log();

    console.log('Done.');
}

main();
