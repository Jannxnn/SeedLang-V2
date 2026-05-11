/**
 * SeedLang 多级内联缓存 (Megamorphic Inline Cache)
 * 实现 Monomorphic -> Polymorphic -> Megamorphic 三级缓存
 */

const InlineCacheState = {
    UNINITIALIZED: 'uninitialized',
    MONOMORPHIC: 'monomorphic',
    POLYMORPHIC: 'polymorphic',
    MEGAMORPHIC: 'megamorphic'
};

class InlineCacheEntry {
    constructor(shape, handler, result = null) {
        this.shape = shape;
        this.handler = handler;
        this.result = result;
        this.hitCount = 0;
        this.lastAccess = Date.now();
    }

    recordHit() {
        this.hitCount++;
        this.lastAccess = Date.now();
    }
}

class MonomorphicCache {
    constructor() {
        this.entry = null;
        this.hitCount = 0;
        this.missCount = 0;
    }

    probe(shape) {
        if (this.entry && this.entry.shape === shape) {
            this.entry.recordHit();
            this.hitCount++;
            return { hit: true, handler: this.entry.handler, result: this.entry.result };
        }
        this.missCount++;
        return { hit: false };
    }

    update(shape, handler, result) {
        this.entry = new InlineCacheEntry(shape, handler, result);
    }

    reset() {
        this.entry = null;
        this.hitCount = 0;
        this.missCount = 0;
    }

    getStats() {
        return {
            state: InlineCacheState.MONOMORPHIC,
            hitRate: this.hitCount / (this.hitCount + this.missCount) || 0,
            hitCount: this.hitCount,
            missCount: this.missCount
        };
    }
}

class PolymorphicCache {
    constructor(maxSize = 4) {
        this.maxSize = maxSize;
        this.entries = [];
        this.hitCount = 0;
        this.missCount = 0;
    }

    probe(shape) {
        for (const entry of this.entries) {
            if (entry.shape === shape) {
                entry.recordHit();
                this.hitCount++;
                return { hit: true, handler: entry.handler, result: entry.result };
            }
        }
        this.missCount++;
        return { hit: false };
    }

    update(shape, handler, result) {
        const existing = this.entries.find(e => e.shape === shape);
        if (existing) {
            existing.handler = handler;
            existing.result = result;
            return true;
        }

        if (this.entries.length >= this.maxSize) {
            this.entries.sort((a, b) => b.hitCount - a.hitCount);
            this.entries.pop();
        }

        this.entries.push(new InlineCacheEntry(shape, handler, result));
        return true;
    }

    isFull() {
        return this.entries.length >= this.maxSize;
    }

    reset() {
        this.entries = [];
        this.hitCount = 0;
        this.missCount = 0;
    }

    getStats() {
        return {
            state: InlineCacheState.POLYMORPHIC,
            size: this.entries.length,
            maxSize: this.maxSize,
            hitRate: this.hitCount / (this.hitCount + this.missCount) || 0,
            hitCount: this.hitCount,
            missCount: this.missCount
        };
    }
}

class MegamorphicCache {
    constructor(bucketCount = 64) {
        this.bucketCount = bucketCount;
        this.buckets = new Array(bucketCount).fill(null).map(() => []);
        this.hitCount = 0;
        this.missCount = 0;
        this.shapeMap = new Map();
    }

    hash(shape) {
        let hash = 0;
        const str = typeof shape === 'string' ? shape : JSON.stringify(shape);
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash) % this.bucketCount;
    }

    probe(shape) {
        const hash = this.hash(shape);
        const bucket = this.buckets[hash];

        for (const entry of bucket) {
            if (entry.shape === shape) {
                entry.recordHit();
                this.hitCount++;
                return { hit: true, handler: entry.handler, result: entry.result };
            }
        }

        this.missCount++;
        return { hit: false };
    }

    update(shape, handler, result) {
        const hash = this.hash(shape);
        const bucket = this.buckets[hash];

        const existing = bucket.find(e => e.shape === shape);
        if (existing) {
            existing.handler = handler;
            existing.result = result;
            return true;
        }

        const entry = new InlineCacheEntry(shape, handler, result);
        bucket.push(entry);
        this.shapeMap.set(shape, entry);

        return true;
    }

    reset() {
        this.buckets = new Array(this.bucketCount).fill(null).map(() => []);
        this.shapeMap.clear();
        this.hitCount = 0;
        this.missCount = 0;
    }

    getStats() {
        let totalEntries = 0;
        for (const bucket of this.buckets) {
            totalEntries += bucket.length;
        }

        return {
            state: InlineCacheState.MEGAMORPHIC,
            bucketCount: this.bucketCount,
            totalEntries,
            hitRate: this.hitCount / (this.hitCount + this.missCount) || 0,
            hitCount: this.hitCount,
            missCount: this.missCount
        };
    }
}

