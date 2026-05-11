'use strict';

function resolveRunAsyncBytecode(owner, code) {
    const h = owner.hash(code);
    let bc = owner.cache.get(h);
    if (!bc) {
        const ast = owner.parser.parse(code);
        bc = owner.compiler.compile(ast);
        owner.cache.set(h, bc);
    }
    return bc;
}

module.exports = {
    resolveRunAsyncBytecode
};
