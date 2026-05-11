/**
 * 类与对象系统测试：验证 class 定义、实例化、方法调用、继承、this 绑定、静态成员等 OOP 特性
 * Class and Object Test Suite
 */
const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
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

function assertEqual(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(`${msg} Expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`);
    }
}

console.log('========================================');
console.log('  SeedLang Class and Object Tests');
console.log('========================================\n');

test('Basic class definition', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class Person {
    init(name) {
        this.name = name
    }
}

p = Person("Alice")
print(p.name)
`);
    assertEqual(r.output, ['Alice']);
});

test('Class methods', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class Calculator {
    add(a b) {
        return a + b
    }
    
    multiply(a b) {
        return a * b
    }
}

calc = Calculator()
print(calc.add(5 3))
print(calc.multiply(4 7))
`);
    assertEqual(r.output, ['8', '28']);
});

test('Multiple instances', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class Counter {
    init(start) {
        this.count = start
    }
    
    increment() {
        this.count = this.count + 1
        return this.count
    }
}

c1 = Counter(0)
c2 = Counter(10)
print(c1.increment())
print(c1.increment())
print(c2.increment())
print(c1.count)
print(c2.count)
`);
    assertEqual(r.output, ['1', '2', '11', '2', '11']);
});

test('Constructor with multiple params', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class Rectangle {
    init(width height) {
        this.width = width
        this.height = height
    }
    
    area() {
        return this.width * this.height
    }
}

rect = Rectangle(5 10)
print(rect.area())
`);
    assertEqual(r.output, ['50']);
});

test('Method modifying properties', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class BankAccount {
    init(initial) {
        this.balance = initial
    }
    
    deposit(amount) {
        this.balance = this.balance + amount
    }
    
    withdraw(amount) {
        this.balance = this.balance - amount
    }
}

account = BankAccount(100)
account.deposit(50)
account.withdraw(30)
print(account.balance)
`);
    assertEqual(r.output, ['120']);
});

test('Empty class', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class Empty {}

e = Empty()
print(e)
`);
    assertEqual(r.success, true);
});

test('Method calling other methods', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class Math {
    square(x) {
        return x * x
    }
    
    sumSquares(a b) {
        return this.square(a) + this.square(b)
    }
}

m = Math()
print(m.sumSquares(3 4))
`);
    assertEqual(r.output, ['25']);
});

test('Dynamic property addition', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class Dynamic {}

obj = Dynamic()
obj.x = 10
obj.y = 20
print(obj.x + obj.y)
`);
    assertEqual(r.output, ['30']);
});

test('Class as data container', () => {
    const vm = new SeedLangVM();
    const r = vm.run(`
class Point {
    init(x y) {
        this.x = x
        this.y = y
    }
    
    sum() {
        return this.x + this.y
    }
}

p = Point(3 4)
print(p.sum())
`);
    assertEqual(r.output, ['7']);
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
    console.log('\n[SUCCESS] All class and object tests passed!');
}
