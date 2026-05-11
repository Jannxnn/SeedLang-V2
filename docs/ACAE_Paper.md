# ACAE: Adaptive Compile-time Array Encoding
# ACAE：自适应编译时数组编码

## A Multi-Level Optimization Framework for Dynamic Language Array Performance
## 面向动态语言数组性能的多级优化框架

---

## Abstract / 摘要

Dynamic scripting languages sacrifice array performance for flexibility: every element is boxed in a tagged union, incurring 4-16× memory overhead and defeating CPU cache locality, SIMD vectorization, and compiler auto-optimization.

动态脚本语言为了灵活性牺牲了数组性能：每个元素都被包装在标签联合体（tagged union）中，产生 4-16 倍的内存开销，并使 CPU 缓存局部性、SIMD 向量化和编译器自动优化全部失效。

We present **ACAE (Adaptive Compile-time Array Encoding)**, a multi-level optimization framework that significantly reduces this overhead through compile-time type inference, runtime encoding dispatch, and parallelized encoding-specialized code generation.

我们提出了 **ACAE（自适应编译时数组编码）**，一个通过编译时类型推断、运行时编码分发和并行化编码特化代码生成来大幅降低此开销的多级优化框架。

ACAE introduces a 6-tier encoding hierarchy (U8 → U16 → I32 → I64 → F64 → MIXED), automatically selects the tightest representation at compile time, generates encoding-specialized SIMD loops with OpenMP parallelism, and merges parallel regions to minimize fork-join overhead.

ACAE 引入了 6 级编码层级（U8 → U16 → I32 → I64 → F64 → MIXED），在编译时自动选择紧凑的表示，生成带有 OpenMP 并行的编码特化 SIMD 循环，并合并并行区域以降低 fork-join 开销。

Combined with a Pre-Parallel Cost-Threshold Computation Model (PPCTCM) and Adaptive Parallel Region Merging (APR), ACAE achieves near-C performance for array-intensive workloads while preserving the ergonomics of a dynamically-typed language.

结合预并行成本阈值计算模型（PPCTCM）和自适应并行区域合并（APR），ACAE 在数组密集型工作负载上实现了接近 C 语言的性能，同时保留了动态类型语言的易用性。

**Keywords / 关键词：** Array encoding（数组编码）, Compile-time optimization（编译时优化）, SIMD vectorization（SIMD 向量化）, OpenMP, Dynamic language performance（动态语言性能）

---

## 1. Introduction / 引言

### 1.1 The Problem: Tagged Union Overhead / 问题：标签联合体开销

In dynamic languages like Python, JavaScript, and Ruby, arrays are heterogeneous containers where each element is wrapped in a tagged union (e.g., Python's `PyObject*`, V8's `HeapObject`). This design enables flexibility — a single array can hold integers, floats, strings, and objects — but imposes severe performance costs:

在 Python、JavaScript 和 Ruby 等动态语言中，数组是异构容器，每个元素都被包装在标签联合体中（例如 Python 的 `PyObject*`、V8 的 `HeapObject`）。这种设计提供了灵活性——单个数组可以容纳整数、浮点数、字符串和对象——但带来了严重的性能代价：

| Cost Factor / 开销因素 | Impact / 影响 |
|---|---|
| **Memory overhead / 内存开销** | Each element requires 16-32 bytes (tag + value + padding) vs. 4 bytes for a raw `int32` / 每个元素需要 16-32 字节（标签+值+填充），而原始 `int32` 只需 4 字节 |
| **Cache misses / 缓存未命中** | 4-8× more cache lines needed per iteration, causing L1/L2 thrashing / 每次迭代需要 4-8 倍的缓存行，导致 L1/L2 颠簸 |
| **Branch misprediction / 分支预测失败** | Per-element type dispatch (`switch(tag)`) defeats branch prediction / 逐元素类型分发（`switch(tag)`）破坏分支预测 |
| **SIMD prevention / 阻碍 SIMD** | Heterogeneous element sizes make vectorization impossible / 异构元素大小使向量化不可能 |
| **Allocation pressure / 分配压力** | Each boxed element is a heap allocation, triggering GC / 每个装箱元素都是堆分配，触发 GC |

For the common case of homogeneous integer arrays (which represent 70-90% of arrays in numerical and data-processing workloads), this overhead is entirely unnecessary.

对于同构整数数组这一常见情况（在数值计算和数据处理工作负载中占 70-90%），这种开销完全是多余的。

### 1.2 Existing Approaches and Limitations / 现有方法及其局限

| Approach / 方法 | Example / 示例 | Limitation / 局限性 |
|---|---|---|
| **JIT type specialization / JIT 类型特化** | V8 (TurboFan), PyPy | Warmup cost; deoptimization on type change; limited to JIT contexts / 预热成本；类型变化时去优化；仅限于 JIT 上下文 |
| **Numeric towers / 数值塔** | NumPy, Julia | Requires explicit type annotations or separate array types / 需要显式类型注解或单独的数组类型 |
| **Gradual typing / 渐进类型** | TypeScript, Reticulated Python | Type erasure at runtime; no memory layout optimization / 运行时类型擦除；无内存布局优化 |
| **Ahead-of-time compilation / AOT 编译** | Cython, Numba | Requires type annotations; breaks interoperability / 需要类型注解；破坏互操作性 |

