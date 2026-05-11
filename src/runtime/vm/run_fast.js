'use strict';

const { OP, RETURN_OPS: _RETURN_OPS, COMPUTED_RETURN_OPS: _COMPUTED_RETURN_OPS, VALID_OPCODES: _VALID_OPCODES } = require('./opcodes');
const { SeedLangError } = require('./errors');
const { hardenArrayObject, HARDENED_ARRAY_MARK } = require('./runtime_safety');
const { safeAddValues, normalizeNumericOperand, seedEquals, safeRepeatString, MAX_STRING_REPEAT_RESULT_LEN: _MAX_STRING_REPEAT_RESULT_LEN, MAX_STRING_VALUE_LEN: _MAX_STRING_VALUE_LEN } = require('./value_ops');
const { invokeHostMethod, createSafeInstance, instantiateClassObject, isSafeArrayIndex, isPrivateInstanceKey, canAccessInstanceKey, resolveMethodStart, buildMethodLocalScope } = require('./instance_ops');
const { createRuntimeClosure, prepareCallCapturedVars, resolveCallSharedCaptured, getCallScopedCapturedMeta, resolveCallCvArr, getCallScopedCapturedNames, hasCallScopedCaptured, resolveLocalNameByIndex, refreshCapturedLocalsFromFrame } = require('./closure_ops');
const { isDangerousObjectKey, isInternalMetaKey, decodeSeedObjectKey } = require('./object_key_safety');
const { OBJECT_SPREAD_MARKER, _fastFibNonNegInt } = require('./shared');

const _ARRAY_BUILTIN_METHODS = new Set(['map','filter','reduce','find','findIndex','every','some','forEach','flatMap','flat','fill','unique','count','sum','avg','minBy','maxBy','zip','deepClone','indexOf','lastIndexOf','slice','concat','sort','reverse','join','includes','push','pop','shift','unshift','splice']);
const _STRING_BUILTIN_METHODS = new Set(['upper','lower','trim','trimStart','trimEnd','split','join','replace','substring','charAt','startsWith','endsWith','includes','repeat','padStart','padEnd','lastIndexOf','indexOf','len','strMatch','search','codePointAt','fromCharCode']);
const { isReturnOpcodeValue, isComputedReturnOpcodeValue } = require('./return_ops');
const { consumeExecutionBudget, consumeExecutionBudgetBatch } = require('./execution_budget');
const { _decodeAmpCompressedString } = require('./amp');
const { isClassicFibFuncRef: _isClassicFibFuncRef, canUseFastFib: _canUseFastFib, tryFastBuiltinUnaryCall: _tryFastBuiltinUnaryCall, hydrateBuiltinGlobals: _hydrateBuiltinGlobals, NO_FAST_BUILTIN: _NO_FAST_BUILTIN } = require('./fast_builtin_ops');
const { createCoroutineFromMethod: _createCoroutineFromMethod } = require('../../../dist/core/coroutine.js');
const { _BUDGET_CHECK } = require('./jit_fast_path');
const { MAX_FRAME_DEPTH, MAX_OPERAND_STACK_SLOTS } = require('./frame_limits');

