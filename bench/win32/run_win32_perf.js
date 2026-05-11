#!/usr/bin/env node
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

function compileSeedToC(source, mode) {
    if (mode !== undefined) {
        source = source.replace(/MODE = \d+/, `MODE = ${mode}`);
    }
    const cli = require(DIST_CLI);
    return cli.compileToC(source, { clcSubsystem: 'windows' });
}

function injectTiming(cCode, label, statsPath) {
    cCode = cCode.replace(
        /\(long long\)sl_win32_poll_events\(\)/g,
        '(long long)sl_win32_poll_events_timed()'
    );
    cCode = cCode.replace(
        /sl_win32_present\(\)/g,
        'sl_win32_present_timed()'
    );
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

function getGcc() {
    let gcc = resolveGcc();
    if (gcc) gcc = gcc.replace(/^"|"$/g, '');
    if (!gcc) gcc = WIN_DEFAULT_GCC;
    if (!fs.existsSync(gcc) && !/^(gcc|clang)$/i.test(path.basename(gcc))) return null;
    return gcc;
}

function compileC(cPath, exePath, extraFlags) {
    const gcc = getGcc();
    if (!gcc) return 'no compiler';
    const qgcc = `"${String(gcc).replace(/"/g, '')}"`;
    const sfx = '-mwindows -municode -luser32 -lgdi32 -lcomdlg32 -lwinmm';
    const flags = extraFlags ? `-O2 ${extraFlags}` : '-O2';
    try {
        execSync(`${qgcc} ${flags} -I"${INC_PATH}" -o "${exePath}" "${cPath}" "${RT_PATH}" ${sfx}`, {
            stdio: 'pipe', timeout: 120000
        });
        return null;
    } catch (e) {
        return String(e.stderr || e.message).split('\n').slice(0, 3).join('\n');
    }
}

function compileConsoleC(cPath, exePath, extraFlags) {
    const gcc = getGcc();
    if (!gcc) return 'no compiler';
    const qgcc = `"${String(gcc).replace(/"/g, '')}"`;
    const flags = extraFlags ? `-O2 ${extraFlags}` : '-O2';
    try {
        execSync(`${qgcc} ${flags} -o "${exePath}" "${cPath}"`, {
            stdio: 'pipe', timeout: 120000
        });
        return null;
    } catch (e) {
        return String(e.stderr || e.message).split('\n').slice(0, 3).join('\n');
    }
}

function runExe(exePath, timeoutMs, envExtra) {
    try {
        return execSync(`"${exePath}"`, {
            encoding: 'utf8',
            timeout: timeoutMs || 60000,
            env: { ...process.env, ...envExtra }
        });
    } catch (e) {
        return null;
    }
}

function compileAndRun(cCode, label, statsPath, extraFlags) {
    const tmpDir = path.join(os.tmpdir(), 'seed-win32-perf');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const base = path.join(tmpDir, `perf_${label}_${Date.now()}`);
    const cPath = `${base}.c`;
    const exePath = `${base}.exe`;

    fs.writeFileSync(cPath, cCode, 'utf8');

    const compileErr = compileC(cPath, exePath, extraFlags);
    if (compileErr) {
        console.log(`  FAIL: GCC compilation error`);
        console.log(`  ${compileErr}`);
        cleanup(cPath, exePath, statsPath);
        return null;
    }

    const runOut = runExe(exePath, 60000);
    if (!runOut) {
        console.log(`  FAIL: runtime error (timeout or crash)`);
        cleanup(cPath, exePath, statsPath);
        return null;
    }

    let statsContent;
    try {
        statsContent = fs.readFileSync(statsPath, 'utf8');
    } catch (e) {
        console.log(`  FAIL: stats file not found`);
        cleanup(cPath, exePath, statsPath);
        return null;
    }

    cleanup(cPath, exePath, statsPath);
    return statsContent;
}

function cleanup() {
    for (const f of arguments) {
        try { fs.unlinkSync(f); } catch {}
    }
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
                label: m[1], frames: parseInt(m[2]),
                median: parseFloat(m[3]), mean: parseFloat(m[4]),
                sd: parseFloat(m[5]), cv: parseFloat(m[6]),
                p95: parseFloat(m[7]), min: parseFloat(m[8]), max: parseFloat(m[9])
            };
            if (s.label === 'compute') computeStats = s;
            else totalStats = s;
        }
    }
    if (totalStats) totalStats.compute = computeStats;
    return totalStats;
}

function makeStatsPath(label) {
    const tmpDir = path.join(os.tmpdir(), 'seed-win32-perf');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    return path.join(tmpDir, `stats_${label}_${Date.now()}.txt`);
}

function makeTmpPaths(label) {
    const tmpDir = path.join(os.tmpdir(), 'seed-win32-perf');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const base = path.join(tmpDir, `${label}_${Date.now()}`);
    return { cPath: `${base}.c`, exePath: `${base}.exe`, statsPath: `${base}_stats.txt` };
}

