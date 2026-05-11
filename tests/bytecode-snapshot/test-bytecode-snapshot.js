'use strict';

const { Parser } = require('../../src/runtime/vm/parser');
const { Compiler } = require('../../src/runtime/vm/compiler');
const { OP } = require('../../src/runtime/vm/opcodes');
const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');
if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

const OP_NAMES = {};
for (const [name, val] of Object.entries(OP)) {
    OP_NAMES[val] = name;
}

function compileToBytecode(code) {
    const parser = new Parser();
    const ast = parser.parse(code);
    const compiler = new Compiler();
    return compiler.compile(ast);
}

function normalizeFuncConst(funcObj) {
    const normalized = {
        type: 'func',
        start: funcObj.start,
        end: funcObj.end,
        params: funcObj.params,
        name: funcObj.name,
        capturedVars: funcObj.capturedVars || [],
        capturedLocals: funcObj.capturedLocals || [],
        _localCount: funcObj._localCount || 0,
        _noCapture: !!funcObj._noCapture,
        _isLeaf: !!funcObj._isLeaf,
        _isClassicFib: !!funcObj._isClassicFib
    };
    if (funcObj.code) normalized.code = funcObj.code;
    if (funcObj.consts) normalized.consts = funcObj.consts;
    return normalized;
}

function normalizeClassConst(classObj) {
    const normalized = {
        _type: 'class',
        name: classObj.name,
        superClass: classObj.superClass || null
    };
    if (classObj.methods) {
        const methodNames = Object.keys(classObj.methods).sort();
        normalized.methods = {};
        for (const m of methodNames) {
            const src = classObj.methods[m];
            normalized.methods[m] = {
                params: src.params || [],
                isStatic: !!src.isStatic,
                localCount: src.localCount || 0,
                code: src.code,
                consts: src.consts,
                vars: src.vars || []
            };
        }
    }
    return normalized;
}

function normalizeConsts(consts) {
    return consts.map(c => {
        if (c === null || c === undefined) return null;
        if (typeof c === 'number' || typeof c === 'string' || typeof c === 'boolean') return c;
        if (c && typeof c === 'object') {
            if (c.type === 'func') return normalizeFuncConst(c);
            if (c._type === 'class') return normalizeClassConst(c);
            if (c === '@@seed_object_spread@@') return '@@seed_object_spread@@';
            try { return JSON.parse(JSON.stringify(c)); } catch (_) { return '[unserializable]'; }
        }
        return String(c);
    });
}

function disassemble(code) {
    const lines = [];
    let ip = 0;
    while (ip < code.length) {
        const op = code[ip];
        const name = OP_NAMES[op] || `UNKNOWN(${op})`;
        const startIp = ip;
        ip++;
        switch (op) {
            case OP.CONST: case OP.SET_GLOBAL: case OP.GET_GLOBAL:
            case OP.SET_LOCAL: case OP.GET_LOCAL: case OP.JUMP:
            case OP.JUMP_IF_FALSE: case OP.JUMP_IF_TRUE:
            case OP.LOOP: case OP.CONST_SET_GLOBAL:
            case OP.SET_LEN_GLOBAL_CONST: case OP.NULL_JUMP:
            case OP.GET_LOCAL_CONST: case OP.SET_LOCAL_CONST:
                lines.push(`${String(startIp).padStart(4)} ${name} ${code[ip]}`);
                ip++;
                break;
            case OP.CALL: case OP.INVOKE: case OP.SUPER_INVOKE:
                lines.push(`${String(startIp).padStart(4)} ${name} ${code[ip]} ${code[ip + 1]}`);
                ip += 2;
                break;
            case OP.FOR_IN:
                lines.push(`${String(startIp).padStart(4)} ${name} ${code[ip]} ${code[ip + 1]} ${code[ip + 2]}`);
                ip += 3;
                break;
            case OP.LOOP_JIT:
                lines.push(`${String(startIp).padStart(4)} ${name} ${code[ip]} ${code[ip + 1]} ${code[ip + 2]}`);
                ip += 3;
                const offset = code[ip - 1];
                ip += offset;
                break;
            case OP.SUM_ACCUM:
                lines.push(`${String(startIp).padStart(4)} ${name} ${code[ip]} ${code[ip + 1]} ${code[ip + 2]} ${code[ip + 3]} ${code[ip + 4]}`);
                ip += 5;
                break;
            case OP.CONST_OBJ_GET:
                lines.push(`${String(startIp).padStart(4)} ${name} ${code[ip]}`);
                ip++;
                break;
            default:
                lines.push(`${String(startIp).padStart(4)} ${name}`);
                break;
        }
    }
    return lines;
}

