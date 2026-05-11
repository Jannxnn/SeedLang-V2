'use strict';

const { setGlobalFromOwner, getGlobalFromOwner, deleteGlobalFromOwner } = require('./public_vm_globals_orchestrator');
const { isSensitiveGlobalName } = require('./global_guard_policy');
const { isUnsafeHostGlobalValue, hasUnsafeHostCallable } = require('./runtime_safety');
const { callGlobalNative, getGlobalNativeFn } = require('./public_vm_invocation');
const { hashString32 } = require('./vm_hash');

function setGlobalViaPublicApi(owner, name, value, options) {
    return setGlobalFromOwner(owner, name, value, options, {
        isSensitiveGlobalName,
        isUnsafeHostGlobalValue,
        hasUnsafeHostCallable
    });
}

function getGlobalViaPublicApi(owner, name) {
    return getGlobalFromOwner(owner, name);
}

function deleteGlobalViaPublicApi(owner, name) {
    return deleteGlobalFromOwner(owner, name);
}

function callGlobalViaPublicApi(owner, name, ...args) {
    return callGlobalNative(owner, name, ...args);
}

function getGlobalNativeViaPublicApi(owner, name) {
    return getGlobalNativeFn(owner, name);
}

function hashViaPublicApi(value) {
    return hashString32(value);
}

module.exports = {
    setGlobalViaPublicApi,
    getGlobalViaPublicApi,
    deleteGlobalViaPublicApi,
    callGlobalViaPublicApi,
    getGlobalNativeViaPublicApi,
    hashViaPublicApi
};
