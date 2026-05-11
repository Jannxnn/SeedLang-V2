/**
 * 综合功能测试：覆盖 SeedLang 全部语法特性、JavaScript 兼容性及高级功能
 * Tests SeedLang syntax, JavaScript compatibility, and all features
 */

const { SeedLangVM } = require('../../src/runtime/vm.js');

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

function assertEqual(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(`${msg} Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
    }
}

function assertContains(str, substr) {
    if (!String(str).includes(substr)) {
        throw new Error(`Expected "${substr}" in "${str}"`);
    }
}

console.log('========================================');
console.log('  SeedLang Comprehensive Test Suite');
console.log('========================================\n');

// ============================================
// 1. Basic Syntax Tests
// ============================================
console.log('[1. Basic Syntax]');

test('Variable Assignment', () => {
    const vm = new SeedLangVM();
    const r = vm.run('x = 10; y = x + 5');
    assertEqual(r.success, true);
});

test('String Operations', () => {
    const vm = new SeedLangVM();
    const r = vm.run('s = "hello"; print(upper(s))');
    assertEqual(r.output[0], 'HELLO');
});

test('String Concatenation', () => {
    const vm = new SeedLangVM();
    const r = vm.run('a = "Hello"; b = "World"; print(a + " " + b)');
    assertEqual(r.output[0], 'Hello World');
});

// ============================================
// 2. Data Types Tests
// ============================================
console.log('\n[2. Data Types]');

test('Numbers', () => {
    const vm = new SeedLangVM();
    const r = vm.run('a = 42; b = 3.14; print(a + b)');
    assertContains(r.output[0], '45.14');
});

test('Booleans', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(true and false); print(true or false)');
    assertEqual(r.output[0], 'false');
    assertEqual(r.output[1], 'true');
});

test('Null Value', () => {
    const vm = new SeedLangVM();
    const r = vm.run('a = null; print(a)');
    assertEqual(r.output[0], 'null');
});

test('Arrays', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = [1 2 3 4 5]; print(arr[0]); print(arr[4])');
    assertEqual(r.output[0], '1');
    assertEqual(r.output[1], '5');
});

test('Objects', () => {
    const vm = new SeedLangVM();
    const r = vm.run('obj = {name: "test" value: 42}; print(obj.name); print(obj.value)');
    assertEqual(r.output[0], 'test');
    assertEqual(r.output[1], '42');
});

// ============================================
// 3. Operators Tests
// ============================================
console.log('\n[3. Operators]');

test('Arithmetic Operators', () => {
    const vm = new SeedLangVM();
    const r = vm.run('a = 10 + 5; b = 10 - 5; c = 10 * 5; d = 10 / 5; print(a); print(b); print(c); print(d)');
    assertEqual(r.output[0], '15');
    assertEqual(r.output[1], '5');
    assertEqual(r.output[2], '50');
    assertEqual(r.output[3], '2');
});

test('Modulo Operator', () => {
    const vm = new SeedLangVM();
    const r = vm.run('a = 10 % 3; print(a)');
    assertEqual(r.output[0], '1');
});

test('Comparison Operators', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(5 > 3); print(5 < 3); print(5 == 5)');
    assertEqual(r.output[0], 'true');
    assertEqual(r.output[1], 'false');
    assertEqual(r.output[2], 'true');
});

test('Logical Operators', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(true and false); print(true or false); print(not true)');
    assertEqual(r.output[0], 'false');
    assertEqual(r.output[1], 'true');
    assertEqual(r.output[2], 'false');
});

// ============================================
// 4. Control Flow Tests
// ============================================
console.log('\n[4. Control Flow]');

test('If Statement', () => {
    const vm = new SeedLangVM();
    const r = vm.run('x = 10; if x > 5 { print("big") } else { print("small") }');
    assertEqual(r.output[0], 'big');
});

test('While Loop', () => {
    const vm = new SeedLangVM();
    const r = vm.run('i = 0; while i < 3 { print(i); i = i + 1 }');
    assertEqual(r.output.length, 3);
});

test('For-In Loop', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = [10 20 30]; for x in arr { print(x) }');
    assertEqual(r.output.length, 3);
});

test('Break Statement', () => {
    const vm = new SeedLangVM();
    const r = vm.run('i = 0; while true { print(i); i = i + 1; if i >= 3 { break } }');
    assertEqual(r.output.length, 3);
});

// ============================================
// 5. Functions Tests
// ============================================
console.log('\n[5. Functions]');

test('Function Definition', () => {
    const vm = new SeedLangVM();
    const r = vm.run('fn add(a b) { return a + b } print(add(3 4))');
    assertEqual(r.output[0], '7');
});

test('Recursive Function', () => {
    const vm = new SeedLangVM();
    const r = vm.run('fn fib(n) { if n <= 1 { return n } return fib(n-1) + fib(n-2) } print(fib(10))');
    assertEqual(r.output[0], '55');
});

test('Higher Order Functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('fn apply(f x) { return f(x) } fn double(n) { return n * 2 } print(apply(double 5))');
    assertEqual(r.output[0], '10');
});

// ============================================
// 6. Built-in Functions Tests
// ============================================
console.log('\n[6. Built-in Functions]');

test('Math Functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(abs(-5)); print(floor(3.7)); print(ceil(3.2))');
    assertEqual(r.output[0], '5');
    assertEqual(r.output[1], '3');
    assertEqual(r.output[2], '4');
});

test('Array Functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = [3 1 4 1 5]; print(len(arr)); push(arr 9); print(len(arr))');
    assertEqual(r.output[0], '5');
    assertEqual(r.output[1], '6');
});

test('Reduce Argument Order', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
arr = [1 2 3 4]
a = reduce(arr 0 (acc x) => acc + x)
print(type(a))
print(a)
`);
    assertEqual(r.output[0], 'number');
    assertEqual(r.output[1], '10');
});

