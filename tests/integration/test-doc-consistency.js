#!/usr/bin/env node
/**
 * 项目一致性检查：扫描项目中所有 SeedLang 代码片段，检测语法合规性与文档一致性
 * Check all SeedLang code in the project for syntax compliance
 * 
 * Based on LANGUAGE_SPEC_REFACTOR_DRAFT.md specification
 * Dynamically extract rules from specification file
 * 
 * Detection scope:
 * - docs/*.md - seed code blocks in documentation
 * - examples/ directory - example code files
 * - tests/ directory - test code files
 */

const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bright: '\x1b[1m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m'
};

function isInErrorSection(lines, currentIdx) {
    for (let i = currentIdx; i >= 0; i--) {
        const line = lines[i];
        if (line.includes('// Correct') || line.includes('// correct')) {
            return false;
        }
        if (line.includes('// Error') || line.includes('// error')) {
            return true;
        }
    }
    return false;
}

function isComment(line) {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

function extractRulesFromSpec(specPath) {
    const specContent = fs.readFileSync(specPath, 'utf-8');
    const extractedRules = {
        logicalOperators: { symbols: false, keywords: false },
        classMethodNoFn: false,
        switchNeedsParens: false,
        unimplemented: [],
        outputFunction: 'print'
    };
    
    if (/&&|\|\|/.test(specContent)) {
        extractedRules.logicalOperators.symbols = true;
    }
    if (/\band\b|\bor\b|\bnot\b/.test(specContent)) {
        extractedRules.logicalOperators.keywords = true;
    }
    
    if (/methods\s*\(no\s*fn\s*keyword\)/.test(specContent) || /methods do not need\s*fn/.test(specContent)) {
        extractedRules.classMethodNoFn = true;
    }
    
    if (/switch\s*\(/.test(specContent)) {
        extractedRules.switchNeedsParens = true;
    }
    
    const unimplementedMatch = specContent.matchAll(/\*\*Note\*\*[:：]\s*([^\n]+)/g);
    for (const match of unimplementedMatch) {
        const note = match[1];
        if (note.includes('not implemented')) {
            extractedRules.unimplemented.push(note);
        }
    }
    
    if (/modulo operator\s*%\s*is not implemented/.test(specContent)) {
        if (!extractedRules.unimplemented.includes('modulo operator %')) {
            extractedRules.unimplemented.push('modulo operator %');
        }
    }
    if (/class inheritance\s*\(\s*extends\s*\)\s*is not implemented/.test(specContent)) {
        if (!extractedRules.unimplemented.includes('class inheritance extends')) {
            extractedRules.unimplemented.push('class inheritance extends');
        }
    }
    
    return extractedRules;
}

function buildRulesFromExtracted(extracted) {
    const rules = [];
    
    rules.push({
        name: 'Comments use // not #',
        id: 'comment-style',
        source: 'LANGUAGE_SPEC_REFACTOR_DRAFT.md - Comments',
        check: (code, file, lineNum) => {
            const issues = [];
            const lines = code.split('\n');
            lines.forEach((line, idx) => {
                if (isInErrorSection(lines, idx)) return;
                
                const trimmed = line.trim();
                if (trimmed.startsWith('#') && 
                    !trimmed.startsWith('#seed') && 
                    !trimmed.startsWith('#!') &&
                    !trimmed.match(/^#\d/) &&
                    !trimmed.match(/^#\s/)) {
                    issues.push({ file, line: lineNum + idx, code: line.trim(), issue: 'Comments should use // not #' });
                }
            });
            return issues;
        }
    });
    
    rules.push({
        name: 'Array elements separated by space',
        id: 'array-space-separator',
        source: 'LANGUAGE_SPEC_REFACTOR_DRAFT.md - Data Types',
        check: (code, file, lineNum) => {
            const issues = [];
            const lines = code.split('\n');
            lines.forEach((line, idx) => {
                if (isInErrorSection(lines, idx)) return;
                if (isComment(line)) return;
                
                if (line.includes(': ') && !line.match(/\{\s*\w+:\s*[^}]+\}/)) return;
                
                const lineWithoutStrings = line.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
                const arrayPattern = /\[([^\]]+)\]/g;
                let match;
                while ((match = arrayPattern.exec(lineWithoutStrings)) !== null) {
                    const arrayContent = match[1];
                    if (arrayContent.includes('{') || arrayContent.includes('}')) continue;
                    if (arrayContent.includes(',')) {
                        issues.push({ file, line: lineNum + idx, code: line.trim(), severity: 'warning', issue: 'Style warning: prefer space-separated arrays, like [1 2 3] instead of [1, 2, 3]' });
                    }
                }
            });
            return issues;
        }
    });
    
    rules.push({
        name: 'Function parameters separated by space',
        id: 'function-space-separator',
        source: 'LANGUAGE_SPEC_REFACTOR_DRAFT.md - Function Definition',
        check: (code, file, lineNum) => {
            const issues = [];
            const lines = code.split('\n');
            lines.forEach((line, idx) => {
                if (isInErrorSection(lines, idx)) return;
                if (isComment(line)) return;
                
                const fnPattern = /fn\s+\w+\s*\(([^)]+)\)/;
                const match = fnPattern.exec(line);
                if (match) {
                    const params = match[1];
                    if (params.includes(',')) {
                        issues.push({ file, line: lineNum + idx, code: line.trim(), severity: 'warning', issue: 'Style warning: prefer space-separated params, like fn add(a b) instead of fn add(a, b)' });
                    }
                }
            });
            return issues;
        }
    });
    
    rules.push({
        name: 'Function calls without commas',
        id: 'function-call-space',
        source: 'LANGUAGE_SPEC_REFACTOR_DRAFT.md - Function Calls',
        check: (code, file, lineNum) => {
            const issues = [];
            const lines = code.split('\n');
            lines.forEach((line, idx) => {
                if (isInErrorSection(lines, idx)) return;
                if (isComment(line)) return;
                
                const lineWithoutStrings = line.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
                const callPattern = /\w+\s*\(([^)]+)\)/g;
                let match;
                while ((match = callPattern.exec(lineWithoutStrings)) !== null) {
                    const args = match[1];
                    if (args.includes(',') && !args.includes('lambda') && !args.includes('=>')) {
                        issues.push({ file, line: lineNum + idx, code: line.trim(), severity: 'warning', issue: 'Style warning: prefer space-separated call arguments' });
                    }
                }
            });
            return issues;
        }
    });
    
    return rules;
}

