# SeedLang

> AI-first 编程语言 — 简洁语法，JavaScript 语义，多运行时支持，可编译至原生二进制

**版本**: `2.0.0` | **协议**: MIT | **规范文档**: [docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md](docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md)

---

## 为什么选择 SeedLang

- 🤖 **AI 友好**: 极简语法减少样板代码，降低 token 消耗
- 🔗 **JS 语义兼容**: 控制流与表达式模型与 JavaScript 一致，学习成本低
- 🌐 **多运行时**: Web、Agent、Game、Graphics、Mobile、Embedded 六大运行时
- ⚡ **双编译后端**: 编译到 JavaScript 或 C（原生二进制，支持 OpenMP 并行 / GPU / CUDA）
- 🛡️ **完整工具链**: REPL、调试器、格式化器、Linter、文件监视器、VS Code 扩展

## 快速开始

```bash
# 克隆 & 安装（将下列 URL 换成你的 fork 或上游仓库）
git clone https://github.com/seedlang-team/seedlang.git
cd seedlang && npm install && npm run build

# REPL 交互模式
npm run repl

# 运行 .seed 文件
node dist/cli.js examples/sandbox/demo.seed

# 编译到 JavaScript
node dist/cli.js --compile examples/sandbox/demo.seed -o demo.js

# 编译到 C 并构建原生二进制（需要 gcc/clang）
node dist/cli.js --compile-c examples/games/physics_demo_clc.seed

# 运行测试
npm test

# 性能基准测试
node bench/run.js

# 多核/并行对照基准
npm run bench:parallel
```

对外复核性能口径（执行模型 / GCC 消融 / Win32 / profiling）：见 **`docs/PERFORMANCE_VERIFICATION_CHECKLIST.md`**。

### CLC 基准 C 代码与本地编译

`bench/compile_clc_bench.js` 会生成 `bench/seedlang/bench_clc.c`（默认带 OpenMP 友好的并行 CLC 输出）。**Cursor / 某些 CI 的 shell 里可能没有把 MinGW 加进 PATH**，直接打 `gcc` 会误报「未安装」；此时请二选一：

- 设置环境变量 **`SEED_GCC`**（或通用的 **`CC`**）为编译器**完整路径**，例如 MinGW 的 `x86_64-w64-mingw32-gcc.exe`。
- 或在仓库根目录执行 **`npm run compile:bench-clc`**：会先按 `SEED_GCC` / `CC` / 常见 Windows 路径解析，再退回 PATH 上的 `gcc` / `clang`，并带 **`-fopenmp`** 链接（可用 **`SEED_OPENMP=0`** 关闭）。产物：`bench/seedlang/bench_clc.exe`。

## 语法速览

SeedLang 与 JavaScript 的核心区别：**空格分隔，无逗号，无分号**（逗号会直接报错）

```seedlang
// 变量与基本类型
num = 42
name = "SeedLang"
flag = true

// 函数定义（空格分隔参数）
fn add(a b) {
  return a + b
}

// 数组/对象（空格分隔元素）
arr = [1 2 3]
obj = { name: "Alice" age: 20 }

// 调用函数（空格分隔参数）
print(add(1 2))

// 流程控制
if num > 0 {
  print("positive")
}

while i < 10 {
  i = i + 1
}

for item in arr {
  print(item)
}

// 箭头函数
map(arr (x) => x * 2)

// 类定义
class Person {
  init(name) { this.name = name }
  greet() { print("Hello " + this.name) }
}

// 异步 / 协程
async fn fetch() { ... }
coro gen() { yield 1 }

// 错误处理
try { ... } catch(e) { ... }

// 模块
import math; import utils as u
export fn helper() { ... }
```

> 完整语法规范见 [LANGUAGE_SPEC_REFACTOR_DRAFT.md](docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md)

## 编译后端

### JavaScript 后端（`--compile` / `-c`）

将 `.seed` 编译为可执行的 `.js`，支持自动 memoization、内联优化、minify。

```bash
node dist/cli.js --compile app.seed -o app.js
node dist/cli.js --compile app.seed --minify
```

### C 后端（`--compile-c`）

将 `.seed` 编译为 `.c`，再通过 gcc/clang 编译为原生二进制。内置 2200+ 行 C 运行时，支持：

- **引用计数 GC** — 自动内存管理，零暂停
- **编码压缩数组** — U8/U16/I32/I64/F64/Mixed 自适应编码，内存效率极高
- **OpenMP 并行** — `--parallel` 自动在安全循环上生成 `#pragma omp parallel for`
- **GPU 加速** — OpenCL 后端，支持数组求和/映射/缩放/矩阵乘法
- **CUDA 加速** — `--cuda` 启用 CUDA 后端，支持 cuBLAS 矩阵乘法
- **Win32 原生 GUI** — `--subsystem windows` 生成 Win32 窗口应用

