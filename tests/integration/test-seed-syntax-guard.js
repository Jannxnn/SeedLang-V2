#!/usr/bin/env node
/**
 * SeedLang 语法守护测试：检测 tests/*.js 中嵌入的 SeedLang 代码片段是否存在高风险语法回归
 *
 * It detects high-risk syntax regressions:
 * 1) Legacy reduce order: reduce(arr fn init)
 * 2) Inline if-return without block: if(cond)return x
 *
 * It also emits non-blocking style warnings:
 * - comma-separated function arguments
 * - comma-separated array/object literals
 */

const fs = require('fs');
const path = require('path');

const TEST_ROOT = path.join(__dirname, '..');
const JS_EXT = '.js';

const snippetExtractors = [
  /(?:^|[^\w.])(?:vm|v\d+|interpreter|runner|seed)\.run\s*\(\s*(`[\s\S]*?`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g,
  /(?:^|[^\w.])parse\s*\(\s*(`[\s\S]*?`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g,
  /(?:^|[^\w.])assertRun\s*\(\s*(`[\s\S]*?`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g,
  /\bcode\s*:\s*(`[\s\S]*?`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g
];

const allowLegacyReduce = [
  {
    fileEndsWith: path.join('core', 'test-comprehensive.js'),
    snippetIncludes: 'reduce(arr (acc x) => acc + x 0)'
  }
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full, files);
      }
    } else if (entry.isFile() && entry.name.endsWith(JS_EXT)) {
      files.push(full);
    }
  }
  return files;
}

function decodeJsStringLiteral(rawLiteral) {
  // rawLiteral includes quotes/backticks
  if (!rawLiteral || rawLiteral.length < 2) return '';
  const quote = rawLiteral[0];
  const body = rawLiteral.slice(1, -1);

  if (quote === '`') {
    return body;
  }

  try {
    return JSON.parse(`"${body.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  } catch (_) {
    return body;
  }
}

function extractSnippets(content) {
  const snippets = [];
  for (const regex of snippetExtractors) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(content)) !== null) {
      const raw = m[1];
      const snippet = decodeJsStringLiteral(raw);
      snippets.push({ snippet, at: m.index });
    }
  }
  return snippets;
}

function shouldAllowLegacyReduce(filePath, snippet) {
  return allowLegacyReduce.some(
    (rule) => filePath.endsWith(rule.fileEndsWith) && snippet.includes(rule.snippetIncludes)
  );
}

function findIssues(filePath, snippet) {
  const errors = [];
  const warnings = [];
  const stripped = snippet
    .replace(/"([^"\\]|\\.)*"/g, '""')
    .replace(/'([^'\\]|\\.)*'/g, "''");

  const hasLegacyReduceOrder =
    /reduce\(\s*(?:\[[^\]]*\]|\{[^}]*\}|[^\s()]+)\s+\([^)]+\)\s*=>/.test(snippet);
  if (hasLegacyReduceOrder && !shouldAllowLegacyReduce(filePath, snippet)) {
    errors.push('legacy reduce order: use reduce(arr init fn)');
  }

  const lines = snippet.split('\n');
  for (const line of lines) {
    const ifIdx = line.indexOf('if');
    if (ifIdx < 0) continue;
    const returnIdx = line.indexOf('return', ifIdx);
    if (returnIdx < 0) continue;
    const between = line.slice(ifIdx, returnIdx);
    // Flag only compact style: if (...) return x / if cond return x
    if (!between.includes('{')) {
      errors.push('inline if-return without block: use if cond { return x }');
      break;
    }
  }

  // Non-blocking style checks.
  // Function call args with comma: foo(a, b)
  // Ignore function declarations: fn add(a, b) { ... }
  const strippedLines = stripped.split('\n');
  const hasCommaCall = strippedLines.some((line) => {
    const t = line.trim();
    if (t.startsWith('fn ') || t.startsWith('async fn ') || t.startsWith('coro ')) {
      return false;
    }
    return /\b\w+\s*\([^)\n]*,[^)\n]*\)/.test(t);
  });
  if (hasCommaCall) {
    warnings.push('comma-separated call args found: prefer space-separated style');
  }
  // Array literal commas: [1, 2]
  if (/\[[^\]\n]*,[^\]\n]*\]/.test(stripped)) {
    warnings.push('comma-separated array literal found: prefer [1 2 3]');
  }
  // Object literal commas: {a: 1, b: 2}
  if (/\{[^}\n]*:[^}\n]*,[^}\n]*:[^}\n]*\}/.test(stripped)) {
    warnings.push('comma-separated object literal found: prefer {a: 1 b: 2}');
  }

  return { errors, warnings };
}

function main() {
  const files = walk(TEST_ROOT).filter((f) => !f.endsWith(path.join('integration', 'test-seed-syntax-guard.js')));
  const violations = [];
  const styleWarnings = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const snippets = extractSnippets(content);
    for (const { snippet } of snippets) {
      const { errors, warnings } = findIssues(file, snippet);
      for (const issue of errors) {
        violations.push({ file, issue, snippet: snippet.split('\n').slice(0, 3).join(' | ') });
      }
      for (const warning of warnings) {
        styleWarnings.push({ file, warning, snippet: snippet.split('\n').slice(0, 2).join(' | ') });
      }
    }
  }

  if (violations.length > 0) {
    console.log('[FAIL] Seed syntax guard violations:');
    for (const v of violations) {
      console.log(`  - ${v.file}`);
      console.log(`    issue: ${v.issue}`);
      console.log(`    snippet: ${v.snippet}`);
    }
    console.log('\nPassed: 0');
    console.log(`Failed: ${violations.length}`);
    process.exit(1);
  }

  if (styleWarnings.length > 0) {
    console.log('[WARN] Seed syntax style warnings (non-blocking):');
    for (const w of styleWarnings) {
      console.log(`  - ${w.file}`);
      console.log(`    warning: ${w.warning}`);
      console.log(`    snippet: ${w.snippet}`);
    }
  }

  console.log('[OK] Seed syntax guard passed.');
  console.log('Passed: 1');
  console.log('Failed: 0');
}

main();
