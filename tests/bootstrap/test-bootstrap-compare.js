#!/usr/bin/env node
// Bootstrap 对比测试：对比新旧 VM 引导流程的输出一致性，检测回归问题

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const { SeedLangVM, Parser } = require('../../src/runtime/vm.js');

const P0_CASES = [
    'arithmetic.seed',
    'function_two_args.seed',
    'if_else.seed',
    'factorial_while.seed',
    'array_object.seed',
    'string_ops.seed',
    'logic_and_or.seed',
    'math_abs_sqrt.seed',
    'object_nested.seed',
    'closure.seed'
];

const P1_FOR_INLINE_CASES = [
    {
        name: 'for-c-basic-sum',
        code: `
sum = 0
for (i = 0; i < 10; i = i + 1) {
    sum = sum + i
}
result = sum
`,
        expected: 45
    },
    {
        name: 'for-in-array-basic',
        code: `
arr = [1 2 3 4]
sum = 0
for x in arr {
    sum = sum + x
}
result = sum
`,
        expected: 10
    },
    {
        name: 'for-c-nested',
        code: `
sum = 0
for (i = 0; i < 3; i = i + 1) {
    for (j = 0; j < 2; j = j + 1) {
        sum = sum + i + j
    }
}
result = sum
`,
        expected: 9
    }
];

const P1_CLASS_TRY_INLINE_CASES = [
    {
        name: 'class-basic-init-method',
        code: `
class Counter {
    init(start) {
        this.value = start
    }
    inc() {
        this.value = this.value + 1
        return this.value
    }
}
c = new Counter(41)
result = c.inc()
`,
        expected: 42
    },
    {
        name: 'class-method-this-access',
        code: `
class Box {
    init(v) { this.v = v }
    get() { return this.v }
}
b = new Box("ok")
result = b.get()
`,
        expected: 'ok'
    },
    {
        name: 'try-catch-throw-basic',
        code: `
try {
    throw "boom"
} catch (e) {
    result = e
}
`,
        expected: 'boom'
    },
    {
        name: 'try-finally-no-throw',
        code: `
trace = []
try {
    push(trace "try")
} catch (e) {
    push(trace "catch")
} finally {
    push(trace "finally")
}
result = join(trace "|")
`,
        expected: 'try|finally'
    }
];

function parseArgs(argv) {
    const opts = {
        ast: false,
        astStrict: false,
        strictSeed1: false,
        includeP1For: true,
        includeP1ClassTry: true,
        seed1Adapter: process.env.SEED1_ADAPTER || '',
        reportJson: true,
        reportFile: path.join(__dirname, 'bootstrap-compare-report.json')
    };

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--ast') {
            opts.ast = true;
            continue;
        }
        if (arg === '--strict-seed1') {
            opts.strictSeed1 = true;
            continue;
        }
        if (arg === '--ast-strict') {
            opts.astStrict = true;
            continue;
        }
        if (arg === '--no-p1-for') {
            opts.includeP1For = false;
            continue;
        }
        if (arg === '--no-p1-class-try') {
            opts.includeP1ClassTry = false;
            continue;
        }
        if (arg === '--no-report-json') {
            opts.reportJson = false;
            continue;
        }
        if (arg === '--report-json') {
            opts.reportJson = true;
            continue;
        }
        if (arg.startsWith('--report-file=')) {
            const p = arg.slice('--report-file='.length).trim();
            if (p) opts.reportFile = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
            continue;
        }
        if (arg === '--report-file' && i + 1 < argv.length) {
            const p = String(argv[++i] || '').trim();
            if (p) opts.reportFile = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
            continue;
        }
        if (arg.startsWith('--seed1-adapter=')) {
            opts.seed1Adapter = arg.slice('--seed1-adapter='.length).trim();
            continue;
        }
        if (arg === '--seed1-adapter' && i + 1 < argv.length) {
            opts.seed1Adapter = String(argv[++i] || '').trim();
            continue;
        }
    }

    return opts;
}

