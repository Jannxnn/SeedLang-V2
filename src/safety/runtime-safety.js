/**
 * SeedLang 运行时安全检查
 * 提供边界检查、类型验证、空值检查等安全机制
 */

class RuntimeSafety {
    constructor(options = {}) {
        this.strictMode = options.strict || false;
        this.checkBounds = options.checkBounds !== false;
        this.checkTypes = options.checkTypes !== false;
        this.checkNull = options.checkNull !== false;
        this.errors = [];
    }
    
    arrayGet(array, index) {
        if (this.checkBounds && Array.isArray(array)) {
            if (index < 0 || index >= array.length) {
                const error = new RangeError(
                    `Array index out of bounds: index ${index} out of range [0, ${array.length - 1}]`
                );
                this.errors.push({
                    type: 'RangeError',
                    message: error.message,
                    index,
                    arrayLength: array.length
                });
                
                if (this.strictMode) {
                    throw error;
                }
                
                return null;
            }
        }
        
        return array[index] ?? null;
    }
    
    arraySet(array, index, value) {
        if (this.checkBounds && Array.isArray(array)) {
            if (index < 0 || index >= array.length) {
                const error = new RangeError(
                    `Array index out of bounds: index ${index} out of range [0, ${array.length - 1}]`
                );
                this.errors.push({
                    type: 'RangeError',
                    message: error.message,
                    index,
                    arrayLength: array.length
                });
                
                if (this.strictMode) {
                    throw error;
                }
                
                return false;
            }
        }
        
        array[index] = value;
        return true;
    }
    
    objectGet(obj, key) {
        if (this.checkNull && (obj === null || obj === undefined)) {
            const error = new TypeError(
                `Cannot read property '${key}' of null or undefined`
            );
            this.errors.push({
                type: 'TypeError',
                message: error.message,
                key
            });
            
            if (this.strictMode) {
                throw error;
            }
            
            return undefined;
        }
        
        return obj[key];
    }
    
    objectSet(obj, key, value) {
        if (this.checkNull && (obj === null || obj === undefined)) {
            const error = new TypeError(
                `Cannot set property '${key}' of null or undefined`
            );
            this.errors.push({
                type: 'TypeError',
                message: error.message,
                key
            });
            
            if (this.strictMode) {
                throw error;
            }
            
            return false;
        }
        
        obj[key] = value;
        return true;
    }
    
    typeCheck(value, expectedType, context = '') {
        if (!this.checkTypes) return true;
        
        const actualType = this.getType(value);
        
        if (expectedType === 'any') return true;
        
        if (expectedType === 'array') {
            if (!Array.isArray(value)) {
                const error = new TypeError(
                    `${context} Type error: expected array, got ${actualType}`
                );
                this.errors.push({
                    type: 'TypeError',
                    message: error.message,
                    expected: expectedType,
                    actual: actualType,
                    context
                });
                
                if (this.strictMode) {
                    throw error;
                }
                
                return false;
            }
            return true;
        }
        
        if (expectedType !== actualType) {
            const error = new TypeError(
                `${context} Type error: expected ${expectedType}, got ${actualType}`
            );
            this.errors.push({
                type: 'TypeError',
                message: error.message,
                expected: expectedType,
                actual: actualType,
                context
            });
            
            if (this.strictMode) {
                throw error;
            }
            
            return false;
        }
        
        return true;
    }
    
    nullCheck(value, context = '') {
        if (!this.checkNull) return true;
        
        if (value === null || value === undefined) {
            const error = new TypeError(
                `${context} Null error: value is null or undefined`
            );
            this.errors.push({
                type: 'TypeError',
                message: error.message,
                context
            });
            
            if (this.strictMode) {
                throw error;
            }
            
            return false;
        }
        
        return true;
    }
    
    getType(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'function') return 'function';
        return typeof value;
    }
    
    arithmeticOp(op, left, right) {
        const leftType = this.getType(left);
        const rightType = this.getType(right);
        
        if (op === '+' && (leftType === 'string' || rightType === 'string')) {
            return String(left) + String(right);
        }
        
        if (leftType !== 'number' || rightType !== 'number') {
            const error = new TypeError(
                `Arithmetic operation '${op}' requires number types, got ${leftType} and ${rightType}`
            );
            this.errors.push({
                type: 'TypeError',
                message: error.message,
                operator: op,
                leftType,
                rightType
            });
            
            if (this.strictMode) {
                throw error;
            }
            
            return NaN;
        }
        
        switch (op) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': 
                if (right === 0) {
                    const error = new Error('Division by zero');
                    this.errors.push({
                        type: 'Error',
                        message: error.message
                    });
                    
                    if (this.strictMode) {
                        throw error;
                    }
                    
                    return Infinity;
                }
                return left / right;
            case '%': return left % right;
            case '**': return Math.pow(left, right);
            default: return NaN;
        }
    }
    
    functionCall(fn, args, context = '') {
        if (typeof fn !== 'function') {
            const error = new TypeError(
                `${context} Call error: ${this.getType(fn)} is not a function`
            );
            this.errors.push({
                type: 'TypeError',
                message: error.message,
                context
            });
            
            if (this.strictMode) {
                throw error;
            }
            
            return undefined;
        }
        
        try {
            return fn(...args);
        } catch (e) {
            this.errors.push({
                type: 'RuntimeError',
                message: e.message,
                context,
                stack: e.stack
            });
            
            if (this.strictMode) {
                throw e;
            }
            
            return undefined;
        }
    }
    
    getErrors() {
        return this.errors;
    }
    
    clearErrors() {
        this.errors = [];
    }
    
    hasErrors() {
        return this.errors.length > 0;
    }
    
    getErrorReport() {
        if (this.errors.length === 0) {
            return 'No runtime errors';
        }
        
        let report = `\n=== Runtime Safety Report ===\n`;
        report += `Found ${this.errors.length} error(s):\n\n`;
        
        this.errors.forEach((error, index) => {
            report += `${index + 1}. [${error.type}] ${error.message}\n`;
            if (error.context) {
                report += `   Context: ${error.context}\n`;
            }
        });
        
        return report;
    }
}

function createSafeVM(vm, options = {}) {
    const safety = new RuntimeSafety(options);
    
    const originalRun = vm.run.bind(vm);
    
    vm.run = function(code) {
        safety.clearErrors();
        
        try {
            const result = originalRun(code);
            
            if (safety.hasErrors() && !options.strict) {
                console.log(safety.getErrorReport());
            }
            
            return result;
        } catch (e) {
            safety.errors.push({
                type: 'RuntimeError',
                message: e.message,
                stack: e.stack
            });
            
            if (options.strict) {
                throw e;
            }
            
            console.log(safety.getErrorReport());
            return { success: false, error: e.message };
        }
    };
    
    vm.safety = safety;
    
    return vm;
}

module.exports = { RuntimeSafety, createSafeVM };
