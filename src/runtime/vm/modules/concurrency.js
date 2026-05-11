'use strict';
const { invokeClosureWithArgs } = require('./closure_runner');

function createConcurrencyModules(vmContext, helpers) {
    const OP = helpers.OP;
    const prepareCallCapturedVars = helpers.prepareCallCapturedVars;
    const resolveCallSharedCaptured = helpers.resolveCallSharedCaptured;
    const isReturnOp = helpers.isReturnOp;
    const isComputedReturnOp = helpers.isComputedReturnOp;

    return {
        concurrency: {
            limit: async (args) => {
                const tasks = args[0] ?? [];
                const limit = args[1] ?? 1;
                const results = [];
                const executing = [];
                for (const task of tasks) {
                    const p = Promise.resolve(typeof task === 'function' ? task() : task);
                    results.push(p);
                    if (limit <= tasks.length) {
                        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
                        executing.push(e);
                        if (executing.length >= limit) {
                            await Promise.race(executing);
                        }
                    }
                }
                return Promise.all(results);
            },
            batch: (args) => {
                const items = args[0] ?? [];
                const fn = args[1];
                const batchSize = args[2] ?? 10;
                if (!fn) return items;
                const results = [];
                let hasPromise = false;
                for (let i = 0; i < items.length; i += batchSize) {
                    const batch = items.slice(i, i + batchSize);
                    for (let j = 0; j < batch.length; j++) {
                        const item = batch[j];
                        const idx = i + j;
                        if (fn?._type === 'closure') {
                            const returnValue = invokeClosureWithArgs(
                                vmContext,
                                fn,
                                [item, idx],
                                { OP, prepareCallCapturedVars, resolveCallSharedCaptured, isReturnOp, isComputedReturnOp },
                                { stopOnUndefined: false, errorFallback: null }
                            );
                            results.push(returnValue);
                            if (returnValue && typeof returnValue.then === 'function') hasPromise = true;
                        } else if (typeof fn === 'function') {
                            const r = fn([item, idx]);
                            results.push(r);
                            if (r && typeof r.then === 'function') hasPromise = true;
                        } else {
                            results.push(item);
                        }
                    }
                }
                if (!hasPromise) return results;
                return Promise.all(results);
            }
        }
    };
}

module.exports = {
    createConcurrencyModules
};
