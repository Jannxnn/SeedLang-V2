'use strict';

function validateJitConsts(consts) {
    if (!consts) return true;
    const DANGEROUS_PATTERNS = [/\beval\b/, /\bFunction\b/, /\brequire\b/, /\bprocess\b/, /\bglobal\b/, /\b__proto__\b/, /\bconstructor\b/, /\bprototype\b/];
    for (let i = 0; i < consts.length; i++) {
        const v = consts[i];
        if (typeof v === 'string') {
            for (const pat of DANGEROUS_PATTERNS) {
                if (pat.test(v)) return false;
            }
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            if (v.type === 'func' || v.type === 'coroutine_def' || v._type === 'class') continue;
            const keys = Object.keys(v);
            for (const key of keys) {
                if (typeof key === 'string') {
                    for (const pat of DANGEROUS_PATTERNS) {
                        if (pat.test(key)) return false;
                    }
                }
                const val = v[key];
                if (typeof val === 'string') {
                    for (const pat of DANGEROUS_PATTERNS) {
                        if (pat.test(val)) return false;
                    }
                }
            }
        }
    }
    return true;
}

function safeNewFunction(argNames, body) {
    const DANGEROUS = [/\beval\s*\(/, /\bFunction\s*\(/, /\brequire\s*\(/, /\bprocess\./, /\bglobal\./, /\b__proto__\s*[=\[]/, /\bconstructor\s*[=\[]/, /\bprototype\s*[=\[]/];
    for (const pat of DANGEROUS) {
        if (pat.test(body)) return null;
    }
    try {
        if (Array.isArray(argNames)) {
            return new Function(...argNames, body);
        }
        return new Function(argNames, body);
    } catch(e) {
        return null;
    }
}

module.exports = {
    validateJitConsts,
    safeNewFunction
};
