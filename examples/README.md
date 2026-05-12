# Examples（CLC + Win32 对照）

本目录已 **收窄**：仅保留 **C 后端（CLC）** 与 **Win32 / 对照基准** 相关示例。Web / 跨栈 compare / 大型浏览器游戏 / sandbox / deliverables 脚本等已移除；稳定性 golden 见 **`tests/deliverables/fixtures/stability-check/`**。

## 布局

- **`hello/`**：最小 `print`、**文件读写式「输入」**（`io_read_file.seed` + `hello_input.txt`），README「Hello World」与 clone 后验证用
- **`clc/`**：`.seed` 源（含 `win32_smoke`、`physics_demo_clc`、迷宫 Win32、`raiden_win32` 等）、`run_*_win32.bat`
- **`particle_bench_win32/`**：`particle_bench.cpp` + Rust，与 `examples/clc/win32_stress_sustained.seed` 语义对齐（见 `npm run verify:particle-bench-consistency`）

## 常用命令（仓库根）

```bash
npm run build
node dist/cli.js examples/hello/hello.seed
node dist/cli.js examples/hello/io_read_file.seed
node dist/cli.js examples/clc/test_clc.seed
node dist/cli.js --compile-c examples/clc/physics_demo_clc.seed
npm run verify:clc-win32
npm run compile:game:dungeon-win32   # → dist/dungeon_win32.c
npm run run:clc-seed                 # 自举：selfhost/clc/clc.seed
```

## 维护

- 新增示例优先放在 **`examples/clc/`** 子目录并附带简短注释（如何编译 / 依赖 gcc 或 Win32）。
- **勿再引入** 依赖 `SeedLangVM`（`src/runtime/vm.js`）的示例脚本。
