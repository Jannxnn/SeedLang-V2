const { SeedLangVM } = require('../../src/runtime/vm.js');
const { FiberScheduler } = require('../../src/runtime/vm/fiber_scheduler');

console.log('=== Preemptive Scheduler Tests ===\n');

const tests = [
    {
        name: 'Scheduler spawn and run basic fiber',
        code: `
fn add(a b) { return a + b }
f = scheduler.spawn(add)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            return results && Object.keys(results).length > 0;
        }
    },
    {
        name: 'Scheduler spawn multiple fibers',
        code: `
fn task_a() { return 10 }
fn task_b() { return 20 }
fn task_c() { return 30 }
f1 = scheduler.spawn(task_a)
f2 = scheduler.spawn(task_b)
f3 = scheduler.spawn(task_c)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            if (!results) return false;
            const vals = Object.values(results).map(r => r.value);
            return vals.includes(10) && vals.includes(20) && vals.includes(30);
        }
    },
    {
        name: 'Scheduler with yield fiber',
        code: `
fn gen() {
    yield 1
    yield 2
    return 3
}
f = scheduler.spawn(gen)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            return results && Object.values(results).some(r => r.value === 3);
        }
    },
    {
        name: 'Scheduler fiber count',
        code: `
fn t1() { return 1 }
fn t2() { return 2 }
scheduler.spawn(t1)
scheduler.spawn(t2)
count = scheduler.fiberCount()
`,
        check: (vm) => vm.vm.globals.count === 2
    },
    {
        name: 'Scheduler kill fiber',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn long_task() {
    i = 0
    while i < 100000 {
        i = i + 1
    }
    return i
}
long_fn = long_task
`);
            const scheduler = new FiberScheduler(vm._vm);
            const f1 = scheduler.spawn(vm._vm.globals.long_fn);
            const killed = scheduler.kill(f1._schedulerId);
            return killed === true && scheduler._fibers.size === 0;
        },
        check: (result) => result === true
    },
    {
        name: 'Scheduler killAll fibers',
        code: `
fn t1() { return 1 }
fn t2() { return 2 }
scheduler.spawn(t1)
scheduler.spawn(t2)
scheduler.killAll()
count = scheduler.fiberCount()
`,
        check: (vm) => vm.vm.globals.count === 0
    },
    {
        name: 'Preemptive scheduler via direct API - CPU bound fiber',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn cpu_work() {
    i = 0
    while i < 5000 {
        i = i + 1
    }
    return i
}
fn instant() { return 42 }
cpu_fn = cpu_work
inst_fn = instant
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler._preemptive = true;
            scheduler._timeSliceSize = 512;
            const f1 = scheduler.spawn(vm._vm.globals.cpu_fn);
            const f2 = scheduler.spawn(vm._vm.globals.inst_fn);
            const results = scheduler.run();
            return results['1']?.value === 5000 && results['2']?.value === 42;
        },
        check: (result) => result === true
    },
    {
        name: 'Preemptive scheduler - fiber gets preempted multiple times',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn heavy() {
    i = 0
    while i < 10000 {
        i = i + 1
    }
    return i
}
heavy_fn = heavy
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler._preemptive = true;
            scheduler._timeSliceSize = 256;
            const f1 = scheduler.spawn(vm._vm.globals.heavy_fn);
            const results = scheduler.run();
            return results['1']?.value === 10000 && f1._ticks > 1;
        },
        check: (result) => result === true
    },
    {
        name: 'Cooperative scheduler - no preemption',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn task() { return 99 }
task_fn = task
`);
            const scheduler = new FiberScheduler(vm._vm);
            scheduler._preemptive = false;
            const f1 = scheduler.spawn(vm._vm.globals.task_fn);
            const results = scheduler.run();
            return results['1']?.value === 99;
        },
        check: (result) => result === true
    },
    {
        name: 'Scheduler status tracking',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn t() { return 1 }
t_fn = t
`);
            const scheduler = new FiberScheduler(vm._vm);
            const f1 = scheduler.spawn(vm._vm.globals.t_fn);
            const statusBefore = scheduler.getStatus();
            scheduler.run();
            const statusAfter = scheduler.getStatus();
            return statusBefore.activeFibers > 0 && statusAfter.activeFibers === 0;
        },
        check: (result) => result === true
    },
    {
        name: 'Scheduler with fiber returning complex value',
        code: `
fn make_obj() {
    return { x: 10 y: 20 }
}
f = scheduler.spawn(make_obj)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            if (!results) return false;
            const vals = Object.values(results);
            return vals.some(r => r.value && r.value.x === 10 && r.value.y === 20);
        }
    },
    {
        name: 'Scheduler with fiber returning array',
        code: `
fn make_arr() {
    return [1 2 3]
}
f = scheduler.spawn(make_arr)
results = scheduler.run()
`,
        check: (vm) => {
            const results = vm.vm.globals.results;
            if (!results) return false;
            const vals = Object.values(results);
            return vals.some(r => r.value && JSON.stringify(r.value) === JSON.stringify([1, 2, 3]));
        }
    },
    {
        name: 'Preemptive scheduler - multiple CPU fibers interleaved',
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
            const f1 = scheduler.spawn(vm._vm.globals.work_fn, [1000]);
            const f2 = scheduler.spawn(vm._vm.globals.work_fn, [2000]);
            const f3 = scheduler.spawn(vm._vm.globals.work_fn, [3000]);
            const results = scheduler.run();
            return results['1']?.value === 1000 && results['2']?.value === 2000 && results['3']?.value === 3000;
        },
        check: (result) => result === true
    },
    {
        name: 'Scheduler currentFiber returns null outside run',
        code: `
cf = scheduler.currentFiber()
result = cf
`,
        check: (vm) => vm.vm.globals.result === null || vm.vm.globals.result === undefined
    },
    {
        name: 'Scheduler result of completed fiber',
        run: () => {
            const vm = new SeedLangVM();
            vm.run(`
fn compute() { return 7 * 6 }
compute_fn = compute
`);
            const scheduler = new FiberScheduler(vm._vm);
            const f1 = scheduler.spawn(vm._vm.globals.compute_fn);
            scheduler.run();
            const r = scheduler._results.get(f1._schedulerId);
            return r && r.value === 42;
        },
        check: (result) => result === true
    }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    try {
        let checkResult;

        if (test.run) {
            checkResult = test.check(test.run());
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
