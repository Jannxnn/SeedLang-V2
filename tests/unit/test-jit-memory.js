// JIT 编译与内存管理单元测试：验证 JIT 编译器优化策略及内存优化器（分代 GC / 内存压缩）的正确性

const { JITCompiler } = require('../../src/jit/compiler.js');
const { MemoryOptimizer, GenerationalGC } = require('../../src/memory/optimizer.js');

console.log('='.repeat(60));
console.log('  JIT Compiler and Memory Management Unit Tests');
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

console.log('\n[JIT Compiler Unit Tests]');
console.log('-'.repeat(60));

test('JITCompiler - constructor default values', () => {
    const jit = new JITCompiler();
    assertEqual(jit.hotspotThreshold, 50);
    assertEqual(jit.optimizationLevel, 2);
    assertEqual(jit.enabled, true);
    assertEqual(jit.maxInlineSize, 50);
    return true;
});

test('JITCompiler - custom configuration', () => {
    const jit = new JITCompiler({
        hotspotThreshold: 100,
        optimizationLevel: 3,
        enabled: false,
        maxInlineSize: 30
    });
    assertEqual(jit.hotspotThreshold, 100);
    assertEqual(jit.optimizationLevel, 3);
    assertEqual(jit.enabled, false);
    assertEqual(jit.maxInlineSize, 30);
    return true;
});

test('JITCompiler - registerFunction', () => {
    const jit = new JITCompiler();
    const ast = { type: 'function', name: 'test', params: [], body: [] };
    const bytecode = [1, 2, 3];
    
    jit.registerFunction('test', ast, bytecode);
    
    assertEqual(jit.functionASTs.has('test'), true);
    assertEqual(jit.functionBytecode.has('test'), true);
    return true;
});

test('JITCompiler - recordCall counting', () => {
    const jit = new JITCompiler();
    jit.registerFunction('test', {}, []);
    
    for (let i = 0; i < 5; i++) {
        jit.recordCall('test', [i]);
    }
    
    assertEqual(jit.callCounts.get('test'), 5);
    assertEqual(jit.stats.totalCalls, 5);
    return true;
});

test('JITCompiler - hotspot compilation trigger', () => {
    const jit = new JITCompiler({ hotspotThreshold: 5 });
    const ast = { type: 'function', name: 'hot', params: [], body: [] };
    jit.registerFunction('hot', ast, []);
    
    for (let i = 0; i < 6; i++) {
        jit.recordCall('hot', []);
    }
    
    assertEqual(jit.compiledFunctions.has('hot'), true);
    assertEqual(jit.stats.hotspotsCompiled, 1);
    return true;
});

test('JITCompiler - inline cache', () => {
    const jit = new JITCompiler();
    
    jit.updateInlineCache('test', [1, 2], { result: 3 });
    const cached = jit.checkInlineCache('test', [1, 2]);
    
    assertEqual(cached.result, 3);
    return true;
});

test('JITCompiler - type analysis', () => {
    const jit = new JITCompiler();
    
    jit.recordCall('test', [1, 'hello', true, null, [], {}]);
    
    const profile = jit.typeProfiles.get('test');
    assertEqual(profile[0][0], 'number');
    assertEqual(profile[0][1], 'string');
    assertEqual(profile[0][2], 'boolean');
    return true;
});

test('JITCompiler - constantFolding numbers', () => {
    const jit = new JITCompiler();
    const ast = {
        type: 'binary',
        op: '+',
        left: { type: 'number', value: 10 },
        right: { type: 'number', value: 20 }
    };
    
    const result = jit.constantFolding(ast);
    assertEqual(result.ast.type, 'number');
    assertEqual(result.ast.value, 30);
    return true;
});

test('JITCompiler - constantFolding strings', () => {
    const jit = new JITCompiler();
    const ast = {
        type: 'binary',
        op: '+',
        left: { type: 'string', value: 'Hello ' },
        right: { type: 'string', value: 'World' }
    };
    
    const result = jit.constantFolding(ast);
    assertEqual(result.ast.type, 'string');
    assertEqual(result.ast.value, 'Hello World');
    return true;
});

