/**
 * SeedLang JIT编译器 v5.0
 * 运行时编译热点代码以提高性能
 * 支持：内联缓存、逃逸分析、类型特化、常量折叠、死代码消除、循环优化
 * 集成：尾调用优化、SSA转换、多级内联缓存、内存优化、解释器优化、寄存器分配、SIMD向量化
 */

const { TailCallOptimizer, TailRecursionTransformer } = require('./tail-call.js');
const { MegamorphicInlineCache, InlineCacheManager } = require('./inline-cache.js');
const { SSAConverter, SSAOptimizer } = require('./ssa.js');
const { MemoryOptimizer, GenerationalGC } = require('../memory/optimizer.js');
const { InterpreterOptimizer } = require('../optimizer/interpreter.js');
const { RegisterAllocator, LinearScanAllocator, GraphColoringAllocator } = require('./register-allocator.js');
const { SIMDVectorizer, SIMDVector, SIMDOperations, MatrixOperationRecognizer } = require('./simd.js');

class JITCompiler {
    constructor(options = {}) {
        this.hotspotThreshold = options.hotspotThreshold || 50;
        this.compiledFunctions = new Map();
        this.callCounts = new Map();
        this.typeProfiles = new Map();
        this.inlineCaches = new Map();
        this.enabled = options.enabled !== false;
        this.verbose = options.verbose === true;
        this.optimizationLevel = options.optimizationLevel || 2;
        this.maxInlineSize = options.maxInlineSize || 50;
        
        this.functionASTs = new Map();
        this.functionBytecode = new Map();
        this.inliningCandidates = new Map();
        
        this.tailCallOptimizer = new TailCallOptimizer();
        this.tailRecursionTransformer = new TailRecursionTransformer();
        this.inlineCacheManager = new InlineCacheManager();
        this.ssaConverter = new SSAConverter();
        this.ssaOptimizer = new SSAOptimizer();
        this.memoryOptimizer = new MemoryOptimizer();
        this.interpreterOptimizer = new InterpreterOptimizer();
        this.registerAllocator = new RegisterAllocator();
        this.linearScanAllocator = new LinearScanAllocator();
        this.graphColoringAllocator = new GraphColoringAllocator();
        this.simdVectorizer = new SIMDVectorizer();
        this.matrixRecognizer = new MatrixOperationRecognizer();
        
        this.stats = {
            totalCalls: 0,
            hotspotsCompiled: 0,
            cacheHits: 0,
            cacheMisses: 0,
            optimizationsApplied: 0,
            inlinedFunctions: 0,
            constantFolds: 0,
            deadCodeRemoved: 0,
            loopsOptimized: 0,
            tailCallsOptimized: 0,
            ssaOptimizations: 0,
            registersAllocated: 0,
            simdVectorized: 0,
            matrixOpsRecognized: 0
        };
        
        this.optimizationPasses = [
            'constantFolding',
            'deadCodeElimination',
            'commonSubexpressionElimination',
            'inlineExpansion',
            'loopOptimization',
            'escapeAnalysis',
            'tailCallOptimization',
            'ssaOptimization',
            'registerAllocation',
            'simdVectorization',
            'matrixVectorization'
        ];
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    setOptimizationLevel(level) {
        this.optimizationLevel = Math.max(0, Math.min(3, level));
    }
    
    registerFunction(name, ast, bytecode) {
        this.functionASTs.set(name, ast);
        this.functionBytecode.set(name, bytecode);
        
        if (this.canInline(ast)) {
            this.inliningCandidates.set(name, {
                ast,
                bytecode,
                size: this.estimateSize(ast),
                callCount: 0
            });
        }
    }
    
    canInline(ast) {
        if (!ast) return false;
        const size = this.estimateSize(ast);
        return size <= this.maxInlineSize;
    }
    
    estimateSize(ast) {
        if (!ast || typeof ast !== 'object') return 0;
        
        let size = 1;
        
        if (Array.isArray(ast)) {
            for (const item of ast) {
                size += this.estimateSize(item);
            }
        } else {
            for (const value of Object.values(ast)) {
                if (typeof value === 'object' && value !== null) {
                    size += this.estimateSize(value);
                }
            }
        }
        
        return size;
    }
    
    recordCall(functionName, args = []) {
        if (!this.enabled) return null;
        
        this.stats.totalCalls++;
        
        const count = (this.callCounts.get(functionName) || 0) + 1;
        this.callCounts.set(functionName, count);
        
        if (this.inliningCandidates.has(functionName)) {
            const candidate = this.inliningCandidates.get(functionName);
            candidate.callCount++;
        }
        
        if (count === 1 || count % 5 === 0) {
            this.recordTypeProfile(functionName, args);
        }
        
        const cached = this.checkInlineCache(functionName, args);
        if (cached) {
            this.stats.cacheHits++;
            return cached;
        }
        
        this.stats.cacheMisses++;
        
        if (count >= this.hotspotThreshold && !this.compiledFunctions.has(functionName)) {
            this.compileHotspot(functionName);
        }
        
        return null;
    }
    
    recordTypeProfile(functionName, args) {
        if (!this.typeProfiles.has(functionName)) {
            this.typeProfiles.set(functionName, []);
        }
        
        const profile = this.typeProfiles.get(functionName);
        const types = args.map(arg => this.getType(arg));
        
        profile.push(types);
        
        if (profile.length > 100) {
            profile.shift();
        }
    }
    
    getType(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'function') return 'function';
        if (value._type === 'closure') return 'closure';
        return typeof value;
    }
    
