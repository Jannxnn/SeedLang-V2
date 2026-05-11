import { Lexer } from './lexer';
import { Parser } from './parser';
import { Interpreter } from './interpreter';

export interface Breakpoint {
  id: number;
  file: string;
  line: number;
  condition?: string;
  hitCount: number;
  enabled: boolean;
}

export interface WatchExpression {
  id: number;
  expression: string;
  value: string;
}

export interface CallFrame {
  name: string;
  line: number;
  column: number;
  locals: Map<string, any>;
}

export interface DebugEvent {
  type: 'breakpoint' | 'step' | 'exception' | 'terminated';
  breakpoint?: Breakpoint;
  exception?: Error;
  line?: number;
}

export type DebugEventHandler = (event: DebugEvent) => void;

export enum DebugState {
  Running = 'running',
  Paused = 'paused',
  Stepping = 'stepping',
  Terminated = 'terminated'
}

export class Debugger {
  private interpreter: Interpreter;
  private breakpoints: Map<number, Breakpoint> = new Map();
  private nextBreakpointId: number = 1;
  private watches: Map<number, WatchExpression> = new Map();
  private nextWatchId: number = 1;
  private state: DebugState = DebugState.Terminated;
  private currentLine: number = 0;
  private currentFile: string = '';
  private callStack: CallFrame[] = [];
  private eventHandler?: DebugEventHandler;
  private stepMode: 'none' | 'over' | 'into' | 'out' = 'none';
  private stepDepth: number = 0;
  private source: string = '';
  private lines: string[] = [];
  private pauseOnEntry: boolean = false;
  private pauseOnExceptions: boolean = true;

  constructor() {
    this.interpreter = new Interpreter();
  }

  onEvent(handler: DebugEventHandler): void {
    this.eventHandler = handler;
  }

  load(source: string, file: string = '<stdin>'): void {
    this.source = source;
    this.lines = source.split('\n');
    this.currentFile = file;
    this.state = DebugState.Terminated;
    this.currentLine = 0;
    this.callStack = [];
  }

  start(pauseOnEntry: boolean = false): void {
    this.pauseOnEntry = pauseOnEntry;
    this.state = DebugState.Running;
    this.stepMode = 'none';
    this.stepDepth = 0;
    
    if (pauseOnEntry) {
      this.state = DebugState.Paused;
      this.currentLine = 1;
      this.emitEvent({ type: 'step', line: 1 });
    }
  }

  continue(): void {
    if (this.state !== DebugState.Paused) {
      throw new Error('Debugger is not paused');
    }
    this.state = DebugState.Running;
    this.stepMode = 'none';
    this.runUntilPause();
  }

  stepOver(): void {
    if (this.state !== DebugState.Paused) {
      throw new Error('Debugger is not paused');
    }
    this.state = DebugState.Stepping;
    this.stepMode = 'over';
    this.stepDepth = this.callStack.length;
    this.runUntilPause();
  }

  stepInto(): void {
    if (this.state !== DebugState.Paused) {
      throw new Error('Debugger is not paused');
    }
    this.state = DebugState.Stepping;
    this.stepMode = 'into';
    this.runUntilPause();
  }

  stepOut(): void {
    if (this.state !== DebugState.Paused) {
      throw new Error('Debugger is not paused');
    }
    this.state = DebugState.Stepping;
    this.stepMode = 'out';
    this.stepDepth = this.callStack.length - 1;
    this.runUntilPause();
  }

