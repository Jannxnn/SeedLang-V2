/**
 * SeedLang AI集成模块
 * 提供AI代码生成、验证和修复建议
 */

const { TypeSystem } = require('../types/type-system.js');
const { TypeChecker } = require('../types/type-checker.js');
const { ErrorReporter } = require('../errors/error-reporter.js');

class AIIntegration {
    constructor(options = {}) {
        this.typeSystem = new TypeSystem();
        this.typeChecker = new TypeChecker(this.typeSystem);
        this.errorReporter = new ErrorReporter({
            aiFriendly: true,
            verbose: options.verbose || false
        });
        
        this.forbiddenPatterns = [
            /eval\s*\(/,
            /Function\s*\(/,
            /require\s*\(/,
            /import\s+/,
            /process\.exit/,
            /fs\./,
            /child_process/,
            /__proto__/,
            /prototype/
        ];
        
        this.safetyRules = [
            {
                name: 'no_infinite_loops',
                check: (ast) => this.checkInfiniteLoops(ast),
                message: '检测到可能的无限循环'
            },
            {
                name: 'no_unsafe_operations',
                check: (ast) => this.checkUnsafeOperations(ast),
                message: '检测到不安全的操作'
            },
            {
                name: 'no_memory_leaks',
                check: (ast) => this.checkMemoryLeaks(ast),
                message: '检测到可能的内存泄漏'
            }
        ];
        
        this.stats = {
            generatedCode: 0,
            validatedCode: 0,
            fixedCode: 0,
            rejectedCode: 0
        };
    }
    
    generateCode(prompt, options = {}) {
        this.stats.generatedCode++;
        
        const template = this.selectTemplate(prompt);
        
        let code = this.fillTemplate(template, options);
        
        code = this.addSafetyChecks(code);
        
        const validation = this.validateCode(code);
        
        if (!validation.valid) {
            const fixResult = this.attemptAutoFix(code, validation.errors);
            if (fixResult.success) {
                code = fixResult.code;
                this.stats.fixedCode++;
            } else {
                this.stats.rejectedCode++;
                return {
                    success: false,
                    code: null,
                    errors: validation.errors,
                    suggestions: fixResult.suggestions
                };
            }
        }
        
        this.stats.validatedCode++;
        
        return {
            success: true,
            code,
            warnings: validation.warnings,
            metadata: {
                template: template.name,
                generatedAt: new Date().toISOString()
            }
        };
    }
    
    validateCode(code) {
        const errors = [];
        const warnings = [];
        
        const securityCheck = this.checkSecurity(code);
        if (!securityCheck.safe) {
            errors.push(...securityCheck.issues);
        }
        
        const syntaxCheck = this.checkSyntax(code);
        if (!syntaxCheck.valid) {
            errors.push(...syntaxCheck.errors);
        }
        
        const typeCheck = this.typeChecker.check(code);
        if (!typeCheck.success) {
            errors.push(...typeCheck.errors);
        }
        
        const safetyCheck = this.checkSafetyRules(code);
        warnings.push(...safetyCheck.warnings);
        
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    
    checkSecurity(code) {
        const issues = [];
        
        for (const pattern of this.forbiddenPatterns) {
            if (pattern.test(code)) {
                issues.push({
                    type: 'SecurityError',
                    message: `检测到禁止的模式: ${pattern.toString()}`,
                    severity: 'critical',
                    suggestion: '请移除不安全的代码'
                });
            }
        }
        
        return {
            safe: issues.length === 0,
            issues
        };
    }
    
    checkSyntax(code) {
        try {
            const { Parser } = require('../../dist/core/parser.js');
            const parser = new Parser();
            parser.parse(code);
            
            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                errors: [{
                    type: 'SyntaxError',
                    message: error.message,
                    line: error.line || 1,
                    column: error.column || 1
                }]
            };
        }
    }
    
    checkSafetyRules(code) {
        const warnings = [];
        
        try {
            const { Parser } = require('../../dist/core/parser.js');
            const parser = new Parser();
            const ast = parser.parse(code);
            
            for (const rule of this.safetyRules) {
                const result = rule.check(ast);
                if (result.violations > 0) {
                    warnings.push({
                        type: 'SafetyWarning',
                        message: rule.message,
                        count: result.violations
                    });
                }
            }
        } catch (error) {
            // 如果解析失败，跳过安全规则检查
        }
        
        return { warnings };
    }
    
    checkInfiniteLoops(ast) {
        let violations = 0;
        
        const traverse = (node) => {
            if (!node) return;
            
            if (node.type === 'WhileStatement' || node.type === 'ForStatement') {
                if (!node.body || node.body.length === 0) {
                    violations++;
                }
            }
            
            for (const key in node) {
                if (typeof node[key] === 'object') {
                    traverse(node[key]);
                }
            }
        };
        
        traverse(ast);
        
        return { violations };
    }
    
    checkUnsafeOperations(ast) {
        let violations = 0;
        
        const traverse = (node) => {
            if (!node) return;
            
            if (node.type === 'CallExpression') {
                if (node.callee && node.callee.name === 'eval') {
                    violations++;
                }
            }
            
            for (const key in node) {
                if (typeof node[key] === 'object') {
                    traverse(node[key]);
                }
            }
        };
        
        traverse(ast);
        
        return { violations };
    }
    
    checkMemoryLeaks(ast) {
        let violations = 0;
        
        return { violations };
    }
    
    attemptAutoFix(code, errors) {
        let fixedCode = code;
        const suggestions = [];
        let fixCount = 0;
        
        for (const error of errors) {
            const fix = this.generateFix(error, fixedCode);
            if (fix.success) {
                fixedCode = fix.code;
                fixCount++;
            } else {
                suggestions.push(fix.suggestion);
            }
        }
        
        return {
            success: fixCount > 0 && fixCount === errors.length,
            code: fixedCode,
            suggestions
        };
    }
    
    generateFix(error, code) {
        switch (error.type) {
            case 'SyntaxError':
                return this.fixSyntaxError(error, code);
            
            case 'TypeError':
                return this.fixTypeError(error, code);
            
            case 'SecurityError':
                return {
                    success: false,
                    code,
                    suggestion: `安全问题无法自动修复: ${error.message}`
                };
            
            default:
                return {
                    success: false,
                    code,
                    suggestion: `无法自动修复: ${error.message}`
                };
        }
    }
    
    fixSyntaxError(error, code) {
        const lines = code.split('\n');
        const lineIndex = (error.line || 1) - 1;
        
        if (lineIndex >= 0 && lineIndex < lines.length) {
            const line = lines[lineIndex];
            
            if (error.message.includes('expected')) {
                return {
                    success: false,
                    code,
                    suggestion: `第 ${error.line} 行语法错误: ${error.message}`
                };
            }
        }
        
        return {
            success: false,
            code,
            suggestion: `语法错误: ${error.message}`
        };
    }
    
    fixTypeError(error, code) {
        return {
            success: false,
            code,
            suggestion: `类型错误: ${error.message}`
        };
    }
    
    selectTemplate(prompt) {
        const templates = [
            {
                name: 'function',
                pattern: /函数|function|def/i,
                template: `fn {{name}}({{params}}) {\n    {{body}}\n}`
            },
            {
                name: 'loop',
                pattern: /循环|loop|for|while/i,
                template: `for {{var}} in range({{start}}, {{end}}) {\n    {{body}}\n}`
            },
            {
                name: 'class',
                pattern: /类|class|对象|object/i,
                template: `class {{name}} {\n    init({{params}}) {\n        {{body}}\n    }\n}`
            }
        ];
        
        for (const template of templates) {
            if (template.pattern.test(prompt)) {
                return template;
            }
        }
        
        return {
            name: 'generic',
            template: '{{code}}'
        };
    }
    
    fillTemplate(template, options) {
        let code = template.template;
        
        for (const key in options) {
            const placeholder = `{{${key}}}`;
            code = code.replace(new RegExp(placeholder, 'g'), options[key] || '');
        }
        
        code = code.replace(/\{\{[^}]+\}\}/g, '');
        
        return code;
    }
    
    addSafetyChecks(code) {
        return code;
    }
    
    suggestImprovements(code) {
        const suggestions = [];
        
        try {
            const { Parser } = require('../../dist/core/parser.js');
            const parser = new Parser();
            const ast = parser.parse(code);
            
            if (this.hasDeepNesting(ast)) {
                suggestions.push({
                    type: 'refactor',
                    message: '代码嵌套层次过深，建议提取函数',
                    priority: 'medium'
                });
            }
            
            if (this.hasLongFunction(ast)) {
                suggestions.push({
                    type: 'refactor',
                    message: '函数过长，建议拆分成多个小函数',
                    priority: 'medium'
                });
            }
            
            if (this.hasDuplicateCode(ast)) {
                suggestions.push({
                    type: 'refactor',
                    message: '检测到重复代码，建议提取公共函数',
                    priority: 'low'
                });
            }
        } catch (error) {
            // 解析失败，跳过改进建议
        }
        
        return suggestions;
    }
    
    hasDeepNesting(ast, depth = 0) {
        if (!ast) return false;
        
        const maxDepth = 4;
        
        if (depth > maxDepth) return true;
        
        const nestingTypes = ['IfStatement', 'ForStatement', 'WhileStatement', 'FunctionDeclaration'];
        
        if (nestingTypes.includes(ast.type)) {
            for (const key in ast) {
                if (typeof ast[key] === 'object') {
                    if (this.hasDeepNesting(ast[key], depth + 1)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }
    
    hasLongFunction(ast) {
        if (!ast) return false;
        
        const maxLength = 50;
        
        if (ast.type === 'FunctionDeclaration') {
            const bodyLength = this.countStatements(ast.body);
            return bodyLength > maxLength;
        }
        
        for (const key in ast) {
            if (typeof ast[key] === 'object') {
                if (this.hasLongFunction(ast[key])) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    countStatements(node) {
        if (!node) return 0;
        
        if (Array.isArray(node)) {
            return node.reduce((sum, n) => sum + this.countStatements(n), 0);
        }
        
        if (typeof node === 'object') {
            let count = 1;
            for (const key in node) {
                if (typeof node[key] === 'object') {
                    count += this.countStatements(node[key]);
                }
            }
            return count;
        }
        
        return 0;
    }
    
    hasDuplicateCode(ast) {
        return false;
    }
    
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.validatedCode / this.stats.generatedCode || 0,
            fixRate: this.stats.fixedCode / this.stats.generatedCode || 0
        };
    }
    
    reset() {
        this.stats = {
            generatedCode: 0,
            validatedCode: 0,
            fixedCode: 0,
            rejectedCode: 0
        };
    }
}

module.exports = { AIIntegration };
