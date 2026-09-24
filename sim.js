// ふやせ！ゲートラン — 走る・ゲート・敵・障害物（DOM 非依存。Node でも動く）
// 決定的: 1 フレーム = 1/60 秒の固定ステップ、入力は毎フレームの「指の位置」（-1〜1 を 1/100 きざみ）だけ。Math.sin/cos は使わない
'use strict';
(function (root) {

const SIM_VERSION = 1;          // コース・数値を変えたら上げる（古い記録は捨てる）
const FPS = 60;
const RW = 5;                   // 道の半幅（m）
const SPEED = 12;               // 前に進む速さ（m/秒）
const SIDE = 18;                // 横に動く速さの上限（m/秒）
const GAP = 0.24;               // 人と人の間隔（群衆の広がり）
const SHOWN = 120;              // 絵として並べる最大人数（それ以上は数字だけ増える）
const FIGHT_DIV = 22;           // ぶつかったとき 1 フレームで減る数 = ceil(少ないほう / これ)
const START_F = 60;             // スタートまでの間

const PI = 3.141592653589793, TWO_PI = PI * 2, HALF_PI = PI / 2;
function wrapAngle(x) { x = x % TWO_PI; if (x > PI) x -= TWO_PI; else if (x < -PI) x += TWO_PI; return x; }
function dsin(x) {
  x = wrapAngle(x);
  if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))));
}
function dcos(x) { return dsin(x + HALF_PI); }

// 群衆の並び（ひまわりの種の並び）。i 番目の人の、中心からのずれ
const FORM = [];
for (let i = 0; i < SHOWN; i++) {
  const r = GAP * Math.sqrt(i + 0.5) * 1.02, a = i * 2.399963229728653;
  FORM.push({ x: r * dcos(a), z: r * dsin(a) });
}
function shown(n) { return Math.min(n, SHOWN); }
function radius(n) { return n <= 0 ? 0 : GAP * Math.sqrt(shown(n)) * 1.02 + 0.2; }

// ---------- コース ----------
// gate: 左右のゲート（null は何もない側）。op は '+', '-', 'x', '/'
// enemy: 赤い群れ（x は中心、x を省くと道のまんなか）
// saw: 左右に動く回転ノコ（半径 r、振れ幅 amp、周期 per 秒、位相 ph）
// bar: 動かない棒（x0〜x1 をふさぐ）
const G = (z, l, r) => ({ type: 'gate', z, l, r });
const COURSE = {
  name: 'コース1',
  length: 300,
  items: [
    G(20, ['+', 5], ['x', 2]),
    G(36, ['x', 3], ['+', 10]),
    { type: 'saw', z: 50, r: 0.9, amp: 3.6, per: 2.2, ph: 0 },
    // しきり: 入った側から出られない。同じ 2 つでも「たす → かける」のほうが得
    { type: 'div', z0: 60, z1: 90 },
    G(66, ['+', 10], ['x', 2]),
    G(84, ['x', 3], ['+', 15]),
    { type: 'enemy', z: 102, x: 2.5, n: 30 },
    G(118, ['-', 10], ['x', 3]),
    { type: 'bar', z: 124, x0: 0.6, x1: RW },
    { type: 'saw', z: 140, r: 0.9, amp: 3.4, per: 1.6, ph: 0.25 },
    // しきり: 目先の ×2 のほうは中に敵がいる
    { type: 'div', z0: 150, z1: 190 },
    G(156, ['x', 2], ['+', 40]),
    { type: 'enemy', z: 172, x: -2.6, n: 50 },
    G(184, ['+', 30], ['x', 2]),
    { type: 'enemy', z: 206, n: 60 },
    G(222, ['/', 2], ['+', 80]),
    { type: 'saw', z: 236, r: 0.9, amp: 3.4, per: 1.6, ph: 0.5 },
    { type: 'saw', z: 244, r: 0.9, amp: 3.4, per: 1.6, ph: 0 },
    G(258, ['x', 3], ['-', 30]),
    { type: 'enemy', z: 284, n: 100 },
  ],
};

// ---------- 試合 ----------
function create(course) {
  course = course || COURSE;
  const items = course.items.map((it, i) => Object.assign({ id: i, done: false }, it));
  for (const it of items) if (it.type === 'enemy') { it.m = it.n; if (it.x == null) it.x = 0; }
  return {
    course, items, f: 0, phase: 'ready',   // ready → run → (fight ⇄ run) → goal / dead
    z: 0, x: 0, n: 1, best: 1,
    fightWith: null, lane: null, fx: [], picks: [],
  };
}
function sawX(it, f) { return it.amp * dsin(TWO_PI * (f / FPS / it.per + it.ph)); }
function applyOp(n, op) {
  const [k, v] = op;
  if (k === '+') return n + v;
  if (k === '-') return Math.max(0, n - v);
  if (k === 'x') return n * v;
  return Math.floor(n / v);
}
function opText(op) { return op ? ({ '+': '+', '-': '−', 'x': '×', '/': '÷' })[op[0]] + op[1] : ''; }
function opGood(op) { return op && (op[0] === '+' || op[0] === 'x'); }

