#!/usr/bin/env node
/**
 * SeedLang 统一API入口
 * Unified API Entry Point
 *
 * 所有外部消费者应通过此模块访问 SeedLang 功能:
 *   const { SeedLangVM, AOTCompiler, ... } = require('./src/api');
 *
 * 内部模块之间的直接引用保持不变，以避免循环依赖
 */

// ============================================
// 核心运行时
// ============================================
const {
    SeedLangVM,
    Compiler,
    VM,
    Parser: VMParser,
    OP,
    _globalBcCache,
    _globalJitCache
} = require('./runtime/vm.js');

// ============================================
// 词法器 / 解析器 (需要编译后的 dist/)
// ============================================
let Lexer = null;
let Parser = VMParser;
try {
    Lexer = require('../dist/core/lexer.js').Lexer;
    Parser = require('../dist/core/parser.js').Parser;
} catch (e) {
}

// ============================================
// 编译器模块
// ============================================
const { AOTCompiler } = require('./aot/compiler.js');
const { JITCompiler } = require('./jit/compiler.js');

// ============================================
// 高级优化模块
// ============================================
const { SSAConverter, SSAOptimizer } = require('./jit/ssa.js');
const {
    TailCallOptimizer,
    TailRecursionTransformer,
    TailCallRuntime
} = require('./jit/tail-call.js');
const {
    InlineCacheManager,
    MegamorphicInlineCache,
    InlineCacheState
} = require('./jit/inline-cache.js');
const {
    RegisterAllocator,
    LinearScanAllocator,
    GraphColoringAllocator
} = require('./jit/register-allocator.js');
const {
    SIMDVectorizer,
    SIMDVector,
    SIMDOperations,
    SIMDArrayOps,
    MatrixOperationRecognizer
} = require('./jit/simd.js');
const { AOTCompilerAdvanced, AOTModule, AOTLoader } = require('./jit/aot.js');

// ============================================
// 类型系统
// ============================================
const { TypeSystem, TypeInferencer } = require('./types/type-system.js');
const { TypeChecker } = require('./types/type-checker.js');

// ============================================
// 安全模块
// ============================================
const { RuntimeSafety, createSafeVM } = require('./safety/runtime-safety.js');

// ============================================
// 并发安全系统
// ============================================
const {
    IsolatedContext,
    AISessionManager,
    ConcurrentSafeVM,
    WorkspaceManager,
    ConflictResolver,
    AICoordinator,
    DeadlockDetector,
    TransactionManager
} = require('./concurrent/index.js');

// ============================================
// 异步运行时
// ============================================
const {
    AsyncRuntime,
    EventLoop,
    AsyncIterator,
    AsyncQueue,
    AsyncLock,
    AsyncSemaphore,
    AsyncChannel
} = require('./async/runtime.js');

// ============================================
// 内存优化
// ============================================
const {
    MemoryOptimizer,
    MemoryEfficientArray,
    MemoryEfficientObject,
    GenerationalGC
} = require('./memory/optimizer.js');

// ============================================
// 模块系统
// ============================================
const {
    ModuleSystem,
    ModuleBuilder,
    ModuleResolver,
    ModuleCache,
    SeedSet,
    SeedMap,
    FileAPI,
    PathAPI
} = require('./modules/system.js');

// ============================================
// 外部集成模块
// ============================================
const { WASMLoader, WASMCompiler, WASMRuntime } = require('./wasm/loader.js');
const { FFILibrary, FFIModule, FFITypeMapper } = require('./ffi/module.js');
const { PythonModule, PythonModuleManager } = require('./python/module.js');
const { RustModule, RustModuleManager } = require('./rust/module.js');
const { NativeModule, NativeModuleManager, NativeBuffer } = require('./native/module.js');

// ============================================
// AI集成
// ============================================
const { AIIntegration } = require('./ai/integration.js');

// ============================================
// 错误报告
// ============================================
const {
    ErrorReporter,
    ErrorSuggester,
    SourceMapper: ErrorSourceMapper,
    ErrorContext,
    FriendlyError
} = require('./errors/error-reporter.js');

// ============================================
// 调试系统
// ============================================
const {
    DebugSourceMapper,
    DebugErrorReporter,
    CodeAnalyzer,
    DebugInfoGenerator,
    LSPDataProvider,
    BreakpointManager,
    PerformanceProfiler,
    DebugSession
} = require('./debug/index.js');

