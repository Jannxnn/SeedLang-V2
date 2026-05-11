'use strict';

function createPublicVmOwnerDelegates(runtimeBindings, SeedLangVMCtor) {
    const apiBridge = runtimeBindings.apiBridge;
    const controlBridge = runtimeBindings.controlBridge;
    const runRuntime = runtimeBindings.runRuntime;
    return Object.freeze({
        setGlobal(owner, name, value, options = {}) {
            return apiBridge.setGlobalViaPublicApi(owner, name, value, options);
        },
        getGlobal(owner, name) {
            return apiBridge.getGlobalViaPublicApi(owner, name);
        },
        deleteGlobal(owner, name) {
            return apiBridge.deleteGlobalViaPublicApi(owner, name);
        },
        setGraphicsHost(owner, host) {
            return controlBridge.setGraphicsHostViaPublicControl(owner, host);
        },
        getTypeChecker(owner) {
            return controlBridge.getTypeCheckerViaPublicControl(owner);
        },
        getSafety(owner) {
            return controlBridge.getSafetyViaPublicControl(owner);
        },
        getErrorReporter(owner) {
            return controlBridge.getErrorReporterViaPublicControl(owner);
        },
        reset(owner) {
            return controlBridge.resetVmOwner(owner);
        },
        run(owner, code, options = {}) {
            return runRuntime.run(owner, code, options, SeedLangVMCtor);
        },
        runFastPath(owner, code) {
            return runRuntime.runFastPath(owner, code);
        },
        call(owner, name, ...args) {
            return apiBridge.callGlobalViaPublicApi(owner, name, ...args);
        },
        getNativeFn(owner, name) {
            return apiBridge.getGlobalNativeViaPublicApi(owner, name);
        },
        async runAsync(owner, code) {
            return await runRuntime.runAsync(owner, code);
        },
        hash(s) {
            return apiBridge.hashViaPublicApi(s);
        },
        getDebugger(owner) {
            return controlBridge.getDebuggerViaPublicControl(owner);
        },
        getProfiler(owner) {
            return controlBridge.getProfilerViaPublicControl(owner);
        }
    });
}

function wirePublicVmPrototype(SeedLangVMCtor, delegates) {
    const proto = SeedLangVMCtor.prototype;
    Object.defineProperties(proto, {
        setGlobal: {
            value: function setGlobal(name, value, options = {}) {
                return delegates.setGlobal(this, name, value, options);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        getGlobal: {
            value: function getGlobal(name) {
                return delegates.getGlobal(this, name);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        deleteGlobal: {
            value: function deleteGlobal(name) {
                return delegates.deleteGlobal(this, name);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        setGraphicsHost: {
            value: function setGraphicsHost(host) {
                return delegates.setGraphicsHost(this, host);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        typeChecker: {
            get: function typeChecker() {
                return delegates.getTypeChecker(this);
            },
            configurable: true,
            enumerable: false
        },
        safety: {
            get: function safety() {
                return delegates.getSafety(this);
            },
            configurable: true,
            enumerable: false
        },
        errorReporter: {
            get: function errorReporter() {
                return delegates.getErrorReporter(this);
            },
            configurable: true,
            enumerable: false
        },
        reset: {
            value: function reset() {
                return delegates.reset(this);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        run: {
            value: function run(code, options = {}) {
                return delegates.run(this, code, options);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        runFastPath: {
            value: function runFastPath(code) {
                return delegates.runFastPath(this, code);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        call: {
            value: function call(name, ...args) {
                return delegates.call(this, name, ...args);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        getNativeFn: {
            value: function getNativeFn(name) {
                return delegates.getNativeFn(this, name);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        runAsync: {
            value: async function runAsync(code) {
                return await delegates.runAsync(this, code);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        hash: {
            value: function hash(s) {
                return delegates.hash(s);
            },
            writable: true,
            configurable: true,
            enumerable: false
        },
        debugger: {
            get: function debugger_() {
                return delegates.getDebugger(this);
            },
            configurable: true,
            enumerable: false
        },
        profiler: {
            get: function profiler_() {
                return delegates.getProfiler(this);
            },
            configurable: true,
            enumerable: false
        }
    });
    return SeedLangVMCtor;
}

module.exports = Object.freeze({
    createPublicVmOwnerDelegates,
    wirePublicVmPrototype
});