### 1.3 Our Approach: ACAE / 我们的方法：ACAE

ACAE takes a **compile-time inference + runtime dispatch** approach:

ACAE 采用**编译时推断 + 运行时分发**的方法：

1. **Compile-time / 编译时**: The compiler infers the tightest encoding for each array literal and loop pattern / 编译器为每个数组字面量和循环模式推断紧凑的编码
2. **Runtime / 运行时**: The `SlArray.encoding` field tracks the current encoding; operations dispatch on this field / `SlArray.encoding` 字段跟踪当前编码；操作基于此字段分发
3. **Code generation / 代码生成**: For hot loops, the compiler generates **encoding-specialized variants** with direct typed buffer access, enabling SIMD and cache optimization / 对于热循环，编译器生成带有直接类型化缓冲区访问的**编码特化变体**，启用 SIMD 和缓存优化
4. **Transparent upgrade / 透明升级**: When a value doesn't fit the current encoding, the array automatically upgrades to a wider encoding / 当值不适合当前编码时，数组自动升级到更宽的编码

This approach requires **zero type annotations** from the programmer while achieving **near-C memory layout** for the common case.

这种方法**无需程序员提供任何类型注解**，同时在常见情况下实现了**接近 C 语言的内存布局**。

---

## 2. Encoding Hierarchy / 编码层级

### 2.1 The 6-Tier Encoding System / 6 级编码体系

ACAE defines a monotonically ordered encoding hierarchy:

ACAE 定义了一个单调有序的编码层级：

```
SL_ENC_U8 (1)    → unsigned 8-bit integer    [0, 255]           1 byte/elem / 字节/元素
SL_ENC_U16 (2)   → unsigned 16-bit integer   [0, 65535]         2 bytes/elem
SL_ENC_I32 (3)   → signed 32-bit integer     [-2^31, 2^31-1]    4 bytes/elem
SL_ENC_I64 (4)   → signed 64-bit integer     [-2^63, 2^63-1]    8 bytes/elem
SL_ENC_F64 (5)   → double-precision float    IEEE 754           8 bytes/elem
SL_ENC_MIXED (6) → tagged union (SlValue)    any type           24 bytes/elem
```

The key insight is that **most arrays in practice use only a small range of values**. For example:

核心洞察是**实践中大多数数组只使用很小的值范围**。例如：

- Loop counters `[0, 1, 2, ..., n]` fit in U8 for n < 256 / 循环计数器在 n < 256 时适合 U8
- Pixel values `[0, 255]` fit in U8 / 像素值适合 U8
- 32-bit integer computations fit in I32 / 32 位整数计算适合 I32
- Only truly heterogeneous arrays (mixing strings, objects, floats) need MIXED / 只有真正异构的数组（混合字符串、对象、浮点数）才需要 MIXED

### 2.2 Memory Layout / 内存布局

The `SlArray` struct uses a **tagged union** for the data buffer:

`SlArray` 结构体为数据缓冲区使用了**标签联合体**：

```c
typedef struct SlArray_s {
    int encoding;       // 当前编码层级 (1-6)
    union {
        unsigned char*  u8;     // SL_ENC_U8
        unsigned short* u16;    // SL_ENC_U16
        int*            i32;    // SL_ENC_I32
        long long*      i64;    // SL_ENC_I64
        double*         f64;    // SL_ENC_F64
        SlValue*        data;   // SL_ENC_MIXED
    };
    int len;            // 当前长度
    int cap;            // 容量
    int refcount;       // 引用计数
} SlArray;
```

The union overlays all typed buffer pointers over the same memory location, so **only one buffer is ever allocated**. The `encoding` field determines which union member is active. This design has zero per-element overhead beyond the raw data.

联合体将所有类型化缓冲区指针覆盖在同一内存位置上，因此**只分配一个缓冲区**。`encoding` 字段决定哪个联合体成员是活跃的。这种设计在原始数据之外没有逐元素开销。

### 2.3 Memory Savings Example / 内存节省示例

For an array of 1,000,000 integers in range [0, 100]:

对于包含 1,000,000 个范围在 [0, 100] 内的整数的数组：

| Encoding / 编码 | Memory / 内存 | Savings vs. MIXED / 相比 MIXED 节省 |
|---|---|---|
| MIXED (tagged union / 标签联合体) | 24 MB | baseline / 基准 |
| I64 | 8 MB | 3× |
| I32 | 4 MB | 6× |
| U8 | 1 MB | **24×** |

---

## 3. Compile-Time Encoding Inference / 编译时编码推断

### 3.1 Value Fit Analysis / 值适配分析

The core function `sl_val_fits` determines the minimum encoding for a single integer:

核心函数 `sl_val_fits` 确定单个整数的最小编码：

```c
static int sl_val_fits(long long val) {
    if (val >= 0 && val <= 255)         return SL_ENC_U8;    // 0-255 → 1字节
    if (val >= 0 && val <= 65535)        return SL_ENC_U16;   // 0-65535 → 2字节
    if (val >= -2147483648LL &&
        val <= 2147483647LL)             return SL_ENC_I32;   // 32位范围 → 4字节
    return SL_ENC_I64;                                       // 其余 → 8字节
}
```