// ============================================
// 沙箱隔离系统
// ============================================
const { Sandbox, SecurityPolicy, InputSanitizer } = require('./sandbox/index.js');

// ============================================
// 解释器优化器
// ============================================
const { InterpreterOptimizer, OptimizedInterpreter, LazyParser } = require('./optimizer/interpreter.js');

// ============================================
// TOKEN 计数器
// ============================================
const { TokenCounter } = require('./token-counter.js');

// ============================================
// SeedLang 统一API类
// ============================================
class SeedLangAPI {
    constructor(options = {}) {
        this.options = {
            typeCheck: options.typeCheck !== false,
            safeMode: options.safeMode !== false,
            jit: options.jit !== false,
            aot: options.aot || false,
            debug: options.debug || false,
            sandbox: options.sandbox || false,
            concurrent: options.concurrent || false,
            memory: options.memory || false,
            modules: options.modules !== false,
            wasm: options.wasm || false,
            ffi: options.ffi || false,
            ai: options.ai || false,
            ...options
        };

        this._initCore();
        this._initCompilers();
        this._initAdvancedOptimizations();
        this._initDebug();
        this._initSandbox();
        this._initTokenCounter();
        this._initTypeSystem();
        this._initSafety();
        this._initRuntime();
        this._initExternal();
        this._initAI();
    }

    _initCore() {
        this.vm = new SeedLangVM(this.options);
        this.lexer = null;
        this.parser = null;
    }

    _initCompilers() {
        if (this.options.jit) {
            this.jitCompiler = new JITCompiler(this.options.jitOptions || {});
        }

        if (this.options.aot) {
            this.aotCompiler = new AOTCompiler();
        }
    }

    _initAdvancedOptimizations() {
        this.ssaOptimizer = new SSAOptimizer();
        this.tailCallOptimizer = new TailCallOptimizer();
        this.inlineCacheManager = new InlineCacheManager(this.options.inlineCacheOptions || {});
        this.registerAllocator = new RegisterAllocator(this.options.registerAllocatorOptions || {});
        this.simdVectorizer = new SIMDVectorizer();
        this.aotCompilerAdvanced = new AOTCompilerAdvanced(this.options.aotOptions || {});
        this.interpreterOptimizer = new InterpreterOptimizer();
    }

    _initDebug() {
        if (this.options.debug) {
            this.debugSession = new DebugSession();
            this.debugSourceMapper = new DebugSourceMapper();
            this.breakpointManager = new BreakpointManager();
            this.performanceProfiler = new PerformanceProfiler();
        }
    }

    _initSandbox() {
        if (this.options.sandbox) {
            this.sandbox = new Sandbox(this.options.sandboxOptions || {});
        }
    }

    _initTokenCounter() {
        this.tokenCounter = new TokenCounter(this.options.tokenCounterOptions || {});
    }

    _initTypeSystem() {
        if (this.options.typeCheck) {
            this.typeSystem = new TypeSystem();
            this.typeChecker = new TypeChecker();
        }
    }

    _initSafety() {
        if (this.options.safeMode) {
            this.safety = new RuntimeSafety({
                strict: this.options.strictMode || false,
                checkBounds: this.options.checkBounds !== false,
                checkTypes: this.options.checkTypes !== false,
                checkNull: this.options.checkNull !== false
            });
        }

        if (this.options.concurrent) {
            this.isolatedContext = new IsolatedContext('api', this.options);
            this.concurrentSafeVM = new ConcurrentSafeVM();
        }
    }

    _initRuntime() {
        if (this.options.async !== false) {
            this.asyncRuntime = new AsyncRuntime();
        }

        if (this.options.memory) {
            this.memoryOptimizer = new MemoryOptimizer();
        }

        if (this.options.modules) {
            this.moduleSystem = new ModuleSystem();
        }
    }

    _initExternal() {
        if (this.options.wasm) {
            this.wasmLoader = new WASMLoader();
        }

        if (this.options.ffi) {
            this.ffiLibraries = new Map();
        }

        this.pythonModules = new Map();
        this.rustModules = new Map();
        this.nativeModules = new Map();
        this.external = this._createExternalBridge();
    }

