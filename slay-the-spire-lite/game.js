// 杀戮尖塔 · 简化版 — 纯前端 DOM+JS 实现
(function () {
  "use strict";

  // ---------- 卡牌定义（数据驱动） ----------
  // 卡牌 effect 返回 false 表示打出失败(如需目标但未选)
  // 第二个参数 c 是"手里这一张具体卡牌实例"——升级状态记在实例上（c.upgraded），
  // 所以升级一张打击只加强这一张，而不是所有同名卡。
  // （旧写法按卡牌 id 全局记升级：篝火升 1 张打击，等于把牌组里 5 张打击全升了。）
  const CARD_DEFS = {
    strike: { name: "打击", cost: 1, type: "attack", desc: "造成 6 点伤害。",
      effect: (g, c) => { if (!g.targetEnemy()) return false; g.dealDamage(g.target, 6 + 3 * upg(c)); return true; } },
    defend: { name: "防御", cost: 1, type: "skill", desc: "获得 5 点格挡。",
      effect: (g, c) => { g.player.block += 5 + 3 * upg(c); return true; } },
    bash: { name: "猛击", cost: 2, type: "attack", desc: "造成 8 伤害并施加 2 层易伤。",
      effect: (g, c) => { if (!g.targetEnemy()) return false; const m = upg(c) ? 10 : 8; g.dealDamage(g.target, m); g.addStatus(g.target, "vuln", 2); return true; } },
    cleave: { name: "横劈", cost: 1, type: "attack", desc: "对所有敌人造成 7 伤害。",
      effect: (g, c) => { const d = 7 + 3 * upg(c); for (const e of g.enemies) if (!e.dead) g.dealDamage(e, d); return true; } },
    poison_stab: { name: "毒刺", cost: 1, type: "attack", desc: "造成 4 伤害，施加 3 中毒。",
      effect: (g, c) => { if (!g.targetEnemy()) return false; g.dealDamage(g.target, 4 + 2 * upg(c)); g.addStatus(g.target, "poison", 3); return true; } },
    pummel: { name: "连击", cost: 1, type: "attack", desc: "造成 3 伤害 2 次。",
      effect: (g, c) => { if (!g.targetEnemy()) return false; const t = g.target; const d = 3 + upg(c); g.dealDamage(t, d); if (!t.dead) g.dealDamage(t, d); return true; } },
    iron_wave: { name: "铁浪", cost: 1, type: "attack", desc: "造成 5 伤害，获得 5 格挡。",
      effect: (g, c) => { if (!g.targetEnemy()) return false; const k = upg(c); g.dealDamage(g.target, 5 + 2 * k); g.player.block += 5 + 2 * k; return true; } },
    shrug: { name: "耸肩", cost: 1, type: "skill", desc: "获得 8 格挡，抽 1 张牌。",
      effect: (g, c) => { const k = upg(c); g.player.block += 8 + 2 * k; g.drawCards(1 + k); return true; } },
    anger: { name: "愤怒", cost: 0, type: "attack", desc: "造成 6 伤害。将一张愤怒放入弃牌堆。",
      effect: (g, c) => { if (!g.targetEnemy()) return false; g.dealDamage(g.target, 6 + 3 * upg(c)); g.discard.push({ id: "anger", uid: uid() }); return true; } },
    flame_barrier: { name: "烈焰屏障", cost: 2, type: "skill", desc: "获得 12 格挡。",
      effect: (g, c) => { g.player.block += 12 + 4 * upg(c); return true; } },
    heavy_blade: { name: "重刃", cost: 2, type: "attack", desc: "造成 14 伤害。",
      effect: (g, c) => { if (!g.targetEnemy()) return false; g.dealDamage(g.target, 14 + 6 * upg(c)); return true; } },
    weakness: { name: "衰弱", cost: 1, type: "skill", desc: "所有敌人施加 2 层虚弱。",
      effect: (g, c) => { for (const e of g.enemies) if (!e.dead) g.addStatus(e, "weak", 2 + upg(c)); return true; } },
  };

  // ---------- 初始牌组 ----------
  const STARTER_DECK = ["strike","strike","strike","strike","strike","defend","defend","defend","defend","bash"];
  const REWARD_POOL = ["strike","defend","bash","cleave","poison_stab","pummel","iron_wave","shrug","anger","flame_barrier","heavy_blade","weakness"];

  // ---------- 敌人模板 ----------
  const ENEMY_DEFS = [
    { id: "slime", name: "史莱姆", hp: [22, 28], intents: [{ t: "atk", v: 8 }, { t: "atk", v: 8 }, { t: "block", v: 6 }] },
    { id: "bat", name: "蝙蝠", hp: [18, 24], intents: [{ t: "atk", v: 6 }, { t: "weak", v: 1 }, { t: "atk", v: 6 }] },
    { id: "goblin", name: "哥布林", hp: [26, 32], intents: [{ t: "atk", v: 10 }, { t: "block", v: 5 }, { t: "atk", v: 6 }] },
    { id: "skeleton", name: "骷髅", hp: [24, 30], intents: [{ t: "atk", v: 7 }, { t: "atk", v: 7 }, { t: "poison", v: 2 }] },
    { id: "elite_knight", name: "精英·重甲兵", hp: [42, 50], intents: [{ t: "atk", v: 12 }, { t: "block", v: 8 }, { t: "atk", v: 9 }, { t: "atk", v: 14 }] },
    { id: "boss_wyrm", name: "Boss·巨蠕虫", hp: [70, 80], intents: [{ t: "atk", v: 11 }, { t: "atk", v: 11 }, { t: "vuln", v: 2 }, { t: "atk", v: 16 }] },
  ];

  // ---------- 地图节点 ----------
    const NODE_TYPES = [
      { t: "combat", icon: "⚔️", name: "战斗" },
      { t: "elite", icon: "💀", name: "精英" },
      { t: "rest", icon: "🔥", name: "篝火" },
      { t: "reward", icon: "🎁", name: "宝箱" },
      { t: "shop", icon: "🧙", name: "商店" },
    ];

  // ---------- 遗物定义 ----------
  // 这两个常量原先被下方 renderRelics / renderPotions / renderShop 引用却从未定义，
  // 一进入战斗就会抛 ReferenceError 打断整局渲染。
  const RELIC_DEFS = {
    burning_blood: {
      id: "burning_blood", name: "燃烧之血", desc: "战斗胜利后回复 6 点生命",
      onWin: (g) => { g.player.hp = Math.min(g.player.maxHp, g.player.hp + 6); },
    },
    orichalcum: {
      id: "orichalcum", name: "奥利哈钢", desc: "回合结束时若没有格挡，获得 6 点格挡",
      effect: (g) => { if ((g.player.block || 0) <= 0) g.player.block = (g.player.block || 0) + 6; },
    },
    runic_pyramid: {
      id: "runic_pyramid", name: "金字塔", desc: "每场战斗开始时额外抽 1 张牌",
      onBattleStart: (g) => { g.drawCards(1); },
    },
  };

  // ---------- 药水定义 ----------
  const POTION_DEFS = {
    heal_potion: {
      id: "heal_potion", name: "生命药水", cost: 40, desc: "恢复 20 点生命",
      effect: (g) => { g.player.hp = Math.min(g.player.maxHp, g.player.hp + 20); },
    },
    strength_potion: {
      id: "strength_potion", name: "力量药水", cost: 50, desc: "本场战斗力量 +2（攻击伤害 +2）",
      effect: (g) => { g.player.strength = (g.player.strength || 0) + 2; },
    },
  };

  // ---------- 工具 ----------
  const uid = () => Math.random().toString(36).slice(2, 9);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[randi(0, arr.length - 1)];
  
  // 性能优化：使用 Fisher-Yates 算法的改进版本，减少交换次数
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // ---------- 游戏状态 ----------
  const game = {
    player: { hp: 60, maxHp: 60, block: 0, energy: 3, maxEnergy: 3, statuses: {} },
    deck: [], draw: [], discard: [], hand: [],
    relics: [], potions: [],
    enemies: [], target: null,
    map: [], mapRow: 0, mapCol: 0, floor: 1,
    state: "menu",
    turnLock: false,   // 回合切换锁：见 endTurn / turnStart
  };
  const G = game;

  // 升级读取助手：升级状态记在"这一张卡牌实例"上（c.upgraded）。
  // 旧写法按卡牌 id 全局记录，导致篝火升级 1 张"打击"等于把牌组里 5 张打击全升了。
  const upg = (card) => (card && card.upgraded) || 0;

  // 把战斗辅助函数挂到 G 上，供卡牌 effect 以 g.xxx() 形式调用
  // （否则 g.targetEnemy / g.dealDamage 等都是 undefined，会抛 TypeError 导致点击无反应）
  G.targetEnemy = targetEnemy;
  G.dealDamage = dealDamage;
  G.addStatus = addStatus;
  G.drawCards = drawCards;

  // ---------- 战斗上下文辅助 ----------
  function targetEnemy() {
    if (!G.target || G.target.dead) {
      const alive = G.enemies.filter(e => !e.dead);
      if (alive.length === 0) return false;
      G.target = alive[0];
    }
    return true;
  }
  function dealDamage(t, base) {
    let dmg = base + (G.player.strength || 0);
    if (G.player.statuses.weak) dmg = Math.floor(dmg * 0.75);
    if (t.statuses.vuln) dmg = Math.floor(dmg * 1.5);
    // 格挡抵消伤害
    const blocked = Math.min(t.block || 0, dmg);
    const real = dmg - blocked;
    t.block = (t.block || 0) - blocked;
    t.hp -= real;
    flash(t);
    if (t.hp <= 0) { t.dead = true; t.hp = 0; }
  }
  function addStatus(t, key, n) { t.statuses[key] = (t.statuses[key] || 0) + n; }
  function drawCards(n) {
    for (let i = 0; i < n; i++) {
      if (G.draw.length === 0) { 
        // 性能优化：直接转移数组引用，避免创建新数组和拷贝操作
        G.draw = G.discard;
        G.discard = [];
        if (G.draw.length === 0) return;
        shuffle(G.draw);
      }
      G.hand.push(G.draw.shift());
    }
  }
  function discardHand() { for (const c of G.hand) G.discard.push(c); G.hand = []; }

  // ---------- 闪烁 ----------
  function flash(t) { t._flash = 8; }

  // ---------- 敌人意图 ----------
  function chooseIntent(e) {
    const def = ENEMY_DEFS.find(d => d.id === e.defId);
    e.intentIdx = (e.intentIdx + 1) % def.intents.length;
    e.intent = def.intents[e.intentIdx];
  }
  function intentText(intent) {
    if (intent.t === "atk") return `⚔️ <span class="val">${intent.v}</span>`;
    if (intent.t === "block") return `🛡️ <span class="val">${intent.v}</span>`;
    if (intent.t === "weak") return `💧 <span class="val">${intent.v}</span>`;
    if (intent.t === "poison") return `☠️ <span class="val">${intent.v}</span>`;
    if (intent.t === "vuln") return `🔻 <span class="val">${intent.v}</span>`;
    return "?";
  }

  // ---------- 敌人行动 ----------
  function enemyAct(e) {
    if (e.dead) return;
    const it = e.intent;
    if (it.t === "atk") {
      let dmg = it.v;
      if (e.statuses.weak) dmg = Math.floor(dmg * 0.75);
      if (G.player.statuses.vuln) dmg = Math.floor(dmg * 1.5);
      const blocked = Math.min(G.player.block, dmg);
      G.player.block -= blocked;
      const real = dmg - blocked;
      G.player.hp -= real;
      flash(G.player);
    } else if (it.t === "block") { e.block = (e.block || 0) + it.v; }
      else if (it.t === "weak") { addStatus(G.player, "weak", it.v); }
      else if (it.t === "poison") { addStatus(G.player, "poison", it.v); }
      else if (it.t === "vuln") { addStatus(G.player, "vuln", it.v); }
    chooseIntent(e);
  }

  // ---------- 状态结算 ----------
  function settleStatuses(t) {
    // 中毒：扣 stacks 点血；层数衰减交给 tickDown（每回合 -1）
    // 旧写法在这里也减了 1 层，叠加 tickDown 等于每回合掉 2 层 ——
    // 3 层中毒只能打出 4 点总伤害（应该 3+2+1=6），毒刺流派直接残废。
    if (t.statuses.poison) { 
      const p = t.statuses.poison; 
      t.hp -= p; 
      flash(t); 
      if (t.hp <= 0) { 
        t.hp = 0; 
        if (t !== G.player) t.dead = true; 
      }
    }
  }
  function tickDown(t) {
    for (const k in t.statuses) { if (t.statuses[k] > 0) t.statuses[k] -= 1; if (t.statuses[k] <= 0) delete t.statuses[k]; }
  }

  // ---------- 回合 ----------
  function turnStart() {
    G.player.block = 0;
    // 注意：敌人的护甲不能在这里清！旧写法在这里把所有 e.block 清零，
    // 而敌人回合（endTurn）才刚给它叠上护甲 —— 等于玩家一出手护甲就没了，
    // 哥布林/精英/史莱姆的"防御"意图完全无效。正确时机是"敌人自己回合开始时"（见 endTurn）。
    G.player.energy = G.player.maxEnergy;
    drawCards(5);
    G.turnLock = false;   // 回合已真正开始，解锁
    renderBattle();
  }
  function endTurn() {
    // turnLock：350ms 过渡窗口期 state 仍是 battle，狂点"结束回合"会让敌人多打一轮
    if (G.state !== "battle" || G.turnLock) return;
    G.turnLock = true;
    // 玩家弃手牌
    discardHand();
    renderBattle();
    // 遗物：回合结束触发的效果
    for (const id of G.relics) {
      const rel = RELIC_DEFS[id];
      if (rel && rel.effect) rel.effect(G);
    }
    // 敌人回合开始：清掉上一轮留下的护甲（与《杀戮尖塔》一致，护甲在自己回合开始时失效）
    for (const e of G.enemies) e.block = 0;
    // 敌人按意图行动
    for (const e of G.enemies) enemyAct(e);
    // 玩家死亡？
    if (G.player.hp <= 0) { G.player.hp = 0; return gameOver(false); }
    // 状态结算（双方中毒）——中毒可能在此击杀玩家
    settleStatuses(G.player);
    for (const e of G.enemies) settleStatuses(e);
    if (G.player.hp <= 0) { G.player.hp = 0; return gameOver(false); }
    // 状态递减
    tickDown(G.player);
    for (const e of G.enemies) tickDown(e);
    // 敌人全死？
    if (G.enemies.every(e => e.dead)) { return battleWin(); }
    renderBattle();
    // 下一回合（短暂延迟让玩家看清敌人动作后重置并抽牌）
    setTimeout(() => { turnStart(); }, 350);
  }

  // ---------- 战斗 ----------
  function startBattle(nodeType) {
    G.enemies = [];
    let pool;
    if (nodeType === "elite") pool = ENEMY_DEFS.filter(e => e.id === "elite_knight");
    else if (nodeType === "boss") pool = ENEMY_DEFS.filter(e => e.id === "boss_wyrm");
    else pool = ENEMY_DEFS.filter(e => !e.id.startsWith("elite") && !e.id.startsWith("boss"));
    const count = nodeType === "boss" ? 1 : (nodeType === "elite" ? 1 : randi(1, 2));
    for (let i = 0; i < count; i++) {
      const def = pick(pool);
      G.enemies.push({ defId: def.id, name: def.name, hp: randi(def.hp[0], def.hp[1]),
        maxHp: 0, block: 0, statuses: {}, intentIdx: -1, dead: false, _flash: 0 });
    }
    for (const e of G.enemies) { e.maxHp = e.hp; chooseIntent(e); }
    G.target = G.enemies[0];
    G.player.block = 0; G.player.statuses = {};
    G.player.strength = 0;                     // 力量药水只作用于本场战斗
    // 洗牌时要把"这张牌升级过"的标记一起带进牌堆，否则一进战斗升级就白升了
    G.draw = shuffle(G.deck.map(c => ({ id: c.id, uid: uid(), upgraded: c.upgraded || 0 })));
    G.discard = []; G.hand = [];
    G.state = "battle";
    const nameEl = document.getElementById("nodename");
    if (nameEl) nameEl.textContent = nodeType === "boss" ? "Boss" : nodeType === "elite" ? "精英" : "战斗";
    show("battle");
    turnStart();
    // 遗物：战斗开始触发的效果（在首轮抽牌之后）
    for (const id of G.relics) {
      const rel = RELIC_DEFS[id];
      if (rel && rel.onBattleStart) rel.onBattleStart(G);
    }
    renderBattle();
  }

  function battleWin() {
    // 战斗奖励：金币 + 遗物胜利效果
    G.player.gold = (G.player.gold || 0) + 15;
    for (const id of G.relics) {
      const rel = RELIC_DEFS[id];
      if (rel && rel.onWin) rel.onWin(G);
    }
    // 奖励：选卡
    G.state = "reward";
    show("reward");
    renderReward();
    renderExtraHud();
  }

  // ---------- 地图 ----------
  function genMap() {
    const rows = 6;
    G.map = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      // 起点层与 Boss 层各只放一个节点。
      // 旧写法这两层也会随机 2~4 个节点，但可达性推导只允许"第 0 层的第 0 列 / Boss 层任意列"，
      // 于是起点层会显示出一排看着能点、点了却没反应的死节点。
      const n = (r === 0 || r === rows - 1) ? 1 : randi(2, 4);
      for (let i = 0; i < n; i++) {
        let t;
        if (r === rows - 1) t = "boss";
        else if (r === 0) t = "combat";
        else t = pick(["combat","combat","combat","elite","rest","reward","shop"]);
        const def = NODE_TYPES.find(d => d.t === t) || { icon: "👑", name: "Boss" };
        row.push({ t, icon: t === "boss" ? "👑" : def.icon, name: t === "boss" ? "Boss" : def.name, done: false });
      }
      G.map.push(row);
    }
    G.mapRow = 0; G.mapCol = 0;
    // 节点可达性统一在 renderMap 里按当前层推导，这里不再手动打标记
  }

  function renderMap() {
    show("mapscene");
    const mapEl = document.getElementById("map");
    mapEl.innerHTML = "";
    for (let r = 0; r < G.map.length; r++) {
      const rowEl = document.createElement("div");
      rowEl.className = "map-row";
      for (let c = 0; c < G.map[r].length; c++) {
        const node = G.map[r][c];
        // 可达性每次渲染都重新推导：只有当前层的节点可选（第 0 层只有起点）。
        // 旧写法只在 backToMap 里给新层打标记、却从不清除，导致上一层残留的
        // reachable 让旧节点一直显示为可点，点了又因不在当前层而被 enterNode 直接 return，
        // 表现为"点了没反应、卡在这一层"。
        node.reachable = !node.done && r === G.mapRow && (r > 0 || c === 0);
        const div = document.createElement("div");
        div.className = "map-node";
        if (node.done) div.classList.add("done");
        if (node.reachable) div.classList.add("reachable");
        if (r === G.mapRow && c === G.mapCol) div.classList.add("cur");
        div.textContent = node.icon;
        div.title = node.name;
        if (node.reachable && !node.done) {
          div.addEventListener("click", () => enterNode(r, c));
        }
        rowEl.appendChild(div);
      }
      mapEl.appendChild(rowEl);
    }
    document.getElementById("floor").textContent = G.floor;
  }

  function enterNode(r, c) {
    if (r !== G.mapRow) return;                       // 只能进入当前层
    const node = G.map[r] && G.map[r][c];
    if (!node || !node.reachable || node.done) return;
    G.mapRow = r; G.mapCol = c;
    node.done = true;
    if (node.t === "combat" || node.t === "elite" || node.t === "boss") {
      startBattle(node.t);
    } else if (node.t === "rest") {
      G.state = "rest"; show("rest");
    } else if (node.t === "reward") {
      // 宝箱：直接给选卡 + 回血
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + Math.floor(G.player.maxHp * 0.15));
      G.state = "reward"; show("reward"); renderReward();
    } else if (node.t === "shop") {
      G.state = "shop"; initShop(); show("shop"); renderShop();
    }
  }

  // 节点结束后回到地图（下一行）
  function backToMap() {
    G.mapRow++;
    // 必须先判越界：打完顶层 Boss 后 mapRow 会等于 map.length，
    // 旧写法先访问 G.map[G.mapRow].forEach 会抛 TypeError，通关流程直接中断
    if (G.mapRow >= G.map.length) { return gameOver(true); }
    G.floor++;
    renderMap();
  }

  // ---------- 奖励 ----------
  function renderReward() {
    const cards = document.getElementById("rewardCards");
    cards.innerHTML = "";
    document.getElementById("rewardTitle").textContent = "选择一张卡牌加入牌组";
    const picks = [];
    const copy = REWARD_POOL.slice();
    while (picks.length < 3 && copy.length) { picks.push(copy.splice(randi(0, copy.length - 1), 1)[0]); }
    for (const id of picks) {
      const def = CARD_DEFS[id];
      const card = document.createElement("div");
      card.className = "card t-" + def.type;
      card.innerHTML = `<div class="cost">${def.cost}</div><div class="cname">${def.name}</div><div class="ctype">${typeLabel(def.type)}</div><div class="cdesc">${def.desc}</div>`;
      card.addEventListener("click", () => { G.deck.push({ id }); renderBattleDeckCount(); backToMap(); });
      cards.appendChild(card);
    }
  }
  document.getElementById("skipReward").addEventListener("click", backToMap);

  function typeLabel(t) { return t === "attack" ? "攻击" : t === "skill" ? "技能" : "能力"; }

  // ---------- 休息 ----------
  document.getElementById("restHeal").addEventListener("click", () => {
    G.player.hp = Math.min(G.player.maxHp, G.player.hp + Math.floor(G.player.maxHp * 0.3));
    backToMap();
  });
  document.getElementById("restUpgrade").addEventListener("click", () => {
    const list = document.getElementById("upgradeList");
    list.innerHTML = "";
    delete list.dataset.done;      // 每次进篝火只允许升级一张
    G.deck.forEach((c) => {
      const def = CARD_DEFS[c.id];
      const item = document.createElement("div");
      item.className = "upgrade-item";
      item.innerHTML = `<div class="uname">${def.name}${upg(c) ? " ✦" : ""}</div><div class="udesc">${def.desc}</div>`;
      // 升级记在这一张卡上；已经升过的不能再点
      if (!upg(c)) {
        item.addEventListener("click", () => {
          if (list.dataset.done) return;
          list.dataset.done = "1";
          c.upgraded = (c.upgraded || 0) + 1;
          list.innerHTML = "<p style='text-align:center;color:#9b8cc4'>已升级 ✦ 这张 " + def.name + "</p>";
          setTimeout(backToMap, 600);
        });
      } else {
        item.style.opacity = "0.5";
        item.style.cursor = "default";
      }
      list.appendChild(item);
    });
  });

  // ---------- 渲染战斗 ----------
  function renderBattle() {
    document.getElementById("floor").textContent = G.floor;
    document.getElementById("energy").textContent = G.player.energy;
    document.getElementById("maxenergy").textContent = G.player.maxEnergy;
    document.getElementById("php").style.width = (G.player.hp / G.player.maxHp * 100) + "%";
    document.getElementById("ptext").textContent = G.player.hp + "/" + G.player.maxHp;
    document.getElementById("pblock").textContent = "🛡 " + G.player.block;
    renderBattleDeckCount();
    // 玩家状态
    document.getElementById("pstatus").innerHTML = statusTags(G.player.statuses);

    // 敌人
    const enemiesEl = document.getElementById("enemies");
    enemiesEl.innerHTML = "";
    for (const e of G.enemies) {
      const div = document.createElement("div");
      div.className = "enemy";
      if (e === G.target && !e.dead) div.classList.add("target");
      if (e.dead) div.style.opacity = 0.35;
      if (e._flash > 0) { div.style.borderColor = "#ff5b6e"; e._flash--; }
      div.innerHTML = `
        <div class="ename">${e.name}</div>
        <div class="ehp"><div class="ehpfill" style="width:${e.hp / e.maxHp * 100}%"></div><span>${e.hp}/${e.maxHp}</span></div>
        <div class="eblock">🛡 ${e.block || 0}</div>
        <div class="intent">${e.dead ? "💀" : intentText(e.intent)}</div>
        <div class="estatus">${statusTags(e.statuses)}</div>`;
      div.addEventListener("click", () => { G.target = e; renderBattle(); });
      enemiesEl.appendChild(div);
    }

    // 手牌
    const handEl = document.getElementById("hand");
    handEl.innerHTML = "";
    for (const c of G.hand) {
      const def = CARD_DEFS[c.id];
      const card = document.createElement("div");
      const playable = G.player.energy >= def.cost;
      card.className = "card t-" + def.type + (playable ? " playable" : " disabled");
      const upMark = upg(c) ? " ✦" : "";
      card.innerHTML = `<div class="cost">${def.cost}</div><div class="cname">${def.name}${upMark}</div><div class="ctype">${typeLabel(def.type)}</div><div class="cdesc">${def.desc}</div>`;
      if (playable) card.addEventListener("click", () => playCard(c));
      handEl.appendChild(card);
    }

    // 附加 HUD：金币 / 遗物 / 药水
    renderExtraHud();
  }
  function renderBattleDeckCount() {
    document.getElementById("deckcount").textContent = "牌堆 " + G.draw.length + " · 弃 " + G.discard.length;
  }
  function statusTags(st) {
    let s = "";
    if (st.poison) s += `<span class="tag">☠${st.poison}</span>`;
    if (st.vuln) s += `<span class="tag">🔻${st.vuln}</span>`;
    if (st.weak) s += `<span class="tag">💧${st.weak}</span>`;
    return s;
  }

  // ---------- 出牌 ----------
  function playCard(c) {
    const def = CARD_DEFS[c.id];
    if (G.player.energy < def.cost) return;
    const ok = def.effect(G, c);
    if (ok === false) { flashMsg("需要选择目标"); return; }
    G.player.energy -= def.cost;
    // 移出手牌到弃牌堆
    const i = G.hand.indexOf(c); if (i >= 0) G.hand.splice(i, 1); G.discard.push(c);
    // 敌人全死？
    if (G.enemies.every(e => e.dead)) { return battleWin(); }
    // 玩家死亡？
    if (G.player.hp <= 0) { G.player.hp = 0; return gameOver(false); }
    renderBattle();
  }

  // ---------- 本机战绩（localStorage） ----------
  const REC_KEY = "sts_records";
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function submitRun(win) {
    // floor 语义：通关时 G.floor 已被 backToMap 加到 7，实际清掉的是 6 层；
    // 中途倒下时第 G.floor 层没打完，所以已通关层数 = floor - 1
    const cleared = win ? 6 : Math.max(0, G.floor - 1);
    const r = loadRec();
    r.runs = (r.runs || 0) + 1;
    r.wins = (r.wins || 0) + (win ? 1 : 0);
    r.bestFloor = Math.max(r.bestFloor || 0, cleared);
    r.bestDeck = Math.max(r.bestDeck || 0, G.deck.length);
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
    return r;
  }
  function recHTML(r) {
    if (!r || !r.runs) return '<span class="empty">还没有战绩，先爬一层吧</span>';
    return '<div class="rec best"><div class="rk">通关次数</div><div class="rv">' + (r.wins || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">最深到达</div><div class="rv">' + (r.bestFloor || 0) + '/6</div></div>' +
           '<div class="rec"><div class="rk">最大牌组</div><div class="rv">' + (r.bestDeck || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">局数</div><div class="rv">' + r.runs + '</div></div>';
  }
  function renderRecords() {
    const html = recHTML(loadRec());
    const a = document.getElementById("stsRecords");
    const b = document.getElementById("stsRecordsOver");
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
  }

  // ---------- 结束 ----------
  function gameOver(win) {
    G.state = "over";
    const rec = submitRun(win);
    show("gameover");
    document.getElementById("goTitle").textContent = win ? "通关！" : "你倒下了";
    document.getElementById("goStats").innerHTML = win
      ? `你击败了 Boss，登顶尖塔！<br>剩余生命 <b>${G.player.hp}</b>　牌组 <b>${G.deck.length}</b> 张`
      : `你倒在了第 <b>${G.floor}</b> 层<br>牌组 <b>${G.deck.length}</b> 张`;
    document.getElementById("stsRecordsOver").innerHTML = recHTML(rec);
  }

  // ---------- 消息 ----------
  let msgTimer;
  function flashMsg(t) {
    let el = document.getElementById("battleMsg");
    if (!el) { el = document.createElement("div"); el.id = "battleMsg"; el.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:#ffd86b;padding:8px 16px;border-radius:8px;z-index:50;pointer-events:none;"; document.body.appendChild(el); }
    el.textContent = t; el.style.opacity = 1;
    clearTimeout(msgTimer); msgTimer = setTimeout(() => el.style.opacity = 0, 1200);
  }

  // ---------- 场景切换 ----------
  function show(name) {
    for (const s of document.querySelectorAll(".scene")) s.classList.add("hidden");
    const el = document.getElementById(name); if (el) el.classList.remove("hidden");
  }

  // ---------- 战斗结束后回到地图 ----------
  // battleWin -> reward -> 选完卡 backToMap（已在 skipReward 与卡牌点击处理）
  // 休息/宝箱结束 -> backToMap

  // ---------- 启动 ----------
  function newRun() {
    // 遗物/药水挂在 G 上（renderRelics 等读的是 G.relics，不能塞进 G.player）
    // 只有 strength 会被 dealDamage 读取。dexterity 原本声明了却全无引用，
    // 而菜单还宣称"敏捷提升所有格挡值"，属于虚假宣传 → 移除该死字段并改文案。
    G.player = { hp: 60, maxHp: 60, block: 0, energy: 3, maxEnergy: 3, statuses: {}, gold: 50, strength: 0 };
    G.relics = [];
    G.potions = [];
    G.deck = STARTER_DECK.map(id => ({ id }));
    G.floor = 1;
    genMap();
    renderMap();
  }

  // ---------- 遗物、药水、商店渲染与交互 ----------
  function renderRelics() {
    const bar = document.getElementById("relicsBar");
    if (!bar) return;
    bar.innerHTML = "";
    G.relics.forEach(id => {
      const def = RELIC_DEFS[id];
      if (!def) return;
      const span = document.createElement("span");
      span.className = "relic-badge";
      span.textContent = def.name;
      bar.appendChild(span);
    });
  }

  function renderPotions() {
    const bar = document.getElementById("potionsBar");
    if (!bar) return;
    bar.innerHTML = "";
    G.potions.forEach((id, idx) => {
      const def = POTION_DEFS[id];
      if (!def) return;
      const btn = document.createElement("button");
      btn.className = "potion-btn";
      btn.textContent = def.name;
      btn.addEventListener("click", () => {
        def.effect(G);
        G.potions.splice(idx, 1);
        renderPotions();
        renderBattle();
      });
      bar.appendChild(btn);
    });
  }

  function initShop() {
    G.shopItems = [];
    const cardPool = REWARD_POOL.slice();
    while (G.shopItems.length < 3 && cardPool.length) {
      const id = cardPool.splice(randi(0, cardPool.length - 1), 1)[0];
      const def = CARD_DEFS[id];
      const cost = 25 + (def ? def.cost * 15 : 15);
      G.shopItems.push({ type: "card", id, cost, bought: false });
    }
    const unownedRelics = Object.keys(RELIC_DEFS).filter(k => !(G.relics || []).includes(k));
    if (unownedRelics.length) {
      G.shopItems.push({ type: "relic", id: pick(unownedRelics), cost: 65, bought: false });
    }
    const potionIds = Object.keys(POTION_DEFS);
    if (potionIds.length) {
      const pid = pick(potionIds);
      G.shopItems.push({ type: "potion", id: pid, cost: POTION_DEFS[pid].cost, bought: false });
    }
  }

  function renderShop() {
    const container = document.getElementById("shopContent");
    container.innerHTML = "";
    const goldSpan = document.getElementById("shopGold");
    if (goldSpan) goldSpan.textContent = G.player.gold;
    if (!G.shopItems || G.shopItems.length === 0) initShop();

    G.shopItems.forEach(it => {
      const div = document.createElement("div");
      div.className = "shop-item" + (it.bought ? " bought" : "");
      let title = "", sub = "";
      if (it.type === "card") {
        title = CARD_DEFS[it.id]?.name || it.id;
        sub = "卡牌";
      } else if (it.type === "relic") {
        title = RELIC_DEFS[it.id]?.name || it.id;
        sub = "遗物";
      } else if (it.type === "potion") {
        title = POTION_DEFS[it.id]?.name || it.id;
        sub = "药水";
      }
      if (it.bought) {
        div.innerHTML = `${title}<br><small style="color:var(--mut)">已售罄</small>`;
        div.style.opacity = "0.45";
        div.style.pointerEvents = "none";
      } else {
        div.innerHTML = `${title}<br><small style="color:var(--mut)">${sub}</small><div class="s-price">🪙 ${it.cost}</div>`;
        div.addEventListener("click", () => buyItem(it, it.cost));
      }
      container.appendChild(div);
    });
  }

  function buyItem(item, price) {
    if (item.bought) return;
    if (G.player.gold < price) { flashMsg("金币不足"); return; }
    if (item.type === "potion" && (G.potions || []).length >= 3) {
      flashMsg("药水栏已满（最多携带 3 瓶）");
      return;
    }
    if (item.type === "relic" && (G.relics || []).includes(item.id)) {
      flashMsg("已拥有该遗物");
      return;
    }
    G.player.gold -= price;
    item.bought = true;
    if (item.type === "card") {
      G.deck.push({ id: item.id });
    } else if (item.type === "relic") {
      G.relics.push(item.id);
    } else if (item.type === "potion") {
      G.potions.push(item.id);
    }
    renderShop();
    renderBattleDeckCount();
    document.getElementById("gold").textContent = `🪙 ${G.player.gold}`;
  }

  // 金币 / 遗物 / 药水的附加 HUD 刷新
  //
  // ⚠️ 这里原先是 4 组"猴子补丁"，形如：
  //      const _originalRenderBattle = renderBattle;
  //      function renderBattle() { _originalRenderBattle(); ... }
  // 同一作用域内重复声明同名函数时，后声明的会覆盖先声明的（函数声明提升），
  // 所以 `_originalRenderBattle` 拿到的其实是包装后的 renderBattle 自己，
  // 调用即无限递归 → RangeError: Maximum call stack size exceeded。
  // 点地图节点走的是 enterNode，一进去就爆栈，表现为"第一层点不进去"。
  // 正确做法：只用一个唯一命名的辅助函数，由各处显式调用。
  function renderExtraHud() {
    const goldEl = document.getElementById("gold");
    if (goldEl) goldEl.textContent = `🪙 ${G.player.gold || 0}`;
    renderRelics();
    renderPotions();
  }

  document.getElementById("leaveShopBtn").addEventListener("click", () => {
    backToMap();
  });

  // ---------- 事件 ----------
  document.getElementById("endTurn").addEventListener("click", endTurn);
  document.getElementById("startBtn").addEventListener("click", newRun);
  document.getElementById("retryBtn").addEventListener("click", newRun);
  renderRecords();
  show("menu");
})();
