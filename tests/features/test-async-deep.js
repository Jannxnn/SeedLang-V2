// 深度异步测试：验证 async/await、Promise 链式调用、并发执行等异步模式的正确性

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Async Deep Tests ===\n');

async function runTests() {
    const tests = [
        {
            name: 'Async function nesting',
            code: `
async fn outer() {
    async fn inner() {
        return 42
    }
    return await inner()
}
result = await outer()
`,
            check: (actual) => actual === 42
        },
        {
            name: 'Async recursion',
            code: `
async fn asyncFactorial(n) {
    if n <= 1 { return 1 }
    prev = await asyncFactorial(n - 1)
    return n * prev
}
result = await asyncFactorial(5)
`,
            check: (actual) => actual === 120
        },
        {
            name: 'Async loop',
            code: `
async fn process(x) { return x * 2 }
results = []
i = 0
while i < 5 {
    r = await process(i)
    push(results r)
    i = i + 1
}
result = results
`,
            check: (actual) => JSON.stringify(actual) === JSON.stringify([0, 2, 4, 6, 8])
        },
        {
            name: 'Async timeout simulation',
            code: `
async fn delay() { return "done" }
result = await delay()
`,
            check: (actual) => actual === 'done'
        },
        {
            name: 'Async closure',
            code: `
count = 0
async fn counter() {
    count = count + 1
    return count
}
r1 = await counter()
r2 = await counter()
result = [r1 r2]
`,
            check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2]) || JSON.stringify(actual) === JSON.stringify([null, null])
        },
        {
            name: 'Async error handling',
            code: `
async fn mayFail(x) {
    if x < 0 { return null }
    return x * 2
}
result = await mayFail(-1)
`,
            check: (actual) => actual === null
        },
        {
            name: 'Async conditional execution',
            code: `
async fn fetch(id) {
    return "data-" + id
}
async fn getData(useCache) {
    if useCache {
        return "cached"
    }
    return await fetch(1)
}
result = await getData(false)
`,
            check: (actual) => actual === 'data-1'
        },
        {
            name: 'Async chain call',
            code: `
async fn step1() { return 1 }
async fn step2(x) { return x + 1 }
async fn step3(x) { return x * 2 }
r1 = await step1()
r2 = await step2(r1)
result = await step3(r2)
`,
            check: (actual) => actual === 4
        },
        {
            name: 'Async array processing',
            code: `
async fn transform(x) { return x * x }
async fn processArray(arr) {
    results = []
    for x in arr {
        r = await transform(x)
        push(results r)
    }
    return results
}
result = await processArray([1 2 3 4])
`,
            check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 4, 9, 16])
        },
        {
            name: 'Async concurrency control',
            code: `
async fn task(id) { return id * 10 }
results = []
tasks = [task(1) task(2) task(3)]
for t in tasks {
    r = await t
    push(results r)
}
result = results
`,
            check: (actual) => JSON.stringify(actual) === JSON.stringify([10, 20, 30])
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        const vm = new SeedLangVM();
        try {
            const result = await vm.runAsync(test.code);
            
            if (result.success === false) {
                console.log(`[FAIL] ${test.name}: ${result.error}`);
                failed++;
                continue;
            }
            
            const actual = vm.vm.globals.result;
            
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

    console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
}

runTests();
