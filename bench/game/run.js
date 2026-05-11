// 游戏基准测试运行器：基于 SeedLang VM 运行游戏逻辑基准（实体更新、碰撞检测、物理模拟），输出 FPS 与帧时间统计

const fs = require('fs');
const path = require('path');
const { SeedLangVM } = require('../../src/runtime/vm');

const FPS = 60;
const FRAME_BUDGET_MS = 1000 / FPS;

const TIER_THRESHOLDS = {
    low: { p95: 3.0, p99: 5.0, overBudgetPct: 0.5 },
    mid: { p95: 2.0, p99: 3.5, overBudgetPct: 0.2 },
    high: { p95: 1.2, p99: 2.0, overBudgetPct: 0.1 }
};

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;
        const raw = token.slice(2);
        const eqIdx = raw.indexOf('=');
        if (eqIdx >= 0) {
            out[raw.slice(0, eqIdx)] = raw.slice(eqIdx + 1);
        } else {
            const next = argv[i + 1];
            if (next && !next.startsWith('--')) {
                out[raw] = next;
                i++;
            } else {
                out[raw] = true;
            }
        }
    }
    return out;
}

function toInt(v, dft) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : dft;
}

function toNum(v, dft) {
    const n = Number(v);
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

function mulberry32(seed) {
    let t = seed >>> 0;
    return function rand() {
        t += 0x6D2B79F5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function ensureOutDir(filePath) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
}

function buildCaseConfig(opts) {
    const profile = String(opts.profile || 'mid').toLowerCase();
    const presets = {
        low: { entities: 1000, agents: 500, eps: 2000, coroutines: 1000, bindings: 2000, ops: 500, rps: 50, tps: 100, objects: 10000 },
        mid: { entities: 5000, agents: 2000, eps: 5000, coroutines: 5000, bindings: 10000, ops: 2000, rps: 200, tps: 1000, objects: 50000 },
        high: { entities: 10000, agents: 5000, eps: 10000, coroutines: 20000, bindings: 30000, ops: 5000, rps: 500, tps: 5000, objects: 100000 }
    };
    const p = presets[profile] || presets.mid;
    return {
        profile,
        entities: toInt(opts.entities, p.entities),
        agents: toInt(opts.agents, p.agents),
        eps: toInt(opts.eps, p.eps),
        coroutines: toInt(opts.coroutines, p.coroutines),
        bindings: toInt(opts.bindings, p.bindings),
        ops: toInt(opts.ops, p.ops),
        rps: toInt(opts.rps, p.rps),
        tps: toInt(opts.tps, p.tps),
        objects: toInt(opts.objects, p.objects)
    };
}

function buildSeedScript(caseId, cfg) {
    if (caseId === 'G01') {
        return `sum = 0
i = 0
while i < ${cfg.entities} {
    sum = sum + i * 3 - floor(i / 7) + __bench_jitter
    i = i + 1
}
result = sum`;
    }
    if (caseId === 'G02') {
        return `active = 0
i = 0
while i < ${cfg.agents} {
    if i - floor(i / 5) * 5 == 0 {
        active = active + 2
    } else {
        active = active + 1
    }
    i = i + 1
}
result = active`;
    }
    if (caseId === 'G03') {
        const eventsPerFrame = Math.max(1, Math.floor(cfg.eps / FPS));
        return `handled = 0
i = 0
while i < ${eventsPerFrame} {
    handled = handled + i * 2 + __bench_jitter
    i = i + 1
}
result = handled`;
    }
    if (caseId === 'G04') {
        return `ticks = 0
i = 0
while i < ${cfg.coroutines} {
    ticks = ticks + (i - floor(i / 11) * 11)
    i = i + 1
}
result = ticks`;
    }
    if (caseId === 'G05') {
        return `acc = 0
i = 0
while i < ${cfg.bindings} {
    acc = acc + i + __bench_jitter
    i = i + 1
}
result = acc`;
    }
    if (caseId === 'G06') {
        return `v = 1
i = 0
while i < ${cfg.ops} {
    v = v * 1.000001 + i - floor(i / 3)
    i = i + 1
}
result = v`;
    }
    if (caseId === 'G07') {
        const reqPerFrame = Math.max(1, Math.floor(cfg.rps / FPS));
        return `cost = 0
i = 0
while i < ${reqPerFrame} {
    cost = cost + i * 13 - floor(i / 2) + __bench_jitter
    i = i + 1
}
result = cost`;
    }
    if (caseId === 'G08') {
        const throwsPerFrame = Math.max(1, Math.floor(cfg.tps / FPS));
        return `trace = 0
i = 0
while i < ${throwsPerFrame} {
    try {
        if i - floor(i / 3) * 3 == 0 { throw "x" }
        trace = trace + 1
    } catch(e) {
        trace = trace + 2
    } finally {
        trace = trace + 3
    }
    i = i + 1
}
result = trace`;
    }
    if (caseId === 'G09') {
        return `checksum = 0
i = 0
while i < ${cfg.objects} {
    checksum = checksum + i * 17 - floor(i / 9)
    i = i + 1
}
result = checksum`;
    }
    if (caseId === 'G10') {
        const eventsPerFrame = Math.max(1, Math.floor(cfg.eps / FPS));
        return `sum = 0
i = 0
while i < ${cfg.entities} {
    sum = sum + i * 2 - floor(i / 7)
    i = i + 1
}
j = 0
while j < ${cfg.agents} {
    if j - floor(j / 5) * 5 == 0 { sum = sum + 2 } else { sum = sum + 1 }
    j = j + 1
}
k = 0
while k < ${eventsPerFrame} {
    sum = sum + k * 3 + __bench_jitter
    k = k + 1
}
m = 0
while m < ${cfg.bindings} {
    sum = sum + m
    m = m + 1
}
result = sum + __bench_frame_idx`;
    }
    throw new Error(`Unknown case: ${caseId}`);
}

function runCase(opts) {
    const caseId = String(opts.case || 'G10').toUpperCase();
    const tier = String(opts.tier || 'low').toLowerCase();
    const cfg = buildCaseConfig(opts);
    const warmup = Math.max(0, toInt(opts.warmup, 300));
    const frames = Math.max(1, toInt(opts.frames, 3600));
    const duration = toNum(opts.duration, null);
    const measuredFrames = Number.isFinite(duration) && duration > 0 ? Math.max(1, Math.floor(duration * FPS)) : frames;
    const seed = toInt(opts.seed, 42);
    const rand = mulberry32(seed);
    const vm = new SeedLangVM({executionGuard: false});

    const code = buildSeedScript(caseId, cfg);
    for (let i = 0; i < warmup; i++) {
        vm.setGlobal('__bench_jitter', Math.floor(rand() * 13));
        vm.setGlobal('__bench_frame_idx', i);
        const res = vm.run(code);
        if (!res.success) {
            throw new Error(`Warmup failed at frame=${i}: ${res.error}`);
        }
    }

    const frameTimes = [];
    const startHeap = process.memoryUsage().heapUsed;
    const tAll0 = performance.now();
    for (let i = 0; i < measuredFrames; i++) {
        vm.setGlobal('__bench_jitter', Math.floor(rand() * 13));
        vm.setGlobal('__bench_frame_idx', i);
        const t0 = performance.now();
        const res = vm.run(code);
        const t1 = performance.now();
        if (!res.success) {
            throw new Error(`Measure failed at frame=${i}: ${res.error}`);
        }
        frameTimes.push(t1 - t0);
    }
    const tAll1 = performance.now();
    const endHeap = process.memoryUsage().heapUsed;

    const p50 = percentile(frameTimes, 50);
    const p95 = percentile(frameTimes, 95);
    const p99 = percentile(frameTimes, 99);
    const avg = mean(frameTimes);
    let overBudget = 0;
    for (const t of frameTimes) if (t > FRAME_BUDGET_MS) overBudget++;
    const overBudgetPct = (overBudget / frameTimes.length) * 100;
    const memGrowthPct = startHeap > 0 ? ((endHeap - startHeap) / startHeap) * 100 : 0;
    const threshold = TIER_THRESHOLDS[tier] || TIER_THRESHOLDS.low;
    const pass = p95 <= threshold.p95 && p99 <= threshold.p99 && overBudgetPct <= threshold.overBudgetPct;

    return {
        meta: {
            case: caseId,
            tier,
            profile: cfg.profile,
            warmupFrames: warmup,
            measuredFrames,
            seed
        },
        config: cfg,
        thresholds: threshold,
        metrics: {
            avgMs: avg,
            p50Ms: p50,
            p95Ms: p95,
            p99Ms: p99,
            frameBudgetMs: FRAME_BUDGET_MS,
            overBudgetFrames: overBudget,
            overBudgetPct,
            totalMs: tAll1 - tAll0,
            heapStart: startHeap,
            heapEnd: endHeap,
            heapGrowthPct: memGrowthPct
        },
        verdict: pass ? 'PASS' : 'FAIL'
    };
}

function main() {
    try {
        const args = parseArgs(process.argv);
        if (args.help || args.h) {
            console.log(`Usage:
node bench/game/run.js --case G10 --profile high --frames 36000 --warmup 300 --seed 42 --tier low --json-out bench/game/out/latest.json

Options:
--case        G01..G10
--profile     low|mid|high
--tier        low|mid|high
--frames      measured frames
--duration    seconds (override frames by seconds * 60)
--warmup      warmup frames
--seed        deterministic random seed
--entities --agents --eps --coroutines --bindings --ops --rps --tps --objects
--json-out    write JSON report
`);
            return;
        }

        const report = runCase(args);
        const json = JSON.stringify(report, null, 2);
        console.log(json);

        const outPath = args['json-out'] || args.jsonOut;
        if (outPath) {
            const absOut = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
            ensureOutDir(absOut);
            fs.writeFileSync(absOut, json, 'utf8');
            console.log(`\nSaved report: ${absOut}`);
        }
        process.exitCode = report.verdict === 'PASS' ? 0 : 2;
    } catch (err) {
        console.error(`[game-bench] ${err.message || String(err)}`);
        process.exitCode = 1;
    }
}

main();
