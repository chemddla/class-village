// 마을 풍경 만들기 (풀밭, 강, 다리, 나무, 바위, 꽃, 울타리, 건물 예정지)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  WORLD, HALF, EDGE, PLOTS, BRIDGE, SPAWN, RIVER_HALF_WIDTH, riverCenterZ,
} from '../../shared/world.js';
import { toon, paint, vertexColorToon } from './materials.js';
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

function buildRiver() {
  // 강 모양을 따라가는 띠
  const pts = [];
  const idx = [];
  const n = 120;
  for (let i = 0; i <= n; i++) {
    const x = -48 + (96 * i) / n;
    const zc = riverCenterZ(x);
    pts.push(x, -0.06, zc - RIVER_HALF_WIDTH - 0.15, x, -0.06, zc + RIVER_HALF_WIDTH + 0.15);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, toon(0x7cc8f0));
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

function buildTrees(group) {
  const round = WORLD.trees.filter((t) => t.kind === 0);
  const pine = WORLD.trees.filter((t) => t.kind === 1);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();

  // 줄기 (모든 나무 공통)
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.1, 8).translate(0, 0.55, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0xa9744f), WORLD.trees.length);
  WORLD.trees.forEach((t, i) => {
    m.compose(p.set(t.x, 0, t.z), q.identity(), s.setScalar(t.s));
    trunks.setMatrixAt(i, m);
  });
  group.add(trunks);

  // 둥근 나무: 뭉게뭉게 잎 3덩이를 하나로 합침
  const blob = mergeGeometries([
    new THREE.IcosahedronGeometry(0.95, 1).translate(0, 1.85, 0),
    new THREE.IcosahedronGeometry(0.7, 1).translate(0.55, 1.5, 0.2),
    new THREE.IcosahedronGeometry(0.65, 1).translate(-0.5, 1.55, -0.15),
  ]);
  const leaves = new THREE.InstancedMesh(blob, toon(0xffffff), round.length);
  round.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t.x * 13.7 + t.z) % 6.28);
    m.compose(p.set(t.x, 0, t.z), q, s.setScalar(t.s));
    leaves.setMatrixAt(i, m);
    leaves.setColorAt(i, col.setHSL(0.27 + ((t.x * 7.1) % 1 + 1) % 1 * 0.06, 0.45, 0.55));
  });
  group.add(leaves);

  // 뾰족한 나무: 원뿔 3단
  const cone = mergeGeometries([
    new THREE.ConeGeometry(1.0, 1.2, 8).translate(0, 1.4, 0),
    new THREE.ConeGeometry(0.8, 1.0, 8).translate(0, 2.0, 0),
    new THREE.ConeGeometry(0.55, 0.85, 8).translate(0, 2.55, 0),
  ]);
  const pines = new THREE.InstancedMesh(cone, toon(0xffffff), pine.length);
  pine.forEach((t, i) => {
    m.compose(p.set(t.x, 0, t.z), q.identity(), s.setScalar(t.s));
    pines.setMatrixAt(i, m);
    pines.setColorAt(i, col.setHSL(0.36, 0.4, 0.42 + ((t.z * 3.3) % 1 + 1) % 1 * 0.08));
  });
  group.add(pines);
}

function buildRocks(group) {
  const geo = new THREE.DodecahedronGeometry(0.75, 0).scale(1, 0.65, 1).translate(0, 0.3, 0);
  const rocks = new THREE.InstancedMesh(geo, toon(0xbdb8ae), WORLD.rocks.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  WORLD.rocks.forEach((r, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot);
    m.compose(new THREE.Vector3(r.x, 0, r.z), q, new THREE.Vector3(r.s, r.s, r.s));
    rocks.setMatrixAt(i, m);
  });
  group.add(rocks);
}

function buildFlowers(group) {
  const palette = [0xff9fb8, 0xfff07a, 0xffffff, 0xc7a8ff].map((c) => new THREE.Color(c));
  const n = WORLD.flowers.length;
  const stems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.3, 4).translate(0, 0.15, 0), toon(0x6aa84f), n,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.11, 0).translate(0, 0.33, 0), toon(0xffffff), n,
  );
  const m = new THREE.Matrix4();
  WORLD.flowers.forEach((f, i) => {
    m.makeScale(f.s, f.s, f.s).setPosition(f.x, 0, f.z);
    stems.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    heads.setColorAt(i, palette[f.c]);
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
  group.add(new THREE.Mesh(mergeGeometries(parts), vertexColorToon));
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
  group.add(new THREE.Mesh(mergeGeometries(parts), vertexColorToon));
}

export function buildVillage(scene) {
  const group = new THREE.Group();
  const labels = []; // 둥근 지평선에 맞춰 매 장면 위치를 고칠 이름표
  group.add(buildGround());
  group.add(buildRiver());
  group.add(buildBridge());
  buildTrees(group);
  buildRocks(group);
  buildFlowers(group);
  buildFence(group);
  buildPlots(group, labels);
  scene.add(group);
  return { group, labels, size: HALF };
}