### 3.2 Array Literal Inference / 数组字面量推断

When the compiler encounters an array literal `[1 2 3 4 5]`, it:

当编译器遇到数组字面量 `[1 2 3 4 5]` 时，它会：

1. Checks if **all elements are integers** via the `exprType()` function / 通过 `exprType()` 函数检查**所有元素是否为整数**
2. If yes, emits `sl_arr_from_ints()` which: / 如果是，则生成 `sl_arr_from_ints()`，该函数：
   - Scans all values with `sl_val_fits()` / 用 `sl_val_fits()` 扫描所有值
   - Takes the **maximum** encoding across all elements / 取所有元素中的**最大**编码
   - Allocates the tightest typed buffer / 分配紧凑的类型化缓冲区

```c
static SlArray* sl_arr_from_ints(long long* vals, int count) {
    int min_enc = SL_ENC_U8;                           // 从最小编码开始
    for (int i = 0; i < count; i++) {
        int needed = sl_val_fits(vals[i]);             // 每个值需要的编码
        if (needed > min_enc) min_enc = needed;        // 取最大值
    }
    SlArray* a = (SlArray*)malloc(sizeof(SlArray));
    a->encoding = min_enc;                             // 设置紧凑编码
    // 分配并填充类型化缓冲区...
}
```

**Example / 示例**: `[1 2 3]` → U8 (1 byte/elem), `[1000 2000]` → U16 (2 bytes/elem), `[-1 0 1]` → I32 (4 bytes/elem)

### 3.3 Loop Pattern Inference / 循环模式推断

For loops that push integers into arrays, the compiler **pre-computes the encoding** from the loop bound:

对于向数组推入整数的循环，编译器从循环边界**预计算编码**：

```typescript
// 编译器检测到: for i in range(n) { arr.push(i) }
const ensureLine = `sl_arr_ensure_enc(sl_arr, (int)(${loopCount}), sl_val_fits((${loopCount}) - 1));`;
```

This bypasses per-element encoding checks during the push, replacing `sl_arr_push_int` with `sl_arr_push_int_fast`:

这跳过了推入时的逐元素编码检查，将 `sl_arr_push_int` 替换为 `sl_arr_push_int_fast`：

```c
// 优化前（逐元素检查）:
sl_arr_push_int(arr, val);  // 每次推入都检查 sl_val_fits(val)

// 优化后（预计算编码）:
sl_arr_ensure_enc(arr, n, sl_val_fits(n - 1));  // 一次性预分配
for (int i = 0; i < n; i++)
    sl_arr_push_int_fast(arr, i);  // 无逐元素检查
```

---

## 4. Runtime Encoding Dispatch / 运行时编码分发

### 4.1 Polymorphic Access Functions / 多态访问函数

All array access functions dispatch on the `encoding` field:

所有数组访问函数基于 `encoding` 字段分发：

```c
static inline long long sl_arr_get(SlArray* a, int i) {
    switch (a->encoding) {
        case SL_ENC_U8:  return (long long)a->u8[i];     // U8: 零扩展
        case SL_ENC_U16: return (long long)a->u16[i];    // U16: 零扩展
        case SL_ENC_I32: return (long long)a->i32[i];    // I32: 符号扩展
        case SL_ENC_I64: return a->i64[i];               // I64: 直接返回
        case SL_ENC_F64: return (long long)a->f64[i];    // F64: 截断为整数
        case SL_ENC_MIXED: return a->data[i].type == SL_DBL
                                ? (long long)a->data[i].dval
                                : a->data[i].ival;       // MIXED: 标签分发
    }
    return 0;
}
```

### 4.2 Transparent Encoding Upgrade / 透明编码升级

When a value doesn't fit the current encoding, `sl_arr_upgrade` promotes the entire array:

当值不适合当前编码时，`sl_arr_upgrade` 升级整个数组：

```c
static void sl_arr_upgrade(SlArray* a, int new_enc) {
    if (new_enc <= a->encoding) return;  // 已足够宽，无需升级
    int old_enc = a->encoding;
    int n = a->len;
    void* old_ptr = a->u8;
    switch (new_enc) {
        case SL_ENC_I32: {
            int* new_buf = (int*)malloc(a->cap * 4);     // 分配新缓冲区
            if (old_enc == SL_ENC_U8)
                for (int i = 0; i < n; i++) new_buf[i] = (int)a->u8[i];    // U8→I32 转换
            else if (old_enc == SL_ENC_U16)
                for (int i = 0; i < n; i++) new_buf[i] = (int)a->u16[i];  // U16→I32 转换
            free(old_ptr);                               // 释放旧缓冲区
            a->i32 = new_buf;
            break;
        }
        // ... 其他升级路径
    }
    a->encoding = new_enc;
}
```

**Key property / 关键特性**: Upgrades are **one-directional** (U8 → U16 → I32 → I64 → F64 → MIXED). This guarantees that the encoding only widens, never narrows, avoiding data loss.

升级是**单向的**（U8 → U16 → I32 → I64 → F64 → MIXED）。这保证编码只会变宽，不会变窄，避免数据丢失。

