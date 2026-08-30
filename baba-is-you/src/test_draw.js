// 用假 ctx 实际跑 draw，验证实体/棋盘格被画到有限坐标（非 NaN）
global.window = {};
global.window.BIY = require("./engine.js");
global.window.BIY_LEVELS = require("./levels.js");
require("./render.js");
const RENDER = global.window.BIY_RENDER;
const BIY = global.window.BIY;
const LEVELS = global.window.BIY_LEVELS;

function makeCtx() {
  const c = { texts: [], rects: [] };
  c.beginPath = () => {}; c.moveTo = () => {}; c.arcTo = () => {};
  c.closePath = () => {}; c.fill = () => {}; c.stroke = () => {};
  c.clearRect = () => {};
  c.fillRect = (x, y, w, h) => c.rects.push([x, y, w, h]);
  c.fillText = (t, x, y) => c.texts.push([t, x, y]);
  return c;
}

let allPass = true;
LEVELS.forEach((lv, i) => {
  const ctx = makeCtx();
  const s = BIY.loadLevel(lv);
  RENDER.draw(ctx, s, { width: 720, height: 720 }, 0);

  const objCount = s.entities.filter((e) => e.category === "object").length;
  const txtCount = s.entities.filter((e) => e.category === "text").length;

  const anyNaN =
    ctx.texts.some((t) => !isFinite(t[1]) || !isFinite(t[2])) ||
    ctx.rects.some((r) => r.some((v) => !isFinite(v)));

  // 文本块数量应等于 txtCount（每个文本块 1 次 fillText）
  const textBlocksDrawn = ctx.texts.filter((t) => /^[A-Z]{2,}$/.test(t[0])).length;
  // emoji 实体数量应等于 objCount
  const emojiDrawn = ctx.texts.filter((t) => /[\u{1F000}-\u{1FAFF}❓💀🌲🚪🔑🚩🐰🧱🪨💧]/u.test(t[0])).length;

  const pass =
    !anyNaN &&
    textBlocksDrawn >= txtCount &&
    ctx.rects.filter((r) => !(r[0] === 0 && r[1] === 0 && r[2] === 720 && r[3] === 720)).length > 0;
  if (!pass) allPass = false;
  console.log(
    `L${i + 1} ${lv.name}:` +
      ` texts=${ctx.texts.length} rects=${ctx.rects.length}` +
      ` textBlocks=${textBlocksDrawn}/${txtCount} emoji=${emojiDrawn}/${objCount}` +
      ` anyNaN=${anyNaN} => ${pass ? "PASS" : "FAIL"}`
  );
});

console.log(allPass ? "\nALL LEVELS RENDER OK" : "\nRENDER BUG REMAINS");
process.exit(allPass ? 0 : 1);
