/**
 * Declarative macro expansion for the canonical FullParser Program AST.
 * Hygiene: bindings introduced in the macro body are renamed; formal parameters substitute caller sites and may alias caller variables (see docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md §7.4).
 * Single source of truth (TypeScript). VM loads the compiled `dist/core/macro_expand.js` after `tsc`.
 * Procedural `proc_macro` call sites are left for the VM compiler / interpreter runtime.
 */

import type {
  ProgramNode,
  StatementNode,
  ExpressionNode,
  MacroDef,
  MacroCall,
  BlockStatement
} from './ast';

export const MAX_MACRO_EXPAND_DEPTH = 64;

type MacroRecord = {
  params: string[];
  body: StatementNode[];
  procedural: boolean;
};

type MacroScope = Map<string, MacroRecord>;

function cloneAst<T>(n: T): T {
  return JSON.parse(JSON.stringify(n)) as T;
}

function isIdent(node: any): boolean {
  return !!(node && (node.type === 'Identifier' || node.type === 'id' || node.type === 'identifier'));
}

class Counter {
  n = 0;
}

function collectInternalRenameMap(body: StatementNode[], params: string[], counter: Counter): Record<string, string> {
  const paramSet = new Set(params);
  const assigned = new Set<string>();

  function collect(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (node.type === 'Assignment' && node.target && isIdent(node.target)) {
      const name = node.target.name as string;
      if (name && !paramSet.has(name)) assigned.add(name);
    }
    if (node.type === 'VarDecl' && node.name) {
      if (!paramSet.has(node.name)) assigned.add(node.name);
    }
    if (node.type === 'ForIn' && node.variable) {
      if (!paramSet.has(node.variable)) assigned.add(node.variable);
    }
    if (node.type === 'FunctionDef' && node.name && !paramSet.has(node.name)) {
      assigned.add(node.name);
    }
    if (node.type === 'Action' && node.action === 'expr' && node.target?.type === 'Assignment') {
      const a = node.target;
      if (a.target && isIdent(a.target)) {
        const name = a.target.name as string;
        if (name && !paramSet.has(name)) assigned.add(name);
      }
    }
    for (const k of Object.keys(node)) {
      const v = (node as any)[k];
      if (v !== null && typeof v === 'object') collect(v);
    }
  }

  for (const st of body) collect(st);

  const rename: Record<string, string> = {};
  const c = ++counter.n;
  for (const v of assigned) {
    rename[v] = `__macro_${c}_${v}`;
  }
  return rename;
}

function renameInternals(node: any, map: Record<string, string>): any {
  if (Array.isArray(node)) return node.map((n) => renameInternals(n, map));
  if (!node || typeof node !== 'object') return node;

  if (isIdent(node) && node.name && map[node.name]) {
    return { ...node, name: map[node.name] };
  }
  if (node.type === 'ForIn' && node.variable && map[node.variable]) {
    const next = { ...node, variable: map[node.variable] };
    return walkRenameChildren(next, map);
  }
  if (node.type === 'VarDecl' && node.name && map[node.name]) {
    const next = { ...node, name: map[node.name] };
    return walkRenameChildren(next, map);
  }
  if (node.type === 'FunctionDef' && node.name && map[node.name]) {
    const next = { ...node, name: map[node.name] };
    return walkRenameChildren(next, map);
  }

  const result = { ...node };
  return walkRenameChildren(result, map);
}

function walkRenameChildren(node: any, map: Record<string, string>): any {
  for (const k of Object.keys(node)) {
    const v = (node as any)[k];
    if (v !== null && typeof v === 'object') {
      (node as any)[k] = renameInternals(v, map);
    }
  }
  return node;
}

