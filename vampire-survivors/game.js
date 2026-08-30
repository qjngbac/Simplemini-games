// 吸血鬼幸存者 · 迷你版 — 纯前端 Canvas 实现
(function () {
  "use strict";

  // ---------- 画布 ----------
  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");
  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize); resize();

  // ---------- 工具 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  
  // 性能优化：预分配数组，避免频繁创建临时数组
  // tempArray 给武器索敌用、tempArray2 给弹丸碰撞用。两者分开，避免将来
  // 某处嵌套调用时互相踩踏（共用一个数组属于"现在没出事、迟早出事"的隐患）
  const tempArray = [];
  const tempArray2 = [];

  // ---------- 输入 ----------
  const keys = {};
  window.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
    keys[k] = true;
  });
  window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

  // 虚拟摇杆（触屏）
  const stick = document.getElementById("stick");
  const knob = document.getElementById("stick-knob");
  const stickState = { active: false, cx: 0, cy: 0, dx: 0, dy: 0 };
  function stickStart(x, y) {
    stickState.active = true; stickState.cx = x; stickState.cy = y; stickState.dx = 0; stickState.dy = 0;
    stick.classList.add("active");
    stick.style.left = (x - 55) + "px"; stick.style.top = (y - 55) + "px";
    knob.style.transform = "translate(0,0)";
  }
  function stickMove(x, y) {
    if (!stickState.active) return;
    let dx = x - stickState.cx, dy = y - stickState.cy;
    const len = Math.hypot(dx, dy), max = 42;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    stickState.dx = dx / max; stickState.dy = dy / max;
  }
  function stickEnd() { stickState.active = false; stick.classList.remove("active"); stickState.dx = 0; stickState.dy = 0; }

  cv.addEventListener("pointerdown", e => { if (state === "playing") stickStart(e.clientX, e.clientY); });
  cv.addEventListener("pointermove", e => { if (stickState.active) stickMove(e.clientX, e.clientY); });
  window.addEventListener("pointerup", stickEnd);
  window.addEventListener("pointercancel", stickEnd);

  function inputDir() {
    let x = 0, y = 0;
    if (keys["a"] || keys["arrowleft"]) x -= 1;
    if (keys["d"] || keys["arrowright"]) x += 1;
    if (keys["w"] || keys["arrowup"]) y -= 1;
    if (keys["s"] || keys["arrowdown"]) y += 1;
    if (stickState.active) { x = stickState.dx; y = stickState.dy; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  // ---------- 空间网格分区（性能关键） ----------
  const CELL = 90;
  let grid = new Map();
  function cellKey(cx, cy) { return cx + "," + cy; }
  function rebuildGrid(list) {
    grid.clear();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
      const k = cellKey(cx, cy);
      let arr = grid.get(k); if (!arr) { arr = []; grid.set(k, arr); }
      arr.push(e);
    }
  }
  function queryNear(list, x, y, r, out) {
    out.length = 0;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    const cr = Math.ceil(r / CELL);
    for (let gx = cx - cr; gx <= cx + cr; gx++)
      for (let gy = cy - cr; gy <= cy + cr; gy++) {
        const arr = grid.get(cellKey(gx, gy));
        if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
      }
    return out;
  }

  // ---------- 对象池 ----------
  function makePool(factory) {
    const free = [];
    return {
      free,
      get() { return free.length ? free.pop() : factory(); },
      release(e) { free.push(e); }
    };
  }

  // ---------- 玩家 ----------
  const player = {
    x: 0, y: 0, r: 16, speed: 200,
    hp: 100, maxHp: 100,
    level: 1, xp: 0, xpNext: 5,
    pickup: 160, invuln: 0,       // 拾取范围加大，经验宝石更容易被吸到
    dmgMul: 1, // 全局伤害倍率（升级）
  };

  // ---------- 敌人 ----------
  const enemyPool = makePool(() => ({}));
  let enemies = [];
  const enemyTmp = [];
  function spawnEnemy(t) {
    if (enemies.length > 650) return;
    const ang = rand(0, Math.PI * 2);
    // 生成在屏幕外刚好看不到的位置（半对角线 + 边距），而非远在 0.62 倍屏外
    const rad = Math.hypot(W, H) / 2 + 70;
    const e = enemyPool.get();
    // 关键：对象池复用时必须重置 dead 标志，否则新怪一出生就被判定为死亡移除
    e.dead = false;
    const hpScale = 1 + t / 75;          // 随时间变强
    const boss = Math.random() < 0.02 && t > 40;
    e.x = player.x + Math.cos(ang) * rad;
    e.y = player.y + Math.sin(ang) * rad;
    e.boss = boss;
    e.r = boss ? 34 : rand(11, 16);
    e.maxHp = (boss ? 260 : rand(8, 16)) * hpScale;
    e.hp = e.maxHp;
    // 提高基础速度，让敌人尽快进入视野，避免空窗期
    e.speed = (boss ? 60 : rand(85, 125)) * (1 + t / 500);
    e.dmg = boss ? 22 : rand(6, 11);
    e.xp = boss ? 30 : 2;
    e.flash = 0;
    enemies.push(e);
  }

  // ---------- 弹丸 ----------
  const projPool = makePool(() => ({}));
  let projectiles = [];
  function fireProjectile(x, y, vx, vy, dmg, r, life, color) {
    const p = projPool.get();
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.dmg = dmg; p.r = r || 6; p.life = life || 2.2; p.color = color || "#ffd86b";
    projectiles.push(p);
  }

  // ---------- 经验宝石 ----------
  const gemPool = makePool(() => ({}));
  let gems = [];
  function dropGem(x, y, val) {
    if (gems.length > 700) return;
    const g = gemPool.get();
    g.x = x; g.y = y; g.val = val; g.r = 5; g.vx = rand(-30, 30); g.vy = rand(-30, 30);
    gems.push(g);
  }

  // ---------- 武器 ----------
  // 每把武器独立计时，叠加生效
  const weapons = [];
  function addWeapon(def) { const w = Object.assign({ cd: 0, t: 0 }, def); weapons.push(w); return w; }

  function initWeapons() {
    weapons.length = 0;
    // 1) 魔法飞弹：索敌最近敌人
    addWeapon({
      type: "missile", name: "魔法飞弹", level: 1, t: 0,
      interval: 0.9, count: 1, dmg: 9, speed: 430, color: "#ffd86b",
    });
  }

  function updateWeapons(dt, t) {
    for (const w of weapons) {
      w.t -= dt;
      if (w.t > 0) continue;
      if (w.type === "missile") {
        // 选最近的 count 个敌人
        // 索敌要的是"全局最近"，用空间网格其实没有意义：半径 9999 会让
        // queryNear 展开成 5 万+ 个网格单元查询。直接遍历 enemies 反而更快
        // （上限 650 个，每 0.9 秒才跑一次，排序开销可忽略）。
        const cand = tempArray;
        cand.length = 0;
        for (let i = 0; i < enemies.length; i++) cand.push(enemies[i]);
        cand.sort((a, b) => dist2(a.x, a.y, player.x, player.y) - dist2(b.x, b.y, player.x, player.y));
        const n = Math.min(w.count, cand.length);
        for (let i = 0; i < n; i++) {
          const e = cand[i];
          const dx = e.x - player.x, dy = e.y - player.y, l = Math.hypot(dx, dy) || 1;
          fireProjectile(player.x, player.y, dx / l * w.speed, dy / l * w.speed, w.dmg * player.dmgMul, 7, 2.4, w.color);
        }
        w.t = w.interval;
      } else if (w.type === "aura") {
        // 范围脉冲
        const hit = [];
        queryNear(enemies, player.x, player.y, w.radius, hit);
        for (const e of hit) {
          const d = Math.hypot(e.x - player.x, e.y - player.y);
          if (d < w.radius + e.r) damageEnemy(e, w.dmg * player.dmgMul * dt, 0);
        }
        w.t = w.interval;
      } else if (w.type === "orbit") {
        // 环绕法球（持续接触伤害）
        for (const o of w.orbs) {
          o.ang += w.spin * dt;
          const ox = player.x + Math.cos(o.ang) * w.radius;
          const oy = player.y + Math.sin(o.ang) * w.radius;
          const hit = [];
          queryNear(enemies, ox, oy, 26, hit);
          for (const e of hit) {
            if (dist2(e.x, e.y, ox, oy) < (e.r + 14) * (e.r + 14)) damageEnemy(e, w.dmg * player.dmgMul * dt, 0);
          }
        }
        w.t = 0.05;
      }
    }
  }

  // ---------- 伤害 / 死亡 ----------
  function damageEnemy(e, dmg, knock) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 0.08;
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    e.dead = true;
    dropGem(e.x, e.y, e.xp);
    stats.kills++;
  }

  // ---------- 升级增益（数据驱动） ----------
  const UPGRADES = [
    { id: "missile_new", ico: "🏹", name: "魔法飞弹", desc: "新增/强化：自动射向最近的敌人",
      avail: () => !weapons.find(w => w.type === "missile"),
      apply: () => { const w = weapons.find(w => w.type === "missile"); if (w) { w.level++; w.count++; w.dmg += 4; } else addWeapon({ type:"missile", name:"魔法飞弹", level:1, t:0, interval:0.9, count:1, dmg:9, speed:430, color:"#ffd86b" }); } },
    { id: "aura_new", ico: "🔥", name: "灼烧光环", desc: "身边持续灼烧靠近的敌人",
      avail: () => !weapons.find(w => w.type === "aura"),
      apply: () => { const w = weapons.find(w => w.type === "aura"); if (w) { w.level++; w.radius += 18; w.dmg += 6; } else addWeapon({ type:"aura", name:"灼烧光环", level:1, t:0, interval:0.25, radius:80, dmg:14 }); } },
    { id: "orbit_new", ico: "🪐", name: "环绕法球", desc: "围绕你旋转、触碰即伤的护体法球",
      avail: () => !weapons.find(w => w.type === "orbit"),
      apply: () => {
        const w = weapons.find(w => w.type === "orbit");
        if (w) { w.level++; w.count++; w.orbs.push({ ang: rand(0, 6.28) }); w.dmg += 5; }
        else { const orbs = [{ ang: 0 }, { ang: Math.PI }]; addWeapon({ type:"orbit", name:"环绕法球", level:1, t:0, interval:0.05, radius:70, dmg:18, spin:2.4, count:2, orbs }); }
      } },
    { id: "dmg", ico: "💥", name: "锋利", desc: "所有武器伤害 +25%", avail: () => true, apply: () => { player.dmgMul *= 1.25; } },
    { id: "rate", ico: "⚡", name: "急速", desc: "飞弹/光环攻击频率 +18%", avail: () => true, apply: () => { for (const w of weapons) if (w.type !== "orbit") w.interval *= 0.82; } },
    { id: "hp", ico: "❤️", name: "强壮", desc: "最大生命 +30 并回满该值", avail: () => true, apply: () => { player.maxHp += 30; player.hp = Math.min(player.maxHp, player.hp + 30); } },
    { id: "speed", ico: "👟", name: "疾行", desc: "移动速度 +12%", avail: () => true, apply: () => { player.speed *= 1.12; } },
    { id: "magnet", ico: "🧲", name: "拾取", desc: "经验拾取范围 +35%", avail: () => true, apply: () => { player.pickup *= 1.35; } },
  ];

  function levelUp() {
    player.level++;
    player.xp -= player.xpNext;
    // 升级所需经验温和增长（原 1.35 倍过陡，改 1.2 倍），让中后期也能较快升级
    player.xpNext = Math.floor(player.xpNext * 1.2 + 2);
    // 抽取 3 个可选（去重、满足 avail）
    const pool = UPGRADES.filter(u => u.avail());
    const picks = [];
    const copy = pool.slice();
    while (picks.length < 3 && copy.length) {
      const i = Math.floor(Math.random() * copy.length);
      picks.push(copy.splice(i, 1)[0]);
    }
    if (picks.length === 0) { return; } // 没得选就略过
    showUpgrade(picks);
  }

  // ---------- 状态 ----------
  let state = "menu"; // menu | playing | upgrade | over
  const stats = { time: 0, kills: 0 };
  let spawnAcc = 0;
  let topUpAcc = 0; // 保底补刷计时

  function reset() {
    enemies = []; projectiles = []; gems = [];
    Object.assign(player, { x: 0, y: 0, r: 16, speed: 200, hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: 5, pickup: 160, invuln: 0, dmgMul: 1 });
    initWeapons();
    stats.time = 0; stats.kills = 0; spawnAcc = 0; topUpAcc = 0;
  }

  // ---------- 主循环 ----------
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05; // 防卡顿跳变
    if (state === "playing") update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    stats.time += dt;
    const t = stats.time;

    // 玩家移动
    const dir = inputDir();
    player.x += dir.x * player.speed * dt;
    player.y += dir.y * player.speed * dt;
    if (player.invuln > 0) player.invuln -= dt;

    // 刷怪（密度随时间提升）：开局更快，避免空窗
    const rate = 0.32 - Math.min(0.24, t / 300); // 秒/只，开局 0.32s → 最低 0.08s
    spawnAcc += dt;
    while (spawnAcc >= rate) { spawnAcc -= rate; spawnEnemy(t); }
    // 保底补刷：屏幕上怪物少于阈值时持续补充，保证始终有怪可打
    const minMobs = 10 + Math.floor(t / 18);
    if (enemies.length < minMobs) {
      topUpAcc += dt;
      if (topUpAcc >= 0.12) { topUpAcc = 0; spawnEnemy(t); }
    }

    // 重建空间网格
    rebuildGrid(enemies);

    // 敌人追逐 + 接触伤害
    const nearP = [];
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) { enemies.splice(i, 1); enemyPool.release(e); continue; }
      if (e.flash > 0) e.flash -= dt;
      const dx = player.x - e.x, dy = player.y - e.y, l = Math.hypot(dx, dy) || 1;
      e.x += dx / l * e.speed * dt;
      e.y += dy / l * e.speed * dt;
      if (l < e.r + player.r) {
        if (player.invuln <= 0) {
          player.hp -= e.dmg; player.invuln = 0.6;
          if (player.hp <= 0) { player.hp = 0; gameOver(); return; }
        }
      }
    }

    // 武器
    updateWeapons(dt, t);

    // 弹丸移动 + 命中
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      let hit = false;
      if (p.life > 0) {
        // 弹丸碰撞用独立的临时数组
        const cand = tempArray2;
        cand.length = 0;
        queryNear(enemies, p.x, p.y, p.r + 18, cand);
        for (const e of cand) {
          const rr = e.r + p.r;
          if (dist2(e.x, e.y, p.x, p.y) < rr * rr) { damageEnemy(e, p.dmg, 1); hit = true; break; }
        }
      }
      if (hit || p.life <= 0) { projectiles.splice(i, 1); projPool.release(p); }
    }

    // 经验宝石：磁吸 + 拾取
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      const d = Math.hypot(player.x - g.x, player.y - g.y);
      if (d < player.pickup) {
        const pull = 520 * dt;  // 吸力加大，匹配更大的拾取范围
        g.x += (player.x - g.x) / (d || 1) * Math.min(pull, d);
        g.y += (player.y - g.y) / (d || 1) * Math.min(pull, d);
      }
      if (d < player.r + 6) {
        player.xp += g.val;
        gems.splice(i, 1); gemPool.release(g);
      }
    }

    // 升级判定放在每帧末尾统一检查。旧写法只在"拾到宝石的那一帧"判定，
    // 于是一次吃到远超阈值的经验（比如同时吸走一大片宝石）只会升 1 级，
    // 剩余的经验要等下一颗宝石进账才继续触发。
    while (state === "playing" && player.xp >= player.xpNext) levelUp();

    if (state === "upgrade") return;
  }

  // ---------- 渲染 ----------
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (state === "menu") return;
    const camX = player.x - W / 2, camY = player.y - H / 2;

    // 背景网格（体现移动）
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;
    const gs = 60;
    const ox = -((camX % gs) + gs) % gs, oy = -((camY % gs) + gs) % gs;
    ctx.beginPath();
    for (let x = ox; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = oy; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    const sx = x => x - camX, sy = y => y - camY;

    // 宝石
    for (const g of gems) {
      ctx.fillStyle = "#5bff9b";
      ctx.beginPath(); ctx.arc(sx(g.x), sy(g.y), g.r, 0, 6.28); ctx.fill();
    }

    // 敌人
    for (const e of enemies) {
      ctx.fillStyle = e.flash > 0 ? "#ffffff" : (e.boss ? "#ff5b9e" : "#c45bff");
      ctx.beginPath(); ctx.arc(sx(e.x), sy(e.y), e.r, 0, 6.28); ctx.fill();
      if (e.boss || e.hp < e.maxHp) {
        const w = e.r * 2, hpf = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(sx(e.x) - w/2, sy(e.y) - e.r - 7, w, 3);
        ctx.fillStyle = "#ff6b6b"; ctx.fillRect(sx(e.x) - w/2, sy(e.y) - e.r - 7, w * hpf, 3);
      }
    }

    // 武器特效
    for (const w of weapons) {
      if (w.type === "aura") {
        ctx.fillStyle = "rgba(255,120,60,0.10)";
        ctx.beginPath(); ctx.arc(sx(player.x), sy(player.y), w.radius, 0, 6.28); ctx.fill();
      } else if (w.type === "orbit") {
        for (const o of w.orbs) {
          const ox = player.x + Math.cos(o.ang) * w.radius, oy = player.y + Math.sin(o.ang) * w.radius;
          ctx.fillStyle = "#7ad0ff";
          ctx.beginPath(); ctx.arc(sx(ox), sy(oy), 9, 0, 6.28); ctx.fill();
        }
      }
    }

    // 弹丸
    for (const p of projectiles) {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), p.r, 0, 6.28); ctx.fill();
    }

    // 玩家
    ctx.save();
    ctx.translate(sx(player.x), sy(player.y));
    ctx.fillStyle = player.invuln > 0 ? "#9fd0ff" : "#5b8bff";
    ctx.beginPath(); ctx.arc(0, 0, player.r, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("😎", 0, 1);
    ctx.restore();

    updateHUD();
  }

  // ---------- HUD ----------
  const elTimer = document.getElementById("timer");
  const elKills = document.getElementById("kills");
  const elHpFill = document.getElementById("hpfill");
  const elHpText = document.getElementById("hptext");
  const elXpFill = document.getElementById("xpfill");
  const elLvText = document.getElementById("lvtext");
  function updateHUD() {
    const m = Math.floor(stats.time / 60), s = Math.floor(stats.time % 60);
    elTimer.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    elKills.textContent = "击杀 " + stats.kills;
    elHpFill.style.width = (player.hp / player.maxHp * 100) + "%";
    elHpText.textContent = Math.ceil(player.hp) + "/" + player.maxHp;
    elXpFill.style.width = (player.xp / player.xpNext * 100) + "%";
    elLvText.textContent = "Lv." + player.level;
  }

  // 升级卡对应的武器当前等级（只给"武器类"增益显示 Lv.）
  function weaponLevelTag(upgradeId) {
    const type = upgradeId === "missile_new" ? "missile"
      : upgradeId === "aura_new" ? "aura"
      : upgradeId === "orbit_new" ? "orbit" : null;
    if (!type) return "";
    const w = weapons.find(x => x.type === type);
    return w && w.level ? ` Lv.${w.level}` : " Lv.1";
  }

  // ---------- 升级界面 ----------
  const upgradeEl = document.getElementById("upgrade");
  const cardsEl = document.getElementById("upgrade-cards");
  function showUpgrade(picks) {
    state = "upgrade";
    cardsEl.innerHTML = "";
    for (const u of picks) {
      const card = document.createElement("div");
      card.className = "card";
      // 武器卡显示当前等级。w.level 一直有累加，但升级界面原来不显示，
      // 玩家根本看不出自己这把武器练到几级了。
      card.innerHTML = `<div class="ico">${u.ico}</div>` +
        `<div class="name">${u.name}${weaponLevelTag(u.id)}</div>` +
        `<div class="desc">${u.desc}</div>`;
      card.addEventListener("click", () => {
        u.apply();
        upgradeEl.classList.add("hidden");
        state = "playing";
        last = performance.now();
      });
      cardsEl.appendChild(card);
    }
    upgradeEl.classList.remove("hidden");
  }

  // ---------- 菜单 / 结束 ----------
  const menuEl = document.getElementById("menu");
  const overEl = document.getElementById("gameover");
  const goStats = document.getElementById("goStats");
  function startGame() {
    reset();
    menuEl.classList.add("hidden");
    overEl.classList.add("hidden");
    upgradeEl.classList.add("hidden");
    state = "playing"; last = performance.now();
  }
  // ---------- 本机战绩（localStorage） ----------
  const REC_KEY = "vs_records";
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function submitRun() {
    const r = loadRec();
    r.runs = (r.runs || 0) + 1;
    r.bestTime = Math.max(r.bestTime || 0, stats.time);
    r.bestKills = Math.max(r.bestKills || 0, stats.kills);
    r.bestLevel = Math.max(r.bestLevel || 0, player.level);
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
    return r;
  }
  function recHTML(r) {
    if (!r || !r.runs) return '<span class="empty">还没有战绩，先活过一分钟吧</span>';
    const t = (v) => { const m = Math.floor(v / 60), s = Math.floor(v % 60); return String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0"); };
    return '<div class="rec best"><div class="rk">最长存活</div><div class="rv">' + t(r.bestTime) + '</div></div>' +
           '<div class="rec"><div class="rk">最多击杀</div><div class="rv">' + (r.bestKills || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">最高等级</div><div class="rv">Lv.' + (r.bestLevel || 1) + '</div></div>' +
           '<div class="rec"><div class="rk">局数</div><div class="rv">' + r.runs + '</div></div>';
  }
  function renderRecords() {
    const html = recHTML(loadRec());
    const a = document.getElementById("vsRecords");
    const b = document.getElementById("vsRecordsOver");
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
  }

  function gameOver() {
    state = "over";
    const m = Math.floor(stats.time / 60), s = Math.floor(stats.time % 60);
    goStats.innerHTML = `存活 <b>${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}</b><br>击杀 <b>${stats.kills}</b><br>等级 <b>${player.level}</b>`;
    submitRun();          // 先把本局成绩写进 localStorage，再刷新展示
    renderRecords();
    overEl.classList.remove("hidden");
  }
  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("retryBtn").addEventListener("click", startGame);

  renderRecords();
  requestAnimationFrame(loop);
})();
