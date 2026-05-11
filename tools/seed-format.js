#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class SeedFormatter {
    constructor(options = {}) {
        this.indentSize = options.indentSize || 4;
        this.indentStyle = options.indentStyle || 'space';
        this.maxLineLength = options.maxLineLength || 100;
        this.semicolons = options.semicolons !== false;
        this.quoteStyle = options.quoteStyle || 'single';
        this.trailingComma = options.trailingComma !== false;
        this.braceStyle = options.braceStyle || 'same-line';
        
        this.indentChar = this.indentStyle === 'tab' ? '\t' : ' '.repeat(this.indentSize);
    }
    
    format(code) {
        const lines = code.split('\n');
        const formatted = [];
        let indentLevel = 0;
        let inString = false;
        let stringChar = null;
        let inComment = false;
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const originalLine = line;
            
            line = this.trimLine(line);
            
            if (line === '') {
                formatted.push('');
                continue;
            }
            
            const decreaseIndent = this.shouldDecreaseIndent(line);
            if (decreaseIndent) {
                indentLevel = Math.max(0, indentLevel - 1);
            }
            
            line = this.addIndent(line, indentLevel);
            
            line = this.formatLine(line, indentLevel);
            
            const increaseIndent = this.shouldIncreaseIndent(line);
            if (increaseIndent) {
                indentLevel++;
            }
            
            formatted.push(line);
        }
        
        return formatted.join('\n');
    }
    
    trimLine(line) {
        return line.trim();
    }
    
    addIndent(line, level) {
        return this.indentChar.repeat(level) + line;
    }
    
    shouldDecreaseIndent(line) {
        const trimmed = line.trim();
        return trimmed.startsWith('}') || 
               trimmed.startsWith(']') || 
               trimmed.startsWith(')') ||
               trimmed.startsWith('end') ||
               trimmed.startsWith('elif') ||
               trimmed.startsWith('else') ||
               trimmed.startsWith('catch') ||
               trimmed.startsWith('finally');
    }
    
    shouldIncreaseIndent(line) {
        const trimmed = line.trim();
        return (trimmed.endsWith('{') && !trimmed.includes('}')) ||
               (trimmed.endsWith('[') && !trimmed.includes(']')) ||
               (trimmed.endsWith('(') && !trimmed.includes(')')) ||
               trimmed.startsWith('if ') ||
               trimmed.startsWith('elif ') ||
               trimmed.startsWith('else') ||
               trimmed.startsWith('for ') ||
               trimmed.startsWith('while ') ||
               trimmed.startsWith('fn ') ||
               trimmed.startsWith('function ') ||
               trimmed.startsWith('class ') ||
               trimmed.startsWith('try') ||
               trimmed.startsWith('catch') ||
               trimmed.startsWith('finally');
    }
    
    formatLine(line, indentLevel) {
        line = this.formatSpaces(line);
        
        line = this.formatOperators(line);
        
        line = this.formatBrackets(line);
        
        line = this.formatStrings(line);
        
        line = this.formatComments(line);
        
        return line;
    }
    
    formatSpaces(line) {
        line = line.replace(/\s+/g, ' ');
        
        line = line.replace(/\s*([{}()\[\]])\s*/g, '$1');
        
        line = line.replace(/\s*([+\-*/%=<>!&|?:])\s*/g, ' $1 ');
        
        line = line.replace(/,\s*/g, ', ');
        
        line = line.replace(/\s*:\s*/g, ': ');
        
        line = line.replace(/^\s+/, '');
        
        return line;
    }
    
    formatOperators(line) {
        line = line.replace(/\s*=\s*/g, ' = ');
        line = line.replace(/\s*==\s*/g, ' == ');
        line = line.replace(/\s*!=\s*/g, ' != ');
        line = line.replace(/\s*<=\s*/g, ' <= ');
        line = line.replace(/\s*>=\s*/g, ' >= ');
        line = line.replace(/\s*\+=\s*/g, ' += ');
        line = line.replace(/\s*-=\s*/g, ' -= ');
        line = line.replace(/\s*\*=\s*/g, ' *= ');
        line = line.replace(/\s*\/=\s*/g, ' /= ');
        
        return line;
    }
    
    formatBrackets(line) {
        line = line.replace(/\(\s+/g, '(');
        line = line.replace(/\s+\)/g, ')');
        line = line.replace(/\[\s+/g, '[');
        line = line.replace(/\s+\]/g, ']');
        line = line.replace(/\{\s+/g, '{ ');
        line = line.replace(/\s+\}/g, ' }');
        
        return line;
    }
    
    formatStrings(line) {
        if (this.quoteStyle === 'single') {
            line = line.replace(/"/g, "'");
        } else {
            line = line.replace(/'/g, '"');
        }
        
        return line;
    }
    
    formatComments(line) {
        line = line.replace(/\/\/\s*/g, '// ');
        line = line.replace(/#\s*/g, '# ');
        
        return line;
    }
    
    formatFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const formatted = this.format(content);
        
        if (formatted !== content) {
            fs.writeFileSync(filePath, formatted);
            console.log(`✓ Formatted ${filePath}`);
            return true;
        }
        
        return false;
    }
    
    formatDirectory(dir) {
        const files = this.findSeedFiles(dir);
        let formattedCount = 0;
        
        for (const file of files) {
            if (this.formatFile(file)) {
                formattedCount++;
            }
        }
        
        console.log(`\nFormatted ${formattedCount} of ${files.length} files`);
    }
    
    findSeedFiles(dir) {
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || 
                    entry.name === 'seed_modules' ||
                    entry.name === 'dist' ||
                    entry.name === 'build') {
                    continue;
                }
                files.push(...this.findSeedFiles(fullPath));
            } else if (entry.name.endsWith('.seed')) {
                files.push(fullPath);
            }
        }
        
        return files;
    }
    
    check(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const formatted = this.format(content);
        
        if (formatted !== content) {
            console.log(`${filePath} needs formatting`);
            return false;
        }
        
        return true;
    }
    
    checkDirectory(dir) {
        const files = this.findSeedFiles(dir);
        let needsFormatting = [];
        
        for (const file of files) {
            if (!this.check(file)) {
                needsFormatting.push(file);
            }
        }
        
        if (needsFormatting.length > 0) {
            console.log(`\n${needsFormatting.length} files need formatting:`);
            for (const file of needsFormatting) {
                console.log(`  ${file}`);
            }
            return false;
        } else {
            console.log('All files are formatted correctly');
            return true;
        }
    }
}

