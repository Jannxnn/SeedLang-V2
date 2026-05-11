/**
 * SeedLang WebAssembly支持
 * 提供WASM模块加载和编译功能
 */

const fs = require('fs');
const path = require('path');

class WASMLoader {
    constructor() {
        this.modules = new Map();
        this.memory = null;
        this.table = null;
        this.imports = {};
    }
    
    async loadModule(wasmPath, imports = {}) {
        const absolutePath = path.resolve(wasmPath);
        
        if (this.modules.has(absolutePath)) {
            return this.modules.get(absolutePath);
        }
        
        const wasmBuffer = fs.readFileSync(absolutePath);
        const wasmModule = await WebAssembly.compile(wasmBuffer);
        
        const defaultImports = this.createDefaultImports();
        const allImports = { ...defaultImports, ...imports };
        
        const instance = await WebAssembly.instantiate(wasmModule, allImports);
        
        const module = {
            path: absolutePath,
            instance,
            exports: instance.exports,
            memory: instance.exports.memory || this.memory
        };
        
        this.modules.set(absolutePath, module);
        return module;
    }
    
    async loadFromBuffer(wasmBuffer, imports = {}) {
        const wasmModule = await WebAssembly.compile(wasmBuffer);
        
        const defaultImports = this.createDefaultImports();
        const allImports = { ...defaultImports, ...imports };
        
        const instance = await WebAssembly.instantiate(wasmModule, allImports);
        
        return {
            instance,
            exports: instance.exports,
            memory: instance.exports.memory || this.memory
        };
    }
    
    createDefaultImports() {
        return {
            env: {
                memory: this.memory || new WebAssembly.Memory({ initial: 256, maximum: 256 }),
                table: this.table || new WebAssembly.Table({ initial: 0, element: 'anyfunc' }),
                abort: (msg, file, line, column) => {
                    console.error(`WASM Abort: ${msg} at ${file}:${line}:${column}`);
                },
                log: (value) => {
                    console.log(value);
                },
                logString: (ptr, len) => {
                    const str = this.getString(ptr, len);
                    console.log(str);
                }
            },
            seed: {
                print: (value) => console.log(value),
                println: (value) => console.log(value),
                time: () => Date.now(),
                random: () => Math.random()
            }
        };
    }
    
    setMemory(memory) {
        this.memory = memory;
    }
    
    setTable(table) {
        this.table = table;
    }
    
    addImport(moduleName, name, func) {
        if (!this.imports[moduleName]) {
            this.imports[moduleName] = {};
        }
        this.imports[moduleName][name] = func;
    }
    
    call(module, functionName, ...args) {
        const wasmModule = this.modules.get(module.path || module);
        if (!wasmModule) {
            throw new Error(`Module not loaded: ${module.path || module}`);
        }
        
        const func = wasmModule.exports[functionName];
        if (!func) {
            throw new Error(`Function not found: ${functionName}`);
        }
        
        return func(...args);
    }
    
    getMemory(module) {
        const wasmModule = this.modules.get(module.path || module);
        return wasmModule ? wasmModule.memory : null;
    }
    
    readString(module, ptr, len) {
        const memory = this.getMemory(module);
        if (!memory) return '';
        
        const buffer = new Uint8Array(memory.buffer, ptr, len);
        return String.fromCharCode(...buffer);
    }
    
    writeString(module, str) {
        const memory = this.getMemory(module);
        if (!memory) return -1;
        
        const buffer = new Uint8Array(memory.buffer);
        const ptr = this.allocate(module, str.length);
        
        for (let i = 0; i < str.length; i++) {
            buffer[ptr + i] = str.charCodeAt(i);
        }
        
        return ptr;
    }
    
    allocate(module, size) {
        const wasmModule = this.modules.get(module.path || module);
        if (!wasmModule || !wasmModule.exports.allocate) {
            return -1;
        }
        
        return wasmModule.exports.allocate(size);
    }
    
