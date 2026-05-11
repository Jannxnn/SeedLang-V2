/**
 * SeedLang SSA (Static Single Assignment) 形式转换器
 * 将代码转换为SSA形式以支持更强大的优化
 */

class SSAConverter {
    constructor() {
        this.varCounter = new Map();
        this.currentDefs = new Map();
        this.phiNodes = new Map();
        this.dominanceFrontier = new Map();
        this.blocks = [];
        this.currentBlock = null;
    }

    convert(ast) {
        if (!ast || typeof ast !== 'object') return ast;

        this.varCounter.clear();
        this.currentDefs.clear();
        this.phiNodes.clear();
        this.blocks = [];

        const ssaAst = this.convertNode(ast);
        
        return {
            type: 'SSAProgram',
            body: ssaAst,
            blocks: this.blocks,
            phiNodes: this.getPhiNodes()
        };
    }

    convertNode(node) {
        if (!node || typeof node !== 'object') return node;

        if (Array.isArray(node)) {
            return node.map(n => this.convertNode(n));
        }

        switch (node.type) {
            case 'Program':
                return this.convertProgram(node);
            case 'FunctionDecl':
                return this.convertFunction(node);
            case 'VariableDecl':
                return this.convertVarDecl(node);
            case 'Assignment':
                return this.convertAssignment(node);
            case 'Identifier':
                return this.convertIdentifier(node);
            case 'BinaryExpr':
                return this.convertBinary(node);
            case 'CallExpr':
                return this.convertCall(node);
            case 'IfStmt':
                return this.convertIf(node);
            case 'WhileStmt':
                return this.convertWhile(node);
            case 'ReturnStmt':
                return this.convertReturn(node);
            default:
                return this.convertDefault(node);
        }
    }

    convertProgram(node) {
        const body = this.convertNode(node.body || []);
        return { ...node, body, ssa: true };
    }

    convertFunction(node) {
        const savedDefs = new Map(this.currentDefs);
        this.currentDefs.clear();

        const params = (node.params || []).map(p => {
            const newName = this.newName(p.name || p);
            this.currentDefs.set(p.name || p, newName);
            return { ...p, name: newName, ssaVersion: 0 };
        });

        const body = this.convertNode(node.body);

        this.currentDefs = savedDefs;

        return { ...node, params, body, ssa: true };
    }

    convertVarDecl(node) {
        const oldName = node.name || node.id?.name || 'anonymous';
        if (!oldName || oldName === 'anonymous') {
            return this.convertDefault(node);
        }
        const newName = this.newName(oldName);
        this.currentDefs.set(oldName, newName);

        const init = this.convertNode(node.init || node.value);

        return {
            type: 'VariableDecl',
            name: newName,
            originalName: oldName,
            init,
            ssaVersion: this.varCounter.get(oldName) - 1,
            ssa: true
        };
    }

    convertAssignment(node) {
        const left = node.left || node.target || node.name;
        const right = this.convertNode(node.right || node.value);

        let varName;
        if (typeof left === 'string') {
            varName = left;
        } else if (left && left.name) {
            varName = left.name;
        } else {
            return this.convertDefault(node);
        }

        const newName = this.newName(varName);
        this.currentDefs.set(varName, newName);

        return {
            type: 'Assignment',
            name: newName,
            originalName: varName,
            value: right,
            ssaVersion: this.varCounter.get(varName) - 1,
            ssa: true
        };
    }

    convertIdentifier(node) {
        const name = node.name || node;
        const ssaName = this.currentDefs.get(name) || name;

        return {
            type: 'Identifier',
            name: ssaName,
            originalName: name,
            ssaVersion: this.getSSAVersion(name),
            ssa: true
        };
    }

    convertBinary(node) {
        const left = this.convertNode(node.left);
        const right = this.convertNode(node.right);
        const op = node.operator || node.op;

        return {
            type: 'BinaryExpr',
            operator: op,
            left,
            right,
            ssa: true
        };
    }

    convertCall(node) {
        const callee = this.convertNode(node.callee || node.fn);
        const args = (node.arguments || node.args || []).map(a => this.convertNode(a));

        return {
            type: 'CallExpr',
            callee,
            arguments: args,
            ssa: true
        };
    }

    convertIf(node) {
        const test = this.convertNode(node.test || node.condition);
        
        const savedDefs = new Map(this.currentDefs);
        
        const consequent = this.convertNode(node.consequent || node.then);
        const thenDefs = new Map(this.currentDefs);
        
        this.currentDefs = savedDefs;
        
        const alternate = this.convertNode(node.alternate || node.else);
        const elseDefs = new Map(this.currentDefs);
        
        const phiNodes = this.generatePhiNodes(thenDefs, elseDefs);
        for (const [varName, newName] of phiNodes) {
            this.currentDefs.set(varName, newName);
        }

        return {
            type: 'IfStmt',
            test,
            consequent,
            alternate,
            phiNodes: Array.from(phiNodes.entries()),
            ssa: true
        };
    }

