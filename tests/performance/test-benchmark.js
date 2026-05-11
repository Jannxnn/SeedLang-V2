// 性能基准测试：测量 SeedLang VM 跑一小段 Seed 源码的耗时（算术 / 字符串 / 数组 / 对象 / 控制流等）。
//
// 测的是什么？
//   - 前半：SeedLangVM（Node 字节码 VM + 可选 JIT），同一 VM 上多次 run。
//   - 后半：CLC — compileToC 生成 C，gcc 链接后重复运行 exe（测原生代码路径；含进程启动开销）。
//   - 更大规模多语言对比仍见 bench/run.js、bench/clc-ci-gate.js。
//
// 输出怎么读？
//   - n        ：同一段 code 连续执行的次数（同一 VM 上多次 vm.run(code)）。
//   - total    ：这 n 次加起来的 wall 时间（ms）。
//   - avg      ：平均每次 run 的时间（ms）= total / n。
//   - runs/s   ：每秒能跑这段程序大约几次 ≈ 1000 / avg（与 avg 互为倒数换算）。
//   不同用例的 workload 不同，不要拿 runs/s 在行间直接比「谁更快」，只表示「这一段」多快。
//
// 重要实现细节：每个 benchmark 只创建一个 VM，在循环内重复 run(code)。若在循环里 new SeedLangVM()，
// 会构造数万次完整虚拟机（解析器 / JIT / 内置模块等），极易把内存和 GC 打满导致整机假死。
//
// 弱机器可缩小迭代：SEED_PERF_BENCH_ITER_SCALE=0.25
// CLC：SEED_CLC_BENCH=0 跳过；=full 与 VM 同样例全量（很慢）；默认 quick 约 12 个用例。SEED_CLC_BENCH_RUN_FRAC 控制 exe 重复次数（默认 0.05，且单次最多 20 次进程）。CLC_OPT 默认 -O2

const { SeedLangVM } = require('../../src/runtime/vm.js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Performance Benchmark Tests ===');
console.log('Part 1 — SeedLangVM in Node. Part 2 — CLC (compileToC + gcc + exe).');
console.log('Optional: SEED_PERF_BENCH_ITER_SCALE=0.25  SEED_CLC_BENCH=0|quick|full  SEED_CLC_BENCH_RUN_FRAC=0.05');
console.log('Note: [OK] lines in Part 1 are VM-only. The run is not complete until "Performance Benchmark Summary" appears.');
console.log('      VM-only run: SEED_CLC_BENCH=0 node tests/performance/test-benchmark.js\n');

/** Lean VM for benchmarks (matches bench/run.js spirit): fewer subsystems → faster + reliable process exit. */
const BENCH_VM_OPTIONS = {
    executionGuard: false,
    safeMode: false,
    concurrent: false,
    async: false,
    wasm: false,
    modules: false,
};

const vm = new SeedLangVM(BENCH_VM_OPTIONS);
let passed = 0;
let failed = 0;

/** Scale iteration counts on weak machines, e.g. SEED_PERF_BENCH_ITER_SCALE=0.25 */
const BENCH_ITER_SCALE = Math.max(0.05, Math.min(1, parseFloat(String(process.env.SEED_PERF_BENCH_ITER_SCALE || '1')) || 1));

function benchmark(name, code, iterations = 100) {
    iterations = Math.max(1, Math.floor(iterations * BENCH_ITER_SCALE));
    const bvm = new SeedLangVM(BENCH_VM_OPTIONS);
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
        const result = bvm.run(code);
        if (!result.success && i === 0) {
            console.log(`[FAIL] ${name}: ${result.error}`);
            failed++;
            return null;
        }
    }

    const elapsed = performance.now() - start;
    const runsPerSec = (iterations / elapsed * 1000).toFixed(1);
    const avgTime = (elapsed / iterations).toFixed(3);

    console.log(
        `[OK] ${name}: n=${iterations} total=${elapsed.toFixed(1)}ms avg=${avgTime}ms/run ~${runsPerSec} runs/s`
    );
    passed++;
    return { elapsed, runsPerSec, avgTime };
}

