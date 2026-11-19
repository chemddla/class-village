// 액션 재생기 자가 점검: node client/src/villager/actions.check.js
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ACTIONS, createAnimator } from './actions.js';

// 액션이 건드리는 관절을 모두 가진 가짜 rig
const rig = {};
for (const j of ['root', 'pelvis', 'spine', 'head', 'shoulderR', 'shoulderL', 'elbowR', 'elbowL', 'handR', 'handL',
  'hipR', 'hipL', 'kneeR', 'kneeL', 'footR', 'footL']) {
  rig[j] = new THREE.Object3D();
  rig[j].userData.rest = new THREE.Vector3();
}
const run = (p, sec, t0 = 0) => {
  for (let i = 1; i <= Math.round(sec * 60); i++) p.update(rig, t0 + i / 60, 1 / 60);
};

// 1) 콜백 없이 일회성 액션을 끝까지 돌려도 멈추지 않고, 끝나면 다음 액션으로 넘어감
for (const [name, def] of Object.entries(ACTIONS)) {
  if (!def.duration) continue;
  const p = createAnimator();
  let next = 'unset';
  p.onEnd = (_n, nx) => { next = nx; };
  p.play(name);
  run(p, def.duration + 0.1);
  assert.equal(next, def.hold ? null : def.next ?? 'idle', name);
}

// 2) 타격 콜백은 hitAt 개수만큼, 완료 콜백은 한 번
{
  const p = createAnimator();
  const hits = [];
  let done = 0;
  let doneName = '';
  p.onEnd = () => p.play('idle'); // 실제 캐릭터처럼 끝나면 바로 대기로 넘어가도
  p.play('slash2', (_n, i) => hits.push(i), (n) => { done++; doneName = n; });
  run(p, 1.2);
  assert.deepEqual(hits, [1, 2]);
  assert.equal(done, 1);
  assert.equal(doneName, 'slash2');
}

// 3) 제자리 한 바퀴(2π) 뒤 대기로 돌아갈 때 반대로 되감지 않음
{
  const p = createAnimator();
  p.play('castSpell');
  run(p, 0.9);
  const before = rig.pelvis.rotation.y;
  p.play('idle');
  run(p, 1, 0.9);
  assert.ok(Math.abs(rig.pelvis.rotation.y - before) < 0.3, `되감김: ${before} → ${rig.pelvis.rotation.y}`);
}
console.log('actions.check: ok');
