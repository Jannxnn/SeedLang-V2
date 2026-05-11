'use strict';

function initializeVmOwner(owner, options, deps) {
    deps.initializeParserAndCompiler(
        owner,
        deps.runtimeDeps.FullParserCtor,
        deps.runtimeDeps.ParserCtor,
        deps.runtimeDeps.CompilerCtor,
        deps.runtimeDeps.convertAst
    );
    owner._vm = new deps.runtimeDeps.VMCtor({ ...options, _ownerCtor: owner.constructor });
    deps.initializePublicVmState(owner, options, deps.createReadOnlyGlobalsProxy, deps.createPublicVMFacade);
}

function createVmOwnerInitializer(deps) {
    return function initializeBoundVmOwner(owner, options) {
        return initializeVmOwner(owner, options, deps);
    };
}

module.exports = Object.freeze({
    initializeVmOwner,
    createVmOwnerInitializer
});
