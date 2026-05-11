const { SeedLangVM } = require('../../src/runtime/vm.js');

let passed = 0;
let failed = 0;

function test(name, code, check) {
    const vm = new SeedLangVM();
    try {
        const result = vm.run(code);
        const actual = vm.vm.globals.result;
        if (check(actual)) {
            console.log(`[OK] ${name}`);
            passed++;
        } else {
            console.log(`[FAIL] ${name}: got ${JSON.stringify(actual)}`);
            failed++;
        }
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

console.log('=== Class Inheritance Tests ===\n');

console.log('--- Basic inheritance ---');
test('Child inherits parent method', `
class Animal {
    fn speak() { return "generic sound" }
}
class Dog extends Animal {
}
d = Dog()
result = d.speak()
`, (a) => a === 'generic sound');

test('Child overrides parent method', `
class Animal {
    fn speak() { return "generic" }
}
class Dog extends Animal {
    fn speak() { return "bark" }
}
d = Dog()
result = d.speak()
`, (a) => a === 'bark');

test('Child inherits parent property', `
class Base {
    fn init() { this.value = 42 }
}
class Child extends Base {
    fn init() { super() }
}
c = Child()
result = c.value
`, (a) => a === 42);

console.log('\n--- super() constructor call ---');
test('super() passes args to parent init', `
class Animal {
    fn init(name) { this.name = name }
}
class Dog extends Animal {
    fn init(name breed) {
        super(name)
        this.breed = breed
    }
}
d = Dog("Rex" "Lab")
result = d.name
`, (a) => a === 'Rex');

test('super() sets parent props, child adds own', `
class Animal {
    fn init(name) { this.name = name }
}
class Dog extends Animal {
    fn init(name breed) {
        super(name)
        this.breed = breed
    }
}
d = Dog("Rex" "Lab")
result = d.breed
`, (a) => a === 'Lab');

console.log('\n--- super.method() call ---');
test('super.method() calls parent method', `
class Shape {
    fn init(name) { this.name = name }
    fn describe() { return "Shape: " + this.name }
}
class Rectangle extends Shape {
    fn init(w h) {
        super.init("Rectangle")
        this.w = w
        this.h = h
    }
    fn area() { return this.w * this.h }
}
r = Rectangle(3 4)
result = r.describe()
`, (a) => a === 'Shape: Rectangle');

test('Child calls super method then extends', `
class Base {
    fn greet() { return "Hello" }
}
class Child extends Base {
    fn greet() { return super.greet() + " World" }
}
c = Child()
result = c.greet()
`, (a) => a === 'Hello World');

console.log('\n--- Multi-level inheritance ---');
test('Three-level inheritance', `
class A {
    fn who() { return "A" }
}
class B extends A {
    fn who() { return "B" }
}
class C extends B {
}
c = C()
result = c.who()
`, (a) => a === 'B');

test('Three-level with super chain', `
class A {
    fn init() { this.a = 1 }
}
class B extends A {
    fn init() {
        super()
        this.b = 2
    }
}
class C extends B {
    fn init() {
        super()
        this.c = 3
    }
}
c = C()
result = c.a + c.b + c.c
`, (a) => a === 6);

test('Method lookup walks up chain', `
class A {
    fn onlyInA() { return 100 }
}
class B extends A {
}
class C extends B {
}
c = C()
result = c.onlyInA()
`, (a) => a === 100);

console.log('\n--- Inheritance with method override + parent call ---');
test('Override method uses super', `
class Counter {
    fn init() { this.count = 0 }
    fn inc() { this.count = this.count + 1 }
}
class DoubleCounter extends Counter {
    fn inc() {
        super.inc()
        super.inc()
    }
}
dc = DoubleCounter()
dc.inc()
result = dc.count
`, (a) => a === 2);

console.log('\n--- Inheritance with arrays/objects ---');
test('Inherited method operates on child state', `
class Stack {
    fn init() { this.items = [] }
    fn push(x) { push(this.items x) }
    fn size() { return len(this.items) }
}
class MaxStack extends Stack {
    fn init() { super() }
}
ms = MaxStack()
ms.push(1)
ms.push(2)
ms.push(3)
result = ms.size()
`, (a) => a === 3);

console.log(`\n=== Result: ${passed} passed ${failed} failed ===`);
