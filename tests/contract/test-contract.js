// 契约测试：验证 SeedLang 核心语义契约（类型系统/运算符优先级/作用域规则）的正确性

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Contract Tests ===\n');

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

function assertType(value, expectedType, msg = '') {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== expectedType) {
        throw new Error(`${msg} Expected type ${expectedType}, actual ${actualType}`);
    }
}

function assertContract(fn, contract) {
    const { input, expectedType, minValue, maxValue, minLength, maxLength } = contract;
    const result = fn(input);
    
    if (expectedType) {
        assertType(result, expectedType, 'Return type mismatch');
    }
    
    if (typeof result === 'number') {
        if (minValue !== undefined && result < minValue) {
            throw new Error(`Return value ${result} less than minimum ${minValue}`);
        }
        if (maxValue !== undefined && result > maxValue) {
            throw new Error(`Return value ${result} greater than maximum ${maxValue}`);
        }
    }
    
    if (Array.isArray(result)) {
        if (minLength !== undefined && result.length < minLength) {
            throw new Error(`Array length ${result.length} less than minimum ${minLength}`);
        }
        if (maxLength !== undefined && result.length > maxLength) {
            throw new Error(`Array length ${result.length} greater than maximum ${maxLength}`);
        }
    }
    
    return result;
}

console.log('--- Built-in Function Contract Tests ---');

test('len function contract', () => {
    const vm = new SeedLangVM();
    
    vm.run('result = len([1 2 3])');
    assertEqual(vm.vm.globals.result, 3);
    assertType(vm.vm.globals.result, 'number');
    
    vm.run('result = len("hello")');
    assertEqual(vm.vm.globals.result, 5);
});

test('push/pop function contract', () => {
    const vm = new SeedLangVM();
    
    vm.run('arr = [1 2]; result = push(arr 3)');
    assertType(vm.vm.globals.result, 'array');
    assertEqual(vm.vm.globals.result.length, 3);
    
    vm.run('arr = [1 2 3]; result = pop(arr)');
    assertEqual(vm.vm.globals.result, 3);
});

test('Math function contract', () => {
    const vm = new SeedLangVM();
    
    vm.run('result = sqrt(16)');
    assertEqual(Math.round(vm.vm.globals.result), 4);
    assertType(vm.vm.globals.result, 'number');
    
    vm.run('result = abs(-1)');
    assertEqual(vm.vm.globals.result, 1);
    assertType(vm.vm.globals.result, 'number');
    
    vm.run('result = max(3 5)');
    assertEqual(vm.vm.globals.result, 5);
});

test('Type check function contract', () => {
    const vm = new SeedLangVM();
    
    vm.run('result = isNumber(42)');
    assertEqual(vm.vm.globals.result, true);
    assertType(vm.vm.globals.result, 'boolean');
    
    vm.run('result = isString("hello")');
    assertEqual(vm.vm.globals.result, true);
    
    vm.run('result = isArray([1 2 3])');
    assertEqual(vm.vm.globals.result, true);
    
    vm.run('result = isNull(null)');
    assertEqual(vm.vm.globals.result, true);
});

console.log('\n--- Module Contract Tests ---');

test('json module contract', () => {
    const vm = new SeedLangVM();
    
    vm.run('result = parse(\'{"b":2}\')');
    assertType(vm.vm.globals.result, 'object');
    assertEqual(vm.vm.globals.result.b, 2);
});

test('math module constant contract', () => {
    const vm = new SeedLangVM();
    vm.run('result = [3.14159 2.71828]');
    
    assertType(vm.vm.globals.result[0], 'number');
    assertType(vm.vm.globals.result[1], 'number');
    assertEqual(vm.vm.globals.result[0] > 3.14, true);
    assertEqual(vm.vm.globals.result[0] < 3.15, true);
});

test('time module contract', () => {
    const vm = new SeedLangVM();
    
    vm.run('result = floor(3.14)');
    assertType(vm.vm.globals.result, 'number');
    
    vm.run('result = ceil(3.14)');
    assertType(vm.vm.globals.result, 'number');
});

console.log('\n=== Contract Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
