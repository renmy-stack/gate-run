// ふやせ！ゲートラン — 走る・ゲート・敵・障害物（DOM 非依存。Node でも動く）
// 決定的: 1 フレーム = 1/60 秒の固定ステップ、入力は毎フレームの「指の位置」（-1〜1 を 1/100 きざみ）だけ。Math.sin/cos は使わない
'use strict';
(function (root) {

const SIM_VERSION = 4;          // コース・数値を変えたら上げる（古い記録は捨てる）
const FPS = 60;
const RW = 5;                   // 道の半幅（m）
const SPEED = 12;               // 前に進む速さ（m/秒）
const SIDE = 18;                // 横に動く速さの上限（m/秒）
const GAP = 0.24;               // 人と人の間隔（群衆の広がり）
const SHOWN = 120;              // 絵として並べる最大人数（それ以上は数字だけ増える）
const FIGHT_DIV = 22;           // ぶつかったとき 1 フレームで減る数 = ceil(少ないほう / これ)
const BOSS_DIV = 40;            // ボスは ゆっくり減る
const START_F = 60;             // スタートまでの間
const CUT_CAP = 0.25;           // 動く仕掛け（ノコ・回るぼう・プレス）で 1 回に減るのは この割合まで
// ゴールのあとの かいだん: k 段目に上るには 6×k 人いる（ボス 730 と組で、人が遊んで ぜんめつ約 50%・最上段 約 1%。human.js 5000 --stats で確認）。倍率は 1 + 0.1×k（最大 20 段 = ×3.0）
const STEP_COST = 6, STEP_MULT = 0.1, STEPS = 20;

const PI = 3.141592653589793, TWO_PI = PI * 2, HALF_PI = PI / 2;
function wrapAngle(x) { x = x % TWO_PI; if (x > PI) x -= TWO_PI; else if (x < -PI) x += TWO_PI; return x; }
function dsin(x) {
  x = wrapAngle(x);
  if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))));
}
function dcos(x) { return dsin(x + HALF_PI); }
function frac(x) { return x - Math.floor(x); }

// 群衆の並び（ひまわりの種の並び）。i 番目の人の、中心からのずれ
const FORM = [];
for (let i = 0; i < SHOWN; i++) {
  const r = GAP * Math.sqrt(i + 0.5) * 1.02, a = i * 2.399963229728653;
  FORM.push({ x: r * dcos(a), z: r * dsin(a) });
}
function shown(n) { return Math.min(n, SHOWN); }
function radius(n) { return n <= 0 ? 0 : GAP * Math.sqrt(shown(n)) * 1.02 + 0.2; }