function createBytecodeSnapshot(name, code) {
    const bc = compileToBytecode(code);
    return {
        name,
        source: code,
        bytecode: {
            code: bc.code,
            codeDisasm: disassemble(bc.code),
            consts: normalizeConsts(bc.consts),
            vars: bc.vars,
            funcNames: bc.funcNames || {}
        },
        version: 1
    };
}

function saveSnapshot(snapshot) {
    const filename = snapshot.name.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
    const filepath = path.join(SNAPSHOT_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
    return filepath;
}

function loadSnapshot(name) {
    const filename = name.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
    const filepath = path.join(SNAPSHOT_DIR, filename);
    if (fs.existsSync(filepath)) {
        return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
    return null;
}

function diffBytecode(current, saved) {
    const diffs = [];
    if (JSON.stringify(current.code) !== JSON.stringify(saved.code)) {
        diffs.push('code array mismatch');
        const maxLen = Math.max(current.code.length, saved.code.length);
        const codeDiffs = [];
        for (let i = 0; i < maxLen; i++) {
            const c = current.code[i];
            const s = saved.code[i];
            if (c !== s) {
                const cName = OP_NAMES[c] || c;
                const sName = OP_NAMES[s] || s;
                codeDiffs.push(`  [${i}] expected ${sName}, got ${cName}`);
            }
        }
        if (codeDiffs.length <= 20) diffs.push(codeDiffs.join('\n'));
        else diffs.push(`  ${codeDiffs.length} opcode differences (showing first 20):\n${codeDiffs.slice(0, 20).join('\n')}`);
    }
    if (JSON.stringify(current.consts) !== JSON.stringify(saved.consts)) {
        diffs.push('consts mismatch');
        const maxLen = Math.max(current.consts.length, saved.consts.length);
        const constDiffs = [];
        for (let i = 0; i < maxLen; i++) {
            const c = JSON.stringify(current.consts[i]);
            const s = JSON.stringify(saved.consts[i]);
            if (c !== s) constDiffs.push(`  [${i}] expected ${s}, got ${c}`);
        }
        if (constDiffs.length <= 10) diffs.push(constDiffs.join('\n'));
        else diffs.push(`  ${constDiffs.length} const differences (showing first 10):\n${constDiffs.slice(0, 10).join('\n')}`);
    }
    if (JSON.stringify(current.vars) !== JSON.stringify(saved.vars)) {
        diffs.push(`vars mismatch: expected ${JSON.stringify(saved.vars)}, got ${JSON.stringify(current.vars)}`);
    }
    if (JSON.stringify(current.funcNames) !== JSON.stringify(saved.funcNames)) {
        diffs.push(`funcNames mismatch: expected ${JSON.stringify(saved.funcNames)}, got ${JSON.stringify(current.funcNames)}`);
    }
    return diffs;
}

const UPDATE_MODE = process.argv.includes('--update');

let passed = 0;
let failed = 0;
let created = 0;

function test(name, code) {
    try {
        const current = createBytecodeSnapshot(name, code);
        const saved = loadSnapshot(name);

        if (!saved) {
            saveSnapshot(current);
            console.log(`[OK] ${name} (snapshot created)`);
            created++;
            passed++;
            return;
        }

        if (saved.version !== current.version) {
            saveSnapshot(current);
            console.log(`[OK] ${name} (snapshot version updated)`);
            passed++;
            return;
        }

        const codeMatch = JSON.stringify(current.bytecode.code) === JSON.stringify(saved.bytecode.code);
        const constsMatch = JSON.stringify(current.bytecode.consts) === JSON.stringify(saved.bytecode.consts);
        const varsMatch = JSON.stringify(current.bytecode.vars) === JSON.stringify(saved.bytecode.vars);
        const funcNamesMatch = JSON.stringify(current.bytecode.funcNames) === JSON.stringify(saved.bytecode.funcNames);

        if (codeMatch && constsMatch && varsMatch && funcNamesMatch) {
            console.log(`[OK] ${name}`);
            passed++;
        } else if (UPDATE_MODE) {
            saveSnapshot(current);
            console.log(`[OK] ${name} (snapshot updated)`);
            passed++;
        } else {
            const diffs = diffBytecode(current.bytecode, saved.bytecode);
            console.log(`[FAIL] ${name}: bytecode regression detected`);
            for (const d of diffs) console.log(`  ${d}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

console.log('=== Bytecode Snapshot Regression Tests ===\n');

test('arithmetic', `
result = (1 + 2) * 3 - 4 / 2
print(result)
`);

test('variables_and_assignment', `
x = 10
y = 20
z = x + y
print(z)
`);

test('if_else', `
x = 5
if x > 3 {
    print("big")
} else {
    print("small")
}
`);

test('while_loop', `
i = 0
sum = 0
while i < 10 {
    sum = sum + i
    i = i + 1
}
print(sum)
`);

test('for_in_loop', `
total = 0
for x in [1 2 3 4 5] {
    total = total + x
}
print(total)
`);

test('function_definition_and_call', `
fn add(a b) { return a + b }
result = add(3 4)
print(result)
`);

test('closure', `
fn make_counter() {
    count = 0
    fn increment() {
        count = count + 1
        return count
    }
    return increment
}
counter = make_counter()
print(counter())
print(counter())
`);

test('class_basic', `
class Dog {
    fn bark() { print("woof") }
}
d = Dog()
d.bark()
`);

test('array_operations', `
arr = [1 2 3]
arr.push(4)
print(arr.length())
print(arr[0])
`);

test('object_operations', `
person = { name: "Alice" age: 30 }
print(person.name)
person.city = "NYC"
print(person.city)
`);

test('string_concat', `
greeting = "Hello" + " " + "World"
print(greeting)
`);

test('recursion', `
fn fib(n) {
    if n <= 1 { return n }
    return fib(n - 1) + fib(n - 2)
}
print(fib(10))
`);

test('nested_function', `
fn outer(x) {
    fn inner(y) { return x + y }
    return inner(10)
}
print(outer(5))
`);

test('try_catch', `
try {
    x = 1 / 0
} catch e {
    print("caught")
}
`);

test('modulo', `
result = 10 % 3
print(result)
`);

test('boolean_logic', `
a = true
b = false
print(a and b)
print(a or b)
print(not b)
`);

test('class_with_constructor', `
class Point {
    fn init(x y) {
        this.x = x
        this.y = y
    }
    fn show() { print(this.x + "," + this.y) }
}
p = Point(3 4)
p.show()
`);

test('class_inheritance', `
class Animal {
    fn speak() { print("...") }
}
class Cat extends Animal {
    fn speak() { print("meow") }
}
c = Cat()
c.speak()
`);

test('pattern_matching', `
fn describe(x) {
    return match x {
        0 => "zero"
        1 => "one"
        _ => "other"
    }
}
print(describe(3))
`);

test('c_style_for_loop', `
arr = [10 20 30]
for (i = 0; i < len(arr); i = i + 1) {
    print(arr[i])
}
`);

console.log('\n=== Bytecode Snapshot Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Created: ${created}`);

process.exit(failed > 0 ? 1 : 0);
