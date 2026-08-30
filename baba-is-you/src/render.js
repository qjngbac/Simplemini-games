/* Baba Is You — Canvas 渲染（浏览器端） */
(function () {
  "use strict";
  const BIY = window.BIY;

  const OBJECT_STYLE = {
    BABA: { emoji: "🐰", color: "#f6f3ee", stroke: "#2a2a2a" },
    WALL: { emoji: "🧱", color: "#7d8590", stroke: "#3a3f47" },
    FLAG: { emoji: "🚩", color: "#ff5b6e", stroke: "#a02a3a" },
    ROCK: { emoji: "🪨", color: "#b08968", stroke: "#6e4f37" },
    WATER: { emoji: "💧", color: "#4aa3ff", stroke: "#1c5fae" },
    SKULL: { emoji: "💀", color: "#e9e9ee", stroke: "#8a8a8a" },
    TREE: { emoji: "🌲", color: "#3fa34d", stroke: "#1f5e2a" },
    DOOR: { emoji: "🚪", color: "#c08a4a", stroke: "#7a5226" },
    KEY: { emoji: "🔑", color: "#ffd86b", stroke: "#a9821f" },
  };

  const TEXT_COLOR = {
    NOUN: "#e0b97d",
    VERB: "#f4f4f4",
    PROPERTY: "#7ee0a0",
    PREFIX: "#c0a0ff",
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 计算网格布局（在画布内居中，使用逻辑坐标）
  function layout(state, canvas) {
    const W = canvas._logical || canvas.width;
    const H = canvas._logical || canvas.height;
    const pad = 18;
    const avail = Math.min(W, H) - pad * 2;
    const cell = Math.max(24, Math.floor(avail / Math.max(state.w, state.h)));
    const ox = Math.floor((W - cell * state.w) / 2);
    const oy = Math.floor((H - cell * state.h) / 2);
    return { cell, ox, oy, W, H };
  }

  function draw(ctx, state, canvas, t) {
    const { cell, ox, oy, W, H } = layout(state, canvas);
    ctx.clearRect(0, 0, W, H);

    // 背景
    ctx.fillStyle = "#11131a";
    ctx.fillRect(0, 0, W, H);

    // 棋盘格
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#181b24" : "#15171f";
        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }

    // 计算属性用于高亮
    const isYou = (e) => BIY.hasProp(state, e, "YOU");
    const isWin = (e) => BIY.hasProp(state, e, "WIN");

    // 先画物体，再画文本（文本在上层）
    const objects = state.entities.filter((e) => e.category === "object");
    const texts = state.entities.filter((e) => e.category === "text");

    for (const e of objects) {
      const px = ox + e.x * cell, py = oy + e.y * cell;
      const st = OBJECT_STYLE[e.noun] || { emoji: "❓", color: "#888", stroke: "#444" };
      // 底色块
      roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, 8);
      ctx.fillStyle = st.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = st.stroke;
      ctx.stroke();
      // 表情
      ctx.font = Math.floor(cell * 0.6) + "px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(st.emoji, px + cell / 2, py + cell / 2 + 1);
      // YOU 高亮
      if (isYou(e)) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffe14a";
        roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, 8);
        ctx.stroke();
      }
      // WIN 脉冲
      if (isWin(e)) {
        const a = 0.4 + 0.4 * Math.abs(Math.sin(t / 350));
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(120,255,150," + a.toFixed(2) + ")";
        roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, 8);
        ctx.stroke();
      }
    }

    for (const e of texts) {
      const px = ox + e.x * cell, py = oy + e.y * cell;
      const col = TEXT_COLOR[e.cat] || "#ccc";
      // 文本块：深色底 + 彩色边 + 文字
      roundRect(ctx, px + 2, py + 2, cell - 4, cell - 4, 6);
      ctx.fillStyle = "#0c0e14";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = "bold " + Math.floor(cell * 0.34) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.word, px + cell / 2, py + cell / 2 + 1);
    }
  }

  window.BIY_RENDER = { draw, layout, OBJECT_STYLE, TEXT_COLOR };
})();
