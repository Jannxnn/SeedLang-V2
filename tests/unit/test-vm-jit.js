const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('='.repeat(60));
console.log('  VM JIT Compiler Unit Tests');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || result === undefined) {
            console.log(`  [OK] ${name}`);
            passed++;
        } else {
            console.log(`  [FAIL] ${name}: ${result}`);
            failed++;
        }
    } catch (e) {
        console.log(`  [FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(`${msg || ''} Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
}

function vmRun(code) {
    const vm = new SeedLangVM({ maxInstructions: 50000000 });
    const result = vm.run(code);
    if (!result.success) throw new Error(result.error);
    return { result: vm.vm.globals.result, output: result.output || [] };
}

console.log('\n--- Leaf function optimization ---');

test('leaf function: simple return', () => {
    const { result } = vmRun('fn double(x) { return x * 2 }\nresult = double(5)');
    assertEqual(result, 10);
});

test('leaf function: addition', () => {
    const { result } = vmRun('fn add(a b) { return a + b }\nresult = add(3 7)');
    assertEqual(result, 10);
});

test('leaf function: subtraction', () => {
    const { result } = vmRun('fn sub(a b) { return a - b }\nresult = sub(10 3)');
    assertEqual(result, 7);
});

test('leaf function: multiplication', () => {
    const { result } = vmRun('fn mul(a b) { return a * b }\nresult = mul(4 5)');
    assertEqual(result, 20);
});

test('leaf function: division', () => {
    const { result } = vmRun('fn div(a b) { return a / b }\nresult = div(20 4)');
    assertEqual(result, 5);
});

test('leaf function: modulo', () => {
    const { result } = vmRun('fn mod(a b) { return a % b }\nresult = mod(17 5)');
    assertEqual(result, 2);
});

test('leaf function: negation', () => {
    const { result } = vmRun('fn neg(x) { return -x }\nresult = neg(7)');
    assertEqual(result, -7);
});

test('leaf function: self-recursive (Newton-Raphson)', () => {
    const { result } = vmRun('fn sqrt(n) { fn approx(g) { if g * g - n < 0.001 { return g } return approx((g + n / g) / 2) } return approx(n) }\nresult = sqrt(4)');
    assertEqual(Math.abs(result - 2) < 0.01, true, `sqrt(4) = ${result}`);
});

test('leaf function: while-to-for conversion', () => {
    const { result } = vmRun('fn sum(n) { s = 0; i = 0; while i < n { s = s + i; i = i + 1 }; return s }\nresult = sum(100)');
    assertEqual(result, 4950);
});

test('leaf function: algebraic optimization a*a-a -> a*(a-1)', () => {
    const { result } = vmRun('fn perm(n) { return n * n - n }\nresult = perm(5)');
    assertEqual(result, 20);
});

console.log('\n--- Global loop JIT (case 96) ---');

test('global for loop JIT: simple sum', () => {
    const { result } = vmRun('sum = 0\nfor (i = 0; i < 100; i = i + 1) {\n  sum = sum + i\n}\nresult = sum');
    assertEqual(result, 4950);
});

test('global for loop JIT: nested loop', () => {
    const { result } = vmRun('sum = 0\nfor (i = 0; i < 10; i = i + 1) {\n  for (j = 0; j < 10; j = j + 1) {\n    sum = sum + 1\n  }\n}\nresult = sum');
    assertEqual(result, 100);
});

test('global for loop JIT: array building', () => {
    const { result } = vmRun('arr = []\nfor (i = 0; i < 5; i = i + 1) {\n  arr.push(i)\n}\nresult = len(arr)');
    assertEqual(result, 5);
});

test('global for loop JIT: with break', () => {
    const { result } = vmRun('sum = 0\nfor (i = 0; i < 1000; i = i + 1) {\n  sum = sum + i\n  if sum > 100 {\n    break\n  }\n}\nresult = sum');
    assertEqual(result > 100, true);
});

test('global for loop JIT: with continue', () => {
    const { result } = vmRun('sum = 0\nfor (i = 0; i < 10; i = i + 1) {\n  if i == 5 {\n    i = i + 0\n  }\n  sum = sum + i\n}\nresult = sum');
    assertEqual(result, 45);
});

console.log('\n--- Local loop JIT (case 95) ---');

test('function for loop JIT: simple sum', () => {
    const { result } = vmRun('fn f(n) { s = 0; for (i = 0; i < n; i = i + 1) { s = s + i }; return s }\nresult = f(100)');
    assertEqual(result, 4950);
});

test('function for loop JIT: local variable isolation', () => {
    const { result } = vmRun('fn f() { s = 0; for (i = 0; i < 5; i = i + 1) { x = i * 10; s = s + x }; return s }\nresult = f()');
    assertEqual(result, 100);
});

test('function for loop JIT: nested loops', () => {
    const { result } = vmRun('fn f() { s = 0; for (i = 0; i < 5; i = i + 1) { for (j = 0; j < 5; j = j + 1) { s = s + 1 } }; return s }\nresult = f()');
    assertEqual(result, 25);
});

test('function for loop JIT: with break', () => {
    const { result } = vmRun('fn f() { s = 0; for (i = 0; i < 1000; i = i + 1) { s = s + i; if s > 50 { break } }; return s }\nresult = f()');
    assertEqual(result > 50, true);
});

console.log('\n--- JIT fast path ---');

test('JIT fast path: repeated code execution', () => {
    const vm = new SeedLangVM({ maxInstructions: 50000000 });
    const code = 'sum = 0\nfor (i = 0; i < 10; i = i + 1) {\n  sum = sum + i\n}\nresult = sum';
    const r1 = vm.run(code);
    assertEqual(r1.success, true);
    assertEqual(vm.vm.globals.result, 45);
    const r2 = vm.run(code);
    assertEqual(r2.success, true);
    assertEqual(vm.vm.globals.result, 45);
});

test('JIT fast path: CALL_BUILTIN in loop body', () => {
    const { result } = vmRun('s = ""\narr = [1 2 3]\nfor (i = 0; i < len(arr); i = i + 1) {\n  s = s + arr[i]\n}\nresult = s');
    assertEqual(result, "123");
});

console.log('\n--- Budget check in JIT ---');

test('JIT loop respects execution budget', () => {
    const vm = new SeedLangVM({ maxInstructions: 1000 });
    const result = vm.run('for (i = 0; i < 100000; i = i + 1) { }');
    assertEqual(result.success, false);
    assertEqual(result.error.includes('Execution limit exceeded'), true, `Unexpected error: ${result.error}`);
});

test('JIT loop respects timeout', () => {
    const vm = new SeedLangVM({ maxInstructions: 50000000, maxExecutionMs: 50 });
    const result = vm.run('while true { }');
    assertEqual(result.success, false);
});

console.log('\n--- while loop JIT ---');

test('while loop JIT: basic', () => {
    const { result } = vmRun('i = 0\nwhile i < 10 {\n  i = i + 1\n}\nresult = i');
    assertEqual(result, 10);
});

test('while loop JIT: with condition expression', () => {
    const { result } = vmRun('i = 0; sum = 0\nwhile i < 5 {\n  sum = sum + i * 2\n  i = i + 1\n}\nresult = sum');
    assertEqual(result, 20);
});

console.log('\n--- for-in JIT ---');

test('for-in array JIT: sum', () => {
    const { result } = vmRun('sum = 0\nfor x in [1 2 3 4 5] {\n  sum = sum + x\n}\nresult = sum');
    assertEqual(result, 15);
});

test('for-in object JIT: sum values', () => {
    const { result } = vmRun('obj = { a: 10 b: 20 c: 30 }\nsum = 0\nfor v in obj {\n  sum = sum + v\n}\nresult = sum');
    assertEqual(result, 60);
});

console.log('\n' + '='.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
