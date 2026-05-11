// 类型系统测试：验证类型注解、类型推断、类型检查、类型转换、联合类型等类型系统功能

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Type System Tests ===\n');

const tests = [
    {
        name: 'type() number type',
        code: `result = type(42)`,
        check: (actual) => actual === 'number'
    },
    {
        name: 'type() string type',
        code: `result = type("hello")`,
        check: (actual) => actual === 'string'
    },
    {
        name: 'type() boolean type',
        code: `result = type(true)`,
        check: (actual) => actual === 'boolean'
    },
    {
        name: 'type() array type',
        code: `result = type([1 2 3])`,
        check: (actual) => actual === 'array'
    },
    {
        name: 'type() object type',
        code: `result = type({ a: 1 })`,
        check: (actual) => actual === 'object'
    },
    {
        name: 'type() null type',
        code: `result = type(null)`,
        check: (actual) => actual === 'null'
    },
    {
        name: 'type() function type',
        code: `
fn test() { return 1 }
result = type(test)
`,
        check: (actual) => actual === 'function'
    },
    {
        name: 'isNumber() test',
        code: `
result = []
push(result isNumber(42))
push(result isNumber(3.14))
push(result isNumber("42"))
push(result isNumber(true))
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([true, true, false, false])
    },
    {
        name: 'isString() test',
        code: `
result = []
push(result isString("hello"))
push(result isString(42))
push(result isString([1 2]))
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([true, false, false])
    },
    {
        name: 'isArray() test',
        code: `
result = []
push(result isArray([1 2]))
push(result isArray({ a: 1 }))
push(result isArray("array"))
push(result isArray(null))
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([true, false, false, false])
    },
    {
        name: 'isObject() test',
        code: `
result = []
push(result isObject({ a: 1 }))
push(result isObject([1 2]))
push(result isObject(null))
push(result isObject("obj"))
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([true, false, false, false])
    },
    {
        name: 'isFunction() test',
        code: `
fn test() { return 1 }
result = []
push(result isFunction(test))
push(result isFunction(42))
push(result isFunction([1 2]))
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([true, false, false])
    },
    {
        name: 'isNull() test',
        code: `
result = []
push(result isNull(null))
push(result isNull(undefined))
push(result isNull(0))
push(result isNull(""))
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([true, true, false, false])
    },
    {
        name: 'number() type conversion',
        code: `
result = []
push(result number("42"))
push(result number(3.14))
push(result number("not a number"))
`,
        check: (actual) => actual[0] === 42 && actual[1] === 3.14
    },
    {
        name: 'string() type conversion',
        code: `
result = []
push(result string(123))
push(result string(true))
push(result string([1 2]))
`,
        check: (actual) => actual[0] === '123' && actual[1] === 'true'
    },
    {
        name: 'bool() type conversion',
        code: `
result = []
push(result bool(1))
push(result bool(0))
push(result bool(""))
push(result bool("hello"))
push(result bool([]))
push(result bool([1]))
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([true, false, false, true, false, true])
    },
    {
        name: 'int() type conversion',
        code: `
result = []
push(result int(3.7))
push(result int("42"))
push(result int(-3.9))
`,
        check: (actual) => actual[0] === 3 && actual[1] === 42 && actual[2] === -3
    },
    {
        name: 'float() type conversion',
        code: `
result = []
push(result float("3.14"))
push(result float(42))
`,
        check: (actual) => actual[0] === 3.14 && actual[1] === 42
    },
    {
        name: 'Type check function parameters',
        code: `
fn add(a b) {
    if not isNumber(a) or not isNumber(b) {
        return "error"
    }
    return a + b
}
result = add(1 2)
`,
        check: (actual) => actual === 3
    },
    {
        name: 'Type check error handling',
        code: `
fn safeAdd(a b) {
    if not isNumber(a) or not isNumber(b) {
        return null
    }
    return a + b
}
result = safeAdd("1" 2)
`,
        check: (actual) => actual === null
    }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    const vm = new SeedLangVM();
    try {
        const result = vm.run(test.code);
        
        if (result.success === false) {
            console.log(`[FAIL] ${test.name}: ${result.error}`);
            failed++;
            continue;
        }
        
        const actual = vm.vm.globals.result;
        
        if (test.check(actual)) {
            console.log(`[OK] ${test.name}: ${JSON.stringify(actual)}`);
            passed++;
        } else {
            console.log(`[FAIL] ${test.name}: unexpected result ${JSON.stringify(actual)}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${test.name}: ${e.message}`);
        failed++;
    }
}

console.log(`\n=== Result: ${passed} passed ${failed} failed ===`);
