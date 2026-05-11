const fs = require('fs');
const path = require('path');
const { parse } = require('../../dist/core/parser.js');

const sourceFile = path.join(__dirname, '..', 'sandbox', 'test_obj.seed');
const source = fs.readFileSync(sourceFile, 'utf8');

console.log('Source:', source);

const ast = parse(source);

console.log('AST statements count:', ast.statements.length);

for (let i = 0; i < ast.statements.length; i++) {
    const stmt = ast.statements[i];
    console.log(`\nStatement ${i}:`, stmt.type);
    if (stmt.target) {
        console.log('Target:', stmt.target.type);
        if (stmt.target.value) {
            console.log('Value type:', stmt.target.value.type);
            console.log('Value properties:', stmt.target.value.properties);
            console.log('Value entries:', stmt.target.value.entries);
        }
    }
}
