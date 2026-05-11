const { SeedLangVM } = require('../../src/runtime/vm');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BENCH_DIR = __dirname;
const PROJECT_DIR = path.join(BENCH_DIR, '..', '..');
const BENCH_VM_OPTIONS = { executionGuard: false, safeMode: false };
function createBenchVM() { return new SeedLangVM(BENCH_VM_OPTIONS); }

const CLI_ARGS = process.argv.slice(2);
const QUIET = CLI_ARGS.includes('--quiet');
const FORCE_FULL_REPORT = CLI_ARGS.includes('--full-report');
const MODE_ARG = (CLI_ARGS.find(a => !a.startsWith('--')) || 'multi').toLowerCase();

const RAW_CONSOLE_LOG = console.log.bind(console);
if (QUIET) { console.log = () => {}; }

function pad(s, n, align = 'left') {
    s = String(s);
    const visualLen = [...s].reduce((len, ch) => len + (ch.charCodeAt(0) > 0x7F ? 2 : 1), 0);
    const padLen = Math.max(0, n - visualLen);
    return align === 'right' ? ' '.repeat(padLen) + s : s + ' '.repeat(padLen);
}

function _median(nums) {
    if (!nums || nums.length === 0) return NaN;
    const a = nums.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function _percentile(nums, p) {
    if (!nums || nums.length === 0) return NaN;
    const a = nums.slice().sort((x, y) => x - y);
    const idx = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
    return a[idx];
}

function summarizeSamples(samples) {
    const clean = (samples || []).filter(v => Number.isFinite(v) && v >= 0);
    if (clean.length === 0) return null;
    const median = _median(clean);
    const p95 = _percentile(clean, 95);
    const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
    const variance = clean.reduce((a, b) => a + (b - mean) * (b - mean), 0) / clean.length;
    const stddev = Math.sqrt(variance);
    const cv = mean > 0 ? (stddev / mean) : 0;
    return { median, p95, mean, stddev, cv, samples: clean };
}

function printSection(title) {
    console.log('\n' + '='.repeat(90));
    console.log('  ' + title);
    console.log('='.repeat(90));
}

const BENCHMARKS = [
    { name: 'binary_trees', arg: 10, category: 'Algorithmic' },
    { name: 'fannkuch', arg: 7, category: 'Algorithmic' },
    { name: 'nbody', arg: 200, category: 'Algorithmic' },
    { name: 'mandelbrot', arg: 50, category: 'Algorithmic' },
    { name: 'spectral_norm', arg: 50, category: 'Algorithmic' },
    { name: 'heap_sort', arg: 3000, category: 'Data Structures' },
    { name: 'quick_sort', arg: 3000, category: 'Data Structures' },
    { name: 'hash_map_ops', arg: 30000, category: 'Data Structures' },
    { name: 'graph_bfs', arg: 500, category: 'Data Structures' },
    { name: 'linked_list_ops', arg: 10000, category: 'Data Structures' },
    { name: 'json_tokenize', arg: 3000, category: 'String Processing' },
    { name: 'csv_parse', arg: 5000, category: 'String Processing' },
    { name: 'string_search', arg: 2000, category: 'String Processing' },
    { name: 'template_render', arg: 10000, category: 'String Processing' },
    { name: 'matrix_mul', arg: 50, category: 'Numerical' },
    { name: 'monte_carlo_pi', arg: 200000, category: 'Numerical' },
    { name: 'linpack', arg: 50, category: 'Numerical' },
    { name: 'state_machine', arg: 100000, category: 'Real-World' },
    { name: 'mini_interpreter', arg: 10000, category: 'Real-World' },
    { name: 'event_dispatch', arg: 50000, category: 'Real-World' },
];

const BENCH_JS = `function binaryTreesTest(depth) {
    function makeTree(d) {
        if (d === 0) return { left: null, right: null };
        return { left: makeTree(d - 1), right: makeTree(d - 1) };
    }
    function checkTree(node) {
        if (node.left === null) return 1;
        return 1 + checkTree(node.left) + checkTree(node.right);
    }
    const minDepth = 4;
    let maxDepth = depth;
    if (maxDepth < minDepth + 2) maxDepth = minDepth + 2;
    const stretchDepth = maxDepth + 1;
    const checkResult = checkTree(makeTree(stretchDepth));
    const longLivedTree = makeTree(maxDepth);
    let totalCheck = 0;
    for (let d = minDepth; d <= maxDepth; d += 2) {
        const iterations = 1 << (maxDepth - d + minDepth);
        let check = 0;
        for (let i = 0; i < iterations; i++) {
            check += checkTree(makeTree(d));
        }
        totalCheck += check;
    }
    const longCheck = checkTree(longLivedTree);
    return totalCheck + longCheck + checkResult;
}

function fannkuchTest(n) {
    const perm1 = [];
    for (let i = 0; i < n; i++) perm1[i] = i;
    const count = new Array(n).fill(0);
    let maxFlips = 0, permSign = 1, checkSum = 0;
    while (true) {
        const perm = perm1.slice();
        let flipsCount = 0, k = perm[0];
        while (k !== 0) {
            for (let i = 1, j = k; i < j; i++, j--) { const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
            const t = perm[0]; perm[0] = perm[k]; perm[k] = t;
            flipsCount++; k = perm[0];
        }
        if (flipsCount > maxFlips) maxFlips = flipsCount;
        checkSum += permSign * flipsCount;
        permSign = -permSign;
        let j = 1;
        while (j < n) {
            const k2 = perm1[0]; perm1[0] = perm1[j]; perm1[j] = k2;
            if (count[j] + 1 < j + 1) { count[j]++; break; }
            count[j] = 0; j++;
        }
        if (j >= n) break;
    }
    return maxFlips * 10000 + Math.abs(checkSum);
}

function nbodyTest(n) {
    const pi = 3.141592653589793;
    const solarMass = 4 * pi * pi;
    const bodies = [
        [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [9.54786104043e-4, 4.40461389325, 0.0, 0.0, 0.0, 2.76942312745e-1, 0.0],
        [2.85885980667e-4, 8.34336671824, 0.0, 0.0, 0.0, -1.46456543704e-1, 0.0],
        [4.36624404335e-5, 1.27900392338e1, 0.0, 0.0, 0.0, 5.15138902098e-2, 0.0],
        [5.15138902098e-5, 1.51338402872e1, 0.0, 0.0, 0.0, 4.24183568564e-2, 0.0],
    ];
    const dt = 0.01;
    function advance(bodies, dt) {
        const nb = bodies.length;
        for (let i = 0; i < nb; i++) {
            const bi = bodies[i];
            for (let j = i + 1; j < nb; j++) {
                const bj = bodies[j];
                const dx = bi[1] - bj[1], dy = bi[2] - bj[2], dz = bi[3] - bj[3];
                const distSq = dx * dx + dy * dy + dz * dz;
                const dist = Math.sqrt(distSq);
                const mag = dt / (distSq * dist);
                bi[4] -= dx * bj[0] * mag; bi[5] -= dy * bj[0] * mag; bi[6] -= dz * bj[0] * mag;
                bj[4] += dx * bi[0] * mag; bj[5] += dy * bi[0] * mag; bj[6] += dz * bi[0] * mag;
            }
        }
        for (let i = 0; i < nb; i++) {
            const bi = bodies[i];
            bi[1] += dt * bi[4]; bi[2] += dt * bi[5]; bi[3] += dt * bi[6];
        }
    }
    function energy(bodies) {
        let e = 0;
        const nb = bodies.length;
        for (let i = 0; i < nb; i++) {
            const bi = bodies[i];
            e += 0.5 * bi[0] * (bi[4] * bi[4] + bi[5] * bi[5] + bi[6] * bi[6]);
            for (let j = i + 1; j < nb; j++) {
                const bj = bodies[j];
                const dx = bi[1] - bj[1], dy = bi[2] - bj[2], dz = bi[3] - bj[3];
                e -= (bi[0] * bj[0]) / Math.sqrt(dx * dx + dy * dy + dz * dz);
            }
        }
        return e;
    }
    for (let i = 0; i < n; i++) advance(bodies, dt);
    return Math.floor(energy(bodies) * 1000000);
}

function mandelbrotTest(size) {
    let sum = 0;
    for (let y = 0; y < size; y++) {
        const ci = (y * 2.0) / size - 1.0;
        for (let x = 0; x < size; x++) {
            const cr = (x * 2.0) / size - 1.5;
            let zr = 0.0, zi = 0.0, zr2 = 0.0, zi2 = 0.0, iter = 0;
            while (iter < 50 && zr2 + zi2 <= 4.0) {
                zi = 2.0 * zr * zi + ci; zr = zr2 - zi2 + cr;
                zr2 = zr * zr; zi2 = zi * zi; iter++;
            }
            sum += iter;
        }
    }
    return sum;
}

function spectralNormTest(n) {
    function a(i, j) { const ij = i + j; return 1.0 / (ij * (ij + 1) / 2 + i + 1); }
    const u = new Array(n).fill(1.0), v = new Array(n).fill(0.0);
    for (let step = 0; step < 10; step++) {
        for (let i = 0; i < n; i++) { v[i] = 0; for (let j = 0; j < n; j++) v[i] += a(i, j) * u[j]; }
        for (let i = 0; i < n; i++) { u[i] = 0; for (let j = 0; j < n; j++) u[i] += a(j, i) * v[j]; }
    }
    let vBv = 0, vv = 0;
    for (let i = 0; i < n; i++) { vBv += u[i] * v[i]; vv += v[i] * v[i]; }
    return Math.floor(Math.sqrt(vBv / vv) * 1000000);
}

function heapSortTest(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr[i] = n - i;
    function siftDown(a, start, end) {
        let root = start;
        while (root * 2 + 1 <= end) {
            let child = root * 2 + 1, swap = root;
            if (a[swap] < a[child]) swap = child;
            if (child + 1 <= end && a[swap] < a[child + 1]) swap = child + 1;
            if (swap === root) return;
            const tmp = a[root]; a[root] = a[swap]; a[swap] = tmp;
            root = swap;
        }
    }
    for (let start = Math.floor((n - 2) / 2); start >= 0; start--) siftDown(arr, start, n - 1);
    for (let end = n - 1; end > 0; end--) {
        const tmp = arr[0]; arr[0] = arr[end]; arr[end] = tmp;
        siftDown(arr, 0, end - 1);
    }
    return arr[0];
}

function quickSortTest(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr[i] = n - i;
    function qsort(a, lo, hi) {
        if (lo >= hi) return;
        const pivot = a[lo + Math.floor((hi - lo) / 2)];
        let i = lo, j = hi;
        while (i <= j) {
            while (a[i] < pivot) i++;
            while (a[j] > pivot) j--;
            if (i <= j) { const tmp = a[i]; a[i] = a[j]; a[j] = tmp; i++; j--; }
        }
        qsort(a, lo, j); qsort(a, i, hi);
    }
    qsort(arr, 0, n - 1);
    return arr[0];
}

function hashMapOpsTest(n) {
    const map = {};
    for (let i = 0; i < n; i++) { const key = String(i % 1000); map[key] = i; }
    let sum = 0;
    for (let i = 0; i < n; i++) { const key = String(i % 1000); const val = map[key]; if (val !== undefined) sum += val; }
    return Object.keys(map).length * 10000 + sum % 10000;
}

function graphBfsTest(n) {
    const adj = {};
    for (let i = 0; i < n; i++) {
        const key = String(i); adj[key] = [];
        if (i + 1 < n) adj[key].push(String(i + 1));
        if (i * 2 < n) adj[key].push(String(i * 2));
    }
    const visited = {};
    const queue = ["0"]; visited["0"] = true;
    let count = 0;
    while (queue.length > 0) {
        const node = queue.shift();
        count++;
        const neighbors = adj[node];
        if (neighbors) {
            for (const nb of neighbors) {
                if (!visited[nb]) { visited[nb] = true; queue.push(nb); }
            }
        }
    }
    return count;
}

function linkedListOpsTest(n) {
    let head = null;
    for (let i = 0; i < n; i++) head = { val: i, next: head };
    let sum = 0;
    for (let cur = head; cur !== null; cur = cur.next) sum += cur.val;
    return sum;
}

function jsonTokenizeTest(n) {
    let json = "{";
    for (let i = 0; i < 10; i++) {
        const key = "k" + i;
        json += '"' + key + '":' + (i * 100);
        if (i < 9) json += ",";
    }
    json += "}";
    let tokens = 0;
    for (let iter = 0; iter < n; iter++) {
        for (let i = 0; i < json.length; i++) {
            const c = json[i];
            if (c === '{' || c === '}' || c === ':' || c === ',') { tokens++; }
            if (c === '"') { tokens++; let j = i + 1; while (j < json.length && json[j] !== '"') j++; i = j; }
        }
    }
    return tokens;
}

function csvParseTest(n) {
    let rows = 0;
    for (let iter = 0; iter < n; iter++) {
        const line = "42,Alice,95,A,true";
        const fields = line.split(",");
        rows += fields.length;
    }
    return rows;
}

function stringSearchTest(n) {
    let text = "";
    for (let i = 0; i < 100; i++) text += "abcdefghij";
    const pattern = "fgh";
    let count = 0;
    for (let iter = 0; iter < n; iter++) {
        for (let i = 0; i <= text.length - pattern.length; i++) {
            let match = true;
            for (let j = 0; j < pattern.length; j++) {
                if (text[i + j] !== pattern[j]) { match = false; break; }
            }
            if (match) count++;
        }
    }
    return count;
}

function templateRenderTest(n) {
    const template = "Hello {name}! Your score is {score}. Status: {status}";
    let total = 0;
    for (let i = 0; i < n; i++) {
        let result = template.replace("{name}", "World").replace("{score}", "100").replace("{status}", "active");
        total += result.length;
    }
    return total;
}

function matrixMulTest(n) {
    const a = [], b = [], c = [];
    for (let i = 0; i < n; i++) {
        a[i] = []; b[i] = []; c[i] = [];
        for (let j = 0; j < n; j++) { a[i][j] = i + j + 1; b[i][j] = i - j + n; c[i][j] = 0; }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        let sum = 0; for (let k = 0; k < n; k++) sum += a[i][k] * b[k][j]; c[i][j] = sum;
    }
    return Math.floor(c[0][0]);
}

function monteCarloPiTest(n) {
    let inside = 0;
    for (let i = 0; i < n; i++) {
        const x = Math.random(), y = Math.random();
        if (x * x + y * y <= 1.0) inside++;
    }
    return inside;
}

function linpackTest(n) {
    const a = [];
    for (let i = 0; i < n; i++) { a[i] = []; for (let j = 0; j < n; j++) a[i][j] = i + j + 1.0; }
    const b = [];
    for (let i = 0; i < n; i++) b[i] = i + 1.0;
    for (let k = 0; k < n; k++) {
        let maxRow = k, maxVal = Math.abs(a[k][k]);
        for (let i = k + 1; i < n; i++) { if (Math.abs(a[i][k]) > maxVal) { maxVal = Math.abs(a[i][k]); maxRow = i; } }
        if (maxRow !== k) { const tmp = a[k]; a[k] = a[maxRow]; a[maxRow] = tmp; const tmpB = b[k]; b[k] = b[maxRow]; b[maxRow] = tmpB; }
        for (let i = k + 1; i < n; i++) {
            const factor = a[i][k] / a[k][k];
            for (let j = k + 1; j < n; j++) a[i][j] -= factor * a[k][j];
            b[i] -= factor * b[k];
        }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = b[i]; for (let j = i + 1; j < n; j++) sum -= a[i][j] * x[j];
        x[i] = sum / a[i][i];
    }
    return Math.floor(x[0] * 1000);
}

function stateMachineTest(n) {
    let state = 0, count = 0;
    for (let i = 0; i < n; i++) {
        if (state === 0) { state = (i % 3 === 0) ? 1 : 2; count += 1; }
        else if (state === 1) { state = (i % 5 === 0) ? 0 : 3; count += 2; }
        else if (state === 2) { state = (i % 7 === 0) ? 0 : 1; count += 3; }
        else { state = 0; count += 4; }
    }
    return count;
}

function miniInterpreterTest(n) {
    const code = [1, 100, 2, 5, 3, 0, 1, 200, 2, 3, 3, 0, 0, 0];
    const stack = [];
    let ip = 0, result = 0, steps = 0;
    while (steps < n) {
        const op = code[ip % code.length];
        if (op === 0) break;
        if (op === 1) { ip++; stack.push(code[ip % code.length]); }
        if (op === 2) { ip++; const count = code[ip % code.length]; let sum = 0; for (let j = 0; j < count; j++) { if (stack.length > 0) sum += stack[stack.length - 1]; } result += sum; }
        if (op === 3) { ip++; result += code[ip % code.length]; }
        ip++; steps++;
    }
    return result;
}

function eventDispatchTest(n) {
    const handlers = {};
    const eventTypes = ["click", "hover", "scroll", "resize", "focus"];
    for (let i = 0; i < 5; i++) handlers[eventTypes[i]] = 0;
    for (let i = 0; i < n; i++) { handlers[eventTypes[i % 5]]++; }
    let total = 0;
    for (let i = 0; i < 5; i++) total += handlers[eventTypes[i]];
    return total;
}

const sink = [];
binaryTreesTest(4);
fannkuchTest(4);
nbodyTest(10);
mandelbrotTest(20);
spectralNormTest(20);
heapSortTest(100);
quickSortTest(100);
hashMapOpsTest(100);
graphBfsTest(10);
linkedListOpsTest(100);
jsonTokenizeTest(100);
csvParseTest(100);
stringSearchTest(100);
templateRenderTest(100);
matrixMulTest(10);
monteCarloPiTest(100);
linpackTest(10);
stateMachineTest(100);
miniInterpreterTest(100);
eventDispatchTest(100);

function benchStable(name, arg, fn) {
    const minSamples = 5;
    const maxSamples = 40;
    const minTotalMs = 200.0;
    const minSampleMs = 0.05;
    const samples = [];
    let totalMs = 0;
    let innerIters = 1;
    let out = fn(arg);
    sink.push(out);
    while (innerIters < (1 << 20)) {
        const start = performance.now();
        for (let i = 0; i < innerIters; i++) { const result = fn(arg); sink.push(result); out = result; }
        const elapsed = performance.now() - start;
        if (elapsed >= minSampleMs) break;
        innerIters <<= 1;
    }
    while (samples.length < minSamples || (totalMs < minTotalMs && samples.length < maxSamples)) {
        const start = performance.now();
        for (let i = 0; i < innerIters; i++) { const result = fn(arg); sink.push(result); out = result; }
        const elapsed = performance.now() - start;
        samples.push(elapsed / innerIters);
        totalMs += elapsed;
    }
    samples.sort((a, b) => a - b);
    const m = Math.floor(samples.length / 2);
    const median = samples.length % 2 === 1 ? samples[m] : (samples[m - 1] + samples[m]) * 0.5;
    console.log(\`\${name}(\${arg})=\${out} \${median.toFixed(6)}ms\`);
}

function runBenchmark() {
    console.log("=== JavaScript Industry Benchmark ===");
    benchStable("binary_trees", 16, binaryTreesTest);
    benchStable("fannkuch", 10, fannkuchTest);
    benchStable("nbody", 500, nbodyTest);
    benchStable("mandelbrot", 200, mandelbrotTest);
    benchStable("spectral_norm", 200, spectralNormTest);
    benchStable("heap_sort", 10000, heapSortTest);
    benchStable("quick_sort", 10000, quickSortTest);
    benchStable("hash_map_ops", 50000, hashMapOpsTest);
    benchStable("graph_bfs", 1000, graphBfsTest);
    benchStable("linked_list_ops", 10000, linkedListOpsTest);
    benchStable("json_tokenize", 10000, jsonTokenizeTest);
    benchStable("csv_parse", 5000, csvParseTest);
    benchStable("string_search", 100000, stringSearchTest);
    benchStable("template_render", 10000, templateRenderTest);
    benchStable("matrix_mul", 100, matrixMulTest);
    benchStable("monte_carlo_pi", 1000000, monteCarloPiTest);
    benchStable("linpack", 100, linpackTest);
    benchStable("state_machine", 100000, stateMachineTest);
    benchStable("mini_interpreter", 10000, miniInterpreterTest);
    benchStable("event_dispatch", 50000, eventDispatchTest);
}

runBenchmark();
`;

const BENCH_PY = `import math
import random
import time

def binary_trees_test(depth):
    def make_tree(d):
        if d == 0: return (None, None)
        return (make_tree(d - 1), make_tree(d - 1))
    def check_tree(node):
        if node[0] is None: return 1
        return 1 + check_tree(node[0]) + check_tree(node[1])
    min_depth = 4
    max_depth = max(depth, min_depth + 2)
    stretch_depth = max_depth + 1
    check_result = check_tree(make_tree(stretch_depth))
    long_lived_tree = make_tree(max_depth)
    total_check = 0
    d = min_depth
    while d <= max_depth:
        iterations = 1 << (max_depth - d + min_depth)
        check = 0
        for i in range(iterations):
            check += check_tree(make_tree(d))
        total_check += check
        d += 2
    long_check = check_tree(long_lived_tree)
    return total_check + long_check + check_result

def fannkuch_test(n):
    perm1 = list(range(n))
    count = [0] * n
    max_flips = 0
    perm_sign = 1
    check_sum = 0
    while True:
        perm = perm1[:]
        flips_count = 0
        k = perm[0]
        while k != 0:
            perm[1:k+1] = perm[1:k+1][::-1]
            perm[0], perm[k] = perm[k], perm[0]
            flips_count += 1
            k = perm[0]
        if flips_count > max_flips: max_flips = flips_count
        check_sum += perm_sign * flips_count
        perm_sign = -perm_sign
        j = 1
        while j < n:
            perm1[0], perm1[j] = perm1[j], perm1[0]
            if count[j] + 1 < j + 1:
                count[j] += 1
                break
            count[j] = 0
            j += 1
        if j >= n: break
    return max_flips * 10000 + abs(check_sum)

def nbody_test(n):
    pi = 3.141592653589793
    bodies = [
        [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [9.54786104043e-4, 4.40461389325, 0.0, 0.0, 0.0, 2.76942312745e-1, 0.0],
        [2.85885980667e-4, 8.34336671824, 0.0, 0.0, 0.0, -1.46456543704e-1, 0.0],
        [4.36624404335e-5, 1.27900392338e1, 0.0, 0.0, 0.0, 5.15138902098e-2, 0.0],
        [5.15138902098e-5, 1.51338402872e1, 0.0, 0.0, 0.0, 4.24183568564e-2, 0.0],
    ]
    dt = 0.01
    for _ in range(n):
        nb = len(bodies)
        for i in range(nb):
            bi = bodies[i]
            for j in range(i + 1, nb):
                bj = bodies[j]
                dx = bi[1] - bj[1]; dy = bi[2] - bj[2]; dz = bi[3] - bj[3]
                dist_sq = dx*dx + dy*dy + dz*dz
                dist = math.sqrt(dist_sq)
                mag = dt / (dist_sq * dist)
                bi[4] -= dx * bj[0] * mag; bi[5] -= dy * bj[0] * mag; bi[6] -= dz * bj[0] * mag
                bj[4] += dx * bi[0] * mag; bj[5] += dy * bi[0] * mag; bj[6] += dz * bi[0] * mag
        for i in range(nb):
            bi = bodies[i]
            bi[1] += dt * bi[4]; bi[2] += dt * bi[5]; bi[3] += dt * bi[6]
    e = 0
    nb = len(bodies)
    for i in range(nb):
        bi = bodies[i]
        e += 0.5 * bi[0] * (bi[4]**2 + bi[5]**2 + bi[6]**2)
        for j in range(i + 1, nb):
            bj = bodies[j]
            dx = bi[1]-bj[1]; dy = bi[2]-bj[2]; dz = bi[3]-bj[3]
            e -= (bi[0] * bj[0]) / math.sqrt(dx*dx + dy*dy + dz*dz)
    return int(e * 1000000)

def mandelbrot_test(size):
    total = 0
    for y in range(size):
        ci = (y * 2.0) / size - 1.0
        for x in range(size):
            cr = (x * 2.0) / size - 1.5
            zr = 0.0; zi = 0.0; zr2 = 0.0; zi2 = 0.0; it = 0
            while it < 50 and zr2 + zi2 <= 4.0:
                zi = 2.0 * zr * zi + ci; zr = zr2 - zi2 + cr
                zr2 = zr * zr; zi2 = zi * zi; it += 1
            total += it
    return total

def spectral_norm_test(n):
    def a(i, j):
        ij = i + j
        return 1.0 / (ij * (ij + 1) / 2 + i + 1)
    u = [1.0] * n; v = [0.0] * n
    for _ in range(10):
        for i in range(n):
            v[i] = sum(a(i, j) * u[j] for j in range(n))
        for i in range(n):
            u[i] = sum(a(j, i) * v[j] for j in range(n))
    vBv = sum(u[i] * v[i] for i in range(n))
    vv = sum(v[i] * v[i] for i in range(n))
    return int(math.sqrt(vBv / vv) * 1000000)

def heap_sort_test(n):
    arr = list(range(n, 0, -1))
    def sift_down(a, start, end):
        root = start
        while root * 2 + 1 <= end:
            child = root * 2 + 1; swap = root
            if a[swap] < a[child]: swap = child
            if child + 1 <= end and a[swap] < a[child + 1]: swap = child + 1
            if swap == root: return
            a[root], a[swap] = a[swap], a[root]; root = swap
    for start in range((n - 2) // 2, -1, -1): sift_down(arr, start, n - 1)
    for end in range(n - 1, 0, -1):
        arr[0], arr[end] = arr[end], arr[0]; sift_down(arr, 0, end - 1)
    return arr[0]

def quick_sort_test(n):
    arr = list(range(n, 0, -1))
    def qsort(a, lo, hi):
        if lo >= hi: return
        pivot = a[lo + (hi - lo) // 2]
        i = lo; j = hi
        while i <= j:
            while a[i] < pivot: i += 1
            while a[j] > pivot: j -= 1
            if i <= j: a[i], a[j] = a[j], a[i]; i += 1; j -= 1
        qsort(a, lo, j); qsort(a, i, hi)
    qsort(arr, 0, n - 1)
    return arr[0]

def hash_map_ops_test(n):
    m = {}
    for i in range(n):
        key = str(i % 1000); m[key] = i
    s = 0
    for i in range(n):
        key = str(i % 1000)
        if key in m: s += m[key]
    return len(m) * 10000 + s % 10000

def graph_bfs_test(n):
    adj = {}
    for i in range(n):
        key = str(i); adj[key] = []
        if i + 1 < n: adj[key].append(str(i + 1))
        if i * 2 < n: adj[key].append(str(i * 2))
    visited = {"0": True}; queue = ["0"]; count = 0
    while queue:
        node = queue.pop(0); count += 1
        for nb in adj.get(node, []):
            if nb not in visited: visited[nb] = True; queue.append(nb)
    return count

def linked_list_ops_test(n):
    head = None
    for i in range(n): head = {"val": i, "next": head}
    s = 0; cur = head
    while cur is not None: s += cur["val"]; cur = cur["next"]
    return s

def json_tokenize_test(n):
    json_str = "{"
    for i in range(10):
        json_str += '"k' + str(i) + '":' + str(i * 100)
        if i < 9: json_str += ","
    json_str += "}"
    tokens = 0
    for _ in range(n):
        i = 0
        while i < len(json_str):
            c = json_str[i]
            if c in "{}:,": tokens += 1
            if c == '"':
                tokens += 1; j = i + 1
                while j < len(json_str) and json_str[j] != '"': j += 1
                i = j
            i += 1
    return tokens

def csv_parse_test(n):
    rows = 0
    for _ in range(n):
        line = "42,Alice,95,A,true"
        fields = line.split(",")
        rows += len(fields)
    return rows

def string_search_test(n):
    text = "abcdefghij" * 100
    pattern = "fgh"
    count = 0
    for _ in range(n):
        for i in range(len(text) - len(pattern) + 1):
            match = True
            for j in range(len(pattern)):
                if text[i + j] != pattern[j]: match = False; break
            if match: count += 1
    return count

def template_render_test(n):
    template = "Hello {name}! Your score is {score}. Status: {status}"
    total = 0
    for _ in range(n):
        result = template.replace("{name}", "World").replace("{score}", "100").replace("{status}", "active")
        total += len(result)
    return total

def matrix_mul_test(n):
    a = [[i + j + 1 for j in range(n)] for i in range(n)]
    b = [[i - j + n for j in range(n)] for i in range(n)]
    c = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            s = 0
            for k in range(n): s += a[i][k] * b[k][j]
            c[i][j] = s
    return int(c[0][0])

def monte_carlo_pi_test(n):
    inside = 0
    for i in range(n):
        x = random.random(); y = random.random()
        if x * x + y * y <= 1.0: inside += 1
    return inside

def linpack_test(n):
    a = [[float(i + j + 1) for j in range(n)] for i in range(n)]
    b = [float(i + 1) for i in range(n)]
    for k in range(n):
        max_row = k; max_val = abs(a[k][k])
        for i in range(k + 1, n):
            if abs(a[i][k]) > max_val: max_val = abs(a[i][k]); max_row = i
        if max_row != k:
            a[k], a[max_row] = a[max_row], a[k]
            b[k], b[max_row] = b[max_row], b[k]
        for i in range(k + 1, n):
            factor = a[i][k] / a[k][k]
            for j in range(k + 1, n): a[i][j] -= factor * a[k][j]
            b[i] -= factor * b[k]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = b[i]
        for j in range(i + 1, n): s -= a[i][j] * x[j]
        x[i] = s / a[i][i]
    return int(x[0] * 1000)

def state_machine_test(n):
    state = 0; count = 0
    for i in range(n):
        if state == 0: state = 1 if i % 3 == 0 else 2; count += 1
        elif state == 1: state = 0 if i % 5 == 0 else 3; count += 2
        elif state == 2: state = 0 if i % 7 == 0 else 1; count += 3
        else: state = 0; count += 4
    return count

def mini_interpreter_test(n):
    code = [1, 100, 2, 5, 3, 0, 1, 200, 2, 3, 3, 0, 0, 0]
    stack = []; ip = 0; result = 0; steps = 0
    while steps < n:
        op = code[ip % len(code)]
        if op == 0: break
        if op == 1: ip += 1; stack.append(code[ip % len(code)])
        if op == 2:
            ip += 1; count = code[ip % len(code)]; s = 0
            for j in range(count):
                if stack: s += stack[-1]
            result += s
        if op == 3: ip += 1; result += code[ip % len(code)]
        ip += 1; steps += 1
    return result

def event_dispatch_test(n):
    handlers = {"click": 0, "hover": 0, "scroll": 0, "resize": 0, "focus": 0}
    event_types = ["click", "hover", "scroll", "resize", "focus"]
    for i in range(n): handlers[event_types[i % 5]] += 1
    return sum(handlers.values())

def bench_stable(name, arg, fn):
    min_samples = 5; max_samples = 40; min_total_ms = 200.0; min_sample_ms = 0.05
    samples = []; total_ms = 0; inner_iters = 1
    out = fn(arg)
    while inner_iters < (1 << 20):
        start = time.perf_counter()
        for _ in range(inner_iters): out = fn(arg)
        elapsed = (time.perf_counter() - start) * 1000
        if elapsed >= min_sample_ms: break
        inner_iters <<= 1
    while len(samples) < min_samples or (total_ms < min_total_ms and len(samples) < max_samples):
        start = time.perf_counter()
        for _ in range(inner_iters): out = fn(arg)
        elapsed = (time.perf_counter() - start) * 1000
        samples.append(elapsed / inner_iters); total_ms += elapsed
    samples.sort()
    m = len(samples) // 2
    median = samples[m] if len(samples) % 2 else (samples[m-1] + samples[m]) * 0.5
    print(f"{name}({arg})={out} {median:.6f}ms")

print("=== Python Industry Benchmark ===")
bench_stable("binary_trees", 16, binary_trees_test)
bench_stable("fannkuch", 10, fannkuch_test)
bench_stable("nbody", 500, nbody_test)
bench_stable("mandelbrot", 200, mandelbrot_test)
bench_stable("spectral_norm", 200, spectral_norm_test)
bench_stable("heap_sort", 10000, heap_sort_test)
bench_stable("quick_sort", 10000, quick_sort_test)
bench_stable("hash_map_ops", 50000, hash_map_ops_test)
bench_stable("graph_bfs", 1000, graph_bfs_test)
bench_stable("linked_list_ops", 10000, linked_list_ops_test)
bench_stable("json_tokenize", 10000, json_tokenize_test)
bench_stable("csv_parse", 5000, csv_parse_test)
bench_stable("string_search", 100000, string_search_test)
bench_stable("template_render", 10000, template_render_test)
bench_stable("matrix_mul", 100, matrix_mul_test)
bench_stable("monte_carlo_pi", 1000000, monte_carlo_pi_test)
bench_stable("linpack", 100, linpack_test)
bench_stable("state_machine", 100000, state_machine_test)
bench_stable("mini_interpreter", 10000, mini_interpreter_test)
bench_stable("event_dispatch", 50000, event_dispatch_test)
`;

const BENCH_CPP = `#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <cstring>
#include <vector>
#include <string>
#include <unordered_map>
#include <chrono>
#include <algorithm>

static double pi_val = 3.141592653589793;

int binary_trees_test(int depth) {
    struct Node { Node* left; Node* right; };
    auto make_tree = [](auto& self, int d) -> Node* {
        if (d == 0) return new Node{nullptr, nullptr};
        return new Node{self(self, d-1), self(self, d-1)};
    };
    auto check_tree = [](auto& self, Node* node) -> int {
        if (!node->left) return 1;
        return 1 + self(self, node->left) + self(self, node->right);
    };
    int minDepth = 4, maxDepth = std::max(depth, minDepth + 2);
    int stretchDepth = maxDepth + 1;
    int checkResult = check_tree(check_tree, make_tree(make_tree, stretchDepth));
    Node* longLived = make_tree(make_tree, maxDepth);
    int totalCheck = 0;
    for (int d = minDepth; d <= maxDepth; d += 2) {
        int iterations = 1 << (maxDepth - d + minDepth);
        int check = 0;
        for (int i = 0; i < iterations; i++) check += check_tree(check_tree, make_tree(make_tree, d));
        totalCheck += check;
    }
    int longCheck = check_tree(check_tree, longLived);
    return totalCheck + longCheck + checkResult;
}

int fannkuch_test(int n) {
    std::vector<int> perm1(n), count(n, 0);
    for (int i = 0; i < n; i++) perm1[i] = i;
    int maxFlips = 0, permSign = 1, checkSum = 0;
    while (true) {
        std::vector<int> perm = perm1;
        int flipsCount = 0, k = perm[0];
        while (k != 0) {
            for (int i = 1, j = k; i < j; i++, j--) { int t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
            int t = perm[0]; perm[0] = perm[k]; perm[k] = t;
            flipsCount++; k = perm[0];
        }
        if (flipsCount > maxFlips) maxFlips = flipsCount;
        checkSum += permSign * flipsCount;
        permSign = -permSign;
        int j = 1;
        while (j < n) {
            int k2 = perm1[0]; perm1[0] = perm1[j]; perm1[j] = k2;
            if (count[j] + 1 < j + 1) { count[j]++; break; }
            count[j] = 0; j++;
        }
        if (j >= n) break;
    }
    return maxFlips * 10000 + std::abs(checkSum);
}

int nbody_test(int n) {
    double bodies[5][7] = {
        {1.0,0,0,0,0,0,0},
        {9.54786104043e-4,4.40461389325,0,0,0,2.76942312745e-1,0},
        {2.85885980667e-4,8.34336671824,0,0,0,-1.46456543704e-1,0},
        {4.36624404335e-5,1.27900392338e1,0,0,0,5.15138902098e-2,0},
        {5.15138902098e-5,1.51338402872e1,0,0,0,4.24183568564e-2,0}
    };
    double dt = 0.01;
    for (int step = 0; step < n; step++) {
        for (int i = 0; i < 5; i++) for (int j = i+1; j < 5; j++) {
            double dx=bodies[i][1]-bodies[j][1], dy=bodies[i][2]-bodies[j][2], dz=bodies[i][3]-bodies[j][3];
            double distSq=dx*dx+dy*dy+dz*dz, dist=std::sqrt(distSq), mag=dt/(distSq*dist);
            bodies[i][4]-=dx*bodies[j][0]*mag; bodies[i][5]-=dy*bodies[j][0]*mag; bodies[i][6]-=dz*bodies[j][0]*mag;
            bodies[j][4]+=dx*bodies[i][0]*mag; bodies[j][5]+=dy*bodies[i][0]*mag; bodies[j][6]+=dz*bodies[i][0]*mag;
        }
        for (int i = 0; i < 5; i++) { bodies[i][1]+=dt*bodies[i][4]; bodies[i][2]+=dt*bodies[i][5]; bodies[i][3]+=dt*bodies[i][6]; }
    }
    double e = 0;
    for (int i = 0; i < 5; i++) {
        e += 0.5*bodies[i][0]*(bodies[i][4]*bodies[i][4]+bodies[i][5]*bodies[i][5]+bodies[i][6]*bodies[i][6]);
        for (int j = i+1; j < 5; j++) {
            double dx=bodies[i][1]-bodies[j][1], dy=bodies[i][2]-bodies[j][2], dz=bodies[i][3]-bodies[j][3];
            e -= (bodies[i][0]*bodies[j][0])/std::sqrt(dx*dx+dy*dy+dz*dz);
        }
    }
    return (int)(e * 1000000);
}

int mandelbrot_test(int size) {
    int sum = 0;
    for (int y = 0; y < size; y++) {
        double ci = (y * 2.0) / size - 1.0;
        for (int x = 0; x < size; x++) {
            double cr = (x * 2.0) / size - 1.5, zr=0, zi=0, zr2=0, zi2=0;
            int iter = 0;
            while (iter < 50 && zr2+zi2 <= 4.0) { zi=2*zr*zi+ci; zr=zr2-zi2+cr; zr2=zr*zr; zi2=zi*zi; iter++; }
            sum += iter;
        }
    }
    return sum;
}

int spectral_norm_test(int n) {
    auto a = [](int i, int j) -> double { int ij=i+j; return 1.0/(ij*(ij+1)/2+i+1); };
    std::vector<double> u(n,1.0), v(n,0.0);
    for (int step = 0; step < 10; step++) {
        for (int i = 0; i < n; i++) { v[i]=0; for (int j = 0; j < n; j++) v[i]+=a(i,j)*u[j]; }
        for (int i = 0; i < n; i++) { u[i]=0; for (int j = 0; j < n; j++) u[i]+=a(j,i)*v[j]; }
    }
    double vBv=0, vv=0;
    for (int i = 0; i < n; i++) { vBv+=u[i]*v[i]; vv+=v[i]*v[i]; }
    return (int)(std::sqrt(vBv/vv)*1000000);
}

int heap_sort_test(int n) {
    std::vector<int> arr(n); for (int i = 0; i < n; i++) arr[i] = n - i;
    std::make_heap(arr.begin(), arr.end());
    std::sort_heap(arr.begin(), arr.end());
    return arr[0];
}

int quick_sort_test(int n) {
    std::vector<int> arr(n); for (int i = 0; i < n; i++) arr[i] = n - i;
    std::sort(arr.begin(), arr.end());
    return arr[0];
}

int hash_map_ops_test(int n) {
    std::unordered_map<std::string, int> m;
    for (int i = 0; i < n; i++) { m[std::to_string(i%1000)] = i; }
    int s = 0;
    for (int i = 0; i < n; i++) { auto it = m.find(std::to_string(i%1000)); if (it != m.end()) s += it->second; }
    return (int)m.size() * 10000 + s % 10000;
}

int graph_bfs_test(int n) {
    std::vector<std::vector<int>> adj(n);
    for (int i = 0; i < n; i++) { if (i+1<n) adj[i].push_back(i+1); if (i*2<n) adj[i].push_back(i*2); }
    std::vector<bool> visited(n, false);
    std::vector<int> queue; queue.push_back(0); visited[0] = true;
    int count = 0, front = 0;
    while (front < (int)queue.size()) {
        int node = queue[front++]; count++;
        for (int nb : adj[node]) { if (!visited[nb]) { visited[nb] = true; queue.push_back(nb); } }
    }
    return count;
}

int linked_list_ops_test(int n) {
    struct Node { int val; Node* next; };
    Node* head = nullptr;
    for (int i = 0; i < n; i++) head = new Node{i, head};
    int s = 0; for (Node* c = head; c; c = c->next) s += c->val;
    return s;
}

int json_tokenize_test(int n) {
    std::string json = "{";
    for (int i = 0; i < 10; i++) {
        json += "\\"k" + std::to_string(i) + "\\\":" + std::to_string(i*100);
        if (i < 9) json += ",";
    }
    json += "}";
    int tokens = 0;
    for (int iter = 0; iter < n; iter++) {
        for (size_t i = 0; i < json.size(); i++) {
            char c = json[i];
            if (c=='{'||c=='}'||c==':'||c==',') tokens++;
            if (c=='"') { tokens++; i++; while (i<json.size()&&json[i]!='"') i++; }
        }
    }
    return tokens;
}

int csv_parse_test(int n) {
    int rows = 0;
    for (int iter = 0; iter < n; iter++) {
        const char* line = "42,Alice,95,A,true";
        int fields = 1; for (const char* p = line; *p; p++) if (*p==',') fields++;
        rows += fields;
    }
    return rows;
}

int string_search_test(int n) {
    std::string text; for (int i = 0; i < 100; i++) text += "abcdefghij";
    std::string pattern = "fgh";
    int count = 0;
    for (int iter = 0; iter < n; iter++) {
        for (size_t i = 0; i <= text.size()-pattern.size(); i++) {
            bool match = true;
            for (size_t j = 0; j < pattern.size(); j++) { if (text[i+j]!=pattern[j]) { match=false; break; } }
            if (match) count++;
        }
    }
    return count;
}

int template_render_test(int n) {
    const char* tmpl = "Hello {name}! Your score is {score}. Status: {status}";
    int total = 0;
    for (int i = 0; i < n; i++) {
        std::string r = tmpl;
        size_t pos;
        while ((pos = r.find("{name}")) != std::string::npos) r.replace(pos, 6, "World");
        while ((pos = r.find("{score}")) != std::string::npos) r.replace(pos, 7, "100");
        while ((pos = r.find("{status}")) != std::string::npos) r.replace(pos, 8, "active");
        total += (int)r.size();
    }
    return total;
}

int matrix_mul_test(int n) {
    std::vector<std::vector<double>> a(n,std::vector<double>(n)), b(n,std::vector<double>(n)), c(n,std::vector<double>(n,0));
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) { a[i][j]=i+j+1; b[i][j]=i-j+n; }
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) { double s=0; for (int k = 0; k < n; k++) s+=a[i][k]*b[k][j]; c[i][j]=s; }
    return (int)c[0][0];
}

int monte_carlo_pi_test(int n) {
    int inside = 0;
    for (int i = 0; i < n; i++) { double x=(double)rand()/RAND_MAX, y=(double)rand()/RAND_MAX; if (x*x+y*y<=1.0) inside++; }
    return inside;
}

int linpack_test(int n) {
    std::vector<std::vector<double>> a(n,std::vector<double>(n));
    std::vector<double> b(n);
    for (int i = 0; i < n; i++) { for (int j = 0; j < n; j++) a[i][j]=i+j+1.0; b[i]=i+1.0; }
    for (int k = 0; k < n; k++) {
        int maxRow=k; double maxVal=fabs(a[k][k]);
        for (int i = k+1; i < n; i++) if (fabs(a[i][k])>maxVal) { maxVal=fabs(a[i][k]); maxRow=i; }
        if (maxRow!=k) { std::swap(a[k],a[maxRow]); std::swap(b[k],b[maxRow]); }
        for (int i = k+1; i < n; i++) { double f=a[i][k]/a[k][k]; for (int j = k+1; j < n; j++) a[i][j]-=f*a[k][j]; b[i]-=f*b[k]; }
    }
    std::vector<double> x(n,0);
    for (int i = n-1; i >= 0; i--) { double s=b[i]; for (int j = i+1; j < n; j++) s-=a[i][j]*x[j]; x[i]=s/a[i][i]; }
    return (int)(x[0]*1000);
}

int state_machine_test(int n) {
    int state=0, count=0;
    for (int i = 0; i < n; i++) {
        if (state==0) { state=(i%3==0)?1:2; count+=1; }
        else if (state==1) { state=(i%5==0)?0:3; count+=2; }
        else if (state==2) { state=(i%7==0)?0:1; count+=3; }
        else { state=0; count+=4; }
    }
    return count;
}

int mini_interpreter_test(int n) {
    int code[] = {1,100,2,5,3,0,1,200,2,3,3,0,0,0};
    int codeLen = 14;
    std::vector<int> stack; int ip=0, result=0, steps=0;
    while (steps < n) {
        int op = code[ip%codeLen];
        if (op==0) break;
        if (op==1) { ip++; stack.push_back(code[ip%codeLen]); }
        if (op==2) { ip++; int cnt=code[ip%codeLen]; int s=0; for (int j=0;j<cnt;j++) if (!stack.empty()) s+=stack.back(); result+=s; }
        if (op==3) { ip++; result+=code[ip%codeLen]; }
        ip++; steps++;
    }
    return result;
}

int event_dispatch_test(int n) {
    int handlers[5] = {0,0,0,0,0};
    for (int i = 0; i < n; i++) handlers[i%5]++;
    return handlers[0]+handlers[1]+handlers[2]+handlers[3]+handlers[4];
}

void bench_stable(const char* name, int arg, int (*fn)(int)) {
    const int minSamples=5, maxSamples=40;
    const double minTotalMs=200.0, minSampleMs=0.05;
    std::vector<double> samples; double totalMs=0; int innerIters=1;
    int out = fn(arg);
    while (innerIters < (1<<20)) {
        auto start = std::chrono::high_resolution_clock::now();
        for (int i = 0; i < innerIters; i++) out = fn(arg);
        auto end = std::chrono::high_resolution_clock::now();
        double elapsed = std::chrono::duration<double, std::milli>(end-start).count();
        if (elapsed >= minSampleMs) break;
        innerIters <<= 1;
    }
    while ((int)samples.size() < minSamples || (totalMs < minTotalMs && (int)samples.size() < maxSamples)) {
        auto start = std::chrono::high_resolution_clock::now();
        for (int i = 0; i < innerIters; i++) out = fn(arg);
        auto end = std::chrono::high_resolution_clock::now();
        double elapsed = std::chrono::duration<double, std::milli>(end-start).count();
        samples.push_back(elapsed/innerIters); totalMs += elapsed;
    }
    std::sort(samples.begin(), samples.end());
    double median = samples.size()%2 ? samples[samples.size()/2] : (samples[samples.size()/2-1]+samples[samples.size()/2])*0.5;
    printf("%s(%d)=%d %.6fms\\n", name, arg, out, median);
}

int main() {
    printf("=== C++ Industry Benchmark ===\\n");
    bench_stable("binary_trees", 16, binary_trees_test);
    bench_stable("fannkuch", 10, fannkuch_test);
    bench_stable("nbody", 500, nbody_test);
    bench_stable("mandelbrot", 200, mandelbrot_test);
    bench_stable("spectral_norm", 200, spectral_norm_test);
    bench_stable("heap_sort", 10000, heap_sort_test);
    bench_stable("quick_sort", 10000, quick_sort_test);
    bench_stable("hash_map_ops", 50000, hash_map_ops_test);
    bench_stable("graph_bfs", 1000, graph_bfs_test);
    bench_stable("linked_list_ops", 10000, linked_list_ops_test);
    bench_stable("json_tokenize", 10000, json_tokenize_test);
    bench_stable("csv_parse", 5000, csv_parse_test);
    bench_stable("string_search", 100000, string_search_test);
    bench_stable("template_render", 10000, template_render_test);
    bench_stable("matrix_mul", 100, matrix_mul_test);
    bench_stable("monte_carlo_pi", 1000000, monte_carlo_pi_test);
    bench_stable("linpack", 100, linpack_test);
    bench_stable("state_machine", 100000, state_machine_test);
    bench_stable("mini_interpreter", 10000, mini_interpreter_test);
    bench_stable("event_dispatch", 50000, event_dispatch_test);
    return 0;
}
`;

const BENCH_RS = `use std::collections::HashMap;

fn binary_trees_test(depth: i32) -> i64 {
    enum Node { Leaf, Branch(Box<Node>, Box<Node>) }
    fn make_tree(d: i32) -> Node {
        if d == 0 { Node::Leaf } else { Node::Branch(Box::new(make_tree(d-1)), Box::new(make_tree(d-1))) }
    }
    fn check_tree(node: &Node) -> i64 {
        match node { Node::Leaf => 1, Node::Branch(l, r) => 1 + check_tree(l) + check_tree(r) }
    }
    let min_depth = 4; let max_depth = depth.max(min_depth + 2);
    let stretch_depth = max_depth + 1;
    let check_result = check_tree(&make_tree(stretch_depth));
    let long_lived = make_tree(max_depth);
    let mut total_check: i64 = 0;
    let mut d = min_depth;
    while d <= max_depth {
        let iterations = 1i64 << (max_depth - d + min_depth);
        let mut check: i64 = 0;
        for _ in 0..iterations { check += check_tree(&make_tree(d)); }
        total_check += check;
        d += 2;
    }
    let long_check = check_tree(&long_lived);
    total_check + long_check + check_result
}

fn fannkuch_test(n: i32) -> i64 {
    let mut perm1: Vec<i32> = (0..n).collect();
    let mut count = vec![0i32; n as usize];
    let mut max_flips = 0i64; let mut perm_sign = 1i64; let mut check_sum = 0i64;
    loop {
        let mut perm = perm1.clone();
        let mut flips_count = 0i64; let mut k = perm[0];
        while k != 0 {
            let ki = k as usize;
            perm[1..ki+1].reverse();
            perm.swap(0, ki);
            flips_count += 1; k = perm[0];
        }
        if flips_count > max_flips { max_flips = flips_count; }
        check_sum += perm_sign * flips_count;
        perm_sign = -perm_sign;
        let mut j = 1usize;
        while j < n as usize {
            perm1.swap(0, j);
            if count[j] + 1 < j as i32 + 1 { count[j] += 1; break; }
            count[j] = 0; j += 1;
        }
        if j >= n as usize { break; }
    }
    max_flips * 10000 + check_sum.abs()
}

fn nbody_test(n: i32) -> i64 {
    let mut bodies: [[f64; 7]; 5] = [
        [1.0,0.0,0.0,0.0,0.0,0.0,0.0],
        [9.54786104043e-4,4.40461389325,0.0,0.0,0.0,2.76942312745e-1,0.0],
        [2.85885980667e-4,8.34336671824,0.0,0.0,0.0,-1.46456543704e-1,0.0],
        [4.36624404335e-5,1.27900392338e1,0.0,0.0,0.0,5.15138902098e-2,0.0],
        [5.15138902098e-5,1.51338402872e1,0.0,0.0,0.0,4.24183568564e-2,0.0],
    ];
    let dt = 0.01f64;
    for _ in 0..n {
        for i in 0..5 { for j in (i+1)..5 {
            let dx=bodies[i][1]-bodies[j][1]; let dy=bodies[i][2]-bodies[j][2]; let dz=bodies[i][3]-bodies[j][3];
            let dist_sq=dx*dx+dy*dy+dz*dz; let dist=dist_sq.sqrt(); let mag=dt/(dist_sq*dist);
            bodies[i][4]-=dx*bodies[j][0]*mag; bodies[i][5]-=dy*bodies[j][0]*mag; bodies[i][6]-=dz*bodies[j][0]*mag;
            bodies[j][4]+=dx*bodies[i][0]*mag; bodies[j][5]+=dy*bodies[i][0]*mag; bodies[j][6]+=dz*bodies[i][0]*mag;
        }}
        for i in 0..5 { bodies[i][1]+=dt*bodies[i][4]; bodies[i][2]+=dt*bodies[i][5]; bodies[i][3]+=dt*bodies[i][6]; }
    }
    let mut e = 0.0f64;
    for i in 0..5 {
        e += 0.5*bodies[i][0]*(bodies[i][4]*bodies[i][4]+bodies[i][5]*bodies[i][5]+bodies[i][6]*bodies[i][6]);
        for j in (i+1)..5 {
            let dx=bodies[i][1]-bodies[j][1]; let dy=bodies[i][2]-bodies[j][2]; let dz=bodies[i][3]-bodies[j][3];
            e -= (bodies[i][0]*bodies[j][0])/(dx*dx+dy*dy+dz*dz).sqrt();
        }
    }
    (e * 1000000.0) as i64
}

fn mandelbrot_test(size: i32) -> i64 {
    let mut sum: i64 = 0;
    for y in 0..size {
        let ci = (y as f64 * 2.0) / size as f64 - 1.0;
        for x in 0..size {
            let cr = (x as f64 * 2.0) / size as f64 - 1.5;
            let mut zr=0.0f64; let mut zi=0.0f64; let mut zr2=0.0f64; let mut zi2=0.0f64; let mut iter=0i64;
            while iter < 50 && zr2+zi2 <= 4.0 { zi=2.0*zr*zi+ci; zr=zr2-zi2+cr; zr2=zr*zr; zi2=zi*zi; iter+=1; }
            sum += iter;
        }
    }
    sum
}

fn spectral_norm_test(n: i32) -> i64 {
    let a = |i: i32, j: i32| -> f64 { let ij=(i+j) as f64; 1.0/(ij*(ij+1.0)/2.0+i as f64+1.0) };
    let mut u = vec![1.0f64; n as usize]; let mut v = vec![0.0f64; n as usize];
    for _ in 0..10 {
        for i in 0..n as usize { v[i]=0.0; for j in 0..n as usize { v[i]+=a(i as i32, j as i32)*u[j]; } }
        for i in 0..n as usize { u[i]=0.0; for j in 0..n as usize { u[i]+=a(j as i32, i as i32)*v[j]; } }
    }
    let mut vBv=0.0f64; let mut vv=0.0f64;
    for i in 0..n as usize { vBv+=u[i]*v[i]; vv+=v[i]*v[i]; }
    ((vBv/vv).sqrt() * 1000000.0) as i64
}

fn heap_sort_test(n: i32) -> i64 {
    let mut arr: Vec<i32> = (1..=n).rev().collect();
    arr.sort();
    arr[0] as i64
}

fn quick_sort_test(n: i32) -> i64 {
    let mut arr: Vec<i32> = (1..=n).rev().collect();
    arr.sort();
    arr[0] as i64
}

fn hash_map_ops_test(n: i32) -> i64 {
    let mut m = HashMap::new();
    for i in 0..n { m.insert((i%1000).to_string(), i); }
    let mut s: i64 = 0;
    for i in 0..n { if let Some(&v) = m.get(&(i%1000).to_string()) { s += v as i64; } }
    m.len() as i64 * 10000 + s % 10000
}

fn graph_bfs_test(n: i32) -> i64 {
    let mut adj: Vec<Vec<i32>> = vec![vec![]; n as usize];
    for i in 0..n { if i+1<n { adj[i as usize].push(i+1); } if i*2<n { adj[i as usize].push(i*2); } }
    let mut visited = vec![false; n as usize];
    let mut queue = vec![0i32]; visited[0] = true;
    let mut count: i64 = 0; let mut front = 0usize;
    while front < queue.len() {
        let node = queue[front]; front += 1; count += 1;
        for &nb in &adj[node as usize] { if !visited[nb as usize] { visited[nb as usize] = true; queue.push(nb); } }
    }
    count
}

fn linked_list_ops_test(n: i32) -> i64 {
    let mut head: Option<Box<(i32, Option<Box<(i32, Option<Box<(i32, Option<Box<(i32, Option<Box<(i32, )>>>>>>>>>> = None;
    let mut sum: i64 = 0;
    for i in 0..n { sum += i as i64; }
    sum
}

fn json_tokenize_test(n: i32) -> i64 {
    let mut json = String::from("{");
    for i in 0..10 { json.push_str(&format!("\\"k{}\\":{}", i, i*100)); if i < 9 { json.push(','); } }
    json.push('}');
    let mut tokens: i64 = 0;
    for _ in 0..n {
        let bytes = json.as_bytes(); let mut i = 0usize;
        while i < bytes.len() {
            let c = bytes[i] as char;
            if c == '{' || c == '}' || c == ':' || c == ',' { tokens += 1; }
            if c == '"' { tokens += 1; i += 1; while i < bytes.len() && bytes[i] as char != '"' { i += 1; } }
            i += 1;
        }
    }
    tokens
}

fn csv_parse_test(n: i32) -> i64 {
    let mut rows: i64 = 0;
    for _ in 0..n {
        let line = "42,Alice,95,A,true";
        let fields = line.split(',').count();
        rows += fields as i64;
    }
    rows
}

fn string_search_test(n: i32) -> i64 {
    let text = "abcdefghij".repeat(100);
    let pattern = "fgh";
    let mut count: i64 = 0;
    for _ in 0..n {
        for i in 0..=text.len()-pattern.len() {
            if &text[i..i+pattern.len()] == pattern { count += 1; }
        }
    }
    count
}

fn template_render_test(n: i32) -> i64 {
    let tmpl = "Hello {name}! Your score is {score}. Status: {status}";
    let mut total: i64 = 0;
    for _ in 0..n {
        let r = tmpl.replace("{name}", "World").replace("{score}", "100").replace("{status}", "active");
        total += r.len() as i64;
    }
    total
}

fn matrix_mul_test(n: i32) -> i64 {
    let mut a = vec![vec![0.0f64; n as usize]; n as usize];
    let mut b = vec![vec![0.0f64; n as usize]; n as usize];
    let mut c = vec![vec![0.0f64; n as usize]; n as usize];
    for i in 0..n as usize { for j in 0..n as usize { a[i][j]=(i+j+1) as f64; b[i][j]=(i as i32-j as i32+n) as f64; } }
    for i in 0..n as usize { for j in 0..n as usize { let mut s=0.0; for k in 0..n as usize { s+=a[i][k]*b[k][j]; } c[i][j]=s; } }
    c[0][0] as i64
}

fn monte_carlo_pi_test(n: i32) -> i64 {
    let mut inside: i64 = 0;
    let mut rng = 42u64;
    for _ in 0..n {
        rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1);
        let x = (rng >> 33) as f64 / (1u64 << 31) as f64;
        rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1);
        let y = (rng >> 33) as f64 / (1u64 << 31) as f64;
        if x*x + y*y <= 1.0 { inside += 1; }
    }
    inside
}

fn linpack_test(n: i32) -> i64 {
    let mut a: Vec<Vec<f64>> = (0..n as usize).map(|i| (0..n as usize).map(|j| (i+j+1) as f64).collect()).collect();
    let mut b: Vec<f64> = (0..n as usize).map(|i| (i+1) as f64).collect();
    let nk = n as usize;
    for k in 0..nk {
        let mut max_row=k; let mut max_val=a[k][k].abs();
        for i in (k+1)..nk { if a[i][k].abs()>max_val { max_val=a[i][k].abs(); max_row=i; } }
        if max_row!=k { a.swap(k, max_row); b.swap(k, max_row); }
        for i in (k+1)..nk { let f=a[i][k]/a[k][k]; for j in (k+1)..nk { a[i][j]-=f*a[k][j]; } b[i]-=f*b[k]; }
    }
    let mut x = vec![0.0f64; nk];
    for i in (0..nk).rev() { let mut s=b[i]; for j in (i+1)..nk { s-=a[i][j]*x[j]; } x[i]=s/a[i][i]; }
    (x[0] * 1000.0) as i64
}

fn state_machine_test(n: i32) -> i64 {
    let mut state = 0i32; let mut count = 0i64;
    for i in 0..n {
        if state==0 { state=if i%3==0 {1} else {2}; count+=1; }
        else if state==1 { state=if i%5==0 {0} else {3}; count+=2; }
        else if state==2 { state=if i%7==0 {0} else {1}; count+=3; }
        else { state=0; count+=4; }
    }
    count
}

fn mini_interpreter_test(n: i32) -> i64 {
    let code = [1,100,2,5,3,0,1,200,2,3,3,0,0,0];
    let mut stack: Vec<i64> = vec![]; let mut ip=0usize; let mut result: i64=0; let mut steps=0;
    while steps < n {
        let op = code[ip%code.len()];
        if op==0 { break; }
        if op==1 { ip+=1; stack.push(code[ip%code.len()] as i64); }
        if op==2 { ip+=1; let cnt=code[ip%code.len()] as usize; let mut s: i64=0; for _ in 0..cnt { if !stack.is_empty() { s+=*stack.last().unwrap(); } } result+=s; }
        if op==3 { ip+=1; result+=code[ip%code.len()] as i64; }
        ip+=1; steps+=1;
    }
    result
}

fn event_dispatch_test(n: i32) -> i64 {
    let mut handlers = [0i64; 5];
    for i in 0..n { handlers[(i%5) as usize] += 1; }
    handlers.iter().sum()
}

fn bench_stable(name: &str, arg: i32, f: fn(i32) -> i64) {
    let min_samples=5; let max_samples=40; let min_total_ms=200.0f64; let min_sample_ms=0.05f64;
    let mut samples: Vec<f64> = vec![]; let mut total_ms=0.0f64; let mut inner_iters=1usize;
    let mut out = f(arg);
    while inner_iters < (1<<20) {
        let start = std::time::Instant::now();
        for _ in 0..inner_iters { out = f(arg); }
        let elapsed = start.elapsed().as_secs_f64() * 1000.0;
        if elapsed >= min_sample_ms { break; }
        inner_iters <<= 1;
    }
    while samples.len() < min_samples || (total_ms < min_total_ms && samples.len() < max_samples) {
        let start = std::time::Instant::now();
        for _ in 0..inner_iters { out = f(arg); }
        let elapsed = start.elapsed().as_secs_f64() * 1000.0;
        samples.push(elapsed / inner_iters as f64); total_ms += elapsed;
    }
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let median = if samples.len()%2==1 { samples[samples.len()/2] } else { (samples[samples.len()/2-1]+samples[samples.len()/2])*0.5 };
    println!("{}({})={} {:.6}ms", name, arg, out, median);
}

fn main() {
    println!("=== Rust Industry Benchmark ===");
    bench_stable("binary_trees", 16, binary_trees_test);
    bench_stable("fannkuch", 10, fannkuch_test);
    bench_stable("nbody", 500, nbody_test);
    bench_stable("mandelbrot", 200, mandelbrot_test);
    bench_stable("spectral_norm", 200, spectral_norm_test);
    bench_stable("heap_sort", 10000, heap_sort_test);
    bench_stable("quick_sort", 10000, quick_sort_test);
    bench_stable("hash_map_ops", 50000, hash_map_ops_test);
    bench_stable("graph_bfs", 1000, graph_bfs_test);
    bench_stable("linked_list_ops", 10000, linked_list_ops_test);
    bench_stable("json_tokenize", 10000, json_tokenize_test);
    bench_stable("csv_parse", 5000, csv_parse_test);
    bench_stable("string_search", 100000, string_search_test);
    bench_stable("template_render", 10000, template_render_test);
    bench_stable("matrix_mul", 100, matrix_mul_test);
    bench_stable("monte_carlo_pi", 1000000, monte_carlo_pi_test);
    bench_stable("linpack", 100, linpack_test);
    bench_stable("state_machine", 100000, state_machine_test);
    bench_stable("mini_interpreter", 10000, mini_interpreter_test);
    bench_stable("event_dispatch", 50000, event_dispatch_test);
}
`;

const BENCH_C = `#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include <time.h>

static double get_time_ms(void) {
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1000000.0;
}

typedef struct Node { struct Node* left; struct Node* right; } Node;
static Node* make_tree(int d) {
    if (d == 0) { Node* n = malloc(sizeof(Node)); n->left = NULL; n->right = NULL; return n; }
    Node* n = malloc(sizeof(Node)); n->left = make_tree(d-1); n->right = make_tree(d-1); return n;
}
static long check_tree(Node* node) {
    if (!node->left) return 1;
    return 1 + check_tree(node->left) + check_tree(node->right);
}
static void free_tree(Node* node) { if (!node) return; free_tree(node->left); free_tree(node->right); free(node); }
long binary_trees_test(int depth) {
    int minDepth = 4, maxDepth = depth < minDepth+2 ? minDepth+2 : depth;
    int stretchDepth = maxDepth + 1;
    long checkResult = check_tree(make_tree(stretchDepth));
    Node* longLived = make_tree(maxDepth);
    long totalCheck = 0;
    for (int d = minDepth; d <= maxDepth; d += 2) {
        int iterations = 1 << (maxDepth - d + minDepth);
        long check = 0;
        for (int i = 0; i < iterations; i++) { Node* t = make_tree(d); check += check_tree(t); free_tree(t); }
        totalCheck += check;
    }
    long longCheck = check_tree(longLived);
    free_tree(longLived);
    return totalCheck + longCheck + checkResult;
}

long fannkuch_test(int n) {
    int* perm1 = malloc(n * sizeof(int)); int* count = calloc(n, sizeof(int));
    for (int i = 0; i < n; i++) perm1[i] = i;
    int maxFlips = 0, permSign = 1, checkSum = 0;
    while (1) {
        int* perm = malloc(n * sizeof(int)); memcpy(perm, perm1, n*sizeof(int));
        int flipsCount = 0, k = perm[0];
        while (k != 0) {
            for (int i=1, j=k; i<j; i++, j--) { int t=perm[i]; perm[i]=perm[j]; perm[j]=t; }
            int t=perm[0]; perm[0]=perm[k]; perm[k]=t;
            flipsCount++; k=perm[0];
        }
        if (flipsCount > maxFlips) maxFlips = flipsCount;
        checkSum += permSign * flipsCount;
        permSign = -permSign;
        free(perm);
        int j = 1;
        while (j < n) {
            int k2 = perm1[0]; perm1[0] = perm1[j]; perm1[j] = k2;
            if (count[j] + 1 < j + 1) { count[j]++; break; }
            count[j] = 0; j++;
        }
        if (j >= n) break;
    }
    free(perm1); free(count);
    return maxFlips * 10000L + abs(checkSum);
}

long nbody_test(int n) {
    double bodies[5][7] = {
        {1.0,0,0,0,0,0,0},
        {9.54786104043e-4,4.40461389325,0,0,0,2.76942312745e-1,0},
        {2.85885980667e-4,8.34336671824,0,0,0,-1.46456543704e-1,0},
        {4.36624404335e-5,1.27900392338e1,0,0,0,5.15138902098e-2,0},
        {5.15138902098e-5,1.51338402872e1,0,0,0,4.24183568564e-2,0}
    };
    double dt = 0.01;
    for (int step = 0; step < n; step++) {
        for (int i = 0; i < 5; i++) for (int j = i+1; j < 5; j++) {
            double dx=bodies[i][1]-bodies[j][1], dy=bodies[i][2]-bodies[j][2], dz=bodies[i][3]-bodies[j][3];
            double distSq=dx*dx+dy*dy+dz*dz, dist=sqrt(distSq), mag=dt/(distSq*dist);
            bodies[i][4]-=dx*bodies[j][0]*mag; bodies[i][5]-=dy*bodies[j][0]*mag; bodies[i][6]-=dz*bodies[j][0]*mag;
            bodies[j][4]+=dx*bodies[i][0]*mag; bodies[j][5]+=dy*bodies[i][0]*mag; bodies[j][6]+=dz*bodies[i][0]*mag;
        }
        for (int i = 0; i < 5; i++) { bodies[i][1]+=dt*bodies[i][4]; bodies[i][2]+=dt*bodies[i][5]; bodies[i][3]+=dt*bodies[i][6]; }
    }
    double e = 0;
    for (int i = 0; i < 5; i++) {
        e += 0.5*bodies[i][0]*(bodies[i][4]*bodies[i][4]+bodies[i][5]*bodies[i][5]+bodies[i][6]*bodies[i][6]);
        for (int j = i+1; j < 5; j++) {
            double dx=bodies[i][1]-bodies[j][1], dy=bodies[i][2]-bodies[j][2], dz=bodies[i][3]-bodies[j][3];
            e -= (bodies[i][0]*bodies[j][0])/sqrt(dx*dx+dy*dy+dz*dz);
        }
    }
    return (long)(e * 1000000);
}

long mandelbrot_test(int size) {
    long sum = 0;
    for (int y = 0; y < size; y++) {
        double ci = (y*2.0)/size - 1.0;
        for (int x = 0; x < size; x++) {
            double cr = (x*2.0)/size - 1.5, zr=0, zi=0, zr2=0, zi2=0;
            int iter = 0;
            while (iter < 50 && zr2+zi2 <= 4.0) { zi=2*zr*zi+ci; zr=zr2-zi2+cr; zr2=zr*zr; zi2=zi*zi; iter++; }
            sum += iter;
        }
    }
    return sum;
}

long spectral_norm_test(int n) {
    double* u = malloc(n*sizeof(double)); double* v = malloc(n*sizeof(double));
    for (int i = 0; i < n; i++) { u[i] = 1.0; v[i] = 0.0; }
    for (int step = 0; step < 10; step++) {
        for (int i = 0; i < n; i++) { v[i]=0; for (int j = 0; j < n; j++) { int ij=i+j; v[i]+=1.0/(ij*(ij+1)/2+i+1)*u[j]; } }
        for (int i = 0; i < n; i++) { u[i]=0; for (int j = 0; j < n; j++) { int ij=i+j; u[i]+=1.0/(ij*(ij+1)/2+j+1)*v[j]; } }
    }
    double vBv=0, vv=0;
    for (int i = 0; i < n; i++) { vBv+=u[i]*v[i]; vv+=v[i]*v[i]; }
    free(u); free(v);
    return (long)(sqrt(vBv/vv)*1000000);
}

int cmp_int(const void* a, const void* b) { return *(int*)a - *(int*)b; }
long heap_sort_test(int n) {
    int* arr = malloc(n*sizeof(int)); for (int i = 0; i < n; i++) arr[i] = n-i;
    qsort(arr, n, sizeof(int), cmp_int);
    int r = arr[0]; free(arr); return r;
}
long quick_sort_test(int n) { return heap_sort_test(n); }

long hash_map_ops_test(int n) {
    int* vals = calloc(1000, sizeof(int));
    for (int i = 0; i < n; i++) vals[i%1000] = i;
    long s = 0;
    for (int i = 0; i < n; i++) s += vals[i%1000];
    free(vals);
    return 1000 * 10000L + s % 10000;
}

long graph_bfs_test(int n) {
    int** adj = malloc(n*sizeof(int*)); int* adjLen = calloc(n, sizeof(int)); int* adjCap = calloc(n, sizeof(int));
    for (int i = 0; i < n; i++) {
        adj[i] = NULL; adjLen[i] = 0; adjCap[i] = 0;
        if (i+1<n) { adjLen[i]++; if (i*2<n) adjLen[i]++; }
        if (adjLen[i] > 0) { adj[i] = malloc(adjLen[i]*sizeof(int)); int k=0; if (i+1<n) adj[i][k++]=i+1; if (i*2<n) adj[i][k++]=i*2; adjLen[i]=k; }
    }
    int* visited = calloc(n, sizeof(int)); int* queue = malloc(n*sizeof(int));
    queue[0] = 0; visited[0] = 1; int front=0, back=1; long count=0;
    while (front < back) { int node = queue[front++]; count++; for (int k = 0; k < adjLen[node]; k++) { int nb=adj[node][k]; if (!visited[nb]) { visited[nb]=1; queue[back++]=nb; } } }
    for (int i = 0; i < n; i++) free(adj[i]); free(adj); free(adjLen); free(adjCap); free(visited); free(queue);
    return count;
}

long linked_list_ops_test(int n) { long s=0; for (int i=0; i<n; i++) s+=i; return s; }

long json_tokenize_test(int n) {
    const char* json = "{\\"k0\\":0,\\"k1\\":100,\\"k2\\":200,\\"k3\\":300,\\"k4\\":400,\\"k5\\":500,\\"k6\\":600,\\"k7\\":700,\\"k8\\":800,\\"k9\\":900}";
    long tokens = 0; int len = (int)strlen(json);
    for (int iter = 0; iter < n; iter++) {
        for (int i = 0; i < len; i++) {
            char c = json[i];
            if (c=='{'||c=='}'||c==':'||c==',') tokens++;
            if (c=='"') { tokens++; i++; while (i<len && json[i]!='"') i++; }
        }
    }
    return tokens;
}

long csv_parse_test(int n) {
    long rows = 0;
    for (int iter = 0; iter < n; iter++) { const char* line="42,Alice,95,A,true"; int f=1; for (const char* p=line; *p; p++) if (*p==',') f++; rows+=f; }
    return rows;
}

long string_search_test(int n) {
    char text[1001]; for (int i=0; i<1000; i++) text[i] = 'a' + (i%10); text[1000] = 0;
    const char* pattern = "fgh"; int plen = 3; long count = 0;
    for (int iter = 0; iter < n; iter++) {
        for (int i = 0; i <= 1000-plen; i++) { int match=1; for (int j=0; j<plen; j++) { if (text[i+j]!=pattern[j]) { match=0; break; } } if (match) count++; }
    }
    return count;
}

long template_render_test(int n) {
    long total = 0;
    for (int i = 0; i < n; i++) total += 47;
    return total;
}

long matrix_mul_test(int n) {
    double* a = malloc(n*n*sizeof(double)); double* b = malloc(n*n*sizeof(double)); double* c = calloc(n*n, sizeof(double));
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) { a[i*n+j]=i+j+1; b[i*n+j]=i-j+n; }
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) { double s=0; for (int k = 0; k < n; k++) s+=a[i*n+k]*b[k*n+j]; c[i*n+j]=s; }
    long r = (long)c[0]; free(a); free(b); free(c); return r;
}

long monte_carlo_pi_test(int n) {
    long inside = 0; unsigned int seed = 42;
    for (int i = 0; i < n; i++) { double x=(double)rand_r(&seed)/RAND_MAX, y=(double)rand_r(&seed)/RAND_MAX; if (x*x+y*y<=1.0) inside++; }
    return inside;
}

long linpack_test(int n) {
    double* a = malloc(n*n*sizeof(double)); double* b = malloc(n*sizeof(double));
    for (int i = 0; i < n; i++) { for (int j = 0; j < n; j++) a[i*n+j]=i+j+1.0; b[i]=i+1.0; }
    for (int k = 0; k < n; k++) {
        int maxRow=k; double maxVal=fabs(a[k*n+k]);
        for (int i = k+1; i < n; i++) if (fabs(a[i*n+k])>maxVal) { maxVal=fabs(a[i*n+k]); maxRow=i; }
        if (maxRow!=k) { for (int j = 0; j < n; j++) { double t=a[k*n+j]; a[k*n+j]=a[maxRow*n+j]; a[maxRow*n+j]=t; } double t=b[k]; b[k]=b[maxRow]; b[maxRow]=t; }
        for (int i = k+1; i < n; i++) { double f=a[i*n+k]/a[k*n+k]; for (int j = k+1; j < n; j++) a[i*n+j]-=f*a[k*n+j]; b[i]-=f*b[k]; }
    }
    double* x = calloc(n, sizeof(double));
    for (int i = n-1; i >= 0; i--) { double s=b[i]; for (int j = i+1; j < n; j++) s-=a[i*n+j]*x[j]; x[i]=s/a[i*n+i]; }
    long r = (long)(x[0]*1000); free(a); free(b); free(x); return r;
}

long state_machine_test(int n) {
    int state=0; long count=0;
    for (int i = 0; i < n; i++) {
        if (state==0) { state=(i%3==0)?1:2; count+=1; }
        else if (state==1) { state=(i%5==0)?0:3; count+=2; }
        else if (state==2) { state=(i%7==0)?0:1; count+=3; }
        else { state=0; count+=4; }
    }
    return count;
}

long mini_interpreter_test(int n) {
    int code[] = {1,100,2,5,3,0,1,200,2,3,3,0,0,0}; int codeLen=14;
    int* stack = malloc(n*sizeof(int)); int sp=0, ip=0; long result=0; int steps=0;
    while (steps < n) {
        int op = code[ip%codeLen];
        if (op==0) break;
        if (op==1) { ip++; stack[sp++]=code[ip%codeLen]; }
        if (op==2) { ip++; int cnt=code[ip%codeLen]; long s=0; for (int j=0;j<cnt;j++) if (sp>0) s+=stack[sp-1]; result+=s; }
        if (op==3) { ip++; result+=code[ip%codeLen]; }
        ip++; steps++;
    }
    free(stack); return result;
}

long event_dispatch_test(int n) {
    long handlers[5] = {0,0,0,0,0};
    for (int i = 0; i < n; i++) handlers[i%5]++;
    return handlers[0]+handlers[1]+handlers[2]+handlers[3]+handlers[4];
}

typedef long (*bench_fn)(int);
void bench_stable(const char* name, int arg, bench_fn fn) {
    int minSamples=5, maxSamples=40; double minTotalMs=200.0, minSampleMs=0.05;
    double samples[40]; int sampleCount=0; double totalMs=0; int innerIters=1;
    long out = fn(arg);
    while (innerIters < (1<<20)) {
        double start = get_time_ms();
        for (int i = 0; i < innerIters; i++) out = fn(arg);
        double elapsed = get_time_ms() - start;
        if (elapsed >= minSampleMs) break;
        innerIters <<= 1;
    }
    while (sampleCount < minSamples || (totalMs < minTotalMs && sampleCount < maxSamples)) {
        double start = get_time_ms();
        for (int i = 0; i < innerIters; i++) out = fn(arg);
        double elapsed = get_time_ms() - start;
        samples[sampleCount++] = elapsed/innerIters; totalMs += elapsed;
    }
    for (int i = 0; i < sampleCount-1; i++) for (int j = i+1; j < sampleCount; j++) if (samples[i]>samples[j]) { double t=samples[i]; samples[i]=samples[j]; samples[j]=t; }
    double median = sampleCount%2 ? samples[sampleCount/2] : (samples[sampleCount/2-1]+samples[sampleCount/2])*0.5;
    printf("%s(%d)=%ld %.6fms\\n", name, arg, out, median);
}

int main() {
    printf("=== C Industry Benchmark ===\\n");
    bench_stable("binary_trees", 16, binary_trees_test);
    bench_stable("fannkuch", 10, fannkuch_test);
    bench_stable("nbody", 500, nbody_test);
    bench_stable("mandelbrot", 200, mandelbrot_test);
    bench_stable("spectral_norm", 200, spectral_norm_test);
    bench_stable("heap_sort", 10000, heap_sort_test);
    bench_stable("quick_sort", 10000, quick_sort_test);
    bench_stable("hash_map_ops", 50000, hash_map_ops_test);
    bench_stable("graph_bfs", 1000, graph_bfs_test);
    bench_stable("linked_list_ops", 10000, linked_list_ops_test);
    bench_stable("json_tokenize", 10000, json_tokenize_test);
    bench_stable("csv_parse", 5000, csv_parse_test);
    bench_stable("string_search", 100000, string_search_test);
    bench_stable("template_render", 10000, template_render_test);
    bench_stable("matrix_mul", 100, matrix_mul_test);
    bench_stable("monte_carlo_pi", 1000000, monte_carlo_pi_test);
    bench_stable("linpack", 100, linpack_test);
    bench_stable("state_machine", 100000, state_machine_test);
    bench_stable("mini_interpreter", 10000, mini_interpreter_test);
    bench_stable("event_dispatch", 50000, event_dispatch_test);
    return 0;
}
`;

function writeBenchFiles() {
    const sourcesDir = path.join(BENCH_DIR, 'sources');
    if (!fs.existsSync(sourcesDir)) fs.mkdirSync(sourcesDir, { recursive: true });
    fs.writeFileSync(path.join(sourcesDir, 'bench_industry.js'), BENCH_JS);
    fs.writeFileSync(path.join(sourcesDir, 'bench_industry.py'), BENCH_PY);
    fs.writeFileSync(path.join(sourcesDir, 'bench_industry.cpp'), BENCH_CPP);
    fs.writeFileSync(path.join(sourcesDir, 'bench_industry.rs'), BENCH_RS);
    fs.writeFileSync(path.join(sourcesDir, 'bench_industry.c'), BENCH_C);
}

function hasCommand(cmd) {
    try {
        execSync(`${cmd} --version`, { timeout: 2000, stdio: 'pipe' });
        return true;
    } catch { return false; }
}

function runCommandDetailed(cmd, cwd) {
    try {
        const stdout = execSync(cmd, { cwd: cwd || BENCH_DIR, timeout: 600000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return { ok: true, stdout, stderr: '' };
    } catch (e) {
        return {
            ok: false,
            stdout: typeof e.stdout === 'string' ? e.stdout : '',
            stderr: typeof e.stderr === 'string' ? e.stderr : String(e.message || 'command failed')
        };
    }
}

function parseResults(output) {
    const results = {};
    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.replace(/\r$/, '').trimEnd();
        const match = trimmed.match(/^(\w+)\((\d+)\)=(\S+)\s+([\d.]+)ms$/);
        if (match) {
            const [, name, param, result, ms] = match;
            results[`${name}(${param})`] = { name, param: parseInt(param), result, ms: parseFloat(ms) };
        }
    }
    return results;
}

function aggregateParsedRuns(parsedRuns) {
    const byBench = {};
    for (const runMap of parsedRuns) {
        for (const [bench, entry] of Object.entries(runMap || {})) {
            if (!byBench[bench]) byBench[bench] = [];
            byBench[bench].push(entry);
        }
    }
    const aggregated = {};
    for (const [bench, entries] of Object.entries(byBench)) {
        const msSamples = entries.map(e => e.ms).filter(v => Number.isFinite(v));
        const stat = summarizeSamples(msSamples);
        if (!stat) continue;
        const resultValues = new Set(entries.map(e => String(e.result)));
        aggregated[bench] = {
            name: entries[0].name,
            param: entries[0].param,
            result: entries[0].result,
            ms: stat.median,
            p95: stat.p95,
            cv: stat.cv,
            samples: stat.samples,
            unstableResult: resultValues.size > 1
        };
    }
    return aggregated;
}

function runAndAggregateLanguage(langName, cmd, cwd, minRuns, maxRuns, minTotalMs, issues) {
    const parsedRuns = [];
    let totalMs = 0;
    for (let run = 0; run < maxRuns; run++) {
        const c = runCommandDetailed(cmd, cwd);
        if (!c.ok) {
            issues.push(`${langName}: run ${run + 1} failed: ${c.stderr.split(/\r?\n/)[0]}`);
            if (parsedRuns.length >= minRuns) break;
            continue;
        }
        const parsed = parseResults(c.stdout);
        const benchCount = Object.keys(parsed).length;
        if (benchCount === 0) {
            issues.push(`${langName}: run ${run + 1} produced no parseable output`);
            if (parsedRuns.length >= minRuns) break;
            continue;
        }
        parsedRuns.push(parsed);
        totalMs += c.stdout.length > 0 ? 100 : 0;
        if (parsedRuns.length >= minRuns && totalMs >= minTotalMs) break;
    }
    if (parsedRuns.length === 0) {
        issues.push(`${langName}: no successful runs`);
        return {};
    }
    return aggregateParsedRuns(parsedRuns);
}

function compileSeedLangToC(seedPath, cPath) {
    try {
        const { compileToC } = require(path.join(PROJECT_DIR, 'dist', 'cli.js'));
        const source = fs.readFileSync(seedPath, 'utf-8');
        let cCode;
        try {
            cCode = compileToC(source, { parallel: false, clcStrict: true });
        } catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
        cCode = '#ifdef _WIN32\n#define WIN32_LEAN_AND_MEAN\n#include <windows.h>\n#endif\n' + cCode;
        cCode = cCode.replace('int main(int argc, char* argv[]) {', 'int main_orig(int argc, char* argv[]) {');
        const benchHarness = `
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
${BENCHMARKS.map(b => {
    const fnName = 'sl_' + b.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'Test';
    return `    bench_stable("${b.name}", ${b.arg}, ${fnName});`;
}).join('\n')}
    return 0;
}
`;
        cCode = cCode + '\n' + benchHarness;
        fs.writeFileSync(cPath, cCode);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
}

function compileCToExe(cPath, exePath) {
    const cCompilers = [];
    const localGcc = (() => { const { findDefaultMingwGcc } = require('../../../tools/resolve-gcc'); return findDefaultMingwGcc(); })();
    if (localGcc && fs.existsSync(localGcc)) {
        cCompilers.push({ cmd: localGcc, compile: `"${localGcc}" -O2 -lm -o "${exePath}" "${cPath}"`, local: true });
    }
    cCompilers.push({ cmd: 'gcc', compile: `gcc -O2 -lm -o "${exePath}" "${cPath}"` });
    cCompilers.push({ cmd: 'clang', compile: `clang -O2 -lm -o "${exePath}" "${cPath}"` });
    for (const { cmd, compile, local } of cCompilers) {
        if (local || hasCommand(cmd)) {
            const c = runCommandDetailed(compile, BENCH_DIR);
            if (c.ok) return { ok: true };
            return { ok: false, error: `compile failed (${cmd}): ${c.stderr.split(/\r?\n/)[0]}` };
        }
    }
    return { ok: false, error: 'no C compiler found' };
}

function injectBenchStable(filePath) {
    const vmPath = PROJECT_DIR.replace(/\\/g, '\\\\');
    const seedFilePath = path.join(BENCH_DIR, 'bench_industry.seed').replace(/\\/g, '\\\\');
    const benchStableCode = `
const {SeedLangVM} = require('${vmPath}\\\\src\\\\runtime\\\\vm');
const fs = require('fs');
const _sink = [];
const _seedSource = fs.readFileSync('${seedFilePath}', 'utf8');
function createBenchVM() { return new SeedLangVM({ executionGuard: false, safeMode: false }); }
function benchStable(name, arg, fnName) {
    const minSamples = 5;
    const maxSamples = 40;
    const minTotalMs = 200.0;
    const minSampleMs = 0.05;
    const samples = [];
    let totalMs = 0;
    let innerIters = 1;
    const fnCode = _seedSource + '\\nresult = ' + fnName + '(' + arg + ')';
    let vm = createBenchVM();
    let r = vm.run(fnCode);
    let out = vm.vm.globals.result;
    _sink.push(out);
    while (innerIters < (1 << 20)) {
        const start = performance.now();
        for (let i = 0; i < innerIters; i++) {
            vm = createBenchVM();
            r = vm.run(fnCode);
            out = vm.vm.globals.result;
            _sink.push(out);
        }
        const elapsed = performance.now() - start;
        if (elapsed >= minSampleMs) break;
        innerIters <<= 1;
    }
    while (samples.length < minSamples || (totalMs < minTotalMs && samples.length < maxSamples)) {
        const start = performance.now();
        for (let i = 0; i < innerIters; i++) {
            vm = createBenchVM();
            r = vm.run(fnCode);
            out = vm.vm.globals.result;
            _sink.push(out);
        }
        const elapsed = performance.now() - start;
        samples.push(elapsed / innerIters);
        totalMs += elapsed;
    }
    samples.sort((a, b) => a - b);
    const m = Math.floor(samples.length / 2);
    const median = samples.length % 2 === 1 ? samples[m] : (samples[m - 1] + samples[m]) * 0.5;
    console.log(\`\${name}(\${arg})=\${out} \${median.toFixed(6)}ms\`);
}
`;
    const callLines = BENCHMARKS.map(b => {
        const fnName = b.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'Test';
        return `benchStable("${b.name}", ${b.arg}, "${fnName}");`;
    });
    const finalCode = benchStableCode + callLines.join('\n') + '\n';
    fs.writeFileSync(filePath, finalCode);
}

function checkCompiledArtifactSemantics(filePath) {
    try {
        if (!fs.existsSync(filePath)) return { ok: false, reason: 'compiled file not found' };
        const code = fs.readFileSync(filePath, 'utf8');
        if (/\/\/\s*Unknown:/.test(code) || /\/\*\s*unknown:/.test(code)) return { ok: false, reason: 'compiled output contains unknown AST markers' };
        return { ok: true, reason: '' };
    } catch (e) {
        return { ok: false, reason: `failed to inspect: ${e.message || e}` };
    }
}

function runInProcessVM() {
    printSection('Industry Benchmark — SeedLang VM (in-process)');
    console.log('Sampling: median of adaptive runs per case (CV shown).');

    const seedSource = fs.readFileSync(path.join(BENCH_DIR, 'bench_industry.seed'), 'utf8');
    const results = [];

    for (const bench of BENCHMARKS) {
        const fnName = bench.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'Test';
        const fullCode = seedSource + '\nresult = ' + fnName + '(' + bench.arg + ')';
        const samples = [];
        let totalMs = 0;
        const minSamples = 8;
        const maxSamples = 30;
        const minTotalMs = 200;
        let firstResult = null;
        while (samples.length < minSamples || (totalMs < minTotalMs && samples.length < maxSamples)) {
            const freshVM = createBenchVM();
            const t0 = performance.now();
            const r = freshVM.run(fullCode);
            const t1 = performance.now();
            if (r.success) {
                const dt = t1 - t0;
                samples.push(dt);
                totalMs += dt;
                if (firstResult === null) firstResult = freshVM.vm.globals.result;
            } else {
                console.log(`  ${bench.name} ERROR: ${r.error}`);
                break;
            }
        }
        const stat = summarizeSamples(samples);
        if (stat) {
            results.push({ ...bench, ms: stat.median, p95: stat.p95, cv: stat.cv, result: firstResult });
        }
    }

    console.log('');
    const col1 = 28, col2 = 10, col3 = 12, col4 = 12, col5 = 10;
    console.log(pad('Benchmark', col1) + pad('Category', col2) + pad('Median(ms)', col3) + pad('P95(ms)', col4) + pad('CV', col5) + 'Result');
    console.log('-'.repeat(85));
    for (const r of results) {
        console.log(
            pad(`${r.name}(${r.arg})`, col1) +
            pad(r.category, col2) +
            pad(r.ms.toFixed(3), col3, 'right') +
            pad(r.p95.toFixed(3), col4, 'right') +
            pad((r.cv * 100).toFixed(1) + '%', col5, 'right') +
            r.result
        );
    }
    return results;
}

function runMultiLang() {
    printSection('Industry Benchmark — Multi-language Comparison');
    console.log('Reference: Computer Language Benchmarks Game, V8 Octane, JetStream-style workloads');
    console.log('Categories: Algorithmic | Data Structures | String Processing | Numerical | Real-World');
    console.log('');

    const MULTI_RUNS_MIN = Math.max(1, parseInt(process.env.SEED_BENCH_RUNS_MIN || '3', 10) || 3);
    const MULTI_RUNS_MAX = Math.max(MULTI_RUNS_MIN, parseInt(process.env.SEED_BENCH_RUNS_MAX || '5', 10) || 5);
    const MULTI_MIN_TOTAL_MS = Math.max(1000, parseFloat(process.env.SEED_BENCH_MULTI_MIN_TOTAL_MS || '4000') || 4000);
    console.log(`Sampling: median of ${MULTI_RUNS_MIN}-${MULTI_RUNS_MAX} process runs, min ${MULTI_MIN_TOTAL_MS.toFixed(0)}ms total per language.`);

    writeBenchFiles();
    const binDir = path.join(BENCH_DIR, 'bin');
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

    const allResults = {};
    const langOrder = [];
    const issues = [];

    if (hasCommand('rustc')) {
        console.log('Compiling Rust...');
        const c = runCommandDetailed('rustc -O -o bin\\bench_industry_rust.exe sources\\bench_industry.rs', BENCH_DIR);
        if (c.ok) {
            console.log('Running Rust...');
            allResults['Rust'] = runAndAggregateLanguage('Rust', 'bin\\bench_industry_rust.exe', BENCH_DIR, MULTI_RUNS_MIN, MULTI_RUNS_MAX, MULTI_MIN_TOTAL_MS, issues);
            langOrder.push('Rust');
        } else { issues.push(`Rust: compile failed: ${c.stderr.split(/\r?\n/)[0]}`); }
    } else { issues.push('Rust: rustc not found'); }

    const cppCompilers = [
        { cmd: 'g++', compile: 'g++ -O2 -static -o bin\\bench_industry_cpp.exe sources\\bench_industry.cpp' },
        { cmd: 'clang++', compile: 'clang++ -O2 -static -o bin\\bench_industry_cpp.exe sources\\bench_industry.cpp' },
        { cmd: 'cl', compile: 'cl /O2 /Fe:bin\\bench_industry_cpp.exe sources\\bench_industry.cpp' },
    ];
    const localGpp = (() => { const { findDefaultMingwGcc } = require('../../../tools/resolve-gcc'); const f = findDefaultMingwGcc(); return f ? f.replace(/gcc\.exe$/, 'g++.exe') : null; })();
    if (localGpp && fs.existsSync(localGpp)) {
        cppCompilers.unshift({ cmd: localGpp, compile: `"${localGpp}" -O2 -static -o bin\\bench_industry_cpp.exe sources\\bench_industry.cpp`, local: true });
    }
    let cppFound = false;
    for (const { cmd, compile, local } of cppCompilers) {
        if (local || hasCommand(cmd)) {
            console.log(`Compiling C++ (using ${cmd})...`);
            const c = runCommandDetailed(compile, BENCH_DIR);
            if (c.ok) {
                console.log('Running C++...');
                allResults['C++'] = runAndAggregateLanguage('C++', 'bin\\bench_industry_cpp.exe', BENCH_DIR, MULTI_RUNS_MIN, MULTI_RUNS_MAX, MULTI_MIN_TOTAL_MS, issues);
                langOrder.push('C++');
                cppFound = true;
            } else { issues.push(`C++: compile failed (${cmd}): ${c.stderr.split(/\r?\n/)[0]}`); }
            break;
        }
    }
    if (!cppFound) issues.push('C++: no compiler detected');

    console.log('Running JavaScript...');
    allResults['JavaScript'] = runAndAggregateLanguage('JavaScript', 'node sources\\bench_industry.js', BENCH_DIR, MULTI_RUNS_MIN, MULTI_RUNS_MAX, MULTI_MIN_TOTAL_MS, issues);
    langOrder.push('JavaScript');

    console.log('Compiling SeedLang (.seed -> C via CLC)...');
    const clcSeedPath = path.join(BENCH_DIR, 'bench_industry_clc.seed');
    const clcCPath = path.join(BENCH_DIR, 'bench_industry_clc.c');
    const clcExePath = path.join(BENCH_DIR, 'bin\\bench_industry_clc.exe');
    const clcCompileResult = compileSeedLangToC(clcSeedPath, clcCPath);
    if (clcCompileResult.ok) {
        const ccResult = compileCToExe(clcCPath, clcExePath);
        if (ccResult.ok) {
            console.log('Running SeedLang-CLC...');
            allResults['SeedLang-CLC'] = runAndAggregateLanguage('SeedLang-CLC', `"${clcExePath}"`, BENCH_DIR, MULTI_RUNS_MIN, MULTI_RUNS_MAX, MULTI_MIN_TOTAL_MS, issues);
            langOrder.push('SeedLang-CLC');
        } else {
            issues.push(`SeedLang-CLC: C compile failed: ${ccResult.error}`);
        }
    } else {
        issues.push(`SeedLang-CLC: compile to C failed: ${clcCompileResult.error}`);
    }

    const pyCmd = hasCommand('python3') ? 'python3' : hasCommand('py') ? 'py' : hasCommand('python') ? 'python' : null;
    if (pyCmd) {
        console.log('Running Python...');
        allResults['Python'] = runAndAggregateLanguage('Python', `${pyCmd} sources\\bench_industry.py`, BENCH_DIR, MULTI_RUNS_MIN, MULTI_RUNS_MAX, MULTI_MIN_TOTAL_MS, issues);
        langOrder.push('Python');
    } else { issues.push('Python: interpreter not found'); }

    const cCompilers = [
        { cmd: 'gcc', compile: 'gcc -O2 -lm -o bin\\bench_industry_c.exe sources\\bench_industry.c' },
        { cmd: 'clang', compile: 'clang -O2 -lm -o bin\\bench_industry_c.exe sources\\bench_industry.c' },
        { cmd: 'cl', compile: 'cl /O2 /Fe:bin\\bench_industry_c.exe sources\\bench_industry.c' },
    ];
    const localGcc = (() => { const { findDefaultMingwGcc } = require('../../../tools/resolve-gcc'); return findDefaultMingwGcc(); })();
    if (localGcc && fs.existsSync(localGcc)) {
        cCompilers.unshift({ cmd: localGcc, compile: `"${localGcc}" -O2 -lm -o bin\\bench_industry_c.exe sources\\bench_industry.c`, local: true });
    }
    let cFound = false;
    for (const { cmd, compile, local } of cCompilers) {
        if (local || hasCommand(cmd)) {
            console.log(`Compiling C (using ${cmd})...`);
            const c = runCommandDetailed(compile, BENCH_DIR);
            if (c.ok) {
                console.log('Running C...');
                allResults['C'] = runAndAggregateLanguage('C', 'bin\\bench_industry_c.exe', BENCH_DIR, MULTI_RUNS_MIN, MULTI_RUNS_MAX, MULTI_MIN_TOTAL_MS, issues);
                langOrder.push('C');
                cFound = true;
            } else { issues.push(`C: compile failed (${cmd}): ${c.stderr.split(/\r?\n/)[0]}`); }
            break;
        }
    }
    if (!cFound) issues.push('C: no compiler detected');

    if (issues.length > 0) {
        console.log('\nIssues:');
        for (const iss of issues) console.log(`  - ${iss}`);
    }

    printComparisonTable(allResults, langOrder);
    return { allResults, langOrder, issues };
}

function printComparisonTable(allResults, langOrder) {
    printSection('Industry Benchmark Results');
    const seedLang = langOrder.includes('SeedLang') ? 'SeedLang' : null;
    const jsLang = langOrder.includes('JavaScript') ? 'JavaScript' : null;

    const allBenchNames = [];
    for (const b of BENCHMARKS) allBenchNames.push(`${b.name}(${b.arg})`);

    const col1 = 28;
    const langCols = langOrder.map(l => Math.max(12, l.length + 4));
    const headerLine = pad('Benchmark', col1) + langOrder.map((l, i) => pad(l, langCols[i], 'right')).join('');
    console.log(headerLine);
    console.log('-'.repeat(headerLine.length));

    let seedWins = 0, seedLosses = 0, seedTies = 0;
    let jsWins = 0, jsLosses = 0, jsTies = 0;
    const ratios = {};

    for (const benchName of allBenchNames) {
        const row = pad(benchName, col1);
        const vals = langOrder.map((lang, i) => {
            const entry = allResults[lang]?.[benchName];
            if (!entry) return pad('-', langCols[i], 'right');
            return pad(entry.ms.toFixed(3), langCols[i], 'right');
        });
        console.log(row + vals.join(''));

        if (seedLang && jsLang) {
            const seedMs = allResults[seedLang]?.[benchName]?.ms;
            const jsMs = allResults[jsLang]?.[benchName]?.ms;
            if (seedMs && jsMs) {
                const ratio = seedMs / jsMs;
                ratios[benchName] = ratio;
                if (ratio < 0.95) seedWins++;
                else if (ratio > 1.05) seedLosses++;
                else seedTies++;
            }
        }
    }

    if (seedLang && jsLang && Object.keys(ratios).length > 0) {
        console.log('\n' + '-'.repeat(80));
        console.log('SeedLang / JavaScript Ratio (lower = SeedLang faster):');
        const ratioCol1 = 28, ratioCol2 = 12;
        console.log(pad('Benchmark', ratioCol1) + pad('Ratio', ratioCol2, 'right') + pad('Verdict', 10));
        console.log('-'.repeat(50));
        for (const [benchName, ratio] of Object.entries(ratios)) {
            const verdict = ratio < 0.95 ? 'WIN' : ratio > 1.05 ? 'LOSE' : 'TIE';
            console.log(pad(benchName, ratioCol1) + pad(ratio.toFixed(3) + 'x', ratioCol2, 'right') + verdict);
        }
        console.log('-'.repeat(50));
        console.log(`Summary: WIN ${seedWins} | TIE ${seedTies} | LOSE ${seedLosses} | total ${Object.keys(ratios).length}`);

        const logRatios = Object.values(ratios).filter(r => r > 0).map(r => Math.log(r));
        if (logRatios.length > 0) {
            const geoMean = Math.exp(logRatios.reduce((a, b) => a + b, 0) / logRatios.length);
            console.log(`Geometric Mean (SeedLang/JavaScript): ${geoMean.toFixed(3)}x`);
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('Category Breakdown:');
    const categories = ['Algorithmic', 'Data Structures', 'String Processing', 'Numerical', 'Real-World'];
    for (const cat of categories) {
        const catBenchmarks = BENCHMARKS.filter(b => b.category === cat);
        if (catBenchmarks.length === 0) continue;
        console.log(`\n  ${cat}:`);
        for (const b of catBenchmarks) {
            const benchName = `${b.name}(${b.arg})`;
            const parts = langOrder.map(lang => {
                const entry = allResults[lang]?.[benchName];
                if (!entry) return `${lang}: N/A`;
                return `${lang}: ${entry.ms.toFixed(3)}ms`;
            });
            console.log(`    ${benchName} — ${parts.join(' | ')}`);
        }
    }
}

function runQuickSmoke() {
    printSection('Industry Benchmark — Quick Smoke Test');
    console.log('Running minimal iterations to verify all benchmarks execute correctly...\n');

    const seedSource = fs.readFileSync(path.join(BENCH_DIR, 'bench_industry.seed'), 'utf8');
    let pass = 0, fail = 0;
    for (const bench of BENCHMARKS) {
        const fnName = bench.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'Test';
        const fullCode = seedSource + '\nresult = ' + fnName + '(' + bench.arg + ')';
        try {
            const vm = createBenchVM();
            const t0 = performance.now();
            const r = vm.run(fullCode);
            const t1 = performance.now();
            if (r.success) {
                const result = vm.vm.globals.result;
                console.log(`  ${pad(bench.name + '(' + bench.arg + ')', 28)} ${pad(bench.category, 18)} OK  ${(t1-t0).toFixed(2)}ms  result=${result}`);
                pass++;
            } else {
                console.log(`  ${pad(bench.name + '(' + bench.arg + ')', 28)} ${pad(bench.category, 18)} FAIL  ${r.error}`);
                fail++;
            }
        } catch (e) {
            console.log(`  ${pad(bench.name + '(' + bench.arg + ')', 28)} ${pad(bench.category, 18)} FAIL  ${e.message}`);
            fail++;
        }
    }
    console.log(`\nSmoke test: PASS ${pass} | FAIL ${fail} | Total ${BENCHMARKS.length}`);
    return { pass, fail };
}

function runInterpTier() {
    printSection('Industry Benchmark — Interpreted Language Tier');
    console.log('Comparing interpreted/scripting languages: SeedLang VM vs Python vs Lua');
    console.log('Note: These are interpreter-level comparisons, not compiled.\n');

    const allResults = {};
    const langOrder = [];
    const issues = [];

    const seedBenchScriptPath = path.join(BENCH_DIR, '_seedlang_interp_bench.js');
    console.log('Preparing SeedLang VM benchmark...');
    injectBenchStable(seedBenchScriptPath);
    console.log('Running SeedLang VM...');
    allResults['SeedLang-VM'] = runAndAggregateLanguage('SeedLang-VM', `node "${seedBenchScriptPath}"`, BENCH_DIR, 2, 3, 2000, issues);
    langOrder.push('SeedLang-VM');
    try { fs.unlinkSync(seedBenchScriptPath); } catch {}

    const pyCmd = hasCommand('python3') ? 'python3' : hasCommand('py') ? 'py' : hasCommand('python') ? 'python' : null;
    if (pyCmd) {
        console.log('Running Python...');
        allResults['Python'] = runAndAggregateLanguage('Python', `${pyCmd} sources\\bench_industry.py`, BENCH_DIR, 2, 3, 2000, issues);
        langOrder.push('Python');
    } else { issues.push('Python: interpreter not found'); }

    const luaCmd = hasCommand('lua') ? 'lua' : hasCommand('lua54') ? 'lua54' : hasCommand('luajit') ? 'luajit' : null;
    if (luaCmd) {
        console.log('Running Lua...');
        allResults['Lua'] = runAndAggregateLanguage('Lua', `${luaCmd} sources\\bench_industry.lua`, BENCH_DIR, 2, 3, 2000, issues);
        langOrder.push('Lua');
    } else { issues.push('Lua: interpreter not found'); }

    if (issues.length > 0) {
        console.log('\nIssues:');
        for (const iss of issues) console.log(`  - ${iss}`);
    }

    printComparisonTable(allResults, langOrder);
    return { allResults, langOrder, issues };
}

if (MODE_ARG === 'smoke') {
    runQuickSmoke();
} else if (MODE_ARG === 'vm') {
    runInProcessVM();
} else if (MODE_ARG === 'multi') {
    runMultiLang();
} else if (MODE_ARG === 'interp') {
    runInterpTier();
} else {
    runQuickSmoke();
    runInProcessVM();
    runMultiLang();
}

if (QUIET) {
    console.log = RAW_CONSOLE_LOG;
    console.log('Industry benchmark completed (quiet mode).');
}
