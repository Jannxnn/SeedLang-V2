import type {
  ExpressionNode,
  AssignmentExpression,
  BinaryExpression,
  UnaryExpression,
  Identifier,
  NumberLiteral,
  BooleanLiteral,
  TextLiteral,
  LogicalExpression,
  ConditionalExpression,
  MemberExpression,
  CallExpression,
  StatementNode,
  DeclarationStatement,
  ObjectLiteral,
  ArrayLiteral,
  MatchExpression,
  BlockExpression,
  GenericCallExpression,
  SuperCallExpression,
  ArrowFunction,
  AwaitExpression,
  YieldExpression,
  MacroCall
} from './ast';

/**
 * Interpreter tier JIT (Node side): specializes hot expression subtrees into closures.
 *
 * Roadmap: while bootstrap runs inside Node + AST Interpreter, this tier trims overhead on compiler-shaped code.
 * For shipped/de-shelled performance, prioritize SeedLangVM + bytecode JIT (`node ... --vm`, `src/jit/*`); treat this module as scaffolding-era acceleration unless CLI AST remains a supported tier.
 * Shape PIC (Identifier↔Identifier / Identifier↔literal BinaryOp; Unary / Logical / Conditional on ids & plain member chains;
 * chains like `a.b.c`; Member ⊕ Id/literal/Call, Id/literal ⊕ Member/Call, Member ⊕ Member; symmetric Logical on Member chains and builtins.
 * Unary on JIT `Call` (`!`, `-`, `~`); BooleanLiteral short-circuit on Logical; literal⊕Identifier / literal⊕builtin Call pairs.
 * Tier entry skips literals, bare identifiers, unknown calls, pure id/literal BinaryOp / Logical / Conditional trees without member or JIT builtins,
 * Permanent tier failures poison eligibility so the interpreter stops calling tryExpr for that AST node.
 * Reduces nested jitOrSlow allocations on compiler-style workloads.
 */

type Sv = { type: string; value: unknown; properties?: Map<string, Sv> };

/** Sentinel: JIT did not run; caller continues with interpreter slow path */
export const INTERP_JIT_MISS = Symbol('INTERP_JIT_MISS');

/** Drop specialization and retry slow path once */
export class InterpreterJitDeopt extends Error {
  constructor() {
    super('interp-jit-deopt');
    this.name = 'InterpreterJitDeopt';
  }
}

/** Maps to Interpreter `RuntimeError` in interpreter.ts catch layer */
export class InterpreterJitRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InterpreterJitRuntimeError';
  }
}

/** Hits before attempting tier compile per AST expression node (assignment uses ASSIGN variant). Higher values reduce compile/deopt churn on macro-style programs where many sites execute often but not forever; override via SEED_INTERP_JIT_PROBE. */
const PROBE_EXPR = Math.max(1, parseInt(process.env.SEED_INTERP_JIT_PROBE ?? '128', 10) || 128);
const PROBE_ASSIGN = Math.max(
  1,
  parseInt(process.env.SEED_INTERP_JIT_PROBE_ASSIGN ?? String(PROBE_EXPR), 10) || PROBE_EXPR
);

export interface InterpreterJitBindings {
  envGet(name: string): Sv;
  assignIdentifier(name: string, val: Sv): void;
  /** Full semantics without entering JIT again (handles Assignment internally) */
  evalSlow(expr: ExpressionNode): Sv;
  isTruthy(v: Sv): boolean;
  equalValues(a: Sv, b: Sv): boolean;
}

type ExprJitFn = (b: InterpreterJitBindings) => Sv;
type AssignJitFn = (b: InterpreterJitBindings) => Sv;

interface ExprState {
  n: number;
  fn?: ExprJitFn;
  failed?: boolean;
}

interface AssignState {
  n: number;
  fn?: AssignJitFn;
  failed?: boolean;
}

/** Callee names handled by `compileBuiltinCall` (must stay in sync). */
const INTERP_JIT_BUILTIN_IDS = new Set([
  'len',
  'abs',
  'floor',
  'ceil',
  'round',
  'sqrt',
  'pow',
  'min',
  'max'
]);

/** Operators handled by `compileArithmetic` BinaryOp switch (must stay in sync). */
const INTERP_JIT_BINARY_OPS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '<=',
  '>=',
  '==',
  '!=',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>'
]);

/** Chain like `a.b.c`: non-computed string props down to an Identifier root (otherwise null). */
function flattenPlainMemberChain(expr: ExpressionNode): { root: string; props: string[] } | null {
  const props: string[] = [];
  let cur: ExpressionNode = expr;
  while (cur.type === 'Member') {
    const m = cur as MemberExpression;
    if (m.computed || typeof m.property !== 'string') return null;
    props.unshift(m.property as string);
    cur = m.object as ExpressionNode;
  }
  if (cur.type !== 'Identifier') return null;
  return { root: (cur as Identifier).name, props };
}

/** True if subtree contains PIC shapes that beat interpreter dispatch on compiler workloads (member chains, JIT builtins, logical/cond). */
function tierSubtreeBeneficial(expr: ExpressionNode): boolean {
  switch (expr.type) {
    case 'Identifier':
    case 'NumberLiteral':
    case 'BooleanLiteral':
    case 'TextLiteral':
    case 'NullLiteral':
      return false;
    case 'Member':
      return flattenPlainMemberChain(expr) !== null;
    case 'Call': {
      const c = expr as CallExpression;
      return c.callee.type === 'Identifier' && INTERP_JIT_BUILTIN_IDS.has((c.callee as Identifier).name);
    }
    case 'Logical': {
      const lg = expr as LogicalExpression;
      return tierSubtreeBeneficial(lg.left as ExpressionNode) || tierSubtreeBeneficial(lg.right as ExpressionNode);
    }
    case 'Conditional': {
      const ce = expr as ConditionalExpression;
      return (
        tierSubtreeBeneficial(ce.condition as ExpressionNode) ||
        tierSubtreeBeneficial(ce.consequent as ExpressionNode) ||
        tierSubtreeBeneficial(ce.alternate as ExpressionNode)
      );
    }
    case 'Unary': {
      const u = expr as UnaryExpression;
      const ok = u.operator === '!' || u.operator === '-' || u.operator === '+' || u.operator === '~';
      if (!ok) return false;
      return tierSubtreeBeneficial(u.operand as ExpressionNode);
    }
    case 'BinaryOp':
      return (
        tierSubtreeBeneficial((expr as BinaryExpression).left as ExpressionNode) ||
        tierSubtreeBeneficial((expr as BinaryExpression).right as ExpressionNode)
      );
    default:
      return false;
  }
}

/**
 * Structural-only: nodes where `compileArithmetic` cannot succeed (or only builtins we don't JIT).
 * Skipping tier probing for these avoids WeakMap churn + PROBE_EXPR wasted evaluations — critical for
 * macro/compilers dominated by `map()`, `push()`, member chains, literals, etc.
 */
function shallowInterpJitReject(expr: ExpressionNode): boolean {
  switch (expr.type) {
    case 'NumberLiteral':
    case 'BooleanLiteral':
    case 'TextLiteral':
    case 'NullLiteral':
    case 'Identifier':
      // Interpreter `expressionDispatchCore` already handles these directly; tier adds WeakMap + probes with no win.
      return true;
    case 'Unary': {
      const u = expr as UnaryExpression;
      const op = u.operator;
      if (!(op === '!' || op === '-' || op === '+' || op === '~')) return true;
      // Interpreter dispatch on Identifier is cheaper than WeakMap + probes for `-x`, `!x`, etc.
      if (u.operand.type === 'Identifier') return true;
      return false;
    }
    case 'Logical': {
      const lg = expr as LogicalExpression;
      if (!(lg.operator === 'and' || lg.operator === 'or')) return true;
      return !(tierSubtreeBeneficial(lg.left) || tierSubtreeBeneficial(lg.right));
    }
    case 'Conditional': {
      const ce = expr as ConditionalExpression;
      return !(
        tierSubtreeBeneficial(ce.condition as ExpressionNode) ||
        tierSubtreeBeneficial(ce.consequent as ExpressionNode) ||
        tierSubtreeBeneficial(ce.alternate as ExpressionNode)
      );
    }
    case 'Member':
      return flattenPlainMemberChain(expr) === null;
    case 'Call': {
      const c = expr as CallExpression;
      if (c.callee.type !== 'Identifier') return true;
      return !INTERP_JIT_BUILTIN_IDS.has((c.callee as Identifier).name);
    }
    case 'BinaryOp': {
      const op = (expr as BinaryExpression).operator;
      if (!INTERP_JIT_BINARY_OPS.has(op)) return true;
      // Pure id/literal arithmetic trees are cheaper via interpreter dispatch than WeakMap + JIT closures (CLC-style loads).
      return !tierSubtreeBeneficial(expr);
    }
    default:
      return true;
  }
}

