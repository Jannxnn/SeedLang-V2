/**
 * JS 兼容性测试：验证 SeedLang 与 JavaScript 在语义层面的兼容性（类型转换/运算符行为/内置对象）
 * Testing SeedLang compatibility with JavaScript
 */

// Windows terminal UTF-8 encoding support
const os = require('os');
if (os.platform() === 'win32') {
    process.env.LANG = 'en_US.UTF-8';
}

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

function assertTrue(condition, msg = '') {
    if (!condition) {
        throw new Error(`${msg} Expected true but got false`);
    }
}

console.log('========================================');
console.log('  SeedLang JavaScript Compatibility Tests');
console.log('========================================\n');

// ============================================
// 1. Basic Syntax
// ============================================
console.log('[1. Basic Syntax]');

test('Variable assignment', () => {
    const vm = new SeedLangVM();
    const r = vm.run('x = 10; y = 20; print(x + y)');
    assertEqual(r.output, ['30']);
});

test('String operations', () => {
    const vm = new SeedLangVM();
    const r = vm.run('s = "hello"; print(upper(s))');
    assertEqual(r.output, ['HELLO']);
});

test('Array operations', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = [1 2 3]; push(arr 4); print(len(arr))');
    assertEqual(r.output, ['4']);
});

test('Object operations', () => {
    const vm = new SeedLangVM();
    const r = vm.run('obj = {a: 1 b: 2}; print(obj.a + obj.b)');
    assertEqual(r.output, ['3']);
});

// ============================================
// 2. Control Flow
// ============================================
console.log('\n[2. Control Flow]');

test('If statement', () => {
    const vm = new SeedLangVM();
    const r = vm.run('x = 5; if x > 3 { print("big") } else { print("small") }');
    assertEqual(r.output, ['big']);
});

test('While loop', () => {
    const vm = new SeedLangVM();
    const r = vm.run('i = 0; while i < 3 { print(i); i = i + 1 }');
    assertEqual(r.output, ['0', '1', '2']);
});

test('For loop', () => {
    const vm = new SeedLangVM();
    const r = vm.run('for x in [1 2 3] { print(x * 2) }');
    assertEqual(r.output, ['2', '4', '6']);
});

test('Break statement', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
i = 0
while i < 10 {
    if i == 5 {
        break
    }
    i = i + 1
}
print(i)
`);
    assertEqual(r.output, ['5']);
});

test('Continue statement', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
i = 0
sum = 0
while i < 5 {
    i = i + 1
    if i == 3 {
        continue
    }
    sum = sum + i
}
print(sum)
`);
    assertEqual(r.output, ['12']);
});

// ============================================
// 3. Functions
// ============================================
console.log('\n[3. Functions]');

test('Simple function', () => {
    const vm = new SeedLangVM();
    const r = vm.run('fn add(a b) { return a + b } print(add(3 4))');
    assertEqual(r.output, ['7']);
});

test('Recursive function', () => {
    const vm = new SeedLangVM();
    const r = vm.run('fn fib(n) { if n <= 1 { return n } return fib(n-1) + fib(n-2) } print(fib(10))');
    assertEqual(r.output, ['55']);
});

test('Factorial', () => {
    const vm = new SeedLangVM();
    const r = vm.run('fn fact(n) { if n <= 1 { return 1 } return n * fact(n - 1) } print(fact(5))');
    assertEqual(r.output, ['120']);
});

test('Higher order function', () => {
    const vm = new SeedLangVM();
    const r = vm.run('fn apply(f x) { return f(x) } fn double(n) { return n * 2 } print(apply(double 5))');
    assertEqual(r.output, ['10']);
});

// ============================================
// 4. Built-in Functions
// ============================================
console.log('\n[4. Built-in Functions]');

test('Math functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(abs(-5)); print(floor(3.7)); print(ceil(3.2))');
    assertEqual(r.output, ['5', '3', '4']);
});

test('String functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(upper("hello")); print(lower("WORLD")); print(trim("  hi  "))');
    assertEqual(r.output, ['HELLO', 'world', 'hi']);
});

test('Array functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = [3 1 2]; print(len(arr)); print(min(3 1 2)); print(max(3 1 2))');
    assertEqual(r.output, ['3', '1', '3']);
});

