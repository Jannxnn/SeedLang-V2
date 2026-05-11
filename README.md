# SeedLang

> **个人实验与学习向** 的玩具语言实现：语法上贴近「AI 友好 + JS 语义」的练习题目；**读源码、跑示例、改着玩** 即可，勿当作工业编译器或业务交付工具。

**版本**: `2.0.0` | **协议**: MIT | **规范**: [LANGUAGE_SPEC_REFACTOR_DRAFT.md](docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md) | **仓库/主链地图**: [ARCHITECTURE_MAP.md](docs/ARCHITECTURE_MAP.md)

**开源**：当前仓库内的源码与文档均在 **`LICENSE`（MIT）** 下开放使用、修改与分发。下文「对外承诺」「专项测试未收录」说的是 **维护叙事与目录取舍**，**不是**收回开源许可；若你 fork 后自行删掉子模块，仍以你仓库里的许可证为准。

### 性质说明（必读）

- **不是**工业级语言或生产就绪工具链；**不承诺** Web / 游戏 / 嵌入式 / Agent 等场景能「真上线干活」。仓库里出现的 OpenMP、GPU、CUDA、Win32 窗口、`bench/industry`（目录名）、「并行」「交付物」等，只表示 **有过实验代码或本地脚本**，**不等于**具备对应领域的可靠工程能力。
- **阅读主线（学习向）**：若想跟代码走一圈，可优先跟 **`--compile-c`（CLC）**、**自举**（`selfhost/`、`npm run test:bootstrap`）与 **AST 解释器**；其余多为拼图式实验。
- **字节码 VM（`--vm`）**：练习用路径之一，**不**作为能力宣传；与 CLC / 规范勿混谈。**VM 专项回归文件**（单元测、`tests/seed/vm/` 语料、字节码快照）**已从本公开树移除**；本地若自行补回，请勿提交（见 `.gitignore`）。

### 对外承诺 / 拆仓备忘（MIT 下仍可整仓保留）

若你希望 **对外叙事只强调 CLC + 自举**，但 **代码仍全部 MIT 留在本仓库**，可参考下表做文档或日后拆 npm 包——**不是**要求把这些目录改成闭源：

| 取向 | 目录 / 产物 | 说明 |
|------|----------------|------|
| **叙事与维护优先** | `src/core/`、`src/cli/`（含 CLC）、`tools/clc/`、`selfhost/` | 自举与 `--compile-c` 的最小闭环。 |
| **拆仓时可优先考虑迁出** | `jit/`、`aot/`、`native/cpp/`、`ai/`、`python/`、`rust/`、`wasm/` | 与 CLC+自举故事弱相关；迁出可减少外界误读（许可仍可 MIT）。 |
| **拆仓前要盘点依赖** | `modules/`、`types/`、`errors/`、`async/`、`concurrent/`、`optimizer/`、`memory/`、`ffi/`、`debug/`、`safety/`、`sandbox/` | 多被 core / CLI 间接引用；需配合依赖裁剪。 |
| **公共 API** | `src/index.ts`、`src/api.js` | 现为全家桶导出；若叙事收窄，可在文档或后续版本中强调 **parse / interpret / CLC** 为「主推集成面」。 |

**结论**：**整仓开源（MIT）** 与 **对外只说清承诺边界** 可以同时成立；不必把 jit～wasm 当成「必须闭源」，除非你另有商业策略要在别的许可证下分发。

---

## 适合拿来做什么

- 🤖 **练编译器与前后端**：默认偏「空格分隔」；**逗号可作可选分隔符**（数组、对象、实参等与 JS 类似），解析、代码生成、自举流水线——当课程设计或 side project 正好。
- 🔗 **对照 JS 语义**：控制流与表达式模型刻意贴近 JavaScript，便于对照 ECMA 心智模型（仍可能有边角差异，以规范草稿为准）。
- ⚡ **玩 CLI 代码生成**：可试 `--compile` 出 JS、`--compile-c` 出 C 再交给本机 gcc/clang；OpenMP / `--gpu` / `--cuda` / Win32 子系统等仅为 **实验开关**，默认假定你会自己判断能不能用、该不该用。
- 🛡️ **附带玩具级工具**：REPL、格式化、Lint、简单调试与 VS Code 语法包——方便本地折腾，**不是**可与主流工业链对标的一套。

## 快速开始

