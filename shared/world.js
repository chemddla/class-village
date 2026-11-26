// 마을 지도 데이터 (화면과 서버가 함께 사용)
// 같은 시드로 만들기 때문에 지도 자체를 네트워크로 보낼 필요가 없다.

export const WORLD_SIZE = 120; // 한 변 120m (넓이는 처음 60m 마을의 4배)
export const HALF = WORLD_SIZE / 2;
export const EDGE = HALF - 1.2; // 마을(숲) 가장자리. 그 바깥은 모래 해변이 둘러싼 섬이다
export const PLAYER_RADIUS = 0.35;

// ── 섬 모양: 모서리가 둥근 네모(초타원)에 물결치는 해안선 ──
// islandN: 섬 가운데에서 잰 '둥근 네모' 거리 (가로·세로 방향에서는 실제 거리와 같고, 대각선에서는 조금 짧다)
// shoreN: 그 방향의 바닷가 위치 (islandN 이 이보다 크면 바다)
export const islandN = (x, z) => (x ** 4 + z ** 4) ** 0.25;
export function shoreN(x, z) {
  const a = Math.atan2(z, x);
  return HALF + 8.5 + 1.4 * Math.sin(3 * a + 0.5) + 0.9 * Math.sin(5 * a + 2) + 0.5 * Math.sin(9 * a + 1);
}
// 방향(cos, sin) 으로 가운데에서 islandN 이 n 이 되는 곳까지의 실제 거리
export const islandRadius = (n, c, s) => n / (c ** 4 + s ** 4) ** 0.25;
export const BEACH = {
  grass: 5, // 바닷가에서 이만큼 안쪽부터 모래 (그 안쪽은 풀밭)
  wet: 1.3, // 바닷가에서 이만큼 안쪽부터 젖은 모래
  walk: 1.0, // 바닷가에서 이만큼 안쪽까지 걸어갈 수 있음
};

// 이동 속도 (m/초)
export const WALK_SPEED = 3.2;
export const RUN_SPEED = 5.6;

// 동작 번호
export const ANIM = {
  IDLE: 0, WALK: 1, RUN: 2, WAVE: 3, JUMP: 4, CHEER: 5, GATHER: 6, CHOP: 7, FISH: 8, SURPRISE: 9, FAINT: 10, FLIP: 11, SMASH: 12, SMASH2: 13, SMASH3: 14,
  CHOP2: 15, CHOP3: 16, // 이어 하는 도끼질 (같은 동작, 번갈아 재생)
  SMASH_AIR: 17, SMASH_SLAM: 18, SMASH_DASH: 19, // 몽둥이 공중 공격 · 더블 점프 뒤 내리찍기 · 대시 공격
  SLASH1: 20, SLASH2: 21, SLASH3: 22, SLASH4: 23, // 목검(한손검) 대각선 베기 · 가로 되베기 · 찌르기 · 3타에 이어 치는 1타
  TREE_SHAKE: 24, // 과일나무 줄기 가운데를 두 손으로 잡고 흔들기
  POCKET: 25, // 떨어진 과일을 주워 오른쪽 허리 주머니에 넣기
  FISH_CAST: 26, FISH_WAIT: 27, FISH_CATCH: 28, // 낚시: 던지기 · 입질 기다리기 · 낚아 올리기
  SLASH_AIR: 30, SLASH_SLAM: 31, SLASH_DASH: 32, // 목검 점프 공격 · 더블 점프 뒤 내려베기 · 대시 공격
  SMASH4: 29, // 몽둥이 3타(야구 스윙, SMASH3)에 이어 치는 1타
  ROLL: 33, // Shift 회피 구르기
  BOW_AIM: 34, BOW_SHOT: 35, // 활: 공격키를 누르고 있는 동안 시위를 당겨 조준 · 떼면 놓아 쏘기
  NET_SWING: 36, NET_HIGH: 37, NET_LOW: 38, // 잠자리채 휘두르기: 가슴 높이 · 머리 위 · 발 앞 낮게 (곤충 채집)
  BOW_AIR: 39, BOW_SLAM: 40, BOW_BACK: 41, // 활 점프 공격(대각선 아래로) · 더블 점프 공격 · 달리기 공격(뒤돌아 쏘기)
  STAFF_CAST: 42, // 마법 지팡이: 앞으로 찔러 마법 에너지 볼 날리기
  HURT: 43, ANGRY: 44, // 맞아서 아파함 (질끈 감은 눈) · 자꾸 맞으면 발을 동동 구르며 화냄
  DAGGER1: 45, DAGGER2: 46, DAGGER3: 47, DAGGER4: 48, // 나무 단검(역수): 가로 베기 · 되베기 · 내려찍기 · 3타에 이어 치는 1타
  DAGGER_AIR: 49, DAGGER_SLAM: 50, DAGGER_DASH: 51, // 나무 단검 점프 베기 · 더블 점프 뒤 앞 아래로 내려가며 베기 · 숙여 달려들며 베기
  DAGGER_AIR2: 52, // 나무 단검 점프 공격 2타 (팔꿈치를 펴며 되베기)
  DAGGER5: 53, // 나무 단검 4타: 내려찍은 자세에서 그대로 올려 베기 (DAGGER4 는 4타에 이어 치는 1타)
  DAGGER_DASH2: 54, // 나무 단검 대시 공격 2타 (팔꿈치를 펴며 되베기)
  STAFF_CHARGE: 55, STAFF_FIRE: 56, STAFF_BIG: 57, // 마법 지팡이: 꾹 눌러 기 모으기 · 다 모으기 전에 떼어 보통 볼 쏘기 · 다 모아 큰 볼 쏘기
  STRIKE_CLUB: 58, STRIKE_SWORD: 59, STRIKE_DAGGER: 60, // 강타 스킬: 몽둥이 · 목검 · 나무 단검 (기본 공격 한 타를 더 크고 세게: 몽둥이·단검은 마지막 타, 목검은 2타 사선 베기)
  STRIKE_BOW: 61, STRIKE_BOW_SHOT: 62, // 강타 스킬 · 활: A를 누르고 있는 동안 시위를 끝까지 당긴 채 기를 모으고, 떼면 쏜다 (화살이 하나를 꿰뚫고 다음 것까지 맞힌다)
  STRIKE_STAFF: 63, // 강타 스킬 · 지팡이: A를 누르고 있는 동안 제자리에서 눈을 감고 기를 모아 마나를 빠르게 채운다
  DIG: 64, // 삽질: 삽을 들어 앞 땅에 꽂았다가 흙을 떠서 옆으로 (구덩이 파기·바위 깨기)
  FILL: 65, // 구덩이 덮기: 옆에 쌓인 흙을 삽으로 긁어 구덩이에 밀어 넣고, 삽 등으로 톡톡 다진다
};
export const ANIM_MAX = Math.max(...Object.values(ANIM));
// 손에 드는 도구 (번호로 주고받음). 맨손은 채집
export const TOOLS = ['none', 'axe', 'rod', 'club', 'woodSword', 'bow', 'net', 'staff', 'dagger', 'shovel']; // net: 잠자리채(+ 왼손 채집통), dagger: 나무 단검, shovel: 삽
// 활: 화살통에 넣고 다니는 화살 최대 개수 · 날아가는 빠르기(m/초) · 날아가는 거리(m)
export const ARROW = { max: 30, speed: 24, range: 20 };
// 마법 지팡이: 에너지 볼 한 발에 드는 마나 · 날아가는 빠르기(m/초) · 날아가는 거리(m)
export const BOLT = { cost: 7, speed: 8, range: 16, splash: 1, // speed: m/초 (눈으로 따라갈 수 있게 화살보다 느리게), splash: 터질 때 맞는 반지름(m)
  charge: 1.2, chargeCost: 15, big: 2 }; // 기 모으기: 다 모으는 데 걸리는 시간(초) · 모으는 동안 1초에 드는 마나 · 다 모아 쏜 볼의 크기·터지는 둘레 배수
export const LIFE_TOOLS = 3; // Q는 앞의 생활 도구만 돌림. 그 뒤(몽둥이·목검)는 인벤토리에서 꺼냄
// 테스트 서버에서 광장에 놓는 생활 체험용 나무
export const LIFE_SPOTS = [
  { kind: 'tree', x: -3.6, z: 1.2 },
];

// 과일 나무 종류. 마을마다 '주된 과일' 하나가 정해져 마을 과일나무에 열린다 (다른 과일은 나중에 상점에서 산다)
export const FRUITS = ['peach', 'apple', 'orange', 'pear'];
export const FRUIT_NAMES = { peach: '복숭아', apple: '사과', orange: '오렌지', pear: '배' };
export const VILLAGE_FRUIT = 'peach'; // 마을 과일나무에 열리는 과일
export const FIELD_FRUIT = 'apple'; // 들판 과일나무에 열리는 과일
export const FRUIT_MAX = 5; // 과일나무 한 그루에 열리는 개수
export const FRUIT_REGROW = 45; // 딴 과일이 다시 열리기까지 (초)
export const BAG_MAX = 99; // 가방에 넣을 수 있는 과일 한 종류의 최대 개수
// 레벨: 생활(줍기·곤충·물고기)과 몬스터 잡기로 경험치를 얻는다. 물고기는 별 개수(RARITY.stars)만큼 곱한다
export const XP = { grab: 1, bug: 4, fish: 3, monster: 8 };
export const xpNeed = (lv) => lv * 20; // lv → lv+1 에 필요한 경험치
// 모은 경험치 → { lv, xp: 이번 레벨에서 모은 만큼, need: 다음 레벨까지 필요한 만큼 }
export function levelOf(total) {
  let lv = 1;
  let xp = total;
  while (xp >= xpNeed(lv)) { xp -= xpNeed(lv); lv++; }
  return { lv, xp, need: xpNeed(lv) };
}