    deallocate(module, ptr, size) {
        const wasmModule = this.modules.get(module.path || module);
        if (!wasmModule || !wasmModule.exports.deallocate) {
            return;
        }
        
        wasmModule.exports.deallocate(ptr, size);
    }
    
    getModuleInfo(module) {
        const wasmModule = this.modules.get(module.path || module);
        if (!wasmModule) return null;
        
        return {
            path: wasmModule.path,
            exports: Object.keys(wasmModule.exports),
            hasMemory: !!wasmModule.memory
        };
    }
    
    clear() {
        this.modules.clear();
    }
}

class WASMCompiler {
    constructor() {
        // Keep backward-compatible public fields expected by integration tests.
        this.types = new Map();
        this.functions = new Map();
        this.memory = { initial: 256, maximum: 256 };
        this.lastReport = null;
    }

    compileSeed(sourceCode, parserInstance) {
        const parser = parserInstance || new (require('../runtime/vm.js').Parser)();
        const ast = parser.parse(sourceCode);
        return this.compile(ast);
    }

    compileSeedWithReport(sourceCode, parserInstance) {
        const parser = parserInstance || new (require('../runtime/vm.js').Parser)();
        let ast;
        try {
            ast = parser.parse(sourceCode);
        } catch (error) {
            const report = this._buildCompileReportFromError(error, 'parse');
            this.lastReport = report;
            return { ok: false, wasmBuffer: null, report };
        }
        return this.compileWithReport(ast);
    }

    compileSeedAutoLower(sourceCode, parserInstance) {
        const parser = parserInstance || new (require('../runtime/vm.js').Parser)();
        let ast;
        try {
            ast = parser.parse(sourceCode);
        } catch (error) {
            const report = this._buildCompileReportFromError(error, 'parse');
            this.lastReport = report;
            return { ok: false, wasmBuffer: null, report, lowered: false, transforms: [] };
        }
        return this.compileWithAutoLower(ast);
    }

    compileWithReport(ast) {
        try {
            const wasmBuffer = this.compile(ast);
            const report = {
                ok: true,
                stage: 'compile',
                message: 'WASM compile success',
                functionName: null,
                reasonCode: null,
                suggestion: null
            };
            this.lastReport = report;
            return { ok: true, wasmBuffer, report };
        } catch (error) {
            const report = this._buildCompileReportFromError(error, 'compile');
            this.lastReport = report;
            return { ok: false, wasmBuffer: null, report };
        }
    }

    compileWithAutoLower(ast) {
        const first = this.compileWithReport(ast);
        if (first.ok) return { ...first, lowered: false, transforms: [] };

        const { ast: loweredAst, transforms } = this._autoLowerAst(ast);
        if (!transforms.length) return { ...first, lowered: false, transforms: [] };

        const retry = this.compileWithReport(loweredAst);
        if (retry.ok) {
            const report = {
                ...retry.report,
                message: `WASM compile success (auto-lowered ${transforms.length} transform(s))`,
                reasonCode: 'auto_lowered_success',
                suggestion: null
            };
            this.lastReport = report;
            return { ok: true, wasmBuffer: retry.wasmBuffer, report, lowered: true, transforms };
        }

        const report = {
            ...retry.report,
            message: `${retry.report.message} (after auto-lower attempt: ${transforms.length} transform(s))`,
            reasonCode: `${retry.report.reasonCode || 'compile_error'}_after_auto_lower`
        };
        this.lastReport = report;
        return { ok: false, wasmBuffer: null, report, lowered: true, transforms };
    }

