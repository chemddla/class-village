// 마을 풍경 만들기 (풀밭, 강, 다리, 나무, 바위, 꽃, 울타리, 건물 예정지)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WORLD, HALF, PLOTS, BRIDGE, SPAWN, PLAZA, RIVER_HALF_WIDTH, RIVER_BANK_CLEAR, riverCenterZ,
  islandN, shoreN, islandRadius, BEACH, FISH, FISH_APPROACH, LURE_HESITATE, NIBBLE_MS, shadowLen, rollFish, NOTICE,
  VILLAGE_FRUIT, FRUIT_MAX, PORTALS,
} from '../../shared/world.js';
import { buildPortal } from './portal.js';
import {
  toon, windToon, swayToon, basic, paint, vertexColorToon, addOutline, TIME,
} from './materials.js';
import { makeLabel } from './label.js';

const GRASS_A = new THREE.Color(0xa6d97f);
const GRASS_B = new THREE.Color(0x8fcb72);
const SAND = new THREE.Color(0xeedcae);
const BANK = new THREE.Color(0xd9c690);
const BEACH_SAND = new THREE.Color(0xf1dfae); // 바닷가 마른 모래
const WET_SAND = new THREE.Color(0xd2b986); // 파도에 젖은 모래
const SEA_Y = -0.03; // 바닷물 높이 (강물 -0.06 보다 살짝 위라 강이 바다에 묻혀 끝난다)

// 간단한 값 잡음 (풀밭 색 얼룩용)
function noise(x, z) {
  const s = Math.sin(x * 0.35) * Math.cos(z * 0.29) + Math.sin((x + z) * 0.17) * 0.6;
  return s * 0.5 + 0.5;
}

function buildGround() {
  const size = 110; // 섬 모서리(가운데에서 약 47m)까지 덮게
  const seg = 245; // 0.45m 간격
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    c.copy(GRASS_A).lerp(GRASS_B, noise(x, z));
    // 광장
    const dPlaza = Math.hypot(x - SPAWN.x, z - SPAWN.z);
    if (dPlaza < 5.5) c.copy(SAND);
    else if (dPlaza < 6.2) c.lerp(SAND, 0.5);
    // 광장 → 다리 길
    if (Math.abs(x) < 1.1 && z < SPAWN.z && z > -24) c.copy(SAND);
    // 광장 → 상점·대장간 길
    if (Math.abs(z - SPAWN.z) < 1.1 && Math.abs(x) < 13) c.copy(SAND);
    // 강가 모래: 강에서 멀어질수록 풀밭 색으로 부드럽게 (한 점씩 끊으면 격자 모양 계단이 생긴다)
    const dr = Math.abs(z - riverCenterZ(x));
    c.lerp(BANK, THREE.MathUtils.clamp((RIVER_HALF_WIDTH + 0.85 - dr) / 0.4, 0, 1));
    // 바닷가: 풀밭 → 마른 모래 → 젖은 모래 (해안선까지 거리에 따라 부드럽게)
    const toShore = shoreN(x, z) - islandN(x, z); // 해안선까지 (바다 쪽은 음수)
    c.lerp(BEACH_SAND, THREE.MathUtils.clamp((BEACH.grass + 1.2 - toShore) / 1.2, 0, 1));
    c.lerp(WET_SAND, THREE.MathUtils.clamp((BEACH.wet - toShore) / 0.6, 0, 1));
    colors.set([c.r, c.g, c.b], i * 3);
    // 강바닥: 둑에서 가운데로 비스듬히 내려가게. 물(높이 -0.06)과 땅이 만나는 선이 격자가 아닌 강 모양을 따른다
    const riverY = -0.3 * THREE.MathUtils.clamp((RIVER_HALF_WIDTH + 0.3 - dr) / 1.2, 0, 1);
    // 바다 밑: 해안선 조금 안쪽부터 바다 쪽으로 완만하게 내려간다 (바닷물과 만나는 선이 곧 해안선)
    const seaY = -0.8 * THREE.MathUtils.clamp((0.5 - toShore) / 4, 0, 1);
    pos.setY(i, Math.min(riverY, seaY));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, vertexColorToon);
}

function buildBridge() {
  const zc = riverCenterZ(BRIDGE.x);
  const len = RIVER_HALF_WIDTH * 2 + 2.2;
  const w = BRIDGE.halfWidth * 2;
  const parts = [];
  // 발판 (나무 판자)
  const planks = 9;
  for (let i = 0; i < planks; i++) {
    const g = new THREE.BoxGeometry(w, 0.14, len / planks - 0.05);
    g.translate(BRIDGE.x, 0.1, zc - len / 2 + (i + 0.5) * (len / planks));
    parts.push(paint(g, i % 2 ? 0xc9965f : 0xbf8b55));
  }
  // 난간
  for (const side of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.12, 0.12, len);
    rail.translate(BRIDGE.x + side * (w / 2 - 0.06), 0.75, zc);
    parts.push(paint(rail, 0xa8764a));
    for (let i = 0; i < 4; i++) {
      const post = new THREE.BoxGeometry(0.16, 0.7, 0.16);
      post.translate(BRIDGE.x + side * (w / 2 - 0.06), 0.42, zc - len / 2 + 0.2 + (i * (len - 0.4)) / 3);
      parts.push(paint(post, 0xa8764a));
    }
  }
  return new THREE.Mesh(mergeGeometries(parts), vertexColorToon);
}

