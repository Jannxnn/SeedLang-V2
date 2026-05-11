'use strict';

const { OP } = require('./opcodes');
const { SeedLangError } = require('./errors');
const { safeAddValues, normalizeNumericOperand } = require('./value_ops');
const { prepareCallCapturedVars, resolveCallSharedCaptured, refreshCapturedLocalsFromFrame } = require('./closure_ops');
const { _decodeAmpCompressedString } = require('./amp');
const { ensureOperandHeadroom } = require('./frame_limits');
const { snapshotFrSlice, restoreFrSlice } = require('./frame_ops');

function vmFindLocalValue(vm, name) {
    if (vm.locals && vm.locals.length > 0) {
        for (let i = vm.locals.length - 1; i >= 0; i--) {
            const scope = vm.locals[i];
            if (Object.prototype.hasOwnProperty.call(scope, name)) {
                const idx = scope[name];
                return vm.stack[(vm._fp || 0) + idx];
            }
        }
    }
    if (vm.capturedVars && Object.prototype.hasOwnProperty.call(vm.capturedVars, name)) {
        const captured = vm.capturedVars[name];
        return captured?.value !== undefined ? captured.value : captured;
    }
    return undefined;
}

function vmCallClosure(vm, fn, args) {
    const savedStack = vm.stack;
    const savedLocals = vm.locals;
    const savedCapturedVars = vm.capturedVars;
    const savedSharedCaptured = vm.sharedCaptured;
    const savedCurrentClosure = vm.currentClosure;
    const savedCode = vm.code;
    const savedConsts = vm.consts;
    const savedVars = vm.vars;
    const savedFp = vm._fp;
    const savedIp = vm.ip;
    const savedFrames = vm.frames;
    const savedFrameTop = vm._frameTop;
    vm.stack = [];
    vm._fp = 0;

    const baseScope =
        (Array.isArray(fn._localScopeArr) && fn._localScopeArr[0]) ||
        fn.localScope ||
        fn._funcRef?.localScope ||
        {};
    const localScope = { ...baseScope };
    let nextLocalIdx = 0;
    for (const key in localScope) {
        const idx = localScope[key];
        if (typeof idx === 'number' && idx >= nextLocalIdx) nextLocalIdx = idx + 1;
    }
    const params = fn._funcRef?.params || fn.params || [];
    let maxOperandSlot = 0;
    for (let i = 0; i < params.length; i++) {
        const p = params[i];
        let idx = localScope[p];
        if (typeof idx !== 'number') {
            idx = nextLocalIdx++;
            localScope[p] = idx;
        }
        vm.stack[idx] = args[i] ?? null;
        const hi = idx + 1;
        if (hi > maxOperandSlot) maxOperandSlot = hi;
    }
    try {
        ensureOperandHeadroom(maxOperandSlot, 0, 0);
    } catch (e) {
        vm.stack = savedStack;
        vm.locals = savedLocals;
        vm.capturedVars = savedCapturedVars;
        vm.sharedCaptured = savedSharedCaptured;
        vm.currentClosure = savedCurrentClosure;
        vm.code = savedCode;
        vm.consts = savedConsts;
        vm.vars = savedVars;
        vm._fp = savedFp;
        vm.ip = savedIp;
        vm.frames = savedFrames;
        vm._frameTop = savedFrameTop;
        if (e && e.code === 'OPERAND_STACK_OVERFLOW') {
            throw new SeedLangError('operand stack overflow', 'RuntimeError', 0, vm.callStack || []);
        }
        throw e;
    }
    if (maxOperandSlot > 0) vm.stack.length = maxOperandSlot;

    vm.locals = [localScope];
    vm.capturedVars = prepareCallCapturedVars(fn) || {};
    refreshCapturedLocalsFromFrame(fn, vm.locals, vm.stack, vm._fp, vm.capturedVars);
    vm.sharedCaptured = resolveCallSharedCaptured(fn, vm.capturedVars) || {};

    const frSnap = snapshotFrSlice(vm, savedFrameTop);
    vm.code = fn._ctx ? fn._ctx[0] : vm.code;
    vm.consts = fn._ctx ? fn._ctx[1] : vm.consts;
    vm.vars = fn._ctx ? fn._ctx[2] : vm.vars;
    vm.frames = [];
    vm._frameTop = 0;
    vm.ip = fn._start !== undefined ? fn._start : fn.start;
    vm.currentClosure = fn;

    const syncedGlobals = [];
    const fnVars = fn._ctx ? fn._ctx[2] : vm.vars;
    if (Array.isArray(fnVars) && vm._globalVals && vm._globalNameIdx) {
        for (let i = 0; i < fnVars.length; i++) {
            const name = fnVars[i];
            const gi = vm._globalNameIdx.get(name);
            if (typeof gi === 'number' && gi >= 0) {
                const slotVal = vm._globalVals[gi];
                if (slotVal !== undefined) {
                    vm.globals[name] = slotVal;
                } else if (Object.prototype.hasOwnProperty.call(vm.globals, name)) {
                    vm._globalVals[gi] = vm.globals[name];
                }
                syncedGlobals.push([name, gi]);
            }
        }
    }

    let result = null;
    const trace = [];
    try {
        while (vm.ip < vm.code.length) {
            const op = vm.code[vm.ip++];
            if (trace.length < 128) trace.push(`${vm.ip - 1}:${op}:sp${vm.stack.length}`);
            if (op === OP.RETURN || op === OP.RETURN_SIMPLE || op === OP.RETURN_LOCAL || op === OP.RETURN_ADD_LOCALS || op === OP.RETURN_SUB_LOCALS || op === OP.RETURN_MUL_LOCALS || op === OP.RETURN_DIV_LOCALS || op === OP.RETURN_ADD_CAPTURED_LOCAL || op === OP.RETURN_SUB_CAPTURED_LOCAL || op === OP.RETURN_MUL_CAPTURED_LOCAL || op === OP.RETURN_DIV_CAPTURED_LOCAL) {
                if (op !== OP.RETURN && op !== OP.RETURN_SIMPLE) vm._executeOpInline(op);
                if (vm.frames?.length > 0) {
                    result = vm.stack.length > 0 ? vm.stack[vm.stack.length - 1] : null;
                    continue;
                }
                result = vm.stack.length > 0 ? vm.stack[vm.stack.length - 1] : null;
                break;
            }
            if (op === OP.HALT) {
                break;
            }
            vm._executeOpInline(op);
        }
    } catch (e) {
        vm._lastCallClosureError = e?.message || String(e);
        result = null;
    }
    restoreFrSlice(vm, frSnap);
    vm._lastCallClosureTrace = trace;
    vm._lastCallClosureStart = fn._start !== undefined ? fn._start : fn.start;
    vm._lastCallClosureResult = result;
    if (syncedGlobals.length > 0 && vm._globalVals) {
        for (let i = 0; i < syncedGlobals.length; i++) {
            const name = syncedGlobals[i][0];
            const gi = syncedGlobals[i][1];
            const val = vm._globalVals[gi] !== undefined ? vm._globalVals[gi] : vm.globals[name];
            vm._globalVals[gi] = val;
            vm.globals[name] = val;
        }
    }

    vm.ip = savedIp;
    vm.stack = savedStack;
    vm.locals = savedLocals;
    if (savedCapturedVars && vm.capturedVars && savedCapturedVars !== vm.capturedVars) {
        for (const name in vm.capturedVars) {
            const nextVal = vm.capturedVars[name];
            if (savedCapturedVars[name] && typeof savedCapturedVars[name] === 'object' && Object.prototype.hasOwnProperty.call(savedCapturedVars[name], 'value')) {
                if (nextVal && typeof nextVal === 'object' && Object.prototype.hasOwnProperty.call(nextVal, 'value')) {
                    savedCapturedVars[name].value = nextVal.value;
                } else {
                    savedCapturedVars[name].value = nextVal;
                }
            } else {
                savedCapturedVars[name] = nextVal;
            }
        }
    }
    if (savedSharedCaptured && vm.sharedCaptured && savedSharedCaptured !== vm.sharedCaptured) {
        for (const name in vm.sharedCaptured) {
            const nextBox = vm.sharedCaptured[name];
            if (savedSharedCaptured[name] && typeof savedSharedCaptured[name] === 'object' && Object.prototype.hasOwnProperty.call(savedSharedCaptured[name], 'value')) {
                if (nextBox && typeof nextBox === 'object' && Object.prototype.hasOwnProperty.call(nextBox, 'value')) {
                    savedSharedCaptured[name].value = nextBox.value;
                } else {
                    savedSharedCaptured[name].value = nextBox;
                }
            } else {
                savedSharedCaptured[name] = nextBox;
            }
        }
    }
    vm.capturedVars = savedCapturedVars;
    vm.sharedCaptured = savedSharedCaptured;
    vm.currentClosure = savedCurrentClosure;
    vm.code = savedCode;
    vm.consts = savedConsts;
    vm.vars = savedVars;
    vm._fp = savedFp;
    vm.frames = savedFrames;
    vm._frameTop = savedFrameTop;

    return result;
}