    compile(ast) {
        if (!ast || !Array.isArray(ast.body)) {
            throw new Error('WASMCompiler.compile: invalid AST program');
        }
        const funcs = ast.body.filter((n) => n && n.type === 'function');
        if (funcs.length === 0) {
            throw new Error('WASMCompiler.compile: no function declarations found');
        }

        const typeEntries = [];
        const functionTypeIndices = [];
        const functionBodies = [];
        const exportEntries = [];
        const functionIndexByName = new Map();
        for (let i = 0; i < funcs.length; i++) {
            if (typeof funcs[i].name === 'string' && funcs[i].name.length > 0) {
                functionIndexByName.set(funcs[i].name, i);
            }
        }

        for (let i = 0; i < funcs.length; i++) {
            const fn = funcs[i];
            const params = Array.isArray(fn.params) ? fn.params.slice() : [];
            const paramSet = new Set(params);
            const assigned = this._collectAssignedNames(fn.body || []);
            const locals = [...assigned].filter((name) => !paramSet.has(name));

            const localIndex = new Map();
            params.forEach((name, idx) => localIndex.set(name, idx));
            locals.forEach((name, idx) => localIndex.set(name, params.length + idx));

            typeEntries.push({
                params: new Array(params.length).fill(0x7c), // f64
                results: [0x7c] // f64
            });
            functionTypeIndices.push(i);
            functionBodies.push(this._emitFunctionBody(fn, localIndex, locals.length, functionIndexByName));
            exportEntries.push({ name: fn.name, kind: 0x00, index: i }); // function export
        }

        const magicAndVersion = Buffer.from([
            0x00, 0x61, 0x73, 0x6d, // \0asm
            0x01, 0x00, 0x00, 0x00  // version 1
        ]);

        const sections = [
            this._buildTypeSection(typeEntries),
            this._buildFunctionSection(functionTypeIndices),
            this._buildExportSection(exportEntries),
            this._buildCodeSection(functionBodies)
        ];

        return Buffer.concat([magicAndVersion, ...sections]);
    }
    
    setMemory(initial, maximum) {
        this.memory = { initial, maximum };
    }

    _collectAssignedNames(stmts) {
        const out = new Set();
        const walkExpr = (expr) => {
            if (!expr || typeof expr !== 'object') return;
            if (expr.type === 'assign' && expr.left?.type === 'id' && typeof expr.left.name === 'string') {
                out.add(expr.left.name);
                walkExpr(expr.right);
                return;
            }
            if (expr.type === 'binary') {
                walkExpr(expr.left);
                walkExpr(expr.right);
            } else if (expr.type === 'unary') {
                walkExpr(expr.operand);
            } else if (expr.type === 'call') {
                walkExpr(expr.callee);
                for (const a of (expr.args || [])) walkExpr(a);
            }
        };
        const walkStmt = (s) => {
            if (!s || typeof s !== 'object') return;
            if (s.type === 'expr') walkExpr(s.expr);
            else if (s.type === 'assignment') walkExpr(s);
            else if (s.type === 'varDecl' && s.pattern?.type === 'id') {
                out.add(s.pattern.name);
                walkExpr(s.init);
            }
            else if (s.type === 'if') {
                walkExpr(s.condition);
                for (const x of (s.then || s.thenBody || [])) walkStmt(x);
                for (const x of (s.else || s.elseBody || [])) walkStmt(x);
            } else if (s.type === 'while') {
                walkExpr(s.condition);
                for (const x of (s.body || [])) walkStmt(x);
            } else if (s.type === 'forIn') {
                if (typeof s.keyVar === 'string') out.add(s.keyVar);
                walkExpr(s.iterable);
                for (const x of (s.body || [])) walkStmt(x);
            }
        };
        for (const s of (stmts || [])) walkStmt(s);
        return out;
    }

    _autoLowerAst(ast) {
        const transforms = [];
        const builtinMap = new Map([
            ['abs', 'abs'],
            ['sqrt', 'sqrt'],
            ['floor', 'floor'],
            ['ceil', 'ceil'],
            ['round', 'round'],
            ['min', 'min'],
            ['max', 'max']
        ]);
        const clone = JSON.parse(JSON.stringify(ast));
        const visit = (node) => {
            if (Array.isArray(node)) return node.map(visit);
            if (!node || typeof node !== 'object') return node;

            if (node.type === 'call' && node.callee?.type === 'member') {
                const obj = node.callee.object;
                const propName = this._memberPropName(node.callee);
                if (obj?.type === 'id' && obj.name === 'Math' && builtinMap.has(propName)) {
                    transforms.push({ kind: 'math_member_call_to_builtin', from: `Math.${propName}`, to: builtinMap.get(propName) });
                    return {
                        ...node,
                        callee: { type: 'id', name: builtinMap.get(propName) },
                        args: visit(node.args || [])
                    };
                }
            }

            const out = {};
            for (const [k, v] of Object.entries(node)) out[k] = visit(v);
            return out;
        };
        return { ast: visit(clone), transforms };
    }