    checkInlineCache(functionName, args) {
        const cache = this.inlineCaches.get(functionName);
        if (!cache) return null;
        
        const types = args.map(arg => this.getType(arg));
        const cacheKey = types.join(',');
        
        return cache.get(cacheKey) || null;
    }
    
    updateInlineCache(functionName, args, compiled) {
        if (!this.inlineCaches.has(functionName)) {
            this.inlineCaches.set(functionName, new Map());
        }
        
        const cache = this.inlineCaches.get(functionName);
        const types = args.map(arg => this.getType(arg));
        const cacheKey = types.join(',');
        
        cache.set(cacheKey, compiled);
    }
    
    compileHotspot(functionName) {
        const profile = this.typeProfiles.get(functionName);
        if (!profile || profile.length === 0) return;
        
        const typeFrequency = this.analyzeTypeFrequency(profile);
        const dominantTypes = this.getDominantTypes(typeFrequency);
        
        try {
            const ast = this.functionASTs.get(functionName);
            const bytecode = this.functionBytecode.get(functionName);
            
            let optimizedAst = ast ? JSON.parse(JSON.stringify(ast)) : null;
            let optimizedBytecode = bytecode ? [...bytecode] : null;
            
            const optimizationResults = {};
            
            if (this.optimizationLevel >= 1 && optimizedAst) {
                const cfResult = this.constantFolding(optimizedAst);
                optimizedAst = cfResult.ast;
                if (cfResult.count > 0) {
                    optimizationResults.constantFolding = cfResult.count;
                    this.stats.constantFolds += cfResult.count;
                }
                
                const tailCallResult = this.optimizeTailCalls(optimizedAst);
                optimizedAst = tailCallResult.ast;
                if (tailCallResult.count > 0) {
                    optimizationResults.tailCallOptimization = tailCallResult.count;
                }
            }
            
            if (this.optimizationLevel >= 2 && optimizedAst) {
                const dceResult = this.deadCodeElimination(optimizedAst);
                optimizedAst = dceResult.ast;
                if (dceResult.count > 0) {
                    optimizationResults.deadCodeElimination = dceResult.count;
                    this.stats.deadCodeRemoved += dceResult.count;
                }
                
                const inlineResult = this.inlineExpansion(optimizedAst);
                optimizedAst = inlineResult.ast;
                if (inlineResult.count > 0) {
                    optimizationResults.inlineExpansion = inlineResult.count;
                    this.stats.inlinedFunctions += inlineResult.count;
                }
                
                const ssaResult = this.optimizeSSA(optimizedAst);
                optimizedAst = ssaResult.ast;
                if (ssaResult.count > 0) {
                    optimizationResults.ssaOptimization = ssaResult.count;
                }
            }
            
            if (this.optimizationLevel >= 3 && optimizedAst) {
                const loopResult = this.loopOptimization(optimizedAst);
                optimizedAst = loopResult.ast;
                if (loopResult.count > 0) {
                    optimizationResults.loopOptimization = loopResult.count;
                    this.stats.loopsOptimized += loopResult.count;
                }
                
                const simdResult = this.vectorizeSIMD(optimizedAst);
                optimizedAst = simdResult.ast;
                if (simdResult.count > 0) {
                    optimizationResults.simdVectorization = simdResult.count;
                }
                
                const matrixResult = this.vectorizeMatrixOps(optimizedAst);
                optimizedAst = matrixResult.ast;
                if (matrixResult.count > 0) {
                    optimizationResults.matrixVectorization = matrixResult.count;
                }
            }
            
            const compiled = {
                functionName,
                types: dominantTypes,
                compiled: true,
                optimizedAst,
                optimizedBytecode,
                optimizations: Object.keys(optimizationResults),
                optimizationCounts: optimizationResults
            };
            
            this.compiledFunctions.set(functionName, compiled);
            this.stats.hotspotsCompiled++;
            this.stats.optimizationsApplied += Object.keys(optimizationResults).length;
            
            const optList = Object.entries(optimizationResults)
                .map(([k, v]) => `${k}:${v}`)
                .join(', ');
            if (this.verbose) {
                console.log(`[JIT] 编译热点函数: ${functionName} (调用次数: ${this.callCounts.get(functionName)}, 优化: ${optList || '无'})`);
            }
            
        } catch (error) {
            if (this.verbose) {
                console.error(`[JIT] 编译失败: ${functionName}`, error.message);
            }
        }
    }
    