```bash
# 克隆 & 安装（将下列 URL 换成你的 fork 或上游仓库）
git clone https://github.com/seedlang-team/seedlang.git
cd seedlang && npm install && npm run build

# REPL 交互模式
npm run repl

# 运行 .seed 文件（示例语料仅在 examples/clc/）
node dist/cli.js examples/clc/test_clc.seed

# 编译到 JavaScript
node dist/cli.js --compile examples/clc/test_clc.seed -o demo.js

# 编译到 C 并构建原生二进制（需要 gcc/clang）
node dist/cli.js --compile-c examples/clc/physics_demo_clc.seed

# 自举 CLC 管线（仓库根 selfhost/）
npm run run:clc-seed

# 运行测试
npm test

# 性能基准测试
node bench/run.js

# 多核/并行对照基准
npm run bench:parallel
```

**Windows PowerShell（5.x）**：若一行命令里的 `&&` 报错，请分步执行，例如：

```powershell
Set-Location seedlang   # 换成你的克隆目录
npm install
npm run build
```

### 最小上手闭环（本地玩玩）

若只想「clone 下来能动两下」：

1. `npm install && npm run build`
2. `node dist/cli.js --compile your.seed -o out.js`
3. `node out.js`（产物结构随示例变化，接进严肃项目前请先读生成代码）

想继续可试 `--compile-c` + 本机编译器；其它 CLI 开关当 **选修实验**。读代码入口见 **[docs/ARCHITECTURE_MAP.md](docs/ARCHITECTURE_MAP.md)**。

### 热点优化（`src/jit`）说明

该目录中的流水线在 **AST / 中间表示** 上做类型画像、常量折叠、SSA 等优化，并把热点结果缓存在 `Map` 中供解释执行路径使用；**不会**生成机器码，也**不使用** `new Function` / `eval` 执行编译产物。与常见引擎中的「CPU JIT」不是同一概念；更接近 **解释器上的分层优化**。若要和别人讨论「跑得快不快」，请明说用的是 **`--compile-c` + 本机编译器** 还是解释器，避免统称「这个语言 JIT」。

### 性能基准读法（诚实口径）

- `bench/run.js` 等多处通过 **`execSync` 子进程墙钟**测量整段命令（生成、编译、执行可能都在一次计时里），读数前要分清测的是哪一段。
- 走 **C 后端**的对照：流程一般是「SeedLang `--compile-c` 生成 C → 调用 gcc/clang 编译 → 运行原生可执行文件」。与 **CPython / Node 直跑基准脚本**对比时，结果里混有 **编译器优化级别（如 `-O2`）**、**libc 与宿主环境** 以及 **生成 C 的质量**；不宜把整个加速比都表述成「SeedLang 语言/解释器单独的胜利」，更准确是 **「当前工具链 + 生成代码」相对某基线的墙钟**。
- 细粒度分解、消融与自查口径（执行模型 / GCC 消融 / Win32 / profiling）：见 **`docs/PERFORMANCE_VERIFICATION_CHECKLIST.md`**。

### CLC 基准 C 代码与本地编译

`bench/compile_clc_bench.js` 会生成 `bench/seedlang/bench_clc.c`（默认带 OpenMP 友好的并行 CLC 输出）。**Cursor / 某些 CI 的 shell 里可能没有把 MinGW 加进 PATH**，直接打 `gcc` 会误报「未安装」；此时请二选一：

- 设置环境变量 **`SEED_GCC`**（或通用的 **`CC`**）为编译器**完整路径**，例如 MinGW 的 `x86_64-w64-mingw32-gcc.exe`。
- 或在仓库根目录执行 **`npm run compile:bench-clc`**：会先按 `SEED_GCC` / `CC` / 常见 Windows 路径解析，再退回 PATH 上的 `gcc` / `clang`，并带 **`-fopenmp`** 链接（可用 **`SEED_OPENMP=0`** 关闭）。产物：`bench/seedlang/bench_clc.exe`。

## 语法速览

SeedLang 与 JavaScript：**无分号**；列表/参数可用 **空格或逗号** 分隔（逗号为可选，兼顾可读性与极简写法）

