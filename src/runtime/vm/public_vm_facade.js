'use strict';

function createReadOnlyGlobalsProxy(owner) {
    return new Proxy(Object.create(null), {
        get(_, key) { return owner._vm.globals[key]; },
        has(_, key) { return Object.prototype.hasOwnProperty.call(owner._vm.globals, key); },
        ownKeys() { return Reflect.ownKeys(owner._vm.globals); },
        getOwnPropertyDescriptor(_, key) {
            const globals = owner._vm.globals;
            if (!Object.prototype.hasOwnProperty.call(globals, key)) return undefined;
            return { configurable: true, enumerable: true, value: globals[key], writable: false };
        },
        set() { throw new Error('vm.vm.globals is read-only; use setGlobal() for controlled injection'); },
        defineProperty() { throw new Error('vm.vm.globals is read-only'); },
        deleteProperty() { throw new Error('vm.vm.globals is read-only'); },
        setPrototypeOf() { throw new Error('vm.vm.globals prototype is locked'); }
    });
}

function createPublicVMFacade(owner) {
    const facade = {};
    Object.defineProperties(facade, {
        globals: { get() { return owner._readonlyGlobalsProxy; }, enumerable: true },
        output: { get() { return owner._vm.output; }, enumerable: true },
        preserveGlobals: { get() { return owner._vm.preserveGlobals; }, enumerable: true }
    });
    facade.run = (bc) => owner._vm.run(bc);
    facade.runAsync = (bc) => owner._vm.runAsync(bc);
    facade.setGraphicsHost = (host) => owner.setGraphicsHost(host);
    facade.setGlobal = (name, value, options) => owner.setGlobal(name, value, options);
    facade.getGlobal = (name) => owner.getGlobal(name);
    facade.deleteGlobal = (name) => owner.deleteGlobal(name);
    return Object.freeze(facade);
}

module.exports = {
    createReadOnlyGlobalsProxy,
    createPublicVMFacade
};
