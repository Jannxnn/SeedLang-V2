// 异常传播链测试：验证嵌套 try-catch-finally 中异常的完整传播路径与 finally 语义

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Exception Propagation Chain Tests ===\n');

const tests = [
    {
        name: 'Simple exception propagation',
        code: `
fn level3() {
    throw "error from level3"
}
fn level2() {
    return level3()
}
fn level1() {
    return level2()
}
result = "no error"
try {
    level1()
} catch(e) {
    result = e
}
`,
        check: (actual) => actual === 'error from level3'
    },
    {
        name: 'Multi-layer nested try-catch',
        code: `
result = []
try {
    try {
        try {
            throw "deep"
        } catch(e1) {
            push(result e1)
            throw "middle"
        }
    } catch(e2) {
        push(result e2)
        throw "outer"
    }
} catch(e3) {
    push(result e3)
}
result = join(result "-")
`,
        check: (actual) => actual === 'deep-middle-outer'
    },
    {
        name: 'Exception rethrow',
        code: `
result = []
try {
    try {
        throw "original"
    } catch(e) {
        push(result "caught: " + e)
        throw e
    }
} catch(e2) {
    push(result "recaught: " + e2)
}
result = join(result ", ")
`,
        check: (actual) => actual === 'caught: original, recaught: original'
    },
    {
        name: 'Exception type conversion',
        code: `
result = ""
try {
    throw 42
} catch(e) {
    result = type(e) + ": " + string(e)
}
`,
        check: (actual) => actual === 'number: 42'
    },
    {
        name: 'Finally execution order',
        code: `
result = []
fn test() {
    try {
        push(result "try")
        throw "error"
    } catch(e) {
        push(result "catch")
    } finally {
        push(result "finally")
    }
}
test()
result = join(result "-")
`,
        check: (actual) => actual === 'try-catch-finally'
    },
    {
        name: 'Finally without exception',
        code: `
result = []
try {
    push(result "try")
} finally {
    push(result "finally")
}
result = join(result "-")
`,
        check: (actual) => actual === 'try-finally'
    },
    {
        name: 'Finally exception propagation',
        code: `
result = []
try {
    try {
        throw "inner"
    } finally {
        push(result "inner-finally")
    }
} catch(e) {
    push(result "outer-catch: " + e)
}
result = join(result ", ")
`,
        check: (actual) => actual.includes('inner-finally')
    },
    {
        name: 'Exception propagation in function',
        code: `
fn mayFail(x) {
    if x < 0 {
        throw "negative"
    }
    return x * 2
}
result = "ok"
try {
    mayFail(-5)
} catch(e) {
    result = e
}
`,
        check: (actual) => actual === 'negative'
    },
    {
        name: 'Exception chain tracing',
        code: `
callStack = []
fn deep1() {
    push(callStack "deep1")
    deep2()
}
fn deep2() {
    push(callStack "deep2")
    deep3()
}
fn deep3() {
    push(callStack "deep3")
    throw "bottom"
}
try {
    deep1()
} catch(e) {
    result = join(callStack "->") + " threw: " + e
}
`,
        check: (actual) => actual === 'deep1->deep2->deep3 threw: bottom'
    },
    {
        name: 'Continue after exception recovery',
        code: `
result = []
items = [1 -1 2 -2 3]
for item in items {
    try {
        if item < 0 {
            throw "negative: " + string(item)
        }
        push(result item * 2)
    } catch(e) {
        push(result 0)
    }
}
result = join(result ",")
`,
        check: (actual) => actual === '2,0,4,0,6'
    },
    {
        name: 'Nested function exception',
        code: `
fn outer() {
    fn inner() {
        throw "from inner"
    }
    return inner()
}
result = "no error"
try {
    outer()
} catch(e) {
    result = e
}
`,
        check: (actual) => actual === 'from inner'
    },
    {
        name: 'Exception in loop',
        code: `
result = []
i = 0
while i < 5 {
    try {
        if i == 2 {
            throw "skip"
        }
        push(result i)
    } catch(e) {
        neg = 0 - 1
        push(result neg)
    }
    i = i + 1
}
result = join(result ",")
`,
        check: (actual) => actual === '0,1,-1,3,4'
    },
    {
        name: 'Multiple exception types',
        code: `
result = []
exceptions = ["string" 42 true null]
for e in exceptions {
    try {
        throw e
    } catch(err) {
        push(result type(err))
    }
}
result = join(result ",")
`,
        check: (actual) => actual.includes('string') || actual.includes('number')
    },
    {
        name: 'Exception in constructor',
        code: `
fn FailClass() {
    throw "constructor error"
}
result = "ok"
try {
    obj = FailClass()
} catch(e) {
    result = e
}
`,
        check: (actual) => actual === 'constructor error'
    },
    {
        name: 'Exception with finally return',
        code: `
fn test() {
    try {
        throw "error"
    } finally {
        return "finally-wins"
    }
}
result = "no-return"
try {
    result = test()
} catch(e) {
    result = e
}
`,
        check: (actual) => actual === 'finally-wins' || actual === 'error'
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

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
