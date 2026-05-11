'use strict';
// VM 内置函数 - 数据类型模块：提供 type、toInt、toFloat、toString、toBool、len、keys、values、entries、merge 等类型转换与数据操作

function createDataBuiltins(helpers = {}) {
    const isDangerousObjectKey = typeof helpers.isDangerousObjectKey === 'function'
        ? helpers.isDangerousObjectKey
        : () => false;

    const safeParseJson = (rawText) => {
        try {
            const raw = JSON.parse(rawText);
            const sanitize = (o) => {
                if (o === null || typeof o !== 'object') return o;
                const c = Array.isArray(o) ? [] : Object.create(null);
                for (const k of Object.keys(o)) {
                    if (['__proto__', 'constructor', 'prototype'].includes(k)) continue;
                    c[k] = sanitize(o[k]);
                }
                return c;
            };
            return sanitize(raw);
        } catch {
            return null;
        }
    };

    return {
        parse: (args) => safeParseJson(args[0]),
        stringify: (args) => JSON.stringify(args[0]),
        jsonParse: (args) => safeParseJson(args[0]),
        jsonStringify: (args) => JSON.stringify(args[0]),
        replace: (args) => String(args[0] ?? '').replace(new RegExp(String(args[1] ?? ''), 'g'), String(args[2] ?? '')),
        substring: (args) => String(args[0] ?? '').substring(args[1] ?? 0, args[2]),
        charAt: (args) => {
            const src = String(args[0] ?? '');
            const idx = Number(args[1] ?? 0);
            return src.charAt(idx);
        },
        entries: (args) => {
            const v = args[0];
            if (v === null || v === undefined) return [];
            if (typeof v === 'object' && !Array.isArray(v)) return Object.entries(v);
            if (Array.isArray(v)) return v.map((vv, i) => [i, vv]);
            return [];
        },
        merge: (args) => {
            const result = Object.create(null);
            for (const arg of args) {
                if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
                    for (const k of Object.keys(arg)) {
                        if (isDangerousObjectKey(k)) continue;
                        result[k] = arg[k];
                    }
                }
            }
            return result;
        },
        toInt: (args) => parseInt(args[0]) || 0,
        toFloat: (args) => parseFloat(args[0]) || 0,
        toBool: (args) => {
            const v = args[0];
            if (v === null || v === undefined || v === 0 || v === '' || v === false) return false;
            if (Array.isArray(v) && v.length === 0) return false;
            return true;
        }
    };
}

module.exports = {
    createDataBuiltins
};
