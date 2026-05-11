'use strict';

const _NO_FAST_BUILTIN = Symbol('NO_FAST_BUILTIN');

function isClassicFibFuncRef(fn) {
    return !!(fn && (fn._isClassicFib === true || fn._funcRef?._isClassicFib === true || fn._fr?._isClassicFib === true));
}

function canUseFastFib(fn, argVal) {
    return isClassicFibFuncRef(fn) && Number.isInteger(argVal) && argVal >= 0;
}

function tryFastBuiltinUnaryCall(fn, arg0, builtins) {
    if (!builtins || typeof fn !== 'function') return _NO_FAST_BUILTIN;
    if (fn === builtins.floor) return Math.floor(arg0 ?? 0);
    if (fn === builtins.ceil) return Math.ceil(arg0 ?? 0);
    if (fn === builtins.round) return Math.round(arg0 ?? 0);
    if (fn === builtins.abs) return Math.abs(arg0 ?? 0);
    return _NO_FAST_BUILTIN;
}

function hydrateBuiltinGlobals(gv, vars, builtins) {
    if (!gv || !vars || !builtins) return;
    const len = vars.length;
    for (let i = 0; i < len; i++) {
        if (gv[i] !== undefined && gv[i] !== null) continue;
        const bv = builtins[vars[i]];
        if (bv !== undefined) gv[i] = bv;
    }
}

module.exports = {
    NO_FAST_BUILTIN: _NO_FAST_BUILTIN,
    isClassicFibFuncRef,
    canUseFastFib,
    tryFastBuiltinUnaryCall,
    hydrateBuiltinGlobals
};
