const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('  CLC (compileToC) Output Tests');
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

const { resolveGcc, WIN_DEFAULT_GCC } = require(path.join(__dirname, '..', '..', 'tools', 'resolve-gcc.js'));
function resolveTestGcc() {
    const g = resolveGcc();
    if (g) return g.replace(/^"|"$/g, '');
    return WIN_DEFAULT_GCC;
}
const GCC = resolveTestGcc();
const TMPDIR = path.join(__dirname, '_clc_tmp');
if (!fs.existsSync(TMPDIR)) fs.mkdirSync(TMPDIR, { recursive: true });

let _cli = null;
function getCli() {
    if (!_cli) _cli = require(path.join(__dirname, '..', '..', 'dist', 'cli.js'));
    return _cli;
}

function compileAndRun(seedCode, testId) {
    const cFile = path.join(TMPDIR, `test_${testId}.c`);
    const exeFile = path.join(TMPDIR, `test_${testId}.exe`);
    try {
        const cli = getCli();
        const cCode = cli.compileToC(seedCode);
        fs.writeFileSync(cFile, cCode);
        const optLevel = process.env.CLC_OPT || '-O0';
        if (fs.existsSync(GCC)) {
            execSync(`"${GCC}" ${optLevel} -o "${exeFile}" "${cFile}" -lm`, { stdio: 'pipe', timeout: 30000 });
        } else {
            try { execSync(`gcc ${optLevel} -o "${exeFile}" "${cFile}" -lm`, { stdio: 'pipe', timeout: 30000 }); } catch (e) {
                try { execSync(`clang ${optLevel} -o "${exeFile}" "${cFile}" -lm`, { stdio: 'pipe', timeout: 30000 }); } catch (e2) {
                    throw new Error('No C compiler available');
                }
            }
        }
        const output = execSync(`"${exeFile}"`, { encoding: 'utf-8', timeout: 10000 }).trim();
        return output;
    } finally {
        try { fs.unlinkSync(cFile); } catch (e) {}
        try { fs.unlinkSync(exeFile); } catch (e) {}
    }
}

let testId = 0;

const CLC_REGRESSION_SEED_DIR = path.join(__dirname, 'clc_regression');
function compileAndRunSeedFile(filename) {
    const abs = path.join(CLC_REGRESSION_SEED_DIR, filename);
    if (!fs.existsSync(abs)) throw new Error(`missing CLC regression seed: ${abs}`);
    const source = fs.readFileSync(abs, 'utf8');
    return compileAndRun(source, ++testId);
}

test('math builtins: abs/min/max/round/pow/floor/ceil', () => {
    const output = compileAndRun(`
print(abs(-42))
print(min(3 7))
print(max(3 7))
print(round(3.6))
print(pow(2 10))
print(floor(3.9))
print(ceil(3.2))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '42') return `abs: expected 42 got ${lines[0]}`;
    if (lines[1] !== '3') return `min: expected 3 got ${lines[1]}`;
    if (lines[2] !== '7') return `max: expected 7 got ${lines[2]}`;
    if (lines[3] !== '4') return `round: expected 4 got ${lines[3]}`;
    if (lines[4] !== '1024') return `pow: expected 1024 got ${lines[4]}`;
    if (lines[5] !== '3') return `floor: expected 3 got ${lines[5]}`;
    if (lines[6] !== '4') return `ceil: expected 4 got ${lines[6]}`;
});

test('CLC: random(lo hi) on array slot uses sl_arr_set_int not sl_arr_set_dbl', () => {
    const cli = getCli();
    const c = cli.compileToC(
        `enemyX = []
enemyX[0] = 100
i = 0
dr = 0 - 1
enemyX[i] = enemyX[i] + random(dr 1)
print(enemyX[0])`,
        { clcSubsystem: 'windows' }
    );
    if (c.includes('sl_arr_set_dbl(sl_enemyX')) {
        return 'enemyX[i] += random(...) must not promote array to double (breaks Win32 games)';
    }
    if (!c.includes('sl_arr_set_int(sl_enemyX')) return 'expected sl_arr_set_int for enemyX';
});

test('CLC runtime: arr[i]= upgrades U8 storage when value > 255', () => {
    const output = compileAndRun(
        `
arr = []
arr[0] = 400
print(arr[0])
`,
        ++testId
    );
    const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines[0] !== '400') return `expected 400 (empty [] starts as U8; old sl_arr_set_int truncated), got ${lines[0]}`;
});

test('builtin random: two-arg inclusive range', () => {
    const output = compileAndRun(`
ok = 1
i = 0
while i < 200 {
    x = random(50 590)
    if x < 50 || x > 590 { ok = 0 }
    y = random(1 100)
    if y < 1 || y > 100 { ok = 0 }
    i = i + 1
}
print(ok)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '1') return `expected all samples in [lo,hi], got ok=${lines[0]}`;
});

test('array builtins: len/sum/indexOf/includes/sort/reverse', () => {
    const output = compileAndRun(`
arr = [5 3 8 1 9 2]
print(len(arr))
print(sum(arr))
print(indexOf(arr 8))
print(includes(arr 3))
print(includes(arr 4))
sorted = sort(arr)
print(sorted[0])
print(sorted[5])
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '6') return `len: expected 6 got ${lines[0]}`;
    if (lines[1] !== '28') return `sum: expected 28 got ${lines[1]}`;
    if (lines[2] !== '2') return `indexOf: expected 2 got ${lines[2]}`;
    if (lines[3] !== '1') return `includes(3): expected 1 got ${lines[3]}`;
    if (lines[4] !== '0') return `includes(4): expected 0 got ${lines[4]}`;
    if (lines[5] !== '1') return `sorted[0]: expected 1 got ${lines[5]}`;
    if (lines[6] !== '9') return `sorted[5]: expected 9 got ${lines[6]}`;
});

test('array builtins: range/pop/push', () => {
    const output = compileAndRun(`
r = range(5)
print(r[0])
print(r[4])
arr = [10 20 30]
p = pop(arr)
print(p)
push(arr 40)
print(arr[2])
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '0') return `range[0]: expected 0 got ${lines[0]}`;
    if (lines[1] !== '4') return `range[4]: expected 4 got ${lines[1]}`;
    if (lines[2] !== '30') return `pop: expected 30 got ${lines[2]}`;
    if (lines[3] !== '40') return `push: expected 40 got ${lines[3]}`;
});

