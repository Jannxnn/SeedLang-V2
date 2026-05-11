const fs = require('fs');
const path = require('path');
const { SeedLangVM } = require('../../src/runtime/vm.js');

const ramp = ' .:-=+*#%@';

function frameToAscii(frame) {
  const { width, height, pixels } = frame;
  const lines = [];
  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      const idx = Math.max(0, Math.min(ramp.length - 1, Math.floor(lum * (ramp.length - 1))));
      line += ramp[idx];
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function sleepMs(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

const host = {
  init() {},
  clear() {},
  drawPixel() {},
  drawRect() {},
  present(frame) {
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(frameToAscii(frame));
    process.stdout.write(`\n\nframe: ${frame.frame}  size: ${frame.width}x${frame.height}\n`);
    sleepMs(16);
    return true;
  }
};

const seedFile = path.join(__dirname, 'seed_graphics_runtime.seed');
const code = fs.readFileSync(seedFile, 'utf-8');

const vm = new SeedLangVM();
vm.setGraphicsHost(host);

const result = vm.run(code, { maxExecutionMs: 60000 });
if (!result || result.success === false) {
  console.error('Seed runtime error:', result && result.error ? result.error : 'unknown');
  process.exit(1);
}
