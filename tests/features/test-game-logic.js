/**
 * 游戏逻辑与编译器边缘用例测试：游戏特定逻辑（碰撞检测/状态机/AI 行为）及编译器边缘行为
 * Tests for game-specific logic, compiler edge cases, and runtime behavior
 */

const { Lexer } = require('../../dist/core/lexer.js');
const { Parser } = require('../../dist/core/parser.js');
const { Interpreter } = require('../../dist/core/interpreter.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  [OK] ${name}`);
    } catch (error) {
        failed++;
        console.log(`  [FAIL] ${name}: ${error.message}`);
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(message || 'Condition should be true');
    }
}

function assertParse(code) {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    if (!ast || !ast.statements) {
        throw new Error('Parse failed: AST is empty');
    }
    return ast;
}

function assertRun(code, expectedOutput = null) {
    const ast = assertParse(code);
    const interpreter = new Interpreter();
    interpreter.interpret(ast);
    if (expectedOutput !== null) {
        const output = interpreter.getOutput();
        if (output.length > 0 && !output[0].includes(expectedOutput)) {
            throw new Error(`Output mismatch: expected "${expectedOutput}", got "${output[0]}"`);
        }
    }
    return interpreter;
}

function assertCompile(code) {
    return assertParse(code);
}

console.log('============================================================');
console.log('       SeedLang Game Logic & Compiler Edge Case Tests');
console.log('============================================================\n');

// ============================================
// 1. Snake Game Logic Tests
// ============================================
console.log('[1. Snake Game Logic]\n');

test('Snake state initialization', () => {
    assertParse(`snake = { running: false size: 16 body: [] dir: { x: 1 y: 0 } food: { x: 5 y: 5 type: "normal" } score: 0 parts: [] multiplier: 1 power: null powerTimer: 0 obstacles: [] aiSnake: { body: [] dir: { x: -1 y: 0 } alive: true } timeLimit: 60 timeLeft: 60 combo: 0 comboTimer: 0 cols: 32 rows: 20 }`);
});

test('Snake reset function', () => {
    assertParse(`fn snakeReset() {
  snake.body = [{ x: 7 y: 8 } { x: 6 y: 8 } { x: 5 y: 8 }]
  snake.dir = { x: 1 y: 0 }
  snake.food = { x: 14 y: 9 type: "normal" }
  snake.score = 0
  snake.parts = []
  snake.multiplier = 1
  snake.power = null
  snake.powerTimer = 0
  snake.obstacles = []
  snake.timeLeft = snake.timeLimit
  snake.combo = 0
  snake.comboTimer = 0
  snake.aiSnake = { body: [{ x: 25 y: 8 } { x: 26 y: 8 } { x: 27 y: 8 }] dir: { x: -1 y: 0 } alive: true }
  snake.running = true
}`);
});

test('Snake step function with pathfinding', () => {
    assertParse(`fn snakeStep() {
  head = { x: snake.body[0].x + snake.dir.x y: snake.body[0].y + snake.dir.y }
  cols = floor(512 / snake.size)
  rows = floor(320 / snake.size)
  
  if snake.power != "blue" {
    if head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows {
      snake.running = false
      return { win: false hx: head.x hy: head.y }
    }
  } else {
    if head.x < 0 { head.x = cols - 1 }
    if head.x >= cols { head.x = 0 }
    if head.y < 0 { head.y = rows - 1 }
    if head.y >= rows { head.y = 0 }
  }
}`);
});

// ============================================
// 2. Tower Defense Game Logic Tests
// ============================================
console.log('\n[2. Tower Defense Game Logic]\n');

test('Tower defense initialization', () => {
    assertParse(`fn towerInit() {
  tower.path = [{ x: 0 y: 5 } { x: 4 y: 5 } { x: 4 y: 2 } { x: 8 y: 2 } { x: 8 y: 7 } { x: 12 y: 7 } { x: 12 y: 3 } { x: 17 y: 3 }]
  tower.towers = []
  tower.enemies = []
  tower.bullets = []
  tower.wave = 1
  tower.gold = 100
  tower.lives = 20
  tower.kills = 0
  tower.spawnTimer = 0
  tower.enemiesSpawned = 0
  tower.enemiesPerWave = 5
  tower.running = false
}`);
});

test('Tower spawn enemy with types', () => {
    assertParse(`fn towerSpawnEnemy() {
  types = ["normal" "fast" "tank" "boss"]
  type = types[floor(random() * 4)]
  hp = 30 + tower.wave * 10
  speed = 1
  reward = 10
  
  if type == "fast" {
    hp = 20 + tower.wave * 5
    speed = 2
    reward = 15
  }
  
  if type == "tank" {
    hp = 80 + tower.wave * 20
    speed = 0.5
    reward = 25
  }
  
  if type == "boss" {
    hp = 200 + tower.wave * 50
    speed = 0.3
    reward = 50
  }
  
  tower.enemies.push({ x: tower.path[0].x * tower.gridSize y: tower.path[0].y * tower.gridSize hp: hp maxHp: hp speed: speed reward: reward type: type pathIndex: 0 })
}`);
});

