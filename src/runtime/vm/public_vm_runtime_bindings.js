'use strict';

function createPublicVmRuntimeBindings(deps) {
    const runRuntime = deps.createPublicRunRuntimeBindings(deps.runtimeDeps);
    const initializeOwner = deps.createVmOwnerInitializer(deps.runtimeDeps);
    return Object.freeze({
        runRuntime,
        initializeOwner,
        globalBcCache: runRuntime.globalBcCache,
        globalJitCache: runRuntime.globalJitCache,
        apiBridge: deps.apiBridge,
        controlBridge: deps.controlBridge
    });
}

module.exports = Object.freeze({
    createPublicVmRuntimeBindings
});
