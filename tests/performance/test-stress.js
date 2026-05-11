// 综合压力测试：混合高负载场景（CPU 密集 + IO 密集 + 内存密集），验证系统整体鲁棒性

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
console.log('  SeedLang Complex Scenario Stress Tests');
console.log('========================================\n');

// ============================================
// 1. Deep Recursion Tests
// ============================================
console.log('[1. Deep Recursion]');

test('Recursion Depth 50', () => {
    const vm = new SeedLangVM();
    const r = vm.run('fn depth(n) { if n <= 0 { return 0 } return 1 + depth(n - 1) } print(depth(50))');
    assertEqual(r.output[0], '50');
});

test('Recursive Fibonacci fib(25)', () => {
    const vm = new SeedLangVM();
    const start = Date.now();
    const r = vm.run('fn fib(n) { if n <= 1 { return n } return fib(n-1) + fib(n-2) } print(fib(25))');
    const time = Date.now() - start;
    assertEqual(r.output[0], '75025');
    console.log(`    (${time}ms)`);
});

test('Mutual Recursion', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn isEven(n) { if n == 0 { return true } return isOdd(n - 1) }
fn isOdd(n) { if n == 0 { return false } return isEven(n - 1) }
print(isEven(10)); print(isOdd(10)); print(isEven(7)); print(isOdd(7))
`);
    assertEqual(r.output, ['true', 'false', 'false', 'true']);
});

test('Ackermann Function ack(3 4)', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn ack(m n) {
    if m == 0 { return n + 1 }
    if n == 0 { return ack(m - 1 1) }
    return ack(m - 1 ack(m n - 1))
}
print(ack(3 4))
`);
    assertEqual(r.output[0], '125');
});

// ============================================
// 2. Complex Data Structures
// ============================================
console.log('\n[2. Complex Data Structures]');

test('Deeply Nested Object', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
o = {a: {b: {c: {d: {e: {f: {g: {h: {i: {j: 42}}}}}}}}}}
print(o.a.b.c.d.e.f.g.h.i.j)
`);
    assertEqual(r.output[0], '42');
});

test('Deeply Nested Array', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
a = [[[[[[[[[[42]]]]]]]]]]
print(a[0][0][0][0][0][0][0][0][0][0])
`);
    assertEqual(r.output[0], '42');
});

test('Mixed Nested Structure', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
data = {
    users: [
        {name: "Alice" scores: [1 2 3]}
        {name: "Bob" scores: [4 5 6]}
    ]
}
print(data.users[0].name)
print(data.users[1].scores[2])
`);
    assertEqual(r.output, ['Alice', '6']);
});

test('Dynamic Object Building', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
obj = {}
obj.a = 1
obj.b = 2
obj.c = obj.a + obj.b
obj.nested = {x: 10 y: 20}
obj.nested.z = obj.nested.x + obj.nested.y
print(obj.c)
print(obj.nested.z)
`);
    assertEqual(r.output, ['3', '30']);
});

// ============================================
// 3. Complex Algorithms
// ============================================
console.log('\n[3. Complex Algorithms]');

test('Binary Search', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn binarySearch(arr target) {
    left = 0
    right = len(arr) - 1
    while left <= right {
        mid = floor((left + right) / 2)
        if arr[mid] == target { return mid }
        if arr[mid] < target { left = mid + 1 }
        else { right = mid - 1 }
    }
    return -1
}
arr = [1 3 5 7 9 11 13 15 17 19]
print(binarySearch(arr 7))
print(binarySearch(arr 1))
print(binarySearch(arr 19))
print(binarySearch(arr 8))
`);
    assertEqual(r.output, ['3', '0', '9', '-1']);
});

test('Bubble Sort', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn bubbleSort(arr) {
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
    return arr
}
result = bubbleSort([5 3 8 4 2 7 1 6])
print(result[0]); print(result[3]); print(result[7])
`);
    assertEqual(r.output, ['1', '4', '8']);
});

test('Prime Number Detection', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn isPrime(n) {
    if n < 2 { return false }
    i = 2
    while i * i <= n {
        if n % i == 0 { return false }
        i = i + 1
    }
    return true
}
primes = []
n = 2
while len(primes) < 10 {
    if isPrime(n) { push(primes n) }
    n = n + 1
}
print(primes[0]); print(primes[4]); print(primes[9])
`);
    assertEqual(r.output, ['2', '11', '29']);
});

test('Greatest Common Divisor', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn gcd(a b) {
    while b != 0 {
        temp = b
        b = a % b
        a = temp
    }
    return a
}
fn lcm(a b) {
    g = gcd(a b)
    return a * b / g
}
r1 = gcd(48 18)
r2 = gcd(100 35)
r3 = lcm(4 6)
print(r1)
print(r2)
print(r3)
`);
    assertEqual(r.output, ['6', '5', '12']);
});

test('Tower of Hanoi', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
moves = 0
fn hanoi(n from to aux) {
    if n == 1 {
        moves = moves + 1
        return
    }
    hanoi(n - 1 from aux to)
    moves = moves + 1
    hanoi(n - 1 aux to from)
}
hanoi(5 "A" "C" "B")
print(moves)
`);
    assertEqual(r.output[0], '31');
});

// ============================================
// 4. String Processing
// ============================================
console.log('\n[4. String Processing]');

test('String Reversal', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn reverse(s) {
    result = ""
    i = len(s) - 1
    while i >= 0 {
        result = result + s[i]
        i = i - 1
    }
    return result
}
print(reverse("hello"))
print(reverse("12345"))
`);
    assertEqual(r.output, ['olleh', '54321']);
});

