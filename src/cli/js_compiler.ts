import { parse } from "../core/parser";
import { collectLocalVars, hasLoopInBody } from "./compiler_shared";


function isSelfRecursive(funcName: string, node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(n => isSelfRecursive(funcName, n));
  if (node.type === 'CallExpr' || node.type === 'Call') {
    const callee = node.callee;
    if (callee && callee.type === 'Identifier' && callee.name === funcName) return true;
  }
  for (const val of Object.values(node)) {
    if (typeof val === 'object' && val !== null) {
      if (isSelfRecursive(funcName, val as any)) return true;
    }
  }
  return false;
}

function hasSideEffects(node: any, sideEffectCallees: Set<string>): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(n => hasSideEffects(n, sideEffectCallees));
  if (node.type === 'CallExpr' || node.type === 'Call') {
    const callee = node.callee;
    if (callee && callee.type === 'Identifier' && sideEffectCallees.has(callee.name)) return true;
  }
  for (const val of Object.values(node)) {
    if (typeof val === 'object' && val !== null) {
      if (hasSideEffects(val as any, sideEffectCallees)) return true;
    }
  }
  return false;
}

export function findMemoizableFunctions(program: any): Set<string> {
  const sideEffectCallees = new Set([
    'print', 'push', 'reserve', 'withCapacity', 'pop', 'shift', 'splice', 'remove', 'writeFile',
    'mkdir', 'console.log', 'alert', 'prompt', 'confirm'
  ]);
  const memoizable = new Set<string>();
  if (!program || !program.statements) return memoizable;
  for (const stmt of program.statements) {
    if (stmt.type === 'FunctionDef' && stmt.body && stmt.params.length > 0) {
      if (stmt.name.endsWith('_raw') || stmt.name.endsWith('Raw')) continue;
      if (isSelfRecursive(stmt.name, stmt.body) && !hasSideEffects(stmt.body, sideEffectCallees)) {
        memoizable.add(stmt.name);
      }
    }
  }
  return memoizable;
}

function findInlineableFunctions(program: any): Map<string, { params: string[], expr: any }> {
  const inlineable = new Map<string, { params: string[], expr: any }>();
  if (!program || !program.statements) return inlineable;
  for (const stmt of program.statements) {
    if (stmt.type === 'FunctionDef' && stmt.body && stmt.body.length === 1) {
      const only = stmt.body[0];
      if ((only.type === 'ReturnStmt' || only.type === 'Return') && only.value && only.value.type === 'BinaryOp') {
        const binExpr = only.value;
        const pSet = new Set(stmt.params);
        const allIdents = collectIdents(binExpr);
        const usesOnlyParams = allIdents.every((id: string) => pSet.has(id));
        if (usesOnlyParams) {
          inlineable.set(stmt.name, { params: stmt.params, expr: binExpr });
        }
      }
    }
  }
  return inlineable;
}

function collectIdents(node: any): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n: any) => collectIdents(n));
  if (node.type === 'Identifier') return [node.name];
  const result: string[] = [];
  for (const val of Object.values(node)) {
    if (typeof val === 'object' && val !== null) {
      result.push(...collectIdents(val));
    }
  }
  return result;
}

function generateRuntimeHelpers(usedHelpers: Set<string>): string {
  const helpers: string[] = [];
  if (usedHelpers.has('__len__')) {
    helpers.push(`function __len__(x) { if (x === null || x === undefined) return 0; if (Array.isArray(x) || typeof x === 'string') return x.length; if (typeof x === 'object') return Object.keys(x).length; return 0; }`);
  }
  if (usedHelpers.has('__push__')) {
    helpers.push(`function __push__(arr, val) { arr.push(val); return arr; }`);
  }
  if (usedHelpers.has('__reserve__')) {
    helpers.push(`function __reserve__(arr, n) { return arr; }`);
  }
  if (usedHelpers.has('__withCapacity__')) {
    helpers.push(`function __withCapacity__(n) { return []; }`);
  }
  if (usedHelpers.has('__pop__')) {
    helpers.push(`function __pop__(arr) { return arr.pop(); }`);
  }
  if (usedHelpers.has('__range__')) {
    helpers.push(`function __range__(start, end, step) { if (end === undefined) { end = start; start = 0; } step = step || 1; const r = []; for (let i = start; step > 0 ? i < end : i > end; i += step) r.push(i); return r; }`);
  }
  if (usedHelpers.has('__pow__')) {
    helpers.push(`function __pow__(base, exp) { return Math.pow(base, exp); }`);
  }
  if (usedHelpers.has('__charAt__')) {
    helpers.push(`function __charAt__(s, idx) { return String(s).charAt(idx); }`);
  }
  if (usedHelpers.has('__codePointAt__')) {
    helpers.push(`function __codePointAt__(s, idx) { return String(s).charCodeAt(idx); }`);
  }
  if (usedHelpers.has('__toString__')) {
    helpers.push(`function __toString__(v) { if (v === null || v === undefined) return 'null'; return String(v); }`);
  }
  if (usedHelpers.has('__replace__')) {
    helpers.push(`function __replace__(s, pattern, replacement) { return String(s).replace(new RegExp(pattern, 'g'), replacement); }`);
  }
  if (usedHelpers.has('__keys__')) {
    helpers.push(`function __keys__(obj) { if (Array.isArray(obj)) return [...obj.keys()]; if (typeof obj === 'string') return [...Array(obj.length).keys()]; return Object.keys(obj); }`);
  }
  if (usedHelpers.has('__type__')) {
    helpers.push(`function __type__(v) { if (v === null || v === undefined) return 'null'; if (Array.isArray(v)) return 'array'; if (v instanceof Map) return 'map'; if (v instanceof Set) return 'set'; if (typeof v === 'function') return 'function'; return typeof v; }`);
  }
  if (usedHelpers.has('__bool__')) {
    helpers.push(`function __bool__(v) { if (v === null || v === undefined || v === 0 || v === '' || v === false) return false; if (Array.isArray(v) && v.length === 0) return false; return true; }`);
  }
  if (usedHelpers.has('__random__')) {
    helpers.push(`function __random__(n) { return n !== undefined ? Math.floor(Math.random() * n) : Math.random(); }`);
  }
  if (usedHelpers.has('__includes__')) {
    helpers.push(`function __includes__(x, val) { if (typeof x === 'string') return x.includes(val); if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) { if (x[i] === val) return true; } return false; } return false; }`);
  }
  return helpers.join('\n');
}

