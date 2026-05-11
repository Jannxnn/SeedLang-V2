#!/usr/bin/env node
// Bootstrap 冒烟测试：验证 VM 引导流程（字节码缓存/JIT 缓存/全局初始化）的基本正确性

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const { SeedLangVM } = require('../../src/runtime/vm.js');

const CASES = [
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
        if (raw.startsWith("'") && raw.endsWith("'")) {
            return { ok: true, value: raw.slice(1, -1) };
        }
        return { ok: true, value: raw };
    }
}

function runCase(seedPath) {
    const content = fs.readFileSync(seedPath, 'utf8');
    const expected = parseExpected(content);
    if (!expected.ok) return { pass: false, message: expected.error };

    const vm = new SeedLangVM();
    try {
        const runResult = vm.run(content);
        if (runResult && runResult.success === false) {
            return { pass: false, message: `Runtime error: ${runResult.error}` };
        }
        const actual = vm.vm.globals.result;
        if (!isDeepStrictEqual(actual, expected.value)) {
            return {
                pass: false,
                message: `Expected ${JSON.stringify(expected.value)}, got ${JSON.stringify(actual)}`
            };
        }
        return { pass: true };
    } catch (error) {
        return { pass: false, message: `Exception: ${error.message}` };
    }
}

function main() {
    const basicDir = path.join(__dirname, '..', 'seed', 'basic');
    let passed = 0;
    let failed = 0;

    console.log('=== Bootstrap P0 Smoke ===');
    console.log(`Cases: ${CASES.length}\n`);

    for (const name of CASES) {
        const fullPath = path.join(basicDir, name);
        if (!fs.existsSync(fullPath)) {
            console.log(`[FAIL] ${name}`);
            console.log('  Case file not found');
            failed++;
            continue;
        }

        const result = runCase(fullPath);
        if (result.pass) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}`);
            console.log(`  ${result.message}`);
            failed++;
        }
    }

    console.log('\n===========================');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

main();
