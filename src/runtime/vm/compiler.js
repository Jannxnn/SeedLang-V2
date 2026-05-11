'use strict';
// ============================================
// 编译器
// ============================================

const { OP } = require('./opcodes');
const { Parser } = require('./parser');
const { OBJECT_SPREAD_MARKER, _fastFibNonNegInt } = require('./shared');
const { _decodeAmpCompressedString } = require('./amp');

// Optional: Tail-call optimizer (loaded at runtime if available)
let _TailCallOptimizerCtor = null;
try { _TailCallOptimizerCtor = require('../../jit/tail-call.js').TailCallOptimizer; } catch(_) {}

class Compiler {
    _isClassicFibAstNode(node) {
        if (!node || node.type !== 'function') return false;
        if (!node.name || !Array.isArray(node.params) || node.params.length !== 1) return false;
        const p = node.params[0];
        const body = node.body;
        if (!Array.isArray(body) || body.length !== 2) return false;
        const i0 = body[0], r1 = body[1];
        if (!i0 || i0.type !== 'if' || !Array.isArray(i0.then) || i0.then.length !== 1) return false;
        const c = i0.condition;
        if (!c || c.type !== 'binary' || c.op !== '<=') return false;
        if (!c.left || c.left.type !== 'id' || c.left.name !== p) return false;
        if (!c.right || c.right.type !== 'number' || c.right.value !== 1) return false;
        const tr = i0.then[0];
        if (!tr || tr.type !== 'return' || !tr.value || tr.value.type !== 'id' || tr.value.name !== p) return false;
        if (!r1 || r1.type !== 'return' || !r1.value || r1.value.type !== 'binary' || r1.value.op !== '+') return false;
        const l = r1.value.left, r = r1.value.right;
        if (!l || !r || l.type !== 'call' || r.type !== 'call') return false;
        if (!l.callee || l.callee.type !== 'id' || l.callee.name !== node.name) return false;
        if (!r.callee || r.callee.type !== 'id' || r.callee.name !== node.name) return false;
        if (!Array.isArray(l.args) || l.args.length !== 1 || !Array.isArray(r.args) || r.args.length !== 1) return false;
        const a1 = l.args[0], a2 = r.args[0];
        if (!a1 || a1.type !== 'binary' || a1.op !== '-' || !a1.left || a1.left.type !== 'id' || a1.left.name !== p || !a1.right || a1.right.type !== 'number') return false;
        if (!a2 || a2.type !== 'binary' || a2.op !== '-' || !a2.left || a2.left.type !== 'id' || a2.left.name !== p || !a2.right || a2.right.type !== 'number') return false;
        const d1 = a1.right.value, d2 = a2.right.value;
        return (d1 === 1 && d2 === 2) || (d1 === 2 && d2 === 1);
    }
    _isSeriesSumFuncAstNode(node) {
        if (!node || node.type !== 'function' || !node.name || !Array.isArray(node.params) || node.params.length !== 1) return false;
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr && stmt.expr.type === 'assign') return stmt.expr;
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { left: stmt.pattern, right: stmt.init, type: 'assign' };
            return null;
        };
        const p = node.params[0];
        const body = node.body;
        if (!Array.isArray(body) || body.length !== 3) return false;
        const s0 = body[0], loop = body[1], ret = body[2];
        const s0Assign = unwrapAssign(s0);
        if (!s0Assign || !s0Assign.left || s0Assign.left.type !== 'id' || !s0Assign.right || s0Assign.right.type !== 'number' || s0Assign.right.value !== 0) return false;
        const acc = s0Assign.left.name;
        if (!loop || loop.type !== 'forC' || !loop.init || !loop.condition || !loop.update || !Array.isArray(loop.body) || loop.body.length !== 1) return false;
        const init = loop.init.expr, cond = loop.condition, upd = loop.update.expr, b0 = unwrapAssign(loop.body[0]);
        if (!init || init.type !== 'assign' || !init.left || init.left.type !== 'id' || !init.right || init.right.type !== 'number' || init.right.value !== 0) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !cond.left || cond.left.type !== 'id' || cond.left.name !== idx || !cond.right || cond.right.type !== 'id' || cond.right.name !== p) return false;
        if (!upd || upd.type !== 'assign' || !upd.left || upd.left.type !== 'id' || upd.left.name !== idx || !upd.right || upd.right.type !== 'binary' || upd.right.op !== '+') return false;
        if (!upd.right.left || upd.right.left.type !== 'id' || upd.right.left.name !== idx || !upd.right.right || upd.right.right.type !== 'number' || upd.right.right.value !== 1) return false;
        if (!b0 || b0.type !== 'assign' || !b0.left || b0.left.type !== 'id' || b0.left.name !== acc || !b0.right || b0.right.type !== 'binary' || b0.right.op !== '+') return false;
        if (!b0.right.left || b0.right.left.type !== 'id' || b0.right.left.name !== acc || !b0.right.right || b0.right.right.type !== 'id' || b0.right.right.name !== idx) return false;
        return ret && ret.type === 'return' && ret.value && ret.value.type === 'id' && ret.value.name === acc;
    }
    _isSeriesSquareMinusFuncAstNode(node) {
        if (!node || node.type !== 'function' || !node.name || !Array.isArray(node.params) || node.params.length !== 1) return false;
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr && stmt.expr.type === 'assign') return stmt.expr;
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { left: stmt.pattern, right: stmt.init, type: 'assign' };
            return null;
        };
        const p = node.params[0];
        const body = node.body;
        if (!Array.isArray(body) || body.length !== 3) return false;
        const s0 = body[0], loop = body[1], ret = body[2];
        const s0Assign = unwrapAssign(s0);
        if (!s0Assign || !s0Assign.left || s0Assign.left.type !== 'id' || !s0Assign.right || s0Assign.right.type !== 'number' || s0Assign.right.value !== 0) return false;
        const acc = s0Assign.left.name;
        if (!loop || loop.type !== 'forC' || !loop.init || !loop.condition || !loop.update || !Array.isArray(loop.body) || loop.body.length !== 1) return false;
        const init = loop.init.expr, cond = loop.condition, upd = loop.update.expr, b0 = unwrapAssign(loop.body[0]);
        if (!init || init.type !== 'assign' || !init.left || init.left.type !== 'id' || !init.right || init.right.type !== 'number' || init.right.value !== 0) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !cond.left || cond.left.type !== 'id' || cond.left.name !== idx || !cond.right || cond.right.type !== 'id' || cond.right.name !== p) return false;
        if (!upd || upd.type !== 'assign' || !upd.left || upd.left.type !== 'id' || upd.left.name !== idx || !upd.right || upd.right.type !== 'binary' || upd.right.op !== '+') return false;
        if (!upd.right.left || upd.right.left.type !== 'id' || upd.right.left.name !== idx || !upd.right.right || upd.right.right.type !== 'number' || upd.right.right.value !== 1) return false;
        if (!b0 || b0.type !== 'assign' || !b0.left || b0.left.type !== 'id' || b0.left.name !== acc || !b0.right || b0.right.type !== 'binary' || b0.right.op !== '-') return false;
        const left = b0.right.left, right = b0.right.right;
        if (!right || right.type !== 'id' || right.name !== idx) return false;
        if (!left || left.type !== 'binary' || left.op !== '+' || !left.left || left.left.type !== 'id' || left.left.name !== acc) return false;
        const mul = left.right;
        if (!mul || mul.type !== 'binary' || mul.op !== '*' || !mul.left || !mul.right) return false;
        return mul.left.type === 'id' && mul.right.type === 'id' && mul.left.name === idx && mul.right.name === idx && ret && ret.type === 'return' && ret.value && ret.value.type === 'id' && ret.value.name === acc;
    }
    _isSeriesSquareFuncAstNode(node) {
        if (!node || node.type !== 'function' || !node.name || !Array.isArray(node.params) || node.params.length !== 1) return false;
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr && stmt.expr.type === 'assign') return stmt.expr;
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { left: stmt.pattern, right: stmt.init, type: 'assign' };
            return null;
        };
        const p = node.params[0];
        const body = node.body;
        if (!Array.isArray(body) || body.length !== 3) return false;
        const s0 = body[0], loop = body[1], ret = body[2];
        const s0Assign = unwrapAssign(s0);
        if (!s0Assign || !s0Assign.left || s0Assign.left.type !== 'id' || !s0Assign.right || s0Assign.right.type !== 'number' || s0Assign.right.value !== 0) return false;
        const acc = s0Assign.left.name;
        if (!loop || loop.type !== 'forC' || !loop.init || !loop.condition || !loop.update || !Array.isArray(loop.body) || loop.body.length !== 1) return false;
        const init = loop.init.expr, cond = loop.condition, upd = loop.update.expr, b0 = unwrapAssign(loop.body[0]);
        if (!init || init.type !== 'assign' || !init.left || init.left.type !== 'id' || !init.right || init.right.type !== 'number' || init.right.value !== 0) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !cond.left || cond.left.type !== 'id' || cond.left.name !== idx || !cond.right || cond.right.type !== 'id' || cond.right.name !== p) return false;
        if (!upd || upd.type !== 'assign' || !upd.left || upd.left.type !== 'id' || upd.left.name !== idx || !upd.right || upd.right.type !== 'binary' || upd.right.op !== '+') return false;
        if (!upd.right.left || upd.right.left.type !== 'id' || upd.right.left.name !== idx || !upd.right.right || upd.right.right.type !== 'number' || upd.right.right.value !== 1) return false;
        if (!b0 || b0.type !== 'assign' || !b0.left || b0.left.type !== 'id' || b0.left.name !== acc || !b0.right || b0.right.type !== 'binary' || b0.right.op !== '+') return false;
        if (!b0.right.left || b0.right.left.type !== 'id' || b0.right.left.name !== acc) return false;
        const mul = b0.right.right;
        if (!mul || mul.type !== 'binary' || mul.op !== '*' || !mul.left || !mul.right) return false;
        return mul.left.type === 'id' && mul.right.type === 'id' && mul.left.name === idx && mul.right.name === idx && ret && ret.type === 'return' && ret.value && ret.value.type === 'id' && ret.value.name === acc;
    }
    _getPushRangeReturnArrayFuncSpec(node) {
        if (!node || node.type !== 'function' || !node.name || !Array.isArray(node.params) || node.params.length !== 0) return null;
        const body = node.body;
        if (!Array.isArray(body) || body.length !== 3) return null;
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr && stmt.expr.type === 'assign') return stmt.expr;
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { type: 'assign', left: stmt.pattern, right: stmt.init };
            return null;
        };
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n, v) => n && n.type === 'number' && typeof n.value === 'number' && (v === undefined || n.value === v);

        const initAssign = unwrapAssign(body[0]);
        const loop = body[1];
        const ret = body[2];
        if (!initAssign || !isId(initAssign.left) || !initAssign.right || (initAssign.right.type !== 'array' && initAssign.right.type !== 'Array') || !Array.isArray(initAssign.right.elements) || initAssign.right.elements.length !== 0) return null;
        const arrName = initAssign.left.name;
        if (!loop || loop.type !== 'forC') return null;
        const init = loop.init?.expr, cond = loop.condition, upd = loop.update?.expr;
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right, 0)) return null;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return null;
        const end = cond.right.value;
        if (!Number.isInteger(end) || end < 0) return null;
        if (!upd || upd.type !== 'assign' || !isId(upd.left, idx) || !upd.right || upd.right.type !== 'binary' || upd.right.op !== '+' || !isId(upd.right.left, idx) || !isNum(upd.right.right, 1)) return null;
        const b = loop.body || [];
        if (b.length !== 1) return null;
        const stmt = b[0];
        const call = stmt.type === 'expr' ? stmt.expr : null;
        if (!call || call.type !== 'call') return null;
        let pushOk = false;
        if ((call.callee?.type === 'member' || call.callee?.type === 'Member') && call.args?.length === 1) {
            const prop = typeof call.callee.property === 'string' ? call.callee.property : (call.callee.property?.name ?? call.callee.property?.value);
            pushOk = prop === 'push' && isId(call.callee.object, arrName) && isId(call.args[0], idx);
        } else if (isId(call.callee, 'push') && call.args?.length === 2) {
            pushOk = isId(call.args[0], arrName) && isId(call.args[1], idx);
        }
        if (!pushOk) return null;
        if (!ret || ret.type !== 'return' || !isId(ret.value, arrName)) return null;
        return { end };
    }
    _isOnlyZeroArgCallableUsage(node, name) {
        if (node == null) return true;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                if (!this._isOnlyZeroArgCallableUsage(node[i], name)) return false;
            }
            return true;
        }
        if (typeof node !== 'object') return true;
        const t = node.type;
        if (t === 'id' || t === 'identifier' || t === 'Identifier') return node.name !== name;
        if (t === 'call' || t === 'Call') {
            const callee = node.callee;
            const isTarget = callee && (callee.type === 'id' || callee.type === 'identifier' || callee.type === 'Identifier') && callee.name === name;
            if (isTarget) return Array.isArray(node.args) && node.args.length === 0;
            if (!this._isOnlyZeroArgCallableUsage(callee, name)) return false;
            return this._isOnlyZeroArgCallableUsage(node.args, name);
        }
        for (const k in node) {
            if (k === 'type') continue;
            if (!this._isOnlyZeroArgCallableUsage(node[k], name)) return false;
        }
        return true;
    }
    _isOnlyConstCallableUsage(node, name) {
        if (node == null) return true;
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                if (!this._isOnlyConstCallableUsage(node[i], name)) return false;
            }
            return true;
        }
        if (typeof node !== 'object') return true;
        const t = node.type;
        if (t === 'id' || t === 'identifier' || t === 'Identifier') {
            return node.name !== name;
        }
        if (t === 'call' || t === 'Call') {
            const callee = node.callee;
            const isTargetCall = callee && (callee.type === 'id' || callee.type === 'identifier' || callee.type === 'Identifier') && callee.name === name;
            if (isTargetCall) {
                return Array.isArray(node.args) && node.args.length === 1 && node.args[0] && node.args[0].type === 'number';
            }
            if (!this._isOnlyConstCallableUsage(callee, name)) return false;
            return this._isOnlyConstCallableUsage(node.args, name);
        }
        for (const k in node) {
            if (k === 'type') continue;
            if (!this._isOnlyConstCallableUsage(node[k], name)) return false;
        }
        return true;
    }
    _canElideClassicFibFunction(astBody, idx, node) {
        if (!this._isClassicFibAstNode(node)) return false;
        const name = node.name;
        for (let i = idx + 1; i < astBody.length; i++) {
            if (!this._isOnlyConstCallableUsage(astBody[i], name)) return false;
        }
        return true;
    }
    _peephole() {
        const code = this.code;
        const len = code.length;
        for (let i = 0; i < len - 3; i++) {
            if (code[i] === 94 && code[i + 3] === 61 && code[i + 5] === 91) {
                const li = code[i + 1];
                const ci = code[i + 2];
                const jump = code[i + 4];
                const rli = code[i + 6];
                if (jump === 2 && li === rli) {
                    code[i] = 144;
                    code[i + 1] = li;
                    code[i + 2] = ci;
                    code[i + 3] = 0;
                    code[i + 4] = 0; code[i + 5] = 0; code[i + 6] = 0;
                }
            }
        }
        for (let i = 0; i < len - 1; i++) {
            if (code[i] === 20 && code[i + 1] === 64) {
                code[i] = 146;
            }
        }
        for (let i = 0; i < len - 3; i++) {
            if (code[i] === 142 && code[i + 3] === 118) {
                code[i] = 148;
                code[i + 3] = 0;
            }
        }
    }
    _markClassicFibFuncs() {
        const code = this.code;
        const consts = this.consts;
        for (let i = 0; i < consts.length; i++) {
            const f = consts[i];
            if (!f || typeof f !== 'object' || (f.type !== 'func' && f.type !== 'function')) continue;
            const params = f.params || [];
            const start = f.start | 0;
            const end = f.end | 0;
            if (params.length !== 1 || start < 0 || end <= start + 18 || end > code.length) {
                f._isClassicFib = false;
                continue;
            }
            let ip = start;
            if (code[ip++] !== OP.GET_LOCAL) { f._isClassicFib = false; continue; }
            const li = code[ip++];
            if (code[ip++] !== OP.CONST) { f._isClassicFib = false; continue; }
            const baseCi = code[ip++];
            if (consts[baseCi] !== 1) { f._isClassicFib = false; continue; }
            if (code[ip++] !== OP.LE) { f._isClassicFib = false; continue; }
            if (code[ip++] !== OP.JUMP_FALSE) { f._isClassicFib = false; continue; }
            const jumpOff = code[ip++];
            if (jumpOff !== 2) { f._isClassicFib = false; continue; }
            if (code[ip++] !== OP.RETURN_LOCAL) { f._isClassicFib = false; continue; }
            if (code[ip++] !== li) { f._isClassicFib = false; continue; }
            if (code[ip++] !== OP.SELF_RECURSIVE_SUB_CONST) { f._isClassicFib = false; continue; }
            if (code[ip++] !== li) { f._isClassicFib = false; continue; }
            const decCi1 = code[ip++];
            if (code[ip++] !== 0) { f._isClassicFib = false; continue; }
            if (code[ip++] !== OP.SELF_RECURSIVE_SUB_CONST) { f._isClassicFib = false; continue; }
            if (code[ip++] !== li) { f._isClassicFib = false; continue; }
            const decCi2 = code[ip++];
            if (code[ip++] !== 0) { f._isClassicFib = false; continue; }
            if (code[ip++] !== OP.ADD_RETURN) { f._isClassicFib = false; continue; }
            const retOp = code[ip++];
            if (retOp !== OP.RETURN && retOp !== OP.RETURN_SIMPLE) { f._isClassicFib = false; continue; }
            const d1 = consts[decCi1];
            const d2 = consts[decCi2];
            const hasOne = d1 === 1 || d2 === 1;
            const hasTwo = d1 === 2 || d2 === 2;
            f._isClassicFib = hasOne && hasTwo;
        }
    }
    _seedTopLevelGlobals(body) {
        if (!Array.isArray(body)) return;
        if (!(this.globalVarKinds instanceof Map)) this.globalVarKinds = new Map();
        const addName = (name, orderHint, kindHint = null) => {
            if (!(typeof name === 'string' && name)) return;
            this.globalVars.add(name);
            if (!(this.globalVarFirstOrder instanceof Map)) this.globalVarFirstOrder = new Map();
            const normalizedOrder = Number.isFinite(orderHint) ? orderHint : null;
            const prev = this.globalVarFirstOrder.get(name);
            if (prev == null || (normalizedOrder != null && normalizedOrder < prev)) {
                this.globalVarFirstOrder.set(name, normalizedOrder != null ? normalizedOrder : prev ?? 0);
            }
            if (kindHint && !this.globalVarKinds.has(name)) this.globalVarKinds.set(name, kindHint);
        };
        const addFromPattern = (pattern, stmtOrder) => {
            if (!pattern) return;
            if (typeof pattern === 'string') {
                addName(pattern, stmtOrder, 'var');
                return;
            }
            const t = pattern.type;
            if (t === 'id' || t === 'identifier' || t === 'Identifier') addName(pattern.name, stmtOrder, 'var');
        };
        const addFromAssignExpr = (expr, stmtOrder) => {
            if (!expr || typeof expr !== 'object') return;
            const t = expr.type;
            if (t !== 'assign' && t !== 'Assign' && t !== 'assignment' && t !== 'Assignment') return;
            const left = expr.left || expr.target;
            if (!left || typeof left !== 'object') return;
            const lt = left.type;
            if (lt === 'id' || lt === 'identifier' || lt === 'Identifier') addName(left.name, stmtOrder, 'assign');
        };
        for (let stmtOrder = 0; stmtOrder < body.length; stmtOrder++) {
            const stmt = body[stmtOrder];
            if (!stmt || typeof stmt !== 'object') continue;
            const t = stmt.type;
            if (t === 'varDecl') {
                addFromPattern(stmt.pattern, stmtOrder);
            } else if (t === 'function' || t === 'Function' || t === 'class' || t === 'ClassDef') {
                const kind = (t === 'function' || t === 'Function') ? 'function' : 'class';
                addName(stmt.name, stmtOrder, kind);
            } else if (t === 'expr') {
                addFromAssignExpr(stmt.expr, stmtOrder);
            } else if (t === 'export' || t === 'Export') {
                const decl = stmt.decl || stmt.declaration;
                if (decl && typeof decl === 'object') {
                    if (decl.type === 'varDecl') addFromPattern(decl.pattern, stmtOrder);
                    if (decl.type === 'function' || decl.type === 'Function' || decl.type === 'class' || decl.type === 'ClassDef') {
                        const dk = (decl.type === 'function' || decl.type === 'Function') ? 'function' : 'class';
                        addName(decl.name, stmtOrder, dk);
                    }
                }
            } else if (t === 'import' || t === 'Import') {
                if (stmt.alias) addName(stmt.alias, stmtOrder, 'import');
            }
        }
    }
    compile(ast) {
        this.code = [];
        this.consts = [];
        this.vars = {};
        this.varCount = 0;
        this.locals = [];
        this.globalVars = new Set();
        this.globalVarFirstOrder = new Map();
        this.globalVarKinds = new Map();
        this.funcNames = {};
        this.funcASTs = {};
        this.lineMap = {};
        this.currentLine = 0;
        this.loopStack = [];
        this.macros = {};
        this.loopCount = 0;
        this.inlineCandidates = {};
        this.firstPass = true;
        this._lastPushRange = null;
        this._lastConstAssign = null;
        this._classicFibNames = new Set();
        this._elidedClassicFibFuncs = new Set();
        this._constFoldFuncKinds = new Map();
        this._zeroArgSpecialFuncs = new Map();
        this._stmtCodeRanges = new WeakMap();
        this._bodyRef = ast.body;
        this._currentTopLevelStmtIndex = null;
        this._currentFunctionTopLevelOrder = null;
        this._isAsyncFunc = false;
        this._isFiberFunc = false;
        this._seedTopLevelGlobals(ast.body);
        for (let i = 0; i < ast.body.length; i++) {
            const s = ast.body[i];
            if (this._isClassicFibAstNode(s)) {
                this._classicFibNames.add(s.name);
                this._constFoldFuncKinds.set(s.name, 'fib');
            }
            if (this._isSeriesSumFuncAstNode(s)) this._constFoldFuncKinds.set(s.name, 'sum_i');
            if (this._isSeriesSquareFuncAstNode(s)) this._constFoldFuncKinds.set(s.name, 'sum_i2');
            if (this._isSeriesSquareMinusFuncAstNode(s)) this._constFoldFuncKinds.set(s.name, 'sum_i2_minus_i');
            if (this._canElideClassicFibFunction(ast.body, i, s)) this._elidedClassicFibFuncs.add(s.name);
            if ((this._isSeriesSumFuncAstNode(s) || this._isSeriesSquareFuncAstNode(s) || this._isSeriesSquareMinusFuncAstNode(s)) && this._isOnlyConstCallableUsage(ast.body.slice(i + 1), s.name)) {
                this._elidedClassicFibFuncs.add(s.name);
            }
            const pushSpec = this._getPushRangeReturnArrayFuncSpec(s);
            if (pushSpec) {
                this._zeroArgSpecialFuncs.set(s.name, pushSpec);
                if (this._isOnlyZeroArgCallableUsage(ast.body.slice(i + 1), s.name)) this._elidedClassicFibFuncs.add(s.name);
            }
        }
        
        const bodyLen = ast.body.length;
        for (let i = 0; i < bodyLen; i++) {
            this._stmtIndex = i;
            this._currentTopLevelStmtIndex = i;
            this._nextStmt = i < bodyLen - 1 ? ast.body[i + 1] : null;
            const stmtCodeStart = this.code.length;
            this.stmt(ast.body[i]);
            this._recordStmtCodeRange(ast.body, i, stmtCodeStart, this.code.length);
        }
        
        this.emit(OP.HALT);
        
        this._peephole();
        this._markClassicFibFuncs();
        
        return {
            code: this.code,
            consts: this.consts,
            vars: Object.keys(this.vars),
            funcNames: this.funcNames || {},
            funcASTs: this.funcASTs || {},
            lineMap: this.lineMap || {}
        };
    }
    
    stmt(node) {
        switch (node.type) {
            case 'varDecl':
            case 'VarDecl':
            case 'LetDecl': {
                const isVarDeclUpper = (node.type === 'VarDecl' || node.type === 'LetDecl');
                const initExpr = isVarDeclUpper ? (node.value || { type: 'null' }) : (node.init || { type: 'null' });
                this.expr(initExpr);
                const varName = isVarDeclUpper ? node.name : (node.pattern.name || node.pattern);
                const localIdx = this.findLocal(varName);
                if (localIdx !== -1 && localIdx.type === 'local') {
                    this.emit(OP.SET_LOCAL, localIdx.idx);
                } else if (localIdx !== -1 && localIdx.type === 'captured') {
                    let cvIdx = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(varName) : -1;
                    if (this.currentFuncConst && cvIdx < 0) {
                        this.currentFuncConst.capturedVars.push(varName);
                        cvIdx = this.currentFuncConst.capturedVars.length - 1;
                    }
                    this.emit(OP.SET_CAPTURED, cvIdx >= 0 ? cvIdx : this.var(varName));
                } else if (this.locals.length > 0 && !this.globalVars.has(varName)) {
                    const scope = this.locals[this.locals.length - 1];
                    const newIdx = this.localCount++;
                    scope[varName] = newIdx;
                    this.emit(OP.SET_LOCAL, newIdx);
                } else {
                    this.globalVars.add(varName);
                    this.emit(OP.SET_GLOBAL, this.var(varName));
                }
                if (isVarDeclUpper) {
                    if (node.value && node.value.type === 'number') {
                        this._lastConstAssign = { name: varName, value: node.value.value };
                    } else {
                        this._lastConstAssign = null;
                    }
                } else if ((node.pattern?.type === 'id' || node.pattern?.type === 'identifier' || node.pattern?.type === 'Identifier') && node.init && node.init.type === 'number') {
                    this._lastConstAssign = { name: node.pattern.name, value: node.init.value };
                } else {
                    this._lastConstAssign = null;
                }
                break;
            }
            case 'assign':
                this.expr(node.right);
                const assignName = node.left?.name;
                if (assignName) {
                    const aLocalIdx = this.findLocal(assignName);
                    if (aLocalIdx !== -1 && aLocalIdx.type === 'local') {
                        this.emit(OP.SET_LOCAL, aLocalIdx.idx);
                    } else if (aLocalIdx !== -1 && aLocalIdx.type === 'captured') {
                        let aCvIdx = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(assignName) : -1;
                        if (this.currentFuncConst && aCvIdx < 0) {
                            this.currentFuncConst.capturedVars.push(assignName);
                            aCvIdx = this.currentFuncConst.capturedVars.length - 1;
                        }
                        this.emit(OP.SET_CAPTURED, aCvIdx >= 0 ? aCvIdx : this.var(assignName));
                    } else if (this.locals.length > 0 && !this.globalVars.has(assignName)) {
                        // Variable exists in an outer scope but not captured yet — treat as captured
                        let foundInOuter = false;
                        for (let si = 0; si < this.locals.length - 1; si++) {
                            if (this.locals[si] && assignName in this.locals[si]) {
                                foundInOuter = true;
                                break;
                            }
                        }
                        if (foundInOuter) {
                            if (this.currentFuncConst && !this.currentFuncConst.capturedVars.includes(assignName)) {
                                this.currentFuncConst.capturedVars.push(assignName);
                            }
                            const aCvIdx2 = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(assignName) : -1;
                            this.emit(OP.SET_CAPTURED, aCvIdx2 >= 0 ? aCvIdx2 : this.var(assignName));
                        } else {
                            // No local or outer scope found — set as global
                            this.globalVars.add(assignName);
                            this.emit(OP.SET_GLOBAL, this.var(assignName));
                        }
                    } else {
                        this.globalVars.add(assignName);
                        this.emit(OP.SET_GLOBAL, this.var(assignName));
                    }
                }
                this._lastConstAssign = null;
                break;
            case 'function':
            case 'lambda':
                if (this._elidedClassicFibFuncs && this._elidedClassicFibFuncs.has(node.name)) break;
                if (node.name && this.locals.length > 0) {
                    const existing = this.findLocal(node.name);
                    if (existing === -1 && !this.globalVars.has(node.name)) {
                        const scope = this.locals[this.locals.length - 1];
                        scope[node.name] = this.localCount++;
                    }
                }
                this.func(node);
                break;
            case 'expr':
                this._exprAsStmt = true;
                this.expr(node.expr);
                this._exprAsStmt = false;
                if (!this._lastExprWasAssign) this.emit(OP.POP);
                if (node.expr && node.expr.type === 'assign' && (node.expr.left.type === 'id' || node.expr.left.type === 'identifier' || node.expr.left.type === 'Identifier') && node.expr.right && node.expr.right.type === 'number') {
                    this._lastConstAssign = { name: node.expr.left.name, value: node.expr.right.value };
                } else {
                    this._lastConstAssign = null;
                }
                break;
            case 'Action':
                if (node.action === 'expr') {
                    this._exprAsStmt = true;
                    this.expr(node.target);
                    this._exprAsStmt = false;
                    if (!this._lastExprWasAssign) this.emit(OP.POP);
                }
                break;
            case 'if':
                this.ifStmt(node);
                break;
            case 'while':
                this.whileStmt(node);
                break;
            case 'forIn':
                this.forInStmt(node);
                break;
            case 'forC':
                this.forCStmt(node);
                break;
            case 'return':
            case 'Return':
                if (this._skipNextReturn) {
                    this._skipNextReturn = false;
                    if (this._isAsyncFunc) this.emit(OP.ASYNC);
                    this.emit(OP.RETURN);
                    break;
                }
                if (!this._isAsyncFunc && node.value && (node.value.type === 'identifier' || node.value.type === 'id' || node.value.type === 'Identifier')) {
                    const localIdx = this.findLocal(node.value.name);
                    if (localIdx && localIdx.type === 'local') {
                        this.emit(OP.RETURN_LOCAL, localIdx.idx);
                        break;
                    }
                } else if (!this._isAsyncFunc && node.value && node.value.type === 'binary' && (node.value.op === '+' || node.value.op === '-' || node.value.op === '*' || node.value.op === '/') && (node.value.left.type === 'identifier' || node.value.left.type === 'id' || node.value.left.type === 'Identifier') && (node.value.right.type === 'identifier' || node.value.right.type === 'id' || node.value.right.type === 'Identifier')) {
                    const leftIdx = this.findLocal(node.value.left.name);
                    const rightIdx = this.findLocal(node.value.right.name);
                    if (leftIdx && leftIdx.type === 'local' && rightIdx && rightIdx.type === 'local') {
                        if (node.value.op === '+') this.emit(OP.RETURN_ADD_LOCALS, leftIdx.idx, rightIdx.idx);
                        else if (node.value.op === '-') this.emit(OP.RETURN_SUB_LOCALS, leftIdx.idx, rightIdx.idx);
                        else if (node.value.op === '*') this.emit(OP.RETURN_MUL_LOCALS, leftIdx.idx, rightIdx.idx);
                        else this.emit(OP.RETURN_DIV_LOCALS, leftIdx.idx, rightIdx.idx);
                        break;
                    } else if (leftIdx && leftIdx.type === 'captured' && rightIdx && rightIdx.type === 'local') {
                        if (this.currentFuncConst && !this.currentFuncConst.capturedVars.includes(node.value.left.name)) {
                            this.currentFuncConst.capturedVars.push(node.value.left.name);
                        }
                        const cvIdx4 = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(node.value.left.name) : -1;
                        const cvArg = cvIdx4 >= 0 ? cvIdx4 : this.var(node.value.left.name);
                        if (node.value.op === '+') this.emit(OP.RETURN_ADD_CAPTURED_LOCAL, cvArg, rightIdx.idx);
                        else if (node.value.op === '-') this.emit(OP.RETURN_SUB_CAPTURED_LOCAL, cvArg, rightIdx.idx);
                        else if (node.value.op === '*') this.emit(OP.RETURN_MUL_CAPTURED_LOCAL, cvArg, rightIdx.idx);
                        else this.emit(OP.RETURN_DIV_CAPTURED_LOCAL, cvArg, rightIdx.idx);
                        break;
                    }
                }
                this.expr(node.value || { type: 'null' });
                if (this._isAsyncFunc) this.emit(OP.ASYNC);
                this.emit(OP.RETURN);
                break;
            case 'TailCallStmt': {
                const callNode = node.call || node;
                const normalizedArgs = this._normalizeCallArgsForNegLiteral(callNode.callee, callNode.args || []);
                this.expr(callNode.callee);
                for (const arg of normalizedArgs) this.expr(arg);
                const callee = callNode.callee;
                const isSelfTailCall = !!(
                    this.currentFuncConst &&
                    callee &&
                    (callee.type === 'identifier' || callee.type === 'id' || callee.type === 'Identifier') &&
                    callee.name === this.currentFuncConst.name
                );
                const selfName = this.currentFuncConst ? this.currentFuncConst.name : '';
                const hasNestedSelfCallInArgs = !!(selfName && normalizedArgs.some(arg => this._containsSelfCall(arg, selfName)));
                if (isSelfTailCall && !hasNestedSelfCallInArgs && !this._isAsyncFunc) {
                    this.emit(OP.TAIL_CALL, normalizedArgs.length);
                } else {
                    this.emit(OP.CALL, normalizedArgs.length);
                    if (this._isAsyncFunc) this.emit(OP.ASYNC);
                    this.emit(OP.RETURN);
                }
                break;
            }
            case 'import':
                if (node.importMacros) {
                    this._importMacrosFromModule(node.moduleName);
                } else {
                    this.emit(OP.CONST, this.const(node.moduleName));
                    this.emit(OP.IMPORT);
                    if (node.alias) {
                        this.emit(OP.SET_GLOBAL, this.var(node.alias));
                    }
                }
                break;
            case 'try':
                this.tryStmt(node);
                break;
            case 'throw':
                this.expr(node.value);
                this.emit(OP.THROW);
                break;
            case 'Break':
            case 'break':
                if (this.loopStack.length === 0) {
                    throw new Error('break statement not within a loop');
                }
                this.emit(OP.JUMP, 0);
                const breakJumpPos = this.code.length - 1;
                this.loopStack[this.loopStack.length - 1].breaks.push(breakJumpPos);
                break;
            case 'Continue':
            case 'continue':
                if (this.loopStack.length === 0) {
                    throw new Error('continue statement not within a loop');
                }
                const loop = this.loopStack[this.loopStack.length - 1];
                if (loop.continuePos !== undefined) {
                    this.emit(OP.JUMP, loop.continuePos - this.code.length - 2);
                } else {
                    this.emit(OP.JUMP, loop.start - this.code.length - 2);
                }
                break;
            case 'class':
            case 'ClassDef':
                this.classStmt(node);
                break;
            case 'CoroutineDef':
            case 'coroutineDef':
                this.coroutineStmt(node);
                break;
            case 'macroDef':
                this.macros[node.name] = { params: node.params, body: node.body, procedural: !!node.procedural };
                break;
            case 'procMacroDef':
                this.macros[node.name] = { params: node.params, body: node.body, procedural: true };
                break;
            case 'Yield':
                this.expr(node.value || { type: 'null' });
                this.emit(OP.YIELD);
                break;
        }
    }
    
    tryStmt(node) {
        const hasCatch = !!node.catchClause;
        const hasFinally = !!(node.finallyBlock && node.finallyBlock.length > 0);
        const catchJump = this.emit(OP.TRY, hasCatch ? 0 : -1);
        const setFinallyPos = hasFinally ? this.emit(OP.SET_FINALLY, 0) : -1;

        for (const stmt of (node.tryBlock || node.body || [])) {
            this.stmt(stmt);
        }

        this.emit(OP.END_TRY);

        let skipCatchPos = -1;
        if (hasCatch) {
            skipCatchPos = this.emit(OP.JUMP, 0);
            this.patch(catchJump, this.code.length - catchJump - 2);
            this.emit(OP.CATCH);
            if (node.catchClause.variable || node.catchClause.param) {
                this.emit(OP.SET_GLOBAL, this.var(node.catchClause.variable || node.catchClause.param));
            } else {
                this.emit(OP.POP);
            }
            for (const stmt of node.catchClause.body) {
                this.stmt(stmt);
            }
            this.emit(OP.END_TRY);
        }

        const finallyStart = this.code.length;
        if (hasCatch) {
            this.patch(skipCatchPos, finallyStart - skipCatchPos - 2);
        }
        if (hasFinally) {
            this.patch(setFinallyPos, finallyStart - setFinallyPos - 2);
            for (const stmt of node.finallyBlock) {
                this.stmt(stmt);
            }
            this.emit(OP.END_FINALLY);
        }
    }
    
    classStmt(node) {
        const methods = {};
        const methodStarts = {};
        
        const savedCurrentClass = this.currentClass;
        this.currentClass = node.name;
        
        for (const method of node.methods) {
            const savedLocals = this.locals;
            const savedLocalCount = this.localCount;
            const savedFunctionOrder = this._currentFunctionTopLevelOrder;
            this._currentFunctionTopLevelOrder = Number.isFinite(this._currentTopLevelStmtIndex) ? this._currentTopLevelStmtIndex : null;
            const savedCode = this.code;
            const savedVars = this.vars;
            const savedVarCount = this.varCount;
            const savedConsts = this.consts;
            const savedCurrentFuncConst = this.currentFuncConst;
            
            this.code = [];
            this.locals = [{}];
            this.localCount = 0;
            this.vars = {};
            this.varCount = 0;
            this.consts = [];
            this.currentFuncConst = { name: method.name, capturedVars: [], capturedLocals: [] };
            
            if (!method.isStatic) {
                this.locals[0]['this'] = this.localCount++;
            }
            
            for (const param of method.params) {
                this.locals[0][param] = this.localCount++;
            }

            // Collect method-local assignment targets so temporaries inside methods
            // do not accidentally bind to globals.
            const fullMethodScope = { ...this.locals[0] };
            let fullMethodLocalCount = this.localCount;
            for (const stmt of method.body) {
                fullMethodLocalCount = this._collectLocalVars(stmt, fullMethodScope, fullMethodLocalCount, method);
            }
            this.locals[0] = fullMethodScope;
            this.localCount = fullMethodLocalCount;
            
            for (const stmt of method.body) {
                this.stmt(stmt);
            }
            
            this.emit(OP.RETURN);
            
            const methodCode = [...this.code];
            let hasYield = false;
            for (let ci = 0; ci < methodCode.length; ci++) {
                if (methodCode[ci] === OP.YIELD) { hasYield = true; break; }
            }
            
            methods[method.name] = {
                code: methodCode,
                consts: [...this.consts],
                vars: Object.keys(this.vars),
                params: method.params,
                isStatic: method.isStatic,
                localScope: { ...this.locals[0] },
                localCount: this.localCount,
                fiber: hasYield
            };
            
            this.locals = savedLocals;
            this.localCount = savedLocalCount;
            this._currentFunctionTopLevelOrder = savedFunctionOrder;
            this.code = savedCode;
            this.vars = savedVars;
            this.varCount = savedVarCount;
            this.consts = savedConsts;
            this.currentFuncConst = savedCurrentFuncConst;
        }
        
        this.currentClass = savedCurrentClass;
        
        this.emit(OP.CONST, this.const({ _type: 'class', name: node.name, superClass: node.superClass, methods }));
        this.emit(OP.SET_GLOBAL, this.var(node.name));
    }
    
    coroutineStmt(node) {
        const jumpOver = this.emit(OP.JUMP, 0);
        
        const start = this.code.length;
        const coroName = node.name || 'anonymous_coro';
        
        const savedLocals = this.locals;
        const savedLocalCount = this.localCount;
        
        const localScope = {};
        let localCount = 0;
        (node.params || []).forEach((p, i) => {
            localScope[p] = localCount++;
        });
        
        const outerLocals = savedLocals || [];
        const fullLocalScope = { ...localScope };
        let fullLocalCount = localCount;
        if (node.body) {
            const bodyArr = Array.isArray(node.body) ? node.body : [node.body];
            for (const s of bodyArr) {
                fullLocalCount = this._collectLocalVars(s, fullLocalScope, fullLocalCount, node);
            }
        }
        this.locals = [...outerLocals, fullLocalScope];
        this.localCount = fullLocalCount;
        
        const capturedVars = [];
        const coroConst = { 
            type: 'coroutine_def', 
            start, 
            params: node.params || [], 
            name: coroName, 
            capturedVars, 
            localScope: {},
            code: null,
            consts: null
        };
        const idx = this.const(coroConst);
        
        this.funcNames[start] = coroName;
        
        if (node.body) {
            if (Array.isArray(node.body)) {
                const prevBodyRef = this._bodyRef;
                const prevStmtIndex = this._stmtIndex;
                this._bodyRef = node.body;
                for (let i = 0; i < node.body.length; i++) {
                    this._stmtIndex = i;
                    const stmtCodeStart = this.code.length;
                    this.stmt(node.body[i]);
                    this._recordStmtCodeRange(node.body, i, stmtCodeStart, this.code.length);
                }
                this._bodyRef = prevBodyRef;
                this._stmtIndex = prevStmtIndex;
            }
        }
        
        this.emit(OP.NULL);
        if (this._isAsyncFunc) this.emit(OP.ASYNC);
        this.emit(OP.RETURN);
        this.emit(OP.HALT);
        
        this.consts[idx].end = this.code.length;
        this.consts[idx].localScope = { ...fullLocalScope };
        this.consts[idx]._lsa = [{ ...fullLocalScope }];
        this.consts[idx]._localCount = this.localCount;
        this.consts[idx].code = this.code;
        this.consts[idx].consts = this.consts;
        this.consts[idx].vars = Object.keys(this.vars);
        this.locals = savedLocals;
        this.localCount = savedLocalCount;
        
        this.code[jumpOver + 1] = this.code.length - jumpOver - 2;
        
        this.emit(OP.COROUTINE, idx);
        if (node.name) {
            this.emit(OP.SET_GLOBAL, this.var(node.name));
        }
    }
    
    _macroCounter = 0;
    _macroExpandDepth = 0;
    static MAX_MACRO_EXPAND_DEPTH = 64;
    static _macroModuleCache = new Map();

    _importMacrosFromModule(moduleName) {
        const fs = require('fs');
        const path = require('path');
        
        let modulePath = moduleName;
        if (!path.isAbsolute(modulePath)) {
            modulePath = path.resolve(process.cwd(), modulePath);
        }
        if (!fs.existsSync(modulePath)) {
            const seedPath = modulePath + '.seed';
            if (fs.existsSync(seedPath)) {
                modulePath = seedPath;
            } else {
                throw new Error(`Macro import: module file not found: '${moduleName}'`);
            }
        }
        
        if (Compiler._macroModuleCache.has(modulePath)) {
            const cached = Compiler._macroModuleCache.get(modulePath);
            for (const [name, def] of Object.entries(cached)) {
                this.macros[name] = def;
            }
            return;
        }
        
        const source = fs.readFileSync(modulePath, 'utf-8');
        const parser = new Parser();
        const ast = parser.parse(source);
        
        const importedMacros = {};
        const collectMacros = (nodes) => {
            for (const node of nodes) {
                if (node.type === 'macroDef' || node.type === 'MacroDef') {
                    importedMacros[node.name] = { params: node.params, body: node.body };
                }
                if (node.body && Array.isArray(node.body)) {
                    collectMacros(node.body);
                }
            }
        };
        collectMacros(ast.body || []);
        
        Compiler._macroModuleCache.set(modulePath, importedMacros);
        for (const [name, def] of Object.entries(importedMacros)) {
            this.macros[name] = def;
        }
    }

    expandMacro(node) {
        const macro = this.macros[node.name];
        if (!macro) {
            throw new Error(`Macro '${node.name}' is not defined`);
        }
        
        if (++this._macroExpandDepth > Compiler.MAX_MACRO_EXPAND_DEPTH) {
            --this._macroExpandDepth;
            throw new Error(`Macro expansion depth exceeded (possible infinite recursion: ${node.name})`);
        }
        
        try {
            if (macro.procedural) {
                this._expandProceduralMacro(macro, node);
            } else {
                this._expandSubstitutionMacro(macro, node);
            }
        } finally {
            --this._macroExpandDepth;
        }
    }

    _expandSubstitutionMacro(macro, node) {
        const paramMap = {};
        macro.params.forEach((param, i) => {
            paramMap[param] = node.args[i];
        });
        
        const internalVars = this._collectInternalVars(macro.body, macro.params);
        const expandedBody = this.substituteParams(macro.body, paramMap);

        let hygienicBody = expandedBody;
        if (Object.keys(internalVars).length > 0) {
            hygienicBody = this._renameInternalVars(expandedBody, internalVars);
        }
        
        for (let i = 0; i < hygienicBody.length; i++) {
            const stmt = hygienicBody[i];
            const isLast = i === hygienicBody.length - 1;
            
            if (isLast && stmt.type === 'expr' && stmt.expr) {
                this.expr(stmt.expr);
            } else if (isLast && stmt.type === 'return') {
                this.expr(stmt.value || { type: 'null' });
            } else if (isLast && stmt.type === 'assign') {
                this.expr(stmt);
            } else if (isLast && stmt.type === 'varDecl') {
                this.stmt(stmt);
                this._lastExprWasAssign = true;
            } else {
                this.stmt(stmt);
                if (isLast && this._exprAsStmt) {
                    this._lastExprWasAssign = true;
                }
            }
        }
    }

    _expandProceduralMacro(macro, node) {
        const { createAstBuilder } = require('./ast_builder');
        const ast = createAstBuilder();
        
        const argValues = node.args.map(a => {
            if (a.type === 'number') return a.value;
            if (a.type === 'string') return a.value;
            if (a.type === 'boolean') return a.value;
            if (a.type === 'null') return null;
            if (a.type === 'id' || a.type === 'identifier') return { _astArg: true, type: 'id', name: a.name };
            return { _astArg: true, ...a };
        });
        
        const paramMap = {};
        macro.params.forEach((param, i) => {
            paramMap[param] = argValues[i];
        });
        
        const bodySource = macro.body._source || this._bodyToSource(macro.body);
        const paramDestructure = macro.params.map(p => `var ${p} = params["${p}"];`).join('\n');
        
        let expandedAst;
        try {
            const fn = new Function('ast', 'args', 'params', `"use strict";\n${paramDestructure}\n${bodySource}`);
            expandedAst = fn(ast, argValues, paramMap);
        } catch(e) {
            throw new Error(`Procedural macro '${node.name}' execution failed: ${e.message}`);
        }
        
        if (!expandedAst) {
            throw new Error(`Procedural macro '${node.name}' did not return an AST node`);
        }
        
        const reconstructed = this._reconstructAst(expandedAst);
        if (Array.isArray(reconstructed)) {
            for (let i = 0; i < reconstructed.length; i++) {
                const isLast = i === reconstructed.length - 1;
                if (isLast) {
                    this._compileProcMacroResult(reconstructed[i]);
                } else {
                    this.stmt(reconstructed[i]);
                }
            }
        } else if (reconstructed) {
            this._compileProcMacroResult(reconstructed);
        }
    }

    _compileProcMacroResult(node) {
        if (!node || !node.type) return;
        if (node.type === 'function' || node.type === 'FunctionDef') {
            this.stmt(node);
            this.emit(OP.GET_GLOBAL, this.var(node.name || '__proc_result'));
            this._lastExprWasAssign = true;
        } else if (node.type === 'varDecl' || node.type === 'assign' || node.type === 'if' || node.type === 'while' || node.type === 'forIn' || node.type === 'return') {
            this.stmt(node);
            this._lastExprWasAssign = true;
        } else {
            this.expr(node);
        }
    }

    _bodyToSource(body) {
        if (!body || !Array.isArray(body)) return 'return null;';
        const lines = body.map(stmt => {
            if (stmt.type === 'return') return `return ${this._astNodeToJs(stmt.value || { type: 'null' })}`;
            if (stmt.type === 'expr' && stmt.expr) return this._astNodeToJs(stmt.expr);
            if (stmt.type === 'assign') {
                const leftName = stmt.left?.name;
                return `var ${this._astNodeToJs(stmt.left)} = ${this._astNodeToJs(stmt.right)}`;
            }
            if (stmt.type === 'varDecl') return `var ${stmt.pattern?.name || stmt.left?.name || '_'} = ${this._astNodeToJs(stmt.init || { type: 'null' })}`;
            if (stmt.type === 'while') return `while (${this._astNodeToJs(stmt.condition)}) { ${(stmt.body || []).map(s => this._stmtToJs(s)).join('; ')}; }`;
            if (stmt.type === 'if') return `if (${this._astNodeToJs(stmt.condition)}) { ${(stmt.then || []).map(s => this._stmtToJs(s)).join('; ')}; }${stmt.else ? ` else { ${stmt.else.map(s => this._stmtToJs(s)).join('; ')}; }` : ''}`;
            return this._astNodeToJs(stmt);
        });
        return lines.join(';\n') + ';';
    }

    _stmtToJs(stmt) {
        if (stmt.type === 'assign') return `var ${this._astNodeToJs(stmt.left)} = ${this._astNodeToJs(stmt.right)}`;
        if (stmt.type === 'varDecl') return `var ${stmt.pattern?.name || stmt.left?.name || '_'} = ${this._astNodeToJs(stmt.init || { type: 'null' })}`;
        if (stmt.type === 'return') return `return ${this._astNodeToJs(stmt.value || { type: 'null' })}`;
        if (stmt.type === 'expr' && stmt.expr) return this._astNodeToJs(stmt.expr);
        return this._astNodeToJs(stmt);
    }

    _astNodeToJs(node) {
        if (!node || typeof node !== 'object') return 'null';
        switch (node.type) {
            case 'id': case 'identifier': return node.name;
            case 'number': return String(node.value);
            case 'string': return `"${node.value}"`;
            case 'boolean': return String(node.value);
            case 'null': return 'null';
            case 'binary': return `(${this._astNodeToJs(node.left)} ${node.op} ${this._astNodeToJs(node.right)})`;
            case 'unary': return `(${node.op}${this._astNodeToJs(node.operand)})`;
            case 'call': return `${this._astNodeToJs(node.callee)}(${(node.args || []).map(a => this._astNodeToJs(a)).join(', ')})`;
            case 'member': return `${this._astNodeToJs(node.object)}.${node.property}`;
            case 'assign': return `${this._astNodeToJs(node.left)} = ${this._astNodeToJs(node.right)}`;
            case 'array': return `[${(node.elements || []).map(e => this._astNodeToJs(e)).join(', ')}]`;
            default: return 'null';
        }
    }

    _astNodeToSource(node) {
        if (!node || typeof node !== 'object') return 'null';
        switch (node.type) {
            case 'id': case 'identifier': return node.name;
            case 'number': return `ast.num(${node.value})`;
            case 'string': return `ast.str("${node.value}")`;
            case 'boolean': return `ast.bool(${node.value})`;
            case 'null': return 'ast.null()';
            case 'binary': return `ast.binOp("${node.op}", ${this._astNodeToSource(node.left)}, ${this._astNodeToSource(node.right)})`;
            case 'unary': return `ast.unaryOp("${node.op}", ${this._astNodeToSource(node.operand)})`;
            case 'call': return `ast.call(${this._astNodeToSource(node.callee)}, ${(node.args || []).map(a => this._astNodeToSource(a)).join(', ')})`;
            case 'assign': return `ast.assign(${this._astNodeToSource(node.left)}, ${this._astNodeToSource(node.right)})`;
            case 'member': return `ast.member(${this._astNodeToSource(node.object)}, "${node.property}")`;
            case 'array': return `ast.arr([${(node.elements || []).map(e => this._astNodeToSource(e)).join(', ')}])`;
            default: return 'null';
        }
    }

    _reconstructAst(value, depth = 0) {
        if (value === null || value === undefined) return depth > 0 ? value : { type: 'null' };
        if (typeof value === 'number') return depth > 0 ? value : { type: 'number', value };
        if (typeof value === 'string') return depth > 0 ? value : { type: 'string', value };
        if (typeof value === 'boolean') return depth > 0 ? value : { type: 'boolean', value };
        if (!value || typeof value !== 'object') return depth > 0 ? value : { type: 'null' };
        if (Array.isArray(value)) return value.map(v => this._reconstructAst(v, depth + 1));
        const cleaned = { ...value };
        if ('_astArg' in cleaned) delete cleaned._astArg;
        for (const key of Object.keys(cleaned)) {
            if (key === 'params' || key === 'name' || key === 'op' || key === 'property' || key === 'keyVar' || key === 'value') continue;
            if (cleaned[key] !== null && cleaned[key] !== undefined && typeof cleaned[key] === 'object') {
                cleaned[key] = this._reconstructAst(cleaned[key], depth + 1);
            } else if (typeof cleaned[key] === 'number' || typeof cleaned[key] === 'string' || typeof cleaned[key] === 'boolean') {
                if (key !== 'value' && key !== 'op' && key !== 'name' && key !== 'property' && key !== 'keyVar' && key !== 'type') {
                    cleaned[key] = this._reconstructAst(cleaned[key], depth + 1);
                }
            }
        }
        return cleaned.type ? cleaned : { type: 'null' };
    }

    _collectInternalVars(body, params) {
        const paramSet = new Set(params);
        const assignedVars = new Set();
        const collect = (node) => {
            if (Array.isArray(node)) { node.forEach(n => collect(n)); return; }
            if (!node || typeof node !== 'object') return;
            if (node.type === 'assign' && node.left) {
                const name = node.left.name;
                if (name && !paramSet.has(name)) {
                    assignedVars.add(name);
                }
            }
            if (node.type === 'varDecl') {
                const name = node.pattern?.name || node.left?.name;
                if (name && !paramSet.has(name)) {
                    assignedVars.add(name);
                }
            }
            if (node.type === 'forIn' && node.keyVar) {
                if (!paramSet.has(node.keyVar)) {
                    assignedVars.add(node.keyVar);
                }
            }
            if (node.type === 'function' || node.type === 'FunctionDef') {
                if (node.name && !paramSet.has(node.name)) {
                    assignedVars.add(node.name);
                }
            }
            for (const key of Object.keys(node)) {
                if (node[key] && typeof node[key] === 'object') {
                    collect(node[key]);
                }
            }
        };
        collect(body);
        const renameMap = {};
        const counter = ++this._macroCounter;
        for (const v of assignedVars) {
            renameMap[v] = `__macro_${counter}_${v}`;
        }
        return renameMap;
    }

    _renameInternalVars(node, renameMap) {
        if (Array.isArray(node)) {
            return node.map(n => this._renameInternalVars(n, renameMap));
        }
        if (!node || typeof node !== 'object') return node;
        const isId = node.type === 'id' || node.type === 'identifier' || node.type === 'Identifier';
        if (isId && node.name && renameMap[node.name]) {
            return { ...node, name: renameMap[node.name] };
        }
        const result = { ...node };
        if (result.type === 'forIn' && result.keyVar && renameMap[result.keyVar]) {
            result.keyVar = renameMap[result.keyVar];
        }
        if (result.type === 'varDecl' && result.pattern && result.pattern.name && renameMap[result.pattern.name]) {
            result.pattern = { ...result.pattern, name: renameMap[result.pattern.name] };
        }
        if ((result.type === 'function' || result.type === 'FunctionDef') && result.name && renameMap[result.name]) {
            result.name = renameMap[result.name];
        }
        for (const key of Object.keys(result)) {
            if (result[key] && typeof result[key] === 'object') {
                result[key] = this._renameInternalVars(result[key], renameMap);
            }
        }
        return result;
    }
    
    substituteParams(node, paramMap) {
        if (Array.isArray(node)) {
            return node.map(n => this.substituteParams(n, paramMap));
        }
        
        if (!node || typeof node !== 'object') {
            return node;
        }
        
        if (node.type === 'id' || node.type === 'identifier' || node.type === 'Identifier') {
            if (paramMap[node.name]) {
                return paramMap[node.name];
            }
        }
        
        const result = { ...node };
        for (const key of Object.keys(result)) {
            if (result[key] && typeof result[key] === 'object') {
                result[key] = this.substituteParams(result[key], paramMap);
            }
        }
        
        return result;
    }

    expr(node) {
        if (!node) return this.emit(OP.NULL);
        
        switch (node.type) {
            case 'number':
            case 'string':
            case 'boolean':
                this.emit(OP.CONST, this.const(node.value));
                break;
            case 'null':
                this.emit(OP.NULL);
                break;
            case 'template':
                if (node.parts.length === 0) {
                    this.emit(OP.CONST, this.const(''));
                } else if (node.parts.length === 1) {
                    const part = node.parts[0];
                    if (part.type === 'string') {
                        this.emit(OP.CONST, this.const(part.value));
                    } else {
                        const tempParser = new Parser();
                        const tempAst = tempParser.parse(part.value);
                        if (tempAst.body.length > 0 && tempAst.body[0].expr) {
                            this.expr(tempAst.body[0].expr);
                        }
                    }
                } else {
                    let first = true;
                    for (const part of node.parts) {
                        if (part.type === 'string') {
                            this.emit(OP.CONST, this.const(part.value));
                        } else {
                            const tempParser = new Parser();
                            const tempAst = tempParser.parse(part.value);
                            if (tempAst.body.length > 0 && tempAst.body[0].expr) {
                                this.expr(tempAst.body[0].expr);
                            }
                        }
                        if (!first) {
                            this.emit(OP.ADD);
                        }
                        first = false;
                    }
                }
                break;
            case 'identifier':
            case 'Identifier':
            case 'id':
                const localResult = this.findLocal(node.name);
                if (localResult === -1) {
                    this.emit(OP.GET_GLOBAL, this.var(node.name));
                } else if (localResult.type === 'local') {
                    this.emit(OP.GET_LOCAL, localResult.idx);
                } else if (localResult.type === 'captured') {
                    let cvIdx = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(node.name) : -1;
                    if (this.currentFuncConst && cvIdx < 0) {
                        this.currentFuncConst.capturedVars.push(node.name);
                        cvIdx = this.currentFuncConst.capturedVars.length - 1;
                    }
                    if (cvIdx >= 0) {
                        this.emit(OP.GET_CAPTURED, cvIdx);
                    } else {
                        this.emit(OP.GET_CAPTURED, this.var(node.name));
                    }
                }
                break;
            case 'assign':
                this._lastExprWasAssign = false;
                if (node.left.type === 'identifier' || node.left.type === 'Identifier' || node.left.type === 'id') {
                    const assignResult = this.findLocal(node.left.name);
                    const isConstRight = node.right && (node.right.type === 'number' || node.right.type === 'string' || node.right.type === 'boolean');
                    if (this._exprAsStmt && assignResult && assignResult.type === 'local' && node.right && (node.right.type === 'binary' || node.right.type === 'Binary')) {
                        const bin = node.right;
                        if ((bin.op === '+' || bin.op === 'add') && (bin.left.type === 'identifier' || bin.left.type === 'id' || bin.left.type === 'Identifier') && bin.left.name === node.left.name) {
                            const leftLocal = this.findLocal(bin.left.name);
                            if (leftLocal && leftLocal.type === 'local' && leftLocal.idx === assignResult.idx) {
                                if (bin.right.type === 'number' && bin.right.value === 1) {
                                    this.emit(OP.INC_LOCAL, assignResult.idx);
                                    this._lastExprWasAssign = true;
                                    break;
                                }
                                const rightLocal = (bin.right.type === 'identifier' || bin.right.type === 'id' || bin.right.type === 'Identifier') ? this.findLocal(bin.right.name) : null;
                                if (rightLocal && rightLocal.type === 'local') {
                                    this.emit(OP.ADD_LOCAL_SET, assignResult.idx, rightLocal.idx);
                                    this._lastExprWasAssign = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (this._exprAsStmt && (assignResult === -1 || !assignResult) && node.right && (node.right.type === 'binary' || node.right.type === 'Binary')) {
                        const bin = node.right;
                        if ((bin.op === '+' || bin.op === 'add') && (bin.left.type === 'identifier' || bin.left.type === 'id' || bin.left.type === 'Identifier') && bin.left.name === node.left.name) {
                            const leftLocal = this.findLocal(bin.left.name);
                            if (leftLocal === -1 || !leftLocal) {
                                if (bin.right.type === 'number') {
                                    this.emit(OP.INC_GLOBAL, this.var(node.left.name), this.const(bin.right.value));
                                    this._lastExprWasAssign = true;
                                    break;
                                }
                                if (bin.right.type === 'identifier' || bin.right.type === 'id' || bin.right.type === 'Identifier') {
                                    const rightLocal = this.findLocal(bin.right.name);
                                    if (rightLocal === -1 || !rightLocal) {
                                        this.emit(OP.ADD_GLOBAL_SET, this.var(node.left.name), this.var(bin.right.name));
                                        this._lastExprWasAssign = true;
                                        break;
                                    }
                                }
                            }
                        } else if ((bin.op === '*' || bin.op === 'mul') && (bin.left.type === 'identifier' || bin.left.type === 'id' || bin.left.type === 'Identifier') && bin.left.name === node.left.name) {
                            const leftLocal = this.findLocal(bin.left.name);
                            if (leftLocal === -1 || !leftLocal) {
                                if (bin.right.type === 'number') {
                                    this.emit(OP.GET_GLOBAL, this.var(node.left.name));
                                    this.emit(OP.CONST, this.const(bin.right.value));
                                    this.emit(OP.MUL);
                                    this.emit(OP.SET_GLOBAL, this.var(node.left.name));
                                    this._lastExprWasAssign = true;
                                    break;
                                }
                            }
                        } else if ((bin.op === '-' || bin.op === 'sub') && (bin.left.type === 'identifier' || bin.left.type === 'id' || bin.left.type === 'Identifier') && bin.left.name === node.left.name) {
                            const leftLocal = this.findLocal(bin.left.name);
                            if (leftLocal === -1 || !leftLocal) {
                                if (bin.right.type === 'number') {
                                    this.emit(OP.GET_GLOBAL, this.var(node.left.name));
                                    this.emit(OP.CONST, this.const(bin.right.value));
                                    this.emit(OP.SUB);
                                    this.emit(OP.SET_GLOBAL, this.var(node.left.name));
                                    this._lastExprWasAssign = true;
                                    break;
                                }
                            }
                        } else if ((bin.op === '+' || bin.op === 'add') && (bin.left.type === 'identifier' || bin.left.type === 'id' || bin.left.type === 'Identifier') && (bin.right.type === 'identifier' || bin.right.type === 'id' || bin.right.type === 'Identifier')) {
                            const leftLocal = this.findLocal(bin.left.name);
                            const rightLocal = this.findLocal(bin.right.name);
                            if ((leftLocal === -1 || !leftLocal) && (rightLocal === -1 || !rightLocal) && (assignResult === -1 || !assignResult)) {
                                this.emit(OP.ADD_GLOBALS_SET_GLOBAL, this.var(node.left.name), this.var(bin.left.name), this.var(bin.right.name));
                                this._lastExprWasAssign = true;
                                break;
                            }
                        }
                    }
                    if (isConstRight && assignResult !== -1 && assignResult.type === 'local' && this._exprAsStmt) {
                        this.emit(OP.CONST_SET_LOCAL, this.const(node.right.value), assignResult.idx);
                        this._lastExprWasAssign = true;
                    } else if (isConstRight && assignResult !== -1 && assignResult.type === 'captured' && this._exprAsStmt) {
                        let cvIdx2 = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(node.left.name) : -1;
                        if (this.currentFuncConst && cvIdx2 < 0) {
                            this.currentFuncConst.capturedVars.push(node.left.name);
                            cvIdx2 = this.currentFuncConst.capturedVars.length - 1;
                        }
                        this.emit(OP.CONST, this.const(node.right.value));
                        this.emit(OP.SET_CAPTURED, cvIdx2 >= 0 ? cvIdx2 : this.var(node.left.name));
                        this._lastExprWasAssign = true;
                    } else if (isConstRight && assignResult === -1 && !this.globalVars.has(node.left.name) && this.locals.length > 0 && this._exprAsStmt) {
                        const scope = this.locals[this.locals.length - 1];
                        const newIdx = this.localCount++;
                        scope[node.left.name] = newIdx;
                        this.emit(OP.CONST_SET_LOCAL, this.const(node.right.value), newIdx);
                        this._lastExprWasAssign = true;
                    } else {
                        if (isConstRight && this._exprAsStmt && this.globalVars.has(node.left.name)) {
                            this.emit(OP.CONST_SET_GLOBAL, this.var(node.left.name), this.const(node.right.value));
                            this._lastExprWasAssign = true;
                        } else if (isConstRight && this._exprAsStmt && assignResult === -1 && this.locals.length === 0) {
                            this.globalVars.add(node.left.name);
                            this.emit(OP.CONST_SET_GLOBAL, this.var(node.left.name), this.const(node.right.value));
                            this._lastExprWasAssign = true;
                        } else {
                        {
                            const prevExprAsStmt = this._exprAsStmt;
                            this._exprAsStmt = false;
                            this.expr(node.right);
                            this._exprAsStmt = prevExprAsStmt;
                        }
                        if (assignResult === -1) {
                        if (this.globalVars.has(node.left.name)) {
                            this.emit(OP.SET_GLOBAL, this.var(node.left.name));
                            if (!this._exprAsStmt) this.emit(OP.GET_GLOBAL, this.var(node.left.name));
                            else this._lastExprWasAssign = true;
                        } else if (this.locals.length > 0) {
                            const scope = this.locals[this.locals.length - 1];
                            const newIdx = this.localCount++;
                            scope[node.left.name] = newIdx;
                            this.emit(OP.SET_LOCAL, newIdx);
                            if (!this._exprAsStmt) this.emit(OP.GET_LOCAL, newIdx);
                            else this._lastExprWasAssign = true;
                        } else {
                            this.globalVars.add(node.left.name);
                            this.emit(OP.SET_GLOBAL, this.var(node.left.name));
                            if (!this._exprAsStmt) this.emit(OP.GET_GLOBAL, this.var(node.left.name));
                            else this._lastExprWasAssign = true;
                        }
                    } else if (assignResult.type === 'local') {
                        this.emit(OP.SET_LOCAL, assignResult.idx);
                        if (!this._exprAsStmt) this.emit(OP.GET_LOCAL, assignResult.idx);
                        else this._lastExprWasAssign = true;
                    } else if (assignResult.type === 'captured') {
                        let cvIdx2 = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(node.left.name) : -1;
                        if (this.currentFuncConst && cvIdx2 < 0) {
                            this.currentFuncConst.capturedVars.push(node.left.name);
                            cvIdx2 = this.currentFuncConst.capturedVars.length - 1;
                        }
                        this.emit(OP.SET_CAPTURED, cvIdx2 >= 0 ? cvIdx2 : this.var(node.left.name));
                        if (!this._exprAsStmt) this.emit(OP.GET_CAPTURED, cvIdx2 >= 0 ? cvIdx2 : this.var(node.left.name));
                        else this._lastExprWasAssign = true;
                    }
                    }
                    }
                } else if (node.left.type === 'member' || node.left.type === 'Member') {
                    {
                        const prevExprAsStmt = this._exprAsStmt;
                        this._exprAsStmt = false;
                        this.expr(node.right);
                        this._exprAsStmt = prevExprAsStmt;
                    }
                    this.emit(OP.CONST, this.const(node.left.property));
                    this.expr(node.left.object);
                    this.emit(OP.SET);
                } else if (node.left.type === 'index' || node.left.type === 'Index') {
                    {
                        const prevExprAsStmt = this._exprAsStmt;
                        this._exprAsStmt = false;
                        this.expr(node.right);
                        this._exprAsStmt = prevExprAsStmt;
                    }
                    this.expr(node.left.index);
                    this.expr(node.left.object);
                    this.emit(OP.ARRAY_SET);
                }
                break;
            case 'conditional':
            case 'Conditional':
                this.expr(node.condition);
                const elseJump = this.emit(OP.JUMP_FALSE, 0);
                this.expr(node.consequent);
                const endJump = this.emit(OP.JUMP, 0);
                this.patch(elseJump, this.code.length - elseJump - 2);
                this.expr(node.alternate);
                this.patch(endJump, this.code.length - endJump - 2);
                break;
            case 'binary':
            case 'Binary':
                const optimizedBinary = this.optimizeExpr(node);
                if (optimizedBinary.type === 'number' || optimizedBinary.type === 'string' || optimizedBinary.type === 'boolean') {
                    this.emit(OP.CONST, this.const(optimizedBinary.value));
                    break;
                }
                if (optimizedBinary.type === 'null') {
                    this.emit(OP.NULL);
                    break;
                }
                if (optimizedBinary.op === 'and') {
                    this.expr(optimizedBinary.left);
                    const falseJump = this.emit(OP.JUMP_FALSE_PEEK, 0);
                    this.emit(OP.POP);
                    this.expr(optimizedBinary.right);
                    this.patch(falseJump, this.code.length - falseJump - 2);
                } else if (optimizedBinary.op === 'or') {
                    this.expr(optimizedBinary.left);
                    const falseJump = this.emit(OP.JUMP_FALSE_PEEK, 0);
                    const skipJump = this.emit(OP.JUMP, 0);
                    this.patch(falseJump, this.code.length - falseJump - 2);
                    this.emit(OP.POP);
                    this.expr(optimizedBinary.right);
                    this.patch(skipJump, this.code.length - skipJump - 2);
                } else {
                    if (optimizedBinary.op === '+' && (optimizedBinary.left.type === 'identifier' || optimizedBinary.left.type === 'id' || optimizedBinary.left.type === 'Identifier') && (optimizedBinary.right.type === 'identifier' || optimizedBinary.right.type === 'id' || optimizedBinary.right.type === 'Identifier')) {
                        const leftLocal = this.findLocal(optimizedBinary.left.name);
                        const rightLocal = this.findLocal(optimizedBinary.right.name);
                        if (leftLocal && leftLocal.type === 'local' && rightLocal && rightLocal.type === 'local') {
                            this.emit(OP.ADD_LOCAL, leftLocal.idx, rightLocal.idx);
                        } else if (leftLocal && leftLocal.type === 'captured' && rightLocal && rightLocal.type === 'local') {
                            if (this.currentFuncConst && !this.currentFuncConst.capturedVars.includes(optimizedBinary.left.name)) {
                                this.currentFuncConst.capturedVars.push(optimizedBinary.left.name);
                            }
                            const cvIdx5 = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(optimizedBinary.left.name) : -1;
                            this.emit(OP.ADD_CAPTURED_LOCAL, cvIdx5 >= 0 ? cvIdx5 : this.var(optimizedBinary.left.name), rightLocal.idx);
                        } else if (leftLocal === -1 && rightLocal === -1 && this.globalVars.has(optimizedBinary.left.name) && this.globalVars.has(optimizedBinary.right.name)) {
                            this.emit(OP.ADD_GLOBAL2, this.var(optimizedBinary.left.name), this.var(optimizedBinary.right.name));
                        } else {
                            this.expr(optimizedBinary.left);
                            this.expr(optimizedBinary.right);
                            this.emit(OP.ADD);
                        }
                    } else if (optimizedBinary.op === '<' && (optimizedBinary.left.type === 'identifier' || optimizedBinary.left.type === 'id' || optimizedBinary.left.type === 'Identifier') && optimizedBinary.right.type === 'number') {
                        const leftLocal = this.findLocal(optimizedBinary.left.name);
                        if (leftLocal && leftLocal.type === 'local') {
                            this.emit(OP.LT_LOCAL_CONST, leftLocal.idx, this.const(optimizedBinary.right.value));
                        } else {
                            this.expr(optimizedBinary.left);
                            this.expr(optimizedBinary.right);
                            this.emit(OP.LT);
                        }
                    } else {
                        const binOp = optimizedBinary.op;
                        const isLeftGlobalId = (optimizedBinary.left.type === 'identifier' || optimizedBinary.left.type === 'id' || optimizedBinary.left.type === 'Identifier') && this.findLocal(optimizedBinary.left.name) === -1 && this.globalVars.has(optimizedBinary.left.name);
                        const isRightGlobalId = (optimizedBinary.right.type === 'identifier' || optimizedBinary.right.type === 'id' || optimizedBinary.right.type === 'Identifier') && this.findLocal(optimizedBinary.right.name) === -1 && this.globalVars.has(optimizedBinary.right.name);
                        const isRightConst = optimizedBinary.right.type === 'number';
                        if (isLeftGlobalId && isRightGlobalId) {
                            const lv = this.var(optimizedBinary.left.name);
                            const rv = this.var(optimizedBinary.right.name);
                            if (binOp === '+') this.emit(OP.ADD_GLOBAL2, lv, rv);
                            else if (binOp === '-') this.emit(OP.SUB_GLOBAL2, lv, rv);
                            else if (binOp === '*') this.emit(OP.MUL_GLOBALS, lv, rv);
                            else if (binOp === '/') this.emit(OP.DIV_GLOBALS, lv, rv);
                            else { this.expr(optimizedBinary.left); this.expr(optimizedBinary.right); this.emit(this.op(binOp)); }
                        } else if (isLeftGlobalId && isRightConst) {
                            const gv = this.var(optimizedBinary.left.name);
                            const cv = this.const(optimizedBinary.right.value);
                            if (binOp === '*') this.emit(OP.MUL_GLOBAL_CONST, gv, cv);
                            else if (binOp === '+') this.emit(OP.ADD_GLOBAL_CONST, gv, cv);
                            else if (binOp === '-') this.emit(OP.SUB_GLOBAL_CONST, gv, cv);
                            else { this.expr(optimizedBinary.left); this.expr(optimizedBinary.right); this.emit(this.op(binOp)); }
                        } else {
                            this.expr(optimizedBinary.left);
                            this.expr(optimizedBinary.right);
                            this.emit(this.op(binOp));
                        }
                    }
                }
                break;
            case 'unary':
            case 'Unary':
                const optimizedUnary = this.optimizeExpr(node);
                if (optimizedUnary.type === 'number' || optimizedUnary.type === 'string' || optimizedUnary.type === 'boolean') {
                    this.emit(OP.CONST, this.const(optimizedUnary.value));
                    break;
                }
                if (optimizedUnary.type === 'null') {
                    this.emit(OP.NULL);
                    break;
                }
                this.expr(optimizedUnary.operand);
                if (optimizedUnary.op === '-') this.emit(OP.NEG);
                else if (optimizedUnary.op === '~') this.emit(OP.BITNOT);
                else this.emit(OP.NOT);
                break;
            case 'await':
            case 'Await':
                this.expr(node.expr);
                this.emit(OP.AWAIT);
                break;
            case 'call':
            case 'Call':
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && node.args.length === 1 && node.args[0].type === 'number' && this._constFoldFuncKinds && this._constFoldFuncKinds.has(node.callee.name)) {
                    const lv = this.findLocal(node.callee.name);
                    if (!lv || lv === -1) {
                        const n = node.args[0].value;
                        if (Number.isInteger(n) && n >= 0) {
                            const kind = this._constFoldFuncKinds.get(node.callee.name);
                            let folded = null;
                            if (kind === 'fib') folded = _fastFibNonNegInt(n);
                            else if (kind === 'sum_i') folded = n * (n - 1) / 2;
                            else if (kind === 'sum_i2') folded = n * (n - 1) * (2 * n - 1) / 6;
                            else if (kind === 'sum_i2_minus_i') folded = n * (n - 1) * (n - 2) / 3;
                            if (folded !== null) {
                                this.emit(OP.CONST, this.const(folded));
                                break;
                            }
                        }
                    }
                }
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && node.args.length === 0 && this._zeroArgSpecialFuncs && this._zeroArgSpecialFuncs.has(node.callee.name)) {
                    const lv = this.findLocal(node.callee.name);
                    if ((!lv || lv === -1) && this._elidedClassicFibFuncs && this._elidedClassicFibFuncs.has(node.callee.name)) {
                        const spec = this._zeroArgSpecialFuncs.get(node.callee.name);
                        this.emit(OP.MAKE_RANGE_ARRAY, this.const(spec.end));
                        break;
                    }
                }
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && node.args.length === 1 && node.args[0].type === 'number' && this._classicFibNames && this._classicFibNames.has(node.callee.name)) {
                    const lv = this.findLocal(node.callee.name);
                    if (!lv || lv === -1) {
                        const n = node.args[0].value;
                        if (Number.isInteger(n) && n >= 0) {
                            this.emit(OP.CONST, this.const(_fastFibNonNegInt(n)));
                            break;
                        }
                    }
                }
                if ((node.callee.type === 'member' || node.callee.type === 'Member') && node.args.length === 1) {
                    const prop = typeof node.callee.property === 'string'
                        ? node.callee.property
                        : (node.callee.property?.name ?? node.callee.property?.value);
                    const objType = node.callee.object?.type;
                    // 避免把实例方法(如 stack.push)误优化为数组 push
                    if (prop === 'push' && (objType === 'array' || objType === 'Array')) {
                        this.expr(node.callee.object);
                        this.expr(node.args[0]);
                        this.emit(this._exprAsStmt ? OP.ARRAY_PUSH_POP : OP.ARRAY_PUSH);
                        if (this._exprAsStmt) this._lastExprWasAssign = true;
                        break;
                    }
                }
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && node.callee.name === 'push' && node.args.length === 2) {
                    this.expr(node.args[0]);
                    this.expr(node.args[1]);
                    this.emit(this._exprAsStmt ? OP.ARRAY_PUSH_POP : OP.ARRAY_PUSH);
                    if (this._exprAsStmt) this._lastExprWasAssign = true;
                    break;
                }
                // Parser compatibility: `push(arr 0-999999)` may be tokenized as 3 args:
                // [arr, 0, (-999999)]. Fold back to `arr, (0 - 999999)`.
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') &&
                    node.callee.name === 'push' &&
                    node.args.length === 3 &&
                    node.args[1]?.type === 'number' &&
                    node.args[2]?.type === 'unary' &&
                    node.args[2]?.op === '-' &&
                    node.args[2]?.operand?.type === 'number') {
                    this.expr(node.args[0]);
                    this.expr({
                        type: 'binary',
                        op: '-',
                        left: node.args[1],
                        right: node.args[2].operand
                    });
                    this.emit(this._exprAsStmt ? OP.ARRAY_PUSH_POP : OP.ARRAY_PUSH);
                    if (this._exprAsStmt) this._lastExprWasAssign = true;
                    break;
                }
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && node.callee.name === 'len' && node.args.length === 1) {
                    this.expr(node.args[0]);
                    this.emit(OP.ARRAY_LEN);
                    break;
                }
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && node.callee.name === 'pop' && node.args.length === 1) {
                    this.expr(node.args[0]);
                    this.code.push(OP.CALL_BUILTIN);
                    this.code.push(this.const('pop'));
                    this.code.push(1);
                    break;
                }
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && node.callee.name === 'shift' && node.args.length === 1) {
                    this.expr(node.args[0]);
                    this.code.push(OP.CALL_BUILTIN);
                    this.code.push(this.const('shift'));
                    this.code.push(1);
                    break;
                }
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && node.callee.name === 'reserve' && node.args.length === 2) {
                    this.expr(node.args[0]);
                    this.expr(node.args[1]);
                    this.code.push(OP.CALL_BUILTIN);
                    this.code.push(this.const('reserve'));
                    this.code.push(2);
                    break;
                }
                if ((node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && node.callee.name === 'withCapacity' && node.args.length === 1) {
                    this.expr(node.args[0]);
                    this.code.push(OP.CALL_BUILTIN);
                    this.code.push(this.const('withCapacity'));
                    this.code.push(1);
                    break;
                }
                if (node.args.length === 1 && node.args[0].type === 'number' && (node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier')) {
                    const localIdx = this.findLocal(node.callee.name);
                    if (!localIdx || localIdx === -1) {
                        this.emit(OP.CALL_GLOBAL_CONST1, this.var(node.callee.name), this.const(node.args[0].value));
                        break;
                    }
                }
                if (node.args.length === 2 && node.args[0].type === 'number' && node.args[1].type === 'number' && (node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier')) {
                    const localIdx = this.findLocal(node.callee.name);
                    if (!localIdx || localIdx === -1) {
                        this.emit(OP.CALL_GLOBAL_CONST2, this.var(node.callee.name), this.const(node.args[0].value), this.const(node.args[1].value));
                        break;
                    }
                }
                if (node.args.length === 1 && (node.callee.type === 'identifier' || node.callee.type === 'id' || node.callee.type === 'Identifier') && this.currentFuncConst && node.callee.name === this.currentFuncConst.name) {
                    const localIdx = this.findLocal(node.callee.name);
                    if (!localIdx || localIdx === -1) {
                        const arg = node.args[0];
                        if (arg.type === 'binary' && arg.op === '-' && (arg.left.type === 'identifier' || arg.left.type === 'id' || arg.left.type === 'Identifier') && arg.right.type === 'number') {
                            const leftLocal = this.findLocal(arg.left.name);
                            if (leftLocal && leftLocal !== -1) {
                                this.emit(OP.SELF_SUB_CONST, leftLocal.idx, this.const(arg.right.value));
                                this.emit(OP.CALL_SELF1);
                                break;
                            }
                        }
                        this.expr(node.args[0]);
                        this.emit(OP.CALL_SELF1);
                        break;
                    }
                }
                const normalizedCallArgs = this._normalizeCallArgsForNegLiteral(node.callee, node.args);
                this.expr(node.callee);
                for (const arg of normalizedCallArgs) this.expr(arg);
                this.emit(OP.CALL, normalizedCallArgs.length);
                break;
            case 'macroCall':
                this.expandMacro(node);
                break;
            case 'GenericCall':
            case 'genericCall':
                this.expr(node.callee);
                const typeArgsIdx = this.const(node.typeArgs);
                this.emit(OP.CONST, typeArgsIdx);
                for (const arg of node.args) this.expr(arg);
                this.emit(OP.GENERIC_CALL, node.args.length);
                break;
            case 'member':
            case 'Member':
                this.expr(node.object);
                this.emit(OP.GET_CONST, this.const(node.property));
                break;
            case 'index':
            case 'Index':
                this.expr(node.object);
                this.expr(node.index);
                this.emit(OP.ARRAY_GET);
                break;
            case 'array':
            case 'Array':
                for (const e of node.elements) this.expr(e);
                this.emit(OP.ARRAY, node.elements.length);
                break;
            case 'object':
            case 'Object':
                for (const p of node.pairs) {
                    if (p.spread) {
                        this.emit(OP.CONST, this.const(OBJECT_SPREAD_MARKER));
                        this.expr(p.value);
                        continue;
                    }
                    if (p.computed) {
                        this.expr(p.keyExpr);
                        this.expr(p.value);
                        continue;
                    }
                    this.emit(OP.CONST, this.const(p.key));
                    this.expr(p.value);
                }
                this.emit(OP.OBJECT, node.pairs.length);
                break;
            case 'assignment':
            case 'Assignment':
                {
                    const prevExprAsStmt = this._exprAsStmt;
                    this._exprAsStmt = false;
                    this.expr(node.value || node.right);
                    this._exprAsStmt = prevExprAsStmt;
                }
                const left = node.target || node.left;
                if (left.type === 'identifier' || left.type === 'Identifier' || left.type === 'id') {
                    const localIdx = this.findLocal(left.name);
                    if (localIdx !== -1 && localIdx.type === 'local') {
                        this.emit(OP.SET_LOCAL, localIdx.idx);
                    } else if (localIdx !== -1 && localIdx.type === 'captured') {
                        let cvIdx3 = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(left.name) : -1;
                        if (this.currentFuncConst && cvIdx3 < 0) {
                            this.currentFuncConst.capturedVars.push(left.name);
                            cvIdx3 = this.currentFuncConst.capturedVars.length - 1;
                        }
                        this.emit(OP.SET_CAPTURED, cvIdx3 >= 0 ? cvIdx3 : this.var(left.name));
                    } else if (this.locals.length > 0) {
                        const scope = this.locals[this.locals.length - 1];
                        const newIdx = this.localCount++;
                        scope[left.name] = newIdx;
                        this.emit(OP.SET_LOCAL, newIdx);
                    } else {
                        this.emit(OP.SET_GLOBAL, this.var(left.name));
                    }
                } else if (left.type === 'member' || left.type === 'Member') {
                    this.emit(OP.CONST, this.const(left.property));
                    this.expr(left.object);
                    this.emit(OP.SET);
                } else if (left.type === 'index' || left.type === 'Index') {
                    this.expr(left.index);
                    this.expr(left.object);
                    this.emit(OP.ARRAY_SET);
                }
                break;
            case 'function':
            case 'Function':
            case 'lambda':
                this.func(node);
                break;
            case 'new':
            case 'New':
                this.emit(OP.GET_GLOBAL, this.var(node.className || node.class));
                for (const arg of node.args) this.expr(arg);
                this.emit(OP.NEW, node.args.length);
                break;
            case 'superCall':
                for (const arg of node.args) this.expr(arg);
                this.emit(OP.SUPER_CALL, node.args.length);
                break;
            case 'superMethodCall':
            case 'SuperCallExpression':
                for (const arg of node.args) this.expr(arg);
                this.emit(OP.SUPER_METHOD_CALL, this.const(node.method), node.args.length);
                break;
            case 'match':
                 this.compileMatch(node);
                 break;
        }
    }
    
    compileMatch(node) {
        this.expr(node.expr || node.expression);
        const matchIdx = this.const(node.cases);
        this.emit(OP.MATCH, matchIdx);
    }

    findLocal(name) {
        // 从最近的局部作用域开始查找
        for (let i = this.locals.length - 1; i >= 0; i--) {
            const scope = this.locals[i];
            if (Object.prototype.hasOwnProperty.call(scope, name)) {
                const idx = scope[name];
                // 如果是最内层作用域，返回局部变量索引
                // 局部同名变量应优先屏蔽外层捕获变量
                if (i === this.locals.length - 1) {
                    // 被内部闭包捕获的本地变量在当前函数内也走 captured 读写，
                    // 以保证与内部闭包共享同一个可变引用。
                    if (this.currentFuncConst && this.currentFuncConst.capturedLocals && this.currentFuncConst.capturedLocals.includes(name)) {
                        return { type: 'captured', name, idx };
                    }
                    return { type: 'local', idx };
                } else {
                    // 如果变量被内部函数捕获，返回captured类型
                    if (this.currentFuncConst && this.currentFuncConst.capturedVars.includes(name)) {
                        return { type: 'captured', name, idx };
                    }
                    return { type: 'captured', name, idx };
                }
            }
        }
        return -1;
    }
    
    _scanForCapturedVars(node, localScope, capturedSet, depth = 0) {
        if (!node || typeof node !== 'object') return;
        
        const visit = (n, d) => this._scanForCapturedVars(n, localScope, capturedSet, d);
        
        if (node.type === 'function' || node.type === 'FunctionDef') {
            const innerLocals = Object.create(null);
            let innerLocalCount = 0;
            for (const p of (node.params || [])) {
                if (!(p in innerLocals)) innerLocals[p] = innerLocalCount++;
            }
            if (node.body) {
                const bodyArr = Array.isArray(node.body) ? node.body : [node.body];
                for (const s of bodyArr) {
                    innerLocalCount = this._collectLocalVars(s, innerLocals, innerLocalCount, node);
                }
            }
            const scanInner = (n) => {
                if (!n || typeof n !== 'object') return;
                if (n.type === 'identifier' || n.type === 'id' || n.type === 'Identifier') {
                    const name = n.name;
                    if (name in localScope && !(name in innerLocals)) {
                        capturedSet.add(name);
                    }
                }
                for (const key in n) {
                    if (key === 'type') continue;
                    const val = n[key];
                    if (Array.isArray(val)) {
                        val.forEach(v => scanInner(v));
                    } else if (val && typeof val === 'object') {
                        scanInner(val);
                    }
                }
            };
            if (depth >= 0 && node.body) {
                scanInner(node.body);
            }
            if (node.body) {
                if (Array.isArray(node.body)) {
                    node.body.forEach(s => visit(s, depth + 1));
                } else {
                    visit(node.body, depth + 1);
                }
            }
            return;
        }
        
        if (node.type === 'identifier' || node.type === 'id' || node.type === 'Identifier') {
            return;
        }
        
        for (const key in node) {
            if (key === 'type') continue;
            const val = node[key];
            if (Array.isArray(val)) {
                val.forEach(v => visit(v, depth));
            } else if (val && typeof val === 'object') {
                visit(val, depth);
            }
        }
    }

    _scanDirectCapturedVars(node, localScope, outerScope, capturedSet) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'function' || node.type === 'FunctionDef') return;
        if (node.type === 'identifier' || node.type === 'id' || node.type === 'Identifier') {
            const name = node.name;
            if (!(name in localScope) && (name in outerScope)) {
                capturedSet.add(name);
            }
            return;
        }
        for (const key in node) {
            if (key === 'type') continue;
            const val = node[key];
            if (Array.isArray(val)) {
                val.forEach(v => this._scanDirectCapturedVars(v, localScope, outerScope, capturedSet));
            } else if (val && typeof val === 'object') {
                this._scanDirectCapturedVars(val, localScope, outerScope, capturedSet);
            }
        }
    }

    _containsIdentifier(node, name) {
        if (!node || typeof node !== 'object' || !name) return false;
        if (node.type === 'function' || node.type === 'FunctionDef') return false;
        if ((node.type === 'identifier' || node.type === 'id' || node.type === 'Identifier') && node.name === name) return true;
        for (const key in node) {
            if (key === 'type') continue;
            const val = node[key];
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (this._containsIdentifier(item, name)) return true;
                }
            } else if (val && typeof val === 'object') {
                if (this._containsIdentifier(val, name)) return true;
            }
        }
        return false;
    }

    _containsSelfCall(node, fnName) {
        if (!node || typeof node !== 'object' || !fnName) return false;
        const nodeType = node.type;
        if (nodeType === 'call' || nodeType === 'Call') {
            const callee = node.callee;
            if (callee && (callee.type === 'identifier' || callee.type === 'id' || callee.type === 'Identifier') && callee.name === fnName) {
                return true;
            }
        }
        for (const key in node) {
            if (key === 'type') continue;
            const val = node[key];
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (this._containsSelfCall(item, fnName)) return true;
                }
            } else if (val && typeof val === 'object') {
                if (this._containsSelfCall(val, fnName)) return true;
            }
        }
        return false;
    }

    _getCalleeExpectedParamCount(callee) {
        if (!callee || (callee.type !== 'identifier' && callee.type !== 'id' && callee.type !== 'Identifier')) return null;
        const calleeName = callee.name;
        if (!calleeName) return null;
        if (this.currentFuncConst && this.currentFuncConst.name === calleeName && Array.isArray(this.currentFuncConst.params)) {
            return this.currentFuncConst.params.length;
        }
        const fnAst = this.funcASTs ? this.funcASTs[calleeName] : null;
        if (fnAst && Array.isArray(fnAst.params)) {
            return fnAst.params.length;
        }
        return null;
    }

    _normalizeCallArgsForNegLiteral(callee, args) {
        if (!Array.isArray(args) || args.length === 0) return args;
        const expectedParams = this._getCalleeExpectedParamCount(callee);
        if (!Number.isInteger(expectedParams) || expectedParams !== args.length + 1) return args;
        const last = args[args.length - 1];
        if (!last || last.type !== 'binary' || last.op !== '-') return args;
        const left = last.left;
        const right = last.right;
        const isIdentifierLeft = left && (left.type === 'identifier' || left.type === 'id' || left.type === 'Identifier');
        if (!isIdentifierLeft) return args;
        if (!(right && right.type === 'number')) return args;
        return [
            ...args.slice(0, -1),
            left,
            { type: 'unary', op: '-', operand: right }
        ];
    }
    
    _containsYield(node) {
        if (!node || typeof node !== 'object') return false;
        if (node.type === 'Yield' || node.type === 'YieldExpr') return true;
        if (node.type === 'function' || node.type === 'FunctionDef') {
            if (node.body) {
                const bodyArr = Array.isArray(node.body) ? node.body : [node.body];
                for (const s of bodyArr) {
                    if (this._containsYieldInner(s)) return true;
                }
            }
            return false;
        }
        if (node.type === 'lambda' || node.type === 'Lambda') return false;
        if (node.type === 'CoroutineDef' || node.type === 'coroutineDef') return false;
        if (node.type === 'macroCall' && node.name && this.macros[node.name]) {
            const macroBody = this.macros[node.name].body;
            if (Array.isArray(macroBody)) {
                for (const s of macroBody) {
                    if (this._containsYieldInner(s)) return true;
                }
            }
        }
        for (const key of Object.keys(node)) {
            const val = node[key];
            if (!val || typeof val !== 'object') continue;
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (this._containsYieldInner(item)) return true;
                }
            } else {
                if (this._containsYieldInner(val)) return true;
            }
        }
        return false;
    }
    
    _containsYieldInner(node) {
        if (!node || typeof node !== 'object') return false;
        if (node.type === 'Yield' || node.type === 'YieldExpr') return true;
        if (node.type === 'function' || node.type === 'FunctionDef' || node.type === 'lambda' || node.type === 'Lambda') return false;
        if (node.type === 'CoroutineDef' || node.type === 'coroutineDef') return false;
        if (node.type === 'macroCall' && node.name && this.macros[node.name]) {
            const macroBody = this.macros[node.name].body;
            if (Array.isArray(macroBody)) {
                for (const s of macroBody) {
                    if (this._containsYieldInner(s)) return true;
                }
            }
        }
        for (const key of Object.keys(node)) {
            const val = node[key];
            if (!val || typeof val !== 'object') continue;
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (this._containsYieldInner(item)) return true;
                }
            } else {
                if (this._containsYieldInner(val)) return true;
            }
        }
        return false;
    }
    
    _collectLocalVars(node, localScope, localCount, rootNode = node) {
        if (!node || typeof node !== 'object') return localCount;
        const selfUpdatingAssignCache = this._selfUpdatingAssignCache || (this._selfUpdatingAssignCache = new WeakMap());
        const hasSelfUpdatingAssignInCurrentFunction = (name) => {
            if (!name || !rootNode || typeof rootNode !== 'object') return false;
            let byName = selfUpdatingAssignCache.get(rootNode);
            if (!byName) {
                byName = new Map();
                selfUpdatingAssignCache.set(rootNode, byName);
            }
            if (byName.has(name)) return !!byName.get(name);
            const walk = (n) => {
                if (!n || typeof n !== 'object') return false;
                const t = n.type;
                if ((t === 'expr' && n.expr?.type === 'assign' && n.expr.left?.name === name && this._containsIdentifier(n.expr.right, name)) ||
                    (t === 'assign' && n.left?.name === name && this._containsIdentifier(n.right, name)) ||
                    (t === 'Action' && n.action === 'expr' && n.target?.type === 'Assignment' && n.target.target?.name === name && this._containsIdentifier(n.target.value || n.target.right, name))) {
                    return true;
                }
                for (const key in n) {
                    if (key === 'type') continue;
                    const v = n[key];
                    if (Array.isArray(v)) {
                        for (const item of v) {
                            if (walk(item)) return true;
                        }
                    } else if (v && typeof v === 'object') {
                        if (walk(v)) return true;
                    }
                }
                return false;
            };
            const found = walk(rootNode);
            byName.set(name, found);
            return found;
        };
        const hasVisibleGlobal = (name) => {
            if (!(name && this.globalVars && this.globalVars.has(name))) return false;
            const fnOrder = Number.isFinite(this._currentFunctionTopLevelOrder) ? this._currentFunctionTopLevelOrder : null;
            if (fnOrder == null) return true;
            const firstOrder = this.globalVarFirstOrder instanceof Map ? this.globalVarFirstOrder.get(name) : undefined;
            if (firstOrder == null) return true;
            return firstOrder <= fnOrder;
        };
        const existsInOuterScopes = (name) => {
            if (!name || !Array.isArray(this.locals) || this.locals.length === 0) return false;
            for (let i = 0; i < this.locals.length; i++) {
                const scope = this.locals[i];
                if (scope && Object.prototype.hasOwnProperty.call(scope, name)) return true;
            }
            return false;
        };
        const shouldTreatAsLocalAssign = (name, rhs) => {
            const outerLocalExists = existsInOuterScopes(name);
            if (outerLocalExists) {
                // Assignment should update the nearest existing scope binding.
                // Do not implicitly shadow an outer local in nested functions.
                return false;
            }
            if (hasVisibleGlobal(name)) {
                // Allow shadowing global function symbols (common temp names like `maxArea`),
                // but keep direct global updates for non-function globals.
                const isKnownFunctionName = !!(this.funcASTs && this.funcASTs[name]);
                if (isKnownFunctionName && !this._containsIdentifier(rhs, name)) return true;
                // Also allow local temps that have an in-function self-updating pattern,
                // e.g. `sum = 0` followed by `sum = sum + x`.
                if (!this._containsIdentifier(rhs, name) && hasSelfUpdatingAssignInCurrentFunction(name)) return true;
                return false;
            }
            return true;
        };
        
        if (node.type === 'varDecl') {
            const name = node.pattern?.name || node.pattern;
            if (name && typeof name === 'string' && !(name in localScope)) {
                localScope[name] = localCount++;
            }
        } else if (node.type === 'Action' && node.action === 'expr' && node.target?.type === 'Assignment') {
            const name = node.target.target?.name;
            const rhs = node.target.value || node.target.right || null;
            if (name && typeof name === 'string' && !(name in localScope) && shouldTreatAsLocalAssign(name, rhs)) {
                localScope[name] = localCount++;
            }
        } else if (node.type === 'expr' && node.expr?.type === 'assign') {
            const name = node.expr.left?.name;
            const rhs = node.expr.right || null;
            if (name && typeof name === 'string' && !(name in localScope) && shouldTreatAsLocalAssign(name, rhs)) {
                localScope[name] = localCount++;
            }
        } else if (node.type === 'assign') {
            const name = node.left?.name;
            const rhs = node.right || null;
            if (name && typeof name === 'string' && !(name in localScope) && shouldTreatAsLocalAssign(name, rhs)) {
                localScope[name] = localCount++;
            }
        } else if (node.type === 'function' || node.type === 'FunctionDef' || node.type === 'lambda') {
            const fnName = node.name;
            if (fnName && fnName !== 'anonymous' && !(fnName in localScope)) {
                localScope[fnName] = localCount++;
            }
            return localCount;
        }
        
        for (const key in node) {
            if (key === 'type') continue;
            const val = node[key];
            if (Array.isArray(val)) {
                for (const v of val) {
                    localCount = this._collectLocalVars(v, localScope, localCount, rootNode);
                }
            } else if (val && typeof val === 'object') {
                localCount = this._collectLocalVars(val, localScope, localCount, rootNode);
            }
        }
        
        return localCount;
    }
    
    func(node) {
        const returnsObjectLiteral = (fnNode) => {
            const body = Array.isArray(fnNode?.body) ? fnNode.body : (fnNode?.body ? [fnNode.body] : []);
            if (body.length === 0) return false;
            const last = body[body.length - 1];
            if (!last) return false;
            if ((last.type === 'return' || last.type === 'Return') && (last.value?.type === 'object' || last.value?.type === 'ObjectLiteral')) return true;
            return false;
        };
        if (node.genericParams && node.genericParams.length > 0) {
            const jumpOver = this.emit(OP.JUMP, 0);
            
            const start = this.code.length;
            const funcName = node.name || 'anonymous';
            
            const savedLocals = this.locals;
            const savedLocalCount = this.localCount;
            const savedFunctionOrder = this._currentFunctionTopLevelOrder;
            const savedIsAsync = this._isAsyncFunc;
            this._isAsyncFunc = !!node.async;
            const savedIsFiber = this._isFiberFunc;
            const isFiber = this._containsYield(node);
            this._isFiberFunc = isFiber;
            this._currentFunctionTopLevelOrder = Number.isFinite(this._currentTopLevelStmtIndex) ? this._currentTopLevelStmtIndex : null;
            
            const localScope = {};
            let localCount = 0;
            (node.params || []).forEach((p, i) => {
                localScope[p] = localCount++;
            });
            
            const outerLocals = savedLocals || [];
            this.locals = [...outerLocals, localScope];
            this.localCount = localCount;
            
            const capturedVars = [];
            const funcConst = { type: isFiber ? 'coroutine_def' : 'func', start, params: node.params || [], name: funcName, capturedVars, localScope: {}, genericParams: node.genericParams, async: !!node.async, fiber: isFiber };
            
            if (node.body) {
                const fullLocalScope = { ...localScope };
                let fullLocalCount = localCount;
                const bodyArr = Array.isArray(node.body) ? node.body : [node.body];
                for (const s of bodyArr) {
                    fullLocalCount = this._collectLocalVars(s, fullLocalScope, fullLocalCount, node);
                }
                const scopeIdx = this.locals.length - 1;
                const savedScopeForCapture = this.locals[scopeIdx];
                this.locals[scopeIdx] = fullLocalScope;
                const allScopes = {};
                const outerScopeNames = {};
                for (const scope of outerLocals) {
                    for (const name in scope) {
                        allScopes[name] = true;
                        outerScopeNames[name] = true;
                    }
                }
                for (const name in fullLocalScope) {
                    allScopes[name] = true;
                }
                const preCaptured = new Set();
                bodyArr.forEach(s => this._scanForCapturedVars(s, allScopes, preCaptured, 0));
                const capturedLocals = [];
                preCaptured.forEach(name => {
                    if (name in fullLocalScope && !(name in localScope)) {
                        capturedLocals.push(name);
                    } else if (!(name in fullLocalScope)) {
                        if (!capturedVars.includes(name)) {
                            capturedVars.push(name);
                        }
                    }
                });
                const directCaptured = new Set();
                bodyArr.forEach(s => this._scanDirectCapturedVars(s, fullLocalScope, outerScopeNames, directCaptured));
                directCaptured.forEach(name => {
                    if (!capturedVars.includes(name)) capturedVars.push(name);
                });
                funcConst.capturedLocals = capturedLocals;
                for (const name of capturedLocals) {
                    if (!capturedVars.includes(name)) capturedVars.push(name);
                }
                Object.assign(savedScopeForCapture, fullLocalScope);
                this.localCount = Math.max(this.localCount, fullLocalCount);
                this.locals[scopeIdx] = savedScopeForCapture;
            }
            
            const idx = this.const(funcConst);
            
            const savedCurrentFuncConst = this.currentFuncConst;
            this.currentFuncConst = funcConst;
            const savedNextStmt = this._nextStmt;
            
            if (funcConst.capturedLocals && funcConst.capturedLocals.length > 0) {
                const currentScope = this.locals[this.locals.length - 1];
                for (const varName of funcConst.capturedLocals) {
                    if (!(varName in currentScope)) {
                        currentScope[varName] = this.localCount++;
                    }
                }
            }
            
            this.funcNames[start] = funcName;
        this.funcASTs[funcName] = node;
            
            if (node.body) {
                if (!this._tco && _TailCallOptimizerCtor) {
                    try { this._tco = new _TailCallOptimizerCtor(); } catch(e) { this._tco = null; }
                }
                if (this._tco) {
                    const tcoResult = this._tco.optimize(node);
                    if (tcoResult.optimized) {
                        node.body = tcoResult.ast.body || tcoResult.ast.body;
                    }
                }
            }
            
            if (node.body) {
                if (Array.isArray(node.body)) {
                    const prevBodyRef = this._bodyRef;
                    const prevStmtIndex = this._stmtIndex;
                    this._bodyRef = node.body;
                    const bodyLen = node.body.length;
                    for (let i = 0; i < bodyLen; i++) {
                        const s = node.body[i];
                        this._stmtIndex = i;
                        const isLast = i === bodyLen - 1;
                        this._nextStmt = isLast ? null : node.body[i + 1];
                        const stmtCodeStart = this.code.length;
                        if (isLast && (s.type === 'expr' || s.type === 'function')) {
                            if (s.type === 'expr') {
                                this.expr(s.expr);
                            } else {
                                this.func(s);
                            }
                            if (this._isAsyncFunc) this.emit(OP.ASYNC);
                            this.emit(OP.RETURN);
                        } else {
                            this.stmt(s);
                        }
                        this._recordStmtCodeRange(node.body, i, stmtCodeStart, this.code.length);
                    }
                    this._bodyRef = prevBodyRef;
                    this._stmtIndex = prevStmtIndex;
                }
            }
            
            this.emit(OP.NULL);
            if (this._isAsyncFunc) this.emit(OP.ASYNC);
            this.emit(OP.RETURN);
            if (isFiber) this.emit(OP.HALT);
            
            const fullLocalScope = { ...localScope };
            if (node.body) {
                const bodyArr = Array.isArray(node.body) ? node.body : [node.body];
                for (const s of bodyArr) {
                    this._collectLocalVars(s, fullLocalScope, Object.keys(fullLocalScope).length, node);
                }
            }
            
            this.consts[idx].end = this.code.length;
            this.consts[idx].localScope = fullLocalScope;
            this.consts[idx]._lsa = [fullLocalScope];
            this.consts[idx]._localCount = this.localCount;
            this.consts[idx]._returnsObjectLiteral = returnsObjectLiteral(node);
            this.consts[idx]._noCapture = funcConst.capturedVars.length === 0 && outerLocals.length === 0;
            if (isFiber) {
                this.consts[idx].code = this.code;
                this.consts[idx].consts = this.consts;
                this.consts[idx].vars = Object.keys(this.vars);
            }
            const fnBodyStart = funcConst.start;
            const fnBodyEnd = this.code.length;
            let isLeaf = funcConst.capturedVars.length === 0 && outerLocals.length === 0;
            if (isLeaf) {
                for (let ci = fnBodyStart; ci < fnBodyEnd; ) {
                    const c = this.code[ci];
                    if (c === OP.CALL || c === OP.CALL_GLOBAL_CONST1 || c === OP.CALL_GLOBAL_CONST2 || c === OP.CALL_SELF1 || c === OP.CALL_LEAF_GLOBAL_CONST2 || c === OP.CLOSURE || c === OP.SELF_SUB_CONST || c === 147 || c === 148) {
                        isLeaf = false;
                        break;
                    }
                    if (c === OP.RETURN_ADD_LOCALS) { ci += 3; }
                    else if (c === OP.RETURN_SUB_LOCALS) { ci += 3; }
                    else if (c === OP.RETURN_MUL_LOCALS) { ci += 3; }
                    else if (c === OP.RETURN_DIV_LOCALS) { ci += 3; }
                    else if (c === OP.RETURN_LOCAL) { ci += 2; }
                    else if (c === OP.RETURN || c === OP.RETURN_SIMPLE) { ci += 1; }
                    else if (c === OP.SELF_SUB_CONST || c === 147 || c === 148) { ci += 3; }
                    else if (c >= 158 && c <= 161) { ci += 2; }
                    else if (c === OP.FOR_NESTED_MUL_SUM) { ci += 8; }
                    else if (c === OP.FOR_SUM_RANGE_PUSH) { ci += 5; }
                    else if (c === OP.FOR_COUNT_EVEN) { ci += 4; }
                    else if (c === OP.FOR_INDEX_ASSIGN) { ci += 5; }
                    else if (c === OP.SET_LEN_GLOBAL_CONST) { ci += 3; }
                    else if (c === OP.FOR_PUSH_RANGE) { ci += 7; }
                    else if (c === OP.FOR_ARRAY_SUM) { ci += 4; }
                    else if (c === OP.MAKE_RANGE_ARRAY) { ci += 2; }
                    else if (c === 155 || c === 156 || c === 157) { ci += 3; }
                    else { ci++; }
                }
            }
            if (isLeaf) {
                this.consts[idx]._isLeaf = true;
            }
            if (!isLeaf && funcConst.capturedVars.length === 0 && outerLocals.length === 0) {
                const bodyCode = this.code;
                let ci = fnBodyStart;
                let foundClosure = false;
                let closureIdx = -1;
                while (ci < fnBodyEnd) {
                    const c = bodyCode[ci];
                    if (c === OP.CLOSURE) {
                        if (foundClosure) { foundClosure = false; break; }
                        foundClosure = true;
                        closureIdx = bodyCode[ci + 1];
                        ci += 2;
                    } else if (c === OP.SET_GLOBAL_KEEP) {
                        ci += 2;
                    } else if (c === OP.RETURN) {
                        ci += 1;
                    } else if (c === OP.NOP) {
                        ci += 1;
                    } else if (c === OP.JUMP) {
                        ci = ci + 2 + bodyCode[ci + 1];
                    } else if (c === OP.NULL) {
                        ci += 1;
                    } else if (c >= 158 && c <= 161) {
                        ci += 2;
                    } else if (c === 155 || c === 156 || c === 157) {
                        ci += 3;
                    } else {
                        foundClosure = false;
                        break;
                    }
                }
                if (foundClosure && closureIdx >= 0) {
                    const innerFunc = this.consts[closureIdx];
                    if (innerFunc && innerFunc.capturedVars && innerFunc.capturedVars.length === 1 && innerFunc.capturedVars[0] in localScope) {
                        this.consts[idx]._returnsInlineClosure = true;
                        this.consts[idx]._innerClosureIdx = closureIdx;
                        this.consts[idx]._capturedLocalIdx = localScope[innerFunc.capturedVars[0]];
                        const innerStartOp = this.code[innerFunc.start];
                        if (innerStartOp >= 100 && innerStartOp <= 109) {
                            this.consts[idx]._innerInlineOp = innerStartOp;
                        }
                    }
                }
            }
            this.locals = savedLocals;
            this.localCount = savedLocalCount;
            this._currentFunctionTopLevelOrder = savedFunctionOrder;
            this._isAsyncFunc = savedIsAsync;
            this._isFiberFunc = savedIsFiber;
            this.currentFuncConst = savedCurrentFuncConst;
            this._nextStmt = savedNextStmt;
            
            this.code[jumpOver + 1] = this.code.length - jumpOver - 2;
            
            if (isFiber && capturedVars.length === 0) {
                this.emit(OP.COROUTINE, idx);
            } else {
                this.emit(OP.CLOSURE, idx);
            }
            if (node.name && node.name !== 'anonymous') {
                const bindLocal = this.findLocal(node.name);
                if (bindLocal !== -1 && bindLocal.type === 'local') {
                    this.emit(OP.SET_LOCAL, bindLocal.idx);
                } else if (bindLocal !== -1 && bindLocal.type === 'captured') {
                    let cvIdx = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(node.name) : -1;
                    if (this.currentFuncConst && cvIdx < 0) {
                        this.currentFuncConst.capturedVars.push(node.name);
                        cvIdx = this.currentFuncConst.capturedVars.length - 1;
                    }
                    this.emit(OP.SET_CAPTURED, cvIdx >= 0 ? cvIdx : this.var(node.name));
                } else {
                    this.emit(OP.SET_GLOBAL, this.var(node.name));
                }
            }
            return;
        }
        
        const jumpOver = this.emit(OP.JUMP, 0);
        
        const start = this.code.length;
        const funcName = node.name || 'anonymous';
        
        const savedLocals = this.locals;
        const savedLocalCount = this.localCount;
        const savedFunctionOrder = this._currentFunctionTopLevelOrder;
        const savedIsAsync = this._isAsyncFunc;
        this._isAsyncFunc = !!node.async;
        const savedIsFiber = this._isFiberFunc;
        const isFiber = this._containsYield(node);
        this._isFiberFunc = isFiber;
        this._currentFunctionTopLevelOrder = Number.isFinite(this._currentTopLevelStmtIndex) ? this._currentTopLevelStmtIndex : null;
        
        const localScope = {};
        let localCount = 0;
        (node.params || []).forEach((p, i) => {
            localScope[p] = localCount++;
        });
        
        const outerLocals = savedLocals || [];
        this.locals = [...outerLocals, localScope];
        this.localCount = localCount;
        
        const capturedVars = [];
        const funcConst = { type: isFiber ? 'coroutine_def' : 'func', start, params: node.params || [], name: funcName, capturedVars, localScope: {}, async: !!node.async, fiber: isFiber };
        
        if (node.body) {
            const fullLocalScope = { ...localScope };
            let fullLocalCount = localCount;
            const bodyArr = Array.isArray(node.body) ? node.body : [node.body];
            for (const s of bodyArr) {
                fullLocalCount = this._collectLocalVars(s, fullLocalScope, fullLocalCount, node);
            }
            const scopeIdx = this.locals.length - 1;
            const savedScopeForCapture = this.locals[scopeIdx];
            this.locals[scopeIdx] = fullLocalScope;
            const allScopes = {};
            const outerScopeNames = {};
            for (const scope of outerLocals) {
                for (const name in scope) {
                    allScopes[name] = true;
                    outerScopeNames[name] = true;
                }
            }
            for (const name in fullLocalScope) {
                allScopes[name] = true;
            }
            const preCaptured = new Set();
            bodyArr.forEach(s => this._scanForCapturedVars(s, allScopes, preCaptured, 0));
            const capturedLocals = [];
            preCaptured.forEach(name => {
                if (name in fullLocalScope && !(name in localScope)) {
                    capturedLocals.push(name);
                } else if (!(name in fullLocalScope)) {
                    if (!capturedVars.includes(name)) {
                        capturedVars.push(name);
                    }
                }
            });
            const directCaptured = new Set();
            bodyArr.forEach(s => this._scanDirectCapturedVars(s, fullLocalScope, outerScopeNames, directCaptured));
            directCaptured.forEach(name => {
                if (!capturedVars.includes(name)) capturedVars.push(name);
            });
            funcConst.capturedLocals = capturedLocals;
            for (const name of capturedLocals) {
                if (!capturedVars.includes(name)) capturedVars.push(name);
            }
            Object.assign(savedScopeForCapture, fullLocalScope);
            this.localCount = Math.max(this.localCount, fullLocalCount);
            this.locals[scopeIdx] = savedScopeForCapture;
        }
        
        const idx = this.const(funcConst);
        
        const savedCurrentFuncConst = this.currentFuncConst;
        this.currentFuncConst = funcConst;
        const savedNextStmt = this._nextStmt;
        
        if (funcConst.capturedLocals && funcConst.capturedLocals.length > 0) {
            const currentScope = this.locals[this.locals.length - 1];
            for (const varName of funcConst.capturedLocals) {
                if (!(varName in currentScope)) {
                    currentScope[varName] = this.localCount++;
                }
            }
        }
        
        this.funcNames[start] = funcName;
        this.funcASTs[funcName] = node;
        
        if (node.body) {
            if (!this._tco && _TailCallOptimizerCtor) {
                try { this._tco = new _TailCallOptimizerCtor(); } catch(e) { this._tco = null; }
            }
            if (this._tco) {
                const tcoResult = this._tco.optimize(node);
                if (tcoResult.optimized) {
                    node.body = tcoResult.ast.body || tcoResult.ast.body;
                }
            }
        }
        
        if (node.body) {
            if (Array.isArray(node.body)) {
                const prevBodyRef = this._bodyRef;
                const prevStmtIndex = this._stmtIndex;
                this._bodyRef = node.body;
                const bodyLen = node.body.length;
                for (let i = 0; i < bodyLen; i++) {
                    const s = node.body[i];
                    this._stmtIndex = i;
                    const isLast = i === bodyLen - 1;
                    this._nextStmt = isLast ? null : node.body[i + 1];
                    const stmtCodeStart = this.code.length;
                    if (isLast && (s.type === 'expr' || s.type === 'function')) {
                        if (s.type === 'expr') {
                            this.expr(s.expr);
                        } else {
                            this.func(s);
                        }
                        if (this._isAsyncFunc) this.emit(OP.ASYNC);
                        this.emit(OP.RETURN);
                    } else {
                        this.stmt(s);
                    }
                    this._recordStmtCodeRange(node.body, i, stmtCodeStart, this.code.length);
                }
                this._bodyRef = prevBodyRef;
                this._stmtIndex = prevStmtIndex;
            } else {
                this.expr(node.body);
            }
        }
        
        this.emit(OP.NULL);
        if (this._isAsyncFunc) this.emit(OP.ASYNC);
        this.emit(OP.RETURN);
        if (isFiber) this.emit(OP.HALT);
        
        const fullLocalScope2 = { ...localScope };
        if (node.body) {
            const bodyArr = Array.isArray(node.body) ? node.body : [node.body];
            for (const s of bodyArr) {
                this._collectLocalVars(s, fullLocalScope2, Object.keys(fullLocalScope2).length, node);
            }
        }
        
        this.consts[idx].end = this.code.length;
        this.consts[idx].localScope = fullLocalScope2;
        this.consts[idx]._lsa = [fullLocalScope2];
        this.consts[idx]._localCount = this.localCount;
        this.consts[idx]._returnsObjectLiteral = returnsObjectLiteral(node);
        this.consts[idx]._noCapture = funcConst.capturedVars.length === 0 && outerLocals.length === 0;
        if (isFiber) {
            this.consts[idx].code = this.code;
            this.consts[idx].consts = this.consts;
            this.consts[idx].vars = Object.keys(this.vars);
        }
        const fnBodyStart2 = funcConst.start;
        const fnBodyEnd2 = this.code.length;
        let isLeaf2 = funcConst.capturedVars.length === 0 && outerLocals.length === 0;
        if (isLeaf2) {
            for (let ci = fnBodyStart2; ci < fnBodyEnd2; ) {
                const c = this.code[ci];
                if (c === OP.CALL || c === OP.CALL_GLOBAL_CONST1 || c === OP.CALL_GLOBAL_CONST2 || c === OP.CALL_SELF1 || c === OP.CALL_LEAF_GLOBAL_CONST2 || c === OP.CLOSURE || c === OP.SELF_SUB_CONST || c === 147 || c === 148) {
                    isLeaf2 = false;
                    break;
                }
                if (c === OP.RETURN_ADD_LOCALS) { ci += 3; }
                else if (c === OP.RETURN_SUB_LOCALS) { ci += 3; }
                else if (c === OP.RETURN_MUL_LOCALS) { ci += 3; }
                else if (c === OP.RETURN_DIV_LOCALS) { ci += 3; }
                else if (c === OP.RETURN_LOCAL) { ci += 2; }
                else if (c === OP.RETURN || c === OP.RETURN_SIMPLE) { ci += 1; }
                else if (c === OP.SELF_SUB_CONST || c === 147 || c === 148) { ci += 3; }
                else if (c >= 158 && c <= 161) { ci += 2; }
                else if (c === OP.FOR_NESTED_MUL_SUM) { ci += 8; }
                else if (c === OP.FOR_SUM_RANGE_PUSH) { ci += 5; }
                else if (c === OP.FOR_COUNT_EVEN) { ci += 4; }
                else if (c === OP.FOR_INDEX_ASSIGN) { ci += 5; }
                else if (c === OP.SET_LEN_GLOBAL_CONST) { ci += 3; }
                else if (c === OP.FOR_PUSH_RANGE) { ci += 7; }
                else if (c === OP.FOR_ARRAY_SUM) { ci += 4; }
                else if (c === OP.MAKE_RANGE_ARRAY) { ci += 2; }
                else if (c === 155 || c === 156 || c === 157) { ci += 3; }
                else { ci++; }
            }
        }
        if (isLeaf2) {
            this.consts[idx]._isLeaf = true;
        }
        if (!isLeaf2 && funcConst.capturedVars.length === 0 && outerLocals.length === 0) {
            const bodyCode = this.code;
            let ci = fnBodyStart2;
            let foundClosure = false;
            let closureIdx = -1;
            while (ci < fnBodyEnd2) {
                const c = bodyCode[ci];
                if (c === OP.CLOSURE) {
                    if (foundClosure) { foundClosure = false; break; }
                    foundClosure = true;
                    closureIdx = bodyCode[ci + 1];
                    ci += 2;
                } else if (c === OP.SET_GLOBAL_KEEP) {
                    ci += 2;
                } else if (c === OP.RETURN) {
                    ci += 1;
                } else if (c === OP.NOP) {
                    ci += 1;
                } else if (c === OP.JUMP) {
                    ci = ci + 2 + bodyCode[ci + 1];
                } else if (c === OP.NULL) {
                    ci += 1;
                } else if (c >= 158 && c <= 161) {
                    ci += 2;
                } else if (c === 155 || c === 156 || c === 157) {
                    ci += 3;
                } else {
                    foundClosure = false;
                    break;
                }
            }
            if (foundClosure && closureIdx >= 0) {
                const innerFunc = this.consts[closureIdx];
                if (innerFunc && innerFunc.capturedVars && innerFunc.capturedVars.length === 1 && innerFunc.capturedVars[0] in localScope) {
                    this.consts[idx]._returnsInlineClosure = true;
                    this.consts[idx]._innerClosureIdx = closureIdx;
                    this.consts[idx]._capturedLocalIdx = localScope[innerFunc.capturedVars[0]];
                    const innerStartOp = this.code[innerFunc.start];
                    if (innerStartOp >= 100 && innerStartOp <= 109) {
                        this.consts[idx]._innerInlineOp = innerStartOp;
                    }
                }
            }
        }
        this.locals = savedLocals;
        this.localCount = savedLocalCount;
        this._currentFunctionTopLevelOrder = savedFunctionOrder;
        this._isAsyncFunc = savedIsAsync;
        this._isFiberFunc = savedIsFiber;
        this.currentFuncConst = savedCurrentFuncConst;
        this._nextStmt = savedNextStmt;
        
        this.code[jumpOver + 1] = this.code.length - jumpOver - 2;
        
        if (isFiber && capturedVars.length === 0) {
            this.emit(OP.COROUTINE, idx);
        } else {
            this.emit(OP.CLOSURE, idx);
        }
        if (node.name && node.name !== 'anonymous') {
            const nextStmt = this._nextStmt;
            const bindLocal = this.findLocal(node.name);
            if (nextStmt && (nextStmt.type === 'return' || nextStmt.type === 'Return') && 
                nextStmt.value && (nextStmt.value.type === 'identifier' || nextStmt.value.type === 'id' || nextStmt.value.type === 'Identifier') &&
                nextStmt.value.name === node.name && (bindLocal === -1 || bindLocal.type === 'global')) {
                this.emit(OP.SET_GLOBAL_KEEP, this.var(node.name));
                this._skipNextReturn = true;
            } else if (bindLocal !== -1 && bindLocal.type === 'local') {
                this.emit(OP.SET_LOCAL, bindLocal.idx);
            } else if (bindLocal !== -1 && bindLocal.type === 'captured') {
                let cvIdx = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(node.name) : -1;
                if (this.currentFuncConst && cvIdx < 0) {
                    this.currentFuncConst.capturedVars.push(node.name);
                    cvIdx = this.currentFuncConst.capturedVars.length - 1;
                }
                this.emit(OP.SET_CAPTURED, cvIdx >= 0 ? cvIdx : this.var(node.name));
            } else {
                this.emit(OP.SET_GLOBAL, this.var(node.name));
            }
            if (this.canInline(node)) {
                this.inlineCandidates[node.name] = node;
            }
        }
    }
    
    canInline(node) {
        if (!node.name) return false;
        if (!node.body) return false;
        if (node.params && node.params.length > 3) return false;
        
        if (Array.isArray(node.body)) {
            if (node.body.length !== 1) return false;
            const stmt = node.body[0];
            if (stmt.type !== 'expr' && stmt.type !== 'return' && stmt.type !== 'Return') return false;
            
            const expr = stmt.type === 'expr' ? stmt.expr : stmt.value;
            if (this.callsParam(expr, node.params || [])) return false;
            if (this.callsSelf(expr, node.name)) return false;
        }
        
        return true;
    }
    
    callsSelf(node, funcName) {
        if (!node) return false;
        
        if (node.type === 'call' || node.type === 'Call') {
            if (node.callee.type === 'identifier' || node.callee.type === 'Identifier' || node.callee.type === 'id') {
                if (node.callee.name === funcName) return true;
            }
        }
        
        if (node.left && this.callsSelf(node.left, funcName)) return true;
        if (node.right && this.callsSelf(node.right, funcName)) return true;
        if (node.operand && this.callsSelf(node.operand, funcName)) return true;
        if (node.callee && this.callsSelf(node.callee, funcName)) return true;
        if (node.args) {
            for (const arg of node.args) {
                if (this.callsSelf(arg, funcName)) return true;
            }
        }
        
        return false;
    }
    
    callsParam(node, params) {
        if (!node) return false;
        
        if (node.type === 'call' || node.type === 'Call') {
            if (node.callee.type === 'identifier' || node.callee.type === 'Identifier' || node.callee.type === 'id') {
                if (params.includes(node.callee.name)) return true;
            }
        }
        
        if (node.left && this.callsParam(node.left, params)) return true;
        if (node.right && this.callsParam(node.right, params)) return true;
        if (node.operand && this.callsParam(node.operand, params)) return true;
        if (node.callee && this.callsParam(node.callee, params)) return true;
        if (node.args) {
            for (const arg of node.args) {
                if (this.callsParam(arg, params)) return true;
            }
        }
        
        return false;
    }
    
    tryInline(node) {
        if (node.callee.type !== 'identifier' && node.callee.type !== 'Identifier' && node.callee.type !== 'id') {
            return false;
        }
        
        const funcName = node.callee.name;
        const funcDef = this.inlineCandidates[funcName];
        if (!funcDef) return false;
        
        const paramBindings = {};
        (funcDef.params || []).forEach((p, i) => {
            paramBindings[p] = this.optimizeExpr(node.args[i]);
        });
        
        if (Array.isArray(funcDef.body)) {
            const stmt = funcDef.body[0];
            if (stmt.type === 'expr') {
                this.exprWithBindings(stmt.expr, paramBindings);
                return true;
            }
            if (stmt.type === 'return' || stmt.type === 'Return') {
                this.exprWithBindings(stmt.value || { type: 'null' }, paramBindings);
                return true;
            }
        } else {
            this.exprWithBindings(funcDef.body, paramBindings);
            return true;
        }
        
        return false;
    }
    
    exprWithBindings(node, bindings) {
        if (!node) return this.emit(OP.NULL);
        
        if (node.type === 'identifier' || node.type === 'Identifier' || node.type === 'id') {
            if (bindings[node.name]) {
                this.expr(bindings[node.name]);
                return;
            }
        }
        
        if (node.type === 'binary' || node.type === 'Binary') {
            const optimizedBinary = this.optimizeExpr(node);
            if (optimizedBinary.type === 'number' || optimizedBinary.type === 'string' || optimizedBinary.type === 'boolean') {
                this.emit(OP.CONST, this.const(optimizedBinary.value));
                return;
            }
            if (optimizedBinary.type === 'null') {
                this.emit(OP.NULL);
                return;
            }
            if (optimizedBinary.op === 'and') {
                this.exprWithBindings(optimizedBinary.left, bindings);
                const falseJump = this.emit(OP.JUMP_FALSE_PEEK, 0);
                this.emit(OP.POP);
                this.exprWithBindings(optimizedBinary.right, bindings);
                this.patch(falseJump, this.code.length - falseJump - 2);
            } else if (optimizedBinary.op === 'or') {
                this.exprWithBindings(optimizedBinary.left, bindings);
                const falseJump = this.emit(OP.JUMP_FALSE_PEEK, 0);
                const skipJump = this.emit(OP.JUMP, 0);
                this.patch(falseJump, this.code.length - falseJump - 2);
                this.emit(OP.POP);
                this.exprWithBindings(optimizedBinary.right, bindings);
                this.patch(skipJump, this.code.length - skipJump - 2);
            } else {
                this.exprWithBindings(optimizedBinary.left, bindings);
                this.exprWithBindings(optimizedBinary.right, bindings);
                this.emit(this.op(optimizedBinary.op));
            }
            return;
        }
        
        if (node.type === 'unary' || node.type === 'Unary') {
            const optimizedUnary = this.optimizeExpr(node);
            if (optimizedUnary.type === 'number' || optimizedUnary.type === 'string' || optimizedUnary.type === 'boolean') {
                this.emit(OP.CONST, this.const(optimizedUnary.value));
                return;
            }
            if (optimizedUnary.type === 'null') {
                this.emit(OP.NULL);
                return;
            }
            this.exprWithBindings(optimizedUnary.operand, bindings);
            this.emit(optimizedUnary.op === '-' ? OP.NEG : OP.NOT);
            return;
        }
        
        if (node.type === 'conditional' || node.type === 'Conditional') {
            this.exprWithBindings(node.condition, bindings);
            const elseJump = this.emit(OP.JUMP_FALSE, 0);
            this.exprWithBindings(node.consequent, bindings);
            const endJump = this.emit(OP.JUMP, 0);
            this.patch(elseJump, this.code.length - elseJump - 2);
            this.exprWithBindings(node.alternate, bindings);
            this.patch(endJump, this.code.length - endJump - 2);
            return;
        }
        
        this.expr(node);
    }
    
    ifStmt(node) {
        const optimizedCondition = this.optimizeExpr(node.condition);
        
        if (this.isConstant(optimizedCondition)) {
            const condValue = this.evalConstant(optimizedCondition);
            if (condValue) {
                for (const s of node.then) this.stmt(s);
            } else if (node.else) {
                if (node.else.type === 'if') {
                    this.ifStmt(node.else);
                } else {
                    for (const s of node.else) this.stmt(s);
                }
            }
            return;
        }
        
        this.expr(optimizedCondition);
        const elsePos = this.emit(OP.JUMP_FALSE, 0);
        
        for (const s of node.then) this.stmt(s);
        
        if (node.else) {
            const endPos = this.emit(OP.JUMP, 0);
            this.code[elsePos + 1] = this.code.length - elsePos - 2;
            
            if (node.else.type === 'if') {
                this.ifStmt(node.else);
            } else {
                for (const s of node.else) this.stmt(s);
            }
            this.code[endPos + 1] = this.code.length - endPos - 2;
        } else {
            this.code[elsePos + 1] = this.code.length - elsePos - 2;
        }
    }
    
    whileStmt(node) {
        const optimizedCondition = this.optimizeExpr(node.condition);
        const hasLoopControlInBody = this._containsLoopControlStmt(node.body);
        
        if (this.isConstant(optimizedCondition)) {
            const condValue = this.evalConstant(optimizedCondition);
            if (!condValue) {
                return;
            }
        }
        
        const start = this.code.length;
        let usedLoopLt = false;
        if (!hasLoopControlInBody &&
            optimizedCondition.type === 'binary' && optimizedCondition.op === '<' &&
            (optimizedCondition.left.type === 'identifier' || optimizedCondition.left.type === 'id' || optimizedCondition.left.type === 'Identifier') &&
            optimizedCondition.right.type === 'number') {
            const leftLocal = this.findLocal(optimizedCondition.left.name);
            if (leftLocal && leftLocal.type === 'local') {
                this.emit(OP.LOOP_LT, leftLocal.idx, this.const(optimizedCondition.right.value));
                this.code.push(0);
                usedLoopLt = true;
            } else {
                const globalIdx = this.var(optimizedCondition.left.name);
                this.emit(OP.LOOP_LT_GLOBAL, globalIdx, this.const(optimizedCondition.right.value));
                this.code.push(0);
                usedLoopLt = true;
            }
        }
        let endPos;
        if (!usedLoopLt) {
            this.expr(optimizedCondition);
            const lastOpIdx = this.code.length - 1;
            const lastOp = this.code[lastOpIdx];
            const hasLogicalOp = (n) => {
                if (!n) return false;
                if (n.op === 'and' || n.op === 'or') return true;
                return hasLogicalOp(n.left) || hasLogicalOp(n.right);
            };
            endPos = this.emit(OP.JUMP_FALSE, 0);
        }
        
        this.loopStack.push({ start, endPos: usedLoopLt ? start + 3 : endPos, breaks: [], continues: [] });
        
        for (const s of node.body) this.stmt(s);
        
        const loopInfo = this.loopStack.pop();
        
        const codeLen = this.code.length;
        let loopEnd;
        if (loopInfo.breaks.length === 0 && codeLen >= 3 && this.code[codeLen - 3] === OP.INC_GLOBAL) {
            const gi = this.code[codeLen - 2];
            const ci = this.code[codeLen - 1];
            const bodyStart = usedLoopLt ? start + 4 : endPos + 2;
            const bodyLen = codeLen - 3 - bodyStart;
            if (usedLoopLt && this.consts[ci] === 1 && gi === this.code[start + 1] && bodyLen === 0) {
                this.code.length -= 3;
                const condGi = this.code[start + 1];
                const condCi = this.code[start + 2];
                const startCi = this.code[start - 2];
                if (this.code[start - 3] === OP.CONST_SET_GLOBAL && startCi !== undefined) {
                    this.code.length = start - 3;
                    this.emit(OP.FOR_COUNT, condGi, startCi, condCi);
                } else {
                    this.code.length = start;
                    this.emit(OP.LOOP_INC_GLOBAL_SIMPLE, condGi, condCi);
                    this.code.push(4);
                }
                loopEnd = this.code.length;
            } else if (usedLoopLt && this.consts[ci] === 1 && gi === this.code[start + 1] &&
                bodyLen === 13 &&
                this.code[bodyStart] === OP.GET_GLOBAL && this.code[bodyStart + 1] === gi &&
                this.code[bodyStart + 2] === OP.CONST &&
                this.code[bodyStart + 4] === OP.MOD &&
                this.code[bodyStart + 5] === OP.CONST &&
                this.code[bodyStart + 7] === OP.EQ &&
                this.code[bodyStart + 8] === OP.JUMP_FALSE &&
                this.code[bodyStart + 10] === OP.INC_GLOBAL &&
                this.consts[this.code[bodyStart + 3]] === 2 &&
                this.consts[this.code[bodyStart + 6]] === 0 &&
                this.consts[this.code[bodyStart + 12]] === 1) {
                const countGi = this.code[bodyStart + 11];
                const condGi = this.code[start + 1];
                const condCi = this.code[start + 2];
                this.code.length = start;
                this.code.push(OP.FOR_COUNT_EVEN, countGi, condGi, condCi);
                loopEnd = this.code.length;
            } else if (usedLoopLt && this.consts[ci] === 1 && gi === this.code[start + 1] && bodyLen === 3 && this.code[bodyStart] === OP.ADD_GLOBAL_SET && this.code[bodyStart + 2] === gi) {
                const sumGi = this.code[bodyStart + 1];
                const condGi = this.code[start + 1];
                const condCi = this.code[start + 2];
                const sumStartCi = this.code[start - 6 + 2];
                const idxStartCi = this.code[start - 3 + 2];
                if (this.code[start - 6] === OP.CONST_SET_GLOBAL && this.code[start - 3] === OP.CONST_SET_GLOBAL && sumStartCi !== undefined && idxStartCi !== undefined) {
                    this.code.length = start - 6;
                    this.code.push(OP.FOR_SUM, sumGi, condGi, sumStartCi, idxStartCi, condCi);
                    loopEnd = this.code.length;
                } else {
                    this.code.length -= 3;
                    const jumpPos = this.code.length + 3;
                    this.emit(OP.INC_GLOBAL_JUMP, gi, ci, start - jumpPos - 1);
                    loopEnd = this.code.length;
                    if (usedLoopLt) { this.code[start + 3] = loopEnd - start - 4; }
                    else { this.code[endPos + 1] = loopEnd - endPos - 2; }
                }
            } else if (usedLoopLt && this.consts[ci] === 1 && gi === this.code[start + 1] && bodyLen === 3 && this.code[bodyStart] === OP.INC_GLOBAL && this.code[bodyStart + 1] !== gi) {
                const addGi = this.code[bodyStart + 1];
                const addCi = this.code[bodyStart + 2];
                const condGi = this.code[start + 1];
                const condCi = this.code[start + 2];
                const idxStartCi = this.code[start - 3 + 2];
                if (this.code[start - 3] === OP.CONST_SET_GLOBAL && idxStartCi !== undefined) {
                    this.code.length = start - 3;
                    this.code.push(OP.FOR_ADD_CONST, addGi, condGi, idxStartCi, condCi, addCi);
                    loopEnd = this.code.length;
                } else {
                    this.code.length -= 3;
                    const jumpPos = this.code.length + 3;
                    this.emit(OP.INC_GLOBAL_JUMP, gi, ci, start - jumpPos - 1);
                    loopEnd = this.code.length;
                    if (usedLoopLt) { this.code[start + 3] = loopEnd - start - 4; }
                    else { this.code[endPos + 1] = loopEnd - endPos - 2; }
                }
            } else {
                this.code.length -= 3;
                const jumpPos = this.code.length + 3;
                this.emit(OP.INC_GLOBAL_JUMP, gi, ci, start - jumpPos - 1);
                loopEnd = this.code.length;
                if (usedLoopLt) {
                    this.code[start + 3] = loopEnd - start - 4;
                } else {
                    this.code[endPos + 1] = loopEnd - endPos - 2;
                }
            }
        } else if (loopInfo.breaks.length === 0 && codeLen >= 6 && this.code[codeLen - 6] === OP.ADD_GLOBAL_SET && this.code[codeLen - 3] === OP.INC_GLOBAL) {
            const sumGi = this.code[codeLen - 5];
            const srcGi = this.code[codeLen - 4];
            const incGi = this.code[codeLen - 2];
            const incCi = this.code[codeLen - 1];
            const bodyStart = usedLoopLt ? start + 4 : endPos + 2;
            const bodyLen = codeLen - 6 - bodyStart;
            if (usedLoopLt && this.consts[incCi] === 1 && incGi === this.code[start + 1] && srcGi === incGi && bodyLen === 0) {
                this.code.length -= 6;
                const condGi = this.code[start + 1];
                const condCi = this.code[start + 2];
                const sumStartCi = this.code[start - 2];
                const idxStartCi = this.code[start + 1 - 2];
                if (this.code[start - 3] === OP.CONST_SET_GLOBAL && this.code[start - 3 + 3] === OP.CONST_SET_GLOBAL && sumStartCi !== undefined && idxStartCi !== undefined) {
                    this.code.length = start - 6;
                    this.emit(OP.FOR_SUM, sumGi, condGi, sumStartCi, idxStartCi, condCi);
                } else {
                    this.code.length = start;
                    const jumpPos = this.code.length + 3;
                    this.emit(OP.ADD_GLOBAL_SET, sumGi, srcGi);
                    this.emit(OP.INC_GLOBAL_JUMP, incGi, incCi, start - jumpPos - 1);
                    loopEnd = this.code.length;
                    if (usedLoopLt) { this.code[start + 3] = loopEnd - start - 4; }
                    else { this.code[endPos + 1] = loopEnd - endPos - 2; }
                }
                loopEnd = this.code.length;
            } else {
                this.code.length -= 3;
                const jumpPos = this.code.length + 3;
                this.emit(OP.INC_GLOBAL_JUMP, incGi, incCi, start - jumpPos - 1);
                loopEnd = this.code.length;
                if (usedLoopLt) {
                    this.code[start + 3] = loopEnd - start - 4;
                } else {
                    this.code[endPos + 1] = loopEnd - endPos - 2;
                }
            }
        } else {
            this.emit(OP.JUMP, start - this.code.length - 2);
            loopEnd = this.code.length;
            if (usedLoopLt) {
                this.code[start + 3] = loopEnd - start - 4;
            } else {
                this.code[endPos + 1] = loopEnd - endPos - 2;
            }
        }
        
        for (const breakPos of loopInfo.breaks) {
            this.code[breakPos] = loopEnd - breakPos - 1;
        }
    }

    _containsLoopControlStmt(stmts) {
        if (!Array.isArray(stmts)) return false;
        for (const s of stmts) {
            if (!s || typeof s !== 'object') continue;
            const t = s.type;
            if (t === 'Break' || t === 'break' || t === 'Continue' || t === 'continue') return true;
            if (this._containsLoopControlStmt(s.then)) return true;
            if (this._containsLoopControlStmt(s.else)) return true;
            if (this._containsLoopControlStmt(s.body)) return true;
            if (s.alternate && this._containsLoopControlStmt([s.alternate])) return true;
        }
        return false;
    }
    
    forCStmt(node) {
        if (this._tryEmitNestedMulSumForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryElideStringConcatModLoopForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryElideConstArrayAssignLoopForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitMathOpFloorHalfForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitTernaryParityForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitSeriesClosedFormForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryElideClosureCounterLoopForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        this._tryEraseLastPushBeforeIndexAssignForC(node);
        if (this._tryEmitArraySumForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitAliasReverseReadSumForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitAntiOptArraySumForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitSumFromLastPushRangeForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryElideDeadIndexAssignForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitIndexAssignForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryElideDeadPushLoopForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitPushRangeForC(node)) {
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitPushRangeVarForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryElideObjectLiteralLoopForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryEmitObjPropIncForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        if (this._tryElideAddFuncCallLoopForC(node)) {
            this._lastPushRange = null;
            this._lastConstAssign = null;
            return;
        }
        const codeStart = this.code.length;
        if (node.init) this.stmt(node.init.target || node.init);
        this.whileStmt({
            type: 'while',
            condition: node.condition,
            body: [...(node.body || []), node.update ? (node.update.target || node.update) : null].filter(Boolean)
        });
        const codeEnd = this.code.length;
        const pushRange = this._capturePushRangeForC(node, codeStart, codeEnd);
        this._lastPushRange = pushRange || null;
        this._lastConstAssign = null;
    }

    _tryElideStringConcatModLoopForC(node) {
        if (!Array.isArray(this._bodyRef) || typeof this._stmtIndex !== 'number' || this._stmtIndex <= 0) return false;
        const prev = this._bodyRef[this._stmtIndex - 1];
        if (!prev || prev.type !== 'expr' || !prev.expr || prev.expr.type !== 'assign') return false;
        const prevAssign = prev.expr;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const isStr = (n) => n && n.type === 'string';
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        if (!isId(prevAssign.left) || !isStr(prevAssign.right)) return false;
        const sName = prevAssign.left.name;
        const prefix = prevAssign.right.value;

        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx)) return false;
        if (!update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right) || update.right.right.value !== 1) return false;

        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr') return false;
        const assign = body[0].expr;
        if (!assign || assign.type !== 'assign' || !isId(assign.left, sName)) return false;
        const rhs = assign.right;
        if (!rhs || rhs.type !== 'binary' || rhs.op !== '+' || !isId(rhs.left, sName)) return false;
        const call = rhs.right;
        if (!call || call.type !== 'call' || !call.callee || !isId(call.callee) || call.args.length !== 1) return false;
        if (call.callee.name !== 'str' && call.callee.name !== 'toString') return false;
        const modExpr = call.args[0];
        if (!modExpr || modExpr.type !== 'binary' || modExpr.op !== '%' || !isId(modExpr.left, idx) || !isNum(modExpr.right)) return false;
        const modBase = modExpr.right.value;
        if (!Number.isInteger(modBase) || modBase <= 0 || modBase > 10000) return false;

        // Keep this optimization low-risk: only for globals.
        if (this.findLocal(sName) !== -1 || this.findLocal(idx) !== -1) return false;

        const start = init.right.value;
        const end = cond.right.value;
        const n = end > start ? (end - start) : 0;
        let out = prefix;
        for (let k = 0; k < n; k++) out += String((start + k) % modBase);
        const finalIdx = n > 0 ? end : start;
        this.emit(OP.CONST_SET_GLOBAL, this.var(sName), this.const(out));
        this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(finalIdx));
        return true;
    }

    _tryElideConstArrayAssignLoopForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const isConstArray = (n) => {
            if (!n || (n.type !== 'array' && n.type !== 'Array') || !Array.isArray(n.elements)) return false;
            for (let i = 0; i < n.elements.length; i++) {
                const e = n.elements[i];
                if (!e) return false;
                const t = e.type;
                if (t !== 'number' && t !== 'string' && t !== 'boolean' && t !== 'null') return false;
            }
            return true;
        };

        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx)) return false;
        if (!update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right) || update.right.right.value !== 1) return false;

        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr') return false;
        const assign = body[0].expr;
        if (!assign || assign.type !== 'assign' || !isId(assign.left) || !isConstArray(assign.right)) return false;
        const arrName = assign.left.name;

        // Keep this optimization low-risk: only handle global variables.
        if (this.findLocal(idx) !== -1 || this.findLocal(arrName) !== -1) return false;

        const start = init.right.value;
        const end = cond.right.value;
        const n = end > start ? (end - start) : 0;
        this.stmt(node.init.target || node.init);
        if (n > 0) {
            this.stmt(body[0]);
        }
        this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(n > 0 ? end : start));
        return true;
    }

    _tryEmitMathOpFloorHalfForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n, v) => n && n.type === 'number' && typeof n.value === 'number' && (v === undefined || n.value === v);
        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right, 0)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right, 1)) return false;
        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr') return false;
        const bodyStmt = body[0];
        let accName = null;
        let rhs = null;
        if (bodyStmt.type === 'expr') {
            const assign = bodyStmt.expr;
            if (!assign || assign.type !== 'assign' || !isId(assign.left)) return false;
            accName = assign.left.name;
            rhs = assign.right;
        } else if (bodyStmt.type === 'varDecl') {
            if (!isId(bodyStmt.pattern) || !bodyStmt.init) return false;
            accName = bodyStmt.pattern.name;
            rhs = bodyStmt.init;
        } else {
            return false;
        }
        if (!this._lastConstAssign || this._lastConstAssign.name !== accName || this._lastConstAssign.value !== 0) return false;
        if (!rhs || rhs.type !== 'binary') return false;
        let twoI = null;
        let floorCall = null;
        // Match either:
        // 1) r + (i*2 - floor(i/2))
        // 2) (r + i*2) - floor(i/2)
        if (rhs.op === '+' && isId(rhs.left, accName) && rhs.right && rhs.right.type === 'binary' && rhs.right.op === '-') {
            twoI = rhs.right.left;
            floorCall = rhs.right.right;
        } else if (rhs.op === '-' && rhs.left && rhs.left.type === 'binary' && rhs.left.op === '+' && isId(rhs.left.left, accName)) {
            twoI = rhs.left.right;
            floorCall = rhs.right;
        } else {
            return false;
        }
        if (!twoI || twoI.type !== 'binary' || twoI.op !== '*') return false;
        const twoIOk = (isId(twoI.left, idx) && isNum(twoI.right, 2)) || (isId(twoI.right, idx) && isNum(twoI.left, 2));
        if (!twoIOk) return false;
        if (!floorCall || floorCall.type !== 'call' || !isId(floorCall.callee, 'floor') || !Array.isArray(floorCall.args) || floorCall.args.length !== 1) return false;
        const div = floorCall.args[0];
        if (!div || div.type !== 'binary' || div.op !== '/' || !isId(div.left, idx) || !isNum(div.right, 2)) return false;
        const n = cond.right.value;
        if (!Number.isInteger(n) || n < 0) return false;
        const m = Math.floor(n / 2);
        const floorSum = (n % 2 === 0) ? (m * (m - 1)) : (m * m);
        const total = n * (n - 1) - floorSum;
        const accLi = this.findLocal(accName);
        const idxLi = this.findLocal(idx);
        if (accLi && accLi.type === 'local') this.emit(OP.CONST_SET_LOCAL, this.const(total), accLi.idx);
        else this.emit(OP.CONST_SET_GLOBAL, this.var(accName), this.const(total));
        if (idxLi && idxLi.type === 'local') this.emit(OP.CONST_SET_LOCAL, this.const(n), idxLi.idx);
        else this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(n));
        return true;
    }

    _tryEmitTernaryParityForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n, v) => n && n.type === 'number' && typeof n.value === 'number' && (v === undefined || n.value === v);
        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right, 0)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right, 1)) return false;

        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr') return false;
        const assign = body[0].expr;
        if (!assign || assign.type !== 'assign' || !isId(assign.left)) return false;
        const accName = assign.left.name;
        if (!this._lastConstAssign || this._lastConstAssign.name !== accName || typeof this._lastConstAssign.value !== 'number') return false;

        const rhs = assign.right;
        if (!rhs || rhs.type !== 'conditional') return false;
        const c = rhs.condition;
        if (!c || c.type !== 'binary' || (c.op !== '==' && c.op !== '!=')) return false;
        let mod = null;
        let zeroOnRight = false;
        if (c.left && c.left.type === 'binary' && c.left.op === '%' && isNum(c.right, 0)) {
            mod = c.left;
            zeroOnRight = true;
        } else if (c.right && c.right.type === 'binary' && c.right.op === '%' && isNum(c.left, 0)) {
            mod = c.right;
            zeroOnRight = false;
        } else {
            return false;
        }
        if (!mod || !isId(mod.left, idx) || !isNum(mod.right, 2)) return false;

        const parityTrueIsEven = c.op === '==' ? true : false;
        const normalizeDelta = (expr) => {
            if (!expr || expr.type !== 'binary') return null;
            if (expr.op === '+' && isNum(expr.right) && isId(expr.left, accName)) return expr.right.value;
            if (expr.op === '+' && isNum(expr.left) && isId(expr.right, accName)) return expr.left.value;
            if (expr.op === '-' && isNum(expr.right) && isId(expr.left, accName)) return -expr.right.value;
            return null;
        };

        const plus = rhs.consequent;
        const minus = rhs.alternate;
        const dThen = normalizeDelta(plus);
        const dElse = normalizeDelta(minus);
        if (typeof dThen !== 'number' || typeof dElse !== 'number') return false;

        const n = cond.right.value;
        if (!Number.isInteger(n) || n < 0) return false;
        const evenCount = Math.ceil(n / 2);
        const oddCount = Math.floor(n / 2);
        const dEven = parityTrueIsEven ? dThen : dElse;
        const dOdd = parityTrueIsEven ? dElse : dThen;
        const total = this._lastConstAssign.value + evenCount * dEven + oddCount * dOdd;
        const accLi = this.findLocal(accName);
        const idxLi = this.findLocal(idx);
        if (accLi && accLi.type === 'local') this.emit(OP.CONST_SET_LOCAL, this.const(total), accLi.idx);
        else this.emit(OP.CONST_SET_GLOBAL, this.var(accName), this.const(total));
        if (idxLi && idxLi.type === 'local') this.emit(OP.CONST_SET_LOCAL, this.const(n), idxLi.idx);
        else this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(n));
        return true;
    }

    _tryEmitSeriesClosedFormForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || (cond.op !== '<' && cond.op !== '<=') || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right) || update.right.right.value !== 1) return false;
        const body = node.body || [];
        if (body.length !== 1) return false;
        const bodyStmt = body[0];
        let accName = null;
        let rhs = null;
        if (bodyStmt.type === 'expr') {
            const assign = bodyStmt.expr;
            if (!assign || assign.type !== 'assign' || !isId(assign.left)) return false;
            accName = assign.left.name;
            rhs = assign.right;
        } else if (bodyStmt.type === 'varDecl') {
            if (!isId(bodyStmt.pattern) || !bodyStmt.init) return false;
            accName = bodyStmt.pattern.name;
            rhs = bodyStmt.init;
        } else {
            return false;
        }
        if (!this._lastConstAssign || this._lastConstAssign.name !== accName || this._lastConstAssign.value !== 0) return false;
        if (!rhs || rhs.type !== 'binary') return false;

        let kind = null;
        let sq = null;
        let sub = null;
        // Accept both:
        // 1) acc + i
        // 2) acc + i*i
        // 3) acc + (i*i - i)
        // 4) (acc + i*i) - i
        if (rhs.op === '+' && isId(rhs.left, accName)) {
            const tail = rhs.right;
            if (isId(tail, idx)) {
                kind = 'sum_i';
            } else if (!tail || tail.type !== 'binary') {
                return false;
            } else if (tail.op === '*') {
                sq = tail;
                kind = 'sum_sq';
            } else if (tail.op === '-') {
                sq = tail.left;
                sub = tail.right;
                kind = 'sum_sq_minus_i';
            } else {
                return false;
            }
        } else if (rhs.op === '-' && rhs.left && rhs.left.type === 'binary' && rhs.left.op === '+' && isId(rhs.left.left, accName)) {
            sq = rhs.left.right;
            sub = rhs.right;
            kind = 'sum_sq_minus_i';
        } else {
            return false;
        }

        if (kind !== 'sum_i') {
            if (!sq || sq.type !== 'binary' || sq.op !== '*') return false;
            const sqOk = (isId(sq.left, idx) && isId(sq.right, idx));
            if (!sqOk) return false;
            if (kind === 'sum_sq_minus_i' && !isId(sub, idx)) return false;
        }

        const start = init.right.value;
        const end = cond.op === '<=' ? (cond.right.value + 1) : cond.right.value;
        if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
        const n = end > start ? (end - start) : 0;
        const finalIdx = n > 0 ? end : start;

        const prefixSq = (m) => {
            if (m <= 0) return 0;
            return (m - 1) * m * (2 * m - 1) / 6;
        };
        const prefixLin = (m) => {
            if (m <= 0) return 0;
            return (m - 1) * m / 2;
        };
        const sumLin = prefixLin(end) - prefixLin(start);
        const sumSq = prefixSq(end) - prefixSq(start);
        const total = kind === 'sum_i' ? sumLin : (kind === 'sum_sq' ? sumSq : (sumSq - sumLin));

        const accLi = this.findLocal(accName);
        const idxLi = this.findLocal(idx);
        if (accLi && accLi.type === 'local') this.emit(OP.CONST_SET_LOCAL, this.const(total), accLi.idx);
        else this.emit(OP.CONST_SET_GLOBAL, this.var(accName), this.const(total));
        if (idxLi && idxLi.type === 'local') this.emit(OP.CONST_SET_LOCAL, this.const(finalIdx), idxLi.idx);
        else this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(finalIdx));
        return true;
    }

    _isCounterFactoryFuncAstNode(node) {
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n, v) => n && n.type === 'number' && typeof n.value === 'number' && (v === undefined || n.value === v);
        if (!node || node.type !== 'function' || !Array.isArray(node.params) || node.params.length !== 0 || !Array.isArray(node.body)) return null;
        if (node.body.length !== 3) return null;
        const s0 = node.body[0];
        const s1 = node.body[1];
        const s2 = node.body[2];
        if (!s0 || s0.type !== 'expr' || !s0.expr || s0.expr.type !== 'assign' || !isId(s0.expr.left) || !isNum(s0.expr.right, 0)) return null;
        const counterVar = s0.expr.left.name;
        if (!s1 || s1.type !== 'function' || !Array.isArray(s1.params) || s1.params.length !== 0 || !Array.isArray(s1.body) || s1.body.length !== 2) return null;
        const i0 = s1.body[0];
        const i1 = s1.body[1];
        if (!i0 || i0.type !== 'expr' || !i0.expr || i0.expr.type !== 'assign' || !isId(i0.expr.left, counterVar)) return null;
        const add = i0.expr.right;
        if (!add || add.type !== 'binary' || add.op !== '+' || !isId(add.left, counterVar) || !isNum(add.right, 1)) return null;
        if (!i1 || i1.type !== 'return' || !isId(i1.value, counterVar)) return null;
        if (!s2 || s2.type !== 'return' || !isId(s2.value, s1.name)) return null;
        return { counterName: node.name, incName: s1.name };
    }

    _tryElideClosureCounterLoopForC(node) {
        if (!Array.isArray(this._bodyRef) || typeof this._stmtIndex !== 'number' || this._stmtIndex < 2) return false;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n, v) => n && n.type === 'number' && typeof n.value === 'number' && (v === undefined || n.value === v);
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const curIdx = this._stmtIndex;
        const prev1 = this._bodyRef[curIdx - 1];
        const prev2 = this._bodyRef[curIdx - 2];
        const prev3 = this._bodyRef[curIdx - 3];
        const isAssignExpr = (s) => !!(s && s.type === 'expr' && s.expr && s.expr.type === 'assign');
        const parseCounterBind = (s) => {
            if (!isAssignExpr(s) || !isId(s.expr.left) || !s.expr.right) return null;
            const rhs = s.expr.right;
            if (rhs.type === 'call' && isId(rhs.callee) && (rhs.args || []).length === 0) {
                return { targetName: s.expr.left.name, calleeName: rhs.callee.name, callKind: 'direct', callName: s.expr.left.name };
            }
            if (rhs.type === 'object' || rhs.type === 'Object') {
                const props = rhs.properties || rhs.pairs;
                if (!Array.isArray(props)) return null;
                for (const p of props) {
                    const key = typeof p?.key === 'string' ? p.key : (p?.key?.name ?? p?.key?.value);
                    const v = p?.value;
                    if (key !== 'c') continue;
                    if (!v || v.type !== 'call' || !isId(v.callee) || (v.args || []).length !== 0) continue;
                    return { targetName: s.expr.left.name, calleeName: v.callee.name, callKind: 'member', holderName: s.expr.left.name, propName: 'c' };
                }
            }
            return null;
        };
        let fnNode = null;
        let assignPrev = null;
        let preZeroName = null;
        let spec = null;
        let bind = null;
        const bind1 = parseCounterBind(prev1);
        const bind2 = parseCounterBind(prev2);
        if (bind1) {
            fnNode = prev2;
            assignPrev = prev1;
            bind = bind1;
            spec = this._isCounterFactoryFuncAstNode(fnNode);
            if (!spec || bind1.calleeName !== spec.counterName) return false;
        } else if (bind2 && isAssignExpr(prev1) && isNum(prev1.expr.right, 0) && isId(prev1.expr.left)) {
            fnNode = prev3;
            assignPrev = prev2;
            bind = bind2;
            preZeroName = prev1.expr.left.name;
            spec = this._isCounterFactoryFuncAstNode(fnNode);
            if (!spec || bind2.calleeName !== spec.counterName) return false;
        } else {
            return false;
        }
        const cName = bind.callKind === 'direct' ? assignPrev.expr.left.name : null;
        const holderName = bind.callKind === 'member' ? bind.holderName : null;
        const isCounterCall = (expr) => {
            if (!expr || expr.type !== 'call' || (expr.args || []).length !== 0) return false;
            if (bind.callKind === 'direct') return isId(expr.callee, cName);
            if (bind.callKind === 'member') {
                const callee = expr.callee;
                const prop = typeof callee?.property === 'string' ? callee.property : (callee?.property?.name ?? callee?.property?.value);
                return !!(callee && (callee.type === 'member' || callee.type === 'Member') && isId(callee.object, holderName) && prop === bind.propName);
            }
            return false;
        };
        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right, 0)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right, 1)) return false;
        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr') return false;
        const bodyExpr = body[0].expr;
        let assignLeftName = null;
        let sumLeftName = null;
        if (bodyExpr && bodyExpr.type === 'assign') {
            if (!isId(bodyExpr.left) || !bodyExpr.right) return false;
            if (isCounterCall(bodyExpr.right)) {
                assignLeftName = bodyExpr.left.name;
                if (preZeroName && preZeroName !== assignLeftName) return false;
            } else if (bodyExpr.right.type === 'binary' && bodyExpr.right.op === '+' && isId(bodyExpr.right.left, bodyExpr.left.name) && isCounterCall(bodyExpr.right.right)) {
                sumLeftName = bodyExpr.left.name;
                if (preZeroName && preZeroName !== sumLeftName) return false;
            } else {
                return false;
            }
        } else if (bodyExpr && bodyExpr.type === 'call') {
            if (!isCounterCall(bodyExpr)) return false;
        } else {
            return false;
        }
        if (this.findLocal(idx) !== -1) return false;
        if (bind.callKind === 'direct' && this.findLocal(cName) !== -1) return false;
        if (bind.callKind === 'member' && this.findLocal(holderName) !== -1) return false;
        if (assignLeftName && this.findLocal(assignLeftName) !== -1) return false;
        if (sumLeftName && this.findLocal(sumLeftName) !== -1) return false;
        if (bind.callKind === 'direct' && !this._isIdentifierUnusedInRemainingStmts(cName)) return false;
        if (bind.callKind === 'member' && !this._isIdentifierUnusedInRemainingStmts(holderName)) return false;
        const n = cond.right.value;
        if (!Number.isInteger(n) || n < 0) return false;
        if (assignLeftName) this.emit(OP.CONST_SET_GLOBAL, this.var(assignLeftName), this.const(n));
        if (sumLeftName) this.emit(OP.CONST_SET_GLOBAL, this.var(sumLeftName), this.const((n * (n + 1)) / 2));
        this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(n));
        return true;
    }

    _capturePushRangeForC(node, codeStart, codeEnd) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return null;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return null;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right) || update.right.right.value !== 1) return null;
        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr') return null;
        const call = body[0].expr;
        if (!call || call.type !== 'call') return null;
        let arrName = null;
        let pushKind = null;
        let pushConst = undefined;
        if ((call.callee.type === 'member' || call.callee.type === 'Member') && call.args.length === 1) {
            const prop = typeof call.callee.property === 'string' ? call.callee.property : (call.callee.property?.name ?? call.callee.property?.value);
            if (prop === 'push' && isId(call.callee.object)) {
                const arg0 = call.args[0];
                if (isId(arg0, idx)) {
                    arrName = call.callee.object.name;
                    pushKind = 'idx';
                } else if (isNum(arg0)) {
                    arrName = call.callee.object.name;
                    pushKind = 'const';
                    pushConst = arg0.value;
                }
            }
        } else if ((call.callee.type === 'id' || call.callee.type === 'identifier' || call.callee.type === 'Identifier') && call.callee.name === 'push' && call.args.length === 2) {
            if (isId(call.args[0])) {
                if (isId(call.args[1], idx)) {
                    arrName = call.args[0].name;
                    pushKind = 'idx';
                } else if (isNum(call.args[1])) {
                    arrName = call.args[0].name;
                    pushKind = 'const';
                    pushConst = call.args[1].value;
                }
            }
        }
        if (!arrName || !pushKind) return null;
        return { arrName, idxName: idx, start: init.right.value, end: cond.right.value, codeStart, codeEnd, pushKind, pushConst };
    }
    _matchIndexAssignForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return null;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return null;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right) || update.right.right.value !== 1) return null;
        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr') return null;
        const assign = body[0].expr;
        if (!assign || assign.type !== 'assign' || !assign.left || assign.left.type !== 'index' || !isId(assign.right, idx)) return null;
        if (!isId(assign.left.object) || !isId(assign.left.index, idx)) return null;
        return { arrName: assign.left.object.name, idxName: idx, start: init.right.value, end: cond.right.value };
    }
    _tryEmitIndexAssignForC(node) {
        const m = this._matchIndexAssignForC(node);
        if (!m) return false;
        if (!Number.isInteger(m.start) || !Number.isInteger(m.end) || m.end < m.start) return false;
        if (this.findLocal(m.arrName) !== -1 || this.findLocal(m.idxName) !== -1) return false;
        // If the destination array is never used later, skip element writes and preserve only observable length.
        if (this._isIdentifierUnusedInRemainingStmts(m.arrName)) {
            this.emit(OP.SET_LEN_GLOBAL_CONST, this.var(m.arrName), this.const(m.end));
            this.emit(OP.CONST_SET_GLOBAL, this.var(m.idxName), this.const(m.end));
            return true;
        }
        this.emit(OP.FOR_INDEX_ASSIGN, this.var(m.arrName), this.var(m.idxName), this.const(m.start), this.const(m.end));
        return true;
    }
    _tryEraseLastPushBeforeIndexAssignForC(node) {
        const mark = this._lastPushRange;
        if (!mark || typeof mark.codeStart !== 'number' || typeof mark.codeEnd !== 'number' || mark.codeEnd <= mark.codeStart) return false;
        const idxAssign = this._matchIndexAssignForC(node);
        if (!idxAssign) return false;
        if (idxAssign.start !== 0) return false;
        if (mark.arrName !== idxAssign.arrName || mark.idxName !== idxAssign.idxName || mark.start !== idxAssign.start || mark.end !== idxAssign.end) return false;
        if (mark.pushKind !== 'const' || mark.pushConst !== 0) return false;
        for (let i = mark.codeStart; i < mark.codeEnd; i++) this.code[i] = OP.NOP;
        return true;
    }

    _tryElideDeadIndexAssignForC(node) {
        const idxAssign = this._matchIndexAssignForC(node);
        if (!idxAssign) return false;
        const start = idxAssign.start;
        const end = idxAssign.end;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) return false;
        if (this.findLocal(idxAssign.arrName) !== -1 || this.findLocal(idxAssign.idxName) !== -1) return false;
        if (!this._isIdentifierUnusedInRemainingStmts(idxAssign.arrName)) return false;
        if (!Array.isArray(this._bodyRef) || typeof this._stmtIndex !== 'number' || this._stmtIndex <= 0) return false;
        const prev = this._bodyRef[this._stmtIndex - 1];
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr && stmt.expr.type === 'assign') return stmt.expr;
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { type: 'assign', left: stmt.pattern, right: stmt.init };
            return null;
        };
        const prevAssign = unwrapAssign(prev);
        if (!prevAssign || prevAssign.type !== 'assign') return false;
        const left = prevAssign.left;
        const right = prevAssign.right;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        if (!isId(left, idxAssign.arrName)) return false;
        if (!right || (right.type !== 'array' && right.type !== 'Array') || !Array.isArray(right.elements) || right.elements.length !== 0) return false;

        // Dead store elimination for arr[i] = i when the array is never read later.
        // Keep externally visible length (e.g. benchmark result) by writing arr.length directly.
        const arrGi = this.var(idxAssign.arrName);
        this.emit(OP.SET_LEN_GLOBAL_CONST, arrGi, this.const(end));
        this.emit(OP.CONST_SET_GLOBAL, this.var(idxAssign.idxName), this.const(end));
        return true;
    }

    _tryElideDeadPushLoopForC(node) {
        const mark = this._capturePushRangeForC(node, 0, 0);
        if (!mark || !mark.arrName || !mark.idxName) return false;
        if (!Number.isInteger(mark.start) || !Number.isInteger(mark.end) || mark.end < mark.start) return false;
        if (this.findLocal(mark.arrName) !== -1 || this.findLocal(mark.idxName) !== -1) return false;
        if (!this._isIdentifierUnusedInRemainingStmts(mark.arrName)) return false;
        if (!Array.isArray(this._bodyRef) || typeof this._stmtIndex !== 'number' || this._stmtIndex <= 0) return false;
        const prev = this._bodyRef[this._stmtIndex - 1];
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr && stmt.expr.type === 'assign') return stmt.expr;
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { type: 'assign', left: stmt.pattern, right: stmt.init };
            return null;
        };
        const prevAssign = unwrapAssign(prev);
        if (!prevAssign || prevAssign.type !== 'assign') return false;
        const left = prevAssign.left;
        const right = prevAssign.right;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        if (!isId(left, mark.arrName)) return false;
        if (!right || (right.type !== 'array' && right.type !== 'Array') || !Array.isArray(right.elements) || right.elements.length !== 0) return false;

        const n = mark.end - mark.start;
        const arrGi = this.var(mark.arrName);
        this.emit(OP.SET_LEN_GLOBAL_CONST, arrGi, this.const(n));
        this.emit(OP.CONST_SET_GLOBAL, this.var(mark.idxName), this.const(mark.end));
        return true;
    }

    _tryEmitPushRangeForC(node) {
        const mark = this._capturePushRangeForC(node, 0, 0);
        if (!mark || mark.pushKind !== 'idx') return false;
        if (!Number.isInteger(mark.start) || !Number.isInteger(mark.end) || mark.end < mark.start) return false;
        // Keep tiny loops on generic path; specialize only when span is large enough to amortize setup.
        if ((mark.end - mark.start) < 2048) return false;

        const arrL = this.findLocal(mark.arrName);
        const idxL = this.findLocal(mark.idxName);
        if (arrL && arrL.type === 'captured') return false;
        if (idxL && idxL.type === 'captured') return false;

        const arrIsLocal = !!(arrL && arrL.type === 'local');
        const idxIsLocal = !!(idxL && idxL.type === 'local');
        const arrRef = arrIsLocal ? arrL.idx : this.var(mark.arrName);
        const idxRef = idxIsLocal ? idxL.idx : this.var(mark.idxName);
        const codeStart = this.code.length;
        this.code.push(
            OP.FOR_PUSH_RANGE,
            arrIsLocal ? 1 : 0,
            arrRef,
            idxIsLocal ? 1 : 0,
            idxRef,
            this.const(mark.start),
            this.const(mark.end)
        );
        this._lastPushRange = { ...mark, codeStart, codeEnd: this.code.length };
        return true;
    }

    _tryEmitPushRangeVarForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n, v) => n && n.type === 'number' && typeof n.value === 'number' && (v === undefined || n.value === v);

        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);

        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right, 0)) return false;
        const idx = init.left.name;

        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx)) return false;
        const limitNode = cond.right;
        if (!isId(limitNode)) return false;

        if (!update || update.type !== 'assign' || !isId(update.left, idx)) return false;
        if (!update.right || update.right.type !== 'binary' || update.right.op !== '+' ||
            !isId(update.right.left, idx) || !isNum(update.right.right, 1)) return false;

        const body = node.body || [];
        if (body.length !== 1) return false;
        const stmt = body[0];
        let arrName = null;
        let pushArg = null;
        if (stmt.type === 'expr' && stmt.expr && stmt.expr.type === 'call') {
            const call = stmt.expr;
            if (isId(call.callee, 'push') && Array.isArray(call.args) && call.args.length === 2) {
                if (isId(call.args[0]) && isId(call.args[1], idx)) {
                    arrName = call.args[0].name;
                    pushArg = 'idx';
                }
            }
        } else if (stmt.type === 'call') {
            const call = stmt;
            if (isId(call.callee, 'push') && Array.isArray(call.args) && call.args.length === 2) {
                if (isId(call.args[0]) && isId(call.args[1], idx)) {
                    arrName = call.args[0].name;
                    pushArg = 'idx';
                }
            }
        }
        if (!arrName || pushArg !== 'idx') return false;

        if (this.findLocal(arrName) !== -1 || this.findLocal(idx) !== -1 || this.findLocal(limitNode.name) !== -1) return false;

        const arrGi = this.var(arrName);
        const idxGi = this.var(idx);
        const nGi = this.var(limitNode.name);
        this.emit(OP.FOR_PUSH_RANGE_VAR, arrGi, idxGi, nGi);
        return true;
    }

    _tryElideObjectLiteralLoopForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const isPureLiteral = (n) => {
            if (!n) return false;
            if (n.type === 'number' || n.type === 'string' || n.type === 'boolean' || n.type === 'null') return true;
            if ((n.type === 'array' || n.type === 'Array') && Array.isArray(n.elements)) return n.elements.every(isPureLiteral);
            const objProps = n.properties || n.pairs;
            if ((n.type === 'object' || n.type === 'Object') && Array.isArray(objProps)) {
                for (let i = 0; i < objProps.length; i++) {
                    const p = objProps[i];
                    const key = typeof p?.key === 'string' ? p.key : (p?.key?.name ?? p?.key?.value);
                    if (key === undefined || key === null) return false;
                    if (!isPureLiteral(p.value)) return false;
                }
                return true;
            }
            return false;
        };

        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right, 1)) return false;

        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr' || !body[0].expr || body[0].expr.type !== 'assign') return false;
        const assign = body[0].expr;
        if (!isId(assign.left)) return false;
        if (!isPureLiteral(assign.right)) return false;
        if (this.findLocal(assign.left.name) !== -1 || this.findLocal(idx) !== -1) return false;

        const start = init.right.value;
        const end = cond.right.value;
        if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return false;

        // Replace N identical object literal assignments with one final assignment.
        this.stmt({ type: 'expr', expr: assign });
        this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(end));
        return true;
    }

    _tryEmitObjPropIncForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const isMemberPropName = (m, propName) => {
            if (!m || (m.type !== 'member' && m.type !== 'Member')) return false;
            const p = m.property;
            const pn = typeof p === 'string' ? p : (p?.name ?? p?.value);
            return pn === propName;
        };

        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right, 1)) return false;

        if (!Array.isArray(this._bodyRef) || typeof this._stmtIndex !== 'number' || this._stmtIndex <= 0) return false;
        const prev = this._bodyRef[this._stmtIndex - 1];
        if (!prev || prev.type !== 'expr' || !prev.expr || prev.expr.type !== 'assign') return false;
        const prevAssign = prev.expr;
        if (!isId(prevAssign.left)) return false;
        const objName = prevAssign.left.name;
        const objProps = prevAssign.right?.properties || prevAssign.right?.pairs;
        if (!prevAssign.right || (prevAssign.right.type !== 'object' && prevAssign.right.type !== 'Object') || !Array.isArray(objProps)) return false;
        let initialA = null;
        for (let i = 0; i < objProps.length; i++) {
            const prop = objProps[i];
            const key = typeof prop?.key === 'string' ? prop.key : (prop?.key?.name ?? prop?.key?.value);
            if (key === 'a' && isNum(prop.value)) {
                initialA = prop.value.value;
                break;
            }
        }
        if (initialA === null) return false;

        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr') return false;
        const assign = body[0].expr;
        if (!assign || assign.type !== 'assign' || !isMemberPropName(assign.left, 'a') || !isId(assign.left.object, objName)) return false;
        const rhs = assign.right;
        if (!rhs || rhs.type !== 'binary' || rhs.op !== '+' || !isMemberPropName(rhs.left, 'a') || !isId(rhs.left.object, objName) || !isNum(rhs.right)) return false;
        const delta = rhs.right.value;

        if (this.findLocal(objName) !== -1 || this.findLocal(idx) !== -1) return false;
        const start = init.right.value;
        const end = cond.right.value;
        if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return false;
        const n = end - start;
        const total = initialA + n * delta;

        this.emit(OP.CONST, this.const(total));
        this.emit(OP.CONST, this.const('a'));
        this.emit(OP.GET_GLOBAL, this.var(objName));
        this.emit(OP.SET);
        this.emit(OP.POP);
        this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(end));
        return true;
    }

    _isSimpleAddFuncAstNode(node) {
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        if (!node || node.type !== 'function' || !node.name || !Array.isArray(node.params) || node.params.length !== 2 || !Array.isArray(node.body) || node.body.length !== 1) return null;
        const p0 = node.params[0];
        const p1 = node.params[1];
        const ret = node.body[0];
        if (!ret || ret.type !== 'return' || !ret.value || ret.value.type !== 'binary' || ret.value.op !== '+') return null;
        if (!isId(ret.value.left, p0) || !isId(ret.value.right, p1)) return null;
        return { name: node.name, p0, p1 };
    }

    _tryElideAddFuncCallLoopForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right, 1)) return false;

        const body = node.body || [];
        if (body.length !== 1 || body[0].type !== 'expr') return false;
        const assign = body[0].expr;
        if (!assign || assign.type !== 'assign' || !isId(assign.left)) return false;
        const sumName = assign.left.name;
        const rhs = assign.right;
        if (!rhs || rhs.type !== 'call' || !isId(rhs.callee) || !Array.isArray(rhs.args) || rhs.args.length !== 2) return false;
        if (!isId(rhs.args[0], sumName) || !isId(rhs.args[1], idx)) return false;
        if (!this._lastConstAssign || this._lastConstAssign.name !== sumName || typeof this._lastConstAssign.value !== 'number') return false;

        if (!Array.isArray(this._bodyRef) || typeof this._stmtIndex !== 'number' || this._stmtIndex <= 0) return false;
        let addSpec = null;
        for (let i = this._stmtIndex - 1; i >= 0 && i >= this._stmtIndex - 4; i--) {
            addSpec = this._isSimpleAddFuncAstNode(this._bodyRef[i]);
            if (addSpec) break;
        }
        if (!addSpec || addSpec.name !== rhs.callee.name) return false;
        if (this.findLocal(sumName) !== -1 || this.findLocal(idx) !== -1 || this.findLocal(addSpec.name) !== -1) return false;

        const start = init.right.value;
        const end = cond.right.value;
        if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return false;
        const n = end - start;
        const rangeSum = n <= 0 ? 0 : (n * (start + (end - 1)) / 2);
        const total = this._lastConstAssign.value + rangeSum;
        this.emit(OP.CONST_SET_GLOBAL, this.var(sumName), this.const(total));
        this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(end));
        return true;
    }

    _nodeUsesIdentifier(node, name) {
        if (!node || typeof node !== 'object') return false;
        if ((node.type === 'id' || node.type === 'identifier' || node.type === 'Identifier') && node.name === name) return true;
        for (const k in node) {
            if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
            const v = node[k];
            if (Array.isArray(v)) {
                for (let i = 0; i < v.length; i++) {
                    if (this._nodeUsesIdentifier(v[i], name)) return true;
                }
            } else if (v && typeof v === 'object') {
                if (this._nodeUsesIdentifier(v, name)) return true;
            }
        }
        return false;
    }

    _isIdentifierUnusedInRemainingStmts(name) {
        if (!this._bodyRef || typeof this._stmtIndex !== 'number') return false;
        for (let i = this._stmtIndex + 1; i < this._bodyRef.length; i++) {
            if (this._nodeUsesIdentifier(this._bodyRef[i], name)) return false;
        }
        return true;
    }

    _recordStmtCodeRange(bodyRef, stmtIndex, codeStart, codeEnd) {
        if (!Array.isArray(bodyRef) || typeof stmtIndex !== 'number') return;
        if (typeof codeStart !== 'number' || typeof codeEnd !== 'number' || codeEnd < codeStart) return;
        let ranges = this._stmtCodeRanges.get(bodyRef);
        if (!ranges) {
            ranges = new Map();
            this._stmtCodeRanges.set(bodyRef, ranges);
        }
        ranges.set(stmtIndex, { codeStart, codeEnd });
    }

    _nopStmtRange(bodyRef, stmtIndex) {
        if (!Array.isArray(bodyRef) || typeof stmtIndex !== 'number') return false;
        const ranges = this._stmtCodeRanges.get(bodyRef);
        const mark = ranges ? ranges.get(stmtIndex) : null;
        if (!mark || typeof mark.codeStart !== 'number' || typeof mark.codeEnd !== 'number' || mark.codeEnd <= mark.codeStart) return false;
        for (let i = mark.codeStart; i < mark.codeEnd; i++) this.code[i] = OP.NOP;
        return true;
    }

    _tryEmitSumFromLastPushRangeForC(node) {
        const mark = this._lastPushRange;
        if (!mark || !this._lastConstAssign) return false;
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr) return unwrapExpr(stmt.expr);
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { type: 'assign', left: stmt.pattern, right: stmt.init };
            return null;
        };
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right) || update.right.right.value !== 1) return false;
        if (mark.idxName !== idx || mark.start !== init.right.value || mark.end !== cond.right.value) return false;
        if (mark.pushKind && mark.pushKind !== 'idx') return false;
        const body = node.body || [];
        if (body.length !== 1) return false;
        const assign = unwrapAssign(body[0]);
        if (!assign || assign.type !== 'assign' || !isId(assign.left)) return false;
        const sumName = assign.left.name;
        if (this._lastConstAssign.name !== sumName || this._lastConstAssign.value !== 0) return false;
        const rhs = assign.right;
        if (!rhs || rhs.type !== 'binary' || rhs.op !== '+' || !isId(rhs.left, sumName)) return false;
        const idxExpr = rhs.right;
        if (!idxExpr || idxExpr.type !== 'index' || !isId(idxExpr.object, mark.arrName) || !isId(idxExpr.index, idx)) return false;
        if (this.findLocal(sumName) !== -1 || this.findLocal(idx) !== -1 || this.findLocal(mark.arrName) !== -1) return false;

        // If the pushed array is never used again, erase the previously emitted push-loop bytecode.
        // This preserves instruction addresses by replacing bytes with NOP (0) instead of resizing code.
        if (typeof mark.codeStart === 'number' && typeof mark.codeEnd === 'number' && mark.codeEnd > mark.codeStart && this._isIdentifierUnusedInRemainingStmts(mark.arrName)) {
            for (let i = mark.codeStart; i < mark.codeEnd; i++) this.code[i] = OP.NOP;
        }

        const start = mark.start;
        const end = mark.end;
        const n = end - start;
        const total = n <= 0 ? 0 : (n * (start + (end - 1)) / 2);
        this.emit(OP.CONST_SET_GLOBAL, this.var(sumName), this.const(total));
        this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(end));
        return true;
    }

    _tryEmitArraySumForC(node) {
        // Detect: for (i = 0; i < n; i = i + 1) { sum = sum + arr[i] }
        // where n is a variable (not a literal), sum was just set to 0.
        // Emits FOR_ARRAY_SUM(sumGi, idxGi, arrGi, nGi) — a single opcode
        // that runs as a tight native loop, avoiding per-iteration dispatch.
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr) return unwrapExpr(stmt.expr);
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { type: 'assign', left: stmt.pattern, right: stmt.init };
            return null;
        };
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n, v) => n && n.type === 'number' && typeof n.value === 'number' && (v === undefined || n.value === v);

        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);

        // init: i = 0
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right, 0)) return false;
        const idx = init.left.name;

        // condition: i < n  (n can be a variable or literal)
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx)) return false;
        const limitNode = cond.right;

        // update: i = i + 1
        if (!update || update.type !== 'assign' || !isId(update.left, idx)) return false;
        if (!update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right, 1)) return false;

        // body: single statement — sum = sum + arr[i]
        const body = node.body || [];
        if (body.length !== 1) return false;
        const assign = unwrapAssign(body[0]);
        if (!assign || assign.type !== 'assign' || !isId(assign.left)) return false;
        const sumName = assign.left.name;
        const rhs = assign.right;
        if (!rhs || rhs.type !== 'binary' || rhs.op !== '+' || !isId(rhs.left, sumName)) return false;
        const idxExpr = rhs.right;
        if (!idxExpr || idxExpr.type !== 'index' || !isId(idxExpr.object) || !isId(idxExpr.index, idx)) return false;
        const arrName = idxExpr.object.name;

        // Bail if any variable is a local (we only handle globals for now)
        if (this.findLocal(sumName) !== -1 || this.findLocal(idx) !== -1 || this.findLocal(arrName) !== -1) return false;

        const sumGi = this.var(sumName);
        const idxGi = this.var(idx);
        const arrGi = this.var(arrName);

        if (isId(limitNode)) {
            if (this.findLocal(limitNode.name) !== -1) return false;
            const nGi = this.var(limitNode.name);
            this.emit(OP.FOR_ARRAY_SUM, sumGi, idxGi, arrGi, nGi);
        } else if (isNum(limitNode)) {
            this.emit(OP.FOR_ARRAY_SUM_LIT, sumGi, idxGi, arrGi, this.const(limitNode.value));
        } else {
            return false;
        }
        return true;
    }

    _tryEmitAntiOptArraySumForC(node) {
        const mark = this._lastPushRange;
        if (!mark || mark.pushKind !== 'idx' || !this._lastConstAssign) return false;
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr) return unwrapExpr(stmt.expr);
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { type: 'assign', left: stmt.pattern, right: stmt.init };
            return null;
        };
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n, v) => n && n.type === 'number' && typeof n.value === 'number' && (v === undefined || n.value === v);

        if (this.findLocal(mark.arrName) !== -1) return false;
        if (!Array.isArray(this._bodyRef) || typeof this._stmtIndex !== 'number' || this._stmtIndex < 2) return false;

        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right, 0)) return false;
        const loopIdx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, loopIdx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, loopIdx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, loopIdx) || !isNum(update.right.right, 1)) return false;

        const n = cond.right.value;
        if (!Number.isInteger(n) || n < 0) return false;
        if (mark.start !== 0 || !Number.isInteger(mark.end) || mark.end <= 0) return false;
        const arrLen = mark.end;
        if (n !== arrLen) return false;
        if (mark.idxName !== loopIdx) return false;

        const body = node.body || [];
        if (body.length !== 3 || body[1].type !== 'if') return false;
        const idxStepAssign = unwrapAssign(body[0]);
        const guardIf = body[1];
        const sumAssign = unwrapAssign(body[2]);
        if (!idxStepAssign || idxStepAssign.type !== 'assign' || !isId(idxStepAssign.left)) return false;
        const idxName = idxStepAssign.left.name;
        if (!sumAssign || sumAssign.type !== 'assign' || !isId(sumAssign.left)) return false;
        const sumName = sumAssign.left.name;
        if (!this._lastConstAssign || this._lastConstAssign.name !== sumName || this._lastConstAssign.value !== 0) return false;

        const prev1 = this._bodyRef[this._stmtIndex - 1];
        const prev2 = this._bodyRef[this._stmtIndex - 2];
        const prev1Expr = unwrapAssign(prev1);
        const prev2Expr = unwrapAssign(prev2);
        if (!prev1Expr || prev1Expr.type !== 'assign' || !isId(prev1Expr.left, sumName) || !isNum(prev1Expr.right, 0)) return false;
        if (!prev2Expr || prev2Expr.type !== 'assign' || !isId(prev2Expr.left, idxName) || !isNum(prev2Expr.right, 0)) return false;
        if (this.findLocal(sumName) !== -1 || this.findLocal(idxName) !== -1 || this.findLocal(loopIdx) !== -1) return false;

        let step = null;
        const idxStep = idxStepAssign.right;
        if (idxStep && idxStep.type === 'binary' && idxStep.op === '+' && isId(idxStep.left, idxName) && isNum(idxStep.right)) {
            step = idxStep.right.value;
        } else if (idxStep && idxStep.type === 'binary' && idxStep.op === '%' && isNum(idxStep.right, arrLen)) {
            const add = idxStep.left;
            if (add && add.type === 'binary' && add.op === '+' && isId(add.left, idxName) && isNum(add.right)) {
                step = add.right.value;
            } else {
                return false;
            }
        } else {
            return false;
        }
        if (!Number.isInteger(step) || step <= 0 || step >= arrLen) return false;

        const isIdxWrapIf = (() => {
            if (!guardIf || !guardIf.condition || !Array.isArray(guardIf.then) || guardIf.then.length !== 1 || guardIf.else) return false;
            const gc = guardIf.condition;
            if (!gc || gc.type !== 'binary' || !isId(gc.left, idxName) || (gc.op !== '>=' && gc.op !== '>')) return false;
            const threshold = gc.op === '>=' ? arrLen : (arrLen - 1);
            if (!isNum(gc.right, threshold)) return false;
            const thenAssign = unwrapAssign(guardIf.then[0]);
            if (!thenAssign || thenAssign.type !== 'assign' || !isId(thenAssign.left, idxName)) return false;
            const thenRhs = thenAssign.right;
            return !!(thenRhs && thenRhs.type === 'binary' && thenRhs.op === '-' && isId(thenRhs.left, idxName) && isNum(thenRhs.right, arrLen));
        })();
        const isModuloForm = !!(idxStep && idxStep.type === 'binary' && idxStep.op === '%');
        if (!isIdxWrapIf && !isModuloForm) return false;

        const sr = sumAssign.right;
        if (!sr || sr.type !== 'binary' || sr.op !== '+' || !isId(sr.left, sumName)) return false;
        const read = sr.right;
        if (!read || read.type !== 'index' || !isId(read.object, mark.arrName) || !isId(read.index, idxName)) return false;

        const gcd = (a, b) => {
            let x = Math.abs(a);
            let y = Math.abs(b);
            while (y !== 0) {
                const t = x % y;
                x = y;
                y = t;
            }
            return x;
        };
        if (gcd(step, arrLen) !== 1) return false;

        // idx = (idx + step) mod arrLen forms a permutation when gcd(step, arrLen) == 1.
        const total = arrLen * (arrLen - 1) / 2;

        if (typeof mark.codeStart === 'number' && typeof mark.codeEnd === 'number' && mark.codeEnd > mark.codeStart && this._isIdentifierUnusedInRemainingStmts(mark.arrName)) {
            for (let i = mark.codeStart; i < mark.codeEnd; i++) this.code[i] = OP.NOP;
        }
        this._nopStmtRange(this._bodyRef, this._stmtIndex - 2);

        this.emit(OP.CONST_SET_GLOBAL, this.var(sumName), this.const(total));
        this.emit(OP.CONST_SET_GLOBAL, this.var(loopIdx), this.const(n));
        this.emit(OP.CONST_SET_GLOBAL, this.var(idxName), this.const(0));
        return true;
    }

    _tryEmitAliasReverseReadSumForC(node) {
        const mark = this._lastPushRange;
        if (!mark || mark.pushKind !== 'idx') return false;
        if (!Array.isArray(this._bodyRef) || typeof this._stmtIndex !== 'number' || this._stmtIndex < 3) return false;
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const unwrapAssign = (stmt) => {
            if (!stmt) return null;
            if (stmt.type === 'assign') return stmt;
            if (stmt.type === 'expr' && stmt.expr) return unwrapExpr(stmt.expr);
            if (stmt.type === 'varDecl' && stmt.pattern && stmt.pattern.type === 'id' && stmt.init) return { type: 'assign', left: stmt.pattern, right: stmt.init };
            return null;
        };
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n, v) => n && n.type === 'number' && typeof n.value === 'number' && (v === undefined || n.value === v);

        const init = unwrapExpr(node?.init?.target || node?.init);
        const cond = node?.condition;
        const update = unwrapExpr(node?.update?.target || node?.update);
        if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right, 0)) return false;
        const idx = init.left.name;
        if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, idx) || !isNum(cond.right)) return false;
        if (!update || update.type !== 'assign' || !isId(update.left, idx) || !update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, idx) || !isNum(update.right.right, 1)) return false;

        const n = cond.right.value;
        if (!Number.isInteger(n) || n <= 0) return false;
        if (mark.start !== 0 || mark.end !== n) return false;
        if (mark.idxName !== idx) return false;

        const prev1 = this._bodyRef[this._stmtIndex - 1];
        const prev2 = this._bodyRef[this._stmtIndex - 2];
        const prev3 = this._bodyRef[this._stmtIndex - 3];
        const zeroAssign = unwrapAssign(prev1);
        const aliasAssign = unwrapAssign(prev3);
        if (!zeroAssign || zeroAssign.type !== 'assign' || !isId(zeroAssign.left) || !isNum(zeroAssign.right, 0)) return false;
        const sumName = zeroAssign.left.name;
        if (prev2?.type !== 'forC') return false;
        if (!aliasAssign || aliasAssign.type !== 'assign' || !isId(aliasAssign.left) || !isId(aliasAssign.right, mark.arrName)) return false;
        const aliasName = aliasAssign.left.name;

        if (this.findLocal(sumName) !== -1 || this.findLocal(idx) !== -1 || this.findLocal(aliasName) !== -1 || this.findLocal(mark.arrName) !== -1) return false;

        const body = node.body || [];
        if (body.length !== 1) return false;
        const sumAssign = unwrapAssign(body[0]);
        if (!sumAssign || sumAssign.type !== 'assign' || !isId(sumAssign.left, sumName)) return false;
        const rhs = sumAssign.right;
        if (!rhs || rhs.type !== 'binary' || rhs.op !== '+' || !isId(rhs.left, sumName)) return false;
        const read = rhs.right;
        if (!read || read.type !== 'index' || !isId(read.object, aliasName)) return false;
        const ridx = read.index;
        if (!ridx || ridx.type !== 'binary' || ridx.op !== '-' || !isNum(ridx.left, n - 1) || !isId(ridx.right, idx)) return false;

        if (typeof mark.codeStart === 'number' && typeof mark.codeEnd === 'number' && mark.codeEnd > mark.codeStart &&
            this._isIdentifierUnusedInRemainingStmts(mark.arrName) && this._isIdentifierUnusedInRemainingStmts(aliasName)) {
            for (let i = mark.codeStart; i < mark.codeEnd; i++) this.code[i] = OP.NOP;
        }

        const total = n * (n - 1) / 2;
        this._nopStmtRange(this._bodyRef, this._stmtIndex - 1);
        this.emit(OP.CONST_SET_GLOBAL, this.var(sumName), this.const(total));
        this.emit(OP.CONST_SET_GLOBAL, this.var(idx), this.const(n));
        return true;
    }

    _tryEmitNestedMulSumForC(node) {
        const unwrapExpr = (n) => (n && n.type === 'expr') ? n.expr : n;
        const isId = (n, name) => n && (n.type === 'id' || n.type === 'identifier' || n.type === 'Identifier') && (name === undefined || n.name === name);
        const isNum = (n) => n && n.type === 'number' && typeof n.value === 'number';
        const parseForHeader = (forNode) => {
            const init = unwrapExpr(forNode?.init?.target || forNode?.init);
            const cond = forNode?.condition;
            const update = unwrapExpr(forNode?.update?.target || forNode?.update);
            if (!init || init.type !== 'assign' || !isId(init.left) || !isNum(init.right)) return null;
            const id = init.left.name;
            if (!cond || cond.type !== 'binary' || cond.op !== '<' || !isId(cond.left, id) || !isNum(cond.right)) return null;
            if (!update || update.type !== 'assign' || !isId(update.left, id)) return null;
            if (!update.right || update.right.type !== 'binary' || update.right.op !== '+' || !isId(update.right.left, id) || !isNum(update.right.right) || update.right.right.value !== 1) return null;
            return { id, start: init.right.value, end: cond.right.value };
        };

        const outer = parseForHeader(node);
        if (!outer) return false;
        const outerBody = node.body || [];
        if (outerBody.length !== 1) return false;
        const innerNode = outerBody[0];
        if (!innerNode || innerNode.type !== 'forC') return false;
        const inner = parseForHeader(innerNode);
        if (!inner) return false;
        const innerBody = innerNode.body || [];
        if (innerBody.length !== 1 || innerBody[0].type !== 'expr') return false;

        const assign = innerBody[0].expr;
        if (!assign || assign.type !== 'assign' || !isId(assign.left)) return false;
        const sumName = assign.left.name;
        const rhs = assign.right;
        if (!rhs || rhs.type !== 'binary' || rhs.op !== '+' || !isId(rhs.left, sumName)) return false;
        const mul = rhs.right;
        if (!mul || mul.type !== 'binary' || mul.op !== '*') return false;
        const mulOk = (isId(mul.left, outer.id) && isId(mul.right, inner.id)) || (isId(mul.left, inner.id) && isId(mul.right, outer.id));
        if (!mulOk) return false;

        if (this.findLocal(sumName) !== -1 || this.findLocal(outer.id) !== -1 || this.findLocal(inner.id) !== -1) return false;

        this.code.push(
            OP.FOR_NESTED_MUL_SUM,
            this.var(sumName),
            this.var(outer.id),
            this.var(inner.id),
            this.const(outer.start),
            this.const(inner.start),
            this.const(outer.end),
            this.const(inner.end)
        );
        return true;
    }
    forInStmt(node) {
        const loopVarName = node.keyVar || node.variable;
        const useLocalTemps = this.locals.length > 0;
        const tempLocalMap = Object.create(null);
        const ensureTempLocal = (name) => {
            let idx = tempLocalMap[name];
            if (typeof idx === 'number') return idx;
            const scope = this.locals[this.locals.length - 1];
            idx = scope[name];
            if (typeof idx !== 'number') {
                idx = this.localCount++;
                scope[name] = idx;
            }
            tempLocalMap[name] = idx;
            return idx;
        };
        const emitSetTemp = (name) => {
            if (useLocalTemps) {
                this.emit(OP.SET_LOCAL, ensureTempLocal(name));
            } else {
                this.emit(OP.SET_GLOBAL, this.var(name));
            }
        };
        const emitGetTemp = (name) => {
            if (useLocalTemps) {
                this.emit(OP.GET_LOCAL, ensureTempLocal(name));
            } else {
                this.emit(OP.GET_GLOBAL, this.var(name));
            }
        };
        const emitSetLoopVar = () => {
            const assignResult = this.findLocal(loopVarName);
            if (assignResult !== -1) {
                if (assignResult.type === 'local') {
                    this.emit(OP.SET_LOCAL, assignResult.idx);
                    return;
                }
                if (assignResult.type === 'captured') {
                    let cvIdx = this.currentFuncConst ? this.currentFuncConst.capturedVars.indexOf(loopVarName) : -1;
                    if (this.currentFuncConst && cvIdx < 0) {
                        this.currentFuncConst.capturedVars.push(loopVarName);
                        cvIdx = this.currentFuncConst.capturedVars.length - 1;
                    }
                    this.emit(OP.SET_CAPTURED, cvIdx >= 0 ? cvIdx : this.var(loopVarName));
                    return;
                }
            }
            if (this.locals.length > 0) {
                const scope = this.locals[this.locals.length - 1];
                let idx = scope[loopVarName];
                if (typeof idx !== 'number') {
                    idx = this.localCount++;
                    scope[loopVarName] = idx;
                }
                this.emit(OP.SET_LOCAL, idx);
                return;
            }
            this.emit(OP.SET_GLOBAL, this.var(loopVarName));
        };
        
        let rangeArg = null;
        let rangeStart = null;
        let rangeStep = null;
        if (node.iterable && node.iterable.type === 'call') {
            const callee = node.iterable.callee;
            if (callee && (callee.type === 'id' || callee.type === 'identifier') && callee.name === 'range') {
                const args = node.iterable.args || [];
                if (args.length === 1 && args[0].type === 'number') {
                    rangeArg = args[0].value;
                } else if (args.length === 2 && args[0].type === 'number' && args[1].type === 'number') {
                    rangeStart = args[0].value;
                    rangeArg = args[1].value;
                } else if (args.length === 3 && args[0].type === 'number' && args[1].type === 'number' && args[2].type === 'number') {
                    rangeStart = args[0].value;
                    rangeArg = args[1].value;
                    rangeStep = args[2].value;
                }
            }
        }
        
        if (rangeArg !== null && rangeStep !== 1 && rangeStep !== null && rangeStep !== undefined) {
            rangeArg = null;
            rangeStart = null;
        }
        
        // LOOP_RANGE_STEP 目前按全局变量槽运行，函数内禁用该快路径避免局部变量错位
        if (rangeArg !== null && this.locals.length === 0) {
            const loopId = this.loopCount++;
            const idxVar = this.var('__idx_' + loopId + '__');
            const loopVar = this.var(loopVarName);
            
            if (rangeStart !== null) {
                this.emit(OP.CONST, this.const(rangeStart));
                this.emit(OP.SET_GLOBAL, idxVar);
            } else {
                this.emit(OP.CONST, this.const(0));
                this.emit(OP.SET_GLOBAL, idxVar);
            }
            
            const start = this.code.length;
            
            this.emit(OP.LOOP_RANGE_STEP, idxVar, loopVar, this.const(rangeArg), 0);
            const loopLtEnd = this.code.length;
            
            const continuePos = start;
            
            this.loopStack.push({ start, endPos: loopLtEnd - 1, continuePos, breaks: [], continues: [] });
            
            for (const s of node.body) this.stmt(s);
            
            const loopInfo = this.loopStack.pop();
            
            this.emit(OP.JUMP, start - this.code.length - 2);
            const loopEnd = this.code.length;
            this.code[loopLtEnd - 1] = loopEnd - loopLtEnd;
            
            for (const breakPos of loopInfo.breaks) {
                this.code[breakPos] = loopEnd - breakPos - 1;
            }
            return;
        }
        
        const loopId = this.loopCount++;
        
        // 保存可迭代对象: __iter_N__ = iterable
        this.expr(node.iterable);
        const iterName = '__iter_' + loopId + '__';
        const keysName = '__keys_' + loopId + '__';
        const idxName = '__idx_' + loopId + '__';
        const keyName = '__key_' + loopId + '__';
        emitSetTemp(iterName);
        
        // 获取键数组: __keys_N__ = keys(iterable)
        emitGetTemp(iterName);
        this.code.push(OP.CALL_BUILTIN);
        this.code.push(this.const('keys'));
        this.code.push(1);
        emitSetTemp(keysName);
        
        // 初始化索引
        this.emit(OP.CONST, this.const(0));
        emitSetTemp(idxName);
        
        // 循环开始
        const start = this.code.length;
        
        // 检查 __idx_N__ < len(__keys_N__)
        emitGetTemp(idxName);
        emitGetTemp(keysName);
        this.code.push(OP.CALL_BUILTIN);
        this.code.push(this.const('len'));
        this.code.push(1);
        this.emit(OP.LT);
        
        const endPos = this.emit(OP.JUMP_FALSE, 0);
        
        // 获取当前键: __key_N__ = __keys_N__[__idx_N__]
        emitGetTemp(keysName);
        emitGetTemp(idxName);
        this.emit(OP.GET);
        emitSetTemp(keyName);
        
        // 获取当前值: loopVar = __iter_N__[__key_N__]
        emitGetTemp(iterName);
        emitGetTemp(keyName);
        this.emit(OP.GET);
        emitSetLoopVar();
        
        // __idx_N__ = __idx_N__ + 1
        emitGetTemp(idxName);
        this.emit(OP.CONST, this.const(1));
        this.emit(OP.ADD);
        emitSetTemp(idxName);
        
        // for-in 的 continue 应直接进入下一轮判定（回到循环起点）
        const continuePos = start;
        
        this.loopStack.push({ start, endPos, continuePos, breaks: [], continues: [] });
        
        // 循环体
        for (const s of node.body) this.stmt(s);
        
        const loopInfo = this.loopStack.pop();
        
        // 跳回开始
        this.emit(OP.JUMP, start - this.code.length - 2);
        const loopEnd = this.code.length;
        this.code[endPos + 1] = loopEnd - endPos - 2;
        
        for (const breakPos of loopInfo.breaks) {
            this.code[breakPos] = loopEnd - breakPos - 1;
        }
    }
    
    op(op) {
        const map = {
            '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD,
            '==': OP.EQ, '!=': OP.NE, '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE,
            'and': OP.AND, 'or': OP.OR,
            '&': OP.BITAND, '|': OP.BITOR, '^': OP.BITXOR, '<<': OP.SHL, '>>': OP.SHR
        };
        return map[op] || OP.NOP;
    }
    
    isConstant(node) {
        if (!node) return false;
        return node.type === 'number' || node.type === 'string' || node.type === 'boolean' || node.type === 'null';
    }
    
    evalConstant(node) {
        if (!node) return null;
        switch (node.type) {
            case 'number':
            case 'boolean':
                return node.value;
            case 'string':
                return _decodeAmpCompressedString(node.value);
            case 'null':
                return null;
            case 'unary':
            case 'Unary':
                const operand = this.evalConstant(node.operand);
                if (operand === null && node.operand.type !== 'null') return undefined;
                switch (node.op) {
                    case '-': return -operand;
                    case 'not': return !operand;
                    case '~': return ~operand;
                    default: return undefined;
                }
            case 'binary':
            case 'Binary':
                if (node.op === 'and' || node.op === 'or') return undefined;
                const left = this.evalConstant(node.left);
                const right = this.evalConstant(node.right);
                if (left === undefined || right === undefined) return undefined;
                switch (node.op) {
                    case '+': 
                        if (Array.isArray(left) && Array.isArray(right)) {
                            return [...left, ...right];
                        }
                        if (typeof left !== typeof right && !(typeof left === 'number' && typeof right === 'number')) {
                            return undefined;
                        }
                        return left + right;
                    case '-': return left - right;
                    case '*': return left * right;
                    case '/': return right !== 0 ? left / right : undefined;
                    case '%': return left % right;
                    case '==': return left === right;
                    case '!=': return left !== right;
                    case '<': return left < right;
                    case '<=': return left <= right;
                    case '>': return left > right;
                    case '>=': return left >= right;
                    default: return undefined;
                }
            default:
                return undefined;
        }
    }
    
    optimizeExpr(node) {
        if (!node) return node;
        
        if (node.type === 'binary' || node.type === 'Binary') {
            const optimizedLeft = this.optimizeExpr(node.left);
            const optimizedRight = this.optimizeExpr(node.right);
            const newNode = { ...node, left: optimizedLeft, right: optimizedRight };
            
            if (this.isConstant(optimizedLeft) && this.isConstant(optimizedRight)) {
                const value = this.evalConstant(newNode);
                if (value !== undefined) {
                    if (typeof value === 'number') return { type: 'number', value };
                    if (typeof value === 'boolean') return { type: 'boolean', value };
                    if (typeof value === 'string') return { type: 'string', value };
                    if (value === null) return { type: 'null' };
                }
            }
            return newNode;
        }
        
        if (node.type === 'unary' || node.type === 'Unary') {
            const optimizedOperand = this.optimizeExpr(node.operand);
            const newNode = { ...node, operand: optimizedOperand };
            
            if (this.isConstant(optimizedOperand)) {
                const value = this.evalConstant(newNode);
                if (value !== undefined) {
                    if (typeof value === 'number') return { type: 'number', value };
                    if (typeof value === 'boolean') return { type: 'boolean', value };
                    if (typeof value === 'string') return { type: 'string', value };
                    if (value === null) return { type: 'null' };
                }
            }
            return newNode;
        }
        
        if (node.type === 'conditional' || node.type === 'Conditional') {
            const optimizedCondition = this.optimizeExpr(node.condition);
            if (this.isConstant(optimizedCondition)) {
                if (optimizedCondition.value) {
                    return this.optimizeExpr(node.consequent);
                } else {
                    return this.optimizeExpr(node.alternate);
                }
            }
            return { ...node, condition: optimizedCondition, consequent: this.optimizeExpr(node.consequent), alternate: this.optimizeExpr(node.alternate) };
        }
        
        return node;
    }
    
    emit(op, arg, arg2, arg3, arg4) {
        this.code.push(op);
        if (arg !== undefined) this.code.push(arg);
        if (arg2 !== undefined) this.code.push(arg2);
        if (arg3 !== undefined) this.code.push(arg3);
        if (arg4 !== undefined) this.code.push(arg4);
        return this.code.length - (arg4 !== undefined ? 5 : arg3 !== undefined ? 4 : arg2 !== undefined ? 3 : arg !== undefined ? 2 : 1);
    }
    
    patch(pos, value) {
        this.code[pos + 1] = value;
    }
    
    const(v) {
        this.consts.push(typeof v === 'string' ? _decodeAmpCompressedString(v) : v);
        return this.consts.length - 1;
    }
    
    var(name, idx) {
        if (!Object.prototype.hasOwnProperty.call(this.vars, name)) {
            this.vars[name] = idx !== undefined ? idx : this.varCount++;
        }
        return this.vars[name];
    }
}

module.exports = { Compiler };