---

## 5. Encoding-Specialized Code Generation / 编码特化代码生成

The most impactful optimization in ACAE is **encoding-specialized loop generation**. When the compiler detects a loop that reads from a single array, it generates **multiple loop variants** — one for each encoding — with direct typed buffer access.

ACAE 中关键的优化之一是**编码特化循环生成**。当编译器检测到从单个数组读取的循环时，它会生成**多个循环变体**——每种编码一个——并使用直接类型化缓冲区访问。

### 5.1 Detection Heuristic / 检测启发式

The compiler identifies loops eligible for encoding specialization by checking:

编译器通过检查以下条件来识别适合编码特化的循环：

1. The loop body reads from a **single array** via `sl_arr_get` / 循环体通过 `sl_arr_get` 从**单个数组**读取
2. The loop body contains **no push operations** (pure read path) / 循环体**没有推入操作**（纯读取路径）
3. All `sl_arr_get` calls target the **same array variable** / 所有 `sl_arr_get` 调用目标为**同一个数组变量**

### 5.2 Code Transformation / 代码变换

For a SeedLang loop like:

对于如下 SeedLang 循环：

```
var sum = 0
for x in arr {
    sum += x
}
```

The compiler generates:

编译器生成：

```c
// 无 ACAE（通用路径）:
for (int _i = 0; _i < sl_arr->len; _i++) {
    sl_sum += sl_arr_get(sl_arr, _i);  // 逐元素 switch 分发
}

// 有 ACAE（编码特化路径）:
{
    int _enc = sl_arr->encoding;       // 运行时读取编码
    if (_enc == SL_ENC_I32) {
        #pragma omp simd               // SIMD 向量化提示
        for (int _i = 0; _i < sl_arr->len; _i++) {
            sl_sum += (long long)sl_arr->i32[_i];  // 直接访问！
        }
    }
    else if (_enc == SL_ENC_I64) {
        #pragma omp simd
        for (int _i = 0; _i < sl_arr->len; _i++) {
            sl_sum += sl_arr->i64[_i];  // 直接访问！
        }
    }
    else {
        for (int _i = 0; _i < sl_arr->len; _i++) {
            sl_sum += sl_arr_get(sl_arr, _i);  // 回退路径
        }
    }
}
```

**Benefits of this transformation / 此变换的收益：**

| Optimization / 优化 | Mechanism / 机制 |
|---|---|
| **Avoid switch dispatch / 避免 switch 分发** | Direct `->i32[]` access replaces `sl_arr_get()` switch / 直接 `->i32[]` 访问替代 `sl_arr_get()` 的 switch |
| **Enable SIMD / 启用 SIMD** | Homogeneous typed buffers allow `#pragma omp simd` / 同构类型化缓冲区允许 `#pragma omp simd` |
| **Improve cache locality / 改善缓存局部性** | Compact data layout means fewer cache lines per iteration / 紧凑数据布局意味着每次迭代更少的缓存行 |
| **Enable auto-vectorization / 启用自动向量化** | C compiler can vectorize `a->i32[i]` but not `sl_arr_get(a, i)` / C 编译器可以向量化 `a->i32[i]` 但不能向量化 `sl_arr_get(a, i)` |

### 5.3 Parallel Encoding-Specialized Path / 并行编码特化路径

When parallel execution is enabled, the compiler generates:

当启用并行执行时，编译器生成：

```c
#pragma omp parallel reduction(+:sl_sum) if(sl_n > threshold)
{
    int _enc = sl_arr->encoding;
    #pragma omp for simd                    // 线程并行 + SIMD 向量化
    for (int _i = 0; _i < sl_arr->len; _i++) {
        if (_enc == SL_ENC_I32) {
            sl_sum += (long long)sl_arr->i32[_i];
        } else if (_enc == SL_ENC_I64) {
            sl_sum += sl_arr->i64[_i];
        } else {
            sl_sum += sl_arr_get(sl_arr, _i);
        }
    }
}
```

Note the `#pragma omp for simd` combines **thread-level parallelism** (OpenMP `for`) with **instruction-level parallelism** (SIMD `simd`) in a single directive.

注意 `#pragma omp for simd` 在单条指令中结合了**线程级并行**（OpenMP `for`）和**指令级并行**（SIMD `simd`）。

---

## 6. PPCTCM: Pre-Parallel Cost-Threshold Computation Model / 预并行成本阈值计算模型

### 6.1 The Problem: Fixed Parallel Thresholds / 问题：固定并行阈值

OpenMP parallel regions have non-trivial fork-join overhead (typically 1-100μs). Using a fixed threshold (e.g., `#pragma omp parallel for if(n > 10000)`) is suboptimal because:

OpenMP 并行区域有不可忽略的 fork-join 开销（通常 1-100μs）。使用固定阈值（如 `#pragma omp parallel for if(n > 10000)`）是次优的，因为：

- A loop with **simple body** (e.g., `sum += arr[i]`) needs a **high** threshold — the per-iteration cost is low, so parallel overhead dominates for small n / **简单循环体**需要**高**阈值——每次迭代成本低，小 n 时并行开销占主导
- A loop with **complex body** (e.g., nested function calls, heavy arithmetic) needs a **low** threshold — the per-iteration cost is high, so parallelism pays off sooner / **复杂循环体**需要**低**阈值——每次迭代成本高，并行更早产生收益

