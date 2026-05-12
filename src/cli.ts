#!/usr/bin/env node

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from './core/parser';
import { printUsage } from './cli/cli_usage';
import { runFile, runEval, watchFile } from './cli/cli_run_modes';
import { runClcNativeCompile } from './cli/cli_clc_native';
import { formatCode, lintCode, showStats } from './cli/cli_dev_tools';
import { parseCliArgs } from './cli/cli_argv';
import { startRepl } from './cli/cli_repl';
import { SL_RUNTIME } from './cli/clc_runtime';
import { collectLocalVars } from './cli/compiler_shared';
import { CLC_EXPR_UNSUPPORTED_HINTS, CLC_STMT_UNSUPPORTED_HINTS, ClcCompileError, getClcUnsupportedBoundary } from './cli/clc_types';
export { getClcUnsupportedBoundary };
import { compileToJS, findMemoizableFunctions } from './cli/js_compiler';
import { appendSourceMappingUrl, buildSeedCompileSourceMap } from './cli/seed_source_map';

/** ACAE: pairwise `a==b && b==c` — never emit C's wrong `encoding==encoding==…`. */
function acaeArraysShareEncodingExpr(uniqueArrs: string[]): string {
  if (uniqueArrs.length <= 1) return '1';
  const a0 = `sl_${uniqueArrs[0]}->encoding`;
  return uniqueArrs.slice(1).map(a => `${a0} == sl_${a}->encoding`).join(' && ');
}

/** Replace `sl_arr_set_int(sl_arr, idx, val)` for one array; val may contain nested `()`. */
function acaeRewriteSlArrSetIntForArray(code: string, arr: string, enc: 'i32' | 'i64'): string {
  const prefix = `sl_arr_set_int(sl_${arr},`;
  const field = enc === 'i32' ? 'i32' : 'i64';
  const cast = enc === 'i32' ? '' : '(long long)';
  const access = enc === 'i32' ? `_sl_r_${arr}` : `sl_${arr}->${field}`;
  let out = '';
  let i = 0;
  while (i < code.length) {
    const at = code.indexOf(prefix, i);
    if (at === -1) {
      out += code.slice(i);
      break;
    }
    out += code.slice(i, at);
    let p = at + prefix.length;
    while (p < code.length && /\s/.test(code[p])) p++;
    let depth = 0;
    const i0 = p;
    let valid = false;
    for (; p < code.length; p++) {
      const ch = code[p];
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth > 0) depth--;
        else break;
      } else if (ch === ',' && depth === 0) {
        valid = true;
        break;
      }
    }
    if (!valid) {
      out += code.slice(at, at + prefix.length);
      i = at + prefix.length;
      continue;
    }
    const indexExpr = code.slice(i0, p).trim();
    p++;
    while (p < code.length && /\s/.test(code[p])) p++;
    depth = 0;
    const v0 = p;
    let valueEnd = -1;
    for (; p < code.length; p++) {
      const ch = code[p];
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) {
          valueEnd = p;
          break;
        }
        depth--;
      }
    }
    if (valueEnd < 0) {
      out += code.slice(at);
      break;
    }
    const valExpr = code.slice(v0, valueEnd).trim();
    out += `${access}[${indexExpr}] = ${cast}(${valExpr});`;
    p = valueEnd + 1;
    while (p < code.length && /\s/.test(code[p])) p++;
    if (p < code.length && code[p] === ';') p++;
    i = p;
  }
  return out;
}

/**
 * Rewrite `sl_arr_get(sl_${arr}, <index>)` to direct `->i32` / `->i64` access.
 * Index may contain nested `()` (e.g. casts); a naive `[^)]+` regex truncates those and leaves boxed gets.
 */
function acaeRewriteSlArrGetForArray(code: string, arr: string, enc: 'i32' | 'i64'): string {
  const field = enc === 'i32' ? 'i32' : 'i64';
  const cast = enc === 'i32' ? '' : '';
  const access = enc === 'i32' ? `_sl_r_${arr}` : `sl_${arr}->${field}`;
  const idNeedle = `sl_${arr}`;
  let out = '';
  let i = 0;
  while (i < code.length) {
    const callAt = code.indexOf('sl_arr_get(', i);
    if (callAt === -1) {
      out += code.slice(i);
      break;
    }
    let p = callAt + 'sl_arr_get('.length;
    while (p < code.length && /\s/.test(code[p])) p++;
    if (p + idNeedle.length > code.length || code.slice(p, p + idNeedle.length) !== idNeedle) {
      out += code.slice(i, callAt + 1);
      i = callAt + 1;
      continue;
    }
    const afterId = p + idNeedle.length;
    if (afterId < code.length && /[A-Za-z0-9_]/.test(code[afterId])) {
      out += code.slice(i, callAt + 1);
      i = callAt + 1;
      continue;
    }
    p = afterId;
    while (p < code.length && /\s/.test(code[p])) p++;
    if (p >= code.length || code[p] !== ',') {
      out += code.slice(i, callAt + 1);
      i = callAt + 1;
      continue;
    }
    p++;
    while (p < code.length && /\s/.test(code[p])) p++;
    const indexStart = p;
    let depth = 0;
    let indexEnd = -1;
    for (; p < code.length; p++) {
      const ch = code[p];
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) {
          indexEnd = p;
          break;
        }
        depth--;
      }
    }
    if (indexEnd < 0) {
      out += code.slice(i);
      break;
    }
    const indexExpr = code.slice(indexStart, indexEnd).trim();
    out += code.slice(i, callAt);
    out += `${cast}${access}[${indexExpr}]`;
    p = indexEnd + 1;
    i = p;
  }
  return out;
}

function acaeBodyWithDirectGetsSets(bodyCode: string, uniqueArrs: string[], enc: 'i32' | 'i64'): string {
  let c = bodyCode;
  for (const arr of uniqueArrs) {
    c = acaeRewriteSlArrGetForArray(c, arr, enc);
  }
  for (const arr of uniqueArrs) {
    c = acaeRewriteSlArrSetIntForArray(c, arr, enc);
  }
  if (enc === 'i32') {
    c = c.replace(/\bsl_(\w+) \* sl_(\w+)\b/g, 'sl_$1 * sl_$2');
  }
  return c;
}

function acaeI32RestrictDecls(uniqueArrs: string[]): string {
  return uniqueArrs.map(a => `int * __restrict__ _sl_r_${a} = sl_${a}->i32;`).join(' ');
}

function acaeI32ShadowVars(bodyCode: string, arrayVarNames?: Set<string>): string {
  const assigned = new Set<string>();
  const accumulator = new Set<string>();
  const assignRe = /\bsl_(\w+)\s*(=|\+\+|--|\+=|-=)/g;
  let m;
  while ((m = assignRe.exec(bodyCode)) !== null) {
    const name = m[1];
    // Statement-expr temps from Win32 fast setPixel: sl__px / sl__py / sl__pc (regex group is _px/_py/_pc).
    if (/^_(px|py|pc)$/.test(name)) continue;
    if (/^(frame|particleCount|W|H|BGSTEP|MAXF|FIXED_PARTICLE_N|STOP_AT_FRAMES|PIXEL_HUD|diag|smoothFps|lastPerfMs|nowMs|dtm|inst)$/.test(name)) continue;
    if (arrayVarNames && arrayVarNames.has(name)) continue;
    assigned.add(name);
    if (m[2] === '+=' || m[2] === '-=') {
      accumulator.add(name);
    }
  }
  const selfAccRe = /\bsl_(\w+)\s*=\s*[^;]*\bsl_\1\b/g;
  let sam;
  while ((sam = selfAccRe.exec(bodyCode)) !== null) {
    accumulator.add(sam[1]);
  }
  const readRe = /\bsl_(\w+)\b/g;
  let rm: RegExpExecArray | null;
  while ((rm = readRe.exec(bodyCode)) !== null) {
    const name = rm[1];
    if (name.length > 2 && /^(particleCount)$/.test(name)) {
      continue;
    }
  }
  const idxRe = /_sl_r_\w+\[\s*sl_(\w+)\s*\]/g;
  let im: RegExpExecArray | null;
  while ((im = idxRe.exec(bodyCode)) !== null) {
    const name = im[1];
    if (/^_(px|py|pc)$/.test(name)) continue;
    if (/^(frame|W|H|BGSTEP|MAXF|FIXED_PARTICLE_N|STOP_AT_FRAMES|PIXEL_HUD|diag|smoothFps|lastPerfMs|nowMs|dtm|inst)$/.test(name)) continue;
    if (arrayVarNames && arrayVarNames.has(name)) continue;
    assigned.add(name);
  }
  for (const acc of accumulator) {
    assigned.delete(acc);
  }
  if (assigned.size === 0) return '';
  return ' ' + [...assigned].map(v => `int _si_${v} = (int)sl_${v};`).join(' ');
}

/**
 * loopVarShadow rewrites the whole while-body string, replacing every `sl_x` with `_wl_x`. If the body
 * already contains a nested while/for that emitted its own `_wl_x` block (e.g. `(int)sl_accumMs`), an
 * outer rewrite would corrupt that inner init and/or nest `{ int _wl_x = (int)_wl_x }` shadows.
 * Skip the optimization on this while when the body AST contains any nested loop.
 */
function clcWhileBodyContainsNestedLoop(stmts: any[]): boolean {
  if (!Array.isArray(stmts)) return false;
  for (const s of stmts) {
    if (!s || typeof s !== 'object') continue;
    const t = s.type;
    if (t === 'While' || t === 'WhileStatement' || t === 'ForIn' || t === 'For' || t === 'ForStmt' || t === 'ForStatement') {
      return true;
    }
    for (const k of Object.keys(s)) {
      const v = (s as any)[k];
      if (Array.isArray(v) && clcWhileBodyContainsNestedLoop(v)) return true;
    }
  }
  return false;
}

