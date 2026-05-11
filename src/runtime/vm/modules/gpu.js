'use strict';

const { getGPU } = require('../gpu_backend');

function createGPUModules(vmContext, helpers) {
    const OP = helpers.OP;

    return {
        gpu: {
            init: async (args) => {
                const gpu = getGPU();
                await gpu.init();
                return {
                    available: gpu.isAvailable,
                    backend: gpu.backendName,
                    isWebGPU: gpu.isWebGPU,
                    features: gpu.features
                };
            },

            status: (args) => {
                const gpu = getGPU();
                return gpu.getStatus();
            },

            isWebGPU: (args) => {
                const gpu = getGPU();
                return gpu.isWebGPU;
            },

            createBuffer: (args) => {
                const data = args[0] || [];
                const gpu = getGPU();
                const buffer = gpu.createBuffer(data, { label: args[1], usage: args[2] });
                return { id: buffer.id, size: buffer.size, label: buffer.label };
            },

            readBuffer: async (args) => {
                const bufferId = args[0];
                const gpu = getGPU();
                return await gpu.readBuffer(bufferId);
            },

            writeBuffer: (args) => {
                const bufferId = args[0];
                const data = args[1];
                const offset = args[2] || 0;
                const gpu = getGPU();
                return gpu.writeBuffer(bufferId, data, offset);
            },

            createKernel: (args) => {
                const code = args[0] || '';
                const gpu = getGPU();
                const kernel = gpu.createKernel(code, {
                    entryPoint: args[1] || 'main',
                    workgroupSize: args[2] || [64]
                });
                return { id: kernel.id, entryPoint: kernel.entryPoint, workgroupSize: kernel.workgroupSize };
            },

            dispatch: async (args) => {
                const kernelId = args[0];
                const inputs = args[1] || {};
                const outputBufferId = args[2];
                const workgroupCount = args[3] || [1];
                const gpu = getGPU();
                return await gpu.dispatch(kernelId, inputs, outputBufferId, workgroupCount);
            },

            map: async (args) => {
                const data = args[0] || [];
                const fnCode = args[1] || 'return inputs.data[threadId]';
                const gpu = getGPU();
                return await gpu.map(data, fnCode, {
                    entryPoint: args[2] || 'main',
                    workgroupSize: args[3] || [64]
                });
            },

            destroyBuffer: (args) => {
                const bufferId = args[0];
                const gpu = getGPU();
                return gpu.destroyBuffer(bufferId);
            },

            destroy: (args) => {
                const gpu = getGPU();
                gpu.destroy();
                return true;
            }
        }
    };
}

module.exports = { createGPUModules };