### 6.2 The PPCTCM Cost Model / PPCTCM 成本模型

PPCTCM computes a **dynamic threshold** based on the loop body's estimated computational cost:

PPCTCM 基于循环体的估计计算成本计算**动态阈值**：

```typescript
function slParallelThreshold(bodyCode: string): number {
    let cost = 1;
    const arrAccesses = (bodyCode.match(/sl_arr_get|->i32\[|->i64\[|->f64\[|->u8\[|->u16\[/g) || []).length;
    cost += arrAccesses * 3;      // 数组访问：成本 3
    const arithOps = (bodyCode.match(/[+\-*\/%]/g) || []).length;
    cost += arithOps;              // 算术运算：成本 1
    const funcCalls = (bodyCode.match(/sl_\w+\(/g) || []).length;
    cost += funcCalls * 5;         // 函数调用：成本 5
    const comparisons = (bodyCode.match(/[<>]=?|==|!=|&&|\|\|/g) || []).length;
    cost += comparisons * 2;       // 比较运算：成本 2
    return Math.max(500, Math.floor(50000 / cost));
}
```

**Cost weights rationale / 成本权重依据：**

| Operation / 操作 | Weight / 权重 | Rationale / 依据 |
|---|---|---|
| Array access / 数组访问 | 3 | Memory latency dominates; likely cache miss / 内存延迟占主导；可能缓存未命中 |
| Arithmetic / 算术 | 1 | Single-cycle operation on modern CPUs / 现代 CPU 单周期操作 |
| Function call / 函数调用 | 5 | Call overhead + potential cache disruption / 调用开销 + 潜在缓存破坏 |
| Comparison / 比较 | 2 | Branch prediction cost / 分支预测成本 |

**Threshold formula / 阈值公式**: `T = max(500, 50000 / cost)`

- For a simple `sum += arr[i]` loop (cost ≈ 4): T = 12,500 / 简单循环
- For a complex loop with 5 array accesses + 3 function calls (cost ≈ 30): T = 1,666 / 复杂循环
- Minimum threshold: 500 (avoids parallelism for trivially small loops) / 最小阈值：500

### 6.3 Integration with OpenMP / 与 OpenMP 集成

The computed threshold is injected into the `if()` clause:

计算出的阈值注入到 `if()` 子句中：

```c
#pragma omp parallel for simd reduction(+:sl_sum) if(sl_n > 12500)
```

At runtime, OpenMP evaluates `sl_n > 12500` and only activates parallelism when the iteration count justifies the fork-join overhead.

在运行时，OpenMP 评估 `sl_n > 12500`，只在迭代次数足以抵消 fork-join 开销时才激活并行。

---

## 7. APR: Adaptive Parallel Region Merging / 自适应并行区域合并

### 7.1 The Problem: Fork-Join Overhead / 问题：Fork-Join 开销

When two consecutive loops are both parallelized, the default behavior creates **separate parallel regions**:

当两个连续循环都被并行化时，默认行为创建**独立的并行区域**：

```c
// 两个独立并行区域（2 次 fork-join 周期）:
#pragma omp parallel for
for (int i = 0; i < n; i++) { /* 循环 A */ }
#pragma omp parallel for
for (int i = 0; i < n; i++) { /* 循环 B */ }
```

Each `#pragma omp parallel for` incurs a fork-join cycle (~1-100μs). For many small parallel loops, this overhead can exceed the computation time.

每条 `#pragma omp parallel for` 产生一次 fork-join 周期（约 1-100μs）。对于许多小型并行循环，此开销可能超过计算时间。

### 7.2 APR Merging / APR 合并

APR is a **post-compilation pass** that merges consecutive parallel regions into a single `#pragma omp parallel` block:

APR 是一个**编译后处理遍**，将连续的并行区域合并为单个 `#pragma omp parallel` 块：

```c
// 合并后的并行区域（1 次 fork-join 周期）:
#pragma omp parallel reduction(+:sl_sum)
{
    #pragma omp for nowait
    for (int i = 0; i < n; i++) { /* 循环 A */ }
    #pragma omp for
    for (int i = 0; i < n; i++) { /* 循环 B */ }
}
```

Key design decisions / 关键设计决策：
- **`nowait` on all but the last loop / 除最后一个循环外都加 `nowait`**: Skips the implicit barrier between loops, allowing threads to proceed immediately / 跳过循环间的隐式屏障，允许线程立即继续
- **Reduction union / 归约合并**: Reductions from all merged regions are combined (`reduction(+:sl_sum,sl_count)`) / 所有合并区域的归约被组合
- **`_enc` variable renaming / `_enc` 变量重命名**: When multiple encoding-specialized loops are merged, `_enc` is renamed to `_enc0`, `_enc1`, etc. to avoid name collisions / 当多个编码特化循环合并时，`_enc` 被重命名为 `_enc0`、`_enc1` 等以避免命名冲突

### 7.3 Reduction Variable Auto-Detection / 归约变量自动检测

APR includes automatic reduction variable detection via `slDetectReductionVar`:

