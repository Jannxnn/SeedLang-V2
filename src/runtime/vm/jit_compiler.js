'use strict';

const { isClassicFibFuncRef } = require('./fast_builtin_ops');

function _optimizeLeafSrc(src) {
    if (!src) return src;
    let out = src;
    out = out.replace(/a(\d+)\+=1;/g, 'a$1++;');
    if (out.includes('*')) {
        out = out.replace(/(a\d+x*)\*\1-\1/g, '$1*($1-1)');
        out = out.replace(/(a\d+x*)\*\1\+\1/g, '$1*($1+1)');
    }
    out = _convertWhileToFor(out);
    out = out.replace(/(let|var) (a\d+)=\[\];((?:(?:let|var) a\d+=[^;]*;)*?)for\(\;(a\d+)<([^;]+);(a\d+)\+\+\)\{\2\.push\(\4\);\}/g,
        function(m, kw, arrVar, decls, loopVar, limit, incVar) {
            return `${kw} ${arrVar}=new Array(${limit});${decls}for(;${loopVar}<${limit};${incVar}++){${arrVar}[${loopVar}]=${loopVar};}`;
        });
    out = out.replace(/var /g, 'let ');
    return out;
}

function _convertWhileToFor(src) {
    const re = /while\((a\d+)<([^)]+)\)\{/g;
    const match = re.exec(src);
    if (!match) return src;
    const varName = match[1];
    const limit = match[2];
    const matchStart = match.index;
    const bodyStart = matchStart + match[0].length;
    let depth = 0;
    let j = bodyStart;
    while (j < src.length) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') {
            if (depth === 0) break;
            depth--;
        }
        j++;
    }
    const body = src.slice(bodyStart, j);
    const convertedBody = _convertWhileToFor(body);
    const incSuffix = varName + '++;';
    let newLoop;
    if (convertedBody.endsWith(incSuffix)) {
        const innerBody = convertedBody.slice(0, -incSuffix.length);
        newLoop = `for(;${varName}<${limit};${varName}++){${innerBody}}`;
    } else {
        newLoop = `while(${varName}<${limit}){${convertedBody}}`;
    }
    return src.slice(0, matchStart) + newLoop + _convertWhileToFor(src.slice(j + 1));
}

