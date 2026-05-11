'use strict';

const { isSensitiveGlobalName } = require('./global_guard_policy');
const { isUnsafeHostGlobalValue, hasUnsafeHostCallable } = require('./runtime_safety');

function sanitizeGlobalsForExecution(globals, isTrustedGlobalName) {
    if (!globals || typeof globals !== 'object') return;
    for (const name of Object.keys(globals)) {
        if (isTrustedGlobalName(name)) continue;
        const value = globals[name];
        if (isSensitiveGlobalName(name) || isUnsafeHostGlobalValue(value) || hasUnsafeHostCallable(value)) {
            delete globals[name];
        }
    }
}

module.exports = {
    sanitizeGlobalsForExecution
};
