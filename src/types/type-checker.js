/**
 * SeedLang 类型检查器
 * 在编译时进行类型检查，减少AI幻觉，提高安全性
 */

const { TypeSystem } = require('./type-system.js');

class TypeChecker {
    constructor() {
        this.typeSystem = new TypeSystem();
        this.environment = new Map();
        this.currentFunction = null;
        this.strictMode = false;
    }
    
    check(ast, options = {}) {
        this.strictMode = options.strict || false;
        this.typeSystem.clearErrors();
        this.environment.clear();
        
        this.checkProgram(ast);
        
        return {
            errors: this.typeSystem.getErrors(),
            warnings: this.typeSystem.getWarnings(),
            success: this.typeSystem.getErrors().length === 0
        };
    }
    
    checkProgram(node) {
        if (!node.statements) return;
        
        for (const stmt of node.statements) {
            this.checkStatement(stmt);
        }
    }
    
    checkStatement(node) {
        if (!node) return;
        
        switch (node.type) {
            case 'FunctionDef':
            case 'AsyncFunctionDef':
                this.checkFunctionDef(node);
                break;
                
            case 'Declaration':
                this.checkDeclaration(node);
                break;
                
            case 'If':
            case 'IfStatement':
                this.checkIfStatement(node);
                break;
                
            case 'While':
            case 'WhileStatement':
                this.checkWhileStatement(node);
                break;
                
            case 'For':
            case 'ForStatement':
                this.checkForStatement(node);
                break;
                
            case 'Return':
            case 'ReturnStatement':
                this.checkReturnStatement(node);
                break;
                
            case 'ClassDef':
                this.checkClassDef(node);
                break;
                
            case 'Action':
                this.checkExpression(node.target);
                break;
                
            default:
                this.checkExpression(node);
        }
    }
    
    checkFunctionDef(node) {
        const previousFunction = this.currentFunction;
        const outerEnv = this.environment;
        const functionEnv = new Map(outerEnv);
        this.environment = functionEnv;
        this.currentFunction = node;

        const paramTypes = [];
        let returnType = { name: 'any' };
        if (node.returnType) {
            returnType = this.typeSystem.parseType(node.returnType);
        }

        const functionType = {
            name: 'function',
            params: paramTypes,
            returnType
        };

        if (node.name) {
            // Predeclare function in current scope so recursive calls and
            // sibling statements resolve to the right signature.
            this.environment.set(node.name, functionType);
        }

        if (node.params) {
            for (const param of node.params) {
                let paramType = { name: 'any' };

                if (typeof param === 'object' && param.type) {
                    paramType = this.typeSystem.parseType(param.type);
                }

                paramTypes.push({ name: param.name || param, type: paramType });
                this.environment.set(param.name || param, paramType);
            }
        }

        if (node.body) {
            for (const stmt of node.body) {
                this.checkStatement(stmt);
            }
        }

        this.environment = outerEnv;
        if (node.name) {
            this.environment.set(node.name, functionType);
        }

        this.currentFunction = previousFunction;
    }
    
    checkDeclaration(node) {
        if (!node.subject) return;
        
        const varName = node.subject.name || node.subject;
        let declaredType = { name: 'any' };
        
        if (node.subject.typeAnnotation) {
            declaredType = this.typeSystem.parseType(node.subject.typeAnnotation);
        }
        
        if (node.object) {
            const valueType = this.inferExpressionType(node.object);
            
            if (declaredType.name !== 'any' && !this.typeSystem.isAssignable(declaredType, valueType)) {
                this.typeSystem.addError(
                    `Type mismatch: cannot assign type '${this.typeToString(valueType)}' to type '${this.typeToString(declaredType)}'`,
                    node.line || 1,
                    1,
                    `Ensure assigned type is compatible with declared type '${this.typeToString(declaredType)}'`
                );
            }
            
            this.environment.set(varName, declaredType.name !== 'any' ? declaredType : valueType);
        } else {
            this.environment.set(varName, declaredType);
        }
    }
    
    checkIfStatement(node) {
        if (node.condition) {
            const condType = this.inferExpressionType(node.condition);
            if (condType.name !== 'any' && condType.name !== 'boolean') {
                this.typeSystem.addWarning(
                    `Condition expression should be boolean, got '${this.typeToString(condType)}'`,
                    node.line || 1,
                    1
                );
            }
        }
        
        if (node.then) {
            for (const stmt of node.then) {
                this.checkStatement(stmt);
            }
        }
        
        if (node.else) {
            if (Array.isArray(node.else)) {
                for (const stmt of node.else) {
                    this.checkStatement(stmt);
                }
            } else {
                this.checkStatement(node.else);
            }
        }
    }
    
    checkWhileStatement(node) {
        if (node.condition) {
            const condType = this.inferExpressionType(node.condition);
            if (condType.name !== 'any' && condType.name !== 'boolean') {
                this.typeSystem.addWarning(
                    `Loop condition should be boolean, got '${this.typeToString(condType)}'`,
                    node.line || 1,
                    1
                );
            }
        }
        
        if (node.body) {
            for (const stmt of node.body) {
                this.checkStatement(stmt);
            }
        }
    }
    
    checkForStatement(node) {
        if (node.variable && node.iterable) {
            const iterableType = this.inferExpressionType(node.iterable);
            
            let elementType = { name: 'any' };
            if (iterableType.name === 'Array' && iterableType.typeArgs) {
                elementType = iterableType.typeArgs[0];
            }
            
            this.environment.set(node.variable, elementType);
        }
        
        if (node.body) {
            for (const stmt of node.body) {
                this.checkStatement(stmt);
            }
        }
    }
    