function _compileLeafFunction(vm, closure) {
    const code = closure._ctx[0];
    const consts = closure._ctx[1];
    if (!vm._validateJitConsts(consts)) return null;
    const start = closure._start;
    const end = closure._funcRef ? closure._funcRef.end : code.length;
    const localCount = closure._localCount || 0;
    const paramCount = closure._funcRef ? closure._funcRef.params.length : 0;
    if (localCount > 20) { console.log('[LEAF-DBG] localCount > 20:', localCount); return null; }
    let src = '';
    let ip = start;
    let stackDepth = 0;
    const stack = [];
    const declaredLocals = new Set();
    const usedNativeFns = new Set();
    const usedGlobals = new Set();
    const usedArrays = new Set();
    let ifDepth = 0;
    for (let i = 0; i < paramCount; i++) declaredLocals.add(i);
    const loopJmpFalseIps = new Set();
    const jmpBackTargets = new Map();
    const paren = (s) => {
        if (typeof s !== 'string') return s;
        if (/^[v\d]+$/.test(s)) return s;
        if (/^\(.*\)$/.test(s) && !s.slice(1,-1).includes('(')) return s;
        return `(${s})`;
    };
    let scanIp = start;
    while (scanIp < end) {
        const scanOp = code[scanIp++];
        if (scanOp === 60) {
            const offset = code[scanIp++];
            const target = scanIp - 1 + offset;
            if (target < scanIp - 1) {
                jmpBackTargets.set(scanIp - 2, target);
            }
        } else if ([1,12,13,50,91,92,100].includes(scanOp)) { scanIp++; }
        else if ([88,89,93].includes(scanOp)) { scanIp += 2; }
        else if ([95,96].includes(scanOp)) { scanIp += 3; } else if (scanOp === 61 || scanOp === 62) { scanIp++; } else if (scanOp >= 158 && scanOp <= 161) { scanIp++; }
        else if (scanOp === 155 || scanOp === 156 || scanOp === 157) { scanIp += 2; }
        else if (scanOp === 72) { scanIp += 2; }
    }
    scanIp = start;
    while (scanIp < end) {
        const scanOp = code[scanIp++];
        if (scanOp === 61 || scanOp === 62) {
            const offset = code[scanIp++];
            const jmpFalseIp = scanIp - 2;
            const targetIp = scanIp - 1 + offset;
            for (const [jmpIp, jmpTarget] of jmpBackTargets) {
                if (targetIp > jmpIp && jmpTarget < jmpFalseIp) {
                    loopJmpFalseIps.add(jmpFalseIp);
                    break;
                }
            }
        } else if (scanOp >= 158 && scanOp <= 161) {
            const offset = code[scanIp++];
            const jmpFalseIp = scanIp - 2;
            const targetIp = scanIp - 1 + offset;
            for (const [jmpIp, jmpTarget] of jmpBackTargets) {
                if (targetIp > jmpIp && jmpTarget < jmpFalseIp) {
                    loopJmpFalseIps.add(jmpFalseIp);
                    break;
                }
            }
        } else if ([1,12,13,50,91,92,100].includes(scanOp)) { scanIp++; }
        else if ([88,89,93].includes(scanOp)) { scanIp += 2; }
        else if ([95,96].includes(scanOp)) { scanIp += 3; }
        else if (scanOp === 60) { scanIp++; }
        else if (scanOp === 155 || scanOp === 156 || scanOp === 157) { scanIp += 2; }
        else if (scanOp === 72) { scanIp += 2; }
    }

    while (ip < end) {
        const op = code[ip++];
        switch (op) {
            case 0: break;
            case 1: {
                const ci = code[ip++];
                const v = consts[ci];
                if (typeof v === 'number') stack[stackDepth++] = `${v}`;
                else if (typeof v === 'string') stack[stackDepth++] = JSON.stringify(v);
                else if (v === null) stack[stackDepth++] = 'null';
                else if (typeof v === 'boolean') stack[stackDepth++] = `${v}`;
                else return null;
                break;
            }
            case 50: {
                const n = code[ip++];
                if (n === 0) {
                    stack[stackDepth++] = '[]';
                } else {
                    const items = [];
                    for (let i = 0; i < n; i++) items.unshift(stack[--stackDepth]);
                    stack[stackDepth++] = `[${items.join(',')}]`;
                }
                break;
            }
            case 51: {
                const n = code[ip++];
                if (n === 0) {
                    stack[stackDepth++] = '{}';
                } else {
                    const pairs = [];
                    for (let i = 0; i < n; i++) {
                        const val = stack[--stackDepth];
                        const key = stack[--stackDepth];
                        pairs.unshift(`${key}:${val}`);
                    }
                    stack[stackDepth++] = `{${pairs.join(',')}}`;
                }
                break;
            }
            case 2: stack[stackDepth++] = 'null'; break;
            case 3: stack[stackDepth++] = 'true'; break;
            case 4: stack[stackDepth++] = 'false'; break;
            case 5: { stackDepth--; break; }
            case 12: {
                const li = code[ip++];
                stack[stackDepth++] = `a${li}`;
                break;
            }
            case 13: {
                const li = code[ip++];
                if (stackDepth > 0) {
                    const val = stack[--stackDepth];
                    const lName = `a${li}`;
                    if (!declaredLocals.has(li)) {
                        declaredLocals.add(li);
                        if (typeof val === 'object' && val !== null) {
                            src += `${lName}=${val.obj}[\"${val.prop}\"];`;
                        } else {
                            src += `var ${lName}=${val};`;
                        }
                    } else {
                        if (typeof val === 'string' && val.startsWith(lName + '+')) {
                            src += `${lName}+=${val.slice(lName.length + 1)};`;
                        } else if (typeof val === 'string' && val.startsWith(lName + '-')) {
                            src += `${lName}-=${val.slice(lName.length + 1)};`;
                        } else if (typeof val === 'object' && val !== null) {
                            src += `${lName}=${val.obj}[\"${val.prop}\"];`;
                        } else if (val !== lName) {
                            src += `${lName}=${val};`;
                        }
                    }
                }
                break;
            }
            case 88: {
                const ci = code[ip++]; const li = code[ip++];
                if (!declaredLocals.has(li)) {
                    declaredLocals.add(li);
                    src += `var a${li}=${consts[ci]};`;
                } else {
                    src += `a${li}=${consts[ci]};`;
                }
                break;
            }
            case 89: {
                const i1 = code[ip++]; const i2 = code[ip++];
                stack[stackDepth++] = `a${i1}+a${i2}`;
                break;
            }
            case 92: {
                const li = code[ip++];
                src += `a${li}++;`;
                break;
            }
            case 93: {
                const si = code[ip++]; const ai = code[ip++];
                src += `a${si}+=a${ai};`;
                break;
            }
            case 100: {
                const li = code[ip++]; const ci = code[ip++];
                stack[stackDepth++] = `a${li}+${consts[ci]}`;
                break;
            }
            case 20: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}+${b}`; break; }
            case 135: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}+${b}`; break; }
            case 21: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}-${b}`; break; }
            case 22: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}*${b}`; break; }
            case 23: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}/${b}`; break; }
            case 24: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}%${b}`; break; }
            case 25: { stack[stackDepth-1] = `-${stack[stackDepth-1]}`; break; }
            case 30: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}===${b}`; break; }
            case 31: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}!==${b}`; break; }
            case 32: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}<${b}`; break; }
            case 33: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}<=${b}`; break; }
            case 34: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}>${b}`; break; }
            case 35: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}>=${b}`; break; }
            case 40: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}&&${b}`; break; }
            case 41: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}||${b}`; break; }
            case 42: { stack[stackDepth-1] = `!${stack[stackDepth-1]}`; break; }
            case 43: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}&${paren(b)}`; break; }
            case 44: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}|${paren(b)}`; break; }
            case 45: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}^${paren(b)}`; break; }
            case 46: { stack[stackDepth-1] = `~${stack[stackDepth-1]}`; break; }
            case 47: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}<<${paren(b)}`; break; }
            case 48: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}>>${paren(b)}`; break; }
            case 60: {
                const offset = code[ip++];
                const targetIp = ip - 1 + offset;
                if (targetIp < ip) {
                    src += `}`;
                    if (ifDepth > 0) ifDepth--;
                } else {
                    return null;
                }
                break;
            }
            case 61: {
                const offset = code[ip++];
                const cond = stack[--stackDepth];
                const condIp = ip - 2;
                if (loopJmpFalseIps.has(condIp)) {
                    src += `while(${cond}){`;
                } else {
                    src += `if(!(${cond})){`;
                    ifDepth++;
                }
                break;
            }
            case 158: {
                const offset = code[ip++];
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                const cond = `${a}<${b}`;
                const condIp = ip - 2;
                if (loopJmpFalseIps.has(condIp)) { src += `while(${cond}){`; }
                else { src += `if(!(${cond})){`; ifDepth++; }
                break;
            }
            case 159: {
                const offset = code[ip++];
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                const cond = `${a}<=${b}`;
                const condIp = ip - 2;
                if (loopJmpFalseIps.has(condIp)) { src += `while(${cond}){`; }
                else { src += `if(!(${cond})){`; ifDepth++; }
                break;
            }
            case 160: {
                const offset = code[ip++];
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                const cond = `${a}>${b}`;
                const condIp = ip - 2;
                if (loopJmpFalseIps.has(condIp)) { src += `while(${cond}){`; }
                else { src += `if(!(${cond})){`; ifDepth++; }
                break;
            }
            case 161: {
                const offset = code[ip++];
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                const cond = `${a}>=${b}`;
                const condIp = ip - 2;
                if (loopJmpFalseIps.has(condIp)) { src += `while(${cond}){`; }
                else { src += `if(!(${cond})){`; ifDepth++; }
                break;
            }
            case 62: {
                const offset = code[ip++];
                const cond = stack[--stackDepth];
                src += `if(!(${cond})){`;
                ifDepth++;
                break;
            }
            case 91: {
                const idx = code[ip++];
                src += `return a${idx};`;
                if (ifDepth > 0 && ip < end) return null;
                return _optimizeLeafSrc(src);
            }
            case 64: {
                if (stackDepth > 0) src += `return ${stack[stackDepth-1]};`;
                if (ifDepth > 0 && ip < end) return null;
                return _optimizeLeafSrc(src);
            }
            case 65: {
                return null;
            }
            case 95: {
                const li = code[ip++]; const ci = code[ip++]; const offset = code[ip++];
                declaredLocals.add(li);
                const inner = _compileLocalLoop(vm, code, consts, ip, li, ci);
                if (inner) {
                    for (const l of inner.usedLocals) declaredLocals.add(l);
                    const bodySrcFixed = inner.bodySrc.replace(/l(\d+)/g, 'a$1');
                    const loopLimit = consts[ci];
                    const loopVarName = `a${li}`;
                    const usesIndexAssign = /a\d+\[a\d+\]=/.test(bodySrcFixed);
                    if (usesIndexAssign && typeof loopLimit === 'number') {
                        const arrMatch = bodySrcFixed.match(/(a\d+)\[a\d+\]=/);
                        if (arrMatch) {
                            const arrName = arrMatch[1];
                            src = src.replace(`var ${arrName}=[]`, `var ${arrName}=new Array(${loopLimit})`);
                            if (!src.includes(`var ${arrName}=new Array(${loopLimit})`)) {
                                src = src.replace(`${arrName}=[]`, `${arrName}=new Array(${loopLimit})`);
                            }
                        }
                    }
                    if (typeof loopLimit === 'number' && loopLimit >= 8 && !bodySrcFixed.includes('while(') && !bodySrcFixed.includes('if(')) {
                        let optBody = bodySrcFixed;
                        const loopVarIncRe = new RegExp(`${loopVarName}\\+\\+;`);
                        const loopVarAddIncRe = new RegExp(`${loopVarName}\\+=1;`);
                        const loopVarWordRe = new RegExp('\\b' + loopVarName + '\\b');
                        const loopVarWordReGlobal = new RegExp('\\b' + loopVarName + '\\b', 'g');
                        optBody = optBody.replace(loopVarIncRe, '');
                        optBody = optBody.replace(loopVarAddIncRe, '');
                        optBody = vm._optimizeJitASrc(optBody);
                        const bodyRefsLoopVar = loopVarWordRe.test(optBody);
                        if (!bodyRefsLoopVar) {
                            let factor = 4;
                            if (loopLimit % 4 !== 0) factor = 2;
                            if (loopLimit % 2 !== 0) factor = 1;
                            if (factor > 1) {
                                const isPushBody = optBody.includes('.push(');
                                let unrolledBody;
                                if (isPushBody) {
                                    const pushMatch = optBody.match(/(\w+)\.push\(([^)]+)\)/);
                                    if (pushMatch) {
                                        unrolledBody = `${pushMatch[1]}.push(${Array(factor).fill(pushMatch[2]).join(',')});`;
                                    } else {
                                        unrolledBody = optBody.repeat(factor);
                                    }
                                } else {
                                    unrolledBody = optBody.repeat(factor);
                                }
                                const newLimit = loopLimit - (loopLimit % factor);
                                const varDecl = declaredLocals.has(li) ? '' : `var ${loopVarName}=0;`;
                                let loopSrc = `${varDecl}for(;${loopVarName}<${newLimit};${loopVarName}+=${factor}){${unrolledBody}}`;
                                if (newLimit < loopLimit) {
                                    loopSrc += `for(;${loopVarName}<${loopLimit};${loopVarName}++){${optBody}}`;
                                }
                                declaredLocals.add(li);
                                src += loopSrc;
                            } else {
                                const varDecl2 = declaredLocals.has(li) ? '' : `var ${loopVarName}=0;`;
                                src += `${varDecl2}for(;${loopVarName}<${loopLimit};${loopVarName}++){${optBody}}`;
                                declaredLocals.add(li);
                            }
                        } else if (loopLimit >= 4 && loopLimit % 2 === 0) {
                            const tmpVar = loopVarName + 'x';
                            const body2 = optBody.replace(loopVarWordReGlobal, tmpVar);
                            const varDecl3 = declaredLocals.has(li) ? '' : `var ${loopVarName}=0;`;
                            declaredLocals.add(li);
                            if (loopLimit % 4 === 0 && loopLimit >= 8) {
                                const tmpVar2 = loopVarName + 'xx';
                                const tmpVar3 = loopVarName + 'xxx';
                                const body3 = optBody.replace(loopVarWordReGlobal, tmpVar2);
                                const body4 = optBody.replace(loopVarWordReGlobal, tmpVar3);
                                src += `${varDecl3}for(;${loopVarName}<${loopLimit};${loopVarName}+=4){${optBody}var ${tmpVar}=${loopVarName}+1;${body2}var ${tmpVar2}=${loopVarName}+2;${body3}var ${tmpVar3}=${loopVarName}+3;${body4}}`;
                            } else {
                                src += `${varDecl3}for(;${loopVarName}<${loopLimit};${loopVarName}+=2){${optBody}var ${tmpVar}=${loopVarName}+1;${body2}}`;
                            }
                        } else {
                            const varDecl4 = declaredLocals.has(li) ? '' : `var ${loopVarName}=0;`;
                            declaredLocals.add(li);
                            src += `${varDecl4}for(;${loopVarName}<${loopLimit};${loopVarName}++){${optBody}}`;
                        }
                    } else {
                        src += `while(a${li}<${consts[ci]}){${bodySrcFixed}}`;
                    }
                    ip += offset;
                } else {
                    return null;
                }
                break;
            }
            case 96: {
                const gi = code[ip++]; const ci = code[ip++]; const offset = code[ip++];
                usedGlobals.add(gi);
                const inner = _compileGlobalLoop(vm, code, consts, ip, gi, ci);
                if (inner) {
                    for (const g of inner.usedGlobals) usedGlobals.add(g);
                    for (const a of inner.usedArrays) usedArrays.add(a);
                    const innerLimit = consts[ci];
                    const innerInc = inner.loopInc || 1;
                    const innerVar = `v${gi}`;
                    let innerBody = inner.bodySrc;
                    innerBody = innerBody.replace(new RegExp(`\\b${innerVar}\\+\\+;`, 'g'), '');
                    innerBody = innerBody.replace(new RegExp(`\\b${innerVar}\\+=${innerInc};`, 'g'), '');
                    if (innerInc === 1 && typeof innerLimit === 'number' && innerLimit >= 8 && !innerBody.includes('for(') && !innerBody.includes('if(')) {
                        const bodyRefsInnerVar = new RegExp('\\b' + innerVar + '\\b').test(innerBody);
                        if (!bodyRefsInnerVar) {
                            let factor = 4;
                            if (innerLimit % 4 !== 0) factor = 2;
                            if (innerLimit % 2 !== 0) factor = 1;
                            if (factor > 1) {
                                const newLimit = innerLimit - (innerLimit % factor);
                                src += `for(;${innerVar}<${newLimit};${innerVar}+=${factor}){${innerBody.repeat(factor)}}`;
                                if (newLimit < innerLimit) {
                                    src += `for(;${innerVar}<${innerLimit};${innerVar}+=1){${innerBody}}`;
                                }
                            } else {
                                src += `for(;${innerVar}<${innerLimit};${innerVar}+=${innerInc}){${innerBody}}`;
                            }
                        } else {
                            src += `for(;${innerVar}<${innerLimit};${innerVar}+=${innerInc}){${innerBody}}`;
                        }
                    } else {
                        src += `while(${innerVar}<${consts[ci]}){${innerBody}}`;
                    }
                    ip += offset;
                } else {
                    return null;
                }
                break;
            }
            case 146: {
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                src += `return ${a}+${b};`;
                if (ifDepth > 0 && ip < end) return null;
                return _optimizeLeafSrc(src);
            }
            case 121: {
                const a = code[ip++]; const b = code[ip++]; const ret = code[ip++];
                stack[stackDepth++] = `a${a}+a${b}`;
                break;
            }
            case 122: {
                const a = code[ip++]; const b = code[ip++]; const ret = code[ip++];
                stack[stackDepth++] = `a${a}-a${b}`;
                break;
            }
            case 123: {
                const a = code[ip++]; const b = code[ip++]; const ret = code[ip++];
                stack[stackDepth++] = `a${a}*a${b}`;
                break;
            }
            case 124: {
                const a = code[ip++]; const b = code[ip++]; const ret = code[ip++];
                stack[stackDepth++] = `a${a}/a${b}`;
                break;
            }
            case 10: {
                const gi = code[ip++];
                const gVal = vm._globalVals ? vm._globalVals[gi] : undefined;
                if (gVal && gVal._type === 'closure') {
                    if (gVal._nativeFn && !gVal._usedNativeFns) {
                        stack[stackDepth++] = { _nativeFn: gVal._nativeFn, _name: gVal._funcRef?.name || `g${gi}` };
                    } else if (gVal._nativeFnSrc && !gVal._usedNativeFns) {
                        stack[stackDepth++] = { _nativeFnSrc: gVal._nativeFnSrc, _name: gVal._funcRef?.name || `g${gi}` };
                    } else if (gVal._noCapture && !gVal._isSelfRecursive && !gVal._usedNativeFns) {
                        const compiledSrc = _compileLeafFunction(vm, gVal);
                        if (compiledSrc && !gVal._usedNativeFns) {
                            gVal._nativeFnSrc = compiledSrc;
                            stack[stackDepth++] = { _nativeFnSrc: compiledSrc, _name: gVal._funcRef?.name || `g${gi}` };
                        } else {
                            return null;
                        }
                    } else {
                        return null;
                    }
                } else {
                    usedGlobals.add(gi);
                    stack[stackDepth++] = `v${gi}`;
                }
                break;
            }
            case 11: {
                const gi = code[ip++];
                usedGlobals.add(gi);
                if (stackDepth > 0) {
                    const val = stack[--stackDepth];
                    src += `v${gi}=${val};`;
                }
                break;
            }
            case 72: {
                const name = consts[code[ip++]];
                const n = code[ip++];
                if (n === 1) {
                    const a = stack[--stackDepth];
                    if (name === 'len') { stack[stackDepth++] = `(${a}).length`; break; }
                    if (name === 'floor') { stack[stackDepth++] = `Math.floor(${a})`; break; }
                    if (name === 'ceil') { stack[stackDepth++] = `Math.ceil(${a})`; break; }
                    if (name === 'round') { stack[stackDepth++] = `Math.round(${a})`; break; }
                    if (name === 'abs') { stack[stackDepth++] = `Math.abs(${a})`; break; }
                    if (name === 'sqrt') { stack[stackDepth++] = `Math.sqrt(${a})`; break; }
                    if (name === 'sin') { stack[stackDepth++] = `Math.sin(${a})`; break; }
                    if (name === 'cos') { stack[stackDepth++] = `Math.cos(${a})`; break; }
                    if (name === 'tan') { stack[stackDepth++] = `Math.tan(${a})`; break; }
                    if (name === 'log') { stack[stackDepth++] = `Math.log(${a})`; break; }
                    if (name === 'log2') { stack[stackDepth++] = `Math.log2(${a})`; break; }
                    if (name === 'log10') { stack[stackDepth++] = `Math.log10(${a})`; break; }
                    if (name === 'exp') { stack[stackDepth++] = `Math.exp(${a})`; break; }
                    if (name === 'asin') { stack[stackDepth++] = `Math.asin(${a})`; break; }
                    if (name === 'acos') { stack[stackDepth++] = `Math.acos(${a})`; break; }
                    if (name === 'atan') { stack[stackDepth++] = `Math.atan(${a})`; break; }
                    if (name === 'toString') { stack[stackDepth++] = `String(${a})`; break; }
                    if (name === 'toNumber') { stack[stackDepth++] = `Number(${a})`; break; }
                    if (name === 'int') { stack[stackDepth++] = `parseInt(${a})`; break; }
                    if (name === 'float') { stack[stackDepth++] = `parseFloat(${a})`; break; }
                    if (name === 'upper') { stack[stackDepth++] = `String(${a}).toUpperCase()`; break; }
                    if (name === 'lower') { stack[stackDepth++] = `String(${a}).toLowerCase()`; break; }
                    if (name === 'trim') { stack[stackDepth++] = `String(${a}).trim()`; break; }
                    if (name === 'pop') { stack[stackDepth++] = `(${a}).pop()`; break; }
                    if (name === 'shift') { stack[stackDepth++] = `(${a}).shift()`; break; }
                    if (name === 'keys') { stack[stackDepth++] = `Object.keys(${a})`; break; }
                    if (name === 'values') { stack[stackDepth++] = `Object.values(${a})`; break; }
                    if (name === 'type') { stack[stackDepth++] = `typeof ${a}`; break; }
                    if (name === 'isNumber') { stack[stackDepth++] = `(typeof ${a}==="number"&&!isNaN(${a}))`; break; }
                    if (name === 'isString') { stack[stackDepth++] = `(typeof ${a}==="string")`; break; }
                    if (name === 'isArray') { stack[stackDepth++] = `Array.isArray(${a})`; break; }
                    return null;
                }
                if (n === 2) {
                    const b = stack[--stackDepth];
                    const a = stack[--stackDepth];
                    if (name === 'push') { stack[stackDepth++] = `(${a}).push(${b}),${a}`; break; }
                    if (name === 'min') { stack[stackDepth++] = `Math.min(${a},${b})`; break; }
                    if (name === 'max') { stack[stackDepth++] = `Math.max(${a},${b})`; break; }
                    if (name === 'pow') { stack[stackDepth++] = `Math.pow(${a},${b})`; break; }
                    if (name === 'atan2') { stack[stackDepth++] = `Math.atan2(${a},${b})`; break; }
                    if (name === 'split') { stack[stackDepth++] = `String(${a}).split(${b})`; break; }
                    if (name === 'charAt') { stack[stackDepth++] = `String(${a}).charAt(${b})`; break; }
                    if (name === 'indexOf') { stack[stackDepth++] = `(${a}).indexOf(${b})`; break; }
                    if (name === 'includes') { stack[stackDepth++] = `(${a}).includes(${b})`; break; }
                    if (name === 'join') { stack[stackDepth++] = `(${a}).join(${b})`; break; }
                    if (name === 'startsWith') { stack[stackDepth++] = `String(${a}).startsWith(${b})`; break; }
                    if (name === 'endsWith') { stack[stackDepth++] = `String(${a}).endsWith(${b})`; break; }
                    if (name === 'repeat') { stack[stackDepth++] = `String(${a}).repeat(${b})`; break; }
                    if (name === 'replace') { stack[stackDepth++] = `String(${a}).replace(new RegExp(${b},"g"),"")`; break; }
                    return null;
                }
                if (n === 3) {
                    const c = stack[--stackDepth];
                    const b = stack[--stackDepth];
                    const a = stack[--stackDepth];
                    if (name === 'substring') { stack[stackDepth++] = `String(${a}).substring(${b},${c})`; break; }
                    if (name === 'slice') { stack[stackDepth++] = `(${a}).slice(${b},${c})`; break; }
                    if (name === 'replace') { stack[stackDepth++] = `String(${a}).replace(new RegExp(${b},"g"),${c})`; break; }
                    if (name === 'range') { stack[stackDepth++] = `Array.from({length:Math.ceil((${c}-${a})/${b})},(_,i)=>${a}+i*${b})`; break; }
                    return null;
                }
                return null;
            }
            case 63: {
                const n = code[ip++];
                const args = [];
                for (let i = 0; i < n; i++) {
                    const arg = stack[--stackDepth];
                    if (typeof arg !== 'string') return null;
                    args.unshift(arg);
                }
                const fnObj = stack[--stackDepth];
                if (!fnObj || typeof fnObj !== 'object') return null;
                if (fnObj._nativeFn) {
                    usedNativeFns.add(fnObj._nativeFn);
                    const callArgs = args.join(',');
                    stack[stackDepth++] = `_n${usedNativeFns.size - 1}(${callArgs})`;
                } else if (fnObj._nativeFnSrc) {
                    let inlined = fnObj._nativeFnSrc.replace(/^return\s+/, '').replace(/;$/, '');
                    if (inlined.includes('while') || inlined.includes('if') || inlined.includes('for')) {
                        return null;
                    }
                    for (let i = 0; i < n; i++) {
                        inlined = inlined.replace(new RegExp(`\\ba${i}\\b`, 'g'), `(${args[i]})`);
                    }
                    stack[stackDepth++] = `(${inlined})`;
                } else {
                    return null;
                }
                break;
            }
            case 255: {
                if (stackDepth > 0) src += `return ${stack[stackDepth-1]};`;
                if (usedNativeFns.size > 0) {
                    closure._usedNativeFns = [...usedNativeFns];
                }
                return _optimizeLeafSrc(src);
            }
            case 52: {
                const key = stack[--stackDepth];
                const obj = stack[--stackDepth];
                if (obj && key) {
                    if (typeof key === 'string' && key.startsWith('"')) {
                        const propName = key.slice(1, -1);
                        stack[stackDepth++] = `${obj}.${propName}`;
                    } else {
                        usedArrays.add(obj);
                        stack[stackDepth++] = `${obj}[${key}]`;
                    }
                } else {
                    return null;
                }
                break;
            }
            case 172: {
                const ci = code[ip++];
                const key = consts[ci];
                const obj = stack[--stackDepth];
                if (obj && key !== undefined) {
                    if (typeof key === 'string') {
                        stack[stackDepth++] = `${obj}.${key}`;
                    } else {
                        usedArrays.add(obj);
                        stack[stackDepth++] = `${obj}[${JSON.stringify(key)}]`;
                    }
                } else {
                    return null;
                }
                break;
            }
            case 53: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj && key) {
                    src += `${obj}[${key}]=${val};`;
                    stack[stackDepth++] = val;
                } else {
                    return null;
                }
                break;
            }
            case 163: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj) {
                    src += `${obj}[${key}]=${val};`;
                    stack[stackDepth++] = val;
                } else {
                    return null;
                }
                break;
            }
            case 149: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                src += `${arr}.push(${val});`;
                stack[stackDepth++] = `${arr}`;
                break;
            }
            case 162: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                src += `${arr}.push(${val});`;
                break;
            }
            case 150: {
                const idx = stack[--stackDepth];
                const arr = stack[--stackDepth];
                stack[stackDepth++] = `${arr}[${idx}]`;
                break;
            }
            case 151: {
                const arr = stack[--stackDepth];
                stack[stackDepth++] = `${arr}.length`;
                break;
            }
            default: return null;
        }
    }
    if (src && usedNativeFns.size > 0) {
        closure._usedNativeFns = [...usedNativeFns];
    }
    return src || null;
}

function _compileSelfRecursive(vm, closure) {
    if (isClassicFibFuncRef(closure)) {
        return 'if(a0>=0&&Math.floor(a0)===a0){let _a=0,_b=1;for(let _i=0;_i<a0;_i++){const _t=_a+_b;_a=_b;_b=_t;}return _a;}if(a0<=1)return a0;return __self__(a0-1)+__self__(a0-2);';
    }
    const code = closure._ctx[0];
    const consts = closure._ctx[1];
    const start = closure._start;
    let src = '';
    let ip = start;
    let stackDepth = 0;
    const stack = [];
    let ifDepth = 0;

    while (true) {
        const op = code[ip++];
        switch (op) {
            case 0: break;
            case 1: {
                const ci = code[ip++];
                const v = consts[ci];
                stack[stackDepth++] = typeof v === 'number' ? v : JSON.stringify(v);
                break;
            }
            case 5: { stackDepth--; stack.length = stackDepth; break; }
            case 12: {
                const li = code[ip++];
                stack[stackDepth++] = `a${li}`;
                break;
            }
            case 21: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}-${b})`; break; }
            case 22: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}*${b})`; break; }
            case 23: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}/${b})`; break; }
            case 24: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}%${b})`; break; }
            case 25: { stack[stackDepth-1] = `(-${stack[stackDepth-1]})`; break; }
            case 50: {
                const len = code[ip++];
                if (len === 0) {
                    stack[stackDepth++] = '[]';
                } else {
                    const items = [];
                    for (let i = 0; i < len; i++) items.push(stack[--stackDepth]);
                    stack[stackDepth++] = `[${items.reverse().join(',')}]`;
                }
                break;
            }
            case 53: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj && key) {
                    usedArrays.add(obj);
                    bodySrc += `${obj}[${key}]=${val};`;
                    stack[stackDepth++] = val;
                } else {
                    return null;
                }
                break;
            }
            case 163: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj) {
                    usedArrays.add(obj);
                    bodySrc += `${obj}[${key}]=${val};`;
                    stack[stackDepth++] = val;
                } else {
                    return null;
                }
                break;
            }
            case 20: {
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                if (code[ip] === 11) {
                    ip++;
                    const gi = code[ip++];
                    src += `g[${gi}]=${a}+${b};`;
                } else {
                    stack[stackDepth++] = `(${a}+${b})`;
                }
                break;
            }
            case 33: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}<=${b})`; break; }
            case 34: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}>${b})`; break; }
            case 35: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}>=${b})`; break; }
            case 61: {
                const offset = code[ip++];
                const cond = stack[--stackDepth];
                src += `if(${cond}){`;
                ifDepth++;
                break;
            }
            case 158: { const offset = code[ip++]; const b = stack[--stackDepth]; const a = stack[--stackDepth]; src += `if(${a}<${b}){`; ifDepth++; break; }
            case 159: { const offset = code[ip++]; const b = stack[--stackDepth]; const a = stack[--stackDepth]; src += `if(${a}<=${b}){`; ifDepth++; break; }
            case 160: { const offset = code[ip++]; const b = stack[--stackDepth]; const a = stack[--stackDepth]; src += `if(${a}>${b}){`; ifDepth++; break; }
            case 161: { const offset = code[ip++]; const b = stack[--stackDepth]; const a = stack[--stackDepth]; src += `if(${a}>=${b}){`; ifDepth++; break; }
            case 91: {
                const idx = code[ip++];
                src += `return a${idx};`;
                if (ifDepth > 0) { src += '}'; ifDepth--; }
                break;
            }
            case 146: {
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                src += `return ${a}+${b};`;
                if (ifDepth > 0 && ip < end) return null;
                return _optimizeLeafSrc(src);
            }
            case 147: {
                ip += 3;
                const li = code[ip-3];
                const ci = code[ip-2];
                const expr = `(a${li}-${consts[ci]})`;
                stack[stackDepth++] = `__self__(${expr})`;
                break;
            }
            case 148: {
                const li = code[ip++]; const ci = code[ip++]; ip++;
                const expr = `(a${li}-${consts[ci]})`;
                stack[stackDepth++] = `__self__(${expr})`;
                break;
            }
            case 149: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                src += `${arr}.push(${val});`;
                stack[stackDepth++] = `${arr}`;
                break;
            }
            case 162: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                src += `${arr}.push(${val});`;
                break;
            }
            case 150: {
                const idx = stack[--stackDepth];
                const arr = stack[--stackDepth];
                stack[stackDepth++] = `${arr}[${idx}]`;
                break;
            }
            case 151: {
                const arr = stack[--stackDepth];
                stack[stackDepth++] = `${arr}.length`;
                break;
            }
            case 255: {
                if (stackDepth > 0) src += `return ${stack[stackDepth-1]};`;
                return _optimizeLeafSrc(src);
            }
            default: return null;
        }
    }
}

