/**
 * SeedLang 并发安全系统
 * Concurrent Safety System for Multi-AI Collaboration
 * 
 * 支持多个AI同时工作的安全机制
 */

let randomUUID;
try {
    randomUUID = require('crypto').randomUUID;
} catch (e) {
    randomUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    };
}

// ============================================
// 1. 隔离执行环境
// ============================================
class IsolatedContext {
    constructor(id, options = {}) {
        this.id = id;
        this.createdAt = Date.now();
        this.owner = options.owner || 'unknown';
        this.globals = { ...options.initialGlobals };
        this.output = [];
        this.locks = new Map();
        this.metadata = {
            aiId: options.aiId,
            taskId: options.taskId,
            priority: options.priority || 0
        };
    }
    
    acquireLock(resource, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (!this.locks.has(resource)) {
                this.locks.set(resource, {
                    holder: this.id,
                    acquiredAt: Date.now()
                });
                resolve(true);
            } else {
                const lock = this.locks.get(resource);
                if (Date.now() - lock.acquiredAt > timeout) {
                    this.locks.set(resource, {
                        holder: this.id,
                        acquiredAt: Date.now()
                    });
                    resolve(true);
                } else {
                    reject(new Error(`Resource '${resource}' is locked by ${lock.holder}`));
                }
            }
        });
    }
    
    releaseLock(resource) {
        this.locks.delete(resource);
    }
    
    snapshot() {
        return {
            id: this.id,
            globals: { ...this.globals },
            output: [...this.output],
            timestamp: Date.now()
        };
    }
}

// ============================================
// 2. AI会话管理器
// ============================================
class AISessionManager {
    constructor() {
        this.sessions = new Map();
        this.contexts = new Map();
        this.conflictLog = [];
    }
    
    createSession(aiId, options = {}) {
        const sessionId = `session_${aiId}_${Date.now()}`;
        const context = new IsolatedContext(sessionId, {
            owner: aiId,
            aiId,
            ...options
        });
        
        this.sessions.set(sessionId, {
            id: sessionId,
            aiId,
            createdAt: Date.now(),
            status: 'active',
            operations: []
        });
        
        this.contexts.set(sessionId, context);
        
        return sessionId;
    }
    
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    
    getContext(sessionId) {
        return this.contexts.get(sessionId);
    }
    
    endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = 'ended';
            session.endedAt = Date.now();
        }
        this.contexts.delete(sessionId);
        this.sessions.delete(sessionId);
    }
    
    getActiveSessions() {
        const active = [];
        for (const [id, session] of this.sessions) {
            if (session.status === 'active') {
                active.push({ id, ...session });
            }
        }
        return active;
    }
    
    logConflict(conflict) {
        this.conflictLog.push({
            ...conflict,
            timestamp: Date.now()
        });
    }
}

// ============================================
// 3. 并发安全虚拟机
// ============================================
class ConcurrentSafeVM {
    constructor(sessionManager) {
        this.sessionManager = sessionManager;
        this.globalState = new Map();
        this.pendingOperations = [];
        this.operationQueue = [];
        this.isProcessing = false;
    }
    
    async executeInContext(sessionId, code, vm) {
        const context = this.sessionManager.getContext(sessionId);
        if (!context) {
            throw new Error(`Session ${sessionId} not found`);
        }
        
        const operation = {
            id: randomUUID(),
            sessionId,
            code,
            status: 'pending',
            createdAt: Date.now()
        };
        
        this.operationQueue.push(operation);
        
        return new Promise((resolve, reject) => {
            operation.resolve = resolve;
            operation.reject = reject;
            this.processQueue();
        });
    }
    
    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        while (this.operationQueue.length > 0) {
            const operation = this.operationQueue.shift();
            if (!operation) continue;
            
            try {
                operation.status = 'processing';
                const context = this.sessionManager.getContext(operation.sessionId);
                
                if (!context) {
                    throw new Error(`Context not found for session ${operation.sessionId}`);
                }
                
                const result = await this.safeExecute(operation, context);
                operation.status = 'completed';
                operation.resolve(result);
            } catch (error) {
                operation.status = 'failed';
                operation.reject(error);
            }
        }
        