// 스텟: 레벨에 따라 저절로 오른다. Lv1 은 모두 1.
// 모험가는 레벨마다 힘 +3, 전직하면 처음부터 그 직업이었던 것처럼 다시 짠다(주스텟 +3 · 부스텟 +1 = 4포인트): 전직하면 늘 조금 더 세진다
export const STAT_NAMES = { str: '힘', dex: '민첩', int: '지능', luk: '운' };
export const JOB_LEVEL = 10;
// def: 레벨마다 오르는 방어력 (몸으로 부딪히는 전사가 가장 많이, 멀리서 싸우는 마법사가 가장 적게)
// spread: 피해 흔들림 범위 ±(궁수는 정확해서 고르게, 전사는 묵직하게 꾸준히, 마법사는 마력이 들쭉날쭉, 도적은 급소를 노려 크게 들쭉날쭉)
export const JOBS = {
  '': { name: '모험가', weapon: 'club', def: 1, spread: 0.15 },
  warrior: { name: '전사', main: 'str', sub: 'dex', weapon: 'woodSword', def: 2, spread: 0.1 },
  archer: { name: '궁수', main: 'dex', sub: 'luk', weapon: 'bow', def: 0.8, spread: 0.06 },
  mage: { name: '마법사', main: 'int', sub: 'luk', weapon: 'staff', def: 0.6, spread: 0.2 },
  thief: { name: '도적', main: 'luk', sub: 'dex', weapon: 'dagger', def: 1.2, spread: 0.3 },
};
// 방어력: Lv1 은 0, 레벨마다 직업의 def 만큼 (전직하면 처음부터 그 직업이었던 것처럼 다시 짠다)
export const defenseOf = (lv, job = '') => Math.round((lv - 1) * (JOBS[job] ?? JOBS['']).def * 10) / 10;
// 방어력 → 받는 피해 배수: 방어력 50이면 절반만 아프다 (몬스터도 같은 식)
export const DEF_HALF = 50;
export const defCut = (def) => DEF_HALF / (DEF_HALF + Math.max(0, def));
// 피해 흔들림: 맞힐 때마다 피해를 (1 - spread) ~ (1 + spread) 배 사이에서 고르게 굴린다. 사람은 직업의 spread, 몬스터는 DMG_SPREAD
export const DMG_SPREAD = 0.15;
export const dmgRoll = (spread = DMG_SPREAD, rand = Math.random) => 1 - spread + 2 * spread * rand();
export function statsOf(lv, job = '') {
  const s = { str: 1, dex: 1, int: 1, luk: 1 };
  const j = JOBS[job]?.main ? JOBS[job] : null;
  for (let l = 2; l <= lv; l++) {
    if (j) { s[j.main] += 3; s[j.sub] += 1; } else s.str += 3;
  }
  return s;
}
// 싸움 무기: 몽둥이는 누구나, 그 밖의 무기는 전직한 직업의 무기만 (생활 도구는 언제나). 테스트 서버(free)에서는 무기 시험을 위해 모두 풀어 둔다
export const WEAPONS = ['club', 'woodSword', 'bow', 'staff', 'dagger'];
export const canWield = (tool, job, free = false) => free || tool === 'club' || !WEAPONS.includes(tool) || JOBS[job]?.weapon === tool;
// 무기마다 공격력에 쓰는 스텟 (그 밖의 도구는 힘)
export const WEAPON_STAT = { club: 'str', woodSword: 'str', axe: 'str', bow: 'dex', staff: 'int', dagger: 'luk' };
// 무기마다 한 대 피해 배수: 빨리 휘두르는 무기는 낮게, 느린 무기는 높게 (초당 피해를 맞추려고)
// 목표: 근접 직업 모험가의 100~110% · 궁수 80~90%(멀리서 안전) · 마법사 70~80%(멀리서 + 터지면 여럿)
export const WEAPON_MULT = { club: 1, woodSword: 1, axe: 1, bow: 1.1, staff: 1.45, dagger: 0.6 }; // 목검은 조금 빠르고 전사 부스텟 덕에 1로도 모험가보다 약간 셈
// 능력치: 스텟 → 실제로 쓰는 값. Lv1(모두 1)이면 지금까지 쓰던 기본값 그대로. 몬스터와 싸울 때만 쓰고, 학생끼리는 기본값
// lv·job: 방어력 계산용 (없으면 Lv1 모험가)
export function abilitiesOf(s, lv = 1, job = '') {
  const b = (k) => s[k] - 1;
  const attack = {};
  for (const k in STAT_NAMES) attack[k] = 10 * (1 + 0.03 * b(k));
  return {
    def: defenseOf(lv, job),
    spread: (JOBS[job] ?? JOBS['']).spread, // 피해 흔들림 범위 (dmgRoll)
    hpMax: 100 + 3 * b('str') + b('dex') + b('int') + b('luk'),
    mpMax: 100 + 3 * b('int') + b('str') + b('dex') + b('luk'),
    hpRegen: 2 * Math.min(2, 1 + 0.02 * b('str')),
    mpRegen: 3 * Math.min(2, 1 + 0.02 * b('int')),
    attack, // 스텟 → 공격력 (그 스텟을 쓰는 무기로 칠 때)
    crit: Math.min(0.3, 0.1 + 0.005 * b('luk') + 0.002 * b('dex')),
    critMult: Math.min(2, 1.5 + 0.01 * b('luk')),
    miss: Math.max(0.01, 0.05 - 0.001 * b('dex')),
    dodgeCool: 0.3 * Math.max(0.5, 1 - 0.01 * b('luk') - 0.005 * b('dex')),
  };
}
// ── 몬스터 능력치 ── (종류마다 생김새·성격에 맞춰)
// lv: 레벨 (나보다 높으면 내 공격이 레벨 차이 1마다 2%씩 더 빗나감, 쓰러뜨리면 경험치도 레벨만큼 더)
// hp: 체력 · atk: 한 대 피해 · def: 방어력 (사람과 같은 식, defCut) · eva: 내 공격을 피하는 확률 (내 빗나감에 더함)
// crit: 치명타 확률 (치명타 피해는 1.5배) · xp: 쓰러뜨리면 얻는 경험치
// 여럿이 함께하는 게임이라 일반 몬스터도 단단하게: 같은 레벨은 혼자 잡을 만하고, 레벨이 높은 몬스터는 혼자면 쓰러지기 쉬워 둘·셋이 함께 잡는 게 좋다
export const MON_CRIT_MULT = 1.5;
export const MONSTERS = {
  nalgae: { name: '날개콩', lv: 1, hp: 90, atk: 19, def: 0, eva: 0.08, crit: 0.05, xp: 20 }, // 작고 말랑한 콩: 파닥여서 조금 잘 피함
  gugu: { name: '구구', lv: 1, hp: 72, atk: 17, def: 0, eva: 0.12, crit: 0.05, xp: 18 }, // 비둘기: 약하지만 푸드덕 잘 피함
  mongdang: { name: '몽당연필', lv: 2, hp: 100, atk: 29, def: 2, eva: 0.03, crit: 0.12, xp: 25 }, // 뾰족한 심: 아프게 찌르고 치명타가 잦음
  ttok: { name: '똑딱이', lv: 2, hp: 90, atk: 26, def: 1, eva: 0.06, crit: 0.12, xp: 25 }, // 똑딱볼펜: 가늘어서 약하지만 볼펜심으로 콕 찌름
  kkreyong: { name: '끄레용', lv: 2, hp: 130, atk: 24, def: 6, eva: 0.02, crit: 0.05, xp: 28 }, // 크레파스: 종이옷 덕에 단단, 느릿느릿
  banjjok: { name: '반쪽이', lv: 3, hp: 165, atk: 29, def: 10, eva: 0, crit: 0.05, xp: 33 }, // 납작한 몸통: 맷집이 가장 좋지만 피하지는 못함
  kkakkak: { name: '깍깍이', lv: 3, hp: 110, atk: 32, def: 2, eva: 0.12, crit: 0.1, xp: 33 }, // 까치 깡패: 부리가 매섭고 날쌤
  chul: { name: '철필통대장', lv: 15, hp: 520, atk: 60, def: 10, eva: 0, crit: 0.1, xp: 150 }, // 필드보스 (들판 북서쪽 끝 FIELD_BOSS 자리에 Lv20 으로): 크고 단단, 피하지는 못함
  haak: { name: '하악냥', lv: 4, hp: 125, atk: 36, def: 3, eva: 0.15, crit: 0.15, xp: 40 }, // 고양이: 가장 날쌔고 할퀴기가 매서움
};
// 레벨이 다른 몬스터: 위 값은 그 종류의 기본 레벨(lv) 값이고, 레벨이 그보다 1 높을 때마다
//   체력 +16% · 공격력 +13% · 방어력 +0.6 · 경험치 +10% (기본 값에 더해 감, 회피·치명타는 그대로)
// 같은 레벨 학생이 치면 레벨이 올라가도 대여섯 대쯤에 쓰러지고, 한 대에 체력의 15~20%쯤 아프게 맞춘 값
// (학생은 레벨마다 공격력 약 +9~12%, 체력 약 +5~10, 방어력 +0.6~2 가 오른다)
export const MON_GROW = { hp: 0.16, atk: 0.13, def: 0.6, xp: 0.1 };
export const MON_MAX_LV = 20;
export function monsterStats(kind, lv) {
  const b = MONSTERS[kind];
  const L = Math.max(1, Math.min(MON_MAX_LV, Math.round(lv ?? b.lv)));
  const g = Math.max(-0.8, L - b.lv); // 기본 레벨보다 낮아도 너무 약해지지는 않게
  return {
    ...b,
    lv: L,
    hp: Math.round(b.hp * (1 + MON_GROW.hp * g)),
    atk: Math.round(b.atk * (1 + MON_GROW.atk * g)),
    def: Math.round((b.def + MON_GROW.def * Math.max(0, g)) * 10) / 10,
    xp: Math.round(b.xp * (1 + MON_GROW.xp * g)),
  };
}
// 쓰러뜨려 얻는 경험치: 나보다 5레벨 넘게 낮은 몬스터는 한 레벨마다 15%씩 덜 준다 (가장 적게 20%)
// (높은 레벨이 입구에서 약한 몬스터만 잡아 쉽게 오르지 못하게)
export function killXp(kind, monLv, myLv) {
  const s = monsterStats(kind, monLv);
  const low = Math.max(0, myLv - s.lv - 5);
  return Math.max(1, Math.round(s.xp * Math.max(0.2, 1 - 0.15 * low)));
}
// 함께 잡으면 경험치를 기여도대로 나눈다. 기여도 = 준 피해 + 받은 피해 × TANK_WEIGHT (몸으로 막아 준 것도 쳐 줌)
// 여럿이 잡으면 PARTY_BONUS 만큼 더 얹어 나눈다 (한 명 늘 때마다 +10%, 최대 +50%): 혼자 잡을 때보다 손해 보지 않게
export const TANK_WEIGHT = 1;
export const PARTY_BONUS = 0.1;
// base(sid): 그 사람이 혼자 잡았을 때 받을 경험치 (killXp: 사람 레벨에 따라 다름)
// dealt·taken: Map(sid → 피해) · 돌려주는 값: Map(sid → 받을 경험치), 기여가 없으면 빈 Map
export function shareXp(base, dealt, taken) {
  const score = new Map();
  for (const [sid, d] of dealt) score.set(sid, (score.get(sid) ?? 0) + Math.max(0, d));
  for (const [sid, d] of taken) score.set(sid, (score.get(sid) ?? 0) + TANK_WEIGHT * Math.max(0, d));
  for (const [sid, s] of score) if (!(s > 0)) score.delete(sid);
  const sum = [...score.values()].reduce((a, b) => a + b, 0);
  const bonus = 1 + Math.min(0.5, PARTY_BONUS * (score.size - 1));
  const out = new Map();
  for (const [sid, s] of score) out.set(sid, Math.max(1, Math.round(base(sid) * bonus * (s / sum))));
  return out;
}
// ── 스킬 ──
// type: 'active' 는 키를 눌러 쓰고 마나·대기 시간이 든다, 'passive' 는 배우면 늘 저절로 효과가 붙는다
// job: 배우는 직업 ('' = 모험가 시절 스킬, 전직해도 그대로 쓴다) · lv: 배우는 레벨
// 액티브: mp 마나 · cool 다시 쓸 수 있기까지(초) · power 피해 배수 · weapons 들고 쓸 수 있는 무기 · key 단축키
export const SKILL_TYPES = { active: '액티브', passive: '패시브' };
export const SKILLS = {
  strike: { name: '강타', icon: '💥', type: 'active', job: '', lv: 1, mp: 15, cool: 3, power: 2.2, key: 'A',
    weapons: { club: ANIM.STRIKE_CLUB, woodSword: ANIM.STRIKE_SWORD, dagger: ANIM.STRIKE_DAGGER, bow: ANIM.STRIKE_BOW, staff: ANIM.STRIKE_STAFF },
    pierce: 1, // 활 강타: 화살이 이만큼 꿰뚫고 지나가 다음 대상까지 맞는다
    meditate: 2, // 지팡이 강타: 마나는 들지 않고, 모으는 동안 마나가 차는 빠르기가 이만큼 배가 된다
    desc: '들고 있는 무기를 온몸으로 크게 휘둘러 세게 친다. 이어 치는 중에 써도 바로 나간다. 활은 기를 모아 쏘고, 화살이 하나를 꿰뚫는다. 지팡이는 누르고 있는 동안 가만히 기를 모아 마나가 2배로 빠르게 찬다(마나가 들지 않는다)' },
};
// 강타에 맞는지: 보통 휘두르기보다 멀리·넓게 (앞쪽 1.8m · 좌우 약 69°)
export function inStrike(ax, az, rot, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  if (Math.hypot(dx, dz) > 1.8) return false;
  const d = Math.atan2(dx, dz) - rot;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 1.2;
}
export const PICK_REACH = 2.2; // 과일나무 둘레에서 이만큼 안이면 흔들 수 있음 (m)
export const SHAKE_DROP = [3, 4]; // 과일나무를 흔들면 떨어지는 개수 (이 사이에서 무작위, 남은 것보다 많이는 안 떨어짐)
export const GRAB_REACH = 1.3; // 땅에 떨어진 과일을 주울 수 있는 거리 (m)
export const DROP_LIFE = 300; // 떨어진 과일이 땅에 남아 있는 시간 (초), 지나면 사라짐

