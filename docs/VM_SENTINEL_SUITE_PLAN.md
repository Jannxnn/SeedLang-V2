# VM 哨兵场景清单（可接 CI）

> **Note**: This is an internal testing infrastructure document. Test scenarios and commands may evolve with the codebase.

> 目标：在改动 VM（`src/runtime/vm.js` 与 `src/runtime/vm/**`）后，优先用少量高价值场景快速发现回归，再决定是否进入全量测试。

以下命令均在**仓库根目录**执行。

## 1. 使用方式（建议门禁顺序）

1. 先跑快速哨兵（本清单 §6 的 P0 `--include` 命令块）
2. 哨兵通过后跑全量：`node tests/test-suite.js`
3. 性能门禁：`node bench/run.js`

## 2. P0 哨兵（每次改 VM 必跑）

- `tests/seed/scenarios/scn_union_find.seed`  
  覆盖：闭包捕获、递归 DFS、同名变量作用域污染
- `tests/seed/scenarios/scn_graph_algorithms.seed`  
  覆盖：图遍历递归、闭包状态隔离
- `tests/seed/scenarios/scn_deep_closure_chain.seed`  
  覆盖：深层闭包链、capturedVars 读写
- `tests/seed/scenarios/scn_complex_closure_isolation.seed`  
  覆盖：闭包上下文隔离
- `tests/seed/scenarios/scn_tco_tail_call.seed`  
  覆盖：尾调用与 CALL/RETURN 路径
- `tests/seed/scenarios/scn_tco_simple.seed`  
  覆盖：递归优化稳定性
- `tests/seed/scenarios/scn_multi_class_collab.seed`  
  覆盖：类实例方法调用、对象状态
- `tests/seed/scenarios/scn_complex_class_state_flow.seed`  
  覆盖：类状态流转、方法调用边界
- `tests/seed/scenarios/scn_hell_suite_3.seed`  
  覆盖：函数边界、默认参数、多断言聚合
- `tests/seed/scenarios/scn_hell_suite_2.seed`  
  覆盖：基础语义回归集合
- `tests/seed/scenarios/scn_hell_suite_4.seed`  
  覆盖：综合边界集合
- `tests/seed/special/spec_deterministic.seed`  
  覆盖：确定性执行（抗隐藏状态污染）

## 3. P1 哨兵（改闭包/异常/对象路径时追加）

- `tests/seed/scenarios/scn_complex_nested_try_order.seed`
- `tests/seed/scenarios/scn_complex_return_finally_semantics.seed`
- `tests/seed/scenarios/scn_complex_loop_exception_consistency.seed`
- `tests/seed/scenarios/scn_complex_three_layer_rethrow.seed`
- `tests/seed/scenarios/scn_event_emitter.seed`
- `tests/seed/scenarios/scn_observer_pattern.seed`
- `tests/seed/scenarios/scn_ultimate_multi_class.seed`
- `tests/seed/special/spec_json_roundtrip.seed`
- `tests/seed/special/spec_object_keys.seed`
- `tests/seed/special/spec_boundary_zero.seed`

## 4. 风险映射（改哪块就重点看哪组）

- 改 `CALL/CALL0/CALL_SELF1/TAIL_CALL`：重点看 `tco_*`, `deep_closure_chain`, `union_find`
- 改 `GET_CAPTURED/SET_CAPTURED`：重点看 `union_find`, `graph_algorithms`, `complex_closure_isolation`
- 改 `SET_LOCAL/作用域查找`：重点看 `hell_suite_3`, `function/composition` 类场景
- 改 class/method 分支：重点看 `multi_class_collab`, `complex_class_state_flow`, `ultimate_multi_class`
- 改异常分支：重点看 `complex_*try*`, `*rethrow*`, `stress_exception_soak`

## 5. 最小执行命令（当前项目可直接用）

- 快速回归（P0 哨兵，建议至少先跑）  
  见 §6 第一段 `test-seed-runner.js --include ...`（与改 VM 的 P0 列表一致）
- Seed 场景全集（含上述哨兵）  
  `node tests/seed/test-seed-runner.js`
- 全量门禁  
  `node tests/test-suite.js`
- 性能门禁  
  `node bench/run.js`

## 6. 可复制命令块（本地/CI）

```bash
# P0 哨兵（改 VM 必跑）
node tests/seed/test-seed-runner.js --include scn_union_find.seed,scn_graph_algorithms.seed,scn_deep_closure_chain.seed,scn_complex_closure_isolation.seed,scn_tco_tail_call.seed,scn_tco_simple.seed,scn_multi_class_collab.seed,scn_complex_class_state_flow.seed,scn_hell_suite_2.seed,scn_hell_suite_3.seed,scn_hell_suite_4.seed,spec_deterministic.seed
```

```bash
# P1 哨兵（改闭包/异常/对象路径时追加）
node tests/seed/test-seed-runner.js --include scn_complex_nested_try_order.seed,scn_complex_return_finally_semantics.seed,scn_complex_loop_exception_consistency.seed,scn_complex_three_layer_rethrow.seed,scn_event_emitter.seed,scn_observer_pattern.seed,scn_ultimate_multi_class.seed,spec_json_roundtrip.seed,spec_object_keys.seed,spec_boundary_zero.seed
```

```bash
# 发布前门禁
node tests/test-suite.js
node bench/run.js
```

## 7. CI 接入建议（简单版）

- 触发条件：PR 改动包含 `src/runtime/vm.js` 或 `src/runtime/vm/**`
- 阶段 1：`test-seed-runner.js --include <P0>`（快速语义拦截）
- 阶段 2：`test-seed-runner.js --include <P1>`（按风险映射可选）
- 阶段 3：`test-suite.js` + `bench/run.js`（发布门禁）

---

说明：`tests/seed/test-seed-runner.js` 已支持 `--include`，可直接将 P0/P1 作为两个独立 CI job。