function substitute(node: any, paramMap: Record<string, ExpressionNode | undefined>): any {
  if (Array.isArray(node)) return node.map((n) => substitute(n, paramMap));
  if (!node || typeof node !== 'object') return node;

  if (isIdent(node) && node.name != null && paramMap[node.name] !== undefined) {
    return cloneAst(paramMap[node.name]);
  }

  const result = { ...node };
  for (const k of Object.keys(result)) {
    const v = (result as any)[k];
    if (v !== null && typeof v === 'object') {
      (result as any)[k] = substitute(v, paramMap);
    }
  }
  return result;
}

function expandSubstitutionBody(macro: MacroRecord, call: MacroCall, counter: Counter): StatementNode[] {
  const body = cloneAst(macro.body);
  const paramMap: Record<string, ExpressionNode | undefined> = {};
  for (let i = 0; i < macro.params.length; i++) {
    paramMap[macro.params[i]] = call.args[i] ? cloneAst(call.args[i]) : ({ type: 'NullLiteral' } as ExpressionNode);
  }
  const internalMap = collectInternalRenameMap(body, macro.params, counter);
  let expanded = substitute(body, paramMap) as StatementNode[];
  if (Object.keys(internalMap).length > 0) {
    expanded = renameInternals(expanded, internalMap) as StatementNode[];
  }
  return expanded;
}

function lookupMacro(scope: MacroScope, name: string): MacroRecord | undefined {
  return scope.get(name);
}

function lastStmtToExpr(stmt: StatementNode): ExpressionNode | null {
  const s: any = stmt;
  if (s.type === 'Return' && s.value) return s.value as ExpressionNode;
  if (s.type === 'Action' && s.action === 'expr' && s.target) {
    return s.target as ExpressionNode;
  }
  if (s.type === 'Assignment') {
    return s as ExpressionNode;
  }
  return null;
}

type ExprT = { pre: StatementNode[]; expr: ExpressionNode };

function exprFromMacroExpansion(
  call: MacroCall,
  scope: MacroScope,
  depth: number,
  counter: Counter
): ExprT {
  const macro = lookupMacro(scope, call.name);
  if (!macro) {
    throw new Error(`Macro '${call.name}' is not defined`);
  }
  if (macro.procedural) {
    return { pre: [], expr: call as ExpressionNode };
  }
  const nextDepth = depth + 1;
  if (nextDepth > MAX_MACRO_EXPAND_DEPTH) {
    throw new Error(`Macro expansion depth exceeded (possible infinite recursion: ${call.name})`);
  }
  const inner = expandSubstitutionBody(macro, call, counter);
  const transformed = transformBlockStatements(inner, scope, nextDepth, counter);
  if (transformed.length === 0) {
    return { pre: [], expr: { type: 'NullLiteral' } as ExpressionNode };
  }
  const pre = transformed.slice(0, -1);
  const last = transformed[transformed.length - 1];
  const expr = lastStmtToExpr(last);
  if (!expr) {
    throw new Error(`Macro '${call.name}' used as expression must end with a value (return, expression, or assignment)`);
  }
  return { pre, expr };
}

