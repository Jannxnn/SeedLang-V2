// Node.js 版本兼容性测试：验证 SeedLang 在不同 Node.js 版本（LTS / Current）上的兼容性

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Node.js Version Compatibility Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`[OK] ${name}`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, msg = '') {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${msg} Expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`);
    }
}

console.log('--- ES Feature Compatibility Tests ---');

test('Arrow function compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
fn add(a b) { return a + b }
result = add(1 2)
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 3);
});

test('Template string compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
name = "World"
result = "Hello " + name + "!"
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 'Hello World!');
});

test('Destructuring assignment compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
arr = [1 2 3]
a = arr[0]
b = arr[1]
c = arr[2]
result = [a b c]
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, [1, 2, 3]);
});

test('Spread operator compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
arr1 = [1 2 3]
arr2 = []
for item in arr1 {
    push(arr2 item)
}
push(arr2 4)
result = arr2
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, [1, 2, 3, 4]);
});

console.log('\n--- Standard Library Compatibility Tests ---');

test('Array method compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
arr = [1 2 3 4 5]

mapped = []
for item in arr {
    push(mapped item * 2)
}

filtered = []
for item in arr {
    if item > 2 {
        push(filtered item)
    }
}

result = [len(mapped) len(filtered)]
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, [5, 3]);
});

test('Object method compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
obj = { a: 1 b: 2 c: 3 }
result = obj.a + obj.b + obj.c
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 6);
});

test('String method compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
s = "  hello world  "
trimmed = trim(s)
upperStr = upper(s)
lowerStr = lower(s)
result = [trimmed len(upperStr) len(lowerStr)]
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, ['hello world', 15, 15]);
});

console.log('\n--- Module System Compatibility Tests ---');

test('CommonJS module compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
pi = 3.14159
e = 2.71828
result = pi > 3.14 and e > 2.71
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, true);
});

test('Module export compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
pi = 3.14159
e = 2.71828
result = [pi > 3.14 e > 2.71]
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, [true, true]);
});

test('Module function compatibility', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
fn sqrt(n) {
    if n < 0 { return 0 }
    x = n
    i = 0
    while i < 10 {
        x = (x + n / x) / 2
        i = i + 1
    }
    return x
}
result = sqrt(16)
`);
    assertEqual(result.success, true);
    assertEqual(Math.round(vm.vm.globals.result), 4);
});

console.log('\n=== Node.js Version Compatibility Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
