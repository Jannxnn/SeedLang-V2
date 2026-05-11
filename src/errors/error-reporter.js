/**
 * SeedLang 错误报告系统
 * 提供友好的错误信息、AI 友好的提示和智能修复建议
 */

const ERROR_CODES = {
    SYNTAX_ERROR: { code: 'E001', category: 'syntax', severity: 'error' },
    UNEXPECTED_TOKEN: { code: 'E002', category: 'syntax', severity: 'error' },
    UNCLOSED_STRING: { code: 'E003', category: 'syntax', severity: 'error' },
    UNCLOSED_BLOCK: { code: 'E004', category: 'syntax', severity: 'error' },

    UNDEFINED_VARIABLE: { code: 'E101', category: 'reference', severity: 'error' },
    UNDEFINED_FUNCTION: { code: 'E102', category: 'reference', severity: 'error' },
    UNDEFINED_CLASS: { code: 'E103', category: 'reference', severity: 'error' },
    UNDEFINED_MODULE: { code: 'E104', category: 'reference', severity: 'error' },
    REDECLARATION: { code: 'E105', category: 'reference', severity: 'error' },

    TYPE_MISMATCH: { code: 'E201', category: 'type', severity: 'error' },
    INVALID_OPERATION: { code: 'E202', category: 'type', severity: 'error' },
    MISSING_PROPERTY: { code: 'E203', category: 'type', severity: 'error' },
    TYPE_ARGUMENT_MISMATCH: { code: 'E204', category: 'type', severity: 'error' },

    ARGUMENT_COUNT: { code: 'E301', category: 'function', severity: 'error' },
    ARGUMENT_TYPE: { code: 'E302', category: 'function', severity: 'error' },
    MISSING_RETURN: { code: 'E303', category: 'function', severity: 'warning' },
    INCOMPATIBLE_RETURN: { code: 'E304', category: 'function', severity: 'error' },

    ARRAY_OUT_OF_BOUNDS: { code: 'E401', category: 'runtime', severity: 'error' },
    NULL_POINTER: { code: 'E402', category: 'runtime', severity: 'error' },
    DIVISION_BY_ZERO: { code: 'E403', category: 'runtime', severity: 'error' },
    STACK_OVERFLOW: { code: 'E404', category: 'runtime', severity: 'error' },
    INFINITE_LOOP: { code: 'E405', category: 'runtime', severity: 'warning' },

    MODULE_NOT_FOUND: { code: 'E501', category: 'module', severity: 'error' },
    IMPORT_FAILED: { code: 'E502', category: 'module', severity: 'error' },
    CIRCULAR_DEPENDENCY: { code: 'E503', category: 'module', severity: 'error' },

    PERMISSION_DENIED: { code: 'E601', category: 'security', severity: 'error' },
    UNSAFE_OPERATION: { code: 'E602', category: 'security', severity: 'error' },
    RESOURCE_LIMIT: { code: 'E603', category: 'security', severity: 'error' },

    UNKNOWN_OP: { code: 'E901', category: 'internal', severity: 'error' },
    INTERNAL_ERROR: { code: 'E902', category: 'internal', severity: 'error' }
};

const ERROR_SUGGESTIONS = {
    'E001': 'Check syntax for correct brackets, quotes, etc.',
    'E002': 'Check for unexpected characters or symbols',
    'E003': 'Ensure strings are properly closed with quotes',
    'E004': 'Ensure code blocks are properly closed with braces',

    'E101': 'Variable must be declared before use. Check spelling',
    'E102': 'Function not defined. Check function name or import module',
    'E103': 'Class not defined. Check class name',
    'E104': 'Module not found. Check module path',
    'E105': 'Variable already declared in scope. Use a different name',

    'E201': 'Type mismatch. Check if value type matches expected',
    'E202': 'Invalid operation. Check if operator applies to this type',
    'E203': 'Property does not exist. Check object has this property',
    'E204': 'Type argument mismatch. Check generic parameters',

    'E301': 'Incorrect argument count. Check function call arguments',
    'E302': 'Incorrect argument type. Check parameter types match signature',
    'E303': 'Function missing return statement. Add return statement',
    'E304': 'Return type incompatible. Check return value type',

    'E401': 'Array index out of bounds. Check index is within valid range',
    'E402': 'Null pointer access. Check if object is initialized',
    'E403': 'Division by zero. Add zero check',
    'E404': 'Stack overflow. Check for infinite recursion',
    'E405': 'Possible infinite loop. Add loop termination condition',

    'E501': 'Module not found. Check module path or install dependency',
    'E502': 'Import failed. Check module exports correctly',
    'E503': 'Circular dependency. Refactor to eliminate circular reference',

    'E601': 'Permission denied. Check if you have permission for this operation',
    'E602': 'Unsafe operation. Not allowed in sandbox environment',
    'E603': 'Resource limit. Reduce resource usage or increase limit',

    'E901': 'Internal error: unknown opcode. Please report this issue',
    'E902': 'Internal error. Please report this issue'
};

