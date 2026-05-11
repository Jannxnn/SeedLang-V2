import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

let outputChannel: vscode.OutputChannel;
let terminal: vscode.Terminal | undefined;
let seedVM: any = null;

const KEYWORDS = [
    'fn', 'if', 'else', 'while', 'for', 'return', 'break', 'continue',
    'true', 'false', 'null', 'import', 'export', 'class', 'try', 'catch',
    'async', 'await', 'switch', 'case', 'default', 'interface', 'type'
];

const BUILTIN_FUNCTIONS = [
    { name: 'print', detail: 'print(value)', doc: 'Print output to console' },
    { name: 'len', detail: 'len(array|string)', doc: 'Return length of array or string' },
    { name: 'push', detail: 'push(array, value)', doc: 'Add element to end of array' },
    { name: 'pop', detail: 'pop(array)', doc: 'Remove and return last element of array' },
    { name: 'map', detail: 'map(array, fn)', doc: 'Apply function to each element' },
    { name: 'filter', detail: 'filter(array, fn)', doc: 'Filter array elements' },
    { name: 'reduce', detail: 'reduce(array, fn, init)', doc: 'Reduce array to single value' },
    { name: 'sort', detail: 'sort(array)', doc: 'Sort array' },
    { name: 'reverse', detail: 'reverse(array)', doc: 'Reverse array' },
    { name: 'join', detail: 'join(array, sep)', doc: 'Join array elements with separator' },
    { name: 'split', detail: 'split(string, sep)', doc: 'Split string by separator' },
    { name: 'trim', detail: 'trim(string)', doc: 'Remove whitespace from both ends' },
    { name: 'upper', detail: 'upper(string)', doc: 'Convert to uppercase' },
    { name: 'lower', detail: 'lower(string)', doc: 'Convert to lowercase' },
    { name: 'replace', detail: 'replace(str, old, new)', doc: 'Replace string' },
    { name: 'indexOf', detail: 'indexOf(str, search)', doc: 'Find substring position' },
    { name: 'substring', detail: 'substring(str, start, end)', doc: 'Extract substring' },
    { name: 'first', detail: 'first(array)', doc: 'Return first element of array' },
    { name: 'last', detail: 'last(array)', doc: 'Return last element of array' },
    { name: 'unique', detail: 'unique(array)', doc: 'Remove duplicates from array' },
    { name: 'keys', detail: 'keys(object)', doc: 'Get all keys of object' },
    { name: 'values', detail: 'values(object)', doc: 'Get all values of object' },
    { name: 'has', detail: 'has(object, key)', doc: 'Check if object has key' },
    { name: 'toString', detail: 'toString(value)', doc: 'Convert to string' },
    { name: 'toInt', detail: 'toInt(value)', doc: 'Convert to integer' },
    { name: 'toFloat', detail: 'toFloat(value)', doc: 'Convert to float' },
    { name: 'toBool', detail: 'toBool(value)', doc: 'Convert to boolean' },
    { name: 'typeOf', detail: 'typeOf(value)', doc: 'Get type of value' },
    { name: 'sin', detail: 'sin(x)', doc: 'Sine function' },
    { name: 'cos', detail: 'cos(x)', doc: 'Cosine function' },
    { name: 'tan', detail: 'tan(x)', doc: 'Tangent function' },
    { name: 'sqrt', detail: 'sqrt(x)', doc: 'Square root' },
    { name: 'pow', detail: 'pow(base, exp)', doc: 'Power function' },
    { name: 'abs', detail: 'abs(x)', doc: 'Absolute value' },
    { name: 'round', detail: 'round(x)', doc: 'Round to nearest integer' },
    { name: 'floor', detail: 'floor(x)', doc: 'Round down to integer' },
    { name: 'ceil', detail: 'ceil(x)', doc: 'Round up to integer' },
    { name: 'random', detail: 'random()', doc: 'Generate random number 0-1' },
    { name: 'randomInt', detail: 'randomInt(min, max)', doc: 'Generate random integer in range' },
    { name: 'min', detail: 'min(array)', doc: 'Minimum value' },
    { name: 'max', detail: 'max(array)', doc: 'Maximum value' },
    { name: 'date', detail: 'date()', doc: 'Get current date' },
    { name: 'time', detail: 'time()', doc: 'Get current time' },
    { name: 'timestamp', detail: 'timestamp()', doc: 'Get timestamp' },
    { name: 'sleep', detail: 'sleep(ms)', doc: 'Pause execution for milliseconds' },
    { name: 'range', detail: 'range(start, end, step)', doc: 'Generate number sequence' },
    { name: 'clone', detail: 'clone(value)', doc: 'Deep clone' },
    { name: 'merge', detail: 'merge(obj1, obj2)', doc: 'Merge objects' },
    { name: 'isEmpty', detail: 'isEmpty(value)', doc: 'Check if empty' },
    { name: ' PI', detail: 'PI', doc: 'Pi constant' },
    { name: 'E', detail: 'E', doc: 'Euler number constant' },
];

