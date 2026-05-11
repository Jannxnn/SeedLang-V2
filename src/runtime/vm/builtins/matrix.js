'use strict';

const BLOCK_SIZE = 64;
const TYPEDARRAY_THRESHOLD = 128;
const BLOCK_THRESHOLD = 64;
const PARALLEL_THRESHOLD = 512;

let _parallelModule = null;

function getParallelModule() {
    if (!_parallelModule) {
        try {
            _parallelModule = require('./matrix_parallel');
        } catch (e) {
            _parallelModule = null;
        }
    }
    return _parallelModule;
}

function createMatrixBuiltins() {
    const validate2D = (a, name) => {
        if (!Array.isArray(a) || a.length === 0) {
            throw new Error(name + '() expects a non-empty 2D array');
        }
        const cols = a[0].length;
        for (let i = 0; i < a.length; i++) {
            if (!Array.isArray(a[i]) || a[i].length !== cols) {
                throw new Error(name + '() expects a rectangular 2D array');
            }
        }
        return { rows: a.length, cols };
    };

    const isTyped2D = (a) => {
        if (!a || !a.length) return false;
        return a[0] instanceof Float64Array || a[0] instanceof Float32Array;
    };

    const toFlatTyped = (a, rows, cols) => {
        const flat = new Float64Array(rows * cols);
        for (let i = 0; i < rows; i++) {
            const row = a[i];
            const off = i * cols;
            for (let j = 0; j < cols; j++) {
                flat[off + j] = row[j];
            }
        }
        return flat;
    };

    const fromFlatTyped = (flat, rows, cols) => {
        const result = new Array(rows);
        for (let i = 0; i < rows; i++) {
            const off = i * cols;
            result[i] = Float64Array.from(flat.subarray(off, off + cols));
        }
        return result;
    };

    const matmulNaive = (a, b, M, N, P) => {
        const bT = new Array(P);
        for (let j = 0; j < P; j++) {
            bT[j] = new Array(N);
            for (let k = 0; k < N; k++) {
                bT[j][k] = b[k][j];
            }
        }
        const result = new Array(M);
        for (let i = 0; i < M; i++) {
            const row = a[i];
            const outRow = new Array(P);
            for (let j = 0; j < P; j++) {
                const bCol = bT[j];
                let sum = 0;
                for (let k = 0; k < N; k++) {
                    sum += row[k] * bCol[k];
                }
                outRow[j] = sum;
            }
            result[i] = outRow;
        }
        return result;
    };

    const matmulBlocked = (a, b, M, N, P) => {
        const BS = BLOCK_SIZE;
        const bT = new Array(P);
        for (let j = 0; j < P; j++) {
            bT[j] = new Array(N);
            for (let k = 0; k < N; k++) {
                bT[j][k] = b[k][j];
            }
        }
        const result = new Array(M);
        for (let i = 0; i < M; i++) {
            result[i] = new Array(P).fill(0);
        }
        for (let ii = 0; ii < M; ii += BS) {
            const iEnd = Math.min(ii + BS, M);
            for (let jj = 0; jj < P; jj += BS) {
                const jEnd = Math.min(jj + BS, P);
                for (let kk = 0; kk < N; kk += BS) {
                    const kEnd = Math.min(kk + BS, N);
                    for (let i = ii; i < iEnd; i++) {
                        const aRow = a[i];
                        const outRow = result[i];
                        for (let k = kk; k < kEnd; k++) {
                            const aVal = aRow[k];
                            const bTRow = bT[jj + 0];
                            if (bTRow) {
                                for (let j = jj; j < jEnd; j++) {
                                    outRow[j] += aVal * bT[j][k];
                                }
                            }
                        }
                    }
                }
            }
        }
        return result;
    };

    const matmulTypedBlocked = (a, b, M, N, P) => {
        const BS = BLOCK_SIZE;
        const aFlat = toFlatTyped(a, M, N);
        const bFlat = toFlatTyped(b, N, P);
        const cFlat = new Float64Array(M * P);

        for (let ii = 0; ii < M; ii += BS) {
            const iEnd = Math.min(ii + BS, M);
            for (let jj = 0; jj < P; jj += BS) {
                const jEnd = Math.min(jj + BS, P);
                for (let kk = 0; kk < N; kk += BS) {
                    const kEnd = Math.min(kk + BS, N);
                    for (let i = ii; i < iEnd; i++) {
                        const aOff = i * N;
                        const cOff = i * P;
                        for (let k = kk; k < kEnd; k++) {
                            const aVal = aFlat[aOff + k];
                            const bOff = k * P;
                            for (let j = jj; j < jEnd; j++) {
                                cFlat[cOff + j] += aVal * bFlat[bOff + j];
                            }
                        }
                    }
                }
            }
        }
        return fromFlatTyped(cFlat, M, P);
    };

    const matmulSIMDBlocked = (a, b, M, N, P) => {
        const BS = BLOCK_SIZE;
        const aFlat = toFlatTyped(a, M, N);
        const bFlat = toFlatTyped(b, N, P);
        const cFlat = new Float64Array(M * P);
        const UNROLL = 4;

        for (let ii = 0; ii < M; ii += BS) {
            const iEnd = Math.min(ii + BS, M);
            for (let jj = 0; jj < P; jj += BS) {
                const jEnd = Math.min(jj + BS, P);
                for (let kk = 0; kk < N; kk += BS) {
                    const kEnd = Math.min(kk + BS, N);
                    for (let i = ii; i < iEnd; i++) {
                        const aOff = i * N;
                        const cOff = i * P;
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
        return fromFlatTyped(cFlat, M, P);
    };

    const selectMatmulStrategy = (M, N, P) => {
        const totalOps = M * N * P;
        if (totalOps < BLOCK_THRESHOLD * BLOCK_THRESHOLD * BLOCK_THRESHOLD) {
            return 'naive';
        }
        if (M >= PARALLEL_THRESHOLD && N >= PARALLEL_THRESHOLD && P >= PARALLEL_THRESHOLD) {
            return 'parallel';
        }
        if (M >= TYPEDARRAY_THRESHOLD || N >= TYPEDARRAY_THRESHOLD || P >= TYPEDARRAY_THRESHOLD) {
            return 'simd_blocked';
        }
        return 'blocked';
    };

    const matAddTyped = (a, b, rows, cols) => {
        const result = new Array(rows);
        for (let i = 0; i < rows; i++) {
            const outRow = new Float64Array(cols);
            const aRow = a[i];
            const bRow = b[i];
            for (let j = 0; j < cols; j++) {
                outRow[j] = aRow[j] + bRow[j];
            }
            result[i] = outRow;
        }
        return result;
    };

    const matSubTyped = (a, b, rows, cols) => {
        const result = new Array(rows);
        for (let i = 0; i < rows; i++) {
            const outRow = new Float64Array(cols);
            const aRow = a[i];
            const bRow = b[i];
            for (let j = 0; j < cols; j++) {
                outRow[j] = aRow[j] - bRow[j];
            }
            result[i] = outRow;
        }
        return result;
    };

    const matScaleTyped = (a, s, rows, cols) => {
        const result = new Array(rows);
        for (let i = 0; i < rows; i++) {
            const outRow = new Float64Array(cols);
            const aRow = a[i];
            for (let j = 0; j < cols; j++) {
                outRow[j] = aRow[j] * s;
            }
            result[i] = outRow;
        }
        return result;
    };

    const conv2DNaive = (input, kernel, inRows, inCols, kRows, kCols, padding, stride) => {
        const halfR = Math.floor(kRows / 2);
        const halfC = Math.floor(kCols / 2);
        let outRows, outCols, startR, startC;

        if (padding === 'same') {
            outRows = Math.ceil(inRows / stride);
            outCols = Math.ceil(inCols / stride);
            startR = halfR;
            startC = halfC;
        } else {
            outRows = Math.ceil((inRows - kRows + 1) / stride);
            outCols = Math.ceil((inCols - kCols + 1) / stride);
            startR = 0;
            startC = 0;
        }

        const result = new Array(outRows);
        for (let oi = 0; oi < outRows; oi++) {
            const outRow = new Array(outCols);
            const si = oi * stride;
            for (let oj = 0; oj < outCols; oj++) {
                const sj = oj * stride;
                let sum = 0;
                for (let ki = 0; ki < kRows; ki++) {
                    const ii = si + ki - startR;
                    if (ii < 0 || ii >= inRows) continue;
                    const kRow = kernel[ki];
                    const iRow = input[ii];
                    for (let kj = 0; kj < kCols; kj++) {
                        const jj = sj + kj - startC;
                        if (jj < 0 || jj >= inCols) continue;
                        sum += iRow[jj] * kRow[kj];
                    }
                }
                outRow[oj] = sum;
            }
            result[oi] = outRow;
        }
        return result;
    };

    const conv2DSeparable = (input, kRow, kCol, inRows, inCols, kLen, padding, stride) => {
        const half = Math.floor(kLen / 2);
        let outRows, outCols, startR, startC;
        if (padding === 'same') {
            outRows = Math.ceil(inRows / stride);
            outCols = Math.ceil(inCols / stride);
            startR = half;
            startC = half;
        } else {
            outRows = Math.ceil((inRows - kLen + 1) / stride);
            outCols = Math.ceil((inCols - kLen + 1) / stride);
            startR = 0;
            startC = 0;
        }

        const temp = new Array(inRows);
        for (let i = 0; i < inRows; i++) {
            const row = new Array(outCols);
            for (let oj = 0; oj < outCols; oj++) {
                const sj = oj * stride;
                let sum = 0;
                for (let ki = 0; ki < kLen; ki++) {
                    const jj = sj + ki - startC;
                    if (jj >= 0 && jj < inCols) {
                        sum += input[i][jj] * kCol[ki];
                    }
                }
                row[oj] = sum;
            }
            temp[i] = row;
        }

        const result = new Array(outRows);
        for (let oi = 0; oi < outRows; oi++) {
            const outRow = new Array(outCols);
            const si = oi * stride;
            for (let oj = 0; oj < outCols; oj++) {
                let sum = 0;
                for (let ki = 0; ki < kLen; ki++) {
                    const ii = si + ki - startR;
                    if (ii >= 0 && ii < inRows) {
                        sum += temp[ii][oj] * kRow[ki];
                    }
                }
                outRow[oj] = sum;
            }
            result[oi] = outRow;
        }
        return result;
    };

    const conv2DTyped = (input, kernel, inRows, inCols, kRows, kCols, padding, stride) => {
        const halfR = Math.floor(kRows / 2);
        const halfC = Math.floor(kCols / 2);
        let outRows, outCols, startR, startC;

        if (padding === 'same') {
            outRows = Math.ceil(inRows / stride);
            outCols = Math.ceil(inCols / stride);
            startR = halfR;
            startC = halfC;
        } else {
            outRows = Math.ceil((inRows - kRows + 1) / stride);
            outCols = Math.ceil((inCols - kCols + 1) / stride);
            startR = 0;
            startC = 0;
        }

        const inFlat = toFlatTyped(input, inRows, inCols);
        const kFlat = toFlatTyped(kernel, kRows, kCols);
        const outFlat = new Float64Array(outRows * outCols);

        for (let oi = 0; oi < outRows; oi++) {
            const si = oi * stride;
            const outOff = oi * outCols;
            for (let oj = 0; oj < outCols; oj++) {
                const sj = oj * stride;
                let sum = 0;
                for (let ki = 0; ki < kRows; ki++) {
                    const ii = si + ki - startR;
                    if (ii < 0 || ii >= inRows) continue;
                    const kOff = ki * kCols;
                    const iOff = ii * inCols;
                    for (let kj = 0; kj < kCols; kj++) {
                        const jj = sj + kj - startC;
                        if (jj < 0 || jj >= inCols) continue;
                        sum += inFlat[iOff + jj] * kFlat[kOff + kj];
                    }
                }
                outFlat[outOff + oj] = sum;
            }
        }
        return fromFlatTyped(outFlat, outRows, outCols);
    };

    const isSeparableKernel = (kernel, kRows, kCols) => {
        if (kRows !== kCols) return null;
        if (kRows < 3 || kRows > 15) return null;

        const col0 = [];
        for (let i = 0; i < kRows; i++) col0.push(kernel[i][0]);
        if (col0[0] === 0) return null;

        const rowVec = kernel[0].slice();
        for (let i = 0; i < kRows; i++) {
            for (let j = 0; j < kCols; j++) {
                const expected = rowVec[j] * col0[i];
                if (Math.abs(kernel[i][j] - expected) > 1e-10 * Math.max(1, Math.abs(kernel[i][j]))) {
                    return null;
                }
            }
        }
        return { rowVec, colVec: col0 };
    };

    const selectConvStrategy = (inRows, inCols, kRows, kCols) => {
        if (inRows >= TYPEDARRAY_THRESHOLD || inCols >= TYPEDARRAY_THRESHOLD) {
            return 'typed';
        }
        return 'naive';
    };

    return {
        matmul: (args) => {
            const a = args[0];
            const b = args[1];
            const dimA = validate2D(a, 'matmul');
            const dimB = validate2D(b, 'matmul');
            if (dimA.cols !== dimB.rows) {
                throw new Error('matmul() dimension mismatch: ' + dimA.cols + ' != ' + dimB.rows);
            }
            const M = dimA.rows;
            const N = dimA.cols;
            const P = dimB.cols;
            const strategy = selectMatmulStrategy(M, N, P);
            switch (strategy) {
                case 'naive':
                    return matmulNaive(a, b, M, N, P);
                case 'blocked':
                    return matmulBlocked(a, b, M, N, P);
                case 'simd_blocked':
                    return matmulSIMDBlocked(a, b, M, N, P);
                case 'parallel':
                    return matmulSIMDBlocked(a, b, M, N, P);
                default:
                    return matmulNaive(a, b, M, N, P);
            }
        },

        matmulParallel: async (args) => {
            const a = args[0];
            const b = args[1];
            const dimA = validate2D(a, 'matmulParallel');
            const dimB = validate2D(b, 'matmulParallel');
            if (dimA.cols !== dimB.rows) {
                throw new Error('matmulParallel() dimension mismatch: ' + dimA.cols + ' != ' + dimB.rows);
            }
            const M = dimA.rows;
            const N = dimA.cols;
            const P = dimB.cols;

            const parallel = getParallelModule();
            if (!parallel) {
                return matmulSIMDBlocked(a, b, M, N, P);
            }

            const aFlat = toFlatTyped(a, M, N);
            const bFlat = toFlatTyped(b, N, P);
            const numWorkers = parallel.getWorkerPoolSize();
            const cFlat = await parallel.matmulParallel(aFlat, bFlat, M, N, P, numWorkers);
            return fromFlatTyped(cFlat, M, P);
        },

        matAdd: (args) => {
            const a = args[0];
            const b = args[1];
            const dimA = validate2D(a, 'matAdd');
            const dimB = validate2D(b, 'matAdd');
            if (dimA.rows !== dimB.rows || dimA.cols !== dimB.cols) {
                throw new Error('matAdd() dimension mismatch');
            }
            const rows = dimA.rows;
            const cols = dimA.cols;
            if (isTyped2D(a) || isTyped2D(b) || rows >= TYPEDARRAY_THRESHOLD) {
                return matAddTyped(a, b, rows, cols);
            }
            const result = new Array(rows);
            for (let i = 0; i < rows; i++) {
                const outRow = new Array(cols);
                for (let j = 0; j < cols; j++) {
                    outRow[j] = a[i][j] + b[i][j];
                }
                result[i] = outRow;
            }
            return result;
        },

        matSub: (args) => {
            const a = args[0];
            const b = args[1];
            const dimA = validate2D(a, 'matSub');
            const dimB = validate2D(b, 'matSub');
            if (dimA.rows !== dimB.rows || dimA.cols !== dimB.cols) {
                throw new Error('matSub() dimension mismatch');
            }
            const rows = dimA.rows;
            const cols = dimA.cols;
            if (isTyped2D(a) || isTyped2D(b) || rows >= TYPEDARRAY_THRESHOLD) {
                return matSubTyped(a, b, rows, cols);
            }
            const result = new Array(rows);
            for (let i = 0; i < rows; i++) {
                const outRow = new Array(cols);
                for (let j = 0; j < cols; j++) {
                    outRow[j] = a[i][j] - b[i][j];
                }
                result[i] = outRow;
            }
            return result;
        },

        matScale: (args) => {
            const a = args[0];
            const s = args[1] ?? 1;
            const dim = validate2D(a, 'matScale');
            const rows = dim.rows;
            const cols = dim.cols;
            if (isTyped2D(a) || rows >= TYPEDARRAY_THRESHOLD) {
                return matScaleTyped(a, s, rows, cols);
            }
            const result = new Array(rows);
            for (let i = 0; i < rows; i++) {
                const outRow = new Array(cols);
                for (let j = 0; j < cols; j++) {
                    outRow[j] = a[i][j] * s;
                }
                result[i] = outRow;
            }
            return result;
        },

        matTranspose: (args) => {
            const a = args[0];
            const dim = validate2D(a, 'matTranspose');
            const rows = dim.rows;
            const cols = dim.cols;
            if (rows >= TYPEDARRAY_THRESHOLD) {
                const result = new Array(cols);
                for (let j = 0; j < cols; j++) {
                    const outRow = new Float64Array(rows);
                    for (let i = 0; i < rows; i++) {
                        outRow[i] = a[i][j];
                    }
                    result[j] = outRow;
                }
                return result;
            }
            const result = new Array(cols);
            for (let j = 0; j < cols; j++) {
                const outRow = new Array(rows);
                for (let i = 0; i < rows; i++) {
                    outRow[i] = a[i][j];
                }
                result[j] = outRow;
            }
            return result;
        },

        matZeros: (args) => {
            const rows = args[0] ?? 0;
            const cols = args[1] ?? rows;
            if (rows <= 0 || cols <= 0) {
                throw new Error('matZeros() expects positive dimensions');
            }
            if (rows >= TYPEDARRAY_THRESHOLD) {
                const result = new Array(rows);
                for (let i = 0; i < rows; i++) {
                    result[i] = new Float64Array(cols);
                }
                return result;
            }
            const result = new Array(rows);
            for (let i = 0; i < rows; i++) {
                const row = new Array(cols);
                for (let j = 0; j < cols; j++) row[j] = 0;
                result[i] = row;
            }
            return result;
        },

        matIdentity: (args) => {
            const n = args[0] ?? 0;
            if (n <= 0) {
                throw new Error('matIdentity() expects a positive dimension');
            }
            if (n >= TYPEDARRAY_THRESHOLD) {
                const result = new Array(n);
                for (let i = 0; i < n; i++) {
                    const row = new Float64Array(n);
                    row[i] = 1;
                    result[i] = row;
                }
                return result;
            }
            const result = new Array(n);
            for (let i = 0; i < n; i++) {
                const row = new Array(n);
                for (let j = 0; j < n; j++) row[j] = 0;
                row[i] = 1;
                result[i] = row;
            }
            return result;
        },

        matDet: (args) => {
            const a = args[0];
            const dim = validate2D(a, 'matDet');
            if (dim.rows !== dim.cols) {
                throw new Error('matDet() expects a square matrix');
            }
            const n = dim.rows;
            const m = new Array(n);
            for (let i = 0; i < n; i++) {
                m[i] = a[i].slice();
            }
            let det = 1;
            for (let col = 0; col < n; col++) {
                let pivotRow = -1;
                let maxVal = 0;
                for (let row = col; row < n; row++) {
                    const v = Math.abs(m[row][col]);
                    if (v > maxVal) {
                        maxVal = v;
                        pivotRow = row;
                    }
                }
                if (maxVal === 0) return 0;
                if (pivotRow !== col) {
                    const tmp = m[col];
                    m[col] = m[pivotRow];
                    m[pivotRow] = tmp;
                    det = -det;
                }
                const pivot = m[col][col];
                det *= pivot;
                for (let row = col + 1; row < n; row++) {
                    const factor = m[row][col] / pivot;
                    for (let j = col + 1; j < n; j++) {
                        m[row][j] -= factor * m[col][j];
                    }
                }
            }
            return det;
        },

        matConv2D: (args) => {
            const input = args[0];
            const kernel = args[1];
            const padding = args[2] ?? 'same';
            const stride = args[3] ?? 1;

            const dimIn = validate2D(input, 'matConv2D');
            const dimK = validate2D(kernel, 'matConv2D');

            if (padding !== 'same' && padding !== 'valid') {
                throw new Error("matConv2D() padding must be 'same' or 'valid'");
            }
            if (stride < 1) {
                throw new Error('matConv2D() stride must be >= 1');
            }

            const inRows = dimIn.rows;
            const inCols = dimIn.cols;
            const kRows = dimK.rows;
            const kCols = dimK.cols;

            const separable = isSeparableKernel(kernel, kRows, kCols);
            if (separable && kRows === kCols) {
                return conv2DSeparable(input, separable.rowVec, separable.colVec, inRows, inCols, kRows, padding, stride);
            }

            const strategy = selectConvStrategy(inRows, inCols, kRows, kCols);
            switch (strategy) {
                case 'typed':
                    return conv2DTyped(input, kernel, inRows, inCols, kRows, kCols, padding, stride);
                default:
                    return conv2DNaive(input, kernel, inRows, inCols, kRows, kCols, padding, stride);
            }
        }
    };
}

module.exports = {
    createMatrixBuiltins
};