function transformExpressionTree(expr: any, scope: MacroScope, depth: number, counter: Counter): ExprT {
  if (!expr || typeof expr !== 'object') {
    return { pre: [], expr: expr as ExpressionNode };
  }

  if (expr.type === 'MacroCall') {
    return exprFromMacroExpansion(expr as MacroCall, scope, depth, counter);
  }

  if (expr.type === 'BinaryOp') {
    const L = transformExpressionTree(expr.left, scope, depth, counter);
    const R = transformExpressionTree(expr.right, scope, depth, counter);
    return {
      pre: [...L.pre, ...R.pre],
      expr: { ...expr, left: L.expr, right: R.expr } as ExpressionNode
    };
  }

  if (expr.type === 'Unary') {
    const U = transformExpressionTree(expr.operand, scope, depth, counter);
    return { pre: U.pre, expr: { ...expr, operand: U.expr } as ExpressionNode };
  }

  if (expr.type === 'Logical') {
    const L = transformExpressionTree(expr.left, scope, depth, counter);
    const R = transformExpressionTree(expr.right, scope, depth, counter);
    return {
      pre: [...L.pre, ...R.pre],
      expr: { ...expr, left: L.expr, right: R.expr } as ExpressionNode
    };
  }

  if (expr.type === 'Conditional') {
    const C = transformExpressionTree(expr.condition, scope, depth, counter);
    const T = transformExpressionTree(expr.consequent, scope, depth, counter);
    const A = transformExpressionTree(expr.alternate, scope, depth, counter);
    return {
      pre: [...C.pre, ...T.pre, ...A.pre],
      expr: { ...expr, condition: C.expr, consequent: T.expr, alternate: A.expr } as ExpressionNode
    };
  }

  if (expr.type === 'Call') {
    const c = transformExpressionTree(expr.callee, scope, depth, counter);
    const accPre: StatementNode[] = [...c.pre];
    const nextArgs: ExpressionNode[] = [];
    for (const a of expr.args || []) {
      const ar = transformExpressionTree(a, scope, depth, counter);
      accPre.push(...ar.pre);
      nextArgs.push(ar.expr);
    }
    return { pre: accPre, expr: { ...expr, callee: c.expr, args: nextArgs } as ExpressionNode };
  }

  if (expr.type === 'GenericCall') {
    const c = transformExpressionTree(expr.callee, scope, depth, counter);
    const accPre: StatementNode[] = [...c.pre];
    const nextArgs: ExpressionNode[] = [];
    for (const a of expr.args || []) {
      const ar = transformExpressionTree(a, scope, depth, counter);
      accPre.push(...ar.pre);
      nextArgs.push(ar.expr);
    }
    return { pre: accPre, expr: { ...expr, callee: c.expr, args: nextArgs } as ExpressionNode };
  }

  if (expr.type === 'Member') {
    const o = transformExpressionTree(expr.object, scope, depth, counter);
    return { pre: o.pre, expr: { ...expr, object: o.expr } as ExpressionNode };
  }

  if (expr.type === 'Assignment') {
    const v = transformExpressionTree(expr.value, scope, depth, counter);
    return { pre: v.pre, expr: { ...expr, value: v.expr } as ExpressionNode };
  }

  if (expr.type === 'ArrayLiteral') {
    const accPre: StatementNode[] = [];
    const els: ExpressionNode[] = [];
    for (const e of expr.elements || []) {
      const er = transformExpressionTree(e, scope, depth, counter);
      accPre.push(...er.pre);
      els.push(er.expr);
    }
    return { pre: accPre, expr: { ...expr, elements: els } as ExpressionNode };
  }

  if (expr.type === 'Await') {
    const u = transformExpressionTree(expr.expression, scope, depth, counter);
    return { pre: u.pre, expr: { ...expr, expression: u.expr } as ExpressionNode };
  }

  if (expr.type === 'YieldExpr') {
    if (expr.value === undefined || expr.value === null) {
      return { pre: [], expr: expr as ExpressionNode };
    }
    const u = transformExpressionTree(expr.value, scope, depth, counter);
    return { pre: u.pre, expr: { ...expr, value: u.expr } as ExpressionNode };
  }

  if (expr.type === 'ObjectLiteral' && Array.isArray((expr as any).entries)) {
    const accPre: StatementNode[] = [];
    const entries = ((expr as any).entries as any[]).map((ent: any) => {
      if (ent.kind === 'property') {
        const vr = transformExpressionTree(ent.value, scope, depth, counter);
        accPre.push(...vr.pre);
        return { ...ent, value: vr.expr };
      }
      if (ent.kind === 'computed') {
        const kr = transformExpressionTree(ent.key, scope, depth, counter);
        const vr = transformExpressionTree(ent.value, scope, depth, counter);
        accPre.push(...kr.pre, ...vr.pre);
        return { ...ent, key: kr.expr, value: vr.expr };
      }
      if (ent.kind === 'spread') {
        const sr = transformExpressionTree(ent.value, scope, depth, counter);
        accPre.push(...sr.pre);
        return { ...ent, value: sr.expr };
      }
      return ent;
    });
    return { pre: accPre, expr: { ...expr, entries } as ExpressionNode };
  }

  return { pre: [], expr: expr as ExpressionNode };
}

