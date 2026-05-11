'use strict';

const { OP, RETURN_OPS: _RETURN_OPS, COMPUTED_RETURN_OPS: _COMPUTED_RETURN_OPS, VALID_OPCODES: _VALID_OPCODES } = require('./opcodes');
const { SeedLangError } = require('./errors');
const { hardenArrayObject } = require('./runtime_safety');
const { safeAddValues, normalizeNumericOperand, seedEquals, safeRepeatString, MAX_STRING_REPEAT_RESULT_LEN: _MAX_STRING_REPEAT_RESULT_LEN, MAX_STRING_VALUE_LEN: _MAX_STRING_VALUE_LEN } = require('./value_ops');
const { invokeHostMethod, createSafeInstance, instantiateClassObject, isSafeArrayIndex, isPrivateInstanceKey, canAccessInstanceKey, resolveMethodStart, buildMethodLocalScope } = require('./instance_ops');
const { createRuntimeClosure, prepareCallCapturedVars, resolveCallSharedCaptured, getCallScopedCapturedMeta, resolveCallCvArr, getCallScopedCapturedNames, hasCallScopedCaptured, resolveLocalNameByIndex, refreshCapturedLocalsFromFrame } = require('./closure_ops');
const { isDangerousObjectKey, isInternalMetaKey, decodeSeedObjectKey } = require('./object_key_safety');
const { OBJECT_SPREAD_MARKER, _fastFibNonNegInt } = require('./shared');
const { isReturnOpcodeValue, isComputedReturnOpcodeValue } = require('./return_ops');
const { consumeExecutionBudget, consumeExecutionBudgetBatch } = require('./execution_budget');
const { _decodeAmpCompressedString } = require('./amp');
const { isClassicFibFuncRef: _isClassicFibFuncRef, canUseFastFib: _canUseFastFib, tryFastBuiltinUnaryCall: _tryFastBuiltinUnaryCall, hydrateBuiltinGlobals: _hydrateBuiltinGlobals, NO_FAST_BUILTIN: _NO_FAST_BUILTIN } = require('./fast_builtin_ops');
const { resumeCoroutine: _resumeCoroutine, createCoroutineFromDef: _createCoroutineFromDef, createCoroutineFromClosure: _createCoroutineFromClosure, isFiberClosure: _isFiberClosure, createCoroutineFromMethod: _createCoroutineFromMethod } = require('../../../dist/core/coroutine.js');
const { MAX_FRAME_DEPTH, MAX_OPERAND_STACK_SLOTS, enforceAggregateCount, enforceAggregateMerge } = require('./frame_limits');

const _EXEC_BUDGET_TIME_SLICE = 4096;

function _runFromIpAggregateFail(vm, msg) {
    return { success: false, error: msg, output: vm.output };
}

