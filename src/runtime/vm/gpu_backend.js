'use strict';

class GPUBackend {
    constructor() {
        this._backend = null;
        this._available = false;
        this._device = null;
        this._adapter = null;
        this._buffers = new Map();
        this._bufferId = 0;
        this._kernels = new Map();
        this._kernelId = 0;
        this._pipelineCache = new Map();
        this._bindGroupLayoutCache = new Map();
        this._features = [];
        this._limits = {};
    }

    async init() {
        try {
            if (typeof globalThis.navigator !== 'undefined' && globalThis.navigator.gpu) {
                const adapter = await globalThis.navigator.gpu.requestAdapter();
                if (adapter) {
                    this._adapter = adapter;
                    this._limits = adapter.limits || {};
                    this._features = adapter.features ? [...adapter.features] : [];
                    this._device = await adapter.requestDevice();
                    this._backend = 'webgpu';
                    this._available = true;
                    this._device.onuncapturederror = (e) => {
                        console.error('WebGPU uncaptured error:', e.error?.message);
                    };
                    return true;
                }
            }
            this._backend = 'fallback';
            this._available = true;
            return true;
        } catch {
            this._backend = 'fallback';
            this._available = true;
            return true;
        }
    }

    get isAvailable() { return this._available; }
    get backendName() { return this._backend || 'none'; }
    get isWebGPU() { return this._backend === 'webgpu'; }
    get features() { return this._features; }
    get limits() { return this._limits; }

    createBuffer(data, options = {}) {
        const id = ++this._bufferId;
        const size = data.length;
        const usage = options.usage || 'storage';
        const label = options.label || `buffer_${id}`;
        const buffer = {
            id,
            data: new Float64Array(data),
            size,
            usage,
            label,
            gpuBuffer: null,
            mapped: false
        };

        if (this._backend === 'webgpu' && this._device) {
            try {
                const gpuUsage = this._mapBufferUsage(usage);
                const gpuBuffer = this._device.createBuffer({
                    label,
                    size: size * Float64Array.BYTES_PER_ELEMENT,
                    usage: gpuUsage,
                    mappedAtCreation: true
                });
                const mappedRange = new Float64Array(gpuBuffer.getMappedRange());
                mappedRange.set(buffer.data);
                gpuBuffer.unmap();
                buffer.gpuBuffer = gpuBuffer;
            } catch {
                buffer.gpuBuffer = null;
            }
        }

        this._buffers.set(id, buffer);
        return buffer;
    }

    _mapBufferUsage(usage) {
        const GPUBufferUsage = (typeof globalThis.GPUBufferUsage !== 'undefined') ? globalThis.GPUBufferUsage : {
            MAP_READ: 1,
            MAP_WRITE: 2,
            COPY_SRC: 4,
            COPY_DST: 8,
            INDEX: 16,
            VERTEX: 32,
            UNIFORM: 64,
            STORAGE: 128,
            INDIRECT: 256
        };
        const usageMap = {
            'storage': GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            'uniform': GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            'read': GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            'write': GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
            'vertex': GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        };
        return usageMap[usage] || usageMap['storage'];
    }

    async readBuffer(bufferId) {
        const buffer = this._buffers.get(bufferId);
        if (!buffer) return null;

        if (this._backend === 'webgpu' && buffer.gpuBuffer) {
            try {
                return await this._readGPUBuffer(buffer);
            } catch {
                return Array.from(buffer.data);
            }
        }
        return Array.from(buffer.data);
    }

    async _readGPUBuffer(buffer) {
        const size = buffer.size * Float64Array.BYTES_PER_ELEMENT;
        const readBuffer = this._device.createBuffer({
            label: `${buffer.label}_read`,
            size,
            usage: this._mapBufferUsage('read')
        });

        const encoder = this._device.createCommandEncoder();
        encoder.copyBufferToBuffer(buffer.gpuBuffer, 0, readBuffer, 0, size);
        this._device.queue.submit([encoder.finish()]);

        await readBuffer.mapAsync(globalThis.GPUMapMode.READ);
        const data = new Float64Array(readBuffer.getMappedRange());
        const result = Array.from(data);
        readBuffer.unmap();
        readBuffer.destroy();
        buffer.data.set(data);
        return result;
    }

    writeBuffer(bufferId, data, offset = 0) {
        const buffer = this._buffers.get(bufferId);
        if (!buffer) return false;
        const src = data instanceof Float64Array ? data : new Float64Array(data);
        buffer.data.set(src, offset);

        if (this._backend === 'webgpu' && buffer.gpuBuffer) {
            try {
                this._device.queue.writeBuffer(
                    buffer.gpuBuffer,
                    offset * Float64Array.BYTES_PER_ELEMENT,
                    src
                );
            } catch {
                return false;
            }
        }
        return true;
    }

    destroyBuffer(bufferId) {
        const buffer = this._buffers.get(bufferId);
        if (!buffer) return false;
        if (buffer.gpuBuffer) {
            buffer.gpuBuffer.destroy();
        }
        return this._buffers.delete(bufferId);
    }

    createKernel(code, options = {}) {
        const id = ++this._kernelId;
        const kernel = {
            id,
            code,
            entryPoint: options.entryPoint || 'main',
            workgroupSize: options.workgroupSize || [64],
            label: options.label || `kernel_${id}`,
            pipeline: null,
            bindGroupLayout: null
        };

        if (this._backend === 'webgpu' && this._device) {
            try {
                this._compileWebGPUPipeline(kernel);
            } catch {
                kernel.pipeline = null;
                kernel.bindGroupLayout = null;
            }
        }

        this._kernels.set(id, kernel);
        return kernel;
    }