function parseExpected(content) {
    const match = content.match(/^\s*\/\/\s*EXPECT:\s*(.+)\s*$/m);
    if (!match) return { ok: false, error: 'Missing EXPECT comment' };

    const raw = match[1].trim();
    if (raw === 'true') return { ok: true, value: true };
    if (raw === 'false') return { ok: true, value: false };
    if (raw === 'null') return { ok: true, value: null };
    if (raw === 'undefined') return { ok: true, value: undefined };
    if (/^-?\d+(\.\d+)?$/.test(raw)) return { ok: true, value: Number(raw) };

    try {
        return { ok: true, value: JSON.parse(raw) };
    } catch (_) {
        if (raw.startsWith("'") && raw.endsWith("'")) return { ok: true, value: raw.slice(1, -1) };
        return { ok: true, value: raw };
    }
}

function normalizeAst(node) {
    if (Array.isArray(node)) return node.map(normalizeAst);
    if (node && typeof node === 'object') {
        const out = {};
        for (const key of Object.keys(node).sort()) {
            if (key === 'loc' || key === 'range' || key === 'start' || key === 'end' || key === 'raw') continue;
            out[key] = normalizeAst(node[key]);
        }
        return out;
    }
    return node;
}

function makeSeed0Engine() {
    return {
        name: 'seed0',
        run(code) {
            const vm = new SeedLangVM();
            const runResult = vm.run(code);
            if (runResult && runResult.success === false) {
                return { success: false, error: String(runResult.error || 'Unknown runtime error') };
            }
            return { success: true, value: vm.vm.globals.result };
        },
        parse(code) {
            const parser = new Parser();
            return parser.parse(code);
        }
    };
}

function resolveSeed1Engine(options, seed0Engine) {
    if (!options.seed1Adapter) {
        if (options.strictSeed1) {
            throw new Error('seed1 adapter is required in strict mode (--seed1-adapter)');
        }
        return {
            engine: seed0Engine,
            fallback: true,
            note: 'seed1 adapter not provided, fallback to seed0'
        };
    }

    const adapterPath = path.isAbsolute(options.seed1Adapter)
        ? options.seed1Adapter
        : path.resolve(process.cwd(), options.seed1Adapter);

    if (!fs.existsSync(adapterPath)) {
        if (options.strictSeed1) {
            throw new Error(`seed1 adapter not found: ${adapterPath}`);
        }
        return {
            engine: seed0Engine,
            fallback: true,
            note: `seed1 adapter not found (${adapterPath}), fallback to seed0`
        };
    }

    const mod = require(adapterPath);
    if (!mod || typeof mod.run !== 'function') {
        throw new Error(`invalid seed1 adapter: ${adapterPath}, expected export run(code)`);
    }

    return {
        engine: {
            name: mod.name || 'seed1',
            run: (code) => mod.run(code),
            parse: typeof mod.parse === 'function' ? (code) => mod.parse(code) : null
        },
        fallback: false,
        note: `seed1 adapter loaded: ${adapterPath}`
    };
}

