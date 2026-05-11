import math
import random
import time

def binary_trees_test(depth):
    def make_tree(d):
        if d == 0: return (None, None)
        return (make_tree(d - 1), make_tree(d - 1))
    def check_tree(node):
        if node[0] is None: return 1
        return 1 + check_tree(node[0]) + check_tree(node[1])
    min_depth = 4
    max_depth = max(depth, min_depth + 2)
    stretch_depth = max_depth + 1
    check_result = check_tree(make_tree(stretch_depth))
    long_lived_tree = make_tree(max_depth)
    total_check = 0
    d = min_depth
    while d <= max_depth:
        iterations = 1 << (max_depth - d + min_depth)
        check = 0
        for i in range(iterations):
            check += check_tree(make_tree(d))
        total_check += check
        d += 2
    long_check = check_tree(long_lived_tree)
    return total_check + long_check + check_result

def fannkuch_test(n):
    perm1 = list(range(n))
    count = [0] * n
    max_flips = 0
    perm_sign = 1
    check_sum = 0
    while True:
        perm = perm1[:]
        flips_count = 0
        k = perm[0]
        while k != 0:
            perm[1:k+1] = perm[1:k+1][::-1]
            perm[0], perm[k] = perm[k], perm[0]
            flips_count += 1
            k = perm[0]
        if flips_count > max_flips: max_flips = flips_count
        check_sum += perm_sign * flips_count
        perm_sign = -perm_sign
        j = 1
        while j < n:
            perm1[0], perm1[j] = perm1[j], perm1[0]
            if count[j] + 1 < j + 1:
                count[j] += 1
                break
            count[j] = 0
            j += 1
        if j >= n: break
    return max_flips * 10000 + abs(check_sum)