const interpJitEligibleMemo = new WeakMap<ExpressionNode, boolean>();

/** After tier proves compile/runtime hopeless, stop calling tryExpr (interpreter checks eligibility first). */
function poisonInterpJitTier(expr: ExpressionNode): void {
  if (interpJitEligibleMemo.get(expr) === false) return;
  interpJitEligibleMemo.set(expr, false);
}

/** If false, interpreter should not call tryExpr / tryAssignment (purely structural). */
export function expressionEligibleForInterpJit(expr: ExpressionNode): boolean {
  let hit = interpJitEligibleMemo.get(expr);
  if (hit !== undefined) return hit;
  hit = !shallowInterpJitReject(expr);
  interpJitEligibleMemo.set(expr, hit);
  return hit;
}

/** DFS: true if any AST expression node could tier (matches evaluate visiting child expr roots). */
function exprForestMayJit(expr: ExpressionNode): boolean {
  if (expressionEligibleForInterpJit(expr)) return true;
  switch (expr.type) {
    case 'BinaryOp':
      return (
        exprForestMayJit((expr as BinaryExpression).left) ||
        exprForestMayJit((expr as BinaryExpression).right)
      );
    case 'Unary':
      return exprForestMayJit((expr as UnaryExpression).operand as ExpressionNode);
    case 'Logical':
      return (
        exprForestMayJit((expr as LogicalExpression).left) ||
        exprForestMayJit((expr as LogicalExpression).right)
      );
    case 'Conditional': {
      const ce = expr as ConditionalExpression;
      return exprForestMayJit(ce.condition) || exprForestMayJit(ce.consequent) || exprForestMayJit(ce.alternate);
    }
    case 'Assignment': {
      const ae = expr as AssignmentExpression;
      return exprForestMayJit(ae.target as ExpressionNode) || exprForestMayJit(ae.value);
    }
    case 'Member': {
      const m = expr as MemberExpression;
      if (exprForestMayJit(m.object as ExpressionNode)) return true;
      if (m.computed && typeof m.property !== 'string') return exprForestMayJit(m.property as ExpressionNode);
      return false;
    }
    case 'Call': {
      const c = expr as CallExpression;
      if (exprForestMayJit(c.callee)) return true;
      for (const a of c.args) if (exprForestMayJit(a)) return true;
      return false;
    }
    case 'GenericCall': {
      const g = expr as GenericCallExpression;
      if (exprForestMayJit(g.callee)) return true;
      for (const a of g.args) if (exprForestMayJit(a)) return true;
      return false;
    }
    case 'SuperCallExpression': {
      const sc = expr as SuperCallExpression;
      for (const a of sc.args) if (exprForestMayJit(a)) return true;
      return false;
    }
    case 'ArrayLiteral':
      for (const el of (expr as ArrayLiteral).elements) if (exprForestMayJit(el)) return true;
      return false;
    case 'ObjectLiteral': {
      const o = expr as ObjectLiteral;
      if (o.entries) {
        for (const e of o.entries) {
          if (e.kind === 'computed') {
            if (exprForestMayJit(e.key)) return true;
            if (exprForestMayJit(e.value)) return true;
          } else if (e.kind === 'spread') {
            if (exprForestMayJit(e.value)) return true;
          } else if (exprForestMayJit(e.value)) return true;
        }
      }
      if (o.properties) {
        for (const v of o.properties.values()) if (exprForestMayJit(v)) return true;
      }
      return false;
    }
    case 'ArrowFunction':
      return exprForestMayJit((expr as ArrowFunction).body as ExpressionNode);
    case 'Block':
      return scanStatementsForInterpJitCandidates((expr as BlockExpression).statements);
    case 'Match': {
      const me = expr as MatchExpression;
      if (exprForestMayJit(me.expression)) return true;
      for (const c of me.cases) {
        if (c.guard && exprForestMayJit(c.guard)) return true;
        if (scanStatementsForInterpJitCandidates(c.body)) return true;
      }
      return false;
    }
    case 'Await':
      return exprForestMayJit((expr as AwaitExpression).expression);
    case 'YieldExpr': {
      const y = expr as YieldExpression;
      return y.value ? exprForestMayJit(y.value) : false;
    }
    case 'MacroCall':
      for (const a of (expr as MacroCall).args) if (exprForestMayJit(a)) return true;
      return false;
    default:
      return false;
  }
}

function statementScanForInterpJit(stmt: StatementNode): boolean {
  const s = stmt as any;
  switch (stmt.type) {
    case 'Block':
      return scanStatementsForInterpJitCandidates(s.statements);
    case 'If':
      return (
        exprForestMayJit(s.condition) ||
        scanStatementsForInterpJitCandidates(s.thenBranch) ||
        (s.elseBranch ? scanStatementsForInterpJitCandidates(s.elseBranch) : false)
      );
    case 'While':
      return exprForestMayJit(s.condition) || scanStatementsForInterpJitCandidates(s.body);
    case 'For':
      return (
        (s.init ? statementScanForInterpJit(s.init) : false) ||
        (s.condition ? exprForestMayJit(s.condition) : false) ||
        (s.update ? statementScanForInterpJit(s.update) : false) ||
        scanStatementsForInterpJitCandidates(s.body)
      );
    case 'ForIn':
      return exprForestMayJit(s.iterable) || scanStatementsForInterpJitCandidates(s.body);
    case 'Return':
      return s.value ? exprForestMayJit(s.value) : false;
    case 'Throw':
      return exprForestMayJit(s.value);
    case 'VarDecl':
    case 'LetDecl':
      return s.value ? exprForestMayJit(s.value) : false;
    case 'Declaration': {
      const d = stmt as DeclarationStatement;
      if (d.subject && exprForestMayJit(d.subject)) return true;
      if (d.object && exprForestMayJit(d.object)) return true;
      return false;
    }
    case 'Question':
      return (
        exprForestMayJit(s.condition) ||
        scanStatementsForInterpJitCandidates(s.thenBranch || []) ||
        scanStatementsForInterpJitCandidates(s.elseBranch || [])
      );
    case 'Action':
      return (
        (s.target ? exprForestMayJit(s.target) : false) ||
        (s.content ? exprForestMayJit(s.content) : false)
      );
    case 'FunctionDef':
    case 'AsyncFunctionDef':
      return scanStatementsForInterpJitCandidates(s.body);
    case 'Try':
      return (
        scanStatementsForInterpJitCandidates(s.body) ||
        (s.catchClause?.body ? scanStatementsForInterpJitCandidates(s.catchClause.body) : false) ||
        (s.finallyBlock ? scanStatementsForInterpJitCandidates(s.finallyBlock) : false)
      );
    case 'Switch':
      if (exprForestMayJit(s.expression)) return true;
      for (const c of s.cases || []) {
        if (exprForestMayJit(c.value)) return true;
        if (scanStatementsForInterpJitCandidates(c.body)) return true;
      }
      if (s.defaultCase && scanStatementsForInterpJitCandidates(s.defaultCase)) return true;
      return false;
    case 'Export':
      return statementScanForInterpJit(s.declaration);
    case 'ClassDef':
      for (const p of s.properties || []) {
        if (p.value && exprForestMayJit(p.value)) return true;
      }
      for (const m of s.methods || []) {
        if (statementScanForInterpJit(m)) return true;
      }
      return false;
    case 'InterfaceDef':
      for (const m of s.methods || []) {
        if (statementScanForInterpJit(m)) return true;
      }
      return false;
    case 'Yield':
      return s.value ? exprForestMayJit(s.value) : false;
    case 'CoroutineDef':
      return scanStatementsForInterpJitCandidates(s.body);
    case 'Import':
    case 'Break':
    case 'Continue':
    case 'MacroDef':
    case 'ProcMacroDef':
    case 'WebDirective':
    case 'WebDirectiveBlock':
    case 'TypeAlias':
      return false;
    default:
      return false;
  }
}

/** One-shot scan after macro expansion; if false, interpreter skips tryExpr for this run (fixed overhead only when tier might hit). */
export function scanStatementsForInterpJitCandidates(stmts: StatementNode[]): boolean {
  for (const st of stmts) {
    if (statementScanForInterpJit(st)) return true;
  }
  return false;
}

function jitOrSlow(expr: ExpressionNode): ExprJitFn {
  const fast = compileArithmetic(expr);
  if (fast) return fast;
  return (b) => b.evalSlow(expr);
}