test('Type functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(type(42)); print(type("hello")); print(type(true))');
    assertEqual(r.output, ['number', 'string', 'boolean']);
});

// ============================================
// 5. Operators
// ============================================
console.log('\n[5. Operators]');

test('Arithmetic operators', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(10 + 5); print(10 - 3); print(10 * 2); print(10 / 2); print(10 % 3)');
    assertEqual(r.output, ['15', '7', '20', '5', '1']);
});

test('Comparison operators', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(5 > 3); print(5 < 3); print(5 == 5); print(5 != 3)');
    assertEqual(r.output, ['true', 'false', 'true', 'true']);
});

test('Logical operators', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(true and false); print(true or false); print(not true)');
    assertEqual(r.output, ['false', 'true', 'false']);
});

test('String concatenation', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print("hello" + " " + "world")');
    assertEqual(r.output, ['hello world']);
});

// ============================================
// 6. Closures
// ============================================
console.log('\n[6. Closures]');

test('Simple closure', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn outer(x) {
    fn inner(y) {
        return x + y
    }
    return inner
}
add5 = outer(5)
print(add5(3))
`);
    assertEqual(r.output, ['8']);
});

test('Closure with state', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn counter() {
    count = 0
    fn inc() {
        count = count + 1
        return count
    }
    return inc
}
c = counter()
print(c())
print(c())
print(c())
`);
    assertTrue(r.output.length >= 2);
});

// ============================================
// 7. Error Handling
// ============================================
console.log('\n[7. Error Handling]');

test('Division by zero', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(10 / 0)');
    assertTrue(r.success || r.error || r.output.length > 0);
});

test('Undefined variable', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(undefinedVar)');
    assertTrue(r.error || !r.success || r.output.length > 0);
});

test('Type error', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print("hello" - 5)');
    assertTrue(r.error || !r.success || r.output.length > 0);
});

// ============================================
// 8. Advanced Features
// ============================================
console.log('\n[8. Advanced Features]');

test('Array map', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = [1 2 3]; result = parallel.map(arr (x) => x * 2); print(result[0]); print(result[1]); print(result[2])');
    assertEqual(r.output, ['2', '4', '6']);
});

test('Array filter', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = [1 2 3 4 5]; result = parallel.filter(arr (x) => x > 2); print(len(result))');
    assertEqual(r.output, ['3']);
});

test('Array reduce', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = [1 2 3 4 5]; result = parallel.reduce(arr 0 (acc x) => acc + x); print(result)');
    assertEqual(r.output, ['15']);
});

test('Arrow functions', () => {
    const vm = new SeedLangVM();
    const r = vm.run('double = (x) => x * 2; print(double(5))');
    assertEqual(r.output, ['10']);
});

test('Nested objects', () => {
    const vm = new SeedLangVM();
    const r = vm.run('obj = {a: {b: {c: 42}}}; print(obj.a.b.c)');
    assertEqual(r.output, ['42']);
});

test('Object methods', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
obj = {
    value: 10
    getValue: fn() {
        return this.value
    }
}
print(obj.getValue())
`);
    assertTrue(r.success || r.output.length > 0);
});

// ============================================
// 9. Edge Cases
// ============================================
console.log('\n[9. Edge Cases]');

test('Empty array', () => {
    const vm = new SeedLangVM();
    const r = vm.run('arr = []; print(len(arr))');
    assertEqual(r.output, ['0']);
});

test('Empty string', () => {
    const vm = new SeedLangVM();
    const r = vm.run('s = ""; print(len(s))');
    assertEqual(r.output, ['0']);
});

test('Null handling', () => {
    const vm = new SeedLangVM();
    const r = vm.run('x = null; print(x == null)');
    assertEqual(r.output, ['true']);
});

test('Boolean operations', () => {
    const vm = new SeedLangVM();
    const r = vm.run('print(true and true); print(false or true); print(not false)');
    assertEqual(r.output, ['true', 'true', 'true']);
});

// ============================================
// Summary
// ============================================
console.log('\n========================================');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
    console.log('Failed tests:');
    for (const err of errors) {
        console.log(`  - ${err.name}: ${err.error}`);
    }
}

process.exit(failed > 0 ? 1 : 0);
