'use strict';

function initializeParserAndCompiler(owner, FullParserCtor, ParserCtor, CompilerCtor, convertAst) {
    // Keep constructor behavior exactly the same while shrinking vm.js class body.
    if (FullParserCtor) {
        const { Lexer } = require('../../../dist/core/lexer.js');
        const { expandMacrosInProgram } = require('../../../dist/core/macro_expand.js');
        owner.parseCode = (code) => {
            const lexer = new Lexer(code);
            const tokens = lexer.tokenize();
            const parser = new FullParserCtor(tokens);
            const fullAst = parser.parse();
            const expanded = expandMacrosInProgram(fullAst);
            return {
                fullAst: expanded,
                simpleAst: convertAst(expanded)
            };
        };
        owner.parser = {
            parse: (code) => {
                const result = owner.parseCode(code);
                return result.simpleAst;
            },
            currentLine: () => 0
        };
    } else {
        owner.parseCode = null;
        owner.parser = new ParserCtor();
    }
    owner.compiler = new CompilerCtor();
}

module.exports = {
    initializeParserAndCompiler
};