function vmExecuteMatch(vm, value, cases) {
    for (const case_ of cases) {
        const bindings = vmMatchPattern(vm, case_.pattern, value);
        if (bindings !== null) {
            if (case_.guard) {
                const guardResult = vmEvalExpr(vm, case_.guard, bindings);
                if (!guardResult) continue;
            }
            if (case_.body.length === 1 && case_.body[0].type === 'expr') {
                return vmEvalExpr(vm, case_.body[0].expr, bindings);
            } else {
                let result = null;
                for (const stmt of case_.body) {
                    result = vmEvalStmt(vm, stmt, bindings);
                }
                return result;
            }
        }
    }
    throw new Error('No matching pattern found');
}

function vmMatchPattern(vm, pattern, value) {
    switch (pattern.kind) {
        case 'wildcard':
            return {};
        case 'literal':
            if (value === pattern.value) return {};
            return null;
        case 'identifier':
            return { [pattern.name]: value };
        case 'range':
            if (typeof value !== 'number') return null;
            if (value >= pattern.start && value <= pattern.end) return {};
            return null;
        case 'type':
            const typeName = pattern.typeName;
            let typeMatch = false;
            switch (typeName) {
                case 'number':
                    typeMatch = typeof value === 'number';
                    break;
                case 'string':
                    typeMatch = typeof value === 'string';
                    break;
                case 'boolean':
                    typeMatch = typeof value === 'boolean';
                    break;
                case 'array':
                    typeMatch = Array.isArray(value);
                    break;
                case 'object':
                    typeMatch = typeof value === 'object' && value !== null && !Array.isArray(value);
                    break;
                case 'function':
                    typeMatch = typeof value === 'function';
                    break;
                default:
                    typeMatch = typeof value === typeName;
            }
            if (!typeMatch) return null;
            if (pattern.pattern && pattern.pattern.kind === 'identifier') {
                return { [pattern.pattern.name]: value };
            }
            return {};
        case 'array':
            if (!Array.isArray(value)) return null;
            if (pattern.rest) {
                if (value.length < pattern.elements.length) return null;
            } else {
                if (value.length !== pattern.elements.length) return null;
            }
            const arrBindings = {};
            for (let i = 0; i < pattern.elements.length; i++) {
                const bindings = vmMatchPattern(vm, pattern.elements[i], value[i]);
                if (bindings === null) return null;
                Object.assign(arrBindings, bindings);
            }
            if (pattern.rest) {
                arrBindings[pattern.rest] = value.slice(pattern.elements.length);
            }
            return arrBindings;
        case 'object':
            if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
            const objBindings = {};
            for (const prop of pattern.properties) {
                if (!(prop.key in value)) return null;
                const bindings = vmMatchPattern(vm, prop.pattern, value[prop.key]);
                if (bindings === null) return null;
                Object.assign(objBindings, bindings);
            }
            return objBindings;
        case 'or':
            for (const p of pattern.patterns) {
                const bindings = vmMatchPattern(vm, p, value);
                if (bindings !== null) return bindings;
            }
            return null;
        default:
            return null;
    }
}