// 시드 난수 (화면 장식용: 늘 같은 자리)
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 물결 무늬 텍스처 (캔버스로 그림): 밝은 물결 줄무늬가 흐르는 방향(가로)으로 길게
function waterTexture() {
  const W = 256;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#74c3ee';
  g.fillRect(0, 0, W, H);
  const rand = seeded(7);
  g.lineCap = 'round';
  // 짙은 물살 띠
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(70,150,215,${0.18 + rand() * 0.15})`;
    g.lineWidth = 6 + rand() * 8;
    const y = rand() * H;
    const x = rand() * W;
    const len = 60 + rand() * 90;
    for (const dx of [0, -W, W]) {
      g.beginPath();
      g.moveTo(x + dx, y);
      g.bezierCurveTo(x + dx + len * 0.3, y - 5, x + dx + len * 0.6, y + 5, x + dx + len, y);
      g.stroke();
    }
  }
  // 반짝이는 하얀 물결
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.35 + rand() * 0.35})`;
    g.lineWidth = 2 + rand() * 2.5;
    const y = 6 + rand() * (H - 12);
    const x = rand() * W;
    const len = 18 + rand() * 40;
    for (const dx of [0, -W, W]) {
      g.beginPath();
      g.moveTo(x + dx, y);
      g.quadraticCurveTo(x + dx + len / 2, y - 4, x + dx + len, y);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 강 모양을 따라가는 띠. from→to: 강 가운데에서 떨어진 거리(v 0→1), u는 흐르는 방향 길이(m)
// rows: 폭 방향 칸 수, colorAt(v): 주면 폭 방향 위치에 따라 꼭짓점 색을 칠함
function riverStrip(from, to, y, uScale, rows = 1, colorAt = null) {
  const pts = [];
  const uv = [];
  const col = [];
  const idx = [];
  const n = 160;
  const R = rows + 1;
  for (let i = 0; i <= n; i++) {
    const x = -48 + (96 * i) / n;
    const zc = riverCenterZ(x);
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      pts.push(x, y, zc + from + (to - from) * v);
      uv.push(x / uScale, v);
      if (colorAt) { const c = colorAt(v); col.push(c.r, c.g, c.b); }
    }
    if (i < n) {
      for (let r = 0; r < rows; r++) {
        const a = i * R + r;
        idx.push(a, a + 1, a + R, a + 1, a + R + 1, a + R);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colorAt) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (geo.attributes.normal.getY(0) < 0) geo.attributes.normal.array.forEach((_, i, arr) => { if (i % 3 === 1) arr[i] = 1; });
  return geo;
}

// 물살 무늬: 투명 바탕에 흐르는 방향으로 가늘고 부드럽게 굽이치는 하얀 줄
function flowTexture(seed, count) {
  const W = 512;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const rand = seeded(seed);
  g.lineCap = 'round';
  g.filter = 'blur(0.8px)';
  for (let i = 0; i < count; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.25 + rand() * 0.45})`;
    g.lineWidth = 1.2 + rand() * 2.2;
    const y = 8 + rand() * (H - 16);
    const x = rand() * W;
    const len = 40 + rand() * 120;
    const amp = 2 + rand() * 4;
    for (const dx of [0, -W, W]) {
      g.beginPath();
      g.moveTo(x + dx, y);
      g.bezierCurveTo(x + dx + len * 0.33, y - amp, x + dx + len * 0.66, y + amp, x + dx + len, y);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 강 속 돌과 연잎 (다리 근처는 비움)
function buildRiverDecor(group) {
  const rand = seeded(23);
  const W = RIVER_HALF_WIDTH;
  const rockMat = toon(0xa9a59b);
  const ringMat = basic(0xffffff, { transparent: true, opacity: 0.6, depthWrite: false });
  const rocks = [];
  for (const [x, side] of [[-21, 1], [-12, -1], [-6.5, 1], [7, -1], [15, 1], [23, -1]]) {
    const zc = riverCenterZ(x) + side * (W - 0.55 - rand() * 0.4);
    for (let k = 0; k < 2; k++) {
      const s = k ? 0.18 + rand() * 0.08 : 0.3 + rand() * 0.12;
      const rx = x + (k ? 0.4 + rand() * 0.2 : 0);
      const rz = zc + (k ? (rand() - 0.5) * 0.4 : 0);
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7).scale(s * 1.3, s * 0.7, s), rockMat);
      m.position.set(rx, -0.08, rz);
      m.rotation.y = rand() * Math.PI;
      group.add(addOutline(m, 0.02));
      // 돌을 감도는 물거품 고리
      const ring = new THREE.Mesh(new THREE.RingGeometry(s * 1.25, s * 1.55, 20).rotateX(-Math.PI / 2), ringMat);
      ring.position.set(rx, -0.045, rz);
      group.add(ring);
      rocks.push({ ring, s, ph: rand() * 6 });
    }
  }
  // 연잎: 물살이 느린 강가에 몇 장씩, 가끔 분홍 꽃
  const padMat = toon(0x6fbf5a);
  const padMat2 = toon(0x86cf68);
  const flowerMat = toon(0xf6a8c8);
  const pads = [];
  for (const [x, side] of [[-25, -1], [-16, 1], [-3.5, -1], [11, 1], [19, -1]]) {
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const px = x + (rand() - 0.5) * 2.2;
      const pz = riverCenterZ(px) + side * (W - 0.35 - rand() * 0.6);
      const r = 0.18 + rand() * 0.12;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 16, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2), k % 2 ? padMat : padMat2);
      pad.position.set(px, -0.04, pz);
      pad.rotation.y = rand() * Math.PI * 2;
      group.add(pad);
      if (rand() < 0.3) {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.08, 6), flowerMat);
        fl.position.set(px, 0.0, pz);
        group.add(fl);
      }
      pads.push({ pad, y: -0.04, ph: rand() * 6 });
    }
  }
  return (t) => {
    for (const r of rocks) r.ring.scale.setScalar(1 + Math.sin(t * 2.2 + r.ph) * 0.08);
    for (const p of pads) p.pad.position.y = p.y + Math.sin(t * 1.3 + p.ph) * 0.006;
  };
}

function buildRiver() {
  const w = RIVER_HALF_WIDTH + 0.15;
  const group = new THREE.Group();
  // 바닥 물: 강가는 얕은 청록, 가운데로 갈수록 깊은 파랑
  const SHALLOW = new THREE.Color(0x9fdcd6);
  const MID = new THREE.Color(0x63b8e0);
  const DEEP = new THREE.Color(0x3f93cc);
  const c = new THREE.Color();
  const depthColor = (v) => {
    const d = 1 - Math.abs(v * 2 - 1); // 0 강가 → 1 가운데
    return d < 0.45 ? c.copy(SHALLOW).lerp(MID, d / 0.45) : c.copy(MID).lerp(DEEP, (d - 0.45) / 0.55);
  };
  group.add(new THREE.Mesh(riverStrip(-w, w, -0.06, 7, 8, depthColor), toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide })));
  // 물살: 강 전체에 느린 줄 + 가운데에 더 빠른 줄 (가운데가 더 빨리 흐르는 것처럼)
  const flowMat = (tex, opacity) => basic(0xffffff, { map: tex, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const slow = flowTexture(7, 40);
  slow.repeat.set(1, 1.6);
  group.add(new THREE.Mesh(riverStrip(-w, w, -0.055, 9), flowMat(slow, 0.45)));
  const fast = flowTexture(9, 26);
  group.add(new THREE.Mesh(riverStrip(-w * 0.55, w * 0.55, -0.05, 6), flowMat(fast, 0.55)));
  const decor = buildRiverDecor(group);
  const update = (t) => {
    slow.offset.set(t * 0.05, Math.sin(t * 0.4) * 0.02);
    fast.offset.set(t * 0.11, Math.sin(t * 0.7 + 1) * 0.015);
    decor(t);
  };
  return { group, update };
}

// 높이에 따라 아래는 살짝 어둡고 위는 밝게 꼭짓점 색을 칠함 (잎 덩어리에 볼륨감)
function shadeByHeight(geo, y0, y1, lo = 0.72, hi = 1.0) {
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    const v = lo + (hi - lo) * k * k * (3 - 2 * k);
    arr.set([v, v, v * 0.97], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// 이미 칠한 꼭짓점 색에 높이에 따른 밝기를 곱함 (아래는 그늘, 위는 햇빛)
function tintByHeight(geo, y0, y1, lo, hi) {
  const pos = geo.attributes.position;
  const c = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    const v = lo + (hi - lo) * k * k * (3 - 2 * k);
    c.setXYZ(i, c.getX(i) * v, c.getY(i) * v, c.getZ(i) * v);
  }
  return geo;
}

// 단순한 꼭짓점 목록으로 도형 만들기 (색 포함)
function meshFrom(verts, colors, index) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// 둥근 활엽수: 공 몇 개를 겹친 몽글몽글한 구름 덩어리 [x, y, z, 반지름]
const ROUND_BLOBS = [
  [0, 1.98, 0, 0.88], [0.66, 1.66, 0.16, 0.6], [-0.6, 1.7, -0.14, 0.62], [0.1, 1.62, 0.66, 0.58],
  [-0.12, 1.64, -0.64, 0.56], [0.34, 2.52, -0.12, 0.56], [-0.38, 2.44, 0.24, 0.5],
];
// 잎을 한 장씩 붙이면 작은 구멍·무늬가 빽빽해 보여서, 매끈한 공을 겹쳐 폭신한 덩어리로 만든다
// 위는 햇빛을 받아 밝고 아래는 그늘지게 꼭짓점 색을 칠함
export function roundCanopy(seed = 7, BLOBS = ROUND_BLOBS, top = 3.1) {
  const parts = BLOBS.map(([x, y, z, r]) => {
    const g = new THREE.SphereGeometry(r, 20, 14).toNonIndexed().translate(x, y, z);
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(1), 3));
    return g;
  });
  return tintByHeight(mergeGeometries(parts), 1.0, top, 0.72, 1.05);
}

// 키 큰 달걀꼴 나무: 공을 위로 쌓아 가늘고 길게
const OVAL_BLOBS = [
  [0, 1.75, 0, 0.62], [0.28, 2.05, 0.2, 0.5], [-0.3, 2.15, -0.16, 0.5], [0, 2.5, 0, 0.6],
  [0.12, 2.9, -0.06, 0.52], [-0.06, 3.18, 0.06, 0.4], [0.05, 1.55, -0.4, 0.42],
];
export const ovalCanopy = () => roundCanopy(19, OVAL_BLOBS, 3.6);

// 과일나무 잎: 조금 작고 낮게 퍼진 둥근 덩어리
const FRUIT_BLOBS = [
  [0, 1.85, 0, 0.8], [0.62, 1.6, 0.2, 0.56], [-0.6, 1.62, -0.1, 0.58], [0.1, 1.55, 0.62, 0.54],
  [-0.1, 1.58, -0.6, 0.52], [0.25, 2.3, 0.05, 0.5],
];

// ── 과일 모양 (매단 자리가 원점, 아래로 매달림). 잎 덩어리에 합치기 위해 색을 꼭짓점에 칠하고 uv 는 뺀다 ──
function tint(g, color, shadeBy = null) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.set(color);
    if (shadeBy) shadeBy(c, pos.getX(i), pos.getY(i), pos.getZ(i));
    arr.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const stem = () => tint(new THREE.CylinderGeometry(0.012, 0.016, 0.07, 5).translate(0, -0.02, 0), 0x7a5232);
const smallLeaf = (x = 0.05) => tint(new THREE.SphereGeometry(0.045, 6, 4).scale(1.6, 0.35, 0.8).rotateZ(0.4).translate(x, -0.02, 0), 0x5aa83e);
// 귀여운 과일: 통통하고 둥글게
const FRUIT_MODELS = {
  apple: () => [
    tint(new THREE.SphereGeometry(0.15, 16, 12).scale(1.06, 0.92, 1.06).translate(0, -0.15, 0), 0xf0464a),
    stem(), smallLeaf(),
  ],
  peach: () => [
    tint(new THREE.SphereGeometry(0.15, 16, 12).translate(0, -0.16, 0), 0xffc89c,
      (c, x, y) => c.lerp(new THREE.Color(0xff8f9c), THREE.MathUtils.clamp((y + 0.16) * 4 + 0.35, 0, 0.75))),
    smallLeaf(0.05), smallLeaf(-0.05),
  ],
  orange: () => [
    tint(new THREE.SphereGeometry(0.15, 16, 12).translate(0, -0.16, 0), 0xffa12e),
    tint(new THREE.SphereGeometry(0.022, 6, 4).translate(0, -0.01, 0), 0x6a9a3a),
    smallLeaf(),
  ],
  pear: () => [
    tint(new THREE.SphereGeometry(0.14, 16, 12).translate(0, -0.22, 0), 0xdfe06e),
    tint(new THREE.SphereGeometry(0.095, 12, 9).translate(0, -0.11, 0), 0xdfe06e),
    stem(), smallLeaf(),
  ],
};

// 과일나무 잎 + 과일: 잎은 꼭짓점 색에 초록을 미리 칠해 두고(과일 색이 물들지 않게), 옆·아래쪽 겉에 과일을 단다
// count: 매달 과일 수 (따 가면 줄어든 모양으로 바꿔 끼운다)
const fruitCanopyCache = new Map();
export function fruitCanopy(fruit, count = FRUIT_MAX) {
  const key = `${fruit}:${count}`;
  if (fruitCanopyCache.has(key)) return fruitCanopyCache.get(key);
  const leaves = roundCanopy(29, FRUIT_BLOBS, 2.8);
  const col = leaves.attributes.color;
  const green = new THREE.Color().setHSL(0.27, 0.56, 0.47); // 다른 나무와 같은 방식(색 공간 변환)으로 만든 초록
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * green.r, col.getY(i) * green.g, col.getZ(i) * green.b);
  const parts = [leaves];
  const make = FRUIT_MODELS[fruit];
  if (make) {
    const rand = seeded(31);
    const spots = [];
    // 한 나무에 5개만, 서로 멀찍이: 잎 덩어리 옆·아래쪽 겉에 매달고 반짝임이 바깥을 보게 돌린다
    FRUIT_BLOBS.forEach(([x, y, z, r], bi) => {
      for (let i = 0; i < 40 && spots.length < FRUIT_MAX; i++) {
        const th = rand() * Math.PI * 2;
        const ny = -0.55 + rand() * 0.6;
        const rr = Math.sqrt(1 - ny * ny);
        const n = new THREE.Vector3(Math.cos(th) * rr, ny, Math.sin(th) * rr);
        const p = new THREE.Vector3(x, y, z).addScaledVector(n, r * 0.98);
        if (FRUIT_BLOBS.some(([x2, y2, z2, r2], j) => j !== bi && p.distanceTo(new THREE.Vector3(x2, y2, z2)) < r2 * 0.95)) continue;
        if (spots.some(({ p: q }) => q.distanceTo(p) < 0.8)) continue;
        spots.push({ p, n });
      }
    });
    for (const { p, n } of spots.slice(0, count)) {
      const face = Math.atan2(n.x, n.z);
      for (const g of make()) parts.push(g.scale(1.35, 1.35, 1.35).rotateY(face).translate(p.x, p.y, p.z));
    }
  }
  const g = mergeGeometries(parts);
  fruitCanopyCache.set(key, g);
  return g;
}

// 침엽수 한 층: 꼭대기에서 퍼져 내려와 가장자리가 뾰족뾰족 처진 치마 모양
// 중간 고리도 살짝 물결져서 가지가 겹친 듯 보이고, 아래는 짙은 밑면으로 막혀 있다
function pineTier(yb, h, R, turn, bright) {
  const M = 33; // 11갈래 × 3
  const verts = [0, yb + h, 0];
  const colors = [bright * 0.82, bright * 0.86, bright * 0.84];
  const ring = (t, scallop, droop, shade) => {
    for (let k = 0; k < M; k++) {
      const a = turn + (k / M) * Math.PI * 2;
      const tip = k % 3 === 0;
      const r = R * t * (tip ? 1 : 1 - scallop);
      verts.push(Math.cos(a) * r, yb + h * (1 - t) - (tip ? droop : 0), Math.sin(a) * r);
      const e = bright * shade * (tip ? 1.08 : 0.9);
      colors.push(e * 0.97, e, e);
    }
  };
  ring(0.55, 0.1, h * 0.05, 0.95);
  ring(1, 0.2, h * 0.16, 1.05);
  verts.push(0, yb + h * 0.28, 0);
  colors.push(0.45, 0.45, 0.45);
  const under = 1 + 2 * M;
  const index = [];
  for (let k = 0; k < M; k++) {
    const k1 = (k + 1) % M;
    const m0 = 1 + k, m1 = 1 + k1, r0 = 1 + M + k, r1 = 1 + M + k1;
    index.push(0, m1, m0, m0, m1, r1, m0, r1, r0, under, r0, r1);
  }
  return meshFrom(verts, colors, index);
}

export function pineCanopy(seed = 11) {
  const rand = seeded(seed);
  const tiers = [[0.95, 1.0, 1.08], [1.55, 0.95, 0.9], [2.12, 0.88, 0.72], [2.65, 0.8, 0.52], [3.12, 0.72, 0.32]];
  const g = mergeGeometries(tiers.map(([yb, h, R], i) => pineTier(yb, h, R, rand() * 6.28, 0.92 + i * 0.03)));
  return tintByHeight(g, 0.8, 3.9, 0.74, 1.08);
}

export function trunkGeometry() {
  // 아래로 갈수록 굵어지는 줄기 + 땅을 움켜쥔 듯 퍼진 뿌리 다섯 갈래
  // 뿌리는 뾰족하지 않게, 길쭉한 공을 바깥으로 갈수록 낮게 눕혀 끝이 뭉툭하게 땅에 묻히도록
  const parts = [new THREE.CylinderGeometry(0.16, 0.25, 1.45, 10).translate(0, 0.72, 0)];
  for (let i = 0; i < 5; i++) {
    parts.push(new THREE.SphereGeometry(0.1, 8, 6)
      .scale(2.1, 1.0, 1.15)
      .rotateZ(-0.38)
      .translate(0.25, 0.07, 0)
      .rotateY((i / 5) * Math.PI * 2 + 0.3));
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

// 보이는 나무 종류: 0 둥근 나무 · 1 침엽수 · 2 키 큰 달걀꼴 나무 · 3 과일나무
const FRUIT_TREE = new Set(WORLD.fruitTrees);
const looksLike = (t, i) => (FRUIT_TREE.has(i) ? 3 : t.kind === 1 ? 1 : i % 3 === 2 ? 2 : 0);

function buildTrees(group) {
  const kinds = [0, 1, 2, 3].map((k) => WORLD.trees.map((t, i) => ({ t, i })).filter((o) => looksLike(o.t, o.i) === k));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const Y = new THREE.Vector3(0, 1, 0);
  const base = []; // 나무 번호 → { pos, q, s, leaves(matrix): 잎 덩어리 자리 바꾸기 }

  const trunks = new THREE.InstancedMesh(trunkGeometry(), toon(0xc0905c), WORLD.trees.length);
  WORLD.trees.forEach((t, i) => {
    q.setFromAxisAngle(Y, (t.x * 13.7 + t.z) % 6.28);
    base[i] = { pos: new THREE.Vector3(t.x, 0, t.z), q: q.clone(), s: t.s };
    trunks.setMatrixAt(i, m.compose(base[i].pos, q, s.setScalar(t.s)));
  });
  group.add(addOutline(trunks, 0.03));

  // 잎 색: 나무마다 조금씩 다른 초록 (연두 ~ 짙은 초록), 과일나무는 잎 색을 미리 칠해 두어 흰색
  const tintOf = (k, h, h2) => {
    if (k === 0) return col.setHSL(0.22 + h * 0.1, 0.5 + h2 * 0.15, 0.46 + h2 * 0.1);
    if (k === 1) return col.setHSL(0.4 + h * 0.04, 0.4, 0.33 + h2 * 0.06);
    if (k === 2) return col.setHSL(0.3 + h * 0.06, 0.48, 0.4 + h2 * 0.06);
    return col.setRGB(1, 1, 1);
  };
  const leafMat = swayToon(0xffffff, { vertexColors: true });
  [roundCanopy(), pineCanopy(), ovalCanopy()].forEach((geo, k) => {
    const list = kinds[k];
    const mesh = new THREE.InstancedMesh(geo, leafMat, list.length);
    list.forEach(({ t, i }, j) => {
      const b = base[i];
      b.leaves = (mm) => { mesh.setMatrixAt(j, mm); mesh.instanceMatrix.needsUpdate = true; };
      mesh.setMatrixAt(j, m.compose(b.pos, b.q, s.setScalar(t.s)));
      const h = ((t.x * 7.1) % 1 + 1) % 1;
      const h2 = ((t.z * 3.7) % 1 + 1) % 1;
      mesh.setColorAt(j, tintOf(k, h, h2));
    });
    group.add(addOutline(mesh, 0.025, { sway: true }));
  });
  // 과일나무: 한 그루씩 따로 그려, 남은 과일 수에 맞는 모양으로 바꿔 끼운다 (잎 색은 미리 칠해 둠)
  const fruitMeshes = new Map(); // 나무 번호 → 잎+과일 덩어리
  for (const { t, i } of kinds[3]) {
    const b = base[i];
    const mesh = new THREE.Mesh(fruitCanopy(VILLAGE_FRUIT), leafMat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.compose(b.pos, b.q, s.setScalar(t.s));
    b.leaves = (mm) => { mesh.matrix.copy(mm); mesh.matrixWorldNeedsUpdate = true; };
    group.add(addOutline(mesh, 0.025, { sway: true }));
    fruitMeshes.set(i, mesh);
  }

  // 흔들기: 맞은 쪽으로 휘청였다가 흔들흔들 (줄기는 덜)
  const active = new Map();
  const wq = new THREE.Quaternion();
  const set = (i, ang, ax) => {
    const b = base[i];
    wq.setFromAxisAngle(ax, ang * 0.3).multiply(b.q);
    trunks.setMatrixAt(i, m.compose(b.pos, wq, s.setScalar(b.s)));
    wq.setFromAxisAngle(ax, ang).multiply(b.q);
    b.leaves(m.compose(b.pos, wq, s.setScalar(b.s)));
    trunks.instanceMatrix.needsUpdate = true;
  };
  return {
    // 과일나무 k(WORLD.fruitTrees 순서)에 남은 과일 수만큼만 매단다
    setFruitLeft(k, n) {
      const mesh = fruitMeshes.get(WORLD.fruitTrees[k]);
      const geo = fruitCanopy(VILLAGE_FRUIT, Math.max(0, Math.min(FRUIT_MAX, n)));
      if (!mesh || mesh.geometry === geo) return;
      mesh.geometry = geo;
      mesh.clear(); // 외곽선도 새 모양에 맞춰 다시 두른다
      addOutline(mesh, 0.025, { sway: true });
    },
    shake(i, dx, dz, power = 1) { active.set(i, { t: 0, ax: new THREE.Vector3(dz, 0, -dx).normalize(), power }); },
    update(dt) {
      for (const [i, a] of active) {
        a.t += dt;
        const done = a.t > 0.9;
        set(i, done ? 0 : 0.1 * a.power * Math.sin(a.t * 30) * Math.exp(-a.t * 6), a.ax);
        if (done) active.delete(i);
      }
    },
  };
}

function buildRocks(group) {
  // 둥글둥글한 바위: 각진 12면체 대신 매끈한 공을 납작하게 눌러 2개 겹침
  const geo = mergeGeometries([
    new THREE.IcosahedronGeometry(0.72, 1).scale(1.1, 0.62, 0.95).translate(0, 0.3, 0),
    new THREE.IcosahedronGeometry(0.42, 1).scale(1, 0.75, 1).translate(0.5, 0.2, 0.3),
  ]);
  shadeByHeight(geo, 0, 0.75, 0.82, 1.05);
  const rocks = new THREE.InstancedMesh(geo, toon(0xc4beb2, { vertexColors: true }), WORLD.rocks.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const place = (i, ox = 0, oz = 0) => {
    const r = WORLD.rocks[i];
    q.setFromAxisAngle(Y, r.rot);
    rocks.setMatrixAt(i, m.compose(pos.set(r.x + ox, 0, r.z + oz), q, sc.setScalar(r.s)));
  };
  WORLD.rocks.forEach((_, i) => place(i));
  group.add(addOutline(rocks));
  const active = new Map();
  return {
    shake(i, dx, dz, power = 1) { active.set(i, { t: 0, dx, dz, power }); },
    update(dt) {
      for (const [i, a] of active) {
        a.t += dt;
        const done = a.t > 0.5;
        const w = done ? 0 : 0.07 * a.power * Math.sin(a.t * 70) * Math.exp(-a.t * 9);
        place(i, a.dx * w, a.dz * w);
        rocks.instanceMatrix.needsUpdate = true;
        if (done) active.delete(i);
      }
    },
  };
}

// 풀이 자랄 수 있는 곳인지 (모래 광장·길·강가·예정지 피하기)
function grassy(x, z) {
  if (Math.abs(x) > HALF - 0.5 || Math.abs(z) > HALF - 0.5) return false;
  if (shoreN(x, z) - islandN(x, z) < BEACH.grass + 0.6) return false; // 모래사장
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6.4) return false;
  if (Math.abs(x) < 1.4 && z < SPAWN.z && z > -24) return false;
  if (Math.abs(z - SPAWN.z) < 1.4 && Math.abs(x) < 13) return false;
  if (Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH + RIVER_BANK_CLEAR) return false; // 강둑은 낚시 자리라 비워 둠
  for (const p of PLOTS) if (Math.abs(x - p.x) < p.w / 2 + 0.3 && Math.abs(z - p.z) < p.d / 2 + 0.6) return false;
  for (const t of WORLD.trees) if (Math.hypot(x - t.x, z - t.z) < t.r * 0.6) return false;
  for (const r of WORLD.rocks) if (Math.hypot(x - r.x, z - r.z) < r.r * 0.9) return false;
  return true;
}

// 바람에 살랑이는 들꽃 (줄기·꽃송이 InstancedMesh 2개로 한 번에 그림)
function buildMeadow(group, { low = false } = {}) {
  const rand = seeded(20261119);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();

  // 들꽃: 마을 꽃(채집 대상) + 장식용 꽃
  const palette = [0xffa8c5, 0xfff08a, 0xffffff, 0xcdb4ff, 0xffbe94, 0xa8d8ff].map((c) => new THREE.Color(c));
  const flowers = WORLD.flowers.map((f) => ({ ...f }));
  for (let tries = 0; flowers.length < (low ? 220 : 380) && tries < 3000; tries++) {
    const x = (rand() * 2 - 1) * (HALF - 1.5);
    const z = (rand() * 2 - 1) * (HALF - 1.5);
    if (grassy(x, z)) flowers.push({ x, z, c: Math.floor(rand() * palette.length), s: 0.6 + rand() * 0.5 });
  }
  // 줄기 + 동그란 잎 두 장
  const stemGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.02, 0.026, 0.3, 6).translate(0, 0.15, 0),
    new THREE.SphereGeometry(0.05, 8, 6).scale(1.5, 0.35, 0.9).rotateZ(0.5).translate(0.06, 0.1, 0),
    new THREE.SphereGeometry(0.045, 8, 6).scale(1.5, 0.35, 0.9).rotateZ(-0.5).translate(-0.055, 0.16, 0),
  ]);
  // 꽃송이: 통통하고 동그란 꽃잎 5장(하양 → 인스턴스 색으로 물듦) + 볼록한 노란 가운데, 하늘을 보도록 살짝 기울임
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(paint(new THREE.SphereGeometry(0.06, 10, 6).scale(1, 0.42, 1).translate(Math.cos(a) * 0.075, 0, Math.sin(a) * 0.075), 0xffffff));
  }
  parts.push(paint(new THREE.SphereGeometry(0.05, 12, 8).scale(1, 0.75, 1).translate(0, 0.02, 0), 0xffd84a));
  const headGeo = mergeGeometries(parts).rotateX(0.3).translate(0, 0.31, 0);
  const stems = new THREE.InstancedMesh(stemGeo, windToon(0x6aa84f), flowers.length);
  const heads = new THREE.InstancedMesh(headGeo, windToon(0xffffff, { vertexColors: true }), flowers.length);
  flowers.forEach((f, i) => {
    q.setFromEuler(e.set(0, rand() * Math.PI * 2, 0));
    m.compose(p.set(f.x, 0, f.z), q, s.setScalar(f.s));
    stems.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    heads.setColorAt(i, palette[f.c % palette.length]);
  });
  group.add(stems, heads);
}


function buildPlots(group, labels) {
  const parts = [];
  for (const p of PLOTS) {
    // 점선 테두리
    const dash = 0.6;
    const addDash = (x, z, w, d) => parts.push(paint(new THREE.BoxGeometry(w, 0.05, d).translate(x, 0.03, z), 0xfff4d6));
    for (let x = -p.w / 2; x < p.w / 2; x += dash * 2) {
      addDash(p.x + x + dash / 2, p.z - p.d / 2, dash, 0.12);
      addDash(p.x + x + dash / 2, p.z + p.d / 2, dash, 0.12);
    }
    for (let z = -p.d / 2; z < p.d / 2; z += dash * 2) {
      addDash(p.x - p.w / 2, p.z + z + dash / 2, 0.12, dash);
      addDash(p.x + p.w / 2, p.z + z + dash / 2, 0.12, dash);
    }
    // 표지판
    const sx = p.x;
    const sz = p.z + p.d / 2 + 0.2;
    parts.push(paint(new THREE.BoxGeometry(0.12, 1.0, 0.12).translate(sx, 0.5, sz), 0xa8764a));
    parts.push(paint(new THREE.BoxGeometry(1.1, 0.55, 0.08).translate(sx, 1.0, sz + 0.07), 0xe8c48a));
    const label = makeLabel(p.name, { bg: 'rgba(255,250,240,0.92)', size: 0.9 });
    label.userData.base = new THREE.Vector3(sx, 1.85, sz);
    labels.push(label);
    group.add(label);
  }
  group.add(addOutline(new THREE.Mesh(mergeGeometries(parts), vertexColorToon), 0.02));
}

// 마을 광장: 둥글게 깐 돌바닥 + 가운데 분수 + 벤치 + 가로등
function buildPlaza(group) {
  const { x: cx, z: cz } = SPAWN;
  const rand = seeded(42);
  const stone = [];
  const STONES = [0xd8cfc0, 0xcfc4b2, 0xe2dacb, 0xc6baa6];
  // 돌바닥: 분수 둘레부터 바깥까지 동심원으로 돌을 깐다 (맨 바깥 줄은 진한 테두리)
  for (let r = PLAZA.fountain.r + 0.35; r < PLAZA.r; r += 0.52) {
    const edge = r + 0.52 >= PLAZA.r;
    const n = Math.floor((Math.PI * 2 * r) / 0.58);
    const off = rand() * Math.PI;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.44, 0.05, (Math.PI * 2 * r) / n - 0.08)
        .rotateY(-a)
        .translate(cx + Math.cos(a) * r, 0.025, cz + Math.sin(a) * r);
      stone.push(paint(g, edge ? 0xb3a58e : STONES[Math.floor(rand() * STONES.length)]));
    }
  }
  // 분수: 둥근 돌 수반 + 기둥 + 아래 접시(1단) + 가는 기둥 + 위 접시(2단) + 물 나오는 꼭지
  const f = PLAZA.fountain;
  const T = FOUNTAIN;
  const fountain = [
    paint(new THREE.CylinderGeometry(f.r, f.r + 0.1, 0.5, 32).translate(f.x, 0.25, f.z), 0xcfc4b2),
    paint(new THREE.CylinderGeometry(0.24, 0.32, T.low.y - 0.5, 16).translate(f.x, (T.low.y + 0.5) / 2, f.z), 0xd8cfc0),
    paint(new THREE.CylinderGeometry(T.low.r, 0.38, 0.26, 32).translate(f.x, T.low.y, f.z), 0xd8cfc0),
    paint(new THREE.CylinderGeometry(0.13, 0.18, T.top.y - T.low.y, 12).translate(f.x, (T.top.y + T.low.y) / 2, f.z), 0xe2dacb),
    paint(new THREE.CylinderGeometry(T.top.r, 0.18, 0.2, 24).translate(f.x, T.top.y, f.z), 0xd8cfc0),
    paint(new THREE.SphereGeometry(0.08, 10, 6).translate(f.x, T.top.y + 0.12, f.z), 0xe2dacb),
  ];
  // 벤치 (rot 쪽을 바라봄)
  const wood = [];
  for (const b of PLAZA.benches) {
    for (const g of benchParts()) wood.push(g.rotateY(b.rot).translate(b.x, 0, b.z));
  }
  // 가로등: 진한 기둥 + 등 (등불은 그림자 없이 밝게)
  const lampBulbs = [];
  for (const l of PLAZA.lamps) {
    wood.push(paint(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 8).translate(l.x, 1.1, l.z), 0x4f5a5e));
    wood.push(paint(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 6).translate(l.x, 2.24, l.z), 0x4f5a5e));
    wood.push(paint(new THREE.ConeGeometry(0.26, 0.2, 6).translate(l.x, 2.66, l.z), 0x4f5a5e));
    lampBulbs.push(new THREE.CylinderGeometry(0.16, 0.13, 0.34, 6).translate(l.x, 2.43, l.z));
  }
  group.add(new THREE.Mesh(mergeGeometries(stone), vertexColorToon));
  group.add(addOutline(new THREE.Mesh(mergeGeometries([...fountain, ...wood]), vertexColorToon), 0.02));
  group.add(new THREE.Mesh(mergeGeometries(lampBulbs), basic(0xfff1b0)));
  return buildFountainWater(group, f);
}

// 공원 벤치 한 개 (+z 를 바라봄): 나무 살 앉음판·뒤로 살짝 누운 등받이 + 짙은 초록 쇠 다리·끝이 동그랗게 말린 팔걸이
function benchParts() {
  const W = 1.5;
  const WOOD = [0xd9a066, 0xc98f55];
  const IRON = 0x3d5a4a;
  const parts = [];
  // 앉음판 나무 살 4줄
  [-0.18, -0.06, 0.06, 0.18].forEach((z, i) => {
    parts.push(paint(new THREE.BoxGeometry(W, 0.05, 0.1).translate(0, 0.46, z), WOOD[i % 2]));
  });
  // 등받이 나무 살 3줄 (위로 갈수록 뒤로)
  [0.63, 0.76, 0.89].forEach((y, i) => {
    const z = -0.25 - (y - 0.5) * 0.22;
    parts.push(paint(new THREE.BoxGeometry(W, 0.09, 0.04).rotateX(-0.22).translate(0, y, z), WOOD[(i + 1) % 2]));
  });
  for (const x of [-0.66, 0.66]) {
    const iron = (g) => parts.push(paint(g.translate(x, 0, 0), IRON));
    iron(new THREE.BoxGeometry(0.06, 0.44, 0.06).translate(0, 0.22, 0.18)); // 앞다리
    iron(new THREE.BoxGeometry(0.06, 1.0, 0.06).rotateX(-0.22).translate(0, 0.5, -0.26)); // 뒷다리 = 등받이 기둥
    iron(new THREE.BoxGeometry(0.05, 0.05, 0.5).translate(0, 0.42, -0.02)); // 앉음판 받침
    iron(new THREE.BoxGeometry(0.05, 0.22, 0.05).translate(0, 0.57, 0.18)); // 팔걸이 기둥
    iron(new THREE.BoxGeometry(0.07, 0.04, 0.46).translate(0, 0.68, -0.03)); // 팔걸이
    iron(new THREE.TorusGeometry(0.05, 0.018, 6, 12).rotateY(Math.PI / 2).translate(0, 0.66, 0.21)); // 말린 끝
    for (const z of [0.18, -0.15]) iron(new THREE.SphereGeometry(0.05, 8, 5).scale(1, 0.5, 1).translate(0, 0.01, z)); // 발
  }
  return parts;
}

// 분수 2단 접시 높이·반지름 (접시 윗면 = y + 0.13)
const FOUNTAIN = { low: { y: 1.0, r: 0.95 }, top: { y: 1.62, r: 0.5 } };

// 떨어지는 물줄기 무늬: 세로로 긴 하얀 줄이 섞인 반투명 물빛
function fallTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(140,210,245,0.55)';
  g.fillRect(0, 0, 64, 128);
  const rand = seeded(5);
  for (let i = 0; i < 22; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.5})`;
    const x = rand() * 64;
    const y = rand() * 128;
    const h = 20 + rand() * 50;
    g.fillRect(x, y, 1.5 + rand() * 2, h);
    g.fillRect(x, y - 128, 1.5 + rand() * 2, h); // 위아래 이어지게
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 움직이는 분수 물: 접시마다 일렁이는 물 + 접시 가장자리로 넘쳐 흐르는 물줄기 + 꼭대기 물보라 + 수반의 물결
function buildFountainWater(group, f) {
  const { low, top } = FOUNTAIN;
  const surf = waterTexture();
  surf.repeat.set(0.35, 0.35);
  const surfMat = toon(0xffffff, { map: surf });
  const pool = (r, y) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), surfMat);
    m.position.set(f.x, y, f.z);
    group.add(m);
  };
  pool(f.r - 0.14, 0.46);
  pool(low.r - 0.08, low.y + 0.11);
  pool(top.r - 0.07, top.y + 0.09);

  // 넘쳐 흐르는 물줄기: 접시 가장자리에서 아래로 살짝 퍼지며 떨어지는 열린 원통
  const fall = fallTexture();
  fall.repeat.set(6, 1);
  const fallMat = basic(0xffffff, { map: fall, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const curtain = (rTop, rBot, yTop, yBot) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, yTop - yBot, 32, 1, true), fallMat);
    m.position.set(f.x, (yTop + yBot) / 2, f.z);
    group.add(m);
  };
  curtain(top.r + 0.02, top.r + 0.12, top.y + 0.1, low.y + 0.11);
  curtain(low.r + 0.02, low.r + 0.16, low.y + 0.12, 0.46);

  // 꼭대기 물보라: 꼭지에서 솟았다가 위 접시로 떨어지는 물방울들
  const DROPS = 36;
  const dropMat = basic(0xe6f6ff);
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), dropMat, DROPS);
  drops.frustumCulled = false;
  group.add(drops);
  const UP = 2.8; // 솟는 빠르기 (m/초)
  // 물방울마다 솟는 힘(s)이 조금씩 달라 퍼져 보인다. life: 솟았다가 위 접시 물에 닿을 때까지(초)
  const seeds = Array.from({ length: DROPS }, (_, i) => {
    const s = 0.7 + ((i * 37) % 10) / 30;
    const v = UP * s;
    return { ph: i / DROPS, a: i * 2.399, s, life: (v + Math.sqrt(v * v + 4 * 4.9 * 0.07)) / 9.8 };
  });
  const m4 = new THREE.Matrix4();

  // 수반 물결: 물줄기가 떨어지는 자리에서 바깥으로 퍼지는 고리
  const rings = [0, 1, 2].map((i) => {
    const mat = basic(0xffffff, { transparent: true, depthWrite: false });
    const m = new THREE.Mesh(new THREE.RingGeometry(low.r + 0.14, low.r + 0.2, 40).rotateX(-Math.PI / 2), mat);
    m.position.set(f.x, 0.47, f.z);
    group.add(m);
    return { m, mat, ph: i / 3 };
  });
  const maxS = (f.r - 0.16) / (low.r + 0.2);

  return (t) => {
    surf.offset.set(t * 0.03, t * 0.02);
    fall.offset.y = t * 1.6;
    for (let i = 0; i < DROPS; i++) {
      const d = seeds[i];
      const k = ((t / d.life + d.ph) % 1) * d.life; // 솟은 뒤 지난 시간
      const out = 0.4 * d.s * (k / d.life); // 바깥으로 퍼진 거리
      const y = top.y + 0.16 + UP * d.s * k - 4.9 * k * k;
      m4.makeTranslation(f.x + Math.cos(d.a) * out, y, f.z + Math.sin(d.a) * out);
      drops.setMatrixAt(i, m4);
    }
    drops.instanceMatrix.needsUpdate = true;
    for (const r of rings) {
      const p = (t * 0.6 + r.ph) % 1;
      const s = 1 + (maxS - 1) * p;
      r.m.scale.set(s, 1, s);
      r.mat.opacity = 0.55 * (1 - p);
    }
  };
}

