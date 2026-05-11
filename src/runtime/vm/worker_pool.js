'use strict';

const { Worker } = require('worker_threads');
const os = require('os');

const MAX_WORKERS = Math.min(os.cpus().length, 8);

class WorkStealingDeque {
    constructor() {
        this._items = [];
    }

    push(item) {
        this._items.push(item);
    }

    pop() {
        return this._items.pop();
    }

    steal() {
        return this._items.shift();
    }

    get length() {
        return this._items.length;
    }

    peek() {
        return this._items[this._items.length - 1];
    }

    stealPeek() {
        return this._items[0];
    }
}

class WorkerPool {
    constructor(options = {}) {
        this._maxWorkers = options.maxWorkers || MAX_WORKERS;
        this._workers = [];
        this._idleWorkers = [];
        this._globalQueue = [];
        this._taskId = 0;
        this._pendingTasks = new Map();
        this._initialized = false;
        this._shuttingDown = false;
        this._workStealing = options.workStealing !== false;
        this._localQueues = new Map();
        this._stats = {
            tasksSubmitted: 0,
            tasksCompleted: 0,
            tasksStolen: 0,
            stealAttempts: 0
        };
    }

    _getWorkerScript() {
        return `
'use strict';
const { workerData, parentPort } = require('worker_threads');
const { SeedLangVM } = require(workerData.vmPath);

const vm = new SeedLangVM({ maxInstructions: workerData.maxInstructions || 50000000 });

parentPort.on('message', async (task) => {
    try {
        if (task.type === 'execute') {
            const result = vm.run(task.code);
            const value = vm.vm.globals.result;
            parentPort.postMessage({ taskId: task.taskId, type: 'result', success: result.success, output: result.output, error: result.error, value });
        } else if (task.type === 'executeAsync') {
            const result = await vm.runAsync(task.code);
            const value = vm.vm.globals.result;
            parentPort.postMessage({ taskId: task.taskId, type: 'result', success: result.success, output: result.output, error: result.error, value });
        } else if (task.type === 'eval') {
            const fn = new Function('vm', 'context', task.code);
            const result = fn(vm, vm.vm);
            parentPort.postMessage({ taskId: task.taskId, type: 'result', success: true, data: result });
        } else if (task.type === 'ping') {
            parentPort.postMessage({ taskId: task.taskId, type: 'pong' });
        }
    } catch (e) {
        parentPort.postMessage({ taskId: task.taskId, type: 'result', success: false, error: e.message });
    }
});

parentPort.postMessage({ type: 'ready' });
`;
    }

    _ensureWorkers() {
        if (this._initialized) return;
        this._initialized = true;
        const vmPath = require.resolve('../vm.js').replace(/\\\\/g, '/');
        for (let i = 0; i < this._maxWorkers; i++) {
            this._createWorker(vmPath);
        }
    }

    _createWorker(vmPath) {
        const worker = new Worker(this._getWorkerScript(), {
            eval: true,
            workerData: {
                vmPath,
                maxInstructions: 50000000
            }
        });
        const workerInfo = {
            worker,
            busy: false,
            ready: false,
            id: worker.threadId,
            localQueue: new WorkStealingDeque(),
            tasksCompleted: 0,
            tasksStolen: 0,
            lastTaskTime: 0
        };
        this._localQueues.set(worker.threadId, workerInfo.localQueue);
        worker.on('message', (msg) => {
            if (msg.type === 'ready') {
                workerInfo.ready = true;
                if (!workerInfo.busy) {
                    this._idleWorkers.push(workerInfo);
                    this._processQueue();
                }
            } else if (msg.taskId !== undefined) {
                const pending = this._pendingTasks.get(msg.taskId);
                if (pending) {
                    this._pendingTasks.delete(msg.taskId);
                    workerInfo.busy = false;
                    workerInfo.tasksCompleted++;
                    workerInfo.lastTaskTime = Date.now();
                    this._stats.tasksCompleted++;
                    this._idleWorkers.push(workerInfo);
                    this._dispatchFromLocalQueue(workerInfo);
                    this._processQueue();
                    if (msg.success) {
                        pending.resolve(msg);
                    } else {
                        pending.reject(new Error(msg.error || 'Worker execution failed'));
                    }
                }
            }
        });
        worker.on('error', (err) => {
            workerInfo.ready = false;
            workerInfo.busy = false;
            const idx = this._idleWorkers.indexOf(workerInfo);
            if (idx >= 0) this._idleWorkers.splice(idx, 1);
            for (const [taskId, pending] of this._pendingTasks) {
                if (pending.workerId === worker.threadId) {
                    this._pendingTasks.delete(taskId);
                    pending.reject(err);
                }
            }
            const localQ = this._localQueues.get(worker.threadId);
            if (localQ) {
                while (localQ.length > 0) {
                    const stolen = localQ.steal();
                    if (stolen) this._globalQueue.push(stolen);
                }
                this._localQueues.delete(worker.threadId);
            }
        });
        this._workers.push(workerInfo);
        return workerInfo;
    }

    _findLeastLoadedWorker() {
        let best = null;
        let bestLoad = Infinity;
        for (const w of this._workers) {
            if (!w.ready) continue;
            const load = w.localQueue.length + (w.busy ? 1 : 0);
            if (load < bestLoad) {
                bestLoad = load;
                best = w;
            }
        }
        return best;
    }

