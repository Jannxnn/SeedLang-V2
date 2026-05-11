// 游戏热点分析工具：解析游戏基准运行数据，定位性能瓶颈（热点函数/热点路径），生成 hotspots JSON 报告

const fs = require('fs');
const path = require('path');
const { SeedLangVM } = require('../../src/runtime/vm');

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const t = argv[i];
        if (!t.startsWith('--')) continue;
        const k = t.slice(2);
        const n = argv[i + 1];
        if (n && !n.startsWith('--')) {
            out[k] = n;
            i++;
        } else {
            out[k] = true;
        }
    }
    return out;
}

function toInt(v, dft) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : dft;
}

function percentile(values, p) {
    if (!values.length) return 0;
    const arr = values.slice().sort((a, b) => a - b);
    const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1));
    return arr[idx];
}

function mean(values) {
    if (!values.length) return 0;
    let s = 0;
    for (const v of values) s += v;
    return s / values.length;
}

function buildArrayProgram(n) {
    return `arr = []
i = 0
while i < ${n} {
    push(arr i)
    i = i + 1
}
sum = 0
j = 0
while j < ${n} {
    sum = sum + arr[j]
    j = j + 1
}
result = sum`;
}

function buildLoopProgram(n) {
    return `sum = 0
i = 0
while i < ${n} {
    sum = sum + i * 3 - floor(i / 7)
    i = i + 1
}
result = sum`;
}

function buildCallProgram(n) {
    return `fn add(a b) { return a + b }
sum = 0
i = 0
while i < ${n} {
    sum = add(sum i)
    i = i + 1
}
result = sum`;
}

function runProgram(vm, code, warmupRuns, sampleRuns) {
    for (let i = 0; i < warmupRuns; i++) {
        const w = vm.run(code);
        if (!w.success) throw new Error(w.error);
    }
    const samples = [];
    for (let i = 0; i < sampleRuns; i++) {
        const t0 = performance.now();
        const r = vm.run(code);
        const t1 = performance.now();
        if (!r.success) throw new Error(r.error);
        samples.push(t1 - t0);
    }
    return {
        avgMs: mean(samples),
        p95Ms: percentile(samples, 95),
        p99Ms: percentile(samples, 99)
    };
}

function main() {
    const args = parseArgs(process.argv);
    const root = path.resolve(__dirname, '..', '..');
    const warmup = Math.max(1, toInt(args.warmup, 5));
    const samples = Math.max(3, toInt(args.samples, 20));
    const outPath = args['json-out']
        ? path.resolve(root, args['json-out'])
        : path.join(root, 'bench', 'game', 'out', 'hotspots-latest.json');

    const scales = [10000, 50000, 100000];
    const vm = new SeedLangVM();

    const categories = [
        { name: 'array', build: buildArrayProgram },
        { name: 'loop', build: buildLoopProgram },
        { name: 'function-call', build: buildCallProgram }
    ];

    const results = [];
    for (const c of categories) {
        for (const n of scales) {
            const code = c.build(n);
            const stat = runProgram(vm, code, warmup, samples);
            results.push({
                category: c.name,
                scale: n,
                avgMs: stat.avgMs,
                p95Ms: stat.p95Ms,
                p99Ms: stat.p99Ms
            });
        }
    }

    const report = {
        generatedAt: new Date().toISOString(),
        config: { warmupRuns: warmup, sampleRuns: samples, scales },
        results
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n[hotspots] saved: ${outPath}`);
}

main();
