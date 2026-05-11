'use strict';

const { syncGlobalValuesToGlobals, flushVmGlobalValuesIfNeeded } = require('./global_value_sync');
const { applyPostExecutionFastPathCaches } = require('./run_post_execution_cache');
const { finalizeRunResult } = require('./run_result_finalize');
const { createRunEntryDeps, createRunFastPathDeps, createRunAsyncDeps } = require('./run_deps_factory');
const { runEntryOrchestrator } = require('./run_entry_orchestrator');
const { runFastPathOrchestrator } = require('./run_fast_path_orchestrator');
const { runAsyncOrchestrator } = require('./run_async_orchestrator');
const { buildRunErrorResult } = require('./run_error_result');
const DEFAULT_MAX_GLOBAL_CACHE_SIZE = 64;

function internalCreateRunRuntimeState(deps) {
    const globalBcCache = new Map();
    const globalJitCache = new Map();
    const internalRunDeps = internalCreateRunBridgeDeps({
        SeedLangErrorCtor: deps.SeedLangErrorCtor,
        hydrateBuiltinGlobals: deps.hydrateBuiltinGlobals,
        hardenArrayObject: deps.hardenArrayObject,
        globalBcCache,
        globalJitCache,
        maxGlobalCacheSize: deps.maxGlobalCacheSize ?? DEFAULT_MAX_GLOBAL_CACHE_SIZE
    });
    return {
        globalBcCache,
        globalJitCache,
        internalRunDeps
    };
}

function createPublicRunRuntimeBindings(deps) {
    const runtimeState = internalCreateRunRuntimeState(deps);
    return Object.freeze({
        globalBcCache: runtimeState.globalBcCache,
        globalJitCache: runtimeState.globalJitCache,
        run(owner, code, options, SeedLangVMCtor) {
            return internalRunFromOwner(owner, code, options, SeedLangVMCtor, runtimeState.internalRunDeps);
        },
        runFastPath(owner, code) {
            return internalRunFastPathFromOwner(owner, code, runtimeState.internalRunDeps);
        },
        async runAsync(owner, code) {
            return await internalRunAsyncFromOwner(owner, code, runtimeState.internalRunDeps);
        }
    });
}

function internalCreateRunBridgeDeps(deps) {
    return Object.freeze({
        SeedLangErrorCtor: deps.SeedLangErrorCtor,
        hydrateBuiltinGlobals: deps.hydrateBuiltinGlobals,
        hardenArrayObject: deps.hardenArrayObject,
        globalBcCache: deps.globalBcCache,
        globalJitCache: deps.globalJitCache,
        maxGlobalCacheSize: deps.maxGlobalCacheSize
    });
}

function internalRunFromOwner(owner, code, options, SeedLangVMCtor, deps) {
    return runEntryOrchestrator(owner, code, options, SeedLangVMCtor, deps.SeedLangErrorCtor, createRunEntryDeps({
        hydrateBuiltinGlobals: deps.hydrateBuiltinGlobals,
        syncGlobalValuesToGlobals,
        flushVmGlobalValuesIfNeeded,
        hardenArrayObject: deps.hardenArrayObject,
        globalBcCache: deps.globalBcCache,
        globalJitCache: deps.globalJitCache,
        maxGlobalCacheSize: deps.maxGlobalCacheSize,
        applyPostExecutionFastPathCaches,
        finalizeRunResult
    }));
}

function internalRunFastPathFromOwner(owner, code, deps) {
    return runFastPathOrchestrator(owner, code, createRunFastPathDeps({
        flushVmGlobalValuesIfNeeded,
        hardenArrayObject: deps.hardenArrayObject
    }));
}

async function internalRunAsyncFromOwner(owner, code, deps) {
    return await runAsyncOrchestrator(owner, code, createRunAsyncDeps({
        SeedLangErrorCtor: deps.SeedLangErrorCtor,
        buildRunErrorResult
    }));
}

module.exports = {
    createPublicRunRuntimeBindings
};
