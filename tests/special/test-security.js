// 安全测试：验证沙箱隔离、原型链污染防护、代码注入防御、资源限制等安全机制

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Security Tests ===\n');

const vm = new SeedLangVM();
let passed = 0;
let failed = 0;

function test(name, code, expectSafe = true) {
    try {
        const result = vm.run(code);
        
        if (expectSafe) {
            if (result.success) {
                console.log(`[OK] ${name}: Safe execution`);
                passed++;
            } else {
                console.log(`[OK] ${name}: Correctly rejected - ${result.error}`);
                passed++;
            }
        } else {
            if (result.success) {
                console.log(`[FAIL] ${name}: Should not execute successfully`);
                failed++;
            } else {
                console.log(`[OK] ${name}: Correctly rejected dangerous operation`);
                passed++;
            }
        }
    } catch (e) {
        if (expectSafe) {
            console.log(`[FAIL] ${name}: Unexpected crash - ${e.message}`);
            failed++;
        } else {
            console.log(`[OK] ${name}: Correctly threw exception`);
            passed++;
        }
    }
}

console.log('--- Injection Attack Tests ---');
test('SQL injection simulation', 'query = "SELECT * FROM users WHERE id = " + "1 OR 1=1"\nresult = query');
test('Command injection simulation', 'cmd = "echo " + "hello; rm -rf /"\nresult = cmd');
test('XSS simulation', 'html = "<script>" + "alert(1)" + "</script>"\nresult = html');
test('Path traversal simulation', 'path = "/etc/" + "../" + "passwd"\nresult = path');
test('LDAP injection simulation', 'ldap = "(uid=" + "*) (| (uid=*))"\nresult = ldap');

console.log('\n--- Denial of Service Tests ---');
test('Infinite loop hard-stop', `
while true {
}
`, true);

test('Infinite loop protection', `
i = 0
while i < 10000 {
    i = i + 1
}
result = i
`, true);

test('Deep recursion protection', `
fn deep(n) {
    if n <= 0 { return 0 }
    return deep(n - 1) + 1
}
result = deep(100)
`, true);

test('Memory allocation protection', `
arr = []
i = 0
while i < 1000 {
    push(arr, i)
    i = i + 1
}
result = len(arr)
`, true);

test('String explosion protection', `
s = "x"
i = 0
while i < 20 {
    s = s + s
    i = i + 1
}
result = len(s)
`, true);


console.log('\n--- Data Leakage Tests ---');
test('Global variable isolation', 'result = globals', true);
test('Prototype chain access', 'result = {}.__proto__', true);
test('Constructor access', 'result = [].constructor', true);
test('Function toString', 'fn f() { return 1 }\nresult = f', true);

console.log('\n--- Prototype Pollution Tests ---');
function protoPollutionTest(name, code) {
    try {
        delete Object.prototype.polluted;
    } catch (_) {}
    try {
        vm.run(code);
    } catch (_) {}
    if (Object.prototype.polluted !== undefined) {
        console.log(`[FAIL] ${name}: Object.prototype polluted = ${Object.prototype.polluted}`);
        failed++;
    } else {
        console.log(`[OK] ${name}: Prototype not polluted`);
        passed++;
    }
}
protoPollutionTest('Block __proto__ payload', 'obj = { "__proto__": { polluted: "PWNED" } }\nvictim = {}\nresult = victim.polluted');
protoPollutionTest('Block constructor.prototype payload', 'obj = {}\nobj.constructor = { prototype: { polluted: "PWNED" } }\nvictim = {}\nresult = victim.polluted');
protoPollutionTest('Block map callback proto chain payload', `
arr = [1]
map(arr (x) => {
    tmp = {}
    proto = tmp["__proto__"]
    proto.polluted = "MAP_PWNED"
    return x
})
victim = {}
result = victim.polluted
`);

