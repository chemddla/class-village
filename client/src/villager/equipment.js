// 손에 쥐는 도구·무기 (로우폴리). 손 관절 아래 rightSocket / leftSocket 에 붙는다.
// 도구 공간: 쥐는 곳이 원점, 손잡이→머리 방향이 +Y. grip()으로 감싸면 +Y가 손의 +Z(팔을 내렸을 때 앞쪽)가 된다.
// 날(도끼·검)은 휘두르는 방향인 도구 +Z 쪽을 향한다.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointHit, forearmHit } from './collision.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// 도구 기본 재질: 매끈한 플라스틱·칠 광택 (나무는 따로 거칠게)
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.3, ...o });
const WOOD = () => mat('#a8743f', { roughness: 0.8 });
const DARK_WOOD = () => mat('#6e4526', { roughness: 0.8 });
const METAL = () => mat('#dfe5ec', { roughness: 0.3, metalness: 0.35 });
const LEATHER = () => mat('#5a3a2a', { roughness: 0.35 });

function part(geo, material, parent, name, [x, y, z] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = true;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function grip(tool) {
  const g = new THREE.Group();
  g.rotation.x = PI / 2;
  g.add(tool);
  return g;
}

function line(points, color = '#f4f1ea') {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  l.frustumCulled = false;
  return l;
}
function setLine(l, points) {
  const p = l.geometry.attributes.position;
  points.forEach((v, i) => p.setXYZ(i, v.x, v.y, v.z));
  p.needsUpdate = true;
}

// ── 생활 도구 ──
function axe() {
  const g = new THREE.Group();
  g.name = '도끼';
  part(new THREE.CylinderGeometry(0.011, 0.013, 0.38, 8), WOOD(), g, '도끼자루', [0, 0.09, 0]);
  const head = mat('#8d939c', { roughness: 0.4, metalness: 0.4 });
  part(new THREE.BoxGeometry(0.02, 0.05, 0.05), head, g, '도끼머리', [0, 0.25, 0.02]);
  // 날: 끝으로 갈수록 넓어지는 쐐기 + 밝게 간 날끝
  const s = new THREE.Shape();
  s.moveTo(0, -0.024);
  s.lineTo(0.05, -0.046);
  s.quadraticCurveTo(0.062, 0, 0.05, 0.046);
  s.lineTo(0, 0.024);
  s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  blade.translate(0, 0, -0.005).rotateY(-PI / 2);
  part(blade, head, g, '도끼날', [0, 0.25, 0.035]);
  part(new THREE.BoxGeometry(0.013, 0.086, 0.007).rotateX(0), METAL(), g, '날끝', [0, 0.25, 0.092]);
  part(new THREE.BoxGeometry(0.024, 0.04, 0.02), head, g, '도끼등', [0, 0.25, -0.014]);
  return grip(g);
}

// 낚싯대: 짙은 청록 광택의 두 마디 낚싯대(끝으로 갈수록 가늘고, 마디마다 금빛 띠) + 아래쪽 줄 고리 +
// 코르크 손잡이와 고무 꼭지 + 은빛 릴(손잡이 달린 손잡이대). 대 끝(tip)에서 찌까지 줄이 이어진다
function fishingRod() {
  const g = new THREE.Group();
  g.name = '낚싯대';
  const BLANK = mat('#24555f', { roughness: 0.18, metalness: 0.15 });
  const GOLD = mat('#d9b45a', { roughness: 0.25, metalness: 0.6 });
  const SILVER = mat('#cfd6de', { roughness: 0.25, metalness: 0.7 });
  // 손잡이: 살짝 볼록한 코르크 + 끝의 검은 고무 꼭지 + 릴을 받치는 은빛 고리
  const cork = new THREE.CylinderGeometry(0.0105, 0.0115, 0.12, 14);
  const cp = cork.attributes.position;
  for (let i = 0; i < cp.count; i++) { const k = 1 + 0.12 * Math.cos((cp.getY(i) / 0.06) * PI * 0.5); cp.setX(i, cp.getX(i) * k); cp.setZ(i, cp.getZ(i) * k); }
  cork.computeVertexNormals();
  part(cork, mat('#d6b27c', { roughness: 0.95 }), g, '손잡이', [0, -0.03, 0]);
  part(new THREE.SphereGeometry(0.0125, 14, 8).scale(1, 0.7, 1), mat('#2b2b2e', { roughness: 0.6 }), g, '고무꼭지', [0, -0.092, 0]);
  for (const y of [0.04, 0.09]) part(new THREE.CylinderGeometry(0.0095, 0.0095, 0.008, 14), SILVER, g, '릴시트', [0, y, 0]);
  part(new THREE.CylinderGeometry(0.0085, 0.0085, 0.05, 12), mat('#3a3f46', { roughness: 0.4 }), g, '릴받침', [0, 0.065, 0]);
  // 낚싯대: 두 마디 (아래 굵게 → 끝 가늘게), 마디·밑동마다 금빛 띠
  part(new THREE.CylinderGeometry(0.0048, 0.0072, 0.2, 10), BLANK, g, '아랫마디', [0, 0.19, 0]);
  part(new THREE.CylinderGeometry(0.0022, 0.0048, 0.2, 10), BLANK, g, '윗마디', [0, 0.39, 0]);
  for (const [y, r] of [[0.092, 0.0078], [0.29, 0.0055]]) part(new THREE.CylinderGeometry(r, r, 0.012, 12), GOLD, g, '금띠', [0, y, 0]);
  part(new THREE.SphereGeometry(0.0032, 8, 6), mat('#f2ead8', { roughness: 0.3 }), g, '끝마개', [0, 0.49, 0]);
  // 줄 고리: 낚싯대 아래쪽(+x, 릴 쪽)에 점점 작아지며 4개
  [[0.15, 0.0075], [0.25, 0.006], [0.35, 0.0048], [0.44, 0.0038]].forEach(([y, r]) => {
    const ring = part(new THREE.TorusGeometry(r, 0.0011, 6, 14).rotateY(PI / 2), SILVER, g, '줄고리', [0.006 + r, y, 0]);
    ring.castShadow = false;
    part(new THREE.CylinderGeometry(0.0009, 0.0009, 0.006 + r, 4).rotateZ(PI / 2), SILVER, g, '고리다리', [(0.006 + r) / 2 + 0.002, y, 0]);
  });
  // 릴: 은빛 몸통 + 짙은 남색 줄감개 + 옆으로 뻗은 손잡이대와 동그란 손잡이
  const reel = new THREE.Group();
  reel.name = '릴';
  reel.position.set(0.024, 0.065, 0);
  g.add(reel);
  part(new THREE.CylinderGeometry(0.017, 0.017, 0.016, 18).rotateZ(PI / 2), SILVER, reel, '릴몸통');
  part(new THREE.CylinderGeometry(0.0135, 0.0135, 0.018, 18).rotateZ(PI / 2), mat('#27345a', { roughness: 0.35 }), reel, '줄감개');
  part(new THREE.BoxGeometry(0.004, 0.01, 0.004), SILVER, reel, '릴다리', [-0.012, 0, 0]);
  part(new THREE.BoxGeometry(0.003, 0.022, 0.003), SILVER, reel, '손잡이대', [0.011, -0.009, 0]);
  part(new THREE.SphereGeometry(0.0045, 10, 8).scale(1, 1.3, 1), mat('#e9e3d6', { roughness: 0.5 }), reel, '릴손잡이', [0.011, -0.021, 0]);
  for (const m of reel.children) m.castShadow = false;
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.49, 0);
  g.add(tip);
  // 찌: 위는 빨강, 아래는 흰색, 가운데 검은 띠 + 꼭대기에 가는 막대
  const bobber = new THREE.Group();
  bobber.name = '찌';
  part(new THREE.SphereGeometry(0.016, 14, 8, 0, PI * 2, 0, PI / 2), mat('#e2574c', { roughness: 0.4 }), bobber, '찌위');
  part(new THREE.SphereGeometry(0.016, 14, 8, 0, PI * 2, PI / 2, PI / 2), mat('#fffaf0', { roughness: 0.4 }), bobber, '찌아래');
  part(new THREE.CylinderGeometry(0.0162, 0.0162, 0.003, 16), mat('#2b2b2e'), bobber, '찌띠');
  part(new THREE.CylinderGeometry(0.0016, 0.0016, 0.016, 6), mat('#e2574c', { roughness: 0.4 }), bobber, '찌막대', [0, 0.022, 0]);
  g.add(bobber);
  const l = line([V(), V()]);
  g.add(l);
  g.userData.rod = { tip, bobber, line: l, bobW: null };
  return grip(g);
}

