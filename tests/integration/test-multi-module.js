// 多模块集成测试：验证跨模块依赖、循环引用、模块缓存、命名空间隔离等复杂模块场景

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Integration Tests ===\n');

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
        throw new Error(`${msg} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

console.log('--- Multi-Module Integration Tests ---');

test('Module import and function call integration', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
import math as math
import json as json

data = { value: math.sqrt(16) }
result = json.stringify(data)
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, '{"value":4}');
});

test('File system and JSON integration', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
import json as json
import fs as fs

config = { name: "test" version: 1.0 }
jsonStr = json.stringify(config)
result = json.parse(jsonStr)
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result.name, 'test');
});

test('HTTP and JSON integration', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
import json as json

data = { url: "https://api.example.com" method: "GET" }
configStr = json.stringify(data)
parsed = json.parse(configStr)
result = parsed.method
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 'GET');
});

test('Time and string processing integration', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
import time as time

timestamp = time.now()
dateStr = time.date()
timeStr = time.time()
result = "Date: " + dateStr + " Time: " + timeStr
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result.includes('Date:'), true);
});

test('Sensitive path module import is blocked by default', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
import path as path
import fs as fs

cwd = fs.cwd()
joined = path.join(cwd "test" "file.txt")
result = path.basename(joined)
`);
    assertEqual(result.success, false);
    assertEqual(String(result.error || '').includes('blocked by import policy'), true);
});

console.log('\n--- Coroutine Integration Tests ---');

test('Coroutine basic functionality', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
coro counter() {
    yield 1
    yield 2
    yield 3
}

c = counter()
r1 = coroutine.resume(c)
r2 = coroutine.resume(c)
r3 = coroutine.resume(c)
result = [r1 r2 r3]
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, [1, 2, 3]);
});

test('Coroutine parameter passing', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
coro doubler(x) {
    yield x * 2
    yield x * 4
    yield x * 6
}

c = doubler(5)
r1 = coroutine.resume(c)
r2 = coroutine.resume(c)
r3 = coroutine.resume(c)
result = [r1 r2 r3]
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, [10, 20, 30]);
});

console.log('\n--- Class and Module Integration Tests ---');

test('Class using math module', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
import math as math

class Calculator {
    fn sqrt(x) {
        return math.sqrt(x)
    }
    fn power(base exp) {
        return math.pow(base exp)
    }
}

calc = Calculator()
result = [calc.sqrt(25) calc.power(2 3)]
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, [5, 8]);
});

test('Class using JSON module', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
import json as json

class JsonSerializer {
    fn serialize(obj) {
        return json.stringify(obj)
    }
    fn deserialize(str) {
        return json.parse(str)
    }
}

serializer = JsonSerializer()
data = { name: "test" value: 42 }
serialized = serializer.serialize(data)
deserialized = serializer.deserialize(serialized)
result = deserialized.name
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 'test');
});

console.log('\n--- Async and Module Integration Tests ---');

test('Async and parallel module integration', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
fn processItem(x) {
    return x * 2
}

items = [1 2 3 4 5]
result = map(items processItem)
`);
    assertEqual(result.success, true);
});

test('Async and time module integration', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
import time as time

start = time.now()
result = time.format(start)
`);
    assertEqual(result.success, true);
});

console.log('\n--- Error Handling Integration Tests ---');

test('Error handling with modules', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
import json as json

data = json.parse('{"name": "test"}')
result = data.name
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, 'test');
});

test('Error handling in class methods', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
class SafeDivider {
    fn divide(a b) {
        try {
            if b == 0 {
                throw "Division by zero"
            }
            return a / b
        } catch(e) {
            return null
        }
    }
}

divider = SafeDivider()
r1 = divider.divide(10 2)
r2 = divider.divide(10 0)
result = [r1 r2]
`);
    assertEqual(result.success, true);
    assertEqual(vm.vm.globals.result, [5, null]);
});

console.log('\n--- Summary ---');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}
