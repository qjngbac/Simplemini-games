/*
 * Baba Is You — 规则引擎（纯逻辑，无 DOM 依赖）
 * 可在浏览器（window.BIY）与 Node（module.exports）中运行。
 *
 * 设计要点：
 *  - 规则每步重算（不缓存为事件），避免状态不一致。
 *  - 文本块是可推实体；文本块本身用名义类型 'TEXT' 参与规则（如 TEXT IS PUSH）。
 *  - 属性优先级固定：STOP 优先于 PUSH（既是 STOP 又是 PUSH 时阻挡移动）。
 *  - 移动用「推动链」递归：多块 PUSH 连排一起推或一起卡住。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BIY = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 词表 ----------
  const NOUNS = ['BABA', 'WALL', 'FLAG', 'ROCK', 'WATER', 'SKULL', 'TREE', 'DOOR', 'KEY', 'TEXT'];
  const PROPS = ['YOU', 'WIN', 'STOP', 'PUSH', 'SINK', 'DEFEAT', 'MOVE', 'HOT', 'MELT', 'OPEN', 'SHUT', 'WEAK', 'ATE', 'GROUP'];
  const isNounWord = (w) => NOUNS.indexOf(w) >= 0;
  const isPropWord = (w) => PROPS.indexOf(w) >= 0;

  // 文本字符 → [word, category]
  const TEXT_CHARS = {
    B: ['BABA', 'NOUN'], W: ['WALL', 'NOUN'], F: ['FLAG', 'NOUN'], O: ['ROCK', 'NOUN'],
    A: ['WATER', 'NOUN'], K: ['SKULL', 'NOUN'], T: ['TREE', 'NOUN'], D: ['DOOR', 'NOUN'],
    E: ['KEY', 'NOUN'], U: ['TEXT', 'NOUN'],
    I: ['IS', 'VERB'],
    Y: ['YOU', 'PROPERTY'], P: ['PUSH', 'PROPERTY'], S: ['STOP', 'PROPERTY'],
    N: ['WIN', 'PROPERTY'], Q: ['EMPTY', 'PROPERTY'], Z: ['SINK', 'PROPERTY'],
    C: ['DEFEAT', 'PROPERTY'], V: ['MOVE', 'PROPERTY'], H: ['HOT', 'PROPERTY'],
    L: ['MELT', 'PROPERTY'], X: ['NOT', 'PREFIX'],
  };
  // 物体字符 → noun
  const OBJ_CHARS = {
    b: 'BABA', '#': 'WALL', '*': 'FLAG', o: 'ROCK', '~': 'WATER',
    k: 'SKULL', r: 'TREE', d: 'DOOR', e: 'KEY',
  };

  // ---------- 关卡加载 ----------
  function loadLevel(def) {
    const rows = def.map;
    const h = rows.length;
    const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const entities = [];
    let id = 1;
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === ' ' || ch === '.') continue;
        if (OBJ_CHARS[ch]) {
          entities.push({ id: id++, category: 'object', noun: OBJ_CHARS[ch], x, y, lastDir: null });
        } else if (TEXT_CHARS[ch]) {
          const [word, cat] = TEXT_CHARS[ch];
          entities.push({ id: id++, category: 'text', word, cat, x, y, lastDir: null });
        }
        // 未知字符忽略
      }
    }

    return {
      w, h, name: def.name || '', hint: def.hint || '', status: 'playing',
      entities, props: {}, transforms: [], empties: [], activeSentences: [],
    };
  }

  function cloneState(state) {
    return {
      w: state.w, h: state.h, name: state.name, hint: state.hint, status: state.status,
      entities: state.entities.map((e) => ({ ...e, lastDir: e.lastDir ? { ...e.lastDir } : null })),
      props: state.props, transforms: state.transforms, empties: state.empties, activeSentences: state.activeSentences,
    };
  }

  // 用于 BFS / 去重：序列化实体 + 规则集
  function serialize(state) {
    const es = state.entities
      .map((e) => (e.category === 'text' ? 'T' + e.word + e.x + ',' + e.y : 'O' + e.noun + e.x + ',' + e.y))
      .sort()
      .join('|');
    return es;
  }

  // ---------- 规则解析 ----------
  function hasProp(state, e, prop) {
    if (e.category === 'object') {
      const s = state.props[e.noun];
      return !! (s && s.has(prop));
    }
    // 文本块：仅受 'TEXT IS X' 影响
    const s = state.props['TEXT'];
    return !! (s && s.has(prop));
  }

  function computeRules(state) {
    const texts = state.entities.filter((e) => e.category === 'text');
    const at = (x, y) => texts.filter((t) => t.x === x && t.y === y);
    const sentences = [];

    function checkLine(x, y, dx, dy) {
      const a = at(x, y).find((t) => t.cat === 'NOUN');
      if (!a) return;
      const isb = at(x + dx, y + dy).find((t) => t.word === 'IS');
      if (!isb) return;
      let nx = x + 2 * dx, ny = y + 2 * dy;
      let notFlag = false;
      let c = at(nx, ny).find(
        (t) => t.cat === 'NOUN' || t.cat === 'PROPERTY' || (t.cat === 'PREFIX' && t.word === 'NOT')
      );
      if (c && c.cat === 'PREFIX' && c.word === 'NOT') {
        notFlag = true;
        nx += dx; ny += dy;
        c = at(nx, ny).find((t) => t.cat === 'NOUN' || t.cat === 'PROPERTY');
      }
      if (!c) return;
      const cells = [[x, y], [x + dx, y + dy], [nx, ny]];
      if (notFlag) cells.push([nx - dx, ny - dy]); // NOT 格
      sentences.push({ noun: a.word, prop: c.word, not: notFlag, cells });
    }

    for (const t of texts) {
      checkLine(t.x, t.y, 1, 0); // 横向
      checkLine(t.x, t.y, 0, 1); // 纵向
    }

    // 第一遍：结构规则 → 临时属性集（用于 STOP 阻断判定）
    const prov = {};
    const padd = (n, p) => { (prov[n] = prov[n] || new Set()).add(p); };
    for (const s of sentences) if (!s.not) padd(s.noun, s.prop);

    // STOP 阻断：规则所占三/四格中若有 STOP 物体实体，则该句失效
    function blocked(s) {
      for (const [cx, cy] of s.cells) {
        const objs = state.entities.filter((e) => e.x === cx && e.y === cy);
        for (const o of objs) {
          const noun = o.category === 'text' ? 'TEXT' : o.noun;
          const set = prov[noun];
          if (set && set.has('STOP')) return true;
        }
      }
      return false;
    }
    const active = sentences.filter((s) => !blocked(s));

    // 第二遍：生效规则 → 最终属性集 / 转换 / 消除
    const props = {};
    const fadd = (n, p) => { (props[n] = props[n] || new Set()).add(p); };
    const transforms = [];
    const empties = [];
    for (const s of active) {
      if (s.not) continue;
      if (s.prop === 'EMPTY') { empties.push(s.noun); continue; }
      if (isNounWord(s.prop)) transforms.push({ from: s.noun, to: s.prop });
      else fadd(s.noun, s.prop);
    }
    // 负规则：移除属性
    for (const s of active) {
      if (!s.not) continue;
      const set = props[s.noun];
      if (set) set.delete(s.prop);
    }

    state.props = props;
    state.transforms = transforms;
    state.empties = empties;
    state.activeSentences = active;
  }

  // ---------- 移动 ----------
  // 尝试把 entity（及其推动链）沿 (dx,dy) 移动一格；成功返回 true 并把链成员记入 moved
  function tryMove(state, entity, dx, dy, moved) {
    const chain = [entity];
    const chainIds = new Set([entity.id]);
    let cx = entity.x, cy = entity.y;
    while (true) {
      cx += dx; cy += dy;
      if (cx < 0 || cy < 0 || cx >= state.w || cy >= state.h) return false; // 出界

      const occ = state.entities.filter((e) => e.x === cx && e.y === cy);

      if (occ.length === 0) break; // 前方为空，可移动

      // 早期退出，如果第一格就被STOP阻挡
      if (occ.some(e => hasProp(state, e, 'STOP'))) return false;

      let hasStop = false;
      const pushables = [];
      for (const o of occ) {
        if (o.id === entity.id) continue;
        if (hasProp(state, o, 'STOP')) { hasStop = true; break; }
        // 文本块总是可推的，或者物体具有PUSH/YOU属性
        const pushable = o.category === 'text' || hasProp(state, o, 'PUSH') || hasProp(state, o, 'YOU');
        if (pushable) pushables.push(o);
      }
      if (hasStop) return false; // STOP 阻挡
      if (pushables.length > 0) {
        for (const o of pushables) if (!chainIds.has(o.id)) { chainIds.add(o.id); chain.push(o); }
        continue; // 继续向前扫描整条推动链
      }
      break; // 仅有可穿越（非 PUSH/非 STOP）物体 → 重叠进入
    }
    for (const o of chain) {
      o.x += dx; o.y += dy;
      if (o.category === 'object') o.lastDir = { x: dx, y: dy };
      moved.add(o.id);
    }
    return true;
  }

  function applyInput(state, dir) {
    if (state.status !== 'playing') return state.status;
    computeRules(state);
    const yous = state.entities.filter((e) => hasProp(state, e, 'YOU'));
    // 沿移动方向「前排优先」，避免互相卡住
    yous.sort((a, b) => (b.x * dir.x + b.y * dir.y) - (a.x * dir.x + a.y * dir.y));
    const moved = new Set();
    for (const e of yous) {
      if (moved.has(e.id)) continue;
      tryMove(state, e, dir.x, dir.y, moved);
    }
    // MOVE 物体：按其 lastDir 自动移动（已本回合动过的跳过）
    const movers = state.entities.filter(
      (e) => e.category === 'object' && hasProp(state, e, 'MOVE') && !moved.has(e.id)
    );
    for (const e of movers) {
      const ld = e.lastDir;
      if (!ld) continue;
      tryMove(state, e, ld.x, ld.y, moved);
    }

    computeRules(state);
    applyTransforms(state);
    computeRules(state);
    resolveInteractions(state);
    return state.status;
  }

  function applyTransforms(state) {
    for (const t of state.transforms) {
      for (const e of state.entities) {
        if (e.category === 'object' && e.noun === t.from) e.noun = t.to;
      }
    }
    if (state.empties.length) {
      const rm = new Set();
      for (const n of state.empties) {
        for (const e of state.entities) if (e.category === 'object' && e.noun === n) rm.add(e.id);
      }
      if (rm.size) {
        state.entities = state.entities.filter((e) => !rm.has(e.id));
      }
    }
  }

  function resolveInteractions(state) {
    const yous = state.entities.filter((e) => hasProp(state, e, 'YOU'));
    // 胜利：任意 YOU 与 WIN 同格
    let won = false;
    for (const y of yous) {
      const here = state.entities.filter((e) => e.x === y.x && e.y === y.y);
      if (here.some((e) => hasProp(state, e, 'WIN'))) { won = true; break; }
    }
    const toRemove = new Set();
    // 失败（DEFEAT）：YOU 与 DEFEAT 同格 → YOU 死亡
    for (const y of yous) {
      const here = state.entities.filter((e) => e.x === y.x && e.y === y.y && e.id !== y.id);
      if (here.some((e) => hasProp(state, e, 'DEFEAT'))) toRemove.add(y.id);
    }
    // SINK：一格内有 SINK 且有其他物体 → 全部销毁（含 SINK 自身）
    const cellMap = new Map();
    for (const e of state.entities) {
      const k = e.x + ',' + e.y;
      if (!cellMap.has(k)) cellMap.set(k, []);
      cellMap.get(k).push(e);
    }
    for (const arr of cellMap.values()) {
      const sinks = arr.filter((e) => hasProp(state, e, 'SINK'));
      if (sinks.length > 0 && arr.length > sinks.length) {
        for (const e of arr) toRemove.add(e.id);
      }
      // MELT + HOT：MELT 被 HOT 融化
      const hot = arr.filter((e) => hasProp(state, e, 'HOT'));
      const melt = arr.filter((e) => hasProp(state, e, 'MELT'));
      if (hot.length > 0 && melt.length > 0) {
        for (const e of melt) toRemove.add(e.id);
      }
    }
    if (toRemove.size) state.entities = state.entities.filter((e) => !toRemove.has(e.id));

    if (won) state.status = 'won';
    else {
      const yousLeft = state.entities.filter((e) => hasProp(state, e, 'YOU'));
      if (yousLeft.length === 0) state.status = 'lost';
    }
  }

  // ---------- 便捷查询（供 UI） ----------
  function activeRuleStrings(state) {
    return state.activeSentences
      .map((s) => s.noun + ' IS ' + (s.not ? 'NOT ' : '') + s.prop)
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  return {
    NOUNS, PROPS, TEXT_CHARS, OBJ_CHARS,
    loadLevel, cloneState, serialize, computeRules, hasProp,
    tryMove, applyInput, applyTransforms, resolveInteractions, activeRuleStrings,
  };
});
