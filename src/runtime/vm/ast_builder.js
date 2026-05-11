'use strict';

function createAstBuilder() {
    const wrap = (v) => {
        if (v === null || v === undefined) return { type: 'null' };
        if (typeof v === 'number') return { type: 'number', value: v };
        if (typeof v === 'string') return { type: 'string', value: v };
        if (typeof v === 'boolean') return { type: 'boolean', value: v };
        if (v && v.type) return v;
        return { type: 'null' };
    };
    const id = (name) => ({ type: 'id', name });
    const num = (value) => ({ type: 'number', value });
    const str = (value) => ({ type: 'string', value });
    const bool = (value) => ({ type: 'boolean', value });
    const null_ = () => ({ type: 'null' });
    const arr = (elements) => ({ type: 'array', elements: (elements || []).map(wrap) });
    const obj = (pairs) => ({ type: 'object', pairs });
    const binOp = (op, left, right) => ({ type: 'binary', op, left: wrap(left), right: wrap(right) });
    const unaryOp = (op, operand) => ({ type: 'unary', op, operand: wrap(operand) });
    const call = (callee, args) => ({ type: 'call', callee: wrap(callee), args: (args || []).map(wrap) });
    const index_ = (object, index) => ({ type: 'index', object: wrap(object), index: wrap(index) });
    const member = (object, property) => ({ type: 'member', object: wrap(object), property });
    const assign = (left, right) => ({ type: 'assign', left: wrap(left), right: wrap(right) });
    const varDecl = (name, init) => ({ type: 'varDecl', pattern: id(name), init: wrap(init) });
    const fn = (name, params, body) => {
        const resolvedParams = (params || []).map(p => {
            if (typeof p === 'string') return p;
            if (p && p.type === 'string' && typeof p.value === 'string') return p.value;
            if (p && p.type === 'id' && typeof p.name === 'string') return p.name;
            return String(p);
        });
        return { type: 'function', name, params: resolvedParams, body };
    };
    const ret = (value) => ({ type: 'return', value: wrap(value) });
    const if_ = (condition, then, else_) => ({ type: 'if', condition: wrap(condition), then, else: else_ || null });
    const while_ = (condition, body) => ({ type: 'while', condition: wrap(condition), body });
    const forIn = (keyVar, iterable, body) => ({ type: 'forIn', keyVar, iterable: wrap(iterable), body });
    const expr = (expr_) => ({ type: 'expr', expr: wrap(expr_) });
    const block = (stmts) => Array.isArray(stmts) ? stmts : [stmts];
    const yield_ = (value) => ({ type: 'yield', value: wrap(value) });
    const match = (value, cases) => ({ type: 'match', value: wrap(value), cases });
    const tryCatch = (tryBlock, catchParam, catchBlock) => ({ type: 'tryCatch', tryBlock, catchParam, catchBlock });
    const throw_ = (value) => ({ type: 'throw', value: wrap(value) });

    return {
        id, num, str, bool, null: null_, arr, obj,
        binOp, unaryOp, call, index: index_, member,
        assign, varDecl, fn, ret, if: if_, while: while_,
        forIn, expr, block, yield: yield_, match,
        tryCatch, throw: throw_
    };
}

module.exports = { createAstBuilder };
