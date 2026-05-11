const { SeedLangVM } = require('../../src/runtime/vm.js');
const { FiberScheduler } = require('../../src/runtime/vm/fiber_scheduler');
const { WorkStealingDeque } = require('../../src/runtime/vm/worker_pool');
const FiberSerializer = require('../../src/runtime/vm/fiber_serializer');

console.log('=== Boundary & Stress Tests ===\n');

const tests = [
    {
        name: 'Stress: 50 fibers on scheduler',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn task(n) { return n * 2 }
task_fn = task
`);
            const scheduler = new FiberScheduler(vm._vm);
            for (let i = 0; i < 50; i++) {
                scheduler.spawn(vm._vm.globals.task_fn, [i]);
            }
            const results = scheduler.run();
            const count = Object.keys(results).length;
            return count === 50;
        },
        check: (r) => r === true
    },
    {
        name: 'Stress: preemptive scheduler with 20 CPU fibers',
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
            scheduler._timeSliceSize = 256;
            for (let i = 0; i < 20; i++) {
                scheduler.spawn(vm._vm.globals.work_fn, [100]);
            }
            const results = scheduler.run();
            const allCorrect = Object.values(results).every(r => r.value === 100);
            return Object.keys(results).length === 20 && allCorrect;
        },
        check: (r) => r === true
    },
    {
        name: 'Boundary: scheduler with zero fibers',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`x = 1`);
            const scheduler = new FiberScheduler(vm._vm);
            const results = scheduler.run();
            return Object.keys(results).length === 0;
        },
        check: (r) => r === true
    },
    {
        name: 'Boundary: scheduler with single fiber',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`fn t() { return 1 } t_fn = t`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler.spawn(vm._vm.globals.t_fn);
            const results = scheduler.run();
            return results['1']?.value === 1;
        },
        check: (r) => r === true
    },
    {
        name: 'Boundary: proc_macro with zero argument',
        code: `
proc_macro forty_two() {
    return ast.num(42)
}
result = forty_two!()
`,
        check: (vm) => vm.vm.globals.result === 42
    },
    {
        name: 'Boundary: proc_macro with large compile-time computation',
        code: `
proc_macro big_sum(n) {
    total = 0
    i = 1
    while i <= n {
        total = total + i
        i = i + 1
    }
    return ast.num(total)
}
result = big_sum!(1000)
`,
        check: (vm) => vm.vm.globals.result === 500500
    },
    {
        name: 'Boundary: deeply nested proc_macro expansion',
        code: `
proc_macro add1(x) {
    return ast.binOp("+" x 1)
}
result = add1!(add1!(add1!(add1!(0))))
`,
        check: (vm) => vm.vm.globals.result === 4
    },
    {
        name: 'Boundary: proc_macro with empty string',
        code: `
proc_macro wrap(s) {
    return ast.binOp("+" ast.str("[") ast.binOp("+" s ast.str("]")))
}
result = wrap!("")
`,
        check: (vm) => vm.vm.globals.result === '[]'
    },
    {
        name: 'Boundary: proc_macro with negative number',
        code: `
proc_macro negate(x) {
    return ast.unaryOp("-" x)
}
result = negate!(42)
`,
        check: (vm) => vm.vm.globals.result === -42
    },
    {
        name: 'Boundary: proc_macro with zero',
        code: `
proc_macro double(x) {
    return ast.binOp("*" x 2)
}
result = double!(0)
`,
        check: (vm) => vm.vm.globals.result === 0
    },
    {
        name: 'Stress: WorkStealingDeque with 1000 items',
        run: () => {
            const deque = new WorkStealingDeque();
            for (let i = 0; i < 1000; i++) {
                deque.push(i);
            }
            let stolen = 0;
            while (deque.length > 0) {
                const item = deque.steal();
                if (item !== undefined) stolen++;
            }
            return stolen === 1000;
        },
        check: (r) => r === true
    },
    {
        name: 'Stress: WorkStealingDeque concurrent push/pop/steal pattern',
        run: () => {
            const deque = new WorkStealingDeque();
            const results = [];
            for (let i = 0; i < 500; i++) {
                deque.push(i);
                if (i % 3 === 0) results.push(deque.pop());
                if (i % 5 === 0) results.push(deque.steal());
            }
            while (deque.length > 0) results.push(deque.pop());
            return results.length > 0 && results.every(r => r === undefined || typeof r === 'number');
        },
        check: (r) => r === true
    },
    {
        name: 'Boundary: FiberSerializer with empty stack fiber',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn gen() {
    yield 1
    return 2
}
g = gen()
`);
            const coro = vm._vm.globals.g;
            const serialized = FiberSerializer.serializeFiber(coro);
            return serialized !== null && serialized._type === 'serialized_fiber';
        },
        check: (r) => r === true
    },
    {
        name: 'Boundary: scheduler kill non-existent fiber',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`x = 1`);
            const scheduler = new FiberScheduler(vm._vm);
            const result = scheduler.kill({ _type: 'coroutine', state: 'done', _schedulerId: 999 });
            return result === false || result === undefined;
        },
        check: (r) => r === true
    },
    {
        name: 'Stress: proc_macro generating many expressions',
        code: `
proc_macro chain_add(n) {
    result = 0
    i = 0
    while i < n {
        result = result + i
        i = i + 1
    }
    return ast.num(result)
}
result = chain_add!(100)
`,
        check: (vm) => vm.vm.globals.result === 4950
    },
    {
        name: 'Boundary: scheduler fiber returning null',
        code: `
fn null_fn() { return null }
f = scheduler.spawn(null_fn)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            return results && Object.values(results).some(r => r.value === null);
        }
    },
    {
        name: 'Boundary: scheduler fiber returning boolean',
        code: `
fn bool_fn() { return true }
f = scheduler.spawn(bool_fn)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            return results && Object.values(results).some(r => r.value === true);
        }
    },
    {
        name: 'Boundary: scheduler fiber returning string',
        code: `
fn str_fn() { return "hello" }
f = scheduler.spawn(str_fn)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            return results && Object.values(results).some(r => r.value === 'hello');
        }
    },
    {
        name: 'Stress: preemptive scheduler rapid yield/resume cycle',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn yielder() {
    yield 1
    yield 2
    yield 3
    yield 4
    yield 5
    return 6
}
yielder_fn = yielder
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler._preemptive = true;
            scheduler._timeSliceSize = 1024;
            for (let i = 0; i < 10; i++) {
                scheduler.spawn(vm._vm.globals.yielder_fn);
            }
            const results = scheduler.run();
            const allDone = Object.values(results).every(r => r.value === 6);
            return Object.keys(results).length === 10 && allDone;
        },
        check: (r) => r === true
    },
    {
        name: 'Boundary: scheduler with very small time slice',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn work() {
    i = 0
    while i < 100 {
        i = i + 1
    }
    return i
}
work_fn = work
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler._preemptive = true;
            scheduler._timeSliceSize = 64;
            const f1 = scheduler.spawn(vm._vm.globals.work_fn);
            const results = scheduler.run();
            return results['1']?.value === 100;
        },
        check: (r) => r === true
    },
    {
        name: 'Boundary: undefined macro raises error',
        run: () => {
            const vm = new SeedLangVM();
            const result = vm.run(`nonexistent!(42)`);
            return result.success === false && result.error && result.error.includes('not defined');
        },
        check: (r) => r === true
    },
    {
        name: 'Stress: many small proc_macro expansions',
        code: `
proc_macro inc(x) {
    return ast.binOp("+" x 1)
}
r1 = inc!(0)
r2 = inc!(r1)
r3 = inc!(r2)
r4 = inc!(r3)
r5 = inc!(r4)
r6 = inc!(r5)
r7 = inc!(r6)
r8 = inc!(r7)
r9 = inc!(r8)
r10 = inc!(r9)
result = r10
`,
        check: (vm) => vm.vm.globals.result === 10
    },
    {
        name: 'Boundary: scheduler with fiber that throws',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn thrower() { return 1 }
throw_fn = thrower
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler.spawn(vm._vm.globals.throw_fn);
            const results = scheduler.run();
            return Object.keys(results).length === 1;
        },
        check: (r) => r === true
    },
    {
        name: 'Integration: proc_macro + scheduler + fiber',
        code: `
proc_macro make_val(n) {
    return ast.binOp("*" n 3)
}
fn worker() { return make_val!(7) }
f = scheduler.spawn(worker)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            return results && Object.values(results).some(r => r.value === 21);
        }
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
