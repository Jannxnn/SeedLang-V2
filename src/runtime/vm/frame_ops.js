'use strict';

const { MAX_FRAME_DEPTH } = require('./frame_limits');

/** Copy `_fr` rows `[0, depth)` so nested interpreters can clobber low slots without losing the caller. */
function snapshotFrSlice(vm, depth) {
    if (!depth || depth <= 0) return null;
    const fr = vm._fr;
    const snap = {
        depth,
        ips: fr.ips.slice(0, depth),
        fps: fr.fps.slice(0, depth),
        sps: fr.sps.slice(0, depth),
        locals: fr.locals.slice(0, depth),
        capturedVars: fr.capturedVars.slice(0, depth),
        sharedCaptured: fr.sharedCaptured.slice(0, depth),
        codes: fr.codes.slice(0, depth),
        consts: fr.consts.slice(0, depth),
        vars: fr.vars.slice(0, depth),
        simple: Uint8Array.from(fr.simple.subarray(0, depth)),
        cvArrs: fr.cvArrs.slice(0, depth),
        closures: fr.closures.slice(0, depth),
        stacks: fr.stacks.slice(0, depth)
    };
    if (fr.globalValsArrs) snap.globalValsArrs = fr.globalValsArrs.slice(0, depth);
    return snap;
}

function restoreFrSlice(vm, snap) {
    if (!snap) return;
    const fr = vm._fr;
    const d = snap.depth;
    for (let i = 0; i < d; i++) {
        fr.ips[i] = snap.ips[i];
        fr.fps[i] = snap.fps[i];
        fr.sps[i] = snap.sps[i];
        fr.locals[i] = snap.locals[i];
        fr.capturedVars[i] = snap.capturedVars[i];
        fr.sharedCaptured[i] = snap.sharedCaptured[i];
        fr.codes[i] = snap.codes[i];
        fr.consts[i] = snap.consts[i];
        fr.vars[i] = snap.vars[i];
        fr.simple[i] = snap.simple[i];
        fr.cvArrs[i] = snap.cvArrs[i];
        fr.closures[i] = snap.closures[i];
        fr.stacks[i] = snap.stacks[i];
        if (snap.globalValsArrs && fr.globalValsArrs) fr.globalValsArrs[i] = snap.globalValsArrs[i];
    }
}

function vmSyncFrames(vm) {
    if (vm._frameTop > MAX_FRAME_DEPTH) {
        throw new RangeError(`VM frameTop exceeds limit (${MAX_FRAME_DEPTH})`);
    }
    vm.frames.length = 0;
    for (let i = 0; i < vm._frameTop; i++) {
        const f = { ip: vm._fr.ips[i], fp: vm._fr.fps[i], sp: vm._fr.sps[i], locals: vm._fr.locals[i], capturedVars: vm._fr.capturedVars[i], sharedCaptured: vm._fr.sharedCaptured[i] };
        if (vm._fr.codes[i]) {
            f.code = vm._fr.codes[i];
            f.consts = vm._fr.consts[i];
            f._savedVars = vm._fr.vars[i];
        }
        if (vm._fr.stacks[i] !== undefined && vm._fr.stacks[i] !== null) {
            f.stack = vm._fr.stacks[i];
        }
        if (vm._fr.simple) {
            f.simple = vm._fr.simple[i];
        }
        if (vm._fr.cvArrs) {
            f.cvArrs = vm._fr.cvArrs[i];
        }
        if (vm._fr.closures) {
            f.closures = vm._fr.closures[i];
        }
        if (vm._fr.globalValsArrs) {
            f.globalValsArrs = vm._fr.globalValsArrs[i];
        }
        vm.frames.push(f);
    }
}

function vmSyncFromFrames(vm) {
    if (vm.frames.length > MAX_FRAME_DEPTH) {
        throw new RangeError(`frame restore exceeds VM limit (${MAX_FRAME_DEPTH})`);
    }
    vm._frameTop = vm.frames.length;
    for (let i = 0; i < vm.frames.length; i++) {
        const f = vm.frames[i];
        vm._fr.ips[i] = f.ip;
        vm._fr.fps[i] = f.fp;
        vm._fr.sps[i] = f.sp;
        vm._fr.locals[i] = f.locals;
        vm._fr.capturedVars[i] = f.capturedVars;
        vm._fr.sharedCaptured[i] = f.sharedCaptured || null;
        vm._fr.codes[i] = f.code || null;
        vm._fr.consts[i] = f.consts || null;
        vm._fr.vars[i] = f._savedVars || null;
        vm._fr.stacks[i] = f.stack || null;
        if (vm._fr.simple) {
            vm._fr.simple[i] = f.simple ? 1 : 0;
        }
        if (vm._fr.cvArrs) {
            vm._fr.cvArrs[i] = f.cvArrs !== undefined ? f.cvArrs : null;
        }
        if (vm._fr.closures) {
            vm._fr.closures[i] = f.closures !== undefined ? f.closures : null;
        }
        if (vm._fr.globalValsArrs) {
            vm._fr.globalValsArrs[i] = f.globalValsArrs !== undefined ? f.globalValsArrs : null;
        }
    }
}

function vmSaveState(vm) {
    vmSyncFrames(vm);
    return {
        stack: [...vm.stack],
        sp: vm._sp,
        ip: vm.ip,
        code: vm.code,
        consts: vm.consts,
        vars: vm.vars,
        globals: { ...vm.globals },
        locals: vm.locals ? { ...vm.locals } : null,
        frames: vm.frames.map(f => ({ ...f })),
        callStack: vm.callStack.map(c => ({ ...c }))
    };
}

function vmRestoreState(vm, state) {
    vm.stack = [...state.stack];
    vm.ip = state.ip;
    vm.code = state.code;
    vm.consts = state.consts;
    vm.vars = state.vars;
    vm.globals = { ...state.globals };
    vm.locals = state.locals ? { ...state.locals } : null;
    vm.frames = state.frames.map(f => ({ ...f }));
    vmSyncFromFrames(vm);
    vm.callStack = state.callStack.map(c => ({ ...c }));
}

function wireFrameOps(VMProto) {
    VMProto._syncFrames = function () { return vmSyncFrames(this); };
    VMProto._syncFromFrames = function () { return vmSyncFromFrames(this); };
    VMProto._saveState = function () { return vmSaveState(this); };
    VMProto._restoreState = function (state) { return vmRestoreState(this, state); };
}

module.exports = {
    vmSyncFrames,
    vmSyncFromFrames,
    snapshotFrSlice,
    restoreFrSlice,
    vmSaveState,
    vmRestoreState,
    wireFrameOps
};
