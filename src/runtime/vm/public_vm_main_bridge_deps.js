'use strict';

function createOwnerInitAdapterDeps(deps) {
    return Object.freeze({
        initializeParserAndCompiler: deps.initializeParserAndCompiler,
        initializePublicVmState: deps.initializePublicVmState,
        createReadOnlyGlobalsProxy: deps.createReadOnlyGlobalsProxy,
        createPublicVMFacade: deps.createPublicVMFacade,
        initializeVmOwner: deps.initializeVmOwner,
        createVmOwnerInitializer: deps.createVmOwnerInitializer
    });
}

function createNamespaceDeps(deps, ownerInitAdapters) {
    return Object.freeze({
        createReadOnlyGlobalsProxy: deps.createReadOnlyGlobalsProxy,
        createPublicVMFacade: deps.createPublicVMFacade,
        initializePublicVmState: deps.initializePublicVmState,
        initializeParserAndCompiler: deps.initializeParserAndCompiler,
        initializeVmOwner: ownerInitAdapters.initializeVmOwnerViaBridge,
        createVmOwnerInitializer: ownerInitAdapters.createVmOwnerInitializerViaBridge,
        createPublicRunRuntimeBindings: deps.createPublicRunRuntimeBindings,
        setGlobalViaPublicApi: deps.setGlobalViaPublicApi,
        getGlobalViaPublicApi: deps.getGlobalViaPublicApi,
        deleteGlobalViaPublicApi: deps.deleteGlobalViaPublicApi,
        callGlobalViaPublicApi: deps.callGlobalViaPublicApi,
        getGlobalNativeViaPublicApi: deps.getGlobalNativeViaPublicApi,
        hashViaPublicApi: deps.hashViaPublicApi,
        setGraphicsHostViaPublicControl: deps.setGraphicsHostViaPublicControl,
        getTypeCheckerViaPublicControl: deps.getTypeCheckerViaPublicControl,
        getSafetyViaPublicControl: deps.getSafetyViaPublicControl,
        getErrorReporterViaPublicControl: deps.getErrorReporterViaPublicControl,
        resetViaPublicControl: deps.resetViaPublicControl,
        getDebuggerViaPublicControl: deps.getDebuggerViaPublicControl,
        getProfilerViaPublicControl: deps.getProfilerViaPublicControl
    });
}

function createRuntimeBindingsDeps(deps, ownerInitAdapters, namespaces, runtimeDeps) {
    return Object.freeze({
        createPublicRunRuntimeBindings: deps.createPublicRunRuntimeBindings,
        createVmOwnerInitializer: ownerInitAdapters.createVmOwnerInitializerForRuntimeBindings,
        runtimeDeps,
        apiBridge: namespaces.api,
        controlBridge: namespaces.control
    });
}

module.exports = Object.freeze({
    createOwnerInitAdapterDeps,
    createNamespaceDeps,
    createRuntimeBindingsDeps
});
