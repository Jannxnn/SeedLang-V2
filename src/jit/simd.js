/**
 * SeedLang SIMD 优化器
 * 实现向量化计算和SIMD指令生成
 */

const SIMDWidth = {
    FLOAT32: 4,
    FLOAT64: 2,
    INT32: 4,
    INT64: 2,
    INT8: 16,
    INT16: 8
};

class SIMDVector {
    constructor(data, type = 'float32') {
        this.type = type;
        this.width = SIMDWidth[type.toUpperCase()] || 4;
        
        if (data instanceof Float32Array || data instanceof Float64Array ||
            data instanceof Int32Array || data instanceof Int8Array ||
            data instanceof Int16Array) {
            this.data = data;
        } else if (Array.isArray(data)) {
            this.data = this.createTypedArray(data);
        } else {
            this.data = this.createTypedArray(new Array(this.width).fill(data));
        }
    }

    createTypedArray(arr) {
        switch (this.type) {
            case 'float32': return new Float32Array(arr);
            case 'float64': return new Float64Array(arr);
            case 'int32': return new Int32Array(arr);
            case 'int8': return new Int8Array(arr);
            case 'int16': return new Int16Array(arr);
            default: return new Float32Array(arr);
        }
    }

    get(i) {
        return this.data[i];
    }

    set(i, value) {
        this.data[i] = value;
    }

    toArray() {
        return Array.from(this.data);
    }

    static splat(value, type = 'float32', width = 4) {
        return new SIMDVector(new Array(width).fill(value), type);
    }
}

class SIMDOperations {
    static add(a, b) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = a.data[i] + b.data[i];
        }
        return result;
    }

    static sub(a, b) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = a.data[i] - b.data[i];
        }
        return result;
    }

    static mul(a, b) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = a.data[i] * b.data[i];
        }
        return result;
    }

    static div(a, b) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = a.data[i] / b.data[i];
        }
        return result;
    }

    static min(a, b) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = Math.min(a.data[i], b.data[i]);
        }
        return result;
    }

    static max(a, b) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = Math.max(a.data[i], b.data[i]);
        }
        return result;
    }

    static sqrt(a) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = Math.sqrt(a.data[i]);
        }
        return result;
    }

    static abs(a) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = Math.abs(a.data[i]);
        }
        return result;
    }

    static neg(a) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = -a.data[i];
        }
        return result;
    }

    static reciprocal(a) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = 1 / a.data[i];
        }
        return result;
    }

    static dot(a, b) {
        let sum = 0;
        for (let i = 0; i < a.width; i++) {
            sum += a.data[i] * b.data[i];
        }
        return sum;
    }

    static sum(a) {
        let sum = 0;
        for (let i = 0; i < a.width; i++) {
            sum += a.data[i];
        }
        return sum;
    }

    static horizontalAdd(a) {
        return this.sum(a);
    }

    static equal(a, b) {
        const result = [];
        for (let i = 0; i < a.width; i++) {
            result.push(a.data[i] === b.data[i] ? -1 : 0);
        }
        return new SIMDVector(result, 'int32');
    }

    static lessThan(a, b) {
        const result = [];
        for (let i = 0; i < a.width; i++) {
            result.push(a.data[i] < b.data[i] ? -1 : 0);
        }
        return new SIMDVector(result, 'int32');
    }

    static greaterThan(a, b) {
        const result = [];
        for (let i = 0; i < a.width; i++) {
            result.push(a.data[i] > b.data[i] ? -1 : 0);
        }
        return new SIMDVector(result, 'int32');
    }

    static select(mask, a, b) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = mask.data[i] !== 0 ? a.data[i] : b.data[i];
        }
        return result;
    }

    static shuffle(a, indices) {
        const result = new SIMDVector(new Array(a.width), a.type);
        for (let i = 0; i < a.width; i++) {
            result.data[i] = a.data[indices[i] % a.width];
        }
        return result;
    }

    static swizzle(a, pattern) {
        return this.shuffle(a, pattern);
    }

    static load(array, offset = 0, type = 'float32') {
        const width = SIMDWidth[type.toUpperCase()] || 4;
        const data = [];
        for (let i = 0; i < width; i++) {
            data.push(array[offset + i] || 0);
        }
        return new SIMDVector(data, type);
    }

    static store(vec, array, offset = 0) {
        for (let i = 0; i < vec.width; i++) {
            array[offset + i] = vec.data[i];
        }
    }

    static loadInterleaved(array, offset, stride, type = 'float32') {
        const width = SIMDWidth[type.toUpperCase()] || 4;
        const vectors = [];
        for (let c = 0; c < stride; c++) {
            const data = [];
            for (let i = 0; i < width; i++) {
                data.push(array[offset + i * stride + c] || 0);
            }
            vectors.push(new SIMDVector(data, type));
        }
        return vectors;
    }

    static storeInterleaved(vectors, array, offset, stride) {
        const width = vectors[0].width;
        for (let i = 0; i < width; i++) {
            for (let c = 0; c < stride; c++) {
                array[offset + i * stride + c] = vectors[c].data[i];
            }
        }
    }
}

