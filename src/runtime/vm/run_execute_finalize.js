'use strict';

function executeRunAndFinalize(owner, bc, code, flushVmGlobalValuesIfNeeded, hardenArrayObject, applyPostExecutionFastPathCaches, finalizeRunResult, globalJitCache, maxGlobalCacheSize) {
    const vmInst = owner._vm;
    const result = vmInst.run(bc);
    flushVmGlobalValuesIfNeeded(owner._vm, bc.vars, hardenArrayObject);
    applyPostExecutionFastPathCaches(owner, bc, code, globalJitCache, maxGlobalCacheSize);
    return finalizeRunResult(owner._vm, result);
}

module.exports = {
    executeRunAndFinalize
};
