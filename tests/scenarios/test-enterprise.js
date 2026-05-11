// 企业级场景测试：验证企业应用常见模式（配置管理/权限控制/数据校验/日志审计）

const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;
const errors = [];
const performance = {};

function test(name, fn) {
    try {
        const start = Date.now();
        fn();
        const time = Date.now() - start;
        performance[name] = time;
        console.log(`[PASS] ${name} (${time}ms)`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        errors.push({ name, error: e.message });
        failed++;
    }
}

function assertEqual(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(`${msg} Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
    }
}

function assertContains(str, substr) {
    if (!String(str).includes(substr)) {
        throw new Error(`Expected "${substr}" in "${str}"`);
    }
}

console.log('========================================');
console.log('  SeedLang Enterprise Scenario Tests');
console.log('========================================\n');

console.log('[1. Enterprise Data Processing]');

test('JSON Data Parsing', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
data = parse('{"users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}')
users = data["users"]
print(len(users))
print(users[0]["name"])
`);
    assertEqual(r.output, ['2', 'Alice']);
});

test('Config Object Processing', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
config = {
    database: {
        host: "localhost"
        port: 5432
    }
    features: ["auth" "logging"]
}
dbHost = config.database.host
features = config.features
print(dbHost)
print(len(features))
`);
    assertEqual(r.output, ['localhost', '2']);
});

test('Batch Data Processing', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
records = []
i = 0
while i < 100 {
    push(records {id: i value: i * 2})
    i = i + 1
}
total = 0
for r in records {
    total = total + r.value
}
print(len(records))
print(total)
`);
    assertEqual(r.output, ['100', '9900']);
});

console.log('\n[2. Algorithm Competition]');

test('Dynamic Programming - Fibonacci', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn fib(n) {
    if n <= 1 { return n }
    return fib(n - 1) + fib(n - 2)
}
print(fib(20))
`);
    assertEqual(r.output[0], '6765');
});

test('Binary Search', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn binarySearch(arr target) {
    left = 0
    right = len(arr) - 1
    while left <= right {
        mid = (left + right) / 2
        if arr[mid] == target {
            return mid
        } else if arr[mid] < target {
            left = mid + 1
        } else {
            right = mid - 1
        }
    }
    return -1
}
arr = [1 3 5 7 9 11 13]
print(binarySearch(arr 7))
print(binarySearch(arr 4))
`);
    assertEqual(r.output, ['3', '-1']);
});

test('Bubble Sort', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn bubbleSort(arr) {
    n = len(arr)
    i = 0
    while i < n - 1 {
        j = 0
        while j < n - i - 1 {
            if arr[j] > arr[j + 1] {
                temp = arr[j]
                arr[j] = arr[j + 1]
                arr[j + 1] = temp
            }
            j = j + 1
        }
        i = i + 1
    }
    return arr
}
arr = [64 34 25 12 22 11 90]
sorted = bubbleSort(arr)
print(sorted[0])
print(sorted[6])
`);
    assertEqual(r.output, ['11', '90']);
});

console.log('\n[3. Scientific Computing]');

test('Numerical Computation - Factorial', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn factorial(n) {
    if n <= 1 { return 1 }
    return n * factorial(n - 1)
}
print(factorial(10))
`);
    assertEqual(r.output[0], '3628800');
});

test('Matrix Operations', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn matMul(A B) {
    rowsA = len(A)
    colsA = len(A[0])
    colsB = len(B[0])
    C = []
    i = 0
    while i < rowsA {
        row = []
        j = 0
        while j < colsB {
            sum = 0
            k = 0
            while k < colsA {
                sum = sum + A[i][k] * B[k][j]
                k = k + 1
            }
            push(row sum)
            j = j + 1
        }
        push(C row)
        i = i + 1
    }
    return C
}
A = []
row1 = []
push(row1 1)
push(row1 2)
push(A row1)
row2 = []
push(row2 3)
push(row2 4)
push(A row2)
B = []
row3 = []
push(row3 5)
push(row3 6)
push(B row3)
row4 = []
push(row4 7)
push(row4 8)
push(B row4)
C = matMul(A B)
print(C[0][0])
print(C[1][1])
`);
    assertEqual(r.output, ['19', '50']);
});

test('Statistical Calculation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn mean(arr) {
    sum = 0
    for x in arr {
        sum = sum + x
    }
    return sum / len(arr)
}
data = [1 2 3 4 5 6 7 8 9 10]
m = mean(data)
print(m)
`);
    assertEqual(r.output[0], '5.5');
});

console.log('\n[4. Text Processing]');

test('String Concatenation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
parts = ["Hello" "World" "SeedLang"]
result = ""
for p in parts {
    result = result + p + " "
}
print(trim(result))
`);
    assertContains(r.output[0], 'Hello');
});

test('String Transformation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
text = "hello world"
print(upper(text))
print(lower("WORLD"))
`);
    assertEqual(r.output, ['HELLO WORLD', 'world']);
});

test('String Length Calculation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
text = "The quick brown fox jumps over the lazy dog"
words = tokens(text)
print(len(text))
print(words)
`);
    assertEqual(r.output, ['43', '9']);
});

console.log('\n[5. State Machine and Protocol]');

test('HTTP State Machine Simulation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn handleRequest(method path) {
    if method == "GET" {
        if path == "/" {
            return 200
        } else if path == "/api" {
            return 200
        } else {
            return 404
        }
    } else if method == "POST" {
        if path == "/api/users" {
            return 201
        } else {
            return 400
        }
    } else if method == "DELETE" {
        return 204
    } else {
        return 405
    }
}
print(handleRequest("GET" "/"))
print(handleRequest("GET" "/unknown"))
print(handleRequest("POST" "/api/users"))
print(handleRequest("DELETE" "/api/users/1"))
print(handleRequest("PUT" "/api/users"))
`);
    assertEqual(r.output, ['200', '404', '201', '204', '405']);
});