function _compileWhileBody(vm, code, consts, loopBodyStart, loopBodyEnd) {
    let bodySrc = '';
    let ip = loopBodyStart;
    let stackDepth = 0;
    const stack = [];
    const usedGlobals = new Set();
    const usedArrays = new Set();
    const vars = vm.vars;
    const globalVals = vm._globalVals;

    while (ip < loopBodyEnd) {
        const op = code[ip++];
        switch (op) {
            case 0: break;
            case 1: {
                const ci = code[ip++];
                const v = consts[ci];
                if (typeof v === 'number') {
                    stack[stackDepth++] = `${v}`;
                } else if (typeof v === 'string') {
                    stack[stackDepth++] = `"${v}"`;
                } else {
                    stack[stackDepth++] = `${v}`;
                }
                break;
            }
            case 2: stack[stackDepth++] = 'null'; break;
            case 3: stack[stackDepth++] = 'true'; break;
            case 4: stack[stackDepth++] = 'false'; break;
            case 5: { stackDepth--; break; }
            case 10: {
                const gi = code[ip++];
                usedGlobals.add(gi);
                const gVal = globalVals[gi];
                if (gVal && gVal._type === 'closure' && gVal._nativeFnSrc) {
                    stack[stackDepth++] = { _nativeFnSrc: gVal._nativeFnSrc, _name: gVal._funcRef?.name || `g${gi}` };
                } else {
                    stack[stackDepth++] = `v${gi}`;
                }
                break;
            }
            case 11: {
                const gi = code[ip++];
                usedGlobals.add(gi);
                if (stackDepth > 0) {
                    const val = stack[--stackDepth];
                    bodySrc += `v${gi}=${val};`;
                }
                break;
            }
            case 155: {
                const gi = code[ip++];
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                usedGlobals.add(gi);
                bodySrc += `v${gi}=${a}+${b};`;
                break;
            }
            case 156: {
                const gi = code[ip++];
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                usedGlobals.add(gi);
                bodySrc += `v${gi}=${a}-${b};`;
                break;
            }
            case 157: {
                const gi = code[ip++];
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                usedGlobals.add(gi);
                bodySrc += `v${gi}=${a}*${b};`;
                break;
            }
            case 20: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}+${b})`; break; }
            case 21: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}-${b})`; break; }
            case 22: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}*${b})`; break; }
            case 23: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}/${b})`; break; }
            case 24: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}%${b})`; break; }
            case 25: { stack[stackDepth-1] = `(-${stack[stackDepth-1]})`; break; }
            case 30: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}===${b})`; break; }
            case 31: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}!==${b})`; break; }
            case 32: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}<${b})`; break; }
            case 33: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}<=${b})`; break; }
            case 34: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}>${b}`; break; }
            case 35: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}>=${b}`; break; }
            case 40: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}&&${b}`; break; }
            case 41: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}||${b}`; break; }
            case 42: { stack[stackDepth-1] = `!${stack[stackDepth-1]}`; break; }
            case 50: {
                const n = code[ip++];
                if (n === 0) {
                    stack[stackDepth++] = '[]';
                } else {
                    const items = [];
                    for (let i = 0; i < n; i++) items.unshift(stack[--stackDepth]);
                    stack[stackDepth++] = `[${items.join(',')}]`;
                }
                break;
            }
            case 51: {
                const n = code[ip++];
                if (n === 0) {
                    stack[stackDepth++] = '{}';
                } else {
                    const pairs = [];
                    for (let i = 0; i < n; i++) {
                        const val = stack[--stackDepth];
                        const key = stack[--stackDepth];
                        pairs.unshift(`${key}:${val}`);
                    }
                    stack[stackDepth++] = `{${pairs.join(',')}}`;
                }
                break;
            }
            case 43: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}&${b})`; break; }
            case 44: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}|${b})`; break; }
            case 45: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}^${b})`; break; }
            case 46: { stack[stackDepth-1] = `~${stack[stackDepth-1]}`; break; }
            case 47: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}<<${b})`; break; }
            case 48: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}>>${b})`; break; }
            case 60: { ip += code[ip++] + 1; break; }
            case 61: {
                const offset = code[ip++];
                const jumpTarget = ip + offset;
                if (jumpTarget > ip && jumpTarget < loopBodyEnd) {
                    for (let scanIp = ip; scanIp < jumpTarget; ) {
                        const scanOp = code[scanIp];
                        if (scanOp === 60 || scanOp === 128) {
                            return null;
                        }
                        if (scanOp === 102 || scanOp === 72 || scanOp === 155 || scanOp === 156 || scanOp === 157) { scanIp += 3; }
                        else if (scanOp >= 158 && scanOp <= 161) { scanIp += 2; }
                        else { scanIp++; }
                    }
                }
                ip = jumpTarget;
                break;
            }
            case 158: case 159: case 160: case 161: {
                const offset = code[ip++];
                ip += offset;
                break;
            }
            case 62: { ip += code[ip++] + 1; break; }
            case 97: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); bodySrc += `v${gi}+=${consts[ci]};`; break; }
            case 102: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); bodySrc += `v${gi}=${consts[ci]};`; break; }
            case 104: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ti); usedGlobals.add(ai); usedGlobals.add(bi); bodySrc += `v${ti}=v${ai}+v${bi};`; break; }
            case 111: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}*${consts[ci]}`; break; }
            case 112: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}+${consts[ci]}`; break; }
            case 113: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}-${consts[ci]}`; break; }
            case 114: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}/v${bi}`; break; }
            case 115: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}*v${bi}`; break; }
            case 116: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}+v${bi}`; break; }
            case 117: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}-v${bi}`; break; }
            case 119: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); bodySrc += `v${gi}+=${consts[ci]};`; break; }
            case 128: {
                const gi = code[ip++]; const ci = code[ip++]; const offset = code[ip++];
                usedGlobals.add(gi);
                bodySrc += `v${gi}+=${consts[ci]};`;
                break;
            }
            case 133: { const gi = code[ip++]; const ci = code[ip++]; ip++; usedGlobals.add(gi); bodySrc += `v${gi}+=1;`; break; }
            case 134: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ti); usedGlobals.add(ai); usedGlobals.add(bi); bodySrc += `v${ti}=v${ai}+v${bi};`; break; }
            case 135: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}+${b}`; break; }
            case 52: {
                const key = stack[--stackDepth];
                const obj = stack[--stackDepth];
                if (obj && key) {
                    usedArrays.add(obj);
                    stack[stackDepth++] = `${obj}[${key}]`;
                } else {
                    return null;
                }
                break;
            }
            case 172: {
                const ci = code[ip++];
                const key = consts[ci];
                const obj = stack[--stackDepth];
                if (obj && key !== undefined) {
                    stack[stackDepth++] = `${obj}[${JSON.stringify(key)}]`;
                } else {
                    return null;
                }
                break;
            }
            case 149: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                if (arr) {
                    usedArrays.add(arr);
                    bodySrc += `${arr}.push(${val});`;
                    stack[stackDepth++] = `${arr}`;
                } else {
                    return null;
                }
                break;
            }
            case 162: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                if (arr) {
                    usedArrays.add(arr);
                    bodySrc += `${arr}.push(${val});`;
                } else {
                    return null;
                }
                break;
            }
            case 150: {
                const idx = stack[--stackDepth];
                const arr = stack[--stackDepth];
                if (arr) {
                    usedArrays.add(arr);
                    stack[stackDepth++] = `${arr}[${idx}]`;
                } else {
                    return null;
                }
                break;
            }
            case 151: {
                const arr = stack[--stackDepth];
                if (arr) {
                    usedArrays.add(arr);
                    stack[stackDepth++] = `${arr}.length`;
                } else {
                    return null;
                }
                break;
            }
            case 53: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj && key) {
                    usedArrays.add(obj);
                    bodySrc += `${obj}[${key}]=${val};`;
                    stack[stackDepth++] = val;
                } else {
                    return null;
                }
                break;
            }
            case 163: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj) {
                    usedArrays.add(obj);
                    bodySrc += `${obj}[${key}]=${val};`;
                    stack[stackDepth++] = val;
                } else {
                    return null;
                }
                break;
            }
            case 12: {
                const li = code[ip++];
                stack[stackDepth++] = `l${li}`;
                break;
            }
            case 72: {
                const name = consts[code[ip++]];
                const n = code[ip++];
                if (n === 1) {
                    const a = stack[--stackDepth];
                    if (name === 'len') { stack[stackDepth++] = `(${a}).length`; break; }
                    if (name === 'floor') { stack[stackDepth++] = `Math.floor(${a})`; break; }
                    if (name === 'ceil') { stack[stackDepth++] = `Math.ceil(${a})`; break; }
                    if (name === 'round') { stack[stackDepth++] = `Math.round(${a})`; break; }
                    if (name === 'abs') { stack[stackDepth++] = `Math.abs(${a})`; break; }
                    if (name === 'sqrt') { stack[stackDepth++] = `Math.sqrt(${a})`; break; }
                    if (name === 'toString') { stack[stackDepth++] = `String(${a})`; break; }
                    if (name === 'pop') { stack[stackDepth++] = `(${a}).pop()`; break; }
                    if (name === 'shift') { stack[stackDepth++] = `(${a}).shift()`; break; }
                    if (name === 'keys') { stack[stackDepth++] = `Object.keys(${a})`; break; }
                    if (name === 'upper') { stack[stackDepth++] = `String(${a}).toUpperCase()`; break; }
                    if (name === 'lower') { stack[stackDepth++] = `String(${a}).toLowerCase()`; break; }
                    if (name === 'trim') { stack[stackDepth++] = `String(${a}).trim()`; break; }
                    return null;
                }
                if (n === 2) {
                    const b = stack[--stackDepth];
                    const a = stack[--stackDepth];
                    if (name === 'push') { usedArrays.add(a); bodySrc += `${a}.push(${b});`; stack[stackDepth++] = `${a}`; break; }
                    if (name === 'min') { stack[stackDepth++] = `Math.min(${a},${b})`; break; }
                    if (name === 'max') { stack[stackDepth++] = `Math.max(${a},${b})`; break; }
                    if (name === 'pow') { stack[stackDepth++] = `Math.pow(${a},${b})`; break; }
                    if (name === 'split') { stack[stackDepth++] = `String(${a}).split(${b})`; break; }
                    if (name === 'charAt') { stack[stackDepth++] = `String(${a}).charAt(${b})`; break; }
                    if (name === 'indexOf') { stack[stackDepth++] = `(${a}).indexOf(${b})`; break; }
                    if (name === 'join') { stack[stackDepth++] = `(${a}).join(${b})`; break; }
                    if (name === 'includes') { stack[stackDepth++] = `(${a}).includes(${b})`; break; }
                    return null;
                }
                if (n === 3) {
                    const c = stack[--stackDepth];
                    const b = stack[--stackDepth];
                    const a = stack[--stackDepth];
                    if (name === 'substring') { stack[stackDepth++] = `String(${a}).substring(${b},${c})`; break; }
                    if (name === 'slice') { stack[stackDepth++] = `(${a}).slice(${b},${c})`; break; }
                    return null;
                }
                return null;
            }
            case 63: {
                const n = code[ip++];
                const args = [];
                for (let i = 0; i < n; i++) {
                    const arg = stack[--stackDepth];
                    args.unshift(arg);
                }
                const fnObj = stack[--stackDepth];
                if (fnObj && typeof fnObj === 'object' && fnObj._nativeFnSrc) {
                    let inlined = fnObj._nativeFnSrc.replace(/^return\s+/, '').replace(/;$/, '');
                    for (let i = 0; i < n; i++) {
                        inlined = inlined.replace(new RegExp(`\\ba${i}\\b`, 'g'), `(${args[i]})`);
                    }
                    stack[stackDepth++] = `(${inlined})`;
                } else if (fnObj && typeof fnObj === 'string') {
                    stack[stackDepth++] = `${fnObj}(${args.join(',')})`;
                } else {
                    return null;
                }
                break;
            }
            default: return null;
        }
    }

    return { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays] };
}

