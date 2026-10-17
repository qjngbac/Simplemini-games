// 2048 —— 纯前端 DOM 实现
(function () {
  "use strict";

  const N = 4;
  const boardEl = document.getElementById("board");
  let cells = [];       // DOM 元素，索引 = y*N + x
  let grid = [];        // 数字，0 表示空格
  let score = 0, bestTile = 0, won = false, over = false;
  let prev = null;      // 一步撤销的快照
  let runSubmitted = false;
  let hasMoved = false;

  // ---------- 构建 ----------
  function build() {
    boardEl.innerHTML = "";
    cells = [];
    for (let i = 0; i < N * N; i++) {
      const el = document.createElement("div");
      el.className = "cell";
      boardEl.appendChild(el);
      cells.push(el);
    }
  }

  function emptyIndexes() {
    const out = [];
    for (let i = 0; i < grid.length; i++) if (!grid[i]) out.push(i);
    return out;
  }

  // 90% 出 2、10% 出 4（和原版一致，出 4 的概率太高会明显变难）
  function spawn() {
    const empty = emptyIndexes();
    if (!empty.length) return;
    const i = empty[Math.floor(Math.random() * empty.length)];
    grid[i] = Math.random() < 0.9 ? 2 : 4;
  }

  function render(anim) {
    let max = 0;
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i], el = cells[i];
      el.textContent = v ? String(v) : "";
      let cls = "cell";
      if (v) {
        cls += " t" + v;
        if (v > 2048) cls += " big";
        if (anim) {
          if (anim.slideMap && anim.slideMap.has(i)) cls += " " + anim.slideMap.get(i);
          if (anim.mergedSet && anim.mergedSet.has(i)) cls += " merged";
          if (anim.newIdx === i) cls += " new";
        }
      }
      el.className = cls;
      if (v > max) max = v;
    }
    if (max > bestTile) bestTile = max;
    document.getElementById("score").textContent = score;
    document.getElementById("bestTile").textContent = bestTile;
    updateRecordRealtime();
  }

  // ---------- 移动 ----------
  // 把每一行/列按"行进方向"抽成数组，压缩 → 合并 → 再压缩，最后写回。
  // 抽坐标而不是抽值，写回时才知道该改哪几格。
  function lineCoords(dir, k) {
    const out = [];
    for (let i = 0; i < N; i++) {
      let x, y;
      if (dir === "left")  { x = i; y = k; }
      if (dir === "right") { x = N - 1 - i; y = k; }
      if (dir === "up")    { x = k; y = i; }
      if (dir === "down")  { x = k; y = N - 1 - i; }
      out.push(y * N + x);
    }
    return out;
  }

  function canMove() {
    if (emptyIndexes().length) return true;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = grid[y * N + x];
        if (x + 1 < N && grid[y * N + x + 1] === v) return true;
        if (y + 1 < N && grid[(y + 1) * N + x] === v) return true;
      }
    }
    return false;
  }

  function move(dir) {
    if (over) return false;
    const snapshot = { grid: grid.slice(), score, bestTile };
    let moved = false, gained = 0;
    const slideMap = new Map();
    const mergedSet = new Set();
    const dirPrefix = {
      left: "slide-r",
      right: "slide-l",
      up: "slide-d",
      down: "slide-u"
    }[dir];

    for (let k = 0; k < N; k++) {
      const coords = lineCoords(dir, k);
      const nonZeros = [];
      for (let i = 0; i < N; i++) {
        if (grid[coords[i]] !== 0) {
          nonZeros.push({ val: grid[coords[i]], pos: i });
        }
      }

      const out = [];
      let targetPos = 0;
      for (let i = 0; i < nonZeros.length; i++) {
        const cur = nonZeros[i];
        if (i + 1 < nonZeros.length && cur.val === nonZeros[i + 1].val) {
          const next = nonZeros[i + 1];
          const mergedVal = cur.val * 2;
          out.push(mergedVal);
          gained += mergedVal;
          const targetCoord = coords[targetPos];
          mergedSet.add(targetCoord);
          const maxDist = Math.max(cur.pos - targetPos, next.pos - targetPos);
          if (maxDist > 0) {
            slideMap.set(targetCoord, dirPrefix + maxDist);
          }
          i++;
          targetPos++;
        } else {
          out.push(cur.val);
          const targetCoord = coords[targetPos];
          const dist = cur.pos - targetPos;
          if (dist > 0) {
            slideMap.set(targetCoord, dirPrefix + dist);
          }
          targetPos++;
        }
      }
      while (out.length < N) out.push(0);

      for (let i = 0; i < N; i++) {
        if (grid[coords[i]] !== out[i]) moved = true;
        grid[coords[i]] = out[i];
      }
    }

    if (!moved) return false;
    hasMoved = true;
    prev = snapshot;
    score += gained;
    const emptyBefore = emptyIndexes();
    spawn();
    const newIdx = emptyBefore.find(i => grid[i]);
    render({ newIdx, slideMap, mergedSet });
    if (!won && grid.some(v => v >= 2048)) { won = true; showWin(); }
    if (!canMove()) gameOver();
    return true;
  }

  function undo() {
    if (!prev) return;
    grid = prev.grid.slice();
    score = prev.score;
    bestTile = prev.bestTile;
    prev = null;
    over = false;
    document.getElementById("gameover").classList.add("hidden");
    render();
  }

  // ---------- 结束 / 战绩 ----------
  function showWin() {
    document.getElementById("win").classList.remove("hidden");
  }

  function gameOver() {
    over = true;
    const rec = submitRun();
    document.getElementById("goStats").innerHTML =
      `本局 <b>${score}</b> 分　最大方块 <b>${bestTile}</b>`;
    document.getElementById("g2048RecordsOver").innerHTML = recHTML(rec);
    document.getElementById("gameover").classList.remove("hidden");
  }

  const REC_KEY = "g2048_records";
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function submitRun() {
    if (runSubmitted) return loadRec();
    if (!hasMoved && score === 0) return loadRec();
    runSubmitted = true;
    const r = loadRec();
    r.runs = (r.runs || 0) + 1;
    r.bestScore = Math.max(r.bestScore || 0, score);
    r.bestTile = Math.max(r.bestTile || 0, bestTile);
    r.wins = (r.wins || 0) + (bestTile >= 2048 ? 1 : 0);
    try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
    renderRecords();
    return r;
  }
  function submitActiveRun() {
    if (runSubmitted) return;
    if (!hasMoved && score === 0) return;
    submitRun();
  }
  function updateRecordRealtime() {
    if (score <= 0 && bestTile <= 2) return;
    const r = loadRec();
    let changed = false;
    if (score > (r.bestScore || 0)) { r.bestScore = score; changed = true; }
    if (bestTile > (r.bestTile || 0)) { r.bestTile = bestTile; changed = true; }
    if (bestTile >= 2048 && !r.wins) { r.wins = 1; changed = true; }
    if (changed) {
      try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
      renderRecords();
    }
  }
  function recHTML(r) {
    if (!r || !r.runs) return '<span class="empty">还没有战绩，先合一把</span>';
    return '<div class="rec best"><div class="rk">最高分</div><div class="rv">' + (r.bestScore || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">最大方块</div><div class="rv">' + (r.bestTile || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">达成 2048</div><div class="rv">' + (r.wins || 0) + '</div></div>' +
           '<div class="rec"><div class="rk">局数</div><div class="rv">' + r.runs + '</div></div>';
  }
  function renderRecords() {
    const html = recHTML(loadRec());
    const a = document.getElementById("g2048Records");
    if (a) a.innerHTML = html;
  }

  // ---------- 输入 ----------
  const KEY_DIR = {
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
    a: "left", d: "right", w: "up", s: "down",
  };
  window.addEventListener("keydown", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "z") { undo(); return; }
    const dir = KEY_DIR[e.key] || KEY_DIR[k];
    if (dir) { move(dir); e.preventDefault(); }
  });

  // 屏幕滑动
  let sx = null, sy = null;
  boardEl.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
  boardEl.addEventListener("pointerup", (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
    else move(dy > 0 ? "down" : "up");
  });

  // ---------- 流程 ----------
  function newGame() {
    if (hasMoved && !runSubmitted && (score > 0 || bestTile > 2)) {
      submitRun();
    }
    runSubmitted = false;
    hasMoved = false;
    grid = new Array(N * N).fill(0);
    score = 0; bestTile = 0; won = false; over = false; prev = null;
    document.getElementById("gameover").classList.add("hidden");
    document.getElementById("win").classList.add("hidden");
    spawn(); spawn();
    render();
    renderRecords();
  }

  document.getElementById("newBtn").addEventListener("click", newGame);
  document.getElementById("winNewBtn").addEventListener("click", newGame);
  document.getElementById("retryBtn").addEventListener("click", newGame);
  document.getElementById("undoBtn").addEventListener("click", undo);
  const overUndo = document.getElementById("overUndoBtn");
  if (overUndo) overUndo.addEventListener("click", undo);
  document.getElementById("continueBtn").addEventListener("click", () => {
    document.getElementById("win").classList.add("hidden");
  });

  document.querySelectorAll(".back-home").forEach((a) => {
    a.addEventListener("click", submitActiveRun);
  });
  window.addEventListener("beforeunload", submitActiveRun);
  window.addEventListener("pagehide", submitActiveRun);

  build();
  newGame();
})();
