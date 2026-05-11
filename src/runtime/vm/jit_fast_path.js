'use strict';

const { OP } = require('./opcodes');
const { HARDENED_ARRAY_MARK, hardenArrayObject } = require('./runtime_safety');
const { OBJECT_SPREAD_MARKER } = require('./shared');

const _BUDGET_CHECK = `if(__b){if(--__bc<=0){__bc=1024;if(__b.remaining<0)throw new Error('__SEED_BUDGET_INSN__');__b.remaining-=1024;if(__b.deadline>0&&(__b.timeSlice-=1024)<=0){__b.timeSlice=4096;if(Date.now()>__b.deadline)throw new Error('__SEED_BUDGET_TIME__');}}}`;

function _precompileLoops(vm, bc) {
    const code = bc.code;
    const consts = bc.consts;
    if (!vm._loopJitCache) vm._loopJitCache = {};
    if (!vm._globalVals) vm._globalVals = new Array(bc.vars.length);
    const builtins = vm.builtins || {};
    const globals = vm.globals || {};
    for (let i = 0; i < bc.vars.length; i++) {
        if (vm._globalVals[i] !== undefined) continue;
        const name = bc.vars[i];
        if (Object.prototype.hasOwnProperty.call(globals, name) && globals[name] !== undefined) {
            vm._globalVals[i] = globals[name];
        } else if (builtins[name] !== undefined) {
            vm._globalVals[i] = builtins[name];
        }
    }
    const len = code.length;
    for (let sip = 0; sip < len; ) {
        if (code[sip] === 65 && (code[sip + 2] === 11 || code[sip + 2] === 105 || code[sip + 2] === 104)) {
            const ci = code[sip + 1];
            const gi = code[sip + 3];
            const f = consts[ci];
            if (f && f.type === 'func' && f._noCapture && (vm._globalVals[gi] === undefined || vm._globalVals[gi] === null)) {
                if (f._cachedClosure && f._cachedClosure._ctx[0] === code) {
                    vm._globalVals[gi] = f._cachedClosure;
                } else {
                    const c = { _type: 'closure', start: f.start, end: f.end, _ctx: [code, consts, bc.vars], _localScopeArr: f._lsa, _localCount: f._localCount, _lsa: f._lsa, _lc: f._localCount, _start: f.start, capturedVars: {}, sharedCaptured: null, _funcRef: f, _isLeaf: f._isLeaf, _cvArr: null, _fr: f, _noCapture: true };
                    if (f._isLeaf && f._noCapture && !f._isSelfRecursive) {
                        const src = vm._compileLeafFunction({ _ctx: [code, consts, bc.vars], _start: f.start, _funcRef: f, _localCount: f._localCount });
                        if (src) c._nativeFnSrc = src;
                    }
                    f._cachedClosure = c;
                    vm._globalVals[gi] = c;
                }
            }
            sip += 4;
        } else if (code[sip] === 60) {
            sip += 2;
        } else if (code[sip] === 102) {
            sip += 3;
        } else if (code[sip] >= 158 && code[sip] <= 161) {
            sip += 2;
        } else if (code[sip] === 155 || code[sip] === 156 || code[sip] === 157) {
            sip += 3;
        } else if (code[sip] === 72) {
            sip += 3;
        } else {
            sip++;
        }
    }
    for (let ip = 0; ip < len; ip++) {
        if (code[ip] !== 96) continue;
        const cacheKey = ip;
        if (vm._loopJitCache[cacheKey] !== undefined) continue;
        const gi = code[ip + 1];
        const ci = code[ip + 2];
        const compiled = vm._compileGlobalLoop(code, consts, ip + 4, gi, ci);
        if (compiled) {
            try {
                const ug = compiled.usedGlobals;
                const ua = compiled.usedArrays;
                const initVals = {};
                let sip = 0;
                while (sip < ip) {
                    if (code[sip] === 102) {
                        initVals[code[sip + 1]] = consts[code[sip + 2]];
                        sip += 3;
                    } else if (code[sip] === 60) {
                        sip += 2;
                    } else if (code[sip] >= 158 && code[sip] <= 161) {
                        sip += 2;
                    } else if (code[sip] === 155 || code[sip] === 156 || code[sip] === 157) {
                        sip += 3;
                    } else if (code[sip] === 72) {
                        sip += 3;
                    } else { sip++; }
                }
                let fullSrc = '';
                for (const idx of ug) {
                    const iv = initVals[idx];
                    if (iv !== undefined) {
                        if (typeof iv === 'string') fullSrc += `var v${idx}="${iv}";`;
                        else fullSrc += `var v${idx}=${iv};`;
                    } else {
                        fullSrc += `var v${idx}=g[${idx}];`;
                    }
                }
                if (ua.length > 0) {
                    fullSrc += `var _n=${consts[ci]};`;
                    for (const a of ua) fullSrc += `if(!Array.isArray(${a}))${a}=new Array(_n);else if(${a}.length<_n)${a}.length=_n;`;
                }
                fullSrc += 'var __bc=1024;';
                const loopInc = compiled.loopInc || 1;
                const loopLimit = consts[ci];
                const loopVarName = `v${gi}`;
                let loopSrc = _BUDGET_CHECK + compiled.bodySrc;
                if (!compiled.isWhileLoop) {
                    const loopVarIncRe = new RegExp('\\b' + loopVarName + '\\+\\+;', 'g');
                    const loopVarAddIncRe = new RegExp('\\b' + loopVarName + '\\+=' + loopInc + ';', 'g');
                    loopSrc = loopSrc.replace(loopVarIncRe, '');
                    loopSrc = loopSrc.replace(loopVarAddIncRe, '');
                }
                if (loopInc === 1 && typeof loopLimit === 'number' && loopLimit >= 8 && !loopSrc.includes('for(') && !loopSrc.includes('if(')) {
                    const loopVarWordRe = new RegExp('\\b' + loopVarName + '\\b');
                    const loopVarWordReGlobal = new RegExp('\\b' + loopVarName + '\\b', 'g');
                    const bodyRefsLoopVar = loopVarWordRe.test(loopSrc);
                    if (compiled.isWhileLoop) {
                        fullSrc += `while(${loopVarName}<${loopLimit}){${loopSrc}}`;
                    } else if (!bodyRefsLoopVar) {
                        let factor = 4;
                        if (loopLimit % 4 !== 0) factor = 2;
                        if (loopLimit % 2 !== 0) factor = 1;
                        if (factor > 1) {
                            const isPushBody = loopSrc.includes('.push(');
                            let unrolledBody;
                            if (isPushBody) {
                                const pushMatch = loopSrc.match(/(\w+)\.push\(([^)]+)\)/);
                                if (pushMatch) {
                                    const arrName = pushMatch[1];
                                    const pushVal = pushMatch[2];
                                    let idxParts = [];
                                    for (let fi = 0; fi < factor; fi++) {
                                        const idxVar = fi === 0 ? loopVarName : (fi === 1 ? loopVarName+'x' : loopVarName + 'x'.repeat(fi));
                                        idxParts.push(`${arrName}[${idxVar}]=${fi === 0 ? pushVal : pushVal.replace(loopVarWordReGlobal, idxVar)}`);
                                    }
                                    let prefix = '';
                                    for (let fi = 1; fi < factor; fi++) {
                                        const idxVar = fi === 1 ? loopVarName+'x' : loopVarName + 'x'.repeat(fi);
                                        prefix += `var ${idxVar}=${loopVarName}+${fi};`;
                                    }
                                    unrolledBody = prefix + idxParts.join(';') + ';';
                                } else {
                                    unrolledBody = loopSrc.repeat(factor);
                                }
                            } else {
                                unrolledBody = loopSrc.repeat(factor);
                            }
                            const newLimit = loopLimit - (loopLimit % factor);
                            fullSrc += `for(;${loopVarName}<${newLimit};${loopVarName}+=${factor}){${unrolledBody}}`;
                            if (newLimit < loopLimit) {
                                fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=1){${loopSrc}}`;
                            }
                        } else {
                            fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=${loopInc}){${loopSrc}}`;
                        }
                    } else if (loopLimit >= 4 && loopLimit % 2 === 0) {
                        const tmpVar = loopVarName + 'x';
                        const body2 = loopSrc.replace(loopVarWordReGlobal, tmpVar);
                        if (loopLimit % 4 === 0 && loopLimit >= 8) {
                            const tmpVar2 = loopVarName + 'xx';
                            const tmpVar3 = loopVarName + 'xxx';
                            const body3 = loopSrc.replace(loopVarWordReGlobal, tmpVar2);
                            const body4 = loopSrc.replace(loopVarWordReGlobal, tmpVar3);
                            fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=4){${loopSrc}var ${tmpVar}=${loopVarName}+1;${body2}var ${tmpVar2}=${loopVarName}+2;${body3}var ${tmpVar3}=${loopVarName}+3;${body4}}`;
                        } else {
                            fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=2){${loopSrc}var ${tmpVar}=${loopVarName}+1;${body2}}`;
                        }
                    } else {
                        fullSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}+=${loopInc}){${loopSrc}}`;
                    }
                } else {
                    if (compiled.isWhileLoop) {
                        fullSrc += `while(v${gi}<${consts[ci]}){${loopSrc}}`;
                    } else {
                        fullSrc += `for(;v${gi}<${consts[ci]};v${gi}+=${compiled.loopInc || 1}){${loopSrc}}`;
                    }
                }
                for (const idx of ug) {
                    if (idx !== gi) fullSrc += `g[${idx}]=v${idx};`;
                }
                fullSrc += `g[${gi}]=v${gi};`;
                fullSrc = _optimizeJitVSrc(vm, fullSrc, 2);
                vm._loopJitCache[cacheKey] = vm._safeNewFunction('g', '__b', fullSrc);
            } catch(e) { vm._loopJitCache[cacheKey] = null; }
        } else { vm._loopJitCache[cacheKey] = null; }
    }
}

function _buildTinyProgramFastPath(vm, bc) {
    const code = bc?.code;
    const consts = bc?.consts;
    if (!Array.isArray(code) || !Array.isArray(consts) || code.length === 0) return null;
    let arrGi = null;
    let idxGi = null;
    let lenCi = null;
    let endCi = null;
    let seenArray = false;
    let seenSetGlobal = false;
    let seenSetLen = false;
    let seenSetIdx = false;
    for (let ip = 0; ip < code.length;) {
        const op = code[ip++];
        if (op === OP.NOP) continue;
        if (op === OP.ARRAY) {
            const litLen = code[ip++];
            if (seenArray || litLen !== 0) return null;
            seenArray = true;
            continue;
        }
        if (op === OP.SET_GLOBAL) {
            const gi = code[ip++];
            if (!seenArray || seenSetGlobal) return null;
            arrGi = gi;
            seenSetGlobal = true;
            continue;
        }
        if (op === OP.SET_LEN_GLOBAL_CONST) {
            const gi = code[ip++], ci = code[ip++];
            if (!seenSetGlobal || seenSetLen || gi !== arrGi) return null;
            lenCi = ci;
            seenSetLen = true;
            continue;
        }
        if (op === OP.CONST_SET_GLOBAL) {
            const gi = code[ip++], ci = code[ip++];
            if (!seenSetLen || seenSetIdx) return null;
            idxGi = gi;
            endCi = ci;
            seenSetIdx = true;
            continue;
        }
        if (op === OP.HALT) {
            if (!seenArray || !seenSetGlobal || !seenSetLen || !seenSetIdx) return null;
            const lenV = consts[lenCi];
            const endV = consts[endCi];
            if (!Number.isInteger(lenV) || lenV < 0 || !Number.isInteger(endV)) return null;
            const tfp = (gv) => {
                let arr = gv[arrGi];
                if (!Array.isArray(arr)) {
                    arr = hardenArrayObject(new Array(lenV));
                    gv[arrGi] = arr;
                } else {
                    if (arr[HARDENED_ARRAY_MARK] !== 1) hardenArrayObject(arr);
                    if (arr.length !== lenV) arr.length = lenV;
                }
                gv[idxGi] = endV;
            };
            tfp._syncVars = [arrGi, idxGi];
            tfp._syncArrayVars = [arrGi];
            return tfp;
        }
        return null;
    }
    return null;
}

function _optimizeJitVSrc(vm, src, mode = 2) {
    const cache = vm._jitVSrcCache || (vm._jitVSrcCache = new Map());
    const key = `${mode}|${src}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let out = src;
    if (out.includes('+=1;')) out = out.replace(/v(\d+)\+=1;/g, 'v$1++;');
    if (out.includes('*')) {
        out = out.replace(/\((v\d+x*)\*\1\)-\1/g, '$1*($1-1)');
        out = out.replace(/\((v\d+x*)\*\1\)\+\1/g, '$1*($1+1)');
        out = out.replace(/(v\d+x*)\*\1-\1/g, '$1*($1-1)');
        out = out.replace(/(v\d+x*)\*\1\+\1/g, '$1*($1+1)');
    }
    if (mode >= 2) {
        if (out.includes('+=')) {
            out = out.replace(/(v\d+)\+=\(?(v\d+x*)\*(v\d+x*)\)?;(var\s+v\d+x*=[^;]+;)\1\+=\(?\2\*(v\d+x*)\)?;(var\s+v\d+x*=[^;]+;)\1\+=\(?\2\*(v\d+x*)\)?;(var\s+v\d+x*=[^;]+;)\1\+=\(?\2\*(v\d+x*)\)?;/g, (m,a,f,t1,d1,t2,d2,t3,d3,t4)=>`${d1}${d2}${d3}${a}+=${f}*(${t1}+${t2}+${t3}+${t4});`);
            out = out.replace(/(v\d+)\+=\(?(v\d+x*)\*(v\d+x*)\)?;(var\s+v\d+x*=[^;]+;)\1\+=\(?\2\*(v\d+x*)\)?;/g, (m,a,f,t1,d1,t2)=>`${d1}${a}+=${f}*(${t1}+${t2});`);
        }
    }
    if (out.includes('*0') || out.includes('* 0')) out = out.replace(/v(\d+)\*\s*0\b/g, '0');
    if (out.includes('+0') || out.includes('+ 0') || out.includes('0+')) {
        out = out.replace(/v(\d+)\+\s*0\b/g, 'v$1');
        out = out.replace(/\b0\s*\+\s*(v\d+)/g, '$1');
    }
    if (out.includes('*1') || out.includes('* 1') || out.includes('1*')) {
        out = out.replace(/v(\d+)\*\s*1(?![\d.])/g, 'v$1');
        out = out.replace(/\b1\s*\*\s*(v\d+)/g, '$1');
    }
    if (out.includes('=(') && out.includes('+')) out = out.replace(/(v\d+)=\(\1\+([^)]+)\)/g, '$1+=$2');
    if (mode >= 2) {
        if (out.includes('=(') && out.includes('+')) out = out.replace(/(v\d+)=\(\1\+((?:[^()]*\([^()]*\))*[^()]*)\)/g, '$1+=$2');
    }
    if (cache.size > 512) cache.clear();
    cache.set(key, out);
    return out;
}

