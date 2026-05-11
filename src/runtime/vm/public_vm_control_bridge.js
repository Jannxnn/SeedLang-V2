'use strict';

const {
    setGraphicsHostOnVm,
    getTypeCheckerForVm,
    getSafetyForVm,
    getErrorReporterForVm,
    resetVmPublicState
} = require('./public_vm_runtime_controls');

function setGraphicsHostViaPublicControl(owner, host) {
    return setGraphicsHostOnVm(owner, host);
}

function getTypeCheckerViaPublicControl(owner) {
    return getTypeCheckerForVm(owner);
}

function getSafetyViaPublicControl(owner) {
    return getSafetyForVm(owner);
}

function getErrorReporterViaPublicControl(owner) {
    return getErrorReporterForVm(owner);
}

function resetViaPublicControl(owner, createReadOnlyGlobalsProxy) {
    return resetVmPublicState(owner, createReadOnlyGlobalsProxy);
}

function getDebuggerViaPublicControl(owner) {
    return owner._debugger;
}

function getProfilerViaPublicControl(owner) {
    return owner._profiler;
}

module.exports = {
    setGraphicsHostViaPublicControl,
    getTypeCheckerViaPublicControl,
    getSafetyViaPublicControl,
    getErrorReporterViaPublicControl,
    resetViaPublicControl,
    getDebuggerViaPublicControl,
    getProfilerViaPublicControl
};