// tx: 指の位置 -1〜1（左端〜右端）
function step(S, tx) {
  S.f++;
  if (S.phase === 'goal' || S.phase === 'dead') return;
  if (S.phase === 'ready') { if (S.f >= START_F) S.phase = 'run'; return; }
  const R = radius(S.n);
  // 横移動（群衆が道からはみ出さない範囲に指の位置を対応させる）
  const want = Math.max(-1, Math.min(1, tx)) * Math.max(0, RW - R);
  const d = want - S.x, lim = SIDE / FPS;
  if (S.phase === 'run') S.x += Math.max(-lim, Math.min(lim, d));
  // しきりの中では反対側へ行けない
  let inDiv = null;
  for (const it of S.items) if (it.type === 'div' && S.z >= it.z0 && S.z <= it.z1) inDiv = it;
  if (inDiv) {
    if (S.lane == null) S.lane = S.x < 0 ? -1 : 1;
    S.x = S.lane * Math.max(S.lane * S.x, 0.4);
  } else S.lane = null;

  if (S.phase === 'fight') {
    const e = S.fightWith;
    const k = Math.max(1, Math.ceil(Math.min(S.n, e.m) / FIGHT_DIV));
    S.n -= k; e.m -= k;
    S.fx.push({ t: 'fight', k, x: (S.x + e.x) / 2, z: S.z + R });
    if (S.n <= 0) { S.n = 0; S.phase = 'dead'; S.fx.push({ t: 'dead' }); return; }
    if (e.m <= 0) { e.m = 0; e.done = true; S.fightWith = null; S.phase = 'run'; S.fx.push({ t: 'win', x: e.x, z: e.z }); }
    return;
  }

  const z0 = S.z;
  S.z += SPEED / FPS;
  for (const it of S.items) {
    if (it.done) continue;
    if (it.type === 'gate') {
      if (z0 < it.z && S.z >= it.z) {
        it.done = true;
        const op = S.x < 0 ? it.l : it.r;
        const before = S.n;
        if (op) S.n = applyOp(S.n, op);
        S.picks.push(S.x < 0 ? 'L' : 'R');
        S.fx.push({ t: 'gate', id: it.id, side: S.x < 0 ? -1 : 1, op, before, after: S.n });
      }
    } else if (it.type === 'enemy') {
      const Re = radius(it.m);
      if (S.z + R >= it.z - Re && Math.abs(S.x - it.x) < R + Re - 0.25) {
        S.phase = 'fight'; S.fightWith = it; S.fx.push({ t: 'clash', id: it.id });
        return;
      }
      if (S.z - R > it.z + Re) it.done = true;   // よけて通りすぎた
    } else if (it.type === 'div') {
      if (S.z > it.z1) it.done = true;
      continue;
    } else if (z0 < it.z && S.z >= it.z) {
      // 障害物: 群衆のまんなかが通る瞬間に、当たる位置にいる人の割合だけ減る
      it.done = true;
      const sn = shown(S.n), hitIdx = [];
      for (let i = 0; i < sn; i++) {
        const px = S.x + FORM[i].x;
        let hit;
        if (it.type === 'saw') { const dx = px - sawX(it, S.f); hit = Math.abs(dx) < it.r + 0.2; }
        else hit = px > it.x0 - 0.2 && px < it.x1 + 0.2;
        if (hit) hitIdx.push(i);
      }
      if (hitIdx.length) {
        const k = Math.max(1, Math.round(S.n * hitIdx.length / sn));
        S.n = Math.max(0, S.n - k);
        S.fx.push({ t: 'cut', id: it.id, k, idx: hitIdx });
      }
    }
    if (S.n <= 0) { S.n = 0; S.phase = 'dead'; S.fx.push({ t: 'dead' }); return; }
  }
  S.best = Math.max(S.best, S.n);
  if (S.z >= S.course.length) { S.z = S.course.length; S.phase = 'goal'; S.fx.push({ t: 'goal' }); }
}

// 入力列（1 フレーム 1 つ、-100〜100 の整数）から最後まで流す
function run(inputs, course, maxF) {
  const S = create(course);
  maxF = maxF || 60 * 120;
  while (S.phase !== 'goal' && S.phase !== 'dead' && S.f < maxF) {
    const v = inputs[Math.min(S.f, inputs.length - 1)] || 0;
    step(S, v / 100);
    S.fx.length = 0;
  }
  return S;
}

const API = { SIM_VERSION, FPS, RW, SPEED, GAP, SHOWN, START_F, FORM, COURSE, create, step, run, radius, shown, sawX, applyOp, opText, opGood };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.GR = API;
})(this);
