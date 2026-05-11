// 并行计算测试：验证并行执行、Worker 通信、数据并行、任务调度等并发计算模式

const { SeedLangVM } = require('../../src/runtime/vm.js');

const vm = new SeedLangVM();

console.log('=== Parallel Computing Tests ===\n');

const tests = [
    {
        name: 'Parallel map',
        code: `
async fn double(x) {
    return x * 2
}
result = await parallel.map([1 2 3 4 5] double)
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([2, 4, 6, 8, 10])
    },
    {
        name: 'Parallel filter',
        code: `
async fn isEven(x) {
    return x % 2 == 0
}
result = await parallel.filter([1 2 3 4 5 6] isEven)
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([2, 4, 6])
    },
    {
        name: 'Parallel reduce',
        code: `
async fn sum(acc x) {
    return acc + x
}
result = await parallel.reduce([1 2 3 4 5] 0 sum)
`,
        check: (actual) => actual === 15
    },
    {
        name: 'Concurrency limit',
        code: `
result = await concurrency.limit([1 2 3] 2)
`,
        check: (actual) => Array.isArray(actual) && actual.length === 3
    },
    {
        name: 'Batch processing',
        code: `
async fn process(x) {
    return x * 2
}
result = await concurrency.batch([1 2 3 4 5] process 2)
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([2, 4, 6, 8, 10])
    },
    {
        name: 'Promise.all',
        code: `
result = await parallel.all([1 2 3])
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2, 3])
    }
];

async function runTests() {
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        const freshVm = new SeedLangVM();
        try {
            const result = await freshVm.runAsync(test.code);
            
            if (result.success === false) {
                console.log(`[FAIL] ${test.name}: ${result.error}`);
                failed++;
                continue;
            }
            
            const actual = freshVm.vm.globals.result;
            
            if (test.check(actual)) {
                console.log(`[OK] ${test.name}: ${JSON.stringify(actual)}`);
                passed++;
            } else {
                console.log(`[FAIL] ${test.name}: unexpected result ${JSON.stringify(actual)}`);
                failed++;
            }
        } catch (e) {
            console.log(`[FAIL] ${test.name}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n=== Result: ${passed} passed ${failed} failed ===`);
}

runTests();
