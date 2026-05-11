function fib(n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}

const test = process.argv[2];
if (test === 'fib') {
    console.log(fib(35));
} else if (test === 'loop') {
    let total = 0;
    for (let i = 0; i < 100000000; i++) total += i;
    console.log(total);
} else if (test === 'array') {
    const arr = [];
    for (let i = 0; i < 1000000; i++) arr.push(i);
    console.log(arr.length);
} else if (test === 'nested') {
    let total = 0;
    for (let i = 0; i < 500; i++)
        for (let j = 0; j < 500; j++)
            total += i * j;
    console.log(total);
} else if (test === 'string') {
    let s = '';
    for (let i = 0; i < 100000; i++) s += 'a';
    console.log(s.length);
} else if (test === 'math') {
    let total = 0.0;
    for (let i = 0; i < 1000000; i++) total += Math.sqrt(i + 1);
    console.log(Math.round(total));
}
