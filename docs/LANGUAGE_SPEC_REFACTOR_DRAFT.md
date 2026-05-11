# SeedLang Language Specification (Canonical)

> Status: Canonical (single source of truth)  
> This file is the only normative language standard for SeedLang.
>
> Note: This specification draft is currently used as the standard entry for project checks and configuration references.

## 1. Scope

This document defines the **language standard** of SeedLang:
- lexical elements
- syntax and semantics
- core standard library behavior
- implementation limits and compatibility constraints

Note: This section defines what belongs to the language standard itself and must be aligned by implementations.

This document does **not** define:
- IDE tooling details
- debugging framework API
- AI platform/model pricing features
- host runtime product APIs beyond language-level requirements

Note: This section defines what is out of scope for the language standard; those topics should live in tooling, product, or API documents.

## 2. Versioning Policy

- Spec version: `v1.0`
- Language features marked as `Experimental` are non-stable.
- Features marked as `Not Implemented` are excluded from conformance.

Note:
- `Experimental` = experimental feature, compatibility is not guaranteed.
- `Not Implemented` = not yet implemented, excluded from conformance requirements.

## 3. Lexical Conventions

### 3.1 Comments

```seedlang
// single-line comment
/*
  multi-line comment
*/
```

### 3.2 Identifiers and Keywords

- Identifiers follow JavaScript-like naming rules.
- Reserved keywords include (non-exhaustive): `fn`, `async`, `if`, `else`, `while`, `for`, `return`, `import`, `export`, `try`, `catch`, `throw`, `class`, `interface`, `type`, `true`, `false`, `null`.

Note: The keyword list is illustrative (non-exhaustive) and can be expanded into a full reserved-word table later.

### 3.3 Literals

- Number literals: decimal, binary (`0b...`), octal (`0o...`), hexadecimal (`0x...`).
- String literals: single and double quote forms.
- Boolean literals: `true`, `false`.
- Null literal: `null`.

## 4. Core Syntax

### 4.1 Assignment

```seedlang
name = "Seed"
count = 42
```

### 4.2 Collections

- Array elements may be separated by **spaces** and/or **commas** (commas are optional separators; trailing commas are allowed where a closing bracket/brace follows).
- Object fields follow the same rule: spaces and/or commas between entries.
- Function parameters and call arguments accept the same optional comma separators.

Note: Space-only separation remains valid minimal style; commas improve readability for readers accustomed to JavaScript.

```seedlang
arr = [1 2 3]
arr2 = [1, 2, 3]
obj = { name: "Alice" age: 20 }
obj2 = { name: "Alice", age: 20 }
```

### 4.3 Functions

Parameter lists accept spaces and/or commas (`fn add(a b)` and `fn add(a, b)` are equivalent).

```seedlang
fn add(a b) {
  return a + b
}

async fn fetchData() {
  res = await httpGet("https://api.example.com")
  return res
}
```

### 4.4 Control Flow

```seedlang
if cond {
  x = 1
} else {
  x = 2
}

while i < 10 {
  i = i + 1
}

for (i = 0; i < 10; i = i + 1) {
  print(i)
}

for item in arr {
  print(item)
}
```

### 4.5 Operators

- Arithmetic: `+ - * / %`
- Comparison: `== != < > <= >=`
- Logic: `&& || !` and keyword forms `and or not`
- Bitwise: `& | ^ ~ << >> >>>`

Note: Only operators listed here are recognized by this specification version; operators not listed are non-normative by default.

`%` is part of conforming syntax in `v1.0`.

## 5. Modules

```seedlang
import math
import math as m

export fn f() { return 1 }
export value = 42
```

## 6. Error Handling

```seedlang
try {
  risky()
} catch (e) {
  print("Error: " + e)
}

throw "failed"
```

## 7. Type Layer (Experimental)

The following grammar is treated as `Experimental`:
- `interface` declarations
- `type` aliases
- typed variable annotations
- generic type parameters

Note: The type layer is kept as experimental for now and can be promoted to a fully normative section after stabilization.

```seedlang
interface Point {
  x: number
  y: number
}

type ID = string
p: Point = { x: 10 y: 20 }
```

### 7.1 Generics (Experimental)

Functions and classes support generic type parameters using space-separated names in angle brackets:

```seedlang
fn apply<T U>(fn_ref: T val: U) {
    return fn_ref(val)
}

class Container<T> {
    value: T
}
```

## 7.2 Class and OOP

Classes support properties, methods, constructors, inheritance, and static methods:

