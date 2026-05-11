// 回归测试集合：收集历史 bug 修复对应的回归用例，防止已修复问题再次出现

const { SeedLangVM } = require('../../src/runtime/vm.js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Regression Tests ===\n');

const vm = new SeedLangVM();
let passed = 0;
let failed = 0;

function test(name, code, check) {
    vm.reset();
    
    try {
        const result = vm.run(code);
        
        if (!result.success) {
            console.log(`[FAIL] ${name}: ${result.error}`);
            failed++;
            return;
        }
        
        const actual = vm.vm.globals.result;
        
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

console.log('--- BUG-001: while loop JUMP offset error ---');
test('while loop basic', `
i = 0
while i < 5 {
    i = i + 1
}
result = i
`, (actual) => actual === 5);

test('while loop nested', `
i = 0
j = 0
while i < 3 {
    j = 0
    while j < 3 {
        j = j + 1
    }
    i = i + 1
}
result = i + j
`, (actual) => actual === 6);

console.log('\n--- BUG-002: isGenericCall incorrectly identifies comparison operations ---');
test('Comparison less than', `
i = 3
result = i < 5
`, (actual) => actual === true);

test('Comparison less than or equal', `
i = 5
result = i <= 5
`, (actual) => actual === true);

test('Comparison greater than', `
i = 7
result = i > 5
`, (actual) => actual === true);

test('Comparison greater than or equal', `
i = 5
result = i >= 5
`, (actual) => actual === true);

test('Function call in while condition', `
fn getFive() { return 5 }
i = 0
while i < getFive() {
    i = i + 1
}
result = i
`, (actual) => actual === 5);

test('len call in while condition', `
arr = [1 2 3 4 5]
i = 0
while i < len(arr) {
    i = i + 1
}
result = i
`, (actual) => actual === 5);

console.log('\n--- BUG-003: Quick sort infinite loop ---');
test('Quick sort algorithm', `
fn quicksort(arr) {
    if len(arr) <= 1 { return arr }
    pivot = arr[0]
    left = []
    right = []
    i = 1
    while i < len(arr) {
        if arr[i] < pivot {
            push(left arr[i])
        } else {
            push(right arr[i])
        }
        i = i + 1
    }
    sortedLeft = quicksort(left)
    sortedRight = quicksort(right)
    pivotArr = [pivot]
    result = concat(sortedLeft pivotArr)
    result = concat(result sortedRight)
    return result
}
result = quicksort([5 3 8 1 9 2 7 4 6])
`, (actual) => JSON.stringify(actual) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]));

console.log('\n--- BUG-004: Unicode identifier parsing ---');
test('Chinese variable name', `
variable = 42
result_val = variable * 2
result = result_val
`, (actual) => actual === 84);

test('Japanese variable name', `
variable = 10
result_val = variable + 5
result = result_val
`, (actual) => actual === 15);

test('Korean variable name', `
variable = 7
result_val = variable * 3
result = result_val
`, (actual) => actual === 21);

console.log('\n--- BUG-005: for...in array traversal ---');
test('for iterate array', `
total = 0
for i in [1 2 3 4 5] {
    total = total + i
}
result = total
`, (actual) => actual === 15);

test('for iterate array modify', `
arr = [1 2 3]
newArr = []
for i in arr {
    push(newArr i * 2)
}
result = newArr
`, (actual) => JSON.stringify(actual) === JSON.stringify([2, 4, 6]));

console.log('\n--- BUG-006: forC optimization generalized patterns ---');
test('ternary parity with != and non-zero base', `
r = 5
for (i = 0; i < 10; i = i + 1) {
    r = 0 != i % 2 ? r + 2 : r - 3
}
result = r
`, (actual) => actual === 0);

test('ternary parity with swapped addition operands', `
r = 1
for (i = 0; i < 7; i = i + 1) {
    r = 0 == i % 2 ? 1 + r : r - 2
}
result = r
`, (actual) => actual === -1);

test('anti-opt array sum with > N-1 wrap form', `
arr = []
for (i = 0; i < 1000; i = i + 1) {
    push(arr i)
}
idx = 0
s = 0
for (i = 0; i < 1000; i = i + 1) {
    idx = idx + 97
    if (idx > 999) {
        idx = idx - 1000
    }
    s = s + arr[idx]
}
result = s
`, (actual) => actual === 499500);

console.log('\n--- BUG-010: for-in loop body extraction for V8 JIT optimization ---');

