'use strict';

function extractLineFromErrorMessage(msg) {
    if (typeof msg !== 'string' || msg.length === 0) return 0;
    let m = msg.match(/\bline\s+(\d+)\b/i);
    if (!m) m = msg.match(/\bat\s+(\d+)\s*:\s*\d+\b/i);
    if (!m) return 0;
    const line = parseInt(m[1], 10);
    return Number.isFinite(line) && line > 0 ? line : 0;
}

function buildCodeFrame(code, line) {
    if (typeof code !== 'string' || !Number.isFinite(line) || line <= 0) return '';
    const lines = code.split(/\r?\n/);
    if (line > lines.length) return '';
    const start = Math.max(1, line - 1);
    const end = Math.min(lines.length, line + 1);
    const width = String(end).length;
    const out = [];
    for (let i = start; i <= end; i++) {
        const marker = i === line ? '>' : ' ';
        out.push(`${marker} ${String(i).padStart(width, ' ')} | ${lines[i - 1]}`);
    }
    return out.join('\n');
}

function buildRunErrorResult(owner, code, error, SeedLangErrorCtor) {
    if (error instanceof SeedLangErrorCtor) {
        return { success: false, error: error.toString(), output: owner._vm.output || [] };
    }
    let line = owner.parser.currentLine?.() || 0;
    if (!line) line = extractLineFromErrorMessage(error.message);
    const wrappedError = new SeedLangErrorCtor(error.message, 'RuntimeError', line, owner._vm.callStack || []);
    const frame = buildCodeFrame(code, line);
    const msg = frame ? `${wrappedError.toString()}\nCode:\n${frame}` : wrappedError.toString();
    return { success: false, error: msg, output: owner._vm.output || [] };
}

module.exports = {
    buildRunErrorResult
};
