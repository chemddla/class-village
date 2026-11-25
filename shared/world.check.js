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
assert.ok(isBlocked(FIELD.x, FIELD.z - 80)); // 들판 바깥 숲
assert.ok(isBlocked(FIELD_POND.x, FIELD_POND.z));
for (const m of FIELD_MONSTERS) assert.ok(!isBlocked(m.x + m.r, m.z), '날개콩 길');
assert.equal(waterNear(FIELD.x, FIELD.z), null);
console.log('world.check (들판): ok');

// 레벨: 경계에서 정확히 오르고, 남은 경험치가 다음 레벨 몫으로 넘어간다
import { levelOf, statsOf, abilitiesOf } from './world.js';
assert.deepEqual(levelOf(0), { lv: 1, xp: 0, need: 10 });
assert.deepEqual(levelOf(9), { lv: 1, xp: 9, need: 10 });
assert.deepEqual(levelOf(10), { lv: 2, xp: 0, need: 20 });
assert.deepEqual(levelOf(35), { lv: 3, xp: 5, need: 30 });
console.log('world.check (레벨): ok');

// 스텟: Lv10 모험가는 모두 10, 전직하면 Lv11 부터 주 +3 · 부 +1. Lv1 능력치는 예전 기본값 그대로
assert.deepEqual(statsOf(1), { str: 1, dex: 1, int: 1, luk: 1 });
assert.deepEqual(statsOf(10, 'archer'), { str: 10, dex: 10, int: 10, luk: 10 });
assert.deepEqual(statsOf(12, 'archer'), { str: 10, dex: 16, int: 10, luk: 12 });
assert.deepEqual(statsOf(12), { str: 12, dex: 12, int: 12, luk: 12 });
const a1 = abilitiesOf(statsOf(1));
assert.equal(a1.hpMax, 100); assert.equal(a1.attack.str, 10); assert.equal(a1.crit, 0.1); assert.equal(a1.miss, 0.05); assert.equal(a1.dodgeCool, 0.3);
console.log('world.check (스텟): ok');