  private runUntilPause(): void {
    const isStepping = this.stepMode !== 'none';
    const targetDepth = this.stepDepth;

    const lexer = new Lexer(this.source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    try {
      this.interpreter.interpret(ast);
      if (isStepping && this.callStack.length <= targetDepth) {
        this.state = DebugState.Paused;
        this.emitEvent({ type: 'step', line: this.currentLine });
        return;
      }
      this.state = DebugState.Terminated;
      this.emitEvent({ type: 'terminated' });
    } catch (e) {
      if (e instanceof DebugPauseException) {
        return;
      }
      if (this.pauseOnExceptions) {
        this.state = DebugState.Paused;
        this.emitEvent({ type: 'exception', exception: e as Error });
      } else {
        throw e;
      }
    }
  }

  stop(): void {
    this.state = DebugState.Terminated;
    this.emitEvent({ type: 'terminated' });
  }

  restart(): void {
    this.stop();
    this.interpreter = new Interpreter();
    this.start(this.pauseOnEntry);
  }

  addBreakpoint(line: number, condition?: string): Breakpoint {
    const id = this.nextBreakpointId++;
    const bp: Breakpoint = {
      id,
      file: this.currentFile,
      line,
      condition,
      hitCount: 0,
      enabled: true
    };
    this.breakpoints.set(id, bp);
    return bp;
  }

  removeBreakpoint(id: number): boolean {
    return this.breakpoints.delete(id);
  }

  toggleBreakpoint(id: number): boolean {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = !bp.enabled;
      return true;
    }
    return false;
  }

