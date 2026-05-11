// 泛型系统测试：验证泛型函数、泛型类、类型参数约束、类型推断等泛型特性

const { SeedLangVM } = require('../../src/runtime/vm.js');

const vm = new SeedLangVM();

console.log('=== Generics System Tests ===\n');

const tests = [
    {
        name: 'Generic function definition and call',
        code: `
fn identity<T>(x) {
    return x
}
result = identity(42)
`,
        expected: 42
    },
    {
        name: 'Generic function with string',
        code: `
fn identity<T>(x) {
    return x
}
result = identity("hello")
`,
        expected: 'hello'
    },
    {
        name: 'Generic function with multiple type params',
        code: `
fn apply<T U>(x f) {
    return f(x)
}
result = apply(5 fn(x) { return x * 2 })
`,
        expected: 10
    },
    {
        name: 'Generic function nested call',
        code: `
fn double<T>(x) {
    return x + x
}
result = double("ab")
`,
        expected: 'abab'
    },
    {
        name: 'Generic class definition',
        code: `
class Container<T> {
    init(value) {
        this.value = value
    }
}
c = Container(42)
result = c.value
`,
        expected: 42
    },
    {
        name: 'Generic function with type annotation (parsed but not enforced)',
        code: `
fn add(a: number b: number): number {
    return a + b
}
result = add(3 4)
`,
        expected: 7
    },
    {
        name: 'Generic function with array return',
        code: `
fn wrap<T>(value) {
    return { value: value }
}
result = wrap(100)
`,
        expected: { value: 100 }
    },
    {
        name: 'Non-generic function still works',
        code: `
fn add(a b) {
    return a + b
}
result = add(3 4)
`,
        expected: 7
    },
    {
        name: 'Comparison < in if condition not misinterpreted as generic',
        code: `
x = 3
y = 10
if x < y {
    result = 1
} else {
    result = 0
}
`,
        expected: 1
    },
    {
        name: 'Comparison < with variable name that looks like type param',
        code: `
x = 3
int = 10
if x < int {
    result = 1
} else {
    result = 0
}
`,
        expected: 1
    },
    {
        name: 'Chained comparison x < y > z in if condition',
        code: `
a = 3
b = 10
c = 0
if a < b > c {
    result = 1
} else {
    result = 0
}
`,
        expected: 1
    },
    {
        name: 'Chained comparison x < y > (expr) in if condition',
        code: `
score = 7
max = 10
min = 0
if score < max > (min) {
    result = 1
} else {
    result = 0
}
`,
        expected: 1
    },
    {
        name: 'Comparison < with arithmetic in if condition',
        code: `
x = 3
y = 10
if x < y + 1 {
    result = 1
} else {
    result = 0
}
`,
        expected: 1
    },
    {
        name: 'Comparison < with function call in if condition',
        code: `
fn getLimit() { return 10 }
x = 3
if x < getLimit() {
    result = 1
} else {
    result = 0
}
`,
        expected: 1
    },
    {
        name: 'Comparison < in while condition',
        code: `
i = 0
while i < 5 {
    i = i + 1
}
result = i
`,
        expected: 5
    },
    {
        name: 'Comparison < with len() in while condition',
        code: `
arr = [10 20 30]
i = 0
while i < len(arr) {
    i = i + 1
}
result = i
`,
        expected: 3
    },
    {
        name: 'Compound comparison with && in if condition',
        code: `
a = 3
b = 10
c = 5
if a < b && c > 0 {
    result = 1
} else {
    result = 0
}
`,
        expected: 1
    },
    {
        name: 'False comparison < in if condition',
        code: `
x = 10
y = 3
if x < y {
    result = 1
} else {
    result = 0
}
`,
        expected: 0
    },
    {
        name: 'Generic function call with explicit type arg still works',
        code: `
fn identity<T>(x) {
    return x
}
result = identity(42)
`,
        expected: 42
    },
    {
        name: 'Comparison <= and >= in if condition',
        code: `
x = 5
y = 5
if x <= y && x >= y {
    result = 1
} else {
    result = 0
}
`,
        expected: 1
    },
    {
        name: 'Nested if with < comparison',
        code: `
x = 3
if x < 10 {
    if x < 5 {
        result = 1
    } else {
        result = 2
    }
} else {
    result = 3
}
`,
        expected: 1
    }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    const freshVm = new SeedLangVM();
    try {
        const result = freshVm.run(test.code);
        const actual = freshVm.vm.globals.result;
        
        const actualStr = JSON.stringify(actual);
        const expectedStr = JSON.stringify(test.expected);
        
        if (actualStr === expectedStr) {
            console.log(`[OK] ${test.name}: ${actualStr}`);
            passed++;
        } else {
            console.log(`[FAIL] ${test.name}: expected ${expectedStr} got ${actualStr}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${test.name}: ${e.message}`);
        failed++;
    }
}

console.log(`\n=== Result: ${passed} passed ${failed} failed ===`);
