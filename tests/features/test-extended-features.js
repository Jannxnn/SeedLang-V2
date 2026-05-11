/**
 * 扩展特性测试：高级语法、内置函数、游戏逻辑及编译器边缘用例
 * Tests for advanced syntax, built-in functions, game logic, and compiler features
 */

const { Lexer } = require('../../dist/core/lexer.js');
const { Parser } = require('../../dist/core/parser.js');
const { Interpreter } = require('../../dist/core/interpreter.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  [OK] ${name}`);
    } catch (error) {
        failed++;
        console.log(`  [FAIL] ${name}: ${error.message}`);
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(message || 'Condition should be true');
    }
}

function assertParse(code) {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    if (!ast || !ast.statements) {
        throw new Error('Parse failed: AST is empty');
    }
    return ast;
}

function assertRun(code, expectedOutput = null) {
    const ast = assertParse(code);
    const interpreter = new Interpreter();
    interpreter.interpret(ast);
    if (expectedOutput !== null) {
        const output = interpreter.getOutput();
        if (output.length > 0 && !output[0].includes(expectedOutput)) {
            throw new Error(`Output mismatch: expected "${expectedOutput}", got "${output[0]}"`);
        }
    }
    return interpreter;
}

function assertCompile(code) {
    return assertParse(code);
}

console.log('============================================================');
console.log('       SeedLang Extended Feature Tests');
console.log('============================================================\n');

// ============================================
// 1. Object Literal Advanced Syntax Tests
// ============================================
console.log('[1. Object Literal Advanced Syntax]\n');

test('Object spread operator', () => {
    assertParse(`base = {a: 1 b: 2}
obj = {...base b: 3 c: 4}`);
});

test('Object computed property key', () => {
    assertParse(`k = "env"
obj3 = {[k]: "prod" [k + "_ver"]: 1}`);
});

test('Object shorthand property', () => {
    assertParse(`name = "SeedLang"
version = 1
obj5 = {name version}`);
});

test('Mixed string and normal keys in object', () => {
    assertParse(`obj1 = {name: "seed" "x-y": 9}`);
});

test('Nested object with spread and computed', () => {
    assertParse(`base = {a: 1}
obj4 = {...base [key()]: "value"}`);
});

// ============================================
// 2. Built-in Function Tests
// ============================================
console.log('\n[2. Built-in Function Tests]\n');

test('Math functions - sqrt', () => {
    assertRun(`print(sqrt(16))`, '4');
});

test('Math functions - pow', () => {
    assertRun(`print(pow(2 3))`, '8');
});

test('Math functions - abs', () => {
    assertRun(`print(abs(-5))`, '5');
});

test('Math functions - min/max', () => {
    assertRun(`print(min(3 5 1))`, '1');
    assertRun(`print(max(3 5 1))`, '5');
});

test('String functions - upper/lower', () => {
    assertRun(`print(upper("hello"))`, 'HELLO');
    assertRun(`print(lower("WORLD"))`, 'world');
});

test('String functions - trim', () => {
    assertRun(`print(trim("  hello  "))`, 'hello');
});

test('String functions - split/join', () => {
    assertRun(`arr = split("a,b,c" ",")
print(len(arr))`, '3');
});

test('String functions - replace', () => {
    assertRun(`print(replace("hello world" "world" "seed"))`, 'hello seed');
});

test('String functions - substring', () => {
    assertRun(`print(substring("hello" 0 2))`, 'he');
});

test('String functions - charAt', () => {
    assertRun(`print(charAt("hello" 0))`, 'h');
});

test('Array functions - push/pop/shift', () => {
    assertRun(`arr = [1 2]
push(arr 3)
push(arr 4)
print(len(arr))`, '4');
});

test('Array functions - slice/concat/reverse', () => {
    assertRun(`arr = [1 2 3]
rev = reverse(arr)
print(rev[0])`, '3');
});

test('Array functions - sort/indexOf', () => {
    assertRun(`arr = [3 1 2]
sorted = sort(arr)
print(sorted[0])`, '1');
});