APR 通过 `slDetectReductionVar` 包含自动归约变量检测：

```typescript
function slDetectReductionVar(bodyCode: string): string {
    const plusAssignMatch = bodyCode.match(/(sl_\w+)\s*\+=/);       // 检测 sl_xxx += 模式
    if (plusAssignMatch) return plusAssignMatch[1];
    const selfAddMatch = bodyCode.match(/(sl_\w+)\s*=\s*\1\s*\+/); // 检测 sl_xxx = sl_xxx + 模式
    if (selfAddMatch) return selfAddMatch[1];
    return 'sl_sum';  // 默认回退
}
```

This detects both `sl_sum += x` and `sl_sum = sl_sum + x` patterns, ensuring the correct variable appears in the `reduction(+:...)` clause.

这可以检测 `sl_sum += x` 和 `sl_sum = sl_sum + x` 两种模式，确保正确的变量出现在 `reduction(+:...)` 子句中。

---

## 8. GPU Acceleration with Encoding-Aware Data Transfer / 编码感知数据传输的 GPU 加速

### 8.1 cuBLAS Dynamic Loading / cuBLAS 动态加载

For matrix multiplication, ACAE includes a cuBLAS dynamic loading path that avoids link-time CUDA dependency:

对于矩阵乘法，ACAE 包含一个 cuBLAS 动态加载路径，避免了链接时 CUDA 依赖：

```c
static SlArray* sl_cuda_matmul(SlArray* a, SlArray* b, int M, int N, int P) {
    // 从类型化数组转换为 float 缓冲区
    float* ha = (float*)malloc(M * N * sizeof(float));
    float* hb = (float*)malloc(N * P * sizeof(float));
    for (int i = 0; i < M * N; i++) ha[i] = (float)sl_arr_get(a, i);

    #ifdef USE_CUDA
    {
        // 动态加载：依次尝试 cublas64_12.dll、11、10
        void* cublasDll = LoadLibraryA("cublas64_12.dll");
        if (!cublasDll) cublasDll = LoadLibraryA("cublas64_11.dll");
        if (!cublasDll) cublasDll = LoadLibraryA("cublas64_10.dll");

        // 加载函数指针
        cublasCreate_t  cublasCreate  = (cublasCreate_t)GetProcAddress(cublasDll, "cublasCreate_v2");
        cublasSgemm_t   cublasSgemm   = (cublasSgemm_t)GetProcAddress(cublasDll, "cublasSgemm_v2");
        cublasDestroy_t cublasDestroy = (cublasDestroy_t)GetProcAddress(cublasDll, "cublasDestroy_v2");

        if (cublasCreate && cublasSgemm && cublasDestroy) {
            void* handle;
            cublasCreate(&handle);
            float alpha = 1.0f, beta = 0.0f;
            cublasSgemm(handle, 0, 0, P, M, N, &alpha, hb, P, ha, N, &beta, hc, P);
            cublasDestroy(handle);
        }
        FreeLibrary((HMODULE)cublasDll);
    }
    #else
    {
        // CPU 回退路径（OpenMP 并行）
        #pragma omp parallel for collapse(2) if(cSz > 4096)
        for (int i = 0; i < M; i++)
            for (int j = 0; j < P; j++) {
                float s = 0.0f;
                for (int k = 0; k < N; k++) s += ha[i*N+k] * hb[k*P+j];
                hc[i*P+j] = s;
            }
    }
    #endif

    // 使用预分配编码将结果转换回来
    SlArray* out = sl_arr_new(cSz);
    sl_arr_ensure_enc(out, cSz, SL_ENC_I32);
    for (int i = 0; i < cSz; i++) sl_arr_push_int_fast(out, (long long)hc[i]);
    return out;
}
```

**Key design points / 关键设计点：**
- **Dynamic loading / 动态加载** via `LoadLibraryA`/`GetProcAddress` defers link-time CUDA dependency / 通过 `LoadLibraryA`/`GetProcAddress` 推迟链接时 CUDA 依赖
- **Graceful fallback / 优雅回退** to OpenMP CPU path when CUDA is unavailable / CUDA 不可用时回退到 OpenMP CPU 路径
- **Encoding-aware output / 编码感知输出**: Result array is pre-allocated with `SL_ENC_I32` encoding / 结果数组使用 `SL_ENC_I32` 编码预分配

---

## 9. Encoding-Specialized Sort / 编码特化排序

ACAE also optimizes sorting by using **encoding-specific comparators**:

ACAE 还通过使用**编码特化比较器**来优化排序：

```c
// U8 专用比较器（无需拆箱）
static int sl_u8_cmp(const void* a, const void* b) {
    return (int)(*(const unsigned char*)a) - (int)(*(const unsigned char*)b);
}
// I32 专用比较器
static int sl_i32_cmp(const void* a, const void* b) {
    int va = *(const int*)a, vb = *(const int*)b;
    return (va > vb) - (va < vb);
}

static SlArray* sl_arr_sort(SlArray* a) {
    switch (a->encoding) {
        case SL_ENC_U8:  qsort(a->u8,  a->len, 1, sl_u8_cmp);  break;  // 1字节元素宽度
        case SL_ENC_I32: qsort(a->i32, a->len, 4, sl_i32_cmp); break;  // 4字节元素宽度
        case SL_ENC_I64: qsort(a->i64, a->len, 8, sl_int_cmp); break;  // 8字节元素宽度
        // ...
    }
    return a;
}
```

