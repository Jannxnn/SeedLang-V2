#!/usr/bin/env node
// Seed 文件批量运行器：扫描 tests/seed/ 下所有 .seed 文件，逐一通过 VM 执行并汇总结果

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const { SeedLangVM } = require('../../src/runtime/vm.js');

function globToRegExp(globPattern) {
    const escaped = globPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexSource = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(regexSource);
}

function parseCliArgs(argv) {
    const includePatterns = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--include') {
            const next = argv[i + 1];
            if (!next || next.startsWith('--')) {
                throw new Error('Missing value for --include');
            }
            includePatterns.push(...next.split(',').map(s => s.trim()).filter(Boolean));
            i++;
            continue;
        }
        if (arg.startsWith('--include=')) {
            const raw = arg.slice('--include='.length);
            includePatterns.push(...raw.split(',').map(s => s.trim()).filter(Boolean));
            continue;
        }
    }
    return {
        includePatterns
    };
}

function normalizeForMatch(p) {
    return p.replace(/\\/g, '/');
}

function filterCasesByInclude(cases, includePatterns, testsRootDir) {
    if (!Array.isArray(includePatterns) || includePatterns.length === 0) {
        return cases;
    }
    const regexes = includePatterns.map(globToRegExp);
    return cases.filter((fullPath) => {
        const relFromTests = normalizeForMatch(path.relative(testsRootDir, fullPath));
        const relFromSeed = normalizeForMatch(path.relative(path.join(testsRootDir, 'seed'), fullPath));
        const baseName = path.basename(fullPath);
        for (const re of regexes) {
            if (re.test(relFromTests) || re.test(relFromSeed) || re.test(baseName)) {
                return true;
            }
        }
        return false;
    });
}

function collectSeedFiles(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectSeedFiles(fullPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.seed')) {
            files.push(fullPath);
        }
    }
    return files.sort();
}

function parseExpected(content) {
    const match = content.match(/^\s*\/\/\s*EXPECT:\s*(.+)\s*$/m);
    if (!match) {
        return { ok: false, error: 'Missing EXPECT comment, e.g. // EXPECT: 3' };
    }

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

function runCase(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const expected = parseExpected(content);
    if (!expected.ok) {
        return { pass: false, message: expected.error };
    }

    const vm = new SeedLangVM({ maxInstructions: 10000000 });
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
    const rootDir = __dirname;
    const testsRootDir = path.join(__dirname, '..');
    let args;
    try {
        args = parseCliArgs(process.argv.slice(2));
    } catch (e) {
        console.error(`[ARG ERROR] ${e.message}`);
        console.error('Usage: node tests/seed/test-seed-runner.js [--include <glob>[,<glob>...]]');
        process.exit(1);
    }
    const allCases = collectSeedFiles(rootDir);
    const cases = filterCasesByInclude(allCases, args.includePatterns, testsRootDir);
    let passed = 0;
    let failed = 0;

    console.log('=== Seed File Runner Tests ===\n');
    if (args.includePatterns.length > 0) {
        console.log(`[FILTER] include=${args.includePatterns.join(', ')}`);
        console.log(`[FILTER] selected=${cases.length}/${allCases.length}\n`);
    }

    if (cases.length === 0) {
        console.log('No .seed test files found (after filter).');
        console.log('\nPassed: 0');
        console.log('Failed: 1');
        process.exit(1);
    }

    for (const testFile of cases) {
        const relativePath = path.relative(testsRootDir, testFile);
        process.stdout.write(`[RUN] ${relativePath}\n`);
        const result = runCase(testFile);
        if (result.pass) {
            process.stdout.write(`[OK] ${relativePath}\n`);
            passed++;
        } else {
            process.stdout.write(`[FAIL] ${relativePath}\n`);
            process.stdout.write(`  ${result.message}\n`);
            failed++;
        }
    }

    console.log('\n==============================');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

main();
