// 语言规范符合性测试：对照 LANGUAGE_SPEC_REFACTOR_DRAFT.md 验证词法/语法/语义实现与规范一致

const { Lexer } = require('../../dist/core/lexer.js');
const { Parser } = require('../../dist/core/parser.js');
const { Interpreter } = require('../../dist/core/interpreter.js');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`[OK] ${name}`);
    } catch (e) {
        failed++;
        errors.push({ name, error: e.message });
        console.log(`[FAIL] ${name}`);
        console.log(`  Error: ${e.message}`);
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

console.log('========================================');
console.log('  Language Specification Example Tests');
console.log('========================================\n');

console.log('[0. Variable Declaration Tests]\n');

test('Simplified syntax variable declaration', () => {
    assertRun('x = 10');
    assertRun('y = 20');
    assertRun('z = 30');
    assertRun('PI = 3.14');
});

console.log('\n[1. Data Type Tests]\n');

test('Number type', () => {
    assertParse('num = 42');
    assertParse('float = 3.14');
});

test('String type', () => {
    assertParse('str = "hello world"');
    assertParse("str2 = 'single quotes'");
});

test('Boolean type', () => {
    assertParse('flag = true');
    assertParse('flag2 = false');
});

test('Null type', () => {
    assertParse('empty = null');
});

test('Radix literals', () => {
    assertParse('binary = 0b1010');
    assertParse('octal = 0o77');
    assertParse('hex = 0xFF');
    assertParse('hexLower = 0xff');
});

test('Array type', () => {
    assertParse('arr = [1 2 3 4 5]');
    assertParse('mixed = ["a" 1 true null]');
});

test('Object type', () => {
    assertParse('obj = { name: "Alice" age: 25 nested: { x: 10 } }');
});

console.log('\n[2. Function Definition Tests]\n');

test('No parameter function', () => {
    assertRun(`fn greet() {
  print("Hello!")
}
greet()`, 'Hello');
});

test('Function with parameters', () => {
    assertRun(`fn add(a b) {
  return a + b
}
print(add(1 2))`, '3');
});

test('Async function syntax', () => {
    assertParse(`async fn fetchData() {
  result = await httpGet("https://api.example.com")
  return result
}`);
});

console.log('\n[3. Control Flow Tests]\n');

test('Conditional statement', () => {
    assertRun(`condition = true
if condition {
  print("yes")
}`, 'yes');
});

test('if-else statement', () => {
    assertRun(`x = 5
if x > 10 {
  print("big")
} else {
  print("small")
}`, 'small');
});

test('while loop', () => {
    assertRun(`i = 0
while i < 3 {
  print(i)
  i = i + 1
}`);
});

test('for loop', () => {
    assertRun(`for (i = 0; i < 3; i = i + 1) {
  print(i)
}`);
});

test('break statement', () => {
    assertRun(`x = 0
while true {
  if x > 5 { break }
  x = x + 1
}
print(x)`, '6');
});

test('continue statement', () => {
    assertRun(`x = 0
count = 0
while x < 5 {
  x = x + 1
  if x < 3 { continue }
  count = count + 1
}
print(count)`, '3');
});

console.log('\n[4. Operator Tests]\n');

test('Arithmetic operations', () => {
    assertRun(`print(1 + 2)`, '3');
    assertRun(`print(5 - 3)`, '2');
    assertRun(`print(2 * 3)`, '6');
    assertRun(`print(6 / 2)`, '3');
});

test('Comparison operations', () => {
    assertRun(`print(1 == 1)`, 'true');
    assertRun(`print(1 != 2)`, 'true');
    assertRun(`print(1 < 2)`, 'true');
    assertRun(`print(2 > 1)`, 'true');
    assertRun(`print(1 <= 1)`, 'true');
    assertRun(`print(2 >= 2)`, 'true');
});

test('Logical operations', () => {
    assertRun(`print(true && true)`, 'true');
    assertRun(`print(true || false)`, 'true');
    assertRun(`print(!false)`, 'true');
});

test('Unary operators', () => {
    assertRun(`print(!true)`, 'false');
    assertRun(`print(-5)`, '-5');
});

console.log('\n[5. Array and Object Operation Tests]\n');

test('Array indexing', () => {
    assertRun(`arr = [10 20 30]
first = arr[0]
print(first)`, '10');
});

test('Object property access', () => {
    assertRun(`user = { name: "Alice" age: 25 }
name = user.name
print(name)`, 'Alice');
});

test('Array methods', () => {
    assertRun(`arr = [1 2 3]
push(arr 4)
print(len(arr))`, '4');
});

console.log('\n[6. Arrow Function Tests]\n');

test('Arrow function', () => {
    assertRun(`doubled = map([1 2 3] (x) => x * 2)
print(doubled)`);
});

test('filter arrow function', () => {
    assertRun(`nums = [1 2 3 4]
evens = filter(nums (x) => x == 2 || x == 4)
print(evens)`);
});

console.log('\n[7. Class Definition Tests]\n');

test('Class definition syntax', () => {
    assertParse(`class Animal {
  name = ""
  init(name) {
    this.name = name
  }
  speak() {
    print(this.name + " says hello")
  }
}`);
});

console.log('\n[8. Error Handling Tests]\n');

test('try-catch', () => {
    assertRun(`try {
  throw "test error"
} catch (e) {
  print("caught: " + e)
}`, 'caught');
});

test('throw statement', () => {
    assertParse(`throw "Something went wrong"`);
});

console.log('\n[10. Switch Statement Tests]\n');

test('switch-case', () => {
    assertRun(`value = 2
switch (value) {
  case 1:
    print("one")
  case 2:
    print("two")
  default:
    print("other")
}`, 'two');
});

console.log('\n[11. Bitwise Operation Tests]\n');

test('Bitwise AND', () => {
    assertRun(`print(0b1100 & 0b1010)`, '8');
});

test('Bitwise OR', () => {
    assertRun(`print(0b1100 | 0b1010)`, '14');
});

test('Bitwise XOR', () => {
    assertRun(`print(0b1100 ^ 0b1010)`, '6');
});

test('Left shift', () => {
    assertRun(`print(1 << 4)`, '16');
});

test('Right shift', () => {
    assertRun(`print(16 >> 2)`, '4');
});

console.log('\n[12. Comment Tests]\n');

test('Single-line comment', () => {
    assertRun(`// This is a comment
x = 10
print(x)`, '10');
});

test('Multi-line comment', () => {
    assertRun(`/* 
  Multi-line comment
*/
x = 20
print(x)`, '20');
});

console.log('\n[13. Example Code Tests]\n');

test('Fibonacci sequence', () => {
    assertRun(`fn fibonacci(n) {
  if n <= 1 {
    return n
  }
  return fibonacci(n - 1) + fibonacci(n - 2)
}

result = fibonacci(10)
print("fibonacci(10) = " + toString(result))`, 'fibonacci(10) = 55');
});

console.log('\n========================================');
console.log(`  Test Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (errors.length > 0) {
    console.log('Failure Details:');
    errors.forEach((e, i) => {
        console.log(`\n${i + 1}. ${e.name}`);
        console.log(`   ${e.error}`);
    });
    process.exit(1);
}

process.exit(0);
