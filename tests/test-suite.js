#!/usr/bin/env node
/**
 * SeedLang 全量测试套件入口：运行所有分类测试并生成完整报告
 *
 * 用法:
 *   node test-suite.js              # 默认 standard 模式
 *   node test-suite.js --quick      # 快速模式：核心测试，<30s
 *   node test-suite.js --standard   # 标准模式：功能+集成，2-5min
 *   node test-suite.js --full       # 完整模式：所有测试，含性能/压力
 *   node test-suite.js --quiet      # 静默模式（可与上述组合）
 *   node test-suite.js --parallel 4 # 并行数（默认 CPU 核数）
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const cliArgs = process.argv.slice(2);
const isQuiet = cliArgs.includes('--quiet');

const TIER_QUICK = 'quick';
const TIER_STANDARD = 'standard';
const TIER_FULL = 'full';

let tier = TIER_STANDARD;
if (cliArgs.includes('--quick')) tier = TIER_QUICK;
else if (cliArgs.includes('--full')) tier = TIER_FULL;

let parallelArg = cliArgs.indexOf('--parallel');
let concurrency = 1;
if (parallelArg !== -1 && cliArgs[parallelArg + 1]) {
    concurrency = Math.max(1, parseInt(cliArgs[parallelArg + 1]) || 1);
} else if (tier === TIER_QUICK || tier === TIER_STANDARD) {
    concurrency = Math.min(os.cpus().length, 4);
}

function logVerbose(...args) {
    if (!isQuiet) {
        if (progressLineActive) {
            process.stdout.write('\n');
            progressLineActive = false;
            lastProgressLen = 0;
        }
        console.log(...args);
    }
}

let progressLineActive = false;
let lastProgressLen = 0;

function writeProgress(text) {
    if (!isQuiet) {
        const pad = text.length < lastProgressLen ? ' '.repeat(lastProgressLen - text.length) : '';
        process.stdout.write(`\r${text}${pad}`);
        lastProgressLen = text.length;
        progressLineActive = true;
    }
}

function clearProgress() {
    if (progressLineActive) {
        process.stdout.write('\r' + ' '.repeat(lastProgressLen || 80) + '\r');
        lastProgressLen = 0;
        progressLineActive = false;
    }
}

const allTestFiles = [
    { name: 'Bootstrap Smoke Test', file: 'bootstrap/test-bootstrap-smoke.js', expected: 10, isRequired: true, tier: TIER_QUICK },
    { name: 'Bootstrap Compare Test', file: 'bootstrap/test-bootstrap-compare.js', expected: 17, isRequired: true, tier: TIER_STANDARD },
    { name: 'CLC Self-Bootstrap Regression', file: 'bootstrap/test-clc-bootstrap.js', expected: 9, isRequired: false, tier: TIER_FULL },
    { name: 'JIT Compiler Unit Test', file: 'unit/test-jit-memory.js', expected: 44, format: 'unit', tier: TIER_QUICK },
    { name: 'Runtime Safety Unit Test', file: 'unit/test-safety-errors.js', expected: 28, format: 'unit', tier: TIER_QUICK },
    { name: 'Core Module Unit Test', file: 'unit/test-core-modules.js', expected: 20, format: 'unit', tier: TIER_QUICK },
    { name: 'Concurrent Safety Unit Test', file: 'unit/test-concurrent.js', expected: 22, format: 'unit', tier: TIER_STANDARD },
    { name: 'New Features Unit Test', file: 'unit/test-new-features.js', expected: 34, format: 'unit', tier: TIER_STANDARD },
    { name: 'Advanced Optimization Test', file: 'unit/test-advanced-optimizations.js', expected: 25, format: 'unit', tier: TIER_STANDARD },
    { name: 'Token Counter Test', file: 'unit/test-token-counter.js', expected: 17, format: 'unit', tier: TIER_QUICK },
    { name: 'VM Execution Budget Test', file: 'unit/test-vm-execution-budget.js', expected: 18, format: 'unit', tier: TIER_QUICK },
    { name: 'VM Opcodes Test', file: 'unit/test-vm-opcodes.js', expected: 22, format: 'unit', tier: TIER_QUICK },
    { name: 'VM Frame Limits Test', file: 'unit/test-vm-frame-limits.js', expected: 17, format: 'unit', tier: TIER_QUICK },
    { name: 'VM JIT Compiler Test', file: 'unit/test-vm-jit.js', expected: 27, format: 'unit', tier: TIER_STANDARD },
    { name: 'compileToJS Output Test', file: 'unit/test-compile-to-js.js', expected: 16, format: 'unit', tier: TIER_QUICK },
    { name: 'Stability Deliverable (Seed golden)', file: 'deliverables/test-stability-deliverable.js', expected: 2, format: 'unit', tier: TIER_QUICK },
    { name: 'CLC compileToC Test', file: 'unit/test-compile-to-c.js', expected: 113, format: 'unit', tier: TIER_FULL },
    { name: 'Document Consistency Test', file: 'integration/test-doc-consistency.js', expected: 0, isRequired: true, slow: true, tier: TIER_FULL },
    { name: 'Seed Syntax Guard Test', file: 'integration/test-seed-syntax-guard.js', expected: 1, format: 'summary', tier: TIER_QUICK },
    { name: 'Language Spec Test', file: 'core/test-language-spec.js', expected: 38, format: 'spec', tier: TIER_QUICK },
    { name: 'Feature Enhancement Test', file: 'features/test-features.js', expected: 35, format: 'summary', tier: TIER_STANDARD },
    { name: 'External Language Integration Test', file: 'integration/test-integration.js', expected: 26, format: 'summary', tier: TIER_STANDARD },
    { name: 'Toolchain Test', file: 'integration/test-tools.js', expected: 20, format: 'summary', tier: TIER_STANDARD },
    { name: 'AMP Pipeline Integration Test', file: 'integration/test-amp-pipeline.js', expected: 7, format: 'summary', slow: true, tier: TIER_FULL },
    { name: 'AMP DSL Integration Test', file: 'integration/test-amp-dsl.js', expected: 13, format: 'summary', slow: true, tier: TIER_FULL },
    { name: 'AMP Runtime Integration Test', file: 'integration/test-amp-runtime.js', expected: 4, format: 'summary', slow: true, tier: TIER_FULL },
    { name: 'Semantic Boundary Integration Test', file: 'integration/test-semantic-boundaries.js', expected: 14, format: 'summary', tier: TIER_STANDARD },
    { name: 'Architecture Test', file: 'core/test-architecture.js', expected: 251, tier: TIER_STANDARD },
    { name: 'Comprehensive Test', file: 'core/test-comprehensive.js', expected: 29, tier: TIER_STANDARD, dedup: 'js-compat' },
    { name: 'Hell Test', file: 'scenarios/test-hell.js', expected: 15, tier: TIER_FULL },
    { name: 'Closure Test', file: 'features/test-closure.js', expected: 11, format: 'summary', tier: TIER_QUICK },
    { name: 'Ultimate Challenge Test', file: 'scenarios/test-ultimate.js', expected: 10, tier: TIER_FULL },
    { name: 'Stress Test', file: 'performance/test-stress.js', expected: 28, tier: TIER_FULL },
    { name: 'Enterprise Test', file: 'scenarios/test-enterprise.js', expected: 25, tier: TIER_FULL },
    { name: 'JavaScript Compatibility Test', file: 'core/test-js-compatibility.js', expected: 36, tier: TIER_STANDARD },
    { name: 'Class and Object Test', file: 'features/test-class.js', expected: 9, tier: TIER_STANDARD },
    { name: 'Class Inheritance Test', file: 'features/test-inheritance.js', expected: 12, format: 'result', tier: TIER_STANDARD },
    { name: 'Runtime Error Path Test', file: 'features/test-runtime-errors.js', expected: 21, format: 'result', tier: TIER_FULL },
    { name: 'Bitwise Operation Test', file: 'features/test-bitwise.js', expected: 37, format: 'result', tier: TIER_STANDARD },
    { name: 'Radix Literal Test', file: 'features/test-radix-literals.js', expected: 31, format: 'result', tier: TIER_STANDARD },
    { name: 'Standard Library Extended Test', file: 'features/test-stdlib-extended.js', expected: 40, format: 'result', tier: TIER_STANDARD },
    { name: 'Template String & Syntax Guard Test', file: 'features/test-template-and-syntax.js', expected: 15, format: 'result', tier: TIER_STANDARD },
    { name: 'Web Runtime Scenario Test', file: 'scenarios/test-web-runtime.js', expected: 9, tier: TIER_FULL },
    { name: 'Game Runtime Scenario Test', file: 'scenarios/test-game-runtime.js', expected: 9, tier: TIER_FULL },
    { name: 'AI Agent Scenario Test', file: 'scenarios/test-ai-agent.js', expected: 9, tier: TIER_FULL },
    { name: 'Pattern Matching Test', file: 'features/test-pattern-matching.js', expected: 32, format: 'result', tier: TIER_STANDARD },
    { name: 'Generics System Test', file: 'features/test-generics.js', expected: 21, format: 'result', tier: TIER_STANDARD },
    { name: 'Coroutine Test', file: 'features/test-coroutine.js', expected: 6, format: 'result', tier: TIER_STANDARD },
    { name: 'Fiber Test', file: 'features/test-fiber.js', expected: 46, format: 'result', tier: TIER_STANDARD },
    { name: 'Macro System Test', file: 'features/test-macro.js', expected: 6, format: 'result', tier: TIER_STANDARD },
    { name: 'Parallel Computing Test', file: 'features/test-parallel.js', expected: 6, format: 'result', tier: TIER_STANDARD },
    { name: 'Error Handling Test', file: 'features/test-error-handling.js', expected: 10, format: 'result', tier: TIER_QUICK },
    { name: 'Boundary Condition Test', file: 'features/test-boundary.js', expected: 20, format: 'result', tier: TIER_STANDARD },
    { name: 'Type System Test', file: 'features/test-type-system.js', expected: 20, format: 'result', tier: TIER_STANDARD },
    { name: 'Module System Test', file: 'features/test-module.js', expected: 10, format: 'result', tier: TIER_STANDARD },
    { name: 'Seed File Runner Test', file: 'seed/test-seed-runner.js', expected: 327, format: 'summary', timeout: 600, tier: TIER_FULL },
    { name: 'Async Deep Test', file: 'features/test-async-deep.js', expected: 10, format: 'result', tier: TIER_STANDARD },
    { name: 'Memory Stress Test', file: 'performance/test-memory-stress.js', expected: 10, format: 'result', tier: TIER_FULL },
    { name: 'Extreme Boundary Test', file: 'extreme/test-extreme-boundaries.js', expected: 69, format: 'summary', tier: TIER_FULL },
    { name: 'Concurrent Race Test', file: 'extreme/test-concurrent-race.js', expected: 10, format: 'result', tier: TIER_FULL },
    { name: 'Exception Chain Test', file: 'extreme/test-exception-chain.js', expected: 15, format: 'result', tier: TIER_FULL },
    { name: 'Parser Extreme Test', file: 'extreme/test-parser-extreme.js', expected: 28, format: 'result', tier: TIER_FULL },
    { name: 'Nightmare Test', file: 'extreme/test-nightmare.js', expected: 26, format: 'unit', tier: TIER_STANDARD },
    { name: 'Fuzzing Test', file: 'special/test-fuzzing.js', expected: 73, format: 'summary', tier: TIER_FULL },
    { name: 'Performance Benchmark Test', file: 'performance/test-benchmark.js', expected: 41, format: 'benchmark', slow: true, tier: TIER_FULL },
    { name: 'Performance Comparison Test', file: 'performance/comparison.js', expected: 0, format: 'comparison', slow: true, tier: TIER_FULL },
    { name: 'Security Test', file: 'special/test-security.js', expected: 63, format: 'summary', tier: TIER_FULL },
    { name: 'Regression Test', file: 'special/test-regression.js', expected: 82, format: 'summary', tier: TIER_STANDARD },
    { name: 'Language Stability Test', file: 'special/test-language-stability.js', expected: 128, format: 'summary', tier: TIER_FULL },
    { name: 'Cross-Platform Compatibility Test', file: 'special/test-cross-platform.js', expected: 87, format: 'summary', tier: TIER_FULL },
    { name: 'Code Coverage Test', file: 'coverage/test-coverage.js', expected: 95, format: 'coverage', tier: TIER_FULL },
    { name: 'End-to-End Test', file: 'e2e/test-e2e.js', expected: 12, format: 'summary', tier: TIER_STANDARD },
    { name: 'Multi-Module Integration Test', file: 'integration/test-multi-module.js', expected: 13, format: 'summary', tier: TIER_STANDARD },
    { name: 'Snapshot Test', file: 'snapshot/test-snapshot.js', expected: 3, format: 'summary', tier: TIER_QUICK },
    { name: 'Bytecode Snapshot Test', file: 'bytecode-snapshot/test-bytecode-snapshot.js', expected: 20, format: 'summary', tier: TIER_QUICK },
    { name: 'Contract Test', file: 'contract/test-contract.js', expected: 7, format: 'summary', tier: TIER_STANDARD },
    { name: 'Load Test', file: 'performance/test-load.js', expected: 4, format: 'summary', tier: TIER_FULL },
    { name: 'Fault Injection Test', file: 'fault-injection/test-fault-injection.js', expected: 8, format: 'summary', tier: TIER_STANDARD },
    { name: 'Node.js Version Compatibility Test', file: 'special/test-node-compatibility.js', expected: 10, format: 'summary', tier: TIER_STANDARD },
    { name: 'Extended Feature Tests', file: 'features/test-extended-features.js', expected: 78, format: 'result', tier: TIER_FULL },
    { name: 'Game Logic & Compiler Edge Case Tests', file: 'features/test-game-logic.js', expected: 37, format: 'result', tier: TIER_STANDARD },
    { name: 'Scheduler Test', file: 'features/test-scheduler.js', expected: 15, format: 'result', tier: TIER_STANDARD },
    { name: 'Proc Macro Test', file: 'features/test-proc-macro.js', expected: 20, format: 'result', tier: TIER_STANDARD },
    { name: 'Infrastructure Integration Test', file: 'integration/test-infrastructure.js', expected: 24, format: 'result', tier: TIER_STANDARD },
    { name: 'Boundary & Stress Test', file: 'extreme/test-boundary-stress.js', expected: 24, format: 'result', tier: TIER_FULL }
];

const TIER_ORDER = { [TIER_QUICK]: 0, [TIER_STANDARD]: 1, [TIER_FULL]: 2 };
const testFiles = allTestFiles.filter(t => TIER_ORDER[t.tier] <= TIER_ORDER[tier]);

let totalPassed = 0;
let totalFailed = 0;
let totalTests = 0;
const failedTests = [];
const testTimes = [];
const startTime = Date.now();
let completedCount = 0;
const totalCount = testFiles.length;

const SLOW_THRESHOLD = 5;
const STREAM_THRESHOLD = 10;

const tierLabels = { quick: 'Quick (<30s)', standard: 'Standard (2-5min)', full: 'Full (10-30min)' };
logVerbose('\n+============================================================+');
logVerbose('|          SeedLang Test Suite                               |');
logVerbose(`|          Mode: ${tierLabels[tier].padEnd(44)}|`);
logVerbose(`|          ${totalCount} test groups to run (concurrency: ${concurrency})       |`);
logVerbose('+============================================================+\n');

function parseTestResults(output) {
    let passed = 0;
    let failed = 0;

    const passMatch = output.match(/通过:\s*(\d+)/);
    const failMatch = output.match(/失败:\s*(\d+)/);
    const passMatchEn = output.match(/Passed:\s*(\d+)/);
    const failMatchEn = output.match(/Failed:\s*(\d+)/);

    passed = passMatch ? parseInt(passMatch[1]) : (passMatchEn ? parseInt(passMatchEn[1]) : 0);
    failed = failMatch ? parseInt(failMatch[1]) : (failMatchEn ? parseInt(failMatchEn[1]) : 0);

    if (passed === 0 && failed === 0) {
        const resultsMatch = output.match(/Results?:\s*(\d+)\s*passed[,\s]*(\d+)\s*failed/i);
        if (resultsMatch) {
            passed = parseInt(resultsMatch[1]);
            failed = parseInt(resultsMatch[2]);
        }
    }
    if (passed === 0 && failed === 0) {
        const executionMatch = output.match(/Execution:\s*passed=(\d+),\s*failed=(\d+)/i);
        if (executionMatch) {
            passed = parseInt(executionMatch[1]);
            failed = parseInt(executionMatch[2]);
        }
    }

    const okCount = (output.match(/\[PASS\]|\[OK\]/g) || []).length;
    const failCount = (output.match(/\[FAIL\]/g) || []).length;
    if (okCount + failCount > passed + failed) {
        passed = okCount;
        failed = failCount;
    }

    return { passed, failed, total: passed + failed };
}

function runTestFileAsync(testFile) {
    return new Promise((resolve) => {
        const testPath = path.join(__dirname, testFile.file);

        if (!fs.existsSync(testPath)) {
            logVerbose(`  [Skip] ${testFile.name}... File not found`);
            return resolve({ passed: 0, failed: 0, total: 0, time: 0 });
        }

        const isLarge = testFile.expected >= STREAM_THRESHOLD || testFile.slow;
        const slowTag = testFile.slow ? ' [SLOW]' : '';
        const largeTag = isLarge ? ` (~${testFile.expected} cases)` : '';

        const t0 = Date.now();
        let output = '';
        let timedOut = false;

        const forceFlush = path.join(__dirname, '_force_flush.js');
        const child = spawn(process.execPath, ['-r', forceFlush, testPath], {
            cwd: __dirname,
            windowsHide: true,
            shell: false,
            windowsVerbatimArguments: false,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, (testFile.timeout || 120) * 1000);

        child.stdout.on('data', (data) => { output += data.toString(); });
        child.stderr.on('data', (data) => { output += data.toString(); });

        child.on('close', (code) => {
            clearTimeout(timer);
            completedCount++;
            const progress = `[${completedCount}/${totalCount}]`;
            const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
            const crashed = code === null || (code !== 0 && code !== 1);

            if (testFile.format === 'coverage') {
                const coverageMatch = output.match(/(?:覆盖率|Coverage):\s*([\d.]+)%/);
                if (coverageMatch) {
                    const coverage = parseFloat(coverageMatch[1]);
                    const passed = coverage >= testFile.expected ? 1 : 0;
                    const failed = coverage < testFile.expected ? 1 : 0;
                    if (passed) {
                        logVerbose(`${progress} [OK] ${testFile.name} (Coverage: ${coverage}%) [${elapsed}s]`);
                    } else {
                        logVerbose(`${progress} [FAIL] ${testFile.name} (Coverage: ${coverage}%, Expected: ${testFile.expected}%) [${elapsed}s]`);
                        failedTests.push({ name: testFile.name, result: `Coverage: ${coverage}%` });
                    }
                    return resolve({ passed, failed, total: 1, time: parseFloat(elapsed) });
                }
            } else if (testFile.format === 'benchmark') {
                const benchMatch = output.match(/(\d+)\s*个性能测试/);
                const benchMatchEn = output.match(/(\d+)\s*performance tests/);
                const passMatch = output.match(/Passed:\s*(\d+)/);
                const failMatch = output.match(/Failed:\s*(\d+)/);
                let benchPassed = benchMatch ? parseInt(benchMatch[1]) : (benchMatchEn ? parseInt(benchMatchEn[1]) : 0);
                let benchFailed = 0;
                if (!benchPassed && passMatch) {
                    benchPassed = parseInt(passMatch[1]);
                    benchFailed = failMatch ? parseInt(failMatch[1]) : 0;
                }
                if (benchFailed > 0) {
                    logVerbose(`${progress} [FAIL] ${testFile.name} (${benchFailed} benchmarks failed) [${elapsed}s]`);
                    failedTests.push({ name: testFile.name, result: `${benchFailed} benchmarks failed` });
                    return resolve({ passed: benchPassed, failed: benchFailed, total: benchPassed + benchFailed, time: parseFloat(elapsed) });
                }
                logVerbose(`${progress} [OK] ${testFile.name} (${benchPassed} benchmarks) [${elapsed}s]`);
                return resolve({ passed: benchPassed, failed: 0, total: benchPassed, time: parseFloat(elapsed) });
            } else if (testFile.format === 'comparison') {
                if (code === 0) {
                    logVerbose(`${progress} [OK] ${testFile.name} (comparison completed) [${elapsed}s]`);
                    return resolve({ passed: 1, failed: 0, total: 1, time: parseFloat(elapsed) });
                } else {
                    logVerbose(`${progress} [FAIL] ${testFile.name} (execution error) [${elapsed}s]`);
                    failedTests.push({ name: testFile.name, result: 'Execution error' });
                    return resolve({ passed: 0, failed: 1, total: 1, time: parseFloat(elapsed) });
                }
            }

            const { passed, failed, total } = parseTestResults(output);

            if (timedOut) {
                logVerbose(`${progress} [FAIL] ${testFile.name} (Timeout) [${elapsed}s]`);
                failedTests.push({ name: testFile.name, result: 'Timeout' });
                return resolve({ passed, failed: failed || testFile.expected, total: total || testFile.expected, time: parseFloat(elapsed) });
            }

            if (crashed && total === 0) {
                logVerbose(`${progress} [FAIL] ${testFile.name} (Crashed, exit: ${code}) [${elapsed}s]`);
                failedTests.push({ name: testFile.name, result: `Crashed (exit: ${code})` });
                return resolve({ passed: 0, failed: testFile.expected, total: testFile.expected, time: parseFloat(elapsed) });
            }

            if (failed > 0) {
                logVerbose(`${progress} [FAIL] ${testFile.name} (${passed}/${total}) [${elapsed}s]`);
                failedTests.push({ name: testFile.name, result: `${passed}/${total}` });
            } else if (total === 0) {
                logVerbose(`${progress} [FAIL] ${testFile.name} (No results parsed) [${elapsed}s]`);
                failedTests.push({ name: testFile.name, result: 'No results parsed' });
            } else {
                const elapsedNum = parseFloat(elapsed);
                const slowWarn = elapsedNum >= SLOW_THRESHOLD ? ' ⚠' : '';
                logVerbose(`${progress} [OK] ${testFile.name} (${passed}/${total}) [${elapsed}s]${slowWarn}`);
            }

            resolve({ passed, failed, total, time: parseFloat(elapsed) });
        });
    });
}

async function runParallel(tests, concurrency) {
    const results = [];
    const queue = [...tests];
    const running = new Set();

    return new Promise((resolveAll) => {
        function next() {
            while (running.size < concurrency && queue.length > 0) {
                const testFile = queue.shift();
                const p = runTestFileAsync(testFile).then(result => {
                    running.delete(p);
                    results.push({ testFile, result });
                    totalPassed += result.passed;
                    totalFailed += result.failed;
                    totalTests += result.total;
                    if (result.time > 0) testTimes.push({ name: testFile.name, time: result.time, slow: !!testFile.slow });
                    next();
                });
                running.add(p);
            }
            if (running.size === 0 && queue.length === 0) {
                resolveAll(results);
            }
        }
        next();
    });
}

async function runSequential(tests) {
    for (const testFile of tests) {
        const result = await runTestFileAsync(testFile);
        totalPassed += result.passed;
        totalFailed += result.failed;
        totalTests += result.total;
        if (result.time > 0) testTimes.push({ name: testFile.name, time: result.time, slow: !!testFile.slow });
    }
}

const activeChildren = [];

process.on('SIGINT', () => {
    for (const child of activeChildren) {
        try { child.kill(); } catch (e) {}
    }
    clearProgress();
    process.exit(130);
});

(async () => {
    if (concurrency > 1) {
        logVerbose(`Running with concurrency: ${concurrency}\n`);
        await runParallel(testFiles, concurrency);
    } else {
        await runSequential(testFiles);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const slowTime = testTimes.filter(t => t.slow).reduce((s, t) => s + t.time, 0);
    const fastTime = (parseFloat(duration) - slowTime).toFixed(2);

    console.log('\n============================================================');
    console.log('                      Test Summary');
    console.log('============================================================\n');
    console.log(`  Mode: ${tierLabels[tier]}`);
    console.log(`  Total tests: ${totalTests}`);
    console.log(`  Passed: ${totalPassed}`);
    console.log(`  Failed: ${totalFailed}`);
    console.log(`  Duration: ${duration}s (functional: ${fastTime}s, slow-perf: ${slowTime.toFixed(2)}s)\n`);

    testTimes.sort((a, b) => b.time - a.time);
    console.log('Top 10 slowest tests:');
    for (let i = 0; i < Math.min(10, testTimes.length); i++) {
        const t = testTimes[i];
        const tag = t.slow ? ' [SLOW]' : '';
        console.log(`  ${i + 1}. ${t.name}: ${t.time.toFixed(2)}s${tag}`);
    }
    console.log('');

    if (failedTests.length > 0) {
        console.log('Failed tests:');
        for (const test of failedTests) {
            console.log(`  - ${test.name}: ${test.result}`);
        }
        console.log('');
    }

    if (totalFailed > 0) {
        console.log(`[FAIL] ${totalFailed} tests failed, please check!`);
        process.exit(1);
    } else {
        console.log('[OK] All tests passed!');
        process.exit(0);
    }
})();
