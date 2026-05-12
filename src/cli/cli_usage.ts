/** CLI help text: kept out of cli.ts to reduce file size. */

export function printUsage(): void {
  console.log(`
+==============================================================+
|     SeedLang - experimental / learning (not production)    |
|              Version 2.0.0                                   |
+==============================================================+

Usage:
  seedlang <file> [options]
  seedlang --eval "<SeedLang code>"
  seedlang --repl
  seedlang --vm <file>
  seedlang --web <file>
  seedlang --agent <file>
  seedlang --game <file>
  seedlang --graphics <file>
Run Options:
  --eval, -e     Execute inline code
  --repl         Start interactive interpreter
  --vm           Optional bytecode VM path (learning/experiment; --compile-c is native codegen playground)
  Host / JIT (environment):
                 SEED_INTERP_JIT=0  disable interpreter own JIT (default: own JIT on); AST interpreter JIT is bootstrap-era tuning.
                 Toy native path: --compile-c + host C compiler; src/jit optimizes interpreter/IR paths, not a shipping engine.
                 SEED_INTERP_JIT_PROBE, SEED_INTERP_JIT_PROBE_ASSIGN  warmup iterations before tier compile (default 128)
                 SEED_HOST_JIT=0    force Node --jitless for CLI (disable V8 JIT tiers); unset/1 keeps V8 JIT
                 SEED_ALLOW_JIT_OUTSIDE_VM=1; legacy alias: allow host V8 JIT even when SEED_HOST_JIT=0
  --web          Run in Web mode
  --agent        Run in Agent mode
  --game         Run in Game mode
  --graphics     Run in Graphics mode

Output Options:
  --output, -o   Specify output file
  --ast          Output AST (Abstract Syntax Tree)
  --tokens       Output lexer tokens
  --format       Format code output
  --lint        Run code linting
  --stats       Show code statistics

Dev Tools:
  --watch, -w    Watch file changes and re-run
  --compile, -c  Compile to JavaScript
  --minify       Minify output
  --source-map   Write <out>.js.map (line-clamped .seed mapping; disables --minify when both are set)
  --no-memo      Disable auto-memoization optimization
  --compile-c    Compile to C (native via clang/gcc)
  --subsystem    With compile-c: windows | console (windows: win32.pollEvents / perfMillis / present / setPixel / width / height)
  (Win32: SEED_WIN32_AUTOCLOSE=1 exits after ~300ms; non-TTY compile-c run sets it automatically)
  --parallel     Emit OpenMP parallel loops where safe (compile-c)
  --clc-strict   With compile-c: fail (exit 2) if CLC emits unsupported/degraded warnings
  --clc-require-native  With compile-c: exit 3 if no C toolchain produces a binary
  --acae-diagnostics  With compile-c: ACAE loop-tier notes in C header + stderr
  --acae-fuse    With compile-c: merge consecutive identical for-in range(...) (conservative)
  (CLC env: SEED_CLC_STRICT=1, SEED_CLC_REQUIRE_NATIVE=1; same as flags above)

Debug Options:
  --debug        Enable debug mode
  --debugger     Start interactive debugger
  --verbose      Verbose output
  --time         Show execution time

Other:
  --help, -h     Show help information
  --version, -v  Show version number
  --init         Initialize project (create seed.config.json)

Examples:
  seedlang hello.seed
  seedlang -e "print('Hello World')"            # bash / zsh / fish / PowerShell / cmd.exe
  seedlang --repl
  seedlang --watch app.seed
  seedlang --compile app.seed -o app.js
  seedlang --lint code.seed
  seedlang --format code.seed

.seed surface syntax (teaser; full rules in repo docs):
  print("Hello World")
  x = 40 + 2
  fn add(a b) { return a + b }
  add(1 2)

More docs: https://github.com/seedlang-team/seedlang
Spec (in clone): docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md
`);
}

export function printVersion(): void {
  console.log('SeedLang v2.0.0');
  console.log('Experimental / learning language (not production)');
  console.log('');
  console.log('Runtime Modes (mostly stubs / demos):');
  console.log('  - General (Interpreter)    AST interpreter (default)');
  console.log('  - VM (--vm)               Bytecode path (optional experiment)');
  console.log('  - Web (--web)              Web-like API stubs');
  console.log('  - Agent (--agent)          Agent-shaped stubs (no built-in LLM)');
  console.log('  - Game (--game)            Game demo API (not a shipped engine)');
  console.log('  - Graphics (--graphics)    Terminal-oriented drawing demo');
  console.log('  - Mobile (API)             Device API shape + simulation');
  console.log('  - Embedded (API)           GPIO-like stubs + JS simulation');
  console.log('');
  console.log('Compilation Targets:');
  console.log('  - JavaScript (--compile/-c)   .seed -> .js');
  console.log('  - C/Native (--compile-c)      .seed -> .c -> .exe');
  console.log('');
  console.log('Toolchain:');
  console.log('  - REPL Interactive Mode');
  console.log('  - Code Formatter (--format)');
  console.log('  - Lint Checker (--lint)');
  console.log('  - Debugger (--debugger)');
  console.log('  - File Watcher (--watch/-w)');
  console.log('');
  console.log('Repository: https://github.com/seedlang-team/seedlang');
}
