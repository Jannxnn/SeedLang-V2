'use strict';

function createRunEntryDeps(deps) {
    return {
        hydrateBuiltinGlobals: deps.hydrateBuiltinGlobals,
        syncGlobalValuesToGlobals: deps.syncGlobalValuesToGlobals,
        flushVmGlobalValuesIfNeeded: deps.flushVmGlobalValuesIfNeeded,
        hardenArrayObject: deps.hardenArrayObject,
        globalBcCache: deps.globalBcCache,
        globalJitCache: deps.globalJitCache,
        maxGlobalCacheSize: deps.maxGlobalCacheSize,
        applyPostExecutionFastPathCaches: deps.applyPostExecutionFastPathCaches,
        finalizeRunResult: deps.finalizeRunResult
    };
}

function createRunFastPathDeps(deps) {
    return {
        flushVmGlobalValuesIfNeeded: deps.flushVmGlobalValuesIfNeeded,
        hardenArrayObject: deps.hardenArrayObject
    };
}

function createRunAsyncDeps(deps) {
    return {
        SeedLangErrorCtor: deps.SeedLangErrorCtor,
        buildRunErrorResult: deps.buildRunErrorResult
    };
}

module.exports = {
    createRunEntryDeps,
    createRunFastPathDeps,
    createRunAsyncDeps
};
