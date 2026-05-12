# SeedLang 仓库地图（读代码从哪开始）

> **个人实验 / 学习向** 仓库；不是工业编译器地图。目的：减少「目录很大但不知道主链在哪」的挫败感。细节以源码为准；本页只标**入口与并行线**。

**阅读主线（与 README 一致）**：**C 后端（CLC）** + **自举**（`selfhost/`、`npm run test:bootstrap`）。字节码 VM 仅练习路径；若对照 `--vm`，勿与 CLC 性能/功能混谈。

## 建议读者路线

| 你想做的事 | 优先打开 |
|------------|----------|
| **CLC**：`--compile-c`、原生链接、Win32 子系统 | `src/cli/cli_clc_native.ts`、`src/cli/clc_runtime.ts`、`src/cli.ts` 内 `compileToC` |
| **自举**：CLC 生成物、烟测 | `selfhost/`、`tests/bootstrap/`、`npm run run:clc-seed` |
| 跑 `.seed`、编译 JS、通用命令行参数 | `dist/cli.js`（`src/cli.ts` 入口 + `compileToC` 等大函数）；`src/cli/cli_argv.ts`（argv 解析）、`cli_run_modes.ts`、`cli_async_drain.ts`（顶层 Promise 收尾）、`cli_usage.ts` 等 |
| 当 **npm 库** 用：`parse` / `run` / `create*Runtime` | `src/index.ts` → 产物 `dist/index.js` |
| REPL、AOT、模块等「全家桶」聚合（含可选 VM） | `src/api.js`（体量大）；**`RuntimeFactory`** 从 `dist/runtime/*.js` 加载，**需先 `npm run build`** |
| 语言规范与语法边界 | `docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md` |
| 性能数字怎么读 | `docs/PERFORMANCE_VERIFICATION_CHECKLIST.md` |

## 两条执行/实现线（并存，别混成一条）

1. **`src/core/`（TypeScript）**  
   `lexer.ts`、`parser.ts`、`interpreter.ts` 等：AST + 直接解释；规范、类型与 **自举/测试主路径**多在此延伸。**学习时默认跟踪这条 + CLC。**

2. **`src/runtime/vm/`（大量 JavaScript）**  
   `vm.js` 为字节码 VM 入口；`compiler.js`、`run_full.js`、`run_fast.js`、`execute_op_inline.js` 等。**非学习主线**；与 `src/core` 并存，读语义或性能时务必标明走的是哪条线，避免把 VM 侧能力与 CLC/规范草稿绑在一起。

## 编译产物

- **`npm run build`**：`src/**/*.ts` → `dist/**/*.js`（含 `dist/runtime/*.js`）。  
- **`node dist/cli.js --compile …`**：走 `src/cli/js_compiler.ts` 等，产出可在 Node 或打包工具链中使用的 JS。  
- **`--compile-c`**：`src/cli.ts` 内 `compileToC` 等，产出 C 后再由本机 gcc/clang 构建（见 README 与 CLC 相关说明）。

## 「JIT」相关

- **`src/jit/`**：AST/字节码层面的优化与缓存（见 README「热点优化」说明）。  
- **`src/runtime/vm/jit_*.js`**：VM 路径上的另一套热点/内联等逻辑。  
两者名称相近，**职责不同**，排查问题时不要默认是同一模块。

## 示例与工具

- **示例**：仅 **`examples/clc/`**、**`examples/particle_bench_win32/`**（CLC / Win32）；自举见仓库根 **`selfhost/`**。  
- **基准**：`bench/run.js` 等（子进程墙钟；读法见 README「性能基准读法」）。  
- **测试入口**：`npm test` → `tests/test-suite.js`。

## 未在本文展开但易混淆的点

- **Mobile / Agent / Embedded**：多为 API 语义 + 仿真/桩；真机、LLM、硬件在宿主侧扩展（README「运行时说明」）。  
- **`repl.js`**：`require('./src/api')`，与 `dist/index.js` 的瘦入口不同，别假定导出一致。
