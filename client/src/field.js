// 들판(저렙 사냥터, 가명): 숲으로 둘러싸인 넓게 트인 풀밭. 남쪽 포탈에서 흙길이 가운데로 이어지고,
// 서쪽에 작은 연못, 군데군데 키 큰 풀숲·바위·나무, 가운데 풀밭에서 날개콩들이 돌아다닌다
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIELD, FIELD_MAP, FIELD_POND, FIELD_MONSTERS, PORTALS, fieldEdge } from '../../shared/world.js';
import { toon, windToon, swayToon, basic, paint, vertexColorToon, addOutline, curveDrop, instancedCells, tiled } from './materials.js';
import { roundCanopy, pineCanopy, ovalCanopy, trunkGeometry } from './village.js';
import { makeLabel } from './label.js';
import { buildPortal } from './portal.js';

const MEADOW_A = new THREE.Color(0xbfe08a); // 햇볕 드는 연두 풀밭 (마을보다 밝고 노르스름)
const MEADOW_B = new THREE.Color(0xa3d273);
const FOREST = new THREE.Color(0x6f9e5a); // 숲 바닥
const DIRT = new THREE.Color(0xdcc391); // 흙길
const BANK = new THREE.Color(0xd6c79a); // 연못가
const GATE = PORTALS[1];

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
const noise = (x, z) => (Math.sin(x * 0.31) * Math.cos(z * 0.27) + Math.sin((x - z) * 0.19) * 0.6) * 0.5 + 0.5;
const smooth = THREE.MathUtils.smoothstep;
// 들판 가운데에서 잰 거리와 가장자리까지 남은 거리 (숲 쪽은 음수)
const toEdge = (x, z) => fieldEdge(x, z) - Math.hypot(x - FIELD.x, z - FIELD.z);
// 흙길: 포탈에서 가운데 공터까지 살짝 굽이치는 길 + 가운데 둥근 공터
const pathX = (z) => FIELD.x + 0.9 * Math.sin((z - FIELD.z) * 0.25);
function dirt(x, z) {
  const along = z > FIELD.z - 1 && z < GATE.z + 1.5 ? 1.2 - Math.abs(x - pathX(z)) : -9;
  const clearing = 3.2 - Math.hypot(x - FIELD.x, z - FIELD.z);
  return Math.max(along, clearing); // 0보다 크면 흙
}

function buildGround() {
  const size = 2 * FIELD.r + 42; // 들판 + 둘레 숲까지
  const seg = Math.round(size / 0.5);
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2).translate(FIELD.x, 0, FIELD.z);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    c.copy(MEADOW_A).lerp(MEADOW_B, noise(x, z));
    c.lerp(FOREST, smooth(-toEdge(x, z), -1.5, 3)); // 가장자리부터 숲 바닥색
    c.lerp(DIRT, smooth(dirt(x, z), -0.25, 0.25));
    const dp = Math.hypot(x - FIELD_POND.x, z - FIELD_POND.z) - FIELD_POND.r;
    c.lerp(BANK, smooth(-dp, -1.1, -0.3));
    colors.set([c.r, c.g, c.b], i * 3);
    pos.setY(i, -0.4 * smooth(-dp, -0.6, 1.2)); // 연못 바닥은 오목하게
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return tiled(geo, seg, vertexColorToon);
}

