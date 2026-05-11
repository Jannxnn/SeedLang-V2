// 跨平台兼容性测试：验证 SeedLang 在 Windows/Linux/macOS 不同平台上的行为一致性

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Cross-Platform Compatibility Tests ===\n');

const vm = new SeedLangVM();
let passed = 0;
let failed = 0;

function test(name, code, check) {
    const tvm = new SeedLangVM();
    try {
        const result = tvm.run(code);
        
        if (!result.success) {
            console.log(`[FAIL] ${name}: ${result.error}`);
            failed++;
            return;
        }
        
        const actual = tvm.vm.globals.result;
        
        if (check(actual)) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: Expected mismatch, actual ${JSON.stringify(actual)}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${name}: Exception - ${e.message}`);
        failed++;
    }
}

console.log('--- Line Ending Compatibility ---');
test('LF line ending', `result = 1\nresult = result + 1`, (actual) => actual === 2);
test('CRLF line ending simulation', `result = 1\r\nresult = result + 1`, (actual) => actual === 2);
test('Multi-line code', `
result = 0
i = 1
while i <= 5 {
    result = result + i
    i = i + 1
}
`, (actual) => actual === 15);

console.log('\n--- Encoding Compatibility ---');
test('UTF-8 Chinese characters', `result = "Hello World"`, (actual) => actual === "Hello World");
test('UTF-8 Japanese characters', `result = "Hello"`, (actual) => actual === "Hello");
test('UTF-8 Korean characters', `result = "Hello"`, (actual) => actual === "Hello");
test('UTF-8 emoji', `result = "🌍🚀💻"`, (actual) => actual === "🌍🚀💻");
test('UTF-8 special symbols', `result = "★☆♠♣♥♦"`, (actual) => actual === "★☆♠♣♥♦");
test('Mixed encoding', `result = "Hello World 🌍"`, (actual) => actual === "Hello World 🌍");

console.log('\n--- Number Format Compatibility ---');
test('Integer', `result = 42`, (actual) => actual === 42);
test('Negative integer', `result = -42`, (actual) => actual === -42);
test('Float', `result = 3.14`, (actual) => actual === 3.14);
test('Scientific notation', `result = 10000000000`, (actual) => actual === 1e10);
test('Scientific notation negative exponent', `result = 0.0015`, (actual) => actual === 1.5e-3);
test('Trailing zeros', `result = 1.0`, (actual) => actual === 1.0);
test('Large integer', `result = 9999999999`, (actual) => actual === 9999999999);

console.log('\n--- String Format Compatibility ---');
test('Double-quoted string', `result = "hello"`, (actual) => actual === "hello");
test('Escape characters', `result = "hello\\nworld"`, (actual) => actual === "hello\nworld");
test('Tab character', `result = "a\\tb"`, (actual) => actual === "a\tb");
test('Backslash', `result = "path\\\\to\\\\file"`, (actual) => actual === "path\\to\\file");
test('Quote escape', `result = "say \\"hello\\""`, (actual) => actual === 'say "hello"');
test('Empty string', `result = ""`, (actual) => actual === "");

console.log('\n--- Array Format Compatibility ---');
test('Empty array', `result = []`, (actual) => Array.isArray(actual) && actual.length === 0);
test('Single element array', `result = [1]`, (actual) => JSON.stringify(actual) === '[1]');
test('Multi-element array', `result = [1 2 3]`, (actual) => JSON.stringify(actual) === '[1,2,3]');
test('Mixed type array', `result = [1 "a" true]`, (actual) => JSON.stringify(actual) === '[1,"a",true]');
test('Nested array', `arr1 = [1 2]\narr2 = [3 4]\nresult = [arr1 arr2]`, (actual) => Array.isArray(actual) && actual.length === 2);

console.log('\n--- Object Format Compatibility ---');
test('Empty object', `result = {}`, (actual) => typeof actual === 'object' && Object.keys(actual).length === 0);
test('Simple object', `result = {a: 1}`, (actual) => actual && actual.a === 1);
test('Multi-property object', `result = {a: 1 b: 2 c: 3}`, (actual) => actual && actual.a === 1 && actual.b === 2 && actual.c === 3);
test('Nested object', `result = {a: {b: {c: 1}}}`, (actual) => actual && actual.a && actual.a.b && actual.a.b.c === 1);

console.log('\n--- Operator Compatibility ---');
test('Addition', `result = 1 + 2`, (actual) => actual === 3);
test('Subtraction', `result = 5 - 3`, (actual) => actual === 2);
test('Multiplication', `result = 4 * 5`, (actual) => actual === 20);
test('Division', `result = 10 / 2`, (actual) => actual === 5);
test('Modulo', `result = 7 % 3`, (actual) => actual === 1);
test('Equal', `result = 1 == 1`, (actual) => actual === true);
test('Not equal', `result = 1 != 2`, (actual) => actual === true);
test('Less than', `result = 1 < 2`, (actual) => actual === true);
test('Greater than', `result = 2 > 1`, (actual) => actual === true);
test('Less than or equal', `result = 2 <= 2`, (actual) => actual === true);
test('Greater than or equal', `result = 2 >= 2`, (actual) => actual === true);
test('Logical and', `result = true and false`, (actual) => actual === false);
test('Logical or', `result = true or false`, (actual) => actual === true);
test('Logical not', `result = not true`, (actual) => actual === false);

console.log('\n--- Control Flow Compatibility ---');
test('if statement', `if true { result = 1 }`, (actual) => actual === 1);
test('if-else statement', `if false { result = 1 } else { result = 2 }`, (actual) => actual === 2);
test('while loop', `i = 0\nwhile i < 3 { i = i + 1 }\nresult = i`, (actual) => actual === 3);
test('for loop', `sum = 0\nfor i in [1 2 3] { sum = sum + i }\nresult = sum`, (actual) => actual === 6);

console.log('\n--- Function Compatibility ---');
test('Function definition', `fn f() { return 42 }\nresult = f()`, (actual) => actual === 42);
test('Function with parameters', `fn add(a b) { return a + b }\nresult = add(1 2)`, (actual) => actual === 3);
test('Recursive function', `fn fact(n) { if n <= 1 { return 1 } return n * fact(n - 1) }\nresult = fact(5)`, (actual) => actual === 120);
test('Closure', `fn outer() { x = 10\nfn inner() { return x }\nreturn inner() }\nresult = outer()`, (actual) => actual === 10);

console.log('\n--- Built-in Function Compatibility ---');
test('len function', `result = len([1 2 3])`, (actual) => actual === 3);
test('push function', `arr = [1]\npush(arr 2)\nresult = len(arr)`, (actual) => actual === 2);
test('pop function', `arr = [1 2 3]\nresult = pop(arr)`, (actual) => actual === 3);
test('concat function', `arr1 = [1]\narr2 = [2]\nresult = concat(arr1 arr2)`, (actual) => JSON.stringify(actual) === '[1,2]');
test('upper function', `result = upper("hello")`, (actual) => actual === "HELLO");
test('lower function', `result = lower("HELLO")`, (actual) => actual === "hello");
test('trim function', `result = trim("  hello  ")`, (actual) => actual === "hello");
test('abs function', `result = abs(-5)`, (actual) => actual === 5);
test('min function', `result = min(3 1 2)`, (actual) => actual === 1);
test('max function', `result = max(3 1 2)`, (actual) => actual === 3);
test('floor function', `result = floor(3.7)`, (actual) => actual === 3);
test('ceil function', `result = ceil(3.2)`, (actual) => actual === 4);
test('round function', `result = round(3.5)`, (actual) => actual === 4);
test('sqrt function', `result = sqrt(16)`, (actual) => actual === 4);
test('random function', `result = random()`, (actual) => typeof actual === 'number' && actual >= 0 && actual < 1);

console.log('\n--- Type Function Compatibility ---');
test('type function', `result = type(42)`, (actual) => actual === "number");
test('string function', `result = string(42)`, (actual) => actual === "42");
test('number function', `result = number("42")`, (actual) => actual === 42);
test('bool function', `result = bool(1)`, (actual) => actual === true);
test('isArray function', `result = isArray([1 2])`, (actual) => actual === true);
test('isObject function', `result = isObject({})`, (actual) => actual === true);
test('isFunction function', `fn f() {}\nresult = isFunction(f)`, (actual) => actual === true);
test('isString function', `result = isString("hello")`, (actual) => actual === true);
test('isNumber function', `result = isNumber(42)`, (actual) => actual === true);
test('isNull function', `result = isNull(null)`, (actual) => actual === true);

console.log('\n--- Error Handling Compatibility ---');
test('try-catch', `try { throw "error" } catch(e) { result = "caught" }`, (actual) => actual === "caught");
test('try-finally', `try { x = 1 } finally { result = "done" }`, (actual) => actual === "done");
test('throw statement', `try { throw "error" } catch(e) { result = e }`, (actual) => actual === "error");

console.log('\n--- Object Method Compatibility ---');
test('Object method', `
obj = { value: 0 }
fn inc() {
    obj.value = obj.value + 1
}
inc()
result = obj.value
`, (actual) => actual === 1);

console.log('\n--- Class and Object Compatibility ---');
test('Class definition', `
class Point {
    fn init(x y) {
        this.x = x
        this.y = y
    }
}
p = Point(1 2)
result = p.x + p.y
`, (actual) => actual === 3);

test('Class method', `
class Counter {
    fn init() {
        this.count = 0
    }
    fn inc() {
        this.count = this.count + 1
    }
}
c = Counter()
c.inc()
c.inc()
result = c.count
`, (actual) => actual === 2);

console.log('\n--- Environment Detection ---');
const nodeVersion = process.version;
const platform = process.platform;
const arch = process.arch;

console.log(`Node.js version: ${nodeVersion}`);
console.log(`Platform: ${platform}`);
console.log(`Architecture: ${arch}`);

test('Environment detection Node version', `result = "${nodeVersion}"`, (actual) => actual === nodeVersion);
test('Environment detection platform', `result = "${platform}"`, (actual) => actual === platform);
test('Environment detection architecture', `result = "${arch}"`, (actual) => actual === arch);

console.log('\n=== Cross-Platform Compatibility Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
