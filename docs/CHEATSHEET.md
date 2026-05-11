# SeedLang Syntax Cheat Sheet

## Declaration Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `name = value` | Regular variable | `x = 10` |
| `name = value` | Web variable | `dom = document` |
| `name = value` | Object variable | `config = {}` |
| `name = value` | Constant | `PI = 3.14` |

## Data Types

| Type | Syntax | Example |
|------|--------|---------|
| Number | Direct write | `42`, `3.14`, `-10` |
| String | Double or single quotes | `"hello"`, `'world'` |
| Boolean | true/false | `true`, `false` |
| Null | null | `null` |
| Array | Square brackets, space-separated | `[1 2 3]` |
| Object | Curly braces, properties without commas | `{name: "A" age: 20}` |

## Operators

| Type | Operators | Example |
|------|-----------|---------|
| Arithmetic | `+ - * / %` | `a + b`, `a * b` |
| Comparison | `== != < > <= >=` | `a == b`, `a > b` |
| Logical | `and or not` | `a and b`, `not a` |
| Unary | `-` | `-num` |

## Control Flow

```seed
// Conditional
if condition { }
else if condition { }
else { }

// While loop
while condition { }

// For loop
for i = 0 i < n i = i + 1 { }

// break/continue
break
continue
```

## Functions

```seed
// Definition
fn name(params) { body }

// Return
return value

// Async
async fn name() { await expr }

// Arrow function
(x) => x * 2
```

## Array Methods

| Method | Description | Example |
|--------|-------------|---------|
| `len(arr)` | Length | `len([1 2 3])` → `3` |
| `push(arr item)` | Add | `push(arr 4)` |
| `pop(arr)` | Remove last | `pop(arr)` |
| `map(arr fn)` | Map | `map([1 2] (x)=>x*2)` |
| `filter(arr fn)` | Filter | `filter(arr (x)=>x>0)` |
| `reduce(arr init fn)` | Reduce | `reduce(arr 0 (a x)=>a+x)` |
| `find(arr fn)` | Find | `find(arr (x)=>x>3)` |
| `includes(arr item)` | Includes | `includes(arr 3)` |
| `sort(arr)` | Sort | `sort([3 1 2])` |
| `reverse(arr)` | Reverse | `reverse(arr)` |

## String Methods

| Method | Description | Example |
|--------|-------------|---------|
| `len(s)` | Length | `len("hello")` → `5` |
| `upper(s)` | Uppercase | `upper("hello")` → `"HELLO"` |
| `lower(s)` | Lowercase | `lower("HELLO")` → `"hello"` |
| `trim(s)` | Trim spaces | `trim("  hi  ")` → `"hi"` |
| `split(s sep)` | Split | `split("a,b" ",")` → `["a" "b"]` |
| `join(arr sep)` | Join | `join(["a" "b"] "-")` → `"a-b"` |
| `replace(s old new)` | Replace | `replace("hi" "i" "ello")` |
| `substring(s start end)` | Substring | `substring("hello" 0 3)` |

## Object Operations

| Method | Description | Example |
|--------|-------------|---------|
| `obj.key` | Property access | `user.name` |
| `obj["key"]` | Dynamic access | `user["name"]` |
| `keys(obj)` | All keys | `keys({a:1})` → `["a"]` |
| `values(obj)` | All values | `values({a:1})` → `[1]` |
| `merge(obj1 obj2)` | Merge | `merge(a b)` |

## Math Functions

| Function | Description |
|----------|-------------|
| `abs(x)` | Absolute value |
| `floor(x)` | Floor |
| `ceil(x)` | Ceiling |
| `round(x)` | Round |
| `sqrt(x)` | Square root |
| `pow(x y)` | Power |
| `min(arr)` | Minimum |
| `max(arr)` | Maximum |
| `random()` | Random [0,1) |
| `randomInt(min max)` | Random integer |

## Type Functions

| Function | Description | Example |
|----------|-------------|---------|
| `type(x)` | Type name | `type(42)` → `"number"` |
| `toInt(x)` | To integer | `toInt("42")` → `42` |
| `toFloat(x)` | To float | `toFloat("3.14")` |
| `toString(x)` | To string | `toString(42)` → `"42"` |
| `toBool(x)` | To boolean | `toBool(1)` → `true` |

## Base Support

### Base Literals

| Format | Description | Example |
|--------|-------------|---------|
| `0b...` | Binary | `0b1010` → `10` |
| `0o...` | Octal | `0o77` → `63` |
| `0x...` | Hexadecimal | `0xFF` → `255` |

