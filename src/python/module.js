/**
 * SeedLang Python 集成模块
 * 支持通过子进程、WASM 和 Native 方式调用 Python 代码
 */

const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class PythonModule {
    constructor(name, options = {}) {
        this.name = name;
        this.options = {
            pythonPath: options.pythonPath || 'python',
            scriptPath: options.scriptPath || null,
            timeout: options.timeout || 30000,
            encoding: options.encoding || 'utf8',
            useWasm: options.useWasm || false,
            wasmPath: options.wasmPath || null
        };
        this.functions = new Map();
        this.loaded = false;
    }
    
    async load() {
        if (this.options.scriptPath && fs.existsSync(this.options.scriptPath)) {
            await this.loadScript();
        }
        this.loaded = true;
        return true;
    }
    
    async loadScript() {
        try {
            const result = execSync(
                `${this.options.pythonPath} -c "import ast; print([x.name for x in ast.parse(open('${this.options.scriptPath}').read()).body if isinstance(x, ast.FunctionDef)])"`,
                { encoding: this.options.encoding, timeout: 5000 }
            );
            const functions = JSON.parse(result.trim().replace(/'/g, '"'));
            functions.forEach(fn => this.functions.set(fn, true));
            return true;
        } catch (error) {
            return false;
        }
    }
    
    async call(functionName, ...args) {
        return new Promise((resolve, reject) => {
            const argsJson = JSON.stringify(args);
            const script = this.options.scriptPath
                ? `import json; import sys; sys.path.insert(0, '${path.dirname(this.options.scriptPath)}'); from ${path.basename(this.options.scriptPath, '.py')} import ${functionName}; print(json.dumps(${functionName}(*json.loads('${argsJson}'))))`
                : null;
            
            if (!script) {
                reject(new Error('未指定 Python 脚本路径'));
                return;
            }
            
            exec(
                `${this.options.pythonPath} -c "${script.replace(/"/g, '\\"')}"`,
                { encoding: this.options.encoding, timeout: this.options.timeout },
                (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(`Python 执行错误: ${stderr || error.message}`));
                        return;
                    }
                    try {
                        const result = JSON.parse(stdout.trim());
                        resolve(result);
                    } catch (e) {
                        resolve(stdout.trim());
                    }
                }
            );
        });
    }
    
    async callScript(scriptContent) {
        return new Promise((resolve, reject) => {
            const tempFile = path.join(require('os').tmpdir(), `seedlang_py_${Date.now()}.py`);
            fs.writeFileSync(tempFile, scriptContent);
            
            exec(
                `${this.options.pythonPath} ${tempFile}`,
                { encoding: this.options.encoding, timeout: this.options.timeout },
                (error, stdout, stderr) => {
                    fs.unlinkSync(tempFile);
                    if (error) {
                        reject(new Error(`Python 执行错误: ${stderr || error.message}`));
                        return;
                    }
                    resolve(stdout.trim());
                }
            );
        });
    }
    
    hasFunction(functionName) {
        return this.functions.has(functionName);
    }
    
    getFunctionNames() {
        return Array.from(this.functions.keys());
    }
    
    unload() {
        this.functions.clear();
        this.loaded = false;
    }
}

class PythonModuleManager {
    constructor() {
        this.modules = new Map();
        this.pythonPath = 'python';
        this.scriptPaths = [];
    }
    
    setPythonPath(pythonPath) {
        this.pythonPath = pythonPath;
        return this;
    }
    
    addScriptPath(scriptPath) {
        this.scriptPaths.push(scriptPath);
        return this;
    }
    
