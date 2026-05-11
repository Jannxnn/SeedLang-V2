/**
 * SeedLang FFI库支持
 * 提供调用外部C库的能力
 */

class FFILibrary {
    constructor(name, path, functions) {
        this.name = name;
        this.path = path;
        this.functions = new Map();
        this.handle = null;
        
        for (const [funcName, signature] of Object.entries(functions)) {
            this.functions.set(funcName, signature);
        }
    }
    
    load() {
        try {
            this.handle = require(this.path);
            return true;
        } catch (error) {
            console.error(`加载FFI库失败: ${this.name}`, error.message);
            return false;
        }
    }
    
    call(functionName, ...args) {
        const signature = this.functions.get(functionName);
        if (!signature) {
            throw new Error(`函数未定义: ${functionName}`);
        }
        
        if (!this.handle) {
            throw new Error(`库未加载: ${this.name}`);
        }
        
        const func = this.handle[functionName];
        if (!func) {
            throw new Error(`函数不存在: ${functionName}`);
        }
        
        const convertedArgs = this.convertArgs(args, signature.params);
        const result = func(...convertedArgs);
        
        return this.convertResult(result, signature.returnType);
    }
    
    convertArgs(args, paramTypes) {
        return args.map((arg, index) => {
            const type = paramTypes[index];
            return this.convertValue(arg, type);
        });
    }
    
    convertValue(value, type) {
        switch (type) {
            case 'int':
            case 'int32':
                return Math.floor(value);
            case 'uint':
            case 'uint32':
                return Math.floor(value) >>> 0;
            case 'long':
            case 'int64':
                return BigInt(Math.floor(value));
            case 'ulong':
            case 'uint64':
                return BigInt(Math.floor(value) >>> 0);
            case 'float':
                return Number(value);
            case 'double':
                return Number(value);
            case 'bool':
            case 'boolean':
                return Boolean(value);
            case 'char':
                return String(value).charCodeAt(0);
            case 'string':
            case 'char*':
                return String(value);
            case 'pointer':
            case 'void*':
                return value;
            default:
                return value;
        }
    }
    
    convertResult(result, returnType) {
        switch (returnType) {
            case 'void':
                return null;
            case 'int':
            case 'int32':
            case 'uint':
            case 'uint32':
                return Number(result);
            case 'long':
            case 'int64':
            case 'ulong':
            case 'uint64':
                return Number(result);
            case 'float':
            case 'double':
                return Number(result);
            case 'bool':
            case 'boolean':
                return Boolean(result);
            case 'char':
                return String.fromCharCode(result);
            case 'string':
            case 'char*':
                return String(result);
            case 'pointer':
            case 'void*':
                return result;
            default:
                return result;
        }
    }
    
    hasFunction(functionName) {
        return this.functions.has(functionName);
    }
    
    getFunctionSignature(functionName) {
        return this.functions.get(functionName);
    }
    
    unload() {
        this.handle = null;
    }
}

class FFIModule {
    constructor() {
        this.libraries = new Map();
        this.typeDefinitions = new Map();
        this.callbacks = new Map();
    }
    
    defineLibrary(name, path, functions) {
        const library = new FFILibrary(name, path, functions);
        this.libraries.set(name, library);
        return library;
    }
    
    loadLibrary(name) {
        const library = this.libraries.get(name);
        if (!library) {
            throw new Error(`库未定义: ${name}`);
        }
        
        return library.load();
    }
    
    call(libraryName, functionName, ...args) {
        const library = this.libraries.get(libraryName);
        if (!library) {
            throw new Error(`库未加载: ${libraryName}`);
        }
        
        return library.call(functionName, ...args);
    }
    
    defineType(name, definition) {
        this.typeDefinitions.set(name, definition);
    }
    
    getType(name) {
        return this.typeDefinitions.get(name);
    }
    
    createCallback(signature, func) {
        const callbackId = `callback_${Date.now()}_${Math.random()}`;
        
        const callback = (...args) => {
            const convertedArgs = args.map((arg, index) => {
                const type = signature.params[index];
                return this.convertValue(arg, type);
            });
            
            const result = func(...convertedArgs);
            return this.convertResult(result, signature.returnType);
        };
        
        this.callbacks.set(callbackId, callback);
        return callbackId;
    }
    
    getCallback(callbackId) {
        return this.callbacks.get(callbackId);
    }
    
    removeCallback(callbackId) {
        this.callbacks.delete(callbackId);
    }
    
    unloadLibrary(name) {
        const library = this.libraries.get(name);
        if (library) {
            library.unload();
        }
    }
    
    unloadAll() {
        for (const library of this.libraries.values()) {
            library.unload();
        }
    }
    
    getLibraryInfo(name) {
        const library = this.libraries.get(name);
        if (!library) return null;
        
        return {
            name: library.name,
            path: library.path,
            functions: Array.from(library.functions.keys()),
            loaded: !!library.handle
        };
    }
    
    getAllLibraries() {
        return Array.from(this.libraries.keys());
    }
    
    convertValue(value, type) {
        switch (type) {
            case 'int':
            case 'int32':
                return Math.floor(value);
            case 'uint':
            case 'uint32':
                return Math.floor(value) >>> 0;
            case 'float':
            case 'double':
                return Number(value);
            case 'bool':
            case 'boolean':
                return Boolean(value);
            case 'string':
            case 'char*':
                return String(value);
            default:
                return value;
        }
    }
    
    convertResult(result, returnType) {
        switch (returnType) {
            case 'void':
                return null;
            case 'int':
            case 'int32':
            case 'uint':
            case 'uint32':
            case 'float':
            case 'double':
                return Number(result);
            case 'bool':
            case 'boolean':
                return Boolean(result);
            case 'string':
            case 'char*':
                return String(result);
            default:
                return result;
        }
    }
}

class FFITypeMapper {
    constructor() {
        this.typeMap = new Map([
            ['void', { size: 0, align: 0 }],
            ['bool', { size: 1, align: 1 }],
            ['char', { size: 1, align: 1 }],
            ['short', { size: 2, align: 2 }],
            ['int', { size: 4, align: 4 }],
            ['long', { size: 8, align: 8 }],
            ['float', { size: 4, align: 4 }],
            ['double', { size: 8, align: 8 }],
            ['pointer', { size: 8, align: 8 }]
        ]);
    }
    
    getSize(type) {
        const typeInfo = this.typeMap.get(type);
        return typeInfo ? typeInfo.size : 0;
    }
    
    getAlignment(type) {
        const typeInfo = this.typeMap.get(type);
        return typeInfo ? typeInfo.align : 0;
    }
    
    isPointerType(type) {
        return type === 'pointer' || type.endsWith('*');
    }
    
    isIntegerType(type) {
        return ['char', 'short', 'int', 'long'].includes(type);
    }
    
    isFloatType(type) {
        return ['float', 'double'].includes(type);
    }
    
    addType(name, size, align) {
        this.typeMap.set(name, { size, align });
    }
    
    getTypeInfo(type) {
        return this.typeMap.get(type);
    }
}

module.exports = {
    FFILibrary,
    FFIModule,
    FFITypeMapper
};