test('Reduce Legacy Order Accepted', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = [1 2 3 4]; a = reduce(arr (acc x) => acc + x 0); print(a)');
    assertEqual(r.success, true);
    assertEqual(r.output[0], '10');
});

test('String Functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('s = "hello world"; parts = split(s " "); print(parts[0])');
    assertEqual(r.output[0], 'hello');
});

test('Type Functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(type(42)); print(type("hello"))');
    assertEqual(r.output[0], 'number');
    assertEqual(r.output[1], 'string');
});

// ============================================
// 7. Error Handling Tests
// ============================================
console.log('\n[7. Error Handling]');

test('Try-Finally', () => {
    const vm = new SeedLangVM();
    const r = vm.run('result = ""; try { result = result + "try" } finally { result = result + "finally" } print(result)');
    assertEqual(r.output[0], 'tryfinally');
});

// ============================================
// 8. JavaScript Compatibility Tests
// ============================================
console.log('\n[8. JavaScript Compatibility]');

test('JS Object Access', () => {
    const vm = new SeedLangVM();
    const r = vm.run('obj = {a: 1 b: 2}; print(obj["a"]); print(obj.b)');
    assertEqual(r.output[0], '1');
    assertEqual(r.output[1], '2');
});

test('JSON Operations', () => {
    const vm = new SeedLangVM();
    const r = vm.run('obj = {a: 1 b: 2}; json = stringify(obj); print(json)');
    assertContains(r.output[0], 'a');
});

test('Array Concatenation', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr1 = [1 2]; arr2 = [3 4]; combined = arr1 + arr2; print(len(combined))');
    assertEqual(r.output[0], '4');
});

// ============================================
// Summary
// ============================================
console.log('\n========================================');
console.log('           Test Summary');
console.log('========================================');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log('========================================');

if (failed > 0) {
    console.log('\nFailed Tests:');
    errors.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.name}: ${e.error}`);
    });
    process.exit(1);
} else {
    console.log('\n[SUCCESS] All tests passed!');
    process.exit(0);
}
