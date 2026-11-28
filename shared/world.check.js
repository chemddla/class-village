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
import { isBlocked, PORTALS, portalArrive, FIELD, FIELD_POND, FIELD_MONSTERS, FIELD_MOBS, FIELD_BOSS, waterNear } from './world.js';
for (const p of PORTALS) assert.ok(!isBlocked(portalArrive(p).x, portalArrive(p).z), `${p.name} 포탈 도착 자리`);
for (const p of PORTALS) assert.ok(!isBlocked(p.x, p.z), `${p.name} 포탈 가운데는 지나갈 수 있음`);
assert.ok(!isBlocked(FIELD.x, FIELD.z));
assert.ok(isBlocked(FIELD.x, FIELD.z - FIELD.r - 10)); // 들판 바깥 숲
assert.ok(isBlocked(FIELD_POND.x, FIELD_POND.z));
for (const m of FIELD_MOBS) for (let a = 0; a < 8; a++) assert.ok(!isBlocked(m.x + Math.sin(a * Math.PI / 4) * m.r, m.z + Math.cos(a * Math.PI / 4) * m.r), `들판 몬스터 길 (${m.kind})`);
// 들판 몬스터 레벨: 포탈에서 멀수록 높다 (입구 근처에 높은 레벨 없음) · 1~19 가 다 있다 · 필드보스 자리는 비어 있다
{
  const gate = PORTALS[1];
  const band = (d) => (d < 31 ? [1, 3] : d < 50 ? [3, 7] : d < 78 ? [7, 12] : d < 105 ? [12, 16] : [16, 19]);
  for (const m of FIELD_MOBS) {
    const [lo, hi] = band(Math.hypot(m.x - gate.x, m.z - gate.z));
    assert.ok(m.lv >= lo && m.lv <= hi, `들판 ${m.kind} Lv${m.lv} 는 포탈에서 그 거리에 맞지 않음`);
  }
  for (let lv = 1; lv <= 19; lv++) assert.ok(FIELD_MOBS.some((m) => m.lv === lv), `들판에 Lv${lv} 몬스터 없음`);
  for (const s of FIELD_MONSTERS) assert.ok(Math.hypot(s.x - FIELD_BOSS.x, s.z - FIELD_BOSS.z) > s.r + FIELD_BOSS.r, '필드보스 자리 비움');
  assert.ok(!isBlocked(FIELD_BOSS.x, FIELD_BOSS.z), '필드보스 자리는 들판 안');
}
assert.equal(waterNear(FIELD.x, FIELD.z), null);
assert.equal(waterNear(FIELD_POND.x + FIELD_POND.r + 0.5, FIELD_POND.z), 'river'); // 연못가에서는 낚시
// 들판 나무·바위·꽃은 마을 목록 뒤에 붙고, 지형지물은 막히며 길·몬스터 자리를 막지 않는다
import { WORLD, FIELD_MAP, fruitOf, ROCKS_GONE } from './world.js';
assert.equal(WORLD.trees[FIELD_MAP.base.trees], FIELD_MAP.trees[0]);
assert.equal(fruitOf(WORLD.fruitTrees.length - 1), 'apple');
assert.equal(fruitOf(0), 'peach');
for (const c of FIELD_MAP.propCircles) assert.ok(isBlocked(c.x, c.z), '지형지물은 부딪힘');
const r0 = FIELD_MAP.base.rocks;
assert.ok(isBlocked(WORLD.rocks[r0].x, WORLD.rocks[r0].z));
ROCKS_GONE.add(r0);
assert.ok(!isBlocked(WORLD.rocks[r0].x, WORLD.rocks[r0].z), '깨진 들판 바위는 지나감');
ROCKS_GONE.delete(r0);
console.log('지형지물', Object.entries(FIELD_MAP.props.reduce((t, o) => ({ ...t, [o.kind]: (t[o.kind] ?? 0) + 1 }), {})), '꽃', FIELD_MAP.flowers.length, '사과나무', FIELD_MAP.fruitTrees.length);
console.log('world.check (들판): ok');

// 마을 몬스터: 도는 길(과 조금 바깥)이 모두 풀밭이고, 광장에서 떨어져 있고, 자리끼리 드문드문 · 둘이 사는 자리는 들판에도 있는 짝
import { VILLAGE_MONSTERS, VILLAGE_MOBS, SPAWN, groundKind, inField } from './world.js';
{
  const pair = (s) => s.mobs.map((m) => m.kind).sort().join('+');
  const fieldPairs = new Set(FIELD_MONSTERS.filter((s) => s.mobs.length === 2).map(pair));
  for (const s of VILLAGE_MONSTERS) {
    assert.ok(!inField(s.x, s.z), `마을 몬스터 자리 ${s.x},${s.z} 는 마을 안`);
    for (let a = 0; a < 12; a++) assert.equal(groundKind(s.x + Math.sin(a * Math.PI / 6) * (s.r + 0.6), s.z + Math.cos(a * Math.PI / 6) * (s.r + 0.6)), 'grass', `마을 몬스터 자리 ${s.x},${s.z} 도는 길`);
    assert.ok(Math.hypot(s.x - SPAWN.x, s.z - SPAWN.z) > 24, `마을 몬스터 자리 ${s.x},${s.z} 는 광장에서 떨어져 있음`);
    for (const n of VILLAGE_MONSTERS) if (n !== s) assert.ok(Math.hypot(s.x - n.x, s.z - n.z) > 19, '마을 몬스터 자리는 드문드문');
    if (s.mobs.length === 2) assert.ok(fieldPairs.has(pair(s)), `마을 ${pair(s)} 는 들판에 있는 합동 모션 짝`);
  }
  assert.equal(VILLAGE_MOBS.length, VILLAGE_MONSTERS.reduce((t, s) => t + s.mobs.length, 0));
}
console.log('world.check (마을 몬스터): ok');