```bash
node dist/cli.js --compile-c app.seed
node dist/cli.js --compile-c app.seed --parallel
node dist/cli.js --compile-c app.seed --gpu
node dist/cli.js --compile-c app.seed --cuda
node dist/cli.js --compile-c win32_app.seed --subsystem windows
```

## 项目结构

```
seedlang/
├── src/                          # 核心源码（TypeScript / JavaScript）
│   ├── core/                     # 编译器核心
│   │   ├── lexer.ts              # 词法分析器
│   │   ├── parser.ts             # 语法分析器
│   │   ├── ast.ts                # AST 节点类型定义
│   │   ├── interpreter.ts        # 解释器
│   │   ├── compiler.js           # 编译器辅助
│   │   ├── coroutine.ts          # 协程支持
│   │   ├── macro_expand.ts       # 宏展开
│   │   └── debugger.ts           # 调试器
│   ├── cli/                      # CLI 模块（从 cli.ts 拆分）
│   │   ├── cli_usage.ts          # 帮助/版本输出
│   │   ├── cli_run_modes.ts      # 文件运行/eval/watch
│   │   ├── cli_repl.ts           # REPL 交互模式
│   │   ├── cli_dev_tools.ts      # format/lint/stats/init
│   │   ├── cli_clc_native.ts     # C 编译 & 原生链接
│   │   ├── clc_win32_link.ts     # Win32 子系统链接
│   │   ├── clc_runtime.ts        # C 运行时模板（2200+ 行）
│   │   ├── clc_types.ts          # CLC 常量 & 错误类
│   │   ├── js_compiler.ts        # JS 编译器（compileToJS）
│   │   └── compiler_shared.ts    # 共享 AST 分析工具
│   ├── cli.ts                    # CLI 入口（compileToC + main）
│   ├── index.ts                  # 库入口
│   ├── api.js                    # 公共 API
│   ├── token-counter.js          # Token 计数器
│   │
│   ├── runtime/                  # 运行时系统
│   │   ├── vm.js                 # VM 主入口
│   │   ├── vm/                   # 字节码虚拟机（80+ 模块化文件）
│   │   │   ├── builtins/         # 内置函数（core/collection/data/io/graphics/matrix/regex/ai_async）
│   │   │   ├── modules/          # 运行时模块（scheduler/coroutine/parallel/gpu/cluster/worker_pool/web_html）
│   │   │   └── macros/           # VM 宏（distributed_fiber/gpu_dispatch/task_split）
│   │   ├── agent.ts              # Agent 运行时（任务/记忆/工具）
│   │   ├── web.ts                # Web 运行时（DOM/组件）
│   │   ├── graphics.ts           # 图形运行时（Canvas/终端渲染）
│   │   ├── game.ts               # 游戏运行时（场景/实体/物理/音频）
│   │   ├── mobile.ts             # 移动端运行时（设备/传感器/通知）
│   │   ├── embedded.ts           # 嵌入式运行时（GPIO/I2C/SPI）
│   │   └── node.js               # Node.js 运行时
│   │
│   ├── jit/                      # JIT 编译器（SSA/内联缓存/寄存器分配/SIMD/尾调用）
│   ├── aot/                      # AOT 预编译
│   ├── native/cpp/               # C++ Native Addon（极限性能数学/数组/字符串）
│   ├── ai/                       # AI 集成模块
│   ├── async/                    # 异步运行时
│   ├── concurrent/               # 并发原语
│   ├── debug/                    # 调试基础设施
│   ├── errors/                   # 错误报告系统
│   ├── ffi/                      # 外部函数接口
│   ├── memory/                   # 内存优化器
│   ├── modules/                  # 模块系统
│   ├── optimizer/                # 解释器优化
│   ├── python/                   # Python 绑定
│   ├── rust/                     # Rust 绑定（Cargo 集成）
│   ├── safety/                   # 运行时安全
│   ├── sandbox/                  # 沙箱隔离
│   ├── types/                    # 类型系统 & 类型检查器
│   └── wasm/                     # WASM 加载器
│
├── tools/                        # 工具链
│   ├── clc/                      # CLC Win32 运行时（头文件/C 源码）
│   ├── tcc/                      # Tiny C Compiler 分发版
│   ├── seed-doc.js               # 文档生成器
│   ├── seed-format.js            # 代码格式化器
│   ├── seed-lint.js              # 代码检查器
│   ├── seed-pm.js                # 包管理器
│   └── seed-web-compile.js       # Web 编译器
│
├── dist/                         # 编译产物（tsc 输出，勿手动编辑）
├── docs/                         # 规范与指南文档
├── tests/                        # 测试套件
├── bench/                        # 性能基准测试
│   ├── run.js                    # 主基准测试（跨语言对比）
│   ├── bench.{js,cpp,rs,py}      # 各语言基线实现
│   ├── game/                     # 游戏专项基准
│   ├── industry/                 # 行业基准
│   ├── samples/                  # 基准样本（矩阵/循环/嵌套）
│   ├── seedlang/                 # SeedLang 专项基准（含 CLC C 代码）
│   ├── sources/                  # 各语言基准源码（含并行版本）
│   └── win32/                    # Win32 性能测试
├── examples/                     # 示例程序
│   ├── sandbox/                  # 基础示例
│   ├── games/                    # 游戏示例（含物理引擎/Win32 原生/CLC 可靠性地牢）
│   ├── website/                  # 网站/SSG 示例（含基准/对比页面）
│   ├── compare/                  # 跨语言对比示例（JS/Python/C++/Rust）
│   ├── clc/                      # CLC 编译示例（Win32 smoke test）
│   ├── debug/                    # 调试示例
│   ├── deliverables/             # 交付物示例（含稳定性验证）
│   └── desktop-frontend-mvp/     # Electron 桌面端示例
├── scripts/                      # 工具脚本
├── editors/vscode/               # VS Code 扩展源码
├── crl/                          # CRL（压缩表示层）词典与规则
├── data/                         # 数据/配置
└── seedlang/                     # 语言配置与元数据
```

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm run build` | TypeScript 编译 |
| `npm run start` | 运行 CLI |
| `npm run repl` | 启动 REPL |
| `npm test` | 运行全量测试 |
| `npm run bench:parallel` | 多语言并行/多核对照基准 |
| `npm run dev` | ts-node 开发模式 |
| `npm run bench:game` | 游戏性能基准 |
| `npm run bench:game:ci` | 游戏 CI 门禁 |
| `npm run bench:game:trend` | 性能趋势报告 |
| `npm run bench:game:hotspots` | 热点分析 |
| `npm run lint:seed` | SeedLint 代码检查 |

## 内置函数速查

| 类别 | 函数 |
|------|------|
| **数学** | abs, floor, ceil, round, min, max, sqrt, pow, sin, cos, tan, log, random, clamp |
| **字符串** | len, upper, lower, trim, split, join, replace, substring, charAt, startsWith, endsWith, repeat, indexOf, includes |
| **数组** | len, push, pop, shift, slice, concat, reverse, sort, indexOf, map, filter, reduce, find, findIndex, every, some, flat, fill, unique |
| **对象** | keys, values, entries, merge, has |
| **类型** | type, toInt, toFloat, toString, toBool |
| **文件** | readFile, writeFile, exists, listDir, mkdir, remove |
| **时间** | time, timestamp, date, sleep |
| **JSON** | jsonParse, jsonStringify |
| **并行** | parallelMap, parallelFilter, parallelReduce |

## 多运行时架构

```
SeedLang Program
    │
    ├── Interpreter    → AST 直接执行（开发/调试）
    ├── VM (--vm)      → 字节码虚拟机（JIT/TCO/协程/Fiber 调度器）
    ├── JS Backend     → 编译到 JavaScript（Web/Node.js 部署）
    ├── C Backend      → 编译到原生二进制（OpenMP/GPU/CUDA 加速）
    │
    ├── Web Runtime    → DOM 渲染 / 组件注册 / 事件绑定
    ├── Agent Runtime  → 任务管理 / 记忆系统 / 工具调用 / API 对接
    ├── Game Runtime   → 场景管理 / 实体组件 / 物理 / 音频 / UI
    ├── Graphics Runtime → 终端 Canvas / 像素绘图 / 精灵 / 动画
    ├── Mobile Runtime → 设备信息 / 传感器 / 相机 / 通知 / 定位
    └── Embedded Runtime → GPIO / I2C / SPI / UART / PWM / ADC
```

## VS Code 扩展

扩展源码位于 `editors/vscode/`：

```bash
cd editors/vscode
npm install
npm run compile
```

功能包括：
- 语法高亮（seedlang.tmLanguage.json）
- 代码片段（snippets/seedlang.json）
- 语言配置（language-configuration.json）

## 回归验证

修改 `src/runtime/vm.js` 后必须执行：

```bash
node tests/test-suite.js      # 全量测试
node bench/run.js              # 性能基准（确保无退化）
```

## 社区与开源

欢迎参与贡献与讨论：

| 文档 | 说明 |
|------|------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发环境、提交流程、提交信息规范 |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | 社区行为准则 |
| [SECURITY.md](SECURITY.md) | 漏洞报告与支持版本 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |

## License

MIT
