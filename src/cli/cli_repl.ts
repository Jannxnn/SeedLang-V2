import { parse } from '../core/parser';
import { Interpreter } from '../core/interpreter';

export async function startRepl(): Promise<void> {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });

  const replInterpreter = new Interpreter();
  let multiLineBuffer: string[] = [];
  let inMultiLineMode = false;
  let history: string[] = [];

  console.log(`
+===============================================+
|         SeedLang REPL v1.1.0                  |
|                                               |
|   Enter code and press Enter to execute       |
|   Type ... to start multi-line mode           |
|   Type .run to execute multi-line code        |
|   Type .exit to quit                          |
|   Type .help for help                         |
+===============================================+

Tip: Use Tab for autocomplete, Up/Down for history
`);

  rl.prompt();

  rl.on('line', (input: string) => {
    const trimmed = input.trim();

    if (trimmed === '.exit' || trimmed === '.quit') {
      console.log('Goodbye!');
      rl.close();
      process.exit(0);
      return;
    }

    if (trimmed === '.help') {
      console.log(`
+============================================+
|           Available Commands               |
+============================================+
| .help          Show this help              |
| .exit/.quit    Exit REPL                   |
| .clear         Clear screen                |
| .reset         Reset interpreter state     |
| ...            Enter multi-line mode       |
| .run           Execute multi-line buffer   |
| .cancel        Cancel multi-line input     |
| .history       Show command history        |
| .vars          Show current variables      |
| .funcs         Show defined functions      |
| .load <file>   Load and execute file       |
| .save <file>   Save history to file        |
| .time          Toggle timing mode          |
| .type <expr>   Show expression type        |
+============================================+

+============================================+
|           Language Examples                |
+============================================+
| "Hello World"     Print Hello World  |
| x>42              Define var x=42    |
| fn add(a b){a+b}        Define function    |
| add(2 3)                 Call func -> 5    |
| if true{"yes"}          Conditional        |
| for i in range(5){i}    Loop 0-4           |
| for i in rangeRev(5){i} Loop 4 down to 0  |
| [1 2 3]                  Array literal     |
| {name:"Alice"}          Object literal     |
| (x)=>x*2                Arrow function     |
+============================================+
`);
      rl.prompt();
      return;
    }

    if (trimmed === '.clear') {
      console.clear();
      console.log('SeedLang REPL');
      rl.prompt();
      return;
    }

    if (trimmed === '.reset') {
      replInterpreter.reset();
      multiLineBuffer = [];
      inMultiLineMode = false;
      console.log('Interpreter reset');
      rl.prompt();
      return;
    }

    if (trimmed === '...') {
      inMultiLineMode = true;
      multiLineBuffer = [];
      console.log('Multi-line mode (type .run to execute, .cancel to abort)');
      rl.setPrompt('... ');
      rl.prompt();
      return;
    }

    if (trimmed === '.run') {
      if (multiLineBuffer.length > 0) {
        const code = multiLineBuffer.join('\n');
        executeCode(code, replInterpreter);
        multiLineBuffer = [];
        inMultiLineMode = false;
        rl.setPrompt('> ');
      }
      rl.prompt();
      return;
    }

    if (trimmed === '.cancel') {
      multiLineBuffer = [];
      inMultiLineMode = false;
      rl.setPrompt('> ');
      console.log('Cancelled');
      rl.prompt();
      return;
    }

    if (trimmed === '.history') {
      console.log('\nCommand history:');
      history.slice(-20).forEach((h, i) => {
        console.log(`  ${String(history.length - 20 + i + 1).padStart(3)}: ${h}`);
      });
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.vars')) {
      console.log('\nCurrent variables (use .help for available commands)');
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.funcs')) {
      console.log('\nBuilt-in functions:');
      const builtins = [
        'print', 'log', 'len', 'type', 'keys', 'values',
        'push', 'pop', 'shift', 'unshift',
        'map', 'filter', 'reduce', 'find', 'sort',
        'split', 'join', 'replace', 'trim', 'upper', 'lower',
        'parseInt', 'parseFloat', 'toString',
        'range', 'rangeRev', 'random', 'min', 'max', 'abs', 'round',
        'sin', 'cos', 'sqrt', 'pow', 'floor', 'ceil',
        'readFile', 'writeFile', 'exists',
        'time', 'timestamp', 'sleep',
        'regexMatch', 'regexTest', 'regexReplace',
        'date', 'template',
        'deepClone', 'deepMerge', 'isEmpty'
      ];
      builtins.forEach((f, i) => {
        process.stdout.write(`  ${f.padEnd(18)}`);
        if ((i + 1) % 4 === 0) console.log('');
      });
      console.log('');
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.load ')) {
      const file = trimmed.slice(6).trim();
      try {
        if (require('fs').existsSync(file)) {
          const source = require('fs').readFileSync(file, 'utf-8');
          executeCode(source, replInterpreter);
          console.log(`Loaded: ${file}`);
        } else {
          console.error(`File not found: ${file}`);
        }
      } catch (e: any) {
        console.error(`Load failed: ${e.message}`);
      }
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('.time')) {
      console.log('Timing mode: toggled');
      rl.prompt();
      return;
    }

    if (inMultiLineMode) {
      multiLineBuffer.push(input);
      rl.prompt();
      return;
    }

    if (trimmed && trimmed !== '') {
      if (trimmed !== history[history.length - 1]) {
        history.push(trimmed);
      }
      executeCode(trimmed, replInterpreter);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
  });

  function executeCode(code: string, interpreter: Interpreter): void {
    const start = Date.now();
    try {
      const program = parse(code);
      const result = interpreter.interpret(program);
      const output = interpreter.getOutput();
      output.forEach((line: string) => console.log(`  ${line}`));
      interpreter.clearOutput();

      if (result && result.length > 0) {
        const lastResult = result[result.length - 1];
        if (lastResult && lastResult.type !== 'null' && lastResult.type !== 'undefined') {
          const displayValue = formatValue(lastResult);
          console.log(`  ⇒ ${displayValue}`);
        }
      }

      const elapsed = Date.now() - start;
      if (elapsed > 10) {
        console.log(`  ⏱️ ${elapsed}ms`);
      }
    } catch (error: any) {
      console.error(`  Error: ${error.message}`);
      if (error.message.includes('Parse Error')) {
        const match = error.message.match(/at (\d+):?(\d+)?/);
        if (match) {
          const lines = code.split('\n');
          const lineNum = parseInt(match[1]) - 1;
          if (lines[lineNum]) {
            console.log(`     ${lines[lineNum]}`);
            console.log('     ' + '^'.repeat(Math.min(lines[lineNum].length, 30)));
          }
        }
      }
    }
  }

  function formatValue(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (value.type === 'string') return `"${value.value}"`;
    if (value.type === 'number') return String(value.value);
    if (value.type === 'boolean') return String(value.value);
    if (value.type === 'array') {
      const items = value.value.map((item: any) => formatValue(item));
      return `[${items.join(', ')}]`;
    }
    if (value.type === 'object') {
      if (value.properties) {
        const entries: string[] = [];
        value.properties.forEach((v: any, k: string) => {
          entries.push(`${k}: ${formatValue(v)}`);
        });
        return `{${entries.join(', ')}}`;
      }
      return '{}';
    }
    if (value.type === 'function') return '[Function]';
    return String(value);
  }
}