export function compileToJS(source: string, options: any = {}): string {
  const program = parse(source);
  const memoizable = options.noMemo ? new Set<string>() : findMemoizableFunctions(program);
  const inlineable = findInlineableFunctions(program);
  const { locals: topLocals, reassignedVars: topReassigned, forInScopedVars: topForInScoped } = collectLocalVars(program.statements, [], new Set());
  const usedHelpers = new Set<string>();
  const helperOptions = Object.assign({}, options, { usedHelpers });
  let jsCode = '';
  jsCode += '// Generated by SeedLang Compiler\n';
  jsCode += '// Source: SeedLang -> JavaScript\n';
  
  if (options.runtime === 'web') {
    jsCode += '// Web Runtime\n';
  } else if (options.runtime === 'agent') {
    jsCode += '// Agent Runtime\n';
  } else if (options.runtime === 'game') {
    jsCode += '// Game Runtime\n';
  } else if (options.runtime === 'graphics') {
    jsCode += '// Graphics Runtime\n';
  }
  const constDecls: string[] = [];
  const letDecls: string[] = [];
  const memoDecls: string[] = [];
  for (const v of topLocals) {
    if (topReassigned.has(v)) {
      letDecls.push(v);
    } else {
      constDecls.push(v);
    }
  }
  for (const stmt of program.statements) {
    const s = stmt as any;
    if (s.type === 'FunctionDef' && memoizable.has(s.name)) {
      const memoVar = `__memo_${s.name}`;
      if (s.params.length === 1) {
        memoDecls.push(`let ${memoVar} = [];`);
      } else {
        memoDecls.push(`let ${memoVar} = new Map();`);
      }
    }
  }
  if (memoDecls.length > 0) {
    jsCode += memoDecls.join('\n') + '\n';
  }
  if (constDecls.length > 0 || letDecls.length > 0) {
    const allDecls = [...constDecls, ...letDecls];
    jsCode += `let ${allDecls.join(', ')};\n`;
  }

  for (const stmt of program.statements) {
    const optsWithInline = Object.assign({}, helperOptions, { inlineable, declaredLocals: topLocals, forInScopedVars: topForInScoped, outerLocals: new Set(topLocals) });
    jsCode += compileStatement(stmt, optsWithInline, 0, memoizable, null, inlineable);
  }

  const helperCode = generateRuntimeHelpers(usedHelpers);
  if (helperCode) {
    jsCode = helperCode + '\n' + jsCode;
  }
  
  if (options.minify) {
    jsCode = jsCode
      .replace(/\/\/.*$/gm, '')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }
  jsCode = jsCode.replace(/(\w+) = \[\];\n(\s*)\1\.length = ([^;]+);/g, '$2$1 = new Array($3);');
  jsCode = jsCode.replace(/((?:let|const) [^;]*?)(\w+) = \[\]([^;\n]*;)\n((?:[^\n]*\n)*?)(\s*)\2\.length = ([^;]+);/g, (match, before, arrName, after, middle, _indent, sizeExpr) => {
    if (after.includes(arrName) || middle.includes(arrName + ' =') || middle.includes(arrName + '[')) {
      return match;
    }
    return `${before}${arrName} = new Array(${sizeExpr})${after}\n${middle}`;
  });
  jsCode = jsCode.replace(/for \(([^;]+); \(([^()]+)\); ([^)]+)\)/g, 'for ($1; $2; $3)');
  jsCode = jsCode.replace(/while \(\((.+)\)\)/g, 'while ($1)');
  jsCode = jsCode.replace(/(\w+) \+= \(([^()]+)\);/g, '$1 += $2;');
  jsCode = jsCode.replace(/if \(\((.+)\)\)/g, 'if ($1)');
  jsCode = jsCode.replace(/return \(([^()]+)\);/g, 'return $1;');
  jsCode = jsCode.replace(/= \((\w+)\) ([+\-*/%|&]) \((\w+)\);/g, '= $1 $2 $3;');
  jsCode = jsCode.replace(/\((\w+)\) \* \((\w+)\)/g, '$1 * $2');
  jsCode = jsCode.replace(/\((\w+)\) \+ \((\w+)\)/g, '$1 + $2');
  jsCode = jsCode.replace(/\((\w+)\) - \((\w+)\)/g, '$1 - $2');
  jsCode = jsCode.replace(/\((\w+) \* (\w+)\) ([+\-]) (\w+)/g, '$1 * $2 $3 $4');
  jsCode = jsCode.replace(/\((\w+) ([+\-*/]) (\w+)\) ([+\-*/&|]) (\w+)/g, (m, a, op1, b, op2, c) => {
    const prec: Record<string, number> = { '*': 5, '/': 5, '%': 5, '+': 4, '-': 4, '&': 2, '|': 1 };
    if ((prec[op1] || 0) >= (prec[op2] || 0)) return `${a} ${op1} ${b} ${op2} ${c}`;
    return m;
  });
  jsCode = jsCode.replace(/if \(([^{]+)\) \{\n(\s+)(\w[^\n]+;)\n(\s+)\}\n/g, (m, cond, _sp1, stmt, _sp2) => {
    if (stmt.includes('\n') || stmt.includes('if ') || stmt.includes('for ')) return m;
    return `if (${cond}) ${stmt.trimEnd()}\n`;
  });
  jsCode = jsCode.replace(/(\w+) \+= \((\w+) ([+\-*/&|]) (\w+) ([+\-*/&|]) (\w+)\);/g, (m, v, a, op1, b, op2, c) => {
    const prec: Record<string, number> = { '*': 5, '/': 5, '%': 5, '+': 4, '-': 4, '&': 2, '|': 1 };
    if ((prec[op1] || 0) >= (prec[op2] || 0)) return `${v} += ${a} ${op1} ${b} ${op2} ${c};`;
    return m;
  });
  jsCode = jsCode.replace(/= \((\w+) ([+\-*/%]) (\w+)\);/g, '= $1 $2 $3;');
  jsCode = jsCode.replace(/return \((\w+) ([+\-*/%]) (\w+)\);/g, 'return $1 $2 $3;');

  return jsCode;
}

function hasTopLevelJumpInBody(body: any[]): { hasContinue: boolean, hasBreak: boolean } {
  let hasContinue = false, hasBreak = false;
  const loopTypes = new Set(['ForIn', 'ForStmt', 'For', 'WhileStmt', 'While']);
  function walk(stmts: any[], top: boolean) {
    for (const s of stmts) {
      const t = s.type;
      if (t === 'ContinueStmt' || t === 'ContinueStatement' || t === 'Continue') hasContinue = true;
      if (t === 'BreakStmt' || t === 'BreakStatement' || t === 'Break') hasBreak = true;
      if (!top || loopTypes.has(t)) continue;
      for (const k of ['body', 'thenBranch', 'elseBranch', 'then', 'alt']) {
        const b = (s as any)[k];
        if (Array.isArray(b)) walk(b, true);
      }
    }
  }
  walk(body, true);
  return { hasContinue, hasBreak };
}

let __forInExtractCounter = 0;