function vmEvalExpr(vm, node, bindings = {}) {
    switch (node.type) {
        case 'number':
        case 'boolean':
            return node.value;
        case 'string':
            return _decodeAmpCompressedString(node.value);
        case 'null':
            return null;
        case 'id':
        case 'identifier':
            if (Object.prototype.hasOwnProperty.call(bindings, node.name)) return bindings[node.name];
            const localVal = vmFindLocalValue(vm, node.name);
            if (localVal !== undefined) return localVal;
            if (Object.prototype.hasOwnProperty.call(vm.globals, node.name)) return vm.globals[node.name];
            const bv = vm.builtins[node.name];
            if (bv !== undefined) return bv;
            return null;
        case 'binary':
            const left = vmEvalExpr(vm, node.left, bindings);
            const right = vmEvalExpr(vm, node.right, bindings);
            switch (node.op) {
                case '+': return safeAddValues(left, right);
                case '-': return normalizeNumericOperand(left) - normalizeNumericOperand(right);
                case '*': return normalizeNumericOperand(left) * normalizeNumericOperand(right);
                case '/': {
                    const rn = normalizeNumericOperand(right);
                    return rn ? (normalizeNumericOperand(left) / rn) : 0;
                }
                case '%': return normalizeNumericOperand(left) % normalizeNumericOperand(right);
                case '==': return left === right;
                case '!=': return left !== right;
                case '<': return left < right;
                case '<=': return left <= right;
                case '>': return left > right;
                case '>=': return left >= right;
                case 'and': return left && right;
                case 'or': return left || right;
                case '&': return left & right;
                case '|': return left | right;
                case '^': return left ^ right;
                case '<<': return left << right;
                case '>>': return left >> right;
                default: return null;
            }
        case 'unary':
            const operand = vmEvalExpr(vm, node.operand, bindings);
            switch (node.op) {
                case '-': return -operand;
                case 'not': return !operand;
                case '~': return ~operand;
                default: return null;
            }
        case 'call':
            const callee = vmEvalExpr(vm, node.callee, bindings);
            const args = node.args.map(a => vmEvalExpr(vm, a, bindings));
            if (typeof callee === 'function') return callee(args);
            if (callee?._type === 'closure') {
                return vmCallClosure(vm, callee, args);
            }
            return null;
        case 'GenericCall':
        case 'genericCall':
            const genericCallee = vmEvalExpr(vm, node.callee, bindings);
            const genericArgs = (node.args || []).map(a => vmEvalExpr(vm, a, bindings));
            if (typeof genericCallee === 'function') return genericCallee(genericArgs);
            if (genericCallee?._type === 'closure') {
                return vmCallClosure(vm, genericCallee, genericArgs);
            }
            return null;
        case 'SuperCallExpression':
            const superTarget = bindings.super ?? vm.globals?.super;
            const superMethod = superTarget?.[node.method];
            const superArgs = (node.args || []).map(a => vmEvalExpr(vm, a, bindings));
            if (typeof superMethod === 'function') return superMethod(superArgs);
            if (superMethod?._type === 'closure') {
                return vmCallClosure(vm, superMethod, superArgs);
            }
            return null;
        case 'array':
            return node.elements.map(e => vmEvalExpr(vm, e, bindings));
        case 'object':
            const objVal = {};
            for (const p of node.pairs) {
                if (p.spread) {
                    const spreadVal = vmEvalExpr(vm, p.value, bindings);
                    if (spreadVal && typeof spreadVal === 'object') {
                        for (const sk of Object.keys(spreadVal)) objVal[sk] = spreadVal[sk];
                    }
                } else if (p.computed) {
                    const computedKey = vmEvalExpr(vm, p.keyExpr, bindings);
                    objVal[computedKey] = vmEvalExpr(vm, p.value, bindings);
                } else {
                    objVal[p.key] = vmEvalExpr(vm, p.value, bindings);
                }
            }
            return objVal;
        case 'member':
            const memberObj = vmEvalExpr(vm, node.object, bindings);
            return memberObj?.[node.property] ?? null;
        case 'index':
            const indexObj = vmEvalExpr(vm, node.object, bindings);
            const indexKey = vmEvalExpr(vm, node.index, bindings);
            return indexObj?.[indexKey] ?? null;
        case 'conditional':
        case 'Conditional':
            return vmEvalExpr(vm, node.condition, bindings)
                ? vmEvalExpr(vm, node.consequent, bindings)
                : vmEvalExpr(vm, node.alternate, bindings);
        case 'await':
        case 'Await':
            return vmEvalExpr(vm, node.expr || node.expression, bindings);
        default:
            return null;
    }
}

