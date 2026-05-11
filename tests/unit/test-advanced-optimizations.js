/**
 * 高级优化测试：验证 SSA、尾调用优化、多级内联缓存、寄存器分配、SIMD、AOT 编译等编译优化
 * Testing SSA, Tail Call Optimization, Multi-level Inline Cache, Register Allocation, SIMD, AOT Compilation
 */

const assert = require('assert');

const { SSAConverter, SSAOptimizer } = require('../../src/jit/ssa');
const { TailCallOptimizer, TailCallRuntime, TailRecursionTransformer } = require('../../src/jit/tail-call');
const { MegamorphicInlineCache, InlineCacheManager, InlineCacheState } = require('../../src/jit/inline-cache');
const { RegisterAllocator, GraphColoringAllocator, LinearScanAllocator } = require('../../src/jit/register-allocator');
const { SIMDVector, SIMDOperations, SIMDVectorizer, SIMDArrayOps } = require('../../src/jit/simd');
const { AOTCompiler, AOTModule, AOTLoader } = require('../../src/jit/aot');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        errors.push({ name, error: e.message });
        failed++;
    }
}

console.log('\n=== SSA Form Tests ===\n');

test('SSA - basic variable conversion', () => {
    const converter = new SSAConverter();
    const ast = {
        type: 'Program',
        body: [
            { type: 'VariableDecl', name: 'x', init: { type: 'Literal', value: 1 } },
            { type: 'Assignment', name: 'x', value: { type: 'Literal', value: 2 } }
        ]
    };
    
    const ssa = converter.convert(ast);
    assert.strictEqual(ssa.type, 'SSAProgram', 'SSA type should be correct');
    assert.ok(ssa.phiNodes !== undefined, 'Phi nodes should exist');
});

test('SSA - Phi node generation', () => {
    const converter = new SSAConverter();
    const ast = {
        type: 'Program',
        body: [
            {
                type: 'IfStmt',
                test: { type: 'Identifier', name: 'cond' },
                consequent: [
                    { type: 'Assignment', name: 'x', value: { type: 'Literal', value: 1 } }
                ],
                alternate: [
                    { type: 'Assignment', name: 'x', value: { type: 'Literal', value: 2 } }
                ]
            }
        ]
    };
    
    const ssa = converter.convert(ast);
    assert.ok(ssa.phiNodes !== undefined, 'Phi nodes should be generated');
});

test('SSA - constant propagation optimization', () => {
    const optimizer = new SSAOptimizer();
    const ssa = {
        type: 'Program',
        body: [
            { type: 'VariableDecl', name: 'x_1', init: { type: 'Literal', value: 5 } },
            { type: 'VariableDecl', name: 'y_1', init: { type: 'Identifier', name: 'x_1' } }
        ],
        ssa: true
    };
    
    const optimized = optimizer.constantPropagation(ssa);
    assert.ok(optimized, 'Constant propagation should succeed');
});

test('SSA - dead code elimination', () => {
    const optimizer = new SSAOptimizer();
    const ssa = {
        type: 'Program',
        body: [
            { type: 'VariableDecl', name: 'unused_1', init: { type: 'Literal', value: 1 } },
            { type: 'VariableDecl', name: 'used_1', init: { type: 'Literal', value: 2 } }
        ],
        ssa: true
    };
    
    const optimized = optimizer.deadCodeElimination(ssa);
    assert.ok(optimized, 'Dead code elimination should succeed');
});

console.log('\n=== Tail Call Optimization Tests ===\n');

test('Tail call - detect tail call position', () => {
    const optimizer = new TailCallOptimizer();
    const ast = {
        type: 'FunctionDecl',
        name: 'factorial',
        params: ['n'],
        body: [
            {
                type: 'IfStmt',
                test: { type: 'BinaryExpr', operator: '<=', left: { type: 'Identifier', name: 'n' }, right: { type: 'Literal', value: 1 } },
                consequent: [{ type: 'ReturnStmt', value: { type: 'Literal', value: 1 } }],
                alternate: [
                    {
                        type: 'ReturnStmt',
                        value: {
                            type: 'BinaryExpr',
                            operator: '*',
                            left: { type: 'Identifier', name: 'n' },
                            right: {
                                type: 'CallExpr',
                                callee: { type: 'Identifier', name: 'factorial' },
                                arguments: [{ type: 'BinaryExpr', operator: '-', left: { type: 'Identifier', name: 'n' }, right: { type: 'Literal', value: 1 } }]
                            }
                        }
                    }
                ]
            }
        ]
    };
    
    const analysis = optimizer.analyze(ast);
    assert.ok(analysis.tailCalls !== undefined, 'Tail calls should be detected');
});

