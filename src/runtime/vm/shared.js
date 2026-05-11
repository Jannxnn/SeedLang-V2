'use strict';
// ============================================
// 共享常量与工具函数（Compiler 和 VM 都使用）
// ============================================

const OBJECT_SPREAD_MARKER = '@@seed_object_spread@@';

function _fastFibNonNegInt(n) {
    let a = 0, b = 1;
    for (let i = 0; i < n; i++) {
        const t = a + b;
        a = b;
        b = t;
    }
    return a;
}

module.exports = { OBJECT_SPREAD_MARKER, _fastFibNonNegInt };
