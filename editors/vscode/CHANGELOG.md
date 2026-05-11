# SeedLang VS Code Extension - Changelog

## [1.3.6] - 2026-04-08

### Added
- **Auto-compile instructions**: AI now knows to compile after writing code
- Added compile workflow in README.md and seedlang.json
- Clear instructions for other AI tools (Cursor, Windsurf, Claude)

### AI Workflow
```
1. AI writes SeedLang code (.seed files)
2. AI automatically runs: seedlang --compile <file>.seed -o dist/<file>.js
3. AI tells user how to run the compiled file
```

## [1.3.5] - 2026-04-08

### Changed
- **Moved config directory**: `seedlang/` -> `.vscode/seedlang/`
- **No root directory pollution**: All config files now inside `.vscode/` directory
- **Removed `SEEDLANG.md`**: No longer creates files in workspace root

### Directory structure after update
```
project/
├── .vscode/
│   ├── settings.json
│   └── seedlang/           <- AI config directory (hidden)
│       ├── README.md
│       ├── SYNTAX_REFERENCE.md
│       ├── INTERPRETER.md
│       └── seedlang.json
├── src/                    <- Your code goes here
└── ...
```

## [1.3.4] - 2026-04-08

### Fixed
- **Fixed project root detection**: AI now correctly identifies project root directory
- Added `SEEDLANG.md` entry file in workspace root to guide AI
- AI will no longer create files inside `seedlang/` config directory

### Directory structure after update
```
project/
├── SEEDLANG.md          <- Entry file (tells AI this is project root)
├── seedlang/            <- AI config directory
│   ├── README.md
│   ├── SYNTAX_REFERENCE.md
│   ├── INTERPRETER.md
│   └── seedlang.json
├── src/                 <- Your code goes here
└── ...
```

## [1.3.3] - 2026-04-08

### Changed
- **Renamed config directory**: `.ai/` -> `seedlang/` for clearer naming
- **Removed duplicate files**: Deleted `SEEDLANG.md`, `.cursorrules`, `.windsurfrules`, `.claude` from root
- **Cleaner project structure**: All AI config files now in `seedlang/` directory

### Directory structure after update
```
project/
└── seedlang/           <- AI config directory
    ├── README.md
    ├── SYNTAX_REFERENCE.md
    ├── INTERPRETER.md
    └── seedlang.json
```

## [1.3.2] - 2026-04-08

### Changed
- **No root directory pollution**: AI config files now only created in `.ai/` directory
- Removed `.cursorrules`, `.windsurfrules`, `.claude` from workspace root
- All config files are now in `.ai/` folder for cleaner project structure

## [1.3.1] - 2026-04-08

### Fixed
- Plugin now activates on VS Code startup (not just when opening .seed files)

## [1.3.0] - 2026-04-08

### Added
- **Auto AI Config Initialization**: Plugin now prompts to create AI config files in workspace
- New command: `SeedLang: Initialize AI Config Files`
- Creates `.cursorrules`, `.windsurfrules`, `.claude` for AI assistants
- Creates `.ai/` directory with syntax reference and interpreter docs
- AI assistants (Cursor, Windsurf, Claude) can now automatically understand SeedLang syntax

### How it works
1. When opening a workspace without SeedLang AI config, plugin asks to create them
2. Select "Yes" to create config files in workspace root
3. AI assistants will automatically read these files and understand SeedLang syntax

## [1.2.0] - 2026-04-08

### Added
- AI configuration files (`.ai/seedlang.json`, `.ai/README.md`) for external AI assistants
- 7 new consistency check rules (19 total):
  - Class methods don't need `fn` keyword
  - Switch statement requires parentheses
  - Detect unimplemented built-in functions
  - Detect negative array index access
  - String concatenation validation
  - Function return statement validation
  - Unclosed code block detection

### Fixed
- Class methods in documentation now correctly omit `fn` keyword
- Switch statements now use correct `switch (value)` syntax

## [1.1.0] - 2026-04-07

### Added
- AI Quick Start Guide (`docs/AI_QUICK_START.md`)
- JSON files included in consistency checks
- `gui` keyword syntax highlighting
- Built-in function syntax highlighting

### Fixed
- Snippets now use `print()` instead of `print()`
- Removed `for-in` loop snippets (not supported)
- Fixed comma usage in snippets

## [1.0.0] - Initial Release

### Added
- Basic syntax highlighting for SeedLang
- Code snippets for common patterns
- Language configuration (comments, brackets)
