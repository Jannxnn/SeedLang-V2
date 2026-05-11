(function () {
  const q = (id) => document.getElementById(id);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("show")),
    { threshold: 0.16 }
  );
  qa(".reveal").forEach((n) => io.observe(n));

  const rnd = (a, b) => Math.random() * (b - a) + a;
  const color = (v) => "hsl(" + v + ",90%,65%)";

  console.log("🎮 SeedLang Games - Using compiled game logic from games_logic.js");

  // ==================== GAME 1: 贪吃蛇 ====================
  // 注意：游戏状态和逻辑函数来自 games_logic.js (SeedLang编译)
  const sCan = q("snakeCanvas");
  const sCtx = sCan ? sCan.getContext("2d") : null;
  const sScore = q("snakeScore");
  const sStatus = q("snakeStatus");
  const sFps = q("snakeFps");
  const sLen = q("snakeLen");
  let snakeTimer = 0;
  let sFrame = 0;
  let sLast = performance.now();
  const snake = {
    running: false,
    size: 16,
    body: [],
    dir: { x: 1, y: 0 },
    food: { x: 5, y: 5, type: "normal" },
    score: 0,
    parts: [],
    multiplier: 1,
    power: null,
    powerTimer: 0,
    obstacles: [],
    aiSnake: { body: [], dir: { x: -1, y: 0 }, alive: true },
    timeLimit: 60,
    timeLeft: 60,
    combo: 0,
    comboTimer: 0
  };

  function snakeReset() {
    snake.body = [{ x: 7, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 8 }];
    snake.dir = { x: 1, y: 0 };
    snake.food = { x: 14, y: 9, type: "normal" };
    snake.score = 0;
    snake.parts = [];
    snake.multiplier = 1;
    snake.power = null;
    snake.powerTimer = 0;
    snake.obstacles = [];
    snake.timeLeft = snake.timeLimit;
    snake.combo = 0;
    snake.comboTimer = 0;
    
    snake.aiSnake = {
      body: [{ x: 25, y: 8 }, { x: 26, y: 8 }, { x: 27, y: 8 }],
      dir: { x: -1, y: 0 },
      alive: true
    };
    
    snake.running = true;
    sScore.textContent = "0";
    sLen.textContent = "3";
    q("snakeMulti").textContent = "x1";
    q("snakePower").textContent = "无";
    q("snakeTime").textContent = "60";
    q("snakeCombo").textContent = "0";
    q("snakeAI").textContent = "存活";
    sStatus.innerHTML = "状态：进行中";
    
    for (let i = 0; i < 5; i += 1) {
      snake.obstacles.push({
        x: Math.floor(Math.random() * 28),
        y: Math.floor(Math.random() * 16)
      });
    }
  }

  function snakeBurst(x, y, c) {
    for (let i = 0; i < 22; i += 1) {
      snake.parts.push({ x: x, y: y, vx: rnd(-2, 2), vy: rnd(-2, 2), life: rnd(20, 40), c: c });
    }
  }

  function snakeEnd(win, hx, hy) {
    snake.running = false;
    sStatus.innerHTML = win
      ? "<span class=good>状态：胜利！你完成了目标</span>"
      : "<span class=bad>状态：死亡！撞墙或撞到自己</span>";
    const px = (hx + 0.5) * snake.size;
    const py = (hy + 0.5) * snake.size;
    snakeBurst(px, py, win ? "#22d3a4" : "#ff5d73");
  }

  function snakeSpawnFood() {
    const cols = Math.floor(sCan.width / snake.size);
    const rows = Math.floor(sCan.height / snake.size);
    let ok = false;
    while (!ok) {
      const fx = Math.floor(Math.random() * cols);
      const fy = Math.floor(Math.random() * rows);
      ok = !snake.body.some((p) => p.x === fx && p.y === fy);
      ok = ok && !snake.obstacles.some((o) => o.x === fx && o.y === fy);
      if (ok) {
        const rand = Math.random();
        let type = "normal";
        if (rand < 0.1) type = "gold";
        else if (rand < 0.18) type = "blue";
        else if (rand < 0.25) type = "red";
        snake.food = { x: fx, y: fy, type: type };
      }
    }
  }

  function snakeStep() {
    if (!snake.running) return;
    
    snake.timeLeft -= 1/10;
    q("snakeTime").textContent = Math.ceil(snake.timeLeft);
    if (snake.timeLeft <= 0) {
      snakeEnd(false, snake.body[0].x, snake.body[0].y);
      return;
    }
    
    if (snake.comboTimer > 0) {
      snake.comboTimer -= 1;
      if (snake.comboTimer <= 0) {
        snake.combo = 0;
        q("snakeCombo").textContent = "0";
      }
    }
    
    if (snake.powerTimer > 0) {
      snake.powerTimer -= 1;
      if (snake.powerTimer <= 0) {
        snake.power = null;
        snake.multiplier = 1;
        q("snakeMulti").textContent = "x1";
        q("snakePower").textContent = "无";
      }
    }
    
    if (snake.aiSnake.alive && Math.random() < 0.15) {
      const aiHead = snake.aiSnake.body[0];
      const food = snake.food;
      const cols = Math.floor(sCan.width / snake.size);
      const rows = Math.floor(sCan.height / snake.size);
      
      let bestDir = snake.aiSnake.dir;
      let minDist = Infinity;
      
      const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
      for (const d of dirs) {
        if (d.x === -snake.aiSnake.dir.x && d.y === -snake.aiSnake.dir.y) continue;
        
        const nx = aiHead.x + d.x;
        const ny = aiHead.y + d.y;
        
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (snake.aiSnake.body.some((p, i) => i > 0 && p.x === nx && p.y === ny)) continue;
        if (snake.obstacles.some((o) => o.x === nx && o.y === ny)) continue;
        
        const dist = Math.abs(nx - food.x) + Math.abs(ny - food.y);
        if (dist < minDist) {
          minDist = dist;
          bestDir = d;
        }
      }
      
      snake.aiSnake.dir = bestDir;
    }
    
    if (snake.aiSnake.alive) {
      const aiHead = {
        x: snake.aiSnake.body[0].x + snake.aiSnake.dir.x,
        y: snake.aiSnake.body[0].y + snake.aiSnake.dir.y
      };
      const cols = Math.floor(sCan.width / snake.size);
      const rows = Math.floor(sCan.height / snake.size);
      
      if (aiHead.x < 0 || aiHead.x >= cols || aiHead.y < 0 || aiHead.y >= rows ||
          snake.aiSnake.body.some((p, i) => i > 0 && p.x === aiHead.x && p.y === aiHead.y) ||
          snake.obstacles.some((o) => o.x === aiHead.x && o.y === aiHead.y)) {
        snake.aiSnake.alive = false;
        q("snakeAI").textContent = "死亡";
        snakeBurst((aiHead.x + 0.5) * snake.size, (aiHead.y + 0.5) * snake.size, "#ff9f43");
      } else {
        snake.aiSnake.body.unshift(aiHead);
        
        if (aiHead.x === snake.food.x && aiHead.y === snake.food.y) {
          snakeBurst((aiHead.x + 0.5) * snake.size, (aiHead.y + 0.5) * snake.size, "#ff9f43");
          snakeSpawnFood();
        } else {
          snake.aiSnake.body.pop();
        }
      }
    }
    
    const head = { x: snake.body[0].x + snake.dir.x, y: snake.body[0].y + snake.dir.y };
    const cols = Math.floor(sCan.width / snake.size);
    const rows = Math.floor(sCan.height / snake.size);

    if (snake.power !== "blue") {
      if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) {
        const cx = Math.max(0, Math.min(cols - 1, head.x));
        const cy = Math.max(0, Math.min(rows - 1, head.y));
        snakeEnd(false, cx, cy);
        return;
      }
    } else {
      if (head.x < 0) head.x = cols - 1;
      if (head.x >= cols) head.x = 0;
      if (head.y < 0) head.y = rows - 1;
      if (head.y >= rows) head.y = 0;
    }

    if (snake.body.some((p) => p.x === head.x && p.y === head.y)) {
      snakeEnd(false, head.x, head.y);
      return;
    }

    if (snake.aiSnake.alive && snake.aiSnake.body.some((p) => p.x === head.x && p.y === head.y)) {
      snakeEnd(false, head.x, head.y);
      return;
    }

    if (snake.obstacles.some((o) => o.x === head.x && o.y === head.y)) {
      snakeEnd(false, head.x, head.y);
      return;
    }

    snake.body.unshift(head);
    if (head.x === snake.food.x && head.y === snake.food.y) {
      snake.combo += 1;
      snake.comboTimer = 50;
      q("snakeCombo").textContent = String(snake.combo);
      
      let points = 1 + Math.floor(snake.combo / 3);
      let foodColor = color(190 + snake.score * 10);
      
      if (snake.food.type === "gold") {
        points = 2 + Math.floor(snake.combo / 2);
        foodColor = "#ffd700";
        snake.multiplier = Math.min(snake.multiplier + 1, 5);
        q("snakeMulti").textContent = "x" + snake.multiplier;
      } else if (snake.food.type === "blue") {
        foodColor = "#6bc8ff";
        snake.power = "blue";
        snake.powerTimer = 100;
        q("snakePower").textContent = "穿墙";
      } else if (snake.food.type === "red") {
        foodColor = "#ff5d73";
        snake.power = "red";
        snake.powerTimer = 50;
        q("snakePower").textContent = "加速";
      }
      
      snake.score += points * snake.multiplier;
      sScore.textContent = String(snake.score);
      sLen.textContent = String(snake.body.length);
      snakeBurst((head.x + 0.5) * snake.size, (head.y + 0.5) * snake.size, foodColor);
      snakeSpawnFood();
      if (snake.score >= 15) {
        snakeEnd(true, head.x, head.y);
      }
    } else {
      snake.body.pop();
    }
  }

  function snakeDraw() {
    sCtx.clearRect(0, 0, sCan.width, sCan.height);
    sCtx.fillStyle = "#060c1f";
    sCtx.fillRect(0, 0, sCan.width, sCan.height);
    for (let x = 0; x < sCan.width; x += snake.size) {
      for (let y = 0; y < sCan.height; y += snake.size) {
        sCtx.strokeStyle = "rgba(120,150,255,.08)";
        sCtx.strokeRect(x, y, snake.size, snake.size);
      }
    }
    
    snake.obstacles.forEach((o) => {
      sCtx.fillStyle = "#ff5d73";
      sCtx.fillRect(o.x * snake.size + 2, o.y * snake.size + 2, snake.size - 4, snake.size - 4);
      sCtx.fillStyle = "#ff8c9c";
      sCtx.fillRect(o.x * snake.size + 4, o.y * snake.size + 4, snake.size - 8, snake.size - 8);
    });
    
    let foodColor = "#ffbf59";
    if (snake.food.type === "gold") foodColor = "#ffd700";
    else if (snake.food.type === "blue") foodColor = "#6bc8ff";
    else if (snake.food.type === "red") foodColor = "#ff5d73";
    
    sCtx.fillStyle = foodColor;
    sCtx.beginPath();
    sCtx.arc(snake.food.x * snake.size + snake.size/2, snake.food.y * snake.size + snake.size/2, snake.size/2 - 2, 0, Math.PI * 2);
    sCtx.fill();
    
    if (snake.food.type !== "normal") {
      sCtx.strokeStyle = "#fff";
      sCtx.lineWidth = 2;
      sCtx.stroke();
      sCtx.lineWidth = 1;
    }
    
    snake.body.forEach((p, i) => {
      sCtx.fillStyle = i === 0 ? "#4f7cff" : color(210 + i * 3);
      sCtx.fillRect(p.x * snake.size + 1, p.y * snake.size + 1, snake.size - 2, snake.size - 2);
    });
    
    if (snake.aiSnake.alive) {
      snake.aiSnake.body.forEach((p, i) => {
        sCtx.fillStyle = i === 0 ? "#ff9f43" : color(30 + i * 3);
        sCtx.fillRect(p.x * snake.size + 1, p.y * snake.size + 1, snake.size - 2, snake.size - 2);
      });
    }
    
    if (snake.power === "blue") {
      sCtx.strokeStyle = "#6bc8ff";
      sCtx.lineWidth = 2;
      sCtx.strokeRect(0, 0, sCan.width, sCan.height);
      sCtx.lineWidth = 1;
    }
    
    if (snake.combo > 0) {
      sCtx.fillStyle = "rgba(255,215,0," + (0.3 + snake.combo * 0.1) + ")";
      sCtx.font = "bold 14px sans-serif";
      sCtx.textAlign = "center";
      sCtx.fillText("COMBO x" + snake.combo, sCan.width / 2, 20);
    }
    
    for (let i = snake.parts.length - 1; i >= 0; i -= 1) {
      const p = snake.parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.life -= 1;
      sCtx.fillStyle = p.c;
      sCtx.globalAlpha = Math.max(0, p.life / 40);
      sCtx.fillRect(p.x, p.y, 3, 3);
      sCtx.globalAlpha = 1;
      if (p.life <= 0) snake.parts.splice(i, 1);
    }
  }

  function snakeLoop() {
    snakeStep();
    snakeDraw();
    sFrame += 1;
    const now = performance.now();
    if (now - sLast >= 1000) {
      sFps.textContent = String(sFrame);
      sFrame = 0;
      sLast = now;
    }
  }

  q("snakeStart").onclick = function () {
    snakeReset();
    if (!snakeTimer) snakeTimer = setInterval(snakeLoop, 95);
  };

  // ==================== GAME 2: 飞行射击 ====================
  const gCan = q("shootCanvas");
  const gCtx = gCan ? gCan.getContext("2d") : null;
  const gKills = q("shootKills");
  const gLives = q("shootLives");
  const gStatus = q("shootStatus");
  const gMissed = q("shootMissed");
  const gFps = q("shootFps");
  let gFrame = 0;
  let gLast = performance.now();
  const game = {
    running: false,
    shipX: gCan.width / 2,
    keys: {},
    bullets: [],
    enemies: [],
    parts: [],
    stars: [],
    items: [],
    kills: 0,
    lives: 3,
    missed: 0,
    lastSpawn: 0,
    lastShot: 0,
    power: null,
    powerTimer: 0,
    shield: false,
    shieldTimer: 0,
    boss: null,
    bossSpawned: false,
    wingmen: [],
    combo: 0,
    comboTimer: 0,
    chargeLevel: 0,
    charging: false
  };

  for (let i = 0; i < 70; i += 1) {
    game.stars.push({ x: rnd(0, gCan.width), y: rnd(0, gCan.height), s: rnd(0.4, 1.8), v: rnd(0.3, 1.1) });
  }

  function shootReset() {
    game.running = true;
    game.shipX = gCan.width / 2;
    game.bullets = [];
    game.enemies = [];
    game.parts = [];
    game.items = [];
    game.kills = 0;
    game.lives = 3;
    game.missed = 0;
    game.lastSpawn = 0;
    game.lastShot = 0;
    game.power = null;
    game.powerTimer = 0;
    game.shield = false;
    game.shieldTimer = 0;
    game.boss = null;
    game.bossSpawned = false;
    game.wingmen = [];
    game.combo = 0;
    game.comboTimer = 0;
    game.chargeLevel = 0;
    game.charging = false;
    gKills.textContent = "0";
    gLives.textContent = "3";
    gMissed.textContent = "0";
    q("shootItem").textContent = "无";
    q("shootCombo").textContent = "0";
    q("shootWingmen").textContent = "0";
    q("shootCharge").textContent = "0%";
    gStatus.innerHTML = "状态：进行中（自动开火）";
  }

  function shootBurst(x, y, c, n) {
    for (let i = 0; i < n; i += 1) {
      game.parts.push({ x: x, y: y, vx: rnd(-2.8, 2.8), vy: rnd(-2.8, 2.8), life: rnd(16, 38), c: c });
    }
  }

  function shootEnd(win) {
    game.running = false;
    gStatus.innerHTML = win
      ? "<span class=good>状态：胜利！成功清空空域</span>"
      : "<span class=bad>状态：失败！生命耗尽</span>";
    shootBurst(gCan.width / 2, gCan.height / 2, win ? "#2dd4bf" : "#ff5d73", 90);
  }

  function spawnEnemy(ts) {
    if (game.bossSpawned) return;
    if (ts - game.lastSpawn < 480) return;
    game.lastSpawn = ts;
    
    if (game.kills >= 25 && !game.bossSpawned) {
      game.bossSpawned = true;
      game.boss = {
        x: gCan.width / 2,
        y: -60,
        hp: 100,
        maxHp: 100,
        phase: 1,
        targetY: 60
      };
      return;
    }
    
    const rand = Math.random();
    let type = "normal";
    let w = 22, h = 18, v = rnd(1.2, 2.4), hp = 1;
    
    if (rand < 0.15) {
      type = "fast";
      w = 16;
      h = 14;
      v = rnd(2.5, 3.5);
      hp = 1;
    } else if (rand < 0.25) {
      type = "tank";
      w = 32;
      h = 26;
      v = rnd(0.8, 1.2);
      hp = 3;
    } else if (rand < 0.32) {
      type = "shooter";
      w = 24;
      h = 20;
      v = rnd(1, 1.5);
      hp = 2;
    }
    
    game.enemies.push({
      x: rnd(24, gCan.width - 24),
      y: -20,
      v: v,
      w: w,
      h: h,
      type: type,
      hp: hp,
      lastShot: 0
    });
  }

  function shoot(ts, boost) {
    const cd = boost ? 90 : (game.power === "rapid" ? 100 : 200);
    if (ts - game.lastShot < cd) return;
    game.lastShot = ts;
    
    if (game.power === "spread") {
      for (let i = -2; i <= 2; i += 1) {
        game.bullets.push({ x: game.shipX, y: gCan.height - 28, v: 6.2, dx: i * 0.5 });
      }
    } else {
      game.bullets.push({ x: game.shipX, y: gCan.height - 28, v: 6.2, dx: 0 });
    }
    
    game.wingmen.forEach((w, idx) => {
      const offsetX = (idx === 0 ? -30 : 30);
      game.bullets.push({ x: game.shipX + offsetX, y: gCan.height - 35, v: 5.5, dx: 0 });
    });
    
    shootBurst(game.shipX, gCan.height - 30, "#b8ccff", 6);
  }

  function chargeShoot() {
    if (game.chargeLevel < 50) return;
    
    const damage = Math.floor(game.chargeLevel / 10);
    for (let i = 0; i < damage; i += 1) {
      game.bullets.push({
        x: game.shipX + rnd(-20, 20),
        y: gCan.height - 28 - i * 15,
        v: 8 + i * 0.5,
        dx: 0,
        charged: true
      });
    }
    shootBurst(game.shipX, gCan.height - 30, "#ffd700", 20);
    game.chargeLevel = 0;
    q("shootCharge").textContent = "0%";
  }

  function rectHit(a, b) {
    return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  }

  function shootUpdate(ts) {
    if (!game.running) return;
    
    if (game.comboTimer > 0) {
      game.comboTimer -= 1;
      if (game.comboTimer <= 0) {
        game.combo = 0;
        q("shootCombo").textContent = "0";
      }
    }
    
    if (game.keys.Shift && !game.charging) {
      game.charging = true;
    }
    if (game.charging) {
      if (game.keys.Shift) {
        game.chargeLevel = Math.min(100, game.chargeLevel + 2);
        q("shootCharge").textContent = game.chargeLevel + "%";
      } else {
        chargeShoot();
        game.charging = false;
      }
    }
    
    if (game.powerTimer > 0) {
      game.powerTimer -= 1;
      if (game.powerTimer <= 0) {
        game.power = null;
        q("shootItem").textContent = "无";
      }
    }
    if (game.shieldTimer > 0) {
      game.shieldTimer -= 1;
      if (game.shieldTimer <= 0) {
        game.shield = false;
      }
    }
    
    if (game.keys.ArrowLeft || game.keys.a || game.keys.A) game.shipX -= 4.8;
    if (game.keys.ArrowRight || game.keys.d || game.keys.D) game.shipX += 4.8;
    game.shipX = Math.max(18, Math.min(gCan.width - 18, game.shipX));

    shoot(ts, false);
    if (game.keys[" "]) shoot(ts, true);
    spawnEnemy(ts);

    game.bullets.forEach((b) => {
      b.y -= b.v;
      b.x += b.dx || 0;
    });
    game.bullets = game.bullets.filter((b) => b.y > -10 && b.x > -10 && b.x < gCan.width + 10);

    if (game.boss) {
      if (game.boss.y < game.boss.targetY) {
        game.boss.y += 1;
      } else {
        game.boss.x += Math.sin(ts * 0.002) * 2;
      }
      
      for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
        const b = game.bullets[i];
        if (Math.abs(b.x - game.boss.x) < 40 && Math.abs(b.y - game.boss.y) < 30) {
          game.bullets.splice(i, 1);
          const dmg = b.charged ? 15 : 5;
          game.boss.hp -= dmg;
          shootBurst(b.x, b.y, b.charged ? "#ffd700" : "#ffb86b", b.charged ? 15 : 8);
          if (game.boss.hp <= 0) {
            shootBurst(game.boss.x, game.boss.y, "#ffd700", 100);
            game.boss = null;
            shootEnd(true);
            return;
          }
        }
      }
    }

    for (let i = game.enemies.length - 1; i >= 0; i -= 1) {
      const e = game.enemies[i];
      e.y += e.v;
      
      if (e.type === "shooter" && ts - e.lastShot > 1500) {
        e.lastShot = ts;
        game.enemies.push({
          x: e.x,
          y: e.y + 10,
          v: 3,
          w: 8,
          h: 8,
          type: "enemyBullet",
          hp: 1
        });
      }

      let dead = false;
      for (let j = game.bullets.length - 1; j >= 0; j -= 1) {
        const b = game.bullets[j];
        if (Math.abs(b.x - e.x) < e.w / 2 + 4 && Math.abs(b.y - e.y) < e.h / 2 + 4) {
          game.bullets.splice(j, 1);
          const dmg = b.charged ? 3 : 1;
          e.hp -= dmg;
          shootBurst(b.x, b.y, b.charged ? "#ffd700" : "#ffb86b", b.charged ? 10 : 5);
          if (e.hp <= 0) dead = true;
          break;
        }
      }

      if (dead) {
        game.enemies.splice(i, 1);
        game.kills += 1;
        game.combo += 1;
        game.comboTimer = 60;
        q("shootCombo").textContent = String(game.combo);
        gKills.textContent = String(game.kills);
        shootBurst(e.x, e.y, e.type === "tank" ? "#a86bff" : "#ffb86b", e.type === "tank" ? 35 : 22);
        
        if (Math.random() < 0.2) {
          const itemTypes = ["shield", "rapid", "spread", "wingman"];
          const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
          game.items.push({ x: e.x, y: e.y, type: itemType, v: 1.5 });
        }
        continue;
      }

      if (e.type === "enemyBullet") {
        if (e.y > gCan.height + 24) {
          game.enemies.splice(i, 1);
          continue;
        }
      } else {
        if (e.y > gCan.height + 24) {
          game.enemies.splice(i, 1);
          game.missed += 1;
          game.combo = 0;
          q("shootCombo").textContent = "0";
          gMissed.textContent = String(game.missed);
          continue;
        }
      }

      const ship = { x: game.shipX, y: gCan.height - 22, w: 24, h: 20 };
      const en = { x: e.x, y: e.y, w: e.w, h: e.h };
      if (rectHit(ship, en)) {
        if (game.shield) {
          game.enemies.splice(i, 1);
          shootBurst(e.x, e.y, "#22d3a4", 20);
        } else {
          game.enemies.splice(i, 1);
          game.lives -= 1;
          gLives.textContent = String(game.lives);
          shootBurst(game.shipX, gCan.height - 24, "#ff5d73", 28);
          if (game.lives <= 0) shootEnd(false);
        }
      }
    }

    for (let i = game.items.length - 1; i >= 0; i -= 1) {
      const item = game.items[i];
      item.y += item.v;
      
      if (item.y > gCan.height + 20) {
        game.items.splice(i, 1);
        continue;
      }
      
      if (Math.abs(item.x - game.shipX) < 20 && Math.abs(item.y - (gCan.height - 22)) < 20) {
        game.items.splice(i, 1);
        if (item.type === "shield") {
          game.shield = true;
          game.shieldTimer = 300;
          q("shootItem").textContent = "护盾";
        } else if (item.type === "rapid") {
          game.power = "rapid";
          game.powerTimer = 500;
          q("shootItem").textContent = "强化";
        } else if (item.type === "spread") {
          game.power = "spread";
          game.powerTimer = 400;
          q("shootItem").textContent = "散射";
        } else if (item.type === "wingman") {
          if (game.wingmen.length < 2) {
            game.wingmen.push({ side: game.wingmen.length === 0 ? "left" : "right" });
            q("shootWingmen").textContent = String(game.wingmen.length);
            q("shootItem").textContent = "僚机+" + game.wingmen.length;
          }
        }
        shootBurst(item.x, item.y, "#22d3a4", 15);
      }
    }

    for (let i = game.parts.length - 1; i >= 0; i -= 1) {
      const p = game.parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.life -= 1;
      if (p.life <= 0) game.parts.splice(i, 1);
    }
  }

  function shootDraw() {
    gCtx.clearRect(0, 0, gCan.width, gCan.height);
    gCtx.fillStyle = "#040914";
    gCtx.fillRect(0, 0, gCan.width, gCan.height);

    game.stars.forEach((s) => {
      s.y += s.v;
      if (s.y > gCan.height) {
        s.y = 0;
        s.x = rnd(0, gCan.width);
      }
      gCtx.fillStyle = "rgba(180,210,255,.75)";
      gCtx.fillRect(s.x, s.y, s.s, s.s);
    });

    gCtx.strokeStyle = "rgba(120,150,255,.14)";
    for (let i = 0; i < 6; i += 1) {
      gCtx.beginPath();
      gCtx.moveTo(0, i * 54 + 8);
      gCtx.lineTo(gCan.width, i * 54 + 8);
      gCtx.stroke();
    }

    if (game.boss) {
      gCtx.fillStyle = "#a86bff";
      gCtx.fillRect(game.boss.x - 40, game.boss.y - 30, 80, 60);
      gCtx.fillStyle = "#333";
      gCtx.fillRect(game.boss.x - 40, game.boss.y - 45, 80, 8);
      gCtx.fillStyle = "#ff5d73";
      gCtx.fillRect(game.boss.x - 40, game.boss.y - 45, (game.boss.hp / game.boss.maxHp) * 80, 8);
    }

    gCtx.fillStyle = game.shield ? "#22d3a4" : "#7ea7ff";
    gCtx.beginPath();
    gCtx.moveTo(game.shipX, gCan.height - 44);
    gCtx.lineTo(game.shipX - 14, gCan.height - 10);
    gCtx.lineTo(game.shipX + 14, gCan.height - 10);
    gCtx.closePath();
    gCtx.fill();
    
    game.wingmen.forEach((w, idx) => {
      const offsetX = idx === 0 ? -30 : 30;
      gCtx.fillStyle = "#6bc8ff";
      gCtx.beginPath();
      gCtx.moveTo(game.shipX + offsetX, gCan.height - 38);
      gCtx.lineTo(game.shipX + offsetX - 8, gCan.height - 18);
      gCtx.lineTo(game.shipX + offsetX + 8, gCan.height - 18);
      gCtx.closePath();
      gCtx.fill();
    });
    
    if (game.shield) {
      gCtx.strokeStyle = "#22d3a4";
      gCtx.lineWidth = 2;
      gCtx.beginPath();
      gCtx.arc(game.shipX, gCan.height - 27, 22, 0, Math.PI * 2);
      gCtx.stroke();
      gCtx.lineWidth = 1;
    }
    
    if (game.combo > 0) {
      gCtx.fillStyle = "rgba(255,215,0," + (0.5 + game.combo * 0.05) + ")";
      gCtx.font = "bold 16px sans-serif";
      gCtx.textAlign = "center";
      gCtx.fillText("COMBO x" + game.combo, gCan.width / 2, 25);
    }
    
    if (game.chargeLevel > 0) {
      gCtx.fillStyle = "#333";
      gCtx.fillRect(game.shipX - 20, gCan.height - 55, 40, 6);
      gCtx.fillStyle = game.chargeLevel >= 100 ? "#ffd700" : "#7dd3fc";
      gCtx.fillRect(game.shipX - 20, gCan.height - 55, (game.chargeLevel / 100) * 40, 6);
    }

    game.bullets.forEach((b) => {
      gCtx.fillStyle = b.charged ? "#ffd700" : (game.power ? "#22d3a4" : "#c8dbff");
      gCtx.fillRect(b.x - 2, b.y - 9, 4, 12);
    });

    game.enemies.forEach((e) => {
      if (e.type === "fast") {
        gCtx.fillStyle = "#6bc8ff";
        gCtx.fillRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
      } else if (e.type === "tank") {
        gCtx.fillStyle = "#a86bff";
        gCtx.fillRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
        gCtx.fillStyle = "#c8a8ff";
        gCtx.fillRect(e.x - e.w/2 + 4, e.y - e.h/2 + 4, e.w - 8, 4);
      } else if (e.type === "shooter") {
        gCtx.fillStyle = "#ff8c6b";
        gCtx.fillRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
        gCtx.fillStyle = "#ffc06b";
        gCtx.fillRect(e.x - 4, e.y + e.h/2 - 4, 8, 8);
      } else if (e.type === "enemyBullet") {
        gCtx.fillStyle = "#ff5d73";
        gCtx.beginPath();
        gCtx.arc(e.x, e.y, 4, 0, Math.PI * 2);
        gCtx.fill();
      } else {
        gCtx.fillStyle = "#ff7f93";
        gCtx.fillRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
        gCtx.fillStyle = "#ffd1d8";
        gCtx.fillRect(e.x - 4, e.y - e.h/2 + 4, 8, 4);
      }
    });

    game.items.forEach((item) => {
      let color = "#22d3a4";
      if (item.type === "rapid") color = "#ffb86b";
      else if (item.type === "spread") color = "#a86bff";
      else if (item.type === "wingman") color = "#6bc8ff";
      gCtx.fillStyle = color;
      gCtx.beginPath();
      gCtx.arc(item.x, item.y, 8, 0, Math.PI * 2);
      gCtx.fill();
      gCtx.fillStyle = "#fff";
      gCtx.font = "10px Arial";
      gCtx.textAlign = "center";
      const icon = item.type === "shield" ? "S" : item.type === "rapid" ? "R" : item.type === "wingman" ? "W" : "P";
      gCtx.fillText(icon, item.x, item.y + 4);
    });

    for (let i = 0; i < game.parts.length; i += 1) {
      const p = game.parts[i];
      gCtx.globalAlpha = Math.max(0, p.life / 40);
      gCtx.fillStyle = p.c;
      gCtx.fillRect(p.x, p.y, 3, 3);
      gCtx.globalAlpha = 1;
    }
  }

  function shootLoop(ts) {
    shootUpdate(ts);
    shootDraw();
    gFrame += 1;
    if (ts - gLast >= 1000) {
      gFps.textContent = String(gFrame);
      gFrame = 0;
      gLast = ts;
    }
    requestAnimationFrame(shootLoop);
  }

  q("shootStart").onclick = function () {
    shootReset();
  };

  // ==================== GAME 3: 打砖块 ====================
  const bCan = q("breakoutCanvas");
  const bCtx = bCan ? bCan.getContext("2d") : null;
  const bScore = q("breakoutScore");
  const bLives = q("breakoutLives");
  const bBricks = q("breakoutBricks");
  const bCombo = q("breakoutCombo");
  const bFps = q("breakoutFps");
  const bStatus = q("breakoutStatus");
  let bFrame = 0;
  let bLast = performance.now();
  let bAnimId = null;

  const breakout = {
    running: false,
    paddle: { x: 0, w: 80, h: 12 },
    ball: { x: 0, y: 0, dx: 0, dy: 0, r: 7 },
    balls: [],
    bricks: [],
    parts: [],
    items: [],
    score: 0,
    lives: 3,
    combo: 0,
    keys: {},
    power: null,
    powerTimer: 0,
    laser: false,
    laserTimer: 0,
    lastLaser: 0,
    level: 1,
    maxLevel: 3,
    bossBrick: null,
    multiHit: 0
  };

  const brickColors = ["#ff6b8a", "#ff8c6b", "#ffc06b", "#6bff8c", "#6bc8ff", "#a86bff"];

  function breakoutReset() {
    breakout.running = true;
    breakout.paddle.x = bCan.width / 2 - 40;
    breakout.paddle.w = 80;
    breakout.ball.x = bCan.width / 2;
    breakout.ball.y = bCan.height - 50;
    breakout.ball.dx = 3.5 * (Math.random() > 0.5 ? 1 : -1);
    breakout.ball.dy = -4;
    breakout.balls = [{ ...breakout.ball }];
    breakout.bricks = [];
    breakout.parts = [];
    breakout.items = [];
    breakout.score = 0;
    breakout.lives = 3;
    breakout.combo = 0;
    breakout.power = null;
    breakout.powerTimer = 0;
    breakout.laser = false;
    breakout.laserTimer = 0;
    breakout.lastLaser = 0;
    breakout.level = 1;
    breakout.bossBrick = null;
    breakout.multiHit = 0;

    generateLevel(1);

    bScore.textContent = "0";
    bLives.textContent = "3";
    bBricks.textContent = String(breakout.bricks.filter(b => b.alive).length);
    bCombo.textContent = "0";
    q("breakoutItem").textContent = "无";
    q("breakoutLevel").textContent = "1";
    q("breakoutBoss").textContent = "无";
    bStatus.innerHTML = "状态：进行中";
  }

  function generateLevel(level) {
    breakout.bricks = [];
    breakout.bossBrick = null;
    
    const cols = 10;
    const rows = 4 + level;
    const bw = 48;
    const bh = 18;
    const gap = 4;
    const startX = (bCan.width - (cols * (bw + gap) - gap)) / 2;
    const startY = 30;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const rand = Math.random();
        let type = "normal";
        let hp = 1;
        let color = brickColors[r % brickColors.length];
        
        if (rand < 0.05 + level * 0.02) {
          type = "steel";
          hp = 2 + level;
          color = "#888";
        } else if (rand < 0.12 + level * 0.02) {
          type = "explosive";
          hp = 1;
          color = "#ff5d73";
        } else if (rand < 0.18 + level * 0.02) {
          type = "multi";
          hp = 2;
          color = "#a86bff";
        }
        
        breakout.bricks.push({
          x: startX + c * (bw + gap),
          y: startY + r * (bh + gap),
          w: bw,
          h: bh,
          color: color,
          alive: true,
          type: type,
          hp: hp
        });
      }
    }
    
    if (level >= 2) {
      breakout.bossBrick = {
        x: bCan.width / 2 - 40,
        y: 10,
        w: 80,
        h: 20,
        hp: 10 * level,
        maxHp: 10 * level,
        phase: 1
      };
      q("breakoutBoss").textContent = breakout.bossBrick.hp + "HP";
    }
    
    bBricks.textContent = String(breakout.bricks.filter(b => b.alive).length);
  }

  function breakoutBurst(x, y, c, n) {
    for (let i = 0; i < n; i += 1) {
      breakout.parts.push({ x: x, y: y, vx: rnd(-3, 3), vy: rnd(-3, 3), life: rnd(20, 40), c: c });
    }
  }

  function breakoutEnd(win) {
    breakout.running = false;
    bStatus.innerHTML = win
      ? "<span class=good>状态：胜利！清空所有砖块</span>"
      : "<span class=bad>状态：失败！生命耗尽</span>";
    breakoutBurst(bCan.width / 2, bCan.height / 2, win ? "#22d3a4" : "#ff5d73", 60);
  }

  function breakoutUpdate(ts) {
    if (!breakout.running) return;

    if (breakout.powerTimer > 0) {
      breakout.powerTimer -= 1;
      if (breakout.powerTimer <= 0) {
        breakout.paddle.w = 80;
        breakout.power = null;
        q("breakoutItem").textContent = "无";
      }
    }
    if (breakout.laserTimer > 0) {
      breakout.laserTimer -= 1;
      if (breakout.laserTimer <= 0) {
        breakout.laser = false;
      }
    }

    if (breakout.keys.ArrowLeft || breakout.keys.a || breakout.keys.A) {
      breakout.paddle.x -= 6;
    }
    if (breakout.keys.ArrowRight || breakout.keys.d || breakout.keys.D) {
      breakout.paddle.x += 6;
    }
    breakout.paddle.x = Math.max(0, Math.min(bCan.width - breakout.paddle.w, breakout.paddle.x));

    if (breakout.laser && ts - breakout.lastLaser > 200) {
      breakout.lastLaser = ts;
      breakout.items.push({
        x: breakout.paddle.x + breakout.paddle.w / 2,
        y: bCan.height - 30,
        type: "laser",
        dy: -8
      });
    }

    for (let i = breakout.balls.length - 1; i >= 0; i -= 1) {
      const ball = breakout.balls[i];
      ball.x += ball.dx;
      ball.y += ball.dy;

      if (ball.x <= ball.r || ball.x >= bCan.width - ball.r) {
        ball.dx *= -1;
      }
      if (ball.y <= ball.r) {
        ball.dy *= -1;
      }
      
      if (breakout.bossBrick) {
        const boss = breakout.bossBrick;
        if (ball.x + ball.r > boss.x &&
            ball.x - ball.r < boss.x + boss.w &&
            ball.y + ball.r > boss.y &&
            ball.y - ball.r < boss.y + boss.h) {
          boss.hp -= 1;
          ball.dy *= -1;
          breakoutBurst(ball.x, ball.y, "#ff5d73", 10);
          q("breakoutBoss").textContent = boss.hp > 0 ? boss.hp + "HP" : "击败";
          
          if (boss.hp <= 0) {
            breakout.score += 500 * breakout.level;
            bScore.textContent = String(breakout.score);
            breakoutBurst(boss.x + boss.w / 2, boss.y + boss.h / 2, "#ff5d73", 40);
            breakout.bossBrick = null;
          }
        }
      }

      if (ball.y >= bCan.height - ball.r - breakout.paddle.h - 10) {
        if (ball.x >= breakout.paddle.x && ball.x <= breakout.paddle.x + breakout.paddle.w) {
          const hitPos = (ball.x - breakout.paddle.x) / breakout.paddle.w;
          ball.dx = 6 * (hitPos - 0.5);
          ball.dy = -Math.abs(ball.dy);
          breakout.combo = 0;
          bCombo.textContent = "0";
        }
      }

      if (ball.y > bCan.height + ball.r) {
        breakout.balls.splice(i, 1);
        if (breakout.balls.length === 0) {
          breakout.lives -= 1;
          bLives.textContent = String(breakout.lives);
          if (breakout.lives <= 0) {
            breakoutEnd(false);
            return;
          }
          breakout.ball.x = bCan.width / 2;
          breakout.ball.y = bCan.height - 50;
          breakout.ball.dx = 3.5 * (Math.random() > 0.5 ? 1 : -1);
          breakout.ball.dy = -4;
          breakout.balls = [{ ...breakout.ball }];
          breakout.combo = 0;
          bCombo.textContent = "0";
        }
      }

      for (let j = 0; j < breakout.bricks.length; j += 1) {
        const brick = breakout.bricks[j];
        if (!brick.alive) continue;

        if (ball.x + ball.r > brick.x &&
            ball.x - ball.r < brick.x + brick.w &&
            ball.y + ball.r > brick.y &&
            ball.y - ball.r < brick.y + brick.h) {
          
          brick.hp -= 1;
          if (brick.hp <= 0) {
            brick.alive = false;
            
            if (brick.type === "explosive") {
              breakout.bricks.forEach((b) => {
                if (b.alive && Math.abs(b.x - brick.x) < 60 && Math.abs(b.y - brick.y) < 30) {
                  b.alive = false;
                  breakoutBurst(b.x + b.w / 2, b.y + b.h / 2, b.color, 10);
                }
              });
              breakoutBurst(brick.x + brick.w / 2, brick.y + brick.h / 2, "#ff5d73", 30);
            }
            
            if (Math.random() < 0.15) {
              const itemTypes = ["expand", "multi", "laser"];
              const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
              breakout.items.push({
                x: brick.x + brick.w / 2,
                y: brick.y + brick.h / 2,
                type: itemType,
                dy: 2
              });
            }
          }
          
          ball.dy *= -1;
          breakout.combo += 1;
          breakout.score += 10 * breakout.combo;
          bScore.textContent = String(breakout.score);
          bCombo.textContent = String(breakout.combo);
          bBricks.textContent = String(breakout.bricks.filter(b => b.alive).length);
          breakoutBurst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 15);

          if (breakout.bricks.every(b => !b.alive)) {
            if (breakout.level < breakout.maxLevel) {
              breakout.level += 1;
              q("breakoutLevel").textContent = String(breakout.level);
              generateLevel(breakout.level);
              breakout.ball.dx *= 1.1;
              breakout.ball.dy *= 1.1;
              breakout.balls = [{ ...breakout.ball }];
              breakoutBurst(bCan.width / 2, bCan.height / 2, "#22d3a4", 30);
            } else {
              breakoutEnd(true);
            }
          }
          break;
        }
      }
    }

    for (let i = breakout.items.length - 1; i >= 0; i -= 1) {
      const item = breakout.items[i];
      item.y += item.dy || 2;

      if (item.y > bCan.height + 20) {
        breakout.items.splice(i, 1);
        continue;
      }

      if (item.type === "laser") {
        for (let j = 0; j < breakout.bricks.length; j += 1) {
          const brick = breakout.bricks[j];
          if (!brick.alive) continue;
          if (item.x > brick.x && item.x < brick.x + brick.w && item.y > brick.y && item.y < brick.y + brick.h) {
            brick.hp -= 1;
            if (brick.hp <= 0) {
              brick.alive = false;
              breakoutBurst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 10);
            }
            breakout.items.splice(i, 1);
            break;
          }
        }
        continue;
      }

      if (item.y > bCan.height - 30 && item.x > breakout.paddle.x && item.x < breakout.paddle.x + breakout.paddle.w) {
        breakout.items.splice(i, 1);
        if (item.type === "expand") {
          breakout.paddle.w = 120;
          breakout.power = "expand";
          breakout.powerTimer = 500;
          q("breakoutItem").textContent = "加长";
        } else if (item.type === "multi") {
          const newBalls = [];
          breakout.balls.forEach((b) => {
            newBalls.push({ x: b.x, y: b.y, dx: b.dx + 1, dy: b.dy, r: 7 });
            newBalls.push({ x: b.x, y: b.y, dx: b.dx - 1, dy: b.dy, r: 7 });
          });
          breakout.balls.push(...newBalls);
          q("breakoutItem").textContent = "多球";
        } else if (item.type === "laser") {
          breakout.laser = true;
          breakout.laserTimer = 400;
          q("breakoutItem").textContent = "激光";
        }
        breakoutBurst(item.x, item.y, "#22d3a4", 15);
      }
    }

    for (let i = breakout.parts.length - 1; i >= 0; i -= 1) {
      const p = breakout.parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life -= 1;
      if (p.life <= 0) breakout.parts.splice(i, 1);
    }
  }

  function breakoutDraw() {
    bCtx.clearRect(0, 0, bCan.width, bCan.height);
    bCtx.fillStyle = "#050a15";
    bCtx.fillRect(0, 0, bCan.width, bCan.height);

    if (breakout.bossBrick) {
      const boss = breakout.bossBrick;
      const hpRatio = boss.hp / boss.maxHp;
      
      bCtx.fillStyle = hpRatio > 0.5 ? "#ff5d73" : (hpRatio > 0.25 ? "#ffb86b" : "#ff6b8a");
      bCtx.fillRect(boss.x, boss.y, boss.w, boss.h);
      
      bCtx.fillStyle = "rgba(255,255,255,.3)";
      bCtx.fillRect(boss.x, boss.y, boss.w * hpRatio, boss.h);
      
      bCtx.strokeStyle = "#fff";
      bCtx.lineWidth = 2;
      bCtx.strokeRect(boss.x, boss.y, boss.w, boss.h);
      bCtx.lineWidth = 1;
      
      bCtx.fillStyle = "#fff";
      bCtx.font = "bold 12px Arial";
      bCtx.textAlign = "center";
      bCtx.fillText("BOSS", boss.x + boss.w / 2, boss.y + boss.h / 2 + 4);
    }

    breakout.bricks.forEach((brick) => {
      if (!brick.alive) return;
      bCtx.fillStyle = brick.color;
      bCtx.fillRect(brick.x, brick.y, brick.w, brick.h);
      bCtx.fillStyle = "rgba(255,255,255,.2)";
      bCtx.fillRect(brick.x, brick.y, brick.w, 4);
      
      if (brick.type === "steel") {
        bCtx.strokeStyle = "#aaa";
        bCtx.lineWidth = 2;
        bCtx.strokeRect(brick.x + 2, brick.y + 2, brick.w - 4, brick.h - 4);
        bCtx.lineWidth = 1;
      } else if (brick.type === "explosive") {
        bCtx.fillStyle = "#fff";
        bCtx.font = "12px Arial";
        bCtx.textAlign = "center";
        bCtx.fillText("💥", brick.x + brick.w / 2, brick.y + brick.h / 2 + 4);
      } else if (brick.type === "multi") {
        bCtx.fillStyle = "#fff";
        bCtx.font = "10px Arial";
        bCtx.textAlign = "center";
        bCtx.fillText("x2", brick.x + brick.w / 2, brick.y + brick.h / 2 + 3);
      }
    });

    bCtx.fillStyle = breakout.power ? "#22d3a4" : "#4f7cff";
    bCtx.fillRect(breakout.paddle.x, bCan.height - breakout.paddle.h - 10, breakout.paddle.w, breakout.paddle.h);
    bCtx.fillStyle = breakout.power ? "#5eead4" : "#7ea7ff";
    bCtx.fillRect(breakout.paddle.x, bCan.height - breakout.paddle.h - 10, breakout.paddle.w, 4);

    breakout.balls.forEach((ball) => {
      bCtx.fillStyle = "#fff";
      bCtx.beginPath();
      bCtx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      bCtx.fill();
    });

    breakout.items.forEach((item) => {
      if (item.type === "laser") {
        bCtx.fillStyle = "#ff5d73";
        bCtx.fillRect(item.x - 2, item.y - 8, 4, 16);
      } else {
        let color = "#22d3a4";
        if (item.type === "expand") color = "#ffb86b";
        else if (item.type === "multi") color = "#a86bff";
        bCtx.fillStyle = color;
        bCtx.beginPath();
        bCtx.arc(item.x, item.y, 8, 0, Math.PI * 2);
        bCtx.fill();
        bCtx.fillStyle = "#fff";
        bCtx.font = "10px Arial";
        bCtx.textAlign = "center";
        bCtx.fillText(item.type === "expand" ? "E" : "M", item.x, item.y + 4);
      }
    });

    for (let i = 0; i < breakout.parts.length; i += 1) {
      const p = breakout.parts[i];
      bCtx.globalAlpha = Math.max(0, p.life / 40);
      bCtx.fillStyle = p.c;
      bCtx.fillRect(p.x, p.y, 4, 4);
      bCtx.globalAlpha = 1;
    }
  }

  function breakoutLoop(ts) {
    breakoutUpdate();
    breakoutDraw();
    bFrame += 1;
    if (ts - bLast >= 1000) {
      bFps.textContent = String(bFrame);
      bFrame = 0;
      bLast = ts;
    }
    bAnimId = requestAnimationFrame(breakoutLoop);
  }

  q("breakoutStart").onclick = function () {
    breakoutReset();
    if (!bAnimId) bAnimId = requestAnimationFrame(breakoutLoop);
  };

  // ==================== GAME 4: 躲避障碍 ====================
  const dCan = q("dodgeCanvas");
  const dCtx = dCan ? dCan.getContext("2d") : null;
  const dTime = q("dodgeTime");
  const dDodged = q("dodgeDodged");
  const dLevel = q("dodgeLevel");
  const dFps = q("dodgeFps");
  const dStatus = q("dodgeStatus");
  let dFrame = 0;
  let dLast = performance.now();
  let dAnimId = null;

  const dodge = {
    running: false,
    player: { x: 0, y: 0, w: 24, h: 24 },
    obstacles: [],
    parts: [],
    stars: [],
    items: [],
    time: 0,
    dodged: 0,
    level: 1,
    keys: {},
    lastSpawn: 0,
    shield: 0,
    invincible: false,
    invincibleTimer: 0,
    dashCooldown: 0,
    dashDuration: 0,
    dashDir: { x: 0, y: 0 },
    slowMotion: false,
    slowMotionTimer: 0,
    slowMotionCooldown: 0,
    score: 0
  };

  for (let i = 0; i < 50; i += 1) {
    dodge.stars.push({ x: rnd(0, dCan.width), y: rnd(0, dCan.height), s: rnd(0.3, 1.2), v: rnd(0.2, 0.8) });
  }

  function dodgeReset() {
    dodge.running = true;
    dodge.player.x = dCan.width / 2;
    dodge.player.y = dCan.height - 40;
    dodge.obstacles = [];
    dodge.parts = [];
    dodge.items = [];
    dodge.time = 0;
    dodge.dodged = 0;
    dodge.level = 1;
    dodge.lastSpawn = 0;
    dodge.shield = 0;
    dodge.invincible = false;
    dodge.invincibleTimer = 0;
    dodge.dashCooldown = 0;
    dodge.dashDuration = 0;
    dodge.slowMotion = false;
    dodge.slowMotionTimer = 0;
    dodge.slowMotionCooldown = 0;
    dodge.score = 0;

    dTime.textContent = "0";
    dDodged.textContent = "0";
    dLevel.textContent = "1";
    q("dodgeShield").textContent = "0";
    q("dodgeDash").textContent = "就绪";
    q("dodgeSlow").textContent = "就绪";
    q("dodgeScore").textContent = "0";
    dStatus.innerHTML = "状态：进行中";
  }

  function dodgeBurst(x, y, c, n) {
    for (let i = 0; i < n; i += 1) {
      dodge.parts.push({ x: x, y: y, vx: rnd(-2, 2), vy: rnd(-2, 2), life: rnd(15, 30), c: c });
    }
  }

  function dodgeEnd(win) {
    dodge.running = false;
    dStatus.innerHTML = win
      ? "<span class=good>状态：胜利！成功生存60秒</span>"
      : "<span class=bad>状态：失败！被障碍物击中</span>";
    dodgeBurst(dodge.player.x, dodge.player.y, win ? "#22d3a4" : "#ff5d73", 40);
  }

  function dodgeUpdate(ts) {
    if (!dodge.running) return;

    if (dodge.invincibleTimer > 0) {
      dodge.invincibleTimer -= 1;
      if (dodge.invincibleTimer <= 0) {
        dodge.invincible = false;
      }
    }
    
    if (dodge.dashCooldown > 0) {
      dodge.dashCooldown -= 1;
      q("dodgeDash").textContent = Math.ceil(dodge.dashCooldown / 60) + "s";
      if (dodge.dashCooldown <= 0) {
        q("dodgeDash").textContent = "就绪";
      }
    }
    
    if (dodge.dashDuration > 0) {
      dodge.dashDuration -= 1;
      dodge.player.x += dodge.dashDir.x * 15;
      dodge.player.y += dodge.dashDir.y * 15;
      if (dodge.dashDuration <= 0) {
        dodge.invincible = false;
      }
    }
    
    if (dodge.slowMotionTimer > 0) {
      dodge.slowMotionTimer -= 1;
      q("dodgeSlow").textContent = Math.ceil(dodge.slowMotionTimer / 60) + "s";
      if (dodge.slowMotionTimer <= 0) {
        dodge.slowMotion = false;
        q("dodgeSlow").textContent = "就绪";
      }
    }
    
    if (dodge.slowMotionCooldown > 0) {
      dodge.slowMotionCooldown -= 1;
    }
    
    const timeScale = dodge.slowMotion ? 0.3 : 1;

    const speed = dodge.dashDuration > 0 ? 0 : (5 + dodge.level * 0.5);
    if (dodge.dashDuration <= 0) {
      if (dodge.keys.ArrowLeft || dodge.keys.a || dodge.keys.A) {
        dodge.player.x -= speed;
      }
      if (dodge.keys.ArrowRight || dodge.keys.d || dodge.keys.D) {
        dodge.player.x += speed;
      }
      if (dodge.keys.ArrowUp || dodge.keys.w || dodge.keys.W) {
        dodge.player.y -= speed;
      }
      if (dodge.keys.ArrowDown || dodge.keys.s || dodge.keys.S) {
        dodge.player.y += speed;
      }
    }
    
    if (dodge.keys.Shift && dodge.dashCooldown <= 0 && dodge.dashDuration <= 0) {
      let dx = 0, dy = 0;
      if (dodge.keys.ArrowLeft || dodge.keys.a) dx = -1;
      if (dodge.keys.ArrowRight || dodge.keys.d) dx = 1;
      if (dodge.keys.ArrowUp || dodge.keys.w) dy = -1;
      if (dodge.keys.ArrowDown || dodge.keys.s) dy = 1;
      
      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        dodge.dashDir = { x: dx / len, y: dy / len };
        dodge.dashDuration = 10;
        dodge.dashCooldown = 90;
        dodge.invincible = true;
        dodge.invincibleTimer = 15;
        dodgeBurst(dodge.player.x, dodge.player.y, "#6bc8ff", 15);
      }
    }
    
    if (dodge.keys.q && dodge.slowMotionCooldown <= 0 && !dodge.slowMotion) {
      dodge.slowMotion = true;
      dodge.slowMotionTimer = 180;
      dodge.slowMotionCooldown = 600;
      dodgeBurst(dodge.player.x, dodge.player.y, "#a86bff", 20);
    }

    dodge.player.x = Math.max(dodge.player.w / 2, Math.min(dCan.width - dodge.player.w / 2, dodge.player.x));
    dodge.player.y = Math.max(dodge.player.h / 2, Math.min(dCan.height - dodge.player.h / 2, dodge.player.y));

    const spawnRate = Math.max(200, 600 - dodge.level * 50);
    if (ts - dodge.lastSpawn > spawnRate / timeScale) {
      dodge.lastSpawn = ts;
      const obsSpeed = (2 + dodge.level * 0.3) * timeScale;
      const obsSize = 15 + Math.random() * 20;
      const rand = Math.random();
      let type = "normal";
      
      if (rand < 0.15) type = "fast";
      else if (rand < 0.25) type = "big";
      else if (rand < 0.3) type = "zigzag";
      
      dodge.obstacles.push({
        x: rnd(obsSize, dCan.width - obsSize),
        y: -obsSize,
        w: type === "big" ? obsSize * 1.5 : obsSize,
        h: type === "big" ? obsSize * 1.5 : obsSize,
        v: type === "fast" ? obsSpeed * 1.8 : obsSpeed,
        angle: 0,
        rotSpeed: rnd(-0.1, 0.1) * timeScale,
        type: type,
        zigzagPhase: 0
      });
    }

    if (Math.random() < 0.005) {
      const itemType = Math.random() < 0.5 ? "shield" : "invincible";
      dodge.items.push({
        x: rnd(20, dCan.width - 20),
        y: -15,
        type: itemType,
        v: 1.5 * timeScale
      });
    }

    for (let i = dodge.obstacles.length - 1; i >= 0; i -= 1) {
      const obs = dodge.obstacles[i];
      obs.y += obs.v;
      obs.angle += obs.rotSpeed;
      
      if (obs.type === "zigzag") {
        obs.zigzagPhase += 0.1 * timeScale;
        obs.x += Math.sin(obs.zigzagPhase) * 2 * timeScale;
      }

      if (obs.y > dCan.height + obs.h) {
        dodge.obstacles.splice(i, 1);
        dodge.dodged += 1;
        dodge.score += 10 * dodge.level;
        dDodged.textContent = String(dodge.dodged);
        q("dodgeScore").textContent = String(dodge.score);
        continue;
      }

      if (Math.abs(dodge.player.x - obs.x) < (dodge.player.w + obs.w) / 2 &&
          Math.abs(dodge.player.y - obs.y) < (dodge.player.h + obs.h) / 2) {
        if (dodge.invincible || dodge.dashDuration > 0) {
          dodge.obstacles.splice(i, 1);
          dodgeBurst(obs.x, obs.y, "#22d3a4", 20);
          dodge.score += 25;
          q("dodgeScore").textContent = String(dodge.score);
          continue;
        } else if (dodge.shield > 0) {
          dodge.shield -= 1;
          q("dodgeShield").textContent = String(dodge.shield);
          dodge.obstacles.splice(i, 1);
          dodgeBurst(obs.x, obs.y, "#6bc8ff", 20);
        } else {
          dodgeEnd(false);
          return;
        }
      }
    }

    for (let i = dodge.items.length - 1; i >= 0; i -= 1) {
      const item = dodge.items[i];
      item.y += item.v;

      if (item.y > dCan.height + 20) {
        dodge.items.splice(i, 1);
        continue;
      }

      if (Math.abs(dodge.player.x - item.x) < 20 && Math.abs(dodge.player.y - item.y) < 20) {
        dodge.items.splice(i, 1);
        if (item.type === "shield") {
          dodge.shield += 1;
          q("dodgeShield").textContent = String(dodge.shield);
        } else if (item.type === "invincible") {
          dodge.invincible = true;
          dodge.invincibleTimer = 180;
        }
        dodgeBurst(item.x, item.y, "#22d3a4", 15);
      }
    }

    dodge.time += 1 / 60;
    dTime.textContent = Math.floor(dodge.time);

    const newLevel = Math.floor(dodge.time / 10) + 1;
    if (newLevel !== dodge.level) {
      dodge.level = newLevel;
      dLevel.textContent = String(dodge.level);
    }

    if (dodge.time >= 60) {
      dodgeEnd(true);
      return;
    }

    for (let i = dodge.parts.length - 1; i >= 0; i -= 1) {
      const p = dodge.parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.life <= 0) dodge.parts.splice(i, 1);
    }
  }

  function dodgeDraw() {
    dCtx.clearRect(0, 0, dCan.width, dCan.height);
    
    if (dodge.slowMotion) {
      dCtx.fillStyle = "rgba(168,107,255,.1)";
      dCtx.fillRect(0, 0, dCan.width, dCan.height);
    } else {
      dCtx.fillStyle = "#040810";
      dCtx.fillRect(0, 0, dCan.width, dCan.height);
    }

    dodge.stars.forEach((s) => {
      s.y += s.v * (dodge.slowMotion ? 0.3 : 1);
      if (s.y > dCan.height) {
        s.y = 0;
        s.x = rnd(0, dCan.width);
      }
      dCtx.fillStyle = "rgba(180,200,255,.6)";
      dCtx.fillRect(s.x, s.y, s.s, s.s);
    });

    if (dodge.dashDuration > 0) {
      dCtx.fillStyle = "rgba(107,200,255,.3)";
      for (let i = 1; i <= 5; i += 1) {
        const trailX = dodge.player.x - dodge.dashDir.x * i * 15;
        const trailY = dodge.player.y - dodge.dashDir.y * i * 15;
        dCtx.beginPath();
        dCtx.arc(trailX, trailY, dodge.player.w / 2 - i, 0, Math.PI * 2);
        dCtx.fill();
      }
    }

    dCtx.save();
    dCtx.translate(dodge.player.x, dodge.player.y);
    
    if (dodge.invincible || dodge.dashDuration > 0) {
      dCtx.fillStyle = Math.floor(Date.now() / 100) % 2 === 0 ? "#22d3a4" : "#4f7cff";
    } else {
      dCtx.fillStyle = dodge.shield > 0 ? "#6bc8ff" : "#4f7cff";
    }
    dCtx.fillRect(-dodge.player.w / 2, -dodge.player.h / 2, dodge.player.w, dodge.player.h);
    dCtx.fillStyle = dodge.shield > 0 ? "#a8d8ff" : "#7ea7ff";
    dCtx.fillRect(-dodge.player.w / 2, -dodge.player.h / 2, dodge.player.w, 6);
    
    if (dodge.shield > 0) {
      dCtx.strokeStyle = "#6bc8ff";
      dCtx.lineWidth = 2;
      dCtx.strokeRect(-dodge.player.w / 2 - 4, -dodge.player.h / 2 - 4, dodge.player.w + 8, dodge.player.h + 8);
      dCtx.lineWidth = 1;
    }
    dCtx.restore();
    
    if (dodge.slowMotion) {
      dCtx.strokeStyle = "rgba(168,107,255,.5)";
      dCtx.lineWidth = 3;
      dCtx.strokeRect(5, 5, dCan.width - 10, dCan.height - 10);
      dCtx.lineWidth = 1;
      
      dCtx.fillStyle = "rgba(168,107,255,.8)";
      dCtx.font = "bold 14px sans-serif";
      dCtx.textAlign = "center";
      dCtx.fillText("SLOW MOTION", dCan.width / 2, 25);
    }

    dodge.obstacles.forEach((obs) => {
      dCtx.save();
      dCtx.translate(obs.x, obs.y);
      dCtx.rotate(obs.angle);
      
      if (obs.type === "fast") {
        dCtx.fillStyle = "#6bc8ff";
      } else if (obs.type === "big") {
        dCtx.fillStyle = "#a86bff";
      } else if (obs.type === "zigzag") {
        dCtx.fillStyle = "#ffb86b";
      } else {
        dCtx.fillStyle = "#ff5d73";
      }
      dCtx.fillRect(-obs.w / 2, -obs.h / 2, obs.w, obs.h);
      dCtx.restore();
    });

    dodge.items.forEach((item) => {
      dCtx.fillStyle = item.type === "shield" ? "#6bc8ff" : "#ffd700";
      dCtx.beginPath();
      dCtx.arc(item.x, item.y, 10, 0, Math.PI * 2);
      dCtx.fill();
      dCtx.fillStyle = "#fff";
      dCtx.font = "10px Arial";
      dCtx.textAlign = "center";
      dCtx.fillText(item.type === "shield" ? "S" : "I", item.x, item.y + 4);
    });

    for (let i = 0; i < dodge.parts.length; i += 1) {
      const p = dodge.parts[i];
      dCtx.globalAlpha = Math.max(0, p.life / 30);
      dCtx.fillStyle = p.c;
      dCtx.fillRect(p.x, p.y, 3, 3);
      dCtx.globalAlpha = 1;
    }
  }

  function dodgeLoop(ts) {
    dodgeUpdate(ts);
    dodgeDraw();
    dFrame += 1;
    if (ts - dLast >= 1000) {
      dFps.textContent = String(dFrame);
      dFrame = 0;
      dLast = ts;
    }
    dAnimId = requestAnimationFrame(dodgeLoop);
  }

  q("dodgeStart").onclick = function () {
    dodgeReset();
    if (!dAnimId) dAnimId = requestAnimationFrame(dodgeLoop);
  };

  // ==================== GAME 5: 弹幕射击 ====================
  const bhCan = q("bulletCanvas");
  const bhCtx = bhCan ? bhCan.getContext("2d") : null;
  const bhTime = q("bulletTime");
  const bhWave = q("bulletWave");
  const bhCount = q("bulletCount");
  const bhFps = q("bulletFps");
  const bhStatus = q("bulletStatus");
  let bhFrame = 0;
  let bhLast = performance.now();
  let bhAnimId = null;

  const bulletHell = {
    running: false,
    player: { x: 0, y: 0, r: 6 },
    bullets: [],
    time: 0,
    wave: 1,
    waveTimer: 0,
    keys: {},
    lastPattern: 0,
    dashCooldown: 0,
    dashDuration: 0,
    dashDir: { x: 0, y: 0 },
    invincible: false,
    invincibleTimer: 0,
    bombs: 3,
    boss: null,
    bossPhase: 1,
    score: 0,
    lives: 3
  };

  const bulletPatterns = [
    function(centerX, centerY, time) {
      const count = 12;
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + time * 0.02;
        bulletHell.bullets.push({
          x: centerX,
          y: centerY,
          dx: Math.cos(angle) * 2,
          dy: Math.sin(angle) * 2,
          r: 4,
          color: "#ff6b8a"
        });
      }
    },
    function(centerX, centerY, time) {
      for (let i = 0; i < 8; i += 1) {
        const angle = time * 0.05 + i * 0.3;
        bulletHell.bullets.push({
          x: centerX,
          y: centerY,
          dx: Math.cos(angle) * 2.5,
          dy: Math.sin(angle) * 2.5,
          r: 3,
          color: "#6bc8ff"
        });
      }
    },
    function(centerX, centerY, time) {
      const spiral = Math.floor(time / 30) % 4;
      for (let i = 0; i < 5; i += 1) {
        const angle = spiral * Math.PI / 2 + i * 0.2;
        bulletHell.bullets.push({
          x: centerX,
          y: centerY,
          dx: Math.cos(angle) * 3,
          dy: Math.sin(angle) * 3,
          r: 5,
          color: "#ffb86b"
        });
      }
    },
    function(centerX, centerY, time) {
      if (time % 20 < 10) {
        for (let i = 0; i < 3; i += 1) {
          bulletHell.bullets.push({
            x: 50 + i * 140,
            y: 0,
            dx: 0,
            dy: 2 + bulletHell.wave * 0.3,
            r: 6,
            color: "#a86bff"
          });
        }
      }
    },
    function(centerX, centerY, time) {
      for (let i = 0; i < 6; i += 1) {
        const angle = Math.atan2(bulletHell.player.y - centerY, bulletHell.player.x - centerX) + (i - 2.5) * 0.15;
        bulletHell.bullets.push({
          x: centerX,
          y: centerY,
          dx: Math.cos(angle) * 2.8,
          dy: Math.sin(angle) * 2.8,
          r: 4,
          color: "#22d3a4"
        });
      }
    }
  ];

  function bulletHellReset() {
    bulletHell.running = true;
    bulletHell.player.x = bhCan.width / 2;
    bulletHell.player.y = bhCan.height - 40;
    bulletHell.bullets = [];
    bulletHell.time = 0;
    bulletHell.wave = 1;
    bulletHell.waveTimer = 0;
    bulletHell.lastPattern = 0;
    bulletHell.dashCooldown = 0;
    bulletHell.dashDuration = 0;
    bulletHell.invincible = false;
    bulletHell.invincibleTimer = 0;
    bulletHell.bombs = 3;
    bulletHell.boss = null;
    bulletHell.bossPhase = 1;
    bulletHell.score = 0;
    bulletHell.lives = 3;

    bhTime.textContent = "0";
    bhWave.textContent = "1";
    bhCount.textContent = "0";
    q("bulletDash").textContent = "就绪";
    q("bulletBomb").textContent = "3";
    q("bulletBoss").textContent = "无";
    q("bulletScore").textContent = "0";
    q("bulletLives").textContent = "3";
    bhStatus.innerHTML = "状态：进行中";
  }

  function bulletHellEnd(win) {
    bulletHell.running = false;
    bhStatus.innerHTML = win
      ? "<span class=good>状态：胜利！通过所有波次</span>"
      : "<span class=bad>状态：失败！被弹幕击中</span>";
  }

  function useBomb() {
    if (bulletHell.bombs <= 0) return;
    
    bulletHell.bombs -= 1;
    q("bulletBomb").textContent = String(bulletHell.bombs);
    
    bulletHell.bullets = [];
    bulletHell.invincible = true;
    bulletHell.invincibleTimer = 60;
    
    if (bulletHell.boss) {
      bulletHell.boss.hp -= 20;
      if (bulletHell.boss.hp <= 0) {
        bulletHell.score += 1000;
        q("bulletScore").textContent = String(bulletHell.score);
        bulletHell.boss = null;
        q("bulletBoss").textContent = "击败";
      } else {
        q("bulletBoss").textContent = bulletHell.boss.hp + "HP";
      }
    }
  }

  function spawnBoss() {
    bulletHell.boss = {
      x: bhCan.width / 2,
      y: 60,
      r: 30,
      hp: 100 + bulletHell.wave * 50,
      maxHp: 100 + bulletHell.wave * 50,
      phase: 1,
      attackTimer: 0
    };
    q("bulletBoss").textContent = bulletHell.boss.hp + "HP";
  }

  function bulletHellUpdate(ts) {
    if (!bulletHell.running) return;

    if (bulletHell.dashCooldown > 0) {
      bulletHell.dashCooldown -= 1;
      const cd = Math.ceil(bulletHell.dashCooldown / 60);
      q("bulletDash").textContent = cd > 0 ? cd + "s" : "就绪";
    }
    
    if (bulletHell.dashDuration > 0) {
      bulletHell.dashDuration -= 1;
      bulletHell.player.x += bulletHell.dashDir.x * 12;
      bulletHell.player.y += bulletHell.dashDir.y * 12;
      if (bulletHell.dashDuration <= 0) {
        bulletHell.invincible = false;
      }
    }
    
    if (bulletHell.invincibleTimer > 0) {
      bulletHell.invincibleTimer -= 1;
      if (bulletHell.invincibleTimer <= 0 && bulletHell.dashDuration <= 0) {
        bulletHell.invincible = false;
      }
    }

    const speed = bulletHell.dashDuration > 0 ? 0 : 3.5;
    if (bulletHell.dashDuration <= 0) {
      if (bulletHell.keys.ArrowLeft || bulletHell.keys.a || bulletHell.keys.A) {
        bulletHell.player.x -= speed;
      }
      if (bulletHell.keys.ArrowRight || bulletHell.keys.d || bulletHell.keys.D) {
        bulletHell.player.x += speed;
      }
      if (bulletHell.keys.ArrowUp || bulletHell.keys.w || bulletHell.keys.W) {
        bulletHell.player.y -= speed;
      }
      if (bulletHell.keys.ArrowDown || bulletHell.keys.s || bulletHell.keys.S) {
        bulletHell.player.y += speed;
      }
    }

    if (bulletHell.keys.Shift && bulletHell.dashCooldown <= 0 && bulletHell.dashDuration <= 0) {
      let dx = 0, dy = 0;
      if (bulletHell.keys.ArrowLeft || bulletHell.keys.a) dx = -1;
      if (bulletHell.keys.ArrowRight || bulletHell.keys.d) dx = 1;
      if (bulletHell.keys.ArrowUp || bulletHell.keys.w) dy = -1;
      if (bulletHell.keys.ArrowDown || bulletHell.keys.s) dy = 1;
      
      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        bulletHell.dashDir = { x: dx / len, y: dy / len };
        bulletHell.dashDuration = 8;
        bulletHell.dashCooldown = 120;
        bulletHell.invincible = true;
        bulletHell.invincibleTimer = 15;
        bulletHell.keys.Shift = false;
      }
    }
    
    if (bulletHell.keys.q && bulletHell.bombs > 0) {
      useBomb();
      bulletHell.keys.q = false;
    }

    bulletHell.player.x = Math.max(bulletHell.player.r, Math.min(bhCan.width - bulletHell.player.r, bulletHell.player.x));
    bulletHell.player.y = Math.max(bulletHell.player.r, Math.min(bhCan.height - bulletHell.player.r, bulletHell.player.y));

    if (bulletHell.boss) {
      bulletHell.boss.attackTimer += 1;
      if (bulletHell.boss.attackTimer > 30) {
        bulletHell.boss.attackTimer = 0;
        const patternIndex = Math.floor(Math.random() * bulletPatterns.length);
        bulletPatterns[patternIndex](bulletHell.boss.x, bulletHell.boss.y, bulletHell.time);
      }
    } else if (ts - bulletHell.lastPattern > Math.max(200, 400 - bulletHell.wave * 30)) {
      bulletHell.lastPattern = ts;
      const patternIndex = Math.floor(Math.random() * Math.min(bulletHell.wave + 1, bulletPatterns.length));
      const centerX = bhCan.width / 2 + rnd(-80, 80);
      const centerY = 60 + rnd(-20, 20);
      bulletPatterns[patternIndex](centerX, centerY, bulletHell.time);
    }

    for (let i = bulletHell.bullets.length - 1; i >= 0; i -= 1) {
      const b = bulletHell.bullets[i];
      b.x += b.dx;
      b.y += b.dy;

      if (b.x < -20 || b.x > bhCan.width + 20 || b.y < -20 || b.y > bhCan.height + 20) {
        bulletHell.bullets.splice(i, 1);
        continue;
      }

      if (!bulletHell.invincible) {
        const dx = bulletHell.player.x - b.x;
        const dy = bulletHell.player.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bulletHell.player.r + b.r) {
          bulletHell.lives -= 1;
          q("bulletLives").textContent = String(bulletHell.lives);
          
          if (bulletHell.lives <= 0) {
            bulletHellEnd(false);
            return;
          }
          
          bulletHell.invincible = true;
          bulletHell.invincibleTimer = 120;
          bulletHell.player.x = bhCan.width / 2;
          bulletHell.player.y = bhCan.height - 40;
          bulletHell.bullets = [];
        }
      }
    }

    bulletHell.time += 1 / 60;
    bulletHell.waveTimer += 1 / 60;
    bulletHell.score += 1;
    bhTime.textContent = Math.floor(bulletHell.time);
    bhCount.textContent = String(bulletHell.bullets.length);
    q("bulletScore").textContent = String(bulletHell.score);

    if (bulletHell.waveTimer >= 15 && !bulletHell.boss) {
      if (bulletHell.wave % 2 === 0) {
        spawnBoss();
      } else {
        bulletHell.wave += 1;
        bulletHell.waveTimer = 0;
        bhWave.textContent = String(bulletHell.wave);
      }

      if (bulletHell.wave > 5) {
        bulletHellEnd(true);
        return;
      }
    }
    
    if (bulletHell.boss && bulletHell.boss.hp <= 0) {
      bulletHell.wave += 1;
      bulletHell.waveTimer = 0;
      bulletHell.boss = null;
      bhWave.textContent = String(bulletHell.wave);
      q("bulletBoss").textContent = "无";
    }
  }

  function bulletHellDraw() {
    bhCtx.clearRect(0, 0, bhCan.width, bhCan.height);
    bhCtx.fillStyle = "#030812";
    bhCtx.fillRect(0, 0, bhCan.width, bhCan.height);

    bhCtx.strokeStyle = "rgba(120,150,255,.1)";
    for (let i = 0; i < 8; i += 1) {
      bhCtx.beginPath();
      bhCtx.moveTo(0, i * 40);
      bhCtx.lineTo(bhCan.width, i * 40);
      bhCtx.stroke();
      bhCtx.beginPath();
      bhCtx.moveTo(i * 65, 0);
      bhCtx.lineTo(i * 65, bhCan.height);
      bhCtx.stroke();
    }

    if (bulletHell.boss) {
      const boss = bulletHell.boss;
      const hpRatio = boss.hp / boss.maxHp;
      
      bhCtx.fillStyle = hpRatio > 0.5 ? "#ff5d73" : (hpRatio > 0.25 ? "#ffb86b" : "#ff6b8a");
      bhCtx.beginPath();
      bhCtx.arc(boss.x, boss.y, boss.r, 0, Math.PI * 2);
      bhCtx.fill();
      
      bhCtx.strokeStyle = "#fff";
      bhCtx.lineWidth = 3;
      bhCtx.beginPath();
      bhCtx.arc(boss.x, boss.y, boss.r, 0, Math.PI * 2);
      bhCtx.stroke();
      bhCtx.lineWidth = 1;
      
      bhCtx.fillStyle = "#fff";
      bhCtx.font = "bold 14px Arial";
      bhCtx.textAlign = "center";
      bhCtx.fillText("BOSS", boss.x, boss.y + 5);
      
      bhCtx.fillStyle = "rgba(255,255,255,.3)";
      bhCtx.fillRect(boss.x - boss.r, boss.y - boss.r - 10, boss.r * 2 * hpRatio, 6);
      bhCtx.strokeStyle = "#fff";
      bhCtx.strokeRect(boss.x - boss.r, boss.y - boss.r - 10, boss.r * 2, 6);
    }

    bulletHell.bullets.forEach((b) => {
      bhCtx.fillStyle = b.color;
      bhCtx.beginPath();
      bhCtx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      bhCtx.fill();
      bhCtx.fillStyle = "rgba(255,255,255,.3)";
      bhCtx.beginPath();
      bhCtx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.4, 0, Math.PI * 2);
      bhCtx.fill();
    });

    if (bulletHell.dashDuration > 0) {
      bhCtx.fillStyle = "rgba(79,124,255,.3)";
      bhCtx.beginPath();
      bhCtx.arc(bulletHell.player.x - bulletHell.dashDir.x * 20, bulletHell.player.y - bulletHell.dashDir.y * 20, bulletHell.player.r + 4, 0, Math.PI * 2);
      bhCtx.fill();
    }

    if (bulletHell.invincible) {
      bhCtx.fillStyle = Math.floor(Date.now() / 50) % 2 === 0 ? "#22d3a4" : "#4f7cff";
    } else {
      bhCtx.fillStyle = "#4f7cff";
    }
    bhCtx.beginPath();
    bhCtx.arc(bulletHell.player.x, bulletHell.player.y, bulletHell.player.r, 0, Math.PI * 2);
    bhCtx.fill();
    bhCtx.fillStyle = bulletHell.invincible ? "#5eead4" : "#7ea7ff";
    bhCtx.beginPath();
    bhCtx.arc(bulletHell.player.x, bulletHell.player.y - 2, bulletHell.player.r * 0.5, 0, Math.PI * 2);
    bhCtx.fill();
  }

  function bulletHellLoop(ts) {
    bulletHellUpdate(ts);
    bulletHellDraw();
    bhFrame += 1;
    if (ts - bhLast >= 1000) {
      bhFps.textContent = String(bhFrame);
      bhFrame = 0;
      bhLast = ts;
    }
    bhAnimId = requestAnimationFrame(bulletHellLoop);
  }

  q("bulletStart").onclick = function () {
    bulletHellReset();
    if (!bhAnimId) bhAnimId = requestAnimationFrame(bulletHellLoop);
  };

  // ==================== GAME 6: 俄罗斯方块 ====================
  const tCan = q("tetrisCanvas");
  const tCtx = tCan ? tCan.getContext("2d") : null;
  const tScore = q("tetrisScore");
  const tLines = q("tetrisLines");
  const tLevel = q("tetrisLevel");
  const tNext = q("tetrisNext");
  const tFps = q("tetrisFps");
  const tStatus = q("tetrisStatus");
  let tFrame = 0;
  let tLast = performance.now();
  let tAnimId = null;
  let tDropTimer = 0;

  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 26;

  const SHAPES = [
    { shape: [[1,1,1,1]], color: "#6bc8ff", name: "I" },
    { shape: [[1,1],[1,1]], color: "#ffc06b", name: "O" },
    { shape: [[0,1,0],[1,1,1]], color: "#a86bff", name: "T" },
    { shape: [[1,0,0],[1,1,1]], color: "#ff8c6b", name: "L" },
    { shape: [[0,0,1],[1,1,1]], color: "#6bff8c", name: "J" },
    { shape: [[0,1,1],[1,1,0]], color: "#22d3a4", name: "S" },
    { shape: [[1,1,0],[0,1,1]], color: "#ff6b8a", name: "Z" }
  ];

  const tetris = {
    running: false,
    board: [],
    current: null,
    next: null,
    hold: null,
    canHold: true,
    x: 0,
    y: 0,
    score: 0,
    lines: 0,
    level: 1,
    keys: {},
    combo: 0,
    lastClearWasTSpin: false,
    lastRotation: false,
    ghostY: 0
  };

  function tetrisReset() {
    tetris.running = true;
    tetris.board = Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
    tetris.score = 0;
    tetris.lines = 0;
    tetris.level = 1;
    tetris.next = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    tetris.hold = null;
    tetris.canHold = true;
    tetris.combo = 0;
    tetris.lastClearWasTSpin = false;
    tetris.lastRotation = false;
    spawnPiece();
    tDropTimer = 0;

    tScore.textContent = "0";
    tLines.textContent = "0";
    tLevel.textContent = "1";
    tNext.textContent = tetris.next.name;
    q("tetrisHold").textContent = "-";
    q("tetrisCombo").textContent = "0";
    q("tetrisTSpin").textContent = "无";
    tStatus.innerHTML = "状态：进行中";
  }

  function spawnPiece() {
    tetris.current = tetris.next;
    tetris.next = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    tetris.x = Math.floor((COLS - tetris.current.shape[0].length) / 2);
    tetris.y = 0;
    tetris.canHold = true;
    tNext.textContent = tetris.next.name;

    if (collision(tetris.x, tetris.y, tetris.current.shape)) {
      tetris.running = false;
      tStatus.innerHTML = "<span class=bad>状态：游戏结束！</span>";
    }
  }

  function collision(x, y, shape) {
    for (let r = 0; r < shape.length; r += 1) {
      for (let c = 0; c < shape[r].length; c += 1) {
        if (shape[r][c]) {
          const newX = x + c;
          const newY = y + r;
          if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
          if (newY >= 0 && tetris.board[newY][newX]) return true;
        }
      }
    }
    return false;
  }

  function merge() {
    for (let r = 0; r < tetris.current.shape.length; r += 1) {
      for (let c = 0; c < tetris.current.shape[r].length; c += 1) {
        if (tetris.current.shape[r][c]) {
          if (tetris.y + r >= 0) {
            tetris.board[tetris.y + r][tetris.x + c] = tetris.current.color;
          }
        }
      }
    }
  }

  function checkTSpin() {
    if (tetris.current.name !== "T" || !tetris.lastRotation) return false;
    
    const corners = [
      [tetris.y - 1, tetris.x - 1],
      [tetris.y - 1, tetris.x + 3],
      [tetris.y + 3, tetris.x - 1],
      [tetris.y + 3, tetris.x + 3]
    ];
    
    let blockedCorners = 0;
    for (const [row, col] of corners) {
      if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
        blockedCorners += 1;
      } else if (tetris.board[row] && tetris.board[row][col]) {
        blockedCorners += 1;
      }
    }
    
    return blockedCorners >= 3;
  }

  function clearLines() {
    let cleared = 0;
    const isTSpin = checkTSpin();
    tetris.lastClearWasTSpin = isTSpin;
    
    for (let r = ROWS - 1; r >= 0; r -= 1) {
      if (tetris.board[r].every(cell => cell)) {
        tetris.board.splice(r, 1);
        tetris.board.unshift(Array(COLS).fill(0));
        cleared += 1;
        r += 1;
      }
    }
    
    if (cleared > 0) {
      tetris.combo += 1;
      
      let basePoints = [0, 100, 300, 500, 800][cleared];
      if (isTSpin) {
        basePoints *= 2;
        q("tetrisTSpin").textContent = "T-Spin!";
      } else {
        q("tetrisTSpin").textContent = "无";
      }
      
      const comboBonus = tetris.combo > 1 ? 50 * tetris.combo * tetris.level : 0;
      tetris.score += (basePoints + comboBonus) * tetris.level;
      tetris.lines += cleared;
      tetris.level = Math.floor(tetris.lines / 10) + 1;
      
      tScore.textContent = String(tetris.score);
      tLines.textContent = String(tetris.lines);
      tLevel.textContent = String(tetris.level);
      q("tetrisCombo").textContent = String(tetris.combo);
    } else {
      tetris.combo = 0;
      q("tetrisCombo").textContent = "0";
      q("tetrisTSpin").textContent = "无";
    }
  }

  function rotate(shape) {
    const rows = shape.length;
    const cols = shape[0].length;
    const rotated = Array(cols).fill(null).map(() => Array(rows).fill(0));
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        rotated[c][rows - 1 - r] = shape[r][c];
      }
    }
    return rotated;
  }

  function drop() {
    if (!collision(tetris.x, tetris.y + 1, tetris.current.shape)) {
      tetris.y += 1;
    } else {
      merge();
      clearLines();
      spawnPiece();
    }
  }

  function hardDrop() {
    while (!collision(tetris.x, tetris.y + 1, tetris.current.shape)) {
      tetris.y += 1;
      tetris.score += 2;
    }
    merge();
    clearLines();
    spawnPiece();
    tScore.textContent = String(tetris.score);
  }

  function holdPiece() {
    if (!tetris.canHold) return;
    tetris.canHold = false;
    
    if (tetris.hold) {
      const temp = tetris.hold;
      tetris.hold = tetris.current;
      tetris.current = temp;
      tetris.x = Math.floor((COLS - tetris.current.shape[0].length) / 2);
      tetris.y = 0;
    } else {
      tetris.hold = tetris.current;
      spawnPiece();
    }
    q("tetrisHold").textContent = tetris.hold.name;
  }

  function getGhostY() {
    let ghostY = tetris.y;
    while (!collision(tetris.x, ghostY + 1, tetris.current.shape)) {
      ghostY += 1;
    }
    return ghostY;
  }

  function tetrisUpdate(ts) {
    if (!tetris.running) return;

    const dropSpeed = Math.max(100, 500 - (tetris.level - 1) * 50);
    if (ts - tDropTimer > dropSpeed) {
      tDropTimer = ts;
      drop();
    }

    if (tetris.keys.ArrowLeft || tetris.keys.a || tetris.keys.A) {
      if (!collision(tetris.x - 1, tetris.y, tetris.current.shape)) {
        tetris.x -= 1;
        tetris.lastRotation = false;
      }
      tetris.keys.ArrowLeft = false;
      tetris.keys.a = false;
      tetris.keys.A = false;
    }
    if (tetris.keys.ArrowRight || tetris.keys.d || tetris.keys.D) {
      if (!collision(tetris.x + 1, tetris.y, tetris.current.shape)) {
        tetris.x += 1;
        tetris.lastRotation = false;
      }
      tetris.keys.ArrowRight = false;
      tetris.keys.d = false;
      tetris.keys.D = false;
    }
    if (tetris.keys.ArrowDown || tetris.keys.s || tetris.keys.S) {
      drop();
      tetris.score += 1;
      tScore.textContent = String(tetris.score);
      tetris.keys.ArrowDown = false;
      tetris.keys.s = false;
      tetris.keys.S = false;
    }
    if (tetris.keys.ArrowUp || tetris.keys.w || tetris.keys.W) {
      const rotated = rotate(tetris.current.shape);
      if (!collision(tetris.x, tetris.y, rotated)) {
        tetris.current.shape = rotated;
        tetris.lastRotation = true;
      }
      tetris.keys.ArrowUp = false;
      tetris.keys.w = false;
      tetris.keys.W = false;
    }
    if (tetris.keys[" "]) {
      hardDrop();
      tetris.lastRotation = false;
      tetris.keys[" "] = false;
    }
    if (tetris.keys.c || tetris.keys.C) {
      holdPiece();
      tetris.lastRotation = false;
      tetris.keys.c = false;
      tetris.keys.C = false;
    }
  }

  function tetrisDraw() {
    tCtx.clearRect(0, 0, tCan.width, tCan.height);
    tCtx.fillStyle = "#050a15";
    tCtx.fillRect(0, 0, tCan.width, tCan.height);

    tCtx.strokeStyle = "rgba(120,150,255,.1)";
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        tCtx.strokeRect(c * BLOCK, r * BLOCK, BLOCK, BLOCK);
      }
    }

    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (tetris.board[r][c]) {
          tCtx.fillStyle = tetris.board[r][c];
          tCtx.fillRect(c * BLOCK + 1, r * BLOCK + 1, BLOCK - 2, BLOCK - 2);
          tCtx.fillStyle = "rgba(255,255,255,.2)";
          tCtx.fillRect(c * BLOCK + 1, r * BLOCK + 1, BLOCK - 2, 4);
        }
      }
    }

    if (tetris.current) {
      const ghostY = getGhostY();
      tCtx.globalAlpha = 0.3;
      for (let r = 0; r < tetris.current.shape.length; r += 1) {
        for (let c = 0; c < tetris.current.shape[r].length; c += 1) {
          if (tetris.current.shape[r][c]) {
            tCtx.fillStyle = tetris.current.color;
            tCtx.fillRect((tetris.x + c) * BLOCK + 1, (ghostY + r) * BLOCK + 1, BLOCK - 2, BLOCK - 2);
          }
        }
      }
      tCtx.globalAlpha = 1;

      for (let r = 0; r < tetris.current.shape.length; r += 1) {
        for (let c = 0; c < tetris.current.shape[r].length; c += 1) {
          if (tetris.current.shape[r][c]) {
            tCtx.fillStyle = tetris.current.color;
            tCtx.fillRect((tetris.x + c) * BLOCK + 1, (tetris.y + r) * BLOCK + 1, BLOCK - 2, BLOCK - 2);
            tCtx.fillStyle = "rgba(255,255,255,.3)";
            tCtx.fillRect((tetris.x + c) * BLOCK + 1, (tetris.y + r) * BLOCK + 1, BLOCK - 2, 4);
          }
        }
      }
    }
  }

  function tetrisLoop(ts) {
    tetrisUpdate(ts);
    tetrisDraw();
    tFrame += 1;
    if (ts - tLast >= 1000) {
      tFps.textContent = String(tFrame);
      tFrame = 0;
      tLast = ts;
    }
    tAnimId = requestAnimationFrame(tetrisLoop);
  }

  q("tetrisStart").onclick = function () {
    tetrisReset();
    if (!tAnimId) tAnimId = requestAnimationFrame(tetrisLoop);
  };

  // ==================== GAME 7: Boss战 ====================
  const bossCan = q("bossCanvas");
  const bossCtx = bossCan ? bossCan.getContext("2d") : null;
  const bossHP = q("bossHP");
  const bossPhase = q("bossPhase");
  const bossPlayerHP = q("bossPlayerHP");
  const bossDamage = q("bossDamage");
  const bossFps = q("bossFps");
  const bossStatusEl = q("bossStatus");
  let bossFrame = 0;
  let bossLast = performance.now();
  let bossAnimId = null;

  const bossGame = {
    running: false,
    player: { x: 0, y: 0, w: 20, h: 20, hp: 100 },
    boss: { x: 0, y: 60, w: 80, h: 60, hp: 1000, maxHp: 1000, phase: 1 },
    bosses: [],
    currentBossIndex: 0,
    bullets: [],
    playerBullets: [],
    parts: [],
    items: [],
    damage: 0,
    keys: {},
    mouseX: 0,
    mouseY: 0,
    lastShot: 0,
    lastBossShot: 0,
    bossAngle: 0,
    shield: 0,
    power: null,
    powerTimer: 0,
    chargeLevel: 0,
    charging: false,
    skillCooldowns: { dash: 0, shield: 0, burst: 0 },
    dashDuration: 0,
    dashDir: { x: 0, y: 0 },
    invincible: false,
    invincibleTimer: 0,
    score: 0,
    bossesDefeated: 0
  };

  function bossReset() {
    bossGame.running = true;
    bossGame.player.x = bossCan.width / 2;
    bossGame.player.y = bossCan.height - 50;
    bossGame.player.hp = 100;
    bossGame.bosses = [
      { x: bossCan.width / 2, y: 60, w: 80, h: 60, hp: 800, maxHp: 800, phase: 1, name: "守护者", color: "#ff5d73", pattern: "spiral" },
      { x: bossCan.width / 2, y: 60, w: 100, h: 70, hp: 1200, maxHp: 1200, phase: 1, name: "毁灭者", color: "#a86bff", pattern: "wave" },
      { x: bossCan.width / 2, y: 60, w: 120, h: 80, hp: 1500, maxHp: 1500, phase: 1, name: "终结者", color: "#6bc8ff", pattern: "chaos" }
    ];
    bossGame.currentBossIndex = 0;
    bossGame.boss = bossGame.bosses[0];
    bossGame.bullets = [];
    bossGame.playerBullets = [];
    bossGame.parts = [];
    bossGame.items = [];
    bossGame.damage = 0;
    bossGame.lastShot = 0;
    bossGame.lastBossShot = 0;
    bossGame.bossAngle = 0;
    bossGame.shield = 0;
    bossGame.power = null;
    bossGame.powerTimer = 0;
    bossGame.chargeLevel = 0;
    bossGame.charging = false;
    bossGame.skillCooldowns = { dash: 0, shield: 0, burst: 0 };
    bossGame.dashDuration = 0;
    bossGame.invincible = false;
    bossGame.invincibleTimer = 0;
    bossGame.score = 0;
    bossGame.bossesDefeated = 0;

    bossHP.textContent = String(bossGame.boss.hp);
    bossPhase.textContent = "1";
    bossPlayerHP.textContent = "100";
    bossDamage.textContent = "0";
    q("bossShield").textContent = "0";
    q("bossName").textContent = bossGame.boss.name;
    q("bossCount").textContent = "1/3";
    q("bossDash").textContent = "就绪";
    q("bossSkill").textContent = "就绪";
    q("bossScore").textContent = "0";
    bossStatusEl.innerHTML = "状态：进行中";
  }

  function bossBurst(x, y, c, n) {
    for (let i = 0; i < n; i += 1) {
      bossGame.parts.push({ x: x, y: y, vx: rnd(-3, 3), vy: rnd(-3, 3), life: rnd(20, 40), c: c });
    }
  }

  function bossEnd(win) {
    bossGame.running = false;
    bossStatusEl.innerHTML = win
      ? "<span class=good>状态：胜利！击败了所有Boss</span>"
      : "<span class=bad>状态：失败！被Boss击败</span>";
    bossBurst(bossCan.width / 2, bossCan.height / 2, win ? "#22d3a4" : "#ff5d73", 80);
  }

  function useDashSkill() {
    if (bossGame.skillCooldowns.dash > 0 || bossGame.dashDuration > 0) return;
    
    let dx = 0, dy = 0;
    if (bossGame.keys.ArrowLeft || bossGame.keys.a) dx = -1;
    if (bossGame.keys.ArrowRight || bossGame.keys.d) dx = 1;
    if (bossGame.keys.ArrowUp || bossGame.keys.w) dy = -1;
    if (bossGame.keys.ArrowDown || bossGame.keys.s) dy = 1;
    
    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      bossGame.dashDir = { x: dx / len, y: dy / len };
      bossGame.dashDuration = 10;
      bossGame.skillCooldowns.dash = 90;
      bossGame.invincible = true;
      bossGame.invincibleTimer = 15;
      bossBurst(bossGame.player.x, bossGame.player.y, "#6bc8ff", 15);
    }
  }

  function useShieldSkill() {
    if (bossGame.skillCooldowns.shield > 0) return;
    
    bossGame.shield = 5;
    bossGame.skillCooldowns.shield = 300;
    q("bossShield").textContent = "5";
    bossBurst(bossGame.player.x, bossGame.player.y, "#22d3a4", 20);
  }

  function useBurstSkill() {
    if (bossGame.skillCooldowns.burst > 0) return;
    
    bossGame.skillCooldowns.burst = 180;
    
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      bossGame.playerBullets.push({
        x: bossGame.player.x,
        y: bossGame.player.y,
        dx: Math.cos(angle) * 6,
        dy: Math.sin(angle) * 6,
        power: true
      });
    }
    bossBurst(bossGame.player.x, bossGame.player.y, "#ffd700", 25);
  }

  function spawnNextBoss() {
    bossGame.currentBossIndex += 1;
    bossGame.bossesDefeated += 1;
    bossGame.score += 1000;
    
    if (bossGame.currentBossIndex >= bossGame.bosses.length) {
      bossEnd(true);
      return;
    }
    
    bossGame.boss = bossGame.bosses[bossGame.currentBossIndex];
    bossGame.boss.x = bossCan.width / 2;
    bossGame.boss.y = 60;
    bossGame.bullets = [];
    bossGame.player.hp = Math.min(100, bossGame.player.hp + 30);
    
    bossHP.textContent = String(bossGame.boss.hp);
    bossPhase.textContent = "1";
    bossPlayerHP.textContent = String(bossGame.player.hp);
    q("bossName").textContent = bossGame.boss.name;
    q("bossCount").textContent = (bossGame.currentBossIndex + 1) + "/3";
    q("bossScore").textContent = String(bossGame.score);
    
    bossBurst(bossCan.width / 2, 60, bossGame.boss.color, 40);
  }

  function bossUpdate(ts) {
    if (!bossGame.running) return;

    if (bossGame.powerTimer > 0) {
      bossGame.powerTimer -= 1;
      if (bossGame.powerTimer <= 0) {
        bossGame.power = null;
      }
    }
    
    if (bossGame.invincibleTimer > 0) {
      bossGame.invincibleTimer -= 1;
      if (bossGame.invincibleTimer <= 0 && bossGame.dashDuration <= 0) {
        bossGame.invincible = false;
      }
    }
    
    if (bossGame.dashDuration > 0) {
      bossGame.dashDuration -= 1;
      bossGame.player.x += bossGame.dashDir.x * 12;
      bossGame.player.y += bossGame.dashDir.y * 12;
      if (bossGame.dashDuration <= 0) {
        bossGame.invincible = false;
      }
    }
    
    for (const skill in bossGame.skillCooldowns) {
      if (bossGame.skillCooldowns[skill] > 0) {
        bossGame.skillCooldowns[skill] -= 1;
      }
    }
    
    q("bossDash").textContent = bossGame.skillCooldowns.dash > 0 ? Math.ceil(bossGame.skillCooldowns.dash / 60) + "s" : "就绪";
    q("bossSkill").textContent = bossGame.skillCooldowns.burst > 0 ? Math.ceil(bossGame.skillCooldowns.burst / 60) + "s" : "就绪";

    const speed = bossGame.dashDuration > 0 ? 0 : 4;
    if (bossGame.dashDuration <= 0) {
      if (bossGame.keys.ArrowLeft || bossGame.keys.a || bossGame.keys.A) {
        bossGame.player.x -= speed;
      }
      if (bossGame.keys.ArrowRight || bossGame.keys.d || bossGame.keys.D) {
        bossGame.player.x += speed;
      }
      if (bossGame.keys.ArrowUp || bossGame.keys.w || bossGame.keys.W) {
        bossGame.player.y -= speed;
      }
      if (bossGame.keys.ArrowDown || bossGame.keys.s || bossGame.keys.S) {
        bossGame.player.y += speed;
      }
    }
    
    if (bossGame.keys.Shift) {
      useDashSkill();
      bossGame.keys.Shift = false;
    }
    if (bossGame.keys.q) {
      useShieldSkill();
      bossGame.keys.q = false;
    }
    if (bossGame.keys.e) {
      useBurstSkill();
      bossGame.keys.e = false;
    }

    bossGame.player.x = Math.max(bossGame.player.w / 2, Math.min(bossCan.width - bossGame.player.w / 2, bossGame.player.x));
    bossGame.player.y = Math.max(bossGame.player.h / 2, Math.min(bossCan.height - bossGame.player.h / 2, bossGame.player.y));

    bossGame.boss.x = bossCan.width / 2 + Math.sin(ts * 0.001 * bossGame.boss.phase) * 100;
    bossGame.boss.y = 60 + Math.sin(ts * 0.002) * 20;
    bossGame.bossAngle += 0.02 + bossGame.boss.phase * 0.01;

    const shootInterval = Math.max(150, 500 - bossGame.boss.phase * 100 - bossGame.currentBossIndex * 50);
    if (ts - bossGame.lastBossShot > shootInterval) {
      bossGame.lastBossShot = ts;
      
      const pattern = bossGame.boss.pattern;
      
      if (pattern === "spiral") {
        for (let i = 0; i < 3 + bossGame.boss.phase; i += 1) {
          const angle = bossGame.bossAngle + i * 0.5;
          bossGame.bullets.push({
            x: bossGame.boss.x,
            y: bossGame.boss.y + bossGame.boss.h / 2,
            dx: Math.cos(angle) * (2 + bossGame.boss.phase * 0.5),
            dy: Math.sin(angle) * (2 + bossGame.boss.phase * 0.5),
            r: 5,
            color: bossGame.boss.color
          });
        }
      } else if (pattern === "wave") {
        for (let i = -2; i <= 2; i += 1) {
          bossGame.bullets.push({
            x: bossGame.boss.x + i * 30,
            y: bossGame.boss.y + bossGame.boss.h / 2,
            dx: 0,
            dy: 2 + bossGame.boss.phase * 0.5,
            r: 6,
            color: bossGame.boss.color
          });
        }
      } else if (pattern === "chaos") {
        if (bossGame.boss.phase >= 2 && Math.random() < 0.4) {
          for (let i = 0; i < 8; i += 1) {
            const angle = (i / 8) * Math.PI * 2;
            bossGame.bullets.push({
              x: bossGame.boss.x,
              y: bossGame.boss.y + bossGame.boss.h / 2,
              dx: Math.cos(angle) * 2.5,
              dy: Math.sin(angle) * 2.5,
              r: 4,
              color: bossGame.boss.color
            });
          }
        } else {
          for (let i = 0; i < 4; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            bossGame.bullets.push({
              x: bossGame.boss.x,
              y: bossGame.boss.y + bossGame.boss.h / 2,
              dx: Math.cos(angle) * (2 + Math.random() * 2),
              dy: Math.sin(angle) * (2 + Math.random() * 2),
              r: 5,
              color: bossGame.boss.color
            });
          }
        }
      }
    }

    for (let i = bossGame.bullets.length - 1; i >= 0; i -= 1) {
      const b = bossGame.bullets[i];
      b.x += b.dx;
      b.y += b.dy;

      if (b.x < -20 || b.x > bossCan.width + 20 || b.y < -20 || b.y > bossCan.height + 20) {
        bossGame.bullets.splice(i, 1);
        continue;
      }

      if (Math.abs(b.x - bossGame.player.x) < bossGame.player.w / 2 + b.r &&
          Math.abs(b.y - bossGame.player.y) < bossGame.player.h / 2 + b.r) {
        if (bossGame.invincible || bossGame.dashDuration > 0) {
          bossGame.bullets.splice(i, 1);
          bossBurst(b.x, b.y, "#22d3a4", 10);
          continue;
        }
        
        bossGame.bullets.splice(i, 1);
        
        if (bossGame.shield > 0) {
          bossGame.shield -= 1;
          q("bossShield").textContent = String(bossGame.shield);
          bossBurst(b.x, b.y, "#6bc8ff", 10);
        } else {
          bossGame.player.hp -= 10;
          bossPlayerHP.textContent = String(Math.max(0, bossGame.player.hp));
          bossBurst(bossGame.player.x, bossGame.player.y, "#ff5d73", 10);
          if (bossGame.player.hp <= 0) {
            bossEnd(false);
            return;
          }
        }
      }
    }

    for (let i = bossGame.playerBullets.length - 1; i >= 0; i -= 1) {
      const b = bossGame.playerBullets[i];
      b.y -= b.power ? 12 : 8;

      if (b.y < -10) {
        bossGame.playerBullets.splice(i, 1);
        continue;
      }

      if (Math.abs(b.x - bossGame.boss.x) < bossGame.boss.w / 2 &&
          Math.abs(b.y - bossGame.boss.y) < bossGame.boss.h / 2) {
        bossGame.playerBullets.splice(i, 1);
        const damage = b.power ? 25 : 10;
        bossGame.boss.hp -= damage;
        bossGame.damage += damage;
        bossHP.textContent = String(Math.max(0, bossGame.boss.hp));
        bossDamage.textContent = String(bossGame.damage);
        bossBurst(b.x, b.y, b.power ? "#ffd700" : "#ffb86b", b.power ? 15 : 8);

        if (Math.random() < 0.1) {
          const itemTypes = ["heal", "shield", "power"];
          const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
          bossGame.items.push({
            x: b.x,
            y: b.y,
            type: itemType,
            dy: 1.5
          });
        }

        const hpThreshold1 = bossGame.boss.maxHp / 3;
        const hpThreshold2 = bossGame.boss.maxHp * 2 / 3;
        const newPhase = bossGame.boss.hp <= hpThreshold1 ? 3 : bossGame.boss.hp <= hpThreshold2 ? 2 : 1;
        if (newPhase !== bossGame.boss.phase) {
          bossGame.boss.phase = newPhase;
          bossPhase.textContent = String(newPhase);
        }

        if (bossGame.boss.hp <= 0) {
          spawnNextBoss();
          return;
        }
      }
    }

    for (let i = bossGame.items.length - 1; i >= 0; i -= 1) {
      const item = bossGame.items[i];
      item.y += item.dy;

      if (item.y > bossCan.height + 20) {
        bossGame.items.splice(i, 1);
        continue;
      }

      if (Math.abs(item.x - bossGame.player.x) < 25 && Math.abs(item.y - bossGame.player.y) < 25) {
        bossGame.items.splice(i, 1);
        if (item.type === "heal") {
          bossGame.player.hp = Math.min(100, bossGame.player.hp + 20);
          bossPlayerHP.textContent = String(bossGame.player.hp);
        } else if (item.type === "shield") {
          bossGame.shield += 1;
          q("bossShield").textContent = String(bossGame.shield);
        } else if (item.type === "power") {
          bossGame.power = "power";
          bossGame.powerTimer = 300;
        }
        bossBurst(item.x, item.y, "#22d3a4", 15);
      }
    }

    for (let i = bossGame.parts.length - 1; i >= 0; i -= 1) {
      const p = bossGame.parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.life <= 0) bossGame.parts.splice(i, 1);
    }
  }

  function bossDraw() {
    bossCtx.clearRect(0, 0, bossCan.width, bossCan.height);
    bossCtx.fillStyle = "#040812";
    bossCtx.fillRect(0, 0, bossCan.width, bossCan.height);

    bossCtx.fillStyle = bossGame.boss.color;
    bossCtx.fillRect(bossGame.boss.x - bossGame.boss.w / 2, bossGame.boss.y - bossGame.boss.h / 2, bossGame.boss.w, bossGame.boss.h);
    bossCtx.fillStyle = "rgba(255,255,255,.2)";
    bossCtx.fillRect(bossGame.boss.x - bossGame.boss.w / 2, bossGame.boss.y - bossGame.boss.h / 2, bossGame.boss.w, 10);
    
    bossCtx.fillStyle = "#fff";
    bossCtx.font = "bold 12px Arial";
    bossCtx.textAlign = "center";
    bossCtx.fillText(bossGame.boss.name, bossGame.boss.x, bossGame.boss.y + 4);

    bossCtx.fillStyle = "#333";
    bossCtx.fillRect(bossGame.boss.x - 50, bossGame.boss.y - bossGame.boss.h / 2 - 15, 100, 8);
    bossCtx.fillStyle = bossGame.boss.hp > bossGame.boss.maxHp * 0.3 ? "#22d3a4" : "#ff5d73";
    bossCtx.fillRect(bossGame.boss.x - 50, bossGame.boss.y - bossGame.boss.h / 2 - 15, (bossGame.boss.hp / bossGame.boss.maxHp) * 100, 8);

    bossGame.bullets.forEach((b) => {
      bossCtx.fillStyle = b.color || "#ff6b8a";
      bossCtx.beginPath();
      bossCtx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      bossCtx.fill();
    });

    bossGame.playerBullets.forEach((b) => {
      if (b.dx !== undefined) {
        bossCtx.fillStyle = b.power ? "#ffd700" : "#7dd3fc";
        bossCtx.beginPath();
        bossCtx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        bossCtx.fill();
      } else {
        bossCtx.fillStyle = b.power ? "#ffd700" : "#7dd3fc";
        bossCtx.fillRect(b.x - 3, b.y - 8, 6, 12);
      }
    });

    bossGame.items.forEach((item) => {
      let itemColor = "#22d3a4";
      if (item.type === "heal") itemColor = "#ff6b8a";
      else if (item.type === "shield") itemColor = "#6bc8ff";
      else if (item.type === "power") itemColor = "#ffd700";
      
      bossCtx.fillStyle = itemColor;
      bossCtx.beginPath();
      bossCtx.arc(item.x, item.y, 8, 0, Math.PI * 2);
      bossCtx.fill();
      bossCtx.fillStyle = "#fff";
      bossCtx.font = "10px sans-serif";
      bossCtx.textAlign = "center";
      bossCtx.textBaseline = "middle";
      const icon = item.type === "heal" ? "+" : item.type === "shield" ? "S" : "P";
      bossCtx.fillText(icon, item.x, item.y);
    });

    if (bossGame.shield > 0) {
      bossCtx.strokeStyle = "rgba(107,200,255,.6)";
      bossCtx.lineWidth = 3;
      bossCtx.beginPath();
      bossCtx.arc(bossGame.player.x, bossGame.player.y, bossGame.player.w, 0, Math.PI * 2);
      bossCtx.stroke();
    }
    
    if (bossGame.dashDuration > 0) {
      bossCtx.fillStyle = "rgba(107,200,255,.3)";
      for (let i = 1; i <= 3; i += 1) {
        const trailX = bossGame.player.x - bossGame.dashDir.x * i * 10;
        const trailY = bossGame.player.y - bossGame.dashDir.y * i * 10;
        bossCtx.beginPath();
        bossCtx.arc(trailX, trailY, bossGame.player.w / 2 - i, 0, Math.PI * 2);
        bossCtx.fill();
      }
    }

    if (bossGame.power) {
      bossCtx.fillStyle = "#ffd700";
      bossCtx.fillRect(bossGame.player.x - bossGame.player.w / 2 - 2, bossGame.player.y - bossGame.player.h / 2 - 2, bossGame.player.w + 4, bossGame.player.h + 4);
    }

    if (bossGame.invincible || bossGame.dashDuration > 0) {
      bossCtx.fillStyle = Math.floor(Date.now() / 50) % 2 === 0 ? "#22d3a4" : "#4f7cff";
    } else {
      bossCtx.fillStyle = "#4f7cff";
    }
    bossCtx.fillRect(bossGame.player.x - bossGame.player.w / 2, bossGame.player.y - bossGame.player.h / 2, bossGame.player.w, bossGame.player.h);
    bossCtx.fillStyle = bossGame.invincible ? "#5eead4" : "#7ea7ff";
    bossCtx.fillRect(bossGame.player.x - bossGame.player.w / 2, bossGame.player.y - bossGame.player.h / 2, bossGame.player.w, 5);

    for (let i = 0; i < bossGame.parts.length; i += 1) {
      const p = bossGame.parts[i];
      bossCtx.globalAlpha = Math.max(0, p.life / 40);
      bossCtx.fillStyle = p.c;
      bossCtx.fillRect(p.x, p.y, 4, 4);
      bossCtx.globalAlpha = 1;
    }
  }

  function bossLoop(ts) {
    bossUpdate(ts);
    bossDraw();
    bossFrame += 1;
    if (ts - bossLast >= 1000) {
      bossFps.textContent = String(bossFrame);
      bossFrame = 0;
      bossLast = ts;
    }
    bossAnimId = requestAnimationFrame(bossLoop);
  }

  q("bossStart").onclick = function () {
    bossReset();
    if (!bossAnimId) bossAnimId = requestAnimationFrame(bossLoop);
  };

  bossCan.addEventListener("click", function(e) {
    if (!bossGame.running) return;
    const rect = bossCan.getBoundingClientRect();
    const scaleX = bossCan.width / rect.width;
    bossGame.playerBullets.push({
      x: bossGame.player.x,
      y: bossGame.player.y - bossGame.player.h / 2,
      power: bossGame.power !== null
    });
  });

  // ==================== GAME 8: 记忆翻牌 ====================
  const mGrid = q("memoryGrid");
  const mFlips = q("memoryFlips");
  const mMatched = q("memoryMatched");
  const mTime = q("memoryTime");
  const mBest = q("memoryBest");
  const mStatus = q("memoryStatus");

  const emojis = ["🎮", "🎯", "🎲", "🎪", "🎨", "🎭", "🎪", "🎸"];
  let memory = {
    cards: [],
    flipped: [],
    matched: 0,
    flips: 0,
    time: 0,
    running: false,
    timer: null,
    locked: false,
    best: localStorage.getItem("memoryBest") || null
  };

  if (memory.best) {
    mBest.textContent = memory.best + "s";
  }

  function memoryReset() {
    memory.cards = [];
    memory.flipped = [];
    memory.matched = 0;
    memory.flips = 0;
    memory.time = 0;
    memory.running = true;
    memory.locked = false;

    if (memory.timer) clearInterval(memory.timer);

    const pairs = [...emojis, ...emojis];
    for (let i = pairs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }

    mGrid.innerHTML = "";
    pairs.forEach((emoji, i) => {
      const card = document.createElement("div");
      card.className = "memory-card";
      card.dataset.index = i;
      card.dataset.emoji = emoji;
      card.textContent = "?";
      card.onclick = () => flipCard(card);
      mGrid.appendChild(card);
      memory.cards.push(card);
    });

    mFlips.textContent = "0";
    mMatched.textContent = "0";
    mTime.textContent = "0";
    mStatus.innerHTML = "状态：进行中";

    memory.timer = setInterval(() => {
      if (memory.running) {
        memory.time += 1;
        mTime.textContent = String(memory.time);
      }
    }, 1000);
  }

  function flipCard(card) {
    if (!memory.running || memory.locked) return;
    if (card.classList.contains("flipped") || card.classList.contains("matched")) return;

    card.classList.add("flipped");
    card.textContent = card.dataset.emoji;
    memory.flipped.push(card);

    if (memory.flipped.length === 2) {
      memory.locked = true;
      memory.flips += 1;
      mFlips.textContent = String(memory.flips);

      const [c1, c2] = memory.flipped;

      if (c1.dataset.emoji === c2.dataset.emoji) {
        c1.classList.add("matched");
        c2.classList.add("matched");
        memory.matched += 1;
        mMatched.textContent = String(memory.matched);
        memory.flipped = [];
        memory.locked = false;

        if (memory.matched === 8) {
          memory.running = false;
          clearInterval(memory.timer);
          mStatus.innerHTML = "<span class=good>状态：胜利！找出所有配对</span>";

          if (!memory.best || memory.time < memory.best) {
            memory.best = memory.time;
            localStorage.setItem("memoryBest", String(memory.time));
            mBest.textContent = memory.time + "s";
          }
        }
      } else {
        setTimeout(() => {
          c1.classList.remove("flipped");
          c2.classList.remove("flipped");
          c1.textContent = "?";
          c2.textContent = "?";
          memory.flipped = [];
          memory.locked = false;
        }, 800);
      }
    }
  }

  q("memoryStart").onclick = memoryReset;

  // ==================== 全局键盘事件 ====================
  document.addEventListener("keydown", function (e) {
    game.keys[e.key] = true;
    breakout.keys[e.key] = true;
    dodge.keys[e.key] = true;
    bulletHell.keys[e.key] = true;
    tetris.keys[e.key] = true;
    bossGame.keys[e.key] = true;

    if (!snake.running) return;
    const k = e.key;
    if ((k === "ArrowUp" || k === "w" || k === "W") && snake.dir.y === 0) snake.dir = { x: 0, y: -1 };
    if ((k === "ArrowDown" || k === "s" || k === "S") && snake.dir.y === 0) snake.dir = { x: 0, y: 1 };
    if ((k === "ArrowLeft" || k === "a" || k === "A") && snake.dir.x === 0) snake.dir = { x: -1, y: 0 };
    if ((k === "ArrowRight" || k === "d" || k === "D") && snake.dir.x === 0) snake.dir = { x: 1, y: 0 };
  });

  document.addEventListener("keyup", function (e) {
    game.keys[e.key] = false;
    breakout.keys[e.key] = false;
    dodge.keys[e.key] = false;
    bulletHell.keys[e.key] = false;
    tetris.keys[e.key] = false;
    bossGame.keys[e.key] = false;
  });

  // 初始绘制
  snakeDraw();
  shootDraw();
  if (bCtx) {
    bCtx.fillStyle = "#050a15";
    bCtx.fillRect(0, 0, bCan.width, bCan.height);
  }
  if (dCtx) {
    dCtx.fillStyle = "#040810";
    dCtx.fillRect(0, 0, dCan.width, dCan.height);
  }
  if (bhCtx) {
    bhCtx.fillStyle = "#030812";
    bhCtx.fillRect(0, 0, bhCan.width, bhCan.height);
  }
  if (tCtx) {
    tCtx.fillStyle = "#050a15";
    tCtx.fillRect(0, 0, tCan.width, tCan.height);
  }
  if (bossCtx) {
    bossCtx.fillStyle = "#040812";
    bossCtx.fillRect(0, 0, bossCan.width, bossCan.height);
  }
  requestAnimationFrame(shootLoop);

  // ==================== GAME 9: 鱼缸观景 (SeedLang 逻辑演示) ====================
  const fishCan = document.getElementById("fishCanvas");
  const fishCtx = fishCan ? fishCan.getContext("2d") : null;
  const fishCountEl = q("fishCount");
  const bubbleCountEl = q("bubbleCount");
  const foodCountEl = q("foodCount");
  const fishFpsEl = q("fishFps");

  const fishTank = {
    running: false,
    fishes: [],
    bubbles: [],
    plants: [],
    foods: [],
    time: 0,
    frame: 0,
    lastFps: 0,
    animId: null
  };

  function randomFishColor() {
    const colors = ["#ff6b8a", "#ffb86b", "#7dd3fc", "#a86bff", "#22d3a4", "#ff9f43"];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function initFishTank() {
    fishTank.running = true;
    fishTank.fishes = [];
    fishTank.bubbles = [];
    fishTank.plants = [];
    fishTank.foods = [];
    fishTank.time = 0;

    for (let i = 0; i < 8; i += 1) {
      fishTank.fishes.push({
        x: Math.random() * 480 + 20,
        y: Math.random() * 200 + 60,
        vx: Math.random() * 1.5 + 0.5,
        vy: Math.random() * 0.5 - 0.25,
        size: Math.random() * 12 + 8,
        color: randomFishColor(),
        tailPhase: Math.random() * 6.28,
        type: Math.floor(Math.random() * 3)
      });
    }

    for (let j = 0; j < 5; j += 1) {
      fishTank.plants.push({
        x: j * 110 + 50,
        h: Math.random() * 60 + 40,
        phase: Math.random() * 6.28,
        color: Math.random() < 0.5 ? "#2d8a4e" : "#1a6b3a"
      });
    }
  }

  function updateFishTank() {
    if (!fishTank.running) return;

    fishTank.time += 1;

    for (let i = 0; i < fishTank.fishes.length; i += 1) {
      const fish = fishTank.fishes[i];
      fish.x += fish.vx;
      fish.y += fish.vy + Math.sin(fishTank.time * 0.05 + i) * 0.3;
      fish.tailPhase += 0.15;

      if (fish.x > 540) {
        fish.x = -20;
        fish.y = Math.random() * 200 + 60;
      }

      if (fish.y < 40) fish.vy = Math.abs(fish.vy);
      if (fish.y > 280) fish.vy = -Math.abs(fish.vy);

      if (Math.random() < 0.005) {
        fishTank.bubbles.push({
          x: fish.x,
          y: fish.y,
          r: Math.random() * 4 + 2,
          speed: Math.random() * 0.8 + 0.4
        });
      }

      for (let j = fishTank.foods.length - 1; j >= 0; j -= 1) {
        const food = fishTank.foods[j];
        const dx = food.x - fish.x;
        const dy = food.y - fish.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < fish.size + 5) {
          fish.size = Math.min(fish.size + 1, 25);
          fishTank.foods.splice(j, 1);
        }
      }
    }

    for (let k = fishTank.bubbles.length - 1; k >= 0; k -= 1) {
      const bubble = fishTank.bubbles[k];
      bubble.y -= bubble.speed;
      bubble.x += Math.sin(fishTank.time * 0.1 + k) * 0.2;
      if (bubble.y < -10) {
        fishTank.bubbles.splice(k, 1);
      }
    }

    for (let m = fishTank.foods.length - 1; m >= 0; m -= 1) {
      const food = fishTank.foods[m];
      food.y += 0.5;
      if (food.y > 320) {
        fishTank.foods.splice(m, 1);
      }
    }

    if (Math.random() < 0.02) {
      fishTank.bubbles.push({
        x: Math.random() * 520,
        y: 320,
        r: Math.random() * 5 + 2,
        speed: Math.random() * 1 + 0.5
      });
    }
  }

  function drawFishTank() {
    if (!fishCtx) return;
    fishCtx.clearRect(0, 0, fishCan.width, fishCan.height);

    const gradient = fishCtx.createLinearGradient(0, 0, 0, fishCan.height);
    gradient.addColorStop(0, "#0a1628");
    gradient.addColorStop(1, "#0d2847");
    fishCtx.fillStyle = gradient;
    fishCtx.fillRect(0, 0, fishCan.width, fishCan.height);

    fishTank.plants.forEach((plant, idx) => {
      const sway = Math.sin(fishTank.time * 0.02 + plant.phase) * 5;
      fishCtx.fillStyle = plant.color;
      fishCtx.beginPath();
      fishCtx.moveTo(plant.x, fishCan.height);
      fishCtx.quadraticCurveTo(plant.x + sway, fishCan.height - plant.h / 2, plant.x + sway * 0.5, fishCan.height - plant.h);
      fishCtx.quadraticCurveTo(plant.x - sway * 0.3, fishCan.height - plant.h / 2, plant.x - 10, fishCan.height);
      fishCtx.fill();
    });

    fishTank.bubbles.forEach((bubble) => {
      fishCtx.strokeStyle = "rgba(107,200,255,0.4)";
      fishCtx.lineWidth = 1;
      fishCtx.beginPath();
      fishCtx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
      fishCtx.stroke();
    });

    fishTank.foods.forEach((food) => {
      fishCtx.fillStyle = "#ffb86b";
      fishCtx.beginPath();
      fishCtx.arc(food.x, food.y, 3, 0, Math.PI * 2);
      fishCtx.fill();
    });

    fishTank.fishes.forEach((fish) => {
      fishCtx.save();
      fishCtx.translate(fish.x, fish.y);
      
      const tailWag = Math.sin(fish.tailPhase) * 0.3;
      fishCtx.rotate(tailWag * 0.1);

      fishCtx.fillStyle = fish.color;
      fishCtx.beginPath();
      fishCtx.ellipse(0, 0, fish.size, fish.size * 0.6, 0, 0, Math.PI * 2);
      fishCtx.fill();

      fishCtx.fillStyle = fish.color;
      fishCtx.beginPath();
      fishCtx.moveTo(-fish.size, 0);
      fishCtx.lineTo(-fish.size - fish.size * 0.5, -fish.size * 0.4 + tailWag * 5);
      fishCtx.lineTo(-fish.size - fish.size * 0.5, fish.size * 0.4 + tailWag * 5);
      fishCtx.closePath();
      fishCtx.fill();

      fishCtx.fillStyle = "#fff";
      fishCtx.beginPath();
      fishCtx.arc(fish.size * 0.4, -fish.size * 0.1, fish.size * 0.15, 0, Math.PI * 2);
      fishCtx.fill();
      fishCtx.fillStyle = "#000";
      fishCtx.beginPath();
      fishCtx.arc(fish.size * 0.45, -fish.size * 0.1, fish.size * 0.08, 0, Math.PI * 2);
      fishCtx.fill();

      fishCtx.restore();
    });

    fishCtx.fillStyle = "rgba(20,40,80,0.3)";
    fishCtx.fillRect(0, fishCan.height - 20, fishCan.width, 20);

    fishCountEl.textContent = String(fishTank.fishes.length);
    bubbleCountEl.textContent = String(fishTank.bubbles.length);
    foodCountEl.textContent = String(fishTank.foods.length);
  }

  function fishTankLoop(ts) {
    updateFishTank();
    drawFishTank();
    fishTank.frame += 1;
    if (ts - fishTank.lastFps >= 1000) {
      fishFpsEl.textContent = String(fishTank.frame);
      fishTank.frame = 0;
      fishTank.lastFps = ts;
    }
    fishTank.animId = requestAnimationFrame(fishTankLoop);
  }

  q("fishStart").onclick = function () {
    initFishTank();
    if (!fishTank.animId) fishTank.animId = requestAnimationFrame(fishTankLoop);
  };

  if (fishCan) {
    fishCan.addEventListener("click", function (e) {
      if (!fishTank.running) return;
      const rect = fishCan.getBoundingClientRect();
      const scaleX = fishCan.width / rect.width;
      const scaleY = fishCan.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      fishTank.foods.push({ x: x, y: y });
    });
  }

  // ==================== GAME 10: 烟花演示 (SeedLang 逻辑演示) ====================
  const fireworkCan = document.getElementById("fireworkCanvas");
  const fireworkCtx = fireworkCan ? fireworkCan.getContext("2d") : null;
  const particleCountEl = q("particleCount");
  const rocketCountEl = q("rocketCount");
  const fireworkFpsEl = q("fireworkFps");
  const fireworkAutoBtn = q("fireworkAuto");

  const fireworks = {
    running: false,
    particles: [],
    rockets: [],
    time: 0,
    autoLaunch: true,
    frame: 0,
    lastFps: 0,
    animId: null
  };

  function initFireworks() {
    fireworks.running = true;
    fireworks.particles = [];
    fireworks.rockets = [];
    fireworks.time = 0;
    fireworks.autoLaunch = true;
    fireworkAutoBtn.textContent = "自动: 开";
  }

  function launchRocket(x, targetY) {
    fireworks.rockets.push({
      x: x,
      y: 320,
      targetY: targetY,
      vy: -Math.random() * 3 - 5,
      color: randomFishColor(),
      trail: []
    });
  }

  function explodeFirework(x, y, color) {
    const count = Math.floor(Math.random() * 40) + 30;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * 6.28;
      const speed = Math.random() * 4 + 2;
      fireworks.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Math.random() * 40 + 40,
        maxLife: 80,
        color: color,
        size: Math.random() * 3 + 1,
        type: Math.floor(Math.random() * 3)
      });
    }

    if (Math.random() < 0.3) {
      for (let j = 0; j < 15; j += 1) {
        const angle = Math.random() * 6.28;
        const speed = Math.random() * 2 + 1;
        fireworks.particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: Math.random() * 30 + 20,
          maxLife: 50,
          color: "#ffffff",
          size: Math.random() * 2 + 1,
          type: 2
        });
      }
    }
  }

  function updateFireworks() {
    if (!fireworks.running) return;

    fireworks.time += 1;

    if (fireworks.autoLaunch && Math.random() < 0.03) {
      launchRocket(Math.random() * 480 + 20, Math.random() * 100 + 60);
    }

    for (let i = fireworks.rockets.length - 1; i >= 0; i -= 1) {
      const rocket = fireworks.rockets[i];
      rocket.y += rocket.vy;
      rocket.trail.push({ x: rocket.x, y: rocket.y });

      if (rocket.trail.length > 10) {
        rocket.trail.shift();
      }

      if (rocket.y <= rocket.targetY) {
        explodeFirework(rocket.x, rocket.y, rocket.color);
        fireworks.rockets.splice(i, 1);
      }
    }

    for (let j = fireworks.particles.length - 1; j >= 0; j -= 1) {
      const p = fireworks.particles[j];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.vx *= 0.99;
      p.life -= 1;

      if (p.life <= 0) {
        fireworks.particles.splice(j, 1);
      }
    }
  }

  function drawFireworks() {
    if (!fireworkCtx) return;
    fireworkCtx.fillStyle = "rgba(4,8,18,0.2)";
    fireworkCtx.fillRect(0, 0, fireworkCan.width, fireworkCan.height);

    fireworks.rockets.forEach((rocket) => {
      rocket.trail.forEach((t, idx) => {
        const alpha = idx / rocket.trail.length;
        fireworkCtx.fillStyle = `rgba(255,255,255,${alpha * 0.5})`;
        fireworkCtx.fillRect(t.x - 1, t.y - 1, 2, 2);
      });

      fireworkCtx.fillStyle = rocket.color;
      fireworkCtx.beginPath();
      fireworkCtx.arc(rocket.x, rocket.y, 3, 0, Math.PI * 2);
      fireworkCtx.fill();
    });

    fireworks.particles.forEach((p) => {
      const alpha = p.life / p.maxLife;
      fireworkCtx.fillStyle = p.color;
      fireworkCtx.globalAlpha = alpha;
      
      if (p.type === 0) {
        fireworkCtx.beginPath();
        fireworkCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        fireworkCtx.fill();
      } else if (p.type === 1) {
        fireworkCtx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        fireworkCtx.beginPath();
        fireworkCtx.moveTo(p.x, p.y);
        fireworkCtx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2);
        fireworkCtx.strokeStyle = p.color;
        fireworkCtx.lineWidth = p.size * 0.5;
        fireworkCtx.stroke();
      }
      
      fireworkCtx.globalAlpha = 1;
    });

    particleCountEl.textContent = String(fireworks.particles.length);
    rocketCountEl.textContent = String(fireworks.rockets.length);
  }

  function fireworksLoop(ts) {
    updateFireworks();
    drawFireworks();
    fireworks.frame += 1;
    if (ts - fireworks.lastFps >= 1000) {
      fireworkFpsEl.textContent = String(fireworks.frame);
      fireworks.frame = 0;
      fireworks.lastFps = ts;
    }
    fireworks.animId = requestAnimationFrame(fireworksLoop);
  }

  q("fireworkStart").onclick = function () {
    initFireworks();
    if (!fireworks.animId) fireworks.animId = requestAnimationFrame(fireworksLoop);
  };

  q("fireworkAuto").onclick = function () {
    fireworks.autoLaunch = !fireworks.autoLaunch;
    fireworkAutoBtn.textContent = fireworks.autoLaunch ? "自动: 开" : "自动: 关";
  };

  if (fireworkCan) {
    fireworkCan.addEventListener("click", function (e) {
      if (!fireworks.running) return;
      const rect = fireworkCan.getBoundingClientRect();
      const scaleX = fireworkCan.width / rect.width;
      const x = (e.clientX - rect.left) * scaleX;
      launchRocket(x, Math.random() * 80 + 50);
    });
  }

  // ==================== GAME 11: 塔防战争 ====================
  const towerCan = q("towerCanvas");
  const towerCtx = towerCan ? towerCan.getContext("2d") : null;
  let towerAnimId = null;
  let towerFrame = 0;
  let towerLastFps = performance.now();
  
  const tower = {
    running: false,
    wave: 1,
    gold: 100,
    lives: 20,
    kills: 0,
    towers: [],
    enemies: [],
    bullets: [],
    path: [],
    gridSize: 40,
    cols: 18,
    rows: 10,
    spawnTimer: 0,
    enemiesSpawned: 0,
    enemiesPerWave: 5
  };

  function towerInit() {
    tower.path = [
      { x: 0, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 2 }, { x: 8, y: 2 },
      { x: 8, y: 7 }, { x: 12, y: 7 }, { x: 12, y: 3 }, { x: 17, y: 3 }
    ];
    tower.towers = [];
    tower.enemies = [];
    tower.bullets = [];
    tower.wave = 1;
    tower.gold = 100;
    tower.lives = 20;
    tower.kills = 0;
    tower.spawnTimer = 0;
    tower.enemiesSpawned = 0;
    tower.enemiesPerWave = 5;
    tower.running = false;
  }

  function towerStartWave() {
    if (tower.running) return;
    tower.running = true;
    tower.spawnTimer = 0;
    tower.enemiesSpawned = 0;
    tower.enemiesPerWave = 5 + tower.wave * 2;
  }

  function towerSpawnEnemy() {
    const types = ["normal", "fast", "tank", "boss"];
    const type = types[Math.floor(Math.random() * 4)];
    let hp = 30 + tower.wave * 10;
    let speed = 1;
    let reward = 10;
    
    if (type === "fast") { hp = 20 + tower.wave * 5; speed = 2; reward = 15; }
    if (type === "tank") { hp = 80 + tower.wave * 20; speed = 0.5; reward = 25; }
    if (type === "boss") { hp = 200 + tower.wave * 50; speed = 0.3; reward = 50; }
    
    tower.enemies.push({
      x: tower.path[0].x * tower.gridSize,
      y: tower.path[0].y * tower.gridSize,
      hp: hp,
      maxHp: hp,
      speed: speed,
      reward: reward,
      type: type,
      pathIndex: 0
    });
  }

  function towerAddTower(gx, gy) {
    if (tower.gold < 30) return false;
    
    for (const t of tower.towers) {
      if (t.gx === gx && t.gy === gy) return false;
    }
    
    for (const p of tower.path) {
      if (p.x === gx && p.y === gy) return false;
    }
    
    tower.gold -= 30;
    tower.towers.push({
      gx: gx, gy: gy,
      x: gx * tower.gridSize + tower.gridSize / 2,
      y: gy * tower.gridSize + tower.gridSize / 2,
      range: 120, damage: 10, fireRate: 30, fireCooldown: 0, level: 1
    });
    return true;
  }

  function towerStep() {
    if (!tower.running) {
      return { wave: tower.wave, gold: tower.gold, lives: tower.lives, kills: tower.kills,
               towerCount: tower.towers.length, enemyCount: tower.enemies.length,
               gameOver: false, victory: false };
    }
    
    tower.spawnTimer++;
    if (tower.spawnTimer >= 60 && tower.enemiesSpawned < tower.enemiesPerWave) {
      towerSpawnEnemy();
      tower.spawnTimer = 0;
      tower.enemiesSpawned++;
    }
    
    // Move enemies
    for (let i = 0; i < tower.enemies.length; i++) {
      const e = tower.enemies[i];
      if (e.pathIndex < tower.path.length - 1) {
        const target = tower.path[e.pathIndex + 1];
        const tx = target.x * tower.gridSize + tower.gridSize / 2;
        const ty = target.y * tower.gridSize + tower.gridSize / 2;
        const dx = tx - e.x;
        const dy = ty - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < e.speed * 2) {
          e.pathIndex++;
        } else {
          e.x += dx / dist * e.speed;
          e.y += dy / dist * e.speed;
        }
      } else {
        tower.lives--;
        tower.enemies.splice(i, 1);
        i--;
        if (tower.lives <= 0) {
          tower.running = false;
          return { wave: tower.wave, gold: tower.gold, lives: 0, kills: tower.kills,
                   towerCount: tower.towers.length, enemyCount: tower.enemies.length,
                   gameOver: true, victory: false };
        }
      }
    }
    
    // Tower firing
    for (const t of tower.towers) {
      t.fireCooldown--;
      if (t.fireCooldown <= 0) {
        let target = null;
        let minDist = t.range;
        
        for (let j = 0; j < tower.enemies.length; j++) {
          const e = tower.enemies[j];
          const dx = e.x - t.x;
          const dy = e.y - t.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            target = e;
          }
        }
        
        if (target) {
          tower.bullets.push({ x: t.x, y: t.y, target: target, damage: t.damage, speed: 5 });
          t.fireCooldown = t.fireRate;
        }
      }
    }
    
    // Move bullets
    for (let i = tower.bullets.length - 1; i >= 0; i--) {
      const b = tower.bullets[i];
      if (!b.target || !tower.enemies.includes(b.target)) {
        tower.bullets.splice(i, 1);
        continue;
      }
      
      const dx = b.target.x - b.x;
      const dy = b.target.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 10) {
        b.target.hp -= b.damage;
        if (b.target.hp <= 0) {
          tower.gold += b.target.reward;
          tower.kills++;
          const idx = tower.enemies.indexOf(b.target);
          if (idx >= 0) tower.enemies.splice(idx, 1);
        }
        tower.bullets.splice(i, 1);
      } else {
        b.x += dx / dist * b.speed;
        b.y += dy / dist * b.speed;
      }
    }
    
    // Check wave complete
    if (tower.enemies.length === 0 && tower.enemiesSpawned >= tower.enemiesPerWave) {
      tower.wave++;
      tower.gold += 20;
      tower.running = false;
      if (tower.wave > 10) {
        return { wave: tower.wave, gold: tower.gold, lives: tower.lives, kills: tower.kills,
                 towerCount: tower.towers.length, enemyCount: 0,
                 gameOver: false, victory: true };
      }
    }
    
    return { wave: tower.wave, gold: tower.gold, lives: tower.lives, kills: tower.kills,
             towerCount: tower.towers.length, enemyCount: tower.enemies.length,
             gameOver: false, victory: false };
  }

  function towerDraw() {
    if (!towerCtx) return;
    towerCtx.fillStyle = "#050a14";
    towerCtx.fillRect(0, 0, towerCan.width, towerCan.height);
    
    // Draw grid
    towerCtx.strokeStyle = "rgba(100,120,180,0.2)";
    for (let x = 0; x <= tower.cols; x++) {
      towerCtx.beginPath();
      towerCtx.moveTo(x * tower.gridSize, 0);
      towerCtx.lineTo(x * tower.gridSize, towerCan.height);
      towerCtx.stroke();
    }
    for (let y = 0; y <= tower.rows; y++) {
      towerCtx.beginPath();
      towerCtx.moveTo(0, y * tower.gridSize);
      towerCtx.lineTo(towerCan.width, y * tower.gridSize);
      towerCtx.stroke();
    }
    
    // Draw path
    towerCtx.strokeStyle = "#4f7cff";
    towerCtx.lineWidth = 3;
    towerCtx.beginPath();
    for (let i = 0; i < tower.path.length; i++) {
      const p = tower.path[i];
      const px = p.x * tower.gridSize + tower.gridSize / 2;
      const py = p.y * tower.gridSize + tower.gridSize / 2;
      if (i === 0) towerCtx.moveTo(px, py);
      else towerCtx.lineTo(px, py);
    }
    towerCtx.stroke();
    towerCtx.lineWidth = 1;
    
    // Draw towers
    for (const t of tower.towers) {
      towerCtx.fillStyle = "#22d3a4";
      towerCtx.beginPath();
      towerCtx.arc(t.x, t.y, 15, 0, Math.PI * 2);
      towerCtx.fill();
      
      towerCtx.strokeStyle = "rgba(34,211,164,0.3)";
      towerCtx.beginPath();
      towerCtx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
      towerCtx.stroke();
      
      towerCtx.fillStyle = "#fff";
      towerCtx.font = "10px sans-serif";
      towerCtx.textAlign = "center";
      towerCtx.fillText("Lv" + t.level, t.x, t.y + 4);
    }
    
    // Draw enemies
    for (const e of tower.enemies) {
      const colors = { normal: "#ff6b8a", fast: "#ffbf59", tank: "#a86bff", boss: "#ffd700" };
      towerCtx.fillStyle = colors[e.type] || "#ff6b8a";
      towerCtx.beginPath();
      towerCtx.arc(e.x, e.y, e.type === "boss" ? 12 : 8, 0, Math.PI * 2);
      towerCtx.fill();
      
      // HP bar
      const hpWidth = 20;
      towerCtx.fillStyle = "#333";
      towerCtx.fillRect(e.x - hpWidth/2, e.y - 18, hpWidth, 4);
      towerCtx.fillStyle = "#22d3a4";
      towerCtx.fillRect(e.x - hpWidth/2, e.y - 18, hpWidth * (e.hp / e.maxHp), 4);
    }
    
    // Draw bullets
    towerCtx.fillStyle = "#b8ccff";
    for (const b of tower.bullets) {
      towerCtx.beginPath();
      towerCtx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      towerCtx.fill();
    }
  }

  function towerLoop(ts) {
    const result = towerStep();
    
    q("towerWave").textContent = String(result.wave);
    q("towerGold").textContent = String(result.gold);
    q("towerLives").textContent = String(result.lives);
    q("towerKills").textContent = String(result.kills);
    q("towerCount").textContent = String(result.towerCount);
    q("towerEnemies").textContent = String(result.enemyCount);
    
    towerDraw();
    
    towerFrame++;
    if (ts - towerLastFps >= 1000) {
      q("towerFps").textContent = String(towerFrame);
      towerFrame = 0;
      towerLastFps = ts;
    }
    
    if (result.gameOver) {
      q("towerStatus").innerHTML = "<span class=bad>状态：失败！敌人突破了防线</span>";
    } else if (result.victory) {
      q("towerStatus").innerHTML = "<span class=good>状态：胜利！成功守住10波进攻</span>";
    } else if (!tower.running) {
      q("towerStatus").innerHTML = "状态：点击\"开始波次\"继续下一波";
    }
    
    towerAnimId = requestAnimationFrame(towerLoop);
  }

  q("towerStart").onclick = function () {
    if (!tower.running) {
      towerStartWave();
      q("towerStatus").innerHTML = "状态：进行中";
    }
    if (!towerAnimId) {
      towerInit();
      towerAnimId = requestAnimationFrame(towerLoop);
    }
  };

  if (towerCan) {
    towerCan.addEventListener("click", function (e) {
      const rect = towerCan.getBoundingClientRect();
      const scaleX = towerCan.width / rect.width;
      const scaleY = towerCan.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const gx = Math.floor(x / tower.gridSize);
      const gy = Math.floor(y / tower.gridSize);
      
      if (towerAddTower(gx, gy)) {
        q("towerGold").textContent = String(tower.gold);
        q("towerCount").textContent = String(tower.towers.length);
      }
    });
  }

  // ==================== DEMO 12: Lumen Lite (SeedLang GI) ====================
  const lCan = q("lumenCanvas");
  const lCtx = lCan ? lCan.getContext("2d") : null;
  const lFps = q("lumenFps");
  const lStatus = q("lumenStatus");
  const lStart = q("lumenStart");
  let lumenAnimId = null;
  let lFrame = 0;
  let lLast = performance.now();
  let lReady = false;
  let lBufCan = null;
  let lBufCtx = null;

  function lumenBoot() {
    if (typeof lumenInit !== "function" || typeof lumenStep !== "function" || typeof lumenSetLight !== "function") {
      if (lStatus) lStatus.innerHTML = "<span class=bad>状态：未找到 SeedLang 逻辑，请先加载 lumen_lite_logic.js</span>";
      return false;
    }

    lumenInit(96, 54);
    lBufCan = document.createElement("canvas");
    lBufCan.width = lumen.w;
    lBufCan.height = lumen.h;
    lBufCtx = lBufCan.getContext("2d");
    lReady = true;
    if (lStatus) lStatus.innerHTML = "状态：运行中（核心计算来自 SeedLang）";
    return true;
  }

  function lumenDraw() {
    if (!lCtx || !lReady || !lBufCtx) return;

    const gi = lumen.gi;
    const occ = lumen.occ;
    const img = lBufCtx.createImageData(lumen.w, lumen.h);
    const data = img.data;

    for (let y = 0; y < lumen.h; y++) {
      for (let x = 0; x < lumen.w; x++) {
        const v = Math.max(0, Math.min(1, gi[y][x] || 0));
        const tone = v / (1 + v);
        const i = (y * lumen.w + x) * 4;
        if (occ[y][x] === 1) {
          data[i] = 44;
          data[i + 1] = 52;
          data[i + 2] = 82;
        } else {
          data[i] = Math.floor(20 + 240 * tone);
          data[i + 1] = Math.floor(28 + 220 * tone);
          data[i + 2] = Math.floor(40 + 255 * tone);
        }
        data[i + 3] = 255;
      }
    }

    lBufCtx.putImageData(img, 0, 0);
    lCtx.imageSmoothingEnabled = false;
    lCtx.drawImage(lBufCan, 0, 0, lCan.width, lCan.height);

    // 光源指示器
    const sx = (lumen.lightX / lumen.w) * lCan.width;
    const sy = (lumen.lightY / lumen.h) * lCan.height;
    lCtx.strokeStyle = "rgba(255,245,170,0.95)";
    lCtx.lineWidth = 2;
    lCtx.beginPath();
    lCtx.arc(sx, sy, 6, 0, Math.PI * 2);
    lCtx.stroke();
  }

  function lumenLoop(ts) {
    if (!lReady) return;
    lumenStep();
    lumenDraw();
    lFrame += 1;
    if (ts - lLast >= 1000) {
      if (lFps) lFps.textContent = String(lFrame);
      lFrame = 0;
      lLast = ts;
    }
    lumenAnimId = requestAnimationFrame(lumenLoop);
  }

  if (lCan) {
    lCan.addEventListener("mousemove", function (e) {
      if (!lReady) return;
      const rect = lCan.getBoundingClientRect();
      const sx = lumen.w / rect.width;
      const sy = lumen.h / rect.height;
      const lx = (e.clientX - rect.left) * sx;
      const ly = (e.clientY - rect.top) * sy;
      lumenSetLight(lx, ly);
    });
  }

  if (lStart) {
    lStart.onclick = function () {
      if (!lReady && !lumenBoot()) return;
      if (lumenAnimId) cancelAnimationFrame(lumenAnimId);
      lFrame = 0;
      lLast = performance.now();
      lumenAnimId = requestAnimationFrame(lumenLoop);
    };
  }

  // 尝试自动初始化一帧，保证页面打开即可看到效果
  if (lCan && !lReady && lumenBoot()) {
    lumenStep();
    lumenDraw();
  }

  towerInit();
})();
