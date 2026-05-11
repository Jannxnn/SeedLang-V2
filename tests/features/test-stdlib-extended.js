const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;

function test(name, code, check) {
    const vm = new SeedLangVM();
    try {
        const result = vm.run(code);
        const actual = vm.vm.globals.result;
        if (check(actual)) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: got ${JSON.stringify(actual)}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

console.log('=== Standard Library Extended Tests ===\n');

console.log('--- String functions (global function syntax) ---');
test('upper()', `
result = upper("hello")
`, (a) => a === 'HELLO');
test('lower()', `
result = lower("HELLO")
`, (a) => a === 'hello');
test('trim()', `
result = trim("  hello  ")
`, (a) => a === 'hello');
test('split()', `
result = split("a-b-c" "-")
`, (a) => JSON.stringify(a) === '["a","b","c"]');
test('indexOf() for string', `
result = indexOf("hello" "l")
`, (a) => a === 2);
test('repeat()', `
result = repeat("ab" 3)
`, (a) => a === 'ababab');
test('replace()', `
result = replace("hello" "l" "r")
`, (a) => a === 'herro');
test('len() for string', `
result = len("hello")
`, (a) => a === 5);

console.log('\n--- Array functions ---');
test('push()', `
arr = [1 2]
push(arr 3)
result = len(arr)
`, (a) => a === 3);
test('pop()', `
arr = [1 2 3]
x = pop(arr)
result = x
`, (a) => a === 3);
test('len() for array', `
result = len([10 20 30])
`, (a) => a === 3);
test('map()', `
arr = [1 2 3]
result = map(arr fn(x) { return x * 2 })
`, (a) => JSON.stringify(a) === '[2,4,6]');
test('filter()', `
arr = [1 2 3 4 5]
result = filter(arr fn(x) { return x > 3 })
`, (a) => JSON.stringify(a) === '[4,5]');
test('reduce() (init first)', `
arr = [1 2 3 4]
result = reduce(arr 0 fn(a b) { return a + b })
`, (a) => a === 10);
test('indexOf() for array', `
arr = [10 20 30]
result = indexOf(arr 20)
`, (a) => a === 1);
test('reverse()', `
arr = [1 2 3]
result = reverse(arr)
`, (a) => JSON.stringify(a) === '[3,2,1]');
test('slice()', `
arr = [1 2 3 4 5]
result = slice(arr 1 3)
`, (a) => JSON.stringify(a) === '[2,3]');
test('includes()', `
arr = [1 2 3]
result = includes(arr 2)
`, (a) => a === true);
test('join()', `
arr = ["a" "b" "c"]
result = join(arr "-")
`, (a) => a === 'a-b-c');
test('sort()', `
arr = [3 1 2]
result = sort(arr)
`, (a) => JSON.stringify(a) === '[1,2,3]');
test('unique()', `
arr = [1 2 2 3 3 3]
result = unique(arr)
`, (a) => JSON.stringify(a) === '[1,2,3]');

console.log('\n--- Math functions ---');
test('abs()', `result = abs(-5)`, (a) => a === 5);
test('floor()', `result = floor(3.7)`, (a) => a === 3);
test('ceil()', `result = ceil(3.2)`, (a) => a === 4);
test('round()', `result = round(3.5)`, (a) => a === 4);
test('sqrt()', `result = sqrt(16)`, (a) => a === 4);
test('pow()', `result = pow(2 10)`, (a) => a === 1024);
test('max()', `result = max(3 7)`, (a) => a === 7);
test('min()', `result = min(3 7)`, (a) => a === 3);

console.log('\n--- Type conversion ---');
test('int() from string', `result = int("42")`, (a) => a === 42);
test('int() from float', `result = int(3.9)`, (a) => a === 3);
test('float() from string', `result = float("3.14")`, (a) => Math.abs(a - 3.14) < 0.001);
test('type() number', `result = type(42)`, (a) => a === 'number');
test('type() string', `result = type("hello")`, (a) => a === 'string');
test('type() array', `result = type([1 2])`, (a) => a === 'array');
test('type() function', `result = type(fn() {})`, (a) => a === 'function');
test('type() null', `result = type(null)`, (a) => a === 'null' || a === 'object');

console.log('\n--- Object methods ---');
test('keys()', `obj = { name: "Alice" age: 30 }\nresult = keys(obj)`, (a) => JSON.stringify(a.sort()) === '["age","name"]');

console.log('\n--- JSON ---');
test('jsonStringify()', `result = jsonStringify({ x: 1 })`, (a) => a.includes('x') && a.includes('1'));
test('jsonParse()', `result = jsonParse('{"x":1}').x`, (a) => a === 1);

console.log(`\n=== Result: ${passed} passed ${failed} failed ===`);
