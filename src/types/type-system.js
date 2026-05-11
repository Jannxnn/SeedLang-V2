/**
 * SeedLang 类型系统
 * 支持可选类型注解，编译时类型检查，运行时类型验证
 */

class TypeSystem {
    constructor() {
        this.types = new Map();
        this.typeAliases = new Map();
        this.errors = [];
        this.warnings = [];
        this.genericConstraints = new Map();
        this.inferenceCache = new Map();
        
        this.initializeBuiltinTypes();
        this.initializeGenericConstraints();
    }
    
    initializeBuiltinTypes() {
        this.types.set('number', { name: 'number', primitive: true });
        this.types.set('string', { name: 'string', primitive: true });
        this.types.set('boolean', { name: 'boolean', primitive: true });
        this.types.set('null', { name: 'null', primitive: true });
        this.types.set('void', { name: 'void', primitive: true });
        this.types.set('any', { name: 'any', primitive: true, any: true });
        this.types.set('never', { name: 'never', primitive: true });
        
        this.types.set('Array', { name: 'Array', generic: true, params: ['T'] });
        this.types.set('Map', { name: 'Map', generic: true, params: ['K', 'V'] });
        this.types.set('Set', { name: 'Set', generic: true, params: ['T'] });
        this.types.set('Result', { name: 'Result', generic: true, params: ['T', 'E'] });
        this.types.set('Option', { name: 'Option', generic: true, params: ['T'] });
        this.types.set('Promise', { name: 'Promise', generic: true, params: ['T'] });
        this.types.set('Tuple', { name: 'Tuple', generic: true, params: ['...T'] });
        this.types.set('Record', { name: 'Record', generic: true, params: ['K', 'V'] });
        this.types.set('Partial', { name: 'Partial', generic: true, params: ['T'] });
        this.types.set('Readonly', { name: 'Readonly', generic: true, params: ['T'] });
        this.types.set('NonNullable', { name: 'NonNullable', generic: true, params: ['T'] });
    }
    
    initializeGenericConstraints() {
        this.genericConstraints.set('Array', {
            params: {
                T: { extends: null, default: 'any' }
            }
        });
        
        this.genericConstraints.set('Map', {
            params: {
                K: { extends: 'string | number | symbol', default: 'string' },
                V: { extends: null, default: 'any' }
            }
        });
        
        this.genericConstraints.set('Set', {
            params: {
                T: { extends: null, default: 'any' }
            }
        });
        
        this.genericConstraints.set('Promise', {
            params: {
                T: { extends: null, default: 'any' }
            }
        });
        
        this.genericConstraints.set('Result', {
            params: {
                T: { extends: null, default: 'any' },
                E: { extends: 'Error', default: 'Error' }
            }
        });
        
        this.genericConstraints.set('NonNullable', {
            params: {
                T: { extends: null, default: 'any', exclude: ['null', 'undefined'] }
            }
        });
    }
    
    addGenericConstraint(typeName, constraints) {
        this.genericConstraints.set(typeName, constraints);
    }
    
    validateGenericArgs(typeName, typeArgs) {
        const constraints = this.genericConstraints.get(typeName);
        if (!constraints) return { valid: true };
        
        const typeDef = this.types.get(typeName);
        if (!typeDef || !typeDef.generic) return { valid: true };
        
        const errors = [];
        const params = typeDef.params || [];
        
        for (let i = 0; i < params.length; i++) {
            const paramName = params[i];
            const constraint = constraints.params?.[paramName];
            const argType = typeArgs[i];
            
            if (!argType) {
                if (constraint?.default) {
                    typeArgs[i] = this.parseType(constraint.default);
                }
                continue;
            }
            
            if (constraint?.extends) {
                const extendsType = this.parseType(constraint.extends);
                if (!this.isAssignable(extendsType, argType)) {
                    errors.push({
                        param: paramName,
                        message: `Type argument '${this.typeToString(argType)}' does not extend '${this.typeToString(extendsType)}'`
                    });
                }
            }
            
            if (constraint?.exclude) {
                for (const excluded of constraint.exclude) {
                    if (argType.name === excluded) {
                        errors.push({
                            param: paramName,
                            message: `Type argument cannot be '${excluded}'`
                        });
                    }
                }
            }
        }
        
        return { valid: errors.length === 0, errors };
    }
    
