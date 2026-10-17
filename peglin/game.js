// Peglin · 弹珠肉鸽 (Deluxe) — Canvas + Matter.js
(function () {
  "use strict";
  const M = window.Matter;
  if (!M) {
    alert("物理引擎加载失败：未找到本地 matter.min.js");
    return;
  }
  const { Engine, World, Bodies, Body, Composite, Events, Vector } = M;

  // ---------- 画布与尺寸 ----------
  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");
  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (world) rebuildBoard();
  }
  window.addEventListener("resize", resize);

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // 物理与布局常量
  const PEG_R = 8;
  const BALL_R = 9;
  const CANNON_Y = 215; // 发射器 Y 坐标（位于顶部 UI 下方）
  // 弹珠速度上限：弹力钉（完全弹性）叠加"弹簧之靴"的 ×1.2 会持续给弹珠注入能量，
  // 不限速的话弹珠会越弹越快、在钉阵里疯狂抖动，最后一发要跑到 20s 超时才结束。
  const MAX_BALL_SPEED = 42;
  // 单发里弹力钉最多贡献多少次命中：弹力钉"碰一下就涨伤害"是它的核心价值，
  // 但在密集钉阵里反复触碰会把伤害刷成天文数字，必须封顶。
  const BUMPER_MAX_HITS = 12;

  // ---------- 特殊钉配额（逐关解锁） ----------
  // 场上只有 4 种带特殊能力的钉子（金币钉 🪙 不算，它从第 1 层起就存在）。
  // 每种上限 10 颗 → 合计 40 颗 → 恰好 40 关达到满配。
  const SPECIAL_PEG_TYPES = ["refresh", "crit", "bomb", "bumper"];
  const MAX_PEG_PER_TYPE = 10;
  const PEG_META = {
    refresh: { ico: "🔄", name: "刷新钉" },
    crit: { ico: "💥", name: "暴击钉" },
    bomb: { ico: "💣", name: "炸弹钉" },
    bumper: { ico: "🌀", name: "弹力钉" },
  };
  const newPegBudget = () => ({ refresh: 0, crit: 0, bomb: 0, bumper: 0 });

  // ---------- 弹珠原型定义 ----------
  const ORB_TYPES = {
    pebble: {
      id: "pebble", name: "圆石弹", ico: "⚪", desc: "均衡稳健的基础石弹",
      baseDmg: 2, critBonus: 4, critMul: 2.5, bounciness: 0.75, density: 0.004,
    },
    daggorb: {
      id: "daggorb", name: "匕首弹", ico: "🗡️", desc: "极高暴击伤害，每触碰暴击钉威力大增",
      baseDmg: 1.5, critBonus: 10, critMul: 3.5, bounciness: 0.8, density: 0.003,
    },
    bomborb: {
      id: "bomborb", name: "炸弹弹", ico: "💣", desc: "发射时自动将场上 2 颗普通钉变为炸弹钉",
      baseDmg: 2.5, critBonus: 4, critMul: 2.5, bounciness: 0.7, density: 0.004,
      // 注意：pegs 是模块级变量，不在 G 上。旧写法 g.pegs 会得到 undefined 并抛出
      // TypeError，使发射流程在生成弹珠之前中断，游戏永久卡在 firing 状态。
      onLaunch: () => {
        const regs = pegs.filter(p => p.pegType === "regular");
        for (let i = 0; i < 2 && regs.length > 0; i++) {
          const idx = randi(0, regs.length - 1);
          const p = regs.splice(idx, 1)[0];
          p.pegType = "bomb"; p.bombHp = 2;
        }
      }
    },
    electorb: {
      id: "electorb", name: "雷电弹", ico: "⚡", desc: "命中钉子时产生连锁电弧电击附近钉子",
      baseDmg: 3, critBonus: 5, critMul: 2.5, bounciness: 0.82, density: 0.0035,
      onHitPeg: (g, peg) => {
        // 电击周围最近的 2 颗未击中钉子（pegs 为模块级变量，见 bomborb 注释）
        const unhit = pegs.filter(p => !p.hit && p !== peg);
        unhit.sort((a, b) => Math.hypot(a.position.x - peg.position.x, a.position.y - peg.position.y) -
                             Math.hypot(b.position.x - peg.position.x, b.position.y - peg.position.y));
        for (let i = 0; i < Math.min(2, unhit.length); i++) {
          const target = unhit[i];
          if (Math.hypot(target.position.x - peg.position.x, target.position.y - peg.position.y) < 90) {
            triggerPeg(target, false);
            g.lightningFx.push({ x1: peg.position.x, y1: peg.position.y, x2: target.position.x, y2: target.position.y, t: 0.15 });
          }
        }
      }
    },
    icirb: {
      id: "icirb", name: "冰霜弹", ico: "❄️", desc: "穿透钉子阻力小，使所有敌人减速/受到额外冻结",
      baseDmg: 2.5, critBonus: 5, critMul: 2.5, bounciness: 0.6, density: 0.008,
      onHitPeg: (g) => { g.freezeStacks = (g.freezeStacks || 0) + 1; }
    },
    vampirorb: {
      id: "vampirorb", name: "吸血弹", ico: "🩸", desc: "造成伤害的 20% 转化为生命偷取",
      baseDmg: 2, critBonus: 4, critMul: 2.5, bounciness: 0.75, density: 0.004,
      onCombatDmg: (g, dmg) => {
        const heal = Math.max(1, Math.floor(dmg * 0.2));
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + heal);
        // playerX / playerY 并不存在，旧写法会算出 NaN 坐标
        spawnPopup(W / 2, 120, "+" + heal + " HP", "#4ade80");
      }
    },
    bouldorb: {
      id: "bouldorb", name: "巨石弹", ico: "🪨", desc: "重达千钧，直接摧毁并穿透钉子下砸",
      baseDmg: 4, critBonus: 6, critMul: 2.5, bounciness: 0.45, density: 0.015,
    },
    matryoshka: {
      id: "matryoshka", name: "套娃弹", ico: "🔮", desc: "击中暴击或炸弹时分裂出额外的小弹珠！",
      baseDmg: 2, critBonus: 6, critMul: 3.0, bounciness: 0.8, density: 0.0035,
      onSpecialHit: (g, pos) => {
        if (!g.splitDone) {
          g.splitDone = true;
          spawnMiniBall(pos.x, pos.y, rand(-3, 3), -2);
        }
      }
    }
  };

  // ---------- 遗物原型 ----------
  const RELIC_DEFS = {
    magnet: { id: "magnet", name: "磁力手环", ico: "🧲", desc: "弹珠对钉子的有效判定范围扩大 25%" },
    powder: { id: "powder", name: "炼金火药", ico: "🧨", desc: "炸弹爆破直接伤害从 50 提升至 80" },
    glove: { id: "glove", name: "弹珠手套", ico: "🧤", desc: "每场战斗额外获得 1 次免费换球机会" },
    shield_ring: { id: "shield_ring", name: "庇护之戒", ico: "🛡️", desc: "溢出伤害的 30% 转化为玩家本回合护甲" },
    spring_boots: { id: "spring_boots", name: "弹簧之靴", ico: "🌀", desc: "弹珠与弹力钉反弹速度提升 20%" },
    clover: { id: "clover", name: "四叶草", ico: "🍀", desc: "场上初始必定额外刷新 1 颗暴击钉与 1 颗刷新钉" },
    greed_goblet: { id: "greed_goblet", name: "贪婪金杯", ico: "🏆", desc: "击中金币钉与战斗胜利获得双倍金币" },
  };

  // ---------- 敌人模板 ----------
  // intents 决定该敌人每个回合做什么（按顺序循环）：
  //   "atk"    普通攻击
  //   "block"  给自己叠护甲，数值取 block 字段（护甲会先抵扣弹珠伤害）
  //   "debuff" 给玩家叠 2 层虚弱（玩家造成的伤害 -25%，每回合 -1 层）
  // 注意：旧版只有 intent 字符串和 block 字段，但代码里一处都没读——
  // 重甲兽人的 block:10 完全无效、死灵法师和史莱姆行为一模一样。
  const ENEMY_TEMPLATES = [
    { name: "丛林史莱姆", avatar: "🟢", baseHp: 28, atk: 6, intents: ["atk"] },
    { name: "哥布林投石手", avatar: "👺", baseHp: 38, atk: 9, intents: ["atk", "atk", "block"], block: 8 },
    { name: "吸血恶蝠", avatar: "🦇", baseHp: 32, atk: 8, intents: ["atk", "debuff"] },
    { name: "重甲兽人", avatar: "🐗", baseHp: 55, atk: 12, intents: ["block", "atk"], block: 14 },
    { name: "暗影死灵法师", avatar: "🧙", baseHp: 48, atk: 10, intents: ["debuff", "atk"] },
    // Boss
    { name: "Boss·史莱姆巨王", avatar: "👑", baseHp: 160, atk: 14, isBoss: true, intents: ["atk", "block"], block: 20 },
    { name: "Boss·烈焰红龙", avatar: "🐉", baseHp: 260, atk: 20, isBoss: true, intents: ["atk", "atk", "debuff"] },
  ];

  const INTENT_META = {
    atk: { ico: "⚔️" },
    block: { ico: "🛡️" },
    debuff: { ico: "💧" },
  };

  // ---------- 游戏全局状态 ----------
  let engine, world;
  let activeBalls = [];
  let pegs = [];
  let walls = [];
  let buckets = [];

  const G = {
    state: "menu", // menu, aim, firing, reward, shop, over
    floor: 1,
    gold: 15,
    player: { hp: 50, maxHp: 50, block: 0, weak: 0 },
    relics: [],
    deck: ["pebble", "pebble", "daggorb", "bomborb"],
    deckIdx: 0,
    discardsLeft: 1,
    enemies: [],
    floorEnded: false,
    pegBudget: { refresh: 0, crit: 0, bomb: 0, bumper: 0 },
    pegHits: 0,
    curCrit: false,
    critPegsHit: 0,
    bumperHits: 0,
    shotMult: 0,      // 本次发射所有弹珠落底倍率里的最高值（见 onBallDropOut）
    runToken: 0,      // 本局代号：结算后自增，用来作废上一局残留的定时器
    popups: [],
    particles: [],
    lightningFx: [],
    aim: { active: false, x: 0, y: 0, angle: Math.PI / 2, power: 1 },
    screenShake: 0,
  };

  // ---------- 物理世界初始化 ----------
  function initPhysics() {
    engine = Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 },
    });
    world = engine.world;
    Events.on(engine, "collisionStart", onCollisionStart);
  }

  function clearWorld() {
    Composite.clear(world, false);
    pegs = []; walls = []; buckets = []; activeBalls = [];
  }

  // ---------- 钉子盘面重建 ----------
  function rebuildBoard() {
    if (!world) return;
    clearWorld();

    const t = 40;
    // 边界墙
    walls.push(Bodies.rectangle(W / 2, -t / 2, W, t, { isStatic: true }));
    walls.push(Bodies.rectangle(-t / 2, H / 2, t, H, { isStatic: true }));
    walls.push(Bodies.rectangle(W + t / 2, H / 2, t, H, { isStatic: true }));
    World.add(world, walls);

    // 1) 先算出全部钉子坐标
    const slots = [];
    const boardTop = CANNON_Y + 45;
    const boardBottom = H - 65;
    const cols = Math.max(7, Math.floor((W - 60) / 44));
    const rows = Math.max(8, Math.floor((boardBottom - boardTop) / 40));
    const startX = (W - (cols - 1) * 44) / 2;

    for (let r = 0; r < rows; r++) {
      const offX = (r % 2 === 1) ? 22 : 0;
      for (let c = 0; c < cols; c++) {
        const px = startX + c * 44 + offX;
        if (px < 30 || px > W - 30) continue;
        const py = boardTop + r * 38;
        if (py > boardBottom - 30) continue;
        slots.push({ x: px, y: py });
      }
    }

    // 2) 再一次性定好每格的类型
    //    - 默认普通钉，金币钉保持原有的 4% 概率（从第 1 层起就有）
    //    - 4 种特殊钉严格按 G.pegBudget 配额发放；配额为 0 时一颗都不会出现。
    //      （旧版用 ensurePegType 保底"至少 2 刷新 + 2 暴击 + 2 炸弹"，
    //        暴击 2.5 倍、炸弹 50 点直伤，这正是前期难度过低的主因。）
    const types = new Array(slots.length).fill("regular");
    for (let i = 0; i < types.length; i++) {
      if (Math.random() < 0.04) types[i] = "coin";
    }

    // 打乱普通钉的索引，让特殊钉随机散布而不是挤在一角
    const free = [];
    for (let i = 0; i < types.length; i++) if (types[i] === "regular") free.push(i);
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }

    const quota = pegQuota();
    let cursor = 0;
    for (const type of SPECIAL_PEG_TYPES) {
      for (let k = 0; k < quota[type] && cursor < free.length; k++) {
        types[free[cursor++]] = type;
      }
    }

    // 3) 最后按定好的类型建钉子。
    //    必须在建的时候就确定类型：弹力钉的半径与弹性是 createPeg 里写死的，
    //    先建后改是改不动碰撞体的。
    for (let i = 0; i < slots.length; i++) createPeg(slots[i].x, slots[i].y, types[i]);

    // 底部得分槽（Buckets）
    createBuckets();
  }

  // 本层各类特殊钉应放置的数量 = 已解锁配额（四叶草额外 +1 刷新 / +1 暴击）
  function pegQuota() {
    const q = {};
    for (const type of SPECIAL_PEG_TYPES) {
      let n = G.pegBudget[type] || 0;
      if (hasRelic("clover") && (type === "refresh" || type === "crit")) n += 1;
      q[type] = Math.min(n, MAX_PEG_PER_TYPE + 1);
    }
    return q;
  }

  // 通过一层后随机解锁 1 颗特殊钉；全部满配后返回 null
  function grantPegUnlock() {
    const pool = SPECIAL_PEG_TYPES.filter(t => (G.pegBudget[t] || 0) < MAX_PEG_PER_TYPE);
    if (pool.length === 0) return null;
    const type = pool[randi(0, pool.length - 1)];
    G.pegBudget[type] = (G.pegBudget[type] || 0) + 1;
    return type;
  }

  function unlockedPegCount() {
    return SPECIAL_PEG_TYPES.reduce((s, t) => s + (G.pegBudget[t] || 0), 0);
  }

  function createPeg(x, y, type) {
    const isBumper = type === "bumper";
    const r = isBumper ? PEG_R + 3 : (hasRelic("magnet") ? PEG_R + 2 : PEG_R);
    // 弹力钉原先 restitution = 1.3：大于 1 的恢复系数在物理上等于"每次碰撞都注入能量"，
    // 弹珠会在它上面越弹越快、永远停不下来（只能靠超时兜底），顺带把 pegHits 刷爆。
    // 改回 1.0（完全弹性）：手感依旧是"弹得最欢的钉子"，"更快"改由弹簧之靴遗物承担。
    const peg = Bodies.circle(x, y, r, {
      isStatic: true,
      restitution: isBumper ? 1.0 : 0.8,
      label: "peg",
    });
    peg.pegType = type;
    peg.hit = false;
    peg.cleared = false;
    peg.origPos = { x, y };
    peg.bombHp = type === "bomb" ? 2 : 1;
    peg._flash = 0;
    pegs.push(peg);
    World.add(world, peg);
  }

  function createBuckets() {
    // 底部得分槽倍率（正中为 x1.5，两侧递减到 x0.5）
    const bucketDefs = [
      { mult: 0.5, label: "x0.5", color: "#64748b" },
      { mult: 1.0, label: "x1.0", color: "#38bdf8" },
      { mult: 1.5, label: "x1.5", color: "#facc15" },
      { mult: 1.0, label: "x1.0", color: "#38bdf8" },
      { mult: 0.5, label: "x0.5", color: "#64748b" },
    ];
    const bw = W / bucketDefs.length;
    const by = H - 25;
    for (let i = 0; i < bucketDefs.length; i++) {
      const b = bucketDefs[i];
      const bx = i * bw + bw / 2;
      buckets.push({ x: bx, y: by, w: bw - 6, h: 40, mult: b.mult, label: b.label, color: b.color });
    }
  }

  // ---------- 碰撞处理 ----------
  function onCollisionStart(ev) {
    for (const pair of ev.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      let peg = null, ball = null;
      if (a.label === "peg" && b.label === "ball") { peg = a; ball = b; }
      else if (b.label === "peg" && a.label === "ball") { peg = b; ball = a; }

      if (peg && ball) {
        handlePegCollision(peg, ball);
      }
    }
  }

  // 弹珠效果是数据驱动的，任一回调抛错都不应中断物理步进（否则整局卡死）
  function safeCall(fn, ...args) {
    if (typeof fn !== "function") return;
    try { fn(...args); } catch (err) { console.warn("[peglin] 弹珠效果执行失败：", err); }
  }

  function handlePegCollision(peg, ball) {
    const orbDef = ball.orbDef || ORB_TYPES.pebble;

    // 触发钉子命中
    triggerPeg(peg, true);

    // 弹珠特殊效果
    safeCall(orbDef.onHitPeg, G, peg);
    if (peg.pegType === "crit" || peg.pegType === "bomb") {
      safeCall(orbDef.onSpecialHit, G, peg.position);
    }

    // 弹簧之靴：弹力钉反弹速度提升 20%
    if (peg.pegType === "bumper" && hasRelic("spring_boots")) {
      Body.setVelocity(ball, {
        x: ball.velocity.x * 1.2,
        y: ball.velocity.y * 1.2,
      });
    }

    // 巨石弹穿透破碎
    if (orbDef.id === "bouldorb") {
      peg.cleared = true;
      World.remove(world, peg);
    }
  }

  function triggerPeg(peg, fromDirectHit) {
    if (peg.cleared) return;
    peg._flash = 8;
    spawnParticles(peg.position.x, peg.position.y, 4, getPegColor(peg.pegType));

    if (peg.pegType === "regular") {
      if (!peg.hit) {
        peg.hit = true;
        G.pegHits++;
        updateDamageMeter();
      }
    } else if (peg.pegType === "crit") {
      if (!peg.hit) {
        peg.hit = true;
        G.curCrit = true;
        G.critPegsHit++;
        G.pegHits += 2;
        showCritEffect();
        updateDamageMeter();
      }
    } else if (peg.pegType === "refresh") {
      if (!peg.hit) {
        peg.hit = true;
        refreshBoard();
        spawnPopup(peg.position.x, peg.position.y - 12, "🔄 全部刷新!", "#4ade80");
      }
    } else if (peg.pegType === "bomb") {
      peg.bombHp--;
      if (peg.bombHp <= 0 && !peg.hit) {
        peg.hit = true;
        detonateBomb(peg);
      } else {
        spawnPopup(peg.position.x, peg.position.y - 12, "💣 导火索点燃!", "#f97316");
      }
    } else if (peg.pegType === "coin") {
      if (!peg.hit) {
        peg.hit = true;
        const gain = hasRelic("greed_goblet") ? 10 : 5;
        G.gold += gain;
        spawnPopup(peg.position.x, peg.position.y - 12, `+${gain}🪙`, "#facc15");
        updateHUD();
      }
    } else if (peg.pegType === "bumper") {
      // 弹力钉每次触碰都算命中（这是它的价值），但封顶，
      // 否则在密集钉阵里反复弹跳会把伤害刷成天文数字
      if (G.bumperHits < BUMPER_MAX_HITS) {
        G.bumperHits++;
        G.pegHits += 1;
        updateDamageMeter();
      }
    }
  }

  function detonateBomb(bombPeg) {
    G.screenShake = 12;
    const bx = bombPeg.position.x, by = bombPeg.position.y;
    spawnParticles(bx, by, 25, "#f97316");
    spawnParticles(bx, by, 15, "#ef4444");

    let bombDmg = hasRelic("powder") ? 80 : 50;
    // 爆炸同样受虚弱影响（它属于玩家造成的伤害）
    if (G.player.weak > 0) bombDmg = Math.floor(bombDmg * 0.75);
    // 对所有敌人造成直接爆炸伤害
    for (const e of G.enemies) {
      if (e.hp > 0) {
        const real = damageEnemy(e, bombDmg);
        spawnPopup(e.x || W / 2, 90, `💥 -${real}`, "#f97316");
      }
    }

    // 引爆范围内的其他钉子
    const blastRadius = 85;
    for (const p of pegs) {
      if (p !== bombPeg && !p.cleared) {
        const d = Math.hypot(p.position.x - bx, p.position.y - by);
        if (d < blastRadius) {
          triggerPeg(p, false);
          p.cleared = true;
          World.remove(world, p);
        }
      }
    }

    bombPeg.cleared = true;
    World.remove(world, bombPeg);
    updateHUD();
    checkEnemiesDead();
  }

  function refreshBoard() {
    G.screenShake = 6;
    for (const p of pegs) {
      if (p.hit || p.cleared) {
        p.hit = false;
        if (p.cleared) {
          p.cleared = false;
          World.add(world, p);
        }
        p._flash = 12;
      }
    }
  }

  // ---------- 伤害计算与更新 ----------
  function calcCurrentDamage() {
    const curOrb = getCurrentOrb();
    let dmg = (G.pegHits * curOrb.baseDmg);
    if (G.curCrit) {
      dmg = (dmg + G.critPegsHit * curOrb.critBonus) * curOrb.critMul;
    }
    return Math.max(0, Math.round(dmg));
  }

  function updateDamageMeter() {
    const dmg = calcCurrentDamage();
    document.getElementById("dmgValue").textContent = dmg;
    const critEl = document.getElementById("critBadge");
    critEl.classList.toggle("hidden", !G.curCrit);
  }

  function showCritEffect() {
    G.screenShake = 8;
    spawnPopup(W / 2, CANNON_Y + 10, "💥 CRITICAL HIT!", "#f43f5e");
  }

  // ---------- 防卡死看门狗 ----------
  // 弹珠可能因物理引擎卡在钉子缝隙里静止不动，导致 activeBalls 永不 empties、
  // finishPlayerAttack 永不执行，游戏就再也发射不了。这里做三层兜底：
  //   1) 弹珠近乎静止超过 STALL_MS    → 强制判为落底
  //   2) 单次发射总时长超过 MAX_SHOT_MS → 强制判为落底
  //   3) 处于 firing 却没有弹珠（生成失败/棋盘重建）→ 直接结算
  const STALL_MS = 1500;
  const MAX_SHOT_MS = 20000;
  let shotStart = 0;
  let stallMs = 0;

  function forceResolveBalls() {
    for (const b of activeBalls.slice()) onBallDropOut(b);
  }

  function watchdog(dtMs) {
    if (G.state !== "firing") return;
    if (activeBalls.length === 0) { finishPlayerAttack(); return; }

    let maxSpeed = 0;
    for (const b of activeBalls) {
      maxSpeed = Math.max(maxSpeed, Math.hypot(b.velocity.x, b.velocity.y));
    }
    if (maxSpeed < 0.6) stallMs += dtMs; else stallMs = 0;

    if (stallMs > STALL_MS || (performance.now() - shotStart) > MAX_SHOT_MS) {
      stallMs = 0;
      forceResolveBalls();
    }
  }

  // ---------- 发射弹珠 ----------
  function getCurrentOrb() {
    const orbId = G.deck[G.deckIdx % G.deck.length];
    return ORB_TYPES[orbId] || ORB_TYPES.pebble;
  }

  function spawnBall(x, y, vx, vy, orbDef) {
    const ball = Bodies.circle(x, y, BALL_R, {
      restitution: orbDef.bounciness,
      frictionAir: 0.001,
      density: orbDef.density,
      label: "ball",
    });
    ball.orbDef = orbDef;
    Body.setVelocity(ball, { x: vx, y: vy });
    activeBalls.push(ball);
    World.add(world, ball);
    return ball;
  }

  function spawnMiniBall(x, y, vx, vy) {
    const miniDef = { ...ORB_TYPES.pebble, baseDmg: 1.5 };
    const ball = Bodies.circle(x, y, BALL_R - 2, {
      restitution: 0.85,
      frictionAir: 0.001,
      density: 0.003,
      label: "ball",
    });
    ball.orbDef = miniDef;
    Body.setVelocity(ball, { x: vx, y: vy });
    activeBalls.push(ball);
    World.add(world, ball);
  }

  function launchOrb(angle, power) {
    if (G.state !== "aim") return;
    G.state = "firing";
    G.pegHits = 0;
    G.curCrit = false;
    G.critPegsHit = 0;
    G.bumperHits = 0;
    G.shotMult = 0;
    G.splitDone = false;
    shotStart = performance.now();
    stallMs = 0;
    updateDamageMeter();

    const curOrb = getCurrentOrb();
    // 发射效果异常也不能阻止弹珠生成，否则 G.state 会永远停在 firing
    safeCall(curOrb.onLaunch, G);

    const sp = 12 + power * 10;
    const vx = Math.cos(angle) * sp;
    const vy = Math.sin(angle) * sp;
    spawnBall(W / 2, CANNON_Y, vx, vy, curOrb);
  }

  // 丢弃/换球
  function discardCurrentOrb() {
    if (G.state !== "aim" || G.discardsLeft <= 0) return;
    G.discardsLeft--;
    G.deckIdx++;
    updateHUD();
    spawnPopup(W / 2, CANNON_Y, "🔄 已更换弹珠", "#a78bfa");
  }
  document.getElementById("btnDiscard").addEventListener("click", discardCurrentOrb);

  // ---------- 弹珠结算与战斗回合 ----------
  function onBallDropOut(ball) {
    // 判定掉入哪个底部加成槽
    const bx = ball.position.x;
    let mult = 1.0, label = "x1.0", color = "#38bdf8";
    for (const b of buckets) {
      if (Math.abs(bx - b.x) <= b.w / 2) {
        mult = b.mult; label = b.label; color = b.color;
        break;
      }
    }

    // 本次发射可能有多颗弹珠（套娃分裂）。旧写法只用"最后一颗落底"的倍率结算，
    // 但每颗弹珠都会各自跳出一个倍率数字，于是玩家会看到"明明弹了 x1.5，伤害却按 x0.5 算"。
    // 现在统一取本次发射里最高的那个倍率，并在最后一颗落底时把结算倍率明确标出来。
    G.shotMult = Math.max(G.shotMult || 0, mult);

    World.remove(world, ball);
    activeBalls = activeBalls.filter(b => b !== ball);

    if (activeBalls.length === 0) {
      spawnPopup(W / 2, H - 92, `总倍率 ${(G.shotMult || 1).toFixed(1)}x`, color);
      // 所有弹珠都落底后进行最终伤害结算
      finishPlayerAttack();
    } else {
      spawnPopup(bx, H - 62, label, color);
    }
  }

  function finishPlayerAttack() {
    // 立刻离开 firing，避免看门狗/玩家输入重复触发结算
    G.state = "resolving";

    const bucketMult = G.shotMult > 0 ? G.shotMult : 1.0;
    const rawDmg = calcCurrentDamage();
    let totalDmg = Math.round(rawDmg * bucketMult);
    // 虚弱（死灵法师 / 红龙的 debuff 意图施加）：伤害 -25%
    if (G.player.weak > 0) totalDmg = Math.floor(totalDmg * 0.75);
    const curOrb = getCurrentOrb();

    // 攻击第一个存活的敌人
    const target = G.enemies.find(e => e.hp > 0);
    if (target && totalDmg > 0) {
      const overkill = Math.max(0, totalDmg - ((target.block || 0) + target.hp));
      const real = damageEnemy(target, totalDmg);   // 统一入口，敌人护甲才会生效
      G.screenShake = Math.min(15, 4 + Math.floor(totalDmg / 10));
      spawnPopup(target.x || W / 2, 80, `⚔️ -${real}`, "#facc15");

      safeCall(curOrb.onCombatDmg, G, real);

      // 庇护之戒遗物：溢出伤害的 30% 转化为护甲
      if (hasRelic("shield_ring")) {
        const blockGain = Math.floor(overkill * 0.3);
        if (blockGain > 0) {
          G.player.block += blockGain;
          spawnPopup(W / 2, 80, `🛡️ +${blockGain}`, "#38bdf8");
        }
      }
    }

    // 换到下一颗弹珠
    G.deckIdx++;
    updateHUD();

    // 清理已命中的钉子（使其消失）
    for (const p of pegs) {
      if (p.hit && !p.cleared) {
        p.cleared = true;
        World.remove(world, p);
      }
    }

    checkEnemiesDead();

    // 如果敌人依然存活，进入敌人行动回合
    if (G.enemies.some(e => e.hp > 0)) {
      // 带上本局代号：玩家若在这 600ms 里点了"🏁 结束"，gameOver 会把 runToken 加一，
      // 这个回调就直接作废，不会再把已经结束的对局硬拉回 aim 状态。
      const token = G.runToken;
      setTimeout(() => { if (token === G.runToken) enemyTurn(); }, 600);
    } else if (!G.floorEnded) {
      // 兜底：敌人已清空但结算没排上（理论上不会走到），交还操作权
      G.state = "aim";
    }
  }

  // 取该敌人本回合的意图（按 intents 循环）
  function nextIntent(e) {
    const list = e.intents && e.intents.length ? e.intents : ["atk"];
    e.intentIdx = ((e.intentIdx || 0) + 1) % list.length;
    return list[e.intentIdx];
  }

  // 对敌人造成伤害，统一走这里，敌人护甲才会真正生效
  function damageEnemy(e, dmg) {
    if (!e || e.hp <= 0) return 0;
    const blocked = Math.min(e.block || 0, dmg);
    e.block = (e.block || 0) - blocked;
    const real = dmg - blocked;
    e.hp -= real;
    e.flash = 14;
    return real;
  }

  function enemyTurn() {
    for (const e of G.enemies) {
      if (e.hp <= 0) continue;
      const kind = nextIntent(e);

      if (kind === "block") {
        // 注意：e.block 是"当前剩余护甲"，会被伤害扣减；模板里的护甲数值要单独存成 blockVal。
        // 旧写法读 e.block，而 G 初始化时它被写成 0 → 永远取兜底值 8，
        // 重甲兽人（block:14）和 Boss（block:20）的护甲数值形同虚设。
        const gain = e.blockVal || 8;
        e.block = (e.block || 0) + gain;
        spawnPopup(e.x || W / 2, 90, `🛡️ +${gain}`, "#38bdf8");
        continue;
      }

      if (kind === "debuff") {
        G.player.weak = (G.player.weak || 0) + 2;
        spawnPopup(W / 2, 120, "💧 虚弱 +2（伤害 -25%）", "#a78bfa");
        continue;
      }

      // atk
      let dmg = e.atk;
      if (G.freezeStacks > 0) {
        dmg = Math.max(1, Math.floor(dmg * 0.7));
        G.freezeStacks--;
      }

      // 格挡抵扣
      const blocked = Math.min(G.player.block, dmg);
      G.player.block -= blocked;
      const real = dmg - blocked;
      G.player.hp -= real;

      G.screenShake = 10;
      spawnPopup(60, 40, `👾 -${real} HP`, "#f43f5e");

      if (G.player.hp <= 0) {
        G.player.hp = 0;
        updateHUD();
        gameOver(false);
        return;
      }
    }

    G.player.block = 0; // 回合结束清空临时格挡
    if (G.player.weak > 0) G.player.weak--;   // 虚弱每回合消退 1 层
    updateHUD();
    G.state = "aim";
  }

  function checkEnemiesDead() {
    // floorEnded 防止 detonateBomb 与 finishPlayerAttack 重复排入两次结算
    if (G.floorEnded || G.enemies.length === 0) return;
    if (G.enemies.every(e => e.hp <= 0)) {
      G.floorEnded = true;
      const token = G.runToken;      // 结束后不再弹出奖励 / 商店面板
      setTimeout(() => { if (token === G.runToken) floorWin(); }, 500);
    }
  }

  // ---------- 关卡与层数进阶 ----------
  function startFloor(n) {
    G.floor = n;
    G.state = "aim";
    G.discardsLeft = 1 + (hasRelic("glove") ? 1 : 0);
    G.freezeStacks = 0;
    G.enemies = [];
    G.floorEnded = false;
    stallMs = 0;

    const isBoss = (n % 5 === 0);
    if (isBoss) {
      const template = n >= 10 ? ENEMY_TEMPLATES[6] : ENEMY_TEMPLATES[5];
      G.enemies.push({
        ...template,
        hp: template.baseHp + n * 10,
        maxHp: template.baseHp + n * 10,
        flash: 0,
        block: 0,
        blockVal: template.block || 8,   // 模板里的护甲数值，见 enemyTurn
        intentIdx: -1,      // -1 → 第一次 nextIntent 取到 intents[0]
        x: W / 2,
      });
    } else {
      const count = randi(1, Math.min(3, 1 + Math.floor(n / 3)));
      const startX = (W - (count - 1) * 110) / 2;
      for (let i = 0; i < count; i++) {
        const pool = ENEMY_TEMPLATES.filter(e => !e.isBoss);
        const t = pool[randi(0, pool.length - 1)];
        G.enemies.push({
          ...t,
          hp: t.baseHp + n * 4,
          maxHp: t.baseHp + n * 4,
          flash: 0,
          block: 0,
          blockVal: t.block || 8,
          intentIdx: -1,
          x: startX + i * 110,
        });
      }
    }

    rebuildBoard();
    updateHUD();
    flashMsg(`⚔️ 第 ${G.floor} 层 · 战斗开始！`);
  }

  function floorWin() {
    G.gold += 10 + G.floor * 2;
    if (hasRelic("greed_goblet")) G.gold += 10;

    // 每通过一层随机解锁 1 颗特殊钉（4 种各上限 10，共 40 关满配）
    G.lastUnlock = grantPegUnlock();

    // 每 3 层遇到一次地精商店
    if (G.floor % 3 === 0 && G.floor % 5 !== 0) {
      G.state = "shop";
      showShop();
    } else {
      G.state = "reward";
      showRewards();
    }
  }

  // 结算界面上那一行"本层解锁了什么"
  function renderUnlockNote(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const t = G.lastUnlock;
    if (!t) {
      el.textContent = unlockedPegCount() >= SPECIAL_PEG_TYPES.length * MAX_PEG_PER_TYPE
        ? "✨ 特殊钉已全部满配（40/40）"
        : "";
      return;
    }
    const m = PEG_META[t];
    el.textContent = `🧩 解锁 ${m.ico} ${m.name}　（${G.pegBudget[t]}/${MAX_PEG_PER_TYPE}）`;
  }

  // 往牌库加牌。
  // 必须先把 deckIdx 归一化到 [0, len)：因为当前弹珠是 deck[deckIdx % len] 取出来的，
  // 一旦牌库变长，取模结果就会漂移，玩家会看到"手上这颗弹珠突然变成另一颗"。
  function addOrbToDeck(id) {
    G.deckIdx = G.deckIdx % G.deck.length;
    G.deck.push(id);
  }

  // ---------- 奖励系统 ----------
  function showRewards() {
    const el = document.getElementById("upgradeCards");
    el.innerHTML = "";
    document.getElementById("rewardTitle").textContent = "战斗胜利！选择一项战利品";
    renderUnlockNote("rewardUnlock");

    // 随机 3 个奖励选项（新弹珠 / 遗物 / 治疗）
    const options = [];
    const availableOrbs = Object.keys(ORB_TYPES).filter(k => k !== "pebble");
    const pickOrbKey = availableOrbs[randi(0, availableOrbs.length - 1)];
    const orb = ORB_TYPES[pickOrbKey];
    options.push({
      type: "orb", ico: orb.ico, name: `新弹珠·${orb.name}`, desc: orb.desc,
      apply: () => { addOrbToDeck(orb.id); }
    });

    const unownedRelics = Object.keys(RELIC_DEFS).filter(k => !hasRelic(k));
    if (unownedRelics.length > 0) {
      const rKey = unownedRelics[randi(0, unownedRelics.length - 1)];
      const r = RELIC_DEFS[rKey];
      options.push({
        type: "relic", ico: r.ico, name: `遗物·${r.name}`, desc: r.desc,
        apply: () => { G.relics.push(r.id); }
      });
    }

    options.push({
      type: "heal", ico: "❤️", name: "休整回血", desc: "恢复 20 点生命值",
      apply: () => { G.player.hp = Math.min(G.player.maxHp, G.player.hp + 20); }
    });

    for (const opt of options) {
      const card = document.createElement("div");
      card.className = "ucard" + (opt.type === "relic" ? " relic-card" : "");
      card.innerHTML = `<div class="ico">${opt.ico}</div><div class="uname">${opt.name}</div><div class="udesc">${opt.desc}</div>`;
      card.addEventListener("click", () => {
        opt.apply();
        document.getElementById("upgrade").classList.add("hidden");
        startFloor(G.floor + 1);
      });
      el.appendChild(card);
    }

    document.getElementById("upgrade").classList.remove("hidden");
  }

  document.getElementById("skipRewardBtn").addEventListener("click", () => {
    document.getElementById("upgrade").classList.add("hidden");
    startFloor(G.floor + 1);
  });

  // ---------- 商店系统 ----------
  function showShop() {
    const el = document.getElementById("shopItems");
    el.innerHTML = "";
    renderUnlockNote("shopUnlock");

    const items = [
      { type: "heal", ico: "🧪", name: "生命药水", desc: "恢复 25 点生命", price: 20, buy: () => G.player.hp = Math.min(G.player.maxHp, G.player.hp + 25) },
      { type: "orb", ico: "⚡", name: "雷电弹", desc: "连锁闪电击碎周围钉子", price: 35, buy: () => addOrbToDeck("electorb") },
      { type: "orb", ico: "🩸", name: "吸血弹", desc: "造成伤害转化为生命偷取", price: 40, buy: () => addOrbToDeck("vampirorb") },
    ];

    for (const item of items) {
      const card = document.createElement("div");
      card.className = "ucard";
      card.innerHTML = `<div class="ico">${item.ico}</div><div class="uname">${item.name}</div><div class="udesc">${item.desc}</div><div class="uprice">🪙 ${item.price} 金币</div>`;
      card.addEventListener("click", () => {
        if (G.gold >= item.price) {
          G.gold -= item.price;
          item.buy();
          card.style.opacity = "0.3";
          card.style.pointerEvents = "none";
          updateHUD();
          spawnPopup(W / 2, CANNON_Y, "已购买 " + item.name, "#facc15");
        } else {
          flashMsg("金币不足！");
        }
      });
      el.appendChild(card);
    }

    document.getElementById("shopOverlay").classList.remove("hidden");
  }

  document.getElementById("leaveShopBtn").addEventListener("click", () => {
    document.getElementById("shopOverlay").classList.add("hidden");
    startFloor(G.floor + 1);
  });

  function hasRelic(id) {
    return G.relics.includes(id);
  }

  // ---------- 瞄准与输入 ----------
  cv.addEventListener("pointerdown", (e) => {
    if (G.state !== "aim" || activeBalls.length > 0) return;
    G.aim.active = true;
    updateAim(e.clientX, e.clientY);
  });

  cv.addEventListener("pointermove", (e) => {
    if (!G.aim.active) return;
    updateAim(e.clientX, e.clientY);
  });

  window.addEventListener("pointerup", () => {
    if (!G.aim.active) return;
    G.aim.active = false;
    launchOrb(G.aim.angle, G.aim.power);
  });

  function updateAim(x, y) {
    const sx = W / 2, sy = CANNON_Y;
    let dx = x - sx, dy = y - sy;
    // 强制向下发射
    if (dy < 15) dy = 15;
    const len = Math.hypot(dx, dy);
    G.aim.angle = Math.atan2(dy, dx);
    G.aim.power = clamp(len / 180, 0.4, 1.2);
  }

  // ---------- 粒子与特效系统 ----------
  function spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = rand(20, 120);
      G.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        r: rand(2, 4.5),
        life: rand(0.3, 0.6),
        maxLife: 0.6,
        color,
      });
    }
  }

  function spawnPopup(x, y, text, color) {
    G.popups.push({ x, y, text, color, life: 0.8, maxLife: 0.8 });
  }

  function getPegColor(type) {
    if (type === "refresh") return "#4ade80";
    if (type === "crit") return "#f43f5e";
    if (type === "bomb") return "#f97316";
    if (type === "coin") return "#facc15";
    if (type === "bumper") return "#c084fc";
    return "#38bdf8";
  }

  // ---------- HUD 刷新 ----------
  function updateHUD() {
    document.getElementById("ptext").textContent = `${G.player.hp}/${G.player.maxHp}`;
    document.getElementById("php").style.width = (G.player.hp / G.player.maxHp * 100) + "%";
    document.getElementById("pblock").textContent = `🛡️ ${G.player.block}`;
    const weakEl = document.getElementById("pweak");
    if (weakEl) {
      weakEl.textContent = `💧 ${G.player.weak || 0}`;
      weakEl.classList.toggle("hidden", !(G.player.weak > 0));
    }
    document.getElementById("gold").textContent = `🪙 ${G.gold}`;
    document.getElementById("floor").textContent = `第 ${G.floor} 层 · 迷雾森林`;
    document.getElementById("discardCount").textContent = G.discardsLeft;

    // 特殊钉配额
    const stockEl = document.getElementById("pegStock");
    if (stockEl) {
      stockEl.innerHTML = "";
      for (const type of SPECIAL_PEG_TYPES) {
        const n = G.pegBudget[type] || 0;
        const span = document.createElement("span");
        span.className = "ps" + (n >= MAX_PEG_PER_TYPE ? " max" : n > 0 ? " has" : "");
        span.textContent = `${PEG_META[type].ico}${n}`;
        span.title = `${PEG_META[type].name} ${n}/${MAX_PEG_PER_TYPE}`;
        stockEl.appendChild(span);
      }
    }

    // 遗物栏
    const relicsEl = document.getElementById("relicsBar");
    relicsEl.innerHTML = "";
    for (const rId of G.relics) {
      const r = RELIC_DEFS[rId];
      if (r) {
        const span = document.createElement("span");
        span.textContent = r.ico;
        span.title = `${r.name}: ${r.desc}`;
        relicsEl.appendChild(span);
      }
    }

    // 敌人容器
    const eContainer = document.getElementById("enemiesContainer");
    eContainer.innerHTML = "";
    for (const e of G.enemies) {
      if (e.hp <= 0) continue;
      const card = document.createElement("div");
      card.className = "enemy-card" + (e.isBoss ? " boss" : "");
      // 显示敌人"下一步要做什么"（intents 循环里的下一个），护甲大于 0 时一并显示
      const list = e.intents && e.intents.length ? e.intents : ["atk"];
      const upcoming = list[((e.intentIdx == null ? -1 : e.intentIdx) + 1) % list.length];
      const im = INTENT_META[upcoming] || INTENT_META.atk;
      const intentTxt = upcoming === "atk" ? `${im.ico} ${e.atk}`
        : upcoming === "block" ? `${im.ico} 防御`
        : `${im.ico} 施法`;
      card.innerHTML = `
        <div class="e-avatar">${e.avatar}</div>
        <div class="e-name">${e.name}</div>
        <div class="e-hp-bar"><div class="e-hp-fill" style="width:${e.hp / e.maxHp * 100}%"></div></div>
        <div class="e-hp-text">${Math.ceil(e.hp)}/${e.maxHp}</div>
        ${(e.block || 0) > 0 ? `<div class="e-block">🛡️ ${e.block}</div>` : ""}
        <div class="e-intent">${intentTxt}</div>
      `;
      eContainer.appendChild(card);
    }

    // 弹珠序列显示
    const curOrb = getCurrentOrb();
    document.getElementById("curOrbBadge").textContent = `${curOrb.ico} ${curOrb.name}`;

    const nextList = document.getElementById("nextOrbsList");
    nextList.innerHTML = "";
    for (let i = 1; i <= 2; i++) {
      const nextId = G.deck[(G.deckIdx + i) % G.deck.length];
      const def = ORB_TYPES[nextId] || ORB_TYPES.pebble;
      const span = document.createElement("span");
      span.textContent = def.ico;
      span.title = def.name;
      nextList.appendChild(span);
    }
  }

  let msgTimer;
  function flashMsg(t) {
    let el = document.getElementById("pmsg");
    if (!el) {
      el = document.createElement("div");
      el.id = "pmsg";
      el.style.cssText = "position:fixed;top:42%;left:50%;transform:translate(-50%,-50%);background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);border:1.5px solid #6366f1;color:#facc15;padding:10px 22px;border-radius:12px;z-index:100;font-weight:800;font-size:15px;pointer-events:none;transition:opacity .3s;";
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.opacity = "1";
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => el.style.opacity = "0", 1200);
  }

  // ---------- 渲染主循环 ----------
  function render() {
    ctx.save();
    if (G.screenShake > 0) {
      const dx = rand(-G.screenShake, G.screenShake);
      const dy = rand(-G.screenShake, G.screenShake);
      ctx.translate(dx, dy);
      G.screenShake *= 0.88;
      if (G.screenShake < 0.2) G.screenShake = 0;
    }

    ctx.clearRect(0, 0, W, H);
    if (G.state === "menu") {
      ctx.restore();
      return;
    }

    // 绘制底部得分槽 (Buckets)
    for (const b of buckets) {
      ctx.fillStyle = "rgba(30, 41, 59, 0.75)";
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);

      ctx.fillStyle = b.color;
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, b.x, b.y);
    }

    // 绘制钉子
    for (const p of pegs) {
      if (p.cleared) continue;
      const x = p.position.x, y = p.position.y;
      const r = p.circleRadius || PEG_R;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);

      if (p._flash > 0) {
        ctx.fillStyle = "#ffffff";
        p._flash--;
      } else {
        ctx.fillStyle = p.hit ? "rgba(100, 116, 139, 0.4)" : getPegColor(p.pegType);
      }
      ctx.fill();

      // 钉子符号
      if (!p.hit) {
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (p.pegType === "refresh") ctx.fillText("🔄", x, y);
        else if (p.pegType === "crit") ctx.fillText("💥", x, y);
        else if (p.pegType === "bomb") ctx.fillText("💣", x, y);
        else if (p.pegType === "coin") ctx.fillText("🪙", x, y);
        else if (p.pegType === "bumper") ctx.fillText("🌀", x, y);
      }
    }

    // 绘制电弧特效
    for (let i = G.lightningFx.length - 1; i >= 0; i--) {
      const fx = G.lightningFx[i];
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      const midX = (fx.x1 + fx.x2) / 2 + rand(-10, 10);
      const midY = (fx.y1 + fx.y2) / 2 + rand(-10, 10);
      ctx.lineTo(midX, midY);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      fx.t -= 0.016;
      if (fx.t <= 0) G.lightningFx.splice(i, 1);
    }

    // 绘制粒子
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const pt = G.particles[i];
      pt.x += pt.vx * 0.016;
      pt.y += pt.vy * 0.016;
      pt.life -= 0.016;
      if (pt.life <= 0) {
        G.particles.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r * (pt.life / pt.maxLife), 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
    }

    // 绘制弹珠
    for (const b of activeBalls) {
      const bx = b.position.x, by = b.position.y;
      ctx.beginPath();
      ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = b.orbDef.ico === "💣" ? "#f97316" : b.orbDef.ico === "⚡" ? "#38bdf8" : "#f8fafc";
      ctx.fill();
      ctx.strokeStyle = "#ffd86b";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 绘制顶部发射器与瞄准预测线
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(W / 2, CANNON_Y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (G.state === "aim" && G.aim.active) {
      const angle = G.aim.angle;
      const len = 70 + G.aim.power * 100;
      ctx.strokeStyle = "rgba(250, 204, 21, 0.85)";
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(W / 2, CANNON_Y);
      ctx.lineTo(W / 2 + Math.cos(angle) * len, CANNON_Y + Math.sin(angle) * len);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 飘字伤害与提示
    for (let i = G.popups.length - 1; i >= 0; i--) {
      const pop = G.popups[i];
      pop.y -= 30 * 0.016;
      pop.life -= 0.016;
      if (pop.life <= 0) {
        G.popups.splice(i, 1);
        continue;
      }
      ctx.fillStyle = pop.color;
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(pop.text, pop.x, pop.y);
    }

    ctx.restore();
  }

  // ---------- 物理步进与生命周期 ----------
  let lastTime = performance.now();
  const FIXED_STEP = 1000 / 60;
  let accumulator = 0;

  function loop(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    if (G.state !== "menu" && G.state !== "over" && engine) {
      accumulator += dt * 1000;
      while (accumulator >= FIXED_STEP) {
        Engine.update(engine, FIXED_STEP);
        accumulator -= FIXED_STEP;
      }

      // 弹珠限速：完全弹性的弹力钉 + 弹簧之靴会持续注入能量，必须封顶
      for (const b of activeBalls) {
        const sp = Math.hypot(b.velocity.x, b.velocity.y);
        if (sp > MAX_BALL_SPEED) {
          Body.setVelocity(b, { x: b.velocity.x / sp * MAX_BALL_SPEED, y: b.velocity.y / sp * MAX_BALL_SPEED });
        }
      }

      // 弹珠掉底与移出检测
      for (let i = activeBalls.length - 1; i >= 0; i--) {
        const b = activeBalls[i];
        if (b.position.y > H - 15 || b.position.x < -30 || b.position.x > W + 30) {
          onBallDropOut(b);
        }
      }

      // 防卡死兜底：弹珠静止 / 超时 / 未生成 都会强制结算
      watchdog(dt * 1000);
    }

    render();
    requestAnimationFrame(loop);
  }

  // ---------- 本机战绩（localStorage） ----------
  const REC_KEY = "peglin_records";
  function loadRecords() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function submitRun(run) {
    const r = loadRecords();
    r.runs = (r.runs || 0) + 1;
    r.bestFloor = Math.max(r.bestFloor || 0, run.floor);
    r.bestGold = Math.max(r.bestGold || 0, run.gold);
    r.bestRelics = Math.max(r.bestRelics || 0, run.relics);
    r.bestPegs = Math.max(r.bestPegs || 0, run.pegs);
    r.bestDeck = Math.max(r.bestDeck || 0, run.deck);
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
    return r;
  }
  function recordsHTML(r) {
    if (!r || !r.runs) return '<span class="empty">还没有战绩，先来一局吧</span>';
    const items = [
      ["冒险次数", r.runs, false],
      ["最深层数", r.bestFloor, true],
      ["最高金币", r.bestGold, false],
      ["最多遗物", r.bestRelics, false],
      ["解锁钉子", (r.bestPegs || 0) + "/40", false],
      ["最大牌组", r.bestDeck, false],
    ];
    return items.map(([k, v, best]) =>
      `<div class="rec${best ? " best" : ""}"><div class="rk">${k}</div><div class="rv">${v}</div></div>`
    ).join("");
  }
  function renderRecords(elId) {
    const el = document.getElementById(elId);
    if (el) el.innerHTML = recordsHTML(loadRecords());
  }

  // ---------- 结束与重启 ----------
  // byChoice=true 表示玩家主动点了"结束"，否则是阵亡
  function gameOver(win, byChoice) {
    G.state = "over";
    G.runToken++;   // 作废本局所有还在排队的 setTimeout（敌人回合 / 关卡结算）
    // 清掉可能还在飞的弹珠，别让物理在结算界面背后继续跑
    for (const b of activeBalls.slice()) World.remove(world, b);
    activeBalls = [];

    const run = {
      floor: G.floor, gold: G.gold, relics: G.relics.length,
      pegs: unlockedPegCount(), deck: G.deck.length,
    };
    const rec = submitRun(run);

    document.getElementById("goTitle").textContent =
      byChoice ? "🏁 冒险结束" : (win ? "🎉 登顶通关！" : "💀 你倒下了");
    document.getElementById("goStats").innerHTML =
      `到达第 <b>${G.floor}</b> 层<br>` +
      `金币 <b>${G.gold}</b>　遗物 <b>${G.relics.length}</b> 个<br>` +
      `牌组 <b>${G.deck.length}</b> 张　已解锁特殊钉 <b>${run.pegs}</b>/40`;
    document.getElementById("goRecords").innerHTML = recordsHTML(rec);
    document.getElementById("gameover").classList.remove("hidden");
  }

  // 主动结束：任何时候都能收工并直接结算
  function endRun() {
    if (G.state === "menu" || G.state === "over") return;
    gameOver(false, true);
  }
  document.getElementById("btnEndRun").addEventListener("click", endRun);

  function newGame() {
    G.runToken++;   // 重开也要换代号，防止上一局的残留回调串进来
    G.player = { hp: 50, maxHp: 50, block: 0, weak: 0 };
    G.gold = 15;
    G.relics = [];
    G.deck = ["pebble", "pebble", "daggorb", "bomborb"];
    G.deckIdx = 0;
    G.pegBudget = newPegBudget();
    G.lastUnlock = null;
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("gameover").classList.add("hidden");
    document.getElementById("upgrade").classList.add("hidden");
    document.getElementById("shopOverlay").classList.add("hidden");

    if (!engine) initPhysics();
    resize();
    startFloor(1);
  }

  document.getElementById("startBtn").addEventListener("click", newGame);
  document.getElementById("retryBtn").addEventListener("click", newGame);

  // 启动
  initPhysics();
  resize();
  renderRecords("pegRecords");
  requestAnimationFrame(loop);
})();
