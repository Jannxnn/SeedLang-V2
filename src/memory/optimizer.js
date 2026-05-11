/**
 * SeedLang 内存优化器 v3.0
 * 提供分代GC、对象池、内存监控功能
 */

class GenerationalGC {
    constructor(options = {}) {
        this.youngGeneration = [];
        this.oldGeneration = [];
        this.youngGenMaxSize = options.youngGenMaxSize || 1000;
        this.oldGenMaxSize = options.oldGenMaxSize || 10000;
        this.promotionThreshold = options.promotionThreshold || 3;
        
        this.objectAges = new Map();
        this.objectRefs = new Map();
        this.roots = new Set();
        
        this.stats = {
            youngGCCount: 0,
            oldGCCount: 0,
            objectsPromoted: 0,
            objectsCollected: 0,
            totalMemoryFreed: 0
        };
    }
    
    allocate(obj) {
        const id = this.getObjectId(obj);
        this.youngGeneration.push({ id, obj, refs: [] });
        this.objectAges.set(id, 0);
        this.objectRefs.set(id, new Set());
        return obj;
    }
    
    getObjectId(obj) {
        if (obj && typeof obj === 'object') {
            if (!obj._gcId) {
                obj._gcId = `gc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            return obj._gcId;
        }
        return null;
    }
    
    addRoot(obj) {
        const id = this.getObjectId(obj);
        if (id) {
            this.roots.add(id);
        }
    }
    
    removeRoot(obj) {
        const id = this.getObjectId(obj);
        if (id) {
            this.roots.delete(id);
        }
    }
    
    addReference(from, to) {
        const fromId = this.getObjectId(from);
        const toId = this.getObjectId(to);
        if (fromId && toId) {
            if (!this.objectRefs.has(fromId)) {
                this.objectRefs.set(fromId, new Set());
            }
            this.objectRefs.get(fromId).add(toId);
        }
    }
    
    youngGC() {
        this.stats.youngGCCount++;
        
        const survivors = [];
        let collected = 0;
        
        const reachable = this.markReachable(this.youngGeneration);
        
        for (const entry of this.youngGeneration) {
            if (reachable.has(entry.id)) {
                const age = (this.objectAges.get(entry.id) || 0) + 1;
                this.objectAges.set(entry.id, age);
                
                if (age >= this.promotionThreshold) {
                    this.oldGeneration.push(entry);
                    this.stats.objectsPromoted++;
                } else {
                    survivors.push(entry);
                }
            } else {
                collected++;
                this.objectAges.delete(entry.id);
                this.objectRefs.delete(entry.id);
            }
        }
        
        this.youngGeneration = survivors;
        this.stats.objectsCollected += collected;
        this.stats.totalMemoryFreed += collected;
        
        return collected;
    }
    
    oldGC() {
        this.stats.oldGCCount++;
        
        const survivors = [];
        let collected = 0;
        
        const reachable = this.markReachable(this.oldGeneration);
        
        for (const entry of this.oldGeneration) {
            if (reachable.has(entry.id)) {
                survivors.push(entry);
            } else {
                collected++;
                this.objectAges.delete(entry.id);
                this.objectRefs.delete(entry.id);
            }
        }
        
        this.oldGeneration = survivors;
        this.stats.objectsCollected += collected;
        this.stats.totalMemoryFreed += collected;
        
        return collected;
    }
    
    markReachable(generation) {
        const reachable = new Set();
        const queue = [...this.roots];
        
        const genMap = new Map();
        for (const entry of generation) {
            genMap.set(entry.id, entry);
        }
        
        while (queue.length > 0) {
            const id = queue.shift();
            if (reachable.has(id)) continue;
            
            reachable.add(id);
            
            const refs = this.objectRefs.get(id);
            if (refs) {
                for (const refId of refs) {
                    if (!reachable.has(refId)) {
                        queue.push(refId);
                    }
                }
            }
        }
        
        return reachable;
    }
    
    fullGC() {
        const youngCollected = this.youngGC();
        const oldCollected = this.oldGC();
        return youngCollected + oldCollected;
    }
    
    checkGC() {
        if (this.youngGeneration.length >= this.youngGenMaxSize) {
            this.youngGC();
        }
        
        if (this.oldGeneration.length >= this.oldGenMaxSize) {
            this.oldGC();
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            youngGenSize: this.youngGeneration.length,
            oldGenSize: this.oldGeneration.length,
            totalSize: this.youngGeneration.length + this.oldGeneration.length,
            rootCount: this.roots.size
        };
    }
    
    reset() {
        this.youngGeneration = [];
        this.oldGeneration = [];
        this.objectAges.clear();
        this.objectRefs.clear();
        this.roots.clear();
        this.stats = {
            youngGCCount: 0,
            oldGCCount: 0,
            objectsPromoted: 0,
            objectsCollected: 0,
            totalMemoryFreed: 0
        };
    }
}

class MemoryOptimizer {
    constructor(options = {}) {
        this.objectPool = new Map();
        this.stringPool = new Map();
        this.arrayPool = new Map();
        this.functionPool = new Map();
        
        this.gcInstance = new GenerationalGC(options);
        
        this.gcThreshold = options.gcThreshold || 1000;
        this.objectCount = 0;
        this.enabled = true;
        
        this.maxPoolSizes = {
            object: options.maxObjectPoolSize || 100,
            string: options.maxStringPoolSize || 200,
            array: options.maxArrayPoolSize || 150,
            function: options.maxFunctionPoolSize || 50
        };
        
        this.stats = {
            pooledObjects: 0,
            reusedObjects: 0,
            gcCycles: 0,
            memorySaved: 0,
            poolHits: 0,
            poolMisses: 0
        };
        
        this.memoryMonitor = {
            startTime: Date.now(),
            peakMemory: 0,
            currentMemory: 0,
            allocations: 0,
            deallocations: 0
        };
        
        this.pressureThresholds = {
            low: options.lowPressureThreshold || 0.5,
            medium: options.mediumPressureThreshold || 0.7,
            high: options.highPressureThreshold || 0.85,
            critical: options.criticalPressureThreshold || 0.95
        };
        
        this.pressureCallbacks = {
            low: [],
            medium: [],
            high: [],
            critical: []
        };
        
        this.lastPressureLevel = 'none';
        this.pressureCheckInterval = options.pressureCheckInterval || 1000;
        this.autoGCOnHighPressure = options.autoGCOnHighPressure !== false;
    }
    
    onPressure(level, callback) {
        if (this.pressureCallbacks[level]) {
            this.pressureCallbacks[level].push(callback);
        }
    }
    
    offPressure(level, callback) {
        if (this.pressureCallbacks[level]) {
            const idx = this.pressureCallbacks[level].indexOf(callback);
            if (idx !== -1) {
                this.pressureCallbacks[level].splice(idx, 1);
            }
        }
    }
    
    checkMemoryPressure() {
        const usage = this.getMemoryUsage();
        const pressureRatio = usage.heapUsed / usage.heapTotal;
        
        let level = 'none';
        if (pressureRatio >= this.pressureThresholds.critical) {
            level = 'critical';
        } else if (pressureRatio >= this.pressureThresholds.high) {
            level = 'high';
        } else if (pressureRatio >= this.pressureThresholds.medium) {
            level = 'medium';
        } else if (pressureRatio >= this.pressureThresholds.low) {
            level = 'low';
        }
        
        if (level !== this.lastPressureLevel) {
            this.lastPressureLevel = level;
            this._triggerPressureCallbacks(level, {
                ratio: pressureRatio,
                usage,
                timestamp: Date.now()
            });
            
            if ((level === 'high' || level === 'critical') && this.autoGCOnHighPressure) {
                this.gc();
            }
        }
        
        return {
            level,
            ratio: pressureRatio,
            usage,
            thresholds: this.pressureThresholds
        };
    }
    
    _triggerPressureCallbacks(level, data) {
        const callbacks = this.pressureCallbacks[level] || [];
        for (const callback of callbacks) {
            try {
                callback(data);
            } catch (e) {
                console.error(`Memory pressure callback error: ${e.message}`);
            }
        }
    }
    
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external,
            rss: usage.rss,
            arrayBuffers: usage.arrayBuffers || 0,
            formatted: {
                heapUsed: this._formatBytes(usage.heapUsed),
                heapTotal: this._formatBytes(usage.heapTotal),
                external: this._formatBytes(usage.external),
                rss: this._formatBytes(usage.rss)
            }
        };
    }
    
    _formatBytes(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let unitIndex = 0;
        let value = bytes;
        
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        
        return `${value.toFixed(2)} ${units[unitIndex]}`;
    }
    
    setPressureThresholds(thresholds) {
        Object.assign(this.pressureThresholds, thresholds);
    }
    
    getPressureStatus() {
        const pressure = this.checkMemoryPressure();
        return {
            level: pressure.level,
            ratio: pressure.ratio,
            recommendation: this._getPressureRecommendation(pressure.level),
            stats: this.getStats(),
            gcStats: this.gcInstance.getStats()
        };
    }
    
    _getPressureRecommendation(level) {
        const recommendations = {
            none: '内存使用正常',
            low: '内存使用较低，运行良好',
            medium: '内存使用中等，建议关注内存分配',
            high: '内存使用较高，建议释放不必要的对象或增加内存限制',
            critical: '内存使用接近极限，立即释放内存或终止部分操作'
        };
        return recommendations[level] || '未知状态';
    }
    
    startMonitoring(interval = 5000) {
        if (this._monitorInterval) {
            clearInterval(this._monitorInterval);
        }
        
        this._monitorInterval = setInterval(() => {
            this.checkMemoryPressure();
            this.memoryMonitor.currentMemory = process.memoryUsage().heapUsed;
            if (this.memoryMonitor.currentMemory > this.memoryMonitor.peakMemory) {
                this.memoryMonitor.peakMemory = this.memoryMonitor.currentMemory;
            }
        }, interval);
        
        return this._monitorInterval;
    }
    
    stopMonitoring() {
        if (this._monitorInterval) {
            clearInterval(this._monitorInterval);
            this._monitorInterval = null;
        }
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    setGCThreshold(threshold) {
        this.gcThreshold = threshold;
    }
    
    poolObject(type, obj) {
        if (!this.enabled) return obj;
        
        const pool = this.getPool(type);
        const maxSize = this.maxPoolSizes[type] || 100;
        const key = this.getObjectKey(obj);
        
        if (!pool.has(key)) {
            pool.set(key, []);
        }
        
        const poolArray = pool.get(key);
        if (poolArray.length < maxSize) {
            poolArray.push(obj);
            this.stats.pooledObjects++;
        }
        
        return obj;
    }
    
    getPooledObject(type, key) {
        if (!this.enabled) return null;
        
        const pool = this.getPool(type);
        const objects = pool.get(key);
        
        if (objects && objects.length > 0) {
            this.stats.reusedObjects++;
            this.stats.poolHits++;
            return objects.pop();
        }
        
        this.stats.poolMisses++;
        return null;
    }
    
    getPool(type) {
        switch (type) {
            case 'object':
                return this.objectPool;
            case 'string':
                return this.stringPool;
            case 'array':
                return this.arrayPool;
            case 'function':
                return this.functionPool;
            default:
                return this.objectPool;
        }
    }
    
    getObjectKey(obj) {
        if (typeof obj === 'string') {
            return obj;
        }
        
        if (Array.isArray(obj)) {
            return `array_${obj.length}`;
        }
        
        if (typeof obj === 'object' && obj !== null) {
            if (obj._type === 'closure') {
                return `closure_${obj.name || 'anonymous'}`;
            }
            const keys = Object.keys(obj).filter(k => k !== '_gcId').sort().join(',');
            return `object_${keys}`;
        }
        
        return String(obj);
    }
    
    gc() {
        if (!this.enabled) return;
        
        this.stats.gcCycles++;
        
        const beforeSize = this.getTotalPoolSize();
        
        this.objectPool.forEach((objects, key) => {
            if (objects.length > this.maxPoolSizes.object) {
                const removed = objects.splice(this.maxPoolSizes.object);
                this.stats.memorySaved += removed.length;
            }
        });
        
        this.stringPool.forEach((objects, key) => {
            if (objects.length > this.maxPoolSizes.string) {
                const removed = objects.splice(this.maxPoolSizes.string);
                this.stats.memorySaved += removed.length;
            }
        });
        
        this.arrayPool.forEach((objects, key) => {
            if (objects.length > this.maxPoolSizes.array) {
                const removed = objects.splice(this.maxPoolSizes.array);
                this.stats.memorySaved += removed.length;
            }
        });
        
        this.functionPool.forEach((objects, key) => {
            if (objects.length > this.maxPoolSizes.function) {
                const removed = objects.splice(this.maxPoolSizes.function);
                this.stats.memorySaved += removed.length;
            }
        });
        
        const gcCollected = this.gcInstance.fullGC();
        
        const afterSize = this.getTotalPoolSize();
        
        console.log(`[GC] 清理完成: 池大小 ${beforeSize} -> ${afterSize}, GC回收 ${gcCollected} 对象`);
    }
    
    getTotalPoolSize() {
        let total = 0;
        
        this.objectPool.forEach(objects => total += objects.length);
        this.stringPool.forEach(objects => total += objects.length);
        this.arrayPool.forEach(objects => total += objects.length);
        this.functionPool.forEach(objects => total += objects.length);
        
        return total;
    }
    
    checkGC() {
        this.objectCount++;
        
        if (this.objectCount >= this.gcThreshold) {
            this.gc();
            this.objectCount = 0;
        } else {
            this.gcInstance.checkGC();
        }
    }
    
    monitorMemory() {
        const usage = process.memoryUsage();
        this.memoryMonitor.currentMemory = usage.heapUsed;
        this.memoryMonitor.peakMemory = Math.max(
            this.memoryMonitor.peakMemory,
            usage.heapUsed
        );
        
        return {
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external,
            rss: usage.rss,
            peakMemory: this.memoryMonitor.peakMemory,
            uptime: Date.now() - this.memoryMonitor.startTime
        };
    }
    
    getStats() {
        return {
            ...this.stats,
            poolSize: this.getTotalPoolSize(),
            objectPoolSize: Array.from(this.objectPool.values()).reduce((a, b) => a + b.length, 0),
            stringPoolSize: Array.from(this.stringPool.values()).reduce((a, b) => a + b.length, 0),
            arrayPoolSize: Array.from(this.arrayPool.values()).reduce((a, b) => a + b.length, 0),
            functionPoolSize: Array.from(this.functionPool.values()).reduce((a, b) => a + b.length, 0),
            gcStats: this.gcInstance.getStats(),
            poolHitRate: this.stats.poolHits / (this.stats.poolHits + this.stats.poolMisses) || 0
        };
    }
    
    reset() {
        this.objectPool.clear();
        this.stringPool.clear();
        this.arrayPool.clear();
        this.functionPool.clear();
        this.gcInstance.reset();
        this.objectCount = 0;
        this.stats = {
            pooledObjects: 0,
            reusedObjects: 0,
            gcCycles: 0,
            memorySaved: 0,
            poolHits: 0,
            poolMisses: 0
        };
    }
    
    optimizeValue(value) {
        if (!this.enabled) return value;
        
        this.checkGC();
        
        if (typeof value === 'string') {
            const pooled = this.getPooledObject('string', value);
            if (pooled) return pooled;
            return this.poolObject('string', value);
        }
        
        if (Array.isArray(value)) {
            const key = this.getObjectKey(value);
            const pooled = this.getPooledObject('array', key);
            if (pooled) return pooled;
            this.gcInstance.allocate(value);
            return this.poolObject('array', value);
        }
        
        if (typeof value === 'object' && value !== null) {
            if (value._type === 'closure') {
                const key = this.getObjectKey(value);
                const pooled = this.getPooledObject('function', key);
                if (pooled) return pooled;
                return this.poolObject('function', value);
            }
            
            const key = this.getObjectKey(value);
            const pooled = this.getPooledObject('object', key);
            if (pooled) return pooled;
            this.gcInstance.allocate(value);
            return this.poolObject('object', value);
        }
        
        return value;
    }
    
    optimizeArray(arr) {
        if (!this.enabled || !Array.isArray(arr)) return arr;
        
        return arr.map(item => this.optimizeValue(item));
    }
    
    optimizeObject(obj) {
        if (!this.enabled || typeof obj !== 'object' || obj === null) return obj;
        
        const optimized = {};
        for (const [key, value] of Object.entries(obj)) {
            optimized[key] = this.optimizeValue(value);
        }
        return this.optimizeValue(optimized);
    }
    
    createEfficientArray() {
        return new MemoryEfficientArray(this);
    }
    
    createEfficientObject() {
        return new MemoryEfficientObject(this);
    }
}

class MemoryEfficientArray {
    constructor(memoryOptimizer) {
        this.optimizer = memoryOptimizer;
        this.data = [];
        this._gcId = null;
    }
    
    push(item) {
        const optimized = this.optimizer.optimizeValue(item);
        this.data.push(optimized);
        this.optimizer.memoryMonitor.allocations++;
    }
    
    get(index) {
        return this.data[index];
    }
    
    set(index, value) {
        const optimized = this.optimizer.optimizeValue(value);
        this.data[index] = optimized;
    }
    
    pop() {
        const item = this.data.pop();
        this.optimizer.memoryMonitor.deallocations++;
        return item;
    }
    
    length() {
        return this.data.length;
    }
    
    clear() {
        this.data = [];
        this.optimizer.memoryMonitor.deallocations += this.data.length;
    }
    
    toArray() {
        return this.data;
    }
    
    forEach(fn) {
        this.data.forEach(fn);
    }
    
    map(fn) {
        return this.data.map(fn);
    }
    
    filter(fn) {
        return this.data.filter(fn);
    }
    
    reduce(fn, init) {
        return this.data.reduce(fn, init);
    }
}

class MemoryEfficientObject {
    constructor(memoryOptimizer) {
        this.optimizer = memoryOptimizer;
        this.data = new Map();
        this._gcId = null;
    }
    
    set(key, value) {
        const optimized = this.optimizer.optimizeValue(value);
        this.data.set(key, optimized);
        this.optimizer.memoryMonitor.allocations++;
    }
    
    get(key) {
        return this.data.get(key);
    }
    
    has(key) {
        return this.data.has(key);
    }
    
    delete(key) {
        const result = this.data.delete(key);
        if (result) {
            this.optimizer.memoryMonitor.deallocations++;
        }
        return result;
    }
    
    keys() {
        return Array.from(this.data.keys());
    }
    
    values() {
        return Array.from(this.data.values());
    }
    
    entries() {
        return Array.from(this.data.entries());
    }
    
    clear() {
        const size = this.data.size;
        this.data.clear();
        this.optimizer.memoryMonitor.deallocations += size;
    }
    
    size() {
        return this.data.size;
    }
    
    toObject() {
        const obj = {};
        this.data.forEach((value, key) => {
            obj[key] = value;
        });
        return obj;
    }
    
    forEach(fn) {
        this.data.forEach((value, key) => fn(value, key));
    }
}

module.exports = { 
    MemoryOptimizer, 
    MemoryEfficientArray, 
    MemoryEfficientObject,
    GenerationalGC
};
