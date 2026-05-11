'use strict';
// ============================================
// 解析器
// ============================================

const { SeedLangError } = require('./errors');

class Parser {
    parse(code) {
        this.toks = this.lex(code);
        this.i = 0;
        const body = [];
        while (this.i < this.toks.length) {
            while (this.at('punc', ';')) this.next();
            if (this.i >= this.toks.length) break;
            body.push(this.stmt());
        }
        return { type: 'program', body };
    }

    lex(code) {
        const t = [];
        let i = 0, ln = 1;
        const isD = c => c >= '0' && c <= '9';
        const isA = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
        const isUnicode = c => {
            const codePoint = c.codePointAt(0);
            return codePoint > 127 && (
                (codePoint >= 0x4E00 && codePoint <= 0x9FFF) ||
                (codePoint >= 0x3400 && codePoint <= 0x4DBF) ||
                (codePoint >= 0x20000 && codePoint <= 0x2A6DF) ||
                (codePoint >= 0x2A700 && codePoint <= 0x2B73F) ||
                (codePoint >= 0x2B740 && codePoint <= 0x2B81F) ||
                (codePoint >= 0x2B820 && codePoint <= 0x2CEAF) ||
                (codePoint >= 0x0400 && codePoint <= 0x04FF) ||
                (codePoint >= 0x0370 && codePoint <= 0x03FF) ||
                (codePoint >= 0x0600 && codePoint <= 0x06FF) ||
                (codePoint >= 0x0900 && codePoint <= 0x097F) ||
                (codePoint >= 0x3040 && codePoint <= 0x309F) ||
                (codePoint >= 0x30A0 && codePoint <= 0x30FF) ||
                (codePoint >= 0xAC00 && codePoint <= 0xD7AF)
            );
        };
        const isIdStart = c => isA(c) || isUnicode(c);
        const isIdChar = c => isA(c) || isD(c) || isUnicode(c);

        while (i < code.length) {
            const tokenLine = ln;
            if (code[i] === '\n') { ln++; i++; continue; }
            if (' \t\r'.includes(code[i])) { i++; continue; }
            if (code[i] === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
            if (code[i] === '/' && code[i + 1] === '*') { i += 2; while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') ln++; i++; } i += 2; continue; }

            if (code[i] === '`') {
                i++;
                const parts = [];
                let currentStr = '';
                while (i < code.length && code[i] !== '`') {
                    if (code[i] === '\n') ln++;
                    if (code[i] === '\\') {
                        i++;
                        const esc = code[i];
                        if (esc === 'n') currentStr += '\n';
                        else if (esc === 't') currentStr += '\t';
                        else if (esc === 'r') currentStr += '\r';
                        else if (esc === '\\') currentStr += '\\';
                        else if (esc === '`') currentStr += '`';
                        else if (esc === '$') currentStr += '$';
                        else currentStr += esc;
                        i++;
                    } else if (code[i] === '$' && code[i + 1] === '{') {
                        if (currentStr) {
                            parts.push({ type: 'string', value: currentStr });
                            currentStr = '';
                        }
                        i += 2;
                        let expr = '';
                        let braceCount = 1;
                        while (i < code.length && braceCount > 0) {
                            if (code[i] === '{') braceCount++;
                            else if (code[i] === '}') braceCount--;
                            if (braceCount > 0) {
                                if (code[i] === '\n') ln++;
                                expr += code[i];
                            }
                            i++;
                        }
                        if (expr.trim()) {
                            parts.push({ type: 'expr', value: expr.trim() });
                        }
                    } else {
                        currentStr += code[i];
                        i++;
                    }
                }
                if (currentStr) {
                    parts.push({ type: 'string', value: currentStr });
                }
                i++;
                if (parts.length === 0) {
                    t.push({ type: 'string', value: '', line: tokenLine });
                } else if (parts.length === 1 && parts[0].type === 'string') {
                    t.push({ type: 'string', value: parts[0].value, line: tokenLine });
                } else {
                    t.push({ type: 'template', parts, line: tokenLine });
                }
                continue;
            }

            if ('"\''.includes(code[i])) {
                const q = code[i++];
                let s = '';
                while (i < code.length && code[i] !== q) {
                    if (code[i] === '\n') ln++;
                    if (code[i] === '\\') {
                        i++;
                        const esc = code[i];
                        if (esc === 'n') s += '\n';
                        else if (esc === 't') s += '\t';
                        else if (esc === 'r') s += '\r';
                        else if (esc === '\\') s += '\\';
                        else if (esc === '"') s += '"';
                        else if (esc === "'") s += "'";
                        else s += esc;
                    } else s += code[i];
                    i++;
                }
                i++;
                t.push({ type: 'string', value: s, line: tokenLine });
                continue;
            }

            if (isD(code[i]) || (code[i] === '.' && isD(code[i + 1]))) {
                if (code[i] === '0' && i + 1 < code.length) {
                    const nextC = code[i + 1].toLowerCase();
                    if (nextC === 'b') {
                        i += 2;
                        let bin = '';
                        while (i < code.length && (code[i] === '0' || code[i] === '1')) bin += code[i++];
                        t.push({ type: 'number', value: bin.length > 0 ? parseInt(bin, 2) : 0, line: tokenLine });
                        continue;
                    }
                    if (nextC === 'o') {
                        i += 2;
                        let oct = '';
                        while (i < code.length && code[i] >= '0' && code[i] <= '7') oct += code[i++];
                        t.push({ type: 'number', value: oct.length > 0 ? parseInt(oct, 8) : 0, line: tokenLine });
                        continue;
                    }
                    if (nextC === 'x') {
                        i += 2;
                        let hex = '';
                        while (i < code.length && (isD(code[i]) || (code[i] >= 'a' && code[i] <= 'f') || (code[i] >= 'A' && code[i] <= 'F'))) hex += code[i++];
                        t.push({ type: 'number', value: hex.length > 0 ? parseInt(hex, 16) : 0, line: tokenLine });
                        continue;
                    }
                }
                let n = '';
                while (i < code.length && (isD(code[i]) || code[i] === '.')) n += code[i++];
                if (i < code.length && (code[i] === 'e' || code[i] === 'E')) {
                    n += code[i++];
                    if (i < code.length && (code[i] === '+' || code[i] === '-')) n += code[i++];
                    while (i < code.length && isD(code[i])) n += code[i++];
                }
                t.push({ type: 'number', value: parseFloat(n), line: tokenLine });
                continue;
            }

            if (isIdStart(code[i])) {
                let id = '';
                while (i < code.length && isIdChar(code[i])) id += code[i++];
                const kw = ['fn', 'if', 'else', 'while', 'for', 'return', 'true', 'false', 'null', 'and', 'or', 'not', 'in', 'import', 'as', 'let', 'var', 'const', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'class', 'extends', 'new', 'super', 'break', 'continue', 'match', 'coro', 'yield', 'macro', 'proc_macro', 'static', 'switch', 'case', 'default'];
                t.push({ type: kw.includes(id) ? 'kw' : 'id', value: id, line: tokenLine });
                continue;
            }

            const tc3 = code.substr(i, 3);
            if (tc3 === '...') { t.push({ type: 'op', value: tc3, line: tokenLine }); i += 3; continue; }
            if (tc3 === '>>>') { t.push({ type: 'op', value: tc3, line: tokenLine }); i += 3; continue; }
            const tc = code.substr(i, 2);
            if (['==', '!=', '<=', '>=', '&&', '||', '=>', '<<', '>>', '+=', '-=', '*=', '/=', '%='].includes(tc)) { t.push({ type: 'op', value: tc, line: tokenLine }); i += 2; continue; }
            if ('+-*/%<>=!'.includes(code[i])) { t.push({ type: 'op', value: code[i++], line: tokenLine }); continue; }
            if (code[i] === '&' || code[i] === '|' || code[i] === '^' || code[i] === '~') { t.push({ type: 'op', value: code[i++], line: tokenLine }); continue; }
            if ('(){}[]:'.includes(code[i])) { t.push({ type: 'punc', value: code[i++], line: tokenLine }); continue; }
            if (code[i] === ',') { t.push({ type: 'punc', value: code[i++], line: tokenLine }); continue; }
            if (code[i] === '.') { t.push({ type: 'punc', value: code[i++], line: tokenLine }); continue; }
            if (code[i] === ';') { t.push({ type: 'punc', value: code[i++], line: tokenLine }); continue; }
            if (code[i] === '@' || code[i] === '#' || code[i] === '?' || code[i] === '\\') {
                t.push({ type: 'op', value: code[i], line: tokenLine }); i++; continue;
            }
            i++;
        }
        return t;
    }

    currentLine() {
        return this.toks[this.i]?.line || 0;
    }

    stmt() {
        const line = this.currentLine();
        if (this.at('kw', 'fn')) return this.func();
        if (this.at('kw', 'coro')) return this.coroStmt();
        if (this.at('kw', 'macro')) return this.macroStmt();
        if (this.at('kw', 'proc_macro')) return this.procMacroStmt();
        if (this.at('kw', 'yield')) { this.next(); return { type: 'Yield', value: this.expr(), line }; }
        if (this.at('kw', 'if')) return this.ifStmt();
        if (this.at('kw', 'while')) return this.whileStmt();
        if (this.at('kw', 'for')) return this.forStmt();
        if (this.at('kw', 'return')) { this.next(); return { type: 'return', value: this.expr(), line }; }
        if (this.at('kw', 'import')) { this.next(); let importMacros = false; if (this.at('kw', 'macro')) { this.next(); importMacros = true; } const m = this.expect('string').value; let a = null; if (this.at('kw', 'as')) { this.next(); a = this.expect('id').value; } return { type: 'import', moduleName: m, alias: a, importMacros, line }; }
        if (this.at('kw', 'try')) return this.tryStmt();
        if (this.at('kw', 'throw')) { this.next(); return { type: 'throw', value: this.expr(), line }; }
        if (this.at('kw', 'class')) return this.classStmt();
        if (this.at('kw', 'async')) return this.asyncStmt();
        if (this.at('kw', 'break')) { this.next(); return { type: 'Break', line }; }
        if (this.at('kw', 'continue')) { this.next(); return { type: 'Continue', line }; }
        if (this.at('kw', 'switch')) return this.switchStmt();
        if (this.at('kw', 'let') || this.at('kw', 'var') || this.at('kw', 'const')) {
            this.next();
            const name = this.expect('id').value;
            let init = null;
            if (this.at('op', '=')) {
                this.next();
                init = this.expr();
            }
            return { type: 'varDecl', pattern: { type: 'id', name }, init, line };
        }

        const e = this.expr();
        if (e?.type === 'assign' && e.left.type === 'id') return { type: 'assign', left: e.left, right: e.right, line };
        return { type: 'expr', expr: e };
    }

    macroStmt() {
        this.expect('kw', 'macro');
        const name = this.expect('id').value;
        this.expect('punc', '(');
        const params = [];
        while (!this.at('punc', ')')) { params.push(this.expect('id').value); }
        this.expect('punc', ')');
        const body = this.block();
        return { type: 'MacroDef', name, params, body };
    }

    procMacroStmt() {
        this.expect('kw', 'proc_macro');
        const name = this.expect('id').value;
        this.expect('punc', '(');
        const params = [];
        while (!this.at('punc', ')')) { params.push(this.expect('id').value); }
        this.expect('punc', ')');
        const body = this.block();
        return { type: 'ProcMacroDef', name, params, body };
    }

    coroStmt() {
        this.expect('kw', 'coro');
        const name = this.expect('id').value;
        this.expect('punc', '(');
        const params = [];
        while (!this.at('punc', ')')) { params.push(this.expect('id').value); if (this.at('punc', ',')) this.next(); }
        this.expect('punc', ')');
        const body = this.block();
        return { type: 'CoroutineDef', name, params, body };
    }

    tryStmt() {
        this.expect('kw', 'try');
        const tryBlock = this.block();
        let catchClause = null;
        let finallyBlock = null;

        if (this.at('kw', 'catch')) {
            this.next();
            let catchVar = null;
            if (this.at('punc', '(')) {
                this.next();
                catchVar = this.expect('id').value;
                this.expect('punc', ')');
            } else if (this.at('id')) {
                catchVar = this.expect('id').value;
            }
            const catchBlock = this.block();
            catchClause = { variable: catchVar, body: catchBlock };
        }

        if (this.at('kw', 'finally')) {
            this.next();
            finallyBlock = this.block();
        }

        return { type: 'try', tryBlock, catchClause, finallyBlock };
    }

    classStmt() {
        this.expect('kw', 'class');
        const name = this.expect('id').value;
        let superClass = null;
        if (this.at('kw', 'extends')) {
            this.next();
            superClass = this.expect('id').value;
        }
        this.expect('punc', '{');
        const methods = [];
        while (!this.at('punc', '}')) {
            const isStatic = this.at('kw', 'static');
            if (isStatic) this.next();
            if (this.at('kw', 'fn')) this.next();
            const methodName = this.expect('id').value;
            this.expect('punc', '(');
            const params = [];
            while (!this.at('punc', ')')) { params.push(this.expect('id').value); if (this.at('punc', ',')) this.next(); }
            this.expect('punc', ')');
            const body = this.block();
            methods.push({ name: methodName, params, body, isStatic });
        }
        this.expect('punc', '}');
        return { type: 'class', name, superClass, methods };
    }

    asyncStmt() {
        this.next();
        if (this.at('kw', 'fn')) {
            return { ...this.func(), async: true };
        }
        return { type: 'expr', expr: this.expr() };
    }

    func() {
        this.expect('kw', 'fn');
        const name = this.at('id') ? this.next().value : null;

        let genericParams = null;
        if (this.at('op', '<')) {
            this.next();
            genericParams = [];
            while (!this.at('op', '>')) {
                genericParams.push(this.expect('id').value);
                if (this.at('punc', ',')) this.next();
            }
            this.expect('op', '>');
        }

        this.expect('punc', '(');
        const params = [];
        while (!this.at('punc', ')')) { params.push(this.expect('id').value); if (this.at('punc', ',')) this.next(); }
        this.expect('punc', ')');
        return { type: 'function', name, params, genericParams, body: this.block() };
    }

    ifStmt() {
        this.expect('kw', 'if');
        const cond = this.expr();
        const then = this.block();
        let els = null;
        if (this.at('kw', 'else')) {
            this.next();
            els = this.at('kw', 'if') ? this.ifStmt() : this.block();
        }
        return { type: 'if', condition: cond, then, else: els };
    }

    whileStmt() {
        this.expect('kw', 'while');
        return { type: 'while', condition: this.expr(), body: this.block() };
    }

    forStmt() {
        this.expect('kw', 'for');
        if (this.at('punc', '(')) {
            this.next();
            let init = null;
            let condition = null;
            let update = null;
            if (!this.at('punc', ';')) {
                if (this.at('kw', 'let') || this.at('kw', 'var')) {
                    this.next();
                    const name = this.expect('id').value;
                    let initExpr = null;
                    if (this.at('op', '=')) {
                        this.next();
                        initExpr = this.expr();
                    }
                    init = { type: 'varDecl', pattern: { type: 'id', name }, init: initExpr };
                } else {
                    init = { type: 'expr', expr: this.expr() };
                }
            }
            this.expect('punc', ';');
            if (!this.at('punc', ';')) condition = this.expr();
            this.expect('punc', ';');
            if (!this.at('punc', ')')) update = { type: 'expr', expr: this.expr() };
            this.expect('punc', ')');
            return {
                type: 'forC',
                init,
                condition: condition || { type: 'boolean', value: true },
                update,
                body: this.block()
            };
        }
        const v = this.expect('id').value;
        this.expect('kw', 'in');
        return { type: 'forIn', keyVar: v, iterable: this.expr(), body: this.block() };
    }

    switchStmt() {
        this.expect('kw', 'switch');
        const subject = this.expr();
        this.expect('punc', '{');
        const cases = [];
        let defaultBody = null;
        while (!this.at('punc', '}')) {
            if (this.at('kw', 'case')) {
                this.next();
                const value = this.expr();
                this.expect('punc', ':');
                const body = [];
                while (!this.at('kw', 'case') && !this.at('kw', 'default') && !this.at('punc', '}')) {
                    while (this.at('punc', ';')) this.next();
                    if (this.at('kw', 'case') || this.at('kw', 'default') || this.at('punc', '}')) break;
                    body.push(this.stmt());
                }
                cases.push({ value, body });
            } else if (this.at('kw', 'default')) {
                this.next();
                this.expect('punc', ':');
                defaultBody = [];
                while (!this.at('kw', 'case') && !this.at('punc', '}')) {
                    while (this.at('punc', ';')) this.next();
                    if (this.at('kw', 'case') || this.at('punc', '}')) break;
                    defaultBody.push(this.stmt());
                }
            } else {
                break;
            }
        }
        this.expect('punc', '}');
        return { type: 'switch', subject, cases, defaultBody };
    }

    block() {
        this.expect('punc', '{');
        const b = [];
        while (!this.at('punc', '}')) {
            while (this.at('punc', ';')) this.next();
            if (this.at('punc', '}')) break;
            b.push(this.stmt());
        }
        this.expect('punc', '}');
        return b;
    }

    expr() { return this.assign(); }
    assign() {
        const l = this.conditional();
        if (this.at('op', '=')) { this.next(); return { type: 'assign', left: l, right: this.assign() }; }
        if (this.at('op', '+=') || this.at('op', '-=') || this.at('op', '*=') || this.at('op', '/=') || this.at('op', '%=')) {
            const o = this.next().value;
            return { type: 'assign', left: l, right: { type: 'binary', op: o[0], left: l, right: this.assign() } };
        }
        return l;
    }
    conditional() {
        const c = this.or();
        if (this.at('op', '?')) {
            this.next();
            const then = this.conditional();
            this.expect('punc', ':');
            const els = this.conditional();
            return { type: 'conditional', condition: c, then, else: els };
        }
        return c;
    }
    or() { let l = this.xor(); while (this.at('kw', 'or') || this.at('op', '||')) { this.next(); l = { type: 'binary', op: 'or', left: l, right: this.xor() }; } return l; }
    xor() { let l = this.bitor(); while (this.at('op', '^')) { this.next(); l = { type: 'binary', op: '^', left: l, right: this.bitor() }; } return l; }
    bitor() { let l = this.bitand(); while (this.at('op', '|')) { this.next(); l = { type: 'binary', op: '|', left: l, right: this.bitand() }; } return l; }
    bitand() { let l = this.and(); while (this.at('op', '&')) { this.next(); l = { type: 'binary', op: '&', left: l, right: this.and() }; } return l; }
    and() { let l = this.eq(); while (this.at('kw', 'and') || this.at('op', '&&')) { this.next(); l = { type: 'binary', op: 'and', left: l, right: this.eq() }; } return l; }
    eq() { let l = this.cmp(); while (this.at('op', '==') || this.at('op', '!=')) { const o = this.next().value; l = { type: 'binary', op: o, left: l, right: this.cmp() }; } return l; }
    cmp() { let l = this.shift(); while (['<', '>', '<=', '>='].includes(this.peek()?.value) && this.peek()?.type === 'op') { const o = this.next().value; l = { type: 'binary', op: o, left: l, right: this.shift() }; } return l; }
    shift() { let l = this.add(); while (this.at('op', '<<') || this.at('op', '>>') || this.at('op', '>>>')) { const o = this.next().value; l = { type: 'binary', op: o, left: l, right: this.add() }; } return l; }
    isNumericLikeNode(node) {
        if (!node) return false;
        if (node.type === 'number') return true;
        return node.type === 'unary' && node.op === '-' && node.operand?.type === 'number';
    }
    shouldSplitNegativeCallArg(leftNode) {
        if (!this._inCallArgList) return false;
        if (!this.at('op', '-')) return false;
        const nextTok = this.toks[this.i + 1];
        if (!nextTok || nextTok.type !== 'number') return false;
        if (leftNode && (leftNode.type === 'number' || leftNode.type === 'id' || leftNode.type === 'call' || leftNode.type === 'member' || leftNode.type === 'index' || leftNode.type === 'binary' || leftNode.type === 'unary')) return false;
        return true;
    }
    parseCallArgExpr() {
        this._inCallArgList = true;
        try {
            return this.expr();
        } finally {
            this._inCallArgList = false;
        }
    }
    add() {
        let l = this.mul();
        while (this.at('op', '+') || this.at('op', '-')) {
            if (this.shouldSplitNegativeCallArg(l)) break;
            const o = this.next().value;
            l = { type: 'binary', op: o, left: l, right: this.mul() };
        }
        return l;
    }
    mul() { let l = this.unary(); while (['*', '/', '%'].includes(this.peek()?.value)) { const o = this.next().value; l = { type: 'binary', op: o, left: l, right: this.unary() }; } return l; }
    unary() {
        if (this.at('op', '-') || this.at('kw', 'not') || this.at('op', '!')) {
            const o = this.next().value;
            return { type: 'unary', op: o === '!' ? 'not' : o, operand: this.unary() };
        }
        if (this.at('op', '~')) {
            this.next();
            return { type: 'unary', op: '~', operand: this.unary() };
        }
        if (this.at('kw', 'await')) {
            this.next();
            return { type: 'await', expr: this.unary() };
        }
        return this.call();
    }
    call() {
        let e = this.primary();
        const isNonCallableLiteral = (node) => {
            if (!node || typeof node !== 'object') return false;
            return node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null' || node.type === 'array' || node.type === 'object';
        };
        while (true) {
            if (this.at('op', '<') && this.isGenericCall()) {
                this.next();
                const typeArgs = [];
                while (!this.at('op', '>')) {
                    typeArgs.push(this.parseTypeArg());
                    if (this.at('punc', ',')) this.next();
                }
                this.expect('op', '>');
                this.expect('punc', '(');
                const args = [];
                while (!this.at('punc', ')')) { args.push(this.parseCallArgExpr()); if (this.at('punc', ',')) this.next(); }
                this.expect('punc', ')');
                e = { type: 'GenericCall', callee: e, typeArgs, args };
            } else if (this.at('op', '!') && this.toks[this.i + 1]?.type === 'punc' && this.toks[this.i + 1]?.value === '(') {
                this.next();
                this.expect('punc', '(');
                const args = [];
                while (!this.at('punc', ')')) { args.push(this.parseCallArgExpr()); }
                this.expect('punc', ')');
                e = { type: 'MacroCall', name: e.name, args };
            } else if (this.at('punc', '(')) {
                // In call-argument context, `foo("x" (a - b))` should be parsed
                // as two args (`"x"` and `(a - b)`), not as calling string literal.
                if (this._inCallArgList && isNonCallableLiteral(e)) break;
                this.next();
                const args = [];
                while (!this.at('punc', ')')) { args.push(this.parseCallArgExpr()); if (this.at('punc', ',')) this.next(); }
                this.expect('punc', ')');
                e = { type: 'call', callee: e, args };
            } else if (this.at('punc', '.')) {
                this.next();
                e = { type: 'member', object: e, property: this.expect('id').value };
            } else if (this.at('punc', '[')) {
                this.next();
                const idx = this.expr();
                this.expect('punc', ']');
                e = { type: 'index', object: e, index: idx };
            } else break;
        }
        return e;
    }

    isGenericCall() {
        let depth = 1;
        let i = this.i + 1;
        let foundClosingBracket = false;
        while (i < this.toks.length && depth > 0) {
            const t = this.toks[i];
            if (t.type === 'op' && t.value === '<') depth++;
            else if (t.type === 'op' && (t.value === '>' || t.value === '>=')) {
                depth--;
                if (depth === 0) foundClosingBracket = true;
            }
            else if (t.type === 'op' && ['<', '<=', '==', '!=', '>='].includes(t.value) && depth === 1) return false;
            else if (t.type === 'op' && ['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>'].includes(t.value) && depth === 1) return false;
            else if (t.type === 'punc' && t.value === '(' && depth === 1) return foundClosingBracket;
            else if (t.type === 'punc' && t.value === '{' && depth === 1) return false;
            else if ((t.type === 'punc' && (t.value === ')' || t.value === '}')) && depth === 1) return false;
            else if (t.type === 'kw' && depth === 1) return false;
            i++;
        }
        if (foundClosingBracket && i < this.toks.length) {
            const next = this.toks[i];
            if (next.type === 'punc' && next.value === '(') {
                let parenDepth = 1;
                let j = i + 1;
                while (j < this.toks.length && parenDepth > 0) {
                    if (this.toks[j].type === 'punc' && this.toks[j].value === '(') parenDepth++;
                    else if (this.toks[j].type === 'punc' && this.toks[j].value === ')') parenDepth--;
                    j++;
                }
                if (j < this.toks.length) {
                    const after = this.toks[j];
                    if (after.type === 'punc' && after.value === '{') {
                        return false;
                    }
                }
                return true;
            }
        }
        return false;
    }

    parseTypeArg() {
        if (this.at('id')) {
            return { kind: 'named', name: this.next().value };
        }
        return { kind: 'unknown' };
    }
    primary() {
        if (this.at('number')) return { type: 'number', value: this.next().value };
        if (this.at('string')) return { type: 'string', value: this.next().value };
        if (this.at('template')) { const t = this.next(); return { type: 'template', parts: t.parts }; }
        if (this.at('kw', 'true')) { this.next(); return { type: 'boolean', value: true }; }
        if (this.at('kw', 'false')) { this.next(); return { type: 'boolean', value: false }; }
        if (this.at('kw', 'null')) { this.next(); return { type: 'null' }; }
        if (this.at('kw', 'fn')) return this.func();
        if (this.at('kw', 'match')) return this.matchExpr();
        if (this.at('kw', 'new')) {
            this.next();
            const className = this.expect('id').value;
            this.expect('punc', '(');
            const args = [];
            while (!this.at('punc', ')')) { args.push(this.parseCallArgExpr()); if (this.at('punc', ',')) this.next(); }
            this.expect('punc', ')');
            return { type: 'new', className, args };
        }
        if (this.at('kw', 'super')) {
            this.next();
            if (this.at('punc', '.')) {
                this.next();
                const methodName = this.expect('id').value;
                this.expect('punc', '(');
                const args = [];
                while (!this.at('punc', ')')) { args.push(this.parseCallArgExpr()); if (this.at('punc', ',')) this.next(); }
                this.expect('punc', ')');
                return { type: 'SuperCallExpression', method: methodName, args };
            }
            this.expect('punc', '(');
            const args = [];
            while (!this.at('punc', ')')) { args.push(this.parseCallArgExpr()); if (this.at('punc', ',')) this.next(); }
            this.expect('punc', ')');
            return { type: 'superCall', args };
        }
        if (this.at('id')) return { type: 'id', name: this.next().value };
        if (this.at('punc', '(')) {
            const saved = this.i;
            this.next();
            const params = [];
            if (!this.at('punc', ')')) {
                if (this.at('id')) params.push(this.next().value);
                while (this.at('punc', ',')) { this.next(); if (this.at('id')) params.push(this.next().value); }
            }
            if (this.at('punc', ')')) {
                this.next();
                if (this.at('op', '=>')) {
                    this.next();
                    let body;
                    if (this.at('punc', '{')) { body = this.block(); }
                    else { const e = this.expr(); body = [{ type: 'return', value: e }]; }
                    return { type: 'function', name: null, params, body };
                }
            }
            this.i = saved;
            this.next();
            const e = this.expr();
            this.expect('punc', ')');
            return e;
        }
        if (this.at('punc', '[')) {
            this.next();
            const el = [];
            while (!this.at('punc', ']')) { el.push(this.expr()); if (this.at('punc', ',')) this.next(); }
            this.expect('punc', ']');
            return { type: 'array', elements: el };
        }
        if (this.at('punc', '{')) {
            this.next();
            const p = [];
            while (!this.at('punc', '}')) {
                let k;
                if (this.at('string')) {
                    k = this.next().value;
                } else if (this.at('id')) {
                    k = this.next().value;
                } else {
                    throw new Error('Expected property name');
                }
                this.expect('punc', ':');
                const v = this.expr();
                p.push({ key: k, value: v });
                if (this.at('punc', ',')) this.next();
            }
            this.expect('punc', '}');
            return { type: 'object', pairs: p };
        }
        return { type: 'error', value: this.peek()?.value, line: this.peek()?.line };
    }

    matchExpr() {
        this.expect('kw', 'match');
        const expr = this.matchSubject();
        this.expect('punc', '{');
        const cases = [];
        while (!this.at('punc', '}')) {
            cases.push(this.matchCase());
        }
        this.expect('punc', '}');
        return { type: 'match', expr, cases };
    }

    matchSubject() {
        if (this.at('punc', '(')) {
            this.next();
            const e = this.expr();
            this.expect('punc', ')');
            return e;
        }
        if (this.at('number')) return { type: 'number', value: this.next().value };
        if (this.at('string')) return { type: 'string', value: this.next().value };
        if (this.at('kw', 'true')) { this.next(); return { type: 'boolean', value: true }; }
        if (this.at('kw', 'false')) { this.next(); return { type: 'boolean', value: false }; }
        if (this.at('kw', 'null')) { this.next(); return { type: 'null' }; }
        if (this.at('id')) return { type: 'id', name: this.next().value };
        if (this.at('punc', '[')) return this.arrayLiteral();
        if (this.at('punc', '{')) return this.objectLiteral();
        throw new Error('Expected expression after match');
    }

    arrayLiteral() {
        this.next();
        const el = [];
        while (!this.at('punc', ']')) { el.push(this.expr()); if (this.at('punc', ',')) this.next(); }
        this.expect('punc', ']');
        return { type: 'array', elements: el };
    }

    objectLiteral() {
        this.next();
        const p = [];
        while (!this.at('punc', '}')) {
            if (this.at('op', '...')) {
                this.next();
                const spreadValue = this.expr();
                if (this.at('punc', ':') && spreadValue && spreadValue.type === 'index') {
                    p.push({ spread: true, value: spreadValue.object });
                    this.next();
                    const computedValue = this.expr();
                    p.push({ spread: false, computed: true, keyExpr: spreadValue.index, value: computedValue });
                } else {
                    p.push({ spread: true, value: spreadValue });
                }
                if (this.at('punc', ',')) this.next();
                continue;
            }
            if (this.at('punc', '[')) {
                this.next();
                const keyExpr = this.expr();
                this.expect('punc', ']');
                this.expect('punc', ':');
                const v = this.expr();
                p.push({ spread: false, computed: true, keyExpr, value: v });
                if (this.at('punc', ',')) this.next();
                continue;
            }
            let k;
            if (this.at('string')) {
                k = this.next().value;
            } else if (this.at('id')) {
                k = this.next().value;
            } else {
                throw new Error('Expected property key (identifier, string literal, spread, or computed key)');
            }
            let v;
            if (this.at('punc', ':')) {
                this.next();
                v = this.expr();
            } else if (typeof k === 'string' && /^[A-Za-z_]/.test(k)) {
                v = { type: 'id', name: k };
            } else {
                throw new Error("Expected ':' after string-literal property key");
            }
            p.push({ spread: false, key: k, value: v });
            if (this.at('punc', ',')) this.next();
        }
        this.expect('punc', '}');
        return { type: 'object', pairs: p };
    }

    matchCase() {
        const pattern = this.parsePattern();
        let guard = null;
        if (this.at('kw', 'if')) {
            this.next();
            guard = this.expr();
        }
        this.expect('op', '=>');
        let body;
        if (this.at('punc', '{')) {
            body = this.block();
        } else {
            body = [{ type: 'expr', expr: this.expr() }];
        }
        return { pattern, guard, body };
    }

    parsePattern() {
        return this.parseOrPattern();
    }

    parseOrPattern() {
        let pattern = this.parsePrimaryPattern();
        while (this.at('op', '|')) {
            this.next();
            const right = this.parsePrimaryPattern();
            pattern = { kind: 'or', patterns: [pattern, right] };
        }
        return pattern;
    }

    parsePrimaryPattern() {
        if (this.at('id') && this.peek().value === '_') {
            this.next();
            return { kind: 'wildcard' };
        }
        if (this.at('number')) {
            const num = this.next().value;
            return { kind: 'literal', value: num };
        }
        if (this.at('string')) {
            return { kind: 'literal', value: this.next().value };
        }
        if (this.at('kw', 'true')) { this.next(); return { kind: 'literal', value: true }; }
        if (this.at('kw', 'false')) { this.next(); return { kind: 'literal', value: false }; }
        if (this.at('kw', 'null')) { this.next(); return { kind: 'literal', value: null }; }
        if (this.at('punc', '[')) return this.parseArrayPattern();
        if (this.at('punc', '{')) return this.parseObjectPattern();
        if (this.at('id')) {
            const name = this.next().value;
            return { kind: 'identifier', name };
        }
        throw new Error('Invalid pattern');
    }

    parseArrayPattern() {
        this.next();
        const elements = [];
        while (!this.at('punc', ']')) {
            elements.push(this.parsePattern());
            if (this.at('punc', ',')) this.next();
        }
        this.expect('punc', ']');
        return { kind: 'array', elements };
    }

    parseObjectPattern() {
        this.next();
        const properties = [];
        while (!this.at('punc', '}')) {
            const key = this.expect('id').value;
            let pattern = { kind: 'identifier', name: key };
            if (this.at('punc', ':')) {
                this.next();
                pattern = this.parsePattern();
            }
            properties.push({ key, pattern });
            if (this.at('punc', ',')) this.next();
        }
        this.expect('punc', '}');
        return { kind: 'object', properties };
    }

    at(t, v) { const p = this.peek(); return p && p.type === t && (v === undefined || p.value === v); }
    peek() { return this.toks[this.i]; }
    next() { return this.toks[this.i++]; }
    expect(t, v) {
        if (!this.at(t, v)) {
            const line = this.currentLine();
            const found = this.toks[this.i]?.value || 'EOF';
            throw new SeedLangError(`Syntax error: expected ${v || t}, but found '${found}'`, 'SyntaxError', line);
        }
        return this.next();
    }
}

module.exports = { Parser };
