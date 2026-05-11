#!/usr/bin/env node
/**
 * SeedLang Bytecode VM v2.0
 * SeedLang 字节码虚拟机 v2.0
 * Runtime baseline aligned with the canonical spec:
 * 运行时基线与唯一规范保持一致：
 * - Source of truth: docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md
 * - 权威标准文件：docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md
 * - Preferred style: space-separated collections/params/call args
 * - 推荐风格：数组/对象/参数/调用参数使用空格分隔
 * - Compatibility: comma-separated forms are accepted (deprecated style)
 * - 兼容性：逗号分隔仍可用（但属于弃用风格）
 * - Supported: modulo operator (%) and both while/for-in loops
 * - 已支持：取模运算符（%）以及 while/for-in 两种循环
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const {
    createVMBuiltins,
    createVMModules,
    createRuntimeBuiltins
} = require('./vm/builtins');
const { createRuntimeModules } = require('./vm/bootstrap_wiring');
const { resumeCoroutine, getCoroutineStatus } = require('../../dist/core/coroutine.js');
const { isReturnOpcodeValue, isComputedReturnOpcodeValue } = require('./vm/return_ops');
const { validateJitConsts, safeNewFunction } = require('./vm/jit_safety');
const { isDangerousObjectKey, isInternalMetaKey, decodeSeedObjectKey } = require('./vm/object_key_safety');
const { hardenArrayObject } = require('./vm/runtime_safety');
const { buildAllowedImportSet, resolveImportModule } = require('./vm/import_policy');
const { sanitizeGlobalsForExecution } = require('./vm/global_sanitizer');
const { isTrustedGlobalName } = require('./vm/global_trust');
const { initGlobalsWithBuiltins } = require('./vm/global_init');
const { createExecutionBudget, consumeExecutionBudget, consumeExecutionBudgetBatch } = require('./vm/execution_budget');
const { callClosureWithExecutionContext } = require('./vm/closure_exec_context');
const publicVmMainBridge = require('./vm/public_vm_main_bridge');
const { runVmCli } = require('./vm/vm_cli_entry');

// Import full parser (supports type annotations)
let FullParser = null;
try {
    FullParser = require('../../dist/core/parser.js').Parser;
} catch (e) {
    // If compiled version is not available, use built-in simplified version
}

const { prepareCallCapturedVars, resolveCallSharedCaptured } = require('./vm/closure_ops');

const { OP } = require('./vm/opcodes');
const { SeedLangError } = require('./vm/errors');
const { Parser } = require('./vm/parser');

const _EXEC_BUDGET_TIME_SLICE = 4096;

const { hydrateBuiltinGlobals: _hydrateBuiltinGlobals } = require('./vm/fast_builtin_ops');
const { wirePatternMatchOps } = require('./vm/pattern_match_ops');
const { wireFrameOps } = require('./vm/frame_ops');
const { wireJitCompiler } = require('./vm/jit_compiler');
const { wireJitFastPath } = require('./vm/jit_fast_path');
const { wireRunFromIp } = require('./vm/run_from_ip');
const { wireExecuteOpInline } = require('./vm/execute_op_inline');
const { wireRunFull } = require('./vm/run_full');
const { wireRunFast } = require('./vm/run_fast');
const { wireRunEntry } = require('./vm/run_entry');

const { Compiler } = require('./vm/compiler');
const { convertAst } = require('./vm/ast_helpers');
const { MAX_FRAME_DEPTH, DEFAULT_OPERAND_STACK_SIZE } = require('./vm/frame_limits');

class VM {
    constructor(options = {}) {
        this._stackBuf = new Array(DEFAULT_OPERAND_STACK_SIZE);
        this._sp = 0;
        this._fp = 0;
        this.stack = this._stackBuf;
        this._stackPool = [];
        this._stackPoolMax = 16;
        this._fr = {
            ips: new Array(MAX_FRAME_DEPTH),
            fps: new Array(MAX_FRAME_DEPTH),
            sps: new Array(MAX_FRAME_DEPTH),
            locals: new Array(MAX_FRAME_DEPTH),
            capturedVars: new Array(MAX_FRAME_DEPTH),
            sharedCaptured: new Array(MAX_FRAME_DEPTH),
            codes: new Array(MAX_FRAME_DEPTH),
            consts: new Array(MAX_FRAME_DEPTH),
            vars: new Array(MAX_FRAME_DEPTH),
            simple: new Uint8Array(MAX_FRAME_DEPTH),
            cvArrs: new Array(MAX_FRAME_DEPTH),
            closures: new Array(MAX_FRAME_DEPTH),
            sf: new Array(MAX_FRAME_DEPTH * 5),
            sfSelf: new Array(MAX_FRAME_DEPTH * 3),
            stacks: new Array(MAX_FRAME_DEPTH),
            globalValsArrs: new Array(MAX_FRAME_DEPTH)
        };
        this._frameIps = this._fr.ips;
        this._frameFps = this._fr.fps;
        this._frameSps = this._fr.sps;
        this._frameLocals = this._fr.locals;
        this._frameCapturedVars = this._fr.capturedVars;
        this._frameSharedCaptured = this._fr.sharedCaptured;
        this._frameCodes = this._fr.codes;
        this._frameConsts = this._fr.consts;
        this._frameVars = this._fr.vars;
        this._frameSimple = this._fr.simple;
        this._frameCvArrs = this._fr.cvArrs;
        this._frameClosures = this._fr.closures;
        this._frameTop = 0;
        this._emptyLocals = [{}];
        this.globals = Object.create(null);
        this._globalValsDirty = false;
        this._cachedResult = { success: true, output: this.output };
        this.output = [];
        this.dir = process.cwd();
        this.strict = options.strict || false;
        this.preserveGlobals = options.preserveGlobals !== false;
        this._seedGraphicsState = null;
        this._seedGraphicsHost = null;
        this.builtins = createVMBuiltins(this);
        this.modules = createVMModules(this);
        this._allowSensitiveImports = options.allowSensitiveImports === true || options.safeMode === false;
        this._allowedImportSet = this._buildAllowedImportSet(options.allowedImports, this._allowSensitiveImports);
        this._ownerCtor = options._ownerCtor || null;
        this._initGlobalsWithBuiltins();
        this.callStack = [];
        this.frames = [];
        this.tryStack = [];
        
        this._propCache = new Map();
        this._propCacheMaxSize = 1024;
        this._propCacheHits = 0;
        this._propCacheMisses = 0;
        this._safetyEnabled = options.safeMode !== false;
        this._safetyFastPath = !this._safetyEnabled;
        this._executionGuardEnabled = options.executionGuard !== false;
        this._runtimeGuardOverridesActive = false;
        const maxInstructions = Number(options.maxInstructions);
        this._maxInstructions = Number.isFinite(maxInstructions) && maxInstructions > 0 ? Math.floor(maxInstructions) : 50000000;
        const maxExecutionMs = Number(options.maxExecutionMs);
        this._maxExecutionMs = Number.isFinite(maxExecutionMs) && maxExecutionMs > 0 ? Math.floor(maxExecutionMs) : 10000;
        const maxRangeItems = Number(options.maxRangeItems);
        this._maxRangeItems = Number.isFinite(maxRangeItems) && maxRangeItems > 0 ? Math.floor(maxRangeItems) : 1000000;
        const maxArrayIndex = Number(options.maxArrayIndex);
        this._maxArrayIndex = Number.isFinite(maxArrayIndex) && maxArrayIndex >= 0 ? Math.floor(maxArrayIndex) : 1000000;
        
        this._jitCompiledCache = new Map();
        
        // 集成运行时安全检查
        if (this._safetyEnabled) {
            const { RuntimeSafety } = require('../safety/runtime-safety.js');
            this.safety = new RuntimeSafety({
                strict: options.strictMode || false,
                checkBounds: options.checkBounds !== false,
                checkTypes: options.checkTypes !== false,
                checkNull: options.checkNull !== false
            });
        }
        
        // 集成JIT编译器
        if (options.jit !== false) {
            try {
                const { JITCompiler } = require('../jit/compiler.js');
                this.jit = new JITCompiler({
                    enabled: options.jitEnabled !== false,
                    hotspotThreshold: options.hotspotThreshold || 50,
                    optimizationLevel: options.optimizationLevel || 2
                });
                const { TailCallOptimizer } = require('../jit/tail-call.js');
                this._tco = new TailCallOptimizer();
            } catch(e) { /* TCO optional */ }
        } else {
            try { const { TailCallOptimizer } = require('../jit/tail-call.js'); this._tco = new TailCallOptimizer(); } catch(e) { /* TCO optional */ }
        }
        
        // 集成并发安全系统
        if (options.concurrent !== false) {
            const { AISessionManager, IsolatedContext, ConcurrentSafeVM } = require('../concurrent/index.js');
            this.aiSessionManager = new AISessionManager();
            this.isolatedContext = new IsolatedContext('main', options);
            this.concurrentSafeVM = new ConcurrentSafeVM();
        }
        
        // 集成异步运行时
        if (options.async !== false) {
            const { AsyncRuntime, EventLoop, AsyncQueue } = require('../async/runtime.js');
            this.asyncRuntime = new AsyncRuntime();
            this.eventLoop = new EventLoop();
            this.asyncQueue = new AsyncQueue();
        }
        
        // 集成沙箱隔离系统
        if (options.sandbox) {
            const { Sandbox } = require('../sandbox/index.js');
            this.sandbox = new Sandbox(options.sandbox);
        }
        
        // 集成WebAssembly加载器
        if (options.wasm !== false) {
            const { WASMLoader } = require('../wasm/loader.js');
            this.wasmLoader = new WASMLoader();
        }
        
        // 集成AI集成模块
        if (options.ai) {
            const { AIIntegration } = require('../ai/integration.js');
            this.aiIntegration = new AIIntegration(options.ai);
        }
        
        // 集成模块系统
        if (options.modules !== false) {
            const { ModuleSystem } = require('../modules/system.js');
            this.moduleSystem = new ModuleSystem();
        }

        this._fastRun = null;
    }

    _buildAllowedImportSet(allowedImports, allowSensitiveImports = this._allowSensitiveImports) {
        return buildAllowedImportSet(this.modules, allowedImports, allowSensitiveImports);
    }

    _resolveImportModule(name) {
        return resolveImportModule(this.modules, this._allowedImportSet, name, this._ownerCtor);
    }
    
    _initGlobalsWithBuiltins() {
        initGlobalsWithBuiltins(this);
    }

    _isTrustedGlobalName(name) {
        return isTrustedGlobalName(this._globalsWithBuiltins, name);
    }

    _sanitizeGlobalsForExecution() {
        sanitizeGlobalsForExecution(this.globals, (name) => this._isTrustedGlobalName(name));
    }

    _createExecutionBudget() {
        return createExecutionBudget(this._executionGuardEnabled, this._maxInstructions, this._maxExecutionMs, _EXEC_BUDGET_TIME_SLICE);
    }

    _consumeExecutionBudget(budget) {
        return consumeExecutionBudget(budget, this._maxInstructions, this._maxExecutionMs, _EXEC_BUDGET_TIME_SLICE);
    }

    _consumeExecutionBudgetBatch(budget, steps) {
        return consumeExecutionBudgetBatch(budget, steps, this._maxInstructions, this._maxExecutionMs, _EXEC_BUDGET_TIME_SLICE);
    }
    
    _callClosure(fn, args) {
        return callClosureWithExecutionContext(this, fn, args, prepareCallCapturedVars, OP.HALT);
    }
    
    initBuiltins() {
        return createRuntimeBuiltins(this, {
            isInternalMetaKey,
            decodeSeedObjectKey,
            isDangerousObjectKey
        });
    }
    
    _coroutineResume(coro, arg) {
        const result = resumeCoroutine(this, coro, arg, OP);
        if (result && result._coroPending) {
            const pendingPromise = result._coroPending;
            const coroObj = result.coro;
            return pendingPromise.then(resolvedValue => {
                coroObj.stack.push(resolvedValue);
                coroObj._pendingPromise = null;
                return this._coroutineResume(coroObj, null);
            }).catch(err => {
                coroObj.state = 'done';
                return null;
            });
        }
        return result;
    }
    
    _coroutineStatus(coro) {
        return getCoroutineStatus(coro);
    }
    
    static _isReturnOp(op) {
        return isReturnOpcodeValue(op);
    }
    static _isComputedReturnOp(op) {
        return isComputedReturnOpcodeValue(op);
    }
    
    initModules() {
        return createRuntimeModules(this, {
            fs,
            path,
            http,
            https,
            OP,
            prepareCallCapturedVars,
            resolveCallSharedCaptured
        });
    }

    _validateJitConsts(consts) {
        return validateJitConsts(consts);
    }

    _safeNewFunction(argNames, body) {
        return safeNewFunction(argNames, body);
    }

    _saveCache() {
        const gv = this._globalVals;
        this._globalCache = gv.slice();
        if (this.output.length > 0) {
            this._outputCache = this.output.slice();
        } else {
            this._outputCache = null;
        }
        this._needCacheSave = false;
        this._cachedResult = { success: true, output: this.output };
    }
    
    _gv(name) {
        const gVals = this._globalNameIdx && this._globalVals ? this._globalVals : null;
        if (gVals) {
            const idx = this._globalNameIdx.get(name);
            if (idx >= 0) return gVals[idx];
        }
        return this.globals[name];
    }
    
    async runAsync(bc) {
        let result = this.run(bc);
        
        while (result.pending) {
            try {
                const value = await result.pending;
                if (this._coroPendingResume) {
                    const coroResume = this._coroPendingResume;
                    this._coroPendingResume = null;
                    coroResume.coro.stack.push(value);
                    coroResume.coro._pendingPromise = null;
                    const resumeResult = this._coroutineResume(coroResume.coro, null);
                    if (resumeResult && typeof resumeResult.then === 'function') {
                        result = await resumeResult;
                    } else {
                        if (resumeResult && resumeResult._coroPending) {
                            result = { pending: resumeResult._coroPending };
                        } else {
                            this.stack[coroResume.savedSp] = resumeResult;
                            result = this.runFull(bc);
                        }
                    }
                } else if (this._awaitResume) {
                    this._awaitResolvedValue = value;
                    result = this.runFull(bc);
                } else {
                    if (result.state) {
                        this._restoreState(result.state);
                        if (typeof result.state.sp === 'number') {
                            this.stack.length = result.state.sp;
                        }
                    }
                    this.stack.push(value);
                    result = this.runFromIp();
                }
            } catch (error) {
                return { success: false, error: String(error), output: this.output };
            }
        }
        
        return result;
    }
    
    push(v) { this.stack.push(v); }
    pop() { return this.stack.pop(); }
}

