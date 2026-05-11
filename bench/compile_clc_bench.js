const fs = require('fs');
const path = require('path');
const {compileToC} = require(path.join(__dirname, '..', 'dist', 'cli.js'));

const seedPath = path.join(__dirname, 'seedlang', 'bench_clc.seed');
const cPath = path.join(__dirname, 'seedlang', 'bench_clc.c');

const source = fs.readFileSync(seedPath, 'utf-8');
// Inner loops under simd-shaped OpenMP parents suppress parallel codegen to avoid illegal nesting (GCC).
const parallel = process.env.SEED_CLC_PARALLEL !== '0';
const clcStrict = process.env.SEED_CLC_STRICT === '1';
let code;
try {
  code = compileToC(source, { parallel: Boolean(parallel), clcStrict });
} catch (e) {
  console.error(clcStrict ? e.message || e : e.message || e);
  process.exit(1);
}
code =
    '#ifdef _WIN32\n#define WIN32_LEAN_AND_MEAN\n#include <windows.h>\n#endif\n' +
    code;
code = code.replace('int main(int argc, char* argv[]) {', 'int main_orig(int argc, char* argv[]) {');

const benchCode = `
#ifndef _WIN32
#include <sys/time.h>
#endif
static volatile long long g_sink = 0;
static double now_ms() {
#ifdef _WIN32
    LARGE_INTEGER f, t;
    QueryPerformanceFrequency(&f);
    QueryPerformanceCounter(&t);
    return (double)t.QuadPart / (double)f.QuadPart * 1000.0;
#else
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (double)tv.tv_sec * 1000.0 + (double)tv.tv_usec / 1000.0;
#endif
}
typedef long long (*bench_fn)(long long);
void bench_stable(const char* name, long long arg, bench_fn fn) {
    const int min_samples = 7;
    const int max_samples = 40;
    const double min_total_ms = 280.0;
    const double min_sample_ms = 0.05;
    double samples[40];
    int sample_count = 0;
    double total_ms = 0.0;
    int inner_iters = 1;
    long long out = fn(arg);
    g_sink = out;
    while (inner_iters < (1 << 20)) {
        double start = now_ms();
        for (int i = 0; i < inner_iters; i++) { long long result = fn(arg); g_sink = result; out = result; }
        double end = now_ms();
        double ms = end - start;
        if (ms >= min_sample_ms) break;
        inner_iters <<= 1;
    }
    while (sample_count < min_samples || (total_ms < min_total_ms && sample_count < max_samples)) {
        double start = now_ms();
        for (int i = 0; i < inner_iters; i++) { long long result = fn(arg); g_sink = result; out = result; }
        double end = now_ms();
        double ms = end - start;
        if (sample_count < max_samples) { samples[sample_count++] = ms / inner_iters; }
        total_ms += ms;
    }
    int i, j;
    for (i = 0; i < sample_count - 1; i++)
        for (j = i + 1; j < sample_count; j++)
            if (samples[i] > samples[j]) { double t = samples[i]; samples[i] = samples[j]; samples[j] = t; }
    double median = (sample_count % 2 == 1) ? samples[sample_count / 2] : (samples[sample_count / 2 - 1] + samples[sample_count / 2]) * 0.5;
    printf("%s(%lld)=%lld %.6fms\\n", name, arg, out, median);
}
int main() {
    int fib_inputs[] = {20, 25, 30, 35};
    for (int k = 0; k < 4; k++) {
        int n = fib_inputs[k];
        bench_stable("fib", (long long)n, sl_fib);
    }
    long long loop_inputs[] = {100000, 1000000, 10000000};
    for (int k = 0; k < 3; k++) bench_stable("loop", loop_inputs[k], sl_loopTest);
    long long nl_inputs[] = {100, 300, 500};
    for (int k = 0; k < 3; k++) bench_stable("nested_loop", nl_inputs[k], sl_nestedLoopTest);
    long long as_inputs[] = {50000, 100000, 1000000};
    for (int k = 0; k < 3; k++) bench_stable("array_sum", as_inputs[k], sl_arraySumTest);
    long long math_inputs[] = {100000, 1000000, 10000000};
    for (int k = 0; k < 3; k++) bench_stable("math", math_inputs[k], sl_mathTest);
    bench_stable("pure_loop", 1000000, sl_pureLoopTest);
    bench_stable("push", 100000, sl_pushTest);
    bench_stable("push_index", 100000, sl_pushIndexTest);
    bench_stable("func_push", 100000, sl_funcPushTest);
    bench_stable("conditional", 1000000, sl_conditionalTest);
    bench_stable("math_op", 1000000, sl_mathOpTest);
    bench_stable("func_call", 100000, sl_funcCallTest);
    bench_stable("recursive_fib_30", 30, sl_recursiveFib30Test);
    bench_stable("array_literal", 100000, sl_arrayLiteralTest);
    bench_stable("ternary", 1000000, sl_ternaryTest);
    bench_stable("while_loop", 100000, sl_whileLoopTest);
    bench_stable("multi_assign", 100000, sl_multiAssignTest);
    bench_stable("func_loop", 1000000, sl_funcLoopTest);
    bench_stable("func_math", 1000000, sl_funcMathTest);
    return 0;
}
`;

code = code + '\n' + benchCode;
fs.writeFileSync(cPath, code);
console.log('CLC benchmark C code written to', cPath);