class SIMDVectorizer {
    constructor() {
        this.vectorizableOps = new Set(['+', '-', '*', '/', 'min', 'max', 'abs', 'sqrt']);
        this.stats = {
            loopsVectorized: 0,
            opsVectorized: 0,
            speedupEstimate: 1
        };
    }

    analyze(ast) {
        const opportunities = [];
        
        this.findVectorizationOpportunities(ast, opportunities);

        return {
            canVectorize: opportunities.length > 0,
            opportunities,
            stats: this.stats
        };
    }

    findVectorizationOpportunities(node, opportunities, context = {}) {
        if (!node || typeof node !== 'object') return;

        if (node.type === 'ForStmt' || node.type === 'WhileStmt') {
            const loopAnalysis = this.analyzeLoop(node);
            if (loopAnalysis.canVectorize) {
                opportunities.push({
                    type: 'loop',
                    node,
                    ...loopAnalysis
                });
            }
        }

        if (node.type === 'BinaryExpr' && this.vectorizableOps.has(node.operator)) {
            const opAnalysis = this.analyzeOperation(node, context);
            if (opAnalysis.canVectorize) {
                opportunities.push({
                    type: 'operation',
                    node,
                    ...opAnalysis
                });
            }
        }

        for (const value of Object.values(node)) {
            if (typeof value === 'object') {
                this.findVectorizationOpportunities(value, opportunities, context);
            }
        }
    }

    analyzeLoop(loop) {
        const body = loop.body || [];
        const operations = [];

        this.collectOperations(body, operations);

        const arrayOps = operations.filter(op => 
            op.type === 'BinaryExpr' && 
            this.isArrayOperation(op)
        );

        const canVectorize = arrayOps.length > 0 && 
                             !this.hasLoopCarriedDependency(loop, arrayOps);

        return {
            canVectorize,
            operations: arrayOps,
            dependency: !canVectorize,
            estimatedSpeedup: canVectorize ? SIMDWidth.FLOAT32 : 1
        };
    }

    analyzeOperation(node, context) {
        return {
            canVectorize: this.isArrayOperation(node),
            operator: node.operator,
            needsMask: false
        };
    }

    collectOperations(node, operations) {
        if (!node || typeof node !== 'object') return;

        if (Array.isArray(node)) {
            node.forEach(n => this.collectOperations(n, operations));
            return;
        }

        if (node.type === 'BinaryExpr') {
            operations.push(node);
        }

        for (const value of Object.values(node)) {
            if (typeof value === 'object') {
                this.collectOperations(value, operations);
            }
        }
    }

    isArrayOperation(node) {
        if (!node || node.type !== 'BinaryExpr') return false;

        const hasArrayAccess = (n) => {
            if (!n) return false;
            if (n.type === 'MemberExpr' || n.type === 'IndexExpr') {
                return true;
            }
            if (n.left && hasArrayAccess(n.left)) return true;
            if (n.right && hasArrayAccess(n.right)) return true;
            return false;
        };

        return hasArrayAccess(node.left) || hasArrayAccess(node.right);
    }

