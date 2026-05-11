/**
 * Token 计数器测试：验证 SeedLang 源码 token 计数的准确性，用于 AI 辅助编程时的 token 预估
 */

const assert = require('assert');
const { TokenCounter } = require('../../src/token-counter');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        errors.push({ name, error: e.message });
        failed++;
    }
}

console.log('\n=== Token Counting Basic Tests ===\n');

test('Token count - simple expression', () => {
    const counter = new TokenCounter();
    const result = counter.countTokens('x = 1 + 2', 'seedlang');
    assert.ok(result.tokens > 0, 'Should have tokens');
    assert.ok(result.breakdown, 'Should have breakdown');
});

test('Token count - function definition', () => {
    const counter = new TokenCounter();
    const code = 'fn add(a b) { return a + b }';
    const result = counter.countTokens(code, 'seedlang');
    assert.ok(result.tokens > 5, 'Function definition should have multiple tokens');
    assert.ok(result.breakdown.keywords > 0, 'Should have keywords');
});

test('Token count - class definition', () => {
    const counter = new TokenCounter();
    const code = 'class Point { fn new(x y) { self.x = x } }';
    const result = counter.countTokens(code, 'seedlang');
    assert.ok(result.tokens > 10, 'Class definition should have multiple tokens');
});

test('Token count - string', () => {
    const counter = new TokenCounter();
    const code = 'let s = "hello world"';
    const result = counter.countTokens(code, 'seedlang');
    assert.ok(result.breakdown.strings > 0, 'Should have string tokens');
});

test('Token count - numbers', () => {
    const counter = new TokenCounter();
    const code = 'let x = 42 let y = 3.14';
    const result = counter.countTokens(code, 'seedlang');
    assert.ok(result.breakdown.literals > 0, 'Should have number tokens');
});

console.log('\n=== Multi-language Comparison Tests ===\n');

test('Comparison - SeedLang vs JavaScript', () => {
    const counter = new TokenCounter();
    const seedlangCode = 'fn add(a b) { return a + b }';
    const jsCode = 'function add(a b) { return a + b; }';
    
    const result = counter.compare(seedlangCode, jsCode, 'javascript');
    
    assert.ok(result.seedlang.tokens > 0, 'SeedLang should have tokens');
    assert.ok(result.other.tokens > 0, 'JavaScript should have tokens');
    assert.ok(result.savings.percentage !== undefined, 'Should have savings percentage');
});

test('Comparison - SeedLang vs Python', () => {
    const counter = new TokenCounter();
    const seedlangCode = 'fn greet(name) { print("Hello " + name) }';
    const pythonCode = 'def greet(name):\n    print("Hello " + name)';
    
    const result = counter.compare(seedlangCode, pythonCode, 'python');
    
    assert.ok(result.seedlang.tokens > 0, 'SeedLang should have tokens');
    assert.ok(result.other.tokens > 0, 'Python should have tokens');
});

test('Comparison - SeedLang vs TypeScript', () => {
    const counter = new TokenCounter();
    const seedlangCode = 'fn add(a b) { return a + b }';
    const tsCode = 'function add(a: number, b: number): number { return a + b; }';
    
    const result = counter.compare(seedlangCode, tsCode, 'typescript');
    
    assert.ok(result.savings.tokens !== undefined, 'Should have savings statistics');
});

test('Comparison - SeedLang vs Java', () => {
    const counter = new TokenCounter();
    const seedlangCode = 'fn add(a b) { return a + b }';
    const javaCode = 'public int add(int a int b) { return a + b; }';
    
    const result = counter.compare(seedlangCode, javaCode, 'java');
    
    assert.ok(result.savings.tokens !== undefined, 'Should have savings statistics');
});

test('Comparison - SeedLang vs C++', () => {
    const counter = new TokenCounter();
    const seedlangCode = 'fn add(a b) { return a + b }';
    const cppCode = 'int add(int a int b) { return a + b; }';
    
    const result = counter.compare(seedlangCode, cppCode, 'cpp');
    
    assert.ok(result.savings.tokens !== undefined, 'Should have savings statistics');
});

