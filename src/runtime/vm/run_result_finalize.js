'use strict';

function finalizeRunResult(vmInstance, result) {
    if (vmInstance.safety && vmInstance.safety.hasErrors()) {
        result.safetyErrors = vmInstance.safety.getErrors();
        result.safetyReport = vmInstance.safety.getErrorReport();
    }
    return result;
}

module.exports = {
    finalizeRunResult
};