function runVariant(seedFile, label, mode, extraFlags) {
    const source = fs.readFileSync(path.join(WIN32_DIR, seedFile), 'utf8');
    let cCode;
    try {
        cCode = compileSeedToC(source, mode);
    } catch (e) {
        console.log(`  FAIL: SeedLang compilation error: ${e.message.split('\n')[0]}`);
        return null;
    }
    const statsPath = makeStatsPath(label);
    cCode = injectTiming(cCode, label, statsPath);
    const output = compileAndRun(cCode, label, statsPath, extraFlags);
    if (!output) return null;
    const stats = parseStats(output);
    if (!stats) {
        console.log(`  FAIL: could not parse timing output`);
        console.log(`  raw: ${output.slice(0, 200)}`);
        return null;
    }
    return stats;
}

function printStatsLine(stats) {
    const fps = stats.median > 0 ? (1000.0 / stats.median) : 0;
    let line = `    frames=${stats.frames} total: median=${stats.median.toFixed(3)}ms (` +
        `${fps.toFixed(1)} FPS) p95=${stats.p95.toFixed(3)}ms ` +
        `min=${stats.min.toFixed(3)}ms max=${stats.max.toFixed(3)}ms`;
    if (stats.compute) {
        const cfps = stats.compute.median > 0 ? (1000.0 / stats.compute.median) : 0;
        line += `\n    compute: median=${stats.compute.median.toFixed(3)}ms (` +
        `${cfps.toFixed(1)} FPS) p95=${stats.compute.p95.toFixed(3)}ms ` +
        `min=${stats.compute.min.toFixed(3)}ms max=${stats.compute.max.toFixed(3)}ms`;
    }
    console.log(line);
}

// ===================== Test 5: Cache/Memory Probe =====================

