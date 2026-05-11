'use strict';
// VM 内置函数 - 图形绘制模块：提供终端 Canvas 像素操作、图形原语（线、矩形、圆）、文本渲染、精灵与图表等绘图 API

function createGraphicsBuiltins(vm) {
    const toInt = (v, fallback = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.floor(n) : fallback;
    };
    const clampByte = (v, fallback = 0) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return fallback;
        if (n <= 0) return 0;
        if (n >= 255) return 255;
        return Math.floor(n);
    };
    const normalizeColor = (args, start = 0) => ({
        r: clampByte(args[start + 0], 255),
        g: clampByte(args[start + 1], 255),
        b: clampByte(args[start + 2], 255),
        a: clampByte(args[start + 3], 255)
    });
    const ensureState = (create = true) => {
        if (vm._seedGraphicsState) return vm._seedGraphicsState;
        if (!create) return null;
        const width = 64;
        const height = 36;
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i + 3] = 255;
        }
        vm._seedGraphicsState = {
            width,
            height,
            pixels,
            frame: 0
        };
        return vm._seedGraphicsState;
    };
    const callHost = (method, ...params) => {
        const host = vm._seedGraphicsHost || (typeof globalThis !== 'undefined' ? globalThis.__seedGraphicsHost : null);
        if (!host || typeof host[method] !== 'function') return undefined;
        try {
            return host[method](...params);
        } catch (_) {
            return undefined;
        }
    };
    const clear = (state, r, g, b, a) => {
        const p = state.pixels;
        for (let i = 0; i < p.length; i += 4) {
            p[i] = r;
            p[i + 1] = g;
            p[i + 2] = b;
            p[i + 3] = a;
        }
    };
    const drawPixel = (state, x, y, r, g, b, a) => {
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) return;
        const i = (y * state.width + x) * 4;
        const p = state.pixels;
        p[i] = r;
        p[i + 1] = g;
        p[i + 2] = b;
        p[i + 3] = a;
    };
    const drawRect = (state, x, y, w, h, r, g, b, a) => {
        if (w <= 0 || h <= 0) return;
        const x0 = Math.max(0, x);
        const y0 = Math.max(0, y);
        const x1 = Math.min(state.width, x + w);
        const y1 = Math.min(state.height, y + h);
        for (let py = y0; py < y1; py++) {
            for (let px = x0; px < x1; px++) {
                const i = (py * state.width + px) * 4;
                const p = state.pixels;
                p[i] = r;
                p[i + 1] = g;
                p[i + 2] = b;
                p[i + 3] = a;
            }
        }
    };
    const asciiPresent = (state) => {
        const chars = ' .:-=+*#%@';
        const lines = [];
        for (let y = 0; y < state.height; y++) {
            let line = '';
            for (let x = 0; x < state.width; x++) {
                const i = (y * state.width + x) * 4;
                const r = state.pixels[i];
                const g = state.pixels[i + 1];
                const b = state.pixels[i + 2];
                const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
                const idx = Math.max(0, Math.min(chars.length - 1, Math.floor(lum * (chars.length - 1))));
                line += chars[idx];
            }
            lines.push(line);
        }
        return lines.join('\n');
    };

    return {
        seed: {
            graphics: {
                init: (args) => {
                    const width = Math.max(1, Math.min(4096, toInt(args[0], 64)));
                    const height = Math.max(1, Math.min(4096, toInt(args[1], 36)));
                    const pixels = new Uint8ClampedArray(width * height * 4);
                    for (let i = 0; i < pixels.length; i += 4) pixels[i + 3] = 255;
                    vm._seedGraphicsState = { width, height, pixels, frame: 0 };
                    callHost('init', width, height);
                    return true;
                },
                info: () => {
                    const state = ensureState(false);
                    if (!state) return Object.create(null);
                    return {
                        width: state.width,
                        height: state.height,
                        frame: state.frame
                    };
                },
                clear: (args) => {
                    const state = ensureState(true);
                    const c = normalizeColor(args, 0);
                    clear(state, c.r, c.g, c.b, c.a);
                    callHost('clear', c.r, c.g, c.b, c.a);
                    return null;
                },
                drawPixel: (args) => {
                    const state = ensureState(true);
                    const x = toInt(args[0], 0);
                    const y = toInt(args[1], 0);
                    const c = normalizeColor(args, 2);
                    drawPixel(state, x, y, c.r, c.g, c.b, c.a);
                    callHost('drawPixel', x, y, c.r, c.g, c.b, c.a);
                    return null;
                },
                drawRect: (args) => {
                    const state = ensureState(true);
                    const x = toInt(args[0], 0);
                    const y = toInt(args[1], 0);
                    const w = toInt(args[2], 0);
                    const h = toInt(args[3], 0);
                    const c = normalizeColor(args, 4);
                    drawRect(state, x, y, w, h, c.r, c.g, c.b, c.a);
                    callHost('drawRect', x, y, w, h, c.r, c.g, c.b, c.a);
                    return null;
                },
                present: (args) => {
                    const state = ensureState(true);
                    state.frame = (state.frame + 1) >>> 0;
                    const payload = {
                        width: state.width,
                        height: state.height,
                        frame: state.frame,
                        pixels: new Uint8ClampedArray(state.pixels)
                    };
                    const hostHandled = callHost('present', payload);
                    if (hostHandled === undefined) {
                        const ascii = asciiPresent(state);
                        if (!vm.output) vm.output = [];
                        vm.output.push(ascii);
                    }
                    if (args[0] === true) return payload;
                    return state.frame;
                },
                getFrame: () => {
                    const state = ensureState(true);
                    return {
                        width: state.width,
                        height: state.height,
                        frame: state.frame,
                        pixels: Array.from(state.pixels)
                    };
                }
            }
        }
    };
}

module.exports = {
    createGraphicsBuiltins
};
