'use strict';

const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const INTERNAL_RUNTIME_KEYS = new Set([
    '_type', '_ctx', '_funcRef', '_nativeFn', '_nativeFnSrc', '_fr', '_cvArr', '_cvMap',
    '_localScopeArr', '_localCount', '_lsa', '_lc', '_start', '_isLeaf', '_isSelfRecursive',
    '_returnsInlineClosure', '_innerClosureIdx', '_innerInlineOp', '_cachedInlineClosure',
    'capturedVars', 'localScope', 'sharedCaptured'
]);

function isDangerousObjectKey(key) {
    if (typeof key === 'object' || typeof key === 'function') return true;
    return typeof key === 'string' && (DANGEROUS_OBJECT_KEYS.has(key) || INTERNAL_RUNTIME_KEYS.has(key) || key.startsWith('__seed_'));
}

function isInternalMetaKey(key) {
    return typeof key === 'string' && (INTERNAL_RUNTIME_KEYS.has(key) || key.startsWith('__seed_'));
}

function decodeSeedObjectKey(key) {
    if (typeof key !== 'string') return key;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(key)) {
        const n = Number(key);
        if (Number.isFinite(n) && String(n) === key) return n;
    }
    return key;
}

module.exports = {
    isDangerousObjectKey,
    isInternalMetaKey,
    decodeSeedObjectKey
};