test('string builtins: upper/lower/trim/replace/substring', () => {
    const output = compileAndRun(`
print(upper("hello"))
print(lower("WORLD"))
print(trim("  hi  "))
print(replace("cat dog cat" "cat" "fish"))
print(substring("abcdef" 2 5))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'HELLO') return `upper: expected HELLO got ${lines[0]}`;
    if (lines[1] !== 'world') return `lower: expected world got ${lines[1]}`;
    if (lines[2] !== 'hi') return `trim: expected hi got ${lines[2]}`;
    if (lines[3] !== 'fish dog fish') return `replace: expected 'fish dog fish' got '${lines[3]}'`;
    if (lines[4] !== 'cde') return `substring: expected cde got ${lines[4]}`;
});

test('string builtins: startsWith/endsWith/repeat/len', () => {
    const output = compileAndRun(`
print(startsWith("hello" "he"))
print(endsWith("hello" "lo"))
print(repeat("ab" 3))
print(len("hello"))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '1') return `startsWith: expected 1 got ${lines[0]}`;
    if (lines[1] !== '1') return `endsWith: expected 1 got ${lines[1]}`;
    if (lines[2] !== 'ababab') return `repeat: expected ababab got ${lines[2]}`;
    if (lines[3] !== '5') return `len: expected 5 got ${lines[3]}`;
});

test('type/conversion: toString/str/parseInt/parseFloat', () => {
    const output = compileAndRun(`
print(toString(42))
print(str(42))
print(parseInt("123"))
print(parseFloat("3.14") > 3.0)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '42') return `toString: expected 42 got ${lines[0]}`;
    if (lines[1] !== '42') return `str: expected 42 got ${lines[1]}`;
    if (lines[2] !== '123') return `parseInt: expected 123 got ${lines[2]}`;
});

test('for-in with array', () => {
    const output = compileAndRun(`
arr = [10 20 30 40 50]
total = 0
for x in arr {
    total = total + x
}
print(total)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '150') return `expected 150 got ${lines[0]}`;
});

test('for-in with range()', () => {
    const output = compileAndRun(`
s = 0
for i in range(5) {
    s = s + i
}
print(s)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '10') return `expected 10 got ${lines[0]}`;
});

test('for(;;) loop', () => {
    const output = compileAndRun(`
s = 0
for (i = 0; i < 10; i = i + 1) {
    s = s + i
}
print(s)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '45') return `expected 45 got ${lines[0]}`;
});

test('class with constructor and methods', () => {
    const output = compileAndRun(`
class Point {
    init(x y) {
        this.x = x
        this.y = y
    }
    sumSquare() {
        return this.x * this.x + this.y * this.y
    }
}
p = Point(3 4)
print(p.sumSquare())
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '25') return `expected 25 got ${lines[0]}`;
});

test('class inheritance', () => {
    const output = compileAndRun(`
class Animal {
    init(name) {
        this.name = name
    }
    speak() {
        return this.name + " speaks"
    }
}
class Dog extends Animal {
    init(name breed) {
        super(name)
        this.breed = breed
    }
}
d = Dog("Rex" "Lab")
print(d.name)
print(d.breed)
print(d.speak())
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'Rex') return `name: expected Rex got ${lines[0]}`;
    if (lines[1] !== 'Lab') return `breed: expected Lab got ${lines[1]}`;
    if (lines[2] !== 'Rex speaks') return `speak: expected 'Rex speaks' got '${lines[2]}'`;
});

test('class method override', () => {
    const output = compileAndRun(`
class Shape {
    init(name) {
        this.name = name
    }
    describe() {
        return this.name
    }
}
class Circle extends Shape {
    init(name radius) {
        this.name = name
        this.radius = radius
    }
    describe() {
        return this.name + " r=" + this.radius
    }
}
c = Circle("Sun" 5)
print(c.describe())
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'Sun r=5') return `expected 'Sun r=5' got '${lines[0]}'`;
});

test('object literal with SlMap', () => {
    const output = compileAndRun(`
obj = { name: "Alice" age: 30 score: 95 }
print(obj.name)
print(obj.age)
obj.score = 100
print(obj.score)
print(has(obj "name"))
print(has(obj "email"))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'Alice') return `name: expected Alice got ${lines[0]}`;
    if (lines[1] !== '30') return `age: expected 30 got ${lines[1]}`;
    if (lines[2] !== '100') return `score: expected 100 got ${lines[2]}`;
    if (lines[3] !== '1') return `has(name): expected 1 got ${lines[3]}`;
    if (lines[4] !== '0') return `has(email): expected 0 got ${lines[4]}`;
});

test('switch/case and try/catch', () => {
    const output = compileAndRun(`
x = 5
switch (x) {
    case 1: print("one")
    case 5: print("five")
    default: print("other")
}
try {
    print("before throw")
    throw 42
    print("after throw")
} catch (e) {
    print("caught: " + e)
}
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'five') return `switch: expected five got ${lines[0]}`;
    if (lines[1] !== 'before throw') return `try: expected 'before throw' got '${lines[1]}'`;
    if (lines[2] !== 'caught: 42') return `catch: expected 'caught: 42' got '${lines[2]}'`;
});

test('while loop', () => {
    const output = compileAndRun(`
i = 0
s = 0
while i < 5 {
    s = s + i
    i = i + 1
}
print(s)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '10') return `expected 10 got ${lines[0]}`;
});

test('map/filter/reduce', () => {
    const output = compileAndRun(`
fn double(n) { return n * 2 }
fn is_even(n) { return n % 2 == 0 }
fn add(a b) { return a + b }
arr = [1 2 3 4 5]
doubled = map(arr double)
print(doubled[0])
print(doubled[1])
evens = filter(arr is_even)
print(len(evens))
total = reduce(arr 0 add)
print(total)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '2') return `map[0]: expected 2 got ${lines[0]}`;
    if (lines[1] !== '4') return `map[1]: expected 4 got ${lines[1]}`;
    if (lines[2] !== '2') return `filter: expected 2 got ${lines[2]}`;
    if (lines[3] !== '15') return `reduce: expected 15 got ${lines[3]}`;
});

test('clamp and trig functions', () => {
    const output = compileAndRun(`
print(clamp(15 0 10))
print(clamp(-5 0 10))
print(clamp(5 0 10))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '10') return `clamp(15): expected 10 got ${lines[0]}`;
    if (lines[1] !== '0') return `clamp(-5): expected 0 got ${lines[1]}`;
    if (lines[2] !== '5') return `clamp(5): expected 5 got ${lines[2]}`;
});

test('break and continue', () => {
    const output = compileAndRun(`
s = 0
for (i = 0; i < 10; i = i + 1) {
    if i == 5 { break }
    s = s + i
}
print(s)
s2 = 0
for (j = 0; j < 10; j = j + 1) {
    if j % 2 == 0 { continue }
    s2 = s2 + j
}
print(s2)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '10') return `break: expected 10 got ${lines[0]}`;
    if (lines[1] !== '25') return `continue: expected 25 got ${lines[1]}`;
});

test('recursive fibonacci', () => {
    const output = compileAndRun(`
fn fib(n) {
    if n <= 1 { return n }
    return fib(n - 1) + fib(n - 2)
}
print(fib(10))
print(fib(20))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '55') return `fib(10): expected 55 got ${lines[0]}`;
    if (lines[1] !== '6765') return `fib(20): expected 6765 got ${lines[1]}`;
});