/** Plain `obj.field`: object map, array index/length, string index/length; instance without methods. */
function readPlainMember(b: InterpreterJitBindings, recv: Sv, prop: string, memberExpr: ExpressionNode): Sv {
  const propStr = String(prop);

  if (recv.type === 'array') {
    const idx = parseInt(propStr, 10);
    if (!isNaN(idx)) {
      const arr = recv.value as unknown[];
      const effectiveIndex = idx < 0 ? arr.length + idx : idx;
      if (effectiveIndex >= 0 && effectiveIndex < arr.length) {
        return arr[effectiveIndex] as Sv;
      }
    }
    if (propStr === 'length') {
      return { type: 'number', value: (recv.value as unknown[]).length };
    }
    return b.evalSlow(memberExpr);
  }

  if (recv.type === 'string') {
    const str = recv.value as string;
    const idx = parseInt(propStr, 10);
    if (!isNaN(idx)) {
      const effectiveIndex = idx < 0 ? str.length + idx : idx;
      if (effectiveIndex >= 0 && effectiveIndex < str.length) {
        return { type: 'string', value: str[effectiveIndex]! };
      }
    }
    if (propStr === 'length') return { type: 'number', value: str.length };
    return b.evalSlow(memberExpr);
  }

  if (recv.type === 'object' && recv.properties) {
    if (recv.properties.has(propStr)) {
      return recv.properties.get(propStr)! as Sv;
    }
    return { type: 'null', value: null };
  }

  if (recv.type === 'instance' && recv.properties) {
    const p = recv.properties.get(propStr);
    if (p === undefined) return b.evalSlow(memberExpr);
    const pv = p as Sv;
    if (pv.type === 'function') return b.evalSlow(memberExpr);
    return pv;
  }

  return b.evalSlow(memberExpr);
}

/** Single closure walks `root.prop.prop…` using readPlainMember (evalSlow references full chain AST). */
function compilePlainMemberChainLoad(root: string, props: string[], chainAst: ExpressionNode): ExprJitFn {
  return (b) => {
    let recv = b.envGet(root);
    for (const p of props) {
      recv = readPlainMember(b, recv, p, chainAst);
    }
    return recv;
  };
}

function compilePlainMemberChain(expr: ExpressionNode): ExprJitFn | null {
  const flat = flattenPlainMemberChain(expr);
  if (!flat || flat.props.length === 0) return null;
  return compilePlainMemberChainLoad(flat.root, flat.props, expr);
}

/** `len(x)` when x is Identifier or already compiled sub-expr */
function compileLenCall(c: CallExpression): ExprJitFn | null {
  if (c.args.length !== 1) return null;
  const inner = compileArithmetic(c.args[0] as ExpressionNode);
  if (inner) {
    return (b) => {
      const v = inner(b);
      if (v.type === 'array') return { type: 'number', value: (v.value as unknown[]).length };
      if (v.type === 'string') return { type: 'number', value: (v.value as string).length };
      return b.evalSlow(c);
    };
  }
  if (c.args[0].type === 'Identifier') {
    const name = (c.args[0] as Identifier).name;
    return (b) => {
      const v = b.envGet(name);
      if (v.type === 'array') return { type: 'number', value: (v.value as unknown[]).length };
      if (v.type === 'string') return { type: 'number', value: (v.value as string).length };
      return b.evalSlow(c);
    };
  }
  return null;
}

/** Single-arg builtins that require a number at runtime (matches globals abs/floor/ceil/round/sqrt). */
function compileUnaryNumBuiltin(c: CallExpression, map: (n: number) => number): ExprJitFn | null {
  if (c.args.length !== 1) return null;
  const arg0 = c.args[0] as ExpressionNode;
  const inner = compileArithmetic(arg0);
  if (inner) {
    return (b) => {
      const v = inner(b);
      if (v.type !== 'number') return b.evalSlow(c);
      return { type: 'number', value: map(v.value as number) };
    };
  }
  if (arg0.type === 'Identifier') {
    const name = (arg0 as Identifier).name;
    return (b) => {
      const v = b.envGet(name);
      if (v.type !== 'number') return b.evalSlow(c);
      return { type: 'number', value: map(v.value as number) };
    };
  }
  return null;
}

function compilePowCall(c: CallExpression): ExprJitFn | null {
  if (c.args.length !== 2) return null;
  const Lf = jitOrSlow(c.args[0] as ExpressionNode);
  const Rf = jitOrSlow(c.args[1] as ExpressionNode);
  return (b) => {
    const lv = Lf(b);
    const rv = Rf(b);
    if (lv.type !== 'number' || rv.type !== 'number') return b.evalSlow(c);
    return { type: 'number', value: Math.pow(lv.value as number, rv.value as number) };
  };
}

/** `min` / `max` with two numeric sub-expressions or one array (identifier or compiled). */
function compileMinMaxCall(c: CallExpression, isMax: boolean): ExprJitFn | null {
  if (c.args.length === 2) {
    const Lf = jitOrSlow(c.args[0] as ExpressionNode);
    const Rf = jitOrSlow(c.args[1] as ExpressionNode);
    return (b) => {
      const lv = Lf(b);
      const rv = Rf(b);
      if (lv.type !== 'number' || rv.type !== 'number') return b.evalSlow(c);
      const ln = lv.value as number;
      const rn = rv.value as number;
      if (isMax) return ln > rn ? lv : rv;
      return ln < rn ? lv : rv;
    };
  }

  if (c.args.length !== 1) return null;
  const arg0 = c.args[0] as ExpressionNode;

  const foldArray = (arr: Sv[]): Sv => {
    let acc = arr[0]!;
    for (let i = 1; i < arr.length; i++) {
      const curr = arr[i]!;
      const av = acc.value as number;
      const cv = curr.value as number;
      acc = isMax ? (av > cv ? acc : curr) : av < cv ? acc : curr;
    }
    return acc;
  };

  const inner = compileArithmetic(arg0);
  if (inner) {
    return (b) => {
      const v = inner(b);
      if (v.type !== 'array') return b.evalSlow(c);
      const arr = v.value as Sv[];
      if (arr.length === 0) return b.evalSlow(c);
      return foldArray(arr);
    };
  }
  if (arg0.type === 'Identifier') {
    const name = (arg0 as Identifier).name;
    return (b) => {
      const v = b.envGet(name);
      if (v.type !== 'array') return b.evalSlow(c);
      const arr = v.value as Sv[];
      if (arr.length === 0) return b.evalSlow(c);
      return foldArray(arr);
    };
  }
  return null;
}

function compileBuiltinCall(c: CallExpression): ExprJitFn | null {
  if (c.callee.type !== 'Identifier') return null;
  const name = (c.callee as Identifier).name;
  switch (name) {
    case 'len':
      return compileLenCall(c);
    case 'abs':
      return compileUnaryNumBuiltin(c, Math.abs);
    case 'floor':
      return compileUnaryNumBuiltin(c, Math.floor);
    case 'ceil':
      return compileUnaryNumBuiltin(c, Math.ceil);
    case 'round':
      return compileUnaryNumBuiltin(c, Math.round);
    case 'sqrt':
      return compileUnaryNumBuiltin(c, Math.sqrt);
    case 'pow':
      return compilePowCall(c);
    case 'min':
      return compileMinMaxCall(c, false);
    case 'max':
      return compileMinMaxCall(c, true);
    default:
      return null;
  }
}

/** Tier interpreter JIT: fast paths + slow fallback per sub-expression */
export class InterpreterJit {
  private exprMap = new WeakMap<ExpressionNode, ExprState>();
  private assignMap = new WeakMap<AssignmentExpression, AssignState>();

  tryExpr(b: InterpreterJitBindings, expr: ExpressionNode): Sv | typeof INTERP_JIT_MISS {
    let st = this.exprMap.get(expr);
    if (!st) {
      st = { n: 0 };
      this.exprMap.set(expr, st);
    }
    if (st.failed) {
      poisonInterpJitTier(expr);
      return INTERP_JIT_MISS;
    }
    if (st.fn) {
      try {
        return st.fn(b);
      } catch (e) {
        if (e instanceof InterpreterJitDeopt) {
          st.fn = undefined;
          return INTERP_JIT_MISS;
        }
        throw e;
      }
    }

    st.n += 1;
    if (st.n < PROBE_EXPR) return INTERP_JIT_MISS;

    const built = compileArithmetic(expr);
    if (!built) {
      st.failed = true;
      poisonInterpJitTier(expr);
      return INTERP_JIT_MISS;
    }

    try {
      const v = built(b);
      st.fn = built;
      return v;
    } catch (e) {
      if (e instanceof InterpreterJitDeopt) {
        st.failed = true;
        poisonInterpJitTier(expr);
      } else {
        throw e;
      }
      return INTERP_JIT_MISS;
    }
  }

