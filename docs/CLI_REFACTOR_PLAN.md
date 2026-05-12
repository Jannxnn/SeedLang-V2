# CLI 与解释器重构计划

本文档冻结目标、优先级与执行顺序，便于拆分 PR 与回归门禁。可直接按章节推进并在 PR 中引用。

---

## 目标回顾

- **CLI 工程化**：入口薄、argv 与运行路径清晰、可测。
- **单文件拆分**：减轻 `cli.ts` 体积（主要是 `compileToC` + CLC 生成）。
- **输出**：`print` 与宿主控制台策略一致、无重复。
- **异步语义**：CLI 能可靠等到「该等的」异步；`async fn` 体内的 `await` 与 `input` 行为与规范一致。

---

## 当前状态（已完成部分）

- `cli_argv`、`cli_async_drain`、顶层 Promise drain、`mirrorPrintToConsole`、`main async`。
- 文档与地图已部分更新。
- **仍待办**：`compileToC` 仍在 `cli.ts`；`async fn` 体内 `await` 仍不完整。

---

## P0 — 冻结行为与回归门禁（先做，防拆分时炸）

**目的**：固定「对外契约」，避免后续拆分或解释器改动静默改变行为。

### 对外契约（须与当前一致）

以下场景的 **stdout / stderr / exit code** 与当前实现一致（除已接受的：**单行 print、无 `=== Output ===`**）：

- `node dist/cli.js <file>`
- `--eval`
- `--compile` / `--compile-c`
- `-h` / `-v`

### 门禁脚本（最低限度）

1. `npm run build`
2. `node tests/core/test-architecture.js`
3. 有余力：`npm test` 全量

### 基线（可选）

把当前 `dist/cli.js` 跑若干条 golden 命令的输出存到 `tests/` 或 CI 注释里，便于 diff 回归。

---

## P1 — 解释器：`async fn` 体内真正 await（阻塞 stdin / 顶层语义）

### 问题根因

`executeAsyncFunctionDef` 用 `setTimeout` 包一层、语句循环不等待 `await` 产生的 `Promise`，导致 `await input(...)` 等仍可能 **进程先退出** 或 **变量仍是 `undefined`**。

### 实施前读透

- `executeAsyncFunctionDef`、`executeStatement` 里对 `AwaitExpression` / `Assignment` 的处理。
- 对照 `evaluateAwait`。

### 设计方向（最小语义）

任选其一或组合评估：

- `async fn` 体执行改为 **async 管道**（例如每句 `await` 上一句的 `Promise`），或
- 去掉 `setTimeout(0)`，改为 **显式微任务队列**（需评估与 JIT / 环境的交互）。

### 单测优先（失败先红后绿）

- 顶层：`await main()`。
- `async fn main() { x = await input(); print(x) }` + **stdin pipe**（CI 里用 `echo` 管道）。
- 再打开文档：把 README / `AI_QUICK_START` / 规范里「stdin 仍优先 `readFile`」降级为 **「仅复杂场景再建议 `readFile`」**，与实现一致。

### 风险与 PR 边界

- 动到解释器核心，可能影响 JIT、协程、现有测试。
- **单独 PR**，不要与 P2 混。

---

## P2 — `cli.ts` 拆分：`compileToC` 迁出

**目标**：`cli.ts` 只保留入口、`main`、与 `compileToC` 的薄封装（或再薄一层 re-export），大块 C 生成进独立模块。

### 建议文件（名可再议）

- `src/cli/clc_codegen.ts`（或 `clc_emit.ts`）：`compileToC` 及仅被其调用的私有辅助函数。
- 若仍过大：再拆 `clc_emit_expr.ts` / `clc_emit_stmt.ts`（按 AST 节点或按 Win32 / OpenMP 等域切）。

### 步骤

1. **只搬函数、不改算法**：第一轮 `git mv` + `export function compileToC` 迁出，`cli.ts` 中 `import { compileToC } from './cli/clc_codegen'`。
2. **处理 require/import 环**：保证 `clc_codegen` **不反向** `import cli.ts`；公共类型放 `clc_types.ts` / `compiler_shared.ts`。
3. **bench / 单测**：若存在 `require('dist/cli.js').compileToC`，改为 `require('dist/cli/clc_codegen.js')` 或继续从 cli 聚合导出（二选一，全局搜 `compileToC`）。

### 体积目标

`cli.ts` 行数明显下降即可，不必一次拆到理想粒度。

---

## P3 — CLI 行为一致性与边角

### `--watch` + general 模式

当前仍用默认 `mirrorPrintToConsole`。二选一：

- 与 `runFile` 对齐（无镜像 + 可选 drain），或
- 文档写明 **「watch 为开发模式，输出策略不同」**。

### `runEval` 与 `runFile`

是否打印 `[General Mode]` / 统一前缀（产品取舍）。

### `--web` / `--agent` 等

`filePath` 缺失时的报错与 `--help` 示例对齐。

### 两条 REPL

`npm run repl` vs `seedlang --repl`：在 README 用**表格**写死差异（短期）；长期若要统一再单独立项。

---

## P4 — 可选工程化（有余力再做）

- **结构化 argv**：用 commander / yargs 或手写 `ParsedCli` 判别联合类型，替代 `Record<string, unknown>`。
- **退出码规范**：compile 失败、lint 失败、运行时错误分别固定 exit code。
- **E2E**：少量 `execSync` 脚本测 golden CLI 输出（防回归）。

---

## 推荐执行顺序（下次按此做）

| 顺序 | 项   | 说明 |
|------|------|------|
| 1    | P0   | 门禁与契约冻结 |
| 2    | P1   | 解释器 async 体（价值最高，解 stdin / 顶层语义） |
| 3    | P2   | 拆 `compileToC`（低风险、可渐进） |
| 4    | P3   | 边角一致性与文档 |
| 5    | P4   | 按需 |

---

## 变更记录

| 日期       | 说明     |
|------------|----------|
| 2026-05-12 | 初稿入库 |