const CACHE_PROBE_C = `
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <psapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <intrin.h>

#pragma comment(lib, "psapi.lib")

static double perf_ms(void) {
    LARGE_INTEGER freq, counter;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&counter);
    return (double)counter.QuadPart / (double)freq.QuadPart * 1000.0;
}

static double probe_seq_read(long long size_bytes, int reps) {
    long long n = size_bytes / sizeof(long long);
    long long *arr = (long long*)_aligned_malloc(size_bytes, 64);
    if (!arr) return -1;
    for (long long i = 0; i < n; i++) arr[i] = i ^ 0x5A5A5A5A5A5A5A5ALL;

    volatile long long sink = 0;
    double t0 = perf_ms();
    for (int r = 0; r < reps; r++) {
        long long s = 0;
        for (long long i = 0; i < n; i++) s += arr[i];
        sink = s;
    }
    double t1 = perf_ms();
    _aligned_free(arr);
    return t1 - t0;
}

static double probe_seq_write(long long size_bytes, int reps) {
    long long n = size_bytes / sizeof(long long);
    long long *arr = (long long*)_aligned_malloc(size_bytes, 64);
    if (!arr) return -1;

    double t0 = perf_ms();
    for (int r = 0; r < reps; r++) {
        for (long long i = 0; i < n; i++) arr[i] = i + r;
    }
    double t1 = perf_ms();
    _aligned_free(arr);
    return t1 - t0;
}

static double probe_random_read(long long size_bytes, int reps) {
    long long n = size_bytes / sizeof(long long);
    long long *arr = (long long*)_aligned_malloc(size_bytes, 64);
    long long *perm = (long long*)_aligned_malloc(n * sizeof(long long), 64);
    if (!arr || !perm) { _aligned_free(arr); _aligned_free(perm); return -1; }
    for (long long i = 0; i < n; i++) { arr[i] = i; perm[i] = ((i * 7919LL + 1) % n + n) % n; }

    volatile long long sink = 0;
    double t0 = perf_ms();
    for (int r = 0; r < reps; r++) {
        long long idx = 0, s = 0;
        for (long long i = 0; i < n; i++) { s += arr[idx]; idx = perm[idx]; }
        sink = s;
    }
    double t1 = perf_ms();
    _aligned_free(arr);
    _aligned_free(perm);
    return t1 - t0;
}

static void measure_cpi(const char* label, long long iterations) {
    unsigned long long tsc0 = __rdtsc();

    volatile long long sink = 0;
    long long x = 0;
    for (long long i = 0; i < iterations; i++) { x += i * i - i; }
    sink = x;

    unsigned long long tsc1 = __rdtsc();
    unsigned long long cycles = tsc1 - tsc0;
    double cycles_per_iter = (double)cycles / (double)iterations;
    printf("CPI %s cycles=%llu cycles_per_iter=%.2f\\n", label, cycles, cycles_per_iter);
}

static void collision_cpi(long long num_balls, long long frames) {
    long long *bx = (long long*)_aligned_malloc(num_balls * sizeof(long long), 64);
    long long *by = (long long*)_aligned_malloc(num_balls * sizeof(long long), 64);
    long long *br = (long long*)_aligned_malloc(num_balls * sizeof(long long), 64);
    if (!bx || !by || !br) { _aligned_free(bx); _aligned_free(by); _aligned_free(br); return; }
    for (long long i = 0; i < num_balls; i++) { bx[i] = i * 7 % 640; by[i] = i * 13 % 480; br[i] = 3 + i % 5; }

    unsigned long long tsc0 = __rdtsc();

    long long total_collisions = 0;
    for (long long f = 0; f < frames; f++) {
        for (long long i = 0; i < num_balls; i++) {
            for (long long j = i + 1; j < num_balls; j++) {
                long long dx = bx[j] - bx[i];
                long long dy = by[j] - by[i];
                long long d2 = dx * dx + dy * dy;
                long long md = br[i] + br[j];
                if (d2 < md * md) total_collisions++;
            }
        }
    }

    unsigned long long tsc1 = __rdtsc();
    unsigned long long cycles = tsc1 - tsc0;

    long long ws_bytes = num_balls * 3 * sizeof(long long);
    long long pairs = num_balls * (num_balls - 1) / 2;
    const char* bound = ws_bytes < 32768 ? "L1" : ws_bytes < 262144 ? "L2" : ws_bytes < 8388608 ? "L3" : "DRAM";
    double cycles_per_pair = (double)cycles / (double)(pairs * frames);

    printf("COLLISION_CPI balls=%lld frames=%lld ws=%lldbytes(%s) pairs=%lld collisions=%lld cycles=%llu cycles_per_pair=%.2f\\n",
           num_balls, frames, ws_bytes, bound, pairs, total_collisions, cycles, cycles_per_pair);
    _aligned_free(bx); _aligned_free(by); _aligned_free(br);
}

int main(void) {
    PROCESS_MEMORY_COUNTERS pmc_before, pmc_after;
    GetProcessMemoryInfo(GetCurrentProcess(), &pmc_before, sizeof(pmc_before));

    struct { const char* label; long long bytes; int reps; } sizes[] = {
        {"8KB",    8*1024,       2000},
        {"64KB",   64*1024,      500},
        {"512KB",  512*1024,     100},
        {"4MB",    4*1024*1024,  20},
        {"32MB",   32*1024*1024, 5},
    };
    int nsizes = sizeof(sizes)/sizeof(sizes[0]);

    printf("=== Cache/Memory Bandwidth ===\\n");
    for (int i = 0; i < nsizes; i++) {
        double seq_r = probe_seq_read(sizes[i].bytes, sizes[i].reps);
        double seq_w = probe_seq_write(sizes[i].bytes, sizes[i].reps);
        double rand_r = probe_random_read(sizes[i].bytes, sizes[i].reps);
        double total_bytes_r = (double)sizes[i].bytes * sizes[i].reps;
        double bw_r = total_bytes_r / (seq_r / 1000.0) / 1e9;
        double bw_w = total_bytes_r / (seq_w / 1000.0) / 1e9;
        double lat_ns = (rand_r * 1e6) / ((double)sizes[i].bytes / sizeof(long long) * sizes[i].reps);
        const char* cache = sizes[i].bytes < 32768 ? "L1" : sizes[i].bytes < 262144 ? "L2" : sizes[i].bytes < 8388608 ? "L3" : "DRAM";
        printf("BW %s(%s) seq_read=%.1fGB/s seq_write=%.1fGB/s rand_lat=%.1fns seq_ms=%.3f rand_ms=%.3f\\n",
               sizes[i].label, cache, bw_r, bw_w, lat_ns, seq_r, rand_r);
    }

    printf("\\n=== CPI Analysis ===\\n");
    measure_cpi("pure_compute", 100000000LL);
    measure_cpi("seq_scan", 10000000LL);

    printf("\\n=== Collision CPI by Scale ===\\n");
    collision_cpi(50, 200);
    collision_cpi(100, 200);
    collision_cpi(500, 50);
    collision_cpi(2000, 10);
    collision_cpi(5000, 5);

    GetProcessMemoryInfo(GetCurrentProcess(), &pmc_after, sizeof(pmc_after));
    printf("\\nMEM working_set=%lluKB peak_working_set=%lluKB page_faults=%llu\\n",
           (unsigned long long)(pmc_after.WorkingSetSize/1024),
           (unsigned long long)(pmc_after.PeakWorkingSetSize/1024),
           (unsigned long long)pmc_after.PageFaultCount);

    return 0;
}
`;

// ===================== Test 6: Threading / Fiber =====================