test('nested for loops', () => {
    const output = compileAndRun(`
sum = 0
for (i = 0; i < 5; i = i + 1) {
    for (j = 0; j < 5; j = j + 1) {
        sum = sum + i * j
    }
}
print(sum)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '100') return `expected 100 got ${lines[0]}`;
});

test('closure: map with anonymous function', () => {
    const output = compileAndRun(`
arr = [1 2 3 4 5]
doubled = map(arr fn(x) { return x * 2 })
print(doubled[0])
print(doubled[2])
print(doubled[4])
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '2') return `doubled[0]: expected 2 got ${lines[0]}`;
    if (lines[1] !== '6') return `doubled[2]: expected 6 got ${lines[1]}`;
    if (lines[2] !== '10') return `doubled[4]: expected 10 got ${lines[2]}`;
});

test('closure: filter with anonymous function', () => {
    const output = compileAndRun(`
arr = [1 2 3 4 5 6]
evens = filter(arr fn(x) { return x % 2 == 0 })
print(len(evens))
print(evens[0])
print(evens[1])
print(evens[2])
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '3') return `len: expected 3 got ${lines[0]}`;
    if (lines[1] !== '2') return `evens[0]: expected 2 got ${lines[1]}`;
    if (lines[2] !== '4') return `evens[1]: expected 4 got ${lines[2]}`;
    if (lines[3] !== '6') return `evens[2]: expected 6 got ${lines[3]}`;
});

test('closure: reduce with anonymous function', () => {
    const output = compileAndRun(`
arr = [1 2 3 4 5]
total = reduce(arr 0 fn(acc x) { return acc + x })
print(total)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '15') return `expected 15 got ${lines[0]}`;
});

test('closure: map/filter/reduce combined', () => {
    const output = compileAndRun(`
arr = [1 2 3 4 5 6 7 8 9 10]
result = reduce(filter(map(arr fn(x) { return x * x }) fn(x) { return x > 20 }) 0 fn(acc x) { return acc + x })
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '355') return `expected 355 got ${lines[0]}`;
});

test('closure: method call syntax with anonymous function', () => {
    const output = compileAndRun(`
arr = [10 20 30]
doubled = arr.map(fn(x) { return x * 2 })
print(doubled[0])
print(doubled[1])
print(doubled[2])
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '20') return `doubled[0]: expected 20 got ${lines[0]}`;
    if (lines[1] !== '40') return `doubled[1]: expected 40 got ${lines[1]}`;
    if (lines[2] !== '60') return `doubled[2]: expected 60 got ${lines[2]}`;
});

test('closure: anonymous function assigned to variable', () => {
    const output = compileAndRun(`
add = fn(a b) { return a + b }
print(add(3 4))
print(add(10 20))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '7') return `add(3,4): expected 7 got ${lines[0]}`;
    if (lines[1] !== '30') return `add(10,20): expected 30 got ${lines[1]}`;
});

test('closure: single-arg anonymous function assigned to variable', () => {
    const output = compileAndRun(`
double = fn(x) { return x * 2 }
print(double(5))
print(double(21))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '10') return `double(5): expected 10 got ${lines[0]}`;
    if (lines[1] !== '42') return `double(21): expected 42 got ${lines[1]}`;
});

test('closure: closure with captured variable', () => {
    const output = compileAndRun(`
n = 10
multiply = fn(x) { return x * n }
print(multiply(5))
n = 20
print(multiply(5))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '50') return `multiply(5) with n=10: expected 50 got ${lines[0]}`;
    if (lines[1] !== '100') return `multiply(5) with n=20: expected 100 got ${lines[1]}`;
});

test('closure: closure passed as argument to user function', () => {
    const output = compileAndRun(`
fn apply(f x) { return f(x) }
result = apply(fn(x) { return x * x } 7)
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '49') return `expected 49 got ${lines[0]}`;
});

test('match: literal and wildcard patterns', () => {
    const output = compileAndRun(`
x = 42
result = match x {
    0 => 1
    1 => 2
    _ => 99
}
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '99') return `expected 99 got ${lines[0]}`;
});

test('match: range pattern', () => {
    const output = compileAndRun(`
x = 5
result = match x {
    1..3 => 10
    4..6 => 20
    _ => 30
}
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '20') return `expected 20 got ${lines[0]}`;
});

test('match: or pattern', () => {
    const output = compileAndRun(`
x = 2
result = match x {
    1 | 2 | 3 => 100
    _ => 0
}
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '100') return `expected 100 got ${lines[0]}`;
});

test('match: identifier pattern with binding', () => {
    const output = compileAndRun(`
x = 42
result = match x {
    0 => 1
    n => n * 2
}
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '84') return `expected 84 got ${lines[0]}`;
});

test('match: string match', () => {
    const output = compileAndRun(`
s = "hello"
result = match s {
    "world" => 1
    _ => 2
}
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '2') return `expected 2 got ${lines[0]}`;
});

test('macro: declarative macro with return', () => {
    const output = compileAndRun(`
macro square(x) {
    return x * x
}
result = square!(7)
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '49') return `expected 49 got ${lines[0]}`;
});

test('macro: declarative macro with multiple params', () => {
    const output = compileAndRun(`
macro max(a b) {
    if a > b { return a }
    return b
}
result = max!(15 42)
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '42') return `expected 42 got ${lines[0]}`;
});

test('macro: macro with loop', () => {
    const output = compileAndRun(`
macro factorial(n) {
    result = 1
    i = 1
    while i <= n {
        result = result * i
        i = i + 1
    }
    return result
}
print(factorial!(5))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '120') return `expected 120 got ${lines[0]}`;
});

test('match: array destructuring pattern', () => {
    const output = compileAndRun(`
arr = [10 20 30]
result = match arr {
    [a b c] => a + b + c
    _ => 0
}
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '60') return `expected 60 got ${lines[0]}`;
});

test('match: array pattern with literal match', () => {
    const output = compileAndRun(`
arr = [1 2 3]
result = match arr {
    [1 2 3] => 111
    [1 _ 3] => 13
    _ => 0
}
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '111') return `expected 111 got ${lines[0]}`;
});

test('match: object destructuring pattern', () => {
    const output = compileAndRun(`
obj = { x: 10 y: 20 }
result = match obj {
    {x: a y: b} => a + b
    _ => 0
}
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '30') return `expected 30 got ${lines[0]}`;
});

test('match: guard condition', () => {
    const output = compileAndRun(`
x = 15
result = match x {
    n if n > 10 => 100
    n if n > 5 => 50
    _ => 0
}
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '100') return `expected 100 got ${lines[0]}`;
});

