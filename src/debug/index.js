/**
 * SeedLang 调试系统
 * Debug System for AI-Assisted Error Location
 * 
 * 这个模块提供了多种工具帮助AI快速定位错误代码
 */

const fs = require('fs');
const path = require('path');

// ============================================
// 1. 源码位置映射器
// ============================================
class DebugSourceMapper {
    constructor() {
        this.lineMap = new Map();
        this.columnMap = new Map();
    }
    
    recordLocation(bytecodeOffset, line, column = 0) {
        this.lineMap.set(bytecodeOffset, line);
        this.columnMap.set(bytecodeOffset, column);
    }
    
    getLocation(bytecodeOffset) {
        return {
            line: this.lineMap.get(bytecodeOffset) || 0,
            column: this.columnMap.get(bytecodeOffset) || 0
        };
    }
    
    generateSourceMap(sourceCode, compiledCode) {
        const lines = sourceCode.split('\n');
        const map = {
            version: 3,
            sources: ['source.seed'],
            names: [],
            mappings: ''
        };
        return map;
    }
}

// ============================================
// 2. 增强错误报告器
// ============================================
class DebugErrorReporter {
    constructor(sourceCode, filename = 'main.seed') {
        this.sourceCode = sourceCode;
        this.filename = filename;
        this.lines = sourceCode.split('\n');
    }
    
    report(error) {
        const report = {
            type: error.type || 'Error',
            message: error.message,
            location: {
                file: this.filename,
                line: error.line || 0,
                column: error.column || 0,
                lineContent: this.lines[error.line - 1] || '',
                lineRange: this.getLineRange(error.line, 3)
            },
            stackTrace: error.stackTrace || [],
            suggestions: this.generateSuggestions(error),
            relatedCode: this.findRelatedCode(error)
        };
        
        return report;
    }
    
    getLineRange(line, context = 3) {
        const start = Math.max(1, line - context);
        const end = Math.min(this.lines.length, line + context);
        const range = [];
        
        for (let i = start; i <= end; i++) {
            range.push({
                lineNumber: i,
                content: this.lines[i - 1],
                isError: i === line
            });
        }
        
        return range;
    }
    
    generateSuggestions(error) {
        const suggestions = [];
        const msg = error.message.toLowerCase();
        
        if (msg.includes('undefined variable')) {
            const varName = error.message.match(/'(\w+)'/)?.[1];
            if (varName) {
                suggestions.push({
                    type: 'possible_fix',
                    message: `检查变量 '${varName}' 是否已定义`,
                    code: `${varName} = <value>  // 定义变量`
                });
                suggestions.push({
                    type: 'similar_names',
                    message: '相似变量名:',
                    names: this.findSimilarVariables(varName)
                });
            }
        }
        
        if (msg.includes('type error') || msg.includes('cannot')) {
            suggestions.push({
                type: 'type_check',
                message: '检查变量类型是否正确'
            });
        }
        
        return suggestions;
    }
    
    findSimilarVariables(varName) {
        const similar = [];
        const threshold = 2;
        
        for (let i = 0; i < this.lines.length; i++) {
            const matches = this.lines[i].match(/(\w+)\s*=/g);
            if (matches) {
                for (const match of matches) {
                    const name = match.replace(/\s*=/, '');
                    if (this.levenshteinDistance(varName, name) <= threshold) {
                        similar.push({ name, line: i + 1 });
                    }
                }
            }
        }
        
        return similar;
    }
    
    levenshteinDistance(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }
    