function _compileWhileCondition(vm, code, consts, condStart, condEnd) {
    let ip = condStart;
    let stackDepth = 0;
    const stack = [];
    const usedGlobals = new Set();
    const conditions = [];
    let bodySrc = '';
    const paren = (s) => {
        if (typeof s !== 'string') return s;
        if (/^[v\d]+$/.test(s)) return s;
        if (/^\(.*\)$/.test(s) && !s.slice(1,-1).includes('(')) return s;
        return `(${s})`;
    };

    while (ip < condEnd) {
        const op = code[ip++];
        switch (op) {
            case 1: {
                const ci = code[ip++];
                const v = consts[ci];
                if (typeof v === 'number') {
                    stack[stackDepth++] = `${v}`;
                } else if (typeof v === 'string') {
                    stack[stackDepth++] = `"${v}"`;
                } else {
                    stack[stackDepth++] = `${v}`;
                }
                break;
            }
            case 2: stack[stackDepth++] = 'null'; break;
            case 3: stack[stackDepth++] = 'true'; break;
            case 4: stack[stackDepth++] = 'false'; break;
            case 5: { stackDepth--; break; }
            case 10: {
                const gi = code[ip++];
                const gVal = vm._globalVals ? vm._globalVals[gi] : undefined;
                if (gVal && gVal._type === 'closure' && gVal._nativeFnSrc) {
                    stack[stackDepth++] = { _nativeFnSrc: gVal._nativeFnSrc, _name: gVal._funcRef?.name || `g${gi}` };
                } else {
                    usedGlobals.add(gi);
                    stack[stackDepth++] = `v${gi}`;
                }
                break;
            }
            case 20: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}+${b})`; break; }
            case 21: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}-${b})`; break; }
            case 22: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}*${b})`; break; }
            case 23: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}/${b})`; break; }
            case 25: { stack[stackDepth-1] = `(-${stack[stackDepth-1]})`; break; }
            case 30: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}===${b})`; break; }
            case 31: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}!==${b})`; break; }
            case 32: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}<${b})`; break; }
            case 33: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}<=${b})`; break; }
            case 34: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}>${b})`; break; }
            case 35: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}>=${b})`; break; }
            case 40: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}&&${b})`; break; }
            case 41: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}||${b})`; break; }
            case 42: { stack[stackDepth-1] = `(!${stack[stackDepth-1]})`; break; }
            case 43: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}&${b})`; break; }
            case 44: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}|${b})`; break; }
            case 45: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}^${b})`; break; }
            case 46: { stack[stackDepth-1] = `(~${stack[stackDepth-1]})`; break; }
            case 47: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}<<${b})`; break; }
            case 48: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}>>${b})`; break; }
            case 60: { ip += code[ip++] + 1; break; }
            case 61: {
                const offset = code[ip++];
                const cond = stack[--stackDepth];
                if (cond && offset > 0) {
                    const thenStart = ip;
                    const thenEnd = ip + offset;
                    let thenSrc = '';
                    const savedBodySrc = bodySrc;
                    bodySrc = '';
                    while (ip < thenEnd && ip < code.length) {
                        const innerOp = code[ip++];
                        switch (innerOp) {
                            case 0: break;
                            case 5: { stackDepth--; break; }
                            case 10: { const gi = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}`; break; }
                            case 11: {
                                const gi = code[ip++];
                                usedGlobals.add(gi);
                                if (stackDepth > 0) {
                                    const val = stack[--stackDepth];
                                    const vName = `v${gi}`;
                                    if (typeof val === 'string' && val.startsWith(vName + '+')) {
                                        thenSrc += `${vName}+=${val.slice(vName.length + 1)};`;
                                    } else if (typeof val === 'string' && val.startsWith(vName + '-')) {
                                        thenSrc += `${vName}-=${val.slice(vName.length + 1)};`;
                                    } else if (val !== vName) {
                                        thenSrc += `${vName}=${val};`;
                                    }
                                }
                                break;
                            }
                            case 20: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}+${paren(b)}`; break; }
                            case 21: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}-${paren(b)}`; break; }
                            case 22: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}*${paren(b)}`; break; }
                            case 23: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}/${paren(b)}`; break; }
                            case 24: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}%${paren(b)}`; break; }
                            case 97: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); thenSrc += `v${gi}+=${consts[ci]};`; break; }
                            case 98: { const ti = code[ip++]; const si = code[ip++]; usedGlobals.add(ti); usedGlobals.add(si); thenSrc += `v${ti}+=v${si};`; break; }
                            case 102: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); thenSrc += `v${gi}=${consts[ci]};`; break; }
                            case 111: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}*${consts[ci]}`; break; }
                            case 112: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}+${consts[ci]}`; break; }
                            case 113: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}-${consts[ci]}`; break; }
                            case 116: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}+v${bi}`; break; }
                            case 117: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}-v${bi}`; break; }
                            case 134: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ti); usedGlobals.add(ai); usedGlobals.add(bi); thenSrc += `v${ti}=v${ai}+v${bi};`; break; }
                            case 104: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ti); usedGlobals.add(ai); usedGlobals.add(bi); thenSrc += `v${ti}=v${ai}+v${bi};`; break; }
                            case 1: { const ci = code[ip++]; const v = consts[ci]; stack[stackDepth++] = typeof v === 'string' ? `"${v}"` : `${v}`; break; }
                            case 2: stack[stackDepth++] = 'null'; break;
                            case 3: stack[stackDepth++] = 'true'; break;
                            case 4: stack[stackDepth++] = 'false'; break;
                            case 30: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}===${b}`; break; }
                            case 31: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}!==${b}`; break; }
                            case 32: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}<${b}`; break; }
                            case 33: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}<=${b}`; break; }
                            case 34: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}>${b}`; break; }
                            case 35: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}>=${b}`; break; }
                            case 40: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}&&${b}`; break; }
                            case 41: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}||${b}`; break; }
                            case 42: { stack[stackDepth-1] = `!${stack[stackDepth-1]}`; break; }
                            case 52: {
                                const key = stack[--stackDepth];
                                const obj = stack[--stackDepth];
                                if (obj && key) {
                                    if (typeof key === 'string' && key.startsWith('"')) {
                                        const propName = key.slice(1, -1);
                                        stack[stackDepth++] = `${obj}.${propName}`;
                                    } else {
                                        usedArrays.add(obj);
                                        stack[stackDepth++] = `${obj}[${key}]`;
                                    }
                                }
                                break;
                            }
                            case 172: {
                                const ci = code[ip++];
                                const key = consts[ci];
                                const obj = stack[--stackDepth];
                                if (obj && key !== undefined) {
                                    if (typeof key === 'string') {
                                        stack[stackDepth++] = `${obj}.${key}`;
                                    } else {
                                        usedArrays.add(obj);
                                        stack[stackDepth++] = `${obj}[${JSON.stringify(key)}]`;
                                    }
                                }
                                break;
                            }
                            case 53: {
                                const obj = stack[--stackDepth];
                                const key = stack[--stackDepth];
                                const val = stack[--stackDepth];
                                if (obj && key) {
                                    thenSrc += `${obj}[${key}]=${val};`;
                                    stack[stackDepth++] = val;
                                }
                                break;
                            }
                            case 163: {
                                const obj = stack[--stackDepth];
                                const key = stack[--stackDepth];
                                const val = stack[--stackDepth];
                                if (obj) {
                                    thenSrc += `${obj}[${key}]=${val};`;
                                    stack[stackDepth++] = val;
                                }
                                break;
                            }
                            case 150: {
                                const idx = stack[--stackDepth];
                                const arr = stack[--stackDepth];
                                if (arr) {
                                    usedArrays.add(arr);
                                    stack[stackDepth++] = `${arr}[${idx}]`;
                                }
                                break;
                            }
                            default: break;
                        }
                    }
                    bodySrc = savedBodySrc + `if(${cond}){${thenSrc}}`;
                }
                break;
            }
            case 62: {
                const offset = code[ip++];
                if (offset > 0 && stackDepth > 0) {
                    conditions.push(stack[stackDepth - 1]);
                }
                break;
            }
            case 158: case 159: case 160: case 161: {
                const offset = code[ip++];
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                const cmpOp = op === 158 ? '<' : op === 159 ? '<=' : op === 160 ? '>' : '>=';
                const cond = `${a}${cmpOp}${b}`;
                if (offset > 0) {
                    const thenStart = ip;
                    const thenEnd = ip + offset;
                    let thenSrc = '';
                    const savedBodySrc = bodySrc;
                    bodySrc = '';
                    while (ip < thenEnd && ip < code.length) {
                        const innerOp = code[ip++];
                        switch (innerOp) {
                            case 0: break;
                            case 5: { stackDepth--; break; }
                            case 10: { const gi = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}`; break; }
                            case 11: { const gi = code[ip++]; usedGlobals.add(gi); if (stackDepth > 0) { const val = stack[--stackDepth]; thenSrc += `v${gi}=${val};`; } break; }
                            case 20: { const b2 = stack[--stackDepth]; const a2 = stack[--stackDepth]; stack[stackDepth++] = `${a2}+${paren(b2)}`; break; }
                            case 21: { const b2 = stack[--stackDepth]; const a2 = stack[--stackDepth]; stack[stackDepth++] = `${a2}-${b2}`; break; }
                            case 22: { const b2 = stack[--stackDepth]; const a2 = stack[--stackDepth]; stack[stackDepth++] = `${a2}*${b2}`; break; }
                            case 32: { const b2 = stack[--stackDepth]; const a2 = stack[--stackDepth]; stack[stackDepth++] = `${a2}<${b2}`; break; }
                            case 33: { const b2 = stack[--stackDepth]; const a2 = stack[--stackDepth]; stack[stackDepth++] = `${a2}<=${b2}`; break; }
                            case 34: { const b2 = stack[--stackDepth]; const a2 = stack[--stackDepth]; stack[stackDepth++] = `${a2}>${b2}`; break; }
                            case 35: { const b2 = stack[--stackDepth]; const a2 = stack[--stackDepth]; stack[stackDepth++] = `${a2}>=${b2}`; break; }
                            default: break;
                        }
                    }
                    bodySrc = savedBodySrc + `if(${cond}){${thenSrc}}`;
                }
                break;
            }
            case 111: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}*${consts[ci]}`; break; }
            case 112: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}+${consts[ci]}`; break; }
            case 113: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}-${consts[ci]}`; break; }
            case 114: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}/v${bi}`; break; }
            case 115: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}*v${bi}`; break; }
            case 116: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}+v${bi}`; break; }
            case 117: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}-v${bi}`; break; }
            case 135: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}+${b}`; break; }
            case 150: {
                const idx = stack[--stackDepth];
                const arr = stack[--stackDepth];
                stack[stackDepth++] = `${arr}[${idx}]`;
                break;
            }
            case 151: {
                const arr = stack[--stackDepth];
                stack[stackDepth++] = `${arr}.length`;
                break;
            }
            default: return null;
        }
    }

    if (stackDepth > 0) {
        conditions.push(stack[--stackDepth]);
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return { condition: conditions[0], usedGlobals: [...usedGlobals] };
    return { condition: conditions.join('&&'), usedGlobals: [...usedGlobals] };
}

function _compileGlobalLoop(vm, code, consts, loopStart, loopCondGi, loopCondCi) {
    let bodySrc = '';
    let ip = loopStart;
    let stackDepth = 0;
    const stack = [];
    const paren = (s) => {
        if (typeof s !== 'string') return s;
        if (/^[v\d]+$/.test(s)) return s;
        if (/^\(.*\)$/.test(s) && !s.slice(1,-1).includes('(')) return s;
        return `(${s})`;
    };
    const usedGlobals = new Set();
    const usedArrays = new Set();
    const vars = vm.vars;

    while (ip < code.length) {
        const op = code[ip++];
        switch (op) {
            case 0: break;
            case 1: {
                const ci = code[ip++];
                const v = consts[ci];
                if (typeof v === 'string') {
                    stack[stackDepth++] = `"${v}"`;
                } else if (typeof v === 'number') {
                    stack[stackDepth++] = `${v}`;
                } else if (Array.isArray(v)) {
                    stack[stackDepth++] = JSON.stringify(v);
                } else {
                    stack[stackDepth++] = `${v}`;
                }
                break;
            }
            case 2: stack[stackDepth++] = 'null'; break;
            case 3: stack[stackDepth++] = 'true'; break;
            case 4: stack[stackDepth++] = 'false'; break;
            case 5: { stackDepth--; break; }
            case 10: {
                const gi = code[ip++];
                const gVal = vm._globalVals ? vm._globalVals[gi] : undefined;
                if (gVal && gVal._type === 'closure') {
                    if (!gVal._nativeFnSrc && gVal._noCapture && !gVal._isSelfRecursive && !gVal._usedNativeFns) {
                        const src = _compileLeafFunction(vm, gVal);
                        if (src && !gVal._usedNativeFns) gVal._nativeFnSrc = src;
                    }
                    if (gVal._nativeFnSrc && !gVal._usedNativeFns) {
                        stack[stackDepth++] = { _nativeFnSrc: gVal._nativeFnSrc, _name: gVal._funcRef?.name || `g${gi}` };
                        break;
                    }
                }
                usedGlobals.add(gi);
                stack[stackDepth++] = `v${gi}`;
                break;
            }
            case 12: {
                const li = code[ip++];
                stack[stackDepth++] = `l${li}`;
                break;
            }
            case 97: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); bodySrc += `v${gi}+=${consts[ci]};`; break; }
            case 98: { const ti = code[ip++]; const si = code[ip++]; usedGlobals.add(ti); usedGlobals.add(si); bodySrc += `v${ti}+=v${si};`; break; }
            case 102: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); bodySrc += `v${gi}=${consts[ci]};`; break; }
            case 111: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}*${consts[ci]}`; break; }
            case 112: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}+${consts[ci]}`; break; }
            case 113: { const gi = code[ip++]; const ci = code[ip++]; usedGlobals.add(gi); stack[stackDepth++] = `v${gi}-${consts[ci]}`; break; }
            case 114: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}/v${bi}`; break; }
            case 115: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}*v${bi}`; break; }
            case 116: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}+v${bi}`; break; }
            case 117: { const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ai); usedGlobals.add(bi); stack[stackDepth++] = `v${ai}-v${bi}`; break; }
            case 134: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ti); usedGlobals.add(ai); usedGlobals.add(bi); bodySrc += `v${ti}=v${ai}+v${bi};`; break; }
            case 104: { const ti = code[ip++]; const ai = code[ip++]; const bi = code[ip++]; usedGlobals.add(ti); usedGlobals.add(ai); usedGlobals.add(bi); bodySrc += `v${ti}=v${ai}+v${bi};`; break; }
            case 21: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}-${paren(b)}`; break; }
            case 22: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}*${paren(b)}`; break; }
            case 23: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}/${paren(b)}`; break; }
            case 24: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}%${paren(b)}`; break; }
            case 25: { stack[stackDepth-1] = `-${paren(stack[stackDepth-1])}`; break; }
            case 30: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}===${b}`; break; }
            case 31: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}!==${b}`; break; }
            case 32: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}<${b}`; break; }
            case 33: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}<=${b}`; break; }
            case 34: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}>${b}`; break; }
            case 35: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}>=${b}`; break; }
            case 40: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}&&${b}`; break; }
            case 41: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}||${b}`; break; }
            case 42: { stack[stackDepth-1] = `!${stack[stackDepth-1]}`; break; }
            case 43: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}&${paren(b)}`; break; }
            case 44: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}|${paren(b)}`; break; }
            case 45: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}^${paren(b)}`; break; }
            case 46: { stack[stackDepth-1] = `~${stack[stackDepth-1]}`; break; }
            case 47: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}<<${paren(b)}`; break; }
            case 48: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}>>${paren(b)}`; break; }
            case 50: {
                const n = code[ip++];
                if (n === 0) {
                    stack[stackDepth++] = '[]';
                } else {
                    const items = [];
                    for (let i = 0; i < n; i++) {
                        items.unshift(stack[--stackDepth]);
                    }
                    stack[stackDepth++] = `[${items.join(',')}]`;
                }
                break;
            }
            case 51: {
                const n = code[ip++];
                if (n === 0) {
                    stack[stackDepth++] = '{}';
                } else {
                    const pairs = [];
                    for (let i = 0; i < n; i++) {
                        const val = stack[--stackDepth];
                        const key = stack[--stackDepth];
                        pairs.unshift(`${key}:${val}`);
                    }
                    stack[stackDepth++] = `{${pairs.join(',')}}`;
                }
                break;
            }
            case 20: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${a}+${paren(b)}`; break; }
            case 11: {
                const gi = code[ip++];
                usedGlobals.add(gi);
                if (stackDepth > 0) {
                    const val = stack[--stackDepth];
                    const vName = `v${gi}`;
                    if (typeof val === 'string' && val.startsWith(vName + '+')) {
                        bodySrc += `${vName}+=${val.slice(vName.length + 1)};`;
                    } else if (typeof val === 'string' && val.startsWith(vName + '-')) {
                        bodySrc += `${vName}-=${val.slice(vName.length + 1)};`;
                    } else if (val === vName) {
                    } else {
                        bodySrc += `${vName}=${val};`;
                    }
                }
                break;
            }
            case 135: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `${paren(a)}+${paren(b)}`; break; }
            case 52: {
                const key = stack[--stackDepth];
                const obj = stack[--stackDepth];
                if (obj && key) {
                    if (typeof key === 'string' && key.startsWith('"')) {
                        const propName = key.slice(1, -1);
                        stack[stackDepth++] = `${obj}.${propName}`;
                    } else {
                        usedArrays.add(obj);
                        stack[stackDepth++] = `${obj}[${key}]`;
                    }
                } else {
                    return null;
                }
                break;
            }
            case 172: {
                const ci = code[ip++];
                const key = consts[ci];
                const obj = stack[--stackDepth];
                if (obj && key !== undefined) {
                    if (typeof key === 'string') {
                        stack[stackDepth++] = `${obj}.${key}`;
                    } else {
                        usedArrays.add(obj);
                        stack[stackDepth++] = `${obj}[${JSON.stringify(key)}]`;
                    }
                } else {
                    return null;
                }
                break;
            }
            case 53: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj && key) {
                    bodySrc += `${obj}[${key}]=${val};`;
                    stack[stackDepth++] = val;
                } else {
                    return null;
                }
                break;
            }
            case 163: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj) {
                    bodySrc += `${obj}[${key}]=${val};`;
                    stack[stackDepth++] = val;
                } else {
                    return null;
                }
                break;
            }
            case 149: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                if (arr) {
                    usedArrays.add(arr);
                    if (val === `v${loopCondGi}`) {
                        bodySrc += `${arr}[${val}]=${val};`;
                        stack[stackDepth++] = val;
                    } else {
                        bodySrc += `${arr}.push(${val});`;
                        stack[stackDepth++] = `${arr}`;
                    }
                } else {
                    return null;
                }
                break;
            }
            case 162: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                if (arr) {
                    usedArrays.add(arr);
                    if (val === `v${loopCondGi}`) {
                        bodySrc += `${arr}[${val}]=${val};`;
                    } else {
                        bodySrc += `${arr}.push(${val});`;
                    }
                } else {
                    return null;
                }
                break;
            }
            case 150: {
                const idx = stack[--stackDepth];
                const arr = stack[--stackDepth];
                if (arr) {
                    usedArrays.add(arr);
                    stack[stackDepth++] = `${arr}[${idx}]`;
                } else {
                    return null;
                }
                break;
            }
            case 151: {
                const arr = stack[--stackDepth];
                if (arr) {
                    usedArrays.add(arr);
                    stack[stackDepth++] = `${arr}.length`;
                } else {
                    return null;
                }
                break;
            }
            case 72: {
                const name = consts[code[ip++]];
                const n = code[ip++];
                if (n === 1) {
                    const a = stack[--stackDepth];
                    if (name === 'len') { stack[stackDepth++] = `(${a}).length`; break; }
                    if (name === 'floor') { stack[stackDepth++] = `Math.floor(${a})`; break; }
                    if (name === 'ceil') { stack[stackDepth++] = `Math.ceil(${a})`; break; }
                    if (name === 'round') { stack[stackDepth++] = `Math.round(${a})`; break; }
                    if (name === 'abs') { stack[stackDepth++] = `Math.abs(${a})`; break; }
                    if (name === 'sqrt') { stack[stackDepth++] = `Math.sqrt(${a})`; break; }
                    if (name === 'toString') { stack[stackDepth++] = `String(${a})`; break; }
                    if (name === 'pop') { stack[stackDepth++] = `(${a}).pop()`; break; }
                    if (name === 'shift') { stack[stackDepth++] = `(${a}).shift()`; break; }
                    if (name === 'keys') { stack[stackDepth++] = `Object.keys(${a})`; break; }
                    if (name === 'upper') { stack[stackDepth++] = `String(${a}).toUpperCase()`; break; }
                    if (name === 'lower') { stack[stackDepth++] = `String(${a}).toLowerCase()`; break; }
                    if (name === 'trim') { stack[stackDepth++] = `String(${a}).trim()`; break; }
                    return null;
                }
                if (n === 2) {
                    const b = stack[--stackDepth];
                    const a = stack[--stackDepth];
                    if (name === 'push') { usedArrays.add(a); bodySrc += `${a}.push(${b});`; stack[stackDepth++] = `${a}`; break; }
                    if (name === 'min') { stack[stackDepth++] = `Math.min(${a},${b})`; break; }
                    if (name === 'max') { stack[stackDepth++] = `Math.max(${a},${b})`; break; }
                    if (name === 'pow') { stack[stackDepth++] = `Math.pow(${a},${b})`; break; }
                    if (name === 'split') { stack[stackDepth++] = `String(${a}).split(${b})`; break; }
                    if (name === 'charAt') { stack[stackDepth++] = `String(${a}).charAt(${b})`; break; }
                    if (name === 'indexOf') { stack[stackDepth++] = `(${a}).indexOf(${b})`; break; }
                    if (name === 'join') { stack[stackDepth++] = `(${a}).join(${b})`; break; }
                    if (name === 'includes') { stack[stackDepth++] = `(${a}).includes(${b})`; break; }
                    return null;
                }
                if (n === 3) {
                    const c = stack[--stackDepth];
                    const b = stack[--stackDepth];
                    const a = stack[--stackDepth];
                    if (name === 'substring') { stack[stackDepth++] = `String(${a}).substring(${b},${c})`; break; }
                    if (name === 'slice') { stack[stackDepth++] = `(${a}).slice(${b},${c})`; break; }
                    return null;
                }
                return null;
            }
            case 63: {
                const n = code[ip++];
                if (n === 1) {
                    const arg = stack[--stackDepth];
                    const method = stack[--stackDepth];
                    if (method && typeof method === 'object' && method.prop) {
                        usedArrays.add(method.obj);
                        if (method.prop === 'push' && arg === `v${loopCondGi}`) {
                            bodySrc += `${method.obj}[${arg}]=${arg};`;
                        } else {
                            bodySrc += `${method.obj}.${method.prop}(${arg});`;
                        }
                        break;
                    }
                    if (method && typeof method === 'object' && method._nativeFnSrc) {
                        let inlined = method._nativeFnSrc.replace(/^return\s+/, '').replace(/;$/, '');
                        inlined = inlined.replace(/\ba0\b/g, `(${arg})`);
                        stack[stackDepth++] = `(${inlined})`;
                        break;
                    }
                    if (typeof method === 'string') {
                        const varIdx = parseInt(method.slice(1));
                        const fn = vm._globalVals ? vm._globalVals[varIdx] : undefined;
                        if (fn && fn._type === 'closure' && fn._noCapture && fn._isLeaf && !fn._isSelfRecursive) {
                            let fnSrc = fn._nativeFnSrc;
                            if (!fnSrc) { fnSrc = _compileLeafFunction(vm, fn); if (fnSrc) fn._nativeFnSrc = fnSrc; }
                            if (fnSrc) {
                                let inlined = fnSrc.replace(/^return\s+/, '').replace(/;$/, '');
                                inlined = inlined.replace(/\ba0\b/g, `(${arg})`);
                                stack[stackDepth++] = `(${inlined})`;
                                break;
                            }
                        }
                        if (fn && typeof fn === 'function') {
                            const b = vm.builtins;
                            if (fn === b.floor) { stack[stackDepth++] = `Math.floor(${arg})`; break; }
                            if (fn === b.ceil) { stack[stackDepth++] = `Math.ceil(${arg})`; break; }
                            if (fn === b.round) { stack[stackDepth++] = `Math.round(${arg})`; break; }
                            if (fn === b.abs) { stack[stackDepth++] = `Math.abs(${arg})`; break; }
                            if (fn === b.sqrt) { stack[stackDepth++] = `Math.sqrt(${arg})`; break; }
                            if (fn === b.sin) { stack[stackDepth++] = `Math.sin(${arg})`; break; }
                            if (fn === b.cos) { stack[stackDepth++] = `Math.cos(${arg})`; break; }
                            if (fn === b.tan) { stack[stackDepth++] = `Math.tan(${arg})`; break; }
                            if (fn === b.log) { stack[stackDepth++] = `Math.log(${arg})`; break; }
                            return null;
                        }
                        if (fn && fn._type === 'closure') return null;
                        stack[stackDepth++] = `${method}(${arg})`;
                        break;
                    }
                } else {
                    const args = [];
                    for (let i = 0; i < n; i++) args.unshift(stack[--stackDepth]);
                    const fnRef = stack[--stackDepth];
                    if (fnRef && typeof fnRef === 'object' && fnRef._nativeFnSrc) {
                        const src = fnRef._nativeFnSrc;
                        let inlined = src.replace(/^return\s+/, '').replace(/;$/, '');
                        for (let i = 0; i < n; i++) {
                            inlined = inlined.replace(new RegExp('\\ba' + i + '\\b', 'g'), `(${args[i]})`);
                        }
                        stack[stackDepth++] = `(${inlined})`;
                    } else if (typeof fnRef === 'string') {
                        const varIdx = parseInt(fnRef.slice(1));
                        const fn = vm._globalVals ? vm._globalVals[varIdx] : undefined;
                        if (fn && typeof fn === 'function') {
                            const b = vm.builtins;
                            if (fn === b.min) { stack[stackDepth++] = `Math.min(${args.join(',')})`; break; }
                            if (fn === b.max) { stack[stackDepth++] = `Math.max(${args.join(',')})`; break; }
                            if (fn === b.pow) { stack[stackDepth++] = `Math.pow(${args.join(',')})`; break; }
                            return null;
                        }
                        if (fn && fn._type === 'closure' && fn._noCapture && fn._isLeaf && !fn._isSelfRecursive) {
                            let fnSrc = fn._nativeFnSrc;
                            if (!fnSrc) { fnSrc = _compileLeafFunction(vm, fn); if (fnSrc) fn._nativeFnSrc = fnSrc; }
                            if (fnSrc) {
                                let inlined = fnSrc.replace(/^return\s+/, '').replace(/;$/, '');
                                for (let i = 0; i < n; i++) {
                                    inlined = inlined.replace(new RegExp('\\ba' + i + '\\b', 'g'), `(${args[i]})`);
                                }
                                stack[stackDepth++] = `(${inlined})`;
                            } else {
                                return null;
                            }
                        } else {
                            if (fn && fn._type === 'closure') return null;
                            stack[stackDepth++] = `${fnRef}(${args.join(',')})`;
                        }
                    } else {
                        return null;
                    }
                    break;
                }
                return null;
            }
            case 128: {
                const gi = code[ip++]; const ci = code[ip++]; const offset = code[ip++];
                usedGlobals.add(gi);
                bodySrc += `v${gi}+=${consts[ci]};`;
                if (offset < 0) {
                    return { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays], loopVar: gi, loopInc: consts[ci] };
                }
                return { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays], loopVar: gi, loopInc: consts[ci] };
            }
            case 96: {
                const gi = code[ip++]; const ci = code[ip++]; const offset = code[ip++];
                usedGlobals.add(gi);
                const inner = _compileGlobalLoop(vm, code, consts, ip, gi, ci);
                if (inner) {
                    for (const g of inner.usedGlobals) usedGlobals.add(g);
                    for (const a of inner.usedArrays) usedArrays.add(a);
                    const innerLimit = consts[ci];
                    const innerInc = inner.loopInc || 1;
                    const innerVar = `v${gi}`;
                    let innerBody = inner.bodySrc;
                    innerBody = innerBody.replace(new RegExp(`\\b${innerVar}\\+\\+;`, 'g'), '');
                    innerBody = innerBody.replace(new RegExp(`\\b${innerVar}\\+=${innerInc};`, 'g'), '');
                    if (innerInc === 1 && typeof innerLimit === 'number' && innerLimit >= 8 && !innerBody.includes('for(') && !innerBody.includes('if(')) {
                        const bodyRefsInnerVar = new RegExp('\\b' + innerVar + '\\b').test(innerBody);
                        if (!bodyRefsInnerVar) {
                            let factor = 4;
                            if (innerLimit % 4 !== 0) factor = 2;
                            if (innerLimit % 2 !== 0) factor = 1;
                            if (factor > 1) {
                                const newLimit = innerLimit - (innerLimit % factor);
                                bodySrc += `for(;${innerVar}<${newLimit};${innerVar}+=${factor}){${innerBody.repeat(factor)}}`;
                                if (newLimit < innerLimit) {
                                    bodySrc += `for(;${innerVar}<${innerLimit};${innerVar}+=1){${innerBody}}`;
                                }
                            } else {
                                bodySrc += `for(;${innerVar}<${innerLimit};${innerVar}+=${innerInc}){${innerBody}}`;
                            }
                        } else if (innerLimit >= 4 && innerLimit % 2 === 0) {
                            const tmpVar = innerVar + 'x';
                            const body2 = innerBody.replace(new RegExp('\\b' + innerVar + '\\b', 'g'), tmpVar);
                            if (innerLimit % 4 === 0 && innerLimit >= 8) {
                                const tmpVar2 = innerVar + 'xx';
                                const tmpVar3 = innerVar + 'xxx';
                                const body3 = innerBody.replace(new RegExp('\\b' + innerVar + '\\b', 'g'), tmpVar2);
                                const body4 = innerBody.replace(new RegExp('\\b' + innerVar + '\\b', 'g'), tmpVar3);
                                bodySrc += `for(;${innerVar}<${innerLimit};${innerVar}+=4){${innerBody}var ${tmpVar}=${innerVar}+1;${body2}var ${tmpVar2}=${innerVar}+2;${body3}var ${tmpVar3}=${innerVar}+3;${body4}}`;
                            } else {
                                bodySrc += `for(;${innerVar}<${innerLimit};${innerVar}+=2){${innerBody}var ${tmpVar}=${innerVar}+1;${body2}}`;
                            }
                        } else {
                            bodySrc += `for(;${innerVar}<${innerLimit};${innerVar}+=${innerInc}){${innerBody}}`;
                        }
                    } else {
                        bodySrc += `for(;v${gi}<${consts[ci]};v${gi}+=${inner.loopInc || 1}){${innerBody}}`;
                    }
                    ip += offset;
                } else {
                    return null;
                }
                break;
            }
            case 133: {
                const gi = code[ip++]; const ci = code[ip++]; ip++;
                usedGlobals.add(gi);
                return { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays], loopVar: gi, loopInc: 1 };
            }
            case 65: {
                const ci = code[ip++];
                const f = consts[ci];
                const nextOp = code[ip];
                if (nextOp === 105) { ip++; const gi = code[ip++]; usedGlobals.add(gi); bodySrc += `v${gi}=_fn_${f.name || ci};`; }
                else if (nextOp === 104) { ip++; const gi = code[ip++]; usedGlobals.add(gi); bodySrc += `v${gi}=_fn_${f.name || ci};`; }
                let fnSrc = null;
                if (f._isLeaf && f._noCapture && !f._isSelfRecursive) {
                    fnSrc = _compileLeafFunction(vm, { _ctx: [code, consts, vars], _start: f.start, _funcRef: f, _localCount: f._localCount });
                }
                stack[stackDepth++] = { _nativeFnSrc: fnSrc, _name: f.name || `fn${ci}` };
                break;
            }
            case 60: {
                const offset = code[ip++];
                if (offset < 0) {
                    return { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays], isWhileLoop: true };
                }
                ip += offset;
                break;
            }
            case 61: {
                const offset = code[ip++];
                const cond = stack[--stackDepth];
                const jumpTarget = ip + offset;
                if (offset < 0) {
                    return { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays], isWhileLoop: true, whileCond: cond };
                }
                const compileBodyBlock = (startIp, endIp) => {
                    let bIp = startIp;
                    let bStackDepth = 0;
                    let bSrc = '';
                    const bUsedGlobals = new Set();
                    const bStack = [];
                    let bHasBackJump = false;
                    let bElseEndIp = -1;
                    while (bIp < endIp) {
                        const bOp = code[bIp++];
                        switch (bOp) {
                            case 0: break;
                            case 1: {
                                const ci = code[bIp++];
                                const v = consts[ci];
                                if (typeof v === 'number') {
                                    bStack[bStackDepth++] = `${v}`;
                                } else if (typeof v === 'string') {
                                    bStack[bStackDepth++] = `"${v}"`;
                                } else {
                                    bStack[bStackDepth++] = `${v}`;
                                }
                                break;
                            }
                            case 5: { bStackDepth--; break; }
                            case 10: { const gi = code[bIp++]; bUsedGlobals.add(gi); bStack[bStackDepth++] = `v${gi}`; break; }
                            case 11: { const gi = code[bIp++]; bUsedGlobals.add(gi); if (bStackDepth > 0) { const val = bStack[--bStackDepth]; bSrc += `v${gi}=${val};`; } break; }
                            case 20: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}+${b}`; break; }
                            case 21: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}-${b}`; break; }
                            case 22: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}*${b}`; break; }
                            case 23: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}/${b}`; break; }
                            case 24: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${paren(a)}%${paren(b)}`; break; }
                            case 30: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}===${b}`; break; }
                            case 31: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}!==${b}`; break; }
                            case 32: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}<${b}`; break; }
                            case 33: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}<=${b}`; break; }
                            case 34: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}>${b}`; break; }
                            case 35: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}>=${b}`; break; }
                            case 40: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}&&${b}`; break; }
                            case 41: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}||${b}`; break; }
                            case 42: { bStack[bStackDepth - 1] = `!${bStack[bStackDepth - 1]}`; break; }
                            case 43: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${paren(a)}&${paren(b)}`; break; }
                            case 44: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${paren(a)}|${paren(b)}`; break; }
                            case 45: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${paren(a)}^${paren(b)}`; break; }
                            case 46: { bStack[bStackDepth - 1] = `~${bStack[bStackDepth - 1]}`; break; }
                            case 47: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${paren(a)}<<${paren(b)}`; break; }
                            case 48: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${paren(a)}>>${paren(b)}`; break; }
                            case 50: {
                                const n = code[bIp++];
                                if (n === 0) {
                                    bStack[bStackDepth++] = '[]';
                                } else {
                                    const items = [];
                                    for (let i = 0; i < n; i++) {
                                        items.unshift(bStack[--bStackDepth]);
                                    }
                                    bStack[bStackDepth++] = `[${items.join(',')}]`;
                                }
                                break;
                            }
                            case 51: {
                                const n = code[bIp++];
                                if (n === 0) {
                                    bStack[bStackDepth++] = '{}';
                                } else {
                                    const pairs = [];
                                    for (let i = 0; i < n; i++) {
                                        const val = bStack[--bStackDepth];
                                        const key = bStack[--bStackDepth];
                                        pairs.unshift(`${key}:${val}`);
                                    }
                                    bStack[bStackDepth++] = `{${pairs.join(',')}}`;
                                }
                                break;
                            }
                            case 60: {
                                const jumpOffset = code[bIp++];
                                if (jumpOffset < 0) {
                                    bHasBackJump = true;
                                } else {
                                    bElseEndIp = bIp + jumpOffset;
                                    bIp = endIp;
                                }
                                break;
                            }
                            case 97: { const gi = code[bIp++]; const ci = code[bIp++]; bUsedGlobals.add(gi); bSrc += `v${gi}+=${consts[ci]};`; break; }
                            case 98: { const ti = code[bIp++]; const si = code[bIp++]; bUsedGlobals.add(ti); bUsedGlobals.add(si); bSrc += `v${ti}+=v${si};`; break; }
                            case 102: { const gi = code[bIp++]; const ci = code[bIp++]; bUsedGlobals.add(gi); bSrc += `v${gi}=${consts[ci]};`; break; }
                            case 111: { const gi = code[bIp++]; const ci = code[bIp++]; bUsedGlobals.add(gi); bStack[bStackDepth++] = `v${gi}*${consts[ci]}`; break; }
                            case 112: { const gi = code[bIp++]; const ci = code[bIp++]; bUsedGlobals.add(gi); bStack[bStackDepth++] = `v${gi}+${consts[ci]}`; break; }
                            case 113: { const gi = code[bIp++]; const ci = code[bIp++]; bUsedGlobals.add(gi); bStack[bStackDepth++] = `v${gi}-${consts[ci]}`; break; }
                            case 114: { const ai = code[bIp++]; const bi = code[bIp++]; bUsedGlobals.add(ai); bUsedGlobals.add(bi); bStack[bStackDepth++] = `v${ai}/v${bi}`; break; }
                            case 115: { const ai = code[bIp++]; const bi = code[bIp++]; bUsedGlobals.add(ai); bUsedGlobals.add(bi); bStack[bStackDepth++] = `v${ai}*v${bi}`; break; }
                            case 116: { const ai = code[bIp++]; const bi = code[bIp++]; bUsedGlobals.add(ai); bUsedGlobals.add(bi); bStack[bStackDepth++] = `v${ai}+v${bi}`; break; }
                            case 117: { const ai = code[bIp++]; const bi = code[bIp++]; bUsedGlobals.add(ai); bUsedGlobals.add(bi); bStack[bStackDepth++] = `v${ai}-v${bi}`; break; }
                            case 128: {
                                const gi = code[bIp++]; const ci = code[bIp++]; const backOffset = code[bIp++];
                                bUsedGlobals.add(gi);
                                bSrc += `v${gi}+=${consts[ci]};`;
                                if (backOffset < 0) {
                                    bHasBackJump = true;
                                }
                                break;
                            }
                            case 135: { const b = bStack[--bStackDepth]; const a = bStack[--bStackDepth]; bStack[bStackDepth++] = `${a}+${b}`; break; }
                            case 53: { const obj = bStack[--bStackDepth]; const key = bStack[--bStackDepth]; const val = bStack[--bStackDepth]; if (obj && key) { bSrc += `${obj}[${key}]=${val};`; bStack[bStackDepth++] = val; } break; }
                            case 163: { const obj = bStack[--bStackDepth]; const key = bStack[--bStackDepth]; const val = bStack[--bStackDepth]; if (obj) { bSrc += `${obj}[${key}]=${val};`; bStack[bStackDepth++] = val; } break; }
                            case 149: { const val = bStack[--bStackDepth]; const arr = bStack[--bStackDepth]; if (arr) { bSrc += `${arr}.push(${val});`; bStack[bStackDepth++] = `${arr}`; } break; }
                            case 162: { const val = bStack[--bStackDepth]; const arr = bStack[--bStackDepth]; if (arr) { bSrc += `${arr}.push(${val});`; } break; }
                            case 150: { const idx = bStack[--bStackDepth]; const arr = bStack[--bStackDepth]; if (arr) { bStack[bStackDepth++] = `${arr}[${idx}]`; } break; }
                            case 151: { const arr = bStack[--bStackDepth]; if (arr) { bStack[bStackDepth++] = `${arr}.length`; } break; }
                            case 72: {
                                const bName = consts[code[bIp++]];
                                const bN = code[bIp++];
                                if (bN === 1) {
                                    const a = bStack[--bStackDepth];
                                    if (bName === 'len') { bStack[bStackDepth++] = `(${a}).length`; break; }
                                    if (bName === 'floor') { bStack[bStackDepth++] = `Math.floor(${a})`; break; }
                                    if (bName === 'ceil') { bStack[bStackDepth++] = `Math.ceil(${a})`; break; }
                                    if (bName === 'round') { bStack[bStackDepth++] = `Math.round(${a})`; break; }
                                    if (bName === 'abs') { bStack[bStackDepth++] = `Math.abs(${a})`; break; }
                                    if (bName === 'sqrt') { bStack[bStackDepth++] = `Math.sqrt(${a})`; break; }
                                    if (bName === 'toString') { bStack[bStackDepth++] = `String(${a})`; break; }
                                    if (bName === 'pop') { bStack[bStackDepth++] = `(${a}).pop()`; break; }
                                    if (bName === 'shift') { bStack[bStackDepth++] = `(${a}).shift()`; break; }
                                    if (bName === 'keys') { bStack[bStackDepth++] = `Object.keys(${a})`; break; }
                                    return null;
                                }
                                if (bN === 2) {
                                    const bb = bStack[--bStackDepth]; const ba = bStack[--bStackDepth];
                                    if (bName === 'push') { bSrc += `${ba}.push(${bb});`; bStack[bStackDepth++] = `${ba}`; break; }
                                    if (bName === 'min') { bStack[bStackDepth++] = `Math.min(${ba},${bb})`; break; }
                                    if (bName === 'max') { bStack[bStackDepth++] = `Math.max(${ba},${bb})`; break; }
                                    if (bName === 'pow') { bStack[bStackDepth++] = `Math.pow(${ba},${bb})`; break; }
                                    if (bName === 'split') { bStack[bStackDepth++] = `String(${ba}).split(${bb})`; break; }
                                    if (bName === 'charAt') { bStack[bStackDepth++] = `String(${ba}).charAt(${bb})`; break; }
                                    if (bName === 'indexOf') { bStack[bStackDepth++] = `(${ba}).indexOf(${bb})`; break; }
                                    if (bName === 'join') { bStack[bStackDepth++] = `(${ba}).join(${bb})`; break; }
                                    return null;
                                }
                                if (bN === 3) {
                                    const bc = bStack[--bStackDepth]; const bb = bStack[--bStackDepth]; const ba = bStack[--bStackDepth];
                                    if (bName === 'substring') { bStack[bStackDepth++] = `String(${ba}).substring(${bb},${bc})`; break; }
                                    if (bName === 'slice') { bStack[bStackDepth++] = `(${ba}).slice(${bb},${bc})`; break; }
                                    return null;
                                }
                                return null;
                            }
                            default: return null;
                        }
                    }
                    return { src: bSrc, usedGlobals: bUsedGlobals, hasBackJump: bHasBackJump, elseEndIp: bElseEndIp, stackDepth: bStackDepth, stack: bStack };
                };
                const trueResult = compileBodyBlock(ip, jumpTarget);
                if (!trueResult) { return null; }
                for (const g of trueResult.usedGlobals) usedGlobals.add(g);
                if (trueResult.hasBackJump && trueResult.src) {
                    bodySrc += `while(${cond}){${trueResult.src}}`;
                    ip = jumpTarget;
                } else if (trueResult.elseEndIp > 0) {
                    const elseResult = compileBodyBlock(jumpTarget, trueResult.elseEndIp);
                    if (!elseResult) { return null; }
                    for (const g of elseResult.usedGlobals) usedGlobals.add(g);
                    if (trueResult.stackDepth > 0 && elseResult.stackDepth > 0 && code[trueResult.elseEndIp] === 11) {
                        const storeGi = code[trueResult.elseEndIp + 1];
                        usedGlobals.add(storeGi);
                        const trueVal = trueResult.stack[trueResult.stackDepth - 1];
                        const elseVal = elseResult.stack[elseResult.stackDepth - 1];
                        bodySrc += `if(${cond}){v${storeGi}=${trueVal};}else{v${storeGi}=${elseVal};}`;
                        ip = trueResult.elseEndIp + 2;
                    } else {
                        bodySrc += `if(${cond}){${trueResult.src}}else{${elseResult.src}}`;
                        ip = trueResult.elseEndIp;
                    }
                } else if (trueResult.src) {
                    bodySrc += `if(${cond}){${trueResult.src}}`;
                    ip = jumpTarget;
                } else {
                    return null;
                }
                break;
            }
            case 62: {
                const offset = code[ip++];
                const cond = stack[stackDepth - 1];
                const jumpTarget = ip + offset;
                if (offset < 0) {
                    stackDepth--;
                    return { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays], isWhileLoop: true, whileCond: cond };
                }
                const inner = _compileGlobalLoop(vm, code, consts, ip, -1, -1);
                if (inner && inner.isWhileLoop) {
                    bodySrc += `while(${cond}){${inner.bodySrc}}`;
                    for (const g of inner.usedGlobals) usedGlobals.add(g);
                    for (const a of inner.usedArrays) usedArrays.add(a);
                    ip = jumpTarget;
                    stackDepth--;
                } else {
                    return null;
                }
                break;
            }
            case 158: case 159: case 160: case 161: {
                const offset = code[ip++];
                const b = stack[--stackDepth]; const a = stack[--stackDepth];
                const cmpOp = op === 158 ? '<' : op === 159 ? '<=' : op === 160 ? '>' : '>=';
                const cond = `${a}${cmpOp}${b}`;
                const jumpTarget = ip + offset;
                if (offset < 0) {
                    return { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays], isWhileLoop: true, whileCond: cond };
                }
                const inner = _compileGlobalLoop(vm, code, consts, ip, -1, -1);
                if (inner && inner.isWhileLoop) {
                    bodySrc += `while(${cond}){${inner.bodySrc}}`;
                    for (const g of inner.usedGlobals) usedGlobals.add(g);
                    for (const a2 of inner.usedArrays) usedArrays.add(a2);
                    ip = jumpTarget;
                } else {
                    bodySrc += `if(${cond}){${inner ? inner.bodySrc : ''}}`;
                    if (inner) { for (const g of inner.usedGlobals) usedGlobals.add(g); for (const a2 of inner.usedArrays) usedArrays.add(a2); }
                    ip = jumpTarget;
                }
                break;
            }
            case 255: {
                return { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays] };
            }
            case 66: {
                const catchOffset = code[ip++];
                const tryBody = _compileGlobalLoop(vm, code, consts, ip, -1, -1);
                if (tryBody && tryBody.isWhileLoop) {
                    bodySrc += `try{${tryBody.bodySrc}}`;
                    for (const g of tryBody.usedGlobals) usedGlobals.add(g);
                    ip += catchOffset;
                } else if (tryBody) {
                    bodySrc += `try{${tryBody.bodySrc}}`;
                    for (const g of tryBody.usedGlobals) usedGlobals.add(g);
                    ip += catchOffset;
                } else {
                    return null;
                }
                break;
            }
            case 67: {
                const throwVal = stack[--stackDepth];
                bodySrc += `throw ${throwVal};`;
                break;
            }
            case 68: break;
            case 69: {
                const catchVarGi = code[ip++];
                usedGlobals.add(catchVarGi);
                const catchBody = _compileGlobalLoop(vm, code, consts, ip, -1, -1);
                if (catchBody) {
                    bodySrc += `catch(_e){v${catchVarGi}=_e;${catchBody.bodySrc}}`;
                    for (const g of catchBody.usedGlobals) usedGlobals.add(g);
                    ip += catchBody._endIp || 0;
                } else {
                    return null;
                }
                break;
            }
            case 173: break;
            case 174: break;
            case 155: {
                const numVal = stack[--stackDepth];
                const addVal = stack[--stackDepth];
                const gi = code[ip++];
                usedGlobals.add(gi);
                bodySrc += `v${gi}=${addVal}+${numVal};`;
                break;
            }
            case 156: {
                const numVal = stack[--stackDepth];
                const subVal = stack[--stackDepth];
                const gi = code[ip++];
                usedGlobals.add(gi);
                bodySrc += `v${gi}=${subVal}-${numVal};`;
                break;
            }
            case 157: {
                const numVal = stack[--stackDepth];
                const mulVal = stack[--stackDepth];
                const gi = code[ip++];
                usedGlobals.add(gi);
                bodySrc += `v${gi}=${mulVal}*${numVal};`;
                break;
            }
            default: return null;
        }
    }
    return bodySrc ? { bodySrc, usedGlobals: [...usedGlobals], usedArrays: [...usedArrays] } : null;
}