    inferWithGenerics(node, env = {}, typeParams = []) {
        const cacheKey = JSON.stringify({ node, env, typeParams });
        if (this.inferenceCache.has(cacheKey)) {
            return this.inferenceCache.get(cacheKey);
        }
        
        const result = this._inferWithGenericsImpl(node, env, typeParams);
        this.inferenceCache.set(cacheKey, result);
        return result;
    }
    
    _inferWithGenericsImpl(node, env, typeParams) {
        if (!node) return { name: 'any' };
        
        switch (node.type) {
            case 'number':
            case 'NumberLiteral':
                return { name: 'number', primitive: true, inferred: true };
                
            case 'string':
            case 'StringLiteral':
                return { name: 'string', primitive: true, inferred: true };
                
            case 'boolean':
            case 'BooleanLiteral':
                return { name: 'boolean', primitive: true, inferred: true };
                
            case 'null':
            case 'NullLiteral':
                return { name: 'null', primitive: true, inferred: true };
                
            case 'id':
            case 'identifier':
            case 'Identifier':
                if (typeParams.includes(node.name)) {
                    return { name: node.name, typeParam: true };
                }
                return env[node.name] || { name: 'any' };
                
            case 'array':
            case 'ArrayLiteral':
                return this.inferArrayType(node, env, typeParams);
                
            case 'object':
            case 'ObjectLiteral':
                return this.inferObjectType(node, env, typeParams);
                
            case 'binary':
            case 'BinaryOp':
                return this.inferBinaryOp(node, env, typeParams);
                
            case 'unary':
            case 'UnaryOp':
                return this.inferUnaryOp(node, env, typeParams);
                
            case 'call':
            case 'Call':
                return this.inferCallWithGenerics(node, env, typeParams);
                
            case 'member':
            case 'MemberAccess':
                return this.inferMemberAccess(node, env, typeParams);
                
            case 'arrow':
            case 'ArrowFunction':
                return this.inferArrowFunction(node, env, typeParams);
                
            case 'conditional':
            case 'ConditionalExpression':
                return this.inferConditional(node, env, typeParams);
                
            default:
                return { name: 'any' };
        }
    }
    
    inferArrayType(node, env, typeParams) {
        if (!node.elements || node.elements.length === 0) {
            return { name: 'Array', typeArgs: [{ name: 'never' }] };
        }
        
        const elementTypes = node.elements.map(el => this.inferWithGenerics(el, env, typeParams));
        const unifiedType = this.unifyTypes(elementTypes);
        
        return { name: 'Array', typeArgs: [unifiedType] };
    }
    
    inferObjectType(node, env, typeParams) {
        const properties = {};
        
        if (node.properties) {
            for (const prop of node.properties) {
                const key = prop.key?.name || prop.key;
                const valueType = this.inferWithGenerics(prop.value, env, typeParams);
                properties[key] = {
                    type: valueType,
                    optional: prop.optional || false,
                    readonly: prop.readonly || false
                };
            }
        }
        
        return { name: 'object', properties, inferred: true };
    }
    
    inferCallWithGenerics(node, env, typeParams) {
        const calleeType = this.inferWithGenerics(node.callee, env, typeParams);
        
        if (calleeType.name === 'function') {
            if (calleeType.typeParams) {
                const inferredTypeArgs = this.inferTypeArgsFromCall(calleeType, node.args, env, typeParams);
                return this.applyGenericFunction(calleeType, inferredTypeArgs);
            }
            return calleeType.returnType || { name: 'any' };
        }
        
        return { name: 'any' };
    }
    
    inferTypeArgsFromCall(funcType, args, env, typeParams) {
        const inferred = {};
        
        if (!funcType.typeParams || !args) return inferred;
        
        for (let i = 0; i < args.length && i < funcType.params.length; i++) {
            const paramType = funcType.params[i].type;
            const argType = this.inferWithGenerics(args[i], env, typeParams);
            
            this.collectTypeParams(paramType, argType, inferred);
        }
        
        return inferred;
    }
    