function benchmarkAsync(name, code, iterations = 10) {
    return new Promise(async (resolve) => {
        const start = performance.now();
        
        for (let i = 0; i < iterations; i++) {
            const result = await vm.runAsync(code);
            if (!result.success && i === 0) {
                console.log(`[FAIL] ${name}: ${result.error}`);
                failed++;
                resolve(null);
                return;
            }
        }
        
        const elapsed = performance.now() - start;
        const runsPerSec = (iterations / elapsed * 1000).toFixed(1);
        const avgTime = (elapsed / iterations).toFixed(3);

        console.log(
            `[OK] ${name}: n=${iterations} total=${elapsed.toFixed(1)}ms avg=${avgTime}ms/run ~${runsPerSec} runs/s`
        );
        passed++;
        resolve({ elapsed, runsPerSec, avgTime });
    });
}

// ---------- CLC (compileToC + native) ----------
let clcPassed = 0;
let clcSkipped = 0;
let clcFailed = 0;
let clcBenchId = 0;
let _benchCli = null;
let _benchGccResolved = false;
let _benchGcc = /** @type {string | null} */ (null);

function getBenchCli() {
    if (!_benchCli) _benchCli = require(path.join(__dirname, '..', '..', 'dist', 'cli.js'));
    return _benchCli;
}

function resolveBenchGcc() {
    if (_benchGccResolved) return _benchGcc;
    _benchGccResolved = true;
    try {
        const { resolveGcc, WIN_DEFAULT_GCC } = require(path.join(__dirname, '..', '..', 'tools', 'resolve-gcc.js'));
        const r = resolveGcc();
        if (r) {
            const p = r.replace(/^"|"$/g, '');
            if (fs.existsSync(p)) {
                _benchGcc = p;
                return _benchGcc;
            }
        }
        if (process.platform === 'win32' && WIN_DEFAULT_GCC && fs.existsSync(WIN_DEFAULT_GCC)) {
            _benchGcc = WIN_DEFAULT_GCC;
            return _benchGcc;
        }
    } catch (_) {}
    try {
        execSync('gcc --version', { stdio: 'pipe', timeout: 5000 });
        _benchGcc = 'gcc';
        return _benchGcc;
    } catch (_) {}
    try {
        execSync('clang --version', { stdio: 'pipe', timeout: 5000 });
        _benchGcc = 'clang';
        return _benchGcc;
    } catch (_) {}
    _benchGcc = null;
    return _benchGcc;
}

const CLC_TMP = path.join(__dirname, '_clc_bench_tmp');
const CLC_RUN_FRAC = Math.max(0.02, Math.min(1, parseFloat(String(process.env.SEED_CLC_BENCH_RUN_FRAC || '0.05')) || 0.05));

function clcNativeRunCount(vmStyleIterations) {
    const scaled = Math.floor(vmStyleIterations * BENCH_ITER_SCALE * CLC_RUN_FRAC);
    /* Cap low: each run is a new process — on Windows avg_run is often tens of ms dominated by spawn, not user code. */
    return Math.max(1, Math.min(20, scaled));
}

/**
 * @param {string} name
 * @param {string} code Seed snippet (same as VM benchmark)
 * @param {number} vmStyleIterations same third arg as benchmark() — used only to derive native repeat count
 */
