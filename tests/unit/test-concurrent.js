// 并发安全系统单元测试：验证隔离上下文、AI 会话管理、并发安全 VM、工作区管理等并发基础设施

const { IsolatedContext, AISessionManager, ConcurrentSafeVM, WorkspaceManager } = require('../../src/concurrent/index.js');

console.log('='.repeat(60));
console.log('  Concurrent Safety System Unit Tests');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || result === undefined) {
            console.log(`[PASS] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: ${result}`);
            failed++;
        }
    } catch (error) {
        console.log(`[FAIL] ${name}: ${error.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(`${msg} Expected ${expected}, got ${actual}`);
    }
    return true;
}

function assertType(value, type) {
    if (typeof value !== type) {
        throw new Error(`Expected type ${type}, got ${typeof value}`);
    }
    return true;
}

function assertInstanceOf(value, constructor) {
    if (!(value instanceof constructor)) {
        throw new Error(`Expected instance of ${constructor.name}`);
    }
    return true;
}

console.log('\n[IsolatedContext Unit Tests]');
console.log('-'.repeat(60));

test('IsolatedContext - instantiation', () => {
    const ctx = new IsolatedContext('test-id');
    assertEqual(ctx.id, 'test-id');
    assertType(ctx.createdAt, 'number');
    assertEqual(ctx.owner, 'unknown');
    return true;
});

test('IsolatedContext - custom options', () => {
    const ctx = new IsolatedContext('test-id', {
        owner: 'ai-1',
        aiId: 'ai-1',
        taskId: 'task-1',
        priority: 5,
        initialGlobals: { x: 1 }
    });
    assertEqual(ctx.owner, 'ai-1');
    assertEqual(ctx.metadata.aiId, 'ai-1');
    assertEqual(ctx.metadata.taskId, 'task-1');
    assertEqual(ctx.metadata.priority, 5);
    assertEqual(ctx.globals.x, 1);
    return true;
});

test('IsolatedContext - acquireLock sync check', () => {
    const ctx = new IsolatedContext('test-id');
    assertEqual(ctx.locks.size, 0);
    ctx.locks.set('resource1', { holder: 'test-id', acquiredAt: Date.now() });
    assertEqual(ctx.locks.has('resource1'), true);
    return true;
});

test('IsolatedContext - releaseLock', () => {
    const ctx = new IsolatedContext('test-id');
    ctx.acquireLock('resource1');
    ctx.releaseLock('resource1');
    assertEqual(ctx.locks.has('resource1'), false);
    return true;
});

test('IsolatedContext - snapshot', () => {
    const ctx = new IsolatedContext('test-id', {
        initialGlobals: { x: 1, y: 2 }
    });
    ctx.output.push('output1');
    
    const snapshot = ctx.snapshot();
    assertEqual(snapshot.id, 'test-id');
    assertEqual(snapshot.globals.x, 1);
    assertEqual(snapshot.output[0], 'output1');
    assertType(snapshot.timestamp, 'number');
    return true;
});

console.log('\n[AISessionManager Unit Tests]');
console.log('-'.repeat(60));

test('AISessionManager - instantiation', () => {
    const sm = new AISessionManager();
    assertEqual(sm.sessions.size, 0);
    assertEqual(sm.contexts.size, 0);
    assertEqual(sm.conflictLog.length, 0);
    return true;
});

test('AISessionManager - createSession', () => {
    const sm = new AISessionManager();
    const sessionId = sm.createSession('ai-1', { priority: 1 });
    
    assertType(sessionId, 'string');
    assertEqual(sm.sessions.size, 1);
    assertEqual(sm.contexts.size, 1);
    
    const session = sm.getSession(sessionId);
    assertEqual(session.aiId, 'ai-1');
    assertEqual(session.status, 'active');
    return true;
});

test('AISessionManager - getSession', () => {
    const sm = new AISessionManager();
    const sessionId = sm.createSession('ai-1');
    
    const session = sm.getSession(sessionId);
    assertEqual(session.aiId, 'ai-1');
    
    const notFound = sm.getSession('non-existent');
    assertEqual(notFound, undefined);
    return true;
});

test('AISessionManager - getContext', () => {
    const sm = new AISessionManager();
    const sessionId = sm.createSession('ai-1');
    
    const context = sm.getContext(sessionId);
    assertInstanceOf(context, IsolatedContext);
    return true;
});

test('AISessionManager - endSession', () => {
    const sm = new AISessionManager();
    const sessionId = sm.createSession('ai-1');
    
    sm.endSession(sessionId);
    assertEqual(sm.sessions.size, 0);
    assertEqual(sm.contexts.size, 0);
    return true;
});

test('AISessionManager - getActiveSessions', () => {
    const sm = new AISessionManager();
    sm.createSession('ai-1');
    sm.createSession('ai-2');
    
    const active = sm.getActiveSessions();
    assertEqual(active.length, 2);
    return true;
});

test('AISessionManager - logConflict', () => {
    const sm = new AISessionManager();
    sm.logConflict({
        type: 'write_conflict',
        resource: 'file.js',
        ai1: 'ai-1',
        ai2: 'ai-2'
    });
    
    assertEqual(sm.conflictLog.length, 1);
    assertEqual(sm.conflictLog[0].type, 'write_conflict');
    return true;
});

console.log('\n[ConcurrentSafeVM Unit Tests]');
console.log('-'.repeat(60));

test('ConcurrentSafeVM - instantiation', () => {
    const sm = new AISessionManager();
    const vm = new ConcurrentSafeVM(sm);
    assertEqual(vm.globalState.size, 0);
    assertEqual(vm.operationQueue.length, 0);
    assertEqual(vm.isProcessing, false);
    return true;
});

test('ConcurrentSafeVM - globalState operations', () => {
    const sm = new AISessionManager();
    const vm = new ConcurrentSafeVM(sm);
    
    vm.globalState.set('key1', 'value1');
    assertEqual(vm.globalState.get('key1'), 'value1');
    assertEqual(vm.globalState.size, 1);
    return true;
});

test('ConcurrentSafeVM - operationQueue', () => {
    const sm = new AISessionManager();
    const vm = new ConcurrentSafeVM(sm);
    
    vm.operationQueue.push({ type: 'write', key: 'x', value: 1 });
    assertEqual(vm.operationQueue.length, 1);
    return true;
});

test('WorkspaceManager - instantiation', () => {
    const wm = new WorkspaceManager();
    assertEqual(wm.workspaces.size, 0);
    return true;
});

test('WorkspaceManager - createWorkspace', () => {
    const wm = new WorkspaceManager();
    const ws = wm.createWorkspace('test-workspace');
    
    assertType(ws.id, 'string');
    assertEqual(wm.workspaces.size, 1);
    return true;
});

test('WorkspaceManager - acquireFile', () => {
    const wm = new WorkspaceManager();
    const ws = wm.createWorkspace('test-workspace');
    
    const result = wm.acquireFile(ws.id, '/test/file.js', 'ai-1');
    assertEqual(result.success, true);
    return true;
});

test('WorkspaceManager - releaseFile', () => {
    const wm = new WorkspaceManager();
    const ws = wm.createWorkspace('test-workspace');
    
    wm.acquireFile(ws.id, '/test/file.js', 'ai-1');
    const released = wm.releaseFile(ws.id, '/test/file.js', 'ai-1');
    assertEqual(released, true);
    return true;
});

test('WorkspaceManager - recordChange', () => {
    const wm = new WorkspaceManager();
    const ws = wm.createWorkspace('test-workspace');
    
    wm.recordChange(ws.id, '/test/file.js', 'ai-1', { type: 'edit' });
    assertEqual(wm.changeHistory.length, 1);
    return true;
});

test('IsolatedContext - snapshot data integrity', () => {
    const ctx = new IsolatedContext('test-1', {
        initialGlobals: { x: 10, y: 20 }
    });
    ctx.output.push('test output');
    
    const snapshot = ctx.snapshot();
    
    assertEqual(snapshot.globals.x, 10);
    assertEqual(snapshot.globals.y, 20);
    assertEqual(snapshot.output[0], 'test output');
    assertType(snapshot.timestamp, 'number');
    return true;
});

test('AISessionManager - multiple sessions', () => {
    const sm = new AISessionManager();
    const id1 = sm.createSession('ai-1');
    const id2 = sm.createSession('ai-2');
    const id3 = sm.createSession('ai-3');
    
    assertEqual(sm.sessions.size, 3);
    
    sm.endSession(id2);
    assertEqual(sm.sessions.size, 2);
    return true;
});

console.log('\n' + '='.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
