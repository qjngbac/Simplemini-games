# Simplemini-games

7 款纯前端小游戏合集，**零依赖、免环境**：下载解压后双击 `index.html` 就能玩，不需要 Node.js、Python 或任何本地服务器。

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

## 📦 免环境版（推荐）

1. 到 [Releases](../../releases) 下载 `Simplemini-games-v1.0.0.zip`
2. 解压到任意位置
3. **双击 `index.html`** 打开游戏大厅，点任意游戏即可

也可以不解压、直接从 `dist/` 里拿单个 HTML 文件双击打开（`peglin.html`、`wordle.html` …… 每个都是自包含的单文件）。

> **关于战绩保存**：成绩存在浏览器 localStorage 里。绝大多数浏览器（Chrome / Edge / Firefox）直接双击打开也能正常记录；少数环境（如某些 Safari 设置）会禁用 `file://` 下的 localStorage，这时游戏照常可玩，只是战绩不落盘——代码里做了兜底，不会报错或白屏。
> 想让 7 个游戏的战绩汇总到大厅，请保持它们在同一文件夹内。

## 🛠 从源码构建

源码是「一个游戏一个文件夹」的正常开发布局（`index.html` + `style.css` + `game.js`）。
打包成单文件产物只需跑一次：

```bash
python build_single_file.py
```

会输出到 `dist/`：CSS 与 JS 全部内联、注入 localStorage 兜底、并改写页面之间的链接。
需要 Python 3，无第三方依赖。

## 🧪 自检

- `baba-is-you/src/solve.js`：BFS 求解器，验证 12 关全部可解且开局不能直接赢
  ```bash
  cd baba-is-you/src && node solve.js
  ```

## 📁 目录结构

```
Simplemini-games/
├── dist/                   # 免环境单文件产物（双击即玩）
│   ├── index.html          # 游戏大厅 + 战绩汇总
│   ├── peglin.html
│   ├── slay-the-spire-lite.html
│   ├── vampire-survivors.html
│   ├── warioware.html
│   ├── flappy-bird.html
│   ├── wordle.html
│   └── baba-is-you.html
├── build_single_file.py    # 打包脚本
├── index.html              # 大厅源码
├── peglin/  slay-the-spire-lite/  vampire-survivors/
├── warioware/  flappy-bird/  wordle/  baba-is-you/
└── README.md
```

## 🔧 技术栈

原生 HTML + CSS + JavaScript，无构建工具、无框架、无网络请求。
仅 Peglin 用到 [Matter.js](https://brm.io/matter-js/) 做弹珠物理（已内联进单文件）。
全部适配键鼠与触屏。
