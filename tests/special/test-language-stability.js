const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Language Stability Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, code, check) {
    const vm = new SeedLangVM();
    try {
        const result = vm.run(code);
        if (!result.success) {
            console.log(`[FAIL] ${name}: ${result.error}`);
            failed++;
            return;
        }
        const actual = vm.vm.globals.result;
        if (check(actual)) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: Expected mismatch, actual ${JSON.stringify(actual)}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${name}: Exception - ${e.message}`);
        failed++;
    }
}

function testMultiRun(name, fn) {
    try {
        const result = fn();
        if (result === true) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: ${result}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${name}: Exception - ${e.message}`);
        failed++;
    }
}

console.log('--- VarDecl/LetDecl/Const Stability ---');

test('let basic declaration', `
let x = 42
result = x
`, (a) => a === 42);

test('var basic declaration', `
var y = 99
result = y
`, (a) => a === 99);

test('const basic declaration', `
const z = 7
result = z
`, (a) => a === 7);

test('let without initializer', `
let a
result = a
`, (a) => a === null || a === undefined);

test('let reassign after declaration', `
let x = 10
x = 20
result = x
`, (a) => a === 20);

test('let in function scope', `
let outer = 1
fn f() {
    let inner = 2
    return inner + outer
}
result = f()
`, (a) => a === 3);

test('let in function modifies outer scope', `
let x = 10
fn f() {
    let x = 20
    return x
}
result = f() + x
`, (a) => a === 40);

test('let is function-scoped not block-scoped', `
let x = 10
if true {
    let x = 20
}
result = x
`, (a) => a === 20);

test('multiple let declarations', `
let a = 1
let b = 2
let c = 3
result = a + b + c
`, (a) => a === 6);

test('let with expression initializer', `
let x = 3 + 4 * 2
result = x
`, (a) => a === 11);

test('let with array initializer', `
let arr = [1 2 3]
result = len(arr)
`, (a) => a === 3);

test('let with object initializer', `
let obj = { x: 10 y: 20 }
result = obj.x + obj.y
`, (a) => a === 30);

console.log('\n--- Compound Assignment Operators Stability ---');

test('+= basic', `
let x = 10
x += 5
result = x
`, (a) => a === 15);

test('-= basic', `
let x = 10
x -= 3
result = x
`, (a) => a === 7);

test('*= basic', `
let x = 4
x *= 3
result = x
`, (a) => a === 12);

test('/= basic', `
let x = 20
x /= 4
result = x
`, (a) => a === 5);

test('%= basic', `
let x = 17
x %= 5
result = x
`, (a) => a === 2);

test('+= in loop', `
let sum = 0
for i in range(5) {
    sum += i
}
result = sum
`, (a) => a === 10);

test('-= in loop', `
let val = 100
for i in range(5) {
    val -= 10
}
result = val
`, (a) => a === 50);

test('*= repeated', `
let p = 1
for i in range(1 6) {
    p *= i
}
result = p
`, (a) => a === 120);

test('+= with expression', `
let x = 5
x += 3 * 2
result = x
`, (a) => a === 11);

test('compound assignment chain', `
let a = 10
a += 5
a -= 3
a *= 2
a /= 6
result = a
`, (a) => a === 4);

test('+= on array element', `
let arr = [10 20 30]
arr[1] += 5
result = arr[1]
`, (a) => a === 25);

test('+= on object property', `
let obj = { count: 0 }
obj.count += 1
obj.count += 1
result = obj.count
`, (a) => a === 2);

console.log('\n--- Modulo Operator Stability ---');

test('% basic positive', `
result = 10 % 3
`, (a) => a === 1);

test('% with zero dividend', `
result = 0 % 5
`, (a) => a === 0);

test('% with larger divisor', `
result = 3 % 10
`, (a) => a === 3);

test('% in expression', `
result = (17 % 5) + (23 % 7)
`, (a) => a === 4);

test('% in loop for parity', `
let count = 0
for i in range(20) {
    if i % 2 == 0 {
        count += 1
    }
}
result = count
`, (a) => a === 10);

test('% with negative dividend', `
let x = -7
result = x % 3
`, (a) => typeof a === 'number');

console.log('\n--- Cross-Run Global Persistence Stability ---');

