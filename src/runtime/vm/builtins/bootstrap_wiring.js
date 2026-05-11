'use strict';
// VM 内置函数 - 运行时引导装配：将各内置模块注册到 VM 全局环境，完成启动时的依赖注入与 API 暴露

const { createCoreBuiltins } = require('./core');
const { createCollectionBuiltins } = require('./collection');
const { createDataBuiltins } = require('./data');
const { createAiAsyncBuiltins } = require('./ai_async');
const { createGraphicsBuiltins } = require('./graphics');
const { createIoBuiltins } = require('./io');
const { createMatrixBuiltins } = require('./matrix');
const { createRegexModule } = require('./regex');
const { createMapSetBuiltins } = require('./map_set');

function createRuntimeBuiltins(vmContext, deps) {
    const isInternalMetaKey = deps.isInternalMetaKey;
    const decodeSeedObjectKey = deps.decodeSeedObjectKey;
    const isDangerousObjectKey = deps.isDangerousObjectKey;

    const coreBuiltins = createCoreBuiltins();
    const collectionBuiltins = createCollectionBuiltins(vmContext, {
        isInternalMetaKey,
        decodeSeedObjectKey
    });
    const dataBuiltins = createDataBuiltins({
        isDangerousObjectKey
    });
    const matrixBuiltins = createMatrixBuiltins();
    const aiAsyncBuiltins = createAiAsyncBuiltins();
    const graphicsBuiltins = createGraphicsBuiltins(vmContext);
    const ioBuiltins = createIoBuiltins(vmContext);
    const mapSetBuiltins = createMapSetBuiltins(vmContext);

    return {
        ...ioBuiltins,
        ...graphicsBuiltins,
        ...coreBuiltins,
        ...dataBuiltins,
        ...matrixBuiltins,
        ...aiAsyncBuiltins,
        ...mapSetBuiltins,
        ...collectionBuiltins
    };
}

module.exports = {
    createRuntimeBuiltins
};
