// 생활 행동: 든 도구에 맞는 대상이 가까이 있어야 G 로 할 수 있다
import * as THREE from 'three';
import { WORLD, LIFE_SPOTS, RIVER_HALF_WIDTH, riverCenterZ, ANIM } from '../../shared/world.js';
import { toon, addOutline } from './materials.js';

const REACH = 1.8; // 대상까지 이만큼 안이면 가능 (m)
// 도구 → 동작, 대상 이름(안내 문구용)
export const LIFE = {
  none: { anim: ANIM.GATHER, what: '꽃이나 덤불' },
  axe: { anim: ANIM.CHOP, what: '나무' },
  rod: { anim: ANIM.FISH, what: '물가' },
};

// 가장 가까운 대상 위치(바라볼 곳) 또는 null. spots: 테스트용 생활 요소(없으면 [])
export function findTarget(tool, x, z, spots) {
  let best = null;
  let bestD = REACH;
  const near = (tx, tz, pad = 0) => {
    const d = Math.hypot(tx - x, tz - z) - pad;
    if (d < bestD) { bestD = d; best = { x: tx, z: tz }; }
  };
  const of = (kind) => spots.filter((s) => s.kind === kind);
  if (tool === 'axe') {
    for (const t of WORLD.trees) near(t.x, t.z, t.r);
    for (const t of of('tree')) near(t.x, t.z, 0.3);
  } else if (tool === 'rod') {
    const rz = riverCenterZ(x);
    if (Math.abs(z - rz) < RIVER_HALF_WIDTH + REACH) near(x, rz, RIVER_HALF_WIDTH);
    for (const p of of('pond')) near(p.x, p.z, p.r);
  } else {
    for (const f of WORLD.flowers) near(f.x, f.z);
    for (const b of of('bush')) near(b.x, b.z, 0.6);
  }
  return best;
}

// 테스트 서버 광장 가운데의 체험용 나무·연못·덤불
export function buildLifeSpots(scene) {
  const g = new THREE.Group();
  for (const s of LIFE_SPOTS) {
    const o = new THREE.Group();
    o.position.set(s.x, 0, s.z);
    if (s.kind === 'tree') {
      o.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.2, 8).translate(0, 0.6, 0), toon(0xa9744f)));
      o.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1).translate(0, 1.9, 0), toon(0x7cc35a)));
    } else if (s.kind === 'pond') {
      const water = new THREE.Mesh(new THREE.CircleGeometry(s.r, 32).rotateX(-Math.PI / 2), toon(0x7cc8f0));
      water.position.y = 0.03;
      const rim = new THREE.Mesh(new THREE.RingGeometry(s.r, s.r + 0.18, 32).rotateX(-Math.PI / 2), toon(0xcfc6b0));
      rim.position.y = 0.035;
      o.add(water, rim);
    } else {
      o.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1).scale(1.2, 0.8, 1).translate(0, 0.4, 0), toon(0x5fae4a)));
      const berry = new THREE.IcosahedronGeometry(0.08, 0);
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        const b = new THREE.Mesh(berry, toon(0xe8485a));
        b.position.set(Math.cos(a) * 0.55, 0.35 + (i % 3) * 0.12, Math.sin(a) * 0.45);
        o.add(b);
      }
    }
    // 연못 물·테두리는 납작해서 외곽선 없이
    if (s.kind !== 'pond') for (const m of [...o.children]) addOutline(m, 0.025);
    g.add(o);
  }
  scene.add(g);
  return g;
}
