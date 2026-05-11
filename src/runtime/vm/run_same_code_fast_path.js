'use strict';

function runSameCodeFastPath(owner, code, hydrateBuiltinGlobals, syncGlobalValuesToGlobals, flushVmGlobalValuesIfNeeded, hardenArrayObject) {
    if (code !== owner._lastOriginalCode) {
        return { handled: false, result: null };
    }

    const vmInst = owner.vm;
    const jfp2 = vmInst._jitFastPath;
    if (jfp2) {
        const gv = vmInst._globalVals;
        const ic = vmInst._initConsts;
        for (let i = 0; i < ic.length; i += 2) gv[ic[i]] = ic[i + 1];
        hydrateBuiltinGlobals(gv, owner._lastBc?.vars, vmInst.builtins);
        try {
            jfp2(gv, vmInst.output);
        } catch (_) {
            vmInst._jitFastPath = null;
            owner._cachedJfp = null;
        }
        if (!vmInst._jitFastPath) {
            const resultFallback = vmInst.run(owner._lastBc);
            flushVmGlobalValuesIfNeeded(vmInst, owner._lastBc.vars, hardenArrayObject);
            return { handled: true, result: resultFallback };
        }
        const bc = owner._lastBc;
        const v = bc.vars;
        const gl = vmInst.globals;
        syncGlobalValuesToGlobals(gl, v, gv, hardenArrayObject);
        owner._cachedJfp = jfp2;
        owner._cachedGv = gv;
        owner._cachedIc = ic;
        owner._cachedVars = v;
        owner._cachedGl = gl;
        owner._cachedResult = vmInst._cachedResult;
        return { handled: true, result: owner._cachedResult };
    }

    const result = vmInst.run(owner._lastBc);
    flushVmGlobalValuesIfNeeded(vmInst, owner._lastBc.vars, hardenArrayObject);
    return { handled: true, result };
}

module.exports = {
    runSameCodeFastPath
};
