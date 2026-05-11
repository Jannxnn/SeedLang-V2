'use strict';

const { OP, RETURN_OPS: _RETURN_OPS, VALID_OPCODES: _VALID_OPCODES } = require('./opcodes');
const { isDangerousObjectKey } = require('./object_key_safety');
const { snapshotFrSlice, restoreFrSlice } = require('./frame_ops');

function invokeHostMethod(vm, instance, method, args, methodName) {
    if (!vm || !method || typeof vm._executeOpInline !== 'function') return null;
    const savedCode = vm.code;
    const savedConsts = vm.consts;
    const savedVars = vm.vars;
    const savedIp = vm.ip;
    const savedStack = vm.stack;
    const savedFp = vm._fp;
    const savedLocals = vm.locals;
    const savedCaptured = vm.capturedVars;
    const savedShared = vm.sharedCaptured;
    const savedCurrentClass = vm.currentClass;
    const savedSp = vm._sp;
    const savedFrameTop = vm._frameTop;
    const framesSnapshot = vm.frames && vm.frames.length ? vm.frames.slice() : [];
    const frSnapDepth = savedFrameTop > 0 ? savedFrameTop : 1;
    const frSnap = snapshotFrSlice(vm, frSnapDepth);
    try {
        const methodRef = { _type: 'method', instance, method, methodName };
        vm.stack = [methodRef];
        if (Array.isArray(args) && args.length > 0) {
            for (let i = 0; i < args.length; i++) vm.stack.push(args[i]);
        }
        vm._fp = 0;
        vm.locals = vm._emptyLocals || [];
        vm.capturedVars = null;
        vm.sharedCaptured = null;
        vm.code = Array.isArray(args) && args.length > 0 ? [args.length] : [];
        vm.consts = [];
        vm.vars = [];
        vm.ip = 0;
        vm._executeOpInline(Array.isArray(args) && args.length > 0 ? OP.CALL : OP.CALL0);
        return vm.stack.length > 0 ? vm.stack[vm.stack.length - 1] : null;
    } finally {
        vm.code = savedCode;
        vm.consts = savedConsts;
        vm.vars = savedVars;
        vm.ip = savedIp;
        vm.stack = savedStack;
        vm._fp = savedFp;
        vm.locals = savedLocals;
        vm.capturedVars = savedCaptured;
        vm.sharedCaptured = savedShared;
        vm.currentClass = savedCurrentClass;
        vm._sp = savedSp;
        vm._frameTop = 0;
        restoreFrSlice(vm, frSnap);
        const fm = vm.frames || (vm.frames = []);
        fm.length = 0;
        for (let i = 0; i < framesSnapshot.length; i++) fm.push(framesSnapshot[i]);
        vm._frameTop = savedFrameTop;
    }
}

function createSafeInstance(className, methods, superClass, vm = null) {
    const instance = Object.create(null);
    instance._type = 'instance';
    instance._class = className;
    instance._methods = methods;
    instance._superClass = superClass;
    if (vm && methods && typeof methods === 'object') {
        for (const methodName of Object.keys(methods)) {
            if (isDangerousObjectKey(methodName)) continue;
            if (Object.prototype.hasOwnProperty.call(instance, methodName)) continue;
            Object.defineProperty(instance, methodName, {
                configurable: true,
                enumerable: false,
                writable: true,
                value: (...args) => invokeHostMethod(vm, instance, methods[methodName], args, methodName),
            });
        }
    }
    return instance;
}

