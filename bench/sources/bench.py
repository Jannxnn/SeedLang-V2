import sys
import math

def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

test = sys.argv[1] if len(sys.argv) > 1 else ''
if test == 'fib':
    print(fib(35))
elif test == 'loop':
    total = 0
    for i in range(100000000):
        total += i
    print(total)
elif test == 'array':
    arr = []
    for i in range(1000000):
        arr.append(i)
    print(len(arr))
elif test == 'nested':
    total = 0
    for i in range(500):
        for j in range(500):
            total += i * j
    print(total)
elif test == 'string':
    s = ''
    for i in range(100000):
        s += 'a'
    print(len(s))
elif test == 'math':
    total = 0.0
    for i in range(1000000):
        total += math.sqrt(i + 1)
    print(round(total))
