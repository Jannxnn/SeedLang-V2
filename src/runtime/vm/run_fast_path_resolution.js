'use strict';

function resolveRunFastPathBytecode(owner, code) {
    if (code === owner._lastCode) {
        return { fallbackToRun: false, bc: owner._lastBc };
    }

    const h = owner.hash(code);
    const bc = owner.cache.get(h);
    if (!bc) {
        return { fallbackToRun: true };
    }

    owner._lastCode = code;
    owner._lastBc = bc;
    return { fallbackToRun: false, bc };
}

module.exports = {
    resolveRunFastPathBytecode
};
