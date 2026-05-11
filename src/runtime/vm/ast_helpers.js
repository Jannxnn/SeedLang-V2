'use strict';
// ============================================
// FullParser AST → VM Parser AST 转换器
// ============================================

/**
 * 将 FullParser (dist/core/parser.js) 产出的 AST
 * 转换为 VM 内嵌 Parser (vm/parser.js) 的 AST 格式。
 *
 * FullParser 使用 PascalCase 类型名和不同字段名，
 * VM Parser 使用 camelCase，且结构也有差异。
 * Compiler 期望 VM Parser 格式。
 */

/**
 * 递归转换 pattern 节点。
 * FullParser 和 VM Parser 的 pattern 格式几乎相同（都用 kind），
 * 但子 pattern 需要递归处理，且 body 中的语句需要用 convertAst 转换。
 */
function convertPattern(pat) {
    if (!pat || typeof pat !== 'object') return pat;
    if (Array.isArray(pat)) return pat.map(p => convertPattern(p));

    switch (pat.kind) {
        case 'literal':
        case 'wildcard':
        case 'identifier':
            return pat;
        case 'or':
            return { kind: 'or', patterns: (pat.patterns || []).map(p => convertPattern(p)) };
        case 'array':
            return {
                kind: 'array',
                elements: (pat.elements || []).map(p => convertPattern(p)),
                rest: pat.rest ? convertPattern(pat.rest) : undefined
            };
        case 'object':
            return {
                kind: 'object',
                properties: (pat.properties || []).map(p => ({
                    key: p.key,
                    pattern: p.pattern ? convertPattern(p.pattern) : p.pattern,
                    defaultValue: p.defaultValue ? convertAst(p.defaultValue) : p.defaultValue
                })),
                rest: pat.rest ? convertPattern(pat.rest) : undefined
            };
        case 'type':
            return {
                kind: 'type',
                typeName: pat.typeName,
                pattern: pat.pattern ? convertPattern(pat.pattern) : pat.pattern
            };
        case 'range':
            return pat; // range pattern is data-only
        default:
            // Unknown pattern kind, recursively convert any sub-patterns
            const result = {};
            for (const key of Object.keys(pat)) {
                const val = pat[key];
                if (val && typeof val === 'object') {
                    result[key] = Array.isArray(val) ? val.map(v => convertPattern(v)) : convertPattern(val);
                } else {
                    result[key] = val;
                }
            }
            return result;
    }
}

