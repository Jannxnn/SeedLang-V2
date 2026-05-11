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

console.log('=== Radix Literal Tests ===\n');

console.log('--- Binary literals (0b) ---');
test('Binary 0b0', `
result = 0b0
`, (a) => a === 0);
test('Binary 0b1', `
result = 0b1
`, (a) => a === 1);
test('Binary 0b1010', `
result = 0b1010
`, (a) => a === 10);
test('Binary 0b11111111', `
result = 0b11111111
`, (a) => a === 255);
test('Binary 0b10000000', `
result = 0b10000000
`, (a) => a === 128);
test('Binary in expression', `
result = 0b1010 + 5
`, (a) => a === 15);
test('Binary in comparison', `
result = 0b1010 == 10
`, (a) => a === true);
test('Binary in array', `
result = [0b1 0b10 0b100]
`, (a) => JSON.stringify(a) === '[1,2,4]');

console.log('\n--- Octal literals (0o) ---');
test('Octal 0o0', `
result = 0o0
`, (a) => a === 0);
test('Octal 0o7', `
result = 0o7
`, (a) => a === 7);
test('Octal 0o10', `
result = 0o10
`, (a) => a === 8);
test('Octal 0o77', `
result = 0o77
`, (a) => a === 63);
test('Octal 0o377', `
result = 0o377
`, (a) => a === 255);
test('Octal in expression', `
result = 0o10 + 2
`, (a) => a === 10);
test('Octal in comparison', `
result = 0o10 == 8
`, (a) => a === true);

console.log('\n--- Hexadecimal literals (0x) ---');
test('Hex 0x0', `
result = 0x0
`, (a) => a === 0);
test('Hex 0xF', `
result = 0xF
`, (a) => a === 15);
test('Hex 0xFF', `
result = 0xFF
`, (a) => a === 255);
test('Hex 0x10', `
result = 0x10
`, (a) => a === 16);
test('Hex 0xFFFF', `
result = 0xFFFF
`, (a) => a === 65535);
test('Hex lowercase', `
result = 0xff
`, (a) => a === 255);
test('Hex mixed case', `
result = 0xFf
`, (a) => a === 255);
test('Hex 0xABCD', `
result = 0xABCD
`, (a) => a === 43981);
test('Hex in expression', `
result = 0x10 + 16
`, (a) => a === 32);
test('Hex in comparison', `
result = 0xFF == 255
`, (a) => a === true);
test('Hex in array', `
result = [0xA 0xB 0xC]
`, (a) => JSON.stringify(a) === '[10,11,12]');

console.log('\n--- Radix with bitwise ---');
test('Binary AND hex', `
result = 0b11110000 & 0x0F
`, (a) => a === 0);
test('Binary OR hex', `
result = 0b11110000 | 0x0F
`, (a) => a === 255);
test('Octal shift', `
result = 0o10 << 1
`, (a) => a === 16);

console.log('\n--- Radix in function ---');
test('Binary as function arg', `
fn double(x) { return x * 2 }
result = double(0b101)
`, (a) => a === 10);
test('Hex as function arg', `
fn add(a b) { return a + b }
result = add(0xA 0xB)
`, (a) => a === 21);

console.log(`\n=== Result: ${passed} passed ${failed} failed ===`);