function bugNet() {
  const g = new THREE.Group();
  g.name = '잠자리채';
  // 자루: 마디 있는 대나무 + 손잡이에 감은 초록 천
  const BAMBOO = mat('#e2c27f', { roughness: 0.6 });
  const L = 0.6;
  part(new THREE.CylinderGeometry(0.0065, 0.0085, L, 10), BAMBOO, g, '채자루', [0, L / 2 - 0.08, 0]);
  for (const y of [0.1, 0.27, 0.42]) part(new THREE.CylinderGeometry(0.0085, 0.0085, 0.008, 10), mat('#c9a35c', { roughness: 0.6 }), g, '마디', [0, y, 0]);
  part(new THREE.CylinderGeometry(0.0105, 0.0105, 0.11, 12), mat('#4f9a5c', { roughness: 0.7 }), g, '손잡이', [0, -0.03, 0]);
  // 테: 자루 끝에서 이어지는 둥근 철사 고리 (자루와 같은 면에 서서, 휘두르는 쪽(+Z)으로 입을 벌린다)
  const R = 0.11;
  const top = L - 0.08;
  const hoopY = top + R;
  const WIRE = mat('#3b8f5a', { roughness: 0.4, metalness: 0.2 });
  part(new THREE.TorusGeometry(R, 0.0045, 8, 36), WIRE, g, '테', [0, hoopY, 0]);
  part(new THREE.CylinderGeometry(0.0095, 0.0085, 0.03, 10), mat('#cfd6de', { roughness: 0.3, metalness: 0.6 }), g, '쇠고리', [0, top - 0.005, 0]);
  // 그물 주머니: 테보다 깊은 자루 모양. 휘두르는 반대쪽(-Z)으로 늘어지며 끝이 아래로 처진다
  const D = 0.27;
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    prof.push(new THREE.Vector2(R * Math.sqrt(Math.max(0, 1 - t ** 2.2)) * (1 - 0.15 * t) + 0.0005, -D * t));
  }
  const sack = new THREE.LatheGeometry(prof, 20).rotateX(PI / 2); // 축 -Z 로
  const sp = sack.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const k = -sp.getZ(i) / D; // 0(테) → 1(끝)
    sp.setY(i, sp.getY(i) * (1 - 0.25 * k) - 0.09 * k * k); // 끝으로 갈수록 좁아지며 아래로 처짐
  }
  sack.computeVertexNormals();
  part(sack, new THREE.MeshStandardMaterial({ color: '#f3fbf6', transparent: true, opacity: 0.42, roughness: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    g, '그물', [0, hoopY, 0]).castShadow = false;
  const netLines = new THREE.LineSegments(new THREE.WireframeGeometry(sack), new THREE.LineBasicMaterial({ color: '#d6e9df', transparent: true, opacity: 0.8 }));
  netLines.position.set(0, hoopY, 0);
  g.add(netLines);
  return grip(g);
}

// 채집통: 왼손에 손잡이를 쥐고 드는 투명한 통 (초록 뚜껑·바닥, 안에 풀잎 하나). 손 아래(-y)로 매달린다
function bugCase() {
  const g = new THREE.Group();
  g.name = '채집통';
  const GREEN = mat('#4f9a5c', { roughness: 0.45 });
  part(new THREE.BoxGeometry(0.078, 0.064, 0.056), new THREE.MeshStandardMaterial({ color: '#dff3f6', transparent: true, opacity: 0.45, roughness: 0.15, depthWrite: false }),
    g, '통', [0, -0.07, 0]).castShadow = false;
  part(new THREE.BoxGeometry(0.084, 0.012, 0.062), GREEN, g, '뚜껑', [0, -0.033, 0]);
  part(new THREE.BoxGeometry(0.084, 0.008, 0.062), GREEN, g, '바닥', [0, -0.104, 0]);
  part(new THREE.TorusGeometry(0.022, 0.0035, 6, 14, PI), mat('#e9e3d6', { roughness: 0.5 }), g, '손잡이', [0, -0.027, 0]);
  part(new THREE.BoxGeometry(0.004, 0.035, 0.012).rotateZ(0.3), mat('#7fbf4f', { roughness: 0.6 }), g, '풀잎', [0.012, -0.082, 0]).castShadow = false;
  return g;
}

// ── 사냥 무기 ──
function club() {
  const g = new THREE.Group();
  g.name = '나무몽둥이';
  part(new THREE.CylinderGeometry(0.012, 0.013, 0.16, 8), DARK_WOOD(), g, '몽둥이자루', [0, 0, 0]);
  // 끝으로 갈수록 굵어지는 머리 + 둥근 끝
  part(new THREE.CylinderGeometry(0.03, 0.016, 0.2, 9), WOOD(), g, '몽둥이머리', [0, 0.18, 0]);
  part(new THREE.SphereGeometry(0.03, 9, 6, 0, PI * 2, 0, PI / 2), WOOD(), g, '몽둥이끝', [0, 0.28, 0]);
  return grip(g);
}
function sword() {
  const g = new THREE.Group();
  g.name = '한손검';
  part(new THREE.CylinderGeometry(0.011, 0.011, 0.075, 8), LEATHER(), g, '검손잡이');
  part(new THREE.SphereGeometry(0.016, 10, 8), mat('#e7b74a', { roughness: 0.35, metalness: 0.5 }), g, '검자루끝', [0, -0.048, 0]);
  part(new THREE.BoxGeometry(0.022, 0.018, 0.1), mat('#e7b74a', { roughness: 0.35, metalness: 0.5 }), g, '코등이', [0, 0.045, 0]);
  // 칼날: 납작한 윤곽을 살짝 두께 있게 뽑아내고, 날이 휘두르는 방향(±Z)을 향하도록 세움
  const s = new THREE.Shape();
  s.moveTo(-0.018, 0.05);
  s.lineTo(-0.018, 0.27);
  s.lineTo(0, 0.31);
  s.lineTo(0.018, 0.27);
  s.lineTo(0.018, 0.05);
  s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  blade.translate(0, 0, -0.002).rotateY(PI / 2);
  part(blade, METAL(), g, '칼날');
  return grip(g);
}

// ── 목검 ──
// 납작한 윤곽(x = 날 폭 방향, y = 길이)을 두께 있게 뽑아 날이 ±Z를 향하게 세운다.
// 각진 모서리는 꼭짓점마다 면 방향이 갈라져 있어 외곽선 껍질을 밀어내면 면끼리 벌어져 선이 떠 보인다:
// 외곽선에는 같은 자리 꼭짓점을 합쳐 면 방향을 고르게 이은 모양을 따로 쓴다
function flatBlade(shape, depth, bevel = 0.003) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12 });
  return geo.translate(0, 0, -depth / 2).rotateY(PI / 2);
}
function smoothOutline(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', mesh.geometry.getAttribute('position').clone());
  const merged = mergeVertices(g, 1e-5);
  merged.computeVertexNormals();
  g.dispose();
  mesh.userData.outlineGeometry = merged;
  return mesh;
}
const OAK = () => mat('#b98349', { roughness: 0.7 });

// 휜 목검: 길고 가늘게 살짝 휘어진 날 + 동그란 판 코등이 + 끈 감은 손잡이
function woodSword() {
  const g = new THREE.Group();
  g.name = '목검';
  part(new THREE.CylinderGeometry(0.012, 0.013, 0.09, 8), DARK_WOOD(), g, '목검손잡이', [0, -0.005, 0]);
  for (let i = 0; i < 4; i++) {
    const r = part(new THREE.TorusGeometry(0.0128, 0.0028, 5, 12).rotateX(PI / 2), mat('#2f3b5c', { roughness: 0.6 }), g, '손잡이끈', [0, -0.04 + i * 0.022, 0]);
    r.rotation.z = (i % 2 ? 0.25 : -0.25);
  }
  part(new THREE.CylinderGeometry(0.028, 0.028, 0.007, 16), DARK_WOOD(), g, '판코등이', [0, 0.045, 0]);
  // 날: 뿌리 폭 0.019 → 끝으로 갈수록 살짝 좁아지며 등 쪽(-x)으로 휜다
  const s = new THREE.Shape();
  s.moveTo(-0.0095, 0.048);
  s.quadraticCurveTo(-0.011, 0.27, -0.03, 0.43);
  s.quadraticCurveTo(-0.016, 0.44, -0.005, 0.425);
  s.quadraticCurveTo(0.004, 0.27, 0.0095, 0.048);
  s.closePath();
  smoothOutline(part(flatBlade(s, 0.008, 0.0025), OAK(), g, '목검날'));
  return grip(g);
}

function shield() {
  // 왼쪽 아래팔 바깥에 차는 둥근 방패 (면이 손의 +X = 바깥쪽을 향함)
  const g = new THREE.Group();
  g.name = '방패';
  g.position.set(0.042, 0.02, 0);
  const toX = (geo) => geo.rotateZ(-PI / 2);
  part(toX(new THREE.CylinderGeometry(0.088, 0.088, 0.014, 28)), WOOD(), g, '방패판');
  part(new THREE.TorusGeometry(0.088, 0.008, 8, 36).rotateY(PI / 2), mat('#c9c3b5', { roughness: 0.35, metalness: 0.4 }), g, '방패테');
  part(new THREE.TorusGeometry(0.048, 0.006, 8, 30).rotateY(PI / 2), mat('#e2574c', { roughness: 0.5 }), g, '문양', [0.008, 0, 0]);
  part(toX(new THREE.SphereGeometry(0.022, 14, 8, 0, PI * 2, 0, PI / 2)), mat('#e7b74a', { roughness: 0.35, metalness: 0.5 }), g, '방패징', [0.007, 0, 0]);
  return g;
}

// 화살깃 한 장 (대를 사이에 두고 양쪽으로 펼친 모양): 앞(촉 쪽)은 대에 붙어 가늘게 시작해 뒤로 갈수록 넓어지고,
// 뒤끝은 비스듬히 잘려 꼬리 쪽으로 살짝 들어간다. X = 대에서 바깥쪽, Y = 꼬리에서 촉 쪽 (rotateX 로 Y 를 화살 +Z 에 맞춘다)
function fletchGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.088);
  s.quadraticCurveTo(0.005, 0.04, 0.021, 0.02);
  s.lineTo(0.018, 0.005);
  s.lineTo(0, 0.013);
  s.lineTo(-0.018, 0.005);
  s.lineTo(-0.021, 0.02);
  s.quadraticCurveTo(-0.005, 0.04, 0, 0.088);
  return new THREE.ShapeGeometry(s, 8).rotateX(PI / 2);
}

// 화살: +Z 방향으로 뻗음 (꼬리가 원점, 길이 ARROW_LEN). 활에 메긴 화살·화살통에 꽂힌 화살·날아가는 화살이 모두 이것
export const ARROW_LEN = 0.345;
export function makeArrow() {
  const arrow = new THREE.Group();
  arrow.name = '화살';
  part(new THREE.CylinderGeometry(0.0035, 0.0035, 0.3, 6).rotateX(PI / 2), mat('#e7c39b'), arrow, '화살대', [0, 0, 0.15]);
  part(new THREE.ConeGeometry(0.014, 0.045, 8).rotateX(PI / 2), METAL(), arrow, '화살촉', [0, 0, 0.3225]); // 굵은 촉 (대 끝 0.3 ~ 0.345)
  for (const r of [0, PI / 2]) {
    const f = part(fletchGeometry(), new THREE.MeshStandardMaterial({ color: '#f28aa0', side: THREE.DoubleSide }), arrow, '깃');
    f.rotation.z = r;
  }
  // 윤곽선 두께를 부품마다 같게 (크기로 정하면 길쭉한 화살대만 두껍고 촉·깃은 가늘어 들쭉날쭉하다)
  arrow.traverse((m) => { if (m.isMesh) m.userData.outlineWidth = ARROW_OUTLINE; });
  return arrow;
}
const ARROW_OUTLINE = 0.003;

