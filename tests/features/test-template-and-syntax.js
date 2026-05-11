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

function testError(name, code) {
    const vm = new SeedLangVM();
    try {
        const result = vm.run(code);
        if (!result.success) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: expected error but succeeded`);
            failed++;
        }
    } catch (e) {
        console.log(`[OK] ${name}`);
        passed++;
    }
}

console.log('=== Template String & Syntax Guard Tests ===\n');

console.log('--- Template strings (backtick literals) ---');
test('Simple template string', `
result = \`hello\`
`, (a) => a === 'hello');
test('Empty template string', `
result = \`\`
`, (a) => a === '');
test('Multi-line template string', `
result = \`line1
line2\`
`, (a) => a.includes('line1') && a.includes('line2'));
test('Template string with escaped chars', `
result = \`hello\\nworld\`
`, (a) => a.includes('hello'));

console.log('\n--- String concatenation (alternative to interpolation) ---');
test('String concat with +', `
name = "World"
result = "Hello " + name
`, (a) => a === 'Hello World');
test('String concat with number via type conversion', `
x = 5
result = "Value: " + x
`, (a) => a === 'Value: 5' || a === 'Value: 5');
test('String concat multiple parts', `
a = 1
b = 2
result = "" + a + " + " + b + " = " + (a + b)
`, (a) => a === '1 + 2 = 3');

console.log('\n--- Optional comma separators ---');
test('Comma-separated array', `
result = [1, 2, 3]
`, (a) => JSON.stringify(a) === '[1,2,3]');
test('Comma-separated function args', `
fn add(a b) { return a + b }
result = add(1, 2)
`, (a) => a === 3);
test('Comma-separated function parameters', `
fn add(a, b) { return a + b }
result = add(3, 4)
`, (a) => a === 7);
test('Comma-separated object', `
result = { a: 1, b: 2 }
`, (a) => a.a === 1 && a.b === 2);

console.log('\n--- SeedLang syntax rules ---');
test('Space-separated array', `
result = [1 2 3]
`, (a) => JSON.stringify(a) === '[1,2,3]');
test('Space-separated function args', `
fn add(a b) { return a + b }
result = add(1 2)
`, (a) => a === 3);
test('Space-separated object', `
result = { a: 1 b: 2 }
`, (a) => a.a === 1 && a.b === 2);
test('No semicolons needed', `
x = 1
y = 2
result = x + y
`, (a) => a === 3);
test('For-in loop syntax', `
result = 0
for x in [1 2 3] {
    result = result + x
}
`, (a) => a === 6);

console.log(`\n=== Result: ${passed} passed ${failed} failed ===`);