test('io/fs: writeFile and readFile', () => {
    const tmpFile = path.join(TMPDIR, `io_test_${++testId}.txt`);
    const output = compileAndRun(`
writeFile("${tmpFile.replace(/\\/g, '\\\\')}" "hello world")
content = readFile("${tmpFile.replace(/\\/g, '\\\\')}")
print(content)
`, testId);
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'hello world') return `expected 'hello world' got '${lines[0]}'`;
});

test('io/fs: fileExists', () => {
    const tmpFile = path.join(TMPDIR, `exists_test_${++testId}.txt`);
    fs.writeFileSync(tmpFile, 'test');
    const output = compileAndRun(`
print(fileExists("${tmpFile.replace(/\\/g, '\\\\')}"))
print(fileExists("${tmpFile.replace(/\\/g, '\\\\')}_nonexistent"))
`, testId);
    try { fs.unlinkSync(tmpFile); } catch (e) {}
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '1') return `exists: expected 1 got ${lines[0]}`;
    if (lines[1] !== '0') return `nonexistent: expected 0 got ${lines[1]}`;
});

test('io/fs: mkdir and remove', () => {
    const tmpDir = path.join(TMPDIR, `mkdir_test_${++testId}`);
    const tmpFile = path.join(tmpDir, 'test.txt');
    const output = compileAndRun(`
print(mkdir("${tmpDir.replace(/\\/g, '\\\\')}"))
print(fileExists("${tmpDir.replace(/\\/g, '\\\\')}"))
writeFile("${tmpFile.replace(/\\/g, '\\\\')}" "data")
print(fileExists("${tmpFile.replace(/\\/g, '\\\\')}"))
print(remove("${tmpFile.replace(/\\/g, '\\\\')}"))
print(fileExists("${tmpFile.replace(/\\/g, '\\\\')}"))
`, testId);
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '1') return `mkdir: expected 1 got ${lines[0]}`;
    if (lines[1] !== '1') return `exists after mkdir: expected 1 got ${lines[1]}`;
    if (lines[2] !== '1') return `file exists: expected 1 got ${lines[2]}`;
    if (lines[3] !== '1') return `remove: expected 1 got ${lines[3]}`;
    if (lines[4] !== '0') return `file gone: expected 0 got ${lines[4]}`;
});

test('destructuring: array assignment', () => {
    const output = compileAndRun(`
[a b c] = [10 20 30]
print(a)
print(b)
print(c)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '10') return `a: expected 10 got ${lines[0]}`;
    if (lines[1] !== '20') return `b: expected 20 got ${lines[1]}`;
    if (lines[2] !== '30') return `c: expected 30 got ${lines[2]}`;
});

test('destructuring: function return value', () => {
    const output = compileAndRun(`
fn coords() {
  return [3 4]
}
[x y] = coords()
print(x)
print(y)
print(x + y)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '3') return `x: expected 3 got ${lines[0]}`;
    if (lines[1] !== '4') return `y: expected 4 got ${lines[1]}`;
    if (lines[2] !== '7') return `x+y: expected 7 got ${lines[2]}`;
});

test('destructuring: inside function', () => {
    const output = compileAndRun(`
fn test() {
  [a b] = [100 200]
  return a + b
}
print(test())
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '300') return `expected 300 got ${lines[0]}`;
});

test('destructuring: swap variables', () => {
    const output = compileAndRun(`
x = 1
y = 2
[x y] = [y x]
print(x)
print(y)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '2') return `x: expected 2 got ${lines[0]}`;
    if (lines[1] !== '1') return `y: expected 1 got ${lines[1]}`;
});

test('bitwise: unsigned right shift >>>', () => {
    const output = compileAndRun(`
x = 8 >>> 2
y = -1 >>> 1
print(x)
print(y > 0)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '2') return `x: expected 2 got ${lines[0]}`;
    if (lines[1] !== 'true') return `y>0: expected true got ${lines[1]}`;
});

test('super: method call expression', () => {
    const output = compileAndRun(`
class Base {
  init(x) {
    this.x = x
  }
  double() {
    return this.x * 2
  }
}
class Child extends Base {
  init(x y) {
    super(x)
    this.y = y
  }
  triple() {
    return super.double() + this.y
  }
}
c = Child(5 3)
print(c.x)
print(c.double())
print(c.triple())
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '5') return `c.x: expected 5 got ${lines[0]}`;
    if (lines[1] !== '10') return `c.double(): expected 10 got ${lines[1]}`;
    if (lines[2] !== '13') return `c.triple(): expected 13 got ${lines[2]}`;
});

test('string: trimStart and trimEnd', () => {
    const output = compileAndRun(`
s = "  hello  "
a = trimStart(s)
b = trimEnd(s)
print(len(a))
print(len(b))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '7') return `trimStart len: expected 7 got ${lines[0]}`;
    if (lines[1] !== '7') return `trimEnd len: expected 7 got ${lines[1]}`;
});

test('string: method syntax trimStart/trimEnd', () => {
    const output = compileAndRun(`
s = "  hello  "
print(len(s.trimStart()))
print(len(s.trimEnd()))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '7') return `trimStart len: expected 7 got ${lines[0]}`;
    if (lines[1] !== '7') return `trimEnd len: expected 7 got ${lines[1]}`;
});

test('class: string property safe access', () => {
    const output = compileAndRun(`
class Item {
  init(name) {
    this.name = name
  }
  greet() {
    return this.name + "!"
  }
}
i = Item("apple")
print(i.greet())
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'apple!') return `expected 'apple!' got '${lines[0]}'`;
});

test('io/fs: listDir', () => {
    const tmpDir = path.join(TMPDIR, `listdir_test_${++testId}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'b');
    const output = compileAndRun(`
files = listDir("${tmpDir.replace(/\\/g, '\\\\')}")
print(len(files))
`, ++testId);
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '2') return `expected 2 files got ${lines[0]}`;
});

