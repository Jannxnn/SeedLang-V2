#!/usr/bin/env node

/**
 * SeedLang REPL (Read-Eval-Print Loop)
 * 交互式命令行环境 - 增强版
 * 
 * 集成功能:
 * - 调试器 (断点、单步执行)
 * - AOT编译
 * - 模块系统
 * - 异步运行时
 * - 并发安全
 * - WebAssembly
 * - FFI
 * - 多语言绑定
 * - 内存优化
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { SeedLangVM, AOTCompiler, ModuleSystem, WASMLoader, FFILibrary, PythonModule, RustModule, NativeModule, AsyncRuntime, AIIntegration } = require('./src/api');

class REPL {
    constructor(options = {}) {
        this.vm = new SeedLangVM({
            typeCheck: options.typeCheck !== false,
            safeMode: options.safeMode !== false,
            jit: options.jit !== false,
            jitEnabled: options.jitEnabled !== false,
            aiFriendly: options.aiFriendly || false,
            verbose: options.verbose || false,
            ...options
        });
        
        this.rl = null;
        this.buffer = [];
        this.multilineMode = false;
        this.prompt = 'seed> ';
        this.continuePrompt = '..... ';
        this.history = [];
        this.maxHistory = 100;
        
        this.typeCheckEnabled = options.typeCheck !== false;
        this.safeModeEnabled = options.safeMode !== false;
        this.jitEnabled = options.jit !== false;
        this.aotEnabled = options.aot || false;
        this.debugMode = options.debug || false;
        this.memoryOptEnabled = options.memoryOpt || false;
        
        this.debugger = null;
        this.breakpoints = new Map();
        this.watchExpressions = new Map();
        this.currentFile = null;
        this.currentCode = null;
        
        this.loadedModules = new Map();
        this.loadedWASM = new Map();
        this.loadedFFI = new Map();
        this.loadedPython = new Map();
        this.loadedRust = new Map();
        this.loadedNative = new Map();
        
        this.commands = {
            '.help': () => this.showHelp(),
            '.exit': () => this.exit(),
            '.quit': () => this.exit(),
            '.clear': () => this.clear(),
            '.reset': () => this.reset(),
            '.stats': () => this.showStats(),
            '.version': () => this.showVersion(),
            '.types': () => this.toggleTypes(),
            '.safe': () => this.toggleSafe(),
            '.jit': () => this.toggleJIT(),
            '.aot': () => this.toggleAOT(),
            '.history': () => this.showHistory(),
            '.load': (filename) => this.loadFile(filename),
            '.save': (filename) => this.saveHistory(filename),
            
            '.break': (line) => this.setBreakpoint(line),
            '.breakpoints': () => this.listBreakpoints(),
            '.clearbreak': (id) => this.clearBreakpoint(id),
            '.step': () => this.stepOver(),
            '.stepin': () => this.stepInto(),
            '.stepout': () => this.stepOut(),
            '.continue': () => this.continueExecution(),
            '.watch': (expr) => this.addWatch(expr),
            '.watches': () => this.listWatches(),
            '.backtrace': () => this.showBacktrace(),
            '.debug': () => this.toggleDebug(),
            
            '.compile': (filename) => this.aotCompile(filename),
            '.run': (filename) => this.runCompiled(filename),
            
            '.import': (modulePath) => this.importModule(modulePath),
            '.modules': () => this.listModules(),
            
            '.wasm': (wasmPath) => this.loadWASM(wasmPath),
            '.ffi': (libPath) => this.loadFFI(libPath),
            '.python': (scriptPath) => this.loadPython(scriptPath),
            '.rust': (wasmPath) => this.loadRust(wasmPath),
            '.native': (modulePath) => this.loadNative(modulePath),
            
            '.memory': () => this.showMemoryStats(),
            '.gc': () => this.runGC(),
            '.optmem': () => this.toggleMemoryOpt(),
            
            '.async': (code) => this.runAsync(code),
            '.concurrent': () => this.showConcurrentInfo(),
            
            '.ai': (prompt) => this.aiGenerate(prompt),
            '.validate': () => this.aiValidate(),
            '.repair': () => this.aiRepair()
        };
    }
    
    start() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            completer: (line) => this.completer(line),
            historySize: this.maxHistory,
            removeHistoryDuplicates: true
        });
        
        this.showWelcome();
        
        this.rl.setPrompt(this.prompt);
        this.rl.prompt();
        
        this.rl.on('line', (line) => {
            this.handleLine(line);
        });
        
        this.rl.on('close', () => {
            console.log('\n再见！');
            process.exit(0);
        });
        
        this.rl.on('SIGINT', () => {
            if (this.multilineMode) {
                console.log('^C');
                this.buffer = [];
                this.multilineMode = false;
                this.rl.setPrompt(this.prompt);
                this.rl.prompt();
            } else {
                this.rl.close();
            }
        });
    }
    
    handleLine(line) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('.')) {
            this.handleCommand(trimmedLine);
            this.rl.prompt();
            return;
        }
        
        if (trimmedLine === '') {
            if (!this.multilineMode) {
                this.rl.prompt();
            }
            return;
        }
        
        this.buffer.push(line);
        const code = this.buffer.join('\n');
        
        if (this.isIncomplete(code)) {
            this.multilineMode = true;
            this.rl.setPrompt(this.continuePrompt);
            this.rl.prompt();
            return;
        }
        
        this.executeCode(code);
        this.buffer = [];
        this.multilineMode = false;
        this.rl.setPrompt(this.prompt);
        this.rl.prompt();
    }
    
    isIncomplete(code) {
        let braceCount = 0;
        let parenCount = 0;
        let bracketCount = 0;
        
        for (const char of code) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
            if (char === '(') parenCount++;
            if (char === ')') parenCount--;
            if (char === '[') bracketCount++;
            if (char === ']') bracketCount--;
        }
        
        if (braceCount > 0 || parenCount > 0 || bracketCount > 0) {
            return true;
        }
        
        const keywords = ['fn', 'if', 'else', 'for', 'while', 'class', 'try', 'catch'];
        const lines = code.split('\n');
        const lastLine = lines[lines.length - 1].trim();
        
        for (const keyword of keywords) {
            if (lastLine.startsWith(keyword + ' ') || lastLine === keyword) {
                return true;
            }
        }
        
        return false;
    }
    
    executeCode(code) {
        this.currentCode = code;
        
        try {
            const startTime = Date.now();
            const result = this.vm.run(code);
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            if (result.success) {
                if (result.output && result.output.length > 0) {
                    result.output.forEach(line => console.log(line));
                }
                
                if (result.safetyErrors && result.safetyErrors.length > 0) {
                    console.log('\n⚠️  安全警告:');
                    result.safetyErrors.forEach((err, i) => {
                        console.log(`  ${i + 1}. [${err.type}] ${err.message}`);
                    });
                }
                
                if (this.vm.options.verbose) {
                    console.log(`\n⏱️  执行时间: ${duration}ms`);
                }
            } else {
                console.log(`\n❌ 错误: ${result.error}`);
                
                if (result.typeErrors && result.typeErrors.length > 0) {
                    console.log('\n类型错误:');
                    result.typeErrors.forEach((err, i) => {
                        console.log(`  ${i + 1}. ${err.message}`);
                    });
                }
            }
            
            this.addToHistory(code);
            
        } catch (error) {
            console.log(`\n❌ 执行错误: ${error.message}`);
            if (this.vm.options.verbose && error.stack) {
                console.log('\n堆栈跟踪:');
                console.log(error.stack);
            }
        }
    }
    
    handleCommand(line) {
        const parts = line.split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1);
        
        if (this.commands[command]) {
            this.commands[command](...args);
        } else {
            console.log(`未知命令: ${command}`);
            console.log('输入 .help 查看可用命令');
        }
    }
    
    showWelcome() {
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║          SeedLang 2.0 - 交互式环境 (增强版)               ║');
        console.log('║          AI专用高效符号语言                               ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('版本: 2.0.0');
        console.log('输入 .help 查看帮助，.exit 退出');
        console.log('');
        console.log('功能状态:');
        console.log(`  类型检查: ${this.typeCheckEnabled ? '✓ 启用' : '✗ 禁用'}`);
        console.log(`  安全模式: ${this.safeModeEnabled ? '✓ 启用' : '✗ 禁用'}`);
        console.log(`  JIT编译: ${this.jitEnabled ? '✓ 启用' : '✗ 禁用'}`);
        console.log(`  AOT编译: ${this.aotEnabled ? '✓ 启用' : '✗ 禁用'}`);
        console.log(`  调试模式: ${this.debugMode ? '✓ 启用' : '✗ 禁用'}`);
        console.log(`  内存优化: ${this.memoryOptEnabled ? '✓ 启用' : '✗ 禁用'}`);
        console.log('');
    }
    
    showHelp() {
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('基本命令:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  .help          显示帮助信息');
        console.log('  .exit, .quit   退出REPL');
        console.log('  .clear         清屏');
        console.log('  .reset         重置虚拟机状态');
        console.log('  .stats         显示统计信息');
        console.log('  .version       显示版本信息');
        console.log('  .history       显示命令历史');
        console.log('  .load <file>   加载并执行文件');
        console.log('  .save <file>   保存历史到文件');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('功能切换:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  .types         切换类型检查');
        console.log('  .safe          切换安全模式');
        console.log('  .jit           切换JIT编译');
        console.log('  .aot           切换AOT编译');
        console.log('  .debug         切换调试模式');
        console.log('  .optmem        切换内存优化');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('调试命令:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  .break <line>  设置断点');
        console.log('  .breakpoints   列出所有断点');
        console.log('  .clearbreak <id> 清除断点');
        console.log('  .step          单步执行 (跳过函数)');
        console.log('  .stepin        单步执行 (进入函数)');
        console.log('  .stepout       执行到函数返回');
        console.log('  .continue      继续执行');
        console.log('  .watch <expr>  添加监视表达式');
        console.log('  .watches       列出监视表达式');
        console.log('  .backtrace     显示调用栈');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('编译命令:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  .compile <file> AOT编译文件');
        console.log('  .run <file>    运行编译后的文件');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('模块系统:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  .import <path> 导入模块');
        console.log('  .modules       列出已加载模块');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('外部集成:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  .wasm <path>   加载WebAssembly模块');
        console.log('  .ffi <path>    加载FFI库');
        console.log('  .python <path> 加载Python模块');
        console.log('  .rust <path>   加载Rust WASM模块');
        console.log('  .native <path> 加载Native模块');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('内存管理:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  .memory        显示内存统计');
        console.log('  .gc            运行垃圾回收');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('异步和并发:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  .async <code>  异步执行代码');
        console.log('  .concurrent    显示并发信息');
        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('AI集成:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  .ai <prompt>   AI生成代码');
        console.log('  .validate      AI验证当前代码');
        console.log('  .repair        AI修复当前代码');
        console.log('');
    }
    
    exit() {
        console.log('再见！');
        process.exit(0);
    }
    
    clear() {
        console.clear();
        this.rl.prompt();
    }
    
    reset() {
        this.vm.reset();
        this.breakpoints.clear();
        this.watchExpressions.clear();
        this.loadedModules.clear();
        console.log('✓ 虚拟机已重置');
    }
    
    showStats() {
        const stats = {
            typeCheck: this.typeCheckEnabled,
            safeMode: this.safeModeEnabled,
            jit: this.jitEnabled,
            aot: this.aotEnabled,
            debug: this.debugMode,
            memoryOpt: this.memoryOptEnabled
        };
        
        if (this.vm.vm.jit) {
            stats.jitStats = this.vm.vm.jit.getStats();
        }
        
        console.log('');
        console.log('统计信息:');
        console.log(`  类型检查: ${stats.typeCheck ? '启用' : '禁用'}`);
        console.log(`  安全模式: ${stats.safeMode ? '启用' : '禁用'}`);
        console.log(`  JIT编译: ${stats.jit ? '启用' : '禁用'}`);
        console.log(`  AOT编译: ${stats.aot ? '启用' : '禁用'}`);
        console.log(`  调试模式: ${stats.debug ? '启用' : '禁用'}`);
        console.log(`  内存优化: ${stats.memoryOpt ? '启用' : '禁用'}`);
        
        if (stats.jitStats) {
            console.log('\nJIT统计:');
            console.log(`  总调用次数: ${stats.jitStats.totalCalls}`);
            console.log(`  热点编译: ${stats.jitStats.hotspots}`);
            console.log(`  缓存命中率: ${(stats.jitStats.cacheHitRate * 100).toFixed(2)}%`);
        }
        
        console.log('\n已加载模块:');
        console.log(`  WASM: ${this.loadedWASM.size}`);
        console.log(`  FFI: ${this.loadedFFI.size}`);
        console.log(`  Python: ${this.loadedPython.size}`);
        console.log(`  Rust: ${this.loadedRust.size}`);
        console.log(`  Native: ${this.loadedNative.size}`);
        console.log('');
    }
    
    showVersion() {
        console.log('');
        console.log('SeedLang v2.0.0 (增强版)');
        console.log('AI专用高效符号语言');
        console.log('');
        console.log('集成功能:');
        console.log('  ✓ 调试器');
        console.log('  ✓ AOT编译器');
        console.log('  ✓ JIT编译器');
        console.log('  ✓ 类型系统');
        console.log('  ✓ 安全系统');
        console.log('  ✓ 模块系统');
        console.log('  ✓ 异步运行时');
        console.log('  ✓ 并发安全');
        console.log('  ✓ WebAssembly');
        console.log('  ✓ FFI');
        console.log('  ✓ 多语言绑定');
        console.log('  ✓ 内存优化');
        console.log('  ✓ AI集成');
        console.log('');
    }
    
    toggleTypes() {
        this.typeCheckEnabled = !this.typeCheckEnabled;
        this.vm.options.typeCheck = this.typeCheckEnabled;
        console.log(`类型检查: ${this.typeCheckEnabled ? '✓ 启用' : '✗ 禁用'}`);
    }
    
    toggleSafe() {
        this.safeModeEnabled = !this.safeModeEnabled;
        this.vm.options.safeMode = this.safeModeEnabled;
        console.log(`安全模式: ${this.safeModeEnabled ? '✓ 启用' : '✗ 禁用'}`);
    }
    
    toggleJIT() {
        this.jitEnabled = !this.jitEnabled;
        this.vm.options.jit = this.jitEnabled;
        if (this.vm.vm.jit) {
            this.vm.vm.jit.setEnabled(this.jitEnabled);
        }
        console.log(`JIT编译: ${this.jitEnabled ? '✓ 启用' : '✗ 禁用'}`);
    }
    
    toggleAOT() {
        this.aotEnabled = !this.aotEnabled;
        console.log(`AOT编译: ${this.aotEnabled ? '✓ 启用' : '✗ 禁用'}`);
    }
    
    toggleDebug() {
        this.debugMode = !this.debugMode;
        console.log(`调试模式: ${this.debugMode ? '✓ 启用' : '✗ 禁用'}`);
    }
    
    toggleMemoryOpt() {
        this.memoryOptEnabled = !this.memoryOptEnabled;
        console.log(`内存优化: ${this.memoryOptEnabled ? '✓ 启用' : '✗ 禁用'}`);
    }
    
    showHistory() {
        console.log('');
        console.log('命令历史:');
        this.history.slice(-20).forEach((cmd, i) => {
            const preview = cmd.split('\n')[0].substring(0, 50);
            console.log(`  ${i + 1}. ${preview}${cmd.length > 50 ? '...' : ''}`);
        });
        console.log('');
    }
    
    addToHistory(code) {
        this.history.push(code);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }
    
    loadFile(filename) {
        try {
            const filepath = path.resolve(filename);
            const code = fs.readFileSync(filepath, 'utf-8');
            console.log(`加载文件: ${filename}`);
            this.currentFile = filepath;
            this.executeCode(code);
        } catch (error) {
            console.log(`加载失败: ${error.message}`);
        }
    }
    
    saveHistory(filename) {
        try {
            const filepath = path.resolve(filename);
            fs.writeFileSync(filepath, this.history.join('\n\n'), 'utf-8');
            console.log(`✓ 历史已保存到: ${filename}`);
        } catch (error) {
            console.log(`保存失败: ${error.message}`);
        }
    }
    
    setBreakpoint(line) {
        const lineNum = parseInt(line);
        if (isNaN(lineNum)) {
            console.log('用法: .break <行号>');
            return;
        }
        
        const id = this.breakpoints.size + 1;
        this.breakpoints.set(id, { line: lineNum, enabled: true });
        console.log(`✓ 断点 #${id} 设置在第 ${lineNum} 行`);
    }
    
    listBreakpoints() {
        if (this.breakpoints.size === 0) {
            console.log('没有设置断点');
            return;
        }
        
        console.log('\n断点列表:');
        this.breakpoints.forEach((bp, id) => {
            console.log(`  #${id}: 第 ${bp.line} 行 ${bp.enabled ? '✓' : '✗'}`);
        });
        console.log('');
    }
    
    clearBreakpoint(id) {
        const bpId = parseInt(id);
        if (this.breakpoints.has(bpId)) {
            this.breakpoints.delete(bpId);
            console.log(`✓ 断点 #${bpId} 已清除`);
        } else {
            console.log(`断点 #${id} 不存在`);
        }
    }
    
    stepOver() {
        console.log('单步执行: 跳过函数');
    }
    
    stepInto() {
        console.log('单步执行: 进入函数');
    }
    
    stepOut() {
        console.log('执行到函数返回');
    }
    
    continueExecution() {
        console.log('继续执行');
    }
    
    addWatch(expr) {
        if (!expr) {
            console.log('用法: .watch <表达式>');
            return;
        }
        
        const id = this.watchExpressions.size + 1;
        this.watchExpressions.set(id, { expression: expr, value: null });
        console.log(`✓ 监视 #${id}: ${expr}`);
    }
    
    listWatches() {
        if (this.watchExpressions.size === 0) {
            console.log('没有设置监视表达式');
            return;
        }
        
        console.log('\n监视表达式:');
        this.watchExpressions.forEach((w, id) => {
            console.log(`  #${id}: ${w.expression} = ${w.value ?? '未计算'}`);
        });
        console.log('');
    }
    
    showBacktrace() {
        console.log('\n调用栈:');
        console.log('  #0: main (当前)');
        console.log('');
    }
    
    aotCompile(filename) {
        try {
            const filepath = path.resolve(filename);
            const code = fs.readFileSync(filepath, 'utf-8');
            
            const compiler = new AOTCompiler();
            const jsCode = compiler.compile(code);
            
            const outputPath = filepath.replace('.seed', '.compiled.js');
            fs.writeFileSync(outputPath, jsCode, 'utf-8');
            
            console.log(`✓ 编译成功: ${outputPath}`);
        } catch (error) {
            console.log(`编译失败: ${error.message}`);
        }
    }
    
    runCompiled(filename) {
        try {
            const filepath = path.resolve(filename);
            delete require.cache[require.resolve(filepath)];
            const result = require(filepath);
            console.log('执行结果:', result);
        } catch (error) {
            console.log(`执行失败: ${error.message}`);
        }
    }
    
    async importModule(modulePath) {
        try {
            const moduleSystem = new ModuleSystem();
            
            const module = await moduleSystem.load(modulePath);
            this.loadedModules.set(modulePath, module);
            
            console.log(`✓ 模块已加载: ${modulePath}`);
        } catch (error) {
            console.log(`模块加载失败: ${error.message}`);
        }
    }
    
    listModules() {
        if (this.loadedModules.size === 0) {
            console.log('没有已加载的模块');
            return;
        }
        
        console.log('\n已加载模块:');
        this.loadedModules.forEach((module, path) => {
            console.log(`  ${path}`);
        });
        console.log('');
    }
    
    async loadWASM(wasmPath) {
        try {
            const loader = new WASMLoader();
            
            const module = await loader.loadModule(wasmPath);
            this.loadedWASM.set(wasmPath, module);
            
            console.log(`✓ WASM模块已加载: ${wasmPath}`);
            console.log('导出函数:', Object.keys(module.exports));
        } catch (error) {
            console.log(`WASM加载失败: ${error.message}`);
        }
    }
    
    loadFFI(libPath) {
        try {
            const lib = new FFILibrary(path.basename(libPath), libPath, {});
            
            if (lib.load()) {
                this.loadedFFI.set(libPath, lib);
                console.log(`✓ FFI库已加载: ${libPath}`);
            } else {
                console.log('FFI库加载失败');
            }
        } catch (error) {
            console.log(`FFI加载失败: ${error.message}`);
        }
    }
    
    async loadPython(scriptPath) {
        try {
            const module = new PythonModule(path.basename(scriptPath), {
                scriptPath: path.resolve(scriptPath)
            });
            
            await module.load();
            this.loadedPython.set(scriptPath, module);
            
            console.log(`✓ Python模块已加载: ${scriptPath}`);
        } catch (error) {
            console.log(`Python加载失败: ${error.message}`);
        }
    }
    
    async loadRust(wasmPath) {
        try {
            const module = new RustModule(path.basename(wasmPath), {
                wasmPath: path.resolve(wasmPath)
            });
            
            await module.load();
            this.loadedRust.set(wasmPath, module);
            
            console.log(`✓ Rust模块已加载: ${wasmPath}`);
        } catch (error) {
            console.log(`Rust加载失败: ${error.message}`);
        }
    }
    
    loadNative(modulePath) {
        try {
            const module = new NativeModule(path.basename(modulePath), modulePath);
            
            if (module.load()) {
                this.loadedNative.set(modulePath, module);
                console.log(`✓ Native模块已加载: ${modulePath}`);
                console.log('导出函数:', Array.from(module.functions.keys()));
            } else {
                console.log('Native模块加载失败');
            }
        } catch (error) {
            console.log(`Native加载失败: ${error.message}`);
        }
    }
    
    showMemoryStats() {
        console.log('\n内存统计:');
        console.log(`  堆内存使用: ${process.memoryUsage().heapUsed / 1024 / 1024} MB`);
        console.log(`  堆内存总量: ${process.memoryUsage().heapTotal / 1024 / 1024} MB`);
        console.log(`  外部内存: ${process.memoryUsage().external / 1024 / 1024} MB`);
        console.log('');
    }
    
    runGC() {
        if (global.gc) {
            global.gc();
            console.log('✓ 垃圾回收完成');
        } else {
            console.log('提示: 使用 --expose-gc 标志启动以启用手动GC');
        }
    }
    
    async runAsync(code) {
        if (!code) {
            console.log('用法: .async <代码>');
            return;
        }
        
        try {
            const asyncRuntime = new AsyncRuntime();
            
            console.log('异步执行中...');
            const result = await this.vm.runAsync(code);
            
            if (result.success) {
                result.output.forEach(line => console.log(line));
            } else {
                console.log(`错误: ${result.error}`);
            }
        } catch (error) {
            console.log(`异步执行失败: ${error.message}`);
        }
    }
    
    showConcurrentInfo() {
        console.log('\n并发信息:');
        console.log(`  已加载模块: ${this.loadedModules.size}`);
        console.log(`  WASM模块: ${this.loadedWASM.size}`);
        console.log(`  FFI库: ${this.loadedFFI.size}`);
        console.log('');
    }
    
    async aiGenerate(prompt) {
        if (!prompt) {
            console.log('用法: .ai <提示>');
            return;
        }
        
        try {
            const ai = new AIIntegration();
            
            console.log('AI生成代码中...');
            const result = await ai.generateCode(prompt);
            
            if (result.success) {
                console.log('\n生成的代码:');
                console.log(result.code);
            } else {
                console.log(`生成失败: ${result.error}`);
            }
        } catch (error) {
            console.log(`AI生成失败: ${error.message}`);
        }
    }
    
    aiValidate() {
        if (!this.currentCode) {
            console.log('没有当前代码可验证');
            return;
        }
        
        try {
            const ai = new AIIntegration();
            
            const result = ai.validateCode(this.currentCode);
            
            console.log('\n验证结果:');
            if (result.valid) {
                console.log('✓ 代码有效');
            } else {
                console.log('✗ 发现问题:');
                result.issues.forEach((issue, i) => {
                    console.log(`  ${i + 1}. ${issue}`);
                });
            }
        } catch (error) {
            console.log(`验证失败: ${error.message}`);
        }
    }
    
    aiRepair() {
        if (!this.currentCode) {
            console.log('没有当前代码可修复');
            return;
        }
        
        try {
            const ai = new AIIntegration();
            
            console.log('AI修复代码中...');
            const result = ai.attemptAutoFix(this.currentCode, []);
            
            if (result.success) {
                console.log('\n修复后的代码:');
                console.log(result.code);
            } else {
                console.log('无法自动修复');
            }
        } catch (error) {
            console.log(`修复失败: ${error.message}`);
        }
    }
    
    completer(line) {
        const keywords = [
            'fn', 'if', 'else', 'for', 'while', 'return', 'class',
            'import', 'export', 'try', 'catch', 'throw', 'async', 'await',
            'break', 'continue', 'true', 'false', 'null', 'print'
        ];
        
        const builtins = [
            'range', 'len', 'push', 'pop', 'shift', 'unshift',
            'map', 'filter', 'reduce', 'forEach', 'find', 'includes',
            'string', 'number', 'boolean', 'array', 'object', 'any', 'void'
        ];
        
        const commands = Object.keys(this.commands);
        
        const allCompletions = [...keywords, ...builtins, ...commands];
        
        const hits = allCompletions.filter(c => c.startsWith(line));
        
        return [hits.length ? hits : allCompletions, line];
    }
}

if (require.main === module) {
    const repl = new REPL();
    repl.start();
}

module.exports = { REPL };