function compileStatement(stmt: any, options: any = {}, indent: number = 0, memoizable?: Set<string>, memoCtx?: any, inlineable?: Map<string, { params: string[], expr: any }>): string {
  const pad = '  '.repeat(indent);

  switch (stmt.type) {
    case 'Action':
      if (stmt.target && stmt.target.type === 'Assignment' && options.initExprs) {
        const t = stmt.target.target || stmt.target.left;
        const v = stmt.target.value || stmt.target.right;
        const tName = t && t.type === 'Identifier' ? t.name : (typeof t === 'string' ? t : null);
        if (tName && options.initExprs.has(tName) && options.initExprs.get(tName) === v) {
          return '';
        }
      }
      return pad + compileExpr(stmt.target, options) + ';\n';
    
    case 'Declaration':
      // Declaration 结构: { prefix, verb, object: { type: "Assignment", target, value } }
      const declObject = stmt.object;
      if (declObject && declObject.type === 'Assignment') {
        const declName = declObject.target?.name || 'unknown';
        const declValue = compileExpr(declObject.value, options);
        const declKeyword = stmt.prefix === '!c' || stmt.prefix === '' ? 'const' : 'let';
        return pad + `${declKeyword} ${declName} = ${declValue};\n`;
      }
      // 旧格式: BinaryOp with '>' operator
      if (declObject && declObject.type === 'BinaryOp' && declObject.operator === '>') {
        const declName = declObject.left?.name || 'unknown';
        const declValue = compileExpr(declObject.right, options);
        const declKeyword = stmt.prefix === '!c' || stmt.prefix === '' ? 'const' : 'let';
        return pad + `${declKeyword} ${declName} = ${declValue};\n`;
      }
      // 其他 Declaration 情况
      return pad + `// Unknown Declaration format\n`;
    
    case 'ExpressionStmt':
      return pad + compileExpr(stmt.expression, options) + ';\n';
    case 'VarDecl':
      if (options.declaredLocals && options.declaredLocals.has(stmt.name)) {
        return pad + `${stmt.name} = ${compileExpr(stmt.value, options)};\n`;
      }
      return pad + `let ${stmt.name} = ${compileExpr(stmt.value, options)};\n`;
    case 'FunctionDef':
      if (memoizable && memoizable.has(stmt.name)) {
        const memoVar = `__memo_${stmt.name}`;
        const params = stmt.params.join(', ');
        const isSingleParam = stmt.params.length === 1;
        const keyExpr = isSingleParam ? stmt.params[0] : `JSON.stringify([${params}])`;
        const currentOuter = new Set<string>([...(options.outerLocals || [])]);
        stmt.params.forEach((p: string) => currentOuter.add(p));
        const { locals: localVars, forInScopedVars: funcForInScoped } = collectLocalVars(stmt.body, stmt.params, currentOuter);
        let fnCode: string;
        if (isSingleParam) {
          fnCode = `${pad}function ${stmt.name}(${params}) {\n`;
          fnCode += `${pad}  if (${stmt.params[0]} >= 0 && ${stmt.params[0]} in ${memoVar}) return ${memoVar}[${stmt.params[0]}];\n`;
        } else {
          fnCode = `${pad}function ${stmt.name}(${params}) {\n`;
          fnCode += `${pad}  const __key = ${keyExpr};\n`;
          fnCode += `${pad}  if (${memoVar}.has(__key)) return ${memoVar}.get(__key);\n`;
        }
        if (localVars.size > 0) {
          fnCode += `${pad}  let ${[...localVars].join(', ')};\n`;
        }
        const innerMemoCtx = { memoVar, keyExpr: isSingleParam ? stmt.params[0] : '__key', isArray: isSingleParam, counter: 0 };
        const nextOuter = new Set<string>([...currentOuter, ...localVars]);
        const innerOpts = Object.assign({}, options, { declaredLocals: localVars, outerLocals: nextOuter, forInScopedVars: funcForInScoped });
        stmt.body.forEach((s: any) => {
          fnCode += compileStatement(s, innerOpts, indent + 1, memoizable, innerMemoCtx, inlineable);
        });
        fnCode += `${pad}}\n`;
        return fnCode;
      }
      {
        const currentOuter = new Set<string>([...(options.outerLocals || [])]);
        stmt.params.forEach((p: string) => currentOuter.add(p));
        const { locals: localVars, forInScopedVars: funcForInScoped } = collectLocalVars(stmt.body, stmt.params, currentOuter);
        let fnCode = `${pad}function ${stmt.name}(${stmt.params.join(', ')}) {\n`;
        if (localVars.size > 0) {
          fnCode += `${pad}  let ${[...localVars].join(', ')};\n`;
        }
        const nextOuter = new Set<string>([...currentOuter, ...localVars]);
        const innerOpts = Object.assign({}, options, { declaredLocals: localVars, outerLocals: nextOuter, forInScopedVars: funcForInScoped });
        stmt.body.forEach((s: any) => {
          fnCode += compileStatement(s, innerOpts, indent + 1, memoizable, null, inlineable);
        });
        fnCode += `${pad}}\n`;
        return fnCode;
      }

    case 'IfStmt':
    case 'If':
      let ifCode = `${pad}if (${compileExpr(stmt.condition, options)}) {\n`;
      stmt.thenBranch.forEach((s: any) => {
        ifCode += compileStatement(s, options, indent + 1, memoizable, memoCtx, inlineable);
      });
      if (stmt.elseBranch && stmt.elseBranch.length > 0) {
        ifCode += `${pad}} else {\n`;
        stmt.elseBranch.forEach((s: any) => {
          ifCode += compileStatement(s, options, indent + 1, memoizable, memoCtx, inlineable);
        });
      }
      ifCode += `${pad}}\n`;
      return ifCode;

    case 'WhileStmt':
    case 'While':
      let whileCode = `${pad}while (${compileExpr(stmt.condition, options)}) {\n`;
      const whileBodyOpts = (options.forInBodyLoopDepth !== undefined)
        ? Object.assign({}, options, { forInBodyLoopDepth: options.forInBodyLoopDepth + 1 })
        : options;
      stmt.body.forEach((s: any) => {
        whileCode += compileStatement(s, whileBodyOpts, indent + 1, memoizable, memoCtx, inlineable);
      });
      whileCode += `${pad}}\n`;
      return whileCode;

    case 'ForStmt':
    case 'For':
      let forInit: string;
      if (stmt.init) {
        let initNode = stmt.init;
        if (initNode.type === 'Action' && initNode.target) initNode = initNode.target;
        if (initNode.type === 'VarDecl') {
          forInit = `let ${initNode.name} = ${compileExpr(initNode.value, options)}`;
        } else if (initNode.type === 'Assignment' || initNode.type === 'Assign') {
          const t = initNode.target || initNode.left;
          const v = initNode.value || initNode.right;
          const tName = t && t.type === 'Identifier' ? t.name : (typeof t === 'string' ? t : null);
          if (tName) {
            forInit = `let ${tName} = ${compileExpr(v, options)}`;
          } else {
            forInit = compileStatement(stmt.init, options, 0, memoizable, memoCtx, inlineable).trim().replace(/;$/, '');
          }
        } else {
          forInit = compileStatement(stmt.init, options, 0, memoizable, memoCtx, inlineable).trim().replace(/;$/, '');
        }
      } else {
        forInit = '';
      }
      let forCond = stmt.condition ? compileExpr(stmt.condition, options) : '';
      let forUpdate: string;
      if (stmt.update) {
        let updNode = stmt.update;
        if (updNode.type === 'Action' && updNode.target) updNode = updNode.target;
        if (updNode.type === 'Assignment' || updNode.type === 'Assign') {
          const t = updNode.target || updNode.left;
          const v = updNode.value || updNode.right;
          const tName = t && t.type === 'Identifier' ? t.name : (typeof t === 'string' ? t : null);
          if (tName && v && v.type === 'BinaryOp' && (v.operator === '+' || v.operator === '-')) {
            const vLeftName = v.left && v.left.type === 'Identifier' ? v.left.name : null;
            if (vLeftName === tName && v.right && v.right.type === 'NumberLiteral' && v.right.value === 1) {
              forUpdate = `${tName}${v.operator === '+' ? '++' : '--'}`;
            } else {
              forUpdate = compileStatement(stmt.update, options, 0, memoizable, memoCtx, inlineable).trim().replace(/;$/, '');
            }
          } else {
            forUpdate = compileStatement(stmt.update, options, 0, memoizable, memoCtx, inlineable).trim().replace(/;$/, '');
          }
        } else {
          forUpdate = compileStatement(stmt.update, options, 0, memoizable, memoCtx, inlineable).trim().replace(/;$/, '');
        }
      } else {
        forUpdate = '';
      }
      let forCode: string;
      if (stmt.body.length === 1) {
        const bodyStmt = stmt.body[0];
        const callNode = bodyStmt.type === 'Action' && bodyStmt.action === 'expr' && bodyStmt.target ? bodyStmt.target : null;
        if (callNode && (callNode.type === 'CallExpr' || callNode.type === 'Call')) {
          const callee = callNode.callee;
          const callArgs = callNode.arguments || callNode.args || [];
          let pushArrName: string | null = null, pushIdxName: string | null = null, pushValExpr: any = null;
          if (callee && callee.type === 'Member' && callee.property === 'push') {
            pushArrName = callee.object && callee.object.type === 'Identifier' ? callee.object.name : null;
            if (callArgs[0]) {
              pushIdxName = callArgs[0].type === 'Identifier' ? callArgs[0].name : null;
              pushValExpr = callArgs[0];
            }
          }
          else if (callee && callee.type === 'Identifier' && callee.name === 'push' && callArgs.length >= 2) {
            pushArrName = callArgs[0].type === 'Identifier' ? callArgs[0].name : null;
            pushIdxName = callArgs[1].type === 'Identifier' ? callArgs[1].name : null;
            pushValExpr = callArgs[1];
          }
          if (pushArrName && pushIdxName) {
            const condNode = stmt.condition;
            if (condNode && condNode.type === 'BinaryOp' && (condNode.operator === '<' || condNode.operator === '<=')) {
              const condLeftName = condNode.left && condNode.left.type === 'Identifier' ? condNode.left.name : null;
              if (condLeftName === pushIdxName) {
                const condRight = condNode.right;
                const nExpr = compileExpr(condRight, options);
                forCode = `${pad}${pushArrName}.length = ${nExpr};\n`;
                forCode += `${pad}for (${forInit}; ${forCond}; ${forUpdate}) {\n`;
                forCode += `${pad}  ${pushArrName}[${pushIdxName}] = ${compileExpr(pushValExpr, options)};\n`;
                forCode += `${pad}}\n`;
                return forCode;
              }
            }
          }
        }
        {
          const bodyAssign = bodyStmt.type === 'Action' && bodyStmt.action === 'expr' && bodyStmt.target ? bodyStmt.target : null;
          if (bodyAssign && bodyAssign.type === 'Assignment') {
            const bTarget = bodyAssign.target || bodyAssign.left;
            const bValue = bodyAssign.value || bodyAssign.right;
            let idxArrName: string | null = null, idxVarName: string | null = null;
            if (bTarget && bTarget.type === 'IndexAccess' && bTarget.object && bTarget.object.type === 'Identifier' && bTarget.index && bTarget.index.type === 'Identifier') {
              idxArrName = bTarget.object.name;
              idxVarName = bTarget.index.name;
            } else if (bTarget && (bTarget.type === 'Index' || bTarget.type === 'Subscript') && bTarget.object && bTarget.object.type === 'Identifier' && (bTarget.index || bTarget.property) && (bTarget.index || bTarget.property).type === 'Identifier') {
              idxArrName = bTarget.object.name;
              idxVarName = (bTarget.index || bTarget.property).name;
            } else if (bTarget && bTarget.type === 'Member' && bTarget.computed && bTarget.object && bTarget.object.type === 'Identifier' && bTarget.property && bTarget.property.type === 'Identifier') {
              idxArrName = bTarget.object.name;
              idxVarName = bTarget.property.name;
            }
            if (idxArrName && idxVarName) {
              const condNode = stmt.condition;
              if (condNode && condNode.type === 'BinaryOp' && (condNode.operator === '<' || condNode.operator === '<=')) {
                const condLeftName = condNode.left && condNode.left.type === 'Identifier' ? condNode.left.name : null;
                if (condLeftName === idxVarName) {
                  const condRight = condNode.right;
                  const nExpr = compileExpr(condRight, options);
                  forCode = `${pad}${idxArrName}.length = ${nExpr};\n`;
                  forCode += `${pad}for (${forInit}; ${forCond}; ${forUpdate}) {\n`;
                  forCode += `${pad}  ${idxArrName}[${idxVarName}] = ${compileExpr(bValue, options)};\n`;
                  forCode += `${pad}}\n`;
                  return forCode;
                }
              }
            }
          }
        }
      }
      forCode = `${pad}for (${forInit}; ${forCond}; ${forUpdate}) {\n`;
      const forBodyOpts = (options.forInBodyLoopDepth !== undefined)
        ? Object.assign({}, options, { forInBodyLoopDepth: options.forInBodyLoopDepth + 1 })
        : options;
      stmt.body.forEach((s: any) => {
        forCode += compileStatement(s, forBodyOpts, indent + 1, memoizable, memoCtx, inlineable);
      });
      forCode += `${pad}}\n`;
      return forCode;

    case 'ForIn':
      const forInVar = stmt.variable || 'item';
      const forInIterable = compileExpr(stmt.iterable, options);
      const forInScoped = options.forInScopedVars;
      const shouldExtract = forInScoped && forInScoped.size > 0 && hasLoopInBody(stmt.body);
      if (shouldExtract) {
        const extractFnName = `__forIn_${++__forInExtractCounter}`;
        const innerOpts: any = Object.assign({}, options, { declaredLocals: new Set(options.declaredLocals || []), initExprs: new Map(options.initExprs || []), forInScopedVars: new Set() });
        const jumps = hasTopLevelJumpInBody(stmt.body);
        if (jumps.hasContinue || jumps.hasBreak) {
          innerOpts.forInBodyLoopDepth = 0;
        }
        const forInDeclared = new Set<string>();
        let emitCall: any = null;
        let timestampVar: string | null = null;
        for (const s of stmt.body) {
          if (s.type === 'Action' && s.target && s.target.type === 'Call' && s.target.callee && s.target.callee.name === 'emit') {
            emitCall = s.target;
          }
          if (s.type === 'Action' && s.target && s.target.type === 'Assignment' && s.target.value && s.target.value.type === 'Call' && s.target.value.callee && s.target.value.callee.name === 'timestamp') {
            timestampVar = s.target.target.name;
          }
        }
        const emitArgs = emitCall ? emitCall.args : [];
        const returnVars: string[] = [];
        for (const arg of emitArgs) {
          if (arg.type === 'Identifier' && arg.name !== forInVar && arg.name !== timestampVar) {
            returnVars.push(arg.name);
          }
        }
        let fnBody = '';
        for (const s of stmt.body) {
          if (emitCall && s.type === 'Action' && s.target === emitCall) continue;
          if (timestampVar && s.type === 'Action' && s.target && s.target.type === 'Assignment' && s.target.target && s.target.target.name === timestampVar) continue;
          let sCode = compileStatement(s, innerOpts, 1, memoizable, memoCtx, inlineable);
          if (s.type === 'Action' && s.target && s.target.type === 'Assignment') {
            const t = s.target.target || s.target.left;
            const v = s.target.value || s.target.right;
            const tName = t && t.type === 'Identifier' ? t.name : (typeof t === 'string' ? t : null);
            if (tName && !forInDeclared.has(tName) && forInScoped.has(tName)) {
              forInDeclared.add(tName);
              sCode = `  let ${tName} = ${compileExpr(v, innerOpts)};\n`;
            }
          }
          fnBody += sCode;
        }
        let forInCode = `${pad}function ${extractFnName}(${forInVar}) {\n`;
        forInCode += fnBody;
        if (returnVars.length > 0) {
          forInCode += `${pad}  return { ${returnVars.join(', ')} };\n`;
        }
        forInCode += `${pad}}\n`;
        forInCode += `${pad}for (const ${forInVar} of ${forInIterable}) {\n`;
        if (emitCall && returnVars.length > 0) {
          if (timestampVar) {
            forInCode += `${pad}  const ${timestampVar} = performance.now();\n`;
          }
          forInCode += `${pad}  const __r = ${extractFnName}(${forInVar});\n`;
          if (jumps.hasBreak) {
            forInCode += `${pad}  if (__r === '__$forInBreak$__') break;\n`;
          }
          const emitArgExprs = emitArgs.map((arg: any) => {
            if (arg.type === 'Identifier' && returnVars.includes(arg.name)) return `__r.${arg.name}`;
            if (arg.type === 'Identifier' && arg.name === timestampVar) return timestampVar;
            return compileExpr(arg, innerOpts);
          }).join(', ');
          forInCode += `${pad}  emit(${emitArgExprs});\n`;
        } else if (returnVars.length > 0) {
          forInCode += `${pad}  const __r = ${extractFnName}(${forInVar});\n`;
          if (jumps.hasBreak) {
            forInCode += `${pad}  if (__r === '__$forInBreak$__') break;\n`;
          }
        } else {
          if (jumps.hasBreak) {
            forInCode += `${pad}  const __r = ${extractFnName}(${forInVar});\n`;
            forInCode += `${pad}  if (__r === '__$forInBreak$__') break;\n`;
          } else {
            forInCode += `${pad}  ${extractFnName}(${forInVar});\n`;
          }
        }
        forInCode += `${pad}}\n`;
        return forInCode;
      }
      let forInCode = `${pad}for (const ${forInVar} of ${forInIterable}) {\n`;
      const forInDeclared = new Set<string>();
      const forInBody: string[] = [];
      const forInBodyOpts2 = (options.forInBodyLoopDepth !== undefined)
        ? Object.assign({}, options, { forInBodyLoopDepth: options.forInBodyLoopDepth + 1 })
        : options;
      for (const s of stmt.body) {
        let sCode = compileStatement(s, forInBodyOpts2, indent + 1, memoizable, memoCtx, inlineable);
        if (s.type === 'Action' && s.target && s.target.type === 'Assignment') {
          const t = s.target.target || s.target.left;
          const v = s.target.value || s.target.right;
          const tName = t && t.type === 'Identifier' ? t.name : (typeof t === 'string' ? t : null);
          if (tName && !forInDeclared.has(tName) && !(options.declaredLocals && options.declaredLocals.has(tName)) && forInScoped && forInScoped.has(tName)) {
            forInDeclared.add(tName);
            sCode = `${pad}  let ${tName} = ${compileExpr(v, options)};\n`;
          }
        }
        forInBody.push(sCode);
      }
      forInCode += forInBody.join('');
      forInCode += `${pad}}\n`;
      return forInCode;

    case 'ReturnStmt':
    case 'Return':
      if (memoCtx) {
        const expr = compileExpr(stmt.value, options);
        const tempVar = `__t${memoCtx.counter++}`;
        let retCode = `${pad}const ${tempVar} = ${expr};\n`;
        if (memoCtx.isArray) {
          retCode += `${pad}${memoCtx.memoVar}[${memoCtx.keyExpr}] = ${tempVar};\n`;
        } else {
          retCode += `${pad}${memoCtx.memoVar}.set(${memoCtx.keyExpr}, ${tempVar});\n`;
        }
        retCode += `${pad}return ${tempVar};\n`;
        return retCode;
      }
      return pad + `return ${compileExpr(stmt.value, options)};\n`;

    case 'BreakStmt':
    case 'BreakStatement':
    case 'Break':
      if (options.forInBodyLoopDepth === 0) {
        return pad + `return '__$forInBreak$__';\n`;
      }
      return pad + `break;\n`;

    case 'ContinueStmt':
    case 'ContinueStatement':
    case 'Continue':
      if (options.forInBodyLoopDepth === 0) {
        return pad + `return;\n`;
      }
      return pad + `continue;\n`;

    case 'TryStmt':
    case 'Try':
      const tryBody = stmt.tryBlock || stmt.body || [];
      const catchBody = stmt.catchBlock || stmt.catchClause?.body || [];
      const catchVar = stmt.catchVar || stmt.catchClause?.param || 'e';
      const finallyBody = stmt.finallyBlock || [];
      let tryCode = `${pad}try {\n`;
      tryBody.forEach((s: any) => {
        tryCode += compileStatement(s, options, indent + 1, memoizable, memoCtx, inlineable);
      });
      if (catchBody.length > 0 || stmt.catchClause || stmt.catchBlock) {
        tryCode += `${pad}} catch (${catchVar}) {\n`;
        catchBody.forEach((s: any) => {
          tryCode += compileStatement(s, options, indent + 1, memoizable, memoCtx, inlineable);
        });
      }
      if (finallyBody.length > 0) {
        tryCode += `${pad}} finally {\n`;
        finallyBody.forEach((s: any) => {
          tryCode += compileStatement(s, options, indent + 1, memoizable, memoCtx, inlineable);
        });
      }
      tryCode += `${pad}}\n`;
      return tryCode;
    case 'ThrowStmt':
    case 'Throw':
      return pad + `throw ${compileExpr(stmt.value, options)};\n`;
    case 'YieldStmt':
    case 'Yield':
      return pad + `yield ${compileExpr(stmt.value, options)};\n`;

    default:
      return pad + `// Unknown: ${stmt.type}\n`;
  }
}

