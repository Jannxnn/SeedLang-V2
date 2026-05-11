// 负载测试：验证 VM 在高并发/大量代码/长时间运行下的稳定性与资源消耗

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Load Tests ===\n');

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

function measureTime(fn, label) {
    const start = Date.now();
    const result = fn();
    const elapsed = Date.now() - start;
    return { result, elapsed };
}

function assertPerformance(elapsed, maxMs, msg = '') {
    if (elapsed > maxMs) {
        throw new Error(`${msg} Execution time ${elapsed}ms exceeded limit ${maxMs}ms`);
    }
}

console.log('--- Large Loop Performance Tests ---');

test('Large loop performance', () => {
    const vm = new SeedLangVM();
    const { result, elapsed } = measureTime(() => {
        return vm.run(`
sum = 0
i = 1
while i <= 10000 {
    sum = sum + i
    i = i + 1
}
result = sum
`);
    });
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 50005000);
    assertPerformance(elapsed, 5000, 'Large loop');
    console.log(`  Time: ${elapsed}ms`);
});

test('Nested loop performance', () => {
    const vm = new SeedLangVM();
    const { result, elapsed } = measureTime(() => {
        return vm.run(`
count = 0
i = 1
while i <= 50 {
    j = 1
    while j <= 50 {
        count = count + 1
        j = j + 1
    }
    i = i + 1
}
result = count
`);
    });
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 2500);
    assertPerformance(elapsed, 5000, 'Nested loop');
    console.log(`  Time: ${elapsed}ms`);
});

console.log('\n--- Large Array Operation Tests ---');

test('Large array creation performance', () => {
    const vm = new SeedLangVM();
    const { result, elapsed } = measureTime(() => {
        return vm.run(`
arr = []
i = 1
while i <= 1000 {
    push(arr i)
    i = i + 1
}
result = len(arr)
`);
    });
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 1000);
    assertPerformance(elapsed, 3000, 'Large array creation');
    console.log(`  Time: ${elapsed}ms`);
});

test('Large array traversal performance', () => {
    const vm = new SeedLangVM();
    const { result, elapsed } = measureTime(() => {
        return vm.run(`
arr = []
i = 1
while i <= 1000 {
    push(arr i)
    i = i + 1
}
sum = 0
for x in arr {
    sum = sum + x
}
result = sum
`);
    });
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 500500);
    assertPerformance(elapsed, 3000, 'Large array traversal');
    console.log(`  Time: ${elapsed}ms`);
});

console.log('\n=== Load Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
