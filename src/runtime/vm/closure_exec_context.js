'use strict';

const { SeedLangError } = require('./errors');
const { ensureOperandHeadroom } = require('./frame_limits');
const { snapshotFrSlice, restoreFrSlice } = require('./frame_ops');

function callClosureWithExecutionContext(vm, fn, args, prepareCapturedVars, haltOpcode) {
    const savedStack = vm.stack;
    const savedLocals = vm.locals;
    const savedIp = vm.ip;
    const savedCode = vm.code;
    const savedConsts = vm.consts;
    const savedVars = vm.vars;
    const savedFrames = vm.frames;
    const savedCapturedVars = vm.capturedVars;
    const savedSharedCaptured = vm.sharedCaptured;
    const savedFrameTop = vm._frameTop;
    const frSnap = snapshotFrSlice(vm, savedFrameTop);

    const returnOps = [64, 91, 100, 107, 108, 109, 121, 122, 123, 124, 143, 146];
    const execBudget = vm._createExecutionBudget();

    let returnValue = null;
    try {
        vm.frames = [];
        vm._frameTop = 0;
        vm.code = fn._ctx ? fn._ctx[0] : vm.code;
        vm.consts = fn._ctx ? fn._ctx[1] : vm.consts;
        vm.vars = fn._ctx ? fn._ctx[2] : vm.vars;
        vm.stack = args.slice();
        vm.locals = [fn._localScopeArr ? fn._localScopeArr[0] : (fn._funcRef?.localScope || {})];
        vm.ip = fn._start !== undefined ? fn._start : fn.start;
        vm.capturedVars = prepareCapturedVars(fn) || (fn && !fn._noCapture ? (fn._funcRef?.capturedVars || {}) : null);

        try {
            ensureOperandHeadroom(vm.stack.length, vm._fp | 0, 0);
        } catch (e) {
            if (e && e.code === 'OPERAND_STACK_OVERFLOW') {
                throw new SeedLangError('operand stack overflow', 'RuntimeError', 0, vm.callStack || []);
            }
            throw e;
        }

        while (true) {
            const budgetError = vm._consumeExecutionBudget(execBudget);
            if (budgetError) throw new Error(budgetError);
            try {
                ensureOperandHeadroom(vm.stack.length, vm._fp | 0, 0);
            } catch (e) {
                if (e && e.code === 'OPERAND_STACK_OVERFLOW') {
                    throw new SeedLangError('operand stack overflow', 'RuntimeError', 0, vm.callStack || []);
                }
                throw e;
            }
            const op = vm.code[vm.ip++];
            if (returnOps.includes(op)) {
                if (op !== 64 && op !== 143) vm._executeOpInline(op);
                returnValue = vm.stack.length > 0 ? vm.stack[vm.stack.length - 1] : null;
                break;
            }
            if (op === 0 || op === haltOpcode || op === undefined) break;
            vm._executeOpInline(op);
        }
    } catch (e) {
        if (e instanceof SeedLangError && /operand stack overflow/i.test(e.message)) throw e;
        returnValue = null;
    } finally {
        restoreFrSlice(vm, frSnap);
        vm.stack = savedStack;
        vm.locals = savedLocals;
        vm.ip = savedIp;
        vm.code = savedCode;
        vm.consts = savedConsts;
        vm.vars = savedVars;
        vm.frames = savedFrames;
        vm._frameTop = savedFrameTop;
        vm.capturedVars = savedCapturedVars;
        vm.sharedCaptured = savedSharedCaptured;
    }

    return returnValue;
}

module.exports = {
    callClosureWithExecutionContext
};
