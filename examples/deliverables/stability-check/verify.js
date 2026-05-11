#!/usr/bin/env node
/**
 * 验收脚本：对比解释器 getOutput() 与 golden.txt（不依赖 CLI 的重复打印）。
 * 在仓库根目录执行: node examples/deliverables/stability-check/verify.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const { parse } = require(path.join(root, 'dist', 'core', 'parser'));
const { Interpreter } = require(path.join(root, 'dist', 'core', 'interpreter'));

const seedPath = path.join(__dirname, 'app.seed');
const goldenPath = path.join(__dirname, 'golden.txt');

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
  process.stderr.write('verify:deliverable FAIL\n--- golden ---\n');
  process.stderr.write(expected + '\n--- actual ---\n');
  process.stderr.write(actual + '\n');
  process.exit(1);
}

process.stdout.write('verify:deliverable OK\n');