    hasLoopCarriedDependency(loop, operations) {
        return false;
    }

    vectorize(ast) {
        const analysis = this.analyze(ast);

        if (!analysis.canVectorize) {
            return { ast, vectorized: false };
        }

        const vectorizedAst = this.transform(ast, analysis.opportunities);

        this.stats.loopsVectorized = analysis.opportunities.filter(o => o.type === 'loop').length;
        this.stats.opsVectorized = analysis.opportunities.filter(o => o.type === 'operation').length;
        this.stats.speedupEstimate = Math.max(...analysis.opportunities.map(o => o.estimatedSpeedup || 1));

        return {
            ast: vectorizedAst,
            vectorized: true,
            stats: this.stats
        };
    }

    transform(node, opportunities) {
        if (!node || typeof node !== 'object') return node;

        const opportunity = opportunities.find(o => o.node === node);
        if (opportunity) {
            return this.vectorizeNode(node, opportunity);
        }

        const result = { ...node };
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === 'object' && value !== null) {
                result[key] = this.transform(value, opportunities);
            }
        }

        return result;
    }

    vectorizeNode(node, opportunity) {
        if (opportunity.type === 'loop') {
            return this.vectorizeLoop(node, opportunity);
        }

        if (opportunity.type === 'operation') {
            return this.vectorizeOperation(node, opportunity);
        }

        return node;
    }

    vectorizeLoop(loop, analysis) {
        const vectorWidth = SIMDWidth.FLOAT32;
        
        return {
            type: 'SIMDLoopStmt',
            original: loop,
            vectorWidth,
            body: this.vectorizeLoopBody(loop.body, vectorWidth),
            remainder: this.generateRemainderLoop(loop, vectorWidth),
            simd: true
        };
    }

    vectorizeLoopBody(body, width) {
        return {
            type: 'SIMDBlock',
            width,
            operations: this.extractSIMDOperations(body),
            simd: true
        };
    }

    extractSIMDOperations(body) {
        const ops = [];
        this.collectOperations(body, ops);
        return ops.map(op => ({
            type: 'SIMDOp',
            operator: op.operator,
            left: this.toSIMDOperand(op.left),
            right: this.toSIMDOperand(op.right),
            simd: true
        }));
    }

    toSIMDOperand(node) {
        if (!node) return null;

        if (node.type === 'MemberExpr' || node.type === 'IndexExpr') {
            return {
                type: 'SIMDLoad',
                array: node.object || node.array,
                index: node.property || node.index,
                simd: true
            };
        }

        return node;
    }

    generateRemainderLoop(loop, width) {
        return {
            type: 'ForStmt',
            init: loop.init,
            test: loop.test,
            update: loop.update,
            body: loop.body,
            remainder: true,
            vectorWidth: width
        };
    }

    vectorizeOperation(node, analysis) {
        return {
            type: 'SIMDOp',
            operator: node.operator,
            left: this.toSIMDOperand(node.left),
            right: this.toSIMDOperand(node.right),
            simd: true
        };
    }

    getStats() {
        return this.stats;
    }
}

class SIMDCodeGenerator {
    constructor() {
        this.supportedTypes = new Set(['float32', 'float64', 'int32', 'int8', 'int16']);
    }

    generateSIMDCode(simdNode) {
        if (!simdNode || !simdNode.simd) {
            return this.generateScalarCode(simdNode);
        }

        switch (simdNode.type) {
            case 'SIMDLoopStmt':
                return this.generateSIMDLoop(simdNode);
            case 'SIMDOp':
                return this.generateSIMDOp(simdNode);
            case 'SIMDLoad':
                return this.generateSIMDLoad(simdNode);
            case 'SIMDBlock':
                return this.generateSIMDBlock(simdNode);
            default:
                return this.generateScalarCode(simdNode);
        }
    }

