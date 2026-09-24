// node test_sim.js — ゲートの選び方ぜんぶ（2^ゲート数）を試して、スコアの分布と最高を見る
'use strict';
const GR = require('./sim.js');

// 作戦 plan: アイテムごとの狙う位置（-1 左 / 0 まんなか / 1 右）。ひとつ前のアイテムを過ぎたら次の狙いへ動く
function botRun(plan, course) {
  course = course || GR.COURSE;
  const S = GR.create(course);
  const inputs = [];
  while (S.phase !== 'goal' && S.phase !== 'dead' && S.f < 60 * 120) {
    const next = S.items.find(it => !it.done && it.z + 3 > S.z);
    let tx = next ? plan[next.id] : 0;
    inputs.push(Math.round(tx * 100));
    GR.step(S, tx); S.fx.length = 0;
  }
  return { S, inputs };
}
function heuristic(course, gatePicks) {
  const plan = [], gi = [0];
  for (const it of course.items) {
    if (it.type === 'gate') plan.push(gatePicks[gi[0]++]);
    else if (it.type === 'enemy') plan.push(it.x == null || it.x === 0 ? 0 : (it.x > 0 ? -1 : 1));
    else if (it.type === 'bar') plan.push(it.x0 < 0 ? 1 : -1);
    else if (it.type === 'div') plan.push(gatePicks[gi[0]]);
    else if (it.type === 'saw') { const f = GR.START_F + Math.round(it.z / GR.SPEED * GR.FPS); plan.push(GR.sawX(it, f) > 0 ? -1 : 1); }
    else plan.push(0);
  }
  return plan;
}
const course = GR.COURSE;
const nGates = course.items.filter(i => i.type === 'gate').length;
const res = [];
for (let m = 0; m < (1 << nGates); m++) {
  const picks = []; for (let g = 0; g < nGates; g++) picks.push((m >> g) & 1 ? 1 : -1);
  const { S, inputs } = botRun(heuristic(course, picks));
  res.push({ m, n: S.phase === 'goal' ? S.n : 0, phase: S.phase, sec: S.f / 60, picks: S.picks.join(''), inputs });
}
res.sort((a, b) => b.n - a.n);
const ns = res.map(r => r.n);
const dead = res.filter(r => r.phase === 'dead').length;
const pct = p => ns[Math.floor((ns.length - 1) * (1 - p))];
console.log('ゲート', nGates, '通り', res.length, ' ぜんめつ', dead, '（' + Math.round(dead / res.length * 100) + '%）');
console.log('最高', res[0].n, res[0].picks, res[0].sec.toFixed(1) + '秒');
console.log('上位5', res.slice(0, 5).map(r => r.n + ' ' + r.picks).join(' / '));
console.log('分位  90%:', pct(0.9), ' 75%:', pct(0.75), ' 50%:', pct(0.5), ' 25%:', pct(0.25));
// 「目先の大きいほう」を取る人
const greedy = []; let n = 1;
for (const it of course.items) if (it.type === 'gate') { const a = it.l ? GR.applyOp(n, it.l) : n, b = it.r ? GR.applyOp(n, it.r) : n; greedy.push(a >= b ? -1 : 1); n = Math.max(a, b); }
const g = botRun(heuristic(course, greedy)).S;
console.log('目先の大きいほう:', g.phase, g.n, g.picks.join(''), (g.f / 60).toFixed(1) + '秒');
// リプレイ一致
const r0 = res[0], rr = GR.run(r0.inputs);
console.log('リプレイ一致:', rr.n === r0.n && rr.phase === 'goal' ? 'OK' : 'NG ' + rr.n + ' ' + rr.phase);
