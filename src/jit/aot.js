/**
 * SeedLang AOT 编译器
 * 提前编译源代码为优化后的可执行格式
 */

const path = require('path');
const fs = require('fs');

class AOTCompiler {
    constructor(options = {}) {
        this.optimizationLevel = options.optimizationLevel || 2;
        this.target = options.target || 'bytecode';
        this.outputFormat = options.outputFormat || 'binary';
        
        this.modules = new Map();
        this.compiledUnits = new Map();
        this.dependencies = new Map();
        
        this.stats = {
            modulesCompiled: 0,
            functionsOptimized: 0,
            bytesGenerated: 0,
            compileTime: 0
        };
    }

    compile(source, options = {}) {
        const startTime = Date.now();
        
        const ast = this.parse(source);
        const optimized = this.optimize(ast);
        const compiled = this.generateCode(optimized, options);
        
        this.stats.compileTime = Date.now() - startTime;
        
        return {
            success: true,
            code: compiled.code,
            metadata: compiled.metadata,
            stats: this.stats
        };
    }

    compileFile(filePath, options = {}) {
        const source = fs.readFileSync(filePath, 'utf-8');
        const result = this.compile(source, { ...options, filePath });
        
        if (result.success && options.outputPath) {
            this.writeOutput(result, options.outputPath, options.outputFormat || this.outputFormat);
        }
        
        return result;
    }

    compileProject(projectPath, options = {}) {
        const entryPoint = options.entry || 'main.seed';
        const files = this.collectSourceFiles(projectPath);
        
        for (const file of files) {
            this.compileModule(file, projectPath);
        }
        
        const linked = this.link(entryPoint);
        
        return {
            success: true,
            modules: this.modules.size,
            output: linked,
            stats: this.stats
        };
    }

    parse(source) {
        return {
            type: 'Program',
            body: this.parseStatements(source),
            source
        };
    }

