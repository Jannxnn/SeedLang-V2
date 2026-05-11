/**
 * 模式匹配测试：验证解构匹配、守卫条件、嵌套模式、类型模式等模式匹配特性
 * Pattern Matching Testing
 */

const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, code, expected) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(code);
        
        const resultValue = vm.vm.globals.result !== undefined ? vm.vm.globals.result : (typeof result === 'object' ? result.value : result);
        const expectedValue = expected;
        
        if (JSON.stringify(resultValue) === JSON.stringify(expectedValue)) {
            console.log(`  [OK] ${name}`);
            passed++;
        } else {
            throw new Error(`Expected ${JSON.stringify(expectedValue)} but got ${JSON.stringify(resultValue)}`);
        }
    } catch (e) {
        console.log(`  [FAIL] ${name}: ${e.message}`);
        failed++;
        failures.push({ name, error: e.message });
    }
}

function testError(name, code, expectedError) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(code);
        if (result && result.success === false && result.error && result.error.includes(expectedError)) {
            console.log(`  [OK] ${name}`);
            passed++;
        } else if (result && result.success === false && result.error) {
            console.log(`  [FAIL] ${name}: Expected error "${expectedError}" but got "${result.error}"`);
            failed++;
            failures.push({ name, error: result.error });
        } else {
            console.log(`  [FAIL] ${name}: Expected error but got success`);
            failed++;
            failures.push({ name, error: 'Expected error but got success' });
        }
    } catch (e) {
        if (e.message.includes(expectedError)) {
            console.log(`  [OK] ${name}`);
            passed++;
        } else {
            console.log(`  [FAIL] ${name}: Expected error "${expectedError}" but got "${e.message}"`);
            failed++;
            failures.push({ name, error: e.message });
        }
    }
}

console.log('+============================================================+');
console.log('|      SeedLang Pattern Matching Tests                     |');
console.log('|      Pattern Matching Testing                            |');
console.log('+============================================================+\n');

// ============================================
// 1. Literal Patterns
// ============================================
console.log('[1. Literal Patterns]');

test('Match number', `
result = match 42 {
    1 => "one"
    2 => "two"
    42 => "forty-two"
    _ => "other"
}
`, 'forty-two');

test('Match string', `
result = match "hello" {
    "world" => "not match"
    "hello" => "matched"
    _ => "other"
}
`, 'matched');

test('Match boolean', `
result = match true {
    false => "no"
    true => "yes"
}
`, 'yes');

test('Match null', `
result = match null {
    "value" => "not null"
    null => "is null"
}
`, 'is null');

test('Wildcard match', `
result = match 999 {
    1 => "one"
    2 => "two"
    _ => "wildcard"
}
`, 'wildcard');

// ============================================
// 2. Identifier Patterns
// ============================================
console.log('\n[2. Identifier Patterns]');

test('Bind variable', `
result = match 42 {
    x => x
}
`, 42);

test('Use bound variable', `
result = match 10 {
    n => n * 2
}
`, 20);

// ============================================
// 3. Range Patterns
// ============================================
console.log('\n[3. Range Patterns]');

test('Number range match', `
result = match 5 {
    1..3 => "small"
    4..6 => "medium"
    7..10 => "large"
    _ => "out of range"
}
`, 'medium');

test('Range boundary', `
result = match 3 {
    1..3 => "in range"
    _ => "out of range"
}
`, 'in range');

// ============================================
// 4. Or Patterns
// ============================================
console.log('\n[4. Or Patterns]');

test('Multiple value match', `
result = match 5 {
    1 | 2 | 3 => "small"
    4 | 5 | 6 => "medium"
    _ => "other"
}
`, 'medium');

test('String or match', `
result = match "apple" {
    "apple" | "banana" => "fruit"
    "carrot" | "potato" => "vegetable"
    _ => "unknown"
}
`, 'fruit');

// ============================================
// 5. Array Patterns
// ============================================
console.log('\n[5. Array Patterns]');

test('Match empty array', `
result = match [] {
    [] => "empty"
    _ => "not empty"
}
`, 'empty');

test('Match single element array', `
result = match [42] {
    [x] => x
    _ => 0
}
`, 42);

test('Match multi-element array', `
result = match [1 2 3] {
    [a b c] => a + b + c
    _ => 0
}
`, 6);

test('Array length mismatch', `
result = match [1 2] {
    [a b c] => "three"
    [a b] => "two"
    _ => "other"
}
`, 'two');

