/* Baba Is You — 主程序：输入 / 关卡管理 / 撤销 / UI（浏览器端） */
(function () {
  "use strict";
  const BIY = window.BIY;
  const LEVELS = window.BIY_LEVELS;
  const RENDER = window.BIY_RENDER;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const elName = document.getElementById("levelName");
  const elHint = document.getElementById("hint");
  const elRules = document.getElementById("rules");
  const elStatus = document.getElementById("status");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMsg = document.getElementById("overlayMsg");
  const levelList = document.getElementById("levelList");

  // 画布逻辑尺寸（按 DPR 放大保证清晰）
  const SIZE = 720;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = "min(72vh, 720px)";
  canvas.style.height = "min(72vh, 720px)";
  ctx.scale(dpr, dpr);
  // 之后绘制使用逻辑坐标（0..SIZE）
  canvas._logical = SIZE;

  let levelIndex = 0;
  let state = null;
  let history = [];
  let steps = 0;      // 本关有效步数（只统计真正改变了盘面的操作）

  function loadLevel(i) {
    levelIndex = (i + LEVELS.length) % LEVELS.length;
    state = BIY.loadLevel(LEVELS[levelIndex]);
    history = [];
    steps = 0;
    hideOverlay();
    updateHUD();
  }
  function restart() { loadLevel(levelIndex); }
  function undo() {
    if (history.length === 0) return;
    const snap = history.pop();
    steps = snap.steps || 0;   // 步数跟着历史一起回退
    state = snap;
    BIY.computeRules(state);
    hideOverlay();
    updateHUD();
  }
  function nextLevel() {
    if (levelIndex < LEVELS.length - 1) loadLevel(levelIndex + 1);
    else showOverlay("🎉 全部通关！", "你已通关全部 " + LEVELS.length + " 关。按 R 重玩本关。", false);
  }
  function selectLevel(i) { loadLevel(i); toggleLevelSelect(false); }

  function updateHUD() {
    elName.textContent = "第 " + (levelIndex + 1) + " 关 · " + state.name;
    elHint.textContent = state.hint;
    const rs = BIY.activeRuleStrings(state);
    elRules.innerHTML = "";
    if (rs.length === 0) {
      const span = document.createElement("span");
      span.className = "chip chip-none";
      span.textContent = "（暂无生效规则）";
      elRules.appendChild(span);
    }
    for (const r of rs) {
      const span = document.createElement("span");
      span.className = "chip";
      span.textContent = r;
      elRules.appendChild(span);
    }
    // 步数 / 本关历史最好步数。bestSteps 之前只在通关记录里默默存着，
    // 游玩过程中完全看不到自己走了几步、离最好成绩差多少。
    const best = (loadRec().bestSteps || {})[levelIndex + 1];
    elStatus.textContent =
      (state.status === "playing" ? "" : state.status + " · ") +
      "步数 " + steps + (best ? " ｜ 最少 " + best : "");
  }

  function showOverlay(title, msg, canNext) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlay.classList.remove("hidden");
    overlay.classList.toggle("can-next", !!canNext);
  }
  function hideOverlay() { overlay.classList.add("hidden"); }

  // 玩家移动
  function move(dir) {
    if (!state || state.status !== "playing") return;
    // 先照一张"移动前"的快照，再执行移动；只有盘面真的变了才算一步。
    // 旧写法每次按键都 push 一条历史、也算一步，于是"撞墙"这种无效操作会
    // 把关卡选择里记录的最少步数灌水，撤销也会被白白浪费一次。
    const before = BIY.serialize(state);
    const snapshot = BIY.cloneState(state);
    snapshot.steps = steps;
    BIY.applyInput(state, dir);
    if (BIY.serialize(state) !== before) {
      steps++;
      history.push(snapshot);
      if (history.length > 300) history.shift();
    }
    updateHUD();
    if (state.status === "won") {
      recordClear(levelIndex + 1, steps);
      markClearedButtons();
      const last = levelIndex === LEVELS.length - 1;
      showOverlay(
        "🎉 过关！",
        "本关用了 " + steps + " 步。" +
          (last ? "这是最后一关，按 N 查看通关画面，R 重玩。" : "按 → / N 进入下一关，R 重玩，Z 撤销。"),
        !last
      );
    } else if (state.status === "lost") {
      showOverlay("💀 失败", "你消失了。按 R 重开，Z 撤销一步。", false);
    }
  }

  // ---------- 本机战绩（localStorage） ----------
  const REC_KEY = "biy_records";
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  // levelNo 从 1 起算，steps 为本关步数（每次重开都会刷新，记录的是历史最好步数）
  function recordClear(levelNo, steps) {
    const r = loadRec();
    r.clears = (r.clears || 0) + 1;
    r.maxLevel = Math.max(r.maxLevel || 0, levelNo);
    r.bestSteps = r.bestSteps || {};
    const prev = r.bestSteps[levelNo];
    if (!prev || steps < prev) r.bestSteps[levelNo] = steps;
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
    return r;
  }
  function recHTML(r) {
    if (!r || !r.clears) return '<span class="empty">还没有通关记录</span>';
    return '<div class="rec best"><div class="rk">已通关</div><div class="rv">' +
             (r.maxLevel || 0) + "/" + LEVELS.length + '</div></div>' +
           '<div class="rec"><div class="rk">累计过关</div><div class="rv">' + r.clears + '</div></div>';
  }
  function renderRecords() {
    const el = document.getElementById("biyRecords");
    if (el) el.innerHTML = recHTML(loadRec());
  }
  // 关卡选择面板里给已通关的关卡打勾并标注最少步数
  function markClearedButtons() {
    const r = loadRec();
    const best = r.bestSteps || {};
    document.querySelectorAll(".lvBtn").forEach((btn, i) => {
      const no = i + 1;
      btn.textContent = (best[no] ? "✅ " : "") + no + ". " + LEVELS[i].name + (best[no] ? "（" + best[no] + " 步）" : "");
    });
  }

  // 键盘
  const KEYMAP = {
    ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") { restart(); e.preventDefault(); return; }
    if (e.key === "z" || e.key === "Z" || e.key === "u" || e.key === "U") { undo(); e.preventDefault(); return; }
    if ((e.key === "n" || e.key === "N" || e.key === " " || e.key === "Enter") && state && state.status === "won") {
      nextLevel(); e.preventDefault(); return;
    }
    const dir = KEYMAP[e.key];
    if (dir) { move(dir); e.preventDefault(); }
  });

  // 触屏滑动
  let ts = null;
  canvas.addEventListener("pointerdown", (e) => { ts = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("pointerup", (e) => {
    if (!ts) return;
    const dx = e.clientX - ts.x, dy = e.clientY - ts.y;
    ts = null;
    if (Math.hypot(dx, dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move({ x: dx > 0 ? 1 : -1, y: 0 });
    else move({ x: 0, y: dy > 0 ? 1 : -1 });
  });

  // 关卡选择
  function buildLevelList() {
    levelList.innerHTML = "";
    LEVELS.forEach((lv, i) => {
      const b = document.createElement("button");
      b.className = "lvBtn";
      b.textContent = (i + 1) + ". " + lv.name;
      b.onclick = () => selectLevel(i);
      levelList.appendChild(b);
    });
  }
  const selPanel = document.getElementById("levelSelect");
  function toggleLevelSelect(force) {
    const show = force !== undefined ? force : selPanel.classList.contains("hidden");
    selPanel.classList.toggle("hidden", !show);
  }
  document.getElementById("btnLevels").onclick = () => toggleLevelSelect();
  document.getElementById("btnRestart").onclick = restart;
  document.getElementById("btnUndo").onclick = undo;
  document.getElementById("btnNext").onclick = () => { if (state && state.status === "won") nextLevel(); };
  document.getElementById("ovNext").onclick = nextLevel;
  document.getElementById("ovRestart").onclick = restart;
  // 方向键按钮（移动端）
  document.getElementById("padUp").onclick = () => move({ x: 0, y: -1 });
  document.getElementById("padDown").onclick = () => move({ x: 0, y: 1 });
  document.getElementById("padLeft").onclick = () => move({ x: -1, y: 0 });
  document.getElementById("padRight").onclick = () => move({ x: 1, y: 0 });

  // 渲染循环（持续绘制以支持脉冲动画）
  function frame(t) {
    if (state) RENDER.draw(ctx, state, canvas, t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  buildLevelList();
  markClearedButtons();
  renderRecords();
  loadLevel(0);
})();