function clcBenchmark(name, code, vmStyleIterations = 100) {
    const gcc = resolveBenchGcc();
    if (!gcc) {
        console.log(`[SKIP CLC] ${name}: no gcc/clang on PATH`);
        clcSkipped++;
        return null;
    }
    const runN = clcNativeRunCount(vmStyleIterations);
    if (!fs.existsSync(CLC_TMP)) fs.mkdirSync(CLC_TMP, { recursive: true });

    let cCode;
    const t0 = performance.now();
    try {
        cCode = getBenchCli().compileToC(code);
    } catch (e) {
        console.log(`[SKIP CLC] ${name}: compileToC — ${e.message}`);
        clcSkipped++;
        return null;
    }
    const compileMs = performance.now() - t0;

    const id = ++clcBenchId;
    const cFile = path.join(CLC_TMP, `perf_${id}.c`);
    const exeFile = path.join(CLC_TMP, `perf_${id}.exe`);
    const optLevel = process.env.CLC_OPT || '-O2';
    fs.writeFileSync(cFile, cCode);

    const t1 = performance.now();
    try {
        execSync(`"${gcc}" ${optLevel} -o "${exeFile}" "${cFile}" -lm`, { stdio: 'pipe', timeout: 120000, shell: false });
    } catch (e) {
        console.log(`[SKIP CLC] ${name}: link — ${e.message}`);
        clcSkipped++;
        try {
            fs.unlinkSync(cFile);
        } catch (_) {}
        return null;
    }
    const linkMs = performance.now() - t1;

    const t2 = performance.now();
    try {
        for (let i = 0; i < runN; i++) {
            execSync(`"${exeFile}"`, { stdio: 'pipe', timeout: 15000 });
        }
    } catch (e) {
        console.log(`[FAIL CLC] ${name}: run — ${e.message}`);
        clcFailed++;
        try {
            fs.unlinkSync(cFile);
        } catch (_) {}
        try {
            fs.unlinkSync(exeFile);
        } catch (_) {}
        return null;
    }
    const runMs = performance.now() - t2;

    try {
        fs.unlinkSync(cFile);
    } catch (_) {}
    try {
        fs.unlinkSync(exeFile);
    } catch (_) {}

    const avgRun = (runMs / runN).toFixed(4);
    const runsPerSec = (runN / runMs * 1000).toFixed(1);
    console.log(
        `[OK CLC] ${name}: compile=${compileMs.toFixed(1)}ms link=${linkMs.toFixed(1)}ms n=${runN} run_total=${runMs.toFixed(1)}ms avg_run=${avgRun}ms ~${runsPerSec} runs/s`
    );
    clcPassed++;
    return { compileMs, linkMs, runMs, runN };
}

