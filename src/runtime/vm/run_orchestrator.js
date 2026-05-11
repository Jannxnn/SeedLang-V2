'use strict';

const { prepareRunExecutionOrchestrator } = require('./run_pre_execution_orchestrator');
const { executeRunAndFinalize } = require('./run_execute_finalize');
const { buildRunErrorResult } = require('./run_error_result');

function runOrchestrator(owner, code, options, allowSeedFastPath, SeedLangErrorCtor, deps) {
    try {
        const runOrchestration = prepareRunExecutionOrchestrator(
            owner,
            code,
            options,
            allowSeedFastPath,
            deps
        );
        if (runOrchestration.handled) return runOrchestration.result;
        const resolvedCode = runOrchestration.code;
        return executeRunAndFinalize(
            owner,
            runOrchestration.bc,
            resolvedCode,
            deps.flushVmGlobalValuesIfNeeded,
            deps.hardenArrayObject,
            deps.applyPostExecutionFastPathCaches,
            deps.finalizeRunResult,
            deps.globalJitCache,
            deps.maxGlobalCacheSize
        );
    } catch (error) {
        return buildRunErrorResult(owner, code, error, SeedLangErrorCtor);
    }
}

module.exports = {
    runOrchestrator
};
