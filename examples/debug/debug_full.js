const fs = require('fs');
const path = require('path');
const { parse } = require('../../dist/core/parser.js');

const source = 'obj = { x: 10 y: 20 }';

console.log('Source:', source);

const ast = parse(source);

function compileExpr(expr, options = {}) {
  if (!expr) return 'null';

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
      return `[${elements.map((e) => compileExpr(e, options)).join(', ')}]`;
    case 'ObjectLiteral':
    case 'Object':
      const objEntries = [];
      console.log('ObjectLiteral expr:', expr);
      console.log('expr.entries:', expr.entries);
      console.log('expr.properties:', expr.properties);
      console.log('expr.properties instanceof Map:', expr.properties instanceof Map);
      
      if (expr.entries && Array.isArray(expr.entries)) {
        console.log('Using entries array');
        for (const entry of expr.entries) {
          if (entry.kind === 'property') {
            const key = entry.key;
            const value = compileExpr(entry.value, options);
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
              objEntries.push(`${key}: ${value}`);
            }
            else {
              objEntries.push(`${JSON.stringify(key)}: ${value}`);
            }
          }
          else if (entry.kind === 'spread') {
            objEntries.push(`...${compileExpr(entry.value, options)}`);
          }
        }
      }
      else if (expr.properties) {
        console.log('Using properties');
        if (expr.properties instanceof Map) {
          console.log('properties is Map');
          expr.properties.forEach((value, key) => {
            const compiledValue = compileExpr(value, options);
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
              objEntries.push(`${key}: ${compiledValue}`);
            }
            else {
              objEntries.push(`${JSON.stringify(key)}: ${compiledValue}`);
            }
          });
        }
        else if (typeof expr.properties === 'object') {
          console.log('properties is object');
          Object.entries(expr.properties).forEach(([k, v]) => {
            objEntries.push(`${JSON.stringify(k)}: ${compileExpr(v, options)}`);
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
      if (assignTarget && typeof assignTarget === 'object') {
        return `${compileExpr(assignTarget, options)} = ${compileExpr(assignValue, options)}`;
      }
      return `${assignTarget} = ${compileExpr(assignValue, options)}`;
    default:
      console.log('Unknown type:', expr.type);
      return 'undefined';
  }
}

function compileStatement(stmt, options = {}, indent = 0) {
  const pad = '  '.repeat(indent);

  switch (stmt.type) {
    case 'Action':
      return pad + compileExpr(stmt.target, options) + ';\n';
    default:
      return '';
  }
}

const stmt = ast.statements[0];
console.log('\nCompiling statement:', stmt.type);
const result = compileStatement(stmt);
console.log('\nCompiled result:', result);