// 화살통: 등에 비스듬히 메고(입구가 오른쪽 어깨 뒤로), 남은 화살 수만큼 깃이 위로 삐죽 나와 보인다
export const QUIVER_SHOW = 6; // 화살통에 보이는 화살 최대 개수 (더 있어도 이만큼만 그린다)
function quiver() {
  const g = new THREE.Group();
  g.name = '화살통';
  const H = 0.24;
  const R = 0.026;
  part(new THREE.CylinderGeometry(R, R * 0.85, H, 14, 1, true), mat('#8a5434', { roughness: 0.6, side: THREE.DoubleSide }), g, '통', [0, H / 2, 0]);
  part(new THREE.CircleGeometry(R * 0.85, 14).rotateX(PI / 2), LEATHER(), g, '바닥');
  const band = mat('#e7b74a', { roughness: 0.35, metalness: 0.5 });
  for (const y of [0.025, H - 0.012]) part(new THREE.TorusGeometry(R * (y < 0.1 ? 0.88 : 1.0), 0.0045, 6, 18).rotateX(PI / 2), band, g, '테', [0, y, 0]);
  // 화살: 통 안에 둥글게 모아 꽂는다. 촉은 바닥 가운데로 모이고(통 밖으로 뚫고 나오지 않게) 깃 쪽이 살짝 벌어진다
  const arrows = [];
  const Zp = V(0, 0, 1);
  for (let i = 0; i < QUIVER_SHOW; i++) {
    const a = makeArrow();
    const t = (i / QUIVER_SHOW) * PI * 2;
    const out = i === 0 ? V() : V(Math.cos(t), 0, Math.sin(t));
    const tip = V().addScaledVector(out, 0.005).setY(0.01 + (i % 2) * 0.008);
    const dir = V(0, -1, 0).addScaledVector(out, -0.07).normalize(); // 꼬리 → 촉 (아래로, 꼬리가 바깥쪽)
    a.position.copy(tip).addScaledVector(dir, -ARROW_LEN);
    a.quaternion.setFromUnitVectors(Zp, dir);
    a.rotateZ(t); // 깃 방향을 조금씩 다르게
    g.add(a);
    arrows.push(a);
  }
  g.userData.quiver = { arrows };
  return g;
}

// 굵기가 바뀌는 관: 가운데(손잡이)가 가장 굵고 양 끝으로 갈수록 가늘어지며, 끝은 둥글게 모인다 (활대)
// 꼭짓점을 고리끼리 나눠 써서 면 방향이 매끈하게 이어진다 (외곽선이 끊기지 않게)
function taperTube(curve, segs, radial, rMid, rEnd) {
  const { tangents, normals, binormals } = curve.computeFrenetFrames(segs, false);
  const pos = [];
  const idx = [];
  const p = V();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const r = rEnd + (rMid - rEnd) * Math.pow(Math.sin(PI * t), 0.7);
    curve.getPointAt(t, p);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * PI * 2;
      const n = normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(binormals[i], Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      idx.push(a, b, c, b, d, c); // 바깥을 보는 면 (윤곽선 껍질이 바깥으로 밀려 나가야 한다)
    }
  }
  // 양 끝 마개: 끝 고리에서 바깥으로 반지름만큼 나간 한 점에 모은다
  for (const [i, sign] of [[0, -1], [segs, 1]]) {
    curve.getPointAt(i / segs, p);
    const tip = pos.length / 3;
    p.addScaledVector(tangents[i], sign * rEnd);
    pos.push(p.x, p.y, p.z);
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial);
      if (sign > 0) idx.push(a, b, tip); else idx.push(b, a, tip);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function bow() {
  const g = new THREE.Group();
  g.name = '활';
  const top = V(0, 0.25, -0.075);
  const bottom = V(0, -0.25, -0.075);
  const curve = new THREE.QuadraticBezierCurve3(top, V(0, 0, 0.06), bottom);
  // 가늘수록 윤곽선이 나무 색을 덮어 검은 줄처럼 보이므로: 조금 굵게, 윤곽선은 굵기에 맞춰 얇게
  part(taperTube(curve, 32, 8, 0.011, 0.0035), WOOD(), g, '활대').userData.outlineWidth = 0.0045;
  part(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), LEATHER(), g, '줌통');
  const rest = V(0, 0, -0.075);
  const str = line([top, rest.clone(), bottom], '#fffaf0');
  g.add(str);
  const arrow = makeArrow();
  arrow.visible = false;
  g.add(arrow);
  g.userData.bow = { top, bottom, rest, string: str, arrow, nock: rest.clone() };
  return grip(g);
}

function staff() {
  const g = new THREE.Group();
  g.name = '마법지팡이';
  part(new THREE.CylinderGeometry(0.009, 0.012, 0.5, 8), DARK_WOOD(), g, '지팡이대', [0, 0.11, 0]);
  const gold = mat('#e7b74a', { roughness: 0.35, metalness: 0.5 });
  part(new THREE.TorusGeometry(0.013, 0.004, 6, 16).rotateX(PI / 2), gold, g, '고리', [0, 0.34, 0]);
  // 수정을 감싸는 갈퀴 세 개
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    const c = part(new THREE.ConeGeometry(0.006, 0.06, 5), gold, g, '갈퀴', [Math.cos(a) * 0.02, 0.38, Math.sin(a) * 0.02]);
    c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
  }
  const crystal = part(new THREE.OctahedronGeometry(0.035, 0).scale(1, 1.4, 1), new THREE.MeshStandardMaterial({
    color: '#a8ecff', emissive: '#4fc3ff', emissiveIntensity: 0.5, roughness: 0.15, flatShading: true,
  }), g, '수정', [0, 0.43, 0]);
  const light = new THREE.PointLight('#7fd8ff', 0, 0.6);
  light.position.copy(crystal.position);
  g.add(light);
  g.userData.staff = { crystal, light };
  return grip(g);
}

// 장비 목록: right / left 는 각 손 소켓에 붙일 모델을 만드는 함수
// carry: 대기·걷기처럼 도구를 쓰지 않는 동안 손목을 세워 도구를 비스듬히 드는 각도 [오른손, 왼손]
// twoHand: 두 손 액션(fx.twoHand)에서 왼손이 잡을 자루 위치 (도구 공간 y, 오른손 = 0)
export const EQUIPMENT = {
  none: { label: '맨손' },
  axe: { label: '도끼', right: axe, carry: [-0.9, 0], twoHand: -0.07 },
  club: { label: '나무 몽둥이', right: club, carry: [-0.9, 0], twoHand: -0.056 }, // 두 주먹이 맞닿는 간격
  rod: { label: '낚싯대', right: fishingRod, carry: [-0.7, 0], twoHand: -0.07 },
  net: { label: '잠자리채', right: bugNet, left: bugCase, carry: [-1.0, 0] }, // 오른손 잠자리채 + 왼손 채집통
  swordShield: { label: '검 + 방패', right: sword, left: shield, carry: [-0.5, 0] },
  woodSword: { label: '목검', right: woodSword, carry: [-0.5, 0] },
  // 활은 시위가 팔 뒤쪽(몸 뒤 안쪽)으로 가게 세워 든다 (carryL: 왼손 소켓 회전을 직접 정함)
  bow: { label: '활', left: bow, back: quiver, carry: [0, 0], carryL: [-0.75, 0.75, 0.2] },
  staff: { label: '마법 지팡이', right: staff, carry: [-1.35, 0] },
};
const CARRY_ACTIONS = new Set(['idle', 'walk', 'run', 'jump', 'flip', 'roll', 'wave', 'cheer']);

// 소켓을 비우고 새 장비를 쥐어 준다
export function attachEquipment(rig, id) {
  const e = EQUIPMENT[id] ?? EQUIPMENT.none;
  for (const [sock, make] of [[rig.rightSocket, e.right], [rig.leftSocket, e.left]]) {
    for (const c of [...sock.children]) {
      sock.remove(c);
      c.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); });
    }
    if (make) sock.add(make());
  }
  // 등에 메는 것 (활을 들면 화살통): 몸통에 붙인다
  for (const c of rig.spine.children.filter((x) => x.userData.back)) {
    rig.spine.remove(c);
    c.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); });
  }
  rig.quiver = null;
  if (e.back) {
    const b = e.back();
    b.userData.back = true;
    b.position.set(...BACK_AT.pos);
    b.rotation.set(...BACK_AT.rot);
    rig.spine.add(b);
    rig.quiver = b.userData.quiver ?? null;
  }
}
// 등에 메는 자리 (몸통 기준): 허리 위 등 뒤, 입구가 오른쪽(-x) 어깨 뒤로 오게 비스듬히
const BACK_AT = { pos: [0.015, 0.06, -0.07], rot: [-0.2, 0, 0.7] }; // 깃이 큰 머리(머리카락)에 닿지 않을 만큼 눕힌다

