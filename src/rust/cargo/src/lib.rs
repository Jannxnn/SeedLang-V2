//! SeedLang Rust Native Module
//! 高性能极限边界测试实现

use wasm_bindgen::prelude::*;
use num_bigint::BigUint;
use num_traits::{One, Zero};
use std::mem;

/// 斐波那契数列 - 高性能实现
#[wasm_bindgen]
pub fn fibonacci(n: u64) -> u64 {
    if n <= 1 {
        return n;
    }
    
    let mut a: u64 = 0;
    let mut b: u64 = 1;
    
    for _ in 2..=n {
        let temp = a.wrapping_add(b);
        a = b;
        b = temp;
    }
    
    b
}

/// 大数斐波那契 - 支持任意精度
#[wasm_bindgen]
pub fn fibonacci_big(n: usize) -> String {
    if n == 0 {
        return "0".to_string();
    }
    if n == 1 {
        return "1".to_string();
    }
    
    let mut a = BigUint::zero();
    let mut b = BigUint::one();
    
    for _ in 2..=n {
        let temp = &a + &b;
        a = b;
        b = temp;
    }
    
    b.to_string()
}

/// 阶乘 - 高性能实现
#[wasm_bindgen]
pub fn factorial(n: u64) -> u64 {
    if n <= 1 {
        return 1;
    }
    
    (2..=n).fold(1u64, |acc, x| acc.wrapping_mul(x))
}

/// 大数阶乘 - 支持任意精度
#[wasm_bindgen]
pub fn factorial_big(n: usize) -> String {
    if n <= 1 {
        return "1".to_string();
    }
    
    let mut result = BigUint::one();
    for i in 2..=n {
        result = result * i;
    }
    
    result.to_string()
}

/// 相互递归 - even/odd
#[wasm_bindgen]
pub fn is_even(n: u64) -> bool {
    if n == 0 {
        return true;
    }
    is_odd(n - 1)
}

#[wasm_bindgen]
pub fn is_odd(n: u64) -> bool {
    if n == 0 {
        return false;
    }
    is_even(n - 1)
}

/// 尾递归求和
#[wasm_bindgen]
pub fn tail_sum(n: u64) -> u64 {
    fn inner(n: u64, acc: u64) -> u64 {
        if n == 0 {
            acc
        } else {
            inner(n - 1, acc + n)
        }
    }
    inner(n, 0)
}

/// 数组排序 - 高性能实现
#[wasm_bindgen]
pub fn sort_array(arr: Vec<i32>) -> Vec<i32> {
    let mut sorted = arr;
    sorted.sort_unstable();
    sorted
}

/// 数组求和
#[wasm_bindgen]
pub fn sum_array(arr: Vec<i64>) -> i64 {
    arr.iter().sum()
}

/// 数组映射
#[wasm_bindgen]
pub fn map_double(arr: Vec<i32>) -> Vec<i32> {
    arr.iter().map(|x| x * 2).collect()
}

/// 数组过滤
#[wasm_bindgen]
pub fn filter_even(arr: Vec<i32>) -> Vec<i32> {
    arr.into_iter().filter(|x| x % 2 == 0).collect()
}

/// 数组归约
#[wasm_bindgen]
pub fn reduce_sum(arr: Vec<i32>) -> i32 {
    arr.iter().sum()
}

/// 字符串处理 - 构建长字符串
#[wasm_bindgen]
pub fn build_string(length: usize) -> String {
    "a".repeat(length)
}

/// 字符串反转
#[wasm_bindgen]
pub fn reverse_string(s: &str) -> String {
    s.chars().rev().collect()
}

/// Unicode 字符串长度
#[wasm_bindgen]
pub fn unicode_len(s: &str) -> usize {
    s.chars().count()
}

/// 位运算组合
#[wasm_bindgen]
pub fn bitwise_ops(a: i32, b: i32) -> Vec<i32> {
    vec![
        a & b,
        a | b,
        a ^ b,
        !a,
        a << 4,
        a >> 2,
    ]
}

/// 数学函数 - 三角函数
#[wasm_bindgen]
pub fn trig_functions(x: f64) -> Vec<f64> {
    vec![
        x.sin(),
        x.cos(),
        x.tan(),
        x.asin(),
        x.acos(),
        x.atan(),
    ]
}

/// 数学函数 - 对数和指数
#[wasm_bindgen]
pub fn log_exp_functions(x: f64) -> Vec<f64> {
    vec![
        x.ln(),
        x.log2(),
        x.log10(),
        x.exp(),
        x.powi(2),
        x.sqrt(),
    ]
}

/// 取整函数
#[wasm_bindgen]
pub fn rounding_functions(x: f64) -> Vec<f64> {
    vec![
        x.floor(),
        x.ceil(),
        x.round(),
        x.trunc(),
        x.abs(),
        x.signum() as f64,
    ]
}

/// 复杂数学表达式
#[wasm_bindgen]
pub fn complex_math(a: f64, b: f64, c: f64, d: f64) -> f64 {
    (a / b).floor() + a - (a / b).floor() * b + c * d - (a + b) / c
}