function instantiateClassObject(vm, cls, args) {
    const instance = createSafeInstance(cls.name, cls.methods, cls.superClass, vm);
    const initMethod = cls.methods.init || cls.methods['__init__'] || cls.methods.constructor;
    if (!initMethod || !initMethod.code) return instance;

    const savedCode = vm.code;
    const savedConsts = vm.consts;
    const savedVars = vm.vars;
    const savedIp = vm.ip;
    const savedFrameTopPre = vm._frameTop;
    const ctorFrSnapDepth = savedFrameTopPre > 0 ? savedFrameTopPre : 1;
    const ctorFrSnap = snapshotFrSlice(vm, ctorFrSnapDepth);
    vm._syncFrames();
    const savedFrames = vm.frames.slice();
    const savedStack = vm.stack;
    const savedLocals = vm.locals;
    const savedCaptured = vm.capturedVars;
    const savedShared = vm.sharedCaptured;
    const savedCurrentClass = vm.currentClass;
    const savedFp = vm._fp;
    const savedFrameTop = savedFrameTopPre;

    vm.currentClass = cls.name;
    vm.code = initMethod.code;
    vm.consts = initMethod.consts;
    vm.vars = initMethod.vars || [];
    vm.ip = 0;
    vm.stack = [instance];
    vm._fp = 0;
    vm.locals = [initMethod.localScope || {}];
    vm.capturedVars = null;
    vm.sharedCaptured = null;
    (initMethod.params || []).forEach((_, i) => vm.stack.push(args[i]));
    vm.frames = [];
    vm._frameTop = 0;

    while (true) {
        const subOp = vm.code[vm.ip++];
        if (subOp === undefined || subOp === OP.HALT || !_VALID_OPCODES.has(subOp)) break;
        if (_RETURN_OPS.has(subOp)) break;
        vm._executeOpInline(subOp);
    }

    vm.currentClass = savedCurrentClass;
    vm.code = savedCode;
    vm.consts = savedConsts;
    vm.vars = savedVars;
    vm.ip = savedIp;
    vm._frameTop = 0;
    restoreFrSlice(vm, ctorFrSnap);
    const ctorFm = vm.frames || (vm.frames = []);
    ctorFm.length = 0;
    for (let ci = 0; ci < savedFrames.length; ci++) ctorFm.push(savedFrames[ci]);
    vm._syncFromFrames();
    vm.stack = savedStack;
    vm.locals = savedLocals;
    vm.capturedVars = savedCaptured;
    vm.sharedCaptured = savedShared;
    vm._fp = savedFp;
    vm._frameTop = savedFrameTop;
    return instance;
}

function isSafeArrayIndex(index, maxArrayIndex) {
    return Number.isInteger(index) && index >= 0 && index < maxArrayIndex;
}

function isPrivateInstanceKey(key) {
    if (typeof key !== 'string') return false;
    if (!key.startsWith('_')) return false;
    return key !== '_type' && key !== '_class' && key !== '_methods' && key !== '_superClass';
}

function canAccessInstanceKey(vm, obj, key) {
    if (!obj || obj._type !== 'instance') return true;
    if (!isPrivateInstanceKey(key)) return true;
    return vm.currentClass === obj._class;
}

function resolveMethodStart(method) {
    if (!method) return 0;
    if (method._start !== undefined) return method._start;
    if (method.start !== undefined) return method.start;
    return 0;
}

function buildMethodLocalScope(method, forceStatic = null) {
    if (!method) return null;
    if (method.localScope) return { ...method.localScope };
    const localMap = {};
    let hasLocal = false;
    const isStatic = forceStatic !== null ? !!forceStatic : !!method.isStatic;
    if (!isStatic) {
        localMap.this = 0;
        hasLocal = true;
    }
    const paramBase = isStatic ? 0 : 1;
    const methodParams = method.params || [];
    for (let i = 0; i < methodParams.length; i++) {
        localMap[methodParams[i]] = paramBase + i;
        hasLocal = true;
    }
    const capturedNames = [];
    const capturedSeen = new Set();
    const methodConsts = method.consts;
    if (Array.isArray(methodConsts)) {
        for (let ci = 0; ci < methodConsts.length; ci++) {
            const c = methodConsts[ci];
            if (!c || c.type !== 'func' || !Array.isArray(c.capturedVars)) continue;
            for (let i = 0; i < c.capturedVars.length; i++) {
                const name = c.capturedVars[i];
                if (!capturedSeen.has(name) && localMap[name] === undefined) {
                    capturedSeen.add(name);
                    capturedNames.push(name);
                }
            }
        }
    }
    if (capturedNames.length > 0) {
        const usedIdx = new Set(Object.values(localMap));
        const setLocalIdx = [];
        const mCode = method.code || [];
        for (let ci = 0; ci < mCode.length; ci++) {
            if (mCode[ci] !== OP.SET_LOCAL) continue;
            const li = mCode[ci + 1];
            if (typeof li !== 'number' || usedIdx.has(li)) continue;
            if (!setLocalIdx.includes(li)) setLocalIdx.push(li);
            ci++;
        }
        const assignCount = Math.min(capturedNames.length, setLocalIdx.length);
        for (let i = 0; i < assignCount; i++) {
            localMap[capturedNames[i]] = setLocalIdx[i];
            hasLocal = true;
        }
    }
    return hasLocal ? localMap : null;
}

module.exports = {
    invokeHostMethod,
    createSafeInstance,
    instantiateClassObject,
    isSafeArrayIndex,
    isPrivateInstanceKey,
    canAccessInstanceKey,
    resolveMethodStart,
    buildMethodLocalScope
};
