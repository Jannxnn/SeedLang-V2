'use strict';
// VM 内置函数总入口：聚合 core / collection / data / ai_async / graphics / io / bootstrap_wiring 所有内置模块，统一导出 createVMBuiltins

const { createCoreBuiltins } = require('./core');
const { createCollectionBuiltins } = require('./collection');
const { createDataBuiltins } = require('./data');
const { createAiAsyncBuiltins } = require('./ai_async');
const { createGraphicsBuiltins } = require('./graphics');
const { createIoBuiltins } = require('./io');
const { createRuntimeBuiltins } = require('./bootstrap_wiring');
const { createMatrixBuiltins } = require('./matrix');
const { createRegexModule } = require('./regex');
const { createMapSetBuiltins } = require('./map_set');

/**
 * Builtins/module split boundary (phase 2).
 * Keep behavior unchanged by delegating to legacy VM methods for now.
 */
function createVMBuiltins(vm) {
    return vm.initBuiltins();
}

function createVMModules(vm) {
    return vm.initModules();
}

module.exports = {
    createVMBuiltins,
    createVMModules,
    createCoreBuiltins,
    createCollectionBuiltins,
    createDataBuiltins,
    createAiAsyncBuiltins,
    createGraphicsBuiltins,
    createIoBuiltins,
    createRuntimeBuiltins,
    createMatrixBuiltins,
    createRegexModule,
    createMapSetBuiltins
};