    convertWhile(node) {
        const test = this.convertNode(node.test || node.condition);
        
        const savedDefs = new Map(this.currentDefs);
        
        const body = this.convertNode(node.body);
        
        const phiNodes = this.generateLoopPhiNodes(savedDefs, this.currentDefs);
        for (const [varName, newName] of phiNodes) {
            this.currentDefs.set(varName, newName);
        }

        return {
            type: 'WhileStmt',
            test,
            body,
            phiNodes: Array.from(phiNodes.entries()),
            ssa: true
        };
    }

    convertReturn(node) {
        const value = this.convertNode(node.value || node.argument);
        return {
            type: 'ReturnStmt',
            value,
            ssa: true
        };
    }

    convertDefault(node) {
        const result = { ...node, ssa: true };
        
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === 'object' && value !== null) {
                result[key] = this.convertNode(value);
            }
        }

        return result;
    }

    newName(varName) {
        const count = (this.varCounter.get(varName) || 0) + 1;
        this.varCounter.set(varName, count);
        return `${varName}_${count}`;
    }

    getSSAVersion(varName) {
        return (this.varCounter.get(varName) || 1) - 1;
    }

    generatePhiNodes(thenDefs, elseDefs) {
        const phiNodes = new Map();
        
        const allVars = new Set([...thenDefs.keys(), ...elseDefs.keys()]);
        
        for (const varName of allVars) {
            const thenName = thenDefs.get(varName);
            const elseName = elseDefs.get(varName);
            
            if (thenName !== elseName) {
                const newName = this.newName(varName);
                phiNodes.set(varName, newName);
                
                this.addPhiNode(newName, varName, [
                    thenName || varName,
                    elseName || varName
                ]);
            }
        }

        return phiNodes;
    }

    generateLoopPhiNodes(beforeDefs, afterDefs) {
        const phiNodes = new Map();
        
        for (const [varName, afterName] of afterDefs) {
            const beforeName = beforeDefs.get(varName);
            
            if (beforeName !== afterName) {
                const newName = this.newName(varName);
                phiNodes.set(varName, newName);
                
                this.addPhiNode(newName, varName, [
                    beforeName || varName,
                    afterName
                ]);
            }
        }

        return phiNodes;
    }

    addPhiNode(resultName, originalName, sources) {
        if (!this.phiNodes.has(originalName)) {
            this.phiNodes.set(originalName, []);
        }
        this.phiNodes.get(originalName).push({
            result: resultName,
            sources: sources
        });
    }

    getPhiNodes() {
        const result = [];
        for (const [varName, nodes] of this.phiNodes) {
            result.push({
                variable: varName,
                nodes: nodes
            });
        }
        return result;
    }

    toDot() {
        let dot = 'digraph SSA {\n';
        dot += '  node [shape=box];\n';
        
        for (const [varName, nodes] of this.phiNodes) {
            for (const node of nodes) {
                dot += `  "${node.result}" [label="φ(${node.sources.join(', ')})"];\n`;
                for (const src of node.sources) {
                    dot += `  "${src}" -> "${node.result}";\n`;
                }
            }
        }
        
        dot += '}\n';
        return dot;
    }
}

class SSAOptimizer {
    constructor() {
        this.converter = new SSAConverter();
    }

    optimize(ast) {
        const ssa = this.converter.convert(ast);
        
        let optimized = ssa;
        optimized = this.constantPropagation(optimized);
        optimized = this.copyPropagation(optimized);
        optimized = this.deadCodeElimination(optimized);
        optimized = this.commonSubexpressionElimination(optimized);
        
        return optimized;
    }

    constantPropagation(ssa) {
        const constants = new Map();
        
        const propagate = (node) => {
            if (!node || typeof node !== 'object') return node;

            if (node.type === 'VariableDecl' || node.type === 'Assignment') {
                const value = this.evaluateConstant(node.init || node.value, constants);
                if (value !== null && typeof value !== 'object') {
                    constants.set(node.name, value);
                }
                return { ...node, value: propagate(node.init || node.value) };
            }

            if (node.type === 'Identifier') {
                if (constants.has(node.name)) {
                    return { type: 'Literal', value: constants.get(node.name), ssa: true };
                }
            }

            if (node.type === 'BinaryExpr') {
                const left = propagate(node.left);
                const right = propagate(node.right);
                
                if (left.type === 'Literal' && right.type === 'Literal') {
                    const result = this.evalBinary(node.operator, left.value, right.value);
                    if (result !== null) {
                        return { type: 'Literal', value: result, ssa: true };
                    }
                }
                
                return { ...node, left, right };
            }

            return this.mapObject(node, propagate);
        };

        return propagate(ssa);
    }

