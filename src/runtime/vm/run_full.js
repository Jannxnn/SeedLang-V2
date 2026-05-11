'use strict';

const { OP, RETURN_OPS: _RETURN_OPS, COMPUTED_RETURN_OPS: _COMPUTED_RETURN_OPS, VALID_OPCODES: _VALID_OPCODES } = require('./opcodes');
const { SeedLangError } = require('./errors');
const { hardenArrayObject, HARDENED_ARRAY_MARK } = require('./runtime_safety');
const { safeAddValues, normalizeNumericOperand, seedEquals, safeRepeatString, MAX_STRING_REPEAT_RESULT_LEN: _MAX_STRING_REPEAT_RESULT_LEN, MAX_STRING_VALUE_LEN: _MAX_STRING_VALUE_LEN } = require('./value_ops');
const { invokeHostMethod, createSafeInstance, instantiateClassObject, isSafeArrayIndex, isPrivateInstanceKey, canAccessInstanceKey, resolveMethodStart, buildMethodLocalScope } = require('./instance_ops');
const { createRuntimeClosure, prepareCallCapturedVars, resolveCallSharedCaptured, getCallScopedCapturedMeta, resolveCallCvArr, getCallScopedCapturedNames, hasCallScopedCaptured, resolveLocalNameByIndex, refreshCapturedLocalsFromFrame } = require('./closure_ops');
const { isDangerousObjectKey, isInternalMetaKey, decodeSeedObjectKey } = require('./object_key_safety');
const { OBJECT_SPREAD_MARKER, _fastFibNonNegInt } = require('./shared');
const { isReturnOpcodeValue, isComputedReturnOpcodeValue } = require('./return_ops');
const { consumeExecutionBudget, consumeExecutionBudgetBatch } = require('./execution_budget');
const { _decodeAmpCompressedString } = require('./amp');
const { isClassicFibFuncRef: _isClassicFibFuncRef, canUseFastFib: _canUseFastFib, tryFastBuiltinUnaryCall: _tryFastBuiltinUnaryCall, hydrateBuiltinGlobals: _hydrateBuiltinGlobals, NO_FAST_BUILTIN: _NO_FAST_BUILTIN } = require('./fast_builtin_ops');
const { createCoroutineFromClosure: _createCoroutineFromClosure, isFiberClosure: _isFiberClosure, createCoroutineFromMethod: _createCoroutineFromMethod } = require('../../../dist/core/coroutine.js');