// 하늘의 뭉게구름: 공 몇 개를 겹쳐 밑을 납작하게 누른 폭신한 구름이 마을 둘레 높은 곳에서 천천히 흘러감
// 위는 하얗고 밑은 살짝 푸른 그늘. 멀리 있어도 뿌옇게 묻히지 않게 안개는 받지 않는다
function cloudGeometry(rand) {
  const parts = [];
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5; // 가운데가 크고 양 끝이 작게
    const r = 1.0 - Math.abs(t) * 0.9 + rand() * 0.25;
    const g = new THREE.SphereGeometry(r, 14, 10).toNonIndexed();
    g.deleteAttribute('uv');
    parts.push(g.translate(t * 3.2, r * 0.35 + rand() * 0.2, (rand() - 0.5) * 1.0));
  }
  const g = mergeGeometries(parts);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0xffffff);
  const under = new THREE.Color(0xd6e4f2);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i);
    if (y < 0.1) pos.setY(i, 0.1 + (y - 0.1) * 0.25); // 밑면을 납작하게
    y = pos.getY(i);
    c.copy(under).lerp(top, THREE.MathUtils.clamp((y + 0.1) / 0.9, 0, 1));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function buildClouds(group) {
  const rand = seeded(77);
  const mat = basic(0xffffff, { vertexColors: true, fog: false });
  const shapes = [0, 1, 2].map(() => cloudGeometry(rand));
  const SPAN = 85; // 이 범위를 벗어나면 반대편에서 다시 나타남
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const r = 40 + rand() * 34; // 섬 바깥쪽 하늘
    const m = new THREE.Mesh(shapes[i % shapes.length], mat);
    const s = 2.2 + rand() * 2.2;
    m.scale.set(s, s * (0.8 + rand() * 0.3), s);
    m.rotation.y = rand() * Math.PI;
    // 카메라가 가장 멀리·높이 빠졌을 때(약 28m)보다도 높게: 내려다볼 때는 화면을 가리지 않는다.
    // 멀리 있는 구름은 둥근 지평선 효과로 내려앉아, 시점을 들면 나무 위 하늘에 보인다
    m.position.set(Math.cos(a) * r, 30 + rand() * 6, Math.sin(a) * r);
    m.frustumCulled = false; // 둥근 지평선 효과로 실제 그려지는 자리가 달라서
    group.add(m);
    clouds.push({ m, speed: 0.35 + rand() * 0.3 });
  }
  return (dt) => {
    for (const c of clouds) {
      c.m.position.x += c.speed * dt;
      if (c.m.position.x > SPAN) c.m.position.x -= SPAN * 2;
    }
  };
}

