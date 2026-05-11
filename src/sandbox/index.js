/**
 * SeedLang 沙箱隔离系统
 * Sandbox Isolation System for Secure Code Execution
 * 
 * 提供安全的代码执行环境，防止恶意代码访问系统资源
 */

const path = require('path');
const fs = require('fs');

class Sandbox {
    constructor(options = {}) {
        this.options = {
            maxMemory: options.maxMemory || 128 * 1024 * 1024,
            maxCpuTime: options.maxCpuTime || 5000,
            maxFileSize: options.maxFileSize || 10 * 1024 * 1024,
            maxArraySize: options.maxArraySize || 1000000,
            maxStringLength: options.maxStringLength || 10 * 1024 * 1024,
            maxRecursionDepth: options.maxRecursionDepth || 1000,
            maxLoopIterations: options.maxLoopIterations || 10000000,
            allowFileSystem: options.allowFileSystem !== false,
            allowNetwork: options.allowNetwork || false,
            allowChildProcess: options.allowChildProcess || false,
            allowEval: options.allowEval || false,
            allowRequire: options.allowRequire || false,
            allowedPaths: options.allowedPaths || [],
            blockedPaths: options.blockedPaths || [],
            allowedModules: options.allowedModules || [],
            blockedModules: options.blockedModules || ['child_process', 'cluster', 'worker_threads'],
            strictMode: options.strictMode || false,
            ...options
        };
        
        this.resourceUsage = {
            memory: 0,
            cpuTime: 0,
            fileOperations: 0,
            networkRequests: 0
        };
        
        this.violations = [];
        this.permissions = new Map();
        this.auditLog = [];
        
        this._setupPermissions();
    }
    
    _setupPermissions() {
        this.permissions.set('fs.read', this.options.allowFileSystem);
        this.permissions.set('fs.write', this.options.allowFileSystem);
        this.permissions.set('fs.delete', false);
        this.permissions.set('network.http', this.options.allowNetwork);
        this.permissions.set('network.websocket', this.options.allowNetwork);
        this.permissions.set('process.spawn', this.options.allowChildProcess);
        this.permissions.set('process.exec', this.options.allowChildProcess);
        this.permissions.set('code.eval', this.options.allowEval);
        this.permissions.set('module.require', this.options.allowRequire);
    }
    
    checkPermission(action, resource = null) {
        const hasPermission = this.permissions.get(action);
        
        if (!hasPermission) {
            this._logViolation('permission_denied', action, resource);
            return { allowed: false, reason: `Permission denied: ${action}` };
        }
        
        if (resource) {
            const pathCheck = this._checkPathAccess(resource, action);
            if (!pathCheck.allowed) {
                return pathCheck;
            }
        }
        
        this._auditAccess(action, resource);
        return { allowed: true };
    }
    
    _checkPathAccess(targetPath, action) {
        const resolved = path.resolve(targetPath);
        
        for (const blocked of this.options.blockedPaths) {
            if (resolved.startsWith(path.resolve(blocked))) {
                this._logViolation('blocked_path', action, targetPath);
                return { allowed: false, reason: `Path is blocked: ${targetPath}` };
            }
        }
        
        if (this.options.allowedPaths.length > 0) {
            let isAllowed = false;
            for (const allowed of this.options.allowedPaths) {
                if (resolved.startsWith(path.resolve(allowed))) {
                    isAllowed = true;
                    break;
                }
            }
            
            if (!isAllowed) {
                this._logViolation('unauthorized_path', action, targetPath);
                return { allowed: false, reason: `Path not in allowed list: ${targetPath}` };
            }
        }
        
        return { allowed: true };
    }
    
    checkModuleAccess(moduleName) {
        if (this.options.blockedModules.includes(moduleName)) {
            this._logViolation('blocked_module', 'module.require', moduleName);
            return { allowed: false, reason: `Module is blocked: ${moduleName}` };
        }
        
        if (this.options.allowedModules.length > 0 && !this.options.allowedModules.includes(moduleName)) {
            this._logViolation('unauthorized_module', 'module.require', moduleName);
            return { allowed: false, reason: `Module not in allowed list: ${moduleName}` };
        }
        
        return { allowed: true };
    }
    
    checkResourceLimit(type, current, requested = 0) {
        const limits = {
            memory: this.options.maxMemory,
            arraySize: this.options.maxArraySize,
            stringLength: this.options.maxStringLength,
            recursionDepth: this.options.maxRecursionDepth,
            loopIterations: this.options.maxLoopIterations
        };
        
        const limit = limits[type];
        if (limit === undefined) return { allowed: true };
        
        if (current > limit) {
            this._logViolation('resource_limit', type, `${current} > ${limit}`);
            return { allowed: false, reason: `Resource limit exceeded: ${type} (${current} > ${limit})` };
        }
        
        if (requested > 0 && current + requested > limit) {
            return { allowed: false, reason: `Resource limit would be exceeded: ${type}` };
        }
        
        return { allowed: true };
    }
    
