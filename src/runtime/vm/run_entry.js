'use strict';

const { HARDENED_ARRAY_MARK, hardenArrayObject } = require('./runtime_safety');

function run(bc) {
    try {
        if (bc !== this._lastBc) {
            this._sanitizeGlobalsForExecution();
        }
        if (bc === this._lastBc) {
            if (!this.preserveGlobals) {
                const gc = this._globalCache;
                if (gc && this._globalValsDirty) {
                    if (!this._tinyFastPath) {
                        const gv = this._globalVals;
                        const len = gc.length;
                        gv[0] = gc[0]; if (len > 1) gv[1] = gc[1]; if (len > 2) gv[2] = gc[2]; if (len > 3) gv[3] = gc[3];
                        if (len > 4) { for (let i = 4; i < len; i++) gv[i] = gc[i]; }
                    }
                    this._globalValsDirty = false;
                }
                if (this.output.length) this.output.length = 0;
            }
            const jfp = this._jitFastPath;
            if (jfp && !this._debugger?.isEnabled()) {
                const gv = this._globalVals;
                const ic = this._initConsts;
                for (let i = 0; i < ic.length; i += 2) gv[ic[i]] = ic[i + 1];
                this.output.length = 0;
                const __b = this._createExecutionBudget();
                try {
                    jfp(gv, this.output, __b);
                } catch(e) {
                    if (e.message === '__SEED_BUDGET_INSN__') {
                        return { success: false, error: `Execution limit exceeded (${this._maxInstructions} instructions)`, output: this.output };
                    }
                    if (e.message === '__SEED_BUDGET_TIME__') {
                        return { success: false, error: `Execution timeout (${this._maxExecutionMs}ms)`, output: this.output };
                    }
                    throw e;
                }
                this._syncGlobalVals = true;
                if (!this.preserveGlobals) this._globalValsDirty = true;
                return this._cachedResult;
            }
            const tfp = this._tinyFastPath;
            if (tfp && !this._debugger?.isEnabled()) {
                const gv = this._globalVals;
                const ic = this._initConsts;
                if (ic) for (let i = 0; i < ic.length; i += 2) gv[ic[i]] = ic[i + 1];
                this.output.length = 0;
                tfp(gv, this.consts);
                const syncVars = tfp._syncVars;
                if (Array.isArray(syncVars) && syncVars.length > 0) {
                    const gl = this.globals;
                    const vars = this.vars;
                    const arrSync = tfp._syncArrayVars;
                    const arrSyncLen = Array.isArray(arrSync) ? arrSync.length : 0;
                    const arrSync0 = arrSyncLen > 0 ? arrSync[0] : -1;
                    const arrSync1 = arrSyncLen > 1 ? arrSync[1] : -1;
                    for (let i = 0; i < syncVars.length; i++) {
                        const gi = syncVars[i];
                        const v = gv[gi];
                        const isArrayVar = arrSyncLen === 1 ? (gi === arrSync0) : (arrSyncLen === 2 ? (gi === arrSync0 || gi === arrSync1) : (arrSyncLen > 2 && arrSync.indexOf(gi) !== -1));
                        gl[vars[gi]] = isArrayVar ? ((v && v[HARDENED_ARRAY_MARK] === 1) ? v : hardenArrayObject(v)) : v;
                    }
                    this._syncGlobalVals = false;
                } else {
                    this._syncGlobalVals = true;
                }
                this._cachedResult = { success: true, output: this.output };
                if (!this.preserveGlobals) this._globalValsDirty = true;
                return this._cachedResult;
            }
            const sameResult = this.strict ? this.runFull(bc) : this.runFast(bc);
            if (!this.preserveGlobals) this._globalValsDirty = true;
            return sameResult;
        }
        this._globalCache = null;
        this._outputCache = null;
        this._jitFastPath = null;
        this._initConsts = null;
        this._globalValsDirty = true;
        
        const varsLen = bc.vars.length;
        this.output.length = 0;
        
        if (bc !== this._lastBc) {
            this.code = bc.code;
            this.consts = bc.consts;
            this.vars = bc.vars;
            this._lastBc = bc;
            this._lastBcVars = bc.vars;
            const rootGlobalNameIdx = new Map();
            for (let i = 0; i < bc.vars.length; i++) rootGlobalNameIdx.set(bc.vars[i], i);
            this._globalNameIdxRoot = rootGlobalNameIdx;
            this._globalNameIdxRootVars = bc.vars;
            this._globalNameIdx = rootGlobalNameIdx;
            this._globalNameIdxVars = bc.vars;
            this.funcNames = bc.funcNames || {};
            this.funcASTs = bc.funcASTs || {};
            this.lineMap = bc.lineMap || {};
            if (this._debugger) this._debugger.setLineMap(this.lineMap);
            this._tinyFastPath = this._buildTinyProgramFastPath(bc);
        }
        
        let globalVals = this._globalVals;
        if (!globalVals || globalVals.length < varsLen) {
            globalVals = new Array(varsLen);
            for (let i = 0; i < varsLen; i++) globalVals[i] = null;
            this._globalVals = globalVals;
        }
        if (this.preserveGlobals) {
            const globals = this.globals;
            const builtins = this.builtins;
            for (let i = 0; i < varsLen; i++) {
                const name = bc.vars[i];
                const v = Object.prototype.hasOwnProperty.call(globals, name) ? globals[name] : undefined;
                if (v !== undefined) {
                    globalVals[i] = (v !== null && typeof v === 'object' && Array.isArray(v) && v[HARDENED_ARRAY_MARK] !== 1) ? hardenArrayObject(v) : v;
                } else {
                    const bv = builtins[name];
                    globalVals[i] = bv !== undefined ? bv : null;
                }
            }
        } else {
            const builtins = this.builtins;
            if (builtins) {
                const vars = bc.vars;
                for (let i = 0; i < varsLen; i++) {
                    const bv = builtins[vars[i]];
                    globalVals[i] = bv !== undefined ? bv : null;
                }
            } else {
                if (varsLen <= 8) {
                    for (let i = 0; i < varsLen; i++) globalVals[i] = null;
                } else {
                    globalVals.fill(null, 0, varsLen);
                }
            }
        }
        if (!this.preserveGlobals) {
            this._globalCache = globalVals.slice();
            this._outputCache = null;
            this._globalValsDirty = false;
        }
        this.locals = this._emptyLocals;
        this._frameTop = 0;
        this.stack = this._stackBuf;
        
        if (this.strict) {
            const strictResult = this.runFull(bc);
            if (!this.preserveGlobals) this._globalValsDirty = true;
            return strictResult;
        }
        if (this._tinyFastPath) {
            this.output.length = 0;
            const tfp = this._tinyFastPath;
            const gv = this._globalVals;
            tfp(gv, this.consts);
            const syncVars = tfp._syncVars;
            if (Array.isArray(syncVars) && syncVars.length > 0) {
                const gl = this.globals;
                const vars = this.vars;
                const arrSync = tfp._syncArrayVars;
                const arrSyncLen = Array.isArray(arrSync) ? arrSync.length : 0;
                const arrSync0 = arrSyncLen > 0 ? arrSync[0] : -1;
                const arrSync1 = arrSyncLen > 1 ? arrSync[1] : -1;
                for (let i = 0; i < syncVars.length; i++) {
                    const gi = syncVars[i];
                    const v = gv[gi];
                    const isArrayVar = arrSyncLen === 1 ? (gi === arrSync0) : (arrSyncLen === 2 ? (gi === arrSync0 || gi === arrSync1) : (arrSyncLen > 2 && arrSync.indexOf(gi) !== -1));
                    gl[vars[gi]] = isArrayVar ? ((v && v[HARDENED_ARRAY_MARK] === 1) ? v : hardenArrayObject(v)) : v;
                }
                this._syncGlobalVals = false;
            } else {
                this._syncGlobalVals = true;
            }
            this._cachedResult = { success: true, output: this.output };
            if (!this.preserveGlobals) this._globalValsDirty = true;
            return this._cachedResult;
        }
        this._precompileLoops(bc);
        if (!this._jitFastPath && this._loopJitCache) {
            this._buildJitFastPath(bc);
        }
        let runResult;
        runResult = this.runFast(bc);
        if (!runResult?.success) {
            if (typeof runResult?.error === 'string' && runResult.error.startsWith('Unknown op:')) {
                runResult = this.runFull(bc);
            }
        }
        if (!this.preserveGlobals) this._globalValsDirty = true;
        return runResult;
    } catch(e) {
        const summarizeLogValue = (v) => {
            if (typeof v === 'string') return v.length > 200 ? `${v.slice(0, 200)}...<len:${v.length}>` : v;
            if (Array.isArray(v)) return `[Array len=${v.length}]`;
            if (v && typeof v === 'object') return `[${v._type || 'Object'}]`;
            return v;
        };
        console.log('\n=== ERROR IN VM.RUN ===');
        console.log('Error:', e.message);
        console.log('Stack:', e.stack);
        console.log('output:', Array.isArray(this.output) ? this.output.slice(0, 10).map(summarizeLogValue) : this.output);
        console.log('stack:', this.stack ? this.stack.slice(0, 10).map(summarizeLogValue) : 'undefined');
        throw e;
    }
}

function wireRunEntry(VMProto) {
    VMProto.run = run;
}

module.exports = { run, wireRunEntry };