        this.isProcessing = false;
    }
    
    async safeExecute(operation, context) {
        return {
            success: true,
            output: [],
            context: context.snapshot()
        };
    }
}

// ============================================
// 4. 工作区管理器
// ============================================
class WorkspaceManager {
    constructor() {
        this.workspaces = new Map();
        this.fileLocks = new Map();
        this.changeHistory = [];
    }
    
    createWorkspace(name, options = {}) {
        const workspace = {
            id: randomUUID(),
            name,
            files: new Map(),
            createdAt: Date.now(),
            owners: options.owners || [],
            permissions: options.permissions || {}
        };
        
        this.workspaces.set(workspace.id, workspace);
        return workspace;
    }
    
    acquireFile(workspaceId, filePath, aiId, mode = 'write') {
        const lockKey = `${workspaceId}:${filePath}`;
        
        if (this.fileLocks.has(lockKey)) {
            const lock = this.fileLocks.get(lockKey);
            if (lock.aiId !== aiId) {
                return {
                    success: false,
                    error: `File is locked by AI ${lock.aiId}`,
                    lockedBy: lock.aiId,
                    lockedAt: lock.lockedAt
                };
            }
        }
        
        this.fileLocks.set(lockKey, {
            aiId,
            mode,
            lockedAt: Date.now()
        });
        
        return { success: true };
    }
    
    releaseFile(workspaceId, filePath, aiId) {
        const lockKey = `${workspaceId}:${filePath}`;
        const lock = this.fileLocks.get(lockKey);
        
        if (lock && lock.aiId === aiId) {
            this.fileLocks.delete(lockKey);
            return true;
        }
        return false;
    }
    
    recordChange(workspaceId, filePath, aiId, change) {
        this.changeHistory.push({
            workspaceId,
            filePath,
            aiId,
            change,
            timestamp: Date.now()
        });
    }
    
    getHistory(workspaceId, filePath) {
        return this.changeHistory.filter(
            h => h.workspaceId === workspaceId && h.filePath === filePath
        );
    }
    
    detectConflict(workspaceId, filePath) {
        const history = this.getHistory(workspaceId, filePath);
        const recentChanges = history.slice(-10);
        
        const aiChanges = new Map();
        for (const change of recentChanges) {
            if (!aiChanges.has(change.aiId)) {
                aiChanges.set(change.aiId, []);
            }
            aiChanges.get(change.aiId).push(change);
        }
        
        if (aiChanges.size > 1) {
            const ais = Array.from(aiChanges.keys());
            return {
                hasConflict: true,
                ais,
                message: `Multiple AIs (${ais.join(', ')}) modified ${filePath}`
            };
        }
        
        return { hasConflict: false };
    }
}

// ============================================
// 5. 冲突解决器
// ============================================
class ConflictResolver {
    constructor() {
        this.strategies = {
            'last-write-wins': this.lastWriteWins.bind(this),
            'first-write-wins': this.firstWriteWins.bind(this),
            'merge': this.mergeChanges.bind(this),
            'manual': this.manualResolve.bind(this)
        };
    }
    
    resolve(conflict, strategy = 'last-write-wins') {
        const resolver = this.strategies[strategy];
        if (resolver) {
            return resolver(conflict);
        }
        throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
    }
    
    lastWriteWins(conflict) {
        const changes = conflict.changes.sort((a, b) => b.timestamp - a.timestamp);
        return {
            resolved: true,
            winner: changes[0],
            strategy: 'last-write-wins'
        };
    }
    
    firstWriteWins(conflict) {
        const changes = conflict.changes.sort((a, b) => a.timestamp - b.timestamp);
        return {
            resolved: true,
            winner: changes[0],
            strategy: 'first-write-wins'
        };
    }
    