// ---------- コース ----------
// gate:  左右のゲート（null は何もない側）。op は '+', '-', 'x', '/'
// div:   しきり（z0〜z1 は入った側から出られない）
// enemy: 赤い群れ（x は中心、x を省くと道のまんなか）。boss: true は巨人（よけられない・ゆっくり減る）
// ally:  灰色の人たち。触れると仲間になる
// saw:   左右に動く回転ノコ（半径 r、振れ幅 amp、周期 per 秒、位相 ph）
// bar:   動かない しましまの壁（x0〜x1 をふさぐ）
// hole:  落とし穴（x0〜x1）
// spin:  地面で回る棒（中心 px、片側の長さ len、1 回転 per 秒）
// press: 上下するプレス（x0〜x1、周期 per 秒、下りている割合 down）
// mgate: 左右に動く 1 枚ゲート（はば w）
const G = (z, l, r) => ({ type: 'gate', z, l, r });
const COURSE = {
  name: 'コース1',
  length: 318,
  items: [
    G(20, ['+', 5], ['x', 2]),
    { type: 'ally', z: 30, x: -3.2, n: 6 },
    G(42, ['x', 3], ['+', 10]),
    { type: 'hole', z: 56, x0: -1.7, x1: 1.7, d: 3 },
    // しきり: 同じ 2 つでも「たす → かける」のほうが得
    { type: 'div', z0: 66, z1: 94 },
    G(70, ['+', 10], ['x', 2]),
    G(88, ['x', 3], ['+', 15]),
    { type: 'enemy', z: 106, x: 2.5, n: 30 },
    { type: 'spin', z: 120, px: 0, len: 3.2, per: 2.4, ph: 0 },
    { type: 'mgate', z: 134, op: ['x', 4], w: 2.6, amp: 3.2, per: 2.6, ph: 0.25 },
    { type: 'press', z: 146, x0: -RW, x1: 0, per: 1.4, ph: 0, down: 0.5 },
    { type: 'press', z: 146, x0: 0, x1: RW, per: 1.4, ph: 0.5, down: 0.5 },
    // しきり: 目先の ×2 のほうは中に敵がいる
    { type: 'div', z0: 158, z1: 198 },
    G(162, ['x', 2], ['+', 40]),
    { type: 'enemy', z: 176, x: -2.6, n: 50 },
    G(192, ['+', 30], ['x', 2]),
    { type: 'ally', z: 206, x: 3.2, n: 40 },
    { type: 'enemy', z: 218, n: 60 },
    G(232, ['/', 2], ['+', 80]),
    { type: 'saw', z: 246, r: 0.9, amp: 3.4, per: 1.6, ph: 0.5 },
    { type: 'saw', z: 254, r: 0.9, amp: 3.4, per: 1.6, ph: 0 },
    G(268, ['x', 3], ['-', 30]),
    { type: 'bar', z: 280, x0: 0.8, x1: RW },
    { type: 'enemy', z: 300, n: 730, boss: true },
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
    steps: 0, mult: 1, score: 0,
  };
}
function sawX(it, f) { return it.amp * dsin(TWO_PI * (f / FPS / it.per + it.ph)); }
function mgateX(it, f) { return it.amp * dsin(TWO_PI * (f / FPS / it.per + it.ph)); }
function spinAng(it, f) { return TWO_PI * (f / FPS / it.per + it.ph); }
function pressDown(it, f) { return frac(f / FPS / it.per + it.ph) < it.down; }
// プレスの高さ（0 = 下りきり、1 = 上がりきり）。見た目用
function pressLift(it, f) {
  const t = frac(f / FPS / it.per + it.ph);
  if (t < it.down) return 0;
  const u = (t - it.down) / (1 - it.down);
  return u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1;
}
function applyOp(n, op) {
  const [k, v] = op;
  if (k === '+') return n + v;
  if (k === '-') return Math.max(0, n - v);
  if (k === 'x') return n * v;
  return Math.floor(n / v);
}
function opText(op) { return op ? ({ '+': '+', '-': '−', 'x': '×', '/': '÷' })[op[0]] + op[1] : ''; }
function opGood(op) { return op && (op[0] === '+' || op[0] === 'x'); }
// n 人で上れる段数
function stairsFor(n) { let k = 0; while (k < STEPS && STEP_COST * (k + 1) * (k + 2) / 2 <= n) k++; return k; }
function stairCost(k) { return STEP_COST * k * (k + 1) / 2; }
function stairMult(k) { return Math.round((1 + STEP_MULT * k) * 10) / 10; }

