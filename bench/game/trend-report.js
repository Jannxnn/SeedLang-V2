// 游戏趋势报告工具：读取 history/trend.jsonl 中的历史基准数据，生成周报（weekly-report.json）与性能趋势分析

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const t = argv[i];
        if (!t.startsWith('--')) continue;
        const key = t.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
            out[key] = next;
            i++;
        } else {
            out[key] = true;
        }
    }
    return out;
}

function toInt(v, dft) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : dft;
}

function toBool(v, dft) {
    if (v === undefined) return dft;
    const s = String(v).trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
    if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
    return dft;
}

function mean(values) {
    if (!values.length) return 0;
    let s = 0;
    for (const v of values) s += v;
    return s / values.length;
}

function pickWithinDays(entries, days) {
    const now = Date.now();
    const threshold = now - days * 24 * 60 * 60 * 1000;
    return entries.filter(e => {
        const t = Date.parse(e?.meta?.gateFinishedAt || '');
        return Number.isFinite(t) && t >= threshold;
    });
}

function loadTrend(file) {
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    const out = [];
    for (const line of lines) {
        try {
            out.push(JSON.parse(line));
        } catch (_) {
            // ignore bad line
        }
    }
    return out;
}

function collectCaseStats(entries) {
    const map = new Map();
    for (const e of entries) {
        for (const row of e.rows || []) {
            if (!map.has(row.case)) {
                map.set(row.case, { p95: [], p99: [], over: [], pass: 0, total: 0 });
            }
            const m = map.get(row.case);
            const p95 = Number(row.p95);
            const p99 = Number(row.p99);
            const over = Number(row.overBudgetPct);
            if (Number.isFinite(p95)) m.p95.push(p95);
            if (Number.isFinite(p99)) m.p99.push(p99);
            if (Number.isFinite(over)) m.over.push(over);
            m.total += 1;
            if (row.verdict === 'PASS') m.pass += 1;
        }
    }
    return map;
}

function decideScale(statsMap, minRuns) {
    // Recommend scale-up only when every tracked case has strong weekly headroom.
    // Headroom criteria:
    // 1) pass rate >= 95%
    // 2) avg p95 <= 2.4ms (20% headroom vs 3.0ms low-tier threshold)
    // 3) avg p99 <= 4.0ms (20% headroom vs 5.0ms low-tier threshold)
    // 4) avg over-budget <= 0.2%
    for (const [, s] of statsMap.entries()) {
        if (s.total < minRuns) return { ok: false, reason: `insufficient-runs(<${minRuns})` };
        const passRate = s.total > 0 ? (s.pass / s.total) * 100 : 0;
        const p95Avg = mean(s.p95);
        const p99Avg = mean(s.p99);
        const overAvg = mean(s.over);
        if (passRate < 95) return { ok: false, reason: 'pass-rate<95%' };
        if (p95Avg > 2.4) return { ok: false, reason: 'p95-headroom-low' };
        if (p99Avg > 4.0) return { ok: false, reason: 'p99-headroom-low' };
        if (overAvg > 0.2) return { ok: false, reason: 'over-budget-high' };
    }
    return { ok: true, reason: 'all-cases-healthy' };
}

function main() {
    const args = parseArgs(process.argv);
    const root = path.resolve(__dirname, '..', '..');
    const historyPath = path.join(root, 'bench', 'game', 'history', 'trend.jsonl');
    const outPath = args['out'] ? path.resolve(root, args['out']) : path.join(root, 'bench', 'game', 'history', 'weekly-report.json');
    const days = Math.max(1, toInt(args.days, 7));
    const minRuns = Math.max(3, toInt(args['min-runs'], 7));
    const strictExit = toBool(args['strict-exit'], false);

    const allEntries = loadTrend(historyPath);
    const entries = pickWithinDays(allEntries, days);
    const stats = collectCaseStats(entries);
    const gatePassCount = entries.filter(e => e.verdict === 'PASS').length;
    const gatePassRate = entries.length > 0 ? (gatePassCount / entries.length) * 100 : 0;
    const scaleDecision = decideScale(stats, minRuns);

    const caseRows = [];
    for (const [caseId, s] of stats.entries()) {
        caseRows.push({
            case: caseId,
            runs: s.total,
            passRatePct: s.total > 0 ? (s.pass / s.total) * 100 : 0,
            avgP95Ms: mean(s.p95),
            avgP99Ms: mean(s.p99),
            avgOverBudgetPct: mean(s.over)
        });
    }
    caseRows.sort((a, b) => a.case.localeCompare(b.case));

    const report = {
        generatedAt: new Date().toISOString(),
        windowDays: days,
        minRunsRequired: minRuns,
        totals: {
            gateRuns: entries.length,
            gatePassCount,
            gatePassRatePct: gatePassRate
        },
        cases: caseRows,
        recommendation: {
            scaleUp: scaleDecision.ok,
            reason: scaleDecision.reason
        }
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n[trend] saved: ${outPath}`);

    // Default non-blocking for long-running sampling; enable strict mode when needed.
    if (strictExit && !scaleDecision.ok) process.exitCode = 2;
}

main();
