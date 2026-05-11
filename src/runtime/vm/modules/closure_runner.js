'use strict';

function invokeClosureWithArgs(vmContext, fn, callArgs, helpers, options = {}) {
    const OP = helpers.OP;
    const prepareCallCapturedVars = helpers.prepareCallCapturedVars;
    const resolveCallSharedCaptured = helpers.resolveCallSharedCaptured;
    const isReturnOp = helpers.isReturnOp;
    const isComputedReturnOp = helpers.isComputedReturnOp;

    const savedStack = vmContext.stack;
    const savedLocals = vmContext.locals;
    const savedIp = vmContext.ip;
    const savedCode = vmContext.code;
    const savedConsts = vmContext.consts;
    const savedVars = vmContext.vars;
    const savedFrames = vmContext.frames;
    const savedCapturedVars = vmContext.capturedVars;
    const savedSharedCaptured = vmContext.sharedCaptured;

    vmContext.code = fn._ctx ? fn._ctx[0] : vmContext.code;
    vmContext.consts = fn._ctx ? fn._ctx[1] : vmContext.consts;
    vmContext.vars = fn._ctx ? fn._ctx[2] : vmContext.vars;
    vmContext.stack = callArgs;
    vmContext.locals = [fn._localScopeArr ? fn._localScopeArr[0] : (fn._funcRef?.localScope || {})];
    vmContext.ip = fn._start !== undefined ? fn._start : fn.start;
    vmContext.capturedVars = prepareCallCapturedVars(fn) || (fn._funcRef?.capturedVars || {});
    vmContext.sharedCaptured = resolveCallSharedCaptured(fn, vmContext.capturedVars);
    vmContext.frames = [];

    const stopOnUndefined = !!options.stopOnUndefined;
    const errorFallback = Object.prototype.hasOwnProperty.call(options, 'errorFallback') ? options.errorFallback : null;
    let returnValue = Object.prototype.hasOwnProperty.call(options, 'defaultValue') ? options.defaultValue : null;

    try {
        while (true) {
            const op = vmContext.code[vmContext.ip++];
            if (isReturnOp(op)) {
                if (isComputedReturnOp(op)) vmContext._executeOpInline(op);
                returnValue = vmContext.stack.length > 0 ? vmContext.stack[vmContext.stack.length - 1] : null;
                break;
            }
            if (op === OP.HALT || (stopOnUndefined && op === undefined)) break;
            vmContext._executeOpInline(op);
        }
    } catch (e) {
        returnValue = typeof errorFallback === 'function' ? errorFallback(e) : errorFallback;
    } finally {
        vmContext.stack = savedStack;
        vmContext.locals = savedLocals;
        vmContext.ip = savedIp;
        vmContext.code = savedCode;
        vmContext.consts = savedConsts;
        vmContext.vars = savedVars;
        vmContext.frames = savedFrames;
        vmContext.capturedVars = savedCapturedVars;
        vmContext.sharedCaptured = savedSharedCaptured;
    }

    return returnValue;
}

module.exports = {
    invokeClosureWithArgs
};