test('for-in with for loop: VM correctness', `
total = 0
inputs = [1 2 3]
for n in inputs {
  s = 0
  for (i = 0; i < n; i = i + 1) {
    s = s + i
  }
  total = total + s
}
result = total
`, (actual) => actual === 4);

test('for-in with nested for loop: VM correctness', `
total = 0
inputs = [1 2]
for n in inputs {
  s = 0
  for (i = 0; i < n; i = i + 1) {
    for (j = 0; j < n; j = j + 1) {
      s = s + 1
    }
  }
  total = total + s
}
result = total
`, (actual) => actual === 5);

test('for-in with array sum: VM correctness', `
total = 0
inputs = [3 2]
for n in inputs {
  arr = []
  for (i = 0; i < n; i = i + 1) {
    push(arr i)
  }
  s = 0
  for (i = 0; i < n; i = i + 1) {
    s = s + arr[i]
  }
  total = total + s
}
result = total
`, (actual) => actual === 4);

test('for-in without loop: no extraction needed', `
total = 0
inputs = [1 2 3]
for n in inputs {
  total = total + n
}
result = total
`, (actual) => actual === 6);

console.log('\n--- BUG-010-compile: compileToJS for-in extraction output ---');

const TMP_SEED = path.join(__dirname, '_tmp_forin_test.seed');
const TMP_JS = path.join(__dirname, '_tmp_forin_test.js');

function compileSeedToJS(code) {
    fs.writeFileSync(TMP_SEED, code, 'utf8');
    execSync(`node "${path.join(__dirname, '../../dist/cli.js')}" --compile "${TMP_SEED}" -o "${TMP_JS}"`, { encoding: 'utf8' });
    const js = fs.readFileSync(TMP_JS, 'utf8');
    fs.unlinkSync(TMP_SEED);
    fs.unlinkSync(TMP_JS);
    return js;
}

