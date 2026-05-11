# Seed Test Mapping

This file maps major JS-driven test areas to Seed `.seed` coverage.

## Core
- `tests/core/test-comprehensive.js` -> `tests/seed/core/*.seed`
- `tests/core/test-language-spec.js` -> `tests/seed/basic/*.seed`, `tests/seed/core/*.seed`
- `tests/core/test-js-compatibility.js` -> `tests/seed/basic/*.seed`, `tests/seed/features/*.seed`

## Features
- `tests/features/test-closure.js` -> `tests/seed/basic/closure.seed`, `tests/seed/basic/closure_counter.seed`, `tests/seed/basic/closure_adder_chain.seed`, `tests/seed/basic/closure_zero_arg_direct.seed`, `tests/seed/basic/closure_zero_arg_member.seed`
- `tests/features/test-class.js` -> `tests/seed/basic/class_method.seed`, `tests/seed/basic/class_state.seed`, `tests/seed/basic/class_counter_instances.seed`
- `tests/features/test-error-handling.js` -> `tests/seed/basic/error_try_catch.seed`, `tests/seed/basic/error_finally.seed`, `tests/seed/scenarios/scn_exception_nested.seed`
- `tests/features/test-boundary.js` -> `tests/seed/basic/boundary_loop.seed`, `tests/seed/extreme/ext_deep_loop.seed`, `tests/seed/special/spec_boundary_zero.seed`
- `tests/features/test-module.js` -> `tests/seed/basic/math_module.seed`, `tests/seed/special/spec_json_roundtrip.seed`
- `tests/features/test-pattern-matching.js` -> partial analog in `tests/seed/features/*.seed` (data transform and predicate cases)

## Extreme & Performance
- `tests/extreme/test-extreme-boundaries.js` -> `tests/seed/extreme/*.seed`
- `tests/extreme/test-parser-extreme.js` -> broad syntax stress via all `tests/seed/**/*.seed`
- `tests/performance/test-stress.js` -> `tests/seed/extreme/ext_deep_loop.seed`, `tests/seed/extreme/ext_recursive_depth.seed`, `tests/seed/extreme/ext_array_growth.seed`

## Scenarios
- `tests/scenarios/test-ai-agent.js` -> `tests/seed/scenarios/scn_agent_*.seed`
- `tests/scenarios/test-enterprise.js` -> `tests/seed/scenarios/scn_batch_*.seed`, `scn_binary_search*.seed`, `scn_bubble_sort_edges.seed`, `scn_matrix_like.seed`
- `tests/scenarios/test-hell.js` -> `tests/seed/scenarios/scn_exception_nested.seed`, `scn_retry_once.seed`, `scn_guard_pattern.seed`
- `tests/scenarios/test-ultimate.js` -> composite coverage from `tests/seed/scenarios/*.seed` and `tests/seed/extreme/*.seed`

## Special
- `tests/special/test-regression.js` -> deterministic checks in `tests/seed/special/*.seed`
- `tests/special/test-fuzzing.js` -> not 1:1 mapped (fuzz harness still JS-side)
- `tests/special/test-security.js` -> partial analog in input/JSON/object checks under `tests/seed/special/*.seed`