testMultiRun('globals preserved across runs', () => {
    const vm = new SeedLangVM({ optimizationLevel: 3 });
    vm.run('var globalVar = 100');
    vm.run('fn getGlobal() { return globalVar }');
    const r = vm.run('getGlobal()');
    if (!r.success) return `run failed: ${r.error}`;
    return true;
});

testMultiRun('function defined in run1 callable in run2', () => {
    const vm = new SeedLangVM();
    vm.run('fn add(a b) { return a + b }');
    const r = vm.run('result = add(3 4)');
    if (!r.success) return `run failed: ${r.error}`;
    if (vm.vm.globals.result !== 7) return `Expected 7, got ${vm.vm.globals.result}`;
    return true;
});

testMultiRun('variable updated in run1 visible in run2', () => {
    const vm = new SeedLangVM();
    vm.run('x = 10');
    vm.run('x = x + 5');
    const r = vm.run('result = x');
    if (!r.success) return `run failed: ${r.error}`;
    if (vm.vm.globals.result !== 15) return `Expected 15, got ${vm.vm.globals.result}`;
    return true;
});

testMultiRun('function defined and called in same run', () => {
    const vm = new SeedLangVM();
    const r = vm.run('fn double(x) { return x * 2 }\nresult = double(7)');
    if (!r.success) return `run failed: ${r.error}`;
    if (vm.vm.globals.result !== 14) return `Expected 14, got ${vm.vm.globals.result}`;
    return true;
});

testMultiRun('function defined in run1 callable with args in run2', () => {
    const vm = new SeedLangVM();
    vm.run('fn double(x) { return x * 2 }');
    const r = vm.run('result = double(7)');
    if (!r.success) return `run failed: ${r.error}`;
    if (vm.vm.globals.result !== 14) return `Expected 14, got ${vm.vm.globals.result}`;
    return true;
});

testMultiRun('multiple functions callable across runs', () => {
    const vm = new SeedLangVM();
    vm.run('fn double(x) { return x * 2 }');
    vm.run('fn triple(x) { return x * 3 }');
    const r = vm.run('result = double(5) + triple(5)');
    if (!r.success) return `run failed: ${r.error}`;
    if (vm.vm.globals.result !== 25) return `Expected 25, got ${vm.vm.globals.result}`;
    return true;
});

testMultiRun('function redefinition across runs', () => {
    const vm = new SeedLangVM();
    vm.run('fn f() { return 1 }');
    const r = vm.run('fn f() { return 2 }\nresult = f()');
    if (!r.success) return `run failed: ${r.error}`;
    if (vm.vm.globals.result !== 2) return `Expected 2, got ${vm.vm.globals.result}`;
    return true;
});

testMultiRun('var declaration persists across runs', () => {
    const vm = new SeedLangVM();
    vm.run('var counter = 0');
    vm.run('counter = counter + 1');
    const r = vm.run('result = counter');
    if (!r.success) return `run failed: ${r.error}`;
    if (vm.vm.globals.result !== 1) return `Expected 1, got ${vm.vm.globals.result}`;
    return true;
});

testMultiRun('jit functionASTs tracks functions', () => {
    const vm = new SeedLangVM({ optimizationLevel: 3 });
    vm.run('fn myFunc() { return 42 }');
    if (!vm.jit.functionASTs.has('myFunc')) return 'functionASTs missing myFunc';
    return true;
});

console.log('\n--- Closure and Scope Stability ---');

test('closure captures variable', `
fn makeAdder(n) {
    fn adder(x) { return x + n }
    return adder
}
let add5 = makeAdder(5)
result = add5(10)
`, (a) => a === 15);

test('closure captures mutable state', `
fn makeCounter() {
    let count = 0
    fn inc() { count += 1; return count }
    return inc
}
let c = makeCounter()
let a = c()
let b = c()
result = a + b
`, (a) => a === 3);

test('nested closures', `
fn outer() {
    let x = 10
    fn middle() {
        let y = 20
        fn inner() { return x + y }
        return inner
    }
    return middle
}
let m = outer()
let i = m()
result = i()
`, (a) => a === 30);

test('closure captures loop variable (captures final value)', `
let fns = []
for i in range(5) {
    fns = push(fns fn() { return i })
}
result = fns[2]()
`, (a) => a === 4);

