/**
 * SeedLang 异步编程支持
 * 提供Promise、async/await和并发控制
 */

class AsyncRuntime {
    constructor() {
        this.promises = new Map();
        this.promiseId = 0;
        this.eventLoop = new EventLoop();
        this.concurrencyLimit = 10;
        this.activeTasks = 0;
    }
    
    createPromise(executor) {
        const id = ++this.promiseId;
        const promise = new Promise((resolve, reject) => {
            executor(resolve, reject);
        });
        
        this.promises.set(id, promise);
        return { id, promise };
    }
    
    async awaitPromise(promise) {
        try {
            const result = await promise;
            return { success: true, value: result };
        } catch (error) {
            return { success: false, error };
        }
    }
    
    async all(promises) {
        return Promise.all(promises);
    }
    
    async race(promises) {
        return Promise.race(promises);
    }
    
    async allSettled(promises) {
        return Promise.allSettled(promises);
    }
    
    async any(promises) {
        return Promise.any(promises);
    }
    
    resolve(value) {
        return Promise.resolve(value);
    }
    
    reject(reason) {
        return Promise.reject(reason);
    }
    
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async timeout(promise, ms) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('操作超时')), ms);
        });
        return Promise.race([promise, timeoutPromise]);
    }
    
    async retry(fn, maxRetries = 3, delay = 1000) {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    await this.delay(delay);
                }
            }
        }
        
        throw lastError;
    }
    
    async withConcurrencyLimit(tasks, limit = this.concurrencyLimit) {
        const results = [];
        const executing = new Set();
        
        for (const task of tasks) {
            const promise = task();
            executing.add(promise);
            
            promise.then(result => {
                results.push(result);
                executing.delete(promise);
            });
            
            if (executing.size >= limit) {
                await Promise.race(executing);
            }
        }
        
        await Promise.all(executing);
        return results;
    }
    
    getStats() {
        return {
            totalPromises: this.promises.size,
            activeTasks: this.activeTasks,
            concurrencyLimit: this.concurrencyLimit
        };
    }
}

class EventLoop {
    constructor() {
        this.microtasks = [];
        this.macrotasks = [];
        this.running = false;
    }
    
    queueMicrotask(task) {
        this.microtasks.push(task);
        this.run();
    }
    
    queueMacrotask(task) {
        this.macrotasks.push(task);
        this.run();
    }
    
    async run() {
        if (this.running) return;
        this.running = true;
        
        while (this.microtasks.length > 0 || this.macrotasks.length > 0) {
            while (this.microtasks.length > 0) {
                const task = this.microtasks.shift();
                await task();
            }
            
            if (this.macrotasks.length > 0) {
                const task = this.macrotasks.shift();
                await task();
            }
        }
        
        this.running = false;
    }
    
    clear() {
        this.microtasks = [];
        this.macrotasks = [];
    }
}

class AsyncIterator {
    constructor(generator) {
        this.generator = generator;
    }
    
    async next() {
        const result = await this.generator.next();
        return {
            value: result.value,
            done: result.done
        };
    }
    
    async return(value) {
        if (this.generator.return) {
            return await this.generator.return(value);
        }
        return { value, done: true };
    }
    
    async throw(error) {
        if (this.generator.throw) {
            return await this.generator.throw(error);
        }
        throw error;
    }
    
    [Symbol.asyncIterator]() {
        return this;
    }
}

class AsyncQueue {
    constructor() {
        this.items = [];
        this.waiting = [];
        this.closed = false;
    }
    
    async enqueue(item) {
        if (this.closed) {
            throw new Error('队列已关闭');
        }
        
        if (this.waiting.length > 0) {
            const resolve = this.waiting.shift();
            resolve({ value: item, done: false });
        } else {
            this.items.push(item);
        }
    }
    
    async dequeue() {
        if (this.items.length > 0) {
            return { value: this.items.shift(), done: false };
        }
        
        if (this.closed) {
            return { value: undefined, done: true };
        }
        
        return new Promise(resolve => {
            this.waiting.push(resolve);
        });
    }
    
    close() {
        this.closed = true;
        
        for (const resolve of this.waiting) {
            resolve({ value: undefined, done: true });
        }
        this.waiting = [];
    }
    
    get length() {
        return this.items.length;
    }
    
    get isClosed() {
        return this.closed;
    }
}

class AsyncLock {
    constructor() {
        this.locked = false;
        this.queue = [];
    }
    
    async acquire() {
        if (!this.locked) {
            this.locked = true;
            return;
        }
        
        await new Promise(resolve => {
            this.queue.push(resolve);
        });
    }
    
    release() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        } else {
            this.locked = false;
        }
    }
    
    async withLock(fn) {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

class AsyncSemaphore {
    constructor(count) {
        this.count = count;
        this.waiting = [];
    }
    
    async acquire() {
        if (this.count > 0) {
            this.count--;
            return;
        }
        
        await new Promise(resolve => {
            this.waiting.push(resolve);
        });
    }
    
    release() {
        this.count++;
        
        if (this.waiting.length > 0) {
            const next = this.waiting.shift();
            next();
        }
    }
    
    async withSemaphore(fn) {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}

class AsyncChannel {
    constructor(bufferSize = 0) {
        this.buffer = [];
        this.bufferSize = bufferSize;
        this.sendWaiters = [];
        this.recvWaiters = [];
        this.closed = false;
    }
    
    async send(value) {
        if (this.closed) {
            throw new Error('通道已关闭');
        }
        
        if (this.recvWaiters.length > 0) {
            const resolve = this.recvWaiters.shift();
            resolve({ value, done: false });
            return;
        }
        
        if (this.buffer.length < this.bufferSize) {
            this.buffer.push(value);
            return;
        }
        
        await new Promise(resolve => {
            this.sendWaiters.push({ value, resolve });
        });
    }
    
    async recv() {
        if (this.buffer.length > 0) {
            return { value: this.buffer.shift(), done: false };
        }
        
        if (this.sendWaiters.length > 0) {
            const { value, resolve } = this.sendWaiters.shift();
            resolve();
            return { value, done: false };
        }
        
        if (this.closed) {
            return { value: undefined, done: true };
        }
        
        return new Promise(resolve => {
            this.recvWaiters.push(resolve);
        });
    }
    
    close() {
        this.closed = true;
        
        for (const resolve of this.recvWaiters) {
            resolve({ value: undefined, done: true });
        }
        this.recvWaiters = [];
    }
    
    [Symbol.asyncIterator]() {
        return {
            channel: this,
            async next() {
                return await this.channel.recv();
            }
        };
    }
}

module.exports = {
    AsyncRuntime,
    EventLoop,
    AsyncIterator,
    AsyncQueue,
    AsyncLock,
    AsyncSemaphore,
    AsyncChannel
};
