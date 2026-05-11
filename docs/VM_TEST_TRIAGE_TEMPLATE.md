# VM 与测试判责模板（SeedLang）

> **Note**: This is an internal testing process document.

> 目的：当「VM 可能有 bug」且「测试用例也可能写错」时，避免误判。  
> 原则：不以“测试是否通过”作为唯一真值，必须建立证据链。

以下命令均在**仓库根目录**执行（`cd` 到含 `package.json` 的目录）。

## 0. 基础信息

- 任务/问题编号：
- 日期：
- 提交人：
- 相关文件：
  - VM：`src/runtime/vm.js`（入口与骨架）、`src/runtime/vm/**`（拆分模块）
  - 场景：`tests/seed/scenarios/...`
  - 校验脚本：`tests/seed/test-seed-runner.js` / 临时 `tmp_*_probe.js`（本地探针，勿提交）

## 1. 失败现象（原始记录）

- 失败命令：
  - `node tests/seed/test-seed-runner.js`
  - `node tests/test-suite.js`
- 失败用例：
- 报错/不匹配信息（原文）：
- 首次出现版本/时间（可选）：

## 2. 规范对照（唯一真源）

- 规范文档：`docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md`
- 对应条目：
  - 条目 A：
  - 条目 B：
- 规范期望行为（可手工推导）：

> 说明：若测试期望与规范冲突，优先按规范判定。

## 3. 最小复现（MRE）

- 最小复现文件：`tmp_xxx_probe.js` / `tmp_xxx.seed`
- 最小输入：
- 预期输出（按规范）：
- 实际输出：
- 是否稳定复现（多次一致）：

## 4. 独立证据链（至少 2 条）

### 证据 1：独立运行路径对照

- 路径 A（VM）结果：
- 路径 B（独立探针/另一执行路径）结果：
- 是否一致：

### 证据 2：不变量检查

- 业务不变量列表（示例：计数范围、单调性、集合大小等）：
- 检查结果：

### 证据 3（可选）：语义等价变形测试

- 变形方式（变量重命名/等价改写/输入顺序变换）：
- 变形前结果：
- 变形后结果：
- 是否应一致：

## 5. 判责结论（必须二选一或混合）

- [ ] VM 实现错误（测试期望正确）
- [ ] 测试期望错误（VM 实现符合规范）
- [ ] 二者都有问题（分别列出）

### 判定理由（简述）

- 依据 1（规范）：
- 依据 2（MRE）：
- 依据 3（独立证据）：

## 6. 修改清单

- 改动 1：
  - 文件：
  - 变更点：
  - 风险：
- 改动 2：
  - 文件：
  - 变更点：
  - 风险：

## 7. 回归验证（必须）

- `node tests/seed/test-seed-runner.js`
  - 结果：
- `node tests/test-suite.js`
  - 结果：
- `node bench/run.js`
  - 结果：

## 8. 最终发布结论

- 是否可合入：
- 遗留风险：
- 后续观察点：

---

## 快速判定规则（抄表可用）

- 若 **规范明确 + MRE稳定 + 多证据一致**，即可判定责任方。
- 若仅有“测试失败”而无规范映射，禁止直接改 VM。
- 若仅有“VM行为变化”而无等价验证，禁止直接改测试期望。
- 涉及 VM（`src/runtime/vm.js` 或 `src/runtime/vm/**`）修改后，必须执行：
  - `node tests/test-suite.js`
  - `node bench/run.js`

可选：先跑 `docs/VM_SENTINEL_SUITE_PLAN.md` 中的 P0 `--include` 哨兵，再跑全量。
