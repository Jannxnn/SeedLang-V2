'use strict';

const { resolveRunFastPathBytecode } = require('./run_fast_path_resolution');
const { executeRunFastPath } = require('./run_fast_path_execute');

function runFastPathOrchestrator(owner, code, deps) {
    const fastPathResolution = resolveRunFastPathBytecode(owner, code);
    if (fastPathResolution.fallbackToRun) return owner.run(code);
    return executeRunFastPath(owner, fastPathResolution.bc, deps.flushVmGlobalValuesIfNeeded, deps.hardenArrayObject);
}

module.exports = {
    runFastPathOrchestrator
};