  tryAssignment(b: InterpreterJitBindings, a: AssignmentExpression): Sv | typeof INTERP_JIT_MISS {
    if (a.target.type !== 'Identifier') return INTERP_JIT_MISS;
    if (a.operator && a.operator !== '=') return INTERP_JIT_MISS;

    let st = this.assignMap.get(a);
    if (!st) {
      st = { n: 0 };
      this.assignMap.set(a, st);
    }
    if (st.failed) {
      poisonInterpJitTier(a.value as ExpressionNode);
      return INTERP_JIT_MISS;
    }
    if (st.fn) {
      try {
        return st.fn(b);
      } catch (e) {
        if (e instanceof InterpreterJitDeopt) {
          st.fn = undefined;
          return INTERP_JIT_MISS;
        }
        throw e;
      }
    }

    st.n += 1;
    if (st.n < PROBE_ASSIGN) return INTERP_JIT_MISS;

    const name = (a.target as Identifier).name;
    const rhs = compileArithmetic(a.value as ExpressionNode);
    if (!rhs) {
      st.failed = true;
      poisonInterpJitTier(a.value as ExpressionNode);
      return INTERP_JIT_MISS;
    }

    const fn: AssignJitFn = (bb) => {
      const val = rhs(bb);
      bb.assignIdentifier(name, val);
      return val;
    };

    try {
      const out = fn(b);
      st.fn = fn;
      return out;
    } catch (e) {
      if (e instanceof InterpreterJitDeopt) {
        st.failed = true;
        poisonInterpJitTier(a.value as ExpressionNode);
      } else {
        throw e;
      }
      return INTERP_JIT_MISS;
    }
  }
}

function requireNum(v: Sv): number {
  if (v.type === 'number' && typeof v.value === 'number') return v.value;
  throw new InterpreterJitDeopt();
}

