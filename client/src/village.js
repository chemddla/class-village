// 마을 풍경 만들기 (풀밭, 강, 다리, 나무, 바위, 꽃, 울타리, 건물 예정지)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WORLD, HALF, EDGE, PLOTS, BRIDGE, SPAWN, RIVER_HALF_WIDTH, riverCenterZ,
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
function riverStrip(from, to, y, uScale) {
  const pts = [];
  const uv = [];
  const idx = [];
  const n = 160;
  for (let i = 0; i <= n; i++) {
    const x = -48 + (96 * i) / n;
    const zc = riverCenterZ(x);
    pts.push(x, y, zc + from, x, y, zc + to);
    uv.push(x / uScale, 0, x / uScale, 1);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (geo.attributes.normal.getY(0) < 0) geo.attributes.normal.array.forEach((_, i, arr) => { if (i % 3 === 1) arr[i] = 1; });
  return geo;
}

function buildRiver() {
  const w = RIVER_HALF_WIDTH + 0.15;
  const group = new THREE.Group();
  // 바닥 물: 물결 무늬가 천천히 흐름
  const water = waterTexture();
  group.add(new THREE.Mesh(riverStrip(-w, w, -0.06, 7), toon(0xffffff, { map: water, side: THREE.DoubleSide })));
  // 위 겹 반짝임: 같은 무늬를 다른 크기·빠르기로 겹쳐 물살이 일렁여 보이게
  const glint = water.clone();
  glint.repeat.set(1.7, 1.3);
  group.add(new THREE.Mesh(riverStrip(-w, w, -0.05, 7), basic(0xffffff, {
    map: glint, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })));
  // 강둑 물거품: 둑 아래로 들어간 부분은 땅에 가려져, 물과 둑이 만나는 곳에만 하얀 줄이 보인다
  const foam = foamTexture();
  const foamMat = basic(0xffffff, { map: foam, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const inner = RIVER_HALF_WIDTH - 0.5;
  const outer = RIVER_HALF_WIDTH + 0.6;
  group.add(new THREE.Mesh(riverStrip(inner, outer, -0.04, 5), foamMat));
  group.add(new THREE.Mesh(riverStrip(-inner, -outer, -0.04, 5), foamMat));
  const update = (t) => {
    water.offset.set(t * 0.045, Math.sin(t * 0.6) * 0.015);
    glint.offset.set(t * 0.075, -t * 0.01);
    foam.offset.set(t * 0.02, 0);
    foamMat.opacity = 0.8 + Math.sin(t * 1.6) * 0.15; // 밀려왔다 빠지는 느낌
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

// 몽글몽글 둥근 나무 잎: 크고 작은 공 여러 개를 겹침 [x, y, z, 반지름]
const ROUND_BLOBS = [
  [0, 1.95, 0, 0.92], [0.62, 1.62, 0.18, 0.62], [-0.58, 1.66, -0.12, 0.64], [0.12, 1.6, 0.64, 0.6],
  [-0.1, 1.62, -0.62, 0.58], [0.32, 2.5, -0.1, 0.58], [-0.36, 2.42, 0.22, 0.52],
];
// 키 큰 나무: 공 덩어리가 위로 갈수록 작아지는 탑 모양
const TALL_BLOBS = [
  [0, 1.45, 0, 0.82], [0.5, 1.3, 0.3, 0.5], [-0.5, 1.32, 0.22, 0.5], [0, 1.3, -0.55, 0.5],
  [0, 2.15, 0, 0.66], [0.32, 2.05, -0.22, 0.4], [-0.3, 2.08, -0.18, 0.4],
  [0, 2.75, 0, 0.46], [0, 3.15, 0, 0.28],
];
export function puffyCanopy(blobs = ROUND_BLOBS, detail = 2) {
  const g = mergeGeometries(blobs.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, detail).scale(1, 0.92, 1).translate(x, y, z)));
  const ys = blobs.map((b) => b[1]);
  return shadeByHeight(g, Math.min(...ys) - 0.7, Math.max(...ys) + 0.5);
}
export function trunkGeometry() {
  // 아래가 살짝 퍼진 줄기 + 굵은 가지 하나
  return mergeGeometries([
    new THREE.CylinderGeometry(0.15, 0.27, 1.3, 9).translate(0, 0.65, 0),
    new THREE.CylinderGeometry(0.06, 0.09, 0.55, 6).rotateZ(-0.8).translate(0.24, 1.1, 0),
  ]);
}

function buildTrees(group) {
  const kinds = [0, 1].map((k) => WORLD.trees.map((t, i) => ({ t, i })).filter((o) => o.t.kind === k));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const Y = new THREE.Vector3(0, 1, 0);
  const base = []; // 나무 번호 → { pos, q, s, leaves: [mesh, index] }

  const trunks = new THREE.InstancedMesh(trunkGeometry(), toon(0xa9744f), WORLD.trees.length);
  WORLD.trees.forEach((t, i) => {
    q.setFromAxisAngle(Y, (t.x * 13.7 + t.z) % 6.28);
    base[i] = { pos: new THREE.Vector3(t.x, 0, t.z), q: q.clone(), s: t.s };
    trunks.setMatrixAt(i, m.compose(base[i].pos, q, s.setScalar(t.s)));
  });
  group.add(addOutline(trunks, 0.03));

  [ROUND_BLOBS, TALL_BLOBS].forEach((blobs, k) => {
    const list = kinds[k];
    const mesh = new THREE.InstancedMesh(puffyCanopy(blobs), toon(0xffffff, { vertexColors: true }), list.length);
    list.forEach(({ t, i }, j) => {
      const b = base[i];
      b.leaves = [mesh, j];
      mesh.setMatrixAt(j, m.compose(b.pos, b.q, s.setScalar(t.s)));
      const h = ((t.x * 7.1) % 1 + 1) % 1;
      if (k === 0) mesh.setColorAt(j, col.setHSL(0.25 + h * 0.07, 0.55, 0.56));
      else mesh.setColorAt(j, col.setHSL(0.37 + h * 0.04, 0.45, 0.44));
    });
    group.add(addOutline(mesh, 0.04));
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
      trees.update(dt);
      rocks.update(dt);
    },
  };
}