const THREAD_FIBER_C = `
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>

static double perf_ms(void) {
    LARGE_INTEGER freq, counter;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&counter);
    return (double)counter.QuadPart / (double)freq.QuadPart * 1000.0;
}

static long long g_num_balls;
static long long *g_bx, *g_by, *g_br;

typedef struct {
    long long start_i;
    long long end_i;
    long long count;
} CollideRange;

static DWORD WINAPI collide_thread(LPVOID param) {
    CollideRange* r = (CollideRange*)param;
    long long count = 0;
    for (long long i = r->start_i; i < r->end_i; i++) {
        for (long long j = i + 1; j < g_num_balls; j++) {
            long long dx = g_bx[j] - g_bx[i];
            long long dy = g_by[j] - g_by[i];
            long long d2 = dx * dx + dy * dy;
            long long md = g_br[i] + g_br[j];
            if (d2 < md * md) count++;
        }
    }
    r->count = count;
    return 0;
}

static long long run_threaded_collision(int nthreads, long long frames) {
    CollideRange* ranges = (CollideRange*)malloc(nthreads * sizeof(CollideRange));
    HANDLE* threads = (HANDLE*)malloc(nthreads * sizeof(HANDLE));
    long long chunk = g_num_balls / nthreads;
    long long total = 0;

    double t0 = perf_ms();
    for (long long f = 0; f < frames; f++) {
        for (int t = 0; t < nthreads; t++) {
            ranges[t].start_i = t * chunk;
            ranges[t].end_i = (t == nthreads - 1) ? g_num_balls : (t + 1) * chunk;
            ranges[t].count = 0;
            threads[t] = CreateThread(NULL, 0, collide_thread, &ranges[t], 0, NULL);
        }
        WaitForMultipleObjects(nthreads, threads, TRUE, INFINITE);
        for (int t = 0; t < nthreads; t++) { CloseHandle(threads[t]); total += ranges[t].count; }
    }
    double t1 = perf_ms();

    free(ranges);
    free(threads);
    printf("THREAD nthreads=%d balls=%lld frames=%lld collisions=%lld time=%.3fms per_frame=%.4fms\\n",
           nthreads, g_num_balls, frames, total, t1 - t0, (t1 - t0) / frames);
    return total;
}

static long long run_single_collision(long long frames) {
    long long total = 0;
    double t0 = perf_ms();
    for (long long f = 0; f < frames; f++) {
        long long count = 0;
        for (long long i = 0; i < g_num_balls; i++) {
            for (long long j = i + 1; j < g_num_balls; j++) {
                long long dx = g_bx[j] - g_bx[i];
                long long dy = g_by[j] - g_by[i];
                long long d2 = dx * dx + dy * dy;
                long long md = g_br[i] + g_br[j];
                if (d2 < md * md) count++;
            }
        }
        total += count;
    }
    double t1 = perf_ms();
    printf("THREAD nthreads=1 balls=%lld frames=%lld collisions=%lld time=%.3fms per_frame=%.4fms\\n",
           g_num_balls, frames, total, t1 - t0, (t1 - t0) / frames);
    return total;
}

static volatile long long g_fiber_counter = 0;
static LPVOID g_main_fiber;

static VOID CALLBACK fiber_proc(LPVOID param) {
    for (int i = 0; i < 100000; i++) {
        InterlockedIncrement64(&g_fiber_counter);
        SwitchToFiber(g_main_fiber);
    }
}

static void measure_fiber_switch(void) {
    g_main_fiber = ConvertThreadToFiber(NULL);
    if (!g_main_fiber) { printf("FIBER convert_failed\\n"); return; }

    LPVOID f1 = CreateFiber(0, fiber_proc, NULL);
    LPVOID f2 = CreateFiber(0, fiber_proc, NULL);
    if (!f1 || !f2) { printf("FIBER create_failed\\n"); DeleteFiber(f1); DeleteFiber(f2); return; }

    long long switches = 200000;
    g_fiber_counter = 0;
    double t0 = perf_ms();
    for (long long i = 0; i < switches / 2; i++) {
        SwitchToFiber(f1);
        SwitchToFiber(f2);
    }
    double t1 = perf_ms();

    double ns_per_switch = (t1 - t0) * 1e6 / (double)switches;
    printf("FIBER switches=%lld total_ms=%.3f ns_per_switch=%.1f\\n", switches, t1 - t0, ns_per_switch);

    DeleteFiber(f1);
    DeleteFiber(f2);
    ConvertFiberToThread();
}

static HANDLE g_ping_events[2];
static long long g_ping_count;

static DWORD WINAPI ping_thread_func(LPVOID p) {
    for (long long i = 0; i < g_ping_count; i++) {
        SetEvent(g_ping_events[1]);
        WaitForSingleObject(g_ping_events[0], INFINITE);
    }
    return 0;
}

static void measure_thread_switch(void) {
    long long switches = 100000;
    g_ping_count = switches;
    g_ping_events[0] = CreateEventW(NULL, FALSE, FALSE, NULL);
    g_ping_events[1] = CreateEventW(NULL, FALSE, FALSE, NULL);

    double t0 = perf_ms();
    HANDLE th = CreateThread(NULL, 0, ping_thread_func, NULL, 0, NULL);
    for (long long i = 0; i < switches; i++) {
        WaitForSingleObject(g_ping_events[1], INFINITE);
        SetEvent(g_ping_events[0]);
    }
    WaitForSingleObject(th, INFINITE);
    double t1 = perf_ms();
    CloseHandle(th);
    CloseHandle(g_ping_events[0]);
    CloseHandle(g_ping_events[1]);

    double ns_per_switch = (t1 - t0) * 1e6 / (double)(switches * 2);
    printf("THREAD_CTX switches=%lld total_ms=%.3f ns_per_switch=%.1f\\n", switches * 2, t1 - t0, ns_per_switch);
}

int main(void) {
    long long ball_counts[] = {100, 500, 2000};
    int ncounts = sizeof(ball_counts)/sizeof(ball_counts[0]);

    for (int c = 0; c < ncounts; c++) {
        g_num_balls = ball_counts[c];
        g_bx = (long long*)_aligned_malloc(g_num_balls * sizeof(long long), 64);
        g_by = (long long*)_aligned_malloc(g_num_balls * sizeof(long long), 64);
        g_br = (long long*)_aligned_malloc(g_num_balls * sizeof(long long), 64);
        for (long long i = 0; i < g_num_balls; i++) {
            g_bx[i] = i * 7 % 640; g_by[i] = i * 13 % 480; g_br[i] = 3 + i % 5;
        }

        long long frames = g_num_balls <= 100 ? 500 : g_num_balls <= 500 ? 100 : 20;
        printf("\\n=== Collision Threading: %lld balls ===\\n", g_num_balls);
        run_single_collision(frames);
        run_threaded_collision(2, frames);
        run_threaded_collision(4, frames);

        _aligned_free(g_bx); _aligned_free(g_by); _aligned_free(g_br);
    }

    printf("\\n=== Context Switch Overhead ===\\n");
    measure_fiber_switch();
    measure_thread_switch();

    return 0;
}
`;