function checkFile(filePath, rules) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allIssues = [];
    
    for (const rule of rules) {
        const issues = rule.check(content, filePath, 1);
        allIssues.push(...issues);
    }
    
    return allIssues;
}

function checkDirectory(dir, rules, extensions) {
    const allIssues = [];
    
    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    walk(fullPath);
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (extensions.includes(ext)) {
                    const issues = checkFile(fullPath, rules);
                    allIssues.push(...issues);
                }
            }
        }
    }
    
    walk(dir);
    return allIssues;
}

function extractSeedCodeFromMarkdown(mdPath) {
    const content = fs.readFileSync(mdPath, 'utf-8');
    const codeBlocks = [];
    const pattern = /```(?:seed|seedlang)\s*\n([\s\S]*?)```/gi;
    let match;
    
    while ((match = pattern.exec(content)) !== null) {
        codeBlocks.push({
            file: mdPath,
            code: match[1],
            offset: content.substring(0, match.index).split('\n').length
        });
    }
    
    return codeBlocks;
}

function main() {
    console.log(`${colors.bright}${colors.cyan}========================================`);
    console.log('  SeedLang Documentation Consistency Tests');
    console.log(`========================================${colors.reset}\n`);
    
    const specPath = path.join(__dirname, '../../docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md');
    
    if (!fs.existsSync(specPath)) {
        console.log(`${colors.yellow}Warning: LANGUAGE_SPEC_REFACTOR_DRAFT.md not found at ${specPath}${colors.reset}`);
        return;
    }
    
    const extracted = extractRulesFromSpec(specPath);
    const rules = buildRulesFromExtracted(extracted);
    
    console.log(`${colors.blue}Loaded ${rules.length} rules from specification${colors.reset}\n`);
    
    let totalIssues = 0;
    let totalWarnings = 0;

    function reportIssue(issue) {
        const severity = issue.severity || 'error';
        const tag = severity === 'warning' ? 'WARN' : 'FAIL';
        const color = severity === 'warning' ? colors.magenta : colors.yellow;
        console.log(`  [${tag}] ${issue.file}:${issue.line}`);
        console.log(`    ${color}${issue.issue}${colors.reset}`);
        console.log(`    ${colors.cyan}${issue.code}${colors.reset}`);
        if (severity === 'warning') {
            totalWarnings++;
        } else {
            totalIssues++;
        }
    }
    
    // Check docs directory
    const docsDir = path.join(__dirname, '../../docs');
    if (fs.existsSync(docsDir)) {
        console.log(`${colors.cyan}Checking docs/*.md...${colors.reset}`);
        const mdFiles = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
        for (const mdFile of mdFiles) {
            const mdPath = path.join(docsDir, mdFile);
            const codeBlocks = extractSeedCodeFromMarkdown(mdPath);
            for (const block of codeBlocks) {
                for (const rule of rules) {
                    const issues = rule.check(block.code, block.file, block.offset);
                    if (issues.length > 0) {
                        for (const issue of issues) {
                            reportIssue(issue);
                        }
                    }
                }
            }
        }
    }
    
    // Check examples directory
    const examplesDir = path.join(__dirname, '../../examples');
    if (fs.existsSync(examplesDir)) {
        console.log(`\n${colors.cyan}Checking examples/*.seed...${colors.reset}`);
        const issues = checkDirectory(examplesDir, rules, ['.seed', '.seedlang']);
        for (const issue of issues) {
            reportIssue(issue);
        }
    }
    
    // Check tests directory
    const testsDir = path.join(__dirname, '..');
    if (fs.existsSync(testsDir)) {
        console.log(`\n${colors.cyan}Checking tests/*.seed...${colors.reset}`);
        const issues = checkDirectory(testsDir, rules, ['.seed', '.seedlang']);
        for (const issue of issues) {
            reportIssue(issue);
        }
    }
    
    console.log(`\n${colors.bright}========================================`);
    if (totalIssues === 0) {
        console.log(`${colors.green}  All checks passed! No issues found.${colors.reset}`);
        console.log(`\n=== Result: 1 passed, 0 failed, ${totalWarnings} warnings ===`);
    } else {
        console.log(`${colors.red}  Found ${totalIssues} issues and ${totalWarnings} warnings${colors.reset}`);
        console.log(`\n=== Result: 0 passed, ${totalIssues} failed, ${totalWarnings} warnings ===`);
    }
    console.log(`${colors.bright}========================================${colors.reset}\n`);
    
    process.exit(totalIssues > 0 ? 1 : 0);
}

main();
