/**
 * SeedLang 尾调用优化器
 * 实现尾调用消除和尾递归优化
 */

class TailCallOptimizer {
    constructor() {
        this.tailCallStack = [];
        this.maxTailCallDepth = 10000;
        this.tailCallCount = 0;
        this.optimizedCalls = 0;
        this.stackFramesSaved = 0;
    }

    analyze(ast) {
        if (!ast || typeof ast !== 'object') return { tailCalls: [], canOptimize: false };

        const tailCalls = [];
        
        this.findTailCalls(ast, tailCalls, true);

        return {
            tailCalls,
            canOptimize: tailCalls.length > 0,
            count: tailCalls.length
        };
    }

    findTailCalls(node, tailCalls, isTailPosition) {
        if (!node || typeof node !== 'object') return;

        if (Array.isArray(node)) {
            if (node.length > 0) {
                for (let i = 0; i < node.length - 1; i++) {
                    this.findTailCalls(node[i], tailCalls, false);
                }
                this.findTailCalls(node[node.length - 1], tailCalls, isTailPosition);
            }
            return;
        }

        switch (node.type) {
            case 'ReturnStmt':
            case 'return':
            case 'Return':
                if (node.value && (node.value.type === 'CallExpr' || node.value.type === 'call')) {
                    if (isTailPosition) {
                        tailCalls.push({
                            type: 'TailCall',
                            call: node.value,
                            location: node.location,
                            isRecursive: this.isRecursiveCall(node.value)
                        });
                    }
                }
                this.findTailCalls(node.value, tailCalls, false);
                break;

            case 'CallExpr':
            case 'call':
                if (isTailPosition) {
                    tailCalls.push({
                        type: 'TailCall',
                        call: node,
                        location: node.location,
                        isRecursive: this.isRecursiveCall(node)
                    });
                }
                this.findTailCalls(node.arguments || node.args, tailCalls, false);
                break;

            case 'IfStmt':
            case 'if':
                this.findTailCalls(node.consequent || node.then, tailCalls, isTailPosition);
                this.findTailCalls(node.alternate || node.else, tailCalls, isTailPosition);
                break;

            case 'BlockStmt':
            case 'Program':
                this.findTailCalls(node.body || node.statements, tailCalls, isTailPosition);
                break;

            case 'ConditionalExpr':
                this.findTailCalls(node.consequent, tailCalls, isTailPosition);
                this.findTailCalls(node.alternate, tailCalls, isTailPosition);
                break;

            case 'BinaryExpr':
                this.findTailCalls(node.left, tailCalls, false);
                this.findTailCalls(node.right, tailCalls, false);
                break;

            case 'FunctionDecl':
                this.currentFunction = node.name || node.id?.name;
                this.findTailCalls(node.body, tailCalls, false);
                break;

            case 'FunctionDecl':
            case 'function':
                this.currentFunction = node.name || node.id?.name || this.currentFunction;
                this.findTailCalls(node.body, tailCalls, isTailPosition);
                break;

            default:
                for (const value of Object.values(node)) {
                    if (typeof value === 'object') {
                        this.findTailCalls(value, tailCalls, false);
                    }
                }
        }
    }

    isRecursiveCall(call) {
        if (!call) return false;
        const callee = call.callee || call.fn;
        if (callee && callee.name === this.currentFunction) {
            return true;
        }
        return false;
    }

    optimize(ast) {
        const analysis = this.analyze(ast);
        
        if (!analysis.canOptimize) {
            return { ast, optimized: false };
        }

        const optimizedAst = this.transformTailCalls(ast, true);
        
        return {
            ast: optimizedAst,
            optimized: true,
            tailCallsOptimized: analysis.count
        };
    }

    transformTailCalls(node, isTailPosition) {
        if (!node || typeof node !== 'object') return node;

        if (Array.isArray(node)) {
            return node.map((n, i) => 
                this.transformTailCalls(n, isTailPosition && i === node.length - 1)
            );
        }

        switch (node.type) {
            case 'ReturnStmt':
            case 'return':
            case 'Return':
                if (node.value && (node.value.type === 'CallExpr' || node.value.type === 'call') && isTailPosition) {
                    return {
                        type: 'TailCallStmt',
                        call: this.transformTailCalls(node.value, false),
                        isTailCall: true,
                        original: node.type
                    };
                }
                return {
                    ...node,
                    value: this.transformTailCalls(node.value, false)
                };

            case 'CallExpr':
            case 'call':
                if (isTailPosition) {
                    return {
                        type: 'TailCallExpr',
                        callee: this.transformTailCalls(node.callee || node.fn, false),
                        arguments: this.transformTailCalls(node.arguments || node.args, false),
                        isTailCall: true
                    };
                }
                return {
                    ...node,
                    callee: this.transformTailCalls(node.callee || node.fn, false),
                    arguments: this.transformTailCalls(node.arguments || node.args, false)
                };

            case 'IfStmt':
            case 'if':
                return {
                    ...node,
                    test: this.transformTailCalls(node.test || node.condition, false),
                    consequent: this.transformTailCalls(node.consequent || node.then, isTailPosition),
                    alternate: this.transformTailCalls(node.alternate || node.else, isTailPosition)
                };

            case 'WhileStmt':
            case 'while':
                return {
                    ...node,
                    test: this.transformTailCalls(node.test || node.condition, false),
                    body: this.transformTailCalls(node.body, false)
                };

            case 'BlockStmt':
            case 'Program':
                return {
                    ...node,
                    body: this.transformTailCalls(node.body || node.statements, isTailPosition)
                };

            case 'FunctionDecl':
            case 'function':
                return {
                    ...node,
                    body: this.transformTailCalls(node.body, isTailPosition)
                };

            default:
                return this.transformDefault(node);
        }
    }