const _EXEC_BUDGET_TIME_SLICE = 4096;
function _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, ctx) {
    if (inTry && tryStack.length) {
        const handler = tryStack[tryStack.length - 1];
        if (handler.catchIp !== null && !handler.used) {
            handler.used = true;
            stack[sp++] = 'division error';
            return { caught: true, ip: handler.catchIp, sp };
        }
    }
    ctx._sp = sp; ctx._fp = fp; ctx.ip = ip; ctx._frameTop = frameTop;
    ctx.stack = stack; ctx.locals = vmLocals; ctx.capturedVars = vmCapturedVars; ctx.sharedCaptured = vmSharedCaptured;
    return { caught: false, ip, sp };
}
function runFast(bc) {
    const prevSuppress = this._suppressConsoleLog;
    try {
    const gc = this._globalCache;
    if (gc && !this.preserveGlobals) {
        if (this._globalValsDirty) {
            const gv = this._globalVals;
            const len = gc.length;
            gv[0] = gc[0]; if (len > 1) gv[1] = gc[1]; if (len > 2) gv[2] = gc[2]; if (len > 3) gv[3] = gc[3];
            if (len > 4) { for (let i = 4; i < len; i++) gv[i] = gc[i]; }
            this._globalValsDirty = false;
        }
        if (this.output.length) this.output.length = 0;
    }
    const execBudget = this._createExecutionBudget();
    const jfp = this._jitFastPath;
    if (jfp) {
        const gv = this._globalVals;
        const ic = this._initConsts;
        if (ic) { for (let i = 0; i < ic.length; i += 2) gv[ic[i]] = ic[i + 1]; }
        _hydrateBuiltinGlobals(gv, this.vars, this.builtins);
        try {
            jfp(gv, this.output, execBudget);
            this._syncGlobalVals = true;
            if (!this.preserveGlobals) this._globalValsDirty = true;
            if (!this._globalCache) this._saveCache();
            return this._cachedResult;
        } catch(e) {
            if (e.message === '__SEED_BUDGET_INSN__') {
                return { success: false, error: `Execution limit exceeded (${this._maxInstructions} instructions)`, output: this.output };
            }
            if (e.message === '__SEED_BUDGET_TIME__') {
                return { success: false, error: `Execution timeout (${this._maxExecutionMs}ms)`, output: this.output };
            }
            this._jitFastPath = null;
        }
    }
    let code = bc.code;
    let consts = bc.consts;
    let vars = bc.vars;
    this.code = code;
    this.consts = consts;
    this.vars = vars;
    this._lastBc = bc;
    this._lastBcVars = bc.vars;
    let globalVals = this._globalVals;
    let stack = this._stackBuf;
    const output = this.output;
    output.length = 0;
    this._suppressConsoleLog = true;
    let sp = 0, ip = 0, fp = 0, frameTop = 0;
    const fr = this._fr;
    const sf = fr.sf;
    const sfSelf = fr.sfSelf;
    const frSimple = fr.simple;
    let vmLocals = this._emptyLocals;
    let vmCapturedVars = null, vmCvArr = null, vmSharedCaptured = null;
    let vmCurrentClosure = null;
    const vmCvArrResolveCache = { fn: null, callCapturedVars: null, base: null, noScoped: false, capturedNamesRef: null, cvArr: null };
    let vmCapturedLocalSyncClosure = null;
    let vmCapturedLocalSyncLocals = null;
    let vmCapturedLocalSyncMap = null;
    let vmCapturedLocalSyncAllMiss = false;
    let vmSingleCapturedBoxClosure = null;
    let vmSingleCapturedBox = null;
    const jit = this.jit;
    const jitEnabled = jit?.enabled;
    const debugTrace = null;
    
    if (!this._globalNameIdxRoot || this._globalNameIdxRootVars !== this._lastBcVars) {
        const baseVars = this._lastBcVars || this.vars || [];
        const map = new Map();
        for (let i = 0; i < baseVars.length; i++) map.set(baseVars[i], i);
        this._globalNameIdxRoot = map;
        this._globalNameIdxRootVars = baseVars;
    }
    const globalNameIdx = this._globalNameIdxRoot;
    this._globalNameIdx = globalNameIdx;
    let whileJitCache = this._whileJitCache;
    let nonLoopJumps = this._nonLoopJumps;
    let inTry = false;
    let tryStack = this.tryStack;
    const globals = this.globals;
    const syncClosureSelfObject = (closure, value) => {
        if (!closure || closure._type !== 'closure' || !value || typeof value !== 'object' || Array.isArray(value) || value._type !== undefined) return;
        const fnName = closure._funcRef?.name || closure.name;
        if (!fnName || fnName === 'anonymous') return;
        for (const key in value) {
            if (!isDangerousObjectKey(key)) closure[key] = value[key];
        }
        const globalFn = globals[fnName];
        if (globalFn && (typeof globalFn === 'object' || typeof globalFn === 'function')) {
            for (const key in value) {
                if (!isDangerousObjectKey(key)) globalFn[key] = value[key];
            }
        }
    };
    
    let budgetCounter = 0;
    
    while (true) {
        if (sp > MAX_OPERAND_STACK_SLOTS || fp >= MAX_OPERAND_STACK_SLOTS) {
            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
            return { success: false, error: 'operand stack overflow', output: this.output };
        }
        if (execBudget) {
            if (--budgetCounter <= 0) {
                budgetCounter = 1024;
                if (execBudget.remaining < 0) {
                    this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                    this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                    return { success: false, error: `Execution limit exceeded (${this._maxInstructions} instructions)`, output: this.output };
                }
                execBudget.remaining -= 1024;
                if (execBudget.deadline > 0 && (execBudget.timeSlice -= 1024) <= 0) {
                    execBudget.timeSlice = _EXEC_BUDGET_TIME_SLICE;
                    if (Date.now() > execBudget.deadline) {
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        return { success: false, error: `Execution timeout (${this._maxExecutionMs}ms)`, output: this.output };
                    }
                }
            }
        }
        const op = code[ip];
        if (op === 0 || op === 255 || op === undefined) { ip++; break; }
        if (op < 0 || op > 255) {
            this._sp = sp; this._fp = fp; this.ip = 0; this._frameTop = 0;
            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
            return this.runFull(bc);
        }
        if (op === 155) { ip++; const b = stack[--sp]; const a = stack[sp - 1]; stack[sp - 1] = safeAddValues(a, b); ip++; globalVals[code[ip++]] = stack[--sp]; continue; }
        if (op === 135) { ip++; const b = stack[--sp]; const a = stack[sp - 1]; stack[sp - 1] = safeAddValues(a, b); if (code[ip] === 11) { ip++; globalVals[code[ip++]] = stack[--sp]; } continue; }
        if (op === 128) { ip++; const gi = code[ip++]; const ci = code[ip++]; globalVals[gi] += consts[ci]; ip += code[ip] + 1; continue; }
        if (op === 12) { ip++; stack[sp++] = stack[fp + code[ip++]]; continue; }
        if (op === 13) { ip++; stack[fp + code[ip++]] = stack[--sp]; continue; }
        if (op === 5) { ip++; const popped = sp > 0 ? stack[sp - 1] : null; sp--; const nextOp = code[ip]; this._pendingSetGlobalValue = nextOp === 11 ? popped : undefined; continue; }
        if (op === 10) { ip++; const idx = code[ip++]; const v = globalVals[idx]; if (typeof v === 'number') { stack[sp++] = v; continue; } if (v !== null && v !== undefined && typeof v !== 'object' && typeof v !== 'function') { stack[sp++] = v; continue; } if (v === null || typeof v === 'function') { stack[sp++] = v; continue; } if (v !== undefined && typeof v === 'object' && (v._type === 'closure' || v._type === 'class')) { stack[sp++] = v; continue; } const varName = vars[idx]; const bv = this.builtins[varName]; if (bv !== undefined && (!Object.prototype.hasOwnProperty.call(globals, varName) || (v && v._type === 'class'))) { stack[sp++] = bv; continue; } const gv = globals[varName]; if (v === undefined && gv !== undefined) { const sv = hardenArrayObject(gv); globalVals[idx] = sv; stack[sp++] = sv; continue; } stack[sp++] = v; continue; }
        if (op === 11) { ip++; const gi = code[ip++]; const raw = sp > 0 ? stack[--sp] : (this._pendingSetGlobalValue !== undefined ? this._pendingSetGlobalValue : null); this._pendingSetGlobalValue = undefined; let v = raw; if (raw !== null && typeof raw === 'object') { if (Array.isArray(raw)) { v = raw[HARDENED_ARRAY_MARK] === 1 ? raw : hardenArrayObject(raw); } } globalVals[gi] = v; if (v?._type === 'class') globals[vars[gi]] = v; continue; }
        if (op === 32) { ip++; const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] < b; continue; }
        if (op === 158) { ip++; const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a < b)) ip += off; continue; }
        if (op === 159) { ip++; const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a <= b)) ip += off; continue; }
        if (op === 160) { ip++; const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a > b)) ip += off; continue; }
        if (op === 161) { ip++; const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a >= b)) ip += off; continue; }
        if (op === 156) { ip++; const b = normalizeNumericOperand(stack[--sp]); const a = normalizeNumericOperand(stack[--sp]); ip++; globalVals[code[ip++]] = a - b; continue; }
        if (op === 157) { ip++; const b = normalizeNumericOperand(stack[--sp]); const a = normalizeNumericOperand(stack[--sp]); ip++; globalVals[code[ip++]] = a * b; continue; }
        if (op === 1) { ip++; const v = consts[code[ip++]]; if (code[ip] === 11) { ip++; const gi = code[ip++]; globalVals[gi] = v; if (v?._type === 'class') globals[vars[gi]] = v; } else { stack[sp++] = v; } continue; }
        if (op === 60) { ip++; ip += code[ip] + 1; continue; }
        if (op === 62) { ip++; if (!stack[sp - 1]) ip += code[ip] + 1; else ip++; continue; }
        if (op === 20) { ip++; const b = stack[--sp]; const a = stack[sp - 1]; stack[sp - 1] = (typeof a === 'number' && typeof b === 'number') ? a + b : safeAddValues(a, b); continue; }
        if (op === 23) { ip++; const b = stack[--sp]; const a = stack[sp - 1]; if (typeof a === 'number' && typeof b === 'number') { if (b === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; continue; } return { success: false, error: 'division error', output: this.output }; } stack[sp - 1] = a / b; continue; } const nb = normalizeNumericOperand(b); if (nb === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; continue; } return { success: false, error: 'division error', output: this.output }; } stack[sp - 1] = normalizeNumericOperand(a) / nb; continue; }
        if (op === 24) { ip++; const b = stack[--sp]; const a = stack[sp - 1]; if (typeof a === 'number' && typeof b === 'number') { if (b === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; continue; } return { success: false, error: 'division error', output: this.output }; } stack[sp - 1] = a % b; continue; } const nb = normalizeNumericOperand(b); if (nb === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; continue; } return { success: false, error: 'division error', output: this.output }; } stack[sp - 1] = normalizeNumericOperand(a) % nb; continue; }
        if (op === 33) { ip++; const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] <= b; continue; }
        if (op === 34) { ip++; const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] > b; continue; }
        if (op === 35) { ip++; const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] >= b; continue; }
        if (op === 92) { ip++; const li = code[ip++]; stack[fp + li] = stack[fp + li] + 1; continue; }
        if (op === 102) { ip++; const gi = code[ip++]; const ci = code[ip++]; globalVals[gi] = consts[ci]; continue; }
        if (op === 133) { ip++; const gi = code[ip++]; const ci = code[ip++]; const offset = code[ip++]; let v = globalVals[gi]; const limit = consts[ci]; if (v < limit) { globalVals[gi] = v + 1; ip -= offset; } continue; }
        if (op === 21) { ip++; const b = stack[--sp]; const a = stack[sp - 1]; stack[sp - 1] = (typeof a === 'number' && typeof b === 'number') ? a - b : normalizeNumericOperand(a) - normalizeNumericOperand(b); continue; }
        if (op === 22) { ip++; const b = stack[--sp]; const a = stack[sp - 1]; stack[sp - 1] = (typeof a === 'number' && typeof b === 'number') ? a * b : normalizeNumericOperand(a) * normalizeNumericOperand(b); continue; }
        if (op === 156) { ip++; const b = stack[--sp]; const a = stack[--sp]; ip++; const gi = code[ip++]; globalVals[gi] = (typeof a === 'number' && typeof b === 'number') ? a - b : normalizeNumericOperand(a) - normalizeNumericOperand(b); continue; }
        if (op === 157) { ip++; const b = stack[--sp]; const a = stack[--sp]; ip++; const gi = code[ip++]; globalVals[gi] = (typeof a === 'number' && typeof b === 'number') ? a * b : normalizeNumericOperand(a) * normalizeNumericOperand(b); continue; }
        if (op === 149) { ip++; const val = stack[--sp]; const arr = stack[sp - 1]; if (Array.isArray(arr)) { arr.push(val); continue; } stack[sp - 1] = null; continue; }
        if (op === 150) { ip++; const idx = stack[--sp]; const arr = stack[sp - 1]; if (typeof idx === 'number') { if (Array.isArray(arr) || typeof arr === 'string') { stack[sp - 1] = arr[idx] ?? null; continue; } if (arr && arr._type === undefined) { let v = arr[idx]; if (v === undefined) v = arr[String(idx)]; stack[sp - 1] = v ?? null; continue; } } if (isDangerousObjectKey(idx)) { stack[sp - 1] = null; continue; } if (Array.isArray(arr)) { stack[sp - 1] = arr[idx] ?? null; } else if (typeof arr === 'string' && typeof idx === 'number') { stack[sp - 1] = arr[idx] ?? null; } else if (arr && (typeof idx === 'string' || typeof idx === 'number')) { const key = typeof idx === 'number' ? String(idx) : idx; stack[sp - 1] = arr[key] ?? null; } else { stack[sp - 1] = null; } continue; }
        if (op === 151) { ip++; const arr = stack[sp - 1]; if (Array.isArray(arr) || typeof arr === 'string') { stack[sp - 1] = arr.length; continue; } stack[sp - 1] = 0; continue; }
        if (op === 14) { ip++; const idx = code[ip++]; if (vmCvArr && idx < vmCvArr.length) { const box = vmCvArr[idx]; if (box && typeof box === 'object') { stack[sp++] = box.value; continue; } } if (idx === 0 && vmSingleCapturedBoxClosure === vmCurrentClosure && vmSingleCapturedBox) { stack[sp++] = vmSingleCapturedBox.value; continue; } ip -= 2; break; }
        if (op === 2) { ip++; stack[sp++] = null; continue; }
        if (op === 3) { ip++; stack[sp++] = true; continue; }
        if (op === 4) { ip++; stack[sp++] = false; continue; }
        if (op === 103) { ip++; const gi = code[ip++]; const ci = code[ip++]; const v = consts[ci]; globalVals[gi] = v; stack[sp++] = v; continue; }
        if (op === 97) { ip++; const gi = code[ip++]; const ci = code[ip++]; globalVals[gi] += consts[ci]; continue; }
        if (op === 105) { ip++; const vi = code[ip++]; globalVals[vi] = stack[sp - 1]; continue; }
        ip++;
        switch (op) {
            case 1: {
                const v = consts[code[ip++]];
                if (code[ip] === 11) { ip++; globalVals[code[ip++]] = v; break; }
                stack[sp++] = v;
                break;
            }
            case 2: stack[sp++] = null; break;
            case 3: stack[sp++] = true; break;
            case 4: stack[sp++] = false; break;
            case 5: { const popped = sp > 0 ? stack[sp - 1] : null; sp--; const nextOp = code[ip]; this._pendingSetGlobalValue = nextOp === 11 ? popped : undefined; break; }
            case 10: {
                const idx = code[ip++];
                const varName = vars[idx];
                const v = globalVals[idx];
                const bv = this.builtins[varName];
                if (bv !== undefined && (!Object.prototype.hasOwnProperty.call(globals, varName) || (v && v._type === 'class'))) { stack[sp++] = bv; break; }
                if (v !== null && typeof v !== 'object' && typeof v !== 'function') { stack[sp++] = v; break; }
                if (v === null || typeof v === 'function') { stack[sp++] = v; break; }
                if (v !== undefined && (v._type === 'closure' || v._type === 'class')) { stack[sp++] = v; break; }
                const gv = globals[varName];
                if (v === undefined && gv !== undefined) { const sv = hardenArrayObject(gv); globalVals[idx] = sv; stack[sp++] = sv; break; }
                stack[sp++] = v;
                break;
            }
            case 11: { const gi = code[ip++]; const raw = sp > 0 ? stack[--sp] : (this._pendingSetGlobalValue !== undefined ? this._pendingSetGlobalValue : null); this._pendingSetGlobalValue = undefined; let v = raw; if (raw !== null && typeof raw === 'object' && Array.isArray(raw) && raw[HARDENED_ARRAY_MARK] !== 1) { v = hardenArrayObject(raw); } globalVals[gi] = v; break; }
            case 12: { stack[sp++] = stack[fp + code[ip++]]; break; }
            case 13: { stack[fp + code[ip++]] = stack[--sp]; break; }
            case 14: {
                const idx = code[ip++];
                if (idx === 0 && vmSingleCapturedBoxClosure === vmCurrentClosure && vmSingleCapturedBox) {
                    stack[sp++] = vmSingleCapturedBox.value;
                    break;
                }
                if (idx === 0) {
                    const directSingleCvArr = vmCurrentClosure?._cvArr;
                    if (Array.isArray(directSingleCvArr) && directSingleCvArr.length === 1) {
                        const directSingleBox = directSingleCvArr[0];
                        if (directSingleBox && typeof directSingleBox === 'object') {
                            vmSingleCapturedBoxClosure = vmCurrentClosure;
                            vmSingleCapturedBox = directSingleBox;
                            vmCvArr = directSingleCvArr;
                            stack[sp++] = directSingleBox.value;
                            break;
                        }
                    }
                }
                if ((!vmCvArr || idx >= vmCvArr.length) && vmCurrentClosure?._cvArr) vmCvArr = resolveCallCvArr(vmCurrentClosure, vmCapturedVars, vmCvArrResolveCache);
                if (Array.isArray(vmCvArr) && idx === 0 && vmCvArr.length === 1) {
                    const singleBox = vmCvArr[0];
                    if (singleBox && typeof singleBox === 'object' && Object.prototype.hasOwnProperty.call(singleBox, 'value')) {
                        vmSingleCapturedBoxClosure = vmCurrentClosure;
                        vmSingleCapturedBox = singleBox;
                        stack[sp++] = singleBox.value;
                        break;
                    }
                }
                if (Array.isArray(vmCvArr) && idx >= 0 && idx < vmCvArr.length) {
                    const directBox = vmCvArr[idx];
                    if (directBox && typeof directBox === 'object' && Object.prototype.hasOwnProperty.call(directBox, 'value')) {
                        if (idx === 0) {
                            vmSingleCapturedBoxClosure = vmCurrentClosure;
                            vmSingleCapturedBox = directBox;
                        }
                        stack[sp++] = directBox.value;
                        break;
                    }
                }
                const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                const capturedName = Array.isArray(capturedNames) && idx >= 0 && idx < capturedNames.length
                    ? capturedNames[idx]
                    : undefined;
                const varsName = vars[idx];
                const varName = capturedName !== undefined ? capturedName : varsName;
                let cvBox = null;
                if (Array.isArray(vmCvArr)) {
                    let cvIdx = idx;
                    if ((cvIdx < 0 || cvIdx >= vmCvArr.length) && varName !== undefined && Array.isArray(capturedNames)) cvIdx = capturedNames.indexOf(varName);
                    if (cvIdx >= 0 && cvIdx < vmCvArr.length) cvBox = vmCvArr[cvIdx];
                }
                if (cvBox && typeof cvBox === 'object' && Object.prototype.hasOwnProperty.call(cvBox, 'value')) {
                    if (idx === 0) {
                        vmSingleCapturedBoxClosure = vmCurrentClosure;
                        vmSingleCapturedBox = cvBox;
                    }
                    stack[sp++] = cvBox.value;
                } else if (vmCapturedVars) {
                    const c = Array.isArray(vmCapturedVars) ? vmCapturedVars[idx] : vmCapturedVars[varName];
                    if (c !== undefined) {
                        if (idx === 0 && c !== null && typeof c === 'object' && Object.prototype.hasOwnProperty.call(c, 'value')) {
                            vmSingleCapturedBoxClosure = vmCurrentClosure;
                            vmSingleCapturedBox = c;
                        }
                        stack[sp++] = c !== null && typeof c === 'object' ? c.value ?? c : c;
                    } else if (vmSharedCaptured) {
                        const box = Array.isArray(vmSharedCaptured) ? vmSharedCaptured[idx] : vmSharedCaptured[varName];
                        if (idx === 0 && box && typeof box === 'object' && Object.prototype.hasOwnProperty.call(box, 'value')) {
                            vmSingleCapturedBoxClosure = vmCurrentClosure;
                            vmSingleCapturedBox = box;
                        }
                        stack[sp++] = box ? box.value : null;
                    } else {
                        stack[sp++] = null;
                    }
                } else if (vmSharedCaptured) {
                    const box = Array.isArray(vmSharedCaptured) ? vmSharedCaptured[idx] : vmSharedCaptured[varName];
                    if (idx === 0 && box && typeof box === 'object' && Object.prototype.hasOwnProperty.call(box, 'value')) {
                        vmSingleCapturedBoxClosure = vmCurrentClosure;
                        vmSingleCapturedBox = box;
                    }
                    stack[sp++] = box ? box.value : null;
                } else {
                    stack[sp++] = null;
                }
                break;
            }
            case 15: {
                const idx = code[ip++];
                const value = stack[--sp];
                let varName = undefined;
                let handledByDirectBox = false;
                if (idx === 0 && vmSingleCapturedBoxClosure === vmCurrentClosure && vmSingleCapturedBox) {
                    vmSingleCapturedBox.value = value;
                    handledByDirectBox = true;
                }
                if (!handledByDirectBox && idx === 0) {
                    const directSingleCvArr = vmCurrentClosure?._cvArr;
                    if (Array.isArray(directSingleCvArr) && directSingleCvArr.length === 1) {
                        const directSingleBox = directSingleCvArr[0];
                        if (directSingleBox && typeof directSingleBox === 'object') {
                            directSingleBox.value = value;
                            vmSingleCapturedBoxClosure = vmCurrentClosure;
                            vmSingleCapturedBox = directSingleBox;
                            vmCvArr = directSingleCvArr;
                            handledByDirectBox = true;
                        }
                    }
                }
                if (!handledByDirectBox && (!vmCvArr || idx >= vmCvArr.length) && vmCurrentClosure?._cvArr) vmCvArr = resolveCallCvArr(vmCurrentClosure, vmCapturedVars, vmCvArrResolveCache);
                if (Array.isArray(vmCvArr) && idx === 0 && vmCvArr.length === 1) {
                    const singleBox = vmCvArr[0];
                    if (singleBox && typeof singleBox === 'object' && Object.prototype.hasOwnProperty.call(singleBox, 'value')) {
                        singleBox.value = value;
                        vmSingleCapturedBoxClosure = vmCurrentClosure;
                        vmSingleCapturedBox = singleBox;
                        handledByDirectBox = true;
                    }
                }
                if (!handledByDirectBox && Array.isArray(vmCvArr) && idx >= 0 && idx < vmCvArr.length) {
                    const directBox = vmCvArr[idx];
                    if (directBox && typeof directBox === 'object' && Object.prototype.hasOwnProperty.call(directBox, 'value')) {
                        directBox.value = value;
                        if (idx === 0) {
                            vmSingleCapturedBoxClosure = vmCurrentClosure;
                            vmSingleCapturedBox = directBox;
                        }
                        handledByDirectBox = true;
                    }
                }
                if (!handledByDirectBox) {
                    const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && idx >= 0 && idx < capturedNames.length
                        ? capturedNames[idx]
                        : undefined;
                    const varsName = vars[idx];
                    varName = capturedName !== undefined ? capturedName : varsName;
                    let cvIdx = idx;
                    if ((cvIdx < 0 || !Array.isArray(vmCvArr) || cvIdx >= vmCvArr.length) && varName !== undefined && Array.isArray(capturedNames)) {
                        cvIdx = capturedNames.indexOf(varName);
                        if (cvIdx < 0) cvIdx = idx;
                    }
                    const cvBox = (Array.isArray(vmCvArr) && cvIdx >= 0 && cvIdx < vmCvArr.length) ? vmCvArr[cvIdx] : null;
                    if (cvBox && typeof cvBox === 'object' && Object.prototype.hasOwnProperty.call(cvBox, 'value')) {
                        cvBox.value = value;
                        if (idx === 0) {
                            vmSingleCapturedBoxClosure = vmCurrentClosure;
                            vmSingleCapturedBox = cvBox;
                        }
                    } else if (vmSharedCaptured && !Array.isArray(vmSharedCaptured) && Object.prototype.hasOwnProperty.call(vmSharedCaptured, varName)) {
                        vmSharedCaptured[varName].value = value;
                        if (idx === 0) {
                            const sharedBox = vmSharedCaptured[varName];
                            if (sharedBox && typeof sharedBox === 'object' && Object.prototype.hasOwnProperty.call(sharedBox, 'value')) {
                                vmSingleCapturedBoxClosure = vmCurrentClosure;
                                vmSingleCapturedBox = sharedBox;
                            }
                        }
                    } else if (vmCapturedVars) {
                        const captured = Array.isArray(vmCapturedVars) ? vmCapturedVars[idx] : vmCapturedVars[varName];
                        if (typeof captured === 'object' && captured !== null && captured.value !== undefined) {
                            captured.value = value;
                            if (idx === 0) {
                                vmSingleCapturedBoxClosure = vmCurrentClosure;
                                vmSingleCapturedBox = captured;
                            }
                        } else if (Array.isArray(vmCapturedVars)) {
                            vmCapturedVars[idx] = value;
                            if (idx === 0) {
                                vmSingleCapturedBoxClosure = null;
                                vmSingleCapturedBox = null;
                            }
                        } else {
                            const newBox = { value };
                            vmCapturedVars[varName] = newBox;
                            if (vmSharedCaptured && !Array.isArray(vmSharedCaptured)) vmSharedCaptured[varName] = newBox;
                            if (Array.isArray(vmCvArr) && cvIdx >= 0 && cvIdx < vmCvArr.length) vmCvArr[cvIdx] = newBox;
                            if (idx === 0) {
                                vmSingleCapturedBoxClosure = vmCurrentClosure;
                                vmSingleCapturedBox = newBox;
                            }
                        }
                    } else if (vmSharedCaptured) {
                        if (Array.isArray(vmSharedCaptured)) {
                            const box = vmSharedCaptured[idx];
                            if (box && typeof box === 'object' && Object.prototype.hasOwnProperty.call(box, 'value')) {
                                box.value = value;
                                if (idx === 0) {
                                    vmSingleCapturedBoxClosure = vmCurrentClosure;
                                    vmSingleCapturedBox = box;
                                }
                            } else {
                                vmSharedCaptured[idx] = { value: value };
                                if (idx === 0) {
                                    vmSingleCapturedBoxClosure = vmCurrentClosure;
                                    vmSingleCapturedBox = vmSharedCaptured[idx];
                                }
                            }
                        } else if (vmSharedCaptured[varName]) {
                            vmSharedCaptured[varName].value = value;
                            if (idx === 0) {
                                const sharedBox = vmSharedCaptured[varName];
                                if (sharedBox && typeof sharedBox === 'object' && Object.prototype.hasOwnProperty.call(sharedBox, 'value')) {
                                    vmSingleCapturedBoxClosure = vmCurrentClosure;
                                    vmSingleCapturedBox = sharedBox;
                                }
                            }
                        } else {
                            vmSharedCaptured[varName] = { value: value };
                            if (idx === 0) {
                                vmSingleCapturedBoxClosure = vmCurrentClosure;
                                vmSingleCapturedBox = vmSharedCaptured[varName];
                            }
                        }
                    }
                }
                let localIdx;
                if (Array.isArray(vmLocals) && vmLocals.length > 0) {
                    if (vmCapturedLocalSyncClosure !== vmCurrentClosure || vmCapturedLocalSyncLocals !== vmLocals || vmCapturedLocalSyncMap == null) {
                        vmCapturedLocalSyncClosure = vmCurrentClosure;
                        vmCapturedLocalSyncLocals = vmLocals;
                        vmCapturedLocalSyncMap = Object.create(null);
                        vmCapturedLocalSyncAllMiss = true;
                        const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                        if (Array.isArray(capturedNames) && capturedNames.length > 0) {
                            for (let ci = 0; ci < capturedNames.length; ci++) {
                                const capturedName = capturedNames[ci];
                                let idx2 = -1;
                                if (capturedName !== undefined) {
                                    for (let i = vmLocals.length - 1; i >= 0; i--) {
                                        const localPos = vmLocals[i]?.[capturedName];
                                        if (localPos !== undefined) { idx2 = localPos; break; }
                                    }
                                }
                                vmCapturedLocalSyncMap[ci] = idx2;
                                if (idx2 >= 0) vmCapturedLocalSyncAllMiss = false;
                            }
                        }
                    }
                    if (!vmCapturedLocalSyncAllMiss) {
                        const mappedLocalIdx = vmCapturedLocalSyncMap[idx];
                        if (mappedLocalIdx !== undefined && mappedLocalIdx >= 0) localIdx = mappedLocalIdx;
                    }
                }
                if (localIdx !== undefined) {
                    stack[fp + localIdx] = value;
                }
                break;
            }
            case 20: {
                const b = stack[--sp]; const a = stack[--sp];
                const r = (typeof a === 'number' && typeof b === 'number') ? a + b : safeAddValues(a, b);
                if (typeof a === 'number' && typeof b === 'number') {
                    if (code[ip] === 11) { code[ip - 1] = 155; } else { code[ip - 1] = 135; }
                }
                if (code[ip] === 11) { ip++; globalVals[code[ip++]] = r; break; }
                stack[sp++] = r;
                break;
            }
            case 135: {
                const b = stack[--sp]; const a = stack[--sp];
                const r = safeAddValues(a, b);
                if (code[ip] === 11) { ip++; globalVals[code[ip++]] = r; break; }
                stack[sp++] = r;
                break;
            }
            case 154: {
                const methodNameIdx = code[ip++];
                const methodName = consts[methodNameIdx];
                const n = code[ip++];
                const args = [];
                for (let i = 0; i < n; i++) args.unshift(stack[--sp]);
                const instance = stack[0];
                let returnValue = null;
                if (instance && instance._type === 'instance') {
                    const currentClassObj = globalVals[globalNameIdx.get(this.currentClass)];
                    if (currentClassObj && currentClassObj._type === 'class' && currentClassObj.superClass) {
                        const superClassObj = globalVals[globalNameIdx.get(currentClassObj.superClass)];
                        if (superClassObj && superClassObj._type === 'class') {
                            const superMethod = superClassObj.methods[methodName];
                            if (superMethod && superMethod.code) {
                                const savedCode3 = this.code; const savedConsts3 = this.consts; const savedVars3 = this.vars; const savedIp3 = ip;
                                const savedStack3 = this.stack; const savedSp3 = sp; const savedFp3 = fp;
                                const savedLocals3 = this.locals; const savedCaptured3 = this.capturedVars; const savedShared3 = this.sharedCaptured;
                                const savedCurrentClass3 = this.currentClass;
                                this.currentClass = currentClassObj.superClass;
                                this.code = superMethod.code;
                                this.consts = superMethod.consts;
                                this.vars = superMethod.vars || [];
                                this.ip = 0;
                                this.stack = [instance, ...args];
                                this._fp = 0;
                                this.locals = [superMethod.localScope || {}];
                                this.capturedVars = null;
                                this.sharedCaptured = null;
                                while (true) {
                                    const subOp = this.code[this.ip++];
                                    if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                                    if (subOp === 64 || subOp === 143) { returnValue = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null; break; }
                                    if (subOp === 91) { this.ip++; break; }
                                    if (subOp === 121 || subOp === 122 || subOp === 123 || subOp === 124) { this.ip += 2; break; }
                                    if (subOp === 100 || subOp === 107 || subOp === 108 || subOp === 109) { this.ip += 2; break; }
                                    this._executeOpInline(subOp);
                                }
                                returnValue = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
                                this.stack = savedStack3;
                                this._fp = savedFp3;
                                this.code = savedCode3;
                                this.consts = savedConsts3;
                                this.vars = savedVars3;
                                this.currentClass = savedCurrentClass3;
                                this.locals = savedLocals3;
                                this.capturedVars = savedCaptured3;
                                this.sharedCaptured = savedShared3;
                                stack = this.stack;
                                sp = savedSp3;
                                vmLocals = this.locals; vmCapturedVars = this.capturedVars; vmSharedCaptured = this.sharedCaptured;
                            }
                        }
                    }
                }
                stack[sp++] = returnValue;
                break;
            }
            case 155: {
                const b = stack[--sp]; const a = stack[--sp];
                ip++; globalVals[code[ip++]] = safeAddValues(a, b);
                break;
            }
            case 21: { const b = stack[--sp]; const a = stack[sp - 1]; stack[sp - 1] = a - b; if (code[ip] === 11) { code[ip - 1] = 156; ip++; globalVals[code[ip++]] = stack[--sp]; break; } break; }
            case 22: { const b = stack[--sp]; const a = stack[sp - 1]; stack[sp - 1] = a * b; if (code[ip] === 11) { code[ip - 1] = 157; ip++; globalVals[code[ip++]] = stack[--sp]; break; } break; }
            case 156: { const b = stack[--sp]; const a = stack[--sp]; ip++; globalVals[code[ip++]] = a - b; break; }
            case 157: { const b = stack[--sp]; const a = stack[--sp]; ip++; globalVals[code[ip++]] = a * b; break; }
            case 23: { const b = normalizeNumericOperand(stack[--sp]); if (b === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } stack[sp - 1] = normalizeNumericOperand(stack[sp - 1]) / b; break; }
            case 24: { const b = normalizeNumericOperand(stack[--sp]); if (b === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } stack[sp - 1] = normalizeNumericOperand(stack[sp - 1]) % b; break; }
            case 25: { stack[sp - 1] = -stack[sp - 1]; break; }
            case 30: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] === b; break; }
            case 31: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] !== b; break; }
            case 32: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] < b; break; }
            case 158: { const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a < b)) ip += off; break; }
            case 33: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] <= b; break; }
            case 159: { const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a <= b)) ip += off; break; }
            case 34: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] > b; break; }
            case 160: { const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a > b)) ip += off; break; }
            case 35: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] >= b; break; }
            case 161: { const b = stack[--sp]; const a = stack[--sp]; const off = code[ip++]; if (!(a >= b)) ip += off; break; }
            case 40: { const b = stack[--sp]; const a = stack[--sp]; stack[sp++] = a && b; break; }
            case 41: { const b = stack[--sp]; const a = stack[--sp]; stack[sp++] = a || b; break; }
            case 42: { stack[sp - 1] = !stack[sp - 1]; break; }
            case 43: {
                const b = stack[--sp];
                const a = stack[sp - 1];
                if (this._traceBitOps) {
                    if (!this._bitTrace) this._bitTrace = [];
                    if (this._bitTrace.length < 512) this._bitTrace.push({ op: '&', ip: ip - 1, a, b });
                }
                stack[sp - 1] = a & b;
                break;
            }
            case 44: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] | b; break; }
            case 45: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] ^ b; break; }
            case 46: { stack[sp - 1] = ~stack[sp - 1]; break; }
            case 47: { const b = stack[--sp]; stack[sp - 1] = stack[sp - 1] << b; break; }
            case 48: {
                const b = stack[--sp];
                const a = stack[sp - 1];
                if (this._traceBitOps) {
                    if (!this._bitTrace) this._bitTrace = [];
                    if (this._bitTrace.length < 512) this._bitTrace.push({ op: '>>', ip: ip - 1, a, b });
                }
                stack[sp - 1] = a >> b;
                break;
            }
            case 50: { const len = code[ip++]; const arr = hardenArrayObject(new Array(len)); for (let i = len - 1; i >= 0; i--) arr[i] = stack[--sp]; stack[sp++] = arr; break; }
            case 51: {
                const n = code[ip++];
                const o = Object.create(null);
                const entries = new Array(n);
                for (let i = n - 1; i >= 0; i--) {
                    const v = stack[--sp];
                    const k = stack[--sp];
                    entries[i] = { k, v };
                }
                for (let i = 0; i < n; i++) {
                    const { k, v } = entries[i];
                    if (k === OBJECT_SPREAD_MARKER) {
                        if (v && typeof v === 'object') {
                            for (const sk of Object.keys(v)) {
                                if (isDangerousObjectKey(sk)) continue;
                                o[sk] = v[sk];
                            }
                        }
                    } else {
                        if (isDangerousObjectKey(k)) continue;
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
            case 52: {
                const key = stack[--sp];
                const obj = stack[--sp];
                if (typeof key === 'number') {
                    if (Array.isArray(obj) || typeof obj === 'string') {
                        const v = obj[key];
                        stack[sp++] = v !== undefined ? v : null;
                        break;
                    }
                    if (obj && obj._type === undefined) {
                        let v = obj[key];
                        if (v === undefined) v = obj[String(key)];
                        if (typeof v === 'function') stack[sp++] = (args) => v.call(obj, args);
                        else stack[sp++] = v !== undefined ? v : null;
                        break;
                    }
                }
                if (isDangerousObjectKey(key)) {
                    stack[sp++] = null;
                    break;
                }
                if (Array.isArray(obj)) {
                    if (typeof key === 'number') { stack[sp++] = obj[key] ?? null; }
                    else if (_ARRAY_BUILTIN_METHODS.has(key) && this.builtins[key]) { stack[sp++] = (args) => this.builtins[key]([obj, ...args]); }
                    else { const v = obj[key]; if (typeof v === 'function') stack[sp++] = (args) => v.call(obj, ...args); else stack[sp++] = v !== undefined ? v : null; }
                } else if (typeof obj === 'string') {
                    if (typeof key === 'number') { stack[sp++] = obj[key] ?? null; }
                    else if (_STRING_BUILTIN_METHODS.has(key) && this.builtins[key]) { stack[sp++] = (args) => this.builtins[key]([obj, ...args]); }
                    else { const v = obj[key]; if (typeof v === 'function') stack[sp++] = (args) => v.call(obj, ...args); else stack[sp++] = v !== undefined ? v : null; }
                } else if (obj?._type === 'instance') {
                    if (!canAccessInstanceKey(this, obj, key)) {
                        stack[sp++] = null;
                        break;
                    }
                    let m = obj._methods[key];
                    let sc = obj._superClass;
                    while (!m && sc) {
                        const pc = globals[sc];
                        if (pc?._type === 'class') {
                            m = pc.methods[key];
                            sc = pc.superClass;
                        } else break;
                    }
                    const methodWrapper = m ? { _type: m.fiber ? 'fiber_method' : 'method', instance: obj, method: m } : null;
                    stack[sp++] = methodWrapper || (obj[key] ?? null);
                } else if (obj?._type === 'class') {
                    const m = obj.methods?.[key];
                    if (m) this._lastMethodGet = `runFast:172:${String(key)}`;
                    stack[sp++] = m ? { _type: m.fiber ? 'fiber_method' : 'method', instance: null, method: m, classObj: obj } : obj[key] ?? null;
                } else if (obj?._type === 'coroutine') {
                    if (key === 'resume') stack[sp++] = (args) => this._coroutineResume(obj, args[0]);
                    else if (key === 'status') stack[sp++] = (args) => this._coroutineStatus(obj);
                    else if (key === 'done') stack[sp++] = (args) => obj.state === 'done';
                    else stack[sp++] = obj[key] ?? null;
                } else if (obj?._type === 'module') {
                    const fn = obj.exports[key];
                    stack[sp++] = typeof fn === 'function' ? (args) => fn(args) : fn ?? null;
                } else if (obj?._type === 'closure' && obj._selfObject) {
                    const v = obj._selfObject[key];
                    if (typeof v === 'function') {
                        stack[sp++] = (args) => (v?._type === 'closure' ? this.callClosure(v, args || []) : v.call(obj._selfObject, args));
                    }
                    else stack[sp++] = v !== undefined ? v : null;
                } else {
                    const v = obj?.[key];
                    if (typeof v === 'function') stack[sp++] = (args) => v.call(obj, ...args);
                    else stack[sp++] = v !== undefined ? v : null;
                }
                break;
            }
            case 172: {
                const key = consts[code[ip++]];
                const obj = stack[--sp];
                if (typeof key === 'number') {
                    if (Array.isArray(obj) || typeof obj === 'string') {
                        const v = obj[key];
                        stack[sp++] = v !== undefined ? v : null;
                        break;
                    }
                    if (obj && obj._type === undefined) {
                        let v = obj[key];
                        if (v === undefined) v = obj[String(key)];
                        if (typeof v === 'function') stack[sp++] = (args) => v.call(obj, args);
                        else stack[sp++] = v !== undefined ? v : null;
                        break;
                    }
                }
                if (isDangerousObjectKey(key)) {
                    stack[sp++] = null;
                    break;
                }
                if (Array.isArray(obj)) {
                    if (typeof key === 'number') { stack[sp++] = obj[key] ?? null; }
                    else if (_ARRAY_BUILTIN_METHODS.has(key) && this.builtins[key]) { stack[sp++] = (args) => this.builtins[key]([obj, ...args]); }
                    else { const v = obj[key]; if (typeof v === 'function') stack[sp++] = (args) => v.call(obj, ...args); else stack[sp++] = v !== undefined ? v : null; }
                } else if (typeof obj === 'string') {
                    if (typeof key === 'number') { stack[sp++] = obj[key] ?? null; }
                    else if (_STRING_BUILTIN_METHODS.has(key) && this.builtins[key]) { stack[sp++] = (args) => this.builtins[key]([obj, ...args]); }
                    else { const v = obj[key]; if (typeof v === 'function') stack[sp++] = (args) => v.call(obj, ...args); else stack[sp++] = v !== undefined ? v : null; }
                } else if (obj?._type === 'instance') {
                    if (!canAccessInstanceKey(this, obj, key)) {
                        stack[sp++] = null;
                        break;
                    }
                    let m = obj._methods[key];
                    let sc = obj._superClass;
                    while (!m && sc) {
                        const pc = globals[sc];
                        if (pc?._type === 'class') {
                            m = pc.methods[key];
                            sc = pc.superClass;
                        } else break;
                    }
                    stack[sp++] = m ? { _type: m.fiber ? 'fiber_method' : 'method', instance: obj, method: m } : obj[key] ?? null;
                } else if (obj?._type === 'class') {
                    const m = obj.methods?.[key];
                    stack[sp++] = m ? { _type: m.fiber ? 'fiber_method' : 'method', instance: null, method: m, classObj: obj } : obj[key] ?? null;
                } else if (obj?._type === 'coroutine') {
                    if (key === 'resume') stack[sp++] = (args) => this._coroutineResume(obj, args[0]);
                    else if (key === 'status') stack[sp++] = (args) => this._coroutineStatus(obj);
                    else if (key === 'done') stack[sp++] = (args) => obj.state === 'done';
                    else stack[sp++] = obj[key] ?? null;
                } else if (obj?._type === 'module') {
                    const fn = obj.exports[key];
                    stack[sp++] = typeof fn === 'function' ? (args) => fn(args) : fn ?? null;
                } else if (obj?._type === 'closure' && obj._selfObject) {
                    const v = obj._selfObject[key];
                    if (typeof v === 'function') stack[sp++] = (args) => v.call(obj._selfObject, args);
                    else stack[sp++] = v !== undefined ? v : null;
                } else {
                    const v = obj?.[key];
                    if (typeof v === 'function') stack[sp++] = (args) => v.call(obj, ...args);
                    else stack[sp++] = v !== undefined ? v : null;
                }
                break;
            }
            case 53: {
                const o = stack[--sp], k = stack[--sp], v = stack[--sp];
                if (o && !isDangerousObjectKey(k) && canAccessInstanceKey(this, o, k)) {
                    if (o._type === 'closure' && o._selfObject) o._selfObject[k] = v;
                    else o[k] = v;
                }
                if (o && o._type === undefined && vmCurrentClosure && vmCurrentClosure._type === 'closure') {
                    vmCurrentClosure._selfObject = o;
                    const fnName = vmCurrentClosure._funcRef?.name || vmCurrentClosure.name;
                    if (fnName && fnName !== 'anonymous' && globals[fnName]) globals[fnName]._selfObject = o;
                }
                stack[sp++] = v;
                break;
            }
            case 163: {
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
                stack[sp++] = v;
                break;
            }
            case 60: { ip += code[ip] + 1; break; }
            case 61: {
                const offset = code[ip];
                if (offset > 0) {
                    const jifPos = ip - 1;
                    if (whileJitCache && fp === 0) {
                        const whileFn = whileJitCache[jifPos];
                        if (whileFn) { sp--; try { whileFn(globalVals, execBudget); } catch(e) { if (e.message === '__SEED_BUDGET_INSN__') { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: `Execution limit exceeded (${this._maxInstructions} instructions)`, output: this.output }; } if (e.message === '__SEED_BUDGET_TIME__') { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: `Execution timeout (${this._maxExecutionMs}ms)`, output: this.output }; } whileJitCache[jifPos] = null; break; } ip = ip + 1 + offset; break; }
                    }
                    if (nonLoopJumps?.has(jifPos)) {
                        const off = code[ip];
                        if (!stack[--sp]) ip += off + 1; else ip++;
                        break;
                    }
                    const jumpTarget = ip + 1 + offset;
                    let hasBackJump = false;
                    for (let scanIp = ip + 1; scanIp < jumpTarget; ) {
                        const scanOp = code[scanIp];
                        if (scanOp === 128) {
                            if (code[scanIp + 3] < 0) { hasBackJump = true; break; }
                            scanIp += 4;
                        } else if (scanOp === 60 || scanOp === 61 || scanOp === 62) { scanIp += 2; }
                        else if (scanOp === 96 || scanOp === 95) { scanIp += 4; }
                        else if (scanOp === 0) { scanIp++; }
                        else if (scanOp >= 1 && scanOp < 10) { scanIp += 2; }
                        else if (scanOp >= 10 && scanOp < 20) { scanIp += 2; }
                        else if (scanOp >= 20 && scanOp < 50) { scanIp++; }
                        else if (scanOp === 172) { scanIp += 2; }
                        else if (scanOp >= 50 && scanOp < 60) { scanIp++; }
                        else if (scanOp >= 97 && scanOp < 100) { scanIp += 3; }
                        else if (scanOp >= 102 && scanOp < 106) { scanIp += 3; }
                        else if (scanOp >= 111 && scanOp < 120) { scanIp += 3; }
                        else if (scanOp >= 128 && scanOp < 130) { scanIp += 4; }
                        else if (scanOp >= 135 && scanOp < 140) { scanIp++; }
                        else if (scanOp === 155) { scanIp += 2; }
                        else if (scanOp === 156 || scanOp === 157) { scanIp += 2; }
                        else if (scanOp === 158) { scanIp += 2; }
                        else if (scanOp >= 159 && scanOp <= 161) { scanIp += 2; }
                        else if (scanOp === 72) { scanIp += 3; }
                        else { scanIp++; }
                    }
                    if (!hasBackJump) {
                        if (!nonLoopJumps) { nonLoopJumps = new Set(); this._nonLoopJumps = nonLoopJumps; }
                        nonLoopJumps.add(jifPos);
                        if (!stack[--sp]) ip += code[ip] + 1; else ip++;
                        break;
                    }
                    if (!whileJitCache) { whileJitCache = {}; this._whileJitCache = whileJitCache; }
                    let whileFn = (fp === 0) ? whileJitCache[jifPos] : null;
                    if (whileFn === undefined) {
                            let condStart = 0;
                            let scanBack = ip - 2;
                            while (scanBack >= 0) {
                                const op = code[scanBack];
                                if (op === 62) {
                                    scanBack -= 2;
                                } else if (op === 61 || op === 60) {
                                    condStart = scanBack + 2;
                                    break;
                                } else if (op === 5) {
                                    scanBack--;
                                } else if (op === 128) {
                                    scanBack -= 4;
                                } else if (op === 96 || op === 95) {
                                    scanBack -= 4;
                                } else if (op >= 102 && op < 106) {
                                    condStart = scanBack + 3;
                                    break;
                                } else if (op >= 97 && op < 100) {
                                    scanBack -= 3;
                                } else if (op >= 111 && op < 120) {
                                    scanBack -= 3;
                                } else if (op >= 115 && op < 118) {
                                    scanBack -= 3;
                                } else if (op >= 10 && op < 20) {
                                    scanBack -= 2;
                                } else if (op >= 1 && op < 10) {
                                    scanBack -= 2;
                                } else if (op === 0 || (op >= 20 && op < 50) || (op >= 135 && op < 140)) {
                                    scanBack--;
                                } else if (op === 155) {
                                    scanBack -= 2;
                                } else if (op === 156 || op === 157) {
                                    scanBack -= 2;
                                } else if (op === 158) {
                                    scanBack -= 2;
                                } else if (op >= 159 && op <= 161) {
                                    scanBack -= 2;
                                } else {
                                    condStart = scanBack + 1;
                                    break;
                                }
                            }
                            const condEnd = ip - 1;
                            const condCompiled = this._compileWhileCondition(code, consts, condStart, condEnd);
                            const loopBodyStart = ip + 1;
                            const bodyCompiled = this._compileWhileBody(code, consts, loopBodyStart, jumpTarget);
                            if (condCompiled && condCompiled.condition && bodyCompiled && bodyCompiled.bodySrc) {
                                try {
                                    const ug = new Set([...(condCompiled.usedGlobals || []), ...(bodyCompiled.usedGlobals || [])]);
                                    let fullSrc = '';
                                    for (const idx of ug) fullSrc += `var v${idx}=g[${idx}];`;
                                    fullSrc += `var __bc=1024;while(${condCompiled.condition}){${_BUDGET_CHECK}${bodyCompiled.bodySrc}}`;
                                    for (const idx of ug) fullSrc += `g[${idx}]=v${idx};`;
                                    whileFn = this._safeNewFunction('g', '__b', fullSrc);
                                } catch(e) { whileFn = null; }
                            } else { whileFn = null; }
                            whileJitCache[jifPos] = whileFn;
                        }
                        if (whileFn) {
                            try {
                                whileFn(globalVals, execBudget);
                            } catch(e) {
                                if (e.message === '__SEED_BUDGET_INSN__') {
                                    this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                                    this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                                    return { success: false, error: `Execution limit exceeded (${this._maxInstructions} instructions)`, output: this.output };
                                }
                                if (e.message === '__SEED_BUDGET_TIME__') {
                                    this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                                    this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                                    return { success: false, error: `Execution timeout (${this._maxExecutionMs}ms)`, output: this.output };
                                }
                                throw e;
                            }
                            ip = jumpTarget;
                            break;
                        }
                        const off = code[ip];
                        if (!stack[--sp]) ip += off + 1; else ip++;
                        break;
                }
                const off = code[ip];
                if (!stack[--sp]) ip += off + 1; else ip++;
                break;
            }
            case 62: { const off = code[ip]; if (!stack[sp - 1]) ip += off + 1; else ip++; break; }
            case 180: {
                const v = stack[--stackDepth];
                stack[stackDepth++] = Array.isArray(v) ? 1 : 0;
                break;
            }
            case 254: {
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
                        this._tcoHits = (this._tcoHits || 0) + 1;
                        const tStart = tFn._start !== undefined ? tFn._start : tFn.start;
                        for (let ti = 0; ti < tn; ti++) stack[fp + ti] = stack[tFnIdx + 1 + ti];
                        sp = fp + Math.max(tn, tFn._localCount || tn);
                        ip = tStart;
                        vmLocals = tFn._localScopeArr;
                        vmCapturedVars = tFn._cvArr || null;
                        vmCvArr = resolveCallCvArr(tFn, vmCapturedVars, vmCvArrResolveCache);
                        vmCurrentClosure = tFn;
                        break;
                    }
                }
                this._tcoMisses = (this._tcoMisses || 0) + 1;
                sp = tFnIdx;
                stack.push(tFn);
                for (let ti = 0; ti < tn; ti++) stack.push(stack[tFnIdx + 1 + ti]);
                ip--;
                continue;
            }
            case 63: {
                const n = code[ip++];
                const fnIdx = sp - n - 1;
                const fn = stack[fnIdx];
                sp = fnIdx;
                
                if (fn && fn._type === 'closure') {
                    if (n === 1) {
                        const tupleArg = stack[fnIdx + 1];
                        if (Array.isArray(tupleArg)) {
                            const fnParams = fn._funcRef?.params || fn.params || [];
                            if (fnParams.length > 1) {
                                this._sp = sp; this._fp = fp; this._frameTop = frameTop;
                                this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                                const result = this.callClosure(fn, tupleArg);
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
                        }
                    }
                    if (jitEnabled && fn._funcRef?.name) jit.recordCall(fn._funcRef.name);
                    const fnCaptured = fn.capturedVars;
                    const hasCaptured = !!(fnCaptured && typeof fnCaptured === 'object' && Object.keys(fnCaptured).length > 0);
                    const fnShared = fn.sharedCaptured;
                    const hasSharedCaptured = !fn._noCapture && !!(fnShared && typeof fnShared === 'object' && Object.keys(fnShared).length > 0);
                    if ((hasCaptured || hasSharedCaptured) && n !== 0) {
                        let argsArr;
                        if (n === 0) argsArr = [];
                        else if (n === 1) argsArr = [stack[fnIdx + 1]];
                        else if (n === 2) argsArr = [stack[fnIdx + 1], stack[fnIdx + 2]];
                        else if (n === 3) argsArr = [stack[fnIdx + 1], stack[fnIdx + 2], stack[fnIdx + 3]];
                        else {
                            argsArr = new Array(n);
                            for (let i = 0; i < n; i++) argsArr[i] = stack[fnIdx + 1 + i];
                        }
                        this._sp = sp; this._fp = fp; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        const result = this.callClosure(fn, argsArr);
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
                    if (n === 1) {
                        const inlineOp = fn._inlineOp;
                        if (inlineOp !== undefined) {
                            const cv = fn._capturedVal;
                            const argVal = stack[fnIdx + 1];
                            if (inlineOp === 100) { stack[sp++] = cv + argVal; break; }
                            if (inlineOp === 107) { stack[sp++] = cv - argVal; break; }
                            if (inlineOp === 108) { stack[sp++] = cv * argVal; break; }
                            if (inlineOp === 109) { if (argVal === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } stack[sp++] = cv / argVal; break; }
                        }
                        const fnCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                        if (fnCvArr && fnCvArr.length === 1 && fnCvArr[0] && !vmCapturedVars && !vmSharedCaptured) {
                            const argVal = stack[fnIdx + 1];
                            const fnCode = fn._ctx[0];
                            const startOp = fnCode[fn.start];
                            if (startOp === 100) { stack[sp++] = fnCvArr[0].value + argVal; break; }
                            if (startOp === 107) { stack[sp++] = fnCvArr[0].value - argVal; break; }
                            if (startOp === 108) { stack[sp++] = fnCvArr[0].value * argVal; break; }
                            if (startOp === 109) { if (argVal === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } stack[sp++] = fnCvArr[0].value / argVal; break; }
                        }
                        if (fn._inlineFn) {
                            stack[sp++] = fn._inlineFn(stack[fnIdx + 1]);
                            break;
                        }
                    }
                    if (n === 2 && !vmCapturedVars) {
                        const fnCode = fn._ctx[0];
                        const startOp = fnCode[fn.start];
                        const a0 = stack[fnIdx + 1];
                        const a1 = stack[fnIdx + 2];
                        if (startOp === 121 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { stack[sp++] = a0 + a1; break; }
                        if (startOp === 122 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { stack[sp++] = a0 - a1; break; }
                        if (startOp === 123 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { stack[sp++] = a0 * a1; break; }
                        if (startOp === 124 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { if (a1 === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } stack[sp++] = a0 / a1; break; }
                    }
                    if (n === 1 && fn._noCapture && fn._isSelfRecursive && !this._executionGuardEnabled) {
                        if (fn._nativeFn === undefined) {
                            const src = this._compileSelfRecursive(fn);
                            if (src) {
                                try {
                                    const maker = this._safeNewFunction([], 'return function __self__(a0){' + src + '}');
                                    fn._nativeFn = maker ? maker() : null;
                                } catch(e) { fn._nativeFn = null; }
                            } else { fn._nativeFn = null; }
                        }
                        if (!this._executionGuardEnabled && fn._nativeFn && !(fn._returnsObjectLiteral || fn._funcRef?._returnsObjectLiteral)) { stack[sp++] = fn._nativeFn(stack[fnIdx + 1]); break; }
                    }
                    if (!this._executionGuardEnabled && fn._noCapture && fn._nativeFn === undefined && !fn._isSelfRecursive) {
                        const src = this._compileLeafFunction(fn);
                        if (src) {
                            if (!fn._usedNativeFns || fn._usedNativeFns.length === 0) {
                                fn._nativeFnSrc = src;
                            }
                            try {
                                const paramNames = [];
                                for (let pi = 0; pi < n; pi++) paramNames.push(`a${pi}`);
                                if (fn._usedNativeFns && fn._usedNativeFns.length > 0) {
                                    const nativeArgs = fn._usedNativeFns.map((_, i) => `_n${i}`).join(',');
                                    const maker = this._safeNewFunction([...fn._usedNativeFns.map((_, i) => `_n${i}`)], 'return function(' + paramNames.join(',') + '){' + src + '}');
                                    fn._nativeFn = maker ? maker(...fn._usedNativeFns) : null;
                                } else {
                                    const maker = this._safeNewFunction([], 'return function(' + paramNames.join(',') + '){' + src + '}');
                                    fn._nativeFn = maker ? maker() : null;
                                }
                            } catch(e) { fn._nativeFn = null; }
                        } else { fn._nativeFn = null; }
                    }
                    if (!this._executionGuardEnabled && fn._nativeFn && !(fn._returnsObjectLiteral || fn._funcRef?._returnsObjectLiteral)) {
                        if (n === 0) { stack[sp++] = fn._nativeFn(); }
                        else if (n === 1) { stack[sp++] = fn._nativeFn(stack[fnIdx + 1]); }
                        else if (n === 2) { stack[sp++] = fn._nativeFn(stack[fnIdx + 1], stack[fnIdx + 2]); }
                        else if (n === 3) { stack[sp++] = fn._nativeFn(stack[fnIdx + 1], stack[fnIdx + 2], stack[fnIdx + 3]); }
                        else {
                            const args = [];
                            for (let ai = 0; ai < n; ai++) args.push(stack[fnIdx + 1 + ai]);
                            stack[sp++] = fn._nativeFn(...args);
                        }
                        break;
                    }
                    const savedFp = fp;
                    const savedSp = sp;
                    const savedLocals = vmLocals;
                    const fnCv = prepareCallCapturedVars(fn);
                    const fnCtx = fn._ctx;
                    const fnCode = fnCtx[0];
                    const callerHasCv = vmCapturedVars || vmSharedCaptured;
                    
                    if (n === 0) { fp = fnIdx; }
                    else if (n === 1) { stack[fnIdx] = stack[fnIdx + 1]; fp = fnIdx; sp = fnIdx + 1; }
                    else if (n === 2) { stack[fnIdx] = stack[fnIdx + 1]; stack[fnIdx + 1] = stack[fnIdx + 2]; fp = fnIdx; sp = fnIdx + 2; }
                    else if (n === 3) { stack[fnIdx] = stack[fnIdx + 1]; stack[fnIdx + 1] = stack[fnIdx + 2]; stack[fnIdx + 2] = stack[fnIdx + 3]; fp = fnIdx; sp = fnIdx + 3; }
                    else { for (let i = 0; i < n; i++) stack[fnIdx + i] = stack[fnIdx + 1 + i]; fp = fnIdx; sp = fnIdx + n; }
                    
                    const fnLocalCount = fn._localCount || 0;
                    if (fnLocalCount > n) {
                        const targetSp = fp + fnLocalCount;
                        for (let li = fp + n; li < targetSp; li++) stack[li] = undefined;
                        sp = targetSp;
                    }
                    
                    if (frameTop >= MAX_FRAME_DEPTH) { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: 'stack overflow', output: this.output }; }
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
                        if (fnCode !== code) {
                            fr.codes[ft] = code;
                            fr.consts[ft] = consts;
                            fr.vars[ft] = vars;
                            fr.globalValsArrs[ft] = globalVals;
                            const fnConsts = fnCtx[1];
                            this.code = fnCode;
                            this.consts = fnConsts || this.consts;
                            code = fnCode;
                            consts = fnConsts || consts;
                        } else {
                            fr.codes[ft] = null;
                            fr.globalValsArrs[ft] = null;
                        }
                        const fnVars = fnCtx[2] || vars;
                        if (fnVars && fnVars !== vars) {
                            if (!fr.globalValsArrs[ft]) fr.globalValsArrs[ft] = globalVals;
                            const fnVarsLen = fnVars.length;
                            globalVals = new Array(fnVarsLen);
                            this._globalVals = globalVals;
                            const globals = this.globals;
                            const builtins = this.builtins;
                            for (let i = 0; i < fnVarsLen; i++) {
                                const name = fnVars[i];
                                const v = Object.prototype.hasOwnProperty.call(globals, name) ? globals[name] : undefined;
                                if (v !== undefined) {
                                    globalVals[i] = hardenArrayObject(v);
                                } else {
                                    const bv = builtins[name];
                                    globalVals[i] = bv !== undefined ? bv : null;
                                }
                            }
                            vars = fnVars;
                        }
                    }
                    
                    vmLocals = fn._localScopeArr;
                    vmCapturedVars = fnCv;
                    refreshCapturedLocalsFromFrame(fn, vmLocals, stack, fp, vmCapturedVars);
                    vmCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                    vmSharedCaptured = resolveCallSharedCaptured(fn, vmCapturedVars);
                    if (!vmSharedCaptured && vmCapturedVars && !Array.isArray(vmCapturedVars)) vmSharedCaptured = vmCapturedVars;
                    vmCurrentClosure = fn;
                    ip = fn._start !== undefined ? fn._start : fn.start;
                } else if (fn && fn._type === 'class') {
                    const instance = createSafeInstance(fn.name, fn.methods, fn.superClass, this);
                    const initMethod = fn.methods.init || fn.methods['__init__'] || fn.methods.constructor;
                    if (initMethod && initMethod.code) {
                        const args = [];
                        for (let i = 0; i < n; i++) args.push(stack[fnIdx + 1 + i]);
                        this._sp = sp; this._fp = fp; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                        const savedCode3 = this.code; const savedConsts3 = this.consts; const savedVars3 = this.vars; const savedIp3 = ip;
                        const savedStack3 = this.stack; const savedSp3 = sp; const savedFp3 = fp;
                        const savedLocals3 = this.locals; const savedCaptured3 = this.capturedVars; const savedShared3 = this.sharedCaptured;
                        const savedCurrentClass3 = this.currentClass;
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
                        const initParams = initMethod.params || [];
                        for (let i = 0; i < initParams.length; i++) this.stack.push(args[i]);
                        while (true) {
                            const subOp = this.code[this.ip++];
                            if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                            if (subOp === 64 || subOp === 143) break;
                            if (subOp === 91) { this.ip++; break; }
                            if (subOp === 121 || subOp === 122 || subOp === 123 || subOp === 124) { this.ip += 2; break; }
                            if (subOp === 100 || subOp === 107 || subOp === 108 || subOp === 109) { this.ip += 2; break; }
                            this._executeOpInline(subOp);
                        }
                        this.stack = savedStack3;
                        this._fp = savedFp3;
                        this.code = savedCode3;
                        this.consts = savedConsts3;
                        this.vars = savedVars3;
                        this.currentClass = savedCurrentClass3;
                        this.locals = savedLocals3;
                        this.capturedVars = savedCaptured3;
                        this.sharedCaptured = savedShared3;
                        stack = this.stack;
                        sp = savedSp3;
                        vmLocals = this.locals; vmCapturedVars = this.capturedVars; vmSharedCaptured = this.sharedCaptured;
                    }
                    stack[sp++] = instance;
                } else if (fn?._type === 'fiber_method') {
                    const fmArgs = [];
                    for (let i = 0; i < n; i++) fmArgs.push(stack[fnIdx + 1 + i]);
                    stack.length = fnIdx;
                    sp = fnIdx;
                    stack[sp++] = _createCoroutineFromMethod(fn.method, fn.instance, fmArgs);
                } else if (fn?._type === 'method') {
                    const method = fn.method;
                    const methodInstance = fn.instance;
                    this._lastMethodBranch = `runFast:63:${fn.methodName || 'unknown'}`;
                    if (!Array.isArray(this._methodTrace)) this._methodTrace = [];
                    let methodTraceIdx = -1;
                    if (this._methodTrace.length < 32) {
                        methodTraceIdx = this._methodTrace.length;
                        this._methodTrace.push(`runFast63:${(method?.params || []).join('|')}:argc=${n}`);
                    }
                    const args = [];
                    for (let i = 0; i < n; i++) args.push(stack[fnIdx + 1 + i]);
                    this._sp = sp; this._fp = fp; this._frameTop = frameTop;
                    this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                    const savedCode2 = this.code; const savedConsts2 = this.consts; const savedVars2 = this.vars; const savedIp2 = ip;
                    const savedStack2 = this.stack; const savedSp2 = sp; const savedFp2 = fp;
                    const savedLocals2 = this.locals; const savedCaptured2 = this.capturedVars; const savedShared2 = this.sharedCaptured;
                    this.code = method.code;
                    this.consts = method.consts;
                    this.vars = method.vars || [];
                    this.ip = resolveMethodStart(method);
                    const savedCurrentClass2 = this.currentClass;
                    if (!method.isStatic && methodInstance?._class) this.currentClass = methodInstance._class;
                    if (method.isStatic) {
                        this.stack = [];
                    } else {
                        this.stack = [methodInstance];
                    }
                    this._fp = 0;
                    let methodLocals = null;
                    if (method.localScope) {
                        methodLocals = { ...method.localScope };
                    } else {
                        const localMap = {};
                        let hasLocal = false;
                        const paramBase = method.isStatic ? 0 : 1;
                        const methodParams2 = method.params || [];
                        for (let i = 0; i < methodParams2.length; i++) {
                            localMap[methodParams2[i]] = paramBase + i;
                            hasLocal = true;
                        }
                        const capturedNames = [];
                        const capturedSeen = new Set();
                        const methodConsts = method.consts;
                        if (Array.isArray(methodConsts)) {
                            for (let ci = 0; ci < methodConsts.length; ci++) {
                                const c = methodConsts[ci];
                                if (!c || c.type !== 'func' || !Array.isArray(c.capturedVars)) continue;
                                for (let i = 0; i < c.capturedVars.length; i++) {
                                    const name = c.capturedVars[i];
                                    if (!capturedSeen.has(name) && localMap[name] === undefined) {
                                        capturedSeen.add(name);
                                        capturedNames.push(name);
                                    }
                                }
                            }
                        }
                        if (capturedNames.length > 0) {
                            const usedIdx = new Set(Object.values(localMap));
                            const setLocalIdx = [];
                            const mCode = method.code || [];
                            for (let ci = 0; ci < mCode.length; ci++) {
                                if (mCode[ci] !== OP.SET_LOCAL) continue;
                                const li = mCode[ci + 1];
                                if (typeof li !== 'number' || usedIdx.has(li)) continue;
                                if (!setLocalIdx.includes(li)) setLocalIdx.push(li);
                                ci++;
                            }
                            const assignCount = Math.min(capturedNames.length, setLocalIdx.length);
                            for (let i = 0; i < assignCount; i++) {
                                localMap[capturedNames[i]] = setLocalIdx[i];
                                hasLocal = true;
                            }
                        }
                        if (hasLocal) methodLocals = localMap;
                    }
                    this.locals = methodLocals ? [methodLocals] : this._emptyLocals;
                    this._lastMethodLocals = methodLocals ? JSON.stringify(methodLocals) : 'null';
                    this.capturedVars = null;
                    this.sharedCaptured = null;
                    const methodParams = method.params || [];
                    for (let i = 0; i < methodParams.length; i++) this.stack.push(args[i]);
                    let returnValue = null;
                    while (true) {
                        const subOp = this.code[this.ip++];
                        if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                        if (subOp === 64) {
                            returnValue = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
                            break;
                        }
                        if (subOp === 91) {
                            const idx = this.code[this.ip++];
                            returnValue = this.stack[this._fp + idx];
                            break;
                        }
                        if (subOp === 143) {
                            returnValue = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
                            break;
                        }
                        if (subOp === 121) { const a = this.code[this.ip++]; const b = this.code[this.ip++]; returnValue = this.stack[this._fp + a] + this.stack[this._fp + b]; break; }
                        if (subOp === 122) { const a = this.code[this.ip++]; const b = this.code[this.ip++]; returnValue = this.stack[this._fp + a] - this.stack[this._fp + b]; break; }
                        if (subOp === 123) { const a = this.code[this.ip++]; const b = this.code[this.ip++]; returnValue = this.stack[this._fp + a] * this.stack[this._fp + b]; break; }
                        if (subOp === 124) { const a = this.code[this.ip++]; const b = this.code[this.ip++]; returnValue = this.stack[this._fp + a] / this.stack[this._fp + b]; break; }
                        if (subOp === 100) { const ci = this.code[this.ip++]; const li = this.code[this.ip++]; const cv = this.capturedVars?.[ci]; returnValue = (cv?._type === 'shared' ? cv.value : cv) + this.stack[this._fp + li]; break; }
                        if (subOp === 107) { const ci = this.code[this.ip++]; const li = this.code[this.ip++]; const cv = this.capturedVars?.[ci]; returnValue = (cv?._type === 'shared' ? cv.value : cv) - this.stack[this._fp + li]; break; }
                        if (subOp === 108) { const ci = this.code[this.ip++]; const li = this.code[this.ip++]; const cv = this.capturedVars?.[ci]; returnValue = (cv?._type === 'shared' ? cv.value : cv) * this.stack[this._fp + li]; break; }
                        if (subOp === 109) { const ci = this.code[this.ip++]; const li = this.code[this.ip++]; const cv = this.capturedVars?.[ci]; returnValue = (cv?._type === 'shared' ? cv.value : cv) / this.stack[this._fp + li]; break; }
                        this._executeOpInline(subOp);
                    }
                    this._lastMethodReturnValue = returnValue;
                    this._lastMethodStackTop = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
                    if (methodTraceIdx >= 0) {
                        const rvType = returnValue === null ? 'null' : Array.isArray(returnValue) ? `arr:${returnValue.length}` : typeof returnValue;
                        this._methodTrace[methodTraceIdx] = `${this._methodTrace[methodTraceIdx]}:ret=${rvType}`;
                    }
                    this.stack = savedStack2;
                    this._fp = savedFp2;
                    this.code = savedCode2;
                    this.consts = savedConsts2;
                    this.vars = savedVars2;
                    this.locals = savedLocals2;
                    this.capturedVars = savedCaptured2;
                    this.sharedCaptured = savedShared2;
                    this.currentClass = savedCurrentClass2;
                    stack = this.stack;
                    sp = savedSp2;
                    vmLocals = this.locals; vmCapturedVars = this.capturedVars; vmSharedCaptured = this.sharedCaptured;
                    stack[sp++] = returnValue;
                } else if (typeof fn === 'function') {
                    let args;
                    if (n === 0) args = [];
                    else if (n === 1) args = [stack[sp + 1]];
                    else if (n === 2) args = [stack[sp + 1], stack[sp + 2]];
                    else if (n === 3) args = [stack[sp + 1], stack[sp + 2], stack[sp + 3]];
                    else { args = new Array(n); for (let i = 0; i < n; i++) args[i] = stack[sp + 1 + i]; }
                    this._sp = sp; this._fp = fp; this._frameTop = frameTop;
                    this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                    const result = fn(args);
                    stack = this.stack; sp = this._sp; fp = this._fp; frameTop = this._frameTop;
                    vmLocals = this.locals; vmCapturedVars = this.capturedVars; vmSharedCaptured = this.sharedCaptured;
                    stack[sp++] = result;
                } else { stack[sp++] = null; }
                break;
            }
            case 64: {
                const v = sp > 0 ? stack[--sp] : null;
                syncClosureSelfObject(vmCurrentClosure, v);
                if (inTry && tryStack.length > 0) {
                    let hasFinally = false;
                    for (let ti = tryStack.length - 1; ti >= 0; ti--) {
                        const th = tryStack[ti];
                        if (th.finallyIp !== null && !th.inFinally && th.frameTop === frameTop) {
                            th.pendingReturn = v;
                            th.pendingReturnSet = true;
                            th.inFinally = true;
                            ip = th.finallyIp;
                            hasFinally = true;
                            break;
                        }
                    }
                    if (hasFinally) break;
                }
                if (frameTop > 0) {
                    const ft = --frameTop;
                    if (ft === 0) this._lastFrame0Pop = `RETURN_LOCAL(savedCodeLen=${fr.codes[ft] ? fr.codes[ft].length : -1},savedIp=${fr.ips[ft] ?? -1},savedSimple=${frSimple[ft]})`;
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
                        const savedGlobalVals = fr.globalValsArrs[ft];
                        if (savedGlobalVals) { globalVals = savedGlobalVals; this._globalVals = savedGlobalVals; if (!savedCode) vars = fr.vars[ft]; }
                    }
                    stack[sp++] = v;
                } else {
                    stack[sp++] = v;
                }
                break;
            }
            case 143: {
                const v = sp > 0 ? stack[--sp] : null;
                syncClosureSelfObject(vmCurrentClosure, v);
                if (inTry && tryStack.length > 0) {
                    let hasFinally = false;
                    for (let ti = tryStack.length - 1; ti >= 0; ti--) {
                        const th = tryStack[ti];
                        if (th.finallyIp !== null && !th.inFinally && th.frameTop === frameTop) {
                            th.pendingReturn = v;
                            th.pendingReturnSet = true;
                            th.inFinally = true;
                            ip = th.finallyIp;
                            hasFinally = true;
                            break;
                        }
                    }
                    if (hasFinally) break;
                }
                if (frameTop > 0) {
                    const ft = --frameTop;
                    if (ft === 0) this._lastFrame0Pop = `RETURN_SIMPLE(savedCodeLen=${fr.codes[ft] ? fr.codes[ft].length : -1},savedIp=${fr.ips[ft] ?? -1},savedSimple=${frSimple[ft]})`;
                    const fst = frSimple[ft];
                    if (fst === 2) {
                        const base3 = ft * 3;
                        ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                    } else if (fst === 1) {
                        ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2];
                        vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4];
                        vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                    } else {
                        ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                        vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                        const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                        vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                        const savedCode = fr.codes[ft];
                        if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                    }
                    stack[sp++] = v;
                } else {
                    stack[sp++] = v;
                }
                break;
            }
            case 144: {
                const li = code[ip++]; const ci = code[ip++]; const jump = code[ip++]; ip += 3;
                if (stack[fp + li] < consts[ci]) {
                    const v = stack[fp + li];
                    if (frameTop > 0) {
                        const ft = --frameTop;
                        if (ft === 0) this._lastFrame0Pop = `14089(savedCodeLen=${fr.codes[ft] ? fr.codes[ft].length : -1},savedIp=${fr.ips[ft] ?? -1},savedSimple=${frSimple[ft]})`;
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
                        stack[sp++] = v;
                    } else { stack[sp++] = v; }
                } else {
                    ip += jump;
                }
                break;
            }
            case 145: {
                const li = code[ip++]; const ci = code[ip++];
                const fn = vmCurrentClosure;
                const argVal = stack[fp + li] - consts[ci];
                const savedFp = fp;
                const savedSp = sp;
                const savedLocals = vmLocals;
                stack[sp] = argVal;
                fp = sp;
                sp = fn._lc > 1 ? fp + fn._lc : fp + 1;
                const ft = frameTop;
                const base = ft * 5;
                sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = fn;
                frSimple[ft] = 1;
                if (ft + 1 >= MAX_FRAME_DEPTH) { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: 'stack overflow', output: this.output }; }
                frameTop = ft + 1;
                vmLocals = fn._lsa;
                vmCapturedVars = prepareCallCapturedVars(fn);
                vmCvArr = null;
                vmSharedCaptured = resolveCallSharedCaptured(fn, vmCapturedVars);
                ip = fn._start;
                break;
            }
            case 146: {
                const b = stack[--sp]; const a = stack[--sp];
                const v = a + b;
                if (frameTop > 0) {
                    const ft = --frameTop;
                    if (ft === 0) this._lastFrame0Pop = `RETURN_LOCAL(savedCodeLen=${fr.codes[ft] ? fr.codes[ft].length : -1},savedIp=${fr.ips[ft] ?? -1},savedSimple=${frSimple[ft]})`;
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
                    stack[sp++] = v;
                } else { stack[sp++] = v; }
                break;
            }
            case 147: {
                const li = code[ip++]; const ci = code[ip++]; ip++;
                const fn = vmCurrentClosure;
                const argVal = stack[fp + li] - consts[ci];
                if (_canUseFastFib(fn, argVal)) { stack[sp++] = _fastFibNonNegInt(argVal); break; }
                const savedFp = fp;
                const savedSp = sp;
                const savedLocals = vmLocals;
                stack[sp] = argVal;
                fp = sp;
                sp = fn._lc > 1 ? fp + fn._lc : fp + 1;
                const ft = frameTop;
                const base = ft * 5;
                sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = fn;
                frSimple[ft] = 1;
                if (ft + 1 >= MAX_FRAME_DEPTH) { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: 'stack overflow', output: this.output }; }
                frameTop = ft + 1;
                vmLocals = fn._lsa;
                vmCapturedVars = null;
                vmCvArr = null;
                vmSharedCaptured = null;
                ip = fn._start;
                break;
            }
            case 148: {
                const li = code[ip++]; const ci = code[ip++]; ip++;
                const fn = vmCurrentClosure;
                const argVal = stack[fp + li] - consts[ci];
                if (_canUseFastFib(fn, argVal)) { stack[sp++] = _fastFibNonNegInt(argVal); break; }
                const ft = frameTop;
                const base3 = ft * 3;
                sfSelf[base3] = ip; sfSelf[base3 + 1] = fp; sfSelf[base3 + 2] = sp;
                frSimple[ft] = 2;
                stack[sp] = argVal;
                fp = sp;
                sp = fn._lc > 1 ? fp + fn._lc : fp + 1;
                if (ft + 1 >= MAX_FRAME_DEPTH) { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: 'stack overflow', output: this.output }; }
                frameTop = ft + 1;
                ip = fn._start;
                break;
            }
            case 149: {
                const val = stack[--sp];
                const arr = stack[sp - 1];
                if (Array.isArray(arr)) {
                    arr.push(val);
                } else {
                    stack[sp - 1] = null;
                }
                break;
            }
            case 162: {
                const val = stack[--sp];
                const arr = stack[--sp];
                if (Array.isArray(arr)) {
                    arr.push(val);
                }
                break;
            }
            case 150: {
                const idx = stack[--sp];
                const arr = stack[sp - 1];
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
            case 118: {
                const fn = vmCurrentClosure;
                const argVal = stack[--sp];
                if (_canUseFastFib(fn, argVal)) { stack[sp++] = _fastFibNonNegInt(argVal); break; }
                const savedFp = fp;
                const savedSp = sp;
                const savedLocals = vmLocals;
                stack[sp] = argVal;
                fp = sp;
                sp = fn._lc > 1 ? fp + fn._lc : fp + 1;
                const ft = frameTop;
                const base = ft * 5;
                sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = fn;
                frSimple[ft] = 1;
                if (ft + 1 >= MAX_FRAME_DEPTH) { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: 'stack overflow', output: this.output }; }
                frameTop = ft + 1;
                vmLocals = fn._lsa;
                vmCapturedVars = null;
                vmCvArr = null;
                vmSharedCaptured = null;
                ip = fn._start;
                break;
            }
            case 65: {
                const f = consts[code[ip++]];
                const nextOp = code[ip];
                if (f._noCapture) {
                    if (f._cachedClosure && f._cachedClosure._ctx[0] === code) {
                        if (!f._cachedClosure._isSelfRecursive && f._localCount === 1) {
                            const fc = code;
                            let hasSelfRec = false;
                            for (let i = f.start; i < f.end; i++) { if (fc[i] === 148) { hasSelfRec = true; break; } }
                            if (hasSelfRec) { f._cachedClosure._isSelfRecursive = true; f._isSelfRecursive = true; }
                        }
                        if (jitEnabled && f.name && this.funcASTs[f.name]) { jit.registerFunction(f.name, this.funcASTs[f.name], null); }
                        if (nextOp === 105) { ip++; globalVals[code[ip++]] = f._cachedClosure; stack[sp++] = f._cachedClosure; }
                        else if (nextOp === 104) { ip++; globalVals[code[ip++]] = f._cachedClosure; stack[sp++] = f._cachedClosure; }
                        else { stack[sp++] = f._cachedClosure; }
                        break;
                    }
                    const c = { _type: 'closure', start: f.start, end: f.end, _ctx: [code, consts, vars], _localScopeArr: f._lsa, _localCount: f._localCount, _lsa: f._lsa, _lc: f._localCount, _start: f.start, capturedVars: {}, sharedCaptured: null, _funcRef: f, _isLeaf: f._isLeaf, _isClassicFib: f._isClassicFib, _cvArr: null, _fr: f._funcRef || f, _noCapture: true, _returnsInlineClosure: f._returnsInlineClosure, _innerClosureIdx: f._innerClosureIdx, _innerInlineOp: f._innerInlineOp, _cachedInlineClosure: f._cachedInlineClosure };
                    if (f._isLeaf && f._noCapture && !f._isSelfRecursive) {
                        const src = this._compileLeafFunction({ _ctx: [code, consts, vars], _start: f.start, _funcRef: f, _localCount: f._localCount });
                        if (src) c._nativeFnSrc = src;
                    }
                    if (f._localCount === 1 && f._noCapture) {
                        const fc = code;
                        let hasSelfRec = false;
                        for (let i = f.start; i < f.end; i++) { if (fc[i] === 148) { hasSelfRec = true; break; } }
                        if (hasSelfRec) { c._isSelfRecursive = true; f._isSelfRecursive = true; }
                    }
                    f._cachedClosure = c;
                    if (jitEnabled && f.name && this.funcASTs[f.name]) { jit.registerFunction(f.name, this.funcASTs[f.name], null); }
                    if (nextOp === 105) { ip++; globalVals[code[ip++]] = c; stack[sp++] = c; }
                    else if (nextOp === 104) { ip++; globalVals[code[ip++]] = c; stack[sp++] = c; }
                    else { stack[sp++] = c; }
                    break;
                }
                const captured = {};
                if (vmLocals && Array.isArray(vmLocals)) {
                    for (let i = vmLocals.length - 1; i >= 0; i--) {
                        const scope = vmLocals[i];
                        for (const varName in scope) {
                            if (Object.prototype.hasOwnProperty.call(captured, varName)) continue;
                            const idx = scope[varName];
                            if (idx !== undefined) {
                                let sharedBox = null;
                                if (vmSharedCaptured && !Array.isArray(vmSharedCaptured) && Object.prototype.hasOwnProperty.call(vmSharedCaptured, varName)) {
                                    sharedBox = vmSharedCaptured[varName];
                                    sharedBox.value = stack[fp + idx];
                                }
                                if (!sharedBox) {
                                    sharedBox = { value: stack[fp + idx] };
                                }
                                if (!vmCapturedVars || Array.isArray(vmCapturedVars)) vmCapturedVars = {};
                                vmCapturedVars[varName] = sharedBox;
                                if (!vmSharedCaptured || Array.isArray(vmSharedCaptured)) vmSharedCaptured = {};
                                vmSharedCaptured[varName] = sharedBox;
                                captured[varName] = sharedBox;
                            }
                        }
                    }
                }
                if (vmCapturedVars) {
                    for (const varName in vmCapturedVars) {
                        if (!(varName in captured)) {
                            const cv = vmCapturedVars[varName];
                            if (cv && typeof cv === 'object' && Object.prototype.hasOwnProperty.call(cv, 'value')) {
                                captured[varName] = cv;
                            } else {
                                if (!vmSharedCaptured || Array.isArray(vmSharedCaptured)) vmSharedCaptured = {};
                                let box = vmSharedCaptured[varName];
                                if (!box || typeof box !== 'object' || !Object.prototype.hasOwnProperty.call(box, 'value')) {
                                    box = { value: cv };
                                    vmSharedCaptured[varName] = box;
                                }
                                vmCapturedVars[varName] = box;
                                captured[varName] = box;
                            }
                        }
                    }
                }
                const selfCaptureIdx = Array.isArray(f.capturedVars) && f.name ? f.capturedVars.indexOf(f.name) : -1;
                if (Array.isArray(f.capturedLocals) && f.capturedLocals.length > 0) {
                    const fnLocalScope = f.localScope && typeof f.localScope === 'object' ? f.localScope : null;
                    for (let i = 0; i < f.capturedLocals.length; i++) {
                        const localName = f.capturedLocals[i];
                        const localIdx = fnLocalScope && Object.prototype.hasOwnProperty.call(fnLocalScope, localName)
                            ? fnLocalScope[localName]
                            : undefined;
                        const localVal = typeof localIdx === 'number' ? stack[fp + localIdx] : null;
                        captured[localName] = { value: localVal };
                    }
                }
                if (selfCaptureIdx >= 0 && !captured[f.name]) {
                    captured[f.name] = { value: null };
                }
                const closure = { _type: 'closure', start: f.start, end: f.end, _ctx: [code, consts, vars], _localScopeArr: f._lsa?.slice(), _localCount: f._localCount, _lsa: f._lsa?.slice(), _lc: f._localCount, _start: f.start, capturedVars: captured, sharedCaptured: vmSharedCaptured, _funcRef: f, _isLeaf: f._isLeaf, _cvArr: f.capturedVars ? f.capturedVars.map(vn => captured[vn] || null) : null, _fr: f._funcRef || f };
                if (selfCaptureIdx >= 0) {
                    captured[f.name].value = closure;
                    if (closure._cvArr && selfCaptureIdx < closure._cvArr.length) {
                        closure._cvArr[selfCaptureIdx] = captured[f.name];
                    }
                }
                if (jitEnabled && f.name && this.funcASTs[f.name]) { jit.registerFunction(f.name, this.funcASTs[f.name], null); }
                if (nextOp === 105) { ip++; globalVals[code[ip++]] = closure; stack[sp++] = closure; }
                else if (nextOp === 104) { ip++; globalVals[code[ip++]] = closure; stack[sp++] = closure; }
                else { stack[sp++] = closure; }
                break;
            }
            case 70: { const pv = stack[--sp]; const ps = pv === null ? 'null' : pv === undefined ? 'null' : String(pv); if (!this.output) { this.output = []; } this.output.push(ps); break; }
            case 101: {
                const gi = code[ip++]; const ci = code[ip++];
                const fn = globalVals[gi];
                const argVal = consts[ci];
                if (_canUseFastFib(fn, argVal)) { stack[sp++] = _fastFibNonNegInt(argVal); break; }
                if (jitEnabled && fn?._funcRef?.name) jit.recordCall(fn._funcRef.name);
                const nextOp = code[ip];
                if (fn && fn._inlineOp !== undefined) {
                    const cv = fn._capturedVal;
                    const argVal = consts[ci];
                    let result;
                    if (fn._inlineOp === 100) result = cv + argVal;
                    else if (fn._inlineOp === 107) result = cv - argVal;
                    else if (fn._inlineOp === 108) result = cv * argVal;
                    else { if (argVal === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } result = cv / argVal; }
                    if (nextOp === 105) { ip++; globalVals[code[ip++]] = result; }
                    else { stack[sp++] = result; }
                    break;
                }
                if (fn && fn._isLeaf) {
                    const fnCode = fn._ctx[0];
                    const startOp = fnCode[fn.start];
                    const argVal = consts[ci];
                    if (startOp === 121 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 0) { stack[sp++] = argVal + argVal; break; }
                    if (fn._cvArr && fn._cvArr.length === 1 && fn._cvArr[0]) {
                        let leafResult;
                        if (startOp === 100) leafResult = fn._cvArr[0].value + argVal;
                        else if (startOp === 107) leafResult = fn._cvArr[0].value - argVal;
                        else if (startOp === 108) leafResult = fn._cvArr[0].value * argVal;
                        else if (startOp === 109) { if (argVal === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } leafResult = fn._cvArr[0].value / argVal; }
                        if (leafResult !== undefined) {
                            if (nextOp === 105) { ip++; globalVals[code[ip++]] = leafResult; }
                            else { stack[sp++] = leafResult; }
                            break;
                        }
                    }
                }
                if (fn && fn._returnsInlineClosure && !vmCapturedVars) {
                    const innerInlineOp = fn._innerInlineOp;
                    if (innerInlineOp !== undefined) {
                        const capturedVal = consts[ci];
                        let innerClosure = fn._cachedInlineClosure;
                        if (!innerClosure || innerClosure._capturedVal !== capturedVal) {
                            innerClosure = { _type: 'closure', _capturedVal: capturedVal, _inlineOp: innerInlineOp };
                            fn._cachedInlineClosure = innerClosure;
                        }
                        if (code[ip] === 105) {
                            ip++;
                            globalVals[code[ip++]] = innerClosure;
                        } else {
                            stack[sp++] = innerClosure;
                        }
                        break;
                    }
                }
                    if (fn && fn._type === 'closure' && fn._noCapture && !vmCapturedVars && !vmSharedCaptured) {
                    const fnCtx101 = fn._ctx;
                    const fnVars101 = fnCtx101 ? fnCtx101[2] : vars;
                    if (fnVars101 && fnVars101 !== vars) {
                        const fnIdx101 = sp;
                        const argVal101 = consts[ci];
                        stack[fnIdx101] = argVal101;
                        sp = fnIdx101 + 1;
                        const fnLocalCount101 = fn._localCount || 0;
                        if (fnLocalCount101 > 1) { for (let li = fnIdx101 + 1; li < fnIdx101 + fnLocalCount101; li++) stack[li] = undefined; sp = fnIdx101 + fnLocalCount101; }
                        if (frameTop >= MAX_FRAME_DEPTH) { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: 'stack overflow', output: this.output }; }
                        const ft101 = frameTop++;
                        fr.ips[ft101] = ip; fr.fps[ft101] = fp; fr.sps[ft101] = fnIdx101; fr.locals[ft101] = vmLocals; frSimple[ft101] = 0;
                        fr.cvArrs[ft101] = null; fr.closures[ft101] = vmCurrentClosure; fr.capturedVars[ft101] = null; fr.sharedCaptured[ft101] = null;
                        fr.codes[ft101] = code; fr.consts[ft101] = consts; fr.vars[ft101] = vars; fr.globalValsArrs[ft101] = globalVals;
                        const fnCode101 = fnCtx101[0];
                        const fnConsts101 = fnCtx101[1];
                        this.code = fnCode101; this.consts = fnConsts101 || consts; code = fnCode101; consts = fnConsts101 || consts;
                        const fnVarsLen101 = fnVars101.length;
                        globalVals = new Array(fnVarsLen101); this._globalVals = globalVals;
                        const globals101 = this.globals; const builtins101 = this.builtins;
                        for (let i101 = 0; i101 < fnVarsLen101; i101++) { const name101 = fnVars101[i101]; const v101 = Object.prototype.hasOwnProperty.call(globals101, name101) ? globals101[name101] : undefined; globalVals[i101] = v101 !== undefined ? (Array.isArray(v101) ? hardenArrayObject(v101) : v101) : (builtins101[name101] !== undefined ? builtins101[name101] : null); }
                        vars = fnVars101;
                        fp = fnIdx101;
                        vmLocals = fn._localScopeArr;
                        vmCapturedVars = null; vmCvArr = null; vmSharedCaptured = null; vmCurrentClosure = fn;
                        ip = fn._start !== undefined ? fn._start : fn.start;
                        break;
                    }
                    if (fn._isSelfRecursive && !this._executionGuardEnabled) {
                        if (fn._nativeFn === undefined) {
                            const src = this._compileSelfRecursive(fn);
                            if (src) {
                                try {
                                    const maker = this._safeNewFunction([], 'return function __self__(a0){' + src + '}');
                                    if (!maker) { fn._nativeFn = null; break; }
                                    fn._nativeFn = maker();
                                } catch(e) { fn._nativeFn = null; }
                            } else { fn._nativeFn = null; }
                        }
                        if (fn._nativeFn && !(fn._returnsObjectLiteral || fn._funcRef?._returnsObjectLiteral)) {
                            const argVal = consts[ci];
                            const r = fn._nativeFn(argVal);
                            if (nextOp === 105) { ip++; globalVals[code[ip++]] = r; }
                            else { stack[sp++] = r; }
                            break;
                        }
                    }
                    if (!this._executionGuardEnabled && fn._nativeFn === undefined && !fn._isSelfRecursive) {
                        const src = this._compileLeafFunction(fn);
                        if (src) {
                            try {
                                if (fn._usedNativeFns && fn._usedNativeFns.length > 0) {
                                    const maker = this._safeNewFunction([...fn._usedNativeFns.map((_, i) => `_n${i}`)], 'return function(a0){' + src + '}');
                                    fn._nativeFn = maker ? maker(...fn._usedNativeFns) : null;
                                } else {
                                    const maker = this._safeNewFunction([], 'return function(a0){' + src + '}');
                                    fn._nativeFn = maker ? maker() : null;
                                }
                            } catch(e) { fn._nativeFn = null; }
                        } else { fn._nativeFn = null; }
                    }
                    if (fn._nativeFn && !(fn._returnsObjectLiteral || fn._funcRef?._returnsObjectLiteral)) {
                        const argVal = consts[ci];
                        const r = fn._nativeFn(argVal);
                        if (nextOp === 105) { ip++; globalVals[code[ip++]] = r; }
                        else { stack[sp++] = r; }
                        break;
                    }
                    const argVal = consts[ci];
                    const savedFp = fp;
                    const savedSp = sp;
                    const savedLocals = vmLocals;
                    stack[sp] = argVal;
                    fp = sp;
                    sp = fn._localCount > 1 ? fp + fn._localCount : fp + 1;
                    const ft = frameTop;
                    const base = ft * 5;
                    sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = vmCurrentClosure;
                    frSimple[ft] = 1;
                    if (ft + 1 >= MAX_FRAME_DEPTH) { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: 'stack overflow', output: this.output }; }
                    frameTop = ft + 1;
                    vmLocals = fn._localScopeArr;
                    vmCapturedVars = prepareCallCapturedVars(fn);
                    vmCvArr = resolveCallCvArr(fn, vmCapturedVars, vmCvArrResolveCache);
                    vmSharedCaptured = resolveCallSharedCaptured(fn, vmCapturedVars);
                    vmCurrentClosure = fn;
                    if (this.jit?.enabled && fn._funcRef?.name) this.jit.recordCall(fn._funcRef.name);
                    ip = fn._start !== undefined ? fn._start : fn.start;
                    break;
                }
                this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                this._suppressConsoleLog = false;
                return this.runFull(bc);
            }
            case 125: {
                const gi = code[ip++]; const ci1 = code[ip++]; const ci2 = code[ip++];
                const fn = globalVals[gi];
                if (jitEnabled && fn?._funcRef?.name) jit.recordCall(fn._funcRef.name);
                if (fn && !this._executionGuardEnabled && fn._nativeFn && !(fn._returnsObjectLiteral || fn._funcRef?._returnsObjectLiteral)) { stack[sp++] = fn._nativeFn(consts[ci1], consts[ci2]); break; }
                if (fn && fn._isLeaf) {
                    const fnCode = fn._ctx[0];
                    const startOp = fnCode[fn.start];
                    const a0 = consts[ci1]; const a1 = consts[ci2];
                    if (startOp === 121 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { code[ip - 4] = 138; stack[sp++] = a0 + a1; break; }
                    if (startOp === 122 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { code[ip - 4] = 139; stack[sp++] = a0 - a1; break; }
                    if (startOp === 123 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { code[ip - 4] = 140; stack[sp++] = a0 * a1; break; }
                    if (startOp === 124 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { if (a1 === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } code[ip - 4] = 141; stack[sp++] = a0 / a1; break; }
                }
                this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                this._suppressConsoleLog = false;
                return this.runFull(bc);
            }
            case 138: { ip++; const ci1 = code[ip++]; const ci2 = code[ip++]; stack[sp++] = consts[ci1] + consts[ci2]; break; }
            case 139: { ip++; const ci1 = code[ip++]; const ci2 = code[ip++]; stack[sp++] = consts[ci1] - consts[ci2]; break; }
            case 140: { ip++; const ci1 = code[ip++]; const ci2 = code[ip++]; stack[sp++] = consts[ci1] * consts[ci2]; break; }
            case 141: { ip++; const ci1 = code[ip++]; const ci2 = code[ip++]; const dv = consts[ci2]; if (dv === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } stack[sp++] = consts[ci1] / dv; break; }
            case 142: {
                const li = code[ip++]; const ci = code[ip++];
                const fn = vmCurrentClosure;
                const argVal = stack[fp + li] - consts[ci];
                const savedFp = fp;
                const savedSp = sp;
                const savedLocals = vmLocals;
                stack[sp] = argVal;
                fp = sp;
                sp = fn._lc > 1 ? fp + fn._lc : fp + 1;
                const ft = frameTop;
                const base = ft * 5;
                sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = fn;
                frSimple[ft] = 1;
                if (ft + 1 >= MAX_FRAME_DEPTH) { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: 'stack overflow', output: this.output }; }
                frameTop = ft + 1;
                vmLocals = fn._lsa;
                vmCapturedVars = null;
                vmCvArr = null;
                vmSharedCaptured = null;
                ip = fn._start;
                break;
            }
            case 106: {
                const gi = code[ip++]; const ci1 = code[ip++]; const ci2 = code[ip++];
                const fn = globalVals[gi];
                if (jitEnabled && fn?._funcRef?.name) jit.recordCall(fn._funcRef.name);
                if (fn && fn._isLeaf) {
                    const fnCode = fn._ctx[0];
                    const startOp = fnCode[fn.start];
                    const a0 = consts[ci1]; const a1 = consts[ci2];
                    if (startOp === 121 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { code[ip - 4] = 138; stack[sp++] = a0 + a1; break; }
                    if (startOp === 122 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { code[ip - 4] = 139; stack[sp++] = a0 - a1; break; }
                    if (startOp === 123 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { code[ip - 4] = 140; stack[sp++] = a0 * a1; break; }
                    if (startOp === 124 && fnCode[fn.start + 1] === 0 && fnCode[fn.start + 2] === 1) { if (a1 === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } code[ip - 4] = 141; stack[sp++] = a0 / a1; break; }
                }
                if (fn && !this._executionGuardEnabled && fn._nativeFn && !(fn._returnsObjectLiteral || fn._funcRef?._returnsObjectLiteral)) { stack[sp++] = fn._nativeFn(consts[ci1], consts[ci2]); break; }
                if (fn && fn._noCapture && fn._nativeFn === undefined) {
                    const src = this._compileLeafFunction(fn);
                    if (src) {
                        try {
                            if (fn._usedNativeFns && fn._usedNativeFns.length > 0) {
                                const maker = this._safeNewFunction([...fn._usedNativeFns.map((_, i) => `_n${i}`)], 'return function(a0,a1){' + src + '}');
                                fn._nativeFn = maker ? maker(...fn._usedNativeFns) : null;
                            } else {
                                const maker = this._safeNewFunction([], 'return function(a0,a1){' + src + '}');
                                fn._nativeFn = maker ? maker() : null;
                            }
                            if (fn._nativeFn && !(fn._returnsObjectLiteral || fn._funcRef?._returnsObjectLiteral)) {
                                stack[sp++] = fn._nativeFn(consts[ci1], consts[ci2]);
                                break;
                            }
                        } catch(e) { fn._nativeFn = null; }
                    } else { fn._nativeFn = null; }
                }
                if (fn && fn._noCapture && fn._type === 'closure' && !vmCapturedVars && !vmSharedCaptured) {
                    const a0 = consts[ci1]; const a1 = consts[ci2];
                    const savedFp = fp;
                    const savedSp = sp;
                    const savedLocals = vmLocals;
                    stack[sp] = a0; stack[sp + 1] = a1;
                    fp = sp;
                    sp = fn._localCount > 2 ? fp + fn._localCount : fp + 2;
                    const ft = frameTop;
                    const base = ft * 5;
                    sf[base] = ip; sf[base + 1] = savedFp; sf[base + 2] = savedSp; sf[base + 3] = savedLocals; sf[base + 4] = vmCurrentClosure;
                    frSimple[ft] = 1;
                    if (ft + 1 >= MAX_FRAME_DEPTH) { this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop; this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured; return { success: false, error: 'stack overflow', output: this.output }; }
                    frameTop = ft + 1;
                    vmLocals = fn._localScopeArr;
                    vmCapturedVars = null;
                    vmCvArr = null;
                    vmSharedCaptured = resolveCallSharedCaptured(fn, vmCapturedVars);
                    vmCurrentClosure = fn;
                    const fnCtx = fn._ctx;
                    const fnVars = fnCtx ? fnCtx[2] : null;
                    if (fnVars && fnVars !== vars) {
                        const fnVarsLen = fnVars.length;
                        if (!globalVals || globalVals.length < fnVarsLen) {
                            globalVals = new Array(fnVarsLen);
                            this._globalVals = globalVals;
                        }
                        const globals = this.globals;
                        const builtins = this.builtins;
                        for (let i = 0; i < fnVarsLen; i++) {
                            const name = fnVars[i];
                            const v = Object.prototype.hasOwnProperty.call(globals, name) ? globals[name] : undefined;
                            if (v !== undefined) {
                                globalVals[i] = hardenArrayObject(v);
                            } else {
                                const bv = builtins[name];
                                globalVals[i] = bv !== undefined ? bv : null;
                            }
                        }
                        vars = fnVars;
                    }
                    if (fnCtx && fnCtx[0] !== code) {
                        code = fnCtx[0];
                        consts = fnCtx[1] || consts;
                    }
                    ip = fn._start !== undefined ? fn._start : fn.start;
                    break;
                }
                this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                this._suppressConsoleLog = false;
                return this.runFull(bc);
            }
            case 87: {
                const n = code[ip++];
                const args = [];
                for (let i = 0; i < n; i++) args.unshift(stack[--sp]);
                const instance = stack[0];
                if (instance && instance._type === 'instance') {
                    const currentClassObj = globalVals[globalNameIdx.get(this.currentClass)];
                    if (currentClassObj && currentClassObj._type === 'class' && currentClassObj.superClass) {
                        const superClassObj = globalVals[globalNameIdx.get(currentClassObj.superClass)];
                        if (superClassObj && superClassObj._type === 'class') {
                            const superCtor = superClassObj.methods.init || superClassObj.methods['__init__'] || superClassObj.methods.constructor;
                            if (superCtor && superCtor.code) {
                                const savedCode3 = this.code; const savedConsts3 = this.consts; const savedVars3 = this.vars; const savedIp3 = ip;
                                const savedStack3 = this.stack; const savedSp3 = sp; const savedFp3 = fp;
                                const savedLocals3 = this.locals; const savedCaptured3 = this.capturedVars; const savedShared3 = this.sharedCaptured;
                                const savedCurrentClass3 = this.currentClass;
                                this.currentClass = currentClassObj.superClass;
                                this.code = superCtor.code;
                                this.consts = superCtor.consts;
                                this.vars = superCtor.vars || [];
                                this.ip = 0;
                                this.stack = [instance];
                                this._fp = 0;
                                this.locals = [superCtor.localScope || {}];
                                this.capturedVars = null;
                                this.sharedCaptured = null;
                                const initParams = superCtor.params || [];
                                for (let i = 0; i < initParams.length; i++) this.stack.push(args[i]);
                                while (true) {
                                    const subOp = this.code[this.ip++];
                                    if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                                    if (subOp === 64 || subOp === 143) break;
                                    if (subOp === 91) { this.ip++; break; }
                                    if (subOp === 121 || subOp === 122 || subOp === 123 || subOp === 124) { this.ip += 2; break; }
                                    if (subOp === 100 || subOp === 107 || subOp === 108 || subOp === 109) { this.ip += 2; break; }
                                    this._executeOpInline(subOp);
                                }
                                this.stack = savedStack3;
                                this._fp = savedFp3;
                                this.code = savedCode3;
                                this.consts = savedConsts3;
                                this.vars = savedVars3;
                                this.currentClass = savedCurrentClass3;
                                this.locals = savedLocals3;
                                this.capturedVars = savedCaptured3;
                                this.sharedCaptured = savedShared3;
                                stack = this.stack;
                                sp = savedSp3;
                                vmLocals = this.locals; vmCapturedVars = this.capturedVars; vmSharedCaptured = this.sharedCaptured;
                            }
                        }
                    }
                }
                stack[sp++] = instance;
                break;
            }
            case 88: { const ci = code[ip++]; const li = code[ip++]; stack[fp + li] = consts[ci]; break; }
            case 89: { const i1 = code[ip++]; const i2 = code[ip++]; stack[sp++] = safeAddValues(stack[fp + i1], stack[fp + i2]); break; }
            case 91: {
                const idx = code[ip++];
                const v = stack[fp + idx];
                syncClosureSelfObject(vmCurrentClosure, v);
                if (frameTop > 0) {
                    const ft = --frameTop;
                    if (ft === 0) this._lastFrame0Pop = `RETURN_LOCAL(savedCodeLen=${fr.codes[ft] ? fr.codes[ft].length : -1},savedIp=${fr.ips[ft] ?? -1},savedSimple=${frSimple[ft]})`;
                    const fst = frSimple[ft];
                    if (fst === 2) {
                        const base3 = ft * 3;
                        ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                    } else if (fst === 1) {
                        ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2];
                        vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4];
                        vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null;
                    } else {
                        ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                        vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft];
                        const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv;
                        vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null;
                        const savedCode = fr.codes[ft];
                        if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; }
                    }
                    stack[sp++] = v;
                } else {
                    stack[sp++] = v;
                }
                break;
            }
            case 92: { const li = code[ip++]; stack[fp + li] = stack[fp + li] + 1; break; }
            case 93: { const si = code[ip++]; const ai = code[ip++]; stack[fp + si] = safeAddValues(stack[fp + si], stack[fp + ai]); break; }
            case 94: { const li = code[ip++]; const ci = code[ip++]; stack[sp++] = stack[fp + li] < consts[ci]; break; }
            case 95: {
                const li = code[ip++]; const ci = code[ip++]; const offset = code[ip++];
                if (!(stack[fp + li] < consts[ci])) { ip += offset; break; }
                if (!this._localLoopJitCache) this._localLoopJitCache = {};
                const cacheKey = ip - 4;
                let loopFn = this._localLoopJitCache[cacheKey];
                if (loopFn === undefined) {
                    const compiled = this._compileLocalLoop(code, consts, ip, li, ci);
                    if (compiled) {
                        try {
                            const ul = compiled.usedLocals;
                            let fullSrc = '';
                            for (const idx of ul) fullSrc += `var l${idx}=s[fp+${idx}];`;
                            fullSrc += `var __bc=1024;while(l${li}<${consts[ci]}){${_BUDGET_CHECK}${compiled.bodySrc}}`;
                            for (const idx of ul) fullSrc += `s[fp+${idx}]=l${idx};`;
                            loopFn = this._safeNewFunction(['s', 'fp', '__b'], fullSrc);
                        } catch(e) { loopFn = null; }
                    } else { loopFn = null; }
                    this._localLoopJitCache[cacheKey] = loopFn;
                }
                if (loopFn) {
                    try {
                        loopFn(stack, fp, execBudget);
                    } catch(e) {
                        if (e.message === '__SEED_BUDGET_INSN__') {
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: `Execution limit exceeded (${this._maxInstructions} instructions)`, output: this.output };
                        }
                        if (e.message === '__SEED_BUDGET_TIME__') {
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: `Execution timeout (${this._maxExecutionMs}ms)`, output: this.output };
                        }
                        throw e;
                    }
                    ip += offset;
                    break;
                }
                break;
            }
            case 96: {
                const gi = code[ip++]; const ci = code[ip++]; const offset = code[ip++];
                if (!(globalVals[gi] < consts[ci])) { ip += offset; break; }
                if (fp === 0) {
                if (!this._loopJitCache) this._loopJitCache = {};
                const cacheKey = ip - 4;
                let loopFn = this._loopJitCache[cacheKey];
                if (loopFn === undefined) {
                    const compiled = this._compileGlobalLoop(code, consts, ip, gi, ci);
                    if (compiled) {
                        try {
                            const ug = compiled.usedGlobals;
                            const ua = compiled.usedArrays;
                            const initVals = {};
                            let scanIp = 0;
                            while (scanIp < cacheKey) {
                                if (code[scanIp] === 102) {
                                    const sgi = code[scanIp + 1];
                                    const sci = code[scanIp + 2];
                                    initVals[sgi] = consts[sci];
                                    scanIp += 3;
                                } else if (code[scanIp] === 60) {
                                    scanIp += 2;
                                } else if (code[scanIp] >= 158 && code[scanIp] <= 161) {
                                    scanIp += 2;
                                } else if (code[scanIp] === 155 || code[scanIp] === 156 || code[scanIp] === 157) {
                                    scanIp += 3;
                                } else if (code[scanIp] === 72) {
                                    scanIp += 3;
                                } else {
                                    scanIp++;
                                }
                            }
                            let fullSrc = '';
                            for (const idx of ug) {
                                const iv = initVals[idx];
                                if (iv !== undefined) {
                                    if (typeof iv === 'string') fullSrc += `var v${idx}="${iv}";`;
                                    else fullSrc += `var v${idx}=${iv};`;
                                } else {
                                    fullSrc += `var v${idx}=g[${idx}];`;
                                }
                            }
                            if (ua.length > 0) {
                                fullSrc += `var _n=${consts[ci]};`;
                                for (const a of ua) fullSrc += `if(!Array.isArray(${a}))${a}=new Array(_n);else if(${a}.length<_n)${a}.length=_n;`;
                            }
                            fullSrc += 'var __bc=1024;';
                            const loopInc = compiled.loopInc || 1;
                            const loopLimit = consts[ci];
                            const loopVarName = `v${gi}`;
                            let loopSrc = _BUDGET_CHECK + compiled.bodySrc;
                            if (!compiled.isWhileLoop) {
                                const loopVarIncRe = new RegExp('\\b' + loopVarName + '\\+\\+;', 'g');
                                const loopVarAddIncRe = new RegExp('\\b' + loopVarName + '\\+=' + loopInc + ';', 'g');
                                loopSrc = loopSrc.replace(loopVarIncRe, '');
                                loopSrc = loopSrc.replace(loopVarAddIncRe, '');
                            }
                            const indexAssignMatch = /^\s*((?:v\d+))\[(v\d+)\]=\2;\s*$/.exec(loopSrc);
                            if (!compiled.isWhileLoop && loopInc === 1 && typeof loopLimit === 'number' &&
                                indexAssignMatch && indexAssignMatch[2] === loopVarName) {
                                const arrVar = indexAssignMatch[1];
                                fullSrc += `if(!Array.isArray(${arrVar}))${arrVar}=[];else if(${arrVar}.length<${loopLimit})${arrVar}.length=${loopLimit};`;
                                fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=1){${arrVar}[${loopVarName}]=${loopVarName};}`;
                            } else
                            
                            if (loopInc === 1 && typeof loopLimit === 'number' && loopLimit >= 8 && !loopSrc.includes('for(') && !loopSrc.includes('if(')) {
                                const loopVarWordRe = new RegExp('\\b' + loopVarName + '\\b');
                                const loopVarWordReGlobal = new RegExp('\\b' + loopVarName + '\\b', 'g');
                                const bodyRefsLoopVar = loopVarWordRe.test(loopSrc);
                                if (compiled.isWhileLoop) {
                                    fullSrc += `while(${loopVarName}<${loopLimit}){${loopSrc}}`;
                                } else if (!bodyRefsLoopVar) {
                                    let factor = 4;
                                    if (loopLimit % 4 !== 0) factor = 2;
                                    if (loopLimit % 2 !== 0) factor = 1;
                                    if (factor > 1) {
                                        const isPushBody = loopSrc.includes('.push(');
                                        let unrolledBody;
                                        if (isPushBody) {
                                            const pushMatch = loopSrc.match(/(\w+)\.push\(([^)]+)\)/);
                                            if (pushMatch) {
                                                const arrName = pushMatch[1];
                                                const pushVal = pushMatch[2];
                                                let idxParts = [];
                                                for (let fi = 0; fi < factor; fi++) {
                                                    const idxVar = fi === 0 ? loopVarName : (fi === 1 ? loopVarName+'x' : loopVarName + 'x'.repeat(fi));
                                                    idxParts.push(`${arrName}[${idxVar}]=${fi === 0 ? pushVal : pushVal.replace(loopVarWordReGlobal, idxVar)}`);
                                                }
                                                let prefix = '';
                                                for (let fi = 1; fi < factor; fi++) {
                                                    const idxVar = fi === 1 ? loopVarName+'x' : loopVarName + 'x'.repeat(fi);
                                                    prefix += `var ${idxVar}=${loopVarName}+${fi};`;
                                                }
                                                unrolledBody = prefix + idxParts.join(';') + ';';
                                            } else {
                                                unrolledBody = loopSrc.repeat(factor);
                                            }
                                        } else {
                                            unrolledBody = loopSrc.repeat(factor);
                                        }
                                        const newLimit = loopLimit - (loopLimit % factor);
                                        fullSrc += `for(;${loopVarName}<${newLimit};${loopVarName}+=${factor}){${unrolledBody}}`;
                                        if (newLimit < loopLimit) {
                                            fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=1){${loopSrc}}`;
                                        }
                                    } else {
                                        fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=${loopInc}){${loopSrc}}`;
                                    }
                                } else if (loopLimit >= 4 && loopLimit % 2 === 0) {
                                    const tmpVar = loopVarName + 'x';
                                    const body2 = loopSrc.replace(loopVarWordReGlobal, tmpVar);
                                    if (loopLimit % 4 === 0 && loopLimit >= 8) {
                                        const tmpVar2 = loopVarName + 'xx';
                                        const tmpVar3 = loopVarName + 'xxx';
                                        const body3 = loopSrc.replace(loopVarWordReGlobal, tmpVar2);
                                        const body4 = loopSrc.replace(loopVarWordReGlobal, tmpVar3);
                                        fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=4){${loopSrc}var ${tmpVar}=${loopVarName}+1;${body2}var ${tmpVar2}=${loopVarName}+2;${body3}var ${tmpVar3}=${loopVarName}+3;${body4}}`;
                                    } else {
                                        fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=2){${loopSrc}var ${tmpVar}=${loopVarName}+1;${body2}}`;
                                    }
                                } else {
                                    fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=${loopInc}){${loopSrc}}`;
                                }
                            } else {
                                if (compiled.isWhileLoop) {
                                    fullSrc += `while(v${gi}<${consts[ci]}){${loopSrc}}`;
                                } else {
                                    fullSrc += `for(;v${gi}<${consts[ci]};v${gi}+=${compiled.loopInc || 1}){${loopSrc}}`;
                                }
                            }
                            for (const idx of ug) {
                                if (idx !== gi) fullSrc += `g[${idx}]=v${idx};`;
                            }
                            fullSrc += `g[${gi}]=v${gi};`;
                            fullSrc = this._optimizeJitVSrc(fullSrc, 2);
                            
                            loopFn = this._safeNewFunction('g', '__b', fullSrc);
                        } catch(e) { loopFn = null; }
                    } else { loopFn = null; }
                    this._loopJitCache[cacheKey] = loopFn;
                }
                if (loopFn) {
                    _hydrateBuiltinGlobals(globalVals, vars, this.builtins);
                    try {
                        loopFn(globalVals, execBudget);
                    } catch(e) {
                        if (e.message === '__SEED_BUDGET_INSN__') {
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: `Execution limit exceeded (${this._maxInstructions} instructions)`, output: this.output };
                        }
                        if (e.message === '__SEED_BUDGET_TIME__') {
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: `Execution timeout (${this._maxExecutionMs}ms)`, output: this.output };
                        }
                        this._loopJitCache[cacheKey] = null;
                        loopFn = null;
                    }
                    if (!loopFn) break;
                    ip += offset;
                    break;
                }
                }
                break;
            }
            case 97: { const gi = code[ip++]; const ci = code[ip++]; globalVals[gi] += consts[ci]; break; }
            case 98: { const ti = code[ip++]; const si = code[ip++]; globalVals[ti] += globalVals[si]; break; }
            case 100: {
                const cvIdx = code[ip++]; const lcIdx = code[ip++];
                const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                const capturedName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length ? capturedNames[cvIdx] : vars[cvIdx];
                const cv = vmCvArr && cvIdx < vmCvArr.length ? vmCvArr[cvIdx].value : (vmCapturedVars ? (vmCapturedVars[capturedName]?.value ?? vmCapturedVars[capturedName]) : null);
                const v = cv + stack[fp + lcIdx];
                if (frameTop > 0) {
                    const ft = --frameTop;
                    if (ft === 0) this._lastFrame0Pop = `RETURN_SIMPLE(savedCodeLen=${fr.codes[ft] ? fr.codes[ft].length : -1},savedIp=${fr.ips[ft] ?? -1},savedSimple=${frSimple[ft]})`;
                    const fst = frSimple[ft];
                    if (fst === 2) {
                        const base3 = ft * 3;
                        ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2];
                    } else if (fst === 1) {
                        ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2];
                        vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4];
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
            case 107: {
                const cvIdx = code[ip++]; const lcIdx = code[ip++];
                const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                const capturedName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length ? capturedNames[cvIdx] : vars[cvIdx];
                const cv = vmCvArr && cvIdx < vmCvArr.length ? vmCvArr[cvIdx].value : (vmCapturedVars ? (vmCapturedVars[capturedName]?.value ?? vmCapturedVars[capturedName]) : null);
                const v = cv - stack[fp + lcIdx];
                if (frameTop > 0) { const ft = --frameTop; const fst = frSimple[ft]; if (fst === 2) { const base3 = ft * 3; ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2]; } else if (fst === 1) { ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2]; vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4]; vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null; } else { ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft]; vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft]; const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv; vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null; const savedCode = fr.codes[ft]; if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; } } }
                stack[sp++] = v;
                break;
            }
            case 108: {
                const cvIdx = code[ip++]; const lcIdx = code[ip++];
                const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                const capturedName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length ? capturedNames[cvIdx] : vars[cvIdx];
                const cv = vmCvArr && cvIdx < vmCvArr.length ? vmCvArr[cvIdx].value : (vmCapturedVars ? (vmCapturedVars[capturedName]?.value ?? vmCapturedVars[capturedName]) : null);
                const v = cv * stack[fp + lcIdx];
                if (frameTop > 0) { const ft = --frameTop; const fst = frSimple[ft]; if (fst === 2) { const base3 = ft * 3; ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2]; } else if (fst === 1) { ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2]; vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4]; vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null; } else { ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft]; vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft]; const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv; vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null; const savedCode = fr.codes[ft]; if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; } } }
                stack[sp++] = v;
                break;
            }
            case 109: {
                const cvIdx = code[ip++]; const lcIdx = code[ip++];
                const capturedNames = vmCurrentClosure?._funcRef?.capturedVars;
                const capturedName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length ? capturedNames[cvIdx] : vars[cvIdx];
                const cv = vmCvArr && cvIdx < vmCvArr.length ? vmCvArr[cvIdx].value : (vmCapturedVars ? (vmCapturedVars[capturedName]?.value ?? vmCapturedVars[capturedName]) : null);
                const divisor = stack[fp + lcIdx];
                if (divisor === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; }
                const v = cv / divisor;
                if (frameTop > 0) { const ft = --frameTop; const fst = frSimple[ft]; if (fst === 2) { const base3 = ft * 3; ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2]; } else if (fst === 1) { ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2]; vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4]; vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null; } else { ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft]; vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft]; const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv; vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null; const savedCode = fr.codes[ft]; if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; } } }
                stack[sp++] = v;
                break;
            }
            case 102: { const gi = code[ip++]; const ci = code[ip++]; globalVals[gi] = consts[ci]; break; }
            case 103: { const gi = code[ip++]; const ci = code[ip++]; globalVals[gi] = consts[ci]; stack[sp++] = consts[ci]; break; }
            case 104: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; const av = globalVals[ai]; const bv = globalVals[bi]; if (typeof av === 'number' && typeof bv === 'number') { globalVals[ti] = av + bv; code[ip - 4] = 134; } else { globalVals[ti] = Array.isArray(av) && Array.isArray(bv) ? [...av, ...bv] : av + bv; } break; }
            case 134: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; globalVals[ti] = globalVals[ai] + globalVals[bi]; break; }
            case 105: { const vi = code[ip++]; globalVals[vi] = stack[sp - 1]; break; }
            case 110: { const i1 = code[ip++]; const i2 = code[ip++]; stack[sp++] = globalVals[i1]; stack[sp++] = globalVals[i2]; break; }
            case 111: { const gi = code[ip++]; const ci = code[ip++]; stack[sp++] = globalVals[gi] * consts[ci]; break; }
            case 112: { const gi = code[ip++]; const ci = code[ip++]; stack[sp++] = globalVals[gi] + consts[ci]; break; }
            case 113: { const gi = code[ip++]; const ci = code[ip++]; stack[sp++] = globalVals[gi] - consts[ci]; break; }
            case 114: { const ai = code[ip++]; const bi = code[ip++]; const dv = globalVals[bi]; if (dv === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } stack[sp++] = globalVals[ai] / dv; break; }
            case 115: { const ai = code[ip++]; const bi = code[ip++]; stack[sp++] = globalVals[ai] * globalVals[bi]; break; }
            case 116: { const ai = code[ip++]; const bi = code[ip++]; stack[sp++] = safeAddValues(globalVals[ai], globalVals[bi]); break; }
            case 117: { const ai = code[ip++]; const bi = code[ip++]; stack[sp++] = globalVals[ai] - globalVals[bi]; break; }
            case 119: { const idxGi = code[ip++]; const targetGi = code[ip++]; const ci = code[ip++]; const offset = code[ip++]; let idx = globalVals[idxGi]; const limit = consts[ci]; if (idx < limit) { if (idxGi === targetGi) { globalVals[idxGi] = idx + 1; } else { globalVals[targetGi]++; globalVals[idxGi] = idx + 1; } ip -= offset; } break; }
            case 133: { const gi = code[ip++]; const ci = code[ip++]; const offset = code[ip++]; let v = globalVals[gi]; const limit = consts[ci]; if (v < limit) { globalVals[gi] = v + 1; ip -= offset; } break; }
            case 136: {
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
            case 137: { const sumGi = code[ip++]; const idxGi = code[ip++]; const sumStartCi = code[ip++]; const idxStartCi = code[ip++]; const endCi = code[ip++]; let sum = consts[sumStartCi]; let idx = consts[idxStartCi]; const limit = consts[endCi]; while (idx < limit) { sum += idx; idx++; } globalVals[sumGi] = sum; globalVals[idxGi] = idx; break; }
            case 152: { const sumGi = code[ip++]; const outerGi = code[ip++]; const innerGi = code[ip++]; const sumStartCi = code[ip++]; const outerStartCi = code[ip++]; const innerStartCi = code[ip++]; const outerEndCi = code[ip++]; const innerEndCi = code[ip++]; const incCi = code[ip++]; const outerLimit = consts[outerEndCi]; const innerLimit = consts[innerEndCi]; const inc = consts[incCi]; globalVals[sumGi] = consts[sumStartCi] + outerLimit * innerLimit * inc; globalVals[outerGi] = consts[outerStartCi] + outerLimit; globalVals[innerGi] = consts[innerStartCi] + innerLimit; break; }
            case 166: { const sumGi = code[ip++]; const outerGi = code[ip++]; const innerGi = code[ip++]; const outerStartCi = code[ip++]; const innerStartCi = code[ip++]; const outerEndCi = code[ip++]; const innerEndCi = code[ip++]; const os = consts[outerStartCi]; const is = consts[innerStartCi]; const oe = consts[outerEndCi]; const ie = consts[innerEndCi]; const outerN = oe - os; const innerN = ie - is; const outerSum = outerN * (os + (oe - 1)) / 2; const innerSum = innerN * (is + (ie - 1)) / 2; globalVals[sumGi] = (globalVals[sumGi] ?? 0) + outerSum * innerSum; globalVals[outerGi] = oe; globalVals[innerGi] = ie; break; }
            case 167: { const sumGi = code[ip++]; const idxGi = code[ip++]; const startCi = code[ip++]; const endCi = code[ip++]; const s = consts[startCi]; const e = consts[endCi]; const n = e - s; globalVals[sumGi] = (globalVals[sumGi] ?? 0) + (n * (s + (e - 1)) / 2); globalVals[idxGi] = e; break; }
            case 168: { const countGi = code[ip++]; const idxGi = code[ip++]; const endCi = code[ip++]; const end = consts[endCi]; const start = globalVals[idxGi]; const parity = ((start % 2) + 2) % 2; const first = parity === 0 ? start : start + 1; const delta = first >= end ? 0 : Math.floor((end - first + 1) / 2); globalVals[countGi] = (globalVals[countGi] ?? 0) + delta; globalVals[idxGi] = end; break; }
            case 169: { const arrGi = code[ip++]; const idxGi = code[ip++]; const startCi = code[ip++]; const endCi = code[ip++]; const start = consts[startCi]; const end = consts[endCi]; const arr = globalVals[arrGi]; if (Array.isArray(arr)) { if (arr.length < end) arr.length = end; for (let i = start; i < end; i++) arr[i] = i; } else if (arr) { for (let i = start; i < end; i++) arr[i] = i; } globalVals[idxGi] = end; break; }
            case 170: { const gi = code[ip++]; const ci = code[ip++]; const o = globalVals[gi]; const n = consts[ci]; if (o) o.length = n; break; }
            case 171: {
                const arrMode = code[ip++], arrRef = code[ip++], idxMode = code[ip++], idxRef = code[ip++], startCi = code[ip++], endCi = code[ip++];
                const start = consts[startCi], end = consts[endCi];
                const n = end - start;
                const arr = arrMode ? stack[fp + arrRef] : globalVals[arrRef];
                if (Array.isArray(arr)) {
                    arr.length = n > 0 ? n : 0;
                    for (let i = 0; i < n; i++) arr[i] = start + i;
                }
                if (idxMode) stack[fp + idxRef] = end;
                else globalVals[idxRef] = end;
                break;
            }
            case 153: { const sumGi = code[ip++]; const idxGi = code[ip++]; const idxStartCi = code[ip++]; const endCi = code[ip++]; const incCi = code[ip++]; const limit = consts[endCi]; const inc = consts[incCi]; globalVals[sumGi] += limit * inc; globalVals[idxGi] = consts[idxStartCi] + limit; break; }
            case 120: { const idxGi = code[ip++]; const loopGi = code[ip++]; const ci = code[ip++]; const offset = code[ip++]; let idx = globalVals[idxGi]; const limit = consts[ci]; if (idx < limit) { globalVals[loopGi] = idx; globalVals[idxGi] = idx + 1; } else { ip += offset; } break; }
            case 121: { const a = code[ip++], b = code[ip++]; const v = safeAddValues(stack[fp + a], stack[fp + b]); if (frameTop > 0) { const ft = --frameTop; const fst = frSimple[ft]; if (fst === 2) { const base3 = ft * 3; ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2]; } else if (fst === 1) { ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2]; vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4]; vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null; } else { ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft]; vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft]; const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv; vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null; const savedCode = fr.codes[ft]; if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; } } } else { ip++; } stack[sp++] = v; break; }
            case 122: { const a = code[ip++], b = code[ip++]; const v = stack[fp + a] - stack[fp + b]; if (frameTop > 0) { const ft = --frameTop; const fst = frSimple[ft]; if (fst === 2) { const base3 = ft * 3; ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2]; } else if (fst === 1) { ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2]; vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4]; vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null; } else { ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft]; vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft]; const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv; vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null; const savedCode = fr.codes[ft]; if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; } } } else { ip++; } stack[sp++] = v; break; }
            case 123: { const a = code[ip++], b = code[ip++]; const v = stack[fp + a] * stack[fp + b]; if (frameTop > 0) { const ft = --frameTop; const fst = frSimple[ft]; if (fst === 2) { const base3 = ft * 3; ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2]; } else if (fst === 1) { ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2]; vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4]; vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null; } else { ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft]; vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft]; const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv; vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null; const savedCode = fr.codes[ft]; if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; } } } else { ip++; } stack[sp++] = v; break; }
            case 124: { const a = code[ip++], b = code[ip++]; const dv = stack[fp + b]; if (dv === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } const v = stack[fp + a] / dv; if (frameTop > 0) { const ft = --frameTop; const fst = frSimple[ft]; if (fst === 2) { const base3 = ft * 3; ip = sfSelf[base3]; fp = sfSelf[base3 + 1]; sp = sfSelf[base3 + 2]; } else if (fst === 1) { ip = sf[ft * 5]; fp = sf[ft * 5 + 1]; sp = sf[ft * 5 + 2]; vmLocals = sf[ft * 5 + 3]; vmCurrentClosure = sf[ft * 5 + 4]; vmCapturedVars = null; vmSharedCaptured = null; vmCvArr = null; } else { ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft]; vmLocals = fr.locals[ft]; vmCvArr = fr.cvArrs[ft]; vmCurrentClosure = fr.closures[ft]; const savedCv = fr.capturedVars[ft]; vmCapturedVars = savedCv; vmSharedCaptured = savedCv ? fr.sharedCaptured[ft] : null; const savedCode = fr.codes[ft]; if (savedCode) { this.code = savedCode; const fc = fr.consts[ft]; this.consts = fc; code = savedCode; consts = fc; vars = fr.vars[ft]; } } } else { ip++; } stack[sp++] = v; break; }
            case 128: { const gi = code[ip++]; const ci = code[ip++]; globalVals[gi] += consts[ci]; ip += code[ip] + 1; break; }
            case 126: {
                const gi = code[ip++]; const ci = code[ip++];
                const fn = globalVals[gi];
                if (fn && fn._inlineOp !== undefined) {
                    const cv = fn._capturedVal;
                    const argVal = consts[ci];
                    let result;
                    if (fn._inlineOp === 100) result = cv + argVal;
                    else if (fn._inlineOp === 107) result = cv - argVal;
                    else if (fn._inlineOp === 108) result = cv * argVal;
                    else { if (argVal === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } result = cv / argVal; }
                    stack[sp++] = result;
                    break;
                }
                ip -= 3;
                code[ip] = 101;
                break;
            }
            case 129: {
                const gi = code[ip++]; const ci = code[ip++]; const rgi = code[ip++];
                const fn = globalVals[gi];
                if (fn && fn._inlineOp !== undefined) {
                    const cv = fn._capturedVal;
                    const argVal = consts[ci];
                    let result;
                    if (fn._inlineOp === 100) result = cv + argVal;
                    else if (fn._inlineOp === 107) result = cv - argVal;
                    else if (fn._inlineOp === 108) result = cv * argVal;
                    else { if (argVal === 0) { const r = _throwDivError(inTry, tryStack, stack, sp, ip, fp, frameTop, vmLocals, vmCapturedVars, vmSharedCaptured, this); if (r.caught) { ip = r.ip; sp = r.sp; break; } return { success: false, error: 'division error', output: this.output }; } result = cv / argVal; }
                    globalVals[rgi] = result;
                    break;
                }
                ip -= 4;
                code[ip] = 101;
                break;
            }
            case 96: {
                const gi96 = code[ip++]; const ci96 = code[ip++]; const offset96 = code[ip++];
                if (!(globalVals[gi96] < consts[ci96])) { ip += offset96; break; }
                if (fp === 0) {
                if (!this._loopJitCache) this._loopJitCache = {};
                const cacheKey96 = ip - 4;
                let loopFn96 = this._loopJitCache[cacheKey96];
                if (loopFn96 === undefined) {
                    const compiled96 = this._compileGlobalLoop(code, consts, ip, gi96, ci96);
                    if (compiled96) {
                        try {
                            const ug96 = compiled96.usedGlobals; const ua96 = compiled96.usedArrays;
                            const initVals96 = {}; let scanIp96 = 0;
                            while (scanIp96 < cacheKey96) { if (code[scanIp96] === 102) { initVals96[code[scanIp96 + 1]] = consts[code[scanIp96 + 2]]; scanIp96 += 3; } else if (code[scanIp96] === 60) { scanIp96 += 2; } else if (code[scanIp96] >= 158 && code[scanIp96] <= 161) { scanIp96 += 2; } else if (code[scanIp96] === 155 || code[scanIp96] === 156 || code[scanIp96] === 157) { scanIp96 += 3; } else if (code[scanIp96] === 72) { scanIp96 += 3; } else { scanIp96++; } }
                            let fullSrc96 = '';
                            for (const idx96 of ug96) { const iv96 = initVals96[idx96]; if (iv96 !== undefined) { if (typeof iv96 === 'string') fullSrc96 += `var v${idx96}="${iv96}";`; else fullSrc96 += `var v${idx96}=${iv96};`; } else { fullSrc96 += `var v${idx96}=g[${idx96}];`; } }
                            if (ua96.length > 0) { const bodyUsesPush96 = compiled96.bodySrc && compiled96.bodySrc.includes('.push('); if (!bodyUsesPush96) { fullSrc96 += `var _n=${consts[ci96]};`; for (const a96 of ua96) fullSrc96 += `if(${a96}.length===0)${a96}=new Array(_n);else if(${a96}.length<_n)${a96}.length=_n;`; } }
                            fullSrc96 += 'var __bc=1024;';
                            const loopInc96 = compiled96.loopInc || 1; const loopLimit96 = consts[ci96]; const loopVarName96 = `v${gi96}`;
                            let loopSrc96 = _BUDGET_CHECK + compiled96.bodySrc;
                            if (!compiled96.isWhileLoop) { loopSrc96 = loopSrc96.replace(new RegExp('\\b' + loopVarName96 + '\\+\\+;', 'g'), ''); loopSrc96 = loopSrc96.replace(new RegExp('\\b' + loopVarName96 + '\\+=' + loopInc96 + ';', 'g'), ''); }
                            const indexAssignMatch96 = /^\s*((?:v\d+))\[(v\d+)\]=\2;\s*$/.exec(loopSrc96);
                            if (!compiled96.isWhileLoop && loopInc96 === 1 && typeof loopLimit96 === 'number' &&
                                indexAssignMatch96 && indexAssignMatch96[2] === loopVarName96) {
                                const arrVar96 = indexAssignMatch96[1];
                                fullSrc96 += `if(!Array.isArray(${arrVar96}))${arrVar96}=[];else if(${arrVar96}.length<${loopLimit96})${arrVar96}.length=${loopLimit96};`;
                                fullSrc96 += `for(;${loopVarName96}<${loopLimit96};${loopVarName96}+=1){${arrVar96}[${loopVarName96}]=${loopVarName96};}`;
                            } else
                            if (loopInc96 === 1 && typeof loopLimit96 === 'number' && loopLimit96 >= 8 && !loopSrc96.includes('for(') && !loopSrc96.includes('if(')) {
                                const bodyRefs96 = new RegExp('\\b' + loopVarName96 + '\\b').test(loopSrc96);
                                if (compiled96.isWhileLoop) { fullSrc96 += `while(${loopVarName96}<${loopLimit96}){${loopSrc96}}`; }
                                else if (!bodyRefs96) { let factor96 = 4; if (loopLimit96 % 4 !== 0) factor96 = 2; if (loopLimit96 % 2 !== 0) factor96 = 1; if (factor96 > 1) { const isPush96 = loopSrc96.includes('.push('); let unrolled96; if (isPush96) { const pm96 = loopSrc96.match(/(\w+)\.push\(([^)]+)\)/); if (pm96) { unrolled96 = `${pm96[1]}.push(${Array(factor96).fill(pm96[2]).join(',')});`; } else { unrolled96 = loopSrc96.repeat(factor96); } } else { unrolled96 = loopSrc96.repeat(factor96); } const newLimit96 = loopLimit96 - (loopLimit96 % factor96); fullSrc96 += `for(;${loopVarName96}<${newLimit96};${loopVarName96}+=${factor96}){${unrolled96}}`; if (newLimit96 < loopLimit96) fullSrc96 += `for(;${loopVarName96}<${loopLimit96};${loopVarName96}+=1){${loopSrc96}}`; } else { fullSrc96 += `for(;${loopVarName96}<${loopLimit96};${loopVarName96}+=${loopInc96}){${loopSrc96}}`; } }
                                else if (loopLimit96 >= 4 && loopLimit96 % 2 === 0) { const tv96 = loopVarName96 + 'x'; const b296 = loopSrc96.replace(new RegExp('\\b' + loopVarName96 + '\\b', 'g'), tv96); if (loopLimit96 % 4 === 0 && loopLimit96 >= 8) { const tv296 = loopVarName96 + 'xx'; const tv396 = loopVarName96 + 'xxx'; const b396 = loopSrc96.replace(new RegExp('\\b' + loopVarName96 + '\\b', 'g'), tv296); const b496 = loopSrc96.replace(new RegExp('\\b' + loopVarName96 + '\\b', 'g'), tv396); fullSrc96 += `for(;${loopVarName96}<${loopLimit96};${loopVarName96}+=4){${loopSrc96}var ${tv96}=${loopVarName96}+1;${b296}var ${tv296}=${loopVarName96}+2;${b396}var ${tv396}=${loopVarName96}+3;${b496}}`; } else { fullSrc96 += `for(;${loopVarName96}<${loopLimit96};${loopVarName96}+=2){${loopSrc96}var ${tv96}=${loopVarName96}+1;${b296}}`; } }
                                else { fullSrc96 += `for(;${loopVarName96}<${loopLimit96};${loopVarName96}+=${loopInc96}){${loopSrc96}}`; }
                            } else { if (compiled96.isWhileLoop) { fullSrc96 += `while(v${gi96}<${consts[ci96]}){${loopSrc96}}`; } else { fullSrc96 += `for(;v${gi96}<${consts[ci96]};v${gi96}+=${compiled96.loopInc || 1}){${loopSrc96}}`; } }
                            for (const idx96 of ug96) { if (idx96 !== gi96) fullSrc96 += `g[${idx96}]=v${idx96};`; }
                            fullSrc96 += `g[${gi96}]=v${gi96};`;
                            fullSrc96 = this._optimizeJitVSrc(fullSrc96, 1);
                            loopFn96 = this._safeNewFunction('g', '__b', fullSrc96);
                        } catch(e) { loopFn96 = null; }
                    } else { loopFn96 = null; }
                    this._loopJitCache[cacheKey96] = loopFn96;
                }
                if (loopFn96) {
                    try {
                        loopFn96(globalVals, execBudget);
                    } catch(e) {
                        if (e.message === '__SEED_BUDGET_INSN__') {
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: `Execution limit exceeded (${this._maxInstructions} instructions)`, output: this.output };
                        }
                        if (e.message === '__SEED_BUDGET_TIME__') {
                            this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                            this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                            return { success: false, error: `Execution timeout (${this._maxExecutionMs}ms)`, output: this.output };
                        }
                        this._loopJitCache[cacheKey96] = null;
                        loopFn96 = null;
                    }
                    if (!loopFn96) break;
                    ip += offset96; break;
                }
                }
                break;
            }
            case 255: {
                this._syncGlobalVals = true;
                this._globalValsDirty = !this.preserveGlobals;
                if (!this._globalCache) {
                    this._saveCache();
                }
                if (!this._jitFastPath && this._loopJitCache) {
                    this._buildJitFastPath(bc);
                }
                return this._cachedResult;
            }
            case OP.TRY: {
                const offset = code[ip++];
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
                this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                return { success: false, error: String(error), output: this.output };
            }
            case OP.END_TRY: {
                if (tryStack.length) {
                    tryStack.pop();
                }
                inTry = tryStack.length > 0;
                break;
            }
            case OP.CATCH: {
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
                        this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                        this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
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
                                ip = fr.ips[ft]; fp = fr.fps[ft]; sp = fr.sps[ft];
                                vmLocals = fr.locals[ft]; vmCurrentClosure = fr.closures[ft];
                                vmCvArr = fr.cvArrs[ft];
                                vmCapturedVars = fr.capturedVars[ft];
                                vmSharedCaptured = fr.capturedVars[ft] ? fr.sharedCaptured[ft] : null;
                                const savedCode = fr.codes[ft];
                                if (savedCode) {
                                    this.code = savedCode;
                                    const fc = fr.consts[ft];
                                    this.consts = fc;
                                    code = savedCode; consts = fc; vars = fr.vars[ft];
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
            default: {
                this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
                this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
                this._fallbackCount = (this._fallbackCount || 0) + 1;
                this._suppressConsoleLog = false;
                return this.runFull(bc);
            }
        }
    }
    this._syncGlobalVals = true;
    this._sp = sp; this._fp = fp; this.ip = ip; this._frameTop = frameTop;
    this.stack = stack; this.locals = vmLocals; this.capturedVars = vmCapturedVars; this.sharedCaptured = vmSharedCaptured;
    return { success: true, output: this.output };
    } finally { this._suppressConsoleLog = prevSuppress; }
}
function wireRunFast(VMProto) {
    VMProto.runFast = runFast;
}

module.exports = { runFast, wireRunFast };