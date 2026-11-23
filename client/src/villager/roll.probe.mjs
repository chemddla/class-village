// 구르기 몸 높이 표(actions.js RL.py) 다시 재기: node client/src/villager/roll.probe.mjs "{}" 6  (마지막 줄을 RL.py 에 붙여 넣는다 · 0 이면 지금 표 점검만)
import * as THREE from 'three';
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop(){} }) }), width: 1, height: 1 }) };
const { createVillager } = await import('./villager.js');
const { ACTIONS, RL } = await import('./actions.js');
Object.assign(RL, JSON.parse(process.argv[2] || '{}'));
const v = createVillager({});
const w = new THREE.Vector3(), box = new THREE.Box3();
const FPS = 240, D = ACTIONS.roll.duration;
let t = 0;
const hand = (r) => Math.min(r.handR.getWorldPosition(w).y, r.handL.getWorldPosition(w).y);
function sim() {
  v.state.action = 'idle';
  for (let i = 0; i < 160; i++) { t += 1 / FPS; v.update(t, 1 / FPS); }
  v.state.action = 'roll';
  const out = [];
  for (let i = 0; i <= Math.round(D * FPS); i++) {
    t += 1 / FPS; v.update(t, 1 / FPS); const r = v.rig;
    v.root.updateMatrixWorld(true);
    box.setFromObject(v.root);
    let low = null, lowY = 9;
    if (process.env.LOW) v.root.traverse((o) => { if (!o.isMesh) return; const b = new THREE.Box3().setFromObject(o); if (b.min.y < lowY) { lowY = b.min.y; let p = o; const n = []; while (p && n.length < 3) { n.push(p.name || p.type); p = p.parent; } low = n.join('<'); } });
    out.push({ low, u: i / FPS / D, min: box.min.y, size: box.max.y - box.min.y, py: r.root.position.y, hand: hand(r), head: r.head.getWorldPosition(w).y - 0.2 * r.head.scale.x });
  }
  return out;
}
const STEP = 0.0125;
const iters = +(process.argv[3] ?? 5);
if (iters) RL.py = [[0, 0], [1, 0]];
for (let k = 0; k < iters; k++) {
  const rows = sim();
  const keys = [];
  for (let u = 0; u <= 1.0001; u += STEP) {
    const near = rows.filter((r) => Math.abs(r.u - u) <= STEP / 2 + 1e-6);
    keys.push([+u.toFixed(3), +Math.max(...near.map((r) => r.py - r.min)).toFixed(3)]);
  }
  RL.py = keys;
}
const rows = sim();
let worst = 0, fl = 0;
for (const r of rows) { worst = Math.min(worst, r.min); fl = Math.max(fl, r.min); }
for (const r of rows.filter((_, i) => i % 6 === 0)) console.log(`u=${r.u.toFixed(2)} size ${r.size.toFixed(2)} min ${r.min.toFixed(3)} hand-min ${(r.hand - r.min).toFixed(3)} head-min ${(r.head - r.min).toFixed(3)} ${r.low ?? ''}`);
console.log('worst', worst.toFixed(3), 'float', fl.toFixed(3));
// 거의 직선 위에 있는 키는 뺀다 (앞뒤 키 사이를 이은 값과 0.006 이내)
const K = RL.py; const keep = [K[0]];
for (let i = 1; i < K.length - 1; i++) { const a = keep[keep.length - 1], c = K[i + 1]; const f = (K[i][0] - a[0]) / (c[0] - a[0]); if (Math.abs(a[1] + (c[1] - a[1]) * f - K[i][1]) > 0.006) keep.push(K[i]); }
keep.push(K[K.length - 1]);
console.log(keep.length, JSON.stringify(keep.map(([u, y]) => [+u.toFixed(3), +y.toFixed(2)])));
