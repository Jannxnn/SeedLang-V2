/**
 * SeedLang vs JavaScript 性能对比测试：使用复杂循环场景对比真实 JIT 执行性能
 * Testing real JIT performance with complex loops
 */

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('='.repeat(60));
console.log('  SeedLang vs JavaScript Performance');
console.log('  (Testing JIT with Complex Loops)');
console.log('='.repeat(60) + '\n');

const iterations = 10000;

function compare(name, seedCode, jsFn) {
    const vm = new SeedLangVM();
    
    vm.run(seedCode);
    
    const jitStatus = vm.vm._jitFastPath ? 'JIT' : (vm.vm._superFastPath ? 'SuperFast' : 'Cached');
    const hasNativeFn = Object.values(vm.vm.globals).some(v => v?._nativeFn);
    
    const seedStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        vm.run(seedCode);
    }
    const seedEnd = process.hrtime.bigint();
    const seedMs = Number(seedEnd - seedStart) / 1_000_000;
    
    const jsStart = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        jsFn();
    }
    const jsEnd = process.hrtime.bigint();
    const jsMs = Number(jsEnd - jsStart) / 1_000_000;
    
    const ratio = seedMs / jsMs;
    const ratioStr = ratio > 1 ? `${ratio.toFixed(2)}x slower` : `${(1/ratio).toFixed(2)}x faster`;
    
    console.log(`${name}:`);
    console.log(`  SeedLang: ${seedMs.toFixed(2)}ms (${(iterations/seedMs*1000).toFixed(0)} ops/s) [${jitStatus}${hasNativeFn ? '+NativeFn' : ''}]`);
    console.log(`  JavaScript: ${jsMs.toFixed(2)}ms (${(iterations/jsMs*1000).toFixed(0)} ops/s)`);
    console.log(`  Ratio: ${ratioStr}`);
    console.log();
    
    return { name, seedMs, jsMs, ratio };
}

console.log('--- Complex Loops (Triggers JIT) ---\n');

const results = [];

results.push(compare('Complex While Loop', 
    `i = 0
sum = 0
while i < 100 {
    sum = sum + i * 2
    i = i + 1
}`,
    () => { let i = 0, sum = 0; while (i < 100) { sum += i * 2; i++; } }
));

results.push(compare('Nested Loop', 
    `result = 0
i = 0
while i < 10 {
    j = 0
    while j < 10 {
        result = result + i * j
        j = j + 1
    }
    i = i + 1
}`,
    () => { let result = 0; for (let i = 0; i < 10; i++) { for (let j = 0; j < 10; j++) { result += i * j; } } }
));

results.push(compare('Array Sum Loop', 
    `arr = [1 2 3 4 5 6 7 8 9 10]
sum = 0
i = 0
while i < 10 {
    sum = sum + arr[i]
    i = i + 1
}`,
    () => { let arr = [1,2,3,4,5,6,7,8,9,10]; let sum = 0; for (let i = 0; i < 10; i++) sum += arr[i]; }
));

console.log('--- Recursive Functions (JIT Optimized) ---\n');

results.push(compare('Fibonacci(20)', 
    `fn fib(n) { 
        if n <= 1 { return n } 
        return fib(n - 1) + fib(n - 2) 
    }
    result = fib(20)`,
    () => { function fib(n) { return n <= 1 ? n : fib(n - 1) + fib(n - 2); } return fib(20); }
));

results.push(compare('Factorial(15)', 
    `fn fact(n) { 
        if n <= 1 { return 1 } 
        return n * fact(n - 1) 
    }
    result = fact(15)`,
    () => { function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); } return fact(15); }
));

results.push(compare('GCD(100 iterations)', 
    `fn gcd(a b) {
        while b != 0 {
            temp = b
            b = a % b
            a = temp
        }
        return a
    }
    result = 0
    i = 0
    while i < 100 {
        result = gcd(48 + i 18 + i)
        i = i + 1
    }`,
    () => { 
        function gcd(a, b) { while (b !== 0) { let t = b; b = a % b; a = t; } return a; }
        let result = 0;
        for (let i = 0; i < 100; i++) result = gcd(48 + i, 18 + i);
    }
));

console.log('--- Simple Operations (Cached) ---\n');

results.push(compare('Arithmetic', 
    'result = 1 + 2 * 3 - 4 / 2',
    () => { let result = 1 + 2 * 3 - 4 / 2; }
));

results.push(compare('Object Creation', 
    'result = { a: 1 b: 2 c: 3 }',
    () => { let result = { a: 1, b: 2, c: 3 }; }
));

console.log('='.repeat(60));
console.log('  Summary');
console.log('='.repeat(60));

const avgRatio = results.reduce((sum, r) => sum + r.ratio, 0) / results.length;

console.log(`\nAverage: ${avgRatio.toFixed(2)}x slower than JavaScript\n`);

if (avgRatio < 2) {
    console.log('🏆 EXCELLENT! Near-native performance!');
} else if (avgRatio < 5) {
    console.log('✅ Very good! Competitive with JavaScript.');
} else if (avgRatio < 20) {
    console.log('✅ Good! Reasonable for a bytecode VM.');
} else {
    console.log('⚠️  Needs optimization.');
}

console.log('\n' + '='.repeat(60));
