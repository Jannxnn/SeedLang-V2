/**
 * SeedLang Node.js Native Addons支持
 * 提供调用C++原生模块的能力
 */

const path = require('path');
const fs = require('fs');

class NativeModule {
    constructor(name, modulePath) {
        this.name = name;
        this.modulePath = modulePath;
        this.handle = null;
        this.functions = new Map();
        this.classes = new Map();
        this.loaded = false;
    }
    
    load() {
        try {
            const absolutePath = path.resolve(this.modulePath);
            
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`模块文件不存在: ${absolutePath}`);
            }
            
            this.handle = require(absolutePath);
            this.loaded = true;
            
            this.inspectModule();
            
            return true;
        } catch (error) {
            console.error(`加载原生模块失败: ${this.name}`, error.message);
            this.loaded = false;
            return false;
        }
    }
    
    inspectModule() {
        if (!this.handle) return;
        
        for (const key of Object.keys(this.handle)) {
            const value = this.handle[key];
            
            if (typeof value === 'function') {
                this.functions.set(key, value);
            } else if (typeof value === 'object' && value !== null) {
                this.classes.set(key, value);
            }
        }
    }
    
    call(functionName, ...args) {
        if (!this.loaded) {
            throw new Error(`模块未加载: ${this.name}`);
        }
        
        const func = this.functions.get(functionName);
        if (!func) {
            throw new Error(`函数不存在: ${functionName}`);
        }
        
        return func(...args);
    }
    
    createInstance(className, ...args) {
        if (!this.loaded) {
            throw new Error(`模块未加载: ${this.name}`);
        }
        
        const classDef = this.classes.get(className);
        if (!classDef) {
            throw new Error(`类不存在: ${className}`);
        }
        
        return new classDef(...args);
    }
    
    callMethod(instance, methodName, ...args) {
        if (!this.loaded) {
            throw new Error(`模块未加载: ${this.name}`);
        }
        
        const method = instance[methodName];
        if (!method) {
            throw new Error(`方法不存在: ${methodName}`);
        }
        
        return method.call(instance, ...args);
    }
    
    hasFunction(functionName) {
        return this.functions.has(functionName);
    }
    
    hasClass(className) {
        return this.classes.has(className);
    }
    
    getFunctionNames() {
        return Array.from(this.functions.keys());
    }
    
    getClassNames() {
        return Array.from(this.classes.keys());
    }
    
    unload() {
        this.handle = null;
        this.functions.clear();
        this.classes.clear();
        this.loaded = false;
    }
}

class NativeModuleManager {
    constructor() {
        this.modules = new Map();
        this.searchPaths = [];
        this.typeConverters = new Map();
        
        this.initTypeConverters();
    }
    
    initTypeConverters() {
        this.typeConverters.set('number', {
            toNative: (value) => Number(value),
            fromNative: (value) => Number(value)
        });
        
        this.typeConverters.set('string', {
            toNative: (value) => String(value),
            fromNative: (value) => String(value)
        });
        
        this.typeConverters.set('boolean', {
            toNative: (value) => Boolean(value),
            fromNative: (value) => Boolean(value)
        });
        
        this.typeConverters.set('array', {
            toNative: (value) => Array.from(value),
            fromNative: (value) => Array.from(value)
        });
        
        this.typeConverters.set('object', {
            toNative: (value) => Object.assign({}, value),
            fromNative: (value) => Object.assign({}, value)
        });
        
        this.typeConverters.set('buffer', {
            toNative: (value) => Buffer.from(value),
            fromNative: (value) => Buffer.from(value)
        });
    }
    
    addSearchPath(searchPath) {
        this.searchPaths.push(path.resolve(searchPath));
    }
    
    registerModule(name, modulePath) {
        const module = new NativeModule(name, modulePath);
        this.modules.set(name, module);
        return module;
    }
    
    loadModule(name) {
        const module = this.modules.get(name);
        if (!module) {
            throw new Error(`模块未注册: ${name}`);
        }
        
        return module.load();
    }
    
    loadModuleFromPath(name, modulePath) {
        const module = new NativeModule(name, modulePath);
        this.modules.set(name, module);
        return module.load();
    }
    