// ============================================
// 6. Object Patterns
// ============================================
console.log('\n[6. Object Patterns]');

test('Match object properties', `
result = match {x: 1 y: 2} {
    {x: a y: b} => a + b
    _ => 0
}
`, 3);

test('Partial property match', `
result = match {x: 1 y: 2 z: 3} {
    {x: a} => a
    _ => 0
}
`, 1);

test('Nested object match', `
point = {x: 10 y: 20}
result = match point {
    {x: 0 y: 0} => "origin"
    {x: x y: 0} => "on x-axis"
    {x: 0 y: y} => "on y-axis"
    {x: x y: y} => "at point"
}
`, 'at point');

// ============================================
// 7. Guard Conditions
// ============================================
console.log('\n[7. Guard Conditions]');

test('Guard condition - positive', `
result = match 42 {
    n if n > 0 => "positive"
    n if n < 0 => "negative"
    _ => "zero"
}
`, 'positive');

test('Guard condition - negative', `
result = match -5 {
    n if n > 0 => "positive"
    n if n < 0 => "negative"
    _ => "zero"
}
`, 'negative');

test('Guard condition - zero', `
result = match 0 {
    n if n > 0 => "positive"
    n if n < 0 => "negative"
    _ => "zero"
}
`, 'zero');

test('Complex guard', `
result = match 15 {
    n if n % 2 == 0 => "even"
    n if n % 2 == 1 => "odd"
    _ => "unknown"
}
`, 'odd');

// ============================================
// 8. Type Patterns
// ============================================
console.log('\n[8. Type Patterns]');

test('Type check - number', `
result = match 42 {
    n: number => "is number"
    s: string => "is string"
    _ => "other"
}
`, 'is number');

test('Type check - string', `
result = match "hello" {
    n: number => "is number"
    s: string => "is string"
    _ => "other"
}
`, 'is string');

test('Type check - array', `
result = match [1 2 3] {
    arr: array => "is array"
    _ => "other"
}
`, 'is array');

test('Type check - object', `
result = match {a: 1} {
    obj: object => "is object"
    _ => "other"
}
`, 'is object');

// ============================================
// 9. Complex Patterns
// ============================================
console.log('\n[9. Complex Patterns]');

test('Nested array', `
result = match [[1 2] [3 4]] {
    [[a b] [c d]] => a + b + c + d
    _ => 0
}
`, 10);

test('Array in object', `
result = match {items: [1 2 3]} {
    {items: [first ...rest]} => first
    _ => 0
}
`, 1);

test('Multi-branch match', `
classify = fn(n) {
    return match n {
        0 => "zero"
        1 => "one"
        2..10 => "small"
        11..100 => "medium"
        101..1000 => "large"
        _ => "huge"
    }
}
result = classify(5)
`, 'small');

test('Recursive pattern match', `
fib = fn(n) {
    return match n {
        0 => 0
        1 => 1
        _ => fib(n - 1) + fib(n - 2)
    }
}
result = fib(10)
`, 55);

// ============================================
// 10. Error Handling
// ============================================
console.log('\n[10. Error Handling]');

testError('No matching pattern', `
match 42 {
    1 => "one"
    2 => "two"
}
`, 'No matching pattern');

// ============================================
// Test Summary
// ============================================
console.log('\n============================================================');
console.log('                      Test Summary                         ');
console.log('============================================================');

console.log(`\n  Total tests: ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);

if (failures.length > 0) {
    console.log('\nFailed test details:');
    for (const f of failures) {
        console.log(`  - ${f.name}: ${f.error}`);
    }
}

console.log('\n============================================================');
console.log('\nPattern Matching Features:');
console.log('+---------------------+-------------------------------------+');
console.log('| Pattern Type        | Example                             |');
console.log('+---------------------+-------------------------------------+');
console.log('| Literal             | 42, "hello", true, null             |');
console.log('| Wildcard            | _                                   |');
console.log('| Identifier          | x, value                            |');
console.log('| Range               | 1..10                               |');
console.log('| Or pattern          | 1 | 2 | 3                           |');
console.log('| Array               | [a b c]                             |');
console.log('| Object              | {x: a y: b}                        |');
console.log('| Type                | n: number                           |');
console.log('| Guard               | n if n > 0                          |');
console.log('+---------------------+-------------------------------------+');

if (failed === 0) {
    console.log('\n[OK] All pattern matching tests passed!\n');
} else {
    console.log(`\n[FAIL] ${failed} tests failed, please check!\n`);
}

process.exit(failed > 0 ? 1 : 0);