// ===================== Main =====================

console.log('=== SeedLang Win32 Performance Verification ===\n');

if (process.platform !== 'win32') {
    console.log('SKIP: Win32 tests require Windows platform');
    process.exit(0);
}

if (!fs.existsSync(DIST_CLI)) {
    console.error('ERROR: run `npm run build` first (missing dist/cli.js)');
    process.exit(1);
}

let allPassed = true;

// ========== Test 1: ACAE Array/Loop Optimization - Frame Stability ==========
console.log('--- Test 1: ACAE Array/Loop Optimization (Frame Stability) ---');
console.log('  Verifying: ACAE I32-encoded arrays maintain stable frame rate under O(n^2) collision');
console.log('  Criteria: median<33ms, p95<20ms, max<33ms (after 10-frame warmup)');

const t1 = runVariant('test1_acae_collision.seed', 't1_acae', undefined);
if (t1) {
    printStatsLine(t1);
    const medianOk = t1.median < 33.0;
    const p95Ok = t1.p95 < 20.0;
    const maxOk = t1.max < 33.0;
    console.log(`    [${medianOk ? 'PASS' : 'FAIL'}] median < 33ms (30+ FPS): ${t1.median.toFixed(3)}ms`);
    console.log(`    [${p95Ok ? 'PASS' : 'FAIL'}] p95 < 20ms (50 FPS at 95th %ile): ${t1.p95.toFixed(3)}ms`);
    console.log(`    [${maxOk ? 'PASS' : 'FAIL'}] max < 33ms (never below 30 FPS): ${t1.max.toFixed(3)}ms`);
    if (!medianOk || !p95Ok || !maxOk) allPassed = false;
} else {
    allPassed = false;
}
console.log('');

// ========== Test 2: Boundary Check / Branch Prediction Auto-Elimination ==========
console.log('--- Test 2: Boundary Check / Branch Prediction Auto-Elimination ---');
console.log('  Verifying: compiler -O2 eliminates redundant bounds checks; branch mispredicts do not cause frame drops');
console.log('  Criteria: dense/sparse ratio<1.5x, both median<33ms, both p95<20ms');

const t2dense = runVariant('test2_branch_elim.seed', 't2_dense', 0);
const t2sparse = runVariant('test2_branch_elim.seed', 't2_sparse', 1);