export function activate(context: vscode.ExtensionContext) {
    console.log('SeedLang extension is now active!');

    outputChannel = vscode.window.createOutputChannel('SeedLang');
    context.subscriptions.push(outputChannel);

    checkAndPromptForAIConfig(context);

    const runCommand = vscode.commands.registerCommand('seedlang.run', () => {
        runCurrentFile();
    });

    const replCommand = vscode.commands.registerCommand('seedlang.repl', () => {
        openRepl();
    });

    const compileCommand = vscode.commands.registerCommand('seedlang.compile', () => {
        compileToJS();
    });

    const formatCommand = vscode.commands.registerCommand('seedlang.format', () => {
        formatDocument();
    });

    const lintCommand = vscode.commands.registerCommand('seedlang.lint', () => {
        lintDocument();
    });

    const initAIConfigCommand = vscode.commands.registerCommand('seedlang.initAIConfig', () => {
        createAIConfigFiles();
    });

    context.subscriptions.push(runCommand, replCommand, compileCommand, formatCommand, lintCommand, initAIConfigCommand);

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'seedlang',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const items: vscode.CompletionItem[] = [];
                
                for (const keyword of KEYWORDS) {
                    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                    item.detail = 'Keyword';
                    items.push(item);
                }
                
                for (const fn of BUILTIN_FUNCTIONS) {
                    const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
                    item.detail = fn.detail;
                    item.documentation = new vscode.MarkdownString(fn.doc);
                    item.insertText = new vscode.SnippetString(`${fn.name}($1)`);
                    items.push(item);
                }
                
                return items;
            }
        },
        '.',
        ' ',
        '('
    );
    context.subscriptions.push(completionProvider);

    const hoverProvider = vscode.languages.registerHoverProvider(
        'seedlang',
        {
            provideHover(document: vscode.TextDocument, position: vscode.Position) {
                const range = document.getWordRangeAtPosition(position);
                if (!range) return undefined;
                
                const word = document.getText(range);
                
                const builtin = BUILTIN_FUNCTIONS.find(f => f.name === word);
                if (builtin) {
                    const markdown = new vscode.MarkdownString();
                    markdown.appendMarkdown(`**${builtin.detail}**\n\n`);
                    markdown.appendMarkdown(builtin.doc);
                    return new vscode.Hover(markdown, range);
                }
                
                if (KEYWORDS.includes(word)) {
                    return new vscode.Hover(`**${word}** - Keyword`, range);
                }
                
                return undefined;
            }
        }
    );
    context.subscriptions.push(hoverProvider);

    const saveListener = vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
        const config = vscode.workspace.getConfiguration('seedlang');
        if (document.languageId === 'seedlang') {
            if (config.get('runOnSave')) {
                runCurrentFile();
            }
        }
    });

    context.subscriptions.push(saveListener);

    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration('seedlang')) {
            outputChannel.appendLine('SeedLang configuration changed');
        }
    });
}

function getExecutablePath(): string {
    const config = vscode.workspace.getConfiguration('seedlang');
    return config.get('executablePath', 'seedlang');
}

function getVMPath(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        const vmPath = path.join(workspaceRoot, 'src', 'runtime', 'vm.js');
        if (fs.existsSync(vmPath)) {
            return vmPath;
        }
    }
    return path.join(__dirname, '..', '..', '..', 'src', 'runtime', 'vm.js');
}

function runCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const document = editor.document;
    if (document.languageId !== 'seedlang') {
        vscode.window.showErrorMessage('Current file is not a SeedLang file');
        return;
    }

    const filePath = document.uri.fsPath;
    const code = document.getText();

    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine(`Running: ${filePath}`);
    outputChannel.appendLine('─'.repeat(40));

    const vmPath = getVMPath();
    outputChannel.appendLine(`Using VM: ${vmPath}`);
    
    const process = spawn('node', [vmPath, filePath]);

    process.stdout.on('data', (data) => {
        outputChannel.append(data.toString());
    });

    process.stderr.on('data', (data) => {
        outputChannel.append(`[Error] ${data.toString()}`);
    });

    process.on('close', (code) => {
        outputChannel.appendLine('─'.repeat(40));
        if (code === 0) {
            outputChannel.appendLine('[OK] Execution completed successfully');
        } else {
            outputChannel.appendLine(`[FAIL] Execution failed with code ${code}`);
        }
    });
}

function openRepl() {
    if (terminal) {
        terminal.show();
        return;
    }

    terminal = vscode.window.createTerminal({
        name: 'SeedLang REPL',
        shellPath: process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'bash')
    });

    terminal.show();
    const executable = getExecutablePath();
    terminal.sendText(`${executable} --repl`);
}

function compileToJS() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const document = editor.document;
    if (document.languageId !== 'seedlang') {
        vscode.window.showErrorMessage('Current file is not a SeedLang file');
        return;
    }

    const filePath = document.uri.fsPath;
    const outputPath = filePath.replace(/\.seed$/, '.js');
    const executable = getExecutablePath();

    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine(`Compiling: ${filePath} -> ${outputPath}`);

    const process = spawn(executable, ['--compile', filePath, '-o', outputPath]);

    process.stdout.on('data', (data) => {
        outputChannel.append(data.toString());
    });

    process.stderr.on('data', (data) => {
        outputChannel.append(`[Error] ${data.toString()}`);
    });

    process.on('close', (code) => {
        if (code === 0) {
            vscode.window.showInformationMessage('Compilation successful!');
            outputChannel.appendLine('[OK] Compilation completed');
        } else {
            vscode.window.showErrorMessage('Compilation failed');
            outputChannel.appendLine(`[FAIL] Compilation failed with code ${code}`);
        }
    });
}