test('Comparison - SeedLang vs Rust', () => {
    const counter = new TokenCounter();
    const seedlangCode = 'fn add(a b) { return a + b }';
    const rustCode = 'fn add(a: i32, b: i32) -> i32 { a + b }';
    
    const result = counter.compare(seedlangCode, rustCode, 'rust');
    
    assert.ok(result.savings.tokens !== undefined, 'Should have savings statistics');
});

console.log('\n=== Multi-language Batch Comparison Tests ===\n');

test('Batch comparison - all languages', () => {
    const counter = new TokenCounter();
    const seedlangCode = 'fn factorial(n) { if n <= 1 { return 1 } return n * factorial(n - 1) }';
    
    const codeMap = {
        javascript: 'function factorial(n) { if (n <= 1) { return 1; } return n * factorial(n - 1); }',
        python: 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)',
        typescript: 'function factorial(n: number): number { if (n <= 1) { return 1; } return n * factorial(n - 1); }',
        java: 'public int factorial(int n) { if (n <= 1) { return 1; } return n * factorial(n - 1); }',
        cpp: 'int factorial(int n) { if (n <= 1) { return 1; } return n * factorial(n - 1); }',
        rust: 'fn factorial(n: i32) -> i32 { if n <= 1 { return 1; } n * factorial(n - 1) }'
    };
    
    const result = counter.compareAll(seedlangCode, codeMap);
    
    assert.ok(result.seedlang.tokens > 0, 'SeedLang should have tokens');
    assert.ok(Object.keys(result.comparisons).length === 6, 'Should have 6 language comparisons');
    assert.ok(result.summary, 'Should have summary');
});

console.log('\n=== Code Analysis Tests ===\n');

test('Code analysis - token density', () => {
    const counter = new TokenCounter();
    const code = 'fn add(a b) { return a + b }\nfn sub(a b) { return a - b }';
    
    const analysis = counter.analyzeCodePatterns(code, 'seedlang');
    
    assert.ok(analysis.density, 'Should have density analysis');
    assert.ok(analysis.density.tokensPerLine > 0, 'Tokens per line should be greater than 0');
});

test('Code analysis - boilerplate recognition', () => {
    const counter = new TokenCounter();
    const code = 'public class Main { public static void main(String[] args) { System.out.println("Hello"); } }';
    
    const analysis = counter.analyzeCodePatterns(code, 'java');
    
    assert.ok(analysis.boilerplate, 'Should have boilerplate analysis');
    assert.ok(Array.isArray(analysis.boilerplate), 'Boilerplate should be an array');
});

test('Code analysis - optimization suggestions', () => {
    const counter = new TokenCounter();
    const code = 'function test() { return 1 + 2 + 3 + 4 + 5; }';
    
    const analysis = counter.analyzeCodePatterns(code, 'javascript');
    
    assert.ok(analysis.suggestions, 'Should have optimization suggestions');
    assert.ok(Array.isArray(analysis.suggestions), 'Suggestions should be an array');
});

console.log('\n=== Report Generation Tests ===\n');

test('Report generation - text format', () => {
    const counter = new TokenCounter();
    const seedlangCode = 'fn add(a b) { return a + b }';
    
    const comparisons = {
        javascript: 'function add(a b) { return a + b; }',
        python: 'def add(a b):\n    return a + b'
    };
    
    const report = counter.generateReport(seedlangCode, comparisons);
    const formatted = counter.formatReport(report, 'text');
    
    assert.ok(formatted.includes('TOKEN') || formatted.includes('Token'), 'Report should contain Token');
    assert.ok(formatted.includes('SeedLang'), 'Report should contain SeedLang');
});

test('Report generation - Markdown format', () => {
    const counter = new TokenCounter();
    const seedlangCode = 'fn add(a b) { return a + b }';
    
    const comparisons = {
        javascript: 'function add(a b) { return a + b; }'
    };
    
    const report = counter.generateReport(seedlangCode, comparisons);
    const formatted = counter.formatReport(report, 'markdown');
    
    assert.ok(formatted.includes('#') || formatted.includes('|'), 'Markdown should have headers or tables');
});

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    console.log('\nFailed tests:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
}

process.exit(failed > 0 ? 1 : 0);