if (t2dense && t2sparse) {
    console.log('  Dense (many collisions):');
    printStatsLine(t2dense);
    console.log('  Sparse (few collisions):');
    printStatsLine(t2sparse);

    const ratio = t2dense.median / t2sparse.median;
    const ratioOk = ratio < 1.5;
    const denseMedianOk = t2dense.median < 33.0;
    const sparseMedianOk = t2sparse.median < 33.0;
    const denseP95Ok = t2dense.p95 < 20.0;
    const sparseP95Ok = t2sparse.p95 < 20.0;

    console.log(`    [${ratioOk ? 'PASS' : 'FAIL'}] dense/sparse ratio < 1.5x: ${ratio.toFixed(2)}x`);
    console.log(`    [${denseMedianOk ? 'PASS' : 'FAIL'}] dense median < 33ms: ${t2dense.median.toFixed(3)}ms`);
    console.log(`    [${sparseMedianOk ? 'PASS' : 'FAIL'}] sparse median < 33ms: ${t2sparse.median.toFixed(3)}ms`);
    console.log(`    [${denseP95Ok ? 'PASS' : 'FAIL'}] dense p95 < 20ms: ${t2dense.p95.toFixed(3)}ms`);
    console.log(`    [${sparseP95Ok ? 'PASS' : 'FAIL'}] sparse p95 < 20ms: ${t2sparse.p95.toFixed(3)}ms`);

    if (!ratioOk || !denseMedianOk || !sparseMedianOk || !denseP95Ok || !sparseP95Ok) allPassed = false;
} else {
    allPassed = false;
}
console.log('');

// ========== Test 3: Win32 Rendering + Collision Computation Pipeline ==========
console.log('--- Test 3: Win32 Rendering + Collision Computation Pipeline ---');
console.log('  Verifying: rendering and computation do not bottleneck each other');
console.log('  Criteria: full<1.8x max(compute,render), all median<33ms, all p95<20ms');

const t3compute = runVariant('test3_pipeline.seed', 't3_compute', 0);
const t3render = runVariant('test3_pipeline.seed', 't3_render', 1);
const t3full = runVariant('test3_pipeline.seed', 't3_full', 2);

if (t3compute && t3render && t3full) {
    console.log('  Compute-only (collision, no draw):');
    printStatsLine(t3compute);
    console.log('  Render-only (draw circles, no collision):');
    printStatsLine(t3render);
    console.log('  Full pipeline (collision + draw):');
    printStatsLine(t3full);

    const maxPart = Math.max(t3compute.median, t3render.median);
    const pipelineRatio = t3full.median / maxPart;
    const pipelineOk = pipelineRatio < 1.8;
    const computeMedianOk = t3compute.median < 33.0;
    const renderMedianOk = t3render.median < 33.0;
    const fullMedianOk = t3full.median < 33.0;
    const computeP95Ok = t3compute.p95 < 20.0;
    const renderP95Ok = t3render.p95 < 20.0;
    const fullP95Ok = t3full.p95 < 20.0;

    const sumParts = t3compute.median + t3render.median;
    const overheadRatio = sumParts > 0 ? t3full.median / sumParts : 0;

    console.log(`    [${pipelineOk ? 'PASS' : 'FAIL'}] full < 1.8x max(compute,render): ${pipelineRatio.toFixed(2)}x`);
    console.log(`    [${computeMedianOk ? 'PASS' : 'FAIL'}] compute median < 33ms: ${t3compute.median.toFixed(3)}ms`);
    console.log(`    [${renderMedianOk ? 'PASS' : 'FAIL'}] render median < 33ms: ${t3render.median.toFixed(3)}ms`);
    console.log(`    [${fullMedianOk ? 'PASS' : 'FAIL'}] full median < 33ms: ${t3full.median.toFixed(3)}ms`);
    console.log(`    [${computeP95Ok ? 'PASS' : 'FAIL'}] compute p95 < 20ms: ${t3compute.p95.toFixed(3)}ms`);
    console.log(`    [${renderP95Ok ? 'PASS' : 'FAIL'}] render p95 < 20ms: ${t3render.p95.toFixed(3)}ms`);
    console.log(`    [${fullP95Ok ? 'PASS' : 'FAIL'}] full p95 < 20ms: ${t3full.p95.toFixed(3)}ms`);
    console.log(`    (info) full/(compute+render) ratio: ${overheadRatio.toFixed(2)}x (ideal ~1.0x)`);

    if (!pipelineOk || !computeMedianOk || !renderMedianOk || !fullMedianOk ||
        !computeP95Ok || !renderP95Ok || !fullP95Ok) allPassed = false;
} else {
    allPassed = false;
}
console.log('');

// ========== Test 4: SIMD Optimization Comparison ==========
console.log('--- Test 4: SIMD Optimization Comparison ---');
console.log('  Verifying: auto-vectorization and #pragma omp simd impact on collision performance');
console.log('  Comparing: -O2 (auto-vec on) vs -O2 -fno-tree-vectorize (auto-vec off) vs -O2 -fopenmp-simd');