test('date: dateFormat', () => {
    const output = compileAndRun(`
ts = time()
result = dateFormat(ts "%Y")
print(len(result))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '4') return `year length: expected 4 got ${lines[0]}`;
});

test('json: parse and get', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"name\\": \\"hello\\", \\"count\\": 42}")
s = data.getStr("name")
n = data.get("count")
print(s)
print(n)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'hello') return `name: expected hello got ${lines[0]}`;
    if (lines[1] !== '42') return `count: expected 42 got ${lines[1]}`;
});

test('json: nested object with getMap', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"user\\": {\\"name\\": \\"Alice\\", \\"age\\": 30}, \\"active\\": true}")
user = data.getMap("user")
name = user.getStr("name")
age = user.get("age")
active = data.get("active")
print(name)
print(age)
print(active)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'Alice') return `name: expected Alice got ${lines[0]}`;
    if (lines[1] !== '30') return `age: expected 30 got ${lines[1]}`;
    if (lines[2] !== '1') return `active: expected 1 got ${lines[2]}`;
});

test('json: array with getArr', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"items\\": [10, 20, 30], \\"count\\": 3}")
items = data.getArr("items")
first = items[0]
print(first)
print(items.len())
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '10') return `first: expected 10 got ${lines[0]}`;
    if (lines[1] !== '3') return `len: expected 3 got ${lines[1]}`;
});

test('json: stringify', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"name\\": \\"hello\\", \\"count\\": 42}")
result = jsonStringify(data)
print(len(result))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines[0] || parseInt(lines[0]) < 10) return `stringify length too short: ${lines[0]}`;
});

test('map: has and set methods', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"name\\": \\"test\\"}")
h1 = data.has("name")
h2 = data.has("missing")
data.set("added" 99)
v = data.get("added")
print(h1)
print(h2)
print(v)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '1') return `has name: expected 1 got ${lines[0]}`;
    if (lines[1] !== '0') return `has missing: expected 0 got ${lines[1]}`;
    if (lines[2] !== '99') return `added: expected 99 got ${lines[2]}`;
});

test('string: toLower/toUpper/replaceAll', () => {
    const output = compileAndRun(`
s = "Hello World"
print(s.toLower())
print(s.toUpper())
print(s.replaceAll("o" "0"))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'hello world') return `toLower: expected hello world got ${lines[0]}`;
    if (lines[1] !== 'HELLO WORLD') return `toUpper: expected HELLO WORLD got ${lines[1]}`;
    if (lines[2] !== 'Hell0 W0rld') return `replaceAll: expected Hell0 W0rld got ${lines[2]}`;
});

test('string: strEq/strNe comparison', () => {
    const output = compileAndRun(`
print(strEq("abc" "abc"))
print(strEq("abc" "def"))
print(strNe("abc" "abc"))
print(strNe("abc" "def"))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '1') return `strEq same: expected 1 got ${lines[0]}`;
    if (lines[1] !== '0') return `strEq diff: expected 0 got ${lines[1]}`;
    if (lines[2] !== '0') return `strNe same: expected 0 got ${lines[2]}`;
    if (lines[3] !== '1') return `strNe diff: expected 1 got ${lines[3]}`;
});

test('string: format with placeholders', () => {
    const output = compileAndRun(`
name = "World"
arr = [name 42]
result = format("Hello {}! Count: {}" arr)
print(result)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'Hello World! Count: 42') return `format: expected 'Hello World! Count: 42' got '${lines[0]}'`;
});

test('env: getEnv', () => {
    const output = compileAndRun(`
path = getEnv("PATH")
print(len(path))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines[0] || parseInt(lines[0]) < 10) return `PATH length too short: ${lines[0]}`;
});

test('array: mixed string/int elements', () => {
    const output = compileAndRun(`
arr = ["hello" 42]
print(len(arr))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '2') return `len: expected 2 got ${lines[0]}`;
});

test('string: == and != operators', () => {
    const output = compileAndRun(`
a = "hello"
b = "hello"
c = "world"
print(a == b)
print(a == c)
print(a != c)
print(a != b)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'true') return `eq same: expected true got ${lines[0]}`;
    if (lines[1] !== 'false') return `eq diff: expected false got ${lines[1]}`;
    if (lines[2] !== 'true') return `ne diff: expected true got ${lines[2]}`;
    if (lines[3] !== 'false') return `ne same: expected false got ${lines[3]}`;
});

test('string: < > <= >= operators', () => {
    const output = compileAndRun(`
a = "apple"
b = "banana"
print(a < b)
print(b > a)
print(a <= b)
print(b >= a)
print(a <= "apple")
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'true') return `lt: expected true got ${lines[0]}`;
    if (lines[1] !== 'true') return `gt: expected true got ${lines[1]}`;
    if (lines[2] !== 'true') return `le: expected true got ${lines[2]}`;
    if (lines[3] !== 'true') return `ge: expected true got ${lines[3]}`;
    if (lines[4] !== 'true') return `le equal: expected true got ${lines[4]}`;
});

test('for-in: iterate over SlMap keys', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"name\\": \\"Alice\\", \\"age\\": 30, \\"city\\": \\"NYC\\"}")
count = 0
for key in data {
  count = count + 1
}
print(count)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '3') return `count: expected 3 got ${lines[0]}`;
});

test('for-in: iterate SlMap with value access', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"name\\": \\"Bob\\", \\"score\\": 95}")
for key in data {
  if key == "name" {
    v = data.getStr(key)
    print(v)
  }
}
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'Bob') return `name: expected Bob got ${lines[0]}`;
});

test('type() with container values from jsonParse', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"price\\": 9.99, \\"name\\": \\"test\\", \\"active\\": true, \\"items\\": [1,2,3]}")
print(type(data.get("price")))
print(type(data.get("name")))
print(type(data.get("active")))
print(type(data.get("items")))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'number') return `price type: expected number got ${lines[0]}`;
    if (lines[1] !== 'string') return `name type: expected string got ${lines[1]}`;
    if (lines[2] !== 'boolean') return `active type: expected boolean got ${lines[2]}`;
    if (lines[3] !== 'array') return `items type: expected array got ${lines[3]}`;
});

test('getDbl() extracts double from map', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"price\\": 9.99, \\"tax\\": 0.5}")
p = data.getDbl("price")
t = data.getDbl("tax")
print(p + t)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    const val = parseFloat(lines[0]);
    if (Math.abs(val - 10.49) > 0.01) return `sum: expected ~10.49 got ${lines[0]}`;
});

test('isNumber/isString/isArray with container values', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"price\\": 9.99, \\"name\\": \\"test\\", \\"items\\": [1,2,3]}")
print(isNumber(data.get("price")))
print(isString(data.get("name")))
print(isArray(data.get("items")))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '1') return `isNumber: expected 1 got ${lines[0]}`;
    if (lines[1] !== '1') return `isString: expected 1 got ${lines[1]}`;
    if (lines[2] !== '1') return `isArray: expected 1 got ${lines[2]}`;
});

test('map set with type-aware boxing', () => {
    const output = compileAndRun(`
data = jsonParse("{\\"count\\": 10}")
data.set("name" "hello")
print(data.getStr("name"))
data.set("count" 42)
print(data.get("count"))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'hello') return `name: expected hello got ${lines[0]}`;
    if (lines[1] !== '42') return `count: expected 42 got ${lines[1]}`;
});

test('type() with array index access', () => {
    const output = compileAndRun(`
arr = [10 20 30]
print(type(arr[0]))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== 'number') return `type: expected number got ${lines[0]}`;
});

