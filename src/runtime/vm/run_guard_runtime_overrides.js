'use strict';

const { applyRunGuardExecutionLimitOverrides } = require('./run_guard_execution_limit_overrides');
const { applyRunGuardImportPolicyOverrides } = require('./run_guard_import_policy_overrides');

function applyRunGuardRuntimeOverrides(owner, options) {
    const hasExecutionLimitOverride = applyRunGuardExecutionLimitOverrides(owner, options);
    const hasImportPolicyOverride = applyRunGuardImportPolicyOverrides(owner, options);
    const runtimeGuardOverridesActive = hasExecutionLimitOverride || hasImportPolicyOverride || owner._vm._executionGuardEnabled;

    owner._vm._runtimeGuardOverridesActive = runtimeGuardOverridesActive;
    return runtimeGuardOverridesActive;
}

module.exports = {
    applyRunGuardRuntimeOverrides
};
