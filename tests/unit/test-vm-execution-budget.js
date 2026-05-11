const { createExecutionBudget, consumeExecutionBudget, consumeExecutionBudgetBatch } = require('../../src/runtime/vm/execution_budget.js');

console.log('='.repeat(60));
console.log('  Execution Budget Unit Tests');
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

console.log('\n--- createExecutionBudget ---');

test('returns null when guard disabled', () => {
    assertEqual(createExecutionBudget(false, 1000, 100, 50), null);
});

test('creates budget with correct remaining', () => {
    const b = createExecutionBudget(true, 1000, 100, 50);
    assertEqual(b.remaining, 1000);
});

test('creates budget with correct timeSlice', () => {
    const b = createExecutionBudget(true, 1000, 100, 50);
    assertEqual(b.timeSlice, 50);
});

test('creates budget with deadline in future', () => {
    const b = createExecutionBudget(true, 1000, 100, 50);
    assertEqual(b.deadline > Date.now(), true);
});

test('creates budget with zero deadline when maxExecutionMs is 0', () => {
    const b = createExecutionBudget(true, 1000, 0, 50);
    assertEqual(b.deadline, 0);
});

console.log('\n--- consumeExecutionBudget ---');

test('returns null when budget is null', () => {
    assertEqual(consumeExecutionBudget(null, 1000, 100, 50), null);
});

test('decrements remaining by 1', () => {
    const b = createExecutionBudget(true, 100, 10000, 100);
    consumeExecutionBudget(b, 100, 10000, 100);
    assertEqual(b.remaining, 99);
});

test('returns error when remaining goes below 0', () => {
    const b = createExecutionBudget(true, 1, 10000, 100);
    consumeExecutionBudget(b, 1, 10000, 100);
    const err = consumeExecutionBudget(b, 1, 10000, 100);
    assertEqual(err !== null, true);
    assertEqual(err.includes('Execution limit exceeded'), true);
});

test('returns null when remaining is still positive', () => {
    const b = createExecutionBudget(true, 100, 10000, 100);
    const err = consumeExecutionBudget(b, 100, 10000, 100);
    assertEqual(err, null);
});

test('checks time when timeSlice reaches 0', () => {
    const b = createExecutionBudget(true, 10000, 10000, 3);
    b.timeSlice = 1;
    const err = consumeExecutionBudget(b, 10000, 10000, 3);
    assertEqual(err, null);
});

test('returns timeout when deadline exceeded', () => {
    const b = createExecutionBudget(true, 10000, 1, 100);
    b.deadline = Date.now() - 1000;
    b.timeSlice = 1;
    const err = consumeExecutionBudget(b, 10000, 1, 100);
    assertEqual(err !== null, true);
    assertEqual(err.includes('Execution timeout'), true);
});

console.log('\n--- consumeExecutionBudgetBatch ---');

test('returns null when budget is null', () => {
    assertEqual(consumeExecutionBudgetBatch(null, 100, 1000, 100, 50), null);
});

test('deducts steps from remaining', () => {
    const b = createExecutionBudget(true, 1000, 10000, 500);
    consumeExecutionBudgetBatch(b, 100, 1000, 10000, 500);
    assertEqual(b.remaining, 900);
});

test('returns error when steps exceed remaining', () => {
    const b = createExecutionBudget(true, 50, 10000, 500);
    const err = consumeExecutionBudgetBatch(b, 100, 50, 10000, 500);
    assertEqual(err !== null, true);
    assertEqual(err.includes('Execution limit exceeded'), true);
});

test('handles zero steps', () => {
    const b = createExecutionBudget(true, 1000, 10000, 500);
    const err = consumeExecutionBudgetBatch(b, 0, 1000, 10000, 500);
    assertEqual(err, null);
    assertEqual(b.remaining, 1000);
});

test('handles NaN steps as 0', () => {
    const b = createExecutionBudget(true, 1000, 10000, 500);
    const err = consumeExecutionBudgetBatch(b, NaN, 1000, 10000, 500);
    assertEqual(err, null);
    assertEqual(b.remaining, 1000);
});

test('returns timeout when deadline exceeded during batch', () => {
    const b = createExecutionBudget(true, 100000, 1, 50);
    b.deadline = Date.now() - 1000;
    const err = consumeExecutionBudgetBatch(b, 100, 100000, 1, 50);
    assertEqual(err !== null, true);
    assertEqual(err.includes('Execution timeout'), true);
});

test('large batch processes in chunks', () => {
    const b = createExecutionBudget(true, 10000, 10000, 100);
    const err = consumeExecutionBudgetBatch(b, 5000, 10000, 10000, 100);
    assertEqual(err, null);
    assertEqual(b.remaining, 5000);
});

console.log('\n' + '='.repeat(60));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
