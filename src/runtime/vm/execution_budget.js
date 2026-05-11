'use strict';

function createExecutionBudget(executionGuardEnabled, maxInstructions, maxExecutionMs, timeSliceSize) {
    if (!executionGuardEnabled) return null;
    return {
        remaining: maxInstructions,
        deadline: maxExecutionMs > 0 ? Date.now() + maxExecutionMs : 0,
        timeSlice: timeSliceSize
    };
}

function consumeExecutionBudget(budget, maxInstructions, maxExecutionMs, timeSliceSize) {
    if (!budget) return null;
    if (--budget.remaining < 0) {
        return `Execution limit exceeded (${maxInstructions} instructions)`;
    }
    if (--budget.timeSlice <= 0) {
        budget.timeSlice = timeSliceSize;
        if (budget.deadline > 0 && Date.now() > budget.deadline) {
            return `Execution timeout (${maxExecutionMs}ms)`;
        }
    }
    return null;
}

function consumeExecutionBudgetBatch(budget, steps, maxInstructions, maxExecutionMs, timeSliceSize) {
    if (!budget) return null;
    let remainingSteps = Number.isFinite(steps) ? Math.max(0, Math.floor(steps)) : 0;
    while (remainingSteps > 0) {
        const chunk = Math.min(remainingSteps, budget.timeSlice);
        budget.remaining -= chunk;
        budget.timeSlice -= chunk;
        if (budget.remaining < 0) {
            return `Execution limit exceeded (${maxInstructions} instructions)`;
        }
        if (budget.timeSlice <= 0) {
            budget.timeSlice = timeSliceSize;
            if (budget.deadline > 0 && Date.now() > budget.deadline) {
                return `Execution timeout (${maxExecutionMs}ms)`;
            }
        }
        remainingSteps -= chunk;
    }
    return null;
}

module.exports = {
    createExecutionBudget,
    consumeExecutionBudget,
    consumeExecutionBudgetBatch
};
