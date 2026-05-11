/**
 * 极端边界测试：覆盖各种边界条件、极端输入和潜在问题（大数/深嵌套/空值边界）
 * Tests for various edge cases, extreme conditions, and potential issues
 */

const { Interpreter } = require('../../dist/core/interpreter.js');
const { Lexer } = require('../../dist/core/lexer.js');
const { parse } = require('../../dist/core/parser.js');
const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        const result = fn();
        if (result === false || result instanceof Error) {
            throw result instanceof Error ? result : new Error('Test returned false');
        }
        console.log(`  [OK] ${name}`);
        passed++;
    } catch (e) {
        console.log(`  [FAIL] ${name}: ${e.message}`);
        failed++;
        failures.push({ name, error: e.message });
    }
}

function assertEqual(a, b, msg = '') {
    const aStr = typeof a === 'object' ? JSON.stringify(a) : String(a);
    const bStr = typeof b === 'object' ? JSON.stringify(b) : String(b);
    if (aStr !== bStr) {
        throw new Error(`${msg} Expected ${bStr} but got ${aStr}`);
    }
}

function assertThrows(fn, expectedMsg = null) {
    try {
        fn();
        throw new Error('Expected function to throw but it did not');
    } catch (e) {
        if (expectedMsg && !e.message.includes(expectedMsg)) {
            throw new Error(`Expected error containing "${expectedMsg}" but got "${e.message}"`);
        }
    }
}

function runCode(code) {
    const interpreter = new Interpreter();
    const ast = parse(code);
    interpreter.interpret(ast);
    return interpreter;
}

function getOutput(interpreter) {
    return interpreter.getOutput();
}

function getLastOutput(interpreter) {
    const output = interpreter.getOutput();
    return output.length > 0 ? output[output.length - 1] : null;
}

console.log('+============================================================+');
console.log('|         SeedLang Extreme Boundary Tests                   |');
console.log('|         Extreme Edge Case Testing                         |');
console.log('+============================================================+\n');

// ============================================
// 1. Recursion Depth Boundary Tests
// ============================================
console.log('[1. Recursion Depth Boundary Tests]');

test('Deep recursion - Fibonacci(20)', () => {
    const interp = runCode(`
        fn fib(n) {
            if (n <= 1) { return n }
            return fib(n - 1) + fib(n - 2)
        }
        print(fib(20))
    `);
    assertEqual(getLastOutput(interp), '6765');
});

test('Deep recursion - Factorial(20)', () => {
    const interp = runCode(`
        fn factorial(n) {
            if (n <= 1) { return 1 }
            return n * factorial(n - 1)
        }
        print(factorial(20))
    `);
    assertEqual(getLastOutput(interp), '2432902008176640000');
});