    generateSIMDLoop(node) {
        const width = node.vectorWidth;
        const varName = node.original.init?.name || 'i';
        const limit = this.extractLimit(node.original.test);

        return `
            const _simdWidth = ${width};
            const _simdLimit = Math.floor(${limit} / _simdWidth) * _simdWidth;
            
            for (let ${varName} = 0; ${varName} < _simdLimit; ${varName} += _simdWidth) {
                ${this.generateSIMDCode(node.body)}
            }
            
            ${this.generateSIMDCode(node.remainder)}
        `;
    }

    generateSIMDOp(node) {
        const op = node.operator;
        const left = this.generateSIMDCode(node.left);
        const right = this.generateSIMDCode(node.right);

        const simdFunc = {
            '+': 'SIMDOperations.add',
            '-': 'SIMDOperations.sub',
            '*': 'SIMDOperations.mul',
            '/': 'SIMDOperations.div',
            'min': 'SIMDOperations.min',
            'max': 'SIMDOperations.max'
        }[op] || 'SIMDOperations.add';

        return `${simdFunc}(${left}, ${right})`;
    }

    generateSIMDLoad(node) {
        const array = node.array?.name || 'arr';
        const index = this.generateSIMDCode(node.index);

        return `SIMDOperations.load(${array}, ${index})`;
    }

    generateSIMDBlock(node) {
        return node.operations.map(op => this.generateSIMDCode(op)).join(';\n');
    }

    generateScalarCode(node) {
        if (!node) return '';
        
        if (node.type === 'BinaryExpr') {
            const left = this.generateScalarCode(node.left);
            const right = this.generateScalarCode(node.right);
            return `(${left} ${node.operator} ${right})`;
        }

        if (node.type === 'Identifier') {
            return node.name;
        }

        if (node.type === 'Literal') {
            return String(node.value);
        }

        return '';
    }

    extractLimit(test) {
        if (!test) return 'n';
        if (test.right && test.right.value !== undefined) {
            return test.right.value;
        }
        if (test.right && test.right.name) {
            return test.right.name;
        }
        return 'n';
    }
}

class SIMDArrayOps {
    static map(array, fn, width = 4) {
        const result = new Array(array.length);
        const simdWidth = width;
        const limit = Math.floor(array.length / simdWidth) * simdWidth;

        for (let i = 0; i < limit; i += simdWidth) {
            const vec = SIMDOperations.load(array, i);
            const resultVec = fn(vec, i);
            SIMDOperations.store(resultVec, result, i);
        }

        for (let i = limit; i < array.length; i++) {
            result[i] = fn(SIMDVector.splat(array[i]), i).get(0);
        }

        return result;
    }

    static reduce(array, fn, initial, width = 4) {
        const simdWidth = width;
        const limit = Math.floor(array.length / simdWidth) * simdWidth;
        
        let acc = SIMDVector.splat(initial);
        
        for (let i = 0; i < limit; i += simdWidth) {
            const vec = SIMDOperations.load(array, i);
            acc = fn(acc, vec, i);
        }

        let result = SIMDOperations.horizontalAdd(acc);
        
        for (let i = limit; i < array.length; i++) {
            result = fn(result, array[i], i);
        }

        return result;
    }

    static filter(array, predicate, width = 4) {
        const result = [];
        const simdWidth = width;
        const limit = Math.floor(array.length / simdWidth) * simdWidth;

        for (let i = 0; i < limit; i += simdWidth) {
            const vec = SIMDOperations.load(array, i);
            const mask = predicate(vec, i);
            
            for (let j = 0; j < simdWidth; j++) {
                if (mask.get(j) !== 0) {
                    result.push(array[i + j]);
                }
            }
        }

        for (let i = limit; i < array.length; i++) {
            if (predicate(SIMDVector.splat(array[i]), i).get(0) !== 0) {
                result.push(array[i]);
            }
        }

        return result;
    }

