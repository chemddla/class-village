// 마을 풍경 만들기 (풀밭, 강, 다리, 나무, 바위, 꽃, 울타리, 건물 예정지)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WORLD, HALF, EDGE, PLOTS, BRIDGE, SPAWN, PLAZA, RIVER_HALF_WIDTH, riverCenterZ,
} from '../../shared/world.js';
import {
  toon, windToon, basic, paint, vertexColorToon, addOutline, TIME,
} from './materials.js';
import { makeLabel } from './label.js';

const GRASS_A = new THREE.Color(0xa6d97f);
const GRASS_B = new THREE.Color(0x8fcb72);
const SAND = new THREE.Color(0xeedcae);
const BANK = new THREE.Color(0xd9c690);

// 간단한 값 잡음 (풀밭 색 얼룩용)
function noise(x, z) {
  const s = Math.sin(x * 0.35) * Math.cos(z * 0.29) + Math.sin((x + z) * 0.17) * 0.6;
  return s * 0.5 + 0.5;
}

function buildGround() {
  const size = 90;
  const seg = 135;
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
    // 강가 모래
    const dr = Math.abs(z - riverCenterZ(x));
    if (dr < RIVER_HALF_WIDTH + 0.6) c.copy(BANK);
    colors.set([c.r, c.g, c.b], i * 3);
    // 강바닥을 살짝 낮춘다
    if (dr < RIVER_HALF_WIDTH) pos.setY(i, -0.25);
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

// 물거품 텍스처: 아래(v=1, 강둑 쪽)일수록 진한 하얀 거품 방울
function foamTexture() {
  const W = 256;
  const H = 32;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const rand = seeded(11);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1, 'rgba(255,255,255,0.95)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 70; i++) {
    const x = rand() * W;
    const y = H * (0.35 + rand() * 0.65);
    const r = 1.5 + rand() * 4 * (y / H);
    for (const dx of [0, -W, W]) {
      g.beginPath();
      g.arc(x + dx, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.flipY = false; // v=0 강 쪽 → v=1 강둑 쪽이 캔버스 위→아래와 같게
  tex.colorSpace = THREE.SRGBColorSpace;
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
  // 강둑 물거품: 둑 아래로 들어간 부분은 땅에 가려져, 물과 둑이 만나는 곳에만 하얀 줄이 보인다
  const foam = foamTexture();
  const foamMat = basic(0xffffff, { map: foam, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const inner = RIVER_HALF_WIDTH - 0.35;
  const outer = RIVER_HALF_WIDTH + 0.6;
  group.add(new THREE.Mesh(riverStrip(inner, outer, -0.045, 5), foamMat));
  group.add(new THREE.Mesh(riverStrip(-inner, -outer, -0.045, 5), foamMat));
  const decor = buildRiverDecor(group);
  const update = (t) => {
    slow.offset.set(t * 0.05, Math.sin(t * 0.4) * 0.02);
    fast.offset.set(t * 0.11, Math.sin(t * 0.7 + 1) * 0.015);
    foam.offset.set(t * 0.02, 0);
    foamMat.opacity = 0.6 + Math.sin(t * 1.6) * 0.12; // 밀려왔다 빠지는 느낌
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

// 잎 한 장: 끝이 세 갈래로 둥글게 갈라진 도톰한 잎. 앞면이 +Z, 가운데 갈래가 아래(-Y)를 향함
// 가운데는 볼록하고 가장자리는 살짝 어두워서, 잎이 겹친 자리마다 경계가 보인다
function leafGeometry(size, bright) {
  const N = 12; // 3갈래 × 4
  const LOBE = [1, 0.86, 0.68, 0.86];
  const verts = [0, size * 0.15, size * 0.16, 0, size * 0.15, -size * 0.04];
  const colors = [bright * 1.1, bright * 1.12, bright * 1.04, 0.5, 0.5, 0.5];
  for (let k = 0; k < N; k++) {
    // 가운데 갈래가 가장 길고, 잎자루 쪽(위)은 조금 짧게
    const a = -Math.PI / 2 + (k / N) * Math.PI * 2;
    const l = LOBE[k % 4];
    const r = size * l * (k === 0 ? 1.12 : 1) * (Math.sin(a) > 0.3 ? 0.8 : 1);
    verts.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    const e = bright * (0.7 + 0.22 * l);
    colors.push(e, e, e * 0.95);
  }
  const index = [];
  for (let k = 0; k < N; k++) {
    const a = 2 + k;
    const b = 2 + ((k + 1) % N);
    index.push(0, a, b, 1, b, a);
  }
  return meshFrom(verts, colors, index);
}

// 잎을 놓을 자리·방향: 바깥쪽(n)을 보되 살짝 하늘로 젖혀, 잎 끝이 아랫줄 잎을 덮는 기와처럼 겹치게
const _up = new THREE.Vector3(0, 1, 0);
function leafMatrix(p, n, lift, spin) {
  const z = n.clone().addScaledVector(_up, lift).normalize();
  let y = _up.clone().addScaledVector(z, -_up.dot(z));
  if (y.lengthSq() < 1e-4) y.set(Math.cos(spin), 0, Math.sin(spin));
  y.normalize().applyAxisAngle(z, (spin % 1) * 0.5 - 0.25);
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p);
}

// 둥근 활엽수: 공 몇 개를 겹친 울퉁불퉁한 덩어리 [x, y, z, 반지름]
// 짙은 속 덩어리 겉을 작은 잎이 기와처럼 빽빽이 덮는다
const ROUND_BLOBS = [
  [0, 1.98, 0, 0.88], [0.66, 1.66, 0.16, 0.6], [-0.6, 1.7, -0.14, 0.62], [0.1, 1.62, 0.66, 0.58],
  [-0.12, 1.64, -0.64, 0.56], [0.34, 2.52, -0.12, 0.56], [-0.38, 2.44, 0.24, 0.5],
];
export function roundCanopy(seed = 7) {
  const rand = seeded(seed);
  const parts = [];
  const c = new THREE.Vector3();
  for (const [x, y, z, r] of ROUND_BLOBS) {
    // 속 덩어리: 잎 사이 틈으로 보이는 짙은 그늘
    const core = new THREE.IcosahedronGeometry(r * 0.92, 1).translate(x, y, z);
    core.deleteAttribute('uv');
    core.setAttribute('color', new THREE.Float32BufferAttribute(new Array(core.attributes.position.count * 3).fill(0.5), 3));
    parts.push(core);
  }
  ROUND_BLOBS.forEach(([x, y, z, r], bi) => {
    c.set(x, y, z);
    // 공 겉에 고르게 점 찍기(해바라기 씨 배열). 다른 공 속에 묻히거나 맨 밑바닥인 자리는 건너뜀
    const count = Math.round(r * r * 62);
    for (let i = 0; i < count; i++) {
      const yy = 1 - ((i + 0.5) / count) * 2;
      const rr = Math.sqrt(1 - yy * yy);
      const th = i * 2.39996 + bi * 1.3;
      const n = new THREE.Vector3(Math.cos(th) * rr, yy, Math.sin(th) * rr);
      if (n.y < -0.5) continue;
      const p = c.clone().addScaledVector(n, r * 0.95);
      if (ROUND_BLOBS.some(([x2, y2, z2, r2], j) => j !== bi && p.distanceTo(new THREE.Vector3(x2, y2, z2)) < r2 * 0.88)) continue;
      const size = 0.27 * (0.85 + rand() * 0.3);
      const leaf = leafGeometry(size, 0.84 + rand() * 0.2);
      leaf.applyMatrix4(leafMatrix(p, n, n.y > 0.85 ? 0 : 0.35, rand() * 6.28));
      parts.push(leaf.toNonIndexed());
    }
  });
  const g = mergeGeometries(parts);
  return tintByHeight(g, 1.0, 3.1, 0.66, 1.05);
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

function buildTrees(group) {
  const kinds = [0, 1].map((k) => WORLD.trees.map((t, i) => ({ t, i })).filter((o) => o.t.kind === k));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const Y = new THREE.Vector3(0, 1, 0);
  const base = []; // 나무 번호 → { pos, q, s, leaves: [mesh, index] }

  const trunks = new THREE.InstancedMesh(trunkGeometry(), toon(0xc0905c), WORLD.trees.length);
  WORLD.trees.forEach((t, i) => {
    q.setFromAxisAngle(Y, (t.x * 13.7 + t.z) % 6.28);
    base[i] = { pos: new THREE.Vector3(t.x, 0, t.z), q: q.clone(), s: t.s };
    trunks.setMatrixAt(i, m.compose(base[i].pos, q, s.setScalar(t.s)));
  });
  group.add(addOutline(trunks, 0.03));

  [roundCanopy(), pineCanopy()].forEach((geo, k) => {
    const list = kinds[k];
    const mesh = new THREE.InstancedMesh(geo, toon(0xffffff, { vertexColors: true }), list.length);
    list.forEach(({ t, i }, j) => {
      const b = base[i];
      b.leaves = [mesh, j];
      mesh.setMatrixAt(j, m.compose(b.pos, b.q, s.setScalar(t.s)));
      const h = ((t.x * 7.1) % 1 + 1) % 1;
      if (k === 0) mesh.setColorAt(j, col.setHSL(0.26 + h * 0.06, 0.58, 0.5));
      else mesh.setColorAt(j, col.setHSL(0.4 + h * 0.03, 0.42, 0.36));
    });
    // 잎이 겹친 둥근 나무는 외곽선이 잎마다 생겨 어수선해지므로 침엽수에만 둘러 줌
    group.add(k === 1 ? addOutline(mesh, 0.025) : mesh);
  });

  // 흔들기: 맞은 쪽으로 휘청였다가 흔들흔들 (줄기는 덜)
  const active = new Map();
  const wq = new THREE.Quaternion();
  const set = (i, ang, ax) => {
    const b = base[i];
    wq.setFromAxisAngle(ax, ang * 0.3).multiply(b.q);
    trunks.setMatrixAt(i, m.compose(b.pos, wq, s.setScalar(b.s)));
    wq.setFromAxisAngle(ax, ang).multiply(b.q);
    const [mesh, j] = b.leaves;
    mesh.setMatrixAt(j, m.compose(b.pos, wq, s.setScalar(b.s)));
    trunks.instanceMatrix.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  };
  return {
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
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6.4) return false;
  if (Math.abs(x) < 1.4 && z < SPAWN.z && z > -24) return false;
  if (Math.abs(z - SPAWN.z) < 1.4 && Math.abs(x) < 13) return false;
  if (Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH + 0.9) return false;
  for (const p of PLOTS) if (Math.abs(x - p.x) < p.w / 2 + 0.3 && Math.abs(z - p.z) < p.d / 2 + 0.6) return false;
  for (const t of WORLD.trees) if (Math.hypot(x - t.x, z - t.z) < t.r * 0.6) return false;
  for (const r of WORLD.rocks) if (Math.hypot(x - r.x, z - r.z) < r.r * 0.9) return false;
  return true;
}

// 풀 한 포기: 끝이 뾰족한 잎 몇 장을 바깥으로 살짝 벌려 세움. 법선은 위로 (땅과 같은 밝기로 보이게)
function grassClump(rand) {
  const pos = [];
  const colr = [];
  const idx = [];
  const lo = new THREE.Color(0x5f9f45);
  const hi = new THREE.Color(0xc4e889);
  const c = new THREE.Color();
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rand() * 0.8;
    const h = 0.2 + rand() * 0.2;
    const w = 0.035 + rand() * 0.015;
    const lean = 0.06 + rand() * 0.1;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const v0 = pos.length / 3;
    for (const [k, wk] of [[0, 1], [0.55, 0.7], [1, 0]]) { // [높이 비율, 너비 비율]
      const y = h * k;
      const cx = dx * (0.05 + lean * k * k);
      const cz = dz * (0.05 + lean * k * k);
      c.copy(lo).lerp(hi, k);
      if (wk > 0) {
        pos.push(cx + dz * w * wk, y, cz - dx * w * wk, cx - dz * w * wk, y, cz + dx * w * wk);
        colr.push(c.r, c.g, c.b, c.r, c.g, c.b);
      } else {
        pos.push(cx, y, cz);
        colr.push(c.r, c.g, c.b);
      }
    }
    idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2, v0 + 2, v0 + 3, v0 + 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

// 바람에 살랑이는 풀잎 수백 포기 + 들꽃 (InstancedMesh 3개로 한 번에 그림)
function buildMeadow(group, { low = false } = {}) {
  const rand = seeded(20261119);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const col = new THREE.Color();

  // 풀: 무더기 자리를 먼저 정하고 그 둘레에 흩뿌림 → 고르게 깔린 것보다 자연스러움
  const want = low ? 700 : 1600;
  const spots = [];
  for (let tries = 0; spots.length < want && tries < want * 6; tries++) {
    const cx = (rand() * 2 - 1) * (HALF - 1);
    const cz = (rand() * 2 - 1) * (HALF - 1);
    const n = 3 + Math.floor(rand() * 6);
    for (let k = 0; k < n && spots.length < want; k++) {
      const x = cx + (rand() - 0.5) * 1.6;
      const z = cz + (rand() - 0.5) * 1.6;
      if (grassy(x, z)) spots.push([x, z]);
    }
  }
  const grass = new THREE.InstancedMesh(grassClump(seeded(3)), windToon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), spots.length);
  spots.forEach(([x, z], i) => {
    q.setFromEuler(e.set(0, rand() * Math.PI * 2, 0));
    grass.setMatrixAt(i, m.compose(p.set(x, 0, z), q, s.setScalar(0.8 + rand() * 0.7)));
    grass.setColorAt(i, col.setHSL(0.24 + rand() * 0.06, 0.5, 0.82 + rand() * 0.18));
  });
  group.add(grass);

  // 들꽃: 마을 꽃(채집 대상) + 장식용 꽃
  const palette = [0xff9fb8, 0xfff07a, 0xffffff, 0xc7a8ff, 0xffb38a, 0x9fd0ff].map((c) => new THREE.Color(c));
  const flowers = WORLD.flowers.map((f) => ({ ...f }));
  for (let tries = 0; flowers.length < (low ? 220 : 380) && tries < 3000; tries++) {
    const x = (rand() * 2 - 1) * (HALF - 1.5);
    const z = (rand() * 2 - 1) * (HALF - 1.5);
    if (grassy(x, z)) flowers.push({ x, z, c: Math.floor(rand() * palette.length), s: 0.6 + rand() * 0.5 });
  }
  const stemGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.34, 4).translate(0, 0.17, 0);
  // 꽃송이: 꽃잎 5장(하양 → 인스턴스 색으로 물듦) + 노란 가운데, 하늘을 보도록 살짝 기울임
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(paint(new THREE.IcosahedronGeometry(0.055, 0).scale(1.25, 0.4, 0.85).rotateY(-a).translate(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06), 0xffffff));
  }
  parts.push(paint(new THREE.IcosahedronGeometry(0.038, 1).scale(1, 0.7, 1).translate(0, 0.012, 0), 0xffe066));
  const headGeo = mergeGeometries(parts).rotateX(0.25).translate(0, 0.35, 0);
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

function buildFence(group) {
  const parts = [];
  const r = EDGE + 0.7;
  const step = 2;
  for (let t = -r; t <= r + 0.01; t += step) {
    for (const [x, z] of [[t, -r], [t, r], [-r, t], [r, t]]) {
      parts.push(paint(new THREE.BoxGeometry(0.18, 0.8, 0.18).translate(x, 0.4, z), 0xe9d3a8));
    }
  }
  for (const y of [0.3, 0.6]) {
    parts.push(paint(new THREE.BoxGeometry(r * 2, 0.08, 0.06).translate(0, y, -r), 0xf3e2bf));
    parts.push(paint(new THREE.BoxGeometry(r * 2, 0.08, 0.06).translate(0, y, r), 0xf3e2bf));
    parts.push(paint(new THREE.BoxGeometry(0.06, 0.08, r * 2).translate(-r, y, 0), 0xf3e2bf));
    parts.push(paint(new THREE.BoxGeometry(0.06, 0.08, r * 2).translate(r, y, 0), 0xf3e2bf));
  }
  group.add(addOutline(new THREE.Mesh(mergeGeometries(parts), vertexColorToon), 0.02));
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
  buildFence(group);
  buildPlots(group, labels);
  const fountain = buildPlaza(group);
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
    shakeRock: rocks.shake,
    // 매 장면: 시간(풀잎·구름·물결), 강물 흐름, 맞은 나무·바위 흔들림
    update(dt, t) {
      TIME.value = t;
      river.update(t);
      fountain(t);
      trees.update(dt);
      rocks.update(dt);
    },
  };
}