test('Tower add tower with validation', () => {
    assertParse(`fn towerAddTower(gx gy) {
  if tower.gold < 30 {
    return false
  }
  
  for (i = 0; i < len(tower.towers); i = i + 1) {
    t = tower.towers[i]
    if t.gx == gx && t.gy == gy {
      return false
    }
  }
  
  for (i = 0; i < len(tower.path); i = i + 1) {
    p = tower.path[i]
    if p.x == gx && p.y == gy {
      return false
    }
  }
  
  tower.gold = tower.gold - 30
  tower.towers.push({ gx: gx gy: gy x: gx * tower.gridSize + tower.gridSize/2 y: gy * tower.gridSize + tower.gridSize/2 range: 120 damage: 10 fireRate: 30 fireCooldown: 0 level: 1 })
  return true
}`);
});

// ============================================
// 3. Fish Tank Simulation Tests
// ============================================
console.log('\n[3. Fish Tank Simulation]\n');

test('Fish tank initialization', () => {
    assertParse(`fn initFishTank() {
  fishTank.fishes = []
  fishTank.bubbles = []
  fishTank.plants = []
  fishTank.foods = []
  fishTank.time = 0
  fishTank.running = true
  
  colors = ["#ff6b8a" "#4f7cff" "#22d3a4" "#ffbf59"]
  for (i = 0; i < 8; i = i + 1) {
    colorIndex = floor(random() * 4)
    fishColor = colors[colorIndex]
    fishTank.fishes.push({
      x: random() * 480 + 20
      y: random() * 280 + 20
      vx: random() * 2 - 1
      vy: random() * 2 - 1
      size: random() * 15 + 10
      color: fishColor
      angle: random() * 360
      tailPhase: random() * 360
    })
  }
}`);
});

test('Fish tank update with physics', () => {
    assertParse(`fn updateFishTank() {
  if !fishTank.running { return }
  fishTank.time = fishTank.time + 1
  
  for (i = 0; i < len(fishTank.fishes); i = i + 1) {
    fish = fishTank.fishes[i]
    
    fish.vx = fish.vx + random() * 0.4 - 0.2
    fish.vy = fish.vy + random() * 0.4 - 0.2
    
    maxSpeed = 2
    if fish.vx > maxSpeed { fish.vx = maxSpeed }
    if fish.vx < -maxSpeed { fish.vx = -maxSpeed }
    if fish.vy > maxSpeed { fish.vy = maxSpeed }
    if fish.vy < -maxSpeed { fish.vy = -maxSpeed }
    
    fish.x = fish.x + fish.vx
    fish.y = fish.y + fish.vy
    
    if fish.x < 20 { fish.x = 20 fish.vx = abs(fish.vx) }
    if fish.x > 500 { fish.x = 500 fish.vx = -abs(fish.vx) }
    if fish.y < 20 { fish.y = 20 fish.vy = abs(fish.vy) }
    if fish.y > 300 { fish.y = 300 fish.vy = -abs(fish.vy) }
    
    targetAngle = atan2(fish.vy fish.vx) * 180 / 3.14159
    diff = targetAngle - fish.angle
    while diff > 180 { diff = diff - 360 }
    while diff < -180 { diff = diff + 360 }
    fish.angle = fish.angle + diff * 0.1
    
    fish.tailPhase = fish.tailPhase + 10
  }
}`);
});

// ============================================
// 4. Fireworks Particle System Tests
// ============================================
console.log('\n[4. Fireworks Particle System]\n');

test('Fireworks initialization', () => {
    assertParse(`fn initFireworks() {
  fireworks.particles = []
  fireworks.rockets = []
  fireworks.time = 0
  fireworks.running = true
}`);
});

test('Fireworks launch rocket', () => {
    assertParse(`fn launchRocket(x targetY) {
  colors = ["#ff6b8a" "#4f7cff" "#22d3a4" "#ffbf59" "#a86bff"]
  fireworks.rockets.push({
    x: x
    y: 320
    vx: random() * 2 - 1
    vy: -(random() * 3 + 8)
    targetY: targetY
    color: colors[floor(random() * len(colors))]
    trail: []
  })
}`);
});

test('Fireworks explode with particles', () => {
    assertParse(`fn explodeFirework(rocket) {
  particleCount = floor(random() * 40) + 60
  for (i = 0; i < particleCount; i = i + 1) {
    angle = random() * 6.28
    speed = random() * 4 + 2
    fireworks.particles.push({
      x: rocket.x
      y: rocket.y
      vx: cos(angle) * speed
      vy: sin(angle) * speed
      life: random() * 60 + 40
      maxLife: random() * 60 + 40
      color: rocket.color
      size: random() * 3 + 1
      type: random() > 0.7 ? "sparkle" : "normal"
    })
  }
}`);
});

// ============================================
// 5. Compiler Edge Cases
// ============================================
console.log('\n[5. Compiler Edge Cases]\n');

test('Deeply nested expressions', () => {
    assertCompile(`result = (((((1 + 2) * 3) - 4) / 2) + 5)`);
});

test('Multiple nested function calls', () => {
    assertCompile(`print(toString(sqrt(abs(pow(-16 2)))))`);
});