    static zipWith(arrays, fn, width = 4) {
        const length = Math.min(...arrays.map(a => a.length));
        const result = new Array(length);
        const simdWidth = width;
        const limit = Math.floor(length / simdWidth) * simdWidth;

        for (let i = 0; i < limit; i += simdWidth) {
            const vecs = arrays.map(arr => SIMDOperations.load(arr, i));
            const resultVec = fn(vecs, i);
            SIMDOperations.store(resultVec, result, i);
        }

        for (let i = limit; i < length; i++) {
            const vals = arrays.map(arr => arr[i]);
            result[i] = fn(vals.map(v => SIMDVector.splat(v)), i).get(0);
        }

        return result;
    }

    static dotProduct(a, b, width = 4) {
        const simdWidth = width;
        const limit = Math.floor(a.length / simdWidth) * simdWidth;
        
        let sum = SIMDVector.splat(0);
        
        for (let i = 0; i < limit; i += simdWidth) {
            const va = SIMDOperations.load(a, i);
            const vb = SIMDOperations.load(b, i);
            const prod = SIMDOperations.mul(va, vb);
            sum = SIMDOperations.add(sum, prod);
        }

        let result = SIMDOperations.horizontalAdd(sum);
        
        for (let i = limit; i < a.length; i++) {
            result += a[i] * b[i];
        }

        return result;
    }

    static convolve(signal, kernel, width = 4) {
        const result = new Array(signal.length);
        const kernelLen = kernel.length;
        const halfKernel = Math.floor(kernelLen / 2);

        for (let i = 0; i < signal.length; i++) {
            let sum = 0;
            for (let j = 0; j < kernelLen; j++) {
                const idx = i + j - halfKernel;
                if (idx >= 0 && idx < signal.length) {
                    sum += signal[idx] * kernel[j];
                }
            }
            result[i] = sum;
        }

        return result;
    }
}

class MatrixOperationRecognizer {
    constructor() {
        this.matrixOps = new Set(['matmul', 'matAdd', 'matSub', 'matScale', 'matTranspose', 'matDet', 'matZeros', 'matIdentity', 'matConv2D']);
        this.stats = {
            matrixOpsRecognized: 0,
            matmulOptimized: 0,
            elementWiseOptimized: 0,
            convOptimized: 0
        };
    }

    analyze(ast) {
        const opportunities = [];
        this.findMatrixPatterns(ast, opportunities);
        return {
            hasMatrixOps: opportunities.length > 0,
            opportunities,
            stats: this.stats
        };
    }

    findMatrixPatterns(node, opportunities, context = {}) {
        if (!node || typeof node !== 'object') return;

        if (node.type === 'CallExpr' || node.type === 'Call') {
            const funcName = this.getFuncName(node);
            if (funcName && this.matrixOps.has(funcName)) {
                opportunities.push({
                    type: 'matrix_builtin',
                    operation: funcName,
                    node,
                    args: node.arguments || node.args || []
                });
                this.stats.matrixOpsRecognized++;
            }
        }

        if (node.type === 'ForStmt' || node.type === 'ForStatement') {
            const tripleNested = this.detectTripleNestedMatmul(node);
            if (tripleNested) {
                opportunities.push({
                    type: 'matmul_pattern',
                    operation: 'matmul',
                    node,
                    ...tripleNested
                });
                this.stats.matmulOptimized++;
            }
        }

        if (node.type === 'ForStmt' || node.type === 'ForStatement') {
            const elementWise = this.detectElementWiseLoop(node);
            if (elementWise) {
                opportunities.push({
                    type: 'elementwise_pattern',
                    operation: elementWise.operation,
                    node,
                    ...elementWise
                });
                this.stats.elementWiseOptimized++;
            }
        }

        if (node.type === 'ForStmt' || node.type === 'ForStatement') {
            const convPattern = this.detectConv2DPattern(node);
            if (convPattern) {
                opportunities.push({
                    type: 'conv2d_pattern',
                    operation: 'matConv2D',
                    node,
                    ...convPattern
                });
                this.stats.convOptimized++;
            }
        }

        for (const value of Object.values(node)) {
            if (typeof value === 'object' && value !== null) {
                this.findMatrixPatterns(value, opportunities, context);
            }
        }
    }