class ErrorReporter {
    constructor(options = {}) {
        this.colors = options.colors !== false;
        this.verbose = options.verbose || false;
        this.aiFriendly = options.aiFriendly || false;
        this.errors = [];
        this.warnings = [];
        this.suggestions = [];
    }

    static getErrorCodes() {
        return ERROR_CODES;
    }

    static getSuggestion(code) {
        return ERROR_SUGGESTIONS[code] || 'Please check your code';
    }

    report(error, source = '', options = {}) {
        const errorCode = ERROR_CODES[error.code] || { code: error.code || 'UNKNOWN', category: 'unknown', severity: 'error' };
        const suggestion = error.suggestion || ERROR_SUGGESTIONS[errorCode.code] || '';

        const errorInfo = {
            type: error.type || 'Error',
            message: error.message,
            line: error.line || 1,
            column: error.column || 1,
            context: error.context || '',
            suggestion,
            severity: error.severity || errorCode.severity,
            code: errorCode.code,
            category: errorCode.category,
            details: error.details || null
        };

        if (errorInfo.severity === 'warning') {
            this.warnings.push(errorInfo);
        } else {
            this.errors.push(errorInfo);
        }

        if (errorInfo.suggestion) {
            this.suggestions.push({
                line: errorInfo.line,
                suggestion: errorInfo.suggestion,
                code: errorInfo.code
            });
        }

        return this.formatError(errorInfo, source, options);
    }

    formatError(error, source, options = {}) {
        const lines = source.split('\n');
        const errorLine = lines[error.line - 1] || '';
        const lineNum = error.line.toString().padStart(4, ' ');

        let formatted = '\n';

        if (this.colors) {
            formatted += this.colorize(`[${error.severity.toUpperCase()}]`, error.severity === 'error' ? 'red' : 'yellow');
        } else {
            formatted += `[${error.severity.toUpperCase()}]`;
        }

        formatted += ` ${error.code}: ${error.message}\n\n`;

        formatted += `${lineNum} | ${errorLine}\n`;
        formatted += `     | ${' '.repeat(error.column - 1)}${'^'.repeat(Math.max(1, error.context.length || 1))}\n`;

        if (error.suggestion) {
            formatted += '\n';
            if (this.colors) {
                formatted += this.colorize('Hint: ', 'cyan') + error.suggestion + '\n';
            } else {
                formatted += `Hint: ${error.suggestion}\n`;
            }
        }

        if (this.aiFriendly) {
            formatted += '\n';
            formatted += this.generateAIFriendlyHint(error);
        }

        if (this.verbose && error.stack) {
            formatted += '\nStack trace:\n';
            formatted += error.stack + '\n';
        }

        return formatted;
    }

