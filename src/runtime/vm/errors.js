'use strict';
// ============================================
// 错误类型
// ============================================

class SeedLangError extends Error {
    constructor(message, type = 'RuntimeError', line = 0, stack = [], column = 0, code = null) {
        super(message);
        this.name = 'SeedLangError';
        this.type = type;
        this.line = line;
        this.column = column;
        this.code = code;
        this.stackTrace = stack;
    }

    static fromRuntime(message, lineMap, ip, callStack, source) {
        const line = lineMap?.[ip] || 0;
        const stack = callStack || [];
        let type = 'RuntimeError';
        let code = 'E902';
        if (/undefined/i.test(message) || /not defined/i.test(message)) { type = 'ReferenceError'; code = 'E101'; }
        else if (/type/i.test(message) || /not a function/i.test(message)) { type = 'TypeError'; code = 'E201'; }
        else if (/division.*zero/i.test(message) || /divide.*zero/i.test(message)) { type = 'ArithmeticError'; code = 'E403'; }
        else if (/stack.*overflow/i.test(message) || /recursion/i.test(message)) { type = 'StackOverflowError'; code = 'E404'; }
        else if (/index.*out.*bound/i.test(message) || /out of range/i.test(message)) { type = 'IndexError'; code = 'E401'; }
        else if (/null/i.test(message) || /cannot read/i.test(message)) { type = 'NullPointerError'; code = 'E402'; }
        return new SeedLangError(message, type, line, stack, 0, code);
    }

    toString() {
        let msg = `${this.type}`;
        if (this.code) msg += ` [${this.code}]`;
        msg += `: ${this.message}`;
        if (this.line > 0) {
            msg += ` (line ${this.line}`;
            if (this.column > 0) msg += `, col ${this.column}`;
            msg += ')';
        }
        if (this.stackTrace.length > 0) {
            msg += '\nCall stack:';
            for (const frame of this.stackTrace) {
                msg += `\n  at ${frame.name}() (line ${frame.line})`;
            }
        }
        return msg;
    }
}

module.exports = { SeedLangError };