    getFuncName(callNode) {
        if (callNode.callee) {
            if (callNode.callee.name) return callNode.callee.name;
            if (callNode.callee.type === 'Identifier') return callNode.callee.name;
        }
        if (callNode.fn) {
            if (typeof callNode.fn === 'string') return callNode.fn;
            if (callNode.fn.name) return callNode.fn.name;
        }
        return null;
    }

    detectTripleNestedMatmul(outerLoop) {
        const body = outerLoop.body;
        if (!body) return null;

        const nestedLoops = this.collectNestedLoops(outerLoop, 3);
        if (nestedLoops.length < 3) return null;

        const [loop1, loop2, loop3] = nestedLoops;
        const innerBody = loop3.body || loop3;

        const hasArrayIndex = this.hasTwoDArrayIndexing(innerBody);
        const hasMultiplyAccumulate = this.hasMultiplyAccumulate(innerBody);

        if (hasArrayIndex && hasMultiplyAccumulate) {
            return {
                outerVar: this.getLoopVar(loop1),
                middleVar: this.getLoopVar(loop2),
                innerVar: this.getLoopVar(loop3),
                confidence: hasMultiplyAccumulate === 'exact' ? 'high' : 'medium'
            };
        }

        return null;
    }

    collectNestedLoops(node, depth) {
        if (depth <= 0) return [];
        if (!node) return [];

        const result = [node];
        const body = node.body;

        if (body) {
            const innerLoop = this.findFirstLoop(body);
            if (innerLoop) {
                result.push(...this.collectNestedLoops(innerLoop, depth - 1));
            }
        }

        return result;
    }

    findFirstLoop(node) {
        if (!node || typeof node !== 'object') return null;

        if (node.type === 'ForStmt' || node.type === 'ForStatement' || node.type === 'WhileStmt') {
            return node;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                const found = this.findFirstLoop(child);
                if (found) return found;
            }
            return null;
        }

        for (const value of Object.values(node)) {
            if (typeof value === 'object' && value !== null) {
                const found = this.findFirstLoop(value);
                if (found) return found;
            }
        }

