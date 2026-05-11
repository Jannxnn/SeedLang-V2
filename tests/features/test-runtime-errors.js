const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;

function test(name, code, check) {
    const vm = new SeedLangVM();
    try {
        const result = vm.run(code);
        const actual = vm.vm.globals.result;
        if (check(actual, result)) {
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

function testReturnsNullOrUndefined(name, code) {
    const vm = new SeedLangVM();
    try {
        const result = vm.run(code);
        const actual = vm.vm.globals.result;
        if (actual === null || actual === undefined) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: got ${String(actual)}, expected null/undefined`);
            failed++;
        }
    } catch (e) {
        console.log(`[OK] ${name}`);
        passed++;
    }
}

console.log('=== Runtime Error Path Tests ===\n');

console.log('--- Division by zero ---');
testError('Integer division by zero', `result = 10 / 0`);
testError('Float division by zero', `result = 3.14 / 0`);
test('Modulo by zero returns NaN', `result = 10 % 0`, (a) => Number.isNaN(a));

console.log('\n--- Undefined variable ---');
testReturnsNullOrUndefined('Access undefined variable', `result = undefined_var`);
testReturnsNullOrUndefined('Call undefined function', `result = unknownFn(1 2)`);

console.log('\n--- Type errors ---');
testReturnsNullOrUndefined('Call non-function value returns null', `x = 42\nresult = x()`);
testReturnsNullOrUndefined('Call string as function returns null', `x = "hello"\nresult = x()`);
testReturnsNullOrUndefined('Call number as function returns null', `x = 3.14\nresult = x()`);
testReturnsNullOrUndefined('Call array as function returns null', `x = [1 2 3]\nresult = x()`);
test('String + number concatenation', `result = "hello" + 5`, (a) => a === 'hello5');

console.log('\n--- Array out of bounds ---');
test('Array positive index in bounds', `arr = [10 20 30]\nresult = arr[1]`, (a) => a === 20);
test('Array index zero', `arr = [10 20 30]\nresult = arr[0]`, (a) => a === 10);
testReturnsNullOrUndefined('Array index out of bounds (positive)', `arr = [1 2 3]\nresult = arr[10]`);
testReturnsNullOrUndefined('Array index out of bounds (negative)', `arr = [1 2 3]\nresult = arr[-1]`);

console.log('\n--- Null/undefined access ---');
testReturnsNullOrUndefined('Access property of null', `result = null.x`);
testReturnsNullOrUndefined('Access property of null variable', `x = null\nresult = x.y`);

console.log('\n--- Stack overflow ---');
testError('Infinite recursion', `fn inf() { return inf() }\nresult = inf()`);

console.log('\n--- Error recovery with try-catch ---');
test('Catch division by zero', `result = "safe"\ntry {\n    x = 10 / 0\n} catch(e) {\n    result = "caught"\n}`, (a) => a === 'caught');
test('Try-catch preserves flow', `result = "before"\ntry {\n    result = "during"\n} catch(e) {\n    result = "caught"\n}\nresult = result + "-after"`, (a) => a === 'during-after');
test('Catch with finally', `result = ""\ntry {\n    result = result + "try"\n} catch(e) {\n    result = result + "catch"\n} finally {\n    result = result + "finally"\n}`, (a) => a === 'tryfinally');
test('Catch error then continue', `result = 0\ntry {\n    x = 1 / 0\n} catch(e) {\n    result = result + 1\n}\nresult = result + 10`, (a) => a === 11);

console.log(`\n=== Result: ${passed} passed ${failed} failed ===`);
