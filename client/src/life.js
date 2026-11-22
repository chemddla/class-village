// 생활 행동: 생활 대상(나무·물가·꽃) 앞에서 G 를 누르면, 손에 무엇을 들었든 그 일에 맞는 도구를 꺼내 들고 한다
import * as THREE from 'three';
import { WORLD, LIFE_SPOTS, RIVER_HALF_WIDTH, riverCenterZ, ANIM } from '../../shared/world.js';
import { toon, swayToon, addOutline } from './materials.js';
import { roundCanopy, trunkGeometry } from './village.js';

const REACH = 1.8; // 대상까지 이만큼 안이면 가능 (m)
// 도구 → 동작, 대상 이름(안내 문구용)
export const LIFE = {
  none: { anim: ANIM.GATHER, what: '꽃' },
  axe: { anim: ANIM.CHOP, what: '나무' },
  rod: { anim: ANIM.FISH, what: '물가' },
};

// 이 도구로 할 수 있는 가장 가까운 대상 위치(바라볼 곳, d: 거리) 또는 null. spots: 테스트용 생활 요소(없으면 [])
export function findTarget(tool, x, z, spots) {
  let best = null;
  let bestD = REACH;
  const near = (tx, tz, pad = 0) => {
    const d = Math.hypot(tx - x, tz - z) - pad;
    if (d < bestD) { bestD = d; best = { x: tx, z: tz, d }; }
  };
  const of = (kind) => spots.filter((s) => s.kind === kind);
  if (tool === 'axe') {
    for (const t of WORLD.trees) near(t.x, t.z, t.r);
    for (const t of of('tree')) near(t.x, t.z, 0.3);
  } else if (tool === 'rod') {
    const rz = riverCenterZ(x);
    if (Math.abs(z - rz) < RIVER_HALF_WIDTH + REACH) near(x, rz, RIVER_HALF_WIDTH);
  } else {
    for (const f of WORLD.flowers) near(f.x, f.z);
  }
  return best;
}

// 가장 가까운 생활 대상과 그 일에 쓸 도구: { tool, x, z } 또는 null
export function findLife(x, z, spots) {
  let best = null;
  for (const tool of Object.keys(LIFE)) {
    const t = findTarget(tool, x, z, spots);
    if (t && (!best || t.d < best.d)) best = { ...t, tool };
  }
  return best;
}

// 테스트 서버 광장의 체험용 나무
export function buildLifeSpots(scene) {
  const g = new THREE.Group();
  for (const s of LIFE_SPOTS) {
    const o = new THREE.Group();
    o.position.set(s.x, 0, s.z);
    // 마을 나무와 같은 몽글몽글한 나무 (조금 작게)
    const trunk = new THREE.Mesh(trunkGeometry().scale(0.85, 0.85, 0.85), toon(0xc0905c));
    const leaves = new THREE.Mesh(roundCanopy().scale(0.85, 0.85, 0.85), swayToon(0x7fc456, { vertexColors: true }));
    o.add(trunk, leaves);
    addOutline(trunk, 0.025);
    addOutline(leaves, 0.025, { sway: true }); // 마을 나무처럼 잎이 살랑 흔들림
    g.add(o);
  }
  scene.add(g);
  return g;
}
