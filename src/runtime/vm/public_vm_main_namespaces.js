'use strict';

function createResetVmOwner(resetViaPublicControl, createReadOnlyGlobalsProxy) {
    return function resetVmOwner(owner) {
        return resetViaPublicControl(owner, createReadOnlyGlobalsProxy);
    };
}

function createPublicVmNamespaces(deps) {
    const resetVmOwner = createResetVmOwner(deps.resetViaPublicControl, deps.createReadOnlyGlobalsProxy);

    const lifecycle = Object.freeze({
        createReadOnlyGlobalsProxy: deps.createReadOnlyGlobalsProxy,
        createPublicVMFacade: deps.createPublicVMFacade,
        initializePublicVmState: deps.initializePublicVmState,
        initializeParserAndCompiler: deps.initializeParserAndCompiler,
        initializeVmOwner: deps.initializeVmOwner,
        createVmOwnerInitializer: deps.createVmOwnerInitializer
    });

    const run = Object.freeze({
        createPublicRunRuntimeBindings: deps.createPublicRunRuntimeBindings
    });

    const api = Object.freeze({
        setGlobalViaPublicApi: deps.setGlobalViaPublicApi,
        getGlobalViaPublicApi: deps.getGlobalViaPublicApi,
        deleteGlobalViaPublicApi: deps.deleteGlobalViaPublicApi,
        callGlobalViaPublicApi: deps.callGlobalViaPublicApi,
        getGlobalNativeViaPublicApi: deps.getGlobalNativeViaPublicApi,
        hashViaPublicApi: deps.hashViaPublicApi
    });

    const control = Object.freeze({
        setGraphicsHostViaPublicControl: deps.setGraphicsHostViaPublicControl,
        getTypeCheckerViaPublicControl: deps.getTypeCheckerViaPublicControl,
        getSafetyViaPublicControl: deps.getSafetyViaPublicControl,
        getErrorReporterViaPublicControl: deps.getErrorReporterViaPublicControl,
        resetViaPublicControl: deps.resetViaPublicControl,
        getDebuggerViaPublicControl: deps.getDebuggerViaPublicControl,
        getProfilerViaPublicControl: deps.getProfilerViaPublicControl,
        resetVmOwner
    });

    return Object.freeze({
        lifecycle,
        run,
        api,
        control
    });
}

module.exports = Object.freeze({
    createPublicVmNamespaces
});