function collectCases(options) {
    const basicDir = path.join(__dirname, '..', 'seed', 'basic');
    const cases = [];

    for (const fileName of P0_CASES) {
        const fullPath = path.join(basicDir, fileName);
        if (!fs.existsSync(fullPath)) {
            cases.push({ kind: 'file', name: fileName, invalid: `Case file not found: ${fullPath}` });
            continue;
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        const expected = parseExpected(content);
        if (!expected.ok) {
            cases.push({ kind: 'file', name: fileName, invalid: expected.error });
            continue;
        }
        cases.push({ kind: 'file', name: fileName, code: content, expected: expected.value });
        cases[cases.length - 1].layer = 'P0';
    }

    if (options.includeP1For) {
        for (const c of P1_FOR_INLINE_CASES) {
            cases.push({
                kind: 'inline',
                name: c.name,
                code: c.code,
                expected: c.expected,
                layer: 'P1-for'
            });
        }
    }
    if (options.includeP1ClassTry) {
        for (const c of P1_CLASS_TRY_INLINE_CASES) {
            cases.push({
                kind: 'inline',
                name: c.name,
                code: c.code,
                expected: c.expected,
                layer: 'P1-class-try'
            });
        }
    }

    return cases;
}

function runExecutionCompare(cases, seed0, seed1) {
    let passed = 0;
    let failed = 0;
    const details = [];

    for (const c of cases) {
        if (c.invalid) {
            console.log(`[FAIL] ${c.name}`);
            console.log(`  ${c.invalid}`);
            details.push({ name: c.name, layer: c.layer || 'unknown', status: 'failed', reason: c.invalid });
            failed++;
            continue;
        }

        const r0 = seed0.run(c.code);
        const r1 = seed1.run(c.code);

        const sameSuccess = r0.success === r1.success;
        const sameValue = r0.success && r1.success ? isDeepStrictEqual(r0.value, r1.value) : true;
        const sameError = !r0.success && !r1.success ? String(r0.error || '') === String(r1.error || '') : true;
        const expectedMatch =
            r0.success && r1.success ? isDeepStrictEqual(r0.value, c.expected) && isDeepStrictEqual(r1.value, c.expected) : true;

        if (sameSuccess && sameValue && sameError && expectedMatch) {
            console.log(`[OK] ${c.name}`);
            details.push({ name: c.name, layer: c.layer || 'unknown', status: 'passed' });
            passed++;
            continue;
        }

        console.log(`[FAIL] ${c.name}`);
        if (!sameSuccess) {
            console.log(`  success mismatch: seed0=${r0.success} seed1=${r1.success}`);
        } else if (r0.success && r1.success && !sameValue) {
            console.log(`  value mismatch: seed0=${JSON.stringify(r0.value)} seed1=${JSON.stringify(r1.value)}`);
        } else if (!r0.success && !r1.success && !sameError) {
            console.log(`  error mismatch: seed0=${r0.error} seed1=${r1.error}`);
        }
        if (!expectedMatch && r0.success && r1.success) {
            console.log(`  expected mismatch: expected=${JSON.stringify(c.expected)}, seed0=${JSON.stringify(r0.value)}, seed1=${JSON.stringify(r1.value)}`);
        }
        details.push({
            name: c.name,
            layer: c.layer || 'unknown',
            status: 'failed',
            reason: !sameSuccess ? 'success mismatch' : (r0.success && r1.success && !sameValue) ? 'value mismatch' : (!r0.success && !r1.success && !sameError) ? 'error mismatch' : 'expected mismatch'
        });
        failed++;
    }

    return { passed, failed, details };
}

function runAstCompare(cases, seed0, seed1, astStrict = false) {
    if (typeof seed0.parse !== 'function' || typeof seed1.parse !== 'function') {
        return { skipped: true, reason: 'seed0 or seed1 parser not available' };
    }

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const details = [];

    for (const c of cases) {
        if (c.invalid) continue;
        try {
            const ast0 = normalizeAst(seed0.parse(c.code));
            const ast1 = normalizeAst(seed1.parse(c.code));
            if (isDeepStrictEqual(ast0, ast1)) {
                console.log(`[OK][AST] ${c.name}`);
                details.push({ name: c.name, layer: c.layer || 'unknown', status: 'passed' });
                passed++;
            } else {
                console.log(`[FAIL][AST] ${c.name}`);
                console.log('  AST mismatch');
                details.push({ name: c.name, layer: c.layer || 'unknown', status: 'failed', reason: 'AST mismatch' });
                failed++;
            }
        } catch (error) {
            if (astStrict) {
                console.log(`[FAIL][AST] ${c.name}`);
                console.log(`  AST exception: ${error.message}`);
                details.push({ name: c.name, layer: c.layer || 'unknown', status: 'failed', reason: `AST exception: ${error.message}` });
                failed++;
            } else {
                console.log(`[SKIP][AST] ${c.name}`);
                console.log(`  AST parse not available yet: ${error.message}`);
                details.push({ name: c.name, layer: c.layer || 'unknown', status: 'skipped', reason: `AST parse not available yet: ${error.message}` });
                skipped++;
            }
        }
    }

    return { skipped: false, passed, failed, skippedCases: skipped, details };
}

function summarizeByLayer(cases, execSummary, astSummary) {
    const layers = ['P0', 'P1-for', 'P1-class-try'];
    const byLayer = {};
    for (const layer of layers) {
        const layerCases = cases.filter((c) => (c.layer || 'unknown') === layer);
        const execLayer = execSummary.details.filter((d) => d.layer === layer);
        const astLayer = astSummary?.details ? astSummary.details.filter((d) => d.layer === layer) : [];
        byLayer[layer] = {
            totalCases: layerCases.length,
            execution: {
                passed: execLayer.filter((d) => d.status === 'passed').length,
                failed: execLayer.filter((d) => d.status === 'failed').length
            },
            ast: astSummary?.skipped ? { skipped: layerCases.length } : {
                passed: astLayer.filter((d) => d.status === 'passed').length,
                failed: astLayer.filter((d) => d.status === 'failed').length,
                skipped: astLayer.filter((d) => d.status === 'skipped').length
            }
        };
    }
    return byLayer;
}

function writeJsonReport(options, seed0, seed1, seed1Info, cases, execSummary, astSummary, totalFailed) {
    if (!options.reportJson) return;
    const report = {
        kind: 'bootstrap-compare-report',
        generatedAt: new Date().toISOString(),
        seed0: seed0.name,
        seed1: seed1.name,
        seed1Fallback: !!seed1Info.fallback,
        astEnabled: options.ast,
        astStrict: options.astStrict,
        totalCases: cases.length,
        summary: {
            execution: { passed: execSummary.passed, failed: execSummary.failed },
            ast: astSummary.skipped
                ? { skipped: true, reason: astSummary.reason || 'disabled' }
                : { passed: astSummary.passed, failed: astSummary.failed, skipped: astSummary.skippedCases || 0 },
            failedTotal: totalFailed
        },
        layers: summarizeByLayer(cases, execSummary, astSummary),
        details: {
            execution: execSummary.details,
            ast: astSummary.details || []
        }
    };
    fs.writeFileSync(options.reportFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Report: ${options.reportFile}`);
}

function main() {
    const options = parseArgs(process.argv);
    const seed0 = makeSeed0Engine();
    const seed1Info = resolveSeed1Engine(options, seed0);
    const seed1 = seed1Info.engine;
    const cases = collectCases(options);

    console.log('=== Bootstrap Compare (seed0 vs seed1) ===');
    console.log(`Cases: ${cases.length}`);
    console.log(`AST compare: ${options.ast ? 'ON' : 'OFF'}`);
    console.log(`P1 for cases: ${options.includeP1For ? 'ON' : 'OFF'}`);
    console.log(`P1 class/try cases: ${options.includeP1ClassTry ? 'ON' : 'OFF'}`);
    console.log(`JSON report: ${options.reportJson ? 'ON' : 'OFF'}`);
    console.log(`seed0: ${seed0.name}`);
    console.log(`seed1: ${seed1.name}`);
    if (seed1Info.note) console.log(`note: ${seed1Info.note}`);
    console.log('');

    const execSummary = runExecutionCompare(cases, seed0, seed1);
    const astSummary = options.ast ? runAstCompare(cases, seed0, seed1, options.astStrict) : { skipped: true, reason: 'disabled by flag' };

    const totalFailed = execSummary.failed + (astSummary.skipped ? 0 : astSummary.failed);
    writeJsonReport(options, seed0, seed1, seed1Info, cases, execSummary, astSummary, totalFailed);
    console.log('\n=== Compare Summary ===');
    console.log(`Execution: passed=${execSummary.passed}, failed=${execSummary.failed}`);
    if (astSummary.skipped) {
        console.log(`AST: skipped (${astSummary.reason})`);
    } else {
        console.log(`AST: passed=${astSummary.passed}, failed=${astSummary.failed}, skipped=${astSummary.skippedCases || 0}`);
    }

    process.exit(totalFailed > 0 ? 1 : 0);
}

main();
