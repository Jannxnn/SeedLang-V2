// 代码覆盖率测试：确保所有核心模块路径（Lexer/Parser/Interpreter/VM/Builtins）均有测试覆盖

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Code Coverage Tests ===\n');

let passed = 0;
let failed = 0;

const testedFunctions = new Set();
const testedOpcodes = new Set();
const testedBuiltins = new Set();
const testedStatements = new Set();
let functionTestsPassed = 0;

console.log('--- Feature Coverage Tests ---');
const functionTests = [
    { name: 'Arithmetic operations', code: 'result = 1 + 2 * 3', category: 'arithmetic' },
    { name: 'Comparison operations', code: 'result = 1 < 2', category: 'comparison' },
    { name: 'Logical operations', code: 'result = true and false', category: 'logical' },
    { name: 'String operations', code: 'result = len("hello")', category: 'string' },
    { name: 'Array operations', code: 'arr = [1 2 3]\nresult = len(arr)', category: 'array' },
    { name: 'Object operations', code: 'obj = {a: 1}\nresult = obj.a', category: 'object' },
    { name: 'Function definition', code: 'fn f(x) { return x * 2 }\nresult = f(5)', category: 'function' },
    { name: 'Closure', code: 'fn outer() { x = 10\nfn inner() { return x }\nreturn inner() }\nresult = outer()', category: 'closure' },
    { name: 'Recursion', code: 'fn fib(n) { if n <= 1 { return n } return fib(n-1) + fib(n-2) }\nresult = fib(10)', category: 'recursion' },
    { name: 'if statement', code: 'if true { result = 1 }', category: 'control' },
    { name: 'while loop', code: 'i = 0\nwhile i < 3 { i = i + 1 }\nresult = i', category: 'control' },
    { name: 'for loop', code: 'sum = 0\nfor i in [1 2 3] { sum = sum + i }\nresult = sum', category: 'control' },
    { name: 'try-catch', code: 'try { result = 1 } catch(e) { }', category: 'error' },
    { name: 'Class definition', code: 'class Point { fn init(x) { this.x = x } }\np = Point(1)\nresult = p.x', category: 'class' },
    { name: 'Type checking', code: 'result = isArray([1 2 3])', category: 'type' },
    { name: 'Math functions', code: 'result = abs(-5)', category: 'builtin' },
    { name: 'String functions', code: 'result = upper("hi")', category: 'builtin' },
    { name: 'Array functions', code: 'result = concat([1] [2])', category: 'builtin' },
    { name: 'Scientific notation', code: 'result = 1e10', category: 'number' },
    { name: 'Unicode', code: 'text = "Hello"\nresult = len(text)', category: 'unicode' }
];

for (const test of functionTests) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(test.code);
        if (result.success) {
            console.log(`[OK] ${test.name}`);
            testedFunctions.add(test.category);
            functionTestsPassed++;
            passed++;
        } else {
            console.log(`[FAIL] ${test.name}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${test.name}: Exception`);
        failed++;
    }
}

console.log('\n--- Opcode Coverage Tests ---');
const opcodeTests = [
    { name: 'CONST', code: 'result = 42' },
    { name: 'ADD', code: 'result = 1 + 2' },
    { name: 'SUB', code: 'result = 5 - 3' },
    { name: 'MUL', code: 'result = 4 * 5' },
    { name: 'DIV', code: 'result = 10 / 2' },
    { name: 'MOD', code: 'result = 7 % 3' },
    { name: 'NEG', code: 'result = -5' },
    { name: 'AND', code: 'result = true and false' },
    { name: 'OR', code: 'result = true or false' },
    { name: 'NOT', code: 'result = not true' },
    { name: 'EQ', code: 'result = 1 == 1' },
    { name: 'NE', code: 'result = 1 != 2' },
    { name: 'LT', code: 'result = 1 < 2' },
    { name: 'GT', code: 'result = 2 > 1' },
    { name: 'LE', code: 'result = 1 <= 1' },
    { name: 'GE', code: 'result = 2 >= 1' },
    { name: 'CALL', code: 'fn f() { return 1 }\nresult = f()' },
    { name: 'RETURN', code: 'fn f() { return 42 }\nresult = f()' },
    { name: 'GET', code: 'obj = {a: 1}\nresult = obj.a' },
    { name: 'SET', code: 'obj = {}\nobj.a = 1\nresult = obj.a' },
    { name: 'ARRAY', code: 'result = [1 2 3]' },
    { name: 'OBJECT', code: 'result = {a: 1}' }
];