// ── 낚시 ──
// 희귀도: weight 입질 확률(상대값) · react 찌가 쏙 들어간 뒤 G를 눌러야 하는 시간(초)
// 흔할수록 자주 물고, 누를 시간이 넉넉해서 잡기 쉽다
export const RARITY = {
  common: { name: '흔함', stars: 1, weight: 60, react: 1.0 },
  uncommon: { name: '보통', stars: 2, weight: 28, react: 0.8 },
  rare: { name: '희귀', stars: 3, weight: 10, react: 0.6 },
  legend: { name: '전설', stars: 4, weight: 2, react: 0.45 },
};
// 물고기: where 강(river)·바다(sea) · price 상점에서 팔 값(희귀할수록 비쌈) · size 몸 길이 비율 · color 몸 색
export const FISH = [
  { id: 'medaka', name: '송사리', where: 'river', rarity: 'common', price: 40, size: 0.45, color: 0xb9c7a4 },
  { id: 'dace', name: '피라미', where: 'river', rarity: 'common', price: 60, size: 0.6, color: 0x9fc0d8 },
  { id: 'crucian', name: '붕어', where: 'river', rarity: 'common', price: 80, size: 0.7, color: 0xb59a62 },
  { id: 'catfish', name: '메기', where: 'river', rarity: 'uncommon', price: 300, size: 1.0, color: 0x6f6a5c },
  { id: 'carp', name: '잉어', where: 'river', rarity: 'uncommon', price: 250, size: 1.0, color: 0xd98b3e },
  { id: 'sweetfish', name: '은어', where: 'river', rarity: 'rare', price: 900, size: 0.75, color: 0xcfe0e6 },
  { id: 'trout', name: '무지개송어', where: 'river', rarity: 'rare', price: 1200, size: 0.95, color: 0xe59aa8 },
  { id: 'sturgeon', name: '철갑상어', where: 'river', rarity: 'legend', price: 5000, size: 1.5, color: 0x5d6f7a },
  { id: 'anchovy', name: '멸치', where: 'sea', rarity: 'common', price: 30, size: 0.4, color: 0xc4d6e2 },
  { id: 'mackerel', name: '고등어', where: 'sea', rarity: 'common', price: 120, size: 0.8, color: 0x4f86a8 },
  { id: 'scad', name: '전갱이', where: 'sea', rarity: 'common', price: 100, size: 0.7, color: 0x9ab2bf },
  { id: 'puffer', name: '복어', where: 'sea', rarity: 'uncommon', price: 350, size: 0.6, color: 0xe8d27a },
  { id: 'flatfish', name: '광어', where: 'sea', rarity: 'uncommon', price: 400, size: 1.0, color: 0x9a8565 },
  { id: 'clownfish', name: '흰동가리', where: 'sea', rarity: 'rare', price: 1000, size: 0.5, color: 0xf08a3c },
  { id: 'tuna', name: '참치', where: 'sea', rarity: 'rare', price: 2000, size: 1.6, color: 0x34567a },
  { id: 'whaleshark', name: '고래상어', where: 'sea', rarity: 'legend', price: 8000, size: 2.2, color: 0x56708a },
];
export const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));
// 물속 그림자 몸길이(m) ↔ 물고기 크기: 큰 그림자면 큰 물고기
export const shadowLen = (size) => 0.45 + size * 0.45;
export const sizeOfShadow = (len) => (len - 0.45) / 0.45;
// 그 물(강·바다)에서 그림자 하나를 고른다: 희귀도를 먼저(흔할수록 잘 나옴), 그 희귀도 물고기 중 하나 (rand: 0~1 함수)
export function rollFish(where, rand = Math.random) {
  const pool = FISH.filter((f) => f.where === where);
  const rarities = [...new Set(pool.map((f) => f.rarity))];
  let roll = rand() * rarities.reduce((t, r) => t + RARITY[r].weight, 0);
  let rarity = rarities[rarities.length - 1];
  for (const r of rarities) { roll -= RARITY[r].weight; if (roll < 0) { rarity = r; break; } }
  const choices = pool.filter((f) => f.rarity === rarity);
  return choices[Math.floor(rand() * choices.length)];
}
// 찌에 다가온 그림자 크기(size)에 맞는 물고기: 크기가 비슷한(±0.3) 물고기 중 희귀도 비율대로, 없으면 가장 비슷한 것
export function fishForShadow(where, size, rand = Math.random) {
  const pool = FISH.filter((f) => f.where === where);
  let near = pool.filter((f) => Math.abs(f.size - size) <= 0.3);
  if (!near.length) {
    const best = Math.min(...pool.map((f) => Math.abs(f.size - size)));
    near = pool.filter((f) => Math.abs(f.size - size) - best < 0.05);
  }
  let roll = rand() * near.reduce((t, f) => t + RARITY[f.rarity].weight, 0);
  for (const f of near) { roll -= RARITY[f.rarity].weight; if (roll < 0) return f; }
  return near[near.length - 1];
}
export const NOTICE = { dist: 3.0, angle: 40, after: [1.5, 3.0] }; // 알아채는 거리(입에서 m)·입 방향에서 벌어진 각도(도)·찌가 떨어진 뒤 알아채기 시작하는 때(초)
export const CAST_REACH = 1.3; // 물가(강둑·바닷가)에서 이만큼 안에 서 있어야 던질 수 있음 (m)
// 낚시 흐름: 찌가 물에 들어가면 물고기가 다가와(APPROACH) 입으로 찌를 4~5번 톡톡 건드리다가(NIBBLES, 찌가 살짝 까딱)
// 마지막에 덥석 물어 찌가 쏙 들어간다(입질). 그때 react 초 안에 G를 눌러야 잡힌다 (톡톡 건드릴 때 누르면 놀라 도망감)
export const FISH_APPROACH = 3.4; // 알아챈 뒤 찌 앞까지 오는 시간 (초): 멈칫하며 돌아서기(LURE_HESITATE) + 천천히 헤엄쳐 오기
export const LURE_HESITATE = 0.9; // 알아채고 속도를 줄이며 찌 쪽으로 돌아서는 시간 (초)
export const NIBBLE_GAP = [1.1, 2.0]; // 톡톡 건드리는 사이 (초)
export const BITE_AFTER = [1.0, 2.0]; // 마지막 톡 뒤 덥석 물기까지 (초)
export const NIBBLE_MS = 260; // 톡 한 번에 입을 찌에 댔다 떼는 빠르기 (클수록 천천히, ms)
export const REEL_SLACK = 0.3; // 인터넷이 늦게 닿는 만큼 봐주는 시간 (초)
// 이 자리에서 낚시할 수 있는 물: 'river' · 'sea' · null (강둑·바닷가 가까이에 서 있어야 함)
export function waterNear(x, z) {
  if (inField(x, z)) return Math.hypot(x - FIELD_POND.x, z - FIELD_POND.z) - FIELD_POND.r < CAST_REACH ? 'river' : null; // 들판 연못: 민물고기(강과 같은 물고기)
  const river = Math.abs(z - riverCenterZ(x)) - RIVER_HALF_WIDTH;
  const sea = shoreN(x, z) - islandN(x, z);
  if (river < CAST_REACH && river <= sea) return 'river';
  if (sea < BEACH.walk + CAST_REACH) return 'sea';
  return null;
}

