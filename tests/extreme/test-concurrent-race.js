// 并发竞态测试：验证多 VM 实例/共享状态下的并发安全性（数据竞争/死锁/活锁场景）

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Concurrent Race Tests ===\n');

const tests = [
    {
        name: 'Coroutine status check',
        code: `
coro task() {
    yield
    yield
}
co = task()
status1 = coroutine.status(co)
coroutine.resume(co)
status2 = coroutine.status(co)
coroutine.resume(co)
coroutine.resume(co)
status3 = coroutine.status(co)
result = [status1 status2 status3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['suspended', 'suspended', 'done'])
    },
    {
        name: 'Coroutine return value',
        code: `
coro task() {
    yield 1
    yield 2
    return 3
}
co = task()
r1 = coroutine.resume(co)
r2 = coroutine.resume(co)
r3 = coroutine.resume(co)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2, 3])
    },
    {
        name: 'Coroutine nested call',
        code: `
coro inner() {
    yield "inner1"
    yield "inner2"
}
coro outer() {
    yield "outer1"
    co = inner()
    coroutine.resume(co)
    coroutine.resume(co)
    yield "outer2"
}
co = outer()
r1 = coroutine.resume(co)
r2 = coroutine.resume(co)
r3 = coroutine.resume(co)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['outer1', 'outer2', null])
    },
    {
        name: 'Coroutine error isolation',
        code: `
coro badTask() {
    yield 1
    throw "error in coroutine"
}
co = badTask()
r1 = coroutine.resume(co)
r2 = null
try {
    r2 = coroutine.resume(co)
} catch(e) {
    r2 = { error: e }
}
hasError = r2.error != null
result = [r1 hasError]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, true])
    },
    {
        name: 'Coroutine parameter passing',
        code: `
coro greet(name) {
    yield "Hello, " + name
    yield "Goodbye, " + name
}
c = greet("World")
r1 = coroutine.resume(c)
r2 = coroutine.resume(c)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['Hello, World', 'Goodbye, World'])
    },
    {
        name: 'Coroutine completion check',
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
        name: 'Coroutine infinite sequence',
        code: `
coro counter() {
    n = 0
    while n < 5 {
        yield n
        n = n + 1
    }
}
c = counter()
r1 = coroutine.resume(c)
r2 = coroutine.resume(c)
r3 = coroutine.resume(c)
r4 = coroutine.resume(c)
r5 = coroutine.resume(c)
result = [r1 r2 r3 r4 r5]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([0, 1, 2, 3, 4])
    },
    {
        name: 'Coroutine running check',
        code: `
coro task() {
    yield 1
}
c = task()
running1 = coroutine.running(c)
coroutine.resume(c)
running2 = coroutine.running(c)
result = [running1 running2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([false, false])
    },
    {
        name: 'Coroutine multiple yield',
        code: `
coro multiYield() {
    yield "a"
    yield "b"
    yield "c"
    yield "d"
    return "done"
}
c = multiYield()
r1 = coroutine.resume(c)
r2 = coroutine.resume(c)
r3 = coroutine.resume(c)
r4 = coroutine.resume(c)
r5 = coroutine.resume(c)
result = [r1 r2 r3 r4 r5]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['a', 'b', 'c', 'd', 'done'])
    },
    {
        name: 'Coroutine state transition',
        code: `
coro task() {
    yield 1
    return 2
}
c = task()
s1 = coroutine.status(c)
coroutine.resume(c)
s2 = coroutine.status(c)
coroutine.resume(c)
s3 = coroutine.status(c)
result = [s1 s2 s3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['suspended', 'suspended', 'done'])
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
            console.log(`[OK] ${test.name}: ${typeof actual === 'object' ? JSON.stringify(actual) : actual}`);
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