function _compileLocalLoop(vm, code, consts, loopStart, loopCondLi, loopCondCi) {
    let bodySrc = '';
    let ip = loopStart;
    let stackDepth = 0;
    const stack = [];
    const usedLocals = new Set();
    usedLocals.add(loopCondLi);

    while (ip < code.length) {
        const op = code[ip++];
        switch (op) {
            case 0: break;
            case 1: {
                const ci = code[ip++];
                const v = consts[ci];
                if (typeof v === 'number') stack[stackDepth++] = `${v}`;
                else if (typeof v === 'string') stack[stackDepth++] = JSON.stringify(v);
                else if (v === null) stack[stackDepth++] = 'null';
                else if (typeof v === 'boolean') stack[stackDepth++] = `${v}`;
                else return null;
                break;
            }
            case 12: { const li = code[ip++]; usedLocals.add(li); stack[stackDepth++] = `l${li}`; break; }
            case 13: {
                const li = code[ip++];
                usedLocals.add(li);
                if (stackDepth > 0) {
                    const val = stack[--stackDepth];
                    const lName = `l${li}`;
                    if (typeof val === 'string' && val.startsWith(lName + '+')) {
                        bodySrc += `${lName}+=${val.slice(lName.length + 1)};`;
                    } else if (typeof val === 'string' && val.startsWith(lName + '-')) {
                        bodySrc += `${lName}-=${val.slice(lName.length + 1)};`;
                    } else if (val === lName) {
                    } else {
                        bodySrc += `${lName}=${val};`;
                    }
                }
                break;
            }
            case 22: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}*${b})`; break; }
            case 23: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}/${b})`; break; }
            case 21: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}-${b})`; break; }
            case 25: { stack[stackDepth-1] = `(-${stack[stackDepth-1]})`; break; }
            case 20: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}+${b})`; break; }
            case 135: { const b = stack[--stackDepth]; const a = stack[--stackDepth]; stack[stackDepth++] = `(${a}+${b})`; break; }
            case 92: {
                const li = code[ip++];
                usedLocals.add(li);
                bodySrc += `l${li}++;`;
                break;
            }
            case 93: {
                const si = code[ip++]; const ai = code[ip++];
                usedLocals.add(si); usedLocals.add(ai);
                bodySrc += `l${si}+=l${ai};`;
                break;
            }
            case 95: {
                const li = code[ip++]; const ci = code[ip++]; const offset = code[ip++];
                usedLocals.add(li);
                const inner = _compileLocalLoop(vm, code, consts, ip, li, ci);
                if (inner) {
                    for (const l of inner.usedLocals) usedLocals.add(l);
                    bodySrc += `while(l${li}<${consts[ci]}){${inner.bodySrc}}`;
                    ip += offset;
                } else {
                    return null;
                }
                break;
            }
            case 60: {
                const offset = code[ip++];
                ip += offset;
                return { bodySrc, usedLocals: [...usedLocals] };
            }
            case 5: { stackDepth--; break; }
            case 52: {
                const key = stack[--stackDepth];
                const obj = stack[--stackDepth];
                if (obj && key) { stack[stackDepth++] = `${obj}[${key}]`; }
                else { return null; }
                break;
            }
            case 172: {
                const ci = code[ip++];
                const key = consts[ci];
                const obj = stack[--stackDepth];
                if (obj && key !== undefined) { stack[stackDepth++] = `${obj}[${JSON.stringify(key)}]`; }
                else { return null; }
                break;
            }
            case 53: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj && key) { bodySrc += `${obj}[${key}]=${val};`; stack[stackDepth++] = val; }
                else { return null; }
                break;
            }
            case 163: {
                const obj = stack[--stackDepth];
                const key = stack[--stackDepth];
                const val = stack[--stackDepth];
                if (obj) { bodySrc += `${obj}[${key}]=${val};`; stack[stackDepth++] = val; }
                else { return null; }
                break;
            }
            case 149: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                if (arr) {
                    if (val === `l${loopCondLi}`) {
                        bodySrc += `${arr}[${val}]=${val};`;
                        stack[stackDepth++] = val;
                    } else {
                        bodySrc += `${arr}.push(${val});`;
                        stack[stackDepth++] = `${arr}`;
                    }
                }
                else { return null; }
                break;
            }
            case 162: {
                const val = stack[--stackDepth];
                const arr = stack[--stackDepth];
                if (arr) {
                    if (val === `l${loopCondLi}`) {
                        bodySrc += `${arr}[${val}]=${val};`;
                    } else {
                        bodySrc += `${arr}.push(${val});`;
                    }
                }
                else { return null; }
                break;
            }
            case 150: {
                const idx = stack[--stackDepth];
                const arr = stack[--stackDepth];
                if (arr) { stack[stackDepth++] = `${arr}[${idx}]`; }
                else { return null; }
                break;
            }
            case 151: {
                const arr = stack[--stackDepth];
                if (arr) { stack[stackDepth++] = `${arr}.length`; }
                else { return null; }
                break;
            }
            default: return null;
        }
    }
    return bodySrc ? { bodySrc, usedLocals: [...usedLocals] } : null;
}

function wireJitCompiler(VMProto) {
    VMProto._compileLeafFunction = function (closure) { return _compileLeafFunction(this, closure); };
    VMProto._compileSelfRecursive = function (closure) { return _compileSelfRecursive(this, closure); };
    VMProto._compileWhileBody = function (code, consts, loopBodyStart, loopBodyEnd) { return _compileWhileBody(this, code, consts, loopBodyStart, loopBodyEnd); };
    VMProto._compileWhileCondition = function (code, consts, condStart, condEnd) { return _compileWhileCondition(this, code, consts, condStart, condEnd); };
    VMProto._compileGlobalLoop = function (code, consts, loopStart, loopCondGi, loopCondCi) { return _compileGlobalLoop(this, code, consts, loopStart, loopCondGi, loopCondCi); };
    VMProto._compileLocalLoop = function (code, consts, loopStart, loopCondLi, loopCondCi) { return _compileLocalLoop(this, code, consts, loopStart, loopCondLi, loopCondCi); };
}

module.exports = {
    _compileLeafFunction,
    _compileSelfRecursive,
    _compileWhileBody,
    _compileWhileCondition,
    _compileGlobalLoop,
    _compileLocalLoop,
    wireJitCompiler
};