test('JITCompiler - deadCodeElimination always true', () => {
    const jit = new JITCompiler();
    const ast = {
        type: 'if',
        condition: { type: 'boolean', value: true },
        then: { type: 'number', value: 1 },
        else: { type: 'number', value: 2 }
    };
    
    const result = jit.deadCodeElimination(ast);
    assertEqual(result.ast.type, 'number');
    assertEqual(result.ast.value, 1);
    return true;
});

test('JITCompiler - deadCodeElimination always false', () => {
    const jit = new JITCompiler();
    const ast = {
        type: 'if',
        condition: { type: 'boolean', value: false },
        then: { type: 'number', value: 1 },
        else: { type: 'number', value: 2 }
    };
    
    const result = jit.deadCodeElimination(ast);
    assertEqual(result.ast.type, 'number');
    assertEqual(result.ast.value, 2);
    return true;
});

test('JITCompiler - getStats', () => {
    const jit = new JITCompiler();
    const stats = jit.getStats();
    
    assertType(stats.totalCalls, 'number');
    assertType(stats.hotspotsCompiled, 'number');
    assertType(stats.cacheHitRate, 'number');
    assertType(stats.enabled, 'boolean');
    return true;
});

test('JITCompiler - reset', () => {
    const jit = new JITCompiler();
    jit.registerFunction('test', {}, []);
    jit.recordCall('test', []);
    
    jit.reset();
    
    assertEqual(jit.callCounts.size, 0);
    assertEqual(jit.compiledFunctions.size, 0);
    assertEqual(jit.stats.totalCalls, 0);
    return true;
});

console.log('\n[Generational Garbage Collector Unit Tests]');
console.log('-'.repeat(60));

test('GenerationalGC - constructor', () => {
    const gc = new GenerationalGC();
    assertEqual(gc.youngGeneration.length, 0);
    assertEqual(gc.oldGeneration.length, 0);
    assertEqual(gc.youngGenMaxSize, 1000);
    assertEqual(gc.oldGenMaxSize, 10000);
    return true;
});

test('GenerationalGC - allocate', () => {
    const gc = new GenerationalGC();
    const obj = { data: 'test' };
    
    gc.allocate(obj);
    
    assertEqual(gc.youngGeneration.length, 1);
    assertEqual(gc.objectAges.size, 1);
    return true;
});

test('GenerationalGC - addRoot/removeRoot', () => {
    const gc = new GenerationalGC();
    const obj = { name: 'root' };
    
    gc.addRoot(obj);
    assertEqual(gc.roots.size, 1);
    
    gc.removeRoot(obj);
    assertEqual(gc.roots.size, 0);
    return true;
});

test('GenerationalGC - addReference', () => {
    const gc = new GenerationalGC();
    const parent = { name: 'parent' };
    const child = { name: 'child' };
    
    gc.allocate(parent);
    gc.allocate(child);
    gc.addReference(parent, child);
    
    const parentId = gc.getObjectId(parent);
    assertEqual(gc.objectRefs.get(parentId).size, 1);
    return true;
});

test('GenerationalGC - youngGC collection', () => {
    const gc = new GenerationalGC({ youngGenMaxSize: 5 });
    
    for (let i = 0; i < 10; i++) {
        gc.allocate({ data: i });
    }
    
    const collected = gc.youngGC();
    
    assertEqual(gc.stats.youngGCCount, 1);
    return true;
});

test('GenerationalGC - object promotion', () => {
    const gc = new GenerationalGC({ promotionThreshold: 2, youngGenMaxSize: 5 });
    
    const root = { name: 'root' };
    gc.addRoot(root);
    gc.allocate(root);
    
    gc.youngGC();
    gc.youngGC();
    gc.youngGC();
    
    assertEqual(gc.stats.objectsPromoted > 0, true);
    return true;
});

test('GenerationalGC - fullGC', () => {
    const gc = new GenerationalGC();
    
    for (let i = 0; i < 10; i++) {
        gc.allocate({ data: i });
    }
    
    gc.fullGC();
    
    assertEqual(gc.stats.youngGCCount >= 1, true);
    assertEqual(gc.stats.oldGCCount >= 1, true);
    return true;
});

test('GenerationalGC - getStats', () => {
    const gc = new GenerationalGC();
    const stats = gc.getStats();
    
    assertType(stats.youngGCCount, 'number');
    assertType(stats.oldGCCount, 'number');
    assertType(stats.youngGenSize, 'number');
    assertType(stats.oldGenSize, 'number');
    return true;
});