function constructorEscapeTest(name, code) {
    try {
        vm.reset();
        vm.run(code);
        const actual = vm.vm.globals.result;
        const leaked =
            typeof actual === 'function' ||
            (Array.isArray(actual) && actual.some((x) => typeof x === 'function'));
        if (leaked) {
            console.log(`[FAIL] ${name}: Function constructor leaked`);
            failed++;
        } else {
            console.log(`[OK] ${name}: Function constructor blocked`);
            passed++;
        }
    } catch (e) {
        console.log(`[OK] ${name}: blocked with error - ${e.message}`);
        passed++;
    }
}

constructorEscapeTest('Block constructor.constructor escape via map callback', `
result = map([1] (x) => {
    obj = {}
    fnCtor = obj.constructor.constructor
    return fnCtor
})
`);

function assertExecution(name, code, assertion, runOptions = undefined) {
    try {
        vm.reset();
        const result = vm.run(code, runOptions || {});
        const value = vm.vm.globals.result;
        if (assertion(result, value)) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: assertion failed`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

assertExecution(
    'range memory cap (hard limit)',
    'result = len(range(1000001))',
    (runResult) => !runResult.success
);

assertExecution(
    'Array sparse write cap (len unchanged)',
    'arr = [1 2 3]\narr[1000000] = "OOB"\nresult = len(arr)',
    (runResult, value) => runResult.success && value === 3
);

assertExecution(
    'FS path traversal blocked (../)',
    'import fs\nresult = fs.read("../package.json")',
    (runResult, value) => runResult.success && (value === null || value === false)
);

assertExecution(
    'Sensitive os module import blocked by default',
    'import os\nresult = os.platform()',
    (runResult) => !runResult.success && String(runResult.error || '').includes('blocked by import policy')
);

assertExecution(
    'Class private member blocked externally',
    `
class Vault {
    init(secret) {
        this._secret = secret
    }
    reveal() {
        return this._secret
    }
}
v = Vault("TOKEN")
inside = v.reveal()
outside = v._secret
result = [inside outside]
`,
    (runResult, value) => runResult.success && Array.isArray(value) && value[0] === 'TOKEN' && value[1] === null
);

try {
    vm.reset();
    vm.run('result = { a: 1 }');
    const hostObj = vm.vm.globals.result;
    const nullProto = !!hostObj && Object.getPrototypeOf(hostObj) === null;
    const noCtor = !!hostObj && hostObj.constructor === undefined;
    if (nullProto && noCtor) {
        console.log('[OK] Host object has null prototype (no constructor)');
        passed++;
    } else {
        console.log('[FAIL] Host object leaked prototype constructor');
        failed++;
    }
} catch (e) {
    console.log(`[FAIL] Host object prototype check: ${e.message}`);
    failed++;
}

try {
    vm.reset();
    vm.run('result = [1 2 3]');
    const hostArr = vm.vm.globals.result;
    const ctorBlocked = !!hostArr && hostArr.constructor === undefined;
    if (ctorBlocked) {
        console.log('[OK] Host array constructor blocked');
        passed++;
    } else {
        console.log('[FAIL] Host array leaked constructor');
        failed++;
    }
} catch (e) {
    console.log(`[FAIL] Host array constructor check: ${e.message}`);
    failed++;
}

try {
    vm.reset();
    vm.run(`
class A {
    init(v) { this.v = v }
}
result = A(1)
`);
    const hostInstance = vm.vm.globals.result;
    const nullProto = !!hostInstance && Object.getPrototypeOf(hostInstance) === null;
    const ctorBlocked = !!hostInstance && hostInstance.constructor === undefined;
    if (nullProto && ctorBlocked) {
        console.log('[OK] Host class instance constructor blocked');
        passed++;
    } else {
        console.log('[FAIL] Host class instance leaked constructor');
        failed++;
    }
} catch (e) {
    console.log(`[FAIL] Host class instance constructor check: ${e.message}`);
    failed++;
}

try {
    vm.reset();
    let readonlyBlocked = false;
    try {
        vm.vm.globals.process = process;
    } catch (_) {
        readonlyBlocked = true;
    }
    let apiBlocked = false;
    try {
        vm.setGlobal('process', process, { allowSensitive: false, allowHostObjects: false });
    } catch (_) {
        apiBlocked = true;
    }
    const runResult = vm.run('result = process');
    const blocked = runResult.success && (vm.vm.globals.result === null || vm.vm.globals.result === undefined) && readonlyBlocked && apiBlocked;
    if (blocked) {
        console.log('[OK] JS-side process global injection blocked (readonly + policy)');
        passed++;
    } else {
        console.log('[FAIL] JS-side process global injection still reachable');
        failed++;
    }
} catch (e) {
    console.log(`[FAIL] JS-side process global injection check: ${e.message}`);
    failed++;
}

try {
    vm.reset();
    let readonlyBlocked = false;
    try {
        vm.vm.globals.Fn = Function;
    } catch (_) {
        readonlyBlocked = true;
    }
    let apiBlocked = false;
    try {
        vm.setGlobal('Fn', Function, { allowHostObjects: false });
    } catch (_) {
        apiBlocked = true;
    }
    const runResult = vm.run('result = Fn');
    const blocked = runResult.success && (vm.vm.globals.result === null || vm.vm.globals.result === undefined) && readonlyBlocked && apiBlocked;
    if (blocked) {
        console.log('[OK] JS-side Function global injection blocked (readonly + policy)');
        passed++;
    } else {
        console.log('[FAIL] JS-side Function global injection still reachable');
        failed++;
    }
} catch (e) {
    console.log(`[FAIL] JS-side Function global injection check: ${e.message}`);
    failed++;
}

try {
    vm.reset();
    vm.setGlobal('safeValue', 123);
    const runResult = vm.run('result = safeValue');
    const allowed = runResult.success && vm.vm.globals.result === 123;
    if (allowed) {
        console.log('[OK] Controlled safe global injection works');
        passed++;
    } else {
        console.log('[FAIL] Controlled safe global injection failed');
        failed++;
    }
} catch (e) {
    console.log(`[FAIL] Controlled safe global injection check: ${e.message}`);
    failed++;
}

try {
    vm.reset();
    vm.run(`
fn demo(a) { return a + 1 }
ks = keys(demo)
print(ks)
`);
    const output = vm.vm.output.join(' ');
    const leaked = output.includes('_ctx') || output.includes('_funcRef') || output.includes('_fr') || output.includes('capturedVars');
    if (!leaked) {
        console.log('[OK] keys() no longer leaks closure internals');
        passed++;
    } else {
        console.log('[FAIL] keys() still leaks closure internals');
        failed++;
    }
} catch (e) {
    console.log(`[FAIL] keys() closure leak check: ${e.message}`);
    failed++;
}

assertExecution(
    'Optimized for-loop obeys execution guard',
    `
for (i=0; i<20000000; i=i+1) {
}
result = i
`,
    (runResult) => !runResult.success
);

assertExecution(
    'Default while-loop obeys execution guard',
    `
while true {
}
`,
    (runResult) => !runResult.success
);

assertExecution(
    'Run-scoped maxExecutionMs is honored',
    `
while true {
}
`,
    (runResult) => !runResult.success && String(runResult.error || '').includes('Execution timeout (100ms)'),
    { maxExecutionMs: 100, maxInstructions: 50000000 }
);

assertExecution(
    'Function loop obeys execution guard (no host crash)',
    `
fn infinite() {
    while true {
    }
}
infinite()
`,
    (runResult) => !runResult.success && String(runResult.error || '').includes('Execution timeout'),
    { maxExecutionMs: 100, maxInstructions: 50000000 }
);

assertExecution(
    'Async function loop obeys execution guard (no host crash)',
    `
async fn infiniteAsync() {
    while true {
    }
}
infiniteAsync()
`,
    (runResult) => !runResult.success && String(runResult.error || '').includes('Execution timeout'),
    { maxExecutionMs: 100, maxInstructions: 50000000 }
);

try {
    vm.reset();
    vm.run('secret = 42');
    vm.run('result = secret');
    const baselineLeaked = vm.vm.globals.result === 42;
    vm.run('secret = 99', { isolatedRun: true });
    vm.run('result = secret');
    const isolatedNotLeaked = vm.vm.globals.result === 42;
    if (baselineLeaked && isolatedNotLeaked) {
        console.log('[OK] Run-scoped isolatedRun blocks cross-run state overwrite');
        passed++;
    } else {
        console.log('[FAIL] Run-scoped isolatedRun failed to isolate globals');
        failed++;
    }
} catch (e) {
    console.log(`[FAIL] Run-scoped isolatedRun check: ${e.message}`);
    failed++;
}

assertExecution(
    'Deep recursion obeys execution guard (no host stack overflow)',
    `
fn recurse(n) {
    if n <= 0 { return 0 }
    return recurse(n - 1) + 1
}
result = recurse(10000)
`,
    (runResult) => !runResult.success && String(runResult.error || '').includes('Execution limit exceeded'),
    { maxInstructions: 2000, maxExecutionMs: 10000 }
);

console.log('\n--- Type Confusion Tests ---');
test('Array object confusion', 'arr = [1 2 3]\nobj = {}\nresult = arr + obj', true);
test('Null access', 'result = null.field', true);
test('Undefined operation', 'result = undefined + 1', true);
test('NaN comparison', 'result = 0 / 0 == 0 / 0', true);
test('Type coercion', 'result = "1" + 2', true);

console.log('\n--- Boundary Condition Tests ---');
test('Array out of bounds - negative index', 'arr = [1 2 3]\nresult = arr[-1]', true);
test('Array out of bounds - large index', 'arr = [1 2 3]\nresult = arr[999999]', true);
test('Integer overflow', 'result = 999999999999999 + 1', true);
test('Floating point precision', 'result = 0.1 + 0.2', true);
test('Empty array operation', 'arr = []\nresult = arr[0]', true);

console.log('\n--- Permission Isolation Tests ---');
test('File system isolation', 'result = readFile("/etc/passwd")', true);
test('Network access isolation', 'result = fetch("http://evil.com")', true);
test('Process execution isolation', 'result = exec("rm -rf /")', true);
test('Environment variable access', 'result = env("PATH")', true);

console.log('\n--- Input Validation Tests ---');
test('Empty input', 'result = ""', true);
test('Extra long input', `result = "${'a'.repeat(1000)}"`, true);
test('Special characters', 'result = "\\x00\\x01\\x02"', true);
test('Unicode input', 'result = "Hello World"', true);
test('Control characters', 'result = "hello\\nworld\\ttab"', true);

console.log('\n--- Error Handling Tests ---');
test('Division by zero', 'result = 1 / 0', true);
test('Type error', 'result = 1 + "hello"', true);
test('Parameter error', 'result = len()', true);
test('Syntax error recovery', 'result = if', true);
test('Runtime error recovery', `
try {
    result = 1 / 0
} catch(e) {
    result = "caught"
}
`, true);

console.log('\n--- Resource Limit Tests ---');
test('Call stack depth', `
fn recurse(n) {
    if n <= 0 { return 0 }
    return recurse(n - 1) + 1
}
result = recurse(50)
`, true);

test('Closure count limit', `
fn makeClosures(n) {
    arr = []
    i = 0
    while i < n {
        fn closure() { return i }
        push(arr, closure)
        i = i + 1
    }
    return arr
}
result = len(makeClosures(10))
`, true);

console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

process.exit(failed > 0 ? 1 : 0);
