'use strict';

function tryHandleRunWithChildVm(owner, options, runInChildVm) {
    const hasRunPreserveGlobals = Object.prototype.hasOwnProperty.call(options, 'preserveGlobals');
    const runIsolated = options.isolatedRun === true;
    if (!runIsolated && !hasRunPreserveGlobals) return null;

    const requestedPreserveGlobals = runIsolated ? false : options.preserveGlobals !== false;
    if (requestedPreserveGlobals === owner._vm.preserveGlobals) return null;

    const childOptions = { ...(owner.options || {}), preserveGlobals: requestedPreserveGlobals };
    const forwardedOptions = { ...options };
    delete forwardedOptions.isolatedRun;
    delete forwardedOptions.preserveGlobals;

    return {
        handled: true,
        result: runInChildVm(childOptions, forwardedOptions)
    };
}

module.exports = {
    tryHandleRunWithChildVm
};
