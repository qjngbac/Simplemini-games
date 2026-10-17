// 扫雷 Minesweeper —— 纯前端 DOM 实现
(function () {
  "use strict";

  const LEVELS = {
    easy: { w: 9,  h: 9,  m: 10, name: "初级" },
    mid:  { w: 16, h: 16, m: 40, name: "中级" },
    exp:  { w: 30, h: 16, m: 99, name: "专家" },
  };

  const boardEl = document.getElementById("board");
  let cfg = LEVELS.easy, diff = "easy";
  let cells = [], els = [];
  let state = "menu";          // menu | playing | over | win
  let minesPlaced = false, flags = 0, shownCount = 0;
  let startTime = 0, elapsed = 0, tick = null;
  let flagMode = false;

  // ---------- 棋盘 ----------
  function idx(x, y) { return y * cfg.w + x; }
  function neighbors(i) {
    const x = i % cfg.w, y = (i - x) / cfg.w, out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cfg.w || ny >= cfg.h) continue;
        out.push(idx(nx, ny));
      }
    }
    return out;
  }

  function newGame(d) {
    if (state === "playing" && minesPlaced && shownCount > 0 && !runSubmitted) {
      submitRun(false);
    }
    runSubmitted = false;
    diff = d || diff;
    cfg = LEVELS[diff];
    cells = [];
    els = [];
    flags = 0; shownCount = 0; minesPlaced = false; elapsed = 0; startTime = 0;
    if (tick) { clearInterval(tick); tick = null; }
    state = "playing";

    boardEl.innerHTML = "";
    const cellSize = cfg.w >= 16 ? 22 : 26;
    boardEl.style.gridTemplateColumns = `repeat(${cfg.w}, ${cellSize}px)`;
    // 专家盘与中级盘较宽，整体上小一号
    document.body.classList.toggle("big", cfg.w >= 16);

    for (let i = 0; i < cfg.w * cfg.h; i++) {
      cells.push({ mine: false, near: 0, shown: false, flag: false });
      const el = document.createElement("div");
      el.className = "cell";
      boardEl.appendChild(el);
      els.push(el);
      bindCell(i, el);
    }
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("result").classList.add("hidden");
    document.getElementById("levelName").textContent = cfg.name;
    updateHUD();
  }

  function bindCell(i, el) {
    let lp = null, longFired = false;
    // 左键翻开 / 右键插旗 / 双击数字一键展开
    el.addEventListener("click", () => {
      // 长按插旗之后浏览器还会补一个 click —— 这个 click 不能再把格子翻开，
      // 否则刚插上的旗会被自己那一按立刻翻掉
      if (longFired) { longFired = false; return; }
      if (state !== "playing") return;
      if (flagMode) toggleFlag(i); else reveal(i);
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (state === "playing") toggleFlag(i);
    });
    el.addEventListener("dblclick", () => {
      if (state === "playing") chord(i);
    });

    // 长按 0.4 秒插旗（手机上没有右键）
    el.addEventListener("pointerdown", () => {
      longFired = false;
      lp = setTimeout(() => {
        longFired = true;
        if (state === "playing") toggleFlag(i);
      }, 400);
    });
    const cancel = () => { if (lp) { clearTimeout(lp); lp = null; } };
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
  }

  // 第一次点击后才布雷：保证首点一定不是雷，而且首点周围一圈也是安全的
  // （标准的"first click safe"，否则开局就得靠运气）
  function placeMines(safe) {
    const banned = new Set([safe].concat(neighbors(safe)));
    const pool = [];
    for (let i = 0; i < cells.length; i++) if (!banned.has(i)) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let k = 0; k < Math.min(cfg.m, pool.length); k++) cells[pool[k]].mine = true;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].mine) continue;
      cells[i].near = neighbors(i).filter(n => cells[n].mine).length;
    }
    minesPlaced = true;
  }

  function paint(i) {
    const c = cells[i], el = els[i];
    let cls = "cell";
    let txt = "";
    if (c.flag && !c.shown) { cls += " flag"; txt = "🚩"; }
    else if (c.shown) {
      cls += " shown";
      if (c.mine) { cls += " mine"; txt = "💣"; }
      else if (c.near > 0) { cls += " n" + c.near; txt = String(c.near); }
    }
    // 踩到的那颗雷单独标红
    if (c.boom) cls += " boom";
    el.className = cls;
    el.textContent = txt;
  }

  function updateHUD() {
    document.getElementById("mineLeft").textContent = cfg.m - flags;
    document.getElementById("timer").textContent = fmt(elapsed);
  }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }

  function startTimer() {
    if (tick) return;
    startTime = Date.now();
    tick = setInterval(() => {
      elapsed = (Date.now() - startTime) / 1000;
      updateHUD();
    }, 250);
  }

  function toggleFlag(i) {
    const c = cells[i];
    if (c.shown) return;
    c.flag = !c.flag;
    flags += c.flag ? 1 : -1;
    paint(i);
    updateHUD();
  }

  function reveal(start) {
    const c = cells[start];
    if (c.shown || c.flag) return;
    if (!minesPlaced) { placeMines(start); startTimer(); }

    if (c.mine) { c.boom = true; paint(start); lose(); return; }

    // 空白格（near=0）要自动向外扩散，用显式栈避免递归爆栈
    const stack = [start];
    while (stack.length) {
      const i = stack.pop();
      const cc = cells[i];
      if (cc.shown || cc.flag || cc.mine) continue;
      cc.shown = true;
      shownCount++;
      paint(i);
      if (cc.near === 0) {
        for (const n of neighbors(i)) if (!cells[n].shown && !cells[n].flag) stack.push(n);
      }
    }
    updateHUD();
    checkWin();
  }

  // 数字上双击：周围旗数够了就把其余邻格一次翻开（chord）
  function chord(i) {
    const c = cells[i];
    if (!c.shown || c.near <= 0) return;
    const ns = neighbors(i);
    if (ns.filter(n => cells[n].flag).length !== c.near) return;
    for (const n of ns) if (!cells[n].flag && !cells[n].shown) reveal(n);
  }

  function revealAll() {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].mine) { cells[i].shown = true; paint(i); }
    }
  }

  function checkWin() {
    if (state !== "playing") return;
    if (shownCount === cells.length - cfg.m || shownCount >= cells.length) win();
  }

  function stopTimer() { if (tick) { clearInterval(tick); tick = null; } }

  function lose() {
    state = "over";
    stopTimer();
    revealAll();
    document.getElementById("resultTitle").textContent = "💥 踩雷了";
    document.getElementById("resultStats").innerHTML = `坚持了 <b>${fmt(elapsed)}</b>　翻开 ${shownCount} 格`;
    document.getElementById("minesRecordsOver").innerHTML = recHTML(submitRun(false));
    document.getElementById("result").classList.remove("hidden");
  }

  function win() {
    state = "win";
    stopTimer();
    // 通关自动把剩下的雷都插上旗，方便玩家看结果
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].mine && !cells[i].flag) { cells[i].flag = true; flags++; paint(i); }
    }
    updateHUD();
    document.getElementById("resultTitle").textContent = "🎉 排雷成功！";
    document.getElementById("resultStats").innerHTML = `${cfg.name}用时 <b>${fmt(elapsed)}</b>`;
    document.getElementById("minesRecordsOver").innerHTML = recHTML(submitRun(true));
    document.getElementById("result").classList.remove("hidden");
  }

  // ---------- 本机战绩（localStorage） ----------
  const REC_KEY = "mines_records";
  let runSubmitted = false;
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function submitRun(isWin) {
    if (runSubmitted) return loadRec();
    runSubmitted = true;
    const r = loadRec();
    r.runs = (r.runs || 0) + 1;
    r.wins = (r.wins || 0) + (isWin ? 1 : 0);
    r.best = r.best || {};
    if (isWin) {
      const prev = r.best[diff];
      if (!prev || elapsed < prev) r.best[diff] = Math.floor(elapsed);
    }
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
    renderRecords();
    return r;
  }
  function submitActiveRun() {
    if (runSubmitted) return;
    if (state !== "playing" || !minesPlaced || shownCount <= 0) return;
    submitRun(false);
  }
  function bestText(r, key) {
    const v = (r && r.best && r.best[key]);
    return v == null ? "—" : fmt(v);
  }
  function recHTML(r) {
    if (!r || !r.runs) return '<span class="empty">还没有战绩，先排一局</span>';
    return '<div class="rec best"><div class="rk">通关次数</div><div class="rv">' + (r.wins || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">初级最快</div><div class="rv">' + bestText(r, "easy") + '</div></div>' +
           '<div class="rec"><div class="rk">中级最快</div><div class="rv">' + bestText(r, "mid") + '</div></div>' +
           '<div class="rec"><div class="rk">专家最快</div><div class="rv">' + bestText(r, "exp") + '</div></div>' +
           '<div class="rec"><div class="rk">局数</div><div class="rv">' + r.runs + '</div></div>';
  }
  function renderRecords() {
    const html = recHTML(loadRec());
    const a = document.getElementById("minesRecords");
    const b = document.getElementById("minesRecordsOver");
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
  }

  // ---------- 事件 ----------
  document.querySelectorAll(".diff").forEach((btn) => {
    btn.addEventListener("click", () => newGame(btn.dataset.diff));
  });
  document.getElementById("retryBtn").addEventListener("click", () => newGame());
  document.getElementById("newBtn").addEventListener("click", () => newGame());
  document.getElementById("changeBtn").addEventListener("click", () => {
    state = "menu";
    document.getElementById("result").classList.add("hidden");
    document.getElementById("menu").classList.remove("hidden");
    renderRecords();
  });
  document.getElementById("flagBtn").addEventListener("click", (e) => {
    flagMode = !flagMode;
    e.currentTarget.textContent = "🚩 插旗模式：" + (flagMode ? "开" : "关");
  });

  document.querySelectorAll(".back-home").forEach((a) => {
    a.addEventListener("click", submitActiveRun);
  });
  window.addEventListener("beforeunload", submitActiveRun);
  window.addEventListener("pagehide", submitActiveRun);

  function initBoard() {
    cfg = LEVELS[diff];
    const cellSize = cfg.w >= 16 ? 22 : 26;
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = `repeat(${cfg.w}, ${cellSize}px)`;
    document.body.classList.toggle("big", cfg.w >= 16);
    cells = [];
    els = [];
    for (let i = 0; i < cfg.w * cfg.h; i++) {
      cells.push({ mine: false, near: 0, shown: false, flag: false });
      const el = document.createElement("div");
      el.className = "cell";
      boardEl.appendChild(el);
      els.push(el);
      bindCell(i, el);
    }
    updateHUD();
  }

  initBoard();
  renderRecords();
})();
