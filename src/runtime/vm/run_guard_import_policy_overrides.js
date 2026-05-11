'use strict';

function applyRunGuardImportPolicyOverrides(owner, options) {
    const hasAllowSensitiveImportsOverride = Object.prototype.hasOwnProperty.call(options, 'allowSensitiveImports');
    const hasAllowedImportsOverride = Array.isArray(options.allowedImports);
    const hasImportPolicyOverride = hasAllowSensitiveImportsOverride || hasAllowedImportsOverride;

    if (!hasImportPolicyOverride) return false;

    if (hasAllowSensitiveImportsOverride) {
        owner._vm._allowSensitiveImports = options.allowSensitiveImports === true;
    }
    owner._vm._allowedImportSet = owner._vm._buildAllowedImportSet(options.allowedImports, owner._vm._allowSensitiveImports);

    return true;
}

module.exports = {
    applyRunGuardImportPolicyOverrides
};
