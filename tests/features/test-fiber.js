const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Fiber (Auto-Coroutine) Tests ===\n');

const tests = [
    {
        name: 'Fiber fn auto-detect yield',
        code: `
fn gen() {
    yield 10
    yield 20
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([10, 20])
    },
    {
        name: 'Fiber with explicit coro still works',
        code: `
coro gen() {
    yield 1
    yield 2
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2])
    },
    {
        name: 'Fiber with closure call inside',
        code: `
fn double(x) { return x * 2 }
fn gen() {
    yield double(5)
    yield double(7)
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([10, 14])
    },
    {
        name: 'Fiber with closure capturing outer var',
        code: `
x = 100
fn adder(n) { return n + x }
fn gen() {
    yield adder(1)
    yield adder(2)
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([101, 102])
    },
    {
        name: 'Fiber with inner closure',
        code: `
fn gen() {
    fn helper() { return 42 }
    yield helper()
    yield helper()
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([42, 42])
    },
    {
        name: 'Fiber coroutine status transitions',
        code: `
fn gen() {
    yield 1
}
g = gen()
s1 = coroutine.status(g)
coroutine.resume(g)
s2 = coroutine.status(g)
coroutine.resume(g)
s3 = coroutine.status(g)
result = [s1 s2 s3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['suspended', 'suspended', 'done'])
    },
    {
        name: 'Fiber with for-in loop',
        code: `
fn gen() {
    for i in [1 2 3] {
        yield i
    }
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2, 3])
    },
    {
        name: 'Fiber multiple independent instances',
        code: `
fn counter() {
    yield 1
    yield 2
}
g1 = counter()
g2 = counter()
r1 = coroutine.resume(g1)
r2 = coroutine.resume(g2)
r3 = coroutine.resume(g1)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 1, 2])
    },
    {
        name: 'Fiber with local arithmetic',
        code: `
fn gen() {
    a = 10
    b = 20
    yield a + b
    yield a * b
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([30, 200])
    },
    {
        name: 'Fiber done after all yields',
        code: `
fn gen() {
    yield 1
    yield 2
    yield 3
}
g = gen()
coroutine.resume(g)
coroutine.resume(g)
coroutine.resume(g)
r4 = coroutine.resume(g)
result = coroutine.done(g)
`,
        check: (actual) => actual === true
    },
    {
        name: 'Fiber with parameters',
        code: `
fn range(start end) {
    i = start
    while i < end {
        yield i
        i = i + 1
    }
}
g = range(3 6)
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([3, 4, 5])
    },
    {
        name: 'Fiber fibonacci generator',
        code: `
fn fibonacci() {
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
    },
    {
        name: 'Fiber fn without yield is not fiber',
        code: `
fn normal() { return 42 }
result = normal()
`,
        check: (actual) => actual === 42
    },
    {
        name: 'Fiber with string yield',
        code: `
fn greet() {
    yield "hello"
    yield "world"
}
g = greet()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['hello', 'world'])
    },
    {
        name: 'Fiber nested in non-fiber function',
        code: `
fn makeGen() {
    fn gen() {
        yield 99
    }
    return gen()
}
g = makeGen()
result = coroutine.resume(g)
`,
        check: (actual) => actual === 99
    },
    {
        name: 'Fiber for-in auto-iterate',
        code: `
fn gen() {
    yield 10
    yield 20
    yield 30
}
total = 0
for x in gen() {
    total = total + x
}
result = total
`,
        check: (actual) => actual === 60
    },
    {
        name: 'Fiber for-in with fibonacci',
        code: `
fn fibonacci() {
    a = 0
    b = 1
    yield a
    yield b
    c = a + b
    yield c
}
result = []
for x in fibonacci() {
    result = push(result x)
}
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([0, 1, 1])
    },
    {
        name: 'Fiber for-in with closure inside',
        code: `
fn double(x) { return x * 2 }
fn gen() {
    yield double(1)
    yield double(2)
    yield double(3)
}
result = []
for x in gen() {
    result = push(result x)
}
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([2, 4, 6])
    },
    {
        name: 'Fiber for-in with string yield',
        code: `
fn words() {
    yield "hello"
    yield "world"
}
result = ""
for w in words() {
    result = result + w + " "
}
`,
        check: (actual) => actual === 'hello world '
    },
    {
        name: 'Fiber for-in with explicit coro',
        code: `
coro gen() {
    yield 5
    yield 10
}
total = 0
for x in gen() {
    total = total + x
}
result = total
`,
        check: (actual) => actual === 15
    },
    {
        name: 'Fiber with macro containing yield',
        code: `
macro yield_val(x) { yield x }
fn gen() {
    yield_val!(10)
    yield_val!(20)
    yield_val!(30)
}
total = 0
for x in gen() {
    total = total + x
}
result = total
`,
        check: (actual) => actual === 60
    },
    {
        name: 'Fiber with macro yield expression',
        code: `
macro yield_double(x) { yield x * 2 }
fn gen() {
    yield_double!(5)
    yield_double!(7)
}
result = []
for x in gen() {
    result = push(result x)
}
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([10, 14])
    },
    {
        name: 'Fiber macro yield in explicit coro',
        code: `
macro yield_val(x) { yield x }
coro gen() {
    yield_val!(1)
    yield_val!(2)
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2])
    },
    {
        name: 'Fiber macro creates fiber factory',
        code: `
macro gen_range(n) { fn g() { i = 0; while i < n { yield i; i = i + 1 } }; return g() }
mygen = gen_range!(4)
result = []
for x in mygen { result = push(result x) }
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([0, 1, 2, 3])
    },
    {
        name: 'Fiber macro parameterized generator',
        code: `
macro make_gen(start step count) { fn g() { i = start; c = 0; while c < count { yield i; i = i + step; c = c + 1 } }; return g() }
g = make_gen!(10 5 3)
result = []
for x in g { result = push(result x) }
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([10, 15, 20])
    },
    {
        name: 'Macro+fiber: conditional yield',
        code: `
macro yield_if(cond val) { if cond { yield val } }
fn gen(x) {
    yield_if!(x > 5 x)
    yield_if!(x > 10 x)
    yield_if!(x > 0 x)
}
g = gen(8)
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([8, 8, null])
    },
    {
        name: 'Macro+fiber: yield chain',
        code: `
macro yield_chain(a b) { yield a; yield a + b; yield a * b }
fn gen(x y) { yield_chain!(x y) }
g = gen(3 4)
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([3, 7, 12])
    },
    {
        name: 'Macro+fiber: nested macro yield',
        code: `
macro yield_val(x) { yield x }
macro yield_pair(a b) { yield_val!(a); yield_val!(b) }
fn gen() { yield_pair!(10 20) }
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([10, 20])
    },
    {
        name: 'Macro+fiber: fiber factory with multiple instances',
        code: `
macro counter_from(start) { fn g() { i = start; while i < start + 3 { yield i; i = i + 1 } }; return g() }
g1 = counter_from!(0)
g2 = counter_from!(10)
r1 = coroutine.resume(g1)
r2 = coroutine.resume(g2)
r3 = coroutine.resume(g1)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([0, 10, 1])
    },
    {
        name: 'Macro+fiber: string yield via macro',
        code: `
macro yield_greet(name) { yield "hello " + name }
fn gen() {
    yield_greet!("alice")
    yield_greet!("bob")
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['hello alice', 'hello bob'])
    },
    {
        name: 'Macro+fiber: infinite fiber factory',
        code: `
macro naturals_from(n) { fn g() { i = n; while true { yield i; i = i + 1 } }; return g() }
g = naturals_from!(100)
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([100, 101, 102])
    },
    {
        name: 'Macro+fiber: arithmetic expression yield',
        code: `
macro yield_squares(a b) { yield a * a; yield b * b }
fn gen(x y) { yield_squares!(x y) }
g = gen(3 5)
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = [r1 r2]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([9, 25])
    },
    {
        name: 'Macro+fiber: factory with for-in auto-iterate',
        code: `
macro gen_range(n) { fn g() { i = 0; while i < n { yield i; i = i + 1 } }; return g() }
total = 0
for x in gen_range!(4) { total = total + x }
result = total
`,
        check: (actual) => actual === 6
    },
    {
        name: 'Macro+fiber: array expand yield',
        code: `
macro yield_each(arr) { for x in arr { yield x } }
fn gen() { yield_each!([10 20 30]) }
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([10, 20, 30])
    },
    {
        name: 'Macro+fiber: dual yield macro',
        code: `
macro yield_dual(a b) { yield a; yield b }
fn gen() { yield_dual!(1 2); yield_dual!(3 4) }
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
r4 = coroutine.resume(g)
result = [r1 r2 r3 r4]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2, 3, 4])
    },
    {
        name: 'Macro+fiber: while+yield countdown',
        code: `
macro yield_countdown(from) { i = from; while i > 0 { yield i; i = i - 1 } }
fn gen() { yield_countdown!(5) }
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
r4 = coroutine.resume(g)
r5 = coroutine.resume(g)
result = [r1 r2 r3 r4 r5]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([5, 4, 3, 2, 1])
    },
    {
        name: 'Macro+fiber: while+yield with for-in',
        code: `
macro yield_countdown(from) { i = from; while i > 0 { yield i; i = i - 1 } }
fn gen() { yield_countdown!(3) }
total = 0
for x in gen() { total = total + x }
result = total
`,
        check: (actual) => actual === 6
    },
    {
        name: 'Fiber with try-catch',
        code: `
fn safe_gen() {
    try {
        yield 1
        yield 2
    } catch(e) {
        yield -1
    }
    yield 3
}
g = safe_gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2, 3])
    },
    {
        name: 'Fiber with throw and catch',
        code: `
fn resilient() {
    yield "start"
    try {
        throw "error"
        yield "unreachable"
    } catch(e) {
        yield "caught"
    }
    yield "end"
}
g = resilient()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['start', 'caught', 'end'])
    },
    {
        name: 'Fiber yield object',
        code: `
fn gen() {
    yield { name: "alice" age: 30 }
    yield { name: "bob" age: 25 }
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = r1.name + ":" + r2.age
`,
        check: (actual) => actual === 'alice:25'
    },
    {
        name: 'Fiber yield array',
        code: `
fn gen() {
    yield [1 2 3]
    yield [4 5 6]
}
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
result = r1[0] + r2[2]
`,
        check: (actual) => actual === 7
    },
    {
        name: 'Fiber higher-order map',
        code: `
fn map_gen(arr f) {
    for x in arr { yield f(x) }
}
fn double(x) { return x * 2 }
result = []
for x in map_gen([1 2 3] double) { result = push(result x) }
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([2, 4, 6])
    },
    {
        name: 'Fiber higher-order filter',
        code: `
fn filter_gen(arr pred) {
    for x in arr {
        if pred(x) { yield x }
    }
}
fn is_even(x) { return x % 2 == 0 }
result = []
for x in filter_gen([1 2 3 4 5 6] is_even) { result = push(result x) }
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([2, 4, 6])
    },
    {
        name: 'Fiber interleaved execution',
        code: `
fn gen(tag) {
    yield tag + "-1"
    yield tag + "-2"
}
g1 = gen("A")
g2 = gen("B")
r1 = coroutine.resume(g1)
r2 = coroutine.resume(g2)
r3 = coroutine.resume(g1)
r4 = coroutine.resume(g2)
result = [r1 r2 r3 r4]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify(['A-1', 'B-1', 'A-2', 'B-2'])
    },
    {
        name: 'Fiber yield boolean and null',
        code: `
fn gen() { yield true; yield false; yield null }
g = gen()
r1 = coroutine.resume(g)
r2 = coroutine.resume(g)
r3 = coroutine.resume(g)
result = [r1 r2 r3]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([true, false, null])
    },
    {
        name: 'Fiber pipeline computation',
        code: `
fn gen() { yield 10; yield 20; yield 30 }
total = 0
for x in gen() { total = total + x }
result = total * 2
`,
        check: (actual) => actual === 120
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
