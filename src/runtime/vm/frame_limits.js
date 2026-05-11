'use strict';

/** Max call-frame slots; must match `_fr.*` allocation and all stack-overflow checks. */
const MAX_FRAME_DEPTH = 4096;

/** Default operand stack buffer length (`_stackBuf`); the array may still grow up to `MAX_OPERAND_STACK_SLOTS`. */
const DEFAULT_OPERAND_STACK_SIZE = 4096;

/**
 * Hard cap on operand stack usage: `sp` must stay ≤ this value; `fp` must stay &lt; this value.
 * Scales with max frame depth so deep recursion with multiple slots per frame remains valid.
 */
const MAX_OPERAND_STACK_SLOTS = MAX_FRAME_DEPTH * 8;

/**
 * Ensures `stackLength + extraSlots` and `fp` stay within operand limits.
 * @throws {RangeError} code `OPERAND_STACK_OVERFLOW`
 */
function ensureOperandHeadroom(stackLength, fp, extraSlots) {
    const extra = extraSlots | 0;
    const next = stackLength + extra;
    if (next > MAX_OPERAND_STACK_SLOTS || (fp | 0) >= MAX_OPERAND_STACK_SLOTS) {
        const err = new RangeError('operand stack overflow');
        err.code = 'OPERAND_STACK_OVERFLOW';
        throw err;
    }
}

/**
 * Caps ARRAY / OBJECT literal sizes and `range`-style array allocation to `vm._maxRangeItems`.
 * @returns {string|null} error message or null if ok
 */
function enforceAggregateCount(vm, count, kind = 'aggregate') {
    const max = vm && vm._maxRangeItems != null ? vm._maxRangeItems : 1000000;
    if (!Number.isInteger(count) || count < 0) {
        return `invalid ${kind} length`;
    }
    if (count > max) {
        return `${kind} exceeds max items (${max})`;
    }
    return null;
}

/**
 * Caps cumulative size when merging spreads (object literals): `totalSoFar + delta` ≤ `vm._maxRangeItems`.
 * @returns {string|null}
 */
function enforceAggregateMerge(vm, totalSoFar, delta, kind = 'merge') {
    const max = vm && vm._maxRangeItems != null ? vm._maxRangeItems : 1000000;
    if (!Number.isInteger(totalSoFar) || totalSoFar < 0 || !Number.isInteger(delta) || delta < 0) {
        return `invalid ${kind} size`;
    }
    const next = totalSoFar + delta;
    if (next > max) {
        return `${kind} exceeds max items (${max})`;
    }
    return null;
}

module.exports = {
    MAX_FRAME_DEPTH,
    DEFAULT_OPERAND_STACK_SIZE,
    MAX_OPERAND_STACK_SLOTS,
    ensureOperandHeadroom,
    enforceAggregateCount,
    enforceAggregateMerge
};