    transformDefault(node) {
        const result = { ...node };
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === 'object' && value !== null) {
                result[key] = this.transformTailCalls(value, false);
            }
        }
        return result;
    }
}

class TailCallRuntime {
    constructor(vm) {
        this.vm = vm;
        this.trampoline = null;
        this.bouncing = false;
    }

    executeTailCall(callee, args, context) {
        this.tailCallCount++;
        
        if (this.tailCallStack.length >= this.maxTailCallDepth) {
            return this.trampolineExecute(callee, args, context);
        }

        this.tailCallStack.push({
            callee,
            args,
            context,
            depth: this.tailCallStack.length
        });

        this.optimizedCalls++;
        this.stackFramesSaved++;

        return { tailCall: true, callee, args };
    }

    trampolineExecute(callee, args, context) {
        this.bouncing = true;
        let result = { tailCall: true, callee, args };
        let iterations = 0;
        const maxIterations = 100000;

        while (result.tailCall && iterations < maxIterations) {
            iterations++;
            
            if (typeof result.callee === 'function') {
                result = result.callee.apply(context, result.args);
            } else if (result.callee && typeof result.callee.call === 'function') {
                result = result.callee.call(context, ...result.args);
            } else {
                break;
            }
        }

        this.bouncing = false;
        return result;
    }

    isTailCallOptimized(func) {
        return func && func._tailCallOptimized === true;
    }

    markAsTailCallOptimized(func) {
        func._tailCallOptimized = true;
        return func;
    }

    getStats() {
        return {
            tailCallCount: this.tailCallCount,
            optimizedCalls: this.optimizedCalls,
            stackFramesSaved: this.stackFramesSaved,
            maxDepth: this.tailCallStack.length
        };
    }

    reset() {
        this.tailCallStack = [];
        this.tailCallCount = 0;
        this.bouncing = false;
    }
}

class TailRecursionTransformer {
    constructor() {
        this.transformedFunctions = new Map();
    }

    transform(func, funcName) {
        if (this.transformedFunctions.has(funcName)) {
            return this.transformedFunctions.get(funcName);
        }

        const transformed = this.convertToLoop(func, funcName);
        this.transformedFunctions.set(funcName, transformed);
        
        return transformed;
    }

    convertToLoop(func, funcName) {
        const self = this;
        
        const wrapper = function(...args) {
            let currentArgs = args;
            let iterations = 0;
            const maxIterations = 100000;

            while (iterations < maxIterations) {
                iterations++;
                
                const result = func.apply(this, currentArgs);
                
                if (result && result._tailRecursive && result._funcName === funcName) {
                    currentArgs = result._args;
                    continue;
                }
                
                return result;
            }

            throw new Error(`Tail recursion limit exceeded: ${funcName}`);
        };

        wrapper._tailCallOptimized = true;
        wrapper._originalFunction = func;
        
        return wrapper;
    }

    createTailReturn(funcName, args) {
        return {
            _tailRecursive: true,
            _funcName: funcName,
            _args: args
        };
    }
}

function optimizeTailCalls(ast) {
    const optimizer = new TailCallOptimizer();
    return optimizer.optimize(ast);
}

function isTailCallPosition(node, parent, index) {
    if (!parent) return true;

    switch (parent.type) {
        case 'ReturnStmt':
            return true;
        case 'BlockStmt':
        case 'Program':
            const siblings = parent.body || parent.statements || [];
            return index === siblings.length - 1;
        case 'IfStmt':
            return node === parent.consequent || node === parent.alternate;
        default:
            return false;
    }
}

module.exports = {
    TailCallOptimizer,
    TailCallRuntime,
    TailRecursionTransformer,
    optimizeTailCalls,
    isTailCallPosition
};