    mergeChanges(conflict) {
        return {
            resolved: true,
            merged: conflict.changes,
            strategy: 'merge',
            requiresReview: true
        };
    }
    
    manualResolve(conflict) {
        return {
            resolved: false,
            requiresManualIntervention: true,
            conflict,
            strategy: 'manual'
        };
    }
}

// ============================================
// 6. AI协作协调器
// ============================================
class AICoordinator {
    constructor() {
        this.sessionManager = new AISessionManager();
        this.workspaceManager = new WorkspaceManager();
        this.conflictResolver = new ConflictResolver();
        this.aiRegistry = new Map();
    }
    
    registerAI(aiId, capabilities = {}) {
        this.aiRegistry.set(aiId, {
            id: aiId,
            capabilities,
            registeredAt: Date.now(),
            status: 'idle'
        });
    }
    
    async assignTask(aiId, task) {
        const ai = this.aiRegistry.get(aiId);
        if (!ai) {
            throw new Error(`AI ${aiId} not registered`);
        }
        
        const sessionId = this.sessionManager.createSession(aiId, {
            taskId: task.id,
            priority: task.priority
        });
        
        ai.status = 'working';
        ai.currentTask = task.id;
        
        return {
            success: true,
            sessionId,
            context: this.sessionManager.getContext(sessionId)
        };
    }
    
    endSession(sessionId) {
        this.sessionManager.endSession(sessionId);
    }
    
    completeTask(aiId) {
        const ai = this.aiRegistry.get(aiId);
        if (ai) {
            ai.status = 'idle';
            ai.currentTask = null;
        }
    }
    
    async requestResource(aiId, resource, mode = 'read') {
        const ai = this.aiRegistry.get(aiId);
        if (!ai) {
            throw new Error(`AI ${aiId} not registered`);
        }
        
        return {
            granted: true,
            aiId,
            resource,
            mode,
            timestamp: Date.now()
        };
    }
    
    broadcast(message, excludeAI = null) {
        const recipients = [];
        for (const [aiId, ai] of this.aiRegistry) {
            if (aiId !== excludeAI && ai.status !== 'offline') {
                recipients.push(aiId);
            }
        }
        return recipients;
    }
    
    getStatus() {
        const status = {
            totalAIs: this.aiRegistry.size,
            activeAIs: 0,
            idleAIs: 0,
            workingAIs: 0,
            activeSessions: this.sessionManager.sessions.size,
            conflicts: this.sessionManager.conflictLog.length
        };
        
        for (const [, ai] of this.aiRegistry) {
            if (ai.status === 'working') status.workingAIs++;
            else if (ai.status === 'idle') status.idleAIs++;
            else status.activeAIs++;
        }
        
        return status;
    }
}

// ============================================
// 7. 死锁检测器
// ============================================
class DeadlockDetector {
    constructor(options = {}) {
        this.waitGraph = new Map();
        this.lockHolders = new Map();
        this.deadlockHistory = [];
        this.checkInterval = options.checkInterval || 1000;
        this.timeout = options.timeout || 30000;
        this._checkTimer = null;
    }
    
    addWaitRequest(waiter, resource) {
        if (!this.waitGraph.has(waiter)) {
            this.waitGraph.set(waiter, new Set());
        }
        this.waitGraph.set(waiter, this.waitGraph.get(waiter).add(resource));
    }
    
    removeWaitRequest(waiter, resource) {
        const resources = this.waitGraph.get(waiter);
        if (resources) {
            resources.delete(resource);
            if (resources.size === 0) {
                this.waitGraph.delete(waiter);
            }
        }
    }
    
    recordLockHolder(resource, holder, timestamp = Date.now()) {
        this.lockHolders.set(resource, { holder, timestamp });
    }
    
    releaseLock(resource) {
        this.lockHolders.delete(resource);
    }
    
