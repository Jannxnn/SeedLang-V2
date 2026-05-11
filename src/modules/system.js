/**
 * SeedLang 增强模块系统
 * 支持ES6风格的模块导入导出
 */

const fs = require('fs');
const path = require('path');

class ModuleSystem {
    constructor() {
        this.modules = new Map();
        this.cache = new Map();
        this.resolvers = [];
        this.loaders = new Map();
        this.hooks = {
            beforeLoad: [],
            afterLoad: [],
            beforeResolve: [],
            afterResolve: []
        };
    }
    
    addResolver(resolver) {
        this.resolvers.push(resolver);
    }
    
    addLoader(extension, loader) {
        this.loaders.set(extension, loader);
    }
    
    addHook(hookName, hook) {
        if (this.hooks[hookName]) {
            this.hooks[hookName].push(hook);
        }
    }
    
    async runHooks(hookName, context) {
        const hooks = this.hooks[hookName];
        if (hooks) {
            for (const hook of hooks) {
                await hook(context);
            }
        }
    }
    
    resolve(modulePath, fromPath) {
        const context = { modulePath, fromPath };
        this.runHooks('beforeResolve', context);
        
        if (path.isAbsolute(modulePath)) {
            context.resolvedPath = modulePath;
        } else if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
            context.resolvedPath = path.resolve(path.dirname(fromPath), modulePath);
        } else {
            for (const resolver of this.resolvers) {
                const resolved = resolver(modulePath, fromPath);
                if (resolved) {
                    context.resolvedPath = resolved;
                    break;
                }
            }
        }
        
        if (!context.resolvedPath) {
            throw new Error(`无法解析模块: ${modulePath}`);
        }
        
        if (!path.extname(context.resolvedPath)) {
            const extensions = ['.seed', '.js', '.json'];
            for (const ext of extensions) {
                const testPath = context.resolvedPath + ext;
                if (fs.existsSync(testPath)) {
                    context.resolvedPath = testPath;
                    break;
                }
            }
        }
        
        this.runHooks('afterResolve', context);
        return context.resolvedPath;
    }
    
    async load(modulePath) {
        const context = { modulePath };
        this.runHooks('beforeLoad', context);
        
        if (this.cache.has(modulePath)) {
            context.module = this.cache.get(modulePath);
            this.runHooks('afterLoad', context);
            return context.module;
        }
        
        const ext = path.extname(modulePath);
        const loader = this.loaders.get(ext) || this.defaultLoader;
        
        const code = fs.readFileSync(modulePath, 'utf-8');
        const module = await loader(code, modulePath);
        
        this.cache.set(modulePath, module);
        context.module = module;
        
        this.runHooks('afterLoad', context);
        return module;
    }
    
    async defaultLoader(code, modulePath) {
        const module = {
            id: modulePath,
            exports: {},
            loaded: false,
            dependencies: []
        };
        
        this.modules.set(modulePath, module);
        
        return module;
    }
    
    define(modulePath, exports) {
        const module = this.modules.get(modulePath) || {
            id: modulePath,
            exports: {},
            loaded: false,
            dependencies: []
        };
        
        module.exports = { ...module.exports, ...exports };
        module.loaded = true;
        
        this.modules.set(modulePath, module);
        this.cache.set(modulePath, module);
    }
    
    get(modulePath) {
        return this.modules.get(modulePath);
    }
    
    has(modulePath) {
        return this.modules.has(modulePath);
    }
    
    clear() {
        this.modules.clear();
        this.cache.clear();
    }
    
    getModuleInfo(modulePath) {
        const module = this.modules.get(modulePath);
        if (!module) return null;
        
        return {
            id: module.id,
            loaded: module.loaded,
            exports: Object.keys(module.exports),
            dependencies: module.dependencies
        };
    }
    
    getAllModules() {
        return Array.from(this.modules.keys());
    }
}

class ModuleBuilder {
    constructor(moduleSystem) {
        this.moduleSystem = moduleSystem;
        this.exports = {};
        this.imports = [];
    }
    
    export(name, value) {
        this.exports[name] = value;
        return this;
    }
    
    exportDefault(value) {
        this.exports.default = value;
        return this;
    }
    
    import(modulePath, name) {
        this.imports.push({ modulePath, name });
        return this;
    }
    
    importAll(modulePath, namespace) {
        this.imports.push({ modulePath, name: '*', namespace });
        return this;
    }
    