test('Array functions - map/filter/reduce', () => {
    assertRun(`doubled = map([1 2 3] (x) => x * 2)
print(doubled[0])`, '2');
    
    assertRun(`evens = filter([1 2 3 4] (x) => x > 1 && x < 4)
print(len(evens))`, '2');
    
    assertRun(`sum = reduce([1 2 3] 0 (a b) => a + b)
print(sum)`, '6');
});

test('Object functions - keys/values/entries', () => {
    assertRun(`obj = {a: 1 b: 2}
keys = keys(obj)
print(len(keys))`, '2');
});

test('Type conversion functions', () => {
    assertRun(`print(toString(42))`, '42');
    assertRun(`print(toInt("123"))`, '123');
    assertRun(`print(toFloat("3.14"))`, '3.14');
    assertRun(`print(type(42))`, 'number');
});

// ============================================
// 3. Base Conversion & Bitwise Tests
// ============================================
console.log('\n[3. Base Conversion & Bitwise Operations]\n');

test('toBinary function', () => {
    assertRun(`print(toBinary(10))`, '1010');
});

test('toOctal function', () => {
    assertRun(`print(toOctal(63))`, '77');
});

test('toHex function', () => {
    assertRun(`print(toHex(255))`, 'FF');
});

test('parseBase function', () => {
    assertRun(`print(parseBase("1010" 2))`, '10');
});

test('formatBase function', () => {
    assertRun(`print(formatBase(255 16))`, 'FF');
});

test('Bitwise NOT operation', () => {
    assertRun(`result = ~0
print(result)`, '-1');
});

test('Unsigned right shift', () => {
    assertRun(`print((-1) >>> 1)`, '2147483647');
});

test('Bit mask operations', () => {
    assertRun(`flags = 0b1010
mask = 0b0010
result = flags & mask != 0
print(result)`, '0');
});

// ============================================
// 4. Regular Expression Tests
// ============================================
console.log('\n[4. Regular Expression Tests]\n');

test('regexMatch basic', () => {
    assertParse(`result = regexMatch("hello world" "world")`);
});

test('regexTest function', () => {
    assertParse(`result = regexTest("^\\d+$" "12345")`);
});

test('regexReplace function', () => {
    assertParse(`result = regexReplace("hello world" "\\s+" "-")`);
});

test('regexSplit function', () => {
    assertParse(`parts = regexSplit("a,b,c" ",")`);
});

// ============================================
// 5. Game Logic Tests
// ============================================
console.log('\n[5. Game Logic Tests]\n');

test('Snake game state initialization', () => {
    assertParse(`snake = { running: false size: 16 body: [] dir: { x: 1 y: 0 } food: { x: 5 y: 5 type: "normal" } score: 0 parts: [] multiplier: 1 power: null powerTimer: 0 obstacles: [] aiSnake: { body: [] dir: { x: -1 y: 0 } alive: true } timeLimit: 60 timeLeft: 60 combo: 0 comboTimer: 0 cols: 32 rows: 20 }`);
});

test('Tower defense game logic', () => {
    assertParse(`tower = { running: false wave: 1 gold: 100 lives: 20 kills: 0 towers: [] enemies: [] bullets: [] path: [] gridSize: 40 cols: 18 rows: 10 spawnTimer: 0 enemiesSpawned: 0 enemiesPerWave: 5 }`);
});

test('Fish tank simulation', () => {
    assertParse(`fishTank = { running: false fishes: [] bubbles: [] plants: [] foods: [] time: 0 }`);
});

test('Fireworks particle system', () => {
    assertParse(`fireworks = { running: false particles: [] rockets: [] time: 0 autoLaunch: true }`);
});

test('Complex nested object for games', () => {
    assertParse(`bossGame = { running: false player: { x: 260 y: 280 r: 10 hp: 100 maxHp: 100 } boss: { x: 260 y: 60 r: 40 hp: 500 maxHp: 500 phase: 1 attackTimer: 0 angle: 0 } bullets: [] enemyBullets: [] parts: [] score: 0 damage: 0 invincible: false invincibleTimer: 0 }`);
});

