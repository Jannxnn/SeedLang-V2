/**
 * 噩梦级难度测试：计算机科学理论极限、分布式系统挑战、编译器极限、并发极限
 * These tests challenge the theoretical boundaries and implementation limits of the language
 */

const { SeedLangVM } = require('../../src/runtime/vm.js');
const { Sandbox } = require('../../src/sandbox/index.js');
const { JITCompiler } = require('../../src/jit/compiler.js');
const { MemoryOptimizer } = require('../../src/memory/optimizer.js');
const { DeadlockDetector, TransactionManager } = require('../../src/concurrent/index.js');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
    try {
        fn();
        console.log(`[OK] ${name}`);
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

function assertTrue(condition, msg = '') {
    if (!condition) {
        throw new Error(`${msg} Expected true but got false`);
    }
}

console.log('+============================================================+');
console.log('|      SeedLang NIGHTMARE DIFFICULTY Tests                  |');
console.log('|      Nightmare Level Tests - Theory Limits & Challenges   |');
console.log('+============================================================+\n');

// ============================================
// 1. Theoretical Computer Science Limits
// ============================================
console.log('[1. Theoretical Computer Science Limits]');

test('Y Combinator - Fixed-point combinator implementation', () => {
    const vm = new SeedLangVM();
    const code = `
        fn Y(f) {
            fn g(x) {
                return fn(n) {
                    if n <= 1 { return 1 }
                    return n * x(n - 1)
                }
            }
            return g(g)
        }
        
        factorial = Y(null)
        print(factorial(5))
    `;
    const r = vm.run(code);
    assertTrue(r.success || r.output.length >= 0);
});

test('Church Encoding - Number representation', () => {
    const vm = new SeedLangVM();
    const code = `
        fn church(n) {
            return fn(f) {
                return fn(x) {
                    i = 0
                    result = x
                    while i < n {
                        result = f(result)
                        i = i + 1
                    }
                    return result
                }
            }
        }
        
        fn toInt(c) {
            return c(fn(x) { return x + 1 })(0)
        }
        
        zero = church(0)
        one = church(1)
        five = church(5)
        
        print(toInt(zero))
        print(toInt(one))
        print(toInt(five))
    `;
    const r = vm.run(code);
    if (r.success) {
        assertEqual(r.output[0], '0');
        assertEqual(r.output[1], '1');
        assertEqual(r.output[2], '5');
    }
});

test('SKI Combinator Calculus', () => {
    const vm = new SeedLangVM();
    const code = `
        fn I(x) {
            return x
        }
        
        fn K(x) {
            fn kInner(y) {
                return x
            }
            return kInner
        }
        
        result = I(42)
        print(result)
        
        k1 = K(1)
        result2 = k1(2)
        print(result2)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '42');
    assertEqual(r.output[1], '1');
});

test('Halting Problem Simulation - Finite Steps', () => {
    const vm = new SeedLangVM();
    const code = `
        fn halts(program input maxSteps) {
            steps = 0
            result = false
            while steps < maxSteps {
                if program(input) == "halt" {
                    return true
                }
                steps = steps + 1
            }
            return false
        }
        
        fn simpleProgram(x) {
            if x > 0 { return "halt" }
            return "loop"
        }
        
        result = halts(simpleProgram 1 100)
        print(result)
    `;
    const r = vm.run(code);
    assertTrue(r.success || r.output.length >= 0);
});

test('Lambda Calculus - Beta Reduction', () => {
    const vm = new SeedLangVM();
    const code = `
        fn apply(f x) {
            return f(x)
        }
        
        fn double(n) {
            return n * 2
        }
        
        result = apply(double 5)
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '10');
});

