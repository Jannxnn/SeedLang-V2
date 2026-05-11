'use strict';
// VM 内置函数 - 集合操作模块：提供数组/对象的 map、filter、reduce、slice、sort、reverse、indexOf 等集合方法

function createCollectionBuiltins(vm, helpers = {}) {
    const isInternalMetaKey = typeof helpers.isInternalMetaKey === 'function'
        ? helpers.isInternalMetaKey
        : () => false;
    const decodeSeedObjectKey = typeof helpers.decodeSeedObjectKey === 'function'
        ? helpers.decodeSeedObjectKey
        : (key) => key;

    return {
        len: (args) => {
            const v = args[0];
            if (v === null || v === undefined) return 0;
            if (v?._type === 'coroutine' && v._values) return v._values.length;
            if (Array.isArray(v) || typeof v === 'string') return v.length;
            if (typeof v === 'object') return Object.keys(v).length;
            return 0;
        },
        keys: (args) => {
            const v = args[0];
            if (v === null || v === undefined) return [];
            if (v?._type === 'coroutine') {
                const values = [];
                if (v.state !== 'done' && vm && typeof vm._coroutineResume === 'function') {
                    while (v.state !== 'done') {
                        const val = vm._coroutineResume(v, undefined);
                        if (v.state === 'done' && (val === null || val === undefined)) break;
                        values.push(val);
                    }
                }
                v._values = values;
                return values.map((_, i) => i);
            }
            if (typeof v === 'string') return Array.from({ length: v.length }, (_, i) => i);
            if (typeof v === 'object' && !Array.isArray(v)) {
                const keys = Object.keys(v);
                if (typeof v._type === 'string') {
                    return keys
                        .filter((k) => !isInternalMetaKey(k) && !k.startsWith('_'))
                        .map(decodeSeedObjectKey);
                }
                return keys.filter((k) => !isInternalMetaKey(k)).map(decodeSeedObjectKey);
            }
            if (Array.isArray(v)) return v.map((_, i) => i);
            return [];
        },
        values: (args) => {
            const v = args[0];
            if (v === null || v === undefined) return [];
            if (typeof v === 'object' && !Array.isArray(v)) return Object.values(v);
            if (Array.isArray(v)) return v;
            return [];
        },
        push: (args) => {
            const arr = args[0];
            if (!Array.isArray(arr)) throw new Error('push() expects array as first argument');
            arr[arr.length] = args[1];
            return arr;
        },
        /** Host VM no-op; CLC uses sl_arr_reserve (capacity only). */
        reserve: (args) => {
            return args[0];
        },
        /** Host VM returns []; CLC uses sl_arr_new_i32. */
        withCapacity: (args) => {
            return [];
        },
        pop: (args) => {
            const arr = args[0];
            if (!Array.isArray(arr)) throw new Error('pop() expects array as first argument');
            if (arr.length === 0) return undefined;
            const idx = arr.length - 1;
            const value = arr[idx];
            arr.length = idx;
            return value;
        },
        shift: (args) => {
            const arr = args[0];
            if (!Array.isArray(arr)) throw new Error('shift() expects array as first argument');
            if (arr.length === 0) return undefined;
            const first = arr[0];
            for (let i = 1; i < arr.length; i++) arr[i - 1] = arr[i];
            arr.length = arr.length - 1;
            return first;
        },
        range: (args) => {
            let start;
            let end;
            let step = 1;
            if (args.length === 1) {
                start = 0;
                end = args[0];
            } else if (args.length >= 2) {
                start = args[0];
                end = args[1];
                if (args.length >= 3) step = args[2];
            }
            if (step === 0) throw new Error('range() step cannot be zero');
            const span = end - start;
            if (typeof start !== 'number' || typeof end !== 'number' || typeof step !== 'number') {
                throw new Error('range() expects numeric arguments');
            }
            if ((step > 0 && span > 0) || (step < 0 && span < 0)) {
                const count = Math.ceil(Math.abs(span / step));
                if (count > vm._maxRangeItems) {
                    throw new Error(`range() exceeds max items (${vm._maxRangeItems})`);
                }
            }
            const result = [];
            for (let i = start; step > 0 ? i < end : i > end; i += step) {
                result.push(i);
            }
            return result;
        },
        rangeRev: (args) => {
            if (args.length < 1 || args.length > 2) {
                throw new Error('rangeRev() expects 1 or 2 arguments');
            }
            const hi = args[0];
            if (typeof hi !== 'number') throw new Error('rangeRev() expects numeric arguments');
            if (args.length === 1) {
                const n = hi;
                const count = n > 0 ? n : 0;
                if (count > vm._maxRangeItems) {
                    throw new Error(`rangeRev() exceeds max items (${vm._maxRangeItems})`);
                }
                const result = [];
                for (let i = n - 1; i >= 0; i--) result.push(i);
                return result;
            }
            const lo = args[1];
            if (typeof lo !== 'number') throw new Error('rangeRev() expects numeric arguments');
            const count = hi > lo ? hi - lo : 0;
            if (count > vm._maxRangeItems) {
                throw new Error(`rangeRev() exceeds max items (${vm._maxRangeItems})`);
            }
            const result = [];
            for (let i = hi - 1; i >= lo; i--) result.push(i);
            return result;
        },
        concat: (args) => {
            const result = [];
            for (const arg of args) {
                if (Array.isArray(arg)) {
                    for (let i = 0; i < arg.length; i++) result[result.length] = arg[i];
                } else {
                    result[result.length] = arg;
                }
            }
            return result;
        },
        sort: (args) => {
            const arr = args[0];
            if (!Array.isArray(arr)) return arr;
            const copy = new Array(arr.length);
            for (let i = 0; i < arr.length; i++) copy[i] = arr[i];
            const cmp = (a, b) => {
                if (a === b) return 0;
                if (typeof a === 'number' && typeof b === 'number') return a - b;
                if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
                if (Array.isArray(a) && Array.isArray(b)) {
                    const n = Math.min(a.length, b.length);
                    for (let i = 0; i < n; i++) {
                        const d = cmp(a[i], b[i]);
                        if (d !== 0) return d;
                    }
                    return a.length - b.length;
                }
                return String(a).localeCompare(String(b));
            };
            return copy.sort(cmp);
        },
        reverse: (args) => {
            const arr = args[0];
            if (!Array.isArray(arr)) return arr;
            const copy = new Array(arr.length);
            for (let i = 0; i < arr.length; i++) copy[i] = arr[arr.length - 1 - i];
            return copy;
        },
        slice: (args) => {
            const arr = args[0];
            const start = args[1] ?? 0;
            const end = args[2];
            if (!Array.isArray(arr) && typeof arr !== 'string') return arr;
            if (typeof arr === 'string') return arr.slice(start, end);
            const len = arr.length;
            let s = Number(start);
            if (!Number.isFinite(s)) s = 0;
            if (s < 0) s = Math.max(len + Math.trunc(s), 0);
            else s = Math.min(Math.trunc(s), len);
            let e = end === undefined ? len : Number(end);
            if (!Number.isFinite(e)) e = len;
            if (e < 0) e = Math.max(len + Math.trunc(e), 0);
            else e = Math.min(Math.trunc(e), len);
            const out = [];
            for (let i = s; i < e; i++) out[out.length] = arr[i];
            return out;
        },
        indexOf: (args) => {
            const arr = args[0];
            const val = args[1];
            if (!Array.isArray(arr) && typeof arr !== 'string') return -1;
            if (typeof arr === 'string') return arr.indexOf(val);
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] === val) return i;
            }
            return -1;
        },
        map: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!fn) return arr;
            const results = [];
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                if (fn?._type === 'closure') {
                    results.push(vm._callClosure(fn, [item, idx]));
                } else if (typeof fn === 'function') {
                    results.push(fn([item, idx]));
                } else {
                    results.push(item);
                }
            }
            return results;
        },
        filter: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!fn) return arr;
            const results = [];
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                let result = false;
                if (fn?._type === 'closure') {
                    result = vm._callClosure(fn, [item, idx]);
                } else if (typeof fn === 'function') {
                    result = fn([item, idx]);
                }
                if (result) results.push(item);
            }
            return results;
        },
        reduce: (args) => {
            const arr = args[0] ?? [];
            let a1 = args[1];
            let a2 = args[2];
            const a1IsFn = a1?._type === 'closure' || typeof a1 === 'function';
            const a2IsFn = a2?._type === 'closure' || typeof a2 === 'function';
            let acc, fn;
            if (a1IsFn && !a2IsFn) { fn = a1; acc = a2; }
            else { acc = a1; fn = a2; }
            if (!fn) return acc;
            const fnIsFn = fn?._type === 'closure' || typeof fn === 'function';
            if (!fnIsFn) return acc;
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                if (fn?._type === 'closure') {
                    acc = vm._callClosure(fn, [acc, item, idx]);
                } else if (typeof fn === 'function') {
                    acc = fn([acc, item, idx]);
                }
            }
            return acc;
        },
        type: (args) => {
            const v = args[0];
            if (v === null) return 'null';
            if (v === undefined) return 'undefined';
            if (v?._type === 'closure') return 'function';
            if (v?._type === 'map') return 'map';
            if (v?._type === 'set') return 'set';
            if (Array.isArray(v)) return 'array';
            if (typeof v === 'object') return 'object';
            return typeof v;
        },
        toString: (args) => {
            const v = args[0];
            if (v === null || v === undefined) return 'null';
            if (typeof v === 'number' && v === Math.floor(v) && !Number.isInteger(v)) return v.toFixed(1);
            return String(v);
        },
        toNumber: (args) => parseFloat(args[0]) || 0,
        isNumber: (args) => typeof args[0] === 'number' && !isNaN(args[0]),
        isString: (args) => typeof args[0] === 'string',
        isBoolean: (args) => typeof args[0] === 'boolean',
        isArray: (args) => Array.isArray(args[0]),
        isObject: (args) => args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0]) && args[0]._type !== 'closure',
        isFunction: (args) => args[0]?._type === 'closure' || typeof args[0] === 'function',
        isNull: (args) => args[0] === null || args[0] === undefined,
        isNaN: (args) => Number.isNaN(args[0]),
        number: (args) => {
            const v = args[0];
            if (typeof v === 'number') return v;
            if (typeof v === 'string') return parseFloat(v) || 0;
            return 0;
        },
        string: (args) => String(args[0] ?? ''),
        str: (args) => String(args[0] ?? ''),
        bool: (args) => {
            const v = args[0];
            if (v === null || v === undefined || v === 0 || v === '' || v === false) return false;
            if (Array.isArray(v) && v.length === 0) return false;
            return true;
        },
        int: (args) => parseInt(args[0]) || 0,
        float: (args) => parseFloat(args[0]) || 0,
        find: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!fn) return null;
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                let result = false;
                if (fn?._type === 'closure') result = vm._callClosure(fn, [item, idx]);
                else if (typeof fn === 'function') result = fn([item, idx]);
                if (result) return item;
            }
            return null;
        },
        findIndex: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!fn) return -1;
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                let result = false;
                if (fn?._type === 'closure') result = vm._callClosure(fn, [item, idx]);
                else if (typeof fn === 'function') result = fn([item, idx]);
                if (result) return idx;
            }
            return -1;
        },
        every: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!fn) return true;
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                let result = true;
                if (fn?._type === 'closure') result = vm._callClosure(fn, [item, idx]);
                else if (typeof fn === 'function') result = fn([item, idx]);
                if (!result) return false;
            }
            return true;
        },
        some: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!fn) return false;
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                let result = false;
                if (fn?._type === 'closure') result = vm._callClosure(fn, [item, idx]);
                else if (typeof fn === 'function') result = fn([item, idx]);
                if (result) return true;
            }
            return false;
        },
        forEach: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!fn) return null;
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                if (fn?._type === 'closure') vm._callClosure(fn, [item, idx]);
                else if (typeof fn === 'function') fn([item, idx]);
            }
            return null;
        },
        flatMap: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!fn) return arr;
            const results = [];
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                let mapped;
                if (fn?._type === 'closure') mapped = vm._callClosure(fn, [item, idx]);
                else if (typeof fn === 'function') mapped = fn([item, idx]);
                else mapped = item;
                if (Array.isArray(mapped)) { for (const m of mapped) results.push(m); }
                else results.push(mapped);
            }
            return results;
        },
        fill: (args) => {
            const arr = args[0];
            if (!Array.isArray(arr)) return arr;
            const val = args[1];
            const start = Number(args[2] ?? 0);
            const end = Number(args[3] ?? arr.length);
            const result = new Array(arr.length);
            for (let i = 0; i < arr.length; i++) result[i] = arr[i];
            for (let i = start; i < end && i < arr.length; i++) result[i] = val;
            return result;
        },
        flat: (args) => {
            const arr = args[0] ?? [];
            const depth = Number(args[1] ?? 1);
            const flatten = (a, d) => {
                const result = [];
                for (const item of a) {
                    if (Array.isArray(item) && d > 0) { const sub = flatten(item, d - 1); for (const s of sub) result.push(s); }
                    else result.push(item);
                }
                return result;
            };
            return flatten(arr, depth);
        },
        unshift: (args) => {
            const arr = args[0];
            if (!Array.isArray(arr)) return arr;
            const val = args[1];
            const result = [val];
            for (let i = 0; i < arr.length; i++) result.push(arr[i]);
            return result;
        },
        splice: (args) => {
            const arr = args[0];
            if (!Array.isArray(arr)) return arr;
            const start = Number(args[1] ?? 0);
            const deleteCount = Number(args[2] ?? arr.length - start);
            const items = Array.isArray(args[3]) ? args[3] : (args.length > 3 ? args.slice(3) : []);
            const result = [];
            for (let i = 0; i < arr.length; i++) {
                if (i >= start && i < start + deleteCount) result.push(arr[i]);
            }
            const newArr = [];
            for (let i = 0; i < start && i < arr.length; i++) newArr.push(arr[i]);
            for (const item of items) newArr.push(item);
            for (let i = start + deleteCount; i < arr.length; i++) newArr.push(arr[i]);
            return { removed: result, array: newArr };
        },
        deepClone: (args) => {
            const clone = (v) => {
                if (v === null || v === undefined || typeof v !== 'object') return v;
                if (Array.isArray(v)) return v.map(item => clone(item));
                const result = Object.create(null);
                for (const k of Object.keys(v)) result[k] = clone(v[k]);
                return result;
            };
            return clone(args[0]);
        },
        unique: (args) => {
            const arr = args[0] ?? [];
            if (!Array.isArray(arr)) return arr;
            const seen = new Set();
            const result = [];
            for (const item of arr) {
                const key = typeof item === 'object' && item !== null ? JSON.stringify(item) : item;
                if (!seen.has(key)) { seen.add(key); result.push(item); }
            }
            return result;
        },
        count: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!fn) return Array.isArray(arr) ? arr.length : 0;
            let c = 0;
            for (let idx = 0; idx < arr.length; idx++) {
                const item = arr[idx];
                let result = false;
                if (fn?._type === 'closure') result = vm._callClosure(fn, [item, idx]);
                else if (typeof fn === 'function') result = fn([item, idx]);
                if (result) c++;
            }
            return c;
        },
        zip: (args) => {
            const a = args[0] ?? [];
            const b = args[1] ?? [];
            if (!Array.isArray(a) || !Array.isArray(b)) return [];
            const len = Math.min(a.length, b.length);
            const result = [];
            for (let i = 0; i < len; i++) result.push([a[i], b[i]]);
            return result;
        },
        sum: (args) => {
            const arr = args[0] ?? [];
            if (!Array.isArray(arr)) return 0;
            let s = 0;
            for (let i = 0; i < arr.length; i++) s += Number(arr[i]) || 0;
            return s;
        },
        avg: (args) => {
            const arr = args[0] ?? [];
            if (!Array.isArray(arr) || arr.length === 0) return 0;
            let s = 0;
            for (let i = 0; i < arr.length; i++) s += Number(arr[i]) || 0;
            return s / arr.length;
        },
        minBy: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!Array.isArray(arr) || arr.length === 0) return null;
            let minItem = arr[0];
            let minVal = fn ? (fn?._type === 'closure' ? vm._callClosure(fn, [minItem, 0]) : typeof fn === 'function' ? fn([minItem, 0]) : minItem) : minItem;
            for (let i = 1; i < arr.length; i++) {
                const v = fn ? (fn?._type === 'closure' ? vm._callClosure(fn, [arr[i], i]) : typeof fn === 'function' ? fn([arr[i], i]) : arr[i]) : arr[i];
                if (v < minVal) { minVal = v; minItem = arr[i]; }
            }
            return minItem;
        },
        maxBy: (args) => {
            const arr = args[0] ?? [];
            const fn = args[1];
            if (!Array.isArray(arr) || arr.length === 0) return null;
            let maxItem = arr[0];
            let maxVal = fn ? (fn?._type === 'closure' ? vm._callClosure(fn, [maxItem, 0]) : typeof fn === 'function' ? fn([maxItem, 0]) : maxItem) : maxItem;
            for (let i = 1; i < arr.length; i++) {
                const v = fn ? (fn?._type === 'closure' ? vm._callClosure(fn, [arr[i], i]) : typeof fn === 'function' ? fn([arr[i], i]) : arr[i]) : arr[i];
                if (v > maxVal) { maxVal = v; maxItem = arr[i]; }
            }
            return maxItem;
        }
    };
}

module.exports = {
    createCollectionBuiltins
};
