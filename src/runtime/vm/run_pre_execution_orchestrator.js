'use strict';

const { runSameCodeFastPath } = require('./run_same_code_fast_path');
const { tryRunFromGlobalJitCache } = require('./run_global_jit_cache');
const { resolveRunBytecode } = require('./run_bytecode_resolution');

const { HARDENED_ARRAY_MARK } = require('./runtime_safety');

function lazyHarden(v) {
    if (v !== null && typeof v === 'object' && Array.isArray(v) && v[HARDENED_ARRAY_MARK] !== 1) {
        return hardenArrayObject(v);
    }
    return v;
}

function prepareRunExecutionOrchestrator(owner, code, options, allowSeedFastPath, deps) {
    const {
        hydrateBuiltinGlobals,
        syncGlobalValuesToGlobals,
        flushVmGlobalValuesIfNeeded,
        hardenArrayObject,
        globalBcCache,
        globalJitCache,
        maxGlobalCacheSize
    } = deps;

    const sfp = owner._cachedSfp;
    if (allowSeedFastPath && sfp && code === owner._lastOriginalCode) {
        hydrateBuiltinGlobals(owner._cachedGv, owner._cachedVars, owner._vm.builtins);
        try {
            sfp(owner._cachedGv, owner._cachedGl);
        } catch (_) {
            owner._cachedSfp = null;
        }
        if (!owner._cachedSfp) {
            return { handled: true, result: owner.run(code, options) };
        }
        return { handled: true, result: owner._cachedResult };
    }

    const jfp = owner._cachedJfp;
    if (allowSeedFastPath && jfp && code === owner._lastOriginalCode) {
        const gv = owner._cachedGv;
        const ic = owner._cachedIc;
        for (let i = 0; i < ic.length; i += 2) gv[ic[i]] = ic[i + 1];
        hydrateBuiltinGlobals(gv, owner._cachedVars, owner._vm.builtins);
        try {
            jfp(gv, owner._vm.output);
        } catch (_) {
            owner._cachedJfp = null;
        }
        if (!owner._cachedJfp) {
            return { handled: true, result: owner.run(code, options) };
        }
        const v = owner._cachedVars;
        const gl = owner._cachedGl;
        const len = v.length;
        const gv0 = gv[0], gv1 = gv[1], gv2 = gv[2], gv3 = gv[3];
        if (len > 0) gl[v[0]] = lazyHarden(gv0);
        if (len > 1) gl[v[1]] = lazyHarden(gv1);
        if (len > 2) gl[v[2]] = lazyHarden(gv2);
        if (len > 3) gl[v[3]] = lazyHarden(gv3);
        if (len > 4) for (let i = 4; i < len; i++) gl[v[i]] = lazyHarden(gv[i]);
        return { handled: true, result: owner._cachedResult };
    }

    if (allowSeedFastPath && code === owner._lastOriginalCode) {
        const sameCodeFastPath = runSameCodeFastPath(
            owner,
            code,
            hydrateBuiltinGlobals,
            syncGlobalValuesToGlobals,
            flushVmGlobalValuesIfNeeded,
            hardenArrayObject
        );
        if (sameCodeFastPath.handled) {
            return { handled: true, result: sameCodeFastPath.result };
        }
    }

    const globalJitHit = tryRunFromGlobalJitCache(
        owner,
        code,
        globalBcCache,
        globalJitCache,
        hydrateBuiltinGlobals,
        syncGlobalValuesToGlobals,
        hardenArrayObject
    );
    if (globalJitHit.handled) {
        return { handled: true, result: globalJitHit.result };
    }

    if (code === owner._lastOriginalCode) {
        const sameCodeFastPath = runSameCodeFastPath(
            owner,
            code,
            hydrateBuiltinGlobals,
            syncGlobalValuesToGlobals,
            flushVmGlobalValuesIfNeeded,
            hardenArrayObject
        );
        if (sameCodeFastPath.handled) {
            return { handled: true, result: sameCodeFastPath.result };
        }
    }

    const runBytecodeResolution = resolveRunBytecode(
        owner,
        code,
        options,
        globalBcCache,
        maxGlobalCacheSize
    );
    if (runBytecodeResolution.handled) {
        return { handled: true, result: runBytecodeResolution.result };
    }

    return {
        handled: false,
        code: runBytecodeResolution.code,
        bc: runBytecodeResolution.bc
    };
}

module.exports = {
    prepareRunExecutionOrchestrator
};