test('closure captures loop variable via parameter', `
let fns = []
for i in range(5) {
    fn capture(v) { fn inner() { return v }; return inner }
    fns = push(fns capture(i))
}
result = fns[2]()
`, (a) => a === 2);

test('function as argument', `
fn apply(f x) { return f(x) }
fn square(n) { return n * n }
result = apply(square 7)
`, (a) => a === 49);

test('function returning function', `
fn compose(f g) {
    fn composed(x) { return f(g(x)) }
    return composed
}
fn double(x) { return x * 2 }
fn add1(x) { return x + 1 }
let doubleThenAdd = compose(add1 double)
result = doubleThenAdd(5)
`, (a) => a === 11);

test('closure with multiple captures', `
fn makePair(a b) {
    fn getSum() { return a + b }
    fn getDiff() { return a - b }
    return getSum
}
let f = makePair(10 3)
result = f()
`, (a) => a === 13);

console.log('\n--- Control Flow Stability ---');

test('for-in range basic', `
let sum = 0
for i in range(10) {
    sum += i
}
result = sum
`, (a) => a === 45);

test('for-in range with step', `
let sum = 0
for i in range(0 10 2) {
    sum += i
}
result = sum
`, (a) => a === 20);

test('nested for loops', `
let count = 0
for i in range(3) {
    for j in range(4) {
        count += 1
    }
}
result = count
`, (a) => a === 12);

test('while with break condition', `
let i = 0
while i < 100 {
    i += 1
    if i == 10 { break }
}
result = i
`, (a) => a === 10);

test('for with continue', `
let sum = 0
for i in range(10) {
    if i % 2 == 0 { continue }
    sum += i
}
result = sum
`, (a) => a === 25);

test('if-else chain', `
let x = 15
let label = ""
if x > 20 {
    label = "big"
} else if x > 10 {
    label = "medium"
} else {
    label = "small"
}
result = label
`, (a) => a === "medium");

test('nested if', `
let x = 5
let y = 10
let r = 0
if x > 0 {
    if y > 5 {
        r = 1
    } else {
        r = 2
    }
} else {
    r = 3
}
result = r
`, (a) => a === 1);

test('for-in over array', `
let items = [10 20 30 40 50]
let sum = 0
for item in items {
    sum += item
}
result = sum
`, (a) => a === 150);

test('while countdown', `
let n = 5
let result_str = ""
while n > 0 {
    result_str = result_str + string(n)
    n -= 1
}
result = result_str
`, (a) => a === "54321" || a === "5 4 3 2 1 ");

test('deeply nested loops', `
let total = 0
for i in range(3) {
    for j in range(3) {
        for k in range(3) {
            total += 1
        }
    }
}
result = total
`, (a) => a === 27);

console.log('\n--- Array Operations Stability ---');

test('array creation and access', `
let arr = [1 2 3 4 5]
result = arr[0] + arr[4]
`, (a) => a === 6);

test('array push and length', `
let arr = []
arr = push(arr 10)
arr = push(arr 20)
arr = push(arr 30)
result = len(arr)
`, (a) => a === 3);

test('array map', `
let arr = [1 2 3]
let doubled = map(arr fn(x) { return x * 2 })
result = doubled[2]
`, (a) => a === 6);

test('array filter', `
let arr = [1 2 3 4 5 6]
let evens = filter(arr fn(x) { return x % 2 == 0 })
result = len(evens)
`, (a) => a === 3);

test('array reduce', `
let arr = [1 2 3 4 5]
let total = reduce(arr 0 fn(acc x) { return acc + x })
result = total
`, (a) => a === 15);

test('array slice', `
let arr = [10 20 30 40 50]
let sub = slice(arr 1 3)
result = sub[0] + sub[1]
`, (a) => a === 50);

test('array indexOf', `
let arr = [10 20 30 40 30]
result = indexOf(arr 30)
`, (a) => a === 2);

test('nested array', `
let matrix = [[1 2] [3 4]]
result = matrix[1][0]
`, (a) => a === 3);

test('array mutation', `
let arr = [1 2 3]
arr[1] = 99
result = arr[1]
`, (a) => a === 99);

test('array reverse and sort', `
let arr = [3 1 4 1 5]
let sorted = sort(arr)
result = sorted[0] + sorted[4]
`, (a) => a === 6);

