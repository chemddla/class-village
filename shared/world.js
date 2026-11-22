// 마을 지도 데이터 (화면과 서버가 함께 사용)
// 같은 시드로 만들기 때문에 지도 자체를 네트워크로 보낼 필요가 없다.

export const WORLD_SIZE = 60; // 한 변 60m
export const HALF = WORLD_SIZE / 2;
export const EDGE = HALF - 1.2; // 마을(숲) 가장자리. 그 바깥은 모래 해변이 둘러싼 섬이다
export const PLAYER_RADIUS = 0.35;

// ── 섬 모양: 모서리가 둥근 네모(초타원)에 물결치는 해안선 ──
// islandN: 섬 가운데에서 잰 '둥근 네모' 거리 (가로·세로 방향에서는 실제 거리와 같고, 대각선에서는 조금 짧다)
// shoreN: 그 방향의 바닷가 위치 (islandN 이 이보다 크면 바다)
export const islandN = (x, z) => (x ** 4 + z ** 4) ** 0.25;
export function shoreN(x, z) {
  const a = Math.atan2(z, x);
  return 38.5 + 1.4 * Math.sin(3 * a + 0.5) + 0.9 * Math.sin(5 * a + 2) + 0.5 * Math.sin(9 * a + 1);
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
};
export const ANIM_MAX = Math.max(...Object.values(ANIM));
// 손에 드는 도구 (번호로 주고받음). 맨손은 채집
export const TOOLS = ['none', 'axe', 'rod', 'club', 'woodSword'];
export const LIFE_TOOLS = 3; // Q는 앞의 생활 도구만 돌림. 그 뒤(몽둥이·목검)는 인벤토리에서 꺼냄
// 테스트 서버에서 광장에 놓는 생활 체험용 나무
export const LIFE_SPOTS = [
  { kind: 'tree', x: -3.6, z: 1.2 },
];

// 과일 나무 종류. 마을마다 '주된 과일' 하나가 정해져 마을 과일나무에 열린다 (다른 과일은 나중에 상점에서 산다)
export const FRUITS = ['peach', 'apple', 'orange', 'pear'];
export const FRUIT_NAMES = { peach: '복숭아', apple: '사과', orange: '오렌지', pear: '배' };
export const VILLAGE_FRUIT = 'peach'; // 마을 과일나무에 열리는 과일
export const FRUIT_MAX = 5; // 과일나무 한 그루에 열리는 개수
export const FRUIT_REGROW = 45; // 딴 과일이 다시 열리기까지 (초)
export const BAG_MAX = 99; // 가방에 넣을 수 있는 과일 한 종류의 최대 개수
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
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(rand() * 4);
    const t = (rand() * 2 - 1) * (HALF - 1);
    const inset = HALF - 1 - rand() * 3;
    const x = side === 0 ? t : side === 1 ? t : side === 2 ? inset : -inset;
    const z = side === 0 ? inset : side === 1 ? -inset : t;
    const s = 0.8 + rand() * 0.6;
    if (ok(x, z, 0.6, trees)) trees.push({ x, z, s, r: 0.55 * s, kind: rand() < 0.35 ? 1 : 0 });
  }
  // 안쪽 숲
  for (let i = 0; i < 160 && trees.length < 110; i++) {
    const x = (rand() * 2 - 1) * (HALF - 4);
    const z = (rand() * 2 - 1) * (HALF - 4);
    const s = 0.75 + rand() * 0.55;
    if (ok(x, z, 1.4, trees)) trees.push({ x, z, s, r: 0.55 * s, kind: rand() < 0.35 ? 1 : 0 });
  }
  // 바위
  const all = [...trees];
  for (let i = 0; i < 80 && rocks.length < 18; i++) {
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
  for (let i = 0; i < 260 && flowers.length < 140; i++) {
    const x = (rand() * 2 - 1) * (HALF - 2);
    const z = (rand() * 2 - 1) * (HALF - 2);
    if (ok(x, z, 0.3, all) && !nearRiver(x, z, RIVER_BANK_CLEAR)) flowers.push({ x, z, c: Math.floor(rand() * 4), s: 0.7 + rand() * 0.5 });
  }

  const colliders = [...trees, ...rocks].map((o) => ({ x: o.x, z: o.z, r: o.r }));
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

// 한 번만 만들어 두고 함께 쓴다
export const WORLD = generateWorld();

// 막힌 곳인지 판정 (화면과 서버가 똑같이 사용)
export function isBlocked(x, z, radius = PLAYER_RADIUS) {
  if (islandN(x, z) > shoreN(x, z) - BEACH.walk) return true; // 바다
  const onBridge = Math.abs(x - BRIDGE.x) < BRIDGE.halfWidth - radius * 0.5;
  if (!onBridge && Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH + radius * 0.3) return true;
  for (const c of WORLD.colliders) {
    const dx = x - c.x;
    const dz = z - c.z;
    const rr = c.r + radius;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}

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
