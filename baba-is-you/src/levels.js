/*
 * Baba Is You — 关卡数据（ASCII）
 * 设计原则：胜利严格依赖玩家「构造或修改规则」，初始绝不能直接赢。
 * 图例：
 *   物体：b=BABA  #=WALL  *=FLAG  o=ROCK  ~=WATER  k=SKULL  r=TREE  d=DOOR  e=KEY
 *   文本：B=BABA W=WALL F=FLAG O=ROCK A=WATER K=SKULL T=TREE D=DOOR E=KEY U=TEXT
 *         I=IS  Y=YOU  P=PUSH  S=STOP  N=WIN  Q=EMPTY  Z=SINK  C=DEFEAT  V=MOVE  H=HOT  L=MELT  X=NOT
 *   '.' 或 ' ' = 空
 *   规则三/四连文本必须「相邻无空格」，例如：BABA IS YOU = BIY，WALL IS STOP = WIS，FLAG IS WIN = FIN。
 */
(function (root, factory) {
  const levels = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = levels;
  if (typeof window !== "undefined") window.BIY_LEVELS = levels;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  return [
    // ===== 第一阶段：基础教学 =====
    {
      name: "第一关：旗子变胜利",
      hint: "初始旗子不是胜利目标！把 N(WIN) 向上推进 F(FLAG) 和 I(IS) 的后方拼出 FLAG IS WIN，然后再触碰旗子！",
      map: [
        "..........",
        ".BIY......",
        ".....FI...",
        ".......N..",
        "..........",
        "..b....*..",
        "..........",
      ],
    },
    {
      name: "第二关：拆墙开路",
      hint: "墙壁挡住了去路！推开 S(STOP) 破坏 WALL IS STOP 规则，穿过墙壁拼出 FLAG IS WIN 碰旗！",
      map: [
        "....#.....",
        ".BIY#FI...",
        ".WIS#...N.",
        "....#.....",
        ".b..#...*.",
        "....#.....",
        "....#.....",
      ],
    },
    {
      name: "第三关：墙即胜利",
      hint: "这一关没有旗子！把 N(WIN) 推到 W(WALL) 和 I(IS) 右侧拼出 WALL IS WIN，碰墙即可通关！",
      map: [
        "..........",
        ".BIY......",
        ".WI....N..",
        "..........",
        ".....#....",
        ".b...#....",
        "..........",
      ],
    },

    // ===== 第二阶段：进阶转换 =====
    {
      name: "第四关：移石填海",
      hint: "WATER IS SINK 会吞没进入的一切！把石头(o)推进深水(~)同归于尽填出道路，拼出 FLAG IS WIN！",
      map: [
        "....~.....",
        ".BIY~FI...",
        ".OIP~...N.",
        ".AIZ~.....",
        ".b.o~...*.",
        "....~.....",
        "....~.....",
      ],
    },
    {
      name: "第五关：墙化作石",
      hint: "整面墙壁封死了道路！把 O(ROCK) 推到 W I 后面组成 WALL IS ROCK，墙壁就会变成可以推开的石头！",
      map: [
        "....#.....",
        ".BIY#.FI..",
        ".WI.#.O.N.",
        "....#.....",
        ".b..#...*.",
        "....#.....",
        "....#.....",
      ],
    },
    {
      name: "第六关：虚无抹除",
      hint: "拼出 WALL IS EMPTY 可以瞬间消除所有墙壁！消除阻挡后，把 N 拼到 FI 后面通关！",
      map: [
        "....#.....",
        ".BIY#.FI..",
        ".WI.#.Q.N.",
        "....#.....",
        ".b..#...*.",
        "....#.....",
        "....#.....",
      ],
    },

    // ===== 第三阶段：危险与否定 =====
    {
      name: "第七关：骷髅危机",
      hint: "骷髅是 DEFEAT 属性，触碰即死！推开 C(DEFEAT) 破坏致命规则，安全穿过骷髅群碰到旗子！",
      map: [
        "....k.....",
        ".BIYk.FI..",
        ".KICk...N.",
        "....k.....",
        ".b..k...*.",
        "....k.....",
        "....k.....",
      ],
    },
    {
      name: "第八关：否定之力",
      hint: "X(NOT) 可以反转规则！把 NOT 推入组成 SKULL IS NOT DEFEAT，骷髅便不再致命！",
      map: [
        "....k.....",
        ".BIYk.FI..",
        ".KI.k.X.N.",
        ".C..k.....",
        ".b..k...*.",
        "....k.....",
        "....k.....",
      ],
    },
    {
      name: "第九关：自动行者",
      hint: "V=MOVE！给石头拼出 ROCK IS MOVE，让它自动向前移动填入深水开辟通路！",
      map: [
        "....~.....",
        ".BIY~FI...",
        ".OI.~...N.",
        ".AIZ~.V...",
        ".b.o~...*.",
        "....~.....",
        "....~.....",
      ],
    },

    // ===== 第四阶段：大师与综合 =====
    {
      name: "第十关：灵魂出窍",
      hint: "深水阻断了去路且无法填平！把 Y(YOU) 推到 O I 后面组成 ROCK IS YOU，直接控制对岸的石头碰旗！",
      map: [
        "....~.....",
        ".BIY~.FI..",
        ".OI.~...N.",
        "....~.....",
        ".b..~.o.*.",
        "....~.....",
        "....~.....",
      ],
    },
    {
      name: "第十一关：绝处逢生",
      hint: "多重障碍：先拆开 WALL IS STOP 穿过墙壁，再推石头填平深水河，最后拼出 FLAG IS WIN 通关！",
      map: [
        "....#.~.....",
        ".BIY#.~.FI..",
        ".WIS#.~...N.",
        ".OIP#.~.AIZ.",
        ".b..#.~...*.",
        "....#.o.....",
        "....#.~.....",
      ],
    },
    {
      name: "第十二关：终极试炼",
      hint: "终极挑战：把 O(ROCK) 拼到 WIS 后面组成 WALL IS ROCK 将整面墙变为石头，再推石头填水开路，最后拼 FLAG IS WIN 碰旗！",
      map: [
        "....#.~.....",
        ".BIY#.~.FI..",
        ".WIS#.~...N.",
        ".OIP#.~.AIZ.",
        ".b..#.~...*.",
        "....#.~.....",
        "....#.~.....",
      ],
    },
  ];
});