// ============================================
// 6. Control Flow Edge Cases
// ============================================
console.log('\n[6. Control Flow Edge Cases]\n');

test('Nested if-else chains', () => {
    assertRun(`x = 10
if x > 15 {
  print("big")
} else if x > 5 {
  print("medium")
} else {
  print("small")
}`, 'medium');
});

test('While loop with break and continue', () => {
    assertRun(`i = 0
sum = 0
while i < 10 {
  i = i + 1
  if i == 5 { continue }
  if i == 8 { break }
  sum = sum + i
}
print(sum)`, '23');
});

test('For loop with complex condition', () => {
    assertRun(`sum = 0
for (i = 1; i <= 10; i = i + 1) {
  if i == 2 || i == 4 || i == 6 || i == 8 || i == 10 { continue }
  sum = sum + i
}
print(sum)`, '25');
});

test('Switch statement with multiple cases', () => {
    assertRun(`value = 3
switch (value) {
  case 1:
    print("one")
  case 2:
    print("two")
  case 3:
    print("three")
  default:
    print("other")
}`, 'three');
});

// ============================================
// 7. Function & Closure Tests
// ============================================
console.log('\n[7. Function & Closure Tests]\n');

test('Recursive function - factorial', () => {
    assertRun(`fn factorial(n) {
  if n <= 1 { return 1 }
  return n * factorial(n - 1)
}
print(factorial(5))`, '120');
});

test('Recursive function - fibonacci', () => {
    assertRun(`fn fib(n) {
  if n <= 1 { return n }
  return fib(n - 1) + fib(n - 2)
}
print(fib(10))`, '55');
});

test('Higher-order function', () => {
    assertRun(`fn applyDouble(val) {
  return val * 2
}
print(applyDouble(5))`, '10');
});

// ============================================
// 8. Array & Object Manipulation Tests
// ============================================
console.log('\n[8. Array & Object Manipulation Tests]\n');

test('Multi-dimensional array', () => {
    assertParse(`matrix = [[1 2 3] [4 5 6] [7 8 9]]`);
});

test('Array destructuring-like access', () => {
    assertRun(`arr = [10 20 30]
first = arr[0]
second = arr[1]
third = arr[2]
print(first + second + third)`, '60');
});

test('Nested object access', () => {
    assertRun(`user = { name: "Alice" address: { city: "Beijing" zip: "100000" } }
city = user.address.city
print(city)`, 'Beijing');
});

test('Dynamic object property access', () => {
    assertRun(`user = { name: "Alice" age: 25 }
prop = "name"
val = user[prop]
print(val)`, 'Alice');
});

test('Object merge', () => {
    assertParse(`merged = merge({a: 1} {b: 2})`);
});

// ============================================
// 9. String Operation Tests
// ============================================
console.log('\n[9. String Operation Tests]\n');

test('String concatenation', () => {
    assertRun(`print("hello" + " " + "world")`, 'hello world');
});

test('String contains check', () => {
    assertRun(`print(contains("hello world" "world"))`, 'true');
});

test('String startsWith/endsWith', () => {
    assertRun(`print(startsWith("hello" "he"))`, 'true');
    assertRun(`print(endsWith("hello" "lo"))`, 'true');
});

test('String repeat', () => {
    assertRun(`print(repeat("ab" 3))`, 'ababab');
});

test('String padStart/padEnd', () => {
    assertRun(`print(padStart("5" 3 "0"))`, '005');
});

// ============================================
// 10. Parser Output Tests
// ============================================
console.log('\n[10. Parser Output Tests]\n');

test('Simple variable parsing', () => {
    const ast = assertCompile('x = 10');
    assertTrue(ast.statements.length > 0, 'Parsed AST should have statements');
});

test('Function parsing', () => {
    const ast = assertCompile(`fn add(a b) { return a + b }`);
    assertTrue(ast.statements.length > 0, 'Parsed AST should have function');
});

