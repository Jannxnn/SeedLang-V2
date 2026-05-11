# SeedLang Roadmap

> SeedLang 发展路线图 — 当前进度、短期目标、长期愿景

**最后更新**: 2026-05-09 | **当前版本**: 2.0.0

---

## 项目愿景

SeedLang 是一个 **AI-first 编程语言**，目标是在保持 JavaScript 语义兼容的前提下，用极简语法降低 token 消耗，同时提供编译到原生二进制的能力。SeedLang 的设计哲学：**少写、快跑、到处用**。

三大核心支柱：
1. **极简语法** — 空格分隔、无逗号、无分号，适合 AI 生成和人类阅读
2. **双编译后端** — JavaScript 后端（Web/Node.js 部署）+ C 后端（原生二进制，支持 OpenMP/GPU/CUDA）
3. **多运行时** — Web / Agent / Game / Graphics / Mobile / Embedded 六大运行时

---

## 当前状态

### ✅ 已完成 (v2.0.0)

#### 语言核心
- [x] 极简语法（空格分隔、无逗号、无分号）
- [x] 变量赋值、基本类型（Number、String、Bool、Null）
- [x] 算术/比较/逻辑表达式
- [x] `if/else` 条件分支
- [x] `while` 循环
- [x] `for-in` 迭代循环
- [x] `break` / `continue`
- [x] 函数定义与调用（多返回值）
- [x] 箭头函数 `(x) => x * 2`
- [x] 闭包
- [x] 数组/对象字面量
- [x] 成员访问 `.` / 索引访问 `[]`
- [x] and / or / not 逻辑关键字
- [x] 取模 `%`
- [x] C-style for(;;) 循环
- [x] 位运算符 (`&` `|` `^` `~` `<<` `>>` `>>>`)
- [x] 进制字面量 (0b/0B, 0o/0O, 0x/0X)

#### 高级语言特性
- [x] `class` 类定义（构造函数、方法）
- [x] 类继承
- [x] `match` 模式匹配
- [x] `generics` 泛型
- [x] `try/catch/finally` 错误处理
- [x] `throw` 异常抛出
- [x] 协程 `coro` / `yield`
- [x] `async/await` 异步编程
- [x] 模块系统 `import` / `export`
- [x] 宏系统 `macro`（过程宏）
- [x] `proc` 过程宏

#### 编译后端
- [x] JavaScript 编译器 (`compileToJS`)
  - 自动 memoization
  - 内联优化
  - Minify
- [x] C 编译器 (`compileToC`)
  - 2200+ 行 C 运行时 (sl_runtime.h)
  - 引用计数 GC
  - 编码压缩数组 (U8/U16/I32/I64/F64/Mixed)
  - OpenMP 并行（自动安全循环检测）
  - GPU 加速（OpenCL）
  - CUDA 加速（cuBLAS）
  - Win32 原生 GUI（`--subsystem windows`）

#### 工具链
- [x] CLI 命令行工具
- [x] REPL 交互模式
- [x] 代码格式化器 (`seed-format`)
- [x] 代码检查器 (`seed-lint`)
- [x] Token 计数器
- [x] 调试器
- [x] 文件监视器
- [x] 包管理器 (`seed-pm`)
- [x] Web 编译器
- [x] 文档生成器
- [x] VS Code 扩展（语法高亮、代码片段）

#### 运行时
- [x] 字节码虚拟机（VM，80+ 模块化文件）
  - JIT 编译器（SSA/内联缓存/寄存器分配/SIMD/尾调用）
  - 协程/Fiber 调度器
  - 模块系统
  - 沙箱隔离
- [x] Web 运行时（DOM/组件）
- [x] Agent 运行时（任务/记忆/工具）
- [x] Game 运行时（场景/实体/物理/音频）
- [x] Graphics 运行时（Canvas/终端渲染）
- [x] Mobile 运行时（设备/传感器/通知）
- [x] Embedded 运行时（GPIO/I2C/SPI）

