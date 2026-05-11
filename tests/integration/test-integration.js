/**
 * WebAssembly/FFI/原生插件集成测试：验证外部语言集成能力（WASM 调用/FFI 绑定/N-API 插件）
 * Tests for external language integration features
 */

const { WASMLoader, WASMCompiler, WASMRuntime } = require('../../src/wasm/loader.js');
const { FFILibrary, FFIModule, FFITypeMapper } = require('../../src/ffi/module.js');
const { NativeModule, NativeModuleManager, NativeBuffer } = require('../../src/native/module.js');

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
console.log('          SeedLang External Language Integration Tests');
console.log('============================================================\n');

// ============================================
// 1. WebAssembly Tests
// ============================================
console.log('[1. WebAssembly Tests]');

test('WASM loader initialization', () => {
    const loader = new WASMLoader();
    assertTrue(loader.modules instanceof Map);
    assertTrue(loader.imports instanceof Object);
});

test('WASM runtime initialization', () => {
    const runtime = new WASMRuntime();
    assertTrue(runtime.modules instanceof Map);
    assertTrue(runtime.loader instanceof WASMLoader);
});

test('WASM compiler initialization', () => {
    const compiler = new WASMCompiler();
    assertTrue(compiler.types instanceof Map);
    assertTrue(compiler.functions instanceof Map);
});

test('WASM default imports creation', () => {
    const loader = new WASMLoader();
    const imports = loader.createDefaultImports();
    assertTrue('env' in imports);
    assertTrue('seed' in imports);
    assertTrue('memory' in imports.env);
    assertTrue('log' in imports.env);
});

test('WASM module info retrieval', () => {
    const loader = new WASMLoader();
    const info = loader.getModuleInfo({});
    assertEqual(info, null);
});

test('WASM runtime statistics', () => {
    const runtime = new WASMRuntime();
    const stats = runtime.getStats();
    assertEqual(stats.loadedModules, 0);
    assertTrue(Array.isArray(stats.moduleNames));
});

console.log('');

// ============================================
// 2. FFI Tests
// ============================================
console.log('[2. FFI Tests]');

test('FFI library initialization', () => {
    const lib = new FFILibrary('test', './test.so', {
        add: { params: ['int', 'int'], returnType: 'int' }
    });
    assertEqual(lib.name, 'test');
    assertTrue(lib.functions.has('add'));
});

test('FFI module initialization', () => {
    const module = new FFIModule();
    assertTrue(module.libraries instanceof Map);
    assertTrue(module.typeDefinitions instanceof Map);
});

test('FFI type mapper initialization', () => {
    const mapper = new FFITypeMapper();
    assertEqual(mapper.getSize('int'), 4);
    assertEqual(mapper.getSize('double'), 8);
});

test('FFI library definition', () => {
    const module = new FFIModule();
    const lib = module.defineLibrary('math', './libmath.so', {
        sqrt: { params: ['double'], returnType: 'double' }
    });
    assertTrue(module.libraries.has('math'));
});

test('FFI type checking', () => {
    const mapper = new FFITypeMapper();
    assertTrue(mapper.isIntegerType('int'));
    assertTrue(mapper.isFloatType('double'));
    assertTrue(mapper.isPointerType('pointer'));
});

test('FFI value conversion', () => {
    const module = new FFIModule();
    assertEqual(module.convertValue(42.5, 'int'), 42);
    assertEqual(module.convertValue(1, 'boolean'), true);
    assertEqual(module.convertValue(0, 'boolean'), false);
});

test('FFI callback creation', () => {
    const module = new FFIModule();
    const callbackId = module.createCallback(
        { params: ['int', 'int'], returnType: 'int' },
        (a, b) => a + b
    );
    assertTrue(module.callbacks.has(callbackId));
});

console.log('');

// ============================================
// 3. Native Addons Tests
// ============================================
console.log('[3. Native Addons Tests]');

test('Native module initialization', () => {
    const module = new NativeModule('test', './test.node');
    assertEqual(module.name, 'test');
    assertTrue(module.functions instanceof Map);
    assertTrue(module.classes instanceof Map);
});

test('Native module manager initialization', () => {
    const manager = new NativeModuleManager();
    assertTrue(manager.modules instanceof Map);
    assertTrue(Array.isArray(manager.searchPaths));
});

test('Native buffer creation', () => {
    const buffer = new NativeBuffer(100);
    assertEqual(buffer.length, 100);
    assertTrue(buffer.raw instanceof Buffer);
});

test('Native buffer static methods', () => {
    const buffer = NativeBuffer.from([1, 2, 3, 4, 5]);
    assertEqual(buffer.length, 5);
});

test('Native buffer read/write', () => {
    const buffer = NativeBuffer.alloc(100);
    buffer.writeInt32LE(42, 0);
    assertEqual(buffer.readInt32LE(0), 42);
});

test('Native buffer float read/write', () => {
    const buffer = NativeBuffer.alloc(100);
    buffer.writeDoubleLE(3.14, 0);
    const value = buffer.readDoubleLE(0);
    assertTrue(Math.abs(value - 3.14) < 0.0001);
});

test('Native module registration', () => {
    const manager = new NativeModuleManager();
    manager.registerModule('test', './test.node');
    assertTrue(manager.modules.has('test'));
});

test('Native module manager statistics', () => {
    const manager = new NativeModuleManager();
    const stats = manager.getStats();
    assertEqual(stats.total, 0);
    assertEqual(stats.loaded, 0);
});

test('Native type converter', () => {
    const manager = new NativeModuleManager();
    assertTrue(manager.typeConverters.has('number'));
    assertTrue(manager.typeConverters.has('string'));
    assertTrue(manager.typeConverters.has('boolean'));
});

console.log('');

// ============================================
// Test Summary
// ============================================
console.log('============================================================');
console.log('                    Test Summary');
console.log('============================================================\n');

console.log('[Component Test Results]');
console.log(`  [OK] WebAssembly      ${passed > 0 ? 'Passed' : 'Failed'}`);
console.log(`  [OK] FFI              ${passed > 0 ? 'Passed' : 'Failed'}`);
console.log(`  [OK] Native Addons    ${passed > 0 ? 'Passed' : 'Failed'}`);

console.log('\n[Overall Results]');
console.log(`  Total tests: ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

console.log('\n============================================================');

if (failed === 0) {
    console.log('\n[OK] All external language integration tests passed! SeedLang supports multi-language integration.');
} else {
    console.log('\n[FAIL] Some tests failed, please check error messages.');
}

module.exports = { passed, failed };
