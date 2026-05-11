'use strict';

function applyRunGuardExecutionLimitOverrides(owner, options) {
    const runMaxInstructions = Number(options.maxInstructions);
    const hasRunMaxInstructions = Number.isFinite(runMaxInstructions) && runMaxInstructions > 0;
    const runMaxExecutionMs = Number(options.maxExecutionMs);
    const hasRunMaxExecutionMs = Number.isFinite(runMaxExecutionMs) && runMaxExecutionMs > 0;
    const hasRunExecutionGuard = typeof options.executionGuard === 'boolean';

    if (hasRunMaxInstructions) {
        owner._vm._maxInstructions = Math.floor(runMaxInstructions);
    }
    if (hasRunMaxExecutionMs) {
        owner._vm._maxExecutionMs = Math.floor(runMaxExecutionMs);
    }
    if (hasRunExecutionGuard) {
        owner._vm._executionGuardEnabled = options.executionGuard;
    }

    return hasRunMaxInstructions || hasRunMaxExecutionMs || hasRunExecutionGuard;
}

module.exports = {
    applyRunGuardExecutionLimitOverrides
};