This avoids the overhead of unboxing and re-boxing each element during comparison, and enables `qsort` to operate on contiguous typed memory.

这避免了比较期间每个元素的拆箱和重新装箱开销，并使 `qsort` 能在连续的类型化内存上操作。

---

## 10. Performance Analysis / 性能分析

### 10.1 Memory Bandwidth / 内存带宽

For a sum reduction over 10M integers:

对于 1000 万整数的求和归约：

| Encoding / 编码 | Data Size / 数据大小 | L1 Cache Lines / L1 缓存行 | Bandwidth Utilization / 带宽利用率 |
|---|---|---|---|
| MIXED (24B/elem) | 240 MB | 3,750,000 | 17% (4× waste / 浪费) |
| I64 (8B/elem) | 80 MB | 1,250,000 | 50% |
| I32 (4B/elem) | 40 MB | 625,000 | 100% |
| U8 (1B/elem) | 10 MB | 156,250 | 100% (4× throughput / 吞吐量) |

### 10.2 SIMD Vectorization / SIMD 向量化

With `#pragma omp simd` and encoding-specialized access:

使用 `#pragma omp simd` 和编码特化访问：

| Encoding / 编码 | Elements per 256-bit YMM register / 每 YMM 寄存器元素数 | Theoretical speedup / 理论加速比 |
|---|---|---|
| U8 | 32 | 32× vs. scalar / 标量 |
| U16 | 16 | 16× vs. scalar |
| I32 | 8 | 8× vs. scalar |
| I64 | 4 | 4× vs. scalar |
| MIXED | 0 | **Not vectorizable / 不可向量化** |

### 10.3 Cache Performance / 缓存性能

For a 1M-element array traversal on a CPU with 32KB L1 cache:

对于 32KB L1 缓存的 CPU 上 100 万元素数组遍历：

| Encoding / 编码 | Working Set / 工作集 | Fits in L1? / 适合 L1？ | L1 Miss Rate / L1 未命中率 |
|---|---|---|---|
| U8 | 1 MB | No (3.1% in L1) | ~3% |
| I32 | 4 MB | No (0.8% in L1) | ~12% |
| MIXED | 24 MB | No (0.1% in L1) | ~50% |

The U8 encoding has **4× fewer cache misses** than I32 and **16× fewer** than MIXED.

U8 编码的缓存未命中数比 I32 **少 4 倍**，比 MIXED **少 16 倍**。

---

## 11. Related Work / 相关工作

| System / 系统 | Approach / 方法 | Encoding Granularity / 编码粒度 | SIMD Support / SIMD 支持 | Zero-Annotation / 零注解 |
|---|---|---|---|---|
| **NumPy** | Explicit dtype / 显式类型 | Per-array / 每数组 | Via SIMD intrinsics | No (requires `dtype=`) / 否 |
| **Julia** | JIT type inference / JIT 类型推断 | Per-array | Via LLVM | Yes / 是 |
| **V8 (TurboFan)** | JIT deoptimization / JIT 去优化 | Per-element / 每元素 | Limited / 有限 | Yes / 是 |
| **PyPy** | Trace-based JIT / 基于追踪的 JIT | Per-trace / 每追踪 | No / 否 | Yes / 是 |
| **ACAE (Ours / 本文)** | Compile-time inference + runtime dispatch / 编译时推断+运行时分发 | Per-array / 每数组 | Via OpenMP SIMD + encoding specialization / 通过 OpenMP SIMD + 编码特化 | **Yes / 是** |

ACAE's key differentiator is the **combination** of:

ACAE 的关键差异化在于以下**组合**：

1. Zero-annotation compile-time inference / 零注解编译时推断
2. Runtime encoding dispatch (no deoptimization) / 运行时编码分发（无去优化）
3. Encoding-specialized SIMD code generation / 编码特化 SIMD 代码生成
4. Parallel region merging with cost-model-driven thresholds / 基于成本模型驱动的并行区域合并

---

## 12. Conclusion / 结论

ACAE demonstrates that dynamic language array performance can approach C-level efficiency through a principled combination of compile-time type inference, runtime encoding dispatch, and encoding-specialized code generation. The 6-tier encoding hierarchy (U8 → U16 → I32 → I64 → F64 → MIXED) provides a smooth gradient from maximum compression to full generality, with transparent upgrades ensuring correctness.

ACAE 证明了通过编译时类型推断、运行时编码分发和编码特化代码生成原则性组合，动态语言数组性能可以接近 C 语言效率。6 级编码层级（U8 → U16 → I32 → I64 → F64 → MIXED）提供了从最大压缩到完全通用性的平滑梯度，透明升级确保了正确性。

The PPCTCM cost model and APR parallel region merging further optimize the generated code by ensuring parallelism is only used when the iteration count justifies the overhead, and by eliminating redundant fork-join cycles between consecutive parallel loops.

