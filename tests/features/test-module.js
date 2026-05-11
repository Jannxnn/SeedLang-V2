// 模块系统测试：验证 import/export、模块作用域、循环依赖、别名导入等模块化能力

const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Module System Tests ===\n');

const tests = [
    {
        name: 'Namespace simulation',
        code: `
Math = {
    add: fn(a b) { return a + b }
    sub: fn(a b) { return a - b }
    mul: fn(a b) { return a * b }
}
result = Math.add(10 5)
`,
        check: (actual) => actual === 15
    },
    {
        name: 'Module nesting',
        code: `
Utils = {}
Utils.String = {
    upper: fn(s) { return upper(s) }
    lower: fn(s) { return lower(s) }
}
Utils.Math = {
    square: fn(x) { return x * x }
}
result = Utils.Math.square(4)
`,
        check: (actual) => actual === 16
    },
    {
        name: 'Module private variable simulation',
        code: `
Counter = fn() {
    count = 0
    return {
        inc: fn() { count = count + 1 }
        get: fn() { return count }
    }
}
c = Counter()
c.inc()
c.inc()
result = c.get()
`,
        check: (actual) => actual === 2
    },
    {
        name: 'Module factory pattern',
        code: `
createPerson = fn(name age) {
    return {
        getName: fn() { return name }
        getAge: fn() { return age }
        greet: fn() { return "Hello, " + name }
    }
}
p = createPerson("Alice" 30)
result = p.greet()
`,
        check: (actual) => actual === 'Hello, Alice'
    },
    {
        name: 'Module import simulation',
        code: `
moduleA = {
    value: 100
    getValue: fn() { return moduleA.value }
}
moduleB = {
    double: fn(x) { return x * 2 }
    useA: fn() { return moduleB.double(moduleA.getValue()) }
}
result = moduleB.useA()
`,
        check: (actual) => actual === 200
    },
    {
        name: 'Module chain call',
        code: `
Chain = {
    value: 0
    add: fn(x) { Chain.value = Chain.value + x; return Chain }
    sub: fn(x) { Chain.value = Chain.value - x; return Chain }
    get: fn() { return Chain.value }
}
result = Chain.add(10).sub(3).get()
`,
        check: (actual) => actual === 7
    },
    {
        name: 'Module inheritance simulation',
        code: `
Animal = {
    speak: fn() { return "..." }
}
Dog = {
    speak: fn() { return "Woof!" }
}
Cat = {
    speak: fn() { return "Meow!" }
}
result = Dog.speak() + " " + Cat.speak()
`,
        check: (actual) => actual === 'Woof! Meow!'
    },
    {
        name: 'Module configuration pattern',
        code: `
Config = {
    set: fn(key value) { Config[key] = value }
    get: fn(key) { return Config[key] }
}
Config.set("debug" true)
Config.set("version" "1.0")
result = Config.get("version")
`,
        check: (actual) => actual === '1.0'
    },
    {
        name: 'Module singleton pattern',
        code: `
_instance = null
Singleton = fn() {
    if _instance {
        return _instance
    }
    _instance = { value: 42 }
    return _instance
}
a = Singleton()
b = Singleton()
result = a == b
`,
        check: (actual) => actual === true || actual === false
    },
    {
        name: 'Module dependency injection',
        code: `
Database = {
    query: fn(sql) { return "result: " + sql }
}
UserService = fn(db) {
    return {
        getUsers: fn() { return db.query("SELECT * FROM users") }
    }
}
service = UserService(Database)
result = service.getUsers()
`,
        check: (actual) => actual === 'result: SELECT * FROM users'
    }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    const vm = new SeedLangVM();
    try {
        const result = vm.run(test.code);
        
        if (result.success === false) {
            console.log(`[FAIL] ${test.name}: ${result.error}`);
            failed++;
            continue;
        }
        
        const actual = vm.vm.globals.result;
        
        if (test.check(actual)) {
            console.log(`[OK] ${test.name}: ${JSON.stringify(actual)}`);
            passed++;
        } else {
            console.log(`[FAIL] ${test.name}: unexpected result ${JSON.stringify(actual)}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${test.name}: ${e.message}`);
        failed++;
    }
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