function runClcMirrors() {
    if (process.env.SEED_CLC_BENCH === '0') {
        console.log('\n=== CLC benchmarks skipped (SEED_CLC_BENCH=0) ===\n');
        return;
    }
    const g = resolveBenchGcc();
    if (!g) {
        console.log('\n=== CLC benchmarks skipped (no C compiler found) ===\n');
        return;
    }
    const clcMode = (process.env.SEED_CLC_BENCH || 'quick').toLowerCase();
    console.log(`\n=== CLC (compileToC + ${path.basename(g)} + exe) ===`);
    console.log(
        `SEED_CLC_BENCH=${clcMode}  CLC_OPT=${process.env.CLC_OPT || '-O2'}  SEED_CLC_BENCH_RUN_FRAC=${CLC_RUN_FRAC} (exe repeats scale with VM iteration budget)`
    );
    console.log('CLC avg_run is per process launch of the compiled exe (CreateProcess on Windows dominates); compile/link rows show codegen + gcc cost.\n');
    if (clcMode !== 'full') {
        console.log('Note: default is quick (~12 compile+link cycles). Use SEED_CLC_BENCH=full for all VM mirrors (slow).\n');
        console.log('--- CLC quick subset ---');
        clcBenchmark('Integer addition', 'result = 1 + 2 + 3 + 4 + 5', 1000);
        clcBenchmark('Float operations', 'result = 1.1 + 2.2 * 3.3 / 4.4', 1000);
        clcBenchmark('Complex expression', 'result = (1 + 2) * (3 - 4) / (5 + 6) + (7 * 8 - 9)', 1000);
        clcBenchmark('String concatenation', 'result = "hello" + " " + "world"', 1000);
        clcBenchmark('String length', 'result = len("hello world this is a test string")', 1000);
        clcBenchmark('Array creation', 'result = [1 2 3 4 5 6 7 8 9 10]', 1000);
        clcBenchmark('Array push', 'arr = []\npush(arr 1)\npush(arr 2)\nresult = len(arr)', 1000);
        clcBenchmark('Object creation', 'result = {a: 1 b: 2 c: 3}', 1000);
        clcBenchmark('While loop - 100 iterations', 'i = 0\nwhile i < 100 { i = i + 1 }\nresult = i', 100);
        clcBenchmark('Simple function', 'fn f() { return 42 }\nresult = f()', 1000);
        clcBenchmark('Recursive fibonacci - 15', 'fn fib(n) { if n <= 1 { return n } return fib(n - 1) + fib(n - 2) }\nresult = fib(15)', 50);
        clcBenchmark(
            'Prime calculation',
            `
fn isPrime(n) {
    if n < 2 { return false }
    i = 2
    while i * i <= n {
        if n % i == 0 { return false }
        i = i + 1
    }
    return true
}
count = 0
i = 2
while i < 100 {
    if isPrime(i) { count = count + 1 }
    i = i + 1
}
result = count
`,
            20
        );
        return;
    }

    console.log('Full CLC mirror of all VM cases (SEED_CLC_BENCH=full).\n');

    console.log('--- Arithmetic (CLC) ---');
    clcBenchmark('Integer addition', 'result = 1 + 2 + 3 + 4 + 5', 1000);
    clcBenchmark('Integer multiplication', 'result = 1 * 2 * 3 * 4 * 5', 1000);
    clcBenchmark('Float operations', 'result = 1.1 + 2.2 * 3.3 / 4.4', 1000);
    clcBenchmark('Complex expression', 'result = (1 + 2) * (3 - 4) / (5 + 6) + (7 * 8 - 9)', 1000);

    console.log('\n--- String (CLC) ---');
    clcBenchmark('String concatenation', 'result = "hello" + " " + "world"', 1000);
    clcBenchmark('String length', 'result = len("hello world this is a test string")', 1000);
    clcBenchmark('String conversion', 'result = string(12345)', 1000);
    clcBenchmark('String case', 'result = upper("hello world")', 1000);

    console.log('\n--- Array (CLC) ---');
    clcBenchmark('Array creation', 'result = [1 2 3 4 5 6 7 8 9 10]', 1000);
    clcBenchmark('Array access', 'arr = [1 2 3 4 5]\nresult = arr[2]', 1000);
    clcBenchmark('Array length', 'arr = [1 2 3 4 5 6 7 8 9 10]\nresult = len(arr)', 1000);
    clcBenchmark('Array push', 'arr = []\npush(arr 1)\npush(arr 2)\nresult = len(arr)', 1000);
    clcBenchmark('Array concat', 'a = [1 2 3]\nb = [4 5 6]\nresult = concat(a b)', 1000);

    console.log('\n--- Object (CLC) ---');
    clcBenchmark('Object creation', 'result = {a: 1 b: 2 c: 3}', 1000);
    clcBenchmark('Object access', 'obj = {a: 1 b: 2 c: 3}\nresult = obj.b', 1000);
    clcBenchmark('Nested object', 'result = {a: {b: {c: {d: 42}}}}', 1000);

    console.log('\n--- Control flow (CLC) ---');
    clcBenchmark('Simple if', 'if true { result = 1 }', 1000);
    clcBenchmark('Nested if', 'if true { if true { if true { result = 1 } } }', 1000);
    clcBenchmark('While loop - 10 iterations', 'i = 0\nwhile i < 10 { i = i + 1 }\nresult = i', 500);
    clcBenchmark('While loop - 100 iterations', 'i = 0\nwhile i < 100 { i = i + 1 }\nresult = i', 100);
    clcBenchmark('For loop', 'sum = 0\nfor i in [1 2 3 4 5 6 7 8 9 10] { sum = sum + i }\nresult = sum', 500);

    console.log('\n--- Functions (CLC) ---');
    clcBenchmark('Simple function', 'fn f() { return 42 }\nresult = f()', 1000);
    clcBenchmark('Function with parameters', 'fn add(a b) { return a + b }\nresult = add(1 2)', 1000);
    clcBenchmark('Multi-parameter function', 'fn f(a b c d e) { return a + b + c + d + e }\nresult = f(1 2 3 4 5)', 1000);
    clcBenchmark('Nested calls', 'fn a() { return b() }\nfn b() { return c() }\nfn c() { return 42 }\nresult = a()', 500);

    console.log('\n--- Recursion (CLC) ---');
    clcBenchmark('Recursive factorial - 10', 'fn fact(n) { if n <= 1 { return 1 } return n * fact(n - 1) }\nresult = fact(10)', 100);
    clcBenchmark('Recursive fibonacci - 15', 'fn fib(n) { if n <= 1 { return n } return fib(n - 1) + fib(n - 2) }\nresult = fib(15)', 50);
    clcBenchmark('Tail recursion optimization', 'fn sum(n acc) { if n <= 0 { return acc } return sum(n - 1 acc + n) }\nresult = sum(100 0)', 100);

    console.log('\n--- Closures (CLC) ---');
    clcBenchmark('Simple closure', 'fn outer() { x = 10\nfn inner() { return x }\nreturn inner() }\nresult = outer()', 500);
    clcBenchmark('Multi-layer closure', 'fn a() { fn b() { fn c() { return 42 } return c() } return b() }\nresult = a()', 500);
    clcBenchmark('Closure capture', 'fn makeCounter() { count = 0\nfn inc() { count = count + 1 return count }\nreturn inc }\ncounter = makeCounter()\nresult = counter()', 200);

    console.log('\n--- Parse-style snippets (CLC) ---');
    clcBenchmark('Parse simple expression', 'result = 1 + 2', 1000);
    clcBenchmark('Parse complex expression', 'result = (1 + 2) * (3 - 4) / (5 + 6) + (7 * 8 - 9) * (10 / 11)', 500);
    clcBenchmark('Parse function definition', 'fn f(a b c) { return a + b + c }\nresult = f(1 2 3)', 500);
    clcBenchmark('Parse class definition', 'class Point { fn init(x y) { this.x = x this.y = y } }\np = Point(1 2)\nresult = p.x', 200);

    console.log('\n--- Memory-style snippets (CLC) ---');
    clcBenchmark('Large array creation', 'arr = []\ni = 0\nwhile i < 200 { push(arr i) i = i + 1 }\nresult = len(arr)', 20);
    clcBenchmark('Large string concatenation', 's = ""\ni = 0\nwhile i < 100 { s = s + "x" i = i + 1 }\nresult = len(s)', 100);
    clcBenchmark('Deep nested object', 'result = {a: {b: {c: {d: {e: {f: {g: {h: {i: {j: 42}}}}}}}}}}', 500);

    console.log('\n--- Comprehensive (CLC) ---');
    clcBenchmark(
        'Quick sort',
        `
fn quicksort(arr) {
    if len(arr) <= 1 { return arr }
    pivot = arr[0]
    left = []
    right = []
    i = 1
    while i < len(arr) {
        if arr[i] < pivot { push(left arr[i]) }
        else { push(right arr[i]) }
        i = i + 1
    }
    return concat(quicksort(left) [pivot] quicksort(right))
}
result = quicksort([5 3 8 1 9 2 7 4 6])
`,
        50
    );
    clcBenchmark(
        'Bubble sort',
        `
fn bubblesort(arr) {
    n = len(arr)
    i = 0
    while i < n {
        j = 0
        while j < n - i - 1 {
            if arr[j] > arr[j + 1] {
                temp = arr[j]
                arr[j] = arr[j + 1]
                arr[j + 1] = temp
            }
            j = j + 1
        }
        i = i + 1
    }
    return arr
}
result = bubblesort([5 3 8 1 9 2 7 4 6])
`,
        20
    );
    clcBenchmark(
        'Prime calculation',
        `
fn isPrime(n) {
    if n < 2 { return false }
    i = 2
    while i * i <= n {
        if n % i == 0 { return false }
        i = i + 1
    }
    return true
}
count = 0
i = 2
while i < 100 {
    if isPrime(i) { count = count + 1 }
    i = i + 1
}
result = count
`,
        20
    );
}

