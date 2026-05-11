/**
 * Coroutines / fibers: YieldSignal for the AST interpreter + bytecode resume/suspend helpers for the VM.
 * Single TypeScript source; VM loads `dist/core/coroutine.js` after `tsc`.
 */

export class YieldSignal {
  constructor(public value: unknown) {}
}

type VmFrameRegs = {
  ips: any[];
  fps: any[];
  sps: any[];
  locals: any[];
  capturedVars: any[];
  sharedCaptured: any[];
  codes: any[];
  consts: any[];
  vars: any[];
  stacks: any[];
};

/** OP is reserved for caller compatibility; unused in this implementation. */
export function resumeCoroutine(vm: any, coro: any, arg: any, _OP: any): any {
  if (coro?._type !== 'coroutine' || coro.state === 'done') return null;

  const savedCode = vm.code;
  const savedConsts = vm.consts;
  const savedVars = vm.vars;
  const savedIp = vm.ip;
  const savedStack = vm.stack;
  const savedLocals = vm.locals;
  const savedCapturedVars = vm.capturedVars;
  const savedSharedCaptured = vm.sharedCaptured;
  const savedFp = vm._fp;
  const savedGlobalVals = vm._globalVals;
  const savedGlobalNameIdx = vm._globalNameIdx;
  vm._syncFrames();
  const savedFrames = vm.frames;
  const savedTryStack = vm.tryStack;
  const savedFrameTop = vm._frameTop;
  const fr: VmFrameRegs = vm._fr;
  const savedFrIps = fr.ips;
  const savedFrFps = fr.fps;
  const savedFrSps = fr.sps;
  const savedFrLocals = fr.locals;
  const savedFrCapturedVars = fr.capturedVars;
  const savedFrSharedCaptured = fr.sharedCaptured;
  const savedFrCodes = fr.codes;
  const savedFrConsts = fr.consts;
  const savedFrVars = fr.vars;
  const savedFrStacks = fr.stacks;

  if (savedGlobalVals && savedGlobalNameIdx) {
    for (const [name, idx] of savedGlobalNameIdx) {
      if (idx < savedGlobalVals.length && savedGlobalVals[idx] !== undefined && savedGlobalVals[idx] !== null) {
        vm.globals[name] = savedGlobalVals[idx];
      }
    }
  }

  const coroCode = coro._ctx ? coro._ctx[0] : coro.def.code || [];
  const coroConsts = coro._ctx ? coro._ctx[1] : coro.def.consts || [];
  const coroVars = coro._ctx ? coro._ctx[2] : coro.def.vars || [];

  vm.code = coroCode;
  vm.consts = coroConsts;
  vm.vars = coroVars;
  vm.ip = coro.ip;
  vm.stack = coro.stack;
  vm.locals = coro.locals;
  vm._fp = 0;
  vm._globalVals = null;
  vm._globalNameIdx = null;

  if (coro._frData) {
    vm.frames = coro._frData.frames;
    vm._frameTop = coro._frData.frameTop;
    const frActive: VmFrameRegs = vm._fr;
    const cfr = coro._frData;
    for (let i = 0; i < cfr.frameTop; i++) {
      frActive.ips[i] = cfr.ips[i];
      frActive.fps[i] = cfr.fps[i];
      frActive.sps[i] = cfr.sps[i];
      frActive.locals[i] = cfr.locals[i];
      frActive.capturedVars[i] = cfr.capturedVars[i];
      frActive.sharedCaptured[i] = cfr.sharedCaptured[i];
      frActive.codes[i] = cfr.codes[i];
      frActive.consts[i] = cfr.consts[i];
      frActive.vars[i] = cfr.vars[i];
      frActive.stacks[i] = cfr.stacks[i];
    }
  } else {
    vm.frames = coro.frames || [];
    vm._syncFromFrames();
  }
  vm.tryStack = coro.tryStack || [];

  if (coro.capturedVars && typeof coro.capturedVars === 'object' && !Array.isArray(coro.capturedVars)) {
    vm.capturedVars = coro.capturedVars;
  }
  if (coro.sharedCaptured) {
    vm.sharedCaptured = coro.sharedCaptured;
  }
  if (arg !== undefined && arg !== null) vm.stack.push(arg);

  let result: any;
  let errorToThrow: any = null;
  try {
    const resumeResult = vm.runFromIp();
    if (resumeResult && (resumeResult.yielded || resumeResult.pending)) {
      coro.state = 'suspended';
      coro.ip = vm.ip;
      coro.stack = vm.stack;
      coro.locals = vm.locals;
      coro.tryStack = vm.tryStack;
      if (vm.capturedVars) coro.capturedVars = vm.capturedVars;
      if (vm.sharedCaptured) coro.sharedCaptured = vm.sharedCaptured;

      vm._syncFrames();
      if (!coro._frData) {
        coro._frData = {
          frames: null,
          frameTop: 0,
          ips: new Array(64),
          fps: new Array(64),
          sps: new Array(64),
          locals: new Array(64),
          capturedVars: new Array(64),
          sharedCaptured: new Array(64),
          codes: new Array(64),
          consts: new Array(64),
          vars: new Array(64),
          stacks: new Array(64),
          globalValsArrs: new Array(64)
        };
      }
      const cfr = coro._frData;
      cfr.frames = vm.frames;
      cfr.frameTop = vm._frameTop;
      const frOut: VmFrameRegs = vm._fr;
      for (let i = 0; i < vm._frameTop; i++) {
        cfr.ips[i] = frOut.ips[i];
        cfr.fps[i] = frOut.fps[i];
        cfr.sps[i] = frOut.sps[i];
        cfr.locals[i] = frOut.locals[i];
        cfr.capturedVars[i] = frOut.capturedVars[i];
        cfr.sharedCaptured[i] = frOut.sharedCaptured[i];
        cfr.codes[i] = frOut.codes[i];
        cfr.consts[i] = frOut.consts[i];
        cfr.vars[i] = frOut.vars[i];
        cfr.stacks[i] = frOut.stacks[i];
      }

      if (resumeResult.pending) {
        coro._pendingPromise = resumeResult.pending;
        coro._awaitIp = vm.ip;
        result = { _coroPending: resumeResult.pending, coro };
      } else {
        result = resumeResult.value;
      }
    } else if (resumeResult && resumeResult.success === false) {
      errorToThrow = resumeResult.error;
      coro.state = 'done';
      result = null;
    } else {
      coro.state = 'done';
      result = resumeResult && resumeResult.returnValue !== undefined ? resumeResult.returnValue : null;
    }
  } catch (e) {
    errorToThrow = e;
    coro.state = 'done';
    result = null;
  }

  vm.code = savedCode;
  vm.consts = savedConsts;
  vm.vars = savedVars;
  vm.ip = savedIp;
  vm.stack = savedStack;
  vm.locals = savedLocals;
  vm.capturedVars = savedCapturedVars;
  vm.sharedCaptured = savedSharedCaptured;
  vm._fp = savedFp;
  vm._globalVals = savedGlobalVals;
  vm._globalNameIdx = savedGlobalNameIdx;
  vm.frames = savedFrames;
  vm._frameTop = savedFrameTop;
  vm.tryStack = savedTryStack;

  const frRestore: VmFrameRegs = vm._fr;
  for (let i = 0; i < savedFrameTop; i++) {
    frRestore.ips[i] = savedFrIps[i];
    frRestore.fps[i] = savedFrFps[i];
    frRestore.sps[i] = savedFrSps[i];
    frRestore.locals[i] = savedFrLocals[i];
    frRestore.capturedVars[i] = savedFrCapturedVars[i];
    frRestore.sharedCaptured[i] = savedFrSharedCaptured[i];
    frRestore.codes[i] = savedFrCodes[i];
    frRestore.consts[i] = savedFrConsts[i];
    frRestore.vars[i] = savedFrVars[i];
    frRestore.stacks[i] = savedFrStacks[i];
  }

  if (errorToThrow) return { _coroError: String(errorToThrow) };
  return result;
}