function vmEvalStmt(vm, node, bindings = {}) {
    switch (node.type) {
        case 'expr':
            return vmEvalExpr(vm, node.expr, bindings);
        case 'return':
            return vmEvalExpr(vm, node.value, bindings);
        case 'Action':
            return vmEvalExpr(vm, node.target, bindings);
        default:
            return null;
    }
}

function vmStr(vm, v) {
    if (v == null) return 'null';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return '[' + v.map(x => vmStr(vm, x)).join(', ') + ']';
    if (typeof v === 'object') return '{' + Object.entries(v).map(([k, x]) => k + ': ' + vmStr(vm, x)).join(', ') + '}';
    return String(v);
}

function wirePatternMatchOps(VMProto) {
    VMProto.findLocalValue = function (name) { return vmFindLocalValue(this, name); };
    VMProto.callClosure = function (fn, args) { return vmCallClosure(this, fn, args); };
    VMProto.executeMatch = function (value, cases) { return vmExecuteMatch(this, value, cases); };
    VMProto.matchPattern = function (pattern, value) { return vmMatchPattern(this, pattern, value); };
    VMProto.evalExpr = function (node, bindings) { return vmEvalExpr(this, node, bindings); };
    VMProto.evalStmt = function (node, bindings) { return vmEvalStmt(this, node, bindings); };
    VMProto.str = function (v) { return vmStr(this, v); };
}

module.exports = {
    vmFindLocalValue,
    vmCallClosure,
    vmExecuteMatch,
    vmMatchPattern,
    vmEvalExpr,
    vmEvalStmt,
    vmStr,
    wirePatternMatchOps
};