    _compileWebGPUPipeline(kernel) {
        const shaderModule = this._device.createShaderModule({
            label: `${kernel.label}_shader`,
            code: kernel.code
        });

        const bindGroupLayout = this._device.createBindGroupLayout({
            label: `${kernel.label}_layout`,
            entries: []
        });

        const pipelineLayout = this._device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        });

        const pipeline = this._device.createComputePipeline({
            label: kernel.label,
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: kernel.entryPoint
            }
        });

        kernel.pipeline = pipeline;
        kernel.bindGroupLayout = bindGroupLayout;
        kernel._shaderModule = shaderModule;
    }

    async dispatch(kernelId, inputs, outputBufferId, workgroupCount) {
        const kernel = this._kernels.get(kernelId);
        if (!kernel) return null;

        if (this._backend === 'webgpu' && this._device && kernel.pipeline) {
            return await this._dispatchWebGPU(kernel, inputs, outputBufferId, workgroupCount);
        }
        return this._dispatchFallback(kernel, inputs, outputBufferId, workgroupCount);
    }

    _dispatchFallback(kernel, inputs, outputBufferId, workgroupCount) {
        const outputBuffer = this._buffers.get(outputBufferId);
        if (!outputBuffer) return null;

        const inputData = {};
        for (const [name, bufferId] of Object.entries(inputs)) {
            const buf = this._buffers.get(bufferId);
            if (buf) inputData[name] = buf.data;
        }

        const totalThreads = (workgroupCount[0] || 1) * (kernel.workgroupSize[0] || 64);
        const output = outputBuffer.data;

        for (let i = 0; i < totalThreads && i < output.length; i++) {
            output[i] = this._executeKernelLine(kernel.code, i, inputData);
        }

        return { dispatched: totalThreads, backend: 'fallback' };
    }

    _executeKernelLine(code, threadId, inputs) {
        try {
            const fn = new Function('threadId', 'inputs', `"use strict"; ${code}`);
            return fn(threadId, inputs) || 0;
        } catch {
            return 0;
        }
    }

    async _dispatchWebGPU(kernel, inputs, outputBufferId, workgroupCount) {
        const outputBuffer = this._buffers.get(outputBufferId);
        if (!outputBuffer || !outputBuffer.gpuBuffer) {
            return this._dispatchFallback(kernel, inputs, outputBufferId, workgroupCount);
        }

        try {
            const encoder = this._device.createCommandEncoder();
            const pass = encoder.beginComputePass({
                label: `${kernel.label}_pass`
            });

            pass.setPipeline(kernel.pipeline);

            const bindGroupEntries = [];
            let bindingIdx = 0;
            for (const [name, bufferId] of Object.entries(inputs)) {
                const buf = this._buffers.get(bufferId);
                if (buf && buf.gpuBuffer) {
                    bindGroupEntries.push({
                        binding: bindingIdx++,
                        resource: { buffer: buf.gpuBuffer }
                    });
                }
            }
            bindGroupEntries.push({
                binding: bindingIdx,
                resource: { buffer: outputBuffer.gpuBuffer }
            });

            const bindGroup = this._device.createBindGroup({
                layout: kernel.bindGroupLayout,
                entries: bindGroupEntries
            });

            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(
                workgroupCount[0] || 1,
                workgroupCount[1] || 1,
                workgroupCount[2] || 1
            );
            pass.end();

            this._device.queue.submit([encoder.finish()]);

            await this._device.queue.onSubmittedWorkDone();

            const result = await this._readGPUBuffer(outputBuffer);

            return {
                dispatched: (workgroupCount[0] || 1) * (kernel.workgroupSize[0] || 64),
                backend: 'webgpu',
                result
            };
        } catch (e) {
            return this._dispatchFallback(kernel, inputs, outputBufferId, workgroupCount);
        }
    }

    async map(arr, fnCode, options = {}) {
        const data = new Float64Array(arr);
        const inputBuf = this.createBuffer(data, { label: 'map_input' });
        const outputBuf = this.createBuffer(new Float64Array(arr.length), { label: 'map_output' });

        const kernel = this.createKernel(fnCode, {
            entryPoint: options.entryPoint || 'main',
            workgroupSize: options.workgroupSize || [64]
        });

        const workgroupCount = [Math.ceil(arr.length / (kernel.workgroupSize[0] || 64))];
        const result = await this.dispatch(kernel.id, { input: inputBuf.id }, outputBuf.id, workgroupCount);

        const output = await this.readBuffer(outputBuf.id);

        this.destroyBuffer(inputBuf.id);
        this.destroyBuffer(outputBuf.id);
        this._kernels.delete(kernel.id);

        return output || [];
    }

    getStatus() {
        return {
            available: this._available,
            backend: this._backend,
            bufferCount: this._buffers.size,
            kernelCount: this._kernels.size,
            features: this._features,
            maxBufferSize: this._limits?.maxBufferSize || null,
            maxComputeWorkgroupSize: this._limits?.maxComputeWorkgroupSize || null
        };
    }

    destroy() {
        for (const [id, buffer] of this._buffers) {
            if (buffer.gpuBuffer) buffer.gpuBuffer.destroy();
        }
        this._buffers.clear();
        this._kernels.clear();
        this._pipelineCache.clear();
        this._bindGroupLayoutCache.clear();
        if (this._device) {
            this._device.destroy();
            this._device = null;
        }
        this._adapter = null;
        this._available = false;
    }
}

let _globalGPU = null;

function getGPU() {
    if (!_globalGPU) {
        _globalGPU = new GPUBackend();
    }
    return _globalGPU;
}

module.exports = { GPUBackend, getGPU };