const t4base = runVariant('test1_acae_collision.seed', 't4_base', undefined, '');
const t4novect = runVariant('test1_acae_collision.seed', 't4_novect', undefined, '-fno-tree-vectorize');
const t4omp = runVariant('test1_acae_collision.seed', 't4_omp', undefined, '-fopenmp-simd');

if (t4base && t4novect && t4omp) {
    console.log('  -O2 (auto-vectorization ON):');
    printStatsLine(t4base);
    console.log('  -O2 -fno-tree-vectorize (auto-vectorization OFF):');
    printStatsLine(t4novect);
    console.log('  -O2 -fopenmp-simd (enables #pragma omp simd):');
    printStatsLine(t4omp);

    const simdRatio = t4novect.median / t4base.median;
    const ompRatio = t4omp.median / t4base.median;
    const simdHelps = simdRatio > 1.05;
    const ompHelps = ompRatio > 1.05;
    const noRegression = t4novect.median < 33.0 && t4omp.median < 33.0;

    console.log(`    (info) no-vec/base ratio: ${simdRatio.toFixed(2)}x ${simdHelps ? '(SIMD helps!)' : '(SIMD has no effect on collision loop)'}`);
    console.log(`    (info) omp-simd/base ratio: ${ompRatio.toFixed(2)}x ${ompHelps ? '(omp simd helps!)' : '(omp simd has no effect on collision loop)'}`);
    console.log(`    [${noRegression ? 'PASS' : 'FAIL'}] all variants < 33ms`);

    if (!noRegression) allPassed = false;
} else {
    console.log('  (some variants failed to compile/run, skipping SIMD comparison)');
}
console.log('');

// ========== Test 5: Cache/Memory Access Pattern Analysis ==========
console.log('--- Test 5: Cache/Memory Access Pattern Analysis ---');
console.log('  Measuring: L1/L2/L3/DRAM bandwidth, random access latency, CPI, collision working set');
console.log('  Determining: compute-bound vs memory-bound');

{
    const p = makeTmpPaths('cache_probe');
    fs.writeFileSync(p.cPath, CACHE_PROBE_C, 'utf8');
    const compileErr = compileConsoleC(p.cPath, p.exePath, '-lpsapi');
    if (compileErr) {
        console.log(`  FAIL: cache probe compilation error: ${compileErr}`);
        allPassed = false;
    } else {
        const out = runExe(p.exePath, 60000);
        if (out) {
            const lines = out.trim().split('\n');
            const bwLines = lines.filter(l => l.startsWith('BW '));
            const cpiLines = lines.filter(l => l.startsWith('CPI ') || l.startsWith('COLLISION_CPI '));
            const memLine = lines.find(l => l.startsWith('MEM '));

            console.log('  Bandwidth by cache level:');
            for (const l of bwLines) {
                const m = l.match(/^BW (\S+)\((\S+)\) seq_read=([\d.]+)GB\/s seq_write=([\d.]+)GB\/s rand_lat=([\d.]+)ns/);
                if (m) console.log(`    ${m[1].padEnd(6)} [${m[2].padEnd(3)}] read=${m[3]} GB/s  write=${m[4]} GB/s  rand_lat=${m[5]} ns`);
                else console.log(`    ${l}`);
            }

            console.log('  CPI analysis (cycles per iteration/pair):');
            for (const l of cpiLines) {
                if (l.startsWith('COLLISION_CPI ')) {
                    const m = l.match(/balls=(\d+).*ws=(\d+)bytes\((\S+)\).*cycles_per_pair=([\d.]+)/);
                    if (m) console.log(`    ${m[1].padStart(5)} balls: ws=${m[2]}B (${m[3]}), cycles/pair=${m[4]}`);
                    else console.log(`    ${l.replace('COLLISION_CPI ', '')}`);
                } else {
                    console.log(`    ${l.replace('CPI ', '')}`);
                }
            }

            if (memLine) {
                const m = memLine.match(/working_set=(\d+)KB peak_working_set=(\d+)KB page_faults=(\d+)/);
                if (m) console.log(`  Working set: ${m[1]}KB peak, ${m[3]} page faults`);
            }

            const collisionCpiLines = cpiLines.filter(l => l.startsWith('COLLISION_CPI '));
            let verdict = 'UNKNOWN';
            let cyclesPerPair100 = 0;
            for (const l of collisionCpiLines) {
                const m = l.match(/balls=100.*cycles_per_pair=([\d.]+)/);
                if (m) cyclesPerPair100 = parseFloat(m[1]);
            }
            const bw8k = bwLines.length > 0 ? (parseFloat(bwLines[0].match(/seq_read=([\d.]+)/)?.[1] || '0')) : 0;
            const bw32m = bwLines.length > 4 ? (parseFloat(bwLines[4].match(/seq_read=([\d.]+)/)?.[1] || '0')) : 0;
            const bwRatio = bw8k > 0 && bw32m > 0 ? bw8k / bw32m : 0;

            if (cyclesPerPair100 > 0 && cyclesPerPair100 < 100) {
                verdict = 'COMPUTE-BOUND (cycles/pair<100, data fits L1 cache)';
            } else if (bwRatio > 3) {
                verdict = 'MEMORY-BOUND (bandwidth drops significantly at larger sizes)';
            } else {
                verdict = 'MIXED (moderate cache pressure)';
            }
            console.log(`  Verdict: ${verdict}`);
            console.log(`    (info) 100-ball collision: ${cyclesPerPair100.toFixed(1)} cycles/pair, L1/DRAM bandwidth ratio: ${bwRatio.toFixed(1)}x`);
            const verdictOk = !verdict.includes('MEMORY-BOUND');
            console.log(`    [${verdictOk ? 'PASS' : 'FAIL'}] collision is not memory-bound at 100 balls`);

            if (!verdictOk) allPassed = false;
        } else {
            console.log('  FAIL: cache probe runtime error');
            allPassed = false;
        }
    }
    cleanup(p.cPath, p.exePath);
}
console.log('');