    collectTypeParams(paramType, argType, inferred) {
        if (paramType.typeParam) {
            if (!inferred[paramType.name]) {
                inferred[paramType.name] = argType;
            } else {
                inferred[paramType.name] = this.unifyTypes([inferred[paramType.name], argType]);
            }
            return;
        }
        
        if (paramType.name === 'Array' && argType.name === 'Array') {
            this.collectTypeParams(paramType.typeArgs?.[0], argType.typeArgs?.[0], inferred);
        }
        
        if (paramType.name === 'object' && argType.name === 'object') {
            for (const [key, prop] of Object.entries(paramType.properties || {})) {
                if (argType.properties?.[key]) {
                    this.collectTypeParams(prop.type, argType.properties[key].type, inferred);
                }
            }
        }
    }
    
    applyGenericFunction(funcType, typeArgs) {
        let returnType = funcType.returnType;
        
        for (const [param, arg] of Object.entries(typeArgs)) {
            returnType = this.substituteTypeParam(returnType, param, arg);
        }
        
        return returnType || { name: 'any' };
    }
    
    substituteTypeParam(type, paramName, replacement) {
        if (!type) return type;
        
        if (type.typeParam && type.name === paramName) {
            return replacement;
        }
        
        if (type.typeArgs) {
            return {
                ...type,
                typeArgs: type.typeArgs.map(arg => this.substituteTypeParam(arg, paramName, replacement))
            };
        }
        
        if (type.properties) {
            const newProps = {};
            for (const [key, prop] of Object.entries(type.properties)) {
                newProps[key] = {
                    ...prop,
                    type: this.substituteTypeParam(prop.type, paramName, replacement)
                };
            }
            return { ...type, properties: newProps };
        }
        
        if (type.types) {
            return {
                ...type,
                types: type.types.map(t => this.substituteTypeParam(t, paramName, replacement))
            };
        }
        
        return type;
    }
    
    inferArrowFunction(node, env, typeParams) {
        const paramTypes = [];
        const newEnv = { ...env };
        
        if (node.params) {
            for (const param of node.params) {
                let paramType = { name: 'any' };
                
                if (param.type) {
                    paramType = this.parseType(param.type);
                }
                
                paramTypes.push({ name: param.name, type: paramType });
                newEnv[param.name] = paramType;
            }
        }
        
        const returnType = node.body ? this.inferWithGenerics(node.body, newEnv, typeParams) : { name: 'void' };
        
        return {
            name: 'function',
            params: paramTypes,
            returnType,
            inferred: true
        };
    }
    
    inferConditional(node, env, typeParams) {
        const consequentType = this.inferWithGenerics(node.consequent, env, typeParams);
        const alternateType = this.inferWithGenerics(node.alternate, env, typeParams);
        
        return this.unifyTypes([consequentType, alternateType]);
    }
    
    unifyTypes(types) {
        if (!types || types.length === 0) return { name: 'never' };
        if (types.length === 1) return types[0];
        
        const uniqueTypes = [];
        const seen = new Set();
        
        for (const type of types) {
            const key = this.typeToString(type);
            if (!seen.has(key)) {
                seen.add(key);
                uniqueTypes.push(type);
            }
        }
        
        if (uniqueTypes.length === 1) return uniqueTypes[0];
        
        const allSame = uniqueTypes.every(t => t.name === uniqueTypes[0].name);
        if (allSame && uniqueTypes[0].primitive) {
            return uniqueTypes[0];
        }
        
        return { name: 'union', types: uniqueTypes, inferred: true };
    }
    
    inferMemberAccess(node, env, typeParams) {
        const objectType = this.inferWithGenerics(node.object, env, typeParams);
        
        if (objectType.name === 'Array' && objectType.typeArgs) {
            if (node.property?.name === 'length') {
                return { name: 'number', primitive: true };
            }
            return objectType.typeArgs[0];
        }
        
        if (objectType.name === 'object' && objectType.properties) {
            const propName = node.property?.name || node.property;
            const prop = objectType.properties[propName];
            if (prop) {
                return prop.type;
            }
        }
        
        if (objectType.name === 'string') {
            if (node.property?.name === 'length') {
                return { name: 'number', primitive: true };
            }
            return { name: 'string', primitive: true };
        }
        
        return { name: 'any' };
    }
    