test('range(lo hi 1): literal step 1 uses 2-arg ACAE path (sum 1..10)', () => {
    const output = compileAndRun(`
s = 0
for i in range(1 11 1) {
  s = s + i
}
print(s)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '55') return `expected 55 got ${lines[0]}`;
});

test('ACAE diagnostics: C output contains ACAE block when acaeDiagnostics', () => {
    const cli = getCli();
    const c = cli.compileToC(`s = 0
arr = range(10)
for i in range(10) {
  s = s + arr[i]
  print(s)
}`, { acaeDiagnostics: true, parallel: true });
    if (!c.includes('ACAE diagnostics')) return 'missing ACAE diagnostics header';
    if (!c.includes('printf') && !c.includes('I/O')) return 'expected diagnostic to mention I/O or printf';
});

test('ACAE for-in array + --parallel: OpenMP parallel+simd reduction on peeled iter', () => {
    const cli = getCli();
    const c = cli.compileToC(`s = 0
arr = [1 2 3 4 5]
for v in arr {
  s = s + v
}
print(s)
`, { parallel: true });
    if (!c.includes('#pragma omp parallel reduction')) return 'expected #pragma omp parallel reduction';
    if (!c.includes('#pragma omp for simd')) return 'expected #pragma omp for simd';
    if (!c.includes('for (int _i = 0; _i < sl_arr->len; _i++)')) return 'expected peeled for (int _i) over sl_arr';
});

test('ACAE fuse: consecutive identical for-in range + diagnostics', () => {
    const cli = getCli();
    const c = cli.compileToC(`s1 = 0
s2 = 0
for i in range(10) {
  s1 = s1 + i
}
for i in range(10) {
  s2 = s2 + i
}
print(s1)
print(s2)
`, { acaeDiagnostics: true, acaeFuseRangeLoops: true });
    if (!c.includes('Fused consecutive')) return 'expected fusion diagnostic';
});

test('rangeRev: for-in sums, len, empty interval, variable hi', () => {
    const output = compileAndRun(`
s = 0
for i in rangeRev(11 1) {
  s = s + i
}
print(s)
t = 0
for i in rangeRev(4) {
  t = t + i
}
print(t)
print(len(rangeRev(5)))
print(len(rangeRev(0)))
u = 0
for i in rangeRev(3 3) {
  u = u + 1
}
print(u)
n = 6
v = 0
for i in rangeRev(n 2) {
  v = v + i
}
print(v)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '55') return `rangeRev(11 1) sum: expected 55 got ${lines[0]}`;
    if (lines[1] !== '6') return `rangeRev(4) sum: expected 6 got ${lines[1]}`;
    if (lines[2] !== '5') return `len(rangeRev(5)): expected 5 got ${lines[2]}`;
    if (lines[3] !== '0') return `len(rangeRev(0)): expected 0 got ${lines[3]}`;
    if (lines[4] !== '0') return `rangeRev(3 3) iterations: expected 0 got ${lines[4]}`;
    if (lines[5] !== '14') return `rangeRev(n 2) with n=6: 5+4+3+2=14, got ${lines[5]}`;
});

test('getClcUnsupportedBoundary lists known AST kinds', () => {
    const cli = getCli();
    const b = cli.getClcUnsupportedBoundary();
    if (!b || !Array.isArray(b.statements) || !b.statements.includes('Import')) {
        return `unexpected boundary: ${JSON.stringify(b)}`;
    }
    if (!Array.isArray(b.expressions) || !b.expressions.includes('Await')) {
        return `unexpected expr boundary: ${JSON.stringify(b.expressions)}`;
    }
});

test('clcStrict throws ClcCompileError on unsupported import', () => {
    const cli = getCli();
    try {
        cli.compileToC('import math', { clcStrict: true });
        return 'expected ClcCompileError';
    } catch (e) {
        if (e.name !== 'ClcCompileError') return `wrong error: ${e.name} ${e.message}`;
        if (!e.warnings || !e.warnings.some((w) => String(w).includes('Import'))) {
            return `warnings: ${JSON.stringify(e.warnings)}`;
        }
    }
});

test('Win32 GUI CLC: compileToC uses sl_user_main when clcSubsystem windows', () => {
    const cli = getCli();
    const c = cli.compileToC('print(1)', { clcSubsystem: 'windows' });
    if (!c.includes('sl_user_main')) return 'expected sl_user_main in C output';
    if (c.includes('int main(')) return 'should not emit int main for Win32 GUI mode';
    if (!c.includes('wWinMain') && !c.includes('sl_win32_rt')) {
        return 'expected Win32 hint (wWinMain or sl_win32_rt) in header comment';
    }
    if (!c.includes('sl_win32_pixel_buffer')) return 'expected sl_win32_pixel_buffer forward decl';
});

test('Win32 GUI: win32.present lowers to sl_win32_present', () => {
    const cli = getCli();
    const c = cli.compileToC('win32.present()', { clcSubsystem: 'windows' });
    if (!c.includes('sl_win32_present()')) return 'expected sl_win32_present() in C output';
});

test('Win32 GUI: win32.setPixel uses sl_win32_pixel_buffer', () => {
    const cli = getCli();
    const c = cli.compileToC('win32.setPixel(0 0 255)', { clcSubsystem: 'windows' });
    if (!c.includes('sl_win32_pixel_buffer')) return 'expected pixel buffer write path';
});

test('Win32 GUI: win32.pollEvents lowers to sl_win32_poll_events', () => {
    const cli = getCli();
    const c = cli.compileToC('while win32.pollEvents() { win32.present() }', { clcSubsystem: 'windows' });
    if (!c.includes('sl_win32_poll_events()')) return 'expected sl_win32_poll_events in C output';
});

