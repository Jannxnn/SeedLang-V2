// 闭包测试：验证词法作用域捕获、闭包链、高阶函数中的变量生命周期

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Closure Tests ===\n');

const vm = new SeedLangVM();
let passed = 0;
let failed = 0;

function test(name, code, check) {
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
            console.log(`[FAIL] ${name}: Expectation mismatch, got ${JSON.stringify(actual)}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

console.log('--- Simple Closures ---');
test('Closure captures outer variable', `
fn outer() {
    x = 10
    fn inner() { return x }
    return inner()
}
result = outer()
`, (actual) => actual === 10);

test('Closure modifies outer variable', `
fn createCounter() {
    count = 0
    fn increment() {
        count = count + 1
        return count
    }
    return increment
}
counter = createCounter()
result = counter() + counter() + counter()
`, (actual) => actual === 6);

console.log('\n--- Multiple Closures Sharing Variables ---');
test('Multiple closures share state', `
fn createCounter() {
    count = 0
    fn inc() { count = count + 1 return count }
    fn dec() { count = count - 1 return count }
    fn get() { return count }
    return {inc: inc dec: dec get: get}
}
c = createCounter()
c.inc()
c.inc()
c.dec()
result = c.get()
`, (actual) => actual === 1);

console.log('\n--- Zero-Arg Closure Regression ---');
test('Zero-arg captured closure keeps state (direct call)', `
fn makeCounter() {
    count = 0
    fn next() {
        count = count + 1
        return count
    }
    return next
}
c = makeCounter()
a = c()
b = c()
c3 = c()
result = a + b + c3
`, (actual) => actual === 6);

test('Zero-arg captured closure keeps state (member call)', `
fn makeCounterObj() {
    count = 40
    fn next() {
        count = count + 1
        return count
    }
    return {next: next}
}
obj = makeCounterObj()
v1 = obj.next()
v2 = obj.next()
result = v1 * 100 + v2
`, (actual) => actual === 4142);

console.log('\n--- Nested Closures ---');
test('Double nested closure', `
fn outer() {
    x = 10
    fn middle() {
        y = 20
        fn inner() { return x + y }
        return inner()
    }
    return middle()
}
result = outer()
`, (actual) => actual === 30);

test('Triple nested closure', `
fn level1() {
    a = 1
    fn level2() {
        b = 2
        fn level3() {
            c = 3
            return a + b + c
        }
        return level3()
    }
    return level2()
}
result = level1()
`, (actual) => actual === 6);

console.log('\n--- Currying ---');
test('Basic currying', `
fn curry(a) {
    fn inner1(b) {
        fn inner2(c) { return a + b + c }
        return inner2
    }
    return inner1
}
f1 = curry(1)
f2 = f1(2)
result = f2(3)
`, (actual) => actual === 6);

test('Multiplication currying', `
fn multiply(a) {
    fn inner(b) { return a * b }
    return inner
}
double = multiply(2)
triple = multiply(3)
result = double(5) + triple(5)
`, (actual) => actual === 25);

console.log('\n--- Higher-Order Functions ---');
test('Function composition', `
fn compose(f g) {
    fn composed(x) { return f(g(x)) }
    return composed
}
fn double(x) { return x * 2 }
fn addOne(x) { return x + 1 }
composed = compose(addOne double)
result = composed(5)
`, (actual) => actual === 11);

test('Twice application', `
fn twice(f) {
    fn applied(x) { return f(f(x)) }
    return applied
}
fn addThree(x) { return x + 3 }
addSix = twice(addThree)
result = addSix(10)
`, (actual) => actual === 16);

console.log('\n--- Real-World Scenarios ---');
test('Bank account', `
fn createAccount(initial) {
    balance = initial
    fn deposit(amount) { balance = balance + amount return balance }
    fn withdraw(amount) {
        if balance >= amount {
            balance = balance - amount
            return balance
        }
        return -1
    }
    fn getBalance() { return balance }
    return {deposit: deposit withdraw: withdraw getBalance: getBalance}
}
acc = createAccount(100)
acc.deposit(50)
acc.withdraw(30)
result = acc.getBalance()
`, (actual) => actual === 120);

test('Calculator', `
fn makeCalculator() {
    result = 0
    fn add(x) { result = result + x return result }
    fn sub(x) { result = result - x return result }
    fn mul(x) { result = result * x return result }
    fn reset() { result = 0 return result }
    return {add: add sub: sub mul: mul reset: reset}
}
calc = makeCalculator()
calc.add(10)
calc.add(5)
calc.mul(2)
result = calc.sub(5)
`, (actual) => actual === 25);

console.log('\n=== Closure Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

process.exit(failed > 0 ? 1 : 0);