        return null;
    }

    getLoopVar(loopNode) {
        if (!loopNode) return null;
        const init = loopNode.init;
        if (init) {
            if (init.name) return init.name;
            if (init.left && init.left.name) return init.left.name;
            if (typeof init === 'object') {
                for (const val of Object.values(init)) {
                    if (val && val.type === 'Identifier' && val.name) return val.name;
                }
            }
        }
        return 'i';
    }

    hasTwoDArrayIndexing(node) {
        if (!node || typeof node !== 'object') return false;

        if ((node.type === 'IndexExpr' || node.type === 'MemberExpr') && node.object) {
            const obj = node.object;
            if (obj.type === 'IndexExpr' || obj.type === 'MemberExpr') {
                return true;
            }
        }

        for (const value of Object.values(node)) {
            if (typeof value === 'object' && value !== null) {
                if (this.hasTwoDArrayIndexing(value)) return true;
            }
        }

        return false;
    }

    hasMultiplyAccumulate(node) {
        if (!node || typeof node !== 'object') return false;

        if (node.type === 'BinaryExpr' || node.type === 'AssignmentExpression' || node.type === 'AssignExpr') {
            const op = node.operator || node.op;
            if (op === '+=' || op === '+') {
                const left = node.left;
                const right = node.right;
                if (right && (right.type === 'BinaryExpr' || right.type === 'binary')) {
                    const rOp = right.operator || right.op;
                    if (rOp === '*') return 'exact';
                }
            }
        }

        for (const value of Object.values(node)) {
            if (typeof value === 'object' && value !== null) {
                const result = this.hasMultiplyAccumulate(value);
                if (result) return result;
            }
        }

        return false;
    }

    detectElementWiseLoop(loopNode) {
        const body = loopNode.body;
        if (!body) return null;

        const hasIndexAccess = this.hasTwoDArrayIndexing(body);
        if (!hasIndexAccess) return null;

        const ops = this.detectElementWiseOp(body);
        if (ops) return ops;

        return null;
    }

    detectElementWiseOp(node) {
        if (!node || typeof node !== 'object') return null;

        if (node.type === 'BinaryExpr' || node.type === 'binary') {
            const op = node.operator || node.op;
            if (op === '+') return { operation: 'matAdd' };
            if (op === '-') return { operation: 'matSub' };
            if (op === '*') {
                const hasScalar = this.hasScalarOperand(node);
                if (hasScalar) return { operation: 'matScale' };
            }
        }

        for (const value of Object.values(node)) {
            if (typeof value === 'object' && value !== null) {
                const result = this.detectElementWiseOp(value);
                if (result) return result;
            }
        }

        return null;
    }

    hasScalarOperand(node) {
        if (!node) return false;
        const left = node.left;
        const right = node.right;
        if (left && left.type === 'number' && left.value !== undefined) return true;
        if (right && right.type === 'number' && right.value !== undefined) return true;
        if (left && left.type === 'Literal' && typeof left.value === 'number') return true;
        if (right && right.type === 'Literal' && typeof right.value === 'number') return true;
        return false;
    }

    detectConv2DPattern(outerLoop) {
        const body = outerLoop.body;
        if (!body) return null;

        const nestedLoops = this.collectNestedLoops(outerLoop, 4);
        if (nestedLoops.length < 4) return null;

        const [loopI, loopOj, loopKi, loopKj] = nestedLoops;
        const innerBody = loopKj.body || loopKj;

        const has2DIndex = this.hasTwoDArrayIndexing(innerBody);
        const hasMAC = this.hasMultiplyAccumulate(innerBody);

        if (has2DIndex && hasMAC) {
            return {
                outerVar: this.getLoopVar(loopI),
                middleVar: this.getLoopVar(loopOj),
                kernelRowVar: this.getLoopVar(loopKi),
                kernelColVar: this.getLoopVar(loopKj),
                confidence: hasMAC === 'exact' ? 'high' : 'medium'
            };
        }

        return null;
    }

    vectorize(ast) {
        const analysis = this.analyze(ast);
        if (!analysis.hasMatrixOps) {
            return { ast, vectorized: false };
        }

        const vectorizedAst = this.transform(ast, analysis.opportunities);
        return {
            ast: vectorizedAst,
            vectorized: true,
            stats: this.stats
        };
    }

    transform(node, opportunities) {
        if (!node || typeof node !== 'object') return node;

        const opportunity = opportunities.find(o => o.node === node);
        if (opportunity) {
            return this.vectorizeMatrixOp(node, opportunity);
        }

        const result = Array.isArray(node) ? [...node] : { ...node };
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === 'object' && value !== null) {
                result[key] = this.transform(value, opportunities);
            }
        }

        return result;
    }

    vectorizeMatrixOp(node, opportunity) {
        if (opportunity.type === 'matmul_pattern') {
            return {
                type: 'MatrixMulSIMD',
                original: node,
                strategy: 'blocked_simd',
                operation: 'matmul',
                simd: true,
                matrix: true
            };
        }

        if (opportunity.type === 'elementwise_pattern') {
            return {
                type: 'MatrixElementWiseSIMD',
                original: node,
                operation: opportunity.operation,
                strategy: 'vectorized',
                simd: true,
                matrix: true
            };
        }

        if (opportunity.type === 'matrix_builtin') {
            return {
                type: 'MatrixBuiltinCall',
                original: node,
                operation: opportunity.operation,
                optimized: true,
                matrix: true
            };
        }

        if (opportunity.type === 'conv2d_pattern') {
            return {
                type: 'MatrixConv2DSIMD',
                original: node,
                operation: 'matConv2D',
                strategy: 'separable_typed',
                simd: true,
                matrix: true
            };
        }

        return node;
    }

    getStats() {
        return this.stats;
    }
}

module.exports = {
    SIMDWidth,
    SIMDVector,
    SIMDOperations,
    SIMDVectorizer,
    SIMDCodeGenerator,
    SIMDArrayOps,
    MatrixOperationRecognizer
};