    parseStatements(source) {
        const statements = [];
        const lines = source.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('//')) {
                statements.push(this.parseStatement(trimmed));
            }
        }
        
        return statements;
    }

    parseStatement(line) {
        if (line.startsWith('fn ')) {
            return this.parseFunction(line);
        }
        if (line.startsWith('let ') || line.startsWith('var ')) {
            return this.parseVariable(line);
        }
        if (line.startsWith('if ')) {
            return this.parseIf(line);
        }
        if (line.startsWith('while ')) {
            return this.parseWhile(line);
        }
        if (line.startsWith('return ')) {
            return this.parseReturn(line);
        }
        if (line.includes('=')) {
            return this.parseAssignment(line);
        }
        
        return { type: 'ExpressionStmt', expression: this.parseExpression(line) };
    }

    parseFunction(line) {
        const match = line.match(/fn\s+(\w+)\s*\(([^)]*)\)\s*\{?/);
        if (match) {
            return {
                type: 'FunctionDecl',
                name: match[1],
                params: match[2].split(',').map(p => p.trim()).filter(Boolean),
                body: []
            };
        }
        return { type: 'FunctionDecl', name: 'anonymous', params: [], body: [] };
    }

    parseVariable(line) {
        const match = line.match(/(let|var)\s+(\w+)\s*=\s*(.+)/);
        if (match) {
            return {
                type: 'VariableDecl',
                kind: match[1],
                name: match[2],
                init: this.parseExpression(match[3])
            };
        }
        return { type: 'VariableDecl', name: '', init: null };
    }

    parseIf(line) {
        const match = line.match(/if\s+\((.+)\)\s*\{?/);
        if (match) {
            return {
                type: 'IfStmt',
                test: this.parseExpression(match[1]),
                consequent: [],
                alternate: null
            };
        }
        return { type: 'IfStmt', test: null, consequent: [] };
    }

    parseWhile(line) {
        const match = line.match(/while\s+\((.+)\)\s*\{?/);
        if (match) {
            return {
                type: 'WhileStmt',
                test: this.parseExpression(match[1]),
                body: []
            };
        }
        return { type: 'WhileStmt', test: null, body: [] };
    }

    parseReturn(line) {
        const match = line.match(/return\s+(.+)/);
        if (match) {
            return {
                type: 'ReturnStmt',
                value: this.parseExpression(match[1])
            };
        }
        return { type: 'ReturnStmt', value: null };
    }

    parseAssignment(line) {
        const match = line.match(/(\w+)\s*=\s*(.+)/);
        if (match) {
            return {
                type: 'Assignment',
                name: match[1],
                value: this.parseExpression(match[2])
            };
        }
        return { type: 'Assignment', name: '', value: null };
    }

    parseExpression(expr) {
        expr = expr.trim();
        
        if (/^-?\d+(\.\d+)?$/.test(expr)) {
            return { type: 'Literal', value: parseFloat(expr) };
        }
        
        if (expr.startsWith('"') || expr.startsWith("'")) {
            return { type: 'Literal', value: expr.slice(1, -1) };
        }
        
        if (expr === 'true' || expr === 'false') {
            return { type: 'Literal', value: expr === 'true' };
        }
        
        const binaryOps = ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||'];
        for (const op of binaryOps) {
            const parts = this.splitBinary(expr, op);
            if (parts) {
                return {
                    type: 'BinaryExpr',
                    operator: op,
                    left: this.parseExpression(parts.left),
                    right: this.parseExpression(parts.right)
                };
            }
        }
        
        const callMatch = expr.match(/(\w+)\s*\(([^)]*)\)/);
        if (callMatch) {
            return {
                type: 'CallExpr',
                callee: { type: 'Identifier', name: callMatch[1] },
                arguments: callMatch[2].split(',').map(a => this.parseExpression(a.trim())).filter(a => a.type)
            };
        }
        
        return { type: 'Identifier', name: expr };
    }

    splitBinary(expr, op) {
        let depth = 0;
        let inString = false;
        let stringChar = '';
        
        for (let i = expr.length - 1; i >= 0; i--) {
            const c = expr[i];
            
            if (inString) {
                if (c === stringChar) inString = false;
                continue;
            }
            
            if (c === '"' || c === "'") {
                inString = true;
                stringChar = c;
                continue;
            }
            
            if (c === ')' || c === ']' || c === '}') depth++;
            if (c === '(' || c === '[' || c === '{') depth--;
            
            if (depth === 0) {
                const opLen = op.length;
                if (expr.substr(i - opLen + 1, opLen) === op) {
                    const left = expr.substr(0, i - opLen + 1).trim();
                    const right = expr.substr(i + 1).trim();
                    if (left && right) {
                        return { left, right };
                    }
                }
            }
        }
        
        return null;
    }

    optimize(ast) {
        let optimized = ast;
        
        optimized = this.constantFolding(optimized);
        optimized = this.deadCodeElimination(optimized);
        optimized = this.inlineExpansion(optimized);
        optimized = this.loopOptimization(optimized);
        
        this.stats.functionsOptimized = this.countFunctions(optimized);
        
        return optimized;
    }

    constantFolding(ast) {
        const fold = (node) => {
            if (!node || typeof node !== 'object') return node;

            if (node.type === 'BinaryExpr') {
                const left = fold(node.left);
                const right = fold(node.right);

                if (left.type === 'Literal' && right.type === 'Literal') {
                    const result = this.evalBinary(node.operator, left.value, right.value);
                    if (result !== null) {
                        return { type: 'Literal', value: result };
                    }
                }

                return { ...node, left, right };
            }

            return this.mapNode(node, fold);
        };

        return fold(ast);
    }

    deadCodeElimination(ast) {
        const used = new Set();
        
        const collectUsed = (node) => {
            if (!node || typeof node !== 'object') return;
            
            if (node.type === 'Identifier') {
                used.add(node.name);
            }
            
            this.forEachNode(node, collectUsed);
        };

        collectUsed(ast);

        const eliminate = (node) => {
            if (!node || typeof node !== 'object') return node;

            if (node.type === 'VariableDecl' && !used.has(node.name)) {
                return null;
            }

            return this.mapNode(node, eliminate);
        };

        return eliminate(ast);
    }

    inlineExpansion(ast) {
        const functions = new Map();
        
        this.forEachNode(ast, (node) => {
            if (node.type === 'FunctionDecl' && node.name) {
                functions.set(node.name, node);
            }
        });

        const inline = (node) => {
            if (!node || typeof node !== 'object') return node;

            if (node.type === 'CallExpr' && 
                node.callee && 
                node.callee.type === 'Identifier' &&
                functions.has(node.callee.name)) {
                
                const fn = functions.get(node.callee.name);
                if (this.canInline(fn)) {
                    return this.inlineFunction(fn, node.arguments);
                }
            }

            return this.mapNode(node, inline);
        };

        return inline(ast);
    }

    canInline(fn) {
        const bodySize = this.countNodes(fn.body);
        return bodySize < 10;
    }

    inlineFunction(fn, args) {
        const body = JSON.parse(JSON.stringify(fn.body));
        const paramMap = new Map();
        
        fn.params.forEach((param, i) => {
            paramMap.set(param, args[i]);
        });

        const substitute = (node) => {
            if (!node || typeof node !== 'object') return node;

            if (node.type === 'Identifier' && paramMap.has(node.name)) {
                return paramMap.get(node.name);
            }

            return this.mapNode(node, substitute);
        };

        return substitute(body);
    }

    loopOptimization(ast) {
        const optimize = (node) => {
            if (!node || typeof node !== 'object') return node;

            if (node.type === 'WhileStmt' || node.type === 'ForStmt') {
                return this.optimizeLoop(node);
            }

            return this.mapNode(node, optimize);
        };

        return optimize(ast);
    }

    optimizeLoop(loop) {
        return {
            ...loop,
            unrolled: this.canUnroll(loop) ? this.unrollLoop(loop) : null,
            vectorized: false
        };
    }

    canUnroll(loop) {
        return false;
    }

    unrollLoop(loop) {
        return loop;
    }

    generateCode(ast, options = {}) {
        switch (this.target) {
            case 'bytecode':
                return this.generateBytecode(ast);
            case 'javascript':
                return this.generateJavaScript(ast);
            case 'wasm':
                return this.generateWasm(ast);
            default:
                return this.generateBytecode(ast);
        }
    }

    generateBytecode(ast) {
        const bytecode = [];
        const constants = [];
        const functions = [];
        
        const generate = (node) => {
            if (!node || typeof node !== 'object') return;

            switch (node.type) {
                case 'Program':
                    const body = Array.isArray(node.body) ? node.body : [];
                    body.forEach(generate);
                    bytecode.push({ op: 'HALT' });
                    break;

                case 'FunctionDecl':
                    const fnStart = bytecode.length;
                    functions.push({
                        name: node.name,
                        start: fnStart,
                        params: node.params
                    });
                    const fnBody = Array.isArray(node.body) ? node.body : [];
                    fnBody.forEach(generate);
                    bytecode.push({ op: 'RET' });
                    break;

                case 'VariableDecl':
                    generate(node.init);
                    bytecode.push({ op: 'STORE', name: node.name });
                    break;

                case 'Assignment':
                    generate(node.value);
                    bytecode.push({ op: 'STORE', name: node.name });
                    break;

                case 'BinaryExpr':
                    generate(node.left);
                    generate(node.right);
                    const op = {
                        '+': 'ADD',
                        '-': 'SUB',
                        '*': 'MUL',
                        '/': 'DIV',
                        '%': 'MOD',
                        '==': 'EQ',
                        '!=': 'NE',
                        '<': 'LT',
                        '>': 'GT',
                        '<=': 'LE',
                        '>=': 'GE'
                    }[node.operator] || 'ADD';
                    bytecode.push({ op });
                    break;

                case 'CallExpr':
                    node.arguments.forEach(generate);
                    generate(node.callee);
                    bytecode.push({ op: 'CALL', argc: node.arguments.length });
                    break;

                case 'Identifier':
                    bytecode.push({ op: 'LOAD', name: node.name });
                    break;

                case 'Literal':
                    const idx = constants.length;
                    constants.push(node.value);
                    bytecode.push({ op: 'CONST', idx });
                    break;

                case 'IfStmt':
                    generate(node.test);
                    const elseJump = bytecode.length;
                    bytecode.push({ op: 'JZ', target: -1 });
                    node.consequent.forEach(generate);
                    if (node.alternate) {
                        const endJump = bytecode.length;
                        bytecode.push({ op: 'JMP', target: -1 });
                        bytecode[elseJump].target = bytecode.length;
                        node.alternate.forEach(generate);
                        bytecode[endJump].target = bytecode.length;
                    } else {
                        bytecode[elseJump].target = bytecode.length;
                    }
                    break;

                case 'WhileStmt':
                    const loopStart = bytecode.length;
                    generate(node.test);
                    const loopJump = bytecode.length;
                    bytecode.push({ op: 'JZ', target: -1 });
                    node.body.forEach(generate);
                    bytecode.push({ op: 'JMP', target: loopStart });
                    bytecode[loopJump].target = bytecode.length;
                    break;

                case 'ReturnStmt':
                    if (node.value) generate(node.value);
                    bytecode.push({ op: 'RET' });
                    break;

                default:
                    this.forEachNode(node, generate);
            }
        };

        generate(ast);

        this.stats.bytesGenerated = bytecode.length * 8 + constants.length * 8;
        this.stats.modulesCompiled++;

        return {
            code: this.serializeBytecode(bytecode, constants, functions),
            metadata: {
                bytecode,
                constants,
                functions,
                stats: this.stats
            }
        };
    }

    serializeBytecode(bytecode, constants, functions) {
        const buffer = Buffer.alloc(1024 * 1024);
        let offset = 0;

        buffer.writeUInt32LE(0x53454544, offset);
        offset += 4;

        buffer.writeUInt32LE(1, offset);
        offset += 4;

        buffer.writeUInt32LE(bytecode.length, offset);
        offset += 4;

        for (const instr of bytecode) {
            buffer.writeUInt8(this.opcodeToByte(instr.op), offset++);
            if (instr.name) {
                buffer.write(instr.name, offset);
                offset += 32;
            }
            if (instr.target !== undefined) {
                buffer.writeUInt32LE(instr.target, offset);
                offset += 4;
            }
            if (instr.idx !== undefined) {
                buffer.writeUInt32LE(instr.idx, offset);
                offset += 4;
            }
            if (instr.argc !== undefined) {
                buffer.writeUInt8(instr.argc, offset++);
            }
        }

        return buffer.slice(0, offset);
    }

    opcodeToByte(op) {
        const opcodes = {
            'HALT': 0x00,
            'LOAD': 0x01,
            'STORE': 0x02,
            'CONST': 0x03,
            'ADD': 0x10,
            'SUB': 0x11,
            'MUL': 0x12,
            'DIV': 0x13,
            'MOD': 0x14,
            'EQ': 0x20,
            'NE': 0x21,
            'LT': 0x22,
            'GT': 0x23,
            'LE': 0x24,
            'GE': 0x25,
            'JMP': 0x30,
            'JZ': 0x31,
            'CALL': 0x40,
            'RET': 0x41
        };
        return opcodes[op] || 0x00;
    }

    generateJavaScript(ast) {
        const generate = (node) => {
            if (!node || typeof node !== 'object') return '';

            switch (node.type) {
                case 'Program':
                    const progBody = Array.isArray(node.body) ? node.body : [];
                    return progBody.map(generate).join('\n');

                case 'FunctionDecl':
                    const params = Array.isArray(node.params) ? node.params.join(', ') : '';
                    const fnBody = Array.isArray(node.body) ? node.body : [];
                    const body = fnBody.map(generate).join('\n');
                    return `function ${node.name}(${params}) {\n${body}\n}`;

                case 'VariableDecl':
                    return `${node.kind} ${node.name} = ${generate(node.init)};`;

                case 'Assignment':
                    return `${node.name} = ${generate(node.value)};`;

                case 'BinaryExpr':
                    return `(${generate(node.left)} ${node.operator} ${generate(node.right)})`;

                case 'CallExpr':
                    const args = node.arguments.map(generate).join(', ');
                    return `${generate(node.callee)}(${args})`;

                case 'Identifier':
                    return node.name;

                case 'Literal':
                    return JSON.stringify(node.value);

                case 'IfStmt':
                    const then = node.consequent.map(generate).join('\n');
                    const els = node.alternate ? `else {\n${node.alternate.map(generate).join('\n')}\n}` : '';
                    return `if (${generate(node.test)}) {\n${then}\n} ${els}`;

                case 'WhileStmt':
                    const loopBody = node.body.map(generate).join('\n');
                    return `while (${generate(node.test)}) {\n${loopBody}\n}`;

                case 'ReturnStmt':
                    return `return ${generate(node.value)};`;

                default:
                    return '';
            }
        };

        return {
            code: generate(ast),
            metadata: { type: 'javascript' }
        };
    }

    generateWasm(ast) {
        return {
            code: Buffer.from([]),
            metadata: {
                type: 'wasm',
                message: 'WASM generation requires additional toolchain'
            }
        };
    }

    compileModule(filePath, projectPath) {
        const source = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(projectPath, filePath);
        
        const result = this.compile(source);
        
        this.modules.set(relativePath, {
            source,
            ast: result.metadata,
            compiled: result.code
        });
        
        return result;
    }

    collectSourceFiles(projectPath) {
        const files = [];
        
        const collect = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        collect(fullPath);
                    }
                } else if (entry.name.endsWith('.seed')) {
                    files.push(fullPath);
                }
            }
        };
        
        collect(projectPath);
        return files;
    }

    link(entryPoint) {
        const linked = {
            entry: entryPoint,
            modules: {},
            bytecode: []
        };

        for (const [name, module] of this.modules) {
            linked.modules[name] = module.compiled;
        }

        return linked;
    }

    writeOutput(result, outputPath, format) {
        switch (format) {
            case 'binary':
                fs.writeFileSync(outputPath, result.code);
                break;
            case 'json':
                fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
                break;
            case 'text':
                fs.writeFileSync(outputPath, result.code.toString());
                break;
        }
    }

    evalBinary(op, a, b) {
        switch (op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': return b !== 0 ? a / b : null;
            case '%': return b !== 0 ? a % b : null;
            case '==': return a === b;
            case '!=': return a !== b;
            case '<': return a < b;
            case '>': return a > b;
            case '<=': return a <= b;
            case '>=': return a >= b;
            case '&&': return a && b;
            case '||': return a || b;
            default: return null;
        }
    }

    countFunctions(node) {
        let count = 0;
        this.forEachNode(node, (n) => {
            if (n.type === 'FunctionDecl') count++;
        });
        return count;
    }

    countNodes(node) {
        if (!node || typeof node !== 'object') return 0;
        if (Array.isArray(node)) {
            return node.reduce((sum, n) => sum + this.countNodes(n), 0);
        }
        let count = 1;
        for (const value of Object.values(node)) {
            if (typeof value === 'object') {
                count += this.countNodes(value);
            }
        }
        return count;
    }

    mapNode(node, fn) {
        if (!node || typeof node !== 'object') return node;
        
        const result = { ...node };
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === 'object' && value !== null) {
                result[key] = fn(value);
            }
        }
        return result;
    }

    forEachNode(node, fn) {
        if (!node || typeof node !== 'object') return;
        
        if (Array.isArray(node)) {
            node.forEach(fn);
        } else {
            for (const value of Object.values(node)) {
                if (typeof value === 'object' && value !== null) {
                    fn(value);
                }
            }
        }
    }
}