    async build(modulePath) {
        for (const imp of this.imports) {
            const resolvedPath = this.moduleSystem.resolve(imp.modulePath, modulePath);
            const module = await this.moduleSystem.load(resolvedPath);
            
            if (imp.name === '*') {
                this.exports[imp.namespace] = module.exports;
            } else {
                this.exports[imp.name] = module.exports[imp.name];
            }
        }
        
        this.moduleSystem.define(modulePath, this.exports);
        return this.exports;
    }
}

class ModuleResolver {
    constructor() {
        this.paths = [];
        this.aliases = new Map();
    }
    
    addPath(path) {
        this.paths.push(path);
        return this;
    }
    
    addAlias(alias, target) {
        this.aliases.set(alias, target);
        return this;
    }
    
    resolve(modulePath, fromPath) {
        if (this.aliases.has(modulePath)) {
            return this.aliases.get(modulePath);
        }
        
        for (const basePath of this.paths) {
            const fullPath = path.join(basePath, modulePath);
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }
        
        return null;
    }
}

class ModuleCache {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.hits = 0;
        this.misses = 0;
    }
    
    get(key) {
        if (this.cache.has(key)) {
            this.hits++;
            return this.cache.get(key);
        }
        this.misses++;
        return null;
    }
    
    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    
    has(key) {
        return this.cache.has(key);
    }
    
    delete(key) {
        return this.cache.delete(key);
    }
    
    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }
    
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: this.hits / (this.hits + this.misses) || 0
        };
    }
}

// ============================================
// 标准库 - Set 实现
// ============================================
class SeedSet {
    constructor(iterable = []) {
        this._items = new Map();
        this._size = 0;
        
        if (iterable && typeof iterable[Symbol.iterator] === 'function') {
            for (const item of iterable) {
                this.add(item);
            }
        }
    }
    
    add(value) {
        const key = this._hash(value);
        if (!this._items.has(key)) {
            this._items.set(key, value);
            this._size++;
        }
        return this;
    }
    
    delete(value) {
        const key = this._hash(value);
        if (this._items.has(key)) {
            this._items.delete(key);
            this._size--;
            return true;
        }
        return false;
    }
    
    has(value) {
        return this._items.has(this._hash(value));
    }
    
    clear() {
        this._items.clear();
        this._size = 0;
    }
    
    get size() {
        return this._size;
    }
    
    forEach(callback, thisArg) {
        for (const [, value] of this._items) {
            callback.call(thisArg, value, value, this);
        }
    }
    
    values() {
        return this._items.values();
    }
    
    keys() {
        return this._items.values();
    }
    
    entries() {
        const entries = [];
        for (const [, value] of this._items) {
            entries.push([value, value]);
        }
        return entries[Symbol.iterator]();
    }
    
    [Symbol.iterator]() {
        return this._items.values();
    }
    
    union(otherSet) {
        const result = new SeedSet(this);
        for (const item of otherSet) {
            result.add(item);
        }
        return result;
    }
    
    intersection(otherSet) {
        const result = new SeedSet();
        for (const item of this) {
            if (otherSet.has(item)) {
                result.add(item);
            }
        }
        return result;
    }
    
    difference(otherSet) {
        const result = new SeedSet();
        for (const item of this) {
            if (!otherSet.has(item)) {
                result.add(item);
            }
        }
        return result;
    }
    
    symmetricDifference(otherSet) {
        const result = new SeedSet();
        for (const item of this) {
            if (!otherSet.has(item)) {
                result.add(item);
            }
        }
        for (const item of otherSet) {
            if (!this.has(item)) {
                result.add(item);
            }
        }
        return result;
    }
    
    isSubsetOf(otherSet) {
        for (const item of this) {
            if (!otherSet.has(item)) {
                return false;
            }
        }
        return true;
    }
    
    isSupersetOf(otherSet) {
        return otherSet.isSubsetOf(this);
    }
    
    _hash(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }
    
    toArray() {
        return Array.from(this);
    }
    
    toString() {
        return `Set(${this.size}) { ${Array.from(this).join(', ')} }`;
    }
}

// ============================================
// 标准库 - Map 实现
// ============================================
class SeedMap {
    constructor(iterable = []) {
        this._entries = new Map();
        this._size = 0;
        
        if (iterable && typeof iterable[Symbol.iterator] === 'function') {
            for (const [key, value] of iterable) {
                this.set(key, value);
            }
        }
    }
    
    set(key, value) {
        const hashKey = this._hash(key);
        if (!this._entries.has(hashKey)) {
            this._size++;
        }
        this._entries.set(hashKey, { key, value });
        return this;
    }
    
