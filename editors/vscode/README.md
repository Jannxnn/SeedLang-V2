# SeedLang VS Code Extension

VS Code support plugin for AI-specific efficient symbolic language

## Features

- 🎨 **Syntax Highlighting** - Supports all SeedLang syntax structures
- 📝 **Code Snippets** - Quick insertion of common code templates
- ⚡ **Command Support** - Run, compile, format, and lint code
- 🔄 **Auto-completion** - Automatic bracket and quote pairing
- 📁 **File Icons** - Dedicated icon for .seed files

## Installation

### Install from Source

1. Make sure Node.js and npm are installed
2. Clone the repository and enter the extension directory:
   ```bash
   cd editors/vscode
   npm install
   npm run compile
   ```
3. Press `F5` in VS Code to start debug mode

### Package Installation

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension seedlang-1.0.0.vsix
```

## Usage

### Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `SeedLang: Run Current File` | F5 | Run current file |
| `SeedLang: Open REPL` | Ctrl+Shift+R | Open REPL |
| `SeedLang: Compile to JavaScript` | - | Compile to JS |
| `SeedLang: Format Document` | - | Format document |
| `SeedLang: Lint Document` | - | Lint code |

### Code Snippets

Type the following prefixes and press Tab to expand:

| Prefix | Description |
|--------|-------------|
| `fn` | Function declaration |
| `async` | Async function |
| `arrow` | Arrow function |
| `if` | If statement |
| `ifelse` | If-Else statement |
| `for` | For loop |
| `while` | While loop |
| `switch` | Switch statement |
| `try` | Try-Catch |
| `interface` | Interface definition |
| `type` | Type alias |
| `class` | Class definition |
| `map` | Map function |
| `filter` | Filter function |
| `reduce` | Reduce function |

## Configuration

Configure in `settings.json`:

```json
{
  "seedlang.executablePath": "seedlang",
  "seedlang.runOnSave": false,
  "seedlang.showOutput": true,
  "seedlang.formatOnSave": false
}
```

## Example Code

```seedlang
message>"Hello World"
message

fn add(a b) {
  a + b
}

add(2 3)

for i in range(5) {
  i * 2
}
```

## License

MIT
