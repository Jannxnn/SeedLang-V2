# SeedLang 性能主张 · 验证清单（对照外部建议）

> **Note**: This is an internal performance verification document. Benchmark commands and results may vary by environment.

对外承诺：**每条主张尽量落到「可复现命令 / 路径」**；他人可按同一环境复核。

---

## 1. 执行模型说明

| 主张 | 现状 | 如何核对 |
|------|------|-----------|
| **原生 CLC**：Seed → C → 系统编译器 → 机器码 | `--compile-c`（可选 `--subsystem windows`） | `node dist/cli.js <file.seed> --compile-c [--subsystem windows] -o out.c` |
| **JS 后端**：语义落到 JS，由 V8 等执行 | `--compile` / `-c` | `node dist/cli.js app.seed --compile -o app.js` |
| **VM / 解释**：另一条性能曲线，≠ exe | `--vm`、字节码与宿主 JIT 文档 | `docs/VM_BOOTSTRAP_SPLIT_PLAN.md`、`README.md` 多运行时说明 |

**口径**：报 Win32 exe 数字时，标明 **CLC + GCC（或 clang）+ `-O` 档位**，不与「纯 VM」混谈。

---

## 2. 与 GCC 分工（避免「全是语言」或「全是 GCC」）

| 主张 | 现状 | 如何核对 |
|------|------|-----------|
| 同一份生成 `.c`，**`-O0` vs `-O2`** 可量化后端贡献 | 脚本对比 median 帧时间 | `node bench/win32/ablate_gcc_o0_o2.js [examples/clc下的.seed]` |
| **Lowering** 决定 GCC「好不好优化」 | 看生成 C、并对照手写等价 C（按需） | `compileToC` 产物中的热点循环 |

---

## 3. Win32 / GDI 管线稳定性与 FPS

| 主张 | 现状 | 如何核对 |
|------|------|-----------|
| Win32 + CLC 烟雾链路 | 编译 + 短时运行 | `npm run build` → `npm run verify:clc-win32` |
| 帧稳定性、ACAE / 碰撞 / 绘制管线 | 自动化基准 | `node bench/win32/run_win32_perf.js`（Windows） |
| **FPS**：高精度毫秒 + 平滑显示 | `win32.perfMillis()` + HUD | `examples/clc/win32_stress_sustained.seed` → `--compile-c --subsystem windows` |
| **视觉演示（中等负载、宣传片向）** | 干涉背景 + `fillCircle` + 底色彩条 | `examples/clc/win32_demo_showcase.seed` → 同上 |
| **高压长跑 / 录屏 demo** | 同上路 stress | 同上；勿长期开启 `SEED_WIN32_AUTOCLOSE` |

---

## 4. 算法与样本 workload（避免把 physics 全算在语言头上）

| 主张 | 现状 | 如何核对 |
|------|------|-----------|
| 演示里 **O(n²) 碰撞** 是刻意加压，非「粒子引擎上限」 | `NUM`、`collideResolve` 双重循环 | `examples/clc/win32_stress_sustained.seed`、`bench/win32/test*.seed` |
| 若要「两万粒子」类 headline | 需 **空间划分 / 宽相位** 等；属算法与数据结构工作量 | 路线图中单列，不与 CLC 前后端混淆 |

---

## 5. 与 C / Rust / Go「同算法对标」（可控变量）

| 主张 | 现状 | 如何核对 |
|------|------|-----------|
| 仓库内多档 industry / loop / interp 对照 | 持续扩充 | `bench/industry/run.js`、`bench/interp_vs_native_loop.js`、`bench/run.js` |
| **严格三角对标**：同算法、同规模、同机器 | 建议单独目录维护手写 C/Rust/Go + **固定编译版本 README 一行** | 可按 Fibonacci / 排序 / 矩阵 / 字符串 **逐项加行到此表** |

---

## 6. Profiling（perf / VTune 等）

| 主张 | 现状 | 如何核对 |
|------|------|-----------|
| 原生 exe 可用采样剖析器 | Windows：`win32_stress_sustained.exe` 等 | VS Profiler / Intel VTune / 同类工具 attach |
| Linux / CI 控制台基准 | `perf record/report`（若产物为 ELF） | 对 `bench/` 生成的控制台程序按需接入 |

---

## 7. 控制变量检查表（贴实验报告时可复制）

- [ ] **后端**：CLC 原生 / VM / JS（选一）  
- [ ] **编译器**：gcc/clang 路径与版本（`gcc --version`）  
- [ ] **优化**：`-O0` / `-O2` / `-O3`（写死）  
- [ ] **硬件**：CPU 型号、笔记本是否插电、分辨率（Win32 默认 **640×480**）  
- [ ] **workload**：源码路径 + `NUM`/帧数/constants  
- [ ] **环境**：是否设置 `SEED_WIN32_AUTOCLOSE`、`SEED_GCC` 等  

---

## 8. 维护约定

- 新增基准：**在本文件追加一行**（主张 | 脚本路径 | 一句话结论）。  
- README / 视频简介：**链接本文件**，避免口头口径漂移。

---

*文档版本：与仓库 `examples/clc/win32_stress_sustained.seed`、`bench/win32/ablate_gcc_o0_o2.js`、`win32.perfMillis()` 实现同步演进。*
