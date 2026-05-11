function binaryTreesTest(depth) {
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
    console.log(`${name}(${arg})=${out} ${median.toFixed(6)}ms`);
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