/** Core compiler: returns null if we refuse this whole node (caller probes / fails tier) */
function compileArithmetic(expr: ExpressionNode): ExprJitFn | null {
  switch (expr.type) {
    case 'NumberLiteral': {
      const v = (expr as NumberLiteral).value;
      return () => ({ type: 'number', value: v });
    }
    case 'BooleanLiteral': {
      const v = (expr as BooleanLiteral).value;
      return () => ({ type: 'boolean', value: v });
    }
    case 'TextLiteral': {
      const s = (expr as TextLiteral).value;
      return () => ({ type: 'string', value: s });
    }
    case 'NullLiteral':
      return () => ({ type: 'null', value: null });
    case 'Identifier': {
      const n = (expr as Identifier).name;
      return (b) => b.envGet(n);
    }
    case 'Unary': {
      const u = expr as UnaryExpression;
      if (u.operator === '!' && u.operand.type === 'Identifier') {
        const name = (u.operand as Identifier).name;
        return (b) => ({ type: 'boolean', value: !b.isTruthy(b.envGet(name)) });
      }
      if (u.operator === '-' && u.operand.type === 'Identifier') {
        const name = (u.operand as Identifier).name;
        return (b) => ({ type: 'number', value: -requireNum(b.envGet(name)) });
      }
      if (u.operator === '~' && u.operand.type === 'Identifier') {
        const name = (u.operand as Identifier).name;
        return (b) => ({ type: 'number', value: ~requireNum(b.envGet(name)) });
      }
      if (u.operand.type === 'Member') {
        const flat = flattenPlainMemberChain(u.operand as ExpressionNode);
        if (flat) {
          const load = compilePlainMemberChainLoad(flat.root, flat.props, u.operand as ExpressionNode);
          if (u.operator === '!') {
            return (b) => ({ type: 'boolean', value: !b.isTruthy(load(b)) });
          }
          if (u.operator === '-') {
            return (b) => ({ type: 'number', value: -requireNum(load(b)) });
          }
          if (u.operator === '~') {
            return (b) => ({ type: 'number', value: ~requireNum(load(b)) });
          }
        }
      }
      if (u.operand.type === 'Call') {
        const inner = tryJitBuiltinCall(u.operand as ExpressionNode);
        if (inner) {
          if (u.operator === '!') {
            return (b) => ({ type: 'boolean', value: !b.isTruthy(inner(b)) });
          }
          if (u.operator === '-') {
            return (b) => ({ type: 'number', value: -requireNum(inner(b)) });
          }
          if (u.operator === '~') {
            return (b) => ({ type: 'number', value: ~requireNum(inner(b)) });
          }
        }
      }
      if (u.operator === '!') {
        const inner = jitOrSlow(u.operand as ExpressionNode);
        return (b) => ({ type: 'boolean', value: !b.isTruthy(inner(b)) });
      }
      if (u.operator === '-') {
        const inner = jitOrSlow(u.operand as ExpressionNode);
        return (b) => ({
          type: 'number',
          value: -requireNum(inner(b))
        });
      }
      if (u.operator === '+') return compileArithmetic(u.operand as ExpressionNode);
      if (u.operator === '~') {
        const inner = jitOrSlow(u.operand as ExpressionNode);
        return (b) => ({ type: 'number', value: ~requireNum(inner(b)) });
      }
      return null;
    }
    case 'Logical': {
      const lg = expr as LogicalExpression;
      if (lg.left.type === 'BooleanLiteral') {
        const v = (lg.left as BooleanLiteral).value;
        if (lg.operator === 'and') {
          if (!v) return () => ({ type: 'boolean', value: false });
          const rf = compileArithmetic(lg.right as ExpressionNode);
          if (rf) return rf;
        } else if (lg.operator === 'or') {
          if (v) return () => ({ type: 'boolean', value: true });
          const rf = compileArithmetic(lg.right as ExpressionNode);
          if (rf) return rf;
        }
      }
      if (lg.left.type === 'Identifier' && lg.right.type === 'Identifier') {
        const ln = (lg.left as Identifier).name;
        const rn = (lg.right as Identifier).name;
        if (lg.operator === 'and') {
          return (b) => {
            const lv = b.envGet(ln);
            if (!b.isTruthy(lv)) return lv;
            return b.envGet(rn);
          };
        }
        if (lg.operator === 'or') {
          return (b) => {
            const lv = b.envGet(ln);
            if (b.isTruthy(lv)) return lv;
            return b.envGet(rn);
          };
        }
      }
      if (lg.left.type === 'NumberLiteral' && lg.right.type === 'Call') {
        const bc = tryJitBuiltinCall(lg.right as ExpressionNode);
        if (bc) {
          const ln = (lg.left as NumberLiteral).value;
          const litTruthy = ln !== 0;
          if (lg.operator === 'and') {
            if (!litTruthy) return () => synthNum(ln);
            return (b) => bc(b);
          }
          if (lg.operator === 'or') {
            if (litTruthy) return () => synthNum(ln);
            return (b) => bc(b);
          }
        }
      }
      if (lg.left.type === 'Call' && lg.right.type === 'NumberLiteral') {
        const bc = tryJitBuiltinCall(lg.left as ExpressionNode);
        if (bc) {
          const rv = synthNum((lg.right as NumberLiteral).value);
          if (lg.operator === 'and') {
            return (b) => {
              const lv = bc(b);
              if (!b.isTruthy(lv)) return lv;
              return rv;
            };
          }
          if (lg.operator === 'or') {
            return (b) => {
              const lv = bc(b);
              if (b.isTruthy(lv)) return lv;
              return rv;
            };
          }
        }
      }
      if (lg.left.type === 'NumberLiteral' && lg.right.type === 'Identifier') {
        const ln = (lg.left as NumberLiteral).value;
        const rn = (lg.right as Identifier).name;
        const litTruthy = ln !== 0;
        if (lg.operator === 'and') {
          if (!litTruthy) return () => synthNum(ln);
          return (b) => b.envGet(rn);
        }
        if (lg.operator === 'or') {
          if (litTruthy) return () => synthNum(ln);
          return (b) => b.envGet(rn);
        }
      }
      if (lg.left.type === 'Identifier' && lg.right.type === 'NumberLiteral') {
        const ln = (lg.left as Identifier).name;
        const rv = synthNum((lg.right as NumberLiteral).value);
        if (lg.operator === 'and') {
          return (b) => {
            const lv = b.envGet(ln);
            if (!b.isTruthy(lv)) return lv;
            return rv;
          };
        }
        if (lg.operator === 'or') {
          return (b) => {
            const lv = b.envGet(ln);
            if (b.isTruthy(lv)) return lv;
            return rv;
          };
        }
      }
      if (lg.left.type === 'Member' && lg.right.type === 'Identifier') {
        const flat = flattenPlainMemberChain(lg.left as ExpressionNode);
        if (flat) {
          const loadL = compilePlainMemberChainLoad(flat.root, flat.props, lg.left as ExpressionNode);
          const rn = (lg.right as Identifier).name;
          if (lg.operator === 'and') {
            return (b) => {
              const lv = loadL(b);
              if (!b.isTruthy(lv)) return lv;
              return b.envGet(rn);
            };
          }
          if (lg.operator === 'or') {
            return (b) => {
              const lv = loadL(b);
              if (b.isTruthy(lv)) return lv;
              return b.envGet(rn);
            };
          }
        }
      }
      if (lg.left.type === 'Identifier' && lg.right.type === 'Member') {
        const flat = flattenPlainMemberChain(lg.right as ExpressionNode);
        if (flat) {
          const ln = (lg.left as Identifier).name;
          const loadR = compilePlainMemberChainLoad(flat.root, flat.props, lg.right as ExpressionNode);
          if (lg.operator === 'and') {
            return (b) => {
              const lv = b.envGet(ln);
              if (!b.isTruthy(lv)) return lv;
              return loadR(b);
            };
          }
          if (lg.operator === 'or') {
            return (b) => {
              const lv = b.envGet(ln);
              if (b.isTruthy(lv)) return lv;
              return loadR(b);
            };
          }
        }
      }
      if (lg.left.type === 'Member' && lg.right.type === 'Member') {
        const flatL = flattenPlainMemberChain(lg.left as ExpressionNode);
        const flatR = flattenPlainMemberChain(lg.right as ExpressionNode);
        if (flatL && flatR) {
          const loadL = compilePlainMemberChainLoad(flatL.root, flatL.props, lg.left as ExpressionNode);
          const loadR = compilePlainMemberChainLoad(flatR.root, flatR.props, lg.right as ExpressionNode);
          if (lg.operator === 'and') {
            return (b) => {
              const lv = loadL(b);
              if (!b.isTruthy(lv)) return lv;
              return loadR(b);
            };
          }
          if (lg.operator === 'or') {
            return (b) => {
              const lv = loadL(b);
              if (b.isTruthy(lv)) return lv;
              return loadR(b);
            };
          }
        }
      }
      if (lg.left.type === 'Member' && lg.right.type === 'Call') {
        const flatL = flattenPlainMemberChain(lg.left as ExpressionNode);
        const bc = tryJitBuiltinCall(lg.right as ExpressionNode);
        if (flatL && bc) {
          const loadL = compilePlainMemberChainLoad(flatL.root, flatL.props, lg.left as ExpressionNode);
          if (lg.operator === 'and') {
            return (b) => {
              const lv = loadL(b);
              if (!b.isTruthy(lv)) return lv;
              return bc(b);
            };
          }
          if (lg.operator === 'or') {
            return (b) => {
              const lv = loadL(b);
              if (b.isTruthy(lv)) return lv;
              return bc(b);
            };
          }
        }
      }
      if (lg.left.type === 'Call' && lg.right.type === 'Member') {
        const bc = tryJitBuiltinCall(lg.left as ExpressionNode);
        const flatR = flattenPlainMemberChain(lg.right as ExpressionNode);
        if (bc && flatR) {
          const loadR = compilePlainMemberChainLoad(flatR.root, flatR.props, lg.right as ExpressionNode);
          if (lg.operator === 'and') {
            return (b) => {
              const lv = bc(b);
              if (!b.isTruthy(lv)) return lv;
              return loadR(b);
            };
          }
          if (lg.operator === 'or') {
            return (b) => {
              const lv = bc(b);
              if (b.isTruthy(lv)) return lv;
              return loadR(b);
            };
          }
        }
      }
      if (lg.left.type === 'Identifier' && lg.right.type === 'Call') {
        const bc = tryJitBuiltinCall(lg.right as ExpressionNode);
        if (bc) {
          const ln = (lg.left as Identifier).name;
          if (lg.operator === 'and') {
            return (b) => {
              const lv = b.envGet(ln);
              if (!b.isTruthy(lv)) return lv;
              return bc(b);
            };
          }
          if (lg.operator === 'or') {
            return (b) => {
              const lv = b.envGet(ln);
              if (b.isTruthy(lv)) return lv;
              return bc(b);
            };
          }
        }
      }
      if (lg.left.type === 'Call' && lg.right.type === 'Identifier') {
        const bc = tryJitBuiltinCall(lg.left as ExpressionNode);
        if (bc) {
          const rn = (lg.right as Identifier).name;
          if (lg.operator === 'and') {
            return (b) => {
              const lv = bc(b);
              if (!b.isTruthy(lv)) return lv;
              return b.envGet(rn);
            };
          }
          if (lg.operator === 'or') {
            return (b) => {
              const lv = bc(b);
              if (b.isTruthy(lv)) return lv;
              return b.envGet(rn);
            };
          }
        }
      }
      if (lg.left.type === 'Call' && lg.right.type === 'Call') {
        const bcL = tryJitBuiltinCall(lg.left as ExpressionNode);
        const bcR = tryJitBuiltinCall(lg.right as ExpressionNode);
        if (bcL && bcR) {
          if (lg.operator === 'and') {
            return (b) => {
              const lv = bcL(b);
              if (!b.isTruthy(lv)) return lv;
              return bcR(b);
            };
          }
          if (lg.operator === 'or') {
            return (b) => {
              const lv = bcL(b);
              if (b.isTruthy(lv)) return lv;
              return bcR(b);
            };
          }
        }
      }
      const Lf = jitOrSlow(lg.left as ExpressionNode);
      const Rf = jitOrSlow(lg.right as ExpressionNode);
      if (lg.operator === 'and') {
        return (b) => {
          const lv = Lf(b);
          if (!b.isTruthy(lv)) return lv;
          return Rf(b);
        };
      }
      if (lg.operator === 'or') {
        return (b) => {
          const lv = Lf(b);
          if (b.isTruthy(lv)) return lv;
          return Rf(b);
        };
      }
      return null;
    }
    case 'Conditional': {
      const ce = expr as ConditionalExpression;
      if (ce.condition.type === 'NumberLiteral') {
        const n = (ce.condition as NumberLiteral).value;
        const branch = n !== 0 ? ce.consequent : ce.alternate;
        const folded = compileArithmetic(branch);
        if (folded) return folded;
      }
      if (ce.condition.type === 'BooleanLiteral') {
        const truth = (ce.condition as BooleanLiteral).value;
        const branch = truth ? ce.consequent : ce.alternate;
        const folded = compileArithmetic(branch);
        if (folded) return folded;
      }
      if (ce.condition.type === 'Identifier') {
        const cn = (ce.condition as Identifier).name;
        const Tf = jitOrSlow(ce.consequent);
        const Af = jitOrSlow(ce.alternate);
        return (b) => (b.isTruthy(b.envGet(cn)) ? Tf(b) : Af(b));
      }
      if (ce.condition.type === 'Member') {
        const flat = flattenPlainMemberChain(ce.condition as ExpressionNode);
        if (flat) {
          const loadC = compilePlainMemberChainLoad(flat.root, flat.props, ce.condition as ExpressionNode);
          const Tf = jitOrSlow(ce.consequent);
          const Af = jitOrSlow(ce.alternate);
          return (b) => (b.isTruthy(loadC(b)) ? Tf(b) : Af(b));
        }
      }
      if (ce.condition.type === 'Call') {
        const condFn = tryJitBuiltinCall(ce.condition as ExpressionNode);
        if (condFn) {
          const Tf = jitOrSlow(ce.consequent);
          const Af = jitOrSlow(ce.alternate);
          return (b) => (b.isTruthy(condFn(b)) ? Tf(b) : Af(b));
        }
      }
      const Cf = jitOrSlow(ce.condition);
      const Tf = jitOrSlow(ce.consequent);
      const Af = jitOrSlow(ce.alternate);
      return (b) => (b.isTruthy(Cf(b)) ? Tf(b) : Af(b));
    }
    case 'Member':
      return compilePlainMemberChain(expr);
    case 'Call': {
      const c = expr as CallExpression;
      return compileBuiltinCall(c);
    }
    case 'BinaryOp': {
      const bin = expr as BinaryExpression;
      const shaped = compileBinaryOpShapeSpecial(bin);
      if (shaped) return shaped;
      const op = bin.operator;
      const Lf = jitOrSlow(bin.left);
      const Rf = jitOrSlow(bin.right);

      switch (op) {
        case '+':
          return (b) => {
            const lv = Lf(b);
            const rv = Rf(b);
            if (lv.type === 'string' || rv.type === 'string') return b.evalSlow(bin);
            return { type: 'number', value: requireNum(lv) + requireNum(rv) };
          };
        case '-':
          return (b) => ({ type: 'number', value: requireNum(Lf(b)) - requireNum(Rf(b)) });
        case '*':
          return (b) => ({ type: 'number', value: requireNum(Lf(b)) * requireNum(Rf(b)) });
        case '/':
          return (b) => {
            const numerator = requireNum(Lf(b));
            const denominator = requireNum(Rf(b));
            if (denominator === 0) throw new InterpreterJitRuntimeError('Division by zero');
            return { type: 'number', value: numerator / denominator };
          };
        case '%':
          return (b) => {
            const a = requireNum(Lf(b));
            const mod = requireNum(Rf(b));
            if (mod === 0) throw new InterpreterJitRuntimeError('Division by zero');
            return { type: 'number', value: a % mod };
          };
        case '<':
          return (b) => compareRelational(bin, Lf(b), Rf(b), '<', b);
        case '>':
          return (b) => compareRelational(bin, Lf(b), Rf(b), '>', b);
        case '<=':
          return (b) => compareRelational(bin, Lf(b), Rf(b), '<=', b);
        case '>=':
          return (b) => compareRelational(bin, Lf(b), Rf(b), '>=', b);
        case '==':
          return (b) => ({ type: 'boolean', value: b.equalValues(Lf(b), Rf(b)) });
        case '!=':
          return (b) => ({ type: 'boolean', value: !b.equalValues(Lf(b), Rf(b)) });
        case '&':
          return (b) => ({ type: 'number', value: requireNum(Lf(b)) & requireNum(Rf(b)) });
        case '|':
          return (b) => ({ type: 'number', value: requireNum(Lf(b)) | requireNum(Rf(b)) });
        case '^':
          return (b) => ({ type: 'number', value: requireNum(Lf(b)) ^ requireNum(Rf(b)) });
        case '<<':
          return (b) => ({ type: 'number', value: requireNum(Lf(b)) << requireNum(Rf(b)) });
        case '>>':
          return (b) => ({ type: 'number', value: requireNum(Lf(b)) >> requireNum(Rf(b)) });
        case '>>>':
          return (b) => ({ type: 'number', value: requireNum(Lf(b)) >>> requireNum(Rf(b)) });
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

function compareRelational(bin: BinaryExpression, left: Sv, right: Sv, op: string, b: InterpreterJitBindings): Sv {
  if (left.type === 'string' && right.type === 'string') {
    const ls = left.value as string;
    const rs = right.value as string;
    let v = false;
    switch (op) {
      case '<':
        v = ls < rs;
        break;
      case '>':
        v = ls > rs;
        break;
      case '<=':
        v = ls <= rs;
        break;
      case '>=':
        v = ls >= rs;
        break;
      default:
        return b.evalSlow(bin);
    }
    return { type: 'boolean', value: v };
  }
  if (left.type === 'number' && right.type === 'number') {
    const ln = left.value as number;
    const rn = right.value as number;
    let v = false;
    switch (op) {
      case '<':
        v = ln < rn;
        break;
      case '>':
        v = ln > rn;
        break;
      case '<=':
        v = ln <= rn;
        break;
      case '>=':
        v = ln >= rn;
        break;
      default:
        return b.evalSlow(bin);
    }
    return { type: 'boolean', value: v };
  }
  return b.evalSlow(bin);
}

function evalFoldedNumericBinary(op: string, ln: number, rn: number): Sv {
  switch (op) {
    case '+':
      return { type: 'number', value: ln + rn };
    case '-':
      return { type: 'number', value: ln - rn };
    case '*':
      return { type: 'number', value: ln * rn };
    case '/':
      if (rn === 0) throw new InterpreterJitRuntimeError('Division by zero');
      return { type: 'number', value: ln / rn };
    case '%':
      if (rn === 0) throw new InterpreterJitRuntimeError('Division by zero');
      return { type: 'number', value: ln % rn };
    case '<':
      return { type: 'boolean', value: ln < rn };
    case '>':
      return { type: 'boolean', value: ln > rn };
    case '<=':
      return { type: 'boolean', value: ln <= rn };
    case '>=':
      return { type: 'boolean', value: ln >= rn };
    case '==':
      return { type: 'boolean', value: ln === rn };
    case '!=':
      return { type: 'boolean', value: ln !== rn };
    case '&':
      return { type: 'number', value: (ln | 0) & (rn | 0) };
    case '|':
      return { type: 'number', value: (ln | 0) | (rn | 0) };
    case '^':
      return { type: 'number', value: (ln | 0) ^ (rn | 0) };
    case '<<':
      return { type: 'number', value: (ln | 0) << (rn | 0) };
    case '>>':
      return { type: 'number', value: (ln | 0) >> (rn | 0) };
    case '>>>':
      return { type: 'number', value: ln >>> rn };
    default:
      throw new InterpreterJitDeopt();
  }
}

function synthNum(n: number): Sv {
  return { type: 'number', value: n };
}

/** BinaryOp shape PIC: two identifiers → direct env lookups (no nested jitOrSlow closures). */
function compileIdIdBinaryFn(op: string, ln: string, rn: string, bin: BinaryExpression): ExprJitFn {
  switch (op) {
    case '+':
      return (b) => {
        const lv = b.envGet(ln);
        const rv = b.envGet(rn);
        if (lv.type === 'string' || rv.type === 'string') return b.evalSlow(bin);
        return { type: 'number', value: requireNum(lv) + requireNum(rv) };
      };
    case '-':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) - requireNum(b.envGet(rn)) });
    case '*':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) * requireNum(b.envGet(rn)) });
    case '/':
      return (b) => {
        const numerator = requireNum(b.envGet(ln));
        const denominator = requireNum(b.envGet(rn));
        if (denominator === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: numerator / denominator };
      };
    case '%':
      return (b) => {
        const x = requireNum(b.envGet(ln));
        const mod = requireNum(b.envGet(rn));
        if (mod === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: x % mod };
      };
    case '<':
      return (b) => compareRelational(bin, b.envGet(ln), b.envGet(rn), '<', b);
    case '>':
      return (b) => compareRelational(bin, b.envGet(ln), b.envGet(rn), '>', b);
    case '<=':
      return (b) => compareRelational(bin, b.envGet(ln), b.envGet(rn), '<=', b);
    case '>=':
      return (b) => compareRelational(bin, b.envGet(ln), b.envGet(rn), '>=', b);
    case '==':
      return (b) => ({ type: 'boolean', value: b.equalValues(b.envGet(ln), b.envGet(rn)) });
    case '!=':
      return (b) => ({ type: 'boolean', value: !b.equalValues(b.envGet(ln), b.envGet(rn)) });
    case '&':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) & requireNum(b.envGet(rn)) });
    case '|':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) | requireNum(b.envGet(rn)) });
    case '^':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) ^ requireNum(b.envGet(rn)) });
    case '<<':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) << requireNum(b.envGet(rn)) });
    case '>>':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) >> requireNum(b.envGet(rn)) });
    case '>>>':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) >>> requireNum(b.envGet(rn)) });
    default:
      return (b) => b.evalSlow(bin);
  }
}