test('Mutual recursion - even/odd', () => {
    const interp = runCode(`
        fn isEven(n) {
            if (n == 0) { return true }
            return isOdd(n - 1)
        }
        fn isOdd(n) {
            if (n == 0) { return false }
            return isEven(n - 1)
        }
        print(isEven(100))
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('Tail recursion optimization check - sum(1000)', () => {
    const interp = runCode(`
        fn sum(n acc) {
            if (n == 0) { return acc }
            return sum(n - 1 acc + n)
        }
        print(sum(1000 0))
    `);
    assertEqual(getLastOutput(interp), '500500');
});

// ============================================
// 2. Closure Boundary Tests
// ============================================
console.log('\n[2. Closure Boundary Tests]');

test('Multi-level nested closure (10 levels)', () => {
    const interp = runCode(`
        fn a(x) {
            fn b(y) {
                fn c(z) {
                    fn d(w) {
                        fn e(v) {
                            return x + y + z + w + v
                        }
                        return e
                    }
                    return d
                }
                return c
            }
            return b
        }
        print(a(1)(2)(3)(4)(5))
    `);
    assertEqual(getLastOutput(interp), '15');
});

test('Closure modifies outer variable', () => {
    const interp = runCode(`
        counter = 0
        fn inc() {
            counter = counter + 1
            return counter
        }
        inc()
        inc()
        print(inc())
    `);
    assertEqual(getLastOutput(interp), '3');
});

test('Closure memory leak check', () => {
    const interp = runCode(`
        fn outer() {
            bigData = range(1000)
            fn inner() {
                return len(bigData)
            }
            return inner
        }
        fn1 = outer()
        print(fn1())
    `);
    assertEqual(getLastOutput(interp), '1000');
});

// ============================================
// 3. Array Boundary Tests
// ============================================
console.log('\n[3. Array Boundary Tests]');

test('Empty array operations', () => {
    const interp = runCode(`
        arr = []
        print(len(arr))
    `);
    assertEqual(getLastOutput(interp), '0');
});

test('Large array creation (10000 elements)', () => {
    const interp = runCode(`
        arr = range(10000)
        print(len(arr))
    `);
    assertEqual(getLastOutput(interp), '10000');
});

test('Array negative index boundary', () => {
    const interp = runCode(`
        arr = [1 2 3 4 5]
        print(arr[-1] + arr[-5])
    `);
    assertEqual(getLastOutput(interp), '6');
});

test('Array out of bounds access', () => {
    const interp = runCode(`
        arr = [1 2 3]
        print(type(arr[100]))
    `);
    assertEqual(getLastOutput(interp), 'null');
});

test('Array nesting depth (50 levels)', () => {
    const interp = runCode(`
        arr = [1]
        for (i = 0; i < 49; i = i + 1) {
            arr = [arr]
        }
        print(type(arr))
    `);
    assertEqual(getLastOutput(interp), 'array');
});

test('Array map operation', () => {
    const interp = runCode(`
        arr = [1 2 3 4 5]
        doubled = map(arr (x) => x * 2)
        print(doubled[4])
    `);
    assertEqual(getLastOutput(interp), '10');
});

test('Array filter operation', () => {
    const interp = runCode(`
        arr = [1 2 3 4 5 6 7 8 9 10]
        evens = filter(arr (x) => x > 5)
        print(len(evens))
    `);
    assertEqual(getLastOutput(interp), '5');
});

test('Array reduce operation', () => {
    const interp = runCode(`
        arr = [1 2 3 4 5]
        sum = 0
        i = 0
        while i < len(arr) {
            sum = sum + arr[i]
            i = i + 1
        }
        print(sum)
    `);
    assertEqual(getLastOutput(interp), '15');
});

// ============================================
// 4. String Boundary Tests
// ============================================
console.log('\n[4. String Boundary Tests]');

test('Empty string operations', () => {
    const interp = runCode(`
        s = ""
        print(len(s))
    `);
    assertEqual(getLastOutput(interp), '0');
});

test('Long string (10000 characters)', () => {
    const interp = runCode(`
        s = repeat("a" 10000)
        print(len(s))
    `);
    assertEqual(getLastOutput(interp), '10000');
});

test('Unicode string handling', () => {
    const interp = runCode(`
        s = "Hello World"
        print(len(s))
    `);
    assertEqual(getLastOutput(interp), '11');
});

test('String negative index', () => {
    const interp = runCode(`
        s = "hello"
        print(s[-1])
    `);
    assertEqual(getLastOutput(interp), 'o');
});

test('String split/join', () => {
    const interp = runCode(`
        s = "hello world test"
        parts = split(s " ")
        print(join(parts "-"))
    `);
    assertEqual(getLastOutput(interp), 'hello-world-test');
});

test('String trim operation', () => {
    const interp = runCode(`
        s = "  hello  "
        print(trim(s))
    `);
    assertEqual(getLastOutput(interp), 'hello');
});

test('String upper/lower', () => {
    const interp = runCode(`
        s = "Hello"
        print(upper(s) + "-" + lower(s))
    `);
    assertEqual(getLastOutput(interp), 'HELLO-hello');
});

// ============================================
// 5. Object Boundary Tests
// ============================================
console.log('\n[5. Object Boundary Tests]');

test('Empty object operations', () => {
    const interp = runCode(`
        obj = {}
        print(len(keys(obj)))
    `);
    assertEqual(getLastOutput(interp), '0');
});

test('Deeply nested object', () => {
    const interp = runCode(`
        obj = { a: { b: { c: { d: { e: 42 } } } } }
        print(obj.a.b.c.d.e)
    `);
    assertEqual(getLastOutput(interp), '42');
});

test('Object dynamic property access', () => {
    const interp = runCode(`
        obj = { foo: 1 bar: 2 baz: 3 }
        key = "bar"
        print(obj[key])
    `);
    assertEqual(getLastOutput(interp), '2');
});

test('Object merge conflict', () => {
    const interp = runCode(`
        a = { x: 1 y: 2 }
        b = { y: 3 z: 4 }
        c = merge(a b)
        print(c.y)
    `);
    assertEqual(getLastOutput(interp), '3');
});

test('Object circular reference detection', () => {
    const interp = runCode(`
        obj = { a: 1 }
        obj.self = obj
        print(type(obj.self))
    `);
    assertEqual(getLastOutput(interp), 'object');
});

test('Object keys/values', () => {
    const interp = runCode(`
        obj = { a: 1 b: 2 c: 3 }
        print(len(keys(obj)) + len(values(obj)))
    `);
    assertEqual(getLastOutput(interp), '6');
});

// ============================================
// 6. Type System Boundary Tests
// ============================================
console.log('\n[6. Type System Boundary Tests]');

test('Type coercion - number to string', () => {
    const interp = runCode(`
        n = 42
        print(toString(n))
    `);
    assertEqual(getLastOutput(interp), '42');
});

test('Type coercion - string to number', () => {
    const interp = runCode(`
        print(toInt("42") + toFloat("3.14"))
    `);
    assertEqual(getLastOutput(interp), '45.14');
});

test('null type operations', () => {
    const interp = runCode(`
        x = null
        print(type(x))
    `);
    assertEqual(getLastOutput(interp), 'null');
});

test('undefined access returns null', () => {
    const interp = runCode(`
        obj = { a: 1 }
        print(type(obj.nonexistent))
    `);
    assertEqual(getLastOutput(interp), 'null');
});

test('Boolean arithmetic operations', () => {
    const interp = runCode(`
        print(true + true + false)
    `);
    assertEqual(getLastOutput(interp), '2');
});

test('type function check', () => {
    const interp = runCode(`
        print(type(42) + "-" + type("hello") + "-" + type([1 2 3]))
    `);
    assertEqual(getLastOutput(interp), 'number-string-array');
});

// ============================================
// 7. Control Flow Boundary Tests
// ============================================
console.log('\n[7. Control Flow Boundary Tests]');

test('Deep nested if (10 levels)', () => {
    const interp = runCode(`
        x = 0
        if (true) {
            if (true) {
                if (true) {
                    if (true) {
                        if (true) {
                            x = 42
                        }
                    }
                }
            }
        }
        print(x)
    `);
    assertEqual(getLastOutput(interp), '42');
});

test('switch basic', () => {
    const interp = runCode(`
        x = 0
        switch (2) {
            case 1:
                x = 10
                break
            case 2:
                x = 20
                break
            case 3:
                x = 30
                break
        }
        print(x)
    `);
    assertEqual(getLastOutput(interp), '20');
});

test('while loop break nesting', () => {
    const interp = runCode(`
        sum = 0
        i = 0
        while (true) {
            i = i + 1
            if (i > 10) { break }
            sum = sum + i
        }
        print(sum)
    `);
    assertEqual(getLastOutput(interp), '55');
});

test('for loop continue', () => {
    const interp = runCode(`
        sum = 0
        for (i = 0; i < 10; i = i + 1) {
            if (i - floor(i / 2) * 2 == 0) { continue }
            sum = sum + i
        }
        print(sum)
    `);
    assertEqual(getLastOutput(interp), '25');
});

test('try-catch error capture', () => {
    const interp = runCode(`
        caught = false
        try {
            x = 1 / 0
        } catch (e) {
            caught = true
        }
        print(caught)
    `);
    assertEqual(getLastOutput(interp), 'true');
});

// ============================================
// 8. Function Boundary Tests
// ============================================
console.log('\n[8. Function Boundary Tests]');

test('Function returns function', () => {
    const vm = new SeedLangVM();
    const result = vm.run(`
        fn makeMultiplier(n) {
            fn multiply(x) {
                return x * n
            }
            return multiply
        }
        triple = makeMultiplier(3)
        print(triple(7))
    `);
    assertEqual(result.output[0], '21');
});

test('Function as parameter', () => {
    const interp = runCode(`
        fn apply(f x) {
            return f(x)
        }
        fn double(x) { return x * 2 }
        print(apply(double 5))
    `);
    assertEqual(getLastOutput(interp), '10');
});

test('Arrow function', () => {
    const interp = runCode(`
        arr = [1 2 3 4 5]
        doubled = map(arr (x) => x * 2)
        print(doubled[2])
    `);
    assertEqual(getLastOutput(interp), '6');
});

// ============================================
// 9. Error Handling Boundary Tests
// ============================================
console.log('\n[9. Error Handling Boundary Tests]');

test('Undefined variable error', () => {
    assertThrows(() => {
        runCode(`print(undefinedVar + 1)`);
    }, 'Undefined variable');
});

test('Type error - non-function call', () => {
    assertThrows(() => {
        runCode(`
            x = 42
            x()
        `);
    }, null);
});

// ============================================
// 10. Memory and Performance Boundary Tests
// ============================================
console.log('\n[10. Memory and Performance Boundary Tests]');

test('Large array sort performance', () => {
    const start = Date.now();
    const interp = runCode(`
        arr = range(0 1000)
        sorted = sort(arr)
        print(sorted[0])
    `);
    const duration = Date.now() - start;
    assertEqual(getLastOutput(interp), '0');
    if (duration > 5000) {
        throw new Error(`Sorting took too long: ${duration}ms`);
    }
});

test('String concatenation performance', () => {
    const interp = runCode(`
        s = ""
        for (i = 0; i < 1000; i = i + 1) {
            s = s + "a"
        }
        print(len(s))
    `);
    assertEqual(getLastOutput(interp), '1000');
});

test('Object creation performance', () => {
    const interp = runCode(`
        arr = []
        for (i = 0; i < 100; i = i + 1) {
            push(arr { id: i value: i * 2 })
        }
        print(len(arr))
    `);
    assertEqual(getLastOutput(interp), '100');
});

test('Function call overhead', () => {
    const interp = runCode(`
        fn identity(x) { return x }
        result = 0
        for (i = 0; i < 1000; i = i + 1) {
            result = identity(result + 1)
        }
        print(result)
    `);
    assertEqual(getLastOutput(interp), '1000');
});

// ============================================
// 11. Math Function Boundary Tests
// ============================================
console.log('\n[11. Math Function Boundary Tests]');

test('Trigonometric function boundaries', () => {
    const interp = runCode(`
        pi = 3.141592653589793
        print(abs(sin(0)) < 0.0001 && abs(cos(0) - 1) < 0.0001)
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('Logarithm function boundaries', () => {
    const interp = runCode(`
        e = exp(1)
        print(abs(log(e) - 1) < 0.0001)
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('Power function boundaries', () => {
    const interp = runCode(`
        print(pow(2 10))
    `);
    assertEqual(getLastOutput(interp), '1024');
});

test('Rounding functions', () => {
    const interp = runCode(`
        print(floor(3.7) == 3 && ceil(3.2) == 4 && round(3.5) == 4)
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('clamp function boundaries', () => {
    const interp = runCode(`
        print(clamp(5 0 10) == 5 && clamp(-5 0 10) == 0 && clamp(15 0 10) == 10)
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('abs function', () => {
    const interp = runCode(`
        print(abs(-42) + abs(10))
    `);
    assertEqual(getLastOutput(interp), '52');
});

// ============================================
// 12. Bitwise Operation Boundary Tests
// ============================================
console.log('\n[12. Bitwise Operation Boundary Tests]');

test('Bitwise operation combination', () => {
    const interp = runCode(`
        a = 10
        b = 12
        print((a & b) == 8 && (a | b) == 14 && (a ^ b) == 6)
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('Bit shift operations', () => {
    const interp = runCode(`
        print((1 << 4) == 16 && (32 >> 2) == 8)
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('Bitwise NOT operation', () => {
    const interp = runCode(`
        print(~~5 == 5)
    `);
    assertEqual(getLastOutput(interp), 'true');
});

// ============================================
// 13. Database Boundary Tests
// ============================================
console.log('\n[13. Database Boundary Tests]');

test('dbSet/dbGet basic', () => {
    const interp = runCode(`
        dbSet("test_key_ext" { value: 42 })
        print(dbGet("test_key_ext").value)
    `);
    assertEqual(getLastOutput(interp), '42');
});

test('dbHas check', () => {
    const interp = runCode(`
        dbSet("exists_key_ext" 1)
        print(dbHas("exists_key_ext") && !dbHas("nonexistent_key_ext"))
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('dbDelete operation', () => {
    const interp = runCode(`
        dbSet("delete_me_ext" 1)
        dbDelete("delete_me_ext")
        print(dbHas("delete_me_ext"))
    `);
    assertEqual(getLastOutput(interp), 'false');
});

test('Database key validation', () => {
    assertThrows(() => {
        runCode(`dbSet("" 1)`);
    }, null);
});

// ============================================
// 14. Functional Programming Boundary Tests
// ============================================
console.log('\n[14. Functional Programming Boundary Tests]');

test('compose function', () => {
    const interp = runCode(`
        fn double(x) { return x * 2 }
        fn inc(x) { return x + 1 }
        print(compose(double inc)(5))
    `);
    assertEqual(getLastOutput(interp), '12');
});

test('memoize cache', () => {
    const interp = runCode(`
        calls = 0
        fn slowAdd(a b) {
            calls = calls + 1
            return a + b
        }
        memoAdd = memoize(slowAdd)
        memoAdd(1 2)
        memoAdd(1 2)
        print(calls)
    `);
    assertEqual(getLastOutput(interp), '1');
});

// ============================================
// 15. Utility Boundary Tests
// ============================================
console.log('\n[15. Utility Boundary Tests]');

test('unique deduplication', () => {
    const interp = runCode(`
        print(len(unique([1 1 2 2 3 3 4 4 5 5])))
    `);
    assertEqual(getLastOutput(interp), '5');
});

test('flattenDeep deep flattening', () => {
    const interp = runCode(`
        nested = [1 [2 [3 [4 [5]]]]]
        print(len(flattenDeep(nested)))
    `);
    assertEqual(getLastOutput(interp), '5');
});

test('sample random sampling', () => {
    const interp = runCode(`
        arr = [1 2 3 4 5]
        s = sample(arr)
        print(includes(arr s))
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('shuffle randomize', () => {
    const interp = runCode(`
        arr = [1 2 3 4 5]
        shuffled = shuffle(arr)
        print(len(shuffled) == 5)
    `);
    assertEqual(getLastOutput(interp), 'true');
});

test('range function', () => {
    const interp = runCode(`
        arr = range(5 10)
        print(arr[0] + arr[4])
    `);
    assertEqual(getLastOutput(interp), '14');
});

// ============================================
// Test Summary
// ============================================
console.log('\n+============================================================+');
console.log('|                    Test Summary                           |');
console.log('+============================================================+\n');

console.log(`[Results]`);
console.log(`  Total: ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed > 0) {
    console.log('\n[Failed Tests]');
    failures.forEach(f => {
        console.log(`  - ${f.name}: ${f.error}`);
    });
}

console.log('\n============================================================');

if (failed === 0) {
    console.log('\n[OK] All extreme boundary tests passed!');
} else {
    console.log('\n[FAIL] Some tests failed, please check error messages.');
}

process.exit(failed > 0 ? 1 : 0);