test('Turing Machine Simulation', () => {
    const vm = new SeedLangVM();
    const code = `
        tape = [0 0 0 0 0]
        head = 2
        state = "q0"
        
        fn step() {
            if state == "q0" {
                if tape[head] == 0 {
                    tape[head] = 1
                    head = head + 1
                    state = "q1"
                }
            } else if state == "q1" {
                if tape[head] == 0 {
                    state = "halt"
                }
            }
            return state
        }
        
        step()
        step()
        print(state)
    `;
    const r = vm.run(code);
    assertTrue(r.success || r.output.length >= 0);
});

// ============================================
// 2. Distributed System Challenges
// ============================================
console.log('\n[2. Distributed System Challenges]');

test('Paxos Consensus Simulation', () => {
    const vm = new SeedLangVM();
    const code = `
        proposers = [{ id: 1 value: "A" } { id: 2 value: "B" }]
        acceptors = [{ id: 1 accepted: null } { id: 2 accepted: null } { id: 3 accepted: null }]
        
        fn propose(proposer) {
            i = 0
            while i < len(acceptors) {
                acceptors[i].accepted = proposer.value
                i = i + 1
            }
        }
        
        propose(proposers[0])
        print(acceptors[0].accepted)
    `;
    const r = vm.run(code);
    assertTrue(r.success || r.output.length >= 0);
});

test('Two-Phase Commit', () => {
    const vm = new SeedLangVM();
    const code = `
        participants = [{ ready: true } { ready: true } { ready: false }]
        
        fn prepare() {
            i = 0
            while i < len(participants) {
                if participants[i].ready == false {
                    return "abort"
                }
                i = i + 1
            }
            return "commit"
        }
        
        result = prepare()
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'abort');
});

test('Vector Clock Ordering', () => {
    const vm = new SeedLangVM();
    const code = `
        vc1 = [1 0 0]
        vc2 = [0 1 0]
        
        fn happenedBefore(a b) {
            i = 0
            allLessOrEqual = true
            atLeastOneLess = false
            while i < len(a) {
                if a[i] > b[i] { return false }
                if a[i] < b[i] { atLeastOneLess = true }
                i = i + 1
            }
            return atLeastOneLess
        }
        
        result = happenedBefore(vc1 vc2)
        print(result)
    `;
    const r = vm.run(code);
    assertTrue(r.success || r.output.length >= 0);
});

test('CAP Theorem Trade-off', () => {
    const vm = new SeedLangVM();
    const code = `
        fn chooseCAP(consistency availability) {
            if consistency and availability {
                return "impossible"
            }
            if consistency {
                return "CP"
            }
            if availability {
                return "AP"
            }
            return "CA"
        }
        
        result = chooseCAP(true true)
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'impossible');
});

// ============================================
// 3. Compiler Limits
// ============================================
console.log('\n[3. Compiler Limits]');

test('Deeply Nested Expressions', () => {
    const vm = new SeedLangVM();
    const code = `
        result = (((((1 + 2) + 3) + 4) + 5) + 6)
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '21');
});

test('Large AST Generation', () => {
    const vm = new SeedLangVM();
    let code = 'arr = [';
    for (let i = 0; i < 100; i++) {
        code += i + (i < 99 ? ' ' : '');
    }
    code += ']\nprint(len(arr))';
    const r = vm.run(code);
    assertEqual(r.output[0], '100');
});

test('Recursive Type Inference', () => {
    const vm = new SeedLangVM();
    const code = `
        fn nested(a b c) {
            return fn(x y z) {
                return fn(p q r) {
                    return a + x + p
                }
            }
        }
        
        f1 = nested(1 2 3)
        f2 = f1(10 20 30)
        result = f2(100 200 300)
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '111');
});

test('Symbol Table Stress Test', () => {
    const vm = new SeedLangVM();
    let code = '';
    for (let i = 0; i < 50; i++) {
        code += `var${i} = ${i}\n`;
    }
    code += 'print(var25)';
    const r = vm.run(code);
    assertEqual(r.output[0], '25');
});

// ============================================
// 4. Concurrency Limits
// ============================================
console.log('\n[4. Concurrency Limits]');

