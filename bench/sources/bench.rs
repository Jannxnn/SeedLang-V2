use std::io::{self, Write};

fn fib(n: i64) -> i64 {
    if n <= 1 { return n; }
    fib(n - 1) + fib(n - 2)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 { eprintln!("Usage: bench <test>"); std::process::exit(1); }
    let test = &args[1];

    if test == "fib" {
        println!("{}", fib(35));
    } else if test == "loop" {
        let mut total: i64 = 0;
        for i in 0..100_000_000i64 { total += i; }
        println!("{}", total);
    } else if test == "array" {
        let mut arr: Vec<i64> = Vec::with_capacity(1_000_000);
        for i in 0..1_000_000 { arr.push(i); }
        println!("{}", arr.len());
    } else if test == "nested" {
        let mut total: i64 = 0;
        for i in 0..500i64 { for j in 0..500i64 { total += i * j; } }
        println!("{}", total);
    } else if test == "string" {
        let mut s = String::with_capacity(100_001);
        for _ in 0..100_000 { s.push('a'); }
        println!("{}", s.len());
    } else if test == "math" {
        let mut total: f64 = 0.0;
        for i in 0..1_000_000 { total += ((i + 1) as f64).sqrt(); }
        println!("{:.0}", total);
    }
}
