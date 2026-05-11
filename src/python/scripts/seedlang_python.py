"""
SeedLang Python 集成模块
高性能 Python 扩展函数
"""

import json
import math
import random
import re
import hashlib
import itertools
from functools import reduce
from typing import List, Dict, Any, Optional

def fibonacci(n: int) -> int:
    """斐波那契数列"""
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b

def fibonacci_big(n: int) -> str:
    """大数斐波那契"""
    if n <= 1:
        return str(n)
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return str(b)

def factorial(n: int) -> int:
    """阶乘"""
    if n <= 1:
        return 1
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result

def factorial_big(n: int) -> str:
    """大数阶乘"""
    if n <= 1:
        return "1"
    result = 1
    for i in range(2, n + 1):
        result *= i
    return str(result)

def is_prime(n: int) -> bool:
    """素数检测"""
    if n < 2:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    for i in range(3, int(math.sqrt(n)) + 1, 2):
        if n % i == 0:
            return False
    return True

def primes_up_to(n: int) -> List[int]:
    """生成素数列表"""
    return [i for i in range(2, n + 1) if is_prime(i)]

def gcd(a: int, b: int) -> int:
    """最大公约数"""
    while b:
        a, b = b, a % b
    return a

def lcm(a: int, b: int) -> int:
    """最小公倍数"""
    return abs(a * b) // gcd(a, b)

def sort_array(arr: List[int]) -> List[int]:
    """数组排序"""
    return sorted(arr)

def reverse_array(arr: List[Any]) -> List[Any]:
    """数组反转"""
    return arr[::-1]

def flatten_array(arr: List[Any]) -> List[Any]:
    """数组扁平化"""
    result = []
    for item in arr:
        if isinstance(item, list):
            result.extend(flatten_array(item))
        else:
            result.append(item)
    return result

def unique_array(arr: List[Any]) -> List[Any]:
    """数组去重"""
    seen = set()
    result = []
    for item in arr:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result

def chunk_array(arr: List[Any], size: int) -> List[List[Any]]:
    """数组分块"""
    return [arr[i:i + size] for i in range(0, len(arr), size)]

def sum_array(arr: List[int]) -> int:
    """数组求和"""
    return sum(arr)

def mean_array(arr: List[int]) -> float:
    """数组平均值"""
    return sum(arr) / len(arr) if arr else 0

def median_array(arr: List[int]) -> float:
    """数组中位数"""
    sorted_arr = sorted(arr)
    n = len(sorted_arr)
    if n == 0:
        return 0
    mid = n // 2
    return sorted_arr[mid] if n % 2 else (sorted_arr[mid - 1] + sorted_arr[mid]) / 2

def std_array(arr: List[int]) -> float:
    """数组标准差"""
    if not arr:
        return 0
    mean = mean_array(arr)
    variance = sum((x - mean) ** 2 for x in arr) / len(arr)
    return math.sqrt(variance)

def map_double(arr: List[int]) -> List[int]:
    """数组映射 - 双倍"""
    return [x * 2 for x in arr]

def filter_even(arr: List[int]) -> List[int]:
    """数组过滤 - 偶数"""
    return [x for x in arr if x % 2 == 0]

def reduce_sum(arr: List[int]) -> int:
    """数组归约 - 求和"""
    return sum(arr)

def quicksort(arr: List[int]) -> List[int]:
    """快速排序"""
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

def binary_search(arr: List[int], target: int) -> int:
    """二分查找"""
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1

def reverse_string(s: str) -> str:
    """字符串反转"""
    return s[::-1]

def is_palindrome(s: str) -> bool:
    """回文检测"""
    s = s.lower().replace(' ', '')
    return s == s[::-1]

def count_words(s: str) -> int:
    """单词计数"""
    return len(s.split())

def count_chars(s: str) -> Dict[str, int]:
    """字符计数"""
    result = {}
    for c in s:
        result[c] = result.get(c, 0) + 1
    return result

def regex_match(s: str, pattern: str) -> bool:
    """正则匹配"""
    return bool(re.match(pattern, s))

def regex_findall(s: str, pattern: str) -> List[str]:
    """正则查找所有"""
    return re.findall(pattern, s)

def regex_replace(s: str, pattern: str, replacement: str) -> str:
    """正则替换"""
    return re.sub(pattern, replacement, s)

