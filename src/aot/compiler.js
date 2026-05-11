/**
 * SeedLang AOT编译器
 * 将SeedLang编译为JavaScript以获得更高性能
 */

const { SeedLangVM } = require('../runtime/vm.js');

class AOTCompiler {
    compile(code) {
        const vm = new SeedLangVM();
        const ast = vm.parser.parse(code);
        return this.generateJS(ast);
    }
    
    generateJS(ast) {
        const lines = [];
        for (const stmt of ast.body) {
            lines.push(this.stmt(stmt));
        }
        return lines.join('\n');
    }
    
    stmt(node) {
        switch (node.type) {
            case 'function':
                return this.func(node);
            case 'varDecl':
                return `let ${node.pattern.name || node.pattern} = ${this.expr(node.init || { type: 'null' })};`;
            case 'expr':
                return `${this.expr(node.expr)};`;
            case 'return':
            case 'Return':
                return `return ${this.expr(node.value || { type: 'null' })};`;
            case 'if':
                return this.ifStmt(node);
            case 'while':
                return this.whileStmt(node);
            case 'forIn':
                return this.forInStmt(node);
            default:
                return `// Unknown: ${node.type}`;
        }
    }
    
    func(node) {
        const params = node.params.join(', ');
        const body = node.body.map(s => this.stmt(s)).join('\n    ');
        return `function ${node.name}(${params}) {\n    ${body}\n}`;
    }
    
    ifStmt(node) {
        const cond = this.expr(node.condition);
        const then = node.then.map(s => this.stmt(s)).join('\n    ');
        let result = `if (${cond}) {\n    ${then}\n}`;
        if (node.else) {
            const elseBody = node.else.map(s => this.stmt(s)).join('\n    ');
            result += ` else {\n    ${elseBody}\n}`;
        }
        return result;
    }
    
    whileStmt(node) {
        const cond = this.expr(node.condition);
        const body = node.body.map(s => this.stmt(s)).join('\n    ');
        return `while (${cond}) {\n    ${body}\n}`;
    }
    
    forInStmt(node) {
        const varName = node.variable.name || node.variable;
        const iterable = this.expr(node.iterable);
        const body = node.body.map(s => this.stmt(s)).join('\n    ');
        return `for (const ${varName} of ${iterable}) {\n    ${body}\n}`;
    }
    
    expr(node) {
        if (!node) return 'null';
        
        switch (node.type) {
            case 'number':
                return String(node.value);
            case 'string':
                return JSON.stringify(node.value);
            case 'boolean':
            case 'bool':
                return String(node.value);
            case 'null':
                return 'null';
            case 'identifier':
            case 'id':
                return node.name;
            case 'binary':
            case 'Binary':
                return `(${this.expr(node.left)} ${node.op} ${this.expr(node.right)})`;
            case 'unary':
                return `(${node.op}${this.expr(node.operand)})`;
            case 'call':
                const args = node.args.map(a => this.expr(a)).join(', ');
                return `${this.expr(node.callee)}(${args})`;
            case 'member':
                return `${this.expr(node.object)}.${node.property}`;
            case 'index':
                return `${this.expr(node.object)}[${this.expr(node.index)}]`;
            case 'array':
                const elements = node.elements.map(e => this.expr(e)).join(', ');
                return `[${elements}]`;
            case 'object':
                const pairs = node.pairs.map(p => `${p.key}: ${this.expr(p.value)}`).join(', ');
                return `{ ${pairs} }`;
            case 'lambda':
                const params = node.params.join(', ');
                const body = this.expr(node.body);
                return `(${params}) => ${body}`;
            default:
                return `/* ${node.type} */`;
        }
    }
}

module.exports = { AOTCompiler };