function convertAst(fullAst) {
    if (!fullAst || typeof fullAst !== 'object') return fullAst;

    // Arrays: recursively convert each element
    if (Array.isArray(fullAst)) {
        return fullAst.map(item => convertAst(item));
    }

    const t = fullAst.type;

    // Program → program
    if (t === 'Program') {
        return {
            type: 'program',
            body: (fullAst.statements || []).map(s => convertAst(s))
        };
    }

    // Block → array of converted statements
    if (t === 'Block') {
        return (fullAst.statements || []).map(s => convertAst(s));
    }

    // ---- Statements ----

    // Action (FullParser wrapper) → unwrap
    if (t === 'Action') {
        if (fullAst.action === 'expr' && fullAst.target) {
            const target = fullAst.target;
            // Assignment inside Action → varDecl or expr(assign)
            if (target.type === 'Assignment') {
                const left = convertAst(target.target);
                if (left.type === 'id') {
                    return { type: 'assign', left, right: convertAst(target.value), line: target.line };
                }
                return { type: 'expr', expr: { type: 'assign', left, right: convertAst(target.value) } };
            }
            return { type: 'expr', expr: convertAst(target) };
        }
        return { type: 'expr', expr: convertAst(fullAst.target) };
    }

    // FunctionDef → function
    if (t === 'FunctionDef') {
        return {
            type: 'function',
            name: fullAst.name,
            params: fullAst.params || [],
            genericParams: fullAst.genericParams || null,
            paramTypes: fullAst.paramTypes || null,
            returnType: fullAst.returnType || null,
            body: convertAst(fullAst.body),
            ...(fullAst.async ? { async: true } : {}),
            ...(fullAst.isStatic ? { isStatic: true } : {})
        };
    }

    // AsyncFunctionDef → function with async
    if (t === 'AsyncFunctionDef') {
        return {
            type: 'function',
            name: fullAst.name,
            params: fullAst.params || [],
            paramTypes: fullAst.paramTypes || null,
            returnType: fullAst.returnType || null,
            body: convertAst(fullAst.body),
            async: true
        };
    }

    // CoroutineDef
    if (t === 'CoroutineDef') {
        return {
            type: 'CoroutineDef',
            name: fullAst.name,
            params: fullAst.params || [],
            body: convertAst(fullAst.body)
        };
    }

    // Return → return
    if (t === 'Return') {
        return { type: 'return', value: convertAst(fullAst.value), line: fullAst.line };
    }

    // If → if
    if (t === 'If') {
        return {
            type: 'if',
            condition: convertAst(fullAst.condition),
            then: convertAst(fullAst.thenBranch || fullAst.then),
            else: fullAst.elseBranch || fullAst.els ? convertAst(fullAst.elseBranch || fullAst.els) : null
        };
    }

    // While → while
    if (t === 'While') {
        return {
            type: 'while',
            condition: convertAst(fullAst.condition),
            body: convertAst(fullAst.body)
        };
    }

    // For → forC
    if (t === 'For') {
        return {
            type: 'forC',
            init: convertAst(fullAst.init),
            condition: convertAst(fullAst.condition),
            update: convertAst(fullAst.update),
            body: convertAst(fullAst.body)
        };
    }

    // ForIn → forIn
    if (t === 'ForIn') {
        return {
            type: 'forIn',
            keyVar: fullAst.variable || fullAst.keyVar,
            iterable: convertAst(fullAst.iterable),
            body: convertAst(fullAst.body)
        };
    }

    // Break
    if (t === 'Break') {
        return { type: 'Break', line: fullAst.line };
    }

    // Continue
    if (t === 'Continue') {
        return { type: 'Continue', line: fullAst.line };
    }

    // Try → try
    if (t === 'Try') {
        return {
            type: 'try',
            tryBlock: convertAst(fullAst.body),
            catchClause: fullAst.catchClause ? {
                param: fullAst.catchClause.param,
                body: convertAst(fullAst.catchClause.body)
            } : null,
            finallyBlock: fullAst.finallyBlock ? convertAst(fullAst.finallyBlock) : null
        };
    }

    // Throw → throw
    if (t === 'Throw') {
        return { type: 'throw', value: convertAst(fullAst.value), line: fullAst.line };
    }

    // ClassDef → class
    if (t === 'ClassDef') {
        return {
            type: 'class',
            name: fullAst.name,
            superClass: fullAst.superClass || null,
            methods: (fullAst.methods || []).map(m => convertAst(m)),
            properties: fullAst.properties || [],
            genericParams: fullAst.genericParams || null
        };
    }

    // Import → import
    if (t === 'Import') {
        return {
            type: 'import',
            moduleName: fullAst.module,
            alias: fullAst.alias || null,
            importMacros: fullAst.importMacros || false,
            line: fullAst.line
        };
    }

    // Export → unwrap inner declaration
    if (t === 'Export') {
        return convertAst(fullAst.declaration);
    }

    // Yield
    if (t === 'Yield') {
        return { type: 'Yield', value: convertAst(fullAst.value), line: fullAst.line };
    }

    // Match → match
    if (t === 'Match') {
        return {
            type: 'match',
            expr: convertAst(fullAst.expression),
            cases: (fullAst.cases || []).map(c => ({
                pattern: c.pattern ? convertPattern(c.pattern) : c.pattern,
                guard: c.guard ? convertAst(c.guard) : null,
                body: convertAst(c.body)
            }))
        };
    }

    // Switch → switch
    if (t === 'Switch') {
        return {
            type: 'switch',
            expr: convertAst(fullAst.expression),
            cases: (fullAst.cases || []).map(c => ({
                values: (c.values || []).map(v => convertAst(v)),
                body: convertAst(c.body)
            })),
            defaultCase: fullAst.defaultCase ? convertAst(fullAst.defaultCase) : null
        };
    }

    // MacroDef
    if (t === 'MacroDef') {
        return {
            type: 'macroDef',
            name: fullAst.name,
            params: fullAst.params || [],
            body: convertAst(fullAst.body)
        };
    }

    if (t === 'ProcMacroDef') {
        return {
            type: 'procMacroDef',
            name: fullAst.name,
            params: fullAst.params || [],
            body: convertAst(fullAst.body)
        };
    }

    if (t === 'MacroCall') {
        return {
            type: 'macroCall',
            name: fullAst.name,
            args: (fullAst.args || []).map(a => convertAst(a))
        };
    }

    // InterfaceDef, TypeAlias — pass through
    if (t === 'InterfaceDef' || t === 'TypeAlias' || t === 'WebDirective' || t === 'WebDirectiveBlock') {
        return fullAst;
    }

    // Question / Verb — treat as expr
    if (t === 'Question' || t === 'Verb') {
        return { type: 'expr', expr: fullAst };
    }

    // ---- Expressions ----

    // BinaryOp → binary
    if (t === 'BinaryOp') {
        return {
            type: 'binary',
            op: fullAst.operator,
            left: convertAst(fullAst.left),
            right: convertAst(fullAst.right)
        };
    }

    // Logical → binary
    if (t === 'Logical') {
        return {
            type: 'binary',
            op: fullAst.operator,
            left: convertAst(fullAst.left),
            right: convertAst(fullAst.right)
        };
    }

    // Unary → unary
    if (t === 'Unary') {
        return {
            type: 'unary',
            op: fullAst.operator === 'not' ? 'not' : fullAst.operator,
            operand: convertAst(fullAst.operand)
        };
    }

    // Assignment → assign
    if (t === 'Assignment') {
        return {
            type: 'assign',
            left: convertAst(fullAst.target),
            right: convertAst(fullAst.value)
        };
    }

    // Call → call
    if (t === 'Call') {
        return {
            type: 'call',
            callee: convertAst(fullAst.callee),
            args: (fullAst.args || []).map(a => convertAst(a))
        };
    }

    // GenericCall → call with typeArgs
    if (t === 'GenericCall') {
        return {
            type: 'call',
            callee: convertAst(fullAst.callee),
            args: (fullAst.args || []).map(a => convertAst(a)),
            typeArgs: fullAst.typeArgs || []
        };
    }

    // SuperCallExpression
    if (t === 'SuperCallExpression') {
        if (fullAst.method) {
            return {
                type: 'superMethodCall',
                method: fullAst.method,
                args: (fullAst.args || []).map(a => convertAst(a))
            };
        }
        return {
            type: 'superCall',
            args: (fullAst.args || []).map(a => convertAst(a))
        };
    }

    // Member → member/index
    if (t === 'Member') {
        const obj = convertAst(fullAst.object);
        if (fullAst.computed) {
            return { type: 'index', object: obj, index: convertAst(fullAst.property) };
        }
        return { type: 'member', object: obj, property: fullAst.property };
    }

    // Identifier → id
    if (t === 'Identifier') {
        return { type: 'id', name: fullAst.name };
    }

    // TextLiteral → string
    if (t === 'TextLiteral') {
        return { type: 'string', value: fullAst.value };
    }

    // NumberLiteral → number
    if (t === 'NumberLiteral') {
        return { type: 'number', value: fullAst.value };
    }

    // BooleanLiteral → boolean
    if (t === 'BooleanLiteral') {
        return { type: 'boolean', value: fullAst.value };
    }

    // NullLiteral → null
    if (t === 'NullLiteral') {
        return { type: 'null' };
    }

    // ArrayLiteral → array
    if (t === 'ArrayLiteral') {
        return {
            type: 'array',
            elements: (fullAst.elements || []).map(e => convertAst(e))
        };
    }

    // ObjectLiteral → object
    if (t === 'ObjectLiteral') {
        const entries = fullAst.entries || [];
        const pairs = [];
        for (const entry of entries) {
            if (entry.kind === 'property') {
                pairs.push({ key: entry.key, value: convertAst(entry.value) });
            } else if (entry.kind === 'computed') {
                pairs.push({ keyExpr: convertAst(entry.key), value: convertAst(entry.value), computed: true });
            } else if (entry.kind === 'spread') {
                pairs.push({ spread: true, value: convertAst(entry.value) });
            }
        }
        return { type: 'object', pairs };
    }

    // Conditional → conditional
    if (t === 'Conditional') {
        return {
            type: 'conditional',
            condition: convertAst(fullAst.condition),
            consequent: convertAst(fullAst.consequent),
            alternate: convertAst(fullAst.alternate)
        };
    }

    // Await → await
    if (t === 'Await') {
        return { type: 'await', expr: convertAst(fullAst.expression) };
    }

    // NewExpression → new
    if (t === 'NewExpression') {
        return {
            type: 'new',
            className: fullAst.className || fullAst.class || fullAst.callee?.name,
            args: (fullAst.args || []).map(a => convertAst(a)),
            line: fullAst.line
        };
    }

    // ArrowFunction → lambda (block body or implicit-return expression body)
    if (t === 'ArrowFunction') {
        const convertedBody = convertAst(fullAst.body);
        const isBlockBody = fullAst.body && fullAst.body.type === 'Block';
        const body = isBlockBody
            ? (Array.isArray(convertedBody) ? convertedBody : [convertedBody])
            : [{ type: 'return', value: convertedBody }];
        return {
            type: 'lambda',
            params: (fullAst.params || []).map(p => (typeof p === 'string' ? p : p?.name)),
            body
        };
    }

    // NounRef — pass through
    if (t === 'NounRef') {
        return fullAst;
    }

    // Default: recursively convert children
    const result = {};
    for (const key of Object.keys(fullAst)) {
        const val = fullAst[key];
        if (val && typeof val === 'object') {
            result[key] = convertAst(val);
        } else {
            result[key] = val;
        }
    }
    return result;
}

module.exports = { convertAst };