    findRelatedCode(error) {
        const related = [];
        const keywords = this.extractKeywords(error.message);
        
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];
            for (const keyword of keywords) {
                if (line.includes(keyword)) {
                    related.push({
                        line: i + 1,
                        content: line,
                        reason: `包含关键词: ${keyword}`
                    });
                }
            }
        }
        
        return related.slice(0, 5);
    }
    
    extractKeywords(message) {
        const keywords = [];
        const matches = message.match(/'(\w+)'/g);
        if (matches) {
            keywords.push(...matches.map(m => m.replace(/'/g, '')));
        }
        return keywords;
    }
    
    formatReport(report) {
        let output = '';
        
        output += `\n${'═'.repeat(60)}\n`;
        output += `  ${report.type}: ${report.message}\n`;
        output += `${'═'.repeat(60)}\n\n`;
        
        output += `📁 文件: ${report.location.file}\n`;
        output += `📍 位置: 第 ${report.location.line} 行, 第 ${report.location.column} 列\n\n`;
        
        output += `📝 代码上下文:\n`;
        output += `${'─'.repeat(60)}\n`;
        for (const line of report.location.lineRange) {
            const prefix = line.isError ? '>>> ' : '    ';
            const lineNum = String(line.lineNumber).padStart(4, ' ');
            output += `${prefix}${lineNum} | ${line.content}\n`;
        }
        output += `${'─'.repeat(60)}\n\n`;
        
        if (report.stackTrace.length > 0) {
            output += `📚 调用栈:\n`;
            for (const frame of report.stackTrace) {
                output += `    at ${frame.name}() (line ${frame.line})\n`;
            }
            output += '\n';
        }
        
        if (report.suggestions.length > 0) {
            output += `💡 建议:\n`;
            for (const suggestion of report.suggestions) {
                output += `    • ${suggestion.message}\n`;
                if (suggestion.code) {
                    output += `      ${suggestion.code}\n`;
                }
            }
            output += '\n';
        }
        
        return output;
    }
}

// ============================================
// 3. 代码分析器
// ============================================
class CodeAnalyzer {
    constructor(sourceCode) {
        this.sourceCode = sourceCode;
        this.lines = sourceCode.split('\n');
    }
    
    findDefinition(varName) {
        const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];
            const match = line.match(new RegExp(`\\b${escaped}\\s*=`));
            if (match) {
                return {
                    line: i + 1,
                    content: line.trim(),
                    type: 'assignment'
                };
            }
            const fnMatch = line.match(new RegExp(`fn\\s+${escaped}\\s*\\(`));
            if (fnMatch) {
                return {
                    line: i + 1,
                    content: line.trim(),
                    type: 'function'
                };
            }
            const classMatch = line.match(new RegExp(`class\\s+${escaped}`));
            if (classMatch) {
                return {
                    line: i + 1,
                    content: line.trim(),
                    type: 'class'
                };
            }
        }
        return null;
    }
    
    findUsages(varName) {
        const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const usages = [];
        const regex = new RegExp(`\\b${escaped}\\b`, 'g');
        
        for (let i = 0; i < this.lines.length; i++) {
            let match;
            while ((match = regex.exec(this.lines[i])) !== null) {
                usages.push({
                    line: i + 1,
                    column: match.index + 1,
                    content: this.lines[i].trim()
                });
            }
        }
        
        return usages;
    }
    
    findScope(lineNumber) {
        let braceCount = 0;
        let scopeStart = 0;
        let scopeEnd = this.lines.length;
        
        for (let i = lineNumber - 1; i >= 0; i--) {
            const line = this.lines[i] || '';
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;
            if (braceCount === 0 && line.includes('{')) {
                scopeStart = i + 1;
                break;
            }
        }
        
        braceCount = 0;
        for (let i = scopeStart - 1; i < this.lines.length; i++) {
            const line = this.lines[i] || '';
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;
            if (braceCount === 0 && i >= lineNumber - 1) {
                scopeEnd = i + 1;
                break;
            }
        }
        
        return { start: scopeStart, end: scopeEnd };
    }
    
    extractVariablesInScope(lineNumber) {
        const scope = this.findScope(lineNumber);
        const variables = [];
        const varRegex = /(\w+)\s*=/g;
        
        for (let i = scope.start - 1; i < scope.end; i++) {
            let match;
            while ((match = varRegex.exec(this.lines[i])) !== null) {
                variables.push({
                    name: match[1],
                    line: i + 1
                });
            }
        }
        
        return variables;
    }
}

// ============================================
// 4. 调试信息生成器
// ============================================
class DebugInfoGenerator {
    constructor() {
        this.breakpoints = new Map();
        this.watchExpressions = new Map();
    }
    
    addBreakpoint(line, condition = null) {
        this.breakpoints.set(line, { line, condition, hit: false });
    }
    
    removeBreakpoint(line) {
        this.breakpoints.delete(line);
    }
    
    addWatch(expression) {
        this.watchExpressions.set(expression, { expression, value: null });
    }
    
    generateDebugInfo(bytecode, sourceCode) {
        return {
            bytecode: bytecode,
            sourceLines: sourceCode.split('\n'),
            breakpoints: Array.from(this.breakpoints.values()),
            watches: Array.from(this.watchExpressions.values())
        };
    }
}

// ============================================
// 5. LSP 数据提供器
// ============================================
class LSPDataProvider {
    constructor(sourceCode) {
        this.sourceCode = sourceCode;
        this.analyzer = new CodeAnalyzer(sourceCode);
    }
    
