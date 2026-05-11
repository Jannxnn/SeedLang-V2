class Debugger {
    constructor(vm) {
        this._vm = vm;
        this._lineBreakpoints = new Set();
        this._ipBreakpoints = new Set();
        this._enabled = false;
        this._stepMode = null;
        this._stepDepth = 0;
        this._onBreakpoint = null;
        this._paused = false;
        this._pauseResolve = null;
        this._lineMap = null;
        this._lastPausedIp = -1;
    }

    enable() {
        this._enabled = true;
        return this;
    }

    disable() {
        this._enabled = false;
        this._stepMode = null;
        return this;
    }

    isEnabled() {
        return this._enabled;
    }

    isPaused() {
        return this._paused;
    }

    setLineBreakpoint(line) {
        this._lineBreakpoints.add(line);
        this._enabled = true;
        return this;
    }

    removeLineBreakpoint(line) {
        this._lineBreakpoints.delete(line);
        return this;
    }

    setIpBreakpoint(ip) {
        this._ipBreakpoints.add(ip);
        this._enabled = true;
        return this;
    }

    removeIpBreakpoint(ip) {
        this._ipBreakpoints.delete(ip);
        return this;
    }

    clearBreakpoints() {
        this._lineBreakpoints.clear();
        this._ipBreakpoints.clear();
        return this;
    }

    getBreakpoints() {
        return {
            lineBreakpoints: [...this._lineBreakpoints],
            ipBreakpoints: [...this._ipBreakpoints]
        };
    }

    stepOver() {
        this._stepMode = 'over';
        this._stepDepth = this._currentDepth();
        this._enabled = true;
        this._resume();
        return this;
    }

    stepInto() {
        this._stepMode = 'into';
        this._enabled = true;
        this._resume();
        return this;
    }

    stepOut() {
        this._stepMode = 'out';
        this._stepDepth = this._currentDepth() - 1;
        this._enabled = true;
        this._resume();
        return this;
    }

    continue() {
        this._stepMode = null;
        this._resume();
        return this;
    }

    onBreakpoint(callback) {
        this._onBreakpoint = callback;
        return this;
    }

    setLineMap(lineMap) {
        this._lineMap = lineMap;
        return this;
    }

    _currentDepth() {
        return this._vm.callStack ? this._vm.callStack.length : 0;
    }

    _getLineForIp(ip) {
        if (!this._lineMap) return -1;
        return this._lineMap[ip] || -1;
    }

    shouldPause(ip) {
        if (!this._enabled || this._paused) return false;

        if (this._ipBreakpoints.has(ip)) {
            return true;
        }

        const line = this._getLineForIp(ip);
        if (line >= 0 && this._lineBreakpoints.has(line)) {
            return true;
        }

        if (this._stepMode === 'into') {
            if (ip !== this._lastPausedIp) {
                return true;
            }
        } else if (this._stepMode === 'over') {
            const depth = this._currentDepth();
            if (depth <= this._stepDepth && ip !== this._lastPausedIp) {
                return true;
            }
        } else if (this._stepMode === 'out') {
            const depth = this._currentDepth();
            if (depth <= this._stepDepth) {
                return true;
            }
        }

        return false;
    }

    pause(ip) {
        this._paused = true;
        this._lastPausedIp = ip;
        const line = this._getLineForIp(ip);
        const state = this._captureState(ip, line);

        if (this._onBreakpoint) {
            this._onBreakpoint(state);
        }

        return new Promise((resolve) => {
            this._pauseResolve = resolve;
        });
    }

    pauseSync(ip) {
        this._lastPausedIp = ip;
        const line = this._getLineForIp(ip);
        const state = this._captureState(ip, line);

        if (this._onBreakpoint) {
            const action = this._onBreakpoint(state);
            if (action === 'stop') return 'stop';
            if (action === 'step_over') { this._stepMode = 'over'; this._stepDepth = this._currentDepth(); }
            else if (action === 'step_into') { this._stepMode = 'into'; }
            else if (action === 'step_out') { this._stepMode = 'out'; this._stepDepth = this._currentDepth() - 1; }
            else { this._stepMode = null; }
        }

        return 'continue';
    }

    _resume() {
        this._paused = false;
        if (this._pauseResolve) {
            this._pauseResolve('continue');
            this._pauseResolve = null;
        }
    }

    _captureState(ip, line) {
        const vm = this._vm;
        const locals = {};
        if (vm.locals && typeof vm.locals === 'object') {
            for (const key of Object.keys(vm.locals)) {
                const val = vm.locals[key];
                if (val && typeof val === 'object' && val._type === 'local') {
                    locals[key] = vm.stack[vm._fp + val.idx];
                } else if (val && typeof val === 'object' && val._type === 'captured') {
                    try { locals[key] = vm.capturedVars?.[val.idx]; } catch(e) { locals[key] = undefined; }
                }
            }
        }

        const globals = {};
        if (vm.globals) {
            for (const key of Object.keys(vm.globals)) {
                if (!key.startsWith('__')) {
                    globals[key] = vm.globals[key];
                }
            }
        }

        return {
            ip,
            line,
            locals,
            globals,
            callStack: vm.callStack ? [...vm.callStack] : [],
            stackDepth: vm.stack ? vm.stack.length : 0,
            opcode: vm.code ? vm.code[ip] : -1
        };
    }

    evaluate(expr) {
        const vm = this._vm;
        try {
            if (vm.locals && vm.locals[expr]) {
                const entry = vm.locals[expr];
                if (entry && typeof entry === 'object' && entry._type === 'local') {
                    return vm.stack[vm._fp + entry.idx];
                } else if (entry && typeof entry === 'object' && entry._type === 'captured') {
                    return vm.capturedVars?.[entry.idx];
                }
            }
            if (vm.globals && Object.prototype.hasOwnProperty.call(vm.globals, expr)) {
                return vm.globals[expr];
            }
            return undefined;
        } catch (e) {
            return { error: e.message };
        }
    }
}

module.exports = { Debugger };
