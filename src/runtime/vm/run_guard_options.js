'use strict';

const { tryHandleRunWithChildVm } = require('./run_guard_child_vm');
const { applyRunGuardRuntimeOverrides } = require('./run_guard_runtime_overrides');
const { buildRunGuardProceedResult } = require('./run_guard_result');

function prepareRunGuardOptions(owner, options, runInChildVm) {
    const childVmHandled = tryHandleRunWithChildVm(owner, options, runInChildVm);
    if (childVmHandled) return childVmHandled;
    const runtimeGuardOverridesActive = applyRunGuardRuntimeOverrides(owner, options);
    return buildRunGuardProceedResult(runtimeGuardOverridesActive);
}

module.exports = {
    prepareRunGuardOptions
};
