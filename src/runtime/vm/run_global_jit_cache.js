'use strict';

function tryRunFromGlobalJitCache(
    owner,
    code,
    globalBcCache,
    globalJitCache,
    hydrateBuiltinGlobals,
    syncGlobalValuesToGlobals,
    hardenArrayObject
) {
    if (!(globalJitCache.size > 0 && !owner._cachedJfp)) {
        return { handled: false, result: null };
    }

    const processedCode = typeof code === 'string' ? code.replace(/;/g, '\n') : code;
    const h = owner.hash(processedCode);
    const gBc = globalBcCache.get(h);
    if (!gBc) return { handled: false, result: null };

    const gJit = globalJitCache.get(h);
    if (!(gJit && gJit.jfp)) return { handled: false, result: null };

    const varsLen = gBc.vars.length;
    let gv = owner._quickGv;
    if (!gv || gv.length < varsLen) {
        gv = new Array(varsLen);
        owner._quickGv = gv;
    }
    const builtins = owner._vm.builtins;
    if (builtins) {
        const vars = gBc.vars;
        for (let i = 0; i < varsLen; i++) {
            const bv = builtins[vars[i]];
            gv[i] = bv !== undefined ? bv : null;
        }
    } else {
        for (let i = 0; i < varsLen; i++) gv[i] = null;
    }
    const ic = gJit.ic;
    if (ic) {
        for (let i = 0; i < ic.length; i += 2) gv[ic[i]] = ic[i + 1];
    }
    hydrateBuiltinGlobals(gv, gBc.vars, owner._vm.builtins);
    try {
        gJit.jfp(gv, owner._vm.output);
    } catch (_) {
        globalJitCache.delete(h);
    }
    const gl = owner._vm.globals;
    const v = gBc.vars;
    syncGlobalValuesToGlobals(gl, v, gv, hardenArrayObject);
    owner._cachedJfp = gJit.jfp;
    owner._cachedGv = gv;
    owner._cachedIc = gJit.ic;
    owner._cachedVars = gBc.vars;
    owner._cachedGl = gl;
    owner._cachedResult = gJit.cr;
    owner._lastOriginalCode = code;
    owner._lastCode = processedCode;
    owner._lastBc = gBc;
    return { handled: true, result: gJit.cr };
}

module.exports = {
    tryRunFromGlobalJitCache
};