```seedlang
// 变量与基本类型
num = 42
name = "SeedLang"
flag = true

// 函数定义（参数可用空格或逗号分隔）
fn add(a b) {
  return a + b
}
// fn add(a, b) { ... }  // 等价

// 数组/对象（空格或逗号分隔均可）
arr = [1 2 3]
arr2 = [1, 2, 3]
obj = { name: "Alice" age: 20 }
obj2 = { name: "Alice", age: 20 }

// 调用函数（空格或逗号分隔实参）
print(add(1 2))
print(add(1, 2))

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

### JavaScript 后端（`--compile` / `-c`，实验向）

将 `.seed` 编译为 `.js`，带 memoization、内联、minify 等 **玩具级优化**，产物请勿默认当通用打包产物。

```bash
node dist/cli.js --compile app.seed -o app.js
node dist/cli.js --compile app.seed --minify
```

### C 后端（`--compile-c`，实验向）

将 `.seed` 编译为 `.c`，再由本机 gcc/clang 尝试链接成可执行文件。内置一大段 **模板化 C 支撑库**（体量≠工程质量）。下列条目均为 **「代码里有过这条路」**，**不**表示工业可用的内存模型、并行正确性或 GPU 栈：

- **引用计数 GC** — 实验性自动释放策略，非并发安全承诺
- **编码压缩数组** — 若干紧凑表示的尝试，非通用高性能数据结构保证
- **OpenMP** — `--parallel` 可能在部分循环上插入 pragma，需自行验证语义与安全
- **`--gpu`（OpenCL）** — 演示向路径，覆盖有限算子
- **`--cuda` / cuBLAS** — 演示向路径，依赖环境齐全时才值得一试
- **`--subsystem windows`** — 小型 Win32 示例向窗口管线，非 GUI 框架

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
│   │   ├── clc_runtime.ts        # CLC 生成用 C 模板（2200+ 行）
│   │   ├── clc_types.ts          # CLC 常量 & 错误类
│   │   ├── js_compiler.ts        # JS 编译器（compileToJS）
│   │   └── compiler_shared.ts    # 共享 AST 分析工具
│   ├── cli.ts                    # CLI 入口（compileToC + main）
│   ├── index.ts                  # 库入口
│   ├── api.js                    # 聚合入口（体积大；导出面见「开源边界」）
│   ├── token-counter.js          # Token 计数器
│   └── …                         # 另有 jit / aot / 绑定 / 扩展模块等目录，README 不列；是否公开见「开源边界」
│
├── tools/                        # 工具链
│   ├── clc/                      # CLC Win32（头文件/C 源码）
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
│   ├── industry/                 # 本地对照脚本（目录名历史遗留，非行业标准套件）
│   ├── samples/                  # 基准样本（矩阵/循环/嵌套）
│   ├── seedlang/                 # SeedLang 专项基准（含 CLC C 代码）
│   ├── sources/                  # 各语言基准源码（含并行版本）
│   └── win32/                    # Win32 性能测试
├── examples/                     # 仅 CLC / Win32 对照示例（见 examples/README.md）
│   ├── clc/                      # `.seed`、Win32 bat、应力/展示用例
│   └── particle_bench_win32/     # C++/Rust 与 CLC 对齐的 Win32 粒子基准
├── scripts/                      # 工具脚本
├── editors/vscode/               # VS Code 扩展源码
├── crl/                          # CRL（压缩表示层）词典与规则
├── data/                         # 数据/配置
└── seedlang/                     # 语言配置与元数据
```

## 可用命令（均为本地开发/实验脚本）

| 命令 | 说明 |
|------|------|
| `npm run build` | TypeScript 编译 |
| `npm run start` | 运行 CLI |
| `npm run repl` | 启动 REPL |
| `npm test` | 运行全量测试 |
| `npm run bench:parallel` | 多语言墙钟对照（玩具基准，勿当行业标准） |
| `npm run dev` | ts-node 开发模式 |
| `npm run bench:game` | 游戏向示例基准脚本 |
| `npm run bench:game:ci` | 本地门禁脚本（非云端工业 CI 承诺） |
| `npm run bench:game:trend` | 本地趋势输出 |
| `npm run bench:game:hotspots` | 热点辅助脚本 |
| `npm run lint:seed` | SeedLint 代码检查 |

## 内置函数速查（名字盘点，≠工业级库表）

以下为解释器侧 **可能出现的内置名**，覆盖度与边界行为随实验变化，**不要**假设与某标准库 1:1 对齐。

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
| **并行** | parallelMap, parallelFilter, parallelReduce（实验 API，非调度器保证） |

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

修改 **编译器核心**（`src/core/`）、**CLC / CLI 编译路径**（`src/cli/`、`src/cli/clc_*.ts`）或 **自举相关** 后建议执行：

```bash
node tests/test-suite.js      # 全量测试
npm run test:bootstrap          # 自举烟测（若触及 selfhost）
node bench/run.js               # 本地墙钟对照（读法见上文；非标准测评）
```

## 社区与开源

MIT 开源，学习与实验向；欢迎 **Issue / PR**（默认预期是玩具质量，请自行把握投入）：

| 文档 | 说明 |
|------|------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发环境、提交流程、提交信息规范 |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | 社区行为准则 |
| [SECURITY.md](SECURITY.md) | 漏洞报告与支持版本 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |

## License

MIT
