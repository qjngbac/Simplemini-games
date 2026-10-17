// 俄罗斯方块 Tetris — 纯前端 Canvas 实现
(function () {
  "use strict";

  const cv = document.getElementById("game");
  const ctx = cv.getContext("2d");
  const nextCv = document.getElementById("next");
  const nextCtx = nextCv.getContext("2d");
  const holdCv = document.getElementById("hold");
  const holdCtx = holdCv ? holdCv.getContext("2d") : null;

  const COLS = 10, ROWS = 20;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const CELL = 30;

  // 7 种方块（4x4 / 3x3 矩阵，旋转时整块矩阵一起转，避免"仙人掌"式的错位）
  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
  };
  const COLORS = { I:"#38bdf8", J:"#4c7dff", L:"#f59e0b", O:"#facc15", S:"#5bff9b", T:"#c084fc", Z:"#ff5b6e" };
  const TYPES = Object.keys(SHAPES);
  const LINE_SCORE = [0, 100, 300, 500, 800];

  // ---------- 状态 ----------
  let board = [];        // 已固定的方块：0 = 空，否则为方块类型的字符
  let cur = null;        // 当前下落中的方块
  let nextType = null;   // 下一个
  let holdType = null;   // 暂存方块
  let canHold = true;    // 每次落块限暂存一次
  let bag = [];          // 7-bag 随机袋
  let score = 0, lines = 0, level = 1, state = "menu";   // menu | playing | paused | over
  let acc = 0, last = 0;

  function newBoard() {
    board = [];
    for (let y = 0; y < ROWS; y++) board.push(new Array(COLS).fill(0));
  }

  // 7-bag：保证 7 种方块均匀出现，不会连着来一堆长条（比纯随机的手感好非常多）
  function nextFromBag() {
    if (bag.length === 0) {
      bag = TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  function makePiece(type) {
    const m = SHAPES[type].map(r => r.slice());
    return { type, m, x: Math.floor((COLS - m.length) / 2), y: type === "I" ? -1 : 0 };
  }

  function collide(piece, m, px, py) {
    m = m || piece.m; px = (px === undefined ? piece.x : px); py = (py === undefined ? piece.y : py);
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m[i].length; j++) {
        if (!m[i][j]) continue;
        const bx = px + j, by = py + i;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by < 0) continue;                 // 矩阵上沿还在盘面外，允许
        if (board[by][bx]) return true;
      }
    }
    return false;
  }

  function rotateCW(m) {
    const n = m.length, r = [];
    for (let i = 0; i < n; i++) { r.push(new Array(n).fill(0)); }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) r[i][j] = m[n - 1 - j][i];
    return r;
  }
  function rotateCCW(m) { return rotateCW(rotateCW(rotateCW(m))); }

  // 旋转时允许左右微调（贴墙踢墙），否则贴边的 I / L 会转不动
  function tryRotate(dir) {
    if (!cur) return;
    const m = dir > 0 ? rotateCW(cur.m) : rotateCCW(cur.m);
    for (const dx of [0, -1, 1, -2, 2]) {
      if (!collide(cur, m, cur.x + dx, cur.y)) { cur.m = m; cur.x += dx; return; }
    }
  }

  function move(dx) {
    if (!cur || state !== "playing") return false;
    if (collide(cur, cur.m, cur.x + dx, cur.y)) return false;
    cur.x += dx;
    return true;
  }

  function stepDown() {
    if (!cur || state !== "playing") return false;
    if (collide(cur, cur.m, cur.x, cur.y + 1)) { lockPiece(); return false; }
    cur.y++;
    return true;
  }

  function hardDrop() {
    if (!cur || state !== "playing") return;
    let dist = 0;
    while (!collide(cur, cur.m, cur.x, cur.y + 1)) { cur.y++; dist++; }
    score += dist * 2;         // 直接落地按 2 分/格 奖励
    lockPiece();
  }

  function ghostY() {
    let gy = cur.y;
    while (!collide(cur, cur.m, cur.x, gy + 1)) gy++;
    return gy;
  }

  function lockPiece() {
    const m = cur.m;
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m[i].length; j++) {
        if (!m[i][j]) continue;
        const by = cur.y + i, bx = cur.x + j;
        if (by < 0) { gameOver(); return; }   // 方块锁在盘面上沿之外 = 顶死了
        board[by][bx] = cur.type;
      }
    }
    clearLines();
    spawn();
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(v => v !== 0)) {
        board.splice(y, 1);
        board.unshift(new Array(COLS).fill(0));
        cleared++;
        y++;   // 删掉一行后当前下标会换成新的行，需要再判一次
      }
    }
    if (cleared > 0) {
      lines += cleared;
      score += LINE_SCORE[cleared] * level;
      level = Math.min(15, 1 + Math.floor(lines / 10));
      updateHUD();
    }
  }

  function dropInterval() { return Math.max(70, 800 - (level - 1) * 65); }

  function spawn() {
    cur = makePiece(nextType || nextFromBag());
    nextType = nextFromBag();
    canHold = true;
    drawNext();
    drawHold();
    // 新方块一出生就撞（叠到顶了）→ 结束
    if (collide(cur, cur.m, cur.x, cur.y)) { gameOver(); return; }
    acc = 0;
  }

  // ---------- 本机战绩（localStorage） ----------
  const REC_KEY = "tetris_records";
  let runSubmitted = false;
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function submitRun(run) {
    if (runSubmitted) return loadRec();
    runSubmitted = true;
    const r = loadRec();
    r.runs = (r.runs || 0) + 1;
    r.bestScore = Math.max(r.bestScore || 0, run.score);
    r.bestLevel = Math.max(r.bestLevel || 0, run.level);
    r.bestLines = Math.max(r.bestLines || 0, run.lines);
    r.totalLines = (r.totalLines || 0) + run.lines;
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
    renderRecords();
    return r;
  }
  function submitActiveRun() {
    if (runSubmitted) return;
    if (state !== "playing" && state !== "paused") return;
    if (score <= 0 && lines <= 0) return;
    submitRun({ score, lines, level });
  }
  function updateRecordRealtime() {
    if (score <= 0 && lines <= 0) return;
    const r = loadRec();
    let changed = false;
    if (score > (r.bestScore || 0)) { r.bestScore = score; changed = true; }
    if (lines > (r.bestLines || 0)) { r.bestLines = lines; changed = true; }
    if (level > (r.bestLevel || 1)) { r.bestLevel = level; changed = true; }
    if (changed) {
      try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
      renderRecords();
    }
  }
  function recHTML(r) {
    if (!r || !r.runs) return '<span class="empty">还没有战绩，先来一局</span>';
    return '<div class="rec best"><div class="rk">最高分</div><div class="rv">' + (r.bestScore || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">最高等级</div><div class="rv">' + (r.bestLevel || 1) + '</div></div>' +
           '<div class="rec"><div class="rk">单次消行</div><div class="rv">' + (r.bestLines || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">累计消行</div><div class="rv">' + (r.totalLines || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">局数</div><div class="rv">' + r.runs + '</div></div>';
  }
  function renderRecords() {
    const html = recHTML(loadRec());
    const a = document.getElementById("tetrisRecords");
    const b = document.getElementById("tetrisRecordsOver");
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
  }

  // ---------- HUD / 渲染 ----------
  function updateHUD() {
    document.getElementById("score").textContent = score;
    document.getElementById("level").textContent = level;
    document.getElementById("lines").textContent = lines;
    updateRecordRealtime();
  }

  function resize() {
    const w = COLS * CELL, h = ROWS * CELL;
    cv.width = Math.floor(w * DPR); cv.height = Math.floor(h * DPR);
    // 高度自适应：最多占视口 72%，避免手机上按钮被挤到屏幕外
    const vh = window.innerHeight || 800, vw = window.innerWidth || 480;
    const scale = Math.min(1, (vh - 190) / h, (vw - 40) / w);
    cv.style.width = Math.floor(w * scale) + "px";
    cv.style.height = Math.floor(h * scale) + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    nextCv.width = Math.floor(96 * DPR); nextCv.height = Math.floor(72 * DPR);
    nextCv.style.width = "96px"; nextCv.style.height = "72px";
    nextCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawNext();

    if (holdCv) {
      holdCv.width = Math.floor(96 * DPR); holdCv.height = Math.floor(72 * DPR);
      holdCv.style.width = "96px"; holdCv.style.height = "72px";
      if (holdCtx) holdCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
      drawHold();
    }
  }
  window.addEventListener("resize", resize);

  function drawCell(c, x, y, v, ghost) {
    if (ghost) {
      c.strokeStyle = "rgba(255,255,255,.22)";
      c.lineWidth = 2;
      c.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
      return;
    }
    c.fillStyle = COLORS[v] || "#8ab4ff";
    c.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    c.fillStyle = "rgba(255,255,255,.28)";
    c.fillRect(x + 1, y + 1, CELL - 2, 4);
    c.fillStyle = "rgba(0,0,0,.18)";
    c.fillRect(x + 1, y + CELL - 6, CELL - 2, 4);
  }

  function drawNext() {
    if (!nextType) return;
    nextCtx.clearRect(0, 0, 96, 72);
    const m = SHAPES[nextType];
    const s = 16;
    const ox = (96 - m.length * s) / 2, oy = (72 - m.length * s) / 2;
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m[i].length; j++) {
        if (!m[i][j]) continue;
        nextCtx.fillStyle = COLORS[nextType];
        nextCtx.fillRect(ox + j * s + 1, oy + i * s + 1, s - 2, s - 2);
      }
    }
  }

  function drawHold() {
    if (!holdCtx) return;
    holdCtx.clearRect(0, 0, 96, 72);
    if (!holdType) return;
    const m = SHAPES[holdType];
    const s = 16;
    const ox = (96 - m.length * s) / 2, oy = (72 - m.length * s) / 2;
    holdCtx.globalAlpha = canHold ? 1.0 : 0.45;
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m[i].length; j++) {
        if (!m[i][j]) continue;
        holdCtx.fillStyle = COLORS[holdType];
        holdCtx.fillRect(ox + j * s + 1, oy + i * s + 1, s - 2, s - 2);
      }
    }
    holdCtx.globalAlpha = 1.0;
  }

  function holdPiece() {
    if (!cur || state !== "playing" || !canHold) return;
    canHold = false;
    const prevHold = holdType;
    holdType = cur.type;
    if (prevHold) {
      cur = makePiece(prevHold);
    } else {
      cur = makePiece(nextType || nextFromBag());
      nextType = nextFromBag();
      drawNext();
    }
    acc = 0;
    drawHold();
    if (collide(cur, cur.m, cur.x, cur.y)) { gameOver(); }
  }

  function render() {
    ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);
    ctx.fillStyle = "#0b0e1a";
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    // 网格
    ctx.strokeStyle = "rgba(255,255,255,.05)";
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, ROWS * CELL); ctx.stroke(); }
    for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(COLS * CELL, y * CELL); ctx.stroke(); }

    // 已固定的方块
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (board[y] && board[y][x]) drawCell(ctx, x * CELL, y * CELL, board[y][x], false);
      }
    }

    if (cur && state === "playing") {
      // 落点虚影：先算出"落到底会到哪一行"，玩家才好预判
      const gy = ghostY();
      for (let i = 0; i < cur.m.length; i++) {
        for (let j = 0; j < cur.m[i].length; j++) {
          if (!cur.m[i][j]) continue;
          const by = gy + i, bx = cur.x + j;
          if (by >= 0) drawCell(ctx, bx * CELL, by * CELL, cur.type, true);
        }
      }
      for (let i = 0; i < cur.m.length; i++) {
        for (let j = 0; j < cur.m[i].length; j++) {
          if (!cur.m[i][j]) continue;
          const by = cur.y + i;
          if (by >= 0) drawCell(ctx, (cur.x + j) * CELL, by * CELL, cur.type, false);
        }
      }
    }
  }

  // ---------- 主循环 ----------
  function loop(now) {
    const dt = last ? now - last : 16;
    last = now;
    if (state === "playing") {
      acc += dt;
      const iv = dropInterval();
      // 用 while 而不是 if：切回标签页时 dt 会很大，这里最多补 3 步，避免"瞬移到底"
      let steps = 0;
      while (acc >= iv && steps < 3) { acc -= iv; stepDown(); steps++; }
      if (acc > iv) acc = 0;
    }
    render();
    requestAnimationFrame(loop);
  }

  // ---------- 流程 ----------
  function startGame() {
    if ((state === "playing" || state === "paused") && !runSubmitted && (score > 0 || lines > 0)) {
      submitRun({ score, lines, level });
    }
    runSubmitted = false;
    newBoard();
    bag = []; nextType = nextFromBag(); holdType = null; canHold = true;
    score = 0; lines = 0; level = 1; acc = 0;
    state = "playing";
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("gameover").classList.add("hidden");
    document.getElementById("pause").classList.add("hidden");
    spawn();
    drawHold();
    updatePauseBtn();
    updateHUD();
  }

  function gameOver() {
    if (state === "over") return;
    state = "over";
    updatePauseBtn();
    const rec = submitRun({ score, lines, level });
    document.getElementById("goStats").innerHTML =
      `本局得分 <b>${score}</b><br>消除 <b>${lines}</b> 行 · 到达 <b>${level}</b> 级`;
    document.getElementById("tetrisRecordsOver").innerHTML = recHTML(rec);
    document.getElementById("gameover").classList.remove("hidden");
  }

  function updatePauseBtn() {
    const btn = document.getElementById("pauseBtn");
    if (btn) btn.textContent = state === "paused" ? "▶" : "⏸";
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      updatePauseBtn();
      document.getElementById("pauseStats").textContent = `当前 ${score} 分 · ${lines} 行 · ${level} 级`;
      document.getElementById("pause").classList.remove("hidden");
    } else if (state === "paused") {
      state = "playing"; acc = 0;
      updatePauseBtn();
      document.getElementById("pause").classList.add("hidden");
    }
  }

  // ---------- 输入 ----------
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (state === "menu" || state === "over") {
      if (k === "enter" || k === " ") { startGame(); e.preventDefault(); }
      return;
    }
    if (k === "p" || k === "escape") { togglePause(); e.preventDefault(); return; }
    if (state !== "playing") return;
    if (k === "arrowleft" || k === "a") { move(-1); e.preventDefault(); }
    else if (k === "arrowright" || k === "d") { move(1); e.preventDefault(); }
    else if (k === "arrowup" || k === "x" || k === "w") { tryRotate(1); e.preventDefault(); }
    else if (k === "z") { tryRotate(-1); e.preventDefault(); }
    else if (k === "arrowdown" || k === "s") { if (stepDown()) score += 1; acc = 0; updateHUD(); e.preventDefault(); }
    else if (k === " ") { hardDrop(); updateHUD(); e.preventDefault(); }
    else if (k === "c" || k === "shift") { holdPiece(); e.preventDefault(); }
  });

  // 画布滑动（手机）
  let tsx = null, tsy = null;
  cv.addEventListener("pointerdown", (e) => { tsx = e.clientX; tsy = e.clientY; });
  cv.addEventListener("pointerup", (e) => {
    if (tsx === null) return;
    const dx = e.clientX - tsx, dy = e.clientY - tsy;
    tsx = null;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) { tryRotate(1); return; }
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
    else if (dy > 0) hardDrop();
    else tryRotate(1);
  });

  // 触屏按钮：按住可连发（每 110ms 一次），点一下只动一格会很难受
  const REPEAT = { left: () => move(-1), right: () => move(1), down: () => { if (stepDown()) score += 1; acc = 0; updateHUD(); } };
  document.querySelectorAll(".pad-btn").forEach((btn) => {
    const act = btn.dataset.act;
    let timer = null;
    const fire = () => {
      if (state !== "playing") return;
      if (REPEAT[act]) REPEAT[act]();
      else if (act === "rotate") tryRotate(1);
      else if (act === "drop") { hardDrop(); updateHUD(); }
      else if (act === "hold") holdPiece();
      else if (act === "pause") togglePause();
    };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      fire();
      if (REPEAT[act]) timer = setInterval(fire, 110);
    });
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointercancel", stop);
    btn.addEventListener("pointerleave", stop);
  });

  // 切到后台自动暂停，回来不会"一睁眼就死了"
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") togglePause();
  });

  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("retryBtn").addEventListener("click", startGame);
  document.getElementById("resumeBtn").addEventListener("click", togglePause);
  const pauseBtn = document.getElementById("pauseBtn");
  if (pauseBtn) pauseBtn.addEventListener("click", togglePause);

  document.querySelectorAll(".back-home").forEach((a) => {
    a.addEventListener("click", submitActiveRun);
  });
  window.addEventListener("beforeunload", submitActiveRun);
  window.addEventListener("pagehide", submitActiveRun);

  resize();
  newBoard();
  renderRecords();
  requestAnimationFrame(loop);
})();