    getDiagnostics(errors) {
        return errors.map(error => ({
            range: {
                start: { line: error.line - 1, character: error.column || 0 },
                end: { line: error.line - 1, character: (error.column || 0) + 10 }
            },
            severity: error.type === 'SyntaxError' ? 1 : 2,
            message: error.message,
            source: 'seedlang'
        }));
    }
    
    getDefinition(position) {
        const line = this.sourceCode.split('\n')[position.line];
        const wordMatch = line.slice(position.character).match(/^(\w+)/);
        if (wordMatch) {
            return this.analyzer.findDefinition(wordMatch[1]);
        }
        return null;
    }
    
    getReferences(position) {
        const line = this.sourceCode.split('\n')[position.line];
        const wordMatch = line.slice(position.character).match(/^(\w+)/);
        if (wordMatch) {
            return this.analyzer.findUsages(wordMatch[1]);
        }
        return [];
    }
    
    getHover(position) {
        const line = this.sourceCode.split('\n')[position.line];
        const wordMatch = line.slice(position.character).match(/^(\w+)/);
        if (wordMatch) {
            const def = this.analyzer.findDefinition(wordMatch[1]);
            if (def) {
                return {
                    contents: `${def.type}: ${wordMatch[1]}\n定义于第 ${def.line} 行`
                };
            }
        }
        return null;
    }
}

// ============================================
// 6. 高级断点管理器
// ============================================
class BreakpointManager {
    constructor() {
        this.breakpoints = new Map();
        this.conditionalBreakpoints = new Map();
        this.logpoints = new Map();
        this.hitCounts = new Map();
        this.enabled = true;
    }
    
    setBreakpoint(file, line, options = {}) {
        const id = `${file}:${line}`;
        const bp = {
            id,
            file,
            line,
            enabled: true,
            condition: options.condition || null,
            hitCondition: options.hitCondition || null,
            logMessage: options.logMessage || null,
            hitCount: 0,
            createdAt: Date.now()
        };
        
        this.breakpoints.set(id, bp);
        
        if (bp.condition) {
            this.conditionalBreakpoints.set(id, bp);
        }
        
        if (bp.logMessage) {
            this.logpoints.set(id, bp);
        }
        
        return bp;
    }
    
    removeBreakpoint(id) {
        this.breakpoints.delete(id);
        this.conditionalBreakpoints.delete(id);
        this.logpoints.delete(id);
        this.hitCounts.delete(id);
    }
    
    toggleBreakpoint(id) {
        const bp = this.breakpoints.get(id);
        if (bp) {
            bp.enabled = !bp.enabled;
            return bp;
        }
        return null;
    }
    
    shouldBreak(file, line, context = {}) {
        if (!this.enabled) return false;
        
        const id = `${file}:${line}`;
        const bp = this.breakpoints.get(id);
        
        if (!bp || !bp.enabled) return false;
        
        bp.hitCount++;
        
        if (bp.hitCondition) {
            const targetHits = parseInt(bp.hitCondition);
            if (bp.hitCount < targetHits) return false;
        }
        
        if (bp.condition) {
            try {
                const result = this.evaluateCondition(bp.condition, context);
                return !!result;
            } catch (e) {
                return false;
            }
        }
        
        if (bp.logMessage) {
            this.executeLogpoint(bp, context);
            return false;
        }
        
        return true;
    }
    
    evaluateCondition(condition, context) {
        const vars = context.variables || {};
        const fn = new Function(...Object.keys(vars), `return ${condition}`);
        return fn(...Object.values(vars));
    }
    
    executeLogpoint(bp, context) {
        let message = bp.logMessage;
        const vars = context.variables || {};
        
        for (const [name, value] of Object.entries(vars)) {
            message = message.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
        }
        
        console.log(`[Logpoint ${bp.line}] ${message}`);
    }
    
    getBreakpoints(file = null) {
        const all = Array.from(this.breakpoints.values());
        if (file) {
            return all.filter(bp => bp.file === file);
        }
        return all;
    }
    
    clearAll() {
        this.breakpoints.clear();
        this.conditionalBreakpoints.clear();
        this.logpoints.clear();
        this.hitCounts.clear();
    }
    
    exportBreakpoints() {
        return Array.from(this.breakpoints.values()).map(bp => ({
            file: bp.file,
            line: bp.line,
            condition: bp.condition,
            hitCondition: bp.hitCondition,
            logMessage: bp.logMessage
        }));
    }
    