function die(S) { S.n = 0; S.phase = 'dead'; S.fx.push({ t: 'dead' }); }

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
    const k = Math.max(1, Math.ceil(Math.min(S.n, e.m) / (e.boss ? BOSS_DIV : FIGHT_DIV)));
    S.n -= k; e.m -= k;
    S.fx.push({ t: 'fight', k, x: (S.x + e.x) / 2, z: S.z + R, boss: !!e.boss });
    if (S.n <= 0) { die(S); return; }
    if (e.m <= 0) { e.m = 0; e.done = true; S.fightWith = null; S.phase = 'run'; S.fx.push({ t: 'win', id: e.id, x: e.x, z: e.z, boss: !!e.boss }); }
    return;
  }

  const z0 = S.z;
  S.z += SPEED / FPS;
  const cross = it => z0 < it.z && S.z >= it.z;
  for (const it of S.items) {
    if (it.done) continue;
    if (it.type === 'gate') {
      if (cross(it)) {
        it.done = true;
        const side = S.x < 0 ? -1 : 1, op = side < 0 ? it.l : it.r;
        const before = S.n;
        if (op) S.n = applyOp(S.n, op);
        S.picks.push(side < 0 ? 'L' : 'R');
        S.fx.push({ t: 'gate', id: it.id, side, op, before, after: S.n });
      }
    } else if (it.type === 'mgate') {
      if (cross(it)) {
        it.done = true;
        const gx = mgateX(it, S.f), hit = Math.abs(S.x - gx) < it.w / 2;
        const before = S.n;
        if (hit) S.n = applyOp(S.n, it.op);
        S.fx.push({ t: 'gate', id: it.id, side: 0, op: hit ? it.op : null, before, after: S.n, miss: !hit });
      }
    } else if (it.type === 'ally') {
      if (cross(it)) {
        it.done = true;
        const hit = Math.abs(S.x - it.x) < R + 0.9;
        if (hit) { S.n += it.n; S.fx.push({ t: 'join', id: it.id, k: it.n }); }
        else S.fx.push({ t: 'allymiss', id: it.id });
      }
    } else if (it.type === 'enemy') {
      const Re = it.boss ? 1.6 : radius(it.m);
      const touch = it.boss || Math.abs(S.x - it.x) < R + Re - 0.25;
      if (S.z + R >= it.z - Re && touch) {
        S.phase = 'fight'; S.fightWith = it; S.fx.push({ t: 'clash', id: it.id, boss: !!it.boss });
        return;
      }
      if (S.z - R > it.z + Re) it.done = true;   // よけて通りすぎた
    } else if (it.type === 'div') {
      if (S.z > it.z1) it.done = true;
      continue;
    } else if (cross(it)) {
      // 障害物: 群衆のまんなかが通る瞬間に、当たる位置にいる人の割合だけ減る
      it.done = true;
      const sn = shown(S.n), hitIdx = [];
      let ca = 0, sa = 0, down = true;
      if (it.type === 'spin') { const a = spinAng(it, S.f); ca = dcos(a); sa = dsin(a); }
      if (it.type === 'press') down = pressDown(it, S.f);
      for (let i = 0; i < sn; i++) {
        const px = S.x + FORM[i].x, pz = FORM[i].z;
        let hit = false;
        if (it.type === 'saw') hit = Math.abs(px - sawX(it, S.f)) < it.r + 0.2;
        else if (it.type === 'spin') {
          // 棒（中心から ±len）と人の距離
          const rx = px - it.px, t = Math.max(-it.len, Math.min(it.len, rx * ca + pz * sa));
          const dx = rx - t * ca, dz = pz - t * sa;
          hit = dx * dx + dz * dz < 0.35 * 0.35;
        } else if (it.type === 'press') hit = down && px > it.x0 - 0.1 && px < it.x1 + 0.1;
        else hit = px > it.x0 - 0.2 && px < it.x1 + 0.2;   // bar・hole
        if (hit) hitIdx.push(i);
      }
      if (hitIdx.length) {
        let k = Math.max(1, Math.round(S.n * hitIdx.length / sn));
        if (it.type === 'saw' || it.type === 'spin' || it.type === 'press') k = Math.min(k, Math.max(1, Math.ceil(S.n * CUT_CAP)));
        S.n = Math.max(0, S.n - k);
        S.fx.push({ t: it.type === 'hole' ? 'fall' : 'cut', id: it.id, k, idx: hitIdx, x: S.x, z: S.z });
      }
    }
    if (S.n <= 0) { die(S); return; }
  }
  S.best = Math.max(S.best, S.n);
  if (S.z >= S.course.length) {
    S.z = S.course.length; S.phase = 'goal';
    S.steps = stairsFor(S.n); S.mult = stairMult(S.steps); S.score = Math.floor(S.n * S.mult);
    S.fx.push({ t: 'goal' });
  }
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

const API = {
  SIM_VERSION, FPS, RW, SPEED, GAP, SHOWN, START_F, FORM, COURSE, STEPS, STEP_COST,
  create, step, run, radius, shown, sawX, mgateX, spinAng, pressDown, pressLift, applyOp, opText, opGood,
  stairsFor, stairCost, stairMult,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.GR = API;
})(this);
