class Profiler {
    constructor(vm) {
        this._vm = vm;
        this._enabled = false;
        this._functionStats = new Map();
        this._opcodeCounts = new Map();
        this._totalOpcodes = 0;
        this._startTime = 0;
        this._endTime = 0;
        this._callStack = [];
        this._lineHits = new Map();
    }

    enable() {
        this._enabled = true;
        this._startTime = performance.now();
        this._functionStats.clear();
        this._opcodeCounts.clear();
        this._totalOpcodes = 0;
        this._lineHits.clear();
        return this;
    }

    disable() {
        this._endTime = performance.now();
        this._enabled = false;
        return this;
    }

    isEnabled() {
        return this._enabled;
    }

    recordOpcode(op, ip) {
        if (!this._enabled) return;
        this._totalOpcodes++;
        const opName = this._getOpName(op);
        this._opcodeCounts.set(opName, (this._opcodeCounts.get(opName) || 0) + 1);

        if (this._vm.lineMap && this._vm.lineMap[ip] !== undefined) {
            const line = this._vm.lineMap[ip];
            this._lineHits.set(line, (this._lineHits.get(line) || 0) + 1);
        }
    }

    recordFunctionEntry(name) {
        if (!this._enabled) return;
        const entry = this._startTime ? performance.now() : 0;
        this._callStack.push({ name, startTime: entry });

        let stats = this._functionStats.get(name);
        if (!stats) {
            stats = { calls: 0, totalTime: 0, selfTime: 0, minTime: Infinity, maxTime: 0 };
            this._functionStats.set(name, stats);
        }
        stats.calls++;
    }

    recordFunctionExit(name) {
        if (!this._enabled) return;
        const exitTime = this._startTime ? performance.now() : 0;
        const entry = this._callStack.pop();
        if (!entry) return;

        const elapsed = exitTime - entry.startTime;
        const stats = this._functionStats.get(name);
        if (stats) {
            stats.totalTime += elapsed;
            stats.minTime = Math.min(stats.minTime, elapsed);
            stats.maxTime = Math.max(stats.maxTime, elapsed);
        }

        if (this._callStack.length > 0) {
            const parent = this._callStack[this._callStack.length - 1];
            const parentStats = this._functionStats.get(parent.name);
            if (parentStats) {
                parentStats.selfTime -= elapsed;
            }
        }
        if (stats) {
            stats.selfTime += elapsed;
        }
    }

    getFunctionStats() {
        const result = {};
        for (const [name, stats] of this._functionStats) {
            result[name] = {
                calls: stats.calls,
                totalTime: Math.round(stats.totalTime * 1000) / 1000,
                selfTime: Math.round(stats.selfTime * 1000) / 1000,
                avgTime: stats.calls > 0 ? Math.round((stats.totalTime / stats.calls) * 1000) / 1000 : 0,
                minTime: Math.round(stats.minTime * 1000) / 1000,
                maxTime: Math.round(stats.maxTime * 1000) / 1000
            };
        }
        return result;
    }

    getOpcodeStats() {
        const result = {};
        for (const [op, count] of this._opcodeCounts) {
            result[op] = count;
        }
        return result;
    }

    getHotOpcodes(topN = 10) {
        return [...this._opcodeCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .map(([op, count]) => ({ opcode: op, count, percentage: Math.round((count / this._totalOpcodes) * 10000) / 100 }));
    }

    getHotFunctions(topN = 10) {
        return [...this._functionStats.entries()]
            .sort((a, b) => b[1].selfTime - a[1].selfTime)
            .slice(0, topN)
            .map(([name, stats]) => ({
                name,
                calls: stats.calls,
                selfTime: Math.round(stats.selfTime * 1000) / 1000,
                totalTime: Math.round(stats.totalTime * 1000) / 1000
            }));
    }

    getLineCoverage() {
        const result = {};
        for (const [line, hits] of this._lineHits) {
            result[line] = hits;
        }
        return result;
    }

    getSummary() {
        const elapsed = this._endTime ? (this._endTime - this._startTime) : (this._startTime ? (performance.now() - this._startTime) : 0);
        return {
            totalTime: Math.round(elapsed * 1000) / 1000,
            totalOpcodes: this._totalOpcodes,
            opcodesPerSecond: elapsed > 0 ? Math.round(this._totalOpcodes / (elapsed / 1000)) : 0,
            uniqueOpcodes: this._opcodeCounts.size,
            uniqueFunctions: this._functionStats.size,
            hotOpcodes: this.getHotOpcodes(5),
            hotFunctions: this.getHotFunctions(5)
        };
    }

    reset() {
        this._functionStats.clear();
        this._opcodeCounts.clear();
        this._totalOpcodes = 0;
        this._lineHits.clear();
        this._callStack = [];
        this._startTime = this._enabled ? performance.now() : 0;
        this._endTime = 0;
        return this;
    }

    _getOpName(op) {
        const OP = this._vm.constructor?.OP;
        if (OP) {
            for (const [name, code] of Object.entries(OP)) {
                if (code === op) return name;
            }
        }
        return `OP_${op}`;
    }

    formatReport() {
        const summary = this.getSummary();
        const lines = [];
        lines.push('=== SeedLang Profiler Report ===');
        lines.push(`Total Time: ${summary.totalTime}ms`);
        lines.push(`Total Opcodes: ${summary.totalOpcodes.toLocaleString()}`);
        lines.push(`Opcodes/sec: ${summary.opcodesPerSecond.toLocaleString()}`);
        lines.push(`Unique Opcodes: ${summary.uniqueOpcodes}`);
        lines.push(`Unique Functions: ${summary.uniqueFunctions}`);
        lines.push('');
        lines.push('--- Hot Opcodes ---');
        for (const h of summary.hotOpcodes) {
            lines.push(`  ${h.opcode}: ${h.count.toLocaleString()} (${h.percentage}%)`);
        }
        lines.push('');
        lines.push('--- Hot Functions ---');
        for (const h of summary.hotFunctions) {
            lines.push(`  ${h.name}: ${h.calls} calls, self=${h.selfTime}ms, total=${h.totalTime}ms`);
        }
        return lines.join('\n');
    }
}

module.exports = { Profiler };
