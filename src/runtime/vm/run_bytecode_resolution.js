'use strict';

function resolveRunBytecode(owner, code, options, globalBcCache, maxGlobalCacheSize) {
    let bc;
    const originalCode = code;
    let normalizedCode = code;
    if (typeof normalizedCode === 'string') normalizedCode = normalizedCode.replace(/;/g, '\n');
    if (normalizedCode === owner._lastCode) {
        bc = owner._lastBc;
    } else {
        const h = owner.hash(normalizedCode);
        bc = owner.cache.get(h);
        if (!bc) bc = globalBcCache.get(h);

        if (!bc) {
            let ast;
            let fullAst;
            if (owner.parseCode) {
                const parsedResult = owner.parseCode(normalizedCode);
                fullAst = parsedResult.fullAst;
                ast = parsedResult.simpleAst;
            } else {
                ast = owner.parser.parse(normalizedCode);
                fullAst = ast;
            }

            if (owner._typeCheckerEnabled && options.typeCheck !== false) {
                const typeResult = owner.typeChecker.check(fullAst, {
                    strict: owner.options.strictMode || false
                });
                if (!typeResult.success) {
                    const errorMessages = typeResult.errors.map((e) => e.message).join('\n');
                    if (owner._errorReporterOpts) {
                        const report = typeResult.errors.map((e) => owner.errorReporter.report({
                            type: 'TypeError',
                            code: 'TYPE_ERROR',
                            message: e.message,
                            line: e.line || 1,
                            column: e.column || 1,
                            context: e.context || '',
                            suggestion: e.suggestion || '',
                            severity: 'error'
                        }, normalizedCode)).join('\n');
                        return {
                            handled: true,
                            result: {
                                success: false,
                                error: report,
                                typeErrors: typeResult.errors,
                                output: []
                            }
                        };
                    }
                    return {
                        handled: true,
                        result: {
                            success: false,
                            error: `Type check failed:\n${errorMessages}`,
                            typeErrors: typeResult.errors,
                            output: []
                        }
                    };
                }
            }

            bc = owner.compiler.compile(ast);
            owner.cache.set(h, bc);
            if (globalBcCache.size < maxGlobalCacheSize) {
                globalBcCache.set(h, bc);
            }
        }

        owner._lastCode = normalizedCode;
        owner._lastBc = bc;
        owner._lastOriginalCode = originalCode;
    }

    return {
        handled: false,
        code: normalizedCode,
        bc
    };
}

module.exports = {
    resolveRunBytecode
};
