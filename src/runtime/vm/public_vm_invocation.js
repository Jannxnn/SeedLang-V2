'use strict';

function callGlobalNative(owner, name, ...args) {
    const fn = owner._vm.globals[name];
    if (!fn || !fn._nativeFn || owner._vm._executionGuardEnabled || fn._returnsObjectLiteral || fn._funcRef?._returnsObjectLiteral) return undefined;
    return fn._nativeFn(...args);
}

function getGlobalNativeFn(owner, name) {
    const fn = owner._vm.globals[name];
    return fn?._nativeFn;
}

module.exports = {
    callGlobalNative,
    getGlobalNativeFn
};
