/* BFS 求解器（严格版）：证明每关可解、校验「初始不可直接赢」。
 * 关键：去重序列化必须包含「当前生效规则」，否则会把"实体位置相同但规则不同"的状态
 *       误判为同一状态，导致错误剪枝 / 误报通关（曾因此把不可解关误判为可解）。
 * 仅用于验证，不参与游戏运行。 */
const BIY = require("./engine.js");
const LEVELS = require("./levels.js");

const DIRS = [
  { x: 0, y: -1, k: "U" }, { x: 0, y: 1, k: "D" },
  { x: -1, y: 0, k: "L" }, { x: 1, y: 0, k: "R" },
];
function ser(s) {
  const body = s.entities
    .map((e) => (e.category === "text" ? "T" + e.word + e.x + "," + e.y
      : "O" + e.noun + e.x + "," + e.y + (e.lastDir ? "d" + e.lastDir.x + e.lastDir.y : "")))
    .sort().join("|");
  const rules = BIY.activeRuleStrings(s).sort().join(",");
  return body + "#" + s.status + "#R:" + rules;
}
function solve(def, maxDepth = 60, maxNodes = 200000) {
  const start = BIY.loadLevel(def);
  if (start.status === "won") return { ok: false, reason: "INITIAL-WIN(太简单)", len: 0 };
  const q = [{ s: start, path: "" }];
  const seen = new Set([ser(start)]);
  let head = 0, nodes = 0;
  while (head < q.length) {
    const { s, path } = q[head++];
    if (path.length >= maxDepth) continue;
    for (const d of DIRS) {
      const ns = BIY.cloneState(s);
      BIY.applyInput(ns, d);
      const key = ser(ns);
      if (seen.has(key)) continue;
      const np = path + d.k;
      if (ns.status === "won") {
        // 自检：从初始状态重跑该路径，确认确实胜利（排除确定性异常）
        let chk = BIY.loadLevel(def); let good = true;
        for (const k of np) { const c2 = BIY.cloneState(chk); BIY.applyInput(c2, DIRS.find((z) => z.k === k)); chk = c2; }
        if (chk.status !== "won") { console.log("  ⚠️ 误报 path=" + np + " 重验=" + chk.status); continue; }
        return { ok: true, len: np.length, path: np };
      }
      if (ns.status === "lost") { seen.add(key); continue; }
      seen.add(key);
      q.push({ s: ns, path: np });
      if (++nodes > maxNodes) return { ok: false, reason: "node-limit(" + nodes + ")", len: path.length };
    }
  }
  return { ok: false, reason: "exhausted", len: 0 };
}

let allOk = true;
LEVELS.forEach((def, i) => {
  const t0 = Date.now();
  const r = solve(def);
  const ms = Date.now() - t0;
  let tag, detail;
  if (r.ok) { tag = "✅ SOLVABLE"; detail = `步数=${r.len} 解法=${r.path}`; }
  else if (r.reason.startsWith("INITIAL-WIN")) { tag = "❌ 太简单(初始即胜)"; detail = r.reason; }
  else { tag = "❌ UNSOLVABLE"; detail = r.reason; }
  console.log(`L${i + 1} ${def.name}: ${tag}  (${ms}ms)  ${detail}`);
  if (!r.ok) allOk = false;
});
console.log(allOk ? "\n全部关卡可解且初始不可直接赢 ✅" : "\n存在需修正的关卡 ❌");
process.exit(allOk ? 0 : 1);