    resolveModulePath(moduleName) {
        for (const searchPath of this.searchPaths) {
            const modulePath = path.join(searchPath, moduleName);
            
            const extensions = ['.node', '.so', '.dll', '.dylib'];
            for (const ext of extensions) {
                const fullPath = modulePath + ext;
                if (fs.existsSync(fullPath)) {
                    return fullPath;
                }
            }
        }
        
        return null;
    }
    
    call(moduleName, functionName, ...args) {
        const module = this.modules.get(moduleName);
        if (!module || !module.loaded) {
            throw new Error(`模块未加载: ${moduleName}`);
        }
        
        return module.call(functionName, ...args);
    }
    
    createInstance(moduleName, className, ...args) {
        const module = this.modules.get(moduleName);
        if (!module || !module.loaded) {
            throw new Error(`模块未加载: ${moduleName}`);
        }
        
        return module.createInstance(className, ...args);
    }
    
    callMethod(moduleName, instance, methodName, ...args) {
        const module = this.modules.get(moduleName);
        if (!module || !module.loaded) {
            throw new Error(`模块未加载: ${moduleName}`);
        }
        
        return module.callMethod(instance, methodName, ...args);
    }
    
    convertToNative(value, type) {
        const converter = this.typeConverters.get(type);
        return converter ? converter.toNative(value) : value;
    }
    
    convertFromNative(value, type) {
        const converter = this.typeConverters.get(type);
        return converter ? converter.fromNative(value) : value;
    }
    
    getModuleInfo(name) {
        const module = this.modules.get(name);
        if (!module) return null;
        
        return {
            name: module.name,
            path: module.modulePath,
            loaded: module.loaded,
            functions: module.getFunctionNames(),
            classes: module.getClassNames()
        };
    }
    
    getAllModules() {
        return Array.from(this.modules.keys());
    }
    
    unloadModule(name) {
        const module = this.modules.get(name);
        if (module) {
            module.unload();
        }
    }
    
    unloadAll() {
        for (const module of this.modules.values()) {
            module.unload();
        }
    }
    
    getStats() {
        const loaded = Array.from(this.modules.values()).filter(m => m.loaded).length;
        const total = this.modules.size;
        
        return {
            total,
            loaded,
            unloaded: total - loaded,
            searchPaths: this.searchPaths.length
        };
    }
}

class NativeBuffer {
    constructor(size) {
        this.buffer = Buffer.alloc(size);
        this.size = size;
    }
    
    static from(data) {
        const buf = new NativeBuffer(data.length);
        buf.buffer = Buffer.from(data);
        return buf;
    }
    
    static alloc(size) {
        return new NativeBuffer(size);
    }
    
    readInt8(offset) {
        return this.buffer.readInt8(offset);
    }
    
    writeInt8(value, offset) {
        this.buffer.writeInt8(value, offset);
    }
    
    readUInt8(offset) {
        return this.buffer.readUInt8(offset);
    }
    
    writeUInt8(value, offset) {
        this.buffer.writeUInt8(value, offset);
    }
    
    readInt16LE(offset) {
        return this.buffer.readInt16LE(offset);
    }
    
    writeInt16LE(value, offset) {
        this.buffer.writeInt16LE(value, offset);
    }
    
    readInt32LE(offset) {
        return this.buffer.readInt32LE(offset);
    }
    
    writeInt32LE(value, offset) {
        this.buffer.writeInt32LE(value, offset);
    }
    
    readFloatLE(offset) {
        return this.buffer.readFloatLE(offset);
    }
    
    writeFloatLE(value, offset) {
        this.buffer.writeFloatLE(value, offset);
    }
    
    readDoubleLE(offset) {
        return this.buffer.readDoubleLE(offset);
    }
    
    writeDoubleLE(value, offset) {
        this.buffer.writeDoubleLE(value, offset);
    }
    
    toString(encoding = 'utf8') {
        return this.buffer.toString(encoding);
    }
    
    toJSON() {
        return this.buffer.toJSON();
    }
    
    get length() {
        return this.size;
    }
    
    get raw() {
        return this.buffer;
    }
}

module.exports = {
    NativeModule,
    NativeModuleManager,
    NativeBuffer
};