// 찌가 떨어지는 곳: 캐릭터가 바라보는 쪽으로 이만큼 앞 (m, 낚싯대 모양과 맞춤)
export const BOB_AHEAD = 0.95 * 1.7;
// 찌가 떨어진 자리의 물: 'river' · 'sea' · null (물이 아니면 던질 수 없음)
export function waterAt(x, z) {
  if (inField(x, z)) return Math.hypot(x - FIELD_POND.x, z - FIELD_POND.z) < FIELD_POND.r - 0.15 ? 'river' : null;
  if (shoreN(x, z) - islandN(x, z) < 0.15) return 'sea'; // 물가(파도가 닿는 곳)부터 바다
  if (Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH - 0.15) return 'river';
  return null;
}

// 캐릭터 색 목록 (파스텔)
export const COLORS = [
  0xf4a7b9, 0xa7d8f4, 0xb8e6a1, 0xffd98e, 0xcdb4f0, 0xffb38a, 0x9ee3d4, 0xf7f08a,
];

// 시드 기반 난수 (항상 같은 지도를 만든다)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 강: x에 따라 살짝 굽이치는 띠
export const RIVER_HALF_WIDTH = 1.9;
export const RIVER_BANK_CLEAR = 3.0; // 강가에서 이만큼은 꽃 없이 비워 둠 (낚시 자리)
export function riverCenterZ(x) {
  return -11 + 1.4 * Math.sin(x * 0.13) + 0.6 * Math.sin(x * 0.31 + 1.2);
}

// 다리 (강을 건너는 곳)
export const BRIDGE = { x: 0, halfWidth: 1.3 };

// 처음 나타나는 곳 (마을 광장 한가운데)
export const SPAWN = { x: 0, z: 3 };

// 마을 광장: 돌바닥 원 + 가운데 분수 + 벤치·가로등 (rot: 벤치가 바라보는 각)
export const PLAZA = {
  r: 6,
  fountain: { x: SPAWN.x, z: SPAWN.z, r: 1.5 },
  benches: [
    { x: SPAWN.x - 3.4, z: SPAWN.z + 2.4 },
    { x: SPAWN.x + 3.4, z: SPAWN.z + 2.4 },
    { x: SPAWN.x + 3.4, z: SPAWN.z - 2.4 },
  ].map((b) => ({ ...b, rot: Math.atan2(SPAWN.x - b.x, SPAWN.z - b.z) })),
  lamps: [
    { x: SPAWN.x - 1.9, z: SPAWN.z - 5.4 }, { x: SPAWN.x + 1.9, z: SPAWN.z - 5.4 }, // 다리 쪽 입구
    { x: SPAWN.x - 5.4, z: SPAWN.z + 1.9 }, { x: SPAWN.x + 5.4, z: SPAWN.z + 1.9 }, // 상점·대장간 쪽 입구
  ],
};

// 건물 예정지 (나중에 학생들이 함께 짓는 자리)
export const PLOTS = [
  { id: 'board', name: '마을 게시판', x: 0, z: 9, w: 4, d: 3 },
  { id: 'shop', name: '상점 예정지', x: -13, z: 4, w: 6, d: 5 },
  { id: 'smithy', name: '대장간 예정지', x: 13, z: 4, w: 6, d: 5 },
  { id: 'museum', name: '박물관 예정지', x: 0, z: -21, w: 8, d: 5 },
];

function inPlot(x, z, margin) {
  for (const p of PLOTS) {
    if (Math.abs(x - p.x) < p.w / 2 + margin && Math.abs(z - p.z) < p.d / 2 + margin) return true;
  }
  return false;
}

function nearRiver(x, z, margin) {
  return Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH + margin;
}

function onPath(x, z, margin) {
  // 광장에서 다리로 이어지는 길 + 상점·대장간으로 이어지는 길
  if (Math.abs(x) < 1.5 + margin && z < 4 && z > -20) return true;
  return Math.abs(z - SPAWN.z) < 1.5 + margin && Math.abs(x) < 13;
}

export function generateWorld(seed = 20261118) {
  const rand = mulberry32(seed);
  const trees = [];
  const rocks = [];
  const flowers = [];

  const ok = (x, z, margin, list) => {
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 7) return false;
    if (inPlot(x, z, margin)) return false;
    if (nearRiver(x, z, margin)) return false;
    if (onPath(x, z, margin)) return false;
    for (const o of list) if (Math.hypot(x - o.x, z - o.z) < o.r + margin) return false;
    return true;
  };

  // 가장자리를 두르는 나무
  for (let i = 0; i < 280; i++) {
    const side = Math.floor(rand() * 4);
    const t = (rand() * 2 - 1) * (HALF - 1);
    const inset = HALF - 1 - rand() * 3;
    const x = side === 0 ? t : side === 1 ? t : side === 2 ? inset : -inset;
    const z = side === 0 ? inset : side === 1 ? -inset : t;
    const s = 0.8 + rand() * 0.6;
    if (ok(x, z, 0.6, trees)) trees.push({ x, z, s, r: 0.55 * s, kind: rand() < 0.35 ? 1 : 0 });
  }
  // 안쪽 숲
  for (let i = 0; i < 640 && trees.length < 440; i++) {
    const x = (rand() * 2 - 1) * (HALF - 4);
    const z = (rand() * 2 - 1) * (HALF - 4);
    const s = 0.75 + rand() * 0.55;
    if (ok(x, z, 1.4, trees)) trees.push({ x, z, s, r: 0.55 * s, kind: rand() < 0.35 ? 1 : 0 });
  }
  // 바위
  const all = [...trees];
  for (let i = 0; i < 320 && rocks.length < 72; i++) {
    const x = (rand() * 2 - 1) * (HALF - 3);
    const z = (rand() * 2 - 1) * (HALF - 3);
    const s = 0.5 + rand() * 0.6;
    if (ok(x, z, 1.0, all)) {
      const rock = { x, z, s, r: 0.6 * s, rot: rand() * Math.PI };
      rocks.push(rock);
      all.push(rock);
    }
  }
  // 꽃 (부딪히지 않는 장식). 강둑(강가에서 3m)에는 피지 않는다: 낚시할 때 가리지 않게
  for (let i = 0; i < 1040 && flowers.length < 560; i++) {
    const x = (rand() * 2 - 1) * (HALF - 2);
    const z = (rand() * 2 - 1) * (HALF - 2);
    if (ok(x, z, 0.3, all) && !nearRiver(x, z, RIVER_BANK_CLEAR)) flowers.push({ x, z, c: Math.floor(rand() * 4), s: 0.7 + rand() * 0.5 });
  }

  const colliders = [...trees.map((o) => ({ x: o.x, z: o.z, r: o.r })), ...rocks.map((o, i) => ({ x: o.x, z: o.z, r: o.r, rock: i }))];
  // 예정지 표지판 기둥·판
  for (const p of PLOTS) colliders.push({ x: p.x, z: p.z + p.d / 2 + 0.25, r: 0.35 });
  // 광장 분수·벤치·가로등
  colliders.push({ x: PLAZA.fountain.x, z: PLAZA.fountain.z, r: PLAZA.fountain.r });
  for (const b of PLAZA.benches) colliders.push({ x: b.x, z: b.z, r: 0.6 });
  for (const l of PLAZA.lamps) colliders.push({ x: l.x, z: l.z, r: 0.15 });
  // 과일나무: 광장에서 조금 떨어진 둥근 나무 중 가까운 8그루 (번호 목록)
  const fruitTrees = trees
    .map((t, i) => ({ i, d: Math.hypot(t.x - SPAWN.x, t.z - SPAWN.z), k: t.kind }))
    .filter((o) => o.k === 0 && o.d > 8 && o.d < 24)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8)
    .map((o) => o.i);
  return { seed, trees, rocks, flowers, colliders, fruitTrees };
}

