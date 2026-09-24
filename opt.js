// node opt.js [試す数] — コースの k つき数値を、人間らしいプレイヤーで探す
// 目標: ぜんめつ約 50% / 最上段約 1%（1 段の人数も決める）/ 1 か所で ぜんめつの 4 割を超えない / 動くゲートの当たり外れで生き残り率が大きく変わらない
'use strict';
const GR = require('./sim.js');
const { play } = require('./human.js');
const base = GR.COURSE.items.map(x => JSON.parse(JSON.stringify(x)));
function apply(cfg) {
  GR.COURSE.items.length = 0;
  for (const x of base) {
    const y = JSON.parse(JSON.stringify(x));
    if (y.k === 'm1') y.op = ['+', cfg.m1];
    else if (y.k === 'm2') y.op = ['+', cfg.m2];
    else if (y.k && cfg[y.k] != null) y.n = cfg[y.k];
    GR.COURSE.items.push(y);
  }
}
function measure(cfg, N) {
  apply(cfg);
  const mgs = GR.COURSE.items.map((x, i) => x.type === 'mgate' ? i : -1).filter(i => i >= 0);
  const where = {}, goalN = [], mg = mgs.map(() => ({ hit: [0, 0], miss: [0, 0] }));
  let dead = 0;
  for (let i = 1; i <= N; i++) {
    const { S, log } = play(i);
    const alive = S.phase === 'goal';
    mgs.forEach((id, j) => {
      const z = GR.COURSE.items[id].z;
      if (!S.items[id].done) return;   // 着く前に ぜんめつ
      const hit = log.some(l => l[1] === 'gate' && Math.abs(l[0] - z) < 1 && l[2]);
      const m = mg[j][hit ? 'hit' : 'miss']; m[0]++; if (alive) m[1]++;
    });
    if (!alive) {
      dead++;
      const it = S.fightWith || S.items.filter(x => x.z != null && x.z <= S.z + 3).pop();
      const nm = it ? (it.boss ? 'ボス' : it.type) + '@' + it.z : '?';
      where[nm] = (where[nm] || 0) + 1;
    } else goalN.push(S.n);
  }
  goalN.sort((a, b) => a - b);
  // 最上段が 1% に いちばん近い 1 段の人数
  let best = null;
  for (let c = 0.5; c <= 40; c += 0.25) { const top = goalN.filter(n => n >= Math.ceil(c * GR.STEPS * (GR.STEPS + 1) / 2)).length / N; if (!best || Math.abs(top - 0.01) < Math.abs(best.top - 0.01)) best = { c, top }; }
  const shares = Object.values(where).map(v => v / Math.max(1, dead));
  const gaps = mg.map(m => (m.hit[0] ? m.hit[1] / m.hit[0] : 0) - (m.miss[0] ? m.miss[1] / m.miss[0] : 0));
  const d = dead / N;
  const score = Math.abs(d - 0.5) * 4 + Math.max(0, Math.max(...shares, 0) - 0.4) * 2 + gaps.reduce((a, g) => a + Math.max(0, g - 0.25), 0) + Math.abs(best.top - 0.01) * 20;
  return { cfg, d, where, dead, cost: best.c, top: best.top, gaps, score, N };
}
function show(r) {
  const w = Object.entries(r.where).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + (v / r.N * 100).toFixed(0) + '%').join(' / ');
  console.log(JSON.stringify(r.cfg), ' ぜんめつ ' + (r.d * 100).toFixed(1) + '%  最上段 ' + (r.top * 100).toFixed(1) + '%（1段 ' + r.cost + '人）  当たり外れの差 ' + r.gaps.map(g => Math.round(g * 100) + '点').join(',') + '  場所: ' + w + '  score ' + r.score.toFixed(2));
}
module.exports = { measure, show, apply };
if (require.main !== module) return;
let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const T = +(process.argv[2] || 120);
const res = [];
const seen = new Set();
for (let t = 0; t < T; t++) {
  const cfg = { e1: pick([12, 16, 20]), e2: pick([45, 50, 55, 60, 65]), e3: pick([120, 150, 180, 210]), boss: pick([110, 130, 150, 180, 220]), m1: pick([40, 50]), m2: pick([40, 60, 80]) };
  const key = JSON.stringify(cfg); if (seen.has(key)) continue; seen.add(key);
  res.push(measure(cfg, 1200));
}
res.sort((a, b) => a.score - b.score);
console.log('--- 上位（1200 回）');
for (const r of res.slice(0, 8)) show(r);
console.log('--- 上位 3 つを 5000 回で');
for (const r of res.slice(0, 3)) show(measure(r.cfg, 5000));