// ── 두 손 쥐기 IK ──
// 애니메이션이 정한 도구 방향은 그대로 두고, 두 손 사이가 몸 한가운데 오도록 도구를 옆으로 옮긴 뒤
// 두 팔을 IK로 뻗어 오른손은 원래 쥔 곳, 왼손은 자루의 y 지점을 같은 방향으로 감싸 쥔다 (w = 0→1 섞는 비율).
// 팔꿈치는 몸통 기준 바깥·아래·뒤(pole) 쪽으로 굽는다. 관절의 굽힘축은 로컬 x, 팔은 로컬 -y로 뻗는다.
const POLE = { R: V(-0.7, -1, -0.3).normalize(), L: V(0.7, -1, -0.3).normalize() };
// 두 손으로 자루를 쥘 때는 팔꿈치를 옆으로 벌린다: 두 팔이 양옆에서 자루로 모여야 한 손이 반대편 팔을 뚫고 지나가지 않고,
// 아래팔이 자루와 나란해지지 않아 손목도 꺾이지 않는다
// 왼팔은 팔꿈치를 위로 치켜들지 않는다: 윗팔(어깨)을 아래로 내려 팔꿈치가 어깨보다 낮게, 몸 옆 아래에서 굽는다
// (아래로만 굽히면 팔꿈치가 옆구리에 박혀 다시 밀려나면서 손목이 틀어지므로, 아래이면서 바깥쪽으로 둔다)
// 두 팔 모두 팔꿈치를 손목보다 낮게 둔다: 팔꿈치가 높으면 아래팔이 손으로 내려꽂혀 손목이 위로(손등 쪽으로) 젖혀 보인다
// 왼팔(자루 끝을 쥔 팔)은 팔꿈치를 옆으로 벌리지 않고 가슴 앞 아래로 떨어뜨린다: 윗팔은 어깨에서 아래로 내려가고
// 아래팔이 거기서 손으로 올라가는 V자 모양. 팔을 수평으로 가로지르면 손목만 위로 꺾여 자루를 쥐게 된다
const GRIP_POLE = { R: V(-1, 0, 0.2).normalize(), L: V(0.12, -1, 0.2).normalize() };
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
function blendWorld(o, worldQ, w) {
  o.parent.getWorldQuaternion(qB).invert().multiply(worldQ);
  o.quaternion.slerp(qB, w);
  o.updateMatrixWorld(true);
}
function aimJoint(o, X, Y, Z, w) {
  blendWorld(o, qA.setFromRotationMatrix(m4.makeBasis(X, Y, Z)), w);
}
// 손(소켓)을 grip 위치·handQ 방향에 오도록 어깨·팔꿈치·손을 돌린다
// natural: 팔꿈치를 '손이 팔 쪽으로 뻗은 방향' 위에 놓는다 → 아래팔이 손과 한 줄이 되어 손목이 꺾이지 않는다.
// (손목을 돌려 맞추는 대신 어깨·팔꿈치 각도로 맞추는 것. 그 방향을 못 잡으면 pole 쪽으로 굽힌다)
function armIK(rig, s, grip, handQ, w, pole = POLE[s], natural = false) {
  const sh = rig[`shoulder${s}`], el = rig[`elbow${s}`], hand = rig[`hand${s}`];
  const sock = s === 'R' ? rig.rightSocket : rig.leftSocket;
  const S = sh.getWorldPosition(V());
  const E0 = el.getWorldPosition(V());
  const a = S.distanceTo(E0);
  const b = E0.distanceTo(hand.getWorldPosition(V()));
  // 손목 목표 = 쥘 곳에서 손 안의 소켓 오프셋만큼 되돌린 자리
  const ST = sock.position.clone().multiply(hand.getWorldScale(V())).applyQuaternion(handQ).negate().add(grip).sub(S);
  const d = THREE.MathUtils.clamp(ST.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  ST.normalize();
  const perp = pole.clone().applyQuaternion(sh.parent.getWorldQuaternion(qA));
  perp.addScaledVector(ST, -perp.dot(ST)).normalize();
  if (natural) {
    // 손목에서 손의 +Y(팔 쪽) 방향으로 아래팔 길이만큼 간 곳이 팔꿈치가 있으면 가장 좋은 자리
    const want = V(0, 1, 0).applyQuaternion(handQ).multiplyScalar(b).addScaledVector(ST, d);
    want.addScaledVector(ST, -want.dot(ST));
    // 몸 바깥쪽(pole)과 섞어, 팔꿈치가 몸 안쪽으로 접히는 자세는 피한다
    if (want.lengthSq() > 1e-6) perp.multiplyScalar(0.35).addScaledVector(want.normalize(), 1).normalize();
    // 팔꿈치를 위로 치켜들지는 않는다: 굽는 방향에서 위쪽 성분은 버린다 (어깨~손목을 잇는 선보다 위로 올라가지 않게)
    const upW = V(0, 1, 0).applyQuaternion(sh.parent.getWorldQuaternion(qA));
    const lift = perp.dot(upW);
    if (lift > 0) {
      perp.addScaledVector(upW, -lift * 1.15);
      perp.addScaledVector(ST, -perp.dot(ST));
      if (perp.lengthSq() < 1e-4) perp.copy(pole).applyQuaternion(sh.parent.getWorldQuaternion(qA)).addScaledVector(ST, -perp.dot(ST));
      perp.normalize();
    }
  }
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const u1 = ST.clone().multiplyScalar(cosA).addScaledVector(perp, sinA); // 어깨→팔꿈치
  const u2 = S.clone().addScaledVector(ST, d).sub(S.clone().addScaledVector(u1, a)).normalize(); // 팔꿈치→손목
  const Y1 = u1.negate();
  const Z1 = ST.multiplyScalar(sinA).addScaledVector(perp, -cosA); // 윗팔에 수직, 굽는 쪽
  const X = V().crossVectors(Y1, Z1);
  aimJoint(sh, X, Y1, Z1, w);
  const Y2 = u2.negate();
  aimJoint(el, X, Y2, V().crossVectors(X, Y2), w);
  blendWorld(hand, handQ, w);
}
// 도구 위의 검사 점(소켓 공간, 굵기 포함): 부품마다 가장 긴 축을 따라 5점. 도구를 처음 볼 때 한 번 잰다
function toolProbes(sock) {
  const tool = sock.children[0];
  if (!tool) return [];
  if (tool.userData.probes) return tool.userData.probes;
  sock.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(sock.matrixWorld).invert();
  const sc = sock.getWorldScale(V()).x;
  const out = [];
  tool.traverse((m) => {
    if (!m.isMesh || m.userData.isOutline || m.parent?.name === '찌') return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    const size = b.getSize(V());
    const c = b.getCenter(V());
    const ax = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    const [o1, o2] = ['x', 'y', 'z'].filter((a) => a !== ax);
    const rad = (Math.min(size[o1], size[o2]) / 2) * (m.getWorldScale(V()).x / sc);
    for (let n = 0; n <= 4; n++) {
      const p = c.clone();
      p[ax] = b.min[ax] + (size[ax] * n) / 4;
      out.push({ p: p.applyMatrix4(m.matrixWorld).applyMatrix4(inv), rad });
    }
  });
  return (tool.userData.probes = out);
}

// 도구를 몸 밖으로 (P = 쥔 곳, Q = 방향, fwd = 몸통이 바라보는 쪽):
//  - 손 가까운 점(주먹·자루 끝)이 박혔으면 도구째 '앞으로' 빼낸다. 가장 가까운 바깥쪽으로 밀면 몸 중심선 뒤에 있던 손은
//    등 뒤로 밀려나, 프레임에 따라 손이 몸 앞뒤를 오가며 튄다. 앞으로만 빼면 자세가 조금 바뀔 때 결과도 조금만 바뀐다.
//  - 손에서 먼 점(날·낚싯대 끝)이 박혔으면 쥔 곳을 축으로 도구를 돌려 뺀다.
const TOOL_MARGIN = 0.014; // 몸 부피는 옷 겉면보다 안쪽이라, 도구는 그만큼 더 띄운다
// 쥔 곳에서 이 거리 안이면 '손 가까운 점'(주먹과 그 바로 옆 자루). 이보다 먼 자루·머리 부분이 박히면 도구를 돌려 뺀다.
// (넓게 잡으면 머리 옆을 지나는 자루 때문에 두 손이 통째로 앞으로 밀려나 팔이 일자로 뻗는다)
const NEAR = 0.07;
// 손보다 뒤쪽(자루 끝, 소켓 -Z)은 멀어도 '손 가까운 점'으로 친다: 도구를 앞으로 뻗으면 자루 끝이 가슴 쪽을 향하는데,
// 이걸 돌려서 빼면 도구 머리가 아래로 처져 지팡이를 짚은 꼴이 된다. 자루 끝은 도구째 앞으로 밀어 뺀다
const isFar = (s) => !s.hand && s.p.z > 0 && s.p.length() > NEAR;
const hitT = { depth: 0, n: V() };
const rT = V(), pT = V(), bn = V();
const qT = new THREE.Quaternion();
function clearTool(colliders, probes, P, Q, scale, fwd, right) {
  // 1) 먼 점: 쥔 곳을 축으로 도구 끝을 '위→앞'으로 넘기며 처음 빠져나오는 각을 찾는다 (늘 같은 쪽으로 돌려야 튀지 않는다).
  //    머리가 커서 도끼·낚싯대를 어깨 너머로 젖히면 머리 속을 지나가므로, 젖힐 수 있는 데까지만 젖힌 자세가 된다
  const Q0 = qT.copy(Q);
  const blocked = (ang) => {
    Q.copy(Q0).premultiply(qR.setFromAxisAngle(right, ang));
    for (const s of probes) {
      if (!isFar(s)) continue;
      rT.copy(s.p).multiplyScalar(scale).applyQuaternion(Q);
      if (pointHit(colliders, pT.copy(P).add(rT), (s.rad + TOOL_MARGIN) * scale, hitT) > 0.0005 * scale) return true;
    }
    return false;
  };
  if (blocked(0)) {
    let lo = 0, hi = 0;
    for (let a = 0.12; a <= 2.8; a += 0.12) {
      if (!blocked(a)) { hi = a; break; }
      lo = a;
    }
    if (hi) {
      for (let n = 0; n < 6; n++) {
        const mid = (lo + hi) / 2;
        if (blocked(mid)) lo = mid; else hi = mid;
      }
    }
    Q.copy(Q0).premultiply(qR.setFromAxisAngle(right, hi));
  } else Q.copy(Q0);
  // 2) 손 가까운 점: 도구째 앞으로
  let shift = 0;
  for (const s of probes) {
    if (isFar(s)) continue;
    rT.copy(s.p).multiplyScalar(scale).applyQuaternion(Q).add(P);
    const rad = (s.rad + (s.hand ? 0 : TOOL_MARGIN)) * scale;
    if (pointHit(colliders, pT.copy(rT).addScaledVector(fwd, shift), rad, hitT) <= 0) continue;
    let lo = shift, hi = shift + 0.3 * scale;
    for (let n = 0; n < 9; n++) {
      const mid = (lo + hi) / 2;
      if (pointHit(colliders, pT.copy(rT).addScaledVector(fwd, mid), rad, hitT) > 0) lo = mid; else hi = mid;
    }
    shift = hi;
  }
  P.addScaledVector(fwd, shift);
}
const qR = new THREE.Quaternion();

const ARM_JOINTS = ['shoulderR', 'elbowR', 'handR', 'shoulderL', 'elbowL', 'handL'];
// 자루를 쥔 손의 방향: 도구 축(손의 +Z)은 그대로 두고, 손이 뻗은 쪽(손의 -Y)이 팔이 오는 방향과 가장 가깝도록
// 자루 둘레로 손을 돌린다 → 손목이 덜 꺾이고 주먹이 자루를 자연스럽게 감싼다
// side: 그 팔이 몸 바깥에서 안쪽으로 들어오는 방향. 어깨에서 곧장 오는 방향보다 이쪽을 더 따르게 해,
// 손이 자루 뒤(반대편 팔이 있는 자리)가 아니라 자기 쪽 옆에서 자루를 감싸게 한다
function gripQuat(axis, from, to, up, side) {
  const y = to.clone().sub(from).normalize().multiplyScalar(0.45).addScaledVector(side, 0.9);
  y.addScaledVector(axis, -y.dot(axis));
  if (y.lengthSq() < 1e-4) y.copy(up).addScaledVector(axis, -up.dot(axis));
  y.normalize().negate();
  return new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(V().crossVectors(y, axis), y, axis));
}