def hash_md5(s: str) -> str:
    """MD5 哈希"""
    return hashlib.md5(s.encode()).hexdigest()

def hash_sha256(s: str) -> str:
    """SHA256 哈希"""
    return hashlib.sha256(s.encode()).hexdigest()

def base64_encode(s: str) -> str:
    """Base64 编码"""
    import base64
    return base64.b64encode(s.encode()).decode()

def base64_decode(s: str) -> str:
    """Base64 解码"""
    import base64
    return base64.b64decode(s.encode()).decode()

def json_parse(s: str) -> Any:
    """JSON 解析"""
    return json.loads(s)

def json_stringify(obj: Any) -> str:
    """JSON 序列化"""
    return json.dumps(obj, ensure_ascii=False)

def matrix_multiply(a: List[List[int]], b: List[List[int]]) -> List[List[int]]:
    """矩阵乘法"""
    n = len(a)
    m = len(b[0])
    k = len(b)
    result = [[0] * m for _ in range(n)]
    for i in range(n):
        for j in range(m):
            for p in range(k):
                result[i][j] += a[i][p] * b[p][j]
    return result

def matrix_transpose(m: List[List[int]]) -> List[List[int]]:
    """矩阵转置"""
    return [[m[j][i] for j in range(len(m))] for i in range(len(m[0]))]

def trig_functions(x: float) -> Dict[str, float]:
    """三角函数"""
    return {
        'sin': math.sin(x),
        'cos': math.cos(x),
        'tan': math.tan(x),
        'asin': math.asin(x) if -1 <= x <= 1 else None,
        'acos': math.acos(x) if -1 <= x <= 1 else None,
        'atan': math.atan(x)
    }

def log_exp_functions(x: float) -> Dict[str, float]:
    """对数和指数函数"""
    return {
        'ln': math.log(x) if x > 0 else None,
        'log2': math.log2(x) if x > 0 else None,
        'log10': math.log10(x) if x > 0 else None,
        'exp': math.exp(x),
        'sqrt': math.sqrt(x) if x >= 0 else None,
        'pow': x ** 2
    }

def random_int(min_val: int, max_val: int) -> int:
    """随机整数"""
    return random.randint(min_val, max_val)

def random_float() -> float:
    """随机浮点数"""
    return random.random()

def random_choice(arr: List[Any]) -> Any:
    """随机选择"""
    return random.choice(arr) if arr else None

def random_shuffle(arr: List[Any]) -> List[Any]:
    """随机打乱"""
    result = arr.copy()
    random.shuffle(result)
    return result

def permutations(arr: List[Any], r: Optional[int] = None) -> List[List[Any]]:
    """排列"""
    return [list(p) for p in itertools.permutations(arr, r)]

def combinations(arr: List[Any], r: int) -> List[List[Any]]:
    """组合"""
    return [list(c) for c in itertools.combinations(arr, r)]

def benchmark(iterations: int) -> int:
    """性能基准测试"""
    total = 0
    for i in range(iterations):
        total += i
    return total

def get_module_info() -> str:
    """获取模块信息"""
    return json.dumps({
        'name': 'seedlang_python',
        'version': '0.1.0',
        'functions': [
            'fibonacci', 'fibonacci_big', 'factorial', 'factorial_big',
            'is_prime', 'primes_up_to', 'gcd', 'lcm',
            'sort_array', 'reverse_array', 'flatten_array', 'unique_array',
            'chunk_array', 'sum_array', 'mean_array', 'median_array', 'std_array',
            'map_double', 'filter_even', 'reduce_sum',
            'quicksort', 'binary_search',
            'reverse_string', 'is_palindrome', 'count_words', 'count_chars',
            'regex_match', 'regex_findall', 'regex_replace',
            'hash_md5', 'hash_sha256', 'base64_encode', 'base64_decode',
            'json_parse', 'json_stringify',
            'matrix_multiply', 'matrix_transpose',
            'trig_functions', 'log_exp_functions',
            'random_int', 'random_float', 'random_choice', 'random_shuffle',
            'permutations', 'combinations', 'benchmark'
        ],
        'features': ['numpy', 'pandas', 'scipy', 'matplotlib']
    })

if __name__ == '__main__':
    print(get_module_info())
