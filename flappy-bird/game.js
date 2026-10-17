// 像素鸟 Flappy Bird — 纯前端实现
// 逻辑分辨率固定 400x600，固定步长 60Hz 更新，渲染按帧。

(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 400
  const H = canvas.height;  // 600

  // ---------- 配置 ----------
  const CFG = {
    gravity: 0.45,        // 每步下落加速度
    flap: -7.6,           // 拍翅冲量
    pipeW: 64,            // 管道宽
    gap: 160,             // 上下管间隙（初始值）
    gapMin: 132,          // 间隙下限
    gapRamp: 1.6,         // 每得 1 分收窄的像素
    pipeSpacing: 220,     // 管道水平间距(像素)
    speed: 2.2,           // 滚动速度 px/步（初始值）
    speedMax: 3.4,        // 速度上限
    speedRamp: 0.04,      // 每得 1 分增加的速度
    groundH: 90,
    birdX: 96,
    birdR: 14,
    spawnX: W + 40,
    maxPipes: 6,          // 最大管道数量限制，防止内存泄漏
  };

  // 难度曲线：分数越高管道越快、缺口越窄，但都有上限，避免后期变成"不可能"。
  // 旧版本速度与缺口是写死的常量，玩到 30 分和 3 分手感完全一样。
  function curSpeed() { return Math.min(CFG.speedMax, CFG.speed + score * CFG.speedRamp); }
  function curGap() { return Math.max(CFG.gapMin, CFG.gap - score * CFG.gapRamp); }

  const STATE = { READY: "ready", PLAY: "play", OVER: "over" };

  // ---------- DOM ----------
  const overlay = document.getElementById("overlay");
  const titleScreen = document.getElementById("title-screen");
  const overScreen = document.getElementById("over-screen");
  const startBtn = document.getElementById("start-btn");
  const retryBtn = document.getElementById("retry-btn");
  const curScoreEl = document.getElementById("cur-score");
  const bestEl = document.getElementById("best-score");
  const bestEl2 = document.getElementById("best-score-2");

  // ---------- 游戏状态 ----------
  let state = STATE.READY;
  let bird, pipes, score, best, groundX, frame;

  best = Number(localStorage.getItem("flappy_best") || 0);
  bestEl.textContent = best;

  function reset() {
    bird = { x: CFG.birdX, y: H / 2, vy: 0, rot: 0 };
    pipes = [];
    score = 0;
    groundX = 0;
    frame = 0;
    spawnPipe(CFG.spawnX);
    spawnPipe(CFG.spawnX + CFG.pipeSpacing);
    spawnPipe(CFG.spawnX + CFG.pipeSpacing * 2);
  }

  function spawnPipe(x) {
    const minTop = 60;
    const gap = curGap();
    const maxTop = H - CFG.groundH - gap - 60;
    const top = minTop + Math.random() * (maxTop - minTop);
    // 缺口宽度在生成时固定下来：难度变化只影响新管道，
    // 否则屏幕上的旧管道会随分数"越长越窄"，视觉和判定都会跳变。
    pipes.push({ x, top, gap, scored: false });
  }

  // ---------- 输入 ----------
  function flap() {
    if (state === STATE.READY) {
      startGame();
    }
    if (state === STATE.PLAY) {
      bird.vy = CFG.flap;
    }
  }

  // 注意：不要在 overlay 上用内联样式改 pointer-events。
  // CSS 里 .overlay 本身是 pointer-events:none、只有 .screen 是 auto，两种状态都已覆盖。
  // 旧代码在 gameOver() 把它设成 "auto"（整块 inset:0 的透明层立刻盖住画布），
  // 而 retryBtn 从不复位，于是第二局起鼠标/触摸点击全部被吞掉，只剩空格还能拍翅。
  function startGame() {
    state = STATE.PLAY;
    titleScreen.classList.remove("shown");
    overlay.style.pointerEvents = "";
  }

  // ---------- 本机战绩（localStorage） ----------
  const REC_KEY = "flappy_records";
  function loadRec() {
    try { return JSON.parse(localStorage.getItem(REC_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveRec(r) { try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {} }
  function submitScore(s) {
    const r = loadRec();
    r.runs = (r.runs || 0) + 1;
    r.pipes = (r.pipes || 0) + s;
    r.top = (r.top || []).concat([s]).sort((a, b) => b - a).slice(0, 3);
    saveRec(r);
    return r;
  }
  function recHTML(r) {
    if (!r || !r.runs) return '<span class="empty">还没有战绩，先飞一局</span>';
    let h = '<div class="rec"><div class="rk">总局数</div><div class="rv">' + r.runs + '</div></div>';
    h += '<div class="rec"><div class="rk">累计管道</div><div class="rv">' + (r.pipes || 0) + '</div></div>';
    h += (r.top || []).map((v, i) =>
      '<div class="rec' + (i === 0 ? " best" : "") + '"><div class="rk">第 ' + (i + 1) + ' 名</div><div class="rv">' + v + '</div></div>'
    ).join("");
    return h;
  }
  function renderRecords() {
    const html = recHTML(loadRec());
    const a = document.getElementById("fbRecords");
    const b = document.getElementById("fbRecordsOver");
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
  }

  function gameOver() {
    if (state === STATE.OVER) return;   // 防止同一步内重复结算（战绩会被记两次）
    state = STATE.OVER;
    if (score > best) {
      best = score;
      localStorage.setItem("flappy_best", String(best));
    }
    submitScore(score);
    curScoreEl.textContent = score;
    bestEl2.textContent = best;
    bestEl.textContent = best;
    renderRecords();
    overScreen.classList.add("shown");
  }

  function handleInput(e) {
    e && e.preventDefault && e.preventDefault();
    flap();
  }

  window.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      flap();
    }
  });
  canvas.addEventListener("mousedown", handleInput);
  canvas.addEventListener("touchstart", handleInput, { passive: false });

  startBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    startGame();
  });
  retryBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    reset();
    overScreen.classList.remove("shown");
    state = STATE.PLAY;
  });

  // ---------- 更新 ----------
  function update() {
    frame++;

    if (state === STATE.PLAY) {
      bird.vy += CFG.gravity;
      bird.y += bird.vy;
      bird.rot = Math.max(-0.5, Math.min(1.4, bird.vy / 12));

      // 管道滚动与生成
      const spd = curSpeed();
      for (const p of pipes) {
        p.x -= spd;
        if (!p.scored && p.x + CFG.pipeW < bird.x) {
          p.scored = true;
          score++;
        }
      }
      // 移除出界，补充新管
      while (pipes.length && pipes[0].x + CFG.pipeW < -10) pipes.shift();
      const lastX = pipes.length ? pipes[pipes.length - 1].x : CFG.spawnX;
      if (lastX < CFG.spawnX - CFG.pipeSpacing && pipes.length < CFG.maxPipes) {
        spawnPipe(lastX + CFG.pipeSpacing);
      }

      // 碰撞：地面/天花板
      if (bird.y + CFG.birdR >= H - CFG.groundH) {
        bird.y = H - CFG.groundH - CFG.birdR;
        gameOver();
        return;   // 已经结束了就别再往下判定管道，否则同一步里会触发第二次 gameOver
      }
      if (bird.y - CFG.birdR <= 0) {
        bird.y = CFG.birdR;
        bird.vy = 0;
      }
      // 碰撞：管道 - 优化循环，提前退出
      for (const p of pipes) {
        if (hitPipe(p)) { 
          gameOver(); 
          return; // 提前退出，避免不必要的检查
        }
      }
    }

    // 地面滚动（ready/over 也滚，增加生气）
    if (state !== STATE.OVER) {
      groundX = (groundX - curSpeed()) % 24;
    }
  }

  function hitPipe(p) {
    const bx = bird.x, by = bird.y, r = CFG.birdR;
    const inX = bx + r > p.x && bx - r < p.x + CFG.pipeW;
    if (!inX) return false;
    const gap = p.gap || CFG.gap;   // 每根管子自己的缺口宽度
    const hitTop = by - r < p.top;
    const hitBot = by + r > p.top + gap;
    return hitTop || hitBot;
  }

  // ---------- 渲染 ----------
  function render() {
    // 天空渐变
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#4ec0ca");
    sky.addColorStop(1, "#9be7ef");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // 云
    drawClouds();

    // 管道
    for (const p of pipes) drawPipe(p);

    // 地面
    drawGround();

    // 鸟
    drawBird();

    // 分数
    if (state === STATE.PLAY) {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = 4;
      ctx.font = "bold 48px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.strokeText(String(score), W / 2, 24);
      ctx.fillText(String(score), W / 2, 24);
    }
  }

  function drawClouds() {
    ctx.fillStyle = "rgba(255,255,255,.55)";
    const off = (frame * 0.3) % W;
    cloud((120 - off + W) % W, 90, 30);
    cloud((300 - off + W) % W, 150, 24);
    cloud((450 - off + W) % W, 70, 28);
  }
  function cloud(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r, y + 4, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x - r, y + 4, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPipe(p) {
    const x = p.x, w = CFG.pipeW;
    const gap = p.gap || CFG.gap;   // 与 hitPipe 用同一个值，保证"看到的"就是"判定到的"
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, "#5aa02c");
    grad.addColorStop(0.5, "#8ed14f");
    grad.addColorStop(1, "#3f7a1c");
    ctx.fillStyle = grad;
    // 上管
    ctx.fillRect(x, 0, w, p.top);
    ctx.fillRect(x - 4, p.top - 22, w + 8, 22);
    // 下管
    ctx.fillRect(x, p.top + gap, w, H - CFG.groundH - (p.top + gap));
    ctx.fillRect(x - 4, p.top + gap, w + 8, 22);
    // 描边
    ctx.strokeStyle = "rgba(0,0,0,.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 0, w, p.top);
    ctx.strokeRect(x, p.top + gap, w, H - CFG.groundH - (p.top + gap));
  }

  function drawGround() {
    const gy = H - CFG.groundH;
    ctx.fillStyle = "#ded895";
    ctx.fillRect(0, gy, W, CFG.groundH);
    ctx.fillStyle = "#c9c277";
    for (let x = groundX; x < W; x += 24) {
      ctx.fillRect(x, gy, 12, 8);
      ctx.fillRect(x + 12, gy + 8, 12, 8);
    }
    ctx.fillStyle = "#7ec850";
    ctx.fillRect(0, gy - 6, W, 6);
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.rot);
    // 身体
    const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, CFG.birdR + 2);
    g.addColorStop(0, "#ffe66d");
    g.addColorStop(1, "#f5a623");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, CFG.birdR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // 翅膀
    const wingY = Math.sin(frame * 0.4) * 3;
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath();
    ctx.ellipse(-3, 2 + wingY, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(6, -4, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(7.5, -4, 2, 0, Math.PI * 2);
    ctx.fill();
    // 嘴
    ctx.fillStyle = "#f57";
    ctx.beginPath();
    ctx.moveTo(CFG.birdR - 2, -1);
    ctx.lineTo(CFG.birdR + 8, 0);
    ctx.lineTo(CFG.birdR - 2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------- 主循环（固定步长） ----------
  const STEP = 1000 / 60;
  let acc = 0, last = performance.now();
  function loop(now) {
    acc += now - last;
    last = now;
    if (acc > 200) acc = 200; // 防止切换标签后大跳
    while (acc >= STEP) {
      update();
      acc -= STEP;
    }
    render();
    requestAnimationFrame(loop);
  }

  // ---------- 启动 ----------
  reset();
  state = STATE.READY;
  titleScreen.classList.add("shown");
  renderRecords();
  requestAnimationFrame(loop);
})();