    _createExternalBridge() {
        const api = this;
        return {
            js: {
                call(fn, ...args) {
                    if (typeof fn !== 'function') {
                        throw new Error('external.js.call 需要传入可调用函数');
                    }
                    return fn(...args);
                },
                method(obj, methodName, ...args) {
                    if (obj === null || obj === undefined) {
                        throw new Error('external.js.method 目标对象不能为空');
                    }
                    const method = obj[methodName];
                    if (typeof method !== 'function') {
                        throw new Error(`external.js.method 目标方法不存在: ${String(methodName)}`);
                    }
                    return method.call(obj, ...args);
                },
                get(obj, key) {
                    if (obj === null || obj === undefined) return null;
                    return obj[key];
                },
                set(obj, key, value) {
                    if (obj === null || obj === undefined) {
                        throw new Error('external.js.set 目标对象不能为空');
                    }
                    obj[key] = value;
                    return value;
                }
            },
            wasm: {
                load: async (wasmPath, imports = {}) => api.loadWASM(wasmPath, imports),
                loadFromBuffer: async (buffer, imports = {}) => api.loadWASMFromBuffer(buffer, imports),
                call(module, exportName, ...args) {
                    if (!module || !module.exports) {
                        throw new Error('external.wasm.call 模块无效或未加载');
                    }
                    const fn = module.exports[exportName];
                    if (typeof fn !== 'function') {
                        throw new Error(`external.wasm.call 导出函数不存在: ${String(exportName)}`);
                    }
                    return fn(...args);
                }
            },
            ffi: {
                loadLibrary: (name, path, functions) => api.loadFFILibrary(name, path, functions),
                call: (libraryName, functionName, ...args) => api.callFFI(libraryName, functionName, ...args)
            },
            native: {
                loadModule: (name, path) => api.loadNativeModule(name, path),
                call: (moduleName, functionName, ...args) => api.callNative(moduleName, functionName, ...args)
            }
        };
    }

    _initAI() {
        if (this.options.ai) {
            this.aiIntegration = new AIIntegration(this.options.aiOptions || {});
        }

        this.errorReporter = new ErrorReporter({
            colors: this.options.colors !== false,
            verbose: this.options.verbose || false,
            aiFriendly: this.options.aiFriendly || false
        });
    }

    // ============================================
    // 核心执行方法
    // ============================================

    run(code, options = {}) {
        return this.vm.run(code, options);
    }

    async runAsync(code, options = {}) {
        return this.vm.runAsync(code, options);
    }

    parse(code) {
        const lexer = new (Lexer || VMParser)(code);
        const tokens = lexer.tokenize ? lexer.tokenize() : [];
        const parser = new Parser(tokens);
        return parser.parse();
    }

    compile(code, options = {}) {
        const ast = this.parse(code);

        if (this.options.typeCheck && options.typeCheck !== false) {
            const result = this.typeChecker.check(ast);
            if (!result.success) {
                return { success: false, errors: result.errors };
            }
        }

        if (this.options.aot && options.aot !== false) {
            return { success: true, code: this.aotCompiler.compile(code) };
        }

        return this.vm.run(code, { ...options, compileOnly: true });
    }

    // ============================================
    // AOT编译
    // ============================================

    aotCompile(code) {
        if (!this.aotCompiler) {
            this.aotCompiler = new AOTCompiler();
        }
        return this.aotCompiler.compile(code);
    }

    aotCompileFile(filePath) {
        const fs = require('fs');
        try {
            const code = fs.readFileSync(filePath, 'utf8');
            return this.aotCompile(code);
        } catch (error) {
            return { success: false, error: `无法读取文件: ${filePath}` };
        }
    }

    // ============================================
    // JIT编译
    // ============================================

    enableJIT(options = {}) {
        if (!this.jitCompiler) {
            this.jitCompiler = new JITCompiler(options);
        }
        this.jitCompiler.enabled = true;
    }

    disableJIT() {
        if (this.jitCompiler) {
            this.jitCompiler.enabled = false;
        }
    }

    getJITStats() {
        return this.jitCompiler ? this.jitCompiler.getStats() : null;
    }

    // ============================================
    // 高级优化
    // ============================================