    generateAIFriendlyHint(error) {
        let hint = '--- AI Hint ---\n';

        switch (error.code) {
            case 'TYPE_MISMATCH':
                hint += 'Type mismatch. Please check:\n';
                hint += '1. Is the variable declaration type correct?\n';
                hint += '2. Does the assigned value match the type requirement?\n';
                hint += '3. Is type conversion needed?\n';
                break;

            case 'UNDEFINED_VARIABLE':
                hint += 'Undefined variable. Please check:\n';
                hint += '1. Is the variable declared?\n';
                hint += '2. Is the variable name spelled correctly?\n';
                hint += '3. Is the variable scope correct?\n';
                break;

            case 'FUNCTION_PARAM_MISMATCH':
                hint += 'Function parameter mismatch. Please check:\n';
                hint += '1. Is the parameter count correct?\n';
                hint += '2. Do parameter types match?\n';
                hint += '3. Is the function signature correct?\n';
                break;

            case 'ARRAY_OUT_OF_BOUNDS':
                hint += 'Array out of bounds. Please check:\n';
                hint += '1. Is array index within valid range?\n';
                hint += '2. Is array initialized?\n';
                hint += '3. Is boundary check needed?\n';
                break;

            case 'NULL_POINTER':
                hint += 'Null pointer error. Please check:\n';
                hint += '1. Is the object initialized?\n';
                hint += '2. Is null check needed?\n';
                hint += '3. Are optional types handled correctly?\n';
                break;

            default:
                hint += 'Please check your code syntax and semantics.\n';
        }

        return hint;
    }

    colorize(text, color) {
        const colors = {
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m',
            reset: '\x1b[0m'
        };

        return `${colors[color] || ''}${text}${colors.reset}`;
    }

    getErrors() {
        return this.errors;
    }

    getWarnings() {
        return this.warnings;
    }

    getSuggestions() {
        return this.suggestions;
    }

    hasErrors() {
        return this.errors.length > 0;
    }

    hasWarnings() {
        return this.warnings.length > 0;
    }

    reportError(type, message, location = null, suggestion = null) {
        const error = {
            type,
            message,
            location,
            suggestion,
            timestamp: Date.now()
        };

        this.errors.push(error);

        if (suggestion) {
            this.suggestions.push({
                line: location?.line || 0,
                suggestion,
                code: type
            });
        }

        return error;
    }

    reportWarning(message, location = null) {
        const warning = {
            type: 'Warning',
            message,
            location,
            timestamp: Date.now()
        };

        this.warnings.push(warning);
        return warning;
    }

    clear() {
        this.errors = [];
        this.warnings = [];
        this.suggestions = [];
    }

    getSummary() {
        let summary = '\n=== Error Summary ===\n';

        if (this.errors.length === 0 && this.warnings.length === 0) {
            summary += 'No errors or warnings\n';
            return summary;
        }

        if (this.errors.length > 0) {
            summary += `Found ${this.errors.length} error(s):\n`;
            this.errors.forEach((err, i) => {
                summary += `  ${i + 1}. [${err.code}] Line ${err.line}: ${err.message}\n`;
            });
        }

        if (this.warnings.length > 0) {
            summary += `\nFound ${this.warnings.length} warning(s):\n`;
            this.warnings.forEach((warn, i) => {
                summary += `  ${i + 1}. [${warn.code}] Line ${warn.line}: ${warn.message}\n`;
            });
        }

        if (this.suggestions.length > 0) {
            summary += '\nSuggestions:\n';
            this.suggestions.forEach((sug, i) => {
                summary += `  ${i + 1}. Line ${sug.line}: ${sug.suggestion}\n`;
            });
        }

        return summary;
    }

    generateFixSuggestions() {
        if (this.errors.length === 0) return [];

        const fixes = [];

        this.errors.forEach(error => {
            const fix = this.generateFix(error);
            if (fix) {
                fixes.push(fix);
            }
        });

        return fixes;
    }

    generateFix(error) {
        switch (error.code) {
            case 'TYPE_MISMATCH':
                return {
                    line: error.line,
                    type: 'type_cast',
                    description: 'Add type cast or modify type declaration',
                    example: `// Original code may have type mismatch\n// Suggest checking type declaration or adding type cast`
                };

            case 'UNDEFINED_VARIABLE':
                return {
                    line: error.line,
                    type: 'define_variable',
                    description: 'Declare undefined variable',
                    example: `let ${error.context} = ... // Add variable declaration`
                };

            case 'FUNCTION_PARAM_MISMATCH':
                return {
                    line: error.line,
                    type: 'fix_params',
                    description: 'Fix function parameters',
                    example: `// Check function call parameter count and types`
                };

            default:
                return null;
        }
    }
}

class ErrorSuggester {
    constructor() {
        this.commonErrors = this.initCommonErrors();
    }

