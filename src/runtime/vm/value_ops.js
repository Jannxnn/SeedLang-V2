'use strict';

const { SeedLangError } = require('./errors');

const MAX_STRING_REPEAT_RESULT_LEN = 8 * 1024 * 1024;
const MAX_STRING_VALUE_LEN = 256 * 1024;

function safeAddValues(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (typeof a === 'string' || typeof b === 'string') {
        const sa = typeof a === 'string' ? a : String(a);
        const sb = typeof b === 'string' ? b : String(b);
        if (sa.length + sb.length > MAX_STRING_VALUE_LEN) {
            throw new SeedLangError('String too large', 'RuntimeError', 0, []);
        }
        return sa + sb;
    }
    return a + b;
}

function normalizeNumericOperand(value) {
    if (typeof value === 'string' && value.length === 1) {
        return value.charCodeAt(0);
    }
    if (typeof value === 'string') {
        const m = value.match(/^(-?\d+(?:\.\d+)?)(.)$/);
        if (m) {
            return Number(m[1]) + m[2].charCodeAt(0);
        }
    }
    return value;
}

function seedEquals(a, b) {
    if (a === b) return true;
    const aNullish = a === null || a === undefined;
    const bNullish = b === null || b === undefined;
    if (aNullish && bNullish) return true;
    if ((aNullish && b === false) || (bNullish && a === false)) return true;
    return false;
}

function safeRepeatString(value, count) {
    const n = Number(count);
    if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
        throw new SeedLangError('Invalid string repeat count', 'RuntimeError', 0, []);
    }
    if (value.length === 0 || n === 0) return '';
    if (n > Math.floor(MAX_STRING_REPEAT_RESULT_LEN / value.length)) {
        throw new SeedLangError('String repeat too large', 'RuntimeError', 0, []);
    }
    return value.repeat(n);
}

module.exports = {
    safeAddValues,
    normalizeNumericOperand,
    seedEquals,
    safeRepeatString,
    MAX_STRING_REPEAT_RESULT_LEN,
    MAX_STRING_VALUE_LEN
};