function buildPond(group) {
  const p = FIELD_POND;
  const water = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.15, 40).rotateX(-Math.PI / 2),
    toon(0x7fcfe6, { transparent: true, opacity: 0.88 }));
  water.position.set(p.x, -0.07, p.z);
  group.add(water);
  // 연잎 몇 장과 물가 갈대
  const rand = seeded(77);
  const pads = [];
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * (p.r - 0.8);
    pads.push(paint(new THREE.CircleGeometry(0.3 + rand() * 0.15, 14, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2)
      .translate(p.x + Math.cos(a) * d, -0.05, p.z + Math.sin(a) * d), i % 2 ? 0x6fb555 : 0x82c464));
  }
  group.add(new THREE.Mesh(mergeGeometries(pads), vertexColorToon));
  const reeds = [];
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = p.r + 0.1 + rand() * 0.5;
    const h = 0.6 + rand() * 0.5;
    reeds.push(paint(new THREE.CylinderGeometry(0.015, 0.025, h, 4).translate(p.x + Math.cos(a) * d, h / 2, p.z + Math.sin(a) * d), 0x7da653));
    if (i % 3 === 0) reeds.push(paint(new THREE.CapsuleGeometry(0.035, 0.14, 2, 6).translate(p.x + Math.cos(a) * d, h, p.z + Math.sin(a) * d), 0x8a5a36));
  }
  group.add(new THREE.Mesh(mergeGeometries(reeds.map((g) => g.toNonIndexed())), windToon(0xffffff, { vertexColors: true })));
}

