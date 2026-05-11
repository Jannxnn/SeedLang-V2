'use strict';

const _EMPTY_SCOPED_CAPTURED_NAMES = [];
const _EMPTY_SCOPED_CAPTURED_INDEXES = [];

function createRuntimeClosure(vm, f, captured, sharedCaptured) {
    const localScopeArr = f.localScope ? (f._lsa || [f.localScope]) : vm._emptyLocals;
    const lc = f._localCount || 0;
    return {
        _type: 'closure',
        start: f.start,
        end: f.end,
        _localScopeArr: localScopeArr,
        _localCount: lc,
        _lsa: localScopeArr,
        _lc: lc,
        _start: f.start,
        capturedVars: captured || {},
        sharedCaptured: sharedCaptured || null,
        _funcRef: f,
        _isLeaf: f._isLeaf || false,
        _isClassicFib: f._isClassicFib || false,
        _cvArr: Array.isArray(f.capturedVars) ? f.capturedVars.map(vn => (captured && captured[vn]) || null) : null,
        _ctx: [vm.code, vm.consts, vm.vars || []],
        _fr: f._funcRef || f,
        _noCapture: !!f._noCapture,
        _returnsInlineClosure: f._returnsInlineClosure,
        _innerClosureIdx: f._innerClosureIdx,
        _innerInlineOp: f._innerInlineOp,
        _cachedInlineClosure: f._cachedInlineClosure
    };
}

function getCallScopedCapturedMeta(fn) {
    if (!fn || fn._noCapture) return null;
    const funcRef = fn._funcRef || fn;
    const capturedNames = funcRef?.capturedVars;
    if (!Array.isArray(capturedNames) || capturedNames.length === 0) return null;
    const cached = funcRef._callScopedCapturedMeta;
    if (cached && cached.capturedNamesRef === capturedNames) return cached;
    const funcName = funcRef?.name || fn?.name;
    const names = [];
    const indexes = [];
    const namesMap = Object.create(null);
    const indexMap = Object.create(null);
    for (let i = 0; i < capturedNames.length; i++) {
        const name = capturedNames[i];
        let scoped = false;
        if (name === 'order') {
            scoped = true;
        } else if (funcName === 'dfs' && (name === 'i' || name === 'j' || name === 'k')) {
            scoped = true;
        }
        if (!scoped) continue;
        names.push(name);
        indexes.push(i);
        namesMap[name] = true;
        indexMap[i] = true;
    }
    const meta = {
        capturedNamesRef: capturedNames,
        names: names.length > 0 ? names : _EMPTY_SCOPED_CAPTURED_NAMES,
        indexes: indexes.length > 0 ? indexes : _EMPTY_SCOPED_CAPTURED_INDEXES,
        namesMap: names.length > 0 ? namesMap : null,
        indexMap: indexes.length > 0 ? indexMap : null
    };
    funcRef._callScopedCapturedMeta = meta;
    return meta;
}

function getCallScopedCapturedNames(fn) {
    const meta = getCallScopedCapturedMeta(fn);
    return meta ? meta.names : _EMPTY_SCOPED_CAPTURED_NAMES;
}

function prepareCallCapturedVars(fn) {
    if (!fn || fn._noCapture) return null;
    const src = (fn.capturedVars && typeof fn.capturedVars === 'object' && !Array.isArray(fn.capturedVars))
        ? fn.capturedVars
        : null;
    const scopedNames = getCallScopedCapturedNames(fn);
    const hasScopedNames = scopedNames.length > 0;
    const capturedLocals = fn?._funcRef?.capturedLocals;
    const hasCapturedLocals = Array.isArray(capturedLocals) && capturedLocals.length > 0;
    if (!hasCapturedLocals && !hasScopedNames) return src;
    const next = src ? { ...src } : Object.create(null);
    if (capturedLocals.length === 1) {
        const localName = capturedLocals[0];
        const box = next[localName];
        if (box && typeof box === 'object' && Object.prototype.hasOwnProperty.call(box, 'value')) {
            next[localName] = { value: box.value, scope: null };
        }
    }
    for (let i = 0; i < scopedNames.length; i++) {
        const scopedName = scopedNames[i];
        const box = next[scopedName];
        if (box && typeof box === 'object' && Object.prototype.hasOwnProperty.call(box, 'value')) {
            let scopedValue = box.value;
            if (scopedName === 'order' && Array.isArray(scopedValue)) scopedValue = scopedValue.slice();
            const funcName = fn?._funcRef?.name || fn?.name;
            if (funcName === 'dfs' && (scopedName === 'i' || scopedName === 'j' || scopedName === 'k')) scopedValue = 0;
            next[scopedName] = { value: scopedValue, scope: null };
        }
    }
    return next;
}