    copyPropagation(ssa) {
        const copies = new Map();
        
        const propagate = (node) => {
            if (!node || typeof node !== 'object') return node;

            if (node.type === 'Assignment') {
                if (node.value && node.value.type === 'Identifier') {
                    copies.set(node.name, node.value.name);
                }
                return { ...node, value: propagate(node.value) };
            }

            if (node.type === 'Identifier') {
                let name = node.name;
                while (copies.has(name)) {
                    name = copies.get(name);
                }
                if (name !== node.name) {
                    return { ...node, name, propagatedFrom: node.name };
                }
            }

            return this.mapObject(node, propagate);
        };

        return propagate(ssa);
    }

    deadCodeElimination(ssa) {
        const used = new Set();
        
        const collectUsed = (node) => {
            if (!node || typeof node !== 'object') return;

            if (node.type === 'Identifier') {
                used.add(node.name);
            }

            if (Array.isArray(node)) {
                node.forEach(collectUsed);
            } else {
                Object.values(node).forEach(v => {
                    if (typeof v === 'object') collectUsed(v);
                });
            }
        };

        collectUsed(ssa);

        const eliminate = (node) => {
            if (!node || typeof node !== 'object') return node;

            if (Array.isArray(node)) {
                return node.map(eliminate).filter(n => n !== null);
            }

            if (node.type === 'VariableDecl' || node.type === 'Assignment') {
                if (!used.has(node.name)) {
                    return null;
                }
            }

            return this.mapObject(node, eliminate);
        };

        return eliminate(ssa);
    }

    commonSubexpressionElimination(ssa) {
        const expressions = new Map();
        
        const eliminate = (node) => {
            if (!node || typeof node !== 'object') return node;

            if (node.type === 'BinaryExpr') {
                const key = this.exprKey(node);
                
                if (expressions.has(key)) {
                    return { type: 'Identifier', name: expressions.get(key), cse: true };
                }
                
                const left = eliminate(node.left);
                const right = eliminate(node.right);
                const optimized = { ...node, left, right };
                
                if (node.left.type === 'Identifier' && node.right.type === 'Identifier') {
                    expressions.set(key, `cse_${expressions.size}`);
                }
                
                return optimized;
            }

            return this.mapObject(node, eliminate);
        };

        return eliminate(ssa);
    }

    evaluateConstant(node, constants) {
        if (!node) return null;
        
        if (node.type === 'Literal') return node.value;
        if (node.type === 'Identifier' && constants.has(node.name)) {
            return constants.get(node.name);
        }
        
        return null;
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

    exprKey(node) {
        if (node.type === 'BinaryExpr') {
            const leftKey = node.left.name || this.exprKey(node.left);
            const rightKey = node.right.name || this.exprKey(node.right);
            return `(${leftKey} ${node.operator} ${rightKey})`;
        }
        return JSON.stringify(node);
    }

    mapObject(obj, fn) {
        if (Array.isArray(obj)) {
            return obj.map(fn);
        }
        
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
                result[key] = fn(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }
}

class SSABuilder {
    constructor() {
        this.blocks = [];
        this.currentBlockId = 0;
        this.variables = new Map();
        this.phiFunctions = [];
    }

    buildBlock(statements) {
        const block = {
            id: this.currentBlockId++,
            statements: [],
            predecessors: [],
            successors: [],
            phiFunctions: []
        };

        for (const stmt of statements) {
            block.statements.push(this.buildStatement(stmt));
        }

        this.blocks.push(block);
        return block;
    }

    buildStatement(stmt) {
        if (!stmt || typeof stmt !== 'object') return stmt;

        switch (stmt.type) {
            case 'Assignment':
                return {
                    type: 'Assignment',
                    target: this.buildVariable(stmt.name || stmt.target),
                    value: this.buildExpression(stmt.value || stmt.right)
                };
            default:
                return stmt;
        }
    }

    buildVariable(name) {
        const version = this.variables.get(name) || 0;
        return { name, version: `${name}_${version}` };
    }

    buildExpression(expr) {
        if (!expr || typeof expr !== 'object') return expr;

        if (expr.type === 'BinaryExpr') {
            return {
                type: 'BinaryExpr',
                operator: expr.operator,
                left: this.buildExpression(expr.left),
                right: this.buildExpression(expr.right)
            };
        }

        if (expr.type === 'Identifier') {
            return this.buildVariable(expr.name);
        }

        return expr;
    }

    addPhiFunction(block, variable, sources) {
        const phi = {
            type: 'PhiFunction',
            target: variable,
            sources: sources,
            block: block.id
        };
        block.phiFunctions.push(phi);
        this.phiFunctions.push(phi);
        return phi;
    }
}

module.exports = {
    SSAConverter,
    SSAOptimizer,
    SSABuilder
};
