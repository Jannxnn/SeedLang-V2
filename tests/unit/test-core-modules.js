// 核心模块单元测试：验证 JS 编译器、异步运行时、模块系统、调试源码映射等核心模块的独立功能

const { JSCompiler } = require('../../src/core/compiler.js');
const { AsyncRuntime } = require('../../src/async/runtime.js');
const { ModuleSystem } = require('../../src/modules/system.js');
const { DebugSourceMapper, CodeAnalyzer } = require('../../src/debug/index.js');

console.log('='.repeat(60));
console.log('  Core Module Unit Tests');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || result === undefined) {
            console.log(`[PASS] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: ${result}`);
            failed++;
        }
    } catch (error) {
        console.log(`[FAIL] ${name}: ${error.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} Expected ${expected}, got ${actual}`);
    }
    return true;
}

function assertType(value, type) {
    if (typeof value !== type) {
        throw new Error(`Expected type ${type}, got ${typeof value}`);
    }
    return true;
}

function assertInstanceOf(value, constructor) {
    if (!(value instanceof constructor)) {
        throw new Error(`Expected instance of ${constructor.name}`);
    }
    return true;
}

console.log('\n[JSCompiler Unit Tests]');
console.log('-'.repeat(60));

test('JSCompiler - instantiation', () => {
    const compiler = new JSCompiler();
    assertEqual(compiler.indent, 0);
    assertEqual(compiler.output.length, 0);
    return true;
});

test('JSCompiler - compile empty code', () => {
    const compiler = new JSCompiler();
    const result = compiler.compile('');
    assertType(result, 'string');
    return true;
});

test('JSCompiler - compile simple expression', () => {
    const compiler = new JSCompiler();
    const result = compiler.compile('x = 1 + 2');
    assertType(result, 'string');
    return true;
});

test('JSCompiler - compile function definition', () => {
    const compiler = new JSCompiler();
    const result = compiler.compile('fn add(a b) { return a + b }');
    assertType(result, 'string');
    return true;
});

test('JSCompiler - compile conditional statement', () => {
    const compiler = new JSCompiler();
    const result = compiler.compile('if x > 0 { y = 1 } else { y = 0 }');
    assertType(result, 'string');
    return true;
});

test('JSCompiler - compile loop statement', () => {
    const compiler = new JSCompiler();
    const result = compiler.compile('while i < 10 { i = i + 1 }');
    assertType(result, 'string');
    return true;
});

console.log('\n[AsyncRuntime Unit Tests]');
console.log('-'.repeat(60));

test('AsyncRuntime - instantiation', () => {
    const runtime = new AsyncRuntime();
    assertEqual(runtime.promiseId, 0);
    assertEqual(runtime.concurrencyLimit, 10);
    return true;
});

test('AsyncRuntime - resolve', () => {
    const runtime = new AsyncRuntime();
    const promise = runtime.resolve(42);
    assertInstanceOf(promise, Promise);
    return true;
});

test('AsyncRuntime - createPromise', () => {
    const runtime = new AsyncRuntime();
    const { id, promise } = runtime.createPromise((resolve) => {
        resolve('test');
    });
    assertEqual(id, 1);
    assertInstanceOf(promise, Promise);
    return true;
});

test('AsyncRuntime - delay', () => {
    const runtime = new AsyncRuntime();
    const promise = runtime.delay(50);
    assertInstanceOf(promise, Promise);
    return true;
});

test('AsyncRuntime - all', () => {
    const runtime = new AsyncRuntime();
    const promise = runtime.all([
        runtime.resolve(1),
        runtime.resolve(2),
        runtime.resolve(3)
    ]);
    assertInstanceOf(promise, Promise);
    return true;
});

test('AsyncRuntime - race', () => {
    const runtime = new AsyncRuntime();
    const promise = runtime.race([
        runtime.resolve('first'),
        runtime.delay(100).then(() => 'second')
    ]);
    assertInstanceOf(promise, Promise);
    return true;
});

console.log('\n[ModuleSystem Unit Tests]');
console.log('-'.repeat(60));

test('ModuleSystem - instantiation', () => {
    const moduleSystem = new ModuleSystem();
    assertInstanceOf(moduleSystem.modules, Map);
    return true;
});

test('ModuleSystem - define module', () => {
    const moduleSystem = new ModuleSystem();
    moduleSystem.define('/test/module', { foo: 'bar' });
    assertEqual(moduleSystem.has('/test/module'), true);
    return true;
});

test('ModuleSystem - get module', () => {
    const moduleSystem = new ModuleSystem();
    moduleSystem.define('/test/module', { foo: 'bar' });
    const mod = moduleSystem.get('/test/module');
    assertEqual(mod.exports.foo, 'bar');
    return true;
});

console.log('\n[DebugSourceMapper Unit Tests]');
console.log('-'.repeat(60));

test('DebugSourceMapper - instantiation', () => {
    const mapper = new DebugSourceMapper();
    assertInstanceOf(mapper.lineMap, Map);
    return true;
});

test('DebugSourceMapper - recordLocation', () => {
    const mapper = new DebugSourceMapper();
    mapper.recordLocation(0, 1, 0);
    assertEqual(mapper.lineMap.size, 1);
    return true;
});

console.log('\n[CodeAnalyzer Unit Tests]');
console.log('-'.repeat(60));

test('CodeAnalyzer - instantiation', () => {
    const analyzer = new CodeAnalyzer('x = 1');
    assertEqual(analyzer.sourceCode, 'x = 1');
    return true;
});

test('CodeAnalyzer - analyze', () => {
    const analyzer = new CodeAnalyzer('x = 1 + 2');
    const result = analyzer.findDefinition('x');
    assertType(result, 'object');
    return true;
});

console.log('\n' + '='.repeat(60));
console.log('  Test Summary');
console.log('='.repeat(60));
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Total:  ${passed + failed}`);
console.log('='.repeat(60));

if (failed === 0) {
    console.log('\n[OK] All core module unit tests passed!');
} else {
    console.log(`\n[FAIL] ${failed} tests failed`);
    process.exit(1);
}
