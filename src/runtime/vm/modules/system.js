'use strict';

function createSystemModules(vm, deps) {
    const fs = deps.fs;
    const path = deps.path;

    const validateFsPath = (p) => {
        if (!p || typeof p !== 'string') return null;
        const resolved = path.resolve(vm.dir, p);
        const base = path.resolve(vm.dir);
        if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
        return resolved;
    };

    const sanitizeJson = (obj) => {
        if (obj === null || typeof obj !== 'object') return obj;
        const clean = Array.isArray(obj) ? [] : Object.create(null);
        for (const key of Object.keys(obj)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            clean[key] = sanitizeJson(obj[key]);
        }
        return clean;
    };

    const safeJsonParse = (str) => {
        try {
            return sanitizeJson(JSON.parse(str));
        } catch {
            return null;
        }
    };

    return {
        fs: {
            read: (args) => {
                const p = validateFsPath(args[0]);
                if (!p) return null;
                try {
                    return fs.readFileSync(p, 'utf-8');
                } catch {
                    return null;
                }
            },
            write: (args) => {
                const p = validateFsPath(args[0]);
                if (!p) return false;
                try {
                    fs.writeFileSync(p, String(args[1]));
                    return true;
                } catch {
                    return false;
                }
            },
            exists: (args) => {
                const p = validateFsPath(args[0]);
                if (!p) return false;
                return fs.existsSync(p);
            },
            delete: (args) => {
                const p = validateFsPath(args[0]);
                if (!p) return false;
                try {
                    fs.unlinkSync(p);
                    return true;
                } catch {
                    return false;
                }
            },
            mkdir: (args) => {
                const p = validateFsPath(args[0]);
                if (!p) return false;
                try {
                    fs.mkdirSync(p, { recursive: true });
                    return true;
                } catch {
                    return false;
                }
            },
            list: (args) => {
                const p = args[0] ? validateFsPath(args[0]) : vm.dir;
                if (!p) return [];
                return fs.readdirSync(p);
            },
            cwd: () => vm.dir,
            cd: (args) => {
                const p = validateFsPath(args[0]);
                if (!p) return false;
                vm.dir = p;
                return true;
            }
        },
        json: {
            stringify: (args) => JSON.stringify(args[0]),
            parse: (args) => safeJsonParse(args[0])
        },
        time: {
            now: () => Date.now(),
            date: () => new Date().toLocaleDateString(),
            time: () => new Date().toLocaleTimeString()
        }
    };
}

module.exports = {
    createSystemModules
};