const COMPOUND_GROUPS: Record<string, string> = {
  '+': '+', '-': '-', '*': '*', '/': '/', '%': '%',
};

function extractCompoundChain(expr: any, targetName: string): { op: string, rest: string } | null {
  if (!expr || expr.type !== 'BinaryOp') return null;
  const op = COMPOUND_GROUPS[expr.operator];
  if (!op) return null;
  const leftName = expr.left && expr.left.type === 'Identifier' ? expr.left.name : null;
  if (leftName === targetName) {
    const rest = compileExpr(expr.right, __extractOptions);
    return { op, rest };
  }
  const leftChain = extractCompoundChain(expr.left, targetName);
  if (leftChain) {
    const sameGroup = (leftChain.op === op) ||
      (leftChain.op === '+' && op === '-') || (leftChain.op === '-' && op === '+') ||
      (leftChain.op === '*' && op === '/') || (leftChain.op === '/' && op === '*');
    if (sameGroup) {
      const rightCompiled = compileExpr(expr.right, __extractOptions);
      return { op: leftChain.op, rest: `${leftChain.rest} ${expr.operator === '-' ? '-' : '+'} ${rightCompiled}` };
    }
  }
  return null;
}

let __extractOptions: any = {};

function compileExpr(expr: any, options: any = {}): string {
  if (!expr) return 'null';
  __extractOptions = options;

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
      return `[${elements.map((e: any) => compileExpr(e, options)).join(', ')}]`;
    case 'ObjectLiteral':
    case 'Object':
      const objEntries: string[] = [];
      
      if (expr.entries && Array.isArray(expr.entries)) {
        for (const entry of expr.entries) {
          if (entry.kind === 'property') {
            const key = entry.key;
            const value = compileExpr(entry.value, options);
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
              objEntries.push(`${key}: ${value}`);
            } else {
              objEntries.push(`${JSON.stringify(key)}: ${value}`);
            }
          } else if (entry.kind === 'spread') {
            objEntries.push(`...${compileExpr(entry.value, options)}`);
          }
        }
      } else if (expr.properties) {
        if (expr.properties instanceof Map) {
          expr.properties.forEach((value: any, key: string) => {
            const compiledValue = compileExpr(value, options);
            if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
              objEntries.push(`${key}: ${compiledValue}`);
            } else {
              objEntries.push(`${JSON.stringify(key)}: ${compiledValue}`);
            }
          });
        } else if (typeof expr.properties === 'object') {
          Object.entries(expr.properties).forEach(([k, v]) => {
            objEntries.push(`${JSON.stringify(k)}: ${compileExpr(v as any, options)}`);
          });
        }
      }
      
      if (objEntries.length === 0) {
        return '{}';
      }
      return `{ ${objEntries.join(', ')} }`;
    case 'BinaryExpr':
    case 'Binary':
    case 'BinaryOp':
      const isNullCheck = (expr.operator === '==' || expr.operator === '!=') &&
                          expr.right && expr.right.type === 'NullLiteral';
      const binOp = expr.operator === '==' ? (isNullCheck ? '==' : '===') : 
                    expr.operator === '!=' ? (isNullCheck ? '!=' : '!==') : 
                    expr.operator;
      if (binOp === '%') {
        const rightNum = expr.right && expr.right.type === 'NumberLiteral' ? expr.right.value : null;
        if (rightNum !== null && rightNum > 0 && (rightNum & (rightNum - 1)) === 0) {
          return `(${compileExpr(expr.left, options)} & ${rightNum - 1})`;
        }
      }
      if (binOp === '/' || binOp === '*') {
        const leftNum = expr.left && expr.left.type === 'NumberLiteral' ? expr.left.value : null;
        const rightNum = expr.right && expr.right.type === 'NumberLiteral' ? expr.right.value : null;
        if (leftNum !== null && rightNum !== null) {
          const result = binOp === '*' ? leftNum * rightNum : leftNum / rightNum;
          if (Number.isFinite(result) && Number.isInteger(result)) {
            return String(result);
          }
        }
      }
      return `(${compileExpr(expr.left, options)} ${binOp} ${compileExpr(expr.right, options)})`;
    case 'UnaryExpr':
    case 'Unary':
      if (expr.operator === 'not') {
        return `(!${compileExpr(expr.operand || expr.argument, options)})`;
      }
      return `${expr.operator}${compileExpr(expr.operand || expr.argument, options)}`;
    case 'CallExpr':
    case 'Call':
      const callArgs = expr.arguments || expr.args || [];
      let callee: string;
      if (expr.callee.type === 'Member') {
        callee = `${compileExpr(expr.callee.object, options)}.${expr.callee.property}`;
      } else if (expr.callee.type === 'Identifier') {
        callee = expr.callee.name;
      } else {
        callee = compileExpr(expr.callee, options);
      }
      
      if (expr.callee.type === 'Identifier' && options.inlineable && options.inlineable.has(callee)) {
        const info = options.inlineable.get(callee);
        if (info && callArgs.length === info.params.length) {
          const paramMap: Record<string, string> = {};
          info.params.forEach((p: string, i: number) => {
            paramMap[p] = compileExpr(callArgs[i], options);
          });
          const optsNoInline = Object.assign({}, options, { inlineable: new Map() });
          let inlined = compileExpr(info.expr, optsNoInline);
          for (const [param, compiled] of Object.entries(paramMap)) {
            inlined = inlined.replace(new RegExp(`\\b${param}\\b`, 'g'), `(${compiled})`);
          }
          while (inlined.startsWith('((') && inlined.endsWith('))')) {
            inlined = inlined.slice(1, -1);
          }
          return inlined;
        }
      }
      
      const args = callArgs.map((a: any) => compileExpr(a, options)).join(', ');
      
      // 内置函数映射
      const builtinMap: Record<string, string> = {
        'print': 'console.log',
        'gui.alert': 'alert',
        'gui.prompt': 'prompt',
        'gui.confirm': 'confirm',
        'gui.table': 'console.table',
        'gui.progress': 'console.log',
        'gui.clear': 'console.clear',
        'len': '__len__',
        'push': '__push__',
        'reserve': '__reserve__',
        'withCapacity': '__withCapacity__',
        'pop': '__pop__',
        'range': '__range__',
        'pow': '__pow__',
        'toString': 'String',
        'str': 'String',
        'int': 'parseInt',
        'float': 'parseFloat',
        'upper': '__upper__',
        'lower': '__lower__',
        'trim': '__trim__',
        'split': '__split__',
        'join': '__join__',
        'replace': '__replace__',
        'map': '__map__',
        'filter': '__filter__',
        'reduce': '__reduce__',
        'find': '__find__',
        'keys': '__keys__',
        'values': 'Object.values',
        'type': '__type__',
        'typeOf': 'typeof',
        'bool': '__bool__',
        'abs': 'Math.abs',
        'floor': 'Math.floor',
        'ceil': 'Math.ceil',
        'round': 'Math.round',
        'sqrt': 'Math.sqrt',
        'sin': 'Math.sin',
        'cos': 'Math.cos',
        'tan': 'Math.tan',
        'min': 'Math.min',
        'max': 'Math.max',
        'random': 'Math.random',
        'timestamp': 'performance.now',
        'time': 'performance.now',
        'mapSet': '__mapSet__',
        'mapGet': '__mapGet__',
        'mapHas': '__mapHas__',
        'mapDelete': '__mapDelete__',
        'mapKeys': '__mapKeys__',
        'mapValues': '__mapValues__',
        'mapEntries': '__mapEntries__',
        'mapSize': '__mapSize__',
        'mapClear': '__mapClear__',
        'set': '__set__',
        'setAdd': '__setAdd__',
        'setHas': '__setHas__',
        'setDelete': '__setDelete__',
        'setSize': '__setSize__',
        'setToArray': '__setToArray__',
        'setClear': '__setClear__',
        'args': '(() => process.argv.slice(1))',
        'readFile': '((p) => require("fs").readFileSync(p, "utf8"))',
        'writeFile': '((p, c) => require("fs").writeFileSync(p, c))',
        'charAt': '__charAt__',
        'codePointAt': '__codePointAt__',
        'substring': '__substring__',
        'includes': '__includes__',
        'exit': 'process.exit',
      };
      
      const mappedCallee = builtinMap[callee];
      if (mappedCallee) {
        callee = mappedCallee;
      }
      if (callee === 'Math.floor' && callArgs.length === 1) {
        const arg = callArgs[0];
        if (arg && arg.type === 'BinaryOp' && (arg.operator === '/' || arg.operator === '*')) {
          return `((${compileExpr(arg.left, options)} ${arg.operator} ${compileExpr(arg.right, options)}) | 0)`;
        }
        return `((${compileExpr(callArgs[0], options)}) | 0)`;
      }
      if (callee === '__len__') {
        const arg0 = compileExpr(callArgs[0], options);
        if (options.usedHelpers) options.usedHelpers.add('__len__');
        return `__len__(${arg0})`;
      }
      if (callee === '__push__') {
        if (options.usedHelpers) options.usedHelpers.add('__push__');
        return `__push__(${callArgs.map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__reserve__') {
        if (options.usedHelpers) options.usedHelpers.add('__reserve__');
        return `__reserve__(${callArgs.map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__withCapacity__') {
        if (options.usedHelpers) options.usedHelpers.add('__withCapacity__');
        return `__withCapacity__(${compileExpr(callArgs[0], options)})`;
      }
      if (callee === '__pop__') {
        if (options.usedHelpers) options.usedHelpers.add('__pop__');
        return `__pop__(${callArgs.map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__range__') {
        if (options.usedHelpers) options.usedHelpers.add('__range__');
        return `__range__(${callArgs.map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__pow__') {
        if (options.usedHelpers) options.usedHelpers.add('__pow__');
        return `__pow__(${callArgs.map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === 'String') {
        if (options.usedHelpers) options.usedHelpers.add('__toString__');
        return `__toString__(${compileExpr(callArgs[0], options)})`;
      }
      if (callee === '__upper__') {
        return `${compileExpr(callArgs[0], options)}.toUpperCase()`;
      }
      if (callee === '__lower__') {
        return `${compileExpr(callArgs[0], options)}.toLowerCase()`;
      }
      if (callee === '__trim__') {
        return `${compileExpr(callArgs[0], options)}.trim()`;
      }
      if (callee === '__split__') {
        return `${compileExpr(callArgs[0], options)}.split(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__join__') {
        return `${compileExpr(callArgs[0], options)}.join(${callArgs[1] ? compileExpr(callArgs[1], options) : ', '})`;
      }
      if (callee === '__map__') {
        if (callArgs.length <= 1) {
          return `new Map(${callArgs.length > 0 ? compileExpr(callArgs[0], options) : ''})`;
        }
        return `${compileExpr(callArgs[0], options)}.map(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__filter__') {
        return `${compileExpr(callArgs[0], options)}.filter(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__reduce__') {
        const reduceArgs = callArgs.length >= 3 
          ? `${compileExpr(callArgs[1], options)}, ${compileExpr(callArgs[2], options)}`
          : compileExpr(callArgs[1], options);
        return `${compileExpr(callArgs[0], options)}.reduce(${reduceArgs})`;
      }
      if (callee === '__find__') {
        return `${compileExpr(callArgs[0], options)}.find(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__mapSet__') {
        return `${compileExpr(callArgs[0], options)}.set(${callArgs.slice(1).map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__mapGet__') {
        return `${compileExpr(callArgs[0], options)}.get(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__mapHas__') {
        return `${compileExpr(callArgs[0], options)}.has(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__mapDelete__') {
        return `${compileExpr(callArgs[0], options)}.delete(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__mapKeys__') {
        return `[...${compileExpr(callArgs[0], options)}.keys()]`;
      }
      if (callee === '__mapValues__') {
        return `[...${compileExpr(callArgs[0], options)}.values()]`;
      }
      if (callee === '__mapEntries__') {
        return `[...${compileExpr(callArgs[0], options)}.entries()]`;
      }
      if (callee === '__mapSize__') {
        return `${compileExpr(callArgs[0], options)}.size`;
      }
      if (callee === '__mapClear__') {
        return `${compileExpr(callArgs[0], options)}.clear()`;
      }
      if (callee === '__set__') {
        return `new Set(${callArgs.length > 0 ? compileExpr(callArgs[0], options) : ''})`;
      }
      if (callee === '__setAdd__') {
        return `${compileExpr(callArgs[0], options)}.add(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__setHas__') {
        return `${compileExpr(callArgs[0], options)}.has(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__setDelete__') {
        return `${compileExpr(callArgs[0], options)}.delete(${compileExpr(callArgs[1], options)})`;
      }
      if (callee === '__setSize__') {
        return `${compileExpr(callArgs[0], options)}.size`;
      }
      if (callee === '__setToArray__') {
        return `[...${compileExpr(callArgs[0], options)}]`;
      }
      if (callee === '__setClear__') {
        return `${compileExpr(callArgs[0], options)}.clear()`;
      }
      if (callee === '__charAt__') {
        if (options.usedHelpers) options.usedHelpers.add('__charAt__');
        return `__charAt__(${callArgs.map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__codePointAt__') {
        if (options.usedHelpers) options.usedHelpers.add('__codePointAt__');
        return `__codePointAt__(${callArgs.map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__substring__') {
        return `${compileExpr(callArgs[0], options)}.substring(${callArgs.slice(1).map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__includes__') {
        if (options.usedHelpers) options.usedHelpers.add('__includes__');
        return `__includes__(${callArgs.map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__replace__') {
        if (options.usedHelpers) options.usedHelpers.add('__replace__');
        return `__replace__(${callArgs.map((a: any) => compileExpr(a, options)).join(', ')})`;
      }
      if (callee === '__keys__') {
        if (options.usedHelpers) options.usedHelpers.add('__keys__');
        return `__keys__(${compileExpr(callArgs[0], options)})`;
      }
      if (callee === '__type__') {
        if (options.usedHelpers) options.usedHelpers.add('__type__');
        return `__type__(${compileExpr(callArgs[0], options)})`;
      }
      if (callee === '__bool__') {
        if (options.usedHelpers) options.usedHelpers.add('__bool__');
        return `__bool__(${compileExpr(callArgs[0], options)})`;
      }
      if (callee === 'Math.random') {
        if (callArgs.length > 0) {
          if (options.usedHelpers) options.usedHelpers.add('__random__');
          return `__random__(${compileExpr(callArgs[0], options)})`;
        }
        return 'Math.random()';
      }

      return `${callee}(${args})`;
    case 'MemberAccess':
    case 'Member':
      if (expr.computed) {
        return `${compileExpr(expr.object, options)}[${compileExpr(expr.property, options)}]`;
      }
      return `${compileExpr(expr.object, options)}.${expr.property}`;
    case 'IndexAccess':
    case 'Index':
      return `${compileExpr(expr.object, options)}[${compileExpr(expr.index || expr.property, options)}]`;
    case 'ArrowFunction':
    case 'Arrow':
      const params = expr.params || [];
      const body = expr.body;
      if (body && body.type) {
        return `(${params.join(', ')}) => ${compileExpr(body, options)}`;
      }
      return `(${params.join(', ')}) => { /* ... */ }`;
    case 'Await':
    case 'AwaitExpression':
      return `await ${compileExpr(expr.expression || expr.argument, options)}`;
    case 'YieldExpr':
      return `yield ${compileExpr(expr.value, options)}`;
    case 'NewExpression':
      const newArgs = (expr.args || []).map((a: any) => compileExpr(a, options)).join(', ');
      return `new ${expr.className}(${newArgs})`;
    case 'Assignment':
      const assignTarget = expr.target || expr.left;
      const assignValue = expr.value || expr.right;
      if (assignTarget && typeof assignTarget === 'object') {
        const tName = assignTarget.type === 'Identifier' ? assignTarget.name : null;
        const tExpr = compileExpr(assignTarget, options);
        if (tName && assignValue && assignValue.type === 'BinaryOp') {
          if (assignValue.operator === '+' && assignValue.right && assignValue.right.type === 'NumberLiteral' && assignValue.right.value === 1) {
            const vLeftName = assignValue.left && assignValue.left.type === 'Identifier' ? assignValue.left.name : null;
            if (vLeftName === tName) return `${tName}++`;
          }
          if (assignValue.operator === '-' && assignValue.right && assignValue.right.type === 'NumberLiteral' && assignValue.right.value === 1) {
            const vLeftName = assignValue.left && assignValue.left.type === 'Identifier' ? assignValue.left.name : null;
            if (vLeftName === tName) return `${tName}--`;
          }
          const chain = extractCompoundChain(assignValue, tName);
          if (chain) {
            return `${tName} ${chain.op}= ${chain.rest}`;
          }
        }
        if (assignValue && assignValue.type === 'BinaryOp') {
          const aOp = assignValue.operator;
          if (aOp === '+' || aOp === '-' || aOp === '*' || aOp === '/' || aOp === '%') {
            const vLeftExpr = assignValue.left ? compileExpr(assignValue.left, options) : null;
            if (vLeftExpr === tExpr) {
              return `${tExpr} ${aOp}= ${compileExpr(assignValue.right, options)}`;
            }
          }
        }
        return `${compileExpr(assignTarget, options)} = ${compileExpr(assignValue, options)}`;
      }
      if (assignTarget && assignValue && assignValue.type === 'BinaryOp') {
        const tName = typeof assignTarget === 'string' ? assignTarget : null;
        if (tName) {
          if (assignValue.operator === '+' && assignValue.right && assignValue.right.type === 'NumberLiteral' && assignValue.right.value === 1) {
            const vLeftName = assignValue.left && assignValue.left.type === 'Identifier' ? assignValue.left.name : null;
            if (vLeftName === tName) return `${tName}++`;
          }
          if (assignValue.operator === '-' && assignValue.right && assignValue.right.type === 'NumberLiteral' && assignValue.right.value === 1) {
            const vLeftName = assignValue.left && assignValue.left.type === 'Identifier' ? assignValue.left.name : null;
            if (vLeftName === tName) return `${tName}--`;
          }
          const chain = extractCompoundChain(assignValue, tName);
          if (chain) {
            return `${tName} ${chain.op}= ${chain.rest}`;
          }
        }
      }
      return `${assignTarget} = ${compileExpr(assignValue, options)}`;
    case 'LogicalExpr':
    case 'Logical':
      const op = expr.operator === 'and' ? '&&' : 
                 expr.operator === 'or' ? '||' : expr.operator;
      return `(${compileExpr(expr.left, options)} ${op} ${compileExpr(expr.right, options)})`;
    case 'Conditional':
    case 'ConditionalExpr':
      return `(${compileExpr(expr.condition, options)} ? ${compileExpr(expr.consequent, options)} : ${compileExpr(expr.alternate, options)})`;
    default:
      return `/* unknown: ${expr.type} */`;
  }
}