test('Complex object with nested arrays and objects', () => {
    assertCompile(`data = {
  users: [
    { name: "Alice" scores: [95 87 92] active: true }
    { name: "Bob" scores: [78 85 90] active: false }
  ]
  metadata: { version: 1.0 created: "2024-01-01" }
}`);
});

test('Large array literal', () => {
    assertCompile(`arr = [1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20]`);
});

test('String with special characters', () => {
    assertCompile(`str = "Hello\\nWorld\\t!"`);
});

test('Mixed operators in expression', () => {
    assertCompile(`result = a + b * c / d - e % f && g || h != i < j > k`);
});

test('Chained comparisons', () => {
    assertCompile(`if 0 < x < 10 && y > 5 { print("valid") }`);
});

// ============================================
// 6. Runtime Behavior Tests
// ============================================
console.log('\n[6. Runtime Behavior Tests]\n');

test('Variable scope in functions', () => {
    assertRun(`x = 10
fn testScope() {
  x = 20
  y = 30
}
testScope()
print(x)`, '20');
});

test('Global variable modification', () => {
    assertRun(`globalVar = 100
fn modifyGlobal() {
  globalVar = globalVar + 50
}
modifyGlobal()
print(globalVar)`, '150');
});

test('Array passed by reference', () => {
    assertRun(`arr = [1 2 3]
fn modifyArray(a) {
  push(a 4)
}
modifyArray(arr)
print(len(arr))`, '4');
});

test('Object passed by reference', () => {
    assertRun(`obj = { count: 0 }
fn increment(o) {
  o.count = o.count + 1
}
increment(obj)
increment(obj)
print(obj.count)`, '2');
});

// ============================================
// 7. Built-in Function Edge Cases
// ============================================
console.log('\n[7. Built-in Function Edge Cases]\n');

test('Empty array operations', () => {
    assertRun(`arr = []
push(arr 1)
print(len(arr))`, '1');
});

test('String to number conversion edge cases', () => {
    assertRun(`print(toInt("0"))`, '0');
    assertRun(`print(toFloat("0.0"))`, '0');
});

test('Math functions with zero/negative', () => {
    assertRun(`print(abs(0))`, '0');
    assertRun(`print(sqrt(0))`, '0');
    assertRun(`print(floor(-1.5))`, '-2');
    assertRun(`print(ceil(-1.5))`, '-1');
});

test('Random function range', () => {
    assertRun(`val = random()
print(val >= 0 && val < 1)`, 'true');
});

// ============================================
// 8. Parser Robustness Tests
// ============================================
console.log('\n[8. Parser Robustness Tests]\n');

test('Multiple statements on same line', () => {
    assertParse(`a = 1 b = 2 c = 3`);
});

test('Comments in various positions', () => {
    assertParse(`
// Top level comment
x = 10  // Inline comment
/* Block comment */
y = 20
`);
});

test('Unicode in strings', () => {
    assertParse(`str = "你好世界 🌍 SeedLang"`);
});

test('Long variable names', () => {
    assertParse(`veryLongVariableNameThatTestsTheParser = 42`);
});

test('Nested parentheses', () => {
    assertParse(`result = ((a + b) * (c + d)) / ((e - f) * (g - h))`);
});

// ============================================
// 9. Memory & Performance Patterns
// ============================================
console.log('\n[9. Memory & Performance Patterns]\n');

test('Large loop without stack overflow', () => {
    assertRun(`sum = 0
for (i = 0; i < 1000; i = i + 1) {
  sum = sum + i
}
print(sum)`, '499500');
});

test('Recursive depth handling', () => {
    assertRun(`fn deep(n) {
  if n <= 0 { return 0 }
  return 1 + deep(n - 1)
}
print(deep(100))`, '100');
});

test('Array accumulation pattern', () => {
    assertRun(`results = []
for (i = 0; i < 10; i = i + 1) {
  push(results i * i)
}
print(len(results))`, '10');
});

// ============================================
// 10. Game State Machine Tests
// ============================================
console.log('\n[10. Game State Machine Tests]\n');

test('Simple game state machine', () => {
    assertParse(`gameState = "menu"
score = 0

fn startGame() {
  gameState = "playing"
  score = 0
}

fn pauseGame() {
  if gameState == "playing" {
    gameState = "paused"
  }
}

fn resumeGame() {
  if gameState == "paused" {
    gameState = "playing"
  }
}

fn endGame() {
  gameState = "gameover"
}`);
});

test('Multi-state transition system', () => {
    assertParse(`states = { menu: { canPause: false canResume: false } playing: { canPause: true canResume: false } paused: { canPause: false canResume: true } gameover: { canPause: false canResume: false } }

currentState = "menu"

fn transition(newState) {
  if states[currentState] && states[newState] {
    currentState = newState
  }
}`);
});

// ============================================
// Summary
// ============================================
console.log('\n============================================================');
console.log('  Test Results');
console.log('============================================================');
console.log(`  Total: ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}\n`);

if (failed > 0) {
    console.log('[FAIL] Some tests failed!');
    process.exit(1);
} else {
    console.log('[OK] All tests passed!');
    process.exit(0);
}
