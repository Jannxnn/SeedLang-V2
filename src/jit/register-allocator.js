/**
 * SeedLang 寄存器分配器
 * 使用图着色算法和线性扫描算法进行寄存器分配
 */

class VirtualRegister {
    constructor(id, type = 'any') {
        this.id = id;
        this.type = type;
        this.assignedRegister = null;
        this.spilled = false;
        this.spillSlot = null;
        this.defBlock = null;
        this.useBlocks = new Set();
        this.liveRange = { start: Infinity, end: -Infinity };
    }

    extendRange(position) {
        this.liveRange.start = Math.min(this.liveRange.start, position);
        this.liveRange.end = Math.max(this.liveRange.end, position);
    }

    interferesWith(other) {
        return !(this.liveRange.end < other.liveRange.start || 
                 other.liveRange.end < this.liveRange.start);
    }
}

class PhysicalRegister {
    constructor(id, type = 'general') {
        this.id = id;
        this.type = type;
        this.allocated = new Map();
        this.freeAt = new Map();
    }

    isFreeAt(position) {
        for (const [, end] of this.freeAt) {
            if (position < end) return false;
        }
        return true;
    }

    allocate(vreg, endPosition) {
        this.allocated.set(vreg.id, vreg);
        this.freeAt.set(vreg.id, endPosition);
        vreg.assignedRegister = this;
    }

    free(vregId) {
        this.allocated.delete(vregId);
        this.freeAt.delete(vregId);
    }
}

class InterferenceGraph {
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }

    addNode(vreg) {
        if (!this.nodes.has(vreg.id)) {
            this.nodes.set(vreg.id, vreg);
            this.edges.set(vreg.id, new Set());
        }
    }

    addEdge(vreg1, vreg2) {
        this.addNode(vreg1);
        this.addNode(vreg2);

        this.edges.get(vreg1.id).add(vreg2.id);
        this.edges.get(vreg2.id).add(vreg1.id);
    }

    getNeighbors(vregId) {
        return this.edges.get(vregId) || new Set();
    }

    getDegree(vregId) {
        return this.getNeighbors(vregId).size;
    }

    removeNode(vregId) {
        const neighbors = this.getNeighbors(vregId);
        for (const neighbor of neighbors) {
            this.edges.get(neighbor)?.delete(vregId);
        }
        this.edges.delete(vregId);
        this.nodes.delete(vregId);
    }

    simplify(k) {
        const stack = [];
        let changed = true;

        while (changed) {
            changed = false;
            for (const [id, vreg] of this.nodes) {
                if (this.getDegree(id) < k) {
                    stack.push({ id, vreg, neighbors: new Set(this.getNeighbors(id)) });
                    this.removeNode(id);
                    changed = true;
                    break;
                }
            }
        }

        return stack;
    }

    canColor(stack, k) {
        return this.nodes.size === 0 || stack.length > 0;
    }
}

class LivenessAnalyzer {
    constructor() {
        this.liveIn = new Map();
        this.liveOut = new Map();
        this.def = new Map();
        this.use = new Map();
    }

    analyze(blocks) {
        for (const block of blocks) {
            this.liveIn.set(block.id, new Set());
            this.liveOut.set(block.id, new Set());
            this.def.set(block.id, new Set());
            this.use.set(block.id, new Set());

            this.analyzeBlock(block);
        }

        let changed = true;
        while (changed) {
            changed = false;
            for (const block of blocks) {
                const oldIn = new Set(this.liveIn.get(block.id));
                const oldOut = new Set(this.liveOut.get(block.id));

                this.computeLiveOut(block);
                this.computeLiveIn(block);

                if (!this.setsEqual(oldIn, this.liveIn.get(block.id)) ||
                    !this.setsEqual(oldOut, this.liveOut.get(block.id))) {
                    changed = true;
                }
            }
        }

        return {
            liveIn: this.liveIn,
            liveOut: this.liveOut,
            def: this.def,
            use: this.use
        };
    }

    analyzeBlock(block) {
        const defSet = this.def.get(block.id);
        const useSet = this.use.get(block.id);

        for (const instr of block.instructions || []) {
            if (instr.def) {
                defSet.add(instr.def);
            }
            if (instr.use) {
                for (const use of instr.use) {
                    if (!defSet.has(use)) {
                        useSet.add(use);
                    }
                }
            }
        }
    }

    computeLiveIn(block) {
        const liveIn = new Set(this.liveOut.get(block.id));
        const defSet = this.def.get(block.id);
        const useSet = this.use.get(block.id);

        for (const v of defSet) {
            liveIn.delete(v);
        }
        for (const v of useSet) {
            liveIn.add(v);
        }

        this.liveIn.set(block.id, liveIn);
    }

    computeLiveOut(block) {
        const liveOut = new Set();

        for (const succ of block.successors || []) {
            const succIn = this.liveIn.get(succ.id || succ);
            if (succIn) {
                for (const v of succIn) {
                    liveOut.add(v);
                }
            }
        }

        this.liveOut.set(block.id, liveOut);
    }

    setsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const v of a) {
            if (!b.has(v)) return false;
        }
        return true;
    }
}

class GraphColoringAllocator {
    constructor(numRegisters = 8) {
        this.numRegisters = numRegisters;
        this.registers = [];
        this.vregs = new Map();
        this.interferenceGraph = new InterferenceGraph();
        this.livenessAnalyzer = new LivenessAnalyzer();
        this.spillCost = new Map();
    }

    initRegisters() {
        this.registers = [];
        for (let i = 0; i < this.numRegisters; i++) {
            this.registers.push(new PhysicalRegister(i));
        }
    }

    allocate(blocks) {
        this.initRegisters();
        this.vregs.clear();
        this.interferenceGraph = new InterferenceGraph();
        this.spillCost.clear();

        const liveness = this.livenessAnalyzer.analyze(blocks);

        this.buildInterferenceGraph(blocks, liveness);

        this.computeSpillCost();

        const stack = this.interferenceGraph.simplify(this.numRegisters);

        const spilled = this.assignRegisters(stack);

        if (spilled.length > 0) {
            this.handleSpills(spilled, blocks);
        }

        return {
            allocation: this.getAllocation(),
            spilled: spilled,
            stats: this.getStats()
        };
    }

    buildInterferenceGraph(blocks, liveness) {
        for (const block of blocks) {
            const live = new Set(liveness.liveOut.get(block.id));

            for (let i = block.instructions.length - 1; i >= 0; i--) {
                const instr = block.instructions[i];

                if (instr.def) {
                    const vreg = this.getOrCreateVReg(instr.def);
                    vreg.defBlock = block.id;
                    vreg.extendRange(block.startPos + i);

                    for (const liveVar of live) {
                        if (liveVar !== instr.def) {
                            const other = this.getOrCreateVReg(liveVar);
                            this.interferenceGraph.addEdge(vreg, other);
                        }
                    }

                    live.delete(instr.def);
                }

                if (instr.use) {
                    for (const useVar of instr.use) {
                        const vreg = this.getOrCreateVReg(useVar);
                        vreg.useBlocks.add(block.id);
                        vreg.extendRange(block.startPos + i);
                        live.add(useVar);
                    }
                }
            }
        }
    }

    getOrCreateVReg(id) {
        if (!this.vregs.has(id)) {
            this.vregs.set(id, new VirtualRegister(id));
        }
        return this.vregs.get(id);
    }

    computeSpillCost() {
        for (const [id, vreg] of this.vregs) {
            const range = vreg.liveRange.end - vreg.liveRange.start;
            const uses = vreg.useBlocks.size + 1;
            this.spillCost.set(id, range * uses);
        }
    }

    assignRegisters(stack) {
        const spilled = [];

        while (stack.length > 0) {
            const { id, vreg, neighbors } = stack.pop();

            const usedColors = new Set();
            for (const neighborId of neighbors) {
                const neighbor = this.vregs.get(neighborId);
                if (neighbor && neighbor.assignedRegister) {
                    usedColors.add(neighbor.assignedRegister.id);
                }
            }

            let assigned = false;
            for (const reg of this.registers) {
                if (!usedColors.has(reg.id)) {
                    reg.allocate(vreg, vreg.liveRange.end);
                    assigned = true;
                    break;
                }
            }

            if (!assigned) {
                vreg.spilled = true;
                spilled.push(vreg);
            }
        }

        return spilled;
    }

    handleSpills(spilled, blocks) {
        let spillSlot = 0;

        for (const vreg of spilled) {
            vreg.spillSlot = spillSlot++;

            for (const block of blocks) {
                this.insertSpillCode(block, vreg);
            }
        }
    }

    insertSpillCode(block, vreg) {
        const newInstructions = [];

        for (const instr of block.instructions || []) {
            if (instr.def === vreg.id) {
                newInstructions.push(instr);
                newInstructions.push({
                    type: 'spill',
                    vreg: vreg.id,
                    slot: vreg.spillSlot
                });
            } else if (instr.use && instr.use.includes(vreg.id)) {
                newInstructions.push({
                    type: 'reload',
                    vreg: vreg.id,
                    slot: vreg.spillSlot
                });
                newInstructions.push(instr);
            } else {
                newInstructions.push(instr);
            }
        }

        block.instructions = newInstructions;
    }

    getAllocation() {
        const allocation = new Map();
        for (const [id, vreg] of this.vregs) {
            allocation.set(id, {
                register: vreg.assignedRegister?.id,
                spilled: vreg.spilled,
                spillSlot: vreg.spillSlot
            });
        }
        return allocation;
    }