    parseType(typeStr) {
        if (!typeStr) return { name: 'any' };
        
        // 支持对象格式的类型节点
        if (typeof typeStr === 'object') {
            if (typeStr.kind === 'primitive') {
                return { name: typeStr.name, primitive: true };
            }
            if (typeStr.kind === 'array') {
                return { name: 'Array', typeArgs: [this.parseType(typeStr.elementType)] };
            }
            if (typeStr.kind === 'union') {
                return { name: 'union', types: (typeStr.types || []).map(t => this.parseType(t)) };
            }
            if (typeStr.kind === 'function') {
                return {
                    name: 'function',
                    params: (typeStr.paramTypes || []).map(t => this.parseType(t)),
                    returnType: this.parseType(typeStr.returnType)
                };
            }
            if (typeStr.name) {
                return { name: typeStr.name };
            }
            return { name: 'any' };
        }
        
        typeStr = typeStr.trim();
        
        if (typeStr.endsWith('[]')) {
            const elementType = this.parseType(typeStr.slice(0, -2));
            return { name: 'Array', typeArgs: [elementType] };
        }
        
        if (typeStr.includes('<') && typeStr.endsWith('>')) {
            const baseName = typeStr.slice(0, typeStr.indexOf('<'));
            const paramsStr = typeStr.slice(typeStr.indexOf('<') + 1, -1);
            const typeArgs = this.parseTypeParams(paramsStr);
            return { name: baseName, typeArgs };
        }
        
        if (typeStr.includes('|')) {
            const types = this.splitUnionTypes(typeStr);
            if (types.length > 1) {
                return { name: 'union', types: types.map(t => this.parseType(t.trim())) };
            }
        }
        
        if (typeStr.includes('&')) {
            const types = typeStr.split('&').map(t => this.parseType(t.trim()));
            return { name: 'intersection', types };
        }
        
        if (typeStr === 'number' || typeStr === 'string' || typeStr === 'boolean' || 
            typeStr === 'null' || typeStr === 'any' || typeStr === 'void' || typeStr === 'never') {
            return { name: typeStr, primitive: true };
        }
        
        if (typeStr.startsWith("'") && typeStr.endsWith("'")) {
            return { name: 'literal', value: typeStr.slice(1, -1) };
        }
        
        if (/^-?\d+(\.\d+)?$/.test(typeStr)) {
            return { name: 'literal', value: parseFloat(typeStr) };
        }
        
        if (typeStr.startsWith('(') && typeStr.includes(') =>')) {
            return this.parseFunctionType(typeStr);
        }
        
        return { name: typeStr };
    }
    