// ── 들판(저렙 사냥터, 가명): 마을 섬과 멀리 떨어진 곳에 따로 있는 맵. 걸어서는 못 가고 포탈로만 오간다 ──
// 같은 방·같은 좌표계 안이라 접속을 바꾸지 않고 순간이동만 하면 된다 (z는 int16 cm 라 327m 안쪽이어야 함)
export const FIELD = { x: 0, z: 224, r: 80 }; // 가운데 · 걸어 다닐 수 있는 대략의 반지름 (가장자리는 물결 모양 숲)
export const inField = (x, z) => z > 120;
// 그 방향의 들판 가장자리까지 거리 (이보다 멀면 숲이라 못 감)
export function fieldEdge(x, z) {
  const a = Math.atan2(z - FIELD.z, x - FIELD.x);
  return FIELD.r + 3.6 * Math.sin(3 * a + 1) + 2.2 * Math.sin(5 * a + 0.3) + 1.0 * Math.sin(11 * a);
}
export const FIELD_POND = { x: FIELD.x - 36, z: FIELD.z - 14, r: 3.4 }; // 작은 연못 (못 들어감)
// ── 들판 몬스터 자리 ── Lv1~20 사냥터: 남쪽 끝 포탈에서 멀어질수록 레벨이 높다 (입구 근처에는 높은 레벨이 없다)
//   포탈에서 31m 안 Lv1~3 · 50m 안 Lv3~7 · 78m 안 Lv7~12 · 105m 안 Lv12~16 · 그 너머 Lv16~19
//   Lv20 은 FIELD_BOSS 자리의 필드보스 철필통대장 몫: 들어서서 왼쪽(서쪽) 맨 끝 구석, 포탈에서 가장 먼 쪽 (r 둘레는 비워 둔다 · 싸움터는 arena)
// 자리마다 가운데 x,z 를 몬스터가 빙 돈다: 첫째는 반지름 r, 둘째는 그 안쪽 r/2 (같은 원이면 서로 막혀 줄만 선다)
// 한 자리 둘은 합동 모션 짝으로 골라 넣었다 (DUO_NEAR 3.5m 안이라 자주 만난다). 나무·바위는 이 둘레를 피해 놓는다
// [x, z, r, [종류, 레벨], [종류, 레벨]?]
export const FIELD_BOSS = { x: FIELD.x - 52, z: FIELD.z - 53, r: 10, arena: 40, kind: 'chul', lv: 20, rot: Math.atan2(52, 53) }; // r: 비워 둔 둘레 · arena: 싸움터 반지름 (벗어나면 보스가 돌아감) · rot: 들판 가운데를 바라봄
export const FIELD_MONSTERS = [
  // 입구 풀밭 (Lv1~3): 날개콩 무리
  [-9, 53, 2.2, ['nalgae', 1], ['nalgae', 1]], [-17, 46, 2.2, ['nalgae', 2]], [9, 51, 2.2, ['nalgae', 1], ['nalgae', 2]],
  [17, 42, 2.2, ['nalgae', 2], ['nalgae', 3]], [-22, 56, 2, ['nalgae', 3]],
  // 안쪽 들판 (Lv3~7): 서쪽은 섞여 사는 곳 (날개 달아 주기·그림 그려 주기·들어 올리기), 동쪽은 몽당연필 무리 (똑딱이·끄레용 색칠과 함께)
  [-24, 32, 2.2, ['mongdang', 4], ['nalgae', 3]], [-38, 44, 2.2, ['kkreyong', 5], ['nalgae', 4]], [-32, 51, 1.6, ['gugu', 3]],
  [11, 24, 2.2, ['banjjok', 5], ['nalgae', 4]],
  [24, 33, 2.2, ['mongdang', 4], ['ttok', 5]], [34, 42, 2.2, ['mongdang', 3], ['ttok', 6]], [31, 29, 2.2, ['mongdang', 6], ['kkreyong', 7]],
  // 가운데 (Lv7~12): 서쪽 반쪽이 무리 · 연필 넘어뜨리기 · 지우다 번짐 · 낮잠 · 구구 나들이
  [-40, 11, 2.4, ['banjjok', 9], ['banjjok', 8]], [-50, 22, 2.2, ['banjjok', 8]], [-30, 1, 2.4, ['banjjok', 10], ['banjjok', 9]],
  [-13, 7, 2.2, ['mongdang', 8], ['haak', 8]], [18, 4, 2.2, ['kkreyong', 9], ['banjjok', 8]],
  [49, 13, 2.4, ['banjjok', 10], ['haak', 10]], [9, -9, 2.2, ['haak', 11], ['gugu', 10]],
  // 북쪽 (Lv12~16): 동쪽 하악냥 낮잠터 무리 · 연못가 · 끄레용 툭툭 · 깍깍이 · 박박 문지르기
  [38, -13, 2.4, ['haak', 13], ['haak', 12]], [51, -21, 2.2, ['haak', 14]], [61, -4, 2.4, ['haak', 13], ['haak', 12]],
  [-48, -6, 2.2, ['nalgae', 12], ['gugu', 12]], [-22, -27, 2.4, ['banjjok', 14], ['nalgae', 13]],
  [18, -32, 2.2, ['kkreyong', 14], ['haak', 14]], [30, -23, 2, ['kkakkak', 15]], [-58, -20, 2.4, ['mongdang', 14], ['banjjok', 15]],
  // 북쪽 끝 (Lv16~19): 서쪽 깍깍이 둥지 무리 · 동쪽 하악냥 (필드보스는 북서쪽 구석)
  [-33, -49, 2.4, ['kkakkak', 17], ['kkakkak', 16]], [-47, -38, 2.2, ['kkakkak', 16]], [-24, -61, 2.2, ['kkakkak', 19], ['kkakkak', 18]],
  [31, -49, 2.4, ['haak', 18], ['banjjok', 17]], [18, -62, 2.4, ['haak', 19], ['mongdang', 18]], [-9, -47, 2.2, ['banjjok', 17]],
].map(([x, z, r, ...mobs]) => ({ x: FIELD.x + x, z: FIELD.z + z, r, mobs: mobs.map(([kind, lv]) => ({ kind, lv })) }));
// 몬스터 한 마리씩: 종류 · 레벨 · 도는 가운데 x,z · 반지름 r
export const FIELD_MOBS = FIELD_MONSTERS.flatMap((s) => s.mobs.map((m, k) => ({ ...m, x: s.x, z: s.z, r: k ? s.r / 2 : s.r })));

// 포탈: 이 자리를 지나가면 to 번 포탈 앞(그 포탈이 바라보는 쪽 ARRIVE m)으로 순간이동
// rot: 포탈이 바라보는 쪽 (나오는 사람이 걸어가는 쪽). 문 양쪽 기둥은 부딪힌다
export const PORTAL = { reach: 0.7, arrive: 2.0, half: 0.85, pillar: 0.22 };
export const PORTALS = [
  { name: '들판', x: 5.4, z: 8.4, rot: Math.atan2(SPAWN.x - 5.4, SPAWN.z - 8.4), to: 1 }, // 광장 남동쪽, 분수를 바라봄
  { name: '마을', x: FIELD.x, z: FIELD.z + 62, rot: Math.PI, to: 0 }, // 들판 남쪽 끝, 들판 안쪽(-z)을 바라봄
];
export const portalArrive = (p) => ({ x: p.x + Math.sin(p.rot) * PORTAL.arrive, z: p.z + Math.cos(p.rot) * PORTAL.arrive, rot: p.rot });
const portalPillars = (p) => [-1, 1].map((k) => ({ x: p.x + Math.cos(p.rot) * PORTAL.half * k, z: p.z - Math.sin(p.rot) * PORTAL.half * k, r: PORTAL.pillar }));

