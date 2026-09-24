// テスト用のボット: ゲート（としきり）は picks どおり、それ以外の仕掛けは「少し先まで試して いちばん減らない位置」を選ぶ
'use strict';
const GR = require('./sim.js');
function clone(S) { const c = JSON.parse(JSON.stringify(S)); c.course = S.course; if (S.fightWith) c.fightWith = c.items[S.fightWith.id]; return c; }
function botRun(picks, opt) {
  opt = opt || {};
  const S = GR.create();
  const inputs = [], plan = {};
  let gi = 0;
  for (const it of S.items) if (it.type === 'gate') plan[it.id] = picks[gi++] || 1;
  // しきりは中の最初のゲートの選び方に合わせる
  for (const it of S.items) if (it.type === 'div') { const g = S.items.find(x => x.type === 'gate' && x.z > it.z0); plan[it.id] = plan[g.id]; }
  while (S.phase !== 'goal' && S.phase !== 'dead' && S.f < 60 * 120) {
    const next = S.items.find(it => !it.done && it.z + 3 > S.z && it.type !== 'div' || (it.type === 'div' && !it.done && S.z < it.z0));
    let tx = 0;
    if (next) {
      if (next.type === 'div' || next.type === 'gate') tx = plan[next.id];
      else if (next.type === 'enemy' && next.boss) tx = 0;
      else {
        if (plan[next.id] == null || opt.replan) {
          // 候補の位置で、この仕掛けを過ぎるまで走ってみる
          let best = null;
          for (const c of [-1, -0.5, 0, 0.5, 1]) {
            const T = clone(S);
            while (T.phase !== 'dead' && T.phase !== 'goal' && !T.items[next.id].done && T.f < S.f + 600) { GR.step(T, c); T.fx.length = 0; }
            const v = T.phase === 'dead' ? -1 : T.n;
            if (!best || v > best.v) best = { c, v };
          }
          plan[next.id] = best.c;
        }
        tx = plan[next.id];
      }
    }
    inputs.push(Math.round(tx * 100));
    GR.step(S, tx);
    if (opt.log) for (const e of S.fx) if (e.t !== 'fight') opt.log(S, e);
    S.fx.length = 0;
  }
  return { S, inputs };
}
module.exports = { botRun };
