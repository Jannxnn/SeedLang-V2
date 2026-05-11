'use strict';

function setGraphicsHostOnVm(owner, host) {
    if (host !== null && host !== undefined && typeof host !== 'object') {
        throw new Error('setGraphicsHost(host) expects object or null');
    }
    owner._vm._seedGraphicsHost = host || null;
    return true;
}

function getTypeCheckerForVm(owner) {
    if (!owner._typeChecker && owner._typeCheckerEnabled) {
        const { TypeChecker } = require('../../types/type-checker.js');
        owner._typeChecker = new TypeChecker();
    }
    return owner._typeChecker;
}

function getSafetyForVm(owner) {
    if (!owner._safety && owner._safetyOpts) {
        const { RuntimeSafety } = require('../../safety/runtime-safety.js');
        owner._safety = new RuntimeSafety(owner._safetyOpts);
    }
    return owner._safety;
}

function getErrorReporterForVm(owner) {
    if (!owner._errorReporter && owner._errorReporterOpts) {
        const { ErrorReporter } = require('../../errors/error-reporter.js');
        owner._errorReporter = new ErrorReporter(owner._errorReporterOpts);
    }
    return owner._errorReporter;
}

function resetVmPublicState(owner, createReadOnlyGlobalsProxy) {
    owner._vm.globals = Object.create(null);
    owner._vm._globalVals = null;
    owner._vm._jitFastPath = null;
    owner._vm.output = [];
    owner._vm.callStack = [];
    owner._readonlyGlobalsProxy = createReadOnlyGlobalsProxy(owner);
    if (owner._safety) {
        owner.safety.clearErrors();
    }
}

module.exports = {
    setGraphicsHostOnVm,
    getTypeCheckerForVm,
    getSafetyForVm,
    getErrorReporterForVm,
    resetVmPublicState
};