// 손목 펴기: 손이 뻗은 쪽(손의 -Y)과 아래팔 방향 f 사이가 max 보다 크게 꺾였으면, 넘친 만큼 손을 팔 쪽으로 되돌린다.
// 자루가 팔과 거의 나란할 때(내리친 직후 등) 주먹을 자루에 딱 맞추면 손목이 직각으로 꺾이므로,
// 주먹이 자루를 비스듬히 쥐는 것으로 나눠 갖는다 (도구 방향은 그대로: 오른손은 소켓을 반대로 돌려 맞춘다)
// 손목은 거의 꺾지 않는다: 주먹이 아래팔과 한 줄로 이어지고(위로도 아래로도 꺾이지 않음), 도구가 그 주먹을 비스듬히 지나간다.
// 손목을 꺾어 주먹을 자루에 직각으로 맞추면, 팔을 앞으로 뻗었을 때 손목이 봉긋 솟고 손이 자루를 위에서 누르는 꼴이 된다
const WRIST_MAX = 0.1;
function easeWrist(q, f, max = WRIST_MAX) {
  const down = V(0, -1, 0).applyQuaternion(q);
  const ang = down.angleTo(f);
  if (ang <= max) return q;
  const n = V().crossVectors(down, f);
  if (n.lengthSq() < 1e-8) return q;
  return q.premultiply(qR.setFromAxisAngle(n.normalize(), ang - max));
}

// dt: 밀어낸 정도를 프레임 사이에 부드럽게 잇는 데 쓴다
// aim: 액션이 직접 정한 쥘 자리와 도구 방향 { pos, dir } (몸통 기준). 없으면 오른팔 애니메이션이 정한 자세를 쓴다
function twoHandGrip(rig, y, w, dt, aim) {
  const torso = rig.shoulderL.parent;
  const sock = rig.rightSocket;
  const scale = rig.shoulderL.getWorldScale(V()).x;
  const T = torso.getWorldPosition(V());
  const torsoQ = torso.getWorldQuaternion(new THREE.Quaternion());
  // 애니메이션이 정한 도구 자세
  const Q0 = sock.getWorldQuaternion(new THREE.Quaternion());
  const P = sock.getWorldPosition(V());
  const P0 = P.clone();
  const L0 = rig.leftSocket.getWorldPosition(V());
  const handL0 = rig.handL.getWorldQuaternion(new THREE.Quaternion());
  const Q = Q0.clone();
  const grip2 = () => V(0, 0, y * scale).applyQuaternion(Q).add(P); // 왼손이 쥘 자리
  const SR = rig.shoulderR.getWorldPosition(V()), SL = rig.shoulderL.getWorldPosition(V());
  const up = V(0, 1, 0).applyQuaternion(torsoQ);
  // 각 팔이 자루로 들어오는 방향: 오른팔은 오른쪽에서 안쪽으로, 왼팔은 왼쪽 아래에서 안쪽 위로 (팔꿈치가 아래에 있으므로)
  const inward = { R: V(1, 0, 0).applyQuaternion(torsoQ), L: V(-1, 0.35, 0).normalize().applyQuaternion(torsoQ) };
  if (aim) {
    // 1') 액션이 정한 자리·방향 그대로 (몸통을 틀면 함께 돈다). 오른손도 팔이 오는 쪽에 맞춰 자루를 감싼다
    P.copy(torso.localToWorld(V(...aim.pos)));
    Q.copy(gripQuat(V(...aim.dir).normalize().applyQuaternion(torsoQ), SR, P, up, inward.R)).multiply(sock.quaternion);
  } else {
    // 1) 두 손 사이가 몸 한가운데 오도록 옆으로 옮긴다
    const mid = torso.worldToLocal(P.clone().add(grip2()).multiplyScalar(0.5));
    P.add(torso.localToWorld(V(-mid.x + 0.035, 0, 0)).sub(T)); // 한가운데보다 살짝 왼쪽: 도구를 쥔 오른팔이 가슴을 덜 가로지른다
  }
  // 2) 팔이 안 닿으면 가슴 앞으로 당긴다 (닿는 데까지만: 이분법으로 찾아 조금씩 변한다)
  const reach = 0.196 * scale;
  const far = (p0) => Math.max(SR.distanceTo(p0), SL.distanceTo(V(0, 0, y * scale).applyQuaternion(Q).add(p0))) - reach;
  if (far(P) > 0) {
    const chest = torso.localToWorld(V(0, rig.shoulderL.position.y - 0.04, 0.13));
    const pull = chest.sub(P.clone().add(grip2()).multiplyScalar(0.5));
    let lo = 0, hi = 1;
    for (let n = 0; n < 10; n++) {
      const f = (lo + hi) / 2;
      if (far(P.clone().addScaledVector(pull, f)) > 0) lo = f; else hi = f;
    }
    P.addScaledVector(pull, hi);
  }
  // 3) 도구와 두 주먹이 몸·머리에 박히면 밀어낸다. 밀어낸 양(몸통 기준)은 부드럽게 따라가게 해 프레임 사이에 튀지 않는다
  if (rig.colliders) {
    const tool = sock.children[0];
    const probes = (tool.userData.probes2 ??= [...toolProbes(sock).filter((q) => q.p.z > y - 0.005), { p: V(), rad: 0.03, hand: true }, { p: V(0, 0, y), rad: 0.03, hand: true }]);
    const P1 = P.clone();
    const Q1 = Q.clone();
    const fwd = V(0, 0, 1).applyQuaternion(torsoQ);
    clearTool(rig.toolColliders ?? rig.colliders, probes, P1, Q1, scale, fwd, V(1, 0, 0).applyQuaternion(torsoQ));
    // 도구는 안 박혀도 그 자리를 쥐려고 뻗은 아래팔이 가슴·배를 가로지를 수 있다: 쥐어 보고 박힌 만큼 도구를 더 민다
    const joints = ARM_JOINTS.map((k) => rig[k]);
    const saved = joints.map((j) => j.quaternion.clone());
    for (let it = 0; it < 6; it++) {
      const hq = Q1.clone().multiply(qA.copy(sock.quaternion).invert());
      armIK(rig, 'R', P1, hq, 1);
      armIK(rig, 'L', sock.localToWorld(V(0, 0, y)), hq, 1);
      const d = forearmHit(rig, bn);
      joints.forEach((j, n) => j.quaternion.copy(saved[n]));
      torso.updateMatrixWorld(true);
      if (d < 0.001 * scale) break;
      P1.addScaledVector(fwd, d * 1.05);
    }
    const inv = torsoQ.clone().invert();
    const dp = P1.sub(P).applyQuaternion(inv).divideScalar(scale);
    const dq = inv.clone().multiply(Q1.multiply(Q.clone().invert())).multiply(torsoQ);
    const st = (rig.toolFix ??= { dp: dp.clone(), dq: dq.clone() });
    // 더 밀어내야 할 때는 바로(박힌 채로 한두 장 지나가지 않게), 덜 밀어도 될 때는 천천히 돌아온다
    const more = dp.lengthSq() > st.dp.lengthSq() || Math.abs(dq.w) < Math.abs(st.dq.w);
    // (돌려 놓은 각은 빨리 푼다: 젖힐 때 머리를 피하느라 돌린 각이 타격 순간까지 남으면 몽둥이 끝이 아래로 끌려 처진다)
    const a = 1 - Math.exp(-(more ? 90 : 45) * dt);
    const aq = 1 - Math.exp(-(more ? 90 : 70) * dt);
    st.dp.lerp(dp, a);
    st.dq.slerp(dq, aq);
    P.add(st.dp.clone().multiplyScalar(scale).applyQuaternion(torsoQ));
    Q.premultiply(torsoQ.clone().multiply(st.dq).multiply(inv));
  }
  // 4) 두 팔을 뻗어 쥔다. 도구는 오른손에 붙어 있으므로 왼손은 오른손이 실제로 간 곳의 자루를 쥔다
  // 쥐는 중·놓는 중(w < 1)에는 관절 각도를 섞지 않고 '손이 갈 자리'를 섞는다: 애니메이션만의 손 자리 → 쥘 자리.
  // (각도를 섞으면 두 자세가 많이 다를 때 중간에서 팔이 휙 뒤집히며 손이 튄다)
  const wq = Math.min(1, w * 5); // 팔꿈치 방향만 처음에 잠깐 섞어 준다
  const Qw = Q0.clone().slerp(Q, w);
  // 쥐러 가는 길·놓고 돌아오는 길은 몸 앞으로 둥글게 돌아간다: 옆구리 옆의 손과 가슴 앞의 쥘 자리를 곧장 이으면 손이 배를 뚫고 지나간다
  const arc = V(0, 0, 1).applyQuaternion(torsoQ).multiplyScalar(0.07 * scale * Math.sin(Math.PI * w));
  const Pw = P0.lerp(P, w).add(arc);
  // 손목 펴기: 일단 쥐어 보고, 실제 아래팔(팔꿈치→손목) 방향에 견줘 손목이 한계보다 꺾였으면 주먹을 팔 쪽으로 되돌려 다시 쥔다.
  // 쥐기가 풀려 갈수록(w → 0) 한계를 풀어, 애니메이션 자세로 넘어갈 때 손이 튀지 않게 한다
  const limit = WRIST_MAX + (1 - w) * 0.4;
  // aim.pole: 액션이 팔꿈치가 향할 쪽을 바꿀 수 있다 (몸통 기준). 없으면 기본 방향
  const pole = (s) => (aim?.pole?.[s] ? V(...aim.pole[s]).normalize() : GRIP_POLE[s]);
  const hold = (s, target, hq) => {
    armIK(rig, s, target, hq, wq, pole(s));
    // 주먹을 되돌리면 손목 자리가 조금 옮겨져 아래팔 방향도 달라지므로 몇 번 되풀이해 맞춘다
    for (let n = 0; n < 3; n++) {
      const f = rig[`hand${s}`].getWorldPosition(V()).sub(rig[`elbow${s}`].getWorldPosition(V())).normalize();
      const w0 = hq.w, x0 = hq.x;
      easeWrist(hq, f, limit);
      if (hq.w === w0 && hq.x === x0) break;
      armIK(rig, s, target, hq, 1, pole(s));
    }
    return hq;
  };
  // 오른손: 주먹을 되돌린 만큼 소켓을 반대로 돌려 도구 방향은 지킨다
  const handQ = hold('R', Pw, Qw.clone().multiply(qA.copy(sock.quaternion).invert()));
  sock.quaternion.copy(handQ).invert().multiply(Qw);
  sock.updateMatrixWorld(true);
  // 왼손은 오른손 방향을 그대로 베끼지 않고, 왼팔이 오는 쪽에 맞춰 자루를 감싼다
  const gL = sock.localToWorld(V(0, 0, y));
  hold('L', L0.lerp(gL, w).addScaledVector(arc, 1 - w), handL0.slerp(gripQuat(V(0, 0, 1).applyQuaternion(sock.getWorldQuaternion(qA)), SL, gL, up, inward.L), w));
}

