import { ProgramNode, StatementNode, ExpressionNode, DeclarationStatement, QuestionStatement, ActionStatement, NounReference, TextLiteral, NumberLiteral, BinaryExpression, CallExpression, GenericCallExpression, SuperCallExpression, BlockStatement, FunctionDef, ReturnStatement, IfStatement, WhileStatement, ForStatement, ForInStatement, ImportStatement, ExportStatement, ClassDef, ObjectLiteral, ArrayLiteral, MemberExpression, AssignmentExpression, LogicalExpression, ConditionalExpression, UnaryExpression, Identifier, TryStatement, ThrowStatement, AsyncFunctionDef, CoroutineDef, YieldStatement, YieldExpression, MacroCall, AwaitExpression, SwitchStatement, InterfaceDef, TypeAlias } from './ast';
import { expandMacrosInProgram } from './macro_expand';
import { YieldSignal } from './coroutine';
import {
  InterpreterJit,
  INTERP_JIT_MISS,
  InterpreterJitRuntimeError,
  expressionEligibleForInterpJit,
  scanStatementsForInterpJitCandidates,
  type InterpreterJitBindings
} from './interpreter_jit';

export interface SeedValue {
  type: 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object' | 'function' | 'class' | 'instance' | 'undefined' | 'promise' | 'genericFunction' | 'genericClass' | 'coroutine' | 'map' | 'set';
  value: any;
  properties?: Map<string, SeedValue>;
  frozen?: boolean;
  sealed?: boolean;
  params?: string[];
  closure?: Environment;
  _then?: (resolve: (value: any) => void, reject?: (error: any) => void) => void;
  name?: string;
  genericParams?: string[];
  definition?: any;
  instantiate?: (typeArgs: Map<string, SeedValue>) => SeedValue;
  typeArgs?: Record<string, SeedValue>;
  generator?: Generator<SeedValue, SeedValue, SeedValue>;
  state?: string;
  done?: boolean;
  className?: string;
  superClass?: string;
}

export class Environment {
  private variables: Map<string, SeedValue> = new Map();
  private parent?: Environment;

  constructor(parent?: Environment) {
    this.parent = parent;
  }

  define(name: string, value: SeedValue): void {
    this.variables.set(name, value);
  }

  get(name: string): SeedValue {
    if (this.variables.has(name)) {
      return this.variables.get(name)!;
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    throw new RuntimeError(`Undefined variable: ${name}`);
  }

  assign(name: string, value: SeedValue): void {
    if (this.variables.has(name)) {
      this.variables.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value);
      return;
    }
    throw new RuntimeError(`Undefined variable: ${name}`);
  }

  has(name: string): boolean {
    if (this.variables.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }

  getAll(): Map<string, SeedValue> {
    return this.variables;
  }

  getParent(): Environment | undefined {
    return this.parent;
  }
}

export class ReturnSignal {
  constructor(public value: SeedValue) {}
}

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

export class BreakException extends Error {
  constructor() {
    super('break');
    this.name = 'BreakException';
  }
}

export class ContinueException extends Error {
  constructor() {
    super('continue');
    this.name = 'ContinueException';
  }
}

export class Interpreter {
  protected globals: Environment;
  protected environment: Environment;
  private nounStore: Map<number, SeedValue> = new Map();
  private output: string[] = [];
  private functions: Map<string, SeedValue> = new Map();
  private classes: Map<string, ClassDef | InterfaceDef> = new Map();
  private macroDefs: Map<string, { params: string[]; body: StatementNode[]; procedural: boolean }> = new Map();
  private fibers: Map<number, { fn: SeedValue; result?: SeedValue }> = new Map();
  private fiberIdCounter: number = 0;
  private interpJit: InterpreterJit | null = process.env.SEED_INTERP_JIT !== '0' ? new InterpreterJit() : null;
  private jitBindingsCache: InterpreterJitBindings | null = null;
  /** Program-wide: no AST expr node can tier → skip tryExpr/assignment tier hooks for this interpret run. */
  private skipInterpJitTier = false;
  /** When true (default), `print` mirrors lines to `console.log` as well as `getOutput()`. */
  private mirrorPrintToConsole = true;

  constructor(opts?: { mirrorPrintToConsole?: boolean }) {
    if (opts && opts.mirrorPrintToConsole === false) {
      this.mirrorPrintToConsole = false;
    }
    this.globals = new Environment();
    this.environment = this.globals;
    this.setupBuiltins();
  }

  private setupBuiltins(): void {
    this.globals.define('print', {
      type: 'function',
      value: (...args: SeedValue[]) => {
        const output = args.map(arg => this.stringify(arg)).join(' ');
        this.output.push(output);
        if (this.mirrorPrintToConsole) {
          console.log(output);
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('len', {
      type: 'function',
      value: (arr: SeedValue) => {
        if (arr.type === 'array') {
          return { type: 'number', value: arr.value.length };
        }
        if (arr.type === 'string') {
          return { type: 'number', value: arr.value.length };
        }
        throw new RuntimeError('len() requires array or string');
      }
    });

    this.globals.define('push', {
      type: 'function',
      value: (arr: SeedValue, item: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('push() requires array');
        arr.value.push(item);
        return arr;
      }
    });

    this.globals.define('type', {
      type: 'function',
      value: (val: SeedValue) => {
        if (val.type === 'map') return { type: 'string', value: 'map' };
        if (val.type === 'set') return { type: 'string', value: 'set' };
        return { type: 'string', value: val.type };
      }
    });

    this.globals.define('str', {
      type: 'function',
      value: (val: SeedValue) => {
        return { type: 'string', value: this.stringify(val) };
      }
    });

    this.globals.define('num', {
      type: 'function',
      value: (val: SeedValue) => {
        if (val.type === 'number') return val;
        if (val.type === 'string') {
          const num = parseFloat(val.value);
          if (isNaN(num)) throw new RuntimeError(`Cannot convert "${val.value}" to number`);
          return { type: 'number', value: num };
        }
        throw new RuntimeError('num() requires string or number');
      }
    });

    this.globals.define('input', {
      type: 'function',
      value: async (prompt?: SeedValue) => {
        if (prompt) process.stdout.write(this.stringify(prompt));
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        return new Promise<SeedValue>((resolve) => {
          readline.question('', (answer: string) => {
            readline.close();
            resolve({ type: 'string', value: answer });
          });
        });
      }
    });

    this.globals.define('range', {
      type: 'function',
      value: (start: SeedValue, end?: SeedValue, step?: SeedValue) => {
        let startNum: number;
        let endNum: number;
        let stepNum: number = 1;

        if (end === undefined) {
          startNum = 0;
          endNum = start.value as number;
        } else {
          startNum = start.value as number;
          endNum = end.value as number;
          if (step) stepNum = step.value as number;
        }

        if (stepNum === 0) throw new RuntimeError('range() step cannot be zero');

        const result: SeedValue[] = [];
        for (let i = startNum; stepNum > 0 ? i < endNum : i > endNum; i += stepNum) {
          result.push({ type: 'number', value: i });
        }
        return { type: 'array', value: result };
      }
    });

    this.globals.define('rangeRev', {
      type: 'function',
      value: (a: SeedValue, b?: SeedValue) => {
        if (a.type !== 'number') throw new RuntimeError('rangeRev() expects numeric arguments');
        if (b === undefined) {
          const n = a.value as number;
          const result: SeedValue[] = [];
          for (let i = n - 1; i >= 0; i--) result.push({ type: 'number', value: i });
          return { type: 'array', value: result };
        }
        if (b.type !== 'number') throw new RuntimeError('rangeRev() expects numeric arguments');
        const hi = a.value as number;
        const lo = b.value as number;
        const result: SeedValue[] = [];
        for (let i = hi - 1; i >= lo; i--) result.push({ type: 'number', value: i });
        return { type: 'array', value: result };
      }
    });

    this.globals.define('map', {
      type: 'function',
      value: (...args: SeedValue[]) => {
        if (args.length === 0 || (args.length === 1 && args[0]?.type !== 'array')) {
          const data = new Map<string, SeedValue>();
          if (args.length === 1 && args[0]?.type === 'array') {
            for (const entry of args[0].value) {
              if (entry.type === 'array' && entry.value.length >= 2) {
                const k = entry.value[0];
                data.set(k.type === 'string' ? k.value : String(k.value), entry.value[1]);
              }
            }
          }
          return { type: 'map', value: data };
        }
        const arr = args[0];
        const fn = args[1];
        if (arr.type !== 'array') throw new RuntimeError('map() requires array');
        if (fn.type !== 'function') throw new RuntimeError('map() requires function');
        return { type: 'array', value: arr.value.map((item: SeedValue) => fn.value(item)) };
      }
    });

    const makeMapBuiltin = (name: string, fn: (...args: any[]) => any) => {
      this.globals.define(name, { type: 'function', value: fn });
    };

    makeMapBuiltin('mapSet', (m: SeedValue, key: SeedValue, val: SeedValue) => {
      if (m.type !== 'map') throw new RuntimeError('mapSet() expects a map');
      const k = key.type === 'string' ? key.value : String(key.value);
      m.value.set(k, val);
      return m;
    });
    makeMapBuiltin('mapGet', (m: SeedValue, key: SeedValue) => {
      if (m.type !== 'map') throw new RuntimeError('mapGet() expects a map');
      const k = key.type === 'string' ? key.value : String(key.value);
      const v = m.value.get(k);
      return v !== undefined ? v : { type: 'null', value: null };
    });
    makeMapBuiltin('mapHas', (m: SeedValue, key: SeedValue) => {
      if (m.type !== 'map') throw new RuntimeError('mapHas() expects a map');
      const k = key.type === 'string' ? key.value : String(key.value);
      return { type: 'boolean', value: m.value.has(k) };
    });
    makeMapBuiltin('mapDelete', (m: SeedValue, key: SeedValue) => {
      if (m.type !== 'map') throw new RuntimeError('mapDelete() expects a map');
      const k = key.type === 'string' ? key.value : String(key.value);
      return { type: 'boolean', value: m.value.delete(k) };
    });
    makeMapBuiltin('mapKeys', (m: SeedValue) => {
      if (m.type !== 'map') throw new RuntimeError('mapKeys() expects a map');
      return { type: 'array', value: Array.from(m.value.keys()).map(k => ({ type: 'string', value: k })) };
    });
    makeMapBuiltin('mapValues', (m: SeedValue) => {
      if (m.type !== 'map') throw new RuntimeError('mapValues() expects a map');
      return { type: 'array', value: Array.from(m.value.values()) };
    });
    makeMapBuiltin('mapEntries', (m: SeedValue) => {
      if (m.type !== 'map') throw new RuntimeError('mapEntries() expects a map');
      const entries: SeedValue[] = [];
      m.value.forEach((v: SeedValue, k: string) => {
        entries.push({ type: 'array', value: [{ type: 'string', value: k }, v] });
      });
      return { type: 'array', value: entries };
    });
    makeMapBuiltin('mapSize', (m: SeedValue) => {
      if (m.type !== 'map') throw new RuntimeError('mapSize() expects a map');
      return { type: 'number', value: m.value.size };
    });
    makeMapBuiltin('mapClear', (m: SeedValue) => {
      if (m.type !== 'map') throw new RuntimeError('mapClear() expects a map');
      m.value.clear();
      return m;
    });

    makeMapBuiltin('set', (...args: SeedValue[]) => {
      const data = new Set<any>();
      if (args.length > 0 && args[0]?.type === 'array') {
        for (const item of args[0].value) data.add(item);
      }
      return { type: 'set', value: data };
    });
    makeMapBuiltin('setAdd', (s: SeedValue, val: SeedValue) => {
      if (s.type !== 'set') throw new RuntimeError('setAdd() expects a set');
      for (const item of s.value) {
        if (item.type === val.type) {
          if (val.type === 'number' && item.value === val.value) return s;
          if (val.type === 'string' && item.value === val.value) return s;
          if (val.type === 'boolean' && item.value === val.value) return s;
        }
      }
      s.value.add(val);
      return s;
    });
    makeMapBuiltin('setHas', (s: SeedValue, val: SeedValue) => {
      if (s.type !== 'set') throw new RuntimeError('setHas() expects a set');
      for (const item of s.value) {
        if (item.type === val.type) {
          if (val.type === 'number' && item.value === val.value) return { type: 'boolean', value: true };
          if (val.type === 'string' && item.value === val.value) return { type: 'boolean', value: true };
          if (val.type === 'boolean' && item.value === val.value) return { type: 'boolean', value: true };
        }
      }
      return { type: 'boolean', value: false };
    });
    makeMapBuiltin('setDelete', (s: SeedValue, val: SeedValue) => {
      if (s.type !== 'set') throw new RuntimeError('setDelete() expects a set');
      for (const item of s.value) {
        if (item.type === val.type) {
          if (val.type === 'number' && item.value === val.value) { s.value.delete(item); return { type: 'boolean', value: true }; }
          if (val.type === 'string' && item.value === val.value) { s.value.delete(item); return { type: 'boolean', value: true }; }
          if (val.type === 'boolean' && item.value === val.value) { s.value.delete(item); return { type: 'boolean', value: true }; }
        }
      }
      return { type: 'boolean', value: false };
    });
    makeMapBuiltin('setSize', (s: SeedValue) => {
      if (s.type !== 'set') throw new RuntimeError('setSize() expects a set');
      return { type: 'number', value: s.value.size };
    });
    makeMapBuiltin('setToArray', (s: SeedValue) => {
      if (s.type !== 'set') throw new RuntimeError('setToArray() expects a set');
      return { type: 'array', value: Array.from(s.value) };
    });
    makeMapBuiltin('setClear', (s: SeedValue) => {
      if (s.type !== 'set') throw new RuntimeError('setClear() expects a set');
      s.value.clear();
      return s;
    });

    this.globals.define('filter', {
      type: 'function',
      value: (arr: SeedValue, fn: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('filter() requires array');
        if (fn.type !== 'function') throw new RuntimeError('filter() requires function');
        return { type: 'array', value: arr.value.filter((item: SeedValue) => fn.value(item).value) };
      }
    });

    this.globals.define('reduce', {
      type: 'function',
      value: (arr: SeedValue, init: SeedValue, fn?: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('reduce() requires array');
        const initIsFn = init?.type === 'function';
        const fnIsFn = fn?.type === 'function';
        if (initIsFn && !fnIsFn) throw new RuntimeError('reduce() expects argument order: reduce(arr init fn)');
        if (!fnIsFn) throw new RuntimeError('reduce() requires function as third argument');
        let acc = init ?? arr.value[0];
        const startIndex = init !== undefined ? 0 : 1;
        for (let i = startIndex; i < arr.value.length; i++) {
          acc = fn!.value(acc, arr.value[i]);
        }
        return acc;
      }
    });

    this.globals.define('keys', {
      type: 'function',
      value: (obj: SeedValue) => {
        if (obj.type !== 'object' || !obj.properties) throw new RuntimeError('keys() requires object');
        return { type: 'array', value: Array.from(obj.properties.keys()).map(k => ({ type: 'string', value: k })) };
      }
    });

    this.globals.define('values', {
      type: 'function',
      value: (obj: SeedValue) => {
        if (obj.type !== 'object' || !obj.properties) throw new RuntimeError('values() requires object');
        return { type: 'array', value: Array.from(obj.properties.values()) };
      }
    });

    this.globals.define('has', {
      type: 'function',
      value: (obj: SeedValue, key: SeedValue) => {
        if (obj.type !== 'object' || !obj.properties) throw new RuntimeError('has() requires object');
        return { type: 'boolean', value: obj.properties.has(key.value as string) };
      }
    });

    this.globals.define('get', {
      type: 'function',
      value: (obj: SeedValue, key: SeedValue, defaultValue?: SeedValue) => {
        if (obj.type !== 'object' || !obj.properties) throw new RuntimeError('get() requires object');
        if (obj.properties.has(key.value as string)) {
          return obj.properties.get(key.value as string)!;
        }
        return defaultValue || { type: 'null', value: null };
      }
    });

    this.globals.define('setProp', {
      type: 'function',
      value: (obj: SeedValue, key: SeedValue, value: SeedValue) => {
        if (obj.type !== 'object' || !obj.properties) throw new RuntimeError('setProp() requires object');
        obj.properties!.set(key.value as string, value);
        return obj;
      }
    });

    this.globals.define('merge', {
      type: 'function',
      value: (obj1: SeedValue, obj2: SeedValue) => {
        if (obj1.type !== 'object' || !obj1.properties) throw new RuntimeError('merge() requires objects');
        if (obj2.type !== 'object' || !obj2.properties) throw new RuntimeError('merge() requires objects');
        const merged = new Map(obj1.properties);
        obj2.properties.forEach((v, k) => merged.set(k, v));
        return { type: 'object', value: null, properties: merged };
      }
    });

    this.globals.define('copy', {
      type: 'function',
      value: (obj: SeedValue) => {
        if (obj.type === 'array') {
          return { type: 'array', value: [...obj.value] };
        }
        if (obj.type === 'object' && obj.properties) {
          return { type: 'object', value: null, properties: new Map(obj.properties) };
        }
        return obj;
      }
    });

    this.globals.define('reverse', {
      type: 'function',
      value: (arr: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('reverse() requires array');
        return { type: 'array', value: [...arr.value].reverse() };
      }
    });

    this.globals.define('sort', {
      type: 'function',
      value: (arr: SeedValue, compareFn?: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('sort() requires array');
        const sorted = [...arr.value];
        if (compareFn && compareFn.type === 'function') {
          sorted.sort((a: SeedValue, b: SeedValue) => {
            const result = compareFn.value(a, b);
            return result.value as number;
          });
        } else {
          sorted.sort((a: SeedValue, b: SeedValue) => {
            if (a.type === 'number' && b.type === 'number') return a.value - b.value;
            if (a.type === 'string' && b.type === 'string') return a.value.localeCompare(b.value);
            return 0;
          });
        }
        return { type: 'array', value: sorted };
      }
    });

    this.globals.define('join', {
      type: 'function',
      value: (arr: SeedValue, separator?: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('join() requires array');
        const sep = separator ? separator.value as string : ', ';
        return { type: 'string', value: arr.value.map((v: SeedValue) => this.stringify(v)).join(sep) };
      }
    });

    this.globals.define('split', {
      type: 'function',
      value: (str: SeedValue, separator?: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('split() requires string');
        const sep = separator ? separator.value as string : ' ';
        return { type: 'array', value: str.value.split(sep).map((s: string) => ({ type: 'string', value: s })) };
      }
    });

    this.globals.define('trim', {
      type: 'function',
      value: (str: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('trim() requires string');
        return { type: 'string', value: str.value.trim() };
      }
    });

    this.globals.define('upper', {
      type: 'function',
      value: (str: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('upper() requires string');
        return { type: 'string', value: str.value.toUpperCase() };
      }
    });

    this.globals.define('lower', {
      type: 'function',
      value: (str: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('lower() requires string');
        return { type: 'string', value: str.value.toLowerCase() };
      }
    });

    this.globals.define('contains', {
      type: 'function',
      value: (container: SeedValue, item: SeedValue) => {
        if (container.type === 'string') {
          return { type: 'boolean', value: container.value.includes(this.stringify(item)) };
        }
        if (container.type === 'array') {
          return { type: 'boolean', value: container.value.some((v: SeedValue) => this.isEqual(v, item)) };
        }
        if (container.type === 'object' && container.properties) {
          return { type: 'boolean', value: container.properties.has(this.stringify(item)) };
        }
        return { type: 'boolean', value: false };
      }
    });

    this.globals.define('indexOf', {
      type: 'function',
      value: (container: SeedValue, item: SeedValue) => {
        if (container.type === 'string') {
          return { type: 'number', value: container.value.indexOf(this.stringify(item)) };
        }
        if (container.type === 'array') {
          const index = container.value.findIndex((v: SeedValue) => this.isEqual(v, item));
          return { type: 'number', value: index };
        }
        return { type: 'number', value: -1 };
      }
    });

    this.globals.define('slice', {
      type: 'function',
      value: (container: SeedValue, start: SeedValue, end?: SeedValue) => {
        if (container.type === 'string') {
          return { type: 'string', value: container.value.slice(start.value as number, end?.value as number) };
        }
        if (container.type === 'array') {
          return { type: 'array', value: container.value.slice(start.value as number, end?.value as number) };
        }
        throw new RuntimeError('slice() requires string or array');
      }
    });

    this.globals.define('concat', {
      type: 'function',
      value: (...args: SeedValue[]) => {
        if (args.every(a => a.type === 'string')) {
          return { type: 'string', value: args.map(a => a.value).join('') };
        }
        if (args.every(a => a.type === 'array')) {
          return { type: 'array', value: args.flatMap(a => a.value) };
        }
        throw new RuntimeError('concat() requires all strings or all arrays');
      }
    });

    this.globals.define('min', {
      type: 'function',
      value: (...args: SeedValue[]) => {
        if (args.length === 1 && args[0].type === 'array') {
          const arr = args[0].value as SeedValue[];
          return arr.reduce((min: SeedValue, curr: SeedValue) =>
            min.value < curr.value ? min : curr
          );
        }
        return args.reduce((min: SeedValue, curr: SeedValue) =>
          min.value < curr.value ? min : curr
        );
      }
    });

    this.globals.define('max', {
      type: 'function',
      value: (...args: SeedValue[]) => {
        if (args.length === 1 && args[0].type === 'array') {
          const arr = args[0].value as SeedValue[];
          return arr.reduce((max: SeedValue, curr: SeedValue) =>
            max.value > curr.value ? max : curr
          );
        }
        return args.reduce((max: SeedValue, curr: SeedValue) =>
          max.value > curr.value ? max : curr
        );
      }
    });

    this.globals.define('abs', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('abs() requires number');
        return { type: 'number', value: Math.abs(n.value as number) };
      }
    });

    this.globals.define('floor', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('floor() requires number');
        return { type: 'number', value: Math.floor(n.value as number) };
      }
    });

    this.globals.define('ceil', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('ceil() requires number');
        return { type: 'number', value: Math.ceil(n.value as number) };
      }
    });

