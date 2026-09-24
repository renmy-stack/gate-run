// node tune.js [変更JSON] [回数] — コースの数値を一時的に変えて、人間らしいプレイヤーで測る
// 例: node tune.js '{"9":{"op":["x",2]},"23":{"n":500},"add":[{"type":"enemy","z":100,"n":40}]}'
//   数字のキー = COURSE.items の番号（その項目を上書き）、add = 項目を足す、del = 番号の配列で消す
'use strict';
const GR = require('./sim.js');
const { play } = require('./human.js');

const ch = JSON.parse(process.argv[2] || '{}');
const N = +(process.argv[3] || 3000);
let items = GR.COURSE.items.map(x => Object.assign({}, x));
for (const k of Object.keys(ch)) if (/^\d+$/.test(k)) Object.assign(items[+k], ch[k]);
if (ch.del) items = items.filter((x, i) => !ch.del.includes(i));
if (ch.add) items = items.concat(ch.add);
items.sort((a, b) => (a.z != null ? a.z : a.z0) - (b.z != null ? b.z : b.z0));
GR.COURSE.items.length = 0; for (const x of items) GR.COURSE.items.push(x);

const where = {}, goalN = [];
let dead = 0; const mg = { hit: [0, 0], miss: [0, 0] };
const mgId = GR.COURSE.items.findIndex(x => x.type === 'mgate');
for (let i = 1; i <= N; i++) {
  const { S, log } = play(i);
  const hit = mgId >= 0 && S.items[mgId].done && log.some(l => l[1] === 'gate' && Math.abs(l[0] - GR.COURSE.items[mgId].z) < 1 && l[2]);
  const key = hit ? 'hit' : 'miss';
  mg[key][0]++;
  if (S.phase === 'dead') {
    dead++;
    // ぜんめつした場所 = いちばん近い仕掛け
    const it = S.fightWith || S.items.filter(x => x.z != null && x.z <= S.z + 3).pop();
    const nm = it ? (it.boss ? 'ボス' : it.type) + '@' + it.z : '?';
    where[nm] = (where[nm] || 0) + 1;
  } else { mg[key][1]++; goalN.push(S.n); }
}
goalN.sort((a, b) => a - b);
// 最上段が 1% になる 1 段の人数（最上段 = 210 × その人数）
const k1 = goalN.length ? goalN[Math.max(0, goalN.length - Math.round(N * 0.01))] : 0;
const cost = Math.max(1, Math.round(k1 / 210));
const top = goalN.filter(n => n >= 210 * cost).length;
console.log('ぜんめつ ' + (dead / N * 100).toFixed(1) + '%   最上段 ' + (top / N * 100).toFixed(1) + '%（1段 ' + cost + ' 人）');
console.log('ぜんめつ場所: ' + Object.entries(where).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + (v / N * 100).toFixed(1) + '%').join(' / '));
const pr = k => mg[k][0] ? (mg[k][1] / mg[k][0] * 100).toFixed(0) + '%（' + mg[k][0] + '回）' : '-';
console.log('生き残り: ×4 当てた ' + pr('hit') + '  外した ' + pr('miss'));
const q = p => goalN[Math.floor(goalN.length * p)];
console.log('ゴール人数 25%:' + q(.25) + ' 50%:' + q(.5) + ' 75%:' + q(.75) + ' 99%:' + q(.99));