console.log('\n--- Object Operations Stability ---');

test('object creation and access', `
let obj = { name: "Alice" age: 30 }
result = obj.name
`, (a) => a === "Alice");

test('object bracket access', `
let obj = { name: "Bob" age: 25 }
result = obj["age"]
`, (a) => a === 25);

test('object modification', `
let obj = { x: 1 }
obj.x = 10
result = obj.x
`, (a) => a === 10);

test('object keys', `
let obj = { a: 1 b: 2 c: 3 }
let k = keys(obj)
result = len(k)
`, (a) => a === 3);

test('object values', `
let obj = { a: 10 b: 20 }
let v = values(obj)
result = v[0] + v[1]
`, (a) => a === 30);

test('nested object', `
let obj = { inner: { val: 42 } }
result = obj.inner.val
`, (a) => a === 42);

test('object with string values', `
let obj = { first: "Hello" last: "World" }
result = obj.first + " " + obj.last
`, (a) => a === "Hello World");

console.log('\n--- Recursion Stability ---');

test('factorial recursive', `
fn fact(n) {
    if n <= 1 { return 1 }
    return n * fact(n - 1)
}
result = fact(10)
`, (a) => a === 3628800);

test('fibonacci recursive', `
fn fib(n) {
    if n <= 1 { return n }
    return fib(n - 1) + fib(n - 2)
}
result = fib(10)
`, (a) => a === 55);

test('recursive sum', `
fn sumTo(n) {
    if n == 0 { return 0 }
    return n + sumTo(n - 1)
}
result = sumTo(100)
`, (a) => a === 5050);

test('mutual recursion', `
fn isEven(n) {
    if n == 0 { return true }
    return isOdd(n - 1)
}
fn isOdd(n) {
    if n == 0 { return false }
    return isEven(n - 1)
}
result = isEven(10)
`, (a) => a === true);

test('recursive GCD', `
fn gcd(a b) {
    if b == 0 { return a }
    return gcd(b a % b)
}
result = gcd(48 18)
`, (a) => a === 6);

console.log('\n--- String Operations Stability ---');

test('string concatenation', `
let s = "hello" + " " + "world"
result = s
`, (a) => a === "hello world");

test('string length', `
result = len("SeedLang")
`, (a) => a === 8);

test('string split and join', `
let parts = split("a-b-c" "-")
result = join(parts "|")
`, (a) => a === "a|b|c");

test('string upper and lower', `
let s = "Hello"
result = upper(s) + lower(s)
`, (a) => a === "HELLOhello");

test('string includes', `
result = includes("SeedLang" "Lang")
`, (a) => a === true);

test('string trim', `
result = trim("  hello  ")
`, (a) => a === "hello");

test('string repeat', `
result = repeat("ab" 3)
`, (a) => a === "ababab");

test('string substring', `
result = substring("SeedLang" 0 4)
`, (a) => a === "Seed");

console.log('\n--- Type and Comparison Stability ---');

test('type check number', `
result = type(42)
`, (a) => a === "number");

test('type check string', `
result = type("hello")
`, (a) => a === "string");

test('type check array', `
result = type([1 2 3])
`, (a) => a === "array");

test('type check boolean', `
result = type(true)
`, (a) => a === "boolean");

test('equality comparison', `
result = 1 == 1
`, (a) => a === true);

test('inequality comparison', `
result = 1 != 2
`, (a) => a === true);

test('comparison chain', `
let x = 5
result = x > 0 && x < 10
`, (a) => a === true);

test('ternary-like via if expression', `
let x = 5
let y = 0
if x > 3 { y = 100 } else { y = 200 }
result = y
`, (a) => a === 100);

test('null comparison', `
let x = null
result = x == null
`, (a) => a === true);

console.log('\n--- Arithmetic Edge Cases Stability ---');

test('negative numbers', `
result = -5 + 10
`, (a) => a === 5);

test('multiplication overflow safe', `
result = 1000000 * 1000000
`, (a) => a === 1000000000000);

test('float arithmetic', `
result = 0.1 + 0.2
`, (a) => Math.abs(a - 0.30000000000000004) < 1e-10);

test('integer division', `
result = 7 / 2
`, (a) => a === 3.5);