test('Palindrome Detection', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn isPalindrome(s) {
    i = 0
    j = len(s) - 1
    while i < j {
        if s[i] != s[j] { return false }
        i = i + 1
        j = j - 1
    }
    return true
}
print(isPalindrome("racecar"))
print(isPalindrome("hello"))
print(isPalindrome("a"))
`);
    assertEqual(r.output, ['true', 'false', 'true']);
});

test('Word Count', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
text = "the quick brown fox"
count = 0
for c in text {
    if c == " " { count = count + 1 }
}
print(count + 1)
`);
    assertEqual(r.output[0], '4');
});

// ============================================
// 5. Mathematical Calculations
// ============================================
console.log('\n[5. Mathematical Calculations]');

test('Power Operation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn power(base exp) {
    if exp == 0 { return 1 }
    if exp < 0 { return 1 / power(base -exp) }
    result = 1
    while exp > 0 {
        if exp % 2 == 1 { result = result * base }
        base = base * base
        exp = floor(exp / 2)
    }
    return result
}
print(power(2 10))
print(power(3 5))
print(power(5 0))
`);
    assertEqual(r.output, ['1024', '243', '1']);
});

test('Fibonacci Sequence Generator', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn fibSeq(n) {
    if n <= 0 { return [] }
    if n == 1 { return [0] }
    result = [0 1]
    i = 2
    while i < n {
        push(result result[i-1] + result[i-2])
        i = i + 1
    }
    return result
}
fib = fibSeq(15)
print(len(fib))
print(fib[0]); print(fib[7]); print(fib[14])
`);
    assertEqual(r.output, ['15', '0', '13', '377']);
});

test('Factorial Calculation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn factorial(n) {
    if n <= 1 { return 1 }
    result = 1
    i = 2
    while i <= n {
        result = result * i
        i = i + 1
    }
    return result
}
print(factorial(0))
print(factorial(5))
print(factorial(10))
`);
    assertEqual(r.output, ['1', '120', '3628800']);
});

// ============================================
// 6. Performance Stress Tests
// ============================================
console.log('\n[6. Performance Stress]');

test('Loop 10000 Times', () => {
    const vm = new SeedLangVM();
    const start = Date.now();
    const r = vm.run('i = 0; while i < 10000 { i = i + 1 } print(i)');
    const time = Date.now() - start;
    assertEqual(r.output[0], '10000');
    console.log(`    (${time}ms)`);
});

test('Array Operations 1000 Times', () => {
    const vm = new SeedLangVM();
    const start = Date.now();
    const r = vm.run('a = []; i = 0; while i < 1000 { push(a i); i = i + 1 } print(len(a))');
    const time = Date.now() - start;
    assertEqual(r.output[0], '1000');
    console.log(`    (${time}ms)`);
});

test('Function Calls 1000 Times', () => {
    const vm = new SeedLangVM();
    const start = Date.now();
    const r = vm.run('fn f(x) { return x + 1 } i = 0; r = 0; while i < 1000 { r = f(r); i = i + 1 } print(r)');
    const time = Date.now() - start;
    assertEqual(r.output[0], '1000');
    console.log(`    (${time}ms)`);
});

test('String Concatenation 500 Times', () => {
    const vm = new SeedLangVM();
    const start = Date.now();
    const r = vm.run('s = ""; i = 0; while i < 500 { s = s + "x"; i = i + 1 } print(len(s))');
    const time = Date.now() - start;
    assertEqual(r.output[0], '500');
    console.log(`    (${time}ms)`);
});

// ============================================
// 7. Edge Cases
// ============================================
console.log('\n[7. Edge Cases]');

test('Empty Array Handling', () => {
    const vm = new SeedLangVM();
    const r = vm.run('a = []; print(len(a)); print(a[0])');
    assertEqual(r.output, ['0', 'null']);
});

test('Empty Object Handling', () => {
    const vm = new SeedLangVM();
    const r = vm.run('o = {}; print(o.x); o.x = 1; print(o.x)');
    assertEqual(r.output, ['null', '1']);
});

test('Empty String Handling', () => {
    const vm = new SeedLangVM();
    const r = vm.run('s = ""; print(len(s)); print(s + "x")');
    assertEqual(r.output, ['0', 'x']);
});

test('Zero Value Handling', () => {
    const vm = new SeedLangVM();
    const r = vm.run('x = 0; print(x); print(x + 1); try { print(10 / x) } catch(e) { print("division error") }');
    assertEqual(r.output, ['0', '1', 'division error']);
});

test('Negative Number Handling', () => {
    const vm = new SeedLangVM();
    const r = vm.run('x = -5; y = -x; print(x); print(y); print(x * y)');
    assertEqual(r.output, ['-5', '5', '-25']);
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

if (failed > 0) {
    console.log('\nFailed tests:');
    for (const e of errors) {
        console.log(`  - ${e.name}: ${e.error}`);
    }
    process.exit(1);
} else {
    console.log('\n[SUCCESS] All complex tests passed! SeedLang is stable and reliable!');
}