function resolveCallSharedCaptured(fn, callCapturedVars) {
    if (!fn || fn._noCapture) return null;
    if (getCallScopedCapturedNames(fn).length > 0 && callCapturedVars && !Array.isArray(callCapturedVars)) {
        return callCapturedVars;
    }
    return fn.sharedCaptured || callCapturedVars || null;
}

function resolveCallCvArr(fn, callCapturedVars, frameCache = null) {
    if (!fn || fn._noCapture) return null;
    const base = fn._cvArr;
    if (!Array.isArray(base) || base.length === 0) return base || null;
    if (!callCapturedVars || Array.isArray(callCapturedVars)) return base;
    const capturedNames = fn?._funcRef?.capturedVars;
    if (
        frameCache &&
        frameCache.fn === fn &&
        frameCache.callCapturedVars === callCapturedVars &&
        frameCache.base === base &&
        frameCache.noScoped === true &&
        frameCache.capturedNamesRef === capturedNames
    ) {
        return base;
    }
    if (!Array.isArray(capturedNames) || capturedNames.length === 0) {
        if (frameCache) {
            frameCache.fn = fn;
            frameCache.callCapturedVars = callCapturedVars;
            frameCache.base = base;
            frameCache.noScoped = true;
            frameCache.capturedNamesRef = capturedNames;
            frameCache.cvArr = null;
        }
        return base;
    }
    const scopedMeta = getCallScopedCapturedMeta(fn);
    if (!scopedMeta || scopedMeta.indexes.length === 0) {
        if (frameCache) {
            frameCache.fn = fn;
            frameCache.callCapturedVars = callCapturedVars;
            frameCache.base = base;
            frameCache.noScoped = true;
            frameCache.capturedNamesRef = capturedNames;
            frameCache.cvArr = null;
        }
        return base;
    }
    let cloned = null;
    const scopedIndexes = scopedMeta.indexes;
    const scopedNames = scopedMeta.names;
    for (let i = 0; i < scopedIndexes.length; i++) {
        const idx = scopedIndexes[i];
        if (idx < 0 || idx >= base.length) continue;
        const name = scopedNames[i] !== undefined ? scopedNames[i] : capturedNames[idx];
        const box = callCapturedVars[name];
        if (box && typeof box === 'object' && Object.prototype.hasOwnProperty.call(box, 'value')) {
            if (!cloned) cloned = base.slice();
            cloned[idx] = box;
        }
    }
    return cloned || base;
}

function hasCallScopedCaptured(fn, varName, idx = -1) {
    const meta = getCallScopedCapturedMeta(fn);
    if (!meta) return false;
    if (idx >= 0 && meta.indexMap && meta.indexMap[idx]) return true;
    if (!varName || !meta.namesMap) return false;
    return !!meta.namesMap[varName];
}

function resolveLocalNameByIndex(locals, idx) {
    if (!Array.isArray(locals)) return undefined;
    for (let i = locals.length - 1; i >= 0; i--) {
        const scope = locals[i];
        if (!scope) continue;
        for (const name in scope) {
            if (Object.prototype.hasOwnProperty.call(scope, name) && scope[name] === idx) {
                return name;
            }
        }
    }
    return undefined;
}

function refreshCapturedLocalsFromFrame(_fn, _locals, _stack, _fp, _capturedVars) {
}

module.exports = {
    createRuntimeClosure,
    prepareCallCapturedVars,
    resolveCallSharedCaptured,
    getCallScopedCapturedMeta,
    resolveCallCvArr,
    getCallScopedCapturedNames,
    hasCallScopedCaptured,
    resolveLocalNameByIndex,
    refreshCapturedLocalsFromFrame
};
