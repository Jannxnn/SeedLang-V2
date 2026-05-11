'use strict';

function isReturnOpcodeValue(op) {
    return op === 64 || op === 143 || op === 91 || op === 100 || op === 107 || op === 108 || op === 109 || op === 121 || op === 122 || op === 123 || op === 124 || op === 146;
}

function isComputedReturnOpcodeValue(op) {
    return op === 91 || op === 100 || op === 107 || op === 108 || op === 109 || op === 121 || op === 122 || op === 123 || op === 124 || op === 146;
}

function createReturnOpPredicates(OP) {
    const isReturnOp = (op) => op === OP.RETURN || op === OP.RETURN_SIMPLE || op === OP.RETURN_LOCAL || op === OP.RETURN_ADD_LOCALS || op === OP.RETURN_SUB_LOCALS || op === OP.RETURN_MUL_LOCALS || op === OP.RETURN_DIV_LOCALS || op === OP.RETURN_ADD_CAPTURED_LOCAL || op === OP.RETURN_SUB_CAPTURED_LOCAL || op === OP.RETURN_MUL_CAPTURED_LOCAL || op === OP.RETURN_DIV_CAPTURED_LOCAL || op === OP.ADD_RETURN;
    const isComputedReturnOp = (op) => op === OP.RETURN_LOCAL || op === OP.RETURN_ADD_LOCALS || op === OP.RETURN_SUB_LOCALS || op === OP.RETURN_MUL_LOCALS || op === OP.RETURN_DIV_LOCALS || op === OP.RETURN_ADD_CAPTURED_LOCAL || op === OP.RETURN_SUB_CAPTURED_LOCAL || op === OP.RETURN_MUL_CAPTURED_LOCAL || op === OP.RETURN_DIV_CAPTURED_LOCAL || op === OP.ADD_RETURN;
    return { isReturnOp, isComputedReturnOp };
}

module.exports = {
    isReturnOpcodeValue,
    isComputedReturnOpcodeValue,
    createReturnOpPredicates
};
