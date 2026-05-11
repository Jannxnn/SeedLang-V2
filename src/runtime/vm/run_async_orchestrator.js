'use strict';

const { resolveRunAsyncBytecode } = require('./run_async_resolution');

async function runAsyncOrchestrator(owner, code, deps) {
    try {
        const bc = resolveRunAsyncBytecode(owner, code);
        return await owner._vm.runAsync(bc);
    } catch (error) {
        return deps.buildRunErrorResult(owner, code, error, deps.SeedLangErrorCtor);
    }
}

module.exports = {
    runAsyncOrchestrator
};