    detectDeadlock() {
        const visited = new Set();
        const recursionStack = new Set();
        const deadlocks = [];
        
        const dfs = (node, path) => {
            visited.add(node);
            recursionStack.add(node);
            
            const waitingFor = this.waitGraph.get(node);
            if (waitingFor) {
                for (const resource of waitingFor) {
                    const lockHolder = this.lockHolders.get(resource);
                    if (lockHolder) {
                        const holder = lockHolder.holder;
                        
                        if (recursionStack.has(holder)) {
                            const cycle = [...path, holder].slice(path.indexOf(holder));
                            deadlocks.push({
                                type: 'circular_wait',
                                participants: cycle,
                                resources: Array.from(waitingFor),
                                detectedAt: Date.now()
                            });
                        } else if (!visited.has(holder)) {
                            dfs(holder, [...path, holder]);
                        }
                    }
                }
            }
            
            recursionStack.delete(node);
        };
        
        for (const [waiter] of this.waitGraph) {
            if (!visited.has(waiter)) {
                dfs(waiter, [waiter]);
            }
        }
        
        if (deadlocks.length > 0) {
            this.deadlockHistory.push(...deadlocks);
        }
        
        return deadlocks;
    }
    
    resolveDeadlock(deadlock) {
        const participants = deadlock.participants;
        if (participants.length === 0) return null;
        
        const victim = participants.reduce((oldest, current) => {
            const oldestTime = this.lockHolders.get(current)?.timestamp || Infinity;
            const currentTime = this.lockHolders.get(current)?.timestamp || Infinity;
            return currentTime < oldestTime ? current : oldest;
        }, participants[0]);
        
        const resourcesToRelease = [];
        for (const [resource, lock] of this.lockHolders) {
            if (lock.holder === victim) {
                resourcesToRelease.push(resource);
                this.releaseLock(resource);
            }
        }
        
        this.removeWaitRequest(victim, deadlock.resources[0]);
        
        return {
            resolved: true,
            victim,
            releasedResources: resourcesToRelease,
            strategy: 'preemption'
        };
    }
    
    startMonitoring() {
        if (this._checkTimer) return;
        
        this._checkTimer = setInterval(() => {
            const deadlocks = this.detectDeadlock();
            for (const deadlock of deadlocks) {
                this.resolveDeadlock(deadlock);
            }
        }, this.checkInterval);
    }
    
    stopMonitoring() {
        if (this._checkTimer) {
            clearInterval(this._checkTimer);
            this._checkTimer = null;
        }
    }
    
    getStats() {
        return {
            currentWaiters: this.waitGraph.size,
            currentLocks: this.lockHolders.size,
            totalDeadlocks: this.deadlockHistory.length,
            recentDeadlocks: this.deadlockHistory.slice(-10)
        };
    }
}

// ============================================
// 8. 事务管理器
// ============================================
class TransactionManager {
    constructor(options = {}) {
        this.transactions = new Map();
        this.savepoints = new Map();
        this.transactionLog = [];
        this.maxLogSize = options.maxLogSize || 1000;
        this.autoRollbackOnError = options.autoRollbackOnError !== false;
    }
    
    begin(sessionId, options = {}) {
        const txId = `tx_${sessionId}_${Date.now()}`;
        const transaction = {
            id: txId,
            sessionId,
            status: 'active',
            startTime: Date.now(),
            operations: [],
            savepoints: [],
            isolationLevel: options.isolationLevel || 'read_committed',
            timeout: options.timeout || 30000
        };
        
        this.transactions.set(txId, transaction);
        this.logOperation(txId, 'begin', { sessionId });
        
        return txId;
    }
    
    commit(txId) {
        const tx = this.transactions.get(txId);
        if (!tx) {
            throw new Error(`Transaction ${txId} not found`);
        }
        
        if (tx.status !== 'active') {
            throw new Error(`Transaction ${txId} is not active`);
        }
        
        tx.status = 'committed';
        tx.endTime = Date.now();
        
        this.logOperation(txId, 'commit', { duration: tx.endTime - tx.startTime });
        this.transactions.delete(txId);
        this.savepoints.delete(txId);
        
        return { success: true, txId, duration: tx.endTime - tx.startTime };
    }
    