// ── 한 손 쥐기: 한손검처럼 오른손 하나로 휘두르는 동작 ──
// aim: { pos, dir, pole, wrist } 오른손이 쥘 자리, 칼이 뻗는 방향, 팔꿈치가 굽는 쪽 (몸통 기준), 손목을 꺾는 한계(없으면 WRIST_BEND). 왼손은 건드리지 않는다 (동작이 관절 값으로 정한다)
// w: 0 → 1 로 애니메이션 자세에서 쥘 자리로 섞는 비율. 손 자리를 섞어야 두 자세가 많이 달라도 팔이 휙 뒤집히지 않는다
// 주먹과 칼 사이 각도는 평소 들고 다닐 때(소켓의 carry 각) 그대로 둔다: 칼이 손 안에서 돌지 않고, 칼을 겨누는 방향은 손목을 꺾어 맞춘다.
// (주먹을 아래팔과 한 줄로 펴고 칼만 손 안에서 돌려 맞추면, 칼이 주먹을 가로지르지 않고 손끝에서 뻗어 나온 것처럼 보인다)
// 그래서 찌르기처럼 아래팔과 칼이 같은 쪽을 향하면 손목이 새끼손가락 쪽으로 크게 꺾인다
const WRIST_BEND = 1.3; // 이보다 더 꺾어야 하면 넘친 만큼만 주먹을 팔 쪽으로 되돌린다 (칼끝도 그만큼 덜 겨눠진다)
function oneHandGrip(rig, w, aim) {
  const torso = rig.shoulderR.parent;
  const sock = rig.rightSocket;
  // tilt: 손 안의 칼 각도를 평소 들고 다니는 각도에서 이만큼 더 앞으로 기울여 쥔다 (찌르기: 손목을 덜 꺾고 칼을 앞으로 겨누게)
  if (aim.tilt) { sock.rotation.x += aim.tilt * w; sock.updateMatrixWorld(true); }
  const torsoQ = torso.getWorldQuaternion(new THREE.Quaternion());
  const SR = rig.shoulderR.getWorldPosition(V());
  // body: 방향들이 몸통이 아니라 몸이 서 있는 방향(골반 위 root, 허리를 틀거나 숙이기 전) 기준이고, 손 자리는 지금 어깨에서 뻗은 벡터(arm)
  const frameQ = aim.body ? rig.pelvis.parent.getWorldQuaternion(new THREE.Quaternion()) : torsoQ;
  const P = aim.body
    ? V(...aim.arm).multiplyScalar(torso.getWorldScale(V()).x).applyQuaternion(frameQ).add(SR)
    : torso.localToWorld(V(...aim.pos));
  // level: 쥔 자리의 높이를 몸 기준(발밑 root)으로 고정한다. 상체를 숙여 어깨가 내려가도 손은 같은 높이로 곧게 나간다 (찌르기)
  if (aim.level != null) {
    const root = rig.pelvis.parent;
    const L = root.worldToLocal(P.clone());
    L.y += (aim.level - L.y) * (aim.levelW ?? 1);
    P.copy(root.localToWorld(L));
  }
  const up = V(0, 1, 0).applyQuaternion(torsoQ);
  // 칼(소켓)의 월드 회전 → 손 안의 칼 각도를 빼면 그 칼을 쥔 주먹의 회전
  // 칼 둘레로 주먹을 돌리는 각: 손가락 쪽이 어깨→손 방향(팔이 뻗은 쪽)에 가장 가깝게 → 손목이 가장 덜 꺾인다
  // 팔꿈치 방향을 정해 둔 동작(fixPole)은 실제 아래팔이 들어오는 쪽(그쪽으로 벌린 팔꿈치 → 손)에 맞춰 주먹을 돌린다
  const poleW = !aim.pole ? POLE.R.clone().applyQuaternion(torsoQ)
    : V(...aim.pole).normalize().applyQuaternion(aim.body ? frameQ : torsoQ);
  const from = aim.fixPole ? SR.clone().addScaledVector(poleW, 0.09 * torso.getWorldScale(V()).x) : SR;
  const axisW = V(...aim.dir).normalize().applyQuaternion(frameQ);
  const inHand = sock.quaternion.clone().invert(); // 손 안의 칼 각도를 빼는 회전
  // roll: 주먹(손가락 쪽)이 향할 쪽을 동작이 정한다 (몸 기준). 칼 둘레로 주먹을 그쪽으로 돌린다 → 손목이 그쪽으로 꺾인다
  const rollW = aim.roll ? V(...aim.roll).normalize().applyQuaternion(frameQ) : null;
  const fist = (rollW ? gripQuat(axisW, P, P, up, rollW) : gripQuat(axisW, from, P, up, V())).multiply(inHand);
  const P0 = sock.getWorldPosition(V());
  const Q0 = rig.handR.getWorldQuaternion(new THREE.Quaternion());
  const Pw = P0.lerp(P, w);
  const hq = Q0.clone().slerp(fist, w);
  const wq = Math.min(1, w * 5);
  // 팔꿈치가 굽는 쪽: 동작이 정한 방향(aim.pole)을 바탕으로, 손목이 손등·손바닥 쪽으로 꺾이지 않는 자리를 고른다 (elbowPole)
  // armIK 는 팔꿈치 방향을 몸통 기준으로 받는다
  // fixPole: 팔꿈치를 동작이 정한 쪽에 그대로 둔다 (찌르기: 팔꿈치를 바깥으로 벌려야 칼끝이 수평으로 선다)
  let poleUse = poleW;
  if (aim.fixPole) {
    // 정해 둔 굽는 쪽을 앞 장면 자리로 기억해 둔다: 다음 동작에서 팔꿈치 자리를 고를 때 여기서 이어지게 (한 장면 만에 튀지 않게)
    const ax = Pw.clone().sub(SR).normalize();
    rig.elbowPrev = poleW.clone().addScaledVector(ax, -poleW.dot(ax)).normalize();
  } else poleUse = elbowPole(rig, Pw, hq, poleW);
  const pole = poleUse.clone().applyQuaternion(torsoQ.clone().invert());
  armIK(rig, 'R', Pw, hq, wq, pole);
  if (aim.fixPole && !rollW) {
    // 팔을 뻗어 본 뒤 실제 아래팔(팔꿈치 → 손목) 방향에 맞춰 주먹을 칼 둘레로 다시 돌리고 다시 뻗는다:
    // 짐작한 팔꿈치 자리로 돌린 주먹은 실제 아래팔과 어긋나, 손목이 필요 이상 꺾여 한계에 걸리고 칼끝이 비껴난다
    for (let n = 0; n < 2; n++) {
      const E = rig.elbowR.getWorldPosition(V());
      const Wp = rig.handR.getWorldPosition(V());
      hq.copy(Q0).slerp(gripQuat(axisW, E, Wp, up, V()).multiply(inHand), w);
      armIK(rig, 'R', Pw, hq, wq, pole);
    }
  }
  // 손목 한계: 아래팔에 견줘 손목이 한계보다 꺾였으면 넘친 만큼만 주먹을 팔 쪽으로 되돌리고 다시 뻗는다.
  // 되풀이할 때마다 원래 쥐려던 주먹(want)에서 새로 계산한다: 돌린 각을 쌓아 가면, 다시 뻗어 여유가 생겨도 주먹이 돌아오지 않아 칼끝이 비껴난다
  const want = hq.clone();
  const limit = (aim.wrist ?? WRIST_BEND) + (1 - w) * 0.4; // aim.wrist: 동작이 정한 손목 한계 (찌르기는 더 꺾는다)
  for (let n = 0; n < 3; n++) {
    const f = rig.handR.getWorldPosition(V()).sub(rig.elbowR.getWorldPosition(V())).normalize();
    const next = easeWrist(want.clone(), f, limit);
    if (next.angleTo(hq) < 1e-4) break;
    hq.copy(next);
    armIK(rig, 'R', Pw, hq, 1, pole);
  }
  rig.oneFist = hq.clone();
}