// 레벨: 경계에서 정확히 오르고, 남은 경험치가 다음 레벨 몫으로 넘어간다
import { levelOf, afterDeath, statsOf, abilitiesOf, defenseOf, defCut, DEF_HALF, MONSTERS, dmgRoll, DMG_SPREAD, shareXp } from './world.js';
assert.deepEqual(levelOf(0), { lv: 1, xp: 0, need: 20 });
assert.deepEqual(levelOf(19), { lv: 1, xp: 19, need: 20 });
assert.deepEqual(levelOf(20), { lv: 2, xp: 0, need: 40 });
assert.deepEqual(levelOf(70), { lv: 3, xp: 10, need: 60 });
assert.equal(afterDeath(70), 64); // Lv3 칸(60)의 10% = 6
assert.equal(afterDeath(62), 60); // 모은 만큼까지만: 레벨은 그대로
assert.equal(afterDeath(0), 0);
console.log('world.check (레벨): ok');

// 스텟: 모험가는 힘만 레벨마다 +4, 전직하면 처음부터 주 +3 · 부 +1 로 다시 짠다. Lv1 능력치는 예전 기본값 그대로
import { canWield } from './world.js';
assert.deepEqual(statsOf(1), { str: 1, dex: 1, int: 1, luk: 1 });
assert.deepEqual(statsOf(10), { str: 28, dex: 1, int: 1, luk: 1 });
assert.deepEqual(statsOf(10, 'mage'), { str: 1, dex: 1, int: 28, luk: 10 });
assert.deepEqual(statsOf(12, 'archer'), { str: 1, dex: 34, int: 1, luk: 12 });
assert.ok(canWield('club', '') && canWield('axe', '') && !canWield('bow', '') && canWield('bow', 'archer') && canWield('bow', '', true));
assert.ok(canWield('club', 'archer') && !canWield('staff', 'archer') && !canWield('woodSword', 'thief') && canWield('woodSword', 'warrior'));
const a1 = abilitiesOf(statsOf(1));
assert.equal(a1.hpMax, 100); assert.equal(a1.attack.str, 10); assert.equal(a1.crit, 0.1); assert.equal(a1.miss, 0.05); assert.equal(a1.dodgeCool, 0.3);
assert.equal(a1.def, 0); assert.equal(defCut(0), 1); assert.equal(defCut(DEF_HALF), 0.5);
assert.ok(defenseOf(30, 'warrior') > defenseOf(30, 'thief') && defenseOf(30, 'thief') > defenseOf(30, '') && defenseOf(30, '') > defenseOf(30, 'archer') && defenseOf(30, 'archer') > defenseOf(30, 'mage'), '방어력: 전사 > 도적 > 모험가 > 궁수 > 마법사');
for (const [k, m] of Object.entries(MONSTERS)) assert.ok(m.name && m.lv >= 1 && m.hp > 0 && m.atk > 0 && m.def >= 0 && m.eva >= 0 && m.xp > 0, `몬스터 능력치: ${k}`);
// 레벨이 다른 몬스터: 기본 레벨이면 표 값 그대로, 레벨이 오를수록 단단·아프게·경험치 많이 · 나보다 많이 낮으면 경험치를 덜 줌
{
  const { monsterStats, killXp } = await import('./world.js');
  for (const k in MONSTERS) {
    const b = monsterStats(k, MONSTERS[k].lv);
    assert.ok(b.hp === MONSTERS[k].hp && b.atk === MONSTERS[k].atk && b.xp === MONSTERS[k].xp, `기본 레벨 ${k}`);
    const hi = monsterStats(k, MONSTERS[k].lv + 5);
    assert.ok(hi.hp > b.hp && hi.atk > b.atk && hi.def > b.def && hi.xp > b.xp, `레벨 오름 ${k}`);
  }
  assert.equal(monsterStats('nalgae', 99).lv, 20);
  assert.equal(killXp('nalgae', 5, 5), monsterStats('nalgae', 5).xp);
  assert.ok(killXp('nalgae', 1, 19) < killXp('nalgae', 1, 6));
  assert.ok(killXp('nalgae', 1, 19) >= 1);
}
assert.equal(dmgRoll(DMG_SPREAD, () => 0), 1 - DMG_SPREAD); assert.equal(dmgRoll(0.3, () => 0.5), 1); assert.ok(Math.abs(dmgRoll(0.3, () => 1) - 1.3) < 1e-9);
assert.ok(abilitiesOf(statsOf(10, 'archer'), 10, 'archer').spread < abilitiesOf(statsOf(10, 'thief'), 10, 'thief').spread, '흔들림: 궁수 < 도적');
{ // 경험치 나누기: 혼자면 그대로, 둘이 반반이면 각자 (1.1배의) 반, 맞아 준 것도 기여
  const one = shareXp(() => 20, new Map([['a', 90]]), new Map());
  assert.equal(one.get('a'), 20);
  const two = shareXp(() => 20, new Map([['a', 45], ['b', 45]]), new Map());
  assert.equal(two.get('a'), 11); assert.equal(two.get('b'), 11);
  const tank = shareXp(() => 20, new Map([['a', 90]]), new Map([['b', 30]]));
  assert.ok(tank.get('b') > 0 && tank.get('a') > tank.get('b'), '맞아 준 사람도 받음');
  assert.equal(shareXp(() => 20, new Map(), new Map()).size, 0);
}
console.log('world.check (스텟): ok');