const configPath = path.join(process.cwd(), '.seedformat');
let config = {};

if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

const formatter = new SeedFormatter(config);

const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
    case 'format':
    case 'fmt':
        if (args.length === 0) {
            formatter.formatDirectory(process.cwd());
        } else {
            const target = path.resolve(args[0]);
            if (fs.statSync(target).isDirectory()) {
                formatter.formatDirectory(target);
            } else {
                formatter.formatFile(target);
            }
        }
        break;
        
    case 'check':
        if (args.length === 0) {
            formatter.checkDirectory(process.cwd());
        } else {
            const target = path.resolve(args[0]);
            if (fs.statSync(target).isDirectory()) {
                formatter.checkDirectory(target);
            } else {
                formatter.check(target);
            }
        }
        break;
        
    case 'init':
        const defaultConfig = {
            indentSize: 4,
            indentStyle: 'space',
            maxLineLength: 100,
            semicolons: false,
            quoteStyle: 'single',
            trailingComma: true,
            braceStyle: 'same-line'
        };
        
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        console.log('✓ Created .seedformat');
        break;
        
    default:
        console.log(`
SeedLang Code Formatter

Usage:
  seed-format format [file|dir]    Format code
  seed-format check [file|dir]     Check formatting
  seed-format init                 Create config file

Options:
  --indent-size <n>                Indentation size (default: 4)
  --indent-style <style>           Indentation style: space or tab (default: space)
  --max-line-length <n>            Maximum line length (default: 100)
  --quote-style <style>            Quote style: single or double (default: single)
  --trailing-comma                 Add trailing commas (default: true)
  --brace-style <style>            Brace style: same-line or new-line (default: same-line)

Examples:
  seed-format format
  seed-format format ./src
  seed-format check
  seed-format init
        `);
}

module.exports = { SeedFormatter };