class MegamorphicInlineCache {
    constructor(options = {}) {
        this.polyCacheSize = options.polyCacheSize || 4;
        this.megaCacheBuckets = options.megaCacheBuckets || 64;
        this.transitionThreshold = options.transitionThreshold || 100;

        this.caches = new Map();
        this.globalStats = {
            totalProbes: 0,
            totalHits: 0,
            totalMisses: 0,
            stateTransitions: 0
        };
    }

    getCache(siteId) {
        if (!this.caches.has(siteId)) {
            this.caches.set(siteId, this.createCache(InlineCacheState.UNINITIALIZED));
        }
        return this.caches.get(siteId);
    }

    createCache(state) {
        switch (state) {
            case InlineCacheState.MONOMORPHIC:
            case InlineCacheState.UNINITIALIZED:
                return { state, cache: new MonomorphicCache() };
            case InlineCacheState.POLYMORPHIC:
                return { state, cache: new PolymorphicCache(this.polyCacheSize) };
            case InlineCacheState.MEGAMORPHIC:
                return { state, cache: new MegamorphicCache(this.megaCacheBuckets) };
            default:
                return { state: InlineCacheState.UNINITIALIZED, cache: new MonomorphicCache() };
        }
    }

    probe(siteId, shape) {
        this.globalStats.totalProbes++;

        const cacheEntry = this.getCache(siteId);
        const { state, cache } = cacheEntry;

        const result = cache.probe(shape);

        if (result.hit) {
            this.globalStats.totalHits++;
            return result;
        }

        this.globalStats.totalMisses++;

        if (state === InlineCacheState.UNINITIALIZED) {
            return { hit: false, needsUpdate: true };
        }

        if (state === InlineCacheState.MONOMORPHIC) {
            this.transition(siteId, InlineCacheState.POLYMORPHIC);
        } else if (state === InlineCacheState.POLYMORPHIC && cache.isFull()) {
            const stats = cache.getStats();
            if (stats.missCount > this.transitionThreshold) {
                this.transition(siteId, InlineCacheState.MEGAMORPHIC);
            }
        }

        return { hit: false, needsUpdate: true };
    }

    update(siteId, shape, handler, result) {
        const cacheEntry = this.getCache(siteId);
        const { state, cache } = cacheEntry;

        if (state === InlineCacheState.UNINITIALIZED) {
            this.transition(siteId, InlineCacheState.MONOMORPHIC);
            return this.update(siteId, shape, handler, result);
        }

        if (state === InlineCacheState.MONOMORPHIC) {
            if (cache.entry && cache.entry.shape !== shape) {
                this.transition(siteId, InlineCacheState.POLYMORPHIC);
                return this.update(siteId, shape, handler, result);
            }
        }

        cache.update(shape, handler, result);
    }

    transition(siteId, newState) {
        const oldEntry = this.caches.get(siteId);
        const newEntry = this.createCache(newState);

        if (oldEntry && oldEntry.cache) {
            const oldCache = oldEntry.cache;
            if (oldCache.entry) {
                newEntry.cache.update(oldCache.entry.shape, oldCache.entry.handler, oldCache.entry.result);
            } else if (oldCache.entries) {
                for (const entry of oldCache.entries) {
                    newEntry.cache.update(entry.shape, entry.handler, entry.result);
                }
            }
        }

        this.caches.set(siteId, newEntry);
        this.globalStats.stateTransitions++;
    }

