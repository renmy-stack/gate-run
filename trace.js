// node trace.js LRLR... — 作戦どおり走って、アイテムごとの人数を出す
'use strict';
const GR = require('./sim.js');
const { botRun } = require('./bot.js');
const picks = (process.argv[2] || '').split('').map(c => c === 'L' ? -1 : 1);
const { S } = botRun(picks, { log: (S, e) => console.log((S.f / 60).toFixed(2), 'z' + S.z.toFixed(0), e.t, e.id != null ? S.items[e.id].type + '#' + e.id : '', e.op ? GR.opText(e.op) : '', e.k || '', '→', S.n, 'x=' + S.x.toFixed(2)) });
console.log(S.phase, S.n, '×' + S.mult, '=', S.score);
