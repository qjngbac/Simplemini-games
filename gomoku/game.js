// 五子棋 · 人机对战 —— 纯前端 Canvas 实现
(function () {
  "use strict";

  const cv = document.getElementById("game");
  const ctx = cv.getContext("2d");

  const N = 15;                 // 15×15 棋盘
  const PAD = 22, CELL = 34;    // 逻辑坐标：边距 + 每格大小
  const SIZE = PAD * 2 + CELL * (N - 1);
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  const HUMAN = 1, AI = 2;
  let board = [];               // 0 空 / 1 玩家 / 2 电脑
  let history = [];             // 每步 {x,y,who}，用于悔棋
  let turn = HUMAN, running = false, hard = true;
  let lastMove = null, winLine = null;

  function setupCanvas() {
    cv.width = Math.floor(SIZE * DPR); cv.height = Math.floor(SIZE * DPR);
    // 逻辑尺寸固定，用 CSS 缩放到屏幕宽度，点击坐标再按同样比例反算
    const vw = window.innerWidth || 480;
    const scale = Math.min(1, (vw - 36) / SIZE);
    cv.style.width = Math.floor(SIZE * scale) + "px";
    cv.style.height = Math.floor(SIZE * scale) + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // ---------- 规则 ----------
  function inside(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
  function at(x, y) { return inside(x, y) ? board[y * N + x] : -1; }

  function winAt(x, y, who) {
    for (const [dx, dy] of DIRS) {
      const line = [[x, y]];
      for (let i = 1; i < N; i++) {          // 正方向
        const nx = x + dx * i, ny = y + dy * i;
        if (at(nx, ny) !== who) break;
        line.push([nx, ny]);
      }
      for (let i = 1; i < N; i++) {          // 反方向（用 unshift 保持顺序，方便画连线）
        const nx = x - dx * i, ny = y - dy * i;
        if (at(nx, ny) !== who) break;
        line.unshift([nx, ny]);
      }
      if (line.length >= 5) return line;
    }
    return null;
  }

  // ---------- 电脑 AI ----------
  // 思路：对每个候选空位算两笔账 —— 自己下在这能形成什么形状（进攻），
  // 对手下在这会形成什么形状（防守），取 attack + defence×权重 最大的点。
  // 成 5 的分值极高，所以"能赢就直接赢、对手要赢就一定先堵"是自然结果。
  function shapeScore(run, open) {
    if (run >= 5) return 1000000;
    if (run === 4) return open >= 2 ? 50000 : 12000;   // 活四 / 冲四
    if (run === 3) return open >= 2 ? 8000 : 600;      // 活三 / 眠三
    if (run === 2) return open >= 2 ? 800 : 90;
    if (run === 1) return open >= 2 ? 60 : 8;
    return 0;
  }

  function evalPoint(x, y, who) {
    let total = 0, threes = 0, fours = 0, fives = 0;
    for (const [dx, dy] of DIRS) {
      let run = 1, openA = false, openB = false, i;
      for (i = 1; inside(x + dx * i, y + dy * i) && at(x + dx * i, y + dy * i) === who; i++) run++;
      if (inside(x + dx * i, y + dy * i) && at(x + dx * i, y + dy * i) === 0) openA = true;
      for (i = 1; inside(x - dx * i, y - dy * i) && at(x - dx * i, y - dy * i) === who; i++) run++;
      if (inside(x - dx * i, y - dy * i) && at(x - dx * i, y - dy * i) === 0) openB = true;
      const opens = (openA ? 1 : 0) + (openB ? 1 : 0);
      const sc = shapeScore(run, opens);
      total += sc;
      if (run >= 5) fives++;
      else if (run === 4) fours++;
      else if (run === 3 && opens >= 2) threes++;
    }
    return { total, threes, fours, fives };
  }

  function hasNeighbor(x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        if (at(x + dx, y + dy) !== 0) return true;
      }
    }
    return false;
  }

  function aiMove() {
    const opp = HUMAN;
    let best = null, bestScore = -1;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (at(x, y) !== 0) continue;
        // 只考虑已有棋子附近两圈，既省算力也避免"跑到角落下子"
        if (history.length && !hasNeighbor(x, y)) continue;

        const atk = evalPoint(x, y, AI);
        const def = evalPoint(x, y, opp);
        const centerBias = 8 - (Math.abs(x - 7) + Math.abs(y - 7)) * 0.6;
        let s = 0;

        if (hard) {
          // 困难模式（高手水平）：
          // 1. 进攻杀着：双活三、冲四活三、双冲四必胜组合重度加权
          let atkBonus = 0;
          if (atk.threes >= 2) atkBonus += 35000;                       // 双活三（绝杀）
          if (atk.fours >= 1 && atk.threes >= 1) atkBonus += 45000;     // 冲四活三（必胜）
          if (atk.fours >= 2) atkBonus += 40000;                        // 双冲四

          // 2. 防守封堵：双三、四三预判封堵，活三严防死守
          let defBonus = 0;
          if (def.threes >= 2) defBonus += 30000;                       // 截断玩家双活三
          if (def.fours >= 1 && def.threes >= 1) defBonus += 35000;     // 截断玩家四三

          s = (atk.total + atkBonus) + (def.total + defBonus) * 1.05 + centerBias;
        } else {
          // 普通模式（休闲新手）：
          // “会挡，但看得近”：只紧急封堵直接成五与连四（活四/冲四），
          // 对活三不提前布防（权重极弱），更专注于自己眼前的连子进攻，给玩家留下做活三、双三的破绽与赢棋空间
          let defScore = 0;
          if (def.fives >= 1) {
            defScore = 1000000;             // 对方五连绝杀，必堵
          } else if (def.fours >= 1) {
            defScore = 20000;               // 对方冲四/活四，会堵（看得近）
          } else {
            defScore = def.total * 0.05;    // 活三及以下防守极其迟钝，留出明显破绽
          }
          s = atk.total + defScore + centerBias;
        }

        if (s > bestScore) { bestScore = s; best = { x, y }; }
      }
    }
    if (!best) best = { x: 7, y: 7 };
    return best;
  }

  // ---------- 渲染 ----------
  function render() {
    ctx.fillStyle = "#d9b382";
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.strokeStyle = "rgba(70,45,20,.75)";
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      ctx.beginPath();
      ctx.moveTo(PAD, PAD + i * CELL); ctx.lineTo(PAD + (N - 1) * CELL, PAD + i * CELL);
      ctx.moveTo(PAD + i * CELL, PAD); ctx.lineTo(PAD + i * CELL, PAD + (N - 1) * CELL);
      ctx.stroke();
    }
    // 天元与四个星位
    ctx.fillStyle = "rgba(70,45,20,.85)";
    for (const [sx, sy] of [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]]) {
      ctx.beginPath(); ctx.arc(PAD + sx * CELL, PAD + sy * CELL, 3.2, 0, 6.283); ctx.fill();
    }

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = at(x, y);
        if (v) drawStone(PAD + x * CELL, PAD + y * CELL, v, lastMove && lastMove.x === x && lastMove.y === y);
      }
    }

    if (winLine) {
      ctx.strokeStyle = "#ff3b3b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      const a = winLine[0], b = winLine[winLine.length - 1];
      ctx.moveTo(PAD + a[0] * CELL, PAD + a[1] * CELL);
      ctx.lineTo(PAD + b[0] * CELL, PAD + b[1] * CELL);
      ctx.stroke();
    }
  }

  function drawStone(cx, cy, who, isLast) {
    const r = CELL * 0.44;
    const g = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, r);
    if (who === HUMAN) { g.addColorStop(0, "#6b7280"); g.addColorStop(1, "#111318"); }
    else { g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#c3c8d4"); }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.stroke();
    if (isLast) {
      ctx.strokeStyle = "#ff3b5b"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, 6.283); ctx.stroke();
      ctx.fillStyle = "#ff3b5b";
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 6.283); ctx.fill();
    }
  }

  // ---------- HUD ----------
  function coordText(p) {
    if (!p) return "—";
    return "ABCDEFGHIJKLMNO".charAt(p.x) + (p.y + 1);
  }
  function updateHUD() {
    document.getElementById("status").textContent =
      !running ? "未开始" : (turn === HUMAN ? "轮到你" : "电脑思考中…");
    const el = document.getElementById("lastMove");
    const mine = [...history].reverse().find(h => h.who === HUMAN);
    const its = [...history].reverse().find(h => h.who === AI);
    el.textContent = "最近落子　你：" + coordText(mine) + "　电脑：" + coordText(its);
  }

  // ---------- 流程 ----------
  let runSubmitted = false;
  function newGame(d) {
    if (running && history.length >= 2 && !runSubmitted) {
      submitRun(false);
    }
    runSubmitted = false;
    if (d) hard = (d === "hard");
    board = new Array(N * N).fill(0);
    history = [];
    lastMove = null; winLine = null;
    turn = HUMAN;
    running = true;
    document.getElementById("menu").classList.add("hidden");
    document.getElementById("over").classList.add("hidden");
    document.getElementById("levelName").textContent = hard ? "困难" : "普通";
    updateHUD();
    render();
  }

  function place(x, y, who) {
    board[y * N + x] = who;
    history.push({ x, y, who });
    lastMove = { x, y };
    updateHUD();
    render();

    const w = winAt(x, y, who);
    if (w) {
      winLine = w;
      render();
      // 电脑赢时（或玩家赢时），先将落子和五连线完整绘制在棋盘上，留足时间给玩家看清位置
      setTimeout(() => {
        endGame(who === HUMAN);
      }, who === AI ? 800 : 400);
      return true;
    }
    if (history.length === N * N) {
      setTimeout(() => { endGame(null); }, 400);
      return true;
    }
    return false;
  }

  function endGame(humanWin) {
    running = false;
    const title = document.getElementById("overTitle");
    const stats = document.getElementById("overStats");
    if (humanWin === null) title.textContent = "和棋";
    else if (humanWin) title.textContent = "🎉 你赢了！";
    else title.textContent = "电脑赢了…";
    const moves = Math.ceil(history.length / 2);
    stats.innerHTML = `共 <b>${moves}</b> 回合　难度：${hard ? "困难" : "普通"}`;
    document.getElementById("gomokuRecordsOver").innerHTML = recHTML(submitRun(humanWin));
    document.getElementById("over").classList.remove("hidden");
    updateHUD();
  }

  function playerMove(x, y) {
    if (!running || turn !== HUMAN || at(x, y) !== 0) return;
    if (place(x, y, HUMAN)) return;
    turn = AI;
    updateHUD();
    render();
    // 稍微延后一下再下，让玩家看清自己刚落的子
    setTimeout(() => {
      if (!running) return;
      const mv = aiMove();
      const ended = place(mv.x, mv.y, AI);
      if (!ended && running) turn = HUMAN;
      updateHUD();
      render();
    }, 220);
  }

  function undoStep() {
    if (turn !== HUMAN && running) return;
    if (history.length < 1) return;
    if (!running) {
      document.getElementById("over").classList.add("hidden");
      running = true;
    }
    const toPop = (history.length > 0 && history[history.length - 1].who === HUMAN) ? 1 : 2;
    for (let i = 0; i < toPop && history.length; i++) {
      const h = history.pop();
      board[h.y * N + h.x] = 0;
    }
    winLine = null;
    turn = HUMAN;
    lastMove = history.length ? history[history.length - 1] : null;
    updateHUD();
    render();
  }

  // ---------- 本机战绩（localStorage） ----------
  const REC_KEY = "gomoku_records";
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function submitRun(humanWin) {
    if (runSubmitted) return loadRec();
    runSubmitted = true;
    const r = loadRec();
    r.runs = (r.runs || 0) + 1;
    if (humanWin === true) {
      r.wins = (r.wins || 0) + 1;
      const mv = Math.ceil(history.length / 2);
      r.fastest = r.fastest ? Math.min(r.fastest, mv) : mv;
    } else if (humanWin === false) r.losses = (r.losses || 0) + 1;
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
    renderRecords();
    return r;
  }
  function submitActiveRun() {
    if (runSubmitted || !running || history.length < 2) return;
    submitRun(false);
  }
  function recHTML(r) {
    if (!r || !r.runs) return '<span class="empty">还没有战绩，先下一盘</span>';
    return '<div class="rec best"><div class="rk">胜</div><div class="rv">' + (r.wins || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">负</div><div class="rv">' + (r.losses || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">最快获胜</div><div class="rv">' + (r.fastest ? r.fastest + " 回合" : "—") + '</div></div>' +
           '<div class="rec"><div class="rk">局数</div><div class="rv">' + r.runs + '</div></div>';
  }
  function renderRecords() {
    const html = recHTML(loadRec());
    const a = document.getElementById("gomokuRecords");
    const b = document.getElementById("gomokuRecordsOver");
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
  }

  // ---------- 输入 ----------
  function toGrid(clientX, clientY) {
    const r = cv.getBoundingClientRect();
    const sx = SIZE / (r.width || SIZE), sy = SIZE / (r.height || SIZE);
    const gx = Math.round(((clientX - r.left) * sx - PAD) / CELL);
    const gy = Math.round(((clientY - r.top) * sy - PAD) / CELL);
    return { x: gx, y: gy };
  }
  cv.addEventListener("pointerdown", (e) => {
    if (!running || turn !== HUMAN) return;
    const g = toGrid(e.clientX, e.clientY);
    if (!inside(g.x, g.y)) return;
    playerMove(g.x, g.y);
  });

  document.querySelectorAll(".diff").forEach((btn) => {
    btn.addEventListener("click", () => newGame(btn.dataset.diff));
  });
  document.getElementById("newBtn").addEventListener("click", () => newGame());
  document.getElementById("againBtn").addEventListener("click", () => newGame());
  document.getElementById("undoBtn").addEventListener("click", undoStep);
  const undoOverBtn = document.getElementById("undoOverBtn");
  if (undoOverBtn) undoOverBtn.addEventListener("click", undoStep);
  document.getElementById("backBtn").addEventListener("click", () => {
    running = false;
    document.getElementById("over").classList.add("hidden");
    document.getElementById("menu").classList.remove("hidden");
    renderRecords();
    updateHUD();
  });

  document.querySelectorAll(".back-home").forEach((a) => {
    a.addEventListener("click", submitActiveRun);
  });
  window.addEventListener("beforeunload", submitActiveRun);
  window.addEventListener("pagehide", submitActiveRun);

  window.addEventListener("resize", () => { setupCanvas(); render(); });

  setupCanvas();
  renderRecords();
  render();
})();
