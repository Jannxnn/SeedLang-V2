// 边界条件测试：验证零值、空数组、null、undefined、极大极小数等边界输入的处理

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Boundary Condition Tests ===\n');

const tests = [
    {
        name: 'Array out of bounds - positive index',
        code: `
arr = [1 2 3]
result = arr[10]
`,
        check: (actual) => actual === null || actual === undefined
    },
    {
        name: 'Array out of bounds - negative index',
        code: `
arr = [1 2 3]
result = arr[-1]
`,
        check: (actual) => actual === null || actual === undefined || actual === 3
    },
    {
        name: 'Empty array access',
        code: `
arr = []
result = arr[0]
`,
        check: (actual) => actual === null || actual === undefined
    },
    {
        name: 'Empty object property access',
        code: `
obj = {}
result = obj.nonexistent
`,
        check: (actual) => actual === null || actual === undefined
    },
    {
        name: 'Number maximum value',
        code: `
result = 9007199254740991
`,
        check: (actual) => actual === 9007199254740991
    },
    {
        name: 'Number minimum value',
        code: `
result = -9007199254740991
`,
        check: (actual) => actual === -9007199254740991
    },
    {
        name: 'Floating point precision',
        code: `
result = 0.1 + 0.2
`,
        check: (actual) => Math.abs(actual - 0.3) < 0.0001
    },
    {
        name: 'Very large array',
        code: `
arr = []
i = 0
while i < 10000 {
    push(arr i)
    i = i + 1
}
result = len(arr)
`,
        check: (actual) => actual === 10000
    },
    {
        name: 'Deeply nested object',
        code: `
obj = { value: 1 }
current = obj
i = 0
while i < 100 {
    current.child = { value: i }
    current = current.child
    i = i + 1
}
result = obj.child.child.child.value
`,
        check: (actual) => typeof actual === 'number'
    },
    {
        name: 'Empty string',
        code: `
result = len("")
`,
        check: (actual) => actual === 0
    },
    {
        name: 'Very long string',
        code: `
s = ""
i = 0
while i < 1000 {
    s = s + "x"
    i = i + 1
}
result = len(s)
`,
        check: (actual) => actual === 1000
    },
    {
        name: 'Division by zero handling',
        code: `
result = null
try {
    x = 0 / 0
} catch(e) {
    result = "division error"
}
`,
        check: (actual) => actual === "division error"
    },
    {
        name: 'Null value operation',
        code: `
x = null
result = x == null
`,
        check: (actual) => actual === true
    },
    {
        name: 'Undefined value check',
        code: `
obj = {}
result = obj.missing == null
`,
        check: (actual) => actual === true
    },
    {
        name: 'Boolean boundary',
        code: `
result = true and false or true
`,
        check: (actual) => actual === true
    },
    {
        name: 'String boundary characters',
        code: `
result = len("你好世界🌍")
`,
        check: (actual) => actual >= 4
    },
    {
        name: 'Array boundary modification',
        code: `
arr = [1 2 3]
arr[0] = 100
arr[10] = 200
result = arr[0]
`,
        check: (actual) => actual === 100
    },
    {
        name: 'Object dynamic property',
        code: `
obj = {}
obj.dynamic = "added"
result = obj.dynamic
`,
        check: (actual) => actual === 'added'
    },
    {
        name: 'Loop boundary',
        code: `
sum = 0
i = 0
while i < 0 {
    sum = sum + i
    i = i + 1
}
result = sum
`,
        check: (actual) => actual === 0
    },
    {
        name: 'Recursion depth boundary',
        code: `
fn deep(n) {
    if n <= 0 { return 0 }
    return 1 + deep(n - 1)
}
result = deep(50)
`,
        check: (actual) => actual === 50
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
