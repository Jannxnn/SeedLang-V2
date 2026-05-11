'use strict';

const { resumeCoroutine, createCoroutineFromClosure, createCoroutineFromDef, isFiberClosure } = require('../../../dist/core/coroutine.js');

const SCHEDULER_STATE = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused'
};

class FiberScheduler {
    constructor(vm) {
        this.vm = vm;
        this._readyQueue = [];
        this._sleepQueue = [];
        this._waitQueue = new Map();
        this._state = SCHEDULER_STATE.IDLE;
        this._fiberId = 0;
        this._fibers = new Map();
        this._maxTicksPerSlice = 1000;
        this._currentFiber = null;
        this._results = new Map();
        this._errorHandler = null;
        this._preemptive = true;
        this._timeSliceSize = 1024;
        this._priorityQueues = new Map();
        this._hasMixedPriorities = false;
    }

    spawn(fn, args = [], options = {}) {
        if (!fn) return null;
        let coro;
        if (fn._type === 'coroutine_def' || fn.def?._type === 'coroutine_def' || fn.fiber) {
            const coroDef = fn.def || fn;
            coro = createCoroutineFromDef(coroDef, args);
        } else if (fn._type === 'closure' && isFiberClosure(fn)) {
            coro = createCoroutineFromClosure(fn, args);
        } else if (fn._type === 'closure') {
            coro = createCoroutineFromClosure(fn, args);
            coro.fiber = true;
        } else if (fn?._type === 'coroutine') {
            coro = fn;
        } else {
            return null;
        }
        const id = ++this._fiberId;
        coro._schedulerId = id;
        coro._priority = options.priority || 0;
        coro._name = options.name || `fiber_${id}`;
        coro._createdAt = Date.now();
        coro._ticks = 0;
        this._fibers.set(id, coro);
        this._readyQueue.push(coro);
        if (coro._priority !== 0) this._hasMixedPriorities = true;
        return coro;
    }

    run() {
        if (this._state === SCHEDULER_STATE.RUNNING) return;
        this._state = SCHEDULER_STATE.RUNNING;
        const result = this._runLoop();
        this._state = SCHEDULER_STATE.IDLE;
        return result;
    }

    async runAsync() {
        if (this._state === SCHEDULER_STATE.RUNNING) return;
        this._state = SCHEDULER_STATE.RUNNING;
        try {
            const result = await this._runLoopAsync();
            return result;
        } finally {
            this._state = SCHEDULER_STATE.IDLE;
        }
    }

    _runLoop() {
        let iterations = 0;
        const maxIterations = 100000;
        const vm = this.vm;
        const preemptive = this._preemptive;
        const timeSliceSize = this._timeSliceSize;
        const sleepQueue = this._sleepQueue;
        const readyQueue = this._readyQueue;

        while (readyQueue.length > 0 && iterations < maxIterations) {
            if (sleepQueue.length > 0) this._checkSleepQueue();
            if (readyQueue.length === 0) break;

            const coro = this._dequeueNext();
            if (coro.state === 'done') {
                this._fibers.delete(coro._schedulerId);
                continue;
            }
            this._currentFiber = coro;
            coro.state = 'running';
            coro._ticks++;

            if (preemptive) {
                vm._schedulerPreempt = true;
                vm._timeSliceBudget = timeSliceSize;
                vm._timeSliceSize = timeSliceSize;
            }

            const result = resumeCoroutine(vm, coro, undefined, undefined);
            vm._schedulerPreempt = false;
            this._currentFiber = null;

            if (result && result._coroError) {
                coro.state = 'done';
                this._results.set(coro._schedulerId, { error: result._coroError });
                this._fibers.delete(coro._schedulerId);
            } else if (result && result._coroPending) {
                const pendingPromise = result._coroPending;
                const coroObj = result.coro;
                coroObj.state = 'suspended';
                this._waitQueue.set(coroObj._schedulerId, { coro: coroObj, promise: pendingPromise });
                pendingPromise.then(resolvedValue => {
                    coroObj.stack.push(resolvedValue);
                    coroObj._pendingPromise = null;
                    this._waitQueue.delete(coroObj._schedulerId);
                    readyQueue.push(coroObj);
                }).catch(() => {
                    coroObj.state = 'done';
                    this._waitQueue.delete(coroObj._schedulerId);
                });
            } else if (coro.state === 'suspended') {
                readyQueue.push(coro);
            } else if (coro.state === 'done') {
                this._results.set(coro._schedulerId, { value: result });
                this._fibers.delete(coro._schedulerId);
            }
            iterations++;
        }
        return this._collectResults();
    }

