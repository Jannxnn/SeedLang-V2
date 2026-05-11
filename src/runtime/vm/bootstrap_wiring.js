'use strict';

const {
    createSystemModules,
    createPlatformNetworkModules,
    createWebHtmlModules,
    createParallelModules,
    createConcurrencyModules,
    createCoroutineModules,
    createSchedulerModules,
    createWorkerPoolModules,
    createClusterModules,
    createGPUModules
} = require('./modules');
const { createReturnOpPredicates } = require('./return_ops');
const { createRegexModule } = require('./builtins/regex');

function createRuntimeModules(vmContext, deps) {
    const fs = deps.fs;
    const path = deps.path;
    const http = deps.http;
    const https = deps.https;
    const OP = deps.OP;
    const prepareCallCapturedVars = deps.prepareCallCapturedVars;
    const resolveCallSharedCaptured = deps.resolveCallSharedCaptured;

    const { isReturnOp, isComputedReturnOp } = createReturnOpPredicates(OP);

    const systemModules = createSystemModules(vmContext, { fs, path });
    const platformNetworkModules = createPlatformNetworkModules({ path, http, https });
    const webHtmlModules = createWebHtmlModules();
    const parallelModules = createParallelModules(vmContext, {
        OP,
        prepareCallCapturedVars,
        resolveCallSharedCaptured,
        isReturnOp,
        isComputedReturnOp
    });
    const concurrencyModules = createConcurrencyModules(vmContext, {
        OP,
        prepareCallCapturedVars,
        resolveCallSharedCaptured,
        isReturnOp,
        isComputedReturnOp
    });
    const coroutineModules = createCoroutineModules(vmContext, { OP });
    const schedulerModules = createSchedulerModules(vmContext, {
        OP,
        prepareCallCapturedVars,
        resolveCallSharedCaptured,
        isReturnOp,
        isComputedReturnOp
    });
    const workerPoolModules = createWorkerPoolModules(vmContext, { OP });
    const clusterModules = createClusterModules(vmContext, { OP });
    const gpuModules = createGPUModules(vmContext, { OP });
    const regexModule = createRegexModule();

    return {
        ...systemModules,
        math: {
            pi: Math.PI,
            e: Math.E,
            sin: (args) => Math.sin(args[0] ?? 0),
            cos: (args) => Math.cos(args[0] ?? 0),
            sqrt: (args) => Math.sqrt(args[0] ?? 0),
            pow: (args) => Math.pow(args[0] ?? 0, args[1] ?? 0),
            log: (args) => Math.log(args[0] ?? 0),
            abs: (args) => Math.abs(args[0] ?? 0),
            floor: (args) => Math.floor(args[0] ?? 0),
            ceil: (args) => Math.ceil(args[0] ?? 0),
            round: (args) => Math.round(args[0] ?? 0),
            min: (args) => Math.min(...args),
            max: (args) => Math.max(...args)
        },
        ...platformNetworkModules,
        ...webHtmlModules,
        ...parallelModules,
        ...concurrencyModules,
        ...coroutineModules,
        ...schedulerModules,
        ...workerPoolModules,
        ...clusterModules,
        ...gpuModules,
        regex: regexModule
    };
}

module.exports = {
    createRuntimeModules
};