// 한 손 쥐기의 팔꿈치 자리 고르기: 어깨와 손목 자리가 정해지면 팔꿈치는 둘을 잇는 축 둘레의 원 위 어디든 놓일 수 있다.
// 그중 아래팔이 주먹의 손등·손바닥 방향(손의 X축)으로 비껴 들어오지 않는 자리를 고른다 → 손목은 엄지·새끼 쪽으로만 꺾이고
// 손등 쪽으로 젖혀지거나 손바닥 쪽으로 접히지 않는다. 동작이 정한 굽는 쪽(poleW)과 앞 장면의 자리에서 크게 벗어나지 않게 해
// 팔꿈치가 한 장면 만에 뒤집히지 않게 하고, 팔꿈치를 위로 치켜드는 자리는 피한다. 돌려주는 값은 그 굽는 쪽(월드, 축에 수직)
const ELBOW_STEPS = 48;
function elbowPole(rig, grip, hq, poleW) {
  const S = rig.shoulderR.getWorldPosition(V());
  const E0 = rig.elbowR.getWorldPosition(V());
  const a = S.distanceTo(E0);
  const b = E0.distanceTo(rig.handR.getWorldPosition(V()));
  // 손목 자리 = 쥘 곳에서 손 안의 소켓 오프셋만큼 되돌린 곳 (armIK 와 같은 계산)
  const W = rig.rightSocket.position.clone().multiply(rig.handR.getWorldScale(V())).applyQuaternion(hq).negate().add(grip);
  const ax = W.clone().sub(S);
  const d = THREE.MathUtils.clamp(ax.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  ax.normalize();
  const x = (a * a - b * b + d * d) / (2 * d);
  const rho = Math.sqrt(Math.max(0, a * a - x * x));
  const C = S.clone().addScaledVector(ax, x);
  const u = poleW.clone().addScaledVector(ax, -poleW.dot(ax));
  if (u.lengthSq() < 1e-6) u.set(0, -1, 0).addScaledVector(ax, ax.y);
  u.normalize();
  const v = V().crossVectors(ax, u);
  const hx = V(1, 0, 0).applyQuaternion(hq);
  const hd = V(0, -1, 0).applyQuaternion(hq);
  const up = V(0, 1, 0).applyQuaternion(rig.shoulderR.parent.getWorldQuaternion(new THREE.Quaternion()));
  const prev = rig.elbowPrev;
  let best = null, bestCost = Infinity;
  const p = V(), E = V(), f = V();
  for (let i = 0; i < ELBOW_STEPS; i++) {
    const t = (i / ELBOW_STEPS) * Math.PI * 2;
    p.copy(u).multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t));
    E.copy(C).addScaledVector(p, rho);
    f.copy(W).sub(E).normalize();
    const side = f.dot(hx); // 손등·손바닥 쪽으로 비껴 들어오는 정도
    let cost = side * side * 4 + (1 - f.dot(hd)) * 0.3 + (1 - Math.cos(t)) * 0.35;
    if (prev) cost += (1 - p.dot(prev)) * 0.6;
    const lift = p.dot(up) - 0.3;
    if (lift > 0) cost += lift * 2;
    if (cost < bestCost) { bestCost = cost; best = p.clone(); }
  }
  rig.elbowPrev = best;
  return best;
}

// 몸 충돌 보정(collision.js)이 팔꿈치를 비튼 뒤에 한 번 더 손목을 편다: 팔꿈치만 옮겨지면 손은 그대로라 손목이 다시 꺾인다.
// 오른손은 돌린 만큼 소켓을 반대로 돌려 도구 방향을 지킨다
export function straightenWrists(rig) {
  // 한 손 쥐기: 충돌 보정이 팔꿈치를 비틀면 거기 매달린 주먹도 같이 돌아 칼끝이 비껴나므로, 쥔 주먹 방향을 되돌려 놓는다
  if (rig.oneFist && (rig.oneHandW ?? 0) > 0.001) blendWorld(rig.handR, rig.oneFist, 1);
  const w = rig.twoHandW ?? 0;
  if (w < 0.001) return;
  const limit = WRIST_MAX + (1 - w) * 0.4;
  for (const s of ['R', 'L']) {
    const hand = rig[`hand${s}`];
    const f = hand.getWorldPosition(V()).sub(rig[`elbow${s}`].getWorldPosition(V())).normalize();
    const q = hand.getWorldQuaternion(new THREE.Quaternion());
    const w0 = q.w, x0 = q.x;
    easeWrist(q, f, limit);
    if (q.w === w0 && q.x === x0) continue;
    const sock = s === 'R' ? rig.rightSocket : null;
    const toolQ = sock?.getWorldQuaternion(new THREE.Quaternion());
    blendWorld(hand, q, 1);
    if (sock) { sock.quaternion.copy(q.invert().multiply(toolQ)); sock.updateMatrixWorld(true); }
  }
}

// ── 활 당기기 IK ──
// 조준선: 쏘는 쪽(몸의 앞, root +Z)으로 곧게 뻗은 선. 몸을 옆으로 돌린 자세에서 가슴 앞·턱 밑 높이를 지난다.
// 왼손은 그 선 위 팔이 닿는 곳에서 활을 쥐고(시위가 나를 향하게, 윗날은 얼굴 반대쪽으로 눕혀 머리를 피함),
// 오른손은 같은 선 위에서 시위를 활 쪽부터 뒤로 당긴다 → 메긴 화살이 조준하는 쪽을 곧게 가리킨다
const BOW = {
  height: 0.4, // 조준선 높이 (주민 크기 단위, 발바닥 기준): 어깨(0.46)보다 조금 아래, 턱(0.51) 밑
  front: 0.1, // 조준선을 몸통 가운데 줄에서 가슴 앞쪽으로 비키는 거리 (화살이 가슴을 뚫지 않게)
  nock: 0.03, // 당기기 전 오른손이 활에서 떨어진 거리
  pull: 0.24, // 다 당겼을 때 더 뒤로 간 거리 (화살 길이 0.33 안쪽)
  cant: 0.7, // 활 윗날을 얼굴 반대쪽으로 눕히는 각 (라디안)
  lean: 0.3, // 윗날을 앞으로 숙이는 정도
};
function bowDraw(rig, root, wL, wR, draw) {
  const sc = rig.shoulderL.getWorldScale(V()).x;
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const D = V(0, 0, 1).applyQuaternion(rootQ); // 쏘는 쪽
  const up = V(0, 1, 0);
  const left = V().crossVectors(up, D); // 쏘는 쪽에서 본 왼쪽
  const torsoQ = rig.shoulderL.parent.getWorldQuaternion(new THREE.Quaternion());
  const chest = V(0, 0, 1).applyQuaternion(torsoQ); // 몸통 앞 (옆으로 돌아 오른쪽을 본다)
  chest.addScaledVector(D, -chest.dot(D)).addScaledVector(up, -chest.y);
  if (chest.lengthSq() < 1e-6) chest.copy(left).negate();
  chest.normalize();
  const toTorso = torsoQ.clone().invert();
  // 조준선 위 한 점: 발바닥 기준 높이, 몸 가운데에서 가슴 앞쪽으로
  const base = root.getWorldPosition(V());
  const SL = rig.shoulderL.getWorldPosition(V());
  const line0 = base.clone().addScaledVector(up, BOW.height * sc).addScaledVector(chest, BOW.front * sc);
  const onLine = (t) => line0.clone().addScaledVector(D, t);
  // 왼손 회전: 활 소켓 축이 +Z = 활 윗날 방향, +Y = 시위 쪽(나를 향함)이 되게
  const U = up.clone().multiplyScalar(Math.cos(BOW.cant)).addScaledVector(chest, Math.sin(BOW.cant)).addScaledVector(D, BOW.lean).normalize();
  const S = D.clone().negate();
  const Ux = U.clone().addScaledVector(S, -U.dot(S)).normalize();
  const sockQ = new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(V().crossVectors(S, Ux), S, Ux));
  // 왼손: 활을 쥔 팔을 쫙 편다. 손목(팔 끝)이 어깨에서 팔 길이만큼 떨어지도록 조준선 위 쥘 자리(G)를 고른다
  // (G 는 주먹 가운데라 손목보다 소켓 오프셋만큼 앞에 있다: 그만큼 빼고 잰다)
  // 주먹은 아래팔과 한 줄로 둔다 (손목을 꺾지 않음): 팔이 뻗은 쪽이 손의 -Y, 활 윗날 쪽이 손의 +Z.
  // 주먹 방향이 정해지면 소켓 오프셋이 바뀌어 쥘 자리도 조금 옮겨지므로 두 번 되풀이한다
  const reach = (SL.distanceTo(rig.elbowL.getWorldPosition(V())) + rig.elbowL.getWorldPosition(V()).distanceTo(rig.handL.getWorldPosition(V()))) * 0.999;
  let handQL = sockQ.clone().multiply(rig.leftSocket.quaternion.clone().invert());
  let G = null;
  for (let n = 0; n < 3; n++) {
    const off = rig.leftSocket.position.clone().multiply(rig.handL.getWorldScale(V())).applyQuaternion(handQL);
    const P0 = line0.clone().sub(off).sub(SL); // |P0 + D·t| = reach 를 푼다 (앞쪽 근)
    const pd = P0.dot(D);
    const t = -pd + Math.sqrt(Math.max(0, pd * pd - P0.lengthSq() + reach * reach));
    G = onLine(t);
    if (n === 2) break;
    const Y = G.clone().sub(off).sub(SL).normalize().negate(); // 손의 +Y = 팔꿈치 쪽
    const Z = U.clone().addScaledVector(Y, -U.dot(Y)).normalize();
    handQL = new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(V().crossVectors(Y, Z), Y, Z));
  }
  if (wL > 0.001) {
    const pole = up.clone().negate().addScaledVector(left, 0.4).normalize().applyQuaternion(toTorso); // 팔꿈치 안쪽은 아래로
    armIK(rig, 'L', G, handQL, wL, pole);
    // 활은 조준선에 맞춘 방향 그대로: 손 안에서 소켓을 돌려 맞춘다
    const want = rig.handL.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(sockQ);
    rig.leftSocket.quaternion.slerp(want, wL);
    rig.leftSocket.updateMatrixWorld(true);
  }
  if (wR > 0.001) {
    // 오른손: 손가락(손의 -Y)이 쏘는 쪽을 향해 시위를 건다. 팔꿈치는 뒤로, 어깨 높이로 당긴다
    const N = G.clone().addScaledVector(D, -(BOW.nock + BOW.pull * draw) * sc);
    const Y = D.clone().negate();
    const Z = up.clone().addScaledVector(Y, -up.dot(Y)).normalize();
    const handQ = new THREE.Quaternion().setFromRotationMatrix(m4.makeBasis(V().crossVectors(Y, Z), Y, Z));
    const pole = D.clone().negate().addScaledVector(up, 0.2).addScaledVector(chest, -0.3).normalize().applyQuaternion(toTorso);
    armIK(rig, 'R', N, handQ, wR, pole);
  }
}