wirePatternMatchOps(VM.prototype);
wireFrameOps(VM.prototype);
wireJitCompiler(VM.prototype);
wireJitFastPath(VM.prototype);
wireRunFromIp(VM.prototype);
wireExecuteOpInline(VM.prototype);
wireRunFull(VM.prototype);
wireRunFast(VM.prototype);
wireRunEntry(VM.prototype);

const _publicVmRuntimeBindings = publicVmMainBridge.createPublicVmRuntimeBindings({
    SeedLangErrorCtor: SeedLangError,
    hydrateBuiltinGlobals: _hydrateBuiltinGlobals,
    hardenArrayObject,
    FullParserCtor: FullParser,
    ParserCtor: Parser,
    CompilerCtor: Compiler,
    VMCtor: VM,
    convertAst
});
const _initializeVmOwner = _publicVmRuntimeBindings.initializeOwner;
const _globalBcCache = _publicVmRuntimeBindings.globalBcCache;
const _globalJitCache = _publicVmRuntimeBindings.globalJitCache;

class SeedLangVM {
    constructor(options = {}) {
        _initializeVmOwner(this, options);
    }
}

const _publicVmOwnerDelegates = publicVmMainBridge.createPublicVmOwnerDelegates(_publicVmRuntimeBindings, SeedLangVM);
publicVmMainBridge.wirePublicVmPrototype(SeedLangVM, _publicVmOwnerDelegates);

// CLI
if (require.main === module) {
    runVmCli(SeedLangVM, fs, process, console);
}

module.exports = { SeedLangVM, Compiler, VM, Parser, OP, _globalBcCache, _globalJitCache };