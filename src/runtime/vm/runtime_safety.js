'use strict';

const { isInternalMetaKey } = require('./object_key_safety');

const HARDENED_ARRAY_MARK = Symbol('seed.hardened_array');

function isRuntimeTaggedObject(value) {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return true;
    if (Object.getPrototypeOf(value) === null) return true;
    return typeof value._type === 'string';
}

function isUnsafeHostGlobalValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'function') return true;
    if (typeof value !== 'object') return false;
    if (isRuntimeTaggedObject(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto !== null;
}

function hasUnsafeHostCallable(value, depth = 0) {
    if (depth > 2 || value === null || value === undefined) return false;
    if (typeof value === 'function') return true;
    if (typeof value !== 'object') return false;
    if (!isRuntimeTaggedObject(value)) return true;
    if (Array.isArray(value)) {
        if (value[HARDENED_ARRAY_MARK] === 1) return false;
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) {
            if (hasUnsafeHostCallable(value[keys[i]], depth + 1)) return true;
        }
        return false;
    }
    for (const key of Object.keys(value)) {
        if (isInternalMetaKey(key)) continue;
        if (hasUnsafeHostCallable(value[key], depth + 1)) return true;
    }
    return false;
}

function hardenArrayObject(arr) {
    if (!Array.isArray(arr)) return arr;
    if (arr[HARDENED_ARRAY_MARK] === 1) return arr;
    try {
        Object.defineProperty(arr, 'constructor', { value: undefined, writable: false, enumerable: false, configurable: false });
        Object.defineProperty(arr, '__proto__', { value: undefined, writable: false, enumerable: false, configurable: false });
        Object.defineProperty(arr, 'prototype', { value: undefined, writable: false, enumerable: false, configurable: false });
        Object.defineProperty(arr, HARDENED_ARRAY_MARK, { value: 1, writable: false, enumerable: false, configurable: false });
    } catch (_) {}
    return arr;
}

module.exports = {
    HARDENED_ARRAY_MARK,
    isRuntimeTaggedObject,
    isUnsafeHostGlobalValue,
    hasUnsafeHostCallable,
    hardenArrayObject
};