    initCommonErrors() {
        return [
            {
                pattern: /Unexpected token/,
                suggestions: [
                    'Check for missing semicolon or comma',
                    'Check if brackets match',
                    'Check if string quotes are closed'
                ]
            },
            {
                pattern: /is not defined/,
                suggestions: [
                    'Check if variable name is spelled correctly',
                    'Check if variable is declared',
                    'Check variable scope'
                ]
            },
            {
                pattern: /Cannot read property/,
                suggestions: [
                    'Check if object is null or undefined',
                    'Check if property name is correct',
                    'Add null check'
                ]
            },
            {
                pattern: /is not a function/,
                suggestions: [
                    'Check if function name is correct',
                    'Check variable type',
                    'Check if function is defined'
                ]
            },
            {
                pattern: /Cannot find module/,
                suggestions: [
                    'Check if module path is correct',
                    'Check if module is installed',
                    'Check file extension'
                ]
            },
            {
                pattern: /Type error/,
                suggestions: [
                    'Check variable type',
                    'Add type conversion',
                    'Check function parameter types'
                ]
            }
        ];
    }

    suggest(errorMessage) {
        const suggestions = [];

        for (const { pattern, suggestions: sugs } of this.commonErrors) {
            if (pattern.test(errorMessage)) {
                suggestions.push(...sugs);
            }
        }

        return suggestions;
    }

    addCommonError(pattern, suggestions) {
        this.commonErrors.push({ pattern, suggestions });
    }
}

class SourceMapper {
    constructor() {
        this.mappings = new Map();
    }

    addMapping(sourceFile, generatedLine, generatedColumn, sourceLine, sourceColumn) {
        const key = `${sourceFile}:${generatedLine}:${generatedColumn}`;
        this.mappings.set(key, {
            sourceFile,
            generatedLine,
            generatedColumn,
            sourceLine,
            sourceColumn
        });
    }

    getMapping(sourceFile, generatedLine, generatedColumn) {
        const key = `${sourceFile}:${generatedLine}:${generatedColumn}`;
        return this.mappings.get(key);
    }

    getSourceLocation(sourceFile, generatedLine, generatedColumn) {
        const mapping = this.getMapping(sourceFile, generatedLine, generatedColumn);
        if (mapping) {
            return {
                file: mapping.sourceFile,
                line: mapping.sourceLine,
                column: mapping.sourceColumn
            };
        }
        return null;
    }

    clear() {
        this.mappings.clear();
    }
}

class ErrorContext {
    constructor(code, line, column) {
        this.code = code;
        this.line = line;
        this.column = column;
        this.lines = code.split('\n');
    }

    getContextLines(range = 2) {
        const start = Math.max(0, this.line - range - 1);
        const end = Math.min(this.lines.length, this.line + range);

        const contextLines = [];
        for (let i = start; i < end; i++) {
            const lineNumber = i + 1;
            const lineContent = this.lines[i];
            const isErrorLine = lineNumber === this.line;

            contextLines.push({
                lineNumber,
                content: lineContent,
                isError: isErrorLine,
                pointer: isErrorLine ? this.getPointer() : null
            });
        }

        return contextLines;
    }

    getPointer() {
        return ' '.repeat(this.column - 1) + '^';
    }

    formatContext(range = 2) {
        const contextLines = this.getContextLines(range);
        const formatted = [];

        for (const line of contextLines) {
            formatted.push(`  ${line.lineNumber} | ${line.content}`);
            if (line.isError && line.pointer) {
                formatted.push(`      | ${line.pointer}`);
            }
        }

        return formatted.join('\n');
    }
}

class FriendlyError extends Error {
    constructor(type, message, location = null, suggestion = null) {
        super(message);
        this.type = type;
        this.location = location;
        this.suggestion = suggestion;
        this.name = 'FriendlyError';
    }

    toString() {
        let str = `[${this.type}] ${this.message}`;

        if (this.location) {
            str += `\n  Location: ${this.location.file}:${this.location.line}:${this.location.column}`;
        }

        if (this.suggestion) {
            str += `\n  Suggestion: ${this.suggestion}`;
        }

        return str;
    }
}

module.exports = { ErrorReporter, ErrorSuggester, SourceMapper, ErrorContext, FriendlyError };
