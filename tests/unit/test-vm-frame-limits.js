'use strict';

const { MAX_FRAME_DEPTH, DEFAULT_OPERAND_STACK_SIZE, MAX_OPERAND_STACK_SLOTS, ensureOperandHeadroom, enforceAggregateCount, enforceAggregateMerge } = require('../../src/runtime/vm/frame_limits.js');
const { vmSyncFrames, vmSyncFromFrames } = require('../../src/runtime/vm/frame_ops.js');
const { VM, OP, SeedLangVM } = require('../../src/runtime/vm.js');

function makeRunFromIpLeafClosure() {
    const leafConsts = [42];
    const leafCode = [OP.CONST, 0, OP.RETURN];
    const funcRef = { params: [], start: 0, name: 'leaf', capturedVars: [] };
    return {
        _type: 'closure',
        _noCapture: true,
        _start: 0,
        start: 0,
        code: leafCode,
        consts: leafConsts,
        vars: [],
        params: [],
        capturedVars: {},
        sharedCaptured: null,
        _funcRef: funcRef,
        localScope: {}
    };
}

console.log('='.repeat(60));
console.log('  VM Frame Limits Unit Tests');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || result === undefined) {
            console.log(`  [OK] ${name}`);
            passed++;
        } else {
            console.log(`  [FAIL] ${name}: ${result}`);
            failed++;
        }
    } catch (e) {
        console.log(`  [FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(`${msg || ''} Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
}

function emptyFrSlotArrays(n) {
    return {
        ips: new Array(n),
        fps: new Array(n),
        sps: new Array(n),
        locals: new Array(n),
        capturedVars: new Array(n),
        sharedCaptured: new Array(n),
        codes: new Array(n),
        consts: new Array(n),
        vars: new Array(n),
        stacks: new Array(n),
        simple: new Uint8Array(n),
        cvArrs: new Array(n),
        closures: new Array(n),
        globalValsArrs: new Array(n)
    };
}

console.log('\n--- frame_limits ---');

test('exports MAX_FRAME_DEPTH as positive integer', () => {
    assertEqual(Number.isInteger(MAX_FRAME_DEPTH), true);
    assertEqual(MAX_FRAME_DEPTH > 0, true);
});

test('exports DEFAULT_OPERAND_STACK_SIZE as positive integer', () => {
    assertEqual(Number.isInteger(DEFAULT_OPERAND_STACK_SIZE), true);
    assertEqual(DEFAULT_OPERAND_STACK_SIZE > 0, true);
});

test('MAX_OPERAND_STACK_SLOTS scales with frame depth', () => {
    assertEqual(MAX_OPERAND_STACK_SLOTS, MAX_FRAME_DEPTH * 8);
});

test('ensureOperandHeadroom throws when stack would exceed cap', () => {
    let threw = false;
    try {
        ensureOperandHeadroom(MAX_OPERAND_STACK_SLOTS, 0, 1);
    } catch (e) {
        threw = e.code === 'OPERAND_STACK_OVERFLOW';
    }
    assertEqual(threw, true);
});

test('enforceAggregateCount respects vm._maxRangeItems', () => {
    const vm = { _maxRangeItems: 100 };
    assertEqual(enforceAggregateCount(vm, 101, 'lit'), 'lit exceeds max items (100)');
    assertEqual(enforceAggregateCount(vm, 50, 'lit'), null);
    assertEqual(enforceAggregateCount(vm, -1, 'lit'), 'invalid lit length');
});

test('enforceAggregateMerge rejects cumulative overflow', () => {
    const vm = { _maxRangeItems: 10 };
    assertEqual(enforceAggregateMerge(vm, 9, 2, 'merge'), 'merge exceeds max items (10)');
    assertEqual(enforceAggregateMerge(vm, 5, 5, 'merge'), null);
    assertEqual(enforceAggregateMerge(vm, -1, 1, 'merge'), 'invalid merge size');
});

console.log('\n--- vmSyncFrames ---');

test('throws RangeError when _frameTop exceeds MAX_FRAME_DEPTH', () => {
    const vm = {
        _frameTop: MAX_FRAME_DEPTH + 1,
        _fr: emptyFrSlotArrays(MAX_FRAME_DEPTH + 1),
        frames: []
    };
    let threw = false;
    try {
        vmSyncFrames(vm);
    } catch (e) {
        threw = e instanceof RangeError && e.message.includes('frameTop exceeds');
    }
    assertEqual(threw, true);
});

test('allows _frameTop === MAX_FRAME_DEPTH', () => {
    const vm = {
        _frameTop: MAX_FRAME_DEPTH,
        _fr: emptyFrSlotArrays(MAX_FRAME_DEPTH),
        frames: []
    };
    for (let i = 0; i < MAX_FRAME_DEPTH; i++) {
        vm._fr.ips[i] = i;
        vm._fr.fps[i] = 1;
        vm._fr.sps[i] = 2;
        vm._fr.locals[i] = {};
        vm._fr.capturedVars[i] = null;
        vm._fr.sharedCaptured[i] = null;
    }
    vmSyncFrames(vm);
    assertEqual(vm.frames.length, MAX_FRAME_DEPTH);
    assertEqual(vm.frames[MAX_FRAME_DEPTH - 1].ip, MAX_FRAME_DEPTH - 1);
});

test('vmSync roundtrips simple cvArrs closures globalValsArrs', () => {
    const vm = {
        _frameTop: 1,
        _fr: emptyFrSlotArrays(4),
        frames: []
    };
    vm._fr.ips[0] = 42;
    vm._fr.simple[0] = 1;
    vm._fr.cvArrs[0] = [9];
    vm._fr.closures[0] = { mark: 1 };
    vm._fr.globalValsArrs[0] = [1, 2];
    vmSyncFrames(vm);
    vm._fr.simple[0] = 0;
    vm._fr.cvArrs[0] = null;
    vm._fr.closures[0] = null;
    vm._fr.globalValsArrs[0] = null;
    vmSyncFromFrames(vm);
    assertEqual(vm._fr.simple[0], 1);
    assertEqual(vm._fr.cvArrs[0][0], 9);
    assertEqual(vm._fr.closures[0].mark, 1);
    assertEqual(vm._fr.globalValsArrs[0][1], 2);
    assertEqual(vm._fr.ips[0], 42);
});

test('syncs small stack into frames', () => {
    const vm = {
        _frameTop: 2,
        _fr: emptyFrSlotArrays(4),
        frames: []
    };
    vm._fr.ips[0] = 10;
    vm._fr.fps[0] = 0;
    vm._fr.sps[0] = 1;
    vm._fr.locals[0] = { a: 0 };
    vm._fr.capturedVars[0] = null;
    vm._fr.sharedCaptured[0] = null;
    vm._fr.ips[1] = 20;
    vm._fr.fps[1] = 1;
    vm._fr.sps[1] = 2;
    vm._fr.locals[1] = { b: 1 };
    vm._fr.capturedVars[1] = null;
    vm._fr.sharedCaptured[1] = null;
    vmSyncFrames(vm);
    assertEqual(vm.frames.length, 2);
    assertEqual(vm.frames[0].ip, 10);
    assertEqual(vm.frames[1].ip, 20);
});

console.log('\n--- vmSyncFromFrames ---');

test('throws RangeError when frames.length exceeds MAX_FRAME_DEPTH', () => {
    const vm = {
        frames: new Array(MAX_FRAME_DEPTH + 1),
        _frameTop: 0,
        _fr: emptyFrSlotArrays(MAX_FRAME_DEPTH + 2)
    };
    let threw = false;
    try {
        vmSyncFromFrames(vm);
    } catch (e) {
        threw = e instanceof RangeError && e.message.includes('frame restore exceeds');
    }
    assertEqual(threw, true);
});

test('allows frames.length === MAX_FRAME_DEPTH', () => {
    const vm = {
        frames: [],
        _frameTop: 0,
        _fr: emptyFrSlotArrays(MAX_FRAME_DEPTH)
    };
    for (let i = 0; i < MAX_FRAME_DEPTH; i++) {
        vm.frames.push({
            ip: i,
            fp: 0,
            sp: 0,
            locals: {},
            capturedVars: null,
            sharedCaptured: null
        });
    }
    vmSyncFromFrames(vm);
    assertEqual(vm._frameTop, MAX_FRAME_DEPTH);
    assertEqual(vm._fr.ips[MAX_FRAME_DEPTH - 1], MAX_FRAME_DEPTH - 1);
});

test('restores _fr from frames', () => {
    const vm = {
        frames: [
            { ip: 5, fp: 1, sp: 2, locals: { x: 0 }, capturedVars: null, sharedCaptured: null },
            { ip: 9, fp: 3, sp: 4, locals: { y: 1 }, capturedVars: null, sharedCaptured: null }
        ],
        _frameTop: 0,
        _fr: emptyFrSlotArrays(8)
    };
    vmSyncFromFrames(vm);
    assertEqual(vm._frameTop, 2);
    assertEqual(vm._fr.ips[0], 5);
    assertEqual(vm._fr.ips[1], 9);
    assertEqual(vm._fr.fps[1], 3);
});

console.log('\n--- runFromIp frame overflow ---');

test('CALL0 at MAX_FRAME_DEPTH restores closure and does not push a frame', () => {
    const closure = makeRunFromIpLeafClosure();
    const code = [OP.CONST, 0, OP.CALL0];
    const vm = new VM({ jit: false });
    vm.code = code;
    vm.consts = [closure];
    vm.vars = [];
    vm.ip = 0;
    vm.stack = [];
    vm.locals = [{ kept: 1 }];
    vm.frames = [];
    vm._frameTop = MAX_FRAME_DEPTH;
    const r = vm.runFromIp();
    assertEqual(r.success, false);
    assertEqual(r.error, 'stack overflow');
    assertEqual(vm.stack.length, 1);
    assertEqual(vm.stack[0], closure);
    assertEqual(vm.locals[0].kept, 1);
    assertEqual(vm.frames.length, 0);
});

test('GENERIC_CALL n=0 at MAX_FRAME_DEPTH restores fn and typeArgs', () => {
    const closure = makeRunFromIpLeafClosure();
    const typeArgs = { tag: 'type-args' };
    const code = [OP.CONST, 0, OP.CONST, 1, OP.GENERIC_CALL, 0];
    const vm = new VM({ jit: false });
    vm.code = code;
    vm.consts = [closure, typeArgs];
    vm.vars = [];
    vm.ip = 0;
    vm.stack = [];
    vm.locals = [{ kept: 2 }];
    vm.frames = [];
    vm._frameTop = MAX_FRAME_DEPTH;
    const r = vm.runFromIp();
    assertEqual(r.success, false);
    assertEqual(r.error, 'stack overflow');
    assertEqual(vm.stack.length, 2);
    assertEqual(vm.stack[0], closure);
    assertEqual(vm.stack[1], typeArgs);
    assertEqual(vm.locals[0].kept, 2);
    assertEqual(vm.frames.length, 0);
});

console.log('\n--- instance host frame restore (integration) ---');

test('after NEW + init VM frame state is clean', () => {
    const seedVm = new SeedLangVM({ jit: false });
    const vm = seedVm._vm;
    const r = seedVm.run(`class C { init(x) { this.x = x } }\na = C(7)\nprint(a.x)`);
    if (!r || r.success === false) throw new Error((r && r.error) || 'run failed');
    assertEqual(vm.frames.length, 0);
    assertEqual(vm._frameTop, 0);
});

test('after instance method via host VM frame state is clean', () => {
    const seedVm = new SeedLangVM({ jit: false });
    const vm = seedVm._vm;
    const r = seedVm.run(`class C { init(x) { this.x = x } get() { return this.x } }\na = C(9)\nprint(a.get())`);
    if (!r || r.success === false) throw new Error((r && r.error) || 'run failed');
    assertEqual(vm.frames.length, 0);
    assertEqual(vm._frameTop, 0);
});

console.log('\n' + '='.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
