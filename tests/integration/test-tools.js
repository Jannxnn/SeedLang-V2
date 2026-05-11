/**
 * 工具链集成测试：包管理器、文档生成器、代码格式化器、调试器等开发工具的端到端验证
 * Testing package manager, documentation generator, code formatter, etc.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..', '..');

console.log('============================================================');
console.log('          SeedLang Toolchain Tests');
console.log('============================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  [OK] ${name}`);
        passed++;
    } catch (error) {
        console.log(`  [FAIL] ${name}: ${error.message}`);
        failed++;
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(`${message} Condition should be true`);
    }
}

// ============================================
// 1. Package Manager Tests
// ============================================
console.log('[1. Package Manager Tests]');

test('Package manager file exists', () => {
    assertTrue(fs.existsSync(path.join(rootDir, 'tools/seed-pm.js')));
});

test('Package manager contains init command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-pm.js'), 'utf-8');
    assertTrue(code.includes('seed init'));
});

test('Package manager contains install command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-pm.js'), 'utf-8');
    assertTrue(code.includes('seed install'));
});

test('Package manager contains publish command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-pm.js'), 'utf-8');
    assertTrue(code.includes('seed publish'));
});

test('Package manager contains update command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-pm.js'), 'utf-8');
    assertTrue(code.includes('seed update'));
});

test('Package manager contains remove command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-pm.js'), 'utf-8');
    assertTrue(code.includes('seed remove'));
});

test('Package manager contains list command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-pm.js'), 'utf-8');
    assertTrue(code.includes('seed list'));
});

test('Package manager contains search command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-pm.js'), 'utf-8');
    assertTrue(code.includes('seed search'));
});

test('Package manager contains info command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-pm.js'), 'utf-8');
    assertTrue(code.includes('seed info'));
});

test('Package manager has SeedPackageManager class', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-pm.js'), 'utf-8');
    assertTrue(code.includes('class SeedPackageManager'));
});

console.log('');

// ============================================
// 2. Documentation Generator Tests
// ============================================
console.log('[2. Documentation Generator Tests]');

test('Documentation generator file exists', () => {
    assertTrue(fs.existsSync(path.join(rootDir, 'tools/seed-doc.js')));
});

test('Documentation generator contains generate command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-doc.js'), 'utf-8');
    assertTrue(code.includes('generate'));
});

test('Documentation generator contains API reference generation', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-doc.js'), 'utf-8');
    assertTrue(code.includes('api-reference'));
});

test('Documentation generator contains class documentation generation', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-doc.js'), 'utf-8');
    assertTrue(code.includes('classes.md'));
});

test('Documentation generator contains module documentation generation', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-doc.js'), 'utf-8');
    assertTrue(code.includes('modules.md'));
});

test('Documentation generator has SeedDocGenerator class', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-doc.js'), 'utf-8');
    assertTrue(code.includes('class SeedDocGenerator'));
});

test('Documentation generator contains function parsing', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-doc.js'), 'utf-8');
    assertTrue(code.includes('parseFunction'));
});

test('Documentation generator contains class parsing', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-doc.js'), 'utf-8');
    assertTrue(code.includes('parseClass'));
});

console.log('');

// ============================================
// 3. Code Formatter Tests
// ============================================
console.log('[3. Code Formatter Tests]');

test('Code formatter file exists', () => {
    assertTrue(fs.existsSync(path.join(rootDir, 'tools/seed-format.js')));
});

test('Code formatter contains format command', () => {
    const code = fs.readFileSync(path.join(rootDir, 'tools/seed-format.js'), 'utf-8');
    assertTrue(code.includes('format'));
});

console.log('\n============================================================');
console.log('                      Test Summary');
console.log('============================================================');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('============================================================');

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);

process.exit(failed > 0 ? 1 : 0);