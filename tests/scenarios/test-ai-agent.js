// AI Agent 场景测试：模拟 AI Agent 的典型工作流（工具调用/记忆管理/任务规划/多轮对话）

const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;
const errors = [];
const asyncTests = [];

function test(name, fn) {
    if (fn.constructor.name === 'AsyncFunction') {
        asyncTests.push({ name, fn });
    } else {
        try {
            fn();
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (e) {
            console.log(`[FAIL] ${name}: ${e.message}`);
            errors.push({ name, error: e.message });
            failed++;
        }
    }
}

async function runAsyncTests() {
    for (const { name, fn } of asyncTests) {
        try {
            await fn();
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (e) {
            console.log(`[FAIL] ${name}: ${e.message}`);
            errors.push({ name, error: e.message });
            failed++;
        }
    }
}

function assertEqual(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(`${msg} Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
    }
}

console.log('========================================');
console.log('  SeedLang AI Agent Enterprise Tests');
console.log('========================================\n');

// ============================================
// 1. Exception Handling Scenarios
// ============================================
console.log('[1. Exception Handling]');

test('API Error Handling', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn callAPI(url) {
    try {
        result = fetchData(url)
        if result == null {
            throw "API returned empty data"
        }
        return result
    } catch (e) {
        print("Error: " + e)
        return null
    }
}

r = callAPI("invalid-url")
print(r)
`);
    assertEqual(r.output, ['Error: API returned empty data', 'null']);
});

test('Finally Block Execution', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
cleanup = false
try {
    throw "error"
} catch (e) {
    print("catch")
} finally {
    cleanup = true
    print("finally")
}
print(cleanup)
`);
    assertEqual(r.output, ['catch', 'finally', 'true']);
});

// ============================================
// 2. Class and Object Scenarios
// ============================================
console.log('\n[2. Class and Object]');

test('Agent Class Encapsulation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class Agent {
    init(name model) {
        this.name = name
        this.model = model
        this.memory = []
    }
    
    think(input) {
        push(this.memory input)
        return "Thinking: " + input
    }
    
    recall() {
        return len(this.memory)
    }
}

agent = Agent("Assistant" "gpt-4")
r1 = agent.think("Hello")
r2 = agent.think("How is the weather today")
count = agent.recall()
print(r1)
print(r2)
print(count)
`);
    assertEqual(r.output, ['Thinking: Hello', 'Thinking: How is the weather today', '2']);
});

test('State Machine Class', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class StateMachine {
    init(initial) {
        this.state = initial
        this.history = []
    }
    
    transition(newState) {
        push(this.history this.state)
        this.state = newState
    }
    
    getHistory() {
        return this.history
    }
}

sm = StateMachine("idle")
sm.transition("running")
sm.transition("paused")
sm.transition("completed")
print(sm.state)
print(len(sm.getHistory()))
`);
    assertEqual(r.output, ['completed', '3']);
});

// ============================================
// 3. Async Processing Scenarios
// ============================================
console.log('\n[3. Async Processing]');

test('Async Task Chain', async () => {
    const vm = new SeedLangVM();
    const r = await vm.runAsync(`
print("Start")
await sleep(10)
print("Middle")
await sleep(10)
print("End")
`);
    assertEqual(r.output, ['Start', 'Middle', 'End']);
});

test('Async Error Handling', async () => {
    const vm = new SeedLangVM();
    const r = await vm.runAsync(`
try {
    print("try start")
    await sleep(10)
    print("try end")
} catch (e) {
    print("catch: " + e)
}
print("done")
`);
    assertEqual(r.output, ['try start', 'try end', 'done']);
});

// ============================================
// 4. Data Processing Scenarios
// ============================================
console.log('\n[4. Data Processing]');

test('Data Transformation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
data = [1 2 3 4 5]
doubled = []
for x in data {
    push(doubled x * 2)
}
print(doubled)
`);
    assertEqual(r.output, ['[2, 4, 6, 8, 10]']);
});

test('Data Filtering', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
data = [1 2 3 4 5 6 7 8 9 10]
filtered = []
for x in data {
    if x > 5 {
        push(filtered x)
    }
}
print(filtered)
`);
    assertEqual(r.output, ['[6, 7, 8, 9, 10]']);
});

test('Data Aggregation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
data = [1 2 3 4 5]
sum = 0
for x in data {
    sum = sum + x
}
print(sum)
`);
    assertEqual(r.output, ['15']);
});

// ============================================
// Summary
// ============================================
async function main() {
    await runAsyncTests();
    
    console.log('\n========================================');
    console.log('           Test Summary');
    console.log('========================================');
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total:  ${passed + failed}`);
    console.log('========================================');

    if (failed > 0) {
        console.log('\nFailed tests:');
        for (const e of errors) {
            console.log(`  - ${e.name}: ${e.error}`);
        }
        process.exit(1);
    } else {
        console.log('\n[SUCCESS] All AI Agent scenario tests passed!');
    }
}

main();
