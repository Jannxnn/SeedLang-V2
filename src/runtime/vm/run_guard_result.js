'use strict';

function buildRunGuardProceedResult(runtimeGuardOverridesActive) {
    return {
        handled: false,
        allowSeedFastPath: !runtimeGuardOverridesActive
    };
}

module.exports = {
    buildRunGuardProceedResult
};
