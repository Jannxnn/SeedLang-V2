# SeedLang Debugger

SeedLang has a built-in powerful debugger that supports breakpoints, step execution, variable watching, and more.

## Starting the Debugger

```bash
# Start interactive debugger
seedlang --debugger

# Or debug a specific file
seedlang --debugger examples/clc/test_clc.seed
```

## Debugger Commands

### Execution Control

| Command | Alias | Description |
|---------|-------|-------------|
| `run` | `r` | Start/restart program execution |
| `continue` | `c` | Continue execution to next breakpoint |
| `step` | `s` | Step over (skip function calls) |
| `stepin` | `si` | Step into function |
| `stepout` | `so` | Execute until function returns |
| `stop` | - | Stop execution |

### Breakpoint Management

| Command | Description |
|---------|-------------|
| `break <line> [condition]` | Set breakpoint at line, optional condition |
| `delete <id>` | Delete breakpoint |
| `toggle <id>` | Toggle breakpoint enable/disable |
| `breakpoints` / `bp` | List all breakpoints |

### Watch Expressions

| Command | Description |
|---------|-------------|
| `watch <expression>` | Add watch expression |
| `unwatch <id>` | Delete watch |
| `watches` / `w` | List all watches |

### Information Display

| Command | Description |
|---------|-------------|
| `list [n]` | Show source code around current line (default 5 lines) |
| `vars` | Display current variables |
| `stack` | Display call stack |
| `status` | Display debugger status |

### Other

| Command | Description |
|---------|-------------|
| `load <file>` | Load source file |
| `help` / `h` | Display help |
| `quit` / `q` | Exit debugger |

## Usage Examples

### 1. Basic Debugging Workflow

```
(debug) load examples/clc/test_clc.seed
Loaded: examples/clc/test_clc.seed

(debug) break 3
Breakpoint #1 set at line 3

(debug) run

📄 Source (examples/clc/test_clc.seed):
      | print("Hello from CLC!")
  → ●  3 | print(abs(-42))
      | print(floor(3.9))

🔴 Breakpoint hit at line 3

(debug) vars

📦 Variables:
   (none at top-level before calls)

(debug) step

→ Step at line 6

(debug) continue

🔴 Breakpoint hit at line 12

(debug) vars

📦 Variables:
   n = 4
   result = 120

(debug) continue

✅ Execution completed
```

### 2. Conditional Breakpoints

```
(debug) break 15 n > 10
Breakpoint #3 set at line 15 [n > 10]

(debug) run
```

Breakpoints only trigger when the condition is true.

### 3. Watch Expressions

```
(debug) watch n
Watch #1: n

(debug) watch result
Watch #2: result

(debug) run

👁️ Watches:
   #1: n = 5
   #2: result = undefined
```

### 4. Step Debugging

```
(debug) run

→ Step at line 1

(debug) step
→ Step at line 2

(debug) stepin
→ Step at line 5 (inside function)

(debug) stepout
→ Step at line 10 (returned from function)
```

## Debugger States

The debugger has the following states:

| State | Description |
|-------|-------------|
| `running` | Program is executing |
| `paused` | Program is paused (breakpoint or step) |
| `stepping` | Currently stepping |
| `terminated` | Program has ended |

## Programming Interface

You can also use the debugger in code:

```javascript
const { Debugger, DebugState } = require('seedlang');

const dbg = new Debugger();

// Load source code
dbg.load(source, 'myscript.seed');

// Set breakpoints
dbg.addBreakpoint(10);
dbg.addBreakpoint(20, 'x > 5');

// Add watches
dbg.addWatch('x');
dbg.addWatch('myArray');

// Listen for events
dbg.onEvent((event) => {
  if (event.type === 'breakpoint') {
    console.log('Breakpoint hit:', event.line);
    dbg.printSource();
    dbg.printVariables();
  }
});

// Start debugging
dbg.start(true);
```

## Debugging Tips

### 1. Use Conditional Breakpoints to Reduce Interruptions

When loops execute many times, use conditional breakpoints to pause only in specific cases:

```
(debug) break 10 i == 5
```

### 2. Watch Complex Expressions

Watch expressions can be any valid SeedLang expression:

```
(debug) watch arr[0].name
(debug) watch len(myArray)
```

### 3. Combine Commands

```
(debug) bp           # View breakpoints
(debug) vars         # View variables
(debug) list 10      # View more code
(debug) stack        # View call stack
```

### 4. Debugging Recursive Functions

Use call stack to view recursion depth:

```
(debug) stack

📚 Call Stack:
  factorial at line 5
  factorial at line 8
  factorial at line 8
→ factorial at line 8
```

## Keyboard Shortcuts

In the debugger REPL:

- `↑` / `↓` - Browse command history
- `Tab` - Auto-complete commands
- `Ctrl+C` - Interrupt current operation
- `Ctrl+D` - Exit debugger
