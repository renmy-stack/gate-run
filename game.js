// ふやせ！ゲートラン — 描画・入力・進行・シェア
'use strict';
const VERSION = '4';   // version.txt と合わせる。更新したら index.html の ?v= も上げる
const SITE_URL = 'https://renmy-stack.github.io/gate-run/';
const FPS = GR.FPS;

const $ = id => document.getElementById(id);
const cv = $('game'), ctx = cv.getContext('2d');
let W = 0, Hh = 0, DPR = 1, F = 300, HY = 300;
const CAM_Y = 8.5, CAM_BACK = 9;

// ---------- 記録 ----------
const KEY = 'gaterun.';
function lsGet(k) { try { return localStorage.getItem(KEY + k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(KEY + k, v); } catch (e) {} }
try { if (lsGet('simv') !== String(GR.SIM_VERSION)) { localStorage.removeItem(KEY + 'best'); lsSet('simv', String(GR.SIM_VERSION)); } } catch (e) {}
function loadBest() { const v = lsGet('best'); return v ? +v : null; }
let rival = null;
{ const m = /[#&]r=(\d+)/.exec(location.hash); if (m) rival = +m[1]; }

// ---------- 画面 ----------
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; Hh = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(Hh * DPR);
  // 道の幅が画面幅の 9 割くらい、群衆が下から 3 割くらいに来るように
  F = Math.min(W * 0.84, Hh * 0.5);
  HY = Hh * 0.72 - CAM_Y * F / CAM_BACK;
}
window.addEventListener('resize', resize);

// ---------- 状態 ----------
let S = null, mode = 'title', acc = 0, last = 0;
let tx = 0, inputs = [];
let parts = [], pops = [], shake = 0, gateFlash = {};
let doneAt = 0, resultShown = false, isRecord = false, bossHit = 0;
let camX = 0;
const cam = { z: -CAM_BACK, y: CAM_Y };   // カメラの奥行きと高さ（ゴール後の かいだん で動く）
const STEP_D = 1.4, STEP_H = 0.45;        // かいだん 1 段の奥行きと高さ

function startGame() {
  S = GR.create();
  tx = 0; inputs = []; parts = []; pops = []; shake = 0; gateFlash = {};
  doneAt = 0; resultShown = false; camX = 0; cam.z = -CAM_BACK; cam.y = CAM_Y;
  mode = 'play'; acc = 0; last = performance.now();
  $('title').hidden = true; $('result').hidden = true; $('sharebox').hidden = true;
}
function showTitle() {
  mode = 'title';
  S = GR.create();
  const b = loadBest();
  $('tbest').textContent = b != null ? 'じこベスト ' + b.toLocaleString() + ' てん' : '';
  if (rival != null) { $('rival').hidden = false; $('rival').textContent = 'ともだちの記録 ' + rival.toLocaleString() + ' てん に いどもう！'; }
  $('title').hidden = false;
}

// ---------- 入力: どこでも左右にドラッグ ----------
let drag = null;
cv.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX }; try { cv.setPointerCapture(e.pointerId); } catch (er) {} e.preventDefault(); });
cv.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x; drag.x = e.clientX;
  tx = Math.max(-1, Math.min(1, tx + dx / (W * 0.42)));
  e.preventDefault();
});
const endDrag = e => { if (drag && drag.id === e.pointerId) drag = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
const keys = {};
window.addEventListener('keydown', e => {
  if ((mode === 'title' || mode === 'result') && (e.key === ' ' || e.key === 'Enter')) { startGame(); e.preventDefault(); return; }
  keys[e.key] = true;
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

function onTap(el, fn) { el.addEventListener('click', e => { e.preventDefault(); fn(); }); }
onTap($('play'), startGame);
onTap($('again'), startGame);
onTap($('share'), shareResult);
onTap($('closeshare'), () => { $('sharebox').hidden = true; });
onTap($('copy'), () => {
  const ta = $('sharetext'); ta.select();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).catch(() => {});
  else document.execCommand('copy');
  $('copy').textContent = 'コピーしました';
  setTimeout(() => { $('copy').textContent = '文をコピー'; }, 1500);
});

// ---------- 進行 ----------
let replayIn = null;   // 開発用: 入力列を流す
function tick() {
  if (replayIn) tx = (replayIn[Math.min(S.f, replayIn.length - 1)] || 0) / 100;
  if (keys.ArrowLeft) tx = Math.max(-1, tx - 0.05);
  if (keys.ArrowRight) tx = Math.min(1, tx + 0.05);
  const q = Math.round(tx * 100);
  inputs.push(q);
  GR.step(S, q / 100);
  for (const e of S.fx) onFx(e);
  S.fx.length = 0;
  if ((S.phase === 'goal' || S.phase === 'dead') && !doneAt) doneAt = S.f;
}
function onFx(e) {
  if (e.t === 'gate') {
    gateFlash[e.id] = { side: e.side, f: S.f };
    if (e.op) pops.push({ text: GR.opText(e.op), good: GR.opGood(e.op), f: S.f });
    if (e.op && GR.opGood(e.op)) burst(S.x, S.z, '#7fd3ff', 14, 5);
  } else if (e.t === 'join') {
    pops.push({ text: '+' + e.k, good: true, f: S.f });
    const it = S.items[e.id]; it.joined = true; burst(it.x, it.z, '#7fd3ff', 16, 5);
  } else if (e.t === 'fall') {
    shake = Math.max(shake, 4);
    for (const i of e.idx) { const p = GR.FORM[i]; parts.push({ x: e.x + p.x, y: 0, z: e.z + p.z, vx: 0, vy: -1, vz: 0, c: '#2f7bff', life: 40, fall: true, big: true }); }
    pops.push({ text: '−' + e.k, good: false, f: S.f });
  } else if (e.t === 'win' && e.boss) {
    shake = 12;
    for (let i = 0; i < 40; i++) burst(e.x + (rand() - .5) * 3, e.z, ['#ff3b3b', '#ffcc33', '#fff'][i % 3], 1, 10);
  } else if (e.t === 'cut') {
    shake = Math.max(shake, 6);
    for (const i of e.idx) { const p = GR.FORM[i]; burst(S.x + p.x, S.z + p.z, '#2f7bff', 3, 4); }
    pops.push({ text: '−' + e.k, good: false, f: S.f });
  } else if (e.t === 'fight') {
    if (e.boss && S.f % 4 === 0) bossHit = 6;
    if (S.f % 3 === 0) { burst(e.x + (rand() - .5) * 2, e.z, '#2f7bff', 2, 4); burst(e.x + (rand() - .5) * 2, e.z + 0.4, '#ff3b3b', 2, 4); }
    shake = Math.max(shake, 2);
  } else if (e.t === 'clash') {
    shake = Math.max(shake, 5);
  } else if (e.t === 'dead') {
    shake = 10;
  } else if (e.t === 'goal') {
    for (let i = 0; i < 60; i++) burst(S.x + (rand() - .5) * 8, S.z + 4 + rand() * 4, ['#ffcc33', '#ff4d4d', '#7fd3ff', '#8fd14f'][i % 4], 1, 9);
  }
}
// 見た目だけの乱数（シミュレーションには使わない）
let seed = 12345;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function burst(x, z, color, n, sp) {
  for (let i = 0; i < n; i++) parts.push({ x, y: 0.6, z, vx: (rand() - .5) * sp, vy: 2 + rand() * sp, vz: (rand() - .3) * sp, c: color, life: 40 + rand() * 20 });
}

function frame(now) {
  if (mode === 'play') {
    acc += Math.min(100, now - last) / 1000; last = now;
    let n = 0;
    while (acc >= 1 / FPS && n < 8) { tick(); acc -= 1 / FPS; n++; }
    if (n >= 8) acc = 0;
    if (doneAt && !resultShown && S.f - doneAt > (S.phase === 'goal' ? CLIMB_F * S.steps + 80 : 50)) showResult();
  }
  render();
  requestAnimationFrame(frame);
}

const CLIMB_F = 6;   // 1 段 上るフレーム数
// ゴール後、いま何段目まで上ったか
function climbStep() { return S.phase === 'goal' && doneAt ? Math.min(S.steps, Math.floor((S.f - doneAt - 20) / CLIMB_F) + 1) : 0; }
function climbN() { const j = Math.max(0, climbStep()); return S.n - GR.stairCost(j); }
function showResult() {
  resultShown = true; mode = 'result';
  const n = S.phase === 'goal' ? S.score : 0;
  const prev = loadBest();
  isRecord = S.phase === 'goal' && (prev == null || n > prev);
  if (isRecord) lsSet('best', String(n));
  $('rtitle').textContent = S.phase === 'goal' ? 'ゴール！' : 'ぜんめつ…';
  $('rnum').textContent = n.toLocaleString();
  $('rsub').textContent = S.phase === 'goal' ? S.n.toLocaleString() + ' 人 × ' + S.mult.toFixed(1) + '（かいだん ' + S.steps + ' 段）' : Math.round(S.z) + ' m で ぜんめつ（ゴールは ' + S.course.length + ' m）';
  const b = loadBest();
  $('rbest').textContent = isRecord ? 'じこベスト こうしん！' : (b != null ? 'じこベスト ' + b.toLocaleString() + ' てん' : '');
  $('rbest').className = 'rbest' + (isRecord ? ' new' : '');
  if (rival != null) {
    $('rrival').hidden = false;
    $('rrival').textContent = n > rival ? 'ともだち（' + rival.toLocaleString() + ' てん）に かった！' : n === rival ? 'ともだちと ひきわけ！' : 'ともだち（' + rival.toLocaleString() + ' てん）に まけ…';
  } else $('rrival').hidden = true;
  $('share').hidden = S.phase !== 'goal';
  $('result').hidden = false;
}

// ---------- 描画 ----------
function camZ() { return cam.z; }
function P(x, y, z) {
  const dz = z - camZ();
  if (dz < 0.3) return null;
  const s = F / dz;
  return { x: W / 2 + (x - camX) * s, y: HY + (cam.y - y) * s, s };
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!S) return;
  camX += ((S.x * 0.45) - camX) * 0.12;
  // カメラ: ふだんは群衆の後ろ。かいだんでは上っていく群衆を追う
  let tz = S.z - CAM_BACK, ty = CAM_Y;
  const j = climbStep();
  if (j > 0) { tz = crowdZ() - CAM_BACK - 2; ty = CAM_Y + j * STEP_H + 1.5; }
  if (mode === 'title' || !doneAt) { cam.z = tz; cam.y = ty; }
  else { cam.z += (tz - cam.z) * 0.08; cam.y += (ty - cam.y) * 0.08; }
  if (bossHit > 0) bossHit--;
  let sx = 0, sy = 0;
  if (shake > 0) { sx = (rand() - .5) * shake; sy = (rand() - .5) * shake; shake *= 0.85; if (shake < 0.3) shake = 0; }
  ctx.save(); ctx.translate(sx, sy);
  drawWorld();
  ctx.restore();
  drawHud();
}
function drawWorld() {
  const cz = camZ(), zFar = cz + 170, RW = GR.RW;
  // 空
  const hy = HY + cam.y * F / 170;
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#5ab6ff'); sky.addColorStop(1, '#d6f0ff');
  ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, hy + 20);
  // 遠くの山
  ctx.fillStyle = '#a5d8a0';
  ctx.beginPath(); ctx.moveTo(-20, hy);
  for (let i = 0; i <= 12; i++) { const x = -20 + (W + 40) * i / 12; ctx.lineTo(x, hy - 18 - 14 * Math.abs(Math.sin(i * 1.7 + 0.5))); }
  ctx.lineTo(W + 20, hy); ctx.fill();
  // 草
  ctx.fillStyle = '#7ccf5a'; ctx.fillRect(-20, hy, W + 40, Hh - hy + 20);
  // 道（手前から奥へ 5m ずつの帯）
  const step = 5, z0 = Math.floor((cz + 0.5) / step) * step;
  const roadEnd = S.course.length + 3;   // その先は かいだん
  for (let z = Math.floor(Math.min(zFar, roadEnd - 0.01) / step) * step; z >= z0; z -= step) {
    const za = Math.max(z, cz + 0.5), zb = Math.min(z + step, roadEnd);
    const a = P(-RW, 0, za), b = P(RW, 0, za), c = P(RW, 0, zb), d = P(-RW, 0, zb);
    if (!a || !c) continue;
    const odd = Math.floor(z / step) & 1;
    ctx.fillStyle = odd ? '#8fa0b8' : '#97a8c0';
    quad(a, b, c, d);
    // 路肩
    ctx.fillStyle = odd ? '#ffffff' : '#ff5a5a';
    const e1 = P(-RW - 0.35, 0, za), e2 = P(-RW - 0.35, 0, zb), f1 = P(RW + 0.35, 0, za), f2 = P(RW + 0.35, 0, zb);
    quad(e1, a, d, e2); quad(b, f1, f2, c);
  }
  // ゴールライン
  const L = S.course.length;
  if (L < zFar) {
    for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) {
      const x0 = -RW + i * RW / 5, zz = L + j * 0.8;
      const a = P(x0, 0, zz), b = P(x0 + RW / 5, 0, zz), c = P(x0 + RW / 5, 0, zz + 0.8), d = P(x0, 0, zz + 0.8);
      if (!a || !c) continue;
      ctx.fillStyle = (i + j) & 1 ? '#222' : '#fff'; quad(a, b, c, d);
    }
  }
  // しきりの壁（低い壁。人より先に描く）
  for (const it of S.items) if (it.type === 'div' && it.z1 > cz + 0.6 && it.z0 < zFar) {
    const za = Math.max(it.z0, cz + 0.6), zb = Math.min(it.z1, zFar), hw = 0.15, h = 1.1;
    const side = camX < 0 ? hw : -hw;   // カメラから見える側の面
    ctx.fillStyle = '#c9772f'; quad(P(side, 0, za), P(side, 0, zb), P(side, h, zb), P(side, h, za));
    ctx.fillStyle = '#f0a050'; quad(P(-hw, h, za), P(hw, h, za), P(hw, h, zb), P(-hw, h, zb));
    ctx.fillStyle = '#b86a28'; quad(P(-hw, 0, za), P(hw, 0, za), P(hw, h, za), P(-hw, h, za));
  }

  // 奥から順に描くもの
  const list = [];
  for (const it of S.items) {
    if (it.type === 'div') continue;
    if (it.type === 'enemy') {
      if (it.m <= 0 || it.z + 4 < cz || it.z - 4 > zFar) continue;
      if (it.boss) { list.push([it.z, () => drawBoss(it)]); continue; }
      const sn = GR.shown(it.m);
      for (let i = 0; i < sn; i++) { const p = GR.FORM[i]; list.push([it.z - p.z, () => person(it.x + p.x, it.z - p.z, '#ff3b3b', i)]); }
      list.push([it.z - GR.radius(it.m) - 0.01, () => label(it.x, 2.6, it.z, it.m.toLocaleString(), '#ff3b3b')]);
      continue;
    }
    if (it.type === 'ally') {
      if (it.joined || it.z + 4 < cz || it.z - 4 > zFar) continue;
      const sn = GR.shown(it.n);
      for (let i = 0; i < sn; i++) { const p = GR.FORM[i]; list.push([it.z - p.z, () => person(it.x + p.x, it.z - p.z, '#9aa3ad', i, { idle: true })]); }
      list.push([it.z - GR.radius(it.n) - 0.01, () => label(it.x, 2.4, it.z, '+' + it.n, '#8a949e')]);
      continue;
    }
    if (it.type === 'hole') { if (it.z + it.d > cz + 0.6 && it.z < zFar) list.push([1e9, () => drawHole(it)]); continue; }   // 床の穴は地面と一緒に先に描く
    if (it.z < cz + 0.5 || it.z > zFar) continue;
    if (it.type === 'gate') list.push([it.z, () => drawGate(it)]);
    else if (it.type === 'mgate') list.push([it.z, () => drawMgate(it)]);
    else if (it.type === 'saw') list.push([it.z, () => drawSaw(it)]);
    else if (it.type === 'bar') list.push([it.z, () => drawBar(it)]);
    else if (it.type === 'spin') list.push([it.z + 0.01, () => drawSpin(it)]);
    else if (it.type === 'press') list.push([it.z + 0.6, () => drawPress(it)]);
  }
  // ゴールの先の かいだん
  for (let k = GR.STEPS; k >= 1; k--) {
    const z1 = L + 3 + (k - 1) * STEP_D;
    if (z1 > zFar || z1 + STEP_D < cz + 0.5) continue;
    list.push([z1 + STEP_D + 0.001, () => drawStep(k, z1)]);
    // 上った段には、その段で使った人が並んで残る（12×k 人。絵は 1 列ぶんまで）
    if (k <= climbStep() && k < GR.STEPS + 1) {
      const c = Math.min(GR.STEP_COST * k, 14);
      for (let i = 0; i < c; i++) {
        const x = -GR.RW + 0.6 + (2 * GR.RW - 1.2) * (c === 1 ? 0.5 : i / (c - 1));
        const z = z1 + STEP_D * 0.5 + (i & 1 ? 0.22 : -0.22);
        list.push([z, () => person(x, z, '#2f7bff', i + k * 3, { idle: true, y: k * STEP_H })]);
      }
    }
  }
  const nNow = climbStep() > 0 ? climbN() : S.n;
  if (nNow > 0) {
    const sn = GR.shown(nNow), cz0 = crowdZ(), cheer = S.phase === 'goal' && S.f - doneAt > 20 + CLIMB_F * S.steps;
    for (let i = 0; i < sn; i++) {
      const p = GR.FORM[i], z = cz0 + p.z;
      list.push([z, () => person(S.x + p.x, z, '#2f7bff', i, { cheer, y: stairY(z) })]);
    }
  }
  list.sort((a, b) => b[0] - a[0]);
  for (const it of list) it[1]();
  if (nNow > 0) { const z = crowdZ(); label(S.x, 2.4 + stairY(z), z, nNow.toLocaleString(), '#2f7bff'); }
  if (climbStep() > 0) {
    const j = climbStep(), z = crowdZ();
    const p = P(S.x, 4.2 + stairY(z), z);
    if (p) {
      const t = '×' + GR.stairMult(j).toFixed(1);
      ctx.font = '900 ' + Math.min(56, W * 0.13) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 9; ctx.strokeStyle = '#1b1d3a'; ctx.strokeText(t, p.x, p.y);
      ctx.fillStyle = '#ffcc33'; ctx.fillText(t, p.x, p.y);
    }
  }

  // かけら
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.x += q.vx / FPS; q.y += q.vy / FPS; q.z += q.vz / FPS; q.vy -= 18 / FPS;
    if (q.fall) {
      if (--q.life <= 0) { parts.splice(i, 1); continue; }
      const p = P(q.x, q.y, q.z);
      if (p) { ctx.globalAlpha = Math.max(0, q.life / 40); ctx.fillStyle = q.c; const r = 0.2 * p.s; ctx.beginPath(); ctx.arc(p.x, p.y - r, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      continue;
    }
    if (q.y < 0) { q.y = 0; q.vy *= -0.4; q.vx *= 0.7; q.vz *= 0.7; }
    if (--q.life <= 0) { parts.splice(i, 1); continue; }
    const p = P(q.x, q.y, q.z); if (!p) continue;
    ctx.fillStyle = q.c; const r = Math.max(1.5, 0.14 * p.s);
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
}
function quad(a, b, c, d) {
  if (!a || !b || !c || !d) return;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
}
// 人: 丸い頭と体、走ると足が動く
function person(x, z, color, i, o) {
  o = o || {};
  const p = P(x, o.y || 0, z); if (!p) return;
  const s = p.s * (o.scale || 1), t = (S.f + i * 7) * 0.35, cheer = o.cheer;
  const run = !o.idle && !cheer && (S.phase === 'run' || S.phase === 'goal');
  const hop = cheer ? Math.abs(Math.sin((S.f + i * 5) * 0.2)) * 0.5 * s : o.idle ? Math.abs(Math.sin(S.f * 0.12 + i)) * 0.08 * s : 0;
  const h = 1.0 * s, bw = 0.34 * s;
  const by = p.y - hop;
  // 影
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, bw * 0.9, bw * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  // 足
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, 0.11 * s); ctx.lineCap = 'round';
  const sw = run ? Math.sin(t) * 0.14 * s : 0;
  ctx.beginPath();
  ctx.moveTo(p.x - bw * 0.3, by - h * 0.42); ctx.lineTo(p.x - bw * 0.3 + sw, by);
  ctx.moveTo(p.x + bw * 0.3, by - h * 0.42); ctx.lineTo(p.x + bw * 0.3 - sw, by);
  ctx.stroke();
  // 体と頭
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(p.x, by - h * 0.6, bw * 0.55, h * 0.24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, by - h * 0.93, bw * 0.46, 0, Math.PI * 2); ctx.fill();
  if (s > 18) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(p.x - bw * 0.15, by - h * 0.98, bw * 0.15, 0, Math.PI * 2); ctx.fill(); }
}
function label(x, y, z, text, color) {
  const p = P(x, y, z); if (!p) return;
  const fs = Math.max(12, Math.min(30, 0.62 * p.s));
  ctx.font = '900 ' + fs + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + fs * 0.8, h = fs * 1.25;
  ctx.fillStyle = color; roundRect(p.x - w / 2, p.y - h / 2, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, fs * 0.1); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillText(text, p.x, p.y + fs * 0.04);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawGate(it) {
  const RW = GR.RW, fl = gateFlash[it.id];
  for (const side of [-1, 1]) {
    const op = side < 0 ? it.l : it.r;
    if (!op) continue;
    const x0 = side < 0 ? -RW + 0.15 : 0.15, x1 = side < 0 ? -0.15 : RW - 0.15;
    const a = P(x0, 0, it.z), b = P(x1, 2.8, it.z); if (!a || !b) continue;
    const good = GR.opGood(op);
    let alpha = 0.55;
    if (it.done) { if (!fl || fl.side !== side) continue; alpha = Math.max(0, 0.8 - (S.f - fl.f) / 20); if (alpha <= 0) continue; }
    ctx.fillStyle = good ? 'rgba(40,150,255,' + alpha + ')' : 'rgba(255,60,60,' + alpha + ')';
    ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
    ctx.strokeStyle = good ? '#bfe4ff' : '#ffc0c0'; ctx.lineWidth = Math.max(1.5, 0.12 * a.s);
    ctx.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
    const fs = Math.min(0.95 * a.s, (b.x - a.x) * 0.4);
    if (fs < 4) continue;
    ctx.font = '900 ' + fs + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, fs * 0.12); ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.strokeText(GR.opText(op), (a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.fillStyle = '#fff'; ctx.fillText(GR.opText(op), (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
}
function drawSaw(it) {
  const x = GR.sawX(it, S.f), r = it.r;
  // レール
  const a = P(-it.amp - r, 0, it.z), b = P(it.amp + r, 0, it.z);
  if (a && b) { ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(2, 0.15 * a.s); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  const c = P(x, r * 0.85, it.z); if (!c) return;
  const R = r * c.s, rot = S.f * 0.4;
  ctx.fillStyle = '#c8ccd4'; ctx.beginPath();
  for (let i = 0; i < 24; i++) { const ang = rot + i * Math.PI / 12, rr = i & 1 ? R * 0.82 : R; ctx.lineTo(c.x + Math.cos(ang) * rr, c.y + Math.sin(ang) * rr); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#7a808c'; ctx.lineWidth = Math.max(1, R * 0.06); ctx.stroke();
  ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(c.x, c.y, R * 0.25, 0, Math.PI * 2); ctx.fill();
}
function drawBar(it) {
  const h = 1.0, d = 0.6;
  const a = P(it.x0, 0, it.z), b = P(it.x1, 0, it.z), bt = P(it.x1, h, it.z), at = P(it.x0, h, it.z);
  ctx.fillStyle = '#ffe07a'; quad(at, bt, P(it.x1, h, it.z + d), P(it.x0, h, it.z + d));
  if (!a || !b || !at) return;
  // しましまの前の面
  ctx.save(); ctx.beginPath(); ctx.rect(a.x, at.y, b.x - a.x, a.y - at.y); ctx.clip();
  ctx.fillStyle = '#ffcc33'; ctx.fillRect(a.x, at.y, b.x - a.x, a.y - at.y);
  ctx.fillStyle = '#222'; const sw = a.y - at.y;
  for (let x = a.x - sw * 2; x < b.x; x += sw * 1.4) { ctx.beginPath(); ctx.moveTo(x, a.y); ctx.lineTo(x + sw * 0.7, a.y); ctx.lineTo(x + sw * 1.4, at.y); ctx.lineTo(x + sw * 0.7, at.y); ctx.fill(); }
  ctx.restore();
}
// ゴール後: 群衆のまんなかの奥行きと、その場所の床の高さ
function crowdZ() { const j = climbStep(); return S.z + (j > 0 ? 3 + (j - 0.5) * STEP_D : 0); }
function stairY(z) {
  const j = climbStep(); if (j <= 0) return 0;
  const k = Math.floor((z - S.course.length - 3) / STEP_D) + 1;
  return Math.max(0, Math.min(j, k)) * STEP_H;
}
function drawStep(k, z1) {
  const RW = GR.RW, y1 = k * STEP_H, z2 = z1 + STEP_D * (k === GR.STEPS ? 3 : 1);   // いちばん上は広い台
  const hue = (k * 18) % 360, reached = S.phase === 'goal' && climbStep() >= k;
  ctx.fillStyle = k === GR.STEPS ? '#ffcc33' : 'hsl(' + hue + ',70%,' + (reached ? 64 : 54) + '%)';
  quad(P(-RW, y1, z1), P(RW, y1, z1), P(RW, y1, z2), P(-RW, y1, z2));
  ctx.fillStyle = 'hsl(' + hue + ',65%,' + (reached ? 50 : 40) + '%)';
  quad(P(-RW, 0, z1), P(RW, 0, z1), P(RW, y1, z1), P(-RW, y1, z1));
  const c = P(0, y1 - STEP_H * 0.5, z1); if (!c) return;
  const fs = Math.min(c.s * STEP_H * 0.85, 40);
  if (fs < 6) return;
  ctx.font = '900 ' + fs + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.fillText('×' + GR.stairMult(k).toFixed(1), c.x, c.y);
  // 右はしに「この段で 何人 のこるか」
  const r = P(RW * 0.72, y1 - STEP_H * 0.5, z1); if (!r || fs < 9) return;
  ctx.font = '800 ' + fs * 0.62 + 'px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(GR.STEP_COST * k + '人', r.x, r.y);
}
function drawHole(it) {
  const za = Math.max(it.z, camZ() + 0.6), zb = it.z + it.d;
  if (zb < za) return;
  ctx.fillStyle = '#1b1d3a'; quad(P(it.x0, 0, za), P(it.x1, 0, za), P(it.x1, 0, zb), P(it.x0, 0, zb));
  // 奥の壁が見える
  ctx.fillStyle = '#3a3f5c'; quad(P(it.x0, 0, zb), P(it.x1, 0, zb), P(it.x1, -1.2, zb), P(it.x0, -1.2, zb));
  const a = P(it.x0, 0, za), b = P(it.x1, 0, za), c = P(it.x1, 0, zb), d = P(it.x0, 0, zb);
  if (a && b && c && d) { ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.stroke(); }
}
function drawSpin(it) {
  const a = GR.spinAng(it, S.f), ca = Math.cos(a), sa = Math.sin(a), y = 0.45;
  const p0 = P(it.px - it.len * ca, y, it.z - it.len * sa), p1 = P(it.px + it.len * ca, y, it.z + it.len * sa), c = P(it.px, 0, it.z), ct = P(it.px, y + 0.3, it.z);
  if (c && ct) { ctx.fillStyle = '#555'; ctx.fillRect(c.x - 0.25 * c.s, ct.y, 0.5 * c.s, c.y - ct.y); }
  if (!p0 || !p1) return;
  const w = Math.max(3, 0.3 * (p0.s + p1.s) / 2);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#b3261e'; ctx.lineWidth = w + 3; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w; ctx.setLineDash([w * 1.4, w * 1.4]);
  ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.setLineDash([]);
  if (ct) { ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.arc(ct.x, ct.y, Math.max(3, 0.3 * ct.s), 0, 7); ctx.fill(); }
}
function drawPress(it) {
  const lift = GR.pressLift(it, S.f), y0 = 0.05 + lift * 2.4, h = 1.2, d = 1.2;
  const x0 = it.x0 + 0.1, x1 = it.x1 - 0.1;
  // 影（下りそうなほど濃い）
  ctx.fillStyle = 'rgba(0,0,0,' + (0.35 - lift * 0.2) + ')';
  quad(P(x0, 0, it.z), P(x1, 0, it.z), P(x1, 0, it.z + d), P(x0, 0, it.z + d));
  // 柱
  ctx.fillStyle = '#6b7280';
  for (const x of [x0, x1]) { const a = P(x, 0, it.z + d / 2), b = P(x, 4.2, it.z + d / 2); if (a && b) ctx.fillRect(a.x - 0.12 * a.s, b.y, 0.24 * a.s, a.y - b.y); }
  // ブロック
  ctx.fillStyle = '#9aa3ad'; quad(P(x0, y0 + h, it.z), P(x1, y0 + h, it.z), P(x1, y0 + h, it.z + d), P(x0, y0 + h, it.z + d));
  const a = P(x0, y0, it.z), b = P(x1, y0 + h, it.z); if (!a || !b) return;
  ctx.fillStyle = '#4b5563'; ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
  ctx.fillStyle = '#ffcc33'; ctx.fillRect(a.x, a.y - (a.y - b.y) * 0.18, b.x - a.x, (a.y - b.y) * 0.18);
}
function drawMgate(it) {
  const RW = GR.RW, fl = gateFlash[it.id];
  const gx = GR.mgateX(it, S.f);
  // レール
  const r0 = P(-RW, 3.0, it.z), r1 = P(RW, 3.0, it.z);
  if (r0 && r1) { ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(2, 0.12 * r0.s); ctx.beginPath(); ctx.moveTo(r0.x, r0.y); ctx.lineTo(r1.x, r1.y); ctx.stroke(); }
  let alpha = 0.75;
  if (it.done) { if (!fl || fl.miss) alpha = 0.35; else { alpha = Math.max(0, 0.9 - (S.f - fl.f) / 20); if (alpha <= 0) return; } }
  const a = P(gx - it.w / 2, 0, it.z), b = P(gx + it.w / 2, 2.8, it.z); if (!a || !b) return;
  ctx.fillStyle = 'rgba(255,180,30,' + alpha + ')'; ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
  ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = Math.max(1.5, 0.14 * a.s); ctx.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
  const fs = Math.min(1.0 * a.s, (b.x - a.x) * 0.45);
  if (fs < 4) return;
  ctx.font = '900 ' + fs + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, fs * 0.12); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.strokeText(GR.opText(it.op), (a.x + b.x) / 2, (a.y + b.y) / 2);
  ctx.fillStyle = '#fff'; ctx.fillText(GR.opText(it.op), (a.x + b.x) / 2, (a.y + b.y) / 2);
}
function drawBoss(it) {
  const sh = bossHit > 0 ? (bossHit % 2 ? 0.15 : -0.15) : 0;
  person(it.x + sh, it.z, bossHit > 0 ? '#ff8a80' : '#d42a2a', 0, { scale: 3.6, idle: true });
  label(it.x, 4.8, it.z, it.m.toLocaleString(), '#b3261e');
  const p = P(it.x, 5.9, it.z);
  if (p && p.s > 8) { ctx.font = '900 ' + Math.min(24, 0.5 * p.s) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeStyle = '#1b1d3a'; ctx.strokeText('ボス', p.x, p.y); ctx.fillText('ボス', p.x, p.y); }
}
function drawHud() {
  if (!S || mode === 'title') return;
  // 進み具合
  const top = 14, bw = Math.min(W - 40, 320), bx = (W - bw) / 2;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; roundRect(bx, top, bw, 12, 6); ctx.fill();
  ctx.fillStyle = '#ffcc33'; roundRect(bx, top, Math.max(12, bw * Math.min(1, S.z / S.course.length)), 12, 6); ctx.fill();
  // ゲートや被害の数字が浮かぶ
  for (let i = pops.length - 1; i >= 0; i--) {
    const q = pops[i], age = S.f - q.f;
    if (age > 45) { pops.splice(i, 1); continue; }
    const p = P(S.x, 3.4 + age * 0.03, S.z); if (!p) continue;
    ctx.globalAlpha = Math.min(1, (45 - age) / 15);
    ctx.font = '900 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#1b1d3a'; ctx.strokeText(q.text, p.x, p.y);
    ctx.fillStyle = q.good ? '#7fe07f' : '#ff6b6b'; ctx.fillText(q.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }
  if (S.phase === 'ready') bigText(S.f < 30 ? 'よーい' : 'ドン！', '#fff');
  if (S.phase === 'ready' || (S.phase === 'run' && S.f < GR.START_F + 120 && !drag)) {
    const t = '← ゆびで 左右に うごかす →';
    ctx.font = '800 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.strokeText(t, W / 2, Hh - 40);
    ctx.fillStyle = '#fff'; ctx.fillText(t, W / 2, Hh - 40);
  }
  if (S.phase === 'goal' && S.f - doneAt < 40) bigText('ゴール！', '#ffcc33');
  if (S.phase === 'dead') bigText('ぜんめつ…', '#ff6b6b');
}
function bigText(t, c) {
  ctx.font = '900 ' + Math.min(64, W * 0.15) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 10; ctx.strokeStyle = '#1b1d3a'; ctx.strokeText(t, W / 2, Hh * 0.3);
  ctx.fillStyle = c; ctx.fillText(t, W / 2, Hh * 0.3);
}

// ---------- シェア ----------
function shareResult() {
  const w = 720, h = 480, c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  const g = c.getContext('2d'); g.scale(2, 2);
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#5ab6ff'); sky.addColorStop(1, '#d6f0ff');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7ccf5a'; g.fillRect(0, 340, w, 140);
  g.fillStyle = '#97a8c0'; g.beginPath(); g.moveTo(300, 340); g.lineTo(420, 340); g.lineTo(600, 480); g.lineTo(120, 480); g.fill();
  // 人をたくさん
  g.fillStyle = '#2f7bff';
  for (let i = 0; i < 80; i++) { const p = GR.FORM[i], x = 360 + p.x * 60, y = 430 + p.z * 18; g.beginPath(); g.arc(x, y - 20, 6, 0, 7); g.fill(); g.beginPath(); g.ellipse(x, y - 7, 5, 8, 0, 0, 7); g.fill(); }
  g.textAlign = 'center'; g.fillStyle = '#1b1d3a';
  g.font = 'bold 36px sans-serif'; g.fillText('ふやせ！ゲートラン', w / 2, 62);
  const num = S.score.toLocaleString() + ' てん';
  g.font = 'bold 110px sans-serif'; g.lineWidth = 12; g.strokeStyle = '#1b1d3a';
  g.strokeText(num, w / 2, 200); g.fillStyle = '#fff'; g.fillText(num, w / 2, 200);
  g.fillStyle = '#1b1d3a'; g.font = 'bold 24px sans-serif';
  g.fillText(S.n.toLocaleString() + ' 人 × ' + S.mult.toFixed(1) + '（かいだん ' + S.steps + ' 段）' + (isRecord ? '　じこベスト！' : ''), w / 2, 248);
  g.font = '18px sans-serif'; g.fillText(SITE_URL, w / 2, 290);
  const dataUrl = c.toDataURL('image/png');
  const url = SITE_URL + '#r=' + S.score;
  const text = 'ふやせ！ゲートラン ' + S.score.toLocaleString() + 'てん（' + S.n.toLocaleString() + '人 × ' + S.mult.toFixed(1) + '）\nこの記録をこえられる？\n' + url;
  const bin = atob(dataUrl.split(',')[1]), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const file = new File([buf], 'gaterun.png', { type: 'image/png' });
  const fallback = err => { if (!err || err.name !== 'AbortError') showShareBox(dataUrl, text); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text }).catch(fallback);
  else if (navigator.share) navigator.share({ text }).catch(fallback);
  else showShareBox(dataUrl, text);
}
function showShareBox(dataUrl, text) { $('shareimg').src = dataUrl; $('sharetext').value = text; $('sharebox').hidden = false; }

// ---------- 開発用 ----------
window.ff = sec => { const n = Math.round(sec * FPS); for (let i = 0; i < n && mode === 'play'; i++) { tick(); for (const q of parts) q.life = Math.min(q.life, 1); } return S.phase + ' n=' + S.n + ' z=' + S.z.toFixed(1); };
window.sim = () => S;
window.setTx = v => { tx = v; };

// ---------- 自動更新: Safari が古いページを開き続けるので、新しい版があれば読み直す ----------
async function checkVersion() {
  try {
    const r = await fetch('version.txt?ts=' + Date.now(), { cache: 'no-store' });
    const v = (await r.text()).trim();
    if (v && v !== VERSION && mode !== 'play') {
      let tried = ''; try { tried = sessionStorage.getItem(KEY + 'reloadFor') || ''; } catch (e) {}
      if (tried === v) return;
      try { sessionStorage.setItem(KEY + 'reloadFor', v); } catch (e) {}
      location.reload();
    }
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
window.addEventListener('pageshow', e => { if (e.persisted) checkVersion(); });
checkVersion();

resize();
showTitle();
requestAnimationFrame(frame);

// 開発用: ?shot=秒&tx=-1 でその時点まで早送りして止める（スクショ確認用）
{
  const q = new URLSearchParams(location.search);
  const shot = () => { startGame(); tx = +(q.get('tx') || 0); ff(+q.get('shot')); if (doneAt && S.phase === 'goal' && S.f - doneAt > CLIMB_F * S.steps + 80) showResult(); mode = 'pause'; for (let i = 0; i < 60; i++) render(); };
  if (q.has('shot')) { if (q.has('in')) fetch(q.get('in')).then(r => r.json()).then(a => { replayIn = a; shot(); }); else shot(); }
}
