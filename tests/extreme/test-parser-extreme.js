// 解析器极端测试：验证词法分析器/语法解析器在畸形输入、超长 token、深度嵌套下的鲁棒性

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Parser Extreme Tests ===\n');

const tests = [
    {
        name: 'Complex expression nesting',
        code: `
result = ((1 + 2) * (3 + 4)) - ((5 - 3) / (2 - 1))
`,
        check: (actual) => actual === 19
    },
    {
        name: 'Chained calls',
        code: `
obj = { a: { b: { c: { d: { e: 42 } } } } }
result = obj.a.b.c.d.e
`,
        check: (actual) => actual === 42
    },
    {
        name: 'Mixed operator precedence',
        code: `
result = 1 + 2 * 3 - 4 / 2 + 5 % 3
`,
        check: (actual) => actual === 7
    },
    {
        name: 'Complex conditional expression',
        code: `
a = 1
b = 2
c = 3
result = (a < b and b < c) or (a > c) or not (a == b)
`,
        check: (actual) => actual === true
    },
    {
        name: 'Array literal nesting',
        code: `
result = [[1 2] [3 [4 5]] [[6]]]
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([[1, 2], [3, [4, 5]], [[6]]])
    },
    {
        name: 'Object literal nesting',
        code: `
result = { a: { b: { c: { d: 1 } } } }
`,
        check: (actual) => actual.a.b.c.d === 1
    },
    {
        name: 'Mixed array object',
        code: `
innerObj = { x: 2 }
innerArr = [3 4]
result = { arr: [1 innerObj innerArr] obj: { y: [5 6] } }
`,
        check: (actual) => actual.arr[1].x === 2 && actual.obj.y[0] === 5
    },
    {
        name: 'Unicode identifier',
        code: `
variable = 42
result_var = variable * 2
result = result_var
`,
        check: (actual) => actual === 84
    },
    {
        name: 'String concatenation chain',
        code: `
a = "Hello"
b = "World"
c = "!"
result = a + " " + b + c
`,
        check: (actual) => actual === 'Hello World!'
    },
    {
        name: 'Array index chain',
        code: `
arr = [[1 2 3] [4 5 6] [7 8 9]]
result = arr[0][0] + arr[1][1] + arr[2][2]
`,
        check: (actual) => actual === 15
    },
    {
        name: 'Object property chain',
        code: `
obj = { a: { b: { c: { d: { e: 100 } } } } }
result = obj.a.b.c.d.e / 2
`,
        check: (actual) => actual === 50
    },
    {
        name: 'Complex arithmetic expression',
        code: `
result = (10 + 5) * 2 - 8 / 4 + 3 % 2
`,
        check: (actual) => actual === 29
    },
    {
        name: 'Boolean expression chain',
        code: `
a = true
b = false
c = true
result = (a and b) or (b and c) or (a and c)
`,
        check: (actual) => actual === true
    },
    {
        name: 'Nested function calls',
        code: `
fn f1(x) { return x + 1 }
fn f2(x) { return f1(x) * 2 }
fn f3(x) { return f2(x) - 1 }
result = f3(5)
`,
        check: (actual) => actual === 11
    },
    {
        name: 'Array method chain',
        code: `
arr = [1 2 3 4 5]
result = len(arr) + arr[0] + arr[4]
`,
        check: (actual) => actual === 11
    },
    {
        name: 'Object method call',
        code: `
obj = { x: 10 y: 20 }
result = obj.x + obj.y
`,
        check: (actual) => actual === 30
    },
    {
        name: 'Object string key with hyphen',
        code: `
obj = {"x-y": 7 "safe": 3}
result = obj["x-y"] + obj.safe
`,
        check: (actual) => actual === 10
    },
    {
        name: 'Deep mixed object with string keys',
        code: `
result = { meta: {"env-name": "prod"} data: { users: [ {name: "a"} {name: "b"} ] } }
`,
        check: (actual) => actual.meta["env-name"] === "prod" && actual.data.users[1].name === "b"
    },
    {
        name: 'Nested string-key object property chain',
        code: `
obj = {"a-b": {"c-d": {"e-f": 11}}}
result = obj["a-b"]["c-d"]["e-f"]
`,
        check: (actual) => actual === 11
    },
    {
        name: 'Object spread layering',
        code: `
base = {a: 1 b: 2}
override = {b: 9 c: 3}
result = {...base ...override d: 4}
`,
        check: (actual) => actual.a === 1 && actual.b === 9 && actual.c === 3 && actual.d === 4
    },
    {
        name: 'Object spread mixed with string keys',
        code: `
meta = {"x-y": 7}
result = {...meta safe: 1}
`,
        check: (actual) => actual["x-y"] === 7 && actual.safe === 1
    },
    {
        name: 'Object computed key with spread mixing',
        code: `
prefix = "env"
key = prefix + "_name"
base = {version: 1}
result = {...base [key]: "prod"}
`,
        check: (actual) => actual.version === 1 && actual["env_name"] === "prod"
    },
    {
        name: 'Object spread-computed mixing without comma',
        code: `
base = {a: 1}
k = "b"
result = {...base [k]: 2}
`,
        check: (actual) => actual.a === 1 && actual.b === 2
    },
    {
        name: 'Object shorthand property keeps identifier value',
        code: `
name = "seed"
version = 2
result = {name version}
`,
        check: (actual) => actual.name === "seed" && actual.version === 2
    },
    {
        name: 'Nested function definition',
        code: `
fn outer(x) {
    fn middle(y) {
        fn inner(z) {
            return x + y + z
        }
        return inner
    }
    return middle
}
result = outer(1)(2)(3)
`,
        check: (actual) => actual === 6
    },
    {
        name: 'Complex assignment chain',
        code: `
a = 1
b = a + 1
c = b + 1
d = c + 1
result = d
`,
        check: (actual) => actual === 4
    },
    {
        name: 'Multi-layer conditional nesting',
        code: `
x = 5
if x > 0 {
    if x < 10 {
        if x == 5 {
            result = "found"
        }
    }
}
`,
        check: (actual) => actual === 'found'
    },
    {
        name: 'Complex loop nesting',
        code: `
sum = 0
i = 1
while i <= 3 {
    j = 1
    while j <= 3 {
        sum = sum + i * j
        j = j + 1
    }
    i = i + 1
}
result = sum
`,
        check: (actual) => actual === 36
    }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    try {
        const vm = new SeedLangVM();
        const r = vm.run(test.code);
        
        if (r.success) {
            const actual = vm.vm.globals.result;
            if (test.check(actual)) {
                console.log(`[PASS] ${test.name}`);
                passed++;
            } else {
                console.log(`[FAIL] ${test.name}: Check failed`);
                failed++;
            }
        } else {
            console.log(`[FAIL] ${test.name}: ${r.error}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${test.name}: ${e.message}`);
        failed++;
    }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

process.exit(failed > 0 ? 1 : 0);