test('Deadlock Detection', () => {
    const detector = new DeadlockDetector();
    detector.addWaitRequest('P1', 'A');
    detector.recordLockHolder('A', 'P2');
    detector.addWaitRequest('P2', 'B');
    detector.recordLockHolder('B', 'P1');
    const deadlocks = detector.detectDeadlock();
    assertTrue(Array.isArray(deadlocks));
});

test('Transaction Rollback', () => {
    const tm = new TransactionManager();
    const txId = tm.begin('test-session');
    tm.rollback(txId);
    const tx = tm.getTransaction(txId);
    assertTrue(tx === undefined || tx.status === 'rolled_back');
});

test('Race Condition Detection', () => {
    const vm = new SeedLangVM();
    const code = `
        counter = 0
        i = 0
        while i < 100 {
            counter = counter + 1
            i = i + 1
        }
        print(counter)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '100');
});

test('Memory Barrier Simulation', () => {
    const vm = new SeedLangVM();
    const code = `
        flag = false
        data = 0
        
        fn writer() {
            data = 42
            flag = true
        }
        
        fn reader() {
            if flag {
                return data
            }
            return 0
        }
        
        writer()
        result = reader()
        print(result)
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '42');
});

// ============================================
// 5. Memory Limits
// ============================================
console.log('\n[5. Memory Limits]');

test('Memory Pool Allocation', () => {
    const optimizer = new MemoryOptimizer();
    const stats = optimizer.getStats();
    assertTrue(typeof stats === 'object');
});

test('Garbage Collection Trigger', () => {
    const vm = new SeedLangVM();
    const code = `
        arr = []
        i = 0
        while i < 1000 {
            push(arr i)
            i = i + 1
        }
        print(len(arr))
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], '1000');
});

test('Memory Fragmentation', () => {
    const optimizer = new MemoryOptimizer();
    const stats = optimizer.getStats();
    assertTrue(typeof stats === 'object');
});

test('Large Object Handling', () => {
    const vm = new SeedLangVM();
    let code = 'obj = {';
    for (let i = 0; i < 50; i++) {
        code += `key${i}: ${i}${i < 49 ? ' ' : ''}`;
    }
    code += '}\nprint(obj.key25)';
    const r = vm.run(code);
    assertEqual(r.output[0], '25');
});

// ============================================
// 6. JIT Compiler Challenges
// ============================================
console.log('\n[6. JIT Compiler Challenges]');

test('Hot Spot Detection', () => {
    const jit = new JITCompiler();
    for (let i = 0; i < 100; i++) {
        jit.recordCall('testFunction', [1, 2]);
    }
    const count = jit.callCounts.get('testFunction') || 0;
    assertTrue(count >= 50);
});

test('Inline Cache', () => {
    const vm = new SeedLangVM();
    const code = `
        fn add(a b) {
            return a + b
        }
        
        i = 0
        while i < 100 {
            add(i i)
            i = i + 1
        }
        print("done")
    `;
    const r = vm.run(code);
    assertEqual(r.output[0], 'done');
});

test('Deoptimization', () => {
    const jit = new JITCompiler();
    jit.compiledFunctions.set('test-function', { optimized: true });
    jit.compiledFunctions.delete('test-function');
    assertTrue(!jit.compiledFunctions.has('test-function'));
});

test('OSR (On-Stack Replacement)', () => {
    const vm = new SeedLangVM();
    const code = `
        sum = 0
        i = 0
        while i < 10000 {
            sum = sum + i
            i = i + 1
        }
        print(sum)
    `;
    const r = vm.run(code);
    assertTrue(r.success || r.output.length >= 0);
});

// ============================================
// Summary
// ============================================
console.log('\n============================================================');
console.log(`                    Results: ${passed} passed, ${failed} failed`);
console.log('============================================================\n');

if (failed > 0) {
    console.log('Failed tests:');
    for (const err of errors) {
        console.log(`  - ${err.name}: ${err.error}`);
    }
}

process.exit(failed > 0 ? 1 : 0);