    optimizeAST(ast, options = {}) {
        let optimized = ast;

        if (options.ssa !== false) {
            optimized = this.ssaOptimizer.optimize(optimized);
        }

        if (options.tailCall !== false) {
            const result = this.tailCallOptimizer.optimize(optimized);
            optimized = result.ast || optimized;
        }

        if (options.simd !== false) {
            const result = this.simdVectorizer.vectorize(optimized);
            optimized = result.ast || optimized;
        }

        return optimized;
    }

    optimizeWithSSA(ast) {
        return this.ssaOptimizer.optimize(ast);
    }

    optimizeTailCalls(ast) {
        return this.tailCallOptimizer.optimize(ast);
    }

    vectorizeSIMD(ast) {
        return this.simdVectorizer.vectorize(ast);
    }

    allocateRegisters(blocks, algorithm = 'graph-coloring') {
        return this.registerAllocator.allocate(blocks, algorithm);
    }

    getInlineCacheStats() {
        return this.inlineCacheManager.getStats();
    }

    resetInlineCache() {
        this.inlineCacheManager.reset();
    }

    aotCompileAdvanced(source, options = {}) {
        return this.aotCompilerAdvanced.compile(source, options);
    }

    getOptimizationStats() {
        return {
            jit: this.getJITStats(),
            inlineCache: this.getInlineCacheStats(),
            simd: this.simdVectorizer.getStats ? this.simdVectorizer.getStats() : null,
            interpreter: this.interpreterOptimizer.getStats()
        };
    }

    // ============================================
    // 调试系统
    // ============================================

    enableDebugging(options = {}) {
        if (!this.debugSession) {
            this.debugSession = new DebugSession();
            this.debugSourceMapper = new DebugSourceMapper();
            this.breakpointManager = new BreakpointManager();
            this.performanceProfiler = new PerformanceProfiler();
        }
        return this.debugSession;
    }

    setBreakpoint(line, condition = null) {
        if (!this.breakpointManager) {
            this.enableDebugging();
        }
        return this.breakpointManager.setBreakpoint(line, condition);
    }

    startDebugSession(code) {
        if (!this.debugSession) {
            this.enableDebugging();
        }
        return this.debugSession.start(code);
    }

    stepExecution() {
        if (!this.debugSession) return null;
        return this.debugSession.step();
    }

    continueExecution() {
        if (!this.debugSession) return null;
        return this.debugSession.continue();
    }

    stopDebugSession() {
        if (!this.debugSession) return null;
        return this.debugSession.stop();
    }

    getSourceLocation(bytecodeOffset) {
        if (!this.debugSourceMapper) return { line: 0, column: 0 };
        return this.debugSourceMapper.getLocation(bytecodeOffset);
    }

    profilePerformance(code, options = {}) {
        if (!this.performanceProfiler) {
            this.performanceProfiler = new PerformanceProfiler();
        }
        return this.performanceProfiler.profile(code, options);
    }

    // ============================================
    // 沙箱隔离系统
    // ============================================

    createSandbox(options = {}) {
        return new Sandbox(options);
    }

    executeInSandbox(code, options = {}) {
        const sandbox = new Sandbox(options);
        return sandbox.execute(code);
    }

    getSandboxStats(sandbox) {
        if (!sandbox) return null;
        return {
            resourceUsage: sandbox.resourceUsage,
            violations: sandbox.violations,
            auditLog: sandbox.auditLog
        };
    }

    // ============================================
    // TOKEN 计数器
    // ============================================

    countTokens(code, language = 'seedlang') {
        return this.tokenCounter.countTokens(code, language);
    }

    compareTokens(seedlangCode, otherCode, otherLanguage = 'javascript') {
        return this.tokenCounter.compare(seedlangCode, otherCode, otherLanguage);
    }

    compareTokensAll(seedlangCode, codeMap) {
        return this.tokenCounter.compareAll(seedlangCode, codeMap);
    }

    analyzeTokenPatterns(code, language = 'seedlang') {
        return this.tokenCounter.analyzeCodePatterns(code, language);
    }

    generateTokenReport(seedlangCode, comparisons, format = 'text') {
        const report = this.tokenCounter.generateReport(seedlangCode, comparisons);
        return this.tokenCounter.formatReport(report, format);
    }

    estimateTokenCost(tokens, model = 'gpt-4') {
        return this.tokenCounter.estimateCost(tokens, model);
    }