function runFromIp() {
    while (true) {
        if (this._schedulerPreempt && --this._timeSliceBudget <= 0) {
            this._timeSliceBudget = this._timeSliceSize || 1024;
            return { success: true, output: this.output, yielded: true, value: null, _preempted: true };
        }
        if (this.stack.length > MAX_OPERAND_STACK_SLOTS || (this._fp | 0) >= MAX_OPERAND_STACK_SLOTS) {
            this._sp = this.stack.length;
            return { success: false, error: 'operand stack overflow', output: this.output };
        }
        const op = this.code[this.ip++];
        switch (op) {
            case OP.NOP: break;
            case OP.CONST: this.stack.push(this.consts[this.code[this.ip++]]); break;
            case OP.NULL: this.stack.push(null); break;
            case OP.TRUE: this.stack.push(true); break;
            case OP.FALSE: this.stack.push(false); break;
            case OP.POP: this.stack.pop(); break;
            
            case OP.GET_GLOBAL: {
                const vi = this.code[this.ip++];
                const varName = this.vars[vi];
                const gi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined;
                let value = (this._globalVals && typeof gi === 'number') ? this._globalVals[gi] : undefined;
                if (value === undefined) value = this.globals[varName];
                if (value === undefined && this.builtins[varName]) {
                    value = this.builtins[varName];
                    if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = value;
                }
                this.stack.push(value ?? null);
                break;
            }
            case OP.SET_GLOBAL: { const vi = this.code[this.ip++]; const varName = this.vars[vi]; const v = hardenArrayObject(this.stack.pop()); const gi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = v; this.globals[varName] = v; break; }
            case OP.SET_GLOBAL_KEEP: { const vi = this.code[this.ip++]; const varName = this.vars[vi]; const v = hardenArrayObject(this.stack[this.stack.length - 1]); const gi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = v; this.globals[varName] = v; break; }
            case OP.CONST_SET_GLOBAL: { const vi = this.code[this.ip++]; const ci = this.code[this.ip++]; const varName = this.vars[vi]; const v = hardenArrayObject(this.consts[ci]); const gi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = v; this.globals[varName] = v; break; }
            case OP.CONST_GET_GLOBAL: { const vi = this.code[this.ip++]; const ci = this.code[this.ip++]; const varName = this.vars[vi]; const v = hardenArrayObject(this.consts[ci]); const gi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = v; this.globals[varName] = v; this.stack.push(v); break; }
            case OP.ADD_GLOBALS_SET_GLOBAL: { const ti = this.code[this.ip++]; const ai = this.code[this.ip++]; const bi = this.code[this.ip++]; const tName = this.vars[ti], aName = this.vars[ai], bName = this.vars[bi]; const av = this.globals[aName]; const bv = this.globals[bName]; const v = Array.isArray(av) && Array.isArray(bv) ? [...av, ...bv] : safeAddValues(av, bv); const gi = this._globalNameIdx ? this._globalNameIdx.get(tName) : undefined; const hv = hardenArrayObject(v); if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = hv; this.globals[tName] = hv; break; }
            case OP.ADD_NUM_GLOBALS_SET_GLOBAL: { const ti = this.code[this.ip++]; const ai = this.code[this.ip++]; const bi = this.code[this.ip++]; const tName = this.vars[ti], aName = this.vars[ai], bName = this.vars[bi]; const v = normalizeNumericOperand(this.globals[aName]) + normalizeNumericOperand(this.globals[bName]); const gi = this._globalNameIdx ? this._globalNameIdx.get(tName) : undefined; if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = v; this.globals[tName] = v; break; }
            case OP.ADD_NUM_SET_GLOBAL: { const b = normalizeNumericOperand(this.stack.pop()); const a = normalizeNumericOperand(this.stack.pop()); this.ip++; const gi = this.code[this.ip++]; if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = a + b; break; }
            case OP.SUB_NUM_SET_GLOBAL: { const b = this.stack.pop(); const a = this.stack.pop(); this.ip++; const gi = this.code[this.ip++]; if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = a - b; break; }
            case OP.MUL_NUM_SET_GLOBAL: { const b = normalizeNumericOperand(this.stack.pop()); const a = normalizeNumericOperand(this.stack.pop()); this.ip++; const gi = this.code[this.ip++]; if (this._globalVals && typeof gi === 'number') this._globalVals[gi] = a * b; break; }
            case OP.INC_GLOBAL: { const gi = this.code[this.ip++]; const ci = this.code[this.ip++]; const varName = this.vars[gi]; const v = (this.globals[varName] || 0) + (this.consts[ci] || 0); this.globals[varName] = v; const gidx = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (this._globalVals && typeof gidx === 'number') this._globalVals[gidx] = v; break; }
            case OP.ADD_GLOBAL_SET: { const gi = this.code[this.ip++]; const ci = this.code[this.ip++]; const varName = this.vars[gi]; const v = safeAddValues(this.globals[varName], this.globals[this.vars[ci]]); this.globals[varName] = v; const gidx = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (this._globalVals && typeof gidx === 'number') this._globalVals[gidx] = v; break; }
            case OP.GET_GLOBAL2: { const i1 = this.code[this.ip++]; const i2 = this.code[this.ip++]; this.stack.push(this.globals[this.vars[i1]]); this.stack.push(this.globals[this.vars[i2]]); break; }
            case OP.MUL_GLOBAL_CONST: { const gi = this.code[this.ip++]; const ci = this.code[this.ip++]; const varName = this.vars[gi]; this.stack.push(this.globals[varName] * this.consts[ci]); break; }
            case OP.ADD_GLOBAL_CONST: { const gi = this.code[this.ip++]; const ci = this.code[this.ip++]; const varName = this.vars[gi]; this.stack.push(safeAddValues(this.globals[varName], this.consts[ci])); break; }
            case OP.SUB_GLOBAL_CONST: { const gi = this.code[this.ip++]; const ci = this.code[this.ip++]; const varName = this.vars[gi]; this.stack.push(this.globals[varName] - this.consts[ci]); break; }
            case OP.DIV_GLOBALS: { const ai = this.code[this.ip++]; const bi = this.code[this.ip++]; this.stack.push(this.globals[this.vars[ai]] / this.globals[this.vars[bi]]); break; }
            case OP.MUL_GLOBALS: { const ai = this.code[this.ip++]; const bi = this.code[this.ip++]; this.stack.push(this.globals[this.vars[ai]] * this.globals[this.vars[bi]]); break; }
            case OP.ADD_GLOBAL2: { const ai = this.code[this.ip++]; const bi = this.code[this.ip++]; this.stack.push(safeAddValues(this.globals[this.vars[ai]], this.globals[this.vars[bi]])); break; }
            case OP.SUB_GLOBAL2: { const ai = this.code[this.ip++]; const bi = this.code[this.ip++]; this.stack.push(this.globals[this.vars[ai]] - this.globals[this.vars[bi]]); break; }
            case OP.INC_GLOBAL_JUMP: { const gi = this.code[this.ip++]; const ci = this.code[this.ip++]; const varName = this.vars[gi]; const v = (this.globals[varName] || 0) + (this.consts[ci] || 0); this.globals[varName] = v; const gidx = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (this._globalVals && typeof gidx === 'number') this._globalVals[gidx] = v; this.ip += this.code[this.ip] + 1; break; }
            case OP.LOOP_RANGE_STEP: { const idxGi = this.code[this.ip++]; const loopGi = this.code[this.ip++]; const ci = this.code[this.ip++]; const offset = this.code[this.ip++]; const idxName = this.vars[idxGi]; const loopName = this.vars[loopGi]; if (this.globals[idxName] < this.consts[ci]) { this.globals[loopName] = this.globals[idxName]; this.globals[idxName]++; const gidx1 = this._globalNameIdx ? this._globalNameIdx.get(idxName) : undefined; const gidx2 = this._globalNameIdx ? this._globalNameIdx.get(loopName) : undefined; if (this._globalVals && typeof gidx1 === 'number') this._globalVals[gidx1] = this.globals[idxName]; if (this._globalVals && typeof gidx2 === 'number') this._globalVals[gidx2] = this.globals[loopName]; } else { this.ip += offset; } break; }
            case OP.LOOP_LT_GLOBAL: { const ai = this.code[this.ip++]; const bi = this.code[this.ip++]; const offset = this.code[this.ip++]; if (this.globals[this.vars[ai]] < this.globals[this.vars[bi]]) { } else { this.ip += offset; } break; }
            case OP.LOOP_INC_GLOBAL: { const gi = this.code[this.ip++]; const ci = this.code[this.ip++]; const varName = this.vars[gi]; this.globals[varName] = (this.globals[varName] || 0) + (this.consts[ci] || 1); const gidx = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (this._globalVals && typeof gidx === 'number') this._globalVals[gidx] = this.globals[varName]; break; }
            case OP.LOOP_INC_GLOBAL_SIMPLE: { const gi = this.code[this.ip++]; const varName = this.vars[gi]; this.globals[varName] = (this.globals[varName] || 0) + 1; const gidx = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined; if (this._globalVals && typeof gidx === 'number') this._globalVals[gidx] = this.globals[varName]; break; }
            case OP.NEW: { const className = this.code[this.ip++]; this.stack.push(null); break; }
            case OP.GET_METHOD: { const methodName = this.code[this.ip++]; const obj = this.stack.pop(); this.stack.push(null); break; }
            case OP.GET_LOCAL: {
                const idx = this.code[this.ip++];
                let val = this.stack[this._fp + idx];
                const funcRef = this.currentClosure?._funcRef;
                const capturedLocals = funcRef?.capturedLocals;
                if ((this.capturedVars || this.sharedCaptured) && Array.isArray(capturedLocals) && capturedLocals.length > 0 && Array.isArray(this.locals)) {
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
                    for (let i = this.locals.length - 1; i >= 0 && capturedName === undefined; i--) {
                        const scope = this.locals[i];
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
                        const box = this.capturedVars ? this.capturedVars[capturedName] : undefined;
                        const sharedBox = box === undefined && this.sharedCaptured ? this.sharedCaptured[capturedName] : undefined;
                        const selected = box !== undefined ? box : sharedBox;
                        if (selected && typeof selected === 'object' && Object.prototype.hasOwnProperty.call(selected, 'value')) val = selected.value;
                        else if (selected !== undefined) val = selected;
                    }
                }
                this.stack.push(val ?? null);
                break;
            }
            case OP.SET_LOCAL: {
                const idx = this.code[this.ip++];
                const value = this.stack.pop();
                this.stack[this._fp + idx] = value;
                const closureRef = this.currentClosure?._funcRef;
                const hasCaptureState = (!!this.capturedVars && !Array.isArray(this.capturedVars)) || (!!this.sharedCaptured && !Array.isArray(this.sharedCaptured));
                if (closureRef && hasCaptureState && Array.isArray(closureRef.capturedVars) && closureRef.capturedVars.length > 0) {
                    const localName = resolveLocalNameByIndex(this.locals, idx);
                    const varName = localName !== undefined ? localName : (this.vars ? this.vars[idx] : undefined);
                    if (varName !== undefined) {
                        const captured = this.capturedVars && !Array.isArray(this.capturedVars) ? this.capturedVars[varName] : undefined;
                        if (captured && typeof captured === 'object' && Object.prototype.hasOwnProperty.call(captured, 'value')) {
                            captured.value = value;
                        } else if (this.sharedCaptured && !Array.isArray(this.sharedCaptured) && this.sharedCaptured[varName] && typeof this.sharedCaptured[varName] === 'object') {
                            this.sharedCaptured[varName].value = value;
                        }
                    }
                }
                break;
            }
            case OP.CONST_SET_LOCAL: {
                const ci = this.code[this.ip++];
                const li = this.code[this.ip++];
                this.stack[this._fp + li] = this.consts[ci];
                break;
            }
            case OP.ADD_LOCAL: {
                const i1 = this.code[this.ip++];
                const i2 = this.code[this.ip++];
                this.stack.push(safeAddValues(this.stack[this._fp + i1], this.stack[this._fp + i2]));
                break;
            }
            case OP.INC_LOCAL: {
                const li = this.code[this.ip++];
                this.stack[this._fp + li] = this.stack[this._fp + li] + 1;
                break;
            }
            case OP.ADD_LOCAL_SET: {
                const si = this.code[this.ip++];
                const ai = this.code[this.ip++];
                this.stack[this._fp + si] = safeAddValues(this.stack[this._fp + si], this.stack[this._fp + ai]);
                break;
            }
            case OP.ADD_CAPTURED_LOCAL: {
                const cvIdx = this.code[this.ip++];
                const lcIdx = this.code[this.ip++];
                const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                const varName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length
                    ? capturedNames[cvIdx]
                    : this.vars[cvIdx];
                const captured = this.capturedVars?.[varName];
                const cv = captured?.value !== undefined ? captured.value : (captured ?? null);
                this.stack.push(safeAddValues(cv, this.stack[this._fp + lcIdx]));
                break;
            }
            case OP.RETURN_ADD_CAPTURED_LOCAL: {
                const cvIdx = this.code[this.ip++];
                const lcIdx = this.code[this.ip++];
                const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                const varName = Array.isArray(capturedNames) && cvIdx >= 0 && cvIdx < capturedNames.length
                    ? capturedNames[cvIdx]
                    : this.vars[cvIdx];
                const captured = this.capturedVars?.[varName];
                const cv = captured?.value !== undefined ? captured.value : (captured ?? null);
                const v = safeAddValues(cv, this.stack[this._fp + lcIdx]);
                if (this.frames?.length) {
                    const frame = this.frames.pop();
                    this.ip = frame.ip;
                    this.stack = frame.stack;
                    this.locals = frame.locals;
                    this.capturedVars = frame.capturedVars;
                    this.sharedCaptured = frame.sharedCaptured;
                    this.code = frame.code || this.code;
                    this.consts = frame.consts || this.consts;
                    this.vars = frame.vars || this.vars;
                }
                this.stack.push(v);
                break;
            }
            case OP.RETURN_SUB_CAPTURED_LOCAL: {
                const cvIdx2 = this.code[this.ip++];
                const lcIdx2 = this.code[this.ip++];
                const capturedNames2 = this.currentClosure?._funcRef?.capturedVars;
                const varName2 = Array.isArray(capturedNames2) && cvIdx2 >= 0 && cvIdx2 < capturedNames2.length
                    ? capturedNames2[cvIdx2]
                    : this.vars[cvIdx2];
                const captured2 = this.capturedVars?.[varName2];
                const cv2 = captured2?.value !== undefined ? captured2.value : (captured2 ?? null);
                const v2 = cv2 - this.stack[this._fp + lcIdx2];
                if (this.frames?.length) {
                    const frame2 = this.frames.pop();
                    this.ip = frame2.ip; this.stack = frame2.stack; this.locals = frame2.locals;
                    this.capturedVars = frame2.capturedVars; this.sharedCaptured = frame2.sharedCaptured;
                    this.code = frame2.code || this.code; this.consts = frame2.consts || this.consts; this.vars = frame2.vars || this.vars;
                }
                this.stack.push(v2);
                break;
            }
            case OP.RETURN_MUL_CAPTURED_LOCAL: {
                const cvIdx3 = this.code[this.ip++];
                const lcIdx3 = this.code[this.ip++];
                const capturedNames3 = this.currentClosure?._funcRef?.capturedVars;
                const varName3 = Array.isArray(capturedNames3) && cvIdx3 >= 0 && cvIdx3 < capturedNames3.length
                    ? capturedNames3[cvIdx3]
                    : this.vars[cvIdx3];
                const captured3 = this.capturedVars?.[varName3];
                const cv3 = captured3?.value !== undefined ? captured3.value : (captured3 ?? null);
                const v3 = cv3 * this.stack[this._fp + lcIdx3];
                if (this.frames?.length) {
                    const frame3 = this.frames.pop();
                    this.ip = frame3.ip; this.stack = frame3.stack; this.locals = frame3.locals;
                    this.capturedVars = frame3.capturedVars; this.sharedCaptured = frame3.sharedCaptured;
                    this.code = frame3.code || this.code; this.consts = frame3.consts || this.consts; this.vars = frame3.vars || this.vars;
                }
                this.stack.push(v3);
                break;
            }
            case OP.RETURN_DIV_CAPTURED_LOCAL: {
                const cvIdx4 = this.code[this.ip++];
                const lcIdx4 = this.code[this.ip++];
                const capturedNames4 = this.currentClosure?._funcRef?.capturedVars;
                const varName4 = Array.isArray(capturedNames4) && cvIdx4 >= 0 && cvIdx4 < capturedNames4.length
                    ? capturedNames4[cvIdx4]
                    : this.vars[cvIdx4];
                const captured4 = this.capturedVars?.[varName4];
                const cv4 = captured4?.value !== undefined ? captured4.value : (captured4 ?? null);
                const v4 = cv4 / this.stack[this._fp + lcIdx4];
                if (this.frames?.length) {
                    const frame4 = this.frames.pop();
                    this.ip = frame4.ip; this.stack = frame4.stack; this.locals = frame4.locals;
                    this.capturedVars = frame4.capturedVars; this.sharedCaptured = frame4.sharedCaptured;
                    this.code = frame4.code || this.code; this.consts = frame4.consts || this.consts; this.vars = frame4.vars || this.vars;
                }
                this.stack.push(v4);
                break;
            }
            case OP.RETURN_ADD_LOCALS: {
                const a = this.code[this.ip++], b = this.code[this.ip++];
                const v = this.stack[this._fp + a] + this.stack[this._fp + b];
                if (this.frames?.length) {
                    const frame = this.frames.pop();
                    this.ip = frame.ip; this.stack = frame.stack; this.locals = frame.locals;
                    this.capturedVars = frame.capturedVars; this.sharedCaptured = frame.sharedCaptured;
                    this.code = frame.code || this.code; this.consts = frame.consts || this.consts; this.vars = frame.vars || this.vars;
                }
                this.stack.push(v);
                break;
            }
            case OP.RETURN_SUB_LOCALS: {
                const a = this.code[this.ip++], b = this.code[this.ip++];
                const v = this.stack[this._fp + a] - this.stack[this._fp + b];
                if (this.frames?.length) {
                    const frame = this.frames.pop();
                    this.ip = frame.ip; this.stack = frame.stack; this.locals = frame.locals;
                    this.capturedVars = frame.capturedVars; this.sharedCaptured = frame.sharedCaptured;
                    this.code = frame.code || this.code; this.consts = frame.consts || this.consts; this.vars = frame.vars || this.vars;
                }
                this.stack.push(v);
                break;
            }
            case OP.RETURN_MUL_LOCALS: {
                const a = this.code[this.ip++], b = this.code[this.ip++];
                const v = this.stack[this._fp + a] * this.stack[this._fp + b];
                if (this.frames?.length) {
                    const frame = this.frames.pop();
                    this.ip = frame.ip; this.stack = frame.stack; this.locals = frame.locals;
                    this.capturedVars = frame.capturedVars; this.sharedCaptured = frame.sharedCaptured;
                    this.code = frame.code || this.code; this.consts = frame.consts || this.consts; this.vars = frame.vars || this.vars;
                }
                this.stack.push(v);
                break;
            }
            case OP.RETURN_DIV_LOCALS: {
                const a = this.code[this.ip++], b = this.code[this.ip++];
                const v = this.stack[this._fp + a] / this.stack[this._fp + b];
                if (this.frames?.length) {
                    const frame = this.frames.pop();
                    this.ip = frame.ip; this.stack = frame.stack; this.locals = frame.locals;
                    this.capturedVars = frame.capturedVars; this.sharedCaptured = frame.sharedCaptured;
                    this.code = frame.code || this.code; this.consts = frame.consts || this.consts; this.vars = frame.vars || this.vars;
                }
                this.stack.push(v);
                break;
            }
            case OP.LT_LOCAL_CONST: {
                const li = this.code[this.ip++];
                const ci = this.code[this.ip++];
                this.stack.push(this.stack[this._fp + li] < this.consts[ci]);
                break;
            }
            case OP.LOOP_LT: {
                const li = this.code[this.ip++];
                const ci = this.code[this.ip++];
                const offset = this.code[this.ip++];
                if (!(this.stack[this._fp + li] < this.consts[ci])) this.ip += offset;
                break;
            }
            case OP.GET_CAPTURED: {
                const varIdx = this.code[this.ip++];
                const cvArr = resolveCallCvArr(this.currentClosure, this.capturedVars);
                let varName = undefined;
                const capturedVarsIsObject = this.capturedVars && !Array.isArray(this.capturedVars);
                const callScoped = capturedVarsIsObject && hasCallScopedCaptured(this.currentClosure, undefined, varIdx);
                if (callScoped) {
                    const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && varIdx >= 0 && varIdx < capturedNames.length
                        ? capturedNames[varIdx]
                        : undefined;
                    varName = capturedName;
                    if (varName === undefined) varName = this.vars[varIdx];
                    const scopedBox = this.capturedVars[varName];
                    if (scopedBox && typeof scopedBox === 'object' && Object.prototype.hasOwnProperty.call(scopedBox, 'value')) {
                        this.stack.push(scopedBox.value);
                        break;
                    }
                    if (scopedBox !== undefined) {
                        this.stack.push(scopedBox);
                        break;
                    }
                }
                if (Array.isArray(cvArr) && varIdx === 0 && cvArr.length === 1) {
                    const singleBox = cvArr[0];
                    if (singleBox && typeof singleBox === 'object' && Object.prototype.hasOwnProperty.call(singleBox, 'value')) {
                        this.stack.push(singleBox.value);
                        break;
                    }
                }
                if (Array.isArray(cvArr) && varIdx >= 0 && varIdx < cvArr.length) {
                    const directBox = cvArr[varIdx];
                    if (directBox && typeof directBox === 'object' && Object.prototype.hasOwnProperty.call(directBox, 'value')) {
                        this.stack.push(directBox.value);
                        break;
                    }
                }
                let cvIdx = varIdx;
                if ((cvIdx < 0 || !Array.isArray(cvArr) || cvIdx >= cvArr.length) && varName !== undefined) {
                    const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                    if (Array.isArray(capturedNames)) {
                        cvIdx = capturedNames.indexOf(varName);
                        if (cvIdx < 0) cvIdx = varIdx;
                    }
                }
                const box = Array.isArray(cvArr) && cvIdx >= 0 && cvIdx < cvArr.length ? cvArr[cvIdx] : null;
                if (box && typeof box === 'object' && Object.prototype.hasOwnProperty.call(box, 'value')) {
                    this.stack.push(box.value);
                } else if (this.capturedVars) {
                    if (varName === undefined) {
                        const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                        const capturedName = Array.isArray(capturedNames) && varIdx >= 0 && varIdx < capturedNames.length
                            ? capturedNames[varIdx]
                            : undefined;
                        varName = capturedName !== undefined ? capturedName : this.vars[varIdx];
                    }
                    const captured = this.capturedVars[varName];
                    const value = captured?.value !== undefined ? captured.value : (captured ?? null);
                    this.stack.push(value);
                } else if (this.sharedCaptured) {
                    if (varName === undefined) {
                        const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                        const capturedName = Array.isArray(capturedNames) && varIdx >= 0 && varIdx < capturedNames.length
                            ? capturedNames[varIdx]
                            : undefined;
                        varName = capturedName !== undefined ? capturedName : this.vars[varIdx];
                    }
                    const box = this.sharedCaptured[varName];
                    this.stack.push(box ? box.value : null);
                } else {
                    this.stack.push(null);
                }
                break;
            }
            case OP.SET_CAPTURED: {
                const varIdx = this.code[this.ip++];
                const cvArr = resolveCallCvArr(this.currentClosure, this.capturedVars);
                let varName = undefined;
                const value = this.stack.pop();
                const capturedVarsIsObject = this.capturedVars && !Array.isArray(this.capturedVars);
                const callScoped = capturedVarsIsObject && hasCallScopedCaptured(this.currentClosure, undefined, varIdx);
                if (callScoped) {
                    const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && varIdx >= 0 && varIdx < capturedNames.length
                        ? capturedNames[varIdx]
                        : undefined;
                    varName = capturedName;
                    if (varName === undefined) varName = this.vars[varIdx];
                    const scoped = this.capturedVars[varName];
                    if (scoped && typeof scoped === 'object' && Object.prototype.hasOwnProperty.call(scoped, 'value')) {
                        scoped.value = value;
                    } else {
                        this.capturedVars[varName] = { value };
                    }
                } else {
                let handledBySingleBox = false;
                if (Array.isArray(cvArr) && varIdx === 0 && cvArr.length === 1) {
                    const singleBox = cvArr[0];
                    if (singleBox && typeof singleBox === 'object' && Object.prototype.hasOwnProperty.call(singleBox, 'value')) {
                        singleBox.value = value;
                        handledBySingleBox = true;
                    }
                }
                if (!handledBySingleBox && Array.isArray(cvArr) && varIdx >= 0 && varIdx < cvArr.length) {
                    const directBox = cvArr[varIdx];
                    if (directBox && typeof directBox === 'object' && Object.prototype.hasOwnProperty.call(directBox, 'value')) {
                        directBox.value = value;
                        handledBySingleBox = true;
                    }
                }
                if (!handledBySingleBox) {
                    let cvIdx = varIdx;
                    if ((cvIdx < 0 || !Array.isArray(cvArr) || cvIdx >= cvArr.length) && varName !== undefined) {
                        const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                        if (Array.isArray(capturedNames)) {
                            cvIdx = capturedNames.indexOf(varName);
                            if (cvIdx < 0) cvIdx = varIdx;
                        }
                    }
                    const box = Array.isArray(cvArr) && cvIdx >= 0 && cvIdx < cvArr.length ? cvArr[cvIdx] : null;
                    if (box && typeof box === 'object' && Object.prototype.hasOwnProperty.call(box, 'value')) {
                        box.value = value;
                    } else if (Array.isArray(cvArr) && cvIdx >= 0 && cvIdx < cvArr.length) {
                        if (varName === undefined) {
                            const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                            const capturedName = Array.isArray(capturedNames) && varIdx >= 0 && varIdx < capturedNames.length
                                ? capturedNames[varIdx]
                                : undefined;
                            varName = capturedName !== undefined ? capturedName : this.vars[varIdx];
                        }
                        const newBox = { value };
                        cvArr[cvIdx] = newBox;
                        if (this.capturedVars) this.capturedVars[varName] = newBox;
                        if (this.sharedCaptured && Object.prototype.hasOwnProperty.call(this.sharedCaptured, varName)) {
                            this.sharedCaptured[varName] = newBox;
                        }
                    } else if (this.sharedCaptured) {
                        if (varName === undefined) {
                            const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                            const capturedName = Array.isArray(capturedNames) && varIdx >= 0 && varIdx < capturedNames.length
                                ? capturedNames[varIdx]
                                : undefined;
                            varName = capturedName !== undefined ? capturedName : this.vars[varIdx];
                        }
                        if (Object.prototype.hasOwnProperty.call(this.sharedCaptured, varName)) {
                        this.sharedCaptured[varName].value = value;
                        } else if (this.capturedVars) {
                            const captured = this.capturedVars[varName];
                            if (captured?.value !== undefined) {
                                captured.value = value;
                            } else {
                                this.capturedVars[varName] = value;
                            }
                        } else {
                            if (this.sharedCaptured[varName]) {
                                this.sharedCaptured[varName].value = value;
                            } else {
                                this.sharedCaptured[varName] = { value: value };
                            }
                        }
                    } else if (this.capturedVars) {
                        if (varName === undefined) varName = this.vars[varIdx];
                        const captured = this.capturedVars[varName];
                        if (captured?.value !== undefined) {
                            captured.value = value;
                        } else {
                            this.capturedVars[varName] = value;
                        }
                    }
                }
                }
                let localIdx;
                if (varName === undefined) {
                    const capturedNames = this.currentClosure?._funcRef?.capturedVars;
                    const capturedName = Array.isArray(capturedNames) && varIdx >= 0 && varIdx < capturedNames.length
                        ? capturedNames[varIdx]
                        : undefined;
                    varName = capturedName !== undefined ? capturedName : this.vars[varIdx];
                }
                if (Array.isArray(this.locals)) {
                    for (let i = this.locals.length - 1; i >= 0; i--) {
                        const idx2 = this.locals[i]?.[varName];
                        if (idx2 !== undefined) { localIdx = idx2; break; }
                    }
                }
                if (localIdx !== undefined) {
                    this.stack[this._fp + localIdx] = value;
                }
                break;
            }
            
            case OP.ADD: { 
                const b = this.stack.pop(), a = this.stack.pop();
                if (Array.isArray(a) && Array.isArray(b)) {
                    this.stack.push([...a, ...b]);
                } else if (this.strict) {
                    if ((typeof a !== 'number' && typeof a !== 'string') || (typeof b !== 'number' && typeof b !== 'string')) {
                        throw new SeedLangError(`Cannot add ${typeof a} and ${typeof b}`, 'TypeError', 0, this.callStack);
                    }
                    if (typeof a !== typeof b) {
                        throw new SeedLangError(`Type mismatch: cannot add ${typeof a} to ${typeof b}`, 'TypeError', 0, this.callStack);
                    }
                    this.stack.push(safeAddValues(a, b));
                } else {
                    this.stack.push(safeAddValues(a, b));
                }
                break; 
            }
            case OP.ADD_NUM: { 
                const b = normalizeNumericOperand(this.stack.pop()), a = normalizeNumericOperand(this.stack.pop());
                this.stack.push(a + b);
                break; 
            }
            case OP.SUB: { 
                const b = normalizeNumericOperand(this.stack.pop()), a = normalizeNumericOperand(this.stack.pop());
                if (this.strict && typeof a !== 'number') {
                    throw new SeedLangError(`Cannot subtract ${typeof a} and ${typeof b}`, 'TypeError', 0, this.callStack);
                }
                this.stack.push(a - b); 
                break; 
            }
            case OP.MUL: { 
                const b = this.stack.pop(), a = this.stack.pop();
                if (typeof a === 'string' && a.length === 1 && typeof b === 'number') {
                    this.stack.push(a.charCodeAt(0) * b);
                } else if (typeof b === 'string' && b.length === 1 && typeof a === 'number') {
                    this.stack.push(a * b.charCodeAt(0));
                } else if (typeof a === 'string') {
                    this.stack.push(safeRepeatString(a, b));
                } else if (this.strict && typeof a !== 'number') {
                    throw new SeedLangError(`Cannot multiply ${typeof a} and ${typeof b}`, 'TypeError', 0, this.callStack);
                } else {
                    this.stack.push(normalizeNumericOperand(a) * normalizeNumericOperand(b));
                }
                break; 
            }
            case OP.DIV: { 
                const b = normalizeNumericOperand(this.stack.pop()), a = normalizeNumericOperand(this.stack.pop());
                if (this.strict && typeof a !== 'number') {
                    throw new SeedLangError(`Cannot divide ${typeof a} by ${typeof b}`, 'TypeError', 0, this.callStack);
                }
                if (b === 0) {
                    throw new SeedLangError('Division by zero', 'RuntimeError', 0, this.callStack);
                }
                this.stack.push(a / b); 
                break; 
            }
            case OP.MOD: { 
                const b = normalizeNumericOperand(this.stack.pop()), a = normalizeNumericOperand(this.stack.pop());
                if (this.strict && typeof a !== 'number') {
                    throw new SeedLangError(`Cannot modulo ${typeof a} and ${typeof b}`, 'TypeError', 0, this.callStack);
                }
                this.stack.push(a % b); 
                break; 
            }
            case OP.NEG: this.stack.push(-this.stack.pop()); break;
            
            case OP.EQ: { const b = this.stack.pop(); this.stack.push(seedEquals(this.stack.pop(), b)); break; }
            case OP.NE: { const b = this.stack.pop(); this.stack.push(!seedEquals(this.stack.pop(), b)); break; }
            case OP.LT: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a < b); break; }
            case OP.LE: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a <= b); break; }
            case OP.GT: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a > b); break; }
            case OP.GE: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a >= b); break; }
            case 158: { const b = this.stack.pop(), a = this.stack.pop(); const off = this.code[this.ip++]; if (!(a < b)) this.ip += off; break; }
            case 159: { const b = this.stack.pop(), a = this.stack.pop(); const off = this.code[this.ip++]; if (!(a <= b)) this.ip += off; break; }
            case 160: { const b = this.stack.pop(), a = this.stack.pop(); const off = this.code[this.ip++]; if (!(a > b)) this.ip += off; break; }
            case 161: { const b = this.stack.pop(), a = this.stack.pop(); const off = this.code[this.ip++]; if (!(a >= b)) this.ip += off; break; }
            
            case OP.AND: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a && b); break; }
            case OP.OR: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a || b); break; }
            case OP.NOT: this.stack.push(!this.stack.pop()); break;
            
            case OP.BITAND: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a & b); break; }
            case OP.BITOR: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a | b); break; }
            case OP.BITXOR: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a ^ b); break; }
            case OP.BITNOT: this.stack.push(~this.stack.pop()); break;
            case OP.SHL: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a << b); break; }
            case OP.SHR: { const b = this.stack.pop(), a = this.stack.pop(); this.stack.push(a >> b); break; }
            
            case OP.ARRAY: {
                const n = this.code[this.ip++];
                const limA = enforceAggregateCount(this, n, 'array literal');
                if (limA) return _runFromIpAggregateFail(this, limA);
                if (this.stack.length < n) return _runFromIpAggregateFail(this, 'operand stack underflow');
                const a = hardenArrayObject(new Array(n));
                for (let i = n - 1; i >= 0; i--) a[i] = this.stack.pop();
                this.stack.push(a);
                break;
            }
            case OP.OBJECT: {
                const n = this.code[this.ip++];
                const limO = enforceAggregateCount(this, n, 'object literal');
                if (limO) return _runFromIpAggregateFail(this, limO);
                if (this.stack.length < 2 * n) return _runFromIpAggregateFail(this, 'operand stack underflow');
                const o = Object.create(null);
                const entries = new Array(n);
                for (let i = n - 1; i >= 0; i--) {
                    const v = this.stack.pop(), k = this.stack.pop();
                    entries[i] = { k, v };
                }
                let mergedKeys = 0;
                for (let i = 0; i < n; i++) {
                    const { k, v } = entries[i];
                    if (k === OBJECT_SPREAD_MARKER) {
                        if (v && typeof v === 'object') {
                            const spreadKeys = Object.keys(v).filter((sk) => !isDangerousObjectKey(sk));
                            const limS = enforceAggregateMerge(this, mergedKeys, spreadKeys.length, 'object literal (spread)');
                            if (limS) return _runFromIpAggregateFail(this, limS);
                            mergedKeys += spreadKeys.length;
                            for (let si = 0; si < spreadKeys.length; si++) {
                                const sk = spreadKeys[si];
                                o[sk] = v[sk];
                            }
                        }
                    } else {
                        if (isDangerousObjectKey(k)) continue;
                        const limK = enforceAggregateMerge(this, mergedKeys, 1, 'object literal');
                        if (limK) return _runFromIpAggregateFail(this, limK);
                        mergedKeys += 1;
                        o[k] = v;
                    }
                }
                this.stack.push(o);
                break;
            }
            case OP.GET: {
                const k = this.stack.pop(), o = this.stack.pop();
                if (o?._type === 'coroutine' && o._values && typeof k === 'number') {
                    const v = o._values[k];
                    this.stack.push(v !== undefined ? v : null);
                    break;
                }
                if (Array.isArray(o) && typeof k === 'number') {
                    const v = o[k];
                    this.stack.push(v !== undefined ? v : null);
                    break;
                }
                if (typeof o === 'string' && typeof k === 'number') {
                    const v = o[k];
                    this.stack.push(v !== undefined ? v : null);
                    break;
                }
                if (o && o._type === undefined && typeof k === 'number') {
                    let v = o[k];
                    if (v === undefined) v = o[String(k)];
                    if (typeof v === 'function') this.stack.push((args) => v.call(o, args));
                    else this.stack.push(v !== undefined ? v : null);
                    break;
                }
                if (isDangerousObjectKey(k)) {
                    this.stack.push(null);
                    break;
                }
                if (Array.isArray(o)) {
                    this.stack.push(o[k] ?? null);
                } else if (typeof o === 'string' && typeof k === 'number') {
                    this.stack.push(o[k] ?? null);
                } else if (o?._type === 'instance') {
                    if (!canAccessInstanceKey(this, o, k)) {
                        this.stack.push(null);
                        break;
                    }
                    let method = o._methods[k];
                    let superClass = o._superClass;
                    while (!method && superClass) {
                        const parentClass = this.globals[superClass];
                        if (parentClass?._type === 'class') {
                            method = parentClass.methods[k];
                            superClass = parentClass.superClass;
                        } else {
                            break;
                        }
                    }
                    if (method) {
                        this.stack.push({ _type: method.fiber ? 'fiber_method' : 'method', instance: o, method: method });
                    } else {
                        this.stack.push(o[k] ?? null);
                    }
                } else if (o?._type === 'class') {
                    const method = o.methods?.[k];
                    if (method) {
                        this.stack.push({ _type: method.fiber ? 'fiber_method' : 'method', instance: null, method, classObj: o });
                    } else {
                        this.stack.push(o[k] ?? null);
                    }
                } else if (o?._type === 'coroutine') {
                    if (k === 'resume') {
                        this.stack.push((args) => this._coroutineResume(o, args?.[0]));
                    } else if (k === 'status') {
                        this.stack.push((args) => this._coroutineStatus(o));
                    } else if (k === 'done') {
                        this.stack.push((args) => o.state === 'done');
                    } else {
                        this.stack.push(o[k] ?? null);
                    }
                } else if (o?._type === 'module') {
                    const fn = o.exports[k];
                    if (typeof fn === 'function') {
                        this.stack.push((args) => fn(args));
                    } else {
                        this.stack.push(fn ?? null);
                    }
                } else {
                    this.stack.push(o?.[k] ?? null);
                }
                break;
            }
            case OP.GET_CONST: {
                const k = this.consts[this.code[this.ip++]];
                const o = this.stack.pop();
                if (Array.isArray(o) && typeof k === 'number') {
                    const v = o[k];
                    this.stack.push(v !== undefined ? v : null);
                    break;
                }
                if (typeof o === 'string' && typeof k === 'number') {
                    const v = o[k];
                    this.stack.push(v !== undefined ? v : null);
                    break;
                }
                if (o && o._type === undefined && typeof k === 'number') {
                    let v = o[k];
                    if (v === undefined) v = o[String(k)];
                    if (typeof v === 'function') this.stack.push((args) => v.call(o, args));
                    else this.stack.push(v !== undefined ? v : null);
                    break;
                }
                if (isDangerousObjectKey(k)) {
                    this.stack.push(null);
                    break;
                }
                if (Array.isArray(o)) {
                    this.stack.push(o[k] ?? null);
                } else if (typeof o === 'string' && typeof k === 'number') {
                    this.stack.push(o[k] ?? null);
                } else if (o?._type === 'instance') {
                    if (!canAccessInstanceKey(this, o, k)) {
                        this.stack.push(null);
                        break;
                    }
                    let method = o._methods[k];
                    let superClass = o._superClass;
                    while (!method && superClass) {
                        const parentClass = this.globals[superClass];
                        if (parentClass?._type === 'class') {
                            method = parentClass.methods[k];
                            superClass = parentClass.superClass;
                        } else {
                            break;
                        }
                    }
                    if (method) {
                        this.stack.push({ _type: method.fiber ? 'fiber_method' : 'method', instance: o, method: method });
                    } else {
                        this.stack.push(o[k] ?? null);
                    }
                } else if (o?._type === 'class') {
                    const method = o.methods?.[k];
                    if (method) {
                        this.stack.push({ _type: method.fiber ? 'fiber_method' : 'method', instance: null, method, classObj: o });
                    } else {
                        this.stack.push(o[k] ?? null);
                    }
                } else if (o?._type === 'coroutine') {
                    if (k === 'resume') {
                        this.stack.push((args) => this._coroutineResume(o, args?.[0]));
                    } else if (k === 'status') {
                        this.stack.push((args) => this._coroutineStatus(o));
                    } else if (k === 'done') {
                        this.stack.push((args) => o.state === 'done');
                    } else {
                        this.stack.push(o[k] ?? null);
                    }
                } else if (o?._type === 'module') {
                    const fn = o.exports[k];
                    if (typeof fn === 'function') {
                        this.stack.push((args) => fn(args));
                    } else {
                        this.stack.push(fn ?? null);
                    }
                } else {
                    this.stack.push(o?.[k] ?? null);
                }
                break;
            }
            case OP.SET: {
                const o = this.stack.pop(), k = this.stack.pop(), v = this.stack.pop();
                if (o && !isDangerousObjectKey(k) && canAccessInstanceKey(this, o, k)) {
                    if (o._type === 'closure' && o._selfObject) o._selfObject[k] = v;
                    else o[k] = v;
                }
                this.stack.push(v);
                break;
            }
            case OP.ARRAY_SET: {
                const o = this.stack.pop(), k = this.stack.pop(), v = this.stack.pop();
                if (isDangerousObjectKey(k)) {
                    this.stack.push(v);
                    break;
                }
                if (Array.isArray(o)) {
                    if (isSafeArrayIndex(k, this._maxArrayIndex)) o[k] = v;
                } else if (o) {
                    if (canAccessInstanceKey(this, o, k)) o[k] = v;
                }
                this.stack.push(v);
                break;
            }
            case OP.FOR_NESTED_MUL_SUM: {
                const sumGi = this.code[this.ip++], iGi = this.code[this.ip++], jGi = this.code[this.ip++], iStartCi = this.code[this.ip++], iEndCi = this.code[this.ip++], jStartCi = this.code[this.ip++], jEndCi = this.code[this.ip++];
                const iStart = this.consts[iStartCi], iEnd = this.consts[iEndCi], jStart = this.consts[jStartCi], jEnd = this.consts[jEndCi];
                const nJ = jEnd - jStart;
                const sumI = ((iStart + (iEnd - 1)) * (iEnd - iStart)) / 2;
                const sumJ = ((jStart + (jEnd - 1)) * (jEnd - jStart)) / 2;
                this._globalVals[sumGi] = nJ * sumI + (iEnd - iStart) * sumJ;
                this._globalVals[iGi] = iEnd;
                this._globalVals[jGi] = jEnd;
                break;
            }
            case OP.FOR_SUM_RANGE_PUSH: {
                const sumGi = this.code[this.ip++], idxGi = this.code[this.ip++], startCi = this.code[this.ip++], endCi = this.code[this.ip++];
                const s = this.consts[startCi], e = this.consts[endCi];
                const n = e - s;
                this._globalVals[sumGi] = (this._globalVals[sumGi] ?? 0) + (n * (s + (e - 1)) / 2);
                this._globalVals[idxGi] = e;
                break;
            }
            case OP.FOR_COUNT_EVEN: {
                const countGi = this.code[this.ip++], idxGi = this.code[this.ip++], endCi = this.code[this.ip++];
                const end = this.consts[endCi];
                const start = this._globalVals[idxGi];
                const parity = ((start % 2) + 2) % 2;
                const first = parity === 0 ? start : start + 1;
                const delta = first >= end ? 0 : Math.floor((end - first + 1) / 2);
                this._globalVals[countGi] = (this._globalVals[countGi] ?? 0) + delta;
                this._globalVals[idxGi] = end;
                break;
            }
            case OP.FOR_INDEX_ASSIGN: {
                const arrGi = this.code[this.ip++], idxGi = this.code[this.ip++], startCi = this.code[this.ip++], endCi = this.code[this.ip++];
                const start = this.consts[startCi];
                const end = this.consts[endCi];
                const arr = this._globalVals[arrGi];
                if (Array.isArray(arr)) {
                    if (arr.length < end) arr.length = end;
                    for (let i = start; i < end; i++) arr[i] = i;
                } else if (arr) {
                    for (let i = start; i < end; i++) arr[i] = i;
                }
                this._globalVals[idxGi] = end;
                break;
            }
            case OP.SET_LEN_GLOBAL_CONST: {
                const gi = this.code[this.ip++], ci = this.code[this.ip++];
                const o = this._globalVals[gi];
                if (o) o.length = this.consts[ci];
                break;
            }
            case OP.FOR_PUSH_RANGE: {
                const arrMode = this.code[this.ip++], arrRef = this.code[this.ip++], idxMode = this.code[this.ip++], idxRef = this.code[this.ip++], startCi = this.code[this.ip++], endCi = this.code[this.ip++];
                const start = this.consts[startCi];
                const end = this.consts[endCi];
                const n = end - start;
                const arr = arrMode ? this.stack[this._fp + arrRef] : this._globalVals[arrRef];
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
                if (idxMode) this.stack[this._fp + idxRef] = end;
                else this._globalVals[idxRef] = end;
                break;
            }
            case OP.FOR_ARRAY_SUM: {
                const sumGi = this.code[this.ip++], idxGi = this.code[this.ip++], arrGi = this.code[this.ip++], nGi = this.code[this.ip++];
                const arr = this._globalVals[arrGi];
                const limit = this._globalVals[nGi];
                const span = Number.isInteger(limit) && limit > 0 ? limit : 0;
                let sum = this._globalVals[sumGi] ?? 0;
                if (Array.isArray(arr) && span > 0) {
                    const len = arr.length < span ? arr.length : span;
                    for (let i = 0; i < len; i++) sum += arr[i];
                }
                this._globalVals[sumGi] = sum;
                this._globalVals[idxGi] = limit;
                break;
            }
            case OP.FOR_PUSH_RANGE_VAR: {
                const arrGi = this.code[this.ip++], idxGi = this.code[this.ip++], nGi = this.code[this.ip++];
                const arr = this._globalVals[arrGi];
                const limit = this._globalVals[nGi];
                const span = Number.isInteger(limit) && limit > 0 ? limit : 0;
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
                this._globalVals[idxGi] = limit;
                break;
            }
            case OP.FOR_ARRAY_SUM_LIT: {
                const sumGi = this.code[this.ip++], idxGi = this.code[this.ip++], arrGi = this.code[this.ip++], nCi = this.code[this.ip++];
                const arr = this._globalVals[arrGi];
                const limit = this.consts[nCi];
                const span = Number.isInteger(limit) && limit > 0 ? limit : 0;
                let sum = this._globalVals[sumGi] ?? 0;
                if (Array.isArray(arr) && span > 0) {
                    const len = arr.length < span ? arr.length : span;
                    for (let i = 0; i < len; i++) sum += arr[i];
                }
                this._globalVals[sumGi] = sum;
                this._globalVals[idxGi] = limit;
                break;
            }
            case OP.MAKE_RANGE_ARRAY: {
                const endCi = this.code[this.ip++];
                const end = this.consts[endCi];
                const n = Number.isInteger(end) && end > 0 ? end : 0;
                const limR = enforceAggregateCount(this, n, 'range array');
                if (limR) return _runFromIpAggregateFail(this, limR);
                const arr = new Array(n);
                for (let i = 0; i < n; i++) arr[i] = i;
                this.stack.push(arr);
                break;
            }
            
            case OP.JUMP: { const off = this.code[this.ip]; this.ip += off + 1; break; }
            case OP.JUMP_FALSE: { const off = this.code[this.ip]; if (!this.stack.pop()) this.ip += off + 1; else this.ip++; break; }
            
            case OP.CALL0: {
                const fn = this.stack.pop();
                if (typeof fn === 'function') {
                    this.stack.push(fn([]));
                } else if (fn?._type === 'coroutine_def') {
                    this.stack.push(_createCoroutineFromDef(fn.def, []));
                } else if (fn?._type === 'fiber_method') {
                    this.stack.push(_createCoroutineFromMethod(fn.method, fn.instance, []));
                } else if (fn?._type === 'class') {
                    this.stack.push(instantiateClassObject(this, fn, []));
                } else if (_isFiberClosure(fn)) {
                    this.stack.push(_createCoroutineFromClosure(fn, []));
                } else if (fn?._type === 'closure') {
                    const fnCaptured = fn.capturedVars;
                    const hasCaptured = !!(fnCaptured && typeof fnCaptured === 'object' && Object.keys(fnCaptured).length > 0);
                    const fnShared = fn.sharedCaptured;
                    const hasSharedCaptured = !fn._noCapture && !!(fnShared && typeof fnShared === 'object' && Object.keys(fnShared).length > 0);
                    if (hasCaptured || hasSharedCaptured) {
                        this.stack.push(this.callClosure(fn, []));
                        break;
                    }
                    const savedStack = this.stack;
                    const savedLocals = this.locals;
                    const savedCapturedVars = this.capturedVars;
                    const savedFp = this._fp;
                    if (this._frameTop >= MAX_FRAME_DEPTH) {
                        this.stack.push(fn);
                        return { success: false, error: 'stack overflow', output: this.output };
                    }
                    this.stack = [];
                    this._fp = 0;
                    this.locals = [{}];
                    this.capturedVars = prepareCallCapturedVars(fn) || {};
                    const frame = { ip: this.ip, stack: savedStack, locals: savedLocals, capturedVars: savedCapturedVars, sharedCaptured: this.sharedCaptured, fp: savedFp };
                    this.frames = (this.frames || []);
                    this.frames.push(frame);
                    const ft = this._frameTop++;
                    this._fr.ips[ft] = this.ip;
                    this._fr.fps[ft] = savedFp;
                    this._fr.sps[ft] = 0;
                    this._fr.locals[ft] = savedLocals;
                    this._fr.simple[ft] = 0;
                    this._fr.cvArrs[ft] = null;
                    this._fr.closures[ft] = null;
                    this._fr.capturedVars[ft] = savedCapturedVars;
                    this._fr.sharedCaptured[ft] = this.sharedCaptured;
                    this._fr.codes[ft] = null;
                    this._fr.stacks[ft] = savedStack;
                    this.ip = fn._start !== undefined ? fn._start : fn.start;
                } else {
                    this.stack.push(null);
                }
                break;
            }
            
            case OP.CALL_GLOBAL_CONST1: {
                const gi = this.code[this.ip++];
                const ci = this.code[this.ip++];
                const varName = this.vars[gi];
                const mappedGi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined;
                const readGi = (this._globalVals && typeof mappedGi === 'number') ? mappedGi : gi;
                let fn = this._globalVals ? this._globalVals[readGi] : undefined;
                if (fn === undefined || fn === null) {
                    fn = this.globals[varName];
                    if (fn === undefined || fn === null) fn = this.builtins[varName];
                    if (this._globalVals) this._globalVals[readGi] = fn;
                }
                const argVal = this.consts[ci];
                if (fn?._type === 'closure') {
                    const savedStack = this.stack;
                    const savedLocals = this.locals;
                    const savedCapturedVars = this.capturedVars;
                    const savedSharedCaptured = this.sharedCaptured;
                    const savedFp = this._fp;
                    this.stack = [argVal];
                    this._fp = 0;
                    const localScope = {};
                    let localIdx = 0;
                    (fn._funcRef?.params||fn.params).forEach((p, i) => {
                        localScope[p] = localIdx++;
                    });
                    this.locals = localScope;
                    this.capturedVars = prepareCallCapturedVars(fn);
                    this.sharedCaptured = null;
                    const savedCode = this.code;
                    const savedConsts = this.consts;
                    const savedVars = this.vars;
                    const savedIp = this.ip;
                    const fnCtx = fn._ctx;
                    this.code = fnCtx ? fnCtx[0] : fn.code;
                    this.consts = fnCtx ? fnCtx[1] : fn.consts;
                    this.vars = fnCtx ? fnCtx[2] : fn.vars || [];
                    this.ip = fn._start !== undefined ? fn._start : 0;
                    while (true) {
                        const subOp = this.code[this.ip++];
                        if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                        if (_RETURN_OPS.has(subOp)) {
                            if (_COMPUTED_RETURN_OPS.has(subOp)) this._executeOpInline(subOp);
                            break;
                        }
                        this._executeOpInline(subOp);
                    }
                    const result = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
                    this.stack = savedStack;
                    this.locals = savedLocals;
                    this.capturedVars = savedCapturedVars;
                    this.sharedCaptured = savedSharedCaptured;
                    this._fp = savedFp;
                    this.code = savedCode;
                    this.consts = savedConsts;
                    this.vars = savedVars;
                    this.ip = savedIp;
                    this.stack.push(result);
                } else if (fn?._type === 'class') {
                    this.stack.push(instantiateClassObject(this, fn, [argVal]));
                } else if (typeof fn === 'function') {
                    this.stack.push(fn([argVal]));
                } else {
                    this.stack.push(null);
                }
                break;
            }
            case OP.CALL_GLOBAL_CONST2: {
                const gi = this.code[this.ip++];
                const ci1 = this.code[this.ip++];
                const ci2 = this.code[this.ip++];
                const varName = this.vars[gi];
                const mappedGi = this._globalNameIdx ? this._globalNameIdx.get(varName) : undefined;
                const readGi = (this._globalVals && typeof mappedGi === 'number') ? mappedGi : gi;
                let fn = this._globalVals ? this._globalVals[readGi] : undefined;
                if (fn === undefined || fn === null) {
                    fn = this.globals[varName];
                    if (fn === undefined || fn === null) fn = this.builtins[varName];
                    if (this._globalVals) this._globalVals[readGi] = fn;
                }
                if (fn && fn._type === 'closure') {
                    const argVal1 = this.consts[ci1];
                    const argVal2 = this.consts[ci2];
                    const savedStack = this.stack;
                    const savedLocals = this.locals;
                    const savedCapturedVars = this.capturedVars;
                    const savedSharedCaptured = this.sharedCaptured;
                    const savedFp = this._fp;
                    this.stack = [argVal1, argVal2];
                    this._fp = 0;
                    const localScope = {};
                    let localIdx = 0;
                    (fn._funcRef?.params||fn.params).forEach((p, i) => {
                        localScope[p] = localIdx++;
                    });
                    this.locals = [localScope];
                    this.capturedVars = prepareCallCapturedVars(fn);
                    this.sharedCaptured = null;
                    const savedCode = this.code;
                    const savedConsts = this.consts;
                    const savedVars = this.vars;
                    const savedIp = this.ip;
                    const fnCtx = fn._ctx;
                    const fnCode = fnCtx ? fnCtx[0] : fn.code;
                    const fnConsts = fnCtx ? fnCtx[1] : fn.consts;
                    const fnVars = fnCtx ? fnCtx[2] : fn.vars;
                    this.code = fnCode || fn.code;
                    this.consts = fnConsts || fn.consts;
                    this.vars = fnVars || fn.vars || [];
                    this.ip = fn._start !== undefined ? fn._start : (fn.start || 0);
                    while (true) {
                        const subOp = this.code[this.ip++];
                        if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                        if (_RETURN_OPS.has(subOp)) {
                            if (_COMPUTED_RETURN_OPS.has(subOp)) this._executeOpInline(subOp);
                            break;
                        }
                        this._executeOpInline(subOp);
                    }
                    const result = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
                    this.stack = savedStack;
                    this.locals = savedLocals;
                    this.capturedVars = savedCapturedVars;
                    this.sharedCaptured = savedSharedCaptured;
                    this._fp = savedFp;
                    this.code = savedCode;
                    this.consts = savedConsts;
                    this.vars = savedVars;
                    this.ip = savedIp;
                    this.stack.push(result);
                } else if (fn?._type === 'class') {
                    const argVal1 = this.consts[ci1];
                    const argVal2 = this.consts[ci2];
                    this.stack.push(instantiateClassObject(this, fn, [argVal1, argVal2]));
                } else if (typeof fn === 'function') {
                    this.stack.push(fn([this.consts[ci1], this.consts[ci2]]));
                } else {
                    this.stack.push(null);
                }
                break;
            }
            case OP.CALL: {
                const n = this.code[this.ip++];
                const fnIdx = this.stack.length - n - 1;
                const fn = this.stack[fnIdx];
                this._lastRunFullCallKind = fn?._type || typeof fn;
                this._lastRunFullCallArity = n;
                let args;
                if (n === 0) args = undefined;
                else if (n === 1) args = [this.stack[fnIdx + 1]];
                else if (n === 2) args = [this.stack[fnIdx + 1], this.stack[fnIdx + 2]];
                else if (n === 3) args = [this.stack[fnIdx + 1], this.stack[fnIdx + 2], this.stack[fnIdx + 3]];
                else {
                    args = new Array(n);
                    for (let i = 0; i < n; i++) args[i] = this.stack[fnIdx + 1 + i];
                }
                this.stack.length = fnIdx;
                if (n === 1 && typeof fn === 'function') {
                    const fastBuiltinResult = _tryFastBuiltinUnaryCall(fn, args[0], this.builtins);
                    if (fastBuiltinResult !== _NO_FAST_BUILTIN) {
                        this.stack.push(fastBuiltinResult);
                        break;
                    }
                }
                if (fn?._type === 'closure' && n === 1 && Array.isArray(args[0])) {
                    const fnParams = fn._funcRef?.params || fn.params || [];
                    if (fnParams.length > 1) args = args[0];
                }
                
                if (typeof fn === 'function') {
                    this.stack.push(fn(args || []));
                } else if (fn?._type === 'coroutine_def') {
                    this.stack.push(_createCoroutineFromDef(fn.def, args || []));
                } else if (fn?._type === 'fiber_method') {
                    this.stack.push(_createCoroutineFromMethod(fn.method, fn.instance, args || []));
                } else if (fn?._type === 'class') {
                    this.stack.push(instantiateClassObject(this, fn, args || []));
                } else if (_isFiberClosure(fn)) {
                    this.stack.push(_createCoroutineFromClosure(fn, args || []));
                } else if (fn?._type === 'closure') {
                    this.stack.push(this.callClosure(fn, args || []));
                } else if (fn?._type === 'module') {
                    const m = this.stack.pop();
                    this.stack.push(typeof fn.exports[m] === 'function' ? fn.exports[m](args) : fn.exports[m]);
                } else {
                    this.stack.push(null);
                }
                break;
            }
            case OP.RETURN_LOCAL: {
                const idx = this.code[this.ip++];
                const v = this.stack[idx] ?? null;
                if (this.frames?.length) {
                    const frame = this.frames.pop();
                    this.stack = frame.stack;
                    this.locals = frame.locals;
                    this.capturedVars = frame.capturedVars;
                    this.sharedCaptured = frame.sharedCaptured;
                    this._fp = frame.fp;
                    const ft = --this._frameTop;
                    this.ip = this._fr.ips[ft];
                } else {
                    this.ip++;
                }
                this.stack.push(v);
                break;
            }
            case OP.RETURN: {
                const v = this.stack.length > 0 ? this.stack.pop() : null;
                if (this.frames?.length) {
                    const frame = this.frames.pop();
                    this.ip = frame.ip;
                    this.stack = frame.stack;
                    this.locals = frame.locals;
                    this.capturedVars = frame.capturedVars;
                    this.sharedCaptured = frame.sharedCaptured || null;
                    this._fp = frame.fp || 0;
                    this.stack.push(v);
                } else {
                    return { success: true, output: this.output, returnValue: v };
                }
                break;
            }
            case OP.CLOSURE: {
                const f = this.consts[this.code[this.ip++]];
                const captured = {};
                const fCaptured = f?.capturedVars;
                const selfCaptureIdx = Array.isArray(fCaptured) && f && f.name ? fCaptured.indexOf(f.name) : -1;
                
                if (this.sharedCaptured) {
                    for (const varName in this.sharedCaptured) {
                        captured[varName] = this.sharedCaptured[varName];
                    }
                }
                
                if (this.locals && Array.isArray(this.locals)) {
                    for (let i = this.locals.length - 1; i >= 0; i--) {
                        const scope = this.locals[i];
                        for (const varName in scope) {
                            const idx = scope[varName];
                            if (idx === undefined) continue;
                            const val = this.stack[this._fp + idx];
                            if (val === undefined) continue;
                            let nextBox = null;
                            if (this.capturedVars && !Array.isArray(this.capturedVars)) {
                                const inherited = this.capturedVars[varName];
                                if (inherited && typeof inherited === 'object' && Object.prototype.hasOwnProperty.call(inherited, 'value')) {
                                    inherited.value = val;
                                    nextBox = inherited;
                                }
                            }
                            if (!nextBox) nextBox = { value: val };
                            if (!this.capturedVars || Array.isArray(this.capturedVars)) this.capturedVars = {};
                            this.capturedVars[varName] = nextBox;
                            if (!this.sharedCaptured || Array.isArray(this.sharedCaptured)) this.sharedCaptured = {};
                            if (this.sharedCaptured && !Array.isArray(this.sharedCaptured)) this.sharedCaptured[varName] = nextBox;
                            captured[varName] = nextBox;
                        }
                    }
                }
                if (this.capturedVars) {
                    for (const varName in this.capturedVars) {
                        if (!(varName in captured)) {
                            captured[varName] = this.capturedVars[varName];
                        }
                    }
                }
                const closure = createRuntimeClosure(this, f, captured, this.sharedCaptured);
                if (selfCaptureIdx >= 0 && f && f.name) {
                    if (!this.sharedCaptured) this.sharedCaptured = {};
                    let selfBox = captured[f.name];
                    if (!selfBox || typeof selfBox !== 'object' || !Object.prototype.hasOwnProperty.call(selfBox, 'value')) {
                        selfBox = this.sharedCaptured[f.name] || { value: undefined };
                        this.sharedCaptured[f.name] = selfBox;
                        captured[f.name] = selfBox;
                    }
                    selfBox.value = closure;
                }
                this.stack.push(closure);
                break;
            }
            
            case OP.PRINT: { const ps = this.str(this.stack.pop()); if (!this.output) this.output = []; this.output.push(ps); break; }
            case OP.IMPORT: {
                const name = this.stack.pop();
                const imported = this._resolveImportModule(name);
                if (!imported.ok) return { success: false, error: imported.error, output: this.output };
                this.stack.push(imported.value);
                break;
            }
            case OP.CALL_BUILTIN: {
                const name = this.consts[this.code[this.ip++]];
                const n = this.code[this.ip++];
                if (name === 'push' && n === 2) {
                    const v = this.stack.pop();
                    const arr = this.stack.pop();
                    if (Array.isArray(arr)) {
                        arr[arr.length] = v;
                        this.stack.push(arr);
                    } else {
                        this.stack.push(null);
                    }
                    break;
                }
                let args;
                if (n === 0) args = [];
                else if (n === 1) { const a0 = this.stack.pop(); args = [a0]; }
                else if (n === 2) { const a1 = this.stack.pop(); const a0 = this.stack.pop(); args = [a0, a1]; }
                else if (n === 3) { const a2 = this.stack.pop(); const a1 = this.stack.pop(); const a0 = this.stack.pop(); args = [a0, a1, a2]; }
                else {
                    args = new Array(n);
                    for (let i = n - 1; i >= 0; i--) args[i] = this.stack.pop();
                }
                const fn = this.builtins[name];
                if (fn) {
                    try { this.stack.push(fn(args)); }
                    catch(_) { this.stack.push(null); }
                } else {
                    this.stack.push(null);
                }
                break;
            }
            
            case OP.TRY: {
                const offset = this.code[this.ip++];
                this.tryStack = this.tryStack || [];
                this.tryStack.push({
                    catchIp: offset >= 0 ? this.ip + offset : null,
                    finallyIp: null,
                    used: false,
                    pendingThrow: null,
                    inFinally: false
                });
                break;
            }
            case OP.SET_FINALLY: {
                const offset = this.code[this.ip++];
                if (this.tryStack?.length) {
                    const handler = this.tryStack[this.tryStack.length - 1];
                    handler.finallyIp = this.ip + offset;
                }
                break;
            }
            case OP.THROW: {
                const error = this.stack.pop();
                if (this.tryStack?.length) {
                    while (this.tryStack.length > 0) {
                        const handler = this.tryStack[this.tryStack.length - 1];
                        if (handler.catchIp !== null && !handler.used) {
                            handler.used = true;
                            this.stack.push(error);
                            this.ip = handler.catchIp;
                            break;
                        }
                        if (handler.finallyIp !== null && !handler.inFinally) {
                            handler.pendingThrow = error;
                            handler.inFinally = true;
                            this.ip = handler.finallyIp;
                            break;
                        }
                        this.tryStack.pop();
                    }
                    if (this.tryStack.length > 0) break;
                }
                return { success: false, error: String(error), output: this.output };
            }
            case OP.END_TRY: {
                if (this.tryStack?.length) {
                    this.tryStack.pop();
                }
                break;
            }
            case OP.END_FINALLY: {
                if (this.tryStack?.length) {
                    const handler = this.tryStack[this.tryStack.length - 1];
                    const pendingError = handler.pendingThrow;
                    this.tryStack.pop();
                    if (pendingError !== null && pendingError !== undefined) {
                        if (this.tryStack?.length) {
                            let routed = false;
                            while (this.tryStack.length > 0) {
                                const outer = this.tryStack[this.tryStack.length - 1];
                                if (outer.catchIp !== null && !outer.used) {
                                    outer.used = true;
                                    this.stack.push(pendingError);
                                    this.ip = outer.catchIp;
                                    routed = true;
                                    break;
                                }
                                if (outer.finallyIp !== null && !outer.inFinally) {
                                    outer.pendingThrow = pendingError;
                                    outer.inFinally = true;
                                    this.ip = outer.finallyIp;
                                    routed = true;
                                    break;
                                }
                                this.tryStack.pop();
                            }
                            if (routed) break;
                        }
                        return { success: false, error: String(pendingError), output: this.output };
                    }
                }
                break;
            }
            case OP.CATCH: {
                break;
            }
            case OP.ASYNC: {
                const v = this.stack.pop();
                const p = Promise.resolve(v);
                p.__resolvedValue = v;
                this.stack.push(p);
                break;
            }
            case OP.AWAIT: {
                const v = this.stack.pop();
                if (v && v.__resolvedValue !== undefined) {
                    this.stack.push(v.__resolvedValue);
                } else if (v && typeof v.then === 'function') {
                    this._sp = this.stack.length;
                    return { 
                        success: true, 
                        output: this.output, 
                        pending: v,
                        state: this._saveState()
                    };
                } else {
                    this.stack.push(v);
                }
                break;
            }
            
            case OP.ARRAY_PUSH: {
                const val = this.stack.pop();
                const arr = this.stack[this.stack.length - 1];
                if (Array.isArray(arr)) {
                    arr[arr.length] = val;
                } else {
                    this.stack[this.stack.length - 1] = null;
                }
                break;
            }
            case OP.ARRAY_PUSH_POP: {
                const val = this.stack.pop();
                const arr = this.stack.pop();
                if (Array.isArray(arr)) {
                    arr[arr.length] = val;
                }
                break;
            }
            case OP.ARRAY_GET: {
                const idx = this.stack.pop();
                const arr = this.stack[this.stack.length - 1];
                if (Array.isArray(arr) && Number.isInteger(idx) && idx >= 0 && idx < arr.length) {
                    this.stack[this.stack.length - 1] = arr[idx];
                    break;
                }
                if (typeof idx === 'number') {
                    if (Array.isArray(arr) || typeof arr === 'string') {
                        this.stack[this.stack.length - 1] = arr[idx] ?? null;
                        break;
                    }
                    if (arr && arr._type === undefined) {
                        let v = arr[idx];
                        if (v === undefined) v = arr[String(idx)];
                        this.stack[this.stack.length - 1] = v ?? null;
                        break;
                    }
                }
                if (isDangerousObjectKey(idx)) {
                    this.stack[this.stack.length - 1] = null;
                    break;
                }
                if (Array.isArray(arr)) {
                    this.stack[this.stack.length - 1] = arr[idx] ?? null;
                } else if (typeof arr === 'string' && typeof idx === 'number') {
                    this.stack[this.stack.length - 1] = arr[idx] ?? null;
                } else if (arr && (typeof idx === 'string' || typeof idx === 'number')) {
                    const key = typeof idx === 'number' ? String(idx) : idx;
                    this.stack[this.stack.length - 1] = arr[key] ?? null;
                } else {
                    this.stack[this.stack.length - 1] = null;
                }
                break;
            }
            case OP.ARRAY_LEN: {
                const arr = this.stack[this.stack.length - 1];
                if (Array.isArray(arr)) {
                    this.stack[this.stack.length - 1] = arr.length;
                } else if (typeof arr === 'string') {
                    this.stack[this.stack.length - 1] = arr.length;
                } else {
                    this.stack[this.stack.length - 1] = 0;
                }
                break;
            }
            
            case OP.HALT: return { success: true, output: this.output };
            
            case OP.SUPER_CALL: {
                const n = this.code[this.ip++];
                const args = [];
                for (let i = 0; i < n; i++) args.unshift(this.stack.pop());
                
                const instance = this.stack[0];
                if (!instance || instance._type !== 'instance') {
                    this.stack.push(null);
                    break;
                }
                
                const currentClass = this._gv(this.currentClass);
                if (!currentClass || currentClass._type !== 'class') {
                    this.stack.push(null);
                    break;
                }
                
                const superClassName = currentClass.superClass;
                if (!superClassName) {
                    this.stack.push(null);
                    break;
                }
                
                const superClass = this._gv(superClassName);
                if (!superClass || superClass._type !== 'class') {
                    this.stack.push(null);
                    break;
                }
                
                const superConstructor = superClass.methods.init || superClass.methods['__init__'] || superClass.methods.constructor;
                if (superConstructor && superConstructor.code) {
                    const savedCode = this.code;
                    const savedConsts = this.consts;
                    const savedVars = this.vars;
                    const savedIp = this.ip;
                    const savedStackBase = this.stack.length;
                    const savedFrames = this.frames;
                    const savedCurrentClass = this.currentClass;
                    const savedGlobalVals = this._globalVals;
                    const savedFp = this._fp;
                    const savedLocals = this.locals;
                    const savedCapturedVars = this.capturedVars;
                    const savedSharedCaptured = this.sharedCaptured;
                    
                    this.currentClass = superClassName;
                    this.code = superConstructor.code;
                    this.consts = superConstructor.consts;
                    this.vars = superConstructor.vars || [];
                    this.ip = 0;
                    this.stack = [instance];
                    const superCtorParams = superConstructor.params || [];
                    for (let i = 0; i < superCtorParams.length; i++) this.stack.push(args[i]);
                    this.frames = [];
                    this._fp = 0;
                    this.locals = [superConstructor.localScope || {}];
                    this.capturedVars = null;
                    this.sharedCaptured = null;
                    
                    while (true) {
                        const subOp = this.code[this.ip++];
                        if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
                        if (_RETURN_OPS.has(subOp)) {
                            if (_COMPUTED_RETURN_OPS.has(subOp)) this._executeOpInline(subOp);
                            break;
                        }
                        this._executeOpInline(subOp);
                    }
                    
                    this.currentClass = savedCurrentClass;
                    this.stack.length = savedStackBase;
                    this.code = savedCode;
                    this.consts = savedConsts;
                    this.vars = savedVars;
                    this._globalVals = savedGlobalVals;
                    this.ip = savedIp;
                    this.frames = savedFrames;
                    this._fp = savedFp;
                    this.locals = savedLocals;
                    this.capturedVars = savedCapturedVars;
                    this.sharedCaptured = savedSharedCaptured;
                }
                
                this.stack.push(instance);
                break;
            }
            
            case OP.JUMP_FALSE_PEEK: { const off = this.code[this.ip]; if (!this.stack[this.stack.length - 1]) this.ip += off + 1; else this.ip++; break; }
            case OP.YIELD: {
                const value = this.stack.pop();
                return { success: true, output: this.output, yielded: true, value };
            }
            case OP.COROUTINE: {
                const idx = this.code[this.ip++];
                const coroDef = this.consts[idx];
                this.stack.push({ _type: 'coroutine_def', def: coroDef });
                break;
            }
            case OP.RESUME: {
                const coro = this.stack.pop();
                const arg = this.stack.pop();
                
                if (coro?._type !== 'coroutine' || coro.state === 'done') {
                    this.stack.push(null);
                    break;
                }
                
                const result = _resumeCoroutine(this, coro, arg, OP);
                if (result && result._coroError) {
                    this.stack.push(null);
                } else {
                    this.stack.push(result);
                }
                break;
            }
            case OP.MATCH: {
                const cases = this.consts[this.code[this.ip++]];
                const value = this.stack.pop();
                const gv = this._globalVals;
                const v = this._lastBcVars;
                if (gv && v) for (let _i = 0; _i < v.length; _i++) this.globals[v[_i]] = gv[_i];
                const result = this.executeMatch(value, cases);
                this.stack.push(result);
                break;
            }
            case OP.GENERIC_CALL: {
                const n = this.code[this.ip++];
                const args = [];
                for (let i = 0; i < n; i++) args.unshift(this.stack.pop());
                const typeArgs = this.stack.pop();
                const fn = this.stack.pop();
                
                if (fn?._type === 'closure') {
                    const savedStack = this.stack;
                    const savedLocals = this.locals;
                    const savedCapturedVars = this.capturedVars;
                    const savedSharedCaptured = this.sharedCaptured;
                    if (this._frameTop >= MAX_FRAME_DEPTH) {
                        this.stack.push(fn);
                        this.stack.push(typeArgs);
                        for (let i = 0; i < args.length; i++) this.stack.push(args[i]);
                        return { success: false, error: 'stack overflow', output: this.output };
                    }
                    this.stack = [];
                    
                    const localScope = fn.localScope ? { ...fn.localScope } : {};
                    let localIdx = Object.keys(localScope).length;
                    (fn._funcRef?.params||fn.params).forEach((p, i) => {
                        if (!(p in localScope)) {
                            localScope[p] = localIdx++;
                        }
                        this.stack.push(args[i]);
                    });
                    
                    this.locals = [localScope];
                    this.capturedVars = prepareCallCapturedVars(fn) || {};
                    const frame = { ip: this.ip, stack: savedStack, locals: savedLocals, capturedVars: savedCapturedVars, sharedCaptured: savedSharedCaptured };
                    this.frames = (this.frames || []);
                    this.frames.push(frame);
                    const ft = this._frameTop++;
                    this._fr.ips[ft] = this.ip;
                    this._fr.fps[ft] = this._fp || 0;
                    this._fr.sps[ft] = 0;
                    this._fr.locals[ft] = savedLocals;
                    this._fr.simple[ft] = 0;
                    this._fr.cvArrs[ft] = null;
                    this._fr.closures[ft] = null;
                    this._fr.capturedVars[ft] = savedCapturedVars;
                    this._fr.sharedCaptured[ft] = savedSharedCaptured;
                    this._fr.codes[ft] = null;
                    this._fr.stacks[ft] = savedStack;
                    this.ip = fn._start !== undefined ? fn._start : fn.start;
                } else if (typeof fn === 'function') {
                    this.stack.push(fn(args));
                } else {
                    this.stack.push(null);
                }
                break;
            }
            case OP.BREAK:
            case OP.CONTINUE:
                return { success: false, error: `break/continue not within a loop`, output: this.output };
            case OP.PARALLEL: {
                this.ip++;
                this.stack.push(null);
                break;
            }
            case OP.SPAWN: {
                this.ip++;
                this.stack.push(null);
                break;
            }
            case OP.AWAIT_ALL: {
                this.ip++;
                this.stack.push(null);
                break;
            }
            
            default: {
                const prevOp = this.code[this.ip - 2];
                if (op === 8 && prevOp === OP.JUMP) {
                    this._desyncJumpOperandSkips = (this._desyncJumpOperandSkips || 0) + 1;
                    break;
                }
                if (op === undefined || op === OP.HALT) {
                    return { success: true, output: this.output };
                }
                return { success: false, error: `Unknown op: ${op}` };
            }
        }
    }
}
function wireRunFromIp(VMProto) {
    VMProto.runFromIp = runFromIp;
}

module.exports = { runFromIp, wireRunFromIp };