const TREE_CELL = 20;
// 나무: 들판 안 나무(부딪힘) + 가장자리를 빽빽이 두르는 숲(장식, 어차피 못 들어감)
function buildTrees(group, low) {
  const rand = seeded(20261124);
  const list = FIELD_MAP.trees.map((t) => ({ ...t, look: t.kind === 1 ? 1 : 0 }));
  const ring = low ? 240 : 400;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rand() * 0.03;
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    const e = fieldEdge(FIELD.x + ux, FIELD.z + uz);
    for (const row of [0.6, 3.2, 6.5]) {
      if (row > 1 && rand() < 0.35) continue;
      const d = e + row + rand() * 1.6;
      const s = 0.95 + rand() * 0.7 + row * 0.06;
      list.push({ x: FIELD.x + ux * d, z: FIELD.z + uz * d, s, look: rand() < 0.45 ? 1 : rand() < 0.5 ? 2 : 0 });
    }
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const pose = (t) => {
    q.setFromAxisAngle(Y, (t.x * 13.7 + t.z) % 6.28);
    return m.compose(p.set(t.x, 0, t.z), q, sc.setScalar(t.s));
  };
  // 나무 수백 그루를 한 덩어리로 두면 화면 밖 나무까지 늘 다 그린다 (삼각형 150만 개): TREE_CELL(m) 칸으로 나눠 화면 밖 칸은 빠지게 한다
  const cells = new Map();
  for (const t of list) {
    const key = `${Math.floor(t.x / TREE_CELL)},${Math.floor(t.z / TREE_CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(t);
  }
  const trunkGeo = trunkGeometry();
  const trunkMat = toon(0xb98a58);
  const leafMat = swayToon(0xffffff, { vertexColors: true });
  const canopies = [roundCanopy(), pineCanopy(), ovalCanopy()];
  // 칸마다 '화면에 드는지' 볼 둘레 공: 나무는 그릴 때 둥근 지평선만큼 내려가므로(멀수록 많이, 십수 m까지) 공도 그만큼 아래로 늘려야
  // 멀리서 내려와 화면에 드는 나무가 빠지지 않는다. 내려가는 양은 내 자리에 따라 달라서 매 장면 다시 잡는다 (돌려주는 함수)
  const spheres = [];
  const cull = (mesh) => {
    mesh.computeBoundingSphere();
    spheres.push({ s: mesh.boundingSphere, y: mesh.boundingSphere.center.y, r: mesh.boundingSphere.radius });
    mesh.children[0].boundingSphere = mesh.boundingSphere; // 외곽선도 같은 공으로
  };
  for (const here of cells.values()) {
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, here.length);
    here.forEach((t, i) => trunks.setMatrixAt(i, pose(t)));
    group.add(addOutline(trunks, 0.03));
    cull(trunks);
    canopies.forEach((geo, k) => {
      const mine = here.filter((t) => t.look === k);
      if (!mine.length) return;
      const mesh = new THREE.InstancedMesh(geo, leafMat, mine.length);
      mine.forEach((t, j) => {
        mesh.setMatrixAt(j, pose(t));
        const h = ((t.x * 7.1) % 1 + 1) % 1;
        if (k === 1) col.setHSL(0.38 + h * 0.05, 0.42, 0.32 + h * 0.06);
        else col.setHSL(0.2 + h * 0.1, 0.52, 0.45 + h * 0.08);
        mesh.setColorAt(j, col);
      });
      group.add(addOutline(mesh, 0.025, { sway: true }));
      cull(mesh);
    });
  }
  return () => {
    for (const { s, y, r } of spheres) {
      const { x, z } = s.center;
      const drop = Math.max(curveDrop(x, z), curveDrop(x + r, z), curveDrop(x - r, z), curveDrop(x, z + r), curveDrop(x, z - r)) * 1.5; // 칸 안 가장 많이 내려가는 곳 (어림 + 여유)
      s.center.y = y - drop / 2;
      s.radius = r + drop / 2;
    }
  };
}

function buildRocks(group) {
  const geo = mergeGeometries([
    new THREE.IcosahedronGeometry(0.72, 1).scale(1.1, 0.62, 0.95).translate(0, 0.3, 0),
    new THREE.IcosahedronGeometry(0.42, 1).scale(1, 0.75, 1).translate(0.5, 0.2, 0.3),
  ]);
  const mat = toon(0xc9c1b0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  // 바위·풀·꽃도 나무처럼 칸으로 나눠 화면에 드는 칸만 그린다 (materials.js instancedCells)
  instancedCells(group, FIELD_MAP.rocks, (n) => addOutline(new THREE.InstancedMesh(geo, mat, n)), (mesh, j, i) => {
    const r = FIELD_MAP.rocks[i];
    q.setFromAxisAngle(Y, r.rot);
    mesh.setMatrixAt(j, m.compose(new THREE.Vector3(r.x, 0, r.z), q, new THREE.Vector3().setScalar(r.s)));
  });
}

// 풀이 자랄 곳: 들판 안, 흙길·연못·바위·나무 밖
function grassy(x, z) {
  if (toEdge(x, z) < 0.5 || dirt(x, z) > -0.4) return false;
  if (Math.hypot(x - FIELD_POND.x, z - FIELD_POND.z) < FIELD_POND.r + 0.8) return false;
  for (const o of FIELD_MAP.colliders) if (Math.hypot(x - o.x, z - o.z) < o.r + 0.2) return false;
  return true;
}

// 키 큰 풀숲(뾰족한 풀잎 다발)과 들꽃. 풀숲은 무리 지어 자라 사이사이로 길이 난 것처럼 보인다
function buildMeadow(group, low) {
  const rand = seeded(20261125);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const blades = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const h = 0.35 + (i % 3) * 0.12;
    blades.push(new THREE.ConeGeometry(0.05, h, 4).translate(0, h / 2, 0).rotateZ(0.25).rotateY(a).translate(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06));
  }
  const tuftGeo = mergeGeometries(blades);
  const tufts = [];
  const want = low ? 1040 : 2080;
  for (let tries = 0; tufts.length < want && tries < 24000; tries++) {
    const x = FIELD.x + (rand() * 2 - 1) * FIELD.r;
    const z = FIELD.z + (rand() * 2 - 1) * FIELD.r;
    if (noise(x * 1.7, z * 1.7) < 0.5 || !grassy(x, z)) continue; // 무리 지어
    tufts.push({ x, z, s: 0.8 + rand() * 0.8 });
  }
  const tuftMat = windToon(0xffffff);
  const col = new THREE.Color();
  for (const t of tufts) Object.assign(t, { rot: rand() * Math.PI * 2, tall: 0.9 + rand() * 0.5, hue: 0.24 + rand() * 0.06, light: 0.42 + rand() * 0.1 }); // 칸 순서와 상관없이 늘 같은 모양
  instancedCells(group, tufts, (n) => new THREE.InstancedMesh(tuftGeo, tuftMat, n), (mesh, j, i) => {
    const t = tufts[i];
    mesh.setMatrixAt(j, m.compose(p.set(t.x, 0, t.z), q.setFromEuler(e.set(0, t.rot, 0)), s.set(t.s, t.s * t.tall, t.s)));
    mesh.setColorAt(j, col.setHSL(t.hue, 0.5, t.light));
  });

  // 들꽃: 노랑·하양·주홍 (마을보다 들판다운 색)
  const palette = [0xfff08a, 0xffffff, 0xffbe94, 0xffd35c].map((c) => new THREE.Color(c));
  const stem = new THREE.CylinderGeometry(0.018, 0.024, 0.26, 5).translate(0, 0.13, 0);
  const head = paint(new THREE.SphereGeometry(0.07, 8, 5).scale(1, 0.45, 1).translate(0, 0.27, 0), 0xffffff);
  const flowers = [];
  for (let tries = 0; flowers.length < (low ? 480 : 880) && tries < 16000; tries++) {
    const x = FIELD.x + (rand() * 2 - 1) * FIELD.r;
    const z = FIELD.z + (rand() * 2 - 1) * FIELD.r;
    if (grassy(x, z)) flowers.push({ x, z, c: Math.floor(rand() * palette.length), s: 0.7 + rand() * 0.5 });
  }
  const stemMat = windToon(0x6aa84f);
  const headMat = windToon(0xffffff, { vertexColors: true });
  const pose = (i) => m.compose(p.set(flowers[i].x, 0, flowers[i].z), q.identity(), s.setScalar(flowers[i].s));
  instancedCells(group, flowers, (n) => new THREE.InstancedMesh(stem, stemMat, n), (mesh, j, i) => mesh.setMatrixAt(j, pose(i)));
  instancedCells(group, flowers, (n) => new THREE.InstancedMesh(head, headMat, n), (mesh, j, i) => {
    mesh.setMatrixAt(j, pose(i));
    mesh.setColorAt(j, palette[flowers[i].c]);
  });
}

// 포탈 옆 나무 표지판 + 길가 울타리 몇 칸
function buildSign(group, labels) {
  const sx = GATE.x + 2.6;
  const sz = GATE.z - 1.2;
  const parts = [
    paint(new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(sx, 0.55, sz), 0xa8764a),
    paint(new THREE.BoxGeometry(1.3, 0.6, 0.08).translate(sx, 1.1, sz), 0xe8c48a),
  ];
  // 길 양옆 낮은 울타리 (포탈 앞 몇 m 만, 부딪히지 않는 장식)
  for (const k of [-1, 1]) {
    for (let z = GATE.z - 3.5; z > GATE.z - 9; z -= 1.4) {
      const x = pathX(z) + k * 1.7;
      parts.push(paint(new THREE.BoxGeometry(0.1, 0.55, 0.1).translate(x, 0.27, z), 0xb98a58));
      parts.push(paint(new THREE.BoxGeometry(0.06, 0.08, 1.4).translate(x, 0.42, z - 0.7), 0xc99a68));
    }
  }
  group.add(addOutline(new THREE.Mesh(mergeGeometries(parts), vertexColorToon), 0.02));
  const label = makeLabel('🌾 들판 · 저렙 사냥터', { bg: 'rgba(255,250,240,0.92)', size: 0.9 });
  label.userData.base = new THREE.Vector3(sx, 1.95, sz);
  labels.push(label);
  group.add(label);
}

export function buildField(scene, { low = false } = {}) {
  const group = new THREE.Group();
  const labels = [];
  group.add(buildGround());
  buildPond(group);
  const cullTrees = buildTrees(group, low);
  buildRocks(group);
  buildMeadow(group, low);
  buildSign(group, labels);
  const portal = buildPortal(GATE);
  group.add(portal.group, portal.label);
  labels.push(portal.label);
  group.visible = false;
  scene.add(group);
  return {
    group,
    labels,
    monsterSpots: FIELD_MONSTERS,
    update(t) { if (group.visible) { portal.update(t); cullTrees(); } },
  };
}
