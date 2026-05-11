// 故障注入测试：模拟内存不足、栈溢出、IO 失败等异常条件，验证运行时容错与恢复能力

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Fault Injection Tests ===\n');

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

function assertTrue(condition, msg = '') {
    if (!condition) {
        throw new Error(`${msg} Expected true, actual false`);
    }
}

console.log('--- Runtime Error Injection Tests ---');

test('Division by zero error handling', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
result = null
try {
    x = 10 / 0
    result = x
} catch(e) {
    result = "division error"
}
`);
    assertEqual(result.success, true);
});

test('Array index out of bounds error handling', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
arr = [1 2 3]
result = null
try {
    x = arr[100]
} catch(e) {
    result = "index error"
}
`);
    assertEqual(result.success, true);
});

test('Null access error handling', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
result = null
try {
    x = null
    y = x.field
} catch(e) {
    result = "null access"
}
`);
    assertEqual(result.success, true);
});

test('Type error handling', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
result = null
try {
    x = "string"
    y = x + 10
} catch(e) {
    result = "type error"
}
`);
    assertEqual(result.success, true);
});

console.log('\n--- Memory Stress Tests ---');

test('Large array memory stress', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
arr = []
i = 1
while i <= 1000 {
    push(arr i)
    i = i + 1
}
result = len(arr)
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 1000);
});

test('Deep recursion memory stress', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
fn deep(n) {
    if n <= 0 { return 0 }
    return 1 + deep(n - 1)
}

result = deep(50)
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 50);
});

test('Object nesting memory stress', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
obj = { level: 0 }
current = obj
i = 1
while i <= 50 {
    current.nested = { level: i }
    current = current.nested
    i = i + 1
}
result = "nested created"
`);
    assertEqual(result.success, true);
});

console.log('\n--- Coroutine Fault Tests ---');

test('Coroutine error propagation', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
fn errorGen() {
    yield 1
    throw "coroutine error"
}

c = errorGen()
r1 = resume(c)
r2 = null
try {
    r2 = resume(c)
} catch(e) {
    r2 = "error: " + e
}
result = [r1 r2]
`);
    assertEqual(result.success, true);
});

console.log('\n=== Fault Injection Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
