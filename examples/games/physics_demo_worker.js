const fs = require('fs');
const path = require('path');
const { workerData, parentPort } = require('worker_threads');
const { SeedLangVM } = require('../../src/runtime/vm.js');

const seedFile = path.join(__dirname, 'physics_demo.seed');
const code = fs.readFileSync(seedFile, 'utf-8');

const vm = new SeedLangVM();
let frameCount = 0;
const startTime = Date.now();

const host = {
    init() {},
    clear() {},
    drawPixel() {},
    drawRect() {},
    present(frame) {
        frameCount++;
        const buf = Buffer.alloc(8 + frame.pixels.length);
        buf.writeUInt16LE(frame.width, 0);
        buf.writeUInt16LE(frame.height, 2);
        buf.writeUInt32LE(frame.frame, 4);
        Buffer.from(frame.pixels).copy(buf, 8);
        parentPort.postMessage({ type: 'frame', data: buf }, [buf]);
        const start = Date.now();
        while (Date.now() - start < 16) {}
        return true;
    }
};

vm.setGraphicsHost(host);

try {
    const result = vm.run(code, { maxExecutionMs: 300000 });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    parentPort.postMessage({ type: 'done', frames: frameCount, elapsed: elapsed });
} catch (err) {
    parentPort.postMessage({ type: 'error', error: err.message || String(err) });
}
