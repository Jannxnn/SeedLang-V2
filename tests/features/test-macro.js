const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Macro System Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, code, check) {
    const vm = new SeedLangVM({ maxInstructions: 50000000 });
    try {
        const result = vm.run(code);
        if (result.success === false) {
            console.log(`[FAIL] ${name}: ${result.error}`);
            failed++;
            return;
        }
        const actual = vm.vm.globals.result;
        if (check(actual)) {
            console.log(`[OK] ${name}: ${JSON.stringify(actual)}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: unexpected result ${JSON.stringify(actual)}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

test('Basic macro - double', `
macro double(x) {
    x = x * 2
}
result = 5
double!(result)
`, (a) => a === 10);

test('Basic macro - increment', `
macro inc(x) {
    x = x + 1
}
count = 0
inc!(count)
inc!(count)
inc!(count)
result = count
`, (a) => a === 3);

test('Basic macro - square', `
macro square(x) {
    x = x * x
}
n = 5
square!(n)
result = n
`, (a) => a === 25);

test('Multi-param macro', `
macro add_mul(a b c) {
    a = a + b
    a = a * c
}
result = 2
add_mul!(result 3 4)
`, (a) => a === 20);

test('Macro with if', `
macro abs(x) {
    if x < 0 {
        x = 0 - x
    }
}
result = -5
abs!(result)
`, (a) => a === 5);

test('Macro with if-else (clamp)', `
macro clamp(x lo hi) {
    if x < lo {
        x = lo
    } else {
        if x > hi {
            x = hi
        }
    }
}
result = 15
clamp!(result 0 10)
`, (a) => a === 10);

test('Macro swap two variables', `
macro swap(a b) {
    temp = a
    a = b
    b = temp
}
x = 1
y = 2
swap!(x y)
result = x * 10 + y
`, (a) => a === 21);

test('Nested macro calls', `
macro double(x) {
    x = x * 2
}
macro quad(x) {
    double!(x)
    double!(x)
}
result = 3
quad!(result)
`, (a) => a === 12);

test('Macro expression value', `
macro square(x) {
    x * x
}
result = square!(5)
`, (a) => a === 25);

test('Macro return value', `
macro cube(x) {
    return x * x * x
}
result = cube!(3)
`, (a) => a === 27);

test('Macro with while loop', `
macro countdown(x) {
    while x > 0 {
        x = x - 1
    }
}
result = 10
countdown!(result)
`, (a) => a === 0);

test('Macro with for-in loop', `
macro sum_to(x) {
    total = 0
    for i in [1 2 3 4 5] {
        total = total + i
    }
    x = total
}
result = 0
sum_to!(result)
`, (a) => a === 15);

test('Macro with array method', `
macro push_val(arr val) {
    arr.push(val)
}
my_arr = [1 2 3]
push_val!(my_arr 4)
result = my_arr.length
`, (a) => a === 4);

test('Macro string concat', `
macro greet(name) {
    name = "Hello " + name
}
result = "World"
greet!(result)
`, (a) => a === 'Hello World');

test('Macro no params (side effect)', `
macro reset(x) {
    x = 0
}
result = 99
reset!(result)
`, (a) => a === 0);

test('Macro inside function', `
fn test() {
    macro inc(x) {
        x = x + 1
    }
    n = 10
    inc!(n)
    return n
}
result = test()
`, (a) => a === 11);

test('Macro with subtraction', `
macro dec(x) {
    x = x - 3
}
result = 10
dec!(result)
`, (a) => a === 7);

test('Macro with modulo', `
macro mod_val(x m) {
    x = x % m
}
result = 17
mod_val!(result 5)
`, (a) => a === 2);

test('Hygiene: swap does not pollute caller temp', `
macro swap(a b) {
    temp = a
    a = b
    b = temp
}
temp = 999
x = 1
y = 2
swap!(x y)
result = temp
`, (a) => a === 999);

test('Hygiene: internal var does not shadow caller', `
macro set_val(x) {
    val = 100
    x = val
}
val = 42
n = 0
set_val!(n)
result = val
`, (a) => a === 42);

test('Hygiene: for-in loop var isolated', `
macro sum_arr(x) {
    total = 0
    for i in [1 2 3] {
        total = total + i
    }
    x = total
}
i = 999
total = 888
sum_arr!(result)
result = i * 1000 + total
`, (a) => a === 999888);

test('Hygiene: multiple calls dont collide', `
macro add_temp(x) {
    temp = 10
    x = x + temp
}
temp = 0
a = 1
add_temp!(a)
result = temp
`, (a) => a === 0);

test('Hygiene: clamp params preserved', `
macro clamp(x lo hi) {
    if x < lo {
        x = lo
    } else {
        if x > hi {
            x = hi
        }
    }
}
lo = 999
hi = 888
result = 15
clamp!(result 0 10)
result = lo * 1000 + hi
`, (a) => a === 999888);

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