#### 跨语言集成
- [x] C++ Native Addon
- [x] Rust 绑定（Cargo）
- [x] Python 绑定
- [x] WASM 加载器
- [x] 外部函数接口 (FFI)

#### 测试
- [x] 全量测试套件 1364+ 测试用例
- [x] 性能基准测试（跨语言对比：JS/Python/Lua/C/C++/Rust）
- [x] 压力/并发/安全测试

---

### 🔴 进行中 — CLC 自举编译器

SeedLang 正在通过 **自举** (self-bootstrap) 构建自己的原生编译器。CLC (C Language Compiler) 是一个用 SeedLang 编写的 SeedLang→C 编译器，可以通过自身编译自己。

#### CLC 自举状态

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| M0: 基础 C 编译器 (手写 C) | ✅ 完成 | `clc_cli_full.c` (104KB) — 完整编译器手写实现 |
| M1: 自举固定点 | ✅ 完成 | Seed 编译器自编译, SHA256 一致 |
| P1: 语法特性 | ✅ 完成 | let/block, and/or/not, 位运算, 进制字面量, for(;;) |

#### CLC 待实现特性

| 优先级 | 特性 | 状态 |
|--------|------|------|
| P1 | `//` 单行注释 / `/* */` 多行注释 | ⬜ 待实现 |
| P2 | `try/catch/throw` 错误处理 | ⬜ 计划中 |
| P2 | `import/export` 模块系统 | ⬜ 计划中 |
| P3 | `class` 类定义与继承 | ⬜ 计划中 |
| P3 | `match` 模式匹配 | ⬜ 计划中 |
| P3 | `generics` 泛型 | ⬜ 计划中 |

---

## 短期计划 (P1-P2, v2.1)

### P1: 注释支持
- `//` 单行注释
- `/* */` 多行注释 / 行内注释
- 在 tokenizer 中跳过注释内容

### P2: 错误处理 + 模块系统
- `try/catch/throw` 完整语义
- `import` / `export` 模块加载
- 运行时错误传播

---

## 中期计划 (P3, v2.2-v2.3)

### P3: 面向对象 + 高级特性
- `class` / `init` / 方法定义 / `this`
- 类继承 / `super` 调用
- `match` 模式匹配（值匹配、类型匹配、解构）
- `generics` 泛型函数与类
- `interface` / `impl` trait 系统

### 编译器优化
- 更多 JIT 优化（逃逸分析、内联提升）
- CLC 编译产物性能对标 GCC -O2
- 增量编译
- LSP 语言服务器协议

---

## 长期愿景 (v3.0+)

### 语言演进
- 类型推断增强（全程序类型推导）
- Algebraic Effects（代数效应）
- 结构化并发
- 编译时计算 (comptime)
- 元编程（编译期反射）

### 生态系统
- 标准库扩展（HTTP、数据库、加密、机器学习）
- 包注册中心 (registry)
- CI/CD 集成
- 云函数运行时
- IDE 深度集成（JetBrains / VS Code 高级功能）

### 性能
- 全 AOT 编译路径
- LLVM 后端探索
- ThreadSanitizer / AddressSanitizer 集成
- 编译产物大小优化（< 100KB 最小二进制）

---

## 发布节奏

| 版本 | 预计 | 主要内容 |
|------|------|----------|
| v2.0.0 | ✅ 已发布 | 多运行时、双编译后端、完整工具链 |
| v2.1.0 | 规划中 | P1-P2 完成，CLC 注释+错误处理+模块 |
| v2.2.0 | 规划中 | P3 前半（class / match） |
| v2.3.0 | 规划中 | P3 后半（generics / interface） |
| v3.0.0 | 远期 | 全特性 CLC，生态建设 |

---

## 贡献指南

欢迎贡献！详见 `CONTRIBUTING.md`（即将添加）。开发流程：

1. Fork 仓库
2. 创建特性分支
3. 修改代码 + 添加测试
4. 运行 `npm test` 确保全量通过
5. 运行 `node bench/run.js` 确保性能无退化
6. 提交 Pull Request

---

## License

MIT © 2026 SeedLang Team