// ── 땅에 떨어진 과일: 나무에서 톡 떨어져 한 번 튀고, 주우면 쏙 작아지며 사라진다 ──
const groundFruitCache = new Map();
function groundFruit(fruit) {
  if (!groundFruitCache.has(fruit)) {
    const make = FRUIT_MODELS[fruit] ?? FRUIT_MODELS.peach;
    const g = mergeGeometries(make().map((p) => p.scale(1.35, 1.35, 1.35)));
    g.computeBoundingBox();
    g.translate(0, -g.boundingBox.min.y, 0); // 땅 위에 놓이게
    groundFruitCache.set(fruit, g);
  }
  return groundFruitCache.get(fruit);
}
function buildDrops(group) {
  const mat = toon(0xffffff, { vertexColors: true });
  const list = new Map(); // 번호 → { mesh, t, from, to, gone }
  const FALL = 0.55;
  return {
    // from: 떨어지기 시작하는 자리(나무 잎 높이), 없으면 이미 땅에 있던 과일
    add(id, fruit, x, z, from = null) {
      const mesh = new THREE.Mesh(groundFruit(fruit), mat);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.position.set(x, 0, z);
      addOutline(mesh, 0.018);
      group.add(mesh);
      list.set(id, { mesh, t: from ? 0 : FALL, from, to: new THREE.Vector3(x, 0, z), gone: -1 });
    },
    remove(id) {
      const d = list.get(id);
      if (d) d.gone = 0;
    },
    update(dt) {
      for (const [id, d] of list) {
        if (d.gone >= 0) { // 주우면 쏙 작아짐
          d.gone += dt;
          const s = Math.max(0, 1 - d.gone / 0.18);
          d.mesh.scale.setScalar(s);
          d.mesh.position.y += dt * 1.5;
          if (s <= 0) { group.remove(d.mesh); list.delete(id); }
          continue;
        }
        if (d.t >= FALL) continue;
        d.t = Math.min(FALL, d.t + dt);
        const k = d.t / FALL;
        // 나무에서 땅까지 포물선으로 떨어진 뒤 마지막에 살짝 튄다
        d.mesh.position.lerpVectors(d.from, d.to, Math.min(1, k * 1.15));
        const fallY = d.from.y * (1 - Math.min(1, k * 1.15)) ** 2;
        const bounce = k > 0.87 ? Math.sin(((k - 0.87) / 0.13) * Math.PI) * 0.12 : 0;
        d.mesh.position.y = fallY + bounce;
        d.mesh.rotation.x = (1 - k) * 2.5;
      }
    },
  };
}