function compileIdNumBinaryFn(op: string, ln: string, rnv: number, bin: BinaryExpression): ExprJitFn {
  const rvNum = synthNum(rnv);
  switch (op) {
    case '+':
      return (b) => {
        const lv = b.envGet(ln);
        if (lv.type === 'string') return b.evalSlow(bin);
        return { type: 'number', value: requireNum(lv) + rnv };
      };
    case '-':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) - rnv });
    case '*':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) * rnv });
    case '/':
      return (b) => {
        const numerator = requireNum(b.envGet(ln));
        if (rnv === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: numerator / rnv };
      };
    case '%':
      return (b) => {
        const x = requireNum(b.envGet(ln));
        if (rnv === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: x % rnv };
      };
    case '<':
      return (b) => compareRelational(bin, b.envGet(ln), rvNum, '<', b);
    case '>':
      return (b) => compareRelational(bin, b.envGet(ln), rvNum, '>', b);
    case '<=':
      return (b) => compareRelational(bin, b.envGet(ln), rvNum, '<=', b);
    case '>=':
      return (b) => compareRelational(bin, b.envGet(ln), rvNum, '>=', b);
    case '==':
      return (b) => ({ type: 'boolean', value: b.equalValues(b.envGet(ln), rvNum) });
    case '!=':
      return (b) => ({ type: 'boolean', value: !b.equalValues(b.envGet(ln), rvNum) });
    case '&':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) & rnv });
    case '|':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) | rnv });
    case '^':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) ^ rnv });
    case '<<':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) << rnv });
    case '>>':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) >> rnv });
    case '>>>':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) >>> rnv });
    default:
      return (b) => b.evalSlow(bin);
  }
}

