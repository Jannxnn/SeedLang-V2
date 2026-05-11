// 端到端集成测试：模拟完整用户工作流（源码解析→编译→执行→输出），验证全链路正确性

const { SeedLangVM } = require('../../src/runtime/vm.js');
const fs = require('fs');
const path = require('path');

console.log('=== End-to-End Tests (E2E) ===\n');

let passed = 0;
let failed = 0;

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

console.log('--- Basic Execution Tests ---');

test('Execute simple expression', () => {
    const vm = new SeedLangVM();
    const result = vm.run('result = 1 + 2 * 3');
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 7);
});

test('Execute multi-line code', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
x = 10
y = 20
result = x + y
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 30);
});

test('Execute function definition and call', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
fn factorial(n) {
    if n <= 1 { return 1 }
    return n * factorial(n - 1)
}
result = factorial(5)
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 120);
});

console.log('\n--- Output Tests ---');

test('print output', () => {
    const vm = new SeedLangVM();
    const result = vm.run('print("Hello World!")');
    assertEqual(result.success, true);
    assertEqual(result.output.length, 1);
    assertEqual(result.output[0], 'Hello World!');
});

test('Multiple print output', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
print("Line 1")
print("Line 2")
print("Line 3")
`);
    assertEqual(result.success, true);
    assertEqual(result.output.length, 3);
    assertEqual(result.output[0], 'Line 1');
    assertEqual(result.output[1], 'Line 2');
    assertEqual(result.output[2], 'Line 3');
});

test('print expression result', () => {
    const vm = new SeedLangVM();
    const result = vm.run('print(1 + 2 + 3)');
    assertEqual(result.success, true);
    assertEqual(result.output[0], '6');
});

console.log('\n--- Error Handling Tests ---');

test('Syntax error capture', () => {
    const vm = new SeedLangVM();
    const result = vm.run('fn { }');
    assertEqual(result.success, false);
    assertEqual(result.error !== null, true);
});

test('Runtime error capture', () => {
    const vm = new SeedLangVM();
    const result = vm.run('x = 1 / 0');
    assertEqual(result.success, false);
    assertEqual(result.error !== null, true);
});

test('throw statement capture', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
try {
    throw "custom error"
} catch(e) {
    result = e
}
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, "custom error");
});

test('Undefined variable error (strict mode)', () => {
    const vm = new SeedLangVM({ strict: true });
    const result = vm.run('result = undefinedVar');
    assertEqual(result.success, false);
    assertEqual(String(result.error).includes('Undefined variable'), true);
});

test('Type error (strict mode)', () => {
    const vm = new SeedLangVM({ strict: true });
    const result = vm.run('result = 1 + "hello"');
    assertEqual(result.success, false);
    assertEqual(String(result.error).includes('TypeError') || String(result.error).toLowerCase().includes('cannot'), true);
});

console.log('\n--- Complex Scenario Tests ---');

test('Quick sort algorithm', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
fn quicksort(arr) {
    if len(arr) <= 1 { return arr }
    pivot = arr[0]
    left = []
    right = []
    i = 1
    while i < len(arr) {
        if arr[i] < pivot { push(left arr[i]) }
        else { push(right arr[i]) }
        i = i + 1
    }
    return concat(quicksort(left) [pivot] quicksort(right))
}
result = quicksort([5 3 8 1 9 2 7 4 6])
`);
    assertEqual(result.success, true);
});

console.log('\n=== E2E Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
