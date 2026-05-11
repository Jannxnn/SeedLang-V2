# Changelog

## [2.0.0] — 2026-05-09

### 新增
- 多运行时架构：Web / Agent / Game / Graphics / Mobile / Embedded
- 双编译后端：JavaScript + C（原生二进制）
- C 编译器 (compileToC)：引用计数 GC、编码压缩数组、OpenMP/GPU/CUDA 加速
- 字节码虚拟机（80+ 模块化文件）
- JIT 编译器（SSA/内联缓存/寄存器分配/SIMD/尾调用）
- C-style for(;;) 循环
- 位运算符 (`&` `|` `^` `~` `<<` `>>` `>>>`)
- 进制字面量 (0b/0B, 0o/0O, 0x/0X)
- and / or / not 逻辑关键字
- 取模 `%`
- 类定义与继承
- 模式匹配 (match)
- 泛型 (generics)
- 宏系统
- 协程 / Fiber 调度器
- 沙箱隔离
- 跨语言集成（C++/Rust/Python/WASM）
- VS Code 扩展
- 完整工具链（REPL/格式化/检查/调试/包管理）

### CLC 自举编译器
- 基础 C 编译器手写实现 (clc_cli_full.c)
- SeedLang 自编译固定点达成
- let + block scope 支持
- and/or/not 支持
- 位运算支持
- 进制字面量支持
- C-style for(;;) 支持

### 测试
- 全量测试套件 1364+ 用例
- 跨语言性能基准测试

---

历史版本变更记录从 v2.0 开始维护。早期开发日志见 git 提交历史。