function compileNumIdBinaryFn(op: string, lnv: number, rn: string, bin: BinaryExpression): ExprJitFn {
  const lvNum = synthNum(lnv);
  switch (op) {
    case '+':
      return (b) => {
        const rv = b.envGet(rn);
        if (rv.type === 'string') return b.evalSlow(bin);
        return { type: 'number', value: lnv + requireNum(rv) };
      };
    case '-':
      return (b) => ({ type: 'number', value: lnv - requireNum(b.envGet(rn)) });
    case '*':
      return (b) => ({ type: 'number', value: lnv * requireNum(b.envGet(rn)) });
    case '/':
      return (b) => {
        const denominator = requireNum(b.envGet(rn));
        if (denominator === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: lnv / denominator };
      };
    case '%':
      return (b) => {
        const mod = requireNum(b.envGet(rn));
        if (mod === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: lnv % mod };
      };
    case '<':
      return (b) => compareRelational(bin, lvNum, b.envGet(rn), '<', b);
    case '>':
      return (b) => compareRelational(bin, lvNum, b.envGet(rn), '>', b);
    case '<=':
      return (b) => compareRelational(bin, lvNum, b.envGet(rn), '<=', b);
    case '>=':
      return (b) => compareRelational(bin, lvNum, b.envGet(rn), '>=', b);
    case '==':
      return (b) => ({ type: 'boolean', value: b.equalValues(lvNum, b.envGet(rn)) });
    case '!=':
      return (b) => ({ type: 'boolean', value: !b.equalValues(lvNum, b.envGet(rn)) });
    case '&':
      return (b) => ({ type: 'number', value: lnv & requireNum(b.envGet(rn)) });
    case '|':
      return (b) => ({ type: 'number', value: lnv | requireNum(b.envGet(rn)) });
    case '^':
      return (b) => ({ type: 'number', value: lnv ^ requireNum(b.envGet(rn)) });
    case '<<':
      return (b) => ({ type: 'number', value: lnv << requireNum(b.envGet(rn)) });
    case '>>':
      return (b) => ({ type: 'number', value: lnv >> requireNum(b.envGet(rn)) });
    case '>>>':
      return (b) => ({ type: 'number', value: lnv >>> requireNum(b.envGet(rn)) });
    default:
      return (b) => b.evalSlow(bin);
  }
}

/** BinaryOp left operand produced by member-chain loader (e.g. `obj.f.g + rhs`). */
function compileLoadedIdBinaryFn(op: string, loadL: ExprJitFn, rn: string, bin: BinaryExpression): ExprJitFn {
  switch (op) {
    case '+':
      return (b) => {
        const lv = loadL(b);
        const rv = b.envGet(rn);
        if (lv.type === 'string' || rv.type === 'string') return b.evalSlow(bin);
        return { type: 'number', value: requireNum(lv) + requireNum(rv) };
      };
    case '-':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) - requireNum(b.envGet(rn)) });
    case '*':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) * requireNum(b.envGet(rn)) });
    case '/':
      return (b) => {
        const numerator = requireNum(loadL(b));
        const denominator = requireNum(b.envGet(rn));
        if (denominator === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: numerator / denominator };
      };
    case '%':
      return (b) => {
        const x = requireNum(loadL(b));
        const mod = requireNum(b.envGet(rn));
        if (mod === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: x % mod };
      };
    case '<':
      return (b) => compareRelational(bin, loadL(b), b.envGet(rn), '<', b);
    case '>':
      return (b) => compareRelational(bin, loadL(b), b.envGet(rn), '>', b);
    case '<=':
      return (b) => compareRelational(bin, loadL(b), b.envGet(rn), '<=', b);
    case '>=':
      return (b) => compareRelational(bin, loadL(b), b.envGet(rn), '>=', b);
    case '==':
      return (b) => ({ type: 'boolean', value: b.equalValues(loadL(b), b.envGet(rn)) });
    case '!=':
      return (b) => ({ type: 'boolean', value: !b.equalValues(loadL(b), b.envGet(rn)) });
    case '&':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) & requireNum(b.envGet(rn)) });
    case '|':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) | requireNum(b.envGet(rn)) });
    case '^':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) ^ requireNum(b.envGet(rn)) });
    case '<<':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) << requireNum(b.envGet(rn)) });
    case '>>':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) >> requireNum(b.envGet(rn)) });
    case '>>>':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) >>> requireNum(b.envGet(rn)) });
    default:
      return (b) => b.evalSlow(bin);
  }
}

function compileLoadedNumBinaryFn(op: string, loadL: ExprJitFn, rnv: number, bin: BinaryExpression): ExprJitFn {
  const rvNum = synthNum(rnv);
  switch (op) {
    case '+':
      return (b) => {
        const lv = loadL(b);
        if (lv.type === 'string') return b.evalSlow(bin);
        return { type: 'number', value: requireNum(lv) + rnv };
      };
    case '-':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) - rnv });
    case '*':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) * rnv });
    case '/':
      return (b) => {
        const numerator = requireNum(loadL(b));
        if (rnv === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: numerator / rnv };
      };
    case '%':
      return (b) => {
        const x = requireNum(loadL(b));
        if (rnv === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: x % rnv };
      };
    case '<':
      return (b) => compareRelational(bin, loadL(b), rvNum, '<', b);
    case '>':
      return (b) => compareRelational(bin, loadL(b), rvNum, '>', b);
    case '<=':
      return (b) => compareRelational(bin, loadL(b), rvNum, '<=', b);
    case '>=':
      return (b) => compareRelational(bin, loadL(b), rvNum, '>=', b);
    case '==':
      return (b) => ({ type: 'boolean', value: b.equalValues(loadL(b), rvNum) });
    case '!=':
      return (b) => ({ type: 'boolean', value: !b.equalValues(loadL(b), rvNum) });
    case '&':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) & rnv });
    case '|':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) | rnv });
    case '^':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) ^ rnv });
    case '<<':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) << rnv });
    case '>>':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) >> rnv });
    case '>>>':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) >>> rnv });
    default:
      return (b) => b.evalSlow(bin);
  }
}

/** BinaryOp: Identifier ⊕ member-chain (rhs loaded via PIC). */
function compileIdLoadedBinaryFn(op: string, ln: string, loadR: ExprJitFn, bin: BinaryExpression): ExprJitFn {
  switch (op) {
    case '+':
      return (b) => {
        const lv = b.envGet(ln);
        const rv = loadR(b);
        if (lv.type === 'string' || rv.type === 'string') return b.evalSlow(bin);
        return { type: 'number', value: requireNum(lv) + requireNum(rv) };
      };
    case '-':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) - requireNum(loadR(b)) });
    case '*':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) * requireNum(loadR(b)) });
    case '/':
      return (b) => {
        const numerator = requireNum(b.envGet(ln));
        const denominator = requireNum(loadR(b));
        if (denominator === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: numerator / denominator };
      };
    case '%':
      return (b) => {
        const x = requireNum(b.envGet(ln));
        const mod = requireNum(loadR(b));
        if (mod === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: x % mod };
      };
    case '<':
      return (b) => compareRelational(bin, b.envGet(ln), loadR(b), '<', b);
    case '>':
      return (b) => compareRelational(bin, b.envGet(ln), loadR(b), '>', b);
    case '<=':
      return (b) => compareRelational(bin, b.envGet(ln), loadR(b), '<=', b);
    case '>=':
      return (b) => compareRelational(bin, b.envGet(ln), loadR(b), '>=', b);
    case '==':
      return (b) => ({ type: 'boolean', value: b.equalValues(b.envGet(ln), loadR(b)) });
    case '!=':
      return (b) => ({ type: 'boolean', value: !b.equalValues(b.envGet(ln), loadR(b)) });
    case '&':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) & requireNum(loadR(b)) });
    case '|':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) | requireNum(loadR(b)) });
    case '^':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) ^ requireNum(loadR(b)) });
    case '<<':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) << requireNum(loadR(b)) });
    case '>>':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) >> requireNum(loadR(b)) });
    case '>>>':
      return (b) => ({ type: 'number', value: requireNum(b.envGet(ln)) >>> requireNum(loadR(b)) });
    default:
      return (b) => b.evalSlow(bin);
  }
}

