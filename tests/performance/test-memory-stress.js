// 内存压力测试：验证大数组分配、深递归、频繁 GC 等内存密集型场景下的稳定性

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Memory Stress Tests ===\n');

const tests = [
    {
        name: 'Large array creation',
        code: `
arr = []
i = 0
while i < 50000 {
    push(arr i)
    i = i + 1
}
result = len(arr)
`,
        check: (actual) => actual === 50000
    },
    {
        name: 'Large object creation',
        code: `
obj = {}
i = 0
while i < 10000 {
    obj["key" + i] = i
    i = i + 1
}
result = obj["key5000"]
`,
        check: (actual) => actual === 5000
    },
    {
        name: 'Deep recursion - tail recursion optimization',
        code: `
fn tailRecurse(n acc) {
    if n == 0 { return acc }
    return tailRecurse(n - 1 acc + 1)
}
result = tailRecurse(500 0)
`,
        check: (actual) => actual === 500
    },
    {
        name: 'String accumulation',
        code: `
s = ""
i = 0
while i < 10000 {
    s = s + "x"
    i = i + 1
}
result = len(s)
`,
        check: (actual) => actual === 10000
    },
    {
        name: 'Nested array',
        code: `
arr = []
current = arr
i = 0
while i < 1000 {
    current[0] = []
    current = current[0]
    i = i + 1
}
result = "ok"
`,
        check: (actual) => actual === 'ok'
    },
    {
        name: 'Object reference chain',
        code: `
root = { value: 0 }
current = root
i = 0
while i < 1000 {
    current.next = { value: i }
    current = current.next
    i = i + 1
}
result = root.next.next.next.value
`,
        check: (actual) => typeof actual === 'number'
    },
    {
        name: 'Function closure memory',
        code: `
result = 0
fn makeAdder(x) {
    return x
}
i = 0
while i < 100 {
    result = result + makeAdder(i)
    i = i + 1
}
`,
        check: (actual) => actual === 4950
    },
    {
        name: 'Array operation stress',
        code: `
arr = []
i = 0
while i < 10000 {
    push(arr i)
    i = i + 1
}
sum = 0
for x in arr {
    sum = sum + x
}
result = sum
`,
        check: (actual) => actual === 49995000
    },
    {
        name: 'Object operation stress',
        code: `
data = []
i = 0
while i < 1000 {
    push(data { id: i value: i * 2 name: "item" + i })
    i = i + 1
}
total = 0
for item in data {
    total = total + item.value
}
result = total
`,
        check: (actual) => actual === 999000
    },
    {
        name: 'Memory reuse test',
        code: `
fn process() {
    temp = []
    i = 0
    while i < 1000 {
        push(temp i)
        i = i + 1
    }
    return len(temp)
}
result = 0
i = 0
while i < 100 {
    result = result + process()
    i = i + 1
}
`,
        check: (actual) => actual === 100000
    }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(test.code);
        
        if (!result.success) {
            console.log(`[FAIL] ${test.name}: ${result.error}`);
            failed++;
            continue;
        }
        
        const actual = vm.vm.globals.result;
        
        if (test.check(actual)) {
            console.log(`[OK] ${test.name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${test.name}: Check failed, actual ${JSON.stringify(actual)}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${test.name}: Exception - ${e.message}`);
        failed++;
    }
}

console.log('\n=== Memory Stress Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

process.exit(failed > 0 ? 1 : 0);
