# Simplemini-games

12 款纯前端小游戏合集，**零依赖、免环境**：下载解压后双击 `index.html` 就能玩，不需要 Node.js、Python 或任何本地服务器。

## 🎮 游戏一览

| 游戏 | 类型 | 一句话玩法 | 特色机制 |
|---|---|---|---|
| **Peglin** | 弹珠肉鸽 | 从顶部瞄准发射弹珠，在钉子间弹跳攒伤害 | 特殊钉逐关解锁（4 种 × 上限 10，40 关满配）；敌人有护甲与意图（攻击 / 防御 / 施法）；主动结束可随时结算 |
| **杀戮尖塔 · 精简版** | 卡牌构筑 | 出牌耗能，叠甲反击，6 层登顶 | 力量 / 易伤 / 虚弱 / 中毒状态；遗物、药水、商店、篝火升级 |
| **吸血鬼幸存者** | 割草生存 | 走位躲怪潮，武器全自动开火 | 升级三选一，武器可叠等级；空间网格 + 对象池，几百只怪也不卡 |
| **WarioWare 微游戏** | 反应力 | 一串 5 秒小游戏连轴转 | 6 种小游戏轮换，时间随关卡越来越短；4 条命 |
| **像素鸟** | 休闲 | 空格 / 点击拍翅穿过管道 | 经典手感，历史前三名 |
| **Wordle** | 猜词 | 6 次机会猜 5 字母单词 | 绿黄灰提示，含猜测次数分布统计 |
| **Baba Is You** | 规则解谜 | 推动文字块改写游戏规则 | 12 关，附 BFS 求解器可验证每关都可解 |
| **俄罗斯方块** | 街机 | 消行得分，等级越高落得越快 | 7-bag 随机袋、落点虚影、软降/硬降、暂停键、移动端连发手柄、中途返回实时结算 |
| **贪吃蛇** | 街机 | 吃果子长身体，别撞墙别咬自己 | 速度阶梯渐进、限时 ⭐ 奖励机制、防掉头转弯指令队列、中途退出自动存盘 |
| **2048 数字合并** | 解谜 | 方向键合并相同数字，目标 2048 | 纯 CSS 物理滑动与合并弹跳动效、支持悔棋一步、合出 2048 可继续冲、中途返回与实时高分入库 |
| **扫雷** | 逻辑 | 点开所有非雷格子 | 首点必安全、三档难度自适应网格、插旗模式与长按插旗、双击一键展开、退出自动计入战绩 |
| **五子棋 · 人机** | 棋类 | 你执黑先行，连成 5 子获胜 | 真正差异化的普通/困难两档 AI（会算双活三、冲四活三等必胜杀着并提前封堵）、获胜连线延迟展示与悔棋复盘 |

## 📦 免环境版（推荐）

1. 到 [Releases](../../releases) 下载 `Simplemini-games-v1.0.0.zip`
2. 解压到任意位置
3. **双击 `index.html`** 打开游戏大厅，点任意游戏即可

也可以不解压、直接从 `dist/` 里拿单个 HTML 文件双击打开（`peglin.html`、`wordle.html` …… 每个都是自包含的单文件）。

> **关于战绩保存**：成绩存在浏览器 localStorage 里。绝大多数浏览器（Chrome / Edge / Firefox）直接双击打开也能正常记录；少数环境（如某些 Safari 设置）会禁用 `file://` 下的 localStorage，这时游戏照常可玩，只是战绩不落盘——代码里做了兜底，不会报错或白屏。
> 想让 12 个游戏的战绩汇总到大厅，请保持它们在同一文件夹内。

## 🛠 从源码构建

源码是「一个游戏一个文件夹」的正常开发布局（`index.html` + `style.css` + `game.js`）。
打包成单文件产物只需跑一次：

```bash
python build_single_file.py
```

会输出到 `dist/`：CSS 与 JS 全部内联、注入 localStorage 兜底、并改写页面之间的链接。
需要 Python 3，无第三方依赖。

想连发布用的压缩包一起打（内容 = `dist/` 的成品，解压后是一个文件夹）：

```bash
python build_single_file.py --zip
```

## 🧪 自动化测试与自检

项目配备了纯前端自动化 DOM 测试套件与算法求解器：

```bash
# 运行全量 93 项核心规则与玩法逻辑断言
node .workbuddy/audit/harness.js

# 校验 dist/ 产物：单文件独立执行、无外链泄漏、启动与链接检测（94 项断言）
node .workbuddy/audit/dist_check.js

# Baba Is You 12 关 BFS 求解器，验证全部关卡可解且开局无解
cd baba-is-you/src && node solve.js
```

## 📁 目录结构

```
Simplemini-games/
├── dist/                   # 免环境单文件产物（双击即玩），13 个 HTML
│   ├── index.html          # 游戏大厅 + 战绩汇总
│   ├── peglin.html  slay-the-spire-lite.html  vampire-survivors.html
│   ├── warioware.html  flappy-bird.html  wordle.html  baba-is-you.html
│   └── tetris.html  snake.html  game-2048.html  minesweeper.html  gomoku.html
├── build_single_file.py    # 打包脚本
├── index.html              # 大厅源码
├── peglin/  slay-the-spire-lite/  vampire-survivors/
├── warioware/  flappy-bird/  wordle/  baba-is-you/
├── tetris/  snake/  game-2048/  minesweeper/  gomoku/
├── docs/                   # 优化记录 / 新增游戏说明 / 发布与清理指南
└── README.md
```

## 🔧 技术栈

原生 HTML + CSS + JavaScript，无构建工具、无框架、无网络请求。
仅 Peglin 用到 [Matter.js](https://brm.io/matter-js/) 做弹珠物理（已内联进单文件）。
全部适配键鼠与触屏。
