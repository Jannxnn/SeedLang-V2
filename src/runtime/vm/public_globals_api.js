'use strict';

function setGlobalOnVm(vm, name, value, options, isSensitiveGlobalName, isUnsafeHostGlobalValue, hasUnsafeHostCallable) {
    if (typeof name !== 'string' || !name) {
        throw new Error('setGlobal(name, value) expects a non-empty string name');
    }
    const opts = options || {};
    const allowSensitive = opts.allowSensitive === true;
    const allowHostObjects = opts.allowHostObjects === true;
    if (!allowSensitive && isSensitiveGlobalName(name)) {
        throw new Error(`Global '${name}' is blocked by security policy`);
    }
    if (!allowHostObjects && (isUnsafeHostGlobalValue(value) || hasUnsafeHostCallable(value))) {
        throw new Error(`Global '${name}' host object injection is blocked`);
    }
    vm.globals[name] = value;
    const gv = vm._globalVals;
    const gi = vm._globalNameIdx;
    if (gv && gi) {
        const idx = gi.get(name);
        if (idx !== undefined) gv[idx] = value;
    }
    return true;
}

function getGlobalFromVm(vm, name) {
    return vm.globals[name];
}

function deleteGlobalFromVm(vm, name, isTrustedGlobalNameFn) {
    if (typeof name !== 'string' || !name) return false;
    if (typeof isTrustedGlobalNameFn === 'function' && isTrustedGlobalNameFn(name)) return false;
    return delete vm.globals[name];
}

module.exports = {
    setGlobalOnVm,
    getGlobalFromVm,
    deleteGlobalFromVm
};
