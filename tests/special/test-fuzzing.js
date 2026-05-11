// 模糊测试（Fuzzing）：使用随机生成的畸形输入探测 VM 的崩溃边界与未处理异常

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Fuzzing Tests ===\n');

let passed = 0;
let failed = 0;
let crashed = 0;

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat() {
    return Math.random() * 1000 - 500;
}

function randomString(len) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let s = '';
    for (let i = 0; i < len; i++) {
        s += chars[randomInt(0, chars.length - 1)];
    }
    return s;
}

function randomExpr(depth = 0) {
    if (depth > 2) {
        const terminals = [
            () => randomInt(0, 100),
            () => randomFloat().toFixed(2),
            () => `"${randomString(randomInt(1, 5))}"`,
            () => 'null',
            () => 'true',
            () => 'false'
        ];
        return terminals[randomInt(0, terminals.length - 1)]();
    }
    
    const types = ['number', 'string', 'bool', 'binary'];
    const type = types[randomInt(0, types.length - 1)];
    
    switch (type) {
        case 'number':
            return randomInt(-100, 100);
        case 'string':
            return `"${randomString(randomInt(1, 5))}"`;
        case 'bool':
            return randomInt(0, 1) ? 'true' : 'false';
        case 'binary': {
            const ops = ['+', '-', '*', '<', '>', '==', '!='];
            const op = ops[randomInt(0, ops.length - 1)];
            return `(${randomExpr(depth + 1)} ${op} ${randomExpr(depth + 1)})`;
        }
        default:
            return randomInt(0, 100);
    }
}

function testFuzzing(name, code) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(code);
        if (result.success || result.error) {
            process.stdout.write(`[OK] ${name}\n`);
            passed++;
            return true;
        } else {
            process.stdout.write(`[FAIL] ${name}\n`);
            failed++;
            return false;
        }
    } catch (e) {
        crashed++;
        console.log(`[FAIL] ${name}: CRASH - ${e.message}`);
        return false;
    }
}

function testErrorContains(name, code, expectedPattern) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(code);
        const msg = String(result.error || '');
        if (!result.success && expectedPattern.test(msg)) {
            process.stdout.write(`[OK] ${name}\n`);
            passed++;
            return true;
        }
        failed++;
        console.log(`[FAIL] ${name}: unexpected message -> ${msg.split('\n')[0]}`);
        return false;
    } catch (e) {
        crashed++;
        console.log(`[FAIL] ${name}: CRASH - ${e.message}`);
        return false;
    }
}

function testMustSucceed(name, code) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(code);
        if (result.success) {
            process.stdout.write(`[OK] ${name}\n`);
            passed++;
            return true;
        }
        failed++;
        const msg = String(result.error || 'unknown error');
        console.log(`[FAIL] ${name}: unexpected failure -> ${msg.split('\n')[0]}`);
        return false;
    } catch (e) {
        crashed++;
        console.log(`[FAIL] ${name}: CRASH - ${e.message}`);
        return false;
    }
}

console.log('--- Boundary Value Tests ---');
const boundaryTests = [
    { name: 'Large integer', code: `result = 999999999999999` },
    { name: 'Small integer', code: `result = -999999999999999` },
    { name: 'Tiny float', code: `result = 0.0000000001` },
    { name: 'Large float', code: `result = 999999.999999` },
    { name: 'Empty string', code: `result = ""` },
    { name: 'Long string', code: `result = "${'a'.repeat(100)}"` },
    { name: 'Empty array', code: `result = []` },
    { name: 'Large array', code: `arr = []\ni = 0\nwhile i < 100 { push(arr i) i = i + 1 }\nresult = len(arr)` },
    { name: 'Deep nested array', code: `result = [[[[[1]]]]]` },
    { name: 'Deep nested object', code: `result = {a: {b: {c: {d: {e: 42}}}}}` },
    { name: 'Unicode string', code: `result = "Hello World"` },
    { name: 'Special character string', code: `result = "hello\\nworld"` },
    { name: 'Division by zero', code: `result = 1 / 0` },
    { name: 'Negative modulo', code: `result = -7 % 3` },
    { name: 'Empty string length', code: `result = len("")` },
    { name: 'Null operation', code: `result = null == null` },
    { name: 'Boolean operations', code: `result = true and false or true` },
    { name: 'Short-circuit evaluation', code: `result = false and (1 / 0)` },
    { name: 'Type conversion', code: `result = string(123)` },
    { name: 'Array index out of bounds', code: `arr = [1 2 3]\nresult = arr[100]` }
];