    rollback(txId, savepointName = null) {
        const tx = this.transactions.get(txId);
        if (!tx) {
            throw new Error(`Transaction ${txId} not found`);
        }
        
        if (savepointName) {
            const savepoint = tx.savepoints.find(sp => sp.name === savepointName);
            if (!savepoint) {
                throw new Error(`Savepoint ${savepointName} not found`);
            }
            
            const rollbackOps = tx.operations.slice(savepoint.index);
            tx.operations = tx.operations.slice(0, savepoint.index);
            tx.savepoints = tx.savepoints.filter(sp => sp.index < savepoint.index);
            
            this.logOperation(txId, 'rollback_to_savepoint', { 
                savepointName, 
                rolledBackOps: rollbackOps.length 
            });
            
            return { success: true, rolledBack: rollbackOps.length };
        }
        
        tx.status = 'rolled_back';
        tx.endTime = Date.now();
        
        this.logOperation(txId, 'rollback', { 
            duration: tx.endTime - tx.startTime,
            operationsRolledBack: tx.operations.length 
        });
        
        this.transactions.delete(txId);
        this.savepoints.delete(txId);
        
        return { success: true, txId, operationsRolledBack: tx.operations.length };
    }
    
    createSavepoint(txId, name) {
        const tx = this.transactions.get(txId);
        if (!tx) {
            throw new Error(`Transaction ${txId} not found`);
        }
        
        const savepoint = {
            name,
            index: tx.operations.length,
            createdAt: Date.now()
        };
        
        tx.savepoints.push(savepoint);
        
        if (!this.savepoints.has(txId)) {
            this.savepoints.set(txId, []);
        }
        this.savepoints.get(txId).push(savepoint);
        
        this.logOperation(txId, 'savepoint', { name });
        
        return { success: true, name, index: savepoint.index };
    }
    
    addOperation(txId, operation) {
        const tx = this.transactions.get(txId);
        if (!tx) {
            throw new Error(`Transaction ${txId} not found`);
        }
        
        if (tx.status !== 'active') {
            throw new Error(`Transaction ${txId} is not active`);
        }
        
        const op = {
            ...operation,
            timestamp: Date.now(),
            index: tx.operations.length
        };
        
        tx.operations.push(op);
        
        return op;
    }
    
    logOperation(txId, type, data = {}) {
        const logEntry = {
            txId,
            type,
            data,
            timestamp: Date.now()
        };
        
        this.transactionLog.push(logEntry);
        
        if (this.transactionLog.length > this.maxLogSize) {
            this.transactionLog.shift();
        }
    }
    
    getTransaction(txId) {
        return this.transactions.get(txId);
    }
    
    getActiveTransactions() {
        const active = [];
        for (const [id, tx] of this.transactions) {
            if (tx.status === 'active') {
                active.push({ id, ...tx });
            }
        }
        return active;
    }
    
    checkTimeouts() {
        const now = Date.now();
        const timedOut = [];
        
        for (const [id, tx] of this.transactions) {
            if (tx.status === 'active' && (now - tx.startTime) > tx.timeout) {
                timedOut.push(id);
                if (this.autoRollbackOnError) {
                    this.rollback(id);
                }
            }
        }
        
        return timedOut;
    }
    
    getStats() {
        return {
            activeTransactions: this.transactions.size,
            totalSavepoints: Array.from(this.savepoints.values()).reduce((sum, sps) => sum + sps.length, 0),
            logSize: this.transactionLog.length
        };
    }
}

// ============================================
// 导出
// ============================================
module.exports = {
    IsolatedContext,
    AISessionManager,
    ConcurrentSafeVM,
    WorkspaceManager,
    ConflictResolver,
    AICoordinator,
    DeadlockDetector,
    TransactionManager
};
