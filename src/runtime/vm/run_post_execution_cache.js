'use strict';

function applyPostExecutionFastPathCaches(owner, bc, code, globalJitCache, maxGlobalCacheSize) {
    const jfp = owner._vm._jitFastPath;
    if (jfp && !owner._cachedJfp) {
        owner._cachedJfp = jfp;
        owner._cachedGv = owner._vm._globalVals;
        owner._cachedIc = owner._vm._initConsts;
        owner._cachedVars = bc.vars;
        owner._cachedGl = owner._vm.globals;
        owner._cachedResult = owner._vm._cachedResult;
        if (globalJitCache.size < maxGlobalCacheSize) {
            const h = owner.hash(code);
            if (!globalJitCache.has(h)) {
                globalJitCache.set(h, {
                    jfp,
                    ic: owner._vm._initConsts,
                    ljc: owner._vm._loopJitCache,
                    cr: owner._vm._cachedResult
                });
            }
        }
    }

    const sfp = owner._vm._superFastPath;
    if (sfp && !owner._cachedSfp) {
        owner._cachedSfp = sfp;
        if (!owner._cachedGv) owner._cachedGv = owner._vm._globalVals;
        if (!owner._cachedGl) owner._cachedGl = owner._vm.globals;
        if (!owner._cachedResult) owner._cachedResult = owner._vm._cachedResult;
        const gv = owner._cachedGv;
        const gl = owner._cachedGl;
        const gvLen = gv.length;
        const gvSnapshot = gv.slice(0, gvLen);
        const glKeys = Object.keys(gl);
        const glSnapshot = {};
        for (const k of glKeys) glSnapshot[k] = gl[k];
        const savedOutput = owner._vm.output.slice();
        owner._vm.output.length = 0;
        owner._vm._suppressConsoleLog = true;
        sfp(gv, gl);
        sfp(gv, gl);
        owner._vm._suppressConsoleLog = false;
        owner._vm.output.length = 0;
        owner._vm.output.push(...savedOutput);
        for (let i = 0; i < gvLen; i++) gv[i] = gvSnapshot[i];
        for (const k of glKeys) gl[k] = glSnapshot[k];
    }
}

module.exports = {
    applyPostExecutionFastPathCaches
};