    getCurrentAIModel() {
        return this.tokenCounter.getCurrentModel();
    }

    setCurrentAIModel(modelId) {
        return this.tokenCounter.setModel(modelId);
    }

    setCustomAIModel(modelId, config) {
        return this.tokenCounter.setCustomModel(modelId, config);
    }

    listAvailableModels() {
        return this.tokenCounter.listModels();
    }

    estimateCostWithCurrentModel(tokens) {
        return this.tokenCounter.estimateCostWithCurrentModel(tokens);
    }

    compareModelCosts(tokens, models = null) {
        return this.tokenCounter.compareModelCosts(tokens, models);
    }

    getOptimalModelForBudget(tokens, budget) {
        return this.tokenCounter.getOptimalModelForBudget(tokens, budget);
    }

    async updateModelPricing(options = {}) {
        return this.tokenCounter.updatePricing(options);
    }

    async checkPricingUpdates() {
        return this.tokenCounter.checkForUpdates();
    }

    getPricingInfo() {
        return this.tokenCounter.getPricingInfo();
    }

    exportModelPricing() {
        return this.tokenCounter.exportPricing();
    }

    importModelPricing(data, merge = true) {
        return this.tokenCounter.importPricing(data, merge);
    }

    addModel(modelId, config) {
        return this.tokenCounter.addModel(modelId, config);
    }

    removeModel(modelId) {
        return this.tokenCounter.removeModel(modelId);
    }

    setPricingSource(url) {
        this.tokenCounter.setPricingSource(url);
    }

    getTokenCounterStats() {
        return this.tokenCounter.getStats();
    }

    resetTokenCounter() {
        this.tokenCounter.reset();
    }

    // ============================================
    // 类型系统
    // ============================================

    checkTypes(ast, options = {}) {
        if (!this.typeChecker) {
            this.typeChecker = new TypeChecker();
        }
        return this.typeChecker.check(ast, options);
    }

    inferType(expression) {
        if (!this.typeChecker) {
            this.typeChecker = new TypeChecker();
        }
        return this.typeChecker.inferExpressionType(expression);
    }

    // ============================================
    // 安全系统
    // ============================================

    enableSafeMode(options = {}) {
        if (!this.safety) {
            this.safety = new RuntimeSafety(options);
        }
        this.safety.enabled = true;
    }

    disableSafeMode() {
        if (this.safety) {
            this.safety.enabled = false;
        }
    }

    getSafetyReport() {
        return this.safety ? this.safety.getErrorReport() : null;
    }

    // ============================================
    // 并发系统
    // ============================================

    createIsolatedContext(options = {}) {
        if (!this.isolatedContext) {
            this.isolatedContext = new IsolatedContext('api', options);
        }
        return this.isolatedContext;
    }

    getConcurrentSafeVM() {
        if (!this.concurrentSafeVM) {
            this.concurrentSafeVM = new ConcurrentSafeVM();
        }
        return this.concurrentSafeVM;
    }

    // ============================================
    // 异步运行时
    // ============================================

    async runConcurrent(tasks, options = {}) {
        if (!this.asyncRuntime) {
            this.asyncRuntime = new AsyncRuntime();
        }

        const limit = options.concurrencyLimit || 10;
        return this.asyncRuntime.runWithLimit(tasks, limit);
    }

    createPromise(executor) {
        if (!this.asyncRuntime) {
            this.asyncRuntime = new AsyncRuntime();
        }
        return this.asyncRuntime.createPromise(executor);
    }

    // ============================================
    // 内存管理
    // ============================================

    enableMemoryOptimization(options = {}) {
        if (!this.memoryOptimizer) {
            this.memoryOptimizer = new MemoryOptimizer();
        }
        this.memoryOptimizer.setEnabled(true);
        if (options.gcThreshold) {
            this.memoryOptimizer.setGCThreshold(options.gcThreshold);
        }
    }

    getMemoryStats() {
        return this.memoryOptimizer ? this.memoryOptimizer.getStats() : null;
    }

    runGC() {
        if (this.memoryOptimizer) {
            this.memoryOptimizer.runGC();
        }
    }

    // ============================================
    // 模块系统
    // ============================================

    async loadModule(modulePath, options = {}) {
        if (!this.moduleSystem) {
            this.moduleSystem = new ModuleSystem();
        }
        return this.moduleSystem.load(modulePath, options);
    }

