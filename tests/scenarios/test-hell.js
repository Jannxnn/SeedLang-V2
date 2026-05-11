/**
 * 地狱级难度测试：计算机科学与编程语言领域最具挑战性的问题集合
 * The most challenging problems in computer science and programming languages
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
console.log('  SeedLang HELL DIFFICULTY Tests');
console.log('========================================\n');

// ============================================
// 1. Self-Reference & Recursion Limits
// ============================================
console.log('[1. Self-Reference & Recursion Limits]');

test('Factorial', () => {
    const vm = new SeedLangVM();
    const code = `
        fn factorial(n) {
            if n <= 1 { return 1 }
            return n * factorial(n - 1)
        }
        print(factorial(5))
        print(factorial(10))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '120');
    assertEqual(r.output[1], '3628800');
});

test('Mutual Recursion (Even/Odd)', () => {
    const vm = new SeedLangVM();
    const code = `
        fn isEven(n) {
            if n == 0 { return true }
            return isOdd(n - 1)
        }
        
        fn isOdd(n) {
            if n == 0 { return false }
            return isEven(n - 1)
        }
        
        print(isEven(10))
        print(isOdd(10))
        print(isEven(7))
        print(isOdd(7))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'true');
    assertEqual(r.output[1], 'false');
    assertEqual(r.output[2], 'false');
    assertEqual(r.output[3], 'true');
});

test('Tail Recursion Simulation', () => {
    const vm = new SeedLangVM();
    const code = `
        fn tailSum(n acc) {
            if n == 0 { return acc }
            return tailSum(n - 1 acc + n)
        }
        print(tailSum(100 0))
        print(tailSum(500 0))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '5050');
    assertEqual(r.output[1], '125250');
});

// ============================================
// 2. Complex Data Structures
// ============================================
console.log('\n[2. Complex Data Structures]');

test('Binary Tree Operations', () => {
    const vm = new SeedLangVM();
    const code = `
        fn createNode(value) {
            return {value: value left: null right: null}
        }
        
        fn insert(root value) {
            if root == null { return createNode(value) }
            if value < root.value {
                root.left = insert(root.left value)
            } else {
                root.right = insert(root.right value)
            }
            return root
        }
        
        fn inorder(root result) {
            if root == null { return result }
            result = inorder(root.left result)
            push(result root.value)
            return inorder(root.right result)
        }
        
        root = null
        root = insert(root 5)
        root = insert(root 3)
        root = insert(root 7)
        root = insert(root 1)
        root = insert(root 9)
        
        result = []
        result = inorder(root result)
        print(result[0])
        print(result[2])
        print(result[4])
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '1');
    assertEqual(r.output[1], '5');
    assertEqual(r.output[2], '9');
});

test('Linked List Operations', () => {
    const vm = new SeedLangVM();
    const code = `
        fn createNode(value) {
            return {value: value next: null}
        }
        
        fn append(head value) {
            if head == null { return createNode(value) }
            current = head
            while current.next != null {
                current = current.next
            }
            current.next = createNode(value)
            return head
        }
        
        fn getLength(head) {
            count = 0
            current = head
            while current != null {
                count = count + 1
                current = current.next
            }
            return count
        }
        
        fn reverse(head) {
            prev = null
            current = head
            while current != null {
                next = current.next
                current.next = prev
                prev = current
                current = next
            }
            return prev
        }
        
        head = null
        head = append(head 1)
        head = append(head 2)
        head = append(head 3)
        head = append(head 4)
        
        print(getLength(head))
        head = reverse(head)
        print(head.value)
        print(head.next.value)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '4');
    assertEqual(r.output[1], '4');
    assertEqual(r.output[2], '3');
});

// ============================================
// 3. Advanced Algorithms
// ============================================
console.log('\n[3. Advanced Algorithms]');

test('Quick Sort', () => {
    const vm = new SeedLangVM();
    const code = `
        fn quickSort(arr low high) {
            if low < high {
                pi = partition(arr low high)
                quickSort(arr low pi - 1)
                quickSort(arr pi + 1 high)
            }
        }
        
        fn partition(arr low high) {
            pivot = arr[high]
            i = low - 1
            j = low
            while j < high {
                if arr[j] < pivot {
                    i = i + 1
                    temp = arr[i]
                    arr[i] = arr[j]
                    arr[j] = temp
                }
                j = j + 1
            }
            temp = arr[i + 1]
            arr[i + 1] = arr[high]
            arr[high] = temp
            return i + 1
        }
        
        arr = [10 7 8 9 1 5]
        quickSort(arr 0 5)
        print(arr[0])
        print(arr[2])
        print(arr[5])
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '1');
    assertEqual(r.output[1], '7');
    assertEqual(r.output[2], '10');
});

test('Merge Sort', () => {
    const vm = new SeedLangVM();
    const code = `
        fn merge(arr l m r) {
            n1 = m - l + 1
            n2 = r - m
            L = []
            R = []
            i = 0
            while i < n1 { push(L arr[l + i]); i = i + 1 }
            i = 0
            while i < n2 { push(R arr[m + 1 + i]); i = i + 1 }
            
            i = 0; j = 0; k = l
            while i < n1 and j < n2 {
                if L[i] <= R[j] { arr[k] = L[i]; i = i + 1 }
                else { arr[k] = R[j]; j = j + 1 }
                k = k + 1
            }
            while i < n1 { arr[k] = L[i]; i = i + 1; k = k + 1 }
            while j < n2 { arr[k] = R[j]; j = j + 1; k = k + 1 }
        }
        
        fn mergeSort(arr l r) {
            if l < r {
                m = floor((l + r) / 2)
                mergeSort(arr l m)
                mergeSort(arr m + 1 r)
                merge(arr l m r)
            }
        }
        
        arr = [12 11 13 5 6 7]
        mergeSort(arr 0 5)
        print(arr[0])
        print(arr[3])
        print(arr[5])
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '5');
    assertEqual(r.output[1], '11');
    assertEqual(r.output[2], '13');
});

// ============================================
// 4. Mathematical Challenges
// ============================================
console.log('\n[4. Mathematical Challenges]');

test('Sieve of Eratosthenes', () => {
    const vm = new SeedLangVM();
    const code = `
        fn sieve(n) {
            isPrime = []
            i = 0
            while i <= n { push(isPrime true); i = i + 1 }
            isPrime[0] = false
            isPrime[1] = false
            
            p = 2
            while p * p <= n {
                if isPrime[p] {
                    i = p * p
                    while i <= n { isPrime[i] = false; i = i + p }
                }
                p = p + 1
            }
            
            primes = []
            i = 2
            while i <= n { if isPrime[i] { push(primes i) }; i = i + 1 }
            return primes
        }
        
        primes = sieve(50)
        print(len(primes))
        print(primes[0])
        print(primes[14])
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '15');
    assertEqual(r.output[1], '2');
    assertEqual(r.output[2], '47');
});

test('Newton-Raphson Square Root', () => {
    const vm = new SeedLangVM();
    const code = `
        fn sqrt(n) {
            if n == 0 { return 0 }
            x = n
            i = 0
            while i < 20 { x = (x + n / x) / 2; i = i + 1 }
            return x
        }
        print(floor(sqrt(4)))
        print(floor(sqrt(9)))
        print(floor(sqrt(16)))
        print(floor(sqrt(100)))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '2');
    assertEqual(r.output[1], '3');
    assertEqual(r.output[2], '4');
    assertEqual(r.output[3], '10');
});

test('Pascal Triangle', () => {
    const vm = new SeedLangVM();
    const code = `
        fn pascal(n) {
            triangle = []
            i = 0
            while i < n {
                row = []
                j = 0
                while j <= i {
                    if j == 0 or j == i { push(row 1) }
                    else { prevRow = triangle[i - 1]; push(row prevRow[j - 1] + prevRow[j]) }
                    j = j + 1
                }
                push(triangle row)
                i = i + 1
            }
            return triangle
        }
        
        t = pascal(5)
        print(t[2][1])
        print(t[3][1])
        print(t[4][2])
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '2');
    assertEqual(r.output[1], '3');
    assertEqual(r.output[2], '6');
});

// ============================================
// 5. Closure Challenges
// ============================================
console.log('\n[5. Closure Challenges]');

// ============================================
// 6. Error Handling Edge Cases
// ============================================
console.log('\n[6. Error Handling Edge Cases]');

test('Nested Try-Catch', () => {
    const vm = new SeedLangVM();
    const code = `
        result = ""
        try {
            result = result + "outer-try"
            try {
                result = result + "-inner-try"
                throw "inner-error"
            } catch (e) {
                result = result + "-inner-catch"
            }
            result = result + "-after-inner"
        } catch (e) {
            result = result + "-outer-catch"
        }
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'outer-try-inner-try-inner-catch-after-inner');
});

test('Throw in Catch', () => {
    const vm = new SeedLangVM();
    const code = `
        result = ""
        try {
            throw "error1"
        } catch (e) {
            result = result + "catch1"
            try {
                throw "error2"
            } catch (e2) {
                result = result + "-catch2"
            }
        }
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'catch1-catch2');
});

// ============================================
// 7. Template String Edge Cases
// ============================================
console.log('\n[7. Template String Edge Cases]');

test('Nested Template Expressions', () => {
    const vm = new SeedLangVM();
    const code = `
        a = 1; b = 2; c = 3
        print("a=" + a + ", b=" + b + ", c=" + c + ", sum=" + (a+b+c))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'a=1, b=2, c=3, sum=6');
});

test('Template with Object Property', () => {
    const vm = new SeedLangVM();
    const code = `
        obj = {name: "Alice" age: 30}
        print("Name: " + obj.name + ", Age: " + obj.age)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'Name: Alice, Age: 30');
});

// ============================================
// 8. Extreme Recursion
// ============================================
console.log('\n[8. Extreme Recursion]');

test('Ackermann Function (Small)', () => {
    const vm = new SeedLangVM();
    const code = `
        fn ack(m n) {
            if m == 0 { return n + 1 }
            if n == 0 { return ack(m - 1 1) }
            return ack(m - 1 ack(m n - 1))
        }
        print(ack(2 3))
        print(ack(3 2))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '9');
    assertEqual(r.output[1], '29');
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
    console.log('\n[SUCCESS] All HELL DIFFICULTY tests passed!');
} else {
    console.log('\n[FAILED] Some tests failed:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
}

process.exit(failed > 0 ? 1 : 0);
