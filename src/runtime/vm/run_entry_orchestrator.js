'use strict';

const { prepareRunGuardOptions } = require('./run_guard_options');
const { runOrchestrator } = require('./run_orchestrator');
const { createRunChildFallback } = require('./run_child_fallback');

function runEntryOrchestrator(owner, code, options, SeedLangVMCtor, SeedLangErrorCtor, deps) {
    const runPreparation = prepareRunGuardOptions(owner, options, createRunChildFallback(SeedLangVMCtor, code));
    if (runPreparation.handled) return runPreparation.result;
    return runOrchestrator(owner, code, options, runPreparation.allowSeedFastPath, SeedLangErrorCtor, deps);
}

module.exports = {
    runEntryOrchestrator
};
