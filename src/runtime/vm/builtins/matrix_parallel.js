'use strict';

const { Worker } = require('worker_threads');
const os = require('os');

const PARALLEL_THRESHOLD = 512;
const MAX_WORKERS = Math.min(os.cpus().length, 8);

let workerPool = [];
let workerPoolSize = 0;

function getWorkerPoolSize() {
    if (workerPoolSize === 0) {
        workerPoolSize = Math.min(MAX_WORKERS, os.cpus().length);
    }
    return workerPoolSize;
}

function matmulWorkerCode() {
    const { parentPort, workerData } = require('worker_threads');
    const { aFlat, bFlat, M, N, P, rowStart, rowEnd } = workerData;
    const BS = 64;
    const UNROLL = 4;
    const cFlat = new Float64Array((rowEnd - rowStart) * P);

    for (let ii = rowStart; ii < rowEnd; ii += BS) {
        const iEnd = Math.min(ii + BS, rowEnd);
        for (let jj = 0; jj < P; jj += BS) {
            const jEnd = Math.min(jj + BS, P);
            for (let kk = 0; kk < N; kk += BS) {
                const kEnd = Math.min(kk + BS, N);
                for (let i = ii; i < iEnd; i++) {
                    const aOff = i * N;
                    const cOff = (i - rowStart) * P;
                    for (let k = kk; k < kEnd; k++) {
                        const aVal = aFlat[aOff + k];
                        const bOff = k * P;
                        let j = jj;
                        const jLimit = jj + Math.floor((jEnd - jj) / UNROLL) * UNROLL;
                        for (; j < jLimit; j += UNROLL) {
                            cFlat[cOff + j]     += aVal * bFlat[bOff + j];
                            cFlat[cOff + j + 1] += aVal * bFlat[bOff + j + 1];
                            cFlat[cOff + j + 2] += aVal * bFlat[bOff + j + 2];
                            cFlat[cOff + j + 3] += aVal * bFlat[bOff + j + 3];
                        }
                        for (; j < jEnd; j++) {
                            cFlat[cOff + j] += aVal * bFlat[bOff + j];
                        }
                    }
                }
            }
        }
    }
    parentPort.postMessage({ rowStart, rowEnd, cFlat }, [cFlat.buffer]);
}

function getWorkerScript() {
    return '(' + matmulWorkerCode.toString() + ')()';
}

function dispatchToWorker(aFlat, bFlat, M, N, P, rowStart, rowEnd) {
    return new Promise((resolve) => {
        const worker = new Worker(getWorkerScript(), { eval: true, workerData: { aFlat, bFlat, M, N, P, rowStart, rowEnd } });
        worker.on('message', (msg) => {
            worker.terminate();
            resolve(msg);
        });
        worker.on('error', (err) => {
            worker.terminate();
            resolve({ rowStart, rowEnd, cFlat: new Float64Array((rowEnd - rowStart) * P), error: err.message });
        });
    });
}

async function matmulParallel(aFlat, bFlat, M, N, P, numWorkers) {
    const rowsPerWorker = Math.ceil(M / numWorkers);
    const promises = [];

    for (let w = 0; w < numWorkers; w++) {
        const rowStart = w * rowsPerWorker;
        const rowEnd = Math.min(rowStart + rowsPerWorker, M);
        if (rowStart >= M) break;
        promises.push(dispatchToWorker(aFlat, bFlat, M, N, P, rowStart, rowEnd));
    }

    const results = await Promise.all(promises);
    const cFlat = new Float64Array(M * P);
    for (const { rowStart, cFlat: partial } of results) {
        if (partial && partial.length > 0) {
            cFlat.set(partial, rowStart * P);
        }
    }
    return cFlat;
}

function shouldUseParallel(M, N, P) {
    return M >= PARALLEL_THRESHOLD && N >= PARALLEL_THRESHOLD && P >= PARALLEL_THRESHOLD;
}

module.exports = {
    matmulParallel,
    shouldUseParallel,
    getWorkerPoolSize,
    PARALLEL_THRESHOLD
};
