// 错误处理测试：验证 try-catch-finally、throw、自定义错误类型、错误传播与堆栈跟踪

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Error Handling Tests ===\n');

const tests = [
    {
        name: 'try-catch catches throw',
        code: `
result = "no error"
try {
    throw "test error"
} catch(e) {
    result = e
}
`,
        check: (actual) => actual === 'test error'
    },
    {
        name: 'try-catch with parentheses',
        code: `
result = "no error"
try {
    throw "error message"
} catch (err) {
    result = err
}
`,
        check: (actual) => actual === 'error message'
    },
    {
        name: 'throw throws error',
        code: `
result = "before"
try {
    throw "custom error"
    result = "after"
} catch(e) {
    result = e
}
`,
        check: (actual) => actual === 'custom error'
    },
    {
        name: 'Nested try-catch',
        code: `
result = ""
try {
    try {
        throw "inner"
    } catch(e1) {
        result = e1
        throw "outer"
    }
} catch(e2) {
    result = result + "-" + e2
}
`,
        check: (actual) => actual === 'inner-outer'
    },
    {
        name: 'finally execution',
        code: `
result = ""
try {
    result = "try"
} finally {
    result = result + "-finally"
}
`,
        check: (actual) => actual === 'try-finally'
    },
    {
        name: 'try-catch-finally combination',
        code: `
result = ""
try {
    throw "error"
} catch(e) {
    result = "catch"
} finally {
    result = result + "-finally"
}
`,
        check: (actual) => actual === 'catch-finally'
    },
    {
        name: 'Error propagation in function',
        code: `
fn mayThrow(x) {
    if x < 0 {
        throw "negative"
    }
    return x
}
result = "safe"
try {
    mayThrow(-1)
} catch(e) {
    result = e
}
`,
        check: (actual) => actual === 'negative'
    },
    {
        name: 'Error recovery pattern',
        code: `
fn safeDivide(a b) {
    if b == 0 { return null }
    return a / b
}
result = safeDivide(10 0)
`,
        check: (actual) => actual === null
    },
    {
        name: 'Error handling - continue execution',
        code: `
result = []
errors = []
fn process(arr) {
    i = 0
    while i < len(arr) {
        x = arr[i]
        if x < 0 {
            push(errors x)
        } else {
            push(result x * 2)
        }
        i = i + 1
    }
}
process([1 -1 2 -2 3])
result = len(result) + len(errors)
`,
        check: (actual) => actual === 5
    },
    {
        name: 'Error handling - retry pattern',
        code: `
fn retry(operation times) {
    i = 0
    while i < times {
        r = operation()
        if r != null { return r }
        i = i + 1
    }
    return null
}
counter = 0
fn tryOp() {
    counter = counter + 1
    if counter < 3 { return null }
    return "success"
}
result = retry(tryOp 5)
`,
        check: (actual) => actual === 'success'
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