    registerModule(name, module) {
        if (!this.moduleSystem) {
            this.moduleSystem = new ModuleSystem();
        }
        this.moduleSystem.register(name, module);
    }

    addModuleResolver(resolver) {
        if (!this.moduleSystem) {
            this.moduleSystem = new ModuleSystem();
        }
        this.moduleSystem.addResolver(resolver);
    }

    // ============================================
    // WebAssembly
    // ============================================

    async loadWASM(wasmPath, imports = {}) {
        if (!this.wasmLoader) {
            this.wasmLoader = new WASMLoader();
        }
        return this.wasmLoader.loadModule(wasmPath, imports);
    }

    async loadWASMFromBuffer(buffer, imports = {}) {
        if (!this.wasmLoader) {
            this.wasmLoader = new WASMLoader();
        }
        return this.wasmLoader.loadFromBuffer(buffer, imports);
    }

    // ============================================
    // FFI外部函数接口
    // ============================================

    loadFFILibrary(name, path, functions) {
        if (!this.ffiLibraries) {
            this.ffiLibraries = new Map();
        }

        const lib = new FFILibrary(name, path, functions);
        if (lib.load()) {
            this.ffiLibraries.set(name, lib);
            return true;
        }
        return false;
    }

    callFFI(libraryName, functionName, ...args) {
        const lib = this.ffiLibraries?.get(libraryName);
        if (!lib) {
            throw new Error(`FFI库未加载: ${libraryName}`);
        }
        return lib.call(functionName, ...args);
    }

    // ============================================
    // Python集成
    // ============================================

    async loadPythonModule(name, options = {}) {
        const module = new PythonModule(name, options);
        await module.load();
        this.pythonModules.set(name, module);
        return module;
    }

    async callPython(moduleName, functionName, ...args) {
        const module = this.pythonModules.get(moduleName);
        if (!module) {
            throw new Error(`Python模块未加载: ${moduleName}`);
        }
        return module.call(functionName, ...args);
    }

    // ============================================
    // Rust集成
    // ============================================

    async loadRustModule(name, options = {}) {
        const module = new RustModule(name, options);
        await module.load();
        this.rustModules.set(name, module);
        return module;
    }

    getRustExport(moduleName, exportName) {
        const module = this.rustModules.get(moduleName);
        if (!module || !module.wasmModule) {
            throw new Error(`Rust模块未加载: ${moduleName}`);
        }
        return module.wasmModule.exports[exportName];
    }

    // ============================================
    // Native模块
    // ============================================

    loadNativeModule(name, path) {
        const module = new NativeModule(name, path);
        if (module.load()) {
            this.nativeModules.set(name, module);
            return module;
        }
        return null;
    }

    callNative(moduleName, functionName, ...args) {
        const module = this.nativeModules.get(moduleName);
        if (!module) {
            throw new Error(`Native模块未加载: ${moduleName}`);
        }
        return module.call(functionName, ...args);
    }

    // ============================================
    // AI集成
    // ============================================

    generateCode(prompt, options = {}) {
        if (!this.aiIntegration) {
            this.aiIntegration = new AIIntegration(this.options.aiOptions || {});
        }
        return this.aiIntegration.generateCode(prompt, options);
    }

    validateCode(code, options = {}) {
        if (!this.aiIntegration) {
            this.aiIntegration = new AIIntegration(this.options.aiOptions || {});
        }
        return this.aiIntegration.validateCode(code, options);
    }

    repairCode(code, errors, options = {}) {
        if (!this.aiIntegration) {
            this.aiIntegration = new AIIntegration(this.options.aiOptions || {});
        }
        return this.aiIntegration.attemptAutoFix(code, errors, options);
    }

    // ============================================
    // 错误报告
    // ============================================

    reportError(error, code, options = {}) {
        return this.errorReporter.report(error, code, options);
    }

    // ============================================
    // 工具方法
    // ============================================

    reset() {
        this.vm.reset();
        if (this.safety) {
            this.safety.clearErrors();
        }
        if (this.memoryOptimizer) {
            this.memoryOptimizer.clear();
        }
    }