    _findMostLoadedWorker() {
        let best = null;
        let bestLoad = -1;
        for (const w of this._workers) {
            if (!w.ready) continue;
            const load = w.localQueue.length;
            if (load > bestLoad) {
                bestLoad = load;
                best = w;
            }
        }
        return bestLoad > 0 ? best : null;
    }

    _trySteal() {
        if (!this._workStealing) return null;
        this._stats.stealAttempts++;
        const victim = this._findMostLoadedWorker();
        if (!victim) return null;
        const task = victim.localQueue.steal();
        if (task) {
            this._stats.tasksStolen++;
            victim.tasksStolen++;
            return task;
        }
        return null;
    }

    _dispatchFromLocalQueue(workerInfo) {
        const localQ = workerInfo.localQueue;
        if (localQ.length > 0 && !workerInfo.busy && workerInfo.ready) {
            const task = localQ.pop();
            const idx = this._idleWorkers.indexOf(workerInfo);
            if (idx >= 0) this._idleWorkers.splice(idx, 1);
            workerInfo.busy = true;
            workerInfo.worker.postMessage(task.message);
            return true;
        }
        return false;
    }

    _processQueue() {
        while (true) {
            if (this._idleWorkers.length === 0) break;
            let task = this._globalQueue.shift();
            if (!task) {
                task = this._trySteal();
            }
            if (!task) break;
            const workerInfo = this._idleWorkers.shift();
            if (!workerInfo) {
                this._globalQueue.unshift(task);
                break;
            }
            workerInfo.busy = true;
            workerInfo.worker.postMessage(task.message);
        }
        for (const w of this._idleWorkers) {
            if (w.localQueue.length > 0 && !w.busy && w.ready) {
                this._dispatchFromLocalQueue(w);
            }
        }
    }

    submit(code, options = {}) {
        this._ensureWorkers();
        const taskId = ++this._taskId;
        this._stats.tasksSubmitted++;
        const message = {
            taskId,
            type: options.async ? 'executeAsync' : 'execute',
            code
        };
        const task = { message };
        return new Promise((resolve, reject) => {
            this._pendingTasks.set(taskId, { resolve, reject, workerId: -1 });
            if (this._workStealing) {
                const target = this._findLeastLoadedWorker();
                if (target && target.localQueue.length === 0 && !target.busy && target.ready) {
                    const idx = this._idleWorkers.indexOf(target);
                    if (idx >= 0) {
                        this._idleWorkers.splice(idx, 1);
                        target.busy = true;
                        target.worker.postMessage(message);
                        return;
                    }
                }
                if (target) {
                    target.localQueue.push(task);
                    this._processQueue();
                    return;
                }
            }
            this._globalQueue.push(task);
            this._processQueue();
        });
    }

    submitEval(code) {
        this._ensureWorkers();
        const taskId = ++this._taskId;
        this._stats.tasksSubmitted++;
        const message = {
            taskId,
            type: 'eval',
            code
        };
        const task = { message };
        return new Promise((resolve, reject) => {
            this._pendingTasks.set(taskId, { resolve, reject, workerId: -1 });
            this._globalQueue.push(task);
            this._processQueue();
        });
    }

    async map(arr, fnCode, options = {}) {
        this._ensureWorkers();
        const chunkSize = options.chunkSize || Math.ceil(arr.length / this._maxWorkers);
        const promises = [];
        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize);
            const code = `
result = (function() {
    const items = ${JSON.stringify(chunk)};
    const results = [];
    for (let i = 0; i < items.length; i++) {
        ${fnCode}
    }
    return results;
})()
`;
            promises.push(this.submit(code, options));
        }
        const results = await Promise.all(promises);
        const flat = [];
        for (const r of results) {
            if (r.success && r.data) {
                flat.push(...r.data);
            }
        }
        return flat;
    }

    getWorkerStats() {
        return this._workers.map(w => ({
            id: w.id,
            ready: w.ready,
            busy: w.busy,
            localQueueSize: w.localQueue.length,
            tasksCompleted: w.tasksCompleted,
            tasksStolen: w.tasksStolen
        }));
    }

    getStats() {
        return {
            ...this._stats,
            globalQueueSize: this._globalQueue.length,
            totalLocalQueueSize: Array.from(this._localQueues.values()).reduce((sum, q) => sum + q.length, 0),
            stealRate: this._stats.stealAttempts > 0
                ? (this._stats.tasksStolen / this._stats.stealAttempts).toFixed(3)
                : '0'
        };
    }

    getStatus() {
        return {
            totalWorkers: this._workers.length,
            idleWorkers: this._idleWorkers.length,
            busyWorkers: this._workers.filter(w => w.busy).length,
            pendingTasks: this._pendingTasks.size,
            queuedTasks: this._globalQueue.length + Array.from(this._localQueues.values()).reduce((sum, q) => sum + q.length, 0),
            workStealing: this._workStealing
        };
    }

    async shutdown() {
        this._shuttingDown = true;
        for (const workerInfo of this._workers) {
            await workerInfo.worker.terminate();
        }
        this._workers.length = 0;
        this._idleWorkers.length = 0;
        this._globalQueue.length = 0;
        this._localQueues.clear();
        this._initialized = false;
    }
}

let _globalPool = null;

function getWorkerPool(options) {
    if (!_globalPool) {
        _globalPool = new WorkerPool(options);
    }
    return _globalPool;
}

module.exports = { WorkerPool, getWorkerPool, MAX_WORKERS, WorkStealingDeque };
