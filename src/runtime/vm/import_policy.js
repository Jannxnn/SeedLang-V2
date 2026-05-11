'use strict';

const { isSensitiveImportModule } = require('./global_guard_policy');
const fs = require('fs');
const path = require('path');

const _fileModuleCache = new Map();

function buildAllowedImportSet(modules, allowedImports, allowSensitiveImports) {
    if (Array.isArray(allowedImports)) {
        const s = new Set();
        for (const name of allowedImports) {
            if (typeof name === 'string' && name) s.add(name);
        }
        return s;
    }
    const s = new Set();
    for (const name of Object.keys(modules || {})) {
        if (!allowSensitiveImports && isSensitiveImportModule(name)) continue;
        s.add(name);
    }
    return s;
}

function resolveImportModule(modules, allowedImportSet, name, owner) {
    if (typeof name !== 'string' || !name) {
        return { ok: false, error: 'Invalid import module name' };
    }
    if (Object.prototype.hasOwnProperty.call(modules, name)) {
        if (!allowedImportSet || !allowedImportSet.has(name)) {
            return { ok: false, error: `Module '${name}' is blocked by import policy` };
        }
        return { ok: true, value: { _type: 'module', exports: modules[name] } };
    }
    if (name.startsWith('./') || name.startsWith('../') || name.endsWith('.seed')) {
        return resolveFileModule(name, owner);
    }
    return { ok: false, error: `Unknown module '${name}'` };
}

function resolveFileModule(name, owner) {
    if (_fileModuleCache.has(name)) {
        return { ok: true, value: _fileModuleCache.get(name) };
    }
    let modulePath = name;
    if (!path.isAbsolute(modulePath)) {
        modulePath = path.resolve(process.cwd(), modulePath);
    }
    if (!fs.existsSync(modulePath)) {
        const seedPath = modulePath + '.seed';
        if (fs.existsSync(seedPath)) {
            modulePath = seedPath;
        } else {
            return { ok: false, error: `Module file not found: '${name}'` };
        }
    }
    try {
        const source = fs.readFileSync(modulePath, 'utf-8');
        if (!owner || typeof owner !== 'function') {
            return { ok: false, error: `Cannot load file module '${name}': no VM constructor` };
        }
        const subVM = new owner({ maxInstructions: 50000000 });
        const initialGlobals = new Set(Object.keys(subVM.vm.globals || {}));
        const result = subVM.run(source);
        if (!result.success) {
            return { ok: false, error: `Error loading module '${name}': ${result.error}` };
        }
        const exports = {};
        if (subVM.vm && subVM.vm.globals) {
            const globals = subVM.vm.globals;
            for (const key of Object.keys(globals)) {
                if (initialGlobals.has(key) || key.startsWith('__') || key === 'result') continue;
                exports[key] = globals[key];
            }
        }
        const moduleObj = { _type: 'module', exports };
        _fileModuleCache.set(name, moduleObj);
        return { ok: true, value: moduleObj };
    } catch (e) {
        return { ok: false, error: `Failed to load module '${name}': ${e.message}` };
    }
}

module.exports = {
    buildAllowedImportSet,
    resolveImportModule
};