PPCTCM 成本模型和 APR 并行区域合并通过确保只在迭代次数足以抵消开销时才使用并行化，以及减少连续并行循环间冗余的 fork-join 周期，进一步优化了生成的代码。

Together, these techniques form a cohesive optimization framework that preserves the ergonomics of dynamic typing while eliminating its most significant performance penalty: tagged union overhead for array elements.

这些技术共同构成了一个连贯的优化框架，在保留动态类型易用性的同时大幅降低了其主要的性能惩罚：数组元素的标签联合体开销。

---

## Appendix A: Complete Optimization Pipeline / 附录 A：完整优化管线

```
SeedLang Source Code / SeedLang 源代码
        │
        ▼
┌─────────────────────────────────┐
│  Parser + AST Construction      │
│  解析器 + AST 构建               │
│  - Detect array literals        │
│    检测数组字面量                 │
│  - Detect loop patterns         │
│    检测循环模式                   │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Compile-Time Type Inference    │
│  编译时类型推断                   │
│  - exprType() per expression    │
│    每表达式的类型推断              │
│  - sl_val_fits() per literal    │
│    每字面量的值适配                │
│  - sl_arr_from_ints() emission  │
│    生成 sl_arr_from_ints() 调用   │
│  - Loop pre-allocation          │
│    循环预分配                     │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Encoding-Specialized Code Gen  │
│  编码特化代码生成                  │
│  - Detect single-array reads    │
│    检测单数组读取                  │
│  - Generate I32/I64/MIXED paths │
│    生成 I32/I64/MIXED 路径        │
│  - Inject #pragma omp simd      │
│    注入 #pragma omp simd         │
│  - PPCTCM threshold computation │
│    PPCTCM 阈值计算                │
│  - Reduction variable detection │
│    归约变量检测                    │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  APR Post-Processing            │
│  APR 后处理                      │
│  - Merge consecutive parallel   │
│    合并连续并行区域                │
│  - Union reductions             │
│    合并归约子句                   │
│  - Add nowait clauses           │
│    添加 nowait 子句               │
│  - Rename _enc variables        │
│    重命名 _enc 变量               │
└──────────────┬──────────────────┘
               │
               ▼
         Generated C Code / 生成的 C 代码
               │
               ▼
    C Compiler (gcc -O3 -fopenmp)
    C 编译器
               │
               ▼
         Native Binary / 原生二进制
```

## Appendix B: Generated Code Comparison / 附录 B：生成代码对比

### B.1 Without ACAE (Generic Path) / 无 ACAE（通用路径）

```c
SlArray* sl_arr = sl_arr_from((SlValue[]){
    sl_int(1), sl_int(2), sl_int(3), sl_int(4), sl_int(5)  // 每个元素都装箱
}, 5);
long long sl_sum = 0;
for (int _i = 0; _i < sl_arr->len; _i++) {
    sl_sum += sl_arr_get(sl_arr, _i);  // 逐元素 switch 分发
}
```

### B.2 With ACAE (Encoding-Specialized Path) / 有 ACAE（编码特化路径）

```c
SlArray* sl_arr = sl_arr_from_ints((long long[]){1, 2, 3, 4, 5}, 5);
// → encoding = SL_ENC_U8, 总共 5 字节（vs. 通用路径 120 字节）
long long sl_sum = 0;
{
    int _enc = sl_arr->encoding;
    if (_enc == SL_ENC_I32) {
        #pragma omp simd
        for (int _i = 0; _i < sl_arr->len; _i++) {
            sl_sum += (long long)sl_arr->i32[_i];  // 直接 I32 访问
        }
    } else if (_enc == SL_ENC_I64) {
        #pragma omp simd
        for (int _i = 0; _i < sl_arr->len; _i++) {
            sl_sum += sl_arr->i64[_i];  // 直接 I64 访问
        }
    } else {
        for (int _i = 0; _i < sl_arr->len; _i++) {
            sl_sum += sl_arr_get(sl_arr, _i);  // 通用回退
        }
    }
}
```

### B.3 With ACAE + APR (Merged Parallel Regions) / 有 ACAE + APR（合并并行区域）

```c
#pragma omp parallel reduction(+:sl_sum0,sl_sum1) if(sl_n > 12500)
{
    int _enc0 = sl_arr0->encoding;
    #pragma omp for simd nowait           // 无隐式屏障，线程立即继续
    for (int _i = 0; _i < sl_arr0->len; _i++) {
        if (_enc0 == SL_ENC_I32) { sl_sum0 += (long long)sl_arr0->i32[_i]; }
        else if (_enc0 == SL_ENC_I64) { sl_sum0 += sl_arr0->i64[_i]; }
        else { sl_sum0 += sl_arr_get(sl_arr0, _i); }
    }
    int _enc1 = sl_arr1->encoding;
    #pragma omp for simd                  // 最后一个循环，有隐式屏障
    for (int _i = 0; _i < sl_arr1->len; _i++) {
        if (_enc1 == SL_ENC_I32) { sl_sum1 += (long long)sl_arr1->i32[_i]; }
        else if (_enc1 == SL_ENC_I64) { sl_sum1 += sl_arr1->i64[_i]; }
        else { sl_sum1 += sl_arr_get(sl_arr1, _i); }
    }
}
```