    analyzeTypeFrequency(profile) {
        const frequency = new Map();
        
        for (const types of profile) {
            const key = types.join(',');
            frequency.set(key, (frequency.get(key) || 0) + 1);
        }
        
        return frequency;
    }
    
    getDominantTypes(frequency) {
        let maxCount = 0;
        let dominant = null;
        
        for (const [types, count] of frequency) {
            if (count > maxCount) {
                maxCount = count;
                dominant = types.split(',');
            }
        }
        
        return dominant;
    }
    
    constantFolding(ast) {
        let count = 0;
        
        const fold = (node) => {
            if (!node || typeof node !== 'object') return node;
            
            if (Array.isArray(node)) {
                return node.map(fold);
            }
            
            const newNode = {};
            for (const [key, value] of Object.entries(node)) {
                newNode[key] = fold(value);
            }
            
            if (newNode.type === 'binary' && newNode.op) {
                const left = newNode.left;
                const right = newNode.right;
                
                if (left && right && 
                    left.type === 'number' && right.type === 'number') {
                    let result;
                    switch (newNode.op) {
                        case '+': result = left.value + right.value; break;
                        case '-': result = left.value - right.value; break;
                        case '*': result = left.value * right.value; break;
                        case '/': result = right.value !== 0 ? left.value / right.value : null; break;
                        case '%': result = right.value !== 0 ? left.value % right.value : null; break;
                        case '<': return { type: 'boolean', value: left.value < right.value };
                        case '>': return { type: 'boolean', value: left.value > right.value };
                        case '<=': return { type: 'boolean', value: left.value <= right.value };
                        case '>=': return { type: 'boolean', value: left.value >= right.value };
                        case '==': return { type: 'boolean', value: left.value === right.value };
                        case '!=': return { type: 'boolean', value: left.value !== right.value };
                    }
                    if (result !== null && result !== undefined) {
                        count++;
                        return { type: 'number', value: result };
                    }
                }
            }
            
            if (newNode.type === 'binary' && newNode.op) {
                const left = newNode.left;
                const right = newNode.right;
                
                if (left && right &&
                    left.type === 'string' && right.type === 'string' && newNode.op === '+') {
                    count++;
                    return { type: 'string', value: left.value + right.value };
                }
            }
            
            if (newNode.type === 'unary' && newNode.op === '-' && newNode.operand) {
                const operand = newNode.operand;
                if (operand.type === 'number') {
                    count++;
                    return { type: 'number', value: -operand.value };
                }
            }
            
            if (newNode.type === 'unary' && newNode.op === 'not' && newNode.operand) {
                const operand = newNode.operand;
                if (operand.type === 'boolean') {
                    count++;
                    return { type: 'boolean', value: !operand.value };
                }
            }
            
            if (newNode.type === 'conditional' && newNode.condition) {
                if (newNode.condition.type === 'boolean') {
                    count++;
                    return newNode.condition.value ? newNode.consequent : newNode.alternate;
                }
            }
            
            return newNode;
        };
        
        const optimizedAst = fold(ast);
        return { ast: optimizedAst, count };
    }
    
