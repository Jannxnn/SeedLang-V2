'use strict';

const { createReadOnlyGlobalsProxy, createPublicVMFacade } = require('./public_vm_facade');
const { initializePublicVmState } = require('./public_vm_init_orchestrator');
const { initializeParserAndCompiler } = require('./public_vm_parser_bootstrap');
const { createPublicRunRuntimeBindings } = require('./public_vm_run_bridge');
const {
    setGlobalViaPublicApi,
    getGlobalViaPublicApi,
    deleteGlobalViaPublicApi,
    callGlobalViaPublicApi,
    getGlobalNativeViaPublicApi,
    hashViaPublicApi
} = require('./public_vm_api_bridge');
const {
    setGraphicsHostViaPublicControl,
    getTypeCheckerViaPublicControl,
    getSafetyViaPublicControl,
    getErrorReporterViaPublicControl,
    resetViaPublicControl,
    getDebuggerViaPublicControl,
    getProfilerViaPublicControl
} = require('./public_vm_control_bridge');
const {
    createPublicVmOwnerDelegates,
    wirePublicVmPrototype
} = require('./public_vm_owner_bridge');
const {
    initializeVmOwner,
    createVmOwnerInitializer
} = require('./public_vm_owner_init_bridge');
const { createPublicVmOwnerInitAdapters } = require('./public_vm_owner_init_adapters');
const {
    createOwnerInitAdapterDeps,
    createNamespaceDeps,
    createRuntimeBindingsDeps
} = require('./public_vm_main_bridge_deps');
const { createPublicVmMainBridgeExports } = require('./public_vm_main_bridge_exports');
const { createPublicVmNamespaces } = require('./public_vm_main_namespaces');
const { createPublicVmRuntimeBindings: createPublicVmRuntimeBindingsFromModule } = require('./public_vm_runtime_bindings');

const ownerInitAdapters = createPublicVmOwnerInitAdapters(createOwnerInitAdapterDeps({
    initializeParserAndCompiler,
    initializePublicVmState,
    createReadOnlyGlobalsProxy,
    createPublicVMFacade,
    initializeVmOwner,
    createVmOwnerInitializer
}));

function createPublicVmRuntimeBindings(deps) {
    return createPublicVmRuntimeBindingsFromModule(
        createRuntimeBindingsDeps({ createPublicRunRuntimeBindings }, ownerInitAdapters, namespaces, deps)
    );
}
const namespaces = createPublicVmNamespaces(createNamespaceDeps({
    createReadOnlyGlobalsProxy,
    createPublicVMFacade,
    initializePublicVmState,
    initializeParserAndCompiler,
    createPublicRunRuntimeBindings,
    setGlobalViaPublicApi,
    getGlobalViaPublicApi,
    deleteGlobalViaPublicApi,
    callGlobalViaPublicApi,
    getGlobalNativeViaPublicApi,
    hashViaPublicApi,
    setGraphicsHostViaPublicControl,
    getTypeCheckerViaPublicControl,
    getSafetyViaPublicControl,
    getErrorReporterViaPublicControl,
    resetViaPublicControl
}, ownerInitAdapters));

module.exports = createPublicVmMainBridgeExports({
    createPublicVmRuntimeBindings,
    createPublicVmOwnerDelegates,
    wirePublicVmPrototype,
    namespaces
});
