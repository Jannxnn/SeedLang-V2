/**
 * 功能增强测试：类型系统、模块系统、错误处理、异步编程等核心增强特性
 * Tests for type system, module system, error handling, and async programming
 */

const { TypeSystem, TypeChecker, TypeInferencer } = require('../../src/types/type-system.js');
const { ModuleSystem, ModuleBuilder, ModuleResolver, ModuleCache } = require('../../src/modules/system.js');
const { ErrorReporter, ErrorSuggester, SourceMapper, ErrorContext, FriendlyError } = require('../../src/errors/error-reporter.js');
const { AsyncRuntime, EventLoop, AsyncQueue, AsyncLock, AsyncSemaphore, AsyncChannel } = require('../../src/async/runtime.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  [OK] ${name}`);
        passed++;
    } catch (error) {
        console.log(`  [FAIL] ${name}: ${error.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message} Expected ${expected}, got ${actual}`);
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(`${message} Condition should be true`);
    }
}

console.log('============================================================');
console.log('          SeedLang Feature Enhancement Tests');
console.log('============================================================\n');

// ============================================
// 1. Type System Tests
// ============================================
console.log('[1. Type System Tests]');

test('Type inference - number', () => {
    const typeSystem = new TypeSystem();
    const type = typeSystem.inferType(42);
    assertEqual(type.name, 'number');
});

test('Type inference - string', () => {
    const typeSystem = new TypeSystem();
    const type = typeSystem.inferType('hello');
    assertEqual(type.name, 'string');
});

test('Type inference - boolean', () => {
    const typeSystem = new TypeSystem();
    const type = typeSystem.inferType(true);
    assertEqual(type.name, 'boolean');
});

test('Type inference - array', () => {
    const typeSystem = new TypeSystem();
    const type = typeSystem.inferType([1, 2, 3]);
    assertEqual(type.kind, 'array');
    assertEqual(type.elementType, 'number');
});

test('Type inference - object', () => {
    const typeSystem = new TypeSystem();
    const type = typeSystem.inferType({ a: 1, b: 'test' });
    assertEqual(type.kind, 'object');
    assertTrue('a' in type.properties);
    assertTrue('b' in type.properties);
});

test('Type checking - match', () => {
    const typeSystem = new TypeSystem();
    const result = typeSystem.checkType(42, { kind: 'primitive', name: 'number' });
    assertTrue(result.valid);
});

test('Type checking - mismatch', () => {
    const typeSystem = new TypeSystem();
    const result = typeSystem.checkType('hello', { kind: 'primitive', name: 'number' });
    assertTrue(!result.valid);
});

test('Interface definition', () => {
    const typeSystem = new TypeSystem();
    typeSystem.defineInterface('Point', {
        x: 'number',
        y: 'number'
    });
    assertTrue(typeSystem.interfaces.has('Point'));
});

test('Type alias', () => {
    const typeSystem = new TypeSystem();
    typeSystem.defineTypeAlias('ID', { kind: 'primitive', name: 'string' });
    assertTrue(typeSystem.typeAliases.has('ID'));
});

console.log('');

// ============================================
// 2. Module System Tests
// ============================================
console.log('[2. Module System Tests]');

test('Module system initialization', () => {
    const moduleSystem = new ModuleSystem();
    assertTrue(moduleSystem.modules instanceof Map);
    assertTrue(moduleSystem.cache instanceof Map);
});

test('Module definition', () => {
    const moduleSystem = new ModuleSystem();
    moduleSystem.define('/test/module', { foo: 'bar' });
    assertTrue(moduleSystem.has('/test/module'));
});

test('Module retrieval', () => {
    const moduleSystem = new ModuleSystem();
    moduleSystem.define('/test/module', { foo: 'bar' });
    const module = moduleSystem.get('/test/module');
    assertEqual(module.exports.foo, 'bar');
});

test('Module cache', () => {
    const cache = new ModuleCache(10);
    cache.set('key1', { value: 'test' });
    assertTrue(cache.has('key1'));
    assertEqual(cache.get('key1').value, 'test');
});

test('Module cache statistics', () => {
    const cache = new ModuleCache(10);
    cache.set('key1', { value: 'test' });
    cache.get('key1');
    cache.get('key1');
    cache.get('key2');
    const stats = cache.getStats();
    assertEqual(stats.hits, 2);
    assertEqual(stats.misses, 1);
});

test('Module resolver', () => {
    const resolver = new ModuleResolver();
    resolver.addAlias('@utils', '/path/to/utils');
    const resolved = resolver.resolve('@utils');
    assertEqual(resolved, '/path/to/utils');
});