function _optimizeJitASrc(vm, src) {
    const cache = vm._jitASrcCache || (vm._jitASrcCache = new Map());
    const hit = cache.get(src);
    if (hit !== undefined) return hit;
    let out = src;
    if (out.includes('+=1;')) out = out.replace(/a(\d+)\+=1;/g, 'a$1++;');
    if (out.includes('*')) {
        out = out.replace(/\((a\d+x*)\*\1\)-\1/g, '$1*($1-1)');
        out = out.replace(/\((a\d+x*)\*\1\)\+\1/g, '$1*($1+1)');
        out = out.replace(/(a\d+x*)\*\1-\1/g, '$1*($1-1)');
        out = out.replace(/(a\d+x*)\*\1\+\1/g, '$1*($1+1)');
    }
    if (cache.size > 256) cache.clear();
    cache.set(src, out);
    return out;
}

function _buildJitFastPath(vm, bc) {
    const code = bc.code;
    const consts = bc.consts;
    const len = code.length;
    const initConsts = [];
    const loopFns = [];
    const postOps = [];
    const preSrc = [];
    const postSrc = [];
    let ip = 0;
    let canBuild = true;
    let pastLoops = false;
    const stack = [];
    let stackDepth = 0;

    const toExpr = (v) => {
        if (!v) return null;
        if (v.type === 'const') return typeof v.val === 'string' ? JSON.stringify(v.val) : String(v.val);
        if (v.type === 'global') return `g[${v.gi}]`;
        if (v.type === 'init_global') return typeof v.val === 'string' ? JSON.stringify(v.val) : String(v.val);
        if (v.type === 'prop') return `g[${v.objGi}].${v.propName}`;
        if (v.type === 'idx') return `g[${v.objGi}][${v.idx}]`;
        if (v.type === 'dyn_idx') return `g[${v.objGi}][g[${v.idxGi}]]`;
        if (v.type === 'mod') return `(${toExpr(v.a)}%${toExpr(v.b)})`;
        if (v.type === 'expr') return v.expr;
        if (v.type === 'add') return `(${toExpr(v.a)}+${toExpr(v.b)})`;
        if (v.type === 'sub') return `(${toExpr(v.a)}-${toExpr(v.b)})`;
        if (v.type === 'mul') return `(${toExpr(v.a)}*${toExpr(v.b)})`;
        if (v.type === 'div') return `(${toExpr(v.a)}/${toExpr(v.b)})`;
        if (v.type === 'array_literal') return `[${v.items.join(',')}]`;
        if (v.type === 'object_literal') return null;
        if (v.type === 'array_new') return '[]';
        if (v.type === 'object_new') return null;
        return null;
    };

    while (ip < len) {
        const op = code[ip];
        if (op === 102) {
            const gi = code[ip + 1];
            const ci = code[ip + 2];
            initConsts.push(gi, consts[ci]);
            stack[stackDepth++] = { type: 'init_global', gi, val: consts[ci] };
            ip += 3;
        } else if (op === 96) {
            const cacheKey = ip;
            const loopFn = vm._loopJitCache[cacheKey];
            if (loopFn) {
                loopFns.push(loopFn);
                pastLoops = true;
                const offset = code[ip + 3];
                ip += 4 + offset;
            } else {
                canBuild = false;
                break;
            }
        } else if (op === 10) {
            const gi = code[ip + 1];
            stack[stackDepth++] = { type: 'global', gi };
            ip += 2;
        } else if (op === 11) {
            const gi = code[ip + 1];
            const src = stack[--stackDepth];
            const dest = pastLoops ? postSrc : preSrc;
            if (src && src.type === 'global') {
                postOps.push({ srcGi: src.gi, dstGi: gi });
            } else if (src && src.type === 'array_new') {
                dest.push(`g[${gi}]=[];`);
            } else if (src && src.type === 'array_literal') {
                dest.push(`g[${gi}]=[${src.items.join(',')}];`);
            } else if (src && (src.type === 'object_new' || src.type === 'object_literal')) {
                canBuild = false;
                break;
            } else if (src && src.type === 'init_global') {
                dest.push(`g[${gi}]=${typeof src.val === 'string' ? JSON.stringify(src.val) : src.val};`);
            } else if (src && src.type === 'const') {
                dest.push(`g[${gi}]=${typeof src.val === 'string' ? JSON.stringify(src.val) : src.val};`);
            } else if (src && (src.type === 'add' || src.type === 'sub' || src.type === 'mul' || src.type === 'div' || src.type === 'mod' || src.type === 'dyn_idx' || src.type === 'prop' || src.type === 'idx' || src.type === 'expr')) {
                const expr = toExpr(src);
                if (expr) {
                    dest.push(`g[${gi}]=${expr};`);
                } else {
                    canBuild = false;
                    break;
                }
            } else {
                canBuild = false;
                break;
            }
            ip += 2;
        } else if (op === 50) {
            const n = code[ip + 1];
            ip += 2;
            if (n === 0) {
                stack[stackDepth++] = { type: 'array_new' };
            } else {
                const items = [];
                for (let i = 0; i < n; i++) {
                    const item = stack[--stackDepth];
                    if (item) {
                        if (item.type === 'const') items.unshift(typeof item.val === 'string' ? JSON.stringify(item.val) : item.val);
                        else if (item.type === 'global') items.unshift(`g[${item.gi}]`);
                        else if (item.type === 'array_new') items.unshift('[]');
                        else if (item.type === 'array_literal') items.unshift(`[${item.items.join(',')}]`);
                        else if (item.type === 'init_global') items.unshift(typeof item.val === 'string' ? JSON.stringify(item.val) : item.val);
                        else { canBuild = false; break; }
                    } else {
                        canBuild = false; break;
                    }
                }
                if (!canBuild) break;
                stack[stackDepth++] = { type: 'array_literal', items };
            }
        } else if (op === 51) {
            const n = code[ip + 1];
            ip += 2;
            if (n === 0) {
                stack[stackDepth++] = { type: 'object_new' };
            } else {
                const pairs = [];
                for (let i = 0; i < n; i++) {
                    const val = stack[--stackDepth];
                    const key = stack[--stackDepth];
                    if (key && key.type === 'const' && typeof key.val === 'string') {
                        if (key.val === OBJECT_SPREAD_MARKER) {
                            canBuild = false;
                            break;
                        }
                        if (val && val.type === 'const') {
                            pairs.unshift(`${key.val}:${typeof val.val === 'string' ? JSON.stringify(val.val) : val.val}`);
                        } else if (val && val.type === 'global') {
                            pairs.unshift(`${key.val}:g[${val.gi}]`);
                        } else if (val && val.type === 'init_global') {
                            pairs.unshift(`${key.val}:${typeof val.val === 'string' ? JSON.stringify(val.val) : val.val}`);
                        } else {
                            canBuild = false;
                            break;
                        }
                    } else {
                        canBuild = false;
                        break;
                    }
                }
                if (!canBuild) break;
                stack[stackDepth++] = { type: 'object_literal', pairs };
            }
        } else if (op === 1) {
            const ci = code[ip + 1];
            const val = consts[ci];
            stack[stackDepth++] = { type: 'const', val };
            ip += 2;
        } else if (op === 52) {
            const key = stack[--stackDepth];
            const obj = stack[--stackDepth];
            if (obj && obj.type === 'global') {
                if (key && key.type === 'const') {
                    if (typeof key.val === 'string') {
                        stack[stackDepth++] = { type: 'prop', objGi: obj.gi, propName: key.val };
                    } else if (typeof key.val === 'number') {
                        stack[stackDepth++] = { type: 'idx', objGi: obj.gi, idx: key.val };
                    } else {
                        canBuild = false;
                        break;
                    }
                } else if (key && key.type === 'global') {
                    stack[stackDepth++] = { type: 'dyn_idx', objGi: obj.gi, idxGi: key.gi };
                } else if (key && key.type === 'init_global') {
                    if (typeof key.val === 'string') {
                        stack[stackDepth++] = { type: 'prop', objGi: obj.gi, propName: key.val };
                    } else if (typeof key.val === 'number') {
                        stack[stackDepth++] = { type: 'idx', objGi: obj.gi, idx: key.val };
                    } else {
                        canBuild = false;
                        break;
                    }
                } else {
                    const keyExpr = toExpr(key);
                    if (keyExpr) {
                        stack[stackDepth++] = { type: 'expr', expr: `g[${obj.gi}][${keyExpr}]` };
                    } else {
                        canBuild = false;
                        break;
                    }
                }
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 172) {
            const ci = code[ip + 1];
            const obj = stack[--stackDepth];
            if (obj && obj.type === 'global') {
                const keyVal = consts[ci];
                if (typeof keyVal === 'string') {
                    stack[stackDepth++] = { type: 'prop', objGi: obj.gi, propName: keyVal };
                } else if (typeof keyVal === 'number') {
                    stack[stackDepth++] = { type: 'idx', objGi: obj.gi, idx: keyVal };
                } else {
                    canBuild = false;
                    break;
                }
            } else {
                canBuild = false;
                break;
            }
            ip += 2;
        } else if (op === 20) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            stack[stackDepth++] = { type: 'add', a, b };
            ip += 1;
        } else if (op === 21) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            stack[stackDepth++] = { type: 'sub', a, b };
            ip += 1;
        } else if (op === 22) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            stack[stackDepth++] = { type: 'mul', a, b };
            ip += 1;
        } else if (op === 23) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            stack[stackDepth++] = { type: 'div', a, b };
            ip += 1;
        } else if (op === 53) {
            const obj = stack[--stackDepth];
            const key = stack[--stackDepth];
            const val = stack[--stackDepth];
            const valExpr = toExpr(val);
            if (obj && obj.type === 'global' && valExpr) {
                const dest = pastLoops ? postSrc : preSrc;
                if (key && key.type === 'const') {
                    if (typeof key.val === 'string') {
                        dest.push(`g[${obj.gi}].${key.val}=${valExpr};`);
                    } else if (typeof key.val === 'number') {
                        dest.push(`g[${obj.gi}][${key.val}]=${valExpr};`);
                    } else {
                        canBuild = false;
                        break;
                    }
                } else if (key && key.type === 'global') {
                    dest.push(`g[${obj.gi}][g[${key.gi}]]=${valExpr};`);
                } else if (key && key.type === 'init_global') {
                    if (typeof key.val === 'string') {
                        dest.push(`g[${obj.gi}].${key.val}=${valExpr};`);
                    } else if (typeof key.val === 'number') {
                        dest.push(`g[${obj.gi}][${key.val}]=${valExpr};`);
                    } else {
                        canBuild = false;
                        break;
                    }
                } else {
                    const keyExpr = toExpr(key);
                    if (keyExpr) {
                        dest.push(`g[${obj.gi}][${keyExpr}]=${valExpr};`);
                    } else {
                        canBuild = false;
                        break;
                    }
                }
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 5) {
            stackDepth--;
            ip += 1;
        } else if (op === 111) {
            const gi = code[ip + 1];
            const ci = code[ip + 2];
            stack[stackDepth++] = { type: 'mul', a: { type: 'global', gi }, b: { type: 'const', val: consts[ci] } };
            ip += 3;
        } else if (op === 112) {
            const gi = code[ip + 1];
            const ci = code[ip + 2];
            stack[stackDepth++] = { type: 'add', a: { type: 'global', gi }, b: { type: 'const', val: consts[ci] } };
            ip += 3;
        } else if (op === 113) {
            const gi = code[ip + 1];
            const ci = code[ip + 2];
            stack[stackDepth++] = { type: 'sub', a: { type: 'global', gi }, b: { type: 'const', val: consts[ci] } };
            ip += 3;
        } else if (op === 114) {
            const ai = code[ip + 1];
            const bi = code[ip + 2];
            stack[stackDepth++] = { type: 'div', a: { type: 'global', gi: ai }, b: { type: 'global', gi: bi } };
            ip += 3;
        } else if (op === 115) {
            const ai = code[ip + 1];
            const bi = code[ip + 2];
            stack[stackDepth++] = { type: 'mul', a: { type: 'global', gi: ai }, b: { type: 'global', gi: bi } };
            ip += 3;
        } else if (op === 116) {
            const ai = code[ip + 1];
            const bi = code[ip + 2];
            stack[stackDepth++] = { type: 'add', a: { type: 'global', gi: ai }, b: { type: 'global', gi: bi } };
            ip += 3;
        } else if (op === 117) {
            const ai = code[ip + 1];
            const bi = code[ip + 2];
            stack[stackDepth++] = { type: 'sub', a: { type: 'global', gi: ai }, b: { type: 'global', gi: bi } };
            ip += 3;
        } else if (op === 104) {
            const ti = code[ip + 1];
            const ai = code[ip + 2];
            const bi = code[ip + 3];
            const dest = pastLoops ? postSrc : preSrc;
            dest.push(`g[${ti}]=g[${ai}]+g[${bi}];`);
            ip += 4;
        } else if (op === 135) {
            if (code[ip + 1] === 11) { ip += 3; } else { ip += 1; }
        } else if (op === 137) {
            const sumGi = code[ip + 1];
            const idxGi = code[ip + 2];
            const sumStartCi = code[ip + 3];
            const idxStartCi = code[ip + 4];
            const endCi = code[ip + 5];
            const limit = consts[endCi];
            const idxStart = consts[idxStartCi];
            const sumStart = consts[sumStartCi];
            if (idxStart === 0 && sumStart === 0) {
                preSrc.push(`g[${sumGi}]=(${limit}*(${limit}-1))/2;g[${idxGi}]=${limit};`);
            } else {
                preSrc.push(`{let _s=${sumStart},_i=${idxStart};while(_i<${limit}){_s+=_i;_i++;}g[${sumGi}]=_s;g[${idxGi}]=_i;}`);
            }
            ip += 6;
        } else if (op === 255) {
            break;
        } else if (op === 0) {
            ip++;
        } else if (op === 2) {
            stack[stackDepth++] = { type: 'const', val: null };
            ip++;
        } else if (op === 3) {
            stack[stackDepth++] = { type: 'const', val: true };
            ip++;
        } else if (op === 4) {
            stack[stackDepth++] = { type: 'const', val: false };
            ip++;
        } else if (op === 60) {
            ip += 2;
        } else if (op === 149) {
            const val = stack[--stackDepth];
            const arr = stack[stackDepth - 1];
            if (arr && arr.type === 'global' && val) {
                const valExpr = toExpr(val);
                if (valExpr) {
                    const dest = pastLoops ? postSrc : preSrc;
                    dest.push(`g[${arr.gi}].push(${valExpr});`);
                } else {
                    canBuild = false;
                    break;
                }
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 151) {
            const arr = stack[stackDepth - 1];
            const arrExpr = toExpr(arr);
            if (arrExpr) {
                stack[stackDepth - 1] = { type: 'expr', expr: `${arrExpr}.length` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 162) {
            const val = stack[--stackDepth];
            const arr = stack[--stackDepth];
            if (arr && arr.type === 'global' && val) {
                const valExpr = toExpr(val);
                if (valExpr) {
                    const dest = pastLoops ? postSrc : preSrc;
                    dest.push(`g[${arr.gi}].push(${valExpr});`);
                } else {
                    canBuild = false;
                    break;
                }
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 169) {
            const arrGi = code[ip + 1], idxGi = code[ip + 2], startCi = code[ip + 3], endCi = code[ip + 4];
            const start = consts[startCi], end = consts[endCi];
            preSrc.push(`{const _a=g[${arrGi}];if(Array.isArray(_a)){if(_a.length<${end})_a.length=${end};for(let _i=${start};_i<${end};_i++)_a[_i]=_i;}g[${idxGi}]=${end};}`);
            ip += 5;
        } else if (op === 170) {
            const gi = code[ip + 1], ci = code[ip + 2];
            const n = consts[ci];
            preSrc.push(`g[${gi}].length=${n};`);
            ip += 3;
        } else if (op === 171) {
            const arrMode = code[ip + 1], arrRef = code[ip + 2], idxMode = code[ip + 3], idxRef = code[ip + 4], startCi = code[ip + 5], endCi = code[ip + 6];
            const start = consts[startCi], end = consts[endCi];
            const n = end - start;
            const arrExpr = arrMode ? `g[${arrRef}]` : `g[${arrRef}]`;
            const idxExpr = idxMode ? `g[${idxRef}]` : `g[${idxRef}]`;
            preSrc.push(`{const _a=${arrExpr};const _n=${n};if(Array.isArray(_a)&&_n>0){const _b=_a.length;if(_b===0&&${start}===0){_a.length=_n;for(let _i=0;_i<_n;_i++)_a[_i]=_i;}else{_a.length=_b+_n;for(let _i=0;_i<_n;_i++)_a[_b+_i]=${start}+_i;}}${idxExpr}=${end};}`);
            ip += 7;
        } else if (op === 175) {
            const endCi = code[ip + 1];
            const end = consts[endCi];
            const n = Number.isInteger(end) && end > 0 ? end : 0;
            preSrc.push(`{const _a=new Array(${n});for(let _i=0;_i<${n};_i++)_a[_i]=_i;}`);
            ip += 2;
        } else if (op === 176) {
            const sumGi = code[ip + 1], idxGi = code[ip + 2], arrGi = code[ip + 3], nGi = code[ip + 4];
            preSrc.push(`{const _a=g[${arrGi}];const _l=g[${nGi}];const _s=Number.isInteger(_l)&&_l>0?_l:0;let _sum=g[${sumGi}]||0;if(Array.isArray(_a)&&_s>0){const _len=_a.length<_s?_a.length:_s;for(let _i=0;_i<_len;_i++)_sum+=_a[_i];}g[${sumGi}]=_sum;g[${idxGi}]=_l;}`);
            ip += 5;
        } else if (op === 177) {
            const arrGi = code[ip + 1], idxGi = code[ip + 2], nGi = code[ip + 3];
            preSrc.push(`{const _a=g[${arrGi}];const _l=g[${nGi}];const _s=Number.isInteger(_l)&&_l>0?_l:0;if(Array.isArray(_a)&&_s>0){const _b=_a.length;if(_b===0){_a.length=_s;for(let _i=0;_i<_s;_i++)_a[_i]=_i;}else{_a.length=_b+_s;for(let _i=0;_i<_s;_i++)_a[_b+_i]=_i;}}g[${idxGi}]=_l;}`);
            ip += 4;
        } else if (op === 178) {
            const sumGi = code[ip + 1], idxGi = code[ip + 2], arrGi = code[ip + 3], nCi = code[ip + 4];
            const limit = consts[nCi];
            const span = Number.isInteger(limit) && limit > 0 ? limit : 0;
            preSrc.push(`{const _a=g[${arrGi}];let _sum=g[${sumGi}]||0;if(Array.isArray(_a)&&${span}>0){const _len=_a.length<${span}?_a.length:${span};for(let _i=0;_i<_len;_i++)_sum+=_a[_i];}g[${sumGi}]=_sum;g[${idxGi}]=${limit};}`);
            ip += 5;
        } else if (op === 70) {
            const val = stack[--stackDepth];
            if (val && (val.type === 'const' || val.type === 'init_global')) {
                const v = typeof val.val === 'string' ? JSON.stringify(val.val) : val.val;
                preSrc.push(`__out.push(${v});`);
            } else if (val && val.type === 'global') {
                preSrc.push(`__out.push(g[${val.gi}]);`);
            } else {
                const vExpr = toExpr(val);
                if (vExpr) {
                    preSrc.push(`__out.push(${vExpr});`);
                } else {
                    canBuild = false;
                    break;
                }
            }
            ip += 1;
        } else if (op === 150) {
            const idx = stack[--stackDepth];
            const arr = stack[stackDepth - 1];
            if (arr && arr.type === 'global') {
                if (idx && idx.type === 'global') {
                    stack[stackDepth - 1] = { type: 'dyn_idx', objGi: arr.gi, idxGi: idx.gi };
                } else if (idx && idx.type === 'const') {
                    if (typeof idx.val === 'number') {
                        stack[stackDepth - 1] = { type: 'idx', objGi: arr.gi, idx: idx.val };
                    } else if (typeof idx.val === 'string') {
                        stack[stackDepth - 1] = { type: 'prop', objGi: arr.gi, propName: idx.val };
                    } else {
                        canBuild = false;
                        break;
                    }
                } else if (idx && idx.type === 'init_global') {
                    if (typeof idx.val === 'number') {
                        stack[stackDepth - 1] = { type: 'idx', objGi: arr.gi, idx: idx.val };
                    } else if (typeof idx.val === 'string') {
                        stack[stackDepth - 1] = { type: 'prop', objGi: arr.gi, propName: idx.val };
                    } else {
                        canBuild = false;
                        break;
                    }
                } else {
                    const idxExpr = toExpr(idx);
                    if (idxExpr) {
                        stack[stackDepth - 1] = { type: 'expr', expr: `g[${arr.gi}][${idxExpr}]` };
                    } else {
                        canBuild = false;
                        break;
                    }
                }
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 163) {
            const obj = stack[--stackDepth];
            const key = stack[--stackDepth];
            const val = stack[--stackDepth];
            const valExpr = toExpr(val);
            if (obj && obj.type === 'global' && valExpr) {
                const dest = pastLoops ? postSrc : preSrc;
                if (key && key.type === 'global') {
                    dest.push(`g[${obj.gi}][g[${key.gi}]]=${valExpr};`);
                } else if (key && key.type === 'const') {
                    if (typeof key.val === 'number') {
                        dest.push(`g[${obj.gi}][${key.val}]=${valExpr};`);
                    } else if (typeof key.val === 'string') {
                        dest.push(`g[${obj.gi}].${key.val}=${valExpr};`);
                    } else {
                        canBuild = false;
                        break;
                    }
                } else if (key && key.type === 'init_global') {
                    if (typeof key.val === 'number') {
                        dest.push(`g[${obj.gi}][${key.val}]=${valExpr};`);
                    } else if (typeof key.val === 'string') {
                        dest.push(`g[${obj.gi}].${key.val}=${valExpr};`);
                    } else {
                        canBuild = false;
                        break;
                    }
                } else {
                    const keyExpr = toExpr(key);
                    if (keyExpr) {
                        dest.push(`g[${obj.gi}][${keyExpr}]=${valExpr};`);
                    } else {
                        canBuild = false;
                        break;
                    }
                }
                stack[stackDepth++] = val;
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 63) {
            const n = code[ip + 1];
            const args = [];
            for (let i = 0; i < n; i++) args.unshift(stack[--stackDepth]);
            const fnObj = stack[--stackDepth];
            if (fnObj && fnObj.type === 'global' && args.every(a => a && (a.type === 'global' || a.type === 'const' || a.type === 'init_global'))) {
                const fnName = bc.vars[fnObj.gi];
                const isBuiltin = vm.builtins && fnName && vm.builtins[fnName] !== undefined;
                if (!isBuiltin) { canBuild = false; break; }
                const argExprs = args.map(a => {
                    if (a.type === 'global') return `g[${a.gi}]`;
                    if (a.type === 'const' || a.type === 'init_global') return typeof a.val === 'string' ? JSON.stringify(a.val) : a.val;
                    return null;
                });
                const callArgs = isBuiltin ? `[${argExprs.join(',')}]` : argExprs.join(',');
                const dest = pastLoops ? postSrc : preSrc;
                const nextOp = code[ip + 2];
                if (nextOp === 11) {
                    const dstGi = code[ip + 3];
                    dest.push(`g[${dstGi}]=g[${fnObj.gi}](${callArgs});`);
                    ip += 2 + 2;
                    stackDepth = 0;
                } else if (nextOp === 5) {
                    dest.push(`g[${fnObj.gi}](${callArgs});`);
                    ip += 2 + 1;
                } else {
                    canBuild = false;
                    break;
                }
            } else {
                canBuild = false;
                break;
            }
        } else if (op === 90) {
            const fnObj = stack[--stackDepth];
            if (fnObj && fnObj.type === 'global') {
                const fnName = bc.vars[fnObj.gi];
                const isBuiltin = vm.builtins && fnName && vm.builtins[fnName] !== undefined;
                if (!isBuiltin) { canBuild = false; break; }
                const callArgs = isBuiltin ? '[]' : '';
                const dest = pastLoops ? postSrc : preSrc;
                const nextOp = code[ip + 1];
                if (nextOp === 11) {
                    const dstGi = code[ip + 2];
                    dest.push(`g[${dstGi}]=g[${fnObj.gi}](${callArgs});`);
                    ip += 3;
                } else if (nextOp === 5) {
                    dest.push(`g[${fnObj.gi}](${callArgs});`);
                    ip += 2;
                } else {
                    canBuild = false;
                    break;
                }
            } else {
                canBuild = false;
                break;
            }
        } else if (op === 72) {
            ip += 3;
            stackDepth = 0;
        } else if (op === 30) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            const bExpr = toExpr(b);
            if (aExpr && bExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(${aExpr}===${bExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 31) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            const bExpr = toExpr(b);
            if (aExpr && bExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(${aExpr}!==${bExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 42) {
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            if (aExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(!${aExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 25) {
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            if (aExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(-${aExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 24) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            stack[stackDepth++] = { type: 'mod', a, b };
            ip += 1;
        } else if (op === 40) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            const bExpr = toExpr(b);
            if (aExpr && bExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(${aExpr}&&${bExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 41) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            const bExpr = toExpr(b);
            if (aExpr && bExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(${aExpr}||${bExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 32) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            const bExpr = toExpr(b);
            if (aExpr && bExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(${aExpr}<${bExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 33) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            const bExpr = toExpr(b);
            if (aExpr && bExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(${aExpr}<=${bExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 34) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            const bExpr = toExpr(b);
            if (aExpr && bExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(${aExpr}>${bExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else if (op === 35) {
            const b = stack[--stackDepth];
            const a = stack[--stackDepth];
            const aExpr = toExpr(a);
            const bExpr = toExpr(b);
            if (aExpr && bExpr) {
                stack[stackDepth++] = { type: 'expr', expr: `(${aExpr}>=${bExpr})` };
            } else {
                canBuild = false;
                break;
            }
            ip += 1;
        } else {
            canBuild = false;
            break;
        }
    }

    if (!canBuild || (loopFns.length === 0 && preSrc.length === 0)) {
        return;
    }

    vm._initConsts = initConsts;

    let loopBody;
    if (loopFns.length >= 1) {
        try {
            loopBody = preSrc.join('');
            for (let li = 0; li < loopFns.length; li++) {
                const fnStr = loopFns[li].toString();
                const bodyMatch = fnStr.match(/\)\s*\{([\s\S]*)\}$/);
                if (bodyMatch) {
                    loopBody += bodyMatch[1];
                } else {
                    loopBody = null;
                    break;
                }
            }
            if (loopBody) {
                loopBody += postSrc.join('');
                for (const op of postOps) {
                    loopBody += `g[${op.dstGi}]=g[${op.srcGi}];`;
                }
                if (loopFns.length >= 2) {
                    const loopParts = [];
                    for (let li = 0; li < loopFns.length; li++) {
                        const fnStr = loopFns[li].toString();
                        const bodyMatch = fnStr.match(/\)\s*\{([\s\S]*)\}$/);
                        if (bodyMatch) loopParts.push(bodyMatch[1]);
                    }
                    if (loopParts.length >= 2) {
                        const skipIndices = new Set();
                        const loopInfo = loopParts.map(part => {
                            const arrMatch = part.match(/var\s+(v\d+)\s*=\s*g\[(\d+)\]/);
                            const rangeMatch = part.match(/for\s*\(\s*;\s*(v\d+)\s*<\s*(\d+)\s*;/);
                            const forBodyMatch = part.match(/for\s*\([^}]*\{([^}]*)\}/);
                            const forBody = forBodyMatch ? forBodyMatch[1] : '';
                            const arrVar = arrMatch ? arrMatch[1] : null;
                            const arrGi = arrMatch ? arrMatch[2] : null;
                            const loopVar = rangeMatch ? rangeMatch[1] : null;
                            const limit = rangeMatch ? parseInt(rangeMatch[2]) : 0;
                            const constAssigns = forBody.replace(/var\s+\w+x*=\w+\+\d+;?/g, '').replace(/\w+\[\w+x*\]=\d+;?/g, '').trim();
                            const isConstFill = constAssigns.length === 0 && arrVar && forBody.match(new RegExp(arrVar + '\\[\\w+x*\\]=\\d+', 'g'));
                            const idxAssigns = forBody.replace(/var\s+\w+x*=\w+\+\d+;?/g, '').replace(new RegExp(arrVar + '\\[\\w+x*\\]=\\w+x*;?', 'g'), '').trim();
                            const isIdxAssign = idxAssigns.length === 0 && arrVar && forBody.match(new RegExp(arrVar + '\\[\\w+x*\\]=\\w+x*', 'g'));
                            return { arrGi, limit, isConstFill: !!isConstFill, isIdxAssign: !!isIdxAssign };
                        });
                        for (let i = 0; i < loopInfo.length - 1; i++) {
                            if (!loopInfo[i].isConstFill || !loopInfo[i].arrGi) continue;
                            for (let j = i + 1; j < loopInfo.length; j++) {
                                if (loopInfo[j].arrGi === loopInfo[i].arrGi && loopInfo[j].limit >= loopInfo[i].limit && (loopInfo[j].isIdxAssign || loopInfo[j].isConstFill)) {
                                    skipIndices.add(i);
                                    break;
                                }
                            }
                        }
                        if (skipIndices.size > 0) {
                            loopBody = preSrc.join('');
                            for (let li = 0; li < loopFns.length; li++) {
                                if (skipIndices.has(li)) continue;
                                const fnStr = loopFns[li].toString();
                                const bodyMatch = fnStr.match(/\)\s*\{([\s\S]*)\}$/);
                                if (bodyMatch) loopBody += bodyMatch[1];
                            }
                            loopBody += postSrc.join('');
                            for (const op of postOps) {
                                loopBody += `g[${op.dstGi}]=g[${op.srcGi}];`;
                            }
                        }
                    }
                }
                vm._jitFastPath = vm._safeNewFunction('g', '__out', '__b', loopBody);
            }
        } catch(e) {
            vm._jitFastPath = null;
        }
    } else if (loopFns.length === 0 && preSrc.length > 0) {
        try {
            loopBody = preSrc.join('');
            for (const op of postOps) {
                loopBody += `g[${op.dstGi}]=g[${op.srcGi}];`;
            }
            vm._jitFastPath = vm._safeNewFunction('g', '__out', '__b', loopBody);
        } catch(e) {
            vm._jitFastPath = null;
        }
    }

    if (vm._jitFastPath && loopBody) {
        const arrNewMatches = [...loopBody.matchAll(/g\[(\d+)\]=\[\];/g)];
        for (const m of arrNewMatches) {
            const gi = m[1];
            const preallocMatch = loopBody.match(new RegExp(`var\\s+v\\d+\\s*=\\s*g\\[${gi}\\];var\\s+_n\\s*=\\s*(\\d+);`));
            if (preallocMatch) {
                const size = preallocMatch[1];
                const avName = loopBody.match(new RegExp(`var\\s+(v\\d+)\\s*=\\s*g\\[${gi}\\]`))?.[1];
                if (avName) {
                    loopBody = loopBody.replace(`g[${gi}]=[];`, '');
                    loopBody = loopBody.replace(`var ${avName}=g[${gi}];var _n=${size};`, `var ${avName}=g[${gi}]=new Array(${size});`);
                    loopBody = loopBody.replace(new RegExp(`if\\(!Array\\.isArray\\(${avName}\\)\\)${avName}=new Array\\(_n\\);else if\\(${avName}\\.length<_n\\)${avName}\\.length=_n;`), '');
                } else {
                    loopBody = loopBody.replace(`g[${gi}]=[];`, `g[${gi}]=new Array(${size});`);
                }
            }
        }
        vm._jitFastPath = vm._safeNewFunction('g', '__out', '__b', loopBody);
    }

    if (vm._jitFastPath && bc.vars.length <= 16) {
        try {
            let optBody = loopBody;

            const strVarMatch = optBody.match(/var\s+(v\d+)\s*=\s*""\s*;/);
            if (strVarMatch) {
                const sv = strVarMatch[1];
                const forMatchStr = optBody.match(/for\(;(v\d+)<(\d+);(v\d+)\+=(\d+)\)\{([^}]*)\}/);
                if (forMatchStr) {
                    const inner = forMatchStr[5];
                    const allConcat = [...inner.matchAll(new RegExp(sv + '\\s*\\+=\\s*\\(?("[^"]*")\\)?\\s*;', 'g'))];
                    const otherRefs = inner.match(new RegExp(sv + '(?!\\s*\\+=)', 'g'));
                    const otherStmts = inner.replace(new RegExp(sv + '\\s*\\+=\\s*\\(?("[^"]*")\\)?\\s*;', 'g'), '').trim();
                    if (allConcat.length > 0 && !otherRefs && !otherStmts) {
                        const repeatStr = allConcat[0][1];
                        const repeatCount = parseInt(forMatchStr[2]);
                        const loopVar = forMatchStr[1];
                        optBody = optBody.replace(`var ${sv}=""`, `var ${sv}=${repeatStr}.repeat(${repeatCount})`);
                        optBody = optBody.replace(forMatchStr[0], `${loopVar}=${repeatCount};`);
                    } else if (allConcat.length > 0 && !otherRefs) {
                        optBody = optBody.replace(`var ${sv}=""`, `var ${sv}=[]`);
                        optBody = optBody.replace(new RegExp(sv + '\\s*\\+=\\s*\\(?("[^"]*")\\)?\\s*;', 'g'), `${sv}.push($1);`);
                        const gWriteMatch = optBody.match(new RegExp(sv + '([^;]*);(g\\[\\d+\\]=' + sv + ')'));
                        if (gWriteMatch) {
                            optBody = optBody.replace(gWriteMatch[0], `${sv}=${sv}.join("");${gWriteMatch[2]}`);
                        } else {
                            optBody = optBody.replace(/(g\[\d+\]=)/, `${sv}=${sv}.join("");$1`);
                        }
                    }
                }
            }

            const forMatch = optBody.match(/for\(;(v\d+)<(\d+);(v\d+)\+=(\d+)\)\{([^}]*)\}/);
            if (forMatch) {
                const loopVar = forMatch[1];
                const limit = parseInt(forMatch[2]);
                const incVar = forMatch[3];
                const inc = parseInt(forMatch[4]);
                const innerBody = forMatch[5];

                if (incVar === loopVar && inc === 1 && !innerBody.includes('for(') && !innerBody.includes('if(')) {
                    const bodyRefsLoopVar = new RegExp('\\b' + loopVar + '\\b').test(innerBody);
                    const isPushBody = innerBody.includes('.push(');

                    if (!bodyRefsLoopVar && limit >= 8) {
                        let factor = 4;
                        if (limit % 4 !== 0) factor = 2;
                        if (limit % 2 !== 0) factor = 1;
                        if (factor > 1) {
                            let unrolledBody;
                            if (isPushBody) {
                                const pushMatch = innerBody.match(/(\w+)\.push\(([^)]+)\)/);
                                if (pushMatch) {
                                    const arrName = pushMatch[1];
                                    const pushVal = pushMatch[2];
                                    unrolledBody = `${arrName}.push(${Array(factor).fill(pushVal).join(',')});`;
                                } else {
                                    unrolledBody = innerBody.repeat(factor);
                                }
                            } else {
                                unrolledBody = innerBody.repeat(factor);
                            }
                            const newLimit = limit - (limit % factor);
                            let replacement = `for(;${loopVar}<${newLimit};${incVar}+=${factor}){${unrolledBody}}`;
                            if (newLimit < limit) {
                                replacement += `for(;${loopVar}<${limit};${incVar}+=1){${innerBody}}`;
                            }
                            optBody = optBody.replace(forMatch[0], replacement);
                        }
                    } else if (bodyRefsLoopVar && limit >= 4 && limit % 2 === 0) {
                        const tmpVar = loopVar + 'x';
                        const body2 = innerBody.replace(new RegExp('\\b' + loopVar + '\\b', 'g'), tmpVar);
                        if (limit % 4 === 0 && limit >= 8) {
                            const tmpVar2 = loopVar + 'xx';
                            const tmpVar3 = loopVar + 'xxx';
                            const body3 = innerBody.replace(new RegExp('\\b' + loopVar + '\\b', 'g'), tmpVar2);
                            const body4 = innerBody.replace(new RegExp('\\b' + loopVar + '\\b', 'g'), tmpVar3);
                            optBody = optBody.replace(forMatch[0], `for(;${loopVar}<${limit};${incVar}+=4){${innerBody}var ${tmpVar}=${loopVar}+1;${body2}var ${tmpVar2}=${loopVar}+2;${body3}var ${tmpVar3}=${loopVar}+3;${body4}}`);
                        } else {
                            optBody = optBody.replace(forMatch[0], `for(;${loopVar}<${limit};${incVar}+=2){${innerBody}var ${tmpVar}=${loopVar}+1;${body2}}`);
                        }
                    }
                }
            }

            optBody = _optimizeJitVSrc(vm, optBody, 2);

            if (optBody !== loopBody) {
                vm._jitFastPath = vm._safeNewFunction('g', '__out', '__b', optBody);
            }

            const loopUsesG = /g\[/.test(optBody.replace(/g\[\d+\]\s*=\s*v\d+;/g, '').replace(/g\[\d+\]\s*=\s*g\[\d+\];/g, ''));

            if (!loopUsesG) {
                const gToVar = {};
                const writeMatches = [...optBody.matchAll(/g\[(\d+)\]\s*=\s*(v\d+)/g)];
                for (const m of writeMatches) {
                    gToVar[m[1]] = m[2];
                }
                for (const op of postOps) {
                    const srcVar = gToVar[String(op.srcGi)];
                    if (srcVar) gToVar[String(op.dstGi)] = srcVar;
                }

                let cleanBody = optBody.replace(/g\[\d+\]\s*=\s*v\d+;/g, '');
                cleanBody = cleanBody.replace(/g\[\d+\]\s*=\s*g\[\d+\];/g, '');

                const neededVars = new Set();
                for (const op of postOps) {
                    neededVars.add(op.dstGi);
                }
                const resultIdx = bc.vars.indexOf('result');
                if (resultIdx >= 0) neededVars.add(String(resultIdx));

                const vars = bc.vars;
                const len = vars.length;
                for (let i = 0; i < len && i < 16; i++) {
                    if (!neededVars.has(String(i)) && i !== resultIdx) {
                        const varName = gToVar[String(i)];
                        if (varName) {
                            const regex = new RegExp('gl\\[' + JSON.stringify(vars[i]) + '\\]=' + varName + ';');
                            cleanBody = cleanBody.replace(regex, '');
                        }
                    }
                    const varName = gToVar[String(i)];
                    if (varName && !cleanBody.includes(`gl[${JSON.stringify(vars[i])}]=${varName};`)) {
                        cleanBody += `gl[${JSON.stringify(vars[i])}]=${varName};`;
                    }
                }

                vm._superFastPath = vm._safeNewFunction('gl', '__b', cleanBody);
                vm._superFastPathNeedsG = false;
            } else {
                let superBody = '';
                for (let i = 0; i < initConsts.length; i += 2) {
                    const val = initConsts[i + 1];
                    if (typeof val === 'string') superBody += `g[${initConsts[i]}]=${JSON.stringify(val)};`;
                    else superBody += `g[${initConsts[i]}]=${val};`;
                }
                superBody += optBody;
                const vars = bc.vars;
                const len = vars.length;
                for (let i = 0; i < len && i < 16; i++) {
                    superBody += `gl[${JSON.stringify(vars[i])}]=g[${i}];`;
                }
                vm._superFastPath = vm._safeNewFunction(['g', 'gl', '__b'], superBody);
                vm._superFastPathNeedsG = true;
            }
        } catch(e) {
            vm._superFastPath = null;
        }
    }
}

function wireJitFastPath(VMProto) {
    VMProto._precompileLoops = function (bc) { return _precompileLoops(this, bc); };
    VMProto._buildTinyProgramFastPath = function (bc) { return _buildTinyProgramFastPath(this, bc); };
    VMProto._optimizeJitVSrc = function (src, mode) { return _optimizeJitVSrc(this, src, mode); };
    VMProto._optimizeJitASrc = function (src) { return _optimizeJitASrc(this, src); };
    VMProto._buildJitFastPath = function (bc) { return _buildJitFastPath(this, bc); };
}

module.exports = {
    _precompileLoops,
    _buildTinyProgramFastPath,
    _optimizeJitVSrc,
    _optimizeJitASrc,
    _buildJitFastPath,
    _BUDGET_CHECK,
    wireJitFastPath
};
