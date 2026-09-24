// node human.js [回数] — 人間らしいプレイヤーで遊ぶ（反応の遅れ・指のブレ・見える範囲・目先で選ぶクセ）
// 実際のゲームと同じ sim.js を使う。入力は _human<N>.json に書き出すので ?shot=40&in=_human1.json でブラウザでも再生できる
'use strict';
const GR = require('./sim.js');
const fs = require('fs');

function rng(seed) { let s = seed >>> 0 || 1; const f = () => { s = (s * 1664525 + 1013904223) >>> 0; s = (s ^ (s >>> 13)) >>> 0; return s / 4294967296; }; for (let i = 0; i < 20; i++) f(); return f; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }

function play(seed) {
  const r = rng(seed * 7919);
  const P = {
    react: 0.25 + r() * 0.35,      // 反応の遅れ（秒）
    see: 40 + r() * 10,            // 気づく距離（m）
    think: r() < 0.35,             // しきりの中を先読みするか
    shake: 0.08 + r() * 0.1,       // 指のブレ
    finger: 2.2 + r() * 1.8,       // 指の速さ（tx/秒）
    slip: 0.03 + r() * 0.09,       // ゲートを見まちがえて 逆を選ぶ確率
  };
  const S = GR.create();
  const inputs = [], log = [];
  const delay = Math.round(P.react * GR.FPS);
  const want = [];               // 頭の中の「行きたい位置」の履歴（遅れて指に出る）
  let finger = 0, aim = 0, aimFor = null, noise = 0;
  const decided = {};
  while (S.phase !== 'goal' && S.phase !== 'dead' && S.f < 60 * 120) {
    // いちばん近い、まだ通っていない仕掛け（見える範囲だけ）
    const next = S.items.find(it => !it.done && (it.type === 'div' ? S.z < it.z0 : it.z + 2 > S.z) && (it.z || it.z0) - S.z < P.see);
    if (next && aimFor !== next.id) {
      aimFor = next.id; noise = gauss(r) * P.shake;
      if (decided[next.id] == null) decided[next.id] = decide(S, next, P, r);
    }
    if (next) {
      const d = decided[next.id];
      aim = typeof d === 'function' ? d(S) : d;
    }
    want.push(aim + noise);
    const target = want[Math.max(0, want.length - 1 - delay)];
    const step = P.finger / GR.FPS;
    finger += Math.max(-step, Math.min(step, target - finger));
    finger = Math.max(-1, Math.min(1, finger));
    const q = Math.round(finger * 100);
    inputs.push(q);
    GR.step(S, q / 100);
    for (const e of S.fx) if (e.t !== 'fight') log.push([S.z, e.t, e.k || (e.op ? GR.opText(e.op) : ''), S.n]);
    S.fx.length = 0;
  }
  return { S, inputs, P, log };
}

// 仕掛けを見たときの判断（数字 = 行きたい位置 -1〜1、関数 = 毎フレーム追いかける）
function decide(S, it, P, r) {
  const lane = x => x < 0 ? -1 : 1;
  switch (it.type) {
    case 'gate': {
      const a = it.l ? GR.applyOp(S.n, it.l) : S.n, b = it.r ? GR.applyOp(S.n, it.r) : S.n;
      const side = a >= b ? -0.8 : 0.8;
      return r() < P.slip ? -side : side;
    }
    case 'div': {
      // しきり: 中の最初のゲートを目先で比べる。先読みする人は中の全部を足し算・かけ算してみる
      const inside = S.items.filter(x => x.type === 'gate' && x.z > it.z0 && x.z < it.z1);
      const val = side => {
        let n = S.n;
        for (const g of (P.think ? inside : inside.slice(0, 1))) { const op = side < 0 ? g.l : g.r; if (op) n = GR.applyOp(n, op); }
        if (P.think) for (const e of S.items) if (e.type === 'enemy' && !e.boss && e.z > it.z0 && e.z < it.z1 && lane(e.x) === side) n -= e.n;
        return n;
      };
      const side = val(-1) >= val(1) ? -0.8 : 0.8;
      return r() < P.slip ? -side : side;
    }
    case 'enemy': return it.boss ? 0 : -lane(it.x) * 0.9;
    case 'ally': return lane(it.x) * 0.9;
    case 'hole': return (S.x < 0 ? -0.9 : 0.9) * (r() < P.slip ? -1 : 1);   // 近いほうへ よける（たまに逆へ行ってしまう）
    case 'bar': return it.x0 < 0 ? 0.9 : -0.9;
    case 'saw': return T => -lane(GR.sawX(it, T.f)) * 0.9;                  // ノコを見ながら いない側へ
    case 'spin': return r() < 0.5 ? -0.9 : 0.9;                             // 回る棒は読めないので どちらかの端
    case 'press': {
      // プレスを見ながら、いま上がっている側へ（遅れて動くので 間に合わないこともある）
      const ps = S.items.filter(x => x.type === 'press' && x.z === it.z);
      return T => { const up = ps.find(x => !GR.pressDown(x, T.f)); return up ? (up.x0 < 0 ? -0.7 : 0.7) : 0; };
    }
    case 'mgate': return T => { const R = GR.RW - GR.radius(T.n); return R > 0 ? Math.max(-1, Math.min(1, GR.mgateX(it, T.f) / R)) : 0; };  // 動くゲートを目で追う
  }
  return 0;
}