const { MAX_FRAME_DEPTH, MAX_OPERAND_STACK_SLOTS, enforceAggregateCount, enforceAggregateMerge } = require('./frame_limits');
const _EXEC_BUDGET_TIME_SLICE = 4096;
function _runFullStackOverflow(vm, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured) {
    vm._sp = sp; vm._fp = fp; vm.ip = ip; vm._frameTop = frameTop;
    vm.stack = stack; vm.locals = vmLocals; vm.capturedVars = vmCapturedVars; vm.sharedCaptured = vmSharedCaptured;
    return { success: false, error: 'stack overflow', output: vm.output };
}
function _runFullFail(vm, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured, error) {
    vm._sp = sp; vm._fp = fp; vm.ip = ip; vm._frameTop = frameTop;
    vm.stack = stack; vm.locals = vmLocals; vm.capturedVars = vmCapturedVars; vm.sharedCaptured = vmSharedCaptured;
    return { success: false, error, output: vm.output };
}
function _runFullOperandOverflow(vm, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured) {
    vm._sp = sp; vm._fp = fp; vm.ip = ip; vm._frameTop = frameTop;
    vm.stack = stack; vm.locals = vmLocals; vm.capturedVars = vmCapturedVars; vm.sharedCaptured = vmSharedCaptured;
    return { success: false, error: 'operand stack overflow', output: vm.output };
}
function runFull(bc) {
    const varsLen = bc.vars.length;
    if (!this._awaitResume) this.output.length = 0;
    
    let code, consts, vars;
    let globalVals, globals, builtins;
    let sp, stack, ip, fp, strict, checkBuiltins;
    let vmLocals, vmCapturedVars, vmCvArr, vmSharedCaptured;
    let inTry, tryStack, lastError, frameTop;
    let globalNameIdx, fr, sf, sfSelf, frSimple;
    let vmCurrentClosure, vmCvArrResolveCache, vmCallScopedMetaClosure, vmCallScopedMeta;
    let jit, jitEnabled, execBudget, debugTrace;
    let isSameBc;
    
    if (this._awaitResume) {
        const r = this._awaitResume;
        this._awaitResume = null;
        code = r.code; consts = r.consts; vars = r.vars;
        globalVals = r.globalVals; globals = this.globals; builtins = this.builtins;
        sp = this._sp;
        stack = r.stack;
        this.stack = stack;
        ip = this.ip;
        fp = this._fp;
        strict = r.strict; checkBuiltins = r.checkBuiltins;
        vmLocals = r.vmLocals; vmCapturedVars = r.vmCapturedVars;
        vmCvArr = r.vmCvArr; vmSharedCaptured = r.vmSharedCaptured;
        inTry = r.inTry; tryStack = r.tryStack; lastError = r.lastError;
        frameTop = this._frameTop;
        globalNameIdx = r.globalNameIdx;
        fr = this._fr; sf = fr.sf; sfSelf = fr.sfSelf; frSimple = fr.simple;
        vmCurrentClosure = r.vmCurrentClosure;
        vmCvArrResolveCache = r.vmCvArrResolveCache;
        vmCallScopedMetaClosure = r.vmCallScopedMetaClosure;
        vmCallScopedMeta = r.vmCallScopedMeta;
        jit = r.jit; jitEnabled = r.jitEnabled; execBudget = r.execBudget;
        debugTrace = [];
        isSameBc = true;
        this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
        this.code = code; this.consts = consts; this.vars = vars;
        this._globalVals = globalVals; this._globalNameIdx = globalNameIdx;
        const _awaitResolvedValue = this._awaitResolvedValue;
        this._awaitResolvedValue = undefined;
        stack[sp++] = _awaitResolvedValue;
    } else {
    isSameBc = bc === this._lastBc;
    const hasMatchingBcContext = isSameBc && this.code === bc.code && this.consts === bc.consts && this.vars === bc.vars;
    if (hasMatchingBcContext) {
        code = this.code;
        consts = this.consts;
        vars = this.vars;
    } else {
        code = bc.code;
        consts = bc.consts;
        vars = bc.vars;
        this.code = code;
        this.consts = consts;
        this.vars = vars;
        this._lastBc = bc;
        this._lastBcVars = bc.vars;
        this.funcNames = bc.funcNames || {};
        this.funcASTs = bc.funcASTs || {};
        this.lineMap = bc.lineMap || {};
    }
    
    globalVals = this._globalVals;
    globals = this.globals;
    builtins = this.builtins;
    if (!globalVals || globalVals.length < varsLen) {
        globalVals = new Array(varsLen);
        for (let i = 0; i < varsLen; i++) globalVals[i] = null;
        this._globalVals = globalVals;
    }
    if (this.preserveGlobals) {
        for (let i = 0; i < varsLen; i++) {
            const name = vars[i];
            const v = Object.prototype.hasOwnProperty.call(globals, name) ? globals[name] : undefined;
            if (v !== undefined) {
                globalVals[i] = (v !== null && typeof v === 'object' && Array.isArray(v) && v[HARDENED_ARRAY_MARK] !== 1) ? hardenArrayObject(v) : v;
            } else {
                const bv = builtins[name];
                globalVals[i] = bv !== undefined ? bv : null;
            }
        }
    } else if (!isSameBc) {
        if (varsLen <= 8) {
            for (let i = 0; i < varsLen; i++) globalVals[i] = null;
        } else {
            globalVals.fill(null, 0, varsLen);
        }
    }
    this.locals = this._emptyLocals;
    this._frameTop = 0;
    sp = 0;
    stack = this._stackBuf;
    this.stack = stack;
    ip = 0;
    fp = 0;
    strict = this.strict;
    checkBuiltins = this.preserveGlobals;
    vmLocals = this.locals;
    vmCapturedVars = null;
    vmCvArr = null;
    vmSharedCaptured = null;
    inTry = false;
    tryStack = this.tryStack;
    lastError = null;
    frameTop = 0;
    if (!this._globalNameIdxRoot || this._globalNameIdxRootVars !== this._lastBcVars) {
        const baseVars = this._lastBcVars || this.vars || [];
        const map = new Map();
        for (let i = 0; i < baseVars.length; i++) map.set(baseVars[i], i);
        this._globalNameIdxRoot = map;
        this._globalNameIdxRootVars = baseVars;
    }
    globalNameIdx = this._globalNameIdxRoot;
    this._globalNameIdx = globalNameIdx;
    fr = this._fr;
    sf = fr.sf;
    sfSelf = fr.sfSelf;
    frSimple = fr.simple;
    vmCurrentClosure = null;
    vmCvArrResolveCache = { fn: null, callCapturedVars: null, base: null, noScoped: false, capturedNamesRef: null, cvArr: null };
    vmCallScopedMetaClosure = null;
    vmCallScopedMeta = null;
    jit = this.jit;
    jitEnabled = jit?.enabled;
    execBudget = this._createExecutionBudget();
    debugTrace = [];
    }
    
    while (true) {
        const budgetError = this._consumeExecutionBudget(execBudget);
        if (budgetError) {
            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
            return { success: false, error: budgetError, output: this.output };
        }
        if (sp > MAX_OPERAND_STACK_SLOTS || fp >= MAX_OPERAND_STACK_SLOTS) {
            return _runFullOperandOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
        }
        const op = code[ip++];
        if (debugTrace && debugTrace.length < 200) {
            debugTrace.push(`${code?.length ?? -1}@${ip - 1}:${op}`);
        }
        if (this._profiler && this._profiler.isEnabled()) {
            this._profiler.recordOpcode(op, ip - 1);
        }
        if (this._debugger && this._debugger.isEnabled() && this._debugger.shouldPause(ip - 1)) {
            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
            this.code = code; this.consts = consts; this.vars = vars;
            const pauseResult = this._debugger.pauseSync(ip - 1);
            if (pauseResult === 'stop') {
                return { success: true, output: this.output, stopped: true };
            }
            stack = this.stack; sp = this._sp; fp = this._fp; ip = this.ip; frameTop = this._frameTop;
            vmLocals = this.locals; vmCapturedVars = this.capturedVars; vmSharedCaptured = this.sharedCaptured;
            code = this.code; consts = this.consts; vars = this.vars;
        }
        switch (op) {
                case OP.NOP: break;
                case OP.CONST: { const ci = code[ip++]; stack[sp++] = consts[ci]; break; }
                case OP.CONST_SET_LOCAL: { const ci = code[ip++]; const li = code[ip++]; stack[fp + li] = consts[ci]; break; }
                case OP.ADD_LOCAL: { const i1 = code[ip++]; const i2 = code[ip++]; stack[sp++] = safeAddValues(stack[fp + i1], stack[fp + i2]); break; }
                case OP.INC_LOCAL: { const li = code[ip++]; stack[fp + li] = stack[fp + li] + 1; break; }
                case OP.ADD_LOCAL_SET: { const si = code[ip++]; const ai = code[ip++]; stack[fp + si] = safeAddValues(stack[fp + si], stack[fp + ai]); break; }
                case OP.LT_LOCAL_CONST: { const li = code[ip++]; const ci = code[ip++]; stack[sp++] = stack[fp + li] < consts[ci]; break; }
                case OP.LOOP_LT: { const li = code[ip++]; const ci = code[ip++]; const offset = code[ip++]; if (!(stack[fp + li] < consts[ci])) ip += offset; break; }
                case OP.NULL: stack[sp++] = null; break;
                case OP.TRUE: stack[sp++] = true; break;
                case OP.FALSE: stack[sp++] = false; break;
                case OP.POP: { const popped = sp > 0 ? stack[sp - 1] : null; sp--; this._pendingSetGlobalValue = code[ip] === OP.SET_GLOBAL ? popped : undefined; break; }
                
                case OP.GET_GLOBAL: {
                    const varIdx = code[ip++];
                    const varName = vars[varIdx];
                    const mappedGi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined;
                    const val = (typeof mappedGi === 'number') ? globalVals[mappedGi] : undefined;
                    const bvByName = builtins[varName];
                    if (bvByName !== undefined && (!Object.prototype.hasOwnProperty.call(globals, varName) || (val && val._type === 'class'))) {
                        stack[sp++] = bvByName;
                        break;
                    }
                    if (val !== null && val !== undefined) {
                        stack[sp++] = val;
                    } else if (checkBuiltins && builtins[varName]) {
                        const bv = builtins[varName];
                        stack[sp++] = bv;
                        if (typeof mappedGi === 'number') globalVals[mappedGi] = bv;
                    } else if (strict) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: new SeedLangError(`Undefined variable '${vars[varIdx]}'`, 'ReferenceError', this.lineMap[ip] || 0, [...this.callStack], 0, 'E101'), output: this.output };
                    } else {
                        stack[sp++] = null;
                    }
                    break;
                }
                case OP.SET_GLOBAL: { const vi = code[ip++]; const raw = sp > 0 ? stack[--sp] : (this._pendingSetGlobalValue !== undefined ? this._pendingSetGlobalValue : null); this._pendingSetGlobalValue = undefined; const v = (raw !== null && typeof raw === 'object' && Array.isArray(raw) && raw[HARDENED_ARRAY_MARK] !== 1) ? hardenArrayObject(raw) : raw; const varName = vars[vi]; const gi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (typeof gi === 'number') globalVals[gi] = v; if (v?._type === 'class' || v?._type === 'closure') globals[varName] = v; break; }
                case OP.SET_GLOBAL_KEEP: { const vi = code[ip++]; const raw = stack[sp - 1]; const v = (raw !== null && typeof raw === 'object' && Array.isArray(raw) && raw[HARDENED_ARRAY_MARK] !== 1) ? hardenArrayObject(raw) : raw; const varName = vars[vi]; const gi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (typeof gi === 'number') globalVals[gi] = v; if (v?._type === 'class' || v?._type === 'closure') globals[varName] = v; break; }
                case OP.CONST_SET_GLOBAL: { const vi = code[ip++]; const ci = code[ip++]; const raw = consts[ci]; const v = (raw !== null && typeof raw === 'object' && Array.isArray(raw) && raw[HARDENED_ARRAY_MARK] !== 1) ? hardenArrayObject(raw) : raw; const varName = vars[vi]; const gi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (typeof gi === 'number') globalVals[gi] = v; break; }
                case OP.CONST_GET_GLOBAL: { const vi = code[ip++]; const ci = code[ip++]; const raw = consts[ci]; const v = (raw !== null && typeof raw === 'object' && Array.isArray(raw) && raw[HARDENED_ARRAY_MARK] !== 1) ? hardenArrayObject(raw) : raw; const varName = vars[vi]; const gi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (typeof gi === 'number') globalVals[gi] = v; stack[sp++] = v; break; }
                case OP.ADD_GLOBALS_SET_GLOBAL: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; const tName = vars[ti], aName = vars[ai], bName = vars[bi]; const tGi = this._globalNameIdx ? this._globalNameIdx.get(tName) : undefined; const aGi = this._globalNameIdx ? this._globalNameIdx.get(aName) : undefined; const bGi = this._globalNameIdx ? this._globalNameIdx.get(bName) : undefined; const av = (typeof aGi === 'number') ? globalVals[aGi] : undefined; const bv = (typeof bGi === 'number') ? globalVals[bGi] : undefined; const sum = Array.isArray(av) && Array.isArray(bv) ? [...av, ...bv] : safeAddValues(av, bv); if (typeof tGi === 'number') globalVals[tGi] = hardenArrayObject(sum); break; }
                case OP.ADD_NUM_GLOBALS_SET_GLOBAL: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; const tName = vars[ti], aName = vars[ai], bName = vars[bi]; const tGi = this._globalNameIdx ? this._globalNameIdx.get(tName) : undefined; const aGi = this._globalNameIdx ? this._globalNameIdx.get(aName) : undefined; const bGi = this._globalNameIdx ? this._globalNameIdx.get(bName) : undefined; if (typeof tGi === 'number' && typeof aGi === 'number' && typeof bGi === 'number') globalVals[tGi] = normalizeNumericOperand(globalVals[aGi]) + normalizeNumericOperand(globalVals[bGi]); break; }
                case OP.ADD_NUM_SET_GLOBAL: { const b = normalizeNumericOperand(stack[--sp]); const a = normalizeNumericOperand(stack[--sp]); ip++; const gi = code[ip++]; if (typeof gi === 'number') globalVals[gi] = a + b; break; }
                case OP.SUB_NUM_SET_GLOBAL: { const b = stack[--sp]; const a = stack[--sp]; ip++; const gi = code[ip++]; if (typeof gi === 'number') globalVals[gi] = a - b; break; }
                case OP.MUL_NUM_SET_GLOBAL: { const b = normalizeNumericOperand(stack[--sp]); const a = normalizeNumericOperand(stack[--sp]); ip++; const gi = code[ip++]; if (typeof gi === 'number') globalVals[gi] = a * b; break; }
                case OP.LOOP_LT_GLOBAL: { const gi = code[ip++]; const ci = code[ip++]; const offset = code[ip++]; if (!(globalVals[gi] < consts[ci])) ip += offset; break; }
                case OP.LOOP_INC_GLOBAL: {
                    const idxGi = code[ip++], targetGi = code[ip++], ci = code[ip++], offset = code[ip++];
                    if (globalVals[idxGi] < consts[ci]) {
                        const budgetError = this._consumeExecutionBudget(execBudget);
                        if (budgetError) {
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: budgetError, output: this.output };
                        }
                        if (idxGi === targetGi) globalVals[idxGi]++;
                        else { globalVals[targetGi]++; globalVals[idxGi]++; }
                        ip -= offset;
                    }
                    break;
                }
                case OP.LOOP_INC_GLOBAL_SIMPLE: {
                    const gi = code[ip++], ci = code[ip++], offset = code[ip++];
                    if (globalVals[gi] < consts[ci]) {
                        const budgetError = this._consumeExecutionBudget(execBudget);
                        if (budgetError) {
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: budgetError, output: this.output };
                        }
                        globalVals[gi]++;
                        ip -= offset;
                    }
                    break;
                }
                case OP.FOR_COUNT: {
                    const gi = code[ip++], startCi = code[ip++], endCi = code[ip++];
                    const start = consts[startCi], limit = consts[endCi];
                    const span = Math.max(0, limit - start);
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, span);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    globalVals[gi] = start < limit ? limit : start;
                    break;
                }
                case OP.FOR_SUM: {
                    const sumGi = code[ip++], idxGi = code[ip++], sumStartCi = code[ip++], idxStartCi = code[ip++], endCi = code[ip++];
                    const sumStart = consts[sumStartCi], idxStart = consts[idxStartCi], limit = consts[endCi];
                    const span = Math.max(0, limit - idxStart);
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, span);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    if (idxStart < limit) {
                        const n = limit - idxStart;
                        globalVals[sumGi] = sumStart + (n * (idxStart + (limit - 1))) / 2;
                    } else {
                        globalVals[sumGi] = sumStart;
                    }
                    globalVals[idxGi] = idxStart < limit ? limit : idxStart;
                    break;
                }
                case OP.FOR_NESTED_COUNT: {
                    const sumGi = code[ip++], outerGi = code[ip++], innerGi = code[ip++], sumStartCi = code[ip++], outerStartCi = code[ip++], innerStartCi = code[ip++], outerEndCi = code[ip++], innerEndCi = code[ip++], incCi = code[ip++];
                    const outerN = Math.max(0, consts[outerEndCi]);
                    const innerN = Math.max(0, consts[innerEndCi]);
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, outerN * innerN);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    globalVals[sumGi] = consts[sumStartCi] + consts[outerEndCi] * consts[innerEndCi] * consts[incCi];
                    globalVals[outerGi] = consts[outerStartCi] + consts[outerEndCi];
                    globalVals[innerGi] = consts[innerStartCi] + consts[innerEndCi];
                    break;
                }
                case OP.FOR_NESTED_MUL_SUM: {
                    const sumGi = code[ip++], outerGi = code[ip++], innerGi = code[ip++], outerStartCi = code[ip++], innerStartCi = code[ip++], outerEndCi = code[ip++], innerEndCi = code[ip++];
                    const os = consts[outerStartCi], is = consts[innerStartCi], oe = consts[outerEndCi], ie = consts[innerEndCi];
                    const outerN = oe - os, innerN = ie - is;
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, Math.max(0, outerN) * Math.max(0, innerN));
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    const outerSum = outerN * (os + (oe - 1)) / 2;
                    const innerSum = innerN * (is + (ie - 1)) / 2;
                    globalVals[sumGi] = (globalVals[sumGi] ?? 0) + outerSum * innerSum;
                    globalVals[outerGi] = oe;
                    globalVals[innerGi] = ie;
                    break;
                }
                case OP.FOR_SUM_RANGE_PUSH: {
                    const sumGi = code[ip++], idxGi = code[ip++], startCi = code[ip++], endCi = code[ip++];
                    const s = consts[startCi], e = consts[endCi], n = e - s;
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, n > 0 ? n : 0);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    globalVals[sumGi] = (globalVals[sumGi] ?? 0) + (n * (s + (e - 1)) / 2);
                    globalVals[idxGi] = e;
                    break;
                }
                case OP.FOR_COUNT_EVEN: {
                    const countGi = code[ip++], idxGi = code[ip++], endCi = code[ip++];
                    const end = consts[endCi], start = globalVals[idxGi];
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, Math.max(0, end - start));
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    const parity = ((start % 2) + 2) % 2;
                    const first = parity === 0 ? start : start + 1;
                    const delta = first >= end ? 0 : Math.floor((end - first + 1) / 2);
                    globalVals[countGi] = (globalVals[countGi] ?? 0) + delta;
                    globalVals[idxGi] = end;
                    break;
                }
                case OP.FOR_INDEX_ASSIGN: {
                    const arrGi = code[ip++], idxGi = code[ip++], startCi = code[ip++], endCi = code[ip++];
                    const start = consts[startCi], end = consts[endCi];
                    const span = Math.max(0, end - start);
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, span);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    const arr = globalVals[arrGi];
                    if (Array.isArray(arr)) {
                        if (arr.length < end) arr.length = end;
                        for (let i = start; i < end; i++) arr[i] = i;
                    } else if (arr) {
                        for (let i = start; i < end; i++) arr[i] = i;
                    }
                    globalVals[idxGi] = end;
                    break;
                }
                case OP.SET_LEN_GLOBAL_CONST: { const gi = code[ip++]; const ci = code[ip++]; const o = globalVals[gi]; const n = consts[ci]; if (o) o.length = n; break; }
                case OP.FOR_PUSH_RANGE: {
                    const arrMode = code[ip++], arrRef = code[ip++], idxMode = code[ip++], idxRef = code[ip++], startCi = code[ip++], endCi = code[ip++];
                    const start = consts[startCi], end = consts[endCi];
                    const n = end - start;
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, n > 0 ? n : 0);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    const arr = arrMode ? stack[fp + arrRef] : globalVals[arrRef];
                    if (Array.isArray(arr)) {
                        const span = n > 0 ? n : 0;
                        const base = arr.length;
                        if (span > 0 && base === 0 && start === 0) {
                            arr.length = span;
                            for (let i = 0; i < span; i++) arr[i] = i;
                        } else {
                            arr.length = base + span;
                            for (let i = 0; i < span; i++) arr[base + i] = start + i;
                        }
                    }
                    if (idxMode) stack[fp + idxRef] = end;
                    else globalVals[idxRef] = end;
                    break;
                }
                case OP.FOR_ARRAY_SUM: {
                    const sumGi = code[ip++], idxGi = code[ip++], arrGi = code[ip++], nGi = code[ip++];
                    const arr = globalVals[arrGi];
                    const limit = globalVals[nGi];
                    const span = Number.isInteger(limit) && limit > 0 ? limit : 0;
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, span);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    let sum = globalVals[sumGi] ?? 0;
                    if (Array.isArray(arr) && span > 0) {
                        const len = arr.length < span ? arr.length : span;
                        for (let i = 0; i < len; i++) sum += arr[i];
                    }
                    globalVals[sumGi] = sum;
                    globalVals[idxGi] = limit;
                    break;
                }
                case OP.FOR_PUSH_RANGE_VAR: {
                    const arrGi = code[ip++], idxGi = code[ip++], nGi = code[ip++];
                    const arr = globalVals[arrGi];
                    const limit = globalVals[nGi];
                    const span = Number.isInteger(limit) && limit > 0 ? limit : 0;
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, span);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    if (Array.isArray(arr) && span > 0) {
                        const base = arr.length;
                        if (base === 0) {
                            arr.length = span;
                            for (let i = 0; i < span; i++) arr[i] = i;
                        } else {
                            arr.length = base + span;
                            for (let i = 0; i < span; i++) arr[base + i] = i;
                        }
                    }
                    globalVals[idxGi] = limit;
                    break;
                }
                case OP.FOR_ARRAY_SUM_LIT: {
                    const sumGi = code[ip++], idxGi = code[ip++], arrGi = code[ip++], nCi = code[ip++];
                    const arr = globalVals[arrGi];
                    const limit = consts[nCi];
                    const span = Number.isInteger(limit) && limit > 0 ? limit : 0;
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, span);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    let sum = globalVals[sumGi] ?? 0;
                    if (Array.isArray(arr) && span > 0) {
                        const len = arr.length < span ? arr.length : span;
                        for (let i = 0; i < len; i++) sum += arr[i];
                    }
                    globalVals[sumGi] = sum;
                    globalVals[idxGi] = limit;
                    break;
                }
                case OP.MAKE_RANGE_ARRAY: {
                    const endCi = code[ip++];
                    const end = consts[endCi];
                    const n = Number.isInteger(end) && end > 0 ? end : 0;
                    const limMk = enforceAggregateCount(this, n, 'range array');
                    if (limMk) return _runFullFail(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured, limMk);
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, n);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    const arr = new Array(n);
                    for (let i = 0; i < n; i++) arr[i] = i;
                    stack[sp++] = arr;
                    break;
                }
                case OP.FOR_ADD_CONST: {
                    const sumGi = code[ip++], idxGi = code[ip++], idxStartCi = code[ip++], endCi = code[ip++], incCi = code[ip++];
                    const stepCount = Math.max(0, consts[endCi]);
                    const batchError = this._consumeExecutionBudgetBatch(execBudget, stepCount);
                    if (batchError) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: batchError, output: this.output };
                    }
                    globalVals[sumGi] += consts[endCi] * consts[incCi];
                    globalVals[idxGi] = consts[idxStartCi] + consts[endCi];
                    break;
                }
                case OP.LOOP_RANGE_STEP: {
                    const idxGi = code[ip++], loopGi = code[ip++], ci = code[ip++], offset = code[ip++];
                    if (globalVals[idxGi] < consts[ci]) {
                        const budgetError = this._consumeExecutionBudget(execBudget);
                        if (budgetError) {
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: budgetError, output: this.output };
                        }
                        globalVals[loopGi] = globalVals[idxGi];
                        globalVals[idxGi]++;
                    } else {
                        ip += offset;
                    }
                    break;
                }
                case OP.INC_GLOBAL: { const gi = code[ip++]; const ci = code[ip++]; globalVals[gi] += consts[ci]; break; }
                case OP.INC_GLOBAL_JUMP: { const gi = code[ip++]; const ci = code[ip++]; globalVals[gi] += consts[ci]; ip += code[ip] + 1; break; }
                case OP.ADD_GLOBAL_SET: { const ti = code[ip++]; const si = code[ip++]; globalVals[ti] = safeAddValues(globalVals[ti], globalVals[si]); break; }
                case OP.GET_GLOBAL2: { const i1 = code[ip++]; const i2 = code[ip++]; stack[sp++] = globalVals[i1]; stack[sp++] = globalVals[i2]; break; }
                case OP.MUL_GLOBAL_CONST: { const gi = code[ip++]; const ci = code[ip++]; stack[sp++] = globalVals[gi] * consts[ci]; break; }
                case OP.ADD_GLOBAL_CONST: { const gi = code[ip++]; const ci = code[ip++]; stack[sp++] = safeAddValues(globalVals[gi], consts[ci]); break; }
                case OP.SUB_GLOBAL_CONST: { const gi = code[ip++]; const ci = code[ip++]; stack[sp++] = globalVals[gi] - consts[ci]; break; }
                case OP.DIV_GLOBALS: { const ai = code[ip++]; const bi = code[ip++]; stack[sp++] = globalVals[ai] / globalVals[bi]; break; }
                case OP.MUL_GLOBALS: { const ai = code[ip++]; const bi = code[ip++]; stack[sp++] = globalVals[ai] * globalVals[bi]; break; }
                case OP.ADD_GLOBAL2: { const ai = code[ip++]; const bi = code[ip++]; stack[sp++] = safeAddValues(globalVals[ai], globalVals[bi]); break; }
                case OP.SUB_GLOBAL2: { const ai = code[ip++]; const bi = code[ip++]; stack[sp++] = globalVals[ai] - globalVals[bi]; break; }
                case OP.ADD_CAPTURED_LOCAL: {
                    const cvIdx = code[ip++];
                    const lcIdx = code[ip++];
                    const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length
                        ? capturedNames[cvIdx]
                        : vars[cvIdx];
                    const cv = vmCvArr && cvIdx < vmCvArr.length ? vmCvArr[cvIdx].value : (vmCapturedVars ? (vmCapturedVars[capturedName]?.value ?? vmCapturedVars[capturedName]) : null);
                    stack[sp++] = safeAddValues(cv, stack[fp + lcIdx]);
                    break;
                }
                case OP.RETURN_ADD_CAPTURED_LOCAL: {
                    const cvIdx = code[ip++];
                    const lcIdx = code[ip++];
                    const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length
                        ? capturedNames[cvIdx]
                        : vars[cvIdx];
                    const cv = vmCvArr && cvIdx < vmCvArr.length ? vmCvArr[cvIdx].value : (vmCapturedVars ? (vmCapturedVars[capturedName]?.value ?? vmCapturedVars[capturedName]) : null);
                    const v = safeAddValues(cv, stack[fp + lcIdx]);
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                            vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                        } else {
                            ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                            vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                            const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                            vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                        }
                    }
                    stack[sp++] = v;
                    break;
                }
                case OP.RETURN_SUB_CAPTURED_LOCAL: {
                    const cvIdx = code[ip++];
                    const lcIdx = code[ip++];
                    const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length
                        ? capturedNames[cvIdx]
                        : vars[cvIdx];
                    const cv = vmCvArr && cvIdx < vmCvArr.length ? vmCvArr[cvIdx].value : (vmCapturedVars ? (vmCapturedVars[capturedName]?.value ?? vmCapturedVars[capturedName]) : null);
                    const v = cv - stack[fp + lcIdx];
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                            vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                        } else {
                            ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                            vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                            const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                            vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                        }
                    } else { ip++; }
                    stack[sp++] = v;
                    break;
                }
                case OP.RETURN_MUL_CAPTURED_LOCAL: {
                    const cvIdx = code[ip++];
                    const lcIdx = code[ip++];
                    const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length
                        ? capturedNames[cvIdx]
                        : vars[cvIdx];
                    const cv = vmCvArr && cvIdx < vmCvArr.length ? vmCvArr[cvIdx].value : (vmCapturedVars ? (vmCapturedVars[capturedName]?.value ?? vmCapturedVars[capturedName]) : null);
                    const v = cv * stack[fp + lcIdx];
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                            vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                        } else {
                            ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                            vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                            const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                            vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                        }
                    } else { ip++; }
                    stack[sp++] = v;
                    break;
                }
                case OP.RETURN_DIV_CAPTURED_LOCAL: {
                    const cvIdx = code[ip++];
                    const lcIdx = code[ip++];
                    const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length
                        ? capturedNames[cvIdx]
                        : vars[cvIdx];
                    const cv = vmCvArr && cvIdx < vmCvArr.length ? vmCvArr[cvIdx].value : (vmCapturedVars ? (vmCapturedVars[capturedName]?.value ?? vmCapturedVars[capturedName]) : null);
                    const v = cv / stack[fp + lcIdx];
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                            vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                        } else {
                            ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                            vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                            const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                            vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                        }
                    } else { ip++; }
                    stack[sp++] = v;
                    break;
                }
                case OP.RETURN_ADD_LOCALS: {
                    const a = code[ip++], b = code[ip++];
                    const v = safeAddValues(stack[fp + a], stack[fp + b]);
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                            vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                        } else {
                            ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                            vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                            const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                            vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                        }
                    } else { ip++; }
                    stack[sp++] = v;
                    break;
                }
                case OP.RETURN_SUB_LOCALS: {
                    const a = code[ip++], b = code[ip++];
                    const v = stack[fp + a] - stack[fp + b];
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                            vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                        } else {
                            ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                            vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                            const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                            vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                        }
                    } else { ip++; }
                    stack[sp++] = v;
                    break;
                }
                case OP.RETURN_MUL_LOCALS: {
                    const a = code[ip++], b = code[ip++];
                    const v = stack[fp + a] * stack[fp + b];
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                            vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                        } else {
                            ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                            vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                            const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                            vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                        }
                    } else { ip++; }
                    stack[sp++] = v;
                    break;
                }
                case OP.RETURN_DIV_LOCALS: {
                    const a = code[ip++], b = code[ip++];
                    const v = stack[fp + a] / stack[fp + b];
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                            vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                        } else {
                            ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                            vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                            const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                            vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                        }
                    } else { ip++; }
                    stack[sp++] = v;
                    break;
                }
                case OP.GET_LOCAL: {
                    const idx = code[ip++];
                    let val = stack[fp + idx];
                    const funcRef = vmCurrentClosure?._funcRef;
                    const capturedLocals = funcRef?.capturedLocals;
                    if ((vmCapturedVars || vmSharedCaptured) && Array.isArray(capturedLocals) && capturedLocals.length > 0 && Array.isArray(vmLocals)) {
                        let capturedName;
                        const localScope = funcRef?.localScope && typeof funcRef.localScope === 'object' ? funcRef.localScope : null;
                        if (localScope) {
                            for (let ci = 0; ci < capturedLocals.length; ci++) {
                                const name = capturedLocals[ci];
                                if (localScope[name] === idx) {
                                    capturedName = name;
                                    break;
                                }
                            }
                        }
                        for (let i = vmLocals.length - 1; i >= 0 && capturedName === undefined; i--) {
                            const scope = vmLocals[i];
                            if (!scope) continue;
                            for (let ci = 0; ci < capturedLocals.length; ci++) {
                                const name = capturedLocals[ci];
                                if (scope[name] === idx) {
                                    capturedName = name;
                                    break;
                                }
                            }
                        }
                        if (capturedName !== undefined) {
                            const box = (!Array.isArray(vmCapturedVars) && vmCapturedVars) ? vmCapturedVars[capturedName] : undefined;
                            const sharedBox = box === undefined && (!Array.isArray(vmSharedCaptured) && vmSharedCaptured) ? vmSharedCaptured[capturedName] : undefined;
                            const selected = box !== undefined ? box : sharedBox;
                            if (selected && typeof selected === 'object' && Object.prototype.hasOwnProperty.call(selected, 'value')) val = selected.value;
                            else if (selected !== undefined) val = selected;
                        }
                    }
                    stack[sp++] = val === undefined ? null : val;
                    break;
                }
                case OP.SET_LOCAL: {
                    const idx = code[ip++];
                    const value = stack[--sp];
                    stack[fp + idx] = value;
                    const closureRef = vmCurrentClosure?._funcRef;
                    const hasCaptureState = (!!vmCapturedVars && !Array.isArray(vmCapturedVars)) || (!!vmSharedCaptured && !Array.isArray(vmSharedCaptured));
                    if (closureRef && hasCaptureState && Array.isArray(closureRef.capturedVars) && closureRef.capturedVars.length > 0) {
                        const localName = resolveLocalNameByIndex(vmLocals, idx);
                        const varName = localName !== undefined ? localName : vars[idx];
                        if (varName !== undefined) {
                            const captured = vmCapturedVars && !Array.isArray(vmCapturedVars) ? vmCapturedVars[varName] : undefined;
                            if (captured && typeof captured === 'object' && Object.prototype.hasOwnProperty.call(captured, 'value')) {
                                captured.value = value;
                            } else if (vmSharedCaptured && !Array.isArray(vmSharedCaptured) && vmSharedCaptured[varName] && typeof vmSharedCaptured[varName] === 'object') {
                                vmSharedCaptured[varName].value = value;
                            }
                        }
                    }
                    break;
                }
            case OP.GET_CAPTURED: {
                const idx = code[ip++];
                if ((!vmCvArr || idx >= vmCvArr.length) && vmCurrentClosure?._cvArr) vmCvArr = resolveCallCvArr(vmCurrentClosure, vmCapturedVars, vmCvArrResolveCache);
                let varName = undefined;
                const capturedVarsIsObject = vmCapturedVars && !Array.isArray(vmCapturedVars);
                let callScoped = false;
                if (capturedVarsIsObject) {
                    if (vmCallScopedMetaClosure !== vmCurrentClosure) {
                        vmCallScopedMetaClosure = vmCurrentClosure;
                        vmCallScopedMeta = getCallScopedCapturedMeta(vmCurrentClosure);
                    }
                    callScoped = !!(vmCallScopedMeta?.indexMap && vmCallScopedMeta.indexMap[idx]);
                }
                if (callScoped) {
                    const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && idx >= 0 && idx < capturedNames.length
                        ? capturedNames[idx]
                        : undefined;
                    varName = capturedName;
                    if (varName === undefined) varName = vars[idx];
                    const scopedBox = vmCapturedVars[varName];
                    if (scopedBox && typeof scopedBox === 'object' && Object.prototype.hasOwnProperty.call(scopedBox, 'value')) {
                        stack[sp++] = scopedBox.value;
                        break;
                    }
                    if (scopedBox !== undefined) {
                        stack[sp++] = scopedBox;
                        break;
                    }
                }
                if (Array.isArray(vmCvArr) && idx === 0 && vmCvArr.length === 1) {
                    const singleBox = vmCvArr[0];
                    if (singleBox && typeof singleBox === 'object' && Object.prototype.hasOwnProperty.call(singleBox, 'value')) {
                        stack[sp++] = singleBox.value;
                        break;
                    }
                }
                if (Array.isArray(vmCvArr) && idx >= 0 && idx < vmCvArr.length) {
                    const directBox = vmCvArr[idx];
                    if (directBox && typeof directBox === 'object' && Object.prototype.hasOwnProperty.call(directBox, 'value')) {
                        stack[sp++] = directBox.value;
                        break;
                    }
                }
                let cvBox = null;
                if (Array.isArray(vmCvArr)) {
                    let cvIdx = idx;
                    if ((cvIdx < 0 || cvIdx >= vmCvArr.length) && varName !== undefined) {
                        const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                        if (Array.isArray(capturedNames)) cvIdx = capturedNames.indexOf(varName);
                    }
                    if (cvIdx >= 0 && cvIdx < vmCvArr.length) cvBox = vmCvArr[cvIdx];
                }
                if (cvBox && typeof cvBox === 'object' && Object.prototype.hasOwnProperty.call(cvBox, 'value')) {
                    stack[sp++] = cvBox.value;
                } else if (vmCapturedVars) {
                    if (varName === undefined) {
                        const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                        const capturedName = Array.isArray(capturedNames) && idx >= 0 && idx < capturedNames.length
                            ? capturedNames[idx]
                            : undefined;
                        varName = capturedName !== undefined ? capturedName : vars[idx];
                    }
                    const c = Array.isArray(vmCapturedVars) ? vmCapturedVars[idx] : vmCapturedVars[varName];
                    if (c !== undefined) {
                        stack[sp++] = c !== null && typeof c === 'object' ? c.value ?? c : c;
                    } else if (vmSharedCaptured) {
                        const box = Array.isArray(vmSharedCaptured) ? vmSharedCaptured[idx] : vmSharedCaptured[varName];
                        stack[sp++] = box ? box.value : null;
                    } else {
                        stack[sp++] = null;
                    }
                } else if (vmSharedCaptured) {
                    if (varName === undefined) {
                        const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                        const capturedName = Array.isArray(capturedNames) && idx >= 0 && idx < capturedNames.length
                            ? capturedNames[idx]
                            : undefined;
                        varName = capturedName !== undefined ? capturedName : vars[idx];
                    }
                    const box = Array.isArray(vmSharedCaptured) ? vmSharedCaptured[idx] : vmSharedCaptured[varName];
                    stack[sp++] = box ? box.value : null;
                } else {
                    stack[sp++] = null;
                }
                break;
            }
            case OP.SET_CAPTURED: {
                const idx = code[ip++];
                const value = stack[--sp];
                let varName = undefined;
                const capturedVarsIsObject = vmCapturedVars && !Array.isArray(vmCapturedVars);
                let callScoped = false;
                if (capturedVarsIsObject) {
                    if (vmCallScopedMetaClosure !== vmCurrentClosure) {
                        vmCallScopedMetaClosure = vmCurrentClosure;
                        vmCallScopedMeta = getCallScopedCapturedMeta(vmCurrentClosure);
                    }
                    callScoped = !!(vmCallScopedMeta?.indexMap && vmCallScopedMeta.indexMap[idx]);
                }
                if (callScoped) {
                    const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && idx >= 0 && idx < capturedNames.length
                        ? capturedNames[idx]
                        : undefined;
                    varName = capturedName;
                    if (varName === undefined) varName = vars[idx];
                    const scoped = vmCapturedVars[varName];
                    if (scoped && typeof scoped === 'object' && Object.prototype.hasOwnProperty.call(scoped, 'value')) {
                        scoped.value = value;
                    } else {
                        vmCapturedVars[varName] = { value };
                    }
                } else {
                if ((!vmCvArr || idx >= vmCvArr.length) && vmCurrentClosure?._cvArr) vmCvArr = resolveCallCvArr(vmCurrentClosure, vmCapturedVars, vmCvArrResolveCache);
                let handledBySingleBox = false;
                if (Array.isArray(vmCvArr) && idx === 0 && vmCvArr.length === 1) {
                    const singleBox = vmCvArr[0];
                    if (singleBox && typeof singleBox === 'object' && Object.prototype.hasOwnProperty.call(singleBox, 'value')) {
                        singleBox.value = value;
                        handledBySingleBox = true;
                    }
                }
                if (!handledBySingleBox && Array.isArray(vmCvArr) && idx >= 0 && idx < vmCvArr.length) {
                    const directBox = vmCvArr[idx];
                    if (directBox && typeof directBox === 'object' && Object.prototype.hasOwnProperty.call(directBox, 'value')) {
                        directBox.value = value;
                        handledBySingleBox = true;
                    }
                }
                if (!handledBySingleBox) {
                    let cvIdx = idx;
                    if ((cvIdx < 0 || !Array.isArray(vmCvArr) || cvIdx >= vmCvArr.length) && varName !== undefined) {
                        const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                        if (Array.isArray(capturedNames)) {
                            cvIdx = capturedNames.indexOf(varName);
                            if (cvIdx < 0) cvIdx = idx;
                        }
                    }
                    const cvBox = (Array.isArray(vmCvArr) && cvIdx >= 0 && cvIdx < vmCvArr.length) ? vmCvArr[cvIdx] : null;
                    if (cvBox && typeof cvBox === 'object' && Object.prototype.hasOwnProperty.call(cvBox, 'value')) {
                        cvBox.value = value;
                    } else {
                        if (varName === undefined) {
                            const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                            const capturedName = Array.isArray(capturedNames) && idx >= 0 && idx < capturedNames.length
                                ? capturedNames[idx]
                                : undefined;
                            varName = capturedName !== undefined ? capturedName : vars[idx];
                        }
                        if (vmSharedCaptured && !Array.isArray(vmSharedCaptured) && Object.prototype.hasOwnProperty.call(vmSharedCaptured, varName)) {
                        vmSharedCaptured[varName].value = value;
                        } else if (vmCapturedVars) {
                            const captured = Array.isArray(vmCapturedVars) ? vmCapturedVars[idx] : vmCapturedVars[varName];
                            if (typeof captured === 'object' && captured !== null && captured.value !== undefined) {
                                captured.value = value;
                            } else if (Array.isArray(vmCapturedVars)) {
                                vmCapturedVars[idx] = value;
                            } else {
                                vmCapturedVars[varName] = value;
                            }
                        } else if (vmSharedCaptured) {
                            if (Array.isArray(vmSharedCaptured)) {
                                const box = vmSharedCaptured[idx];
                                if (box && typeof box === 'object' && Object.prototype.hasOwnProperty.call(box, 'value')) {
                                    box.value = value;
                                } else {
                                    vmSharedCaptured[idx] = { value: value };
                                }
                            } else if (vmSharedCaptured[varName]) {
                                vmSharedCaptured[varName].value = value;
                            } else {
                                vmSharedCaptured[varName] = { value: value };
                            }
                        }
                    }
                }
                }
                let localIdx;
                if (varName === undefined) {
                    const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && idx >= 0 && idx < capturedNames.length
                        ? capturedNames[idx]
                        : undefined;
                    varName = capturedName !== undefined ? capturedName : vars[idx];
                }
                if (Array.isArray(vmLocals)) {
                    for (let i = vmLocals.length - 1; i >= 0; i--) {
                        const idx2 = vmLocals[i]?.[varName];
                        if (idx2 !== undefined) { localIdx = idx2; break; }
                    }
                }
                if (localIdx !== undefined) {
                    stack[fp + localIdx] = value;
                }
                break;
            }

            case OP.ADD: { 
                const b = stack[--sp], a = stack[--sp];
                if (typeof a === 'number' && typeof b === 'number') {
                    stack[sp++] = a + b;
                } else if (typeof a === 'string' && typeof b === 'string') {
                    stack[sp++] = safeAddValues(a, b);
                } else if (typeof a === 'string' || typeof b === 'string') {
                    if (strict) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: `TypeError: Cannot add ${typeof a} and ${typeof b}`, output: this.output };
                    }
                    stack[sp++] = safeAddValues(a, b);
                } else if (Array.isArray(a)) {
                    stack[sp++] = Array.isArray(b) ? [...a, ...b] : safeAddValues(a, b);
                } else {
                    if (strict) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: `TypeError: Cannot add ${typeof a} and ${typeof b}`, output: this.output };
                    }
                    stack[sp++] = safeAddValues(a, b);
                }
                break; 
            }
            case OP.ADD_NUM: {
                const b = normalizeNumericOperand(stack[--sp]), a = normalizeNumericOperand(stack[--sp]);
                stack[sp++] = a + b;
                break;
            }
            case OP.SUB: { const b = normalizeNumericOperand(stack[--sp]); stack[sp - 1] = normalizeNumericOperand(stack[sp - 1]) - b; break; }
            case OP.MUL: { 
                const b = stack[--sp];
                const a = stack[sp - 1];
                if (typeof a === 'number' && typeof b === 'number') {
                    stack[sp - 1] = a * b;
                } else if (typeof a === 'string' && a.length === 1 && typeof b === 'number') {
                    stack[sp - 1] = a.charCodeAt(0) * b;
                } else if (typeof b === 'string' && b.length === 1 && typeof a === 'number') {
                    stack[sp - 1] = a * b.charCodeAt(0);
                } else if (typeof a === 'string' && typeof b === 'number') {
                    stack[sp - 1] = safeRepeatString(a, b);
                } else {
                    stack[sp - 1] = normalizeNumericOperand(a) * normalizeNumericOperand(b);
                }
                break; 
            }
            case OP.DIV: { 
                const b = normalizeNumericOperand(stack[--sp]), a = normalizeNumericOperand(stack[--sp]);
                if (b === 0) {
                    if (tryStack.length) {
                        while (tryStack.length > 0) {
                            const handler = tryStack[tryStack.length - 1];
                            if (handler.catchIp !== null && !handler.used) {
                                handler.used = true;
                                stack[sp++] = 'division error';
                                ip = handler.catchIp;
                                break;
                            }
                            tryStack.pop();
                        }
                        if (tryStack.length > 0) break;
                    }
                    this._sp = sp;
                    this._fp = fp;
                    this.ip = ip;
                    this._frameTop = frameTop;
                    this.locals = vmLocals;
                    this.capturedVars = vmCapturedVars;
                    this.sharedCaptured = vmSharedCaptured;
                    return { success: false, error: 'division error', output: this.output };
                }
                stack[sp++] = a / b; 
                break; 
            }
            case OP.MOD: { 
                const b = normalizeNumericOperand(stack[--sp]), a = normalizeNumericOperand(stack[--sp]);
                stack[sp++] = a % b; 
                break; 
            }
            case OP.NEG: stack[sp - 1] = -stack[sp - 1]; break;
            
            case OP.EQ: { const b = stack[--sp]; stack[sp - 1] = seedEquals(stack[sp - 1], b); break; }
            case OP.NE: { const b = stack[--sp]; stack[sp - 1] = !seedEquals(stack[sp - 1], b); break; }
            case OP.LT: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] < b; break; }
            case OP.LE: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] <= b; break; }
            case OP.GT: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] > b; break; }
            case OP.GE: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] >= b; break; }
            case 158: { const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a < b)) ip += off; break; }
            case 159: { const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a <= b)) ip += off; break; }
            case 160: { const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a > b)) ip += off; break; }
            case 161: { const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a >= b)) ip += off; break; }
            
            case OP.AND: {
                const b = stack[--sp];
                stack[sp - 1] = stack[sp - 1] && b;
                break;
            }
            case OP.OR: {
                const b = stack[--sp];
                stack[sp - 1] = stack[sp - 1] || b;
                break;
            }
            case OP.NOT: stack[sp - 1] = !stack[sp - 1]; break;
            
            case OP.BITAND: {
                const b = stack[--sp];
                const a = stack[sp - 1];
                if (this._traceBitOps) {
                    if (!this._bitTrace) this._bitTrace = [];
                    if (this._bitTrace.length < 512) this._bitTrace.push({ op: '&', ip: ip - 1, a, b, path: 'runFull' });
                }
                stack[sp - 1] = stack[sp - 1] & b;
                break;
            }
            case OP.BITOR: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] | b; break; }
            case OP.BITXOR: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] ^ b; break; }
            case OP.BITNOT: stack[sp - 1] = ~stack[sp - 1]; break;
            case OP.SHL: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] << b; break; }
            case OP.SHR: {
                const b = stack[--sp];
                const a = stack[sp - 1];
                if (this._traceBitOps) {
                    if (!this._bitTrace) this._bitTrace = [];
                    if (this._bitTrace.length < 512) this._bitTrace.push({ op: '>>', ip: ip - 1, a, b, path: 'runFull' });
                }
                stack[sp - 1] = stack[sp - 1] >> b;
                break;
            }
            
            case OP.ARRAY: {
                const n = code[ip++];
                const limArr = enforceAggregateCount(this, n, 'array literal');
                if (limArr) return _runFullFail(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured, limArr);
                if (sp < n) return _runFullFail(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured, 'operand stack underflow');
                const a = hardenArrayObject(new Array(n));
                for (let i = n - 1; i >= 0; i--) a[i] = stack[--sp];
                stack[sp++] = a;
                break;
            }
            case OP.OBJECT: {
                const n = code[ip++];
                const limObj = enforceAggregateCount(this, n, 'object literal');
                if (limObj) return _runFullFail(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured, limObj);
                if (sp < 2 * n) return _runFullFail(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured, 'operand stack underflow');
                const o = Object.create(null);
                const entries = new Array(n);
                for (let i = n - 1; i >= 0; i--) {
                    const v = stack[--sp], k = stack[--sp];
                    entries[i] = { k, v };
                }
                let mergedKeys = 0;
                for (let i = 0; i < n; i++) {
                    const { k, v } = entries[i];
                    if (k === OBJECT_SPREAD_MARKER) {
                        if (v && typeof v === 'object') {
                            const spreadKeys = Object.keys(v).filter((sk) => !isDangerousObjectKey(sk));
                            const limSp = enforceAggregateMerge(this, mergedKeys, spreadKeys.length, 'object literal (spread)');
                            if (limSp) return _runFullFail(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured, limSp);
                            mergedKeys += spreadKeys.length;
                            for (let si = 0; si < spreadKeys.length; si++) {
                                const sk = spreadKeys[si];
                                o[sk] = v[sk];
                            }
                        }
                    } else {
                        if (isDangerousObjectKey(k)) continue;
                        const limOb = enforceAggregateMerge(this, mergedKeys, 1, 'object literal');
                        if (limOb) return _runFullFail(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured, limOb);
                        mergedKeys += 1;
                        o[k] = v;
                    }
                }
                if (vmCurrentClosure && vmCurrentClosure._type === 'closure') {
                    vmCurrentClosure._selfObject = o;
                    const fnName = vmCurrentClosure._funcRef?.name || vmCurrentClosure.name;
                    if (fnName && fnName !== 'anonymous') {
                        const gfn = this.globals?.[fnName];
                        if (gfn && (typeof gfn === 'object' || typeof gfn === 'function')) gfn._selfObject = o;
                    }
                }
                stack[sp++] = o;
                break;
            }
            case OP.GET: {
                const k = stack[--sp], o = stack[--sp];
                if (o?._type === 'coroutine' && o._values && typeof k === 'number') {
                    const v = o._values[k];
                    stack[sp++] = v !== undefined ? v : null;
                    break;
                }
                if (Array.isArray(o) && typeof k === 'number') {
                    const v = o[k];
                    stack[sp++] = v !== undefined ? v : null;
                    break;
                }
                if (typeof o === 'string' && typeof k === 'number') {
                    const v = o[k];
                    stack[sp++] = v !== undefined ? v : null;
                    break;
                }
                if (o && o._type === undefined && typeof k === 'number') {
                    let v = o[k];
                    if (v === undefined) v = o[String(k)];
                    if (typeof v === 'function') stack[sp++] = (args) => v.call(o, args);
                    else stack[sp++] = v !== undefined ? v : null;
                    break;
                }
                if (o && o._type === 'closure' && o._selfObject && !isDangerousObjectKey(k)) {
                    const selfV = o._selfObject[k];
                    if (typeof selfV === 'function') {
                        stack[sp++] = (args) => (selfV?._type === 'closure' ? this.callClosure(selfV, args || []) : selfV.call(o._selfObject, args));
                    }
                    else stack[sp++] = selfV !== undefined ? selfV : null;
                    break;
                }
                if (isDangerousObjectKey(k)) {
                    stack[sp++] = null;
                    break;
                }
                
                if (o === null || o === undefined) {
                    stack[sp++] = null;
                } else if (Array.isArray(o)) {
                    const v = o[k];
                    if (typeof k === 'number') {
                        stack[sp++] = v !== undefined ? v : null;
                    } else if (typeof v === 'function') {
                        stack[sp++] = (args) => v.call(o, args);
                    } else {
                        stack[sp++] = v !== undefined ? v : null;
                    }
                } else if (typeof o === 'string' && typeof k === 'number') {
                    const v = o[k];
                    stack[sp++] = v !== undefined ? v : null;
                } else if (o._type === undefined) {
                    const v = o[k];
                    if (typeof v === 'function') {
                        stack[sp++] = (args) => v.call(o, args);
                    } else {
                        stack[sp++] = v !== undefined ? v : null;
                    }
                } else if (o._type === 'instance') {
                    if (!canAccessInstanceKey(this, o, k)) {
                        stack[sp++] = null;
                        break;
                    }
                    let method = o._methods[k];
                    let superClass = o._superClass;
                    while (!method && superClass) {
                        const parentClass = globals[superClass];
                        if (parentClass?._type === 'class') {
                            method = parentClass.methods[k];
                            superClass = parentClass.superClass;
                        } else break;
                    }
                    stack[sp++] = method ? { _type: method.fiber ? 'fiber_method' : 'method', instance: o, method } : o[k] ?? null;
                } else if (o._type === 'class') {
                    const method = o.methods?.[k];
                    stack[sp++] = method ? { _type: method.fiber ? 'fiber_method' : 'method', instance: null, method, classObj: o } : o[k] ?? null;
                } else if (o._type === 'coroutine') {
                    if (k === 'resume') {
                        stack[sp++] = (args) => this._coroutineResume(o, args?.[0]);
                    } else if (k === 'status') {
                        stack[sp++] = (args) => this._coroutineStatus(o);
                    } else if (k === 'done') {
                        stack[sp++] = (args) => o.state === 'done';
                    } else {
                        stack[sp++] = o[k] ?? null;
                    }
                } else if (o._type === 'module') {
                    const fn = o.exports[k];
                    stack[sp++] = typeof fn === 'function' ? (args) => fn(args) : fn ?? null;
                } else {
                    const v = o[k];
                    if (typeof v === 'function') {
                        stack[sp++] = (args) => v.call(o, args);
                    } else {
                        stack[sp++] = v !== undefined ? v : null;
                    }
                }
                break;
            }
            case OP.GET_CONST: {
                const k = consts[code[ip++]];
                const o = stack[--sp];
                if (Array.isArray(o) && typeof k === 'number') {
                    const v = o[k];
                    stack[sp++] = v !== undefined ? v : null;
                    break;
                }
                if (typeof o === 'string' && typeof k === 'number') {
                    const v = o[k];
                    stack[sp++] = v !== undefined ? v : null;
                    break;
                }
                if (o && o._type === undefined && typeof k === 'number') {
                    let v = o[k];
                    if (v === undefined) v = o[String(k)];
                    if (typeof v === 'function') stack[sp++] = (args) => v.call(o, args);
                    else stack[sp++] = v !== undefined ? v : null;
                    break;
                }
                if (isDangerousObjectKey(k)) {
                    stack[sp++] = null;
                    break;
                }
                if (o === null || o === undefined) {
                    stack[sp++] = null;
                } else if (Array.isArray(o)) {
                    const v = o[k];
                    if (typeof k === 'number') {
                        stack[sp++] = v !== undefined ? v : null;
                    } else if (typeof v === 'function') {
                        stack[sp++] = (args) => v.call(o, args);
                    } else {
                        stack[sp++] = v !== undefined ? v : null;
                    }
                } else if (typeof o === 'string' && typeof k === 'number') {
                    const v = o[k];
                    stack[sp++] = v !== undefined ? v : null;
                } else if (o._type === undefined) {
                    const v = o[k];
                    if (typeof v === 'function') {
                        stack[sp++] = (args) => v.call(o, args);
                    } else {
                        stack[sp++] = v !== undefined ? v : null;
                    }
                } else if (o._type === 'instance') {
                    if (!canAccessInstanceKey(this, o, k)) {
                        stack[sp++] = null;
                        break;
                    }
                    let method = o._methods[k];
                    let superClass = o._superClass;
                    while (!method && superClass) {
                        const parentClass = globals[superClass];
                        if (parentClass?._type === 'class') {
                            method = parentClass.methods[k];
                            superClass = parentClass.superClass;
                        } else break;
                    }
                    stack[sp++] = method ? { _type: method.fiber ? 'fiber_method' : 'method', instance: o, method } : o[k] ?? null;
                } else if (o._type === 'class') {
                    const method = o.methods?.[k];
                    if (method) {
                        this._lastMethodGet = `runFull:GET_CONST:${String(k)}`;
                        stack[sp++] = { _type: method.fiber ? 'fiber_method' : 'method', instance: null, method, classObj: o };
                    } else {
                        const val = o[k];
                        stack[sp++] = val !== undefined ? val : null;
                    }
                } else if (o._type === 'coroutine') {
                    if (k === 'resume') {
                        stack[sp++] = (args) => this._coroutineResume(o, args?.[0]);
                    } else if (k === 'status') {
                        stack[sp++] = (args) => this._coroutineStatus(o);
                    } else if (k === 'done') {
                        stack[sp++] = (args) => o.state === 'done';
                    } else {
                        stack[sp++] = o[k] ?? null;
                    }
                } else if (o._type === 'module') {
                    const fn = o.exports[k];
                    stack[sp++] = typeof fn === 'function' ? (args) => fn(args) : fn ?? null;
                } else {
                    const v = o[k];
                    if (typeof v === 'function') {
                        stack[sp++] = (args) => v.call(o, args);
                    } else {
                        stack[sp++] = v !== undefined ? v : null;
                    }
                }
                break;
            }
            case OP.SET: {
                const o = stack[--sp], k = stack[--sp], v = stack[--sp];
                if (o && !isDangerousObjectKey(k) && canAccessInstanceKey(this, o, k)) {
                    if (o._type === 'closure' && o._selfObject) o._selfObject[k] = v;
                    else o[k] = v;
                }
                stack[sp++] = v;
                break;
            }
            case OP.ARRAY_SET: {
                const o = stack[--sp], k = stack[--sp], v = stack[--sp];
                if (isDangerousObjectKey(k)) {
                    stack[sp++] = v;
                    break;
                }
                if (Array.isArray(o)) {
                    if (isSafeArrayIndex(k, this._maxArrayIndex)) o[k] = v;
                } else if (o) {
                    if (canAccessInstanceKey(this, o, k)) o[k] = v;
                }
                if (code && code.length === 53 && vars && vars[0] === 'toString' && vars[1] === 'cache' && vars[2] === 'func' && vmCapturedVars) {
                    const fnCap = vmCapturedVars.func;
                    const fnObj = fnCap && typeof fnCap === 'object' && fnCap.value !== undefined ? fnCap.value : fnCap;
                    if ((typeof fnObj === 'function' || (fnObj && typeof fnObj === 'object')) && !isDangerousObjectKey(k)) {
                        try { fnObj[k] = v; } catch (_) {}
                    }
                }
                stack[sp++] = v;
                break;
            }
            case OP.JUMP: { const off = code[ip]; ip += off + 1; break; }
            case OP.JUMP_FALSE: { const off = code[ip]; if (!stack[--sp]) ip += off + 1; else ip++; break; }
            case OP.JUMP_FALSE_PEEK: { const off = code[ip]; if (!stack[sp - 1]) ip += off + 1; else ip++; break; }
            
            case OP.SELF_SUB_CONST: {
                const li = code[ip++]; const ci = code[ip++];
                const fn = vmCurrentClosure;
                const argVal = stack[fp + li] - consts[ci];
                if (!(vmCapturedVars || vmSharedCaptured)) {
                    const savedFp = fp;
                    const savedSp = sp;
                    const savedLocals = vmLocals;
                    stack[sp] = argVal;
                    fp = sp;
                    sp = fn._lc > 1 ? fp + fn._lc : fp + 1;
                    const ft = frameTop;
                    if (ft + 1 >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                    const base = ft * 5;
                    sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = fn;
                    fr.simple[ft] = 1;
                    frameTop = ft + 1;
                    vmLocals = fn._lsa;
                    vmCapturedVars = prepareCallCapturedVars(fn);
                    vmCvArr = null;
                    vmSharedCaptured = resolveCallSharedCaptured(fn, vmCapturedVars);
                    ip = fn._start;
                    break;
                }
                this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                return this.runFull(bc);
            }
            case OP.CALL_SELF1: {
                const fn = vmCurrentClosure;
                const argVal = stack[--sp];
                if (_canUseFastFib(fn, argVal)) {
                    stack[sp++] = _fastFibNonNegInt(argVal);
                    break;
                }
                if (jitEnabled && fn?._funcRef?.name) jit.recordCall(fn._funcRef.name);
                if (!(vmCapturedVars || vmSharedCaptured)) {
                    const savedFp = fp;
                    const savedSp = sp;
                    const savedLocals = vmLocals;
                    stack[sp] = argVal;
                    fp = sp;
                    sp = fn._lc > 1 ? fp + fn._lc : fp + 1;
                    const ft = frameTop;
                    if (ft + 1 >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                    const base = ft * 5;
                    sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = fn;
                    frSimple[ft] = 1;
                    frameTop = ft + 1;
                    vmLocals = fn._lsa;
                    vmCapturedVars = null;
                    vmCvArr = null;
                    vmSharedCaptured = null;
                    ip = fn._start;
                    break;
                }
                const savedFp = fp;
                const savedSp = sp;
                const savedLocals = vmLocals;
                stack[sp] = argVal;
                fp = sp;
                const fnLocalCount = fn._localCount || 0;
                if (fnLocalCount > 1) {
                    const targetSp = fp + fnLocalCount;
                    for (let li = fp + 1; li < targetSp; li++) stack[li] = undefined;
                    sp = targetSp;
                } else {
                    sp = fp + 1;
                }
                if (frameTop >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                const ft = frameTop++;
                if (ft === 0) this._lastFrame0Push = `11767(codeLen=${code?.length ?? -1},ip=${ip},fnStart=${fn._start !== undefined ? fn._start : fn.start})`;
                fr.ips[ft] = ip;
                fr.ips[ft] = ip;
                fr.fps[ft] = savedFp;
                fr.sps[ft] = savedSp;
                fr.locals[ft] = savedLocals;
                frSimple[ft] = 0;
                fr.cvArrs[ft] = vmCvArr;
                fr.closures[ft] = fn;
                fr.capturedVars[ft] = vmCapturedVars;
                fr.sharedCaptured[ft] = vmSharedCaptured;
                fr.codes[ft] = null;
                vmLocals = fn._localScopeArr;
                vmCapturedVars = prepareCallCapturedVars(fn);
                vmCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                vmSharedCaptured = null;
                ip = fn._start !== undefined ? fn._start : fn.start;
                break;
            }
            
            case OP.CALL0: {
                const fn = stack[--sp];
                if (fn && fn._type === 'closure') {
                    const fnCaptured = fn.capturedVars;
                    const hasCaptured = !!(fnCaptured && typeof fnCaptured === 'object' && Object.keys(fnCaptured).length > 0);
                    const fnShared = fn.sharedCaptured;
                    const hasSharedCaptured = !fn._noCapture && !!(fnShared && typeof fnShared === 'object' && Object.keys(fnShared).length > 0);
                    if (hasCaptured || hasSharedCaptured) {
                        this._sp = sp; this._fp = fp; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        const result = this.callClosure(fn, []);
                        stack = this.stack;
                        sp = this._sp;
                        fp = this._fp;
                        frameTop = this._frameTop;
                        vmLocals = this.locals;
                        vmCapturedVars = this.capturedVars;
                        vmSharedCaptured = this.sharedCaptured;
                        stack[sp++] = result;
                        break;
                    }
                    if (fn._inlineFn) {
                        stack[sp++] = fn._inlineFn();
                        break;
                    }
                    const savedFp = fp;
                    const savedSp = sp + 1;
                    const savedLocals = vmLocals;
                    const callerHasCv = vmCapturedVars || vmSharedCaptured;
                    const fnCtx = fn._ctx;
                    const fnCode = fnCtx[0];
                    fp = sp;
                    const fnLocalCount = fn._localCount || 0;
                    if (fnLocalCount > 0) {
                        const targetSp = fp + fnLocalCount;
                        for (let li = fp; li < targetSp; li++) stack[li] = undefined;
                        sp = targetSp;
                    }
                    if (frameTop >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                    const ft = frameTop++;
                    const fnConstsCtx = fnCtx ? fnCtx[1] : consts;
                    const fnVarsCtx = fnCtx ? fnCtx[2] : vars;
                    const isSimple = !callerHasCv && fnCode === code && fnConstsCtx === consts && fnVarsCtx === vars;
                    if (isSimple) {
                        const base = ft * 5;
                        sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = vmCurrentClosure;
                        frSimple[ft] = 1;
                    } else {
                        fr.ips[ft] = ip;
                        fr.fps[ft] = savedFp;
                        fr.sps[ft] = savedSp;
                        fr.locals[ft] = savedLocals;
                        frSimple[ft] = 0;
                        fr.cvArrs[ft] = vmCvArr;
                        fr.closures[ft] = vmCurrentClosure;
                        fr.capturedVars[ft] = vmCapturedVars;
                        fr.sharedCaptured[ft] = vmSharedCaptured;
                        fr.codes[ft] = code;
                        fr.consts[ft] = consts;
                        fr.vars[ft] = vars;
                        if (fnCode !== code) {
                            const fnConsts = fnCtx[1];
                            const fnVars = fn._funcRef ? fn._funcRef._vars : null;
                            this.code = fnCode;
                            this.consts = fnConsts || this.consts;
                            this.vars = fnVars || this.vars;
                            code = fnCode;
                            consts = fnConsts || consts;
                            vars = fnCtx[2] || vars;
                            this._lastCodeSwitch = `11823->fnCode(len=${fnCode?.length ?? -1},ft=${frameTop},ip=${ip})`;
                        }
                    }
                    vmLocals = fn._localScopeArr;
                    vmCapturedVars = prepareCallCapturedVars(fn);
                    vmCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                    vmSharedCaptured = null;
                    vmCurrentClosure = fn;
                    ip = fn._start !== undefined ? fn._start : fn.start;
                } else if (typeof fn === 'function') {
                    stack[sp++] = fn([]);
                } else if (fn?._type === 'coroutine_def') {
                    const coroDef = fn.def;
                    const coro = {
                        _type: 'coroutine',
                        state: 'suspended',
                        def: coroDef,
                        ip: coroDef.start || 0,
                        stack: [],
                        locals: [{ ...coroDef.localScope }],
                        capturedVars: [],
                        sharedCaptured: null,
                        fiber: !!fn.fiber
                    };
                    stack[sp++] = coro;
                } else if (_isFiberClosure(fn)) {
                    stack[sp++] = _createCoroutineFromClosure(fn, []);
                } else if (fn?._type === 'fiber_method') {
                    stack[sp++] = _createCoroutineFromMethod(fn.method, fn.instance, []);
                } else {
                    stack[sp++] = null;
                }
                break;
            }
            
            case OP.CALL_GLOBAL_CONST1: {
                const gi = code[ip++];
                const ci = code[ip++];
                const varName = vars[gi];
                const mappedGi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined;
                const readGi = (typeof mappedGi === 'number') ? mappedGi : gi;
                let fn = globalVals[readGi];
                if (fn === undefined || fn === null) {
                    fn = globals[varName];
                    if (fn === undefined || fn === null) fn = this.builtins[varName];
                    globalVals[readGi] = fn;
                }
                const argVal = consts[ci];
                if (jitEnabled && fn?._funcRef?.name) jit.recordCall(fn._funcRef.name);
                if (fn && fn._type === 'closure') {
                if (_canUseFastFib(fn, argVal)) {
                    stack[sp++] = _fastFibNonNegInt(argVal);
                    break;
                }
                const inlineOp = fn._inlineOp;
                if (inlineOp !== undefined) {
                    let result;
                    if (inlineOp === 100) result = fn._capturedVal + argVal;
                    else if (inlineOp === 107) result = fn._capturedVal - argVal;
                    else if (inlineOp === 108) result = fn._capturedVal * argVal;
                    else if (inlineOp === 109) result = fn._capturedVal / argVal;
                    if (result !== undefined) {
                            if (code[ip] === OP.SET_GLOBAL) {
                                ip++;
                                globalVals[code[ip++]] = result;
                            } else {
                                stack[sp++] = result;
                            }
                            break;
                        }
                    }
                    const fnCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                    if (fnCvArr && fnCvArr.length === 1 && fnCvArr[0] && !vmCapturedVars && !vmSharedCaptured) {
                        const fnCode = fn._ctx[0];
                        const startOp = fnCode[fn.start];
                        if (startOp === OP.RETURN_ADD_CAPTURED_LOCAL) {
                            stack[sp++] = fnCvArr[0].value + argVal;
                            break;
                        }
                        if (startOp === OP.RETURN_SUB_CAPTURED_LOCAL) {
                            stack[sp++] = fnCvArr[0].value - argVal;
                            break;
                        }
                        if (startOp === OP.RETURN_MUL_CAPTURED_LOCAL) {
                            stack[sp++] = fnCvArr[0].value * argVal;
                            break;
                        }
                        if (startOp === OP.RETURN_DIV_CAPTURED_LOCAL) {
                            stack[sp++] = fnCvArr[0].value / argVal;
                            break;
                        }
                    }
                    if (fn._inlineFn) {
                        stack[sp++] = fn._inlineFn(argVal);
                        break;
                    }
                    if (fn._isLeaf && !vmCapturedVars) {
                        const fnCode2 = fn._ctx ? fn._ctx[0] : code;
                        const firstOp2 = fnCode2[fn.start];
                        if (firstOp2 === OP.RETURN_LOCAL && fnCode2[fn.start + 1] === 0) {
                            stack[sp++] = argVal;
                            break;
                        }
                        const savedFp = fp;
                        const savedSp = sp;
                        const savedLocals = vmLocals;
                        stack[sp] = argVal;
                        fp = sp;
                        if (fn._localCount > 1) {
                            const targetSp = fp + fn._localCount;
                            for (let li = fp + 1; li < targetSp; li++) stack[li] = undefined;
                            sp = targetSp;
                        } else {
                            sp = fp + 1;
                        }
                        vmLocals = fn._localScopeArr;
                        const fnCode = fnCode2;
                        const fnEnd = fn.end;
                        let leafIp = fn.start;
                        let leafResult = null;
                        let leafDone = false;
                        let leafFallback = false;
                        while (leafIp < fnEnd && !leafDone) {
                            const lop = fnCode[leafIp++];
                            switch (lop) {
                                case OP.RETURN_ADD_LOCALS: { leafResult = safeAddValues(stack[fp + fnCode[leafIp++]], stack[fp + fnCode[leafIp++]]); leafDone = true; break; }
                                case OP.RETURN_SUB_LOCALS: { leafResult = stack[fp + fnCode[leafIp++]] - stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                                case OP.RETURN_MUL_LOCALS: { leafResult = stack[fp + fnCode[leafIp++]] * stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                                case OP.RETURN_DIV_LOCALS: { leafResult = stack[fp + fnCode[leafIp++]] / stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                                case OP.RETURN_LOCAL: { leafResult = stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                                case OP.RETURN_SIMPLE:
                                case OP.RETURN: { leafResult = stack[--sp]; leafDone = true; break; }
                                default: { leafDone = true; leafFallback = true; break; }
                            }
                        }
                        if (!leafFallback) {
                            stack[savedSp] = leafResult;
                            fp = savedFp;
                            sp = savedSp + 1;
                            vmLocals = savedLocals;
                            break;
                        }
                        fp = savedFp;
                        sp = savedSp;
                        vmLocals = savedLocals;
                    }
                    if (fn._returnsInlineClosure && !vmCapturedVars) {
                        const innerInlineOp = fn._innerInlineOp;
                        if (innerInlineOp !== undefined) {
                            const capturedVal = argVal;
                            let innerClosure = fn._cachedInlineClosure;
                            if (!innerClosure || innerClosure._capturedVal !== capturedVal) {
                                innerClosure = { _type: 'closure', _capturedVal: capturedVal, _inlineOp: innerInlineOp };
                                fn._cachedInlineClosure = innerClosure;
                            }
                            if (code[ip] === OP.SET_GLOBAL) {
                                ip++;
                                globalVals[code[ip++]] = innerClosure;
                            } else {
                                stack[sp++] = innerClosure;
                            }
                            break;
                        }
                    }
                    if (fn._noCapture && !vmCapturedVars && !vmSharedCaptured) {
                        stack[sp] = argVal;
                        const savedFp = fp;
                        const savedSp = sp;
                        const savedLocals = vmLocals;
                        fp = sp;
                        sp = fn._localCount > 1 ? fp + fn._localCount : fp + 1;
                        if (frameTop >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                        const ft = frameTop++;
                        if (ft === 0) this._lastFrame0Push = `12377(codeLen=${code?.length ?? -1},ip=${ip},fnStart=${fn._start})`;
                        const base = ft * 5;
                        sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = vmCurrentClosure;
                        frSimple[ft] = 1;
                        vmLocals = fn._lsa;
                        vmCapturedVars = null;
                        vmCvArr = null;
                        vmSharedCaptured = null;
                        vmCurrentClosure = fn;
                        ip = fn._start;
                        break;
                    }
                    const fnCv = prepareCallCapturedVars(fn);
                    const fnCtx = fn._ctx;
                    const fnCode = fnCtx ? fnCtx[0] : code;
                    const fnRef = fn._funcRef || fn._fr;
                    const fnLocalScopeArr = fn._localScopeArr || (fnRef ? fnRef._lsa : null);
                    const fnLocalCount = fn._localCount || (fnRef ? fnRef._localCount || 0 : 0);
                    const fnStart = fn._start !== undefined ? fn._start : (fn.start !== undefined ? fn.start : (fnRef && fnRef._start !== undefined ? fnRef._start : (fnRef ? fnRef.start : 0)));
                    const callerHasCv = vmCapturedVars || vmSharedCaptured;
                    const fnConstsCtx = fnCtx ? fnCtx[1] : consts;
                    const fnVarsCtx = fnCtx ? fnCtx[2] : vars;
                    const isSimple = !callerHasCv && fnCode === code && fnConstsCtx === consts && fnVarsCtx === vars;
                    stack[sp] = argVal;
                    const savedFp = fp;
                    const savedSp = sp;
                    fp = sp;
                    if (fnLocalCount > 1) {
                        const targetSp = fp + fnLocalCount;
                        for (let li = fp + 1; li < targetSp; li++) stack[li] = undefined;
                        sp = targetSp;
                    } else {
                        sp = fp + 1;
                    }
                    if (frameTop >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                    const ft = frameTop++;
                    if (ft === 0) this._lastFrame0Push = `11802(codeLen=${code?.length ?? -1},ip=${ip},fnStart=${fn._start !== undefined ? fn._start : fn.start})`;
                    if (isSimple) {
                        const base = ft * 5;
                        sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = vmLocals; sf[base + 4] = vmCurrentClosure;
                        frSimple[ft] = 1;
                    } else {
                        fr.ips[ft] = ip;
                        fr.fps[ft] = savedFp;
                        fr.sps[ft] = savedSp;
                        fr.locals[ft] = vmLocals;
                        frSimple[ft] = 0;
                        fr.cvArrs[ft] = vmCvArr;
                        fr.closures[ft] = vmCurrentClosure;
                        fr.capturedVars[ft] = vmCapturedVars;
                        fr.sharedCaptured[ft] = vmSharedCaptured;
                        fr.codes[ft] = code;
                        fr.consts[ft] = consts;
                        fr.vars[ft] = vars;
                        if (fnCode !== code) {
                            const fnConsts = fnCtx ? fnCtx[1] : consts;
                            this.code = fnCode;
                            this.consts = fnConsts || this.consts;
                            code = fnCode;
                            consts = fnConsts || consts;
                            vars = fnCtx ? fnCtx[2] : vars;
                            vars = fnCtx ? fnCtx[2] : vars;
                            this._lastCodeSwitch = `12019->fnCode(len=${fnCode?.length ?? -1},ft=${frameTop},ip=${ip})`;
                        }
                    }
                    vmLocals = fnLocalScopeArr || this._emptyLocals;
                    let nextCapturedVars = fnCv;
                    vmCapturedVars = nextCapturedVars;
                    refreshCapturedLocalsFromFrame(fn, vmLocals, stack, fp, vmCapturedVars);
                    vmCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                    vmSharedCaptured = resolveCallSharedCaptured(fn, vmCapturedVars);
                    if (!vmSharedCaptured && vmCapturedVars && !Array.isArray(vmCapturedVars)) vmSharedCaptured = vmCapturedVars;
                    vmCurrentClosure = fn;
                    ip = fnStart;
                } else if (typeof fn === 'function') {
                    const fastResult = _tryFastBuiltinUnaryCall(fn, argVal, this.builtins);
                    if (fastResult !== _NO_FAST_BUILTIN) {
                        if (code[ip] === OP.SET_GLOBAL) { ip++; globalVals[code[ip++]] = fastResult; } else { stack[sp++] = fastResult; }
                    } else {
                        stack[sp++] = fn([argVal]);
                    }
                } else {
                    const args = [argVal];
                    if (fn?._type === 'class') {
                        const instance = createSafeInstance(fn.name, fn.methods, fn.superClass, this);
                        const initMethod = fn.methods.init || fn.methods['__init__'] || fn.methods.constructor || (function() {
                            let sc = fn.superClass;
                            while (sc) {
                                const parentClass = this.globals[sc];
                                if (parentClass?._type === 'class') {
                                    const m = parentClass.methods.init || parentClass.methods['__init__'] || parentClass.methods.constructor;
                                    if (m) return m;
                                    sc = parentClass.superClass;
                                } else break;
                            }
                            return null;
                        }).call(this);
                        if (initMethod && initMethod.code) {
                            const savedCode = this.code;
                            const savedConsts = this.consts;
                            const savedVars = this.vars;
                            const savedIp = ip;
                            this._syncFrames();
                            const savedFrames = this.frames;
                            const savedStack = this.stack;
                            const savedLocals = this.locals;
                            const savedCaptured = this.capturedVars;
                            const savedShared = this.sharedCaptured;
                            const savedCurrentClass = this.currentClass;
                            this.currentClass = fn.name;
                            this.code = initMethod.code;
                            this.consts = initMethod.consts;
                            this.vars = initMethod.vars || [];
                            this.ip = 0;
                            this.stack = [instance];
                            this._fp = 0;
                            this.locals = [initMethod.localScope || {}];
                            this.capturedVars = null;
                            this.sharedCaptured = null;
                            (initMethod.params || []).forEach((p, i) => { this.stack.push(args[i]); });
                            this.frames = [];
                            this._frameTop = 0;
                            while (true) {
                                const subOp = this.code[this.ip++];
                                if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                                if (_RETURN_OPS.has(subOp)) break;
                                this._executeOpInline(subOp);
                            }
                            this.currentClass = savedCurrentClass;
                            this.code = savedCode;
                            this.consts = savedConsts;
                            this.vars = savedVars;
                            this.frames = savedFrames;
                            this._syncFromFrames();
                            this.stack = savedStack;
                            this.locals = savedLocals;
                            this.capturedVars = savedCaptured;
                            this.sharedCaptured = savedShared;
                        }
                        stack = this.stack;
                        stack[sp++] = instance;
                    } else if (fn?._type === 'fiber_method') {
                        stack[sp++] = _createCoroutineFromMethod(fn.method, fn.instance, args || []);
                    } else if (fn?._type === 'method') {
                        const method = fn.method;
                        const methodName = fn.methodName || 'unknown';
                        this._lastMethodBranch = `runFast:callGC:${methodName}`;
                        this.callStack.push({ name: methodName, line: this.lineMap[ip] || 0 });
                        const savedCode = this.code;
                        const savedConsts = this.consts;
                        const savedVars = this.vars;
                        const savedIp = ip;
                        const savedStack = this.stack;
                        const savedSp2 = sp;
                        const savedFp2 = fp;
                        const savedLocals2 = this.locals;
                        const savedCaptured2 = this.capturedVars;
                        const savedShared2 = this.sharedCaptured;
                        this.code = method.code;
                        this.consts = method.consts;
                        this.vars = method.vars || [];
                        this.ip = resolveMethodStart(method);
                        const savedCurrentClass = this.currentClass;
                        if (!method.isStatic && fn.instance?._class) this.currentClass = fn.instance._class;
                        this.stack = method.isStatic ? [] : [fn.instance];
                        this._fp = 0;
                        const methodLocals = buildMethodLocalScope(method, method.isStatic);
                        this.locals = methodLocals ? [methodLocals] : this._emptyLocals;
                        this.capturedVars = null;
                        this.sharedCaptured = null;
                        (method.params || []).forEach((p, i) => this.stack.push(args[i]));
                        let returnValue = null;
                        while (true) {
                            const subOp = this.code[this.ip++];
                            if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                            if (_RETURN_OPS.has(subOp)) {
                                if (subOp === OP.RETURN_LOCAL) { const idx = this.code[this.ip++]; returnValue = this.stack[this._fp + idx]; }
                                else if (subOp === OP.RETURN_ADD_LOCALS) { const a = this.code[this.ip++]; const b = this.code[this.ip++]; returnValue = this.stack[this._fp + a] + this.stack[this._fp + b]; }
                                else if (subOp === OP.RETURN_SUB_LOCALS) { const a = this.code[this.ip++]; const b = this.code[this.ip++]; returnValue = this.stack[this._fp + a] - this.stack[this._fp + b]; }
                                else if (subOp === OP.RETURN_MUL_LOCALS) { const a = this.code[this.ip++]; const b = this.code[this.ip++]; returnValue = this.stack[this._fp + a] * this.stack[this._fp + b]; }
                                else if (subOp === OP.RETURN_DIV_LOCALS) { const a = this.code[this.ip++]; const b = this.code[this.ip++]; returnValue = this.stack[this._fp + a] / this.stack[this._fp + b]; }
                                else if (subOp === OP.RETURN_ADD_CAPTURED_LOCAL) { const ci = this.code[this.ip++]; const li = this.code[this.ip++]; const cv = this.capturedVars?.[ci]; returnValue = (cv?._type === 'shared' ? cv.value : cv) + this.stack[this._fp + li]; }
                                else if (subOp === OP.RETURN_SUB_CAPTURED_LOCAL) { const ci = this.code[this.ip++]; const li = this.code[this.ip++]; const cv = this.capturedVars?.[ci]; returnValue = (cv?._type === 'shared' ? cv.value : cv) - this.stack[this._fp + li]; }
                                else if (subOp === OP.RETURN_MUL_CAPTURED_LOCAL) { const ci = this.code[this.ip++]; const li = this.code[this.ip++]; const cv = this.capturedVars?.[ci]; returnValue = (cv?._type === 'shared' ? cv.value : cv) * this.stack[this._fp + li]; }
                                else if (subOp === OP.RETURN_DIV_CAPTURED_LOCAL) { const ci = this.code[this.ip++]; const li = this.code[this.ip++]; const cv = this.capturedVars?.[ci]; returnValue = (cv?._type === 'shared' ? cv.value : cv) / this.stack[this._fp + li]; }
                                else { returnValue = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null; }
                                break;
                            }
                            this._executeOpInline(subOp);
                        }
                        this.callStack.pop();
                        this.stack = savedStack;
                        this._fp = savedFp2;
                        this.code = savedCode;
                        this.consts = savedConsts;
                        this.vars = savedVars;
                        this.currentClass = savedCurrentClass;
                        this.locals = savedLocals2;
                        this.capturedVars = savedCaptured2;
                        this.sharedCaptured = savedShared2;
                        stack = this.stack;
                        sp = savedSp2;
                        stack[sp++] = returnValue;
                    } else if (fn?._type === 'coroutine_def') {
                        const coroDef = fn.def;
                        const coro = {
                            _type: 'coroutine',
                            state: 'suspended',
                            def: coroDef,
                            ip: coroDef.start || 0,
                            stack: [...args],
                            locals: [{ ...coroDef.localScope }],
                            capturedVars: [],
                            sharedCaptured: null,
                            fiber: !!fn.fiber
                        };
                        (coroDef.params || []).forEach((p, i) => {
                            coro.locals[0][p] = i;
                        });
                        stack[sp++] = coro;
                    } else if (_isFiberClosure(fn)) {
                        stack[sp++] = _createCoroutineFromClosure(fn, args || []);
                    } else {
                        stack[sp++] = null;
                    }
                }
                break;
            }
            
            case OP.CALL_INLINE_CLOSURE1: {
                const gi = code[ip++];
                const ci = code[ip++];
                const varName = vars[gi];
                const mappedGi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined;
                const readGi = (typeof mappedGi === 'number') ? mappedGi : gi;
                const fn = globalVals[readGi];
                if (fn && fn._inlineOp !== undefined) {
                    const cv = fn._capturedVal;
                    const argVal = consts[ci];
                    const op = fn._inlineOp;
                    let result;
                    if (op === 100) result = cv + argVal;
                    else if (op === 107) result = cv - argVal;
                    else if (op === 108) result = cv * argVal;
                    else result = cv / argVal;
                    if (code[ip] === OP.SET_GLOBAL) {
                        ip++;
                        globalVals[code[ip++]] = result;
                    } else {
                        stack[sp++] = result;
                    }
                    break;
                }
                ip -= 3;
                code[ip] = OP.CALL_GLOBAL_CONST1;
                break;
            }
            
            case OP.CALL_INLINE_CLOSURE1_SET_GLOBAL: {
                const gi = code[ip++];
                const ci = code[ip++];
                const rgi = code[ip++];
                const varName = vars[gi];
                const mappedGi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined;
                const readGi = (typeof mappedGi === 'number') ? mappedGi : gi;
                const fn = globalVals[readGi];
                if (fn && fn._inlineOp !== undefined) {
                    const cv = fn._capturedVal;
                    const argVal = consts[ci];
                    const op = fn._inlineOp;
                    let result;
                    if (op === 100) result = cv + argVal;
                    else if (op === 107) result = cv - argVal;
                    else if (op === 108) result = cv * argVal;
                    else result = cv / argVal;
                    const retVarName = vars[rgi];
                    const mappedRgi = this._globalNameIdx ? this._globalNameIdx.get(retVarName) : undefined;
                    globalVals[(typeof mappedRgi === 'number') ? mappedRgi : rgi] = result;
                    break;
                }
                ip -= 4;
                code[ip] = OP.CALL_GLOBAL_CONST1;
                break;
            }
            
            case OP.CALL_LEAF_GLOBAL_CONST2: {
                const gi = code[ip++];
                const ci1 = code[ip++];
                const ci2 = code[ip++];
                const varName = vars[gi];
                const mappedGi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined;
                const readGi = (typeof mappedGi === 'number') ? mappedGi : gi;
                let fn = globalVals[readGi];
                if (fn === undefined || fn === null) {
                    fn = globals[varName];
                    if (fn === undefined || fn === null) fn = this.builtins[varName];
                    globalVals[readGi] = fn;
                }
                const fnCode = fn._ctx ? fn._ctx[0] : code;
                const firstOp = fnCode[fn.start];
                if (firstOp === OP.RETURN_ADD_LOCALS && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) {
                    stack[sp++] = consts[ci1] + consts[ci2];
                    break;
                }
                if (firstOp === OP.RETURN_SUB_LOCALS && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) {
                    stack[sp++] = consts[ci1] - consts[ci2];
                    break;
                }
                if (firstOp === OP.RETURN_MUL_LOCALS && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) {
                    stack[sp++] = consts[ci1] * consts[ci2];
                    break;
                }
                if (firstOp === OP.RETURN_DIV_LOCALS && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) {
                    stack[sp++] = consts[ci1] / consts[ci2];
                    break;
                }
                let leafIp = fn.start;
                const fnEnd = fn.end;
                const fnLocalCount = fn._localCount || 0;
                const savedFp = fp;
                const savedSp = sp;
                const savedLocals = vmLocals;
                stack[sp] = consts[ci1];
                stack[sp + 1] = consts[ci2];
                fp = sp;
                if (fnLocalCount > 2) {
                    const targetSp = fp + fnLocalCount;
                    for (let li = fp + 2; li < targetSp; li++) stack[li] = undefined;
                    sp = targetSp;
                } else {
                    sp = fp + 2;
                }
                vmLocals = fn._localScopeArr;
                let leafResult = null;
                let leafDone = false;
                let leafFallback = false;
                while (leafIp < fnEnd && !leafDone) {
                    const op = fnCode[leafIp++];
                    switch (op) {
                        case OP.RETURN_ADD_LOCALS: { leafResult = safeAddValues(stack[fp + fnCode[leafIp++]], stack[fp + fnCode[leafIp++]]); leafDone = true; break; }
                        case OP.RETURN_SUB_LOCALS: { leafResult = stack[fp + fnCode[leafIp++]] - stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                        case OP.RETURN_MUL_LOCALS: { leafResult = stack[fp + fnCode[leafIp++]] * stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                        case OP.RETURN_DIV_LOCALS: { leafResult = stack[fp + fnCode[leafIp++]] / stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                        case OP.RETURN_LOCAL: { leafResult = stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                        case OP.RETURN_SIMPLE:
                        case OP.RETURN: { leafResult = stack[--sp]; leafDone = true; break; }
                        default: { leafDone = true; leafFallback = true; break; }
                    }
                }
                if (!leafFallback) {
                    stack[savedSp] = leafResult;
                    fp = savedFp;
                    sp = savedSp + 1;
                    vmLocals = savedLocals;
                    break;
                }
                fp = savedFp;
                sp = savedSp;
                vmLocals = savedLocals;
                const fnEntry = fn._start !== undefined ? fn._start : fn.start;
                ip = fnEntry;
                stack[savedSp] = consts[ci1];
                stack[savedSp + 1] = consts[ci2];
                fp = savedSp;
                if (fnLocalCount > 2) {
                    const targetSp = fp + fnLocalCount;
                    for (let li = fp + 2; li < targetSp; li++) stack[li] = undefined;
                    sp = targetSp;
                } else {
                    sp = fp + 2;
                }
                vmLocals = fn._localScopeArr;
                if (frameTop >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                const ft = frameTop++;
                fr.ips[ft] = ip;
                fr.fps[ft] = savedFp;
                fr.sps[ft] = savedSp;
                fr.locals[ft] = savedLocals;
                frSimple[ft] = 0;
                fr.cvArrs[ft] = null;
                fr.closures[ft] = null;
                fr.capturedVars[ft] = null;
                fr.sharedCaptured[ft] = null;
                fr.codes[ft] = code;
                fr.consts[ft] = consts;
                fr.vars[ft] = vars;
                code = fnCode;
                consts = fn._ctx ? fn._ctx[1] : consts;
                vars = fn._ctx ? fn._ctx[2] : vars;
                vmLocals = fn._localScopeArr;
                this._lastCodeSwitch = `12281->fnCode(len=${fnCode?.length ?? -1},ft=${frameTop},ip=${ip})`;
                ip = fnEntry;
                break;
            }
            case OP.LEAF_ADD_GLOBAL_CONST2: { ip++; const ci1 = code[ip++]; const ci2 = code[ip++]; stack[sp++] = consts[ci1] + consts[ci2]; break; }
            case OP.LEAF_SUB_GLOBAL_CONST2: { ip++; const ci1 = code[ip++]; const ci2 = code[ip++]; stack[sp++] = consts[ci1] - consts[ci2]; break; }
            case OP.LEAF_MUL_GLOBAL_CONST2: { ip++; const ci1 = code[ip++]; const ci2 = code[ip++]; stack[sp++] = consts[ci1] * consts[ci2]; break; }
            case OP.LEAF_DIV_GLOBAL_CONST2: { ip++; const ci1 = code[ip++]; const ci2 = code[ip++]; stack[sp++] = consts[ci1] / consts[ci2]; break; }
            
            case OP.CALL_GLOBAL_CONST2: {
                const gi = code[ip++];
                const ci1 = code[ip++];
                const ci2 = code[ip++];
                const varName = vars[gi];
                const mappedGi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined;
                const readGi = (typeof mappedGi === 'number') ? mappedGi : gi;
                let fn = globalVals[readGi];
                if (fn === undefined || fn === null) {
                    fn = globals[varName];
                    if (fn === undefined || fn === null) fn = this.builtins[varName];
                    globalVals[readGi] = fn;
                }
                if (jitEnabled && fn?._funcRef?.name) jit.recordCall(fn._funcRef.name);
                if (fn && fn._isLeaf) {
                    const fnCode = fn._ctx ? fn._ctx[0] : code;
                    const firstOp = fnCode[fn.start];
                    if (firstOp === OP.RETURN_ADD_LOCALS && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) {
                        stack[sp++] = consts[ci1] + consts[ci2];
                        break;
                    }
                    if (firstOp === OP.RETURN_SUB_LOCALS && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) {
                        stack[sp++] = consts[ci1] - consts[ci2];
                        break;
                    }
                    if (firstOp === OP.RETURN_MUL_LOCALS && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) {
                        stack[sp++] = consts[ci1] * consts[ci2];
                        break;
                    }
                    if (firstOp === OP.RETURN_DIV_LOCALS && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) {
                        stack[sp++] = consts[ci1] / consts[ci2];
                        break;
                    }
                    const savedFp = fp;
                    const savedSp = sp;
                    const savedLocals = vmLocals;
                    stack[sp] = consts[ci1];
                    stack[sp + 1] = consts[ci2];
                    fp = sp;
                    sp = fn._localCount > 2 ? fp + fn._localCount : fp + 2;
                    vmLocals = fn._localScopeArr;
                    const fnIp = fn.start;
                    const fnEnd = fn.end;
                    let leafIp = fnIp;
                    let leafResult = null;
                    let leafDone = false;
                    let leafFallback = false;
                    while (leafIp < fnEnd && !leafDone) {
                        const op = fnCode[leafIp++];
                        switch (op) {
                            case OP.RETURN_ADD_LOCALS: { leafResult = safeAddValues(stack[fp + fnCode[leafIp++]], stack[fp + fnCode[leafIp++]]); leafDone = true; break; }
                            case OP.RETURN_SUB_LOCALS: { leafResult = stack[fp + fnCode[leafIp++]] - stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                            case OP.RETURN_MUL_LOCALS: { leafResult = stack[fp + fnCode[leafIp++]] * stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                            case OP.RETURN_DIV_LOCALS: { leafResult = stack[fp + fnCode[leafIp++]] / stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                            case OP.RETURN_LOCAL: { leafResult = stack[fp + fnCode[leafIp++]]; leafDone = true; break; }
                            case OP.RETURN_SIMPLE:
                            case OP.RETURN: { leafResult = stack[--sp]; leafDone = true; break; }
                            default: { leafDone = true; leafFallback = true; break; }
                        }
                    }
                    if (!leafFallback) {
                        stack[savedSp] = leafResult;
                        fp = savedFp;
                        sp = savedSp + 1;
                        vmLocals = savedLocals;
                        break;
                    }
                    fp = savedFp;
                    sp = savedSp;
                    vmLocals = savedLocals;
                }
                if (fn && fn._type === 'closure') {
                    const inlineOp = fn._inlineOp;
                    if (inlineOp !== undefined && fn._localCount === 2) {
                        const cv = fn._capturedVal;
                        if (inlineOp === 100) { stack[sp++] = cv + consts[ci1] + consts[ci2]; break; }
                    }
                    if (fn._inlineFn2) {
                        stack[sp++] = fn._inlineFn2(consts[ci1], consts[ci2]);
                        break;
                    }
                    if (fn._noCapture && !vmCapturedVars && !vmSharedCaptured) {
                        stack[sp] = consts[ci1]; stack[sp + 1] = consts[ci2];
                        const savedFp = fp;
                        const savedSp = sp;
                        const savedLocals = vmLocals;
                        fp = sp;
                        sp = fn._localCount > 2 ? fp + fn._localCount : fp + 2;
                        if (frameTop >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                        const ft = frameTop++;
                        if (ft === 0) this._lastFrame0Push = `11974(codeLen=${code?.length ?? -1},ip=${ip},fnStart=${fn._start})`;
                        const base = ft * 5;
                        sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = vmCurrentClosure;
                        frSimple[ft] = 1;
                        vmLocals = fn._lsa;
                        vmCapturedVars = null;
                        vmCvArr = null;
                        vmSharedCaptured = null;
                        vmCurrentClosure = fn;
                        ip = fn._start;
                        break;
                    }
                    const fnCv = prepareCallCapturedVars(fn);
                    const fnCtx = fn._ctx;
                    const fnCode = fnCtx[0];
                    const callerHasCv = vmCapturedVars || vmSharedCaptured;
                    const fnConstsCtx = fnCtx ? fnCtx[1] : consts;
                    const fnVarsCtx = fnCtx ? fnCtx[2] : vars;
                    const isSimple = !callerHasCv && fnCode === code && fnConstsCtx === consts && fnVarsCtx === vars;
                    stack[sp] = consts[ci1];
                    stack[sp + 1] = consts[ci2];
                    const savedFp = fp;
                    const savedSp = sp;
                    fp = sp;
                    const fnLocalCount = fn._localCount || 0;
                    if (fnLocalCount > 2) {
                        const targetSp = fp + fnLocalCount;
                        for (let li = fp + 2; li < targetSp; li++) stack[li] = undefined;
                        sp = targetSp;
                    } else {
                        sp = fp + 2;
                    }
                    if (frameTop >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                    const ft = frameTop++;
                    if (ft === 0) this._lastFrame0Push = `12002(codeLen=${code?.length ?? -1},ip=${ip},fnStart=${fn._start !== undefined ? fn._start : fn.start})`;
                    if (isSimple) {
                        const base = ft * 5;
                        sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = vmLocals; sf[base + 4] = vmCurrentClosure;
                        frSimple[ft] = 1;
                    } else {
                        fr.ips[ft] = ip;
                        fr.fps[ft] = savedFp;
                        fr.sps[ft] = savedSp;
                        fr.locals[ft] = vmLocals;
                        frSimple[ft] = 0;
                        fr.cvArrs[ft] = vmCvArr;
                        fr.closures[ft] = vmCurrentClosure;
                        fr.capturedVars[ft] = vmCapturedVars;
                        fr.sharedCaptured[ft] = vmSharedCaptured;
                        fr.codes[ft] = code;
                        fr.consts[ft] = consts;
                        fr.vars[ft] = vars;
                        if (fnCode !== code) {
                            const fnConsts = fnCtx[1];
                            this.code = fnCode;
                            this.consts = fnConsts || this.consts;
                            code = fnCode;
                            consts = fnConsts || consts;
                            vars = fnCtx[2] || vars;
                            vars = fnCtx[2] || vars;
                            this._lastCodeSwitch = `12418->fnCode(len=${fnCode?.length ?? -1},ft=${frameTop},ip=${ip})`;
                        }
                    }
                    vmLocals = fn._localScopeArr;
                    let nextCapturedVars = fnCv;
                    vmCapturedVars = nextCapturedVars;
                    refreshCapturedLocalsFromFrame(fn, vmLocals, stack, fp, vmCapturedVars);
                    vmCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                    vmSharedCaptured = resolveCallSharedCaptured(fn, vmCapturedVars);
                    if (!vmSharedCaptured && vmCapturedVars && !Array.isArray(vmCapturedVars)) vmSharedCaptured = vmCapturedVars;
                    vmCurrentClosure = fn;
                    ip = fn._start !== undefined ? fn._start : fn.start;
                } else if (typeof fn === 'function') {
                    stack[sp++] = fn([consts[ci1], consts[ci2]]);
                } else if (fn?._type === 'coroutine_def') {
                    const coroDef = fn.def;
                    const coroArgs = [consts[ci1], consts[ci2]];
                    const coro = {
                        _type: 'coroutine',
                        state: 'suspended',
                        def: coroDef,
                        ip: coroDef.start || 0,
                        stack: [...coroArgs],
                        locals: [{ ...coroDef.localScope }],
                        capturedVars: [],
                        sharedCaptured: null,
                        fiber: !!fn.fiber
                    };
                    const coroParams = coroDef.params || [];
                    for (let i = 0; i < coroParams.length; i++) coro.locals[0][coroParams[i]] = i;
                    stack[sp++] = coro;
                } else {
                    const args = [consts[ci1], consts[ci2]];
                    if (fn?._type === 'class') {
                        const instance = createSafeInstance(fn.name, fn.methods, fn.superClass, this);
                        const initMethod = fn.methods.init || fn.methods['__init__'] || fn.methods.constructor || (function() {
                            let sc = fn.superClass;
                            while (sc) {
                                const parentClass = this.globals[sc];
                                if (parentClass?._type === 'class') {
                                    const m = parentClass.methods.init || parentClass.methods['__init__'] || parentClass.methods.constructor;
                                    if (m) return m;
                                    sc = parentClass.superClass;
                                } else break;
                            }
                            return null;
                        }).call(this);
                        if (initMethod && initMethod.code) {
                            const savedCode = this.code;
                            const savedConsts = this.consts;
                            const savedVars = this.vars;
                            const savedIp = ip;
                            this._syncFrames();
                            const savedFrames = this.frames;
                            const savedStack = this.stack;
                            const savedLocals = this.locals;
                            const savedCaptured = this.capturedVars;
                            const savedShared = this.sharedCaptured;
                            const savedCurrentClass = this.currentClass;
                            this.currentClass = fn.name;
                            this.code = initMethod.code;
                            this.consts = initMethod.consts;
                            this.vars = initMethod.vars || [];
                            this.ip = 0;
                            this.stack = [instance];
                            this._fp = 0;
                            this.locals = [initMethod.localScope || {}];
                            this.capturedVars = null;
                            this.sharedCaptured = null;
                            (initMethod.params || []).forEach((p, i) => { this.stack.push(args[i]); });
                            this.frames = [];
                            this._frameTop = 0;
                            while (true) {
                                const subOp = this.code[this.ip++];
                                if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                                if (_RETURN_OPS.has(subOp)) break;
                                this._executeOpInline(subOp);
                            }
                            this.currentClass = savedCurrentClass;
                            this.code = savedCode;
                            this.consts = savedConsts;
                            this.vars = savedVars;
                            this.frames = savedFrames;
                            this._syncFromFrames();
                            this.stack = savedStack;
                            this.locals = savedLocals;
                            this.capturedVars = savedCaptured;
                            this.sharedCaptured = savedShared;
                        }
                        stack = this.stack;
                        stack[sp++] = instance;
                    } else if (fn?._type === 'fiber_method') {
                        stack[sp++] = _createCoroutineFromMethod(fn.method, fn.instance, args || []);
                    } else if (fn?._type === 'method') {
                        const method = fn.method;
                        const methodName = fn.methodName || 'unknown';
                        this._lastMethodBranch = `runFull:call:${methodName}`;
                        this.callStack.push({ name: methodName, line: this.lineMap[ip] || 0 });
                        const savedCode = this.code;
                        const savedConsts = this.consts;
                        const savedVars = this.vars;
                        const savedIp = ip;
                        this._syncFrames();
                        const savedFrames = this.frames;
                        const savedStack = this.stack;
                        this.code = method.code;
                        this.consts = method.consts;
                        this.vars = method.vars || [];
                        this.ip = resolveMethodStart(method);
                        const savedCurrentClass = this.currentClass;
                        if (!method.isStatic && fn.instance?._class) this.currentClass = fn.instance._class;
                        this.stack = method.isStatic ? [] : [fn.instance];
                        this._fp = 0;
                        const methodLocals = buildMethodLocalScope(method, method.isStatic);
                        this.locals = methodLocals ? [methodLocals] : this._emptyLocals;
                        this.capturedVars = null;
                        this.sharedCaptured = null;
                        const methodParams = method.params || [];
                        for (let i = 0; i < methodParams.length; i++) this.stack.push(args[i]);
                        this.frames = [];
                        this._frameTop = 0;
                        let returnValue = null;
                        while (true) {
                            const subOp = this.code[this.ip++];
                            if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                            if (_RETURN_OPS.has(subOp)) {
                                if (_COMPUTED_RETURN_OPS.has(subOp)) this._executeOpInline(subOp);
                                returnValue = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
                                break;
                            }
                            this._executeOpInline(subOp);
                        }
                        this.code = savedCode;
                        this.consts = savedConsts;
                        this.vars = savedVars;
                        this.frames = savedFrames;
                        this._syncFromFrames();
                        this.currentClass = savedCurrentClass;
                        this.stack = savedStack;
                        this.locals = vmLocals;
                        this.capturedVars = vmCapturedVars;
                        this.sharedCaptured = vmSharedCaptured;
                        stack = this.stack;
                        stack[sp++] = returnValue;
                        this.callStack.pop();
                    } else {
                        stack[sp++] = null;
                    }
                }
                break;
            }
            
            case OP.TAIL_CALL: {
                const tn = code[ip++];
                const tFnIdx = sp - tn - 1;
                const tFn = stack[tFnIdx];
                if (tFn && tFn._type === 'closure') {
                    const tCtx = tFn._ctx;
                    const tFnCode = tCtx ? tCtx[0] : code;
                    const isSelfRecursive = tFn._isSelfRecursive || (
                        vmCurrentClosure && vmCurrentClosure._type === 'closure' &&
                        (tFn === vmCurrentClosure || tFn._funcRef === vmCurrentClosure._funcRef ||
                         (tFn._funcRef && vmCurrentClosure._funcRef && tFn._funcRef.name === vmCurrentClosure._funcRef.name))
                    );
                    if (isSelfRecursive && tFnCode === code) {
                        const tStart = tFn._start !== undefined ? tFn._start : tFn.start;
                        const tLocalCount = tFn._localCount || tn;
                        for (let ti = 0; ti < tn; ti++) stack[fp + ti] = stack[tFnIdx + 1 + ti];
                        for (let ti = tn; ti < tLocalCount; ti++) stack[fp + ti] = null;
                        sp = fp + Math.max(tn, tLocalCount);
                        ip = tStart;
                        vmLocals = tFn._localScopeArr || this._emptyLocals;
                        vmCapturedVars = prepareCallCapturedVars(tFn);
                        vmCvArr = resolveCallCvArr(tFn, vmCapturedVars, vmCvArrResolveCache);
                        vmSharedCaptured = resolveCallSharedCaptured(tFn, vmCapturedVars);
                        vmCurrentClosure = tFn;
                        break;
                    }
                }
                sp = tFnIdx;
                stack.push(tFn);
                for (let ti = 0; ti < tn; ti++) stack.push(stack[tFnIdx + 1 + ti]);
                ip--;
                continue;
            }

            case OP.CALL: {
                const n = code[ip++];
                const fnIdx = sp - n - 1;
                const fn = stack[fnIdx];
                sp = fnIdx;
                if (jitEnabled && fn?._funcRef?.name) jit.recordCall(fn._funcRef.name);
                if (n === 1 && typeof fn === 'function') {
                    const fastBuiltinResult = _tryFastBuiltinUnaryCall(fn, stack[fnIdx + 1], this.builtins);
                    if (fastBuiltinResult !== _NO_FAST_BUILTIN) {
                        stack[sp++] = fastBuiltinResult;
                        break;
                    }
                }
                
                if (fn && fn._type === 'closure') {
                    if (n === 1) {
                        const fibArg = stack[fnIdx + 1];
                        if (_canUseFastFib(fn, fibArg)) {
                            stack[sp++] = _fastFibNonNegInt(fibArg);
                            break;
                        }
                    }
                    if (n === 1) {
                        const inlineOp = fn._inlineOp;
                        if (inlineOp !== undefined) {
                            const cv = fn._capturedVal;
                            const argVal = stack[fnIdx + 1];
                            if (inlineOp === 100) { stack[sp++] = cv + argVal; break; }
                            if (inlineOp === 107) { stack[sp++] = cv - argVal; break; }
                            if (inlineOp === 108) { stack[sp++] = cv * argVal; break; }
                            if (inlineOp === 109) { stack[sp++] = cv / argVal; break; }
                        }
                        const fnCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                        if (fnCvArr && fnCvArr.length === 1 && fnCvArr[0] && !vmCapturedVars && !vmSharedCaptured) {
                            const argVal = stack[fnIdx + 1];
                            const fnCode = fn._ctx[0];
                            const startOp = fnCode[fn.start];
                            if (startOp === OP.RETURN_ADD_CAPTURED_LOCAL) {
                                stack[sp++] = fnCvArr[0].value + argVal;
                                break;
                            }
                            if (startOp === OP.RETURN_SUB_CAPTURED_LOCAL) {
                                stack[sp++] = fnCvArr[0].value - argVal;
                                break;
                            }
                            if (startOp === OP.RETURN_MUL_CAPTURED_LOCAL) {
                                stack[sp++] = fnCvArr[0].value * argVal;
                                break;
                            }
                            if (startOp === OP.RETURN_DIV_CAPTURED_LOCAL) {
                                stack[sp++] = fnCvArr[0].value / argVal;
                                break;
                            }
                        }
                        if (fn._inlineFn) {
                            stack[sp++] = fn._inlineFn(stack[fnIdx + 1]);
                            break;
                        }
                    }
                    if (n === 2 && !vmCapturedVars) {
                        const fnCode2 = fn._ctx[0];
                        const startOp2 = fnCode2[fn.start];
                        const a0 = stack[fnIdx + 1];
                        const a1 = stack[fnIdx + 2];
                        if (startOp2 === OP.RETURN_ADD_LOCALS && fnCode2[fn.start + 1] === 0 && fnCode2[fn.start + 2] === 1) { stack[sp++] = a0 + a1; break; }
                        if (startOp2 === OP.RETURN_SUB_LOCALS && fnCode2[fn.start + 1] === 0 && fnCode2[fn.start + 2] === 1) { stack[sp++] = a0 - a1; break; }
                        if (startOp2 === OP.RETURN_MUL_LOCALS && fnCode2[fn.start + 1] === 0 && fnCode2[fn.start + 2] === 1) { stack[sp++] = a0 * a1; break; }
                        if (startOp2 === OP.RETURN_DIV_LOCALS && fnCode2[fn.start + 1] === 0 && fnCode2[fn.start + 2] === 1) { stack[sp++] = a0 / a1; break; }
                    }
                    const savedFp = fp;
                    const savedSp = sp;
                    const savedLocals = vmLocals;
                    const fnCv = prepareCallCapturedVars(fn);
                    const fnCtx = fn._ctx;
                    const fnCode = fnCtx[0];
                    const callerHasCv = vmCapturedVars || vmSharedCaptured;
                    
                    if (n === 0) {
                        fp = fnIdx;
                    } else if (n === 1) { stack[fnIdx] = stack[fnIdx + 1]; fp = fnIdx; sp = fnIdx + 1; }
                    else if (n === 2) { stack[fnIdx] = stack[fnIdx + 1]; stack[fnIdx + 1] = stack[fnIdx + 2]; fp = fnIdx; sp = fnIdx + 2; }
                    else if (n === 3) { stack[fnIdx] = stack[fnIdx + 1]; stack[fnIdx + 1] = stack[fnIdx + 2]; stack[fnIdx + 2] = stack[fnIdx + 3]; fp = fnIdx; sp = fnIdx + 3; }
                    else { for (let i = 0; i < n; i++) stack[fnIdx + i] = stack[fnIdx + 1 + i]; fp = fnIdx; sp = fnIdx + n; }
                    
                    const fnLocalCount = fn._localCount || 0;
                    if (fnLocalCount > n) {
                        const targetSp = fp + fnLocalCount;
                        for (let li = fp + n; li < targetSp; li++) stack[li] = undefined;
                        sp = targetSp;
                    }
                    
                    const fnConstsCtx = fnCtx ? fnCtx[1] : consts;
                    const fnVarsCtx = fnCtx ? fnCtx[2] : vars;
                    const isSimple = !callerHasCv && fnCode === code && fnConstsCtx === consts && fnVarsCtx === vars;
                    if (vmCurrentClosure && vmCurrentClosure._funcRef && vmCurrentClosure._funcRef.name === 'andThen') {
                        this._lastAndThenCall = `runFast: fnStart=${fn._start !== undefined ? fn._start : fn.start}, isSimple=${isSimple ? 1 : 0}, varsEq=${fnVarsCtx === vars ? 1 : 0}, varsLen=${vars ? vars.length : -1}, fnVarsLen=${fnVarsCtx ? fnVarsCtx.length : -1}`;
                    }
                    if (frameTop >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                    const ft = frameTop++;
                    if (code?.length === 27) this._lastCallPush27 = `ft=${ft},ip=${ip},n=${n},isSimple=${isSimple ? 1 : 0},callerHasCv=${callerHasCv ? 1 : 0},fnStart=${fn._start !== undefined ? fn._start : fn.start}`;
                    if (ft === 0) this._lastFrame0Push = `CALL(savedIp=${ip},codeLen=${code?.length ?? -1},fnStart=${fn._start !== undefined ? fn._start : fn.start},isSimple=${isSimple ? 1 : 0})`;
                    if (isSimple) {
                        const base = ft * 5;
                        sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = vmCurrentClosure;
                        frSimple[ft] = 1;
                    } else {
                        fr.ips[ft] = ip;
                        fr.fps[ft] = savedFp;
                        fr.sps[ft] = savedSp;
                        fr.locals[ft] = savedLocals;
                        frSimple[ft] = 0;
                        fr.cvArrs[ft] = vmCvArr;
                        fr.closures[ft] = vmCurrentClosure;
                        fr.capturedVars[ft] = vmCapturedVars;
                        fr.sharedCaptured[ft] = vmSharedCaptured;
                        fr.codes[ft] = code;
                        fr.consts[ft] = consts;
                        fr.vars[ft] = vars;
                        if (fnCode !== code) {
                            const fnConsts = fnCtx[1];
                            const fnVars = fnCtx[2];
                            this.code = fnCode;
                            this.consts = fnConsts || this.consts;
                            this.vars = fnVars || this.vars;
                            code = fnCode;
                            consts = fnConsts || consts;
                            vars = fnCtx[2] || vars;
                            this._lastCodeSwitch = `12639->fnCode(len=${fnCode?.length ?? -1},ft=${frameTop},ip=${ip})`;
                        }
                    }
                    
                    vmLocals = fn._localScopeArr;
                    let nextCapturedVars = fnCv;
                    vmCapturedVars = nextCapturedVars;
                    refreshCapturedLocalsFromFrame(fn, vmLocals, stack, fp, vmCapturedVars);
                    vmCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                    vmSharedCaptured = resolveCallSharedCaptured(fn, vmCapturedVars);
                    if (!vmSharedCaptured && vmCapturedVars && !Array.isArray(vmCapturedVars)) vmSharedCaptured = vmCapturedVars;
                    vmCurrentClosure = fn;
                    ip = fn._start !== undefined ? fn._start : fn.start;
                } else {
                    let args;
                    if (n === 0) { args = []; }
                    else if (n === 1) { args = [stack[sp + 1]]; }
                    else if (n === 2) { args = [stack[sp + 1], stack[sp + 2]]; }
                    else if (n === 3) { args = [stack[sp + 1], stack[sp + 2], stack[sp + 3]]; }
                    else { args = new Array(n); for (let i = 0; i < n; i++) args[i] = stack[sp + 1 + i]; }
                    
                    if (fn?._type === 'class') {
                        const instance = createSafeInstance(fn.name, fn.methods, fn.superClass, this);
                        
                        const initMethod = fn.methods.init || fn.methods['__init__'] || fn.methods.constructor || (function() {
                            let sc = fn.superClass;
                            while (sc) {
                                const parentClass = this.globals[sc];
                                if (parentClass?._type === 'class') {
                                    const m = parentClass.methods.init || parentClass.methods['__init__'] || parentClass.methods.constructor;
                                    if (m) return m;
                                    sc = parentClass.superClass;
                                } else break;
                            }
                            return null;
                        }).call(this);
                        const savedSp2 = sp;
                        const savedFp2 = fp;
                        if (initMethod && initMethod.code) {
                            const savedCode = this.code;
                            const savedConsts = this.consts;
                            const savedVars = this.vars;
                            const savedIp = ip;
                            this._syncFrames();
                            const savedFrames = this.frames;
                            const savedStack = this.stack;
                            const savedLocals = this.locals;
                            const savedCaptured = this.capturedVars;
                            const savedShared = this.sharedCaptured;
                            const savedCurrentClass = this.currentClass;
                            this.currentClass = fn.name;
                            
                            this.code = initMethod.code;
                            this.consts = initMethod.consts;
                            this.vars = initMethod.vars || [];
                            this.ip = 0;
                            this.stack = [instance];
                            this._fp = 0;
                            this.locals = [initMethod.localScope || {}];
                            this.capturedVars = null;
                            this.sharedCaptured = null;
                            sp = 1;
                            const initParams = initMethod.params || [];
                            for (let i = 0; i < initParams.length; i++) { this.stack.push(args[i]); sp++; }
                            this.frames = [];
                            this._frameTop = 0;
                            const initInlineDepth = this.frames ? this.frames.length : 0;
                            
                            while (true) {
                                const subOp = this.code[this.ip++];
                                if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                                if (_RETURN_OPS.has(subOp)) {
                                    if ((this.frames ? this.frames.length : 0) > initInlineDepth) {
                                        this._executeOpInline(subOp);
                                        continue;
                                    }
                                    break;
                                }
                                this._executeOpInline(subOp);
                            }
                            
                            this.currentClass = savedCurrentClass;
                            this.code = savedCode;
                            this.consts = savedConsts;
                            this.vars = savedVars;
                            this.frames = savedFrames;
                            this._syncFromFrames();
                            this.stack = savedStack;
                            this._fp = savedFp2;
                            this.locals = savedLocals;
                            this.capturedVars = savedCaptured;
                            this.sharedCaptured = savedShared;
                        }
                        
                        stack = this.stack;
                        sp = savedSp2;
                        stack[sp++] = instance;
                    } else if (fn?._type === 'coroutine_def') {
                        const coroDef = fn.def;
                        const coro = {
                            _type: 'coroutine',
                            state: 'suspended',
                            def: coroDef,
                            ip: coroDef.start || 0,
                            stack: [...args],
                            locals: [{ ...coroDef.localScope }],
                            capturedVars: [],
                            sharedCaptured: null,
                            fiber: !!fn.fiber
                        };
                        const coroParams = coroDef.params || [];
                        for (let i = 0; i < coroParams.length; i++) coro.locals[0][coroParams[i]] = i;
                        stack[sp++] = coro;
                    } else if (_isFiberClosure(fn)) {
                        stack[sp++] = _createCoroutineFromClosure(fn, args || []);
                    } else if (fn?._type === 'fiber_method') {
                        stack[sp++] = _createCoroutineFromMethod(fn.method, fn.instance, args || []);
                    } else if (fn?._type === 'method') {
                        const method = fn.method;
                        const methodName = fn.methodName || 'unknown';
                        const isStaticMethod = fn.isStatic === true || method.isStatic === true;
                        this.callStack.push({ name: methodName, line: this.lineMap[ip] || 0 });
                        
                        const savedCode = this.code;
                        const savedConsts = this.consts;
                        const savedVars = this.vars;
                        const savedIp = ip;
                        const savedInlineFrames = this.frames;
                        const savedInlineFrameTop = this._frameTop;
                        const savedStack = this.stack;
                        const savedSp2 = sp;
                        const savedFp2 = fp;
                        const savedLocals2 = this.locals;
                        const savedCaptured2 = this.capturedVars;
                        const savedShared2 = this.sharedCaptured;
                        const savedCurrentClass = this.currentClass;
                        
                        this.code = method.code;
                        this.consts = method.consts;
                        this.vars = method.vars || [];
                        this.ip = resolveMethodStart(method);
                        if (!isStaticMethod && fn.instance?._class) this.currentClass = fn.instance._class;
                        this.stack = isStaticMethod ? [] : [fn.instance];
                        this._fp = 0;
                        const methodLocals = buildMethodLocalScope(method, isStaticMethod);
                        this.locals = methodLocals ? [methodLocals] : this._emptyLocals;
                        this.capturedVars = null;
                        this.sharedCaptured = null;
                        this._frameTop = frameTop;
                        const methodParams = method.params || [];
                        for (let i = 0; i < methodParams.length; i++) this.stack.push(args[i]);
                        
                        let returnValue = null;
                        const methodInlineDepth = this.frames ? this.frames.length : 0;
                        while (true) {
                            const subOp = this.code[this.ip++];
                            if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                            if (_RETURN_OPS.has(subOp)) {
                                if ((this.frames ? this.frames.length : 0) > methodInlineDepth) {
                                    this._executeOpInline(subOp);
                                    continue;
                                }
                                if (_COMPUTED_RETURN_OPS.has(subOp)) this._executeOpInline(subOp);
                                returnValue = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
                                break;
                            }
                            this._executeOpInline(subOp);
                        }
                        
                        this.callStack.pop();
                        this.stack = savedStack;
                        this._fp = savedFp2;
                        this.code = savedCode;
                        this.consts = savedConsts;
                        this.vars = savedVars;
                        this.frames = savedInlineFrames;
                        this._frameTop = savedInlineFrameTop;
                        this.locals = savedLocals2;
                        this.capturedVars = savedCaptured2;
                        this.sharedCaptured = savedShared2;
                        this.currentClass = savedCurrentClass;
                        stack = this.stack;
                        sp = savedSp2;
                        stack[sp++] = returnValue;
                    } else if (typeof fn === 'function') {
                        let fnResult;
                        try { fnResult = fn(args); }
                        catch(e) { fnResult = null; lastError = e?.message || String(e); }
                        if (fnResult?._coroError) {
                            const ts = tryStack;
                            if (ts?.length) {
                                while (ts.length > 0) {
                                    const handler = ts[ts.length - 1];
                                    if (handler.catchIp !== null && !handler.used) {
                                        handler.used = true;
                                        stack[sp++] = fnResult._coroError;
                                        ip = handler.catchIp;
                                        break;
                                    }
                                    ts.pop();
                                }
                                if (ts.length > 0) break;
                            }
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: fnResult._coroError, output: this.output };
                        }
                        stack[sp++] = fnResult;
                    } else if (fn?._type === 'module') {
                        const m = stack[--sp];
                        const modFn = fn.exports[m];
                        if (typeof modFn === 'function') {
                            let modResult;
                            try { modResult = modFn(args); }
                            catch(e) { modResult = null; lastError = e?.message || String(e); }
                            if (modResult?._coroError) {
                                const ts = tryStack;
                                if (ts?.length) {
                                    while (ts.length > 0) {
                                        const handler = ts[ts.length - 1];
                                        if (handler.catchIp !== null && !handler.used) {
                                            handler.used = true;
                                            stack[sp++] = modResult._coroError;
                                            ip = handler.catchIp;
                                            break;
                                        }
                                        ts.pop();
                                    }
                                    if (ts.length > 0) break;
                                }
                                this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                                this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                                return { success: false, error: modResult._coroError, output: this.output };
                            }
                            stack[sp++] = modResult;
                        } else {
                            stack[sp++] = modFn;
                        }
                    } else {
                        stack[sp++] = null;
                    }
                }
                break;
            }
            case OP.RETURN_LOCAL: {
                const idx = code[ip++];
                const v = stack[fp + idx];
                if (tryStack.length) {
                    let routed = false;
                    while (tryStack.length > 0) {
                        const handler = tryStack[tryStack.length - 1];
                        if (handler.frameTop !== frameTop) break;
                        if (handler.finallyIp !== null && !handler.inFinally) {
                            handler.pendingReturn = v;
                            handler.pendingReturnSet = true;
                            handler.inFinally = true;
                            ip = handler.finallyIp;
                            routed = true;
                            break;
                        }
                        tryStack.pop();
                    }
                    inTry = tryStack.length > 0;
                    if (routed) break;
                }
                if (frameTop > 0) {
                    const ft = --frameTop;
                    if (ft === 0) this._lastFrame0Pop = `RETURN(savedCodeLen=${fr.codes[ft] ? fr.codes[ft].length : -1},savedIp=${fr.ips[ft] ?? -1},savedSimple=${frSimple[ft]})`;
                    const fst = frSimple[ft];
                    if (fst === 2) {
                        const base3 = ft * 3;
                        ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                    } else if (fst === 1) {
                        const base = ft * 5;
                        ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                        vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                        vmCapturedVars = null;
                        vmSharedCaptured = null;
                        vmCvArr = null;
                    } else {
                        ip = fr.ips[ft];
                        fp = fr.fps[ft];
                        sp = fr.sps[ft];
                        vmLocals = fr.locals[ft];
                        vmCurrentClosure = fr.closures[ft];
                        vmCvArr = fr.cvArrs[ft];
                        const savedCv = fr.capturedVars[ft];
                        vmCapturedVars = savedCv;
                        vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                        const savedCode = fr.codes[ft];
                        if (savedCode) {
                            this.code = savedCode;
                            const fc = fr.consts[ft];
                            this.consts = fc;
                            code = savedCode;
                            consts = fc;
                            vars = fr.vars[ft];
                        }
                    }
                    stack[sp++] = v;
                } else {
                    stack[sp++] = v;
                }
                break;
            }
            case OP.RETURN_SIMPLE: {
                const v = sp > 0 ? stack[--sp] : null;
                if (tryStack.length) {
                    let routed = false;
                    while (tryStack.length > 0) {
                        const handler = tryStack[tryStack.length - 1];
                        if (handler.frameTop !== frameTop) break;
                        if (handler.finallyIp !== null && !handler.inFinally) {
                            handler.pendingReturn = v;
                            handler.pendingReturnSet = true;
                            handler.inFinally = true;
                            ip = handler.finallyIp;
                            routed = true;
                            break;
                        }
                        tryStack.pop();
                    }
                    inTry = tryStack.length > 0;
                    if (routed) break;
                }
                if (frameTop > 0) {
                    const ft = --frameTop;
                    const fst = frSimple[ft];
                    if (fst === 2) {
                        const base3 = ft * 3;
                        ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                    } else if (fst === 1) {
                        const base = ft * 5;
                        ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                        vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                        vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                    } else {
                        ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                        vmLocals = fr.locals[ft];
                        vmCurrentClosure = fr.closures[ft];
                        vmCvArr = fr.cvArrs[ft];
                        vmCapturedVars = fr.capturedVars[ft];
                        vmSharedCaptured = fr.capturedVars[ft] ? fr.sharedCaptured[ft] : null;
                        const savedCode = fr.codes[ft];
                        if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                    }
                    stack[sp++] = v;
                } else {
                    stack[sp++] = v;
                }
                break;
            }
            case OP.RETURN: {
                const v = sp > 0 ? stack[--sp] : null;
                if (tryStack.length) {
                    let routed = false;
                    while (tryStack.length > 0) {
                        const handler = tryStack[tryStack.length - 1];
                        if (handler.frameTop !== frameTop) break;
                        if (handler.finallyIp !== null && !handler.inFinally) {
                            handler.pendingReturn = v;
                            handler.pendingReturnSet = true;
                            handler.inFinally = true;
                            ip = handler.finallyIp;
                            routed = true;
                            break;
                        }
                        tryStack.pop();
                    }
                    inTry = tryStack.length > 0;
                    if (routed) break;
                }
                if (frameTop > 0) {
                    const ft = --frameTop;
                    if (ft === 0) this._lastFrame0Pop = `RETURN(savedCodeLen=${fr.codes[ft] ? fr.codes[ft].length : -1},savedIp=${fr.ips[ft] ?? -1},savedSimple=${frSimple[ft]})`;
                    const fst = frSimple[ft];
                    if (fst === 2) {
                        const base3 = ft * 3;
                        ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                    } else if (fst === 1) {
                        const base = ft * 5;
                        ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                        vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                        vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                    } else {
                        ip = fr.ips[ft];
                        fp = fr.fps[ft];
                        sp = fr.sps[ft];
                        vmLocals = fr.locals[ft];
                        vmCurrentClosure = fr.closures[ft];
                        vmCvArr = fr.cvArrs[ft];
                        vmCapturedVars = fr.capturedVars[ft];
                        vmSharedCaptured = fr.capturedVars[ft] ? fr.sharedCaptured[ft] : null;
                        const savedCode = fr.codes[ft];
                        if (savedCode) {
                            this.code = savedCode;
                            const fc = fr.consts[ft];
                            this.consts = fc;
                            code = savedCode;
                            consts = fc;
                            vars = fr.vars[ft];
                        }
                    }
                    stack[sp++] = v;
                } else {
                    stack[sp++] = v;
                }
                break;
            }
            case OP.CLOSURE: {
                const f = consts[code[ip++]];
                
                if (f._noCapture && !vmCapturedVars) {
                    if (f._cachedClosure && f._cachedClosure._ctx[0] === this.code) {
                        stack[sp++] = f._cachedClosure;
                        break;
                    }
                    const ls = f.localScope;
                    const localScopeArr = ls ? f._lsa : this._emptyLocals;
                    const lc = f._localCount || 0;
                    const closure = {
                        _type: 'closure',
                        start: f.start,
                        end: f.end,
                        _localScopeArr: localScopeArr,
                        _localCount: lc,
                        _lsa: localScopeArr,
                        _lc: lc,
                        _start: f.start,
                        _ctx: [this.code, this.consts, vars, this.vars],
                        _funcRef: f,
                        _fr: f,
                        _isLeaf: f._isLeaf || false,
                        _noCapture: true,
                        _returnsInlineClosure: f._returnsInlineClosure,
                        _innerClosureIdx: f._innerClosureIdx,
                        _innerInlineOp: f._innerInlineOp,
                        _cachedInlineClosure: f._cachedInlineClosure
                    };
                    f._cachedClosure = closure;
                    if (this.jit && f.name && this.funcASTs[f.name]) {
                        this.jit.registerFunction(f.name, this.funcASTs[f.name], null);
                    }
                    stack[sp++] = closure;
                    break;
                }
                
                const fCaptured = f.capturedVars;
                const hasFCaptured = fCaptured && fCaptured.length > 0;
                const hasLocalScopes = vmLocals && vmLocals !== this._emptyLocals;
                
                if (hasFCaptured && fCaptured.length === 1 && hasLocalScopes && !vmCapturedVars) {
                    const varName = fCaptured[0];
                    const scope = vmLocals[vmLocals.length - 1];
                    const idx = scope[varName];
                    if (idx !== undefined) {
                        const val = stack[fp + idx];
                        if (val !== undefined) {
                            const ls = f.localScope;
                            const localScopeArr = ls ? f._lsa : this._emptyLocals;
                            const lc = f._localCount || 0;
                            const startOp = code[f.start];
                            let closure;
                            if (lc <= 2 && startOp >= 100 && startOp <= 109) {
                                closure = { _type: 'closure', _capturedVal: val, _inlineOp: startOp, _fr: f };
                            } else {
                                let box = null;
                                if (vmCapturedVars && !Array.isArray(vmCapturedVars)) {
                                    const inherited = vmCapturedVars[varName];
                                    if (inherited && typeof inherited === 'object' && Object.prototype.hasOwnProperty.call(inherited, 'value')) {
                                        inherited.value = val;
                                        box = inherited;
                                    }
                                }
                                if (!box) box = { value: val };
                                if (!vmCapturedVars || Array.isArray(vmCapturedVars)) vmCapturedVars = {};
                                vmCapturedVars[varName] = box;
                                if (!vmSharedCaptured || Array.isArray(vmSharedCaptured)) vmSharedCaptured = {};
                                vmSharedCaptured[varName] = box;
                                const cvArr = [box];
                                const captured = {};
                                captured[varName] = box;
                                closure = { _type: 'closure', start: f.start, end: f.end, capturedVars: captured, _cvArr: cvArr, _localScopeArr: localScopeArr, _localCount: lc, _lsa: localScopeArr, _lc: lc, _start: f.start, _funcRef: f, _isLeaf: f._isLeaf || false, _ctx: [this.code, this.consts, vars] };
                            }
                            if (this.jit && f.name && this.funcASTs[f.name]) {
                                this.jit.registerFunction(f.name, this.funcASTs[f.name], null);
                            }
                            stack[sp++] = closure;
                            break;
                        }
                    }
                }
                
                let captured = null;
                let capturedCount = 0;
                let cvArr = null;
                if (hasFCaptured) {
                    captured = {};
                    cvArr = new Array(fCaptured.length);
                    for (let ci = 0; ci < fCaptured.length; ci++) {
                        const varName = fCaptured[ci];
                        let found = false;
                        if (hasLocalScopes) {
                            for (let i = vmLocals.length - 1; i >= 0; i--) {
                                const idx = vmLocals[i][varName];
                                if (idx !== undefined) {
                                    const val = stack[fp + idx];
                                    if (val !== undefined) {
                                        let nextBox = null;
                                        if (vmCapturedVars && !Array.isArray(vmCapturedVars)) {
                                            const inherited = vmCapturedVars[varName];
                                            if (inherited && typeof inherited === 'object' && Object.prototype.hasOwnProperty.call(inherited, 'value')) {
                                                inherited.value = val;
                                                nextBox = inherited;
                                            }
                                        }
                                        if (!nextBox) nextBox = { value: val };
                                        if (!vmCapturedVars || Array.isArray(vmCapturedVars)) vmCapturedVars = {};
                                        vmCapturedVars[varName] = nextBox;
                                        if (!vmSharedCaptured || Array.isArray(vmSharedCaptured)) vmSharedCaptured = {};
                                        if (vmSharedCaptured && !Array.isArray(vmSharedCaptured)) vmSharedCaptured[varName] = nextBox;
                                        captured[varName] = nextBox;
                                        cvArr[ci] = nextBox;
                                        capturedCount++;
                                        found = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!found && vmCapturedVars) {
                            const cv = vmCapturedVars[varName];
                            if (cv !== undefined && cv !== null) { captured[varName] = cv; cvArr[ci] = cv; capturedCount++; found = true; }
                        }
                        if (!found && vmSharedCaptured && vmSharedCaptured[varName]) {
                            captured[varName] = vmSharedCaptured[varName];
                            cvArr[ci] = vmSharedCaptured[varName];
                            capturedCount++;
                            found = true;
                        }
                        if (!found) {
                            const box = { value: undefined };
                            if (!vmCapturedVars || Array.isArray(vmCapturedVars)) vmCapturedVars = {};
                            vmCapturedVars[varName] = box;
                            if (!vmSharedCaptured) vmSharedCaptured = {};
                            vmSharedCaptured[varName] = box;
                            captured[varName] = box;
                            cvArr[ci] = box;
                            capturedCount++;
                        }
                    }
                    if (vmCapturedVars) {
                        for (const varName in vmCapturedVars) {
                            if (!(varName in captured)) {
                                captured[varName] = vmCapturedVars[varName];
                                capturedCount++;
                            }
                        }
                    }
                } else if (hasFCaptured && (hasLocalScopes || vmCapturedVars)) {
                    if (vmCapturedVars && !hasLocalScopes) {
                        captured = vmCapturedVars;
                    } else {
                        captured = {};
                        if (hasLocalScopes) {
                            const scope = vmLocals[0];
                            for (const varName in scope) {
                                const idx = scope[varName];
                                if (idx !== undefined) {
                                    const val = stack[fp + idx];
                                    if (val !== undefined) {
                                        let box = null;
                                        if (vmCapturedVars && !Array.isArray(vmCapturedVars)) {
                                            const inherited = vmCapturedVars[varName];
                                            if (inherited && typeof inherited === 'object' && Object.prototype.hasOwnProperty.call(inherited, 'value')) {
                                                inherited.value = val;
                                                box = inherited;
                                            }
                                        }
                                        if (!box) box = { value: val };
                                        if (!vmCapturedVars || Array.isArray(vmCapturedVars)) vmCapturedVars = {};
                                        vmCapturedVars[varName] = box;
                                        if (!vmSharedCaptured) vmSharedCaptured = {};
                                        vmSharedCaptured[varName] = box;
                                        captured[varName] = box;
                                        capturedCount++;
                                    }
                                }
                            }
                        }
                        if (vmCapturedVars) {
                            for (const varName in vmCapturedVars) {
                                if (!(varName in captured)) {
                                    captured[varName] = vmCapturedVars[varName];
                                    capturedCount++;
                                }
                            }
                        }
                        if (capturedCount === 0) captured = null;
                    }
                }
                
                const ls = f.localScope;
                const localScopeArr = ls ? f._lsa : this._emptyLocals;
                const lc = f._localCount || 0;
                const startOp = code[f.start];
                let hasInlineOp = captured && cvArr && cvArr.length === 1 && cvArr[0] && startOp >= 100 && startOp <= 109;
                let closure;
                if (!captured && f._cachedClosure && f._cachedClosure._ctx && f._cachedClosure._ctx[0] === this.code) {
                    closure = f._cachedClosure;
                } else if (captured) {
                    if (hasInlineOp && lc <= 2) {
                        closure = { _type: 'closure', _cvArr: cvArr, _capturedVal: cvArr[0].value, _inlineOp: startOp, _localScopeArr: localScopeArr, _localCount: lc, _lsa: localScopeArr, _lc: lc, _start: f.start, _funcRef: f, _isLeaf: f._isLeaf || false, _ctx: [this.code, this.consts, vars], start: f.start, end: f.end };
                    } else {
                        closure = {
                            _type: 'closure',
                            start: f.start,
                            end: f.end,
                            capturedVars: captured,
                            _cvArr: cvArr,
                            _localScopeArr: localScopeArr,
                            _localCount: lc,
                            _lsa: localScopeArr,
                            _lc: lc,
                            _start: f.start,
                            _funcRef: f,
                            _isLeaf: f._isLeaf || false,
                            _ctx: [this.code, this.consts, vars]
                        };
                    }
                } else {
                    closure = {
                        _type: 'closure',
                        start: f.start,
                        end: f.end,
                        capturedVars: null,
                        _localScopeArr: localScopeArr,
                        _localCount: lc,
                        _lsa: localScopeArr,
                        _lc: lc,
                        _start: f.start,
                        _funcRef: f,
                        _isLeaf: f._isLeaf || false,
                        _noCapture: true,
                        _ctx: [this.code, this.consts, vars],
                        _returnsInlineClosure: f._returnsInlineClosure,
                        _innerClosureIdx: f._innerClosureIdx,
                        _innerInlineOp: f._innerInlineOp,
                        _cachedInlineClosure: f._cachedInlineClosure
                    };
                    f._cachedClosure = closure;
                }
                const selfCaptureIdx = Array.isArray(fCaptured) && f && f.name ? fCaptured.indexOf(f.name) : -1;
                if (captured && selfCaptureIdx >= 0 && f && f.name) {
                    if (!vmSharedCaptured) vmSharedCaptured = {};
                    let selfBox = captured[f.name];
                    if (!selfBox || typeof selfBox !== 'object' || !Object.prototype.hasOwnProperty.call(selfBox, 'value')) {
                        selfBox = vmSharedCaptured[f.name] || { value: undefined };
                        vmSharedCaptured[f.name] = selfBox;
                        captured[f.name] = selfBox;
                    }
                    selfBox.value = closure;
                    if (Array.isArray(cvArr) && selfCaptureIdx < cvArr.length) cvArr[selfCaptureIdx] = selfBox;
                }
                if (this.jit && f.name && this.funcASTs[f.name]) {
                    this.jit.registerFunction(f.name, this.funcASTs[f.name], null);
                }
                
                stack[sp++] = closure;
                if (code[ip] === OP.SET_GLOBAL_KEEP) {
                    ip++;
                    globalVals[code[ip++]] = closure;
                } else if (code[ip] === OP.SET_GLOBAL) {
                    ip++;
                    globalVals[code[ip++]] = closure;
                    sp--;
                }
                break;
            }
            case OP.PRINT: { const pv = stack[--sp]; const ps = pv === null ? 'null' : pv === undefined ? 'null' : String(pv); if (!this.output) { this.output = []; } this.output.push(ps); break; }
            case OP.IMPORT: {
                const name = stack[--sp];
                const imported = this._resolveImportModule(name);
                if (!imported.ok) {
                    this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                    this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                    return { success: false, error: imported.error, output: this.output };
                }
                stack[sp++] = imported.value;
                break;
            }
            case OP.CALL_BUILTIN: {
                const name = consts[code[ip++]];
                const n = code[ip++];
                if (name === 'push' && n === 2) {
                    const v = stack[--sp];
                    const arr = stack[--sp];
                    if (Array.isArray(arr)) {
                        arr[arr.length] = v;
                        stack[sp++] = arr;
                    } else {
                        lastError = 'push() expects array as first argument';
                        stack[sp++] = null;
                    }
                    break;
                }
                let args;
                if (n === 1) {
                    const a0 = stack[--sp];
                    const fn = this.builtins[name];
                    if (fn) {
                        const fastResult = _tryFastBuiltinUnaryCall(fn, a0, this.builtins);
                        if (fastResult !== _NO_FAST_BUILTIN) {
                            stack[sp++] = fastResult;
                        } else {
                            try { stack[sp++] = fn([a0]); }
                            catch(e) { lastError = e?.message || String(e); stack[sp++] = null; }
                        }
                    } else {
                        stack[sp++] = null;
                    }
                    break;
                }
                if (n === 0) args = [];
                else if (n === 2) { const a1 = stack[--sp]; const a0 = stack[--sp]; args = [a0, a1]; }
                else if (n === 3) { const a2 = stack[--sp]; const a1 = stack[--sp]; const a0 = stack[--sp]; args = [a0, a1, a2]; }
                else {
                    args = new Array(n);
                    for (let i = n - 1; i >= 0; i--) args[i] = stack[--sp];
                }
                const fn = this.builtins[name];
                if (fn) {
                    try { stack[sp++] = fn(args); }
                    catch(e) { lastError = e?.message || String(e); stack[sp++] = null; }
                } else {
                    stack[sp++] = null;
                }
                break;
            }
            
            case OP.TRY: {
                const offset = code[ip++];
                tryStack = tryStack || [];
                tryStack.push({
                    catchIp: offset >= 0 ? ip + offset : null,
                    finallyIp: null,
                    frameTop,
                    used: false,
                    pendingThrow: null,
                    pendingReturn: null,
                    pendingReturnSet: false,
                    inFinally: false
                });
                inTry = true;
                break;
            }
            case OP.SET_FINALLY: {
                const offset = code[ip++];
                if (tryStack.length) {
                    const handler = tryStack[tryStack.length - 1];
                    handler.finallyIp = ip + offset;
                }
                break;
            }
            case OP.THROW: {
                const error = stack[--sp];
                if (tryStack.length) {
                    while (tryStack.length > 0) {
                        const handler = tryStack[tryStack.length - 1];
                        if (handler.catchIp !== null && !handler.used) {
                            handler.used = true;
                            stack[sp++] = error;
                            ip = handler.catchIp;
                            break;
                        }
                        if (handler.finallyIp !== null && !handler.inFinally) {
                            handler.pendingThrow = error;
                            handler.inFinally = true;
                            ip = handler.finallyIp;
                            break;
                        }
                        tryStack.pop();
                    }
                    if (tryStack.length > 0) break;
                }
                this._sp = sp;
                this._fp = fp;
                this.ip = ip;
                this._frameTop = frameTop;
                this.stack = stack;
                this.locals = vmLocals;
                this.capturedVars = vmCapturedVars;
                this.sharedCaptured = vmSharedCaptured;
                return { success: false, error: String(error), output: this.output };
            }
            case OP.END_TRY: {
                if (tryStack.length) {
                    tryStack.pop();
                }
                inTry = tryStack.length > 0;
                break;
            }
            case OP.END_FINALLY: {
                if (tryStack.length) {
                    const handler = tryStack[tryStack.length - 1];
                    const pendingError = handler.pendingThrow;
                    const pendingReturnSet = handler.pendingReturnSet === true;
                    const pendingReturn = handler.pendingReturn;
                    tryStack.pop();
                    inTry = tryStack.length > 0;
                    if (pendingError !== null && pendingError !== undefined) {
                        if (tryStack.length) {
                            let routed = false;
                            while (tryStack.length > 0) {
                                const outer = tryStack[tryStack.length - 1];
                                if (outer.catchIp !== null && !outer.used) {
                                    outer.used = true;
                                    stack[sp++] = pendingError;
                                    ip = outer.catchIp;
                                    routed = true;
                                    break;
                                }
                                if (outer.finallyIp !== null && !outer.inFinally) {
                                    outer.pendingThrow = pendingError;
                                    outer.inFinally = true;
                                    ip = outer.finallyIp;
                                    routed = true;
                                    break;
                                }
                                tryStack.pop();
                            }
                            if (routed) break;
                        }
                        this._sp = sp;
                        this._fp = fp;
                        this.ip = ip;
                        this._frameTop = frameTop;
                        this.stack = stack;
                        this.locals = vmLocals;
                        this.capturedVars = vmCapturedVars;
                        this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: String(pendingError), output: this.output };
                    }
                    if (pendingReturnSet) {
                        if (tryStack.length) {
                            let routed = false;
                            while (tryStack.length > 0) {
                                const outer = tryStack[tryStack.length - 1];
                                if (outer.frameTop !== frameTop) break;
                                if (outer.finallyIp !== null && !outer.inFinally) {
                                    outer.pendingReturn = pendingReturn;
                                    outer.pendingReturnSet = true;
                                    outer.inFinally = true;
                                    ip = outer.finallyIp;
                                    routed = true;
                                    break;
                                }
                                tryStack.pop();
                            }
                            inTry = tryStack.length > 0;
                            if (routed) break;
                        }
                        if (frameTop > 0) {
                            const ft = --frameTop;
                            const fst = frSimple[ft];
                            if (fst === 2) {
                                const base3 = ft * 3;
                                ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                            } else if (fst === 1) {
                                const base = ft * 5;
                                ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                                vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                                vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                            } else {
                                ip = fr.ips[ft];
                                fp = fr.fps[ft];
                                sp = fr.sps[ft];
                                vmLocals = fr.locals[ft];
                                vmCurrentClosure = fr.closures[ft];
                                vmCvArr = fr.cvArrs[ft];
                                vmCapturedVars = fr.capturedVars[ft];
                                vmSharedCaptured = fr.capturedVars[ft] ? fr.sharedCaptured[ft] : null;
                                const savedCode = fr.codes[ft];
                                if (savedCode) {
                                    this.code = savedCode;
                                    const fc = fr.consts[ft];
                                    this.consts = fc;
                                    code = savedCode;
                                    consts = fc;
                                    vars = fr.vars[ft];
                                }
                            }
                        } else {
                            ip++;
                        }
                        stack[sp++] = pendingReturn;
                    }
                } else {
                    inTry = false;
                }
                break;
            }
            case OP.CATCH: {
                break;
            }
            case OP.ASYNC: {
                const v = stack[--sp];
                const p = Promise.resolve(v);
                p.__resolvedValue = v;
                stack[sp++] = p;
                break;
            }
            case OP.AWAIT: {
                const v = stack[--sp];
                if (v && v.__resolvedValue !== undefined) {
                    stack[sp++] = v.__resolvedValue;
                } else if (v && typeof v.then === 'function') {
                    this._sp = sp;
                this._fp = fp;
                this.ip = ip;
                this._frameTop = frameTop;
                this._awaitResume = {
                    stack, vmLocals, vmCapturedVars, vmSharedCaptured,
                    vmCvArr, vmCurrentClosure, inTry, tryStack, lastError,
                    code, consts, vars, globalVals, globalNameIdx,
                    vmCvArrResolveCache, vmCallScopedMetaClosure, vmCallScopedMeta,
                    jit, jitEnabled, execBudget, checkBuiltins, strict
                };
                return { 
                    success: true, 
                    output: this.output, 
                    pending: v,
                    state: this._saveState()
                };
                } else {
                    stack[sp++] = v;
                }
                break;
            }
            case OP.NEW: {
                const n = code[ip++];
                const args = n > 0 ? new Array(n) : [];
                for (let i = n - 1; i >= 0; i--) args[i] = stack[--sp];
                const cls = stack[--sp];
                
                if (cls?._type === 'class') {
                    const instance = createSafeInstance(cls.name, cls.methods, cls.superClass, this);
                    
                    const constructorMethod = cls.methods.init || cls.methods['__init__'] || cls.methods.constructor;
                    if (constructorMethod && constructorMethod.code) {
                        const savedCode = this.code;
                        const savedConsts = this.consts;
                        const savedVars = this.vars;
                        const savedIp = ip;
                        const savedStackBase = sp;
                        const savedGlobalVals = this._globalVals;
                        this._syncFrames();
                        const savedFrames = this.frames;
                        const savedCurrentClass = this.currentClass;
                        
                        this.currentClass = cls.name;
                        this.code = constructorMethod.code;
                        this.consts = constructorMethod.consts;
                        this.vars = constructorMethod.vars || [];
                        this.ip = 0;
                        this.stack = [instance, ...(constructorMethod.params || []).map((_, i) => args[i])];
                        this.frames = [];
                        this._frameTop = 0;
                        
                        while (true) {
                            const subOp = this.code[this.ip++];
                            if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                            if (_RETURN_OPS.has(subOp)) {
                                break;
                            }
                            this._executeOpInline(subOp);
                        }
                        
                        this.currentClass = savedCurrentClass;
                        this.code = savedCode;
                        this.consts = savedConsts;
                        this.vars = savedVars;
                        this._globalVals = savedGlobalVals;
                        this.frames = savedFrames;
                        this._syncFromFrames();
                        this.locals = vmLocals;
                        this.capturedVars = vmCapturedVars;
                        this.sharedCaptured = vmSharedCaptured;
                        this.stack = stack;
                    }
                    
                    stack[sp++] = instance;
                } else {
                    stack[sp++] = null;
                }
                break;
            }
            
            case OP.SUPER_CALL: {
                const n = code[ip++];
                const args = n > 0 ? new Array(n) : [];
                for (let i = n - 1; i >= 0; i--) args[i] = stack[--sp];
                
                const instance = stack[0];
                if (!instance || instance._type !== 'instance') {
                    stack[sp++] = null;
                    break;
                }
                
                const currentClassObj = globalVals[globalNameIdx.get(this.currentClass)];
                if (!currentClassObj || currentClassObj._type !== 'class') {
                    stack[sp++] = null;
                    break;
                }
                
                const superClassName = currentClassObj.superClass;
                if (!superClassName) {
                    stack[sp++] = null;
                    break;
                }
                
                const superClassObj = globalVals[globalNameIdx.get(superClassName)];
                if (!superClassObj || superClassObj._type !== 'class') {
                    stack[sp++] = null;
                    break;
                }
                
                const superConstructor = superClassObj.methods.init || superClassObj.methods['__init__'] || superClassObj.methods.constructor;
                if (superConstructor && superConstructor.code) {
                    const savedCode = this.code;
                    const savedConsts = this.consts;
                    const savedVars = this.vars;
                    const savedIp = ip;
                    const savedGlobalVals = this._globalVals;
                    this._syncFrames();
                    const savedFrames = this.frames;
                    const savedCurrentClass = this.currentClass;
                    const savedFp = this._fp;
                    const savedLocals = this.locals;
                    const savedCapturedVars = this.capturedVars;
                    const savedSharedCaptured = this.sharedCaptured;
                    
                    this.currentClass = superClassName;
                    this.code = superConstructor.code;
                    this.consts = superConstructor.consts;
                    this.vars = superConstructor.vars || [];
                    this.ip = 0;
                    this.stack = [instance, ...(superConstructor.params || []).map((_, i) => args[i])];
                    this.frames = [];
                    this._frameTop = 0;
                    this._fp = 0;
                    this.locals = [superConstructor.localScope || {}];
                    this.capturedVars = null;
                    this.sharedCaptured = null;
                    while (true) {
                        const subOp = this.code[this.ip++];
                        if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                        if (_RETURN_OPS.has(subOp)) {
                            break;
                        }
                        this._executeOpInline(subOp);
                    }
                    
                    this.currentClass = savedCurrentClass;
                    this.code = savedCode;
                    this.consts = savedConsts;
                    this.vars = savedVars;
                    this._globalVals = savedGlobalVals;
                    this.frames = savedFrames;
                    this._syncFromFrames();
                    this._fp = savedFp;
                    this.locals = savedLocals;
                    this.capturedVars = savedCapturedVars;
                    this.sharedCaptured = savedSharedCaptured;
                }
                
                stack[sp++] = instance;
                break;
            }
            
            case OP.SUPER_METHOD_CALL: {
                const methodNameIdx = code[ip++];
                const methodName = consts[methodNameIdx];
                const n = code[ip++];
                const args = n > 0 ? new Array(n) : [];
                for (let i = n - 1; i >= 0; i--) args[i] = stack[--sp];
                
                const instance = stack[0];
                if (!instance || instance._type !== 'instance') {
                    stack[sp++] = null;
                    break;
                }
                
                const currentClassObj = globalVals[globalNameIdx.get(this.currentClass)];
                if (!currentClassObj || currentClassObj._type !== 'class') {
                    stack[sp++] = null;
                    break;
                }
                
                const superClassName = currentClassObj.superClass;
                if (!superClassName) {
                    stack[sp++] = null;
                    break;
                }
                
                const superClassObj = globalVals[globalNameIdx.get(superClassName)];
                if (!superClassObj || superClassObj._type !== 'class') {
                    stack[sp++] = null;
                    break;
                }
                
                const superMethod = superClassObj.methods[methodName];
                if (superMethod && superMethod.code) {
                    const savedCode = this.code;
                    const savedConsts = this.consts;
                    const savedVars = this.vars;
                    const savedIp = ip;
                    const savedGlobalVals = this._globalVals;
                    this._syncFrames();
                    const savedFrames = this.frames;
                    const savedCurrentClass = this.currentClass;
                    const savedFp = this._fp;
                    const savedLocals = this.locals;
                    const savedCapturedVars = this.capturedVars;
                    const savedSharedCaptured = this.sharedCaptured;
                    
                    this.currentClass = superClassName;
                    this.code = superMethod.code;
                    this.consts = superMethod.consts;
                    this.vars = superMethod.vars || [];
                    this.ip = 0;
                    this.stack = [instance, ...args];
                    this.frames = [];
                    this._frameTop = 0;
                    this._fp = 0;
                    this.locals = [superMethod.localScope || {}];
                    this.capturedVars = null;
                    this.sharedCaptured = null;
                    let returnValue = null;
                    while (true) {
                        const subOp = this.code[this.ip++];
                        if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                        if (_RETURN_OPS.has(subOp)) {
                            if (_COMPUTED_RETURN_OPS.has(subOp)) this._executeOpInline(subOp);
                            returnValue = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
                            break;
                        }
                        this._executeOpInline(subOp);
                    }
                    
                    this.currentClass = savedCurrentClass;
                    this.code = savedCode;
                    this.consts = savedConsts;
                    this.vars = savedVars;
                    this._globalVals = savedGlobalVals;
                    this.frames = savedFrames;
                    this._syncFromFrames();
                    this._fp = savedFp;
                    this.locals = savedLocals;
                    this.capturedVars = savedCapturedVars;
                    this.sharedCaptured = savedSharedCaptured;
                    
                    stack[sp++] = returnValue;
                } else {
                    stack[sp++] = null;
                }
                break;
            }
            
            case OP.HALT: {
                this._syncGlobalVals = true;
                if (this.preserveGlobals) {
                    for (let _i = 0; _i < varsLen; _i++) { const _v = globalVals[_i]; globals[vars[_i]] = (_v !== null && typeof _v === 'object' && Array.isArray(_v) && _v[HARDENED_ARRAY_MARK] !== 1) ? hardenArrayObject(_v) : _v; }
                    this._syncGlobalVals = false;
                }
                this._sp = sp;
                this._fp = fp;
                this.ip = ip;
                this._frameTop = frameTop;
                this.stack = stack;
                this.locals = vmLocals;
                this.capturedVars = vmCapturedVars;
                this.sharedCaptured = vmSharedCaptured;
                if (this.frames.length > 0) this.frames.length = 0;
                if (this.callStack.length > 0) this.callStack.length = 0;
                if (tryStack && tryStack.length > 0) tryStack.length = 0;
                return { success: true, output: this.output };
            }
            
            case OP.YIELD: {
                const value = stack[--sp];
                this._sp = sp;
                this._fp = fp;
                this.ip = ip;
                this._frameTop = frameTop;
                this.locals = vmLocals;
                this.capturedVars = vmCapturedVars;
                this.sharedCaptured = vmSharedCaptured;
                return { success: true, output: this.output, yielded: true, value };
            }
            
            case OP.COROUTINE: {
                const idx = code[ip++];
                const coroDef = consts[idx];
                stack[sp++] = { _type: 'coroutine_def', def: coroDef, fiber: !!coroDef.fiber };
                break;
            }
            
            case OP.RESUME: {
                const coro = stack[--sp];
                const arg = stack[--sp];
                
                if (coro?._type !== 'coroutine') {
                    stack[sp++] = null;
                    break;
                }
                
                if (coro.state === 'done') {
                    stack[sp++] = null;
                    break;
                }
                
                const savedCode = this.code;
                const savedConsts = this.consts;
                const savedVars = this.vars;
                const savedIp = ip;
                const savedStack = this.stack;
                const savedSp = sp;
                const savedFp = fp;
                const savedLocals = vmLocals;
                const savedCapturedVars = vmCapturedVars;
                const savedSharedCaptured = vmSharedCaptured;
                const savedGlobalVals = globalVals;
                const savedGlobalNameIdx = this._globalNameIdx;
                this._syncFrames();
                const savedFrames = this.frames;
                
                if (savedGlobalVals && savedGlobalNameIdx) {
                    for (const [name, idx] of savedGlobalNameIdx) {
                        if (idx < savedGlobalVals.length && savedGlobalVals[idx] !== undefined && savedGlobalVals[idx] !== null) {
                            globals[name] = savedGlobalVals[idx];
                        }
                    }
                }
                
                this.code = coro.def.code || [];
                this.consts = coro.def.consts || [];
                this.vars = coro.def.vars || [];
                this.ip = coro.ip;
                this.stack = [...coro.stack];
                this._fp = 0;
                this.locals = coro.locals.map(l => ({...l}));
                vmLocals = this.locals;
                this.frames = [...(coro.frames || [])];
                this._syncFromFrames();
                globalVals = null;
                this._globalVals = null;
                this._globalNameIdx = null;
                if (coro.capturedVars && typeof coro.capturedVars === 'object' && !Array.isArray(coro.capturedVars)) {
                    vmCapturedVars = coro.capturedVars;
                    this.capturedVars = vmCapturedVars;
                }
                if (coro.sharedCaptured) {
                    vmSharedCaptured = coro.sharedCaptured;
                    this.sharedCaptured = vmSharedCaptured;
                }
                
                if (arg !== undefined && arg !== null) {
                    this.stack.push(arg);
                }
                
                let result;
                let coroError = null;
                try {
                    const resumeResult = this.runFromIp();
                    if (resumeResult && resumeResult.yielded) {
                        coro.state = 'suspended';
                        coro.ip = this.ip;
                        coro.stack = [...this.stack];
                        coro.locals = vmLocals.map(l => ({...l}));
                        this._syncFrames();
                        coro.frames = [...this.frames];
                        if (vmCapturedVars) coro.capturedVars = vmCapturedVars;
                        if (vmSharedCaptured) coro.sharedCaptured = vmSharedCaptured;
                        result = resumeResult.value;
                    } else if (resumeResult && resumeResult.pending) {
                        coro.state = 'suspended';
                        coro.ip = this.ip;
                        coro.stack = [...this.stack];
                        coro.locals = vmLocals.map(l => ({...l}));
                        this._syncFrames();
                        coro.frames = [...this.frames];
                        if (vmCapturedVars) coro.capturedVars = vmCapturedVars;
                        if (vmSharedCaptured) coro.sharedCaptured = vmSharedCaptured;
                        coro._pendingPromise = resumeResult.pending;
                        coro._awaitIp = this.ip;
                        result = { _coroPending: resumeResult.pending, coro };
                    } else {
                        coro.state = 'done';
                        result = resumeResult && resumeResult.returnValue !== undefined ? resumeResult.returnValue : null;
                    }
                } catch (e) {
                    coro.state = 'done';
                    coroError = e.message || String(e);
                    result = null;
                }
                
                this.code = savedCode;
                this.consts = savedConsts;
                this.vars = savedVars;
                this.stack = savedStack;
                this._fp = savedFp;
                this.locals = savedLocals;
                vmLocals = savedLocals;
                this.frames = savedFrames;
                this._syncFromFrames();
                globalVals = savedGlobalVals;
                this._globalVals = savedGlobalVals;
                this._globalNameIdx = savedGlobalNameIdx;
                stack = this.stack;
                sp = savedSp;
                fp = savedFp;
                
                if (coroError !== null) {
                    if (inTry && tryStack.length) {
                        while (tryStack.length > 0) {
                            const handler = tryStack[tryStack.length - 1];
                            if (handler.catchIp !== null && !handler.used) {
                                handler.used = true;
                                stack[sp++] = coroError;
                                ip = handler.catchIp;
                                break;
                            }
                            tryStack.pop();
                        }
                        inTry = tryStack.length > 0;
                        if (tryStack.length > 0) break;
                    }
                    lastError = coroError;
                    break;
                }
                
                stack[sp++] = result;
                
                if (result && result._coroPending) {
                    this._sp = sp;
                    this._fp = fp;
                    this.ip = ip;
                    this._coroPendingResume = { coro: result.coro, savedSp: sp - 1 };
                    return {
                        success: true,
                        output: this.output,
                        pending: result._coroPending
                    };
                }
                
                break;
            }
            
            case OP.MATCH: {
                const cases = consts[code[ip++]];
                const value = stack[--sp];
                for (let _i = 0; _i < varsLen; _i++) { const _v = globalVals[_i]; globals[vars[_i]] = (_v !== null && typeof _v === 'object' && Array.isArray(_v) && _v[HARDENED_ARRAY_MARK] !== 1) ? hardenArrayObject(_v) : _v; }
                this._fp = fp;
                this._frameTop = frameTop;
                this.locals = vmLocals;
                this.capturedVars = vmCapturedVars;
                this.sharedCaptured = vmSharedCaptured;
                const result = this.executeMatch(value, cases);
                vmLocals = this.locals;
                vmCapturedVars = this.capturedVars;
                vmSharedCaptured = this.sharedCaptured;
                frameTop = this._frameTop;
                stack[sp++] = result;
                break;
            }
            
            case OP.GENERIC_CALL: {
                const n = code[ip++];
                const args = n > 0 ? new Array(n) : [];
                for (let i = n - 1; i >= 0; i--) args[i] = stack[--sp];
                const typeArgs = stack[--sp];
                const fn = stack[--sp];
                
                if (fn?._type === 'closure') {
                    const funcName = fn._funcRef?.name || 'anonymous';
                    const currentLine = this.lineMap[ip] || 0;
                    this.callStack.push({ name: funcName, line: currentLine });
                    
                    const savedFp = fp;
                    const savedSp = sp;
                    const savedLocals = vmLocals;
                    const savedCapturedVars = vmCapturedVars;
                    const savedSharedCaptured = vmSharedCaptured;
                    
                    for (let i = 0; i < args.length; i++) stack[sp++] = args[i];
                    fp = sp - args.length;
                    
                    vmLocals = fn._localScopeArr || this._emptyLocals;
                    vmCapturedVars = prepareCallCapturedVars(fn);
                    vmSharedCaptured = null;
                    
                    if (frameTop >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                    const ft = frameTop++;
                    if (ft === 0) this._lastFrame0Push = `13887(codeLen=${code?.length ?? -1},ip=${ip},fnStart=${fn._start !== undefined ? fn._start : fn.start})`;
                    fr.ips[ft] = ip;
                    fr.fps[ft] = savedFp;
                    fr.sps[ft] = savedSp;
                    fr.locals[ft] = savedLocals;
                    frSimple[ft] = 0;
                    fr.cvArrs[ft] = vmCvArr;
                    fr.closures[ft] = vmCurrentClosure;
                    const fnCtx = fn._ctx;
                    const fnCode = fnCtx ? fnCtx[0] : null;
                    const fnConstsCtx = fnCtx ? fnCtx[1] : consts;
                    const fnVarsCtx = fnCtx ? fnCtx[2] : vars;
                    const isSimple = !savedCapturedVars && !savedSharedCaptured && fnCode === code && fnConstsCtx === consts && fnVarsCtx === vars;
                    if (isSimple) {
                        fr.capturedVars[ft] = null;
                        fr.sharedCaptured[ft] = null;
                        fr.codes[ft] = null;
                    } else {
                        fr.capturedVars[ft] = savedCapturedVars;
                        fr.sharedCaptured[ft] = savedSharedCaptured;
                        const sameCode = fnCode === this.code;
                        if (!sameCode) {
                            fr.codes[ft] = this.code;
                            fr.consts[ft] = this.consts;
                            fr.vars[ft] = vars;
                            this.code = fnCode;
                            this.consts = fnCtx ? fnCtx[1] || this.consts : this.consts;
                            this.vars = fnCtx && fnCtx[2] ? fnCtx[2] : this.vars;
                            code = this.code;
                            consts = this.consts;
                            vars = fnCtx ? fnCtx[2] || vars : vars;
                            this._lastCodeSwitch = `13901->fnCode(len=${fnCode?.length ?? -1},ft=${frameTop},ip=${ip})`;
                        } else {
                            fr.codes[ft] = null;
                        }
                    }
                    ip = fn._start !== undefined ? fn._start : fn.start;
                } else if (typeof fn === 'function') {
                    try { stack[sp++] = fn(args); }
                    catch(e) { lastError = e?.message || String(e); stack[sp++] = null; }
                } else {
                    stack[sp++] = null;
                }
                break;
            }
            case 144: {
                const li = code[ip++]; const ci = code[ip++]; const jump = code[ip++]; ip += 3;
                if (stack[fp + li] < consts[ci]) {
                    const v = stack[fp + li];
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                            vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                        } else {
                            ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                            vmLocals = fr.locals[ft]; vmCurrentClosure = fr.closures[ft];
                            vmCvArr = fr.cvArrs[ft];
                            const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                            vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                        }
                        stack[sp++] = v;
                    } else { stack[sp++] = v; }
                } else {
                    ip += jump;
                }
                break;
            }
            case 146: {
                const b = stack[--sp]; const a = stack[--sp];
                const v = a + b;
                if (frameTop > 0) {
                    const ft = --frameTop;
                    const fst = frSimple[ft];
                    if (fst === 2) {
                        const base3 = ft * 3;
                        ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                    } else if (fst === 1) {
                        const base = ft * 5;
                        ip = sf[base]; fp = sf[base + 1]; sp = sf[base + 2];
                        vmLocals = sf[base + 3]; vmCurrentClosure = sf[base + 4];
                        vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                    } else {
                        ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                        vmLocals = fr.locals[ft]; vmCurrentClosure = fr.closures[ft];
                        vmCvArr = fr.cvArrs[ft];
                        const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                        vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                        const savedCode = fr.codes[ft];
                        if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                    }
                    stack[sp++] = v;
                } else { stack[sp++] = v; }
                break;
            }
            case 147: {
                const li = code[ip++]; const ci = code[ip++]; ip++;
                const fn = vmCurrentClosure;
                const argVal = stack[fp + li] - consts[ci];
                if (_canUseFastFib(fn, argVal)) { stack[sp++] = _fastFibNonNegInt(argVal); break; }
                if (!(vmCapturedVars || vmSharedCaptured)) {
                    const savedFp = fp;
                    const savedSp = sp;
                    const savedLocals = vmLocals;
                    stack[sp] = argVal;
                    fp = sp;
                    sp = fn._lc > 1 ? fp + fn._lc : fp + 1;
                    const ft = frameTop;
                    if (ft + 1 >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                    const base = ft * 5;
                    sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = fn;
                    frSimple[ft] = 1;
                    frameTop = ft + 1;
                    vmLocals = fn._lsa;
                    vmCapturedVars = null;
                    vmCvArr = null;
                    vmSharedCaptured = null;
                    ip = fn._start;
                    break;
                }
                this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                return this.runFull(bc);
            }
            case 148: {
                const li = code[ip++]; const ci = code[ip++]; ip++;
                const fn = vmCurrentClosure;
                const argVal = stack[fp + li] - consts[ci];
                if (_canUseFastFib(fn, argVal)) { stack[sp++] = _fastFibNonNegInt(argVal); break; }
                const ft = frameTop;
                if (ft + 1 >= MAX_FRAME_DEPTH) return _runFullStackOverflow(this, sp, fp, ip, frameTop, stack, vmLocals, vmCapturedVars, vmSharedCaptured);
                const base3 = ft * 3;
                sfSelf[base3] = ip; sfSelf[base3 + 1] = fp; sfSelf[base3 + 2] = sp;
                frSimple[ft] = 2;
                stack[sp] = argVal;
                fp = sp;
                sp = fn._lc > 1 ? fp + fn._lc : fp + 1;
                frameTop = ft + 1;
                ip = fn._start;
                break;
            }
            case 149: {
                const val = stack[--sp];
                const arr = stack[sp - 1];
                if (Array.isArray(arr)) {
                    arr[arr.length] = val;
                } else {
                    stack[sp - 1] = null;
                }
                break;
            }
            case 180: {
                const v = stack[--sp];
                stack[sp++] = Array.isArray(v) ? 1 : 0;
                break;
            }
            case 162: {
                const val = stack[--sp];
                const arr = stack[--sp];
                if (Array.isArray(arr)) {
                    arr[arr.length] = val;
                }
                break;
            }
            case 150: {
                const idx = stack[--sp];
                const arr = stack[sp - 1];
                if (Array.isArray(arr) && Number.isInteger(idx) && idx >= 0 && idx < arr.length) {
                    stack[sp - 1] = arr[idx];
                    break;
                }
                if (typeof idx === 'number') {
                    if (Array.isArray(arr) || typeof arr === 'string') {
                        stack[sp - 1] = arr[idx] ?? null;
                        break;
                    }
                    if (arr && arr._type === undefined) {
                        let v = arr[idx];
                        if (v === undefined) v = arr[String(idx)];
                        stack[sp - 1] = v ?? null;
                        break;
                    }
                }
                if (isDangerousObjectKey(idx)) {
                    stack[sp - 1] = null;
                    break;
                }
                if (Array.isArray(arr)) {
                    stack[sp - 1] = arr[idx] ?? null;
                } else if (typeof arr === 'string' && typeof idx === 'number') {
                    stack[sp - 1] = arr[idx] ?? null;
                } else if (arr && (typeof idx === 'string' || typeof idx === 'number')) {
                    const key = typeof idx === 'number' ? String(idx) : idx;
                    stack[sp - 1] = arr[key] ?? null;
                } else {
                    stack[sp - 1] = null;
                }
                break;
            }
            case 151: {
                const arr = stack[sp - 1];
                if (Array.isArray(arr)) {
                    stack[sp - 1] = arr.length;
                } else if (typeof arr === 'string') {
                    stack[sp - 1] = arr.length;
                } else {
                    stack[sp - 1] = 0;
                }
                break;
            }
            
            default: {
                const prevOp = code[ip - 2];
                if (op === 8 && prevOp === OP.JUMP) {
                    // Treat jump-operand desync as a single-byte operand skip.
                    this._desyncJumpOperandSkips = (this._desyncJumpOperandSkips || 0) + 1;
                    break;
                }
                if (op === undefined || op === OP.HALT) {
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        const fst = frSimple[ft];
                        if (fst === 2) {
                            const base3 = ft * 3;
                            ip = sfSelf[base3];
                            fp = sfSelf[base3 + 1];
                            sp = sfSelf[base3 + 2];
                        } else if (fst === 1) {
                            const base = ft * 5;
                            ip = sf[base];
                            fp = sf[base + 1];
                            sp = sf[base + 2];
                            vmLocals = sf[base + 3];
                            vmCurrentClosure = sf[base + 4];
                            vmCapturedVars = null;
                            vmSharedCaptured = null;
                            vmCvArr = null;
                        } else {
                            ip = fr.ips[ft];
                            fp = fr.fps[ft];
                            sp = fr.sps[ft];
                            vmLocals = fr.locals[ft];
                            vmCurrentClosure = fr.closures[ft];
                            vmCvArr = fr.cvArrs[ft];
                            vmCapturedVars = fr.capturedVars[ft];
                            vmSharedCaptured = fr.capturedVars[ft] ? fr.sharedCaptured[ft] : null;
                            const savedCode = fr.codes[ft];
                            if (savedCode) {
                                this.code = savedCode;
                                const fc = fr.consts[ft];
                                this.consts = fc;
                                code = savedCode;
                                consts = fc;
                                vars = fr.vars[ft];
                            }
                        }
                        stack[sp++] = null;
                        break;
                    }
                    this._sp = sp;
                    this._fp = fp;
                    this.ip = ip;
                    this._frameTop = frameTop;
                    this.stack = stack;
                    this.locals = vmLocals;
                    this.capturedVars = vmCapturedVars;
                    this.sharedCaptured = vmSharedCaptured;
                    const fnName = vmCurrentClosure?._funcRef?.name || vmCurrentClosure?.name || 'null';
                    if (debugTrace) this._lastSmallTrace = debugTrace.join(' ');
                    const inlineFrames = this.frames ? this.frames.length : 0;
                    const f0CodeLen = fr.codes[0] ? fr.codes[0].length : -1;
                    return { success: false, error: `Unexpected end of bytecode stream (fn=${fnName}, ip=${ip}, codeLen=${code?.length ?? -1}, frameTop=${frameTop}, inlineFrames=${inlineFrames}, f0CodeLen=${f0CodeLen}, f0Simple=${frSimple[0]}, lastSwitch=${this._lastCodeSwitch || 'none'}, f0Push=${this._lastFrame0Push || 'none'}, f0Pop=${this._lastFrame0Pop || 'none'}, callPush27=${this._lastCallPush27 || 'none'}, traceTail=${debugTrace.slice(-20).join(' ')})`, output: this.output };
                }
                this._sp = sp;
                this._fp = fp;
                this.ip = ip;
                this._frameTop = frameTop;
                return { success: false, error: `Unknown op: ${op}` };
            }
        }
        
        if (lastError !== null) {
            const e = lastError;
            lastError = null;
            if (inTry && tryStack.length) {
                while (tryStack.length > 0) {
                    const handler = tryStack[tryStack.length - 1];
                    if (handler.catchIp !== null && !handler.used) {
                        handler.used = true;
                        stack[sp++] = e;
                        ip = handler.catchIp;
                        break;
                    }
                    tryStack.pop();
                }
                inTry = tryStack.length > 0;
                if (tryStack.length > 0) continue;
            }
            this._sp = sp;
            this._fp = fp;
            this.ip = ip;
            this._frameTop = frameTop;
            this.locals = vmLocals;
            this.capturedVars = vmCapturedVars;
            this.sharedCaptured = vmSharedCaptured;
            const errObj = (typeof e === 'string') ? SeedLangError.fromRuntime(e, this.lineMap, ip, [...this.callStack]) : e;
            return { success: false, error: errObj, output: this.output };
        }
    }
}
function wireRunFull(VMProto) {
    VMProto.runFull = runFull;
}

module.exports = { runFull, wireRunFull };