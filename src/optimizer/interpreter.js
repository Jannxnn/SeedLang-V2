/**
 * SeedLang 解释器性能优化器
 * 提供多种解释器优化技术
 */

class InterpreterOptimizer {
    constructor() {
        this.optimizations = {
            inlineCaching: true,
            hiddenClasses: true,
            propertyCaching: true,
            callSiteOptimization: true,
            lazyParsing: true
        };
        
        this.inlineCache = new Map();
        this.hiddenClasses = new Map();
        this.propertyCache = new Map();
        this.callSiteCache = new Map();
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            optimizations: 0
        };
    }
    
    enableOptimization(name, enabled) {
        if (name in this.optimizations) {
            this.optimizations[name] = enabled;
        }
    }
    
    inlineCacheGet(object, property) {
        if (!this.optimizations.inlineCaching) return null;
        
        const key = `${this.getObjectId(object)}:${property}`;
        const cached = this.inlineCache.get(key);
        
        if (cached) {
            this.stats.cacheHits++;
            return cached;
        }
        
        this.stats.cacheMisses++;
        return null;
    }
    
    inlineCacheSet(object, property, value) {
        if (!this.optimizations.inlineCaching) return;
        
        const key = `${this.getObjectId(object)}:${property}`;
        this.inlineCache.set(key, value);
        this.stats.optimizations++;
    }
    
    getHiddenClass(object) {
        if (!this.optimizations.hiddenClasses) return null;
        
        const keys = Object.keys(object).sort().join(',');
        
        if (!this.hiddenClasses.has(keys)) {
            this.hiddenClasses.set(keys, {
                id: this.hiddenClasses.size,
                properties: Object.keys(object).sort(),
                layout: this.createLayout(object)
            });
            this.stats.optimizations++;
        }
        
        return this.hiddenClasses.get(keys);
    }
    
    createLayout(object) {
        const layout = {};
        const keys = Object.keys(object).sort();
        keys.forEach((key, index) => {
            layout[key] = index;
        });
        return layout;
    }
    
    propertyCacheGet(object, property) {
        if (!this.optimizations.propertyCaching) return null;
        
        const hiddenClass = this.getHiddenClass(object);
        if (!hiddenClass) return null;
        
        const key = `${hiddenClass.id}:${property}`;
        const cached = this.propertyCache.get(key);
        
        if (cached !== undefined) {
            this.stats.cacheHits++;
            return cached;
        }
        
        this.stats.cacheMisses++;
        return null;
    }
    
    propertyCacheSet(object, property, offset) {
        if (!this.optimizations.propertyCaching) return;
        
        const hiddenClass = this.getHiddenClass(object);
        if (!hiddenClass) return;
        
        const key = `${hiddenClass.id}:${property}`;
        this.propertyCache.set(key, offset);
        this.stats.optimizations++;
    }
    
    callSiteOptimize(functionName, argTypes) {
        if (!this.optimizations.callSiteOptimization) return null;
        
        const key = `${functionName}:${argTypes.join(',')}`;
        const cached = this.callSiteCache.get(key);
        
        if (cached) {
            this.stats.cacheHits++;
            return cached;
        }
        
        this.stats.cacheMisses++;
        return null;
    }
    
    callSiteCacheSet(functionName, argTypes, compiled) {
        if (!this.optimizations.callSiteOptimization) return;
        
        const key = `${functionName}:${argTypes.join(',')}`;
        this.callSiteCache.set(key, compiled);
        this.stats.optimizations++;
    }
    
    getObjectId(object) {
        if (!object.__id__) {
            object.__id__ = `obj_${Date.now()}_${Math.random()}`;
        }
        return object.__id__;
    }
    
    getStats() {
        return {
            ...this.stats,
            hitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0,
            inlineCacheSize: this.inlineCache.size,
            hiddenClassCount: this.hiddenClasses.size,
            propertyCacheSize: this.propertyCache.size,
            callSiteCacheSize: this.callSiteCache.size
        };
    }
    
    reset() {
        this.inlineCache.clear();
        this.hiddenClasses.clear();
        this.propertyCache.clear();
        this.callSiteCache.clear();
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            optimizations: 0
        };
    }
}

class OptimizedInterpreter {
    constructor(interpreter) {
        this.interpreter = interpreter;
        this.optimizer = new InterpreterOptimizer();
        this.builtinCache = new Map();
    }
    
    evaluate(node) {
        if (!node) return null;
        
        switch (node.type) {
            case 'MemberExpression':
                return this.optimizedMemberAccess(node);
            case 'CallExpression':
                return this.optimizedCall(node);
            case 'BinaryExpression':
                return this.optimizedBinary(node);
            default:
                return this.interpreter.evaluate(node);
        }
    }
    
    optimizedMemberAccess(node) {
        const object = this.evaluate(node.object);
        const property = node.property.name || node.property.value;
        
        const cached = this.optimizer.inlineCacheGet(object, property);
        if (cached !== null) {
            return cached;
        }
        
        const value = object[property];
        this.optimizer.inlineCacheSet(object, property, value);
        
        return value;
    }
    
    optimizedCall(node) {
        const callee = this.evaluate(node.callee);
        const args = node.arguments.map(arg => this.evaluate(arg));
        const argTypes = args.map(arg => typeof arg);
        
        const cached = this.optimizer.callSiteOptimize(callee.name, argTypes);
        if (cached) {
            return cached(...args);
        }
        
        const result = callee(...args);
        
        this.optimizer.callSiteCacheSet(callee.name, argTypes, callee);
        
        return result;
    }
    
    optimizedBinary(node) {
        const left = this.evaluate(node.left);
        const right = this.evaluate(node.right);
        
        switch (node.operator) {
            case '+':
                return left + right;
            case '-':
                return left - right;
            case '*':
                return left * right;
            case '/':
                return left / right;
            case '%':
                return left % right;
            case '===':
                return left === right;
            case '!==':
                return left !== right;
            case '<':
                return left < right;
            case '<=':
                return left <= right;
            case '>':
                return left > right;
            case '>=':
                return left >= right;
            default:
                return this.interpreter.evaluate(node);
        }
    }
    
    cacheBuiltin(name, func) {
        this.builtinCache.set(name, func);
    }
    
    getCachedBuiltin(name) {
        return this.builtinCache.get(name);
    }
    
    getOptimizationStats() {
        return this.optimizer.getStats();
    }
}

class LazyParser {
    constructor(parser) {
        this.parser = parser;
        this.parsedNodes = new Map();
        this.enabled = true;
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    parse(code) {
        if (!this.enabled) {
            return this.parser.parse(code);
        }
        
        const hash = this.hash(code);
        
        if (this.parsedNodes.has(hash)) {
            return this.parsedNodes.get(hash);
        }
        
        const ast = this.parser.parse(code);
        this.parsedNodes.set(hash, ast);
        
        return ast;
    }
    
    hash(code) {
        let hash = 0;
        for (let i = 0; i < code.length; i++) {
            const char = code.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }
    
    clear() {
        this.parsedNodes.clear();
    }
}

module.exports = { 
    InterpreterOptimizer, 
    OptimizedInterpreter, 
    LazyParser 
};