  enableBreakpoint(id: number): boolean {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = true;
      return true;
    }
    return false;
  }

  disableBreakpoint(id: number): boolean {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = false;
      return true;
    }
    return false;
  }

  getBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  getBreakpointAtLine(line: number): Breakpoint | undefined {
    for (const bp of this.breakpoints.values()) {
      if (bp.line === line && bp.enabled) {
        return bp;
      }
    }
    return undefined;
  }

  clearAllBreakpoints(): void {
    this.breakpoints.clear();
  }

  addWatch(expression: string): WatchExpression {
    const id = this.nextWatchId++;
    const watch: WatchExpression = {
      id,
      expression,
      value: this.evaluateWatch(expression)
    };
    this.watches.set(id, watch);
    return watch;
  }

  removeWatch(id: number): boolean {
    return this.watches.delete(id);
  }

  getWatches(): WatchExpression[] {
    return Array.from(this.watches.values());
  }

  updateWatches(): void {
    for (const watch of this.watches.values()) {
      watch.value = this.evaluateWatch(watch.expression);
    }
  }

  private evaluateWatch(expression: string): string {
    try {
      const lexer = new Lexer(expression);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();
      const results = this.interpreter.interpret(ast);
      if (results.length > 0) {
        return this.stringifyValue(results[results.length - 1]);
      }
      return 'undefined';
    } catch (e) {
      return `Error: ${(e as Error).message}`;
    }
  }

  private stringifyValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value.type === 'array') {
      return `[${value.value.map((v: any) => this.stringifyValue(v)).join(' ')}]`;
    }
    if (value.type === 'object') {
      const entries: string[] = [];
      value.value.forEach((v: any, k: string) => {
        entries.push(`${k}: ${this.stringifyValue(v)}`);
      });
      return `{${entries.join(' ')}}`;
    }
    if (value.type === 'function') {
      return '<function>';
    }
    return String(value);
  }

  getCallStack(): CallFrame[] {
    return [...this.callStack];
  }

  getCurrentLine(): number {
    return this.currentLine;
  }

  getCurrentFile(): string {
    return this.currentFile;
  }

  getState(): DebugState {
    return this.state;
  }

  getSourceLine(line: number): string {
    if (line > 0 && line <= this.lines.length) {
      return this.lines[line - 1];
    }
    return '';
  }

  getSourceLines(startLine: number, count: number): string[] {
    const result: string[] = [];
    for (let i = startLine; i < startLine + count && i <= this.lines.length; i++) {
      result.push(this.lines[i - 1]);
    }
    return result;
  }

  getVariables(): Map<string, any> {
    return this.interpreter.getGlobals();
  }

  private emitEvent(event: DebugEvent): void {
    if (this.eventHandler) {
      this.eventHandler(event);
    }
  }

  printStatus(): void {
    console.log(`\n[DEBUGGER] Status:`);
    console.log(`   State: ${this.state}`);
    console.log(`   File: ${this.currentFile}`);
    console.log(`   Line: ${this.currentLine}`);
    console.log(`   Breakpoints: ${this.breakpoints.size}`);
    console.log(`   Watches: ${this.watches.size}`);
  }

  printSource(contextLines: number = 3): void {
    const start = Math.max(1, this.currentLine - contextLines);
    const end = Math.min(this.lines.length, this.currentLine + contextLines);
    
    console.log(`\n[SOURCE] (${this.currentFile}):`);
    for (let i = start; i <= end; i++) {
      const marker = i === this.currentLine ? '→' : ' ';
      const bp = this.getBreakpointAtLine(i);
      const bpMarker = bp ? '●' : ' ';
      const lineNum = String(i).padStart(4, ' ');
      console.log(`${marker}${bpMarker} ${lineNum} | ${this.lines[i - 1]}`);
    }
  }

  printBreakpoints(): void {
    console.log(`\n[BREAKPOINTS]:`);
    if (this.breakpoints.size === 0) {
      console.log('   No breakpoints set');
      return;
    }
    for (const bp of this.breakpoints.values()) {
      const status = bp.enabled ? '✓' : '✗';
      const cond = bp.condition ? ` [${bp.condition}]` : '';
      console.log(`   ${status} #${bp.id}: Line ${bp.line}${cond} (hits: ${bp.hitCount})`);
    }
  }

  printWatches(): void {
    console.log(`\n[WATCHES]:`);
    if (this.watches.size === 0) {
      console.log('   No watches set');
      return;
    }
    for (const watch of this.watches.values()) {
      console.log(`   #${watch.id}: ${watch.expression} = ${watch.value}`);
    }
  }

  printCallStack(): void {
    console.log(`\n[CALLSTACK]:`);
    if (this.callStack.length === 0) {
      console.log('   Empty call stack');
      return;
    }
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const frame = this.callStack[i];
      const marker = i === this.callStack.length - 1 ? '→' : ' ';
      console.log(`${marker} ${frame.name} at line ${frame.line}`);
    }
  }

  printVariables(): void {
    console.log(`\n[VARIABLES]:`);
    const vars = this.getVariables();
    if (vars.size === 0) {
      console.log('   No variables');
      return;
    }
    for (const [name, value] of vars) {
      console.log(`   ${name} = ${this.stringifyValue(value)}`);
    }
  }

  printHelp(): void {
    console.log(`
[DEBUGGER] Commands:
   help, h          - Show this help
   run, r           - Start/restart execution
   continue, c      - Continue execution
   step, s          - Step over (execute next line)
   stepin, si       - Step into function
   stepout, so      - Step out of function
   stop             - Stop execution
   
   break <line> [cond] - Set breakpoint at line (optional condition)
   delete <id>      - Delete breakpoint by ID
   toggle <id>      - Toggle breakpoint on/off
   breakpoints, bp  - List all breakpoints
   
   watch <expr>     - Add watch expression
   unwatch <id>     - Remove watch by ID
   watches, w       - List all watches
   
   list [n]         - Show source around current line (n lines)
   vars             - Show variables
   stack            - Show call stack
   status           - Show debugger status
   
   quit, q          - Exit debugger
`);
  }
}

class DebugPauseException extends Error {
  constructor(message: string = 'Execution paused') {
    super(message);
    this.name = 'DebugPauseException';
  }
}

