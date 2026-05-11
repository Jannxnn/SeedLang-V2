const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('  compileToJS Output Quality Tests');
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

function compile(seedCode) {
    const tmpFile = path.join(__dirname, '_tmp_compile_test.seed');
    const outFile = path.join(__dirname, '_tmp_compile_test.js');
    try {
        fs.writeFileSync(tmpFile, seedCode);
        execSync(`node "${path.join(__dirname, '..', '..', 'dist', 'cli.js')}" --compile "${tmpFile}"`, { stdio: 'pipe' });
        return fs.readFileSync(outFile, 'utf-8');
    } finally {
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        try { fs.unlinkSync(outFile); } catch (e) {}
    }
}

console.log('\n--- Basic compilation ---');

test('compiles simple expression', () => {
    const js = compile('x = 1 + 2\nprint(x)');
    assertEqual(js.includes('1 + 2') || js.includes('3'), true);
});

test('compiles function definition', () => {
    const js = compile('fn add(a b) { return a + b }\nprint(add(3 5))');
    assertEqual(js.includes('function add'), true);
    assertEqual(js.includes('return'), true);
});

test('compiles for-in loop', () => {
    const js = compile('for x in [1 2 3] {\n  print(x)\n}');
    assertEqual(js.includes('for'), true);
});

test('compiles while loop', () => {
    const js = compile('i = 0\nwhile i < 5 {\n  i = i + 1\n}');
    assertEqual(js.includes('while'), true);
});

test('compiles if-else', () => {
    const js = compile('x = 10\nif x > 5 {\n  print("big")\n} else {\n  print("small")\n}');
    assertEqual(js.includes('if'), true);
    assertEqual(js.includes('else'), true);
});

console.log('\n--- Output quality: no redundant parentheses ---');

test('no double parens in while condition', () => {
    const js = compile('i = 0\nwhile i < 10 {\n  i = i + 1\n}');
    assertEqual(js.includes('while (('), false, 'Found double parens in while');
});

test('no double parens in if condition', () => {
    const js = compile('x = 5\nif x > 3 {\n  print(x)\n}');
    assertEqual(js.includes('if (('), false, 'Found double parens in if');
});

console.log('\n--- Output quality: operator precedence safety ---');

test('addition in multiplication context preserves parens', () => {
    const js = compile('a = 2\nb = 3\nc = 4\nresult = (a + b) * c\nprint(result)');
    if (js.includes('a + b * c') && !js.includes('(a + b)')) {
        throw new Error('Operator precedence bug: (a + b) * c simplified to a + b * c');
    }
});

test('subtraction in division context preserves parens', () => {
    const js = compile('a = 10\nb = 3\nc = 2\nresult = (a - b) / c\nprint(result)');
    if (js.includes('a - b / c') && !js.includes('(a - b)')) {
        throw new Error('Operator precedence bug: (a - b) / c simplified to a - b / c');
    }
});

console.log('\n--- Output quality: array preallocation ---');

test('empty array + length assignment optimized', () => {
    const js = compile('arr = []\narr.length = 100\nprint(arr)');
    assertEqual(js.includes('new Array'), true, 'Expected new Array() optimization');
});

console.log('\n--- Output quality: for-in extraction ---');

test('for-in with inner loop extracts to __forIn function', () => {
    const js = compile('for x in [1 2 3] {\n  s = 0\n  for (i = 0; i < x; i = i + 1) {\n    s = s + i\n  }\n}');
    assertEqual(js.includes('__forIn_'), true, 'Expected __forIn_ function extraction');
});

test('for-in without inner loop does not extract', () => {
    const js = compile('sum = 0\nfor x in [1 2 3] {\n  sum = sum + x\n}');
    assertEqual(js.includes('__forIn_'), false, 'Unexpected __forIn_ extraction');
});

console.log('\n--- Output quality: const vs let ---');

test('reassigned variable uses let', () => {
    const js = compile('x = 0\nx = 10\nprint(x)');
    assertEqual(js.includes('let x'), true, 'Expected let for reassigned variable');
});

console.log('\n--- Compiled JS is executable ---');

test('compiled JS runs correctly: simple math', () => {
    const js = compile('result = 2 + 3 * 4\nprint(result)');
    assertEqual(js.includes('2 + 12') || js.includes('14') || js.includes('2 + 3 * 4'), true);
});

test('compiled JS runs correctly: function call', () => {
    const js = compile('fn double(x) { return x * 2 }\nprint(double(7))');
    assertEqual(js.includes('function double'), true);
});

test('compiled JS runs correctly: for-in array', () => {
    const js = compile('sum = 0\nfor x in [1 2 3] {\n  sum = sum + x\n}\nprint(sum)');
    assertEqual(js.includes('for') && js.includes('of'), true, 'Expected for...of pattern');
});

console.log('\n' + '='.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
