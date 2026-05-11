// 运行时安全与错误报告单元测试：验证运行时安全机制（沙箱/资源限制）和错误报告器的准确性

const { RuntimeSafety } = require('../../src/safety/runtime-safety.js');
const { ErrorReporter } = require('../../src/errors/error-reporter.js');

console.log('='.repeat(60));
console.log('  Runtime Safety and Error Reporter Unit Tests');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || result === undefined) {
            console.log(`[PASS] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: ${result}`);
            failed++;
        }
    } catch (error) {
        console.log(`[FAIL] ${name}: ${error.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} Expected ${expected}, got ${actual}`);
    }
    return true;
}

function assertType(value, type) {
    if (typeof value !== type) {
        throw new Error(`Expected type ${type}, got ${typeof value}`);
    }
    return true;
}

console.log('\n[RuntimeSafety Unit Tests]');
console.log('-'.repeat(60));

test('RuntimeSafety - constructor default values', () => {
    const safety = new RuntimeSafety();
    assertEqual(safety.strictMode, false);
    assertEqual(safety.checkBounds, true);
    assertEqual(safety.checkTypes, true);
    assertEqual(safety.checkNull, true);
    return true;
});

test('RuntimeSafety - custom configuration', () => {
    const safety = new RuntimeSafety({
        strict: true,
        checkBounds: false,
        checkTypes: false,
        checkNull: false
    });
    assertEqual(safety.strictMode, true);
    assertEqual(safety.checkBounds, false);
    assertEqual(safety.checkTypes, false);
    assertEqual(safety.checkNull, false);
    return true;
});

test('RuntimeSafety - arrayGet normal access', () => {
    const safety = new RuntimeSafety();
    const arr = [1, 2, 3, 4, 5];
    
    assertEqual(safety.arrayGet(arr, 0), 1);
    assertEqual(safety.arrayGet(arr, 2), 3);
    assertEqual(safety.arrayGet(arr, 4), 5);
    return true;
});

test('RuntimeSafety - arrayGet out of bounds', () => {
    const safety = new RuntimeSafety();
    const arr = [1, 2, 3];
    
    const result = safety.arrayGet(arr, 10);
    assertEqual(result, null);
    assertEqual(safety.errors.length, 1);
    assertEqual(safety.errors[0].type, 'RangeError');
    return true;
});

test('RuntimeSafety - arrayGet negative index', () => {
    const safety = new RuntimeSafety();
    const arr = [1, 2, 3];
    
    const result = safety.arrayGet(arr, -1);
    assertEqual(result, null);
    assertEqual(safety.errors.length, 1);
    return true;
});

test('RuntimeSafety - arraySet normal set', () => {
    const safety = new RuntimeSafety();
    const arr = [1, 2, 3];
    
    const result = safety.arraySet(arr, 1, 10);
    assertEqual(result, true);
    assertEqual(arr[1], 10);
    return true;
});

test('RuntimeSafety - arraySet out of bounds', () => {
    const safety = new RuntimeSafety();
    const arr = [1, 2, 3];
    
    const result = safety.arraySet(arr, 10, 100);
    assertEqual(result, false);
    assertEqual(safety.errors.length, 1);
    return true;
});

test('RuntimeSafety - objectGet normal access', () => {
    const safety = new RuntimeSafety();
    const obj = { a: 1, b: 2, c: 3 };
    
    assertEqual(safety.objectGet(obj, 'a'), 1);
    assertEqual(safety.objectGet(obj, 'b'), 2);
    return true;
});

test('RuntimeSafety - objectGet null access', () => {
    const safety = new RuntimeSafety();
    
    const result = safety.objectGet(null, 'a');
    assertEqual(result, undefined);
    assertEqual(safety.errors.length, 1);
    assertEqual(safety.errors[0].type, 'TypeError');
    return true;
});

test('RuntimeSafety - objectSet normal set', () => {
    const safety = new RuntimeSafety();
    const obj = { a: 1 };
    
    const result = safety.objectSet(obj, 'b', 2);
    assertEqual(result, true);
    assertEqual(obj.b, 2);
    return true;
});

test('RuntimeSafety - objectSet null set', () => {
    const safety = new RuntimeSafety();
    
    const result = safety.objectSet(null, 'a', 1);
    assertEqual(result, false);
    assertEqual(safety.errors.length, 1);
    return true;
});

test('RuntimeSafety - typeCheck', () => {
    const safety = new RuntimeSafety();
    
    assertEqual(safety.typeCheck(1, 'number'), true);
    assertEqual(safety.typeCheck('hello', 'string'), true);
    assertEqual(safety.typeCheck(true, 'boolean'), true);
    assertEqual(safety.typeCheck([], 'array'), true);
    assertEqual(safety.typeCheck({}, 'object'), true);
    return true;
});

test('RuntimeSafety - nullCheck', () => {
    const safety = new RuntimeSafety();
    
    assertEqual(safety.nullCheck(1), true);
    assertEqual(safety.nullCheck('hello'), true);
    assertEqual(safety.nullCheck(null), false);
    assertEqual(safety.nullCheck(undefined), false);
    return true;
});

test('RuntimeSafety - hasErrors', () => {
    const safety = new RuntimeSafety();
    assertEqual(safety.hasErrors(), false);
    
    safety.arrayGet([1], 10);
    assertEqual(safety.hasErrors(), true);
    return true;
});

test('RuntimeSafety - getErrors', () => {
    const safety = new RuntimeSafety();
    safety.arrayGet([1], 10);
    safety.objectGet(null, 'a');
    
    const errors = safety.getErrors();
    assertEqual(errors.length, 2);
    return true;
});

