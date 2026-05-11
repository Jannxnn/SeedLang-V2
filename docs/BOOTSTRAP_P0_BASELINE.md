# SeedLang Bootstrap P0 Baseline

> **Note**: This is a historical development milestone document. Some features marked as "out (P1)" have since been implemented. For current language features, see [LANGUAGE_SPEC_REFACTOR_DRAFT.md](./LANGUAGE_SPEC_REFACTOR_DRAFT.md).

## 1. Scope (P0)

P0 目标是打通 `seed0(JS/TS实现)` 到 `seed1(SeedLang子集实现)` 的最小闭环，不追求全语法覆盖。

本阶段仅覆盖以下最小子集：

- 变量赋值：`x = expr`
- 字面量：number/string/bool/null
- 二元表达式：`+ - * / % < <= > >= == != and or`
- 控制流：`if/else`、`while`
- 函数：`fn f(a b) { ... }`、`return`
- 调用：`f(1 2)`、嵌套调用
- 集合：数组/对象字面量、成员访问/索引访问
- 基础内建：`len`（以及运行时默认内建）

## 2. Non-Goals (P0)

以下能力不纳入 P0 验收：

- class/new 组合与继承细节
- try/catch/finally 的复杂控制流
- coroutine/macro/match/type-system 等扩展能力
- module/import/export 全链路
- 性能优化（JIT/SSA/AOT）等高阶路径

## 3. Syntax-to-Runtime Mapping (P0)

| 语法能力 | Parser入口 | VM编译入口 | P0状态 |
|---|---|---|---|
| if/else | `parseIfStatement()` | `case 'if'` -> `ifStmt()` | in |
| while | `parseWhileStatement()` | `case 'while'` -> `whileStmt()` | in |
| fn/return | `parseFunctionDef()` / `parseReturnStatement()` | `case 'function'` / `case 'return'` | in |
| 赋值/变量 | `parseAssignment()` | `case 'assign'` / `case 'varDecl'` | in |
| 函数调用 | `parseCall()` | `case 'call'` | in |
| 二元表达式 | 表达式链路 | `case 'binary'` | in |
| 数组字面量 | `parseArrayLiteral()` | `case 'array'` | in |
| 对象字面量 | `parseObjectLiteral()` | `case 'object'` | in |
| 成员/索引访问 | `MemberAccess`/`IndexAccess` 解析链路 | `member/index` 分支 | in |
| for-in / for-C | `parseForStatement()` | `case 'forIn'` / `case 'forC'` | out (P1) |
| class | `parseClassDef()` | `case 'class'` | out (P1) |
| try/throw | `parseTryStatement()` | `case 'try'` / `case 'throw'` | out (P1) |

## 4. Smoke Case Set (P0)

P0 smoke 先固定 10 个稳定样例（复用现有 `tests/seed/basic`）：

1. `arithmetic.seed`
2. `function_two_args.seed`
3. `if_else.seed`
4. `factorial_while.seed`
5. `array_object.seed`
6. `string_ops.seed`
7. `logic_and_or.seed`
8. `math_abs_sqrt.seed`
9. `object_nested.seed`
10. `closure.seed`

## 5. P0 Exit Criteria

- `bootstrap smoke` 10/10 通过。
- 上述子集可稳定运行并输出 `EXPECT` 结果。
- 能输出失败明细（文件、期望值、实际值/异常）。
- 为 P1 预留扩展点（for/class/try 三类能力）。