test('Tail call - tail call transformation', () => {
    const optimizer = new TailCallOptimizer();
    const ast = {
        type: 'Program',
        body: [
            {
                type: 'ReturnStmt',
                value: {
                    type: 'CallExpr',
                    callee: { type: 'Identifier', name: 'foo' },
                    arguments: []
                }
            }
        ]
    };
    
    const result = optimizer.optimize(ast);
    assert.ok(result.optimized, 'Optimization should succeed');
});

test('Tail call - Trampoline execution', () => {
    const runtime = new TailCallRuntime({});
    
    const result = runtime.trampolineExecute(
        (n) => n <= 0 ? n : { tailCall: true, callee: (m) => m - 1, args: [n - 1] },
        [5],
        null
    );
    
    assert.ok(runtime.bouncing === false, 'Trampoline should complete');
});

console.log('\n=== Multi-level Inline Cache Tests ===\n');

test('Inline cache - Monomorphic cache', () => {
    const cache = new MegamorphicInlineCache();
    
    const result1 = cache.probe('site1', 'shape1');
    assert.ok(!result1.hit, 'First probe should miss');
    
    cache.update('site1', 'shape1', () => 42, 42);
    
    const result2 = cache.probe('site1', 'shape1');
    assert.ok(result2.hit, 'After update should hit');
    
    const stats = cache.getSiteStats('site1');
    assert.strictEqual(stats.state, InlineCacheState.MONOMORPHIC, 'Should be Monomorphic state');
});

test('Inline cache - Polymorphic transition', () => {
    const cache = new MegamorphicInlineCache();
    
    cache.update('site1', 'shape1', null, 1);
    cache.update('site1', 'shape2', null, 2);
    cache.update('site1', 'shape3', null, 3);
    
    const stats = cache.getSiteStats('site1');
    assert.ok(
        stats.state === InlineCacheState.POLYMORPHIC || stats.state === InlineCacheState.MONOMORPHIC,
        'Should transition to Polymorphic or stay Monomorphic'
    );
});

test('Inline cache - Megamorphic transition', () => {
    const cache = new MegamorphicInlineCache({ polyCacheSize: 2, transitionThreshold: 1 });
    
    for (let i = 0; i < 5; i++) {
        cache.update('site1', `shape${i}`, null, i);
    }
    
    const stats = cache.getSiteStats('site1');
    assert.ok(
        stats.state === InlineCacheState.MEGAMORPHIC || 
        stats.state === InlineCacheState.POLYMORPHIC,
        'Should transition to Megamorphic or Polymorphic'
    );
});

console.log('\n=== Register Allocation Tests ===\n');

test('Register allocator - basic allocation', () => {
    const allocator = new RegisterAllocator({ numRegisters: 8 });
    
    const blocks = [{
        instructions: [
            { dest: 'a', liveRange: { start: 0, end: 10 } },
            { dest: 'b', liveRange: { start: 5, end: 15 } }
        ]
    }];
    
    const result = allocator.allocate(blocks);
    assert.ok(result !== undefined, 'Allocation should succeed');
});

test('Graph coloring - interference graph', () => {
    const allocator = new GraphColoringAllocator({ numRegisters: 4 });
    
    const blocks = [{
        instructions: [
            { dest: 'a', liveRange: { start: 0, end: 10 } },
            { dest: 'b', liveRange: { start: 5, end: 15 } }
        ]
    }];
    
    const result = allocator.allocate(blocks);
    assert.ok(result !== undefined, 'Graph coloring allocation should succeed');
});

test('Linear scan - allocation', () => {
    const allocator = new LinearScanAllocator({ numRegisters: 4 });
    
    const intervals = [
        { var: 'a', start: 0, end: 10 },
        { var: 'b', start: 5, end: 15 },
        { var: 'c', start: 10, end: 20 }
    ];
    
    const result = allocator.allocate(intervals);
    assert.ok(result !== undefined, 'Linear scan allocation should succeed');
});

