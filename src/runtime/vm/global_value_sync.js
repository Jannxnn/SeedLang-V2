'use strict';

const { HARDENED_ARRAY_MARK } = require('./runtime_safety');

function lazyHarden(v) {
    if (v !== null && typeof v === 'object' && Array.isArray(v) && v[HARDENED_ARRAY_MARK] !== 1) {
        return require('./runtime_safety').hardenArrayObject(v);
    }
    return v;
}

function syncGlobalValuesToGlobals(globals, vars, globalVals, hardenArrayObject) {
    const len = vars.length;
    if (len > 0) globals[vars[0]] = lazyHarden(globalVals[0]);
    if (len > 1) globals[vars[1]] = lazyHarden(globalVals[1]);
    if (len > 2) globals[vars[2]] = lazyHarden(globalVals[2]);
    if (len > 3) globals[vars[3]] = lazyHarden(globalVals[3]);
    if (len > 4) {
        for (let i = 4; i < len; i++) globals[vars[i]] = lazyHarden(globalVals[i]);
    }
}

function flushVmGlobalValuesIfNeeded(vm, vars, hardenArrayObject) {
    if (!vm._syncGlobalVals) return;
    vm._syncGlobalVals = false;
    syncGlobalValuesToGlobals(vm.globals, vars, vm._globalVals, hardenArrayObject);
}

module.exports = {
    syncGlobalValuesToGlobals,
    flushVmGlobalValuesIfNeeded
};
