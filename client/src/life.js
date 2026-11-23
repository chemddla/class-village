// 생활 행동: 생활 대상(곤충·나무·물가·꽃) 앞에서 G 를 누르면, 손에 무엇을 들었든 그 일에 맞는 도구를 꺼내 들고 한다
import * as THREE from 'three';
import { WORLD, LIFE_SPOTS, RIVER_HALF_WIDTH, riverCenterZ, ANIM, waterNear } from '../../shared/world.js';
import { toon, swayToon, addOutline } from './materials.js';
import { roundCanopy, trunkGeometry } from './village.js';

const REACH = 1.8; // 대상까지 이만큼 안이면 가능 (m)
// 도구 → 동작, 대상 이름(안내 문구용)
export const LIFE = {
  net: { anim: ANIM.NET_SWING, what: '곤충' }, // 곤충이 가까우면 꽃·나무보다 먼저 (거리가 같으면 앞에 있는 것을 고름)
  none: { anim: ANIM.GATHER, what: '꽃' },
  axe: { anim: ANIM.CHOP, what: '나무' },
  rod: { anim: ANIM.FISH, what: '물가' },
};

// 과일나무마다 남은 과일 수 (서버 상태를 main.js 가 채움, WORLD.fruitTrees 순서)
export const fruitLeft = [];
// 마을의 곤충 자리: 번호 → { x, y, z } (서버 상태를 main.js 가 채움)
export const bugSpots = new Map();
const NET_NOTICE = 2.4; // 이만큼 안에 곤충이 있으면 G가 잠자리채 휘두르기가 된다 (m)

// 과일나무 흔들기(F): 바로 앞에 붙어 선 과일나무 중 과일이 남은 가장 가까운 나무 { x, z, d, pick: 과일나무 번호 } 또는 null
// 두 손으로 줄기를 잡아야 해서 나무에 거의 붙어 있어야 한다 (부딪히는 원 가장자리에서 SHAKE_REACH 안)
const SHAKE_REACH = 0.75;
export function findFruit(x, z) {
  let best = null;
  let bestD = SHAKE_REACH;
  WORLD.fruitTrees.forEach((ti, k) => {
    const t = WORLD.trees[ti];
    const d = Math.hypot(t.x - x, t.z - z) - t.r;
    if (fruitLeft[k] > 0 && d < bestD) { bestD = d; best = { x: t.x, z: t.z, d, pick: k }; }
  });
  return best;
}

// 이 도구로 할 수 있는 가장 가까운 대상 위치(바라볼 곳, d: 거리) 또는 null. spots: 테스트용 생활 요소(없으면 [])
export function findTarget(tool, x, z, spots) {
  let best = null;
  let bestD = REACH;
  const near = (tx, tz, pad = 0) => {
    const d = Math.hypot(tx - x, tz - z) - pad;
    if (d < bestD) { bestD = d; best = { x: tx, z: tz, d }; }
  };
  const of = (kind) => spots.filter((s) => s.kind === kind);
  if (tool === 'net') {
    for (const b of bugSpots.values()) if (Math.hypot(b.x - x, b.z - z) < NET_NOTICE) near(b.x, b.z, 0.6); // 0.6m 더 가까운 셈 쳐서, 조금 멀어도 곤충이 먼저
  } else if (tool === 'axe') {
    for (const t of WORLD.trees) near(t.x, t.z, t.r);
    for (const t of of('tree')) near(t.x, t.z, 0.3);
  } else if (tool === 'rod') {
    // 강둑이면 강 가운데 쪽, 바닷가면 섬 바깥(바다) 쪽을 보고 던진다
    const where = waterNear(x, z);
    if (where === 'river') near(x, riverCenterZ(x), RIVER_HALF_WIDTH);
    else if (where === 'sea') {
      const L = Math.hypot(x, z) || 1;
      near(x + (x / L) * 3, z + (z / L) * 3, 2.9);
    }
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
