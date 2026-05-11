const { OP, RETURN_OPS, COMPUTED_RETURN_OPS, VALID_OPCODES } = require('../../src/runtime/vm/opcodes.js');

console.log('='.repeat(60));
console.log('  Opcodes Unit Tests');
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

function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(`${msg || ''} Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
}

console.log('\n--- Opcode value uniqueness ---');

test('all opcode values are unique', () => {
    const values = Object.values(OP);
    const unique = new Set(values);
    assertEqual(values.length, unique.size, 'Duplicate opcode values found');
});

test('CALL_BUILTIN is 72', () => {
    assertEqual(OP.CALL_BUILTIN, 72);
});

test('IS_ARRAY is 180', () => {
    assertEqual(OP.IS_ARRAY, 180);
});

test('HALT is 255', () => {
    assertEqual(OP.HALT, 255);
});

test('TAIL_CALL is 254', () => {
    assertEqual(OP.TAIL_CALL, 254);
});

test('JUMP is 60', () => {
    assertEqual(OP.JUMP, 60);
});

test('INC_GLOBAL_JUMP is 128', () => {
    assertEqual(OP.INC_GLOBAL_JUMP, 128);
});

test('LOOP_LT is 95', () => {
    assertEqual(OP.LOOP_LT, 95);
});

test('LOOP_LT_GLOBAL is 96', () => {
    assertEqual(OP.LOOP_LT_GLOBAL, 96);
});

console.log('\n--- VALID_OPCODES set ---');

test('VALID_OPCODES contains all OP values', () => {
    const values = Object.values(OP);
    for (const v of values) {
        if (!VALID_OPCODES.has(v)) throw new Error(`VALID_OPCODES missing: ${v}`);
    }
});

test('VALID_OPCODES size matches OP value count', () => {
    assertEqual(VALID_OPCODES.size, Object.values(OP).length);
});

console.log('\n--- RETURN_OPS set ---');

test('RETURN is in RETURN_OPS', () => {
    assertEqual(RETURN_OPS.has(OP.RETURN), true);
});

test('RETURN_LOCAL is in RETURN_OPS', () => {
    assertEqual(RETURN_OPS.has(OP.RETURN_LOCAL), true);
});

test('ADD_RETURN is in RETURN_OPS', () => {
    assertEqual(RETURN_OPS.has(OP.ADD_RETURN), true);
});

test('ADD is not in RETURN_OPS', () => {
    assertEqual(RETURN_OPS.has(OP.ADD), false);
});

console.log('\n--- COMPUTED_RETURN_OPS set ---');

test('RETURN_LOCAL is in COMPUTED_RETURN_OPS', () => {
    assertEqual(COMPUTED_RETURN_OPS.has(OP.RETURN_LOCAL), true);
});

test('RETURN is not in COMPUTED_RETURN_OPS', () => {
    assertEqual(COMPUTED_RETURN_OPS.has(OP.RETURN), false);
});

console.log('\n--- CALL_BUILTIN format consistency ---');

test('CALL_BUILTIN is 3-byte opcode (opcode + constIdx + nArgs)', () => {
    assertEqual(OP.CALL_BUILTIN, 72);
});

console.log('\n--- Opcode ranges for scanner sync ---');

test('comparison jump opcodes 158-161 are LT_JIF through GE_JIF', () => {
    assertEqual(OP.LT_JIF, 158);
    assertEqual(OP.LE_JIF, 159);
    assertEqual(OP.GT_JIF, 160);
    assertEqual(OP.GE_JIF, 161);
});

test('numeric set opcodes 155-157 are ADD/SUB/MUL_NUM_SET_GLOBAL', () => {
    assertEqual(OP.ADD_NUM_SET_GLOBAL, 155);
    assertEqual(OP.SUB_NUM_SET_GLOBAL, 156);
    assertEqual(OP.MUL_NUM_SET_GLOBAL, 157);
});

test('CONST_SET_GLOBAL is 102 (3-byte: opcode + globalIdx + constIdx)', () => {
    assertEqual(OP.CONST_SET_GLOBAL, 102);
});

test('JUMP is 60 (2-byte: opcode + offset)', () => {
    assertEqual(OP.JUMP, 60);
});

console.log('\n' + '='.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