function flattenBlockStatements(stmts: StatementNode[]): StatementNode[] {
  const out: StatementNode[] = [];
  for (const s of stmts) {
    if (s.type === 'Block') {
      out.push(...flattenBlockStatements((s as BlockStatement).statements));
    } else {
      out.push(s);
    }
  }
  return out;
}

export function transformStatement(stmt: StatementNode, scope: MacroScope, depth: number, counter: Counter): StatementNode {
  const s: any = stmt;

  if (s.type === 'Question') {
    return {
      ...s,
      condition: transformExpressionTree(s.condition, scope, depth, counter).expr,
      thenBranch: s.thenBranch ? transformBlockStatements(s.thenBranch, scope, depth, counter) : undefined,
      elseBranch: s.elseBranch ? transformBlockStatements(s.elseBranch, scope, depth, counter) : undefined
    };
  }

  if (s.type === 'Block') {
    const b = s as BlockStatement;
    return { ...b, statements: transformBlockStatements(b.statements, scope, depth, counter) } as StatementNode;
  }

  if (s.type === 'If') {
    return {
      ...s,
      condition: transformExpressionTree(s.condition, scope, depth, counter).expr,
      thenBranch: transformBlockStatements(s.thenBranch || [], scope, depth, counter),
      elseBranch: s.elseBranch ? transformBlockStatements(s.elseBranch, scope, depth, counter) : undefined
    };
  }

  if (s.type === 'While') {
    return {
      ...s,
      condition: transformExpressionTree(s.condition, scope, depth, counter).expr,
      body: transformBlockStatements(s.body || [], scope, depth, counter)
    };
  }

  if (s.type === 'For') {
    return {
      ...s,
      init: s.init ? transformStatement(s.init, scope, depth, counter) : undefined,
      condition: s.condition ? transformExpressionTree(s.condition, scope, depth, counter).expr : undefined,
      update: s.update ? transformStatement(s.update, scope, depth, counter) : undefined,
      body: transformBlockStatements(s.body || [], scope, depth, counter)
    };
  }

  if (s.type === 'ForIn') {
    const it = transformExpressionTree(s.iterable, scope, depth, counter);
    const body = transformBlockStatements(s.body || [], scope, depth, counter);
    if (it.pre.length === 0) {
      return {
        ...s,
        iterable: it.expr,
        body
      };
    }
    return {
      type: 'Block',
      statements: [...it.pre, { ...s, iterable: it.expr, body } as StatementNode]
    } as StatementNode;
  }

  if (s.type === 'FunctionDef' || s.type === 'AsyncFunctionDef') {
    const inner = new Map(scope);
    return { ...s, body: transformBlockStatements(s.body || [], inner, depth, counter) };
  }

  if (s.type === 'CoroutineDef') {
    const inner = new Map(scope);
    return { ...s, body: transformBlockStatements(s.body || [], inner, depth, counter) };
  }

  if (s.type === 'ClassDef') {
    return {
      ...s,
      methods: (s.methods || []).map((m: any) => transformStatement(m, scope, depth, counter))
    };
  }

  if (s.type === 'Try') {
    return {
      ...s,
      body: transformBlockStatements(s.body || [], scope, depth, counter),
      catchClause: s.catchClause
        ? { ...s.catchClause, body: transformBlockStatements(s.catchClause.body || [], scope, depth, counter) }
        : undefined,
      finallyBlock: s.finallyBlock ? transformBlockStatements(s.finallyBlock, scope, depth, counter) : undefined
    };
  }

  if (s.type === 'Switch') {
    return {
      ...s,
      expression: transformExpressionTree(s.expression, scope, depth, counter).expr,
      cases: (s.cases || []).map((c: any) => ({
        ...c,
        value: transformExpressionTree(c.value, scope, depth, counter).expr,
        body: transformBlockStatements(c.body || [], scope, depth, counter)
      })),
      defaultCase: s.defaultCase ? transformBlockStatements(s.defaultCase, scope, depth, counter) : undefined
    };
  }

  if (s.type === 'Return') {
    return {
      ...s,
      value: s.value ? transformExpressionTree(s.value, scope, depth, counter).expr : undefined
    };
  }

  if (s.type === 'Throw') {
    return { ...s, value: transformExpressionTree(s.value, scope, depth, counter).expr };
  }

  if (s.type === 'VarDecl') {
    return {
      ...s,
      value: s.value ? transformExpressionTree(s.value, scope, depth, counter).expr : undefined
    };
  }

  if (s.type === 'Yield') {
    return {
      ...s,
      value: s.value ? transformExpressionTree(s.value, scope, depth, counter).expr : undefined
    };
  }

  if (s.type === 'Action' && s.action === 'expr') {
    if (s.target?.type === 'MacroCall') {
      const macro = lookupMacro(scope, s.target.name);
      if (macro && !macro.procedural) {
        const nextDepth = depth + 1;
        if (nextDepth > MAX_MACRO_EXPAND_DEPTH) {
          throw new Error(`Macro expansion depth exceeded (possible infinite recursion: ${s.target.name})`);
        }
        const inner = expandSubstitutionBody(macro, s.target, counter);
        const transformed = transformBlockStatements(inner, scope, nextDepth, counter);
        if (transformed.length === 1) {
          return transformed[0];
        }
        return { type: 'Block', statements: transformed } as BlockStatement as StatementNode;
      }
    }
    if (s.target?.type === 'Assignment') {
      const a = s.target;
      const rhs = transformExpressionTree(a.value, scope, depth, counter);
      const nextAsg = { ...a, value: rhs.expr } as ExpressionNode;
      if (rhs.pre.length === 0) {
        return { type: 'Action', action: 'expr', target: nextAsg } as StatementNode;
      }
      return {
        type: 'Block',
        statements: [...rhs.pre, { type: 'Action', action: 'expr', target: nextAsg } as StatementNode]
      } as BlockStatement as StatementNode;
    }
    const e = transformExpressionTree(s.target, scope, depth, counter);
    if (e.pre.length === 0) {
      return { type: 'Action', action: 'expr', target: e.expr } as StatementNode;
    }
    return { type: 'Block', statements: [...e.pre, { type: 'Action', action: 'expr', target: e.expr } as StatementNode] } as BlockStatement as StatementNode;
  }

  if (s.type === 'Export') {
    return { ...s, declaration: transformStatement(s.declaration, scope, depth, counter) };
  }

  return stmt;
}

export function transformBlockStatements(
  stmts: StatementNode[],
  parentScope: MacroScope,
  depth: number,
  counter: Counter
): StatementNode[] {
  const scope = new Map(parentScope);
  const out: StatementNode[] = [];

  for (const stmt of stmts) {
    if (stmt.type === 'MacroDef') {
      const md = stmt as MacroDef;
      scope.set(md.name, { params: md.params, body: md.body, procedural: false });
      continue;
    }
    if ((stmt as any).type === 'ProcMacroDef') {
      const pm = stmt as any;
      scope.set(pm.name, { params: pm.params, body: pm.body, procedural: true });
      out.push(stmt);
      continue;
    }

    out.push(transformStatement(stmt, scope, depth, counter));
  }

  return flattenBlockStatements(out);
}

export function expandMacrosInProgram(program: ProgramNode): ProgramNode {
  const counter = new Counter();
  const scope: MacroScope = new Map();
  const statements = transformBlockStatements(program.statements, scope, 0, counter);
  return { ...program, statements };
}