    importBreakpoints(breakpoints) {
        for (const bp of breakpoints) {
            this.setBreakpoint(bp.file, bp.line, bp);
        }
    }
}

// ============================================
// 7. 性能分析器
// ============================================
class PerformanceProfiler {
    constructor(options = {}) {
        this.samples = [];
        this.functionTimings = new Map();
        this.lineTimings = new Map();
        this.memorySnapshots = [];
        this.enabled = options.enabled !== false;
        this.sampleInterval = options.sampleInterval || 100;
        this.maxSamples = options.maxSamples || 10000;
        this._samplingTimer = null;
    }
    
    startProfiling() {
        if (!this.enabled) return;
        
        this.samples = [];
        this.functionTimings.clear();
        this.lineTimings.clear();
        this.memorySnapshots = [];
        
        this.startTime = Date.now();
        this.startMemory = process.memoryUsage();
        
        this._samplingTimer = setInterval(() => {
            this.takeSample();
        }, this.sampleInterval);
    }
    
    stopProfiling() {
        if (this._samplingTimer) {
            clearInterval(this._samplingTimer);
            this._samplingTimer = null;
        }
        
        this.endTime = Date.now();
        this.endMemory = process.memoryUsage();
        
        return this.generateReport();
    }
    
    takeSample() {
        if (this.samples.length >= this.maxSamples) {
            this.samples.shift();
        }
        
        const sample = {
            timestamp: Date.now(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
        };
        
        this.samples.push(sample);
    }
    
    recordFunctionCall(functionName, duration) {
        if (!this.functionTimings.has(functionName)) {
            this.functionTimings.set(functionName, {
                calls: 0,
                totalTime: 0,
                minTime: Infinity,
                maxTime: 0
            });
        }
        
        const timing = this.functionTimings.get(functionName);
        timing.calls++;
        timing.totalTime += duration;
        timing.minTime = Math.min(timing.minTime, duration);
        timing.maxTime = Math.max(timing.maxTime, duration);
    }
    
    recordLineExecution(file, line, duration) {
        const key = `${file}:${line}`;
        if (!this.lineTimings.has(key)) {
            this.lineTimings.set(key, {
                executions: 0,
                totalTime: 0
            });
        }
        
        const timing = this.lineTimings.get(key);
        timing.executions++;
        timing.totalTime += duration;
    }
    
    recordMemorySnapshot(label) {
        this.memorySnapshots.push({
            label,
            timestamp: Date.now(),
            memory: process.memoryUsage()
        });
    }
    
    generateReport() {
        const functionStats = [];
        for (const [name, timing] of this.functionTimings) {
            functionStats.push({
                function: name,
                calls: timing.calls,
                totalTime: timing.totalTime,
                avgTime: timing.totalTime / timing.calls,
                minTime: timing.minTime,
                maxTime: timing.maxTime
            });
        }
        
        functionStats.sort((a, b) => b.totalTime - a.totalTime);
        
        const lineStats = [];
        for (const [key, timing] of this.lineTimings) {
            lineStats.push({
                location: key,
                executions: timing.executions,
                totalTime: timing.totalTime,
                avgTime: timing.totalTime / timing.executions
            });
        }
        
        lineStats.sort((a, b) => b.totalTime - a.totalTime);
        
        const memoryDiff = {
            heapUsed: this.endMemory.heapUsed - this.startMemory.heapUsed,
            heapTotal: this.endMemory.heapTotal - this.startMemory.heapTotal,
            external: this.endMemory.external - this.startMemory.external,
            rss: this.endMemory.rss - this.startMemory.rss
        };
        
        return {
            duration: this.endTime - this.startTime,
            samples: this.samples.length,
            functions: functionStats.slice(0, 20),
            hotLines: lineStats.slice(0, 20),
            memory: {
                start: this.startMemory,
                end: this.endMemory,
                diff: memoryDiff,
                snapshots: this.memorySnapshots
            },
            recommendations: this.generateRecommendations(functionStats, lineStats, memoryDiff)
        };
    }
    
    generateRecommendations(functionStats, lineStats, memoryDiff) {
        const recommendations = [];
        
        const hotFunctions = functionStats.filter(f => f.calls > 100);
        if (hotFunctions.length > 0) {
            recommendations.push({
                type: 'hotspot',
                message: `发现 ${hotFunctions.length} 个热点函数，考虑优化或缓存`,
                functions: hotFunctions.map(f => f.function)
            });
        }
        
        if (memoryDiff.heapUsed > 50 * 1024 * 1024) {
            recommendations.push({
                type: 'memory',
                message: '内存使用增长较大，检查是否有内存泄漏'
            });
        }
        
        const slowLines = lineStats.filter(l => l.avgTime > 10);
        if (slowLines.length > 0) {
            recommendations.push({
                type: 'slow_code',
                message: `发现 ${slowLines.length} 行执行较慢的代码`,
                lines: slowLines.map(l => l.location)
            });
        }
        
        return recommendations;
    }
    
    getFlameGraph() {
        const nodes = [];
        
        for (const [name, timing] of this.functionTimings) {
            nodes.push({
                name,
                value: timing.totalTime,
                calls: timing.calls
            });
        }
        
        return {
            type: 'flamegraph',
            nodes: nodes.sort((a, b) => b.value - a.value)
        };
    }
    
    reset() {
        this.samples = [];
        this.functionTimings.clear();
        this.lineTimings.clear();
        this.memorySnapshots = [];
    }
}

// ============================================
// 8. 调试会话管理器
// ============================================
class DebugSession {
    constructor(options = {}) {
        this.id = `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.breakpoints = new BreakpointManager();
        this.profiler = new PerformanceProfiler(options.profiler);
        this.state = 'idle';
        this.currentLine = 0;
        this.currentFile = '';
        this.callStack = [];
        this.variables = new Map();
        this.watches = new Map();
        this.output = [];
        this.stepMode = null;
        this.stepTarget = null;
    }
    
    start() {
        this.state = 'running';
        this.profiler.startProfiling();
    }
    
    pause() {
        this.state = 'paused';
    }
    
    resume() {
        this.state = 'running';
        this.stepMode = null;
        this.stepTarget = null;
    }
    
    stepOver() {
        this.state = 'running';
        this.stepMode = 'over';
        this.stepTarget = this.currentLine + 1;
    }
    
    stepInto() {
        this.state = 'running';
        this.stepMode = 'into';
    }
    
    stepOut() {
        this.state = 'running';
        this.stepMode = 'out';
        this.stepTarget = this.callStack.length > 1 ? this.callStack[this.callStack.length - 2].line : 0;
    }
    
    stop() {
        this.state = 'stopped';
        return this.profiler.stopProfiling();
    }
    
    updatePosition(file, line) {
        this.currentFile = file;
        this.currentLine = line;
        
        if (this.breakpoints.shouldBreak(file, line, { variables: this.getVariables() })) {
            this.state = 'paused';
            return true;
        }
        
        if (this.stepMode === 'over' && line >= this.stepTarget) {
            this.state = 'paused';
            return true;
        }
        
        return false;
    }
    
    setVariable(name, value) {
        this.variables.set(name, value);
    }
    
    getVariables() {
        const vars = {};
        for (const [name, value] of this.variables) {
            vars[name] = value;
        }
        return vars;
    }
    
    addWatch(expression) {
        this.watches.set(expression, {
            expression,
            value: null,
            lastUpdated: null
        });
    }
    
    updateWatches() {
        const vars = this.getVariables();
        for (const [expr, watch] of this.watches) {
            try {
                const fn = new Function(...Object.keys(vars), `return ${expr}`);
                watch.value = fn(...Object.values(vars));
                watch.lastUpdated = Date.now();
            } catch (e) {
                watch.value = `<error: ${e.message}>`;
            }
        }
    }
    
    getWatches() {
        return Array.from(this.watches.values());
    }
    
    pushCallStack(frame) {
        this.callStack.push(frame);
    }
    
    popCallStack() {
        return this.callStack.pop();
    }
    
    getCallStack() {
        return [...this.callStack];
    }
    
    logOutput(message, type = 'log') {
        this.output.push({
            message,
            type,
            timestamp: Date.now()
        });
    }
    
    getOutput() {
        return [...this.output];
    }
    
    getStatus() {
        return {
            id: this.id,
            state: this.state,
            currentFile: this.currentFile,
            currentLine: this.currentLine,
            callStackDepth: this.callStack.length,
            variableCount: this.variables.size,
            watchCount: this.watches.size,
            breakpointCount: this.breakpoints.breakpoints.size
        };
    }
}

// ============================================
// 导出
// ============================================
module.exports = {
    DebugSourceMapper,
    DebugErrorReporter,
    CodeAnalyzer,
    DebugInfoGenerator,
    LSPDataProvider,
    BreakpointManager,
    PerformanceProfiler,
    DebugSession
};
