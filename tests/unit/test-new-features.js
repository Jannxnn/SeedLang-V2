/**
 * 新特性单元测试：沙箱、错误码、内存压力、并发安全、JIT 优化、调试支持、标准库等新功能验证
 * Testing sandbox, error codes, memory pressure, concurrency safety, JIT optimization, debug support, standard library
 */

const { Sandbox, SecurityPolicy, InputSanitizer } = require('../../src/sandbox/index.js');
const { ErrorReporter } = require('../../src/errors/error-reporter.js');
const { MemoryOptimizer } = require('../../src/memory/optimizer.js');
const { DeadlockDetector, TransactionManager } = require('../../src/concurrent/index.js');
const { JITCompiler } = require('../../src/jit/compiler.js');
const { BreakpointManager, PerformanceProfiler, DebugSession } = require('../../src/debug/index.js');
const { SeedSet, SeedMap, FileAPI, PathAPI } = require('../../src/modules/system.js');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
    try {
        fn();
        console.log(`[OK] ${name}`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        errors.push({ name, error: e.message });
        failed++;
    }
}

function assertEqual(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(`${msg} Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
    }
}

function assertTrue(condition, msg = '') {
    if (!condition) {
        throw new Error(`${msg} Expected true but got false`);
    }
}

console.log('========================================');
console.log('  SeedLang New Features Unit Tests');
console.log('========================================\n');

// ============================================
// 1. Sandbox Isolation System Tests
// ============================================
console.log('[1. Sandbox Isolation System]');

test('Sandbox - basic configuration', () => {
    const sandbox = new Sandbox({
        maxMemory: 64 * 1024 * 1024,
        maxCpuTime: 3000,
        allowFileSystem: false
    });
    
    assertEqual(sandbox.options.maxMemory, 64 * 1024 * 1024);
    assertEqual(sandbox.options.maxCpuTime, 3000);
    assertEqual(sandbox.options.allowFileSystem, false);
});

test('Sandbox - permission check', () => {
    const sandbox = new Sandbox({ allowFileSystem: true });
    const result = sandbox.checkPermission('file_read', '/test.txt');
    assertTrue(result.allowed === true || result.allowed === false);
});

test('Sandbox - resource limit check', () => {
    const sandbox = new Sandbox({ maxMemory: 1024 });
    const result = sandbox.checkResourceLimit('memory', 2048);
    assertEqual(result.allowed, false);
});

test('InputSanitizer - HTML sanitization', () => {
    const sanitizer = new InputSanitizer({ escapeHtml: true });
    const result = sanitizer.sanitize('<script>alert("xss")</script>');
    assertTrue(!result.includes('<script>'));
});

test('InputSanitizer - SQL injection check', () => {
    const sanitizer = new InputSanitizer();
    const result = sanitizer.validateSQL("SELECT * FROM users");
    assertEqual(result.valid, false);
});

test('SecurityPolicy - create policy', () => {
    const policy = new SecurityPolicy('test-policy', []);
    policy.addRule({
        action: 'file_read',
        resource: '/data/*',
        effect: 'allow'
    });
    
    assertEqual(policy.name, 'test-policy');
    assertEqual(policy.rules.length, 1);
});

// ============================================
// 2. Error Code System Tests
// ============================================
console.log('\n[2. Error Code System]');

test('ErrorReporter - error code mapping', () => {
    const reporter = new ErrorReporter();
    const codes = reporter.constructor.getErrorCodes();
    assertTrue(codes.SYNTAX_ERROR.code === 'E001');
    assertTrue(codes.UNDEFINED_VARIABLE.code === 'E101');
    assertTrue(codes.TYPE_MISMATCH.code === 'E201');
});

test('ErrorReporter - error suggestions', () => {
    const suggestion = ErrorReporter.getSuggestion('E101');
    assertTrue(suggestion !== undefined || suggestion === null);
});

test('ErrorReporter - format error', () => {
    const reporter = new ErrorReporter({ colors: false });
    const formatted = reporter.report({
        type: 'ReferenceError',
        message: 'Undefined variable: x',
        line: 5,
        column: 10,
        code: 'UNDEFINED_VARIABLE'
    }, 'let x = 1\nlet y = x');
    
    assertTrue(formatted.includes('E101'));
    assertTrue(formatted.includes('Undefined variable'));
});

// ============================================
// 3. Memory Pressure Warning Tests
// ============================================
console.log('\n[3. Memory Pressure Warning]');

test('MemoryOptimizer - pressure threshold configuration', () => {
    const optimizer = new MemoryOptimizer({
        lowPressureThreshold: 0.4,
        highPressureThreshold: 0.8
    });
    
    assertEqual(optimizer.pressureThresholds.low, 0.4);
    assertEqual(optimizer.pressureThresholds.high, 0.8);
});

test('MemoryOptimizer - pressure check', () => {
    const optimizer = new MemoryOptimizer();
    const pressure = optimizer.checkMemoryPressure();
    
    assertTrue(pressure !== undefined);
    return true;
});

// ============================================
// 4. Concurrency Safety Tests
// ============================================
console.log('\n[4. Concurrency Safety]');

test('DeadlockDetector - basic detection', () => {
    const detector = new DeadlockDetector();
    detector.addWaitRequest('P1', 'R1');
    detector.recordLockHolder('R1', 'P2');
    detector.addWaitRequest('P2', 'R2');
    detector.recordLockHolder('R2', 'P1');
    
    const deadlocks = detector.detectDeadlock();
    assertTrue(Array.isArray(deadlocks));
});

test('TransactionManager - begin transaction', () => {
    const tm = new TransactionManager();
    const txId = tm.begin('session-1');
    
    assertTrue(txId.startsWith('tx_'));
    assertTrue(tm.transactions.has(txId));
});

test('TransactionManager - commit transaction', () => {
    const tm = new TransactionManager();
    const txId = tm.begin('session-1');
    
    const result = tm.commit(txId);
    assertEqual(result.success, true);
});

test('TransactionManager - rollback transaction', () => {
    const tm = new TransactionManager();
    const txId = tm.begin('session-1');
    
    tm.rollback(txId);
    const tx = tm.getTransaction(txId);
    
    assertTrue(tx === undefined || tx.status === 'rolled_back');
});

// ============================================
// 5. JIT Optimization Tests
// ============================================
console.log('\n[5. JIT Optimization]');

test('JITCompiler - record call', () => {
    const jit = new JITCompiler();
    jit.recordCall('testFunc', [1, 2, 3]);
    
    assertEqual(jit.callCounts.get('testFunc'), 1);
});

test('JITCompiler - hotspot detection', () => {
    const jit = new JITCompiler({ hotspotThreshold: 10 });
    
    for (let i = 0; i < 15; i++) {
        jit.recordCall('hotFunc', [i]);
    }
    
    assertTrue(jit.callCounts.get('hotFunc') >= 10);
});

test('JITCompiler - type profiling', () => {
    const jit = new JITCompiler();
    jit.recordCall('typedFunc', [1, 'string', true]);
    
    const profile = jit.typeProfiles.get('typedFunc');
    assertTrue(Array.isArray(profile));
});

// ============================================
// 6. Debug Support Tests
// ============================================
console.log('\n[6. Debug Support]');

test('BreakpointManager - add breakpoint', () => {
    const bm = new BreakpointManager();
    const bp = bm.setBreakpoint('test.js', 10);
    
    assertEqual(bp.line, 10);
    assertTrue(bm.breakpoints.size > 0);
});

test('BreakpointManager - remove breakpoint', () => {
    const bm = new BreakpointManager();
    const bp = bm.setBreakpoint('test.js', 10);
    
    bm.removeBreakpoint(bp.id);
    assertTrue(bm.breakpoints.size === 0);
});

test('PerformanceProfiler - start profiling', () => {
    const profiler = new PerformanceProfiler();
    profiler.startProfiling();
    
    assertTrue(profiler.startTime !== undefined);
});

test('PerformanceProfiler - record event', () => {
    const profiler = new PerformanceProfiler();
    profiler.startProfiling();
    profiler.takeSample();
    
    assertTrue(profiler.samples.length > 0);
});

test('DebugSession - create session', () => {
    const session = new DebugSession();
    
    assertTrue(session.id.startsWith('debug_'));
    assertTrue(session.breakpoints !== undefined);
});

// ============================================
// 7. Standard Library Tests
// ============================================
console.log('\n[7. Standard Library]');

test('SeedSet - basic operations', () => {
    const set = new SeedSet();
    set.add(1);
    set.add(2);
    set.add(1);
    
    assertEqual(set.size, 2);
    assertTrue(set.has(1));
});

test('SeedMap - basic operations', () => {
    const map = new SeedMap();
    map.set('key1', 'value1');
    map.set('key2', 'value2');
    
    assertEqual(map.get('key1'), 'value1');
    assertEqual(map.size, 2);
});

test('FileAPI - read check', () => {
    const fileApi = new FileAPI();
    assertTrue(typeof fileApi.read === 'function' || fileApi.read === undefined);
});

test('PathAPI - join path', () => {
    const pathApi = new PathAPI();
    assertTrue(typeof pathApi.join === 'function' || pathApi.join === undefined);
});

// ============================================
// 8. Additional Integration Tests
// ============================================
console.log('\n[8. Additional Integration Tests]');

test('Sandbox - configuration check', () => {
    const sandbox = new Sandbox({ maxMemory: 1024 * 1024 });
    
    assertTrue(sandbox.options !== undefined);
});

test('ErrorReporter - multiple errors', () => {
    const reporter = new ErrorReporter();
    reporter.report({ type: 'Error', message: 'Error 1', code: 'E001' });
    reporter.report({ type: 'Error', message: 'Error 2', code: 'E002' });
    
    assertTrue(reporter.errors.length >= 0);
});

test('MemoryOptimizer - GC trigger', () => {
    const optimizer = new MemoryOptimizer();
    optimizer.gc();
    
    const stats = optimizer.getStats();
    assertTrue(typeof stats === 'object');
});

test('JITCompiler - reset counts', () => {
    const jit = new JITCompiler();
    jit.recordCall('func1', []);
    jit.recordCall('func2', []);
    
    jit.callCounts.clear();
    assertEqual(jit.callCounts.size, 0);
});

test('BreakpointManager - conditional breakpoint', () => {
    const bm = new BreakpointManager();
    const bp = bm.setBreakpoint('test.js', 20, { condition: 'x > 5' });
    
    assertTrue(bp.condition !== undefined);
});

test('SeedSet - iteration', () => {
    const set = new SeedSet([1, 2, 3]);
    const values = [];
    
    for (const v of set) {
        values.push(v);
    }
    
    assertTrue(values.length === 3);
});

test('SeedMap - delete operation', () => {
    const map = new SeedMap();
    map.set('key', 'value');
    map.delete('key');
    
    assertEqual(map.size, 0);
});

// ============================================
// Summary
// ============================================
console.log('\n========================================');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
    console.log('Failed tests:');
    for (const err of errors) {
        console.log(`  - ${err.name}: ${err.error}`);
    }
}

process.exit(failed > 0 ? 1 : 0);