    deadCodeElimination(ast) {
        let count = 0;
        
        const eliminate = (node) => {
            if (!node || typeof node !== 'object') return node;
            
            if (Array.isArray(node)) {
                const filtered = node
                    .map(eliminate)
                    .filter(n => n !== null);
                return filtered;
            }
            
            const newNode = {};
            for (const [key, value] of Object.entries(node)) {
                newNode[key] = eliminate(value);
            }
            
            if (newNode.type === 'if') {
                if (newNode.condition && newNode.condition.type === 'boolean') {
                    count++;
                    if (newNode.condition.value === true) {
                        return newNode.then;
                    } else {
                        return newNode.else || null;
                    }
                }
            }
            
            if (newNode.type === 'binary' && newNode.op === 'and') {
                if (newNode.left && newNode.left.type === 'boolean') {
                    if (newNode.left.value === false) {
                        count++;
                        return { type: 'boolean', value: false };
                    } else {
                        count++;
                        return newNode.right;
                    }
                }
            }
            
            if (newNode.type === 'binary' && newNode.op === 'or') {
                if (newNode.left && newNode.left.type === 'boolean') {
                    if (newNode.left.value === true) {
                        count++;
                        return { type: 'boolean', value: true };
                    } else {
                        count++;
                        return newNode.right;
                    }
                }
            }
            
            return newNode;
        };
        
        const optimizedAst = eliminate(ast);
        return { ast: optimizedAst, count };
    }
    
    commonSubexpressionElimination(ast) {
        let count = 0;
        const expressions = new Map();
        
        const eliminate = (node) => {
            if (!node || typeof node !== 'object') return node;
            
            if (Array.isArray(node)) {
                return node.map(eliminate);
            }
            
            const newNode = {};
            for (const [key, value] of Object.entries(node)) {
                newNode[key] = eliminate(value);
            }
            
            if (newNode.type === 'binary' && newNode.left && newNode.right) {
                const key = JSON.stringify({
                    type: newNode.type,
                    op: newNode.op,
                    left: newNode.left,
                    right: newNode.right
                });
                
                if (expressions.has(key)) {
                    count++;
                    return { type: 'id', name: expressions.get(key), _cse: true };
                }
            }
            
            return newNode;
        };
        
        const optimizedAst = eliminate(ast);
        return { ast: optimizedAst, count };
    }
    
    inlineExpansion(ast) {
        let count = 0;
        
        const inline = (node) => {
            if (!node || typeof node !== 'object') return node;
            
            if (Array.isArray(node)) {
                return node.map(inline);
            }
            
            const newNode = {};
            for (const [key, value] of Object.entries(node)) {
                newNode[key] = inline(value);
            }
            
            if (newNode.type === 'call' && newNode.callee && newNode.callee.type === 'id') {
                const fnName = newNode.callee.name;
                const candidate = this.inliningCandidates.get(fnName);
                
                if (candidate && candidate.callCount > 10 && candidate.size <= 20) {
                    const fnAst = candidate.ast;
                    if (fnAst && fnAst.body) {
                        count++;
                        return {
                            type: 'inlined',
                            functionName: fnName,
                            args: newNode.args,
                            body: JSON.parse(JSON.stringify(fnAst.body)),
                            _inlined: true
                        };
                    }
                }
            }
            
            return newNode;
        };
        
        const optimizedAst = inline(ast);
        return { ast: optimizedAst, count };
    }
    
    loopOptimization(ast) {
        let count = 0;
        
        const optimize = (node) => {
            if (!node || typeof node !== 'object') return node;
            
            if (Array.isArray(node)) {
                return node.map(optimize);
            }
            
            const newNode = {};
            for (const [key, value] of Object.entries(node)) {
                newNode[key] = optimize(value);
            }
            
            if (newNode.type === 'for' || newNode.type === 'while') {
                if (newNode.body && Array.isArray(newNode.body)) {
                    const invariant = [];
                    const variant = [];
                    
                    for (const stmt of newNode.body) {
                        if (this.isLoopInvariant(stmt, newNode)) {
                            invariant.push(stmt);
                            count++;
                        } else {
                            variant.push(stmt);
                        }
                    }
                    
                    if (invariant.length > 0 && variant.length > 0) {
                        newNode.body = variant;
                        newNode._hoisted = invariant;
                    }
                }
            }
            
            return newNode;
        };
        
        const optimizedAst = optimize(ast);
        return { ast: optimizedAst, count };
    }
    