export function compileToC(source: string, options: any = {}): string {
  const program = parse(source);
  if (options.verbose) options.acaeDiagnostics = true;
  const clcWarnings: string[] = [];
  const acaeDiag: string[] = [];
  const { locals: topLocals, initExprs: topInitExprs, forInScopedVars: topForInScoped } = collectLocalVars(program.statements, [], new Set());
  for (const v of topForInScoped) topLocals.add(v);
  const memoizable = options.noMemo ? new Set<string>() : findMemoizableFunctions(program);

  const integerVars = new Set<string>();
  const floatVars = new Set<string>();
  const boolVars = new Set<string>();
  const stringVars = new Set<string>();
  const arrayVars = new Set<string>();
  const objectVars = new Set<string>();
  const objectFields = new Map<string, Map<string, string>>();
  const funcParamTypes = new Map<string, string[]>();
  const funcReturnTypes = new Map<string, string>();
  const funcReturnArrayElemTypes = new Map<string, string>();
  const funcReturnFields = new Map<string, Map<string, string>>();
  const funcLocalVars = new Map<string, Set<string>>();
  const funcLocalVarTypes = new Map<string, Map<string, string>>();
  const classDefs = new Map<string, { properties: Map<string, string>; methods: Map<string, { params: string[]; returnType: string }>; superClass?: string }>();
  const instanceVars = new Map<string, string>();
  const macroDefs = new Map<string, { params: string[]; hasReturn: boolean }>();
  const runtimeFuncNames = new Set(['abs','sqrt','floor','ceil','round','pow','min','max','sin','cos','tan','log','exp','clamp','asin','acos','atan','atan2','log2','log10','random','sort','reverse','indexOf','includes','join','sum','avg','upper','lower','trim','replace','substring','split','charAt','startsWith','endsWith','repeat','toString','str','num','int','float','toFloat','parseInt','parseFloat','type','typeof','keys','values','has','time','PI','E','range','rangeRev','find','findIndex','every','some','forEach','flat','fill','strIndexOf','strIncludes','strLen','concat','unique','slice','pop','shift','push','reserve','withCapacity','len','map','filter','reduce','print','printf','mapSet','mapGet','mapHas','mapDelete','mapKeys','mapValues','mapEntries','mapSize','mapClear','mapForEach','setAdd','setHas','setDelete','setSize','setToArray','setClear','setForEach']);
  const userFuncRenames = new Map<string, string>();
  const userFuncNames = new Set<string>();
  let currentClassName: string | null = null;
  let currentFuncName: string | null = null;
  let currentFuncParams: string[] = [];
  let currentFuncInitExprs: Map<string, any> | null = null;
  const closureTypeVars = new Set<string>();
  const closureParamCounts = new Map<string, number>();
  const generatedWrappers = new Set<string>();
  const capturedTopVars = new Set<string>();
  const arrayElementTypes = new Map<string, string>();
  /** Top-level locals assigned from `arr[i]` where elements are class pointers (e.g. `mob = mobs[mi]`). */
  const topLocalClassPtrTypes = new Map<string, string>();
  const forInIterVars = new Set<string>();
  const noPreExtractVars = new Set<string>();
  const closureReturnTypes = new Map<string, string>();
  const funcReferencedTopVars = new Set<string>();
  const userFuncParamCounts = new Map<string, number>();
  for (const stmt of program.statements) {
    if (stmt.type === 'FunctionDef') {
      userFuncNames.add((stmt as any).name);
      userFuncParamCounts.set((stmt as any).name, ((stmt as any).params || []).length);
    }
  }
  let _closureId = 0;
  let destrCounter = 0;

  function ensureClosureWrapper(fnName: string, paramCount: number): string {
    const suffix = paramCount <= 1 ? '' : '2';
    const wrapperName = `_cl_wrap${suffix}_${fnName}`;
    if (generatedWrappers.has(wrapperName)) return wrapperName;
    generatedWrappers.add(wrapperName);
    if (paramCount <= 1) {
      funcDefs.push(`static long long ${wrapperName}(void* _ctx, long long _a0) { return sl_${fnName}(_a0); }`);
    } else if (paramCount === 2) {
      funcDefs.push(`static long long ${wrapperName}(void* _ctx, long long _a0, long long _a1) { return sl_${fnName}(_a0, _a1); }`);
    } else {
      const params = Array.from({ length: paramCount }, (_, i) => `long long _a${i}`).join(', ');
      const args = Array.from({ length: paramCount }, (_, i) => `_a${i}`).join(', ');
      funcDefs.push(`static long long ${wrapperName}(void* _ctx, ${params}) { return sl_${fnName}(${args}); }`);
    }
    return wrapperName;
  }

  function parentHasProperty(superClassName: string | undefined | null, propName: string): boolean {
    if (!superClassName) return false;
    const parentCls = classDefs.get(superClassName);
    if (!parentCls) return false;
    if (parentCls.properties.has(propName)) return true;
    return parentHasProperty(parentCls.superClass, propName);
  }

  function compileClosure(fnNode: any, isReduce: boolean = false, paramTypeHints: string[] = [], sourceArrayName: string = ''): string {
    const cid = ++_closureId;
    const params = fnNode.params || [];
    let rawBody = fnNode.body || [];
    if (rawBody.type === 'Block' || rawBody.type === 'BlockStatement') rawBody = rawBody.statements || [];
    const stmtTypes = new Set(['Return', 'ReturnStatement', 'VarDecl', 'LetDecl', 'IfStatement', 'If', 'WhileStatement', 'While', 'ForIn', 'For', 'ForStmt', 'ForStatement', 'Switch', 'SwitchStmt', 'Try', 'TryStmt', 'Throw', 'ThrowStmt', 'Break', 'Continue', 'Assignment', 'ClassDef', 'FunctionDef']);
    const isExprBody = !Array.isArray(rawBody) && !stmtTypes.has(rawBody.type);
    let body: any[];
    if (isExprBody) {
      body = [{ type: 'Return', value: rawBody }];
    } else {
      body = Array.isArray(rawBody) ? rawBody : [rawBody];
    }
    const fnName = fnNode.name || `_cl_${cid}`;
    const capturedVars = new Map<string, string>();

    const scanCaptured = (node: any, localScope: Set<string>) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier' && node.name) {
        const n = node.name;
        if (!localScope.has(n) && !['print','len','push','reserve','withCapacity','pop','shift','map','filter','reduce','abs','sqrt','floor','ceil','round','pow','min','max','sin','cos','tan','log','exp','range','rangeRev','sort','reverse','indexOf','includes','join','sum','avg','upper','lower','trim','replace','substring','split','charAt','startsWith','endsWith','repeat','toString','str','num','int','float','toFloat','parseInt','parseFloat','type','typeof','keys','values','has','time','random','PI','E','clamp','slice','concat','unique','find','findIndex','every','some','forEach','flat','fill','strIndexOf','strIncludes','strLen','asin','acos','atan','atan2','log2','log10'].includes(n)) {
          const topLevel = topLocals.has(n) || stringVars.has(n) || arrayVars.has(n) || objectVars.has(n) || instanceVars.has(n) || objectFields.has(n);
          const funcLevel = currentFuncInitExprs && currentFuncInitExprs.has(n);
          const paramLevel = currentFuncParams && currentFuncParams.includes(n);
          if (topLevel) { capturedVars.set(n, 'top'); capturedTopVars.add(n); }
          else if (funcLevel || paramLevel) capturedVars.set(n, 'local');
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'loc' || key === 'range') continue;
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach((c: any) => scanCaptured(c, localScope));
        } else if (child && typeof child === 'object') {
          scanCaptured(child, localScope);
        }
      }
    };

    const paramNames: Set<string> = new Set<string>(params.map((p: any) => typeof p === 'string' ? p : p.name));
    const bodyLocalVars: Set<string> = new Set<string>();
    const parentScopeVars = new Set<string>();
    if (currentFuncInitExprs) {
      for (const k of currentFuncInitExprs.keys()) parentScopeVars.add(k);
    }
    if (currentFuncParams) {
      for (const p of currentFuncParams) parentScopeVars.add(p);
    }
    const scanBodyLocals = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if ((node.type === 'Assignment' || node.type === 'VarDecl') && node.target?.name) {
        const tname = node.target.name;
        if (!parentScopeVars.has(tname) && !paramNames.has(tname)) {
          bodyLocalVars.add(tname);
        }
      }
      if (node.type === 'For' || node.type === 'ForStmt' || node.type === 'ForStatement') {
        if (node.init?.target?.name) {
          const tname = node.init.target.name;
          if (!parentScopeVars.has(tname) && !paramNames.has(tname)) {
            bodyLocalVars.add(tname);
          }
        }
      }
      if (node.type === 'ForIn' && node.variable) {
        if (!parentScopeVars.has(node.variable) && !paramNames.has(node.variable)) {
          bodyLocalVars.add(node.variable);
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'loc' || key === 'range') continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach((c: any) => scanBodyLocals(c));
        else if (child && typeof child === 'object') scanBodyLocals(child);
      }
    };
    body.forEach((s: any) => scanBodyLocals(s));
    const allLocal: Set<string> = new Set([...paramNames, ...bodyLocalVars]);
    body.forEach((s: any) => scanCaptured(s, allLocal));

    const ctxStructName = `SlCtx_${fnName}_${cid}`;
    const ctxFields: string[] = [];
    for (const [v, kind] of capturedVars) {
      const vt = varType(v);
      if (kind === 'top') {
        ctxFields.push(`    ${vt}* ${v};`);
      } else {
        ctxFields.push(`    ${vt} ${v};`);
      }
    }

    if (ctxFields.length > 0) {
      funcDefs.push(`typedef struct {\n${ctxFields.join('\n')}\n} ${ctxStructName};`);
    }

    const closureFnName = `sl_closure_${fnName}_${cid}`;
    const closureParams = ['void* _ctx'];
    const closureParamTypes: string[] = [];
    for (const p of params) {
      const pname = typeof p === 'string' ? p : p.name;
      const pidx = params.indexOf(p);
      const pt = (pidx < paramTypeHints.length && paramTypeHints[pidx]) ? paramTypeHints[pidx] : varType(pname);
      closureParamTypes.push(pt);
      if (pt !== 'long long') {
        closureParams.push(`long long sl_${pname}_arg`);
      } else {
        closureParams.push(`long long sl_${pname}`);
      }
    }

    const savedFuncInitExprs2 = currentFuncInitExprs;
    const savedVarInited2 = new Set(varInitedInDecl);
    const savedClsName2: string | null = currentClassName;
    currentClassName = null;
    varInitedInDecl.clear();

    const savedStringVars = new Set(stringVars);
    const savedArrayVars = new Set(arrayVars);
    const savedObjectVars = new Set(objectVars);
    const savedFloatVars = new Set(floatVars);
    const savedIntegerVars = new Set(integerVars);
    const savedFuncName = currentFuncName;
    const savedFuncParams = currentFuncParams ? [...currentFuncParams] : [];
    const savedObjectFields = new Map(objectFields);
    const savedForInIterVars = new Set(forInIterVars);
    for (const p of params) {
      const pname = typeof p === 'string' ? p : p.name;
      forInIterVars.delete(pname);
      noPreExtractVars.add(pname);
    }
    for (const p of params) {
      const pname = typeof p === 'string' ? p : p.name;
      const pidx = params.indexOf(p);
      const pt = (pidx < paramTypeHints.length && paramTypeHints[pidx]) ? paramTypeHints[pidx] : varType(pname);
      if (pt === 'char*') { stringVars.add(pname); integerVars.delete(pname); }
      else if (pt === 'SlArray*') { arrayVars.add(pname); integerVars.delete(pname); }
      else if (pt === 'SlMap*') {
        objectVars.add(pname); integerVars.delete(pname);
        if (sourceArrayName && objectFields.has(sourceArrayName)) {
          objectFields.set(pname, objectFields.get(sourceArrayName)!);
        }
      }
      else if (pt === 'double') { floatVars.add(pname); integerVars.delete(pname); }
    }
    for (const [v, _kind] of capturedVars) {
      const vt = varType(v);
      if (vt === 'char*') { stringVars.add(v); integerVars.delete(v); }
      else if (vt === 'SlArray*') { arrayVars.add(v); integerVars.delete(v); }
      else if (vt === 'SlMap*') { objectVars.add(v); integerVars.delete(v); }
      else if (vt === 'double') { floatVars.add(v); integerVars.delete(v); }
    }
    currentFuncName = null;
    currentFuncParams = [];

    const bodyCode = body.map((s: any) => {
      return cStmt(s, 1);
    }).join('\n');

    let returnType = 'long long';
    for (const s of body) {
      if ((s.type === 'Return' || s.type === 'ReturnStatement') && s.value) {
        returnType = exprType(s.value);
        break;
      }
    }

    stringVars.clear(); for (const v of savedStringVars) stringVars.add(v);
    arrayVars.clear(); for (const v of savedArrayVars) arrayVars.add(v);
    objectVars.clear(); for (const v of savedObjectVars) objectVars.add(v);
    floatVars.clear(); for (const v of savedFloatVars) floatVars.add(v);
    integerVars.clear(); for (const v of savedIntegerVars) integerVars.add(v);
    objectFields.clear(); for (const [k, v] of savedObjectFields) objectFields.set(k, v);
    forInIterVars.clear(); for (const v of savedForInIterVars) forInIterVars.add(v);
    for (const p of params) {
      const pname = typeof p === 'string' ? p : p.name;
      noPreExtractVars.delete(pname);
    }
    currentFuncName = savedFuncName;
    currentFuncParams = savedFuncParams;

    const hasReturn = body.some((s: any) => s.type === 'Return' || s.type === 'ReturnStatement');
    const footer = hasReturn ? '' : '\n    return 0;';

    varInitedInDecl.clear();
    for (const v of savedVarInited2) varInitedInDecl.add(v);
    currentFuncInitExprs = savedFuncInitExprs2;
    currentClassName = savedClsName2;

    let bodyWithCtx = bodyCode;

    const paramCastLines: string[] = [];
    for (let i = 0; i < params.length; i++) {
      const pname = typeof params[i] === 'string' ? params[i] : params[i].name;
      const pt = closureParamTypes[i] || 'long long';
      if (pt !== 'long long') {
        paramCastLines.push(`    ${pt} sl_${pname} = (${pt})sl_${pname}_arg;`);
      }
    }
    if (paramCastLines.length > 0) {
      bodyWithCtx = paramCastLines.join('\n') + '\n' + bodyWithCtx;
    }

    if (ctxFields.length > 0) {
      bodyWithCtx = `    ${ctxStructName}* _c = (${ctxStructName}*)_ctx;\n` + bodyWithCtx;
      for (const [v, kind] of capturedVars) {
        const access = kind === 'top' ? `(*_c->${v})` : `_c->${v}`;
        bodyWithCtx = bodyWithCtx.replace(new RegExp(`(long long |char\\* |double |SlArray\\* |SlMap\\* )sl_${v} = `, 'g'), `${access} = `);
        bodyWithCtx = bodyWithCtx.replace(new RegExp(`(long long |char\\* |double |SlArray\\* |SlMap\\* )sl_${v};`, 'g'), `/* captured: ${v} */;`);
        bodyWithCtx = bodyWithCtx.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), access);
      }
    }

    if (returnType !== 'long long') {
      bodyWithCtx = bodyWithCtx.replace(/return ([^;]+);/g, (match: string, expr: string) => {
        if (expr.trim().startsWith('(long long)')) return match;
        return `return (long long)(${expr});`;
      });
    }

    if (fnNode.name && returnType !== 'long long') {
      closureReturnTypes.set(fnNode.name, returnType);
    }

    funcDefs.push(`static long long ${closureFnName}(${closureParams.join(', ')}) {\n${bodyWithCtx}${footer}\n}`);

    const useClosure2 = isReduce || params.length >= 2;
    if (useClosure2) {
      if (ctxFields.length > 0) {
        const initFields: string[] = [];
        for (const [v, kind] of capturedVars) {
          if (kind === 'top') {
            initFields.push(`    _ctx.${v} = &sl_${v};`);
          } else {
            initFields.push(`    _ctx.${v} = sl_${v};`);
          }
        }
        return `({ ${ctxStructName} _ctx = {0}; \n${initFields.join('\n')}\n    ${ctxStructName}* _hp = (${ctxStructName}*)malloc(sizeof(${ctxStructName})); memcpy(_hp, &_ctx, sizeof(${ctxStructName})); (SlClosure2){ .fn2 = ${closureFnName}, .ctx = _hp }; })`;
      }
      return `(SlClosure2){ .fn2 = ${closureFnName}, .ctx = NULL }`;
    }

    if (ctxFields.length > 0) {
      const initFields: string[] = [];
      for (const [v, kind] of capturedVars) {
        if (kind === 'top') {
          initFields.push(`    _ctx.${v} = &sl_${v};`);
        } else {
          initFields.push(`    _ctx.${v} = sl_${v};`);
        }
      }
      return `({ ${ctxStructName} _ctx = {0}; \n${initFields.join('\n')}\n    ${ctxStructName}* _hp = (${ctxStructName}*)malloc(sizeof(${ctxStructName})); memcpy(_hp, &_ctx, sizeof(${ctxStructName})); (SlClosure){ .fn = ${closureFnName}, .ctx = _hp }; })`;
    }

    return `(SlClosure){ .fn = ${closureFnName}, .ctx = NULL }`;
  }

  function compileMatchPattern(pattern: any, matchVar: string, matchType: string): string {
    if (!pattern) return '1';
    switch (pattern.kind) {
      case 'wildcard':
        return '1';
      case 'literal':
        if (matchType === 'char*') return `strcmp(${matchVar}, ${JSON.stringify(pattern.value)}) == 0`;
        return `${matchVar} == ${pattern.value}`;
      case 'identifier':
        return '1';
      case 'range':
        return `${matchVar} >= ${pattern.start} && ${matchVar} <= ${pattern.end}`;
      case 'or':
        return (pattern.patterns || []).map((p: any) => `(${compileMatchPattern(p, matchVar, matchType)})`).join(' || ');
      case 'type': {
        const tn = pattern.typeName;
        if (tn === 'string' || tn === 'str') return matchType === 'char*' ? '1' : '0';
        if (tn === 'number' || tn === 'num') return (matchType === 'long long' || matchType === 'double') ? '1' : '0';
        if (tn === 'array') return matchType === 'SlArray*' ? '1' : '0';
        if (tn === 'object') return matchType === 'SlMap*' ? '1' : '0';
        return '1';
      }
      case 'array': {
        const elems = pattern.elements || [];
        const conds: string[] = [`${matchVar}->len == ${elems.length}`];
        for (let i = 0; i < elems.length; i++) {
          const elemPattern = elems[i];
          if (elemPattern.kind === 'literal') {
            conds.push(`sl_arr_get(${matchVar}, ${i}) == ${elemPattern.value}`);
          } else if (elemPattern.kind === 'range') {
            conds.push(`sl_arr_get(${matchVar}, ${i}) >= ${elemPattern.start} && sl_arr_get(${matchVar}, ${i}) <= ${elemPattern.end}`);
          }
        }
        return conds.join(' && ');
      }
      case 'object': {
        const props = pattern.properties || [];
        const conds: string[] = [];
        for (const p of props) {
          const key = p.key;
          if (p.pattern?.kind === 'literal') {
            conds.push(`sl_map_has(${matchVar}, "${key}") && sl_to_int(sl_map_get(${matchVar}, "${key}", sl_int(0))) == ${p.pattern.value}`);
          } else {
            conds.push(`sl_map_has(${matchVar}, "${key}")`);
          }
        }
        return conds.length > 0 ? conds.join(' && ') : '1';
      }
      default:
        return '1';
    }
  }

  function generateMatchBindingCode(pattern: any, matchVar: string, matchType: string): string {
    if (!pattern) return '';
    const parts: string[] = [];
    switch (pattern.kind) {
      case 'identifier':
        parts.push(`long long sl_${pattern.name} = ${matchVar};`);
        break;
      case 'or':
        for (const p of (pattern.patterns || [])) {
          parts.push(generateMatchBindingCode(p, matchVar, matchType));
        }
        break;
      case 'type':
        parts.push(generateMatchBindingCode(pattern.pattern, matchVar, matchType));
        break;
      case 'array': {
        const elems = pattern.elements || [];
        for (let i = 0; i < elems.length; i++) {
          const elemPattern = elems[i];
          if (elemPattern.kind === 'identifier') {
            parts.push(`long long sl_${elemPattern.name} = sl_arr_get(${matchVar}, ${i});`);
          } else if (elemPattern.kind === 'literal' || elemPattern.kind === 'range' || elemPattern.kind === 'wildcard') {
          } else {
            parts.push(generateMatchBindingCode(elemPattern, `sl_arr_get(${matchVar}, ${i})`, 'long long'));
          }
        }
        if (pattern.rest) {
          parts.push(`SlArray* sl_${pattern.rest} = sl_arr_slice(${matchVar}, ${elems.length}, ${matchVar}->len);`);
        }
        break;
      }
      case 'object': {
        const props = pattern.properties || [];
        for (const p of props) {
          const key = p.key;
          if (p.pattern?.kind === 'identifier') {
            parts.push(`long long sl_${p.pattern.name} = sl_to_int(sl_map_get(${matchVar}, "${key}", sl_int(0)));`);
          } else if (p.pattern?.kind === 'literal' || p.pattern?.kind === 'wildcard') {
            // no binding needed
          } else {
            parts.push(generateMatchBindingCode(p.pattern, `sl_to_int(sl_map_get(${matchVar}, "${key}", sl_int(0)))`, 'long long'));
          }
        }
        break;
      }
    }
    return parts.join(' ');
  }

  function generateSuperInitCall(superCall: any, className: string): string {
    const cls = classDefs.get(className);
    if (!cls?.superClass) return '';
    const parentClassName = cls.superClass;
    const parentCls = classDefs.get(parentClassName);
    if (!parentCls) return '';
    const args = (superCall.args || []).map((a: any) => cExpr(a));
    const parentInitParams = parentCls.methods.get('init')?.params || [];
    const argList = parentInitParams.length > 0 ? args.join(', ') : '';
    return `    sl_${parentClassName}_new_into(&self->_super${argList ? ', ' + argList : ''});`;
  }

  function boxFnForType(t: string): string {
    if (t === 'char*') return 'sl_str';
    if (t === 'SlArray*') return 'sl_box_arr';
    if (t === 'SlMap*') return 'sl_map';
    if (t === 'double') return 'sl_dbl';
    return 'sl_int';
  }

  function getContainerRawExpr(argExpr: any): string | null {
    if (argExpr?.type === 'Call' && argExpr.callee?.type === 'Member') {
      const mp = typeof argExpr.callee.property === 'string' ? argExpr.callee.property : (argExpr.callee.property?.name || '');
      if (mp === 'get' && exprType(argExpr.callee.object) === 'SlMap*') {
        const objE = cExpr(argExpr.callee.object);
        const gArgs = (argExpr.arguments || argExpr.args || []).map((a: any) => cExpr(a));
        return `sl_map_get(${objE}, ${gArgs[0] || '""'}, sl_int(0))`;
      }
    }
    if (argExpr?.type === 'Member' && argExpr.computed && exprType(argExpr.object) === 'SlArray*') {
      const obj = cExpr(argExpr.object);
      const prop = cExpr(argExpr.property);
      return `sl_arr_getval(${obj}, ${prop})`;
    }
    return null;
  }

  function inferClosureReturnType(fnNode: any, paramType: string = 'long long', srcArrayName: string = ''): string {
    if (!fnNode) return 'long long';
    const params = fnNode.params || [];
    const body = fnNode.body;
    if (!body) return 'long long';
    const isExprBody = !Array.isArray(body) && body.type !== 'Return' && body.type !== 'ReturnStatement' && body.type !== 'VarDecl' && body.type !== 'LetDecl' && body.type !== 'IfStatement' && body.type !== 'WhileStatement' && body.type !== 'ForIn' && body.type !== 'Block' && body.type !== 'BlockStatement';
    if (isExprBody) {
      const savedStringVars = new Set(stringVars);
      const savedObjectVars = new Set(objectVars);
      const savedArrayVars = new Set(arrayVars);
      const savedFloatVars = new Set(floatVars);
      const savedIntegerVars = new Set(integerVars);
      const savedObjectFields = new Map(objectFields);
      for (const p of params) {
        const pname = typeof p === 'string' ? p : p.name;
        if (paramType === 'char*') { stringVars.add(pname); integerVars.delete(pname); }
        else if (paramType === 'SlMap*') {
          objectVars.add(pname); integerVars.delete(pname);
          if (srcArrayName && objectFields.has(srcArrayName)) {
            objectFields.set(pname, new Map(objectFields.get(srcArrayName)!));
          }
        }
        else if (paramType === 'SlArray*') { arrayVars.add(pname); integerVars.delete(pname); }
        else if (paramType === 'double') { floatVars.add(pname); integerVars.delete(pname); }
      }
      const ret = exprType(body);
      stringVars.clear(); for (const s of savedStringVars) stringVars.add(s);
      objectVars.clear(); for (const s of savedObjectVars) objectVars.add(s);
      arrayVars.clear(); for (const s of savedArrayVars) arrayVars.add(s);
      floatVars.clear(); for (const s of savedFloatVars) floatVars.add(s);
      integerVars.clear(); for (const s of savedIntegerVars) integerVars.add(s);
      objectFields.clear(); for (const [k, v] of savedObjectFields) objectFields.set(k, v);
      return ret;
    }
    if (Array.isArray(body)) {
      for (const s of body) {
        if ((s.type === 'Return' || s.type === 'ReturnStatement') && s.value) {
          return exprType(s.value);
        }
      }
    } else if (body.type === 'Return' || body.type === 'ReturnStatement') {
      return exprType(body.value);
    }
    return 'long long';
  }

  function exprType(expr: any): string {
    if (!expr) return 'long long';
    switch (expr.type) {
      case 'NumberLiteral':
      case 'Number':
        if (!Number.isInteger(expr.value)) return 'double';
        if (expr.raw && typeof expr.raw === 'string' && expr.raw.includes('.')) return 'double';
        return 'long long';
      case 'StringLiteral':
      case 'TextLiteral':
        return 'char*';
      case 'BooleanLiteral':
      case 'Boolean':
        return 'bool';
      case 'NullLiteral':
      case 'Null':
        return 'long long';
      case 'Identifier': {
        if (stringVars.has(expr.name)) return 'char*';
        if (arrayVars.has(expr.name)) return 'SlArray*';
        if (objectVars.has(expr.name)) return 'SlMap*';
        if (instanceVars.has(expr.name)) return `Sl${instanceVars.get(expr.name)}*`;
        if (topLocalClassPtrTypes.has(expr.name)) return topLocalClassPtrTypes.get(expr.name)!;
        if (closureTypeVars.has(expr.name)) {
          const pc = closureParamCounts.get(expr.name) || 1;
          return pc >= 2 ? 'SlClosure2' : 'SlClosure';
        }
        if (boolVars.has(expr.name)) return 'bool';
        if (floatVars.has(expr.name)) return 'double';
        if (classDefs.has(expr.name)) return 'long long';
        if (currentFuncName) {
          const fvt = funcLocalVarTypes.get(currentFuncName);
          if (fvt && fvt.has(expr.name)) return fvt.get(expr.name)!;
          const fpt = funcParamTypes.get(currentFuncName);
          const fpp = currentFuncParams;
          if (fpt && fpp) {
            const idx = fpp.indexOf(expr.name);
            if (idx >= 0 && idx < fpt.length) return fpt[idx];
          }
        }
        return 'long long';
      }
      case 'ArrayLiteral':
        return 'SlArray*';
      case 'ObjectLiteral':
      case 'Object':
        return 'SlMap*';
      case 'Member': {
        if (expr.computed) {
          const oname = expr.object?.name || '';
          if (expr.object?.type === 'Identifier' && arrayVars.has(oname) && arrayElementTypes.has(oname)) {
            return arrayElementTypes.get(oname)!;
          }
          if (expr.object?.type === 'Member' && expr.object.computed) {
            const outerArrId = expr.object.object?.type === 'Identifier' ? expr.object.object.name : '';
            const outerElemT = outerArrId && arrayElementTypes.has(outerArrId) ? arrayElementTypes.get(outerArrId)! : '';
            if (outerElemT === 'SlArray*') {
              const outerInit = topInitExprs.get(outerArrId);
              if (outerInit && outerInit.type === 'ArrayLiteral') {
                const outerElements = outerInit.elements || [];
                if (outerElements.length > 0 && outerElements[0].type === 'Identifier') {
                  const innerArrName = outerElements[0].name;
                  const innerElemT = arrayElementTypes.has(innerArrName) ? arrayElementTypes.get(innerArrName)! : '';
                  if (innerElemT) return innerElemT;
                }
              }
            }
          }
          return 'long long';
        }
        const objName = expr.object?.name || '';
        const propName = typeof expr.property === 'string' ? expr.property : (expr.property?.name || '');
        if (expr.object?.type === 'Identifier' && expr.object.name === 'this' && currentClassName) {
          const cls = classDefs.get(currentClassName);
          if (cls && cls.properties.has(propName)) return cls.properties.get(propName)!;
          if (cls && parentHasProperty(cls.superClass, propName)) {
            let ancestorName: string | undefined = cls.superClass;
            while (ancestorName) {
              const ancestorCls = classDefs.get(ancestorName);
              if (ancestorCls && ancestorCls.properties.has(propName)) return ancestorCls.properties.get(propName)!;
              ancestorName = ancestorCls?.superClass;
            }
          }
        }
        const fields = objectFields.get(objName);
        if (fields && fields.has(propName)) return fields.get(propName)!;
        if (objectVars.has(objName)) {
          const init = topInitExprs.get(objName);
          if (init && (init.type === 'Call' || init.type === 'FunctionCall')) {
            const calleeName = init.callee?.name || '';
            if (calleeName && funcReturnFields.has(calleeName)) {
              const retFields = funcReturnFields.get(calleeName)!;
              if (retFields.has(propName)) return retFields.get(propName)!;
            }
          }
        }
        if (instanceVars.has(objName)) {
          const cls = classDefs.get(instanceVars.get(objName)!);
          if (cls && cls.properties.has(propName)) return cls.properties.get(propName)!;
          if (cls && cls.methods.has(propName)) return 'long long';
        }
        if (expr.object?.type === 'Identifier') {
          const otn = varType(objName);
          if (otn.startsWith('Sl') && otn.endsWith('*') && otn !== 'SlArray*' && otn !== 'SlMap*') {
            const clsName2 = otn.substring(2, otn.length - 1);
            const cls2 = classDefs.get(clsName2);
            if (cls2 && cls2.properties.has(propName)) return cls2.properties.get(propName)!;
            if (cls2 && cls2.methods.has(propName)) return 'long long';
          }
        }
        return 'long long';
      }
      case 'BinaryExpr':
      case 'Binary':
      case 'BinaryOp': {
        if (expr.operator === '+' && (exprType(expr.left) === 'char*' || exprType(expr.right) === 'char*')) return 'char*';
        if (expr.operator === '+' && (exprType(expr.left) === 'SlArray*' || exprType(expr.right) === 'SlArray*')) return 'SlArray*';
        const cmpOps = new Set(['==', '!=', '<', '>', '<=', '>=']);
        if (cmpOps.has(expr.operator)) return 'bool';
        const bitOps = new Set(['&', '|', '^', '<<', '>>', '>>>', '&=', '|=', '^=']);
        if (bitOps.has(expr.operator)) return 'long long';
        const lt = exprType(expr.left);
        const rt = exprType(expr.right);
        if (lt === 'double' || rt === 'double') return 'double';
        return 'long long';
      }
      case 'Call':
      case 'FunctionCall': {
        const calleeObj = expr.callee;
        const name = calleeObj?.name || (typeof calleeObj === 'string' ? calleeObj : 'unknown');
        if (calleeObj?.type === 'Member') {
          const methodProp = typeof calleeObj.property === 'string' ? calleeObj.property : (calleeObj.property?.name || '');
          const stringMethods: Record<string, string> = {
            upper: 'char*', lower: 'char*', trim: 'char*', replace: 'char*',
            substring: 'char*', split: 'SlArray*', charAt: 'char*',
            startsWith: 'long long', endsWith: 'long long', repeat: 'char*',
            indexOf: 'long long', includes: 'long long', lastIndexOf: 'long long',
            padStart: 'char*', padEnd: 'char*', trimStart: 'char*', trimEnd: 'char*',
            len: 'long long', length: 'long long',
            replaceAll: 'char*', toLower: 'char*', toUpper: 'char*',
            toString: 'char*',
          };
          const arrayMethods: Record<string, string> = {
            push: 'long long', pop: 'long long', shift: 'long long', unshift: 'long long',
            map: 'SlArray*', filter: 'SlArray*', reduce: 'long long',
            sort: 'SlArray*', reverse: 'SlArray*', slice: 'SlArray*',
            concat: 'SlArray*', join: 'char*', indexOf: 'long long',
            includes: 'long long', find: 'long long', findIndex: 'long long',
            every: 'long long', some: 'long long', flat: 'SlArray*',
            fill: 'SlArray*', sum: 'long long', avg: 'double',
            len: 'long long', length: 'long long', lastIndexOf: 'long long',
            entries: 'SlArray*', forEach: 'long long',
            toString: 'char*',
          };
          if (Object.prototype.hasOwnProperty.call(stringMethods, methodProp)) return stringMethods[methodProp];
          if (Object.prototype.hasOwnProperty.call(arrayMethods, methodProp)) return arrayMethods[methodProp];
          const mapMethods: Record<string, string> = {
            get: 'long long', getStr: 'char*', getDbl: 'double', getMap: 'SlMap*', getArr: 'SlArray*',
            set: 'long long', has: 'long long', keys: 'SlArray*', values: 'SlArray*',
            entries: 'SlArray*',
          };
          if (Object.prototype.hasOwnProperty.call(mapMethods, methodProp)) return mapMethods[methodProp];
          const objType = exprType(calleeObj.object);
          if (objType.startsWith('Sl')) {
            const clsName = objType.replace(/^Sl/, '').replace(/\*$/, '');
            const cls = classDefs.get(clsName);
            if (cls && cls.methods.has(methodProp)) {
              return cls.methods.get(methodProp)!.returnType || 'long long';
            }
          }
          return 'long long';
        }
        if (name === 'len') return 'long long';
        if (name === 'map') return 'SlArray*';
        if (name === 'filter') return 'SlArray*';
        if (name === 'reduce') return 'long long';
        if (name === 'abs') {
          const absArgs = expr.arguments || expr.args || [];
          if (absArgs.length > 0 && exprType(absArgs[0]) === 'double') return 'double';
          return 'long long';
        }
        if (name === 'sqrt') return 'double';
        if (name === 'floor') return 'long long';
        if (name === 'ceil') return 'long long';
        if (name === 'round') return 'long long';
        if (name === 'pow') {
          const powArgs = expr.arguments || expr.args || [];
          if (powArgs.length > 0 && exprType(powArgs[0]) === 'double') return 'double';
          return 'long long';
        }
        if (name === 'min') {
          const minArgs = expr.arguments || expr.args || [];
          if (minArgs.length > 0 && exprType(minArgs[0]) === 'double') return 'double';
          return 'long long';
        }
        if (name === 'max') {
          const maxArgs = expr.arguments || expr.args || [];
          if (maxArgs.length > 0 && exprType(maxArgs[0]) === 'double') return 'double';
          return 'long long';
        }
        if (name === 'clamp') return 'long long';
        if (name === 'sin' || name === 'cos' || name === 'tan') return 'double';
        if (name === 'log' || name === 'exp') return 'double';
        if (name === 'asin' || name === 'acos' || name === 'atan' || name === 'atan2') return 'double';
        if (name === 'log2' || name === 'log10') return 'double';
        if (name === 'random') {
          const ra = expr.arguments || expr.args || [];
          /* Lowering: 0-arg → double in [0,1); 1-arg → rand()%n; 2-arg → integer range. Must match or array ops pick sl_arr_set_dbl and break int coordinates. */
          if (ra.length >= 1) return 'long long';
          return 'double';
        }
        if (name === 'PI' || name === 'E') return 'double';
        if (name === 'range' || name === 'rangeRev') return 'SlArray*';
        if (name === 'withCapacity') return 'SlArray*';
        if (name === 'pop') return 'long long';
        if (name === 'shift') return 'long long';
        if (name === 'reverse') return 'SlArray*';
        if (name === 'sort') return 'SlArray*';
        if (name === 'indexOf') return 'long long';
        if (name === 'includes') return 'long long';
        if (name === 'join') return 'char*';
        if (name === 'slice') return 'SlArray*';
        if (name === 'concat') return 'SlArray*';
        if (name === 'unique') return 'SlArray*';
        if (name === 'find') return 'long long';
        if (name === 'findIndex') return 'long long';
        if (name === 'every') return 'long long';
        if (name === 'some') return 'long long';
        if (name === 'forEach') return 'long long';
        if (name === 'flat') return 'SlArray*';
        if (name === 'fill') return 'SlArray*';
        if (name === 'sum') return 'long long';
        if (name === 'avg') return 'double';
        if (name === 'gpuScale' || name === 'gpuAdd' || name === 'gpuMultiply') return 'SlArray*';
        if (name === 'gpuDot') return 'long long';
        if (name === 'gpuMatmul' || name === 'gpuMatmulTiled') return 'SlArray*';
        if (name === 'gpuAvailable') return 'long long';
        if (name === 'cudaAvailable') return 'long long';
        if (name === 'cudaSum') return 'long long';
        if (name === 'cudaMatmul') return 'SlArray*';
        if (name === 'upper') return 'char*';
        if (name === 'lower') return 'char*';
        if (name === 'trim') return 'char*';
        if (name === 'replace') return 'char*';
        if (name === 'substring') return 'char*';
        if (name === 'split') return 'SlArray*';
        if (name === 'charAt') return 'char*';
        if (name === 'startsWith') return 'long long';
        if (name === 'endsWith') return 'long long';
        if (name === 'repeat') return 'char*';
        if (name === 'strIndexOf') return 'long long';
        if (name === 'strIncludes') return 'long long';
        if (name === 'strLen') return 'long long';
        if (name === 'strLastIndexOf') return 'long long';
        if (name === 'padStart' || name === 'padEnd') return 'char*';
        if (name === 'toString' || name === 'str') return 'char*';
        if (name === 'num') return 'long long';
        if (name === 'int') return 'long long';
        if (name === 'float' || name === 'toFloat') return 'double';
        if (name === 'parseInt') return 'long long';
        if (name === 'parseFloat') return 'double';
        if (name === 'toBool' || name === 'bool') return 'long long';
        if (name === 'lastIndexOf') return 'long long';
        if (name === 'unshift') return 'long long';
        if (name === 'entries') return 'SlArray*';
        if (name === 'sleep') return 'long long';
        if (name === 'readFile') return 'char*';
        if (name === 'writeFile') return 'long long';
        if (name === 'fileExists' || name === 'exists') return 'long long';
        if (name === 'mkdir') return 'long long';
        if (name === 'remove' || name === 'rm') return 'long long';
        if (name === 'listDir') return 'SlArray*';
        if (name === 'dateFormat' || name === 'date') return 'char*';
        if (name === 'trimStart') return 'char*';
        if (name === 'trimEnd') return 'char*';
        if (name === 'jsonParse') return 'SlMap*';
        if (name === 'jsonStringify') return 'char*';
        if (name === 'type' || name === 'typeof') return 'char*';
        if (name === 'keys') return 'SlArray*';
        if (name === 'values') return 'SlArray*';
        if (name === 'has') return 'long long';
        if (name === 'time') return 'long long';
        if (name === 'isString' || name === 'isNumber' || name === 'isMap' || name === 'isArray') return 'long long';
        if (name === 'format') return 'char*';
        if (name === 'getEnv') return 'char*';
        if (name === 'setEnv') return 'long long';
        if (name === 'args') return 'SlArray*';
        if (name === 'replaceAll') return 'char*';
        if (name === 'toLower') return 'char*';
        if (name === 'toUpper') return 'char*';
        if (name === 'strEq' || name === 'strNe' || name === 'strLt' || name === 'strGt' || name === 'strLe' || name === 'strGe') return 'long long';
        if (classDefs.has(name)) return `Sl${name}*`;
        if (calleeObj?.type === 'Member') {
          const objName = calleeObj.object?.name || '';
          const methodProp = typeof calleeObj.property === 'string' ? calleeObj.property : (calleeObj.property?.name || '');
          if (instanceVars.has(objName)) {
            const cls = classDefs.get(instanceVars.get(objName)!);
            if (cls && cls.methods.has(methodProp)) {
              return cls.methods.get(methodProp)!.returnType;
            }
          }
          const methodReturnTypes: Record<string, string> = {
            map: 'SlArray*', filter: 'SlArray*', reverse: 'SlArray*', sort: 'SlArray*',
            slice: 'SlArray*', concat: 'SlArray*', unique: 'SlArray*', flat: 'SlArray*',
            fill: 'SlArray*', split: 'SlArray*', keys: 'SlArray*', values: 'SlArray*',
            entries: 'SlArray*', getArr: 'SlArray*',
            pop: 'long long', shift: 'long long', indexOf: 'long long', includes: 'long long',
            find: 'long long', findIndex: 'long long', every: 'long long', some: 'long long',
            forEach: 'long long', sum: 'long long', join: 'char*', push: 'long long',
            unshift: 'long long', lastIndexOf: 'long long',
            get: 'long long', set: 'long long', has: 'long long',
            getMap: 'SlMap*', getStr: 'char*',
            avg: 'double', upper: 'char*', lower: 'char*', trim: 'char*', replace: 'char*',
            substring: 'char*', charAt: 'char*', startsWith: 'long long', endsWith: 'long long',
            repeat: 'char*', toString: 'char*', length: 'long long', len: 'long long',
            padStart: 'char*', padEnd: 'char*',
            reduce: 'long long',
            replaceAll: 'char*', toLower: 'char*', toUpper: 'char*',
          };
          if (Object.prototype.hasOwnProperty.call(methodReturnTypes, methodProp)) return methodReturnTypes[methodProp];
        }
        const ret = funcReturnTypes.get(name);
        if (ret) return ret;
        if (closureTypeVars.has(name)) {
          const crt = closureReturnTypes.get(name);
          return crt || 'long long';
        }
        return 'long long';
      }
      case 'UnaryExpr':
      case 'Unary':
        if (expr.operator === 'not' || expr.operator === '!') return 'bool';
        if (expr.operator === '~') return 'long long';
        return exprType(expr.operand);
      case 'Logical':
      case 'LogicalExpr':
      case 'And':
      case 'Or':
        return 'bool';
      case 'ConditionalExpr':
      case 'Conditional':
      case 'TernaryExpr': {
        const ct = exprType(expr.consequent || expr.then);
        const at2 = exprType(expr.alternate || expr.else);
        if (ct === 'char*' || at2 === 'char*') return 'char*';
        if (ct === 'double' || at2 === 'double') return 'double';
        if (ct === 'bool' && at2 === 'bool') return 'bool';
        return ct !== 'long long' ? ct : at2;
      }
      case 'ArrowFunction':
      case 'Arrow':
      case 'Function':
        return 'SlClosure';
      case 'NewExpression': {
        const className = expr.className || expr.callee?.name || '';
        if (classDefs.has(className)) return `Sl${className}*`;
        return 'long long';
      }
      case 'SuperCallExpression': {
        const method = expr.method || '';
        const cls = currentClassName ? classDefs.get(currentClassName) : null;
        if (cls?.superClass) {
          const parentCls = classDefs.get(cls.superClass);
          if (parentCls) {
            const _mInfo = parentCls.methods.get(method);
            return _mInfo?.returnType || 'long long';
          }
        }
        return 'long long';
      }
      case 'Match': {
        for (const c of (expr.cases || [])) {
          const body = c.body || [];
          const lastAction = body.length > 0 && body[body.length - 1]?.type === 'Action' ? body[body.length - 1] : null;
          if (lastAction) {
            const rt = exprType(lastAction.target || lastAction.action);
            if (rt !== 'long long') return rt;
          }
        }
        return 'long long';
      }
      case 'MacroCall':
        return 'long long';
      case 'UpdateExpr':
      case 'UpdateExpression':
        return exprType(expr.argument || expr.operand);
      default:
        return 'long long';
    }
  }

  function analyzeFunctionTypes(stmt: any) {
    if (stmt.type !== 'FunctionDef') return;
    const name = stmt.name;
    const params = stmt.params || [];
    const localInts = new Set<string>();
    const localFloats = new Set<string>();
    const localStrings = new Set<string>();
    const localArrays = new Set<string>();
    const localObjects = new Set<string>();
    const localClosures = new Set<string>();
    const localObjectFields = new Map<string, Map<string, string>>();
    const localArrayElementTypes = new Map<string, string>();
    /** Locals that hold class instance pointers (e.g. `mob = mobs[i]`). */
    const localInstancePtrTypes = new Map<string, string>();

    for (const p of params) {
      const pname = typeof p === 'string' ? p : p.name;
      localInts.add(pname);
    }
    const paramNameSet = new Set(params.map((p: any) => (typeof p === 'string' ? p : p.name)));
    /** Top-level implicit names used inside this function but not parameters (e.g. global `mobs`). */
    function isTopLevelCapturedName(aname: string): boolean {
      return topLocals.has(aname) && !paramNameSet.has(aname);
    }

    function setType(tName: string, et: string) {
      if (!tName) return;
      if (et === 'char*') { localStrings.add(tName); localInts.delete(tName); localFloats.delete(tName); localArrays.delete(tName); localClosures.delete(tName); localObjects.delete(tName); localInstancePtrTypes.delete(tName); }
      else if (et === 'SlArray*') { localArrays.add(tName); localInts.delete(tName); localFloats.delete(tName); localStrings.delete(tName); localClosures.delete(tName); localObjects.delete(tName); localInstancePtrTypes.delete(tName); }
      else if (et === 'SlMap*') { localObjects.add(tName); localInts.delete(tName); localFloats.delete(tName); localStrings.delete(tName); localArrays.delete(tName); localClosures.delete(tName); localInstancePtrTypes.delete(tName); }
      else if (et === 'SlClosure' || et === 'SlClosure2') { localClosures.add(tName); localInts.delete(tName); localFloats.delete(tName); localStrings.delete(tName); localArrays.delete(tName); localObjects.delete(tName); localInstancePtrTypes.delete(tName); }
      else if (et === 'double') { localFloats.add(tName); localInts.delete(tName); localStrings.delete(tName); localArrays.delete(tName); localClosures.delete(tName); localObjects.delete(tName); localInstancePtrTypes.delete(tName); }
      else if (et.startsWith('Sl') && et.endsWith('*') && et !== 'SlArray*' && et !== 'SlMap*') {
        localInstancePtrTypes.set(tName, et);
        localInts.delete(tName); localFloats.delete(tName); localStrings.delete(tName); localArrays.delete(tName); localClosures.delete(tName); localObjects.delete(tName);
      }
      else { localInts.add(tName); localFloats.delete(tName); localStrings.delete(tName); localArrays.delete(tName); localClosures.delete(tName); localObjects.delete(tName); localInstancePtrTypes.delete(tName); }
    }

    let localVarTypes = new Map<string, string>();

    function localExprType(expr: any): string {
      if (!expr) return 'long long';
      if (expr.type === 'Identifier') {
        const n = expr.name;
        if (localStrings.has(n)) return 'char*';
        if (localArrays.has(n)) return 'SlArray*';
        if (localObjects.has(n)) return 'SlMap*';
        if (localClosures.has(n)) return 'SlClosure';
        if (localFloats.has(n)) return 'double';
        if (localInstancePtrTypes.has(n)) return localInstancePtrTypes.get(n)!;
        return 'long long';
      }
      if (expr.type === 'NumberLiteral' || expr.type === 'Number') {
        if (!Number.isInteger(expr.value)) return 'double';
        if (expr.raw && typeof expr.raw === 'string' && expr.raw.includes('.')) return 'double';
        return 'long long';
      }
      if (expr.type === 'StringLiteral' || expr.type === 'TextLiteral') return 'char*';
      if (expr.type === 'ArrayLiteral') return 'SlArray*';
      if (expr.type === 'ObjectLiteral' || expr.type === 'Object') return 'SlMap*';
      if (expr.type === 'Member') {
        if (expr.computed) {
          const oname = expr.object?.name || '';
          if (expr.object?.type === 'Identifier' && localArrays.has(oname) && localArrayElementTypes.has(oname)) {
            return localArrayElementTypes.get(oname)!;
          }
          if (expr.object?.type === 'Identifier' && arrayVars.has(oname) && arrayElementTypes.has(oname)) {
            return arrayElementTypes.get(oname)!;
          }
          return 'long long';
        }
        const objName = expr.object?.name || '';
        const propName = typeof expr.property === 'string' ? expr.property : (expr.property?.name || '');
        const fields = localObjectFields.get(objName);
        if (fields && fields.has(propName)) return fields.get(propName)!;
        if (localInstancePtrTypes.has(objName)) {
          const clsName = localInstancePtrTypes.get(objName)!.replace(/^Sl/, '').replace(/\*$/, '');
          const cls = classDefs.get(clsName);
          if (cls && cls.properties.has(propName)) return cls.properties.get(propName)!;
        }
        return 'long long';
      }
      if (expr.type === 'BinaryExpr' || expr.type === 'Binary' || expr.type === 'BinaryOp') {
        if (expr.operator === '+' && (localExprType(expr.left) === 'char*' || localExprType(expr.right) === 'char*')) return 'char*';
        if (localExprType(expr.left) === 'double' || localExprType(expr.right) === 'double') return 'double';
        return 'long long';
      }
      if (expr.type === 'Call' || expr.type === 'FunctionCall') {
        const calleeObj = expr.callee;
        const cname = calleeObj?.name || (typeof calleeObj === 'string' ? calleeObj : '');
        if (cname === 'len') return 'long long';
        if (cname === 'charAt' || cname === 'substring' || cname === 'upper' || cname === 'lower' || cname === 'trim' || cname === 'replace' || cname === 'repeat' || cname === 'str' || cname === 'toString' || cname === 'strIndexOf' || cname === 'strIncludes' || cname === 'strLen') return 'char*';
        if (cname === 'split' || cname === 'map' || cname === 'filter' || cname === 'flat' || cname === 'fill' || cname === 'range' || cname === 'rangeRev' || cname === 'withCapacity') return 'SlArray*';
        if (cname === 'reduce' || cname === 'sum') return 'long long';
        if (cname === 'avg') return 'double';
        if (cname === 'includes' || cname === 'startsWith' || cname === 'endsWith' || cname === 'indexOf' || cname === 'find' || cname === 'findIndex' || cname === 'every' || cname === 'some' || cname === 'has' || cname === 'mapHas' || cname === 'setHas') return 'long long';
        if (cname === 'codePointAt') return 'long long';
        if (cname === 'mapSet' || cname === 'mapGet' || cname === 'mapDelete' || cname === 'mapKeys' || cname === 'mapValues' || cname === 'mapEntries' || cname === 'mapSize' || cname === 'mapClear') {
          if (cname === 'mapGet') return 'long long';
          if (cname === 'mapKeys' || cname === 'mapValues' || cname === 'mapEntries') return 'SlArray*';
          if (cname === 'mapSize' || cname === 'mapDelete') return 'long long';
          if (cname === 'mapSet' || cname === 'mapClear') return 'long long';
        }
        if (cname === 'setAdd' || cname === 'setHas' || cname === 'setDelete' || cname === 'setSize' || cname === 'setToArray' || cname === 'setClear') {
          if (cname === 'setToArray') return 'SlArray*';
          return 'long long';
        }
        if (cname === 'gpuRange' || cname === 'gpuScale' || cname === 'gpuAdd' || cname === 'gpuMultiply' || cname === 'gpuMatmul' || cname === 'gpuMatmulTiled' || cname === 'cudaMatmul') return 'SlArray*';
        if (cname === 'gpuDot' || cname === 'gpuAvailable' || cname === 'cudaAvailable' || cname === 'cudaSum') return 'long long';
        if (cname === 'abs' || cname === 'sqrt' || cname === 'sin' || cname === 'cos' || cname === 'tan' || cname === 'log' || cname === 'exp' || cname === 'pow') {
          const callArgs = expr.arguments || expr.args || [];
          if (callArgs.length > 0 && localExprType(callArgs[0]) === 'double') return 'double';
        }
        const ret = funcReturnTypes.get(cname);
        return ret || 'long long';
      }
      if (expr.type === 'ArrowFunction' || expr.type === 'Arrow' || expr.type === 'Function') return 'SlClosure';
      if (expr.type === 'UnaryExpr' || expr.type === 'Unary') {
        if (expr.operator === '-' || expr.operator === '+') return localExprType(expr.operand);
        return 'long long';
      }
      if (expr.type === 'ConditionalExpr' || expr.type === 'Conditional' || expr.type === 'TernaryExpr') {
        const thenType = localExprType(expr.consequent || expr.then);
        const elseType = localExprType(expr.alternate || expr.else);
        if (thenType === 'double' || elseType === 'double') return 'double';
        if (thenType !== 'long long') return thenType;
        return elseType;
      }
      return 'long long';
    }

    function analyzeNode(node: any) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(analyzeNode); return; }

      if (node.type === 'FunctionDef') {
        const nestedName = node.name;
        if (nestedName) {
          localClosures.add(nestedName);
          localInts.delete(nestedName);
          localFloats.delete(nestedName);
          localStrings.delete(nestedName);
          localArrays.delete(nestedName);
          closureParamCounts.set(nestedName, (node.params || []).length);
        }
        if (node.body) {
          const bodyArr = Array.isArray(node.body) ? node.body : [node.body];
          bodyArr.forEach(analyzeNode);
          if (nestedName) {
            let nestedRetType = 'long long';
            for (const s of bodyArr) {
              if ((s.type === 'Return' || s.type === 'ReturnStatement') && s.value) {
                const et = localExprType(s.value);
                if (et !== 'long long') { nestedRetType = et; break; }
              }
            }
            if (nestedRetType !== 'long long') {
              closureReturnTypes.set(nestedName, nestedRetType);
            }
          }
        }
        return;
      }

      if (node.type === 'Member' && !node.computed) {
        const objName = node.object?.name || '';
        const propName = typeof node.property === 'string' ? node.property : (node.property?.name || '');
        if (objName && propName && node.object?.type === 'Identifier') {
          for (const [clsName, cls] of classDefs) {
            if (cls.properties.has(propName) && !localStrings.has(objName) && !localArrays.has(objName) && !localObjects.has(objName) && !localFloats.has(objName)) {
              if (!localInts.has(objName) || params.some((p: any) => (typeof p === 'string' ? p : p.name) === objName)) {
                localVarTypes.set(objName, `Sl${clsName}*`);
                localInts.delete(objName);
              }
            }
          }
        }
      }
      if (node.type === 'ForIn') {
        const iterExpr = node.iterable;
        const keyVar = node.variable || node.keyVar || node.name || 'item';
        if (iterExpr) {
          const it = localExprType(iterExpr);
          if (it === 'SlArray*') {
            if (iterExpr.type === 'Identifier' && !isTopLevelCapturedName(iterExpr.name)) {
              setType(iterExpr.name, 'SlArray*');
            }
            let elemType = 'long long';
            if (iterExpr.type === 'Identifier' && localArrayElementTypes.has(iterExpr.name)) {
              elemType = localArrayElementTypes.get(iterExpr.name)!;
            } else if (iterExpr.type === 'ArrayLiteral') {
              const elements = iterExpr.elements || [];
              if (elements.length > 0) elemType = localExprType(elements[0]);
            } else if (iterExpr.type === 'Call' || iterExpr.type === 'FunctionCall') {
              const calleeObj = iterExpr.callee;
              const calleeName = calleeObj?.name || '';
              if (calleeName === 'split') elemType = 'char*';
              if (calleeObj?.type === 'Member') {
                const methodProp = typeof calleeObj.property === 'string' ? calleeObj.property : (calleeObj.property?.name || '');
                const srcName = calleeObj.object?.name || '';
                if (methodProp === 'filter' && srcName && localArrayElementTypes.has(srcName)) {
                  elemType = localArrayElementTypes.get(srcName)!;
                } else if (methodProp === 'map' && srcName && localArrayElementTypes.has(srcName)) {
                  const fnArg = (iterExpr.arguments || iterExpr.args || [])[0];
                  if (fnArg) {
                    elemType = inferClosureReturnType(fnArg, localArrayElementTypes.get(srcName) || 'long long', srcName);
                  }
                } else if (['slice', 'reverse', 'sort'].includes(methodProp) && srcName && localArrayElementTypes.has(srcName)) {
                  elemType = localArrayElementTypes.get(srcName)!;
                }
              }
            }
            if (keyVar) setType(keyVar, elemType);
          } else if (it === 'SlMap*') {
            if (iterExpr.type === 'Identifier' && !isTopLevelCapturedName(iterExpr.name)) setType(iterExpr.name, 'SlMap*');
            if (keyVar) setType(keyVar, 'char*');
          } else if (it === 'char*') {
            if (keyVar) setType(keyVar, 'char*');
          }
        }
      }
      if (node.type === 'Member' && node.computed) {
        const obj = node.object;
        if (obj && obj.type === 'Identifier' && !isTopLevelCapturedName(obj.name)) {
          setType(obj.name, 'SlArray*');
        }
      }
      if ((node.type === 'BinaryExpr' || node.type === 'Binary' || node.type === 'BinaryOp') && node.operator === '+') {
        const lt = localExprType(node.left);
        const rt = localExprType(node.right);
        if (lt === 'char*' && node.right && node.right.type === 'Identifier') {
          setType(node.right.name, 'char*');
        }
        if (rt === 'char*' && node.left && node.left.type === 'Identifier') {
          setType(node.left.name, 'char*');
        }
      }
      if (node.type === 'Call' || node.type === 'FunctionCall') {
        const calleeObj = node.callee;
        const cname = calleeObj?.name || (typeof calleeObj === 'string' ? calleeObj : '');
        const args = node.arguments || node.args || [];
        if (cname === 'len' && args.length > 0 && args[0].type === 'Identifier') {
          if (!topLocals.has(args[0].name) && !localStrings.has(args[0].name)) setType(args[0].name, 'SlArray*');
        }
        const stringFuncs1stArg = ['charAt', 'substring', 'split', 'includes', 'startsWith', 'endsWith', 'indexOf', 'upper', 'lower', 'trim', 'replace', 'repeat', 'strIndexOf', 'strIncludes', 'strLen', 'codePointAt'];
        if (stringFuncs1stArg.includes(cname) && args.length > 0 && args[0].type === 'Identifier') {
          if (!topLocals.has(args[0].name)) setType(args[0].name, 'char*');
        }
        if (cname === 'push' && args.length > 0 && args[0].type === 'Identifier') {
          if (!topLocals.has(args[0].name)) setType(args[0].name, 'SlArray*');
          if (args.length >= 2 && !localArrayElementTypes.has(args[0].name)) {
            const elemType = localExprType(args[1]);
            if (elemType && elemType !== 'long long') {
              localArrayElementTypes.set(args[0].name, elemType);
            }
          }
        }
        if (cname === 'map' && args.length > 0 && args[0].type === 'Identifier') {
          if (!topLocals.has(args[0].name)) setType(args[0].name, 'SlArray*');
        }
        if (cname === 'filter' && args.length > 0 && args[0].type === 'Identifier') {
          if (!topLocals.has(args[0].name)) setType(args[0].name, 'SlArray*');
        }
        if (calleeObj?.type === 'Identifier' && localInts.has(cname)) {
          setType(cname, 'SlClosure');
        }
      }
      if (node.type === 'Assignment' || node.type === 'Assign') {
        const t = node.target || node.left;
        const v = node.value || node.right;
        if (t?.type === 'ArrayLiteral') {
          const elements = t.elements || [];
          const valType = localExprType(v);
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (el.type === 'Identifier') {
              if (valType === 'SlArray*') {
                setType(el.name, 'long long');
              } else {
                setType(el.name, 'long long');
              }
            } else if (el.type === 'SpreadElement' || el.operator === '...') {
              const restName = el.argument?.name || el.name;
              if (restName) setType(restName, 'SlArray*');
            }
          }
        }
        const tName = t?.name || (typeof t === 'string' ? t : null);
        if (tName && v) {
          const et = localExprType(v);
          if (et === 'SlMap*' && (v.type === 'ObjectLiteral' || v.type === 'Object')) {
            localObjects.add(tName);
            localInts.delete(tName); localFloats.delete(tName); localStrings.delete(tName); localArrays.delete(tName);
            const entries = v.entries || [];
            const fields = new Map<string, string>();
            for (const entry of entries) {
              if (entry.kind === 'property') {
                const ft = localExprType(entry.value);
                fields.set(entry.key, ft);
              }
            }
            localObjectFields.set(tName, fields);
          } else {
            setType(tName, et);
            if (et === 'SlArray*' && v.type === 'ArrayLiteral') {
              const elements = v.elements || [];
              if (elements.length > 0) {
                const elemEt = localExprType(elements[0]);
                localArrayElementTypes.set(tName, elemEt);
                if (elemEt === 'SlMap*' && (elements[0].type === 'ObjectLiteral' || elements[0].type === 'Object')) {
                  const entries = elements[0].entries || [];
                  const fields = new Map<string, string>();
                  for (const entry of entries) {
                    if (entry.kind === 'property') {
                      fields.set(entry.key, localExprType(entry.value));
                    }
                  }
                  localObjectFields.set(tName, fields);
                }
              }
            } else if (et === 'SlArray*' && (v.type === 'Call' || v.type === 'FunctionCall')) {
              const calleeObj = v.callee;
              if (calleeObj?.type === 'Identifier') {
                const calleeName = calleeObj.name;
                const funcRetElemType = funcReturnArrayElemTypes.get(calleeName);
                if (funcRetElemType) {
                  localArrayElementTypes.set(tName, funcRetElemType);
                }
              }
              if (calleeObj?.type === 'Member') {
                const methodProp = typeof calleeObj.property === 'string' ? calleeObj.property : (calleeObj.property?.name || '');
                const srcName = calleeObj.object?.name || '';
                if (methodProp === 'filter' && srcName && localArrayElementTypes.has(srcName)) {
                  const srcElemType = localArrayElementTypes.get(srcName)!;
                  localArrayElementTypes.set(tName, srcElemType);
                  if (srcElemType === 'SlMap*' && localObjectFields.has(srcName)) {
                    localObjectFields.set(tName, new Map(localObjectFields.get(srcName)!));
                  }
                } else if (methodProp === 'map' && srcName && localArrayElementTypes.has(srcName)) {
                  const fnArg = (v.arguments || v.args || [])[0];
                  if (fnArg) {
                    const fnRetType = inferClosureReturnType(fnArg, localArrayElementTypes.get(srcName) || 'long long', srcName);
                    localArrayElementTypes.set(tName, fnRetType);
                    if (fnRetType === 'SlMap*' && localObjectFields.has(srcName)) {
                      localObjectFields.set(tName, new Map(localObjectFields.get(srcName)!));
                    }
                  }
                } else if (methodProp === 'slice' && srcName && localArrayElementTypes.has(srcName)) {
                  localArrayElementTypes.set(tName, localArrayElementTypes.get(srcName)!);
                } else if (methodProp === 'reverse' && srcName && localArrayElementTypes.has(srcName)) {
                  localArrayElementTypes.set(tName, localArrayElementTypes.get(srcName)!);
                } else if (methodProp === 'sort' && srcName && localArrayElementTypes.has(srcName)) {
                  localArrayElementTypes.set(tName, localArrayElementTypes.get(srcName)!);
                }
              }
            } else if (et === 'SlArray*' && v.type === 'Identifier') {
              const srcName = v.name;
              if (srcName && localArrayElementTypes.has(srcName)) {
                localArrayElementTypes.set(tName, localArrayElementTypes.get(srcName)!);
              }
              if (srcName && arrayElementTypes.has(srcName)) {
                localArrayElementTypes.set(tName, arrayElementTypes.get(srcName)!);
              }
            }
          }
        }
      }
      if (node.type === 'Identifier' && node.name) {
        const n = node.name;
        if (topLocals.has(n) || stringVars.has(n) || arrayVars.has(n) || objectVars.has(n)) {
          funcReferencedTopVars.add(n);
        }
      }
      for (const val of Object.values(node)) {
        if (typeof val === 'object' && val !== null) analyzeNode(val);
      }
    }

    stmt.body.forEach(analyzeNode);

    const paramTypes: string[] = params.map((p: any) => {
      const pname = typeof p === 'string' ? p : p.name;
      if (localStrings.has(pname)) return 'char*';
      if (localArrays.has(pname)) return 'SlArray*';
      if (localClosures.has(pname)) return 'SlClosure';
      if (localFloats.has(pname)) return 'double';
      return 'long long';
    });
    funcParamTypes.set(name, paramTypes);
    funcLocalVars.set(name, localInts);
    localVarTypes.clear();
    for (const v of localInts) localVarTypes.set(v, 'long long');
    for (const v of localFloats) localVarTypes.set(v, 'double');
    for (const v of localStrings) localVarTypes.set(v, 'char*');
    for (const v of localArrays) localVarTypes.set(v, 'SlArray*');
    for (const v of localObjects) localVarTypes.set(v, 'SlMap*');
    for (const v of localClosures) localVarTypes.set(v, 'SlClosure');
    for (const [vn, vt] of localInstancePtrTypes) localVarTypes.set(vn, vt);
    for (const [objName, fields] of localObjectFields) {
      for (const [fname, ftype] of fields) {
        localVarTypes.set(`${objName}_${fname}`, ftype);
      }
    }
    for (const p of params) {
      const pname = typeof p === 'string' ? p : p.name;
      localVarTypes.delete(pname);
    }
    funcLocalVarTypes.set(name, localVarTypes);

    let returnType = 'long long';
    for (const s of stmt.body) {
      if ((s.type === 'Return' || s.type === 'ReturnStatement') && s.value) {
        const et = localExprType(s.value);
        if (et !== 'long long') { returnType = et; break; }
      }
    }
    funcReturnTypes.set(name, returnType);
    if (returnType === 'SlArray*') {
      for (const s of stmt.body) {
        if ((s.type === 'Return' || s.type === 'ReturnStatement') && s.value) {
          const retExpr = s.value;
          if (retExpr.type === 'Identifier' && localArrayElementTypes.has(retExpr.name)) {
            funcReturnArrayElemTypes.set(name, localArrayElementTypes.get(retExpr.name)!);
          } else if (retExpr.type === 'ArrayLiteral') {
            const elements = retExpr.elements || [];
            if (elements.length > 0) {
              funcReturnArrayElemTypes.set(name, localExprType(elements[0]));
            }
          }
          break;
        }
      }
    }
    if (returnType === 'SlMap*') {
      for (const s of stmt.body) {
        if ((s.type === 'Return' || s.type === 'ReturnStatement') && s.value) {
          const retExpr = s.value;
          if (retExpr.type === 'Identifier' && localObjectFields.has(retExpr.name)) {
            funcReturnFields.set(name, new Map(localObjectFields.get(retExpr.name)!));
          } else if (retExpr.type === 'ObjectLiteral' || retExpr.type === 'Object') {
            const entries = retExpr.entries || [];
            const fields = new Map<string, string>();
            for (const entry of entries) {
              if (entry.kind === 'property') {
                fields.set(entry.key, localExprType(entry.value));
              }
            }
            if (fields.size > 0) funcReturnFields.set(name, fields);
          }
          break;
        }
      }
    }
    if (returnType === 'SlClosure' || returnType === 'SlClosure2') {
      for (const s of stmt.body) {
        if ((s.type === 'Return' || s.type === 'ReturnStatement') && s.value) {
          const retExpr = s.value;
          if (retExpr.type === 'Identifier' && localClosures.has(retExpr.name)) {
            const nestedReturnType = closureReturnTypes.get(retExpr.name);
            if (nestedReturnType && nestedReturnType !== 'long long') {
              closureReturnTypes.set(`__func_${name}`, nestedReturnType);
            }
          }
          break;
        }
      }
    }
  }

  function inferArrayElemTypesFromPush(stmts: any[]) {
    function visit(node: any) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const x of node) visit(x);
        return;
      }
      if (node.type === 'Action' && node.target) {
        visit(node.target);
        return;
      }
      if (node.type === 'Call' || node.type === 'FunctionCall') {
        const calleeObj = node.callee;
        const cname = calleeObj?.name || (typeof calleeObj === 'string' ? calleeObj : '');
        const args = node.arguments || node.args || [];
        if (cname === 'push' && args.length >= 2 && args[0].type === 'Identifier') {
          const arrName = args[0].name;
          if (!arrayElementTypes.has(arrName)) {
            const valType = exprType(args[1]);
            if (valType) arrayElementTypes.set(arrName, valType);
          }
        }
        if (calleeObj?.type === 'Member' && calleeObj.computed === false) {
          const methodProp = typeof calleeObj.property === 'string' ? calleeObj.property : (calleeObj.property?.name || '');
          if (methodProp === 'push' && args.length >= 1 && calleeObj.object?.type === 'Identifier') {
            const arrName = calleeObj.object.name;
            if (!arrayElementTypes.has(arrName)) {
              const valType = exprType(args[0]);
              if (valType) arrayElementTypes.set(arrName, valType);
            }
          }
        }
      }
      if (node.type === 'Assignment' || node.type === 'Assign') {
        const t = node.target || node.left;
        const v = node.value || node.right;
        if (t?.type === 'Member' && t.computed && t.object?.type === 'Identifier') {
          const arrName = t.object.name;
          if (!arrayElementTypes.has(arrName) && v) {
            const valType = exprType(v);
            if (valType) arrayElementTypes.set(arrName, valType);
          }
        }
        if (t?.type === 'Identifier' && v) {
          const targetName = t.name;
          const srcName = v.name;
          if (srcName && arrayElementTypes.has(srcName) && !arrayElementTypes.has(targetName)) {
            arrayElementTypes.set(targetName, arrayElementTypes.get(srcName)!);
          }
          if (v.type === 'Call' || v.type === 'FunctionCall') {
            const calleeName = v.callee?.name || '';
            if (funcReturnTypes.get(calleeName) === 'SlArray*') {
              const funcRetElemType = funcReturnArrayElemTypes.get(calleeName);
              if (funcRetElemType && !arrayElementTypes.has(targetName)) {
                arrayElementTypes.set(targetName, funcRetElemType);
              }
            }
          }
        }
      }
      for (const k of ['body', 'thenBranch', 'then', 'elseBranch', 'else', 'alternate', 'consequent', 'arguments', 'args']) {
        const ch = (node as any)[k];
        if (Array.isArray(ch)) visit(ch);
        else if (ch && typeof ch === 'object') visit(ch);
      }
    }
    for (const st of stmts) visit(st);
  }

  function analyzeClassDef(classDef: any) {
    const name = classDef.name;
    const superClassName = classDef.superClass;
    const props = new Map<string, string>();
    const methods = new Map<string, { params: string[]; returnType: string }>();

    if (superClassName && classDefs.has(superClassName)) {
      const parent = classDefs.get(superClassName)!;
      for (const [k, v] of parent.properties) props.set(k, v);
      for (const [k, v] of parent.methods) methods.set(k, v);
    }

    for (const prop of (classDef.properties || [])) {
      const ptype = prop.value ? exprType(prop.value) : 'long long';
      props.set(prop.name, ptype);
    }

    classDefs.set(name, { properties: props, methods, superClass: superClassName });

    for (const method of (classDef.methods || [])) {
      const mParams = (method.params || []).map((p: any) => typeof p === 'string' ? p : p.name);
      const methodFuncName = `${name}_${method.name}`;

      const localClassPtrs = new Map<string, string>();
      const localInts2 = new Set<string>();
      const localFloats2 = new Set<string>();
      const localStrings2 = new Set<string>();
      const localArrays2 = new Set<string>();
      const localClosures2 = new Set<string>();
      for (const p of mParams) localInts2.add(p);

      function mSetType(tName: string, et: string) {
        localClassPtrs.delete(tName);
        localInts2.delete(tName); localFloats2.delete(tName); localStrings2.delete(tName); localArrays2.delete(tName); localClosures2.delete(tName);
        if (et === 'char*') localStrings2.add(tName);
        else if (et === 'SlArray*') localArrays2.add(tName);
        else if (et === 'SlClosure' || et === 'SlClosure2') localClosures2.add(tName);
        else if (et === 'double') localFloats2.add(tName);
        else if (et.startsWith('Sl') && et.endsWith('*')) localClassPtrs.set(tName, et);
        else localInts2.add(tName);
      }

      function mGetType(n: string): string {
        if (localClassPtrs.has(n)) return localClassPtrs.get(n)!;
        if (localStrings2.has(n)) return 'char*';
        if (localArrays2.has(n)) return 'SlArray*';
        if (localClosures2.has(n)) return 'SlClosure';
        if (localFloats2.has(n)) return 'double';
        return 'long long';
      }

      function analyzeMethodNode(node: any) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(analyzeMethodNode); return; }
        if (node.type === 'Member' && !node.computed && node.object?.type === 'Identifier') {
          const objName = node.object.name;
          const pName = typeof node.property === 'string' ? node.property : (node.property?.name || '');
          if (objName !== 'this') {
            for (const [cn, cs] of classDefs) {
              if (cs.properties.has(pName)) {
                mSetType(objName, `Sl${cn}*`);
              }
            }
          }
        }
        if (node.type === 'Call' || node.type === 'FunctionCall') {
          const calleeObj = node.callee;
          const cname = calleeObj?.name || (typeof calleeObj === 'string' ? calleeObj : '');
          const args = node.arguments || node.args || [];
          if (cname === 'len' && args.length > 0 && args[0].type === 'Identifier') mSetType(args[0].name, 'SlArray*');
          if (cname === 'push' && args.length > 0 && args[0].type === 'Identifier') mSetType(args[0].name, 'SlArray*');
        }
        for (const val of Object.values(node)) {
          if (typeof val === 'object' && val !== null) analyzeMethodNode(val);
        }
      }
      for (const s of (method.body || [])) analyzeMethodNode(s);

      const methodLocalVarTypes = new Map<string, string>();
      for (const [v, t] of localClassPtrs) methodLocalVarTypes.set(v, t);
      for (const v of localInts2) methodLocalVarTypes.set(v, 'long long');
      for (const v of localFloats2) methodLocalVarTypes.set(v, 'double');
      for (const v of localStrings2) methodLocalVarTypes.set(v, 'char*');
      for (const v of localArrays2) methodLocalVarTypes.set(v, 'SlArray*');
      for (const v of localClosures2) methodLocalVarTypes.set(v, 'SlClosure');
      for (const p of mParams) methodLocalVarTypes.delete(p);

      const paramTypes: string[] = mParams.map((p: string) => mGetType(p));

      funcParamTypes.set(methodFuncName, paramTypes);
      funcLocalVarTypes.set(methodFuncName, methodLocalVarTypes);

      let mReturnType = 'long long';
      for (const s of (method.body || [])) {
        const unwrapped = s.type === 'Action' ? s.target : s;
        if (unwrapped && (unwrapped.type === 'Return' || unwrapped.type === 'ReturnStatement') && unwrapped.value) {
          mReturnType = exprType(unwrapped.value);
          break;
        }
      }
      methods.set(method.name, { params: mParams, returnType: mReturnType });

      for (const s of (method.body || [])) {
        const unwrapped = s.type === 'Action' ? s.target : s;
        if (unwrapped && (unwrapped.type === 'Assignment' || unwrapped.type === 'Assign') && unwrapped.target) {
          const t = unwrapped.target;
          if (t.type === 'Member' && t.object?.type === 'Identifier' && t.object.name === 'this') {
            const propName = typeof t.property === 'string' ? t.property : (t.property?.name || '');
            if (propName && !props.has(propName)) {
              const v = unwrapped.value || unwrapped.right;
              props.set(propName, v ? exprType(v) : 'long long');
            }
          }
        }
      }
    }

  }

  for (const stmt of program.statements) {
    if (stmt.type === 'ClassDef') analyzeClassDef(stmt);
  }

  function inferClassParamTypesFromCalls(stmts: any[]) {
    for (const stmt of stmts) {
      const unwrapped = stmt.type === 'Action' ? stmt.target : stmt;
      if (!unwrapped) continue;
      if (unwrapped.type === 'ExprStatement' || unwrapped.type === 'ExpressionStatement') {
        inferClassParamTypesFromExpr(unwrapped.expression || unwrapped.expr);
      }
      if (unwrapped.type === 'Assignment' || unwrapped.type === 'Assign') {
        inferClassParamTypesFromExpr(unwrapped.value || unwrapped.right);
      }
      if (unwrapped.type === 'VarDecl' || unwrapped.type === 'LetDecl') {
        inferClassParamTypesFromExpr(unwrapped.init || unwrapped.value);
      }
      if (unwrapped.type === 'Return' || unwrapped.type === 'ReturnStatement') {
        inferClassParamTypesFromExpr(unwrapped.value);
      }
      if (unwrapped.type === 'If' || unwrapped.type === 'IfStatement') {
        inferClassParamTypesFromExpr(unwrapped.condition);
        if (unwrapped.then) inferClassParamTypesFromCalls(Array.isArray(unwrapped.then) ? unwrapped.then : [unwrapped.then]);
        if (unwrapped.else) inferClassParamTypesFromCalls(Array.isArray(unwrapped.else) ? unwrapped.else : [unwrapped.else]);
        if (unwrapped.alternate) inferClassParamTypesFromCalls(Array.isArray(unwrapped.alternate) ? unwrapped.alternate : [unwrapped.alternate]);
      }
      if (unwrapped.type === 'While' || unwrapped.type === 'WhileStatement') {
        inferClassParamTypesFromExpr(unwrapped.condition);
        if (unwrapped.body) inferClassParamTypesFromCalls(Array.isArray(unwrapped.body) ? unwrapped.body : [unwrapped.body]);
      }
    }
  }

  function inferClassParamTypesFromExpr(expr: any) {
    if (!expr) return;
    if ((expr.type === 'Call' || expr.type === 'FunctionCall') && expr.callee) {
      const calleeName = expr.callee?.name || (typeof expr.callee === 'string' ? expr.callee : '');
      if (classDefs.has(calleeName)) {
        const cls = classDefs.get(calleeName)!;
        const initInfo = cls.methods.get('init');
        if (initInfo) {
          const args = expr.arguments || expr.args || [];
          for (let i = 0; i < args.length && i < initInfo.params.length; i++) {
            const argType = exprType(args[i]);
            if (argType !== 'long long') {
              const paramName = initInfo.params[i];
              const propType = cls.properties.get(paramName);
              if (propType === 'long long') {
                cls.properties.set(paramName, argType);
              }
              if (cls.superClass) {
                let ancestorName: string | undefined = cls.superClass;
                while (ancestorName) {
                  const ancestorCls = classDefs.get(ancestorName);
                  if (ancestorCls && ancestorCls.properties.get(paramName) === 'long long') {
                    ancestorCls.properties.set(paramName, argType);
                  }
                  ancestorName = ancestorCls?.superClass;
                }
              }
            }
          }
        }
      }
      const args = expr.arguments || expr.args || [];
      for (const a of args) inferClassParamTypesFromExpr(a);
    }
    if (expr.type === 'BinaryExpr' || expr.type === 'Binary' || expr.type === 'BinaryOp') {
      inferClassParamTypesFromExpr(expr.left);
      inferClassParamTypesFromExpr(expr.right);
    }
    if (expr.type === 'Member') {
      inferClassParamTypesFromExpr(expr.object);
    }
  }

  inferClassParamTypesFromCalls(program.statements);

  for (const [clsName, cls] of classDefs) {
    const savedClsName: string | null = currentClassName;
    currentClassName = clsName;
    for (const [mName, mInfo] of cls.methods) {
      const method = (program.statements.find((s: any) => s.type === 'ClassDef' && s.name === clsName) as any)?.methods?.find((m: any) => m.name === mName);
      if (method) {
        for (const s of (method.body || [])) {
          const unwrapped = s.type === 'Action' ? s.target : s;
          if (unwrapped && (unwrapped.type === 'Return' || unwrapped.type === 'ReturnStatement') && unwrapped.value) {
            const rt = exprType(unwrapped.value);
            if (rt !== 'long long') mInfo.returnType = rt;
            break;
          }
        }
      }
    }
    currentClassName = savedClsName;
  }

  for (const stmt of program.statements) {
    if (stmt.type === 'FunctionDef') analyzeFunctionTypes(stmt);
  }

  inferArrayElemTypesFromPush(program.statements);

  for (const v of topLocals) {
    const init = topInitExprs.get(v);
    if (init) {
      const et = exprType(init);
      if (et === 'char*') stringVars.add(v);
      else if (et === 'SlArray*') {
        arrayVars.add(v);
        if (init.type === 'ArrayLiteral') {
          const elements = init.elements || [];
          if (elements.length > 0) {
            const elemType = exprType(elements[0]);
            arrayElementTypes.set(v, elemType);
            if (elemType === 'SlMap*' && (elements[0].type === 'ObjectLiteral' || elements[0].type === 'Object')) {
              const entries = elements[0].entries || [];
              const fields = new Map<string, string>();
              for (const entry of entries) {
                if (entry.kind === 'property') {
                  fields.set(entry.key, exprType(entry.value));
                }
              }
              objectFields.set(v, fields);
            }
          }
        } else if (init.type === 'Call' || init.type === 'FunctionCall') {
          const calleeObj = init.callee;
          if (calleeObj?.type === 'Member') {
            const methodProp = typeof calleeObj.property === 'string' ? calleeObj.property : (calleeObj.property?.name || '');
            const srcName = calleeObj.object?.name || '';
            if (methodProp === 'filter' && srcName && arrayElementTypes.has(srcName)) {
              const srcElemType = arrayElementTypes.get(srcName)!;
              arrayElementTypes.set(v, srcElemType);
              if (srcElemType === 'SlMap*' && objectFields.has(srcName)) {
                objectFields.set(v, new Map(objectFields.get(srcName)!));
              }
            } else if (methodProp === 'map' && srcName && arrayElementTypes.has(srcName)) {
              const fnArg = (init.arguments || init.args || [])[0];
              if (fnArg) {
                const fnRetType = inferClosureReturnType(fnArg, arrayElementTypes.get(srcName) || 'long long', srcName);
                arrayElementTypes.set(v, fnRetType);
                if (fnRetType === 'SlMap*') {
                  const srcFields = objectFields.get(srcName);
                  if (srcFields) objectFields.set(v, new Map(srcFields));
                }
              }
            } else if (methodProp === 'slice' && srcName && arrayElementTypes.has(srcName)) {
              arrayElementTypes.set(v, arrayElementTypes.get(srcName)!);
              if (arrayElementTypes.get(srcName) === 'SlMap*' && objectFields.has(srcName)) {
                objectFields.set(v, new Map(objectFields.get(srcName)!));
              }
            } else if (methodProp === 'concat') {
              const otherElemType = srcName && arrayElementTypes.has(srcName) ? arrayElementTypes.get(srcName)! : 'long long';
              arrayElementTypes.set(v, otherElemType);
            } else if (methodProp === 'reverse' && srcName && arrayElementTypes.has(srcName)) {
              arrayElementTypes.set(v, arrayElementTypes.get(srcName)!);
            } else if (methodProp === 'sort' && srcName && arrayElementTypes.has(srcName)) {
              arrayElementTypes.set(v, arrayElementTypes.get(srcName)!);
            }
          }
        }
      }
      else if (et === 'SlMap*') {
        objectVars.add(v);
      }
      else if (et === 'SlClosure') {
        closureTypeVars.add(v);
        const fnInit = init;
        if (fnInit && (fnInit.type === 'ArrowFunction' || fnInit.type === 'Arrow' || fnInit.type === 'Function' || fnInit.type === 'FunctionDef')) {
          closureParamCounts.set(v, (fnInit.params || []).length);
        }
        if (fnInit && (fnInit.type === 'Call' || fnInit.type === 'FunctionCall')) {
          const calleeName = fnInit.callee?.name || '';
          const nestedRT = closureReturnTypes.get(`__func_${calleeName}`);
          if (nestedRT) closureReturnTypes.set(v, nestedRT);
        }
      }
      else if (et === 'double') floatVars.add(v);
      else if (et === 'bool') boolVars.add(v);
      else if (et.startsWith('Sl') && et.endsWith('*')) {
        const className = et.slice(2, -1);
        instanceVars.set(v, className);
      }
      else integerVars.add(v);
      if (et === 'SlMap*' && (init.type === 'ObjectLiteral' || init.type === 'Object')) {
        const entries = init.entries || [];
        const fields = new Map<string, string>();
        for (const entry of entries) {
          if (entry.kind === 'property') {
            const ft = exprType(entry.value);
            fields.set(entry.key, ft);
          }
        }
        objectFields.set(v, fields);
      }
      if (init.type === 'Call' || init.type === 'FunctionCall') {
        const calleeName = init.callee?.name || (typeof init.callee === 'string' ? init.callee : '');
        if (classDefs.has(calleeName)) {
          instanceVars.set(v, calleeName);
        }
      }
    } else {
      integerVars.add(v);
    }
  }

  function inferForInVarTypes(stmts: any[]) {
    for (const stmt of stmts) {
      if (!stmt) continue;
      if (stmt.type === 'ForIn') {
        const keyVar = stmt.variable || stmt.keyVar || stmt.name || 'item';
        forInIterVars.add(keyVar);
        const iterExpr = stmt.iterable;
        if (iterExpr) {
          const iterType = exprType(iterExpr);
          if (iterType === 'SlMap*') {
            stringVars.add(keyVar);
            integerVars.delete(keyVar);
          } else if (iterType === 'char*') {
            stringVars.add(keyVar);
            integerVars.delete(keyVar);
          } else if (iterType === 'SlArray*') {
            let elemType = 'long long';
            if (iterExpr.type === 'Identifier' && arrayElementTypes.has(iterExpr.name)) {
              elemType = arrayElementTypes.get(iterExpr.name)!;
            } else if (iterExpr.type === 'ArrayLiteral') {
              const elements = iterExpr.elements || [];
              if (elements.length > 0) elemType = exprType(elements[0]);
            } else if (iterExpr.type === 'Call' || iterExpr.type === 'FunctionCall') {
              const calleeObj = iterExpr.callee;
              const calleeName = calleeObj?.name || '';
              if (calleeName === 'split') elemType = 'char*';
              if (calleeObj?.type === 'Member') {
                const methodProp = typeof calleeObj.property === 'string' ? calleeObj.property : (calleeObj.property?.name || '');
                const srcName = calleeObj.object?.name || '';
                if (methodProp === 'filter' && srcName && arrayElementTypes.has(srcName)) {
                  elemType = arrayElementTypes.get(srcName)!;
                } else if (methodProp === 'map' && srcName && arrayElementTypes.has(srcName)) {
                  const fnArg = (iterExpr.arguments || iterExpr.args || [])[0];
                  if (fnArg) {
                    elemType = inferClosureReturnType(fnArg, arrayElementTypes.get(srcName) || 'long long', srcName);
                  }
                } else if (['slice', 'reverse', 'sort'].includes(methodProp) && srcName && arrayElementTypes.has(srcName)) {
                  elemType = arrayElementTypes.get(srcName)!;
                }
              }
            }
            if (elemType === 'SlMap*') {
              objectVars.add(keyVar); integerVars.delete(keyVar); stringVars.delete(keyVar); arrayVars.delete(keyVar); floatVars.delete(keyVar);
              let firstElem: any = null;
              if (iterExpr.type === 'Identifier') {
                const arrInit = topInitExprs.get(iterExpr.name);
                if (arrInit && arrInit.type === 'ArrayLiteral') {
                  const elems = arrInit.elements || [];
                  if (elems.length > 0) firstElem = elems[0];
                }
                if (objectFields.has(iterExpr.name)) {
                  objectFields.set(keyVar, new Map(objectFields.get(iterExpr.name)!));
                  firstElem = null;
                }
              } else if (iterExpr.type === 'ArrayLiteral') {
                const elems = iterExpr.elements || [];
                if (elems.length > 0) firstElem = elems[0];
              } else if (iterExpr.type === 'Call' || iterExpr.type === 'FunctionCall') {
                const calleeObj = iterExpr.callee;
                if (calleeObj?.type === 'Member') {
                  const srcName = calleeObj.object?.name || '';
                  if (srcName && objectFields.has(srcName)) {
                    objectFields.set(keyVar, new Map(objectFields.get(srcName)!));
                    firstElem = null;
                  }
                }
              }
              if (firstElem && (firstElem.type === 'ObjectLiteral' || firstElem.type === 'Object')) {
                const entries = firstElem.entries || [];
                const fields = new Map<string, string>();
                for (const entry of entries) {
                  if (entry.kind === 'property') {
                    fields.set(entry.key, exprType(entry.value));
                  }
                }
                objectFields.set(keyVar, fields);
              }
            } else if (elemType === 'char*') {
              stringVars.add(keyVar); integerVars.delete(keyVar); arrayVars.delete(keyVar); floatVars.delete(keyVar);
            } else if (elemType === 'SlArray*') {
              arrayVars.add(keyVar); integerVars.delete(keyVar); stringVars.delete(keyVar); floatVars.delete(keyVar);
            } else if (elemType === 'double') {
              floatVars.add(keyVar); integerVars.delete(keyVar); stringVars.delete(keyVar); arrayVars.delete(keyVar);
            } else {
              integerVars.add(keyVar);
            }
          }
        }
        if (stmt.body) inferForInVarTypes(stmt.body);
      } else if (stmt.type === 'For' || stmt.type === 'ForStmt') {
        if (stmt.body) inferForInVarTypes(stmt.body);
      } else if (stmt.type === 'While' || stmt.type === 'WhileStmt') {
        if (stmt.body) inferForInVarTypes(stmt.body);
      } else if (stmt.type === 'If' || stmt.type === 'IfStmt') {
        if (stmt.thenBranch) inferForInVarTypes(Array.isArray(stmt.thenBranch) ? stmt.thenBranch : [stmt.thenBranch]);
        if (stmt.elseBranch) inferForInVarTypes(Array.isArray(stmt.elseBranch) ? stmt.elseBranch : [stmt.elseBranch]);
      } else if (stmt.type === 'Action' && stmt.target) {
        if (stmt.target.type === 'ForIn') inferForInVarTypes([stmt.target]);
      }
    }
  }
  inferForInVarTypes(program.statements);

  function inferTopLocalClassPtrTypes(stmts: any[]) {
    function visit(node: any) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const x of node) visit(x);
        return;
      }
      if (node.type === 'Action' && node.target) {
        visit(node.target);
        return;
      }
      if (node.type === 'Assignment' || node.type === 'Assign') {
        const t = node.target || node.left;
        const v = node.value || node.right;
        if (
          t?.type === 'Identifier' &&
          topLocals.has(t.name) &&
          v?.type === 'Member' &&
          v.computed &&
          v.object?.type === 'Identifier'
        ) {
          const arrName = v.object.name;
          if (arrayVars.has(arrName) && arrayElementTypes.has(arrName)) {
            const et = arrayElementTypes.get(arrName)!;
            if (et.startsWith('Sl') && et.endsWith('*') && et !== 'SlArray*' && et !== 'SlMap*') {
              topLocalClassPtrTypes.set(t.name, et);
            }
          }
        }
      }
      for (const k of ['body', 'thenBranch', 'then', 'elseBranch', 'else', 'alternate', 'consequent']) {
        const ch = (node as any)[k];
        if (Array.isArray(ch)) visit(ch);
        else if (ch && typeof ch === 'object') visit(ch);
      }
    }
    for (const st of stmts) visit(st);
  }
  inferTopLocalClassPtrTypes(program.statements);

  function varType(name: string): string {
    if (stringVars.has(name)) return 'char*';
    if (arrayVars.has(name)) return 'SlArray*';
    if (objectVars.has(name)) return 'SlMap*';
    if (instanceVars.has(name)) return `Sl${instanceVars.get(name)}*`;
    if (topLocalClassPtrTypes.has(name)) return topLocalClassPtrTypes.get(name)!;
    if (closureTypeVars.has(name)) {
      const pc = closureParamCounts.get(name) || 1;
      return pc >= 2 ? 'SlClosure2' : 'SlClosure';
    }
    if (boolVars.has(name)) return 'long long';
    if (floatVars.has(name)) return 'double';
    if (currentFuncName) {
      const fvt = funcLocalVarTypes.get(currentFuncName);
      if (fvt && fvt.has(name)) return fvt.get(name)!;
      const fpt = funcParamTypes.get(currentFuncName);
      const fpp = currentFuncParams;
      if (fpt && fpp) {
        const idx = fpp.indexOf(name);
        if (idx >= 0 && idx < fpt.length) return fpt[idx];
      }
    }
    return 'long long';
  }

  function cFuncName(name: string): string {
    if (userFuncRenames.has(name)) return userFuncRenames.get(name)!;
    if (runtimeFuncNames.has(name)) {
      const renamed = `${name}_user`;
      userFuncRenames.set(name, renamed);
      return renamed;
    }
    return name;
  }

  function funcType(name: string): string {
    return funcReturnTypes.get(name) || 'long long';
  }

  const funcDefs: string[] = [];
  const classStructDefs: string[] = [];
  const topStmts: string[] = [];
  const varDecls: string[] = [];
  const varInitedInDecl = new Set<string>();
  let currentMemoFn: string | null = null;
  let currentMemoParam: string | null = null;
  let currentForcedEnc: 'i32' | 'i64' | null = null;
  let _tempIdCounter = 0;

  function slParallelThreshold(bodyCode: string): number {
    let cost = 1;
    const arrAccesses = (bodyCode.match(/sl_arr_get|->i32\[|->i64\[|->f64\[|->u8\[|->u16\[/g) || []).length;
    cost += arrAccesses * 3;
    const arithOps = (bodyCode.match(/[+\-*\/%]/g) || []).length;
    cost += arithOps;
    const funcCalls = (bodyCode.match(/sl_\w+\(/g) || []).length;
    cost += funcCalls * 5;
    const comparisons = (bodyCode.match(/[<>]=?|==|!=|&&|\|\|/g) || []).length;
    cost += comparisons * 2;
    return Math.max(500, Math.floor(50000 / cost));
  }

  /** Scalar OpenMP reduction target for loop-carried accumulators; null => do not emit parallel for this loop. */
  function slDetectReductionVar(bodyCode: string): string | null {
    const plusAssignMatch = bodyCode.match(/(sl_\w+)\s*\+=/);
    if (plusAssignMatch) return plusAssignMatch[1];
    const selfAddMatch = bodyCode.match(/(sl_\w+)\s*=\s*\1\s*\+/);
    if (selfAddMatch) return selfAddMatch[1];
    const addCallMatch = bodyCode.match(/(sl_\w+)\s*=\s*sl_\w+\(\s*\1\s*,/);
    if (addCallMatch) return addCallMatch[1];
    const postInc = bodyCode.match(/(sl_\w+)\+\+/);
    if (postInc) return postInc[1];
    const preInc = bodyCode.match(/\+\+(sl_\w+)/);
    if (preInc) return preInc[1];
    const postDec = bodyCode.match(/(sl_\w+)--/);
    const preDec = bodyCode.match(/--(sl_\w+)/);
    if (postDec) return postDec[1];
    if (preDec) return preDec[1];
    return null;
  }

  const ACAE_BAD_OMP = /sl_arr_push|sl_arr_set|sl_map_set|printf|fprintf|fopen|fwrite|sl_str_append|sl_release_arr|sl_arr_from/;

  function acaeNote(msg: string): void {
    if (options.acaeDiagnostics) acaeDiag.push(msg);
  }

  function acaeBodyFusionSafe(b0: any[], b1: any[], loopVar: string): boolean {
    const ex = new Set([loopVar]);
    const badStmt = (u: any): boolean => {
      if (!u) return true;
      const t = u.type;
      return ['ForIn', 'While', 'For', 'ForStatement', 'Break', 'Continue', 'Return', 'If', 'IfStatement', 'Switch', 'Try', 'TryStmt', 'FunctionDef', 'CoroutineDef'].includes(t);
    };
    const unwrap = (st: any) => (st?.type === 'Action' && st.target ? st.target : st);
    for (const st of b0) if (badStmt(unwrap(st))) return false;
    for (const st of b1) if (badStmt(unwrap(st))) return false;
    if (b0.length > 32 || b1.length > 32) return false;
    const writes = (body: any[]): Set<string> => {
      const w = new Set<string>();
      for (const st of body) {
        const u = unwrap(st);
        if (u?.type === 'Assignment' || u?.type === 'Assign') {
          const tgt = u.target;
          if (tgt?.type === 'Identifier') w.add(tgt.name);
          else return new Set(['__complex__']);
        } else if (u?.type === 'VarDecl' || u?.type === 'LetDecl') return new Set(['__complex__']);
      }
      return w;
    };
    const reads = (body: any[]): Set<string> => {
      const r = new Set<string>();
      const walk = (n: any): void => {
        if (!n || typeof n !== 'object') return;
        if (n.type === 'Assignment' || n.type === 'Assign') {
          const op = n.operator || '=';
          if (op !== '=' && op !== ':=') walk(n.target);
          walk(n.value);
          return;
        }
        if (n.type === 'Identifier' && n.name && !ex.has(n.name)) r.add(n.name);
        for (const key of Object.keys(n)) {
          if (key === 'type' || key === 'loc' || key === 'range') continue;
          if ((n.type === 'Assignment' || n.type === 'Assign') && key === 'target' && (n.operator || '=') === '=') continue;
          const c = (n as any)[key];
          if (Array.isArray(c)) c.forEach(walk);
          else if (c && typeof c === 'object') walk(c);
        }
      };
      for (const st of body) walk(unwrap(st));
      return r;
    };
    const w0 = writes(b0);
    const w1 = writes(b1);
    if (w0.has('__complex__') || w1.has('__complex__')) return false;
    for (const x of w0) if (w1.has(x)) return false;
    const r0 = reads(b0);
    const r1 = reads(b1);
    for (const x of w0) if (r1.has(x)) return false;
    for (const x of w1) if (r0.has(x)) return false;
    return true;
  }

  function jsonAstNoLine(node: any): string {
    return JSON.stringify(node, (key, val) => (key === 'line' || key === 'loc' ? undefined : val));
  }

  function fuseConsecutiveForInRangeLoops(stmts: any[]): any[] {
    if (!options.acaeFuseRangeLoops) return stmts;
    const out: any[] = [];
    let k = 0;
    while (k < stmts.length) {
      const s0 = stmts[k];
      const s1 = stmts[k + 1];
      if (!s1 || s0.type !== 'ForIn' || s1.type !== 'ForIn') {
        out.push(s0);
        k++;
        continue;
      }
      const v0 = s0.variable || s0.keyVar || s0.name;
      const v1 = s1.variable || s1.keyVar || s1.name;
      const it0 = s0.iterable;
      const it1 = s1.iterable;
      if (v0 !== v1 || !it0 || !it1 || it0.type !== 'Call' || it1.type !== 'Call') {
        out.push(s0);
        k++;
        continue;
      }
      if (it0.callee?.name !== 'range' || it1.callee?.name !== 'range') {
        out.push(s0);
        k++;
        continue;
      }
      if (jsonAstNoLine(it0) !== jsonAstNoLine(it1)) {
        out.push(s0);
        k++;
        continue;
      }
      const b0 = Array.isArray(s0.body) ? s0.body : [];
      const b1 = Array.isArray(s1.body) ? s1.body : [];
      if (!acaeBodyFusionSafe(b0, b1, String(v0))) {
        out.push(s0);
        k++;
        continue;
      }
      acaeNote(`Fused consecutive for-in range(...) (lines ${s0.line ?? '?'} + ${s1.line ?? '?'})`);
      out.push({
        ...s0,
        body: [...b0, ...b1],
        line: s0.line
      });
      k += 2;
    }
    return out;
  }

  for (const v of topLocals) {
    const vt = varType(v);
    const init = topInitExprs.get(v);
    if (objectVars.has(v) && objectFields.has(v)) {
      varDecls.push(`${vt} sl_${v} = 0;`);
    } else if (init) {
      const isSimple = init.type === 'NumberLiteral' || init.type === 'Number' ||
                       init.type === 'BooleanLiteral' || init.type === 'Boolean' ||
                       init.type === 'NullLiteral' || init.type === 'Null' ||
                       init.type === 'StringLiteral' || init.type === 'TextLiteral';
      if (isSimple) {
        if (vt === 'char*' && (init.type === 'StringLiteral' || init.type === 'TextLiteral')) {
          varDecls.push(`${vt} sl_${v} = strdup(${cExpr(init)});`);
        } else {
          varDecls.push(`${vt} sl_${v} = ${cExpr(init)};`);
        }
        varInitedInDecl.add(v);
      } else if (vt === 'SlClosure' || vt === 'SlClosure2') {
        varDecls.push(`${vt} sl_${v};`);
      } else {
        varDecls.push(`${vt} sl_${v} = 0;`);
      }
    } else {
      varDecls.push(`${vt} sl_${v} = 0;`);
    }
  }

  function cStrEscape(s: string): string {
    let r = '"';
    const utf8 = new TextEncoder().encode(s);
    for (let i = 0; i < utf8.length; i++) {
      const b = utf8[i];
      if (b === 34) r += '\\"';
      else if (b === 92) r += '\\\\';
      else if (b === 10) r += '\\n';
      else if (b === 13) r += '\\r';
      else if (b === 9) r += '\\t';
      else if (b === 0) r += '\\0';
      else if (b < 32 || b > 126) r += '\\x' + b.toString(16).padStart(2, '0');
      else r += String.fromCharCode(b);
    }
    r += '"';
    return r;
  }

  function cExpr(expr: any): string {
    if (!expr) return '0';
    switch (expr.type) {
      case 'NumberLiteral':
      case 'Number': {
        const nv = expr.value;
        const ns = String(nv);
        if (typeof nv === 'number' && Number.isInteger(nv) && (expr.raw && typeof expr.raw === 'string' && expr.raw.includes('.'))) {
          return ns + '.0';
        }
        if (typeof nv === 'number' && !Number.isInteger(nv) && !ns.includes('.') && !ns.includes('e') && !ns.includes('E')) {
          return ns + '.0';
        }
        return ns;
      }
      case 'StringLiteral':
      case 'TextLiteral':
        return cStrEscape(expr.value);
      case 'BooleanLiteral':
      case 'Boolean':
        return expr.value ? '1' : '0';
      case 'NullLiteral':
      case 'Null':
        return '0';
      case 'Identifier': {
        const n = expr.name;
        const et = exprType(expr);
        if (et === 'SlClosure' || et === 'SlClosure2') {
          return `sl_${n}`;
        }
        return `sl_${n}`;
      }
      case 'ArrayLiteral': {
        const elements = expr.elements || [];
        const hasSpread = elements.some((e: any) => e?.type === 'SpreadElement' || e?.operator === '...');
        if (hasSpread) {
          const parts: string[] = [];
          for (const e of elements) {
            if (e?.type === 'SpreadElement' || e?.operator === '...') {
              const spreadExpr = e.argument || e.expr;
              parts.push(cExpr(spreadExpr));
            } else {
              const et = exprType(e);
              if (et === 'double') parts.push(`sl_arr_from_doubles(1, (double[]){${cExpr(e)}})`);
              else if (et === 'char*') parts.push(`sl_arr_from_strs(1, (char*[]){${cExpr(e)}})`);
              else parts.push(`sl_arr_from_ints(1, (long long[]){${cExpr(e)}})`);
            }
          }
          if (parts.length === 1) return parts[0];
          return parts.reduce((a: string, b: string) => `sl_arr_concat(${a}, ${b})`);
        }
        const allInt = elements.every((e: any) => {
          const et = exprType(e);
          return et === 'long long' || et === 'int';
        });
        if (elements.length === 0) return `sl_arr_new_i32(64)`;
        if (allInt) {
          const intElems = elements.map((e: any) => cExpr(e));
          return `sl_arr_from_ints((long long[]){${intElems.join(', ')}}, ${intElems.length})`;
        }
        const elems = elements.map((e: any) => {
          const c = cExpr(e);
          const et = exprType(e);
          if (et === 'char*') return `sl_str(${c})`;
          if (et === 'SlArray*') return `sl_box_arr(${c})`;
          if (et === 'SlMap*') return `sl_map(${c})`;
          if (et === 'double') return `sl_dbl(${c})`;
          if (et.startsWith('Sl') && et.endsWith('*') && et !== 'SlArray*' && et !== 'SlMap*') return `sl_ptr((void*)(${c}))`;
          return `sl_int(${c})`;
        });
        return `sl_arr_from((SlValue[]){${elems.join(', ')}}, ${elems.length})`;
      }
      case 'Member': {
        const obj = cExpr(expr.object);
        const propName = typeof expr.property === 'string' ? expr.property : (expr.property?.name || '');
        const prop = expr.computed ? cExpr(expr.property) : propName;
        if (expr.computed) {
          const objType = exprType(expr.object);
          if (objType === 'SlArray*') {
            const arrId = expr.object?.type === 'Identifier' ? expr.object.name : '';
            let elemT = arrId && arrayElementTypes.has(arrId) ? arrayElementTypes.get(arrId)! : '';
            if (!elemT && expr.object?.type === 'Member' && expr.object.computed) {
              const outerArrId = expr.object.object?.type === 'Identifier' ? expr.object.object.name : '';
              const outerElemT = outerArrId && arrayElementTypes.has(outerArrId) ? arrayElementTypes.get(outerArrId)! : '';
              if (outerElemT === 'SlArray*') {
                const outerInit = topInitExprs.get(outerArrId);
                if (outerInit && outerInit.type === 'ArrayLiteral') {
                  const outerElements = outerInit.elements || [];
                  if (outerElements.length > 0 && outerElements[0].type === 'Identifier') {
                    const innerArrName = outerElements[0].name;
                    const innerElemT = arrayElementTypes.has(innerArrName) ? arrayElementTypes.get(innerArrName)! : '';
                    if (innerElemT === 'double') elemT = 'double';
                    else if (innerElemT === 'SlArray*') elemT = 'SlArray*';
                    else if (innerElemT === 'SlMap*') elemT = 'SlMap*';
                  }
                }
              }
            }
            if (
              elemT &&
              elemT.startsWith('Sl') &&
              elemT.endsWith('*') &&
              elemT !== 'SlArray*' &&
              elemT !== 'SlMap*'
            ) {
              return `((${elemT})(void*)(uintptr_t)sl_arr_get(${obj}, (int)(${prop})))`;
            }
            if (elemT === 'SlArray*') return `sl_arr_retain(sl_arr_getval(${obj}, ${prop}).aval)`;
            if (elemT === 'SlMap*') return `sl_map_retain(sl_arr_getval(${obj}, ${prop}).mval)`;
            if (elemT === 'double') return `sl_arr_get_dbl(${obj}, ${prop})`;
            return `sl_arr_get(${obj}, ${prop})`;
          }
          const objT = exprType(expr.object);
          if (objT === 'SlMap*') return `sl_to_int(sl_map_get(${obj}, sl_str_from_int(${prop}), sl_int(0)))`;
          return `sl_arr_get((SlArray*)${obj}, ${prop})`;
        }
        if (propName === 'length' || propName === 'len') return `sl_arr_len(${obj})`;
        if (expr.object?.type === 'Identifier' && expr.object.name === 'win32' && typeof propName === 'string' && propName.startsWith('VK_')) {
          return `SL_VK_${propName.substring(3)}`;
        }
        const objName = expr.object?.name || '';
        if (expr.object?.type === 'Identifier' && expr.object.name === 'this') {
          const currentClsName = currentClassName;
          if (currentClsName && parentHasProperty(classDefs.get(currentClsName)?.superClass, propName)) {
            return `self->_super.${propName}`;
          }
          return `self->${propName}`;
        }
        const fields = objectFields.get(objName);
        if (
          fields &&
          fields.has(propName) &&
          !objectVars.has(objName) &&
          !forInIterVars.has(objName) &&
          !noPreExtractVars.has(objName)
        ) {
          return `sl_${objName}_${propName}`;
        }
        if (instanceVars.has(objName)) {
          const clsName = instanceVars.get(objName)!;
          const cls = classDefs.get(clsName);
          if (cls && cls.properties.has(propName)) {
            if (parentHasProperty(cls.superClass, propName)) return `${obj}->_super.${propName}`;
            return `${obj}->${propName}`;
          }
        }
        if (expr.object?.type === 'Identifier' && objectVars.has(objName)) {
          const propType = exprType(expr);
          if (propType === 'char*') return `sl_map_get(${obj}, "${propName}", sl_str("")).sval`;
          if (propType === 'SlArray*') return `sl_arr_retain(sl_map_get(${obj}, "${propName}", sl_null()).aval)`;
          if (propType === 'SlMap*') return `sl_map_retain(sl_map_get(${obj}, "${propName}", sl_null()).mval)`;
          if (propType === 'double') return `sl_map_get(${obj}, "${propName}", sl_dbl(0)).dval`;
          return `sl_to_int(sl_map_get(${obj}, "${propName}", sl_int(0)))`;
        }
        const objType = exprType(expr.object);
        if (objType === 'SlMap*') {
          const propType = exprType(expr);
          if (propType === 'char*') return `sl_map_get(${obj}, "${propName}", sl_str("")).sval`;
          if (propType === 'SlArray*') return `sl_arr_retain(sl_map_get(${obj}, "${propName}", sl_null()).aval)`;
          if (propType === 'SlMap*') return `sl_map_retain(sl_map_get(${obj}, "${propName}", sl_null()).mval)`;
          if (propType === 'double') return `sl_map_get(${obj}, "${propName}", sl_dbl(0)).dval`;
          return `sl_to_int(sl_map_get(${obj}, "${propName}", sl_int(0)))`;
        }
        if (objType.startsWith('Sl') && objType.endsWith('*') && objType !== 'SlArray*') {
          const clsName = objType.substring(2, objType.length - 1);
          const cls = classDefs.get(clsName);
          if (cls && cls.properties.has(propName)) {
            if (parentHasProperty(cls.superClass, propName)) return `${obj}->_super.${propName}`;
            return `${obj}->${propName}`;
          }
        }
        if (objType === 'SlArray*') {
          return `sl_arr_get(${obj}, (long long)${prop})`;
        }
        return `sl_to_int(sl_map_get(${obj}, "${propName}", sl_int(0)))`;
      }
      case 'LogicalExpr':
      case 'Logical': {
        const op = (expr.operator === 'and' || expr.operator === '&&') ? '&&' : '||';
        const leftRaw = cExpr(expr.left);
        const rightRaw = cExpr(expr.right);
        const leftNeedParens = (expr.left?.type === 'LogicalExpr' || expr.left?.type === 'Logical') && (expr.left?.operator === 'or' || expr.left?.operator === '||') && op === '&&';
        const rightNeedParens = (expr.right?.type === 'LogicalExpr' || expr.right?.type === 'Logical') && (expr.right?.operator === 'or' || expr.right?.operator === '||') && op === '&&';
        const left = leftNeedParens ? `(${leftRaw})` : leftRaw;
        const right = rightNeedParens ? `(${rightRaw})` : rightRaw;
        return `${left} ${op} ${right}`;
      }
      case 'ConditionalExpr':
      case 'Conditional':
      case 'TernaryExpr':
        return `(${cExpr(expr.condition || expr.test)} ? ${cExpr(expr.consequent || expr.then)} : ${cExpr(expr.alternate || expr.else)})`;
      case 'ObjectLiteral':
      case 'Object': {
        const entries = expr.entries || expr.properties || [];
        const objId = `_obj_${++_tempIdCounter}`;
        const lines: string[] = [];
        lines.push(`({ SlMap* ${objId} = sl_map_new(${entries.length > 0 ? entries.length : 4});`);
        for (const entry of entries) {
          if (entry.kind === 'spread' && entry.value) {
            const spreadObj = cExpr(entry.value);
            lines.push(`   sl_map_merge(${objId}, ${spreadObj});`);
          } else if (entry.kind === 'property' || entry.key !== undefined) {
            const key = typeof entry.key === 'string' ? entry.key : (entry.key?.name || '');
            const val = entry.value ? cExpr(entry.value) : '0';
            const valExpr = entry.value;
            const vt = valExpr ? exprType(valExpr) : 'long long';
            lines.push(`   sl_map_set(${objId}, "${key}", ${boxFnForType(vt)}(${vt === 'long long' ? '(long long)' : ''}${val}));`);
          }
        }
        lines.push(`   ${objId}; })`);
        return lines.join('\n');
      }
      case 'BinaryExpr':
      case 'Binary':
      case 'BinaryOp': {
        const op = expr.operator === '==' ? '==' : expr.operator === '!=' ? '!=' : expr.operator;
        const cPrec: Record<string, number> = { '*': 5, '/': 5, '%': 5, '+': 4, '-': 4, '<<': 3, '>>': 3, '&': 2, '^': 2, '|': 1, '==': 0, '!=': 0, '<': 0, '>': 0, '<=': 0, '>=': 0, '&&': -1, '||': -2 };
        const parentPrec = cPrec[op] ?? 0;
        const needParens = (child: any, isRight: boolean) => {
          if (!child || (child.type !== 'Binary' && child.type !== 'BinaryOp' && child.type !== 'BinaryExpr')) return false;
          const childOp = child.operator;
          const childPrec = cPrec[childOp] ?? 0;
          if (childPrec < parentPrec) return true;
          if (childPrec === parentPrec && isRight && (op === '-' || op === '/' || op === '%')) return true;
          return false;
        };
        const leftRaw = cExpr(expr.left);
        const rightRaw = cExpr(expr.right);
        const left = needParens(expr.left, false) ? `(${leftRaw})` : leftRaw;
        const right = needParens(expr.right, true) ? `(${rightRaw})` : rightRaw;
        const lt = exprType(expr.left);
        const rt = exprType(expr.right);
        if (op === '&&') return `${left} && ${right}`;
        if (op === '||') return `${left} || ${right}`;
        if (op === '%') {
          if (lt === 'double' || rt === 'double') return `fmod(${left}, ${right})`;
          return `${left} % ${right}`;
        }
        if (op === '>>>') return `((unsigned long long)(${left}) >> (${right}))`;
        if (op === '+' && lt === 'char*') {
          if (rt === 'char*') {
            const leftIsConcat = expr.type === 'BinaryExpr' || expr.type === 'Binary' || expr.type === 'BinaryOp';
            if (leftIsConcat && (expr.left as any).operator === '+') return `sl_strcat_fl(${left}, ${right})`;
            return `sl_strcat(${left}, ${right})`;
          }
          if (rt === 'double') return `sl_strcat_fr(${left}, sl_dtoa(${right}))`;
          return `sl_strcat_fr(${left}, sl_itoa(${right}))`;
        }
        if (op === '+' && rt === 'char*') {
          if (lt === 'double') return `sl_strcat_fl(sl_dtoa(${left}), ${right})`;
          return `sl_strcat_fl(sl_itoa(${left}), ${right})`;
        }
        if (op === '+' && (lt === 'SlArray*' || rt === 'SlArray*')) {
          if (lt === 'SlArray*' && rt === 'SlArray*') return `sl_arr_concat(${left}, ${right})`;
          if (lt === 'SlArray*' && rt === 'long long') return `sl_arr_concat(${left}, sl_arr_from_ints(1, (long long)${right}))`;
          if (lt === 'SlArray*' && rt === 'double') return `sl_arr_concat(${left}, sl_arr_from_doubles(1, (double)${right}))`;
          if (rt === 'SlArray*' && lt === 'long long') return `sl_arr_concat(sl_arr_from_ints(1, (long long)${left}), ${right})`;
          if (rt === 'SlArray*' && lt === 'double') return `sl_arr_concat(sl_arr_from_doubles(1, (double)${left}), ${right})`;
          return `sl_arr_concat(${left}, ${right})`;
        }
        if (lt === 'char*' && rt === 'char*') {
          if (op === '==') return `sl_str_eq(${left}, ${right})`;
          if (op === '!=') return `sl_str_ne(${left}, ${right})`;
          if (op === '<') return `sl_str_lt(${left}, ${right})`;
          if (op === '>') return `sl_str_gt(${left}, ${right})`;
          if (op === '<=') return `sl_str_le(${left}, ${right})`;
          if (op === '>=') return `sl_str_ge(${left}, ${right})`;
        }
        return `${left} ${op} ${right}`;
      }
      case 'UnaryExpr':
      case 'Unary':
        if (expr.operator === 'not' || expr.operator === '!') return `!(${cExpr(expr.operand)})`;
        if (expr.operator === '~') {
          const opType = exprType(expr.operand);
          if (opType === 'double' || opType === 'char*' || stringVars.has(expr.operand?.name)) {
            return `(long long)(~(long long)sl_to_int(${cExpr(expr.operand)}))`;
          }
          return `~(${cExpr(expr.operand)})`;
        }
        if (expr.operator === '-' && expr.operand?.type === 'UnaryExpr' && (expr.operand?.operator === '-' || expr.operand?.operator === 'not' || expr.operand?.operator === '!')) return `-(${cExpr(expr.operand)})`;
        if (expr.operand?.type === 'BinaryExpr' || expr.operand?.type === 'Binary' || expr.operand?.type === 'BinaryOp' || expr.operand?.type === 'LogicalExpr' || expr.operand?.type === 'Logical') return `${expr.operator}(${cExpr(expr.operand)})`;
        return `${expr.operator}${cExpr(expr.operand)}`;
      case 'UpdateExpr':
      case 'UpdateExpression': {
        const arg = expr.argument || expr.operand;
        const argName = arg?.name || '';
        const op = expr.operator === '++' ? '++' : '--';
        const prefix = expr.prefix;
        if (argName && !arrayVars.has(argName)) {
          if (prefix) return `${op}sl_${argName}`;
          return `sl_${argName}${op}`;
        }
        return `(sl_${argName} = sl_${argName} ${op === '++' ? '+ 1' : '- 1'})`;
      }
      case 'Call':
      case 'FunctionCall': {
        const calleeObj = expr.callee;
        const calleeName = calleeObj?.name || calleeObj || '';
        const closureArgTypes = new Set(['ArrowFunction', 'Arrow', 'Function', 'FunctionDef']);
        const args = (expr.arguments || expr.args || []).map((a: any) => {
          if (closureArgTypes.has(a.type) && calleeObj?.type === 'Member') {
            const mp = typeof calleeObj.property === 'string' ? calleeObj.property : (calleeObj.property?.name || '');
            if (['map', 'filter', 'reduce', 'find', 'findIndex', 'every', 'some', 'forEach', 'sort'].includes(mp)) {
              return '__CLOSURE_ARG__';
            }
          }
          return cExpr(a);
        });
        const name = typeof calleeName === 'string' ? calleeName : (calleeName.name || 'unknown');
        if (calleeObj?.type === 'Member') {
          const methodProp = typeof calleeObj.property === 'string' ? calleeObj.property : (calleeObj.property?.name || '');
          const objExpr = cExpr(calleeObj.object);
          const objName = calleeObj.object?.name || '';
          if (calleeObj.object?.type === 'Identifier' && calleeObj.object.name === 'win32') {
            if (options.clcSubsystem !== 'windows') {
              clcWarnings.push(`win32.${methodProp}() requires Win32 GUI mode (use --subsystem windows when compiling)`);
              return '0';
            }
            if (methodProp === 'present') {
              return '(sl_win32_present(), 0)';
            }
            if (methodProp === 'pollEvents') {
              return '(long long)sl_win32_poll_events()';
            }
            if (methodProp === 'perfMillis') {
              return '(long long)sl_win32_perf_millis()';
            }
            if (methodProp === 'envInt') {
              if (args.length < 2) {
                clcWarnings.push('win32.envInt(key, defaultVal) expects 2 arguments (key string, default int)');
                return '0';
              }
              return `(long long)sl_win32_env_int(${args[0]}, (long long)(${args[1]}))`;
            }
            if (methodProp === 'setWindowTitleStats') {
              if (args.length < 5) {
                clcWarnings.push(
                  'win32.setWindowTitleStats(n, fps, collisions, diag, frame) expects 5 integer arguments'
                );
                return '0';
              }
              return `(sl_win32_set_window_title_stats((long long)(${args[0]}), (long long)(${args[1]}), (long long)(${args[2]}), (long long)(${args[3]}), (long long)(${args[4]})), 0LL)`;
            }
            if (methodProp === 'setWindowTitle') {
              if (args.length < 1) {
                clcWarnings.push('win32.setWindowTitle(text) expects 1 argument (UTF-8 string literal)');
                return '0';
              }
              return `(sl_win32_set_window_title_utf8(${args[0]}), 0LL)`;
            }
            if (methodProp === 'setWindowTitleFmt') {
              if (args.length < 6) {
                clcWarnings.push(
                  'win32.setWindowTitleFmt(fmt, a, b, c, d, e) expects 6 arguments (UTF-8 format string with five %lld, then five integers)'
                );
                return '0';
              }
              return `(sl_win32_set_window_title_fmt(${args[0]}, (long long)(${args[1]}), (long long)(${args[2]}), (long long)(${args[3]}), (long long)(${args[4]}), (long long)(${args[5]})), 0LL)`;
            }
            if (methodProp === 'width') {
              return '(long long)sl_win32_fb_w';
            }
            if (methodProp === 'height') {
              return '(long long)sl_win32_fb_h';
            }
            if (methodProp === 'setPixel') {
              if (args.length < 3) {
                clcWarnings.push('win32.setPixel(x, y, color) expects 3 arguments');
                return '0';
              }
              const ax = args[0];
              const ay = args[1];
              const ac = args[2];
              return `({ long long sl__px = (long long)(${ax}); long long sl__py = (long long)(${ay}); uint32_t sl__pc = (uint32_t)(unsigned long long)(${ac}); if (sl_win32_fb_pixels && sl__px >= 0 && sl__py >= 0 && sl__px < sl_win32_fb_w && sl__py < sl_win32_fb_h) sl_win32_fb_pixels[sl__py * (long long)sl_win32_fb_w + sl__px] = sl__pc; 0LL; })`;
            }
            if (methodProp === 'setPixelUnsafe') {
              if (args.length < 3) {
                clcWarnings.push('win32.setPixelUnsafe(x, y, color) expects 3 arguments');
                return '0';
              }
              const ax = args[0];
              const ay = args[1];
              const ac = args[2];
              return `(sl_win32_set_pixel_unsafe((int)(${ax}), (int)(${ay}), (uint32_t)(unsigned long long)(${ac})), 0LL)`;
            }
            if (methodProp === 'stepBalls') {
              if (args.length < 8) {
                clcWarnings.push('win32.stepBalls(bx,by,br,bvx,bvy,n,W,H) expects 8 arguments');
                return '0';
              }
              return `sl_win32_step_balls(${args[0]}->i32, ${args[1]}->i32, ${args[2]}->i32, ${args[3]}->i32, ${args[4]}->i32, (int)(${args[5]}), (int)(${args[6]}), (int)(${args[7]}))`;
            }
            if (methodProp === 'collideBalls') {
              if (args.length < 6) {
                clcWarnings.push('win32.collideBalls(bx,by,br,bvx,bvy,n) expects 6 arguments');
                return '0';
              }
              return `sl_win32_collide_balls(${args[0]}->i32, ${args[1]}->i32, ${args[2]}->i32, ${args[3]}->i32, ${args[4]}->i32, (int)(${args[5]}))`;
            }
            if (methodProp === 'clear') {
              if (args.length < 1) {
                clcWarnings.push('win32.clear(color) expects 1 argument');
                return '0';
              }
              return `(sl_win32_clear((uint32_t)(unsigned long long)(${args[0]})), 0LL)`;
            }
            if (methodProp === 'fillSpan') {
              if (args.length < 4) {
                clcWarnings.push('win32.fillSpan(x, y, w, color) expects 4 arguments');
                return '0';
              }
              return `(sl_win32_fill_span((int)(${args[0]}), (int)(${args[1]}), (int)(${args[2]}), (uint32_t)(unsigned long long)(${args[3]})), 0LL)`;
            }
            if (methodProp === 'fillRect') {
              if (args.length < 5) {
                clcWarnings.push('win32.fillRect(x, y, w, h, color) expects 5 arguments');
                return '0';
              }
              return `(sl_win32_fill_rect((int)(${args[0]}), (int)(${args[1]}), (int)(${args[2]}), (int)(${args[3]}), (uint32_t)(unsigned long long)(${args[4]})), 0LL)`;
            }
            if (methodProp === 'fillCircle') {
              if (args.length < 4) {
                clcWarnings.push('win32.fillCircle(cx, cy, r, color) expects 4 arguments');
                return '0';
              }
              return `(sl_win32_fill_circle((int)(${args[0]}), (int)(${args[1]}), (int)(${args[2]}), (uint32_t)(unsigned long long)(${args[3]})), 0LL)`;
            }
            if (methodProp === 'drawText') {
              if (args.length < 4) {
                clcWarnings.push('win32.drawText(x, y, color, text) expects 4 arguments (text: ASCII string)');
                return '0';
              }
              return `(sl_win32_draw_text((int)(${args[0]}), (int)(${args[1]}), (uint32_t)(unsigned long long)(${args[2]}), ${args[3]}), 0LL)`;
            }
            if (methodProp === 'drawInt') {
              if (args.length < 4) {
                clcWarnings.push('win32.drawInt(x, y, color, value) expects 4 arguments');
                return '0';
              }
              return `(sl_win32_draw_int((int)(${args[0]}), (int)(${args[1]}), (uint32_t)(unsigned long long)(${args[2]}), (long long)(${args[3]})), 0LL)`;
            }
            if (methodProp === 'clusterBegin') {
              return '(sl_cluster_begin(), 0LL)';
            }
            if (methodProp === 'clusterBeginDirect') {
              return '(sl_cluster_begin_direct(), 0LL)';
            }
            if (methodProp === 'clusterAddSpan') {
              if (args.length < 4) {
                clcWarnings.push('win32.clusterAddSpan(y, x1, x2, color) expects 4 arguments');
                return '0';
              }
              return `(sl_cluster_add_span((int)(${args[0]}), (int)(${args[1]}), (int)(${args[2]}), (uint32_t)(unsigned long long)(${args[3]})), 0LL)`;
            }
            if (methodProp === 'clusterAddRect') {
              if (args.length < 5) {
                clcWarnings.push('win32.clusterAddRect(x, y, w, h, color) expects 5 arguments');
                return '0';
              }
              return `(sl_cluster_add_rect((int)(${args[0]}), (int)(${args[1]}), (int)(${args[2]}), (int)(${args[3]}), (uint32_t)(unsigned long long)(${args[4]})), 0LL)`;
            }
            if (methodProp === 'clusterAddCircle') {
              if (args.length < 4) {
                clcWarnings.push('win32.clusterAddCircle(cx, cy, r, color) expects 4 arguments');
                return '0';
              }
              return `(sl_cluster_add_circle((int)(${args[0]}), (int)(${args[1]}), (int)(${args[2]}), (uint32_t)(unsigned long long)(${args[3]})), 0LL)`;
            }
            if (methodProp === 'clusterFlush') {
              return '(sl_cluster_flush(), 0LL)';
            }
            if (methodProp === 'dirtyBegin') {
              return '(sl_dirty_begin(), 0LL)';
            }
            if (methodProp === 'dirtyEnd') {
              return '(sl_dirty_end(), 0LL)';
            }
            if (methodProp === 'clearDirty') {
              if (args.length < 1) {
                clcWarnings.push('win32.clearDirty(color) expects 1 argument');
                return '0';
              }
              return `(sl_win32_clear_dirty((uint32_t)(unsigned long long)(${args[0]})), 0LL)`;
            }
            if (methodProp === 'fiberConvert') {
              return '(long long)(intptr_t)ConvertThreadToFiber(NULL)';
            }
            if (methodProp === 'fiberRevert') {
              return '(ConvertFiberToThread(), 0LL)';
            }
            if (methodProp === 'fiberCreate') {
              if (args.length < 1) {
                clcWarnings.push('win32.fiberCreate(fn) expects 1 closure argument');
                return '0';
              }
              const fnArg = args[0];
              return `(long long)(intptr_t)sl_win32_fiber_create(${fnArg})`;
            }
            if (methodProp === 'fiberSwitch') {
              if (args.length < 1) {
                clcWarnings.push('win32.fiberSwitch(handle) expects 1 argument');
                return '0';
              }
              return `(SwitchToFiber((LPVOID)(intptr_t)(${args[0]})), 0LL)`;
            }
            if (methodProp === 'fiberDelete') {
              if (args.length < 1) {
                clcWarnings.push('win32.fiberDelete(handle) expects 1 argument');
                return '0';
              }
              return `(DeleteFiber((LPVOID)(intptr_t)(${args[0]})), 0LL)`;
            }
            if (methodProp === 'isKeyDown') {
              if (args.length < 1) {
                clcWarnings.push('win32.isKeyDown(keyCode) expects 1 argument');
                return '0';
              }
              return `(long long)sl_win32_is_key_down((int)(${args[0]}))`;
            }
            if (methodProp === 'mouseX') {
              return '(long long)sl_win32_mouse_x()';
            }
            if (methodProp === 'mouseY') {
              return '(long long)sl_win32_mouse_y()';
            }
            if (methodProp === 'isMouseDown') {
              if (args.length < 1) {
                clcWarnings.push('win32.isMouseDown(button) expects 1 argument (0=left, 1=right, 2=middle)');
                return '0';
              }
              return `(long long)sl_win32_is_mouse_down((int)(${args[0]}))`;
            }
            if (methodProp === 'mouseWheel') {
              return '(long long)sl_win32_mouse_wheel()';
            }
            clcWarnings.push(`unsupported win32.${methodProp}() for CLC Win32`);
            return '0';
          }
          if (instanceVars.has(objName)) {
            const cls = classDefs.get(instanceVars.get(objName)!);
            if (cls && cls.methods.has(methodProp)) {
              return `sl_${instanceVars.get(objName)}_${methodProp}(${objExpr}${args.length > 0 ? ', ' + args.join(', ') : ''})`;
            }
          }
          {
            const objTypeStr = exprType(calleeObj.object);
            if (objTypeStr.startsWith('Sl') && objTypeStr.endsWith('*') && objTypeStr !== 'SlArray*' && objTypeStr !== 'SlMap*' && objTypeStr !== 'SlClosure*' && objTypeStr !== 'SlClosure2*') {
              const clsNameFromType = objTypeStr.substring(2, objTypeStr.length - 1);
              const clsFromType = classDefs.get(clsNameFromType);
              if (clsFromType && clsFromType.methods.has(methodProp)) {
                return `sl_${clsNameFromType}_${methodProp}(${objExpr}${args.length > 0 ? ', ' + args.join(', ') : ''})`;
              }
            }
          }
          if (methodProp === 'map') {
            const fnArg = (expr.arguments || expr.args || [])[0];
            const arrName = expr.object?.name || objName;
            const elemType = arrayElementTypes.get(arrName) || 'long long';
            if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
              const closureCode = compileClosure(fnArg, false, [elemType], arrName);
              const retType = inferClosureReturnType(fnArg, elemType, arrName);
              let pushExpr: string;
              if (retType === 'char*') pushExpr = `sl_arr_push(_mr, sl_str((char*)${closureCode}.fn(${closureCode}.ctx, sl_arr_get(${objExpr}, _mi))))`;
              else if (retType === 'SlMap*') pushExpr = `sl_arr_push(_mr, sl_map((SlMap*)${closureCode}.fn(${closureCode}.ctx, sl_arr_get(${objExpr}, _mi))))`;
              else if (retType === 'SlArray*') pushExpr = `sl_arr_push(_mr, sl_box_arr((SlArray*)${closureCode}.fn(${closureCode}.ctx, sl_arr_get(${objExpr}, _mi))))`;
              else if (retType === 'double') pushExpr = `sl_arr_push_dbl(_mr, (double)${closureCode}.fn(${closureCode}.ctx, sl_arr_get(${objExpr}, _mi)))`;
              else pushExpr = `sl_arr_push_int(_mr, ${closureCode}.fn(${closureCode}.ctx, sl_arr_get(${objExpr}, _mi)))`;
              return `({SlArray* _mr = sl_arr_new(${objExpr}->len > 0 ? ${objExpr}->len : 16); for (int _mi = 0; _mi < ${objExpr}->len; _mi++) ${pushExpr}; _mr;})`;
            }
            if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
              const fnName = cFuncName(fnArg.name);
              const wn = ensureClosureWrapper(fnName, 1);
              return `sl_arr_map_closure(${objExpr}, (SlClosure){ .fn = ${wn}, .ctx = NULL })`;
            }
            return `sl_arr_map(${objExpr}, ${args[0]})`;
          }
          if (methodProp === 'filter') {
            const fnArg = (expr.arguments || expr.args || [])[0];
            const arrName = expr.object?.name || objName;
            const elemType = arrayElementTypes.get(arrName) || 'long long';
            if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
              const closureCode = compileClosure(fnArg, false, [elemType], arrName);
              return `({SlArray* _fr = sl_arr_new(${objExpr}->len > 0 ? ${objExpr}->len : 16); for (int _fi = 0; _fi < ${objExpr}->len; _fi++) if (${closureCode}.fn(${closureCode}.ctx, sl_arr_get(${objExpr}, _fi))) sl_arr_push(_fr, sl_value_retain(sl_arr_getval(${objExpr}, _fi))); _fr;})`;
            }
            if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
              const fnName = cFuncName(fnArg.name);
              const wn = ensureClosureWrapper(fnName, 1);
              return `sl_arr_filter_closure(${objExpr}, (SlClosure){ .fn = ${wn}, .ctx = NULL })`;
            }
            return `sl_arr_filter(${objExpr}, ${args[0]})`;
          }
          if (methodProp === 'reduce') {
            const fnArg = (expr.arguments || expr.args || [])[1];
            const arrName = expr.object?.name || objName;
            const elemType = arrayElementTypes.get(arrName) || 'long long';
            if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
              const closureCode = compileClosure(fnArg, true, [elemType, elemType], arrName);
              const initArg = args.length > 0 ? args[0] : '0';
              const accType = args.length > 0 && (args[0].includes('sl_dbl') || args[0].includes('.') || args[0].includes('sl_to_dbl')) ? 'double' : 'long long';
              const accInit = accType === 'double' ? (args.length > 0 ? args[0] : '0.0') : initArg;
              const accCast = accType === 'double' ? '(double)' : '';
              return `({${accType} _acc = ${accInit}; for (int _ri = 0; _ri < ${objExpr}->len; _ri++) _acc = ${accCast}${closureCode}.fn2(${closureCode}.ctx, _acc, sl_arr_get(${objExpr}, _ri)); _acc;})`;
            }
            if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
              const fnName = cFuncName(fnArg.name);
              const wn = ensureClosureWrapper(fnName, 2);
              return `sl_arr_reduce_closure(${objExpr}, ${args.length > 0 ? args[0] : '0'}, (SlClosure2){ .fn2 = ${wn}, .ctx = NULL })`;
            }
            return `sl_arr_reduce(${objExpr}, ${args[0]}, ${args.length > 1 ? args[1] : '0'})`;
          }
          if (methodProp === 'push') {
            const pushValExpr = (expr.arguments || expr.args || [])[0];
            const pushValType = pushValExpr ? exprType(pushValExpr) : 'long long';
            if (pushValType === 'double') return `(sl_arr_push_dbl(${objExpr}, ${args[0]}), 0)`;
            if (pushValType === 'long long') return `(sl_arr_push_int(${objExpr}, ${args[0]}), 0)`;
            return `(sl_arr_push(${objExpr}, ${boxFnForType(pushValType)}(${args[0]})), 0)`;
          }
          if (methodProp === 'pop') return `sl_arr_pop(${objExpr})`;
          if (methodProp === 'shift') return `sl_arr_shift(${objExpr})`;
          if (methodProp === 'reverse') return `sl_arr_reverse(${objExpr})`;
          if (methodProp === 'sort') return `sl_arr_sort(${objExpr})`;
          if (methodProp === 'indexOf') {
            if (exprType(calleeObj.object) === 'char*') return `sl_str_indexOf(${objExpr}, ${args[0]})`;
            return `sl_arr_indexOf(${objExpr}, ${args[0]})`;
          }
          if (methodProp === 'includes') {
            if (exprType(calleeObj.object) === 'char*') return `sl_str_includes(${objExpr}, ${args[0]})`;
            return `sl_arr_includes(${objExpr}, ${args[0]})`;
          }
          if (methodProp === 'join') return `sl_arr_join(${objExpr}, ${args.length > 0 ? args[0] : '" "'})`;
          if (methodProp === 'slice') return `sl_arr_slice(${objExpr}, ${args[0]}, ${args.length > 1 ? args[1] : '0'})`;
          if (methodProp === 'concat') return `sl_arr_concat(${objExpr}, ${args[0]})`;
          if (methodProp === 'unique') return `sl_arr_unique(${objExpr})`;
          if (methodProp === 'find') {
            const fnArg = (expr.arguments || expr.args || [])[0];
            if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
              return `sl_arr_find_closure(${objExpr}, ${compileClosure(fnArg)})`;
            }
            if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
              const fnName = cFuncName(fnArg.name);
              const wn = ensureClosureWrapper(fnName, 1);
              return `sl_arr_find_closure(${objExpr}, (SlClosure){ .fn = ${wn}, .ctx = NULL })`;
            }
            return `sl_arr_find(${objExpr}, ${args[0]})`;
          }
          if (methodProp === 'findIndex') {
            const fnArg = (expr.arguments || expr.args || [])[0];
            if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
              return `sl_arr_findIndex_closure(${objExpr}, ${compileClosure(fnArg)})`;
            }
            if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
              const fnName = cFuncName(fnArg.name);
              const wn = ensureClosureWrapper(fnName, 1);
              return `sl_arr_findIndex_closure(${objExpr}, (SlClosure){ .fn = ${wn}, .ctx = NULL })`;
            }
            return `sl_arr_findIndex(${objExpr}, ${args[0]})`;
          }
          if (methodProp === 'every') {
            const fnArg = (expr.arguments || expr.args || [])[0];
            if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
              return `sl_arr_every_closure(${objExpr}, ${compileClosure(fnArg)})`;
            }
            if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
              const fnName = cFuncName(fnArg.name);
              const wn = ensureClosureWrapper(fnName, 1);
              return `sl_arr_every_closure(${objExpr}, (SlClosure){ .fn = ${wn}, .ctx = NULL })`;
            }
            return `sl_arr_every(${objExpr}, ${args[0]})`;
          }
          if (methodProp === 'some') {
            const fnArg = (expr.arguments || expr.args || [])[0];
            if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
              return `sl_arr_some_closure(${objExpr}, ${compileClosure(fnArg)})`;
            }
            if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
              const fnName = cFuncName(fnArg.name);
              const wn = ensureClosureWrapper(fnName, 1);
              return `sl_arr_some_closure(${objExpr}, (SlClosure){ .fn = ${wn}, .ctx = NULL })`;
            }
            return `sl_arr_some(${objExpr}, ${args[0]})`;
          }
          if (methodProp === 'forEach') {
            const fnArg = (expr.arguments || expr.args || [])[0];
            if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
              return `(sl_arr_forEach_closure(${objExpr}, ${compileClosure(fnArg)}), 0)`;
            }
            if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
              const fnName = cFuncName(fnArg.name);
              const wn = ensureClosureWrapper(fnName, 1);
              return `(sl_arr_forEach_closure(${objExpr}, (SlClosure){ .fn = ${wn}, .ctx = NULL }), 0)`;
            }
            return `(sl_arr_forEach(${objExpr}, ${args[0]}), 0)`;
          }
          if (methodProp === 'flat') return `sl_arr_flat(${objExpr})`;
          if (methodProp === 'fill') {
            const fillValExpr = (expr.arguments || expr.args || [])[0];
            const fillValType = fillValExpr ? exprType(fillValExpr) : 'long long';
            return `sl_arr_fill(${objExpr}, ${boxFnForType(fillValType)}(${args[0]}), ${args.length > 1 ? args[1] : '0'}, ${args.length > 2 ? args[2] : '0'})`;
          }
          if (methodProp === 'sum') return (options.cuda ? `sl_cuda_arr_sum(${objExpr})` : options.gpu ? `sl_gpu_arr_sum(${objExpr})` : `sl_arr_sum(${objExpr})`);
          if (methodProp === 'avg') return `sl_arr_avg(${objExpr})`;
          if (methodProp === 'unshift') {
            const unshiftValExpr = (expr.arguments || expr.args || [])[0];
            const unshiftValType = unshiftValExpr ? exprType(unshiftValExpr) : 'long long';
            return `(sl_arr_unshift(${objExpr}, ${boxFnForType(unshiftValType)}(${args[0]})), 0)`;
          }
          if (methodProp === 'lastIndexOf') {
            if (exprType(calleeObj.object) === 'char*') return `sl_str_lastIndexOf(${objExpr}, ${args[0]})`;
            return `sl_arr_lastIndexOf(${objExpr}, ${args[0]})`;
          }
          if (methodProp === 'length' || methodProp === 'len') return `sl_arr_len(${objExpr})`;
          if (methodProp === 'upper') return `sl_str_upper(${objExpr})`;
          if (methodProp === 'lower') return `sl_str_lower(${objExpr})`;
          if (methodProp === 'trim') return `sl_str_trim(${objExpr})`;
          if (methodProp === 'replace') return `sl_str_replace(${objExpr}, ${args[0]}, ${args[1]})`;
          if (methodProp === 'substring') return `sl_str_substring(${objExpr}, ${args[0]}, ${args.length > 1 ? args[1] : '-1'})`;
          if (methodProp === 'split') return `sl_str_split(${objExpr}, ${args[0]})`;
          if (methodProp === 'charAt') return `sl_str_charAt(${objExpr}, ${args[0]})`;
          if (methodProp === 'startsWith') return `sl_str_startsWith(${objExpr}, ${args[0]})`;
          if (methodProp === 'endsWith') return `sl_str_endsWith(${objExpr}, ${args[0]})`;
          if (methodProp === 'repeat') return `sl_str_repeat(${objExpr}, ${args[0]})`;
          if (methodProp === 'indexOf' && exprType(calleeObj.object) === 'char*') return `sl_str_indexOf(${objExpr}, ${args[0]})`;
          if (methodProp === 'includes' && exprType(calleeObj.object) === 'char*') return `sl_str_includes(${objExpr}, ${args[0]})`;
          if (methodProp === 'padStart') return `sl_str_padStart(${objExpr}, ${args[0]}, ${args.length > 1 ? args[1] : '" "'})`;
          if (methodProp === 'padEnd') return `sl_str_padEnd(${objExpr}, ${args[0]}, ${args.length > 1 ? args[1] : '" "'})`;
          if (methodProp === 'trimStart') return `sl_str_trimStart(${objExpr})`;
          if (methodProp === 'trimEnd') return `sl_str_trimEnd(${objExpr})`;
          if (methodProp === 'lastIndexOf' && exprType(calleeObj.object) === 'char*') return `sl_str_lastIndexOf(${objExpr}, ${args[0]})`;
          if (methodProp === 'entries') return `sl_map_entries(${objExpr})`;
          if (methodProp === 'get') return `sl_to_int(sl_map_get(${objExpr}, ${args[0]}, sl_int(0)))`;
          if (methodProp === 'getStr') return `sl_map_get(${objExpr}, ${args[0]}, sl_str("")).sval`;
          if (methodProp === 'getDbl') return `sl_map_get(${objExpr}, ${args[0]}, sl_dbl(0.0)).dval`;
          if (methodProp === 'getMap') return `sl_map_retain(sl_map_get(${objExpr}, ${args[0]}, sl_null()).mval)`;
          if (methodProp === 'getArr') return `sl_arr_retain(sl_map_get(${objExpr}, ${args[0]}, sl_null()).aval)`;
          if (methodProp === 'set') {
            const valExpr = (expr.arguments || expr.args || [])[1];
            const valType = valExpr ? exprType(valExpr) : 'long long';
            return `(sl_map_set(${objExpr}, ${args[0]}, ${boxFnForType(valType)}(${args.length > 1 ? args[1] : '0'})), 0)`;
          }
          if (methodProp === 'has') return `sl_map_has(${objExpr}, ${args[0]})`;
          if (methodProp === 'keys') return `sl_map_keys(${objExpr})`;
          if (methodProp === 'values') return `sl_map_values(${objExpr})`;
          if (methodProp === 'toString') return `sl_toString(${objExpr})`;
          if (methodProp === 'replaceAll') return `sl_str_replaceAll(${objExpr}, ${args[0]}, ${args[1]})`;
          if (methodProp === 'toLower') return `sl_str_lower(${objExpr})`;
          if (methodProp === 'toUpper') return `sl_str_upper(${objExpr})`;
        }
        if (classDefs.has(name)) {
          return `sl_${name}_new(${args.join(', ')})`;
        }
        if (name === 'gpuAvailable') return options.gpu ? `sl_gpu_available()` : `0`;
        if (name === 'gpuSum') return options.gpu ? `sl_gpu_arr_sum(${args[0]})` : `sl_arr_sum(${args[0]})`;
        if (name === 'gpuRange' && options.gpu) return `sl_gpu_arr_range(${args[0] || '0'}, ${args[1] || '0'}, ${args[2] || '1'})`;
        if (name === 'gpuScale' && options.gpu) return `sl_gpu_arr_scale(${args[0]}, ${args[1]})`;
        if (name === 'gpuAdd' && options.gpu) return `sl_gpu_arr_add(${args[0]}, ${args[1]})`;
        if (name === 'gpuMultiply' && options.gpu) return `sl_gpu_arr_multiply(${args[0]}, ${args[1]})`;
        if (name === 'gpuDot' && options.gpu) return `sl_gpu_arr_dot(${args[0]}, ${args[1]})`;
        if (name === 'gpuMatmul' && options.gpu) return `sl_gpu_matmul(${args[0]}, ${args[1]}, ${args[2] || '0'}, ${args[3] || '0'}, ${args[4] || '0'})`;
        if (name === 'gpuMatmulTiled' && options.gpu) return `sl_gpu_matmul_tiled(${args[0]}, ${args[1]}, ${args[2] || '0'}, ${args[3] || '0'}, ${args[4] || '0'})`;
        if (name === 'cudaAvailable' && options.cuda) return `sl_cuda_available()`;
        if (name === 'cudaSum' && options.cuda) return `sl_cuda_arr_sum(${args[0]})`;
        if (name === 'cudaMatmul' && options.cuda) return `sl_cuda_matmul(${args[0]}, ${args[1]}, ${args[2] || '0'}, ${args[3] || '0'}, ${args[4] || '0'})`;
        if (name === 'print') {
          if (args.length === 1) {
            const argExpr = (expr.arguments || expr.args || [])[0];
            const at = exprType(argExpr);
            if (at === 'char*') return `printf("%s\\n", ${args[0]})`;
            if (at === 'double') return `printf("%.10g\\n", (double)(${args[0]}))`;
            if (at === 'bool') return `printf("%s\\n", (${args[0]}) ? "true" : "false")`;
            if (at === 'SlArray*') return `printf("%s\\n", sl_json_stringify_arr(${args[0]}))`;
            if (at === 'SlMap*') return `printf("%s\\n", sl_json_stringify(${args[0]}))`;
            return `printf("%lld\\n", (long long)(${args[0]}))`;
          }
          const argExprs = expr.arguments || expr.args || [];
          const parts: string[] = [];
          for (let i = 0; i < argExprs.length; i++) {
            const at = exprType(argExprs[i]);
            if (at === 'char*') parts.push(`printf("%s", ${args[i]})`);
            else if (at === 'double') parts.push(`printf("%.10g", (double)(${args[i]}))`);
            else if (at === 'bool') parts.push(`printf("%s", (${args[i]}) ? "true" : "false")`);
            else if (at === 'SlArray*') parts.push(`printf("%s", sl_json_stringify_arr(${args[i]}))`);
            else if (at === 'SlMap*') parts.push(`printf("%s", sl_json_stringify(${args[i]}))`);
            else parts.push(`printf("%lld", (long long)(${args[i]}))`);
            if (i < argExprs.length - 1) parts.push(`printf(" ")`);
          }
          parts.push(`printf("\\n")`);
          return `(${parts.join(', ')})`;
        }
        if (name === 'len') {
          const argExpr = (expr.arguments || expr.args || [])[0];
          const at = argExpr ? exprType(argExpr) : 'long long';
          if (at === 'char*') return `(long long)strlen(${args[0]})`;
          return `sl_arr_len(${args[0]})`;
        }
        if (name === 'push') {
          const pushArgExpr = (expr.arguments || expr.args || [])[1];
          const pushArgType = pushArgExpr ? exprType(pushArgExpr) : 'long long';
          if (pushArgType === 'double') return `(sl_arr_push_dbl(${args[0]}, ${args[1]}), 0)`;
          if (pushArgType === 'long long') return `(sl_arr_push_int(${args[0]}, ${args[1]}), 0)`;
          return `(sl_arr_push(${args[0]}, ${boxFnForType(pushArgType)}(${args[1]})), 0)`;
        }
        if (name === 'reserve' && args.length >= 2) {
          return `(sl_arr_reserve(${args[0]}, (int)((long long)(${args[1]}))), 0)`;
        }
        if (name === 'withCapacity' && args.length >= 1) {
          return `sl_arr_new_i32((int)(((long long)(${args[0]})) > 4LL ? ((long long)(${args[0]})) : 4LL))`;
        }
        if (name === 'map') {
          if (args.length === 0) return `sl_map_new(8)`;
          if (args.length === 1) {
            const firstArg = (expr.arguments || expr.args || [])[0];
            const firstType = firstArg ? exprType(firstArg) : '';
            if (firstType !== 'SlArray*' && firstType !== 'long long' && firstType !== 'double') return `sl_map_new(8)`;
            if (firstType === 'SlArray*') return `sl_map_from_entries(${args[0]})`;
            return `sl_arr_map(${args[0]}, ${args[1]})`;
          }
          const fnArg = (expr.arguments || expr.args || [])[1];
          if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
            return `sl_arr_map_closure(${args[0]}, ${compileClosure(fnArg)})`;
          }
          if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
            const fnName = cFuncName(fnArg.name);
            const wn = ensureClosureWrapper(fnName, 1);
            return `sl_arr_map_closure(${args[0]}, (SlClosure){ .fn = ${wn}, .ctx = NULL })`;
          }
          return `sl_arr_map(${args[0]}, ${args[1]})`;
        }
        if (name === 'set') {
          if (args.length === 0) return `sl_set_new()`;
          return `sl_set_from_array(${args[0]})`;
        }
        if (name === 'filter') {
          const fnArg = (expr.arguments || expr.args || [])[1];
          if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
            return `sl_arr_filter_closure(${args[0]}, ${compileClosure(fnArg)})`;
          }
          if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
            const fnName = cFuncName(fnArg.name);
            const wn = ensureClosureWrapper(fnName, 1);
            return `sl_arr_filter_closure(${args[0]}, (SlClosure){ .fn = ${wn}, .ctx = NULL })`;
          }
          return `sl_arr_filter(${args[0]}, ${args[1]})`;
        }
        if (name === 'reduce') {
          const fnArg = (expr.arguments || expr.args || [])[2];
          if (fnArg && (fnArg.type === 'FunctionDef' || fnArg.type === 'Function' || fnArg.type === 'ArrowFunction' || fnArg.type === 'Arrow')) {
            return `sl_arr_reduce_closure(${args[0]}, ${args[1]}, ${compileClosure(fnArg, true)})`;
          }
          if (fnArg && fnArg.type === 'Identifier' && userFuncNames.has(fnArg.name)) {
            const fnName = cFuncName(fnArg.name);
            const wn = ensureClosureWrapper(fnName, 2);
            return `sl_arr_reduce_closure(${args[0]}, ${args[1]}, (SlClosure2){ .fn2 = ${wn}, .ctx = NULL })`;
          }
          return `sl_arr_reduce(${args[0]}, ${args[2]}, ${args[1]})`;
        }
        if (name === 'abs') {
          const absArgExpr = (expr.arguments || expr.args || [])[0];
          const absArgType = absArgExpr ? exprType(absArgExpr) : 'long long';
          if (absArgType === 'double') return `fabs(${args.join(', ')})`;
          return `llabs(${args.join(', ')})`;
        }
        if (name === 'sqrt') return `sqrt(${args.join(', ')})`;
        if (name === 'floor') return `(long long)floor(${args.join(', ')})`;
        if (name === 'ceil') return `(long long)ceil(${args.join(', ')})`;
        if (name === 'round') return `(long long)round(${args.join(', ')})`;
        if (name === 'pow') return `(long long)pow(${args.join(', ')})`;
        if (name === 'min') {
          const minArgExpr = (expr.arguments || expr.args || [])[0];
          if (minArgExpr && exprType(minArgExpr) === 'double') return `fmin(${args.join(', ')})`;
          return `sl_min(${args.join(', ')})`;
        }
        if (name === 'max') {
          const maxArgExpr = (expr.arguments || expr.args || [])[0];
          if (maxArgExpr && exprType(maxArgExpr) === 'double') return `fmax(${args.join(', ')})`;
          return `sl_max(${args.join(', ')})`;
        }
        if (name === 'sin') return `sin(${args.join(', ')})`;
        if (name === 'cos') return `cos(${args.join(', ')})`;
        if (name === 'tan') return `tan(${args.join(', ')})`;
        if (name === 'log') return `log(${args.join(', ')})`;
        if (name === 'exp') return `exp(${args.join(', ')})`;
        if (name === 'atan') return `atan(${args.join(', ')})`;
        if (name === 'atan2') return `atan2(${args.join(', ')})`;
        if (name === 'asin') return `asin(${args.join(', ')})`;
        if (name === 'acos') return `acos(${args.join(', ')})`;
        if (name === 'log2') return `log2(${args.join(', ')})`;
        if (name === 'log10') return `log10(${args.join(', ')})`;
        if (name === 'random') {
          if (args.length >= 2) {
            const lo = args[0];
            const hi = args[1];
            return `((${lo}) + (long long)(rand() % (int)sl_max(1LL, (${hi}) - (${lo}) + 1LL)))`;
          }
          if (args.length === 1) return `(long long)(rand() % (${args[0]}))`;
          return `((double)rand() / RAND_MAX)`;
        }
        if (name === 'PI') return `3.14159265358979323846`;
        if (name === 'E') return `2.71828182845904523536`;
        if (name === 'clamp') return `sl_clamp(${args[0]}, ${args[1]}, ${args[2]})`;
        if (name === 'sum') return (options.cuda ? `sl_cuda_arr_sum(${args[0]})` : options.gpu ? `sl_gpu_arr_sum(${args[0]})` : `sl_arr_sum(${args[0]})`);
        if (name === 'avg') return `sl_arr_avg(${args[0]})`;
        if (name === 'reverse') return `sl_arr_reverse(${args[0]})`;
        if (name === 'sort') return `sl_arr_sort(${args[0]})`;
        if (name === 'indexOf') return `sl_arr_indexOf(${args[0]}, ${args[1]})`;
        if (name === 'includes') return `sl_arr_includes(${args[0]}, ${args[1]})`;
        if (name === 'join') return `sl_arr_join(${args[0]}, ${args.length > 1 ? args[1] : '" "'})`;
        if (name === 'range') {
          if (options.gpu) {
            if (args.length === 1) return `sl_gpu_arr_range(0, ${args[0]}, 1)`;
            if (args.length === 2) return `sl_gpu_arr_range(${args[0]}, ${args[1]}, 1)`;
            return `sl_gpu_arr_range(${args.join(', ')})`;
          }
          if (args.length === 1) return `sl_arr_range(0, ${args[0]}, 1)`;
          if (args.length === 2) return `sl_arr_range(${args[0]}, ${args[1]}, 1)`;
          return `sl_arr_range(${args.join(', ')})`;
        }
        if (name === 'rangeRev') {
          if (args.length === 1) return `sl_arr_range((${args[0]}) - 1, -1, -1)`;
          if (args.length === 2) return `sl_arr_range((${args[0]}) - 1, (${args[1]}) - 1, -1)`;
          return `sl_arr_range(${args.join(', ')})`;
        }
        if (name === 'pop') return `sl_arr_pop(${args[0]})`;
        if (name === 'shift') return `sl_arr_shift(${args[0]})`;
        if (name === 'slice') return `sl_arr_slice(${args[0]}, ${args[1]}, ${args.length > 2 ? args[2] : '0'})`;
        if (name === 'concat') return `sl_arr_concat(${args[0]}, ${args[1]})`;
        if (name === 'unique') return `sl_arr_unique(${args[0]})`;
        if (name === 'find') return `sl_arr_find(${args[0]}, ${args[1]})`;
        if (name === 'findIndex') return `sl_arr_findIndex(${args[0]}, ${args[1]})`;
        if (name === 'every') return `sl_arr_every(${args[0]}, ${args[1]})`;
        if (name === 'some') return `sl_arr_some(${args[0]}, ${args[1]})`;
        if (name === 'forEach') return `(sl_arr_forEach(${args[0]}, ${args[1]}), 0)`;
        if (name === 'flat') return `sl_arr_flat(${args[0]})`;
        if (name === 'fill') {
          const fillArgExpr = (expr.arguments || expr.args || [])[1];
          const fillArgType = fillArgExpr ? exprType(fillArgExpr) : 'long long';
          return `sl_arr_fill(${args[0]}, ${boxFnForType(fillArgType)}(${args[1]}), ${args.length > 2 ? args[2] : '0'}, ${args.length > 3 ? args[3] : '0'})`;
        }
        if (name === 'upper') return `sl_str_upper(${args[0]})`;
        if (name === 'lower') return `sl_str_lower(${args[0]})`;
        if (name === 'trim') return `sl_str_trim(${args[0]})`;
        if (name === 'replace') return `sl_str_replace(${args[0]}, ${args[1]}, ${args[2]})`;
        if (name === 'substring') return `sl_str_substring(${args[0]}, ${args[1]}, ${args.length > 2 ? args[2] : '-1'})`;
        if (name === 'split') return `sl_str_split(${args[0]}, ${args[1]})`;
        if (name === 'charAt') return `sl_str_charAt(${args[0]}, ${args[1]})`;
        if (name === 'startsWith') return `sl_str_startsWith(${args[0]}, ${args[1]})`;
        if (name === 'endsWith') return `sl_str_endsWith(${args[0]}, ${args[1]})`;
        if (name === 'repeat') return `sl_str_repeat(${args[0]}, ${args[1]})`;
        if (name === 'strIndexOf') return `sl_str_indexOf(${args[0]}, ${args[1]})`;
        if (name === 'strIncludes') return `sl_str_includes(${args[0]}, ${args[1]})`;
        if (name === 'strLen') return `(long long)strlen(${args[0]})`;
        if (name === 'strLastIndexOf') return `sl_str_lastIndexOf(${args[0]}, ${args[1]})`;
        if (name === 'padStart') return `sl_str_padStart(${args[0]}, ${args[1]}, ${args.length > 2 ? args[2] : '" "'})`;
        if (name === 'padEnd') return `sl_str_padEnd(${args[0]}, ${args[1]}, ${args.length > 2 ? args[2] : '" "'})`;
        if (name === 'toBool' || name === 'bool') return `sl_toBool(${args[0]})`;
        if (name === 'lastIndexOf') return `sl_arr_lastIndexOf(${args[0]}, ${args[1]})`;
        if (name === 'unshift') {
          const unshiftArgExpr = (expr.arguments || expr.args || [])[1];
          const unshiftArgType = unshiftArgExpr ? exprType(unshiftArgExpr) : 'long long';
          return `(sl_arr_unshift(${args[0]}, ${boxFnForType(unshiftArgType)}(${args[1]})), 0)`;
        }
        if (name === 'entries') return `sl_map_entries(${args[0]})`;
        if (name === 'sleep') return `(sl_sleep(${args[0]}), 0)`;
        if (name === 'readFile') return `sl_readFile(${args[0]})`;
        if (name === 'writeFile') return `sl_writeFile(${args[0]}, ${args[1]})`;
        if (name === 'fileExists' || name === 'exists') return `sl_fileExists(${args[0]})`;
        if (name === 'mkdir') return `sl_mkdir(${args[0]})`;
        if (name === 'remove' || name === 'rm') return `sl_remove(${args[0]})`;
        if (name === 'listDir') return `sl_listDir(${args[0]})`;
        if (name === 'dateFormat' || name === 'date') return `sl_dateFormat(${args[0]}, ${args[1]})`;
        if (name === 'trimStart') return `sl_str_trimStart(${args[0]})`;
        if (name === 'trimEnd') return `sl_str_trimEnd(${args[0]})`;
        if (name === 'jsonParse') return `sl_json_parse(${args[0]})`;
        if (name === 'jsonStringify') {
          if (args.length > 0 && exprType(expr.arguments?.[0] || expr.args?.[0]) === 'SlArray*') return `sl_json_stringify_arr(${args[0]})`;
          return `sl_json_stringify(${args[0]})`;
        }
        if (name === 'toString') {
          const argExpr = (expr.arguments || expr.args || [])[0];
          const at = argExpr ? exprType(argExpr) : 'long long';
          if (at === 'char*') return `sl_toString_str(${args[0]})`;
          if (at === 'double') return `sl_toString_d(${args[0]})`;
          return `sl_toString(${args[0]})`;
        }
        if (name === 'str') {
          const argExpr = (expr.arguments || expr.args || [])[0];
          const at = argExpr ? exprType(argExpr) : 'long long';
          if (at === 'char*') return `sl_toString_str(${args[0]})`;
          if (at === 'double') return `sl_toString_d(${args[0]})`;
          return `sl_toString(${args[0]})`;
        }
        if (name === 'num') return `sl_toNumber(${args[0]})`;
        if (name === 'int') return `(long long)(${args[0]})`;
        if (name === 'float' || name === 'toFloat') return `(double)(${args[0]})`;
        if (name === 'parseInt') return `atoll(${args[0]})`;
        if (name === 'parseFloat') return `atof(${args[0]})`;
        if (name === 'type' || name === 'typeof') {
          const argExpr = (expr.arguments || expr.args || [])[0];
          const argType = argExpr ? exprType(argExpr) : 'long long';
          const raw = getContainerRawExpr(argExpr);
          if (raw) return `sl_type(${raw})`;
          return `sl_type(${boxFnForType(argType)}(${args[0]}))`;
        }
        if (name === 'keys') return `sl_map_keys(${args[0]})`;
        if (name === 'values') return `sl_map_values(${args[0]})`;
        if (name === 'has') {
          const argExpr = (expr.arguments || expr.args || [])[0];
          const argName = argExpr?.name || '';
          if (objectFields.has(argName)) {
            const propName = args[1].replace(/"/g, '');
            const fields = objectFields.get(argName)!;
            return fields.has(propName) ? '1' : '0';
          }
          return `sl_map_has(${args[0]}, ${args[1]})`;
        }
        if (name === 'time') return `sl_time()`;
        if (name === 'mapSet') return `(sl_map_set(${args[0]}, ${args[1]}, ${boxFnForType(exprType((expr.arguments || expr.args || [])[2]))}(${args[2]})), ${args[0]})`;
        if (name === 'mapGet') return `sl_to_int(sl_map_get(${args[0]}, ${args[1]}, sl_int(0)))`;
        if (name === 'mapHas') return `sl_map_has(${args[0]}, ${args[1]})`;
        if (name === 'mapDelete') return `sl_map_delete(${args[0]}, ${args[1]})`;
        if (name === 'mapKeys') return `sl_map_keys(${args[0]})`;
        if (name === 'mapValues') return `sl_map_values(${args[0]})`;
        if (name === 'mapEntries') return `sl_map_entries(${args[0]})`;
        if (name === 'mapSize') return `sl_map_size(${args[0]})`;
        if (name === 'mapClear') return `(sl_map_clear(${args[0]}), ${args[0]})`;
        if (name === 'mapForEach') return `(sl_map_forEach(${args[0]}, ${args[1]}), 0)`;
        if (name === 'setAdd') return `(sl_set_add(${args[0]}, ${boxFnForType(exprType((expr.arguments || expr.args || [])[1]))}(${args[1]})), ${args[0]})`;
        if (name === 'setHas') return `sl_set_has(${args[0]}, ${boxFnForType(exprType((expr.arguments || expr.args || [])[1]))}(${args[1]}))`;
        if (name === 'setDelete') return `sl_set_delete(${args[0]}, ${boxFnForType(exprType((expr.arguments || expr.args || [])[1]))}(${args[1]}))`;
        if (name === 'setSize') return `sl_set_size(${args[0]})`;
        if (name === 'setToArray') return `sl_set_toArray(${args[0]})`;
        if (name === 'setClear') return `(sl_set_clear(${args[0]}), ${args[0]})`;
        if (name === 'setForEach') return `(sl_set_forEach(${args[0]}, ${args[1]}), 0)`;
        if (name === 'isString' || name === 'isNumber' || name === 'isMap' || name === 'isArray') {
          const argExpr = (expr.arguments || expr.args || [])[0];
          const argType = argExpr ? exprType(argExpr) : 'long long';
          const raw = getContainerRawExpr(argExpr);
          if (raw) return `sl_${name}(${raw})`;
          return `sl_${name}(${boxFnForType(argType)}(${args[0]}))`;
        }
        if (name === 'format') return `sl_format(${args[0]}, ${args[1]})`;
        if (name === 'getEnv') return `sl_getEnv(${args[0]})`;
        if (name === 'setEnv') return `sl_setEnv(${args[0]}, ${args[1]})`;
        if (name === 'args') return `sl_args(argc, argv)`;
        if (name === 'replaceAll') return `sl_str_replaceAll(${args[0]}, ${args[1]}, ${args[2]})`;
        if (name === 'toLower') return `sl_str_lower(${args[0]})`;
        if (name === 'toUpper') return `sl_str_upper(${args[0]})`;
        if (name === 'strEq') return `sl_str_eq(${args[0]}, ${args[1]})`;
        if (name === 'strNe') return `sl_str_ne(${args[0]}, ${args[1]})`;
        if (name === 'strLt') return `sl_str_lt(${args[0]}, ${args[1]})`;
        if (name === 'strGt') return `sl_str_gt(${args[0]}, ${args[1]})`;
        if (name === 'strLe') return `sl_str_le(${args[0]}, ${args[1]})`;
        if (name === 'strGe') return `sl_str_ge(${args[0]}, ${args[1]})`;
        if (closureTypeVars.has(name)) {
          const paramCount = closureParamCounts.get(name) || 1;
          const crt = closureReturnTypes.get(name) || 'long long';
          const castArgs = args.map((a: string, i: number) => {
            const argExpr = (expr.arguments || expr.args || [])[i];
            const at = argExpr ? exprType(argExpr) : 'long long';
            return at === 'char*' || at === 'SlArray*' || at === 'SlMap*' ? `(long long)(${a})` : a;
          });
          let call: string;
          if (paramCount >= 2) call = `sl_closure_call2(*(SlClosure2*)&sl_${name}, ${castArgs.join(', ')})`;
          else if (castArgs.length === 0) call = `sl_closure_call0(sl_${name})`;
          else call = `sl_closure_call1(sl_${name}, ${castArgs[0]})`;
          if (crt === 'char*') return `(char*)(${call})`;
          if (crt === 'SlArray*') return `(SlArray*)(${call})`;
          if (crt === 'SlMap*') return `(SlMap*)(${call})`;
          return call;
        }
        const calleeType = exprType(calleeObj);
        if (calleeType === 'SlClosure') {
          if (args.length === 0) return `sl_closure_call0(sl_${name})`;
          if (args.length >= 2) return `sl_closure_call2(*(SlClosure2*)&sl_${name}, ${args.join(', ')})`;
          return `sl_closure_call1(sl_${name}, ${args[0]})`;
        }
        if (calleeType === 'SlClosure2') {
          return `sl_closure_call2(*(SlClosure2*)&sl_${name}, ${args.join(', ')})`;
        }
        if (currentFuncName) {
          const ptypes = funcParamTypes.get(currentFuncName);
          if (ptypes) {
            const pidx = currentFuncParams.indexOf(name);
            if (pidx >= 0 && ptypes[pidx] === 'SlClosure') {
              if (args.length >= 2) return `sl_closure_call2(*(SlClosure2*)&sl_${name}, ${args.join(', ')})`;
              if (args.length === 0) return `sl_closure_call0(sl_${name})`;
              return `sl_closure_call1(sl_${name}, ${args[0]})`;
            }
          }
        }
        const calleeFuncName = cFuncName(name);
        const calleePTypes = funcParamTypes.get(calleeFuncName);
        if (calleePTypes) {
          const wrappedArgs = args.map((a: string, i: number) => {
            const ptype = calleePTypes[i];
            if (ptype === 'SlClosure' || ptype === 'SlClosure2') {
              const rawArgs = expr.arguments || expr.args || [];
              const rawArg = rawArgs[i];
              if (rawArg && rawArg.type === 'Identifier' && userFuncNames.has(rawArg.name)) {
                const fnName = cFuncName(rawArg.name);
                const wn = ensureClosureWrapper(fnName, ptype === 'SlClosure2' ? 2 : 1);
                if (ptype === 'SlClosure2') {
                  return `(SlClosure2){ .fn2 = ${wn}, .ctx = NULL }`;
                }
                return `(SlClosure){ .fn = ${wn}, .ctx = NULL }`;
              }
            }
            return a;
          });
          return `sl_${calleeFuncName}(${wrappedArgs.join(', ')})`;
        }
        return `sl_${calleeFuncName}(${args.join(', ')})`;
      }
      case 'ArrowFunction':
      case 'Arrow':
      case 'Function':
        return compileClosure(expr);
      case 'NewExpression': {
        const className = expr.className || expr.callee?.name || '';
        const newArgs = (expr.args || expr.arguments || []).map((a: any) => cExpr(a));
        if (classDefs.has(className)) {
          return `sl_${className}_new(${newArgs.join(', ')})`;
        }
        clcWarnings.push(`NewExpression: unknown class '${className}'`);
        return `0`;
      }
      case 'SuperCallExpression': {
        const method = expr.method || 'init';
        if (!method) return '0';
        const args = (expr.args || []).map((a: any) => cExpr(a));
        const cls = currentClassName ? classDefs.get(currentClassName) : null;
        if (cls?.superClass) {
          const parentCls = classDefs.get(cls.superClass);
          if (parentCls) {
            if (method === 'init') {
              const parentCallParams = [`&self->_super`, ...args];
              return `sl_${cls.superClass}_new_into(${parentCallParams.join(', ')})`;
            }
            const parentCallParams = [`&self->_super`, ...args];
            return `sl_${cls.superClass}_${method}(${parentCallParams.join(', ')})`;
          }
        }
        return `0`;
      }
      case 'Match': {
        const matchVar = `_match_${++_tempIdCounter}`;
        const matchExpr = cExpr(expr.expression);
        const matchType = exprType(expr.expression);
        const lines: string[] = [];
        const varDecl = matchType === 'char*' ? 'const char*' : matchType === 'SlArray*' ? 'SlArray*' : matchType === 'SlMap*' ? 'SlMap*' : matchType === 'double' ? 'double' : 'long long';
        lines.push(`({ ${varDecl} ${matchVar} = ${matchExpr};`);
        const resultVar = `_mr_${_tempIdCounter}`;
        const firstCase = (expr.cases || [])[0];
        const firstBody = firstCase?.body || [];
        let firstResultExpr = firstBody.length > 0 ? firstBody[firstBody.length - 1] : null;
        if (firstResultExpr?.type === 'Action') firstResultExpr = firstResultExpr.target || firstResultExpr.action;
        const resultType = firstResultExpr ? exprType(firstResultExpr) : 'long long';
        const resultDecl = resultType === 'char*' ? 'char*' : resultType === 'SlArray*' ? 'SlArray*' : resultType === 'SlMap*' ? 'SlMap*' : resultType === 'double' ? 'double' : 'long long';
        lines.push(`${resultDecl} ${resultVar} = 0;`);
        for (const c of (expr.cases || [])) {
          const cond = compileMatchPattern(c.pattern, matchVar, matchType);
          const bindingCode = generateMatchBindingCode(c.pattern, matchVar, matchType);
          const guardCode = c.guard ? cExpr(c.guard) : '';
          const body = (c.body || []);
          const isExprBody = body.length === 1 && body[0].type !== 'Return' && body[0].type !== 'ReturnStatement' && body[0].type !== 'Action' && body[0].type !== 'Assignment' && body[0].type !== 'Assign' && body[0].type !== 'If' && body[0].type !== 'IfStatement' && body[0].type !== 'VarDecl' && body[0].type !== 'LetDecl' && body[0].type !== 'ForIn' && body[0].type !== 'While' && body[0].type !== 'WhileStatement' && body[0].type !== 'Print' && body[0].type !== 'ClassDef';
          const bodyCode = isExprBody ? '' : body.map((s: any) => cStmt(s, 1)).join('\n');
          const hasReturn = body.some((s: any) => s.type === 'Return' || s.type === 'ReturnStatement');
          if (hasReturn) {
            if (guardCode) {
              lines.push(`    if (${cond}) { ${bindingCode} if (${guardCode}) {`);
              lines.push(bodyCode);
              lines.push(`    } } else`);
            } else {
              lines.push(`    if (${cond}) { ${bindingCode}`);
              lines.push(bodyCode);
              lines.push(`    } else`);
            }
          } else {
            const lastItem = body.length > 0 ? body[body.length - 1] : null;
            const lastAction = lastItem?.type === 'Action' ? lastItem : null;
            let resultExpr: string;
            if (lastAction) {
              resultExpr = cExpr(lastAction.target || lastAction.action);
            } else if (lastItem && lastItem.type !== 'Return' && lastItem.type !== 'ReturnStatement') {
              resultExpr = cExpr(lastItem);
            } else {
              resultExpr = '0';
            }
            if (resultDecl === 'char*' && resultExpr.startsWith('"')) {
              resultExpr = `strdup(${resultExpr})`;
            }
            if (guardCode) {
              lines.push(`    if (${cond}) { ${bindingCode} if (${guardCode}) { ${resultVar} = ${resultExpr}; } } else`);
            } else {
              lines.push(`    if (${cond}) { ${bindingCode} ${resultVar} = ${resultExpr}; } else`);
            }
          }
        }
        lines.push(`    { ${resultVar} = 0; }`);
        lines.push(`    ${resultVar}; })`);
        return lines.join('\n');
      }
      case 'Assignment': {
        const aTarget = expr.target || expr.left;
        if (aTarget?.type === 'ArrayLiteral') {
          const elements = aTarget.elements || [];
          const tmpVar = `_destr_e${destrCounter++}`;
          const valExpr = cExpr(expr.value || expr.right);
          const lines: string[] = [];
          lines.push(`({SlArray* ${tmpVar} = (SlArray*)(${valExpr});`);
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (el.type === 'Identifier') {
              lines.push(`sl_${el.name} = sl_arr_get(${tmpVar}, ${i});`);
            }
          }
          lines.push(`0;})`);
          return lines.join(' ');
        }
        return `${cExpr(aTarget)} = ${cExpr(expr.value || expr.right)}`;
      }
      case 'Action':
        return cExpr(expr.target);
      case 'MacroCall': {
        const mName = expr.name || '';
        const mArgs = (expr.args || []).map((a: any) => cExpr(a));
        if (macroDefs.has(mName)) {
          const mDef = macroDefs.get(mName)!;
          if (mDef.hasReturn) {
            return `sl_macro_${mName}(${mArgs.join(', ')})`;
          }
          return `(sl_macro_${mName}(${mArgs.join(', ')}), 0)`;
        }
        clcWarnings.push(`MacroCall: unknown macro '${mName}'`);
        return `0`;
      }
      default: {
        const line = expr.line || '?';
        const hint = CLC_EXPR_UNSUPPORTED_HINTS[expr.type] || 'this feature is not yet implemented in the C backend';
        clcWarnings.push(`cExpr: unsupported expression type '${expr.type}' at line ${line}: ${hint}`);
        return '0';
      }
    }
  }

  function translateThisInExpr(expr: any, selfVar: string, className?: string): string {
    if (!expr) return '0';
    if (expr.type === 'Member' && expr.object?.type === 'Identifier' && expr.object.name === 'this') {
      const propName = typeof expr.property === 'string' ? expr.property : (expr.property?.name || '');
      if (className && parentHasProperty(classDefs.get(className)?.superClass, propName)) {
        return `${selfVar}->_super.${propName}`;
      }
      return `${selfVar}->${propName}`;
    }
    if (expr.type === 'BinaryExpr' || expr.type === 'Binary' || expr.type === 'BinaryOp') {
      const left = translateThisInExpr(expr.left, selfVar, className);
      const right = translateThisInExpr(expr.right, selfVar, className);
      const op = expr.operator === '==' ? '==' : expr.operator === '!=' ? '!=' : expr.operator;
      if (op === '+' && exprType(expr.left) === 'char*') {
        const rt = exprType(expr.right);
        if (rt === 'char*') return `sl_strcat(${left}, ${right})`;
        if (rt === 'double') return `sl_strcat_fr(${left}, sl_dtoa(${right}))`;
        return `sl_strcat_fr(${left}, sl_itoa(${right}))`;
      }
      return `${left} ${op} ${right}`;
    }
    return cExpr(expr);
  }

  function genCleanup(
    varTypes: Map<string, string>,
    exclude: Set<string> = new Set(),
    /** When true (nested function/method return), do not release names that are program-level globals. */
    fromNestedScope: boolean = false
  ): string {
    const lines: string[] = [];
    for (const [vname, vtype] of varTypes) {
      if (exclude.has(vname)) continue;
      if (
        fromNestedScope &&
        topLocals.has(vname) &&
        ((vtype === 'SlArray*' && arrayVars.has(vname)) ||
          (vtype === 'SlMap*' && objectVars.has(vname)) ||
          (vtype === 'char*' && stringVars.has(vname)))
      ) {
        continue;
      }
      if (vtype === 'SlArray*') lines.push(`    sl_release_arr(sl_${vname});`);
      else if (vtype === 'SlMap*') lines.push(`    sl_release_map(sl_${vname});`);
      else if (vtype === 'char*') lines.push(`    sl_release_str(sl_${vname});`);
    }
    return lines.join('\n');
  }

  function genReleaseBeforeAssign(name: string): string {
    if (
      currentFuncName &&
      topLocals.has(name) &&
      ((arrayVars.has(name) && varType(name) === 'SlArray*') ||
        (objectVars.has(name) && varType(name) === 'SlMap*') ||
        (stringVars.has(name) && varType(name) === 'char*'))
    ) {
      return '';
    }
    const vt = varType(name);
    if (vt === 'SlArray*') return `sl_release_arr(sl_${name}); `;
    if (vt === 'SlMap*') return `sl_release_map(sl_${name}); `;
    if (vt === 'char*') return `sl_release_str(sl_${name}); `;
    return '';
  }

  /** Inner `#pragma omp parallel*` is illegal inside an OpenMP simd loop body; suppress while emitting those bodies. */
  let ompParallelSuppress = 0;
  const allowLoopOmpParallel = () => options.parallel && ompParallelSuppress === 0;

  function cStmt(stmt: any, indent: number = 1): string {
    const pad = '    '.repeat(indent);
    switch (stmt.type) {
      case 'ClassDef': {
        const className = stmt.name;
        const cls = classDefs.get(className);
        if (!cls) return '';
        const structName = `Sl${className}`;
        const superClassName = cls.superClass;
        const parentStructName = superClassName ? `Sl${superClassName}` : null;

        const ownPropEntries = Array.from(cls.properties.entries());
        const allPropEntries: [string, string][] = [];
        if (superClassName && classDefs.has(superClassName)) {
          const visited = new Set<string>();
          let ancestor: string | undefined = superClassName;
          while (ancestor && classDefs.has(ancestor)) {
            const anc: { properties: Map<string, string>; methods: Map<string, { params: string[]; returnType: string }>; superClass?: string } = classDefs.get(ancestor)!;
            for (const [k, v] of anc.properties) {
              if (!visited.has(k)) { visited.add(k); allPropEntries.push([k, v]); }
            }
            ancestor = anc.superClass;
          }
        }
        for (const [k, v] of ownPropEntries) allPropEntries.push([k, v]);
        const stringProps = allPropEntries.filter(([, t]) => t === 'char*').map(([n]) => n);
        let childOnlyProps: [string, string][];
        if (superClassName && classDefs.has(superClassName)) {
          const parentProps = classDefs.get(superClassName)!.properties;
          childOnlyProps = ownPropEntries.filter(([k]) => !parentProps.has(k));
        } else {
          childOnlyProps = ownPropEntries;
        }
        const ownStringProps = childOnlyProps.filter(([, t]) => t === 'char*').map(([n]) => n);
        const inheritedStringProps = stringProps.filter(n => !ownStringProps.includes(n));
        const stringPropInit = [
          ...ownStringProps.map(n => `    self->${n} = "";`),
          ...inheritedStringProps.map(n => `    self->_super.${n} = "";`)
        ].join('\n');
        let structFields: string;
        if (parentStructName && superClassName && classDefs.has(superClassName)) {
          const parentProps = classDefs.get(superClassName)!.properties;
          const childOnlyProps = ownPropEntries.filter(([k]) => !parentProps.has(k));
          structFields = `    ${parentStructName} _super;\n` + childOnlyProps.map(([pname, ptype]) => `    ${ptype} ${pname};`).join('\n');
        } else {
          structFields = ownPropEntries.map(([pname, ptype]) => `    ${ptype} ${pname};`).join('\n');
        }
        classStructDefs.push(`typedef struct {\n${structFields}\n} ${structName};`);

        const initMethod = stmt.methods?.find((m: any) => m.name === 'init' || m.name === '__init__' || m.name === 'constructor');
        if (initMethod) {
          const initParamTypes = funcParamTypes.get(`${className}_init`);
          const initLocalTypes = funcLocalVarTypes.get(`${className}_init`);
          const initParams = (initMethod.params || []).map((p: any, pi: number) => {
            const pname = typeof p === 'string' ? p : p.name;
            let ptype = cls.properties.get(pname) || 'long long';
            if (initParamTypes && pi < initParamTypes.length) {
              ptype = initParamTypes[pi];
            } else if (initLocalTypes && initLocalTypes.has(pname)) {
              ptype = initLocalTypes.get(pname)!;
            }
            return `${ptype} sl_${pname}`;
          });
          const initBody = (initMethod.body || []).map((s: any) => {
            const unwrapped = s.type === 'Action' ? s.target : s;
            if (unwrapped && (unwrapped.type === 'Assignment' || unwrapped.type === 'Assign') && unwrapped.target?.type === 'Member') {
              const t = unwrapped.target;
              if (t.object?.type === 'Identifier' && t.object.name === 'this') {
                const propName = typeof t.property === 'string' ? t.property : (t.property?.name || '');
                const val = cExpr(unwrapped.value || unwrapped.right);
                if (parentStructName && parentHasProperty(superClassName, propName)) {
                  return `    self->_super.${propName} = ${val};`;
                }
                return `    self->${propName} = ${val};`;
              }
            }
            if (unwrapped && unwrapped.type === 'SuperCallExpression') {
              return generateSuperInitCall(unwrapped, className);
            }
            return '';
          }).filter((s: string) => s).join('\n');
          funcDefs.push(`${structName}* sl_${className}_new(${initParams.join(', ')}) {\n    ${structName}* self = (${structName}*)malloc(sizeof(${structName}));\n    memset(self, 0, sizeof(${structName}));\n${stringPropInit}\n${initBody}\n    return self;\n}`);
          const newIntoParams = initParams.length > 0 ? `${structName}* self, ${initParams.join(', ')}` : `${structName}* self`;
          funcDefs.push(`void sl_${className}_new_into(${newIntoParams}) {\n    memset(self, 0, sizeof(${structName}));\n${stringPropInit}\n${initBody}\n}`);
        } else {
          funcDefs.push(`${structName}* sl_${className}_new() {\n    ${structName}* self = (${structName}*)malloc(sizeof(${structName}));\n    memset(self, 0, sizeof(${structName}));\n${stringPropInit}\n    return self;\n}`);
          funcDefs.push(`void sl_${className}_new_into(${structName}* self) {\n    memset(self, 0, sizeof(${structName}));\n${stringPropInit}\n}`);
        }

        if (parentStructName && superClassName && classDefs.has(superClassName)) {
          const parentCls = classDefs.get(superClassName)!;
          const childMethodNames = new Set((stmt.methods || []).map((m: any) => m.name));
          for (const [mName, mInfo] of parentCls.methods) {
            if (mName === 'init' || mName === '__init__' || mName === 'constructor') continue;
            if (childMethodNames.has(mName)) continue;
            const mParams = [`${structName}* self`, ...mInfo.params.map((p: string) => {
              const ptype = parentCls.properties.get(p) || 'long long';
              return `${ptype} sl_${p}`;
            })];
            const parentCallParams = [`&self->_super`, ...mInfo.params.map((p: string) => `sl_${p}`)];
            funcDefs.push(`${mInfo.returnType} sl_${className}_${mName}(${mParams.join(', ')}) {\n    return sl_${superClassName}_${mName}(${parentCallParams.join(', ')});\n}`);
          }
        }

        for (const method of (stmt.methods || [])) {
          if (method.name === 'init' || method.name === '__init__' || method.name === 'constructor') continue;
          const mInfo = cls.methods.get(method.name);
          const methodLocalTypes = funcLocalVarTypes.get(`${className}_${method.name}`);
          const methodParamTypes = funcParamTypes.get(`${className}_${method.name}`);
          const mParams = [`${structName}* self`, ...(method.params || []).map((p: any, pi: number) => {
            const pname = typeof p === 'string' ? p : p.name;
            let ptype = cls.properties.get(pname) || 'long long';
            if (methodParamTypes && pi < methodParamTypes.length) {
              ptype = methodParamTypes[pi];
            } else if (methodLocalTypes && methodLocalTypes.has(pname)) {
              ptype = methodLocalTypes.get(pname)!;
            }
            return `${ptype} sl_${pname}`;
          })];
          const savedInstanceVars = new Map(instanceVars);
          const savedClassName = currentClassName;
          const savedFuncName = currentFuncName;
          const savedFuncParams = currentFuncParams;
          currentClassName = className;
          currentFuncName = `${className}_${method.name}`;
          currentFuncParams = (method.params || []).map((p: any) => typeof p === 'string' ? p : p.name);
          const body = method.body || [];
          const retType = mInfo?.returnType || 'long long';
          const methodBody: string[] = [];
          for (const s of body) {
            const unwrapped = s.type === 'Action' ? s.target : s;
            if (!unwrapped) continue;
            if ((unwrapped.type === 'Assignment' || unwrapped.type === 'Assign') && unwrapped.target?.type === 'Member') {
              const t = unwrapped.target;
              if (t.object?.type === 'Identifier' && t.object.name === 'this') {
                const propName = typeof t.property === 'string' ? t.property : (t.property?.name || '');
                const val = cExpr(unwrapped.value || unwrapped.right);
                const isParentProp = parentStructName && parentHasProperty(superClassName, propName);
                const access = isParentProp ? `self->_super.${propName}` : `self->${propName}`;
                const propType = cls.properties.get(propName) || 'long long';
                if (propType === 'char*') {
                  methodBody.push(`    { char* _old = ${access}; ${access} = ${val}; sl_release_str(_old); }`);
                } else {
                  methodBody.push(`    ${access} = ${val};`);
                }
                continue;
              }
            }
            if ((unwrapped.type === 'Return' || unwrapped.type === 'ReturnStatement') && unwrapped.value) {
              const val = cExpr(unwrapped.value);
              const methodLocalCleanup = genCleanup(funcLocalVarTypes.get(`${className}_${method.name}`) || new Map(), new Set(currentFuncParams), true);
              let returnExpr: string;
              if (unwrapped.value?.type === 'Member' && unwrapped.value.object?.type === 'Identifier' && unwrapped.value.object.name === 'this') {
                const propName = typeof unwrapped.value.property === 'string' ? unwrapped.value.property : (unwrapped.value.property?.name || '');
                const isParentProp = parentStructName && parentHasProperty(superClassName, propName);
                returnExpr = isParentProp ? `self->_super.${propName}` : `self->${propName}`;
              } else if (unwrapped.value?.type === 'BinaryExpr' || unwrapped.value?.type === 'Binary' || unwrapped.value?.type === 'BinaryOp') {
                returnExpr = translateThisInExpr(unwrapped.value, 'self', className);
              } else {
                returnExpr = val;
              }
              if (methodLocalCleanup) {
                methodBody.push(`    { ${retType} _r = ${returnExpr};\n${methodLocalCleanup}\n    return _r; }`);
              } else {
                methodBody.push(`    return ${returnExpr};`);
              }
              continue;
            }
            methodBody.push(cStmt(s, 1));
          }
          const hasReturn = body.some((s: any) => s.type === 'Return' || s.type === 'ReturnStatement');
          const methodCleanup = genCleanup(
            funcLocalVarTypes.get(`${className}_${method.name}`) || new Map(),
            new Set((method.params || []).map((p: any) => (typeof p === 'string' ? p : p.name))),
            true
          );
          const footer = hasReturn ? '' : (methodCleanup ? `\n${methodCleanup}\n    return 0;` : '\n    return 0;');
          funcDefs.push(`${retType} sl_${className}_${method.name}(${mParams.join(', ')}) {\n${methodBody.join('\n')}${footer}\n}`);
          instanceVars.clear();
          for (const [k, v] of savedInstanceVars) instanceVars.set(k, v);
          currentClassName = savedClassName;
          currentFuncName = savedFuncName;
          currentFuncParams = savedFuncParams;
        }

        return '';
      }
      case 'FunctionDef': {
        const params = (stmt.params || []);
        const isNested = currentFuncName !== null;
        if (isNested) {
          const closureVal = compileClosure(stmt, (stmt.params || []).length >= 2);
          const pc = (stmt.params || []).length;
          const closureType = pc >= 2 ? 'SlClosure2' : 'SlClosure';
          closureTypeVars.add(stmt.name);
          closureParamCounts.set(stmt.name, pc);
          return `${pad}${closureType} sl_${stmt.name} = ${closureVal};`;
        }
        const retType = funcType(stmt.name);
        const paramDecls = params.map((p: any, i: number) => {
          const pname = typeof p === 'string' ? p : p.name;
          const ptypes = funcParamTypes.get(stmt.name);
          const pt = ptypes ? ptypes[i] : 'long long';
          return `${pt} sl_${pname}`;
        });
        const body = (stmt.body || []);
        const localVarTypesMap = funcLocalVarTypes.get(stmt.name);
        const { initExprs: funcInitExprs } = collectLocalVars(body, params.map((p: any) => typeof p === 'string' ? p : p.name), new Set());
        const nestedFuncNames = new Set<string>();
        for (const s of body) {
          if (s.type === 'FunctionDef' && s.name) nestedFuncNames.add(s.name);
        }
        const localVarDecls: string[] = [];
        const funcVarInited = new Set<string>();
        if (localVarTypesMap) {
          for (const [vname, vtype] of localVarTypesMap) {
            if (topLocals.has(vname)) continue;
            if (nestedFuncNames.has(vname)) continue;
            const init = funcInitExprs.get(vname);
            const isSimple = init && (init.type === 'NumberLiteral' || init.type === 'Number' ||
                             init.type === 'BooleanLiteral' || init.type === 'Boolean' ||
                             init.type === 'NullLiteral' || init.type === 'Null' ||
                             init.type === 'StringLiteral' || init.type === 'TextLiteral');
            if (isSimple) {
              if (vtype === 'char*' && (init.type === 'StringLiteral' || init.type === 'TextLiteral')) {
                localVarDecls.push(`    ${vtype} sl_${vname} = strdup(${cExpr(init)});`);
              } else {
                localVarDecls.push(`    ${vtype} sl_${vname} = ${cExpr(init)};`);
              }
              funcVarInited.add(vname);
            } else if (vtype === 'SlClosure' || vtype === 'SlClosure2') {
              localVarDecls.push(`    ${vtype} sl_${vname};`);
            } else {
              localVarDecls.push(`    ${vtype} sl_${vname} = 0;`);
            }
          }
        }
        const varDeclCode = localVarDecls.length > 0 ? localVarDecls.join('\n') + '\n' : '';
        const savedVarInitedInDecl = new Set(varInitedInDecl);
        const savedFuncInitExprs = currentFuncInitExprs;
        const savedFuncName = currentFuncName;
        const savedFuncParams = currentFuncParams;
        currentFuncName = stmt.name;
        currentFuncParams = params.map((p: any) => typeof p === 'string' ? p : p.name);
        for (const v of funcVarInited) varInitedInDecl.add(v);
        currentFuncInitExprs = funcInitExprs;

        if (memoizable.has(stmt.name) && params.length === 1) {
          const pname = typeof params[0] === 'string' ? params[0] : params[0].name;
          const memoRetType = retType;
          const canMemo = memoRetType === 'long long' || memoRetType === 'double';
          if (canMemo) {
            const prevMemoFn = currentMemoFn;
            const prevMemoParam = currentMemoParam;
            currentMemoFn = stmt.name;
            currentMemoParam = pname;
            const bodyCode = body.map((s: any) => cStmt(s, 1)).join('\n');
            currentMemoFn = prevMemoFn;
            currentMemoParam = prevMemoParam;
            const hasReturn = body.some((s: any) => s.type === 'Return' || s.type === 'ReturnStatement');
            const footer = hasReturn ? '' : '\n    return 0;';
            varInitedInDecl.clear();
            for (const v of savedVarInitedInDecl) varInitedInDecl.add(v);
            currentFuncInitExprs = savedFuncInitExprs;
            currentFuncName = savedFuncName;
            currentFuncParams = savedFuncParams;
            const memoArrType = memoRetType === 'double' ? 'double' : 'long long';
            funcDefs.push(`${retType} sl_${cFuncName(stmt.name)}(${paramDecls.join(', ')}) {\n    static ${memoArrType} _memo[256] = {0};\n    static char _memo_set[256] = {0};\n    if (sl_${pname} >= 0 && sl_${pname} < 256) {\n        if (_memo_set[sl_${pname}]) return _memo[sl_${pname}];\n    }\n${varDeclCode}${bodyCode}${footer}\n}`);
            return '';
          }
        }

        const bodyCode = body.map((s: any) => cStmt(s, 1)).join('\n');
        const hasReturn = body.some((s: any) => s.type === 'Return' || s.type === 'ReturnStatement');
        const funcCleanup = genCleanup(
          funcLocalVarTypes.get(stmt.name) || new Map(),
          new Set(params.map((p: any) => (typeof p === 'string' ? p : p.name))),
          true
        );
        const footer = hasReturn ? '' : (funcCleanup ? `\n${funcCleanup}\n    return 0;` : '\n    return 0;');
        const isSimple = body.length === 1 && (body[0].type === 'Return' || body[0].type === 'ReturnStatement');
        const isSmallPure = body.length <= 10 && body.every((s: any) => s.type === 'Assignment' || s.type === 'Assign' || s.type === 'Return' || s.type === 'ReturnStatement' || s.type === 'VarDecl' || s.type === 'LetDecl' || s.type === 'ExpressionStatement' || s.type === 'ExprStatement' || s.type === 'Action');
        const inlineAttr = (isSimple || isSmallPure) ? 'static inline ' : '';
        const useIntParams = false;
        varInitedInDecl.clear();
        for (const v of savedVarInitedInDecl) varInitedInDecl.add(v);
        currentFuncInitExprs = savedFuncInitExprs;
        currentFuncName = savedFuncName;
        currentFuncParams = savedFuncParams;
        const finalRetType = retType;
        const finalParamDecls = useIntParams ? paramDecls.map((p: string) => p.replace(/long long/g, 'int')) : paramDecls;
        const finalVarDeclCode = useIntParams ? varDeclCode.replace(/long long/g, 'int') : varDeclCode;
        funcDefs.push(`${inlineAttr}${finalRetType} sl_${cFuncName(stmt.name)}(${finalParamDecls.join(', ')}) {\n${finalVarDeclCode}${bodyCode}${footer}\n}`);
        return '';
      }
      case 'Return':
      case 'ReturnStatement': {
        const val = stmt.value || stmt.argument;
        const expr = cExpr(val);
        if (currentMemoFn && currentMemoParam) {
          const rtype = funcType(currentMemoFn);
          return `${pad}${rtype} _r = ${expr};\n${pad}if (sl_${currentMemoParam} >= 0 && sl_${currentMemoParam} < 256) { _memo_set[sl_${currentMemoParam}] = 1; _memo[sl_${currentMemoParam}] = _r; }\n${pad}return _r;`;
        }
        const retExclude = new Set<string>(currentFuncParams || []);
        if (val?.type === 'Identifier' && val.name) retExclude.add(val.name);
        const cleanup = currentFuncName
          ? genCleanup(funcLocalVarTypes.get(currentFuncName) || new Map(), retExclude, true)
          : '';
        if (cleanup) {
          const retType = exprType(val);
          return `${pad}${retType} _r = ${expr};\n${cleanup}\n${pad}return _r;`;
        }
        return `${pad}return ${expr};`;
      }
      case 'Assignment': {
        const t = stmt.target || stmt.left;
        const v = stmt.value || stmt.right;
        if (t?.type === 'ArrayLiteral') {
          const elements = t.elements || [];
          const tmpVar = `_destr_${destrCounter++}`;
          const lines: string[] = [];
          const valExpr = cExpr(v);
          const valType = exprType(v);
          if (valType === 'SlArray*') {
            lines.push(`${pad}SlArray* ${tmpVar} = ${valExpr};`);
          } else {
            lines.push(`${pad}SlArray* ${tmpVar} = (SlArray*)(${valExpr});`);
          }
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (el.type === 'Identifier') {
              const elName = el.name;
              const elType = varType(elName);
              if (elType === 'double') {
                lines.push(`${pad}sl_${elName} = sl_arr_getval(${tmpVar}, ${i}).dval;`);
              } else if (elType === 'char*') {
                lines.push(`${pad}sl_${elName} = sl_arr_getval(${tmpVar}, ${i}).sval;`);
              } else if (elType === 'SlArray*') {
                lines.push(`${pad}sl_${elName} = sl_arr_getval(${tmpVar}, ${i}).aval;`);
              } else if (elType === 'SlMap*') {
                lines.push(`${pad}sl_${elName} = sl_arr_getval(${tmpVar}, ${i}).mval;`);
              } else {
                lines.push(`${pad}sl_${elName} = sl_arr_get(${tmpVar}, ${i});`);
              }
            } else if (el.type === 'SpreadElement' || el.operator === '...') {
              const restName = el.argument?.name || el.name || '';
              if (restName) {
                lines.push(`${pad}sl_${restName} = sl_arr_slice(${tmpVar}, ${i}, ${tmpVar}->len);`);
              }
            }
          }
          return lines.join('\n');
        }
        if (t?.type === 'Member') {
          const obj = cExpr(t.object);
          const propName = typeof t.property === 'string' ? t.property : (t.property?.name || '');
          const prop = t.computed ? cExpr(t.property) : propName;
          const val = cExpr(v);
          if (!t.computed) {
            const objName = t.object?.name || '';
            if (t.object?.type === 'Identifier' && t.object.name === 'this') {
              if (currentClassName && parentHasProperty(classDefs.get(currentClassName)?.superClass, propName)) {
                return `${pad}self->_super.${propName} = ${val};`;
              }
              return `${pad}self->${propName} = ${val};`;
            }
            const fields = objectFields.get(objName);
            if (fields && fields.has(propName) && !objectVars.has(objName)) return `${pad}sl_${objName}_${propName} = ${val};`;
            if (instanceVars.has(objName)) {
              const cls = classDefs.get(instanceVars.get(objName)!);
              if (cls && cls.properties.has(propName)) {
                if (parentHasProperty(cls.superClass, propName)) return `${pad}${obj}->_super.${propName} = ${val};`;
                return `${pad}${obj}->${propName} = ${val};`;
              }
            }
            {
              const otn = exprType(t.object);
              if (otn.startsWith('Sl') && otn.endsWith('*') && otn !== 'SlArray*' && otn !== 'SlMap*') {
                const clsNameAs = otn.substring(2, otn.length - 1);
                const clsAs = classDefs.get(clsNameAs);
                if (clsAs && clsAs.properties.has(propName)) {
                  if (parentHasProperty(clsAs.superClass, propName)) return `${pad}${obj}->_super.${propName} = ${val};`;
                  return `${pad}${obj}->${propName} = ${val};`;
                }
              }
            }
            if (t.object?.type === 'Identifier' && objectVars.has(objName)) {
              const valType = v ? exprType(v) : 'long long';
              return `${pad}sl_map_set(${obj}, "${propName}", ${boxFnForType(valType)}(${valType === 'long long' ? '(long long)' : ''}${val}));`;
            }
            const objType = exprType(t.object);
            if (objType === 'SlMap*') {
              const valType = v ? exprType(v) : 'long long';
              return `${pad}sl_map_set(${obj}, "${propName}", ${boxFnForType(valType)}(${valType === 'long long' ? '(long long)' : ''}${val}));`;
            }
          }
          {
            const arrValType = v ? exprType(v) : 'long long';
            const arrId = t.object?.type === 'Identifier' ? t.object.name : '';
            const arrElemT = arrId && arrayElementTypes.has(arrId) ? arrayElementTypes.get(arrId)! : '';
            if (arrElemT === 'double' || arrValType === 'double') return `${pad}{ sl_arr_ensure(${obj}, (${prop})+1); sl_arr_set_dbl(${obj}, ${prop}, (double)(${val})); }`;
            if (arrValType === 'long long') return `${pad}{ sl_arr_ensure(${obj}, (${prop})+1); sl_arr_set_int(${obj}, ${prop}, ${val}); }`;
            return `${pad}{ sl_arr_ensure(${obj}, (${prop})+1); sl_arr_set(${obj}, ${prop}, ${boxFnForType(arrValType)}(${val})); }`;
          }
        }
        const name = t?.name || (typeof t === 'string' ? t : 'v');
        if (v && (v.type === 'ObjectLiteral' || v.type === 'Object') && objectFields.has(name)) {
          return `${pad}sl_${name} = ${cExpr(v)};`;
        }
        if (varInitedInDecl.has(name)) {
          varInitedInDecl.delete(name);
          const initExpr = currentFuncInitExprs?.get(name) || topInitExprs.get(name);
          if (initExpr) {
            const initCode = cExpr(initExpr);
            const assignCode = cExpr(v);
            if (initCode === assignCode) {
              return '';
            }
          }
        }
        if (v && (v.type === 'BinaryExpr' || v.type === 'Binary' || v.type === 'BinaryOp')) {
          const op = v.operator;
          const vLeft = v.left;
          const vRight = v.right;
          if (vLeft?.type === 'Identifier' && vLeft.name === name) {
            if (op === '+' && vRight?.type === 'NumberLiteral' && vRight.value === 1) {
              return `${pad}sl_${name}++;`;
            }
            if (op === '-' && vRight?.type === 'NumberLiteral' && vRight.value === 1) {
              return `${pad}sl_${name}--;`;
            }
            if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%') {
              let nameType = varType(name);
              const localVarTypesMap = currentFuncName ? funcLocalVarTypes.get(currentFuncName) : null;
              if (nameType === 'long long' && localVarTypesMap && localVarTypesMap.has(name)) {
                nameType = localVarTypesMap.get(name)!;
              }
              if (op === '+' && nameType === 'char*') {
                const rightType = exprType(vRight);
                if (rightType === 'char*') return `${pad}sl_${name} = sl_strcat_inplace(sl_${name}, ${cExpr(vRight)});`;
                if (rightType === 'double') return `${pad}sl_${name} = sl_strcat_inplace_fr(sl_${name}, sl_dtoa(${cExpr(vRight)}));`;
                return `${pad}sl_${name} = sl_strcat_inplace_fr(sl_${name}, sl_itoa(${cExpr(vRight)}));`;
              }
              if ((op === '%' || op === '&' || op === '|' || op === '^' || op === '<<' || op === '>>') && nameType === 'double') {
                return `${pad}sl_${name} = (double)((long long)sl_${name} ${op} (long long)${cExpr(vRight)});`;
              }
              return `${pad}sl_${name} ${op}= ${cExpr(vRight)};`;
            }
          }
        }
        const release = genReleaseBeforeAssign(name);
        const rhs = cExpr(v);
        const vt = varType(name);
        if (vt === 'char*') {
          if (v && (v.type === 'StringLiteral' || v.type === 'TextLiteral')) {
            return `${pad}{ char* _old = sl_${name}; sl_${name} = strdup(${rhs}); sl_release_str(_old); }`;
          }
          return `${pad}{ char* _old = sl_${name}; sl_${name} = ${rhs}; sl_release_str(_old); }`;
        }
        if (vt === 'SlArray*') {
          return `${pad}{ SlArray* _old = sl_${name}; sl_${name} = ${rhs}; sl_release_arr(_old); }`;
        }
        if (vt === 'SlMap*') {
          return `${pad}{ SlMap* _old = sl_${name}; sl_${name} = ${rhs}; sl_release_map(_old); }`;
        }
        return `${pad}${release}sl_${name} = ${rhs};`;
      }
      case 'VarDecl':
      case 'LetDecl': {
        const name = stmt.name || (stmt.target?.name) || 'v';
        const initVal = stmt.value || stmt.init;
        if (initVal && topInitExprs.has(name) && topInitExprs.get(name) === initVal && varInitedInDecl.has(name)) {
          return '';
        }
        const value = cExpr(initVal);
        const vt = varType(name);
        if (vt === 'char*' && initVal && (initVal.type === 'StringLiteral' || initVal.type === 'TextLiteral')) {
          return `${pad}sl_${name} = strdup(${value});`;
        }
        return `${pad}sl_${name} = ${value};`;
      }
      case 'If':
      case 'IfStatement': {
        const cond = cExpr(stmt.condition || stmt.test);
        const thenBody = stmt.thenBranch || stmt.then || stmt.consequent || [];
        const thenCode = thenBody.map((s: any) => cStmt(s, indent + 1)).join('\n');
        let code = `${pad}if (${cond}) {\n${thenCode}\n${pad}}`;
        const elseBody = stmt.elseBranch || stmt.else || stmt.alternate;
        if (elseBody) {
          if (Array.isArray(elseBody)) {
            const elseCode = elseBody.map((s: any) => cStmt(s, indent + 1)).join('\n');
            code += ` else {\n${elseCode}\n${pad}}`;
          } else if (elseBody.type === 'If' || elseBody.type === 'IfStatement') {
            code += ` else ${cStmt(elseBody, indent)}`;
          } else {
            const elseCode = cStmt(elseBody, indent + 1);
            code += ` else {\n${elseCode}\n${pad}}`;
          }
        }
        return code;
      }
      case 'While':
      case 'WhileStatement': {
        const cond = cExpr(stmt.condition || stmt.test);
        const body = (stmt.body || []);
        if (currentForcedEnc) {
          const bodyCode = body.map((s: any) => cStmt(s, indent + 1)).join('\n');
          const whileGetMatches = bodyCode.match(/sl_arr_get\(sl_(\w+),/g);
          const whileHasPush = /sl_arr_push/.test(bodyCode);
          const whileUnsafeArrSet = /sl_arr_set\(/.test(bodyCode) || /sl_arr_set_dbl\(/.test(bodyCode) || /sl_arr_set_int\(/.test(bodyCode);
          if (whileGetMatches && !whileHasPush && !whileUnsafeArrSet && whileGetMatches.length > 0) {
            const uniqueArrs = [...new Set(whileGetMatches.map((m: string) => m.match(/sl_arr_get\(sl_(\w+),/)![1]))] as string[];
            if (uniqueArrs.length >= 1 && uniqueArrs.length <= 8) {
              const directBody = acaeBodyWithDirectGetsSets(bodyCode, uniqueArrs, currentForcedEnc);
              if (currentForcedEnc === 'i32') {
                const condHasPC = /\bsl_particleCount\b/.test(cond);
                const i32Cond = condHasPC ? cond.replace(/\bsl_particleCount\b/g, '_n') : cond;
                return `${pad}while (${i32Cond}) {\n${pad}  ${directBody}\n${pad}}`;
              } else {
                return `${pad}while (${cond}) {\n${pad}  ${directBody}\n${pad}}`;
              }
            }
          }
          return `${pad}while (${cond}) {\n${bodyCode}\n${pad}}`;
        }
        const bodyCode = body.map((s: any) => cStmt(s, indent + 1)).join('\n');
        const whileGetMatches = bodyCode.match(/sl_arr_get\(sl_(\w+),/g);
        const whileHasPush = /sl_arr_push/.test(bodyCode);
        const whileUnsafeArrSet = /sl_arr_set\(/.test(bodyCode) || /sl_arr_set_dbl\(/.test(bodyCode) || /sl_arr_set_int\(/.test(bodyCode);
        const whileHasNestedEncDispatch = /SL_ENC_I32|SL_ENC_I64/.test(bodyCode);
        if (whileGetMatches && !whileHasPush && !whileUnsafeArrSet && whileGetMatches.length > 0) {
          const uniqueArrs = [...new Set(whileGetMatches.map((m: string) => m.match(/sl_arr_get\(sl_(\w+),/)![1]))] as string[];
          if (uniqueArrs.length >= 1 && uniqueArrs.length <= 8) {
            const shareEnc = acaeArraysShareEncodingExpr(uniqueArrs);
            let i32Body: string, i64Body: string, fallbackBody: string;
            if (whileHasNestedEncDispatch) {
              const savedEnc = currentForcedEnc;
              currentForcedEnc = 'i32';
              i32Body = acaeBodyWithDirectGetsSets(body.map((s: any) => cStmt(s, indent + 2)).join('\n'), uniqueArrs, 'i32');
              currentForcedEnc = 'i64';
              i64Body = acaeBodyWithDirectGetsSets(body.map((s: any) => cStmt(s, indent + 2)).join('\n'), uniqueArrs, 'i64');
              currentForcedEnc = null;
              fallbackBody = bodyCode;
              currentForcedEnc = savedEnc;
            } else {
              i32Body = acaeBodyWithDirectGetsSets(bodyCode, uniqueArrs, 'i32');
              i64Body = acaeBodyWithDirectGetsSets(bodyCode, uniqueArrs, 'i64');
              fallbackBody = bodyCode;
            }
            const i32Decls = acaeI32RestrictDecls(uniqueArrs);
            const i32Shadow = acaeI32ShadowVars(i32Body, arrayVars);
            const condHasParticleCount = /\bsl_particleCount\b/.test(cond);
            let i32Cond = condHasParticleCount ? cond.replace(/\bsl_particleCount\b/g, '_n') : cond;
            const i32Prefix = condHasParticleCount ? `const int _n = (int)sl_particleCount; ` : '';
            const i32GlobalScalars = new Set<string>();
            const i32GlobalRe = /\bsl_(W|H|BGSTEP|MAXF|FIXED_PARTICLE_N|STOP_AT_FRAMES|PIXEL_HUD)\b/g;
            let i32gm: RegExpExecArray | null;
            while ((i32gm = i32GlobalRe.exec(i32Body + ' ' + i32Cond)) !== null) {
              i32GlobalScalars.add(i32gm[1]);
            }
            let i32GlobalDecls = '';
            let i32BodyFinal = i32Body;
            for (const v of i32GlobalScalars) {
              i32GlobalDecls += `const int _i_${v} = (int)sl_${v}; `;
              const declRe = new RegExp(`(_i_${v}\\s*=\\s*\\(int\\))sl_${v}`, 'g');
              i32BodyFinal = i32BodyFinal.replace(declRe, `$1__SENT_${v}__`);
              i32BodyFinal = i32BodyFinal.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), `_i_${v}`);
              i32BodyFinal = i32BodyFinal.replace(new RegExp(`__SENT_${v}__`, 'g'), `sl_${v}`);
              i32Cond = i32Cond.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), `_i_${v}`);
            }
            const shadowVars = i32Shadow.trim();
            const shadowWritebacks: string[] = [];
            if (shadowVars) {
              const shadowDecls = shadowVars.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
              for (const sd of shadowDecls) {
                const nm = sd.match(/int\s+(_si_\w+)/);
                if (nm) {
                  const vn = nm[1];
                  const origName = vn.replace(/^_si_/, 'sl_');
                  shadowWritebacks.push(`${origName} = (long long)${vn};`);
                  const bareName = origName.replace(/^sl_/, '');
                  if (!i32GlobalScalars.has(bareName)) {
                    i32BodyFinal = i32BodyFinal.replace(new RegExp(`\\b${origName}\\b`, 'g'), vn);
                    i32Cond = i32Cond.replace(new RegExp(`\\b${origName}\\b`, 'g'), vn);
                  }
                }
              }
            }
            const i32Writeback = shadowWritebacks.length > 0 ? `\n${pad}    ${shadowWritebacks.join(' ')}` : '';
            acaeNote(`while loop line ${stmt.line ?? '?'}: multi-array encoding-dispatch on [${uniqueArrs.map((a: string) => 'sl_' + a).join(', ')}] (+ sl_arr_set_int peel)${whileHasNestedEncDispatch ? ' [HOISTED]' : ''}`);
            return `${pad}{ int _enc = sl_${uniqueArrs[0]}->encoding;\n${pad}  if (${shareEnc}) {\n${pad}  if (SL_LIKELY(_enc == SL_ENC_I32)) {\n${pad}    ${i32Decls}${i32Shadow} ${i32GlobalDecls}\n${pad}    ${i32Prefix}while (${i32Cond}) {\n${pad}      ${i32BodyFinal}\n${pad}    }${i32Writeback}\n${pad}  }\n${pad}  else if (_enc == SL_ENC_I64) {\n${pad}    while (${cond}) {\n${pad}      ${i64Body}\n${pad}    }\n${pad}  }\n${pad}  else {\n${pad}    while (${cond}) {\n${fallbackBody}\n${pad}    }\n${pad}  }\n${pad}} else {\n${pad}    while (${cond}) {\n${fallbackBody}\n${pad}    }\n${pad}}\n${pad}}`;
          }
        }
        const scalarIntVars = new Set<string>();
        const scalarRe = /\bsl_(W|H|BGSTEP|MAXF|FIXED_PARTICLE_N|STOP_AT_FRAMES|PIXEL_HUD)\b/g;
        let svMatch: RegExpExecArray | null;
        while ((svMatch = scalarRe.exec(cond + ' ' + bodyCode)) !== null) {
          scalarIntVars.add(svMatch[1]);
        }
        const strBufVars = new Set<string>();
        const strBufRe = /\bsl_(\w+)\s*=\s*sl_strcat_inplace\b/g;
        let sbMatch: RegExpExecArray | null;
        while ((sbMatch = strBufRe.exec(bodyCode)) !== null) {
          const name = sbMatch[1];
          if (varType(name) === 'char*') strBufVars.add(name);
        }
        const loopVarShadow = new Set<string>();
        const loopAssignRe = /\bsl_(\w+)\s*(\+\+|--|\+=|-=)\s*(\d+)?/g;
        let lvMatch: RegExpExecArray | null;
        while ((lvMatch = loopAssignRe.exec(bodyCode)) !== null) {
          const name = lvMatch[1];
          if (/^(frame|collisions|particleCount)$/.test(name)) continue;
          const vt = varType(name);
          if (vt === 'double' || vt === 'char*' || vt === 'SlArray*' || vt === 'SlMap*' || vt.startsWith('Sl')) continue;
          loopVarShadow.add(name);
        }
        const loopSimpleAssignRe = /\bsl_(\w+)\s*=\s*\d+\b/g;
        while ((lvMatch = loopSimpleAssignRe.exec(bodyCode)) !== null) {
          const name = lvMatch[1];
          if (/^(frame|collisions|particleCount)$/.test(name)) continue;
          const vt = varType(name);
          if (vt === 'double' || vt === 'char*' || vt === 'SlArray*' || vt === 'SlMap*' || vt.startsWith('Sl')) continue;
          loopVarShadow.add(name);
        }
        if (strBufVars.size > 0 && !currentForcedEnc) {
          if (clcWhileBodyContainsNestedLoop(body)) {
            return `${pad}while (${cond}) {\n${bodyCode}\n${pad}}`;
          }
          const loopBoundMatch = cond.match(/_wl_(\w+)\s*<\s*(\d+)/) || cond.match(/sl_(\w+)\s*<\s*(\d+)/);
          const loopIterCount = loopBoundMatch ? parseInt(loopBoundMatch[2]) : 0;
          const canPrealloc = loopIterCount > 0 && loopIterCount <= 10000000;
          const sbInits: string[] = [];
          for (const v of strBufVars) {
            if (canPrealloc) {
              sbInits.push(`SlStrBuf _sb_${v} = sl_sb_new(sl_${v}); sl_sb_ensure(&_sb_${v}, ${loopIterCount} + _sb_${v}.len + 1);`);
            } else {
              sbInits.push(`SlStrBuf _sb_${v} = sl_sb_new(sl_${v});`);
            }
          }
          for (const v of loopVarShadow) {
            sbInits.push(`long long _wl_${v} = sl_${v};`);
          }
          let sbBody = bodyCode;
          let hasSingleCharAppend = false;
          for (const v of strBufVars) {
            sbBody = sbBody.replace(
              new RegExp(`sl_${v}\\s*=\\s*sl_strcat_inplace\\(sl_${v}\\s*,\\s*"([^"])"\\)`, 'g'),
              (_m: any, ch: any) => {
                hasSingleCharAppend = true;
                if (canPrealloc) {
                  return `_sb_${v}.data[_sb_${v}.len++] = '${ch}';`;
                }
                return `{ if (_sb_${v}.len + 2 >= _sb_${v}.cap) { _sb_${v}.cap = _sb_${v}.cap * 2 + 32; _sb_${v}.data = (char*)realloc(_sb_${v}.data, _sb_${v}.cap); } _sb_${v}.data[_sb_${v}.len++] = '${ch}'; }`;
              }
            );
            sbBody = sbBody.replace(
              new RegExp(`sl_${v}\\s*=\\s*sl_strcat_inplace\\(sl_${v}\\s*,\\s*"([^"]+)"\\)`, 'g'),
              (_m: any, str: any) => {
                const slen = str.length;
                return `sl_sb_append(&_sb_${v}, "${str}", ${slen})`;
              }
            );
            sbBody = sbBody.replace(
              new RegExp(`sl_${v}\\s*=\\s*sl_strcat_inplace\\(sl_${v}\\s*,\\s*([^)]+)\\)`, 'g'),
              (_: any, rhs: any) => `sl_sb_append(&_sb_${v}, ${rhs}, (int)strlen(${rhs}))`
            );
            sbBody = sbBody.replace(
              new RegExp(`sl_${v}\\s*=\\s*sl_strcat_inplace_fr\\(sl_${v}\\s*,\\s*([^)]+)\\)`, 'g'),
              (_: any, rhs: any) => `{ char* _tmp_${v} = ${rhs}; sl_sb_append(&_sb_${v}, _tmp_${v}, (int)strlen(_tmp_${v})); free(_tmp_${v}); }`
            );
            sbBody = sbBody.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), `_sb_${v}.data`);
          }
          let sbCond = cond;
          for (const v of loopVarShadow) {
            sbBody = sbBody.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), `_wl_${v}`);
            sbCond = sbCond.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), `_wl_${v}`);
          }
          const nullTerm = hasSingleCharAppend ? [...strBufVars].map(v => `_sb_${v}.data[_sb_${v}.len] = '\\0';`).join(' ') : '';
          const sbWritebacks = [...strBufVars].map(v => `sl_${v} = sl_sb_to_str(&_sb_${v});`).join('\n' + pad + '  ');
          const wlWritebacks = [...loopVarShadow].map(v => `sl_${v} = _wl_${v};`).join(' ');
          const allWritebacks = [nullTerm, sbWritebacks, wlWritebacks].filter(Boolean).join('\n' + pad + '  ');
          return `${pad}{ ${sbInits.join(' ')}\n${pad}  while (${sbCond}) {\n${sbBody}\n${pad}  }\n${pad}  ${allWritebacks}\n${pad}}`;
        }
        if (!currentForcedEnc && (scalarIntVars.size > 0 || loopVarShadow.size > 0)) {
          if (clcWhileBodyContainsNestedLoop(body)) {
            return `${pad}while (${cond}) {\n${bodyCode}\n${pad}}`;
          }
          const parts: string[] = [];
          for (const v of scalarIntVars) {
            parts.push(`const int _i_${v} = (int)sl_${v};`);
          }
          for (const v of loopVarShadow) {
            parts.push(`long long _wl_${v} = sl_${v};`);
          }
          const intCaches = parts.join(' ');
          let intCond = cond;
          let intBody = bodyCode;
          for (const v of loopVarShadow) {
            const wl = `_wl_${v}`;
            intCond = intCond.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), wl);
            intBody = intBody.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), wl);
          }
          for (const v of scalarIntVars) {
            const declRe2 = new RegExp(`(_i_${v}\\s*=\\s*\\(int\\))sl_${v}`, 'g');
            intCond = intCond.replace(declRe2, `$1__SENT_${v}__`);
            intCond = intCond.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), `_i_${v}`);
            intCond = intCond.replace(new RegExp(`__SENT_${v}__`, 'g'), `sl_${v}`);
            intBody = intBody.replace(declRe2, `$1__SENT_${v}__`);
            intBody = intBody.replace(new RegExp(`\\bsl_${v}\\b`, 'g'), `_i_${v}`);
            intBody = intBody.replace(new RegExp(`__SENT_${v}__`, 'g'), `sl_${v}`);
          }
          const writebacks = [...loopVarShadow].map(v => `sl_${v} = _wl_${v};`).join(' ');
          const writebackStr = writebacks ? `\n${pad}  ${writebacks}` : '';
          return `${pad}{ ${intCaches}\n${pad}  while (${intCond}) {\n${intBody}\n${pad}  }${writebackStr}\n${pad}}`;
        }
        return `${pad}while (${cond}) {\n${bodyCode}\n${pad}}`;
      }
      case 'ForIn': {
        const keyVar = stmt.variable || stmt.keyVar || stmt.name || 'item';
        const iterExpr = stmt.iterable;
        const body = (stmt.body || []);
        const genLoopBody = () => body.map((s: any) => cStmt(s, indent + 1)).join('\n');
        const bodyCode = genLoopBody();
        if (iterExpr?.type === 'Identifier' && arrayVars.has(iterExpr.name)) {
          const elemType = arrayElementTypes.get(iterExpr.name) || 'long long';
          let elemDecl: string;
          let elemAccess: string;
          if (elemType === 'SlMap*') {
            elemDecl = 'SlMap*'; elemAccess = `sl_arr_getval(sl_${iterExpr.name}, _i).mval`;
          } else if (elemType === 'char*') {
            elemDecl = 'char*'; elemAccess = `sl_arr_getval(sl_${iterExpr.name}, _i).sval`;
          } else if (elemType === 'SlArray*') {
            elemDecl = 'SlArray*'; elemAccess = `sl_arr_getval(sl_${iterExpr.name}, _i).aval`;
          } else if (elemType === 'double') {
            elemDecl = 'double'; elemAccess = `sl_arr_getval(sl_${iterExpr.name}, _i).dval`;
          } else {
            elemDecl = 'long long';
            elemAccess = `sl_arr_get(sl_${iterExpr.name}, _i)`;
            const an = iterExpr.name;
            const fiGetMatches = bodyCode.match(/sl_arr_get\(sl_(\w+),/g);
            const fiHasPush = /sl_arr_push/.test(bodyCode);
            const fiUnsafeArrSet = /sl_arr_set\(/.test(bodyCode) || /sl_arr_set_dbl\(/.test(bodyCode) || /sl_arr_set_int\(/.test(bodyCode);
            const fiNestedEnc = /SL_ENC_I32|SL_ENC_I64/.test(bodyCode);
            if (!fiHasPush && !fiUnsafeArrSet && !fiNestedEnc) {
              const fromBody = fiGetMatches
                ? ([...new Set(fiGetMatches.map((m: string) => m.match(/sl_arr_get\(sl_(\w+),/)![1]))] as string[])
                : [];
              const uniqueArrs = [...new Set([an, ...fromBody])];
              if (uniqueArrs.length >= 1 && uniqueArrs.length <= 8) {
                const shareEnc = acaeArraysShareEncodingExpr(uniqueArrs);
                const i32Body = acaeBodyWithDirectGetsSets(bodyCode, uniqueArrs, 'i32');
                const i64Body = acaeBodyWithDirectGetsSets(bodyCode, uniqueArrs, 'i64');
                const i32Decls = acaeI32RestrictDecls(uniqueArrs);
                const slowBind = `${elemDecl} sl_${keyVar} = ${elemAccess};`;
                const simdOnly = `${pad}{ int _enc = sl_${uniqueArrs[0]}->encoding;\n${pad}  if (${shareEnc}) {\n${pad}  if (SL_LIKELY(_enc == SL_ENC_I32)) {\n${pad}    ${i32Decls}\n${pad}  #pragma omp simd\n${pad}    for (int _i = 0; _i < sl_${an}->len; _i++) {\n${pad}      long long sl_${keyVar} = (long long)sl_${an}->i32[_i];\n${pad}      ${i32Body}\n${pad}    }\n${pad}  }\n${pad}  else if (_enc == SL_ENC_I64) {\n${pad}  #pragma omp simd\n${pad}    for (int _i = 0; _i < sl_${an}->len; _i++) {\n${pad}      long long sl_${keyVar} = sl_${an}->i64[_i];\n${pad}      ${i64Body}\n${pad}    }\n${pad}  }\n${pad}  else {\n${pad}    for (int _i = 0; _i < sl_${an}->len; _i++) {\n${pad}      ${slowBind}\n${bodyCode}\n${pad}    }\n${pad}  }\n${pad}} else {\n${pad}    for (int _i = 0; _i < sl_${an}->len; _i++) {\n${pad}      ${slowBind}\n${bodyCode}\n${pad}    }\n${pad}}\n${pad}}`;
                // Parallel+simd reduction: same safety as range ACAE — only when the iter array alone is peeled
                // (multi-array shareEnc would need a guarded parallel region; keep simd-only).
                if (
                  uniqueArrs.length === 1 &&
                  allowLoopOmpParallel() &&
                  !ACAE_BAD_OMP.test(bodyCode)
                ) {
                  ompParallelSuppress++;
                  const bodySimd = genLoopBody();
                  ompParallelSuppress--;
                  const i32Simd = acaeBodyWithDirectGetsSets(bodySimd, uniqueArrs, 'i32');
                  const i64Simd = acaeBodyWithDirectGetsSets(bodySimd, uniqueArrs, 'i64');
                  const pt = slParallelThreshold(
                    `long long sl_${keyVar} = (long long)sl_${an}->i32[_i]; ${i32Simd}`
                  );
                  const redVar = slDetectReductionVar(bodySimd);
                  if (redVar) {
                    const encBody = `if (SL_LIKELY(_enc == SL_ENC_I32)) { long long sl_${keyVar} = (long long)sl_${an}->i32[_i]; ${i32Simd}; } else if (_enc == SL_ENC_I64) { long long sl_${keyVar} = sl_${an}->i64[_i]; ${i64Simd}; } else { ${slowBind} ${bodySimd} }`;
                    acaeNote(
                      `for-in array line ${stmt.line ?? '?'}: ENC+OpenMP parallel+simd on iter sl_${an} (reduction ${redVar})`
                    );
                    return `${pad}#pragma omp parallel reduction(+:${redVar}) if(sl_n > ${pt})\n${pad}{\n${pad}    int _enc = sl_${an}->encoding;\n${pad}    #pragma omp for simd schedule(static)\n${pad}    for (int _i = 0; _i < sl_${an}->len; _i++) {\n${pad}        ${encBody}\n${pad}    }\n${pad}}`;
                  }
                }
                acaeNote(
                  `for-in array line ${stmt.line ?? '?'}: encoding-dispatch SIMD on iter sl_${an} (arrays ${uniqueArrs.map((a: string) => 'sl_' + a).join(', ')})`
                );
                return simdOnly;
              }
            }
          }
          return `${pad}for (int _i = 0; _i < sl_${iterExpr.name}->len; _i++) {\n${pad}    ${elemDecl} sl_${keyVar} = ${elemAccess};\n${bodyCode}\n${pad}}`;
        }
        if (iterExpr?.type === 'Identifier' && objectVars.has(iterExpr.name)) {
          return `${pad}{ SlArray* _keys = sl_map_keys(sl_${iterExpr.name}); for (int _i = 0; _i < _keys->len; _i++) {\n${pad}    char* sl_${keyVar} = sl_arr_getval(_keys, _i).sval;\n${bodyCode}\n${pad}} sl_release_arr(_keys); }`;
        }
        if (iterExpr?.type === 'Identifier' && stringVars.has(iterExpr.name)) {
          return `${pad}{ int _len = (int)strlen(sl_${iterExpr.name}); for (int _i = 0; _i < _len; _i++) {\n${pad}    char* sl_${keyVar} = sl_str_charAt(sl_${iterExpr.name}, (long long)_i);\n${bodyCode}\n${pad}} }`;
        }
        if (iterExpr?.type === 'Call') {
          const callName = iterExpr.callee?.name || '';
          if (callName === 'range') {
            const rawRangeArgs = iterExpr.arguments || iterExpr.args || [];
            let rangeArgs = rawRangeArgs.map((a: any) => cExpr(a));
            if (rawRangeArgs.length === 3) {
              const st = rawRangeArgs[2];
              const stepVal = st && (st.type === 'NumberLiteral' || st.type === 'Number') ? Number(st.value) : NaN;
              if (stepVal === 1) {
                rangeArgs = [cExpr(rawRangeArgs[0]), cExpr(rawRangeArgs[1])];
                acaeNote(`range() 3-arg with step 1 at line ${stmt.line ?? '?'}: treated as 2-arg for ACAE fast path`);
              }
            }
            if (rangeArgs.length <= 2) {
              const startExpr = rangeArgs.length === 1 ? '0' : rangeArgs[0];
              const endExpr = rangeArgs.length === 1 ? rangeArgs[0] : rangeArgs[1];
              const rangePushMatches = bodyCode.match(/sl_arr_push_(int|dbl)\(sl_(\w+),/g);
              if (rangePushMatches && rangePushMatches.length > 0) {
                const loopCount = endExpr;
                const arrNames = [...new Set(rangePushMatches.map((m: string) => m.match(/sl_arr_push_(?:int|dbl)\(sl_(\w+),/)![1]))];
                const hasIntPush = /sl_arr_push_int\(sl_/.test(bodyCode);
                const hasDblPush = /sl_arr_push_dbl\(sl_/.test(bodyCode);
                const ensureLines = arrNames.map(n => {
                  if (hasIntPush && !hasDblPush) return `${pad}sl_arr_ensure_enc(sl_${n}, (int)(${loopCount}), sl_val_fits((${loopCount}) - 1));`;
                  return `${pad}sl_arr_ensure(sl_${n}, (int)(${loopCount}));`;
                }).join('\n');
                const optimizedBody = bodyCode
                  .replace(/sl_arr_push_int\(sl_/g, (hasIntPush && !hasDblPush) ? 'sl_arr_push_int_fast(sl_' : 'sl_arr_push_int_nogrow(sl_')
                  .replace(/sl_arr_push_dbl\(sl_/g, 'sl_arr_push_dbl_nogrow(sl_');
                return `${ensureLines}\n${pad}for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${optimizedBody}\n${pad}}`;
              }
              const rangeGetMatches = bodyCode.match(/sl_arr_get\(sl_(\w+),/g);
              const rangeHasPush = /sl_arr_push/.test(bodyCode);
              const rangeUnsafeSet = /sl_arr_set\(/.test(bodyCode) || /sl_arr_set_dbl\(/.test(bodyCode);
              if (rangeGetMatches && !rangeHasPush && !rangeUnsafeSet && rangeGetMatches.length > 0) {
                const arrName = rangeGetMatches[0].match(/sl_arr_get\(sl_(\w+),/)![1];
                const allSameArr = rangeGetMatches.every((m: string) => m.includes(`sl_arr_get(sl_${arrName},`));
                if (allSameArr) {
                  const i32Body = acaeBodyWithDirectGetsSets(bodyCode, [arrName], 'i32');
                  const i64Body = acaeBodyWithDirectGetsSets(bodyCode, [arrName], 'i64');
                  const i32Decls = acaeI32RestrictDecls([arrName]);
                  if (allowLoopOmpParallel()) {
                    ompParallelSuppress++;
                    const bodySimd = genLoopBody();
                    ompParallelSuppress--;
                    const i32Simd = acaeBodyWithDirectGetsSets(bodySimd, [arrName], 'i32');
                    const i64Simd = acaeBodyWithDirectGetsSets(bodySimd, [arrName], 'i64');
                    const pt = slParallelThreshold(i32Simd);
                    const redVar = slDetectReductionVar(bodySimd);
                    if (redVar) {
                      const encBody = `if (SL_LIKELY(_enc == SL_ENC_I32)) { ${i32Simd}; } else if (_enc == SL_ENC_I64) { ${i64Simd}; } else { ${bodySimd}; }`;
                      acaeNote(`for-in range line ${stmt.line ?? '?'}: ENC+OpenMP parallel+simd on sl_${arrName} (reduction ${redVar})`);
                      return `${pad}#pragma omp parallel reduction(+:${redVar}) if(sl_n > ${pt})\n${pad}{\n${pad}    int _enc = sl_${arrName}->encoding;\n${pad}    #pragma omp for simd schedule(static)\n${pad}    for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${pad}        ${encBody}\n${pad}    }\n${pad}}`;
                    }
                  }
                  acaeNote(`for-in range line ${stmt.line ?? '?'}: encoding-dispatch SIMD on sl_${arrName} (no parallel region: ${!allowLoopOmpParallel() ? 'parallel off' : 'no reduction var'})`);
                  return `${pad}{ int _enc = sl_${arrName}->encoding;\n${pad}  if (SL_LIKELY(_enc == SL_ENC_I32)) {\n${pad}    ${i32Decls}\n${pad}  #pragma omp simd\n${pad}    for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${pad}      ${i32Body}\n${pad}    }\n${pad}  }\n${pad}  else if (_enc == SL_ENC_I64) {\n${pad}  #pragma omp simd\n${pad}    for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${pad}      ${i64Body}\n${pad}    }\n${pad}  }\n${pad}  else {\n${pad}    for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${bodyCode}\n${pad}    }\n${pad}  }\n${pad}}`;
                }
              }
              if (allowLoopOmpParallel() && !rangeHasPush &&
                  !ACAE_BAD_OMP.test(bodyCode)) {
                ompParallelSuppress++;
                const bodySimd = genLoopBody();
                ompParallelSuppress--;
                const pt = slParallelThreshold(bodySimd);
                const redVar = slDetectReductionVar(bodySimd);
                if (redVar) {
                  const redClause = ` reduction(+:${redVar})`;
                  acaeNote(`for-in range line ${stmt.line ?? '?'}: OpenMP parallel-for-simd (no encoding dispatch) reduction ${redVar}`);
                  return `${pad}#pragma omp parallel for simd schedule(static)${redClause} if(sl_n > ${pt})\n${pad}for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${bodySimd}\n${pad}}`;
                }
              }
              const reasons: string[] = [];
              let multiArrGet = false;
              if (rangeGetMatches && !rangeHasPush && rangeGetMatches.length > 0) {
                const an0 = rangeGetMatches[0].match(/sl_arr_get\(sl_(\w+),/)![1];
                multiArrGet = !rangeGetMatches.every((m: string) => m.includes(`sl_arr_get(sl_${an0},`));
              }
              if (multiArrGet && !rangeHasPush && !rangeUnsafeSet && !/SL_ENC_I32|SL_ENC_I64/.test(bodyCode)) {
                const uniqueArrs = [...new Set(rangeGetMatches!.map((m: string) => m.match(/sl_arr_get\(sl_(\w+),/)![1]))] as string[];
                if (uniqueArrs.length >= 1 && uniqueArrs.length <= 8) {
                  const shareEnc = acaeArraysShareEncodingExpr(uniqueArrs);
                  const i32Body = acaeBodyWithDirectGetsSets(bodyCode, uniqueArrs, 'i32');
                  const i64Body = acaeBodyWithDirectGetsSets(bodyCode, uniqueArrs, 'i64');
                  const i32Decls = acaeI32RestrictDecls(uniqueArrs);
                  acaeNote(`for-in range line ${stmt.line ?? '?'}: multi-array encoding-dispatch SIMD on [${uniqueArrs.map((a: string) => 'sl_' + a).join(', ')}] (+ set_int peel)`);
                  return `${pad}{ int _enc = sl_${uniqueArrs[0]}->encoding;\n${pad}  if (${shareEnc}) {\n${pad}  if (SL_LIKELY(_enc == SL_ENC_I32)) {\n${pad}    ${i32Decls}\n${pad}  #pragma omp simd\n${pad}    for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${pad}      ${i32Body}\n${pad}    }\n${pad}  }\n${pad}  else if (_enc == SL_ENC_I64) {\n${pad}  #pragma omp simd\n${pad}    for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${pad}      ${i64Body}\n${pad}    }\n${pad}  }\n${pad}  else {\n${pad}    for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${bodyCode}\n${pad}    }\n${pad}  }\n${pad}} else {\n${pad}    for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${bodyCode}\n${pad}    }\n${pad}}\n${pad}}`;
                }
              }
              if (rangeHasPush) reasons.push('body uses sl_arr_push');
              else if (!rangeGetMatches || rangeGetMatches.length === 0) reasons.push('no sl_arr_get(sl_*, idx) pattern');
              else if (multiArrGet) reasons.push('sl_arr_get targets too many arrays (>8)');
              else if (ACAE_BAD_OMP.test(bodyCode)) reasons.push('body has I/O or mutating calls blocked for OpenMP');
              else if (!slDetectReductionVar(genLoopBody())) reasons.push('no scalar reduction detected for parallel-for');
              else if (!allowLoopOmpParallel()) reasons.push('parallel disabled or suppressed');
              else reasons.push('generic scalar loop');
              acaeNote(`for-in range line ${stmt.line ?? '?'}: ${reasons.join('; ')}`);
              return `${pad}for (long long sl_${keyVar} = ${startExpr}; sl_${keyVar} < ${endExpr}; sl_${keyVar}++) {\n${bodyCode}\n${pad}}`;
            }
            const rangeCode = `sl_arr_range(${rangeArgs.join(', ')})`;
            return `${pad}{ SlArray* _range = ${rangeCode}; for (int _i = 0; _i < _range->len; _i++) {\n${pad}    long long sl_${keyVar} = sl_arr_get(_range, _i);\n${bodyCode}\n${pad}} }`;
          }
          if (callName === 'rangeRev') {
            const rrArgs = (iterExpr.arguments || iterExpr.args || []).map((a: any) => cExpr(a));
            if (rrArgs.length === 1) {
              const n = rrArgs[0];
              return `${pad}for (long long sl_${keyVar} = (${n}) - 1; sl_${keyVar} >= 0; sl_${keyVar}--) {\n${bodyCode}\n${pad}}`;
            }
            if (rrArgs.length === 2) {
              const hi = rrArgs[0];
              const lo = rrArgs[1];
              return `${pad}for (long long sl_${keyVar} = (${hi}) - 1; sl_${keyVar} >= (${lo}); sl_${keyVar}--) {\n${bodyCode}\n${pad}}`;
            }
            if (rrArgs.length === 0) {
              return `${pad}{/* empty rangeRev */ }`;
            }
            const rrStep = rrArgs.length >= 3 ? rrArgs[2] : '1';
            const rrCode = rrArgs.length === 1
              ? `sl_arr_range((${rrArgs[0]}) - 1, -1, -(${rrStep}))`
              : `sl_arr_range((${rrArgs[0]}) - 1, (${rrArgs[1]}) - 1, -(${rrStep}))`;
            return `${pad}{ SlArray* _range = ${rrCode}; for (int _i = 0; _i < _range->len; _i++) {\n${pad}    long long sl_${keyVar} = sl_arr_get(_range, _i);\n${bodyCode}\n${pad}} }`;
          }
        }
        const iterCode = cExpr(iterExpr);
        const iterType = exprType(iterExpr);
        if (iterType === 'SlArray*') {
          const keyVarType = varType(keyVar);
          let elemDecl: string;
          let elemAccess: string;
          if (keyVarType === 'SlMap*') {
            elemDecl = 'SlMap*'; elemAccess = `sl_arr_getval(${iterCode}, _i).mval`;
          } else if (keyVarType === 'char*') {
            elemDecl = 'char*'; elemAccess = `sl_arr_getval(${iterCode}, _i).sval`;
          } else if (keyVarType === 'SlArray*') {
            elemDecl = 'SlArray*'; elemAccess = `sl_arr_getval(${iterCode}, _i).aval`;
          } else if (keyVarType === 'double') {
            elemDecl = 'double'; elemAccess = `sl_arr_getval(${iterCode}, _i).dval`;
          } else {
            elemDecl = 'long long'; elemAccess = `sl_arr_get(${iterCode}, _i)`;
          }
          return `${pad}for (int _i = 0; _i < ${iterCode}->len; _i++) {\n${pad}    ${elemDecl} sl_${keyVar} = ${elemAccess};\n${bodyCode}\n${pad}}`;
        }
        if (iterType === 'SlMap*') {
          return `${pad}{ SlArray* _keys = sl_map_keys(${iterCode}); for (int _i = 0; _i < _keys->len; _i++) {\n${pad}    char* sl_${keyVar} = sl_arr_getval(_keys, _i).sval;\n${bodyCode}\n${pad}} sl_release_arr(_keys); }`;
        }
        if (iterType === 'char*') {
          return `${pad}for (int _i = 0; _i < (int)strlen(${iterCode}); _i++) {\n${pad}    char* sl_${keyVar} = sl_str_charAt(${iterCode}, (long long)_i);\n${bodyCode}\n${pad}}`;
        }
        return `${pad}for (long long _i = 0; _i < (long long)${iterCode}; _i++) {\n${pad}    long long sl_${keyVar} = _i;\n${bodyCode}\n${pad}}`;
      }
      case 'For':
      case 'ForStmt':
      case 'ForStatement': {
        const forExpr = (node: any): string => {
          if (!node) return '';
          if (node.type === 'Action') return forExpr(node.target);
          if (node.type === 'ExpressionStatement' || node.type === 'ExprStatement') return cExpr(node.expression || node.expr);
          if (node.type === 'Assignment') return cExpr(node);
          const s = cStmt(node, 0).trim().replace(/;$/, '');
          return s;
        };
        const initCode = forExpr(stmt.init);
        const condCode = stmt.condition ? cExpr(stmt.condition) : '1';
        const updateCode = forExpr(stmt.update);
        const body = (stmt.body || []);
        const genForBody = () => body.map((s: any) => cStmt(s, indent + 1)).join('\n');
        const bodyCode = genForBody();
        const pushMatches = bodyCode.match(/sl_arr_push_(int|dbl)\(sl_(\w+),/g);
        if (pushMatches && pushMatches.length > 0) {
          const cond = stmt.condition;
          let loopCount: string | null = null;
          if (cond && (cond.type === 'BinaryOp' || cond.type === 'BinaryExpression' || cond.type === 'Binary')) {
            if (cond.operator === '<') loopCount = cExpr(cond.right);
            else if (cond.operator === '<=') loopCount = `(${cExpr(cond.right)}) + 1`;
          }
          if (loopCount) {
            const arrNames = [...new Set(pushMatches.map((m: string) => m.match(/sl_arr_push_(?:int|dbl)\(sl_(\w+),/)![1]))];
            const hasIntPush = /sl_arr_push_int\(sl_/.test(bodyCode);
            const hasDblPush = /sl_arr_push_dbl\(sl_/.test(bodyCode);
            const ensureLines = arrNames.map(n => {
              if (hasIntPush && !hasDblPush) return `${pad}sl_arr_ensure_enc(sl_${n}, (int)(${loopCount}), sl_val_fits((${loopCount}) - 1));`;
              return `${pad}sl_arr_ensure(sl_${n}, (int)(${loopCount}));`;
            }).join('\n');
            const optimizedBody = bodyCode
              .replace(/sl_arr_push_int\(sl_/g, (hasIntPush && !hasDblPush) ? 'sl_arr_push_int_fast(sl_' : 'sl_arr_push_int_nogrow(sl_')
              .replace(/sl_arr_push_dbl\(sl_/g, 'sl_arr_push_dbl_nogrow(sl_');
            return `${ensureLines}\n${pad}for (${initCode}; ${condCode}; ${updateCode}) {\n${optimizedBody}\n${pad}}`;
          }
        }
        const getMatches = bodyCode.match(/sl_arr_get\(sl_(\w+),/g);
        const hasPushInBody = /sl_arr_push/.test(bodyCode);
        const forUnsafeArrSet = /sl_arr_set\(/.test(bodyCode) || /sl_arr_set_dbl\(/.test(bodyCode) || /sl_arr_set_int\(/.test(bodyCode);
        if (getMatches && !hasPushInBody && !forUnsafeArrSet && getMatches.length > 0) {
          const arrName = getMatches[0].match(/sl_arr_get\(sl_(\w+),/)![1];
          const allSameArr = getMatches.every((m: string) => m.includes(`sl_arr_get(sl_${arrName},`));
          if (allSameArr) {
            const i32Body = acaeBodyWithDirectGetsSets(bodyCode, [arrName], 'i32');
            const i64Body = acaeBodyWithDirectGetsSets(bodyCode, [arrName], 'i64');
            const i32Decls = acaeI32RestrictDecls([arrName]);
            if (allowLoopOmpParallel()) {
              ompParallelSuppress++;
              const bodySimd = genForBody();
              ompParallelSuppress--;
              const i32Simd = acaeBodyWithDirectGetsSets(bodySimd, [arrName], 'i32');
              const i64Simd = acaeBodyWithDirectGetsSets(bodySimd, [arrName], 'i64');
              const pt = slParallelThreshold(i32Simd);
              const redVar = slDetectReductionVar(bodySimd);
              if (redVar) {
                const encBody = `if (SL_LIKELY(_enc == SL_ENC_I32)) { ${i32Simd}; } else if (_enc == SL_ENC_I64) { ${i64Simd}; } else { ${bodySimd}; }`;
                return `${pad}#pragma omp parallel reduction(+:${redVar}) if(sl_n > ${pt})\n${pad}{\n${pad}    int _enc = sl_${arrName}->encoding;\n${pad}    #pragma omp for simd schedule(static)\n${pad}    for (${initCode}; ${condCode}; ${updateCode}) {\n${pad}        ${encBody}\n${pad}    }\n${pad}}`;
              }
            }
            return `${pad}{ int _enc = sl_${arrName}->encoding;\n${pad}  if (SL_LIKELY(_enc == SL_ENC_I32)) {\n${pad}    ${i32Decls}\n${pad}  #pragma omp simd\n${pad}    for (${initCode}; ${condCode}; ${updateCode}) {\n${pad}      ${i32Body}\n${pad}    }\n${pad}  }\n${pad}  else if (_enc == SL_ENC_I64) {\n${pad}  #pragma omp simd\n${pad}    for (${initCode}; ${condCode}; ${updateCode}) {\n${pad}      ${i64Body}\n${pad}    }\n${pad}  }\n${pad}  else {\n${pad}    for (${initCode}; ${condCode}; ${updateCode}) {\n${bodyCode}\n${pad}    }\n${pad}  }\n${pad}}`;
          }
          const uniqueArrs = [...new Set(getMatches.map((m: string) => m.match(/sl_arr_get\(sl_(\w+),/)![1]))] as string[];
          if (uniqueArrs.length >= 1 && uniqueArrs.length <= 8 && !/SL_ENC_I32|SL_ENC_I64/.test(bodyCode)) {
            const shareEnc = acaeArraysShareEncodingExpr(uniqueArrs);
            const i32Body = acaeBodyWithDirectGetsSets(bodyCode, uniqueArrs, 'i32');
            const i64Body = acaeBodyWithDirectGetsSets(bodyCode, uniqueArrs, 'i64');
            const i32Decls = acaeI32RestrictDecls(uniqueArrs);
            acaeNote(`for loop line ${stmt.line ?? '?'}: multi-array encoding-dispatch SIMD on [${uniqueArrs.map((a: string) => 'sl_' + a).join(', ')}] (+ set_int peel)`);
            return `${pad}{ int _enc = sl_${uniqueArrs[0]}->encoding;\n${pad}  if (${shareEnc}) {\n${pad}  if (SL_LIKELY(_enc == SL_ENC_I32)) {\n${pad}    ${i32Decls}\n${pad}  #pragma omp simd\n${pad}    for (${initCode}; ${condCode}; ${updateCode}) {\n${pad}      ${i32Body}\n${pad}    }\n${pad}  }\n${pad}  else if (_enc == SL_ENC_I64) {\n${pad}  #pragma omp simd\n${pad}    for (${initCode}; ${condCode}; ${updateCode}) {\n${pad}      ${i64Body}\n${pad}    }\n${pad}  }\n${pad}  else {\n${pad}    for (${initCode}; ${condCode}; ${updateCode}) {\n${bodyCode}\n${pad}    }\n${pad}  }\n${pad}} else {\n${pad}    for (${initCode}; ${condCode}; ${updateCode}) {\n${bodyCode}\n${pad}    }\n${pad}}\n${pad}}`;
          }
        }
        if (allowLoopOmpParallel() && !hasPushInBody &&
            !ACAE_BAD_OMP.test(bodyCode)) {
          ompParallelSuppress++;
          const bodySimd = genForBody();
          ompParallelSuppress--;
          const pt = slParallelThreshold(bodySimd);
          const redVar = slDetectReductionVar(bodySimd);
          if (redVar) {
            const redClause = ` reduction(+:${redVar})`;
            const ompLoop = `#pragma omp parallel for simd schedule(static)${redClause} if(sl_n > ${pt})\n${pad}for (${initCode}; ${condCode}; ${updateCode}) {\n${bodySimd}\n${pad}}`;
            return ompLoop;
          }
        }
        return `${pad}for (${initCode}; ${condCode}; ${updateCode}) {\n${bodyCode}\n${pad}}`;
      }
      case 'ExprStatement':
      case 'ExpressionStatement': {
        const expr = stmt.expression || stmt.expr;
        return `${pad}${cExpr(expr)};`;
      }
      case 'BinaryOp':
      case 'BinaryExpr': {
        return `${pad}${cExpr(stmt)};`;
      }
      case 'Call':
      case 'FunctionCall': {
        return `${pad}${cExpr(stmt)};`;
      }
      case 'Action': {
        if (stmt.target) {
          const t = stmt.target;
          if (t.type === 'Call' || t.type === 'FunctionCall') {
            return `${pad}${cExpr(t)};`;
          }
          const exprTypes = new Set(['NumberLiteral', 'Number', 'StringLiteral', 'TextLiteral', 'BooleanLiteral', 'Boolean', 'NullLiteral', 'Null', 'Identifier', 'BinaryExpr', 'Binary', 'BinaryOp', 'Member', 'ArrayLiteral', 'ObjectLiteral', 'Object', 'Match', 'LogicalExpr', 'Logical', 'UnaryExpr', 'Unary', 'TernaryExpr', 'NewExpression', 'SuperCallExpression']);
          if (exprTypes.has(t.type)) {
            return `${pad}${cExpr(t)};`;
          }
          return cStmt(t, indent);
        }
        return `${pad}${cExpr(stmt.action)};`;
      }
      case 'Break':
        return `${pad}break;`;
      case 'Continue':
        return `${pad}continue;`;
      case 'Try':
      case 'TryStmt': {
        const tryBody = (stmt.body || []).map((s: any) => cStmt(s, indent + 1)).join('\n');
        const catchClause = stmt.catchClause;
        const finallyBlock = stmt.finallyBlock;
        let code = `${pad}{\n${pad}    int _saved_depth = sl_catch_depth++;\n${pad}    if (setjmp(sl_catch_buf[_saved_depth]) == 0) {\n${tryBody}\n${pad}    } else {\n`;
        if (catchClause) {
          const catchParam = catchClause.param || 'e';
          const catchBody = (catchClause.body || []).map((s: any) => cStmt(s, indent + 2)).join('\n');
          code += `${pad}        long long sl_${catchParam} = sl_exception_val;\n${catchBody}\n`;
        }
        code += `${pad}    }\n${pad}    sl_catch_depth = _saved_depth;\n`;
        if (finallyBlock && finallyBlock.length > 0) {
          const finallyCode = finallyBlock.map((s: any) => cStmt(s, indent + 1)).join('\n');
          code += `${finallyCode}\n`;
        }
        code += `${pad}}`;
        return code;
      }
      case 'Throw':
      case 'ThrowStmt': {
        const val = cExpr(stmt.value);
        return `${pad}sl_exception_val = ${val}; longjmp(sl_catch_buf[sl_catch_depth - 1], 1);`;
      }
      case 'Switch':
      case 'SwitchStmt': {
        const switchExpr = stmt.expression || stmt.discriminant;
        const switchType = exprType(switchExpr);
        const expr = cExpr(switchExpr);
        const cases = stmt.cases || [];
        if (switchType === 'char*' || switchType === 'double' || switchType === 'SlArray*' || switchType === 'SlMap*') {
          let code = '';
          const matchVar = `_sw_${++_tempIdCounter}`;
          code += `${pad}{ ${switchType} ${matchVar} = ${expr};\n`;
          for (const c of cases) {
            const caseVal = cExpr(c.value);
            const caseBody = (c.body || []).map((s: any) => cStmt(s, indent + 1)).join('\n');
            if (switchType === 'char*') {
              code += `${pad}    if (sl_str_eq(${matchVar}, ${caseVal})) {\n${caseBody}\n${pad}    }\n`;
            } else if (switchType === 'double') {
              code += `${pad}    if (${matchVar} == ${caseVal}) {\n${caseBody}\n${pad}    }\n`;
            } else {
              code += `${pad}    if (${matchVar} == ${caseVal}) {\n${caseBody}\n${pad}    }\n`;
            }
          }
          const defaultCase = stmt.defaultCase;
          if (defaultCase && (Array.isArray(defaultCase) ? defaultCase.length > 0 : defaultCase?.body)) {
            const defaultBody = (Array.isArray(defaultCase) ? defaultCase : defaultCase.body || []).map((s: any) => cStmt(s, indent + 1)).join('\n');
            code += `${pad}    else {\n${defaultBody}\n${pad}    }\n`;
          }
          code += `${pad}}`;
          return code;
        }
        let code = `${pad}switch (${expr}) {\n`;
        for (const c of cases) {
          const caseVal = cExpr(c.value);
          const caseBody = (c.body || []).map((s: any) => cStmt(s, indent + 1)).join('\n');
          code += `${pad}    case ${caseVal}:\n${caseBody}\n${pad}        break;\n`;
        }
        const defaultCase = stmt.defaultCase;
        if (defaultCase && (Array.isArray(defaultCase) ? defaultCase.length > 0 : defaultCase?.body)) {
          const defaultBody = (Array.isArray(defaultCase) ? defaultCase : defaultCase.body || []).map((s: any) => cStmt(s, indent + 1)).join('\n');
          code += `${pad}    default:\n${defaultBody}\n${pad}        break;\n`;
        }
        code += `${pad}}`;
        return code;
      }
      case 'MacroDef': {
        const mName = stmt.name || 'macro';
        const mParams = stmt.params || [];
        const mBody = stmt.body || [];
        const mParamDecls = mParams.map((p: string) => `long long sl_${p}`);
        const { locals: mLocals, initExprs: mInitExprs } = collectLocalVars(mBody, mParams, new Set());
        const mLocalVarDecls: string[] = [];
        for (const vname of mLocals) {
          if (mParams.includes(vname)) continue;
          const init = mInitExprs.get(vname);
          const et = init ? exprType(init) : 'long long';
          const vt: string = et === 'char*' ? 'char*' : et === 'SlArray*' ? 'SlArray*' : et === 'SlMap*' ? 'SlMap*' : et === 'SlClosure' ? 'SlClosure' : et === 'SlClosure2' ? 'SlClosure2' : et === 'double' ? 'double' : 'long long';
          const isSimple = init && (init.type === 'NumberLiteral' || init.type === 'Number' ||
                           init.type === 'BooleanLiteral' || init.type === 'Boolean' ||
                           init.type === 'NullLiteral' || init.type === 'Null');
          if (isSimple) {
            mLocalVarDecls.push(`    ${vt} sl_${vname} = ${cExpr(init)};`);
          } else if (vt === 'SlClosure' || vt === 'SlClosure2') {
            mLocalVarDecls.push(`    ${vt} sl_${vname};`);
          } else {
            mLocalVarDecls.push(`    ${vt} sl_${vname} = 0;`);
          }
        }
        const mVarDeclCode = mLocalVarDecls.length > 0 ? mLocalVarDecls.join('\n') + '\n' : '';
        const savedFuncName = currentFuncName;
        const savedFuncParams = currentFuncParams;
        currentFuncName = `macro_${mName}`;
        currentFuncParams = mParams;
        const mBodyCode = mBody.map((s: any) => cStmt(s, 1)).join('\n');
        currentFuncName = savedFuncName;
        currentFuncParams = savedFuncParams;
        const mHasReturn = mBody.some((s: any) => s.type === 'Return' || s.type === 'ReturnStatement');
        if (mHasReturn) {
          funcDefs.push(`static long long sl_macro_${mName}(${mParamDecls.join(', ')}) {\n${mVarDeclCode}${mBodyCode}\n    return 0;\n}`);
        } else {
          funcDefs.push(`static void sl_macro_${mName}(${mParamDecls.join(', ')}) {\n${mVarDeclCode}${mBodyCode}\n}`);
        }
        macroDefs.set(mName, { params: mParams, hasReturn: mHasReturn });
        return '';
      }
      case 'ProcMacroDef':
        clcWarnings.push(`ProcMacroDef '${stmt.name}' not supported in CLC; procedural macros require AST-level code execution`);
        return '';
      default: {
        const line = stmt.line || '?';
        const hint = CLC_STMT_UNSUPPORTED_HINTS[stmt.type] || 'this feature is not yet implemented in the C backend';
        clcWarnings.push(`cStmt: unsupported statement type '${stmt.type}' at line ${line}: ${hint}`);
        return '';
      }
    }
  }

  const clcTopStatements = fuseConsecutiveForInRangeLoops(program.statements.slice());
  for (const stmt of clcTopStatements) {
    const code = cStmt(stmt, 1);
    if (code) topStmts.push(code);
  }

  // Gather effectively-const globals from varDecls (simple number-literals).
  const topConstPending = new Map<string, string>();
  {
    const seen = new Map<string, number>();
    for (const vd of varDecls) {
      // Match: "long long sl_W = 640;" or "int sl_H = 480;"
      const m = vd.match(/^(long long|int|double|char\*?) sl_(\w+) = (-?\d+);$/);
      if (m) {
        seen.set(m[2], (seen.get(m[2]) || 0) + 1);
        topConstPending.set(m[2], m[3]);
      }
    }
    const knownMutable = new Set(['frame','collisions','instFps','smoothFps',
      'lastPerfMs','nowMs','dtm','inst','diag','fpsMin','fpsMax','fpsSum',
      'fpsSamples','benchRngState','ep','sh','result',
      'i','j','k','r','x','y','cx','cy','cr','dx','dy','d2','md','sx','sy',
      'xx','yy','px','py','bb','gg','rr','gstep','idx','fn','n','val']);
    for (const name of new Set(topConstPending.keys())) {
      if (knownMutable.has(name) || (seen.get(name) || 0) > 1 || !topLocals.has(name)) {
        topConstPending.delete(name);
      }
    }
    clcWarnings.push(`CONST: pending=${topConstPending.size} vdCount=${varDecls.length}`);
  }

  if (options.parallel && topStmts.length > 1) {
    const isParallelEntry = (s: string) =>
      s.includes('#pragma omp parallel for') ||
      (s.match(/^\s*#pragma omp parallel\b/) && !s.includes('#pragma omp parallel for'));
    const extractParallelInfo = (s: string) => {
      const reductions: string[] = [];
      let ifClause = '';
      const pragmaLine = s.split('\n').find((l: string) => l.includes('#pragma omp parallel'));
      if (pragmaLine) {
        const redMatch = pragmaLine.match(/reduction\(([^)]+)\)/);
        if (redMatch) {
          for (const r of redMatch[1].split(',')) {
            const trimmed = r.trim();
            if (!reductions.includes(trimmed)) reductions.push(trimmed);
          }
        }
        const ifMatch = pragmaLine.match(/if\(([^)]+)\)/);
        if (ifMatch) ifClause = ifMatch[1];
      }
      let innerContent: string;
      if (s.includes('#pragma omp parallel for')) {
        innerContent = s
          .replace(/#pragma omp parallel for\s*/, '')
          .replace(/reduction\([^)]+\)\s*/g, '')
          .replace(/if\([^)]+\)\s*/g, '')
          .trim();
        return { type: 'parallel-for' as const, reductions, ifClause, innerContent };
      }
      const lines = s.split('\n');
      let braceCount = 0;
      let startIdx = -1;
      let endIdx = -1;
      for (let li = 0; li < lines.length; li++) {
        for (const ch of lines[li]) {
          if (ch === '{') { braceCount++; if (startIdx === -1) startIdx = li; }
          if (ch === '}') { braceCount--; if (braceCount === 0) { endIdx = li; break; } }
        }
        if (endIdx !== -1) break;
      }
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx + 1) {
        const innerLines = lines.slice(startIdx + 1, endIdx);
        innerContent = innerLines.join('\n').replace(/^    /gm, '');
        return { type: 'parallel-region' as const, reductions, ifClause, innerContent };
      }
      return null;
    };
    const merged: string[] = [];
    let i = 0;
    while (i < topStmts.length) {
      const stmt = topStmts[i];
      if (isParallelEntry(stmt)) {
        const group: string[] = [stmt];
        let j = i + 1;
        while (j < topStmts.length && isParallelEntry(topStmts[j])) {
          group.push(topStmts[j]);
          j++;
        }
        if (group.length >= 2) {
          const allInfo = group.map(extractParallelInfo).filter((x): x is NonNullable<typeof x> => x !== null);
          if (allInfo.length === group.length) {
            const reductions: string[] = [];
            let ifClause = '';
            for (const info of allInfo) {
              for (const r of info.reductions) {
                if (!reductions.includes(r)) reductions.push(r);
              }
              if (!ifClause && info.ifClause) ifClause = info.ifClause;
            }
            const mergedPragma = '#pragma omp parallel' +
              (reductions.length > 0 ? ` reduction(${reductions.join(',')})` : '') +
              (ifClause ? ` if(${ifClause})` : '');
            merged.push(mergedPragma);
            merged.push('    {');
            for (let g = 0; g < allInfo.length; g++) {
              const info = allInfo[g];
              const isLast = g === allInfo.length - 1;
              const encSuffix = allInfo.length > 1 ? `_enc${g}` : '_enc';
              if (info.type === 'parallel-for') {
                const ompFor = isLast ? '        #pragma omp for' : '        #pragma omp for nowait';
                const indentedLoop = info.innerContent.split('\n').map((l: string) => '        ' + l).join('\n');
                merged.push(ompFor);
                merged.push(indentedLoop);
              } else {
                const innerLines = info.innerContent.split('\n');
                for (let li = 0; li < innerLines.length; li++) {
                  let line = innerLines[li];
                  if (allInfo.length > 1) {
                    line = line.replace(/\b_enc\b/g, encSuffix);
                  }
                  if (line.trim() === '#pragma omp for' || line.trim() === `#pragma omp for`) {
                    if (!isLast && !line.includes('nowait')) {
                      line = line.replace('#pragma omp for', '#pragma omp for nowait');
                    }
                  }
                  merged.push('        ' + line);
                }
              }
            }
            merged.push('    }');
            i = j;
            continue;
          }
        }
      }
      merged.push(stmt);
      i++;
    }
    topStmts.length = 0;
    topStmts.push(...merged);
  }

  const hasPrint = program.statements.some((s: any) => {
    if (s.type === 'Action' && s.target?.type === 'Call') {
      const callee = s.target.callee;
      return callee?.name === 'print' || callee === 'print';
    }
    return false;
  });
  const hasResult = topLocals.has('result') && !hasPrint;
  const needsRuntime = arrayVars.size > 0 || stringVars.size > 0 ||
    program.statements.some((s: any) => {
      const src = JSON.stringify(s);
      if (src.includes('"ArrayLiteral"') || src.includes('"Member"') || src.includes('"TextLiteral"') || src.includes('"StringLiteral"')) return true;
      const builtinNames = ['len','push','pop','shift','map','filter','reduce','range','rangeRev','reverse','sort','indexOf','includes','join','slice','concat','unique','find','findIndex','every','some','forEach','flat','fill','sum','avg','upper','lower','trim','replace','substring','split','charAt','startsWith','endsWith','repeat','strIndexOf','strIncludes','strLen','toString','str','num','type','typeof','keys','values','has','min','max','clamp'];
      for (const bn of builtinNames) { if (src.includes(`"${bn}"`)) return true; }
      return false;
    });

  const globalVarDecls: string[] = [];
  const globalVarInits: string[] = [];
  const localVarInMain: string[] = [];
  const needsGlobal = new Set<string>();
  for (const n of funcReferencedTopVars) needsGlobal.add(n);
  for (const n of capturedTopVars) needsGlobal.add(n);
  for (const vd of varDecls) {
    const trimmed = vd.trim();
    const isFuncCall = /^(sl_map_set|sl_arr_push|sl_arr_set|printf|sl_str_append)\b/.test(trimmed);
    if (isFuncCall) {
      globalVarInits.push('    ' + trimmed);
      continue;
    }
    const eqIdx = vd.indexOf('=');
    if (eqIdx >= 0) {
      const declPart = vd.substring(0, eqIdx).trim();
      const initPart = vd.substring(eqIdx + 1).trim();
      const typeEnd = declPart.indexOf(' sl_');
      const varName = typeEnd >= 0 ? declPart.substring(typeEnd + 1) : '';
      const isSimpleType = /^(long long|double|int|char|Sl\w+\*)\b/.test(declPart);
      if (varName && isSimpleType && !needsGlobal.has(varName.replace(/^sl_/, ''))) {
        localVarInMain.push('    ' + vd + ';');
      } else if (typeEnd >= 0) {
        globalVarDecls.push(declPart + ';');
        globalVarInits.push('    ' + varName + ' = ' + initPart + ';');
      } else {
        globalVarDecls.push(vd + ';');
      }
    } else {
      globalVarDecls.push(vd + ';');
    }
  }

  // Apply const promotion: rewrite globalVarDecls and remove assignments from topStmts
  if (topConstPending.size > 0) {
    // Second pass: remove any variable that gets reassigned in topStmts
    for (const stmt of topStmts) {
      for (const name of new Set(topConstPending.keys())) {
        const re = new RegExp(`\\bsl_${name}\\s*=\\s*(?!${topConstPending.get(name)};).`);
        if (re.test(stmt)) {
          topConstPending.delete(name);
        }
      }
    }
    // Also check function bodies for reassignment
    const allFuncCode = funcDefs.join('\n');
    for (const name of new Set(topConstPending.keys())) {
      const re = new RegExp(`\\bsl_${name}\\s*=\\s*(?!${topConstPending.get(name)};).`);
      if (re.test(allFuncCode)) {
        topConstPending.delete(name);
      }
    }
    clcWarnings.push(`CONST: promoted ${topConstPending.size} globals to const`);
    for (const [name, val] of topConstPending) {
      const ctype = varType(name);
      for (let i = 0; i < globalVarDecls.length; i++) {
        const vd = globalVarDecls[i];
        if (vd.match(new RegExp(`^(const )?${ctype.replace(/\*/g, '\\*')} sl_${name};`))) {
          globalVarDecls[i] = `const ${ctype} sl_${name} = ${val};`;
          break;
        }
      }
      for (let i = globalVarInits.length - 1; i >= 0; i--) {
        if (globalVarInits[i].match(new RegExp(`sl_${name} =`))) {
          globalVarInits.splice(i, 1);
        }
      }
    }
    // Remove promoted assignments from topStmts (handles merged lines from parallel opt)
    for (let i = topStmts.length - 1; i >= 0; i--) {
      let line = topStmts[i];
      for (const [name] of topConstPending) {
        line = line.replace(new RegExp(`sl_${name}\\s*=\\s*-?\\d+;;`, 'g'), '').replace(/[ \t]{2,}/g, ' ').trim();
      }
      if (line.length === 0) {
        topStmts.splice(i, 1);
      } else {
        topStmts[i] = '    ' + line;
      }
    }
  }

  const topVarTypes = new Map<string, string>();
  for (const v of topLocals) {
    topVarTypes.set(v, varType(v));
  }

  const clcWinGui = options.clcSubsystem === 'windows';
  const mainEntryOpen = clcWinGui
    ? 'int sl_user_main(int argc, char* argv[]) {'
    : 'int main(int argc, char* argv[]) {';

  const cCode = [
    clcWarnings.length > 0 ? `/* CLC WARNINGS:\n${clcWarnings.map(w => ` *   ${w}`).join('\n')}\n */` : '',
    acaeDiag.length > 0 ? `/* ACAE diagnostics (compile-time):\n${acaeDiag.map(d => ` *   ${d}`).join('\n')}\n */` : '',
    clcWinGui
      ? '/* CLC Win32 GUI: sl_win32_rt.c; win32.pollEvents/perfMillis/envInt/setWindowTitle/setWindowTitleFmt/setWindowTitleStats/present/setPixel/width/height/clear/fillSpan/fillRect/fillCircle/drawText/drawInt/clusterBegin/clusterAddSpan/clusterAddRect/clusterAddCircle/clusterFlush/isKeyDown/mouseX/mouseY/isMouseDown/mouseWheel/VK_* */'
      : '',
    '#include <stdio.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    needsRuntime ? '#include <stdint.h>' : '',
    '#include <math.h>',
    '#include <time.h>',
    '#include <sys/stat.h>',
    options.parallel ? '#include <omp.h>' : '',
    options.gpu ? '#define SL_GPU' : '',
    options.cuda ? '#define SL_CUDA' : '',
    '#ifdef _WIN32',
    '#include <direct.h>',
    clcWinGui ? '#include <stdint.h>' : '',
    clcWinGui ? 'void sl_win32_present(void);' : '',
    clcWinGui ? 'uint32_t *sl_win32_pixel_buffer(int *out_w, int *out_h);' : '',
    clcWinGui ? 'int sl_win32_poll_events(void);' : '',
    clcWinGui ? 'long long sl_win32_perf_millis(void);' : '',
    clcWinGui ? 'long long sl_win32_env_int(const char *key, long long default_val);' : '',
    clcWinGui
      ? 'void sl_win32_set_window_title_stats(long long n, long long fps, long long coll, long long diag, long long fr);'
      : '',
    clcWinGui ? 'void sl_win32_clear(uint32_t color);' : '',
    clcWinGui ? 'void sl_win32_fill_span(int x, int y, int w, uint32_t color);' : '',
    clcWinGui ? 'void sl_win32_fill_rect(int x, int y, int w, int h, uint32_t color);' : '',
    clcWinGui ? 'void sl_win32_fill_circle(int cx, int cy, int r, uint32_t color);' : '',
    clcWinGui ? 'void sl_win32_draw_text(int x, int y, uint32_t color, const char *text);' : '',
    clcWinGui ? 'void sl_win32_draw_int(int x, int y, uint32_t color, long long value);' : '',
    clcWinGui ? 'extern uint32_t *sl_win32_fb_pixels;' : '',
    clcWinGui ? 'extern int sl_win32_fb_w;' : '',
    clcWinGui ? 'extern int sl_win32_fb_h;' : '',
    clcWinGui ? 'static inline void sl_win32_set_pixel_unsafe(int x, int y, uint32_t c) { sl_win32_fb_pixels[y * (unsigned)sl_win32_fb_w + x] = c; }' : '',
    clcWinGui ? 'void sl_cluster_begin(void);' : '',
    clcWinGui ? 'void sl_cluster_begin_direct(void);' : '',
    clcWinGui ? 'void sl_cluster_add_span(int y, int x_start, int x_end, uint32_t color);' : '',
    clcWinGui ? 'void sl_cluster_add_rect(int x, int y, int w, int h, uint32_t color);' : '',
    clcWinGui ? 'void sl_cluster_add_circle(int cx, int cy, int r, uint32_t color);' : '',
    clcWinGui ? 'void sl_cluster_flush(void);' : '',
    clcWinGui ? 'void sl_dirty_begin(void);' : '',
    clcWinGui ? 'void sl_dirty_end(void);' : '',
    clcWinGui ? 'void sl_win32_clear_dirty(uint32_t color);' : '',
    clcWinGui ? 'int sl_win32_is_key_down(int vk);' : '',
    clcWinGui ? 'int sl_win32_mouse_x(void);' : '',
    clcWinGui ? 'int sl_win32_mouse_y(void);' : '',
    clcWinGui ? 'int sl_win32_is_mouse_down(int button);' : '',
    clcWinGui ? 'int sl_win32_mouse_wheel(void);' : '',
    clcWinGui ? '#define SL_VK_LEFT    0x25' : '',
    clcWinGui ? '#define SL_VK_UP      0x26' : '',
    clcWinGui ? '#define SL_VK_RIGHT   0x27' : '',
    clcWinGui ? '#define SL_VK_DOWN    0x28' : '',
    clcWinGui ? '#define SL_VK_SPACE   0x20' : '',
    clcWinGui ? '#define SL_VK_RETURN  0x0D' : '',
    clcWinGui ? '#define SL_VK_ESCAPE  0x1B' : '',
    clcWinGui ? '#define SL_VK_TAB     0x09' : '',
    clcWinGui ? '#define SL_VK_SHIFT   0x10' : '',
    clcWinGui ? '#define SL_VK_CONTROL 0x11' : '',
    clcWinGui ? '#define SL_VK_MENU    0x12' : '',
    clcWinGui ? '#define SL_VK_BACK    0x08' : '',
    clcWinGui ? '#define SL_VK_DELETE  0x2E' : '',
    clcWinGui ? '#define SL_VK_A       0x41' : '',
    clcWinGui ? '#define SL_VK_B       0x42' : '',
    clcWinGui ? '#define SL_VK_C       0x43' : '',
    clcWinGui ? '#define SL_VK_D       0x44' : '',
    clcWinGui ? '#define SL_VK_E       0x45' : '',
    clcWinGui ? '#define SL_VK_F       0x46' : '',
    clcWinGui ? '#define SL_VK_G       0x47' : '',
    clcWinGui ? '#define SL_VK_H       0x48' : '',
    clcWinGui ? '#define SL_VK_I       0x49' : '',
    clcWinGui ? '#define SL_VK_J       0x4A' : '',
    clcWinGui ? '#define SL_VK_K       0x4B' : '',
    clcWinGui ? '#define SL_VK_L       0x4C' : '',
    clcWinGui ? '#define SL_VK_M       0x4D' : '',
    clcWinGui ? '#define SL_VK_N       0x4E' : '',
    clcWinGui ? '#define SL_VK_O       0x4F' : '',
    clcWinGui ? '#define SL_VK_P       0x50' : '',
    clcWinGui ? '#define SL_VK_Q       0x51' : '',
    clcWinGui ? '#define SL_VK_R       0x52' : '',
    clcWinGui ? '#define SL_VK_S       0x53' : '',
    clcWinGui ? '#define SL_VK_T       0x54' : '',
    clcWinGui ? '#define SL_VK_U       0x55' : '',
    clcWinGui ? '#define SL_VK_V       0x56' : '',
    clcWinGui ? '#define SL_VK_W       0x57' : '',
    clcWinGui ? '#define SL_VK_X       0x58' : '',
    clcWinGui ? '#define SL_VK_Y       0x59' : '',
    clcWinGui ? '#define SL_VK_Z       0x5A' : '',
    clcWinGui ? '#define SL_VK_0       0x30' : '',
    clcWinGui ? '#define SL_VK_1       0x31' : '',
    clcWinGui ? '#define SL_VK_2       0x32' : '',
    clcWinGui ? '#define SL_VK_3       0x33' : '',
    clcWinGui ? '#define SL_VK_4       0x34' : '',
    clcWinGui ? '#define SL_VK_5       0x35' : '',
    clcWinGui ? '#define SL_VK_6       0x36' : '',
    clcWinGui ? '#define SL_VK_7       0x37' : '',
    clcWinGui ? '#define SL_VK_8       0x38' : '',
    clcWinGui ? '#define SL_VK_9       0x39' : '',
    '#endif',
    needsRuntime ? SL_RUNTIME : '',
    '',
    ...classStructDefs,
    '',
    ...globalVarDecls.map(v => v),
    '',
    ...funcDefs.map((fd: string) => {
      const m = fd.match(/^(static\s+inline\s+)?((?:const\s+)?(?:unsigned\s+)?(?:long\s+long|long long|SlMap\*|SlArray\*|SlSet\*|SlClosure2?|char\*|double|void|int|long|float|bool|_Bool)\s+)sl_(\w+)\s*\(([^)]*)\)\s*\{/);
      if (m) {
        const prefix = m[1] || '';
        const retType = m[2].trim();
        const fname = m[3];
        const params = m[4];
        return `${prefix}${retType} sl_${fname}(${params});`;
      }
      return '';
    }).filter(Boolean),
    '',
    ...funcDefs,
    '',
    mainEntryOpen,
    ...localVarInMain,
    ...globalVarInits,
    ...topStmts,
    hasResult ? '    printf("%lld\\n", (long long)sl_result);' : '',
    genCleanup(topVarTypes),
    '    return 0;',
    '}'
  ].filter(Boolean).join('\n');

  const clcStrict = Boolean(options.clcStrict) || process.env.SEED_CLC_STRICT === '1';
  if (clcStrict && clcWarnings.length > 0) {
    for (const w of clcWarnings) {
      process.stderr.write(`[CLC WARNING] ${w}\n`);
    }
    throw new ClcCompileError([...clcWarnings]);
  }
  if (clcWarnings.length > 0) {
    for (const w of clcWarnings) {
      process.stderr.write(`[CLC WARNING] ${w}\n`);
    }
  }
  if (acaeDiag.length > 0) {
    for (const d of acaeDiag) {
      process.stderr.write(`[ACAE] ${d}\n`);
    }
  }

  return cCode;
}

/** Host V8 JIT: unset or SEED_HOST_JIT=1 keeps TurboFan tiers; SEED_HOST_JIT=0 re-execs with --jitless.
 *  Legacy: SEED_ALLOW_JIT_OUTSIDE_VM=1 forces host JIT even if SEED_HOST_JIT=0.
 *  Own interpreter JIT: SEED_INTERP_JIT (default on; SEED_INTERP_JIT=0 off).
 */
function applyHostJitProfile(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--vm')) return;
  if (process.execArgv.includes('--jitless')) return;

  const hostJitOff = process.env.SEED_HOST_JIT === '0';
  const legacyHostJitOn = process.env.SEED_ALLOW_JIT_OUTSIDE_VM === '1';
  if (!hostJitOff || legacyHostJitOn) return;

  const childExecArgv = [...process.execArgv];
  if (!childExecArgv.includes('--jitless')) childExecArgv.push('--jitless');
  const spawnArgs = childExecArgv.concat(process.argv.slice(1));
  const r = spawnSync(process.execPath, spawnArgs, { stdio: 'inherit', env: process.env });
  process.exit(typeof r.status === 'number' ? r.status : 1);
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.startRepl) {
    void startRepl();
    return;
  }
  if (parsed.startDebugger) {
    const { createDebugREPL } = require('./core/debugger');
    createDebugREPL();
    return;
  }

  const { mode, filePath, evalCode, options } = parsed;

  if (options.watch && filePath) {
    watchFile(filePath, mode, options);
    return;
  }

  if (evalCode) {
    await runEval(evalCode, options);
    return;
  }

  if (!filePath) {
    printUsage();
    return;
  }

  const seedPath = filePath;

  const readSourceOrExit = (): string => {
    if (!fs.existsSync(seedPath)) {
      console.error(`Error: File not found: ${seedPath}`);
      process.exit(1);
    }
    return fs.readFileSync(seedPath, 'utf-8');
  };

  const outPath = (fallback: string): string =>
    typeof options.output === 'string' && options.output.length > 0 ? options.output : fallback;

  if (options.compile) {
    const source = readSourceOrExit();
    const compileOpts: Record<string, unknown> = { ...options };
    if (compileOpts.sourceMap && compileOpts.minify) {
      console.warn(
        '[seedlang] --source-map disables --minify so emitted JS lines align with the source map.'
      );
      compileOpts.minify = false;
    }
    const jsCode = compileToJS(source, compileOpts);
    const outputPath = outPath(seedPath.replace(/\.seed$/, '.js'));
    const outDir = path.dirname(outputPath);
    if (outDir && outDir !== '.') {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const jsBasename = path.basename(outputPath);
    const seedBasename = path.basename(seedPath);
    let outJs = jsCode;
    if (compileOpts.sourceMap) {
      const mapBasename = `${jsBasename}.map`;
      const mapJson = buildSeedCompileSourceMap({
        generatedJs: jsCode,
        seedSource: source,
        seedFileBasename: seedBasename,
        outJsBasename: jsBasename,
      });
      fs.writeFileSync(`${outputPath}.map`, mapJson, 'utf-8');
      outJs = appendSourceMappingUrl(jsCode, mapBasename);
    }
    fs.writeFileSync(outputPath, outJs, 'utf-8');
    console.log(`\nCompiled: ${seedPath} -> ${outputPath}`);
    console.log(`   Size: ${(outJs.length / 1024).toFixed(1)}KB`);
    if (compileOpts.sourceMap) {
      console.log(`   Source map: ${outputPath}.map`);
    }
    return;
  }

  if (options.compileC) {
    const source = readSourceOrExit();
    let cCode: string;
    try {
      cCode = compileToC(source, options);
    } catch (e: any) {
      const clcErr =
        e instanceof ClcCompileError
          ? e
          : e && e.name === 'ClcCompileError' && typeof e.exitCode === 'number'
            ? (e as ClcCompileError)
            : null;
      if (clcErr) {
        console.error(String(clcErr.message || clcErr));
        process.exit(clcErr.exitCode);
      }
      console.error(`CLC: ${e?.message || e}`);
      process.exit(1);
    }
    const outputPath = outPath(seedPath.replace(/\.seed$/, '.c'));
    fs.writeFileSync(outputPath, cCode);
    console.log(`\nCompiled: ${seedPath} -> ${outputPath}`);
    console.log(`   Size: ${(cCode.length / 1024).toFixed(1)}KB`);
    const warnMatch = cCode.match(/CLC WARNINGS:\n([\s\S]*?)\*\//);
    if (warnMatch) {
      const warnings = warnMatch[1].replace(/ \*   /g, '  ').trim().split('\n');
      console.log(`   Warnings (${warnings.length}):`);
      for (const w of warnings) console.log(`     ${w.trim()}`);
    }
    const acaeMatch = cCode.match(/ACAE diagnostics \(compile-time\):\n([\s\S]*?)\*\//);
    if (acaeMatch) {
      const lines = acaeMatch[1].replace(/ \*   /g, '  ').trim().split('\n');
      console.log(`   ACAE (${lines.length}):`);
      for (const ln of lines) console.log(`     ${ln.trim()}`);
    }
    const exePath = outputPath.replace(/\.c$/, '.exe');
    runClcNativeCompile(outputPath, exePath, options);
    return;
  }

  if (options.format) {
    const source = readSourceOrExit();
    const formatted = formatCode(source);
    const outputPath = outPath(seedPath);
    fs.writeFileSync(outputPath, formatted);
    console.log(`\nFormatted: ${outputPath}`);
    return;
  }

  if (options.lint) {
    const source = readSourceOrExit();
    const result = lintCode(source);

    console.log('\nLint Results\n');

    if (result.errors.length > 0) {
      console.log('  Errors:');
      result.errors.forEach((e: any) => {
        console.log(`     Line ${e.line}: ${e.message}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log(`  Warnings (${result.warnings.length}):`);
      result.warnings.forEach((w: any) => {
        console.log(`     Line ${w.line}: ${w.message}`);
      });
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log('  No issues found!');
    }

    console.log(`\nStatistics:`);
    console.log(`   Lines: ${result.stats.lines}`);
    console.log(`   Statements: ${result.stats.statements}`);
    console.log(`   Functions: ${result.stats.functions}`);
    return;
  }

  if (options.stats) {
    const source = readSourceOrExit();
    showStats(source);
    return;
  }

  if (options.time) {
    const start = Date.now();
    await runFile(filePath, mode, options);
    const elapsed = Date.now() - start;
    console.log(`\nExecution time: ${elapsed}ms`);
    return;
  }

  await runFile(filePath, mode, options);
}

if (require.main === module) {
  applyHostJitProfile();
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
