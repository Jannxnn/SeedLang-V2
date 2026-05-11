'use strict';
// VM 内置函数 - Map/Set 数据结构模块：提供 map/set 构造与操作函数

function createSeedMapCtor(args) {
    const entries = args[0];
    const m = { _type: 'map', _data: new Map() };
    if (Array.isArray(entries)) {
        for (const entry of entries) {
            if (Array.isArray(entry) && entry.length >= 2) {
                m._data.set(entry[0], entry[1]);
            }
        }
    }
    return m;
}

function createMapSetBuiltins(vm) {
    return {
        // `map` is ambiguous vs collection.map(arr,fn); CLC self-host uses mapNew() explicitly.
        map: createSeedMapCtor,
        mapNew: createSeedMapCtor,
        mapSet: (args) => {
            const m = args[0];
            if (!m || m._type !== 'map') throw new Error('mapSet() expects a map as first argument');
            m._data.set(args[1], args[2]);
            return m;
        },
        mapGet: (args) => {
            const m = args[0];
            if (!m || m._type !== 'map') throw new Error('mapGet() expects a map as first argument');
            const v = m._data.get(args[1]);
            return v !== undefined ? v : null;
        },
        mapHas: (args) => {
            const m = args[0];
            if (!m || m._type !== 'map') throw new Error('mapHas() expects a map as first argument');
            return m._data.has(args[1]);
        },
        mapDelete: (args) => {
            const m = args[0];
            if (!m || m._type !== 'map') throw new Error('mapDelete() expects a map as first argument');
            return m._data.delete(args[1]);
        },
        mapKeys: (args) => {
            const m = args[0];
            if (!m || m._type !== 'map') return [];
            return Array.from(m._data.keys());
        },
        mapValues: (args) => {
            const m = args[0];
            if (!m || m._type !== 'map') return [];
            return Array.from(m._data.values());
        },
        mapEntries: (args) => {
            const m = args[0];
            if (!m || m._type !== 'map') return [];
            return Array.from(m._data.entries()).map(([k, v]) => [k, v]);
        },
        mapSize: (args) => {
            const m = args[0];
            if (!m || m._type !== 'map') return 0;
            return m._data.size;
        },
        mapClear: (args) => {
            const m = args[0];
            if (!m || m._type !== 'map') throw new Error('mapClear() expects a map as first argument');
            m._data.clear();
            return m;
        },
        mapForEach: (args) => {
            const m = args[0];
            const fn = args[1];
            if (!m || m._type !== 'map') return null;
            if (!fn) return null;
            for (const [key, value] of m._data) {
                if (fn?._type === 'closure') vm._callClosure(fn, [value, key, m]);
                else if (typeof fn === 'function') fn([value, key, m]);
            }
            return null;
        },

        set: (args) => {
            const items = args[0];
            const s = { _type: 'set', _data: new Set() };
            if (Array.isArray(items)) {
                for (const item of items) s._data.add(item);
            }
            return s;
        },
        setAdd: (args) => {
            const s = args[0];
            if (!s || s._type !== 'set') throw new Error('setAdd() expects a set as first argument');
            s._data.add(args[1]);
            return s;
        },
        setHas: (args) => {
            const s = args[0];
            if (!s || s._type !== 'set') throw new Error('setHas() expects a set as first argument');
            return s._data.has(args[1]);
        },
        setDelete: (args) => {
            const s = args[0];
            if (!s || s._type !== 'set') throw new Error('setDelete() expects a set as first argument');
            return s._data.delete(args[1]);
        },
        setSize: (args) => {
            const s = args[0];
            if (!s || s._type !== 'set') return 0;
            return s._data.size;
        },
        setToArray: (args) => {
            const s = args[0];
            if (!s || s._type !== 'set') return [];
            return Array.from(s._data);
        },
        setClear: (args) => {
            const s = args[0];
            if (!s || s._type !== 'set') throw new Error('setClear() expects a set as first argument');
            s._data.clear();
            return s;
        },
        setForEach: (args) => {
            const s = args[0];
            const fn = args[1];
            if (!s || s._type !== 'set') return null;
            if (!fn) return null;
            for (const value of s._data) {
                if (fn?._type === 'closure') vm._callClosure(fn, [value, value, s]);
                else if (typeof fn === 'function') fn([value, value, s]);
            }
            return null;
        }
    };
}

module.exports = {
    createMapSetBuiltins
};
