'use strict';
// VM 内置函数 - AI 异步模块：提供 tokens、chat、embed 等 AI 相关异步调用能力

function createAiAsyncBuiltins() {
    return {
        tokens: (args) => {
            const text = String(args[0] ?? '');
            const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
            return words.length;
        },
        prompt: (args) => {
            const template = String(args[0] ?? '');
            const data = args[1] ?? {};
            return template.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? '');
        },
        chunk: (args) => {
            const text = String(args[0] ?? '');
            const size = args[1] ?? 500;
            const chunks = [];
            for (let i = 0; i < text.length; i += size) {
                chunks.push(text.slice(i, i + size));
            }
            return chunks;
        },
        similarity: (args) => {
            const a = String(args[0] ?? '');
            const b = String(args[1] ?? '');
            const setA = new Set(a.toLowerCase().split(/\s+/));
            const setB = new Set(b.toLowerCase().split(/\s+/));
            const intersection = [...setA].filter((x) => setB.has(x));
            const union = new Set([...setA, ...setB]);
            return union.size ? intersection.length / union.size : 0;
        },
        extract: (args) => {
            const text = String(args[0] ?? '');
            const pattern = String(args[1] ?? '.*');
            if (pattern.length > 200) return [];
            const nestedQuantifiers = /\+[*+]|[*+][*+]|\{\d.*,.*\}/.test(pattern);
            if (nestedQuantifiers) return [];
            try {
                const re = new RegExp(pattern, 'g');
                return text.match(re) ?? [];
            } catch {
                return [];
            }
        },
        summarize: (args) => {
            const text = String(args[0] ?? '');
            const maxLen = args[1] ?? 200;
            if (text.length <= maxLen) return text;
            const sentences = text.split(/[.!?]+/);
            let result = '';
            for (const s of sentences) {
                if ((result + s).length > maxLen) break;
                result += s.trim() + '. ';
            }
            return result.trim();
        },
        keywords: (args) => {
            const text = String(args[0] ?? '').toLowerCase();
            const words = text.match(/\b[a-z]{3,}\b/g) ?? [];
            const freq = {};
            for (const w of words) freq[w] = (freq[w] ?? 0) + 1;
            return Object.entries(freq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, args[1] ?? 10)
                .map(([w]) => w);
        },
        format: (args) => {
            const template = String(args[0] ?? '');
            const values = args.slice(1);
            return template.replace(/\$(\d+)/g, (_, n) => values[parseInt(n, 10) - 1] ?? '');
        },
        escape: (args) => {
            const text = String(args[0] ?? '');
            return text.replace(/[\\\"'\n\r\t]/g, (c) => {
                const map = { '\\': '\\\\', '"': '\\"', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t' };
                return map[c] ?? c;
            });
        },
        sleep: (args) => {
            const ms = args[0] ?? 0;
            return new Promise((resolve) => setTimeout(resolve, ms));
        },
        fetch: async (args) => {
            const url = args[0] ?? '';
            try {
                const response = await fetch(url);
                const text = await response.text();
                return text;
            } catch (e) {
                return null;
            }
        },
        fetchJson: async (args) => {
            const url = args[0] ?? '';
            try {
                const response = await fetch(url);
                const json = await response.json();
                return json;
            } catch (e) {
                return null;
            }
        }
    };
}

module.exports = {
    createAiAsyncBuiltins
};
