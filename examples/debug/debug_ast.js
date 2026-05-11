const { Lexer } = require('../../dist/core/lexer.js');
const { Parser } = require('../../dist/core/parser.js');

const code = 'obj = { x: 10 y: 20 }';
const lexer = new Lexer(code);
const tokens = lexer.tokenize();
const parser = new Parser(tokens);
const ast = parser.parse();

console.log('AST:', JSON.stringify(ast, (key, value) => {
    if (value instanceof Map) {
        return Object.fromEntries(value);
    }
    return value;
}, 2));

function compileExpr(expr) {
  if (!expr) return 'null';

  console.log('compileExpr called with type:', expr.type);
  
  switch (expr.type) {
    case 'NumberLiteral':
    case 'Number':
      return String(expr.value);
    case 'StringLiteral':
    case 'TextLiteral':
      return JSON.stringify(expr.value);
    case 'BooleanLiteral':
    case 'Boolean':
      return String(expr.value);
    case 'NullLiteral':
    case 'Null':
      return 'null';
    case 'Identifier':
      return expr.name;
    case 'ArrayLiteral':
    case 'Array':
      const elements = expr.elements || expr.items || [];
      return `[${elements.map((e) => compileExpr(e)).join(', ')}]`;
    case 'ObjectLiteral':
    case 'Object':
      console.log('ObjectLiteral expr:', JSON.stringify(expr, null, 2));
      const objEntries = [];
      
      if (expr.entries && Array.isArray(expr.entries)) {
        console.log('Processing entries array');
        for (const entry of expr.entries) {
          if (entry.kind === 'property') {
            const key = entry.key;
            const value = compileExpr(entry.value);
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
              objEntries.push(`${key}: ${value}`);
            } else {
              objEntries.push(`${JSON.stringify(key)}: ${value}`);
            }
          } else if (entry.kind === 'spread') {
            objEntries.push(`...${compileExpr(entry.value)}`);
          }
        }
      } else if (expr.properties) {
        console.log('Processing properties');
        if (expr.properties instanceof Map) {
          expr.properties.forEach((value, key) => {
            const compiledValue = compileExpr(value);
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
              objEntries.push(`${key}: ${compiledValue}`);
            } else {
              objEntries.push(`${JSON.stringify(key)}: ${compiledValue}`);
            }
          });
        } else if (typeof expr.properties === 'object') {
          Object.entries(expr.properties).forEach(([k, v]) => {
            objEntries.push(`${JSON.stringify(k)}: ${compileExpr(v)}`);
          });
        }
      }
      
      console.log('objEntries:', objEntries);
      if (objEntries.length === 0) {
        return '{}';
      }
      return `{ ${objEntries.join(', ')} }`;
    case 'Assignment':
      const assignTarget = expr.target || expr.left;
      const assignValue = expr.value || expr.right;
      console.log('Assignment target:', assignTarget);
      console.log('Assignment value:', assignValue);
      if (assignTarget && typeof assignTarget === 'object') {
        return `${compileExpr(assignTarget)} = ${compileExpr(assignValue)}`;
      }
      return `${assignTarget} = ${compileExpr(assignValue)}`;
    default:
      console.log('Unknown type:', expr.type);
      return 'undefined';
  }
}

const stmt = ast.statements[0];
console.log('\nCompiling statement:', stmt.type);
if (stmt.type === 'Action') {
  console.log('Action target:', stmt.target);
  const result = compileExpr(stmt.target);
  console.log('\nCompiled result:', result);
}
