/** CLI help text — kept out of cli.ts to reduce file size. */

export function printUsage(): void {
  console.log(`
+==============================================================+
|           SeedLang - AI-Optimized Language                   |
|              Version 2.0.0                                   |
+==============================================================+

Usage:
  seedlang <file> [options]
  seedlang --eval "<code>"
  seedlang --repl
  seedlang --vm <file>
  seedlang --web <file>
  seedlang --agent <file>
  seedlang --game <file>
  seedlang --graphics <file>
Run Options:
  --eval, -e     Execute inline code
  --repl         Start interactive interpreter
  --vm           Run in VM mode (bytecode VM with coroutines/macros/scheduler)
  Host / JIT (environment):
                 SEED_INTERP_JIT=0  disable interpreter own JIT (default: own JIT on); AST interpreter JIT is bootstrap-era tuning.
                 Primary shipped/de-shelled perf target: --vm (SeedLangVM + bytecode JIT under src/jit).
                 SEED_INTERP_JIT_PROBE, SEED_INTERP_JIT_PROBE_ASSIGN  warmup iterations before tier compile (default 128)
                 SEED_HOST_JIT=0    force Node --jitless for CLI (disable V8 JIT tiers); unset/1 keeps V8 JIT
                 SEED_ALLOW_JIT_OUTSIDE_VM=1 — legacy alias: allow host V8 JIT even when SEED_HOST_JIT=0
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
  --source-map   Generate source map
  --no-memo      Disable auto-memoization optimization
  --compile-c    Compile to C (native via clang/gcc)
  --subsystem    With compile-c: windows | console (windows: win32.pollEvents / perfMillis / present / setPixel / width / height)
  (Win32: SEED_WIN32_AUTOCLOSE=1 exits after ~300ms; non-TTY compile-c run sets it automatically)
  --parallel     Emit OpenMP parallel loops where safe (compile-c)
  --clc-strict   With compile-c: fail (exit 2) if CLC emits unsupported/degraded warnings
  --clc-require-native  With compile-c: exit 3 if no C toolchain produces a binary
  --acae-diagnostics  With compile-c: ACAE loop-tier notes in C header + stderr
  --acae-fuse    With compile-c: merge consecutive identical for-in range(...) (conservative)
  (CLC env: SEED_CLC_STRICT=1, SEED_CLC_REQUIRE_NATIVE=1 — same as flags above)

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
  seedlang -e "\"Hello World\""
  seedlang --repl
  seedlang --watch app.seed
  seedlang --compile app.seed -o app.js
  seedlang --lint code.seed
  seedlang --format code.seed

Language Syntax:
  #n7        Declaration: subject + action + object
  ?#vA?>#n5->!o    Question: conditional judgment
  !w#n3->!c#vA-#n1 Write: target -> content
  #n1              Noun reference: variable reference
  #t"text"         Text literal: string
  #vA              Verb marker: operator

More docs: https://github.com/seedlang/seedlang
`);
}

export function printVersion(): void {
  console.log('SeedLang v2.0.0');
  console.log('AI-Optimized Language');
  console.log('');
  console.log('Runtime Modes:');
  console.log('  - General (Interpreter)    Full-featured AST interpreter');
  console.log('  - VM (--vm)                Bytecode VM with JIT/TCO/sandbox');
  console.log('  - Web (--web)              DOM rendering & component system');
  console.log('  - Agent (--agent)          AI agent with memory & tools');
  console.log('  - Game (--game)            ECS game engine with physics');
  console.log('  - Graphics (--graphics)    Terminal canvas & sprite engine');
  console.log('  - Mobile (API)             Device APIs (camera/GPS/sensors)');
  console.log('  - Embedded (API)           IoT/Arduino (GPIO/I2C/SPI)');
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
}
