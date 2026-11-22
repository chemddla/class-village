// 팔-몸 충돌 보정 점검: node client/src/villager/collision.check.js
// 실제 캐릭터와 같은 관절 위치로 만든 rig에서 모든 액션을 재생하며, 보정 전후로 팔이 몸에 박힌 깊이를 잰다.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ACTIONS, createAnimator } from './actions.js';
import { EQUIPMENT, attachEquipment, updateEquipment, straightenWrists } from './equipment.js';
import { resolveArmCollision, armPenetration } from './collision.js';
import { bodyColliders, SHOULDER, HEAD_Y } from './villager.js';

const TY = 0.9;
function makeRig(o) {
  const g = (parent, name, x = 0, y = 0, z = 0) => {
    const j = new THREE.Group();
    j.name = name;
    j.position.set(x, y, z);
    parent.add(j);
    j.userData.rest = j.position.clone();
    return j;
  };
  const root = new THREE.Group();
  root.userData.rest = new THREE.Vector3();
  const rig = { root };
  rig.pelvis = g(root, 'pelvis', 0, 0.29);
  rig.spine = g(rig.pelvis, 'spine');
  rig.head = g(rig.spine, 'head', 0, HEAD_Y);
  for (const [s, x] of [['R', -1], ['L', 1]]) {
    rig[`hip${s}`] = g(rig.pelvis, 'hip', x * 0.058, -0.04);
    rig[`knee${s}`] = g(rig[`hip${s}`], 'knee', 0, -0.1);
    rig[`foot${s}`] = g(rig[`knee${s}`], 'foot', 0, -0.1);
    rig[`shoulder${s}`] = g(rig.spine, 'sh', x * SHOULDER.x, SHOULDER.y);
    rig[`elbow${s}`] = g(rig[`shoulder${s}`], 'el', 0, -0.09);
    rig[`hand${s}`] = g(rig[`elbow${s}`], 'hand', 0, -0.078);
    const sock = g(rig[`hand${s}`], s === 'R' ? 'rightSocket' : 'leftSocket', 0, -0.05, 0.004);
    rig[s === 'R' ? 'rightSocket' : 'leftSocket'] = sock;
  }
  rig.colliders = [...bodyColliders(o, rig.pelvis, rig.spine), { joint: rig.head, ell: [0.215, 0.18, 0.185] }];
  return rig;
}

// 주먹(반지름 26mm)이 반대편 팔(굵기 20mm)에 파고든 깊이: 두 손으로 쥘 때 한 손이 다른 팔을 뚫고 지나가는지 본다
const P3 = () => new THREE.Vector3();
function segDist(p, a, b) {
  const ab = b.clone().sub(a);
  const k = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, k));
}
function fistInArm(rig) {
  let worst = 0;
  for (const [s, o] of [['R', 'L'], ['L', 'R']]) {
    const fist = rig[s === 'R' ? 'rightSocket' : 'leftSocket'].getWorldPosition(P3());
    const S = rig[`shoulder${o}`].getWorldPosition(P3()), E = rig[`elbow${o}`].getWorldPosition(P3()), H = rig[`hand${o}`].getWorldPosition(P3());
    worst = Math.max(worst, 0.046 - Math.min(segDist(fist, S, E), segDist(fist, E, H)));
  }
  return worst;
}