console.log('--- Arithmetic Operations Performance ---');
benchmark('Integer addition', 'result = 1 + 2 + 3 + 4 + 5', 1000);
benchmark('Integer multiplication', 'result = 1 * 2 * 3 * 4 * 5', 1000);
benchmark('Float operations', 'result = 1.1 + 2.2 * 3.3 / 4.4', 1000);
benchmark('Complex expression', 'result = (1 + 2) * (3 - 4) / (5 + 6) + (7 * 8 - 9)', 1000);

console.log('\n--- String Operations Performance ---');
benchmark('String concatenation', 'result = "hello" + " " + "world"', 1000);
benchmark('String length', 'result = len("hello world this is a test string")', 1000);
benchmark('String conversion', 'result = string(12345)', 1000);
benchmark('String case', 'result = upper("hello world")', 1000);

console.log('\n--- Array Operations Performance ---');
benchmark('Array creation', 'result = [1 2 3 4 5 6 7 8 9 10]', 1000);
benchmark('Array access', 'arr = [1 2 3 4 5]\nresult = arr[2]', 1000);
benchmark('Array length', 'arr = [1 2 3 4 5 6 7 8 9 10]\nresult = len(arr)', 1000);
benchmark('Array push', 'arr = []\npush(arr 1)\npush(arr 2)\nresult = len(arr)', 1000);
benchmark('Array concat', 'a = [1 2 3]\nb = [4 5 6]\nresult = concat(a b)', 1000);