function formatDocument() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const document = editor.document;
    if (document.languageId !== 'seedlang') {
        vscode.window.showErrorMessage('Current file is not a SeedLang file');
        return;
    }

    const filePath = document.uri.fsPath;
    const executable = getExecutablePath();

    const process = spawn(executable, ['--format', filePath]);

    process.on('close', (code) => {
        if (code === 0) {
            vscode.window.showInformationMessage('Document formatted!');
        } else {
            vscode.window.showErrorMessage('Format failed');
        }
    });
}

function lintDocument() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const document = editor.document;
    if (document.languageId !== 'seedlang') {
        vscode.window.showErrorMessage('Current file is not a SeedLang file');
        return;
    }

    const filePath = document.uri.fsPath;
    const executable = getExecutablePath();

    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine(`Linting: ${filePath}`);
    outputChannel.appendLine('─'.repeat(40));

    const process = spawn(executable, ['--lint', filePath]);

    process.stdout.on('data', (data) => {
        outputChannel.append(data.toString());
    });

    process.stderr.on('data', (data) => {
        outputChannel.append(`[Error] ${data.toString()}`);
    });

    process.on('close', (code) => {
        outputChannel.appendLine('─'.repeat(40));
        if (code === 0) {
            outputChannel.appendLine('[OK] Lint completed');
        }
    });
}

function checkAndPromptForAIConfig(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const configKey = 'seedlang.aiConfigCreated';

    const aiDir = path.join(workspaceRoot, '.vscode', 'seedlang');
    const seedlangJsonPath = path.join(aiDir, 'seedlang.json');
    const hasAIConfig = fs.existsSync(seedlangJsonPath);

    if (!hasAIConfig) {
        createAIConfigFiles();
        context.globalState.update(configKey, true);
    }
}

function createAIConfigFiles() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('没有打开的工作区');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const vscodeDir = path.join(workspaceRoot, '.vscode');
    const aiDir = path.join(vscodeDir, 'seedlang');

    if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
    }
    if (!fs.existsSync(aiDir)) {
        fs.mkdirSync(aiDir, { recursive: true });
    }

    const aiPromptSource = path.join(workspaceRoot, 'docs', 'AI_PROMPT.md');
    const syntaxSpecSource = path.join(workspaceRoot, 'docs', 'LANGUAGE_SPEC_REFACTOR_DRAFT.md');
    const seedlangJsonSource = path.join(workspaceRoot, 'seedlang', 'seedlang.json');

    const aiPromptFallback = `# SeedLang AI Prompt

Use docs/AI_PROMPT.md as the canonical AI guidance.
If this file is generated by extension fallback mode, sync with repo docs.
`;

    const syntaxSpecFallback = `# SeedLang Language Specification

Use docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md as the canonical language specification.
If this file is generated by extension fallback mode, sync with repo docs.
`;

    const seedlangJsonFallback = `{
  "name": "SeedLang",
  "version": "1.2.0",
  "documentation": {
    "language_spec": "docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md",
    "ai_prompt": "docs/AI_PROMPT.md"
  }
}
`;

    const aiRulesContent = fs.existsSync(aiPromptSource)
        ? fs.readFileSync(aiPromptSource, 'utf-8')
        : aiPromptFallback;
    const syntaxReferenceContent = fs.existsSync(syntaxSpecSource)
        ? fs.readFileSync(syntaxSpecSource, 'utf-8')
        : syntaxSpecFallback;
    const seedlangJsonContent = fs.existsSync(seedlangJsonSource)
        ? fs.readFileSync(seedlangJsonSource, 'utf-8')
        : seedlangJsonFallback;

    const files = [
        { path: path.join(aiDir, 'seedlang.json'), content: seedlangJsonContent },
        { path: path.join(aiDir, 'README.md'), content: aiRulesContent },
        { path: path.join(aiDir, 'SYNTAX_REFERENCE.md'), content: syntaxReferenceContent }
    ];

    let created = 0;
    let skipped = 0;

    for (const file of files) {
        if (!fs.existsSync(file.path)) {
            fs.writeFileSync(file.path, file.content, 'utf-8');
            created++;
        } else {
            skipped++;
        }
    }

    vscode.window.showInformationMessage(
        `SeedLang AI 配置文件已创建！新增 ${created} 个文件，跳过 ${skipped} 个已存在的文件。\n\n位置: .vscode/seedlang/`
    );

    outputChannel.appendLine(`[AI Config] Created ${created} files, skipped ${skipped} files`);
}

export function deactivate() {
    if (terminal) {
        terminal.dispose();
    }
    outputChannel.dispose();
}
