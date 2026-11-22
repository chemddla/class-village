// 마을 지도 데이터 (화면과 서버가 함께 사용)
// 같은 시드로 만들기 때문에 지도 자체를 네트워크로 보낼 필요가 없다.

export const WORLD_SIZE = 60; // 한 변 60m
export const HALF = WORLD_SIZE / 2;
export const EDGE = HALF - 1.2; // 캐릭터가 갈 수 있는 끝
export const PLAYER_RADIUS = 0.35;

// 이동 속도 (m/초)
export const WALK_SPEED = 3.2;
export const RUN_SPEED = 5.6;

// 동작 번호
export const ANIM = {
  IDLE: 0, WALK: 1, RUN: 2, WAVE: 3, JUMP: 4, CHEER: 5, GATHER: 6, CHOP: 7, FISH: 8, SURPRISE: 9, FAINT: 10, FLIP: 11, SMASH: 12, SMASH2: 13, SMASH3: 14,
  CHOP2: 15, CHOP3: 16, // 이어 하는 도끼질 (같은 동작, 번갈아 재생)
  SMASH_AIR: 17, SMASH_SLAM: 18, SMASH_DASH: 19, // 몽둥이 공중 공격 · 더블 점프 뒤 내리찍기 · 대시 공격
};
export const ANIM_MAX = Math.max(...Object.values(ANIM));
// 손에 드는 도구 (번호로 주고받음). 맨손은 채집
export const TOOLS = ['none', 'axe', 'rod', 'club'];
export const LIFE_TOOLS = 3; // Q는 앞의 생활 도구만 돌림. 그 뒤(몽둥이)는 인벤토리에서 꺼냄
// 테스트 서버에서 광장 가운데 놓는 생활 체험용 나무·연못·덤불
export const LIFE_SPOTS = [
  { kind: 'tree', x: -3.6, z: 1.2 },
  { kind: 'pond', x: 3.6, z: 1.4, r: 1.3 },
  { kind: 'bush', x: 0, z: 0.2 },
];

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
export function riverCenterZ(x) {
  return -11 + 1.4 * Math.sin(x * 0.13) + 0.6 * Math.sin(x * 0.31 + 1.2);
}

// 다리 (강을 건너는 곳)
export const BRIDGE = { x: 0, halfWidth: 1.3 };

// 처음 나타나는 곳
export const SPAWN = { x: 0, z: 3 };

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
  // 광장에서 다리로 이어지는 길
  return Math.abs(x) < 1.5 + margin && z < 4 && z > -20;
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
  // 꽃 (부딪히지 않는 장식)
  for (let i = 0; i < 260 && flowers.length < 140; i++) {
    const x = (rand() * 2 - 1) * (HALF - 2);
    const z = (rand() * 2 - 1) * (HALF - 2);
    if (ok(x, z, 0.3, all)) flowers.push({ x, z, c: Math.floor(rand() * 4), s: 0.7 + rand() * 0.5 });
  }

  const colliders = [...trees, ...rocks].map((o) => ({ x: o.x, z: o.z, r: o.r }));
  // 예정지 표지판 기둥·판
  for (const p of PLOTS) colliders.push({ x: p.x, z: p.z + p.d / 2 + 0.25, r: 0.35 });
  return { seed, trees, rocks, flowers, colliders };
}

// 한 번만 만들어 두고 함께 쓴다
export const WORLD = generateWorld();

// 막힌 곳인지 판정 (화면과 서버가 똑같이 사용)
export function isBlocked(x, z, radius = PLAYER_RADIUS) {
  if (Math.abs(x) > EDGE || Math.abs(z) > EDGE) return true;
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

// 테스트 서버 광장 요소의 부딪힘 원 (연못은 테두리까지)
export const LIFE_COLLIDERS = LIFE_SPOTS.map((s) => ({
  x: s.x, z: s.z, r: s.kind === 'pond' ? s.r + 0.18 : s.kind === 'tree' ? 0.3 : 0.65,
}));

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
export const LOOK_EYES = ['classic', 'basic', 'shine', 'lash', 'sleepy', 'dot', 'bean', 'smile', 'cat', 'droopy', 'ring', 'star', 'heart', 'shadow', 'slit', 'double', 'lower', 'up', 'twotone'];
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