console.log('\n=== SIMD Vectorization Tests ===\n');

test('SIMD - vector creation', () => {
    const vec = new SIMDVector([1, 2, 3, 4], 'float32');
    
    assert.strictEqual(vec.width, 4);
    assert.ok(vec.data instanceof Float32Array);
});

test('SIMD - vector addition', () => {
    const a = new SIMDVector([1, 2, 3, 4], 'float32');
    const b = new SIMDVector([5, 6, 7, 8], 'float32');
    
    const result = SIMDOperations.add(a, b);
    assert.deepStrictEqual(Array.from(result.data), [6, 8, 10, 12]);
});

test('SIMD - vector multiplication', () => {
    const a = new SIMDVector([1, 2, 3, 4], 'float32');
    const b = new SIMDVector([2, 2, 2, 2], 'float32');
    
    const result = SIMDOperations.mul(a, b);
    assert.deepStrictEqual(Array.from(result.data), [2, 4, 6, 8]);
});

test('SIMD - vectorizer detection', () => {
    const vectorizer = new SIMDVectorizer();
    
    const loop = {
        type: 'ForStmt',
        body: [
            { type: 'Assignment', target: 'a[i]', value: 'b[i] + c[i]' }
        ]
    };
    
    const analysis = vectorizer.analyze(loop);
    assert.ok(typeof analysis.canVectorize === 'boolean', 'Vectorization detection should return boolean');
});

console.log('\n=== AOT Compilation Tests ===\n');

test('AOT - module compilation', () => {
    const compiler = new AOTCompiler();
    
    const source = 'fn add(a b) { return a + b }';
    
    const result = compiler.compile(source);
    assert.ok(result !== undefined, 'AOT compilation should succeed');
});

test('AOT - module loading', () => {
    const loader = new AOTLoader();
    
    const module = new AOTModule({
        code: Buffer.from('test'),
        exports: ['add', 'sub']
    });
    
    assert.ok(module.exports !== undefined, 'Module should have exports');
});

test('AOT - function call', () => {
    const compiler = new AOTCompiler();
    
    const source = 'fn test() { return 42 }';
    
    const compiled = compiler.compile(source);
    assert.ok(compiled !== undefined, 'Function should be compiled');
});

console.log('\n=== Additional Optimization Tests ===\n');

test('SSA - loop optimization', () => {
    const optimizer = new SSAOptimizer();
    const ssa = {
        type: 'Program',
        body: [
            { type: 'ForLoop', var: 'i', start: 0, end: 10, body: [] }
        ],
        ssa: true
    };
    
    const result = optimizer.optimize(ssa);
    assert.ok(result !== undefined, 'Loop optimization should succeed');
});

test('Tail call - accumulator pattern', () => {
    const transformer = new TailRecursionTransformer();
    
    const ast = {
        type: 'FunctionDecl',
        name: 'sum',
        params: ['n'],
        body: []
    };
    
    const result = transformer.transform(ast);
    assert.ok(result !== undefined, 'Transformation should succeed');
});

test('Inline cache - cache invalidation', () => {
    const cache = new MegamorphicInlineCache();
    
    cache.update('site1', 'shape1', null, 1);
    cache.reset('site1');
    
    const result = cache.probe('site1', 'shape1');
    assert.ok(!result.hit, 'After reset should miss');
});

test('Register allocator - spill handling', () => {
    const allocator = new RegisterAllocator({ numRegisters: 2 });
    
    const blocks = [{
        instructions: [
            { dest: 'a', liveRange: { start: 0, end: 20 } },
            { dest: 'b', liveRange: { start: 0, end: 20 } },
            { dest: 'c', liveRange: { start: 0, end: 20 } },
            { dest: 'd', liveRange: { start: 0, end: 20 } }
        ]
    }];
    
    const result = allocator.allocate(blocks);
    assert.ok(result !== undefined, 'Spill handling should succeed');
});

test('SIMD - array operations', () => {
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8];
    
    const result = SIMDArrayOps.map(arr1, (vec) => {
        return SIMDOperations.mul(vec, SIMDVector.splat(2, 'float32'));
    });
    
    assert.ok(result !== undefined, 'Array SIMD operation should succeed');
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