// 활시위 튕김: 놓은 뒤 시위 가운데가 앞뒤로 떠는 폭(활 크기 단위)·1초에 떠는 횟수·잦아드는 빠르기·떠는 시간(초)
const STRING = { amp: 0.04, hz: 11, decay: 6, time: 0.7 };

// 매 프레임: 낚싯줄·찌, 활시위·화살, 지팡이 빛 (fx는 액션이 내놓은 연출 값)
const v1 = V();
const v2 = V();
const CARRY_OUT = 0.75; // 손목을 세운 각도에 곱해 바깥으로 돌리는 비율
export function updateEquipment(rig, root, fx, t, dt, { equipment, action, arrows }) {
  // 화살통: 남은 화살만큼 보인다 (활에 메긴 한 발은 통에서 꺼낸 것). arrows 를 모르면(쇼룸) 가득
  if (rig.quiver) {
    const n = Math.min(QUIVER_SHOW, Math.max(0, (arrows ?? QUIVER_SHOW) - (fx.arrow ? 1 : 0)));
    rig.quiver.arrows.forEach((a, i) => { a.visible = i < n; });
  }
  // 들고 다니는 자세: 소켓 자체를 부드럽게 기울임 (액션 관절값과 따로 움직임)
  // 두 손으로 쥔 손이 다 풀린 뒤에 손목을 세운다 (풀리는 도중에 세우면 도구가 휙 돌아 손이 튄다)
  const carry = (CARRY_ACTIONS.has(action) || fx.carry) && !((rig.twoHandW ?? 0) > 0.4) ? EQUIPMENT[equipment]?.carry ?? [0, 0] : [0, 0];
  const k = 1 - Math.exp(-10 * dt);
  // (소켓 회전은 매 프레임 '든 각도'에서 새로 시작한다: 두 손 쥐기가 손목을 펴 주느라 소켓을 더 돌려 놓기 때문)
  const cx = (rig.carryX ??= [0, 0]);
  cx[0] += (carry[0] - cx[0]) * k;
  cx[1] += (carry[1] - cx[1]) * k;
  // 세운 만큼 도구 머리를 몸 바깥쪽으로도 눕힌다 (얼굴 쪽으로 기울지 않게)
  rig.rightSocket.rotation.set(cx[0], cx[0] * CARRY_OUT, 0);
  rig.leftSocket.rotation.set(cx[1], -cx[1] * CARRY_OUT, 0);
  // 왼손 회전을 직접 정한 장비 (활): 세 축을 따로 부드럽게 옮긴다
  const wantL = (CARRY_ACTIONS.has(action) || fx.carry) ? EQUIPMENT[equipment]?.carryL ?? [0, 0, 0] : [0, 0, 0];
  const cl = (rig.carryL ??= [0, 0, 0]);
  for (let i = 0; i < 3; i++) cl[i] += (wantL[i] - cl[i]) * k;
  if (cl.some((v) => Math.abs(v) > 1e-4)) rig.leftSocket.rotation.set(rig.leftSocket.rotation.x + cl[0], cl[1], cl[2]);
  root.updateMatrixWorld(true);
  const grip = EQUIPMENT[equipment]?.twoHand;
  // 쥘 때는 빠르게(0.15초쯤), 놓을 때는 느긋하게
  const want = fx.twoHand && grip != null ? 1 : 0;
  if (want) rig.twoHandW = rig.twoHandW1 = (rig.twoHandW ?? 0) + (1 - (rig.twoHandW ?? 0)) * (1 - Math.exp(-22 * dt));
  else {
    // 놓을 때는 두 번 걸러 S자로 풀린다: 한 번만 거르면 놓는 첫 순간에 가장 빨리 움직여 툭 끊기는 느낌이 난다
    const kr = 1 - Math.exp(-16 * dt);
    rig.twoHandW1 = (rig.twoHandW1 ?? 0) * (1 - kr);
    rig.twoHandW = (rig.twoHandW ?? 0) + (rig.twoHandW1 - (rig.twoHandW ?? 0)) * kr;
  }
  // 놓는 동안에도 마지막으로 쥐던 자리를 기준으로 삼는다: 놓는 순간 기준이 오른팔 애니메이션 자세로 바뀌면 도구가 한 장 만에 휙 돈다
  if (fx.grip) rig.lastAim = fx.grip;
  else if (fx.twoHand) rig.lastAim = null; // 자리를 직접 정하지 않는 다른 두 손 동작이 시작되면 잊는다
  if (grip != null && rig.twoHandW > 0.001) twoHandGrip(rig, grip, rig.twoHandW, dt, rig.lastAim ?? null);
  else { rig.toolFix = null; rig.lastAim = null; } // 두 손 쥐기가 끝나면 밀어낸 기록을 지운다
  // 한 손 쥐기 (한손검): 쥘 때는 빠르게, 놓을 때는 조금 느긋하게. 놓는 동안에는 마지막 자리를 기준으로 삼는다
  if (fx.oneHand) rig.oneAim = fx.oneHand;
  const w1 = fx.oneHand ? 1 : 0;
  rig.oneHandW = (rig.oneHandW ?? 0) + (w1 - (rig.oneHandW ?? 0)) * (1 - Math.exp(-(w1 ? 40 : 14) * dt));
  if (rig.oneAim && rig.oneHandW > 0.001) oneHandGrip(rig, rig.oneHandW, rig.oneAim);
  else { rig.oneAim = null; rig.elbowPrev = null; rig.oneFist = null; }
  // 활 당기기: 두 팔을 조준선 위에 놓는다 (시위·화살은 아래에서 오른손을 따라간다)
  if ((fx.bowL ?? 0) > 0.001 || (fx.bowR ?? 0) > 0.001) bowDraw(rig, root, fx.bowL ?? 0, fx.bowR ?? 0, fx.draw ?? 0);
  for (const sock of [rig.rightSocket, rig.leftSocket]) {
    sock.traverse((o) => {
      const { rod, bow: b, staff: st } = o.userData;
      if (rod) {
        // 찌: 평소엔 낚싯대 끝에 매달리고, 던지면 캐릭터 앞 바닥(물)에 떠서 까딱임
        const tipW = rod.tip.getWorldPosition(v1);
        const goal = fx.bobber === 'water'
          ? root.localToWorld(v2.set(0.05, 0.016 + Math.sin(t * 3) * 0.005 * (1 - (fx.dip ?? 0)) - (fx.dip ?? 0) * 0.04, 0.95)) // dip: 물고기가 건드리면 까딱, 물면 쏙
          : v2.copy(tipW).add(V(0, -0.13, 0));
        if (!rod.bobW) rod.bobW = goal.clone();
        rod.bobW.lerp(goal, 1 - Math.exp(-(fx.dip ? 25 : 7) * dt)); // 잠길 때는 재빨리
        rod.bobber.position.copy(o.worldToLocal(rod.bobW.clone()));
        setLine(rod.line, [rod.tip.position, rod.bobber.position]);
      }
      if (b) {
        // 시위: 당기는 동안 오른손을 따라가고, 놓으면 빠르게 제자리로 돌아오며 앞뒤로 부르르 떨다 잦아든다
        // base: 떨림을 뺀 시위 가운데 자리, twang: 놓은 뒤 흐른 초 (-1 이면 떨지 않음)
        b.base ??= b.rest.clone();
        b.twang ??= -1;
        if (fx.nock) {
          b.base.lerp(o.worldToLocal(rig.rightSocket.getWorldPosition(v1)), 1 - Math.exp(-30 * dt));
          b.pulled = true;
          b.twang = -1;
        } else {
          if (b.pulled) { b.pulled = false; b.twang = 0; } // 방금 놓았다
          b.base.lerp(b.rest, 1 - Math.exp(-45 * dt));
          if (b.twang >= 0) b.twang = b.twang + dt > STRING.time ? -1 : b.twang + dt;
        }
        b.nock.copy(b.base);
        if (b.twang >= 0) b.nock.z += STRING.amp * Math.exp(-STRING.decay * b.twang) * Math.sin(PI * 2 * STRING.hz * b.twang); // 활 앞뒤(시위가 오가는 쪽)로
        setLine(b.string, [b.top, b.nock, b.bottom]);
        b.arrow.visible = !!fx.arrow;
        if (fx.arrow) {
          b.arrow.position.copy(b.nock);
          b.arrow.lookAt(o.localToWorld(v2.set(0, 0, 0)));
        }
      }
      if (st) {
        const glow = fx.glow ?? 0;
        st.crystal.material.emissiveIntensity = 0.5 + glow * 2.2;
        st.light.intensity = glow * 0.08; // 얼굴 가까이 오므로 아주 약하게
        st.crystal.rotation.y = t * 1.5;
      }
    });
  }
}