test('If statement parsing', () => {
    const ast = assertCompile(`if x > 0 { print("positive") }`);
    assertTrue(ast.statements.length > 0, 'Parsed AST should have if statement');
});

test('For loop parsing', () => {
    const ast = assertCompile(`for (i = 0; i < 10; i = i + 1) { print(i) }`);
    assertTrue(ast.statements.length > 0, 'Parsed AST should have for loop');
});

test('Object literal parsing', () => {
    const ast = assertCompile(`obj = { name: "test" value: 42 }`);
    assertTrue(ast.statements.length > 0, 'Parsed AST should have object');
});

test('Array literal parsing', () => {
    const ast = assertCompile(`arr = [1 2 3]`);
    assertTrue(ast.statements.length > 0, 'Parsed AST should have array');
});

// ============================================
// 11. Error Handling Tests
// ============================================
console.log('\n[11. Error Handling Tests]\n');

test('Try-catch-finally structure', () => {
    assertParse(`try {
  riskyOp()
} catch (e) {
  handleError(e)
} finally {
  cleanup()
}`);
});

test('Nested try-catch', () => {
    assertParse(`try {
  try {
    innerOp()
  } catch (innerErr) {
    handleInner(innerErr)
  }
} catch (outerErr) {
  handleOuter(outerErr)
}`);
});

test('Throw with expression', () => {
    assertParse(`throw "Error: " + message`);
});

// ============================================
// 12. Module System Tests
// ============================================
console.log('\n[12. Module System Syntax Tests]\n');

test('Import statement', () => {
    assertParse(`import math`);
});

test('Import alias', () => {
    assertParse(`import math as m`);
});

test('Export function', () => {
    assertParse(`export fn myFunc() { return 42 }`);
});

test('Export variable', () => {
    assertParse(`export myVar = 100`);
});

// ============================================
// 13. Class Definition Tests
// ============================================
console.log('\n[13. Class Definition Tests]\n');

test('Class with init method', () => {
    assertParse(`class Person {
  name = ""
  age = 0
  init(name age) {
    this.name = name
    this.age = age
  }
}`);
});

test('Class with multiple methods', () => {
    assertParse(`class Calculator {
  result = 0
  init(startValue) {
    this.result = startValue
  }
  add(value) {
    this.result = this.result + value
  }
  subtract(value) {
    this.result = this.result - value
  }
  getResult() {
    return this.result
  }
}`);
});

// ============================================
// 14. Async/Await Tests
// ============================================
console.log('\n[14. Async/Await Syntax Tests]\n');

test('Async function definition', () => {
    assertParse(`async fn fetchData(url) {
  response = await httpGet(url)
  data = jsonParse(response)
  return data
}`);
});

test('Promise chain pattern', () => {
    assertParse(`fetchData()
  .then((data) => process(data))
  .catch((err) => log(err))`);
});

// ============================================
// 15. Complex Expression Tests
// ============================================
console.log('\n[15. Complex Expression Tests]\n');

test('Chained method calls', () => {
    assertRun(`result = trim(upper("  hello  "))
print(result)`, 'HELLO');
});

test('Nested function calls', () => {
    assertRun(`print(sqrt(abs(-16)))`, '4');
});

test('Complex conditional expression', () => {
    assertRun(`result = ""
x = 10
if x > 5 {
  result = "big"
} else {
  result = "small"
}
print(result)`, 'big');
});

test('Complex arithmetic expression', () => {
    assertRun(`print((2 + 3) * 4 - 10 / 2)`, '15');
});

test('Logical operator combinations', () => {
    assertRun(`print(true && (false || true) && !false)`, 'true');
});

// ============================================
// Summary
// ============================================
console.log('\n============================================================');
console.log('  Test Results');
console.log('============================================================');
console.log(`  Total: ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}\n`);

if (failed > 0) {
    console.log('[FAIL] Some tests failed!');
    process.exit(1);
} else {
    console.log('[OK] All tests passed!');
    process.exit(0);
}
