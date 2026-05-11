/**
 * 交付物回归：tests/deliverables/fixtures/stability-check/app.seed 输出须与 golden.txt 一致。
 * 单独运行: node tests/deliverables/test-stability-deliverable.js
 * 默认随 npm test（--quick 起即包含）。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const { parse } = require(path.join(root, 'dist', 'core', 'parser'));
const { Interpreter } = require(path.join(root, 'dist', 'core', 'interpreter'));

const seedPath = path.join(root, 'tests', 'deliverables', 'fixtures', 'stability-check', 'app.seed');
const goldenPath = path.join(root, 'tests', 'deliverables', 'fixtures', 'stability-check', 'golden.txt');

console.log('='.repeat(60));
console.log('  Stability Deliverable (Seed app.seed vs golden.txt)');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`  [OK] ${name}`);
      passed++;
    } else {
      console.log(`  [FAIL] ${name}: ${result}`);
      failed++;
    }
  } catch (e) {
    console.log(`  [FAIL] ${name}: ${e.message}`);
    failed++;
  }
}

test('golden files exist', () => {
  if (!fs.existsSync(seedPath)) return `missing ${seedPath}`;
  if (!fs.existsSync(goldenPath)) return `missing ${goldenPath}`;
});

test('interpreter output matches golden.txt', () => {
  const source = fs.readFileSync(seedPath, 'utf8');
  const expected = fs.readFileSync(goldenPath, 'utf8').trim().replace(/\r\n/g, '\n');
  const program = parse(source);
  const interp = new Interpreter();
  const origLog = console.log;
  console.log = () => {};
  try {
    interp.interpret(program);
  } finally {
    console.log = origLog;
  }
  const actual = (interp.getOutput() || []).join('\n').trim();
  if (actual !== expected) {
    return `mismatch:\n--- golden ---\n${expected}\n--- actual ---\n${actual}`;
  }
});

console.log('-'.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('-'.repeat(60));
if (failed > 0) process.exit(1);