function generateField(seed = 20261123) {
  const rand = mulberry32(seed);
  const trees = [];
  const rocks = [];
  const gate = PORTALS[1];
  const ok = (x, z, margin, list) => {
    if (Math.hypot(x - FIELD.x, z - FIELD.z) > fieldEdge(x, z) - 1.5 - margin) return false;
    if (Math.abs(x - FIELD.x) < 2 + margin && z > FIELD.z - 2 && z < gate.z + 2) return false; // 포탈 → 가운데 흙길
    if (Math.hypot(x - FIELD_POND.x, z - FIELD_POND.z) < FIELD_POND.r + 1 + margin) return false;
    for (const m of FIELD_MONSTERS) if (Math.hypot(x - m.x, z - m.z) < m.r + 1.4 + margin) return false;
    for (const o of list) if (Math.hypot(x - o.x, z - o.z) < o.r + margin) return false;
    return true;
  };
  const rnd = () => (rand() * 2 - 1) * FIELD.r;
  // 들판 안에 띄엄띄엄 선 나무 몇 그루 (넓게 트여 사냥하기 좋게)
  for (let i = 0; i < 2000 && trees.length < 124; i++) {
    const x = FIELD.x + rnd();
    const z = FIELD.z + rnd();
    const s = 0.85 + rand() * 0.5;
    if (ok(x, z, 2.5, trees)) trees.push({ x, z, s, r: 0.55 * s, kind: rand() < 0.3 ? 1 : 0 });
  }
  const all = [...trees];
  for (let i = 0; i < 2000 && rocks.length < 141; i++) {
    const x = FIELD.x + rnd();
    const z = FIELD.z + rnd();
    const s = 0.45 + rand() * 0.7;
    if (ok(x, z, 1.2, all)) {
      const rock = { x, z, s, r: 0.6 * s, rot: rand() * Math.PI };
      rocks.push(rock);
      all.push(rock);
    }
  }
  // 지형지물 (부딪힘): 쓰러진 통나무 · 그루터기 · 덤불 · 건초더미 · 돌탑 · 큰 바위 언덕(여러 덩이, 삽으로 못 깸) · 버섯 무리(장식, 안 부딪힘)
  // [종류, 개수, 부딪힘 반지름(크기 1), 높이(크기 1), 띄울 거리]
  const props = [];
  const KINDS = [['log', 22, 0.32, 0.55, 2.2], ['stump', 31, 0.38, 0.45, 1], ['bush', 48, 0.6, 0.85, 1], ['hay', 17, 0.65, 1.1, 1.6],
    ['cairn', 14, 0.45, 1.1, 1.4], ['outcrop', 9, 2.4, 1.7, 2.5], ['mushroom', 48, 0, 0, 0.4]];
  for (const [kind, n, r, h, margin] of KINDS) {
    for (let i = 0, made = 0; i < 1800 && made < n; i++) {
      const x = FIELD.x + rnd();
      const z = FIELD.z + rnd();
      const s = 0.85 + rand() * 0.4;
      if (!ok(x, z, margin + r * s, all)) continue;
      const o = { kind, x, z, s, rot: rand() * Math.PI * 2, r: r * s, h: h * s };
      props.push(o);
      if (r) all.push(o);
      made++;
    }
  }
  // 부딪힘 원: 통나무는 길쭉해서 원 셋을 늘어놓고, 바위 언덕은 덩이마다 (모양은 field.js 와 맞춤)
  const propCircles = props.flatMap((o) => {
    if (o.kind === 'log') return [-0.85, 0, 0.85].map((k) => ({ x: o.x + Math.cos(o.rot) * k * o.s, z: o.z - Math.sin(o.rot) * k * o.s, r: 0.3 * o.s, h: o.h }));
    if (o.kind === 'outcrop') return outcropStones(o).map((b) => ({ x: b.x, z: b.z, r: b.r * 0.9, h: b.r * 1.3 }));
    return o.r ? [{ x: o.x, z: o.z, r: o.r, h: o.h }] : [];
  });
  // 꺾을 수 있는 들꽃(채집·무당벌레·꿀벌 자리): 무리 지어 핀다
  const flowers = [];
  for (let i = 0; i < 7500 && flowers.length < 352; i++) {
    const c = flowers.length % 8 ? flowers[flowers.length - 1] : null; // 8송이마다 새 무리
    const x = c ? c.x + (rand() * 2 - 1) * 1.6 : FIELD.x + rnd();
    const z = c ? c.z + (rand() * 2 - 1) * 1.6 : FIELD.z + rnd();
    if (ok(x, z, 0.4, all) && Math.hypot(x - FIELD.x, z - FIELD.z) > 3.6) flowers.push({ x, z, c: Math.floor(rand() * 4), s: 0.7 + rand() * 0.5 });
  }
  // 사과나무: 가운데 공터에서 가까운 둥근 나무 4그루 (FIELD_MAP.trees 번호)
  const fruitTrees = trees.map((t, i) => ({ i, d: Math.hypot(t.x - FIELD.x, t.z - FIELD.z), k: t.kind }))
    .filter((o) => o.k === 0 && o.d > 6).sort((a, b) => a.d - b.d).slice(0, 4).map((o) => o.i);
  const colliders = [...trees, ...rocks].map((o) => ({ x: o.x, z: o.z, r: o.r }));
  rocks.forEach((_, k) => { colliders[trees.length + k].rock = k; }); // 마을 목록에 합칠 때 번호를 고친다 (아래)
  colliders.push(...portalPillars(gate));
  colliders.push({ x: gate.x + 2.6, z: gate.z - 1.2, r: 0.2 }); // 들판 표지판
  colliders.push(...propCircles);
  return { trees, rocks, colliders, props, propCircles, flowers, fruitTrees };
}
// 바위 언덕 하나를 이루는 덩이들 { x, z, r } (늘 같은 모양: 자리로 정함)
export function outcropStones(o) {
  const out = [];
  for (let k = 0; k < 4; k++) {
    const a = o.rot + k * 1.7;
    const d = k ? 0.9 + ((k * 0.37 + o.x) % 0.5) : 0;
    out.push({ x: o.x + Math.cos(a) * d * o.s, z: o.z + Math.sin(a) * d * o.s, r: (k ? 0.75 - k * 0.08 : 1.05) * o.s });
  }
  return out;
}

// 한 번만 만들어 두고 함께 쓴다
export const WORLD = generateWorld();
WORLD.colliders.push(...portalPillars(PORTALS[0]));
export const FIELD_MAP = generateField();
// 들판 나무·바위·꽃도 마을 목록 뒤에 이어 붙인다: 벌목·바위 깨기·과일·채집·곤충이 번호 하나로 마을과 똑같이 돈다
// (들판 k 번째 나무 = WORLD.trees[FIELD_MAP.base.trees + k]). 부딪힘은 들판 것(FIELD_MAP.colliders)을 따로 본다
FIELD_MAP.base = { trees: WORLD.trees.length, rocks: WORLD.rocks.length, fruit: WORLD.fruitTrees.length };
for (const c of FIELD_MAP.colliders) if (c.rock !== undefined) c.rock += FIELD_MAP.base.rocks;
WORLD.fruitTrees.push(...FIELD_MAP.fruitTrees.map((k) => FIELD_MAP.base.trees + k));
WORLD.trees.push(...FIELD_MAP.trees);
WORLD.rocks.push(...FIELD_MAP.rocks);
WORLD.flowers.push(...FIELD_MAP.flowers);
// 과일나무 k(WORLD.fruitTrees 순서)에 열리는 과일
export const fruitOf = (k) => (k >= FIELD_MAP.base.fruit ? FIELD_FRUIT : VILLAGE_FRUIT);

function fieldBlocked(x, z, radius) {
  if (Math.hypot(x - FIELD.x, z - FIELD.z) > fieldEdge(x, z) - radius) return true;
  if (Math.hypot(x - FIELD_POND.x, z - FIELD_POND.z) < FIELD_POND.r + radius * 0.3) return true;
  for (const c of FIELD_MAP.colliders) {
    if (c.rock !== undefined && ROCKS_GONE.has(c.rock)) continue;
    const rr = c.r + radius;
    if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) return true;
  }
  return false;
}

