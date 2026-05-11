/**
 * SeedLang Rust 集成模块
 * 支持通过 WebAssembly 和 Native 方式调用 Rust 代码
 */

const fs = require('fs');
const path = require('path');
const { WASMLoader } = require('../wasm/loader.js');

class RustModule {
    constructor(name, options = {}) {
        this.name = name;
        this.options = {
            wasmPath: options.wasmPath || null,
            nativePath: options.nativePath || null,
            useWasm: options.useWasm !== false,
            useNative: options.useNative || false
        };
        this.wasmModule = null;
        this.nativeModule = null;
        this.loaded = false;
    }
    
    async load() {
        if (this.options.useWasm && this.options.wasmPath) {
            await this.loadWasm();
        }
        
        if (this.options.useNative && this.options.nativePath) {
            this.loadNative();
        }
        
        this.loaded = !!(this.wasmModule || this.nativeModule);
        return this.loaded;
    }
    
    async loadWasm() {
        try {
            const loader = new WASMLoader();
            this.wasmModule = await loader.loadModule(this.options.wasmPath, {
                env: {
                    seed_print: (ptr, len) => {
                        const str = this.readString(ptr, len);
                        console.log(str);
                    },
                    seed_time: () => Date.now(),
                    seed_random: () => Math.random()
                }
            });
            return true;
        } catch (error) {
            console.error(`加载 Rust WASM 模块失败: ${this.name}`, error.message);
            return false;
        }
    }
    
    loadNative() {
        try {
            this.nativeModule = require(this.options.nativePath);
            return true;
        } catch (error) {
            console.error(`加载 Rust Native 模块失败: ${this.name}`, error.message);
            return false;
        }
    }
    
    call(functionName, ...args) {
        if (this.nativeModule && this.nativeModule[functionName]) {
            return this.nativeModule[functionName](...args);
        }
        
        if (this.wasmModule && this.wasmModule.exports[functionName]) {
            return this.wasmModule.exports[functionName](...args);
        }
        
        throw new Error(`函数不存在: ${functionName}`);
    }
    
    hasFunction(functionName) {
        return !!(
            (this.nativeModule && this.nativeModule[functionName]) ||
            (this.wasmModule && this.wasmModule.exports[functionName])
        );
    }
    
    getFunctionNames() {
        const functions = new Set();
        
        if (this.nativeModule) {
            Object.keys(this.nativeModule).forEach(k => functions.add(k));
        }
        
        if (this.wasmModule && this.wasmModule.exports) {
            Object.keys(this.wasmModule.exports).forEach(k => functions.add(k));
        }
        
        return Array.from(functions);
    }
    
    readString(ptr, len) {
        if (!this.wasmModule || !this.wasmModule.memory) return '';
        const memory = new Uint8Array(this.wasmModule.memory.buffer);
        return String.fromCharCode(...memory.slice(ptr, ptr + len));
    }
    
    writeString(str) {
        if (!this.wasmModule || !this.wasmModule.exports.allocate) return -1;
        const ptr = this.wasmModule.exports.allocate(str.length);
        const memory = new Uint8Array(this.wasmModule.memory.buffer);
        for (let i = 0; i < str.length; i++) {
            memory[ptr + i] = str.charCodeAt(i);
        }
        return ptr;
    }
    
    unload() {
        this.wasmModule = null;
        this.nativeModule = null;
        this.loaded = false;
    }
}

class RustModuleManager {
    constructor() {
        this.modules = new Map();
        this.wasmPaths = [];
        this.nativePaths = [];
    }
    
    addWasmPath(path) {
        this.wasmPaths.push(path);
    }
    
    addNativePath(path) {
        this.nativePaths.push(path);
    }
    
    async registerModule(name, options = {}) {
        const module = new RustModule(name, options);
        this.modules.set(name, module);
        return module;
    }
    
    async loadModule(name) {
        const module = this.modules.get(name);
        if (!module) {
            throw new Error(`模块未注册: ${name}`);
        }
        return module.load();
    }
    