    _memberPropName(memberNode) {
        const p = memberNode?.property;
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
            if (typeof p.name === 'string') return p.name;
            if (typeof p.value === 'string') return p.value;
        }
        return '';
    }

    _buildCompileReportFromError(error, stage) {
        const message = String(error?.message || error || 'unknown wasm compile error');
        let functionName = null;
        const m = message.match(/in\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
        if (m) functionName = m[1];
        const reasonCode = this._classifyCompileError(message, stage);
        return {
            ok: false,
            stage,
            message,
            functionName,
            reasonCode,
            suggestion: this._suggestForCompileError(reasonCode, message)
        };
    }

    _classifyCompileError(message, stage) {
        if (stage === 'parse') return 'parse_error';
        if (message.includes('unsupported expr type')) return 'unsupported_expr_type';
        if (message.includes('unsupported stmt type')) return 'unsupported_stmt_type';
        if (message.includes('unsupported binary op')) return 'unsupported_binary_op';
        if (message.includes('unknown identifier')) return 'unknown_identifier';
        if (message.includes('unknown call target')) return 'unknown_call_target';
        if (message.includes('only direct function call is supported')) return 'unsupported_call_form';
        if (message.includes('forIn currently requires')) return 'forin_non_literal_iterable';
        if (message.includes('break used outside loop')) return 'break_outside_loop';
        if (message.includes('continue used outside loop')) return 'continue_outside_loop';
        return 'compile_error';
    }

    _suggestForCompileError(reasonCode, message) {
        if (reasonCode === 'parse_error') return 'Check Seed syntax first (especially for/if shape and space-separated arguments).';
        if (reasonCode === 'unsupported_expr_type') return 'Rewrite expression to supported subset: number/id/+-*/ comparisons/logical/direct function call/math builtins.';
        if (reasonCode === 'unsupported_stmt_type') return 'Rewrite statement to supported subset: varDecl/assignment/if/while/forIn/return/break/continue.';
        if (reasonCode === 'unsupported_binary_op') return 'Supported binary ops are + - * / and comparisons/logical. Rewrite other ops.';
        if (reasonCode === 'unknown_identifier') return 'Ensure identifier is defined as parameter or assigned before use.';
        if (reasonCode === 'unknown_call_target') return 'Ensure callee is defined in same source module, or use supported builtins.';
        if (reasonCode === 'unsupported_call_form') return 'Only direct function call is supported now, e.g. foo(a b). Member-call is not supported.';
        if (reasonCode === 'forin_non_literal_iterable') return 'for-in currently requires an array literal or a literal-bound array variable.';
        if (reasonCode === 'break_outside_loop' || reasonCode === 'continue_outside_loop') return 'Use break/continue only inside while or for-in body.';
        return `Rewrite unsupported syntax based on this error: ${message}`;
    }

    _emitFunctionBody(fn, localIndex, localCount, functionIndexByName = new Map()) {
        const code = [];
        const ctrlStack = [];
        const loopStack = [];
        const constArrayBindings = new Map();
        const isStaticArrayExpr = (expr) => {
            return !!(expr && expr.type === 'array' && Array.isArray(expr.elements));
        };
        const resolveStaticArrayElements = (expr) => {
            if (!expr) return null;
            if (isStaticArrayExpr(expr)) {
                return expr.elements.slice();
            }
            if (expr.type === 'id' && constArrayBindings.has(expr.name)) {
                return constArrayBindings.get(expr.name).slice();
            }
            return null;
        };
        const emitAssignToLocal = (name, rhsExpr) => {
            emitExpr(rhsExpr);
            const idx = localIndex.get(name);
            if (idx === undefined) throw new Error(`WASM compile error in ${fn.name}: unknown assign target "${name}"`);
            code.push(0x21, ...this._u32(idx)); // local.set
        };
        const emitZeroToLocal = (name) => {
            const idx = localIndex.get(name);
            if (idx === undefined) throw new Error(`WASM compile error in ${fn.name}: unknown assign target "${name}"`);
            code.push(0x44, ...this._encodeF64(0)); // f64.const 0
            code.push(0x21, ...this._u32(idx)); // local.set
        };
        const emitCondition = (expr) => {
            if (!expr) throw new Error(`WASM compile error in ${fn.name}: empty if condition`);
            if (expr.type === 'binary' && expr.op === 'and') {
                emitCondition(expr.left);
                code.push(0x04, 0x7f); // if (result i32)
                ctrlStack.push({ kind: 'if_cond' });
                emitCondition(expr.right);
                code.push(0x05); // else
                code.push(0x41, 0x00); // i32.const 0
                code.push(0x0b); // end
                ctrlStack.pop();
                return;
            }
            if (expr.type === 'binary' && expr.op === 'or') {
                emitCondition(expr.left);
                code.push(0x04, 0x7f); // if (result i32)
                ctrlStack.push({ kind: 'if_cond' });
                code.push(0x41, 0x01); // i32.const 1
                code.push(0x05); // else
                emitCondition(expr.right);
                code.push(0x0b); // end
                ctrlStack.pop();
                return;
            }
            if (expr.type === 'binary' && ['<', '<=', '>', '>=', '==', '!='].includes(expr.op)) {
                emitExpr(expr.left);
                emitExpr(expr.right);
                if (expr.op === '<') code.push(0x63); // f64.lt -> i32
                else if (expr.op === '<=') code.push(0x65); // f64.le
                else if (expr.op === '>') code.push(0x64); // f64.gt
                else if (expr.op === '>=') code.push(0x66); // f64.ge
                else if (expr.op === '==') code.push(0x61); // f64.eq
                else if (expr.op === '!=') code.push(0x62); // f64.ne
                return;
            }
            if (expr.type === 'unary' && expr.op === 'not') {
                emitCondition(expr.operand);
                code.push(0x45); // i32.eqz
                return;
            }
            // Fallback truthy check: expr != 0.0
            emitExpr(expr);
            code.push(0x44, ...this._encodeF64(0), 0x62); // f64.const 0 ; f64.ne
        };

        const emitExpr = (expr) => {
            if (!expr) throw new Error(`WASM compile error in ${fn.name}: empty expression`);
            const tryEmitBuiltinCall = (calleeName, args) => {
                const n = Array.isArray(args) ? args.length : 0;
                if (calleeName === 'abs' && n === 1) {
                    emitExpr(args[0]);
                    code.push(0x99); // f64.abs
                    return true;
                }
                if (calleeName === 'sqrt' && n === 1) {
                    emitExpr(args[0]);
                    code.push(0x9f); // f64.sqrt
                    return true;
                }
                if (calleeName === 'floor' && n === 1) {
                    emitExpr(args[0]);
                    code.push(0x9c); // f64.floor
                    return true;
                }
                if (calleeName === 'ceil' && n === 1) {
                    emitExpr(args[0]);
                    code.push(0x9b); // f64.ceil
                    return true;
                }
                if (calleeName === 'round' && n === 1) {
                    emitExpr(args[0]);
                    code.push(0x9e); // f64.nearest
                    return true;
                }
                if (calleeName === 'min' && n === 2) {
                    emitExpr(args[0]);
                    emitExpr(args[1]);
                    code.push(0xa4); // f64.min
                    return true;
                }
                if (calleeName === 'max' && n === 2) {
                    emitExpr(args[0]);
                    emitExpr(args[1]);
                    code.push(0xa5); // f64.max
                    return true;
                }
                return false;
            };
            if (expr.type === 'number') {
                code.push(0x44, ...this._encodeF64(expr.value)); // f64.const
                return;
            }
            if (expr.type === 'id') {
                if (!localIndex.has(expr.name)) throw new Error(`WASM compile error in ${fn.name}: unknown identifier "${expr.name}"`);
                code.push(0x20, ...this._u32(localIndex.get(expr.name))); // local.get
                return;
            }
            if (expr.type === 'call') {
                if (!expr.callee || expr.callee.type !== 'id') {
                    throw new Error(`WASM compile error in ${fn.name}: only direct function call is supported`);
                }
                const calleeName = expr.callee.name;
                if (tryEmitBuiltinCall(calleeName, expr.args || [])) return;
                const targetIndex = functionIndexByName.get(calleeName);
                if (targetIndex === undefined) {
                    throw new Error(`WASM compile error in ${fn.name}: unknown call target "${calleeName}"`);
                }
                for (const a of (expr.args || [])) emitExpr(a);
                code.push(0x10, ...this._u32(targetIndex)); // call
                return;
            }
            if (expr.type === 'binary') {
                if (['<', '<=', '>', '>=', '==', '!=', 'and', 'or'].includes(expr.op)) {
                    emitCondition(expr);
                    code.push(0xb7); // f64.convert_i32_s
                    return;
                }
                emitExpr(expr.left);
                emitExpr(expr.right);
                if (expr.op === '+') code.push(0xa0); // f64.add
                else if (expr.op === '-') code.push(0xa1); // f64.sub
                else if (expr.op === '*') code.push(0xa2); // f64.mul
                else if (expr.op === '/') code.push(0xa3); // f64.div
                else throw new Error(`WASM compile error in ${fn.name}: unsupported binary op "${expr.op}"`);
                return;
            }
            if (expr.type === 'unary' && expr.op === '-') {
                code.push(0x44, ...this._encodeF64(0));
                emitExpr(expr.operand);
                code.push(0xa1); // f64.sub
                return;
            }
            if (expr.type === 'unary' && expr.op === 'not') {
                emitCondition(expr);
                code.push(0xb7); // f64.convert_i32_s
                return;
            }
            throw new Error(`WASM compile error in ${fn.name}: unsupported expr type "${expr.type}"`);
        };

        const emitStmt = (s) => {
            if (!s) return;
            if (s.type === 'return') {
                emitExpr(s.value);
                code.push(0x0f); // return
                return;
            }
            if (s.type === 'expr' && s.expr?.type === 'assign' && s.expr.left?.type === 'id') {
                if (isStaticArrayExpr(s.expr.right)) {
                    constArrayBindings.set(s.expr.left.name, resolveStaticArrayElements(s.expr.right));
                    emitZeroToLocal(s.expr.left.name);
                } else {
                    constArrayBindings.delete(s.expr.left.name);
                    emitAssignToLocal(s.expr.left.name, s.expr.right);
                }
                return;
            }
            if (s.type === 'assignment' && s.left?.type === 'id') {
                const rhs = s.right || s.value;
                if (isStaticArrayExpr(rhs)) {
                    constArrayBindings.set(s.left.name, resolveStaticArrayElements(rhs));
                    emitZeroToLocal(s.left.name);
                } else {
                    constArrayBindings.delete(s.left.name);
                    emitAssignToLocal(s.left.name, rhs);
                }
                return;
            }
            if (s.type === 'varDecl' && s.pattern?.type === 'id') {
                if (isStaticArrayExpr(s.init)) {
                    constArrayBindings.set(s.pattern.name, resolveStaticArrayElements(s.init));
                    emitZeroToLocal(s.pattern.name);
                } else {
                    constArrayBindings.delete(s.pattern.name);
                    emitAssignToLocal(s.pattern.name, s.init);
                }
                return;
            }
            if (s.type === 'if') {
                emitCondition(s.condition);
                code.push(0x04, 0x40); // if (blocktype empty)
                ctrlStack.push({ kind: 'if' });
                for (const t of (s.then || s.thenBody || [])) emitStmt(t);
                const elseBody = s.else || s.elseBody || [];
                if (Array.isArray(elseBody) && elseBody.length > 0) {
                    code.push(0x05); // else
                    for (const e of elseBody) emitStmt(e);
                }
                code.push(0x0b); // end
                ctrlStack.pop();
                return;
            }
            if (s.type === 'while') {
                // block { loop { if (!cond) break; body; continue; } }
                code.push(0x02, 0x40); // block void
                ctrlStack.push({ kind: 'while_break' });
                const breakCtrlIndex = ctrlStack.length - 1;
                code.push(0x03, 0x40); // loop void
                ctrlStack.push({ kind: 'while_continue' });
                const continueCtrlIndex = ctrlStack.length - 1;
                loopStack.push({ breakCtrlIndex, continueCtrlIndex });
                emitCondition(s.condition);
                code.push(0x45); // i32.eqz
                code.push(0x0d, ...this._u32(1)); // br_if 1 (break out of block)
                for (const b of (s.body || [])) emitStmt(b);
                code.push(0x0c, ...this._u32(0)); // br 0 (continue loop)
                code.push(0x0b); // end loop
                ctrlStack.pop();
                code.push(0x0b); // end block
                ctrlStack.pop();
                loopStack.pop();
                return;
            }
            if (s.type === 'forIn') {
                if (typeof s.keyVar !== 'string') {
                    throw new Error(`WASM compile error in ${fn.name}: forIn missing keyVar`);
                }
                const loopVarIdx = localIndex.get(s.keyVar);
                if (loopVarIdx === undefined) {
                    throw new Error(`WASM compile error in ${fn.name}: forIn loop var "${s.keyVar}" not found`);
                }
                const values = resolveStaticArrayElements(s.iterable);
                if (!values) {
                    throw new Error(`WASM compile error in ${fn.name}: forIn currently requires array literal or literal-bound array`);
                }
                // for-in lowering:
                // block(for-break) { block(iter-continue){ loopVar=elem; body } ... }
                code.push(0x02, 0x40); // block void
                ctrlStack.push({ kind: 'forin_break' });
                const breakCtrlIndex = ctrlStack.length - 1;
                for (const elemExpr of values) {
                    code.push(0x02, 0x40); // block void (continue target for this iteration)
                    ctrlStack.push({ kind: 'forin_continue' });
                    const continueCtrlIndex = ctrlStack.length - 1;
                    emitExpr(elemExpr);
                    code.push(0x21, ...this._u32(loopVarIdx)); // local.set loopVar
                    loopStack.push({ breakCtrlIndex, continueCtrlIndex });
                    for (const b of (s.body || [])) emitStmt(b);
                    loopStack.pop();
                    code.push(0x0b); // end iteration block
                    ctrlStack.pop();
                }
                code.push(0x0b); // end for-break block
                ctrlStack.pop();
                return;
            }
            if (s.type === 'Break') {
                const loop = loopStack[loopStack.length - 1];
                if (!loop) throw new Error(`WASM compile error in ${fn.name}: break used outside loop`);
                const depth = ctrlStack.length - 1 - loop.breakCtrlIndex;
                if (depth < 0) throw new Error(`WASM compile error in ${fn.name}: invalid break depth`);
                code.push(0x0c, ...this._u32(depth)); // br depth
                return;
            }
            if (s.type === 'Continue') {
                const loop = loopStack[loopStack.length - 1];
                if (!loop) throw new Error(`WASM compile error in ${fn.name}: continue used outside loop`);
                const depth = ctrlStack.length - 1 - loop.continueCtrlIndex;
                if (depth < 0) throw new Error(`WASM compile error in ${fn.name}: invalid continue depth`);
                code.push(0x0c, ...this._u32(depth)); // br depth
                return;
            }
            if (s.type === 'expr') {
                emitExpr(s.expr);
                code.push(0x1a); // drop
                return;
            }
            throw new Error(`WASM compile error in ${fn.name}: unsupported stmt type "${s.type}"`);
        };

        for (const s of (fn.body || [])) emitStmt(s);

        // Ensure function returns f64 even if user omitted return.
        code.push(0x44, ...this._encodeF64(0), 0x0f);
        code.push(0x0b); // end

        const localDecls = [];
        if (localCount > 0) {
            localDecls.push(...this._u32(1)); // one local declaration group
            localDecls.push(...this._u32(localCount));
            localDecls.push(0x7c); // f64
        } else {
            localDecls.push(...this._u32(0));
        }

        const body = [...localDecls, ...code];
        return Buffer.from([...this._u32(body.length), ...body]);
    }

    _buildTypeSection(typeEntries) {
        const payload = [];
        payload.push(...this._u32(typeEntries.length));
        for (const t of typeEntries) {
            payload.push(0x60); // func type
            payload.push(...this._u32(t.params.length), ...t.params);
            payload.push(...this._u32(t.results.length), ...t.results);
        }
        return this._section(1, Buffer.from(payload));
    }

    _buildFunctionSection(typeIndices) {
        const payload = [];
        payload.push(...this._u32(typeIndices.length));
        for (const ti of typeIndices) payload.push(...this._u32(ti));
        return this._section(3, Buffer.from(payload));
    }

    _buildExportSection(exports) {
        const payload = [];
        payload.push(...this._u32(exports.length));
        for (const e of exports) {
            const nameBytes = Buffer.from(e.name || '', 'utf8');
            payload.push(...this._u32(nameBytes.length), ...nameBytes);
            payload.push(e.kind);
            payload.push(...this._u32(e.index));
        }
        return this._section(7, Buffer.from(payload));
    }

    _buildCodeSection(functionBodies) {
        const payload = [];
        payload.push(...this._u32(functionBodies.length));
        for (const body of functionBodies) payload.push(...body);
        return this._section(10, Buffer.from(payload));
    }

    _section(sectionId, payload) {
        return Buffer.from([sectionId, ...this._u32(payload.length), ...payload]);
    }

    _u32(n) {
        let v = Number(n >>> 0);
        const out = [];
        do {
            let b = v & 0x7f;
            v >>>= 7;
            if (v !== 0) b |= 0x80;
            out.push(b);
        } while (v !== 0);
        return out;
    }

    _encodeF64(value) {
        const buf = Buffer.allocUnsafe(8);
        buf.writeDoubleLE(Number(value), 0);
        return [...buf];
    }
}