export function createDebugREPL(): void {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const debugger_ = new Debugger();

  console.log('SeedLang Debugger v1.0');
  console.log('Type "help" for available commands\n');

  const prompt = () => {
    rl.question('(debug) ', (cmd: string) => {
      const parts = cmd.trim().split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      try {
        switch (command) {
          case 'help':
          case 'h':
            debugger_.printHelp();
            break;

          case 'load':
            if (args.length > 0) {
              const fs = require('fs');
              const path = args[0];
              const source = fs.readFileSync(path, 'utf-8');
              debugger_.load(source, path);
              console.log(`Loaded: ${path}`);
            } else {
              console.log('Usage: load <file>');
            }
            break;

          case 'run':
          case 'r':
            debugger_.start(true);
            debugger_.printSource();
            break;

          case 'continue':
          case 'c':
            debugger_.continue();
            break;

          case 'step':
          case 's':
            debugger_.stepOver();
            debugger_.printSource();
            break;

          case 'stepin':
          case 'si':
            debugger_.stepInto();
            debugger_.printSource();
            break;

          case 'stepout':
          case 'so':
            debugger_.stepOut();
            debugger_.printSource();
            break;

          case 'stop':
            debugger_.stop();
            break;

          case 'break':
            if (args.length > 0) {
              const line = parseInt(args[0]);
              const condition = args.slice(1).join(' ');
              const bp = debugger_.addBreakpoint(line, condition || undefined);
              console.log(`Breakpoint #${bp.id} set at line ${line}`);
            } else {
              console.log('Usage: break <line> [condition]');
            }
            break;

          case 'delete':
            if (args.length > 0) {
              const id = parseInt(args[0]);
              if (debugger_.removeBreakpoint(id)) {
                console.log(`Breakpoint #${id} deleted`);
              } else {
                console.log(`Breakpoint #${id} not found`);
              }
            } else {
              console.log('Usage: delete <id>');
            }
            break;

          case 'toggle':
            if (args.length > 0) {
              const id = parseInt(args[0]);
              debugger_.toggleBreakpoint(id);
              console.log(`Breakpoint #${id} toggled`);
            } else {
              console.log('Usage: toggle <id>');
            }
            break;

          case 'breakpoints':
          case 'bp':
            debugger_.printBreakpoints();
            break;

          case 'watch':
            if (args.length > 0) {
              const expr = args.join(' ');
              const watch = debugger_.addWatch(expr);
              console.log(`Watch #${watch.id}: ${expr}`);
            } else {
              console.log('Usage: watch <expression>');
            }
            break;

          case 'unwatch':
            if (args.length > 0) {
              const id = parseInt(args[0]);
              if (debugger_.removeWatch(id)) {
                console.log(`Watch #${id} removed`);
              } else {
                console.log(`Watch #${id} not found`);
              }
            } else {
              console.log('Usage: unwatch <id>');
            }
            break;

          case 'watches':
          case 'w':
            debugger_.printWatches();
            break;

          case 'list':
            const lines = args.length > 0 ? parseInt(args[0]) : 5;
            debugger_.printSource(lines);
            break;

          case 'vars':
            debugger_.printVariables();
            break;

          case 'stack':
            debugger_.printCallStack();
            break;

          case 'status':
            debugger_.printStatus();
            break;

          case 'quit':
          case 'q':
          case 'exit':
            console.log('Goodbye!');
            rl.close();
            return;

          case '':
            break;

          default:
            console.log(`Unknown command: ${command}. Type "help" for available commands.`);
        }
      } catch (e) {
        console.log(`Error: ${(e as Error).message}`);
      }

      prompt();
    });
  };

  debugger_.onEvent((event) => {
    switch (event.type) {
      case 'breakpoint':
        console.log(`\n[BREAKPOINT] hit at line ${event.line}`);
        debugger_.updateWatches();
        debugger_.printSource();
        break;
      case 'step':
        console.log(`\n→ Step at line ${event.line}`);
        debugger_.updateWatches();
        break;
      case 'exception':
        console.log(`\n[X] Exception: ${event.exception?.message}`);
        break;
      case 'terminated':
        console.log('\n[OK] Execution completed');
        break;
    }
  });

  prompt();
}