export function createCoroutineFromDef(coroDef: any, args: any[]): any {
  const coro = {
    _type: 'coroutine',
    state: 'suspended',
    def: coroDef,
    ip: coroDef.start || 0,
    stack: [...args],
    locals: [{ ...coroDef.localScope }],
    capturedVars: [],
    sharedCaptured: null,
    fiber: !!coroDef.fiber,
    _frData: null
  };
  const coroParams = coroDef.params || [];
  for (let i = 0; i < coroParams.length; i++) {
    coro.locals[0][coroParams[i]] = i;
  }
  return coro;
}

export function createCoroutineFromClosure(fn: any, args: any[]): any {
  const coroDef = fn._funcRef || fn;
  const ctx = fn._ctx;
  const coro = {
    _type: 'coroutine',
    state: 'suspended',
    def: coroDef,
    ip: coroDef.start || 0,
    stack: [...args],
    locals: [{ ...(coroDef.localScope || {}) }],
    capturedVars: fn.capturedVars || {},
    sharedCaptured: fn.sharedCaptured || null,
    fiber: true,
    _ctx: ctx || null,
    _frData: null
  };
  const coroParams = coroDef.params || [];
  for (let i = 0; i < coroParams.length; i++) {
    coro.locals[0][coroParams[i]] = i;
  }
  return coro;
}

export function isFiberClosure(fn: any): boolean {
  return fn?._type === 'closure' && (fn._funcRef?.type === 'coroutine_def' || fn._funcRef?.fiber === true);
}

export function createCoroutineFromMethod(method: any, instance: any, args: any[]): any {
  const coro = {
    _type: 'coroutine',
    state: 'suspended',
    def: method,
    ip: method._start !== undefined ? method._start : method.start || 0,
    stack: method.isStatic ? [...(args || [])] : [instance, ...(args || [])],
    locals: [{ ...(method.localScope || {}) }],
    capturedVars: [],
    sharedCaptured: null,
    fiber: true,
    _frData: null
  };
  return coro;
}

export function getCoroutineStatus(coro: any): string {
  if (coro?._type !== 'coroutine') return 'invalid';
  return coro.state;
}