    this.globals.define('round', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('round() requires number');
        return { type: 'number', value: Math.round(n.value as number) };
      }
    });

    this.globals.define('pow', {
      type: 'function',
      value: (base: SeedValue, exp: SeedValue) => {
        if (base.type !== 'number' || exp.type !== 'number') throw new RuntimeError('pow() requires numbers');
        return { type: 'number', value: Math.pow(base.value as number, exp.value as number) };
      }
    });

    this.globals.define('sqrt', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('sqrt() requires number');
        return { type: 'number', value: Math.sqrt(n.value as number) };
      }
    });

    this.globals.define('random', {
      type: 'function',
      value: (min?: SeedValue, max?: SeedValue) => {
        const minVal = min ? min.value as number : 0;
        const maxVal = max ? max.value as number : 1;
        return { type: 'number', value: Math.random() * (maxVal - minVal) + minVal };
      }
    });

    this.globals.define('parseInt', {
      type: 'function',
      value: (str: SeedValue, radix?: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('parseInt() requires string');
        const rad = radix ? radix.value as number : 10;
        return { type: 'number', value: parseInt(str.value, rad) };
      }
    });

    this.globals.define('parseFloat', {
      type: 'function',
      value: (str: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('parseFloat() requires string');
        return { type: 'number', value: parseFloat(str.value) };
      }
    });

    this.globals.define('isNaN', {
      type: 'function',
      value: (n: SeedValue) => {
        return { type: 'boolean', value: isNaN(n.value as number) };
      }
    });

    this.globals.define('isFinite', {
      type: 'function',
      value: (n: SeedValue) => {
        return { type: 'boolean', value: isFinite(n.value as number) };
      }
    });

    this.globals.define('toString', {
      type: 'function',
      value: (val: SeedValue) => {
        return { type: 'string', value: String(val.value) };
      }
    });

    this.globals.define('toBoolean', {
      type: 'function',
      value: (val: SeedValue) => {
        return { type: 'boolean', value: Boolean(val.value) };
      }
    });

    this.globals.define('error', {
      type: 'function',
      value: (message: SeedValue) => {
        throw new RuntimeError(this.stringify(message));
      }
    });

    this.globals.define('assert', {
      type: 'function',
      value: (condition: SeedValue, message?: SeedValue) => {
        if (!this.isTruthy(condition)) {
          throw new RuntimeError(message ? this.stringify(message) : 'Assertion failed');
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('time', {
      type: 'function',
      value: () => {
        return { type: 'number', value: Date.now() };
      }
    });

    this.globals.define('timestamp', {
      type: 'function',
      value: () => {
        return { type: 'number', value: Math.floor(Date.now() / 1000) };
      }
    });

    this.globals.define('sleep', {
      type: 'function',
      value: async (ms: SeedValue) => {
        await new Promise(resolve => setTimeout(resolve, ms.value as number));
        return { type: 'null', value: null };
      }
    });

    this.globals.define('jsonParse', {
      type: 'function',
      value: (str: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('jsonParse() requires string');
        try {
          const parsed = JSON.parse(str.value);
          return this.jsToSeed(parsed);
        } catch (e) {
          throw new RuntimeError(`Invalid JSON: ${e}`);
        }
      }
    });

    this.globals.define('jsonStringify', {
      type: 'function',
      value: (val: SeedValue, pretty?: SeedValue) => {
        const jsVal = this.seedToJs(val);
        const spaces = pretty ? 2 : undefined;
        return { type: 'string', value: JSON.stringify(jsVal, null, spaces) };
      }
    });

    this.globals.define('typeof', {
      type: 'function',
      value: (val: SeedValue) => {
        return { type: 'string', value: val.type };
      }
    });

    this.globals.define('instanceof', {
      type: 'function',
      value: (obj: SeedValue, className: SeedValue) => {
        if (obj.type !== 'object') return { type: 'boolean', value: false };
        return { type: 'boolean', value: obj.value === className.value };
      }
    });

    this.globals.define('entries', {
      type: 'function',
      value: (obj: SeedValue) => {
        if (obj.type !== 'object' || !obj.properties) throw new RuntimeError('entries() requires object');
        return { type: 'array', value: Array.from(obj.properties.entries()).map(([k, v]) => ({
          type: 'array',
          value: [
            { type: 'string', value: k },
            v
          ]
        })) };
      }
    });

    this.globals.define('fromEntries', {
      type: 'function',
      value: (entries: SeedValue) => {
        if (entries.type !== 'array') throw new RuntimeError('fromEntries() requires array');
        const properties = new Map<string, SeedValue>();
        for (const entry of entries.value as SeedValue[]) {
          if (entry.type !== 'array' || entry.value.length !== 2) {
            throw new RuntimeError('Each entry must be a [key, value] pair');
          }
          const [key, value] = entry.value as [SeedValue, SeedValue];
          properties.set(this.stringify(key), value);
        }
        return { type: 'object', value: null, properties };
      }
    });

    this.globals.define('freeze', {
      type: 'function',
      value: (obj: SeedValue) => {
        if (obj.type !== 'object') return obj;
        obj.frozen = true;
        return obj;
      }
    });

    this.globals.define('sealed', {
      type: 'function',
      value: (obj: SeedValue) => {
        if (obj.type !== 'object') return obj;
        obj.sealed = true;
        return obj;
      }
    });

    this.globals.define('clone', {
      type: 'function',
      value: (obj: SeedValue) => {
        return this.deepCopy(obj);
      }
    });

    this.globals.define('deepEqual', {
      type: 'function',
      value: (a: SeedValue, b: SeedValue) => {
        return { type: 'boolean', value: this.deepEqual(a, b) };
      }
    });

    this.globals.define('shallowEqual', {
      type: 'function',
      value: (a: SeedValue, b: SeedValue) => {
        return { type: 'boolean', value: this.shallowEqual(a, b) };
      }
    });

    this.globals.define('pick', {
      type: 'function',
      value: (obj: SeedValue, keys: SeedValue) => {
        if (obj.type !== 'object' || !obj.properties) throw new RuntimeError('pick() requires object');
        if (keys.type !== 'array') throw new RuntimeError('pick() requires array of keys');
        const picked = new Map<string, SeedValue>();
        for (const key of keys.value as SeedValue[]) {
          const keyStr = this.stringify(key);
          if (obj.properties.has(keyStr)) {
            picked.set(keyStr, obj.properties.get(keyStr)!);
          }
        }
        return { type: 'object', value: null, properties: picked };
      }
    });

    this.globals.define('omit', {
      type: 'function',
      value: (obj: SeedValue, keys: SeedValue) => {
        if (obj.type !== 'object' || !obj.properties) throw new RuntimeError('omit() requires object');
        if (keys.type !== 'array') throw new RuntimeError('omit() requires array of keys');
        const omitted = new Map(obj.properties);
        for (const key of keys.value as SeedValue[]) {
          omitted.delete(this.stringify(key));
        }
        return { type: 'object', value: null, properties: omitted };
      }
    });

    this.globals.define('defaults', {
      type: 'function',
      value: (obj: SeedValue, defaults: SeedValue) => {
        if (obj.type !== 'object' || !obj.properties) throw new RuntimeError('defaults() requires object');
        if (defaults.type !== 'object' || !defaults.properties) throw new RuntimeError('defaults() requires object');
        const result = new Map(defaults.properties);
        obj.properties.forEach((v, k) => result.set(k, v));
        return { type: 'object', value: null, properties: result };
      }
    });

    this.globals.define('tap', {
      type: 'function',
      value: (value: SeedValue, fn: SeedValue) => {
        if (fn.type !== 'function') throw new RuntimeError('tap() requires function');
        fn.value(value);
        return value;
      }
    });

    this.globals.define('pipe', {
      type: 'function',
      value: (...fns: SeedValue[]) => {
        return {
          type: 'function',
          value: (initial: SeedValue) => {
            return fns.reduce((acc: SeedValue, fn: SeedValue) => {
              if (fn.type !== 'function') throw new RuntimeError('pipe() requires functions');
              return fn.value(acc);
            }, initial);
          }
        };
      }
    });

    this.globals.define('compose', {
      type: 'function',
      value: (...fns: SeedValue[]) => {
        return {
          type: 'function',
          value: (initial: SeedValue) => {
            return [...fns].reverse().reduce((acc: SeedValue, fn: SeedValue) => {
              if (fn.type !== 'function') throw new RuntimeError('compose() requires functions');
              return fn.value(acc);
            }, initial);
          }
        };
      }
    });

    this.globals.define('memoize', {
      type: 'function',
      value: (fn: SeedValue) => {
        if (fn.type !== 'function') throw new RuntimeError('memoize() requires function');
        const cache = new Map<string, SeedValue>();
        return {
          type: 'function',
          value: (...args: SeedValue[]) => {
            const key = args.map(a => this.stringify(a)).join(',');
            if (cache.has(key)) return cache.get(key)!;
            const result = fn.value(...args);
            cache.set(key, result);
            return result;
          }
        };
      }
    });

    this.globals.define('debounce', {
      type: 'function',
      value: (fn: SeedValue, ms: SeedValue) => {
        if (fn.type !== 'function') throw new RuntimeError('debounce() requires function');
        let timeoutId: any = null;
        return {
          type: 'function',
          value: (...args: SeedValue[]) => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              fn.value(...args);
              timeoutId = null;
            }, ms.value as number);
          }
        };
      }
    });

    this.globals.define('throttle', {
      type: 'function',
      value: (fn: SeedValue, ms: SeedValue) => {
        if (fn.type !== 'function') throw new RuntimeError('throttle() requires function');
        let lastCall = 0;
        return {
          type: 'function',
          value: (...args: SeedValue[]) => {
            const now = Date.now();
            if (now - lastCall >= (ms.value as number)) {
              lastCall = now;
              fn.value(...args);
            }
          }
        };
      }
    });

    this.globals.define('retry', {
      type: 'function',
      value: async (fn: SeedValue, retries: SeedValue, delay?: SeedValue) => {
        if (fn.type !== 'function') throw new RuntimeError('retry() requires function');
        const maxRetries = retries.value as number;
        const delayMs = delay ? delay.value as number : 1000;
        for (let i = 0; i <= maxRetries; i++) {
          try {
            return await fn.value();
          } catch (e) {
            if (i === maxRetries) throw e;
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
        return { type: 'null', value: null };
      }
    });

    this.globals.define('timeout', {
      type: 'function',
      value: async (fn: SeedValue, ms: SeedValue) => {
        if (fn.type !== 'function') throw new RuntimeError('timeout() requires function');
        return Promise.race([
          fn.value(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new RuntimeError('Operation timed out')), ms.value as number)
          )
        ]);
      }
    });

    this.globals.define('all', {
      type: 'function',
      value: async (promises: SeedValue) => {
        if (promises.type !== 'array') throw new RuntimeError('all() requires array');
        const results = await Promise.all(promises.value.map((p: SeedValue) => p.value));
        return { type: 'array', value: results };
      }
    });

    this.globals.define('race', {
      type: 'function',
      value: async (promises: SeedValue) => {
        if (promises.type !== 'array') throw new RuntimeError('race() requires array');
        const result = await Promise.race(promises.value.map((p: SeedValue) => p.value));
        return result;
      }
    });

    this.globals.define('env', {
      type: 'function',
      value: (key: SeedValue) => {
        const keyStr = this.stringify(key);
        const allowedEnvKeys = /^(PATH|HOME|USER|LANG|TERM|SHELL|PWD|NODE_ENV|SEED_|PARTICLE_BENCH_)/;
        if (!allowedEnvKeys.test(keyStr)) {
          return { type: 'null', value: null };
        }
        const value = process.env[keyStr];
        return value ? { type: 'string', value } : { type: 'null', value: null };
      }
    });

    this.globals.define('exit', {
      type: 'function',
      value: (code?: SeedValue) => {
        process.exit(code ? code.value as number : 0);
      }
    });

    this.globals.define('args', {
      type: 'function',
      value: () => {
        return { type: 'array', value: process.argv.map(a => ({ type: 'string', value: a })) };
      }
    });

    this.globals.define('PI', {
      type: 'number',
      value: Math.PI
    });

    this.globals.define('E', {
      type: 'number',
      value: Math.E
    });

    this.globals.define('sin', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('sin() requires number');
        return { type: 'number', value: Math.sin(n.value as number) };
      }
    });

    this.globals.define('cos', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('cos() requires number');
        return { type: 'number', value: Math.cos(n.value as number) };
      }
    });

    this.globals.define('tan', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('tan() requires number');
        return { type: 'number', value: Math.tan(n.value as number) };
      }
    });

    this.globals.define('log', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('log() requires number');
        return { type: 'number', value: Math.log(n.value as number) };
      }
    });

    this.globals.define('exp', {
      type: 'function',
      value: (n: SeedValue) => {
        if (n.type !== 'number') throw new RuntimeError('exp() requires number');
        return { type: 'number', value: Math.exp(n.value as number) };
      }
    });

    this.globals.define('replace', {
      type: 'function',
      value: (str: SeedValue, search: SeedValue, replace: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('replace() requires string');
        return { type: 'string', value: str.value.replaceAll(search.value as string, replace.value as string) };
      }
    });

    this.globals.define('startsWith', {
      type: 'function',
      value: (str: SeedValue, prefix: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('startsWith() requires string');
        return { type: 'boolean', value: str.value.startsWith(prefix.value as string) };
      }
    });

    this.globals.define('endsWith', {
      type: 'function',
      value: (str: SeedValue, suffix: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('endsWith() requires string');
        return { type: 'boolean', value: str.value.endsWith(suffix.value as string) };
      }
    });

    this.globals.define('substring', {
      type: 'function',
      value: (str: SeedValue, start: SeedValue, end?: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('substring() requires string');
        return { type: 'string', value: str.value.substring(start.value as number, end?.value as number) };
      }
    });

    this.globals.define('charAt', {
      type: 'function',
      value: (str: SeedValue, index: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('charAt() requires string');
        const char = str.value.charAt(index.value as number);
        return { type: 'string', value: char };
      }
    });

    this.globals.define('codePointAt', {
      type: 'function',
      value: (str: SeedValue, index: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('codePointAt() requires string');
        const cp = str.value.codePointAt(index.value as number);
        return { type: 'number', value: cp ?? -1 };
      }
    });

    this.globals.define('fromCharCode', {
      type: 'function',
      value: (...args: SeedValue[]) => {
        const chars = args.map(a => Number(a.value));
        return { type: 'string', value: String.fromCharCode(...chars) };
      }
    });

    this.globals.define('repeat', {
      type: 'function',
      value: (str: SeedValue, count: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('repeat() requires string');
        return { type: 'string', value: str.value.repeat(count.value as number) };
      }
    });

    this.globals.define('padStart', {
      type: 'function',
      value: (str: SeedValue, length: SeedValue, pad?: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('padStart() requires string');
        const padStr = pad ? pad.value as string : ' ';
        return { type: 'string', value: str.value.padStart(length.value as number, padStr) };
      }
    });

    this.globals.define('padEnd', {
      type: 'function',
      value: (str: SeedValue, length: SeedValue, pad?: SeedValue) => {
        if (str.type !== 'string') throw new RuntimeError('padEnd() requires string');
        const padStr = pad ? pad.value as string : ' ';
        return { type: 'string', value: str.value.padEnd(length.value as number, padStr) };
      }
    });

    this.globals.define('find', {
      type: 'function',
      value: (arr: SeedValue, fn: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('find() requires array');
        if (fn.type !== 'function') throw new RuntimeError('find() requires function');
        const result = arr.value.find((item: SeedValue) => fn.value(item).value);
        return result || { type: 'null', value: null };
      }
    });

    this.globals.define('findIndex', {
      type: 'function',
      value: (arr: SeedValue, fn: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('findIndex() requires array');
        if (fn.type !== 'function') throw new RuntimeError('findIndex() requires function');
        const index = arr.value.findIndex((item: SeedValue) => fn.value(item).value);
        return { type: 'number', value: index };
      }
    });

    this.globals.define('every', {
      type: 'function',
      value: (arr: SeedValue, fn: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('every() requires array');
        if (fn.type !== 'function') throw new RuntimeError('every() requires function');
        return { type: 'boolean', value: arr.value.every((item: SeedValue) => fn.value(item).value) };
      }
    });

    this.globals.define('some', {
      type: 'function',
      value: (arr: SeedValue, fn: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('some() requires array');
        if (fn.type !== 'function') throw new RuntimeError('some() requires function');
        return { type: 'boolean', value: arr.value.some((item: SeedValue) => fn.value(item).value) };
      }
    });

    this.globals.define('includes', {
      type: 'function',
      value: (arr: SeedValue, item: SeedValue) => {
        if (arr.type === 'string') {
          return { type: 'boolean', value: arr.value.includes(String(item.value ?? '')) };
        }
        if (arr.type !== 'array') throw new RuntimeError('includes() requires array or string');
        return { type: 'boolean', value: arr.value.some((v: SeedValue) => this.isEqual(v, item)) };
      }
    });

    this.globals.define('flat', {
      type: 'function',
      value: (arr: SeedValue, depth?: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('flat() requires array');
        const d = depth ? depth.value as number : 1;
        const flatten = (a: SeedValue[], currentDepth: number): SeedValue[] => {
          if (currentDepth >= d) return a;
          return a.flatMap((item: SeedValue) => {
            if (item.type === 'array') {
              return flatten(item.value, currentDepth + 1);
            }
            return [item];
          });
        };
        return { type: 'array', value: flatten(arr.value, 0) };
      }
    });

    this.globals.define('fill', {
      type: 'function',
      value: (arr: SeedValue, value: SeedValue, start?: SeedValue, end?: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('fill() requires array');
        const result = [...arr.value];
        const s = start ? start.value as number : 0;
        const e = end ? end.value as number : result.length;
        for (let i = s; i < e; i++) {
          result[i] = value;
        }
        return { type: 'array', value: result };
      }
    });

    this.globals.define('first', {
      type: 'function',
      value: (arr: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('first() requires array');
        if (arr.value.length === 0) return { type: 'null', value: null };
        return arr.value[0];
      }
    });

    this.globals.define('last', {
      type: 'function',
      value: (arr: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('last() requires array');
        if (arr.value.length === 0) return { type: 'null', value: null };
        return arr.value[arr.value.length - 1];
      }
    });

    this.globals.define('take', {
      type: 'function',
      value: (arr: SeedValue, n: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('take() requires array');
        return { type: 'array', value: arr.value.slice(0, n.value as number) };
      }
    });

    this.globals.define('drop', {
      type: 'function',
      value: (arr: SeedValue, n: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('drop() requires array');
        return { type: 'array', value: arr.value.slice(n.value as number) };
      }
    });

    this.globals.define('unique', {
      type: 'function',
      value: (arr: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('unique() requires array');
        const seen = new Set<string>();
        const result: SeedValue[] = [];
        for (const item of arr.value) {
          const key = this.stringify(item);
          if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
          }
        }
        return { type: 'array', value: result };
      }
    });

    this.globals.define('count', {
      type: 'function',
      value: (arr: SeedValue, fn: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('count() requires array');
        if (fn.type !== 'function') throw new RuntimeError('count() requires function');
        let c = 0;
        for (const item of arr.value) {
          if (fn.value(item).value) c++;
        }
        return { type: 'number', value: c };
      }
    });

    this.globals.define('groupBy', {
      type: 'function',
      value: (arr: SeedValue, fn: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('groupBy() requires array');
        if (fn.type !== 'function') throw new RuntimeError('groupBy() requires function');
        const groups = new Map<string, SeedValue[]>();
        for (const item of arr.value) {
          const key = this.stringify(fn.value(item));
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(item);
        }
        const properties = new Map<string, SeedValue>();
        groups.forEach((value, key) => {
          properties.set(key, { type: 'array', value });
        });
        return { type: 'object', value: null, properties };
      }
    });

    this.globals.define('chunk', {
      type: 'function',
      value: (arr: SeedValue, size: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('chunk() requires array');
        const s = size.value as number;
        const result: SeedValue[] = [];
        for (let i = 0; i < arr.value.length; i += s) {
          result.push({ type: 'array', value: arr.value.slice(i, i + s) });
        }
        return { type: 'array', value: result };
      }
    });

    this.globals.define('flatten', {
      type: 'function',
      value: (arr: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('flatten() requires array');
        const result: SeedValue[] = [];
        const flatten = (items: SeedValue[]) => {
          for (const item of items) {
            if (item.type === 'array') {
              flatten(item.value);
            } else {
              result.push(item);
            }
          }
        };
        flatten(arr.value);
        return { type: 'array', value: result };
      }
    });

    this.globals.define('zip', {
      type: 'function',
      value: (...arrs: SeedValue[]) => {
        if (arrs.length === 0) return { type: 'array', value: [] };
        if (!arrs.every(a => a.type === 'array')) throw new RuntimeError('zip() requires arrays');
        const minLength = Math.min(...arrs.map(a => a.value.length));
        const result: SeedValue[] = [];
        for (let i = 0; i < minLength; i++) {
          result.push({ type: 'array', value: arrs.map(a => a.value[i]) });
        }
        return { type: 'array', value: result };
      }
    });

    this.globals.define('unzip', {
      type: 'function',
      value: (arr: SeedValue) => {
        if (arr.type !== 'array') throw new RuntimeError('unzip() requires array');
        if (arr.value.length === 0) return { type: 'array', value: [] };
        const first = arr.value[0];
        if (first.type !== 'array') throw new RuntimeError('unzip() requires array of arrays');
        const result: SeedValue[] = [];
        for (let i = 0; i < first.value.length; i++) {
          result.push({ type: 'array', value: arr.value.map((a: SeedValue) => (a.value as SeedValue[])[i]) });
        }
        return { type: 'array', value: result };
      }
    });

    // ========== 文件系统函数 ==========
    const fs = require('fs');

    this.globals.define('readFile', {
      type: 'function',
      value: (filePath: SeedValue) => {
        if (filePath.type !== 'string') throw new RuntimeError('readFile() requires string path');
        try {
          const content = fs.readFileSync(filePath.value as string, 'utf-8');
          return { type: 'string', value: content };
        } catch (e) {
          return { type: 'null', value: null };
        }
      }
    });

    this.globals.define('writeFile', {
      type: 'function',
      value: (filePath: SeedValue, content: SeedValue) => {
        if (filePath.type !== 'string') throw new RuntimeError('writeFile() requires string path');
        try {
          fs.writeFileSync(filePath.value as string, content.value as string, 'utf-8');
          return { type: 'boolean', value: true };
        } catch (e) {
          return { type: 'boolean', value: false };
        }
      }
    });

    this.globals.define('exists', {
      type: 'function',
      value: (filePath: SeedValue) => {
        if (filePath.type !== 'string') throw new RuntimeError('exists() requires string path');
        return { type: 'boolean', value: fs.existsSync(filePath.value as string) };
      }
    });

    this.globals.define('listDir', {
      type: 'function',
      value: (dirPath: SeedValue) => {
        if (dirPath.type !== 'string') throw new RuntimeError('listDir() requires string path');
        try {
          const files = fs.readdirSync(dirPath.value as string);
          return { type: 'array', value: files.map((f: string) => ({ type: 'string', value: f })) };
        } catch (e) {
          return { type: 'array', value: [] };
        }
      }
    });

    this.globals.define('isFile', {
      type: 'function',
      value: (filePath: SeedValue) => {
        if (filePath.type !== 'string') throw new RuntimeError('isFile() requires string path');
        try {
          return { type: 'boolean', value: fs.statSync(filePath.value as string).isFile() };
        } catch (e) {
          return { type: 'boolean', value: false };
        }
      }
    });

    this.globals.define('isDir', {
      type: 'function',
      value: (filePath: SeedValue) => {
        if (filePath.type !== 'string') throw new RuntimeError('isDir() requires string path');
        try {
          return { type: 'boolean', value: fs.statSync(filePath.value as string).isDirectory() };
        } catch (e) {
          return { type: 'boolean', value: false };
        }
      }
    });

    // ========== 类型转换与检查 ==========
    this.globals.define('toInt', {
      type: 'function',
      value: (val: SeedValue) => {
        return { type: 'number', value: parseInt(val.value as string, 10) || 0 };
      }
    });

    this.globals.define('toFloat', {
      type: 'function',
      value: (val: SeedValue) => {
        return { type: 'number', value: parseFloat(val.value as string) || 0.0 };
      }
    });

    this.globals.define('toBool', {
      type: 'function',
      value: (val: SeedValue) => {
        return { type: 'boolean', value: !!val.value };
      }
    });

    // ========== 进制转换 ==========
    this.globals.define('toBinary', {
      type: 'function',
      value: (val: SeedValue) => {
        const num = val.type === 'number' ? val.value : parseInt(String(val.value), 10);
        return { type: 'string', value: '0b' + (num >>> 0).toString(2) };
      }
    });

    this.globals.define('toOctal', {
      type: 'function',
      value: (val: SeedValue) => {
        const num = val.type === 'number' ? val.value : parseInt(String(val.value), 10);
        return { type: 'string', value: '0o' + (num >>> 0).toString(8) };
      }
    });

    this.globals.define('toHex', {
      type: 'function',
      value: (val: SeedValue) => {
        const num = val.type === 'number' ? val.value : parseInt(String(val.value), 10);
        return { type: 'string', value: '0x' + (num >>> 0).toString(16).toUpperCase() };
      }
    });

    this.globals.define('parseBase', {
      type: 'function',
      value: (str: SeedValue, base: SeedValue) => {
        const baseNum = base.value as number;
        if (baseNum < 2 || baseNum > 36) {
          throw new RuntimeError('Base must be between 2 and 36');
        }
        return { type: 'number', value: parseInt(str.value as string, baseNum) };
      }
    });

    this.globals.define('formatBase', {
      type: 'function',
      value: (num: SeedValue, base: SeedValue) => {
        const baseNum = base.value as number;
        if (baseNum < 2 || baseNum > 36) {
          throw new RuntimeError('Base must be between 2 and 36');
        }
        return { type: 'string', value: (num.value >>> 0).toString(baseNum).toUpperCase() };
      }
    });

    // ========== 异步编程支持 ==========
    this.globals.define('promise', {
      type: 'function',
      value: (executor: SeedValue): SeedValue => {
        const promiseValue: SeedValue = {
          type: 'promise',
          value: null,
          _then: (resolve: (value: any) => void, reject?: (error: any) => void) => {
            try {
              if (executor.value && typeof executor.value === 'function') {
                executor.value(
                  (result: SeedValue) => resolve(result.value),
                  (error: SeedValue) => reject ? reject(error.value) : undefined
                );
              }
            } catch (e) {
              reject ? reject(e) : undefined;
            }
          }
        };
        return promiseValue;
      }
    });

    this.globals.define('resolve', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        const promiseValue: SeedValue = {
          type: 'promise',
          value: val,
          _then: (resolve: (value: any) => void) => {
            resolve(val);
          }
        };
        return promiseValue;
      }
    });

    this.globals.define('reject', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        const promiseValue: SeedValue = {
          type: 'promise',
          value: val,
          _then: (_resolve: (value: any) => void, reject?: (error: any) => void) => {
            reject ? reject(val.value) : undefined;
          }
        };
        return promiseValue;
      }
    });

    // ========== 正则表达式函数 ==========
    this.globals.define('regexMatch', {
      type: 'function',
      value: (str: SeedValue, pattern: SeedValue) => {
        if (str.type !== 'string' || pattern.type !== 'string') throw new RuntimeError('regexMatch() requires strings');
        try {
          const regex = new RegExp(pattern.value as string, 'g');
          const matches = [...str.value.matchAll(regex)];
          return { type: 'array', value: matches.map((m: RegExpMatchArray) => ({ type: 'string', value: m[0] })) };
        } catch (e) {
          return { type: 'array', value: [] };
        }
      }
    });

    this.globals.define('regexTest', {
      type: 'function',
      value: (str: SeedValue, pattern: SeedValue) => {
        if (str.type !== 'string' || pattern.type !== 'string') throw new RuntimeError('regexTest() requires strings');
        try {
          const regex = new RegExp(pattern.value as string);
          return { type: 'boolean', value: regex.test(str.value as string) };
        } catch (e) {
          return { type: 'boolean', value: false };
        }
      }
    });

    this.globals.define('regexReplace', {
      type: 'function',
      value: (str: SeedValue, pattern: SeedValue, replacement: SeedValue) => {
        if (str.type !== 'string' || pattern.type !== 'string' || replacement.type !== 'string') throw new RuntimeError('regexReplace() requires strings');
        try {
          const regex = new RegExp(pattern.value as string, 'g');
          return { type: 'string', value: str.value.replace(regex, replacement.value as string) };
        } catch (e) {
          return str;
        }
      }
    });

    this.globals.define('regexSplit', {
      type: 'function',
      value: (str: SeedValue, pattern: SeedValue) => {
        if (str.type !== 'string' || pattern.type !== 'string') throw new RuntimeError('regexSplit() requires strings');
        try {
          const regex = new RegExp(pattern.value as string);
          const parts = str.value.split(regex);
          return { type: 'array', value: parts.map((p: string) => ({ type: 'string', value: p })) };
        } catch (e) {
          return { type: 'array', value: [{ type: 'string', value: str.value }] };
        }
      }
    });

    // ========== 日期时间函数 ==========
    this.globals.define('date', {
      type: 'function',
      value: (...args: SeedValue[]) => {
        let d: Date;
        if (args.length === 0) {
          d = new Date();
        } else if (args.length === 1 && args[0].type === 'string') {
          d = new Date(args[0].value as string);
        } else if (args.length >= 3) {
          d = new Date(
            args[0].value as number,
            (args[1].value as number) - 1,
            args[2].value as number,
            args[3] ? args[3].value as number : 0,
            args[4] ? args[4].value as number : 0,
            args[5] ? args[5].value as number : 0
          );
        } else {
          d = new Date();
        }

        const properties = new Map<string, SeedValue>();
        properties.set('year', { type: 'number', value: d.getFullYear() });
        properties.set('month', { type: 'number', value: d.getMonth() + 1 });
        properties.set('day', { type: 'number', value: d.getDate() });
        properties.set('hours', { type: 'number', value: d.getHours() });
        properties.set('minutes', { type: 'number', value: d.getMinutes() });
        properties.set('seconds', { type: 'number', value: d.getSeconds() });
        properties.set('milliseconds', { type: 'number', value: d.getMilliseconds() });
        properties.set('weekday', { type: 'number', value: d.getDay() });
        properties.set('timestamp', { type: 'number', value: d.getTime() });
        properties.set('toISOString', {
          type: 'function',
          value: () => ({ type: 'string', value: d.toISOString() })
        });
        properties.set('toLocaleString', {
          type: 'function',
          value: () => ({ type: 'string', value: d.toLocaleString() })
        });
        properties.set('format', {
          type: 'function',
          value: (fmt: SeedValue) => {
            const formatStr = fmt.value as string;
            let result = formatStr
              .replace('YYYY', String(d.getFullYear()))
              .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
              .replace('DD', String(d.getDate()).padStart(2, '0'))
              .replace('HH', String(d.getHours()).padStart(2, '0'))
              .replace('mm', String(d.getMinutes()).padStart(2, '0'))
              .replace('ss', String(d.getSeconds()).padStart(2, '0'));
            return { type: 'string', value: result };
          }
        });

        return { type: 'object', value: null, properties };
      }
    });

    this.globals.define('dateFormat', {
      type: 'function',
      value: (d: SeedValue, fmt: SeedValue) => {
        if (d.type !== 'object') throw new RuntimeError('dateFormat() requires date object');
        const formatFn = d.properties?.get('format');
        if (formatFn && formatFn.type === 'function') {
          return formatFn.value(fmt);
        }
        return { type: 'string', value: '' };
      }
    });

    // ========== 更多工具函数 ==========
    this.globals.define('deepClone', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        if (val.type === 'null' || val.type === 'undefined') return val;
        if (val.type === 'number' || val.type === 'boolean' || val.type === 'string') return val;
        if (val.type === 'array') {
          return { type: 'array', value: val.value.map((item: SeedValue) => this.deepClone(item)) };
        }
        if (val.type === 'object') {
          const newProps = new Map<string, SeedValue>();
          val.properties?.forEach((v, k) => newProps.set(k, this.deepClone(v)));
          return { type: 'object', value: null, properties: newProps };
        }
        return val;
      }
    });

    this.globals.define('deepMerge', {
      type: 'function',
      value: (target: SeedValue, ...sources: SeedValue[]): SeedValue => {
        if (target.type !== 'object') throw new RuntimeError('deepMerge() requires objects');
        const result = this.deepClone(target);
        for (const source of sources) {
          if (source.type !== 'object') continue;
          source.properties?.forEach((value, key) => {
            if (result.properties!.has(key)) {
              const existing = result.properties!.get(key)!;
              if (existing.type === 'object' && value.type === 'object') {
                result.properties!.set(key, this.deepMerge(existing, value));
              } else {
                result.properties!.set(key, this.deepClone(value));
              }
            } else {
              result.properties!.set(key, this.deepClone(value));
            }
          });
        }
        return result;
      }
    });

    this.globals.define('isEmpty', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        if (val.type === 'null' || val.type === 'undefined') return { type: 'boolean', value: true };
        if (val.type === 'string') return { type: 'boolean', value: (val.value as string).length === 0 };
        if (val.type === 'array') return { type: 'boolean', value: val.value.length === 0 };
        if (val.type === 'object') return { type: 'boolean', value: (val.properties?.size || 0) === 0 };
        return { type: 'boolean', value: false };
      }
    });

    this.globals.define('isNil', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        return { type: 'boolean', value: val.type === 'null' || val.type === 'undefined' };
      }
    });

    this.globals.define('isArray', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        return { type: 'boolean', value: val.type === 'array' };
      }
    });

    this.globals.define('isObject', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        return { type: 'boolean', value: val.type === 'object' };
      }
    });

    this.globals.define('isFunction', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        return { type: 'boolean', value: val.type === 'function' };
      }
    });

    this.globals.define('isString', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        return { type: 'boolean', value: val.type === 'string' };
      }
    });

    this.globals.define('isNumber', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        return { type: 'boolean', value: val.type === 'number' };
      }
    });

    this.globals.define('capitalize', {
      type: 'function',
      value: (str: SeedValue): SeedValue => {
        if (str.type !== 'string') throw new RuntimeError('capitalize() requires string');
        const s = str.value as string;
        return { type: 'string', value: s.charAt(0).toUpperCase() + s.slice(1) };
      }
    });

    this.globals.define('decapitalize', {
      type: 'function',
      value: (str: SeedValue): SeedValue => {
        if (str.type !== 'string') throw new RuntimeError('decapitalize() requires string');
        const s = str.value as string;
        return { type: 'string', value: s.charAt(0).toLowerCase() + s.slice(1) };
      }
    });

    this.globals.define('camelCase', {
      type: 'function',
      value: (str: SeedValue): SeedValue => {
        if (str.type !== 'string') throw new RuntimeError('camelCase() requires string');
        return { type: 'string', value: (str.value as string).replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '') };
      }
    });

    this.globals.define('kebabCase', {
      type: 'function',
      value: (str: SeedValue): SeedValue => {
        if (str.type !== 'string') throw new RuntimeError('kebabCase() requires string');
        return { type: 'string', value: (str.value as string).replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() };
      }
    });

    this.globals.define('snakeCase', {
      type: 'function',
      value: (str: SeedValue): SeedValue => {
        if (str.type !== 'string') throw new RuntimeError('snakeCase() requires string');
        return { type: 'string', value: (str.value as string).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() };
      }
    });

    this.globals.define('truncate', {
      type: 'function',
      value: (str: SeedValue, length: SeedValue, suffix?: SeedValue): SeedValue => {
        if (str.type !== 'string') throw new RuntimeError('truncate() requires string');
        const s = str.value as string;
        const len = length.value as number;
        const suf = suffix ? suffix.value as string : '...';
        if (s.length <= len) return str;
        return { type: 'string', value: s.slice(0, len - suf.length) + suf };
      }
    });

    this.globals.define('template', {
      type: 'function',
      value: (str: SeedValue, data: SeedValue): SeedValue => {
        if (str.type !== 'string') throw new RuntimeError('template() requires string');
        if (data.type !== 'object') throw new RuntimeError('template() requires object for data');
        let result = str.value as string;
        data.properties?.forEach((value, key) => {
          const placeholder = '{' + key + '}';
          result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), this.stringify(value));
        });
        return { type: 'string', value: result };
      }
    });

    this.globals.define('sample', {
      type: 'function',
      value: (arr: SeedValue): SeedValue => {
        if (arr.type !== 'array') throw new RuntimeError('sample() requires array');
        if (arr.value.length === 0) return { type: 'null', value: null };
        return arr.value[Math.floor(Math.random() * arr.value.length)];
      }
    });

    this.globals.define('shuffle', {
      type: 'function',
      value: (arr: SeedValue): SeedValue => {
        if (arr.type !== 'array') throw new RuntimeError('shuffle() requires array');
        const result = [...arr.value];
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]];
        }
        return { type: 'array', value: result };
      }
    });

    this.globals.define('difference', {
      type: 'function',
      value: (arr1: SeedValue, arr2: SeedValue): SeedValue => {
        if (arr1.type !== 'array' || arr2.type !== 'array') throw new RuntimeError('difference() requires arrays');
        const set2 = new Set(arr2.value.map((v: SeedValue) => this.stringify(v)));
        return { type: 'array', value: arr1.value.filter((v: SeedValue) => !set2.has(this.stringify(v))) };
      }
    });

    this.globals.define('intersection', {
      type: 'function',
      value: (arr1: SeedValue, arr2: SeedValue): SeedValue => {
        if (arr1.type !== 'array' || arr2.type !== 'array') throw new RuntimeError('intersection() requires arrays');
        const set2 = new Set(arr2.value.map((v: SeedValue) => this.stringify(v)));
        return { type: 'array', value: arr1.value.filter((v: SeedValue) => set2.has(this.stringify(v))) };
      }
    });

    this.globals.define('union', {
      type: 'function',
      value: (arr1: SeedValue, arr2: SeedValue): SeedValue => {
        if (arr1.type !== 'array' || arr2.type !== 'array') throw new RuntimeError('union() requires arrays');
        const seen = new Set<string>();
        const result: SeedValue[] = [];
        for (const item of [...arr1.value, ...arr2.value]) {
          const key = this.stringify(item);
          if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
          }
        }
        return { type: 'array', value: result };
      }
    });

    this.globals.define('without', {
      type: 'function',
      value: (arr: SeedValue, ...values: SeedValue[]): SeedValue => {
        if (arr.type !== 'array') throw new RuntimeError('without() requires array');
        const excludeSet = new Set(values.map(v => this.stringify(v)));
        return { type: 'array', value: arr.value.filter((v: SeedValue) => !excludeSet.has(this.stringify(v))) };
      }
    });

    this.globals.define('xor', {
      type: 'function',
      value: (arr1: SeedValue, arr2: SeedValue): SeedValue => {
        if (arr1.type !== 'array' || arr2.type !== 'array') throw new RuntimeError('xor() requires arrays');
        const set1 = new Set(arr1.value.map((v: SeedValue) => this.stringify(v)));
        const set2 = new Set(arr2.value.map((v: SeedValue) => this.stringify(v)));
        const result: SeedValue[] = [];
        for (const item of arr1.value) {
          if (!set2.has(this.stringify(item))) result.push(item);
        }
        for (const item of arr2.value) {
          if (!set1.has(this.stringify(item))) result.push(item);
        }
        return { type: 'array', value: result };
      }
    });

    this.globals.define('partition', {
      type: 'function',
      value: (arr: SeedValue, fn: SeedValue): SeedValue => {
        if (arr.type !== 'array') throw new RuntimeError('partition() requires array');
        if (fn.type !== 'function') throw new RuntimeError('partition() requires function');
        const truthy: SeedValue[] = [];
        const falsy: SeedValue[] = [];
        for (const item of arr.value) {
          if (fn.value(item).value) {
            truthy.push(item);
          } else {
            falsy.push(item);
          }
        }
        return { type: 'array', value: [{ type: 'array', value: truthy }, { type: 'array', value: falsy }] };
      }
    });

    this.globals.define('compact', {
      type: 'function',
      value: (arr: SeedValue): SeedValue => {
        if (arr.type !== 'array') throw new RuntimeError('compact() requires array');
        return { type: 'array', value: arr.value.filter((v: SeedValue) => v.type !== 'null' && v.type !== 'undefined') };
      }
    });

    this.globals.define('flattenDeep', {
      type: 'function',
      value: (arr: SeedValue): SeedValue => {
        if (arr.type !== 'array') throw new RuntimeError('flattenDeep() requires array');
        const result: SeedValue[] = [];
        const seen = new Set<SeedValue>();
        const flatten = (items: SeedValue[], depth: number) => {
          for (const item of items) {
            if (item.type === 'array' && depth > 0) {
              if (seen.has(item)) continue;
              seen.add(item);
              flatten(item.value, depth - 1);
            } else {
              result.push(item);
            }
          }
        };
        flatten(arr.value, Infinity);
        return { type: 'array', value: result };
      }
    });

    this.globals.define('sortBy', {
      type: 'function',
      value: (arr: SeedValue, fn?: SeedValue): SeedValue => {
        if (arr.type !== 'array') throw new RuntimeError('sortBy() requires array');
        const sorted = [...arr.value];
        if (fn && fn.type === 'function') {
          sorted.sort((a: SeedValue, b: SeedValue) => {
            const fa = fn.value(a);
            const fb = fn.value(b);
            if (fa.type === 'number' && fb.type === 'number') return (fa.value as number) - (fb.value as number);
            if (fa.type === 'string' && fb.type === 'string') return (fa.value as string).localeCompare(fb.value as string);
            return 0;
          });
        } else {
          sorted.sort((a: SeedValue, b: SeedValue) => {
            if (a.type === 'number' && b.type === 'number') return (a.value as number) - (b.value as number);
            if (a.type === 'string' && b.type === 'string') return (a.value as string).localeCompare(b.value as string);
            return 0;
          });
        }
        return { type: 'array', value: sorted };
      }
    });

    this.globals.define('groupBy', {
      type: 'function',
      value: (arr: SeedValue, keyOrFn: SeedValue): SeedValue => {
        if (arr.type !== 'array') throw new RuntimeError('groupBy() requires array');
        const groups = new Map<string, SeedValue[]>();
        for (const item of arr.value) {
          let groupKey: string;
          if (keyOrFn.type === 'function') {
            groupKey = this.stringify(keyOrFn.value(item));
          } else if (keyOrFn.type === 'string') {
            groupKey = item.type === 'object' ? this.stringify(item.properties?.get(keyOrFn.value as string)) : this.stringify(item);
          } else {
            groupKey = this.stringify(item);
          }
          if (!groups.has(groupKey)) groups.set(groupKey, []);
          groups.get(groupKey)!.push(item);
        }
        const properties = new Map<string, SeedValue>();
        groups.forEach((value, key) => {
          properties.set(key, { type: 'array', value });
        });
        return { type: 'object', value: null, properties };
      }
    });

    this.globals.define('keyBy', {
      type: 'function',
      value: (arr: SeedValue, keyOrFn: SeedValue): SeedValue => {
        if (arr.type !== 'array') throw new RuntimeError('keyBy() requires array');
        const result = new Map<string, SeedValue>();
        for (const item of arr.value) {
          let objKey: string;
          if (keyOrFn.type === 'function') {
            objKey = this.stringify(keyOrFn.value(item));
          } else if (keyOrFn.type === 'string') {
            objKey = item.type === 'object' ? this.stringify(item.properties?.get(keyOrFn.value as string)) : this.stringify(item);
          } else {
            objKey = this.stringify(item);
          }
          result.set(objKey, item);
        }
        return { type: 'object', value: null, properties: result };
      }
    });

    this.globals.define('invert', {
      type: 'function',
      value: (obj: SeedValue): SeedValue => {
        if (obj.type !== 'object') throw new RuntimeError('invert() requires object');
        const result = new Map<string, SeedValue>();
        obj.properties?.forEach((value, key) => {
          result.set(this.stringify(value), { type: 'string', value: key });
        });
        return { type: 'object', value: null, properties: result };
      }
    });

    this.globals.define('remapValues', {
      type: 'function',
      value: (obj: SeedValue, fn: SeedValue): SeedValue => {
        if (obj.type !== 'object') throw new RuntimeError('mapValues() requires object');
        if (fn.type !== 'function') throw new RuntimeError('mapValues() requires function');
        const result = new Map<string, SeedValue>();
        obj.properties?.forEach((value, key) => {
          result.set(key, fn.value(value));
        });
        return { type: 'object', value: null, properties: result };
      }
    });

    this.globals.define('remapKeys', {
      type: 'function',
      value: (obj: SeedValue, fn: SeedValue): SeedValue => {
        if (obj.type !== 'object') throw new RuntimeError('mapKeys() requires object');
        if (fn.type !== 'function') throw new RuntimeError('mapKeys() requires function');
        const result = new Map<string, SeedValue>();
        obj.properties?.forEach((value, key) => {
          const newKey = fn.value({ type: 'string', value: key }).value as string;
          result.set(newKey, value);
        });
        return { type: 'object', value: null, properties: result };
      }
    });

    this.globals.define('omitBy', {
      type: 'function',
      value: (obj: SeedValue, fn: SeedValue): SeedValue => {
        if (obj.type !== 'object') throw new RuntimeError('omitBy() requires object');
        if (fn.type !== 'function') throw new RuntimeError('omitBy() requires function');
        const result = new Map<string, SeedValue>();
        obj.properties?.forEach((value, key) => {
          if (!fn.value(value).value) {
            result.set(key, value);
          }
        });
        return { type: 'object', value: null, properties: result };
      }
    });

    this.globals.define('pickBy', {
      type: 'function',
      value: (obj: SeedValue, fn: SeedValue): SeedValue => {
        if (obj.type !== 'object') throw new RuntimeError('pickBy() requires object');
        if (fn.type !== 'function') throw new RuntimeError('pickBy() requires function');
        const result = new Map<string, SeedValue>();
        obj.properties?.forEach((value, key) => {
          if (fn.value(value).value) {
            result.set(key, value);
          }
        });
        return { type: 'object', value: null, properties: result };
      }
    });

    this.globals.define('toPairs', {
      type: 'function',
      value: (obj: SeedValue): SeedValue => {
        if (obj.type !== 'object') throw new RuntimeError('toPairs() requires object');
        const pairs: SeedValue[] = [];
        obj.properties?.forEach((value, key) => {
          pairs.push({ type: 'array', value: [{ type: 'string', value: key }, value] });
        });
        return { type: 'array', value: pairs };
      }
    });

    this.globals.define('fromPairs', {
      type: 'function',
      value: (pairs: SeedValue): SeedValue => {
        if (pairs.type !== 'array') throw new RuntimeError('fromPairs() requires array');
        const result = new Map<string, SeedValue>();
        for (const pair of pairs.value) {
          if (pair.type === 'array' && pair.value.length >= 2) {
            result.set(pair.value[0].value as string, pair.value[1]);
          }
        }
        return { type: 'object', value: null, properties: result };
      }
    });

    this.globals.define('hasPath', {
      type: 'function',
      value: (obj: SeedValue, path: SeedValue): SeedValue => {
        if (obj.type !== 'object') return { type: 'boolean', value: false };
        if (path.type !== 'string') throw new RuntimeError('hasPath() requires string path');
        const keys = (path.value as string).split('.');
        let current: SeedValue | undefined = obj;
        for (const key of keys) {
          if (!current || current.type !== 'object' || !current.properties?.has(key)) {
            return { type: 'boolean', value: false };
          }
          current = current.properties.get(key);
        }
        return { type: 'boolean', value: true };
      }
    });

    this.globals.define('getPath', {
      type: 'function',
      value: (obj: SeedValue, path: SeedValue, defaultValue?: SeedValue): SeedValue => {
        if (obj.type !== 'object') return defaultValue || { type: 'null', value: null };
        if (path.type !== 'string') throw new RuntimeError('getPath() requires string path');
        const keys = (path.value as string).split('.');
        let current: SeedValue | undefined = obj;
        for (const key of keys) {
          if (!current || current.type !== 'object' || !current.properties?.has(key)) {
            return defaultValue || { type: 'null', value: null };
          }
          current = current.properties.get(key);
        }
        return current || defaultValue || { type: 'null', value: null };
      }
    });

    this.globals.define('setPath', {
      type: 'function',
      value: (obj: SeedValue, path: SeedValue, value: SeedValue): SeedValue => {
        if (obj.type !== 'object') throw new RuntimeError('setPath() requires object');
        if (path.type !== 'string') throw new RuntimeError('setPath() requires string path');
        const keys = (path.value as string).split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i];
          if (!current.properties?.has(key) || current.properties.get(key)?.type !== 'object') {
            current.properties!.set(key, { type: 'object', value: null, properties: new Map() });
          }
          current = current.properties!.get(key)!;
        }
        current.properties!.set(keys[keys.length - 1], value);
        return obj;
      }
    });

    this.globals.define('once', {
      type: 'function',
      value: (fn: SeedValue): SeedValue => {
        if (fn.type !== 'function') throw new RuntimeError('once() requires function');
        let called = false;
        let cachedResult: SeedValue | null = null;
        return {
          type: 'function',
          value: (...args: SeedValue[]) => {
            if (called) return cachedResult!;
            called = true;
            cachedResult = fn.value(...args);
            return cachedResult;
          }
        };
      }
    });

    this.globals.define('after', {
      type: 'function',
      value: (n: SeedValue, fn: SeedValue): SeedValue => {
        if (n.type !== 'number') throw new RuntimeError('after() requires number');
        if (fn.type !== 'function') throw new RuntimeError('after() requires function');
        let count = 0;
        return {
          type: 'function',
          value: (...args: SeedValue[]) => {
            count++;
            if (count >= n.value) return fn.value(...args);
            return { type: 'null', value: null };
          }
        };
      }
    });

    this.globals.define('before', {
      type: 'function',
      value: (n: SeedValue, fn: SeedValue): SeedValue => {
        if (n.type !== 'number') throw new RuntimeError('before() requires number');
        if (fn.type !== 'function') throw new RuntimeError('before() requires function');
        let count = 0;
        return {
          type: 'function',
          value: (...args: SeedValue[]) => {
            count++;
            if (count < n.value) return fn.value(...args);
            return { type: 'null', value: null };
          }
        };
      }
    });

    this.globals.define('wrap', {
      type: 'function',
      value: (fn: SeedValue, wrapper: SeedValue): SeedValue => {
        if (fn.type !== 'function') throw new RuntimeError('wrap() requires function');
        if (wrapper.type !== 'function') throw new RuntimeError('wrap() requires wrapper function');
        return {
          type: 'function',
          value: (...args: SeedValue[]) => wrapper.value(fn, ...args)
        };
      }
    });

    this.globals.define('negate', {
      type: 'function',
      value: (fn: SeedValue): SeedValue => {
        if (fn.type !== 'function') throw new RuntimeError('negate() requires function');
        return {
          type: 'function',
          value: (...args: SeedValue[]) => ({
            type: 'boolean',
            value: !fn.value(...args).value
          })
        };
      }
    });

    this.globals.define('constant', {
      type: 'function',
      value: (val: SeedValue): SeedValue => {
        return {
          type: 'function',
          value: () => val
        };
      }
    });

    this.globals.define('times', {
      type: 'function',
      value: (n: SeedValue, fn: SeedValue): SeedValue => {
        if (n.type !== 'number') throw new RuntimeError('times() requires number');
        if (fn.type !== 'function') throw new RuntimeError('times() requires function');
        const results: SeedValue[] = [];
        for (let i = 0; i < n.value; i++) {
          results.push(fn.value({ type: 'number', value: i }));
        }
        return { type: 'array', value: results };
      }
    });

    this.globals.define('randomInt', {
      type: 'function',
      value: (min: SeedValue, max: SeedValue): SeedValue => {
        return { type: 'number', value: Math.floor(Math.random() * ((max.value as number) - (min.value as number) + 1)) + (min.value as number) };
      }
    });

    this.globals.define('clamp', {
      type: 'function',
      value: (num: SeedValue, min: SeedValue, max: SeedValue): SeedValue => {
        const val = num.value as number;
        const minVal = min.value as number;
        const maxVal = max.value as number;
        return { type: 'number', value: Math.min(Math.max(val, minVal), maxVal) };
      }
    });

    this.globals.define('inRange', {
      type: 'function',
      value: (num: SeedValue, start: SeedValue, end?: SeedValue): SeedValue => {
        const val = num.value as number;
        const startVal = start.value as number;
        const endVal = end ? end.value as number : startVal;
        if (end === undefined) {
          return { type: 'boolean', value: val >= 0 && val < startVal };
        }
        if (startVal <= endVal) {
          return { type: 'boolean', value: val >= startVal && val < endVal };
        }
        return { type: 'boolean', value: val >= endVal && val < startVal };
      }
    });

    this.setupCoroutineBuiltins();
    this.setupSchedulerBuiltins();
    this.setupMacroBuiltins();
    this.setupNetworkBuiltins();
    this.setupDatabaseBuiltins();
    this.setupGUIBuiltins();
  }

  private setupCoroutineBuiltins(): void {
    const coroutineObj: SeedValue = { type: 'object', value: null, properties: new Map() };

    coroutineObj.properties!.set('resume', {
      type: 'function',
      value: (coro: SeedValue, ...args: SeedValue[]) => {
        if (coro.type !== 'coroutine' || !coro.generator) throw new RuntimeError('coroutine.resume() requires a coroutine');
        if (coro.done) throw new RuntimeError('Cannot resume a completed coroutine');
        try {
          const sendValue: SeedValue = args.length > 0 ? args[0] : { type: 'null', value: null };
          const result = coro.generator.next(sendValue);
          if (result.done) {
            coro.done = true;
            coro.state = 'done';
            return result.value || { type: 'null', value: null };
          }
          coro.state = 'suspended';
          return result.value;
        } catch (e) {
          if (e instanceof YieldSignal) {
            coro.state = 'suspended';
            return e.value;
          }
          if (e instanceof ReturnSignal) {
            coro.done = true;
            coro.state = 'done';
            return e.value;
          }
          throw e;
        }
      }
    });

    coroutineObj.properties!.set('status', {
      type: 'function',
      value: (coro: SeedValue) => {
        if (coro.type !== 'coroutine') return { type: 'string', value: 'invalid' };
        return { type: 'string', value: coro.done ? 'done' : (coro.state || 'suspended') };
      }
    });

    coroutineObj.properties!.set('done', {
      type: 'function',
      value: (coro: SeedValue) => {
        if (coro.type !== 'coroutine') return { type: 'boolean', value: true };
        return { type: 'boolean', value: !!coro.done };
      }
    });

    coroutineObj.properties!.set('running', {
      type: 'function',
      value: (coro: SeedValue) => {
        if (coro.type !== 'coroutine') return { type: 'boolean', value: false };
        return { type: 'boolean', value: coro.state === 'running' };
      }
    });

    this.globals.define('coroutine', coroutineObj);
  }

  private setupSchedulerBuiltins(): void {
    const schedulerObj: SeedValue = { type: 'object', value: null, properties: new Map() };

    schedulerObj.properties!.set('spawn', {
      type: 'function',
      value: (fn: SeedValue, ...args: SeedValue[]) => {
        if (fn.type !== 'function') throw new RuntimeError('scheduler.spawn() requires a function');
        const id = ++this.fiberIdCounter;
        const wrappedFn: SeedValue = {
          type: 'function',
          value: () => fn.value(...args)
        };
        this.fibers.set(id, { fn: wrappedFn, result: undefined });
        return { type: 'number', value: id };
      }
    });

    schedulerObj.properties!.set('run', {
      type: 'function',
      value: () => {
        const results: SeedValue[] = [];
        for (const [_id, fiber] of this.fibers) {
          try {
            const result = fiber.fn.value();
            fiber.result = result;
            results.push(result);
          } catch (e) {
            if (e instanceof ReturnSignal) {
              fiber.result = e.value;
              results.push(e.value);
            } else {
              throw e;
            }
          }
        }
        this.fibers.clear();
        return { type: 'array', value: results };
      }
    });

    schedulerObj.properties!.set('fiberCount', {
      type: 'function',
      value: () => {
        return { type: 'number', value: this.fibers.size };
      }
    });

    schedulerObj.properties!.set('kill', {
      type: 'function',
      value: (id: SeedValue) => {
        return { type: 'boolean', value: this.fibers.delete(id.value as number) };
      }
    });

    schedulerObj.properties!.set('killAll', {
      type: 'function',
      value: () => {
        this.fibers.clear();
        return { type: 'null', value: null };
      }
    });

    this.globals.define('scheduler', schedulerObj);
  }

  private setupMacroBuiltins(): void {
    const astObj: SeedValue = { type: 'object', value: null, properties: new Map() };

    const makeNode = (type: string, fields: Record<string, any>): SeedValue => {
      const props = new Map<string, SeedValue>();
      props.set('type', { type: 'string', value: type });
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) props.set(k, v as SeedValue);
      }
      return { type: 'object', value: null, properties: props };
    };

    astObj.properties!.set('num', {
      type: 'function',
      value: (n: SeedValue) => makeNode('NumberLiteral', { value: n })
    });

    astObj.properties!.set('str', {
      type: 'function',
      value: (s: SeedValue) => makeNode('StringLiteral', { value: s })
    });

    astObj.properties!.set('id', {
      type: 'function',
      value: (name: SeedValue) => makeNode('Identifier', { name })
    });

    astObj.properties!.set('bool', {
      type: 'function',
      value: (b: SeedValue) => makeNode('BooleanLiteral', { value: b })
    });

    astObj.properties!.set('binOp', {
      type: 'function',
      value: (op: SeedValue, left: SeedValue, right: SeedValue) => makeNode('BinaryOp', { operator: op, left, right })
    });

    astObj.properties!.set('unaryOp', {
      type: 'function',
      value: (op: SeedValue, operand: SeedValue) => makeNode('Unary', { operator: op, operand })
    });

    astObj.properties!.set('call', {
      type: 'function',
      value: (callee: SeedValue, ...args: SeedValue[]) => makeNode('Call', { callee, arguments: { type: 'array', value: args } })
    });

    astObj.properties!.set('fn', {
      type: 'function',
      value: (name: SeedValue, params: SeedValue, body: SeedValue) => makeNode('FunctionDef', { name, params, body })
    });

    astObj.properties!.set('ret', {
      type: 'function',
      value: (value: SeedValue) => makeNode('Return', { value })
    });

    this.globals.define('ast', astObj);
  }

  private setupNetworkBuiltins(): void {
    const http = require('http');
    const https = require('https');

    this.globals.define('httpGet', {
      type: 'function',
      value: (url: SeedValue, headers?: SeedValue): SeedValue => {
        return {
          type: 'promise',
          value: new Promise((resolve, reject) => {
            const urlStr = url.value as string;
            const client = urlStr.startsWith('https') ? https : http;
            const headerObj: Record<string, string> = {};
            if (headers && headers.type === 'object' && headers.properties) {
              headers.properties.forEach((v, k) => {
                headerObj[k] = v.value as string;
              });
            }

            const req = client.get(urlStr, { headers: headerObj }, (res: any) => {
              let data = '';
              res.on('data', (chunk: string) => { data += chunk; });
              res.on('end', () => {
                resolve({
                  type: 'object',
                  value: null,
                  properties: new Map([
                    ['status', { type: 'number', value: res.statusCode }],
                    ['headers', { type: 'object', value: null, properties: new Map(Object.entries(res.headers).map(([k, v]) => [k, { type: 'string', value: String(v) }])) }],
                    ['body', { type: 'string', value: data }]
                  ])
                });
              });
            });
            req.on('error', (err: Error) => reject(err));
            req.end();
          })
        };
      }
    });

    this.globals.define('httpPost', {
      type: 'function',
      value: (url: SeedValue, body: SeedValue, headers?: SeedValue): SeedValue => {
        return {
          type: 'promise',
          value: new Promise((resolve, reject) => {
            const urlStr = url.value as string;
            const bodyStr = body.type === 'string' ? body.value as string : JSON.stringify(body.value);
            const urlObj = new URL(urlStr);
            const client = urlStr.startsWith('https') ? https : http;

            const headerObj: Record<string, string> = {
              'Content-Type': 'application/json',
              'Content-Length': String(Buffer.byteLength(bodyStr))
            };
            if (headers && headers.type === 'object' && headers.properties) {
              headers.properties.forEach((v, k) => {
                headerObj[k] = v.value as string;
              });
            }

            const options = {
              hostname: urlObj.hostname,
              port: urlObj.port || (urlStr.startsWith('https') ? 443 : 80),
              path: urlObj.pathname + urlObj.search,
              method: 'POST',
              headers: headerObj
            };

            const req = client.request(options, (res: any) => {
              let data = '';
              res.on('data', (chunk: string) => { data += chunk; });
              res.on('end', () => {
                resolve({
                  type: 'object',
                  value: null,
                  properties: new Map([
                    ['status', { type: 'number', value: res.statusCode }],
                    ['body', { type: 'string', value: data }]
                  ])
                });
              });
            });
            req.on('error', (err: Error) => reject(err));
            req.write(bodyStr);
            req.end();
          })
        };
      }
    });

    this.globals.define('fetch', {
      type: 'function',
      value: (url: SeedValue, options?: SeedValue): SeedValue => {
        return {
          type: 'promise',
          value: fetch(url.value as string, options ? {
            method: options.properties?.get('method')?.value || 'GET',
            headers: options.properties?.get('headers')?.value,
            body: options.properties?.get('body')?.value
          } : undefined).then(res => ({
            type: 'object',
            value: null,
            properties: new Map([
              ['status', { type: 'number', value: res.status }],
              ['ok', { type: 'boolean', value: res.ok }],
              ['json', { type: 'function', value: () => res.json().then((data: any) => this.jsToSeedValue(data)) }],
              ['text', { type: 'function', value: () => res.text().then((data: string) => ({ type: 'string', value: data })) }]
            ])
          }))
        };
      }
    });

    this.globals.define('jsonRequest', {
      type: 'function',
      value: (url: SeedValue): SeedValue => {
        return {
          type: 'promise',
          value: fetch(url.value as string)
            .then(async (res) => {
              const text = await res.text();
              if (!res.ok) {
                const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
                throw new Error(
                  `jsonRequest failed: HTTP ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ''}`
                );
              }
              try {
                return JSON.parse(text) as unknown;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`jsonRequest: response is not valid JSON (${msg})`);
              }
            })
            .then(data => this.jsToSeedValue(data))
        };
      }
    });
  }

  private setupDatabaseBuiltins(): void {
    const fs = require('fs');
    const path = require('path');

    const dbPath = path.join(process.cwd(), '.seedlang_db');

    const loadDB = (): Record<string, any> => {
      try {
        if (fs.existsSync(dbPath)) {
          return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        }
      } catch (e) {
        console.warn('[Seed] Failed to read or parse .seedlang_db; using empty store.', e);
      }
      return {};
    };

    const saveDB = (data: Record<string, any>): void => {
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    };

    this.globals.define('dbSet', {
      type: 'function',
      value: (key: SeedValue, value: SeedValue): SeedValue => {
        if (key.type !== 'string') throw new RuntimeError('dbSet() requires string key');
        const keyStr = key.value as string;
        if (keyStr.includes('\0') || keyStr.length === 0 || keyStr.length > 256) {
          throw new RuntimeError('dbSet() key must be 1-256 chars, no null bytes');
        }
        const db = loadDB();
        db[keyStr] = this.seedValueToJS(value);
        saveDB(db);
        return { type: 'boolean', value: true };
      }
    });

    this.globals.define('dbGet', {
      type: 'function',
      value: (key: SeedValue): SeedValue => {
        if (key.type !== 'string') throw new RuntimeError('dbGet() requires string key');
        const db = loadDB();
        const val = db[key.value as string];
        return val !== undefined ? this.jsToSeedValue(val) : { type: 'null', value: null };
      }
    });

    this.globals.define('dbDelete', {
      type: 'function',
      value: (key: SeedValue): SeedValue => {
        if (key.type !== 'string') throw new RuntimeError('dbDelete() requires string key');
        const db = loadDB();
        delete db[key.value as string];
        saveDB(db);
        return { type: 'boolean', value: true };
      }
    });

    this.globals.define('dbKeys', {
      type: 'function',
      value: (): SeedValue => {
        const db = loadDB();
        return { type: 'array', value: Object.keys(db).map(k => ({ type: 'string', value: k })) };
      }
    });

    this.globals.define('dbClear', {
      type: 'function',
      value: (): SeedValue => {
        saveDB({});
        return { type: 'boolean', value: true };
      }
    });

    this.globals.define('dbHas', {
      type: 'function',
      value: (key: SeedValue): SeedValue => {
        const db = loadDB();
        return { type: 'boolean', value: key.value as string in db };
      }
    });
  }

  private setupGUIBuiltins(): void {
    this.globals.define('gui', {
      type: 'object',
      value: null,
      properties: new Map([
        ['alert', {
          type: 'function',
          value: (message: SeedValue): SeedValue => {
            console.log(`\n[ALERT] ${message.value}\n`);
            return { type: 'null', value: null };
          }
        }],
        ['prompt', {
          type: 'function',
          value: (message: SeedValue, defaultValue?: SeedValue): SeedValue => {
            console.log(`[PROMPT] ${message.value}`);
            return defaultValue || { type: 'string', value: '' };
          }
        }],
        ['confirm', {
          type: 'function',
          value: (message: SeedValue): SeedValue => {
            console.log(`[CONFIRM] ${message.value} (y/n)`);
            return { type: 'boolean', value: true };
          }
        }],
        ['log', {
          type: 'function',
          value: (...args: SeedValue[]): SeedValue => {
            console.log(...args.map(a => a.value));
            return { type: 'null', value: null };
          }
        }],
        ['clear', {
          type: 'function',
          value: (): SeedValue => {
            console.clear();
            return { type: 'null', value: null };
          }
        }],
        ['table', {
          type: 'function',
          value: (data: SeedValue): SeedValue => {
            if (data.type === 'array') {
              console.table((data.value as SeedValue[]).map((v: SeedValue) => v.value));
            } else if (data.type === 'object' && data.properties) {
              const obj: Record<string, any> = {};
              data.properties.forEach((v, k) => { obj[k] = v.value; });
              console.table(obj);
            }
            return { type: 'null', value: null };
          }
        }],
        ['progress', {
          type: 'function',
          value: (current: SeedValue, total: SeedValue, label?: SeedValue): SeedValue => {
            const percent = Math.round(((current.value as number) / (total.value as number)) * 100);
            const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
            const labelText = label ? label.value : 'Progress';
            console.log(`${labelText}: [${bar}] ${percent}%`);
            return { type: 'null', value: null };
          }
        }]
      ])
    });

    this.globals.define('color', {
      type: 'function',
      value: (r: SeedValue, g: SeedValue, b: SeedValue, a?: SeedValue): SeedValue => {
        const rv = r.value as number;
        const gv = g.value as number;
        const bv = b.value as number;
        const av = a ? a.value as number : 1;
        return {
          type: 'object',
          value: null,
          properties: new Map([
            ['r', { type: 'number', value: rv }],
            ['g', { type: 'number', value: gv }],
            ['b', { type: 'number', value: bv }],
            ['a', { type: 'number', value: av }],
            ['hex', { type: 'string', value: `#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}` }],
            ['rgb', { type: 'string', value: `rgb(${rv}, ${gv}, ${bv})` }],
            ['rgba', { type: 'string', value: `rgba(${rv}, ${gv}, ${bv}, ${av})` }]
          ])
        };
      }
    });

    this.globals.define('vector', {
      type: 'function',
      value: (x: SeedValue, y: SeedValue, z?: SeedValue): SeedValue => {
        return {
          type: 'object',
          value: null,
          properties: new Map([
            ['x', { type: 'number', value: x.value as number }],
            ['y', { type: 'number', value: y.value as number }],
            ['z', { type: 'number', value: z ? z.value as number : 0 }],
            ['add', {
              type: 'function',
              value: (other: SeedValue): SeedValue => ({
                type: 'object',
                value: null,
                properties: new Map([
                  ['x', { type: 'number', value: (x.value as number) + (other.properties?.get('x')?.value as number || 0) }],
                  ['y', { type: 'number', value: (y.value as number) + (other.properties?.get('y')?.value as number || 0) }],
                  ['z', { type: 'number', value: (z ? z.value as number : 0) + (other.properties?.get('z')?.value as number || 0) }]
                ])
              })
            }],
            ['magnitude', {
              type: 'function',
              value: (): SeedValue => ({
                type: 'number',
                value: Math.sqrt(
                  Math.pow(x.value as number, 2) +
                  Math.pow(y.value as number, 2) +
                  Math.pow(z ? z.value as number : 0, 2)
                )
              })
            }]
          ])
        };
      }
    });
  }

  private jsToSeedValue(val: any): SeedValue {
    if (val === null || val === undefined) return { type: 'null', value: null };
    if (typeof val === 'string') return { type: 'string', value: val };
    if (typeof val === 'number') return { type: 'number', value: val };
    if (typeof val === 'boolean') return { type: 'boolean', value: val };
    if (Array.isArray(val)) return { type: 'array', value: val.map((v: any) => this.jsToSeedValue(v)) };
    if (typeof val === 'object') {
      const props = new Map<string, SeedValue>();
      Object.entries(val).forEach(([k, v]) => props.set(k, this.jsToSeedValue(v)));
      return { type: 'object', value: null, properties: props };
    }
    return { type: 'null', value: null };
  }

  private seedValueToJS(val: SeedValue): any {
    switch (val.type) {
      case 'null':
      case 'undefined':
        return null;
      case 'string':
      case 'number':
      case 'boolean':
        return val.value;
      case 'array':
        return (val.value as SeedValue[]).map(v => this.seedValueToJS(v));
      case 'object':
        if (!val.properties) return {};
        const obj: Record<string, any> = {};
        val.properties.forEach((v, k) => { obj[k] = this.seedValueToJS(v); });
        return obj;
      default:
        return null;
    }
  }

  interpret(program: ProgramNode): SeedValue[] {
    program = expandMacrosInProgram(program);
    const results: SeedValue[] = [];
    const expandedStmts = this.expandMacros(program.statements);
    this.skipInterpJitTier =
      this.interpJit !== null && !scanStatementsForInterpJitCandidates(expandedStmts);
    for (const stmt of expandedStmts) {
      results.push(this.executeStatement(stmt));
    }
    return results;
  }

  private expandMacros(stmts: StatementNode[]): StatementNode[] {
    const result: StatementNode[] = [];
    for (const stmt of stmts) {
      if (stmt.type === 'MacroDef') {
        const md = stmt as any;
        this.macroDefs.set(md.name, { params: md.params, body: md.body, procedural: false });
        continue;
      }
      if (stmt.type === 'ProcMacroDef') {
        const md = stmt as any;
        this.macroDefs.set(md.name, { params: md.params, body: md.body, procedural: true });
        continue;
      }
      result.push(stmt);
    }
    return result;
  }

  private executeStatement(stmt: StatementNode): SeedValue {
    switch (stmt.type) {
      case 'Declaration':
        return this.executeDeclaration(stmt as DeclarationStatement);
      case 'Question':
        return this.executeQuestion(stmt as QuestionStatement);
      case 'Action':
        return this.executeAction(stmt as ActionStatement);
      case 'Block':
        return this.executeBlock(stmt as BlockStatement);
      case 'If':
        return this.executeIf(stmt as IfStatement);
      case 'While':
        return this.executeWhile(stmt as WhileStatement);
      case 'For':
        return this.executeFor(stmt as ForStatement);
      case 'ForIn':
        return this.executeForIn(stmt as ForInStatement);
      case 'AsyncFunctionDef':
        return this.executeAsyncFunctionDef(stmt as AsyncFunctionDef);
      case 'FunctionDef':
        return this.executeFunctionDef(stmt as FunctionDef);
      case 'Return':
        return this.executeReturn(stmt as ReturnStatement);
      case 'Import':
        return this.executeImport(stmt as ImportStatement);
      case 'Export':
        return this.executeExport(stmt as ExportStatement);
      case 'ClassDef':
        return this.executeClassDef(stmt as ClassDef);
      case 'Break':
        throw new BreakException();
      case 'Continue':
        throw new ContinueException();
      case 'Try':
        return this.executeTry(stmt as TryStatement);
      case 'Throw':
        return this.executeThrow(stmt as ThrowStatement);
      case 'CoroutineDef':
        return this.executeCoroutineDef(stmt as CoroutineDef);
      case 'Yield':
        return this.executeYield(stmt as YieldStatement);
      case 'Switch':
        return this.executeSwitch(stmt as SwitchStatement);
      case 'VarDecl':
      case 'LetDecl': {
        const varDecl = stmt as any;
        const varName = varDecl.name;
        const varValue: SeedValue = varDecl.value ? this.evaluate(varDecl.value) : { type: 'null' as const, value: null };
        this.environment.define(varName, varValue);
        return varValue;
      }
      case 'InterfaceDef':
        return this.executeInterfaceDef(stmt as InterfaceDef);
      case 'TypeAlias':
        return this.executeTypeAlias(stmt as TypeAlias);
      case 'WebDirective':
        // Compile-time metadata node; runtime executes it as a no-op.
        return { type: 'null', value: null };
      case 'WebDirectiveBlock':
        return { type: 'null', value: null };
      case 'MacroDef':
      case 'ProcMacroDef':
        return { type: 'null', value: null };
      default:
        throw new RuntimeError(`Unknown statement type: ${stmt.type}`);
    }
  }

  private executeDeclaration(decl: DeclarationStatement): SeedValue {
    const prefix = decl.prefix.substring(1);

    switch (prefix) {
      case 's': {
        if (decl.verb && decl.object) {
          const verbName = decl.verb.name;
          
          switch (verbName) {
            case 'A':
              if (decl.object.type === 'Assignment') {
                const assign = decl.object as AssignmentExpression;
                const varName = (assign.target as Identifier).name;
                const value = this.evaluate(assign.value);
                this.environment.define(varName, value);
                return value;
              } else {
                const subjectValue = decl.subject ? this.evaluate(decl.subject) : undefined;
                const objectValue = this.evaluate(decl.object);
                this.environment.define(
                  this.extractIdentifier(subjectValue),
                  objectValue
                );
                return objectValue;
              }
            default:
              const objectValue = this.evaluate(decl.object);
              console.log(`${prefix}: ${verbName} -> ${this.stringify(objectValue)}`);
              return objectValue;
          }
        }
        const subjectValue = decl.subject ? this.evaluate(decl.subject) : undefined;
        return subjectValue || { type: 'null', value: null };
      }
      case 'w': {
        if (decl.subject) {
          this.evaluate(decl.subject);
          if (decl.verb && decl.object) {
            const content = this.evaluate(decl.object);
            this.output.push(this.stringify(content));
            console.log(this.stringify(content));
          }
        }
        return { type: 'null', value: null };
      }
      case 'o': {
        if (decl.subject) {
          return this.evaluate(decl.subject);
        }
        return { type: 'null', value: null };
      }
      case 'c': {
        if (decl.verb && decl.object) {
          return this.evaluate(decl.object);
        }
        return { type: 'null', value: null };
      }
      default:
        if (decl.subject) {
          return this.evaluate(decl.subject);
        }
        return { type: 'null', value: null };
    }
  }

  private executeQuestion(question: QuestionStatement): SeedValue {
    const condition = this.evaluate(question.condition);

    if (this.isTruthy(condition)) {
      if (question.thenBranch && question.thenBranch.length > 0) {
        const previousEnv = this.environment;
        this.environment = new Environment(previousEnv);
        try {
          for (const stmt of question.thenBranch) {
            this.executeStatement(stmt);
          }
        } finally {
          this.environment = previousEnv;
        }
      }
    } else if (question.elseBranch && question.elseBranch.length > 0) {
      const previousEnv = this.environment;
      this.environment = new Environment(previousEnv);
      try {
        for (const stmt of question.elseBranch) {
          this.executeStatement(stmt);
        }
      } finally {
        this.environment = previousEnv;
      }
    }

    return condition;
  }

  private executeAction(action: ActionStatement): SeedValue {
    switch (action.action) {
      case 'expr':
        if (action.target) return this.evaluate(action.target);
        break;
    }
    return { type: 'null', value: null };
  }

  private executeTry(tryStmt: TryStatement): SeedValue {
    try {
      let result: SeedValue = { type: 'null', value: null };
      for (const stmt of tryStmt.body) {
        result = this.executeStatement(stmt);
      }
      return result;
    } catch (e) {
      if (tryStmt.catchClause) {
        if (tryStmt.catchClause.param) {
          this.environment.define(tryStmt.catchClause.param, {
            type: 'string',
            value: e instanceof Error ? e.message : String(e)
          });
        }
        let result: SeedValue = { type: 'null', value: null };
        for (const stmt of tryStmt.catchClause.body) {
          result = this.executeStatement(stmt);
        }
        return result;
      }
      throw e;
    }
  }

  private executeSwitch(switchStmt: SwitchStatement): SeedValue {
    const switchValue = this.evaluate(switchStmt.expression);
    let result: SeedValue = { type: 'null', value: null };

    for (const caseClause of switchStmt.cases) {
      const caseValue = this.evaluate(caseClause.value);
      if (this.valuesEqual(switchValue, caseValue)) {
        try {
          for (const stmt of caseClause.body) {
            result = this.executeStatement(stmt);
          }
        } catch (e) {
          if (e instanceof BreakException) {
            return result;
          }
          throw e;
        }
        return result;
      }
    }

    if (switchStmt.defaultCase) {
      try {
        for (const stmt of switchStmt.defaultCase) {
          result = this.executeStatement(stmt);
        }
      } catch (e) {
        if (e instanceof BreakException) {
          return result;
        }
        throw e;
      }
    }

    return result;
  }

  private executeInterfaceDef(interfaceDef: InterfaceDef): SeedValue {
    const interfaceValue: SeedValue = {
      type: 'class',
      value: interfaceDef.name,
      properties: new Map([
        ['__interface__', { type: 'boolean', value: true }],
        ['__properties__', { type: 'array', value: interfaceDef.properties.map(p => ({ name: p.name, type: p.typeExpr })) }],
        ['__methods__', { type: 'array', value: interfaceDef.methods }]
      ])
    };

    this.classes.set(interfaceDef.name, interfaceDef);
    this.environment.define(interfaceDef.name, interfaceValue);
    return interfaceValue;
  }

  private executeTypeAlias(typeAlias: TypeAlias): SeedValue {
    const typeAliasValue: SeedValue = {
      type: 'object',
      value: {
        __typeAlias__: true,
        name: typeAlias.name,
        genericParams: typeAlias.genericParams || [],
        typeExpr: typeAlias.typeExpr
      },
      properties: new Map()
    };

    this.environment.define(typeAlias.name, typeAliasValue);
    return typeAliasValue;
  }

  private valuesEqual(a: SeedValue, b: SeedValue): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'number') return a.value === b.value || Math.abs((a.value as number) - (b.value as number)) < 0.0001;
    if (a.type === 'string') return a.value === b.value;
    if (a.type === 'boolean') return a.value === b.value;
    return a.value === b.value;
  }

  private executeBlock(block: BlockStatement): SeedValue {
    let result: SeedValue = { type: 'null', value: null };
    for (const stmt of block.statements) {
      result = this.executeStatement(stmt);
    }
    return result;
  }

  private executeIf(ifStmt: IfStatement): SeedValue {
    const condition = this.evaluate(ifStmt.condition);

    if (this.isTruthy(condition)) {
      const previousEnv = this.environment;
      this.environment = new Environment(previousEnv);
      let result: SeedValue = { type: 'null', value: null };
      try {
        for (const stmt of ifStmt.thenBranch) {
          result = this.executeStatement(stmt);
        }
      } finally {
        this.environment = previousEnv;
      }
      return result;
    } else if (ifStmt.elseBranch) {
      const previousEnv = this.environment;
      this.environment = new Environment(previousEnv);
      let result: SeedValue = { type: 'null', value: null };
      try {
        for (const stmt of ifStmt.elseBranch) {
          result = this.executeStatement(stmt);
        }
      } finally {
        this.environment = previousEnv;
      }
      return result;
    }

    return { type: 'null', value: null };
  }

  private executeWhile(whileStmt: WhileStatement): SeedValue {
    while (this.isTruthy(this.evaluate(whileStmt.condition))) {
      const previousEnv = this.environment;
      this.environment = new Environment(previousEnv);
      try {
        for (const stmt of whileStmt.body) {
          this.executeStatement(stmt);
        }
      } catch (e) {
        if (e instanceof BreakException) break;
        if (e instanceof ContinueException) continue;
        throw e;
      } finally {
        this.environment = previousEnv;
      }
    }
    return { type: 'null', value: null };
  }

  private executeFor(forStmt: ForStatement): SeedValue {
    const previousEnv = this.environment;
    this.environment = new Environment(previousEnv);

    try {
      if (forStmt.init) this.executeStatement(forStmt.init);

      while (forStmt.condition ? this.isTruthy(this.evaluate(forStmt.condition)) : true) {
        try {
          for (const stmt of forStmt.body) {
            this.executeStatement(stmt);
          }
        } catch (e) {
          if (e instanceof BreakException) return { type: 'null', value: null };
          if (e instanceof ContinueException) { /* continue to update */ }
          else throw e;
        }
        if (forStmt.update) this.executeStatement(forStmt.update);
      }
    } finally {
      this.environment = previousEnv;
    }

    return { type: 'null', value: null };
  }

  private executeForIn(forInStmt: ForInStatement): SeedValue {
    const iterable = this.evaluate(forInStmt.iterable);
    let values: SeedValue[] = [];

    if (iterable.type === 'array') {
      values = iterable.value as SeedValue[];
    } else if (iterable.type === 'string') {
      values = Array.from(iterable.value as string).map((ch) => ({ type: 'string' as const, value: ch }));
    } else if (iterable.type === 'object') {
      values = Object.keys(iterable.value || {}).map((k) => ({ type: 'string' as const, value: k }));
    } else {
      throw new RuntimeError(`Cannot iterate over type: ${iterable.type}`);
    }

    const previousEnv = this.environment;
    this.environment = new Environment(previousEnv);
    try {
      for (const item of values) {
        this.environment.define(forInStmt.variable, item);
        try {
          for (const stmt of forInStmt.body) {
            this.executeStatement(stmt);
          }
        } catch (e) {
          if (e instanceof BreakException) break;
          if (e instanceof ContinueException) continue;
          throw e;
        }
      }
    } finally {
      this.environment = previousEnv;
    }

    return { type: 'null', value: null };
  }

  private executeThrow(throwStmt: ThrowStatement): SeedValue {
    const value = this.evaluate(throwStmt.value);
    throw new RuntimeError(this.stringify(value));
  }

  private executeCoroutineDef(coroDef: CoroutineDef): SeedValue {
    const closureEnv = this.environment;
    const self = this;

    const generatorFactory = function* (...callArgs: SeedValue[]): Generator<SeedValue, SeedValue, SeedValue> {
      const funcEnv = new Environment(closureEnv);
      for (let i = 0; i < coroDef.params.length; i++) {
        funcEnv.define(coroDef.params[i], callArgs[i] || { type: 'null', value: null });
      }
      const previousEnv = self.environment;
      self.environment = funcEnv;
      try {
        for (const stmt of coroDef.body) {
          try {
            self.executeStatement(stmt);
          } catch (e) {
            if (e instanceof YieldSignal) {
              yield e.value as SeedValue;
            } else if (e instanceof ReturnSignal) {
              return e.value;
            } else {
              throw e;
            }
          }
        }
      } finally {
        self.environment = previousEnv;
      }
      return { type: 'null', value: null };
    };

    const coroFn: SeedValue = {
      type: 'function',
      value: (...callArgs: SeedValue[]) => {
        const gen = generatorFactory(...callArgs);
        const coro: SeedValue = {
          type: 'coroutine',
          value: null,
          generator: gen,
          state: 'suspended',
          done: false
        };
        return coro;
      }
    };

    this.functions.set(coroDef.name, coroFn);
    this.environment.define(coroDef.name, coroFn);
    return coroFn;
  }

  private executeYield(yieldStmt: YieldStatement): SeedValue {
    const value: SeedValue = yieldStmt.value ? this.evaluate(yieldStmt.value) : { type: 'null', value: null };
    throw new YieldSignal(value);
  }

  private executeAsyncFunctionDef(fnDef: AsyncFunctionDef): SeedValue {
    const closureEnv = this.environment;
    
    const asyncFn: SeedValue = {
      type: 'function',
      value: (...args: SeedValue[]): SeedValue => {
        return new Promise<SeedValue>((resolve, reject) => {
          setTimeout(() => {
            try {
              const previousEnv = this.environment;
              const funcEnv = new Environment(closureEnv);

              for (let i = 0; i < fnDef.params.length; i++) {
                funcEnv.define(fnDef.params[i] || '', args[i] || { type: 'null', value: null });
              }

              this.environment = funcEnv;
              let result: SeedValue = { type: 'null', value: null };
              try {
                for (const stmt of fnDef.body) {
                  result = this.executeStatement(stmt);
                }
              } catch (e) {
                if (e instanceof ReturnSignal) {
                  resolve(e.value);
                  return;
                }
                reject(e);
                return;
              } finally {
                this.environment = previousEnv;
              }

              resolve(result);
            } catch (e) {
              reject(e);
            }
          }, 0);
        }) as any;
      },
      params: fnDef.params,
      closure: closureEnv
    };

    this.functions.set(fnDef.name || '', asyncFn);
    this.environment.define(fnDef.name || '', asyncFn);
    return asyncFn;
  }

  private executeFunctionDef(fnDef: FunctionDef): SeedValue {
    const closureEnv = this.environment;
    
    if (fnDef.genericParams && fnDef.genericParams.length > 0) {
      const genericFn: SeedValue = {
        type: 'genericFunction',
        name: fnDef.name,
        genericParams: fnDef.genericParams,
        definition: fnDef,
        closure: closureEnv,
        value: null,
        instantiate: (typeArgs: Map<string, SeedValue>) => {
          return this.instantiateGenericFunction(fnDef, typeArgs, closureEnv);
        }
      };
      this.functions.set(fnDef.name, genericFn);
      this.environment.define(fnDef.name, genericFn);
      return genericFn;
    }
    
    const fn: SeedValue = {
      type: 'function',
      value: (...args: SeedValue[]) => {
        const previousEnv = this.environment;
        const funcEnv = new Environment(closureEnv);
        for (let i = 0; i < fnDef.params.length; i++) {
          funcEnv.define(fnDef.params[i], args[i] || { type: 'null', value: null });
        }

        if (previousEnv && previousEnv.has('this')) {
          funcEnv.define('this', previousEnv.get('this'));
        }

        this.environment = funcEnv;
        let result: SeedValue = { type: 'null', value: null };
        try {
          for (const stmt of fnDef.body) {
            result = this.executeStatement(stmt);
          }
        } catch (e) {
          if (e instanceof ReturnSignal) {
            return e.value;
          }
          throw e;
        } finally {
          this.environment = previousEnv;
        }

        return result;
      },
      params: fnDef.params,
      closure: closureEnv
    };

    this.functions.set(fnDef.name, fn);
    this.environment.define(fnDef.name, fn);
    return fn;
  }
  
  private instantiateGenericFunction(fnDef: FunctionDef, typeArgs: Map<string, SeedValue>, closureEnv: Environment): SeedValue {
    const fn: SeedValue = {
      type: 'function',
      value: (...args: SeedValue[]) => {
        const previousEnv = this.environment;
        const funcEnv = new Environment(closureEnv);

        for (const [name, value] of typeArgs) {
          funcEnv.define(name, value);
        }

        for (let i = 0; i < fnDef.params.length; i++) {
          funcEnv.define(fnDef.params[i], args[i] || { type: 'null', value: null });
        }

        this.environment = funcEnv;
        let result: SeedValue = { type: 'null', value: null };
        try {
          for (const stmt of fnDef.body) {
            result = this.executeStatement(stmt);
          }
        } catch (e) {
          if (e instanceof ReturnSignal) {
            return e.value;
          }
          throw e;
        } finally {
          this.environment = previousEnv;
        }

        return result;
      },
      params: fnDef.params,
      closure: closureEnv,
      typeArgs: Object.fromEntries(typeArgs)
    };
    return fn;
  }
  private executeReturn(returnStmt: ReturnStatement): SeedValue {
    const value: SeedValue = returnStmt.value ? this.evaluate(returnStmt.value) : { type: 'null' as const, value: null };
    throw new ReturnSignal(value);
  }

  private executeImport(importStmt: ImportStatement): SeedValue {
    const fs = require('fs');
    const path = require('path');

    let modulePath = importStmt.module;
    if (!modulePath.endsWith('.seed')) {
      modulePath += '.seed';
    }

    try {
      const fullPath = path.resolve(modulePath);
      if (!fs.existsSync(fullPath)) {
        throw new RuntimeError(`Module not found: ${fullPath}`);
      }

      const source = fs.readFileSync(fullPath, 'utf-8');
      const { parse } = require('./parser');
      const program = parse(source);

      const moduleEnv = new Environment(this.globals);
      const previousEnv = this.environment;
      this.environment = moduleEnv;

      let result: SeedValue = { type: 'null', value: null };
      for (const stmt of program.statements) {
        result = this.executeStatement(stmt);
      }

      this.environment = previousEnv;

      if (importStmt.items) {
        const moduleVars = moduleEnv.getAll();
        for (const item of importStmt.items) {
          if (moduleVars.has(item)) {
            this.environment.define(item, moduleEnv.get(item));
          }
        }
      }

      return result;
    } catch (e) {
      throw new RuntimeError(`Failed to import module '${importStmt.module}': ${(e as Error).message}`);
    }
  }

  private executeExport(exportStmt: ExportStatement): SeedValue {
    const value = this.executeStatement(exportStmt.declaration);
    console.log(`Exported: ${this.stringify(value)}`);
    return value;
  }

  private executeClassDef(classDef: ClassDef): SeedValue {
    const classValue: SeedValue = {
      type: 'class',
      value: classDef.name,
      properties: new Map(),
      superClass: classDef.superClass
    };

    if (classDef.superClass) {
      const parentClassValue = this.environment.get(classDef.superClass);
      if (parentClassValue.type === 'class' && parentClassValue.properties) {
        for (const [key, val] of parentClassValue.properties) {
          if (!classValue.properties!.has(key)) {
            classValue.properties!.set(key, val);
          }
        }
      }
    }

    for (const prop of classDef.properties) {
      const propValue: SeedValue = prop.value ? this.evaluate(prop.value) : { type: 'null' as const, value: null };
      classValue.properties!.set(prop.name, propValue);
    }

    for (const method of classDef.methods) {
      const methodFn = this.executeFunctionDef(method);
      classValue.properties!.set(method.name, methodFn);
    }

    this.classes.set(classDef.name, classDef);
    this.environment.define(classDef.name, classValue);
    return classValue;
  }

  private evaluateNoJit(expr: ExpressionNode): SeedValue {
    if (expr.type === 'Assignment') {
      return this.evaluateAssignmentCore(expr as AssignmentExpression);
    }
    return this.expressionDispatchCore(expr);
  }

  private jitBindings(): InterpreterJitBindings {
    if (!this.jitBindingsCache) {
      this.jitBindingsCache = {
        envGet: (name) => this.environment.get(name),
        assignIdentifier: (name, val) => {
          if (this.environment.has(name)) {
            this.environment.assign(name, val as SeedValue);
          } else {
            this.environment.define(name, val as SeedValue);
          }
        },
        evalSlow: (e) => this.evaluateNoJit(e),
        isTruthy: (v) => this.isTruthy(v as SeedValue),
        equalValues: (a, b) => this.isEqual(a as SeedValue, b as SeedValue),
      };
    }
    return this.jitBindingsCache;
  }

  private evaluate(expr: ExpressionNode): SeedValue {
    if (expr.type === 'Assignment') {
      const assign = expr as AssignmentExpression;
      if (this.interpJit && !this.skipInterpJitTier && expressionEligibleForInterpJit(assign.value)) {
        try {
          const hit = this.interpJit.tryAssignment(this.jitBindings(), assign);
          if (hit !== INTERP_JIT_MISS) return hit as SeedValue;
        } catch (e: any) {
          if (e instanceof InterpreterJitRuntimeError) {
            throw new RuntimeError(e.message);
          }
          throw e;
        }
      }
      return this.evaluateAssignmentCore(assign);
    }

    if (this.interpJit && !this.skipInterpJitTier && expressionEligibleForInterpJit(expr)) {
      try {
        const hit = this.interpJit.tryExpr(this.jitBindings(), expr);
        if (hit !== INTERP_JIT_MISS) return hit as SeedValue;
      } catch (e: any) {
        if (e instanceof InterpreterJitRuntimeError) {
          throw new RuntimeError(e.message);
        }
        throw e;
      }
    }

    return this.expressionDispatchCore(expr);
  }

  private expressionDispatchCore(expr: ExpressionNode): SeedValue {
    switch (expr.type) {
      case 'NounRef':
        return this.evaluateNounRef(expr as NounReference);
      case 'TextLiteral':
        return { type: 'string', value: (expr as TextLiteral).value };
      case 'NumberLiteral':
        return { type: 'number', value: (expr as NumberLiteral).value };
      case 'BooleanLiteral':
        return { type: 'boolean', value: (expr as any).value };
      case 'NullLiteral':
        return { type: 'null', value: null };
      case 'ArrowFunction':
        return this.evaluateArrowFunction(expr as any);
      case 'BinaryOp':
        return this.evaluateBinary(expr as BinaryExpression);
      case 'Call':
        return this.evaluateCall(expr as CallExpression);
      case 'GenericCall':
        return this.evaluateGenericCall(expr as GenericCallExpression);
      case 'SuperCallExpression':
        return this.evaluateSuperCall(expr as SuperCallExpression);
      case 'ObjectLiteral':
        return this.evaluateObject(expr as ObjectLiteral);
      case 'ArrayLiteral':
        return this.evaluateArray(expr as ArrayLiteral);
      case 'Member':
        return this.evaluateMember(expr as MemberExpression);
      case 'Logical':
        return this.evaluateLogical(expr as LogicalExpression);
      case 'Conditional':
        return this.evaluateConditional(expr as ConditionalExpression);
      case 'Await':
        return this.evaluateAwait(expr as AwaitExpression);
      case 'Unary':
        return this.evaluateUnary(expr as UnaryExpression);
      case 'Identifier':
        return this.evaluateIdentifier(expr as Identifier);
      case 'Block':
        return this.evaluateBlock(expr as any);
      case 'Match':
        return this.evaluateMatch(expr as any);
      case 'YieldExpr':
        return this.evaluateYieldExpr(expr as YieldExpression);
      case 'MacroCall':
        return this.evaluateMacroCall(expr as MacroCall);
      default:
        throw new RuntimeError(`Unknown expression type: ${(expr as any).type}`);
    }
  }

  private evaluateSuperCall(superCall: SuperCallExpression): SeedValue {
    const thisValue = this.environment.get('this');
    if (!thisValue || thisValue.type !== 'instance') {
      throw new RuntimeError('super can only be used inside a class method');
    }
    const args = superCall.args.map(arg => this.evaluate(arg));
    const methodName = (superCall as any).method || 'init';
    let currentClassName = thisValue.superClass;
    while (currentClassName) {
      const classValue = this.environment.get(currentClassName);
      if (classValue.type === 'class' && classValue.properties) {
        const method = classValue.properties.get(methodName);
        if (method && method.type === 'function') {
          const previousEnv = this.environment;
          const methodEnv = new Environment(this.globals);
          methodEnv.define('this', thisValue);
          this.environment = methodEnv;
          try {
            return method.value(...args);
          } catch (e) {
            if (e instanceof ReturnSignal) return e.value;
            throw e;
          } finally {
            this.environment = previousEnv;
          }
        }
      }
      currentClassName = classValue.superClass;
    }
    throw new RuntimeError(`No super method '${methodName}' found`);
  }

  private evaluateYieldExpr(yieldExpr: YieldExpression): SeedValue {
    const value: SeedValue = yieldExpr.value ? this.evaluate(yieldExpr.value) : { type: 'null', value: null };
    throw new YieldSignal(value);
  }

  private evaluateMacroCall(macroCall: MacroCall): SeedValue {
    const macro = this.macroDefs.get(macroCall.name);
    if (!macro) throw new RuntimeError(`Undefined macro: ${macroCall.name}`);

    if (macro.procedural) {
      const macroEnv = new Environment(this.globals);
      for (let i = 0; i < macro.params.length; i++) {
        macroEnv.define(macro.params[i], macroCall.args[i] ? this.evaluate(macroCall.args[i]) : { type: 'null', value: null });
      }
      const previousEnv = this.environment;
      this.environment = macroEnv;
      let macroResult: SeedValue = { type: 'null', value: null };
      try {
        for (const stmt of macro.body) {
          try {
            this.executeStatement(stmt);
          } catch (e) {
            if (e instanceof ReturnSignal) {
              macroResult = e.value;
              break;
            }
            throw e;
          }
        }
      } finally {
        this.environment = previousEnv;
      }

      if (macroResult.type === 'object' && macroResult.properties) {
        const nodeType = macroResult.properties.get('type')?.value;
        if (nodeType === 'NumberLiteral') {
          const val = macroResult.properties.get('value');
          return val || { type: 'number', value: 0 };
        }
        if (nodeType === 'StringLiteral') {
          const val = macroResult.properties.get('value');
          return val || { type: 'string', value: '' };
        }
        if (nodeType === 'Identifier') {
          const name = macroResult.properties.get('name');
          if (name) {
            try { return this.environment.get(name.value as string); }
            catch { return name; }
          }
        }
        if (nodeType === 'BinaryOp') {
          const op = macroResult.properties.get('operator')?.value;
          const left = macroResult.properties.get('left');
          const right = macroResult.properties.get('right');
          if (left && right && op) {
            const leftVal = this.evaluateMacroResultNode(left);
            const rightVal = this.evaluateMacroResultNode(right);
            return this.evaluateBinaryOp(op, leftVal, rightVal);
          }
        }
        if (nodeType === 'Unary') {
          const op = macroResult.properties.get('operator')?.value;
          const operand = macroResult.properties.get('operand');
          if (operand && op) {
            const val = this.evaluateMacroResultNode(operand);
            if (op === '-') return { type: 'number', value: -val.value };
            if (op === '!') return { type: 'boolean', value: !val.value };
          }
        }
      }
      return macroResult;
    }

    const argValues = macroCall.args.map(a => this.evaluate(a));
    const macroEnv = new Environment(this.globals);
    for (let i = 0; i < macro.params.length; i++) {
      macroEnv.define(macro.params[i], argValues[i] || { type: 'null', value: null });
    }
    const previousEnv = this.environment;
    this.environment = macroEnv;
    let result: SeedValue = { type: 'null', value: null };
    try {
      for (const stmt of macro.body) {
        try {
          result = this.executeStatement(stmt);
        } catch (e) {
          if (e instanceof ReturnSignal) { result = e.value; break; }
          throw e;
        }
      }
    } finally {
      this.environment = previousEnv;
    }
    return result;
  }

  private evaluateMacroResultNode(node: SeedValue): SeedValue {
    if (node.type === 'number') return node;
    if (node.type === 'string') return node;
    if (node.type === 'object' && node.properties) {
      const nodeType = node.properties.get('type')?.value;
      if (nodeType === 'NumberLiteral') return node.properties.get('value') || { type: 'number', value: 0 };
      if (nodeType === 'Identifier') {
        const name = node.properties.get('name')?.value;
        if (name) {
          try { return this.environment.get(name as string); }
          catch { return { type: 'number', value: 0 }; }
        }
      }
      if (nodeType === 'BinaryOp') {
        const op = node.properties.get('operator')?.value;
        const left = node.properties.get('left');
        const right = node.properties.get('right');
        if (left && right && op) {
          return this.evaluateBinaryOp(op, this.evaluateMacroResultNode(left), this.evaluateMacroResultNode(right));
        }
      }
    }
    return node;
  }

  private evaluateBinaryOp(op: string, left: SeedValue, right: SeedValue): SeedValue {
    switch (op) {
      case '+': return { type: typeof left.value === 'string' || typeof right.value === 'string' ? 'string' : 'number', value: left.value + right.value };
      case '-': return { type: 'number', value: left.value - right.value };
      case '*': return { type: 'number', value: left.value * right.value };
      case '/': return { type: 'number', value: right.value !== 0 ? left.value / right.value : 0 };
      case '%': return { type: 'number', value: left.value % right.value };
      case '<': return { type: 'boolean', value: left.value < right.value };
      case '>': return { type: 'boolean', value: left.value > right.value };
      case '<=': return { type: 'boolean', value: left.value <= right.value };
      case '>=': return { type: 'boolean', value: left.value >= right.value };
      case '==': return { type: 'boolean', value: left.value === right.value };
      case '!=': return { type: 'boolean', value: left.value !== right.value };
      default: return { type: 'number', value: 0 };
    }
  }

  private evaluateBlock(block: { statements: StatementNode[] }): SeedValue {
    let result: SeedValue = { type: 'null', value: null };
    for (const stmt of block.statements) {
      result = this.executeStatement(stmt);
    }
    return result;
  }

  private evaluateMatch(match: any): SeedValue {
    const value = this.evaluate(match.expression);
    
    for (const case_ of match.cases) {
      const bindings = this.matchPattern(case_.pattern, value);
      if (bindings !== null) {
        if (case_.guard) {
          const guardResult = this.evaluate(case_.guard);
          if (!this.isTruthy(guardResult)) {
            continue;
          }
        }
        
        const previousEnv = this.environment;
        this.environment = new Environment(this.environment);
        
        for (const [name, boundValue] of Object.entries(bindings)) {
          this.environment.define(name, boundValue as SeedValue);
        }
        
        let result: SeedValue = { type: 'null', value: null };
        for (const stmt of case_.body) {
          result = this.executeStatement(stmt);
        }
        
        this.environment = previousEnv;
        return result;
      }
    }
    
    throw new RuntimeError('No matching pattern found');
  }

  private matchPattern(pattern: any, value: SeedValue): Record<string, SeedValue> | null {
    switch (pattern.kind) {
      case 'wildcard':
        return {};
        
      case 'literal':
        const literalType = this.getTypeName(pattern.value) as SeedValue['type'];
        if (this.isEqual(value, { type: literalType, value: pattern.value })) {
          return {};
        }
        return null;
        
      case 'identifier':
        return { [pattern.name]: value };
        
      case 'range':
        if (value.type === 'number') {
          const num = value.value as number;
          if (num >= pattern.start && num <= pattern.end) {
            return {};
          }
        }
        return null;
        
      case 'or':
        for (const p of pattern.patterns) {
          const result = this.matchPattern(p, value);
          if (result !== null) {
            return result;
          }
        }
        return null;
        
      case 'array':
        if (value.type !== 'array') return null;
        const arr = value.value as SeedValue[];
        if (arr.length !== pattern.elements.length) return null;
        
        const bindings: Record<string, SeedValue> = {};
        for (let i = 0; i < pattern.elements.length; i++) {
          const result = this.matchPattern(pattern.elements[i], arr[i]);
          if (result === null) return null;
          Object.assign(bindings, result);
        }
        return bindings;
        
      case 'object':
        if (value.type !== 'object') return null;
        const obj = value.value as Map<string, SeedValue>;
        const objBindings: Record<string, SeedValue> = {};
        
        for (const prop of pattern.properties) {
          const propValue = obj.get(prop.key);
          if (propValue === undefined) {
            if (prop.default) {
              const defaultVal = this.evaluate(prop.default);
              Object.assign(objBindings, this.matchPattern(prop.pattern, defaultVal) || {});
              continue;
            }
            return null;
          }
          const result = this.matchPattern(prop.pattern, propValue);
          if (result === null) return null;
          Object.assign(objBindings, result);
        }
        
        if (pattern.rest) {
          const restObj = new Map<string, SeedValue>();
          for (const [key, val] of obj) {
            if (!pattern.properties.find((p: any) => p.key === key)) {
              restObj.set(key, val);
            }
          }
          objBindings[pattern.rest] = { type: 'object', value: restObj };
        }
        
        return objBindings;
        
      case 'type':
        const typeName = this.getTypeName(value.value);
        if (typeName === pattern.typeName || value.type === pattern.typeName) {
          if (pattern.pattern) {
            return this.matchPattern(pattern.pattern, value);
          }
          return {};
        }
        return null;
        
      default:
        return null;
    }
  }

  private getTypeName(value: any): string {
    if (value === null) return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Map) return 'object';
    return typeof value;
  }

  private evaluateNounRef(ref: NounReference): SeedValue {
    if (this.nounStore.has(ref.index)) {
      return this.nounStore.get(ref.index)!;
    }
    return { type: 'null', value: null };
  }

  private evaluateBinary(bin: BinaryExpression): SeedValue {
    const left = this.evaluate(bin.left);
    const right = this.evaluate(bin.right);

    switch (bin.operator) {
      case '+':
        if (left.type === 'string' || right.type === 'string') {
          return { type: 'string', value: this.stringify(left) + this.stringify(right) };
        }
        return { type: 'number', value: (left.value as number) + (right.value as number) };
      case '-':
        return { type: 'number', value: (left.value as number) - (right.value as number) };
      case '*':
        return { type: 'number', value: (left.value as number) * (right.value as number) };
      case '/':
        if (right.value === 0) throw new RuntimeError('Division by zero');
        return { type: 'number', value: (left.value as number) / (right.value as number) };
      case '%':
        if (right.value === 0) throw new RuntimeError('Division by zero');
        return { type: 'number', value: (left.value as number) % (right.value as number) };
      case '==':
        return { type: 'boolean', value: this.isEqual(left, right) };
      case '!=':
        return { type: 'boolean', value: !this.isEqual(left, right) };
      case '<':
        if (left.type === 'string' && right.type === 'string') return { type: 'boolean', value: (left.value as string) < (right.value as string) };
        return { type: 'boolean', value: (left.value as number) < (right.value as number) };
      case '>':
        if (left.type === 'string' && right.type === 'string') return { type: 'boolean', value: (left.value as string) > (right.value as string) };
        return { type: 'boolean', value: (left.value as number) > (right.value as number) };
      case '<=':
        if (left.type === 'string' && right.type === 'string') return { type: 'boolean', value: (left.value as string) <= (right.value as string) };
        return { type: 'boolean', value: (left.value as number) <= (right.value as number) };
      case '>=':
        if (left.type === 'string' && right.type === 'string') return { type: 'boolean', value: (left.value as string) >= (right.value as string) };
        return { type: 'boolean', value: (left.value as number) >= (right.value as number) };
      case '&':
        return { type: 'number', value: (left.value as number) & (right.value as number) };
      case '|':
        return { type: 'number', value: (left.value as number) | (right.value as number) };
      case '^':
        return { type: 'number', value: (left.value as number) ^ (right.value as number) };
      case '<<':
        return { type: 'number', value: (left.value as number) << (right.value as number) };
      case '>>':
        return { type: 'number', value: (left.value as number) >> (right.value as number) };
      case '>>>':
        return { type: 'number', value: (left.value as number) >>> (right.value as number) };
      default:
        throw new RuntimeError(`Unknown binary operator: ${bin.operator}`);
    }
  }

  private evaluateCall(call: CallExpression): SeedValue {
    const callee = this.evaluate(call.callee);
    const args = call.args.map(arg => this.evaluate(arg));

    if (callee.type === 'class') {
      const instance: SeedValue = {
        type: 'instance',
        value: null,
        properties: new Map(),
        className: callee.value as string,
        superClass: callee.superClass
      };
      const initMethod = callee.properties!.get('init') || callee.properties!.get('__init__') || callee.properties!.get('constructor');
      if (initMethod && initMethod.type === 'function') {
        const previousEnv = this.environment;
        const methodEnv = new Environment(this.globals);
        methodEnv.define('this', instance);
        this.environment = methodEnv;
        try {
          initMethod.value(...args);
        } catch (e) {
          if (e instanceof ReturnSignal) { /* init return ignored */ }
          else throw e;
        } finally {
          this.environment = previousEnv;
        }
      }
      return instance;
    }

    if (callee.type === 'function') {
      try {
        const result = callee.value(...args);
        if (result instanceof Promise) {
          return { type: 'promise' as const, value: result };
        }
        return result as SeedValue;
      } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
    }

    throw new RuntimeError(`Cannot call non-function: ${callee.type}`);
  }
  
  private evaluateGenericCall(call: GenericCallExpression): SeedValue {
    const callee = this.evaluate(call.callee);
    
    if (callee.type !== 'genericFunction') {
      throw new RuntimeError(`Cannot use generic call syntax on non-generic function: ${callee.type}`);
    }
    
    const typeArgs = new Map<string, SeedValue>();
    for (let i = 0; i < call.typeArgs.length && i < callee.genericParams!.length; i++) {
      const typeArg = call.typeArgs[i];
      const paramName = callee.genericParams![i];
      
      if (typeArg.kind === 'named' && typeArg.typeArgs) {
        typeArgs.set(paramName, { 
          type: 'object', 
          value: typeArg.name,
          properties: new Map(typeArg.typeArgs.map((t: any, idx: number) => [`arg${idx}`, { type: 'string', value: t.name || 'unknown' }]))
        });
      } else {
        typeArgs.set(paramName, { 
          type: 'string', 
          value: (typeArg as any).name || 'unknown' 
        });
      }
    }
    
    const instantiatedFn = callee.instantiate!(typeArgs);
    const args = call.args.map(arg => this.evaluate(arg));
    
    try {
      const result = instantiatedFn.value(...args);
      if (result instanceof Promise) {
        return { type: 'promise' as const, value: result };
      }
      return result as SeedValue;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
  }

  private evaluateObject(obj: ObjectLiteral): SeedValue {
    const properties = new Map<string, SeedValue>();
    obj.properties.forEach((value, key) => {
      properties.set(key, this.evaluate(value));
    });
    return { type: 'object', value: null, properties };
  }

  private evaluateArray(arr: ArrayLiteral): SeedValue {
    const elements = arr.elements.map(el => this.evaluate(el));
    return { type: 'array', value: elements };
  }

  private evaluateMember(member: MemberExpression): SeedValue {
    const object = this.evaluate(member.object);
    
    let propertyValue: string | number;
    if (member.computed && typeof member.property !== 'string') {
      const propResult = this.evaluate(member.property as ExpressionNode);
      if (propResult.type === 'number') {
        propertyValue = propResult.value;
      } else if (propResult.type === 'string') {
        propertyValue = propResult.value;
      } else {
        propertyValue = String(propResult.value);
      }
    } else {
      propertyValue = member.property as string;
    }

    if (object.type === 'array') {
      const index = typeof propertyValue === 'number' ? propertyValue : parseInt(propertyValue as string);
      if (!isNaN(index)) {
        const effectiveIndex = index < 0 ? object.value.length + index : index;
        if (effectiveIndex >= 0 && effectiveIndex < object.value.length) {
          return object.value[effectiveIndex];
        }
      }
      if (propertyValue === 'length') {
        return { type: 'number', value: object.value.length };
      }
    }

    if (object.type === 'string') {
      const index = typeof propertyValue === 'number' ? propertyValue : parseInt(propertyValue as string);
      if (!isNaN(index)) {
        const effectiveIndex = index < 0 ? object.value.length + index : index;
        if (effectiveIndex >= 0 && effectiveIndex < object.value.length) {
          return { type: 'string', value: object.value[effectiveIndex] };
        }
      }
      if (propertyValue === 'length') {
        return { type: 'number', value: object.value.length };
      }
    }

    if (object.type === 'instance' && object.properties) {
      const propStr = String(propertyValue);
      if (object.properties.has(propStr)) {
        const prop = object.properties.get(propStr)!;
        if (prop.type === 'function') {
          const instance = object;
          const boundFn: SeedValue = {
            type: 'function',
            value: (...callArgs: SeedValue[]) => {
              const previousEnv = this.environment;
              const methodEnv = new Environment(this.globals);
              methodEnv.define('this', instance);
              this.environment = methodEnv;
              try {
                return prop.value(...callArgs);
              } catch (e) {
                if (e instanceof ReturnSignal) return e.value;
                throw e;
              } finally {
                this.environment = previousEnv;
              }
            },
            params: prop.params,
            closure: prop.closure
          };
          return boundFn;
        }
        return prop;
      }
      let currentClassName = object.className;
      while (currentClassName) {
        const classDef = this.classes.get(currentClassName);
        if (classDef && classDef.type === 'ClassDef') {
          const classValue = this.environment.get(currentClassName);
          if (classValue.type === 'class' && classValue.properties && classValue.properties.has(propStr)) {
            const method = classValue.properties.get(propStr)!;
            if (method.type === 'function') {
              const instance = object;
              const boundFn: SeedValue = {
                type: 'function',
                value: (...callArgs: SeedValue[]) => {
                  const previousEnv = this.environment;
                  const methodEnv = new Environment(this.globals);
                  methodEnv.define('this', instance);
                  this.environment = methodEnv;
                  try {
                    return method.value(...callArgs);
                  } catch (e) {
                    if (e instanceof ReturnSignal) return e.value;
                    throw e;
                  } finally {
                    this.environment = previousEnv;
                  }
                },
                params: method.params,
                closure: method.closure
              };
              return boundFn;
            }
            return method;
          }
        }
        const classValue = this.environment.get(currentClassName);
        currentClassName = classValue?.superClass;
      }
    }

    if (object.type === 'object' && object.properties) {
      const propStr = String(propertyValue);
      if (object.properties.has(propStr)) {
        return object.properties.get(propStr)!;
      }
    }

    return { type: 'null', value: null };
  }

  private evaluateAssignmentCore(assign: AssignmentExpression): SeedValue {
    const value = this.evaluate(assign.value);

    if (assign.target.type === 'Identifier') {
      const name = (assign.target as Identifier).name;
      if (this.environment.has(name)) {
        this.environment.assign(name, value);
      } else {
        this.environment.define(name, value);
      }
    } else if (assign.target.type === 'NounRef') {
      const index = (assign.target as NounReference).index;
      this.nounStore.set(index, value);
    } else if (assign.target.type === 'Member') {
      const member = assign.target as MemberExpression;
      const object = this.evaluate(member.object);
      
      let propertyValue: string;
      if (member.computed && typeof member.property !== 'string') {
        const propResult = this.evaluate(member.property as ExpressionNode);
        propertyValue = propResult.type === 'number' ? String(propResult.value) : String(propResult.value);
      } else {
        propertyValue = member.property as string;
      }
      
      if (object.type === 'array' && !isNaN(parseInt(propertyValue))) {
        const index = parseInt(propertyValue);
        if (index >= 0 && index < object.value.length) {
          object.value[index] = value;
        }
      } else if (object.type === 'instance' && object.properties) {
        object.properties.set(propertyValue, value);
      } else if (object.type === 'object' && object.properties) {
        object.properties.set(propertyValue, value);
      }
    }

    return value;
  }

  private evaluateArrowFunction(arrowFn: any): SeedValue {
    const closureEnv = this.environment;

    const fn: SeedValue = {
      type: 'function',
      value: (...args: SeedValue[]) => {
        const previousEnv = this.environment;
        const funcEnv = new Environment(closureEnv);

        for (let i = 0; i < arrowFn.params.length; i++) {
          funcEnv.define(arrowFn.params[i], args[i] || { type: 'null', value: null });
        }

        this.environment = funcEnv;
        try {
          return this.evaluate(arrowFn.body);
        } catch (e) {
          if (e instanceof ReturnSignal) return e.value;
          throw e;
        } finally {
          this.environment = previousEnv;
        }
      },
      params: arrowFn.params,
      closure: closureEnv
    };

    return fn;
  }

  private evaluateLogical(logical: LogicalExpression): SeedValue {
    const left = this.evaluate(logical.left);

    if (logical.operator === 'or') {
      if (this.isTruthy(left)) return left;
      return this.evaluate(logical.right);
    }

    if (logical.operator === 'and') {
      if (!this.isTruthy(left)) return left;
      return this.evaluate(logical.right);
    }

    throw new RuntimeError(`Unknown logical operator: ${logical.operator}`);
  }

  private evaluateConditional(cond: ConditionalExpression): SeedValue {
    if (this.isTruthy(this.evaluate(cond.condition))) {
      return this.evaluate(cond.consequent);
    }
    return this.evaluate(cond.alternate);
  }

  private evaluateAwait(awaitExpr: AwaitExpression): SeedValue {
    const promiseValue = this.evaluate(awaitExpr.expression);

    if (promiseValue.value instanceof Promise) {
      return new Promise<SeedValue>((resolve) => {
        (promiseValue.value as Promise<SeedValue>).then(resolve);
      }) as any;
    }

    if (typeof promiseValue.value === 'object' && promiseValue.value !== null && promiseValue._then) {
      return new Promise<SeedValue>((resolve, reject) => {
        promiseValue._then!(
          (value: any) => resolve(this.jsToSeedValue(value)),
          reject
        );
      }) as any;
    }

    return promiseValue;
  }

  private evaluateUnary(unary: UnaryExpression): SeedValue {
    const operand = this.evaluate(unary.operand);

    switch (unary.operator) {
      case '-':
        return { type: 'number', value: -(operand.value as number) };
      case '!':
      case 'not':
        return { type: 'boolean', value: !this.isTruthy(operand) };
      case '~':
        return { type: 'number', value: ~(operand.value as number) };
      default:
        throw new RuntimeError(`Unknown unary operator: ${unary.operator}`);
    }
  }

  private evaluateIdentifier(ident: Identifier): SeedValue {
    if (this.environment.has(ident.name)) {
      return this.environment.get(ident.name);
    }
    throw new RuntimeError(`Undefined variable: ${ident.name}`);
  }

  private isTruthy(value: SeedValue): boolean {
    if (value.type === 'null' || value.type === 'undefined') return false;
    if (value.type === 'boolean') return value.value === true;
    if (value.type === 'number') return value.value !== 0;
    if (value.type === 'string') return value.value.length > 0;
    return true;
  }

  private isEqual(a: SeedValue, b: SeedValue): boolean {
    if (a.type !== b.type) return false;
    switch (a.type) {
      case 'null':
      case 'undefined':
        return true;
      case 'number':
      case 'boolean':
      case 'string':
        return a.value === b.value;
      case 'array':
        if (a.value.length !== b.value.length) return false;
        return a.value.every((v: SeedValue, i: number) => this.isEqual(v, (b.value as SeedValue[])[i]));
      case 'object':
        if (!a.properties || !b.properties) return false;
        if (a.properties.size !== b.properties.size) return false;
        for (const [key, val] of a.properties) {
          if (!b.properties.has(key) || !this.isEqual(val, b.properties.get(key)!)) return false;
        }
        return true;
      default:
        return false;
    }
  }

  private deepClone(val: SeedValue): SeedValue {
    if (val.type === 'null' || val.type === 'undefined') return val;
    if (val.type === 'number' || val.type === 'boolean' || val.type === 'string') return val;
    if (val.type === 'array') {
      return { type: 'array', value: (val.value as SeedValue[]).map((item: SeedValue) => this.deepClone(item)) };
    }
    if (val.type === 'object') {
      const newProps = new Map<string, SeedValue>();
      val.properties?.forEach((v, k) => newProps.set(k, this.deepClone(v)));
      return { type: 'object', value: null, properties: newProps, frozen: val.frozen, sealed: val.sealed };
    }
    return val;
  }

  private deepMerge(target: SeedValue, source: SeedValue): SeedValue {
    if (target.type !== 'object' || source.type !== 'object') return this.deepClone(source);
    const result = this.deepClone(target);
    source.properties?.forEach((value, key) => {
      if (result.properties!.has(key)) {
        const existing = result.properties!.get(key)!;
        if (existing.type === 'object' && value.type === 'object') {
          result.properties!.set(key, this.deepMerge(existing, value));
        } else {
          result.properties!.set(key, this.deepClone(value));
        }
      } else {
        result.properties!.set(key, this.deepClone(value));
      }
    });
    return result;
  }

  protected stringify(value: SeedValue): string {
    switch (value.type) {
      case 'null':
        return 'null';
      case 'undefined':
        return 'undefined';
      case 'boolean':
        return value.value ? 'true' : 'false';
      case 'number':
        return String(value.value);
      case 'string':
        return value.value;
      case 'array':
        return `[${(value.value as SeedValue[]).map(v => this.stringify(v)).join(', ')}]`;
      case 'object':
        if (value.properties) {
          const props = Array.from(value.properties.entries())
            .map(([k, v]) => `${k}: ${this.stringify(v)}`)
            .join(', ');
          return `{${props}}`;
        }
        return '{}';
      case 'function':
        return '[Function]';
      case 'class':
        return `[Class: ${value.value}]`;
      case 'instance':
        if (value.properties) {
          const props = Array.from(value.properties.entries())
            .map(([k, v]) => `${k}: ${this.stringify(v)}`)
            .join(', ');
          return `${value.className || 'Object'}{${props}}`;
        }
        return `${value.className || 'Object'}{}`;
      default:
        return String(value.value);
    }
  }

  private extractIdentifier(value: SeedValue | undefined): string {
    if (!value) return `var_${this.nounStore.size}`;
    if (value.type === 'string') return value.value;
    if ((value as any).index !== undefined) return `noun_${(value as any).index}`;
    return `var_${this.nounStore.size}`;
  }

  getOutput(): string[] {
    return this.output;
  }

  clearOutput(): void {
    this.output = [];
  }

  getEnvironment(): Environment {
    return this.environment;
  }

  setEnvironment(env: Environment): void {
    this.environment = env;
  }

  getNounStore(): Map<number, SeedValue> {
    return this.nounStore;
  }

  getGlobals(): Map<string, SeedValue> {
    const vars = new Map<string, SeedValue>();
    let current: Environment | undefined = this.globals;
    while (current) {
      current.getAll().forEach((value, name) => {
        if (!vars.has(name)) {
          vars.set(name, value);
        }
      });
      current = current.getParent();
    }
    return vars;
  }

  protected jsToSeed(jsVal: any): SeedValue {
    if (jsVal === null || jsVal === undefined) {
      return { type: 'null', value: null };
    }
    if (typeof jsVal === 'string') {
      return { type: 'string', value: jsVal };
    }
    if (typeof jsVal === 'number') {
      return { type: 'number', value: jsVal };
    }
    if (typeof jsVal === 'boolean') {
      return { type: 'boolean', value: jsVal };
    }
    if (Array.isArray(jsVal)) {
      return { type: 'array', value: jsVal.map((v: any) => this.jsToSeed(v)) };
    }
    if (typeof jsVal === 'object') {
      const properties = new Map<string, SeedValue>();
      for (const key of Object.keys(jsVal)) {
        properties.set(key, this.jsToSeed(jsVal[key]));
      }
      return { type: 'object', value: null, properties };
    }
    if (typeof jsVal === 'function') {
      return { type: 'function', value: jsVal };
    }
    return { type: 'null', value: null };
  }

  protected seedToJs(seedVal: SeedValue): any {
    switch (seedVal.type) {
      case 'null':
      case 'undefined':
        return null;
      case 'string':
      case 'number':
      case 'boolean':
        return seedVal.value;
      case 'array':
        return (seedVal.value as SeedValue[]).map(v => this.seedToJs(v));
      case 'object':
        if (seedVal.properties) {
          const obj: any = {};
          seedVal.properties.forEach((v, k) => {
            obj[k] = this.seedToJs(v);
          });
          return obj;
        }
        return {};
      case 'function':
        return seedVal.value;
      default:
        return null;
    }
  }

  protected deepCopy(val: SeedValue): SeedValue {
    switch (val.type) {
      case 'null':
      case 'undefined':
      case 'string':
      case 'number':
      case 'boolean':
      case 'function':
        return val;
      case 'array':
        return { type: 'array', value: (val.value as SeedValue[]).map(v => this.deepCopy(v)) };
      case 'object':
        if (val.properties) {
          const newProps = new Map<string, SeedValue>();
          val.properties.forEach((v, k) => {
            newProps.set(k, this.deepCopy(v));
          });
          return { type: 'object', value: val.value, properties: newProps, frozen: val.frozen, sealed: val.sealed };
        }
        return val;
      default:
        return val;
    }
  }

  protected deepEqual(a: SeedValue, b: SeedValue): boolean {
    if (a.type !== b.type) return false;
    switch (a.type) {
      case 'null':
      case 'undefined':
        return true;
      case 'string':
      case 'number':
      case 'boolean':
        return a.value === b.value;
      case 'array': {
        const arrA = a.value as SeedValue[];
        const arrB = b.value as SeedValue[];
        if (arrA.length !== arrB.length) return false;
        return arrA.every((v, i) => this.deepEqual(v, arrB[i]));
      }
      case 'object':
        if (!a.properties || !b.properties) return a.properties === b.properties;
        if (a.properties.size !== b.properties.size) return false;
        for (const [key, val] of a.properties) {
          if (!b.properties.has(key) || !this.deepEqual(val, b.properties.get(key)!)) return false;
        }
        return true;
      default:
        return false;
    }
  }

  protected shallowEqual(a: SeedValue, b: SeedValue): boolean {
    if (a.type !== b.type) return false;
    switch (a.type) {
      case 'null':
      case 'undefined':
        return true;
      case 'string':
      case 'number':
      case 'boolean':
        return a.value === b.value;
      case 'array':
        return a.value === b.value;
      case 'object':
        return a.properties === b.properties;
      default:
        return a === b;
    }
  }

  reset(): void {
    this.environment = this.globals;
    this.nounStore.clear();
    this.output = [];
    this.functions.clear();
    this.classes.clear();
  }
}