    async registerModule(name, options = {}) {
        const module = new PythonModule(name, {
            pythonPath: this.pythonPath,
            ...options
        });
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
    
    async call(moduleName, functionName, ...args) {
        const module = this.modules.get(moduleName);
        if (!module || !module.loaded) {
            throw new Error(`模块未加载: ${moduleName}`);
        }
        return module.call(functionName, ...args);
    }
    
    async callScript(scriptContent) {
        const tempModule = new PythonModule('temp', { pythonPath: this.pythonPath });
        return tempModule.callScript(scriptContent);
    }
    
    getModuleInfo(name) {
        const module = this.modules.get(name);
        if (!module) return null;
        
        return {
            name: module.name,
            loaded: module.loaded,
            functions: module.getFunctionNames(),
            pythonPath: module.options.pythonPath
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
    
    async checkPythonVersion() {
        return new Promise((resolve) => {
            exec(
                `${this.pythonPath} --version`,
                { encoding: 'utf8', timeout: 5000 },
                (error, stdout, stderr) => {
                    if (error) {
                        resolve(null);
                        return;
                    }
                    const match = (stdout || stderr).match(/Python (\d+\.\d+\.\d+)/);
                    resolve(match ? match[1] : null);
                }
            );
        });
    }
    
    async checkPackage(packageName) {
        return new Promise((resolve) => {
            exec(
                `${this.pythonPath} -c "import ${packageName}; print('ok')"`,
                { encoding: 'utf8', timeout: 5000 },
                (error, stdout) => {
                    resolve(!error && stdout.trim() === 'ok');
                }
            );
        });
    }
    
    async installPackage(packageName) {
        return new Promise((resolve, reject) => {
            exec(
                `${this.pythonPath} -m pip install ${packageName}`,
                { encoding: 'utf8', timeout: 120000 },
                (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(`安装失败: ${stderr}`));
                        return;
                    }
                    resolve(true);
                }
            );
        });
    }
}

class PythonREPL {
    constructor(options = {}) {
        this.pythonPath = options.pythonPath || 'python';
        this.process = null;
        this.buffer = '';
        this.callbacks = [];
    }
    
    start() {
        return new Promise((resolve, reject) => {
            this.process = spawn(this.pythonPath, ['-i'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            this.process.stdout.on('data', (data) => {
                this.buffer += data.toString();
                this.checkCallbacks();
            });
            
            this.process.stderr.on('data', (data) => {
                this.buffer += data.toString();
                this.checkCallbacks();
            });
            
            this.process.on('error', reject);
            
            setTimeout(() => resolve(true), 500);
        });
    }
    
    checkCallbacks() {
        if (this.buffer.includes('>>>') && this.callbacks.length > 0) {
            const callback = this.callbacks.shift();
            const output = this.buffer.replace(/>>>\s*$/g, '').trim();
            this.buffer = '';
            callback(output);
        }
    }
    
    async execute(code) {
        return new Promise((resolve) => {
            this.callbacks.push(resolve);
            this.process.stdin.write(code + '\n');
        });
    }
    
    stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}

class PythonTypeConverter {
    constructor() {
        this.typeMap = new Map([
            ['int', { jsType: 'number', convert: (v) => Number(v) }],
            ['float', { jsType: 'number', convert: (v) => Number(v) }],
            ['str', { jsType: 'string', convert: (v) => String(v) }],
            ['bool', { jsType: 'boolean', convert: (v) => Boolean(v) }],
            ['list', { jsType: 'array', convert: (v) => Array.from(v) }],
            ['dict', { jsType: 'object', convert: (v) => Object.assign({}, v) }],
            ['None', { jsType: 'null', convert: () => null }]
        ]);
    }
    
    toPython(value) {
        if (value === null || value === undefined) {
            return 'None';
        }
        if (typeof value === 'boolean') {
            return value ? 'True' : 'False';
        }
        if (typeof value === 'number') {
            return Number.isInteger(value) ? value.toString() : value.toString();
        }
        if (typeof value === 'string') {
            return `'${value.replace(/'/g, "\\'")}'`;
        }
        if (Array.isArray(value)) {
            return `[${value.map(v => this.toPython(v)).join(', ')}]`;
        }
        if (typeof value === 'object') {
            const pairs = Object.entries(value).map(([k, v]) => `'${k}': ${this.toPython(v)}`);
            return `{${pairs.join(', ')}}`;
        }
        return String(value);
    }
    
    fromPython(value, type) {
        const typeInfo = this.typeMap.get(type);
        return typeInfo ? typeInfo.convert(value) : value;
    }
    
    getJsType(pythonType) {
        const typeInfo = this.typeMap.get(pythonType);
        return typeInfo ? typeInfo.jsType : 'any';
    }
}

class PyodideRunner {
    constructor() {
        this.pyodide = null;
        this.loaded = false;
    }
    
    async load() {
        if (typeof window === 'undefined') {
            throw new Error('Pyodide 仅支持浏览器环境');
        }
        
        if (!this.pyodide) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
            document.head.appendChild(script);
            
            await new Promise((resolve) => {
                script.onload = resolve;
            });
            
            this.pyodide = await loadPyodide();
        }
        
        this.loaded = true;
        return true;
    }
    
    async run(code) {
        if (!this.loaded) {
            await this.load();
        }
        return this.pyodide.runPython(code);
    }
    
    async loadPackage(packageName) {
        if (!this.loaded) {
            await this.load();
        }
        await this.pyodide.loadPackage(packageName);
    }
}

module.exports = {
    PythonModule,
    PythonModuleManager,
    PythonREPL,
    PythonTypeConverter,
    PyodideRunner
};