module.exports = { play };
if (require.main !== module) return;
const N = +(process.argv[2] || 10);
if (process.argv.includes('--stats')) {
  // たくさん遊ばせて分布だけ出す
  const ns = [], steps = new Array(GR.STEPS + 1).fill(0);
  let dead = 0, top = 0, sum = 0, mgHit = [0, 0], mgMiss = [0, 0];
  for (let i = 1; i <= N; i++) {
    const { S, log } = play(i);
    const hit = log.some(l => l[1] === 'gate' && l[0] > 133 && l[0] < 136 && l[2]);
    if (S.phase !== 'goal') { dead++; ns.push(0); continue; }
    ns.push(S.n); steps[S.steps]++; sum += S.score; if (S.steps === GR.STEPS) top++;
    if (hit) { mgHit[0]++; mgHit[1] += S.score; } else { mgMiss[0]++; mgMiss[1] += S.score; }
  }
  ns.sort((a, b) => a - b);
  const q = p => ns[Math.min(ns.length - 1, Math.floor(ns.length * p))];
  console.log(N + '回  最上段 ' + (top / N * 100).toFixed(1) + '%  ぜんめつ ' + (dead / N * 100).toFixed(1) + '%  平均 ' + Math.round(sum / N) + 'てん');
  console.log('ゴール人数  50%:' + q(0.5) + '  90%:' + q(0.9) + '  99%:' + q(0.99) + '  最高:' + ns[ns.length - 1] + '   （最上段に要る人数 ' + GR.stairCost(GR.STEPS) + '）');
  console.log('段の分布: ' + steps.map((c, k) => c ? k + '段:' + c : '').filter(Boolean).join(' '));
  process.exit(0);
}

const rows = [];
for (let i = 1; i <= N; i++) {
  const { S, inputs, P, log } = play(i);
  fs.writeFileSync('_human' + i + '.json', JSON.stringify(inputs));
  const losses = log.filter(l => ['cut', 'fall'].includes(l[1])).map(l => Math.round(l[0]) + 'm:−' + l[2]);
  const mg = log.find(l => l[1] === 'gate' && l[0] > 133 && l[0] < 136);
  rows.push({ i, S, P, losses, mg });
  console.log(
    String(i).padStart(2) + '回目', S.phase === 'goal' ? (S.score.toLocaleString() + 'てん').padStart(9) : '  ぜんめつ',
    S.phase === 'goal' ? '(' + S.n + '人 ×' + S.mult.toFixed(1) + ')' : '(' + Math.round(S.z) + 'm)',
    ' 選び ' + S.picks.join(''), P.think ? '先読み' : '目先  ',
    ' 反応' + P.react.toFixed(2) + 's',
    ' 減った所 ' + (losses.join(' ') || 'なし'));
}
const sc = rows.map(r => r.S.phase === 'goal' ? r.S.score : 0).sort((a, b) => a - b);
console.log('平均', Math.round(sc.reduce((a, b) => a + b, 0) / sc.length).toLocaleString(), ' 中央', sc[Math.floor(sc.length / 2)].toLocaleString(), ' 最高', sc[sc.length - 1].toLocaleString(), ' 最低', sc[0].toLocaleString());