    checkReturnStatement(node) {
        if (!this.currentFunction) {
            this.typeSystem.addError(
                'return statement can only be used inside functions',
                node.line || 1,
                1
            );
            return;
        }
        
        const expectedReturnType = this.currentFunction.returnType 
            ? this.typeSystem.parseType(this.currentFunction.returnType)
            : { name: 'any' };
        
        if (node.value) {
            const actualReturnType = this.inferExpressionType(node.value);
            
            if (expectedReturnType.name !== 'any' && 
                !this.typeSystem.isAssignable(expectedReturnType, actualReturnType)) {
                this.typeSystem.addError(
                    `Return type mismatch: expected '${this.typeToString(expectedReturnType)}', got '${this.typeToString(actualReturnType)}'`,
                    node.line || 1,
                    1,
                    `Modify return value to match declared return type '${this.typeToString(expectedReturnType)}'`
                );
            }
        } else if (expectedReturnType.name !== 'void' && expectedReturnType.name !== 'any') {
            this.typeSystem.addWarning(
                `Function declares return type '${this.typeToString(expectedReturnType)}' but has no return value`,
                node.line || 1,
                1
            );
        }
    }
    
    checkClassDef(node) {
        if (node.name) {
            this.environment.set(node.name, { name: 'class', className: node.name });
        }
        
        if (node.body) {
            for (const member of node.body) {
                this.checkStatement(member);
            }
        }
    }
    
    checkExpression(node) {
        if (!node) return { name: 'any' };
        
        return this.inferExpressionType(node);
    }
    
    inferExpressionType(node) {
        if (!node) return { name: 'any' };
        
        const inferred = this.typeSystem.inferType(node, Object.fromEntries(this.environment));
        
        if (node.type === 'call' || node.type === 'Call') {
            this.checkCallArguments(node);
        }
        
        if (node.type === 'binary' || node.type === 'BinaryOp') {
            this.checkBinaryOperation(node);
        }
        
        return inferred;
    }
    
    checkCallArguments(node) {
        if (!node.callee || !node.args) return;
        
        const calleeType = this.inferExpressionType(node.callee);
        
        if (calleeType.name !== 'function' || !calleeType.params) return;
        
        if (node.args.length !== calleeType.params.length) {
            this.typeSystem.addError(
                `Argument count mismatch: expected ${calleeType.params.length} arguments, got ${node.args.length}`,
                node.line || 1,
                1,
                `Function expects ${calleeType.params.length} arguments`
            );
            return;
        }
        
        for (let i = 0; i < node.args.length; i++) {
            const argType = this.inferExpressionType(node.args[i]);
            const paramType = calleeType.params[i].type;
            
            if (paramType.name !== 'any' && !this.typeSystem.isAssignable(paramType, argType)) {
                this.typeSystem.addError(
                    `Argument ${i + 1} type mismatch: expected '${this.typeToString(paramType)}', got '${this.typeToString(argType)}'`,
                    node.line || 1,
                    1,
                    `Argument should be of type '${this.typeToString(paramType)}'`
                );
            }
        }
    }
    
    checkBinaryOperation(node) {
        const leftType = this.inferExpressionType(node.left);
        const rightType = this.inferExpressionType(node.right);
        const op = node.op || node.operator;
        
        switch (op) {
            case '+':
                if (leftType.name !== 'any' && rightType.name !== 'any') {
                    if (leftType.name !== 'number' && leftType.name !== 'string') {
                        this.typeSystem.addError(
                            `Operator '+' cannot be applied to types '${this.typeToString(leftType)}' and '${this.typeToString(rightType)}'`,
                            node.line || 1,
                            1,
                            'Operator + can only be used with numbers or strings'
                        );
                    }
                }
                break;
                
            case '-':
            case '*':
            case '/':
            case '%':
            case '**':
                if (leftType.name !== 'any' && leftType.name !== 'number') {
                    this.typeSystem.addError(
                        `Operator '${op}' cannot be applied to type '${this.typeToString(leftType)}'`,
                        node.line || 1,
                        1,
                        'Arithmetic operators can only be used with numbers'
                    );
                }
                if (rightType.name !== 'any' && rightType.name !== 'number') {
                    this.typeSystem.addError(
                        `Operator '${op}' cannot be applied to type '${this.typeToString(rightType)}'`,
                        node.line || 1,
                        1,
                        'Arithmetic operators can only be used with numbers'
                    );
                }
                break;
        }
    }
    
    typeToString(type) {
        if (!type) return 'any';
        
        if (type.name === 'Array' && type.typeArgs) {
            return `${this.typeToString(type.typeArgs[0])}[]`;
        }
        
        if (type.name === 'function') {
            const params = type.params.map(p => `${p.name}: ${this.typeToString(p.type)}`).join(', ');
            return `(${params}) => ${this.typeToString(type.returnType)}`;
        }
        
        if (type.name === 'union') {
            return type.types.map(t => this.typeToString(t)).join(' | ');
        }
        
        if (type.name === 'literal') {
            return typeof type.value === 'string' ? `'${type.value}'` : String(type.value);
        }
        
        return type.name || 'any';
    }
}

module.exports = { TypeChecker };