console.log('\n--- Object Operations Performance ---');
benchmark('Object creation', 'result = {a: 1 b: 2 c: 3}', 1000);
benchmark('Object access', 'obj = {a: 1 b: 2 c: 3}\nresult = obj.b', 1000);
benchmark('Nested object', 'result = {a: {b: {c: {d: 42}}}}', 1000);

console.log('\n--- Control Flow Performance ---');
benchmark('Simple if', 'if true { result = 1 }', 1000);
benchmark('Nested if', 'if true { if true { if true { result = 1 } } }', 1000);
benchmark('While loop - 10 iterations', 'i = 0\nwhile i < 10 { i = i + 1 }\nresult = i', 500);
benchmark('While loop - 100 iterations', 'i = 0\nwhile i < 100 { i = i + 1 }\nresult = i', 100);
benchmark('For loop', 'sum = 0\nfor i in [1 2 3 4 5 6 7 8 9 10] { sum = sum + i }\nresult = sum', 500);

console.log('\n--- Function Call Performance ---');
benchmark('Simple function', 'fn f() { return 42 }\nresult = f()', 1000);
benchmark('Function with parameters', 'fn add(a b) { return a + b }\nresult = add(1 2)', 1000);
benchmark('Multi-parameter function', 'fn f(a b c d e) { return a + b + c + d + e }\nresult = f(1 2 3 4 5)', 1000);
benchmark('Nested calls', 'fn a() { return b() }\nfn b() { return c() }\nfn c() { return 42 }\nresult = a()', 500);

console.log('\n--- Recursion Performance ---');
benchmark('Recursive factorial - 10', 'fn fact(n) { if n <= 1 { return 1 } return n * fact(n - 1) }\nresult = fact(10)', 100);
benchmark('Recursive fibonacci - 15', 'fn fib(n) { if n <= 1 { return n } return fib(n - 1) + fib(n - 2) }\nresult = fib(15)', 50);
benchmark('Tail recursion optimization', 'fn sum(n acc) { if n <= 0 { return acc } return sum(n - 1 acc + n) }\nresult = sum(100 0)', 100);