const outfit = { bottom: 'shorts', plaid: true };
const report = [];
const only = process.argv[2]?.split(','); // 액션 이름을 주면 그것만 (예: node collision.check.js chop,clubSmash)
for (const [name, def] of Object.entries(ACTIONS)) {
  if (only && !only.includes(name)) continue;
  const rig = makeRig(outfit);
  const equipment = def.equip ?? 'none';
  if (EQUIPMENT[equipment]) attachEquipment(rig, equipment);
  const p = createAnimator();
  p.play(name);
  const sec = def.duration ?? 3;
  let before = 0;
  const afters = [];
  let wrist = 0; // 두 손으로 쥔 동안 손목이 가장 많이 꺾인 각도(도)
  let cross = 0; // 두 손으로 쥔 동안 주먹이 반대편 팔에 가장 깊이 파고든 깊이
  let sag = 1; // 몽둥이를 휘두르는 동안(타격~관성) 끝이 가장 아래를 향한 정도 (세계 기준 y, -1 = 곧장 아래)
  for (let i = 1; i <= Math.round(sec * 60); i++) {
    const t = i / 60;
    const fx = p.update(rig, t, 1 / 60);
    updateEquipment(rig, rig.root, fx, t, 1 / 60, { equipment, action: name });
    rig.root.updateMatrixWorld(true);
    // 시작 직후 몇 프레임은 차렷(팔 곧게 내림)에서 넘어오는 중이라 원래 깊이 측정에서 뺀다
    if (i > 15) before = Math.max(before, armPenetration(rig));
    resolveArmCollision(rig);
    afters.push(armPenetration(rig));
    straightenWrists(rig);
    if ((rig.twoHandW ?? 0) > 0.9) {
      for (const s of ['R', 'L']) {
        const h = rig[`hand${s}`];
        const f = h.getWorldPosition(new THREE.Vector3()).sub(rig[`elbow${s}`].getWorldPosition(new THREE.Vector3())).normalize();
        const d = new THREE.Vector3(0, -1, 0).applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion()));
        wrist = Math.max(wrist, THREE.MathUtils.radToDeg(d.angleTo(f)));
      }
      cross = Math.max(cross, fistInArm(rig));
      const u = t / sec;
      if (def.equip === 'club' && u >= 0.48 && u <= 0.7) sag = Math.min(sag, new THREE.Vector3(0, 0, 1).applyQuaternion(rig.rightSocket.getWorldQuaternion(new THREE.Quaternion())).y);
    }
  }
  afters.sort((a, b) => a - b);
  const mm = (v) => +(v * 1000).toFixed(1);
  // after: 가장 깊은 순간, p90: 열 프레임 중 아홉은 이보다 얕음 (자리를 옮기는 도중 한두 프레임은 빼고 본 평소 모습)
  report.push({ name, before: mm(before), after: mm(afters.at(-1)), p90: mm(afters[Math.floor(afters.length * 0.9)]), wrist: +wrist.toFixed(1), cross: mm(cross), sag: +sag.toFixed(2) });
}
console.table(report); // 단위: mm(캐릭터 키 1m 기준)

const by = Object.fromEntries(report.map((r) => [r.name, r]));
// 1) 보정 뒤에는 한 손 액션이 3mm 넘게 박히지 않음.
//    두 손 쥐기는 팔이 짧아 몸 한가운데 앞의 자루를 완전히 비켜 쥘 수 없다. 도구가 몸·머리를 지나가지 않고 손이 튀지 않는 것을
//    먼저 지키고, 팔은 평소(p90) 옷 겉면에 3cm쯤 묻히는 데까지, 가장 깊은 순간도 45mm 미만까지 허용한다
for (const r of report) {
  const twoHand = EQUIPMENT[ACTIONS[r.name].equip]?.twoHand != null;
  if (!twoHand) assert.ok(r.after < 3, `${r.name}: 보정 뒤에도 ${r.after}mm 박힘`);
  else {
    assert.ok(r.p90 < 35, `${r.name}: 보정 뒤에도 평소 ${r.p90}mm 박힘`);
    assert.ok(r.after < 45, `${r.name}: 보정 뒤에도 순간 ${r.after}mm 박힘`);
  }
}
// 1') 두 손으로 쥔 동안 손목은 꺾이지 않는다(아래팔과 한 줄), 몽둥이 연속 공격은 휘두르는 내내 끝이 아래로 처지지 않는다
for (const r of report) {
  assert.ok(r.wrist < 15, `${r.name}: 손목이 ${r.wrist}도 꺾임`);
  if (/^clubSmash|^chop$|^fish/.test(r.name)) assert.ok(r.cross < 15, `${r.name}: 주먹이 반대편 팔에 ${r.cross}mm 파고듦`);
  if (/^clubSmash/.test(r.name)) assert.ok(r.sag > -0.3, `${r.name}: 몽둥이 끝이 아래로 처짐 (${r.sag})`);
}
// 2) 대기 자세는 원래도 손이 셔츠 밑단에 1~2cm 묻혀 있었다: 보정은 팔을 그만큼만 살짝 벌린다
assert.ok(by.idle.before < 25, `대기 자세가 원래 ${by.idle.before}mm 박혀 있음 (보정 폭이 너무 커짐)`);

// 3) 보정이 프레임마다 쌓이지 않음: 같은 자세를 계속 보정해도 어깨 각도가 그대로
{
  const rig = makeRig(outfit);
  const p = createAnimator();
  p.play('guard');
  const qs = [];
  for (let i = 1; i <= 240; i++) {
    p.update(rig, 1, 1 / 60); // 같은 시각 → 같은 목표 자세
    rig.root.updateMatrixWorld(true);
    resolveArmCollision(rig);
    if (i > 200) qs.push(rig.shoulderL.quaternion.clone());
  }
  assert.ok(qs.every((q) => q.angleTo(qs[0]) < 1e-3), '보정이 프레임마다 누적됨');
}
console.log('collision.check: ok');
