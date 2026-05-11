'use strict';

const { setGlobalOnVm, getGlobalFromVm, deleteGlobalFromVm } = require('./public_globals_api');

function setGlobalFromOwner(owner, name, value, options, deps) {
    return setGlobalOnVm(
        owner._vm,
        name,
        value,
        options,
        deps.isSensitiveGlobalName,
        deps.isUnsafeHostGlobalValue,
        deps.hasUnsafeHostCallable
    );
}

function getGlobalFromOwner(owner, name) {
    return getGlobalFromVm(owner._vm, name);
}

function deleteGlobalFromOwner(owner, name) {
    const trustedGlobalName = owner._vm._isTrustedGlobalName ? (n) => owner._vm._isTrustedGlobalName(n) : null;
    return deleteGlobalFromVm(owner._vm, name, trustedGlobalName);
}

module.exports = {
    setGlobalFromOwner,
    getGlobalFromOwner,
    deleteGlobalFromOwner
};
