// Wordle 猜词 — 纯前端实现
(function () {
  "use strict";

  const ROWS = 6, COLS = 5;

  // ---- DOM ----
  const boardEl = document.getElementById("board");
  const kbEl = document.getElementById("keyboard");
  const msgEl = document.getElementById("message");
  const statPlayed = document.getElementById("stat-played");
  const statWin = document.getElementById("stat-win");
  const statStreak = document.getElementById("stat-streak");
  const statMaxStreak = document.getElementById("stat-maxstreak");

  // ---- 状态 ----
  let answer, curRow, curCol, status; // status: 'playing'|'won'|'lost'
  let revealing = false;                       // 翻牌动画期间锁输入
  let keyStates = {}; // letter -> 'correct'|'present'|'absent'
  let stats = loadStats();
  
  // 性能优化：缓存DOM查询结果
  const cellCache = new Map();

  // ---- 初始化棋盘与键盘 ----
  function buildBoard() {
    boardEl.innerHTML = "";
    cellCache.clear(); // 清空缓存
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.row = r;
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.row = r;
        cell.dataset.col = c;
        row.appendChild(cell);
        
        // 缓存单元格元素
        cellCache.set(`${r},${c}`, cell);
      }
      boardEl.appendChild(row);
    }
  }

  const KB_LAYOUT = [
    ["q","w","e","r","t","y","u","i","o","p"],
    ["a","s","d","f","g","h","j","k","l"],
    ["enter","z","x","c","v","b","n","m","back"],
  ];
  function buildKeyboard() {
    kbEl.innerHTML = "";
    KB_LAYOUT.forEach((row) => {
      const div = document.createElement("div");
      div.className = "kb-row";
      row.forEach((k) => {
        const btn = document.createElement("button");
        btn.className = "key" + ((k === "enter" || k === "back") ? " wide" : "");
        btn.textContent = k === "back" ? "⌫" : k.toUpperCase();
        btn.dataset.key = k;
        btn.addEventListener("click", () => onKey(k));
        div.appendChild(btn);
      });
      kbEl.appendChild(div);
    });
  }

  // ---- 游戏控制 ----
  function newGame() {
    answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)].toLowerCase();
    curRow = 0; curCol = 0; status = "playing";
    keyStates = {};
    revealing = false;
    buildBoard();
    refreshKeyboard();
    renderStats();
    hideMsg();
  }

  function onKey(k) {
    // revealing 期间一律拒绝输入：翻牌动画要走约 1.3 秒，旧代码这段时间里
    // status 仍是 playing，狂敲回车会把同一行重复提交、或把字母打进正在翻的格子
    if (status !== "playing" || revealing) return;
    if (k === "enter") return submit();
    if (k === "back") return backspace();
    if (/^[a-z]$/.test(k)) return type(k);
  }

  function type(ch) {
    if (curCol >= COLS) return;
    const cell = cellAt(curRow, curCol);
    cell.textContent = ch;
    cell.classList.add("filled", "pop");
    setTimeout(() => cell.classList.remove("pop"), 120);
    curCol++;
  }

  function backspace() {
    if (curCol <= 0) return;
    curCol--;
    const cell = cellAt(curRow, curCol);
    cell.textContent = "";
    cell.classList.remove("filled");
  }

  function submit() {
    if (curCol < COLS) { shakeRow(curRow); flashMsg("字母不够"); return; }
    const guess = currentWord();
    if (!VALID.has(guess)) {
      shakeRow(curRow);
      flashMsg("词库里没有这个词");
      return;
    }
    const result = judge(guess, answer);
    revealing = true;
    animateReveal(curRow, guess, result, () => {
      revealing = false;
      applyKeyboard(guess, result);
      if (guess === answer) {
        status = "won";
        bounceRow(curRow);
        recordResult(true, curRow + 1);
        flashMsg("漂亮！猜对了");
      } else if (curRow >= ROWS - 1) {
        status = "lost";
        recordResult(false);
        flashMsg("答案是 " + answer.toUpperCase());
      } else {
        curRow++; curCol = 0;
      }
    });
  }

  function currentWord() {
    let w = "";
    for (let c = 0; c < COLS; c++) w += cellAt(curRow, c).textContent.toLowerCase();
    return w;
  }

  // 核心：先绿后黄，按剩余计数
  function judge(guess, target) {
    const res = new Array(COLS).fill("absent");
    const remaining = {};
    for (const ch of target) remaining[ch] = (remaining[ch] || 0) + 1;
    // 1) 绿
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === target[i]) {
        res[i] = "correct";
        remaining[guess[i]]--;
      }
    }
    // 2) 黄（按剩余计数）
    for (let i = 0; i < COLS; i++) {
      if (res[i] === "correct") continue;
      const ch = guess[i];
      if (remaining[ch] > 0) {
        res[i] = "present";
        remaining[ch]--;
      }
    }
    return res;
  }

  function applyKeyboard(guess, result) {
    const order = { correct: 3, present: 2, absent: 1 };
    for (let i = 0; i < COLS; i++) {
      const ch = guess[i];
      const want = result[i];
      if (!keyStates[ch] || order[want] > order[keyStates[ch]]) {
        keyStates[ch] = want;
      }
    }
    refreshKeyboard();
  }

  function refreshKeyboard() {
    document.querySelectorAll(".key").forEach((btn) => {
      const k = btn.dataset.key;
      btn.classList.remove("correct", "present", "absent");
      if (keyStates[k]) btn.classList.add(keyStates[k]);
    });
  }

  // ---- 动画 ----
  function animateReveal(row, guess, result, done) {
    for (let i = 0; i < COLS; i++) {
      const cell = cellAt(row, i);
      setTimeout(() => {
        cell.classList.add("flip");
        setTimeout(() => {
          cell.classList.remove("filled");
          cell.classList.add(result[i]);
        }, 250);
        if (i === COLS - 1) setTimeout(done, 280);
      }, i * 250);
    }
  }
  function shakeRow(r) {
    const row = boardEl.querySelector('.row[data-row="' + r + '"]');
    row.classList.add("shake");
    setTimeout(() => row.classList.remove("shake"), 400);
  }
  function bounceRow(r) {
    const row = boardEl.querySelector('.row[data-row="' + r + '"]');
    row.classList.add("bounce");
  }

  // ---- 提示 ----
  let msgTimer;
  function flashMsg(t) {
    msgEl.innerHTML = "<span>" + t + "</span>";
    msgEl.classList.add("show");
    clearTimeout(msgTimer);
    msgTimer = setTimeout(hideMsg, 2200);
  }
  function hideMsg() { msgEl.classList.remove("show"); msgEl.innerHTML = ""; }

  function cellAt(r, c) {
    // 使用缓存的DOM元素，避免每次都进行DOM查询
    return cellCache.get(`${r},${c}`);
  }

  // ---- 战绩 ----
  function loadStats() {
    try {
      const s = JSON.parse(localStorage.getItem("wordle_stats") || "{}") || {};
      return {
        played: s.played || 0,
        wins: s.wins || 0,
        streak: s.streak || 0,
        maxStreak: s.maxStreak || 0,
        dist: s.dist || {},      // 猜测次数分布：g1..g6 + fail
      };
    } catch (e) { return { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: {} }; }
  }
  function saveStats() {
    localStorage.setItem("wordle_stats", JSON.stringify(stats));
    renderStats();
  }
  function recordResult(win, rows) {
    stats.played++;
    stats.dist = stats.dist || {};
    if (win) {
      stats.wins++; stats.streak++; stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      const k = "g" + rows;
      stats.dist[k] = (stats.dist[k] || 0) + 1;
    } else {
      stats.streak = 0;
      stats.dist.fail = (stats.dist.fail || 0) + 1;
    }
    saveStats();
  }
  // 猜测次数分布（本地战绩里最有信息量的一项）
  function renderDist() {
    const el = document.getElementById("dist");
    if (!el) return;
    const d = stats.dist || {};
    const rows = [];
    for (let i = 1; i <= ROWS; i++) rows.push(["第" + i + "次", d["g" + i] || 0]);
    rows.push(["失败", d.fail || 0]);
    const max = Math.max(1, ...rows.map(r => r[1]));
    el.innerHTML = rows.map(([k, v]) =>
      '<div class="dist-row' + (v ? " has" : "") + '">' +
        '<span class="dk">' + k + '</span>' +
        '<span class="dbar" style="width:' + Math.max(v ? 8 : 0, Math.round(v / max * 100)) + '%"></span>' +
        '<span class="dv">' + v + '</span>' +
      '</div>'
    ).join("");
  }
  function renderStats() {
    statPlayed.textContent = stats.played;
    statWin.textContent = (stats.played ? Math.round(stats.wins / stats.played * 100) : 0) + "%";
    statStreak.textContent = stats.streak;
    // maxStreak 一直有记录，但原先没有任何地方展示它
    if (statMaxStreak) statMaxStreak.textContent = stats.maxStreak || 0;
    renderDist();
  }

  // ---- 输入：物理键盘 ----
  window.addEventListener("keydown", function (e) {
    const k = e.key.toLowerCase();
    if (k === "enter") { onKey("enter"); }
    else if (k === "backspace") { onKey("back"); }
    else if (/^[a-z]$/.test(k)) { onKey(k); }
  });

  // 胜利/失败后点击棋盘重新开始
  boardEl.addEventListener("click", function () {
    if (status !== "playing") { flashMsg("新一局开始"); newGame(); }
  });
  kbEl.addEventListener("click", function (e) {
    if (status !== "playing" && e.target.classList.contains("key")) { newGame(); }
  });

  // ---- 启动 ----
  buildKeyboard();
  newGame();
})();