test('Win32 GUI CLC: nested while under pollEvents skips outer loopVarShadow (_wl accum)', () => {
    const cli = getCli();
    const seed = `accumMs = 0
FRAME_MS = 16
ticks = 0
while win32.pollEvents() {
    accumMs = accumMs + 1
    steps = 0
    while accumMs >= FRAME_MS && steps < 2 {
        accumMs = accumMs - FRAME_MS
        steps = steps + 1
        ticks = ticks + 1
    }
    win32.present()
}`;
    const c = cli.compileToC(seed, { clcSubsystem: 'windows' });
    const um = c.indexOf('int sl_user_main');
    const pollCall = c.indexOf('while ((long long)sl_win32_poll_events');
    if (um < 0 || pollCall < 0) return 'expected sl_user_main and poll driver while';
    const beforePoll = c.slice(um, pollCall);
    if (/int\s+_wl_accumMs\s*=\s*\(int\)sl_accumMs/.test(beforePoll)) {
        return 'outer poll loop must not hoist accumMs/steps as _wl_* (breaks nested fixed-step loop)';
    }
    const afterPoll = c.slice(pollCall, pollCall + 900);
    if (!/\{\s*int\s+_wl_accumMs\s*=\s*\(int\)sl_accumMs/.test(afterPoll)) {
        return 'inner fixed-step while should still use loopVarShadow for accumMs';
    }
});

test('Win32 GUI: win32.perfMillis lowers to sl_win32_perf_millis', () => {
    const cli = getCli();
    const c = cli.compileToC('t = win32.perfMillis()', { clcSubsystem: 'windows' });
    if (!c.includes('sl_win32_perf_millis()')) return 'expected sl_win32_perf_millis in C output';
});

test('Win32 GUI: win32.setWindowTitle / setWindowTitleFmt lower to sl_win32_set_window_title_*', () => {
    const cli = getCli();
    const c1 = cli.compileToC('win32.setWindowTitle("cap")', { clcSubsystem: 'windows' });
    if (!c1.includes('sl_win32_set_window_title_utf8')) {
        return 'expected sl_win32_set_window_title_utf8 in C output';
    }
    const c2 = cli.compileToC(
        'win32.setWindowTitleFmt("a%lldb%lldc%lldd%llde%lldf" 1 2 3 4 5)',
        { clcSubsystem: 'windows' }
    );
    if (!c2.includes('sl_win32_set_window_title_fmt')) {
        return 'expected sl_win32_set_window_title_fmt in C output';
    }
});

test('Win32 GUI: win32.drawText / drawInt lower to sl_win32_draw_*', () => {
    const cli = getCli();
    const c = cli.compileToC(
        `win32.drawText(10 20 0xFFFFFFFF "Hi")
win32.drawInt(30 40 0xFFFFFFFF 42)`,
        { clcSubsystem: 'windows' }
    );
    if (!c.includes('sl_win32_draw_text')) return 'expected sl_win32_draw_text in C output';
    if (!c.includes('sl_win32_draw_int')) return 'expected sl_win32_draw_int in C output';
});

test('Win32 GUI CLC: MinGW links sl_win32_rt.c (Windows + gcc only)', () => {
    if (process.platform !== 'win32') return true;
    if (!fs.existsSync(GCC)) return true;
    const RT = path.join(__dirname, '..', '..', 'tools', 'clc', 'sl_win32_rt.c');
    if (!fs.existsSync(RT)) return `missing runtime ${RT}`;
    const cli = getCli();
    const id = ++testId;
    const cFile = path.join(TMPDIR, `win32_${id}.c`);
    const exeFile = path.join(TMPDIR, `win32_${id}.exe`);
    /* Must call win32.present(): SEED_WIN32_AUTOCLOSE arms SetTimer on first present; print-only
       sl_user_main never presents and would block forever in GetMessage below wWinMain. */
    const cCode = cli.compileToC('win32.present()', { clcSubsystem: 'windows' });
    fs.writeFileSync(cFile, cCode);
    try {
        const optLevel = process.env.CLC_OPT || '-O0';
        const sfx = '-mwindows -municode -luser32 -lgdi32 -lcomdlg32 -lwinmm';
        const inc = path.join(__dirname, '..', '..', 'tools', 'clc');
        const linkMs = parseInt(process.env.SEED_CLC_WIN32_LINK_TEST_MS || '', 10) || 180000;
        execSync(`"${GCC}" ${optLevel} -I"${inc}" -o "${exeFile}" "${cFile}" "${RT}" ${sfx}`, { stdio: 'pipe', timeout: linkMs });
        execSync(`"${exeFile}"`, {
            encoding: 'utf-8',
            timeout: 30000,
            env: { ...process.env, SEED_WIN32_AUTOCLOSE: '1' }
        });
    } finally {
        try {
            fs.unlinkSync(cFile);
        } catch (e) {}
        try {
            fs.unlinkSync(exeFile);
        } catch (e) {}
    }
});

test('[regression] F64 array: sl_arr_get_dbl preserves double values', () => {
    const output = compileAndRun(`
arr = [0.0 0.0 0.0]
arr[0] = 3.14
arr[1] = 2.718
arr[2] = 1.414
v0 = arr[0]
v1 = arr[1]
v2 = arr[2]
print(floor(v0 * 100))
print(floor(v1 * 100))
print(floor(v2 * 100))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '314') return `arr[0]: expected 314 got ${lines[0]}`;
    if (lines[1] !== '271') return `arr[1]: expected 271 got ${lines[1]}`;
    if (lines[2] !== '141') return `arr[2]: expected 141 got ${lines[2]}`;
});

test('[regression] F64 array: sl_arr_set_dbl writes double without truncation', () => {
    const output = compileAndRun(`
arr = [0.0 0.0 0.0]
arr[0] = 0.5
arr[1] = 1.5
arr[2] = 2.5
s = arr[0] + arr[1] + arr[2]
print(floor(s * 10))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '45') return `sum: expected 45 got ${lines[0]}`;
});

test('[regression] abs(double) uses fabs, not llabs', () => {
    const output = compileAndRun(`
x = abs(-3.7)
print(floor(x * 10))
y = abs(-42)
print(y)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '37') return `abs(-3.7): expected 37 got ${lines[0]}`;
    if (lines[1] !== '42') return `abs(-42): expected 42 got ${lines[1]}`;
});

test('[regression] % with double uses fmod', () => {
    const output = compileAndRun(`
x = 7.5 % 2.0
print(floor(x * 10))
y = 7 % 3
print(y)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '15') return `7.5%2.0: expected 15 got ${lines[0]}`;
    if (lines[1] !== '1') return `7%3: expected 1 got ${lines[1]}`;
});

test('[regression] min/max with double uses fmin/fmax', () => {
    const output = compileAndRun(`
a = min(3.5 2.0)
print(floor(a * 10))
b = max(3.5 2.0)
print(floor(b * 10))
c = min(3 7)
print(c)
d = max(3 7)
print(d)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '20') return `min(3.5 2.0): expected 20 got ${lines[0]}`;
    if (lines[1] !== '35') return `max(3.5 2.0): expected 35 got ${lines[1]}`;
    if (lines[2] !== '3') return `min(3 7): expected 3 got ${lines[2]}`;
    if (lines[3] !== '7') return `max(3 7): expected 7 got ${lines[3]}`;
});

test('[regression] BinaryOp propagates double type', () => {
    const output = compileAndRun(`
a = 1 + 2.5
b = 3.5 - 1
c = 2 * 1.5
d = 7.0 / 2
print(floor(a * 10))
print(floor(b * 10))
print(floor(c * 10))
print(floor(d * 10))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '35') return `1+2.5: expected 35 got ${lines[0]}`;
    if (lines[1] !== '25') return `3.5-1: expected 25 got ${lines[1]}`;
    if (lines[2] !== '30') return `2*1.5: expected 30 got ${lines[2]}`;
    if (lines[3] !== '35') return `7.0/2: expected 35 got ${lines[3]}`;
});

test('[regression] Unary minus and Conditional propagate double', () => {
    const output = compileAndRun(`
a = -2.5
b = -(3 - 1.5)
c = 1 > 0 ? 3.14 : 0
d = 0 > 1 ? 0 : 2.71
print(floor(a * 100) + 500)
print(floor(b * 100) + 500)
print(floor(c * 100))
print(floor(d * 100))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '250') return `-2.5: expected 250 got ${lines[0]}`;
    if (lines[1] !== '350') return `-(3-1.5): expected 350 got ${lines[1]}`;
    if (lines[2] !== '314') return `ternary 3.14: expected 314 got ${lines[2]}`;
    if (lines[3] !== '271') return `ternary 2.71: expected 271 got ${lines[3]}`;
});

test('[regression] Nested array access arr[i][j] returns SlArray* element', () => {
    const output = compileAndRun(`
row0 = [1 2 3]
row1 = [4 5 6]
grid = [row0 row1]
print(grid[0][0])
print(grid[0][2])
print(grid[1][1])
print(grid[1][2])
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '1') return `grid[0][0]: expected 1 got ${lines[0]}`;
    if (lines[1] !== '3') return `grid[0][2]: expected 3 got ${lines[1]}`;
    if (lines[2] !== '5') return `grid[1][1]: expected 5 got ${lines[2]}`;
    if (lines[3] !== '6') return `grid[1][2]: expected 6 got ${lines[3]}`;
});

test('[regression] Nested array write arr[i][j] = val uses SlArray* element', () => {
    const output = compileAndRun(`
row0 = [0 0 0]
row1 = [0 0 0]
grid = [row0 row1]
grid[0][1] = 42
grid[1][2] = 99
print(grid[0][1])
print(grid[1][2])
print(grid[0][0])
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '42') return `grid[0][1]: expected 42 got ${lines[0]}`;
    if (lines[1] !== '99') return `grid[1][2]: expected 99 got ${lines[1]}`;
    if (lines[2] !== '0') return `grid[0][0]: expected 0 got ${lines[2]}`;
});

test('[regression] Map property returns SlArray* correctly', () => {
    const output = compileAndRun(`
data = { items: [10 20 30] }
items = data.items
print(items[0])
print(items[2])
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '10') return `items[0]: expected 10 got ${lines[0]}`;
    if (lines[1] !== '30') return `items[2]: expected 30 got ${lines[1]}`;
});

test('[regression CLC seed] sl_map_store_value: map return retains local SlArray* (see clc_regression/)', () => {
    const output = compileAndRunSeedFile('regression_clc_map_local_arrays.seed');
    const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines[0] !== '8') return `xs[1]: expected 8 got ${lines[0]}`;
    if (lines[1] !== '1') return `ys[0]: expected 1 got ${lines[1]}`;
    if (lines[2] !== '42') return `tag: expected 42 got ${lines[2]}`;
});

