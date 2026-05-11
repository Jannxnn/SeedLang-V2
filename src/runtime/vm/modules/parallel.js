'use strict';
const { invokeClosureWithArgs } = require('./closure_runner');

function createParallelModules(vmContext, helpers) {
    const OP = helpers.OP;
    const prepareCallCapturedVars = helpers.prepareCallCapturedVars;
    const resolveCallSharedCaptured = helpers.resolveCallSharedCaptured;
    const isReturnOp = helpers.isReturnOp;
    const isComputedReturnOp = helpers.isComputedReturnOp;

    return {
        parallel: {
            map: (args) => {
                const arr = args[0] ?? [];
                const fn = args[1];
                if (!fn) return arr;
                const results = [];
                let hasPromise = false;
                for (let idx = 0; idx < arr.length; idx++) {
                    const item = arr[idx];
                    if (fn?._type === 'closure') {
                        const returnValue = invokeClosureWithArgs(
                            vmContext,
                            fn,
                            [item, idx],
                            { OP, prepareCallCapturedVars, resolveCallSharedCaptured, isReturnOp, isComputedReturnOp },
                            { stopOnUndefined: true, errorFallback: null }
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
                if (!hasPromise) return results;
                return Promise.all(results);
            },
            filter: (args) => {
                const arr = args[0] ?? [];
                const fn = args[1];
                if (!fn) return arr;
                const predicateResults = [];
                let hasPromise = false;
                for (let idx = 0; idx < arr.length; idx++) {
                    const item = arr[idx];
                    if (fn?._type === 'closure') {
                        const returnValue = invokeClosureWithArgs(
                            vmContext,
                            fn,
                            [item, idx],
                            { OP, prepareCallCapturedVars, resolveCallSharedCaptured, isReturnOp, isComputedReturnOp },
                            { stopOnUndefined: true, errorFallback: null }
                        );
                        predicateResults.push(returnValue);
                        if (returnValue && typeof returnValue.then === 'function') hasPromise = true;
                    } else if (typeof fn === 'function') {
                        const r = fn([item, idx]);
                        predicateResults.push(r);
                        if (r && typeof r.then === 'function') hasPromise = true;
                    } else {
                        predicateResults.push(true);
                    }
                }
                if (!hasPromise) return arr.filter((_, idx) => !!predicateResults[idx]);
                return Promise.all(predicateResults).then(resolved => arr.filter((_, idx) => !!resolved[idx]));
            },
            reduce: (args) => {
                const arr = args[0] ?? [];
                let acc = args[1];
                const fn = args[2];
                const accIsFn = acc?._type === 'closure' || typeof acc === 'function';
                const fnIsFn = fn?._type === 'closure' || typeof fn === 'function';
                if (accIsFn && !fnIsFn) {
                    throw new Error('parallel.reduce expects argument order: parallel.reduce(arr init fn)');
                }
                if (!fnIsFn) return acc;
                let hasPromise = false;
                for (let i = 0; i < arr.length; i++) {
                    if (fn?._type === 'closure') {
                        acc = invokeClosureWithArgs(
                            vmContext,
                            fn,
                            [acc, arr[i], i],
                            { OP, prepareCallCapturedVars, resolveCallSharedCaptured, isReturnOp, isComputedReturnOp },
                            { stopOnUndefined: true, errorFallback: () => acc }
                        );
                    } else if (typeof fn === 'function') {
                        acc = fn([acc, arr[i], i]);
                    }
                    if (acc && typeof acc.then === 'function') {
                        hasPromise = true;
                        break;
                    }
                }
                if (!hasPromise) return acc;
                return (async () => {
                    acc = args[1];
                    for (let i = 0; i < arr.length; i++) {
                        if (fn?._type === 'closure') {
                            acc = invokeClosureWithArgs(
                                vmContext,
                                fn,
                                [acc, arr[i], i],
                                { OP, prepareCallCapturedVars, resolveCallSharedCaptured, isReturnOp, isComputedReturnOp },
                                { stopOnUndefined: true, errorFallback: () => acc }
                            );
                        } else if (typeof fn === 'function') {
                            acc = fn([acc, arr[i], i]);
                        }
                        if (acc && typeof acc.then === 'function') {
                            acc = await acc;
                        }
                    }
                    return acc;
                })();
            },
            all: async (args) => {
                const promises = args[0] ?? [];
                return Promise.all(promises);
            },
            race: async (args) => {
                const promises = args[0] ?? [];
                return Promise.race(promises);
            },
            any: async (args) => {
                const promises = args[0] ?? [];
                return Promise.any(promises);
            },
            spawn: (args) => {
                const fn = args[0];
                const fnArgs = args.slice(1);
                if (!fn) return Promise.resolve(null);
                return new Promise((resolve) => {
                    setImmediate(() => {
                        if (typeof fn === 'function') {
                            resolve(fn(fnArgs));
                        } else {
                            resolve(null);
                        }
                    });
                });
            }
        }
    };
}

module.exports = {
    createParallelModules
};