    validateString(str) {
        if (typeof str !== 'string') return { valid: true };
        
        if (str.length > this.options.maxStringLength) {
            this._logViolation('string_too_long', 'string', str.length);
            return { valid: false, reason: `String exceeds maximum length: ${str.length} > ${this.options.maxStringLength}` };
        }
        
        const dangerousPatterns = [
            /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /data:text\/html/gi,
            /vbscript:/gi
        ];
        
        for (const pattern of dangerousPatterns) {
            if (pattern.test(str)) {
                this._logViolation('dangerous_string', 'string', str.substring(0, 100));
                if (this.options.strictMode) {
                    return { valid: false, reason: 'String contains potentially dangerous content' };
                }
            }
        }
        
        return { valid: true };
    }
    
    validateArray(arr) {
        if (!Array.isArray(arr)) return { valid: true };
        
        if (arr.length > this.options.maxArraySize) {
            this._logViolation('array_too_large', 'array', arr.length);
            return { valid: false, reason: `Array exceeds maximum size: ${arr.length} > ${this.options.maxArraySize}` };
        }
        
        return { valid: true };
    }
    
    createSafeFunction(fn, context = {}) {
        const self = this;
        
        return function(...args) {
            for (const arg of args) {
                if (typeof arg === 'string') {
                    const validation = self.validateString(arg);
                    if (!validation.valid) {
                        throw new Error(validation.reason);
                    }
                }
                if (Array.isArray(arg)) {
                    const validation = self.validateArray(arg);
                    if (!validation.valid) {
                        throw new Error(validation.reason);
                    }
                }
            }
            
            return fn.apply(context, args);
        };
    }
    
    wrapFileSystem(originalFs) {
        const self = this;
        const wrapped = {};
        
        const wrapMethod = (name, original) => {
            wrapped[name] = function(...args) {
                const filePath = args[0];
                const check = self.checkPermission('fs.' + name.split('Sync')[0], filePath);
                
                if (!check.allowed) {
                    if (name.endsWith('Sync')) {
                        throw new Error(check.reason);
                    }
                    return Promise.reject(new Error(check.reason));
                }
                
                self.resourceUsage.fileOperations++;
                return original.apply(originalFs, args);
            };
        };
        
        for (const [name, fn] of Object.entries(originalFs)) {
            if (typeof fn === 'function') {
                wrapMethod(name, fn);
            } else {
                wrapped[name] = fn;
            }
        }
        
        return wrapped;
    }
    
    wrapRequire(originalRequire) {
        const self = this;
        
        return function(moduleName) {
            const check = self.checkModuleAccess(moduleName);
            
            if (!check.allowed) {
                throw new Error(check.reason);
            }
            
            return originalRequire(moduleName);
        };
    }
    
    _logViolation(type, action, resource) {
        const violation = {
            type,
            action,
            resource: typeof resource === 'string' ? resource : String(resource),
            timestamp: Date.now()
        };
        
        this.violations.push(violation);
        
        if (this.options.strictMode) {
            throw new Error(`Security violation: ${type} - ${action} on ${resource}`);
        }
    }
    
    _auditAccess(action, resource) {
        this.auditLog.push({
            action,
            resource: resource || 'none',
            timestamp: Date.now()
        });
    }
    
    getViolations() {
        return [...this.violations];
    }
    
    getAuditLog() {
        return [...this.auditLog];
    }
    
    getResourceUsage() {
        return { ...this.resourceUsage };
    }
    
    reset() {
        this.violations = [];
        this.auditLog = [];
        this.resourceUsage = {
            memory: 0,
            cpuTime: 0,
            fileOperations: 0,
            networkRequests: 0
        };
    }
    
    createIsolatedContext() {
        return {
            sandbox: this,
            globals: {},
            modules: new Map(),
            require: this.wrapRequire(require),
            fs: this.wrapFileSystem(fs),
            checkPermission: (action, resource) => this.checkPermission(action, resource),
            checkResourceLimit: (type, current) => this.checkResourceLimit(type, current),
            validateString: (str) => this.validateString(str),
            validateArray: (arr) => this.validateArray(arr)
        };
    }
}

class SecurityPolicy {
    constructor(name, rules = []) {
        this.name = name;
        this.rules = rules;
    }
    