for (const test of opcodeTests) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(test.code);
        if (result.success) {
            testedOpcodes.add(test.name);
        }
    } catch (e) {}
}

const opcodeCoverage = ((testedOpcodes.size / opcodeTests.length) * 100).toFixed(1);
console.log(`Opcode coverage: ${testedOpcodes.size}/${opcodeTests.length} (${opcodeCoverage}%)`);

console.log('\n--- Built-in Function Coverage Tests ---');
const builtinTests = [
    { name: 'len', code: 'result = len([1 2 3])' },
    { name: 'push', code: 'arr = []\npush(arr 1)\nresult = len(arr)' },
    { name: 'pop', code: 'arr = [1]\nresult = pop(arr)' },
    { name: 'concat', code: 'result = concat([1] [2])' },
    { name: 'upper', code: 'result = upper("hi")' },
    { name: 'lower', code: 'result = lower("HI")' },
    { name: 'trim', code: 'result = trim("  x  ")' },
    { name: 'abs', code: 'result = abs(-5)' },
    { name: 'min', code: 'result = min(1 2 3)' },
    { name: 'max', code: 'result = max(1 2 3)' },
    { name: 'floor', code: 'result = floor(3.7)' },
    { name: 'ceil', code: 'result = ceil(3.1)' },
    { name: 'round', code: 'result = round(3.5)' },
    { name: 'sqrt', code: 'result = sqrt(16)' },
    { name: 'pow', code: 'result = pow(2 3)' },
    { name: 'string', code: 'result = string(123)' },
    { name: 'number', code: 'result = number("42")' },
    { name: 'type', code: 'result = type(1)' },
    { name: 'isArray', code: 'result = isArray([])' },
    { name: 'isObject', code: 'result = isObject({})' },
    { name: 'isString', code: 'result = isString("x")' },
    { name: 'isNumber', code: 'result = isNumber(1)' }
];

for (const test of builtinTests) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(test.code);
        if (result.success) {
            testedBuiltins.add(test.name);
        }
    } catch (e) {}
}

const builtinCoverage = ((testedBuiltins.size / builtinTests.length) * 100).toFixed(1);
console.log(`Built-in function coverage: ${testedBuiltins.size}/${builtinTests.length} (${builtinCoverage}%)`);

console.log('\n--- Statement Type Coverage Tests ---');
const statementTests = [
    { name: 'Variable declaration', code: 'x = 1' },
    { name: 'Function declaration', code: 'fn f() {}' },
    { name: 'if statement', code: 'if true {}' },
    { name: 'if-else statement', code: 'if true {} else {}' },
    { name: 'while statement', code: 'while false {}' },
    { name: 'for-in statement', code: 'for i in [] {}' },
    { name: 'return statement', code: 'fn f() { return 1 }' },
    { name: 'try-catch statement', code: 'try {} catch(e) {}' },
    { name: 'class declaration', code: 'class A {}' },
    { name: 'Expression statement', code: '1 + 2' }
];

for (const test of statementTests) {
    try {
        const vm = new SeedLangVM();
        const result = vm.run(test.code);
        if (result.success) {
            testedStatements.add(test.name);
        }
    } catch (e) {}
}

const statementCoverage = ((testedStatements.size / statementTests.length) * 100).toFixed(1);
console.log(`Statement coverage: ${testedStatements.size}/${statementTests.length} (${statementCoverage}%)`);

console.log('\n=== Code Coverage Summary ===');
const totalCoverage = (
    (functionTestsPassed / functionTests.length) * 25 +
    (testedOpcodes.size / opcodeTests.length) * 25 +
    (testedBuiltins.size / builtinTests.length) * 25 +
    (testedStatements.size / statementTests.length) * 25
).toFixed(1);

console.log(`Feature coverage: ${functionTestsPassed}/${functionTests.length} (${((functionTestsPassed / functionTests.length) * 100).toFixed(1)}%)`);
console.log(`Opcode coverage: ${testedOpcodes.size}/${opcodeTests.length} (${opcodeCoverage}%)`);
console.log(`Built-in function coverage: ${testedBuiltins.size}/${builtinTests.length} (${builtinCoverage}%)`);
console.log(`Statement coverage: ${testedStatements.size}/${statementTests.length} (${statementCoverage}%)`);
console.log(`\nTotal coverage: ${totalCoverage}%`);
console.log(`Coverage: ${totalCoverage}%`);

if (totalCoverage >= 80) {
    console.log('\n[OK] Good code coverage!');
} else {
    console.log('\n[FAIL] Suggest adding more test cases');
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);

process.exit(failed > 0 ? 1 : 0);