    getStats() {
        let total = this.vregs.size;
        let inRegister = 0;
        let spilled = 0;

        for (const [, vreg] of this.vregs) {
            if (vreg.spilled) {
                spilled++;
            } else {
                inRegister++;
            }
        }

        return {
            totalVirtualRegs: total,
            inRegisters: inRegister,
            spilled: spilled,
            registerUsage: (inRegister / total * 100).toFixed(1) + '%',
            numPhysicalRegs: this.numRegisters
        };
    }
}

class LinearScanAllocator {
    constructor(numRegisters = 8) {
        this.numRegisters = numRegisters;
        this.registers = [];
        this.active = [];
        this.intervals = [];
    }

    allocate(intervals) {
        this.registers = [];
        for (let i = 0; i < this.numRegisters; i++) {
            this.registers.push({
                id: i,
                current: null,
                freeAt: -1
            });
        }

        this.active = [];
        this.intervals = intervals.sort((a, b) => a.start - b.start);

        for (const interval of this.intervals) {
            this.expireOldIntervals(interval.start);

            if (this.active.length === this.numRegisters) {
                this.spillAtInterval(interval);
            } else {
                this.allocateRegister(interval);
            }
        }

        return {
            allocation: this.getAllocation(),
            stats: this.getStats()
        };
    }

    expireOldIntervals(currentPos) {
        this.active = this.active.filter(interval => {
            if (interval.end >= currentPos) {
                return true;
            }
            
            const reg = this.registers.find(r => r.id === interval.register);
            if (reg) {
                reg.current = null;
                reg.freeAt = -1;
            }
            
            return false;
        });
    }

    allocateRegister(interval) {
        const freeReg = this.registers.find(r => r.current === null);
        
        if (freeReg) {
            interval.register = freeReg.id;
            freeReg.current = interval;
            freeReg.freeAt = interval.end;
            this.active.push(interval);
        }
    }

    spillAtInterval(interval) {
        const spill = this.active.reduce((max, curr) => 
            curr.end > max.end ? curr : max
        );

        if (spill.end > interval.end) {
            interval.register = spill.register;
            spill.register = null;
            spill.spilled = true;
            spill.spillSlot = this.allocateSpillSlot();
            
            this.active = this.active.filter(i => i !== spill);
            this.active.push(interval);
        } else {
            interval.spilled = true;
            interval.spillSlot = this.allocateSpillSlot();
        }
    }

    allocateSpillSlot() {
        return this.intervals.filter(i => i.spilled).length;
    }

    getAllocation() {
        const allocation = new Map();
        for (const interval of this.intervals) {
            allocation.set(interval.id, {
                register: interval.register,
                spilled: interval.spilled || false,
                spillSlot: interval.spillSlot
            });
        }
        return allocation;
    }

    getStats() {
        const total = this.intervals.length;
        const spilled = this.intervals.filter(i => i.spilled).length;
        const inRegister = total - spilled;

        return {
            totalIntervals: total,
            inRegisters: inRegister,
            spilled: spilled,
            registerUsage: (inRegister / total * 100).toFixed(1) + '%',
            numPhysicalRegs: this.numRegisters
        };
    }
}

class RegisterAllocator {
    constructor(options = {}) {
        this.numRegisters = options.numRegisters || 8;
        this.algorithm = options.algorithm || 'graph-coloring';
        
        this.graphColoring = new GraphColoringAllocator(this.numRegisters);
        this.linearScan = new LinearScanAllocator(this.numRegisters);
    }

    allocate(blocks, algorithm = this.algorithm) {
        if (algorithm === 'linear-scan') {
            const intervals = this.extractIntervals(blocks);
            return this.linearScan.allocate(intervals);
        }
        
        return this.graphColoring.allocate(blocks);
    }

    extractIntervals(blocks) {
        const intervals = [];
        const positions = new Map();

        for (const block of blocks) {
            const startPos = block.startPos || 0;
            
            for (let i = 0; i < (block.instructions || []).length; i++) {
                const instr = block.instructions[i];
                const pos = startPos + i;

                if (instr.def) {
                    if (!positions.has(instr.def)) {
                        positions.set(instr.def, { start: pos, end: pos });
                    } else {
                        positions.get(instr.def).end = pos;
                    }
                }

                if (instr.use) {
                    for (const use of instr.use) {
                        if (!positions.has(use)) {
                            positions.set(use, { start: pos, end: pos });
                        } else {
                            positions.get(use).end = pos;
                        }
                    }
                }
            }
        }

        let id = 0;
        for (const [name, range] of positions) {
            intervals.push({
                id: id++,
                name,
                start: range.start,
                end: range.end,
                register: null,
                spilled: false,
                spillSlot: null
            });
        }

        return intervals;
    }

    getStats() {
        return {
            graphColoring: this.graphColoring.getStats(),
            linearScan: this.linearScan.getStats()
        };
    }
}

module.exports = {
    VirtualRegister,
    PhysicalRegister,
    InterferenceGraph,
    LivenessAnalyzer,
    GraphColoringAllocator,
    LinearScanAllocator,
    RegisterAllocator
};