    addRule(rule) {
        this.rules.push({
            id: rule.id || `rule_${this.rules.length}`,
            action: rule.action,
            resource: rule.resource,
            effect: rule.effect || 'deny',
            conditions: rule.conditions || []
        });
    }
    
    evaluate(action, resource, context = {}) {
        for (const rule of this.rules) {
            if (this._matchesRule(rule, action, resource, context)) {
                return rule.effect === 'allow';
            }
        }
        return false;
    }
    
    _matchesRule(rule, action, resource, context) {
        if (rule.action && !this._matchPattern(action, rule.action)) {
            return false;
        }
        
        if (rule.resource && !this._matchPattern(resource, rule.resource)) {
            return false;
        }
        
        for (const condition of rule.conditions) {
            if (!this._evaluateCondition(condition, context)) {
                return false;
            }
        }
        
        return true;
    }
    
    _matchPattern(value, pattern) {
        if (pattern === '*') return true;
        if (typeof pattern === 'string') {
            return value === pattern;
        }
        if (pattern instanceof RegExp) {
            return pattern.test(value);
        }
        return false;
    }
    
    _evaluateCondition(condition, context) {
        const { field, operator, value } = condition;
        const contextValue = context[field];
        
        switch (operator) {
            case 'eq': return contextValue === value;
            case 'ne': return contextValue !== value;
            case 'gt': return contextValue > value;
            case 'lt': return contextValue < value;
            case 'gte': return contextValue >= value;
            case 'lte': return contextValue <= value;
            case 'in': return Array.isArray(value) && value.includes(contextValue);
            case 'not_in': return Array.isArray(value) && !value.includes(contextValue);
            default: return false;
        }
    }
}

class InputSanitizer {
    constructor(options = {}) {
        this.options = {
            maxInputLength: options.maxInputLength || 1000000,
            escapeHtml: options.escapeHtml !== false,
            stripTags: options.stripTags || false,
            allowedTags: options.allowedTags || [],
            ...options
        };
    }
    
    sanitize(input) {
        if (typeof input !== 'string') {
            return input;
        }
        
        let sanitized = input;
        
        if (sanitized.length > this.options.maxInputLength) {
            sanitized = sanitized.substring(0, this.options.maxInputLength);
        }
        
        if (this.options.stripTags && this.options.allowedTags.length === 0) {
            sanitized = sanitized.replace(/<[^>]*>/g, '');
        }
        
        if (this.options.escapeHtml) {
            sanitized = this._escapeHtml(sanitized);
        }
        
        return sanitized;
    }
    
    _escapeHtml(str) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        };
        
        return str.replace(/[&<>"'/]/g, char => escapeMap[char]);
    }
    
    sanitizeObject(obj) {
        if (obj === null || obj === undefined) {
            return obj;
        }
        
        if (typeof obj === 'string') {
            return this.sanitize(obj);
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeObject(item));
        }
        
        if (typeof obj === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[this.sanitize(key)] = this.sanitizeObject(value);
            }
            return sanitized;
        }
        
        return obj;
    }
    
    validateSQL(input) {
        const sqlInjectionPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b)/gi,
            /(--|\#|\/\*|\*\/)/g,
            /(\bOR\b|\bAND\b)\s*['"]?\d+['"]?\s*=\s*['"]?\d+/gi,
            /UNION\s+SELECT/gi,
            /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP)/gi
        ];
        
        for (const pattern of sqlInjectionPatterns) {
            if (pattern.test(input)) {
                return { valid: false, reason: 'Potential SQL injection detected' };
            }
        }
        
        return { valid: true };
    }
    
    validateCommand(input) {
        const commandInjectionPatterns = [
            /[;&|`$]/g,
            /\$\([^)]*\)/g,
            /`[^`]*`/g,
            /\|\s*\w+/g,
            />\s*\//g
        ];
        
        for (const pattern of commandInjectionPatterns) {
            if (pattern.test(input)) {
                return { valid: false, reason: 'Potential command injection detected' };
            }
        }
        
        return { valid: true };
    }
    
    validatePath(input) {
        const pathTraversalPatterns = [
            /\.\./g,
            /\.\.\//g,
            /\.\.\\/g,
            /~\//g,
            /\0/g
        ];
        
        for (const pattern of pathTraversalPatterns) {
            if (pattern.test(input)) {
                return { valid: false, reason: 'Potential path traversal detected' };
            }
        }
        
        return { valid: true };
    }
}

module.exports = {
    Sandbox,
    SecurityPolicy,
    InputSanitizer
};
