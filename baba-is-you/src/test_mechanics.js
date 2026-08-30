/* 机制单元测试：直接验证关键规则行为是否正确。 */
const BIY = require("./engine.js");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name); }
}
function mk(map) { return BIY.loadLevel({ name: "t", hint: "", map }); }

console.log("[1] 转换规则 X IS Y（物体改类型）");
{
  const s = mk(["BIY", "WIO", "FIN", "b#.*"]); // WALL IS ROCK
  BIY.applyInput(s, { x: 0, y: 1 });
  const rocks = s.entities.filter((e) => e.category === "object" && e.noun === "ROCK");
  const walls = s.entities.filter((e) => e.category === "object" && e.noun === "WALL");
  check("墙被转换为石头", rocks.length >= 1 && walls.length === 0);
}

console.log("[2] 消除规则 X IS EMPTY");
{
  const s = mk(["BIY", "WIQ", "FIN", "b#.*"]); // WALL IS EMPTY
  BIY.applyInput(s, { x: 0, y: 1 });
  const walls = s.entities.filter((e) => e.category === "object" && e.noun === "WALL");
  check("墙被消除", walls.length === 0);
}

console.log("[3] SINK 同格互毁");
{
  const s = mk(["BIY", "AIZ", "b~"]); // WATER IS SINK, Baba 右移进入水
  BIY.applyInput(s, { x: 1, y: 0 });
  const baba = s.entities.filter((e) => e.noun === "BABA");
  const water = s.entities.filter((e) => e.noun === "WATER");
  check("BABA 与 WATER 一起消失", baba.length === 0 && water.length === 0);
  check("无 YOU → 失败", s.status === "lost");
}

console.log("[4] DEFEAT 触碰即死");
{
  const s = mk(["BIY", "KIC", "b k"]); // SKULL IS DEFEAT, Baba 右移两次踩骷髅
  BIY.applyInput(s, { x: 1, y: 0 });
  BIY.applyInput(s, { x: 1, y: 0 });
  const baba = s.entities.filter((e) => e.noun === "BABA");
  check("BABA 被 DEFEAT 消灭", baba.length === 0);
}

console.log("[5] 胜利：YOU 碰 WIN");
{
  const s = mk(["BIY", "FIN", "b*"]); // Baba 与 flag 同列相邻，右移踩中
  const r = BIY.applyInput(s, { x: 1, y: 0 });
  check("同格旗子即胜利", r === "won" && s.status === "won");
}

console.log("[6] NOT 否定属性");
{
  const s = mk(["BIY", "BIXY", "b.*"]); // BABA IS YOU / BABA IS NOT YOU
  BIY.applyInput(s, { x: 1, y: 0 });
  const baba = s.entities.find((e) => e.noun === "BABA");
  check("NOT 生效：BABA 非 YOU", !BIY.hasProp(s, baba, "YOU"));
}

console.log("[7] STOP 阻挡移动");
{
  const s = mk(["BIY", "WIS", "FIN", "b#*"]); // 墙 STOP，Baba 右移被挡
  const before = s.entities.find((e) => e.noun === "BABA").x;
  BIY.applyInput(s, { x: 1, y: 0 });
  const after = s.entities.find((e) => e.noun === "BABA").x;
  check("STOP 墙挡住 BABA", before === after);
}

console.log("[8] PUSH 推动链（两块连推）");
{
  const s = mk(["BIY", "OIP", "FIN", "boo *"]); // ROCK IS PUSH, 两石连排相邻
  BIY.applyInput(s, { x: 1, y: 0 });
  const xs = s.entities.filter((e) => e.noun === "ROCK").map((e) => e.x).sort();
  check("两块石头一起被推", JSON.stringify(xs) === "[2,3]");
}

console.log("[9] 文本默认可推（TEXT）");
{
  const s = mk(["BIY", "bI.."]); // Baba 紧邻 IS 文本
  BIY.applyInput(s, { x: 1, y: 0 });
  const isText = s.entities.find((e) => e.word === "IS" && e.y === 1);
  check("IS 文本被推动", isText && isText.x === 2);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
