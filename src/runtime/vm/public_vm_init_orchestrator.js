'use strict';

const { Debugger } = require('./debugger');
const { Profiler } = require('./profiler');

function initializePublicVmState(owner, options, createReadOnlyGlobalsProxy, createPublicVMFacade) {
    owner._readonlyGlobalsProxy = createReadOnlyGlobalsProxy(owner);
    owner.vm = createPublicVMFacade(owner);
    owner.cache = new Map();
    owner.options = options;

    owner.jit = owner._vm.jit;
    owner.aiSessionManager = owner._vm.aiSessionManager;
    owner.isolatedContext = owner._vm.isolatedContext;
    owner.concurrentSafeVM = owner._vm.concurrentSafeVM;
    owner.asyncRuntime = owner._vm.asyncRuntime;
    owner.eventLoop = owner._vm.eventLoop;
    owner.asyncQueue = owner._vm.asyncQueue;
    owner.wasmLoader = owner._vm.wasmLoader;
    owner.moduleSystem = owner._vm.moduleSystem;

    owner._typeChecker = null;
    owner._typeCheckerEnabled = options.typeCheck !== false;
    owner._safety = null;
    owner._safetyOpts = options.safeMode !== false ? {
        strict: options.strictMode || false,
        checkBounds: options.checkBounds !== false,
        checkTypes: options.checkTypes !== false,
        checkNull: options.checkNull !== false
    } : null;
    owner._errorReporter = null;
    owner._errorReporterOpts = options.errorReporter !== false ? {
        colors: options.colors !== false,
        verbose: options.verbose || false,
        aiFriendly: options.aiFriendly || false
    } : null;
    owner._debugger = new Debugger(owner._vm);
    owner._profiler = new Profiler(owner._vm);
}

module.exports = {
    initializePublicVmState
};
