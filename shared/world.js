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
export const ANIM = { IDLE: 0, WALK: 1, RUN: 2, WAVE: 3 };

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

// 벽에 부딪히면 미끄러지듯 이동
export function resolveMove(x, z, nx, nz) {
  if (!isBlocked(nx, nz)) return [nx, nz];
  if (!isBlocked(nx, z)) return [nx, z];
  if (!isBlocked(x, nz)) return [x, nz];
  return [x, z];
}

// 네트워크용 압축: m → cm 정수, 각도 → 0~255
export const toCm = (m) => Math.round(m * 100);
export const fromCm = (cm) => cm / 100;
export const angleToByte = (a) => (Math.round((a / (Math.PI * 2)) * 256) % 256 + 256) % 256;
export const byteToAngle = (b) => (b / 256) * Math.PI * 2;