/** BinaryOp: NumberLiteral ⊕ member-chain. */
function compileNumLoadedBinaryFn(op: string, lnv: number, loadR: ExprJitFn, bin: BinaryExpression): ExprJitFn {
  const lvNum = synthNum(lnv);
  switch (op) {
    case '+':
      return (b) => {
        const rv = loadR(b);
        if (rv.type === 'string') return b.evalSlow(bin);
        return { type: 'number', value: lnv + requireNum(rv) };
      };
    case '-':
      return (b) => ({ type: 'number', value: lnv - requireNum(loadR(b)) });
    case '*':
      return (b) => ({ type: 'number', value: lnv * requireNum(loadR(b)) });
    case '/':
      return (b) => {
        const denominator = requireNum(loadR(b));
        if (denominator === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: lnv / denominator };
      };
    case '%':
      return (b) => {
        const mod = requireNum(loadR(b));
        if (mod === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: lnv % mod };
      };
    case '<':
      return (b) => compareRelational(bin, lvNum, loadR(b), '<', b);
    case '>':
      return (b) => compareRelational(bin, lvNum, loadR(b), '>', b);
    case '<=':
      return (b) => compareRelational(bin, lvNum, loadR(b), '<=', b);
    case '>=':
      return (b) => compareRelational(bin, lvNum, loadR(b), '>=', b);
    case '==':
      return (b) => ({ type: 'boolean', value: b.equalValues(lvNum, loadR(b)) });
    case '!=':
      return (b) => ({ type: 'boolean', value: !b.equalValues(lvNum, loadR(b)) });
    case '&':
      return (b) => ({ type: 'number', value: lnv & requireNum(loadR(b)) });
    case '|':
      return (b) => ({ type: 'number', value: lnv | requireNum(loadR(b)) });
    case '^':
      return (b) => ({ type: 'number', value: lnv ^ requireNum(loadR(b)) });
    case '<<':
      return (b) => ({ type: 'number', value: lnv << requireNum(loadR(b)) });
    case '>>':
      return (b) => ({ type: 'number', value: lnv >> requireNum(loadR(b)) });
    case '>>>':
      return (b) => ({ type: 'number', value: lnv >>> requireNum(loadR(b)) });
    default:
      return (b) => b.evalSlow(bin);
  }
}

/** Generic binary PIC when both operands are already ExprJitFns (env load, member PIC, builtin JIT, etc.). */
function compileDyadicBinaryFn(op: string, loadL: ExprJitFn, loadR: ExprJitFn, bin: BinaryExpression): ExprJitFn {
  switch (op) {
    case '+':
      return (b) => {
        const lv = loadL(b);
        const rv = loadR(b);
        if (lv.type === 'string' || rv.type === 'string') return b.evalSlow(bin);
        return { type: 'number', value: requireNum(lv) + requireNum(rv) };
      };
    case '-':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) - requireNum(loadR(b)) });
    case '*':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) * requireNum(loadR(b)) });
    case '/':
      return (b) => {
        const numerator = requireNum(loadL(b));
        const denominator = requireNum(loadR(b));
        if (denominator === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: numerator / denominator };
      };
    case '%':
      return (b) => {
        const x = requireNum(loadL(b));
        const mod = requireNum(loadR(b));
        if (mod === 0) throw new InterpreterJitRuntimeError('Division by zero');
        return { type: 'number', value: x % mod };
      };
    case '<':
      return (b) => compareRelational(bin, loadL(b), loadR(b), '<', b);
    case '>':
      return (b) => compareRelational(bin, loadL(b), loadR(b), '>', b);
    case '<=':
      return (b) => compareRelational(bin, loadL(b), loadR(b), '<=', b);
    case '>=':
      return (b) => compareRelational(bin, loadL(b), loadR(b), '>=', b);
    case '==':
      return (b) => ({ type: 'boolean', value: b.equalValues(loadL(b), loadR(b)) });
    case '!=':
      return (b) => ({ type: 'boolean', value: !b.equalValues(loadL(b), loadR(b)) });
    case '&':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) & requireNum(loadR(b)) });
    case '|':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) | requireNum(loadR(b)) });
    case '^':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) ^ requireNum(loadR(b)) });
    case '<<':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) << requireNum(loadR(b)) });
    case '>>':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) >> requireNum(loadR(b)) });
    case '>>>':
      return (b) => ({ type: 'number', value: requireNum(loadL(b)) >>> requireNum(loadR(b)) });
    default:
      return (b) => b.evalSlow(bin);
  }
}

/** BinaryOp: member-chain ⊕ member-chain */
function compileLoadedLoadedBinaryFn(op: string, loadL: ExprJitFn, loadR: ExprJitFn, bin: BinaryExpression): ExprJitFn {
  return compileDyadicBinaryFn(op, loadL, loadR, bin);
}

function tryJitBuiltinCall(expr: ExpressionNode): ExprJitFn | null {
  if (expr.type !== 'Call') return null;
  return compileBuiltinCall(expr as CallExpression);
}

function compileBinaryOpShapeSpecial(bin: BinaryExpression): ExprJitFn | null {
  const op = bin.operator;
  if (!INTERP_JIT_BINARY_OPS.has(op)) return null;

  const L = bin.left;
  const R = bin.right;

  if (L.type === 'NumberLiteral' && R.type === 'NumberLiteral') {
    const ln = (L as NumberLiteral).value;
    const rn = (R as NumberLiteral).value;
    return () => evalFoldedNumericBinary(op, ln, rn);
  }

  if (L.type === 'Identifier' && R.type === 'Identifier') {
    return compileIdIdBinaryFn(op, (L as Identifier).name, (R as Identifier).name, bin);
  }

  if (L.type === 'Identifier' && R.type === 'NumberLiteral') {
    return compileIdNumBinaryFn(op, (L as Identifier).name, (R as NumberLiteral).value, bin);
  }

  if (L.type === 'NumberLiteral' && R.type === 'Identifier') {
    return compileNumIdBinaryFn(op, (L as NumberLiteral).value, (R as Identifier).name, bin);
  }

  if (L.type === 'Call') {
    const bcL = tryJitBuiltinCall(L as ExpressionNode);
    if (bcL) {
      if (R.type === 'Identifier') {
        return compileDyadicBinaryFn(op, bcL, (b) => b.envGet((R as Identifier).name), bin);
      }
      if (R.type === 'NumberLiteral') {
        const rn = (R as NumberLiteral).value;
        return compileDyadicBinaryFn(op, bcL, (_b) => synthNum(rn), bin);
      }
      if (R.type === 'Member') {
        const flatR = flattenPlainMemberChain(R);
        if (flatR) {
          const loadR = compilePlainMemberChainLoad(flatR.root, flatR.props, R as ExpressionNode);
          return compileDyadicBinaryFn(op, bcL, loadR, bin);
        }
      }
      if (R.type === 'Call') {
        const bcR = tryJitBuiltinCall(R as ExpressionNode);
        if (bcR) return compileDyadicBinaryFn(op, bcL, bcR, bin);
      }
    }
  }

  if (L.type === 'Identifier' && R.type === 'Member') {
    const flatR = flattenPlainMemberChain(R);
    if (flatR) {
      const loadR = compilePlainMemberChainLoad(flatR.root, flatR.props, R as ExpressionNode);
      return compileIdLoadedBinaryFn(op, (L as Identifier).name, loadR, bin);
    }
  }

  if (L.type === 'Identifier' && R.type === 'Call') {
    const bc = tryJitBuiltinCall(R as ExpressionNode);
    if (bc) {
      return compileDyadicBinaryFn(op, (b) => b.envGet((L as Identifier).name), bc, bin);
    }
  }

  if (L.type === 'NumberLiteral' && R.type === 'Member') {
    const flatR = flattenPlainMemberChain(R);
    if (flatR) {
      const loadR = compilePlainMemberChainLoad(flatR.root, flatR.props, R as ExpressionNode);
      return compileNumLoadedBinaryFn(op, (L as NumberLiteral).value, loadR, bin);
    }
  }

  if (L.type === 'NumberLiteral' && R.type === 'Call') {
    const bc = tryJitBuiltinCall(R as ExpressionNode);
    if (bc) {
      const ln = (L as NumberLiteral).value;
      return compileDyadicBinaryFn(op, (_b) => synthNum(ln), bc, bin);
    }
  }

  if (L.type === 'Member') {
    const flatM = flattenPlainMemberChain(L);
    if (flatM) {
      const loadL = compilePlainMemberChainLoad(flatM.root, flatM.props, L as ExpressionNode);
      if (R.type === 'Identifier') {
        return compileLoadedIdBinaryFn(op, loadL, (R as Identifier).name, bin);
      }
      if (R.type === 'NumberLiteral') {
        return compileLoadedNumBinaryFn(op, loadL, (R as NumberLiteral).value, bin);
      }
      if (R.type === 'Member') {
        const flatR = flattenPlainMemberChain(R);
        if (flatR) {
          const loadR = compilePlainMemberChainLoad(flatR.root, flatR.props, R as ExpressionNode);
          return compileLoadedLoadedBinaryFn(op, loadL, loadR, bin);
        }
      }
      if (R.type === 'Call') {
        const bc = tryJitBuiltinCall(R as ExpressionNode);
        if (bc) return compileDyadicBinaryFn(op, loadL, bc, bin);
      }
    }
  }

  return null;
}