test('chained arithmetic', `
result = 2 + 3 * 4 - 1
`, (a) => a === 13);

test('parenthesized arithmetic', `
result = (2 + 3) * (4 - 1)
`, (a) => a === 15);

test('unary negation', `
let x = 10
result = -x
`, (a) => a === -10);

test('large number arithmetic', `
result = 999999 + 1
`, (a) => a === 1000000);

test('float to int comparison', `
result = 5.0 == 5
`, (a) => a === true);

console.log('\n--- Built-in Function Stability ---');

test('abs function', `
result = abs(-42)
`, (a) => a === 42);

test('min and max', `
result = min(3 7) + max(3 7)
`, (a) => a === 10);

test('floor and ceil', `
result = floor(3.7) + ceil(3.2)
`, (a) => a === 7);

test('sqrt function', `
result = sqrt(144)
`, (a) => a === 12);

test('pow function', `
result = pow(2 10)
`, (a) => a === 1024);

test('range to array', `
let arr = range(5)
result = len(arr)
`, (a) => a === 5);

test('concat arrays', `
let a = [1 2]
let b = [3 4]
let c = concat(a b)
result = len(c)
`, (a) => a === 4);

test('reverse array', `
let arr = [1 2 3]
let rev = reverse(arr)
result = rev[0]
`, (a) => a === 3);

test('sort array', `
let arr = [3 1 2]
let sorted = sort(arr)
result = sorted[0]
`, (a) => a === 1);

test('sum function', `
let arr = [10 20 30]
result = sum(arr)
`, (a) => a === 60);

test('avg function', `
let arr = [10 20 30]
result = avg(arr)
`, (a) => a === 20);

console.log('\n--- Error Handling Stability ---');

test('try-catch basic', `
let r = 0
try {
    r = 10 / 0
} catch(e) {
    r = -1
}
result = r
`, (a) => typeof a === 'number');

test('try-catch-finally', `
let r = 0
try {
    r = r + 1
} catch(e) {
    r = r + 10
} finally {
    r = r + 100
}
result = r
`, (a) => a === 101);

test('try without error', `
let r = 0
try {
    r = 42
} catch(e) {
    r = -1
}
result = r
`, (a) => a === 42);

console.log('\n--- Idempotency Stability ---');

test('same code same result', `
let x = 3 + 4
result = x
`, (a) => a === 7);

testMultiRun('idempotent VM runs', () => {
    const code = 'result = pow(2 8)';
    const vm1 = new SeedLangVM();
    const vm2 = new SeedLangVM();
    const r1 = vm1.run(code);
    const r2 = vm2.run(code);
    if (!r1.success || !r2.success) return 'runs failed';
    if (vm1.vm.globals.result !== vm2.vm.globals.result) return 'results differ';
    return true;
});

testMultiRun('fresh VM produces consistent results', () => {
    const code = 'result = 42';
    const results = [];
    for (let i = 0; i < 5; i++) {
        const vm = new SeedLangVM();
        const r = vm.run(code);
        if (!r.success) return `run ${i} failed`;
        results.push(vm.vm.globals.result);
    }
    if (!results.every(r => r === 42)) return `inconsistent: ${results}`;
    return true;
});

console.log('\n--- Complex Expression Stability ---');

test('nested function calls', `
fn add(a b) { return a + b }
fn mul(a b) { return a * b }
result = add(mul(3 4) mul(5 6))
`, (a) => a === 42);

test('chained method-like calls', `
let arr = [5 3 8 1 9]
let r = sort(arr)
result = r[0]
`, (a) => a === 1);

test('complex boolean logic', `
let a = true
let b = false
let c = true
result = (a && !b) || (b && c)
`, (a) => a === true);

test('nested arithmetic in function', `
fn calc(a b c) {
    return (a + b) * c - a / b
}
result = calc(10 5 3)
`, (a) => a === 43);

test('string in expression context', `
fn greet(name) {
    return "Hello " + name
}
result = greet("World")
`, (a) => a === "Hello World");

test('array in function return', `
fn makeRange(n) {
    let arr = []
    for i in range(n) {
        arr = push(arr i * i)
    }
    return arr
}
let squares = makeRange(5)
result = squares[3]
`, (a) => a === 9);

console.log('\n' + '='.repeat(50));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
