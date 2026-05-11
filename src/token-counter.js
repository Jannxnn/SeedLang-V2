/**
 * SeedLang TOKEN 计数器
 * Token Counter for AI Cost Optimization
 * 
 * 用于计算和对比不同编程语言的 TOKEN 消耗
 * 展示 SeedLang 在 AI 编程场景中的 TOKEN 节省优势
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const PRICING_CACHE_FILE = path.join(require('os').tmpdir(), '.seedlang-pricing-cache.json');
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_PRICING_URL = 'https://raw.githubusercontent.com/seedlang/pricing/main/models.json';
const LOCAL_PRICING_FILE = path.join(__dirname, '..', 'data', 'model-pricing.json');

class TokenCounter {
    constructor(options = {}) {
        this.options = {
            countComments: options.countComments || false,
            countWhitespace: options.countWhitespace || false,
            normalizeIdentifiers: options.normalizeIdentifiers || false,
            autoUpdatePricing: options.autoUpdatePricing !== false,
            ...options
        };
        
        this.stats = {
            totalComparisons: 0,
            totalTokensSaved: 0,
            averageSavings: 0
        };
        
        this.currentModel = null;
        this.modelConfig = null;
        
        this.modelPricing = this._loadDefaultPricing();
        
        this._loadLocalPricing();
        
        this._detectCurrentModel();
        
        this.languagePatterns = {
            seedlang: {
                keywords: ['fn', 'let', 'var', 'const', 'if', 'else', 'elif', 'while', 'for', 'in', 'return', 'break', 'continue', 'class', 'struct', 'enum', 'interface', 'impl', 'pub', 'priv', 'import', 'export', 'from', 'as', 'try', 'catch', 'throw', 'async', 'await', 'yield', 'match', 'case', 'default', 'true', 'false', 'null', 'nil', 'self', 'this', 'super', 'new', 'delete', 'typeof', 'instanceof', 'sizeof'],
                operators: ['+', '-', '*', '/', '%', '=', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!', '&', '|', '^', '~', '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '=>', '->', '::', '.', ',', ':', ';', '(', ')', '[', ']', '{', '}', '?'],
                shortSyntax: {
                    'fn': 'function',
                    'let': 'let',
                    'var': 'var',
                    'if': 'if',
                    'elif': 'else if',
                    'while': 'while',
                    'for': 'for',
                    'return': 'return',
                    'class': 'class',
                    'import': 'import',
                    'export': 'export',
                    'async': 'async',
                    'await': 'await',
                    'try': 'try',
                    'catch': 'catch',
                    'throw': 'throw',
                    'match': 'switch',
                    'case': 'case',
                    'true': 'true',
                    'false': 'false',
                    'null': 'null',
                    'nil': 'null'
                }
            },
            javascript: {
                keywords: ['function', 'const', 'let', 'var', 'if', 'else', 'while', 'for', 'return', 'break', 'continue', 'class', 'extends', 'import', 'export', 'from', 'as', 'try', 'catch', 'throw', 'async', 'await', 'yield', 'switch', 'case', 'default', 'true', 'false', 'null', 'undefined', 'this', 'new', 'delete', 'typeof', 'instanceof', 'void', 'in', 'of'],
                operators: ['+', '-', '*', '/', '%', '=', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||', '!', '&', '|', '^', '~', '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '=>', '.', ',', ':', ';', '(', ')', '[', ']', '{', '}', '?', '...'],
                boilerplate: {
                    'function': 1,
                    'const': 1,
                    'let': 1,
                    'var': 1,
                    'return': 1,
                    'async': 1,
                    'await': 1,
                    'export': 1,
                    'default': 1
                }
            },
            python: {
                keywords: ['def', 'lambda', 'if', 'elif', 'else', 'while', 'for', 'in', 'return', 'break', 'continue', 'class', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'async', 'await', 'yield', 'match', 'case', 'True', 'False', 'None', 'self', 'is', 'not', 'and', 'or', 'pass', 'global', 'nonlocal', 'assert', 'del'],
                operators: ['+', '-', '*', '/', '%', '//', '**', '=', '==', '!=', '<', '>', '<=', '>=', 'and', 'or', 'not', '&', '|', '^', '~', '<<', '>>', '+=', '-=', '*=', '/=', '->', '.', ',', ':', ';', '(', ')', '[', ']', '{', '}', '@'],
                boilerplate: {
                    'def': 1,
                    'self': 1,
                    'return': 1,
                    'async': 1,
                    'await': 1,
                    'from': 1,
                    'import': 1,
                    'raise': 1
                }
            },
            typescript: {
                keywords: ['function', 'const', 'let', 'var', 'if', 'else', 'while', 'for', 'return', 'break', 'continue', 'class', 'extends', 'implements', 'interface', 'type', 'enum', 'import', 'export', 'from', 'as', 'try', 'catch', 'throw', 'async', 'await', 'yield', 'switch', 'case', 'default', 'true', 'false', 'null', 'undefined', 'this', 'new', 'delete', 'typeof', 'instanceof', 'void', 'in', 'of', 'public', 'private', 'protected', 'readonly', 'abstract', 'static', 'namespace', 'module', 'declare', 'any', 'unknown', 'never', 'void', 'string', 'number', 'boolean', 'object', 'symbol', 'bigint'],
                operators: ['+', '-', '*', '/', '%', '=', '==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||', '!', '&', '|', '^', '~', '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '=>', '.', ',', ':', ';', '(', ')', '[', ']', '{', '}', '?', '...', '<', '>', '|', '&'],
                boilerplate: {
                    'function': 1,
                    'const': 1,
                    'let': 1,
                    'return': 1,
                    'async': 1,
                    'await': 1,
                    'export': 1,
                    'default': 1,
                    'interface': 2,
                    'type': 2,
                    'public': 1,
                    'private': 1,
                    'protected': 1,
                    'readonly': 1
                }
            },
            java: {
                keywords: ['public', 'private', 'protected', 'static', 'final', 'abstract', 'class', 'interface', 'extends', 'implements', 'new', 'return', 'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'void', 'int', 'long', 'short', 'byte', 'float', 'double', 'boolean', 'char', 'true', 'false', 'null', 'this', 'super', 'instanceof', 'synchronized', 'volatile', 'transient', 'native', 'strictfp', 'assert', 'enum', 'const', 'goto', 'record', 'sealed', 'permits', 'var'],
                operators: ['+', '-', '*', '/', '%', '=', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!', '&', '|', '^', '~', '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '->', '.', ',', ':', ';', '(', ')', '[', ']', '{', '}', '?', '::'],
                boilerplate: {
                    'public': 2,
                    'private': 2,
                    'protected': 2,
                    'static': 2,
                    'final': 1,
                    'class': 2,
                    'interface': 2,
                    'extends': 1,
                    'implements': 1,
                    'new': 1,
                    'return': 1,
                    'void': 1,
                    'int': 1,
                    'String': 1,
                    'boolean': 1,
                    'throws': 1,
                    'import': 1,
                    'package': 1
                }
            },
            cpp: {
                keywords: ['int', 'long', 'short', 'char', 'float', 'double', 'bool', 'void', 'auto', 'const', 'static', 'extern', 'register', 'volatile', 'signed', 'unsigned', 'class', 'struct', 'union', 'enum', 'public', 'private', 'protected', 'virtual', 'override', 'final', 'friend', 'inline', 'template', 'typename', 'namespace', 'using', 'typedef', 'sizeof', 'new', 'delete', 'return', 'if', 'else', 'while', 'for', 'do', 'switch', 'case', 'default', 'break', 'continue', 'goto', 'try', 'catch', 'throw', 'true', 'false', 'nullptr', 'this', 'operator', 'explicit', 'implicit', 'mutable', 'constexpr', 'noexcept', 'decltype', 'static_assert', 'thread_local', 'alignas', 'alignof'],
                operators: ['+', '-', '*', '/', '%', '=', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!', '&', '|', '^', '~', '<<', '>>', '+=', '-=', '*=', '/=', '->', '.', ',', ':', ';', '(', ')', '[', ']', '{', '}', '?', '::', '->*', '.*', '...', '<', '>'],
                boilerplate: {
                    'int': 1,
                    'void': 1,
                    'return': 1,
                    'class': 2,
                    'struct': 2,
                    'public': 2,
                    'private': 2,
                    'protected': 2,
                    'virtual': 1,
                    'override': 1,
                    'const': 1,
                    'static': 1,
                    'template': 3,
                    'typename': 1,
                    'namespace': 2,
                    'using': 1,
                    'std': 2,
                    'include': 2,
                    'define': 2,
                    'new': 1,
                    'delete': 1
                }
            },
            rust: {
                keywords: ['fn', 'let', 'mut', 'const', 'static', 'pub', 'priv', 'mod', 'use', 'crate', 'self', 'super', 'struct', 'enum', 'trait', 'impl', 'type', 'where', 'for', 'loop', 'while', 'if', 'else', 'match', 'return', 'break', 'continue', 'move', 'ref', 'as', 'in', 'unsafe', 'extern', 'async', 'await', 'dyn', 'box', 'true', 'false', 'Some', 'None', 'Ok', 'Err', 'Self', 'sizeof'],
                operators: ['+', '-', '*', '/', '%', '=', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!', '&', '|', '^', '~', '<<', '>>', '+=', '-=', '*=', '/=', '->', '=>', '.', ',', ':', ';', '(', ')', '[', ']', '{', '}', '?', '::', '..', '...'],
                boilerplate: {
                    'fn': 1,
                    'let': 1,
                    'mut': 1,
                    'pub': 2,
                    'struct': 2,
                    'enum': 2,
                    'trait': 2,
                    'impl': 2,
                    'use': 1,
                    'mod': 1,
                    'return': 1,
                    'match': 1,
                    'Some': 1,
                    'None': 1,
                    'Ok': 1,
                    'Err': 1,
                    'Result': 2,
                    'Option': 2,
                    'Vec': 2,
                    'String': 2,
                    'async': 1,
                    'await': 1,
                    'move': 1
                }
            }
        };
        
        this.conversionExamples = {
            function: {
                seedlang: 'fn add(a b) { return a + b }',
                javascript: 'function add(a, b) { return a + b; }',
                python: 'def add(a, b):\n    return a + b',
                typescript: 'function add(a: number, b: number): number { return a + b; }',
                java: 'public int add(int a, int b) { return a + b; }',
                cpp: 'int add(int a, int b) { return a + b; }',
                rust: 'fn add(a: i32, b: i32) -> i32 { a + b }'
            },
            class: {
                seedlang: 'class Point { fn new(x y) { self.x = x; self.y = y } fn distance() { (self.x**2 + self.y**2)**0.5 } }',
                javascript: 'class Point { constructor(x, y) { this.x = x; this.y = y; } distance() { return Math.sqrt(this.x**2 + this.y**2); } }',
                python: 'class Point:\n    def __init__(self, x, y):\n        self.x = x\n        self.y = y\n    def distance(self):\n        return (self.x**2 + self.y**2)**0.5',
                typescript: 'class Point { constructor(public x: number, public y: number) {} distance(): number { return Math.sqrt(this.x**2 + this.y**2); } }',
                java: 'public class Point { private int x, y; public Point(int x, int y) { this.x = x; this.y = y; } public double distance() { return Math.sqrt(x*x + y*y); } }',
                cpp: 'class Point { public: int x, y; Point(int x, int y) : x(x), y(y) {} double distance() { return sqrt(x*x + y*y); } };',
                rust: 'struct Point { x: i32, y: i32 } impl Point { fn new(x: i32, y: i32) -> Self { Self { x, y } } fn distance(&self) -> f64 { (self.x.pow(2) + self.y.pow(2)) as f64).sqrt() } }'
            },
            loop: {
                seedlang: 'for i in 0..10 { print(i) }',
                javascript: 'for (let i = 0; i < 10; i++) { console.log(i); }',
                python: 'for i in range(10):\n    print(i)',
                typescript: 'for (let i = 0; i < 10; i++) { console.log(i); }',
                java: 'for (int i = 0; i < 10; i++) { System.out.println(i); }',
                cpp: 'for (int i = 0; i < 10; i++) { std::cout << i << std::endl; }',
                rust: 'for i in 0..10 { println!("{}", i); }'
            },
            async: {
                seedlang: 'async fn fetch(url) { let res = await http(url); return res }',
                javascript: 'async function fetch(url) { const res = await http(url); return res; }',
                python: 'async def fetch(url):\n    res = await http(url)\n    return res',
                typescript: 'async function fetch(url: string): Promise<Response> { const res = await http(url); return res; }',
                java: 'public CompletableFuture<Response> fetch(String url) { return CompletableFuture.supplyAsync(() -> http(url)); }',
                cpp: 'std::future<Response> fetch(std::string url) { return std::async(std::launch::async, http, url); }',
                rust: 'async fn fetch(url: &str) -> Result<Response, Error> { let res = http(url).await?; Ok(res) }'
            },
            match: {
                seedlang: 'match x { 0 => "zero", 1 => "one", _ => "other" }',
                javascript: 'switch (x) { case 0: return "zero"; case 1: return "one"; default: return "other"; }',
                python: 'match x:\n    case 0: return "zero"\n    case 1: return "one"\n    case _: return "other"',
                typescript: 'switch (x) { case 0: return "zero"; case 1: return "one"; default: return "other"; }',
                java: 'switch (x) { case 0: return "zero"; case 1: return "one"; default: return "other"; }',
                cpp: 'switch (x) { case 0: return "zero"; case 1: return "one"; default: return "other"; }',
                rust: 'match x { 0 => "zero", 1 => "one", _ => "other" }'
            }
        };
    }
    
    buildOperatorRegex(operators) {
        const escaped = operators.map(op => {
            let escaped = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (escaped.includes('-')) {
                escaped = escaped.replace(/-/g, '\\-');
            }
            return escaped;
        });
        
        escaped.sort((a, b) => b.length - a.length);
        
        return new RegExp(escaped.join('|'), 'g');
    }
    
    countTokens(code, language = 'seedlang') {
        if (!code || typeof code !== 'string') {
            return { tokens: 0, breakdown: {} };
        }
        
        const tokens = [];
        const breakdown = {
            keywords: 0,
            identifiers: 0,
            operators: 0,
            literals: 0,
            strings: 0,
            comments: 0,
            whitespace: 0,
            other: 0
        };
        
        const patterns = this.languagePatterns[language] || this.languagePatterns.seedlang;
        
        let processedCode = code;
        
        if (!this.options.countComments) {
            processedCode = this.removeComments(processedCode, language);
        }
        
        const tokenPatterns = [
            { type: 'string', regex: /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g },
            { type: 'template', regex: /`(?:[^`\\]|\\.)*`/g },
            { type: 'number', regex: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g },
            { type: 'keyword', regex: new RegExp(`\\b(${patterns.keywords.join('|')})\\b`, 'g') },
            { type: 'operator', regex: this.buildOperatorRegex(patterns.operators) },
            { type: 'identifier', regex: /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g },
            { type: 'whitespace', regex: /\s+/g }
        ];
        
        const usedPositions = new Set();
        
        for (const { type, regex } of tokenPatterns) {
            let match;
            const re = new RegExp(regex.source, regex.flags);
            
            while ((match = re.exec(processedCode)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                
                let overlaps = false;
                for (let i = start; i < end; i++) {
                    if (usedPositions.has(i)) {
                        overlaps = true;
                        break;
                    }
                }
                
                if (!overlaps) {
                    for (let i = start; i < end; i++) {
                        usedPositions.add(i);
                    }
                    
                    tokens.push({
                        type,
                        value: match[0],
                        position: start
                    });
                    
                    switch (type) {
                        case 'keyword': breakdown.keywords++; break;
                        case 'identifier': breakdown.identifiers++; break;
                        case 'operator': breakdown.operators++; break;
                        case 'number': breakdown.literals++; break;
                        case 'string':
                        case 'template':
                            breakdown.strings++;
                            break;
                        case 'whitespace':
                            if (this.options.countWhitespace) {
                                breakdown.whitespace++;
                            }
                            break;
                        default: breakdown.other++;
                    }
                }
            }
        }
        
        const totalTokens = tokens.filter(t => t.type !== 'whitespace' || this.options.countWhitespace).length;
        
        return {
            tokens: totalTokens,
            breakdown,
            tokenList: tokens,
            code: processedCode
        };
    }
    
    removeComments(code, language) {
        let result = code;
        
        result = result.replace(/\/\*[\s\S]*?\*\//g, '');
        result = result.replace(/\/\/.*$/gm, '');
        
        if (language === 'python' || language === 'rust') {
            result = result.replace(/#.*$/gm, '');
        }
        
        if (language === 'python') {
            result = result.replace(/'''[\s\S]*?'''/g, '');
            result = result.replace(/"""[\s\S]*?"""/g, '');
        }
        
        return result;
    }
    
    compare(seedlangCode, otherCode, otherLanguage = 'javascript') {
        const seedlangResult = this.countTokens(seedlangCode, 'seedlang');
        const otherResult = this.countTokens(otherCode, otherLanguage);
        
        const saved = otherResult.tokens - seedlangResult.tokens;
        const percentage = otherResult.tokens > 0 
            ? ((saved / otherResult.tokens) * 100).toFixed(2) 
            : 0;
        
        this.stats.totalComparisons++;
        this.stats.totalTokensSaved += saved;
        this.stats.averageSavings = this.stats.totalTokensSaved / this.stats.totalComparisons;
        
        return {
            seedlang: {
                tokens: seedlangResult.tokens,
                breakdown: seedlangResult.breakdown
            },
            other: {
                language: otherLanguage,
                tokens: otherResult.tokens,
                breakdown: otherResult.breakdown
            },
            savings: {
                tokens: saved,
                percentage: parseFloat(percentage),
                isPositive: saved > 0
            }
        };
    }
    
    compareAll(seedlangCode, codeMap) {
        const results = {};
        
        for (const [language, code] of Object.entries(codeMap)) {
            if (language !== 'seedlang') {
                results[language] = this.compare(seedlangCode, code, language);
            }
        }
        
        return {
            seedlang: this.countTokens(seedlangCode, 'seedlang'),
            comparisons: results,
            summary: this.generateSummary(results)
        };
    }
    
    generateSummary(results) {
        const languages = Object.keys(results);
        const totalSaved = languages.reduce((sum, lang) => sum + results[lang].savings.tokens, 0);
        const avgPercentage = languages.reduce((sum, lang) => sum + results[lang].savings.percentage, 0) / languages.length;
        
        return {
            languagesCompared: languages.length,
            totalTokensSaved: totalSaved,
            averageSavingsPercentage: avgPercentage.toFixed(2),
            bestSavings: this.findBestSavings(results),
            worstSavings: this.findWorstSavings(results)
        };
    }
    
    findBestSavings(results) {
        let best = { language: null, savings: -Infinity };
        
        for (const [language, result] of Object.entries(results)) {
            if (result.savings.tokens > best.savings) {
                best = { language, savings: result.savings.tokens, percentage: result.savings.percentage };
            }
        }
        
        return best;
    }
    
    findWorstSavings(results) {
        let worst = { language: null, savings: Infinity };
        
        for (const [language, result] of Object.entries(results)) {
            if (result.savings.tokens < worst.savings) {
                worst = { language, savings: result.savings.tokens, percentage: result.savings.percentage };
            }
        }
        
        return worst;
    }
    
    analyzeCodePatterns(code, language = 'seedlang') {
        const result = this.countTokens(code, language);
        const patterns = this.languagePatterns[language];
        
        const analysis = {
            totalTokens: result.tokens,
            breakdown: result.breakdown,
            density: this.calculateTokenDensity(code, result.tokens),
            boilerplate: this.identifyBoilerplate(code, language),
            suggestions: this.generateOptimizationSuggestions(result, language)
        };
        
        return analysis;
    }
    
    calculateTokenDensity(code, tokenCount) {
        const lines = code.split('\n').length;
        const chars = code.length;
        
        return {
            tokensPerLine: (tokenCount / lines).toFixed(2),
            tokensPerChar: (tokenCount / chars).toFixed(4),
            charsPerToken: (chars / tokenCount).toFixed(2)
        };
    }
    
    identifyBoilerplate(code, language) {
        const patterns = this.languagePatterns[language];
        if (!patterns || !patterns.boilerplate) return [];
        
        const boilerplate = [];
        const result = this.countTokens(code, language);
        
        for (const [keyword, weight] of Object.entries(patterns.boilerplate)) {
            const count = (code.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
            if (count > 0) {
                boilerplate.push({
                    keyword,
                    count,
                    tokenWeight: weight * count,
                    percentage: ((weight * count / result.tokens) * 100).toFixed(2)
                });
            }
        }
        
        return boilerplate.sort((a, b) => b.tokenWeight - a.tokenWeight);
    }
    
    generateOptimizationSuggestions(result, language) {
        const suggestions = [];
        
        if (result.breakdown.keywords > result.tokens * 0.3) {
            suggestions.push({
                type: 'keyword_reduction',
                message: '考虑使用更简洁的语法减少关键字使用',
                potential: Math.floor(result.breakdown.keywords * 0.2)
            });
        }
        
        if (result.breakdown.operators > result.tokens * 0.2) {
            suggestions.push({
                type: 'operator_simplification',
                message: '可以简化运算符表达式',
                potential: Math.floor(result.breakdown.operators * 0.1)
            });
        }
        
        if (language !== 'seedlang') {
            suggestions.push({
                type: 'language_switch',
                message: '使用 SeedLang 可以节省 TOKEN',
                potential: Math.floor(result.tokens * 0.3)
            });
        }
        
        return suggestions;
    }
    
    generateReport(seedlangCode, comparisons) {
        const report = {
            timestamp: new Date().toISOString(),
            seedlang: this.analyzeCodePatterns(seedlangCode, 'seedlang'),
            comparisons: {},
            summary: {}
        };
        
        for (const [language, code] of Object.entries(comparisons)) {
            report.comparisons[language] = {
                analysis: this.analyzeCodePatterns(code, language),
                comparison: this.compare(seedlangCode, code, language)
            };
        }
        
        report.summary = this.generateComparisonSummary(report);
        
        return report;
    }
    
    generateComparisonSummary(report) {
        const languages = Object.keys(report.comparisons);
        const savings = languages.map(lang => ({
            language: lang,
            tokens: report.comparisons[lang].comparison.savings.tokens,
            percentage: report.comparisons[lang].comparison.savings.percentage
        }));
        
        return {
            totalLanguages: languages.length,
            averageSavings: savings.reduce((sum, s) => sum + s.percentage, 0) / languages.length,
            maxSavings: savings.reduce((max, s) => s.percentage > max.percentage ? s : max, savings[0]),
            minSavings: savings.reduce((min, s) => s.percentage < min.percentage ? s : min, savings[0]),
            savings
        };
    }
    
    formatReport(report, format = 'text') {
        switch (format) {
            case 'json':
                return JSON.stringify(report, null, 2);
            case 'markdown':
                return this.formatAsMarkdown(report);
            case 'html':
                return this.formatAsHTML(report);
            default:
                return this.formatAsText(report);
        }
    }
    
    formatAsText(report) {
        const lines = [];
        
        lines.push('═══════════════════════════════════════════════════════════');
        lines.push('              SeedLang TOKEN 分析报告');
        lines.push('═══════════════════════════════════════════════════════════');
        lines.push('');
        
        lines.push('【SeedLang 代码分析】');
        lines.push(`  总 TOKEN 数: ${report.seedlang.totalTokens}`);
        lines.push(`  TOKEN 密度: ${report.seedlang.density.tokensPerLine} tokens/line`);
        lines.push('');
        
        lines.push('【TOKEN 分布】');
        for (const [type, count] of Object.entries(report.seedlang.breakdown)) {
            if (count > 0) {
                lines.push(`  ${type}: ${count}`);
            }
        }
        lines.push('');
        
        if (report.summary && report.summary.savings) {
            lines.push('【对比结果】');
            for (const saving of report.summary.savings) {
                const sign = saving.tokens >= 0 ? '+' : '';
                lines.push(`  vs ${saving.language}: ${sign}${saving.tokens} tokens (${sign}${saving.percentage}%)`);
            }
            lines.push('');
            lines.push(`  平均节省: ${report.summary.averageSavings.toFixed(2)}%`);
            lines.push(`  最大节省: ${report.summary.maxSavings.percentage}% (${report.summary.maxSavings.language})`);
        }
        
        lines.push('═══════════════════════════════════════════════════════════');
        
        return lines.join('\n');
    }
    
    formatAsMarkdown(report) {
        const lines = [];
        
        lines.push('# SeedLang TOKEN 分析报告');
        lines.push('');
        
        lines.push('## SeedLang 代码分析');
        lines.push('');
        lines.push(`- **总 TOKEN 数**: ${report.seedlang.totalTokens}`);
        lines.push(`- **TOKEN 密度**: ${report.seedlang.density.tokensPerLine} tokens/line`);
        lines.push('');
        
        lines.push('### TOKEN 分布');
        lines.push('');
        lines.push('| 类型 | 数量 |');
        lines.push('|------|------|');
        for (const [type, count] of Object.entries(report.seedlang.breakdown)) {
            if (count > 0) {
                lines.push(`| ${type} | ${count} |`);
            }
        }
        lines.push('');
        
        if (report.summary && report.summary.savings) {
            lines.push('## 对比结果');
            lines.push('');
            lines.push('| 语言 | 节省 TOKEN | 节省百分比 |');
            lines.push('|------|------------|------------|');
            for (const saving of report.summary.savings) {
                const sign = saving.tokens >= 0 ? '+' : '';
                lines.push(`| ${saving.language} | ${sign}${saving.tokens} | ${sign}${saving.percentage}% |`);
            }
            lines.push('');
            lines.push(`**平均节省**: ${report.summary.averageSavings.toFixed(2)}%`);
            lines.push('');
            lines.push(`**最大节省**: ${report.summary.maxSavings.percentage}% (${report.summary.maxSavings.language})`);
        }
        
        return lines.join('\n');
    }
    
    formatAsHTML(report) {
        return `<!DOCTYPE html>
<html>
<head>
    <title>SeedLang TOKEN 分析报告</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
        .positive { color: green; }
        .negative { color: red; }
    </style>
</head>
<body>
    <h1>SeedLang TOKEN 分析报告</h1>
    <p>总 TOKEN 数: ${report.seedlang.totalTokens}</p>
    <p>TOKEN 密度: ${report.seedlang.density.tokensPerLine} tokens/line</p>
    ${this.generateHTMLTable(report)}
</body>
</html>`;
    }
    
    generateHTMLTable(report) {
        let html = '<table><tr><th>语言</th><th>TOKEN 数</th><th>节省</th><th>节省百分比</th></tr>';
        
        html += `<tr><td>SeedLang</td><td>${report.seedlang.totalTokens}</td><td>-</td><td>-</td></tr>`;
        
        if (report.summary && report.summary.savings) {
            for (const saving of report.summary.savings) {
                const sign = saving.tokens >= 0 ? '+' : '';
                const className = saving.tokens >= 0 ? 'positive' : 'negative';
                html += `<tr><td>${saving.language}</td><td>${report.comparisons[saving.language].analysis.totalTokens}</td><td class="${className}">${sign}${saving.tokens}</td><td class="${className}">${sign}${saving.percentage}%</td></tr>`;
            }
        }
        
        html += '</table>';
        return html;
    }
    
    estimateCost(tokens, model = 'gpt-4') {
        const modelPricing = this.modelPricing[model] || this.modelPricing['gpt-4'];
        
        return {
            input: (tokens / 1000) * modelPricing.input,
            output: (tokens / 1000) * modelPricing.output,
            total: (tokens / 1000) * (modelPricing.input + modelPricing.output),
            model: model,
            modelName: modelPricing.name,
            provider: modelPricing.provider,
            contextWindow: modelPricing.contextWindow
        };
    }
    
    _detectCurrentModel() {
        const envModel = process.env.AI_MODEL || 
                         process.env.OPENAI_MODEL || 
                         process.env.ANTHROPIC_MODEL ||
                         process.env.GOOGLE_MODEL ||
                         process.env.MODEL_NAME;
        
        if (envModel) {
            const normalizedModel = this._normalizeModelName(envModel);
            if (this.modelPricing[normalizedModel]) {
                this.currentModel = normalizedModel;
                this.modelConfig = this.modelPricing[normalizedModel];
                return;
            }
        }
        
        const provider = process.env.AI_PROVIDER || process.env.LLM_PROVIDER;
        if (provider) {
            const defaultModel = this._getDefaultModelForProvider(provider.toLowerCase());
            if (defaultModel) {
                this.currentModel = defaultModel;
                this.modelConfig = this.modelPricing[defaultModel];
                return;
            }
        }
        
        if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
            this.currentModel = 'gpt-4o';
            this.modelConfig = this.modelPricing['gpt-4o'];
        } else if (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
            this.currentModel = 'claude-3.5-sonnet';
            this.modelConfig = this.modelPricing['claude-3.5-sonnet'];
        } else if (process.env.GOOGLE_API_KEY) {
            this.currentModel = 'gemini-1.5-flash';
            this.modelConfig = this.modelPricing['gemini-1.5-flash'];
        } else {
            this.currentModel = 'gpt-4';
            this.modelConfig = this.modelPricing['gpt-4'];
        }
    }
    
    _normalizeModelName(modelName) {
        const normalized = modelName.toLowerCase()
            .replace(/[-_.]/g, '-')
            .replace(/\s+/g, '-')
            .replace(/--+/g, '-');
        
        const mapping = {
            'gpt4': 'gpt-4',
            'gpt4turbo': 'gpt-4-turbo',
            'gpt4o': 'gpt-4o',
            'gpt4omini': 'gpt-4o-mini',
            'gpt35turbo': 'gpt-3.5-turbo',
            'gpt35': 'gpt-3.5-turbo',
            'claude3opus': 'claude-3-opus',
            'claude3sonnet': 'claude-3-sonnet',
            'claude3haiku': 'claude-3-haiku',
            'claude35sonnet': 'claude-3.5-sonnet',
            'claude3-5-sonnet': 'claude-3.5-sonnet',
            'gemini15pro': 'gemini-1.5-pro',
            'gemini15flash': 'gemini-1.5-flash',
            'gemini1.5pro': 'gemini-1.5-pro',
            'gemini1.5flash': 'gemini-1.5-flash'
        };
        
        return mapping[normalized.replace(/-/g, '')] || normalized;
    }
    
    _getDefaultModelForProvider(provider) {
        const defaults = {
            'openai': 'gpt-4o',
            'anthropic': 'claude-3.5-sonnet',
            'google': 'gemini-1.5-flash',
            'meta': 'llama-3-70b',
            'mistral': 'mistral-large',
            'deepseek': 'deepseek-coder'
        };
        
        return defaults[provider] || null;
    }
    
    getCurrentModel() {
        return {
            id: this.currentModel,
            ...this.modelConfig
        };
    }
    
    setModel(modelId) {
        const normalized = this._normalizeModelName(modelId);
        if (this.modelPricing[normalized]) {
            this.currentModel = normalized;
            this.modelConfig = this.modelPricing[normalized];
            return true;
        }
        return false;
    }
    
    setCustomModel(modelId, config) {
        if (!config.input || !config.output) {
            throw new Error('Custom model config must include input and output pricing');
        }
        
        this.modelPricing[modelId] = {
            input: config.input,
            output: config.output,
            contextWindow: config.contextWindow || 8192,
            provider: config.provider || 'custom',
            name: config.name || modelId
        };
        
        this.currentModel = modelId;
        this.modelConfig = this.modelPricing[modelId];
        
        return true;
    }
    
    listModels() {
        const models = [];
        for (const [id, config] of Object.entries(this.modelPricing)) {
            models.push({
                id,
                name: config.name,
                provider: config.provider,
                inputPrice: config.input,
                outputPrice: config.output,
                contextWindow: config.contextWindow
            });
        }
        return models.sort((a, b) => a.provider.localeCompare(b.provider));
    }
    
    estimateCostWithCurrentModel(tokens) {
        if (!this.currentModel) {
            this._detectCurrentModel();
        }
        return this.estimateCost(tokens, this.currentModel);
    }
    
    compareModelCosts(tokens, models = null) {
        const modelsToCompare = models || Object.keys(this.modelPricing);
        const results = [];
        
        for (const model of modelsToCompare) {
            if (this.modelPricing[model]) {
                const cost = this.estimateCost(tokens, model);
                results.push({
                    model,
                    ...cost
                });
            }
        }
        
        return results.sort((a, b) => a.total - b.total);
    }
    
    getOptimalModelForBudget(tokens, budget) {
        const costs = this.compareModelCosts(tokens);
        
        const affordable = costs.filter(c => c.total <= budget);
        
        if (affordable.length === 0) {
            return null;
        }
        
        return affordable[affordable.length - 1];
    }
    
    getStats() {
        return { ...this.stats };
    }
    
    reset() {
        this.stats = {
            totalComparisons: 0,
            totalTokensSaved: 0,
            averageSavings: 0
        };
    }
    
    _loadDefaultPricing() {
        return {
            'gpt-4': { 
                input: 0.03, 
                output: 0.06,
                contextWindow: 8192,
                provider: 'openai',
                name: 'GPT-4'
            },
            'gpt-4-turbo': { 
                input: 0.01, 
                output: 0.03,
                contextWindow: 128000,
                provider: 'openai',
                name: 'GPT-4 Turbo'
            },
            'gpt-4o': { 
                input: 0.005, 
                output: 0.015,
                contextWindow: 128000,
                provider: 'openai',
                name: 'GPT-4o'
            },
            'gpt-4o-mini': { 
                input: 0.00015, 
                output: 0.0006,
                contextWindow: 128000,
                provider: 'openai',
                name: 'GPT-4o Mini'
            },
            'gpt-3.5-turbo': { 
                input: 0.0005, 
                output: 0.0015,
                contextWindow: 16385,
                provider: 'openai',
                name: 'GPT-3.5 Turbo'
            },
            'claude-3-opus': { 
                input: 0.015, 
                output: 0.075,
                contextWindow: 200000,
                provider: 'anthropic',
                name: 'Claude 3 Opus'
            },
            'claude-3-sonnet': { 
                input: 0.003, 
                output: 0.015,
                contextWindow: 200000,
                provider: 'anthropic',
                name: 'Claude 3 Sonnet'
            },
            'claude-3-haiku': { 
                input: 0.00025, 
                output: 0.00125,
                contextWindow: 200000,
                provider: 'anthropic',
                name: 'Claude 3 Haiku'
            },
            'claude-3.5-sonnet': { 
                input: 0.003, 
                output: 0.015,
                contextWindow: 200000,
                provider: 'anthropic',
                name: 'Claude 3.5 Sonnet'
            },
            'gemini-pro': { 
                input: 0.00025, 
                output: 0.0005,
                contextWindow: 32760,
                provider: 'google',
                name: 'Gemini Pro'
            },
            'gemini-1.5-pro': { 
                input: 0.0035, 
                output: 0.0105,
                contextWindow: 1000000,
                provider: 'google',
                name: 'Gemini 1.5 Pro'
            },
            'gemini-1.5-flash': { 
                input: 0.000075, 
                output: 0.0003,
                contextWindow: 1000000,
                provider: 'google',
                name: 'Gemini 1.5 Flash'
            },
            'llama-3-70b': { 
                input: 0.0007, 
                output: 0.0009,
                contextWindow: 8192,
                provider: 'meta',
                name: 'Llama 3 70B'
            },
            'llama-3-8b': { 
                input: 0.00005, 
                output: 0.0001,
                contextWindow: 8192,
                provider: 'meta',
                name: 'Llama 3 8B'
            },
            'mistral-large': { 
                input: 0.004, 
                output: 0.012,
                contextWindow: 32768,
                provider: 'mistral',
                name: 'Mistral Large'
            },
            'mistral-medium': { 
                input: 0.0027, 
                output: 0.0081,
                contextWindow: 32768,
                provider: 'mistral',
                name: 'Mistral Medium'
            },
            'deepseek-coder': { 
                input: 0.00014, 
                output: 0.00028,
                contextWindow: 16384,
                provider: 'deepseek',
                name: 'DeepSeek Coder'
            },
            'deepseek-chat': { 
                input: 0.00014, 
                output: 0.00028,
                contextWindow: 64000,
                provider: 'deepseek',
                name: 'DeepSeek Chat'
            }
        };
    }
    
    _loadLocalPricing() {
        try {
            if (fs.existsSync(LOCAL_PRICING_FILE)) {
                const data = fs.readFileSync(LOCAL_PRICING_FILE, 'utf-8');
                const pricing = JSON.parse(data);
                const models = pricing.models || pricing;
                
                for (const [modelId, config] of Object.entries(models)) {
                    this.modelPricing[modelId] = {
                        ...this.modelPricing[modelId],
                        ...config,
                        source: 'local-file',
                        lastUpdated: pricing.timestamp || Date.now()
                    };
                }
                
                this.pricingVersion = pricing.version;
                this.pricingTimestamp = pricing.timestamp;
            }
        } catch (e) {
        }
    }
    
    async updatePricing(options = {}) {
        const url = options.url || DEFAULT_PRICING_URL;
        const forceRefresh = options.force || false;
        
        if (!forceRefresh) {
            const cached = this._loadCachedPricing();
            if (cached && !this._isCacheExpired(cached)) {
                this._applyPricingUpdate(cached.models);
                return {
                    success: true,
                    source: 'cache',
                    timestamp: cached.timestamp,
                    modelsUpdated: Object.keys(cached.models).length
                };
            }
        }
        
        try {
            const remotePricing = await this._fetchRemotePricing(url);
            this._applyPricingUpdate(remotePricing.models);
            this._savePricingCache(remotePricing);
            
            return {
                success: true,
                source: 'remote',
                timestamp: remotePricing.timestamp,
                modelsUpdated: Object.keys(remotePricing.models).length
            };
        } catch (error) {
            const cached = this._loadCachedPricing();
            if (cached) {
                this._applyPricingUpdate(cached.models);
                return {
                    success: true,
                    source: 'cache-fallback',
                    error: error.message,
                    timestamp: cached.timestamp,
                    modelsUpdated: Object.keys(cached.models).length
                };
            }
            
            return {
                success: false,
                source: 'none',
                error: error.message
            };
        }
    }
    
    _fetchRemotePricing(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 10000);
            
            client.get(url, (res) => {
                let data = '';
                
                res.on('data', chunk => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    clearTimeout(timeout);
                    
                    try {
                        const parsed = JSON.parse(data);
                        resolve({
                            models: parsed.models || parsed,
                            timestamp: Date.now(),
                            version: parsed.version || 'unknown'
                        });
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            }).on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }
    
    _loadCachedPricing() {
        try {
            if (!fs.existsSync(PRICING_CACHE_FILE)) {
                return null;
            }
            
            const data = fs.readFileSync(PRICING_CACHE_FILE, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }
    
    _savePricingCache(pricingData) {
        try {
            fs.writeFileSync(PRICING_CACHE_FILE, JSON.stringify(pricingData, null, 2));
        } catch (e) {
        }
    }
    
    _isCacheExpired(cached) {
        if (!cached || !cached.timestamp) return true;
        return Date.now() - cached.timestamp > CACHE_EXPIRY_MS;
    }
    
    _applyPricingUpdate(models) {
        for (const [modelId, config] of Object.entries(models)) {
            if (this.modelPricing[modelId]) {
                this.modelPricing[modelId] = {
                    ...this.modelPricing[modelId],
                    ...config,
                    lastUpdated: Date.now()
                };
            } else {
                this.modelPricing[modelId] = {
                    input: config.input || 0,
                    output: config.output || 0,
                    contextWindow: config.contextWindow || 8192,
                    provider: config.provider || 'unknown',
                    name: config.name || modelId,
                    lastUpdated: Date.now()
                };
            }
        }
    }
    
    setPricingSource(url) {
        this.pricingSourceUrl = url;
    }
    
    getPricingInfo() {
        const info = {
            cacheFile: PRICING_CACHE_FILE,
            cacheExpiry: CACHE_EXPIRY_MS / 1000 / 60 / 60 + ' hours',
            models: {}
        };
        
        for (const [id, config] of Object.entries(this.modelPricing)) {
            info.models[id] = {
                name: config.name,
                lastUpdated: config.lastUpdated || 'builtin',
                isStale: config.lastUpdated ? 
                    (Date.now() - config.lastUpdated > CACHE_EXPIRY_MS) : false
            };
        }
        
        return info;
    }
    
    exportPricing() {
        const exported = {
            version: '1.0',
            timestamp: Date.now(),
            models: {}
        };
        
        for (const [id, config] of Object.entries(this.modelPricing)) {
            exported.models[id] = {
                input: config.input,
                output: config.output,
                contextWindow: config.contextWindow,
                provider: config.provider,
                name: config.name
            };
        }
        
        return exported;
    }
    
    importPricing(data, merge = true) {
        try {
            const pricing = typeof data === 'string' ? JSON.parse(data) : data;
            const models = pricing.models || pricing;
            
            if (!merge) {
                this.modelPricing = {};
            }
            
            this._applyPricingUpdate(models);
            
            return {
                success: true,
                modelsImported: Object.keys(models).length
            };
        } catch (e) {
            return {
                success: false,
                error: e.message
            };
        }
    }
    
    addModel(modelId, config) {
        return this.setCustomModel(modelId, config);
    }
    
    removeModel(modelId) {
        if (this.modelPricing[modelId]) {
            delete this.modelPricing[modelId];
            if (this.currentModel === modelId) {
                this._detectCurrentModel();
            }
            return true;
        }
        return false;
    }
    
    async checkForUpdates() {
        const cached = this._loadCachedPricing();
        const currentTimestamp = cached?.timestamp || 0;
        
        try {
            const remote = await this._fetchRemotePricing(DEFAULT_PRICING_URL);
            
            return {
                hasUpdate: remote.timestamp > currentTimestamp,
                currentVersion: cached?.version || 'unknown',
                latestVersion: remote.version,
                lastChecked: Date.now()
            };
        } catch (e) {
            return {
                hasUpdate: false,
                error: e.message,
                lastChecked: Date.now()
            };
        }
    }
}

module.exports = { TokenCounter };
