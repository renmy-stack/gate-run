// node test_sim.js — ゲートの選び方ぜんぶ（2^ゲート数）を試して、スコアの分布と最高を見る
'use strict';
const GR = require('./sim.js');
const { botRun } = require('./bot.js');
const course = GR.COURSE;
const gates = course.items.filter(i => i.type === 'gate');
const res = [];
for (let m = 0; m < (1 << gates.length); m++) {
  const picks = []; for (let g = 0; g < gates.length; g++) picks.push((m >> g) & 1 ? 1 : -1);
  const { S, inputs } = botRun(picks);
  res.push({ n: S.phase === 'goal' ? S.n : 0, score: S.phase === 'goal' ? S.score : 0, mult: S.mult, phase: S.phase, sec: S.f / 60, picks: S.picks.join(''), inputs, z: S.z });
}
res.sort((a, b) => b.score - a.score);
const sc = res.map(r => r.score);
const dead = res.filter(r => r.phase === 'dead');
const pct = p => sc[Math.floor((sc.length - 1) * (1 - p))];
console.log('ゲート', gates.length, '通り', res.length, ' ぜんめつ', dead.length, '（' + Math.round(dead.length / res.length * 100) + '%）');
const dz = {}; for (const r of dead) { const k = Math.round(r.z); dz[k] = (dz[k] || 0) + 1; }
console.log('ぜんめつした場所(m):', JSON.stringify(dz));
console.log('最高', res[0].n + '人 ×' + res[0].mult + ' = ' + res[0].score, res[0].picks, res[0].sec.toFixed(1) + '秒');
console.log('分位  90%:', pct(0.9), ' 75%:', pct(0.75), ' 50%:', pct(0.5), ' 25%:', pct(0.25));
// 「目先の大きいほう」を取る人
const greedy = []; let n = 1;
for (const it of gates) { const a = it.l ? GR.applyOp(n, it.l) : n, b = it.r ? GR.applyOp(n, it.r) : n; greedy.push(a >= b ? -1 : 1); n = Math.max(a, b); }
const g = botRun(greedy).S;
console.log('目先の大きいほう:', g.phase, g.n + '人 ×' + g.mult + ' = ' + g.score, g.picks.join(''), (g.f / 60).toFixed(1) + '秒');
// リプレイ一致
const r0 = res[0], rr = GR.run(r0.inputs);
console.log('リプレイ一致:', rr.score === r0.score && rr.phase === 'goal' ? 'OK' : 'NG ' + rr.score + ' ' + rr.phase);
module.exports = { best: res[0] };