class WASMRuntime {
    constructor() {
        this.loader = new WASMLoader();
        this.modules = new Map();
    }
    
    async loadModule(name, wasmPath, imports = {}) {
        const module = await this.loader.loadModule(wasmPath, imports);
        this.modules.set(name, module);
        return module;
    }
    
    async loadFromBuffer(name, wasmBuffer, imports = {}) {
        const module = await this.loader.loadFromBuffer(wasmBuffer, imports);
        this.modules.set(name, module);
        return module;
    }
    
    call(moduleName, functionName, ...args) {
        const module = this.modules.get(moduleName);
        if (!module) {
            throw new Error(`Module not loaded: ${moduleName}`);
        }
        
        return this.loader.call(module, functionName, ...args);
    }
    
    getModule(name) {
        return this.modules.get(name);
    }
    
    hasModule(name) {
        return this.modules.has(name);
    }
    
    readString(moduleName, ptr, len) {
        const module = this.modules.get(moduleName);
        return this.loader.readString(module, ptr, len);
    }
    
    writeString(moduleName, str) {
        const module = this.modules.get(moduleName);
        return this.loader.writeString(module, str);
    }
    
    getStats() {
        return {
            loadedModules: this.modules.size,
            moduleNames: Array.from(this.modules.keys())
        };
    }
    
    clear() {
        this.modules.clear();
        this.loader.clear();
    }
}

module.exports = {
    WASMLoader,
    WASMCompiler,
    WASMRuntime
};