    getStats() {
        return {
            vm: this.vm.getStats ? this.vm.getStats() : null,
            jit: this.getJITStats(),
            memory: this.getMemoryStats(),
            safety: this.safety ? { hasErrors: this.safety.hasErrors() } : null
        };
    }

    getVersion() {
        return {
            version: '2.0.0',
            features: {
                typeCheck: !!this.typeChecker,
                safeMode: !!this.safety,
                jit: !!this.jitCompiler,
                aot: !!this.aotCompiler,
                concurrent: !!this.concurrentSafeVM,
                memory: !!this.memoryOptimizer,
                modules: !!this.moduleSystem,
                wasm: !!this.wasmLoader,
                ffi: this.ffiLibraries ? this.ffiLibraries.size > 0 : false,
                ai: !!this.aiIntegration
            }
        };
    }
}

// ============================================
// 专用运行时工厂
// ============================================

class RuntimeFactory {
    static createAgentRuntime(config = {}) {
        const { AgentRuntime } = require('./runtime/agent.js');
        return new AgentRuntime(config);
    }

    static createGameRuntime(config = {}) {
        const { GameRuntime } = require('./runtime/game.js');
        return new GameRuntime(config);
    }

    static createGraphicsRuntime(config = {}) {
        const { GraphicsRuntime } = require('./runtime/graphics.js');
        return new GraphicsRuntime(config);
    }

    static createWebRuntime(config = {}) {
        const { WebRuntime } = require('./runtime/web.js');
        return new WebRuntime(config);
    }

    static createMobileRuntime(config = {}) {
        const { MobileRuntime } = require('./runtime/mobile.js');
        return new MobileRuntime(config);
    }

    static createEmbeddedRuntime(config = {}) {
        const { EmbeddedRuntime } = require('./runtime/embedded.js');
        return new EmbeddedRuntime(config);
    }
}

// ============================================
// 导出
// ============================================

module.exports = {
    SeedLangAPI,
    RuntimeFactory,

    SeedLangVM,
    Compiler,
    VM,
    OP,
    _globalBcCache,
    _globalJitCache,
    Lexer,
    Parser,

    AOTCompiler,
    JITCompiler,
    AOTCompilerAdvanced,
    AOTModule,
    AOTLoader,

    SSAConverter,
    SSAOptimizer,
    TailCallOptimizer,
    TailRecursionTransformer,
    TailCallRuntime,
    InlineCacheManager,
    MegamorphicInlineCache,
    InlineCacheState,
    RegisterAllocator,
    LinearScanAllocator,
    GraphColoringAllocator,
    SIMDVectorizer,
    SIMDVector,
    SIMDOperations,
    SIMDArrayOps,
    MatrixOperationRecognizer,

    TypeSystem,
    TypeChecker,
    TypeInferencer,

    RuntimeSafety,
    createSafeVM,

    IsolatedContext,
    AISessionManager,
    ConcurrentSafeVM,
    WorkspaceManager,
    ConflictResolver,
    AICoordinator,
    DeadlockDetector,
    TransactionManager,

    AsyncRuntime,
    EventLoop,
    AsyncIterator,
    AsyncQueue,
    AsyncLock,
    AsyncSemaphore,
    AsyncChannel,

    MemoryOptimizer,
    MemoryEfficientArray,
    MemoryEfficientObject,
    GenerationalGC,

    ModuleSystem,
    ModuleBuilder,
    ModuleResolver,
    ModuleCache,
    SeedSet,
    SeedMap,
    FileAPI,
    PathAPI,

    WASMLoader,
    WASMCompiler,
    WASMRuntime,
    FFILibrary,
    FFIModule,
    FFITypeMapper,
    PythonModule,
    PythonModuleManager,
    RustModule,
    RustModuleManager,
    NativeModule,
    NativeModuleManager,
    NativeBuffer,

    AIIntegration,

    ErrorReporter,
    ErrorSuggester,
    ErrorSourceMapper,
    ErrorContext,
    FriendlyError,

    DebugSession,
    DebugSourceMapper,
    DebugErrorReporter,
    CodeAnalyzer,
    DebugInfoGenerator,
    LSPDataProvider,
    BreakpointManager,
    PerformanceProfiler,

    Sandbox,
    SecurityPolicy,
    InputSanitizer,

    InterpreterOptimizer,
    OptimizedInterpreter,
    LazyParser,

    TokenCounter
};