/// 内存压力测试
#[wasm_bindgen]
pub fn memory_stress(size_mb: usize) -> bool {
    let size = size_mb * 1024 * 1024;
    match Vec::<u8>::with_capacity(size) {
        _ => true,
    }
}

/// 性能基准测试
#[wasm_bindgen]
pub fn benchmark(iterations: u64) -> u64 {
    let mut sum: u64 = 0;
    for i in 0..iterations {
        sum = sum.wrapping_add(i);
    }
    sum
}

/// 矩阵乘法 - 高性能实现
#[wasm_bindgen]
pub fn matrix_multiply(a: Vec<f64>, b: Vec<f64>, n: usize) -> Vec<f64> {
    let mut result = vec![0.0; n * n];
    
    for i in 0..n {
        for j in 0..n {
            let mut sum = 0.0;
            for k in 0..n {
                sum += a[i * n + k] * b[k * n + j];
            }
            result[i * n + j] = sum;
        }
    }
    
    result
}

/// 素数检测
#[wasm_bindgen]
pub fn is_prime(n: u64) -> bool {
    if n < 2 {
        return false;
    }
    if n == 2 {
        return true;
    }
    if n % 2 == 0 {
        return false;
    }
    
    let sqrt_n = (n as f64).sqrt() as u64;
    for i in (3..=sqrt_n).step_by(2) {
        if n % i == 0 {
            return false;
        }
    }
    true
}

/// 素数列表生成
#[wasm_bindgen]
pub fn primes_up_to(n: u64) -> Vec<u64> {
    (2..=n).filter(|&x| is_prime(x)).collect()
}

/// 快速排序
#[wasm_bindgen]
pub fn quicksort(mut arr: Vec<i32>) -> Vec<i32> {
    fn partition(arr: &mut [i32]) -> usize {
        let len = arr.len();
        if len == 0 {
            return 0;
        }
        let pivot = arr[len - 1];
        let mut i = 0;
        
        for j in 0..len - 1 {
            if arr[j] <= pivot {
                arr.swap(i, j);
                i += 1;
            }
        }
        arr.swap(i, len - 1);
        i
    }
    
    fn quicksort_inner(arr: &mut [i32]) {
        if arr.len() <= 1 {
            return;
        }
        let pivot_idx = partition(arr);
        quicksort_inner(&mut arr[..pivot_idx]);
        quicksort_inner(&mut arr[pivot_idx + 1..]);
    }
    
    quicksort_inner(&mut arr);
    arr
}

/// 二分查找
#[wasm_bindgen]
pub fn binary_search(arr: Vec<i32>, target: i32) -> i32 {
    let mut left = 0;
    let mut right = arr.len() as i32 - 1;
    
    while left <= right {
        let mid = (left + right) / 2;
        if arr[mid as usize] == target {
            return mid;
        } else if arr[mid as usize] < target {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    
    -1
}

/// 哈希函数
#[wasm_bindgen]
pub fn hash_string(s: &str) -> u64 {
    let mut hash: u64 = 5381;
    for byte in s.bytes() {
        hash = ((hash << 5).wrapping_add(hash)).wrapping_add(byte as u64);
    }
    hash
}

/// JSON 解析
#[wasm_bindgen]
pub fn parse_json(json: &str) -> String {
    match serde_json::from_str::<serde_json::Value>(json) {
        Ok(value) => value.to_string(),
        Err(e) => format!("Error: {}", e),
    }
}

/// 获取模块信息
#[wasm_bindgen]
pub fn get_module_info() -> String {
    r#"{
        "name": "seedlang_rust",
        "version": "0.1.0",
        "functions": [
            "fibonacci", "fibonacci_big", "factorial", "factorial_big",
            "is_even", "is_odd", "tail_sum",
            "sort_array", "sum_array", "map_double", "filter_even", "reduce_sum",
            "build_string", "reverse_string", "unicode_len",
            "bitwise_ops", "trig_functions", "log_exp_functions", "rounding_functions",
            "complex_math", "memory_stress", "benchmark",
            "matrix_multiply", "is_prime", "primes_up_to",
            "quicksort", "binary_search", "hash_string", "parse_json"
        ],
        "features": ["wasm", "native", "bigint", "serde"]
    }"#.to_string()
}

/// 初始化模块
#[wasm_bindgen]
pub fn init() -> String {
    "SeedLang Rust Module initialized".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_fibonacci() {
        assert_eq!(fibonacci(10), 55);
        assert_eq!(fibonacci(20), 6765);
    }
    
    #[test]
    fn test_factorial() {
        assert_eq!(factorial(5), 120);
        assert_eq!(factorial(10), 3628800);
    }
    
    #[test]
    fn test_is_prime() {
        assert_eq!(is_prime(2), true);
        assert_eq!(is_prime(17), true);
        assert_eq!(is_prime(18), false);
    }
    
    #[test]
    fn test_sort() {
        let arr = vec![3, 1, 4, 1, 5, 9, 2, 6];
        let sorted = sort_array(arr);
        assert_eq!(sorted, vec![1, 1, 2, 3, 4, 5, 6, 9]);
    }
}
