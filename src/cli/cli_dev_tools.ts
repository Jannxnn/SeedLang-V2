import * as fs from 'fs';
import * as path from 'path';

export function formatCode(source: string): string {
  const lines = source.split('\n');
  const formatted: string[] = [];
  let indentLevel = 0;
  const indentStr = '  ';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) {
      formatted.push(line);
      continue;
    }

    const decreaseIndent = ['}', ']', ')'].some((d) => trimmed.endsWith(d));
    const increaseIndent = ['{', '[', '('].some((i) => trimmed.includes(i) && !trimmed.includes('}'));

    if (decreaseIndent && indentLevel > 0) {
      indentLevel--;
    }

    formatted.push(indentStr.repeat(indentLevel) + trimmed);

    if (increaseIndent) {
      indentLevel++;
    }
  }

  return formatted.join('\n');
}

export function lintCode(source: string): {
  errors: Array<{ line: number; message: string; severity: string }>;
  warnings: Array<{ line: number; message: string }>;
  stats: { lines: number; statements: number; functions: number };
} {
  const errors: Array<{ line: number; message: string; severity: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const lines = source.split('\n');
  let functions = 0;
  let statements = 0;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    if (trimmed.match(/^(fn|async)\s+\w+/)) {
      functions++;
    }

    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
      statements++;
    }

    if (trimmed.length > 120) {
      warnings.push({ line: lineNum, message: `Line too long (${trimmed.length} chars, recommended <120)` });
    }

    if (/var\s+/.test(trimmed)) {
      warnings.push({ line: lineNum, message: 'Use let instead of var' });
    }

    if (trimmed === '}') {
      const prevLine = lines[idx - 1]?.trim() || '';
      if (prevLine === '') {
        warnings.push({ line: lineNum, message: 'Empty line before closing brace' });
      }
    }

    if (trimmed.match(/console\.log/)) {
      warnings.push({ line: lineNum, message: 'Remove console.log in production code' });
    }

    if (trimmed.includes('==') && !trimmed.includes('===') && !trimmed.includes('!=')) {
      warnings.push({ line: lineNum, message: 'Use strict equality === instead of ==' });
    }
  });

  if (lines.length < 5) {
    warnings.push({ line: 1, message: 'File too short, may be incomplete' });
  }

  return { errors, warnings, stats: { lines: lines.length, statements, functions } };
}

export function showStats(source: string): void {
  const lines = source.split('\n');
  const totalLines = lines.length;
  const blankLines = lines.filter((l) => l.trim() === '').length;
  const commentLines = lines.filter((l) => l.trim().startsWith('//')).length;
  const codeLines = totalLines - blankLines - commentLines;

  const words = source.split(/\s+/).filter((w) => w.length > 0).length;
  const chars = source.length;

  let funcCount = 0;
  let varCount = 0;
  let loopCount = 0;
  let ifCount = 0;

  lines.forEach((line) => {
    const t = line.trim();
    if (/^fn\s/.test(t) || /^async\s/.test(t)) funcCount++;
    if (/!.*#vA>/.test(t)) varCount++;
    if (/for\s|while\s/.test(t)) loopCount++;
    if (/if\s/.test(t)) ifCount++;
  });

  console.log('\nCode Statistics\n');
  console.log(`  Lines:`);
  console.log(`    Total:     ${totalLines}`);
  console.log(`    Code:      ${codeLines}`);
  console.log(`    Blank:     ${blankLines}`);
  console.log(`    Comments:  ${commentLines}`);
  console.log('');
  console.log(`  Words: ${words}`);
  console.log(`  Chars: ${chars}`);
  console.log('');
  console.log(`  Structure:`);
  console.log(`    Functions: ${funcCount}`);
  console.log(`    Variables: ${varCount}`);
  console.log(`    Loops:     ${loopCount}`);
  console.log(`    Ifs:       ${ifCount}`);
  console.log('');
  console.log(`  Complexity: ${(funcCount * 3 + loopCount * 2 + ifCount).toFixed(0)}`);
}

export function initProject(): void {
  const configPath = path.resolve(process.cwd(), 'seed.config.json');

  if (fs.existsSync(configPath)) {
    console.log('\nProject already has seed.config.json');
    return;
  }

  const config = {
    name: path.basename(process.cwd()),
    version: '2.0.0',
    main: 'main.seed',
    runtime: 'general',
    options: {
      debug: false,
      strict: true
    },
    dependencies: {},
    scripts: {
      run: 'seedlang main.seed',
      watch: 'seedlang --watch main.seed',
      build: 'seedlang --compile main.seed -o dist/main.js'
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`\nProject initialized!`);
  console.log(`   Config file: ${configPath}`);
  console.log(`\n   Next steps:`);
  console.log('     1. Create main.seed file');
  console.log('     2. Run: seedlang main.seed');
}