// 막힌 곳인지 판정 (화면과 서버가 똑같이 사용)
export function isBlocked(x, z, radius = PLAYER_RADIUS) {
  if (inField(x, z)) return fieldBlocked(x, z, radius);
  if (islandN(x, z) > shoreN(x, z) - BEACH.walk) return true; // 바다
  const onBridge = Math.abs(x - BRIDGE.x) < BRIDGE.halfWidth - radius * 0.5;
  if (!onBridge && Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH + radius * 0.3) return true;
  for (const c of WORLD.colliders) {
    if (c.rock !== undefined && ROCKS_GONE.has(c.rock)) continue; // 삽으로 깨뜨린 바위는 지나갈 수 있다
    const dx = x - c.x;
    const dz = z - c.z;
    const rr = c.r + radius;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}
// 삽으로 깨뜨려 지금 없는 마을 바위 번호 (서버가 정하고, 화면은 서버 상태로 채운다)
export const ROCKS_GONE = new Set();

// 테스트 서버 광장 요소의 부딪힘 원
export const LIFE_COLLIDERS = LIFE_SPOTS.map((s) => ({ x: s.x, z: s.z, r: 0.3 }));

// 벽에 부딪히면 미끄러지듯 이동. extra: 화면에서만 막는 원들 (다른 캐릭터, 광장 요소)
export function resolveMove(x, z, nx, nz, extra = []) {
  // 이미 겹쳐 있으면 멀어지는 쪽으로는 움직일 수 있게 (같은 자리에 나타났을 때 갇히지 않도록)
  const hit = (px, pz) => isBlocked(px, pz) || extra.some((c) => {
    const d = Math.hypot(px - c.x, pz - c.z);
    return d < c.r + PLAYER_RADIUS && d < Math.hypot(x - c.x, z - c.z);
  });
  if (!hit(nx, nz)) return [nx, nz];
  if (!hit(nx, z)) return [nx, z];
  if (!hit(x, nz)) return [x, nz];
  return [x, z];
}

// 몽둥이에 맞는지: 때린 사람(a, 바라보는 각 rot) 앞쪽 1.4m · 좌우 약 57° 안에 b가 있으면 true
export function inSwing(ax, az, rot, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  if (Math.hypot(dx, dz) > 1.4) return false;
  const d = Math.atan2(dx, dz) - rot;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 1.0;
}

// 찌르기(목검 3타)에 맞았는지: 앞으로 길고 폭이 좁은 범위 (보는 방향으로 2.4m, 옆으로 0.5m)
export function inThrust(ax, az, rot, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const ahead = dx * Math.sin(rot) + dz * Math.cos(rot);
  const side = dx * Math.cos(rot) - dz * Math.sin(rot);
  return ahead > -0.1 && ahead < 2.4 && Math.abs(side) < 0.5;
}

// 단검 더블 점프 공격(앞 아래로 내려가며 베기)에 맞았는지: 내려온 길 전체 (착지한 자리에서 보는 쪽 뒤로 2.3m ~ 앞으로 0.9m, 옆으로 0.6m)
// 앞으로 곧게 내려오므로, 착지한 순간에 지나온 길을 거슬러 한 번에 잰다
export function inDive(ax, az, rot, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const ahead = dx * Math.sin(rot) + dz * Math.cos(rot);
  const side = dx * Math.cos(rot) - dz * Math.sin(rot);
  return ahead > -2.3 && ahead < 0.9 && Math.abs(side) < 0.6;
}

// 네트워크용 압축: m → cm 정수, 각도 → 0~255
export const toCm = (m) => Math.round(m * 100);
export const fromCm = (cm) => cm / 100;
export const angleToByte = (a) => (Math.round((a / (Math.PI * 2)) * 256) % 256 + 256) % 256;
export const byteToAngle = (b) => (b / 256) * Math.PI * 2;

// ── 외형 꾸미기 (테스트 서버 전용): 정해진 키·값만 통과시켜 JSON 문자열로 ──
export const LOOK_BASES = ['boy', 'girl'];
export const LOOK_HAIRS = ['side', 'bob', 'pony', 'short'];
export const LOOK_OUTFITS = ['tee', 'street', 'hoodie', 'track', 'layered', 'base'];
export const LOOK_HATS = ['none', 'beanie', 'cap'];
// 눈·코·입 모양 이름 (client/src/villager 의 EYE_STYLES·NOSE_STYLES·MOUTH_STYLES 와 같아야 한다)
export const LOOK_EYES = ['basic', 'shine', 'lash', 'sleepy', 'dot', 'bean', 'smile', 'cat', 'droopy', 'ring', 'star', 'heart', 'shadow', 'slit', 'double', 'lower', 'up', 'twotone'];
export const LOOK_NOSES = ['classic', 'bead', 'button', 'big', 'tri', 'block', 'pointy', 'hook', 'nostril'];
export const LOOK_MOUTHS = ['classic', 'small', 'wide', 'cat', 'wavy', 'flat', 'open', 'tri', 'teeth', 'fang', 'tongue', 'kiss'];
const HEX = /^#[0-9a-f]{6}$/i;
const LOOK_RULES = {
  base: (v) => LOOK_BASES.includes(v),
  hair: (v) => LOOK_HAIRS.includes(v),
  outfit: (v) => LOOK_OUTFITS.includes(v), hat: (v) => LOOK_HATS.includes(v),
  eyeStyle: (v) => LOOK_EYES.includes(v), noseStyle: (v) => LOOK_NOSES.includes(v), mouthStyle: (v) => LOOK_MOUTHS.includes(v),
  hairColor: (v) => HEX.test(v), top: (v) => HEX.test(v), skin: (v) => HEX.test(v),
  glasses: (v) => typeof v === 'boolean', crown: (v) => typeof v === 'boolean', backpack: (v) => typeof v === 'boolean',
};
export function cleanLook(look) {
  const out = {};
  if (look && typeof look === 'object') {
    for (const k in LOOK_RULES) if (k in look && LOOK_RULES[k](look[k])) out[k] = look[k];
  }
  return JSON.stringify(out);
}

// ── 곤충 채집 ──
// move: 움직이는 모양 — fly 날아다님(where 'river' 면 강 위·강둑) · flower 꽃 위에 앉음 · tree 나무줄기에 붙음 · ground 풀밭에서 폴짝
// model: 화면에 그릴 모양 · price 상점에서 팔 값(희귀할수록 비쌈) · color/color2 몸·날개 색 · size 크기 비율
export const BUGS = [
  { id: 'cabbagewhite', name: '배추흰나비', rarity: 'common', move: 'fly', model: 'butterfly', price: 60, color: 0xf7f4e6, color2: 0x3a3a3a, size: 0.9 },
  { id: 'ladybug', name: '무당벌레', rarity: 'common', move: 'flower', model: 'ladybug', price: 50, color: 0xe03a2f, color2: 0x1d1d1d, size: 0.7 },
  { id: 'honeybee', name: '꿀벌', rarity: 'common', move: 'flower', model: 'bee', price: 80, color: 0xf3c13a, color2: 0x2b2b2b, size: 0.75 },
  { id: 'grasshopper', name: '메뚜기', rarity: 'common', move: 'ground', model: 'hopper', price: 70, color: 0x7fbf4f, color2: 0x5a9a35, size: 0.95 },
  { id: 'swallowtail', name: '호랑나비', rarity: 'uncommon', move: 'fly', model: 'butterfly', price: 250, color: 0xf2d04b, color2: 0x2a2a2a, size: 1.15 },
  { id: 'reddragonfly', name: '고추잠자리', rarity: 'uncommon', move: 'fly', where: 'river', model: 'dragonfly', price: 220, color: 0xd9452f, color2: 0xe9f6ff, size: 1.0 },
  { id: 'cicada', name: '매미', rarity: 'uncommon', move: 'tree', model: 'cicada', price: 300, color: 0x5b4a32, color2: 0xdfeee8, size: 1.0 },
  { id: 'cricket', name: '귀뚜라미', rarity: 'uncommon', move: 'ground', model: 'hopper', price: 200, color: 0x4a3a2a, color2: 0x2e241a, size: 0.8 },
  { id: 'rhinobeetle', name: '장수풍뎅이', rarity: 'rare', move: 'tree', model: 'rhino', price: 1200, color: 0x5a321c, color2: 0x2b170c, size: 1.3 },
  { id: 'stagbeetle', name: '사슴벌레', rarity: 'rare', move: 'tree', model: 'stag', price: 1500, color: 0x2e2018, color2: 0x1a120c, size: 1.25 },
  { id: 'bluewing', name: '청띠제비나비', rarity: 'rare', move: 'fly', model: 'butterfly', price: 1000, color: 0x1f2a36, color2: 0x41b6e6, size: 1.15 },
  { id: 'emperordragonfly', name: '왕잠자리', rarity: 'rare', move: 'fly', where: 'river', model: 'dragonfly', price: 900, color: 0x3d8fd0, color2: 0xe9f6ff, size: 1.3 },
  { id: 'morpho', name: '모르포나비', rarity: 'legend', move: 'fly', model: 'butterfly', price: 5000, color: 0x2a7fe0, color2: 0x0d2550, size: 1.35 },
  { id: 'goldbeetle', name: '황금풍뎅이', rarity: 'legend', move: 'tree', model: 'goldbeetle', price: 6000, color: 0xe6b83a, color2: 0x8a6a1a, size: 1.05 },
];
export const BUG_BY_ID = Object.fromEntries(BUGS.map((b) => [b.id, b]));
// 희귀도별로 얼마나 잘 도망가는지: run 달려서 이만큼 안에 오면 · walk 걸어서 이만큼 안에 오면 (m, 0 이면 안 도망감) · miss 헛손질에 놀라 도망감
// 곤충은 바로 옆에서 움직이면 놀라 날아간다. 희귀할수록 멀리서부터 놀라고 잘 놀라니 살금살금 다가가 멈춘 뒤 휘둘러야 한다
// (멈춰 서 있거나 잠자리채를 휘두르는 동안 내딛는 한 발에는 놀라지 않는다)
// run: 달려오면 이 거리(m)부터 놀람 · walk: 걸어서 이만큼 가까이 오면 놀람 · walkP: 걸을 때 놀라는 정도 · miss: 헛스윙에 놀라 날아갈 확률
// (놀라도 곧바로 날아가지 않고 0.1초마다 확률로, 가까울수록 잘 놀란다 → 바로 옆을 지나가면 거의 날아가고, 멀찍이 스치면 남아 있기도 한다)
export const BUG_SHY = {
  common: { run: 1.4, walk: 1.0, walkP: 0.3, miss: 0 },
  uncommon: { run: 2.0, walk: 1.3, walkP: 0.35, miss: 0.4 },
  rare: { run: 2.5, walk: 1.55, walkP: 0.4, miss: 0.6 },
  legend: { run: 3.0, walk: 1.75, walkP: 0.45, miss: 0.8 },
};
export const NET_CATCH = 0.42; // 그물 테가 지나간 길에서 이만큼 안에 있던 곤충이 잡힌다 (m)
export const NET_ROOM = 3.2; // 휘두른 길은 캐릭터 둘레 이만큼 안이어야 믿는다 (m)
export const BUG_COUNT = 90; // 마을·들판에 늘 있는 곤충 수 (둘에 하나쯤 들판)
// 곤충이 머무를 수 있는 풀밭: 갈 수 있는 곳이면서 광장·길·모래사장·강에서 떨어진 곳
export function onGrass(x, z) {
  if (isBlocked(x, z, 0.3)) return false;
  if (inField(x, z)) return Math.hypot(x - FIELD_POND.x, z - FIELD_POND.z) > FIELD_POND.r + 1 && Math.hypot(x - FIELD.x, z - FIELD.z) > 3.5;
  if (shoreN(x, z) - islandN(x, z) < BEACH.grass + 1) return false;
  if (Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH + 1) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < PLAZA.r + 0.5) return false;
  return true;
}

// ── 목재: 도끼로 나무를 한 번 찍을 때마다 하나씩 나무 밑동에 떨어진다 (F·클릭으로 주워 가방에, 나중에 대장간에서 무기·생활 도구를 만드는 재료) ──
// 찍은 나무의 종류에서만 나온다: 흔함은 그 나무 목재, 보통은 단단한 원목, 희귀는 오래된 고목(같은 나무의 좋은 부분).
// 나뭇가지는 어느 나무에서나, 황금 나무(전설)는 어느 나무에서나 아주 드물게 나오는 신기한 나무다.
// tree: oak 둥근 나무(참나무) · pine 침엽수(소나무) · birch 키 큰 달걀꼴 나무(자작나무) · fruit 과일나무(복숭아나무), 없으면 어느 나무에서나
// shape: log 통나무 · branch 나뭇가지 · bark 껍질 색 · inner 자른 면 색 · price 값 (희귀할수록 좋은 재료)
const TREE_WOOD = [
  // [tree, id 앞부분, 이름, 껍질·자른 면 색 (흔함 · 보통 · 희귀)]
  ['oak', 'oak', '참나무', [0x8a5a36, 0xe3b87f], [0x6e4428, 0xc9925a], [0x4e2f1c, 0xa86a3c]],
  ['pine', 'pine', '소나무', [0x9a6a45, 0xf1d39c], [0x84562f, 0xe7b86a], [0x6b3f22, 0xd99a4a]],
  ['birch', 'birch', '자작나무', [0xe9e3d6, 0xf3e2c0], [0xdcd4c4, 0xf0d6a8], [0xcdc3b0, 0xe8c48c]], // 하얀 껍질에 검은 가로 무늬 (village.js)
  ['fruit', 'peachwood', '복숭아나무', [0xa0614e, 0xf0c2a2], [0x8a4c3c, 0xe8a888], [0x6f3a2e, 0xd98a6e]],
];
export const WOODS = [
  { id: 'branch', name: '나뭇가지', rarity: 'common', shape: 'branch', bark: 0x8a5a36, inner: 0xd9a86c, price: 5 },
  ...TREE_WOOD.flatMap(([tree, id, name, c, u, r]) => [
    { id, name: `${name} 목재`, rarity: 'common', tree, shape: 'log', bark: c[0], inner: c[1], price: tree === 'fruit' ? 18 : 15 },
    { id: `${id}Hard`, name: `단단한 ${name} 원목`, rarity: 'uncommon', tree, shape: 'log', bark: u[0], inner: u[1], price: 45 },
    { id: `${id}Old`, name: `오래된 ${name} 고목`, rarity: 'rare', tree, shape: 'log', bark: r[0], inner: r[1], price: 140 },
  ]),
  { id: 'goldwood', name: '황금 나무', rarity: 'legend', shape: 'log', bark: 0xd4a537, inner: 0xffe27a, price: 600 },
];
export const WOOD_BY_ID = Object.fromEntries(WOODS.map((w) => [w.id, w]));
export const WOOD_ODDS = { common: 72, uncommon: 20, rare: 7, legend: 1 }; // 한 번 찍을 때 희귀도별 확률(%)
export const WOOD_STOCK = 5; // 나무 한 그루에서 연달아 나오는 목재 수 (다 나오면 잠시 쉼)
export const WOOD_REGROW = 40; // 쉰 나무에 목재가 하나씩 다시 차는 시간 (초)
// 생활 도구 내구도: 이만큼 쓰면 부서진다 (대장간에서 새로 만든다). 도끼는 한 번 찍을 때 · 낚싯대는 한 번 던질 때 · 잠자리채는 한 번 휘두를 때 1씩 닳는다
export const TOOL_DURABILITY = { axe: 40, rod: 30, net: 50, shovel: 40 }; // 기본 도구라 금방 닳는다 (대장간에서 더 튼튼한 도구로 바꾼다)
export const CHOP_REACH = 2.2; // 나무 둘레에서 이만큼 안이면 목재가 나온다 (m)
// 나무 번호 → 보이는 모양 (village.js 의 나무 종류와 같게). 광장 체험용 나무(번호 < 0)는 둥근 나무
export function treeWoodKind(i) {
  if (i < 0) return 'oak';
  if (WORLD.fruitTrees.includes(i)) return 'fruit';
  return WORLD.trees[i].kind === 1 ? 'pine' : i % 3 === 2 ? 'birch' : 'oak';
}
// 한 번 찍었을 때 나오는 목재 id: 그 나무에서 나올 수 있는 것 중 희귀도를 뽑는다 (흔한 것은 절반쯤 나뭇가지)
export function rollWood(i, rnd = Math.random) {
  let r = rnd() * 100;
  let rarity = 'common';
  for (const [k, p] of Object.entries(WOOD_ODDS)) { if (r < p) { rarity = k; break; } r -= p; }
  const kind = treeWoodKind(i);
  if (rarity === 'common' && rnd() < 0.45) return 'branch';
  const pool = WOODS.filter((w) => w.rarity === rarity && w.id !== 'branch' && (!w.tree || w.tree === kind));
  return pool[Math.floor(rnd() * pool.length)].id;
}

