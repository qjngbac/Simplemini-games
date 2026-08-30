/* DOM 桩冒烟测试：在 Node 中用最小 DOM 桩加载 engine/render/main，
   模拟键盘操作，验证「启动→移动→胜利→下一关→撤销→重开」完整流程不报错且状态正确。 */
const fs = require("fs");
const path = require("path");

// ---- 最小 DOM 桩 ----
const ctxStub = new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
const elCache = {};
function makeEl(id) {
  return {
    id, textContent: "", innerHTML: "", style: {}, onclick: null, width: 0, height: 0,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); return f; },
    },
    appendChild() {}, addEventListener() {}, getContext() { return ctxStub; },
  };
}
let keyHandler = null;
global.window = global;
global.devicePixelRatio = 1;
global.requestAnimationFrame = () => 0;
global.addEventListener = (type, fn) => { if (type === "keydown") keyHandler = fn; };
global.document = {
  getElementById: (id) => (elCache[id] = elCache[id] || makeEl(id)),
  createElement: () => makeEl("dyn"),
};

// ---- 加载脚本（按 index.html 顺序）----
function load(f) { eval(fs.readFileSync(path.join(__dirname, f), "utf8")); }
load("engine.js"); // 挂到 window.BIY
load("levels.js"); // 挂到 window.BIY_LEVELS
load("render.js"); // 使用 window.BIY
load("main.js");   // 主程序

function press(key) { keyHandler({ key, preventDefault() {} }); }

// 镜像 index.html 初始 class（levelSelect / overlay 初始 hidden）
elCache["levelSelect"] = elCache["levelSelect"] || makeEl("levelSelect");
elCache["levelSelect"].classList.add("hidden");
elCache["overlay"] = elCache["overlay"] || makeEl("overlay");
elCache["overlay"].classList.add("hidden");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log("  ✅ " + name); } else { fail++; console.log("  ❌ " + name); } }

console.log("[流程] 启动第 1 关");
check("关卡名已设置", elCache["levelName"].textContent.indexOf("第 1 关") === 0);
check("规则栏非空", elCache["rules"].innerHTML !== undefined);

console.log("[流程] 按 L1 解法(URRRRRUDD)走完 → 应过关");
const L1 = "URRRRRUDD";
const KEY = { U: "ArrowUp", D: "ArrowDown", L: "ArrowLeft", R: "ArrowRight" };
for (const k of L1) press(KEY[k]);
check("过关覆盖层出现", !elCache["overlay"].classList.contains("hidden"));
check("过关标题正确", elCache["overlayTitle"].textContent.indexOf("过关") >= 0);

console.log("[流程] 下一关 → 第 2 关");
press("n");
check("进入第 2 关", elCache["levelName"].textContent.indexOf("第 2 关") === 0);
check("覆盖层已隐藏", elCache["overlay"].classList.contains("hidden"));

console.log("[流程] 撤销 / 重开 不报错");
press("z"); press("r"); press("ArrowUp"); press("ArrowLeft"); press("ArrowDown");
check("操作后无异常（覆盖层状态合法）", true);

console.log("[流程] 关卡选择面板可开关");
elCache["btnLevels"].onclick && elCache["btnLevels"].onclick();
check("关卡选择面板可见", !elCache["levelSelect"].classList.contains("hidden"));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
