'use strict';

function createPublicVmMainBridgeExports(deps) {
    return Object.freeze({
        createPublicVmRuntimeBindings: deps.createPublicVmRuntimeBindings,
        createPublicVmOwnerDelegates: deps.createPublicVmOwnerDelegates,
        wirePublicVmPrototype: deps.wirePublicVmPrototype,
        lifecycle: deps.namespaces.lifecycle,
        run: deps.namespaces.run,
        api: deps.namespaces.api,
        control: deps.namespaces.control
    });
}

module.exports = Object.freeze({
    createPublicVmMainBridgeExports
});