test('[regression CLC seed] sl_map_store_value: nested SlMap* in literal (see clc_regression/)', () => {
    const output = compileAndRunSeedFile('regression_clc_map_nested_slmap.seed');
    const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines[0] !== '100') return `wrap.k: expected 100 got ${lines[0]}`;
});

test('[regression CLC seed] sl_map_set replace key releases old SlArray* (see clc_regression/)', () => {
    const output = compileAndRunSeedFile('regression_clc_map_set_replace_array.seed');
    const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines[0] !== '10') return `nums[0]: expected 10 got ${lines[0]}`;
    if (lines[1] !== '20') return `nums[1]: expected 20 got ${lines[1]}`;
});

test('[regression] Map property returns double correctly', () => {
    const output = compileAndRun(`
fn makeData() {
    return { price: 9.99 count: 5 }
}
d = makeData()
total = d.price * d.count
print(floor(total * 10))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '499') return `total: expected 499 got ${lines[0]}`;
});

test('[regression] push() infers double element type', () => {
    const output = compileAndRun(`
arr = []
push(arr 1.5)
push(arr 2.5)
push(arr 3.5)
s = arr[0] + arr[1] + arr[2]
print(floor(s * 10))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '75') return `sum: expected 75 got ${lines[0]}`;
});

test('[regression] sl_arr_avg F64 fast path returns double', () => {
    const output = compileAndRun(`
arr = [2.0 4.0 6.0]
a = avg(arr)
print(floor(a * 10))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '40') return `avg: expected 40 got ${lines[0]}`;
});

test('[regression] Function return type inferred as SlMap* for map returns', () => {
    const output = compileAndRun(`
fn getCoord() {
    return { x: 3 y: 7 }
}
c = getCoord()
print(c.x)
print(c.y)
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '3') return `c.x: expected 3 got ${lines[0]}`;
    if (lines[1] !== '7') return `c.y: expected 7 got ${lines[1]}`;
});

test('[regression] NumberLiteral with decimal point inferred as double', () => {
    const output = compileAndRun(`
x = 3.0
y = x + 1
print(floor(y * 10))
z = 5.0 * 2
print(floor(z * 10))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '40') return `3.0+1: expected 40 got ${lines[0]}`;
    if (lines[1] !== '100') return `5.0*2: expected 100 got ${lines[1]}`;
});

test('[regression] Physics-style double array computation (physics_demo_clc pattern)', () => {
    const output = compileAndRun(`
pos = [0.0 0.0]
vel = [1.5 2.0]
pos[0] = pos[0] + vel[0]
pos[1] = pos[1] + vel[1]
pos[0] = pos[0] + vel[0]
pos[1] = pos[1] + vel[1]
print(floor(pos[0] * 10))
print(floor(pos[1] * 10))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '30') return `pos[0]: expected 30 got ${lines[0]}`;
    if (lines[1] !== '40') return `pos[1]: expected 40 got ${lines[1]}`;
});

test('[regression] Nested array with double elements (lumen_lite pattern)', () => {
    const output = compileAndRun(`
row0 = [0.0 0.0 0.0]
row1 = [0.0 0.0 0.0]
grid = [row0 row1]
grid[0][1] = 5.5
grid[1][2] = 7.25
v1 = grid[0][1]
v2 = grid[1][2]
print(floor(v1 * 100))
print(floor(v2 * 100))
`, ++testId);
    const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines[0] !== '550') return `grid[0][1]: expected 550 got ${lines[0]}`;
    if (lines[1] !== '725') return `grid[1][2]: expected 725 got ${lines[1]}`;
});

console.log('-'.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('-'.repeat(60));
if (failed > 0) process.exit(1);