// ========== Test 6: Multi-threading / Fiber Scheduling ==========
console.log('--- Test 6: Multi-threading / Fiber Scheduling ---');
console.log('  Measuring: collision speedup with 1/2/4 threads, fiber vs thread context switch overhead');

{
    const p = makeTmpPaths('thread_fiber');
    fs.writeFileSync(p.cPath, THREAD_FIBER_C, 'utf8');
    const compileErr = compileConsoleC(p.cPath, p.exePath, '');
    if (compileErr) {
        console.log(`  FAIL: thread/fiber compilation error: ${compileErr}`);
        allPassed = false;
    } else {
        const out = runExe(p.exePath, 120000);
        if (out) {
            const lines = out.trim().split('\n');
            const threadLines = lines.filter(l => l.startsWith('THREAD '));
            const fiberLine = lines.find(l => l.startsWith('FIBER '));
            const threadCtxLine = lines.find(l => l.startsWith('THREAD_CTX '));

            const ballGroups = {};
            for (const l of threadLines) {
                const m = l.match(/THREAD nthreads=(\d+) balls=(\d+).*per_frame=([\d.]+)ms/);
                if (m) {
                    const balls = m[2];
                    if (!ballGroups[balls]) ballGroups[balls] = {};
                    ballGroups[balls][m[1]] = parseFloat(m[3]);
                }
            }

            for (const [balls, threads] of Object.entries(ballGroups)) {
                console.log(`  ${balls} balls:`);
                const singleMs = threads['1'];
                for (const [n, ms] of Object.entries(threads)) {
                    const speedup = singleMs ? (singleMs / ms) : 0;
                    console.log(`    ${n} thread(s): ${ms.toFixed(3)}ms/frame ${n !== '1' ? `(${speedup.toFixed(2)}x speedup)` : '(baseline)'}`);
                }
            }

            if (fiberLine) {
                const m = fiberLine.match(/ns_per_switch=([\d.]+)/);
                if (m) console.log(`  Fiber context switch: ${m[1]} ns/switch`);
            }
            if (threadCtxLine) {
                const m = threadCtxLine.match(/ns_per_switch=([\d.]+)/);
                if (m) console.log(`  Thread context switch: ${m[1]} ns/switch`);
            }

            const balls2000 = ballGroups['2000'];
            if (balls2000 && balls2000['1'] && balls2000['4']) {
                const speedup4 = balls2000['1'] / balls2000['4'];
                const threadOk = speedup4 > 1.5;
                console.log(`    [${threadOk ? 'PASS' : 'FAIL'}] 4-thread speedup > 1.5x at 2000 balls: ${speedup4.toFixed(2)}x`);
                if (!threadOk) allPassed = false;
            }

            if (fiberLine && threadCtxLine) {
                const fm = fiberLine.match(/ns_per_switch=([\d.]+)/);
                const tm = threadCtxLine.match(/ns_per_switch=([\d.]+)/);
                if (fm && tm) {
                    const fiberNs = parseFloat(fm[1]);
                    const threadNs = parseFloat(tm[1]);
                    const fiberFaster = fiberNs < threadNs;
                    console.log(`    (info) fiber is ${fiberFaster ? 'faster' : 'slower'} than thread switch: ${fiberNs.toFixed(0)}ns vs ${threadNs.toFixed(0)}ns`);
                }
            }
        } else {
            console.log('  FAIL: thread/fiber runtime error');
            allPassed = false;
        }
    }
    cleanup(p.cPath, p.exePath);
}
console.log('');

// ========== Summary ==========
console.log('=== Summary ===');
if (allPassed) {
    console.log('ALL TESTS PASSED');
    process.exit(0);
} else {
    console.log('SOME TESTS FAILED');
    process.exit(1);
}