for (const test of boundaryTests) {
    testFuzzing(test.name, test.code);
}

console.log('\n--- Syntax Stress Tests ---');
const syntaxTests = [
    { name: 'Deep nested if', code: 'if true { if true { if true { if true { if true { result = 1 } } } } }' },
    { name: 'Deep nested while', code: 'i = 0\nwhile i < 3 { j = 0\nwhile j < 3 { j = j + 1 } i = i + 1 }\nresult = i' },
    { name: 'Multi-layer function calls', code: 'fn a() { return b() }\nfn b() { return c() }\nfn c() { return 42 }\nresult = a()' },
    { name: 'Complex expression', code: 'result = (1 + 2) * (3 - 4) / (5 + 6) + (7 * 8 - 9)' },
    { name: 'Chained comparison', code: 'result = 1 < 2 and 2 < 3 and 3 < 4' },
    { name: 'Multi-parameter function', code: 'fn f(a b c d e) { return a + b + c + d + e }\nresult = f(1 2 3 4 5)' },
    { name: 'Closure capture', code: 'fn outer() { x = 10\nfn inner() { return x }\nreturn inner() }\nresult = outer()' },
    { name: 'Recursion depth', code: 'fn fib(n) { if n <= 1 { return n } return fib(n - 1) + fib(n - 2) }\nresult = fib(10)' },
    { name: 'String concatenation', code: 's = ""\ni = 0\nwhile i < 50 { s = s + "a" i = i + 1 }\nresult = len(s)' },
    { name: 'Array operation chain', code: 'arr = [1 2 3 4 5]\npush(arr 6)\npop(arr)\nresult = len(arr)' }
];

for (const test of syntaxTests) {
    testFuzzing(test.name, test.code);
}

console.log('\n--- Error Recovery Tests ---');
const errorTests = [
    { name: 'Undefined variable', code: 'result = undefinedVar' },
    { name: 'Type error', code: 'result = 1 + "hello"' },
    { name: 'Invalid operation', code: 'result = [] + {}' },
    { name: 'Parameter count error', code: 'result = len()' },
    { name: 'Index non-array', code: 'result = 42[0]' },
    { name: 'Call non-function', code: 'result = 42()' },
    { name: 'Access null property', code: 'result = null.field' },
    { name: 'Invalid comparison', code: 'result = [] < 5' }
];

for (const test of errorTests) {
    testFuzzing(test.name, test.code);
}

testMustSucceed(
    'Object literal spread success',
    'base = {a: 1 b: 2}\nextra = {b: 3 c: 4}\nobj = {...base ...extra d: 5}\nresult = obj.b == 3 and obj.d == 5'
);

testErrorContains(
    'Object literal computed key invalid syntax message',
    'k = "a"\nobj = {[k 1}\nresult = obj.a',
    /Expected '\]'/i
);

testMustSucceed(
    'Object literal computed key success',
    'k = "x"\nobj = {[k]: 1 y: 2}\nresult = obj.x == 1 and obj.y == 2'
);

testMustSucceed(
    'Object literal spread-computed without comma success',
    'base = {a: 1}\nk = "b"\nobj = {...base [k]: 2}\nresult = obj.a == 1 and obj.b == 2'
);

testMustSucceed(
    'Object literal shorthand success',
    'name = "seed"\nversion = 3\nobj = {name version}\nresult = obj.name == "seed" and obj.version == 3'
);

console.log('\n--- Random Expression Tests ---');
for (let i = 0; i < 30; i++) {
    const expr = randomExpr();
    const code = `result = ${expr}`;
    testFuzzing(`Random expression #${i + 1}`, code);
}

console.log('\n=== Fuzzing Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Crashed: ${crashed}`);
console.log(`Total: ${passed + failed + crashed}`);

process.exit(crashed > 0 ? 1 : 0);