// ── 바다: 섬 둘레를 감싸는 고리 모양 물 + 밀려오는 파도 + 해안선의 하얀 물거품 ──
// 해안선을 따라 도는 띠 만들기: d0~d1 은 해안선에서 바다 쪽으로 잰 거리(m), rows 는 그 사이 줄 (거리 목록)
// colorAt(d) 를 주면 줄마다 꼭짓점 색, u 는 해안선을 따라 잰 길이(m)/uScale, v 는 d0→d1 이 0→1
// y: 높이 (숫자, 또는 d 에 따른 높이를 돌려주는 함수 — 모래 위로 올라오는 물거품은 땅 높이를 따라간다)
function shoreStrip(rows, y, uScale = 1, colorAt = null) {
  const yAt = typeof y === 'function' ? y : () => y;
  const N = 400;
  const pts = [];
  const uv = [];
  const col = [];
  const idx = [];
  const R = rows.length;
  let len = 0;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r0 = islandRadius(shoreN(c, s), c, s); // 해안선까지 실제 거리
    const p = [c * r0, s * r0];
    if (prev) len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
    for (const d of rows) {
      pts.push(c * (r0 + d), yAt(d), s * (r0 + d));
      uv.push(len / uScale, (d - rows[0]) / (rows[R - 1] - rows[0]));
      if (colorAt) { const k = colorAt(d); col.push(k.r, k.g, k.b); }
    }
    if (i < N) {
      for (let r = 0; r < R - 1; r++) {
        const a0 = i * R + r;
        idx.push(a0, a0 + R, a0 + 1, a0 + 1, a0 + R, a0 + R + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colorAt) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) g.attributes.normal.array.forEach((_, i, arr) => { if (i % 3 === 1) arr[i] = 1; });
  return g;
}


// ── 파도·물거품은 그림을 밀어 움직이는 대신 화면 셰이더로 그린다 ──
// 해안선을 따라(u, m) 구간마다 파도 박자가 달라서, 온 바닷가가 한꺼번에 똑같이 움직이지 않는다
const SEA_GLSL = `
uniform float uTime;
float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float seaNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), f.x), mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 이 자리 파도의 박자 (0→1 이 한 번): 0 에서 파도가 바닷가에 닿아 물거품이 모래 위로 올라오기 시작한다
float seaPhase(float u) {
  return fract(uTime * 0.11 + seaNoise(vec2(u * 0.06, 0.0)) * 3.0 + seaNoise(vec2(u * 0.17, 5.0)) * 0.6);
}`;
const WHITE_1PX = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE_1PX.needsUpdate = true;
// 둥근 지평선이 적용된 기본 재질에, 색·투명도를 직접 계산하는 조각을 끼워 넣는다 (vMapUv: x=해안선 따라 m, y=띠 안쪽→바깥 0→1)
function seaShader(key, body) {
  const m = basic(0xffffff, { map: WHITE_1PX, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const curve = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    curve(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${SEA_GLSL}`)
      .replace('#include <map_fragment>', body);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

function buildSea(group) {
  // 바닷물: 해안선 가까이는 맑은 청록, 멀어질수록 짙은 파랑. 해안선 조금 안쪽(모래 밑)에서 시작해 수평선까지
  const SHALLOW = new THREE.Color(0x7fd8d0);
  const MID = new THREE.Color(0x4fb3dd);
  const DEEP = new THREE.Color(0x2f7fc4);
  const c = new THREE.Color();
  const seaColor = (d) => (d < 8 ? c.copy(SHALLOW).lerp(MID, THREE.MathUtils.clamp(d / 8, 0, 1)) : c.copy(MID).lerp(DEEP, THREE.MathUtils.clamp((d - 8) / 22, 0, 1)));
  group.add(new THREE.Mesh(shoreStrip([-2, 0, 2, 4, 7, 11, 18, 30, 60, 120, 220], SEA_Y, 6, seaColor), toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide })));
  // 물결 반짝임: 강과 같은 물살 무늬를 바다 위에 옅게 겹쳐 천천히 일렁이게
  const glint = flowTexture(13, 30);
  glint.repeat.set(1, 3);
  group.add(new THREE.Mesh(shoreStrip([0, 6, 14, 30], SEA_Y + 0.005, 9), basic(0xffffff, {
    map: glint, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide,
  })));
  // 밀려오는 파도: 먼바다에서 부드러운 물마루가 생겨 바닷가로 다가올수록 느려지고 하얗게 부서지다가,
  // 바닷가에 닿는 순간(박자 0) 물거품이 모래 위로 올라온다. 물마루는 군데군데 끊겨 있다
  const W0 = 0.5;
  const W1 = 14;
  group.add(new THREE.Mesh(shoreStrip([W0, 1, 1.6, 2.4, 3.4, 4.6, 6, 7.6, 9.4, 11.5, W1], SEA_Y + 0.008, 1), seaShader('sea-waves', `
    float u = vMapUv.x;
    float d = mix(${W0.toFixed(1)}, ${W1.toFixed(1)}, vMapUv.y);
    float c = seaPhase(u);
    float a = 0.0;
    for (int k = 0; k < 2; k++) {
      float ck = fract(c + float(k) * 0.5);
      float D = 0.8 + 12.0 * pow(1.0 - ck, 1.5); // 바닷가에 가까울수록 느려짐
      float band = exp(-pow((d - D) / (0.28 + 0.25 * (1.0 - ck)), 2.0));
      float broken = smoothstep(0.3, 0.7, seaNoise(vec2(u * 0.7, float(k) * 7.0 + floor(uTime * 0.11 + float(k) * 0.5) * 3.0)));
      float white = smoothstep(9.0, 2.0, D); // 다가올수록 하얗게 부서짐
      a += band * (0.18 + 0.55 * white) * mix(0.35, 1.0, broken);
    }
    a *= smoothstep(0.5, 1.4, d) * (1.0 - smoothstep(9.0, 13.5, d));
    diffuseColor = vec4(vec3(1.0), clamp(a, 0.0, 0.9) * diffuseColor.a);
  `)));
  // 해안선 물거품: 파도가 닿으면 모래 위로 빠르게 올라왔다가 천천히 빠져나간다.
  // 앞 가장자리는 레이스처럼 들쭉날쭉하고, 그 뒤로 얇은 물막이 모래를 덮어 젖은 듯 반짝인다
  // (모래 위로 올라오므로 띠 높이는 땅 높이를 따라간다: 땅은 해안선 0.5m 안쪽부터 바다 쪽으로 내려감)
  const S0 = -2.6;
  const S1 = 2.0;
  const groundAt = (d) => -0.8 * THREE.MathUtils.clamp((0.5 + d) / 4, 0, 1);
  const surfRows = [];
  for (let d = S0; d <= S1 + 1e-6; d += 0.3) surfRows.push(+d.toFixed(2));
  group.add(new THREE.Mesh(shoreStrip(surfRows, (d) => Math.max(groundAt(d) + 0.025, SEA_Y + 0.012), 1), seaShader('sea-surf', `
    float u = vMapUv.x;
    float d = mix(${S0.toFixed(1)}, ${S1.toFixed(1)}, vMapUv.y);
    float c = seaPhase(u);
    float up = smoothstep(0.0, 0.28, c); // 빠르게 올라옴
    float down = smoothstep(0.28, 1.0, c); // 천천히 빠짐
    float reach = -1.2 - 0.9 * seaNoise(vec2(u * 0.05, floor(uTime * 0.11) * 1.7)); // 파도마다 올라오는 높이가 다름
    float front = mix(mix(0.7, reach, up), 0.7, down);
    front += (seaNoise(vec2(u * 1.4, uTime * 0.25)) - 0.5) * 0.4; // 들쭉날쭉한 앞 가장자리
    float lace = seaNoise(vec2(u * 7.0, d * 5.0 + uTime * 0.6));
    float edge = smoothstep(front - 0.04, front + 0.1, d);
    float body = 1.0 - smoothstep(front + 0.2, front + 0.75 + lace * 0.5, d);
    float strength = mix(1.0, 0.3, down); // 빠질 때는 거품이 흩어져 옅어짐
    float foam = edge * body * (0.45 + 0.55 * lace) * strength;
    float sheet = edge * (1.0 - smoothstep(0.4, ${S1.toFixed(1)}, d)) * 0.3; // 물막 (바다 쪽으로 갈수록 바다와 섞임)
    vec3 col = mix(vec3(0.6, 0.87, 0.85), vec3(1.0), clamp(foam * 1.6, 0.0, 1.0));
    float a = clamp(foam + sheet, 0.0, 0.92) * (1.0 - smoothstep(1.4, ${S1.toFixed(1)}, d));
    diffuseColor = vec4(col, a * diffuseColor.a);
  `)));
  return (t) => {
    glint.offset.set(t * 0.02, t * 0.015);
  };
}

// ── 물고기 ──
// 잡은 물고기 모양: 통통한 몸 + 꼬리 + 지느러미 + 눈 (몸길이는 물고기 크기에 따라 0.35~0.9m)
const fishModelCache = new Map();
export function fishModel(fish) {
  if (!fishModelCache.has(fish.id)) {
    const body = new THREE.Color(fish.color);
    const belly = body.clone().lerp(new THREE.Color(0xffffff), 0.55);
    const fin = body.clone().multiplyScalar(0.8);
    const parts = [
      paint(new THREE.SphereGeometry(0.5, 16, 12).scale(1, 0.46, 0.3), 0xffffff),
      paint(new THREE.ConeGeometry(0.2, 0.3, 4).scale(1, 1, 0.25).rotateZ(Math.PI / 2).translate(-0.6, 0, 0), fin.getHex()),
      paint(new THREE.ConeGeometry(0.12, 0.22, 4).scale(1, 1, 0.25).translate(0.02, 0.27, 0), fin.getHex()),
    ];
    // 위는 몸 색, 배는 밝게
    const g0 = parts[0];
    const pos = g0.attributes.position;
    const col = g0.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(belly).lerp(body, THREE.MathUtils.clamp(pos.getY(i) / 0.12 + 0.6, 0, 1));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    for (const z of [0.13, -0.13]) {
      parts.push(paint(new THREE.SphereGeometry(0.06, 8, 6).translate(0.3, 0.05, z), 0xffffff));
      parts.push(paint(new THREE.SphereGeometry(0.035, 8, 6).translate(0.32, 0.05, z * 1.18), 0x2b2b2b));
    }
    const len = 0.35 + fish.size * 0.25;
    const g = mergeGeometries(parts.map((p) => p.toNonIndexed())).scale(len, len, len);
    fishModelCache.set(fish.id, g);
  }
  const mesh = new THREE.Mesh(fishModelCache.get(fish.id), vertexColorToon);
  addOutline(mesh, 0.012);
  return mesh;
}

// 물고기 그림자 윤곽 (위에서 본 모양, 몸길이 1, 머리가 +x): 둥근 머리 → 꼬리 쪽으로 가늘어지는 몸 → 갈라진 꼬리지느러미 + 가슴지느러미
function fishShadowShape() {
  const sh = new THREE.Shape();
  sh.moveTo(0.5, 0);
  sh.bezierCurveTo(0.5, 0.11, 0.33, 0.175, 0.12, 0.175);
  sh.bezierCurveTo(-0.08, 0.17, -0.22, 0.09, -0.31, 0.045);
  sh.lineTo(-0.5, 0.18); // 꼬리 위 갈래
  sh.quadraticCurveTo(-0.43, 0.0, -0.5, -0.18); // 꼬리 가운데 오목
  sh.lineTo(-0.31, -0.045);
  sh.bezierCurveTo(-0.22, -0.09, -0.08, -0.17, 0.12, -0.175);
  sh.bezierCurveTo(0.33, -0.175, 0.5, -0.11, 0.5, 0);
  const fins = [1, -1].map((side) => {
    const f = new THREE.Shape();
    f.moveTo(0.22, 0.15 * side);
    f.quadraticCurveTo(0.12, 0.3 * side, 0.02, 0.27 * side);
    f.quadraticCurveTo(0.1, 0.2 * side, 0.12, 0.15 * side);
    return f;
  });
  // 평면(x, y) → 땅 위(x, z)
  return new THREE.ShapeGeometry([sh, ...fins], 10).rotateX(-Math.PI / 2);
}

// 물속을 지나가는 물고기 그림자: 강에서는 물살을 따라 오가고, 바다에서는 바닷가와 나란히 헤엄친다 (학생마다 따로)
// 휙 나아갔다가 미끄러지듯 쉬기를 되풀이하고, 헤엄칠 때는 몸 뒤쪽과 꼬리가 좌우로 살랑인다.
// 그림자 크기는 그 물에 사는 물고기 크기를 희귀도 비율대로 따른다 (큰 그림자는 드물다).
// 찌가 입 앞에 떨어지면 알아채고 다가온다: notice 로 찾고, take 로 잠시 빼서 찌로 데려가고(buildLure), release 로 다른 곳에서 다시 나타난다
function buildFishShadows(group) {
  const rand = seeded(61);
  const base = fishShadowShape();
  const inner = basic(0x123246, { transparent: true, opacity: 0.32, depthWrite: false });
  const outer = basic(0x123246, { transparent: true, opacity: 0.1, depthWrite: false }); // 물에 번진 듯한 가장자리
  const fish = [];
  const make = (kind, y) => {
    const parts = [[inner, 1], [outer, 1.18]].map(([mat, k]) => {
      const m = new THREE.Mesh(base.clone(), mat);
      m.userData.k = k;
      m.position.y = y - (k > 1 ? 0.001 : 0);
      group.add(m);
      return m;
    });
    const f = { kind, parts, base: base.attributes.position.array.slice(), ph: rand() * 6, wag: 0, x: 0, z: 0, hx: 1, hz: 0, away: 0 };
    spawn(f);
    return f;
  };
  // 새로 나타나기: 크기를 정하고 물속 아무 데나 둔다
  function spawn(f) {
    f.len = shadowLen(rollFish(f.kind, rand).size) * (0.92 + rand() * 0.16);
    for (const m of f.parts) m.scale.setScalar(f.len * m.userData.k);
    if (f.kind === 'river') {
      f.rx = (rand() * 2 - 1) * 32;
      f.off = (rand() * 2 - 1) * 1.1;
      f.v = (rand() < 0.5 ? -1 : 1) * (0.22 + rand() * 0.3); // 느긋하게 (m/초)
    } else {
      f.a = rand() * Math.PI * 2;
      // 대부분 바닷가에서 살짝 떨어진 곳(1.6~3.4m: 모래사장에서 던진 찌가 입 앞에 오기 좋은 거리), 열에 하나는 먼바다
      f.d = rand() < 0.1 ? 5 + rand() * 4 : 1.6 + rand() * 1.8;
      f.v = (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.35);
    }
  }
  for (let i = 0; i < 10; i++) fish.push(make('river', -0.045));
  for (let i = 0; i < 40; i++) fish.push(make('sea', SEA_Y + 0.003)); // 섬 둘레가 길어서 넉넉히
  const showFish = (f, on) => { for (const m of f.parts) m.visible = on; };
  return {
    // 찌(bx, bz)를 입 앞에 둔 물고기 (입에서 NOTICE.dist 안, 헤엄치는 방향에서 NOTICE.angle 안) 중 가장 가까운 것
    notice(where, bx, bz) {
      const cos = Math.cos((NOTICE.angle * Math.PI) / 180);
      let best = null;
      let bestD = NOTICE.dist;
      for (const f of fish) {
        if (f.kind !== where || f.taken || f.away > 0) continue;
        const mx = f.x + f.hx * f.len * 0.5;
        const mz = f.z + f.hz * f.len * 0.5;
        const vx = bx - mx;
        const vz = bz - mz;
        const d = Math.hypot(vx, vz);
        if (d < bestD && (vx * f.hx + vz * f.hz) / (d || 1) > cos) { bestD = d; best = f; }
      }
      return best && { fish: best, x: best.x, z: best.z, hx: best.hx, hz: best.hz, len: best.len };
    },
    take(f) { f.taken = true; showFish(f, false); },
    // 낚시가 끝나면 그 물고기는 잠시 뒤 다른 곳에서 다시 나타난다
    release(f) { f.taken = false; f.away = 4; spawn(f); showFish(f, false); },
    update(dt, t) {
      for (const f of fish) {
        if (f.taken) continue;
        if (f.away > 0) { f.away -= dt; if (f.away <= 0) showFish(f, true); continue; }
        // 휙 → 스르르: 빠르기가 박자에 맞춰 오르내린다
        const burst = 0.45 + 0.8 * Math.max(0, Math.sin(t * 1.1 + f.ph)) ** 2;
        const step = f.v * burst * dt;
        f.wag += dt * (3 + 6 * burst);
        if (f.kind === 'river') {
          // 물살 따라 오가다가 강 끝(바다)에 가까워지면 돌아선다
          f.rx += step;
          if (Math.abs(f.rx) > 33) { f.v = -f.v; f.rx = Math.sign(f.rx) * 33; }
          f.x = f.rx;
          f.z = riverCenterZ(f.x) + f.off + Math.sin(t * 0.4 + f.ph) * 0.5;
          const hz = Math.cos(t * 0.4 + f.ph) * 0.2 * Math.sign(f.v);
          const h = Math.hypot(1, hz);
          f.hx = Math.sign(f.v) / h;
          f.hz = hz / h;
        } else {
          // 바다 물고기: 머리를 모래사장(섬 안쪽) 쪽으로 두고, 바닷가로 천천히 다가왔다 물러났다 한다.
          // 바닷가를 따라서는 조금씩만 옮겨 가고, 머리 방향은 좌우로 살짝(±20°)씩 흔들린다
          const c = Math.cos(f.a);
          const sn = Math.sin(f.a);
          const r = islandRadius(shoreN(c, sn), c, sn) + Math.max(1.2, f.d + Math.sin(t * 0.25 + f.ph) * 0.6); // 바닷가에서 1.2m 안으로는 오지 않음
          f.a += (step * 0.25) / r;
          f.x = Math.cos(f.a) * r;
          f.z = Math.sin(f.a) * r;
          const yaw = Math.sin(t * 0.2 + f.ph * 2) * 0.35;
          f.hx = -c * Math.cos(yaw) + sn * Math.sin(yaw);
          f.hz = -sn * Math.cos(yaw) - c * Math.sin(yaw);
        }
        // 몸 휘기: 머리는 거의 그대로, 뒤로 갈수록 크게 좌우로 (꼬리 끝이 가장 많이)
        const amp = 0.05 + 0.07 * burst;
        for (const m of f.parts) {
          const pos = m.geometry.attributes.position;
          const arr = pos.array;
          for (let i = 0; i < arr.length; i += 3) {
            const bx = f.base[i];
            const back = Math.max(0, 0.2 - bx);
            arr[i + 2] = f.base[i + 2] + Math.sin(f.wag - bx * 5) * amp * back * back * 2.2;
          }
          pos.needsUpdate = true;
          m.position.x = f.x;
          m.position.z = f.z;
          m.rotation.y = -Math.atan2(f.hz, f.hx) + Math.sin(f.wag) * 0.06;
        }
      }
    },
  };
}

// 찌로 다가오는 물고기: 그림자가 헤엄쳐 와서 찌 앞에 멈추고, 정해진 때마다 입으로 찌를 톡톡 건드리다가 덥석 문다
// start 로 흐름(던진 때부터 ms)을 받아 스스로 움직이고, end('caught'·'flee') 로 끝낸다
function buildLure(group) {
  const base = fishShadowShape();
  const basePos = base.attributes.position.array.slice();
  const mats = [basic(0x123246, { transparent: true, opacity: 0.38, depthWrite: false }), basic(0x123246, { transparent: true, opacity: 0.13, depthWrite: false })];
  const parts = mats.map((mat, i) => {
    const m = new THREE.Mesh(base.clone(), mat);
    m.userData.k = i ? 1.18 : 1;
    m.visible = false;
    group.add(m);
    return m;
  });
  let L = null;
  const bump = (x, w) => Math.exp(-((x / w) ** 2));
  const show = (on) => { for (const m of parts) m.visible = on; };
  return {
    // bx,bz: 찌 자리 · dx,dz: 캐릭터에서 찌 쪽 방향 · y: 물 높이 · len: 몸길이(m) · t0: 던진 때(performance.now)
    // from: 찌를 알아챈 물고기 { x, z, hx, hz } — 그 자리에서 찌 쪽으로 돌아 헤엄쳐 온다
    // 알아챈 순간 시작 (톡톡·덥석 때는 서버가 정해 setTimeline 으로 나중에 들어온다)
    start({ bx, bz, y, len, from, t0 }) {
      const sx = from.x;
      const sz = from.z;
      let hx = bx - sx;
      let hz = bz - sz;
      const h = Math.hypot(hx, hz) || 1;
      hx /= h;
      hz /= h;
      const gap = len * 0.5 + 0.1; // 몸 가운데에서 입까지
      // 알아챈 뒤 멈칫: 원래 가던 쪽으로 조금 미끄러지며 속도를 줄인다 (그 끝에서 찌 쪽으로 헤엄쳐 옴)
      const gx = sx + from.hx * 0.25;
      const gz = sz + from.hz * 0.25;
      let ax = bx - gx;
      let az = bz - gz;
      const ah = Math.hypot(ax, az) || 1;
      ax /= ah;
      az /= ah;
      L = { bx, bz, hx: ax, hz: az, fhx: from.hx, fhz: from.hz, sx, sz, gx, gz, rx: bx - ax * (gap + 0.16), rz: bz - az * (gap + 0.16), y, len, t0, nibbles: [], bite: Infinity, wag: 0, flee: 0, fade: 1, px: sx, pz: sz };
      for (const m of parts) { m.scale.setScalar(len * m.userData.k); m.position.y = y - (m.userData.k > 1 ? 0.001 : 0); m.material.opacity = m.userData.k > 1 ? 0.13 : 0.38; }
      show(false);
    },
    end(kind) {
      if (!L) return;
      if (kind === 'caught') { L = null; show(false); } else L.flee = performance.now();
    },
    // 서버가 정한 톡톡·덥석 때 (performance.now 기준 ms)
    setTimeline(nibbles, bite) { if (L) { L.nibbles = nibbles; L.bite = bite; } },
    update(dt) {
      if (!L) return;
      const now = performance.now();
      const tau = now - L.t0;
      show(true);
      let x;
      let z;
      let amp = 0.06;
      if (L.flee) {
        // 놀라서 휙 도망가며 흐려진다
        const f = (now - L.flee) / 1000;
        L.px -= L.hx * 5 * dt;
        L.pz -= L.hz * 5 * dt;
        x = L.px;
        z = L.pz;
        amp = 0.14;
        L.fade = Math.max(0, 1 - f / 0.7);
        if (L.fade <= 0) { L = null; show(false); return; }
      } else {
        // 1) 멈칫: 가던 쪽으로 미끄러지며 느려지고 찌 쪽으로 돈다 → 2) 천천히 헤엄쳐 와서 찌 앞에 멈춘다
        // → 3) 톡톡 때마다 입을 찌에 천천히 댔다 떼고 → 4) 덥석 물면 앞으로 쑥
        const h = Math.min(1, tau / HESITATE_MS);
        const he = 1 - (1 - h) * (1 - h); // 처음엔 미끄러지다 멈춤
        const a = Math.max(0, Math.min(1, (tau - HESITATE_MS) / (FISH_APPROACH_MS - HESITATE_MS)));
        const e = a * a * (3 - 2 * a);
        const now0 = now;
        let push = 0;
        for (const t of L.nibbles) push = Math.max(push, 0.16 * bump(now0 - t, NIBBLE_MS));
        if (now0 >= L.bite) push = 0.16 + 0.06 * Math.min(1, (now0 - L.bite) / 160);
        const idle = a >= 1 && now0 < L.bite ? Math.sin(tau / 520) * 0.03 : 0;
        const ox = L.sx + (L.gx - L.sx) * he;
        const oz = L.sz + (L.gz - L.sz) * he;
        x = ox + (L.rx - ox) * e + L.hx * (push + idle);
        z = oz + (L.rz - oz) * e + L.hz * (push + idle);
        L.px = x;
        L.pz = z;
        amp = tau < HESITATE_MS ? 0.05 : a < 1 ? 0.08 : now0 >= L.bite ? 0.16 : 0.035 + push * 0.3;
      }
      L.wag += dt * (5 + amp * 60);
      for (const m of parts) {
        const pos = m.geometry.attributes.position;
        const arr = pos.array;
        for (let i = 0; i < arr.length; i += 3) {
          const bx = basePos[i];
          const back = Math.max(0, 0.2 - bx);
          arr[i + 2] = basePos[i + 2] + Math.sin(L.wag - bx * 5) * amp * back * back * 2.2;
        }
        pos.needsUpdate = true;
        m.position.x = x;
        m.position.z = z;
        // 처음엔 헤엄치던 방향 → 멈칫하는 동안 찌 쪽으로 천천히 돌아선다
        const tk = Math.min(1, tau / HESITATE_MS);
        const turn = L.flee ? 1 : tk * tk * (3 - 2 * tk);
        const tx = L.fhx + (L.hx - L.fhx) * turn;
        const tz = L.fhz + (L.hz - L.fhz) * turn;
        m.rotation.y = -Math.atan2(tz, tx);
        m.material.opacity = (m.userData.k > 1 ? 0.13 : 0.38) * L.fade;
      }
    },
  };
}
const FISH_APPROACH_MS = FISH_APPROACH * 1000;
const HESITATE_MS = LURE_HESITATE * 1000;

export function buildVillage(scene, { low = false } = {}) {
  const group = new THREE.Group();
  const labels = []; // 둥근 지평선에 맞춰 매 장면 위치를 고칠 이름표
  group.add(buildGround());
  const river = buildRiver();
  group.add(river.group);
  group.add(buildBridge());
  const trees = buildTrees(group);
  const rocks = buildRocks(group);
  buildMeadow(group, { low });
  buildPlots(group, labels);
  const fountain = buildPlaza(group);
  const clouds = buildClouds(group);
  const sea = buildSea(group);
  const fishShadows = buildFishShadows(group);
  const lure = buildLure(group);
  const drops = buildDrops(group);
  const portal = buildPortal(PORTALS[0]); // 광장 → 들판
  group.add(portal.group, portal.label);
  labels.push(portal.label);
  scene.add(group);

  // 가장 가까운 나무·바위 번호 (reach 안에 없으면 -1)
  const nearest = (list, x, z, reach) => {
    let best = -1;
    let bestD = reach;
    list.forEach((o, i) => {
      const d = Math.hypot(o.x - x, o.z - z) - o.r;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  return {
    group,
    labels,
    size: HALF,
    nearTree: (x, z, reach = 1) => nearest(WORLD.trees, x, z, reach),
    nearRock: (x, z, reach = 1) => nearest(WORLD.rocks, x, z, reach),
    shakeTree: trees.shake,
    setFruitLeft: trees.setFruitLeft,
    lure, // 낚시 찌로 다가오는 물고기
    fishShadows, // 돌아다니는 물고기 (찌를 알아채는지 보기)
    // 땅에 떨어진 과일 (k: 떨어진 과일나무 번호, fall: 지금 막 떨어지는 중이면 true)
    addDrop(id, fruit, x, z, k, fall) {
      const t = WORLD.trees[WORLD.fruitTrees[k]];
      const from = fall && t ? new THREE.Vector3(t.x + (x - t.x) * 0.35, 1.9 * t.s, t.z + (z - t.z) * 0.35) : null;
      drops.add(id, fruit, x, z, from);
    },
    removeDrop: drops.remove,
    shakeRock: rocks.shake,
    // 매 장면: 시간(풀잎·구름·물결), 강물 흐름, 맞은 나무·바위 흔들림
    update(dt, t) {
      TIME.value = t;
      river.update(t);
      fountain(t);
      clouds(dt);
      sea(t);
      fishShadows.update(dt, t);
      lure.update(dt);
      drops.update(dt);
      trees.update(dt);
      rocks.update(dt);
      portal.update(t);
    },
  };
}
