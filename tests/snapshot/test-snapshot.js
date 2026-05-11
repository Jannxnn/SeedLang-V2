// 快照回归测试：将 SeedLang 执行输出与预存 JSON 快照对比，检测输出格式/语义的回归变化

const { SeedLangVM } = require('../../src/runtime/vm.js');
const fs = require('fs');
const path = require('path');

console.log('=== Snapshot Tests ===\n');

let passed = 0;
let failed = 0;

const snapshotDir = path.join(__dirname, 'snapshots');
if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
}

function test(name, fn) {
    try {
        fn();
        console.log(`[OK] ${name}`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, msg = '') {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${msg} Expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`);
    }
}

function createSnapshot(name, code) {
    const vm = new SeedLangVM();
    const result = vm.run(code);
    const snapshot = {
        name,
        code,
        output: result.output,
        globals: {},
        timestamp: new Date().toISOString()
    };
    
    const globalKeys = ['result', 'data', 'value', 'output', 'items', 'config'];
    for (const key of globalKeys) {
        if (vm.vm.globals[key] !== undefined) {
            const val = vm.vm.globals[key];
            if (typeof val !== 'function' && typeof val !== 'object') {
                snapshot.globals[key] = val;
            } else if (typeof val === 'object' && val !== null && !Array.isArray(val) && val._type !== 'module') {
                try {
                    snapshot.globals[key] = JSON.parse(JSON.stringify(val));
                } catch (e) {
                    snapshot.globals[key] = '[complex object]';
                }
            } else if (Array.isArray(val)) {
                snapshot.globals[key] = val;
            }
        }
    }
    
    return snapshot;
}

function saveSnapshot(snapshot) {
    const filename = snapshot.name.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
    const filepath = path.join(snapshotDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
    return filepath;
}

function loadSnapshot(name) {
    const filename = name.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
    const filepath = path.join(snapshotDir, filename);
    if (fs.existsSync(filepath)) {
        return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
    return null;
}

function compareSnapshots(current, saved) {
    if (!saved) return { match: false, reason: 'No saved snapshot found' };
    
    if (JSON.stringify(current.output) !== JSON.stringify(saved.output)) {
        return { match: false, reason: 'Output mismatch' };
    }
    
    const currentGlobals = JSON.stringify(current.globals);
    const savedGlobals = JSON.stringify(saved.globals);
    if (currentGlobals !== savedGlobals) {
        return { match: false, reason: 'Globals mismatch' };
    }
    
    return { match: true };
}

console.log('--- Basic Output Snapshot Tests ---');

test('print output snapshot', () => {
    const name = 'print_output';
    const code = `
print("Hello, World!")
print("Line 2")
print("Line 3")
`;
    const current = createSnapshot(name, code);
    const saved = loadSnapshot(name);
    
    if (!saved) {
        saveSnapshot(current);
        console.log('  (First run, snapshot created)');
        return;
    }
    
    const comparison = compareSnapshots(current, saved);
    assertEqual(comparison.match, true, comparison.reason);
});

test('Math operations snapshot', () => {
    const name = 'math_operations';
    const code = `
result = 0
i = 1
while i <= 10 {
    result = result + i
    i = i + 1
}
print("Sum: " + result)
`;
    const current = createSnapshot(name, code);
    const saved = loadSnapshot(name);
    
    if (!saved) {
        saveSnapshot(current);
        console.log('  (First run, snapshot created)');
        return;
    }
    
    const comparison = compareSnapshots(current, saved);
    assertEqual(comparison.match, true, comparison.reason);
});

test('String processing snapshot', () => {
    const name = 'string_processing';
    const code = `
text = "Hello, World!"
result = upper(text)
print(result)
result = lower(text)
print(result)
result = trim("  spaces  ")
print(result)
`;
    const current = createSnapshot(name, code);
    const saved = loadSnapshot(name);
    
    if (!saved) {
        saveSnapshot(current);
        console.log('  (First run, snapshot created)');
        return;
    }
    
    const comparison = compareSnapshots(current, saved);
    assertEqual(comparison.match, true, comparison.reason);
});

console.log('\n=== Snapshot Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