test('GenerationalGC - reset', () => {
    const gc = new GenerationalGC();
    gc.allocate({ data: 'test' });
    
    gc.reset();
    
    assertEqual(gc.youngGeneration.length, 0);
    assertEqual(gc.oldGeneration.length, 0);
    assertEqual(gc.objectAges.size, 0);
    return true;
});

console.log('\n[Memory Optimizer Unit Tests]');
console.log('-'.repeat(60));

test('MemoryOptimizer - constructor', () => {
    const opt = new MemoryOptimizer();
    assertEqual(opt.enabled, true);
    assertInstanceOf(opt.gcInstance, GenerationalGC);
    return true;
});

test('MemoryOptimizer - poolObject', () => {
    const opt = new MemoryOptimizer();
    const obj = { a: 1 };
    
    opt.poolObject('object', obj);
    
    assertEqual(opt.stats.pooledObjects >= 1, true);
    return true;
});

test('MemoryOptimizer - getPooledObject', () => {
    const opt = new MemoryOptimizer();
    const obj = { a: 1 };
    
    opt.poolObject('object', obj);
    const pooled = opt.getPooledObject('object', opt.getObjectKey(obj));
    
    return true;
});

test('MemoryOptimizer - gc method call', () => {
    const opt = new MemoryOptimizer();
    
    opt.poolObject('object', { data: 1 });
    opt.poolObject('string', 'test');
    
    opt.gc();
    
    assertEqual(opt.stats.gcCycles, 1);
    return true;
});

test('MemoryOptimizer - checkGC auto trigger', () => {
    const opt = new MemoryOptimizer({ gcThreshold: 5 });
    
    for (let i = 0; i < 10; i++) {
        opt.checkGC();
    }
    
    return true;
});

test('MemoryOptimizer - monitorMemory', () => {
    const opt = new MemoryOptimizer();
    const mem = opt.monitorMemory();
    
    assertType(mem.heapUsed, 'number');
    assertType(mem.heapTotal, 'number');
    assertType(mem.peakMemory, 'number');
    return true;
});

test('MemoryOptimizer - getStats', () => {
    const opt = new MemoryOptimizer();
    const stats = opt.getStats();
    
    assertType(stats.pooledObjects, 'number');
    assertType(stats.poolSize, 'number');
    assertType(stats.gcStats, 'object');
    return true;
});

test('MemoryOptimizer - reset', () => {
    const opt = new MemoryOptimizer();
    opt.poolObject('object', { data: 1 });
    
    opt.reset();
    
    assertEqual(opt.objectPool.size, 0);
    assertEqual(opt.stats.pooledObjects, 0);
    return true;
});

test('MemoryOptimizer - optimizeValue string', () => {
    const opt = new MemoryOptimizer();
    
    const result = opt.optimizeValue('hello');
    assertEqual(result, 'hello');
    return true;
});

test('MemoryOptimizer - optimizeValue array', () => {
    const opt = new MemoryOptimizer();
    
    const result = opt.optimizeValue([1, 2, 3]);
    assertEqual(Array.isArray(result), true);
    return true;
});

test('MemoryOptimizer - optimizeValue object', () => {
    const opt = new MemoryOptimizer();
    
    const result = opt.optimizeValue({ a: 1, b: 2 });
    assertType(result, 'object');
    return true;
});

console.log('\n[VM-JIT Integration Tests]');
console.log('-'.repeat(60));

const { SeedLangVM } = require('../../src/runtime/vm.js');

test('VM-JIT - function auto registration', () => {
    const vm = new SeedLangVM({ optimizationLevel: 3 });
    
    vm.run('fn testFunc(a b) { return a + b }');
    
    assertEqual(vm.jit.functionASTs.has('testFunc'), true);
    
    const ast = vm.jit.functionASTs.get('testFunc');
    assertEqual(ast.type, 'function');
    assertEqual(ast.name, 'testFunc');
    assertEqual(ast.params.length, 2);
    return true;
});

test('VM-JIT - preserveGlobals default behavior', () => {
    const vm = new SeedLangVM({ optimizationLevel: 3 });
    
    vm.run('fn add(a b) { return a + b }');
    
    const result = vm.run('add(1 2)');
    assertEqual(result.success, true);
    
    assertEqual(vm.jit.functionASTs.has('add'), true);
    return true;
});