    get(key) {
        const entry = this._entries.get(this._hash(key));
        return entry ? entry.value : undefined;
    }
    
    delete(key) {
        const hashKey = this._hash(key);
        if (this._entries.has(hashKey)) {
            this._entries.delete(hashKey);
            this._size--;
            return true;
        }
        return false;
    }
    
    has(key) {
        return this._entries.has(this._hash(key));
    }
    
    clear() {
        this._entries.clear();
        this._size = 0;
    }
    
    get size() {
        return this._size;
    }
    
    forEach(callback, thisArg) {
        for (const [, entry] of this._entries) {
            callback.call(thisArg, entry.value, entry.key, this);
        }
    }
    
    keys() {
        const keys = [];
        for (const [, entry] of this._entries) {
            keys.push(entry.key);
        }
        return keys[Symbol.iterator]();
    }
    
    values() {
        const values = [];
        for (const [, entry] of this._entries) {
            values.push(entry.value);
        }
        return values[Symbol.iterator]();
    }
    
    entries() {
        const entries = [];
        for (const [, entry] of this._entries) {
            entries.push([entry.key, entry.value]);
        }
        return entries[Symbol.iterator]();
    }
    
    [Symbol.iterator]() {
        return this.entries();
    }
    
    _hash(key) {
        if (key === null) return 'null';
        if (key === undefined) return 'undefined';
        if (typeof key === 'object') {
            return JSON.stringify(key);
        }
        return String(key);
    }
    
    merge(otherMap) {
        for (const [key, value] of otherMap) {
            this.set(key, value);
        }
        return this;
    }
    
    filter(predicate) {
        const result = new SeedMap();
        for (const [key, value] of this) {
            if (predicate(value, key)) {
                result.set(key, value);
            }
        }
        return result;
    }
    
    map(mapper) {
        const result = new SeedMap();
        for (const [key, value] of this) {
            result.set(key, mapper(value, key));
        }
        return result;
    }
    
    findKey(value) {
        for (const [k, v] of this) {
            if (v === value) {
                return k;
            }
        }
        return undefined;
    }
    
    invert() {
        const result = new SeedMap();
        for (const [key, value] of this) {
            result.set(value, key);
        }
        return result;
    }
    
    toObject() {
        const obj = {};
        for (const [key, value] of this) {
            if (typeof key === 'string') {
                obj[key] = value;
            }
        }
        return obj;
    }
    
    toString() {
        const entries = Array.from(this.entries()).map(([k, v]) => `${k} => ${v}`);
        return `Map(${this.size}) { ${entries.join(', ')} }`;
    }
}

// ============================================
// 标准库 - 文件 API
// ============================================
class FileAPI {
    constructor(options = {}) {
        this.encoding = options.encoding || 'utf-8';
        this.basePath = options.basePath || process.cwd();
        this.allowedExtensions = options.allowedExtensions || null;
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024;
    }
    
    read(filePath) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        
        const stats = fs.statSync(fullPath);
        if (stats.size > this.maxFileSize) {
            throw new Error(`文件大小超过限制: ${stats.size} > ${this.maxFileSize}`);
        }
        
