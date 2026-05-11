#!/usr/bin/env node
/**
 * Same Seed-generated Win32 .c; only gcc -O0 vs -O2 changes (isolates backend optimization).
 * Usage: node bench/win32/ablate_gcc_o0_o2.js [seedFile under bench/win32]
 *
 * Timing helpers aligned with bench/win32/run_win32_perf.js (inject + STATS format).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { resolveGcc, WIN_DEFAULT_GCC } = require('../../tools/resolve-gcc.js');

const WIN32_DIR = __dirname;
const ROOT_DIR = path.join(WIN32_DIR, '..', '..');
const DIST_CLI = path.join(ROOT_DIR, 'dist', 'cli.js');
const RT_PATH = path.join(ROOT_DIR, 'tools', 'clc', 'sl_win32_rt.c');
const INC_PATH = path.join(ROOT_DIR, 'tools', 'clc');

const TIMING_PREFIX = `
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif
#include <stdio.h>
#include <math.h>
#include <stdlib.h>

static double g_ft[8192];
static int g_fc = 0;
static double g_fs = 0;
static double g_ct[8192];
static int g_cc = 0;
static double g_compute_start = 0;
static int g_warmup = 10;
static int g_atexit_set = 0;
static const char* g_perf_out_path = NULL;

static double perf_ms(void) {
    LARGE_INTEGER freq, counter;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&counter);
    return (double)counter.QuadPart / (double)freq.QuadPart * 1000.0;
}

extern int sl_win32_poll_events(void);
extern void sl_win32_present(void);

static long long sl_win32_poll_events_timed(void) {
    int result = sl_win32_poll_events();
    g_compute_start = perf_ms();
    if (g_fs > 0.0) {
        if (g_warmup > 0) {
            g_warmup--;
        } else if (g_fc < 8192) {
            g_ft[g_fc++] = g_compute_start - g_fs;
        }
    }
    g_fs = g_compute_start;
    return (long long)result;
}

static void sl_win32_present_timed(void) {
    double compute_end = perf_ms();
    if (g_compute_start > 0.0 && g_warmup <= 0 && g_cc < 8192) {
        g_ct[g_cc++] = compute_end - g_compute_start;
    }
    sl_win32_present();
}

static void _perf_atexit_fn(void);

static void sort_and_stats(double* arr, int n, const char* label, const char* fpath, FILE* f) {
    if (n == 0) { fprintf(f, "STATS %s NO_FRAMES\\n", label); return; }
    int i, j;
    for (i = 0; i < n - 1; i++)
        for (j = i + 1; j < n; j++)
            if (arr[i] > arr[j]) { double t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    double median = (n % 2 == 1) ? arr[n/2] : (arr[n/2-1] + arr[n/2]) * 0.5;
    double p95 = arr[(int)(n * 0.95)];
    double min_ft = arr[0];
    double max_ft = arr[n-1];
    double sum = 0;
    for (i = 0; i < n; i++) sum += arr[i];
    double mean = sum / n;
    double vs = 0;
    for (i = 0; i < n; i++) vs += (arr[i] - mean) * (arr[i] - mean);
    double sd = sqrt(vs / n);
    double cv = (mean > 0) ? (sd / mean * 100.0) : 999.0;
    fprintf(f, "STATS %s frames=%d median=%.4f mean=%.4f sd=%.4f cv=%.1f p95=%.4f min=%.4f max=%.4f\\n",
           label, n, median, mean, sd, cv, p95, min_ft, max_ft);
}

static void print_frame_stats_to_file(const char* label, const char* fpath) {
    FILE* f = fopen(fpath, "w");
    if (!f) return;
    sort_and_stats(g_ft, g_fc, label, fpath, f);
    sort_and_stats(g_ct, g_cc, "compute", fpath, f);
    fclose(f);
}
`;

function makeAtexit(label) {
  return `
static void _perf_atexit_fn(void) {
    if (g_perf_out_path) print_frame_stats_to_file("${label}", g_perf_out_path);
}
`;
}

function injectTiming(cCode, label, statsPath) {
  cCode = cCode.replace(
    /\(long long\)sl_win32_poll_events\(\)/g,
    '(long long)sl_win32_poll_events_timed()'
  );
  cCode = cCode.replace(/sl_win32_present\(\)/g, 'sl_win32_present_timed()');
  cCode = TIMING_PREFIX + '\n' + cCode;
  cCode += '\n' + makeAtexit(label);
  const escapedPath = statsPath.replace(/\\/g, '\\\\');
  const initBlock = `
    if (!g_atexit_set) {
        g_atexit_set = 1;
        g_perf_out_path = "${escapedPath}";
        atexit(_perf_atexit_fn);
    }
`;
  cCode = cCode.replace(
    'int sl_user_main(int argc, char* argv[]) {',
    'int sl_user_main(int argc, char* argv[]) {' + initBlock
  );
  return cCode;
}

function parseStats(content) {
  const lines = content.split('\n');
  let totalStats = null;
  let computeStats = null;
  for (const line of lines) {
    const m = line.match(
      /^STATS\s+(\S+)\s+frames=(\d+)\s+median=([\d.]+)\s+mean=([\d.]+)\s+sd=([\d.]+)\s+cv=([\d.]+)\s+p95=([\d.]+)\s+min=([\d.]+)\s+max=([\d.]+)/
    );
    if (m) {
      const s = {
        label: m[1],
        frames: parseInt(m[2]),
        median: parseFloat(m[3]),
        mean: parseFloat(m[4]),
        sd: parseFloat(m[5]),
        cv: parseFloat(m[6]),
        p95: parseFloat(m[7]),
        min: parseFloat(m[8]),
        max: parseFloat(m[9])
      };
      if (s.label === 'compute') computeStats = s;
      else totalStats = s;
    }
  }
  if (totalStats) totalStats.compute = computeStats;
  return totalStats;
}

function getGcc() {
  let gcc = resolveGcc();
  if (gcc) gcc = gcc.replace(/^"|"$/g, '');
  if (!gcc) gcc = WIN_DEFAULT_GCC;
  if (!fs.existsSync(gcc) && !/^(gcc|clang)$/i.test(path.basename(gcc))) return null;
  return gcc;
}

function compileC(cPath, exePath, optLevel) {
  const gcc = getGcc();
  if (!gcc) return 'no compiler';
  const qgcc = `"${String(gcc).replace(/"/g, '')}"`;
  const sfx = '-mwindows -municode -luser32 -lgdi32 -lcomdlg32 -lwinmm';
  try {
    execSync(`${qgcc} ${optLevel} -I"${INC_PATH}" -o "${exePath}" "${cPath}" "${RT_PATH}" ${sfx}`, {
      stdio: 'pipe',
      timeout: 120000
    });
    return null;
  } catch (e) {
    return String(e.stderr || e.message);
  }
}

function ratio(a, b) {
  return b && b.median > 0 ? a.median / b.median : 0;
}

function runOnce(seedPath, optLevel, mode) {
  let source = fs.readFileSync(seedPath, 'utf8');
  if (mode !== undefined) source = source.replace(/MODE = \d+/, `MODE = ${mode}`);
  const cli = require(DIST_CLI);
  let cCode = cli.compileToC(source, { clcSubsystem: 'windows' });
  const tmpDir = path.join(os.tmpdir(), 'seed-ablate-o');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const label = `ablate_${path.basename(seedPath)}_${optLevel}`;
  const statsPath = path.join(tmpDir, `stats_${label}_${Date.now()}.txt`);
  cCode = injectTiming(cCode, label, statsPath);
  const base = path.join(tmpDir, `b_${Date.now()}_${optLevel.replace(/-/g, '')}`);
  const cPath = `${base}.c`;
  const exePath = `${base}.exe`;
  fs.writeFileSync(cPath, cCode, 'utf8');
  const err = compileC(cPath, exePath, optLevel);
  if (err) {
    console.error(optLevel, 'compile failed:', err.slice(0, 600));
    try {
      fs.unlinkSync(cPath);
    } catch (_) {}
    return null;
  }
  try {
    execSync(`"${exePath}"`, {
      encoding: 'utf8',
      timeout: 60000,
      env: { ...process.env, SEED_WIN32_AUTOCLOSE: '1' }
    });
  } catch (_) {
    try {
      fs.unlinkSync(cPath);
      fs.unlinkSync(exePath);
    } catch (_) {}
    return null;
  }
  let content;
  try {
    content = fs.readFileSync(statsPath, 'utf8');
  } catch (_) {
    content = '';
  }
  try {
    fs.unlinkSync(cPath);
    fs.unlinkSync(exePath);
    fs.unlinkSync(statsPath);
  } catch (_) {}
  return parseStats(content);
}

function main() {
  const seedName = process.argv[2] || 'test1_acae_collision.seed';
  const seedPath = path.join(WIN32_DIR, seedName);
  if (process.platform !== 'win32') {
    console.log('Skip: Windows only.');
    process.exit(0);
  }
  if (!fs.existsSync(DIST_CLI)) {
    console.error('Run npm run build first.');
    process.exit(1);
  }
  if (!fs.existsSync(seedPath)) {
    console.error('Missing:', seedPath);
    process.exit(1);
  }

  let mode;
  const modeArg = process.argv[3];
  if (modeArg !== undefined && modeArg !== '') mode = parseInt(modeArg, 10);

  console.log(`File: bench/win32/${seedName}${mode !== undefined ? ` (MODE=${mode})` : ''}`);
  console.log('Same compileToC output; comparing gcc -O0 vs -O2.\n');

  const o0 = runOnce(seedPath, '-O0', mode);
  const o2 = runOnce(seedPath, '-O2', mode);
  if (!o0 || !o2) {
    console.error('Measurement failed (compile or run).');
    process.exit(1);
  }

  const rt = ratio(o0, o2);
  const rc = o0.compute && o2.compute ? ratio(o0.compute, o2.compute) : 0;

  console.log('Total frame median:');
  console.log(`  -O0  ${o0.median.toFixed(4)} ms`);
  console.log(`  -O2  ${o2.median.toFixed(4)} ms`);
  console.log(`  O0/O2 = ${rt.toFixed(2)}x  (how much gcc -O2 speeds **this fixed .c**)`);

  if (o0.compute && o2.compute) {
    console.log('\nCompute slice median (poll→present):');
    console.log(`  -O0  ${o0.compute.median.toFixed(4)} ms`);
    console.log(`  -O2  ${o2.compute.median.toFixed(4)} ms`);
    console.log(`  O0/O2 = ${rc.toFixed(2)}x`);
  }

  console.log('\nSeed sets the **shape** of the C; GCC sets **machine code quality** for that file.');
  console.log('Neither is “fake”; publish **both -O0 and -O2** if someone doubts GCC.');
}

main();
