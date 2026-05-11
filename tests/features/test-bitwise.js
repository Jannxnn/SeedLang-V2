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

console.log('=== Bitwise Operation Tests ===\n');

console.log('--- Bitwise AND ---');
test('Bitwise AND basic', `
result = 5 & 3
`, (a) => a === 1);
test('Bitwise AND with zero', `
result = 7 & 0
`, (a) => a === 0);
test('Bitwise AND same values', `
result = 15 & 15
`, (a) => a === 15);
test('Bitwise AND large values', `
result = 255 & 15
`, (a) => a === 15);

console.log('\n--- Bitwise OR ---');
test('Bitwise OR basic', `
result = 5 | 3
`, (a) => a === 7);
test('Bitwise OR with zero', `
result = 7 | 0
`, (a) => a === 7);
test('Bitwise OR same values', `
result = 10 | 10
`, (a) => a === 10);
test('Bitwise OR combine bits', `
result = 240 | 15
`, (a) => a === 255);

console.log('\n--- Bitwise XOR ---');
test('Bitwise XOR basic', `
result = 5 ^ 3
`, (a) => a === 6);
test('Bitwise XOR same values (zero)', `
result = 7 ^ 7
`, (a) => a === 0);
test('Bitwise XOR with zero', `
result = 42 ^ 0
`, (a) => a === 42);
test('Bitwise XOR toggle bits', `
result = 255 ^ 15
`, (a) => a === 240);

console.log('\n--- Bitwise NOT ---');
test('Bitwise NOT basic', `
result = ~0
`, (a) => a === -1);
test('Bitwise NOT positive', `
result = ~5
`, (a) => a === -6);
test('Bitwise NOT negative', `
result = ~(-1)
`, (a) => a === 0);
test('Bitwise NOT 255', `
result = ~255
`, (a) => a === -256);

console.log('\n--- Left shift ---');
test('Left shift by 1', `
result = 1 << 1
`, (a) => a === 2);
test('Left shift by 2', `
result = 1 << 2
`, (a) => a === 4);
test('Left shift by 4', `
result = 1 << 4
`, (a) => a === 16);
test('Left shift by 8', `
result = 1 << 8
`, (a) => a === 256);
test('Left shift by 0', `
result = 7 << 0
`, (a) => a === 7);

console.log('\n--- Right shift ---');
test('Right shift by 1', `
result = 4 >> 1
`, (a) => a === 2);
test('Right shift by 2', `
result = 16 >> 2
`, (a) => a === 4);
test('Right shift by 4', `
result = 256 >> 4
`, (a) => a === 16);
test('Right shift by 0', `
result = 7 >> 0
`, (a) => a === 7);
test('Right shift odd number', `
result = 5 >> 1
`, (a) => a === 2);

console.log('\n--- Combined operations ---');
test('AND then OR', `
result = (5 & 3) | 8
`, (a) => a === 9);
test('XOR then AND', `
result = (7 ^ 3) & 6
`, (a) => a === 4);
test('Shift then mask', `
result = (1 << 4) & 15
`, (a) => a === 0);
test('Shift then OR', `
result = (1 << 3) | (1 << 1)
`, (a) => a === 10);
test('NOT then AND', `
result = (~0) & 255
`, (a) => a === 255);

console.log('\n--- Bitwise in conditions ---');
test('Bitwise AND as condition (truthy)', `
result = 0
if 5 & 3 {
    result = 1
}
`, (a) => a === 1);
test('Bitwise AND as condition (falsy)', `
result = 0
if 4 & 2 {
    result = 1
}
`, (a) => a === 0);
test('Bitwise OR as condition', `
result = 0
if 0 | 1 {
    result = 1
}
`, (a) => a === 1);

console.log('\n--- Bitwise in function ---');
test('Bitwise in function', `
fn setBit(n bit) {
    return n | (1 << bit)
}
result = setBit(0 3)
`, (a) => a === 8);
test('Bitwise check bit', `
fn hasBit(n bit) {
    return (n & (1 << bit)) != 0
}
result = hasBit(13 2)
`, (a) => a === true || a === 1);
test('Bitwise clear bit', `
fn clearBit(n bit) {
    mask = 255 ^ (1 << bit)
    return n & mask
}
result = clearBit(7 1)
`, (a) => a === 5);

console.log(`\n=== Result: ${passed} passed ${failed} failed ===`);