```seed
// Binary
binary = 0b1010      // 10
binary2 = 0B1111     // 15 (uppercase also supported)

// Octal
octal = 0o77         // 63
octal2 = 0O755       // 493

// Hexadecimal
hex = 0xFF           // 255
hex2 = 0x1A2B        // 6699

// Base arithmetic
result = 0b1010 + 0xFF  // 10 + 255 = 265
```

### Base Conversion Functions

| Function | Description | Example |
|----------|-------------|---------|
| `toBinary(n)` | To binary string | `toBinary(10)` → `"0b1010"` |
| `toOctal(n)` | To octal string | `toOctal(63)` → `"0o77"` |
| `toHex(n)` | To hex string | `toHex(255)` → `"0xFF"` |
| `parseBase(s b)` | Parse specified base | `parseBase("1010" 2)` → `10` |
| `formatBase(n b)` | Format to specified base | `formatBase(255 16)` → `"FF"` |

## Bitwise Operations

### Bitwise Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `&` | Bitwise AND | `0b1100 & 0b1010` → `8` |
| `|` | Bitwise OR | `0b1100 \| 0b1010` → `14` |
| `^` | Bitwise XOR | `0b1100 ^ 0b1010` → `6` |
| `~` | Bitwise NOT | `~0` → `-1` |
| `<<` | Left shift | `1 << 4` → `16` |
| `>>` | Right shift | `16 >> 2` → `4` |
| `>>>` | Unsigned right shift | `(-1) >>> 1` → `2147483647` |

```seed
// Bitmask operations
flags = 0b1010
mask = 0b0010

// Check flag bit
if flags & mask != 0 {
  print("Flag is set")
}

// Set flag bit
flags = flags | 0b0100

// Clear flag bit
flags = flags & ~0b0010

// Toggle flag bit
flags = flags ^ 0b0001
```

## File Operations

| Function | Description |
|----------|-------------|
| `readFile(path)` | Read file |
| `writeFile(path content)` | Write file |
| `exists(path)` | Check exists |
| `isFile(path)` | Is file |
| `isDir(path)` | Is directory |
| `listDir(path)` | List directory |
| `mkdir(path)` | Create directory |
| `remove(path)` | Delete file |

## Network Requests

| Function | Description |
|----------|-------------|
| `httpGet(url)` | GET request |
| `httpPost(url data)` | POST request |
| `fetch(url options)` | Generic request |

## JSON

| Function | Description |
|----------|-------------|
| `jsonParse(str)` | Parse JSON |
| `jsonStringify(obj)` | To JSON |

## Output

| Method | Description |
|--------|-------------|
| `print(msg)` | Log output |
| `gui.table(data)` | Display table |
| `gui.progress(pct)` | Display progress |
| `gui.clear()` | Clear screen |

## Classes

```seed
class ClassName {
  init(params) {
    this.prop = value
  }

  method() {
    // body
  }
}

// Note: Class inheritance (extends) is not yet implemented
// Use composition pattern instead of inheritance
class Child {
  parent = null

  init(parent) {
    this.parent = parent
  }

  method() {
    // Delegate to parent
    this.parent.method()
  }
}
```

## Error Handling

```seed
try {
  // code
} catch (e) {
  print("Error: " + e)
}

throw "Error message"
```

## Switch

```seed
switch (value) {
  case 1 { }
  case 2 { }
  default { }
}
```

## Type System (Experimental)

```seed
interface Name {
  prop: type
}

type Alias = TypeDefinition
```

## Modules

```seed
// Export
export fn name() { }
export var = value

// Import
import { name } from "module.seed"
import * as mod from "module.seed"
```

## Comments

```seed
// Single-line comment

/*
  Multi-line comment
*/
```

## Important Rules

1. **Array elements separated by spaces**: `[1 2 3]` (commas are invalid in interpreter mode; deprecated in VM mode)
2. **Object properties separated by spaces**: `{a: 1 b: 2}` (commas are invalid in interpreter mode; deprecated in VM mode)
3. **Function parameters separated by spaces**: `fn add(a b)` (commas are invalid in interpreter mode; deprecated in VM mode)
4. **Logical operators use words**: `and or not` instead of `&& || !`
5. **Length uses function**: `len(arr)` instead of `arr.length`
6. **Commas cause errors in interpreter mode**: `,` triggers a LexerError; VM mode accepts commas as deprecated style. Always use spaces.
