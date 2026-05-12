import * as fs from 'fs';
import { parse, ParseError } from '../core/parser';
import { Interpreter } from '../core/interpreter';
import type { SeedValue } from '../core/interpreter';
import { WebRuntime } from '../runtime/web';
import { AgentRuntime } from '../runtime/agent';
import { GameRuntime } from '../runtime/game';
import { GraphicsRuntime } from '../runtime/graphics';
import { drainInterpretStatementResults } from './cli_async_drain';

export async function runFile(
  filePath: string,
  mode: 'general' | 'vm' | 'web' | 'agent' | 'game' | 'graphics' = 'general',
  options: any = {}
): Promise<void> {
  let interpreter: Interpreter | null = null;

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const source = fs.readFileSync(filePath, 'utf-8');

    if (options.tokens) {
      const { Lexer } = require('../core/lexer');
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();
      console.log('\n=== Lexer Tokens ===\n');
      tokens.forEach((token: any) => {
        console.log(`${token.line}:${token.column} [${token.type.padEnd(15)}] ${token.value}`);
      });
      return;
    }

    if (options.ast) {
      const program = parse(source);
      console.log('\n=== Abstract Syntax Tree (AST) ===\n');
      console.log(JSON.stringify(program, null, 2));
      return;
    }

    let result: any;

    switch (mode) {
      case 'vm':
        console.log(`\n[VM Mode] Running: ${filePath}\n`);
        const vmPath = require('path').join(__dirname, '..', '..', 'src', 'runtime', 'vm.js');
        const { SeedLangVM } = require(vmPath);
        const vm = new SeedLangVM({ executionGuard: false });
        vm.run(source);
        if (Array.isArray(vm.vm?.output)) vm.vm.output.forEach((line: string) => console.log(line));
        break;
      case 'web':
        console.log(`\n[Web Mode] Running: ${filePath}\n`);
        const webRuntime = new WebRuntime();
        result = webRuntime.runWeb(source);
        break;
      case 'agent':
        console.log(`\n[Agent Mode] Running: ${filePath}\n`);
        const agentRuntime = new AgentRuntime();
        result = agentRuntime.runAgent(source);
        break;
      case 'game':
        console.log(`\n[Game Mode] Running: ${filePath}\n`);
        const gameRuntime = new GameRuntime();
        result = gameRuntime.runGame(source);
        break;
      case 'graphics':
        console.log(`\n[Graphics Mode] Running: ${filePath}\n`);
        const graphicsRuntime = new GraphicsRuntime();
        result = graphicsRuntime.runGraphics(source);
        break;
      default:
        console.log(`\n[General Mode] Running: ${filePath}\n`);
        interpreter = new Interpreter({ mirrorPrintToConsole: false });
        const program = parse(source);
        result = interpreter.interpret(program) as SeedValue[];
        await drainInterpretStatementResults(result);

        if (options.output) {
          fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
          console.log(`\nResult saved to: ${options.output}`);
        }
        break;
    }

    if (!options.output && mode === 'general' && interpreter) {
      const output = interpreter.getOutput() || [];
      if (output.length > 0) {
        output.forEach((line: string) => console.log(line));
      }
    }
  } catch (error: any) {
    if (error instanceof ParseError) {
      const src = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
      console.error(error.getFormattedMessage(src));
    } else {
      console.error(`\nRuntime Error: ${error.message}`);
      if (options.debug && error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

export async function runEval(code: string, options: any = {}): Promise<void> {
  try {
    if (options.tokens) {
      const { Lexer } = require('../core/lexer');
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      console.log('\n=== Lexer Tokens ===\n');
      tokens.forEach((token: any) => {
        console.log(`${token.line}:${token.column} [${token.type.padEnd(15)}] ${token.value}`);
      });
      return;
    }

    if (options.ast) {
      const program = parse(code);
      console.log('\n=== Abstract Syntax Tree (AST) ===\n');
      console.log(JSON.stringify(program, null, 2));
      return;
    }

    const evalInterpreter = new Interpreter({ mirrorPrintToConsole: false });
    const program = parse(code);
    const results = evalInterpreter.interpret(program) as SeedValue[];
    await drainInterpretStatementResults(results);

    const output = evalInterpreter.getOutput();
    if (output.length > 0) {
      output.forEach((line: string) => console.log(line));
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

export function watchFile(
  filePath: string,
  mode: 'general' | 'vm' | 'web' | 'agent' | 'game' | 'graphics' = 'general',
  options: any = {}
): void {
  void options;
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\nWatching file: ${filePath}`);
  console.log('Press Ctrl+C to stop\n');

  let runCount = 0;

  const execute = () => {
    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      const execStart = Date.now();

      if (mode === 'general') {
        const interpreter = new Interpreter();
        const program = parse(source);
        interpreter.interpret(program);
      }

      const execTime = Date.now() - execStart;
      runCount++;
      console.log(`[${new Date().toLocaleTimeString()}] Done (${execTime}ms) - run #${runCount}`);
    } catch (error: any) {
      console.log(`[${new Date().toLocaleTimeString()}] Error: ${error.message}`);
    }
  };

  execute();
  fs.watchFile(filePath, { interval: 500 }, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      execute();
    }
  });
}