def nbody_test(n):
    pi = 3.141592653589793
    bodies = [
        [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [9.54786104043e-4, 4.40461389325, 0.0, 0.0, 0.0, 2.76942312745e-1, 0.0],
        [2.85885980667e-4, 8.34336671824, 0.0, 0.0, 0.0, -1.46456543704e-1, 0.0],
        [4.36624404335e-5, 1.27900392338e1, 0.0, 0.0, 0.0, 5.15138902098e-2, 0.0],
        [5.15138902098e-5, 1.51338402872e1, 0.0, 0.0, 0.0, 4.24183568564e-2, 0.0],
    ]
    dt = 0.01
    for _ in range(n):
        nb = len(bodies)
        for i in range(nb):
            bi = bodies[i]
            for j in range(i + 1, nb):
                bj = bodies[j]
                dx = bi[1] - bj[1]; dy = bi[2] - bj[2]; dz = bi[3] - bj[3]
                dist_sq = dx*dx + dy*dy + dz*dz
                dist = math.sqrt(dist_sq)
                mag = dt / (dist_sq * dist)
                bi[4] -= dx * bj[0] * mag; bi[5] -= dy * bj[0] * mag; bi[6] -= dz * bj[0] * mag
                bj[4] += dx * bi[0] * mag; bj[5] += dy * bi[0] * mag; bj[6] += dz * bi[0] * mag
        for i in range(nb):
            bi = bodies[i]
            bi[1] += dt * bi[4]; bi[2] += dt * bi[5]; bi[3] += dt * bi[6]
    e = 0
    nb = len(bodies)
    for i in range(nb):
        bi = bodies[i]
        e += 0.5 * bi[0] * (bi[4]**2 + bi[5]**2 + bi[6]**2)
        for j in range(i + 1, nb):
            bj = bodies[j]
            dx = bi[1]-bj[1]; dy = bi[2]-bj[2]; dz = bi[3]-bj[3]
            e -= (bi[0] * bj[0]) / math.sqrt(dx*dx + dy*dy + dz*dz)
    return int(e * 1000000)

def mandelbrot_test(size):
    total = 0
    for y in range(size):
        ci = (y * 2.0) / size - 1.0
        for x in range(size):
            cr = (x * 2.0) / size - 1.5
            zr = 0.0; zi = 0.0; zr2 = 0.0; zi2 = 0.0; it = 0
            while it < 50 and zr2 + zi2 <= 4.0:
                zi = 2.0 * zr * zi + ci; zr = zr2 - zi2 + cr
                zr2 = zr * zr; zi2 = zi * zi; it += 1
            total += it
    return total

def spectral_norm_test(n):
    def a(i, j):
        ij = i + j
        return 1.0 / (ij * (ij + 1) / 2 + i + 1)
    u = [1.0] * n; v = [0.0] * n
    for _ in range(10):
        for i in range(n):
            v[i] = sum(a(i, j) * u[j] for j in range(n))
        for i in range(n):
            u[i] = sum(a(j, i) * v[j] for j in range(n))
    vBv = sum(u[i] * v[i] for i in range(n))
    vv = sum(v[i] * v[i] for i in range(n))
    return int(math.sqrt(vBv / vv) * 1000000)

def heap_sort_test(n):
    arr = list(range(n, 0, -1))
    def sift_down(a, start, end):
        root = start
        while root * 2 + 1 <= end:
            child = root * 2 + 1; swap = root
            if a[swap] < a[child]: swap = child
            if child + 1 <= end and a[swap] < a[child + 1]: swap = child + 1
            if swap == root: return
            a[root], a[swap] = a[swap], a[root]; root = swap
    for start in range((n - 2) // 2, -1, -1): sift_down(arr, start, n - 1)
    for end in range(n - 1, 0, -1):
        arr[0], arr[end] = arr[end], arr[0]; sift_down(arr, 0, end - 1)
    return arr[0]

def quick_sort_test(n):
    arr = list(range(n, 0, -1))
    def qsort(a, lo, hi):
        if lo >= hi: return
        pivot = a[lo + (hi - lo) // 2]
        i = lo; j = hi
        while i <= j:
            while a[i] < pivot: i += 1
            while a[j] > pivot: j -= 1
            if i <= j: a[i], a[j] = a[j], a[i]; i += 1; j -= 1
        qsort(a, lo, j); qsort(a, i, hi)
    qsort(arr, 0, n - 1)
    return arr[0]

def hash_map_ops_test(n):
    m = {}
    for i in range(n):
        key = str(i % 1000); m[key] = i
    s = 0
    for i in range(n):
        key = str(i % 1000)
        if key in m: s += m[key]
    return len(m) * 10000 + s % 10000

def graph_bfs_test(n):
    adj = {}
    for i in range(n):
        key = str(i); adj[key] = []
        if i + 1 < n: adj[key].append(str(i + 1))
        if i * 2 < n: adj[key].append(str(i * 2))
    visited = {"0": True}; queue = ["0"]; count = 0
    while queue:
        node = queue.pop(0); count += 1
        for nb in adj.get(node, []):
            if nb not in visited: visited[nb] = True; queue.append(nb)
    return count

def linked_list_ops_test(n):
    head = None
    for i in range(n): head = {"val": i, "next": head}
    s = 0; cur = head
    while cur is not None: s += cur["val"]; cur = cur["next"]
    return s

def json_tokenize_test(n):
    json_str = "{"
    for i in range(10):
        json_str += '"k' + str(i) + '":' + str(i * 100)
        if i < 9: json_str += ","
    json_str += "}"
    tokens = 0
    for _ in range(n):
        i = 0
        while i < len(json_str):
            c = json_str[i]
            if c in "{}:,": tokens += 1
            if c == '"':
                tokens += 1; j = i + 1
                while j < len(json_str) and json_str[j] != '"': j += 1
                i = j
            i += 1
    return tokens

def csv_parse_test(n):
    rows = 0
    for _ in range(n):
        line = "42,Alice,95,A,true"
        fields = line.split(",")
        rows += len(fields)
    return rows

def string_search_test(n):
    text = "abcdefghij" * 100
    pattern = "fgh"
    count = 0
    for _ in range(n):
        for i in range(len(text) - len(pattern) + 1):
            match = True
            for j in range(len(pattern)):
                if text[i + j] != pattern[j]: match = False; break
            if match: count += 1
    return count

def template_render_test(n):
    template = "Hello {name}! Your score is {score}. Status: {status}"
    total = 0
    for _ in range(n):
        result = template.replace("{name}", "World").replace("{score}", "100").replace("{status}", "active")
        total += len(result)
    return total

def matrix_mul_test(n):
    a = [[i + j + 1 for j in range(n)] for i in range(n)]
    b = [[i - j + n for j in range(n)] for i in range(n)]
    c = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            s = 0
            for k in range(n): s += a[i][k] * b[k][j]
            c[i][j] = s
    return int(c[0][0])

def monte_carlo_pi_test(n):
    inside = 0
    for i in range(n):
        x = random.random(); y = random.random()
        if x * x + y * y <= 1.0: inside += 1
    return inside

def linpack_test(n):
    a = [[float(i + j + 1) for j in range(n)] for i in range(n)]
    b = [float(i + 1) for i in range(n)]
    for k in range(n):
        max_row = k; max_val = abs(a[k][k])
        for i in range(k + 1, n):
            if abs(a[i][k]) > max_val: max_val = abs(a[i][k]); max_row = i
        if max_row != k:
            a[k], a[max_row] = a[max_row], a[k]
            b[k], b[max_row] = b[max_row], b[k]
        for i in range(k + 1, n):
            factor = a[i][k] / a[k][k]
            for j in range(k + 1, n): a[i][j] -= factor * a[k][j]
            b[i] -= factor * b[k]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = b[i]
        for j in range(i + 1, n): s -= a[i][j] * x[j]
        x[i] = s / a[i][i]
    return int(x[0] * 1000)

def state_machine_test(n):
    state = 0; count = 0
    for i in range(n):
        if state == 0: state = 1 if i % 3 == 0 else 2; count += 1
        elif state == 1: state = 0 if i % 5 == 0 else 3; count += 2
        elif state == 2: state = 0 if i % 7 == 0 else 1; count += 3
        else: state = 0; count += 4
    return count

def mini_interpreter_test(n):
    code = [1, 100, 2, 5, 3, 0, 1, 200, 2, 3, 3, 0, 0, 0]
    stack = []; ip = 0; result = 0; steps = 0
    while steps < n:
        op = code[ip % len(code)]
        if op == 0: break
        if op == 1: ip += 1; stack.append(code[ip % len(code)])
        if op == 2:
            ip += 1; count = code[ip % len(code)]; s = 0
            for j in range(count):
                if stack: s += stack[-1]
            result += s
        if op == 3: ip += 1; result += code[ip % len(code)]
        ip += 1; steps += 1
    return result

def event_dispatch_test(n):
    handlers = {"click": 0, "hover": 0, "scroll": 0, "resize": 0, "focus": 0}
    event_types = ["click", "hover", "scroll", "resize", "focus"]
    for i in range(n): handlers[event_types[i % 5]] += 1
    return sum(handlers.values())

def bench_stable(name, arg, fn):
    min_samples = 5; max_samples = 40; min_total_ms = 200.0; min_sample_ms = 0.05
    samples = []; total_ms = 0; inner_iters = 1
    out = fn(arg)
    while inner_iters < (1 << 20):
        start = time.perf_counter()
        for _ in range(inner_iters): out = fn(arg)
        elapsed = (time.perf_counter() - start) * 1000
        if elapsed >= min_sample_ms: break
        inner_iters <<= 1
    while len(samples) < min_samples or (total_ms < min_total_ms and len(samples) < max_samples):
        start = time.perf_counter()
        for _ in range(inner_iters): out = fn(arg)
        elapsed = (time.perf_counter() - start) * 1000
        samples.append(elapsed / inner_iters); total_ms += elapsed
    samples.sort()
    m = len(samples) // 2
    median = samples[m] if len(samples) % 2 else (samples[m-1] + samples[m]) * 0.5
    print(f"{name}({arg})={out} {median:.6f}ms")

print("=== Python Industry Benchmark ===")
bench_stable("binary_trees", 16, binary_trees_test)
bench_stable("fannkuch", 10, fannkuch_test)
bench_stable("nbody", 500, nbody_test)
bench_stable("mandelbrot", 200, mandelbrot_test)
bench_stable("spectral_norm", 200, spectral_norm_test)
bench_stable("heap_sort", 10000, heap_sort_test)
bench_stable("quick_sort", 10000, quick_sort_test)
bench_stable("hash_map_ops", 50000, hash_map_ops_test)
bench_stable("graph_bfs", 1000, graph_bfs_test)
bench_stable("linked_list_ops", 10000, linked_list_ops_test)
bench_stable("json_tokenize", 10000, json_tokenize_test)
bench_stable("csv_parse", 5000, csv_parse_test)
bench_stable("string_search", 100000, string_search_test)
bench_stable("template_render", 10000, template_render_test)
bench_stable("matrix_mul", 100, matrix_mul_test)
bench_stable("monte_carlo_pi", 1000000, monte_carlo_pi_test)
bench_stable("linpack", 100, linpack_test)
bench_stable("state_machine", 100000, state_machine_test)
bench_stable("mini_interpreter", 10000, mini_interpreter_test)
bench_stable("event_dispatch", 50000, event_dispatch_test)