    call(moduleName, functionName, ...args) {
        const module = this.modules.get(moduleName);
        if (!module || !module.loaded) {
            throw new Error(`模块未加载: ${moduleName}`);
        }
        return module.call(functionName, ...args);
    }
    
    getModuleInfo(name) {
        const module = this.modules.get(name);
        if (!module) return null;
        
        return {
            name: module.name,
            loaded: module.loaded,
            functions: module.getFunctionNames(),
            hasWasm: !!module.wasmModule,
            hasNative: !!module.nativeModule
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
}

class RustWasmBuilder {
    constructor() {
        this.buildOptions = {
            release: true,
            target: 'wasm32-unknown-unknown',
            features: []
        };
    }
    
    setTarget(target) {
        this.buildOptions.target = target;
        return this;
    }
    
    setRelease(release) {
        this.buildOptions.release = release;
        return this;
    }
    
    addFeature(feature) {
        this.buildOptions.features.push(feature);
        return this;
    }
    
    getBuildCommand(projectPath) {
        const cmd = ['cargo build'];
        
        if (this.buildOptions.release) {
            cmd.push('--release');
        }
        
        cmd.push(`--target ${this.buildOptions.target}`);
        
        if (this.buildOptions.features.length > 0) {
            cmd.push(`--features ${this.buildOptions.features.join(',')}`);
        }
        
        return cmd.join(' ');
    }
    
    getWasmBindgenCommand(wasmPath, outputDir) {
        return `wasm-bindgen ${wasmPath} --out-dir ${outputDir} --target web`;
    }
}

class RustTypeConverter {
    constructor() {
        this.typeMap = new Map([
            ['i8', { size: 1, signed: true }],
            ['i16', { size: 2, signed: true }],
            ['i32', { size: 4, signed: true }],
            ['i64', { size: 8, signed: true }],
            ['isize', { size: 8, signed: true }],
            ['u8', { size: 1, signed: false }],
            ['u16', { size: 2, signed: false }],
            ['u32', { size: 4, signed: false }],
            ['u64', { size: 8, signed: false }],
            ['usize', { size: 8, signed: false }],
            ['f32', { size: 4, float: true }],
            ['f64', { size: 8, float: true }],
            ['bool', { size: 1, bool: true }],
            ['char', { size: 4, char: true }]
        ]);
    }
    
    convert(value, type) {
        const typeInfo = this.typeMap.get(type);
        if (!typeInfo) return value;
        
        if (typeInfo.bool) {
            return Boolean(value);
        }
        
        if (typeInfo.float) {
            return Number(value);
        }
        
        if (typeInfo.signed) {
            const num = BigInt(Math.floor(Number(value)));
            const max = BigInt(2) ** BigInt(typeInfo.size * 8 - 1);
            if (num >= max || num < -max) {
                throw new Error(`数值溢出: ${value} 超出 ${type} 范围`);
            }
            return Number(num);
        } else {
            const num = BigInt(Math.floor(Number(value)));
            const max = BigInt(2) ** BigInt(typeInfo.size * 8);
            if (num >= max || num < 0) {
                throw new Error(`数值溢出: ${value} 超出 ${type} 范围`);
            }
            return Number(num);
        }
    }
    
    convertArray(arr, type) {
        return arr.map(v => this.convert(v, type));
    }
    
    getSize(type) {
        const typeInfo = this.typeMap.get(type);
        return typeInfo ? typeInfo.size : 0;
    }
    
    isSigned(type) {
        const typeInfo = this.typeMap.get(type);
        return typeInfo ? typeInfo.signed : false;
    }
    
    isFloat(type) {
        const typeInfo = this.typeMap.get(type);
        return typeInfo ? typeInfo.float : false;
    }
}

module.exports = {
    RustModule,
    RustModuleManager,
    RustWasmBuilder,
    RustTypeConverter
};