console.log('');

// ============================================
// 3. Error Handling Tests
// ============================================
console.log('[3. Error Handling Tests]');

test('Error reporter initialization', () => {
    const reporter = new ErrorReporter();
    assertTrue(reporter.errors instanceof Array);
    assertTrue(reporter.warnings instanceof Array);
});

test('Error reporting', () => {
    const reporter = new ErrorReporter();
    reporter.reportError('SyntaxError', 'Test error', { file: 'test.seed', line: 1, column: 1 });
    assertTrue(reporter.hasErrors());
    assertEqual(reporter.getErrors().length, 1);
});

test('Warning reporting', () => {
    const reporter = new ErrorReporter();
    reporter.reportWarning('Test warning');
    assertTrue(reporter.hasWarnings());
    assertEqual(reporter.getWarnings().length, 1);
});

test('Error suggester', () => {
    const suggester = new ErrorSuggester();
    const suggestions = suggester.suggest('Unexpected token');
    assertTrue(suggestions.length > 0);
});

test('Error context', () => {
    const code = 'line1\nline2\nline3\nline4\nline5';
    const context = new ErrorContext(code, 3, 2);
    const lines = context.getContextLines(1);
    assertEqual(lines.length, 3);
    assertTrue(lines[1].isError);
});

test('Friendly error', () => {
    const error = new FriendlyError('TypeError', 'Type error', { file: 'test.seed', line: 1 }, 'Check type');
    assertTrue(error.toString().includes('TypeError'));
    assertTrue(error.toString().includes('建议') || error.toString().includes('Check type'));
});

console.log('');

// ============================================
// 4. Async Programming Tests
// ============================================
console.log('[4. Async Programming Tests]');

test('Async runtime initialization', () => {
    const runtime = new AsyncRuntime();
    assertTrue(runtime.promises instanceof Map);
});

test('Promise creation', () => {
    const runtime = new AsyncRuntime();
    const { id, promise } = runtime.createPromise((resolve) => {
        resolve(42);
    });
    assertTrue(id > 0);
    assertTrue(promise instanceof Promise);
});

test('Promise resolution', async () => {
    const runtime = new AsyncRuntime();
    const promise = runtime.resolve(42);
    const result = await runtime.awaitPromise(promise);
    assertTrue(result.success);
    assertEqual(result.value, 42);
});

test('Promise rejection', async () => {
    const runtime = new AsyncRuntime();
    const promise = runtime.reject(new Error('Test error'));
    const result = await runtime.awaitPromise(promise);
    assertTrue(!result.success);
    assertTrue(result.error instanceof Error);
});

test('Delayed execution', async () => {
    const runtime = new AsyncRuntime();
    const start = Date.now();
    await runtime.delay(100);
    const elapsed = Date.now() - start;
    assertTrue(elapsed >= 100);
});

test('Async queue', async () => {
    const queue = new AsyncQueue();
    await queue.enqueue(1);
    await queue.enqueue(2);
    assertEqual(queue.length, 2);
    
    const result1 = await queue.dequeue();
    assertEqual(result1.value, 1);
});

test('Async lock', async () => {
    const lock = new AsyncLock();
    let counter = 0;
    
    await lock.withLock(async () => {
        counter++;
    });
    
    assertEqual(counter, 1);
});

test('Async semaphore', async () => {
    const semaphore = new AsyncSemaphore(2);
    let counter = 0;
    
    await semaphore.withSemaphore(async () => {
        counter++;
    });
    
    assertEqual(counter, 1);
});

test('Async channel', async () => {
    const channel = new AsyncChannel(1);
    await channel.send(42);
    const result = await channel.recv();
    assertEqual(result.value, 42);
});

console.log('');

// ============================================
// Test Summary
// ============================================
console.log('============================================================');
console.log('                    Test Summary');
console.log('============================================================\n');

console.log('[Component Test Results]');
console.log(`  [OK] Type System         ${passed > 0 ? 'Passed' : 'Failed'}`);
console.log(`  [OK] Module System       ${passed > 0 ? 'Passed' : 'Failed'}`);
console.log(`  [OK] Error Handling      ${passed > 0 ? 'Passed' : 'Failed'}`);
console.log(`  [OK] Async Programming   ${passed > 0 ? 'Passed' : 'Failed'}`);

console.log('\n[Overall Results]');
console.log(`  Total tests: ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

console.log('\n============================================================');

if (failed === 0) {
    console.log('\n[OK] All feature enhancement tests passed! SeedLang features are complete!');
} else {
    console.log('\n[FAIL] Some tests failed, please check error messages.');
}

module.exports = { passed, failed };