class AOTModule {
    constructor(name) {
        this.name = name;
        this.exports = new Map();
        this.imports = new Map();
        this.functions = new Map();
        this.globals = new Map();
    }

    addExport(name, value) {
        this.exports.set(name, value);
    }

    addImport(name, module) {
        this.imports.set(name, module);
    }

    addFunction(name, fn) {
        this.functions.set(name, fn);
    }

    addGlobal(name, value) {
        this.globals.set(name, value);
    }

    serialize() {
        return {
            name: this.name,
            exports: Object.fromEntries(this.exports),
            imports: Object.fromEntries(this.imports),
            functions: Object.fromEntries(this.functions),
            globals: Object.fromEntries(this.globals)
        };
    }

    static deserialize(data) {
        const module = new AOTModule(data.name);
        for (const [k, v] of Object.entries(data.exports || {})) {
            module.exports.set(k, v);
        }
        for (const [k, v] of Object.entries(data.imports || {})) {
            module.imports.set(k, v);
        }
        for (const [k, v] of Object.entries(data.functions || {})) {
            module.functions.set(k, v);
        }
        for (const [k, v] of Object.entries(data.globals || {})) {
            module.globals.set(k, v);
        }
        return module;
    }
}

class AOTLoader {
    constructor() {
        this.loadedModules = new Map();
        this.cache = new Map();
    }