test('Simple Expression Parsing', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn calc(a op b) {
    if op == "+" { return a + b }
    if op == "-" { return a - b }
    if op == "*" { return a * b }
    if op == "/" { return a / b }
    return 0
}
print(calc(10 "+" 5))
print(calc(10 "*" 5))
print(calc(10 "/" 2))
`);
    assertEqual(r.output, ['15', '50', '5']);
});

test('State Transition', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
state = "idle"
events = ["start" "process" "process" "stop"]
for e in events {
    if state == "idle" and e == "start" {
        state = "running"
    } else if state == "running" and e == "process" {
        state = "processing"
    } else if state == "processing" and e == "process" {
        state = "running"
    } else if state == "running" and e == "stop" {
        state = "stopped"
    }
}
print(state)
`);
    assertEqual(r.output[0], 'stopped');
});

console.log('\n[6. Error Handling and Recovery]');

test('Null Value Handling', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn safeGet(obj key default) {
    val = obj[key]
    if val == null {
        return default
    }
    return val
}
obj = {a: 1}
neg1 = -1
print(safeGet(obj "a" neg1))
print(safeGet(obj "b" neg1))
`);
    assertEqual(r.output, ['1', '-1']);
});

test('Boundary Check', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn safeArray(arr idx) {
    if idx < 0 or idx >= len(arr) {
        return null
    }
    return arr[idx]
}
arr = [1 2 3]
print(safeArray(arr 1))
print(safeArray(arr 10))
`);
    assertEqual(r.output, ['2', 'null']);
});

test('Type Checking', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn checkType(val) {
    t = type(val)
    if t == "number" { return "numeric" }
    if t == "string" { return "text" }
    if t == "boolean" { return "flag" }
    return "other"
}
print(checkType(42))
print(checkType("hello"))
print(checkType(true))
`);
    assertEqual(r.output, ['numeric', 'text', 'flag']);
});

console.log('\n[7. Performance Stress]');

test('Large Dataset Processing', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
data = []
i = 0
while i < 1000 {
    push(data i)
    i = i + 1
}
sum = 0
for x in data {
    sum = sum + x
}
print(len(data))
print(sum)
`);
    assertEqual(r.output, ['1000', '499500']);
});

test('Recursion Depth Stress', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn deepRecurse(n acc) {
    if n == 0 { return acc }
    return deepRecurse(n - 1 acc + 1)
}
result = deepRecurse(100 0)
print(result)
`);
    assertEqual(r.output[0], '100');
});

test('Object Creation Stress', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
objects = []
i = 0
while i < 500 {
    obj = {id: i value: i * 2}
    push(objects obj)
    i = i + 1
}
count = 0
for obj in objects {
    if obj.value > 500 {
        count = count + 1
    }
}
print(len(objects))
print(count)
`);
    assertEqual(r.output, ['500', '249']);
});

test('String Concatenation Stress', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
result = ""
i = 0
while i < 500 {
    result = result + "x"
    i = i + 1
}
print(len(result))
`);
    assertEqual(r.output[0], '500');
});

console.log('\n[8. Complex Business Logic]');

test('Shopping Cart Calculation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
cart = [
    {name: "apple" price: 5 qty: 3}
    {name: "banana" price: 3 qty: 5}
    {name: "orange" price: 4 qty: 2}
]
subtotal = 0
for item in cart {
    subtotal = subtotal + item.price * item.qty
}
tax = subtotal * 0.1
total = subtotal + tax
print(subtotal)
print(total > 40)
`);
    assertEqual(r.output, ['38', 'true']);
});

test('User Permission Check', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
fn hasPermission(user resource action) {
    role = user.role
    permissions = user.permissions
    
    if role == "admin" {
        return true
    }
    
    for p in permissions {
        if p.resource == resource and p.action == action {
            return true
        }
    }
    return false
}

admin = {role: "admin" permissions: []}
user = {role: "user" permissions: [
    {resource: "posts" action: "read"}
    {resource: "posts" action: "write"}
]}

print(hasPermission(admin "users" "delete"))
print(hasPermission(user "posts" "read"))
print(hasPermission(user "users" "delete"))
`);
    assertEqual(r.output, ['true', 'true', 'false']);
});

test('Data Aggregation', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
sales = [
    {region: "north" amount: 100}
    {region: "south" amount: 150}
    {region: "north" amount: 200}
    {region: "east" amount: 120}
    {region: "south" amount: 180}
]

northTotal = 0
southTotal = 0
otherTotal = 0

for s in sales {
    if s.region == "north" {
        northTotal = northTotal + s.amount
    } else if s.region == "south" {
        southTotal = southTotal + s.amount
    } else {
        otherTotal = otherTotal + s.amount
    }
}

print(northTotal)
print(southTotal)
print(otherTotal)
`);
    assertEqual(r.output, ['300', '330', '120']);
});

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
    console.log('\n[SUCCESS] All enterprise scenario tests passed!');
}

console.log('\n--- Performance Data (ms) ---');
const perfEntries = Object.entries(performance).sort((a, b) => b[1] - a[1]);
for (const [name, time] of perfEntries.slice(0, 10)) {
    console.log(`  ${name}: ${time}ms`);
}
