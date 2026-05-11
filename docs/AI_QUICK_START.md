# SeedLang AI Quick Start Guide

> **For AI Assistants**: This guide helps you understand and use SeedLang immediately.

## What is SeedLang?

SeedLang is a symbolic programming language designed for AI. Key difference from JavaScript/Python:

**NO COMMAS** between elements in arrays, objects, and function parameters.

## Syntax Quick Reference

### Variables
```seed
name = "Alice"        // String
age = 25              // Number
active = true         // Boolean
items = [1 2 3]       // Array (NO commas!)
user = {name: "Bob" age: 30}  // Object (NO commas!)
```

### Output
```seed
print("Hello World")
print("Value: " + value)
```

### Functions
```seed
fn add(a b) {              // Parameters: space-separated, NO commas
    return a + b
}

fn greet(name) {
    print("Hello " + name)
}

add(2 3)                    // Arguments: space-separated, NO commas
greet("World")
```

### Control Flow
```seed
if condition {
    // ...
} else {
    // ...
}

while i < 10 {
    i = i + 1
}
```

### Classes
```seed
class Animal {
    name = ""
    
    init(name) {
        this.name = name
    }
    
    speak() {
        print(this.name + " says hello")
    }
}
```

## Web Development Example

```seed
// Simple web app
print("Starting Web App...")

users = [
    {id: 1 name: "Alice" role: "Admin"}
    {id: 2 name: "Bob" role: "User"}
    {id: 3 name: "Charlie" role: "User"}
]

fn renderUsers() {
    print("=== Users ===")
    i = 0
    while i < len(users) {
        u = users[i]
        print(u.id + ". " + u.name + " (" + u.role + ")")
        i = i + 1
    }
}

fn addUser(name role) {
    push(users {id: len(users) + 1 name: name role: role})
    print("Added: " + name)
}

fn findUser(id) {
    i = 0
    while i < len(users) {
        if users[i].id == id {
            return users[i]
        }
        i = i + 1
    }
    return null
}

renderUsers()
addUser("David" "User")
print("")
renderUsers()
```

## Common Mistakes to Avoid

| Wrong (JavaScript style) | Correct (SeedLang) |
|--------------------------|---------------------|
| `[1, 2, 3]` | `[1 2 3]` |
| `{a: 1, b: 2}` | `{a: 1 b: 2}` |
| `fn(a, b) {}` | `fn(a b) {}` |
| `func(1, 2)` | `func(1 2)` |
| `for (i in arr)` | `for item in arr { }` |
| `arr.length` | `len(arr)` |

## Built-in Functions

```seed
// Array
len(arr) push(arr item) map(arr fn) filter(arr fn)
reduce(arr init fn) sort(arr) reverse(arr) slice(arr start end)

// String
upper(str) lower(str) trim(str) contains(str sub)
indexOf(str sub) replace(str old new) substring(str start end)

// Math
abs(n) floor(n) ceil(n) round(n) pow(base exp) sqrt(n)
random(min max) randomInt(min max) min(...args) max(...args)

// Type
toString(val) toInt(val) toBool(val) type(val)
isArray(val) isObject(val) isString(val) isNumber(val)

// Utility
range(start end step) sleep(ms) time()
```

## File Structure

```
project/
├── main.seed          # Entry point
├── app.seed           # Application code
├── config.seed        # Configuration
└── seed.config.json   # Project config
```

## Run Commands

```bash
node dist/cli.js main.seed    # Run file
node dist/cli.js --repl       # Interactive REPL
node dist/cli.js --debugger   # Interactive debugger
```

## For AI: When User Asks to Build Something

1. **Read existing code** in the project first
2. **Follow the NO COMMA rule** always
3. **Use `print()`** for output
4. **Use `for item in arr`** for iteration, or `while` for index-based loops
5. **Check examples/** folder for patterns

## Full Language Spec

See: [LANGUAGE_SPEC_REFACTOR_DRAFT.md](./LANGUAGE_SPEC_REFACTOR_DRAFT.md)