```seedlang
class Animal {
    name: string
    fn init(name) {
        this.name = name
    }
    fn speak() {
        return this.name + " speaks"
    }
}

class Dog extends Animal {
    fn speak() {
        return this.name + " barks"
    }
}
```

- `init` is the constructor method
- `extends` declares inheritance
- `super()` calls the parent constructor
- `this` refers to the current instance
- Static methods declared with `static` keyword

## 7.3 Pattern Matching

The `match` expression supports destructuring patterns with guard conditions:

```seedlang
result = match value {
    0 => "zero"
    1..10 => "small"
    n when n > 100 => "large"
    _ => "other"
}
```

Pattern types:
- **Literal**: matches exact values (numbers, strings, booleans)
- **Range**: `start..end` matches values in inclusive range
- **Type**: `number`, `string`, `boolean`, `array`, `object`, `function`
- **Array destructuring**: `[first ...rest]`
- **Object destructuring**: `{ x y }`
- **Or patterns**: `1 | 2 | 3`
- **Wildcard**: `_` matches anything
- **Guard**: `pattern when condition`

## 7.4 Macro System

SeedLang provides **hygienic macros** that expand at compile time:

```seedlang
macro double(x) {
    x = x * 2
}

result = 5
double!(result)
```

- **Definition**: `macro name(params) { body }`
- **Invocation**: `name!(args)` — the `!` operator followed by `()`
- **Hygiene**: macro-introduced variables are automatically renamed to avoid conflicts with caller scope
- **Parameters**: macro parameters reference caller variables directly, allowing modification
- **Nesting**: macros can call other macros from within their body

## 7.5 Async/Await (Experimental)

Asynchronous functions use `async` and `await`:

```seedlang
async fn fetchData(url) {
    response = await fetch(url)
    return await response.json()
}
```

Note: Full async/await semantics in VM mode is experimental. The AST interpreter supports it fully.

## 8. Standard Library (Language-Level)

This section defines language-level built-ins. Host/platform-specific APIs are out of scope.

Note: This section should contain only language-level built-ins. Host APIs such as `dom.*`, `agent.*`, and `game.*` are out of scope.

- Math: `abs floor ceil round min max sqrt pow sin cos tan asin acos atan atan2 log log2 log10 exp random PI E`
- String: `len upper lower trim trimStart trimEnd split join replace substring charAt startsWith endsWith includes repeat padStart padEnd lastIndexOf strMatch search codePointAt fromCharCode`
- Array: `len push pop shift unshift slice concat reverse sort indexOf lastIndexOf map filter reduce find findIndex every some forEach flatMap flat fill unique count sum avg minBy maxBy zip deepClone`
- Object: `keys values entries merge`
- Conversion: `type toInt toFloat toString toBool int float string bool`
- IO/FS: `readFile writeFile exists listDir mkdir remove`
- Time: `time timestamp date sleep`
- JSON: `jsonParse jsonStringify`

### 8.1 Output API

- Language-level standard output function: `print(...)`.
- Host/runtime logging APIs (for example `gui.*`, `agent.*`) are non-core APIs and are out of language-level conformance checks.

## 9. Conformance Notes

### 9.1 Known Limits

- Class declaration supports properties, methods, constructors, inheritance, and static methods (see §7.2).
- Any syntax or API not listed in this document is non-normative for `v1.0`.

Note: If implementation behavior conflicts with this document, listed specification entries take precedence; unlisted behavior is treated as non-standard.

### 9.2 Compatibility and Style

- Preferred style and compatibility syntax can coexist in `v1.0`.
- Compatibility syntax is conforming, but tooling may emit warnings for style consistency.
- Style warnings must not be treated as parser/runtime errors.

### 9.3 Host Runtime Separation

The following are valid product/runtime domains but not part of language core standard:
- web runtime APIs (`dom.*`)
- agent/game/mobile/embedded runtime APIs
- JS SDK classes and Node.js integration modules
- optimization internals (SSA, register allocation, SIMD, etc.)
- AI model, token-cost, pricing workflows

Note: This section defines boundaries to prevent product capabilities from being incorrectly merged into the language standard.

## 10. Migration From Legacy Spec (Checklist)

Items that should remain outside the language standard and be moved to dedicated docs:
- debugging framework and profiler APIs
- concurrency and transaction APIs
- memory management internals
- sandbox/security framework APIs
- AI integration APIs
- external language integration (Python/Rust/FFI/WASM)
- CLI option catalog (can live in CLI reference)
- JavaScript SDK full API reference

Note: This is a migration checklist, not a deletion checklist. Recommended order: migrate first, verify references, then remove legacy content.