    load(buffer) {
        const magic = buffer.readUInt32LE(0);
        if (magic !== 0x53454544) {
            throw new Error('Invalid AOT module format');
        }

        const version = buffer.readUInt32LE(4);
        const bytecodeLength = buffer.readUInt32LE(8);

        const bytecode = [];
        let offset = 12;

        for (let i = 0; i < bytecodeLength; i++) {
            const opcode = buffer.readUInt8(offset++);
            const instr = { op: this.byteToOpcode(opcode) };
            
            if (instr.op === 'LOAD' || instr.op === 'STORE') {
                instr.name = buffer.toString('utf8', offset, offset + 32).replace(/\0/g, '');
                offset += 32;
            }
            if (instr.op === 'JMP' || instr.op === 'JZ') {
                instr.target = buffer.readUInt32LE(offset);
                offset += 4;
            }
            if (instr.op === 'CONST') {
                instr.idx = buffer.readUInt32LE(offset);
                offset += 4;
            }
            if (instr.op === 'CALL') {
                instr.argc = buffer.readUInt8(offset++);
            }
            
            bytecode.push(instr);
        }

        return {
            bytecode,
            version
        };
    }

    byteToOpcode(byte) {
        const opcodes = {
            0x00: 'HALT',
            0x01: 'LOAD',
            0x02: 'STORE',
            0x03: 'CONST',
            0x10: 'ADD',
            0x11: 'SUB',
            0x12: 'MUL',
            0x13: 'DIV',
            0x14: 'MOD',
            0x20: 'EQ',
            0x21: 'NE',
            0x22: 'LT',
            0x23: 'GT',
            0x24: 'LE',
            0x25: 'GE',
            0x30: 'JMP',
            0x31: 'JZ',
            0x40: 'CALL',
            0x41: 'RET'
        };
        return opcodes[byte] || 'HALT';
    }

    loadFromFile(filePath) {
        const buffer = fs.readFileSync(filePath);
        return this.load(buffer);
    }

    getStats() {
        return {
            loadedModules: this.loadedModules.size,
            cacheSize: this.cache.size
        };
    }
}

module.exports = {
    AOTCompiler,
    AOTModule,
    AOTLoader
};
