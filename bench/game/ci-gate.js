// 游戏基准 CI 门禁：在 CI 流程中自动运行游戏基准测试，将结果写入 out/ci/ 目录并判定是否通过性能阈值

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function envInt(name, dft) {
    const n = parseInt(process.env[name] || '', 10);
    return Number.isFinite(n) ? n : dft;
}

function envStr(name, dft) {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : dft;
}

function padRight(s, n) {
    const t = String(s);
    return t + ' '.repeat(Math.max(0, n - t.length));
}

function main() {
    const root = path.resolve(__dirname, '..', '..');
    const runScript = path.join(root, 'bench', 'game', 'run.js');
    const outDir = path.join(root, 'bench', 'game', 'out', 'ci');
    const historyDir = path.join(root, 'bench', 'game', 'history');
    const latestSummaryPath = path.join(outDir, 'latest-summary.json');
    const historyPath = path.join(historyDir, 'trend.jsonl');
    fs.mkdirSync(outDir, { recursive: true });
    fs.mkdirSync(historyDir, { recursive: true });

    const frames = envInt('GAME_BENCH_FRAMES', 600);
    const warmup = envInt('GAME_BENCH_WARMUP', 100);
    const seed = envInt('GAME_BENCH_SEED', 42);
    const profile = envStr('GAME_BENCH_PROFILE', 'mid');
    const tier = envStr('GAME_BENCH_TIER', 'low');
    const casesRaw = envStr('GAME_BENCH_CASES', 'G01,G02,G03,G04,G05,G06,G07,G08,G09,G10');
    const cases = casesRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    console.log('[game-ci] config');
    console.log(`  cases=${cases.join(',')}`);
    console.log(`  profile=${profile} tier=${tier} frames=${frames} warmup=${warmup} seed=${seed}`);
    console.log(`  outDir=${outDir}`);

    const rows = [];
    let hasFailure = false;
    const gateStartedAt = new Date().toISOString();
    const t0 = performance.now();

    for (const c of cases) {
        const outPath = path.join(outDir, `${c.toLowerCase()}.json`);
        const args = [
            runScript,
            '--case', c,
            '--profile', profile,
            '--tier', tier,
            '--frames', String(frames),
            '--warmup', String(warmup),
            '--seed', String(seed),
            '--json-out', outPath
        ];

        const proc = spawnSync('node', args, { cwd: root, encoding: 'utf8' });
        if (proc.error) {
            console.error(`[game-ci] ${c} spawn error: ${proc.error.message}`);
            hasFailure = true;
            rows.push({ case: c, verdict: 'ERROR', p95: 'N/A', p99: 'N/A', overBudgetPct: 'N/A' });
            continue;
        }

        let report = null;
        try {
            report = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        } catch (_) {
            // Ignore parse failure; fallback below.
        }

        const verdict = report?.verdict || (proc.status === 0 ? 'PASS' : 'FAIL');
        const p95 = report?.metrics?.p95Ms;
        const p99 = report?.metrics?.p99Ms;
        const over = report?.metrics?.overBudgetPct;

        rows.push({
            case: c,
            verdict,
            p95: Number.isFinite(p95) ? p95.toFixed(3) : 'N/A',
            p99: Number.isFinite(p99) ? p99.toFixed(3) : 'N/A',
            overBudgetPct: Number.isFinite(over) ? over.toFixed(3) : 'N/A'
        });

        if (verdict !== 'PASS') {
            hasFailure = true;
            console.log(`[game-ci] ${c} failed (exit=${proc.status})`);
        } else {
            console.log(`[game-ci] ${c} passed`);
        }
    }

    console.log('\n[game-ci] summary');
    console.log(
        `${padRight('CASE', 8)} ${padRight('VERDICT', 8)} ${padRight('P95(ms)', 10)} ${padRight('P99(ms)', 10)} OVER(%)`
    );
    for (const r of rows) {
        console.log(
            `${padRight(r.case, 8)} ${padRight(r.verdict, 8)} ${padRight(r.p95, 10)} ${padRight(r.p99, 10)} ${r.overBudgetPct}`
        );
    }

    const gateFinishedAt = new Date().toISOString();
    const summary = {
        meta: {
            gateStartedAt,
            gateFinishedAt,
            durationMs: performance.now() - t0
        },
        config: {
            frames,
            warmup,
            seed,
            profile,
            tier,
            cases
        },
        rows,
        verdict: hasFailure ? 'FAIL' : 'PASS'
    };
    fs.writeFileSync(latestSummaryPath, JSON.stringify(summary, null, 2), 'utf8');
    fs.appendFileSync(historyPath, JSON.stringify(summary) + '\n', 'utf8');
    console.log(`\n[game-ci] summary saved: ${latestSummaryPath}`);
    console.log(`[game-ci] trend appended: ${historyPath}`);

    if (hasFailure) {
        console.error('[game-ci] gate result: FAIL');
        process.exitCode = 2;
        return;
    }
    console.log('[game-ci] gate result: PASS');
}

main();