        return fs.readFileSync(fullPath, this.encoding);
    }
    
    readAsync(filePath) {
        return new Promise((resolve, reject) => {
            const fullPath = this._resolvePath(filePath);
            this._validatePath(fullPath);
            
            fs.stat(fullPath, (err, stats) => {
                if (err) return reject(err);
                if (stats.size > this.maxFileSize) {
                    return reject(new Error(`文件大小超过限制: ${stats.size} > ${this.maxFileSize}`));
                }
                
                fs.readFile(fullPath, this.encoding, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        });
    }
    
    write(filePath, content) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        this._ensureDirectory(path.dirname(fullPath));
        
        fs.writeFileSync(fullPath, content, this.encoding);
        return true;
    }
    
    writeAsync(filePath, content) {
        return new Promise((resolve, reject) => {
            const fullPath = this._resolvePath(filePath);
            this._validatePath(fullPath);
            this._ensureDirectory(path.dirname(fullPath));
            
            fs.writeFile(fullPath, content, this.encoding, (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }
    
    append(filePath, content) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        
        fs.appendFileSync(fullPath, content, this.encoding);
        return true;
    }
    
    appendAsync(filePath, content) {
        return new Promise((resolve, reject) => {
            const fullPath = this._resolvePath(filePath);
            this._validatePath(fullPath);
            
            fs.appendFile(fullPath, content, this.encoding, (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }
    
    exists(filePath) {
        const fullPath = this._resolvePath(filePath);
        return fs.existsSync(fullPath);
    }
    
    delete(filePath) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return true;
        }
        return false;
    }
    
    copy(srcPath, destPath) {
        const fullSrc = this._resolvePath(srcPath);
        const fullDest = this._resolvePath(destPath);
        this._validatePath(fullSrc);
        this._ensureDirectory(path.dirname(fullDest));
        
        fs.copyFileSync(fullSrc, fullDest);
        return true;
    }
    
    move(srcPath, destPath) {
        const fullSrc = this._resolvePath(srcPath);
        const fullDest = this._resolvePath(destPath);
        this._validatePath(fullSrc);
        this._ensureDirectory(path.dirname(fullDest));
        
        fs.renameSync(fullSrc, fullDest);
        return true;
    }
    
    rename(oldPath, newPath) {
        return this.move(oldPath, newPath);
    }
    
    list(dirPath = '.') {
        const fullPath = this._resolvePath(dirPath);
        this._validatePath(fullPath);
        
        return fs.readdirSync(fullPath);
    }
    
    listWithDetails(dirPath = '.') {
        const fullPath = this._resolvePath(dirPath);
        this._validatePath(fullPath);
        
        const items = fs.readdirSync(fullPath);
        return items.map(item => {
            const itemPath = path.join(fullPath, item);
            const stats = fs.statSync(itemPath);
            return {
                name: item,
                path: itemPath,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                accessed: stats.atime
            };
        });
    }
    
    createDirectory(dirPath) {
        const fullPath = this._resolvePath(dirPath);
        this._ensureDirectory(fullPath);
        return true;
    }
    
    removeDirectory(dirPath, recursive = false) {
        const fullPath = this._resolvePath(dirPath);
        this._validatePath(fullPath);
        
        if (recursive) {
            fs.rmSync(fullPath, { recursive: true });
        } else {
            fs.rmdirSync(fullPath);
        }
        return true;
    }
    
    getStats(filePath) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        
        const stats = fs.statSync(fullPath);
        return {
            size: stats.size,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            created: stats.birthtime,
            modified: stats.mtime,
            accessed: stats.atime,
            mode: stats.mode
        };
    }
    
    readJSON(filePath) {
        const content = this.read(filePath);
        return JSON.parse(content);
    }
    
    writeJSON(filePath, data, pretty = true) {
        const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
        return this.write(filePath, content);
    }
    
    readLines(filePath) {
        const content = this.read(filePath);
        return content.split(/\r?\n/);
    }
    
    writeLines(filePath, lines) {
        return this.write(filePath, lines.join('\n'));
    }
    
    watch(filePath, callback) {
        const fullPath = this._resolvePath(filePath);
        this._validatePath(fullPath);
        
        return fs.watch(fullPath, (eventType, filename) => {
            callback(eventType, filename, fullPath);
        });
    }
    
    _resolvePath(filePath) {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.resolve(this.basePath, filePath);
    }
    
    _validatePath(fullPath) {
        if (this.allowedExtensions) {
            const ext = path.extname(fullPath);
            if (!this.allowedExtensions.includes(ext)) {
                throw new Error(`不允许的文件扩展名: ${ext}`);
            }
        }
        
        const resolved = path.resolve(fullPath);
        if (!resolved.startsWith(this.basePath)) {
            throw new Error(`路径超出允许范围: ${fullPath}`);
        }
    }
    
    _ensureDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
}

// ============================================
// 标准库 - 路径 API
// ============================================
class PathAPI {
    join(...paths) {
        return path.join(...paths);
    }
    
    resolve(...paths) {
        return path.resolve(...paths);
    }
    
    dirname(filePath) {
        return path.dirname(filePath);
    }
    
    basename(filePath, ext) {
        return path.basename(filePath, ext);
    }
    
    extname(filePath) {
        return path.extname(filePath);
    }
    
    normalize(filePath) {
        return path.normalize(filePath);
    }
    
    relative(from, to) {
        return path.relative(from, to);
    }
    
    isAbsolute(filePath) {
        return path.isAbsolute(filePath);
    }
    
    parse(filePath) {
        return path.parse(filePath);
    }
    
    format(pathObject) {
        return path.format(pathObject);
    }
    
    sep() {
        return path.sep;
    }
    
    delimiter() {
        return path.delimiter;
    }
}

module.exports = {
    ModuleSystem,
    ModuleBuilder,
    ModuleResolver,
    ModuleCache,
    SeedSet,
    SeedMap,
    FileAPI,
    PathAPI
};
