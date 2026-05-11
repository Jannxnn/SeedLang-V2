'use strict';

function serializeFiber(coro) {
    if (!coro || coro._type !== 'coroutine') {
        return null;
    }

    const serialized = {
        _type: 'serialized_fiber',
        version: 1,
        state: coro.state,
        ip: coro.ip,
        stack: serializeStack(coro.stack),
        locals: serializeLocals(coro.locals),
        fiber: coro.fiber,
        def: serializeDef(coro.def),
        _schedulerId: coro._schedulerId,
        _priority: coro._priority,
        _name: coro._name,
        _ticks: coro._ticks
    };

    return serialized;
}

function serializeStack(stack) {
    if (!Array.isArray(stack)) return [];
    return stack.map(v => serializeValue(v));
}

function serializeLocals(locals) {
    if (!Array.isArray(locals)) return [];
    return locals.map(frame => {
        if (!frame || typeof frame !== 'object') return frame;
        const result = {};
        for (const [key, value] of Object.entries(frame)) {
            result[key] = typeof value === 'number' ? value : serializeValue(value);
        }
        return result;
    });
}

function serializeDef(def) {
    if (!def) return null;
    return {
        type: def.type,
        start: def.start,
        params: def.params || [],
        name: def.name,
        code: def.code || [],
        consts: serializeConsts(def.consts),
        vars: def.vars || [],
        localScope: def.localScope ? { ...def.localScope } : {},
        fiber: def.fiber,
        async: def.async,
        isStatic: def.isStatic
    };
}

function serializeConsts(consts) {
    if (!Array.isArray(consts)) return [];
    return consts.map((c, idx) => {
        if (idx === 0) {
            return { _type: 'self_ref' };
        }
        if (c && typeof c === 'object' && !Array.isArray(c)) {
            if (c._type === 'coroutine_def' || c.type === 'coroutine_def') {
                return serializeDef(c);
            }
            if (c._type === 'closure') {
                return {
                    _type: 'serialized_closure',
                    funcRef: serializeDef(c._funcRef || c.def),
                    capturedVars: serializeCapturedVars(c.capturedVars)
                };
            }
            try {
                JSON.stringify(c);
                return c;
            } catch {
                return { _type: 'unserializable', reason: 'circular_or_function' };
            }
        }
        return c;
    });
}

function serializeCapturedVars(cv) {
    if (!cv || typeof cv !== 'object') return {};
    if (Array.isArray(cv)) return cv.map(v => serializeValue(v));
    const result = {};
    for (const [key, value] of Object.entries(cv)) {
        result[key] = serializeValue(value);
    }
    return result;
}

function serializeValue(v) {
    if (v === null || v === undefined) return v;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(item => serializeValue(item));
    if (typeof v === 'object') {
        if (v._type === 'coroutine') {
            return { _type: 'serialized_fiber_ref', name: v._name, id: v._schedulerId };
        }
        if (v._type === 'coroutine_def' || v.type === 'coroutine_def') {
            return serializeDef(v);
        }
        if (v._type === 'closure') {
            return {
                _type: 'serialized_closure',
                funcRef: serializeDef(v._funcRef || v.def),
                capturedVars: serializeCapturedVars(v.capturedVars)
            };
        }
        try {
            JSON.stringify(v);
            return v;
        } catch {
            return { _type: 'unserializable', reason: 'circular_or_function' };
        }
    }
    return { _type: 'unserializable', reason: typeof v };
}

function deserializeFiber(data, vm) {
    if (!data || data._type !== 'serialized_fiber') return null;

    const coro = {
        _type: 'coroutine',
        state: data.state || 'suspended',
        ip: data.ip || 0,
        stack: deserializeStack(data.stack),
        locals: deserializeLocals(data.locals),
        fiber: data.fiber || false,
        def: deserializeDef(data.def, vm),
        capturedVars: [],
        sharedCaptured: null,
        _schedulerId: data._schedulerId,
        _priority: data._priority,
        _name: data._name,
        _ticks: data._ticks || 0
    };

    return coro;
}

function deserializeStack(stack) {
    if (!Array.isArray(stack)) return [];
    return stack.map(v => deserializeValue(v));
}

function deserializeLocals(locals) {
    if (!Array.isArray(locals)) return [{}];
    return locals.map(frame => {
        if (!frame || typeof frame !== 'object') return frame;
        const result = {};
        for (const [key, value] of Object.entries(frame)) {
            result[key] = typeof value === 'number' ? value : deserializeValue(value);
        }
        return result;
    });
}

function deserializeDef(data, vm) {
    if (!data) return null;

    const consts = (data.consts || []).map(c => {
        if (c && typeof c === 'object' && c._type === 'self_ref') {
            return data;
        }
        if (c && typeof c === 'object' && c._type === 'serialized_closure') {
            const funcRef = deserializeDef(c.funcRef, vm);
            return {
                _type: 'closure',
                _funcRef: funcRef,
                def: funcRef,
                capturedVars: c.capturedVars || {},
                sharedCaptured: null,
                fiber: funcRef?.fiber || false
            };
        }
        if (c && typeof c === 'object' && (c.type === 'coroutine_def' || c._type === 'serialized_def')) {
            return deserializeDef(c, vm);
        }
        return c;
    });

    if (consts.length > 0 && consts[0] === null) {
        consts[0] = data;
    }

    return {
        type: data.type || 'coroutine_def',
        start: data.start || 0,
        params: data.params || [],
        name: data.name || 'anonymous',
        code: data.code || [],
        consts,
        vars: data.vars || [],
        localScope: data.localScope || {},
        fiber: data.fiber || false,
        async: data.async || false,
        isStatic: data.isStatic || false
    };
}

function deserializeValue(v) {
    if (v === null || v === undefined) return v;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(item => deserializeValue(item));
    if (typeof v === 'object') {
        if (v._type === 'serialized_closure') {
            return {
                _type: 'closure',
                _funcRef: v.funcRef,
                def: v.funcRef,
                capturedVars: v.capturedVars || {},
                sharedCaptured: null
            };
        }
        if (v._type === 'serialized_def') {
            return deserializeDef(v);
        }
        return v;
    }
    return v;
}

function fiberToJSON(coro) {
    const serialized = serializeFiber(coro);
    if (!serialized) return null;
    try {
        return JSON.stringify(serialized);
    } catch (e) {
        return JSON.stringify({ _type: 'serialized_fiber', error: 'serialization_failed', message: e.message });
    }
}

function fiberFromJSON(json, vm) {
    try {
        const data = JSON.parse(json);
        return deserializeFiber(data, vm);
    } catch (e) {
        return null;
    }
}

module.exports = {
    serializeFiber,
    deserializeFiber,
    fiberToJSON,
    fiberFromJSON,
    serializeValue,
    deserializeValue
};
