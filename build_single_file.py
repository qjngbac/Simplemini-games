# -*- coding: utf-8 -*-
"""
把每个游戏目录打包成一个自包含的 HTML 文件（双击即玩，不需要服务器 / Node / Python）。

做的事：
  1. 把 <link rel="stylesheet" href="xxx.css"> 内联成 <style>
  2. 把 <script src="xxx.js"> 按出现顺序内联成 <script>
  3. 在 <head> 最前面注入 localStorage 安全兜底（file:// 下可能被禁用，退化成内存存储）
  4. 改写页面之间的互相链接：
       首页  <game>/index.html  ->  <game>.html
       游戏  ../index.html      ->  index.html
"""
import io
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")

# 发布用的压缩包：把 dist/ 的成品按 "<目录名>/xxx.html" 打进去，
# 解压后是一个文件夹，双击里面的 index.html 就能玩
ZIP_NAME = "Simplemini-games-v1.0.0.zip"
ZIP_DIR = "Simplemini-games"

# 打包顺序：首页（大厅）在前，其余按游戏
PAGES = [
    ("index.html", "index.html", None),
    ("peglin", "peglin.html", "peglin"),
    ("slay-the-spire-lite", "slay-the-spire-lite.html", "slay-the-spire-lite"),
    ("vampire-survivors", "vampire-survivors.html", "vampire-survivors"),
    ("warioware", "warioware.html", "warioware"),
    ("flappy-bird", "flappy-bird.html", "flappy-bird"),
    ("wordle", "wordle.html", "wordle"),
    ("baba-is-you", "baba-is-you.html", "baba-is-you"),
    # 第二批：经典休闲
    ("tetris", "tetris.html", "tetris"),
    ("snake", "snake.html", "snake"),
    ("game-2048", "game-2048.html", "game-2048"),
    ("minesweeper", "minesweeper.html", "minesweeper"),
    ("gomoku", "gomoku.html", "gomoku"),
]

SAFE_STORAGE = """<script>
/* file:// 下部分浏览器会禁用 localStorage，直接读写会抛 SecurityError 导致游戏白屏。
   这里先探一次，不可用时退化成内存存储：游戏照常玩，只是战绩不落盘。 */
(function () {
  try { localStorage.setItem('__probe__', '1'); localStorage.removeItem('__probe__'); return; } catch (e) {}
  var mem = {};
  try {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; },
        clear: function () { mem = {}; },
        key: function (i) { var ks = Object.keys(mem); return i < ks.length ? ks[i] : null; },
        get length() { return Object.keys(mem).length; }
      }
    });
  } catch (e2) {}
})();
</script>
"""

# 脚本里若出现 </script 会提前闭合标签，必须转义
def safe_inline_js(code):
    return code.replace("</script", "<\\/script")


def read(p):
    with io.open(p, "r", encoding="utf-8") as f:
        return f.read()


def bundle(html_path, out_name, game_dir):
    base = os.path.dirname(html_path)
    html = read(html_path)

    # 1) 内联 CSS
    def repl_css(m):
        css_path = os.path.join(base, m.group(1))
        if not os.path.exists(css_path):
            sys.stderr.write("  ! 缺少 CSS: %s\n" % css_path)
            return ""
        return "<style>\n" + read(css_path) + "\n</style>"

    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', repl_css, html)

    # 2) 内联 JS（按出现顺序替换）
    missing = []

    def repl_js(m):
        src = m.group(1)
        js_path = os.path.join(base, src)
        if not os.path.exists(js_path):
            missing.append(src)
            return ""
        return "<script>\n" + safe_inline_js(read(js_path)) + "\n</script>"

    html = re.sub(r'<script\s+src="([^"]+)"\s*>\s*</script>', repl_js, html)
    if missing:
        sys.stderr.write("  ! 缺少 JS: %s\n" % ", ".join(missing))

    # 3) 改写页面间链接
    if game_dir is None:
        # 首页的链接是 JS 模板拼出来的（href="' + esc(g.dir) + LINK_SUFFIX + '"），
        # 单靠正则改不动，所以约定一个常量，这里直接把它的值换成 ".html"
        before = html
        html = html.replace('const LINK_SUFFIX = "/index.html";', 'const LINK_SUFFIX = ".html";')
        if html == before:
            sys.stderr.write("  ! 没能改写首页的 LINK_SUFFIX，游戏链接会指向源码布局\n")
    else:
        # 游戏页： ../index.html -> index.html
        html = html.replace('href="../index.html"', 'href="index.html"')

    # 4) 注入 localStorage 兜底（放在 <head> 之后、任何其他脚本之前）
    html = re.sub(r"(<head[^>]*>)", r"\1\n" + SAFE_STORAGE, html, count=1)

    # 5) 残留外链自检
    leftover = re.findall(r'<script\s+src="[^"]+"', html) + \
               re.findall(r'<link[^>]+href="[^"]+\.css"', html)
    if leftover:
        sys.stderr.write("  ! 仍有外链: %s\n" % leftover)

    out = os.path.join(DIST, out_name)
    with io.open(out, "w", encoding="utf-8") as f:
        f.write(html)
    return out, len(html), leftover


def make_zip():
    """把 dist/ 成品打成发布用压缩包（--zip 时调用）。"""
    out = os.path.join(ROOT, ZIP_NAME)
    if os.path.exists(out):
        os.remove(out)
    n = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        # 按 PAGES 的顺序打包，index.html 排在最前
        for _src, out_name, _game_dir in PAGES:
            p = os.path.join(DIST, out_name)
            if not os.path.exists(p):
                sys.stderr.write("  ! 缺少成品，跳过: %s\n" % out_name)
                continue
            z.write(p, ZIP_DIR + "/" + out_name)
            n += 1
    print("\n压缩包: %s（%d 个文件，%.1f KB）" % (ZIP_NAME, n, os.path.getsize(out) / 1024.0))
    return n


def main():
    if sys.stdout and hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    if not os.path.isdir(DIST):
        os.makedirs(DIST)
    print("输出目录: %s\n" % DIST)
    total = 0
    bad = 0
    for src, out_name, game_dir in PAGES:
        if game_dir is None:
            html_path = os.path.join(ROOT, src)
        else:
            html_path = os.path.join(ROOT, game_dir, "index.html")
        if not os.path.exists(html_path):
            print("  [X] 跳过（不存在）: %s" % html_path)
            bad += 1
            continue
        out, size, leftover = bundle(html_path, out_name, game_dir)
        total += 1
        if leftover:
            bad += 1
        tag = "[OK]" if not leftover else "[X]"
        try:
            print("  %s %-26s %8.1f KB" % ("✓" if not leftover else "✗", out_name, size / 1024.0))
        except UnicodeEncodeError:
            print("  %s %-26s %8.1f KB" % (tag, out_name, size / 1024.0))
    try:
        print("\n打包 %d 个页面，%s" % (total, "全部干净 ✅" if bad == 0 else "有 %d 个问题 ❌" % bad))
    except UnicodeEncodeError:
        print("\n打包 %d 个页面，%s" % (total, "全部干净 [OK]" if bad == 0 else "有 %d 个问题 [X]" % bad))
    # 加 --zip 才顺带打发布包：平时只想看 dist 时不该被压缩包拖慢
    if "--zip" in sys.argv:
        make_zip()
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
