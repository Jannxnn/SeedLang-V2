#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class SeedDocGenerator {
    constructor(options = {}) {
        this.inputDir = options.inputDir || process.cwd();
        this.outputDir = options.outputDir || path.join(process.cwd(), 'docs');
        this.template = options.template || 'default';
        this.format = options.format || 'markdown';
        
        this.functions = [];
        this.classes = [];
        this.modules = [];
        this.constants = [];
    }
    
    generate() {
        console.log('Generating documentation...');
        
        this.scanFiles();
        this.parseComments();
        this.generateDocs();
        
        console.log('✓ Documentation generated successfully');
    }
    
    scanFiles() {
        console.log('Scanning files...');
        
        const files = this.findSeedFiles(this.inputDir);
        
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            this.parseFile(file, content);
        }
        
        console.log(`  Found ${files.length} files`);
        console.log(`  Found ${this.functions.length} functions`);
        console.log(`  Found ${this.classes.length} classes`);
        console.log(`  Found ${this.modules.length} modules`);
    }
    
    findSeedFiles(dir) {
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === 'seed_modules') {
                    continue;
                }
                files.push(...this.findSeedFiles(fullPath));
            } else if (entry.name.endsWith('.seed')) {
                files.push(fullPath);
            }
        }
        
        return files;
    }
    
    parseFile(filePath, content) {
        const lines = content.split('\n');
        let currentComment = null;
        let currentFunction = null;
        let currentClass = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('#')) {
                if (!currentComment) {
                    currentComment = {
                        file: filePath,
                        line: i + 1,
                        text: line.substring(1).trim()
                    };
                } else {
                    currentComment.text += '\n' + line.substring(1).trim();
                }
            } else if (line.startsWith('fn ') || line.startsWith('function ')) {
                const func = this.parseFunction(line, filePath, i + 1);
                
                if (currentComment) {
                    func.description = currentComment.text;
                    currentComment = null;
                }
                
                if (currentClass) {
                    func.class = currentClass.name;
                    currentClass.methods.push(func);
                } else {
                    this.functions.push(func);
                }
                
                currentFunction = func;
            } else if (line.startsWith('class ')) {
                const cls = this.parseClass(line, filePath, i + 1);
                
                if (currentComment) {
                    cls.description = currentComment.text;
                    currentComment = null;
                }
                
                this.classes.push(cls);
                currentClass = cls;
            } else if (line.startsWith('module ') || line.startsWith('export ')) {
                const mod = this.parseModule(line, filePath, i + 1);
                
                if (currentComment) {
                    mod.description = currentComment.text;
                    currentComment = null;
                }
                
                this.modules.push(mod);
            } else if (line.startsWith('const ') || line.startsWith('let ')) {
                const constant = this.parseConstant(line, filePath, i + 1);
                
                if (currentComment) {
                    constant.description = currentComment.text;
                    currentComment = null;
                }
                
                this.constants.push(constant);
            } else if (line && !line.startsWith('#')) {
                currentComment = null;
            }
        }
    }
    
    parseFunction(line, file, lineNum) {
        const match = line.match(/(?:fn|function)\s+(\w+)\s*\(([^)]*)\)/);
        
        if (!match) {
            return {
                name: 'unknown',
                params: [],
                file,
                line: lineNum
            };
        }
        
        const name = match[1];
        const paramsStr = match[2];
        const params = paramsStr ? paramsStr.split(',').map(p => {
            const parts = p.trim().split(':');
            return {
                name: parts[0].trim(),
                type: parts[1] ? parts[1].trim() : 'any'
            };
        }) : [];
        
        return {
            name,
            params,
            file,
            line: lineNum,
            description: ''
        };
    }
    
    parseClass(line, file, lineNum) {
        const match = line.match(/class\s+(\w+)(?:\s+extends\s+(\w+))?/);
        
        if (!match) {
            return {
                name: 'unknown',
                methods: [],
                properties: [],
                file,
                line: lineNum
            };
        }
        
        return {
            name: match[1],
            extends: match[2] || null,
            methods: [],
            properties: [],
            file,
            line: lineNum,
            description: ''
        };
    }
    
    parseModule(line, file, lineNum) {
        const match = line.match(/(?:module|export)\s+(\w+)/);
        
        return {
            name: match ? match[1] : 'unknown',
            file,
            line: lineNum,
            description: ''
        };
    }
    
    parseConstant(line, file, lineNum) {
        const match = line.match(/(?:const|let)\s+(\w+)\s*=\s*(.+)/);
        
        return {
            name: match ? match[1] : 'unknown',
            value: match ? match[2].trim() : '',
            file,
            line: lineNum,
            description: ''
        };
    }
    
    parseComments() {
        console.log('Parsing comments...');
    }
    
    generateDocs() {
        console.log('Generating documentation files...');
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        this.generateIndex();
        this.generateAPIReference();
        this.generateClassReference();
        this.generateModuleReference();
        this.generateSearchIndex();
    }
    
    generateIndex() {
        const content = `# ${path.basename(this.inputDir)} Documentation

## Overview

- **Functions**: ${this.functions.length}
- **Classes**: ${this.classes.length}
- **Modules**: ${this.modules.length}
- **Constants**: ${this.constants.length}

## Quick Links

${this.functions.length > 0 ? `- [Functions](api-reference.md#functions)` : ''}
${this.classes.length > 0 ? `- [Classes](classes.md)` : ''}
${this.modules.length > 0 ? `- [Modules](modules.md)` : ''}

## Installation

\`\`\`bash
seed install ${path.basename(this.inputDir)}
\`\`\`

## Usage

\`\`\`seed
# Import the module
import ${path.basename(this.inputDir)}

# Use functions
result = functionName(param1, param2)
\`\`\`

## License

MIT
`;
        
        fs.writeFileSync(path.join(this.outputDir, 'README.md'), content);
        console.log('  ✓ Generated README.md');
    }
    
    generateAPIReference() {
        if (this.functions.length === 0) {
            return;
        }
        
        let content = `# API Reference

## Functions

`;
        
        for (const func of this.functions) {
            content += `### ${func.name}\n\n`;
            
            if (func.description) {
                content += `${func.description}\n\n`;
            }
            
            const params = func.params.map(p => `${p.name}: ${p.type}`).join(', ');
            content += `**Signature:**\n\`\`\`seed\nfn ${func.name}(${params})\n\`\`\`\n\n`;
            
            if (func.params.length > 0) {
                content += '**Parameters:**\n\n';
                for (const param of func.params) {
                    content += `- \`${param.name}\` (${param.type})\n`;
                }
                content += '\n';
            }
            
            content += `**Location:** [${func.file}:${func.line}](${func.file}#L${func.line})\n\n`;
            content += '---\n\n';
        }
        
        fs.writeFileSync(path.join(this.outputDir, 'api-reference.md'), content);
        console.log('  ✓ Generated api-reference.md');
    }
    
    generateClassReference() {
        if (this.classes.length === 0) {
            return;
        }
        
        let content = `# Classes

`;
        
        for (const cls of this.classes) {
            content += `## ${cls.name}\n\n`;
            
            if (cls.description) {
                content += `${cls.description}\n\n`;
            }
            
            if (cls.extends) {
                content += `**Extends:** ${cls.extends}\n\n`;
            }
            
            if (cls.methods.length > 0) {
                content += '### Methods\n\n';
                for (const method of cls.methods) {
                    const params = method.params.map(p => `${p.name}: ${p.type}`).join(', ');
                    content += `#### ${method.name}(${params})\n\n`;
                    
                    if (method.description) {
                        content += `${method.description}\n\n`;
                    }
                }
            }
            
            content += `**Location:** [${cls.file}:${cls.line}](${cls.file}#L${cls.line})\n\n`;
            content += '---\n\n';
        }
        
        fs.writeFileSync(path.join(this.outputDir, 'classes.md'), content);
        console.log('  ✓ Generated classes.md');
    }
    
    generateModuleReference() {
        if (this.modules.length === 0) {
            return;
        }
        
        let content = `# Modules

`;
        
        for (const mod of this.modules) {
            content += `## ${mod.name}\n\n`;
            
            if (mod.description) {
                content += `${mod.description}\n\n`;
            }
            
            content += `**Location:** [${mod.file}:${mod.line}](${mod.file}#L${mod.line})\n\n`;
            content += '---\n\n';
        }
        
        fs.writeFileSync(path.join(this.outputDir, 'modules.md'), content);
        console.log('  ✓ Generated modules.md');
    }
    
    generateSearchIndex() {
        const index = {
            functions: this.functions.map(f => ({
                name: f.name,
                description: f.description,
                url: `api-reference.md#${f.name.toLowerCase()}`
            })),
            classes: this.classes.map(c => ({
                name: c.name,
                description: c.description,
                url: `classes.md#${c.name.toLowerCase()}`
            })),
            modules: this.modules.map(m => ({
                name: m.name,
                description: m.description,
                url: `modules.md#${m.name.toLowerCase()}`
            }))
        };
        
        fs.writeFileSync(
            path.join(this.outputDir, 'search-index.json'),
            JSON.stringify(index, null, 2)
        );
        console.log('  ✓ Generated search-index.json');
    }
}

const command = process.argv[2];
const args = process.argv.slice(3);

const options = {
    inputDir: args[0] || process.cwd(),
    outputDir: args[1] || path.join(process.cwd(), 'docs'),
    format: 'markdown'
};

const generator = new SeedDocGenerator(options);

switch (command) {
    case 'generate':
    case 'gen':
        generator.generate();
        break;
    default:
        console.log(`
SeedLang Documentation Generator

Usage:
  seed-doc generate [input] [output]    Generate documentation

Options:
  -f, --format <format>                 Output format (markdown, html)
  -t, --template <template>             Template name

Examples:
  seed-doc generate ./src ./docs
  seed-doc generate
        `);
}

module.exports = { SeedDocGenerator };
