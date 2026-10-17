// 贪吃蛇 Snake —— 纯前端 Canvas 实现
(function () {
  "use strict";

  const cv = document.getElementById("game");
  const ctx = cv.getContext("2d");

  const GRID = 20;                 // 20×20 格
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let CELL = 24;

  let snake = [], dir = { x: 1, y: 0 }, pending = [];
  let food = null, bonus = null, bonusLeft = 0;
  let score = 0, elapsed = 0, tickAcc = 0, state = "menu";   // menu | playing | paused | over
  let growCount = 0, apples = 0;

  function updatePauseBtn() {
    const btn = document.getElementById("pauseBtn");
    if (btn) btn.textContent = state === "paused" ? "▶" : "⏸";
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      updatePauseBtn();
    } else if (state === "paused") {
      state = "playing";
      updatePauseBtn();
    }
  }

  // ---------- 画布 ----------
  function resize() {
    const vw = window.innerWidth || 480, vh = window.innerHeight || 800;
    // 画布要同时塞进宽度和"扣掉 HUD 与方向键"的高度里
    CELL = Math.max(12, Math.floor(Math.min((vw - 36) / GRID, (vh - 240) / GRID)));
    const px = GRID * CELL;
    cv.width = Math.floor(px * DPR); cv.height = Math.floor(px * DPR);
    cv.style.width = px + "px"; cv.style.height = px + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);

  // ---------- 逻辑 ----------
  function freeCell() {
    // 随机找空格；蛇很长时最多试 300 次，实在找不到就从头扫一遍（保证不会卡死）
    for (let t = 0; t < 300; t++) {
      const x = Math.floor(Math.random() * GRID), y = Math.floor(Math.random() * GRID);
      if (!snake.some(s => s.x === x && s.y === y) && !(food && food.x === x && food.y === y)) return { x, y };
    }
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!snake.some(s => s.x === x && s.y === y)) return { x, y };
      }
    }
    return null;
  }

  function newGame() {
    if ((state === "playing" || state === "paused") && !runSubmitted && (score > 0 || snake.length > 3)) {
      submitRun();
    }
    runSubmitted = false;
    snake = [
      { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 },
    ];
    dir = { x: 1, y: 0 };
    pending = [];
    score = 0; elapsed = 0; tickAcc = 0; bonus = null; bonusLeft = 0;
    growCount = 0; apples = 0;
    food = freeCell();
    state = "playing";
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("gameover").classList.add("hidden");
    updatePauseBtn();
    updateHUD();
  }

  function stepInterval() {
    // 越长越快，但有下限，避免后期完全反应不过来
    return Math.max(75, 145 - (snake.length - 3) * 3);
  }

  function turn(nx, ny) {
    // 不能直接掉头：先把方向放进队列，等这一 tick 走完再生效。
    // 少了这层，同一帧里连按两下（比如 ↑ 再 ↓）就会让蛇自己撞上第二节。
    const last = pending.length ? pending[pending.length - 1] : dir;
    if (last.x === -nx && last.y === -ny) return;
    if (last.x === nx && last.y === ny) return;
    if (pending.length > 2) return;
    pending.push({ x: nx, y: ny });
  }

  function step() {
    if (pending.length) dir = pending.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) { gameOver("撞到墙了"); return; }
    // 尾巴那一节这一拍会让开，所以平时只检查到倒数第二节；
    // 但这一拍要是吃到东西（身体变长、尾巴不动），尾巴格就不能当成安全格了。
    const willGrow = (food && head.x === food.x && head.y === food.y) ||
                     (bonus && head.x === bonus.x && head.y === bonus.y);
    const limit = willGrow ? snake.length : snake.length - 1;
    for (let i = 0; i < limit; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) { gameOver("咬到自己了"); return; }
    }

    snake.unshift(head);

    if (bonus && head.x === bonus.x && head.y === bonus.y) {
      score += 50;
      for (let i = 0; i < 3; i++) grow();
      bonus = null; bonusLeft = 0;
    } else if (food && head.x === food.x && head.y === food.y) {
      score += 10;
      apples++;
      food = freeCell();
      // 每吃 5 个苹果刷一次限时奖励（按吃的个数记，不靠分数取模：
      // 吃到 ⭐ 后分数会 +50，用 score % 50 判断会漏掉很多次）
      if (apples % 5 === 0) { bonus = freeCell(); bonusLeft = 8; }
    } else {
      snake.pop();
    }
    updateHUD();
  }

  // 长身体：在尾巴后面补一节（尾巴不动，下一拍视觉上就是"变长"）
  function grow() { growCount++; }

  function tickGame(dt) {
    elapsed += dt;
    if (bonusLeft > 0) {
      bonusLeft -= dt;
      if (bonusLeft <= 0) bonus = null;
    }
    tickAcc += dt * 1000;
    while (tickAcc >= stepInterval()) {
      tickAcc -= stepInterval();
      step();
      if (state !== "playing") return;
      // 上一拍攒下的增长在这里兑现
      while (growCount > 0 && state === "playing") {
        growCount--;
        const t = snake[snake.length - 1];
        snake.push({ x: t.x, y: t.y });
      }
    }
  }

  // ---------- 渲染 ----------
  function render() {
    const px = GRID * CELL;
    ctx.clearRect(0, 0, px, px);
    ctx.fillStyle = "#0d1a12";
    ctx.fillRect(0, 0, px, px);

    ctx.strokeStyle = "rgba(255,255,255,.045)";
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, px); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(px, i * CELL); ctx.stroke();
    }

    // 身体
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      ctx.fillStyle = i === 0 ? "#c6ffdb" : (i % 2 ? "#4ade80" : "#22c55e");
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    }
    // 眼睛
    if (snake.length) {
      ctx.fillStyle = "#0d1a12";
      const h = snake[0];
      const ex = h.x * CELL + CELL / 2, ey = h.y * CELL + CELL / 2;
      ctx.fillRect(ex + dir.x * 3 - 3, ey + dir.y * 3 - 3, 3, 3);
      ctx.fillRect(ex + dir.x * 3 + 2, ey + dir.y * 3 - 3, 3, 3);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = Math.floor(CELL * 0.8) + "px sans-serif";
    if (food) ctx.fillText("🍎", food.x * CELL + CELL / 2, food.y * CELL + CELL / 2);
    if (bonus) ctx.fillText("⭐", bonus.x * CELL + CELL / 2, bonus.y * CELL + CELL / 2);

    if (state === "paused") {
      ctx.fillStyle = "rgba(10, 15, 20, 0.78)";
      ctx.fillRect(0, 0, px, px);
      ctx.fillStyle = "#5bff9b";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("游戏已暂停", px / 2, px / 2 - 12);
      ctx.fillStyle = "#9aa6d6";
      ctx.font = "13px sans-serif";
      ctx.fillText("按 P 或点击画面继续", px / 2, px / 2 + 16);
    }
  }

  function updateHUD() {
    document.getElementById("score").textContent = score;
    document.getElementById("len").textContent = snake.length;
    const s = Math.floor(elapsed);
    document.getElementById("timer").textContent =
      String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    updateRecordRealtime();
  }

  // ---------- 结束 / 战绩 ----------
  const REC_KEY = "snake_records";
  let runSubmitted = false;
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function submitRun() {
    if (runSubmitted) return loadRec();
    runSubmitted = true;
    const r = loadRec();
    r.runs = (r.runs || 0) + 1;
    r.bestScore = Math.max(r.bestScore || 0, score);
    r.bestLen = Math.max(r.bestLen || 0, snake.length);
    r.bestTime = Math.max(r.bestTime || 0, Math.floor(elapsed));
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
    renderRecords();
    return r;
  }
  function submitActiveRun() {
    if (runSubmitted) return;
    if (state !== "playing" && state !== "paused") return;
    if (score <= 0 && snake.length <= 3) return;
    submitRun();
  }
  function updateRecordRealtime() {
    if (score <= 0 && snake.length <= 3) return;
    const r = loadRec();
    let changed = false;
    if (score > (r.bestScore || 0)) { r.bestScore = score; changed = true; }
    if (snake.length > (r.bestLen || 0)) { r.bestLen = snake.length; changed = true; }
    if (Math.floor(elapsed) > (r.bestTime || 0)) { r.bestTime = Math.floor(elapsed); changed = true; }
    if (changed) {
      try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
      renderRecords();
    }
  }
  function fmt(sec) {
    sec = Math.floor(sec);
    return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }
  function recHTML(r) {
    if (!r || !r.runs) return '<span class="empty">还没有战绩，先吃一口</span>';
    return '<div class="rec best"><div class="rk">最高分</div><div class="rv">' + (r.bestScore || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">最长</div><div class="rv">' + (r.bestLen || 0) + ' 节</div></div>' +
           '<div class="rec"><div class="rk">最久</div><div class="rv">' + fmt(r.bestTime || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">局数</div><div class="rv">' + r.runs + '</div></div>';
  }
  function renderRecords() {
    const html = recHTML(loadRec());
    const a = document.getElementById("snakeRecords");
    const b = document.getElementById("snakeRecordsOver");
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
  }

  function gameOver(reason) {
    if (state === "over") return;
    state = "over";
    updatePauseBtn();
    const rec = submitRun();
    document.getElementById("goStats").innerHTML =
      `${reason}<br>得分 <b>${score}</b>　长度 <b>${snake.length}</b>　存活 <b>${fmt(elapsed)}</b>`;
    document.getElementById("snakeRecordsOver").innerHTML = recHTML(rec);
    document.getElementById("gameover").classList.remove("hidden");
  }

  // ---------- 主循环 ----------
  let last = 0;
  function loop(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (state === "playing") { tickGame(dt); updateHUD(); }
    render();
    requestAnimationFrame(loop);
  }

  // ---------- 输入 ----------
  const KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  };
  window.addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (state === "playing" || state === "paused") {
      if (k === "p" || e.key === "Escape") {
        togglePause();
        e.preventDefault();
        return;
      }
    }
    if (state === "paused") return;
    if (state !== "playing") {
      if (k === " " || e.key === "Enter") newGame();
      return;
    }
    const d = KEYS[e.key] || KEYS[k];
    if (d) { turn(d[0], d[1]); e.preventDefault(); }
  });

  // 画布点击（暂停时点击继续）
  cv.addEventListener("click", () => {
    if (state === "paused") togglePause();
  });

  // 失焦自动暂停，防止切换标签页导致蛇撞墙
  window.addEventListener("blur", () => {
    if (state === "playing") togglePause();
  });

  // 滑动
  let sx = null, sy = null;
  cv.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
  cv.addEventListener("pointerup", (e) => {
    if (sx === null || state !== "playing") return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0);
    else turn(0, dy > 0 ? 1 : -1);
  });

  const PAD = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  document.querySelectorAll(".pad-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state !== "playing") return;
      const d = PAD[btn.dataset.act];
      if (d) turn(d[0], d[1]);
    });
  });

  document.getElementById("startBtn").addEventListener("click", newGame);
  document.getElementById("retryBtn").addEventListener("click", newGame);
  const pBtn = document.getElementById("pauseBtn");
  if (pBtn) pBtn.addEventListener("click", togglePause);

  document.querySelectorAll(".back-home").forEach((a) => {
    a.addEventListener("click", submitActiveRun);
  });
  window.addEventListener("beforeunload", submitActiveRun);
  window.addEventListener("pagehide", submitActiveRun);

  resize();
  renderRecords();
  requestAnimationFrame(loop);
})();
