# VM 自举拆分计划（第一版）

> **Note**: This is an internal development plan document. Implementation progress is tracked inline. For current VM architecture, see `src/runtime/vm/` directory structure.

## 目标

在不破坏现有语义与性能基线的前提下，将 `src/runtime/vm.js` 拆成可渐进替换的模块，为 SeedLang 自举实现提供稳定边界。

## 分阶段

1. Phase 1（已启动）
- 建立新入口：`src/runtime/vm/index.js`
- 冻结最小 ABI：`src/runtime/vm/spec.js`
- 迁移调用方到新入口（先从 bench 开始）
- 保持 `src/runtime/vm.js` 作为唯一实现体

2. Phase 2
- 抽离 `builtins` 注册和宿主桥接（文件/网络/时间/JSON）
- 抽离 `call/return` 和 `frame` 相关 ABI 断言
- 当前进度：已建立 `src/runtime/vm/builtins/index.js` 工厂边界，暂由旧实现委托
- 当前进度：已抽出首批 `core` builtins（math/string 基础集）到 `src/runtime/vm/builtins/core.js`
- 当前进度：已抽出 `collection` builtins（array/object/type 基础集）到 `src/runtime/vm/builtins/collection.js`
- 当前进度：已抽出 `data` builtins（json/string 扩展/object 合并/类型转换）到 `src/runtime/vm/builtins/data.js`
- 当前进度：已抽出 `ai_async` builtins（AI 辅助 + sleep/fetch/fetchJson）到 `src/runtime/vm/builtins/ai_async.js`
- 当前进度：已抽出 `graphics` builtins（seed.graphics）到 `src/runtime/vm/builtins/graphics.js`
- 当前进度：已抽出 `io` builtins（print/gui.log）到 `src/runtime/vm/builtins/io.js`
- 当前进度：已抽出 `builtins/bootstrap_wiring`（initBuiltins 组装委托）到 `src/runtime/vm/builtins/bootstrap_wiring.js`
- 当前进度：已建立 `builtins/index`（builtins 工厂统一导出）到 `src/runtime/vm/builtins/index.js`
- 当前进度：已抽出 `modules/system`（fs/json/time）到 `src/runtime/vm/modules/system.js`
- 当前进度：已抽出 `modules/platform_network`（path/os/http）到 `src/runtime/vm/modules/platform_network.js`
- 当前进度：已抽出 `modules/web_html`（web/html）到 `src/runtime/vm/modules/web_html.js`
- 当前进度：已抽出 `modules/parallel`（parallel）到 `src/runtime/vm/modules/parallel.js`
- 当前进度：已抽出 `modules/concurrency`（concurrency）到 `src/runtime/vm/modules/concurrency.js`
- 当前进度：已抽出 `modules/coroutine`（coroutine）到 `src/runtime/vm/modules/coroutine.js`
- 当前进度：已抽出 `modules/closure_runner`（闭包执行共享逻辑）到 `src/runtime/vm/modules/closure_runner.js`
- 当前进度：已建立 `modules/index`（模块工厂统一导出）到 `src/runtime/vm/modules/index.js`
- 当前进度：已抽出 `bootstrap_wiring`（initModules 组装委托）到 `src/runtime/vm/bootstrap_wiring.js`
- 当前进度：协程 resume/status 与 `YieldSignal` 合并为单一 TS 源文件 `src/core/coroutine.ts`（VM 侧 `require('../../dist/core/coroutine.js')`）。
- 当前进度：已抽出 `return_ops`（return 判定共享 helper）到 `src/runtime/vm/return_ops.js`
- 当前进度：已抽出 `jit_safety`（JIT 常量校验与安全函数构造）到 `src/runtime/vm/jit_safety.js`
- 当前进度：已抽出 `object_key_safety`（对象键安全判定与键解码 helper）到 `src/runtime/vm/object_key_safety.js`
- 当前进度：已抽出 `runtime_safety`（宿主对象安全检查与数组硬化 helper）到 `src/runtime/vm/runtime_safety.js`
- 当前进度：已抽出 `global_guard_policy`（敏感模块/全局名策略 helper）到 `src/runtime/vm/global_guard_policy.js`
- 当前进度：已抽出 `import_policy`（导入白名单构建与模块解析 helper）到 `src/runtime/vm/import_policy.js`
- 当前进度：已抽出 `global_sanitizer`（执行期全局清理 helper）到 `src/runtime/vm/global_sanitizer.js`
- 当前进度：已抽出 `global_trust`（受信全局名判定 helper）到 `src/runtime/vm/global_trust.js`
- 当前进度：已抽出 `global_init`（全局内建组装初始化 helper）到 `src/runtime/vm/global_init.js`
- 当前进度：已抽出 `execution_budget`（执行预算创建/消耗 helper）到 `src/runtime/vm/execution_budget.js`
- 当前进度：已抽出 `closure_exec_context`（闭包调用执行态保存/恢复 helper）到 `src/runtime/vm/closure_exec_context.js`
- 当前进度：已抽出 `public_globals_api`（受控 set/get/delete 全局门面 helper）到 `src/runtime/vm/public_globals_api.js`
- 当前进度：已抽出 `public_vm_facade`（只读 globals 代理与公开 vm 门面组装 helper）到 `src/runtime/vm/public_vm_facade.js`
- 当前进度：已抽出 `run_guard_options`（run 隔离模式与执行守卫/导入覆盖预处理 helper）到 `src/runtime/vm/run_guard_options.js`
- 当前进度：已抽出 `global_value_sync`（全局槽位回写 globals 的同步/刷写 helper）到 `src/runtime/vm/global_value_sync.js`
- 当前进度：已抽出 `run_same_code_fast_path`（同代码重跑 fast-path helper）到 `src/runtime/vm/run_same_code_fast_path.js`
- 当前进度：已抽出 `run_global_jit_cache`（global JIT cache 命中 fast-path helper）到 `src/runtime/vm/run_global_jit_cache.js`
- 当前进度：已抽出 `run_bytecode_resolution`（run 的字节码解析/编译/type-check/缓存命中 helper）到 `src/runtime/vm/run_bytecode_resolution.js`
- 当前进度：已抽出 `run_post_execution_cache`（执行后 JIT/SFP 缓存回填与预热 helper）到 `src/runtime/vm/run_post_execution_cache.js`
- 当前进度：已抽出 `run_result_finalize`（run 返回结果安全报告收尾 helper）到 `src/runtime/vm/run_result_finalize.js`
- 当前进度：已抽出 `run_fast_path_resolution`（runFastPath 的字节码命中/回退判定 helper）到 `src/runtime/vm/run_fast_path_resolution.js`
- 当前进度：已抽出 `run_async_resolution`（runAsync 的字节码命中/编译 helper）到 `src/runtime/vm/run_async_resolution.js`
- 当前进度：已抽出 `run_error_result`（run/runAsync 异常结果封装 + 行号/代码片段构建 helper）到 `src/runtime/vm/run_error_result.js`
- 当前进度：已抽出 `run_fast_path_execute`（runFastPath 执行/同步/错误日志抛出 helper）到 `src/runtime/vm/run_fast_path_execute.js`
- 当前进度：已抽出 `run_execute_finalize`（run 执行/同步/后置缓存/结果收尾 helper）到 `src/runtime/vm/run_execute_finalize.js`
- 当前进度：已抽出 `run_fast_path_orchestrator`（runFastPath fallback/resolve/execute 编排 helper）到 `src/runtime/vm/run_fast_path_orchestrator.js`
- 当前进度：已抽出 `run_async_orchestrator`（runAsync resolve/execute/error-result 编排 helper）到 `src/runtime/vm/run_async_orchestrator.js`
- 当前进度：已抽出 `run_pre_execution_orchestrator`（run 前置 fast-path/JIT/字节码解析 编排 helper）到 `src/runtime/vm/run_pre_execution_orchestrator.js`
- 当前进度：已抽出 `run_orchestrator`（run 入口 try/catch + pre-exec + execute/finalize 编排 helper）到 `src/runtime/vm/run_orchestrator.js`
- 当前进度：已抽出 `run_entry_orchestrator`（run guard 准备 + child-run 回退 + run-orchestrator 分发 helper）到 `src/runtime/vm/run_entry_orchestrator.js`
- 当前进度：已抽出 `run_child_fallback`（run entry 的 child-vm 回退回调工厂 helper）到 `src/runtime/vm/run_child_fallback.js`
- 当前进度：已抽出 `run_guard_child_vm`（isolatedRun/preserveGlobals 的 child-vm guard 分支 helper）到 `src/runtime/vm/run_guard_child_vm.js`
- 当前进度：已抽出 `run_guard_runtime_overrides`（run 时 guard/import-policy 覆盖项应用 helper）到 `src/runtime/vm/run_guard_runtime_overrides.js`
- 当前进度：已抽出 `run_guard_execution_limit_overrides`（maxInstructions/maxExecutionMs/executionGuard 覆盖项应用 helper）到 `src/runtime/vm/run_guard_execution_limit_overrides.js`
- 当前进度：已抽出 `run_guard_import_policy_overrides`（allowSensitiveImports/allowedImports 覆盖项应用 helper）到 `src/runtime/vm/run_guard_import_policy_overrides.js`
- 当前进度：已抽出 `run_guard_result`（guard 继续执行返回结果构造 helper）到 `src/runtime/vm/run_guard_result.js`
- 当前进度：已抽出 `run_deps_factory`（run/runFastPath/runAsync 依赖组装 helper）到 `src/runtime/vm/run_deps_factory.js`
- 当前进度：已抽出 `public_vm_invocation`（call/getNativeFn 全局 native 调用 helper）到 `src/runtime/vm/public_vm_invocation.js`
- 当前进度：已抽出 `public_vm_runtime_controls`（setGraphicsHost/reset/typeChecker/safety/errorReporter 控制 helper）到 `src/runtime/vm/public_vm_runtime_controls.js`
- 当前进度：已抽出 `public_vm_globals_orchestrator`（set/get/deleteGlobal owner 级编排 helper）到 `src/runtime/vm/public_vm_globals_orchestrator.js`
- 当前进度：已抽出 `public_vm_init_orchestrator`（构造期 public facade/模块挂载/可选能力配置 编排 helper）到 `src/runtime/vm/public_vm_init_orchestrator.js`
- 当前进度：已抽出 `public_vm_parser_bootstrap`（构造期 parser/compiler 初始化编排 helper）到 `src/runtime/vm/public_vm_parser_bootstrap.js`
- 当前进度：已抽出 `public_vm_run_bridge`（run/runFastPath/runAsync 公共桥接 + 依赖编排 helper）到 `src/runtime/vm/public_vm_run_bridge.js`
- 当前进度：`public_vm_run_bridge` 内聚了 run 相关 orchestrator/deps factory/error-result 依赖，`vm.js` 不再直接感知这些细节
- 当前进度：`public_vm_run_bridge` 已接管 run 运行时状态创建（global caches + deps bundle），`vm.js` 运行时常量区进一步减薄
- 当前进度：run 全局缓存默认上限（64）已下沉到 `public_vm_run_bridge`，`vm.js` 去除对应常量配置噪音
- 当前进度：`createPublicRunBridgeDeps` 与运行时状态组装已收敛为 run bridge 内部实现细节，对外只保留 `createPublicRunRuntimeBindings` 作为运行时 wiring 入口
- 当前进度：`createPublicRunRuntimeBindings` 已提供 run 依赖预绑定入口，内部字段名已统一为 `internalRunDeps` 私有语义
- 当前进度：`public_vm_run_bridge` 内部 helper 已统一为 `internal*` 私有语义命名，降低误用概率
- 当前进度：`internalRunDeps` 已改为 `Object.freeze` 只读对象，降低运行时误改风险
- 当前进度：`createPublicRunRuntimeBindings` 返回对象已改为 `Object.freeze`，降低公共桥接形状被误改风险
- 当前进度：已抽出 `public_vm_api_bridge`（set/get/deleteGlobal + call/getNativeFn + hash 公共桥接 helper）到 `src/runtime/vm/public_vm_api_bridge.js`
- 当前进度：已抽出 `public_vm_control_bridge`（setGraphicsHost/typeChecker/safety/errorReporter/reset 公共桥接 helper）到 `src/runtime/vm/public_vm_control_bridge.js`
- 当前进度：已抽出 `public_vm_main_bridge`（按 `lifecycle/run/api/control` 分组导出），`vm.js` 顶部 public-vm 导入面已收敛为单入口
- 当前进度：`vm.js` 已改为 `publicVmMainBridge` 命名空间调用，移除大量 bridge 级解构导入噪音
- 当前进度：`public_vm_main_bridge` 增加 `lifecycle/run/api/control` 分组导出，`vm.js` 调用点已按分组命名空间收敛
- 当前进度：`public_vm_main_bridge` 新增 `initializeVmOwner/resetVmOwner` 包装，`vm.js` 构造/重置调用进一步减薄
- 当前进度：`public_vm_main_bridge` 的分组对象与根导出已改为 `Object.freeze`，降低桥接导出形状被误改风险
- 当前进度：`vm.js` 构造期固定依赖已通过 `createVmOwnerInitializer` 预绑定，构造器调用进一步收敛
- 当前进度：`public_vm_main_bridge` 新增 `createPublicVmRuntimeBindings` 组合装配入口，`vm.js` 的 run/init 预绑定收敛为单次 wiring 调用
- 当前进度：`createPublicVmRuntimeBindings` 已并入 `apiBridge/controlBridge`，`vm.js` 去除独立桥接命名空间提取
- 当前进度：`public_vm_main_bridge` 新增 `createPublicVmOwnerDelegates`，`SeedLangVM` 方法调用已收敛到 owner 级预绑定委托
- 当前进度：`public_vm_main_bridge` 新增 `wirePublicVmPrototype`，`SeedLangVM` 原型方法/访问器改为桥接层统一挂载，`vm.js` 类体收敛为构造器主干
- 当前进度：已抽出 `public_vm_owner_bridge`（owner 级 delegate 工厂 + 原型 wiring helper）到 `src/runtime/vm/public_vm_owner_bridge.js`
- 当前进度：已抽出 `public_vm_main_namespaces`（`lifecycle/run/api/control` 分组装配 + `resetVmOwner` 组合）到 `src/runtime/vm/public_vm_main_namespaces.js`
- 当前进度：已抽出 `public_vm_runtime_bindings`（`createPublicVmRuntimeBindings` 装配）到 `src/runtime/vm/public_vm_runtime_bindings.js`
- 当前进度：已抽出 `public_vm_owner_init_bridge`（`initializeVmOwner/createVmOwnerInitializer` 初始化装配）到 `src/runtime/vm/public_vm_owner_init_bridge.js`
- 当前进度：已抽出 `public_vm_owner_init_adapters`（owner-init 依赖适配包装）到 `src/runtime/vm/public_vm_owner_init_adapters.js`
- 当前进度：已抽出 `public_vm_main_bridge_deps`（main bridge 依赖对象组装）到 `src/runtime/vm/public_vm_main_bridge_deps.js`
- 当前进度：已抽出 `public_vm_main_bridge_exports`（main bridge 根导出形状组装）到 `src/runtime/vm/public_vm_main_bridge_exports.js`
- 当前进度：已移除 `SeedLangVM` 内 `_createReadOnlyGlobalsProxy/_createPublicVMFacade` 薄封装，统一走 init/reset 编排
- 当前进度：已抽出 `vm_hash`（`SeedLangVM#hash` 字符串哈希 helper）到 `src/runtime/vm/vm_hash.js`
- 当前进度：已抽出 `vm_cli_entry`（vm.js CLI 参数/读取/执行/输出入口 helper）到 `src/runtime/vm/vm_cli_entry.js`
- 当前进度：已抽出 `value_ops`（safeAddValues/normalizeNumericOperand/seedEquals/safeRepeatString + 字符串长度常量）到 `src/runtime/vm/value_ops.js`
- 当前进度：已抽出 `instance_ops`（invokeHostMethod/createSafeInstance/instantiateClassObject/isSafeArrayIndex/isPrivateInstanceKey/canAccessInstanceKey/resolveMethodStart/buildMethodLocalScope）到 `src/runtime/vm/instance_ops.js`
- 当前进度：已抽出 `closure_ops`（createRuntimeClosure/prepareCallCapturedVars/resolveCallSharedCaptured/getCallScopedCapturedMeta/resolveCallCvArr/getCallScopedCapturedNames/hasCallScopedCaptured/resolveLocalNameByIndex/refreshCapturedLocalsFromFrame）到 `src/runtime/vm/closure_ops.js`
- 当前进度：已抽出 `fast_builtin_ops`（isClassicFibFuncRef/canUseFastFib/tryFastBuiltinUnaryCall/hydrateBuiltinGlobals + NO_FAST_BUILTIN symbol）到 `src/runtime/vm/fast_builtin_ops.js`
- 当前进度：已抽出 `pattern_match_ops`（executeMatch/matchPattern/evalExpr/evalStmt/str/findLocalValue/callClosure + wirePatternMatchOps 原型挂载）到 `src/runtime/vm/pattern_match_ops.js`
- 当前进度：已抽出 `frame_ops`（_syncFrames/_syncFromFrames/_saveState/_restoreState + wireFrameOps 原型挂载）到 `src/runtime/vm/frame_ops.js`
- 当前进度：VM 类方法拆分采用"原型混入"模式（wire*Ops 函数），保持 `vm.js` 类体精简的同时不破坏现有调用语义
- 当前进度：已抽出 `jit_compiler`（_compileLeafFunction/_compileSelfRecursive/_compileWhileBody/_compileWhileCondition/_compileGlobalLoop/_compileLocalLoop + wireJitCompiler 原型挂载）到 `src/runtime/vm/jit_compiler.js`
- 当前进度：已抽出 `jit_fast_path`（_precompileLoops/_buildTinyProgramFastPath/_optimizeJitVSrc/_optimizeJitASrc/_buildJitFastPath + wireJitFastPath 原型挂载）到 `src/runtime/vm/jit_fast_path.js`
- 当前进度：已抽出 `run_fast`（runFast 优化版字节码解释器 + wireRunFast 原型挂载）到 `src/runtime/vm/run_fast.js`
- 当前进度：已抽出 `run_full`（runFull 完整字节码解释器 + wireRunFull 原型挂载）到 `src/runtime/vm/run_full.js`
- 当前进度：已抽出 `execute_op_inline`（_executeOpInline 单步执行解释器 + wireExecuteOpInline 原型挂载）到 `src/runtime/vm/execute_op_inline.js`
- 当前进度：已抽出 `run_from_ip`（runFromIp 基于 this.stack 的解释器 + wireRunFromIp 原型挂载）到 `src/runtime/vm/run_from_ip.js`
- 当前进度：`vm.js` 从 11,428 行缩减至 562 行（减少 95%），四个核心解释器（runFast/runFull/_executeOpInline/runFromIp）已全部抽出
- 当前进度：已抽出 `run_entry`（run 执行入口分发器 + wireRunEntry 原型挂载）到 `src/runtime/vm/run_entry.js`
- 当前进度：`vm.js` 从 11,428 行缩减至 371 行（减少 96.8%），Phase 2 拆分完成
- 当前进度：`vm.js` 仅保留构造器、委托方法群、`_saveCache`、`_gv`、`runAsync`、`push/pop` 等骨架代码，所有核心执行逻辑已拆至独立模块

3. Phase 3
- 抽离 `compiler` 到独立模块（保留旧路径兼容）
- 增加字节码快照回归（同输入同字节码）
- 当前进度：已建立字节码快照回归测试基础设施 `tests/bytecode-snapshot/`
- 当前进度：已创建 20 个代表性源码样本的字节码快照，覆盖算术/变量/条件/循环/函数/闭包/类/继承/模式匹配/异常等核心语义
- 当前进度：快照测试已集成到 `test-suite.js`，每次编译器变更都会自动检测字节码回归
- 当前进度：`compiler` 已在 `vm/compiler.js` 中独立存在，vm.js 仅保留导入传递

4. Phase 4
- 逐步将模块替换为 SeedLang 版本（先 builtins，再 compiler，最后 core）
- 每次替换都跑 `tests/test-suite.js` + `bench/run.js`

## 强约束

- 不允许直接新增对 `src/runtime/vm.js` 的依赖。
- 新代码统一通过 `src/runtime/vm/` 导入。
- 任何拆分都必须先保持行为一致，再追求性能。
