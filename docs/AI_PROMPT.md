# SeedLang AI Prompt

## ⚠️ Important: This is a Real Programming Language

**SeedLang is a complete programming language, not a markup language!**

When users ask for code, please use SeedLang to write real program code.

---

## ⚠️ Important: Project Setup

**Before creating SeedLang files, make sure the project is set up correctly.**

### Project Structure

```
my-project/
├── src/
│   └── main.seed
├── examples/
├── package.json
└── README.md
```

### File Creation Rules

1. **Never create user files in SeedLang source directory**
2. **Always create files in user project directory**
3. **SeedLang files use `.seed` extension**

---

## 🌱 SeedLang Core Syntax

### ⚠️ Key Difference: Prefer Space Separation

**Main style difference from JavaScript: Prefer spaces between elements and parameters.** The conforming language also accepts **optional commas** in the same positions (see `docs/LANGUAGE_SPEC_REFACTOR_DRAFT.md` §4.2); use one style consistently in generated code unless the user asks for JS-like commas.

| Feature | JavaScript | SeedLang |
|---------|---------------|-------------|
| Function Parameters | `fn add(a, b)` | `fn add(a b)` |
| Array Elements | `[1, 2, 3]` | `[1 2 3]` |
| Object Properties | `{ name: "A", age: 20 }` | `{ name: "A" age: 20 }` |
| Function Calls | `add(1, 2)` | `add(1 2)` |

### Basic Syntax (Human Friendly)

```seed
// You can also use simplified syntax
name = "SeedLang"
count = 100
active = true
items = [1 2 3]
person = { name: "Bob" age: 25 }
```

### Input / output (host)

- **Stdout**: `print(msg)` (and string concatenation with `+` as needed).
- **File IO (preferred for scripts)**: `readFile(path)`, `writeFile(path, text)`; example in-repo: `examples/hello/io_read_file.seed`.
- **Stdin line (`input`)**: async host builtin. The CLI awaits **top-level** statement-result promises after each run; `async fn` bodies may still finish before inner `await` completes—prefer files or `readFile` for reliable scripted input.

### Function Definition

```seed
// Function parameters are space-separated, no commas
fn add(a b) {
    return a + b
}

fn greet(name) {
    print("Hello " + name)
}

// Function calls
add(10 20)
greet("World")
```

### Conditional Statements

```seed
if score >= 90 {
    print("Excellent")
} else if score >= 60 {
    print("Pass")
} else {
    print("Fail")
}
```

### Loops

```seed
// while loop
i = 0
while i < 10 {
    print(i)
    i = i + 1
}

// for loop
for i = 0 i < 10 i = i + 1 {
    print(i)
}

// for-in loop
arr = [10 20 30]
for item in arr {
    print(item)
}
```

### Array Operations

```seed
// Create array (no commas)
arr = [1 2 3 4 5]

// Access elements
first = arr[0]

// Built-in functions
len(arr)              // length
push(arr 6)           // add element
pop(arr)              // remove last element
map(arr (x) => x * 2) // map
filter(arr (x) => x > 0) // filter
```

### Object Operations

```seed
// Create object (no commas)
person = {
    name: "Alice"
    age: 25
    city: "Beijing"
}

// Access properties
print(person.name)
print(person["age"])
```

### Output

```seed
// Output with print
print("Hello World")
print("Value: " + toString(42))
```

---

## 📚 Built-in Functions

### Output
- `print(value)` - Print output

### Arrays
- `len(arr)` - Get length
- `push(arr item)` - Add element
- `pop(arr)` - Pop element
- `map(arr fn)` - Map
- `filter(arr fn)` - Filter
- `reduce(arr init fn)` - Reduce
- `sort(arr)` - Sort
- `reverse(arr)` - Reverse
- `join(arr sep)` - Join to string

### Strings
- `len(str)` - Length
- `upper(str)` - Uppercase
- `lower(str)` - Lowercase
- `trim(str)` - Remove whitespace
- `split(str sep)` - Split
- `replace(str old new)` - Replace
- `substring(str start end)` - Substring

### Math
- `abs(n)` - Absolute value
- `floor(n)` - Floor
- `ceil(n)` - Ceiling
- `round(n)` - Round
- `sqrt(n)` - Square root
- `pow(base exp)` - Power
- `min(arr)` - Minimum
- `max(arr)` - Maximum
- `random()` - 0-1 random number

### Type Conversion
- `type(value)` - Get type
- `toString(value)` - To string
- `toInt(value)` - To integer
- `toFloat(value)` - To float
- `toBool(value)` - To boolean

---

## 🤖 AI Agent Runtime Functions

> **Note**: These functions are only available in the Agent runtime (`--agent` mode).
> They are NOT part of the core SeedLang language.

```seed
// Configure Agent
agent.config({
    name: "Assistant"
    role: "AI Assistant"
})

// Memory system
remember("User" "John")
userName = recall("User")

// Task system
task1 = task("Analyze Requirements")
task2 = task("Generate Code")

// Thinking
think("User needs help")

// State
state = getState()
print("Task count: " + toString(state.taskCount))
```

---

## 📝 Complete Examples

### Example 1: Calculator

```seed
// Calculator program
fn add(a b) {
    return a + b
}

fn subtract(a b) {
    return a - b
}

fn multiply(a b) {
    return a * b
}

fn divide(a b) {
    if b == 0 {
        print("Error: Division by zero")
        return 0
    }
    return a / b
}

// Test
print("Add: " + toString(add(10 5)))
print("Subtract: " + toString(subtract(10 5)))
print("Multiply: " + toString(multiply(10 5)))
print("Divide: " + toString(divide(10 5)))
```

### Example 2: Data Processing

```seed
// Data processing program
data = [1 2 3 4 5]

fn process(items) {
    result = []
    i = 0
    while i < len(items) {
        item = items[i]
        if item > 2 {
            push(result item * 2)
        }
        i = i + 1
    }
    return result
}

processed = process(data)
print("Result: " + join(processed " "))
```

### Example 3: Task Management

```seed
// Task management system
tasks = []

fn addTask(title priority) {
    task = {
        id: len(tasks) + 1
        title: title
        priority: priority
        status: "pending"
    }
    push(tasks task)
    print("Added task: " + title)
}

fn showTasks() {
    print("=== Task List ===")
    i = 0
    while i < len(tasks) {
        t = tasks[i]
        print(toString(t.id) + ". [" + t.status + "] " + t.title)
        i = i + 1
    }
}

addTask("Learn SeedLang" "high")
addTask("Build a project" "medium")
showTasks()
```

---

## ⚠️ Common Errors

### Error 1: Using Comma Separation

```seed
// Wrong
arr = [1, 2, 3]
fn add(a, b) { ... }
obj = { name: "A", age: 20 }

// Correct
arr = [1 2 3]
fn add(a b) { ... }
obj = { name: "A" age: 20 }
```

### Error 2: Using && ||

```seed
// Wrong (not recommended)
if x > 0 && x < 10 { ... }

// Preferred
if x > 0 and x < 10 { ... }
```

> **Note**: `&&` and `||` work in VM mode but are not recommended. Use `and`/`or` for clarity and compatibility.

### Error 3: Using .length

```seed
// Wrong
arr.length

// Correct
len(arr)
```

---

## Usage Instructions

1. When user requests code, use SeedLang to write real programs
2. Note: No comma separation, use spaces
3. Run method: `node dist/cli.js filename.seed`
4. Press F5 in VS Code to run
