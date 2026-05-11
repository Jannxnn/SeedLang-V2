// 语义边界测试：验证类型系统边界、作用域边界、运算符优先级边界等语义层面的正确性

const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;

function ok(name) {
    console.log(`[OK] ${name}`);
    passed++;
}

function fail(name, msg) {
    console.log(`[FAIL] ${name}: ${msg}`);
    failed++;
}

function runCase({ name, code, expectSuccess = true, check }) {
    const vm = new SeedLangVM();
    const ret = vm.run(code);
    if (expectSuccess) {
        if (!ret.success) {
            fail(name, ret.error || 'unexpected runtime failure');
            return;
        }
        const actual = vm.vm.globals.result;
        if (check(actual)) ok(name);
        else fail(name, `unexpected result: ${JSON.stringify(actual)}`);
    } else {
        if (ret.success) {
            fail(name, 'expected failure but run succeeded');
            return;
        }
        if (check(ret.error || '')) ok(name);
        else fail(name, `unexpected error: ${ret.error || ''}`);
    }
}

runCase({
    name: 'safe integer upper bound stays exact',
    code: `
x = 9007199254740991
result = x == 9007199254740991
`,
    check: (v) => v === true
});

runCase({
    name: 'unsafe integer +1 collapse is observable',
    code: `
x = 9007199254740992
result = (x + 1) == x
`,
    check: (v) => v === true
});

runCase({
    name: 'floating precision uses epsilon compare',
    code: `
result = abs((0.1 + 0.2) - 0.3) < 0.000001
`,
    check: (v) => v === true
});

runCase({
    name: 'division by zero throws runtime error',
    code: `
result = 1 / 0
`,
    expectSuccess: false,
    check: (msg) => /division error/i.test(msg)
});

runCase({
    name: 'toInt handles leading zeros',
    code: `
result = toInt("0032") == 32
`,
    check: (v) => v === true
});

runCase({
    name: 'toFloat parses numeric prefix',
    code: `
result = toFloat("3.5x") == 3.5
`,
    check: (v) => v === true
});

runCase({
    name: 'toFloat invalid literal defaults to zero',
    code: `
result = toFloat("abc") == 0
`,
    check: (v) => v === true
});

runCase({
    name: 'mod workaround positive numbers',
    code: `
a = 123
b = 10
m = a - floor(a / b) * b
result = m == 3
`,
    check: (v) => v === true
});

runCase({
    name: 'mod workaround negative numbers',
    code: `
a = -7
b = 3
m = a - floor(a / b) * b
result = m == 2
`,
    check: (v) => v === true
});

runCase({
    name: 'object literal supports string key with hyphen',
    code: `
obj = {"x-y": 7}
result = obj["x-y"] == 7
`,
    check: (v) => v === true
});

runCase({
    name: 'object literal supports mixed identifier and string keys',
    code: `
obj = {name: "seed" "x-y": 9}
result = obj.name == "seed" and obj["x-y"] == 9
`,
    check: (v) => v === true
});

runCase({
    name: 'object literal spread merges objects with last-write-wins',
    code: `
base = {a: 1 b: 2}
extra = {b: 3 c: 4}
obj = {z: 0 ...base ...extra d: 5}
result = obj.a == 1 and obj.b == 3 and obj.c == 4 and obj.z == 0 and obj.d == 5
`,
    check: (v) => v === true
});

runCase({
    name: 'object literal computed key resolves dynamic property names',
    code: `
k = "a"
obj = {[k]: 1}
result = obj.a
`,
    check: (v) => v === 1
});

runCase({
    name: 'object literal supports shorthand and spread-computed without comma',
    code: `
base = {v: 1}
key = "env"
name = "seed"
obj = {...base [key]: "prod" name}
result = obj.v == 1 and obj.env == "prod" and obj.name == "seed"
`,
    check: (v) => v === true
});

console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
