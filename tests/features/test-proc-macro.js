const { SeedLangVM } = require('../../src/runtime/vm.js');

console.log('=== Procedural Macro Tests ===\n');

const tests = [
    {
        name: 'proc_macro double value',
        code: `
proc_macro double(x) {
    return ast.binOp("*" x 2)
}
result = double!(5)
`,
        check: (actual) => actual === 10
    },
    {
        name: 'proc_macro triple value',
        code: `
proc_macro triple(x) {
    return ast.binOp("*" x 3)
}
result = triple!(7)
`,
        check: (actual) => actual === 21
    },
    {
        name: 'proc_macro negate value',
        code: `
proc_macro negate(x) {
    return ast.unaryOp("-" x)
}
result = negate!(10)
`,
        check: (actual) => actual === -10
    },
    {
        name: 'proc_macro compute at compile time - power2',
        code: `
proc_macro power2(n) {
    result = 1
    i = 0
    while i < n {
        result = result * 2
        i = i + 1
    }
    return ast.num(result)
}
result = power2!(10)
`,
        check: (actual) => actual === 1024
    },
    {
        name: 'proc_macro string concatenation',
        code: `
proc_macro greet(name) {
    return ast.binOp("+" ast.str("Hello ") name)
}
result = greet!("World")
`,
        check: (actual) => actual === 'Hello World'
    },
    {
        name: 'proc_macro generate function',
        code: `
proc_macro make_adder(n) {
    return ast.fn("adder" ["a"] [ast.ret(ast.binOp("+" ast.id("a") n))])
}
adder_fn = make_adder!(10)
result = adder_fn(5)
`,
        check: (actual) => actual === 15
    },
    {
        name: 'proc_macro generate multiplier function',
        code: `
proc_macro make_multiplier(n) {
    return ast.fn("multiplier" ["x"] [ast.ret(ast.binOp("*" ast.id("x") n))])
}
mul_fn = make_multiplier!(6)
result = mul_fn(7)
`,
        check: (actual) => actual === 42
    },
    {
        name: 'proc_macro with identifier argument',
        code: `
proc_macro wrap_in_parens(expr) {
    return ast.binOp("+" ast.str("(") ast.binOp("+" expr ast.str(")")))
}
result = wrap_in_parens!("hi")
`,
        check: (actual) => actual === '(hi)'
    },
    {
        name: 'proc_macro nested - double then add',
        code: `
proc_macro double(x) {
    return ast.binOp("*" x 2)
}
proc_macro add_one(x) {
    return ast.binOp("+" x 1)
}
result = add_one!(double!(4))
`,
        check: (actual) => actual === 9
    },
    {
        name: 'proc_macro compute factorial',
        code: `
proc_macro factorial(n) {
    result = 1
    i = 2
    while i <= n {
        result = result * i
        i = i + 1
    }
    return ast.num(result)
}
result = factorial!(6)
`,
        check: (actual) => actual === 720
    },
    {
        name: 'proc_macro with boolean literal',
        code: `
proc_macro always_true(x) {
    return ast.bool(true)
}
result = always_true!(0)
`,
        check: (actual) => actual === true
    },
    {
        name: 'proc_macro with null literal',
        code: `
proc_macro always_null(x) {
    return ast.null()
}
result = always_null!(42)
`,
        check: (actual) => actual === null
    },
    {
        name: 'proc_macro generate array literal',
        code: `
proc_macro make_array(n) {
    return ast.arr([ast.num(1) ast.num(2) ast.num(3)])
}
result = make_array!(0)
`,
        check: (actual) => JSON.stringify(actual) === JSON.stringify([1, 2, 3])
    },
    {
        name: 'proc_macro and regular macro coexist',
        code: `
macro square(x) {
    return x * x
}
proc_macro cube(x) {
    return ast.binOp("*" ast.binOp("*" x x) x)
}
r1 = square!(4)
r2 = cube!(3)
result = r1 + r2
`,
        check: (actual) => actual === 43
    },
    {
        name: 'proc_macro with string argument',
        code: `
proc_macro shout(s) {
    return ast.binOp("+" s ast.str("!!!"))
}
result = shout!("Hey")
`,
        check: (actual) => actual === 'Hey!!!'
    },
    {
        name: 'proc_macro generate variable declaration',
        code: `
proc_macro define_const(val) {
    return ast.varDecl("my_const" ast.num(val))
}
define_const!(42)
result = my_const
`,
        check: (actual) => actual === 42
    },
    {
        name: 'proc_macro compute fibonacci at compile time',
        code: `
proc_macro fib(n) {
    a = 0
    b = 1
    i = 0
    while i < n {
        c = a + b
        a = b
        b = c
        i = i + 1
    }
    return ast.num(a)
}
result = fib!(10)
`,
        check: (actual) => actual === 55
    },
    {
        name: 'proc_macro generate comparison expression',
        code: `
proc_macro greater_than_10(x) {
    return ast.binOp(">" x 10)
}
result = greater_than_10!(15)
`,
        check: (actual) => actual === true
    },
    {
        name: 'proc_macro generate less-than expression',
        code: `
proc_macro less_than_10(x) {
    return ast.binOp("<" x 10)
}
result = less_than_10!(5)
`,
        check: (actual) => actual === true
    },
    {
        name: 'proc_macro chained arithmetic',
        code: `
proc_macro add_three(x) {
    return ast.binOp("+" ast.binOp("+" ast.binOp("+" x 1) 1) 1)
}
result = add_three!(10)
`,
        check: (actual) => actual === 13
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