    splitUnionTypes(typeStr) {
        const types = [];
        let depth = 0;
        let current = '';
        for (const char of typeStr) {
            if (char === '<') depth++;
            if (char === '>') depth--;
            if (char === '|' && depth === 0) {
                types.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) {
            types.push(current);
        }
        return types;
    }
    
    parseTypeParams(paramsStr) {
        const params = [];
        let depth = 0;
        let current = '';
        
        for (const char of paramsStr) {
            if (char === '<') depth++;
            if (char === '>') depth--;
            if (char === ',' && depth === 0) {
                params.push(this.parseType(current.trim()));
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            params.push(this.parseType(current.trim()));
        }
        
        return params;
    }
    
    parseFunctionType(typeStr) {
        const arrowIndex = typeStr.indexOf(') =>');
        const paramsStr = typeStr.slice(1, arrowIndex);
        const returnTypeStr = typeStr.slice(arrowIndex + 4).trim();
        
        const params = paramsStr ? paramsStr.split(',').map(p => {
            const [name, type] = p.trim().split(':').map(s => s.trim());
            return { name, type: this.parseType(type) };
        }) : [];
        
        return {
            name: 'function',
            params,
            returnType: this.parseType(returnTypeStr)
        };
    }
    
    isAssignable(target, source) {
        if (!target || !source) return true;
        
        if (target.name === 'any' || source.name === 'any') return true;
        
        if (target.name === 'never') return false;
        
        if (target.name === source.name && target.primitive && source.primitive) {
            return true;
        }
        
        if (target.name === 'literal' && source.name === 'literal') {
            return target.value === source.value;
        }
        
        if (target.name === 'literal') {
            if (typeof target.value === 'string' && source.name === 'string') return true;
            if (typeof target.value === 'number' && source.name === 'number') return true;
            if (typeof target.value === 'boolean' && source.name === 'boolean') return true;
            return false;
        }
        
        if (target.name === 'union') {
            return target.types.some(t => this.isAssignable(t, source));
        }
        
        if (source.name === 'union') {
            return source.types.every(t => this.isAssignable(target, t));
        }
        
        if (target.name === 'Array' && source.name === 'Array') {
            if (!target.typeArgs || !source.typeArgs) return true;
            return this.isAssignable(target.typeArgs[0], source.typeArgs[0]);
        }
        
        if (target.name === 'function' && source.name === 'function') {
            if (target.params.length !== source.params.length) return false;
            
            for (let i = 0; i < target.params.length; i++) {
                if (!this.isAssignable(source.params[i].type, target.params[i].type)) {
                    return false;
                }
            }
            
            return this.isAssignable(target.returnType, source.returnType);
        }
        
        return target.name === source.name;
    }
    
    inferValueType(value) {
        if (value === null) return { kind: 'primitive', name: 'null' };
        if (value === undefined) return { kind: 'primitive', name: 'undefined' };
        
        const type = typeof value;
        
        if (type === 'number') return { kind: 'primitive', name: 'number' };
        if (type === 'string') return { kind: 'primitive', name: 'string' };
        if (type === 'boolean') return { kind: 'primitive', name: 'boolean' };
        
        if (Array.isArray(value)) {
            const elementTypes = new Set(value.map(v => this.inferValueType(v).name));
            return {
                kind: 'array',
                elementType: elementTypes.size === 1 ? Array.from(elementTypes)[0] : 'any'
            };
        }
        
        if (type === 'object') {
            const properties = {};
            for (const [key, val] of Object.entries(value)) {
                properties[key] = this.inferValueType(val);
            }
            return { kind: 'object', properties };
        }
        
        if (type === 'function') {
            return { kind: 'function' };
        }
        
        return { kind: 'primitive', name: 'any' };
    }
    
    checkType(value, expectedType) {
        const actualType = this.inferValueType(value);
        
        if (expectedType.name === 'any' || expectedType.kind === 'primitive' && expectedType.name === 'any') {
            return { valid: true };
        }
        
        if (expectedType.kind === 'primitive') {
            if (actualType.name === expectedType.name) {
                return { valid: true };
            }
            
            return {
                valid: false,
                error: `Type mismatch: expected ${expectedType.name}, got ${actualType.name}`
            };
        }
        
        if (expectedType.kind === 'array') {
            if (actualType.kind !== 'array') {
                return {
                    valid: false,
                    error: `Type mismatch: expected array, got ${actualType.name}`
                };
            }
            
            return { valid: true };
        }
        
        if (expectedType.kind === 'object') {
            if (actualType.kind !== 'object') {
                return {
                    valid: false,
                    error: `Type mismatch: expected object, got ${actualType.name}`
                };
            }
            
            return { valid: true };
        }
        
        if (expectedType.kind === 'interface') {
            if (actualType.kind !== 'object') {
                return {
                    valid: false,
                    error: `Type mismatch: interface ${expectedType.name} requires object type, got ${actualType.name}`
                };
            }
            
            const interfaceDef = expectedType.definition;
            if (interfaceDef && interfaceDef.properties) {
                for (const [propName, propType] of interfaceDef.properties) {
                    if (!(propName in value)) {
                        return {
                            valid: false,
                            error: `Interface ${expectedType.name} missing property: ${propName}`
                        };
                    }
                }
            }
            
            return { valid: true };
        }
        
        return { valid: true };
    }
    
    defineInterface(name, properties) {
        if (!this.interfaces) {
            this.interfaces = new Map();
        }
        this.interfaces.set(name, {
            name,
            properties: new Map(Object.entries(properties)),
            methods: new Map()
        });
    }
    
    defineTypeAlias(name, definition) {
        this.typeAliases.set(name, definition);
    }
    
    resolveType(typeName) {
        const builtinTypes = new Set([
            'number', 'string', 'boolean', 'null', 'undefined',
            'any', 'void', 'never', 'object', 'array', 'function'
        ]);
        
        if (builtinTypes.has(typeName)) {
            return { kind: 'primitive', name: typeName };
        }
        
        if (this.interfaces && this.interfaces.has(typeName)) {
            return { kind: 'interface', name: typeName, definition: this.interfaces.get(typeName) };
        }
        
        if (this.typeAliases.has(typeName)) {
            return this.typeAliases.get(typeName);
        }
        
        return null;
    }
    
    parseTypeAnnotation(annotation) {
        if (typeof annotation === 'string') {
            return this.resolveType(annotation);
        }
        
        if (annotation.type === 'array') {
            return {
                kind: 'array',
                elementType: this.parseTypeAnnotation(annotation.elementType)
            };
        }
        
        if (annotation.type === 'object') {
            const properties = {};
            for (const [key, value] of Object.entries(annotation.properties)) {
                properties[key] = this.parseTypeAnnotation(value);
            }
            return { kind: 'object', properties };
        }
        
        if (annotation.type === 'function') {
            return {
                kind: 'function',
                params: annotation.params.map(p => this.parseTypeAnnotation(p)),
                returnType: this.parseTypeAnnotation(annotation.returnType)
            };
        }
        
        if (annotation.type === 'union') {
            return {
                kind: 'union',
                types: annotation.types.map(t => this.parseTypeAnnotation(t))
            };
        }
        
        return null;
    }
    
    isCompatible(sourceType, targetType) {
        if (targetType.name === 'any' || targetType.kind === 'primitive' && targetType.name === 'any') return true;
        if (sourceType.name === 'any' || sourceType.kind === 'primitive' && sourceType.name === 'any') return true;
        
        if (sourceType.kind === 'primitive' && targetType.kind === 'primitive') {
            return sourceType.name === targetType.name;
        }
        
        if (sourceType.kind === 'array' && targetType.kind === 'array') {
            return this.isCompatible(sourceType.elementType, targetType.elementType);
        }
        
        return false;
    }
    
    getBuiltinTypes() {
        return Array.from(this.types.keys());
    }
    
    getDefinedInterfaces() {
        return this.interfaces ? Array.from(this.interfaces.keys()) : [];
    }
    
    getTypeAliases() {
        return Array.from(this.typeAliases.keys());
    }
    
    inferType(node, env = {}) {
        if (!node) return { name: 'any' };
        
        if (typeof node !== 'object' || node === null || !node.type) {
            return this.inferValueType(node);
        }
        
        switch (node.type) {
            case 'number':
            case 'NumberLiteral':
                return { name: 'number', primitive: true };
                
            case 'string':
            case 'StringLiteral':
                return { name: 'string', primitive: true };
                
            case 'boolean':
            case 'BooleanLiteral':
                return { name: 'boolean', primitive: true };
                
            case 'null':
            case 'NullLiteral':
                return { name: 'null', primitive: true };
                
            case 'id':
            case 'identifier':
            case 'Identifier':
                return env[node.name] || { name: 'any' };
                
            case 'array':
            case 'ArrayLiteral':
                if (!node.elements || node.elements.length === 0) {
                    return { name: 'Array', typeArgs: [{ name: 'any' }] };
                }
                const elementType = this.inferType(node.elements[0], env);
                return { name: 'Array', typeArgs: [elementType] };
                
            case 'object':
            case 'ObjectLiteral':
                return { name: 'object', properties: {} };
                
            case 'binary':
            case 'BinaryOp':
                return this.inferBinaryOp(node, env);
                
            case 'unary':
            case 'UnaryOp':
                return this.inferUnaryOp(node, env);
                
            case 'call':
            case 'Call':
                return this.inferCall(node, env);
                
            case 'member':
            case 'MemberAccess':
                return this.inferMemberAccess(node, env);
                
            default:
                return { name: 'any' };
        }
    }
    
    inferBinaryOp(node, env) {
        const leftType = this.inferType(node.left, env);
        const rightType = this.inferType(node.right, env);
        
        switch (node.op || node.operator) {
            case '+':
                if (leftType.name === 'string' || rightType.name === 'string') {
                    return { name: 'string', primitive: true };
                }
                return { name: 'number', primitive: true };
                
            case '-':
            case '*':
            case '/':
            case '%':
            case '**':
                return { name: 'number', primitive: true };
                
            case '<':
            case '>':
            case '<=':
            case '>=':
            case '==':
            case '!=':
            case '===':
            case '!==':
                return { name: 'boolean', primitive: true };
                
            case 'and':
            case '&&':
            case 'or':
            case '||':
                return { name: 'boolean', primitive: true };
                
            default:
                return { name: 'any' };
        }
    }
    
    inferUnaryOp(node, env) {
        const operandType = this.inferType(node.operand, env);
        
        switch (node.op || node.operator) {
            case '-':
            case '+':
                return { name: 'number', primitive: true };
                
            case 'not':
            case '!':
                return { name: 'boolean', primitive: true };
                
            default:
                return { name: 'any' };
        }
    }
    
    inferCall(node, env) {
        const calleeType = this.inferType(node.callee, env);
        
        if (calleeType.name === 'function' && calleeType.returnType) {
            return calleeType.returnType;
        }
        
        return { name: 'any' };
    }
    
    inferMemberAccess(node, env) {
        const objectType = this.inferType(node.object, env);
        
        if (objectType.name === 'Array' && objectType.typeArgs) {
            return objectType.typeArgs[0];
        }
        
        return { name: 'any' };
    }
    
    addError(message, line, column, suggestion = '') {
        this.errors.push({ message, line, column, suggestion });
    }
    
    addWarning(message, line, column) {
        this.warnings.push({ message, line, column });
    }
    
    getErrors() {
        return this.errors;
    }
    
    getWarnings() {
        return this.warnings;
    }
    
    clearErrors() {
        this.errors = [];
        this.warnings = [];
    }
    
    formatTypeError(error, source) {
        const lines = source.split('\n');
        const errorLine = lines[error.line - 1] || '';
        const pointer = ' '.repeat(error.column - 1) + '^';
        
        let msg = `\nType Error: ${error.message}\n\n`;
        msg += `   ${error.line} | ${errorLine}\n`;
        msg += `     | ${pointer}\n`;
        if (error.suggestion) {
            msg += `\nHint: ${error.suggestion}\n`;
        }
        
        return msg;
    }
    
    typeToString(type) {
        if (!type) return 'any';
        
        if (type.name === 'Array' && type.typeArgs) {
            return `${this.typeToString(type.typeArgs[0])}[]`;
        }
        
        if (type.name === 'function') {
            const params = type.params.map(p => `${p.name}: ${this.typeToString(p.type)}`).join(', ');
            return `(${params}) => ${this.typeToString(type.returnType)}`;
        }
        
        if (type.name === 'union') {
            return type.types.map(t => this.typeToString(t)).join(' | ');
        }
        
        if (type.name === 'literal') {
            return typeof type.value === 'string' ? `'${type.value}'` : String(type.value);
        }
        
        return type.name || 'any';
    }
}

class TypeChecker {
    constructor(typeSystem) {
        this.typeSystem = typeSystem || new TypeSystem();
        this.scope = new Map();
        this.errors = [];
    }
    
    checkVariable(name, type, value) {
        const resolvedType = this.typeSystem.parseTypeAnnotation(type);
        if (!resolvedType) {
            this.errors.push(`Unknown type: ${type}`);
            return false;
        }
        
        const result = this.typeSystem.checkType(value, resolvedType);
        if (!result.valid) {
            this.errors.push(result.error);
            return false;
        }
        
        this.scope.set(name, resolvedType);
        return true;
    }
    
    checkFunctionCall(funcName, args) {
        const funcType = this.scope.get(funcName);
        if (!funcType) {
            this.errors.push(`Undefined function: ${funcName}`);
            return false;
        }
        
        if (funcType.kind !== 'function') {
            this.errors.push(`${funcName} is not a function type`);
            return false;
        }
        
        if (args.length !== funcType.params.length) {
            this.errors.push(`Argument count mismatch: expected ${funcType.params.length}, got ${args.length}`);
            return false;
        }
        
        for (let i = 0; i < args.length; i++) {
            const argType = this.typeSystem.inferType(args[i]);
            const paramType = funcType.params[i];
            
            if (!this.typeSystem.isCompatible(argType, paramType)) {
                this.errors.push(`Argument ${i + 1} type mismatch: expected ${paramType.name}, got ${argType.name}`);
            }
        }
        
        return this.errors.length === 0;
    }
    
    checkPropertyAccess(obj, property) {
        const objType = this.typeSystem.inferType(obj);
        
        if (objType.kind !== 'object') {
            this.errors.push(`Cannot access property on non-object type: ${property}`);
            return false;
        }
        
        if (!(property in objType.properties)) {
            this.errors.push(`Property does not exist on object: ${property}`);
            return false;
        }
        
        return true;
    }
    
    checkArrayAccess(array, index) {
        const arrayType = this.typeSystem.inferType(array);
        
        if (arrayType.kind !== 'array') {
            this.errors.push(`Cannot access element on non-array type`);
            return false;
        }
        
        const indexType = this.typeSystem.inferType(index);
        if (indexType.name !== 'number') {
            this.errors.push(`Array index must be number type, got ${indexType.name}`);
            return false;
        }
        
        return true;
    }
    
    getErrors() {
        return this.errors;
    }
    
    clearErrors() {
        this.errors = [];
    }
}

class TypeInferencer {
    constructor(typeSystem) {
        this.typeSystem = typeSystem || new TypeSystem();
    }
    
    inferExpression(node) {
        if (!node) return { kind: 'primitive', name: 'null' };
        
        switch (node.type) {
            case 'number':
                return { kind: 'primitive', name: 'number' };
            case 'string':
                return { kind: 'primitive', name: 'string' };
            case 'boolean':
            case 'bool':
                return { kind: 'primitive', name: 'boolean' };
            case 'null':
                return { kind: 'primitive', name: 'null' };
            case 'array':
                return this.inferArrayExpression(node);
            case 'object':
                return this.inferObjectExpression(node);
            case 'binary':
            case 'Binary':
                return this.inferBinaryExpression(node);
            case 'call':
                return this.inferCallExpression(node);
            case 'member':
                return this.inferMemberExpression(node);
            case 'identifier':
            case 'id':
                return { kind: 'primitive', name: 'any' };
            default:
                return { kind: 'primitive', name: 'any' };
        }
    }
    
    inferArrayExpression(node) {
        if (!node.elements || node.elements.length === 0) {
            return { kind: 'array', elementType: 'any' };
        }
        
        const elementTypes = new Set(
            node.elements.map(e => this.inferExpression(e).name)
        );
        
        return {
            kind: 'array',
            elementType: elementTypes.size === 1 ? Array.from(elementTypes)[0] : 'any'
        };
    }
    
    inferObjectExpression(node) {
        const properties = {};
        
        if (node.pairs) {
            for (const pair of node.pairs) {
                properties[pair.key] = this.inferExpression(pair.value);
            }
        }
        
        return { kind: 'object', properties };
    }
    
    inferBinaryExpression(node) {
        const leftType = this.inferExpression(node.left);
        const rightType = this.inferExpression(node.right);
        
        switch (node.op) {
            case '+':
                if (leftType.name === 'string' || rightType.name === 'string') {
                    return { kind: 'primitive', name: 'string' };
                }
                return { kind: 'primitive', name: 'number' };
            case '-':
            case '*':
            case '/':
            case '%':
                return { kind: 'primitive', name: 'number' };
            case '==':
            case '!=':
            case '<':
            case '<=':
            case '>':
            case '>=':
            case '===':
            case '!==':
                return { kind: 'primitive', name: 'boolean' };
            case '&&':
            case '||':
                return { kind: 'primitive', name: 'boolean' };
            default:
                return { kind: 'primitive', name: 'any' };
        }
    }
    
    inferCallExpression(node) {
        return { kind: 'primitive', name: 'any' };
    }
    
    inferMemberExpression(node) {
        const objType = this.inferExpression(node.object);
        
        if (objType.kind === 'object' && objType.properties) {
            const propType = objType.properties[node.property];
            if (propType) {
                return propType;
            }
        }
        
        if (objType.kind === 'array') {
            if (node.property === 'length') {
                return { kind: 'primitive', name: 'number' };
            }
            if (['push', 'pop', 'shift', 'slice', 'concat', 'reverse', 'sort'].includes(node.property)) {
                return { kind: 'function' };
            }
        }
        
        return { kind: 'primitive', name: 'any' };
    }
}

module.exports = { TypeSystem, TypeChecker, TypeInferencer };