console.log('\n--- Closure Performance ---');
benchmark('Simple closure', 'fn outer() { x = 10\nfn inner() { return x }\nreturn inner() }\nresult = outer()', 500);
benchmark('Multi-layer closure', 'fn a() { fn b() { fn c() { return 42 } return c() } return b() }\nresult = a()', 500);
benchmark('Closure capture', 'fn makeCounter() { count = 0\nfn inc() { count = count + 1 return count }\nreturn inc }\ncounter = makeCounter()\nresult = counter()', 200);

console.log('\n--- Parsing Performance ---');
benchmark('Parse simple expression', 'result = 1 + 2', 1000);
benchmark('Parse complex expression', 'result = (1 + 2) * (3 - 4) / (5 + 6) + (7 * 8 - 9) * (10 / 11)', 500);
benchmark('Parse function definition', 'fn f(a b c) { return a + b + c }\nresult = f(1 2 3)', 500);
benchmark('Parse class definition', 'class Point { fn init(x y) { this.x = x this.y = y } }\np = Point(1 2)\nresult = p.x', 200);

console.log('\n--- Memory Stress Tests ---');
benchmark('Large array creation', 'arr = []\ni = 0\nwhile i < 200 { push(arr i) i = i + 1 }\nresult = len(arr)', 20);
benchmark('Large string concatenation', 's = ""\ni = 0\nwhile i < 100 { s = s + "x" i = i + 1 }\nresult = len(s)', 100);
benchmark('Deep nested object', 'result = {a: {b: {c: {d: {e: {f: {g: {h: {i: {j: 42}}}}}}}}}}', 500);

console.log('\n--- Comprehensive Scenario Performance ---');
benchmark('Quick sort', `
fn quicksort(arr) {
    if len(arr) <= 1 { return arr }
    pivot = arr[0]
    left = []
    right = []
    i = 1
    while i < len(arr) {
        if arr[i] < pivot { push(left arr[i]) }
        else { push(right arr[i]) }
        i = i + 1
    }
    return concat(quicksort(left) [pivot] quicksort(right))
}
result = quicksort([5 3 8 1 9 2 7 4 6])
`, 50);

benchmark('Bubble sort', `
fn bubblesort(arr) {
    n = len(arr)
    i = 0
    while i < n {
        j = 0
        while j < n - i - 1 {
            if arr[j] > arr[j + 1] {
                temp = arr[j]
                arr[j] = arr[j + 1]
                arr[j + 1] = temp
            }
            j = j + 1
        }
        i = i + 1
    }
    return arr
}
result = bubblesort([5 3 8 1 9 2 7 4 6])
`, 20);

benchmark('Prime calculation', `
fn isPrime(n) {
    if n < 2 { return false }
    i = 2
    while i * i <= n {
        if n % i == 0 { return false }
        i = i + 1
    }
    return true
}
count = 0
i = 2
while i < 100 {
    if isPrime(i) { count = count + 1 }
    i = i + 1
}
result = count
`, 20);

console.log('\n--- VM benchmarks finished ---');
console.log(
    'Next: CLC (each case runs compileToC + gcc + exe). This can take tens of seconds (quick) or many minutes (full).'
);
console.log('Skip CLC entirely: SEED_CLC_BENCH=0\n');

runClcMirrors();

console.log('\n=== Performance Benchmark Summary ===');
console.log(`VM:  passed=${passed}  failed=${failed}`);
console.log(`CLC: passed=${clcPassed}  skipped=${clcSkipped}  failed=${clcFailed}`);

const code = failed > 0 || clcFailed > 0 ? 1 : 0;
process.exitCode = code;
process.exit(code);