test('VM-JIT - call counting through VM', () => {
    const vm = new SeedLangVM({ optimizationLevel: 3 });
    
    vm.run('fn countTest(x) { return x * 2 }');
    
    for (let i = 0; i < 10; i++) {
        vm.run('countTest(' + i + ')');
    }
    
    assertEqual((vm.jit.callCounts.get('countTest') || 0) >= 10, true);
    assertEqual(vm.jit.stats.totalCalls >= 10, true);
    return true;
});

test('VM-JIT - hotspot compilation trigger', () => {
    const vm = new SeedLangVM({ 
        optimizationLevel: 3,
        hotspotThreshold: 5
    });
    
    vm.run('fn hotFunc(n) { return n + 1 }');
    
    for (let i = 0; i < 10; i++) {
        vm.run('hotFunc(' + i + ')');
    }
    
    assertEqual(vm.jit.compiledFunctions.has('hotFunc'), true);
    assertEqual(vm.jit.stats.hotspotsCompiled, 1);
    return true;
});

test('VM-JIT - constant folding optimization', () => {
    const vm = new SeedLangVM({ 
        optimizationLevel: 3,
        hotspotThreshold: 5
    });
    
    vm.run('fn constFold() { return 1 + 2 * 3 }');
    
    for (let i = 0; i < 10; i++) {
        vm.run('constFold()');
    }
    
    assertEqual(vm.jit.stats.constantFolds >= 2, true);
    return true;
});

test('VM-JIT - multiple functions registration', () => {
    const vm = new SeedLangVM({ optimizationLevel: 3 });
    
    vm.run('fn func1() { return 1 }');
    vm.run('fn func2() { return 2 }');
    vm.run('fn func3() { return 3 }');
    
    assertEqual(vm.jit.functionASTs.has('func1'), true);
    assertEqual(vm.jit.functionASTs.has('func2'), true);
    assertEqual(vm.jit.functionASTs.has('func3'), true);
    return true;
});

test('VM-JIT - recursive function call counting', () => {
    const vm = new SeedLangVM({ 
        optimizationLevel: 3,
        hotspotThreshold: 100
    });
    
    vm.run('fn factorial(n) { if n <= 1 { return 1 } return n * factorial(n - 1) }');
    
    for (let i = 0; i < 5; i++) {
        vm.run('factorial(5)');
    }
    
    assertEqual(vm.jit.callCounts.get('factorial') > 0, true);
    return true;
});

test('VM-JIT - JIT disabled mode', () => {
    const vm = new SeedLangVM({ jit: false });
    
    vm.run('fn noJit() { return 42 }');
    
    assertEqual(vm.jit, undefined);
    return true;
});

test('VM-JIT - optimization level affects compilation', () => {
    const vm1 = new SeedLangVM({ optimizationLevel: 1, hotspotThreshold: 5 });
    const vm2 = new SeedLangVM({ optimizationLevel: 3, hotspotThreshold: 5 });
    
    vm1.run('fn opt1() { return 1 + 1 }');
    vm2.run('fn opt2() { return 1 + 1 }');
    
    for (let i = 0; i < 10; i++) {
        vm1.run('opt1()');
        vm2.run('opt2()');
    }
    
    assertEqual(vm1.jit.compiledFunctions.has('opt1'), true);
    assertEqual(vm2.jit.compiledFunctions.has('opt2'), true);
    return true;
});

test('VM-JIT - globals preserved across runs', () => {
    const vm = new SeedLangVM({ optimizationLevel: 3 });
    
    vm.run('var globalVar = 100');
    vm.run('fn getGlobal() { return globalVar }');
    
    const result = vm.run('getGlobal()');
    assertEqual(result.success, true);
    
    assertEqual(vm.jit.functionASTs.has('getGlobal'), true);
    return true;
});

console.log('\n' + '='.repeat(60));
console.log('  Test Summary');
console.log('='.repeat(60));
console.log(`\nTotal: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed === 0) {
    console.log('\n[OK] All unit tests passed!');
    process.exit(0);
} else {
    console.log('\n[FAIL] Some tests failed');
    process.exit(1);
}
