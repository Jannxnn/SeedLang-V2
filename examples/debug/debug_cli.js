const fs = require('fs');
const path = require('path');
const { Lexer } = require('../../dist/core/lexer.js');
const { Parser } = require('../../dist/core/parser.js');

const sourceFile = path.join(__dirname, '..', 'sandbox', 'test_obj.seed');
const source = fs.readFileSync(sourceFile, 'utf8');

console.log('Source:', source);

const lexer = new Lexer(source);
const tokens = lexer.tokenize();
const parser = new Parser(tokens);
const ast = parser.parse();

console.log('AST statements count:', ast.statements.length);

const compiled = require('../../dist/cli.js');
const result = compiled.compileToJS ? compiled.compileToJS(source) : 'compileToJS not found';

console.log('Compiled result:\n', result);