test('RuntimeSafety - clearErrors', () => {
    const safety = new RuntimeSafety();
    safety.arrayGet([1], 10);
    assertEqual(safety.errors.length, 1);
    
    safety.clearErrors();
    assertEqual(safety.errors.length, 0);
    return true;
});

test('RuntimeSafety - strict mode throws exception', () => {
    const safety = new RuntimeSafety({ strict: true });
    const arr = [1, 2, 3];
    
    let threw = false;
    try {
        safety.arrayGet(arr, 10);
    } catch (e) {
        threw = true;
        assertEqual(e instanceof RangeError, true);
    }
    
    assertEqual(threw, true);
    return true;
});

console.log('\n[ErrorReporter Unit Tests]');
console.log('-'.repeat(60));

test('ErrorReporter - constructor default values', () => {
    const reporter = new ErrorReporter();
    assertEqual(reporter.colors, true);
    assertEqual(reporter.verbose, false);
    assertEqual(reporter.aiFriendly, false);
    return true;
});

test('ErrorReporter - custom configuration', () => {
    const reporter = new ErrorReporter({
        colors: false,
        verbose: true,
        aiFriendly: true
    });
    assertEqual(reporter.colors, false);
    assertEqual(reporter.verbose, true);
    assertEqual(reporter.aiFriendly, true);
    return true;
});

test('ErrorReporter - report error', () => {
    const reporter = new ErrorReporter({ colors: false });
    
    const result = reporter.report({
        type: 'TypeError',
        code: 'TYPE_MISMATCH',
        message: 'Type mismatch',
        line: 5,
        column: 10,
        context: 'x',
        suggestion: 'Please check the type'
    }, 'line1\nline2\nline3\nline4\nx = "hello"');
    
    assertType(result, 'string');
    assertEqual(reporter.errors.length, 1);
    assertEqual(reporter.errors[0].type, 'TypeError');
    return true;
});

test('ErrorReporter - report warning', () => {
    const reporter = new ErrorReporter({ colors: false });
    
    reporter.report({
        type: 'Warning',
        code: 'UNUSED_VAR',
        message: 'Unused variable',
        line: 1,
        column: 1,
        severity: 'warning'
    }, 'x = 1');
    
    assertEqual(reporter.warnings.length, 1);
    assertEqual(reporter.errors.length, 0);
    return true;
});

test('ErrorReporter - formatError', () => {
    const reporter = new ErrorReporter({ colors: false });
    
    const formatted = reporter.formatError({
        type: 'Error',
        code: 'TEST_ERROR',
        message: 'Test error',
        line: 1,
        column: 5,
        context: 'test',
        suggestion: 'This is a suggestion',
        severity: 'error'
    }, 'test code here');
    
    assertType(formatted, 'string');
    return true;
});

test('ErrorReporter - generateAIFriendlyHint', () => {
    const reporter = new ErrorReporter({ aiFriendly: true });
    
    const hint = reporter.generateAIFriendlyHint({
        code: 'TYPE_MISMATCH',
        message: 'Type mismatch'
    });
    
    assertType(hint, 'string');
    return true;
});

test('ErrorReporter - suggestion collection', () => {
    const reporter = new ErrorReporter({ colors: false });
    
    reporter.report({
        type: 'Error',
        code: 'TEST',
        message: 'Error',
        line: 1,
        column: 1,
        suggestion: 'Suggestion 1'
    }, 'code');
    
    reporter.report({
        type: 'Error',
        code: 'TEST',
        message: 'Error 2',
        line: 2,
        column: 1,
        suggestion: 'Suggestion 2'
    }, 'code\ncode2');
    
    assertEqual(reporter.suggestions.length, 2);
    return true;
});

test('ErrorReporter - getSummary', () => {
    const reporter = new ErrorReporter({ colors: false });
    
    reporter.report({
        type: 'Error',
        code: 'TEST',
        message: 'Error',
        line: 1,
        column: 1
    }, 'code');
    
    const report = reporter.getSummary();
    assertType(report, 'string');
    return true;
});

test('ErrorReporter - clear', () => {
    const reporter = new ErrorReporter({ colors: false });
    
    reporter.report({
        type: 'Error',
        code: 'TEST',
        message: 'Error',
        line: 1,
        column: 1
    }, 'code');
    
    assertEqual(reporter.errors.length, 1);
    
    reporter.clear();
    assertEqual(reporter.errors.length, 0);
    assertEqual(reporter.warnings.length, 0);
    assertEqual(reporter.suggestions.length, 0);
    return true;
});

test('ErrorReporter - color output', () => {
    const reporterWithColors = new ErrorReporter({ colors: true });
    const reporterNoColors = new ErrorReporter({ colors: false });
    
    const error = {
        type: 'Error',
        code: 'TEST',
        message: 'Error',
        line: 1,
        column: 1,
        context: 'x',
        severity: 'error'
    };
    
    const withColors = reporterWithColors.formatError(error, 'code');
    const noColors = reporterNoColors.formatError(error, 'code');
    
    assertType(withColors, 'string');
    assertType(noColors, 'string');
    return true;
});

console.log('\n' + '='.repeat(60));
console.log('  Test Summary');
console.log('='.repeat(60));
console.log(`\nTotal: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed === 0) {
    console.log('\n[OK] All unit tests passed!');
    process.exit(0);
} else {
    console.log('\n[FAIL] Some tests failed');
    process.exit(1);
}
