const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { SeedLangVM } = require('../../src/runtime/vm.js');

const seedPath = path.join(__dirname, 'lumen_lite_logic.seed');
const jsPath = path.join(__dirname, 'lumen_lite_logic.js');

const seedSource = fs.readFileSync(seedPath, 'utf8');
const jsSource = fs.readFileSync(jsPath, 'utf8');

const WIDTH = 48;
const HEIGHT = 27;
const STEPS = 2;
const REPEATS = 1;

const seedHarness = `
lumenInit(${WIDTH} ${HEIGHT})
lumenSetLight(${Math.floor(WIDTH * 0.56)} ${Math.floor(HEIGHT * 0.22)})
i = 0
while i < ${STEPS} {
    lumenStep()
    i = i + 1
}
`;

function runVmOnce(useGuardOverrides) {
  const vm = new SeedLangVM();
  const t0 = performance.now();
  const runOptions = useGuardOverrides
    ? { maxExecutionMs: 120000, maxInstructions: 200000000 }
    : {};
  const result = vm.run(seedSource + '\n' + seedHarness, runOptions);
  const t1 = performance.now();
  if (!result || result.success === false) {
    return {
      ok: false,
      ms: t1 - t0,
      error: result && result.error ? result.error : 'unknown'
    };
  }
  return { ok: true, ms: t1 - t0, error: '' };
}

function runJsOnce() {
  const runner = new Function(
    `${jsSource}
lumenInit(${WIDTH}, ${HEIGHT});
lumenSetLight(${Math.floor(WIDTH * 0.56)}, ${Math.floor(HEIGHT * 0.22)});
for (let i = 0; i < ${STEPS}; i++) {
  lumenStep();
}
return true;`
  );
  const t0 = performance.now();
  runner();
  const t1 = performance.now();
  return t1 - t0;
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { avg, p50, p95, min: sorted[0], max: sorted[sorted.length - 1] };
}

function format(ms) {
  return `${ms.toFixed(2)}ms`;
}

function main() {
  const vmDefaultRuns = [];
  const vmGuardRuns = [];
  const jsRuns = [];

  for (let i = 0; i < REPEATS; i++) {
    console.log(`[bench] VM(default) run ${i + 1}/${REPEATS}`);
    vmDefaultRuns.push(runVmOnce(false));
  }
  for (let i = 0; i < REPEATS; i++) {
    console.log(`[bench] VM(guard) run ${i + 1}/${REPEATS}`);
    vmGuardRuns.push(runVmOnce(true));
  }
  for (let i = 0; i < REPEATS; i++) {
    console.log(`[bench] JS run ${i + 1}/${REPEATS}`);
    jsRuns.push(runJsOnce());
  }

  const vmDefaultOk = vmDefaultRuns.filter(r => r.ok).map(r => r.ms);
  const vmGuardOk = vmGuardRuns.filter(r => r.ok).map(r => r.ms);
  const vmDefaultStat = vmDefaultOk.length ? stats(vmDefaultOk) : null;
  const vmGuardStat = vmGuardOk.length ? stats(vmGuardOk) : null;
  const jsStat = stats(jsRuns);
  const vmDefaultFail = vmDefaultRuns.find(r => !r.ok);
  const vmGuardFail = vmGuardRuns.find(r => !r.ok);

  console.log(`Seed Lumen Bench (${WIDTH}x${HEIGHT}, steps=${STEPS}, repeats=${REPEATS})`);
  if (vmDefaultStat) {
    console.log(`VM(default) avg=${format(vmDefaultStat.avg)} p50=${format(vmDefaultStat.p50)} p95=${format(vmDefaultStat.p95)} min=${format(vmDefaultStat.min)} max=${format(vmDefaultStat.max)}`);
  } else {
    console.log(`VM(default) failed: ${vmDefaultFail ? vmDefaultFail.error : 'unknown'}`);
  }
  if (vmGuardStat) {
    console.log(`VM(guard)   avg=${format(vmGuardStat.avg)} p50=${format(vmGuardStat.p50)} p95=${format(vmGuardStat.p95)} min=${format(vmGuardStat.min)} max=${format(vmGuardStat.max)}`);
  } else {
    console.log(`VM(guard)   failed: ${vmGuardFail ? vmGuardFail.error : 'unknown'}`);
  }
  console.log(`JS   avg=${format(jsStat.avg)} p50=${format(jsStat.p50)} p95=${format(jsStat.p95)} min=${format(jsStat.min)} max=${format(jsStat.max)}`);
  if (vmDefaultStat) console.log(`Ratio VM(default)/JS (avg): ${(vmDefaultStat.avg / jsStat.avg).toFixed(2)}x`);
  if (vmGuardStat) console.log(`Ratio VM(guard)/JS (avg): ${(vmGuardStat.avg / jsStat.avg).toFixed(2)}x`);
}

main();
