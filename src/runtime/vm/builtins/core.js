'use strict';
// VM 内置函数 - 核心数学模块：提供 abs、floor、ceil、round、min、max、sqrt、pow、sin、cos、tan、log、atan2、PI、random 等基础数学函数

function createCoreBuiltins() {
    return {
        abs: (args) => Math.abs(args[0] ?? 0),
        pow: (args) => Math.pow(args[0] ?? 0, args[1] ?? 0),
        min: (args) => Math.min(...args),
        max: (args) => Math.max(...args),
        floor: (args) => Math.floor(args[0] ?? 0),
        ceil: (args) => Math.ceil(args[0] ?? 0),
        round: (args) => Math.round(args[0] ?? 0),
        random: (args) => args.length ? Math.floor(Math.random() * args[0]) : Math.random(),
        sqrt: (args) => Math.sqrt(args[0] ?? 0),
        sin: (args) => Math.sin(args[0] ?? 0),
        cos: (args) => Math.cos(args[0] ?? 0),
        tan: (args) => Math.tan(args[0] ?? 0),
        asin: (args) => Math.asin(args[0] ?? 0),
        acos: (args) => Math.acos(args[0] ?? 0),
        atan: (args) => Math.atan(args[0] ?? 0),
        atan2: (args) => Math.atan2(args[0] ?? 0, args[1] ?? 0),
        log: (args) => Math.log(args[0] ?? 1),
        log2: (args) => Math.log2(args[0] ?? 1),
        log10: (args) => Math.log10(args[0] ?? 1),
        exp: (args) => Math.exp(args[0] ?? 0),
        PI: () => Math.PI,
        E: () => Math.E,
        upper: (args) => String(args[0] ?? '').toUpperCase(),
        lower: (args) => String(args[0] ?? '').toLowerCase(),
        trim: (args) => String(args[0] ?? '').trim(),
        split: (args) => String(args[0] ?? '').split(args[1] ?? ''),
        join: (args) => {
            const arr = args[0] ?? [];
            const sep = args[1] ?? '';
            if (!Array.isArray(arr)) return String(arr ?? '');
            let out = '';
            for (let i = 0; i < arr.length; i++) {
                if (i > 0) out += String(sep);
                out += String(arr[i] ?? '');
            }
            return out;
        },
        replace: (args) => String(args[0] ?? '').replace(new RegExp(String(args[1] ?? ''), 'g'), String(args[2] ?? '')),
        substring: (args) => String(args[0] ?? '').substring(args[1] ?? 0, args[2]),
        charAt: (args) => String(args[0] ?? '').charAt(Number(args[1] ?? 0)),
        startsWith: (args) => String(args[0] ?? '').startsWith(String(args[1] ?? '')),
        endsWith: (args) => String(args[0] ?? '').endsWith(String(args[1] ?? '')),
        includes: (args) => {
            const s = args[0];
            const val = args[1];
            if (typeof s === 'string') return s.includes(String(val ?? ''));
            if (Array.isArray(s)) { for (let i = 0; i < s.length; i++) { if (s[i] === val) return true; } return false; }
            return false;
        },
        repeat: (args) => String(args[0] ?? '').repeat(Math.max(0, Number(args[1] ?? 0))),
        padStart: (args) => String(args[0] ?? '').padStart(Number(args[1] ?? 0), String(args[2] ?? ' ')),
        padEnd: (args) => String(args[0] ?? '').padEnd(Number(args[1] ?? 0), String(args[2] ?? ' ')),
        lastIndexOf: (args) => {
            const s = args[0];
            const val = args[1];
            if (typeof s === 'string') return s.lastIndexOf(String(val ?? ''));
            if (Array.isArray(s)) { for (let i = s.length - 1; i >= 0; i--) { if (s[i] === val) return i; } return -1; }
            return -1;
        },
        strMatch: (args) => {
            const s = String(args[0] ?? '');
            const pattern = String(args[1] ?? '');
            try { const re = new RegExp(pattern); const m = s.match(re); return m ? (m.length === 1 ? m[0] : m) : null; } catch { return null; }
        },
        search: (args) => {
            const s = String(args[0] ?? '');
            const pattern = String(args[1] ?? '');
            try { return s.search(new RegExp(pattern)); } catch { return -1; }
        },
        codePointAt: (args) => String(args[0] ?? '').codePointAt(Number(args[1] ?? 0)) ?? -1,
        fromCharCode: (args) => String.fromCharCode(...args.map(a => Number(a ?? 0))),
        trimStart: (args) => String(args[0] ?? '').trimStart(),
        trimEnd: (args) => String(args[0] ?? '').trimEnd()
    };
}

module.exports = {
    createCoreBuiltins
};
