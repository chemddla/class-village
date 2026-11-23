// 지도 도우미 자가 점검: node shared/world.check.js
import assert from 'node:assert/strict';
import { inSwing } from './world.js';

assert.ok(inSwing(0, 0, 0, 0, 1)); // 바로 앞 (+z를 볼 때)
assert.ok(!inSwing(0, 0, 0, 0, -1)); // 등 뒤
assert.ok(!inSwing(0, 0, 0, 0, 2)); // 너무 멂
assert.ok(inSwing(0, 0, Math.PI * 2 - 0.1, 0.1, 1)); // 각도가 한 바퀴 넘어가도
assert.ok(inSwing(0, 0, Math.PI / 2, 1, 0)); // +x를 볼 때 오른쪽
console.log('world.check: ok');

// 들판·포탈: 도착 자리는 갈 수 있고, 들판 가장자리 밖·연못은 막히고, 들판에서는 낚시가 안 된다
import { isBlocked, PORTALS, portalArrive, FIELD, FIELD_POND, FIELD_MONSTERS, waterNear } from './world.js';
for (const p of PORTALS) assert.ok(!isBlocked(portalArrive(p).x, portalArrive(p).z), `${p.name} 포탈 도착 자리`);
for (const p of PORTALS) assert.ok(!isBlocked(p.x, p.z), `${p.name} 포탈 가운데는 지나갈 수 있음`);
assert.ok(!isBlocked(FIELD.x, FIELD.z));
assert.ok(isBlocked(FIELD.x, FIELD.z - 40)); // 들판 바깥 숲
assert.ok(isBlocked(FIELD_POND.x, FIELD_POND.z));
for (const m of FIELD_MONSTERS) assert.ok(!isBlocked(m.x + m.r, m.z), '날개콩 길');
assert.equal(waterNear(FIELD.x, FIELD.z), null);
console.log('world.check (들판): ok');
