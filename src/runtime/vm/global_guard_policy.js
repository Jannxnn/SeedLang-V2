'use strict';

const SENSITIVE_IMPORT_MODULES = new Set(['os', 'path', 'http']);
const SENSITIVE_GLOBAL_NAMES = new Set(['process', 'require', 'Function', 'eval', 'global', 'globalThis', 'window', 'document']);

function isSensitiveImportModule(name) {
    return typeof name === 'string' && SENSITIVE_IMPORT_MODULES.has(name);
}

function isSensitiveGlobalName(name) {
    return typeof name === 'string' && SENSITIVE_GLOBAL_NAMES.has(name);
}

module.exports = {
    SENSITIVE_IMPORT_MODULES,
    SENSITIVE_GLOBAL_NAMES,
    isSensitiveImportModule,
    isSensitiveGlobalName
};
