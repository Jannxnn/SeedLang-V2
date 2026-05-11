'use strict';

function createPublicVmOwnerInitAdapters(deps) {
    function createOwnerInitBridgeDeps(runtimeDeps) {
        return {
            initializeParserAndCompiler: deps.initializeParserAndCompiler,
            initializePublicVmState: deps.initializePublicVmState,
            createReadOnlyGlobalsProxy: deps.createReadOnlyGlobalsProxy,
            createPublicVMFacade: deps.createPublicVMFacade,
            runtimeDeps
        };
    }

    return Object.freeze({
        createVmOwnerInitializerForRuntimeBindings(runtimeDeps) {
            return deps.createVmOwnerInitializer(createOwnerInitBridgeDeps(runtimeDeps));
        },
        initializeVmOwnerViaBridge(owner, options, runtimeDeps) {
            return deps.initializeVmOwner(owner, options, createOwnerInitBridgeDeps(runtimeDeps));
        },
        createVmOwnerInitializerViaBridge(runtimeDeps) {
            return deps.createVmOwnerInitializer(createOwnerInitBridgeDeps(runtimeDeps));
        }
    });
}

module.exports = Object.freeze({
    createPublicVmOwnerInitAdapters
});
