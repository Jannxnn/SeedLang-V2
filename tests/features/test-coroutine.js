// 协程测试：验证 yield/generator、协程状态机、惰性求值等协程特性

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Coroutine Tests ===\n');

const tests = [
    {
        name: 'Coroutine definition',
        code: `
coro counter() {
    yield 1
    yield 2
    yield 3
}
c = counter()
result = coroutine.status(c)
`,
        check: (actual) => actual === 'suspended'
    },
    {
        name: 'Coroutine resume',
        code: `
coro counter() {
    yield 1
    yield 2
    yield 3
}
c = counter()
result = coroutine.resume(c)
`,
        check: (actual) => actual === 1
    },
    {
        name: 'Coroutine multiple resume',
        code: `
coro counter() {
    yield 1
    yield 2
    yield 3
}
c = counter()
r1 = coroutine.resume(c)
r2 = coroutine.resume(c)
r3 = coroutine.resume(c)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2, 3])
    },
    {
        name: 'Coroutine completion status',
        code: `
coro counter() {
    yield 1
    yield 2
}
c = counter()
coroutine.resume(c)
coroutine.resume(c)
coroutine.resume(c)
result = coroutine.done(c)
`,
        check: (actual) => actual === true
    },
    {
        name: 'Coroutine parameter passing',
        code: `
coro greet(name) {
    yield "Hello, " + name
    yield "Goodbye, " + name
}
c = greet("World")
result = coroutine.resume(c)
`,
        check: (actual) => actual === 'Hello, World'
    },
    {
        name: 'Infinite sequence generator',
        code: `
coro fibonacci() {
    a = 0
    b = 1
    yield a
    yield b
    while true {
        c = a + b
        yield c
        a = b
        b = c
    }
}
fib = fibonacci()
r1 = coroutine.resume(fib)
r2 = coroutine.resume(fib)
r3 = coroutine.resume(fib)
r4 = coroutine.resume(fib)
r5 = coroutine.resume(fib)
result = [r1 r2 r3 r4 r5]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([0, 1, 1, 2, 3])
    }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    const vm = new SeedLangVM();
    try {
        const result = vm.run(test.code);
        
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