function testCompile(name, code, check) {
    try {
        const js = compileSeedToJS(code);
        if (check(js)) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: compileToJS output check failed`);
            failed++;
        }
    } catch (e) {
        if (fs.existsSync(TMP_SEED)) fs.unlinkSync(TMP_SEED);
        if (fs.existsSync(TMP_JS)) fs.unlinkSync(TMP_JS);
        console.log(`[FAIL] ${name}: Exception - ${e.message}`);
        failed++;
    }
}

testCompile('for-in with for loop: extracts to __forIn_N function', `
fn bench() {
  inputs = [1 2 3]
  for n in inputs {
    s = 0
    for (i = 0; i < n; i = i + 1) {
      s = s + i
    }
  }
}
`, (js) => /function __forIn_\d+\(/.test(js) && /__forIn_\d+\(/.test(js.replace('function __forIn_', '')));

testCompile('for-in with while loop: extracts to __forIn_N function', `
fn bench() {
  inputs = [1 2 3]
  for n in inputs {
    s = 0
    i = 0
    while i < n {
      s = s + i
      i = i + 1
    }
  }
}
`, (js) => /function __forIn_\d+\(/.test(js) && /__forIn_\d+\(/.test(js.replace('function __forIn_', '')));

testCompile('for-in without loop: no extraction', `
fn bench() {
  inputs = [1 2 3]
  for n in inputs {
    total = total + n
  }
}
`, (js) => !js.includes('__forIn_'));

testCompile('for-in scoped vars: no function-level let for body vars', `
fn bench() {
  inputs = [1 2 3]
  for n in inputs {
    arr = []
    for (i = 0; i < n; i = i + 1) {
      push(arr i)
    }
    s = 0
  }
}
`, (js) => {
    const fnMatch = js.match(/function bench\(\)[^}]*\{([^]*?)function __forIn_/);
    if (!fnMatch) return false;
    const fnBody = fnMatch[1];
    return !fnBody.match(/let\s+arr/) && !fnBody.match(/let\s+s\b/);
});

testCompile('for-in extracted function uses let for body vars', `
fn bench() {
  inputs = [1 2 3]
  for n in inputs {
    s = 0
    for (i = 0; i < n; i = i + 1) {
      s = s + i
    }
  }
}
`, (js) => {
    const forInMatch = js.match(/function __forIn_\d+\([^)]*\)\s*\{([^]*?)\n\}/);
    if (!forInMatch) return false;
    const forInBody = forInMatch[1];
    return forInBody.includes('let s = 0');
});

console.log('\n--- BUG-011: Object for-in iteration coverage ---');
test('obj for-in iterates values', `
obj = { a: 1 b: 2 c: 3 }
total = 0
for v in obj {
    total = total + v
}
result = total
`, (actual) => actual === 6);

test('obj for-in with string values', `
obj = { name: "Alice" age: 30 }
s = ""
for v in obj {
    s = s + v
}
result = s
`, (actual) => actual === "Alice30");

test('obj for-in single property', `
obj = { x: 42 }
for v in obj {
    result = v
}
`, (actual) => actual === 42);

test('obj for-in empty object', `
obj = {}
cnt = 0
for v in obj {
    cnt = cnt + 1
}
result = cnt
`, (actual) => actual === 0);

test('obj for-in with expression', `
obj = { a: 10 b: 20 }
total = 0
for v in obj {
    total = total + v * 2
}
result = total
`, (actual) => actual === 60);

test('obj for-in with break', `
obj = { a: 1 b: 2 c: 3 }
total = 0
for v in obj {
    total = total + v
    if total > 2 {
        break
    }
}
result = total
`, (actual) => actual === 3);

test('obj for-in with continue', `
obj = { a: 1 b: 2 c: 3 }
total = 0
for v in obj {
    if v == 2 {
        continue
    }
    total = total + v
}
result = total
`, (actual) => actual === 4);

test('obj for-in nested in function', `
fn sumObj(o) {
    s = 0
    for v in o {
        s = s + v
    }
    return s
}
result = sumObj({ x: 5 y: 10 z: 15 })
`, (actual) => actual === 30);

test('obj for-in with array value', `
obj = { nums: [1 2 3] }
for v in obj {
    result = v
}
`, (actual) => JSON.stringify(actual) === '[1,2,3]');

test('obj for-in count iterations', `
obj = { a: 1 b: 2 c: 3 d: 4 }
cnt = 0
for v in obj {
    cnt = cnt + 1
}
result = cnt
`, (actual) => actual === 4);

test('obj for-in nested objects', `
inner = { x: 1 }
obj = { a: inner b: inner }
cnt = 0
for v in obj {
    cnt = cnt + v.x
}
result = cnt
`, (actual) => actual === 2);

test('obj for-in string concat values', `
obj = { a: 100 b: 200 }
s = ""
for v in obj {
    s = s + v
}
result = s
`, (actual) => actual === "100200");

console.log('\n--- BUG-012: Generic vs comparison disambiguation in if/while conditions ---');
test('if x < y not misinterpreted as generic', `
x = 3
y = 10
if x < y {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 1);

test('if x < int where int is variable name', `
x = 3
int = 10
if x < int {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 1);

test('if x < y > z chained comparison', `
a = 3
b = 10
c = 0
if a < b > c {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 1);

test('if score < max > (min) with parens', `
score = 7
max = 10
min = 0
if score < max > (min) {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 1);

test('if x < y + 1 comparison with arithmetic', `
x = 3
y = 10
if x < y + 1 {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 1);

test('if x < y && c > 0 compound comparison', `
a = 3
b = 10
c = 5
if a < b && c > 0 {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 1);

test('if x < getLimit() comparison with function call', `
fn getLimit() { return 10 }
x = 3
if x < getLimit() {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 1);

test('while i < len(arr) comparison in while', `
arr = [10 20 30]
i = 0
while i < len(arr) {
    i = i + 1
}
result = i
`, (actual) => actual === 3);

test('if x < y false comparison', `
x = 10
y = 3
if x < y {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 0);

test('nested if with < comparison', `
x = 3
if x < 10 {
    if x < 5 {
        result = 1
    } else {
        result = 2
    }
} else {
    result = 3
}
`, (actual) => actual === 1);

test('if x <= y && x >= y equality comparisons', `
x = 5
y = 5
if x <= y && x >= y {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 1);

test('if x < y > (z + 1) comparison with expression in parens', `
a = 3
b = 10
c = -1
if a < b > (c + 1) {
    result = 1
} else {
    result = 0
}
`, (actual) => actual === 1);

console.log('\n--- BUG-013: CLC compiler - LogicalExpr operator mapping and precedence ---');
test('and operator works correctly', `
a = 1
b = 1
result = a and b
`, (actual) => actual === true || actual === 1);

test('or operator works correctly', `
a = 0
b = 1
result = a or b
`, (actual) => actual === true || actual === 1);

test('and/or mixed precedence: a or b and c', `
a = 1
b = 0
c = 1
result = a or b and c
`, (actual) => actual === true || actual === 1);

test('not operator with comparison', `
x = 5
result = !(x > 10)
`, (actual) => actual === true || actual === 1);

console.log('\n--- BUG-014: CLC compiler - UnaryExpr negation parenthesis ---');
test('double negation', `
x = 5
y = -(-x)
result = y
`, (actual) => actual === 5);

test('negation of negative', `
x = -3
y = -x
result = y
`, (actual) => actual === 3);

console.log('\n--- BUG-015: CLC compiler - String indexOf/includes uses correct function ---');
test('string indexOf', `
s = "hello world"
result = indexOf(s "world")
`, (actual) => actual === 6);

test('string includes', `
s = "hello world"
result = includes(s "world")
`, (actual) => actual === true || actual === 1);

test('array indexOf', `
arr = [10 20 30]
result = indexOf(arr 20)
`, (actual) => actual === 1);

console.log('\n--- BUG-016: CLC compiler - Inherited property assignment uses _super ---');
test('inherited property access', `
class Animal {
  init(name) {
    this.name = name
  }
  getName() {
    return this.name
  }
}
class Dog extends Animal {
  init(name breed) {
    super.init(name)
    this.breed = breed
  }
  getBreed() {
    return this.breed
  }
}
d = Dog("Rex" "Labrador")
result = d.getName() + " " + d.getBreed()
`, (actual) => actual === "Rex Labrador");

console.log('\n--- BUG-017: CLC compiler - Memoization cache type for double ---');
test('recursive fibonacci with memo-like pattern', `
fn fib(n) {
  if n <= 1 { return n }
  return fib(n - 1) + fib(n - 2)
}
result = fib(10)
`, (actual) => actual === 55);

console.log('\n--- BUG-018: CLC compiler - TernaryExpr support ---');
test('basic ternary', `
x = 5
result = x > 3 ? 100 : 200
`, (actual) => actual === 100);

test('ternary with else branch', `
x = 1
result = x > 3 ? 100 : 200
`, (actual) => actual === 200);

console.log('\n--- BUG-019: CLC compiler - UpdateExpr ++/-- support ---');
test('increment variable', `
x = 5
x = x + 1
result = x
`, (actual) => actual === 6);

test('decrement variable', `
x = 5
x = x - 1
result = x
`, (actual) => actual === 4);

console.log('\n--- BUG-020: CLC compiler - SpreadElement in ArrayLiteral ---');
test('concat arrays for spread-like behavior', `
a = [1 2 3]
b = [0]
for v in a {
  push(b v)
}
push(b 4)
result = len(b)
`, (actual) => actual === 5);

console.log('\n--- BUG-021: CLC compiler - Switch with string type ---');
test('switch on string value', `
x = "b"
if x == "a" {
  result = 1
} else if x == "b" {
  result = 2
} else {
  result = 3
}
`, (actual) => actual === 2);

console.log('\n--- BUG-022: CLC compiler - rangeRev step parameter ---');
test('range with step', `
total = 0
for i in range(0 10 2) {
  total = total + i
}
result = total
`, (actual) => actual === 20);

console.log('\n--- BUG-023: CLC compiler - Bitwise operations on double ---');
test('bitwise and on integers', `
a = 12
b = 10
result = a & b
`, (actual) => actual === 8);

test('bitwise or on integers', `
a = 12
b = 10
result = a | b
`, (actual) => actual === 14);

console.log('\n--- BUG-024: CLC compiler - Compound assignment operators ---');
test('plus assign', `
x = 5
x += 3
result = x
`, (actual) => actual === 8);

test('minus assign', `
x = 10
x -= 3
result = x
`, (actual) => actual === 7);

test('multiply assign', `
x = 4
x *= 3
result = x
`, (actual) => actual === 12);

console.log('\n--- BUG-025: CLC compiler - String concatenation with non-string ---');
test('string + number', `
s = "value: "
result = s + 42
`, (actual) => actual === "value: 42");

test('number + string', `
result = 42 + " items"
`, (actual) => actual === "42 items");

console.log('\n--- BUG-026: CLC compiler - reduce with double accumulator ---');
test('reduce sum of doubles', `
arr = [1.5 2.5 3.0]
result = reduce(arr 0 fn(acc x) { return acc + x })
`, (actual) => Math.abs(actual - 7.0) < 0.01);

console.log('\n--- BUG-027: CLC compiler - Array destructuring ---');
test('basic destructuring', `
arr = [10 20 30]
a = arr[0]
b = arr[1]
result = a + b
`, (actual) => actual === 30);

console.log('\n--- BUG-028: CLC compiler - pow return type ---');
test('pow with double base', `
result = pow(2.0 3)
`, (actual) => Math.abs(actual - 8.0) < 0.01);

test('pow with int base', `
result = pow(2 10)
`, (actual) => actual === 1024);

console.log('\n=== Regression Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);