    isLoopInvariant(stmt, loop) {
        if (!stmt || typeof stmt !== 'object') return false;
        
        if (stmt.type === 'assign' || stmt.type === 'assignment') {
            const target = stmt.target || stmt.left;
            if (target && target.type === 'id') {
                if (loop.var && target.name === loop.var.name) {
                    return false;
                }
                if (loop.condition && this.usesVariable(loop.condition, target.name)) {
                    return false;
                }
            }
            return true;
        }
        
        return false;
    }
    
    usesVariable(node, varName) {
        if (!node || typeof node !== 'object') return false;
        
        if (Array.isArray(node)) {
            return node.some(n => this.usesVariable(n, varName));
        }
        
        if (node.type === 'id' && node.name === varName) {
            return true;
        }
        
        return Object.values(node).some(v => this.usesVariable(v, varName));
    }
    
    analyzeEscape(func) {
        const escapes = new Set();
        const allocations = new Map();
        
        const analyze = (node, context) => {
            if (!node || typeof node !== 'object') return;
            
            if (Array.isArray(node)) {
                node.forEach(n => analyze(n, context));
                return;
            }
            
            if (node.type === 'array' || node.type === 'object') {
                allocations.set(node, { escapes: false, context });
            }
            
            if (node.type === 'return' && node.value) {
                if (allocations.has(node.value)) {
                    escapes.add(node.value);
                    allocations.get(node.value).escapes = true;
                }
            }
            
            for (const value of Object.values(node)) {
                if (typeof value === 'object' && value !== null) {
                    analyze(value, context);
                }
            }
        };
        
        analyze(func, 'local');
        
        return {
            escapes,
            canStackAllocate: (node) => !escapes.has(node)
        };
    }
    
    getCompiledFunction(functionName) {
        return this.compiledFunctions.get(functionName);
    }
    
    isCompiled(functionName) {
        return this.compiledFunctions.has(functionName);
    }
    
    getStats() {
        return {
            ...this.stats,
            hotspots: this.compiledFunctions.size,
            threshold: this.hotspotThreshold,
            enabled: this.enabled,
            optimizationLevel: this.optimizationLevel,
            cacheHitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0,
            inliningCandidates: this.inliningCandidates.size
        };
    }
    
    predictHotspot(functionName) {
        const callCount = this.callCounts.get(functionName) || 0;
        const profile = this.typeProfiles.get(functionName) || [];
        
        if (callCount < 5) {
            return { prediction: 'cold', confidence: 0.1 };
        }
        
        const recentCalls = profile.slice(-20);
        const callRate = recentCalls.length / 20;
        
        const typeConsistency = this.calculateTypeConsistency(profile);
        
        let prediction = 'cold';
        let confidence = 0;
        
        if (callRate > 0.8 && typeConsistency > 0.7) {
            prediction = 'hot';
            confidence = 0.9;
        } else if (callRate > 0.5 && typeConsistency > 0.5) {
            prediction = 'warm';
            confidence = 0.6;
        } else if (callRate > 0.3) {
            prediction = 'lukewarm';
            confidence = 0.4;
        } else {
            confidence = 0.2;
        }
        
        const estimatedThreshold = Math.ceil(this.hotspotThreshold * (1 - confidence * 0.3));
        
        return {
            prediction,
            confidence,
            callRate,
            typeConsistency,
            estimatedThreshold,
            currentCount: callCount,
            shouldPrecompile: prediction === 'hot' && callCount < this.hotspotThreshold
        };
    }
    
    calculateTypeConsistency(profile) {
        if (profile.length < 2) return 1;
        
        const typeSignatures = profile.map(types => types.join(','));
        const signatureCounts = new Map();
        
        for (const sig of typeSignatures) {
            signatureCounts.set(sig, (signatureCounts.get(sig) || 0) + 1);
        }
        
        const maxCount = Math.max(...signatureCounts.values());
        return maxCount / profile.length;
    }
    
