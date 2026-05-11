/**
 * 终极挑战测试（精简版）：超高难度极端边界用例的极限压力验证
 * Ultra-high difficulty tests for extreme edge cases
 */

const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        errors.push({ name, error: e.message });
        failed++;
    }
}

function assertEqual(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(`${msg} Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
    }
}

console.log('========================================');
console.log('  SeedLang Ultimate Challenge Tests');
console.log('========================================\n');

// ============================================
// 1. Advanced Recursion
// ============================================
console.log('[1. Advanced Recursion]');

test('McCarthy 91 Function', () => {
    const vm = new SeedLangVM();
    const code = `
        fn mccarthy(n) {
            if n > 100 { return n - 10 }
            return mccarthy(mccarthy(n + 11))
        }
        print(mccarthy(87))
        print(mccarthy(100))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '91');
    assertEqual(r.output[1], '91');
});

test('Collatz Conjecture', () => {
    const vm = new SeedLangVM();
    const code = `
        fn collatz(n steps) {
            if n == 1 { return steps }
            if n % 2 == 0 { return collatz(n / 2 steps + 1) }
            return collatz(3 * n + 1 steps + 1)
        }
        print(collatz(27 0))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '111');
});

// ============================================
// 2. Algorithms
// ============================================
console.log('\n[2. Algorithms]');

test('Bubble Sort', () => {
    const vm = new SeedLangVM();
    const code = `
        arr = [64 34 25 12 22 11 90]
        n = len(arr)
        i = 0
        while i < n {
            j = 0
            while j < n - i - 1 {
                if arr[j] > arr[j + 1] {
                    temp = arr[j]
                    arr[j] = arr[j + 1]
                    arr[j + 1] = temp
                }
                j = j + 1
            }
            i = i + 1
        }
        print(arr[0])
        print(arr[3])
        print(arr[6])
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '11');
    assertEqual(r.output[1], '25');
    assertEqual(r.output[2], '90');
});

test('Binary Search', () => {
    const vm = new SeedLangVM();
    const code = `
        fn binarySearch(arr target low high) {
            if low > high { return -1 }
            mid = floor((low + high) / 2)
            if arr[mid] == target { return mid }
            if arr[mid] > target {
                return binarySearch(arr target low mid - 1)
            }
            return binarySearch(arr target mid + 1 high)
        }
        
        sorted = [1 3 5 7 9 11 13 15]
        print(binarySearch(sorted 7 0 7))
        print(binarySearch(sorted 1 0 7))
        print(binarySearch(sorted 15 0 7))
        print(binarySearch(sorted 8 0 7))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '3');
    assertEqual(r.output[1], '0');
    assertEqual(r.output[2], '7');
    assertEqual(r.output[3], '-1');
});

// ============================================
// 3. Mathematical
// ============================================
console.log('\n[3. Mathematical]');

test('GCD and LCM', () => {
    const vm = new SeedLangVM();
    const code = `
        fn gcd(a b) {
            if b == 0 { return a }
            return gcd(b a % b)
        }
        
        fn lcm(a b) {
            return (a * b) / gcd(a b)
        }
        
        print(gcd(48 18))
        print(gcd(100 35))
        print(lcm(12 18))
        print(lcm(15 20))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '6');
    assertEqual(r.output[1], '5');
    assertEqual(r.output[2], '36');
    assertEqual(r.output[3], '60');
});

test('Fibonacci Iterative', () => {
    const vm = new SeedLangVM();
    const code = `
        fn fib(n) {
            if n <= 1 { return n }
            a = 0
            b = 1
            i = 2
            while i <= n {
                temp = a + b
                a = b
                b = temp
                i = i + 1
            }
            return b
        }
        
        print(fib(10))
        print(fib(20))
        print(fib(30))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '55');
    assertEqual(r.output[1], '6765');
    assertEqual(r.output[2], '832040');
});

// ============================================
// 4. Closures
// ============================================
console.log('\n[4. Closures]');

test('Closure Counter', () => {
    const vm = new SeedLangVM();
    const code = `
        fn makeCounter() {
            count = 0
            fn counter() {
                count = count + 1
                return count
            }
            return counter
        }
        
        c1 = makeCounter()
        c2 = makeCounter()
        print(c1())
        print(c1())
        print(c2())
        print(c1())
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '1');
    assertEqual(r.output[1], '2');
    assertEqual(r.output[2], '1');
    assertEqual(r.output[3], '3');
});

test('Closure Adder', () => {
    const vm = new SeedLangVM();
    const code = `
        fn makeAdder(x) {
            fn adder(y) {
                return x + y
            }
            return adder
        }
        
        add5 = makeAdder(5)
        add10 = makeAdder(10)
        print(add5(3))
        print(add10(3))
        print(add5(add10(2)))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '8');
    assertEqual(r.output[1], '13');
    assertEqual(r.output[2], '17');
});

// ============================================
// 5. Error Handling
// ============================================
console.log('\n[5. Error Handling]');

test('Try-Catch', () => {
    const vm = new SeedLangVM();
    const code = `
        result = ""
        try {
            result = result + "try"
            throw "error"
        } catch (e) {
            result = result + "-catch"
        }
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'try-catch');
});

test('Try-Finally', () => {
    const vm = new SeedLangVM();
    const code = `
        result = ""
        try {
            result = result + "try"
        } finally {
            result = result + "-finally"
        }
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'try-finally');
});

// ============================================
// Summary
// ============================================
console.log('\n========================================');
console.log('           Test Summary');
console.log('========================================');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log('========================================');

if (failed === 0) {
    console.log('\n[SUCCESS] All ultimate tests passed!');
} else {
    console.log('\n[FAILED] Some tests failed:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
}

process.exit(failed > 0 ? 1 : 0);
