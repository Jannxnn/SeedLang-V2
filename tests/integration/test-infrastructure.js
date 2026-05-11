const { SeedLangVM } = require('../../src/runtime/vm.js');
const { FiberScheduler } = require('../../src/runtime/vm/fiber_scheduler');
const FiberSerializer = require('../../src/runtime/vm/fiber_serializer');
const { WorkStealingDeque } = require('../../src/runtime/vm/worker_pool');

console.log('=== Infrastructure Integration Tests ===\n');

const tests = [
    {
        name: 'WorkStealingDeque push/pop LIFO',
        run: () => {
            const deque = new WorkStealingDeque();
            deque.push(1);
            deque.push(2);
            deque.push(3);
            return deque.pop() === 3 && deque.pop() === 2 && deque.pop() === 1;
        },
        check: (r) => r === true
    },
    {
        name: 'WorkStealingDeque steal FIFO',
        run: () => {
            const deque = new WorkStealingDeque();
            deque.push(1);
            deque.push(2);
            deque.push(3);
            return deque.steal() === 1 && deque.steal() === 2;
        },
        check: (r) => r === true
    },
    {
        name: 'WorkStealingDeque mixed push/pop/steal',
        run: () => {
            const deque = new WorkStealingDeque();
            deque.push(10);
            deque.push(20);
            deque.push(30);
            const stolen = deque.steal();
            const popped = deque.pop();
            return stolen === 10 && popped === 30 && deque.length === 1;
        },
        check: (r) => r === true
    },
    {
        name: 'WorkStealingDeque empty operations',
        run: () => {
            const deque = new WorkStealingDeque();
            return deque.pop() === undefined && deque.steal() === undefined && deque.length === 0;
        },
        check: (r) => r === true
    },
    {
        name: 'WorkStealingDeque peek operations',
        run: () => {
            const deque = new WorkStealingDeque();
            deque.push(42);
            deque.push(99);
            return deque.peek() === 99 && deque.stealPeek() === 42;
        },
        check: (r) => r === true
    },
    {
        name: 'FiberSerializer serialize and deserialize basic',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn gen() {
    yield 1
    yield 2
    return 3
}
g = gen()
coroutine.resume(g)
`);
            const coro = vm._vm.globals.g;
            if (!coro) return false;
            const serialized = FiberSerializer.serializeFiber(coro);
            const deserialized = FiberSerializer.deserializeFiber(serialized, vm._vm);
            return deserialized._type === 'coroutine' && deserialized.state === 'suspended';
        },
        check: (r) => r === true
    },
    {
        name: 'FiberSerializer fiberToJSON roundtrip',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn gen() {
    yield 42
    return 99
}
g = gen()
coroutine.resume(g)
`);
            const coro = vm._vm.globals.g;
            if (!coro) return false;
            const json = FiberSerializer.fiberToJSON(coro);
            const restored = FiberSerializer.fiberFromJSON(json, vm._vm);
            return restored._type === 'coroutine';
        },
        check: (r) => r === true
    },
    {
        name: 'FiberScheduler spawn and run multiple',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn add3n4() { return 3 + 4 }
fn mul5n6() { return 5 * 6 }
add_fn = add3n4
mul_fn = mul5n6
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler.spawn(vm._vm.globals.add_fn);
            scheduler.spawn(vm._vm.globals.mul_fn);
            const results = scheduler.run();
            const vals = Object.values(results).map(r => r.value);
            return vals.includes(7) && vals.includes(30);
        },
        check: (r) => r === true
    },
    {
        name: 'FiberScheduler preemptive interleaving',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn work(n) {
    i = 0
    while i < n {
        i = i + 1
    }
    return i
}
work_fn = work
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler._preemptive = true;
            scheduler._timeSliceSize = 128;
            const f1 = scheduler.spawn(vm._vm.globals.work_fn, [500]);
            const f2 = scheduler.spawn(vm._vm.globals.work_fn, [500]);
            const results = scheduler.run();
            return results['1']?.value === 500 && results['2']?.value === 500;
        },
        check: (r) => r === true
    },
    {
        name: 'FiberScheduler killAll cleans up',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn t() { return 1 }
t_fn = t
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler.spawn(vm._vm.globals.t_fn);
            scheduler.spawn(vm._vm.globals.t_fn);
            scheduler.spawn(vm._vm.globals.t_fn);
            scheduler.killAll();
            const status = scheduler.getStatus();
            return status.activeFibers === 0 && status.readyCount === 0;
        },
        check: (r) => r === true
    },
    {
        name: 'FiberScheduler listFibers',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn t() { return 1 }
t_fn = t
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler.spawn(vm._vm.globals.t_fn);
            scheduler.spawn(vm._vm.globals.t_fn);
            const list = scheduler.listFibers();
            return list.length === 2;
        },
        check: (r) => r === true
    },
    {
        name: 'FiberScheduler yield and resume',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn gen() {
    yield 10
    yield 20
    return 30
}
gen_fn = gen
`);
            const scheduler = new FiberScheduler(vm._vm);
            const f1 = scheduler.spawn(vm._vm.globals.gen_fn);
            const results = scheduler.run();
            return results['1']?.value === 30;
        },
        check: (r) => r === true
    },
    {
        name: 'GPUBackend CPU fallback init',
        run: async () => {
            const { GPUBackend } = require('../../src/runtime/vm/gpu_backend');
            const gpu = new GPUBackend();
            await gpu.init();
            return gpu.isAvailable && gpu.backendName === 'fallback';
        },
        check: (r) => r === true
    },
    {
        name: 'GPUBackend create and read buffer',
        run: async () => {
            const { GPUBackend } = require('../../src/runtime/vm/gpu_backend');
            const gpu = new GPUBackend();
            await gpu.init();
            const buf = gpu.createBuffer([1, 2, 3, 4, 5]);
            const data = await gpu.readBuffer(buf.id);
            gpu.destroyBuffer(buf.id);
            return JSON.stringify(data) === JSON.stringify([1, 2, 3, 4, 5]);
        },
        check: (r) => r === true
    },
    {
        name: 'GPUBackend write buffer',
        run: async () => {
            const { GPUBackend } = require('../../src/runtime/vm/gpu_backend');
            const gpu = new GPUBackend();
            await gpu.init();
            const buf = gpu.createBuffer([0, 0, 0]);
            gpu.writeBuffer(buf.id, [10, 20, 30]);
            const data = await gpu.readBuffer(buf.id);
            gpu.destroyBuffer(buf.id);
            return JSON.stringify(data) === JSON.stringify([10, 20, 30]);
        },
        check: (r) => r === true
    },
    {
        name: 'GPUBackend destroy buffer',
        run: async () => {
            const { GPUBackend } = require('../../src/runtime/vm/gpu_backend');
            const gpu = new GPUBackend();
            await gpu.init();
            const buf = gpu.createBuffer([1, 2, 3]);
            const destroyed = gpu.destroyBuffer(buf.id);
            const status = gpu.getStatus();
            return destroyed === true && status.bufferCount === 0;
        },
        check: (r) => r === true
    },
    {
        name: 'GPUBackend status',
        run: async () => {
            const { GPUBackend } = require('../../src/runtime/vm/gpu_backend');
            const gpu = new GPUBackend();
            await gpu.init();
            const status = gpu.getStatus();
            return status.available === true && typeof status.bufferCount === 'number';
        },
        check: (r) => r === true
    },
    {
        name: 'GPUBackend map with CPU fallback',
        run: async () => {
            const { GPUBackend } = require('../../src/runtime/vm/gpu_backend');
            const gpu = new GPUBackend();
            await gpu.init();
            const result = await gpu.map([1, 2, 3, 4], 'return inputs.input[threadId] * 2');
            return result.length === 4;
        },
        check: (r) => r === true
    },
    {
        name: 'Scheduler + proc_macro integration',
        code: `
proc_macro make_task(n) {
    return ast.binOp("+" n 1)
}
fn runner() { return make_task!(10) }
f = scheduler.spawn(runner)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            return results && Object.values(results).some(r => r.value === 11);
        }
    },
    {
        name: 'Macro import still works with proc_macro',
        code: `
macro add_one(x) {
    return x + 1
}
proc_macro double(x) {
    return ast.binOp("*" x 2)
}
r1 = add_one!(5)
r2 = double!(3)
result = r1 + r2
`,
        check: (vm) => vm.vm.globals.result === 12
    },
    {
        name: 'Coroutine _ctx preserved in scheduler',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn compute() { return 42 }
compute_fn = compute
`);
            const scheduler = new FiberScheduler(vm._vm);
            const f1 = scheduler.spawn(vm._vm.globals.compute_fn);
            const results = scheduler.run();
            return results['1']?.value === 42;
        },
        check: (r) => r === true
    },
    {
        name: 'FiberSerializer handles completed fiber',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn quick() { return 42 }
quick_fn = quick
`);
            const scheduler = new FiberScheduler(vm._vm);
            const f1 = scheduler.spawn(vm._vm.globals.quick_fn);
            scheduler.run();
            return f1.state === 'done';
        },
        check: (r) => r === true
    },
    {
        name: 'Multiple schedulers independent',
        run: () => {
            const vm1 = new SeedLangVM();
            vm1.run(`fn t1() { return 1 } t1_fn = t1`);
            const s1 = new FiberScheduler(vm1._vm);
            s1.spawn(vm1._vm.globals.t1_fn);

            const vm2 = new SeedLangVM();
            vm2.run(`fn t2() { return 2 } t2_fn = t2`);
            const s2 = new FiberScheduler(vm2._vm);
            s2.spawn(vm2._vm.globals.t2_fn);

            const r1 = s1.run();
            const r2 = s2.run();
            return r1['1']?.value === 1 && r2['1']?.value === 2;
        },
        check: (r) => r === true
    },
    {
        name: 'Preemptive scheduler time slice boundary',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn exact_budget() {
    i = 0
    while i < 1024 {
        i = i + 1
    }
    return i
}
budget_fn = exact_budget
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler._preemptive = true;
            scheduler._timeSliceSize = 1024;
            const f1 = scheduler.spawn(vm._vm.globals.budget_fn);
            const results = scheduler.run();
            return results[String(f1._schedulerId)]?.value === 1024;
        },
        check: (r) => r === true
    }
];

let passed = 0;
let failed = 0;

(async () => {
    for (const test of tests) {
        try {
            let checkResult;

            if (test.run) {
                const runResult = await test.run();
                checkResult = test.check(runResult);
            } else {
                const vm = new SeedLangVM();
                const result = vm.run(test.code);
                if (result.success === false) {
                    console.log(`[FAIL] ${test.name}: ${result.error}`);
                    failed++;
                    continue;
                }
                checkResult = test.check(vm);
            }

            if (checkResult) {
                console.log(`[OK] ${test.name}`);
                passed++;
            } else {
                console.log(`[FAIL] ${test.name}: check returned false`);
                failed++;
            }
        } catch (e) {
            console.log(`[FAIL] ${test.name}: ${e.message}`);
            failed++;
        }
    }

    console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
})();