    async _runLoopAsync() {
        let iterations = 0;
        const maxIterations = 100000;
        while ((this._readyQueue.length > 0 || this._sleepQueue.length > 0 || this._waitQueue.size > 0) && iterations < maxIterations) {
            this._checkSleepQueue();
            this._checkWaitQueue();
            if (this._readyQueue.length === 0) {
                if (this._sleepQueue.length > 0 || this._waitQueue.size > 0) {
                    await new Promise(r => setTimeout(r, 1));
                    continue;
                }
                break;
            }
            const coro = this._readyQueue.shift();
            if (coro.state === 'done') {
                this._fibers.delete(coro._schedulerId);
                continue;
            }
            this._currentFiber = coro;
            coro.state = 'running';
            coro._ticks++;
            const result = resumeCoroutine(this.vm, coro, undefined, undefined);
            this._currentFiber = null;
            if (result && result._coroError) {
                coro.state = 'done';
                this._results.set(coro._schedulerId, { error: result._coroError });
                this._fibers.delete(coro._schedulerId);
            } else if (result && result._coroPending) {
                const pendingPromise = result._coroPending;
                const coroObj = result.coro;
                coroObj.state = 'suspended';
                this._waitQueue.set(coroObj._schedulerId, { coro: coroObj, promise: pendingPromise });
                pendingPromise.then(resolvedValue => {
                    coroObj.stack.push(resolvedValue);
                    coroObj._pendingPromise = null;
                    this._waitQueue.delete(coroObj._schedulerId);
                    this._readyQueue.push(coroObj);
                }).catch(() => {
                    coroObj.state = 'done';
                    this._waitQueue.delete(coroObj._schedulerId);
                });
            } else if (coro.state === 'done') {
                this._results.set(coro._schedulerId, { value: result });
                this._fibers.delete(coro._schedulerId);
            }
            iterations++;
        }
        return this._collectResults();
    }

    sleep(coro, ms) {
        const wakeTime = Date.now() + ms;
        this._sleepQueue.push({ coro, wakeTime });
        coro.state = 'suspended';
    }

    yield(coro, value) {
        coro.state = 'suspended';
        this._readyQueue.push(coro);
        return value;
    }

    _checkSleepQueue() {
        if (this._sleepQueue.length === 0) return;
        const now = Date.now();
        let writeIdx = 0;
        for (let i = 0; i < this._sleepQueue.length; i++) {
            const entry = this._sleepQueue[i];
            if (now >= entry.wakeTime) {
                this._readyQueue.push(entry.coro);
            } else {
                this._sleepQueue[writeIdx++] = entry;
            }
        }
        this._sleepQueue.length = writeIdx;
    }

    _checkWaitQueue() {
        for (const [id, entry] of this._waitQueue) {
            if (entry.coro.state === 'done') {
                this._waitQueue.delete(id);
            }
        }
    }

    _collectResults() {
        const results = {};
        for (const [id, r] of this._results) {
            results[id] = r;
        }
        return results;
    }

    _dequeueNext() {
        const q = this._readyQueue;
        if (q.length === 0) return null;
        if (!this._hasMixedPriorities) {
            return q.shift();
        }
        let bestIdx = 0;
        let bestPriority = q[0]._priority || 0;
        for (let i = 1; i < q.length; i++) {
            const p = q[i]._priority || 0;
            if (p > bestPriority) {
                bestPriority = p;
                bestIdx = i;
            }
        }
        return q.splice(bestIdx, 1)[0];
    }

    _enqueueByPriority(coro) {
        this._readyQueue.push(coro);
        if (coro._priority !== 0) this._hasMixedPriorities = true;
    }

    getStatus() {
        return {
            state: this._state,
            readyCount: this._readyQueue.length,
            sleepingCount: this._sleepQueue.length,
            waitingCount: this._waitQueue.size,
            totalSpawned: this._fiberId,
            activeFibers: this._fibers.size
        };
    }

    getFiberInfo(id) {
        const coro = this._fibers.get(id);
        if (!coro) return null;
        return {
            id: coro._schedulerId,
            name: coro._name,
            state: coro.state,
            priority: coro._priority,
            ticks: coro._ticks,
            age: Date.now() - coro._createdAt
        };
    }

    listFibers() {
        const list = [];
        for (const [id, coro] of this._fibers) {
            list.push({
                id, name: coro._name, state: coro.state,
                priority: coro._priority, ticks: coro._ticks
            });
        }
        return list;
    }

    kill(id) {
        const coro = this._fibers.get(id);
        if (coro) {
            coro.state = 'done';
            this._fibers.delete(id);
            this._results.set(id, { error: 'killed' });
            return true;
        }
        return false;
    }

    killAll() {
        for (const [id, coro] of this._fibers) {
            coro.state = 'done';
            this._results.set(id, { error: 'killed' });
        }
        this._fibers.clear();
        this._readyQueue.length = 0;
        this._sleepQueue.length = 0;
        this._waitQueue.clear();
    }
}

module.exports = { FiberScheduler, SCHEDULER_STATE };