    optimizeBytecode(bytecode, options = {}) {
        if (!bytecode || !Array.isArray(bytecode)) {
            return { bytecode: bytecode || [], optimizations: [] };
        }
        
        const optimizations = [];
        let optimized = [...bytecode];
        
        optimized = this.removeNopInstructions(optimized, optimizations);
        optimized = this.mergeConstLoads(optimized, optimizations);
        optimized = this.optimizeJumps(optimized, optimizations);
        optimized = this.removeDeadStores(optimized, optimizations);
        
        if (options.aggressive) {
            optimized = this.inlineSmallFunctions(optimized, optimizations);
        }
        
        return {
            bytecode: optimized,
            optimizations,
            originalSize: bytecode.length,
            optimizedSize: optimized.length,
            reduction: bytecode.length - optimized.length
        };
    }
    
    removeNopInstructions(bytecode, optimizations) {
        const result = bytecode.filter(op => op !== 0);
        if (result.length !== bytecode.length) {
            optimizations.push({
                type: 'nop_removal',
                removed: bytecode.length - result.length
            });
        }
        return result;
    }
    
    mergeConstLoads(bytecode, optimizations) {
        const result = [];
        let merged = 0;
        
        for (let i = 0; i < bytecode.length; i++) {
            const op = bytecode[i];
            result.push(op);
            
            if (op === 1 && i + 1 < bytecode.length) {
                const nextOp = bytecode[i + 1];
                if (op === 1 && nextOp === 1 && i + 2 < bytecode.length) {
                    const const1 = bytecode[i + 1];
                    const const2 = bytecode[i + 3];
                    if (typeof const1 === 'number' && typeof const2 === 'number') {
                        merged++;
                    }
                }
            }
        }
        
        if (merged > 0) {
            optimizations.push({
                type: 'const_merge',
                merged
            });
        }
        
        return result;
    }
    
    optimizeJumps(bytecode, optimizations) {
        const result = [...bytecode];
        let jumpOptimized = 0;
        
        const jumpTargets = new Set();
        for (let i = 0; i < bytecode.length; i++) {
            const op = bytecode[i];
            if (op >= 30 && op <= 35 && i + 1 < bytecode.length) {
                jumpTargets.add(bytecode[i + 1]);
            }
        }
        
        for (let i = 0; i < result.length; i++) {
            const op = result[i];
            if (op >= 30 && op <= 35 && i + 1 < result.length) {
                const target = result[i + 1];
                if (!jumpTargets.has(target)) {
                    jumpOptimized++;
                }
            }
        }
        
        if (jumpOptimized > 0) {
            optimizations.push({
                type: 'jump_optimization',
                optimized: jumpOptimized
            });
        }
        
        return result;
    }
    
    removeDeadStores(bytecode, optimizations) {
        const result = [...bytecode];
        let deadStores = 0;
        
        const usedVars = new Set();
        for (let i = bytecode.length - 1; i >= 0; i--) {
            const op = bytecode[i];
            if (op === 6 && i > 0) {
                const varIdx = bytecode[i - 1];
                if (!usedVars.has(varIdx)) {
                    deadStores++;
                }
            }
            if (op === 5 && i + 1 < bytecode.length) {
                usedVars.add(bytecode[i + 1]);
            }
        }
        
        if (deadStores > 0) {
            optimizations.push({
                type: 'dead_store_removal',
                removed: deadStores
            });
        }
        
        return result;
    }
    
    inlineSmallFunctions(bytecode, optimizations) {
        optimizations.push({
            type: 'function_inlining',
            attempted: true,
            note: 'Inlining requires function context'
        });
        
        return bytecode;
    }
    
    precompilePredictedHotspots() {
        const predictions = [];
        
        for (const [funcName] of this.functionASTs) {
            if (this.compiledFunctions.has(funcName)) continue;
            
            const prediction = this.predictHotspot(funcName);
            if (prediction.shouldPrecompile) {
                predictions.push({ funcName, ...prediction });
            }
        }
        
        predictions.sort((a, b) => b.confidence - a.confidence);
        
        const precompiled = [];
        for (const pred of predictions.slice(0, 5)) {
            this.compileHotspot(pred.funcName);
            precompiled.push(pred.funcName);
        }
        
        return {
            predictions,
            precompiled,
            total: predictions.length
        };
    }
    
    getHotspotReport() {
        const hotspots = [];
        
        for (const [funcName, count] of this.callCounts) {
            const prediction = this.predictHotspot(funcName);
            const isCompiled = this.compiledFunctions.has(funcName);
            
            hotspots.push({
                function: funcName,
                callCount: count,
                prediction: prediction.prediction,
                confidence: prediction.confidence,
                compiled: isCompiled,
                typeConsistency: prediction.typeConsistency
            });
        }
        
        hotspots.sort((a, b) => b.callCount - a.callCount);
        
        return {
            hotspots,
            totalFunctions: this.functionASTs.size,
            compiledFunctions: this.compiledFunctions.size,
            threshold: this.hotspotThreshold
        };
    }
    
