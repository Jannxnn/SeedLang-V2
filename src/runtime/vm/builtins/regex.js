function createRegexModule() {
    class SeedRegExp {
        constructor(pattern, flags) {
            this._type = 'regexp';
            this._re = new RegExp(pattern, flags || '');
            this.source = this._re.source;
            this.flags = this._re.flags;
            this.global = this._re.global;
            this.ignoreCase = this._re.ignoreCase;
            this.multiline = this._re.multiline;
            this.dotAll = this._re.dotAll;
            this.sticky = this._re.sticky;
            this.unicode = this._re.unicode;
            this.lastIndex = 0;
        }

        test(str) {
            if (this.global || this.sticky) {
                this._re.lastIndex = this.lastIndex;
                const result = this._re.test(str);
                this.lastIndex = this._re.lastIndex;
                return result;
            }
            return this._re.test(str);
        }

        exec(str) {
            if (this.global || this.sticky) {
                this._re.lastIndex = this.lastIndex;
            }
            const m = this._re.exec(str);
            if (this.global || this.sticky) {
                this.lastIndex = this._re.lastIndex;
            }
            if (!m) return null;
            const result = {
                match: m[0],
                index: m.index,
                groups: m.groups ? { ...m.groups } : null,
                captures: m.length > 1 ? m.slice(1) : []
            };
            return result;
        }

        toString() {
            return `/${this.source}/${this.flags}`;
        }
    }

    return {
        create: (args) => {
            const pattern = args[0] ?? '';
            const flags = args[1] ?? '';
            return new SeedRegExp(String(pattern), String(flags));
        },
        test: (args) => {
            const pattern = args[0];
            const str = String(args[1] ?? '');
            if (pattern && pattern._type === 'regexp') {
                return pattern.test(str);
            }
            try { return new RegExp(String(pattern)).test(str); } catch { return false; }
        },
        match: (args) => {
            const str = String(args[0] ?? '');
            const pattern = args[1];
            if (pattern && pattern._type === 'regexp') {
                return pattern.exec(str);
            }
            try {
                const re = new RegExp(String(pattern));
                const m = str.match(re);
                if (!m) return null;
                return {
                    match: m[0],
                    index: m.index,
                    groups: m.groups ? { ...m.groups } : null,
                    captures: m.length > 1 ? m.slice(1) : []
                };
            } catch { return null; }
        },
        matchAll: (args) => {
            const str = String(args[0] ?? '');
            const pattern = args[1];
            try {
                const re = pattern && pattern._type === 'regexp'
                    ? new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
                    : new RegExp(String(pattern), 'g');
                const results = [];
                let m;
                while ((m = re.exec(str)) !== null) {
                    results.push({
                        match: m[0],
                        index: m.index,
                        groups: m.groups ? { ...m.groups } : null,
                        captures: m.length > 1 ? m.slice(1) : []
                    });
                }
                return results;
            } catch { return []; }
        },
        replace: (args) => {
            const str = String(args[0] ?? '');
            const pattern = args[1];
            const replacement = String(args[2] ?? '');
            try {
                const re = pattern && pattern._type === 'regexp'
                    ? new RegExp(pattern.source, pattern.flags)
                    : new RegExp(String(pattern));
                return str.replace(re, replacement);
            } catch { return str; }
        },
        replaceAll: (args) => {
            const str = String(args[0] ?? '');
            const pattern = args[1];
            const replacement = String(args[2] ?? '');
            try {
                const re = pattern && pattern._type === 'regexp'
                    ? new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
                    : new RegExp(String(pattern), 'g');
                return str.replace(re, replacement);
            } catch { return str; }
        },
        split: (args) => {
            const str = String(args[0] ?? '');
            const pattern = args[1];
            const limit = args[2];
            try {
                const re = pattern && pattern._type === 'regexp'
                    ? new RegExp(pattern.source, pattern.flags)
                    : new RegExp(String(pattern));
                return str.split(re, limit);
            } catch { return [str]; }
        },
        search: (args) => {
            const str = String(args[0] ?? '');
            const pattern = args[1];
            try {
                const re = pattern && pattern._type === 'regexp'
                    ? new RegExp(pattern.source, pattern.flags)
                    : new RegExp(String(pattern));
                return str.search(re);
            } catch { return -1; }
        },
        escape: (args) => {
            const str = String(args[0] ?? '');
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    };
}

module.exports = { createRegexModule };