    getSiteStats(siteId) {
        const cacheEntry = this.caches.get(siteId);
        if (!cacheEntry) return null;

        return cacheEntry.cache.getStats();
    }

    getGlobalStats() {
        const stateCounts = {
            uninitialized: 0,
            monomorphic: 0,
            polymorphic: 0,
            megamorphic: 0
        };

        for (const [, entry] of this.caches) {
            stateCounts[entry.state]++;
        }

        return {
            ...this.globalStats,
            hitRate: this.globalStats.totalHits / this.globalStats.totalProbes || 0,
            stateCounts,
            totalSites: this.caches.size
        };
    }

    reset() {
        this.caches.clear();
        this.globalStats = {
            totalProbes: 0,
            totalHits: 0,
            totalMisses: 0,
            stateTransitions: 0
        };
    }
}

class PropertyAccessCache extends MegamorphicInlineCache {
    constructor(options = {}) {
        super(options);
        this.propertyHandlers = new Map();
    }

    getProperty(obj, prop) {
        const shape = this.getObjectShape(obj);
        const siteId = `prop_${prop}`;

        const result = this.probe(siteId, shape);

        if (result.hit) {
            return result.result !== undefined ? result.result : obj[prop];
        }

        const value = obj[prop];
        this.update(siteId, shape, null, value);

        return value;
    }

    setProperty(obj, prop, value) {
        const shape = this.getObjectShape(obj);
        const siteId = `set_${prop}`;

        obj[prop] = value;
        this.update(siteId, shape, null, value);

        return value;
    }

    getObjectShape(obj) {
        if (obj === null || obj === undefined) {
            return 'null';
        }

        if (typeof obj !== 'object') {
            return typeof obj;
        }

        if (obj._shape) {
            return obj._shape;
        }

        const keys = Object.keys(obj).sort();
        const shape = `obj_${keys.join('_')}`;
        obj._shape = shape;

        return shape;
    }
}

class CallSiteCache extends MegamorphicInlineCache {
    constructor(options = {}) {
        super(options);
        this.callTargets = new Map();
    }

    call(fn, thisArg, args) {
        const shape = this.getFunctionShape(fn);
        const siteId = `call_${fn.name || 'anonymous'}`;

        const result = this.probe(siteId, shape);

        if (result.hit && result.handler) {
            return result.handler.apply(thisArg, args);
        }

        const handler = fn.bind(thisArg);
        this.update(siteId, shape, handler, null);

        return fn.apply(thisArg, args);
    }

    getFunctionShape(fn) {
        if (fn._shape) {
            return fn._shape;
        }

        const shape = `fn_${fn.length}_${fn.name || 'anonymous'}`;
        fn._shape = shape;

        return shape;
    }
}

class InlineCacheManager {
    constructor(options = {}) {
        this.propertyCache = new PropertyAccessCache(options);
        this.callSiteCache = new CallSiteCache(options);
        this.methodCache = new MegamorphicInlineCache(options);
        
        this.enabled = true;
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    getProperty(obj, prop) {
        if (!this.enabled) return obj[prop];
        return this.propertyCache.getProperty(obj, prop);
    }

    setProperty(obj, prop, value) {
        if (!this.enabled) {
            obj[prop] = value;
            return value;
        }
        return this.propertyCache.setProperty(obj, prop, value);
    }

    call(fn, thisArg, args) {
        if (!this.enabled) return fn.apply(thisArg, args);
        return this.callSiteCache.call(fn, thisArg, args);
    }

    getStats() {
        return {
            enabled: this.enabled,
            property: this.propertyCache.getGlobalStats(),
            callSite: this.callSiteCache.getGlobalStats(),
            method: this.methodCache.getGlobalStats()
        };
    }

    reset() {
        this.propertyCache.reset();
        this.callSiteCache.reset();
        this.methodCache.reset();
    }
}

module.exports = {
    InlineCacheState,
    MonomorphicCache,
    PolymorphicCache,
    MegamorphicCache,
    MegamorphicInlineCache,
    PropertyAccessCache,
    CallSiteCache,
    InlineCacheManager
};