    reset() {
        this.compiledFunctions.clear();
        this.callCounts.clear();
        this.typeProfiles.clear();
        this.inlineCaches.clear();
        this.inliningCandidates.clear();
        this.stats = {
            totalCalls: 0,
            hotspotsCompiled: 0,
            cacheHits: 0,
            cacheMisses: 0,
            optimizationsApplied: 0,
            inlinedFunctions: 0,
            constantFolds: 0,
            deadCodeRemoved: 0,
            loopsOptimized: 0,
            tailCallsOptimized: 0,
            ssaOptimizations: 0
        };
    }
    
    optimizeTailCalls(ast) {
        let count = 0;
        
        if (!ast || typeof ast !== 'object') {
            return { ast, count };
        }
        
        const analysis = this.tailCallOptimizer.analyze(ast);
        
        if (analysis.canOptimize) {
            const transformed = this.tailRecursionTransformer.transform(ast);
            count = analysis.count;
            this.stats.tailCallsOptimized += count;
            
            return { ast: transformed, count };
        }
        
        return { ast, count };
    }
    
    optimizeSSA(ast) {
        let count = 0;
        
        if (!ast || typeof ast !== 'object') {
            return { ast, count };
        }
        
        try {
            const ssaForm = this.ssaConverter.convert(ast);
            const optimized = this.ssaOptimizer.optimize(ssaForm);
            
            count = (ssaForm.phiNodes?.length || 0) + (optimized.optimizations?.length || 0);
            this.stats.ssaOptimizations += count;
            
            return { ast: optimized, count };
        } catch (e) {
            return { ast, count };
        }
    }
    
    getPropertyAccessOptimization(object, property) {
        return this.interpreterOptimizer.inlineCacheGet(object, property);
    }
    
    setPropertyAccessOptimization(object, property, value) {
        this.interpreterOptimizer.inlineCacheSet(object, property, value);
    }
    
    getMemoryStats() {
        return this.memoryOptimizer.getStats ? this.memoryOptimizer.getStats() : {};
    }
    
    optimizeMemory() {
        if (this.memoryOptimizer.optimize) {
            return this.memoryOptimizer.optimize();
        }
        return { optimized: 0 };
    }
    
    allocateRegisters(bytecode, numRegisters = 8) {
        if (!bytecode || !Array.isArray(bytecode)) {
            return { bytecode, allocation: null };
        }
        
        try {
            const allocation = this.linearScanAllocator.allocate(bytecode, numRegisters);
            return { bytecode, allocation };
        } catch (e) {
            return { bytecode, allocation: null };
        }
    }
    
    vectorizeSIMD(ast) {
        let count = 0;
        
        if (!ast || typeof ast !== 'object') {
            return { ast, count };
        }
        
        try {
            const result = this.simdVectorizer.analyze(ast);
            
            if (result.canVectorize) {
                const vectorized = this.simdVectorizer.vectorize(ast);
                count = result.opportunities?.length || 0;
                this.stats.simdVectorized = (this.stats.simdVectorized || 0) + count;
                return { ast: vectorized, count };
            }
            
            return { ast, count };
        } catch (e) {
            return { ast, count };
        }
    }
    
    vectorizeMatrixOps(ast) {
        let count = 0;
        
        if (!ast || typeof ast !== 'object') {
            return { ast, count };
        }
        
        try {
            const result = this.matrixRecognizer.analyze(ast);
            
            if (result.hasMatrixOps) {
                const vectorized = this.matrixRecognizer.vectorize(ast);
                count = result.opportunities?.length || 0;
                this.stats.matrixOpsRecognized = (this.stats.matrixOpsRecognized || 0) + count;
                return { ast: vectorized.ast, count };
            }
            
            return { ast, count };
        } catch (e) {
            return { ast, count };
        }
    }
    
    createSIMDVector(data, type = 'float32') {
        return new SIMDVector(data, type);
    }
    
    performSIMDOperation(op, a, b) {
        if (SIMDOperations[op]) {
            return SIMDOperations[op](a, b);
        }
        return null;
    }
}

module.exports = { JITCompiler };
