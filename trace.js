// node trace.js LRLR... — 作戦どおり走って、アイテムごとの人数を出す
'use strict';
const GR = require('./sim.js');
const picks = (process.argv[2] || '').split('').map(c => c === 'L' ? -1 : 1);
const S = GR.create(); let gi = 0; const plan = [];
for (const it of S.items) plan.push(it.type === 'gate' ? (picks[gi++] || 1) : it.type === 'enemy' ? (it.x ? (it.x > 0 ? -1 : 1) : 0) : it.type === 'bar' ? (it.x0 < 0 ? 1 : -1) : it.type === 'div' ? (picks[gi] || 1) : it.type === 'saw' ? (GR.sawX(it, GR.START_F + Math.round(it.z / GR.SPEED * GR.FPS)) > 0 ? -1 : 1) : 0);
while (S.phase !== 'goal' && S.phase !== 'dead') {
  const next = S.items.find(it => !it.done && it.z + 3 > S.z);
  GR.step(S, next ? plan[next.id] : 0);
  for (const e of S.fx) if (e.t !== 'fight') console.log((S.f / 60).toFixed(2), 'z' + S.z.toFixed(0), e.t, e.id != null ? S.items[e.id].type + '#' + e.id : '', e.op ? GR.opText(e.op) : '', e.k || '', '→', S.n, 'x=' + S.x.toFixed(2));
  S.fx.length = 0;
}
console.log(S.phase, S.n);
