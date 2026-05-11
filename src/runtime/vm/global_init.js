'use strict';

function initGlobalsWithBuiltins(vm) {
    const g = Object.create(null);
    for (const [name, fn] of Object.entries(vm.builtins)) {
        g[name] = fn;
    }
    for (const [name, mod] of Object.entries(vm.modules)) {
        g[name] = { _type: 'module', exports: mod };
    }
    vm._globalsWithBuiltins = g;
    if (!vm.preserveGlobals) {
        const g2 = Object.create(null);
        for (const key in g) g2[key] = g[key];
        vm.globals = g2;
        vm._globalsInit = true;
    } else {
        for (const name in g) {
            if (!Object.prototype.hasOwnProperty.call(vm.globals, name)) vm.globals[name] = g[name];
        }
    }
}

module.exports = {
    initGlobalsWithBuiltins
};