// ── 휘두르는 도구(잠자리채)가 부딪히는 단단한 것들: 높이 구간이 있는 둥근 기둥 { x, z, r, y0, h, kind, i } ──
// seg: [x1, z1, x2, z2] 가 있으면 그 선분을 두른 길쭉한 기둥 (벤치·표지판 판처럼 옆으로 긴 것)
// (사람이 지나가는 부딪힘 원 isBlocked 와 달리 물·강은 막지 않고, 높이를 본다: 낮은 벤치 위로 높게 휘두르면 지나가고,
//  분수 위 접시 아래 빈 곳은 지나간다). 나무는 줄기만 (잎은 부드러워 통과). 모양은 village.js 의 실제 크기에 맞춘다
const FOUNTAIN_TIERS = { low: { y: 1.0, r: 0.95 }, top: { y: 1.62, r: 0.5 } }; // village.js FOUNTAIN 과 같게
function buildSolids(trees, rocks, extra, t0 = 0, r0 = 0) {
  return [
    ...trees.map((t, i) => ({ x: t.x, z: t.z, r: 0.24 * t.s, h: 1.6 * t.s, kind: 'tree', i: t0 + i })),
    ...rocks.map((o, i) => ({ x: o.x, z: o.z, r: o.r * 0.9, h: 0.9 * o.r, kind: 'rock', i: r0 + i })),
    ...extra,
  ];
}
const pillarSolids = (p) => portalPillars(p).map((c) => ({ ...c, h: 3, kind: 'post' }));
const F = PLAZA.fountain;
export const VILLAGE_SOLIDS = buildSolids(WORLD.trees.slice(0, FIELD_MAP.base.trees), WORLD.rocks.slice(0, FIELD_MAP.base.rocks), [
  // 예정지 표지판: 기둥 + 옆으로 긴 판 (village.js buildPlots)
  ...PLOTS.flatMap((p) => {
    const sz = p.z + p.d / 2 + 0.2;
    return [
      { x: p.x, z: sz, r: 0.08, h: 1.0, kind: 'sign' },
      { x: p.x, z: sz + 0.07, seg: [p.x - 0.55, sz + 0.07, p.x + 0.55, sz + 0.07], r: 0.06, y0: 0.72, h: 1.28, kind: 'sign' },
    ];
  }),
  // 분수: 바닥 수반 · 가운데 기둥 · 아래 접시 · 위 접시 (접시 아래 빈 곳은 지나간다)
  { x: F.x, z: F.z, r: F.r + 0.05, h: 0.55, kind: 'fountain' },
  { x: F.x, z: F.z, r: 0.32, h: FOUNTAIN_TIERS.top.y + 0.25, kind: 'fountain' },
  { x: F.x, z: F.z, r: FOUNTAIN_TIERS.low.r, y0: FOUNTAIN_TIERS.low.y - 0.15, h: FOUNTAIN_TIERS.low.y + 0.15, kind: 'fountain' },
  { x: F.x, z: F.z, r: FOUNTAIN_TIERS.top.r, y0: FOUNTAIN_TIERS.top.y - 0.12, h: FOUNTAIN_TIERS.top.y + 0.12, kind: 'fountain' },
  // 벤치: 길이 1.5m 앉음판·등받이 (바라보는 쪽 rot 에 수직으로 길다)
  ...PLAZA.benches.map((b) => {
    const ax = Math.cos(b.rot) * 0.72;
    const az = -Math.sin(b.rot) * 0.72;
    return { x: b.x, z: b.z, seg: [b.x - ax, b.z - az, b.x + ax, b.z + az], r: 0.32, h: 0.9, kind: 'bench' };
  }),
  // 가로등: 가는 기둥 + 위의 등
  ...PLAZA.lamps.flatMap((l) => [
    { x: l.x, z: l.z, r: 0.11, h: 2.3, kind: 'post' },
    { x: l.x, z: l.z, r: 0.26, y0: 2.2, h: 2.8, kind: 'post' },
  ]),
  ...pillarSolids(PORTALS[0]),
]);
export const FIELD_SOLIDS = buildSolids(FIELD_MAP.trees, FIELD_MAP.rocks, [
  ...pillarSolids(PORTALS[1]),
  { x: PORTALS[1].x + 2.6, z: PORTALS[1].z - 1.2, r: 0.2, h: 1.4, kind: 'sign' }, // 들판 표지판
  ...FIELD_MAP.propCircles.map((c) => ({ ...c, kind: 'prop' })), // 통나무·덤불·건초더미 등
], FIELD_MAP.base.trees, FIELD_MAP.base.rocks);
// 땅 위 자리에서 단단한 것까지의 거리 (둥근 기둥은 가운데에서, 길쭉한 것은 선분에서)
function solidDist(s, x, z) {
  if (!s.seg) return Math.hypot(x - s.x, z - s.z);
  const [x1, z1, x2, z2] = s.seg;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
}
// (x, y, z) 자리(y는 땅에서 높이)가 단단한 것에 pad 만큼 가까우면 그것, 아니면 null. extra: 화면에서만 있는 것 (광장 체험용 나무 등)
export function solidAt(x, y, z, extra = [], pad = 0) {
  for (const list of [inField(x, z) ? FIELD_SOLIDS : VILLAGE_SOLIDS, extra]) {
    for (const s of list) {
      if (s.kind === 'rock' && ROCKS_GONE.has(s.i)) continue; // 깨뜨린 바위
      if (y < (s.y0 ?? 0) - pad || y > s.h + pad) continue;
      if (solidDist(s, x, z) < s.r + pad) return s;
    }
  }
  return null;
}

// ── 삽: 풀밭·모래를 파서 구덩이를 만들고(다시 누르면 덮는다), 바위는 여러 번 쳐서 깨뜨린다 ──
export const DIG_HOLE = { r: 0.42, max: 80, reach: 2.4 }; // 구덩이 반지름 · 마을에 있을 수 있는 최대 수(넘으면 오래된 것부터 메워짐) · 팔 수 있는 거리
export const DIG_AHEAD = 0.9; // 삽날이 땅에 닿는 자리: 몸 앞으로 이만큼 (m, actions.js dig 를 재어 둔 값)
export const ROCK_HP = 4; // 바위를 이만큼 치면 깨진다
export const ROCK_REGROW = 240; // 깨진 바위가 다시 생기는 시간 (초)
// 바위가 깨지면 나오는 돌 (대장간 재료): 대부분 돌멩이, 가끔 반짝이는 돌
export const STONES = [
  { id: 'stone', name: '돌멩이', rarity: 'common', color: 0xb3ada2, price: 4 },
  { id: 'shinystone', name: '반짝이는 돌', rarity: 'uncommon', color: 0x9fd3e6, price: 30 },
];
export const STONE_BY_ID = Object.fromEntries(STONES.map((s) => [s.id, s]));
// 그 자리를 팔 수 있는지: 'grass' 풀밭(흙) · 'sand' 모래 · null 못 팜 (물·광장 돌바닥·예정지·나무·바위 둘레)
export function groundKind(x, z) {
  if (inField(x, z)) return isBlocked(x, z, 0.35) ? null : 'grass';
  if (isBlocked(x, z, 0.35)) return null;
  if (Math.hypot(x - PLAZA.fountain.x, z - PLAZA.fountain.z) < PLAZA.r + 0.3) return null; // 광장 돌바닥
  for (const p of PLOTS) if (Math.abs(x - p.x) < p.w / 2 + 0.2 && Math.abs(z - p.z) < p.d / 2 + 0.2) return null; // 건물 예정지
  return shoreN(x, z) - islandN(x, z) < BEACH.grass ? 'sand' : 'grass';
}
